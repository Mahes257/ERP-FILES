package com.vishatech.erp.purchase.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.vishatech.erp.entity.UserRole;
import java.util.LinkedHashMap;
import java.util.Map;
import com.vishatech.erp.purchase.access.PurchaseAccessPolicy.Requirement;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the Purchase access contract: what each request requires, that the
 * management surface and the shared ERP endpoints stay outside the policy, and
 * that the documented defaults reproduce today's access.
 */
class PurchaseAccessPolicyTest {

    private static Requirement resolve(String method, String path) {
        return PurchaseAccessPolicy.resolve(method, path, null);
    }

    private static void assertRequirement(String method, String path,
                                          PurchaseAccessArea area, PurchaseAccessAction action) {
        Requirement requirement = resolve(method, path);
        assertNotNull(requirement, method + " " + path + " must be governed by a Purchase area");
        assertEquals(area, requirement.area(), method + " " + path + " area");
        assertEquals(action, requirement.action(), method + " " + path + " action");
    }

    private static boolean defaultFor(UserRole role, PurchaseAccessArea area, PurchaseAccessAction action) {
        return PurchaseAccessPolicy.defaultAllow(role, area, action);
    }

    // ── Reads ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("every read in a Purchase area requires View on that area")
    void readsRequireView() {
        assertRequirement("GET", "/api/purchase/dashboard/stats", PurchaseAccessArea.DASHBOARD,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/work-queue", PurchaseAccessArea.WORK_QUEUE,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/work-queue/counts", PurchaseAccessArea.WORK_QUEUE,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/requisitions", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/requisitions/technical-review", PurchaseAccessArea.PR_TECH_SPEC,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/vendors/12", PurchaseAccessArea.VENDORS,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/vendors/performance", PurchaseAccessArea.VENDOR_PERFORMANCE,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/rfqs/dashboard", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/rfqs/9/comparison", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/quotations", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/rfq-follow-ups/stats", PurchaseAccessArea.FOLLOW_UPS,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/orders/4/timeline", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/grns/stats", PurchaseAccessArea.GRN,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/inventory/ledger", PurchaseAccessArea.INVENTORY,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/shipments", PurchaseAccessArea.SHIPMENTS,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/inspections/5", PurchaseAccessArea.INSPECTIONS,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/invoices/payment-ledger", PurchaseAccessArea.PAYMENTS,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/adjustment-notes/stats", PurchaseAccessArea.ADJUSTMENT_NOTES,
                PurchaseAccessAction.VIEW);
    }

    /** A document preview is View; the separably-named download is Download. */
    @Test
    @DisplayName("a print preview is Print, a download is Download")
    void printPreviewAndDownload() {
        assertRequirement("GET", "/api/purchase/rfqs/9/print-preview", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.PRINT);
        assertRequirement("GET", "/api/purchase/vendors/7/download", PurchaseAccessArea.VENDORS,
                PurchaseAccessAction.DOWNLOAD);
    }

    // ── Writes ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("collection POSTs are Create, record writes are Edit, DELETEs are Delete")
    void createEditDelete() {
        assertRequirement("POST", "/api/purchase/requisitions", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/vendors", PurchaseAccessArea.VENDORS,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/rfqs", PurchaseAccessArea.RFQ, PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/quotations", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/rfq-follow-ups", PurchaseAccessArea.FOLLOW_UPS,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/orders", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/invoices", PurchaseAccessArea.INVOICES,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/adjustment-notes", PurchaseAccessArea.ADJUSTMENT_NOTES,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/grns", PurchaseAccessArea.GRN,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/inventory", PurchaseAccessArea.INVENTORY,
                PurchaseAccessAction.CREATE);

        assertRequirement("PUT", "/api/purchase/requisitions/4", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.EDIT);
        assertRequirement("PATCH", "/api/purchase/requisitions/4/archive", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.EDIT);
        assertRequirement("PATCH", "/api/purchase/requisitions/4/restore", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.EDIT);
        assertRequirement("PATCH", "/api/purchase/vendors/7/status", PurchaseAccessArea.VENDORS,
                PurchaseAccessAction.EDIT);
        assertRequirement("POST", "/api/purchase/vendors/7/comments", PurchaseAccessArea.VENDORS,
                PurchaseAccessAction.EDIT);
        assertRequirement("PUT", "/api/purchase/rfqs/9", PurchaseAccessArea.RFQ, PurchaseAccessAction.EDIT);
        assertRequirement("PATCH", "/api/purchase/orders/4/delivery-status", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.EDIT);
        assertRequirement("POST", "/api/purchase/orders/4/reminder", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.EDIT);
        assertRequirement("PATCH", "/api/purchase/inspections/5", PurchaseAccessArea.INSPECTIONS,
                PurchaseAccessAction.EDIT);
        assertRequirement("POST", "/api/purchase/inventory/transfer", PurchaseAccessArea.INVENTORY,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/inventory/IM-1/reverse", PurchaseAccessArea.INVENTORY,
                PurchaseAccessAction.EDIT);
        assertRequirement("PUT", "/api/purchase/invoices/4", PurchaseAccessArea.INVOICES,
                PurchaseAccessAction.EDIT);

        assertRequirement("DELETE", "/api/purchase/requisitions/4", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.DELETE);
        assertRequirement("PATCH", "/api/purchase/requisitions/4/delete", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.DELETE);
        assertRequirement("DELETE", "/api/purchase/vendors/7", PurchaseAccessArea.VENDORS,
                PurchaseAccessAction.DELETE);
        assertRequirement("DELETE", "/api/purchase/rfqs/9", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.DELETE);
        assertRequirement("DELETE", "/api/purchase/quotations/3", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.DELETE);
        assertRequirement("DELETE", "/api/purchase/orders/4", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.DELETE);
        assertRequirement("DELETE", "/api/purchase/invoices/4", PurchaseAccessArea.INVOICES,
                PurchaseAccessAction.DELETE);
        // Attachment removal is an upload-family operation.
        assertRequirement("DELETE", "/api/purchase/rfqs/9/attachments/12", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.UPLOAD);
    }

    @Test
    @DisplayName("the requisition workflow keeps its own actions")
    void requisitionWorkflow() {
        assertRequirement("POST", "/api/purchase/requisitions/4/submit", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.SUBMIT);
        assertRequirement("POST", "/api/purchase/requisitions/4/approve", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/requisitions/4/reject", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.REJECT);
        assertRequirement("POST", "/api/purchase/requisitions/4/return", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/requisitions/4/complete-technical-review",
                PurchaseAccessArea.PR_TECH_SPEC, PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/requisitions/4/duplicate", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/requisitions/convert-to-rfq", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.CONVERT);
        assertRequirement("POST", "/api/purchase/requisitions/4/attachments", PurchaseAccessArea.REQUISITION,
                PurchaseAccessAction.UPLOAD);
    }

    @Test
    @DisplayName("RFQ evaluation, award, close and cancel stay separate")
    void rfqWorkflow() {
        assertRequirement("POST", "/api/purchase/rfqs/9/submit-review", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.SUBMIT);
        assertRequirement("POST", "/api/purchase/rfqs/9/send", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.SUBMIT);
        assertRequirement("POST", "/api/purchase/rfqs/9/approve", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/rfqs/9/reject", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.REJECT);
        assertRequirement("POST", "/api/purchase/rfqs/9/evaluate", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.EVALUATE);
        assertRequirement("PUT", "/api/purchase/rfqs/9/evaluation-record", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.EVALUATE);
        assertRequirement("POST", "/api/purchase/rfqs/9/award", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.AWARD);
        assertRequirement("POST", "/api/purchase/rfqs/9/close", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.CLOSE);
        assertRequirement("POST", "/api/purchase/rfqs/9/cancel", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.CANCEL);
        assertRequirement("POST", "/api/purchase/rfqs/9/duplicate", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.CREATE);
        assertRequirement("POST", "/api/purchase/rfqs/9/attachments", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.UPLOAD);
        assertRequirement("POST", "/api/purchase/rfqs/9/print-log", PurchaseAccessArea.RFQ,
                PurchaseAccessAction.PRINT);
    }

    @Test
    @DisplayName("follow-ups, orders, logistics and invoices keep their workflow actions")
    void operationalWorkflows() {
        assertRequirement("POST", "/api/purchase/rfq-follow-ups/4/complete", PurchaseAccessArea.FOLLOW_UPS,
                PurchaseAccessAction.COMPLETE);
        assertRequirement("POST", "/api/purchase/rfq-follow-ups/4/cancel", PurchaseAccessArea.FOLLOW_UPS,
                PurchaseAccessAction.CANCEL);

        assertRequirement("POST", "/api/purchase/orders/4/submit", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.SUBMIT);
        assertRequirement("POST", "/api/purchase/orders/4/approve", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/orders/4/reject", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.REJECT);
        assertRequirement("POST", "/api/purchase/orders/4/release", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.RELEASE);
        assertRequirement("POST", "/api/purchase/orders/4/acknowledge", PurchaseAccessArea.ORDERS,
                PurchaseAccessAction.ACKNOWLEDGE);

        assertRequirement("POST", "/api/purchase/grns/4/receive", PurchaseAccessArea.GRN,
                PurchaseAccessAction.RECEIVE);

        assertRequirement("POST", "/api/purchase/invoices/4/submit", PurchaseAccessArea.INVOICES,
                PurchaseAccessAction.SUBMIT);
        assertRequirement("POST", "/api/purchase/invoices/4/approve", PurchaseAccessArea.INVOICES,
                PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/invoices/4/reject", PurchaseAccessArea.INVOICES,
                PurchaseAccessAction.REJECT);
        assertRequirement("POST", "/api/purchase/invoices/4/match", PurchaseAccessArea.INVOICE_MATCHING,
                PurchaseAccessAction.MATCH);
        assertRequirement("POST", "/api/purchase/invoices/4/pay", PurchaseAccessArea.PAYMENTS,
                PurchaseAccessAction.PAY);
        assertRequirement("POST", "/api/purchase/invoices/4/advice", PurchaseAccessArea.PAYMENTS,
                PurchaseAccessAction.PAY);
        assertRequirement("POST", "/api/purchase/invoices/4/advice/send", PurchaseAccessArea.PAYMENTS,
                PurchaseAccessAction.PAY);
        assertRequirement("POST", "/api/purchase/invoices/4/payments/PAY-1/reverse", PurchaseAccessArea.PAYMENTS,
                PurchaseAccessAction.PAY);

        assertRequirement("POST", "/api/purchase/adjustment-notes/4/submit", PurchaseAccessArea.ADJUSTMENT_NOTES,
                PurchaseAccessAction.SUBMIT);
        assertRequirement("POST", "/api/purchase/adjustment-notes/4/approve", PurchaseAccessArea.ADJUSTMENT_NOTES,
                PurchaseAccessAction.APPROVE);
        assertRequirement("POST", "/api/purchase/adjustment-notes/4/reject", PurchaseAccessArea.ADJUSTMENT_NOTES,
                PurchaseAccessAction.REJECT);
    }

    // ── Boundaries ────────────────────────────────────────────────────────

    @Test
    @DisplayName("the management surface and the shared ERP endpoints stay outside the policy")
    void excludedPaths() {
        assertNull(resolve("GET", "/api/purchase/access/me"));
        assertNull(resolve("PUT", "/api/purchase/access/scope/ROLE/USER"));
        assertNull(resolve("DELETE", "/api/purchase/access/scope/USER/2"));
        // Shared document repository, files, masters, notifications, exchange rates:
        // other modules use them too and they keep their existing authorities.
        assertNull(resolve("GET", "/documents"));
        assertNull(resolve("POST", "/documents"));
        assertNull(resolve("GET", "/documents/42/file"));
        assertNull(resolve("GET", "/files/9"));
        assertNull(resolve("GET", "/masters/vendors"));
        assertNull(resolve("GET", "/notifications"));
        assertNull(resolve("GET", "/exchange-rates"));
        // Other modules' APIs are never touched by this policy.
        assertNull(resolve("GET", "/sales-orders"));
        assertNull(resolve("POST", "/production-orders"));
        assertNull(resolve("GET", "/invoices"));
    }

    /**
     * A pair the area does not declare can never be granted, so the policy must
     * never require one: {@code PurchaseAccessService.can()} refuses unknown
     * pairs, which would be a permanent 403 for every role, ADMIN included.
     */
    @Test
    void everyRequirableActionIsDeclaredByItsArea() {
        String[][] endpoints = {
                {"GET", "/api/purchase/dashboard/stats"},
                {"GET", "/api/purchase/work-queue"},
                {"GET", "/api/purchase/work-queue/counts"},
                {"GET", "/api/purchase/requisitions"},
                {"GET", "/api/purchase/requisitions/next-number"},
                {"POST", "/api/purchase/requisitions"},
                {"PUT", "/api/purchase/requisitions/4"},
                {"PATCH", "/api/purchase/requisitions/4/delete"},
                {"DELETE", "/api/purchase/requisitions/4"},
                {"POST", "/api/purchase/requisitions/4/submit"},
                {"POST", "/api/purchase/requisitions/4/approve"},
                {"POST", "/api/purchase/requisitions/4/reject"},
                {"POST", "/api/purchase/requisitions/4/return"},
                {"POST", "/api/purchase/requisitions/4/duplicate"},
                {"POST", "/api/purchase/requisitions/convert-to-rfq"},
                {"POST", "/api/purchase/requisitions/4/attachments"},
                {"GET", "/api/purchase/vendors"},
                {"POST", "/api/purchase/vendors"},
                {"PUT", "/api/purchase/vendors/7"},
                {"DELETE", "/api/purchase/vendors/7"},
                {"PATCH", "/api/purchase/vendors/7/status"},
                {"GET", "/api/purchase/vendors/7/download"},
                {"GET", "/api/purchase/rfqs"},
                {"POST", "/api/purchase/rfqs"},
                {"PUT", "/api/purchase/rfqs/9"},
                {"DELETE", "/api/purchase/rfqs/9"},
                {"POST", "/api/purchase/rfqs/9/approve"},
                {"POST", "/api/purchase/rfqs/9/evaluate"},
                {"POST", "/api/purchase/rfqs/9/award"},
                {"POST", "/api/purchase/rfqs/9/close"},
                {"POST", "/api/purchase/rfqs/9/cancel"},
                {"GET", "/api/purchase/rfqs/9/print-preview"},
                {"GET", "/api/purchase/quotations"},
                {"POST", "/api/purchase/quotations"},
                {"DELETE", "/api/purchase/quotations/3"},
                {"GET", "/api/purchase/rfq-follow-ups"},
                {"POST", "/api/purchase/rfq-follow-ups"},
                {"PUT", "/api/purchase/rfq-follow-ups/4"},
                {"DELETE", "/api/purchase/rfq-follow-ups/4"},
                {"POST", "/api/purchase/rfq-follow-ups/4/complete"},
                {"POST", "/api/purchase/rfq-follow-ups/4/cancel"},
                {"GET", "/api/purchase/orders"},
                {"POST", "/api/purchase/orders"},
                {"PUT", "/api/purchase/orders/4"},
                {"DELETE", "/api/purchase/orders/4"},
                {"POST", "/api/purchase/orders/4/submit"},
                {"POST", "/api/purchase/orders/4/approve"},
                {"POST", "/api/purchase/orders/4/reject"},
                {"POST", "/api/purchase/orders/4/release"},
                {"POST", "/api/purchase/orders/4/acknowledge"},
                {"GET", "/api/purchase/grns"},
                {"POST", "/api/purchase/grns"},
                {"PATCH", "/api/purchase/grns/4"},
                {"POST", "/api/purchase/grns/4/receive"},
                {"GET", "/api/purchase/inspections"},
                {"POST", "/api/purchase/inspections"},
                {"PATCH", "/api/purchase/inspections/5"},
                {"GET", "/api/purchase/manufacturing"},
                {"POST", "/api/purchase/manufacturing"},
                {"PATCH", "/api/purchase/manufacturing/4"},
                {"GET", "/api/purchase/shipments"},
                {"POST", "/api/purchase/shipments"},
                {"PATCH", "/api/purchase/shipments/4"},
                {"GET", "/api/purchase/inventory"},
                {"POST", "/api/purchase/inventory"},
                {"POST", "/api/purchase/inventory/transfer"},
                {"POST", "/api/purchase/inventory/IM-1/reverse"},
                {"GET", "/api/purchase/invoices"},
                {"POST", "/api/purchase/invoices"},
                {"PUT", "/api/purchase/invoices/4"},
                {"DELETE", "/api/purchase/invoices/4"},
                {"POST", "/api/purchase/invoices/4/submit"},
                {"POST", "/api/purchase/invoices/4/approve"},
                {"POST", "/api/purchase/invoices/4/reject"},
                {"POST", "/api/purchase/invoices/4/match"},
                {"POST", "/api/purchase/invoices/4/pay"},
                {"POST", "/api/purchase/invoices/4/advice"},
                {"POST", "/api/purchase/invoices/4/advice/send"},
                {"POST", "/api/purchase/invoices/4/payments/PAY-1/reverse"},
                {"GET", "/api/purchase/adjustment-notes"},
                {"POST", "/api/purchase/adjustment-notes"},
                {"PUT", "/api/purchase/adjustment-notes/4"},
                {"DELETE", "/api/purchase/adjustment-notes/4"},
                {"POST", "/api/purchase/adjustment-notes/4/submit"},
                {"POST", "/api/purchase/adjustment-notes/4/approve"},
                {"POST", "/api/purchase/adjustment-notes/4/reject"}
        };
        for (String[] endpoint : endpoints) {
            String method = endpoint[0];
            String path = endpoint[1];
            Requirement requirement = resolve(method, path);
            assertNotNull(requirement, method + " " + path + " must be governed by a Purchase area");
            assertTrue(requirement.area().supports(requirement.action()),
                    method + " " + path + " requires " + requirement.area() + " " + requirement.action()
                            + ", which the area does not declare");
        }
    }

    // ── Defaults ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("ADMIN and MANAGER keep every Purchase action")
    void adminAndManagerDefaultsAreEverything() {
        for (UserRole role : new UserRole[]{UserRole.ADMIN, UserRole.MANAGER}) {
            for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
                for (PurchaseAccessAction action : area.actions()) {
                    assertTrue(defaultFor(role, area, action),
                            role + " must keep " + area.key() + "." + action.key());
                }
            }
        }
    }

    @Test
    @DisplayName("USER keeps today's access — everything except approve and reject")
    void userDefaults() {
        for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
            for (PurchaseAccessAction action : area.actions()) {
                boolean allowed = defaultFor(UserRole.USER, area, action);
                if (action == PurchaseAccessAction.APPROVE || action == PurchaseAccessAction.REJECT) {
                    assertFalse(allowed, "USER must not be granted " + area.key() + "." + action.key());
                } else {
                    assertTrue(allowed, "USER keeps " + area.key() + "." + action.key());
                }
            }
        }
        // An unknown/absent role is never granted anything.
        for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
            for (PurchaseAccessAction action : area.actions()) {
                assertFalse(defaultFor(null, area, action),
                        "an absent role must not be granted " + area.key() + "." + action.key());
            }
        }
    }

    @Test
    @DisplayName("an area without a declared action reports it unsupported")
    void unsupportedActions() {
        assertFalse(PurchaseAccessArea.DASHBOARD.actions().contains(PurchaseAccessAction.CREATE));
        assertFalse(PurchaseAccessArea.WORK_QUEUE.actions().contains(PurchaseAccessAction.EDIT));
        assertFalse(PurchaseAccessArea.DOCUMENTS.actions().contains(PurchaseAccessAction.DELETE));
        assertFalse(PurchaseAccessArea.SETTINGS.actions().contains(PurchaseAccessAction.APPROVE));
        assertFalse(PurchaseAccessArea.FOLLOW_UPS.actions().contains(PurchaseAccessAction.APPROVE));
        assertFalse(PurchaseAccessArea.REPORTS.actions().contains(PurchaseAccessAction.CREATE));
    }

    // ── Submodules ────────────────────────────────────────────────────────

    @Test
    @DisplayName("logistics, invoice and requisition submodules resolve to their own area")
    void submoduleEndpoints() {
        assertRequirement("POST", "/api/purchase/manufacturing", PurchaseAccessArea.PACKING,
                PurchaseAccessAction.CREATE);
        assertRequirement("PATCH", "/api/purchase/manufacturing/3", PurchaseAccessArea.PACKING,
                PurchaseAccessAction.EDIT);
        assertRequirement("POST", "/api/purchase/shipments", PurchaseAccessArea.SHIPMENTS,
                PurchaseAccessAction.CREATE);
        assertRequirement("PATCH", "/api/purchase/shipments/7", PurchaseAccessArea.SHIPMENTS,
                PurchaseAccessAction.EDIT);
        assertRequirement("POST", "/api/purchase/inspections", PurchaseAccessArea.INSPECTIONS,
                PurchaseAccessAction.CREATE);
        assertRequirement("PATCH", "/api/purchase/grns/4", PurchaseAccessArea.GRN,
                PurchaseAccessAction.EDIT);

        assertRequirement("GET", "/api/purchase/invoices/4/match", PurchaseAccessArea.INVOICE_MATCHING,
                PurchaseAccessAction.VIEW);
        assertRequirement("GET", "/api/purchase/invoices/4/advice", PurchaseAccessArea.PAYMENTS,
                PurchaseAccessAction.VIEW);

        assertRequirement("GET", "/api/purchase/requisitions/4/technical-review",
                PurchaseAccessArea.PR_TECH_SPEC, PurchaseAccessAction.VIEW);
        assertRequirement("POST", "/api/purchase/requisitions/4/complete-technical-review",
                PurchaseAccessArea.PR_TECH_SPEC, PurchaseAccessAction.APPROVE);
    }

    @Test
    @DisplayName("a submodule can never exceed its parent module")
    void submoduleNarrowsParent() {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (PurchaseAccessAction action : area.actions()) {
                actions.put(action.key(), true);
            }
            matrix.put(area.key(), actions);
        }
        // A pre-existing configuration on the parent module only.
        matrix.get(PurchaseAccessArea.LOGISTICS.key()).put(PurchaseAccessAction.RECEIVE.key(), false);
        matrix.get(PurchaseAccessArea.INVOICES.key()).put(PurchaseAccessAction.PAY.key(), false);

        PurchaseAccessPolicy.applyParentInheritance(matrix);

        assertFalse(matrix.get(PurchaseAccessArea.GRN.key()).get(PurchaseAccessAction.RECEIVE.key()),
                "Logistics · Receive OFF must also block the GRN submodule");
        assertTrue(matrix.get(PurchaseAccessArea.GRN.key()).get(PurchaseAccessAction.VIEW.key()),
                "an action the parent still allows stays allowed in the submodule");
        assertFalse(matrix.get(PurchaseAccessArea.PAYMENTS.key()).get(PurchaseAccessAction.PAY.key()),
                "Invoice · Pay OFF must also block the Payments submodule");
        assertTrue(matrix.get(PurchaseAccessArea.ORDERS.key()).get(PurchaseAccessAction.APPROVE.key()),
                "an unrelated parent module is untouched");
    }
}
