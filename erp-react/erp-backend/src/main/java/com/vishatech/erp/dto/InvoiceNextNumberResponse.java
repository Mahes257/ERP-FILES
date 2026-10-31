package com.vishatech.erp.dto;

public record InvoiceNextNumberResponse(
        String invoiceNo,
        long nextNumber
) {
}
