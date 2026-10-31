package com.vishatech.erp.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * List-row projection for marketing follow-ups and visit extensions
 * ({@link com.vishatech.erp.entity.MarketingVisitActivity}), enriched with
 * the linked original visit's reference fields (visitNo / location / company)
 * so list pages never need a second lookup per row.
 */
public record MarketingVisitActivityResponse(
        Long id,
        Long visitId,
        String activityType,
        LocalDate activityDate,
        String activityTime,
        String companyName,
        String contactName,
        String contactDesignation,
        String contactDepartment,
        String contactPhone,
        String contactWhatsApp,
        String contactEmail,
        String followupType,
        String discussion,
        String customerResponse,
        String status,
        String outcome,
        String customerRequirement,
        String nextAction,
        LocalDate nextFollowupDate,
        String nextFollowupTime,
        String assignedEmployee,
        String remarks,
        String groupName,
        String attachmentPaths,
        String createdBy,
        Long createdByUserId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String visitNo,
        String visitLocation,
        String visitCompanyName,
        LocalDate visitScheduleDate
) {
}