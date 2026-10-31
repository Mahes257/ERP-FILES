package com.vishatech.erp.crm.dto;

public record HistoryResponse(
        Long id,
        String field,
        String oldValue,
        String newValue,
        String changedBy,
        String date
) {
}
