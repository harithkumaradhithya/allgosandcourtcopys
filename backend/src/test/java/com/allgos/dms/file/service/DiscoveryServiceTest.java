package com.allgos.dms.file.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.config.AppProperties;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.common.storage.StorageService;
import com.allgos.dms.department.entity.Department;
import com.allgos.dms.file.entity.Favorite;
import com.allgos.dms.file.entity.StoredFile;
import com.allgos.dms.file.repository.DownloadRepository;
import com.allgos.dms.file.repository.FavoriteRepository;
import com.allgos.dms.file.repository.StoredFileRepository;
import com.allgos.dms.folder.entity.Folder;
import com.allgos.dms.folder.entity.FolderCategory;
import com.allgos.dms.user.entity.User;
import com.allgos.dms.user.entity.UserRole;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * The decisions behind finding a document, in isolation.
 *
 * <p>Two of them are easy to get wrong in ways no screen would reveal: the search term must reach
 * SQL with its wildcards neutralised, and the category facet must be lowercased to match the column.
 * {@code DocumentDiscoveryIT} proves the behaviour over HTTP against a real database; these pin the
 * arguments that go into it.
 */
@ExtendWith(MockitoExtension.class)
class DiscoveryServiceTest {

    @Mock private StoredFileRepository fileRepository;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private DownloadRepository downloadRepository;
    @Mock private StorageService storageService;
    @Mock private AuditService auditService;

    private DiscoveryService service;
    private User viewer;
    private StoredFile file;

    private static final Pageable PAGE = PageRequest.of(0, 20);

    @BeforeEach
    void setUp() {
        AppProperties properties = new AppProperties(
                "Asia/Kolkata",
                null,
                null,
                new AppProperties.Storage("http://localhost:9000", "ap-south-1", "bucket", "k", "s", true,
                        Duration.ofMinutes(5)),
                null,
                null,
                null);

        service = new DiscoveryService(
                fileRepository, favoriteRepository, downloadRepository, storageService, auditService, properties);

        viewer = new User();
        viewer.setId(UUID.randomUUID());
        viewer.setFullName("Meena Rajan");
        viewer.setRole(UserRole.MEMBER);

        Department department = new Department();
        department.setId(UUID.randomUUID());
        department.setName("Department of Agriculture");

        Folder folder = new Folder();
        folder.setId(UUID.randomUUID());
        folder.setName("Circulars 2026");
        folder.setDepartment(department);
        folder.setCategory(FolderCategory.CIRCULAR);

        file = new StoredFile();
        file.setId(UUID.randomUUID());
        file.setFileName("Circular 42.pdf");
        file.setFileType("application/pdf");
        file.setSizeBytes(1024);
        file.setStorageKey("dept/folder/abc.pdf");
        file.setFolder(folder);
        file.setDepartment(department);
        file.setUploadedBy(viewer);
    }

    @Nested
    @DisplayName("search")
    class Search {

        @ParameterizedTest
        @NullSource
        @ValueSource(strings = {"", "  ", "C", " x "})
        @DisplayName("a query shorter than two characters is refused rather than matching the archive")
        void refusesQueriesThatWouldMatchEverything(String query) {
            assertThatThrownBy(() -> service.search(query, null, null, null, null, viewer, PAGE))
                    .isInstanceOf(ApiException.class)
                    .extracting(ex -> ((ApiException) ex).getCode())
                    .isEqualTo("SEARCH_TOO_SHORT");

            verifyNoInteractions(fileRepository);
        }

        @Test
        @DisplayName("a single digit is accepted, since a G.O. number is a compact token rather than free prose")
        void acceptsASingleDigitEvenBelowTheGeneralMinimum() {
            givenNoResults();

            service.search("2", null, null, null, null, viewer, PAGE);

            assertThat(capturedPattern()).isEqualTo("%2%");
        }

        @Test
        @DisplayName("LIKE wildcards in the query are matched literally")
        void escapesWildcards() {
            givenNoResults();

            service.search("50%_off", null, null, null, null, viewer, PAGE);

            assertThat(capturedPattern()).isEqualTo("%50\\%\\_off%");
        }

        @Test
        @DisplayName("the category facet is lowercased to match the stored column")
        void lowercasesTheCategoryForTheColumn() {
            givenNoResults();
            UUID departmentId = UUID.randomUUID();

            service.search("circular", departmentId, FolderCategory.COURT_ORDER, null, null, viewer, PAGE);

            verify(fileRepository).search(
                    anyString(),
                    eq(departmentId.toString()),
                    eq("court_order"),
                    isNull(),
                    isNull(),
                    eq(PAGE));
        }

        @Test
        @DisplayName("no facets means no filters, not empty-string ones")
        void passesNullsWhenNoFacetsAreGiven() {
            givenNoResults();

            service.search("circular", null, null, null, null, viewer, PAGE);

            verify(fileRepository).search(anyString(), isNull(), isNull(), isNull(), isNull(), eq(PAGE));
        }

        @Test
        @DisplayName("stars are resolved in one query for the whole page, not one per row")
        void resolvesFavoritesInASingleQuery() {
            when(fileRepository.search(anyString(), any(), any(), any(), any(), any()))
                    .thenReturn(new org.springframework.data.domain.PageImpl<>(List.of(file), PAGE, 1));
            when(favoriteRepository.findFileIdsFor(eq(viewer.getId()), any())).thenReturn(List.of(file.getId()));

            var results = service.search("circular", null, null, null, null, viewer, PAGE);

            assertThat(results.items()).singleElement().satisfies(view -> {
                assertThat(view.favorite()).isTrue();
                assertThat(view.fileName()).isEqualTo("Circular 42.pdf");
            });
            verify(favoriteRepository).findFileIdsFor(eq(viewer.getId()), any());
        }

        @Test
        @DisplayName("an empty page asks nothing about favourites")
        void skipsTheFavoriteLookupWhenThereAreNoResults() {
            givenNoResults();

            service.search("circular", null, null, null, null, viewer, PAGE);

            verify(favoriteRepository, never()).findFileIdsFor(any(), any());
        }

        private void givenNoResults() {
            when(fileRepository.search(anyString(), any(), any(), any(), any(), any()))
                    .thenReturn(Page.empty(PAGE));
        }

        private String capturedPattern() {
            ArgumentCaptor<String> pattern = ArgumentCaptor.forClass(String.class);
            verify(fileRepository).search(pattern.capture(), any(), any(), any(), any(), any());
            return pattern.getValue();
        }
    }

    @Nested
    @DisplayName("preview")
    class Preview {

        @Test
        @DisplayName("a PDF gets an inline URL — no download filename attached")
        void issuesAnInlineUrlForAPdf() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));
            when(storageService.presignedGet(eq(file.getStorageKey()), any(), isNull()))
                    .thenReturn("https://storage/signed");

            var link = service.previewLink(file.getId(), viewer);

            assertThat(link.url()).isEqualTo("https://storage/signed");
            assertThat(link.fileType()).isEqualTo("application/pdf");
            // The null third argument is the whole difference between preview and download.
            verify(storageService).presignedGet(eq(file.getStorageKey()), any(), isNull());
            verify(auditService).record(
                    eq(viewer), eq(AuditAction.FILE_PREVIEWED), eq("file"), eq(file.getId()), any());
        }

        @Test
        @DisplayName("a Word document is refused rather than silently downloaded")
        void refusesATypeTheBrowserCannotRender() {
            file.setFileType("application/msword");
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));

            assertThatThrownBy(() -> service.previewLink(file.getId(), viewer))
                    .isInstanceOf(ApiException.class)
                    .extracting(ex -> ((ApiException) ex).getCode())
                    .isEqualTo("PREVIEW_UNSUPPORTED");

            verifyNoInteractions(storageService);
        }

        @Test
        @DisplayName("previewing writes no download row — looking is not taking a copy")
        void doesNotRecordADownload() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));
            when(storageService.presignedGet(anyString(), any(), isNull())).thenReturn("https://storage/signed");

            service.previewLink(file.getId(), viewer);

            verifyNoInteractions(downloadRepository);
        }

        @Test
        void reportsADeletedDocumentAsNotFound() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.previewLink(file.getId(), viewer))
                    .isInstanceOf(ApiException.class)
                    .extracting(ex -> ((ApiException) ex).getCode())
                    .isEqualTo("NOT_FOUND");
        }
    }

    @Nested
    @DisplayName("favorites")
    class Favorites {

        @Test
        @DisplayName("starring something already starred saves nothing new")
        void isIdempotent() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));
            when(favoriteRepository.findByUserIdAndFileId(viewer.getId(), file.getId()))
                    .thenReturn(Optional.of(new Favorite()));

            var view = service.addFavorite(file.getId(), viewer);

            assertThat(view.favorite()).isTrue();
            verify(favoriteRepository, never()).save(any());
        }

        @Test
        void starsAFileThatWasNotStarred() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));
            when(favoriteRepository.findByUserIdAndFileId(viewer.getId(), file.getId()))
                    .thenReturn(Optional.empty());

            var view = service.addFavorite(file.getId(), viewer);

            assertThat(view.favorite()).isTrue();

            ArgumentCaptor<Favorite> saved = ArgumentCaptor.forClass(Favorite.class);
            verify(favoriteRepository).save(saved.capture());
            assertThat(saved.getValue().getUser()).isSameAs(viewer);
            assertThat(saved.getValue().getFile()).isSameAs(file);
        }

        @Test
        @DisplayName("un-starring something that was never starred is not an error")
        void removingAMissingFavoriteIsANoOp() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.of(file));
            when(favoriteRepository.findByUserIdAndFileId(viewer.getId(), file.getId()))
                    .thenReturn(Optional.empty());

            assertThatCode(() -> service.removeFavorite(file.getId(), viewer)).doesNotThrowAnyException();
            verify(favoriteRepository, never()).delete(any());
        }

        @Test
        void cannotStarADeletedDocument() {
            when(fileRepository.findByIdAndDeletedFalse(file.getId())).thenReturn(Optional.empty());

            assertThatThrownBy(() -> service.addFavorite(file.getId(), viewer))
                    .isInstanceOf(ApiException.class)
                    .extracting(ex -> ((ApiException) ex).getCode())
                    .isEqualTo("NOT_FOUND");
        }
    }
}
