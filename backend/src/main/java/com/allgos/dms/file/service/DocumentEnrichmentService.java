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
 */
@Service
public class DocumentEnrichmentService {

    private static final Logger log = LoggerFactory.getLogger(DocumentEnrichmentService.class);

    private final StorageService storageService;
    private final DocumentAbstractExtractor extractor;
    private final FileRecordWriter fileRecordWriter;

    public DocumentEnrichmentService(
            StorageService storageService,
            DocumentAbstractExtractor extractor,
            FileRecordWriter fileRecordWriter) {
        this.storageService = storageService;
        this.extractor = extractor;
        this.fileRecordWriter = fileRecordWriter;
    }

    /**
     * Queues one document to be read. Only PDFs carry the convention this looks for, so anything
     * else is not queued at all.
     *
     * @param storageKey the key the row pointed at when it was written — checked again before the
     *     row is updated, so a replacement landing in the meantime is never overwritten with the
     *     superseded document's description
     */
    public void enrich(UUID fileId, String storageKey, String contentType) {
        if (!"application/pdf".equals(contentType)) {
            return;
        }
        enrichAsync(fileId, storageKey);
    }

    /**
     * Public only because {@code @Async} is applied by a proxy, and a call to {@code this} from
     * {@link #enrich} would run on the caller's thread — the very thing this exists to avoid.
     */
    @Async("documentEnrichment")
    public void enrichAsync(UUID fileId, String storageKey) {
        try {
            DocumentAbstractExtractor.Extraction extraction = extractor.extract(storageService.get(storageKey));
            if (extraction.description() == null && extraction.goNumber() == null) {
                return; // nothing to write; leave the row as it is
            }
            fileRecordWriter.applyEnrichment(
                    fileId, storageKey, extraction.description(), extraction.goNumber());
        } catch (RuntimeException ex) {
            // A document nobody can read a description out of is still a document. This is the same
            // best-effort contract the inline version had, just on another thread.
            log.warn("Could not enrich file {} from {}", fileId, storageKey, ex);
        }
    }
}
