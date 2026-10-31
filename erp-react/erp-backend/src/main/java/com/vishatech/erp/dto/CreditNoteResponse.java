package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;

public record CreditNoteResponse(
        Long id,
        String cnNo,
        String cnDate,
        String status,
        String source,
        String sourceRef,
        String sourceDate,
        /**
         * CPO (Customer Purchase Order) number this credit note belongs to.
         * Resolved through the linked source document — never a copy of an
         * unrelated document number; null when no CPO relationship exists.
         */
        String cpoNo,
        /** Dispatch date of the linked Delivery Challan (null when none). */
        String dispatchDate,
        /**
         * The note's OWN manual override of the dispatch date; null when the
         * displayed {@code dispatchDate} is the linked challan's value.
         * Non-null marks the displayed date as user-entered.
         */
        String dispatchDateOverride,
        /**
         * The AUTOMATIC value the linked Delivery Challan provides, whether or
         * not an override currently hides it. This is what the form falls back
         * to the moment an override is cleared, so it never has to keep showing
         * the overridden date as if it were the linked one. Null when the
         * linked documents record no dispatch date at all.
         */
        String resolvedDispatchDate,
        /** Credit-Note owned: date the consignment reached the destination. */
        String destinationReachedDate,
        /**
         * Authoritative due date: the note's own override when one is saved,
         * otherwise the linked invoice's due date, else the linked CPO's
         * delivery date (the value the CPO module itself labels "Due Date").
         * Null when none exists.
         */
        String dueDate,
        /**
         * The note's OWN manual override of the due date; null when the
         * displayed {@code dueDate} is the resolved one. Non-null marks the
         * displayed date as user-entered AND as the date the overdue flag
         * below was calculated from.
         */
        String dueDateOverride,
        /**
         * The AUTOMATIC due date (the linked invoice's, else the linked CPO's
         * delivery date) — populated even while an override is in force, so the
         * form can show the linked value again as soon as the override is
         * cleared. Null when neither document provides one.
         */
        String resolvedDueDate,
        /** Due date passed AND the amount is still outstanding. Always derived. */
        Boolean dueDateExceeded,
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
        BigDecimal subTotal,
        BigDecimal discount,
        BigDecimal discountPct,
        BigDecimal cgstTotal,
        BigDecimal sgstTotal,
        BigDecimal taxTotal,
        BigDecimal charges,
        BigDecimal grandTotal,
        Integer itemsCount,
        BigDecimal totalQty,
        String convertedToPr,
        String date,
        String createdAt,
        String updatedAt,
        String archivedAt,
        List<CreditNoteItemResponse> items,
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
