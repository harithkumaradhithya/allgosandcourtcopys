package com.allgos.dms.ad.entity;

import com.allgos.dms.common.entity.BaseEntity;
import com.allgos.dms.user.entity.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/**
 * One advertisement: a piece of media the office has chosen to carry, and everything it says.
 *
 * <p>An advert is configuration rather than content — an admin uploads it, writes both the card and
 * the popup behind it, sets when it runs, and it appears without anybody touching the application.
 * Nothing about it is hard-coded except <em>where</em> it may appear, which is {@link AdPlacement}.
 *
 * <p>Two things are deliberately absent, and both are absences the reader benefits from: there is no
 * flag that lets sound start on its own, and there is no placement value for a screen somebody is
 * working on. See the class notes on {@link AdPlacement} and V20.
 */
@Entity
@Table(name = "ads")
@Getter
@Setter
@NoArgsConstructor
public class Ad extends BaseEntity {

    /** The admin's own name for it. Shown in the management table and nowhere a member can see. */
    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private AdPlacement placement;

    // ------------------------------------------------------------------------ the media

    @Column(name = "media_kind", nullable = false)
    private AdMediaKind mediaKind;

    /** The object key. Never handed out; the reader gets a short-lived presigned URL instead. */
    @Column(name = "media_key", nullable = false)
    private String mediaKey;

    @Column(name = "media_content_type", nullable = false)
    private String mediaContentType;

    @Column(name = "media_file_name", nullable = false)
    private String mediaFileName;

    @Column(name = "media_size_bytes", nullable = false)
    private long mediaSizeBytes;

    /**
     * What the media says, for somebody who cannot see it. Required: an advert carries no
     * surrounding prose to fall back on, so without this the slot is an unlabelled click target.
     */
    @Column(name = "alt_text", nullable = false)
    private String altText;

    // ------------------------------------------------------------------------- the card

    @Column
    private String headline;

    @Column
    private String caption;

    // ------------------------------------------------------------------------ the popup

    @Column(name = "detail_title", nullable = false)
    private String detailTitle;

    /** Long copy, kept exactly as typed — the line breaks are the author's paragraphing. */
    @Column(name = "detail_body", nullable = false, columnDefinition = "text")
    private String detailBody;

    /** Both or neither, enforced by {@code ads_cta_pair} in V20. */
    @Column(name = "cta_label")
    private String ctaLabel;

    @Column(name = "cta_url")
    private String ctaUrl;

    // -------------------------------------------------------------------- how it behaves

    /** Video only, and muted whatever this says. */
    @Column(nullable = false)
    private boolean autoplay = true;

    @Column(name = "loop_media", nullable = false)
    private boolean loopMedia = true;

    @Column(nullable = false)
    private boolean dismissible = true;

    // --------------------------------------------------------------------- the schedule

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "starts_at")
    private Instant startsAt;

    @Column(name = "ends_at")
    private Instant endsAt;

    @Column(name = "display_order", nullable = false)
    private int displayOrder = 0;

    // ------------------------------------------------------------------------- counters

    @Column(name = "view_count", nullable = false)
    private long viewCount = 0;

    @Column(name = "click_count", nullable = false)
    private long clickCount = 0;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by")
    private User createdBy;

    /**
     * Whether it would be shown right now — active, and inside its window if it has one.
     *
     * <p>The reading query asks the database the same question; this is for the admin table, which
     * loads every advert including the ones that are over, and has to say which is which.
     */
    public boolean isLiveAt(Instant now) {
        return active
                && (startsAt == null || !startsAt.isAfter(now))
                && (endsAt == null || endsAt.isAfter(now));
    }
}
