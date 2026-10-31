package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record ProfitWorkoutItemResponse(
        Long id,
        String description,
        BigDecimal qty,
        String category,
        String unit,
        BigDecimal costRate,
        BigDecimal sellingRate,
        BigDecimal profitPerUnit,
        BigDecimal margin,
        List<ProfitWorkoutCategoryResponse> categories,
        BigDecimal cost,
        BigDecimal selling,
        BigDecimal profit
) {
}