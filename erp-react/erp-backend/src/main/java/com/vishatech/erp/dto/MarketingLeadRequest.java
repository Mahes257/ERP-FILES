package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Standalone Marketing Lead create/update. All fields are optional (patch
 * semantics) — "Company name is required" is enforced in the service on
 * CREATE only, so an UPDATE may change e.g. just the stage.
 * Source defaults to "Offline Marketing" server-side.
 */
public record MarketingLeadRequest(
        String companyName,
        String contactPerson,
        String designation,
        String phone,
        String email,
        String location,
        String requirement,
        BigDecimal estimatedValue,
        String priority,
        String status,
        String stage,
        String source,
        LocalDate leadDate,
        Long visitId
) {
}
