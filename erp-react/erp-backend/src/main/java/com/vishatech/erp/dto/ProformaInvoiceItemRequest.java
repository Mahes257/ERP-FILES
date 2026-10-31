package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record ProformaInvoiceItemRequest(
        Long id,
        String description,
        String sku,
        String drawingNo,
        String material,
        String delivery,
        String hsn,
        String marksNos,
        String noKindPkgs,
        String manufacturer,
        String countryOfOrigin,
        String uom,
        BigDecimal qty,
        BigDecimal rate,
        BigDecimal discountPct,
        BigDecimal gstRate,
        BigDecimal netWeight,
        BigDecimal grossWeight
) {
}
