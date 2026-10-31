package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Full Travel Schedule detail (create/update/get responses).
 *
 * <p>Read-only, server-derived fields ({@code scheduleNo}, {@code requestedBy},
 * {@code requestedByUserId}, {@code status}, approval fields) are returned but
 * never accepted from the client.
 */
public record TravelScheduleResponse(
        Long id,
        String scheduleNo,
        String scheduleTitle,

        // Assignment / requester
        Long assignedUserId,
        String assignedTo,
        String requestedBy,
        Long requestedByUserId,

        // Purpose and priority
        String purpose,
        String priority,

        // Date, time and route
        LocalDate travelDate,
        LocalDate startDate,
        String startTime,
        LocalDate endDate,
        String endTime,
        String startingLocation,
        String destination,
        String travelMode,
        BigDecimal estimatedDistanceKm,

        // Coordination
        Long customerId,
        String customerName,
        String meetingDetails,
        String contactPerson,
        String contactPhone,
        String remarks,

        // Status and approval
        String status,
        String approvalStatus,
        String approvedBy,
        LocalDateTime approvedAt,
        String rejectionReason,
        String revisionComments,

        // Cancellation
        String cancelledBy,
        LocalDateTime cancelledAt,
        String cancellationReason,

        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
