package com.allgos.dms.ad.repository;

import com.allgos.dms.ad.entity.Ad;
import com.allgos.dms.ad.entity.AdPlacement;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdRepository extends JpaRepository<Ad, UUID> {

    /**
     * What a slot should show: active, inside its window, lowest order first.
     *
     * <p>The window is evaluated here rather than in Java so that a filter and an index can do the
     * work — and, more importantly, so there is one definition of "live" that both the member API
     * and the admin table agree with.
     */
    @Query("""
            SELECT a FROM Ad a
            WHERE a.placement = :placement
              AND a.active = true
              AND (a.startsAt IS NULL OR a.startsAt <= :now)
              AND (a.endsAt IS NULL OR a.endsAt > :now)
            ORDER BY a.displayOrder ASC, a.createdAt ASC
            """)
    List<Ad> live(@Param("placement") AdPlacement placement, @Param("now") Instant now);

    /** The admin table: everything, grouped by slot and in the order each slot runs. */
    List<Ad> findAllByOrderByPlacementAscDisplayOrderAscCreatedAtAsc();

    /**
     * Counters, bumped in the database rather than read-modify-written.
     *
     * <p>A hundred people open Home in the same minute; loading the row, adding one and saving it
     * would lose most of those to the last writer. This is also why it is a JPQL update rather than
     * a setter: it skips {@code @PreUpdate}, so a view does not make the advert look edited.
     */
    @Modifying
    @Query("UPDATE Ad a SET a.viewCount = a.viewCount + 1 WHERE a.id = :id")
    int recordView(@Param("id") UUID id);

    @Modifying
    @Query("UPDATE Ad a SET a.clickCount = a.clickCount + 1 WHERE a.id = :id")
    int recordClick(@Param("id") UUID id);
}
