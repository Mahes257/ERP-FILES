package com.vishatech.erp.entity;

/**
 * Where an Admin approved a technically-verified CPR to be floated.
 *
 * This is deliberately SEPARATE from {@link CprStatus} (the CPR's own lifecycle)
 * and from {@link CprApprovalStatus} (approved / rejected / pending): once a
 * CPR's Technical Verification is complete, the Admin's approval must name a
 * destination, and exactly one destination may be executed per approval.
 *
 * The destination is the Admin's decision — it is never inferred from the CPR's
 * status, and Technical Verification never assumes one.
 */
public enum CprFloatDestination {

    /** Float the verified CPR to a Purchase Requisition. */
    PR("Purchase Requisition"),

    /** Float the verified CPR to a Cost Workout. */
    CW("Cost Workout");

    private final String label;

    CprFloatDestination(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }

    /** Lenient parse of the API value ("PR" / "CW", any case). Null when unknown. */
    public static CprFloatDestination parse(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toUpperCase().replace("_", " ").replace("-", " ");
        return switch (normalized) {
            case "PR", "PURCHASE REQUISITION", "REQUISITION" -> PR;
            case "CW", "COST WORKOUT" -> CW;
            default -> null;
        };
    }
}
