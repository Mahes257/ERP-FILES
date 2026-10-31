package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record ExpenseTripListResponse(
        Long id,
        String tripNo,
        String marketer,
        String travelPlanRef,
        String startLocation,
        String destination,
        String purpose,
        LocalDate startDate,
        LocalDateTime tripOnDateTime,
        LocalDateTime tripOffDateTime,
        String status,
        String approvalStatus,
        BigDecimal totalAmount,
        BigDecimal withBillTotal,
        BigDecimal withoutBillTotal,
        BigDecimal travelTotal,
        BigDecimal stayTotal,
        BigDecimal foodTotal,
        BigDecimal localTravelTotal,
        BigDecimal otherTotal,
        Integer expenseCount,
        String approvedBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {}
