package com.vishatech.erp.entity.production;

/**
 * Drawing Revision statuses for revision lifecycle management.
 */
public enum DrawingRevisionStatus {
    DRAFT("Draft"),
    PENDING_REVIEW("Pending Review"),
    APPROVED("Approved"),
    REJECTED("Rejected"),
    RELEASED("Released"),
    OBSOLETE("Obsolete");

    private final String displayName;

    DrawingRevisionStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static DrawingRevisionStatus fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return DRAFT;
        }
        for (DrawingRevisionStatus status : values()) {
            if (status.displayName.equalsIgnoreCase(displayName.trim())) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown drawing revision status: " + displayName);
    }
}
