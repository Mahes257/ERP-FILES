package com.vishatech.erp.audit;

import lombok.Getter;

/**
 * Enum representing audit action types.
 *
 * <p><b>Ownership.</b> Shared audit vocabulary — every module records against
 * these actions in the ERP-wide {@code audit_logs} table — so it lives in
 * {@code com.vishatech.erp.audit} instead of the production module.
 *
 * <p><b>Values are persisted.</b> {@code AuditLog.action} is
 * {@code @Enumerated(EnumType.STRING)}, so the constant <em>names</em> are the
 * stored representation and the database contents are unaffected by this move.
 */
@Getter
public enum AuditAction {
    CREATE("Create"),
    UPDATE("Update"),
    DELETE("Delete"),
    STATUS_CHANGE("Status Change"),
    APPROVE("Approve"),
    REJECT("Reject"),
    SUBMIT("Submit"),
    COMPLETE("Complete"),
    CANCEL("Cancel"),
    START("Start"),
    HOLD("Hold"),
    RESUME("Resume"),
    SKIP("Skip"),
    DISPATCH("Dispatch"),
    DELIVER("Deliver"),
    VERIFY("Verify"),
    FILE_UPLOAD("File Upload"),
    FILE_DOWNLOAD("File Download"),
    LOGIN("Login"),
    LOGOUT("Logout"),
    FAILED_LOGIN("Failed Login");

    private final String displayName;

    AuditAction(String displayName) {
        this.displayName = displayName;
    }

    public static AuditAction fromDisplayName(String name) {
        if (name == null) return UPDATE;
        for (AuditAction action : values()) {
            if (action.displayName.equalsIgnoreCase(name) || action.name().equalsIgnoreCase(name)) {
                return action;
            }
        }
        return UPDATE;
    }
}
