package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Compact list-row projection for the Travel Plans table.
 */
public record TravelPlanListResponse(
        Long id,
        String planNo,
        String marketer,
        LocalDate startDate,
        LocalDate endDate,
        String startingLocation,
        String endingLocation,
        String purpose,
        String status,
        BigDecimal totalDistanceKm,
        Integer totalTravelTimeMinutes,
        Integer activeStopsCount,
        String approvedBy,
        LocalDateTime approvedAt,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
