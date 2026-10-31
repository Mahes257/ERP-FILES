package com.vishatech.erp.dto;

/**
 * Create/register a Reference PR No directly from the Quotation form
 * ("+ Add New Reference PR No."). Only {@code referencePrNo} is required —
 * the rest is optional enquiry context.
 */
public record PrReferenceRequest(
        String referencePrNo,
        Long clientId,
        String clientName,
        String project,
        String description,
        String requestedBy,
        String prDate,
        String remarks
) {
}
