package com.allgos.dms.file.service;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.file.dto.FileResponses.FileView;
import com.allgos.dms.file.entity.FileDeletion;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.file.repository.FileDeletionRepository;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.repository.FolderRepository;
import com.allgos.dms.user.entity.User;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Commits the database side of one upload, on its own.
 *
 * <p>A separate bean because the transaction boundary has to be crossed through the Spring proxy:
 * {@code FileService} uploads the bytes first and then calls this, and calling a
 * {@code @Transactional} method on {@code this} would silently run it in the caller's (absent)
 * transaction — the same trap {@code FailedAttemptRecorder} exists to avoid.
 *
 * <p>Each file commits by itself, so one failure in a multi-file upload does not undo the files that
 * already succeeded.
 */
@Component
public class FileRecordWriter {

    private final StoredFileRepository fileRepository;
    private final FolderRepository folderRepository;
    private final FileDeletionRepository deletionRepository;
    private final AuditService auditService;

    public FileRecordWriter(
            StoredFileRepository fileRepository,
            FolderRepository folderRepository,
            FileDeletionRepository deletionRepository,
            AuditService auditService) {
        this.fileRepository = fileRepository;
        this.folderRepository = folderRepository;
        this.deletionRepository = deletionRepository;
        this.auditService = auditService;
    }

    /**
     * The facts {@code FileService} needs before it writes any bytes — read in a transaction so the
     * department behind the folder is a real row rather than a lazy proxy that would fail the moment
     * the request left the session.
     */
    @Transactional(readOnly = true)
    public FolderRef folderRef(UUID folderId) {
        Folder folder = folderRepository
                .findById(folderId)
                .orElseThrow(() -> ApiException.notFound("Folder"));
        return new FolderRef(
                folder.getId(),
                folder.getDepartment().getId(),
                folder.getName(),
                folder.getDepartment().getName());
    }

    /**
     * Writes the row and returns the view built <em>inside</em> this transaction. Returning the
     * entity instead would hand the caller lazy associations it has no session to resolve.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FileView record(
            UUID folderId, User uploader, UploadValidator.Accepted accepted, String storageKey) {

        Folder folder = folderRepository
                .findById(folderId)
                .orElseThrow(() -> ApiException.notFound("Folder"));

        StoredFile file = new StoredFile();
        file.setFolder(folder);
        // Denormalised from the folder, never from the request: the department a file belongs to is
        // decided by where it was filed, not by what the client claimed.
        file.setDepartment(folder.getDepartment());
        file.setFileName(accepted.fileName());
        file.setFileType(accepted.contentType());
        file.setSizeBytes(accepted.sizeBytes());
        file.setStorageKey(storageKey);
        // The description and G.O. number are read out of the document itself and filled in a moment
        // later — see DocumentEnrichmentService — so the upload does not wait on OCR.
        file.setUploadedBy(uploader);

        StoredFile saved = fileRepository.save(file);
        folderRepository.adjustFileCount(folder.getId(), 1);

        auditService.record(
                uploader,
                AuditAction.FILE_UPLOADED,
                "file",
                saved.getId(),
                Map.of(
                        "fileName", saved.getFileName(),
                        "folderId", folder.getId().toString(),
                        "departmentId", folder.getDepartment().getId().toString(),
                        "sizeBytes", saved.getSizeBytes()));

        return FileView.from(saved, saved.canBeModifiedBy(uploader));
    }

    /**
     * Fills in the description and G.O. number read out of the document after the fact, by {@link
     * DocumentEnrichmentService}.
     *
     * <p>Guarded on the storage key. Between the upload committing and the extraction finishing, the
     * document may have been replaced or deleted; in either case these values describe bytes the row
     * no longer points at, and writing them would put a stale description under a new document.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void applyEnrichment(UUID fileId, String storageKey, String description, String goNumber) {
        fileRepository
                .findByIdAndDeletedFalse(fileId)
                .filter(file -> storageKey.equals(file.getStorageKey()))
                .ifPresent(file -> {
                    file.setDescription(description);
                    file.setGoNumber(goNumber);
                });
    }

    /**
     * Checks that this file may be replaced, and reports where its current bytes live.
     *
     * <p>Called <em>before</em> anything is uploaded, so a member who may not replace a document
     * never causes bytes to be written at all. Ownership comes from the stored row.
     */
    @Transactional(readOnly = true)
    public ReplacementTarget replacementTarget(UUID fileId, User actor) {
        StoredFile file = fileRepository
                .findByIdAndDeletedFalse(fileId)
                .orElseThrow(() -> ApiException.notFound("File"));

        if (!file.canBeModifiedBy(actor)) {
            throw ApiException.forbidden(
                    "NOT_FILE_OWNER", "You can only replace files you uploaded. Ask an administrator.");
        }

        return new ReplacementTarget(
                file.getId(),
                file.getFolder().getId(),
                file.getDepartment().getId(),
                file.getStorageKey(),
                file.getVersion());
    }

    /**
     * Points an existing file at newly stored bytes and bumps its version.
     *
     * <p>The row keeps its id, so favourites, download history and any link already shared inside
     * the office still resolve to the document — which is the point of replacing rather than
     * deleting and uploading again.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public FileView applyReplacement(
            UUID fileId,
            User actor,
            UploadValidator.Accepted accepted,
            String storageKey,
            String previousKey) {

        StoredFile file = fileRepository
                .findByIdAndDeletedFalse(fileId)
                .orElseThrow(() -> ApiException.notFound("File"));

        // Re-checked inside the transaction: the row could have changed hands since the pre-check.
        if (!file.canBeModifiedBy(actor)) {
            throw ApiException.forbidden(
                    "NOT_FILE_OWNER", "You can only replace files you uploaded. Ask an administrator.");
        }

        String previousName = file.getFileName();

        file.setFileName(accepted.fileName());
        file.setFileType(accepted.contentType());
        file.setSizeBytes(accepted.sizeBytes());
        file.setStorageKey(storageKey);
        // Cleared rather than kept: a replaced document is a different document, and the old
        // description and G.O. number would otherwise linger under a mismatched name until the
        // re-read lands. DocumentEnrichmentService fills them in again from the new bytes.
        file.setDescription(null);
        file.setGoNumber(null);
        file.setVersion(file.getVersion() + 1);
        // uploadedBy is left alone: it is who put the document into the system, and an admin
        // correcting someone's file does not take ownership of it.

        auditService.record(
                actor,
                AuditAction.FILE_REPLACED,
                "file",
                file.getId(),
                Map.of(
                        "fileName", accepted.fileName(),
                        "previousFileName", previousName,
                        "version", file.getVersion(),
                        // The superseded object is kept rather than deleted, and its key recorded
                        // here, so a replacement made in error is recoverable. Nothing in the
                        // application reads it — see the retention question in the handoff.
                        "previousStorageKey", previousKey));

        return FileView.from(file, file.canBeModifiedBy(actor));
    }

    /**
     * Hard-deletes a deleted file's row and stamps the deletion record that is about to outlive it.
     * {@code admin} is null for the 30-day sweep, which has no acting user — the deletion record and
     * audit entry both say so rather than naming someone who did not press anything.
     *
     * @return the storage key the caller must remove the bytes for, once this has committed
     * @throws ApiException 404 if the file does not exist, 409 if it is not currently deleted
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public String purge(UUID fileId, User admin) {
        StoredFile file = fileRepository.findById(fileId).orElseThrow(() -> ApiException.notFound("File"));

        if (!file.isDeleted()) {
            throw ApiException.conflict(
                    "FILE_NOT_DELETED", "Only a deleted document can be permanently removed.");
        }

        FileDeletion deletion = deletionRepository
                .findFirstByFileIdAndRestoredAtIsNullOrderByDeletedAtDesc(fileId)
                .orElseThrow(() -> ApiException.notFound("Deletion record"));

        String storageKey = file.getStorageKey();

        deletion.setPurgedBy(admin);
        deletion.setPurgedAt(Instant.now());
        // Cleared before the row it points at is removed, rather than relying on the database's own
        // ON DELETE SET NULL to catch up — the persistence context should not disagree with the
        // database about what this association currently holds for the rest of the transaction.
        deletion.setFile(null);

        fileRepository.delete(file);

        if (admin != null) {
            auditService.record(
                    admin, AuditAction.FILE_PURGED, "file", fileId, Map.of("fileName", deletion.getFileName()));
        } else {
            auditService.recordAnonymous(
                    AuditAction.FILE_PURGED,
                    Map.of("fileId", fileId.toString(), "fileName", deletion.getFileName(), "trigger", "30-day sweep"));
        }

        return storageKey;
    }

    /**
     * A folder and the department it belongs to, resolved eagerly.
     *
     * <p>The names come along because the upload notification names the destination, and the caller
     * has no session in which to walk back to them.
     */
    public record FolderRef(UUID folderId, UUID departmentId, String folderName, String departmentName) {}

    /** An existing file the caller is allowed to replace, and where its current bytes are. */
    public record ReplacementTarget(
            UUID fileId, UUID folderId, UUID departmentId, String storageKey, int version) {}
}
