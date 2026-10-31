package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/** A follow-up on a marketing visit and/or marketing lead. followupDate is required. */
public record MarketingFollowUpRequest(
        @NotNull(message = "Follow-up date is required") LocalDate followupDate,
        String time,
        String mode,
        String status,
        String purpose,
        String nextAction,
        String customerResponse,
        String remarks,
        LocalDate nextFollowupDate,
        // At least one of leadId / visitId is required (validated in the service).
        Long leadId,
        Long visitId
) {
}
