package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record CostWorkoutCategoryResponse(
        Long id,
        String category,
        BigDecimal qty,
        String unit,
        BigDecimal rate,
        BigDecimal amount,
        String notes
) {
}
