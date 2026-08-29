package com.allgos.dms.notification.controller;

import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.security.AuthenticatedUser;
import com.allgos.dms.notification.dto.NotificationRequests;
import com.allgos.dms.notification.dto.NotificationResponses.AnnouncementSent;
import com.allgos.dms.notification.dto.NotificationResponses.CategoryOption;
import com.allgos.dms.notification.dto.NotificationResponses.NotificationView;
import com.allgos.dms.notification.dto.NotificationResponses.UnreadCount;
import com.allgos.dms.notification.entity.NotificationCategory;
import com.allgos.dms.notification.service.NotificationService;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * A user's own notifications.
 *
 * <p>Every method here is scoped to the authenticated caller by the service, which queries by user
 * id rather than filtering afterwards. There is deliberately no endpoint that reads anybody else's:
 * an admin who wants to know what a member was told reads the audit log, which is the record of what
 * happened rather than a copy of someone's inbox.
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class NotificationController {

    private static final int MAX_PAGE_SIZE = 100;

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    /**
     * @param category zero or more category ids, repeated — {@code ?category=deletions&category=uploads}.
     *     Anything unrecognised is dropped rather than rejected, so a stale bookmark shows the
     *     whole list instead of an error.
     */
    @GetMapping
    public PageResponse<NotificationView> list(
            @RequestParam(defaultValue = "false") boolean unread,
            @RequestParam(required = false) List<String> category,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        return notificationService.list(
                principal.user(), unread, parseCategories(category), pageable(page, size));
    }

    /** The filter options for whoever is asking — see {@code NotificationService#categoriesFor}. */
    @GetMapping("/categories")
    public List<CategoryOption> categories(@AuthenticationPrincipal AuthenticatedUser principal) {
        return notificationService.categoriesFor(principal.user());
    }

    /**
     * Just the badge number.
     *
     * <p>Separate from the list because the bell asks for this on every screen while the list is
     * opened occasionally — one count is a far cheaper question than a page of rows.
     */
    @GetMapping("/unread-count")
    public UnreadCount unreadCount(@AuthenticationPrincipal AuthenticatedUser principal) {
        return new UnreadCount(notificationService.unreadCount(principal.user()));
    }

    /**
     * Sends a message to everyone else with an account.
     *
     * <p>Administrators only. Circulars are the office speaking, not any one clerk, and a member
     * with something everybody needs to know tells an admin, who sends it under their own name.
     * The rest of this controller stays open to every approved user — reading your own
     * notifications is not an administrative act.
     *
     * <p>The guard is here as well as on the screen: the composer is hidden from a member, and a
     * hidden button is a courtesy, not a rule.
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/announcements")
    public AnnouncementSent announce(
            @Valid @RequestBody NotificationRequests.Announce request,
            @AuthenticationPrincipal AuthenticatedUser principal) {

        return new AnnouncementSent(notificationService.announce(principal.user(), request.message()));
    }

    @PostMapping("/{notificationId}/read")
    public NotificationView markRead(
            @PathVariable UUID notificationId, @AuthenticationPrincipal AuthenticatedUser principal) {
        return notificationService.markRead(principal.user(), notificationId);
    }

    @PostMapping("/read-all")
    public UnreadCount markAllRead(@AuthenticationPrincipal AuthenticatedUser principal) {
        notificationService.markAllRead(principal.user());
        return new UnreadCount(0);
    }

    /**
     * Newest first. The repository methods already order, so no Sort is passed — adding one here
     * would append a second ORDER BY on top of theirs.
     */
    private static List<NotificationCategory> parseCategories(List<String> requested) {
        if (requested == null) {
            return List.of();
        }
        return requested.stream()
                .map(NotificationCategory::parse)
                .flatMap(Optional::stream)
                .distinct()
                .toList();
    }

    private Pageable pageable(int page, int size) {
        return PageRequest.of(Math.max(page, 0), Math.clamp(size, 1, MAX_PAGE_SIZE));
    }
}
