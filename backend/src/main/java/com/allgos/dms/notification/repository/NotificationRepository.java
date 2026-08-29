package com.allgos.dms.notification.repository;

import com.allgos.dms.notification.entity.Notification;
import java.util.Collection;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

    Page<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /** The "Unread" filter on the notifications screen. */
    Page<Notification> findByUserIdAndReadFalseOrderByCreatedAtDesc(UUID userId, Pageable pageable);

    /**
     * The notifications screen, with its filters applied in the database.
     *
     * <p>Both filters are optional and both are applied here rather than to the page that comes
     * back. Filtering a fetched page would only ever search the twenty rows already on screen,
     * which is the opposite of what somebody hunting for one notification from last month needs.
     *
     * <p>{@code allTypes} carries the "no category chosen" case instead of a null collection: an
     * empty {@code in ()} is not valid SQL, so the flag short-circuits the clause and the callers
     * pass a placeholder collection that is never read.
     */
    @Query("""
            select n from Notification n
            where n.user.id = :userId
              and (:unreadOnly = false or n.read = false)
              and (:allTypes = true or n.type in :types)
            order by n.createdAt desc
            """)
    Page<Notification> search(
            @Param("userId") UUID userId,
            @Param("unreadOnly") boolean unreadOnly,
            @Param("allTypes") boolean allTypes,
            @Param("types") Collection<String> types,
            Pageable pageable);

    /**
     * Whether anybody has already been told this exact thing about this exact subject.
     *
     * <p>What it exists for: two copies of one document are each checked for duplicates on their
     * own, and without this the pair would be reported twice — once from each side. The report
     * always points at the newer copy, so its {@code entityRef} is what identifies the pair.
     */
    boolean existsByTypeAndEntityRef(String type, String entityRef);

    /** The unread badge on the notification bell. */
    long countByUserIdAndReadFalse(UUID userId);

    /**
     * Marks everything unread as read in one statement.
     *
     * <p>Loading a user's whole backlog to flip a boolean on each row would be pointless work, so
     * this is a bulk update. It bypasses the persistence context, which is why the caller must not
     * be holding stale Notification entities — none of them do.
     */
    @Modifying(clearAutomatically = true)
    @Query("update Notification n set n.read = true where n.user.id = :userId and n.read = false")
    int markAllReadFor(@Param("userId") UUID userId);
}
