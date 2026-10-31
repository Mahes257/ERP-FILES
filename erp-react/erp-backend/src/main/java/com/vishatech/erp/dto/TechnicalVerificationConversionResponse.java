package com.vishatech.erp.dto;

/**
 * Result of converting ONE Technical Verification item into a destination
 * document (Cost Workout or Purchase Requisition).
 *
 * The conversion is idempotent, so {@code alreadyConverted} tells the caller
 * whether a new record was created or an existing one was returned. The frontend
 * uses {@code destinationId} to open the destination record for review and
 * editing before the user saves.
 */
public record TechnicalVerificationConversionResponse(
        Long technicalVerificationId,
        String tvNo,
        /** "CW" or "PR". */
        String destination,
        Long destinationId,
        String destinationNo,
        boolean alreadyConverted,
        int itemCount,
        String message
) {
}
