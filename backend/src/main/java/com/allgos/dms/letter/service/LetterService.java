package com.allgos.dms.letter.service;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.letter.dto.LetterRequests;
import com.allgos.dms.letter.dto.LetterResponses.LetterSummary;
import com.allgos.dms.letter.dto.LetterResponses.LetterView;
import com.allgos.dms.letter.entity.Letter;
import com.allgos.dms.letter.entity.LetterFormat;
import com.allgos.dms.letter.entity.LetterGoType;
import com.allgos.dms.letter.entity.LetterLanguage;
import com.allgos.dms.letter.entity.LetterStatus;
import com.allgos.dms.letter.repository.LetterRepository;
import com.allgos.dms.user.entity.User;
import java.util.Map;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Letters somebody has written.
 *
 * <p><b>A letter belongs to its author.</b> Every method here is scoped by author id in the query
 * rather than filtered after loading, so there is no arrangement of parameters that reaches another
 * person's drafts — the same rule the notification list follows. An administrator who needs to know
 * what was issued reads the audit log, which records the act rather than copying the drafting.
 */
@Service
public class LetterService {

    private final LetterRepository letterRepository;
    private final AuditService auditService;

    public LetterService(LetterRepository letterRepository, AuditService auditService) {
        this.letterRepository = letterRepository;
        this.auditService = auditService;
    }

    /** The finished letters, or the drafts. Which one is the caller's to say. */
    @Transactional(readOnly = true)
    public PageResponse<LetterSummary> listMine(User author, LetterStatus status, Pageable pageable) {
        Page<Letter> page = letterRepository.findByAuthorIdAndStatusOrderByUpdatedAtDesc(
                author.getId(), status, pageable);
        return PageResponse.of(page, LetterSummary::from);
    }

    @Transactional(readOnly = true)
    public LetterView get(UUID letterId, User author) {
        return LetterView.from(require(letterId, author));
    }

    @Transactional
    public LetterView create(LetterRequests.SaveLetter request, User author) {
        Letter letter = new Letter();
        letter.setAuthor(author);
        apply(letter, request);
        letterRepository.save(letter);

        auditService.record(author, AuditAction.LETTER_CREATED, "letter", letter.getId(),
                Map.of("subject", letter.getSubject()));

        return LetterView.from(letter);
    }

    @Transactional
    public LetterView update(UUID letterId, LetterRequests.SaveLetter request, User author) {
        Letter letter = require(letterId, author);

        // Saving a draft as a letter is the moment the letter comes into being, so it is recorded as
        // a creation rather than an edit of something that was never issued.
        boolean wasDraft = letter.getStatus() == LetterStatus.DRAFT;
        apply(letter, request);

        auditService.record(
                author,
                wasDraft ? AuditAction.LETTER_CREATED : AuditAction.LETTER_UPDATED,
                "letter",
                letter.getId(),
                Map.of("subject", letter.getSubject()));

        return LetterView.from(letter);
    }

    // -------------------------------------------------------------------------- drafts

    /**
     * A letter still being written, kept as it is typed.
     *
     * <p>Called on a timer while somebody writes, which shapes everything about it: nothing is
     * required, and nothing is audited. An autosave every few seconds would bury the audit log under
     * the writing of a single letter, and a draft is not yet a thing that happened. The point of it
     * is only that closing the browser, losing the network or restarting the server in the middle of
     * a letter costs nothing.
     *
     * <p>The draft is the same row the finished letter will be. Saving it as a letter promotes it in
     * place rather than leaving a copy of the half-written version behind.
     */
    @Transactional
    public LetterView createDraft(LetterRequests.SaveDraft request, User author) {
        Letter letter = new Letter();
        letter.setAuthor(author);
        applyDraft(letter, request);
        letterRepository.save(letter);
        return LetterView.from(letter);
    }

    @Transactional
    public LetterView updateDraft(UUID letterId, LetterRequests.SaveDraft request, User author) {
        Letter letter = require(letterId, author);

        // A letter that has already been finished is not dragged back into the drafts by an autosave
        // that was still in flight when its author pressed Save. The edit is kept, the status is not.
        LetterStatus status = letter.getStatus();
        applyDraft(letter, request);
        letter.setStatus(status);

        return LetterView.from(letter);
    }

    /** Throwing away a draft. Refuses on a finished letter, which is deleted rather than discarded. */
    @Transactional
    public void discardDraft(UUID letterId, User author) {
        Letter letter = require(letterId, author);
        if (letter.getStatus() != LetterStatus.DRAFT) {
            throw ApiException.badRequest("NOT_A_DRAFT", "That letter has already been saved");
        }
        letterRepository.delete(letter);
    }

    @Transactional
    public void delete(UUID letterId, User author) {
        Letter letter = require(letterId, author);
        letterRepository.delete(letter);

        auditService.record(author, AuditAction.LETTER_DELETED, "letter", letterId,
                Map.of("subject", letter.getSubject()));
    }

    // ------------------------------------------------------------------------ helpers

    /**
     * Somebody else's letter reports 404 rather than 403: which ids exist is not information this
     * endpoint should confirm, and to this caller a letter they cannot open may as well not exist.
     */
    private Letter require(UUID letterId, User author) {
        return letterRepository
                .findByIdAndAuthorId(letterId, author.getId())
                .orElseThrow(() -> ApiException.notFound("Letter"));
    }

    private void apply(Letter letter, LetterRequests.SaveLetter request) {
        letter.setStatus(LetterStatus.FINAL);
        letter.setLanguage(language(request.language()));
        LetterFormat resolvedFormat = format(request.format());
        letter.setFormat(resolvedFormat);
        letter.setGoType(goType(resolvedFormat, request.goType()));
        letter.setReferenceNo(trimToNull(request.referenceNo()));
        letter.setLetterDate(request.letterDate());
        letter.setFromBlock(request.fromBlock().trim());
        letter.setOfficeBlock(trimToNull(request.officeBlock()));
        letter.setToBlock(request.toBlock().trim());
        letter.setSalutation(trimToNull(request.salutation()));
        letter.setSubject(request.subject().trim());
        letter.setReference(trimToNull(request.reference()));
        letter.setBody(request.body().trim());
        letter.setEnclosure(trimToNull(request.enclosure()));
        letter.setCopyTo(trimToNull(request.copyTo()));
        letter.setSignOff(trimToNull(request.signOff()));
        letter.setTableData(trimToNull(request.tableData()));
    }

    /**
     * The same blocks, none of them required.
     *
     * <p>The four the schema declares NOT NULL are stored empty rather than null where the author has
     * not reached them yet: for a draft "nothing written here yet" is a real state, and it is not the
     * same statement as the column being absent.
     */
    private void applyDraft(Letter letter, LetterRequests.SaveDraft request) {
        letter.setStatus(LetterStatus.DRAFT);
        letter.setLanguage(language(request.language()));
        LetterFormat resolvedFormat = format(request.format());
        letter.setFormat(resolvedFormat);
        letter.setGoType(goType(resolvedFormat, request.goType()));
        letter.setReferenceNo(trimToNull(request.referenceNo()));
        letter.setLetterDate(request.letterDate());
        letter.setFromBlock(trimToEmpty(request.fromBlock()));
        letter.setOfficeBlock(trimToNull(request.officeBlock()));
        letter.setToBlock(trimToEmpty(request.toBlock()));
        letter.setSalutation(trimToNull(request.salutation()));
        letter.setSubject(trimToEmpty(request.subject()));
        letter.setReference(trimToNull(request.reference()));
        letter.setBody(trimToEmpty(request.body()));
        letter.setEnclosure(trimToNull(request.enclosure()));
        letter.setCopyTo(trimToNull(request.copyTo()));
        letter.setSignOff(trimToNull(request.signOff()));
        letter.setTableData(trimToNull(request.tableData()));
    }

    /** English unless the caller says otherwise, which is what an older client sending nothing means. */
    private static LetterLanguage language(LetterLanguage requested) {
        return requested == null ? LetterLanguage.EN : requested;
    }

    /** The office letter shape unless the caller says otherwise. */
    private static LetterFormat format(LetterFormat requested) {
        return requested == null ? LetterFormat.LETTER : requested;
    }

    /** A G.O. defaults to the Ms classification unless another was chosen; every other format carries none. */
    private static LetterGoType goType(LetterFormat format, LetterGoType requested) {
        if (format != LetterFormat.GO) {
            return null;
        }
        return requested == null ? LetterGoType.MS : requested;
    }

    private static String trimToEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
