package com.vishatech.erp.entity;

/**
 * Who may access a document. Stored as a STRING in
 * {@code document_repository.visibility} / {@code cpr_technical_verification_documents.visibility}
 * (VARCHAR(20)) — every value fits.
 *
 * Semantics are enforced server-side by
 * {@link com.vishatech.erp.service.DocumentPermissionService}:
 * <ul>
 *   <li>{@link #ADMIN_ONLY} — only authenticated ADMIN users.</li>
 *   <li>{@link #SALES_TEAM_ONLY} — ADMIN + users whose {@code users.team} is SALES.</li>
 *   <li>{@link #ACCOUNTS_TEAM_ONLY} — ADMIN + users whose {@code users.team} is ACCOUNTS.</li>
 *   <li>{@link #PURCHASE_TEAM_ONLY} — ADMIN + users whose {@code users.team} is PURCHASE.</li>
 *   <li>{@link #TEAM_ONLY} / {@link #CUSTOMER} / {@link #BOTH} — legacy values,
 *       unchanged: any authenticated internal ERP user; customer exposure itself
 *       is governed by the customer-facing/forwarding code paths (CUSTOMER/BOTH only).</li>
 * </ul>
 */
public enum DocumentVisibility {
    ADMIN_ONLY,
    SALES_TEAM_ONLY,
    ACCOUNTS_TEAM_ONLY,
    PURCHASE_TEAM_ONLY,
    TEAM_ONLY,
    CUSTOMER,
    BOTH
}
