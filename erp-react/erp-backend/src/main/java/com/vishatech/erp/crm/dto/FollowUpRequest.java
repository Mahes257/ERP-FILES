package com.vishatech.erp.crm.dto;

import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

public record FollowUpRequest(
        // Either leadId or clientId is required (validated in FollowUpService —
        // a follow-up is created from a Lead, a Client, or both).
        Long leadId,
        Long clientId,
        // Optional origin quotation (followups.quotationId). Set when the
        // follow-up is created from a Quotation (Quotation → Follow-ups tab) so
        // the quotation's Follow-up Status column can list the real records.
        Long quotationId,
        // Lead snapshot (auto-filled from the real lead on the UI; kept in sync server-side)
        String leadName,
        String companyName,
        String contactPerson,
        String phone,
        String email,
        String leadStage,
        String source,
        String industry,
        String executive,
        String address,
        // Follow-up details
        @NotNull(message = "Follow-up date is required") LocalDate followupDate,
        String time,
        String mode,
        String priority,
        String currentStatus,
        String outcome,
        String discussionSummary,
        String customerFeedback,
        String requirement,
        LocalDate nextFollowupDate,
        String assignTo,
        String reminder,
        String reminderType,
        String status
) {
}
