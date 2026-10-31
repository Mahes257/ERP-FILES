package com.vishatech.erp.crm.dto;

/**
 * A CRM contact as the UI needs it.
 *
 * The lead and client references are returned as real ids PLUS the display
 * fields the CRM lists use for them, so the Contacts table can show the
 * associated lead/client without a second request:
 *
 *   * {@code leadId}      → the UI renders the lead number exactly like every
 *                           other CRM page (formatLeadNo(id) → "LEAD-000123"),
 *                           because the lead number is derived, not stored.
 *   * {@code clientCode}  → the client's real code (CL-0001), shown beside the
 *                           business name the same way the Clients list does.
 *
 * {@code leadId} and {@code clientId} are both nullable and independent: a
 * lead-associated contact has no client until the lead converts, and a
 * converted contact keeps both references.
 */
public record ContactResponse(
        Long id,
        String name,
        String designation,
        String phone,
        String email,
        String contactType,
        String businessName,
        Long leadId,
        String leadName,
        String leadBusinessName,
        String leadStage,
        Long clientId,
        String clientCode,
        String clientName,
        String status,
        String source,
        String createdAt,
        String updatedAt
) {
}
