package com.vishatech.erp.dto;

/**
 * One follow-up record linked to a quotation ({@code followups.quotationId}).
 * <p>
 * Exposed on the quotation list rows so the Follow-up Status cell can open the
 * shared "FOLLOW-UP HISTORY" dropdown (the CRM Leads Last Follow-up pattern)
 * with the ACTUAL follow-ups behind its count, without a second request: the
 * list already loads the quotation's active follow-ups in one batched query per
 * page ({@code FollowUpRepository.findActiveByQuotationIdIn}), so this DTO only
 * reshapes data that is already in memory — it never triggers its own query.
 * <p>
 * Every field maps 1:1 onto a real {@code FollowUp} column and mirrors the
 * entity's own naming, so the shared dropdown consumes it exactly like it
 * consumes a raw follow-up row (date + Current/status badge + "mode · status").
 * Nothing is derived or invented. Follow-ups attached to the revision chain's
 * original quotation are included, exactly as the count already includes them.
 */
public record QuotationFollowUpSummary(
        Long id,
        String followupDate,
        String mode,
        // The follow-up's own "currentStatus" column; the dropdown falls back to
        // `status` for it, same as the Leads implementation.
        String currentStatus,
        String status
) {
}
