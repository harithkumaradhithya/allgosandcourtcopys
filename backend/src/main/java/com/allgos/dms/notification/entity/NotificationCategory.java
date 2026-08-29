package com.allgos.dms.notification.entity;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;

/**
 * The groups the notifications screen filters by.
 *
 * <p>A category is a handful of {@link NotificationType} values that mean the same thing to whoever
 * is reading — a file deleted and a folder deleted are both "something was removed", and nobody
 * looking for one wants to be asked which. The screen offers these rather than the raw types
 * because the types are an implementation detail that happens to be readable.
 *
 * <p>Kept on the server, and offered to the client through an endpoint rather than restated in the
 * web app, so a type added here cannot quietly fall out of every filter.
 */
public enum NotificationCategory {

    /** New documents filed by anyone. Everybody is told, so everybody can filter for it. */
    UPLOADS("Uploads", false, NotificationType.FILE_UPLOADED),

    /** A document or an empty folder removed, with the reason the remover gave. */
    DELETIONS("Deletions", false, NotificationType.FILE_DELETED, NotificationType.FOLDER_DELETED),

    /** A deleted document brought back. Only its uploader is told. */
    RESTORES("Restores", false, NotificationType.FILE_RESTORED),

    /** The office speaking: a circular sent by an administrator. */
    ANNOUNCEMENTS("Announcements", false, NotificationType.ANNOUNCEMENT),

    /**
     * Somebody asking for access.
     *
     * <p>Administrators only — nobody else is ever sent one, and offering a member a filter that
     * can only ever return nothing is worse than not offering it.
     */
    REGISTRATIONS("Registration requests", true, NotificationType.REGISTRATION_SUBMITTED),

    /**
     * News about the reader's own account: approved, refused, disabled, promoted, returned to
     * member. Everyone has an account, so everyone gets this one.
     */
    ACCOUNT(
            "Your account",
            false,
            NotificationType.REGISTRATION_APPROVED,
            NotificationType.REGISTRATION_REJECTED,
            NotificationType.ACCOUNT_DISABLED,
            NotificationType.ROLE_CHANGED);

    private final String label;
    private final boolean adminOnly;
    private final Set<String> types;

    NotificationCategory(String label, boolean adminOnly, String... types) {
        this.label = label;
        this.adminOnly = adminOnly;
        this.types = Set.of(types);
    }

    public String label() {
        return label;
    }

    public boolean adminOnly() {
        return adminOnly;
    }

    public Set<String> types() {
        return types;
    }

    /** The categories a reader in this role can actually receive, in the order declared above. */
    public static List<NotificationCategory> visibleTo(boolean isAdmin) {
        return Arrays.stream(values()).filter(category -> isAdmin || !category.adminOnly()).toList();
    }

    /**
     * Case-insensitive, and empty rather than an exception for anything unrecognised.
     *
     * <p>A stale link carrying a category that no longer exists should show the unfiltered list,
     * not an error page.
     */
    public static Optional<NotificationCategory> parse(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        return Arrays.stream(values())
                .filter(category -> category.name().equalsIgnoreCase(value.trim()))
                .findFirst();
    }

    /** Every type covered by the given categories, for the {@code in} clause of the list query. */
    public static Set<String> typesOf(List<NotificationCategory> categories) {
        Set<String> all = new LinkedHashSet<>();
        categories.forEach(category -> all.addAll(category.types()));
        return all;
    }

    /** The wire name — lower case, so the query string reads {@code ?category=deletions}. */
    public String wireName() {
        return name().toLowerCase(Locale.ROOT);
    }
}
