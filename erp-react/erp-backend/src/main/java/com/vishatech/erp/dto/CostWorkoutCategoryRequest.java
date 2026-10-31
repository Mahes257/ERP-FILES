package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record CostWorkoutCategoryRequest(
        String category,
        BigDecimal qty,
        String unit,
        BigDecimal rate,
        String notes
) {
}
