package com.vishatech.erp.marketing.access;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.marketing.access.MarketingAccessPolicy.Requirement;
import java.util.Map;
import org.junit.jupiter.api.Test;

/**
 * The Marketing access request policy — pure unit tests, no Spring context and
 * no database. They pin down exactly which (area, action) every Marketing
 * endpoint requires, which is what the interceptor enforces on every request.
 */
class MarketingAccessPolicyTest {

    private static Requirement resolve(String method, String path) {
        return MarketingAccessPolicy.resolve(method, path);
    }

    private static void assertRequirement(String method, String path,
                                          MarketingAccessArea area, MarketingAccessAction action) {
        Requirement requirement = resolve(method, path);
        assertNotNull(requirement, method + " " + path + " must be a Marketing-protected request");
        assertEquals(area, requirement.area(), "area for " + method + " " + path);
        assertEquals(action, requirement.action(), "action for " + method + " " + path);
    }

    // ── Reads ────────────────────────────────────────────────────────────

    @Test
    void everyReadNeedsViewOnItsOwnArea() {
        assertRequirement("GET", "/marketing/visits", MarketingAccessArea.VISITS, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/leads/7", MarketingAccessArea.VISITS, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/dashboard/summary", MarketingAccessArea.DASHBOARD, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/follow-ups", MarketingAccessArea.FOLLOWUPS, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/activities/visit/3", MarketingAccessArea.FOLLOWUPS, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/q-forms/by-visit/3", MarketingAccessArea.QFORMS, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/expenses/summary", MarketingAccessArea.EXPENSES, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/travel-plans/summary", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/travel-schedules/options", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/calendar/activities", MarketingAccessArea.CALENDAR, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/map/locations", MarketingAccessArea.MAP, MarketingAccessAction.VIEW);
        assertRequirement("GET", "/marketing/location-tracking/active", MarketingAccessArea.MAP, MarketingAccessAction.VIEW);
    }

    // ── Writes ───────────────────────────────────────────────────────────

    @Test
    void creatingANewRecordNeedsCreate() {
        assertRequirement("POST", "/marketing/visits", MarketingAccessArea.VISITS, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/leads", MarketingAccessArea.VISITS, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/follow-ups", MarketingAccessArea.FOLLOWUPS, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/q-forms", MarketingAccessArea.QFORMS, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/expenses", MarketingAccessArea.EXPENSES, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/travel-plans", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/travel-schedules", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.CREATE);
        assertRequirement("POST", "/marketing/map/locations", MarketingAccessArea.MAP, MarketingAccessAction.CREATE);
    }

    @Test
    void writingToAnExistingRecordNeedsEdit() {
        assertRequirement("PUT", "/marketing/visits/4", MarketingAccessArea.VISITS, MarketingAccessAction.EDIT);
        assertRequirement("POST", "/marketing/visits/4/entry", MarketingAccessArea.VISITS, MarketingAccessAction.EDIT);
        assertRequirement("PATCH", "/marketing/visits/4/status", MarketingAccessArea.VISITS, MarketingAccessAction.EDIT);
        assertRequirement("PUT", "/marketing/leads/4", MarketingAccessArea.VISITS, MarketingAccessAction.EDIT);
        assertRequirement("POST", "/marketing/follow-ups/4/complete", MarketingAccessArea.FOLLOWUPS, MarketingAccessAction.EDIT);
        assertRequirement("PUT", "/marketing/q-forms/9/submit", MarketingAccessArea.QFORMS, MarketingAccessAction.EDIT);
        assertRequirement("POST", "/marketing/travel-plans/4/submit", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.EDIT);
        assertRequirement("POST", "/marketing/travel-schedules/4/submit", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.EDIT);
        assertRequirement("PUT", "/marketing/expenses/4", MarketingAccessArea.EXPENSES, MarketingAccessAction.EDIT);
        assertRequirement("POST", "/marketing/expenses/4/start", MarketingAccessArea.EXPENSES, MarketingAccessAction.EDIT);
    }

    @Test
    void deletesNeedDelete() {
        assertRequirement("DELETE", "/marketing/visits/4", MarketingAccessArea.VISITS, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/follow-ups/4", MarketingAccessArea.FOLLOWUPS, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/q-forms/4", MarketingAccessArea.QFORMS, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/expenses/4", MarketingAccessArea.EXPENSES, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/expenses/4/expenses/9", MarketingAccessArea.EXPENSES, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/travel-plans/4", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/travel-schedules/4", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.DELETE);
        assertRequirement("DELETE", "/marketing/map/locations/4", MarketingAccessArea.MAP, MarketingAccessAction.DELETE);
    }

    @Test
    void approvalAndRejectionDecisionsNeedApprove() {
        assertRequirement("POST", "/marketing/expenses/4/approve", MarketingAccessArea.EXPENSES, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/expenses/4/reject", MarketingAccessArea.EXPENSES, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/travel-plans/4/approve", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/travel-plans/4/reject", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/travel-plans/4/revision", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/travel-schedules/4/approve", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/travel-schedules/4/reject", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.APPROVE);
        assertRequirement("POST", "/marketing/travel-schedules/4/revision", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.APPROVE);
    }

    @Test
    void uploadsNeedUpload() {
        assertRequirement("POST", "/marketing/expenses/4/expenses/9/bill", MarketingAccessArea.EXPENSES, MarketingAccessAction.UPLOAD);
        assertRequirement("POST", "/marketing/q-forms/4/attachments", MarketingAccessArea.QFORMS, MarketingAccessAction.UPLOAD);
        assertRequirement("POST", "/marketing/travel-plans/4/attachments", MarketingAccessArea.TRAVEL_REGISTRY, MarketingAccessAction.UPLOAD);
        assertRequirement("POST", "/marketing/travel-schedules/4/attachments", MarketingAccessArea.TRAVEL_SCHEDULER, MarketingAccessAction.UPLOAD);
        assertRequirement("POST", "/marketing/map/locations/4/photos", MarketingAccessArea.MAP, MarketingAccessAction.UPLOAD);
    }

    // ── Owned elsewhere ──────────────────────────────────────────────────

    @Test
    void accessManagementAndOtherModulesAreNotGovernedByAMarketingArea() {
        assertNull(resolve("GET", "/marketing/access/me"));
        assertNull(resolve("GET", "/marketing/access/options"));
        assertNull(resolve("PUT", "/marketing/access/scope/ROLE/USER"));
        assertNull(resolve("GET", "/sales-orders"));
        assertNull(resolve("GET", "/leads"));
        assertNull(resolve("PUT", "/settings/marketing"));
        assertNull(resolve("GET", "/marketing/unknown-surface"));
    }

    @Test
    void preflightNeverNeedsAPermission() {
        Requirement requirement = resolve("OPTIONS", "/marketing/visits");
        assertEquals(MarketingAccessAction.VIEW, requirement.action());
    }

    // ── Defaults & catalog ───────────────────────────────────────────────

    @Test
    void defaultsPreserveTheExistingBehaviourOfEveryExistingRole() {
        // Before Access Management, every role holding MARKETING_VIEW (all
        // three) could use every Marketing page and action.
        for (UserRole role : UserRole.values()) {
            Map<String, Map<String, Boolean>> defaults = MarketingAccessPolicy.defaults(role);
            for (MarketingAccessArea area : MarketingAccessArea.values()) {
                for (MarketingAccessAction action : area.actions()) {
                    assertTrue(defaults.get(area.key()).get(action.key()),
                            role + " default must keep " + area.key() + "." + action.key());
                }
            }
        }
        // An unknown/absent role is never granted anything.
        Map<String, Map<String, Boolean>> anonymous = MarketingAccessPolicy.defaults(null);
        anonymous.values().forEach(actions -> actions.values().forEach(allowed ->
                assertFalse(allowed, "an absent role must not be granted any permission")));
    }

    /**
     * The invariant that broke the map's photo upload: the policy may require an
     * action, and {@code MarketingAccessService.can()} refuses any pair the area
     * does not declare — so an undeclared action is a permanent 403 for every
     * role, ADMIN included, with no switch able to grant it. Every request the
     * policy maps must resolve to an action its own area supports.
     */
    @Test
    void everyRequirableActionIsDeclaredByItsArea() {
        String[][] endpoints = {
                {"GET", "/marketing/dashboard/summary"},
                {"GET", "/marketing/visits"},
                {"POST", "/marketing/visits"},
                {"PUT", "/marketing/visits/4"},
                {"POST", "/marketing/visits/4/entry"},
                {"DELETE", "/marketing/visits/4"},
                {"POST", "/marketing/leads"},
                {"GET", "/marketing/follow-ups"},
                {"POST", "/marketing/follow-ups"},
                {"PUT", "/marketing/follow-ups/4"},
                {"DELETE", "/marketing/follow-ups/4"},
                {"POST", "/marketing/follow-ups/4/complete"},
                {"GET", "/marketing/q-forms"},
                {"POST", "/marketing/q-forms"},
                {"PUT", "/marketing/q-forms/4"},
                {"DELETE", "/marketing/q-forms/4"},
                {"POST", "/marketing/q-forms/4/attachments"},
                {"GET", "/marketing/expenses"},
                {"POST", "/marketing/expenses"},
                {"PUT", "/marketing/expenses/4"},
                {"DELETE", "/marketing/expenses/4"},
                {"POST", "/marketing/expenses/4/approve"},
                {"POST", "/marketing/expenses/4/expenses/9/bill"},
                {"GET", "/marketing/travel-schedules"},
                {"POST", "/marketing/travel-schedules"},
                {"POST", "/marketing/travel-schedules/4/approve"},
                {"POST", "/marketing/travel-schedules/4/attachments"},
                {"GET", "/marketing/travel-plans"},
                {"POST", "/marketing/travel-plans"},
                {"POST", "/marketing/travel-plans/4/approve"},
                {"POST", "/marketing/travel-plans/4/attachments"},
                {"GET", "/marketing/calendar/activities"},
                {"GET", "/marketing/map/locations"},
                {"POST", "/marketing/map/locations"},
                {"PUT", "/marketing/map/locations/4"},
                {"DELETE", "/marketing/map/locations/4"},
                {"POST", "/marketing/map/locations/4/photos"},
                {"DELETE", "/marketing/map/locations/4/photos/9"}
        };
        for (String[] endpoint : endpoints) {
            String method = endpoint[0];
            String path = endpoint[1];
            Requirement requirement = resolve(method, path);
            assertNotNull(requirement, method + " " + path + " must be governed by a Marketing area");
            assertTrue(requirement.area().supports(requirement.action()),
                    method + " " + path + " requires " + requirement.area() + " " + requirement.action()
                            + ", which " + requirement.area().key() + " does not declare");
        }
    }

    @Test
    void denyAllGrantsNothing() {
        MarketingAccessPolicy.denyAll().values().forEach(actions ->
                actions.values().forEach(allowed -> assertFalse(allowed)));
    }

    @Test
    void onlyActionsThatExistAreOffered() {
        assertTrue(MarketingAccessArea.DASHBOARD.actions().equals(java.util.Set.of(MarketingAccessAction.VIEW)));
        assertTrue(MarketingAccessArea.CALENDAR.actions().equals(java.util.Set.of(MarketingAccessAction.VIEW)));
        assertFalse(MarketingAccessArea.DASHBOARD.supports(MarketingAccessAction.DELETE));
        assertTrue(MarketingAccessArea.EXPENSES.supports(MarketingAccessAction.APPROVE));
        assertTrue(MarketingAccessArea.QFORMS.supports(MarketingAccessAction.PRINT));
        // Real upload surface on the map: the location detail panel posts
        // photos. It must stay declared (see everyRequirableActionIsDeclared).
        assertTrue(MarketingAccessArea.MAP.supports(MarketingAccessAction.UPLOAD));
        // The catalog the UI renders comes from the same enum.
        assertEquals(MarketingAccessArea.values().length, MarketingAccessPolicy.catalog().size());
        MarketingAccessPolicy.catalog().forEach(area -> assertFalse(((java.util.List<?>) area.get("actions")).isEmpty()));
    }
}
