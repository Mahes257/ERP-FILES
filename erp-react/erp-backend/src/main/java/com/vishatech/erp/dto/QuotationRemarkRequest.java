package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;

/** New quotation remark (Quotation Overview → Remarks → Add Remark). */
public record QuotationRemarkRequest(
        @NotBlank(message = "Remark text is required") String text
) {
}
