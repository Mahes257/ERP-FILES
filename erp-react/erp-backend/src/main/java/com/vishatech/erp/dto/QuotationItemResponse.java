package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record QuotationItemResponse(
        Long id,
        Long productId,
        String productName,
        String description,
        String sku,
        String drawingNo,
        String material,
        String leadTime,
        String hsn,
        String uom,
        String batchCode,
        String expiryDate,
        BigDecimal qty,
        BigDecimal rate,
        BigDecimal discountPct,
        BigDecimal gstRate,
        BigDecimal grossAmount,
        BigDecimal discountAmount,
        BigDecimal netAmount,
        BigDecimal cgst,
        BigDecimal sgst,
        BigDecimal total,
        // User-defined grid column values for this row ({columnId: value}).
        Map<String, String> customFields,
        // Additional description detail rows [{label, value}].
        List<Map<String, String>> descriptionRows
) {
}
