package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record ProductResponse(
        Long id,
        String name,
        String sku,
        String hsn,
        String unit,
        BigDecimal rate,
        BigDecimal gstRate,
        String description
) {
}
