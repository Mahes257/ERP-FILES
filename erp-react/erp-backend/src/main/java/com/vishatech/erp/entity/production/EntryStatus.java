package com.vishatech.erp.entity.production;

public enum EntryStatus {
    PENDING("Pending"),
    IN_PROGRESS("In Progress"),
    HOLD("Hold"),
    COMPLETED("Completed"),
    SKIPPED("Skipped");

    private final String displayName;

    EntryStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static EntryStatus fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return PENDING;
        }
        for (EntryStatus status : values()) {
            if (status.displayName.equalsIgnoreCase(displayName.trim())) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown entry status: " + displayName);
    }
}
