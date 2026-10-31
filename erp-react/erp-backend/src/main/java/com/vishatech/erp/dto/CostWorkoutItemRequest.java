package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record CostWorkoutItemRequest(
        String description,
        // Short, brief description used by the Cost Workout list. Independent of
        // `description` (the full costing description) and optional.
        String cprDescription,
        BigDecimal qty,
        String unit,
        List<CostWorkoutCategoryRequest> categories,
        Map<String, String> customFields,
        // Documents belonging to THIS item (same embedded shape as the Cost
        // Workout's own attachments). Null means "not supplied by this client":
        // the previously stored files for the item are then preserved.
        List<CostWorkoutAttachment> attachments
) {
}
