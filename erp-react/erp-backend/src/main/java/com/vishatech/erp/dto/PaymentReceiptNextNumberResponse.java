package com.vishatech.erp.dto;

public record PaymentReceiptNextNumberResponse(
        String receiptNo,
        long nextNumber
) {
}
