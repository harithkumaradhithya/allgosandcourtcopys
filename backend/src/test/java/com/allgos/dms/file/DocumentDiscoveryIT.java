package com.allgos.dms.file;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.repository.AuditLogRepository;
import com.allgos.dms.auth.repository.OtpVerificationRepository;
import com.allgos.dms.auth.repository.RegistrationRequestRepository;
import com.allgos.dms.department.entity.Department;
import com.allgos.dms.department.repository.DepartmentRepository;
import com.allgos.dms.file.repository.DownloadRepository;
import com.allgos.dms.file.repository.FavoriteRepository;
import com.allgos.dms.file.repository.FileDeletionRepository;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.folder.repository.FolderRepository;
import com.allgos.dms.notification.repository.NotificationRepository;
import com.allgos.dms.support.AbstractStorageIntegrationTest;
import com.allgos.dms.support.RecordingOtpProvider;
import com.allgos.dms.user.entity.User;
import com.allgos.dms.user.entity.UserStatus;
import com.allgos.dms.user.repository.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Finding documents once they have been filed: search, preview, favourites, download history and
 * the notification bell.
 *
 * <p>The claims worth proving here are the ones that would otherwise be believed on inspection:
 *
 * <ol>
 *   <li>search finds a document by a fragment of its name, and spans every department (rule 2);
 *   <li>a deleted document never appears in results, favourites or search;
 *   <li>a preview URL is <b>inline</b> — no {@code attachment} disposition — and is refused for
 *       anything a browser cannot render;
 *   <li>a download writes a history row the user can read back;
 *   <li>notifications are scoped to their owner, and someone else's cannot be marked read.
 * </ol>
 */
@Import(RecordingOtpProvider.Config.class)
class DocumentDiscoveryIT extends AbstractStorageIntegrationTest {

    private static final String ADMIN_MOBILE = "9999999999"; // seeded by V3
    private static final String MEMBER_MOBILE = "9876543214";
    private static final String OTHER_MEMBER_MOBILE = "9876543215";
    private static final String PASSWORD = "Str0ngPassword!";

    private static final byte[] REAL_PDF =
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"
                    .getBytes(StandardCharsets.US_ASCII);

    /** A one-pixel PNG: previewable, and a second content type for the preview rules. */
    private static final byte[] REAL_PNG = java.util.Base64.getDecoder()
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private DepartmentRepository departmentRepository;
    @Autowired private FolderRepository folderRepository;
    @Autowired private StoredFileRepository fileRepository;
    @Autowired private FileDeletionRepository deletionRepository;
    @Autowired private DownloadRepository downloadRepository;
    @Autowired private FavoriteRepository favoriteRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private RegistrationRequestRepository registrationRequestRepository;
    @Autowired private OtpVerificationRepository otpVerificationRepository;
    @Autowired private RecordingOtpProvider otpProvider;

    private Department ownDepartment;
    private Department otherDepartment;
    private UUID folderId;
    private UUID otherFolderId;
    private String adminToken;
    private String memberToken;

    @BeforeEach
    void setUp() throws Exception {
        ensureBucket();

        otpProvider.clear();
        downloadRepository.deleteAll();
        favoriteRepository.deleteAll();
        deletionRepository.deleteAll();
        fileRepository.deleteAll();
        folderRepository.deleteAll();
        auditLogRepository.deleteAll();
        notificationRepository.deleteAll();
        registrationRequestRepository.deleteAll();
        otpVerificationRepository.deleteAll();
        userRepository.findByMobileNumber(MEMBER_MOBILE).ifPresent(userRepository::delete);
        userRepository.findByMobileNumber(OTHER_MEMBER_MOBILE).ifPresent(userRepository::delete);

        // The seeded admin has no password of its own — in production the operator sets one through
        // the OTP reset before first use. Here it is given one directly, so these tests can sign in
        // the same way every other account does.
        User admin = userRepository.findByMobileNumber(ADMIN_MOBILE).orElseThrow();
        admin.setStatus(UserStatus.ACTIVE);
        admin.setPasswordHash(passwordEncoder.encode(PASSWORD));
        admin.setFailedLoginCount(0);
        admin.setLockedUntil(null);
        userRepository.saveAndFlush(admin);

        List<Department> departments = departmentRepository.findByActiveTrueOrderByNameAsc();
        ownDepartment = departments.get(0);
        otherDepartment = departments.get(1);

        adminToken = signIn(ADMIN_MOBILE);
        memberToken = registerApproveAndSignIn(MEMBER_MOBILE, "Meena Rajan");

        folderId = createFolder(otherDepartment.getId(), "Circulars 2026", memberToken);
        otherFolderId = createFolder(ownDepartment.getId(), "Court Orders 2026", memberToken);
    }

    // ------------------------------------------------------------------------ search

    @Test
    @DisplayName("search finds a document by part of its name, across departments")
    void searchMatchesOnAFragmentOfTheName() throws Exception {
        upload(folderId, memberToken, pdf("Government Order 118 of 2026.pdf"));
        upload(otherFolderId, memberToken, pdf("Writ Petition 4432.pdf"));

        // A fragment from the middle, which is what the trigram index exists to serve.
        search("Order 118", memberToken)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].fileName").value("Government Order 118 of 2026.pdf"));

        // Case-insensitive.
        search("writ petition", memberToken)
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].fileName").value("Writ Petition 4432.pdf"));

        // Both documents are in different departments and both are found — rule 2.
        search("2026", memberToken).andExpect(jsonPath("$.totalItems").value(1));
        search("4432", memberToken).andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    @DisplayName("the department and category facets narrow the results")
    void facetsNarrowTheSearch() throws Exception {
        upload(folderId, memberToken, pdf("Circular 42 of 2026.pdf"));
        upload(otherFolderId, memberToken, pdf("Circular 43 of 2026.pdf"));

        search("Circular", memberToken).andExpect(jsonPath("$.totalItems").value(2));

        mockMvc.perform(get("/api/v1/files/search")
                        .param("q", "Circular")
                        .param("departmentId", otherDepartment.getId().toString())
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].fileName").value("Circular 42 of 2026.pdf"));

        // Both folders were created as CIRCULAR, so the category facet matches both...
        mockMvc.perform(get("/api/v1/files/search")
                        .param("q", "Circular")
                        .param("category", "CIRCULAR")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(2));

        // ...and a category nothing is filed under matches none.
        mockMvc.perform(get("/api/v1/files/search")
                        .param("q", "Circular")
                        .param("category", "CONTRACT")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(0));

        mockMvc.perform(get("/api/v1/files/search")
                        .param("q", "Circular")
                        .param("category", "banana")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("CATEGORY_INVALID"));
    }

    @Test
    @DisplayName("a deleted document disappears from search")
    void searchIgnoresDeletedDocuments() throws Exception {
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42 of 2026.pdf");
        search("Circular", memberToken).andExpect(jsonPath("$.totalItems").value(1));

        deleteFile(fileId, "Filed in the wrong folder", memberToken).andExpect(status().isOk());

        search("Circular", memberToken).andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    @DisplayName("a one-character search is refused, and wildcards are matched literally")
    void searchGuardsAgainstUselessQueries() throws Exception {
        upload(folderId, memberToken, pdf("Circular 42.pdf"));

        mockMvc.perform(get("/api/v1/files/search").param("q", "C")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("SEARCH_TOO_SHORT"));

        // "%%" would match everything if the wildcards reached SQL unescaped.
        search("%%", memberToken).andExpect(status().isOk()).andExpect(jsonPath("$.totalItems").value(0));
    }

    // ----------------------------------------------------------------------- preview

    @Test
    @DisplayName("a preview URL is inline, and a download URL is an attachment")
    void previewIsInlineAndDownloadIsAnAttachment() throws Exception {
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42.pdf");

        String previewUrl = jsonField(
                mockMvc.perform(get("/api/v1/files/{id}/preview-link", fileId)
                                .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.fileType").value("application/pdf"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "url");

        // Signed and expiring, like every other route to the bytes...
        assertThat(previewUrl).contains("X-Amz-Signature").contains("X-Amz-Expires");
        // ...but with no disposition, which is the whole difference: the browser renders it.
        assertThat(previewUrl).doesNotContain("response-content-disposition");

        String downloadUrl = jsonField(
                mockMvc.perform(get("/api/v1/files/{id}/download-link", fileId)
                                .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString(),
                "url");

        assertThat(downloadUrl).contains("response-content-disposition");

        assertThat(auditLogRepository.findAll())
                .anyMatch(entry -> AuditAction.FILE_PREVIEWED.equals(entry.getAction()));
    }

    @Test
    @DisplayName("previewable is true for PDFs and images, and previewing anything else is refused")
    void onlyRenderableTypesArePreviewable() throws Exception {
        UUID pdfId = uploadOne(folderId, memberToken, "Circular 42.pdf");
        UUID pngId = uploadOne(
                folderId, memberToken, new MockMultipartFile("files", "Seal.png", "image/png", REAL_PNG));

        mockMvc.perform(get("/api/v1/files/{id}", pdfId).header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.previewable").value(true));
        mockMvc.perform(get("/api/v1/files/{id}", pngId).header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.previewable").value(true));
        mockMvc.perform(get("/api/v1/files/{id}/preview-link", pngId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk());

        UUID docId = uploadOne(
                folderId,
                memberToken,
                new MockMultipartFile(
                        "files",
                        "Minutes.doc",
                        "application/msword",
                        // An OLE2 compound-document signature, which Tika reads as a Word file.
                        new byte[] {
                            (byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0,
                            (byte) 0xA1, (byte) 0xB1, 0x1A, (byte) 0xE1, 0, 0, 0, 0
                        }));

        mockMvc.perform(get("/api/v1/files/{id}", docId).header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.previewable").value(false));
        mockMvc.perform(get("/api/v1/files/{id}/preview-link", docId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("PREVIEW_UNSUPPORTED"));
    }

    // --------------------------------------------------------------------- favorites

    @Test
    @DisplayName("starring is private, idempotent, and survives a replacement")
    void favoritesArePrivateAndIdempotent() throws Exception {
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42.pdf");
        String otherToken = registerApproveAndSignIn(OTHER_MEMBER_MOBILE, "Arun Kumar");

        favorite(fileId, memberToken).andExpect(status().isOk()).andExpect(jsonPath("$.favorite").value(true));
        // Twice is not a conflict — a double click is not a mistake worth reporting.
        favorite(fileId, memberToken).andExpect(status().isOk()).andExpect(jsonPath("$.favorite").value(true));
        assertThat(favoriteRepository.count()).isEqualTo(1);

        mockMvc.perform(get("/api/v1/favorites").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].fileName").value("Circular 42.pdf"));

        // Another member's list is unaffected, and their view of the file shows no star.
        mockMvc.perform(get("/api/v1/favorites").header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(jsonPath("$.totalItems").value(0));
        mockMvc.perform(get("/api/v1/folders/{id}/files", folderId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(jsonPath("$.items[0].favorite").value(false));

        // The star follows the document through a replacement, because the id does not change.
        mockMvc.perform(multipart("/api/v1/files/{id}/replace", fileId)
                        .file(new MockMultipartFile("file", "Circular 42 (revised).pdf", "application/pdf", REAL_PDF))
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/favorites").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].fileName").value("Circular 42 (revised).pdf"));

        unfavorite(fileId, memberToken).andExpect(status().isOk()).andExpect(jsonPath("$.favorite").value(false));
        mockMvc.perform(get("/api/v1/favorites").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(0));
    }

    @Test
    @DisplayName("a deleted document leaves the favourites list, and a restore brings it back")
    void favoritesHideDeletedDocuments() throws Exception {
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42.pdf");
        favorite(fileId, memberToken).andExpect(status().isOk());

        deleteFile(fileId, "Wrong folder", memberToken).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/favorites").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(0));
        // The row was never removed, which is what makes the restore complete.
        assertThat(favoriteRepository.count()).isEqualTo(1);

        mockMvc.perform(post("/api/v1/admin/files/{id}/restore", fileId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/favorites").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    // --------------------------------------------------------------------- downloads

    @Test
    @DisplayName("a download is written to the caller's history, and stays there after a deletion")
    void downloadHistoryIsPerUserAndKeepsDeletedRows() throws Exception {
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42.pdf");
        String otherToken = registerApproveAndSignIn(OTHER_MEMBER_MOBILE, "Arun Kumar");

        mockMvc.perform(get("/api/v1/files/{id}/download-link", fileId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(status().isOk());

        // The history belongs to whoever asked for the link, not to whoever uploaded it.
        mockMvc.perform(get("/api/v1/downloads").header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].fileName").value("Circular 42.pdf"))
                .andExpect(jsonPath("$.items[0].available").value(true));

        mockMvc.perform(get("/api/v1/downloads").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(0));

        deleteFile(fileId, "Superseded", memberToken).andExpect(status().isOk());

        // A history that dropped rows when a document was removed would not be a history.
        mockMvc.perform(get("/api/v1/downloads").header(HttpHeaders.AUTHORIZATION, bearer(otherToken)))
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].available").value(false));
    }

    @Test
    @DisplayName("previewing does not count as taking a copy")
    void previewingWritesNoDownloadRow() throws Exception {
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42.pdf");

        mockMvc.perform(get("/api/v1/files/{id}/preview-link", fileId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk());

        assertThat(downloadRepository.count()).isZero();
    }

    // ----------------------------------------------------------------- notifications

    @Test
    @DisplayName("the bell counts a user's own unread notifications and marking one read sticks")
    void notificationsAreScopedToTheirOwner() throws Exception {
        // setUp registers a member and the upload below announces itself to everyone. Both are real
        // behaviour, not noise — but neither is what this test is about, so the slate is cleared
        // between them and the counts below are exactly what the deletion produces.
        UUID fileId = uploadOne(folderId, memberToken, "Circular 42.pdf");
        notificationRepository.deleteAll();

        // A deletion by the member notifies everyone else — a real event rather than a fixture.
        deleteFile(fileId, "Filed in the wrong department", memberToken).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(1));

        // The member who did it is not notified about their own action.
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.unread").value(0));

        String body = mockMvc.perform(get("/api/v1/notifications")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].read").value(false))
                .andExpect(jsonPath("$.items[0].entityRef").value("file:" + fileId))
                .andReturn()
                .getResponse()
                .getContentAsString();

        UUID notificationId =
                UUID.fromString(objectMapper.readTree(body).get("items").get(0).get("id").asText());

        // Someone else's notification does not exist as far as this caller is concerned.
        mockMvc.perform(post("/api/v1/notifications/{id}/read", notificationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.unread").value(1));

        mockMvc.perform(post("/api/v1/notifications/{id}/read", notificationId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.read").value(true));

        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.unread").value(0));

        // The unread filter and the full list now differ, which is the point of the filter.
        mockMvc.perform(get("/api/v1/notifications").param("unread", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.totalItems").value(0));
        mockMvc.perform(get("/api/v1/notifications")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    @DisplayName("the category filter narrows the list, and the options offered depend on the role")
    void notificationsCanBeFilteredByCategory() throws Exception {
        // Two real events of different kinds, both landing in the admin's inbox: an upload by the
        // member, then the member deleting it again. The slate is cleared first so the setUp
        // registration is not counted among them.
        notificationRepository.deleteAll();
        UUID fileId = uploadOne(folderId, memberToken, "Circular 44.pdf");
        deleteFile(fileId, "Filed in the wrong department", memberToken).andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/notifications")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.totalItems").value(2));

        mockMvc.perform(get("/api/v1/notifications").param("category", "deletions")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].type").value("file_deleted"));

        mockMvc.perform(get("/api/v1/notifications").param("category", "uploads")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].type").value("file_uploaded"));

        // Two categories widen the list rather than narrowing it to their intersection.
        mockMvc.perform(get("/api/v1/notifications")
                        .param("category", "uploads")
                        .param("category", "deletions")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.totalItems").value(2));

        // A category nobody has been sent anything in is an empty list, not an error.
        mockMvc.perform(get("/api/v1/notifications").param("category", "announcements")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(0));

        // A stale bookmark carrying a category that no longer exists shows the whole list.
        mockMvc.perform(get("/api/v1/notifications").param("category", "not-a-category")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(2));

        // The filters are combinable: unread deletions only.
        mockMvc.perform(get("/api/v1/notifications")
                        .param("category", "deletions")
                        .param("unread", "true")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.totalItems").value(1));

        // Registration requests are only ever sent to admins, so only an admin is offered the
        // filter for them. Everything else is offered to both.
        mockMvc.perform(get("/api/v1/notifications/categories")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == 'registrations')]").isNotEmpty())
                .andExpect(jsonPath("$[?(@.id == 'deletions')]").isNotEmpty());

        mockMvc.perform(get("/api/v1/notifications/categories")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.id == 'registrations')]").isEmpty())
                .andExpect(jsonPath("$[?(@.id == 'deletions')]").isNotEmpty());
    }

    @Test
    @DisplayName("read-all clears the badge in one call")
    void readAllClearsEverythingUnread() throws Exception {
        // As above: the registration in setUp and the two uploads all notify legitimately, and
        // this test is about the two deletions.
        UUID first = uploadOne(folderId, memberToken, "Circular 42.pdf");
        UUID second = uploadOne(folderId, memberToken, "Circular 43.pdf");
        notificationRepository.deleteAll();

        deleteFile(first, "One", memberToken);
        deleteFile(second, "Two", memberToken);

        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.unread").value(2));

        mockMvc.perform(post("/api/v1/notifications/read-all")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unread").value(0));

        mockMvc.perform(get("/api/v1/notifications/unread-count")
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.unread").value(0));
    }

    @Test
    @DisplayName("discovery endpoints all require authentication")
    void discoveryRequiresAuthentication() throws Exception {
        mockMvc.perform(get("/api/v1/files/search").param("q", "circular")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/favorites")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/downloads")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/notifications")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------------ helpers

    private ResultActions search(String query, String token) throws Exception {
        return mockMvc.perform(get("/api/v1/files/search")
                .param("q", query)
                .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions favorite(UUID fileId, String token) throws Exception {
        return mockMvc.perform(
                post("/api/v1/files/{id}/favorite", fileId).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions unfavorite(UUID fileId, String token) throws Exception {
        return mockMvc.perform(
                delete("/api/v1/files/{id}/favorite", fileId).header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private ResultActions upload(UUID targetFolderId, String token, MockMultipartFile part) throws Exception {
        return mockMvc.perform(multipart("/api/v1/files")
                .file(part)
                .param("folderId", targetFolderId.toString())
                .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private UUID uploadOne(UUID targetFolderId, String token, String filename) throws Exception {
        return uploadOne(targetFolderId, token, pdf(filename));
    }

    private UUID uploadOne(UUID targetFolderId, String token, MockMultipartFile part) throws Exception {
        String body = upload(targetFolderId, token, part)
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        JsonNode uploaded = objectMapper.readTree(body).get("uploaded");
        assertThat(uploaded).hasSize(1);
        return UUID.fromString(uploaded.get(0).get("id").asText());
    }

    private ResultActions deleteFile(UUID fileId, String reason, String token) throws Exception {
        return mockMvc.perform(delete("/api/v1/files/{id}", fileId)
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of("reason", reason))));
    }

    private UUID createFolder(UUID departmentId, String name, String token) throws Exception {
        String response = mockMvc.perform(post("/api/v1/departments/{id}/folders", departmentId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("name", name, "category", "CIRCULAR"))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return UUID.fromString(objectMapper.readTree(response).get("id").asText());
    }

    private String jsonField(String body, String field) throws Exception {
        return objectMapper.readTree(body).get(field).asText();
    }

    private static MockMultipartFile pdf(String filename) {
        return new MockMultipartFile("files", filename, "application/pdf", REAL_PDF);
    }

    private String registerApproveAndSignIn(String mobile, String name) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", name,
                                "mobileNumber", mobile,
                                "departmentId", ownDepartment.getId().toString(),
                                "designation", "Section Officer",
                                "password", PASSWORD))))
                .andExpect(status().isOk());

        UUID applicantId = userRepository.findByMobileNumber(mobile).orElseThrow().getId();
        UUID requestId = registrationRequestRepository
                .findFirstByUserIdOrderByCreatedAtDesc(applicantId)
                .orElseThrow()
                .getId();

        mockMvc.perform(post("/api/v1/admin/registration-requests/{id}/approve", requestId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk());

        return signIn(mobile);
    }

    /** A password sign-in, exactly as a user performs it, returning the access token. */
    private String signIn(String mobile) throws Exception {
        String body = mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("mobileNumber", mobile, "password", PASSWORD))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        return objectMapper.readTree(body).get("accessToken").asText();
    }

    private static String bearer(String token) {
        return "Bearer " + token;
    }
}
