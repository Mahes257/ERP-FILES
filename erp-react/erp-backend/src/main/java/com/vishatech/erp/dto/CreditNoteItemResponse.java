package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record CreditNoteItemResponse(
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
        BigDecimal gstRate,
        BigDecimal grossAmount,
        BigDecimal discountAmount,
        BigDecimal netAmount,
        BigDecimal cgst,
        BigDecimal sgst,
        BigDecimal total
) {
}
