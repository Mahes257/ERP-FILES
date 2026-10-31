package com.vishatech.erp.purchase.access;

import java.util.Collections;
import java.util.EnumSet;
import java.util.Set;

/**
 * The Purchase functional areas an administrator can configure, and the actions
 * each of them really performs.
 *
 * <p>Derived from the Purchase controllers mounted on {@code /api/purchase/**}
 * and the pages under {@code src/purchase/pages}:
 *
 * <ul>
 *   <li>{@code Dashboard} and {@code Work Queue} are read-only aggregations;</li>
 *   <li>{@code Purchase Requisition} — create/edit/delete, submit, approve,
 *       reject (and return for correction), convert into an RFQ, attachments and
 *       the browser print; its {@code PR Technical Specification Review}
 *       submodule has its own endpoints under {@code /requisitions/technical-review};</li>
 *   <li>{@code Vendor Management} — create/edit/delete (the controller also has
 *       archive, restore and status, which are edits), vendor documents
 *       (upload/download) and the performance/report exports; the
 *       {@code Vendor Performance} and {@code Vendor Reports} submodules are
 *       listed separately because they are their own screens;</li>
 *   <li>{@code RFQ &amp; Quotations} — RFQ create/edit/delete, submit-review,
 *       send (submit), approve, reject, evaluate, award, close, cancel, supplier
 *       quotations (create/delete), attachments, print and export; the
 *       {@code Technical Evaluation}, {@code Final Negotiation} and
 *       {@code Price Comparative Statement} workflow screens and the
 *       {@code NFA} (technical purchase approval) document have their own
 *       switches;</li>
 *   <li>{@code RFQ Follow-ups} — create/edit/delete, complete and cancel;</li>
 *   <li>{@code Purchase Orders} — create/edit/delete, submit, approve, reject,
 *       release, supplier acknowledgement, print and export;</li>
 *   <li>{@code Logistics} — manufacturing/packing, shipments, GRN (receipt),
 *       inspections and inventory movements: create/edit/delete, receive,
 *       attachments, print and export. Each submodule has its own endpoint family
 *       ({@code /manufacturing}, {@code /shipments}, {@code /grns},
 *       {@code /inspections}, {@code /inventory}) and therefore its own area, so
 *       "may track shipments" can be granted without "may receive goods";</li>
 *   <li>{@code Purchase Invoice} — create/edit/delete, submit, approve, reject,
 *       three-way match, pay/advice/reverse, print and export, with the
 *       {@code Three-Way Matching} and {@code Payments} submodules broken out;</li>
 *   <li>{@code Adjustment Notes} — create/edit/delete, submit, approve, reject,
 *       print;</li>
 *   <li>{@code Documents} — the Purchase document explorer. Its server calls go
 *       to the SHARED repository, whose writes and downloads already run on the
 *       {@code DOCUMENT_*} authorities, so only View is offered here and nothing
 *       about Sales/Production documents changes;</li>
 *   <li>{@code Reports} — read plus the browser-side export and print;</li>
 *   <li>{@code Purchase Settings} — the settings document is stored in the
 *       browser (no Purchase settings endpoint exists), so View and Edit are
 *       UI-enforced; Access Management itself is ADMIN-only on the server.</li>
 * </ul>
 *
 * <h2>Parent modules</h2>
 *
 * <p>A submodule area declares the module it belongs to. Its effective
 * permissions are ANDed with that module's permissions for the same action
 * (see {@link PurchaseAccessService}), so a submodule can only ever
 * <em>narrow</em> access: a configuration that already switched a parent action
 * off keeps it off inside every submodule, and no existing configuration silently
 * gains a capability when a new submodule is added.
 */
public enum PurchaseAccessArea {

    DASHBOARD("dashboard", "Purchase Dashboard", null, PurchaseAccessAction.VIEW),

    WORK_QUEUE("workQueue", "Work Queue", null, PurchaseAccessAction.VIEW),

    REQUISITION("requisition", "Purchase Requisition", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
            PurchaseAccessAction.REJECT, PurchaseAccessAction.CONVERT, PurchaseAccessAction.UPLOAD,
            PurchaseAccessAction.PRINT),

    PR_TECH_SPEC("prTechSpec", "PR Technical Specification Review", REQUISITION,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.APPROVE, PurchaseAccessAction.REJECT),

    VENDORS("vendors", "Vendor Management", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.UPLOAD, PurchaseAccessAction.DOWNLOAD,
            PurchaseAccessAction.EXPORT, PurchaseAccessAction.PRINT),

    VENDOR_PERFORMANCE("vendorPerformance", "Vendor Performance", VENDORS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EXPORT),

    VENDOR_REPORTS("vendorReports", "Vendor Reports", VENDORS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EXPORT, PurchaseAccessAction.PRINT),

    RFQ("rfq", "RFQ & Quotations", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
            PurchaseAccessAction.REJECT, PurchaseAccessAction.EVALUATE, PurchaseAccessAction.AWARD,
            PurchaseAccessAction.CLOSE, PurchaseAccessAction.CANCEL, PurchaseAccessAction.UPLOAD,
            PurchaseAccessAction.DOWNLOAD, PurchaseAccessAction.PRINT, PurchaseAccessAction.EXPORT),

    RFQ_TECH_EVAL("rfqTechnicalEvaluation", "Technical Evaluation", RFQ,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EVALUATE),

    RFQ_NEGOTIATION("rfqNegotiation", "Final Negotiation", RFQ,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EVALUATE, PurchaseAccessAction.PRINT),

    RFQ_PCS("rfqPcs", "Price Comparative Statement", RFQ,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EXPORT, PurchaseAccessAction.PRINT),

    NFA("nfa", "NFA (Technical Purchase Approval)", RFQ,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
            PurchaseAccessAction.REJECT, PurchaseAccessAction.PRINT),

    FOLLOW_UPS("followUps", "RFQ Follow-ups", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.COMPLETE, PurchaseAccessAction.CANCEL),

    ORDERS("orders", "Purchase Orders", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
            PurchaseAccessAction.REJECT, PurchaseAccessAction.RELEASE, PurchaseAccessAction.ACKNOWLEDGE,
            PurchaseAccessAction.PRINT, PurchaseAccessAction.EXPORT),

    LOGISTICS("logistics", "Logistics", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.RECEIVE, PurchaseAccessAction.UPLOAD,
            PurchaseAccessAction.DOWNLOAD, PurchaseAccessAction.PRINT, PurchaseAccessAction.EXPORT),

    PACKING("packing", "Logistics · Packing", LOGISTICS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.PRINT),

    SHIPMENTS("shipments", "Logistics · Shipments", LOGISTICS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT),

    GRN("grn", "Logistics · Goods Receipt (GRN)", LOGISTICS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.RECEIVE, PurchaseAccessAction.PRINT),

    INSPECTIONS("inspections", "Logistics · Quality Inspections", LOGISTICS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT),

    INVENTORY("inventory", "Logistics · Inventory", LOGISTICS,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT),

    INVOICES("invoices", "Purchase Invoice", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
            PurchaseAccessAction.REJECT, PurchaseAccessAction.MATCH, PurchaseAccessAction.PAY,
            PurchaseAccessAction.PRINT, PurchaseAccessAction.EXPORT),

    INVOICE_MATCHING("invoiceMatching", "Three-Way Matching", INVOICES,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.MATCH),

    PAYMENTS("payments", "Payments", INVOICES,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.PAY),

    ADJUSTMENT_NOTES("adjustmentNotes", "Adjustment Notes", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.CREATE, PurchaseAccessAction.EDIT,
            PurchaseAccessAction.DELETE, PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
            PurchaseAccessAction.REJECT, PurchaseAccessAction.PRINT),

    DOCUMENTS("documents", "Documents", null, PurchaseAccessAction.VIEW),

    REPORTS("reports", "Reports", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EXPORT, PurchaseAccessAction.PRINT),

    SETTINGS("settings", "Purchase Settings", null,
            PurchaseAccessAction.VIEW, PurchaseAccessAction.EDIT);

    private final String key;
    private final String label;
    private final PurchaseAccessArea parent;
    private final Set<PurchaseAccessAction> actions;

    PurchaseAccessArea(String key, String label, PurchaseAccessArea parent,
                       PurchaseAccessAction... actions) {
        this.key = key;
        this.label = label;
        this.parent = parent;
        this.actions = Collections.unmodifiableSet(EnumSet.of(actions[0], actions));
    }

    public String key() {
        return key;
    }

    public String label() {
        return label;
    }

    /** The module this area belongs to, or {@code null} for a parent module. */
    public PurchaseAccessArea parent() {
        return parent;
    }

    /** Every action this area really performs, in declaration order. */
    public Set<PurchaseAccessAction> actions() {
        return actions;
    }

    public boolean supports(PurchaseAccessAction action) {
        return action != null && actions.contains(action);
    }

    public static PurchaseAccessArea fromKey(String key) {
        if (key == null) {
            return null;
        }
        for (PurchaseAccessArea area : values()) {
            if (area.key.equalsIgnoreCase(key.trim())) {
                return area;
            }
        }
        return null;
    }
}
