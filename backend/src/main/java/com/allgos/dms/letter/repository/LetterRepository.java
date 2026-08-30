package com.allgos.dms.letter.repository;

import com.allgos.dms.letter.entity.Letter;
import com.allgos.dms.letter.entity.LetterStatus;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LetterRepository extends JpaRepository<Letter, UUID> {

    /** A person's own letters, newest first. */
    Page<Letter> findByAuthorIdOrderByCreatedAtDesc(UUID authorId, Pageable pageable);

    /**
     * The finished letters, or the drafts — one listing with the status decided by the caller.
     *
     * <p>Ordered by when it was last touched rather than when it was started: a draft is something
     * you come back to, and the one you were writing five minutes ago belongs at the top even if you
     * began it last week.
     */
    Page<Letter> findByAuthorIdAndStatusOrderByUpdatedAtDesc(
            UUID authorId, LetterStatus status, Pageable pageable);

    /**
     * Scoped by author in the query rather than checked after loading, so there is no arrangement of
     * parameters that returns somebody else's letter.
     */
    Optional<Letter> findByIdAndAuthorId(UUID id, UUID authorId);

    long countByTemplateId(UUID templateId);
}
