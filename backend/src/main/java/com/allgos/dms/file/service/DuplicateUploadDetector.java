package com.allgos.dms.file.service;

import com.allgos.dms.common.config.AppProperties;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.notification.entity.NotificationType;
import com.allgos.dms.notification.service.NotificationService;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Tells the administrators when the same document has been filed twice.
 *
 * <h2>What counts as the same document</h2>
 *
 * <p>Two things are compared, in this order, and the first one that matches is what gets reported:
 *
 * <ol>
 *   <li><b>The G.O. number.</b> Conclusive. It is printed on the order itself, so two documents
 *       carrying one number are one order however differently the two files are named — which is the
 *       usual case, since the file name is whatever the scanner produced.
 *   <li><b>The file name.</b> Suggestive, not conclusive. Somebody re-uploading a document they
 *       already filed generally uploads the same file, under the same name; but scanners also hand
 *       out "scan0001.pdf" by the hundred, and two unrelated orders sharing that name are a
 *       coincidence. So a name match is only reported where the two G.O. numbers do not actively
 *       contradict it — see {@link StoredFileRepository#findEarliestLiveWithNormalisedFileName} —
 *       and the notification says which of the two matched, so an administrator knows how much
 *       weight to put on it.
 * </ol>
 *
 * <p>The name check is what makes this work at all for a photograph, a spreadsheet or a Word
 * document: nothing but a PDF carries a G.O. number the extractor can read, so for everything else
 * the name is the only evidence there is.
 *
 * <h2>Why it is a notification and not a refusal</h2>
 *
 * <p>The upload is allowed to succeed. A second copy is often deliberate — the same order filed
 * under Revenue and under Health because both departments act on it — and the system is in no
 * position to tell that apart from a mistake. Refusing would also mean refusing at the wrong moment:
 * the G.O. number is read out of the document <em>after</em> the upload has been answered (see
 * {@link DocumentEnrichmentService}), so by the time this can run, the uploader has been told their
 * document is filed and has moved on. What an administrator needs is to be told, with both copies
 * named and located, so they can merge, remove or leave them as they see fit.
 */
@Service
public class DuplicateUploadDetector {

    private static final Logger log = LoggerFactory.getLogger(DuplicateUploadDetector.class);

    /** "29 Aug 2026, 4:12 pm" — the office's clock, not the server's. */
    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("d MMM yyyy, h:mm a", Locale.ENGLISH);

    private final StoredFileRepository fileRepository;
    private final NotificationService notificationService;
    private final ZoneId zone;

    public DuplicateUploadDetector(
            StoredFileRepository fileRepository,
            NotificationService notificationService,
            AppProperties properties) {
        this.fileRepository = fileRepository;
        this.notificationService = notificationService;
        this.zone = ZoneId.of(properties.timezone());
    }

    /**
     * Checks one just-filed document against everything already filed, and notifies every admin if
     * it is a copy of something.
     *
     * <p>Read-write rather than {@code readOnly}, though it only reads files: the notification rows
     * it writes go through {@link NotificationService}, which would join this transaction and then
     * never flush under a read-only one.
     *
     * <p>{@code REQUIRES_NEW} for the same reason the rest of the upload path uses it — this runs
     * behind {@link DocumentEnrichmentService} on a pool thread, and must neither see nor affect
     * whatever transaction that call arrived on.
     *
     * <p>Failures are logged and swallowed. The documents are filed either way; a notification that
     * could not be written is a report nobody got, not a reason to fail an upload that already
     * succeeded.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void check(UUID fileId) {
        try {
            fileRepository.findByIdAndDeletedFalse(fileId).ifPresent(this::compare);
        } catch (RuntimeException ex) {
            log.error("Duplicate check for file {} failed", fileId, ex);
        }
    }

    private void compare(StoredFile subject) {
        String goNumber = normaliseGoNumber(subject.getGoNumber());
        String id = subject.getId().toString();

        // The G.O. number first, because a match on it is the answer and makes the weaker question
        // not worth asking.
        Optional<StoredFile> match = goNumber == null
                ? Optional.empty()
                : fileRepository.findEarliestLiveWithNormalisedGoNumber(goNumber, id);
        Basis basis = Basis.GO_NUMBER;

        if (match.isEmpty()) {
            String name = normaliseFileName(subject.getFileName());
            match = name == null
                    ? Optional.empty()
                    : fileRepository.findEarliestLiveWithNormalisedFileName(name, goNumber, id);
            basis = Basis.FILE_NAME;
        }

        if (match.isEmpty()) {
            return;
        }

        StoredFile other = match.get();
        // The queries order oldest-first, so what comes back is normally the copy that was already
        // there. Not always, though: the G.O. number is read out of each document on a pool thread,
        // and two documents filed together can be read in either order, so the one being checked may
        // itself be the earlier copy. Which is which is decided here, on the timestamps, rather than
        // assumed from the order the extraction happened to finish in.
        boolean subjectIsOlder = subject.getCreatedAt().isBefore(other.getCreatedAt());
        StoredFile recent = subjectIsOlder ? other : subject;
        StoredFile first = subjectIsOlder ? subject : other;

        String entityRef = "file:" + recent.getId();

        // Each copy is checked on its own, so a pair matching on file name — which both of them can
        // see from the moment their rows commit — would otherwise be reported twice, once from each
        // side. The report always names the newer copy, so its reference is what identifies the pair.
        if (notificationService.alreadySentAbout(NotificationType.DUPLICATE_UPLOAD, entityRef)) {
            return;
        }

        notificationService.notifyAllAdmins(
                NotificationType.DUPLICATE_UPLOAD,
                "A duplicate file has been uploaded",
                body(recent, first, basis),
                // Points at the newer copy: it is the one an administrator would act on, and the
                // older one is named in the body for them to find.
                entityRef);
    }

    /**
     * The wording an administrator reads in the bell. Both copies are named, dated, attributed and
     * located, because the question they are about to ask is "which two, and where" and a
     * notification that makes them go and look has not told them anything.
     *
     * <p>The basis is stated rather than left implied. "The same G.O. number" is a fact about the
     * orders; "the same file name" is a fact about two files, which may or may not be the same
     * order — and an administrator deciding whether to go and look deserves to know which of the two
     * they have been handed.
     */
    private String body(StoredFile recent, StoredFile first, Basis basis) {
        return """
                %s, uploaded at %s by %s, is a duplicate of %s, uploaded at %s by %s.

                Matched on: %s.
                First copy: %s / %s.
                Recent copy: %s / %s."""
                .formatted(
                        describe(recent),
                        STAMP.format(recent.getCreatedAt().atZone(zone)),
                        recent.getUploadedBy().getFullName(),
                        describe(first),
                        STAMP.format(first.getCreatedAt().atZone(zone)),
                        first.getUploadedBy().getFullName(),
                        basis.explain(recent),
                        first.getDepartment().getName(),
                        first.getFolder().getName(),
                        recent.getDepartment().getName(),
                        recent.getFolder().getName());
    }

    /** A document's name, with its G.O. number alongside where one was read out of it. */
    private static String describe(StoredFile file) {
        return file.getGoNumber() == null
                ? "\"%s\"".formatted(file.getFileName())
                : "\"%s\" (%s)".formatted(file.getFileName(), file.getGoNumber());
    }

    /** Which of the two comparisons found the copy, in the words the notification uses. */
    private enum Basis {
        GO_NUMBER {
            @Override
            String explain(StoredFile recent) {
                return "the same G.O. number (%s)".formatted(recent.getGoNumber());
            }
        },
        FILE_NAME {
            @Override
            String explain(StoredFile recent) {
                return "the same file name — the documents may still be different";
            }
        };

        abstract String explain(StoredFile recent);
    }

    /**
     * Strips a G.O. number to the letters and digits in it, lower case.
     *
     * <p>"G.O.Ms.No.123" and "G.O. Ms. No. 123" are one reference typed by two people, and this is
     * what makes the database agree with them. Must stay in step with
     * {@code idx_files_go_number_normalised} and the query it serves.
     *
     * @return null when there is nothing left to compare — no number, or one made entirely of
     *     punctuation, which would otherwise match every other such row
     */
    static String normaliseGoNumber(String goNumber) {
        if (goNumber == null) {
            return null;
        }
        String stripped = goNumber.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
        return stripped.isEmpty() ? null : stripped;
    }

    /**
     * Lower case, runs of whitespace collapsed to one, trimmed.
     *
     * <p>Gentler than the G.O. number's stripping, and on purpose: punctuation in a reference number
     * is typing, but punctuation in a file name is part of the name, and reducing "GO-123.pdf" and
     * "GO 123.doc" to the same string would match two genuinely different documents. Must stay in
     * step with {@code idx_files_name_normalised}.
     */
    static String normaliseFileName(String fileName) {
        if (fileName == null) {
            return null;
        }
        String collapsed = fileName.toLowerCase(Locale.ROOT).replaceAll("\\s+", " ").trim();
        return collapsed.isEmpty() ? null : collapsed;
    }
}
