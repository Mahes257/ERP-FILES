package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record ProfitWorkoutCategoryRequest(
        String category,
        BigDecimal qty,
        String unit,
        BigDecimal rate,
        String notes
) {
}
