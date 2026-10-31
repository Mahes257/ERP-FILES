package com.vishatech.erp.production.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.production.access.ProductionAccessPolicy.Requirement;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * Pins the Production access contract: what each request requires, that the
 * module's own management/tracker/document paths stay outside the policy, and
 * that the documented defaults reproduce today's access.
 */
class ProductionAccessPolicyTest {

    private static Requirement resolve(String method, String path) {
        return ProductionAccessPolicy.resolve(method, path, null);
    }

    private static void assertRequirement(String method, String path,
                                          ProductionAccessArea area, ProductionAccessAction action) {
        Requirement requirement = resolve(method, path);
        assertNotNull(requirement, method + " " + path + " must be governed by a Production area");
        assertEquals(area, requirement.area(), method + " " + path + " area");
        assertEquals(action, requirement.action(), method + " " + path + " action");
    }

    private static boolean defaultFor(UserRole role, ProductionAccessArea area, ProductionAccessAction action) {
        return ProductionAccessPolicy.defaultAllow(role, area, action);
    }

    // ── Reads ─────────────────────────────────────────────────────────────

    @Test
    @DisplayName("every read in a Production area requires View on that area")
    void readsRequireView() {
        assertRequirement("GET", "/production-kpi/orders/counts", ProductionAccessArea.DASHBOARD,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/integration/dashboard", ProductionAccessArea.DASHBOARD,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/production-orders", ProductionAccessArea.ORDERS, ProductionAccessAction.VIEW);
        assertRequirement("GET", "/production-orders/4/timeline", ProductionAccessArea.ORDERS,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/technical-verifications/stats", ProductionAccessArea.TECHNICAL_VERIFICATION,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/castings/work-order/WO-1", ProductionAccessArea.CASTING,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/quality-inspections/4", ProductionAccessArea.QUALITY,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/packing/by-number/PL-1", ProductionAccessArea.PACKING,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/dispatch/stats", ProductionAccessArea.DISPATCH, ProductionAccessAction.VIEW);
        assertRequirement("GET", "/production/reports/delay-analysis", ProductionAccessArea.REPORTS,
                ProductionAccessAction.VIEW);
        assertRequirement("GET", "/audit/stats", ProductionAccessArea.REPORTS, ProductionAccessAction.VIEW);
        assertRequirement("GET", "/production/settings/machines", ProductionAccessArea.SETTINGS,
                ProductionAccessAction.VIEW);
    }

    /** The drawing viewer reads the file inline; only the standalone download is a Download. */
    @Test
    @DisplayName("a drawing file read is View, the drawing download is Download")
    void drawingFileAndDownloadAreDifferentActions() {
        assertRequirement("GET", "/drawings/4/file", ProductionAccessArea.DRAWINGS, ProductionAccessAction.VIEW);
        assertRequirement("GET", "/drawings/4/download", ProductionAccessArea.DRAWINGS,
                ProductionAccessAction.DOWNLOAD);
        // Models have no separable download: their file endpoint feeds the 3D
        // viewer, so it stays a View and no Download switch is offered.
        assertFalse(ProductionAccessArea.MODELS.actions().contains(ProductionAccessAction.DOWNLOAD));
        assertRequirement("GET", "/models/4/download", ProductionAccessArea.MODELS, ProductionAccessAction.VIEW);
    }

    // ── Writes ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("collection POSTs are Create, record writes are Edit, DELETEs are Delete")
    void createEditDelete() {
        assertRequirement("POST", "/production-orders", ProductionAccessArea.ORDERS, ProductionAccessAction.CREATE);
        assertRequirement("POST", "/castings", ProductionAccessArea.CASTING, ProductionAccessAction.CREATE);
        assertRequirement("POST", "/quality-inspections", ProductionAccessArea.QUALITY,
                ProductionAccessAction.CREATE);
        assertRequirement("POST", "/acknowledgements", ProductionAccessArea.ACKNOWLEDGEMENT,
                ProductionAccessAction.CREATE);
        assertRequirement("POST", "/production-entries", ProductionAccessArea.ENTRY, ProductionAccessAction.CREATE);

        assertRequirement("PUT", "/production-orders/4", ProductionAccessArea.ORDERS, ProductionAccessAction.EDIT);
        assertRequirement("PUT", "/quality-inspections/4/qc-data", ProductionAccessArea.QUALITY,
                ProductionAccessAction.EDIT);
        assertRequirement("PATCH", "/quality-inspections/4/status", ProductionAccessArea.QUALITY,
                ProductionAccessAction.EDIT);
        assertRequirement("PATCH", "/quality-inspections/4/checklist", ProductionAccessArea.QUALITY,
                ProductionAccessAction.EDIT);
        assertRequirement("POST", "/production-orders/4/pending-qc", ProductionAccessArea.ORDERS,
                ProductionAccessAction.EDIT);
        assertRequirement("POST", "/production-orders/4/packed", ProductionAccessArea.ORDERS,
                ProductionAccessAction.EDIT);
        assertRequirement("POST", "/production-orders/4/return-to-draft", ProductionAccessArea.ORDERS,
                ProductionAccessAction.EDIT);

        assertRequirement("DELETE", "/production-orders/4", ProductionAccessArea.ORDERS,
                ProductionAccessAction.DELETE);
        assertRequirement("DELETE", "/production-orders/4/attachments/9", ProductionAccessArea.ORDERS,
                ProductionAccessAction.DELETE);
        assertRequirement("DELETE", "/technical-verifications/work-order/WO-1",
                ProductionAccessArea.TECHNICAL_VERIFICATION, ProductionAccessAction.DELETE);
        assertRequirement("DELETE", "/production-entries/order/WO-1", ProductionAccessArea.ENTRY,
                ProductionAccessAction.DELETE);
    }

    @Test
    @DisplayName("the work-order workflow endpoints keep their own actions")
    void orderWorkflow() {
        assertRequirement("POST", "/production-orders/4/submit-production-approval", ProductionAccessArea.ORDERS,
                ProductionAccessAction.SUBMIT);
        assertRequirement("POST", "/production-orders/4/submit-admin-approval", ProductionAccessArea.ORDERS,
                ProductionAccessAction.SUBMIT);
        assertRequirement("POST", "/production-orders/4/resubmit-to-production", ProductionAccessArea.ORDERS,
                ProductionAccessAction.SUBMIT);
        assertRequirement("POST", "/production-orders/4/approve-production", ProductionAccessArea.ORDERS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/production-orders/4/approve-admin", ProductionAccessArea.ORDERS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/production-orders/4/final-approve", ProductionAccessArea.ORDERS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/production-orders/4/reject-production", ProductionAccessArea.ORDERS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/production-orders/4/reject-admin", ProductionAccessArea.ORDERS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/production-orders/4/start-production", ProductionAccessArea.ORDERS,
                ProductionAccessAction.START);
        assertRequirement("POST", "/production-orders/4/hold", ProductionAccessArea.ORDERS,
                ProductionAccessAction.HOLD);
        assertRequirement("POST", "/production-orders/4/resume", ProductionAccessArea.ORDERS,
                ProductionAccessAction.HOLD);
        assertRequirement("POST", "/production-orders/4/complete", ProductionAccessArea.ORDERS,
                ProductionAccessAction.COMPLETE);
        assertRequirement("POST", "/production-orders/4/cancel", ProductionAccessArea.ORDERS,
                ProductionAccessAction.CANCEL);
        assertRequirement("POST", "/production-orders/4/ready-for-dispatch", ProductionAccessArea.ORDERS,
                ProductionAccessAction.RELEASE);
        assertRequirement("POST", "/production-orders/4/attachments", ProductionAccessArea.ORDERS,
                ProductionAccessAction.UPLOAD);
        assertRequirement("POST", "/production-orders/4/items/7/attachments", ProductionAccessArea.ORDERS,
                ProductionAccessAction.UPLOAD);
    }

    @Test
    @DisplayName("shop-floor boards and quality keep their own transitions")
    void shopFloorAndQuality() {
        assertRequirement("POST", "/castings/4/start", ProductionAccessArea.CASTING, ProductionAccessAction.START);
        assertRequirement("POST", "/castings/4/hold", ProductionAccessArea.CASTING, ProductionAccessAction.HOLD);
        assertRequirement("POST", "/castings/4/complete", ProductionAccessArea.CASTING,
                ProductionAccessAction.COMPLETE);
        assertRequirement("POST", "/castings/4/skip", ProductionAccessArea.CASTING, ProductionAccessAction.SKIP);
        assertRequirement("POST", "/fabrications/4/complete", ProductionAccessArea.FABRICATION,
                ProductionAccessAction.COMPLETE);
        assertRequirement("POST", "/machine-shop/4/start", ProductionAccessArea.MACHINE_SHOP,
                ProductionAccessAction.START);
        assertRequirement("POST", "/assemblies/4/resume", ProductionAccessArea.ASSEMBLY,
                ProductionAccessAction.HOLD);

        assertRequirement("POST", "/quality-inspections/4/start", ProductionAccessArea.QUALITY,
                ProductionAccessAction.START);
        assertRequirement("POST", "/quality-inspections/4/pass", ProductionAccessArea.QUALITY,
                ProductionAccessAction.PASS);
        assertRequirement("POST", "/quality-inspections/4/fail", ProductionAccessArea.QUALITY,
                ProductionAccessAction.FAIL);
        assertRequirement("POST", "/quality-inspections/4/hold", ProductionAccessArea.QUALITY,
                ProductionAccessAction.HOLD);
    }

    @Test
    @DisplayName("drawings, models and technical verification keep their verification gates")
    void documentAndVerificationGates() {
        assertRequirement("POST", "/drawings/4/verify", ProductionAccessArea.DRAWINGS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/drawings/4/reject", ProductionAccessArea.DRAWINGS,
                ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/drawings/4/attachments", ProductionAccessArea.DRAWINGS,
                ProductionAccessAction.UPLOAD);
        assertRequirement("PUT", "/drawings/4/file", ProductionAccessArea.DRAWINGS,
                ProductionAccessAction.UPLOAD);

        assertRequirement("POST", "/models/4/convert", ProductionAccessArea.MODELS,
                ProductionAccessAction.CONVERT);
        assertRequirement("POST", "/models/4/cad-conversion", ProductionAccessArea.MODELS,
                ProductionAccessAction.CONVERT);
        assertRequirement("POST", "/cad-conversion/9/cancel", ProductionAccessArea.MODELS,
                ProductionAccessAction.CONVERT);
        assertRequirement("POST", "/models/4/verify", ProductionAccessArea.MODELS,
                ProductionAccessAction.APPROVE);

        assertRequirement("POST", "/technical-verifications/work-order/WO-1/item/7/verify",
                ProductionAccessArea.TECHNICAL_VERIFICATION, ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/technical-verifications/work-order/WO-1/item/7/reject",
                ProductionAccessArea.TECHNICAL_VERIFICATION, ProductionAccessAction.APPROVE);
        assertRequirement("POST", "/technical-verifications/work-order/WO-1/item/7/resubmit",
                ProductionAccessArea.TECHNICAL_VERIFICATION, ProductionAccessAction.SUBMIT);
    }

    @Test
    @DisplayName("Production Settings writes are Create / Edit / Delete of the settings section")
    void settingsWrites() {
        assertRequirement("POST", "/production/settings/machines", ProductionAccessArea.SETTINGS,
                ProductionAccessAction.CREATE);
        assertRequirement("PUT", "/production/settings/machines/M-1", ProductionAccessArea.SETTINGS,
                ProductionAccessAction.EDIT);
        assertRequirement("DELETE", "/production/settings/machines/M-1", ProductionAccessArea.SETTINGS,
                ProductionAccessAction.DELETE);
        assertRequirement("POST", "/production/settings/status-masters", ProductionAccessArea.SETTINGS,
                ProductionAccessAction.CREATE);
        assertRequirement("PUT", "/production/settings/parameters", ProductionAccessArea.SETTINGS,
                ProductionAccessAction.EDIT);
    }

    @Test
    @DisplayName("the integration advance moves a work order and needs its Edit")
    void integrationAdvanceIsAnOrderEdit() {
        assertRequirement("POST", "/integration/orders/4/advance", ProductionAccessArea.ORDERS,
                ProductionAccessAction.EDIT);
    }

    // ── Boundaries ────────────────────────────────────────────────────────

    @Test
    @DisplayName("management, tracker and shared repository paths stay outside the policy")
    void excludedPaths() {
        assertNull(resolve("GET", "/production/access/me"));
        assertNull(resolve("PUT", "/production/access/scope/ROLE/USER"));
        // The Production tracker feeds the Sales tracker page.
        assertNull(resolve("GET", "/production-trackers"));
        assertNull(resolve("POST", "/production-trackers"));
        // The shared document repository's writes/downloads keep DOCUMENT_*.
        assertNull(resolve("POST", "/documents"));
        assertNull(resolve("GET", "/documents/42/file"));
        assertNull(resolve("DELETE", "/documents/42"));
        // Module-agnostic services are untouched.
        assertNull(resolve("GET", "/masters/machines"));
        assertNull(resolve("GET", "/notifications"));
    }

    @Test
    @DisplayName("the Production scoped document read is governed by the Documents area")
    void productionDocumentScope() {
        Requirement requirement = ProductionAccessPolicy.resolve("GET", "/documents", "scope=production&page=0");
        assertNotNull(requirement);
        assertEquals(ProductionAccessArea.DOCUMENTS, requirement.area());
        assertEquals(ProductionAccessAction.VIEW, requirement.action());
        // The Sales scoped listing is that module's business, not this policy's.
        assertNull(ProductionAccessPolicy.resolve("GET", "/documents", "scope=sales"));
    }

    /**
     * A pair the area does not declare can never be granted, so the policy must
     * never require one: {@code ProductionAccessService.can()} refuses unknown
     * pairs, which would be a permanent 403 for every role, ADMIN included.
     */
    @Test
    void everyRequirableActionIsDeclaredByItsArea() {
        String[][] endpoints = {
                {"GET", "/production-kpi/orders/counts"},
                {"GET", "/integration/dashboard"},
                {"POST", "/integration/orders/4/advance"},
                {"GET", "/production-orders"},
                {"POST", "/production-orders"},
                {"PUT", "/production-orders/4"},
                {"DELETE", "/production-orders/4"},
                {"POST", "/production-orders/4/submit-production-approval"},
                {"POST", "/production-orders/4/approve-production"},
                {"POST", "/production-orders/4/start-production"},
                {"POST", "/production-orders/4/hold"},
                {"POST", "/production-orders/4/complete"},
                {"POST", "/production-orders/4/cancel"},
                {"POST", "/production-orders/4/ready-for-dispatch"},
                {"POST", "/production-orders/4/attachments"},
                {"GET", "/technical-verifications"},
                {"POST", "/technical-verifications"},
                {"DELETE", "/technical-verifications/work-order/WO-1"},
                {"POST", "/technical-verifications/work-order/WO-1/item/7/verify"},
                {"POST", "/technical-verifications/work-order/WO-1/item/7/resubmit"},
                {"GET", "/drawings"},
                {"POST", "/drawings"},
                {"PUT", "/drawings/4"},
                {"PUT", "/drawings/4/file"},
                {"DELETE", "/drawings/4"},
                {"POST", "/drawings/4/verify"},
                {"GET", "/drawings/4/download"},
                {"POST", "/drawings/4/attachments"},
                {"GET", "/models"},
                {"POST", "/models"},
                {"PUT", "/models/4"},
                {"DELETE", "/models/4"},
                {"POST", "/models/4/verify"},
                {"POST", "/models/4/convert"},
                {"POST", "/models/4/attachments"},
                {"POST", "/models/4/cad-conversion"},
                {"POST", "/cad-conversion/9/cancel"},
                {"GET", "/castings"},
                {"POST", "/castings"},
                {"PUT", "/castings/4"},
                {"DELETE", "/castings/4"},
                {"POST", "/castings/4/start"},
                {"POST", "/castings/4/hold"},
                {"POST", "/castings/4/resume"},
                {"POST", "/castings/4/complete"},
                {"POST", "/castings/4/skip"},
                {"GET", "/fabrications"},
                {"POST", "/fabrications"},
                {"PUT", "/fabrications/4"},
                {"DELETE", "/fabrications/4"},
                {"POST", "/fabrications/4/start"},
                {"POST", "/fabrications/4/complete"},
                {"GET", "/machine-shop"},
                {"POST", "/machine-shop"},
                {"PUT", "/machine-shop/4"},
                {"DELETE", "/machine-shop/4"},
                {"POST", "/machine-shop/4/hold"},
                {"POST", "/machine-shop/4/complete"},
                {"GET", "/assemblies"},
                {"POST", "/assemblies"},
                {"PUT", "/assemblies/4"},
                {"DELETE", "/assemblies/4"},
                {"POST", "/assemblies/4/start"},
                {"POST", "/assemblies/4/complete"},
                {"GET", "/quality-inspections"},
                {"POST", "/quality-inspections"},
                {"PUT", "/quality-inspections/4"},
                {"PATCH", "/quality-inspections/4/status"},
                {"PATCH", "/quality-inspections/4/checklist"},
                {"PUT", "/quality-inspections/4/qc-data"},
                {"DELETE", "/quality-inspections/4"},
                {"POST", "/quality-inspections/4/start"},
                {"POST", "/quality-inspections/4/pass"},
                {"POST", "/quality-inspections/4/fail"},
                {"POST", "/quality-inspections/4/hold"},
                {"GET", "/packing"},
                {"POST", "/packing"},
                {"PUT", "/packing/4"},
                {"DELETE", "/packing/4"},
                {"GET", "/dispatch"},
                {"POST", "/dispatch"},
                {"PUT", "/dispatch/4"},
                {"DELETE", "/dispatch/4"},
                {"GET", "/acknowledgements/work-order/WO-1"},
                {"POST", "/acknowledgements"},
                {"DELETE", "/acknowledgements/work-order/WO-1"},
                {"GET", "/production-entries"},
                {"POST", "/production-entries"},
                {"DELETE", "/production-entries/4"},
                {"GET", "/production/reports/production-summary"},
                {"GET", "/audit"},
                {"GET", "/production/settings/machines"},
                {"POST", "/production/settings/machines"},
                {"PUT", "/production/settings/machines/M-1"},
                {"DELETE", "/production/settings/machines/M-1"},
                {"POST", "/production/settings/work-centers"},
                {"PUT", "/production/settings/work-centers/W-1"},
                {"DELETE", "/production/settings/work-centers/W-1"},
                {"POST", "/production/settings/status-masters"},
                {"PUT", "/production/settings/status-masters/1"},
                {"DELETE", "/production/settings/status-masters/1"},
                {"PUT", "/production/settings/parameters"}
        };
        for (String[] endpoint : endpoints) {
            String method = endpoint[0];
            String path = endpoint[1];
            Requirement requirement = resolve(method, path);
            assertNotNull(requirement, method + " " + path + " must be governed by a Production area");
            assertTrue(requirement.area().supports(requirement.action()),
                    method + " " + path + " requires " + requirement.area() + " " + requirement.action()
                            + ", which the area does not declare");
        }
    }

    // ── Defaults ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("ADMIN keeps every Production action")
    void adminDefaultsAreEverything() {
        for (ProductionAccessArea area : ProductionAccessArea.values()) {
            for (ProductionAccessAction action : area.actions()) {
                assertTrue(defaultFor(UserRole.ADMIN, area, action),
                        "ADMIN must keep " + area.key() + "." + action.key());
            }
        }
    }

    @Test
    @DisplayName("MANAGER keeps everything, USER keeps view/create/edit but not delete/approve/release")
    void managerAndUserDefaults() {
        for (ProductionAccessArea area : ProductionAccessArea.values()) {
            for (ProductionAccessAction action : area.actions()) {
                assertTrue(defaultFor(UserRole.MANAGER, area, action),
                        "MANAGER must keep " + area.key() + "." + action.key());
            }
        }
        for (ProductionAccessArea area : ProductionAccessArea.values()) {
            for (ProductionAccessAction action : area.actions()) {
                boolean allowed = defaultFor(UserRole.USER, area, action);
                if (action == ProductionAccessAction.DELETE
                        || action == ProductionAccessAction.APPROVE
                        || action == ProductionAccessAction.RELEASE) {
                    assertFalse(allowed, "USER must not be granted " + area.key() + "." + action.key());
                } else {
                    assertTrue(allowed, "USER keeps " + area.key() + "." + action.key());
                }
            }
        }
        // An unknown/absent role is never granted anything.
        for (ProductionAccessArea area : ProductionAccessArea.values()) {
            for (ProductionAccessAction action : area.actions()) {
                assertFalse(defaultFor(null, area, action),
                        "an absent role must not be granted " + area.key() + "." + action.key());
            }
        }
    }

    @Test
    @DisplayName("an area without a declared action reports it unsupported")
    void unsupportedActions() {
        assertFalse(ProductionAccessArea.TECHNICAL_VERIFICATION.actions().contains(ProductionAccessAction.EDIT));
        assertFalse(ProductionAccessArea.DASHBOARD.actions().contains(ProductionAccessAction.CREATE));
        assertFalse(ProductionAccessArea.DOCUMENTS.actions().contains(ProductionAccessAction.DELETE));
        assertFalse(ProductionAccessArea.PACKING.actions().contains(ProductionAccessAction.APPROVE));
        assertFalse(ProductionAccessArea.SETTINGS.actions().contains(ProductionAccessAction.SUBMIT));
    }
}
