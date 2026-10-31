package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record PaymentReceiptResponse(
        Long id,
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
        String remarks,
        String date,
        String createdAt,
        String updatedAt,
        String archivedAt,
        List<SalesAttachmentResponse> attachments,
        List<SalesTimelineResponse> timeline,
        List<SalesHistoryResponse> history
,
        Integer revision,
        Long revisionOf,
        Boolean latestRevision,
        String revisionDate,
        List<RevisionInfo> revisions
) {
}
