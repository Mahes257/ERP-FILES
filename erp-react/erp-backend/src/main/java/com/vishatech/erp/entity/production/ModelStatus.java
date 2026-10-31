package com.vishatech.erp.entity.production;

/**
 * Model verification statuses matching the frontend exactly.
 */
public enum ModelStatus {
    PENDING("Pending"),
    VERIFIED("Verified"),
    REJECTED("Rejected");

    private final String displayName;

    ModelStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static ModelStatus fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return PENDING;
        }
        for (ModelStatus status : values()) {
            if (status.displayName.equalsIgnoreCase(displayName.trim())) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown model status: " + displayName);
    }
}
