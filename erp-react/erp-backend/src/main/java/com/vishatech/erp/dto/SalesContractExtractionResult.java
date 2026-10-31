package com.vishatech.erp.dto;

/**
 * Result of extracting a single uploaded Sales Contract document.
 *
 * Deliberately limited to the four fields the ERP wants from an existing
 * contract document (customer name, contract number, contract date,
 * validity). Nothing else is ever extracted or returned.
 *
 * Each field carries its own confidence status:
 *   - "extracted"    — found in the document and validated
 *   - "needsReview"  — label found but the value could not be validated
 *   - "notDetected"  — not confidently found in the document
 */
public record SalesContractExtractionResult(
        String fileName,
        String text,
        FieldResult customerName,
        FieldResult scNo,
        FieldResult contractDate,
        FieldResult validity
) {

    public record FieldResult(String value, String status) {
        public static FieldResult extracted(String value) {
            return new FieldResult(value, "extracted");
        }

        public static FieldResult needsReview(String value) {
            return new FieldResult(value, "needsReview");
        }

        public static FieldResult notDetected() {
            return new FieldResult("", "notDetected");
        }
    }
}
