package com.allgos.dms.letter;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.allgos.dms.audit.repository.AuditLogRepository;
import com.allgos.dms.auth.repository.RegistrationRequestRepository;
import com.allgos.dms.department.entity.Department;
import com.allgos.dms.department.repository.DepartmentRepository;
import com.allgos.dms.letter.repository.LetterRepository;
import com.allgos.dms.letter.repository.LetterTemplateRepository;
import com.allgos.dms.notification.repository.NotificationRepository;
import com.allgos.dms.support.AbstractIntegrationTest;
import com.allgos.dms.user.entity.User;
import com.allgos.dms.user.entity.UserStatus;
import com.allgos.dms.user.repository.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Letters and the templates they start from.
 *
 * <p>Two rules carry the feature. Templates are the office's standing wording, so only an
 * administrator maintains them while everybody reads them. A letter, by contrast, belongs to the
 * person who wrote it — nobody else can list it, open it, change it or delete it, and that is
 * asserted here rather than assumed from the query being written correctly today.
 */
class LetterIT extends AbstractIntegrationTest {

    private static final String ADMIN_MOBILE = "9999999999"; // seeded by V3
    private static final String MEMBER_MOBILE = "9876543230";
    private static final String OTHER_MEMBER_MOBILE = "9876543231";
    private static final String PASSWORD = "Str0ngPassword!";

    @Autowired private ObjectMapper objectMapper;
    @Autowired private UserRepository userRepository;
    @Autowired private PasswordEncoder passwordEncoder;
    @Autowired private DepartmentRepository departmentRepository;
    @Autowired private LetterRepository letterRepository;
    @Autowired private LetterTemplateRepository templateRepository;
    @Autowired private RegistrationRequestRepository registrationRequestRepository;
    @Autowired private AuditLogRepository auditLogRepository;
    @Autowired private NotificationRepository notificationRepository;

    private String adminToken;
    private String memberToken;
    private String otherToken;

    @BeforeEach
    void setUp() throws Exception {
        letterRepository.deleteAll();
        templateRepository.deleteAll();
        // Registering and signing in write audit rows and notify the admins, and both reference the
        // users deleted below — cleared in foreign-key order, as every integration test here does.
        auditLogRepository.deleteAll();
        notificationRepository.deleteAll();
        registrationRequestRepository.deleteAll();
        userRepository.findByMobileNumber(MEMBER_MOBILE).ifPresent(userRepository::delete);
        userRepository.findByMobileNumber(OTHER_MEMBER_MOBILE).ifPresent(userRepository::delete);

        Department department = departmentRepository.findByActiveTrueOrderByNameAsc().getFirst();

        User admin = userRepository.findByMobileNumber(ADMIN_MOBILE).orElseThrow();
        admin.setStatus(UserStatus.ACTIVE);
        admin.setPasswordHash(passwordEncoder.encode(PASSWORD));
        admin.setFailedLoginCount(0);
        admin.setLockedUntil(null);
        userRepository.saveAndFlush(admin);

        adminToken = signIn(ADMIN_MOBILE);
        memberToken = registerApproveAndSignIn(MEMBER_MOBILE, "Meena Rajan", department.getId());
        otherToken = registerApproveAndSignIn(OTHER_MEMBER_MOBILE, "Arun Kumar", department.getId());
    }

    // ------------------------------------------------------------------------ templates

    @Test
    @DisplayName("an admin adds a template and everybody can choose it")
    void adminAddsATemplateEveryoneCanUse() throws Exception {
        String id = createTemplate("Meeting invitation", "Request to attend the meeting - Reg.");

        // The member sees it in the chooser, with the standing wording ready to edit.
        mockMvc.perform(get("/api/v1/letters/templates").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].id").value(id))
                .andExpect(jsonPath("$[0].name").value("Meeting invitation"))
                .andExpect(jsonPath("$[0].defaultSubject").value("Request to attend the meeting - Reg."))
                .andExpect(jsonPath("$[0].salutation").value("Sir/Madam,"))
                .andExpect(jsonPath("$[0].language").value("EN"));
    }

    @Test
    @DisplayName("a member cannot add, change or remove a template")
    void templatesAreTheAdminsToMaintain() throws Exception {
        String id = createTemplate("Meeting invitation", "Request to attend");

        saveTemplate(memberToken, post("/api/v1/admin/letter-templates"), "Mine", "Subject")
                .andExpect(status().isForbidden());
        saveTemplate(memberToken, put("/api/v1/admin/letter-templates/" + id), "Renamed", "Subject")
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/v1/admin/letter-templates/{id}", id)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isForbidden());

        // Untouched by any of it.
        assertThat(templateRepository.findAll()).singleElement()
                .satisfies(template -> assertThat(template.getName()).isEqualTo("Meeting invitation"));
    }

    @Test
    @DisplayName("two templates cannot share a name, however it is cased")
    void namesAreUnique() throws Exception {
        createTemplate("Meeting invitation", "Subject");

        saveTemplate(adminToken, post("/api/v1/admin/letter-templates"), "MEETING INVITATION", "Subject")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("TEMPLATE_NAME_TAKEN"));
    }

    @Test
    @DisplayName("an unused template is removed; one already written from is retired instead")
    void deletingATemplateNeverTakesLettersWithIt() throws Exception {
        String unused = createTemplate("Never used", "Subject");
        String used = createTemplate("Meeting invitation", "Subject");
        String letterId = createLetter(memberToken, used, "Purchase Committee meeting");

        mockMvc.perform(delete("/api/v1/admin/letter-templates/{id}", unused)
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.removed").value(true));

        mockMvc.perform(delete("/api/v1/admin/letter-templates/{id}", used)
                        .header(HttpHeaders.AUTHORIZATION, bearer(adminToken)))
                .andExpect(status().isOk())
                // Retired, not removed — and the screen is told which happened.
                .andExpect(jsonPath("$.removed").value(false));

        // Gone from the chooser...
        mockMvc.perform(get("/api/v1/letters/templates").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.length()").value(0));

        // ...but the letter written from it still opens, and still names it.
        mockMvc.perform(get("/api/v1/letters/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.templateName").value("Meeting invitation"));
    }

    // -------------------------------------------------------------------------- letters

    @Test
    @DisplayName("a letter is written, listed, reopened whole, corrected and reprinted")
    void theWholeRoundTrip() throws Exception {
        String templateId = createTemplate("Meeting invitation", "Request to attend the meeting - Reg.");
        String letterId = createLetter(memberToken, templateId, "Purchase Committee meeting");

        // The list carries what a list needs and not the whole body.
        mockMvc.perform(get("/api/v1/letters").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].subject").value("Purchase Committee meeting"))
                .andExpect(jsonPath("$.items[0].referenceNo").value("DBC/52/2026-D3"))
                .andExpect(jsonPath("$.items[0].templateName").value("Meeting invitation"));

        // Opening one gives every block the print view needs.
        mockMvc.perform(get("/api/v1/letters/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.fromBlock").value(org.hamcrest.Matchers.containsString("Meena Rajan")))
                .andExpect(jsonPath("$.toBlock").value(org.hamcrest.Matchers.containsString("Commissioner")))
                .andExpect(jsonPath("$.salutation").value("Sir/Madam,"))
                .andExpect(jsonPath("$.letterDate").value("2026-08-22"))
                .andExpect(jsonPath("$.copyTo").value(org.hamcrest.Matchers.containsString("Secretary")));

        Map<String, Object> corrected = letterBody(templateId, "Purchase Committee meeting — revised");
        corrected.put("body", "The meeting has moved to 4.00 PM.");
        mockMvc.perform(put("/api/v1/letters/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(corrected)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.subject").value("Purchase Committee meeting — revised"))
                .andExpect(jsonPath("$.body").value("The meeting has moved to 4.00 PM."));

        // A correction is not a second letter.
        assertThat(letterRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("a letter belongs to whoever wrote it, and nobody else can reach it")
    void lettersAreTheirAuthorsOwn() throws Exception {
        String templateId = createTemplate("Meeting invitation", "Subject");
        String letterId = createLetter(memberToken, templateId, "Purchase Committee meeting");

        // Not in anybody else's list — not even an administrator's.
        for (String token : new String[] {otherToken, adminToken}) {
            mockMvc.perform(get("/api/v1/letters").header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalItems").value(0));

            // 404 rather than 403: which ids exist is not this endpoint's to confirm.
            mockMvc.perform(get("/api/v1/letters/{id}", letterId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isNotFound());

            mockMvc.perform(delete("/api/v1/letters/{id}", letterId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isNotFound());
        }

        assertThat(letterRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("the author removes their own letter")
    void anAuthorCanRemoveTheirOwn() throws Exception {
        String letterId = createLetter(memberToken, null, "A letter written from nothing");

        mockMvc.perform(delete("/api/v1/letters/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isNoContent());

        assertThat(letterRepository.count()).isZero();
    }

    @Test
    @DisplayName("a letter with nobody to send it to, or nothing to say, is refused")
    void theBlocksThatMatterAreRequired() throws Exception {
        for (String missing : new String[] {"toBlock", "subject", "body", "fromBlock"}) {
            Map<String, Object> body = letterBody(null, "A subject");
            body.put(missing, "   ");

            mockMvc.perform(post("/api/v1/letters")
                            .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(body)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
        }

        assertThat(letterRepository.count()).isZero();
    }

    // --------------------------------------------------------------------------- language

    @Test
    @DisplayName("a Tamil letter is saved and reopened as a Tamil letter")
    void theLanguageTravelsWithTheLetter() throws Exception {
        Map<String, Object> tamil = letterBody(null, "கொள்முதல் குழுக் கூட்டம்");
        tamil.put("language", "TA");
        tamil.put("salutation", "ஐயா/அம்மா,");

        String letterId = objectMapper
                .readTree(mockMvc.perform(post("/api/v1/letters")
                                .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(tamil)))
                        .andExpect(status().isOk())
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("id")
                .asText();

        // Reopened as Tamil, because the headings the sheet prints are read off this and nothing
        // else. A letter that came back as EN would print "From," and "Sub:" on a Tamil letter.
        mockMvc.perform(get("/api/v1/letters/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.language").value("TA"))
                .andExpect(jsonPath("$.salutation").value("ஐயா/அம்மா,"));

        mockMvc.perform(get("/api/v1/letters").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.items[0].language").value("TA"));
    }

    @Test
    @DisplayName("a letter that says nothing about its language is English")
    void theLanguageDefaultsRatherThanFailing() throws Exception {
        String letterId = createLetter(memberToken, null, "A letter from an older client");

        mockMvc.perform(get("/api/v1/letters/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.language").value("EN"));
    }

    // ----------------------------------------------------------------------------- drafts

    @Test
    @DisplayName("a half-written letter is kept as a draft, listed apart, and finished later")
    void aDraftIsKeptAndPickedUpAgain() throws Exception {
        // Nothing but a subject: exactly the letter POST /letters refuses, and exactly what somebody
        // has after two minutes of typing.
        Map<String, Object> started = new HashMap<>();
        started.put("subject", "Purchase Committee meeting");
        started.put("language", "EN");

        String draftId = objectMapper
                .readTree(mockMvc.perform(post("/api/v1/letters/drafts")
                                .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(started)))
                        .andExpect(status().isOk())
                        .andExpect(jsonPath("$.status").value("DRAFT"))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("id")
                .asText();

        // Not among the letters — a draft is not something that was sent...
        mockMvc.perform(get("/api/v1/letters").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(0));

        // ...but it is there to come back to.
        mockMvc.perform(get("/api/v1/letters")
                        .param("status", "DRAFT")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(1))
                .andExpect(jsonPath("$.items[0].id").value(draftId))
                .andExpect(jsonPath("$.items[0].status").value("DRAFT"));

        // Autosaved again as more is written, into the same row rather than a second one.
        started.put("body", "It is proposed to convene the meeting on 24.08.2026.");
        mockMvc.perform(put("/api/v1/letters/drafts/{id}", draftId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(started)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("DRAFT"));

        assertThat(letterRepository.count()).isEqualTo(1);

        // Finishing it promotes that same row: the draft becomes the letter, not a copy beside it.
        mockMvc.perform(put("/api/v1/letters/{id}", draftId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                letterBody(null, "Purchase Committee meeting"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("FINAL"));

        assertThat(letterRepository.count()).isEqualTo(1);
        mockMvc.perform(get("/api/v1/letters")
                        .param("status", "DRAFT")
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(0));
        mockMvc.perform(get("/api/v1/letters").header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(jsonPath("$.totalItems").value(1));
    }

    @Test
    @DisplayName("an autosave still in flight does not drag a finished letter back into the drafts")
    void autosavingAFinishedLetterKeepsTheEditButNotTheStatus() throws Exception {
        String letterId = createLetter(memberToken, null, "Purchase Committee meeting");

        Map<String, Object> edit = letterBody(null, "Purchase Committee meeting");
        edit.put("body", "The meeting has moved to 4.00 PM.");

        mockMvc.perform(put("/api/v1/letters/drafts/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(edit)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.body").value("The meeting has moved to 4.00 PM."))
                .andExpect(jsonPath("$.status").value("FINAL"));
    }

    @Test
    @DisplayName("a draft belongs to whoever was writing it, and nobody else can reach it")
    void draftsAreTheirAuthorsOwn() throws Exception {
        Map<String, Object> started = new HashMap<>();
        started.put("subject", "Half a letter");

        String draftId = objectMapper
                .readTree(mockMvc.perform(post("/api/v1/letters/drafts")
                                .header(HttpHeaders.AUTHORIZATION, bearer(memberToken))
                                .contentType(MediaType.APPLICATION_JSON)
                                .content(objectMapper.writeValueAsString(started)))
                        .andReturn()
                        .getResponse()
                        .getContentAsString())
                .get("id")
                .asText();

        for (String token : new String[] {otherToken, adminToken}) {
            mockMvc.perform(get("/api/v1/letters")
                            .param("status", "DRAFT")
                            .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(jsonPath("$.totalItems").value(0));

            mockMvc.perform(put("/api/v1/letters/drafts/{id}", draftId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token))
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(started)))
                    .andExpect(status().isNotFound());

            mockMvc.perform(delete("/api/v1/letters/drafts/{id}", draftId)
                            .header(HttpHeaders.AUTHORIZATION, bearer(token)))
                    .andExpect(status().isNotFound());
        }

        // Its author throws it away, and nothing is left behind.
        mockMvc.perform(delete("/api/v1/letters/drafts/{id}", draftId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isNoContent());

        assertThat(letterRepository.count()).isZero();
    }

    @Test
    @DisplayName("a letter that was finished is deleted, not discarded as a draft")
    void discardingRefusesAFinishedLetter() throws Exception {
        String letterId = createLetter(memberToken, null, "Purchase Committee meeting");

        mockMvc.perform(delete("/api/v1/letters/drafts/{id}", letterId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(memberToken)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("NOT_A_DRAFT"));

        assertThat(letterRepository.count()).isEqualTo(1);
    }

    @Test
    @DisplayName("signed out, there are no letters and no templates")
    void anonymousReachesNothing() throws Exception {
        mockMvc.perform(get("/api/v1/letters")).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/v1/letters/drafts")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/letters/templates")).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/v1/admin/letter-templates")).andExpect(status().isUnauthorized());
    }

    // ------------------------------------------------------------------------ helpers

    private String createTemplate(String name, String subject) throws Exception {
        String body = saveTemplate(adminToken, post("/api/v1/admin/letter-templates"), name, subject)
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    private ResultActions saveTemplate(
            String token,
            org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request,
            String name,
            String subject)
            throws Exception {

        return mockMvc.perform(request
                .header(HttpHeaders.AUTHORIZATION, bearer(token))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(Map.of(
                        "name", name,
                        "description", "For convening a committee",
                        "defaultSubject", subject,
                        "salutation", "Sir/Madam,",
                        "body", "Kind attention is invited to the references cited.",
                        "language", "EN",
                        "active", true))));
    }

    private String createLetter(String token, String templateId, String subject) throws Exception {
        String body = mockMvc.perform(post("/api/v1/letters")
                        .header(HttpHeaders.AUTHORIZATION, bearer(token))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(letterBody(templateId, subject))))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return objectMapper.readTree(body).get("id").asText();
    }

    /** A letter shaped like the office's own: the sample in docs is a meeting invitation. */
    private Map<String, Object> letterBody(String templateId, String subject) {
        Map<String, Object> body = new HashMap<>();
        body.put("templateId", templateId);
        body.put("referenceNo", "DBC/52/2026-D3");
        body.put("letterDate", "2026-08-22");
        body.put("fromBlock", "Meena Rajan,\nSection Officer,\nBackward Classes Welfare,\nChepauk, Chennai - 600 005.");
        body.put("toBlock", "1. The Commissioner of MBC & DNC, Ch-5.\n2. The Commissioner of MW, Ch-05.");
        body.put("salutation", "Sir/Madam,");
        body.put("subject", subject);
        body.put("reference", "G.O. (Ms) No.43, BC, MBC & MW (MW2) Dept., dated: 21.08.2026.");
        body.put("body", "It is proposed to convene the Purchase Committee meeting on 24.08.2026 at 03.00 PM.");
        body.put("enclosure", "G.O Copy.");
        body.put("copyTo", "Secretary to Government,\nBC, MBC and MW Department,\nSecretariat, Chennai - 09.");
        body.put("signOff", "Sd/- M. Pradeep Kumar\nDirector");
        return body;
    }

    private String registerApproveAndSignIn(String mobile, String name, UUID departmentId) throws Exception {
        mockMvc.perform(post("/api/v1/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "fullName", name,
                                "mobileNumber", mobile,
                                "departmentId", departmentId.toString(),
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
