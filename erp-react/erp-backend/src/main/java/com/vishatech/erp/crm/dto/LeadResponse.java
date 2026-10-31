package com.vishatech.erp.crm.dto;

import java.math.BigDecimal;
import java.util.List;

public record LeadResponse(
        Long id,
        String name,
        String company,
        String title,
        String stage,
        String status,
        String source,
        String email,
        String phone,
        String website,
        BigDecimal value,
        String owner,
        String businessName,
        String businessType,
        String industry,
        String taxId,
        String secondaryName,
        String secondaryEmail,
        String secondaryPhone,
        String address,
        String city,
        String state,
        String pincode,
        String country,
        String internalNotes,
        String description,
        String pan,
        String preferredVendor,
        String project,
        String priority,
        String date,
        String createdAt,
        String updatedAt,
        String archivedAt,
        List<NoteResponse> notes,
        List<ActivityResponse> activities,
        List<AttachmentResponse> attachments,
        List<TimelineResponse> timeline,
        List<HistoryResponse> history
) {
}
