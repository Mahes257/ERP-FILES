package com.vishatech.erp.dto;

public record CprHistoryResponse(
        Long id,
        String field,
        String oldValue,
        String newValue,
        String changedBy,
        String createdAt
) {
}
