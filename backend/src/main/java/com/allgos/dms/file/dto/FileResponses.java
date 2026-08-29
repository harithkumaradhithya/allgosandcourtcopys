package com.allgos.dms.file.dto;

import com.allgos.dms.file.entity.Download;
import com.allgos.dms.file.entity.FileDeletion;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.entity.FolderCategory;
import java.time.Instant;
import java.util.UUID;

/** Response bodies for the department, folder and file endpoints. */
public final class FileResponses {

    /** A department as the browsing screens see it, with enough counts to render a card. */
    public record DepartmentView(
            UUID id, String name, String code, String description, long folderCount, long fileCount) {}

    public record FolderView(
            UUID id,
            UUID departmentId,
            String departmentName,
            UUID parentFolderId,
            String name,
            FolderCategory category,
            int fileCount,
            Instant createdAt,
            /** Bumped when a document is filed into or removed from this folder, not only when the
             * folder itself is renamed — see {@code FolderRepository.adjustFileCount}. What a picker
             * sorted by "recently used" sorts on. */
            Instant updatedAt) {

        /** Must be called inside the transaction — department and parent are lazy. */
        public static FolderView from(Folder folder) {
            return new FolderView(
                    folder.getId(),
                    folder.getDepartment().getId(),
                    folder.getDepartment().getName(),
                    folder.getParent() == null ? null : folder.getParent().getId(),
                    folder.getName(),
                    folder.getCategory(),
                    folder.getFileCount(),
                    folder.getCreatedAt(),
                    folder.getUpdatedAt());
        }
    }

    /**
     * Where an unfiled PDF probably belongs, guessed from its own Abstract heading, plus its G.O.
     * number when one was read.
     *
     * <p>Always names a folder when a department is found: every department carries a "General"
     * folder (seeded by migration), so there is always somewhere to default to even when nothing
     * more specific was chosen. The department fields are null together when nothing in the document
     * matched a known department closely enough to act on — but {@code goNumber} is reported
     * independently of that: a document can carry a perfectly readable G.O. number even when its
     * department heading does not resemble any of the ones on file, and that is still worth showing
     * before the upload happens rather than only after.
     */
    public record SuggestedDestination(
            UUID departmentId, String departmentName, UUID folderId, String folderName, String goNumber) {

        public static final SuggestedDestination NONE = new SuggestedDestination(null, null, null, null, null);
    }

    /**
     * A file row.
     *
     * <p>{@code canModify} covers both deleting and replacing, which share one ownership rule, and
     * is a convenience for the UI only — the server re-checks on every such call, so a client that
     * ignores the flag gains nothing.
     */
    public record FileView(
            UUID id,
            UUID folderId,
            String folderName,
            UUID departmentId,
            String departmentName,
            String fileName,
            String fileType,
            long sizeBytes,
            UUID uploadedById,
            String uploadedByName,
            int version,
            boolean canModify,
            /** True when the browser can render these bytes in place — see {@code FileService}. */
            boolean previewable,
            /** Whether <em>this</em> viewer has starred it; another user's row says nothing. */
            boolean favorite,
            /** The Abstract paragraph read from the document itself; null when there is none. */
            String description,
            /** The G.O. reference read from the document itself; null when there is none. */
            String goNumber,
            Instant uploadedAt) {

        public static FileView from(StoredFile file, boolean canModify) {
            return from(file, canModify, false);
        }

        public static FileView from(StoredFile file, boolean canModify, boolean favorite) {
            return new FileView(
                    file.getId(),
                    file.getFolder().getId(),
                    file.getFolder().getName(),
                    file.getDepartment().getId(),
                    file.getDepartment().getName(),
                    file.getFileName(),
                    file.getFileType(),
                    file.getSizeBytes(),
                    file.getUploadedBy().getId(),
                    file.getUploadedBy().getFullName(),
                    file.getVersion(),
                    canModify,
                    isPreviewable(file.getFileType()),
                    favorite,
                    file.getDescription(),
                    file.getGoNumber(),
                    file.getCreatedAt());
        }
    }

    /**
     * What a browser will display in place rather than download.
     *
     * <p>PDFs and images only. Word and Excel would either prompt a download anyway or be handed to
     * a plugin, so offering "Preview" for them would be a button that does not do what it says.
     *
     * <p>Lives here, beside the {@code previewable} flag it fills in, so the answer the list gives
     * and the answer the preview endpoint enforces can never drift apart.
     */
    public static boolean isPreviewable(String contentType) {
        return contentType != null
                && ("application/pdf".equals(contentType) || contentType.startsWith("image/"));
    }

    /**
     * The outcome of one multipart upload.
     *
     * <p>Accepted and rejected files are reported together rather than failing the whole request,
     * so selecting eight documents and having one of them be a disguised executable still uploads
     * the other seven and says precisely what was wrong with the eighth.
     */
    public record UploadResult(java.util.List<FileView> uploaded, java.util.List<Rejected> rejected) {

        public record Rejected(String fileName, String code, String message) {}
    }

    /**
     * A row in the admin deletions log, carrying the reason the deleter gave.
     *
     * <p>Every field but {@code fileId} comes from the deletion record's own snapshot rather than a
     * live {@code StoredFile} — that file may since have been purged, and a purged row has to read
     * back exactly as well as one that has not been.
     */
    public record DeletionView(
            UUID id,
            /** Null once the file has been purged; there is nothing left at that id to open. */
            UUID fileId,
            String fileName,
            UUID departmentId,
            String departmentName,
            UUID folderId,
            String folderName,
            String deletedByName,
            String reason,
            Instant deletedAt,
            String restoredByName,
            Instant restoredAt,
            /** Neither restored nor purged — the only state Restore or "Delete permanently" applies to. */
            boolean restorable,
            /** When the daily sweep purges this on its own, if nobody has acted by then. Null once
             * restored or purged — there is no longer a countdown to show. */
            Instant purgeExpiresAt,
            /** Null for the automatic sweep — nobody pressed the button, the 30 days did. */
            String purgedByName,
            Instant purgedAt) {

        public static DeletionView from(FileDeletion deletion) {
            boolean restorable = deletion.isRestorable();
            return new DeletionView(
                    deletion.getId(),
                    deletion.getFile() == null ? null : deletion.getFile().getId(),
                    deletion.getFileName(),
                    deletion.getDepartmentId(),
                    deletion.getDepartmentName(),
                    deletion.getFolderId(),
                    deletion.getFolderName(),
                    deletion.getDeletedBy().getFullName(),
                    deletion.getReason(),
                    deletion.getDeletedAt(),
                    deletion.getRestoredBy() == null ? null : deletion.getRestoredBy().getFullName(),
                    deletion.getRestoredAt(),
                    restorable,
                    restorable ? deletion.getDeletedAt().plus(FileDeletion.PURGE_RETENTION) : null,
                    deletion.getPurgedBy() == null ? null : deletion.getPurgedBy().getFullName(),
                    deletion.getPurgedAt());
        }
    }

    /** A short-lived presigned URL, plus when it stops working. */
    public record DownloadLink(String url, Instant expiresAt, String fileName) {}

    /**
     * A presigned URL the browser renders in place rather than saving.
     *
     * <p>The same mechanism as a download — the difference is only that no Content-Disposition is
     * attached — but it carries the content type, because the viewer has to decide between an
     * {@code <object>} and an {@code <img>} before the bytes arrive.
     */
    public record PreviewLink(String url, Instant expiresAt, String fileName, String fileType) {}

    /**
     * A row in a user's own download history.
     *
     * <p>{@code available} is false once the document has been deleted. The row stays either way: a
     * history that quietly drops entries when something is removed is not a history.
     */
    public record DownloadView(
            UUID id,
            UUID fileId,
            String fileName,
            String fileType,
            long sizeBytes,
            UUID departmentId,
            String departmentName,
            UUID folderId,
            String folderName,
            boolean available,
            Instant downloadedAt) {

        public static DownloadView from(Download download) {
            StoredFile file = download.getFile();
            return new DownloadView(
                    download.getId(),
                    file.getId(),
                    file.getFileName(),
                    file.getFileType(),
                    file.getSizeBytes(),
                    file.getDepartment().getId(),
                    file.getDepartment().getName(),
                    file.getFolder().getId(),
                    file.getFolder().getName(),
                    !file.isDeleted(),
                    download.getCreatedAt());
        }
    }

    private FileResponses() {}
}
