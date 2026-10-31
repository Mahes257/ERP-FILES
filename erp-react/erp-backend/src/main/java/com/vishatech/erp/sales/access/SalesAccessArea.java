package com.vishatech.erp.sales.access;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * The Sales module's real functional areas — one per page / document type that
 * exists in the current codebase. They follow the Sales sidebar
 * ({@code src/components/Layout/SalesNav.jsx}: Sales Dashboard → CRM → CPR →
 * Sales Execution → Documents → Sales Reports → Sales Settings) and the
 * controllers behind each page.
 *
 * <p>Each area declares exactly the actions its endpoints actually support, so
 * the Access Management matrix never offers a switch for an action that does
 * not exist. The action lists were read off the controllers, e.g.:
 *
 * <ul>
 *   <li>{@code CPR}: {@code /cprs/**} + {@code /cpr-technical-verifications/**}
 *       — create, edit, delete, {@code /{id}/submit}, {@code /{id}/approve},
 *       {@code /{id}/reject}, {@code /{id}/send-back}, {@code /{id}/float},
 *       {@code POST /cprs/export} and the technical-verification document
 *       upload. Its {@code Delete} switch is the narrower one this module
 *       already defines — the permanent delete
 *       ({@code /bulk-permanent-delete}, {@code /{id}/permanent}) — because the
 *       trash-style {@code DELETE /cprs/{id}} is an ordinary record edit
 *       ({@code CPR_EDIT}). See
 *       {@link SalesAccessPolicy#trashDeleteIsAnEdit(SalesAccessArea)};</li>
 *   <li>{@code Cost Workouts} / {@code Profit Workouts} — create, edit, delete,
 *       submit, approve/reject; neither controller has an export or an
 *       attachment POST, so neither switch is offered. Their {@code Delete} is
 *       the permanent {@code DELETE /{id}/permanent}, for the same reason as
 *       CPR's;</li>
 *   <li>{@code Quotations} — create, edit, delete, {@code POST /quotations/export},
 *       {@code POST /quotations/{id}/send} and the quotation attachments; there
 *       is no quotation approval endpoint, so no Approve switch;</li>
 *   <li>{@code Documents} — the Sales-scoped repository read only (see
 *       {@link SalesAccessPolicy} for why);</li>
 *   <li>{@code CRM · Leads / Clients / Follow-ups} — each declares {@code Upload}
 *       because the CRM forms really post to {@code /{id}/attachments}
 *       ({@code leadService}, {@code customerService}, {@code followUpService}).
 *       Without it the policy would resolve that upload to a pair the matrix
 *       never grants, i.e. a permanent 403 for every role, ADMIN included.</li>
 * </ul>
 */
public enum SalesAccessArea {

    DASHBOARD("dashboard", "Sales Dashboard", SalesAccessAction.VIEW),

    // ── CRM (the Sales group's CRM submodule) ────────────────────────────
    LEADS("leads", "CRM · Leads",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.EXPORT, SalesAccessAction.IMPORT,
            SalesAccessAction.UPLOAD),

    CLIENTS("clients", "CRM · Clients",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.UPLOAD),

    CONTACTS("contacts", "CRM · Contacts",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE),

    FOLLOWUPS("followups", "CRM · Follow-ups",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.UPLOAD),

    // ── CPR (Customer Purchase Request + its cost/profit workouts) ───────
    CPR("cpr", "CPR",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.SUBMIT, SalesAccessAction.APPROVE,
            SalesAccessAction.EXPORT, SalesAccessAction.UPLOAD),

    COST_WORKOUTS("costWorkouts", "Cost Workouts",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.SUBMIT, SalesAccessAction.APPROVE),

    PROFIT_WORKOUTS("profitWorkouts", "Profit Workouts",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.SUBMIT, SalesAccessAction.APPROVE),

    // ── Sales Execution ──────────────────────────────────────────────────
    QUOTATIONS("quotations", "Quotations",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.EXPORT, SalesAccessAction.SEND,
            SalesAccessAction.UPLOAD),

    SALES_CONTRACTS("salesContracts", "Sales Contracts",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.APPROVE, SalesAccessAction.EXPORT,
            SalesAccessAction.IMPORT, SalesAccessAction.UPLOAD),

    CPO("cpo", "Customer Purchase Orders",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.APPROVE, SalesAccessAction.EXPORT,
            SalesAccessAction.UPLOAD),

    DELIVERY_CHALLANS("deliveryChallans", "Delivery Challans",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.EXPORT, SalesAccessAction.UPLOAD),

    PROFORMA_INVOICES("proformaInvoices", "Proforma Invoices",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.EXPORT, SalesAccessAction.SEND,
            SalesAccessAction.UPLOAD),

    INVOICES("invoices", "Invoices",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.EXPORT, SalesAccessAction.SEND,
            SalesAccessAction.UPLOAD),

    PAYMENT_RECEIPTS("paymentReceipts", "Payment Receipts",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.EXPORT, SalesAccessAction.UPLOAD),

    CREDIT_NOTES("creditNotes", "Credit Notes",
            SalesAccessAction.VIEW, SalesAccessAction.CREATE, SalesAccessAction.EDIT,
            SalesAccessAction.DELETE, SalesAccessAction.APPROVE, SalesAccessAction.EXPORT,
            SalesAccessAction.UPLOAD),

    // ── Shared repository (Sales view) / Reports / Settings ──────────────
    DOCUMENTS("documents", "Documents", SalesAccessAction.VIEW),

    REPORTS("reports", "Sales Reports", SalesAccessAction.VIEW, SalesAccessAction.EXPORT),

    SETTINGS("settings", "Sales Settings", SalesAccessAction.VIEW, SalesAccessAction.EDIT);

    private final String key;
    private final String label;
    private final Set<SalesAccessAction> actions;

    SalesAccessArea(String key, String label, SalesAccessAction... actions) {
        this.key = key;
        this.label = label;
        this.actions = Collections.unmodifiableSet(EnumSet.of(actions[0], actions));
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    public Set<SalesAccessAction> actions() {
        return actions;
    }

    public boolean supports(SalesAccessAction action) {
        return actions.contains(action);
    }

    public static SalesAccessArea fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (SalesAccessArea area : values()) {
            if (area.key.equalsIgnoreCase(key.trim())) {
                return area;
            }
        }
        return null;
    }
}
