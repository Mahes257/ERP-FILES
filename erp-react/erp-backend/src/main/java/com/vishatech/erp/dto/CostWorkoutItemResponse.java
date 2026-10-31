package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record CostWorkoutItemResponse(
        Long id,
        String description,
        // Short, brief description shown in the Cost Workout list. Always read
        // independently from `description`; never a fallback for it.
        String cprDescription,
        BigDecimal qty,
        String unit,
        List<CostWorkoutCategoryResponse> categories,
        Map<String, String> customFields,
        // Documents attached to this item only.
        List<CostWorkoutAttachment> attachments
) {
}
