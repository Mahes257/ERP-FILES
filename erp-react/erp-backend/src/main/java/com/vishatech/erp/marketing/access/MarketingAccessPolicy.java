package com.vishatech.erp.marketing.access;

import com.vishatech.erp.entity.UserRole;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The Marketing access policy: the documented default permissions and the
 * single request → (area, action) mapping that the backend enforces.
 *
 * <h2>Default policy</h2>
 *
 * Access Management is an opt-in override. A scope (role or user) that has
 * never been configured keeps the permissions the module already granted
 * before this feature existed: every authenticated role that can open the
 * Marketing module — ADMIN, MANAGER and USER all hold {@code MARKETING_VIEW}
 * in {@code RolePermissions} — could use every Marketing page and action, and
 * the module had no finer-grained check. The defaults below therefore reproduce
 * today's behaviour exactly. Nothing is removed silently: the override only
 * takes effect once an administrator saves it, and the UI always states whether
 * a scope is showing defaults or a saved configuration.
 *
 * <h2>Fail closed</h2>
 *
 * Defaults are the documented fallback for an <em>unconfigured</em> scope. A
 * stored configuration that cannot be read, or a permission that is missing
 * from a saved configuration, never falls back to "allowed" — see
 * {@link MarketingAccessService}.
 */
public final class MarketingAccessPolicy {

    private MarketingAccessPolicy() {
    }

    /**
     * The pre-existing Marketing capability of a role. All three roles hold
     * {@code MARKETING_VIEW} and the module's actions were not restricted
     * beyond that, so the honest default is "allowed"; an unknown role is not
     * granted anything.
     */
    public static boolean defaultAllow(UserRole role) {
        return role != null;
    }

    /** Full default matrix for a role — every area, every supported action. */
    public static Map<String, Map<String, Boolean>> defaults(UserRole role) {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        boolean allow = defaultAllow(role);
        for (MarketingAccessArea area : MarketingAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (MarketingAccessAction action : area.actions()) {
                actions.put(action.key(), allow);
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** An empty matrix — what a scope is worth when its configuration cannot be read. */
    public static Map<String, Map<String, Boolean>> denyAll() {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (MarketingAccessArea area : MarketingAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (MarketingAccessAction action : area.actions()) {
                actions.put(action.key(), false);
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** The catalog the Access Management UI renders, straight from the enum. */
    public static List<Map<String, Object>> catalog() {
        return java.util.Arrays.stream(MarketingAccessArea.values())
                .map(area -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("key", area.key());
                    entry.put("label", area.label());
                    entry.put("actions", area.actions().stream().map(MarketingAccessAction::key).toList());
                    return entry;
                })
                .toList();
    }

    // ── Request → (area, action) ──────────────────────────────────────────

    /** One protected request: the Marketing area and the action it requires. */
    public record Requirement(MarketingAccessArea area, MarketingAccessAction action) {
    }

    private static final List<String> APPROVAL_SUFFIXES = List.of("approve", "reject", "revision");

    /**
     * Map an HTTP request inside the Marketing module to the permission it
     * requires. Returns {@code null} for requests this policy does not own
     * (the Access Management endpoints themselves, and anything outside
     * {@code /marketing}).
     *
     * @param method         HTTP method
     * @param requestPath    request path <em>within the application context</em>
     *                       (e.g. {@code /marketing/expenses/4/approve})
     */
    public static Requirement resolve(String method, String requestPath) {
        if (method == null || requestPath == null) {
            return null;
        }
        String path = requestPath.toLowerCase();
        String verb = method.toUpperCase();

        // Access Management configures Marketing access — it must stay
        // reachable to an administrator even when Marketing itself is off,
        // so it is guarded by the ADMIN role, not by a Marketing permission.
        if (!path.startsWith("/marketing/") && !path.equals("/marketing")) {
            return null;
        }
        if (path.equals("/marketing/access") || path.startsWith("/marketing/access/")) {
            return null;
        }

        MarketingAccessArea area = areaOf(path);
        if (area == null) {
            return null;
        }

        if ("OPTIONS".equals(verb) || "HEAD".equals(verb)) {
            return new Requirement(area, MarketingAccessAction.VIEW);
        }
        if ("GET".equals(verb)) {
            return new Requirement(area, MarketingAccessAction.VIEW);
        }
        if ("DELETE".equals(verb)) {
            return new Requirement(area, MarketingAccessAction.DELETE);
        }
        // POST / PUT / PATCH
        String lastSegment = path.substring(path.lastIndexOf('/') + 1);

        // Approval workflow decisions are their own permission.
        if (APPROVAL_SUFFIXES.contains(lastSegment)) {
            return new Requirement(area, MarketingAccessAction.APPROVE);
        }
        // Attachment / bill / photo uploads.
        if ("POST".equals(verb) && (lastSegment.equals("attachments")
                || lastSegment.equals("photos")
                || lastSegment.equals("bill"))) {
            return new Requirement(area, MarketingAccessAction.UPLOAD);
        }
        // Creating a new record in a collection is the CREATE action; every
        // other write targets an existing record and therefore needs EDIT
        // (submit, entry/exit, draft, stops, complete, reschedule, …).
        if (isCreateTarget(area, path)) {
            return new Requirement(area, MarketingAccessAction.CREATE);
        }
        return new Requirement(area, MarketingAccessAction.EDIT);
    }

    private static boolean isCreateTarget(MarketingAccessArea area, String path) {
        return switch (area) {
            case VISITS -> path.equals("/marketing/visits")
                    || path.equals("/marketing/leads")
                    || path.equals("/marketing/follow-ups");
            case QFORMS, EXPENSES, TRAVEL_REGISTRY, TRAVEL_SCHEDULER -> path.equals(collectionPath(area));
            case MAP -> path.equals("/marketing/map/locations");
            case FOLLOWUPS -> path.equals("/marketing/follow-ups");
            default -> false;
        };
    }

    private static String collectionPath(MarketingAccessArea area) {
        return switch (area) {
            case QFORMS -> "/marketing/q-forms";
            case EXPENSES -> "/marketing/expenses";
            case TRAVEL_REGISTRY -> "/marketing/travel-plans";
            case TRAVEL_SCHEDULER -> "/marketing/travel-schedules";
            case MAP -> "/marketing/map/locations";
            case VISITS -> "/marketing/visits";
            case FOLLOWUPS -> "/marketing/follow-ups";
            default -> "/marketing";
        };
    }

    private static MarketingAccessArea areaOf(String path) {
        if (path.equals("/marketing/dashboard") || path.startsWith("/marketing/dashboard/")) {
            return MarketingAccessArea.DASHBOARD;
        }
        if (path.equals("/marketing/q-forms") || path.startsWith("/marketing/q-forms/")) {
            return MarketingAccessArea.QFORMS;
        }
        if (path.equals("/marketing/expenses") || path.startsWith("/marketing/expenses/")) {
            return MarketingAccessArea.EXPENSES;
        }
        if (path.equals("/marketing/travel-plans") || path.startsWith("/marketing/travel-plans/")) {
            return MarketingAccessArea.TRAVEL_REGISTRY;
        }
        if (path.equals("/marketing/travel-schedules") || path.startsWith("/marketing/travel-schedules/")) {
            return MarketingAccessArea.TRAVEL_SCHEDULER;
        }
        if (path.equals("/marketing/calendar") || path.startsWith("/marketing/calendar/")) {
            return MarketingAccessArea.CALENDAR;
        }
        if (path.equals("/marketing/map") || path.startsWith("/marketing/map/")
                || path.startsWith("/marketing/location-tracking")) {
            return MarketingAccessArea.MAP;
        }
        if (path.equals("/marketing/follow-ups") || path.startsWith("/marketing/follow-ups/")
                || path.equals("/marketing/activities") || path.startsWith("/marketing/activities/")) {
            return MarketingAccessArea.FOLLOWUPS;
        }
        if (path.equals("/marketing/visits") || path.startsWith("/marketing/visits/")
                || path.equals("/marketing/leads") || path.startsWith("/marketing/leads/")
                || path.equals("/marketing/search")
                || path.equals("/marketing/summary")
                || path.equals("/marketing/performance")) {
            return MarketingAccessArea.VISITS;
        }
        return null;
    }
}
