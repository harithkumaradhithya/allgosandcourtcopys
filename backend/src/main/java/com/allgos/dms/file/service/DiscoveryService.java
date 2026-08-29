package com.allgos.dms.file.service;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.config.AppProperties;
import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.common.storage.StorageService;
import com.allgos.dms.file.dto.FileResponses;
import com.allgos.dms.file.dto.FileResponses.DownloadView;
import com.allgos.dms.file.dto.FileResponses.FileView;
import com.allgos.dms.file.dto.FileResponses.PreviewLink;
import com.allgos.dms.file.entity.Favorite;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.file.repository.DownloadRepository;
import com.allgos.dms.file.repository.FavoriteRepository;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.folder.entity.FolderCategory;
import com.allgos.dms.user.entity.User;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Finding documents rather than filing them: search, preview, favourites and download history.
 *
 * <p>Separate from {@link FileService}, which owns the lifecycle — uploading, replacing, deleting
 * and restoring. Everything here is a read, apart from starring, and none of it can change what a
 * document is. Keeping the two apart means the rules that govern a document's existence stay in one
 * file rather than being diluted by the ways of looking at it.
 *
 * <p><b>Rule 2 runs through all of it.</b> An approved user may read anything, so nothing here
 * filters by the caller's own department. The only universal filter is the soft-delete flag: a
 * deleted document is gone to every view except the admin deletions log.
 */
@Service
public class DiscoveryService {

    /** Below this, a search matches so much that the results are noise rather than an answer. */
    private static final int MIN_SEARCH_LENGTH = 2;

    /**
     * A query that is <em>only</em> digits is exempt from {@link #MIN_SEARCH_LENGTH}: a G.O. number
     * is a compact token — "No.2" — not free prose, so a single digit is a real, deliberate search
     * ("2" for G.O. No.2) rather than the kind of noisy one-letter-matches-everything query the
     * general minimum guards against.
     */
    private static final Pattern DIGITS_ONLY = Pattern.compile("\\d+");

    private final StoredFileRepository fileRepository;
    private final FavoriteRepository favoriteRepository;
    private final DownloadRepository downloadRepository;
    private final StorageService storageService;
    private final AuditService auditService;
    private final AppProperties properties;

    public DiscoveryService(
            StoredFileRepository fileRepository,
            FavoriteRepository favoriteRepository,
            DownloadRepository downloadRepository,
            StorageService storageService,
            AuditService auditService,
            AppProperties properties) {
        this.fileRepository = fileRepository;
        this.favoriteRepository = favoriteRepository;
        this.downloadRepository = downloadRepository;
        this.storageService = storageService;
        this.auditService = auditService;
        this.properties = properties;
    }

    // ------------------------------------------------------------------------ search

    /**
     * Global search by part of a document's name, across every department.
     *
     * @param query at least two characters; anything shorter is refused rather than returning most
     *     of the archive — except a query of only digits, e.g. "2" for a G.O. number, which is
     *     accepted at any length; see {@link #DIGITS_ONLY}
     * @param departmentId optional facet
     * @param category optional facet, matched against the folder the document sits in
     * @param from optional lower bound on the upload date
     * @param to optional upper bound
     */
    @Transactional(readOnly = true)
    public PageResponse<FileView> search(
            String query,
            UUID departmentId,
            FolderCategory category,
            Instant from,
            Instant to,
            User viewer,
            Pageable pageable) {

        String term = query == null ? "" : query.trim();
        int minLength = DIGITS_ONLY.matcher(term).matches() ? 1 : MIN_SEARCH_LENGTH;
        if (term.length() < minLength) {
            throw ApiException.badRequest(
                    "SEARCH_TOO_SHORT", "Type at least %d characters to search.".formatted(MIN_SEARCH_LENGTH));
        }

        Page<StoredFile> page = fileRepository.search(
                "%" + escapeLike(term) + "%",
                departmentId == null ? null : departmentId.toString(),
                // The column stores the lowercase form; see FolderCategoryConverter.
                category == null ? null : category.name().toLowerCase(Locale.ROOT),
                from,
                to,
                pageable);

        return viewsOf(page, viewer);
    }

    // ----------------------------------------------------------------------- preview

    /**
     * A presigned URL the browser renders in place.
     *
     * <p>The only difference from a download is the absent Content-Disposition, which is why
     * {@code StorageService.presignedGet} takes the filename as an argument rather than always
     * attaching one. Refused for anything a browser would not display, so "Preview" is never a
     * button that silently downloads instead.
     *
     * <p>Previewing is audited but does <em>not</em> write a {@code downloads} row: looking at a
     * document on screen is not the same act as taking a copy of it, and conflating them would make
     * the download history — which exists to answer "who has a copy of this" — meaningless.
     */
    @Transactional
    public PreviewLink previewLink(UUID fileId, User viewer) {
        StoredFile file = loadFile(fileId);

        if (!FileResponses.isPreviewable(file.getFileType())) {
            throw ApiException.badRequest(
                    "PREVIEW_UNSUPPORTED", "This kind of document can only be downloaded.");
        }

        var ttl = properties.storage().presignedUrlTtl();
        String url = storageService.presignedGet(file.getStorageKey(), ttl, null);

        auditService.record(
                viewer, AuditAction.FILE_PREVIEWED, "file", file.getId(),
                Map.of("fileName", file.getFileName()));

        return new PreviewLink(url, Instant.now().plus(ttl), file.getFileName(), file.getFileType());
    }

    /** PDFs and images only — see {@code FileResponses.FileView.previewable}. */
    public static boolean isPreviewable(String contentType) {
        return "application/pdf".equals(contentType) || contentType.startsWith("image/");
    }

    // --------------------------------------------------------------------- favorites

    /**
     * Stars a document for this user.
     *
     * <p>Idempotent: starring something already starred returns the same result rather than a
     * conflict. The unique constraint on {@code (user_id, file_id)} makes that the database's answer
     * too, so two rapid clicks cannot produce a duplicate row.
     */
    @Transactional
    public FileView addFavorite(UUID fileId, User user) {
        StoredFile file = loadFile(fileId);

        favoriteRepository.findByUserIdAndFileId(user.getId(), fileId).orElseGet(() -> {
            Favorite favorite = new Favorite();
            favorite.setUser(user);
            favorite.setFile(file);
            return favoriteRepository.save(favorite);
        });

        return FileView.from(file, file.canBeModifiedBy(user), true);
    }

    /** Un-starring something that was never starred is equally a no-op. */
    @Transactional
    public FileView removeFavorite(UUID fileId, User user) {
        StoredFile file = loadFile(fileId);
        favoriteRepository.findByUserIdAndFileId(user.getId(), fileId).ifPresent(favoriteRepository::delete);
        return FileView.from(file, file.canBeModifiedBy(user), false);
    }

    /**
     * This user's starred documents.
     *
     * <p>Deleted files are filtered out rather than shown as unavailable: a favourite is a shortcut,
     * and a shortcut to something that no longer exists is only clutter. An admin restore puts it
     * back, because the favourite row was never removed.
     */
    @Transactional(readOnly = true)
    public PageResponse<FileView> listFavorites(User user, Pageable pageable) {
        Page<Favorite> page =
                favoriteRepository.findByUserIdAndFileDeletedFalseOrderByCreatedAtDesc(user.getId(), pageable);

        return PageResponse.of(page, favorite -> {
            StoredFile file = favorite.getFile();
            return FileView.from(file, file.canBeModifiedBy(user), true);
        });
    }

    // --------------------------------------------------------------------- downloads

    /**
     * A user's own history. The rows are written by {@link FileService} at the moment it issues a
     * presigned URL, which is the last point the server is involved in a download.
     */
    @Transactional(readOnly = true)
    public PageResponse<DownloadView> listDownloads(User user, Pageable pageable) {
        return PageResponse.of(
                downloadRepository.findByUserIdOrderByCreatedAtDesc(user.getId(), pageable),
                DownloadView::from);
    }

    // ------------------------------------------------------------------------ recent

    /** Newest documents across every department, for the home dashboard. */
    @Transactional(readOnly = true)
    public PageResponse<FileView> listRecent(User viewer, Pageable pageable) {
        return viewsOf(fileRepository.findByDeletedFalse(pageable), viewer);
    }

    // ----------------------------------------------------------------------- helpers

    /**
     * Maps a page of files to views, resolving every star in one query.
     *
     * <p>Asking per row would mean a query per result — the classic N+1 — so the ids are collected
     * and looked up once.
     */
    private PageResponse<FileView> viewsOf(Page<StoredFile> page, User viewer) {
        List<UUID> ids = page.getContent().stream().map(StoredFile::getId).toList();

        Set<UUID> starred = ids.isEmpty()
                ? Set.of()
                : new HashSet<>(favoriteRepository.findFileIdsFor(viewer.getId(), ids));

        return PageResponse.of(
                page, file -> FileView.from(file, file.canBeModifiedBy(viewer), starred.contains(file.getId())));
    }

    private StoredFile loadFile(UUID fileId) {
        return fileRepository.findByIdAndDeletedFalse(fileId).orElseThrow(() -> ApiException.notFound("File"));
    }

    /**
     * Neutralises the LIKE wildcards.
     *
     * <p>Without this, searching for {@code %} matches every document in the archive, and an
     * underscore silently matches any character — both surprising rather than dangerous, but a
     * search box should look for what was typed.
     */
    private static String escapeLike(String term) {
        return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_");
    }
}
