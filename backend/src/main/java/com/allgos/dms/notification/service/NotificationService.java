package com.allgos.dms.notification.service;

import com.allgos.dms.audit.entity.AuditAction;
import com.allgos.dms.audit.repository.AuditLogRepository;
import com.allgos.dms.audit.service.AuditService;
import com.allgos.dms.common.dto.PageResponse;
import com.allgos.dms.common.exception.ApiException;
import com.allgos.dms.notification.dto.NotificationResponses.CategoryOption;
import com.allgos.dms.notification.dto.NotificationResponses.NotificationView;
import com.allgos.dms.notification.entity.Notification;
import com.allgos.dms.notification.entity.NotificationCategory;
import com.allgos.dms.notification.entity.NotificationType;
import com.allgos.dms.notification.repository.NotificationRepository;
import com.allgos.dms.user.entity.User;
import com.allgos.dms.user.entity.UserRole;
import com.allgos.dms.user.entity.UserStatus;
import com.allgos.dms.user.repository.UserRepository;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NotificationService {

    /** How long one person must wait between announcements. */
    private static final Duration COOLDOWN = Duration.ofMinutes(1);

    /** Stands in for the type list when no category is chosen; the query never looks at it. */
    private static final Set<String> PLACEHOLDER_TYPES = Set.of("");

    private final NotificationRepository notificationRepository;
    private final UserRepository userRepository;
    private final AuditLogRepository auditLogRepository;
    private final AuditService auditService;

    public NotificationService(
            NotificationRepository notificationRepository,
            UserRepository userRepository,
            AuditLogRepository auditLogRepository,
            AuditService auditService) {
        this.notificationRepository = notificationRepository;
        this.userRepository = userRepository;
        this.auditLogRepository = auditLogRepository;
        this.auditService = auditService;
    }

    @Transactional
    public void notify(User recipient, String type, String title, String body, String entityRef) {
        notificationRepository.save(build(recipient, type, title, body, entityRef));
    }

    private static Notification build(
            User recipient, String type, String title, String body, String entityRef) {
        Notification notification = new Notification();
        notification.setUser(recipient);
        notification.setType(type);
        notification.setTitle(title);
        notification.setBody(body);
        notification.setEntityRef(entityRef);
        return notification;
    }

    /**
     * Fans a notification out to every active admin.
     *
     * <p>For the things only an administrator can act on — a registration waiting in the review
     * queue. What everybody has an interest in, such as a document being filed or removed, goes to
     * {@link #notifyEveryoneExcept} instead.
     */
    @Transactional
    public void notifyAllAdmins(String type, String title, String body, String entityRef) {
        List<User> admins = userRepository.findByRoleAndStatus(UserRole.ADMIN, UserStatus.ACTIVE);
        admins.forEach(admin -> notify(admin, type, title, body, entityRef));
    }

    /**
     * Fans a notification out to the whole office — every active account except the one that caused
     * it. Admins and members alike: an upload is news to everyone, and the person who just did it
     * does not need telling.
     *
     * <p>Written in one {@code saveAll} rather than a save per recipient. With a hundred accounts
     * that is the difference between one statement batch and a hundred round trips on a request the
     * user is waiting on.
     */
    @Transactional
    public int notifyEveryoneExcept(User actor, String type, String title, String body, String entityRef) {
        List<Notification> notifications = userRepository.findByStatus(UserStatus.ACTIVE).stream()
                .filter(recipient -> !recipient.getId().equals(actor.getId()))
                .map(recipient -> build(recipient, type, title, body, entityRef))
                .toList();

        if (!notifications.isEmpty()) {
            notificationRepository.saveAll(notifications);
        }
        return notifications.size();
    }

    /**
     * One person telling the whole office something.
     *
     * <p><b>Administrators only</b>, enforced on the controller. A circular is the office speaking
     * to all 150 accounts at once, and that is an administrative act however useful the news is; a
     * member who knows something everybody needs tells an admin, who sends it under their own name.
     * It is signed either way: the sender's name is the notification's heading, and the send is
     * written to the audit log with the message in it, so an announcement can always be traced back
     * to whoever made it.
     *
     * <p>The cooldown is the one guard. A single click writes a row for every active account, so
     * without it one person could fill 150 inboxes as fast as they can type. A minute is long
     * enough to make that pointless and short enough that nobody sending a real message notices.
     *
     * @return how many people were told, so the sender sees the reach of what they sent
     */
    @Transactional
    public int announce(User sender, String message) {
        String trimmed = message == null ? "" : message.trim();
        if (trimmed.isEmpty()) {
            throw ApiException.badRequest("MESSAGE_REQUIRED", "Write the message you want to send.");
        }

        long recentlySent = auditLogRepository.countByActorIdAndActionAndCreatedAtAfter(
                sender.getId(), AuditAction.ANNOUNCEMENT_SENT, Instant.now().minus(COOLDOWN));
        if (recentlySent > 0) {
            throw ApiException.tooManyRequests(
                    "ANNOUNCEMENT_COOLDOWN", "You have just sent a message. Please wait a minute before sending another.");
        }

        int told = notifyEveryoneExcept(
                sender,
                NotificationType.ANNOUNCEMENT,
                "Message from %s".formatted(sender.getFullName()),
                trimmed,
                // Nothing to open: the message *is* the subject, and a link to nowhere is worse
                // than no link.
                null);

        auditService.record(sender, AuditAction.ANNOUNCEMENT_SENT, "user", sender.getId(),
                Map.of("message", trimmed, "recipients", told));

        return told;
    }

    public void notifyAdminsOfNewRegistration(User applicant) {
        notifyAllAdmins(
                NotificationType.REGISTRATION_SUBMITTED,
                "New registration awaiting approval",
                "%s (%s) has requested access."
                        .formatted(
                                applicant.getFullName(),
                                applicant.getDepartment() == null
                                        ? "no department"
                                        : applicant.getDepartment().getName()),
                "user:" + applicant.getId());
    }

    /**
     * Sent the moment an admin approves.
     *
     * <p>Says what the approval *granted*, not how to sign in: this is read on the notifications
     * screen, by someone who has plainly signed in already, and telling them how to do the thing
     * they have just done reads as a system that is not paying attention.
     */
    public void notifyRegistrationApproved(User applicant) {
        notify(
                applicant,
                NotificationType.REGISTRATION_APPROVED,
                "Your account has been approved",
                "Your account is active. You can view, download and upload documents in every "
                        + "department.",
                "user:" + applicant.getId());
    }

    /** Carries the reviewer's reason verbatim, so the applicant knows what to do about it. */
    public void notifyRegistrationRejected(User applicant, String reason) {
        notify(
                applicant,
                NotificationType.REGISTRATION_REJECTED,
                "Your registration was not approved",
                reason,
                "user:" + applicant.getId());
    }

    public void notifyAccountDisabled(User user) {
        notify(
                user,
                NotificationType.ACCOUNT_DISABLED,
                "Your account has been disabled",
                "An administrator has disabled your account. Contact your administrator to restore access.",
                "user:" + user.getId());
    }

    /** Both directions, because being quietly signed out with no explanation invites a phone call. */
    public void notifyRoleChanged(User user, UserRole role) {
        boolean promoted = role == UserRole.ADMIN;
        notify(
                user,
                NotificationType.ROLE_CHANGED,
                promoted ? "You are now an administrator" : "Your administrator access has ended",
                promoted
                        ? "An administrator has given you administrative access. Sign in again to use it."
                        : "An administrator has returned your account to member access.",
                "user:" + user.getId());
    }

    /**
     * Whether this exact thing has already been said about this exact subject.
     *
     * <p>For the notifications that can be arrived at from more than one direction — a duplicate
     * pair is checked once from each copy — so the second arrival can fall silent rather than tell
     * everybody twice.
     */
    @Transactional(readOnly = true)
    public boolean alreadySentAbout(String type, String entityRef) {
        return notificationRepository.existsByTypeAndEntityRef(type, entityRef);
    }

    // -------------------------------------------------------------------- read side

    /**
     * A user's own notifications, newest first.
     *
     * <p>Scoped to the caller by user id rather than filtered afterwards, so there is no arrangement
     * of parameters that returns somebody else's.
     *
     * @param unreadOnly the "Unread" filter on the notifications screen
     * @param categories the groups the reader ticked; empty means everything, and a category the
     *     reader can never receive is simply a filter that matches nothing rather than an error
     */
    @Transactional(readOnly = true)
    public PageResponse<NotificationView> list(
            User user, boolean unreadOnly, List<NotificationCategory> categories, Pageable pageable) {

        Set<String> types = NotificationCategory.typesOf(categories);
        Page<Notification> page = notificationRepository.search(
                user.getId(),
                unreadOnly,
                types.isEmpty(),
                // Never read when allTypes is true, but an empty `in ()` is not valid SQL.
                types.isEmpty() ? PLACEHOLDER_TYPES : types,
                pageable);

        return PageResponse.of(page, NotificationView::from);
    }

    /**
     * The filter options this reader should be offered.
     *
     * <p>Answered by the server rather than hard-coded in the web app for the same reason the list
     * of audit actions is: the categories and the types they cover are defined once, here, and a
     * screen that restated them would drift the first time a notification type was added.
     */
    public List<CategoryOption> categoriesFor(User user) {
        return NotificationCategory.visibleTo(user.getRole() == UserRole.ADMIN).stream()
                .map(category -> new CategoryOption(category.wireName(), category.label()))
                .toList();
    }

    /**
     * Marks one notification read.
     *
     * <p>Someone else's notification reports 404 rather than 403: which ids exist is not information
     * this endpoint should confirm, and to the caller a row they cannot touch may as well not exist.
     * Marking an already-read one again is a no-op rather than an error — the bell fires this on
     * click, and a double click is not a mistake worth reporting.
     */
    @Transactional
    public NotificationView markRead(User user, UUID notificationId) {
        Notification notification = notificationRepository
                .findById(notificationId)
                .filter(candidate -> candidate.getUser().getId().equals(user.getId()))
                .orElseThrow(() -> ApiException.notFound("Notification"));

        notification.setRead(true);
        return NotificationView.from(notification);
    }

    /** @return how many were still unread, so the UI can say "12 marked as read" */
    @Transactional
    public int markAllRead(User user) {
        return notificationRepository.markAllReadFor(user.getId());
    }

    @Transactional(readOnly = true)
    public long unreadCount(User user) {
        return notificationRepository.countByUserIdAndReadFalse(user.getId());
    }
}
