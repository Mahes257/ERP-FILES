package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record ProfitWorkoutItemRequest(
        String description,
        BigDecimal qty,
        String category,
        String unit,
        BigDecimal costRate,
        BigDecimal sellingRate,
        List<ProfitWorkoutCategoryRequest> categories
) {
}