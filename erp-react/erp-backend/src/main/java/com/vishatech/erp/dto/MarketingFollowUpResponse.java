package com.vishatech.erp.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record MarketingFollowUpResponse(
        Long id,
        Long visitId,
        Long leadId,
        LocalDate followupDate,
        String time,
        String mode,
        String status,
        String purpose,
        String nextAction,
        String customerResponse,
        String remarks,
        LocalDate nextFollowupDate,
        String createdBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        // Context resolved from the linked visit (or lead as fallback) so the
        // Marketing Follow-ups list page can display the business/contact info.
        String visitNo,
        String companyName,
        String contactName,
        String location,
        String marketer
) {
}
