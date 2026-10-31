package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/** List-row projection for the Offline Marketing table. */
public record MarketingVisitResponse(
        Long id,
        String visitNo,
        String marketer,
        LocalDate scheduleDate,
        String companyName,
        Long customerId,
        String customerName,
        Long leadId,
        String leadNo,
        String location,
        String appointmentStatus,
        LocalDate appointmentDate,
        String appointmentTime,
        String contactPerson,
        String designation,
        String phone,
        String email,
        String visitStatus,
        String qFormStatus,
        String outcome,
        String leadStage,
        String leadStatus,
        String leadPriority,
        BigDecimal estimatedValue,
        String requirementPriority,
        String nextAction,
        LocalDate followupDate,
        String followupMode,
        String followupStatus,
        String handoverStatus,
        LocalDateTime entryDateTime,
        LocalDateTime exitDateTime,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
