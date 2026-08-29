package com.allgos.dms.file.service;

import com.allgos.dms.common.storage.StorageService;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * Reads the Abstract paragraph and G.O. number out of a stored PDF, after the upload that carried it
 * has already been answered.
 *
 * <p>This used to run inline in {@link FileService#upload}. On a scanned order — which is most of
 * what this office files — that meant rendering page one at 300 DPI and running Tesseract over it
 * while the browser sat on a finished progress bar, adding seconds to every upload for a field that
 * is decoration next to the document itself.
 *
 * <p>So the row is committed without it and filled in a moment later. The consequence is honest and
 * small: for a few seconds after an upload, the Description column shows a dash and then fills in on
 * the next refresh. Nothing depends on the field being there — search matches on it when it exists,
 * and the document is downloadable either way.
 *
 * <p>The bytes are re-read from object storage rather than carried over from the request. Holding a
 * 50 MB array per queued file would put a bulk import's worth of documents in the heap at once, and
 * the object is already there — writing it is what commits the row in the first place.
 *
 * <p>The duplicate check hangs off the back of this for the same reason it exists here at all: it
 * compares the G.O. number, which does not exist until the extraction above has run. See
 * {@link DuplicateUploadDetector}.
 */
@Service
public class DocumentEnrichmentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentEnrichmentService.class);

    private final StorageService storageService;
    private final DocumentAbstractExtractor extractor;
    private final FileRecordWriter fileRecordWriter;
    private final DuplicateUploadDetector duplicateDetector;

    public DocumentEnrichmentService(
            StorageService storageService,
            DocumentAbstractExtractor extractor,
            FileRecordWriter fileRecordWriter,
            DuplicateUploadDetector duplicateDetector) {
        this.storageService = storageService;
        this.extractor = extractor;
        this.fileRecordWriter = fileRecordWriter;
        this.duplicateDetector = duplicateDetector;
    }

    /**
     * Queues the work that happens after an upload has been answered: reading what can be read out
     * of the document, and then checking whether it is a copy of something already filed.
     *
     * <p>Everything is queued, not just PDFs. Only a PDF carries a G.O. number the extractor can
     * read, so that part is skipped for anything else — but a photograph or a spreadsheet can still
     * be the same document filed twice, and its file name is the only evidence of that there is. An
     * early return here would have quietly meant "duplicates are a PDF feature".
     *
     * @param storageKey the key the row pointed at when it was written — checked again before the
     *     row is updated, so a replacement landing in the meantime is never overwritten with the
     *     superseded document's description
     */
    public void enrich(UUID fileId, String storageKey, String contentType) {
        processAsync(fileId, storageKey, "application/pdf".equals(contentType));
    }

    /**
     * Public only because {@code @Async} is applied by a proxy, and a call to {@code this} from
     * {@link #enrich} would run on the caller's thread — the very thing this exists to avoid.
     *
     * @param readable whether the document is one the extractor can read a G.O. number out of
     */
    @Async("documentEnrichment")
    public void processAsync(UUID fileId, String storageKey, boolean readable) {
        if (readable) {
            extract(fileId, storageKey);
        }

        // Outside the extraction and unconditional: whether or not a G.O. number was found, the
        // document has a name, and a duplicate is worth reporting on that alone. Running it here
        // rather than at the end of the extraction is also what keeps it to exactly one check per
        // upload -- two would mean telling every administrator twice.
        duplicateDetector.check(fileId);
    }

    /**
     * Reads the document and writes what it found, or leaves the row alone.
     *
     * <p>Failures are swallowed: a document nobody can read a description out of is still a
     * document, and the duplicate check that follows does not depend on this having worked.
     */
    private void extract(UUID fileId, String storageKey) {
        try {
            DocumentAbstractExtractor.Extraction extraction = extractor.extract(storageService.get(storageKey));
            if (extraction.description() == null && extraction.goNumber() == null) {
                return; // nothing to write; leave the row as it is
            }
            fileRecordWriter.applyEnrichment(
                    fileId, storageKey, extraction.description(), extraction.goNumber());
        } catch (RuntimeException ex) {
            // This is the same best-effort contract the inline version had, just on another thread.
            log.warn("Could not enrich file {} from {}", fileId, storageKey, ex);
        }
    }
}
