package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

public record MarketingLeadResponse(
        Long id,
        String leadNo,
        LocalDate leadDate,
        String companyName,
        String contactPerson,
        String designation,
        String phone,
        String email,
        String location,
        String marketer,
        String requirement,
        BigDecimal estimatedValue,
        String priority,
        String status,
        String stage,
        String source,
        Long visitId,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}
