package com.allgos.dms.audit.entity;

import java.lang.reflect.Modifier;
import java.util.Arrays;
import java.util.List;

/** The action vocabulary written to audit_logs.action. */
public final class AuditAction {

    // authentication
    public static final String REGISTER = "register";
    public static final String LOGIN_PASSWORD = "login_password";
    public static final String LOGIN_FAILED = "login_failed";
    public static final String LOGIN_BLOCKED_STATUS = "login_blocked_status";
    public static final String LOGOUT = "logout";
    public static final String LOGOUT_ALL = "logout_all";
    public static final String PASSWORD_CHANGED = "password_changed";
    public static final String ANNOUNCEMENT_SENT = "announcement_sent";

    // approval workflow
    public static final String REGISTRATION_APPROVED = "registration_approved";
    public static final String REGISTRATION_REJECTED = "registration_rejected";
    public static final String USER_STATUS_CHANGED = "user_status_changed";
    public static final String USER_ROLE_CHANGED = "user_role_changed";
    public static final String USER_UPDATED = "user_updated";

    // phonebook
    public static final String PHONEBOOK_CONTACT_ADDED = "phonebook_contact_added";
    public static final String PHONEBOOK_CONTACT_UPDATED = "phonebook_contact_updated";
    public static final String PHONEBOOK_CONTACT_REMOVED = "phonebook_contact_removed";

    // content
    public static final String DEPARTMENT_CREATED = "department_created";
    public static final String DEPARTMENT_UPDATED = "department_updated";
    public static final String FOLDER_CREATED = "folder_created";
    public static final String FOLDER_UPDATED = "folder_updated";
    public static final String FOLDER_DELETED = "folder_deleted";
    public static final String FILE_UPLOADED = "file_uploaded";
    public static final String FILE_PREVIEWED = "file_previewed";
    public static final String FILE_DOWNLOADED = "file_downloaded";
    public static final String FILE_REPLACED = "file_replaced";
    public static final String FILE_DELETED = "file_deleted";
    public static final String FILE_RESTORED = "file_restored";
    /** Hard-deleted for good — by an admin, or by the 30-day sweep once nobody restored it. */
    public static final String FILE_PURGED = "file_purged";

    // adverts
    public static final String AD_CREATED = "ad_created";
    public static final String AD_UPDATED = "ad_updated";
    public static final String AD_DELETED = "ad_deleted";

    // letters
    public static final String LETTER_CREATED = "letter_created";
    public static final String LETTER_UPDATED = "letter_updated";
    public static final String LETTER_DELETED = "letter_deleted";

    /**
     * Every action name declared above, sorted, for the audit viewer's filter.
     *
     * <p>Read by reflection rather than maintained as a second list beside the constants. A
     * hand-written list is one more thing to forget: the filter would quietly stop offering an
     * action the moment someone added a constant without noticing it, and the omission looks
     * exactly like "nothing of that kind has happened yet".
     *
     * <p>Computed once at class-load, not per request.
     */
    private static final List<String> ALL = Arrays.stream(AuditAction.class.getDeclaredFields())
            .filter(field -> Modifier.isStatic(field.getModifiers()) && field.getType() == String.class)
            .map(field -> {
                try {
                    return (String) field.get(null);
                } catch (IllegalAccessException ex) {
                    throw new IllegalStateException("Could not read audit action " + field.getName(), ex);
                }
            })
            .sorted()
            .toList();

    public static List<String> all() {
        return ALL;
    }

    private AuditAction() {}
}
