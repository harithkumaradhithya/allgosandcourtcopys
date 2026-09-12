package com.allgos.dms.ad.controller;

import com.allgos.dms.ad.dto.AdRequests;
import com.allgos.dms.ad.dto.AdResponses.AdminAdView;
import com.allgos.dms.ad.service.AdService;
import com.allgos.dms.common.security.AuthenticatedUser;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Maintaining the adverts.
 *
 * <p>As with the other admin controllers, {@code @PreAuthorize} sits on the class so a method added
 * later cannot be left unguarded.
 *
 * <p>Every write is multipart, with the advert's wording as a JSON part beside the file rather than
 * as a scatter of form fields. An advert has twenty settings including two timestamps and six
 * booleans, and flattening those into {@code @RequestParam}s would put the validation messages —
 * which say what an administrator did wrong — out of reach of bean validation.
 */
@RestController
@RequestMapping("/api/v1/admin/ads")
@PreAuthorize("hasRole('ADMIN')")
public class AdminAdController {

    private final AdService adService;

    public AdminAdController(AdService adService) {
        this.adService = adService;
    }

    /** Every advert, including the ones that are switched off or whose window has closed. */
    @GetMapping
    public List<AdminAdView> list() {
        return adService.listAll();
    }

    @PostMapping(consumes = "multipart/form-data")
    public AdminAdView create(
            @Valid @RequestPart("ad") AdRequests.SaveAd request,
            @RequestPart("media") MultipartFile media,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return adService.create(request, media, principal.user());
    }

    /** The media part is optional here: an edit is usually a correction to the wording. */
    @PutMapping(path = "/{adId}", consumes = "multipart/form-data")
    public AdminAdView update(
            @PathVariable UUID adId,
            @Valid @RequestPart("ad") AdRequests.SaveAd request,
            @RequestPart(name = "media", required = false) MultipartFile media,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return adService.update(adId, request, media, principal.user());
    }

    @DeleteMapping("/{adId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID adId, @AuthenticationPrincipal AuthenticatedUser principal) {
        adService.delete(adId, principal.user());
        return ResponseEntity.noContent().build();
    }
}
