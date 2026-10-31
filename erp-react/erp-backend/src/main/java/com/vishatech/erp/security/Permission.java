package com.vishatech.erp.security;

/**
 * Fine-grained permissions the ERP can enforce with method security.
 *
 * The current authorization model is role-based (ADMIN / MANAGER / USER) and
 * stays that way. This enum is the extension point: as the ERP grows, service
 * methods can be annotated with {@code @PreAuthorize("hasAuthority('SALES_APPROVE')")}
 * without changing roles. {@link RolePermissions} already maps today's roles to
 * the permission set they would receive.
 *
 * These permission names are NEVER read from client input — they are derived
 * server-side from the authenticated principal's role.
 */
public enum Permission {

    // ── Sales ──────────────────────────────────────────────────────────────
    SALES_VIEW,
    SALES_CREATE,
    SALES_EDIT,
    SALES_DELETE,
    SALES_APPROVE,

    // ── Purchase ────────────────────────────────────────────────────────────
    PURCHASE_VIEW,
    PURCHASE_CREATE,
    PURCHASE_EDIT,
    PURCHASE_APPROVE,

    // ── Production ──────────────────────────────────────────────────────────
    PRODUCTION_VIEW,
    PRODUCTION_CREATE,
    PRODUCTION_EDIT,
    PRODUCTION_DELETE,
    PRODUCTION_APPROVE,
    PRODUCTION_DISPATCH,

    // ── CRM ─────────────────────────────────────────────────────────────────
    CRM_VIEW,
    CRM_CREATE,
    CRM_EDIT,
    CRM_DELETE,

    // ── CPR (Cost/Profit Reviews) ───────────────────────────────────────────
    CPR_VIEW,
    CPR_CREATE,
    CPR_EDIT,
    CPR_DELETE,
    CPR_APPROVE,

    // ── Marketing ───────────────────────────────────────────────────────────
    MARKETING_VIEW,
    MARKETING_CREATE,
    MARKETING_EDIT,
    MARKETING_DELETE,

    // ── Documents ───────────────────────────────────────────────────────────
    DOCUMENT_VIEW,
    DOCUMENT_CREATE,
    DOCUMENT_EDIT,
    DOCUMENT_DELETE,

    // ── Notifications ───────────────────────────────────────────────────────
    NOTIFICATION_VIEW,
    NOTIFICATION_MANAGE,

    // ── Administration ──────────────────────────────────────────────────────
    USER_MANAGE,
    ROLE_MANAGE,
    SETTINGS_MANAGE
}
