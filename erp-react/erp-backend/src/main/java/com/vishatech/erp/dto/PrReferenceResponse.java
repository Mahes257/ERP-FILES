package com.vishatech.erp.dto;

/**
 * A selectable Reference PR No.
 *
 * {@code source} is {@code CPR} when the PR No is carried by a real CPR row and
 * {@code DIRECT} when it was registered straight from the Quotation form;
 * {@code sourceLabel} is the human-readable form ("CPR Reference" /
 * "Direct PR Reference") so every screen shows the same wording.
 */
public record PrReferenceResponse(
        Long id,
        String referencePrNo,
        String source,
        String sourceLabel,
        Long cprId,
        String cprNo,
        Long clientId,
        String clientName,
        String project,
        String description,
        String requestedBy,
        String prDate,
        String remarks,
        String createdBy,
        String createdAt
) {
    public static final String LABEL_CPR = "CPR Reference";
    public static final String LABEL_DIRECT = "Direct PR Reference";

    public static String labelFor(String source) {
        return "CPR".equalsIgnoreCase(source) ? LABEL_CPR : LABEL_DIRECT;
    }
}
