package com.vishatech.erp.audit;

import lombok.Getter;

/**
 * Enum representing ERP modules that generate audit records.
 *
 * <p><b>Ownership.</b> This is shared audit vocabulary, not production state: it
 * enumerates PURCHASE, SALES, PRODUCTION, QUALITY, … because the
 * {@code audit_logs} table is the ERP-wide audit trail. It therefore lives in the
 * neutral {@code com.vishatech.erp.audit} package rather than in the production
 * module, so any module can record an audit entry without importing production
 * implementation packages.
 *
 * <p><b>Values are persisted.</b> {@code AuditLog.module} is
 * {@code @Enumerated(EnumType.STRING)}, so the constant <em>names</em> are the
 * stored representation and the database contents are unaffected by this move.
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
