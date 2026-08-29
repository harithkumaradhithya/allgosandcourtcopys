package com.allgos.dms.file.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.config.AppProperties;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.common.storage.StorageService;
import com.allgos.dms.department.entity.Department;
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
import com.allgos.dms.user.entity.UserRole;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

/**
 * Rule 4 in isolation: a deletion needs a reason, only the uploader or an admin may perform one, and
 * every admin hears about it with the reason attached. {@code FileAccessIT} proves the same over
 * HTTP; these pin the decisions themselves.
 *
 * <p>Replacing shares that ownership rule, so the two tests at the end check that a refusal costs
 * nothing — no validation, and above all no bytes written.
 */
@ExtendWith(MockitoExtension.class)
class FileServiceTest {

    @Mock private StoredFileRepository fileRepository;
    @Mock private FileDeletionRepository deletionRepository;
    @Mock private DownloadRepository downloadRepository;
    @Mock private FolderRepository folderRepository;
    @Mock private StorageService storageService;
    @Mock private UploadValidator uploadValidator;
    @Mock private FileRecordWriter fileRecordWriter;
    @Mock private DocumentEnrichmentService enrichmentService;
    @Mock private AuditService auditService;
    @Mock private NotificationService notificationService;

    private FileService service;

    private User uploader;
    private User otherMember;
    private User admin;
    private StoredFile file;

    @BeforeEach
    void setUp() {
        service = new FileService(
                fileRepository,
                deletionRepository,
                downloadRepository,
                folderRepository,
                storageService,
                uploadValidator,
                fileRecordWriter,
                enrichmentService,
                auditService,
                notificationService,
                properties());

        uploader = user("Meena Rajan", UserRole.MEMBER);
        otherMember = user("Arun Kumar", UserRole.MEMBER);
        admin = user("System Administrator", UserRole.ADMIN);

        Department department = new Department();
        department.setId(UUID.randomUUID());
        department.setName("Revenue Department");

        Folder folder = new Folder();
        folder.setId(UUID.randomUUID());
        folder.setDepartment(department);
        folder.setName("Circulars 2026");

        file = new StoredFile();
        file.setId(UUID.randomUUID());
        file.setFolder(folder);
        file.setDepartment(department);
        file.setFileName("Circular 42.pdf");
        file.setUploadedBy(uploader);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"", "   ", "\t\n"})
    @DisplayName("a deletion without a real reason is refused before anything is touched")
    void reasonIsRequired(String reason) {
        assertThatThrownBy(() -> service.delete(file.getId(), reason, uploader))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("REASON_REQUIRED");

        // Not even looked up: nothing can be half-deleted by a request that was never valid.
        verifyNoInteractions(fileRepository, deletionRepository, notificationService);
    }

    @Test
    @DisplayName("someone who did not upload the file cannot delete it")
    void onlyTheUploaderOrAnAdminMayDelete() {
        when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));

        assertThatThrownBy(() -> service.delete(file.getId(), "not mine but I want it gone", otherMember))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("NOT_FILE_OWNER");

        assertThat(file.isDeleted()).isFalse();
        verify(deletionRepository, never()).save(any());
        verify(notificationService, never()).notifyEveryoneExcept(any(), any(), any(), any(), any());
        // The refusal is on the record even though the request failed.
        verify(auditService).recordDurable(eq(otherMember), any(), any(), eq(file.getId()), any());
    }

    @Test
    @DisplayName("the uploader deletes their own file, and everyone else is told why")
    void uploaderDeletesWithReason() {
        when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));

        service.delete(file.getId(), "  Uploaded to the wrong department  ", uploader);

        assertThat(file.isDeleted()).isTrue();
        verify(folderRepository).adjustFileCount(file.getFolder().getId(), -1);

        // The reason is stored trimmed, exactly once.
        ArgumentCaptor<FileDeletion> saved = ArgumentCaptor.forClass(FileDeletion.class);
        verify(deletionRepository).save(saved.capture());
        assertThat(saved.getValue().getReason()).isEqualTo("Uploaded to the wrong department");
        assertThat(saved.getValue().getDeletedBy()).isEqualTo(uploader);

        // Captured onto the row itself, not left to a live join — the deletions log has to keep
        // reading correctly even after this file is one day purged.
        assertThat(saved.getValue().getFileName()).isEqualTo("Circular 42.pdf");
        assertThat(saved.getValue().getDepartmentName()).isEqualTo("Revenue Department");
        assertThat(saved.getValue().getFolderName()).isEqualTo("Circulars 2026");

        // And the fan-out carries it, to everyone but the person who did it.
        verify(notificationService)
                .notifyEveryoneExcept(
                        eq(uploader),
                        eq(NotificationType.FILE_DELETED),
                        any(),
                        contains("Uploaded to the wrong department"),
                        eq("file:" + file.getId()));
    }

    @Test
    @DisplayName("an admin may delete a file someone else uploaded")
    void adminMayDeleteAnything() {
        when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));

        service.delete(file.getId(), "Superseded by GO 118", admin);

        assertThat(file.isDeleted()).isTrue();
        verify(deletionRepository).save(any(FileDeletion.class));
    }

    @Test
    @DisplayName("deleting is soft — the bytes are never removed from storage")
    void deletionNeverTouchesObjectStorage() {
        when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));

        service.delete(file.getId(), "Duplicate", uploader);

        // If this ever changes, restore silently stops working.
        verifyNoInteractions(storageService);
    }

    @Test
    @DisplayName("restoring puts the file back and stamps the deletion it undid")
    void restoreStampsTheDeletion() {
        file.setDeleted(true);
        FileDeletion deletion = new FileDeletion();
        deletion.setFile(file);
        deletion.setDeletedBy(uploader);
        deletion.setReason("Duplicate");

        when(fileRepository.findById(file.getId())).thenReturn(Optional.of(file));
        when(deletionRepository.findFirstByFileIdAndRestoredAtIsNullOrderByDeletedAtDesc(file.getId()))
                .thenReturn(Optional.of(deletion));

        service.restore(file.getId(), admin);

        assertThat(file.isDeleted()).isFalse();
        assertThat(deletion.getRestoredBy()).isEqualTo(admin);
        assertThat(deletion.getRestoredAt()).isNotNull();
        verify(folderRepository).adjustFileCount(file.getFolder().getId(), 1);
        verify(notificationService)
                .notify(eq(uploader), eq(NotificationType.FILE_RESTORED), any(), any(), any());
    }

    @Test
    @DisplayName("restoring a file that was never deleted is a conflict, not a silent success")
    void restoringALiveFileIsRefused() {
        when(fileRepository.findById(file.getId())).thenReturn(Optional.of(file));

        assertThatThrownBy(() -> service.restore(file.getId(), admin))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("FILE_NOT_DELETED");

        verify(folderRepository, never()).adjustFileCount(any(), anyInt());
    }

    @Test
    @DisplayName("purging removes the database row before touching storage, never the other way round")
    void purgeCommitsTheRowBeforeRemovingTheBytes() {
        when(fileRecordWriter.purge(file.getId(), admin)).thenReturn("dept/folder/circular-42.pdf");

        service.purge(file.getId(), admin);

        var order = org.mockito.Mockito.inOrder(fileRecordWriter, storageService);
        order.verify(fileRecordWriter).purge(file.getId(), admin);
        order.verify(storageService).delete("dept/folder/circular-42.pdf");
    }

    @Test
    @DisplayName("the sweep purges every eligible file, and one failure does not stop the rest")
    void purgeExpiredSkipsOverAFailureAndKeepsGoing() {
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        when(deletionRepository.findPurgeableFileIds(any())).thenReturn(java.util.List.of(first, second));
        // The sweep acts as no one in particular — null rather than any admin.
        when(fileRecordWriter.purge(eq(first), eq(null)))
                .thenThrow(new RuntimeException("object already gone from storage"));
        when(fileRecordWriter.purge(eq(second), eq(null))).thenReturn("dept/folder/other.pdf");

        int purged = service.purgeExpired();

        assertThat(purged).isEqualTo(1);
        verify(fileRecordWriter).purge(first, null);
        verify(fileRecordWriter).purge(second, null);
        verify(storageService).delete("dept/folder/other.pdf");
    }

    @Test
    @DisplayName("a refused replacement never reaches storage")
    void replacementChecksPermissionBeforeUploading() {
        when(fileRecordWriter.replacementTarget(file.getId(), otherMember))
                .thenThrow(ApiException.forbidden("NOT_FILE_OWNER", "not yours"));

        assertThatThrownBy(() ->
                        service.replace(
                                file.getId(),
                                new MockMultipartFile("file", "x.pdf", "application/pdf", new byte[] {1, 2, 3}),
                                otherMember))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("NOT_FILE_OWNER");

        // Permission is checked first precisely so a refused caller cannot make us store anything —
        // and the file is not even validated, since it will never be used.
        verifyNoInteractions(storageService, uploadValidator);
    }

    @Test
    @DisplayName("replacing with nothing is refused before anything is looked up")
    void replacementNeedsAFile() {
        assertThatThrownBy(() ->
                        service.replace(
                                file.getId(),
                                new MockMultipartFile("file", "empty.pdf", "application/pdf", new byte[0]),
                                uploader))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("NO_FILES");

        verifyNoInteractions(fileRecordWriter, storageService);
    }

    @Test
    @DisplayName("a deleted file is invisible to every path except the deletions log")
    void deletedFilesAreNotFound() {
        when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.delete(file.getId(), "gone already", admin))
                .isInstanceOf(ApiException.class)
                .extracting(ex -> ((ApiException) ex).getCode())
                .isEqualTo("NOT_FOUND");
    }

    private static User user(String name, UserRole role) {
        User user = new User();
        user.setId(UUID.randomUUID());
        user.setFullName(name);
        user.setRole(role);
        return user;
    }

    private static AppProperties properties() {
        return new AppProperties(
                "Asia/Kolkata",
                null,
                null,
                new AppProperties.Storage(
                        "http://localhost:9000",
                        "ap-south-1",
                        "allgos-documents",
                        "minioadmin",
                        "minioadmin",
                        true,
                        java.time.Duration.ofMinutes(5)),
                null,
                null,
                null);
    }
}
