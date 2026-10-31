package com.vishatech.erp.sales.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.sales.access.SalesAccessPolicy.Requirement;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The Sales access request policy — pure unit tests, no Spring context and no
 * database. They pin down exactly which (area, action) every Sales endpoint
 * requires, which is what the interceptor enforces on every request, and the
 * documented default each role keeps until an administrator configures it.
 */
class SalesAccessPolicyTest {

    private static Requirement resolve(String method, String path) {
        return SalesAccessPolicy.resolve(method, path, null);
    }

    private static void assertRequirement(String method, String path,
                                          SalesAccessArea area, SalesAccessAction action) {
        Requirement requirement = resolve(method, path);
        assertNotNull(requirement, method + " " + path + " must be a Sales-protected request");
        assertEquals(area, requirement.area(), "area for " + method + " " + path);
        assertEquals(action, requirement.action(), "action for " + method + " " + path);
    }

    private static boolean defaultFor(UserRole role, SalesAccessArea area, SalesAccessAction action) {
        return SalesAccessPolicy.defaultAllow(role, area, action);
    }

    // ── Reads ────────────────────────────────────────────────────────────

    @Test
    void everyReadNeedsViewOnItsOwnArea() {
        assertRequirement("GET", "/sales/dashboard", SalesAccessArea.DASHBOARD, SalesAccessAction.VIEW);
        assertRequirement("GET", "/sales/dashboard/summary", SalesAccessArea.DASHBOARD, SalesAccessAction.VIEW);
        assertRequirement("GET", "/sales/reports", SalesAccessArea.REPORTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/leads", SalesAccessArea.LEADS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/customers/4", SalesAccessArea.CLIENTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/contacts/stats", SalesAccessArea.CONTACTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/followups/history", SalesAccessArea.FOLLOWUPS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/cprs/stats", SalesAccessArea.CPR, SalesAccessAction.VIEW);
        assertRequirement("GET", "/cpr-technical-verifications/by-cpr/4", SalesAccessArea.CPR, SalesAccessAction.VIEW);
        assertRequirement("GET", "/cost-workouts/4/items", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/profit-workouts/4/timeline", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/quotations/7", SalesAccessArea.QUOTATIONS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/sales-contracts/stats", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/sales-orders/e-actions", SalesAccessArea.CPO, SalesAccessAction.VIEW);
        assertRequirement("GET", "/delivery-challans/3", SalesAccessArea.DELIVERY_CHALLANS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/proforma-invoices/9", SalesAccessArea.PROFORMA_INVOICES, SalesAccessAction.VIEW);
        assertRequirement("GET", "/invoices/stats", SalesAccessArea.INVOICES, SalesAccessAction.VIEW);
        assertRequirement("GET", "/payment-receipts/5", SalesAccessArea.PAYMENT_RECEIPTS, SalesAccessAction.VIEW);
        assertRequirement("GET", "/credit-notes/5", SalesAccessArea.CREDIT_NOTES, SalesAccessAction.VIEW);
        assertRequirement("GET", "/settings/sales", SalesAccessArea.SETTINGS, SalesAccessAction.VIEW);
        // The Sales-scoped repository read (the Sales Documents page's listing).
        Requirement documents = SalesAccessPolicy.resolve("GET", "/documents", "scope=sales&page=0");
        assertNotNull(documents, "the Sales-scoped documents listing must be governed");
        assertEquals(SalesAccessArea.DOCUMENTS, documents.area());
        assertEquals(SalesAccessAction.VIEW, documents.action());
    }

    // ── Writes ───────────────────────────────────────────────────────────

    @Test
    void creatingANewRecordNeedsCreate() {
        assertRequirement("POST", "/leads", SalesAccessArea.LEADS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/customers", SalesAccessArea.CLIENTS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/contacts", SalesAccessArea.CONTACTS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/followups", SalesAccessArea.FOLLOWUPS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/cprs", SalesAccessArea.CPR, SalesAccessAction.CREATE);
        assertRequirement("POST", "/cpr-technical-verifications", SalesAccessArea.CPR, SalesAccessAction.CREATE);
        assertRequirement("POST", "/cost-workouts", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/profit-workouts", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/quotations", SalesAccessArea.QUOTATIONS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/sales-contracts", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/sales-orders", SalesAccessArea.CPO, SalesAccessAction.CREATE);
        assertRequirement("POST", "/sales-orders/e-actions", SalesAccessArea.CPO, SalesAccessAction.CREATE);
        assertRequirement("POST", "/delivery-challans", SalesAccessArea.DELIVERY_CHALLANS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/proforma-invoices", SalesAccessArea.PROFORMA_INVOICES, SalesAccessAction.CREATE);
        assertRequirement("POST", "/invoices", SalesAccessArea.INVOICES, SalesAccessAction.CREATE);
        assertRequirement("POST", "/payment-receipts", SalesAccessArea.PAYMENT_RECEIPTS, SalesAccessAction.CREATE);
        assertRequirement("POST", "/credit-notes", SalesAccessArea.CREDIT_NOTES, SalesAccessAction.CREATE);
    }

    @Test
    void writingToAnExistingRecordNeedsEdit() {
        assertRequirement("PUT", "/quotations/4", SalesAccessArea.QUOTATIONS, SalesAccessAction.EDIT);
        assertRequirement("POST", "/quotations/4/status", SalesAccessArea.QUOTATIONS, SalesAccessAction.EDIT);
        assertRequirement("POST", "/quotations/4/convert-invoice", SalesAccessArea.QUOTATIONS, SalesAccessAction.EDIT);
        assertRequirement("PATCH", "/quotations/archive/4", SalesAccessArea.QUOTATIONS, SalesAccessAction.EDIT);
        assertRequirement("PATCH", "/invoices/archive/4", SalesAccessArea.INVOICES, SalesAccessAction.EDIT);
        assertRequirement("POST", "/invoices/4/mark-paid", SalesAccessArea.INVOICES, SalesAccessAction.EDIT);
        assertRequirement("POST", "/invoices/4/generate-payment-receipt", SalesAccessArea.INVOICES, SalesAccessAction.EDIT);
        assertRequirement("PUT", "/sales-contracts/4", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.EDIT);
        assertRequirement("POST", "/sales-contracts/4/duplicate", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.EDIT);
        assertRequirement("PATCH", "/sales-orders/archive/4", SalesAccessArea.CPO, SalesAccessAction.EDIT);
        assertRequirement("POST", "/sales-orders/4/e-actions", SalesAccessArea.CPO, SalesAccessAction.EDIT);
        assertRequirement("POST", "/sales-orders/4/cancel", SalesAccessArea.CPO, SalesAccessAction.EDIT);
        assertRequirement("POST", "/cost-workouts/4/custom-units", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.EDIT);
        assertRequirement("POST", "/profit-workouts/4/submit", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.SUBMIT);
        assertRequirement("PUT", "/leads/4", SalesAccessArea.LEADS, SalesAccessAction.EDIT);
        assertRequirement("PATCH", "/leads/close/4", SalesAccessArea.LEADS, SalesAccessAction.EDIT);
        assertRequirement("PUT", "/settings/sales", SalesAccessArea.SETTINGS, SalesAccessAction.EDIT);
    }

    @Test
    void deletesNeedDelete_exceptTheCprTrashWhichIsTheEditItAlreadyIs() {
        assertRequirement("DELETE", "/quotations/4", SalesAccessArea.QUOTATIONS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/quotations/4/remarks/9", SalesAccessArea.QUOTATIONS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/leads/4/permanent", SalesAccessArea.LEADS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/customers/4", SalesAccessArea.CLIENTS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/contacts/4/permanent", SalesAccessArea.CONTACTS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/followups/4", SalesAccessArea.FOLLOWUPS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/sales-contracts/4", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/sales-orders/4", SalesAccessArea.CPO, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/sales-orders/4/attachments/9", SalesAccessArea.CPO, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/delivery-challans/4", SalesAccessArea.DELIVERY_CHALLANS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/proforma-invoices/4", SalesAccessArea.PROFORMA_INVOICES, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/invoices/4", SalesAccessArea.INVOICES, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/payment-receipts/4", SalesAccessArea.PAYMENT_RECEIPTS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/credit-notes/4", SalesAccessArea.CREDIT_NOTES, SalesAccessAction.DELETE);
        // The bulk deletes are POSTs on the same collection: they are still DELETEs.
        assertRequirement("POST", "/quotations/bulk-delete", SalesAccessArea.QUOTATIONS, SalesAccessAction.DELETE);
        assertRequirement("POST", "/customers/bulk-permanent-delete", SalesAccessArea.CLIENTS, SalesAccessAction.DELETE);
        assertRequirement("POST", "/invoices/bulk-archive", SalesAccessArea.INVOICES, SalesAccessAction.EDIT);
        // CPR is the one area whose delete has two levels in the codebase itself:
        // the trash-style delete is CPR_EDIT (so a USER may do it, exactly as
        // today) and only the irreversible delete needs CPR_DELETE.
        assertRequirement("DELETE", "/cprs/4", SalesAccessArea.CPR, SalesAccessAction.EDIT);
        assertRequirement("DELETE", "/cprs/4/attachments/9", SalesAccessArea.CPR, SalesAccessAction.EDIT);
        assertRequirement("DELETE", "/cprs/4/comments/9", SalesAccessArea.CPR, SalesAccessAction.EDIT);
        assertRequirement("POST", "/cprs/bulk-delete", SalesAccessArea.CPR, SalesAccessAction.EDIT);
        assertRequirement("POST", "/cprs/bulk-permanent-delete", SalesAccessArea.CPR, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/cost-workouts/4", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.EDIT);
        assertRequirement("DELETE", "/cost-workouts/4/permanent", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/profit-workouts/4", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.EDIT);
        assertRequirement("DELETE", "/profit-workouts/4/permanent", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/cpr-technical-verifications/4", SalesAccessArea.CPR, SalesAccessAction.DELETE);
        assertRequirement("DELETE", "/cpr-technical-verifications/4/documents/9", SalesAccessArea.CPR, SalesAccessAction.DELETE);
    }

    @Test
    void approvalAndWorkflowGatesNeedApprove() {
        assertRequirement("POST", "/cprs/4/approve", SalesAccessArea.CPR, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/cprs/4/reject", SalesAccessArea.CPR, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/cprs/4/send-back", SalesAccessArea.CPR, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/cprs/4/float", SalesAccessArea.CPR, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/cost-workouts/4/approve", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/cost-workouts/4/reject", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/profit-workouts/4/approve", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/profit-workouts/4/reject", SalesAccessArea.PROFIT_WORKOUTS, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/sales-contracts/4/approve", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/sales-orders/4/approve", SalesAccessArea.CPO, SalesAccessAction.APPROVE);
        assertRequirement("POST", "/credit-notes/4/approve", SalesAccessArea.CREDIT_NOTES, SalesAccessAction.APPROVE);
        // Issuing a credit note is the same workflow gate as approving it.
        assertRequirement("POST", "/credit-notes/4/issue", SalesAccessArea.CREDIT_NOTES, SalesAccessAction.APPROVE);
    }

    @Test
    void submitSendExportImportAndUploadHaveTheirOwnPermission() {
        assertRequirement("POST", "/cprs/4/submit", SalesAccessArea.CPR, SalesAccessAction.SUBMIT);
        assertRequirement("POST", "/cost-workouts/4/submit", SalesAccessArea.COST_WORKOUTS, SalesAccessAction.SUBMIT);
        assertRequirement("POST", "/quotations/4/send", SalesAccessArea.QUOTATIONS, SalesAccessAction.SEND);
        assertRequirement("POST", "/proforma-invoices/4/send", SalesAccessArea.PROFORMA_INVOICES, SalesAccessAction.SEND);
        assertRequirement("POST", "/invoices/4/send", SalesAccessArea.INVOICES, SalesAccessAction.SEND);
        assertRequirement("POST", "/quotations/export", SalesAccessArea.QUOTATIONS, SalesAccessAction.EXPORT);
        assertRequirement("POST", "/sales-contracts/export", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.EXPORT);
        assertRequirement("POST", "/leads/export", SalesAccessArea.LEADS, SalesAccessAction.EXPORT);
        assertRequirement("POST", "/leads/import", SalesAccessArea.LEADS, SalesAccessAction.IMPORT);
        assertRequirement("POST", "/sales-contracts/bulk/extract", SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.IMPORT);
        assertRequirement("POST", "/quotations/4/attachments", SalesAccessArea.QUOTATIONS, SalesAccessAction.UPLOAD);
        assertRequirement("POST", "/invoices/4/attachments", SalesAccessArea.INVOICES, SalesAccessAction.UPLOAD);
        assertRequirement("POST", "/cpr-technical-verifications/4/documents", SalesAccessArea.CPR, SalesAccessAction.UPLOAD);
    }

    // ── Owned elsewhere ──────────────────────────────────────────────────

    @Test
    void accessManagementShareRepositoryAndOtherModulesAreNotGovernedByASalesArea() {
        assertNull(resolve("GET", "/sales/access/me"));
        assertNull(resolve("GET", "/sales/access/options"));
        assertNull(resolve("PUT", "/sales/access/scope/ROLE/USER"));
        // The shared ERP document repository is left to the pre-existing
        // DOCUMENT_* checks: gating it here would change Production/Purchase.
        assertNull(resolve("GET", "/documents"));
        assertNull(resolve("GET", "/documents/9/file"));
        assertNull(resolve("POST", "/documents/upload"));
        assertNull(resolve("DELETE", "/documents/9"));
        // Other modules.
        assertNull(resolve("GET", "/marketing/visits"));
        assertNull(resolve("GET", "/production/orders"));
        assertNull(resolve("GET", "/api/purchase/orders"));
        assertNull(resolve("GET", "/masters/pr_departments"));
        assertNull(resolve("GET", "/settings/marketing"));
        assertNull(resolve("GET", "/settings/grid-configs"));
        assertNull(resolve("GET", "/notifications"));
        // Preflight carries no credentials.
        assertNull(resolve("OPTIONS", "/quotations"));
    }

    // ── Defaults & catalog ───────────────────────────────────────────────

    @Test
    void defaultsPreserveTheExistingCapabilityOfEveryExistingRole() {
        // ADMIN holds every Permission → every Sales action.
        for (SalesAccessArea area : SalesAccessArea.values()) {
            for (SalesAccessAction action : area.actions()) {
                assertTrue(defaultFor(UserRole.ADMIN, area, action),
                        "ADMIN must keep " + area.key() + "." + action.key() + " by default");
            }
        }
        // MANAGER approves Sales and CPR documents but may not change Sales Settings.
        assertTrue(defaultFor(UserRole.MANAGER, SalesAccessArea.CPR, SalesAccessAction.APPROVE));
        assertTrue(defaultFor(UserRole.MANAGER, SalesAccessArea.CPO, SalesAccessAction.APPROVE));
        assertTrue(defaultFor(UserRole.MANAGER, SalesAccessArea.SALES_CONTRACTS, SalesAccessAction.APPROVE));
        assertTrue(defaultFor(UserRole.MANAGER, SalesAccessArea.SETTINGS, SalesAccessAction.VIEW));
        assertFalse(defaultFor(UserRole.MANAGER, SalesAccessArea.SETTINGS, SalesAccessAction.EDIT));
        // USER keeps view/create/edit everywhere it holds *_CREATE/*_EDIT …
        assertTrue(defaultFor(UserRole.USER, SalesAccessArea.QUOTATIONS, SalesAccessAction.CREATE));
        assertTrue(defaultFor(UserRole.USER, SalesAccessArea.LEADS, SalesAccessAction.EDIT));
        assertTrue(defaultFor(UserRole.USER, SalesAccessArea.DOCUMENTS, SalesAccessAction.VIEW));
        assertTrue(defaultFor(UserRole.USER, SalesAccessArea.SETTINGS, SalesAccessAction.VIEW));
        // … and never gets delete/approve, because it holds no *_DELETE/*_APPROVE.
        for (SalesAccessArea area : SalesAccessArea.values()) {
            if (area.supports(SalesAccessAction.DELETE)) {
                assertFalse(defaultFor(UserRole.USER, area, SalesAccessAction.DELETE),
                        "USER must not gain " + area.key() + ".delete by default");
            }
            if (area.supports(SalesAccessAction.APPROVE)) {
                assertFalse(defaultFor(UserRole.USER, area, SalesAccessAction.APPROVE),
                        "USER must not gain " + area.key() + ".approve by default");
            }
        }
        assertFalse(defaultFor(UserRole.USER, SalesAccessArea.SETTINGS, SalesAccessAction.EDIT));
        // An unknown/absent role is never granted anything.
        for (SalesAccessArea area : SalesAccessArea.values()) {
            for (SalesAccessAction action : area.actions()) {
                assertFalse(defaultFor(null, area, action),
                        "an absent role must not be granted " + area.key() + "." + action.key());
            }
        }
    }

    /**
     * The invariant that broke Marketing's map photo upload: the policy may
     * require an action, and {@code SalesAccessService.can()} refuses any pair
     * the area does not declare — so an undeclared action would be a permanent
     * 403 for every role, ADMIN included. Every request the policy maps must
     * resolve to an action its own area supports.
     */
    @Test
    void everyRequirableActionIsDeclaredByItsArea() {
        String[][] endpoints = {
                {"GET", "/sales/dashboard/summary"},
                {"GET", "/sales/reports"},
                {"GET", "/settings/sales"},
                {"GET", "/leads"},
                {"POST", "/leads"},
                {"PUT", "/leads/4"},
                {"DELETE", "/leads/4"},
                {"POST", "/leads/import"},
                {"POST", "/leads/export"},
                {"POST", "/leads/4/attachments"},
                {"GET", "/customers"},
                {"POST", "/customers"},
                {"PUT", "/customers/4"},
                {"DELETE", "/customers/4"},
                {"POST", "/customers/4/attachments"},
                {"GET", "/contacts"},
                {"POST", "/contacts"},
                {"PUT", "/contacts/4"},
                {"DELETE", "/contacts/4"},
                {"GET", "/followups"},
                {"POST", "/followups"},
                {"PUT", "/followups/4"},
                {"DELETE", "/followups/4"},
                {"POST", "/followups/4/attachments"},
                {"GET", "/cprs"},
                {"POST", "/cprs"},
                {"PUT", "/cprs/4"},
                {"DELETE", "/cprs/4"},
                {"POST", "/cprs/4/submit"},
                {"POST", "/cprs/4/approve"},
                {"POST", "/cprs/4/send-back"},
                {"POST", "/cprs/4/float"},
                {"POST", "/cprs/export"},
                {"POST", "/cpr-technical-verifications"},
                {"POST", "/cpr-technical-verifications/4/documents"},
                {"GET", "/cost-workouts"},
                {"POST", "/cost-workouts"},
                {"PUT", "/cost-workouts/4"},
                {"DELETE", "/cost-workouts/4"},
                {"POST", "/cost-workouts/4/submit"},
                {"POST", "/cost-workouts/4/approve"},
                {"GET", "/profit-workouts"},
                {"POST", "/profit-workouts"},
                {"PUT", "/profit-workouts/4"},
                {"DELETE", "/profit-workouts/4"},
                {"POST", "/profit-workouts/4/submit"},
                {"POST", "/profit-workouts/4/approve"},
                {"GET", "/quotations"},
                {"POST", "/quotations"},
                {"PUT", "/quotations/4"},
                {"DELETE", "/quotations/4"},
                {"POST", "/quotations/export"},
                {"POST", "/quotations/4/send"},
                {"POST", "/quotations/4/attachments"},
                {"GET", "/sales-contracts"},
                {"POST", "/sales-contracts"},
                {"PUT", "/sales-contracts/4"},
                {"DELETE", "/sales-contracts/4"},
                {"POST", "/sales-contracts/4/approve"},
                {"POST", "/sales-contracts/export"},
                {"POST", "/sales-contracts/bulk/extract"},
                {"POST", "/sales-contracts/4/attachments"},
                {"GET", "/sales-orders"},
                {"POST", "/sales-orders"},
                {"POST", "/sales-orders/e-actions"},
                {"PUT", "/sales-orders/4"},
                {"DELETE", "/sales-orders/4"},
                {"POST", "/sales-orders/4/approve"},
                {"POST", "/sales-orders/export"},
                {"POST", "/sales-orders/4/attachments"},
                {"GET", "/delivery-challans"},
                {"POST", "/delivery-challans"},
                {"PUT", "/delivery-challans/4"},
                {"DELETE", "/delivery-challans/4"},
                {"POST", "/delivery-challans/export"},
                {"POST", "/delivery-challans/4/attachments"},
                {"GET", "/proforma-invoices"},
                {"POST", "/proforma-invoices"},
                {"PUT", "/proforma-invoices/4"},
                {"DELETE", "/proforma-invoices/4"},
                {"POST", "/proforma-invoices/export"},
                {"POST", "/proforma-invoices/4/send"},
                {"POST", "/proforma-invoices/4/attachments"},
                {"GET", "/invoices"},
                {"POST", "/invoices"},
                {"PUT", "/invoices/4"},
                {"DELETE", "/invoices/4"},
                {"POST", "/invoices/export"},
                {"POST", "/invoices/4/send"},
                {"POST", "/invoices/4/attachments"},
                {"GET", "/payment-receipts"},
                {"POST", "/payment-receipts"},
                {"PUT", "/payment-receipts/4"},
                {"DELETE", "/payment-receipts/4"},
                {"POST", "/payment-receipts/export"},
                {"POST", "/payment-receipts/4/attachments"},
                {"GET", "/credit-notes"},
                {"POST", "/credit-notes"},
                {"PUT", "/credit-notes/4"},
                {"DELETE", "/credit-notes/4"},
                {"POST", "/credit-notes/4/approve"},
                {"POST", "/credit-notes/4/issue"},
                {"POST", "/credit-notes/export"},
                {"POST", "/credit-notes/4/attachments"}
        };
        for (String[] endpoint : endpoints) {
            String method = endpoint[0];
            String path = endpoint[1];
            Requirement requirement = resolve(method, path);
            assertNotNull(requirement, method + " " + path + " must be governed by a Sales area");
            assertTrue(requirement.area().supports(requirement.action()),
                    method + " " + path + " requires " + requirement.area() + " " + requirement.action()
                            + ", which " + requirement.area().key() + " does not declare");
        }
    }

    @Test
    void denyAllGrantsNothing() {
        SalesAccessPolicy.denyAll().values().forEach(actions ->
                actions.values().forEach(allowed -> assertFalse(allowed)));
    }

    @Test
    void onlyActionsThatExistAreOffered() {
        assertEquals(java.util.Set.of(SalesAccessAction.VIEW), SalesAccessArea.DASHBOARD.actions());
        assertEquals(java.util.Set.of(SalesAccessAction.VIEW), SalesAccessArea.DOCUMENTS.actions());
        assertEquals(java.util.Set.of(SalesAccessAction.VIEW, SalesAccessAction.EXPORT),
                SalesAccessArea.REPORTS.actions());
        assertEquals(java.util.Set.of(SalesAccessAction.VIEW, SalesAccessAction.EDIT),
                SalesAccessArea.SETTINGS.actions());
        // The Sales module has no server-side print/PDF endpoint, so no area may
        // offer a Print switch (and there is no such action to offer).
        for (SalesAccessArea area : SalesAccessArea.values()) {
            assertFalse(area.actions().stream().map(SalesAccessAction::key).anyMatch("print"::equals),
                    area.key() + " must not offer Print: no Sales endpoint prints server-side");
        }
        // Quotations have no approval endpoint; the workout documents have no export.
        assertFalse(SalesAccessArea.QUOTATIONS.supports(SalesAccessAction.APPROVE));
        assertFalse(SalesAccessArea.COST_WORKOUTS.supports(SalesAccessAction.EXPORT));
        assertFalse(SalesAccessArea.PROFIT_WORKOUTS.supports(SalesAccessAction.EXPORT));
        // …while the documents that do have them keep them.
        assertTrue(SalesAccessArea.CPO.supports(SalesAccessAction.APPROVE));
        assertTrue(SalesAccessArea.CREDIT_NOTES.supports(SalesAccessAction.APPROVE));
        assertTrue(SalesAccessArea.CPR.supports(SalesAccessAction.EXPORT));
        // The catalog the UI renders comes from the same enum.
        assertEquals(SalesAccessArea.values().length, SalesAccessPolicy.catalog().size());
        SalesAccessPolicy.catalog().forEach(area ->
                assertFalse(((java.util.List<?>) area.get("actions")).isEmpty()));
    }

    @Test
    void everySalesAreaHasADistinctKeyAndLabel() {
        Map<String, String> keys = new java.util.LinkedHashMap<>();
        for (SalesAccessArea area : SalesAccessArea.values()) {
            assertNull(keys.put(area.key(), area.label()), "duplicate Sales area key: " + area.key());
            assertNotNull(area.label());
            assertNotNull(SalesAccessArea.fromKey(area.key()));
        }
    }
}
