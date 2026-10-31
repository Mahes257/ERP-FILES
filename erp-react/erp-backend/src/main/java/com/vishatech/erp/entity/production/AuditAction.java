package com.vishatech.erp.entity.production;

import lombok.Getter;

/**
 * Enum representing audit action types.
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
