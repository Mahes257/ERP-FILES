package com.vishatech.erp.dto;

public record FinancialSettingsResponse(
        String baseCurrency,
        String lastUpdated,
        boolean stale
) {
}
