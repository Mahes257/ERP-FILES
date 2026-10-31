package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public record QuotationItemRequest(
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
        // User-defined grid column values for this row ({columnId: value}) —
        // stored as JSON on the item (no dynamic ALTER TABLE per custom column).
        Map<String, String> customFields,
        // Additional description detail rows [{label, value}] — supports
        // addable/editable/deletable custom rows per item.
        List<Map<String, String>> descriptionRows
) {
}
