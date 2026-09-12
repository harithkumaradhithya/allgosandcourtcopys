package com.allgos.dms.ad.service;

import com.allgos.dms.ad.dto.AdRequests;
import com.allgos.dms.ad.dto.AdResponses.AdView;
import com.allgos.dms.ad.dto.AdResponses.AdminAdView;
import com.allgos.dms.ad.entity.Ad;
import com.allgos.dms.ad.entity.AdPlacement;
import com.allgos.dms.ad.repository.AdRepository;
import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.common.storage.StorageService;
import com.allgos.dms.user.entity.User;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * The adverts: what runs where, and the admin maintenance behind it.
 *
 * <p>Reading is open to every signed-in user and writing is administrators only — the same division
 * as the phonebook, and for a stronger reason: an advert is the one thing in this application that a
 * reader did not ask to see, so the set of people who can put one in front of the whole office
 * should be exactly the set who can already approve accounts.
 *
 * <p>Media lives in the same private bucket as the documents and is handed out as a short-lived
 * presigned URL, never as a bucket path. That is inconvenient — the URL expires, so the client
 * re-fetches the advert rather than caching its address forever — and it is the right trade: the
 * bucket an advert lands in also holds court orders, and nothing should teach it to serve publicly.
 */
@Service
public class AdService {

    private static final Logger log = LoggerFactory.getLogger(AdService.class);

    /** Where an advert's media sits in the bucket, well away from the department tree. */
    private static final String MEDIA_PREFIX = "ads";

    private final AdRepository adRepository;
    private final AdMediaValidator mediaValidator;
    private final StorageService storageService;
    private final AuditService auditService;

    public AdService(
            AdRepository adRepository,
            AdMediaValidator mediaValidator,
            StorageService storageService,
            AuditService auditService) {
        this.adRepository = adRepository;
        this.mediaValidator = mediaValidator;
        this.storageService = storageService;
        this.auditService = auditService;
    }

    // --------------------------------------------------------------------------- read

    /**
     * What the given slot may show right now.
     *
     * <p>Returns the whole live list rather than picking one, because which of several a reader sees
     * is a client decision — the slot draws one and leaves it there for the visit — and because a
     * server that picked would need per-user state to rotate fairly.
     */
    @Transactional(readOnly = true)
    public List<AdView> live(AdPlacement placement) {
        Instant now = Instant.now();
        return adRepository.live(placement, now).stream()
                .map(ad -> AdView.from(ad, storageService.presignedGet(ad.getMediaKey())))
                .toList();
    }

    /** Every advert, live or not, grouped by slot — the admin table. */
    @Transactional(readOnly = true)
    public List<AdminAdView> listAll() {
        Instant now = Instant.now();
        return adRepository.findAllByOrderByPlacementAscDisplayOrderAscCreatedAtAsc().stream()
                .map(ad -> AdminAdView.from(ad, storageService.presignedGet(ad.getMediaKey()), now))
                .toList();
    }

    // -------------------------------------------------------------------------- counts

    /**
     * Records that an advert was seen, or clicked.
     *
     * <p>Both are deliberately quiet: an unknown id is ignored rather than refused. These are called
     * from a slot that may be holding an advert an admin deleted a moment ago, and an error on the
     * Home screen because a banner went stale would be a worse bug than a lost count.
     */
    @Transactional
    public void recordView(UUID adId) {
        adRepository.recordView(adId);
    }

    @Transactional
    public void recordClick(UUID adId) {
        adRepository.recordClick(adId);
    }

    // -------------------------------------------------------------------------- write

    @Transactional
    public AdminAdView create(AdRequests.SaveAd request, MultipartFile media, User admin) {
        validateCopy(request);

        AdMediaValidator.Accepted accepted = mediaValidator.validate(media);

        Ad ad = new Ad();
        apply(ad, request);
        ad.setCreatedBy(admin);

        String key = storageService.newKey(MEDIA_PREFIX, accepted.fileName());
        storeMedia(key, media, accepted);
        setMedia(ad, key, accepted);

        try {
            adRepository.saveAndFlush(ad);
        } catch (RuntimeException ex) {
            // Storage is not transactional, so an object whose row never committed would sit in the
            // bucket forever. Sweep it before the exception leaves.
            storageService.delete(key);
            throw ex;
        }

        auditService.record(
                admin,
                AuditAction.AD_CREATED,
                "ad",
                ad.getId(),
                Map.of("title", ad.getTitle(), "placement", ad.getPlacement().name()));

        return AdminAdView.from(ad, storageService.presignedGet(key), Instant.now());
    }

    /**
     * Edits an advert, replacing its media only if a new file came with the request.
     *
     * <p>Most edits are a correction to the wording, and making those re-upload a 4 MB film is how
     * you end up with nobody correcting the wording.
     */
    @Transactional
    public AdminAdView update(UUID adId, AdRequests.SaveAd request, MultipartFile media, User admin) {
        validateCopy(request);

        Ad ad = adRepository.findById(adId).orElseThrow(() -> ApiException.notFound("Advert"));
        apply(ad, request);

        String replacedKey = null;
        String newKey = null;

        if (media != null && !media.isEmpty()) {
            AdMediaValidator.Accepted accepted = mediaValidator.validate(media);
            newKey = storageService.newKey(MEDIA_PREFIX, accepted.fileName());
            storeMedia(newKey, media, accepted);

            replacedKey = ad.getMediaKey();
            setMedia(ad, newKey, accepted);
        }

        try {
            adRepository.saveAndFlush(ad);
        } catch (RuntimeException ex) {
            if (newKey != null) {
                storageService.delete(newKey);
            }
            throw ex;
        }

        // Only once the row is safely written, and only the object nothing points at any more.
        if (replacedKey != null) {
            storageService.delete(replacedKey);
        }

        auditService.record(
                admin,
                AuditAction.AD_UPDATED,
                "ad",
                ad.getId(),
                Map.of("title", ad.getTitle(), "mediaReplaced", replacedKey != null));

        return AdminAdView.from(ad, storageService.presignedGet(ad.getMediaKey()), Instant.now());
    }

    /**
     * Removes an advert outright.
     *
     * <p>Hard rather than soft, unlike a document. A document is the office's record and its deletion
     * is usually a mistake somebody will want undone; an advert is a poster on a wall, and the
     * reason it is coming down is usually that it should not be up.
     */
    @Transactional
    public void delete(UUID adId, User admin) {
        Ad ad = adRepository.findById(adId).orElseThrow(() -> ApiException.notFound("Advert"));

        String key = ad.getMediaKey();
        String title = ad.getTitle();

        adRepository.delete(ad);
        adRepository.flush();

        storageService.delete(key);

        auditService.record(admin, AuditAction.AD_DELETED, "ad", adId, Map.of("title", title));
    }

    // ------------------------------------------------------------------------ internals

    /**
     * The two rules a single-field annotation cannot express.
     *
     * <p>Both would otherwise be noticed only by a reader: a button that is labelled but points
     * nowhere, and an advert scheduled to finish before it starts — which simply never appears, and
     * looks from the admin's chair exactly like a broken feature.
     */
    private void validateCopy(AdRequests.SaveAd request) {
        boolean hasLabel = isPresent(request.ctaLabel());
        boolean hasUrl = isPresent(request.ctaUrl());
        if (hasLabel != hasUrl) {
            throw ApiException.badRequest(
                    "AD_CTA_INCOMPLETE", "A button needs both a label and a web address, or neither.");
        }

        if (request.startsAt() != null
                && request.endsAt() != null
                && !request.endsAt().isAfter(request.startsAt())) {
            throw ApiException.badRequest("AD_WINDOW_INVALID", "The end date must be after the start date.");
        }
    }

    private void apply(Ad ad, AdRequests.SaveAd request) {
        ad.setTitle(request.title().trim());
        ad.setPlacement(request.placement());
        ad.setAltText(request.altText().trim());
        ad.setHeadline(blankToNull(request.headline()));
        ad.setCaption(blankToNull(request.caption()));
        ad.setDetailTitle(request.detailTitle().trim());
        // Stripped at the ends only: the line breaks inside are the author's paragraphing.
        ad.setDetailBody(request.detailBody().strip());
        ad.setCtaLabel(blankToNull(request.ctaLabel()));
        ad.setCtaUrl(blankToNull(request.ctaUrl()));
        ad.setAutoplay(request.autoplay());
        ad.setLoopMedia(request.loopMedia());
        ad.setDismissible(request.dismissible());
        ad.setActive(request.active());
        ad.setStartsAt(request.startsAt());
        ad.setEndsAt(request.endsAt());
        ad.setDisplayOrder(request.displayOrder());
    }

    private void setMedia(Ad ad, String key, AdMediaValidator.Accepted accepted) {
        ad.setMediaKey(key);
        ad.setMediaKind(accepted.kind());
        ad.setMediaContentType(accepted.contentType());
        ad.setMediaFileName(accepted.fileName());
        ad.setMediaSizeBytes(accepted.sizeBytes());
    }

    private void storeMedia(String key, MultipartFile media, AdMediaValidator.Accepted accepted) {
        try (InputStream stream = media.getInputStream()) {
            storageService.put(key, stream, accepted.contentType(), accepted.sizeBytes());
        } catch (IOException ex) {
            log.error("Could not read advert media {}", accepted.fileName(), ex);
            throw ApiException.badRequest(
                    "AD_MEDIA_UNREADABLE", "%s could not be read.".formatted(accepted.fileName()));
        }
    }

    private static boolean isPresent(String value) {
        return value != null && !value.isBlank();
    }

    private static String blankToNull(String value) {
        return isPresent(value) ? value.trim() : null;
    }
}
