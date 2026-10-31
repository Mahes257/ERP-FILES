package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record CprItemResponse(
        Long id,
        String drawingNo,
        String description,
        String specification,
        BigDecimal qty,
        String unit,
        BigDecimal estimatedCost,
        String remarks,
        /** Item-level notes; may contain line breaks. */
        String notes,
        String fileName,
        Long fileSize,
        String fileType,
        List<CostWorkoutAttachment> attachments,
        Map<String, String> customFields
) {
}
