package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record InvoiceItemRequest(
        Long id,
        String description,
        String sku,
        String drawingNo,
        String material,
        String delivery,
        String hsn,
        String manufacturer,
        String countryOfOrigin,
        String uom,
        BigDecimal qty,
        BigDecimal rate,
        BigDecimal discountPct,
        BigDecimal gstRate
) {
}
