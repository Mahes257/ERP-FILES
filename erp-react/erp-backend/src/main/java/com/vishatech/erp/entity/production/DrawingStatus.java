package com.vishatech.erp.entity.production;

/**
 * Drawing verification statuses matching the frontend exactly.
 */
public enum DrawingStatus {
    PENDING("Pending"),
    VERIFIED("Verified"),
    REJECTED("Rejected");

    private final String displayName;

    DrawingStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static DrawingStatus fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return PENDING;
        }
        for (DrawingStatus status : values()) {
            if (status.displayName.equalsIgnoreCase(displayName.trim())) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown drawing status: " + displayName);
    }
}
