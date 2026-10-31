package com.vishatech.erp.crm.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public record FollowUpResponse(
        Long id,
        Long leadId,
        Long clientId,
        // Origin quotation (followups.quotationId), null for lead/client-only follow-ups.
        Long quotationId,
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
        LocalDate followupDate,
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
        String status,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        LocalDateTime archivedAt,
        // Most recent follow-up date for the same Lead/Client (computed across
        // the whole follow-ups history, not just the current page).
        LocalDate lastFollowUpDate,
        List<AttachmentResponse> attachments
) {

    public record AttachmentResponse(Long id, String name, String contentType, long size, String url, String uploadedAt) {
    }
}
