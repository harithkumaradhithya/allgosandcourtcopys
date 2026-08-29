package com.allgos.dms.file.service;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.config.AppProperties;
import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.common.storage.StorageService;
import com.allgos.dms.common.web.ClientIp;
import com.allgos.dms.file.dto.FileResponses.DeletionView;
import com.allgos.dms.file.dto.FileResponses.DownloadLink;
import com.allgos.dms.file.dto.FileResponses.FileView;
import com.allgos.dms.file.dto.FileResponses.UploadResult;
import com.allgos.dms.file.entity.Download;
import com.allgos.dms.file.entity.FileDeletion;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.file.repository.DownloadRepository;
import com.allgos.dms.file.repository.FileDeletionRepository;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.repository.FolderRepository;
import com.allgos.dms.notification.entity.NotificationType;
import com.allgos.dms.notification.service.NotificationService;
import com.allgos.dms.user.entity.User;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Uploading, reading, replacing, deleting and restoring documents.
 *
 * <p>Two rules from the specification are enforced here and nowhere else:
 *
 * <ul>
 *   <li><b>Rule 2 — uploads are not scoped to your own department.</b> Any active user may file a
 *       document into any department's folder. There is deliberately no check comparing the
 *       uploader's department against the folder's; adding one would be a regression, not a fix.
 *   <li><b>Rule 4 — deleting requires a reason</b>, the deleter must be the uploader or an admin,
 *       and every admin is notified with that reason. Ownership is re-read from the stored row, so
 *       nothing the client sends can influence the decision.
 * </ul>
 *
 * <h2>Ordering against object storage</h2>
 *
 * Object storage does not join the transaction, so one of the two failure modes has to be chosen.
 * The bytes are written <em>first</em> and the row second: a committed row therefore always has
 * bytes behind it, and the failure that remains is an orphaned object, which is invisible to users
 * and sweepable. The reverse order would let a row point at a document that cannot be downloaded.
 * When the row fails to commit, the object just written is deleted immediately.
 */
@Service
public class FileService {

    private static final Logger log = LoggerFactory.getLogger(FileService.class);

    private final StoredFileRepository fileRepository;
    private final FileDeletionRepository deletionRepository;
    private final DownloadRepository downloadRepository;
    private final FolderRepository folderRepository;
    private final StorageService storageService;
    private final UploadValidator uploadValidator;
    private final FileRecordWriter fileRecordWriter;
    private final DocumentEnrichmentService enrichmentService;
    private final AuditService auditService;
    private final NotificationService notificationService;
    private final AppProperties properties;

    public FileService(
            StoredFileRepository fileRepository,
            FileDeletionRepository deletionRepository,
            DownloadRepository downloadRepository,
            FolderRepository folderRepository,
            StorageService storageService,
            UploadValidator uploadValidator,
            FileRecordWriter fileRecordWriter,
            DocumentEnrichmentService enrichmentService,
            AuditService auditService,
            NotificationService notificationService,
            AppProperties properties) {
        this.fileRepository = fileRepository;
        this.deletionRepository = deletionRepository;
        this.downloadRepository = downloadRepository;
        this.folderRepository = folderRepository;
        this.storageService = storageService;
        this.uploadValidator = uploadValidator;
        this.fileRecordWriter = fileRecordWriter;
        this.enrichmentService = enrichmentService;
        this.auditService = auditService;
        this.notificationService = notificationService;
        this.properties = properties;
    }

    // ------------------------------------------------------------------------ upload

    /**
     * Uploads one or more files into a folder in any department.
     *
     * <p>Not {@code @Transactional}: each file is committed independently by
     * {@link FileRecordWriter} once its bytes are stored, so a rejected file never rolls back the
     * ones already accepted. The caller gets both lists back.
     */
    public UploadResult upload(UUID folderId, List<MultipartFile> parts, User uploader) {
        if (parts == null || parts.isEmpty()) {
            throw ApiException.badRequest("NO_FILES", "Select at least one file to upload.");
        }

        // Read in its own transaction: this method deliberately has none, so a lazy association
        // resolved later would fail with no session.
        FileRecordWriter.FolderRef folder = fileRecordWriter.folderRef(folderId);

        List<FileView> uploaded = new ArrayList<>();
        List<UploadResult.Rejected> rejected = new ArrayList<>();

        for (MultipartFile part : parts) {
            try {
                uploaded.add(uploadOne(folder, part, uploader));
            } catch (ApiException ex) {
                // One bad file does not fail the batch; the user is told exactly which and why.
                rejected.add(new UploadResult.Rejected(
                        UploadValidator.safeName(part.getOriginalFilename()), ex.getCode(), ex.getMessage()));
            }
        }

        if (!uploaded.isEmpty()) {
            announceUpload(folder, uploaded, uploader);
        }

        return new UploadResult(uploaded, rejected);
    }

    /**
     * Tells the whole office that a document has arrived — every active account except the uploader,
     * admins and members alike.
     *
     * <p>One notification per upload <em>action</em>, not per file. A member filing twenty scans
     * would otherwise write twenty rows into a hundred people's bells, and the twenty-first thing
     * anyone wants is a bell they have learned to ignore.
     *
     * <p>Failures are swallowed on purpose. The files are already stored and committed by this
     * point, and refusing the request now would tell the uploader their upload failed when it did
     * not — leaving them to do it again and file everything twice.
     */
    private void announceUpload(
            FileRecordWriter.FolderRef folder, List<FileView> uploaded, User uploader) {
        try {
            FileView first = uploaded.getFirst();
            boolean single = uploaded.size() == 1;

            String what = single
                    ? "\"%s\"".formatted(first.fileName())
                    : "%d documents".formatted(uploaded.size());

            notificationService.notifyEveryoneExcept(
                    uploader,
                    NotificationType.FILE_UPLOADED,
                    single ? "A new document was uploaded" : "New documents were uploaded",
                    "%s uploaded %s to %s / %s."
                            .formatted(
                                    uploader.getFullName(),
                                    what,
                                    folder.departmentName(),
                                    folder.folderName()),
                    single ? "file:" + first.id() : "folder:" + folder.folderId());
        } catch (RuntimeException ex) {
            log.error("Upload by {} was stored but could not be announced", uploader.getId(), ex);
        }
    }

    private FileView uploadOne(FileRecordWriter.FolderRef folder, MultipartFile part, User uploader) {
        UploadValidator.Accepted accepted = uploadValidator.validate(part);
        uploadValidator.scanForMalware(part);

        String key = storageService.newKey(folder.departmentId(), folder.folderId(), accepted.fileName());

        InputStream content;
        try {
            content = part.getInputStream();
        } catch (IOException ex) {
            throw ApiException.badRequest(
                    "FILE_UNREADABLE", "%s could not be read.".formatted(accepted.fileName()));
        }

        try {
            storageService.put(key, content, accepted.contentType(), accepted.sizeBytes());
        } finally {
            StorageService.closeQuietly(content);
        }

        FileView view;
        try {
            view = fileRecordWriter.record(folder.folderId(), uploader, accepted, key);
        } catch (RuntimeException ex) {
            // The row did not commit, so nothing will ever reference these bytes.
            log.error("Recording upload {} failed; removing the stored object", accepted.fileName(), ex);
            storageService.delete(key);
            throw ex;
        }

        // Outside the block above on purpose: the row has committed by here, and a failure to queue
        // the extraction must not reach a catch that deletes the document's bytes.
        // Reading the Abstract out of a scan takes seconds; the upload is not made to wait for it.
        enrichmentService.enrich(view.id(), key, accepted.contentType());
        return view;
    }

    // ----------------------------------------------------------------------- replace

    /**
     * Replaces a document's contents with a newer version of it.
     *
     * <p>The member who uploaded it may correct their own document, and an admin may correct
     * anything — the same rule as deleting, since an admin can already delete and re-upload.
     *
     * <p>The file keeps its id, so anything already pointing at it still resolves; only the bytes,
     * the name, the size and the version change. The uploader is not reassigned: an admin fixing
     * someone's document does not become its author.
     *
     * <p>The new bytes go to a <b>new</b> key and the old object is left in place. Overwriting the
     * existing key would mean a failed upload destroying the document that is already there, and
     * discarding the superseded version would make a mistaken replacement unrecoverable. The old
     * key is recorded in the audit entry instead.
     *
     * @throws ApiException 403 if the caller neither uploaded the file nor is an admin, 404 if it
     *     does not exist or has been deleted
     */
    public FileView replace(UUID fileId, MultipartFile part, User actor) {
        if (part == null || part.isEmpty()) {
            throw ApiException.badRequest("NO_FILES", "Choose a file to replace this document with.");
        }

        // Permission first, so a refused caller never causes an upload.
        FileRecordWriter.ReplacementTarget target = fileRecordWriter.replacementTarget(fileId, actor);

        UploadValidator.Accepted accepted = uploadValidator.validate(part);
        uploadValidator.scanForMalware(part);

        String key = storageService.newKey(target.departmentId(), target.folderId(), accepted.fileName());

        InputStream content;
        try {
            content = part.getInputStream();
        } catch (IOException ex) {
            throw ApiException.badRequest(
                    "FILE_UNREADABLE", "%s could not be read.".formatted(accepted.fileName()));
        }

        try {
            storageService.put(key, content, accepted.contentType(), accepted.sizeBytes());
        } finally {
            StorageService.closeQuietly(content);
        }

        FileView view;
        try {
            view = fileRecordWriter.applyReplacement(fileId, actor, accepted, key, target.storageKey());
        } catch (RuntimeException ex) {
            // The row still points at the old key, so these bytes are unreachable.
            log.error("Replacing file {} failed; removing the stored object", fileId, ex);
            storageService.delete(key);
            throw ex;
        }

        // The replaced document is a different document, so its description is re-read from the new
        // bytes — again off the request, and again only once the row already says the truth.
        enrichmentService.enrich(fileId, key, accepted.contentType());
        return view;
    }

    // -------------------------------------------------------------------------- read

    @Transactional(readOnly = true)
    public PageResponse<FileView> listByFolder(UUID folderId, User viewer, Pageable pageable) {
        loadFolder(folderId); // 404 for an unknown folder rather than an empty page
        Page<StoredFile> page = fileRepository.findByFolderIdAndDeletedFalse(folderId, pageable);
        return PageResponse.of(page, file -> FileView.from(file, file.canBeModifiedBy(viewer)));
    }

    @Transactional(readOnly = true)
    public PageResponse<FileView> listMyUploads(User viewer, Pageable pageable) {
        Page<StoredFile> page = fileRepository.findByUploadedByIdAndDeletedFalse(viewer.getId(), pageable);
        return PageResponse.of(page, file -> FileView.from(file, file.canBeModifiedBy(viewer)));
    }

    @Transactional(readOnly = true)
    public FileView get(UUID fileId, User viewer) {
        StoredFile file = loadFile(fileId);
        return FileView.from(file, file.canBeModifiedBy(viewer));
    }

    /**
     * A short-lived presigned URL for the bytes.
     *
     * <p>Every active user may download from every department (rule 2), so the only checks are that
     * the file exists and has not been deleted.
     *
     * <p>Two records are written, and they are not redundant. The audit entry is append-only
     * evidence for a reviewer; the {@code downloads} row is the user-facing history they can browse
     * and reports can count. Both are written here, at the moment the URL is issued — the last point
     * the server is involved, since the bytes then travel from storage straight to the browser. A
     * row therefore means "this user was given the means to read this", which is the question worth
     * answering, rather than a claim that the transfer completed.
     */
    @Transactional
    public DownloadLink downloadLink(UUID fileId, User viewer) {
        StoredFile file = loadFile(fileId);

        var ttl = properties.storage().presignedUrlTtl();
        String url = storageService.presignedGet(file.getStorageKey(), ttl, file.getFileName());

        Download download = new Download();
        download.setUser(viewer);
        download.setFile(file);
        download.setIpAddress(ClientIp.current());
        downloadRepository.save(download);

        auditService.record(
                viewer,
                AuditAction.FILE_DOWNLOADED,
                "file",
                file.getId(),
                Map.of("fileName", file.getFileName()));

        return new DownloadLink(url, Instant.now().plus(ttl), file.getFileName());
    }

    // ------------------------------------------------------------------------ delete

    /**
     * Soft-deletes a file, recording why and telling the whole office.
     *
     * <p>Everyone is told, not only the admins: a document vanishing from a shared archive is news
     * to whoever was using it, and the person who removed it and their reason are exactly what
     * stops that being a mystery. The deleter is left out — they know.
     *
     * @throws ApiException 400 if the reason is missing or blank, 403 if the caller neither uploaded
     *     the file nor is an admin
     */
    @Transactional
    public void delete(UUID fileId, String reason, User actor) {
        String trimmed = reason == null ? "" : reason.trim();
        if (trimmed.isEmpty()) {
            // Rule 4. Without this the notification would carry nothing.
            throw ApiException.badRequest("REASON_REQUIRED", "Please give a reason for deleting this file.");
        }

        StoredFile file = loadFile(fileId);

        // Decided from the stored row, never from anything the client sent.
        if (!file.canBeModifiedBy(actor)) {
            auditService.recordDurable(
                    actor,
                    AuditAction.FILE_DELETED,
                    "file",
                    file.getId(),
                    Map.of("outcome", "refused", "reason", "not the uploader"));
            throw ApiException.forbidden(
                    "NOT_FILE_OWNER", "You can only delete files you uploaded. Ask an administrator.");
        }

        file.setDeleted(true);
        folderRepository.adjustFileCount(file.getFolder().getId(), -1);

        FileDeletion deletion = new FileDeletion();
        deletion.setFile(file);
        deletion.setDeletedBy(actor);
        deletion.setReason(trimmed);
        // Captured now rather than read through `file` later: a purge — manual or the 30-day sweep
        // — removes the row this association points at, and the log has to keep reading correctly
        // for every entry after that, not only the ones nobody has purged yet.
        deletion.setFileName(file.getFileName());
        deletion.setFileType(file.getFileType());
        deletion.setSizeBytes(file.getSizeBytes());
        deletion.setDepartmentId(file.getDepartment().getId());
        deletion.setDepartmentName(file.getDepartment().getName());
        deletion.setFolderId(file.getFolder().getId());
        deletion.setFolderName(file.getFolder().getName());
        deletionRepository.save(deletion);

        auditService.record(
                actor,
                AuditAction.FILE_DELETED,
                "file",
                file.getId(),
                Map.of("fileName", file.getFileName(), "reason", trimmed));

        notificationService.notifyEveryoneExcept(
                actor,
                NotificationType.FILE_DELETED,
                "A document was deleted",
                "%s deleted \"%s\" from %s. Reason: %s"
                        .formatted(
                                actor.getFullName(),
                                file.getFileName(),
                                file.getDepartment().getName(),
                                trimmed),
                "file:" + file.getId());
    }

    /** Puts a soft-deleted file back. Admin-only — the controller carries the role check. */
    @Transactional
    public FileView restore(UUID fileId, User admin) {
        StoredFile file = fileRepository.findById(fileId).orElseThrow(() -> ApiException.notFound("File"));

        if (!file.isDeleted()) {
            throw ApiException.conflict("FILE_NOT_DELETED", "That file has not been deleted.");
        }

        file.setDeleted(false);
        folderRepository.adjustFileCount(file.getFolder().getId(), 1);

        // Stamp the deletion that is being undone, so the log shows the round trip.
        deletionRepository
                .findFirstByFileIdAndRestoredAtIsNullOrderByDeletedAtDesc(fileId)
                .ifPresent(deletion -> {
                    deletion.setRestoredBy(admin);
                    deletion.setRestoredAt(Instant.now());
                });

        auditService.record(
                admin,
                AuditAction.FILE_RESTORED,
                "file",
                file.getId(),
                Map.of("fileName", file.getFileName()));

        notificationService.notify(
                file.getUploadedBy(),
                NotificationType.FILE_RESTORED,
                "Your document was restored",
                "An administrator restored \"%s\".".formatted(file.getFileName()),
                "file:" + file.getId());

        return FileView.from(file, file.canBeModifiedBy(admin));
    }

    // -------------------------------------------------------------------------- purge

    /**
     * Permanently removes a deleted document — the row and its bytes — rather than waiting out the
     * {@link FileDeletion#PURGE_RETENTION} window. Admin-only — the controller carries the role
     * check, the same as restore.
     *
     * <p>The database change commits before the bytes are removed from storage, never the other way
     * round: if the object delete were to fail first, the row would still exist afterward looking
     * exactly like an ordinary, restorable deletion, and a restore would then hand back a file whose
     * bytes are already gone. An orphaned object nobody ever reads again is the safe failure to have
     * instead — the same ordering {@link #uploadOne} uses, just in reverse.
     *
     * @throws ApiException 404 if the file does not exist, 409 if it is not currently deleted
     */
    public void purge(UUID fileId, User admin) {
        String storageKey = fileRecordWriter.purge(fileId, admin);
        storageService.delete(storageKey);
    }

    /**
     * The daily sweep: purges every document still deleted {@link FileDeletion#PURGE_RETENTION}
     * after it was, that nobody restored in the meantime.
     *
     * <p>Each file is purged and committed on its own, so one failure — an object already missing
     * from storage, say — is logged and does not stop the rest of the batch.
     *
     * @return how many were purged
     */
    public int purgeExpired() {
        Instant threshold = Instant.now().minus(FileDeletion.PURGE_RETENTION);
        List<UUID> fileIds = deletionRepository.findPurgeableFileIds(threshold);

        int purged = 0;
        for (UUID fileId : fileIds) {
            try {
                purge(fileId, null);
                purged++;
            } catch (RuntimeException ex) {
                log.error("The 30-day sweep could not purge file {}", fileId, ex);
            }
        }
        return purged;
    }

    /** The admin deletions log. {@code onlyUnrestored} narrows it to files still deleted. */
    @Transactional(readOnly = true)
    public PageResponse<DeletionView> listDeletions(boolean onlyUnrestored, Pageable pageable) {
        Page<FileDeletion> page = onlyUnrestored
                ? deletionRepository.findByRestoredAtIsNull(pageable)
                : deletionRepository.findAllBy(pageable);
        return PageResponse.of(page, DeletionView::from);
    }

    // ----------------------------------------------------------------------- helpers

    private Folder loadFolder(UUID folderId) {
        return folderRepository.findById(folderId).orElseThrow(() -> ApiException.notFound("Folder"));
    }

    /** A soft-deleted file is gone as far as every path except the deletions log is concerned. */
    private StoredFile loadFile(UUID fileId) {
        return fileRepository
                .findByIdAndDeletedFalse(fileId)
                .orElseThrow(() -> ApiException.notFound("File"));
    }
}
