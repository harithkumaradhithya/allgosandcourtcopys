package com.allgos.dms.file;

import static org.assertj.core.api.Assertions.assertThat;

import com.allgos.dms.department.entity.Department;
import com.allgos.dms.department.repository.DepartmentRepository;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.file.service.DuplicateUploadDetector;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.repository.FolderRepository;
import com.allgos.dms.notification.entity.Notification;
import com.allgos.dms.notification.entity.NotificationType;
import com.allgos.dms.notification.repository.NotificationRepository;
import com.allgos.dms.support.AbstractIntegrationTest;
import com.allgos.dms.user.entity.User;
import com.allgos.dms.user.entity.UserRole;
import com.allgos.dms.user.entity.UserStatus;
import com.allgos.dms.user.repository.UserRepository;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * The same document filed twice, and the administrators being told about it — matched on the G.O.
 * number where there is one, and on the file name where there is not.
 *
 * <p>The check is exercised directly rather than through an upload. Going through the endpoint would
 * mean putting a scanned PDF through OCR to produce the G.O. number this turns on, which tests
 * Tesseract rather than the rule — and {@code DocumentAbstractExtractorGoNumberTest} already covers
 * the reading. What is worth proving here is what happens once a number has been read, and it needs
 * the real database: the match is a native query against a normalising expression, and normalising
 * in Java while the query does something subtly different is exactly the failure a mocked test would
 * miss.
 */
class DuplicateUploadIT extends AbstractIntegrationTest {

    private static final String ADMIN_MOBILE = "9999999999"; // seeded by V3
    private static final String UPLOADER_MOBILE = "9876543230";
    private static final String SECOND_UPLOADER_MOBILE = "9876543231";

    @Autowired private DuplicateUploadDetector detector;
    @Autowired private StoredFileRepository fileRepository;
    @Autowired private FolderRepository folderRepository;
    @Autowired private DepartmentRepository departmentRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private NotificationRepository notificationRepository;
    @Autowired private JdbcTemplate jdbcTemplate;

    private User admin;
    private User ravi;
    private User anitha;
    private Folder revenueGeneral;
    private Folder healthGeneral;
    // Held as names rather than read back off the folder in an assertion: the folder's department is
    // a lazy association and the assertions run outside a session.
    private String revenueName;
    private String healthName;

    @BeforeEach
    void setUp() {
        notificationRepository.deleteAll();
        fileRepository.deleteAll();
        userRepository.findByMobileNumber(UPLOADER_MOBILE).ifPresent(userRepository::delete);
        userRepository.findByMobileNumber(SECOND_UPLOADER_MOBILE).ifPresent(userRepository::delete);

        // Two of the seeded departments. Not new ones of this test's own: the container is shared
        // across the whole run and another test counts the departments it can browse, so adding two
        // would fail a test that has nothing to do with duplicates.
        List<Department> departments = departmentRepository.findByActiveTrueOrderByNameAsc();
        Department revenue = departments.get(0);
        Department health = departments.get(1);
        revenueGeneral = folder(revenue);
        healthGeneral = folder(health);
        revenueName = revenue.getName();
        healthName = health.getName();

        admin = userRepository.findByMobileNumber(ADMIN_MOBILE).orElseThrow();
        admin.setStatus(UserStatus.ACTIVE);
        userRepository.saveAndFlush(admin);

        ravi = member("Ravi Kumar", UPLOADER_MOBILE, revenue);
        anitha = member("Anitha Rao", SECOND_UPLOADER_MOBILE, health);
    }

    @Test
    @DisplayName("the same G.O. number filed twice tells every admin, naming both copies and where they are")
    void reportsDuplicateGoNumber() {
        StoredFile first = file("GO 123 scan.pdf", "G.O.Ms.No.123", ravi, revenueGeneral);
        backdate(first.getId(), 2);
        // Deliberately spaced differently: this is one reference typed by two people, and the office
        // considers these the same order. If the check compared the raw strings this would pass
        // unnoticed, which is the whole failure being guarded against.
        StoredFile recent = file("scan0007.pdf", "G.O. Ms. No. 123", anitha, healthGeneral);

        detector.check(recent.getId());

        // One per active administrator, and no more: the container is shared across the run, so the
        // count is taken from the accounts rather than assumed to be the one seeded by V3.
        List<User> activeAdmins = userRepository.findByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE);
        List<Notification> sent = notificationRepository.findAll();
        assertThat(sent).hasSize(activeAdmins.size());

        Notification notification = sent.getFirst();
        // By id: the association is a lazy proxy and this assertion runs outside a session.
        assertThat(notification.getUser().getId())
                .isIn(activeAdmins.stream().map(User::getId).toList());
        assertThat(notification.getType()).isEqualTo(NotificationType.DUPLICATE_UPLOAD);
        assertThat(notification.getTitle()).isEqualTo("A duplicate file has been uploaded");
        // Points at the newer copy, which is the one an administrator would act on.
        assertThat(notification.getEntityRef()).isEqualTo("file:" + recent.getId());

        assertThat(notification.getBody())
                .contains("scan0007.pdf")
                .contains("G.O. Ms. No. 123")
                .contains("Anitha Rao")
                .contains("GO 123 scan.pdf")
                .contains("Ravi Kumar")
                .contains("Matched on: the same G.O. number (G.O. Ms. No. 123).")
                .contains("First copy: %s / General.".formatted(revenueName))
                .contains("Recent copy: %s / General.".formatted(healthName));
    }

    @Test
    @DisplayName("the older copy being checked last still reports the newer one as the duplicate")
    void ordersByUploadTimeNotByWhichWasChecked() {
        // What happens when two documents are filed together: the second one's G.O. number is read
        // first, finds nothing, and the first one's read lands afterwards against an already-filed
        // newer copy. The notification must still name the newer document as the duplicate.
        StoredFile first = file("original.pdf", "G.O.Ms.No.456", ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("copy.pdf", "G.O.Ms.No.456", anitha, healthGeneral);

        detector.check(first.getId());

        Notification notification = notificationRepository.findAll().getFirst();
        assertThat(notification.getEntityRef()).isEqualTo("file:" + recent.getId());
        assertThat(notification.getBody()).startsWith("\"copy.pdf\"");
    }

    @Test
    @DisplayName("a different G.O. number is not a duplicate")
    void ignoresDifferentGoNumbers() {
        file("other.pdf", "G.O.Ms.No.999", ravi, revenueGeneral);
        StoredFile recent = file("scan.pdf", "G.O.Ms.No.123", anitha, healthGeneral);

        detector.check(recent.getId());

        assertThat(notificationRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("a withdrawn document is not something to be told about again")
    void ignoresDeletedOriginals() {
        StoredFile deleted = file("withdrawn.pdf", "G.O.Ms.No.123", ravi, revenueGeneral);
        deleted.setDeleted(true);
        fileRepository.saveAndFlush(deleted);
        backdate(deleted.getId(), 1);

        StoredFile recent = file("scan.pdf", "G.O.Ms.No.123", anitha, healthGeneral);
        detector.check(recent.getId());

        assertThat(notificationRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("two unreadable documents with different names are not duplicates of each other")
    void ignoresDocumentsWithNeitherSignal() {
        file("unreadable-a.pdf", null, ravi, revenueGeneral);
        StoredFile recent = file("unreadable-b.pdf", null, anitha, healthGeneral);

        detector.check(recent.getId());

        assertThat(notificationRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("members are not told: only an administrator can resolve a duplicate")
    void tellsAdminsOnly() {
        StoredFile first = file("first.pdf", "G.O.Ms.No.777", ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("second.pdf", "G.O.Ms.No.777", anitha, healthGeneral);

        detector.check(recent.getId());

        assertThat(notificationRepository.findAll())
                .extracting(notification -> notification.getUser().getId())
                .contains(admin.getId())
                .doesNotContain(ravi.getId(), anitha.getId());
    }

    @Test
    @DisplayName("the same file name is reported too, and says so — it is the only signal a photo has")
    void reportsDuplicateFileName() {
        // No G.O. numbers at all: a scan the extractor could read nothing out of, or anything that
        // is not a PDF. The name is the only evidence there is, and it is worth reporting.
        StoredFile first = file("Tender notice.jpg", null, ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("tender  notice.jpg", null, anitha, healthGeneral);

        detector.check(recent.getId());

        List<Notification> sent = notificationRepository.findAll();
        assertThat(sent).isNotEmpty();
        assertThat(sent.getFirst().getEntityRef()).isEqualTo("file:" + recent.getId());
        assertThat(sent.getFirst().getBody())
                // Case and the doubled space are typing, not a different document.
                .contains("\"tender  notice.jpg\"")
                .contains("\"Tender notice.jpg\"")
                .contains("Matched on: the same file name — the documents may still be different.");
    }

    @Test
    @DisplayName("a shared file name with two different G.O. numbers is a coincidence, not a duplicate")
    void ignoresSharedNamesOnDifferentOrders() {
        // What the scanner does to every office: two unrelated orders, both saved as scan0001.pdf.
        // The G.O. numbers say outright that these are different orders, and a report that ignored
        // them would fire on half of everything filed.
        StoredFile first = file("scan0001.pdf", "G.O.Ms.No.101", ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("scan0001.pdf", "G.O.Ms.No.202", anitha, healthGeneral);

        detector.check(recent.getId());

        assertThat(notificationRepository.findAll()).isEmpty();
    }

    @Test
    @DisplayName("a shared file name still counts when only one of the two has a G.O. number")
    void reportsSharedNamesWhenNothingContradictsThem() {
        // Nothing contradicts the name: the older copy is a scan nobody could read a number out of.
        StoredFile first = file("Order 41.pdf", null, ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("Order 41.pdf", "G.O.Ms.No.41", anitha, healthGeneral);

        detector.check(recent.getId());

        assertThat(notificationRepository.findAll()).isNotEmpty();
    }

    @Test
    @DisplayName("the G.O. number wins over the file name when both would match")
    void prefersTheStrongerSignal() {
        StoredFile first = file("Order 41.pdf", "G.O.Ms.No.41", ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("Order 41.pdf", "G.O. Ms. No. 41", anitha, healthGeneral);

        detector.check(recent.getId());

        assertThat(notificationRepository.findAll().getFirst().getBody())
                .contains("Matched on: the same G.O. number");
    }

    @Test
    @DisplayName("one pair, one report, however many times it is checked")
    void reportsAPairOnlyOnce() {
        // Both copies are checked in their own right — a name match is visible from either side the
        // moment the rows commit — and the admins must be told once, not once per copy.
        StoredFile first = file("Circular.pdf", null, ravi, revenueGeneral);
        backdate(first.getId(), 1);
        StoredFile recent = file("Circular.pdf", null, anitha, healthGeneral);

        detector.check(recent.getId());
        long afterFirstCheck = notificationRepository.count();
        detector.check(first.getId());

        assertThat(afterFirstCheck).isPositive();
        assertThat(notificationRepository.count()).isEqualTo(afterFirstCheck);
    }

    // ------------------------------------------------------------------------ helpers

    /**
     * A department's "General" folder, which V10 seeds for every department — recreated here if some
     * earlier test class in the shared container has removed it, so this test asserts about
     * duplicates rather than about what ran before it.
     */
    private Folder folder(Department department) {
        return folderRepository
                .findByDepartmentIdAndParentIsNullAndNameIgnoreCase(department.getId(), "General")
                .orElseGet(() -> {
                    Folder created = new Folder();
                    created.setDepartment(department);
                    created.setName("General");
                    return folderRepository.saveAndFlush(created);
                });
    }

    private User member(String name, String mobile, Department department) {
        User user = new User();
        user.setFullName(name);
        user.setMobileNumber(mobile);
        user.setPasswordHash("not-used");
        user.setDepartment(department);
        user.setRole(UserRole.MEMBER);
        user.setStatus(UserStatus.ACTIVE);
        return userRepository.saveAndFlush(user);
    }

    private StoredFile file(String name, String goNumber, User uploader, Folder folder) {
        StoredFile file = new StoredFile();
        file.setFolder(folder);
        file.setDepartment(folder.getDepartment());
        file.setFileName(name);
        file.setFileType("application/pdf");
        file.setSizeBytes(1024);
        file.setStorageKey("test/" + UUID.randomUUID());
        file.setGoNumber(goNumber);
        file.setUploadedBy(uploader);
        return fileRepository.saveAndFlush(file);
    }

    /**
     * Pushes a row's upload time into the past.
     *
     * <p>{@code created_at} is stamped by {@code @PrePersist}, so two rows written in the same test
     * can land on timestamps too close together to order reliably — and which of the two is the
     * original is the thing being asserted. Done in SQL because the column is not updatable through
     * the entity.
     */
    private void backdate(UUID fileId, int days) {
        jdbcTemplate.update(
                "update files set created_at = created_at - make_interval(days => ?) where id = ?",
                days, fileId);
    }
}
