package com.vishatech.erp.dto;

import java.math.BigDecimal;

public record PaymentReceiptRequest(
        String receiptNo,
        String companyName,
        String companyGstin,
        String companyPan,
        String companyState,
        String companyAddress,
        Long clientId,
        String clientName,
        String contactPerson,
        String gstin,
        String email,
        String phone,
        String paymentDate,
        String paymentMode,
        String bankName,
        String branch,
        String chequeTx,
        String referenceNo,
        String status,
        String source,
        String invoiceRef,
        BigDecimal amount,
        String remarks
) {
}
