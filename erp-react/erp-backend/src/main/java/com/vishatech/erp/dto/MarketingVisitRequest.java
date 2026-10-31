package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Writable fields for an Offline Marketing visit. Every field is optional —
 * the service applies only non-null values (patch semantics) and validates
 * the business rules (a company/customer/lead must be present, "No Lead"
 * requires a reason, follow-up status transitions, etc.).
 */
public record MarketingVisitRequest(
        // Basic information
        LocalDate scheduleDate,
        String companyName,
        Long customerId,
        Long leadId,
        String location,
        String address,
        BigDecimal latitude,
        BigDecimal longitude,
        String appointmentStatus,
        LocalDate appointmentDate,
        String appointmentTime,
        String contactPerson,
        String designation,
        String phone,
        String email,
        String appointmentRemarks,
        String leadNo,
        String marketer,

        // Actual visit
        LocalDateTime entryDateTime,
        LocalDateTime exitDateTime,
        String meetingPerson,
        String meetingDesignation,
        String visitStatus,

        // Q Form
        String qFormStatus,
        String qFormDetails,
        String qFormRemarks,

        // Requirement
        String requirement,
        String productService,
        String quantity,
        String technicalRequirement,
        String expectedPurchaseTimeline,
        String budget,
        String requirementPriority,
        String technicalRemarks,

        // Discussion
        String visitDescription,
        String discussion,
        String customerResponse,
        String customerFeedback,
        String technicalDiscussion,
        String remarks,

        // Outcome
        String outcome,
        String noLeadReason,

        // Lead snapshot (only used when creating/linking a lead)
        BigDecimal estimatedValue,
        String leadPriority,

        // Current follow-up
        String nextAction,
        LocalDate followupDate,
        String followupMode,
        String followupStatus,
        String followupCustomerResponse,
        String followupRemarks,

        // Sales handover
        String handoverStatus,
        String handoverTo,
        String handoverRemarks
) {
}
