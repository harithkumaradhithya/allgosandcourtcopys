package com.allgos.dms.file;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.allgos.dms.audit.repository.AuditLogRepository;
import com.allgos.dms.auth.repository.OtpVerificationRepository;
import com.allgos.dms.auth.repository.RegistrationRequestRepository;
import com.allgos.dms.department.entity.Department;
import com.allgos.dms.department.repository.DepartmentRepository;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.entity.FolderCategory;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Import;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Proves the description field end to end: a real scanned government order goes in over HTTP, OCR
 * runs against real Tesseract and its bundled English language data, and the Abstract paragraph
 * ends up on the stored document — not a mock standing in for any of that.
 *
 * <p>The description is no longer in the upload response. Reading a scan takes seconds and the
 * upload is not made to wait for it (see {@link
 * com.allgos.dms.file.service.DocumentEnrichmentService}), so these tests upload and then wait for
 * the row to be filled in, which is exactly what the screen does.
 *
 * <p>Both fixtures under {@code sample-documents/} are genuine scans supplied from real office use:
 * neither carries a text layer, so both exercise the OCR fallback in {@link
 * com.allgos.dms.file.service.DocumentAbstractExtractor}, not just the cheaper native-text path.
 */
@Import(RecordingOtpProvider.Config.class)
class DocumentAbstractExtractionIT extends AbstractStorageIntegrationTest {

    private static final String ADMIN_MOBILE = "9999999999"; // seeded by V3
    private static final String MEMBER_MOBILE = "9876543214";
    private static final String PASSWORD = "Str0ngPassword!";

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

    private UUID folderId;
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

        User admin = userRepository.findByMobileNumber(ADMIN_MOBILE).orElseThrow();
        admin.setStatus(UserStatus.ACTIVE);
        admin.setPasswordHash(passwordEncoder.encode(PASSWORD));
        admin.setFailedLoginCount(0);
        admin.setLockedUntil(null);
        userRepository.saveAndFlush(admin);
        String adminToken = signIn(ADMIN_MOBILE);

        Department department = departmentRepository.findByActiveTrueOrderByNameAsc().getFirst();
        memberToken = registerApproveAndSignIn(MEMBER_MOBILE, "Kavitha Selvam", department.getId(), adminToken);
        folderId = createFolder(department.getId(), "Government Orders", memberToken);
    }

    @Test
    @DisplayName("a scanned Public Works transfer order yields its Abstract paragraph via OCR")
    void extractsAbstractFromScannedTransferOrder() throws Exception {
        UUID fileId = uploadAndGetId(sample("sample-documents/go-rt-137-scanned.pdf", "GO Rt 137.pdf"));

        String description = awaitDescription(fileId);

        org.assertj.core.api.Assertions.assertThat(description)
                .contains("Transfers and Postings of Executive Engineers (Civil)")
                .endsWith("Issued.");
    }

    @Test
    @DisplayName("a scanned Finance dearness relief order yields its Abstract paragraph via OCR")
    void extractsAbstractFromScannedFinanceOrder() throws Exception {
        UUID fileId = uploadAndGetId(sample("sample-documents/go-ms-168-scanned.pdf", "GO Ms 168.pdf"));

        String description = awaitDescription(fileId);

        org.assertj.core.api.Assertions.assertThat(description)
                .contains("Interim Monthly Payout")
                .endsWith("Issued.");
    }

    /**
     * The upload answers immediately; the description lands a little later on the enrichment pool.
     * Polled rather than slept on, so a fast machine does not pay for a slow one's worst case.
     */
    private String awaitDescription(UUID fileId) throws InterruptedException {
        long deadline = System.nanoTime() + java.time.Duration.ofSeconds(60).toNanos();
        while (System.nanoTime() < deadline) {
            String description = fileRepository
                    .findById(fileId)
                    .map(com.allgos.dms.file.entity.StoredFile::getDescription)
                    .orElse(null);
            if (description != null) {
                return description;
            }
            Thread.sleep(250);
        }
        throw new AssertionError("No description was extracted for " + fileId + " within 60s");
    }

    private UUID uploadAndGetId(MockMultipartFile part) throws Exception {
        String response = upload(memberToken, part)
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("uploaded").get(0).get("id").asText());
    }

    @Test
    @DisplayName("a scanned Public Works order suggests the Public Works department and its General folder")
    void suggestsPublicWorksDepartment() throws Exception {
        // setUp()'s folderRepository.deleteAll() wipes the General folders V10 seeded for every
        // department, this one included — restore just the one this test needs.
        restoreGeneralFolder("Department of Public Works");

        mockMvc.perform(multipart("/api/v1/files/suggest-destination")
                        .file(sample("sample-documents/go-rt-137-scanned.pdf", "GO Rt 137.pdf", "file"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.departmentName").value("Department of Public Works"))
                .andExpect(jsonPath("$.folderName").value("General"));
    }

    @Test
    @DisplayName("a PDF sent with no real MIME type still gets a suggestion, from its filename")
    void suggestsFromFilenameWhenBrowserSendsNoRealContentType() throws Exception {
        // What a browser sends when Windows has no MIME type registered for .pdf at all — an empty
        // or generic declared type rather than "application/pdf", even though the bytes are a PDF.
        restoreGeneralFolder("Department of Public Works");

        try (java.io.InputStream in = new org.springframework.core.io.ClassPathResource(
                        "sample-documents/go-rt-137-scanned.pdf")
                .getInputStream()) {
            MockMultipartFile part = new MockMultipartFile(
                    "file", "GO Rt 137.pdf", "application/octet-stream", in.readAllBytes());

            mockMvc.perform(multipart("/api/v1/files/suggest-destination")
                            .file(part)
                            .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.departmentName").value("Department of Public Works"));
        }
    }

    @Test
    @DisplayName("a scanned Finance order suggests the Finance department and its General folder")
    void suggestsFinanceDepartment() throws Exception {
        restoreGeneralFolder("Department of Finance");

        mockMvc.perform(multipart("/api/v1/files/suggest-destination")
                        .file(sample("sample-documents/go-ms-168-scanned.pdf", "GO Ms 168.pdf", "file"))
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.departmentName").value("Department of Finance"))
                .andExpect(jsonPath("$.folderName").value("General"));
    }

    // ------------------------------------------------------------------------ helpers

    private org.springframework.test.web.servlet.ResultActions upload(String token, MockMultipartFile part)
            throws Exception {
        return mockMvc.perform(multipart("/api/v1/files")
                .file(part)
                .param("folderId", folderId.toString())
                .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    private static MockMultipartFile sample(String classpathLocation, String uploadedAs) throws Exception {
        return sample(classpathLocation, uploadedAs, "files");
    }

    /** The upload endpoint's part is named "files"; suggest-destination's is the singular "file". */
    private static MockMultipartFile sample(String classpathLocation, String uploadedAs, String partName)
            throws Exception {
        try (InputStream in = new ClassPathResource(classpathLocation).getInputStream()) {
            return new MockMultipartFile(partName, uploadedAs, "application/pdf", in.readAllBytes());
        }
    }

    private void restoreGeneralFolder(String departmentName) {
        Department department = departmentRepository.findByName(departmentName).orElseThrow();
        if (folderRepository
                .findByDepartmentIdAndParentIsNullAndNameIgnoreCase(department.getId(), "General")
                .isPresent()) {
            return;
        }
        Folder general = new Folder();
        general.setDepartment(department);
        general.setName("General");
        general.setCategory(FolderCategory.GENERAL);
        folderRepository.save(general);
    }

    private UUID createFolder(UUID departmentId, String name, String token) throws Exception {
        String response = mockMvc.perform(post("/api/v1/departments/{id}/folders", departmentId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("name", name, "category", "GOVT_ORDER"))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return UUID.fromString(objectMapper.readTree(response).get("id").asText());
    }

    private String registerApproveAndSignIn(String mobile, String name, UUID departmentId, String adminToken)
            throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", name,
                                "mobileNumber", mobile,
                                "departmentId", departmentId.toString(),
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
