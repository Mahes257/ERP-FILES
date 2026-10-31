package com.vishatech.erp.crm.dto;

/**
 * One detected duplicate client, reported by the client form's pre-save
 * duplicate check.
 *
 * <p>{@code existingId} is deliberately a String: the frontend only ever
 * displays it, and the field shipped that way, so the JSON contract is
 * preserved exactly.</p>
 */
public record CustomerDuplicateMatch(
        String field,
        String message,
        String existingId,
        String existingName) {
}
