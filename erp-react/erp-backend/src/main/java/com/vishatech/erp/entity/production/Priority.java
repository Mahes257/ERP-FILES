package com.vishatech.erp.entity.production;

public enum Priority {
    LOW("Low"),
    MEDIUM("Medium"),
    HIGH("High"),
    URGENT("Urgent");

    private final String displayName;

    Priority(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static Priority fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return MEDIUM;
        }
        for (Priority p : values()) {
            if (p.displayName.equalsIgnoreCase(displayName.trim())) {
                return p;
            }
        }
        throw new IllegalArgumentException("Unknown priority: " + displayName);
    }
}
