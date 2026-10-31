package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record DeliveryChallanItemRequest(
        Long id,
        String description,
        String sku,
        String drawingNo,
        String material,
        String delivery,
        String hsn,
        String uom,
        BigDecimal qty,
        BigDecimal rate,
        BigDecimal discountPct,
        BigDecimal gstRate
) {
}
