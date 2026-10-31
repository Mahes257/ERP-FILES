package com.vishatech.erp.entity.production;

/**
 * Technical Verification statuses matching the frontend exactly.
 */
public enum TVStatus {
    PENDING("Pending"),
    VERIFIED("Verified"),
    REJECTED("Rejected");

    private final String displayName;

    TVStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static TVStatus fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return PENDING;
        }
        for (TVStatus status : values()) {
            if (status.displayName.equalsIgnoreCase(displayName.trim())) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown TV status: " + displayName);
    }
}
