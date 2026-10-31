package com.vishatech.erp.purchase.access;

import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.security.Permission;
import com.vishatech.erp.security.RolePermissions;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * The Purchase access policy: the documented default permissions and the single
 * request → (area, action) mapping the backend enforces.
 *
 * <h2>Default policy</h2>
 *
 * Access Management is an opt-in override. A scope (role or user) that has never
 * been configured keeps exactly the capability it has today, which is already
 * expressed by {@link RolePermissions} — the authority set the Purchase
 * controllers enforce with
 * {@code @PreAuthorize("hasAuthority('PURCHASE_EDIT')")} and friends.
 *
 * <p>Each action maps to the {@code PURCHASE_*} authority its endpoints require
 * today, so a default never widens access:
 *
 * <ul>
 *   <li>ADMIN and MANAGER get every Purchase action (they hold VIEW, CREATE,
 *       EDIT and APPROVE);</li>
 *   <li>USER keeps view/create/edit — including submit, release, receive, match,
 *       pay, upload and the rest, because the controllers authorise those with
 *       {@code PURCHASE_EDIT} today — and never approve or reject;</li>
 *   <li>delete follows {@code PURCHASE_EDIT} because that is the authority the
 *       delete endpoints use today;</li>
 *   <li>an unknown role or an unauthenticated caller is granted nothing.</li>
 * </ul>
 *
 * <h2>Fail closed</h2>
 *
 * Defaults are the documented fallback for an <em>unconfigured</em> scope only.
 * A stored configuration that cannot be read, or a permission missing from a
 * saved configuration, never falls back to "allowed" — see
 * {@link PurchaseAccessService}.
 */
public final class PurchaseAccessPolicy {

    private PurchaseAccessPolicy() {
    }

    /**
     * The existing permission an action requires on the endpoints that implement
     * it.
     *
     * <p>{@code Export}, {@code Print} and {@code Download} have no authority of
     * their own today: printing/exporting are produced in the browser from data
     * the caller already read, and the vendor document download is a plain read
     * at the server. They are derived from {@code PURCHASE_VIEW}, which keeps
     * today's access exactly as it is while still letting an administrator switch
     * them off.
     */
    private static Permission permissionFor(PurchaseAccessAction action) {
        String suffix = switch (action) {
            case VIEW, EXPORT, PRINT, DOWNLOAD -> "VIEW";
            case CREATE -> "CREATE";
            case APPROVE, REJECT -> "APPROVE";
            case EDIT, DELETE, SUBMIT, RELEASE, ACKNOWLEDGE, CONVERT, EVALUATE, AWARD,
                 CLOSE, CANCEL, COMPLETE, RECEIVE, MATCH, PAY, UPLOAD -> "EDIT";
        };
        String name = "PURCHASE_" + suffix;
        return Arrays.stream(Permission.values())
                .filter(permission -> permission.name().equals(name))
                .findFirst()
                .orElse(null);
    }

    /** The pre-existing Purchase capability of a role for one area + action. */
    public static boolean defaultAllow(UserRole role, PurchaseAccessArea area, PurchaseAccessAction action) {
        if (role == null || area == null || action == null || !area.supports(action)) {
            return false;
        }
        Permission permission = permissionFor(action);
        return permission != null && RolePermissions.permissionsOf(role).contains(permission);
    }

    /** Full default matrix for a role — every area, every supported action. */
    public static Map<String, Map<String, Boolean>> defaults(UserRole role) {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (PurchaseAccessAction action : area.actions()) {
                actions.put(action.key(), defaultAllow(role, area, action));
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /**
     * AND every submodule permission with its parent module's permission for the
     * same action, in place.
     *
     * <p>A submodule can therefore only ever <em>narrow</em> access: a
     * configuration that already switched a parent action off (for example
     * "Logistics · Receive") keeps it off inside every logistics submodule, so
     * adding a submodule area never silently widens an existing configuration.
     * The effective permissions the API checks and the ones the UI renders both
     * come from this single pass, so they cannot disagree.
     */
    public static Map<String, Map<String, Boolean>> applyParentInheritance(
            Map<String, Map<String, Boolean>> matrix) {
        if (matrix == null) {
            return null;
        }
        for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
            PurchaseAccessArea parent = area.parent();
            if (parent == null || !matrix.containsKey(area.key()) || !matrix.containsKey(parent.key())) {
                continue;
            }
            Map<String, Boolean> child = matrix.get(area.key());
            Map<String, Boolean> inherited = matrix.get(parent.key());
            child.replaceAll((action, allowed) -> allowed && Boolean.TRUE.equals(inherited.get(action)));
        }
        return matrix;
    }

    /** An empty matrix — what a scope is worth when its configuration cannot be read. */
    public static Map<String, Map<String, Boolean>> denyAll() {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (PurchaseAccessArea area : PurchaseAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (PurchaseAccessAction action : area.actions()) {
                actions.put(action.key(), false);
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** The catalog the Access Management UI renders, straight from the enum. */
    public static List<Map<String, Object>> catalog() {
        return Arrays.stream(PurchaseAccessArea.values())
                .map(area -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("key", area.key());
                    entry.put("label", area.label());
                    entry.put("actions", area.actions().stream().map(PurchaseAccessAction::key).toList());
                    return entry;
                })
                .toList();
    }

    // ── Request → (area, action) ──────────────────────────────────────────

    /** One protected request: the Purchase area and the action it requires. */
    public record Requirement(PurchaseAccessArea area, PurchaseAccessAction action) {
    }

    /**
     * Map an HTTP request inside the Purchase module to the permission it
     * requires. Returns {@code null} for requests this policy does not own — the
     * Access Management endpoints themselves (ADMIN-only) and everything outside
     * {@code /api/purchase/**}, so the shared ERP endpoints the Purchase screens
     * also use (documents, files, masters, exchange rates, notifications) keep
     * their existing authorities.
     *
     * @param method      HTTP method
     * @param requestPath request path within the application context
     *                    (e.g. {@code /api/purchase/orders/4/release})
     * @param queryString raw query string (kept for parity with the other
     *                    modules' policies; this one does not need it)
     */
    public static Requirement resolve(String method, String requestPath, String queryString) {
        if (method == null || requestPath == null) {
            return null;
        }
        String path = requestPath.toLowerCase(Locale.ROOT);
        String verb = method.toUpperCase(Locale.ROOT);
        if ("OPTIONS".equals(verb)) {
            return null; // CORS preflight carries no credentials
        }
        if (path.equals("/api/purchase/access") || path.startsWith("/api/purchase/access/")) {
            return null; // guarded by the ADMIN role, not by a Purchase permission
        }

        PurchaseAccessArea area = areaOf(path);
        if (area == null) {
            return null;
        }

        if ("GET".equals(verb) || "HEAD".equals(verb)) {
            String last = lastSegment(path);
            if ("print-preview".equals(last)) {
                return new Requirement(area, PurchaseAccessAction.PRINT);
            }
            if ("download".equals(last)) {
                return new Requirement(area, area.supports(PurchaseAccessAction.DOWNLOAD)
                        ? PurchaseAccessAction.DOWNLOAD
                        : PurchaseAccessAction.VIEW);
            }
            return new Requirement(area, PurchaseAccessAction.VIEW);
        }

        String last = lastSegment(path);
        if ("DELETE".equals(verb)) {
            // DELETE /{id}/attachments/{attachmentId} removes a file: an upload-family
            // operation, so the Upload switch governs it exactly as in the other modules.
            if (path.contains("/attachments/")) {
                return new Requirement(area, area.supports(PurchaseAccessAction.UPLOAD)
                        ? PurchaseAccessAction.UPLOAD
                        : PurchaseAccessAction.DELETE);
            }
            return new Requirement(area, PurchaseAccessAction.DELETE);
        }

        // POST / PUT / PATCH
        PurchaseAccessAction action = writeAction(area, verb, path, last);
        if (action == null || !area.supports(action)) {
            // A pair the area does not declare can never be granted, so it must never
            // be required either: fall back to a declared action of this area, in the
            // order that keeps the write as narrow as the area allows. Without this a
            // write to a narrow submodule (e.g. one that only supports Pay) would be
            // required to hold an action the area cannot grant — a gate nobody can
            // pass.
            action = firstSupported(area, PurchaseAccessAction.EDIT, PurchaseAccessAction.CREATE,
                    PurchaseAccessAction.SUBMIT, PurchaseAccessAction.APPROVE,
                    PurchaseAccessAction.VIEW);
        }
        if (action == null) {
            return null; // no declared action fits: leave it to the controller's own gate
        }
        return new Requirement(area, action);
    }

    /** The first of {@code candidates} the area declares, or {@code null}. */
    private static PurchaseAccessAction firstSupported(PurchaseAccessArea area,
                                                       PurchaseAccessAction... candidates) {
        for (PurchaseAccessAction candidate : candidates) {
            if (area.supports(candidate)) {
                return candidate;
            }
        }
        return null;
    }

    /** The action a write on this path requires, before the declared-action check. */
    private static PurchaseAccessAction writeAction(PurchaseAccessArea area, String verb,
                                                    String path, String last) {
        if ("delete".equals(last)) {
            return PurchaseAccessAction.DELETE; // PATCH /{id}/delete (requisitions)
        }
        if ("archive".equals(last) || "restore".equals(last) || "comments".equals(last)
                || "status".equals(last) || "delivery-status".equals(last)
                || "reminder".equals(last)) {
            return PurchaseAccessAction.EDIT;
        }
        if ("submit".equals(last) || "submit-review".equals(last)) {
            return PurchaseAccessAction.SUBMIT;
        }
        // Payment advices, payments and payment reversals are payment steps, even
        // when the path ends in "send" (/invoices/{id}/advice/send).
        if (path.contains("/advice") || path.contains("/payment")
                || area == PurchaseAccessArea.PAYMENTS) {
            return PurchaseAccessAction.PAY;
        }
        // Sending an RFQ to the vendors moves it out of draft: a submit step.
        if ("send".equals(last)) {
            return PurchaseAccessAction.SUBMIT;
        }
        if ("approve".equals(last) || "return".equals(last)
                || "complete-technical-review".equals(last)) {
            return PurchaseAccessAction.APPROVE;
        }
        if ("reject".equals(last)) {
            return PurchaseAccessAction.REJECT;
        }
        if ("release".equals(last)) {
            return PurchaseAccessAction.RELEASE;
        }
        if ("acknowledge".equals(last)) {
            return PurchaseAccessAction.ACKNOWLEDGE;
        }
        if ("evaluate".equals(last) || "evaluation-record".equals(last)) {
            return PurchaseAccessAction.EVALUATE;
        }
        if ("award".equals(last)) {
            return PurchaseAccessAction.AWARD;
        }
        if ("close".equals(last)) {
            return PurchaseAccessAction.CLOSE;
        }
        if ("cancel".equals(last)) {
            return PurchaseAccessAction.CANCEL;
        }
        if ("complete".equals(last)) {
            return PurchaseAccessAction.COMPLETE;
        }
        if ("receive".equals(last)) {
            return PurchaseAccessAction.RECEIVE;
        }
        if ("match".equals(last)) {
            return PurchaseAccessAction.MATCH;
        }
        if ("pay".equals(last) || "reverse".equals(last)) {
            return PurchaseAccessAction.PAY;
        }
        if ("convert-to-rfq".equals(last)) {
            return PurchaseAccessAction.CONVERT;
        }
        if ("duplicate".equals(last)) {
            return PurchaseAccessAction.CREATE;
        }
        if ("attachments".equals(last) || "documents".equals(last) || "upload".equals(last)) {
            return PurchaseAccessAction.UPLOAD;
        }
        if ("print-log".equals(last)) {
            return PurchaseAccessAction.PRINT;
        }
        if ("POST".equals(verb) && collectionPaths(area).contains(path)) {
            return PurchaseAccessAction.CREATE;
        }
        // Every other write targets an existing record: updates, quantity/price
        // patches, status transitions, inventory transfer/reverse, …
        return PurchaseAccessAction.EDIT;
    }

    /**
     * The POST endpoints that create a brand-new record of an area.
     *
     * <p>Logistics has no single collection — a GRN, an inspection, a packing
     * order, a shipment, a stock movement and an inventory transfer each create a
     * record of their own, so every one of them is listed.
     */
    private static Set<String> collectionPaths(PurchaseAccessArea area) {
        return switch (area) {
            case REQUISITION -> Set.of("/api/purchase/requisitions");
            case VENDORS -> Set.of("/api/purchase/vendors");
            case RFQ -> Set.of("/api/purchase/rfqs", "/api/purchase/quotations");
            case FOLLOW_UPS -> Set.of("/api/purchase/rfq-follow-ups");
            case ORDERS -> Set.of("/api/purchase/orders");
            case INVOICES -> Set.of("/api/purchase/invoices");
            case ADJUSTMENT_NOTES -> Set.of("/api/purchase/adjustment-notes");
            case PACKING -> Set.of("/api/purchase/manufacturing");
            case SHIPMENTS -> Set.of("/api/purchase/shipments");
            case GRN -> Set.of("/api/purchase/grns");
            case INSPECTIONS -> Set.of("/api/purchase/inspections");
            case INVENTORY -> Set.of("/api/purchase/inventory", "/api/purchase/inventory/transfer");
            case LOGISTICS -> Set.of(
                    "/api/purchase/grns",
                    "/api/purchase/inspections",
                    "/api/purchase/manufacturing",
                    "/api/purchase/shipments",
                    "/api/purchase/inventory",
                    "/api/purchase/inventory/transfer");
            default -> Set.of();
        };
    }

    private static String lastSegment(String path) {
        String trimmed = path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
        return trimmed.substring(trimmed.lastIndexOf('/') + 1);
    }

    /**
     * The area a path belongs to, or {@code null} when the request is not the
     * Purchase module's own API.
     *
     * <p>{@code /documents}, {@code /files}, {@code /masters}, {@code /exchange-rates},
     * {@code /notifications} and the rest of the shared ERP endpoints are NOT
     * listed on purpose: they belong to every module and keep their existing
     * authorities.
     */
    private static PurchaseAccessArea areaOf(String path) {
        if (path.equals("/api/purchase/dashboard") || path.startsWith("/api/purchase/dashboard/")) {
            return PurchaseAccessArea.DASHBOARD;
        }
        if (path.equals("/api/purchase/work-queue") || path.startsWith("/api/purchase/work-queue/")) {
            return PurchaseAccessArea.WORK_QUEUE;
        }
        if (path.startsWith("/api/purchase/requisitions")) {
            // The technical specification review is its own screen with its own
            // endpoints (/requisitions/technical-review, /{id}/technical-review,
            // /{id}/complete-technical-review) inside the requisition module.
            // (both /technical-review and /complete-technical-review)
            return path.contains("technical-review")
                    ? PurchaseAccessArea.PR_TECH_SPEC
                    : PurchaseAccessArea.REQUISITION;
        }
        if (path.equals("/api/purchase/vendors/performance")
                || path.startsWith("/api/purchase/vendors/performance/")) {
            return PurchaseAccessArea.VENDOR_PERFORMANCE;
        }
        if (path.startsWith("/api/purchase/vendors")) {
            return PurchaseAccessArea.VENDORS;
        }
        if (path.startsWith("/api/purchase/rfqs") || path.startsWith("/api/purchase/quotations")) {
            return PurchaseAccessArea.RFQ;
        }
        if (path.startsWith("/api/purchase/rfq-follow-ups")) {
            return PurchaseAccessArea.FOLLOW_UPS;
        }
        if (path.startsWith("/api/purchase/orders")) {
            return PurchaseAccessArea.ORDERS;
        }
        // Logistics submodules each have their own endpoint family; they are checked
        // before the Logistics parent so the specific area wins.
        if (path.startsWith("/api/purchase/manufacturing")) {
            return PurchaseAccessArea.PACKING;
        }
        if (path.startsWith("/api/purchase/shipments")) {
            return PurchaseAccessArea.SHIPMENTS;
        }
        if (path.startsWith("/api/purchase/grns")) {
            return PurchaseAccessArea.GRN;
        }
        if (path.startsWith("/api/purchase/inspections")) {
            return PurchaseAccessArea.INSPECTIONS;
        }
        if (path.startsWith("/api/purchase/inventory")) {
            return PurchaseAccessArea.INVENTORY;
        }
        // No Logistics fallback here on purpose: every Logistics endpoint belongs
        // to one of the five submodules above. LOGISTICS itself is the module-level
        // ceiling those submodules are ANDed with, plus the area of the
        // /purchase/logistics landing route — it owns no endpoint of its own.
        if (path.equals("/api/purchase/invoices/payment-ledger")
                || path.contains("/payment-ledger") || path.contains("/advice")
                || path.contains("/payments/") || path.endsWith("/pay")
                || path.startsWith("/api/purchase/payments")) {
            return PurchaseAccessArea.PAYMENTS;
        }
        if (path.endsWith("/match") || path.contains("/match/")) {
            return PurchaseAccessArea.INVOICE_MATCHING;
        }
        if (path.startsWith("/api/purchase/invoices")) {
            return PurchaseAccessArea.INVOICES;
        }
        if (path.startsWith("/api/purchase/adjustment-notes")) {
            return PurchaseAccessArea.ADJUSTMENT_NOTES;
        }
        return null;
    }
}
