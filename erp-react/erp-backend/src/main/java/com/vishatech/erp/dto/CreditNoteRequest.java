package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record CreditNoteRequest(
        String cnNo,
        String cnDate,
        String status,
        String source,
        String sourceRef,
        String sourceDate,
        String destinationReachedDate,
        /**
         * Manual override of the linked Delivery Challan's dispatch date.
         * Blank/null means "resolve it from the linked challan" — an absent
         * value therefore clears a previous override instead of inventing one.
         */
        String dispatchDateOverride,
        /**
         * Manual override of the authoritative due date (which otherwise comes
         * from the linked invoice, else the linked CPO). It replaces that
         * resolved date for the derived "Due Date Exceeded" indicator too.
         * Blank/null clears the override and restores the resolved date.
         */
        String dueDateOverride,
        String settlementMethod,
        String reason,
        BigDecimal refundAmount,
        BigDecimal returnQty,
        String reasonDetail,
        String inventoryImpact,
        String companyName,
        String companyGstin,
        String companyPan,
        String companyState,
        String companyAddress,
        Long clientId,
        String clientName,
        String contactPerson,
        String gstin,
        String taxType,
        String hsnView,
        String email,
        String phone,
        String currency,
        String terms,
        String remarks,
        BigDecimal discountPct,
        BigDecimal charges,
        List<CreditNoteItemRequest> items
) {
}
