package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record CprItemRequest(
        Long id,
        String drawingNo,
        String description,
        String specification,
        BigDecimal qty,
        String unit,
        BigDecimal estimatedCost,
        String remarks,
        /**
         * Free-text notes for THIS item. Persisted inside the existing
         * {@code cpr_items.custom_fields_json} payload (under the reserved
         * {@code notes} key) — no schema change, and it travels with the item
         * across drafts, revisions and duplicates like every other item value.
         */
        String notes,
        String fileName,
        Long fileSize,
        String fileType,
        List<CostWorkoutAttachment> attachments,
        Map<String, String> customFields
) {
}
