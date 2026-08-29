package com.allgos.dms.file.repository;

import com.allgos.dms.file.entity.StoredFile;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** Every read here filters soft-deleted rows out; the deletions log is the only view that sees them. */
public interface StoredFileRepository extends JpaRepository<StoredFile, UUID> {

    Optional<StoredFile> findByIdAndDeletedFalse(UUID id);

    List<StoredFile> findByFolderIdAndDeletedFalseOrderByCreatedAtDesc(UUID folderId);

    Page<StoredFile> findByFolderIdAndDeletedFalse(UUID folderId, Pageable pageable);

    Page<StoredFile> findByDepartmentIdAndDeletedFalse(UUID departmentId, Pageable pageable);

    Page<StoredFile> findByUploadedByIdAndDeletedFalse(UUID uploaderId, Pageable pageable);

    long countByFolderIdAndDeletedFalse(UUID folderId);

    /**
     * Whether <em>any</em> file row still points at this folder — live or soft-deleted.
     *
     * <p>Deliberately not scoped to {@code deleted = false}: {@code files.folder_id} is a
     * {@code NOT NULL} foreign key with no {@code ON DELETE} action, and a soft-deleted file's row
     * survives (that is what makes restoring it possible, and what the admin deletions log reads).
     * A folder a document was once filed into and later removed from still has that row pointing at
     * it, so {@link com.allgos.dms.folder.service.FolderService#delete} has to check this rather than
     * the live {@code fileCount}, or the delete fails at commit with a foreign-key violation instead
     * of the clear refusal the caller should see.
     */
    boolean existsByFolderId(UUID folderId);

    /**
     * Moves every file row still pointing at {@code folderId} — by construction of the caller, only
     * soft-deleted ones, since a live one would have refused the folder delete this exists for —
     * over to {@code generalFolderId}.
     *
     * <p>This is what actually lets an apparently-empty folder be deleted: the row survives so a
     * restore and the deletions log both keep working, and it has to point <em>somewhere</em> that
     * still exists once the folder itself is gone. General is where an unfiled document already
     * lands by convention (see {@code DestinationSuggestionService}), so a deleted document that
     * outlives its folder joins it there rather than needing a new place invented for it.
     *
     * <p>Native and a bulk statement rather than loading and saving each row: a folder can carry
     * years of turnover, and this runs inside the same transaction as the delete itself.
     */
    @Modifying
    @Query(value = "UPDATE files SET folder_id = :generalFolderId WHERE folder_id = :folderId", nativeQuery = true)
    void reassignFolder(@Param("folderId") UUID folderId, @Param("generalFolderId") UUID generalFolderId);

    long countByDepartmentIdAndDeletedFalse(UUID departmentId);

    long countByUploadedByIdAndDeletedFalse(UUID uploaderId);

    long countByCreatedAtAfter(Instant after);

    /**
     * Global search by part of a document's name or its G.O. number, narrowed by the optional facets.
     *
     * <p><b>Native, and deliberately so.</b> The schema carries GIN trigram indexes on
     * {@code file_name} ({@code idx_files_name_trgm}) and {@code go_number}
     * ({@code idx_files_go_number_trgm}), and {@code ILIKE '%…%'} is what uses them. The JPQL
     * equivalent would be {@code lower(fileName) like …}, which indexes {@code lower(file_name)} — a
     * different expression from the one the index was built on, so every search would fall back to
     * scanning the table. Rewriting this in JPQL would compile, pass its tests on a handful of rows,
     * and quietly stop scaling.
     *
     * <p>Every optional filter is wrapped in a {@code cast(… as …)}: a native query with a plain
     * null parameter leaves PostgreSQL unable to infer the type and it refuses to prepare the
     * statement. The casts are what allow one query to serve all sixteen filter combinations.
     *
     * <p>Search spans every department by choice, not oversight — rule 2 means an approved user may
     * read anything, so scoping results to the caller's own department would hide documents they are
     * entitled to. Soft-deleted rows are excluded, since a deleted document is gone to everything
     * except the admin deletions log.
     */
    @Query(
            value =
                    """
                    select f.* from files f
                    join folders fo on fo.id = f.folder_id
                    where f.is_deleted = false
                      and (f.file_name ilike :pattern or f.go_number ilike :pattern)
                      and (cast(:departmentId as uuid) is null
                           or f.department_id = cast(:departmentId as uuid))
                      and (cast(:category as varchar) is null
                           or fo.category = cast(:category as varchar))
                      and (cast(:from as timestamptz) is null
                           or f.created_at >= cast(:from as timestamptz))
                      and (cast(:to as timestamptz) is null
                           or f.created_at <= cast(:to as timestamptz))
                    order by f.created_at desc
                    """,
            countQuery =
                    """
                    select count(*) from files f
                    join folders fo on fo.id = f.folder_id
                    where f.is_deleted = false
                      and (f.file_name ilike :pattern or f.go_number ilike :pattern)
                      and (cast(:departmentId as uuid) is null
                           or f.department_id = cast(:departmentId as uuid))
                      and (cast(:category as varchar) is null
                           or fo.category = cast(:category as varchar))
                      and (cast(:from as timestamptz) is null
                           or f.created_at >= cast(:from as timestamptz))
                      and (cast(:to as timestamptz) is null
                           or f.created_at <= cast(:to as timestamptz))
                    """,
            nativeQuery = true)
    Page<StoredFile> search(
            @Param("pattern") String pattern,
            @Param("departmentId") String departmentId,
            @Param("category") String category,
            @Param("from") Instant from,
            @Param("to") Instant to,
            Pageable pageable);

    /**
     * The oldest live document carrying the same G.O. number as {@code excludeId}, if there is one.
     *
     * <p>This is what a duplicate <em>is</em> in this office: the G.O. number is the reference the
     * order was issued under, so two documents bearing one number are one order filed twice, whatever
     * the two files happen to be named. Names are no use for the same reason — the same order arrives
     * as "scan0001.pdf" from one desk and "GO 123 Revenue.pdf" from another.
     *
     * <p>Both sides are stripped to letters and digits before they are compared, so the punctuation
     * and spacing a scan happens to produce cannot hide a match. {@code idx_files_go_number_normalised}
     * is built on exactly this expression; changing the expression here without changing the index
     * turns every upload into a table scan.
     *
     * <p><b>Oldest first</b>, not newest: the notification has to name the copy that was already
     * there, and if a number has been filed three times the first one is the original in all three
     * readings.
     *
     * <p>Soft-deleted rows are excluded. A document somebody has already withdrawn is not something
     * an administrator needs to be sent to resolve.
     */
    @Query(
            value =
                    """
                    select f.* from files f
                    where f.is_deleted = false
                      and f.id <> cast(:excludeId as uuid)
                      and f.go_number is not null
                      and regexp_replace(lower(f.go_number), '[^a-z0-9]', '', 'g') = :normalised
                    order by f.created_at asc
                    limit 1
                    """,
            nativeQuery = true)
    Optional<StoredFile> findEarliestLiveWithNormalisedGoNumber(
            @Param("normalised") String normalised, @Param("excludeId") String excludeId);

    /**
     * The oldest live document with the same file name as {@code excludeId}, if there is one.
     *
     * <p>The weaker of the two duplicate signals, and only consulted when the G.O. numbers have
     * settled nothing. A name is what a scanner or a clerk happened to call the file rather than
     * anything the order itself says, so a match here is worth reporting but is not proof.
     *
     * <p>{@code goNumber} is the guard that keeps it from being noise. Scanners hand out names like
     * "scan0001.pdf" by the hundred, and two unrelated orders sharing one is a coincidence, not a
     * duplicate — so a candidate whose G.O. number is known and <em>differs</em> from the subject's
     * is excluded outright. Where either side has no number, there is nothing to contradict the
     * name and the match stands. Pass null when the subject's own number is unknown.
     *
     * <p>Normalised to lower case with runs of whitespace collapsed, matching
     * {@code idx_files_name_normalised}; the same caution about keeping the two in step applies as
     * for the G.O. number above.
     */
    @Query(
            value =
                    """
                    select f.* from files f
                    where f.is_deleted = false
                      and f.id <> cast(:excludeId as uuid)
                      and btrim(regexp_replace(lower(f.file_name), '\s+', ' ', 'g')) = :normalisedName
                      and (cast(:goNumber as varchar) is null
                           or f.go_number is null
                           or regexp_replace(lower(f.go_number), '[^a-z0-9]', '', 'g')
                              = cast(:goNumber as varchar))
                    order by f.created_at asc
                    limit 1
                    """,
            nativeQuery = true)
    Optional<StoredFile> findEarliestLiveWithNormalisedFileName(
            @Param("normalisedName") String normalisedName,
            @Param("goNumber") String goNumber,
            @Param("excludeId") String excludeId);

    /** The home dashboard's "recently filed", across every department. */
    Page<StoredFile> findByDeletedFalse(Pageable pageable);

    long countByDeletedFalse();

    // ---------------------------------------------------------------------- reporting

    /**
     * Interface projections rather than {@code Object[]}: the column aliases below bind to these
     * getters by name, so a renamed alias fails loudly instead of producing an array whose second
     * element quietly changed meaning.
     */
    interface DepartmentCount {
        UUID getDepartmentId();

        long getTotal();
    }

    interface UploaderCount {
        UUID getUserId();

        String getFullName();

        String getDepartmentName();

        long getTotal();
    }

    /** Live documents per department — the "holdings" column of the report. */
    @Query("""
            select f.department.id as departmentId, count(f) as total
            from StoredFile f
            where f.deleted = false
            group by f.department.id
            """)
    List<DepartmentCount> countLiveByDepartment();

    /**
     * Documents filed per department in a period.
     *
     * <p>Counts deleted rows too, deliberately: an upload is an event that happened, and a report of
     * activity that quietly forgets the documents someone later withdrew would understate the work
     * and could hide a pattern worth seeing.
     */
    @Query("""
            select f.department.id as departmentId, count(f) as total
            from StoredFile f
            where f.createdAt >= :from and f.createdAt < :to
            group by f.department.id
            """)
    List<DepartmentCount> countUploadsByDepartment(@Param("from") Instant from, @Param("to") Instant to);

    @Query("""
            select u.id as userId, u.fullName as fullName, d.name as departmentName, count(f) as total
            from StoredFile f
            join f.uploadedBy u
            left join u.department d
            where f.createdAt >= :from and f.createdAt < :to
            group by u.id, u.fullName, d.name
            order by count(f) desc
            """)
    List<UploaderCount> countUploadsByUploader(
            @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);

    long countByCreatedAtGreaterThanEqualAndCreatedAtLessThan(Instant from, Instant to);

    interface MonthCount {
        String getMonth();

        long getTotal();
    }

    /**
     * Documents filed per calendar month.
     *
     * <p>Native, because grouping by month means {@code date_trunc}, which JPQL has no portable way
     * to express. The timestamp is converted to Asia/Kolkata first: the office's March is what the
     * report must show, not UTC's, and a document filed at 4am IST on the 1st belongs to March
     * rather than to February.
     */
    @Query(
            value =
                    """
                    select to_char(date_trunc('month', created_at at time zone 'Asia/Kolkata'), 'YYYY-MM') as month,
                           count(*) as total
                    from files
                    where created_at >= :from and created_at < :to
                    group by 1
                    order by 1
                    """,
            nativeQuery = true)
    List<MonthCount> countUploadsByMonth(@Param("from") Instant from, @Param("to") Instant to);
}
