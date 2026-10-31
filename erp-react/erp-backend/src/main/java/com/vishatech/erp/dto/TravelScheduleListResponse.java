package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Compact list-row projection for the Travel Scheduler table.
 *
 * <p>{@code travelDate} is the schedule's travel date and is the same value as
 * {@code startDate}; it is exposed under both names so the table can label the
 * column "Travel Date" without the model carrying two dates that could disagree.
 */
public record TravelScheduleListResponse(
        Long id,
        String scheduleNo,
        String scheduleTitle,
        Long assignedUserId,
        String assignedTo,
        String purpose,
        String priority,
        LocalDate travelDate,
        LocalDate startDate,
        LocalDate endDate,
        String startingLocation,
        String destination,
        String travelMode,
        String status,
        String approvedBy,
        LocalDateTime approvedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
