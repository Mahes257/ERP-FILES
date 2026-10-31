package com.vishatech.erp.dto;

import java.time.LocalDateTime;

/** One saved quotation remark. */
public record QuotationRemarkResponse(
        Long id,
        Long quotationId,
        String text,
        String addedBy,
        LocalDateTime createdAt
) {
}
