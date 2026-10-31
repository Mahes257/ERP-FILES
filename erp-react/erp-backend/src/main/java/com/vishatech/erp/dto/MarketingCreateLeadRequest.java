package com.vishatech.erp.dto;

import java.math.BigDecimal;

/**
 * Overrides used when creating a Lead from a marketing visit. The visit's own
 * data (company/plant, contact person, phone, email, location, requirement)
 * is auto-filled server-side; only non-null overrides are applied. The lead
 * source is always forced to "Offline Marketing" server-side.
 */
public record MarketingCreateLeadRequest(
        String leadName,
        String companyName,
        String contactPerson,
        String phone,
        String email,
        String designation,
        String industry,
        String address,
        BigDecimal estimatedValue,
        String priority
) {
}
