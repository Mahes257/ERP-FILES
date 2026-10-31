package com.vishatech.erp.entity.production;

import lombok.Getter;

/**
 * Enum representing ERP modules that generate audit records.
 */
@Getter
public enum AuditModule {
    PRODUCTION("Production"),
    SALES("Sales"),
    PURCHASE("Purchase"),
    QUALITY("Quality"),
    PACKING("Packing"),
    DISPATCH("Dispatch"),
    CASTING("Casting"),
    FABRICATION("Fabrication"),
    ASSEMBLY("Assembly"),
    DRAWING("Drawing"),
    MODEL("Model"),
    TECHNICAL_VERIFICATION("Technical Verification"),
    SETTINGS("Settings"),
    REPORTS("Reports"),
    SYSTEM("System"),
    AUTHENTICATION("Authentication");

    private final String displayName;

    AuditModule(String displayName) {
        this.displayName = displayName;
    }

    public static AuditModule fromDisplayName(String name) {
        if (name == null) return SYSTEM;
        for (AuditModule module : values()) {
            if (module.displayName.equalsIgnoreCase(name) || module.name().equalsIgnoreCase(name)) {
                return module;
            }
        }
        return SYSTEM;
    }
}
