package com.allgos.dms.notification.dto;

import com.allgos.dms.notification.entity.Notification;
import java.time.Instant;
import java.util.UUID;

/** Response bodies for the notification endpoints. */
public final class NotificationResponses {

    /**
     * One notification as the bell and the list see it.
     *
     * <p>{@code entityRef} is the free-form pointer written when the row was created —
     * {@code "file:{uuid}"} or {@code "user:{uuid}"}. The web app turns it into a link; the server
     * deliberately does not build a URL, because routes are the client's business.
     */
    public record NotificationView(
            UUID id,
            String type,
            String title,
            String body,
            String entityRef,
            boolean read,
            Instant createdAt) {

        public static NotificationView from(Notification notification) {
            return new NotificationView(
                    notification.getId(),
                    notification.getType(),
                    notification.getTitle(),
                    notification.getBody(),
                    notification.getEntityRef(),
                    notification.isRead(),
                    notification.getCreatedAt());
        }
    }

    /**
     * One option in the notifications screen's category filter.
     *
     * <p>The id is what goes back on the query string; the label is what the reader sees. Only the
     * categories a reader in that role can actually receive are returned — a member is never
     * offered "Registration requests", which for them could only ever match nothing.
     */
    public record CategoryOption(String id, String label) {}

    /** What the bell badge needs, and nothing else — it is polled far more often than the list. */
    public record UnreadCount(long unread) {}

    /**
     * The answer to sending an announcement: how many people it reached.
     *
     * <p>Returned rather than assumed by the client, which has no way of knowing how many accounts
     * are active — and "sent to 42 people" is what tells the sender it actually went somewhere.
     */
    public record AnnouncementSent(int recipients) {}

    private NotificationResponses() {}
}
