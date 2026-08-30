package com.allgos.dms.letter.controller;

import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.security.AuthenticatedUser;
import com.allgos.dms.letter.dto.LetterRequests;
import com.allgos.dms.letter.dto.LetterResponses.LetterSummary;
import com.allgos.dms.letter.dto.LetterResponses.LetterView;
import com.allgos.dms.letter.entity.LetterStatus;
import com.allgos.dms.letter.service.LetterService;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Writing letters.
 *
 * <p>Every method is scoped to the caller by the service, which queries by author id. There is no
 * endpoint that lists or opens somebody else's letter.
 */
@RestController
@RequestMapping("/api/v1/letters")
public class LetterController {

    private static final int MAX_PAGE_SIZE = 100;

    private final LetterService letterService;

    public LetterController(LetterService letterService) {
        this.letterService = letterService;
    }

    /**
     * The caller's own letters.
     *
     * <p>Finished ones unless the caller asks for drafts. Two listings rather than one mixed list:
     * a draft is not something that was sent, and a screen that showed both together would be asking
     * the reader to tell them apart by a badge.
     */
    @GetMapping
    public PageResponse<LetterSummary> mine(
            @RequestParam(defaultValue = "FINAL") LetterStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        return letterService.listMine(principal.user(), status, pageable(page, size));
    }

    @GetMapping("/{letterId}")
    public LetterView get(
            @PathVariable UUID letterId, @AuthenticationPrincipal AuthenticatedUser principal) {
        return letterService.get(letterId, principal.user());
    }

    @PostMapping
    public LetterView create(
            @Valid @RequestBody LetterRequests.SaveLetter request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return letterService.create(request, principal.user());
    }

    @PutMapping("/{letterId}")
    public LetterView update(
            @PathVariable UUID letterId,
            @Valid @RequestBody LetterRequests.SaveLetter request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return letterService.update(letterId, request, principal.user());
    }

    // ---------------------------------------------------------------------------- drafts

    /**
     * Autosave, while somebody is writing.
     *
     * <p>Separate from {@code POST /letters} because it accepts a letter that is not finished — the
     * requirements a letter has are exactly what an autosave cannot enforce. It is called on a timer,
     * so it is quiet: nothing is audited and no notification comes of it.
     */
    @PostMapping("/drafts")
    public LetterView createDraft(
            @Valid @RequestBody LetterRequests.SaveDraft request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return letterService.createDraft(request, principal.user());
    }

    @PutMapping("/drafts/{letterId}")
    public LetterView updateDraft(
            @PathVariable UUID letterId,
            @Valid @RequestBody LetterRequests.SaveDraft request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return letterService.updateDraft(letterId, request, principal.user());
    }

    @DeleteMapping("/drafts/{letterId}")
    public ResponseEntity<Void> discardDraft(
            @PathVariable UUID letterId, @AuthenticationPrincipal AuthenticatedUser principal) {
        letterService.discardDraft(letterId, principal.user());
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{letterId}")
    public ResponseEntity<Void> delete(
            @PathVariable UUID letterId, @AuthenticationPrincipal AuthenticatedUser principal) {
        letterService.delete(letterId, principal.user());
        return ResponseEntity.noContent().build();
    }

    private Pageable pageable(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE));
    }
}
