package com.vishatech.erp.entity.production;

public enum OrderStatus {
    DRAFT("Draft"),
    PENDING_PRODUCTION_APPROVAL("Pending Production Approval"),
    PRODUCTION_APPROVED("Production Approved"),
    PENDING_ADMIN_APPROVAL("Pending Admin Approval"),
    ADMIN_APPROVED("Admin Approved"),
    APPROVED("Approved"),
    PENDING("Pending"),
    IN_PROGRESS("In Progress"),
    HOLD("Hold"),
    PENDING_QC("Pending QC"),
    COMPLETED("Completed"),
    PACKED("Packed"),
    READY_FOR_DISPATCH("Ready for Dispatch"),
    DISPATCHED("Dispatched"),
    FAILED("Failed"),
    CANCELLED("Cancelled"),
    PRODUCTION_REJECTED("Production Rejected"),
    ADMIN_REJECTED("Admin Rejected");

    private final String displayName;

    OrderStatus(String displayName) {
        this.displayName = displayName;
    }

    public String getDisplayName() {
        return displayName;
    }

    public static OrderStatus fromDisplayName(String displayName) {
        if (displayName == null || displayName.isBlank()) {
            return DRAFT;
        }
        for (OrderStatus status : values()) {
            if (status.displayName.equalsIgnoreCase(displayName.trim())) {
                return status;
            }
        }
        throw new IllegalArgumentException("Unknown order status: " + displayName);
    }
}
