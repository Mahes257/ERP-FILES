package com.vishatech.erp.entity.production;

public enum ProductionType {
    CASTING("Casting"),
    FABRICATION("Fabrication"),
    ASSEMBLY("Assembly");

    private final String displayName;

    ProductionType(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static ProductionType fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return CASTING;
        }
        for (ProductionType type : values()) {
            if (type.displayName.equalsIgnoreCase(displayName.trim())) {
                return type;
            }
        }
        throw new IllegalArgumentException("Unknown production type: " + displayName);
    }

    public String getBatchPrefix() {
        return switch (this) {
            case CASTING -> "CAST";
            case FABRICATION -> "FAB";
            case ASSEMBLY -> "ASM";
        };
    }
}
