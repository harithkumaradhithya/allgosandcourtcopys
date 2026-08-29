package com.allgos.dms.admin.controller;

import com.allgos.dms.admin.dto.AdminRequests;
import com.allgos.dms.admin.dto.AdminResponses.MemberCounts;
import com.allgos.dms.admin.dto.AdminResponses.MemberView;
import com.allgos.dms.admin.dto.AdminResponses.RegistrationRequestView;
import com.allgos.dms.admin.service.AdminUserService;
import com.allgos.dms.auth.entity.RegistrationStatus;
import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.common.security.AuthenticatedUser;
import com.allgos.dms.user.entity.UserStatus;
import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Registration review and member administration.
 *
 * <p>
 * The {@code @PreAuthorize} sits on the class, so every method added here is
 * admin-only by
 * default and a new endpoint cannot be left unguarded by forgetting an
 * annotation. A member reaching
 * any of these gets 403 with {@code ACCESS_DENIED}, whatever the web app
 * happens to show them.
 */
@RestController
@RequestMapping("/api/v1/admin")
@PreAuthorize("hasRole('ADMIN')")
public class AdminUserController {

    private static final int MAX_PAGE_SIZE = 100;

    private final AdminUserService adminUserService;

    public AdminUserController(AdminUserService adminUserService) {
        this.adminUserService = adminUserService;
    }

    // ------------------------------------------------------------- registration
    // queue

    /**
     * @param status omit, or pass "all", to see reviewed requests alongside pending
     *               ones
     */
    @GetMapping("/registration-requests")
    public PageResponse<RegistrationRequestView> listRegistrationRequests(
            @RequestParam(defaultValue = "pending") String status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return adminUserService.listRegistrationRequests(
                parseRegistrationStatus(status), pageable(page, size));
    }

    @GetMapping("/registration-requests/{id}")
    public RegistrationRequestView getRegistrationRequest(@PathVariable UUID id) {
        return adminUserService.getRegistrationRequest(id);
    }

    @PostMapping("/registration-requests/{id}/approve")
    public RegistrationRequestView approve(
            @PathVariable UUID id, @AuthenticationPrincipal AuthenticatedUser principal) {
        return adminUserService.approve(id, principal.user());
    }

    @PostMapping("/registration-requests/{id}/reject")
    public RegistrationRequestView reject(
            @PathVariable UUID id,
            @Valid @RequestBody AdminRequests.Reject request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return adminUserService.reject(id, request.reason(), principal.user());
    }

    // ----------------------------------------------------------------------
    // members

    @GetMapping("/members")
    public PageResponse<MemberView> listMembers(
            @RequestParam(defaultValue = "all") String status,
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {

        return adminUserService.listMembers(parseUserStatus(status), q, pageable(page, size));
    }

    @GetMapping("/members/summary")
    public MemberCounts summary() {
        return adminUserService.counts();
    }

    @PatchMapping("/members/{id}/status")
    public MemberView changeStatus(
            @PathVariable UUID id,
            @Valid @RequestBody AdminRequests.ChangeStatus request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return adminUserService.changeStatus(id, request.status(), principal.user());
    }

    /**
     * Grant or withdraw administrative access. Admin-only like everything on this
     * class, so only an
     * admin can make one.
     */
    @PatchMapping("/members/{id}/role")
    public MemberView changeRole(
            @PathVariable UUID id,
            @Valid @RequestBody AdminRequests.ChangeRole request,
            @AuthenticationPrincipal AuthenticatedUser principal) {
        return adminUserService.changeRole(id, request.role(), principal.user());
    }

    // ------------------------------------------------------------------------
    // helpers

    /**
     * Newest first, and the page size is capped so one request cannot ask for the
     * whole table.
     */
    private Pageable pageable(int page, int size) {
        return PageRequest.of(
                Math.max(page, 0),
                Math.clamp(size, 1, MAX_PAGE_SIZE),
                Sort.by(Sort.Direction.DESC, "createdAt"));
    }

    /** @return null for "all", which the service reads as "no filter" */
    private RegistrationStatus parseRegistrationStatus(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status)) {
            return null;
        }
        try {
            return RegistrationStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("STATUS_INVALID", "Unknown request status: " + status);
        }
    }

    private UserStatus parseUserStatus(String status) {
        if (status == null || status.isBlank() || "all".equalsIgnoreCase(status)) {
            return null;
        }
        try {
            return UserStatus.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw ApiException.badRequest("STATUS_INVALID", "Unknown account status: " + status);
        }
    }
}
