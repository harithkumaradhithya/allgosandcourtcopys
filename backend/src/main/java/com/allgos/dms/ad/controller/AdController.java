package com.allgos.dms.ad.controller;

import com.allgos.dms.ad.dto.AdResponses.AdView;
import com.allgos.dms.ad.entity.AdPlacement;
import com.allgos.dms.ad.service.AdService;
import java.util.List;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The reading side of the adverts: what a slot should show, and the two counters.
 *
 * <p>No {@code @PreAuthorize}. Every signed-in user sees the same adverts — there is no targeting in
 * this application and there should not be one, because the audience is a hundred colleagues in one
 * office and an advert that follows a named person around is a different product.
 *
 * <p>The counters are {@code POST}s with no body and no response. They are fire-and-forget from the
 * client's side: a slot that failed to record a view must still draw, and a click must open its
 * popup whether or not the count reached the server.
 */
@RestController
@RequestMapping("/api/v1/ads")
public class AdController {

    private final AdService adService;

    public AdController(AdService adService) {
        this.adService = adService;
    }

    @GetMapping
    public List<AdView> forPlacement(@RequestParam AdPlacement placement) {
        return adService.live(placement);
    }

    @PostMapping("/{adId}/view")
    public ResponseEntity<Void> recordView(@PathVariable UUID adId) {
        adService.recordView(adId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{adId}/click")
    public ResponseEntity<Void> recordClick(@PathVariable UUID adId) {
        adService.recordClick(adId);
        return ResponseEntity.noContent().build();
    }
}
