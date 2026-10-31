package com.vishatech.erp.dto;

import jakarta.validation.constraints.NotBlank;

/**
 * Links an already-created downstream document back to a quotation.
 *
 * Used by the stand-alone Convert Quotation page, which builds the Sales
 * Contract itself (so the user keeps control of its number, date and terms) and
 * then records the conversion against the quotation. This is deliberately
 * separate from the quotation's lifecycle status: {@code status} is never
 * derived from a conversion.
 *
 * @param target the downstream module — {@code sales-contract}, {@code sales-order} /
 *               {@code cpo}, {@code proforma}, {@code invoice}, {@code credit-note},
 *               {@code payment-receipt} or {@code delivery-challan}
 * @param number the created document's own number (e.g. {@code SC-2026-000012})
 */
public record ConversionReferenceRequest(
        @NotBlank(message = "target is required") String target,
        @NotBlank(message = "number is required") String number
) {
}
