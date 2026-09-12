package com.allgos.dms.ad;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.allgos.dms.ad.entity.Ad;
import com.allgos.dms.ad.repository.AdRepository;
import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.repository.AuditLogRepository;
import com.allgos.dms.auth.repository.RegistrationRequestRepository;
import com.allgos.dms.department.entity.Department;
import com.allgos.dms.department.repository.DepartmentRepository;
import com.allgos.dms.support.AbstractStorageIntegrationTest;
import com.allgos.dms.user.entity.User;
import com.allgos.dms.user.entity.UserStatus;
import com.allgos.dms.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;

/**
 * The adverts: configured by an administrator, read by everybody, and unable to become a nuisance.
 *
 * <p>Three groups of rules are worth proving here rather than trusting to the screen.
 *
 * <ul>
 *   <li><b>Who may do what.</b> Every signed-in user reads the slots; only an administrator writes
 *       to them, because an advert is the one thing in this application a reader did not ask for.
 *   <li><b>What is actually showing.</b> Switched off, not yet started and already finished are
 *       three different reasons for an advert to be absent, and all three must keep it out of the
 *       member's list while leaving it in the administrator's.
 *   <li><b>What may be uploaded.</b> The bytes decide the kind, not the filename — the same rule
 *       that guards documents — and the media of an advert that is replaced or deleted does not
 *       stay behind in the bucket.
 * </ul>
 */
class AdIT extends AbstractStorageIntegrationTest {

    private static final String ADMIN_MOBILE = "9999999999"; // seeded by V3
    private static final String MEMBER_MOBILE = "9876543218";
    private static final String PASSWORD = "Str0ngPassword!";

    /** A real 1x1 PNG: Tika reads the signature, so a made-up byte array would be refused. */
    private static final byte[] PNG = Base64.getDecoder()
            .decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==");

    private static final byte[] GIF = Base64.getDecoder()
            .decode("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");

    /**
     * An MP4's opening `ftyp` box, which is the whole of what a detector looks at.
     *
     * <p>There are no frames after it — this proves the type is read from the container signature,
     * which is what decides whether the browser is handed a {@code <video>} or an {@code <img>}.
     */
    private static final byte[] MP4 = Base64.getDecoder().decode("AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=");

    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private DepartmentRepository departmentRepository;
    @Autowired private AdRepository adRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private RegistrationRequestRepository registrationRequestRepository;

    private String adminToken;
    private String memberToken;
    private Department department;

    @BeforeEach
    void setUp() throws Exception {
        ensureBucket();
        adRepository.deleteAll();
        auditLogRepository.deleteAll();
        registrationRequestRepository.deleteAll();
        userRepository.findByMobileNumber(MEMBER_MOBILE).ifPresent(userRepository::delete);

        department = departmentRepository.findByActiveTrueOrderByNameAsc().getFirst();

        User admin = userRepository.findByMobileNumber(ADMIN_MOBILE).orElseThrow();
        admin.setStatus(UserStatus.ACTIVE);
        admin.setPasswordHash(passwordEncoder.encode(PASSWORD));
        admin.setFailedLoginCount(0);
        admin.setLockedUntil(null);
        userRepository.saveAndFlush(admin);
        adminToken = signIn(ADMIN_MOBILE);

        memberToken = registerApproveAndSignIn(MEMBER_MOBILE, "Vaidehi Raman");
    }

    // ------------------------------------------------------------------------ the happy path

    @Test
    @DisplayName("an admin creates an advert and every member sees it in its slot")
    void anAdvertAppearsInItsSlot() throws Exception {
        create(adminToken, advert(), PNG, "banner.png")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Training week"))
                .andExpect(jsonPath("$.mediaKind").value("IMAGE"))
                .andExpect(jsonPath("$.live").value(true));

        mockMvc.perform(get("/api/v1/ads").param("placement", "HOME")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].headline").value("Records training, 3–7 March"))
                // The popup copy travels with the card, so opening it costs no second request.
                .andExpect(jsonPath("$[0].detailTitle").value("Records management training"))
                .andExpect(jsonPath("$[0].detailBody").value(org.hamcrest.Matchers.containsString("Seats are limited")))
                // Nothing about the schedule, the counters or where the bytes live.
                .andExpect(jsonPath("$[0].title").doesNotExist())
                .andExpect(jsonPath("$[0].viewCount").doesNotExist())
                .andExpect(jsonPath("$[0].mediaKey").doesNotExist());
    }

    @Test
    @DisplayName("the media arrives as a signed, expiring URL rather than a bucket path")
    void mediaIsHandedOutPresigned() throws Exception {
        create(adminToken, advert(), PNG, "banner.png").andExpect(status().isOk());

        String url = objectMapper
                .readTree(readSlot(memberToken, "HOME"))
                .get(0)
                .get("mediaUrl")
                .asText();

        // The query string is the signature. Without it the same URL is a public object read, which
        // is the one thing a bucket holding court orders must never serve.
        assertThat(url).contains("X-Amz-Signature").contains("X-Amz-Expires");
    }

    @Test
    @DisplayName("an advert is filed by what its bytes are, not by what it is called")
    void theKindComesFromTheBytes() throws Exception {
        create(adminToken, advert(), GIF, "animation.gif")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mediaKind").value("GIF"))
                .andExpect(jsonPath("$.mediaContentType").value("image/gif"));
    }

    @Test
    @DisplayName("a video is carried, and the settings that could make it a nuisance travel with it")
    void videoAdvertsCarryTheirMotionSettings() throws Exception {
        Map<String, Object> film = advert();
        film.put("autoplay", false);
        film.put("loopMedia", false);

        create(adminToken, film, MP4, "clip.mp4")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mediaKind").value("VIDEO"))
                .andExpect(jsonPath("$.mediaContentType").value("video/mp4"));

        // The reader's copy carries them too — the slot cannot decide to autoplay on its own. There
        // is deliberately no field anywhere in this payload that could turn sound on.
        mockMvc.perform(get("/api/v1/ads").param("placement", "HOME")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$[0].mediaKind").value("VIDEO"))
                .andExpect(jsonPath("$[0].autoplay").value(false))
                .andExpect(jsonPath("$[0].loopMedia").value(false))
                .andExpect(jsonPath("$[0].muted").doesNotExist())
                .andExpect(jsonPath("$[0].sound").doesNotExist());
    }

    // ------------------------------------------------------------------ what is actually showing

    @Test
    @DisplayName("switched off, not yet started and already finished all stay out of the slot")
    void onlyLiveAdvertsAreShown() throws Exception {
        Map<String, Object> off = advert();
        off.put("active", false);
        create(adminToken, off, PNG, "off.png").andExpect(status().isOk());

        Map<String, Object> later = advert();
        later.put("startsAt", Instant.now().plus(7, ChronoUnit.DAYS).toString());
        create(adminToken, later, PNG, "later.png").andExpect(status().isOk());

        Map<String, Object> over = advert();
        over.put("startsAt", Instant.now().minus(30, ChronoUnit.DAYS).toString());
        over.put("endsAt", Instant.now().minus(1, ChronoUnit.DAYS).toString());
        create(adminToken, over, PNG, "over.png").andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/ads").param("placement", "HOME")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.length()").value(0));

        // All three are still the administrator's to see, and none of them claims to be live.
        mockMvc.perform(get("/api/v1/admin/ads").header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[?(@.live == true)]").isEmpty());
    }

    @Test
    @DisplayName("a slot shows only its own adverts")
    void slotsDoNotBleedIntoEachOther() throws Exception {
        create(adminToken, advert(), PNG, "home.png").andExpect(status().isOk());

        Map<String, Object> rail = advert();
        rail.put("placement", "SIDEBAR");
        rail.put("headline", "In the rail");
        create(adminToken, rail, PNG, "rail.png").andExpect(status().isOk());

        mockMvc.perform(get("/api/v1/ads").param("placement", "SIDEBAR")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].headline").value("In the rail"));
    }

    @Test
    @DisplayName("views and clicks are counted, and a stale advert does not error")
    void countersAreRecorded() throws Exception {
        UUID id = idOf(create(adminToken, advert(), PNG, "banner.png"));

        record(id, "view");
        record(id, "view");
        record(id, "click");

        Ad stored = adRepository.findById(id).orElseThrow();
        assertThat(stored.getViewCount()).isEqualTo(2);
        assertThat(stored.getClickCount()).isEqualTo(1);

        // A slot can be holding an advert that was deleted a moment ago. Counting a view for it must
        // not put an error on somebody's Home screen.
        record(UUID.randomUUID(), "view");
    }

    // ----------------------------------------------------------------------------- refusals

    @Test
    @DisplayName("a member reads the slots but cannot put anything in them")
    void membersCannotMaintainAdverts() throws Exception {
        UUID id = idOf(create(adminToken, advert(), PNG, "banner.png"));

        create(memberToken, advert(), PNG, "sneaky.png").andExpect(status().isForbidden());

        mockMvc.perform(multipart(HttpMethod.PUT, "/api/v1/admin/ads/{id}", id)
                        .file(jsonPart(advert()))
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(delete("/api/v1/admin/ads/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(get("/api/v1/admin/ads").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isForbidden());

        assertThat(adRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("an executable renamed to .png is not an advert")
    void disguisedUploadsAreRefused() throws Exception {
        byte[] executable = "MZ  this is a Windows binary".getBytes(StandardCharsets.ISO_8859_1);

        create(adminToken, advert(), executable, "banner.png")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AD_MEDIA_CONTENT_MISMATCH"));

        create(adminToken, advert(), PNG, "banner.pdf")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AD_MEDIA_TYPE_NOT_ALLOWED"));

        assertThat(adRepository.count()).isZero();
    }

    @Test
    @DisplayName("a button needs both a label and an address, and the address must be a web one")
    void theButtonIsCheckedAsAPair() throws Exception {
        Map<String, Object> labelOnly = advert();
        labelOnly.put("ctaLabel", "Book a place");
        create(adminToken, labelOnly, PNG, "banner.png")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AD_CTA_INCOMPLETE"));

        // The one field of an advert that becomes a live link in somebody else's browser.
        Map<String, Object> script = advert();
        script.put("ctaLabel", "Book a place");
        script.put("ctaUrl", "javascript:alert(document.cookie)");
        create(adminToken, script, PNG, "banner.png")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));

        Map<String, Object> proper = advert();
        proper.put("ctaLabel", "Book a place");
        proper.put("ctaUrl", "https://tn.gov.in/training");
        create(adminToken, proper, PNG, "banner.png").andExpect(status().isOk());
    }

    @Test
    @DisplayName("an advert that would end before it began is refused")
    void theWindowMustMakeSense() throws Exception {
        Map<String, Object> backwards = advert();
        backwards.put("startsAt", Instant.now().plus(7, ChronoUnit.DAYS).toString());
        backwards.put("endsAt", Instant.now().plus(1, ChronoUnit.DAYS).toString());

        create(adminToken, backwards, PNG, "banner.png")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("AD_WINDOW_INVALID"));
    }

    @Test
    @DisplayName("an advert without a description of its media is refused")
    void theMediaMustBeDescribed() throws Exception {
        Map<String, Object> mute = advert();
        mute.put("altText", "  ");

        create(adminToken, mute, PNG, "banner.png")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
    }

    @Test
    @DisplayName("signed out, the slots are not readable at all")
    void advertsAreNotPublic() throws Exception {
        mockMvc.perform(get("/api/v1/ads").param("placement", "HOME")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/ads")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------------ the bucket

    @Test
    @DisplayName("replacing the media sweeps the object nothing points at any more")
    void replacedMediaIsRemoved() throws Exception {
        UUID id = idOf(create(adminToken, advert(), PNG, "banner.png"));
        String originalKey = adRepository.findById(id).orElseThrow().getMediaKey();
        assertThat(objectExists(originalKey)).isTrue();

        mockMvc.perform(multipart(HttpMethod.PUT, "/api/v1/admin/ads/{id}", id)
                        .file(jsonPart(advert()))
                        .file(new MockMultipartFile("media", "replacement.gif", "image/gif", GIF))
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mediaKind").value("GIF"));

        String newKey = adRepository.findById(id).orElseThrow().getMediaKey();
        assertThat(newKey).isNotEqualTo(originalKey);
        assertThat(objectExists(newKey)).isTrue();
        assertThat(objectExists(originalKey)).isFalse();
    }

    @Test
    @DisplayName("an edit that changes only the wording keeps the media it already has")
    void editingTheWordingDoesNotRequireAnUpload() throws Exception {
        UUID id = idOf(create(adminToken, advert(), PNG, "banner.png"));
        String key = adRepository.findById(id).orElseThrow().getMediaKey();

        Map<String, Object> corrected = advert();
        corrected.put("headline", "Records training, 10–14 March");

        mockMvc.perform(multipart(HttpMethod.PUT, "/api/v1/admin/ads/{id}", id)
                        .file(jsonPart(corrected))
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.headline").value("Records training, 10–14 March"));

        assertThat(adRepository.findById(id).orElseThrow().getMediaKey()).isEqualTo(key);
        assertThat(objectExists(key)).isTrue();
    }

    @Test
    @DisplayName("deleting an advert takes its media with it, and says who removed what")
    void deletingRemovesTheMediaToo() throws Exception {
        UUID id = idOf(create(adminToken, advert(), PNG, "banner.png"));
        String key = adRepository.findById(id).orElseThrow().getMediaKey();

        mockMvc.perform(delete("/api/v1/admin/ads/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isNoContent());

        assertThat(adRepository.count()).isZero();
        assertThat(objectExists(key)).isFalse();
        assertThat(auditLogRepository.findAll())
                .anyMatch(entry -> AuditAction.AD_DELETED.equals(entry.getAction()));
    }

    // ------------------------------------------------------------------------- helpers

    /** A complete, valid advert. Tests copy it and change the one thing they are about. */
    private Map<String, Object> advert() {
        Map<String, Object> body = new HashMap<>();
        body.put("title", "Training week");
        body.put("placement", "HOME");
        body.put("altText", "Poster for the records management training week");
        body.put("headline", "Records training, 3–7 March");
        body.put("caption", "Open to every section");
        body.put("detailTitle", "Records management training");
        body.put("detailBody", "A week of sessions at the district office.\n\nSeats are limited.");
        body.put("autoplay", true);
        body.put("loopMedia", true);
        body.put("dismissible", true);
        body.put("active", true);
        body.put("displayOrder", 0);
        return body;
    }

    private ResultActions create(String token, Map<String, Object> body, byte[] media, String filename)
            throws Exception {
        return mockMvc.perform(multipart("/api/v1/admin/ads")
                .file(jsonPart(body))
                .file(new MockMultipartFile("media", filename, "application/octet-stream", media))
                .header(HttpHeaders.AUTHORIZATION, bearer(token)));
    }

    /**
     * The wording, as a JSON part.
     *
     * <p>The content type matters: without it the part arrives as text and Spring refuses to bind it
     * to the validated record, which fails as a 415 that says nothing about the advert.
     */
    private MockMultipartFile jsonPart(Map<String, Object> body) throws Exception {
        return new MockMultipartFile(
                "ad", "", MediaType.APPLICATION_JSON_VALUE, objectMapper.writeValueAsBytes(body));
    }

    private void record(UUID adId, String what) throws Exception {
        mockMvc.perform(post("/api/v1/ads/{id}/{what}", adId, what)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isNoContent());
    }

    private String readSlot(String token, String placement) throws Exception {
        return mockMvc.perform(get("/api/v1/ads").param("placement", placement)
                        .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
    }

    private UUID idOf(ResultActions created) throws Exception {
        String body = created.andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(objectMapper.readTree(body).get("id").asText());
    }

    private String registerApproveAndSignIn(String mobile, String name) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", name,
                                "mobileNumber", mobile,
                                "departmentId", department.getId().toString(),
                                "designation", "Section Officer",
                                "password", PASSWORD))))
                .andExpect(status().isOk());

        User applicant = userRepository.findByMobileNumber(mobile).orElseThrow();
        applicant.setStatus(UserStatus.ACTIVE);
        userRepository.saveAndFlush(applicant);

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
