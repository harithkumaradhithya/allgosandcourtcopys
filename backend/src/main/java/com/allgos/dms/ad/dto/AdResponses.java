package com.allgos.dms.ad.dto;

import com.allgos.dms.ad.entity.Ad;
import com.allgos.dms.ad.entity.AdMediaKind;
import com.allgos.dms.ad.entity.AdPlacement;
import java.time.Instant;
import java.util.UUID;

/** Response bodies for the adverts. */
public final class AdResponses {

    /**
     * An advert as a reader receives it.
     *
     * <p>Carries what is needed to draw the card and to fill the popup, and nothing else — no
     * schedule, no counters, no object key, no note of who created it. The popup copy travels with
     * the card rather than being fetched on click so that opening it is instant and costs no
     * request; it is a paragraph of text the admin has already decided to publish, so there is
     * nothing gained by withholding it until the click.
     */
    public record AdView(
            UUID id,
            AdPlacement placement,
            AdMediaKind mediaKind,
            /** Short-lived and presigned. The bucket is never public — see StorageService. */
            String mediaUrl,
            String mediaContentType,
            String altText,
            String headline,
            String caption,
            String detailTitle,
            String detailBody,
            String ctaLabel,
            String ctaUrl,
            boolean autoplay,
            boolean loopMedia,
            boolean dismissible) {

        public static AdView from(Ad ad, String mediaUrl) {
            return new AdView(
                    ad.getId(),
                    ad.getPlacement(),
                    ad.getMediaKind(),
                    mediaUrl,
                    ad.getMediaContentType(),
                    ad.getAltText(),
                    ad.getHeadline(),
                    ad.getCaption(),
                    ad.getDetailTitle(),
                    ad.getDetailBody(),
                    ad.getCtaLabel(),
                    ad.getCtaUrl(),
                    ad.isAutoplay(),
                    ad.isLoopMedia(),
                    ad.isDismissible());
        }
    }

    /**
     * The same advert as its owner sees it: the schedule, the counters, and whether it is on air
     * right now.
     *
     * <p>{@code live} is computed rather than left to the screen. "Active" and "running" are not the
     * same thing once a window is set, and an admin looking at a table of twelve adverts should not
     * have to compare two timestamps against the clock to work out why one of them is not showing.
     */
    public record AdminAdView(
            UUID id,
            String title,
            AdPlacement placement,
            AdMediaKind mediaKind,
            String mediaUrl,
            String mediaContentType,
            String mediaFileName,
            long mediaSizeBytes,
            String altText,
            String headline,
            String caption,
            String detailTitle,
            String detailBody,
            String ctaLabel,
            String ctaUrl,
            boolean autoplay,
            boolean loopMedia,
            boolean dismissible,
            boolean active,
            boolean live,
            Instant startsAt,
            Instant endsAt,
            int displayOrder,
            long viewCount,
            long clickCount,
            String createdByName,
            Instant createdAt,
            Instant updatedAt) {

        public static AdminAdView from(Ad ad, String mediaUrl, Instant now) {
            return new AdminAdView(
                    ad.getId(),
                    ad.getTitle(),
                    ad.getPlacement(),
                    ad.getMediaKind(),
                    mediaUrl,
                    ad.getMediaContentType(),
                    ad.getMediaFileName(),
                    ad.getMediaSizeBytes(),
                    ad.getAltText(),
                    ad.getHeadline(),
                    ad.getCaption(),
                    ad.getDetailTitle(),
                    ad.getDetailBody(),
                    ad.getCtaLabel(),
                    ad.getCtaUrl(),
                    ad.isAutoplay(),
                    ad.isLoopMedia(),
                    ad.isDismissible(),
                    ad.isActive(),
                    ad.isLiveAt(now),
                    ad.getStartsAt(),
                    ad.getEndsAt(),
                    ad.getDisplayOrder(),
                    ad.getViewCount(),
                    ad.getClickCount(),
                    ad.getCreatedBy() == null ? null : ad.getCreatedBy().getFullName(),
                    ad.getCreatedAt(),
                    ad.getUpdatedAt());
        }
    }

    private AdResponses() {}
}
