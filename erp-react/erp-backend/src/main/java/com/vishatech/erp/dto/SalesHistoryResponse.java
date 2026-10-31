package com.vishatech.erp.dto;

public record SalesHistoryResponse(
        Long id,
        String field,
        String oldValue,
        String newValue,
        String changedBy,
        String createdAt
) {
}
