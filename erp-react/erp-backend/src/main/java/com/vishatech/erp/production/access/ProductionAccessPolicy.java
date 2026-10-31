package com.vishatech.erp.production.access;

import com.vishatech.erp.entity.UserRole;
import com.vishatech.erp.security.Permission;
import com.vishatech.erp.security.RolePermissions;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * The Production access policy: the documented default permissions and the
 * single request → (area, action) mapping the backend enforces.
 *
 * <h2>Default policy</h2>
 *
 * Access Management is an opt-in override. A scope (role or user) that has
 * never been configured keeps exactly the capability it has today, which is
 * already expressed by {@link RolePermissions} — the project's single source of
 * truth for role → permission expansion, and the authority set the Production
 * controllers already enforce with
 * {@code @PreAuthorize("hasAuthority('PRODUCTION_EDIT')")} and friends.
 *
 * <p>The default for a (role, area, action) triple is therefore derived, not
 * invented: each action maps to the {@code PRODUCTION_*} authority the
 * endpoints implementing it require today. Consequences that match the shipped
 * behaviour:
 *
 * <ul>
 *   <li>ADMIN and MANAGER get every Production action except Release on a work
 *       order, which needs {@code PRODUCTION_DISPATCH} (MANAGER holds it,
 *       USER does not);</li>
 *   <li>USER keeps view/create/edit — it can run shop-floor jobs, inspections
 *       and entries — but never delete, approve or release;</li>
 *   <li>an unknown role or an unauthenticated caller is granted nothing.</li>
 * </ul>
 *
 * Because both layers stay in place — the interceptor only ever <em>adds</em> a
 * restriction, the existing {@code hasAuthority} checks are untouched — a
 * default can never widen access that exists today.
 *
 * <h2>Fail closed</h2>
 *
 * Defaults are the documented fallback for an <em>unconfigured</em> scope only.
 * A stored configuration that cannot be read, or a permission missing from a
 * saved configuration, never falls back to "allowed" — see
 * {@link ProductionAccessService}.
 */
public final class ProductionAccessPolicy {

    private ProductionAccessPolicy() {
    }

    /**
     * The existing permission an action requires on the endpoints that implement
     * it.
     *
     * <p>{@code Export}, {@code Print} and {@code Download} have no authority of
     * their own today: printing and the CSV/PDF exports are produced in the
     * browser from data the caller already read, and the one download endpoint
     * that exists (Drawings) is a plain read at the server. They are therefore
     * derived from {@code PRODUCTION_VIEW}, which keeps today's access exactly
     * as it is while still letting an administrator switch them off.
     */
    private static Permission permissionFor(ProductionAccessAction action) {
        String suffix = switch (action) {
            case VIEW, EXPORT, PRINT, DOWNLOAD -> "VIEW";
            case CREATE, UPLOAD, START, HOLD, COMPLETE, SKIP, PASS, FAIL, CONVERT -> "CREATE";
            case EDIT, SUBMIT, CANCEL -> "EDIT";
            case DELETE -> "DELETE";
            case APPROVE -> "APPROVE";
            case RELEASE -> "DISPATCH";
        };
        String name = "PRODUCTION_" + suffix;
        return Arrays.stream(Permission.values())
                .filter(permission -> permission.name().equals(name))
                .findFirst()
                .orElse(null);
    }

    /** The pre-existing Production capability of a role for one area + action. */
    public static boolean defaultAllow(UserRole role, ProductionAccessArea area, ProductionAccessAction action) {
        if (role == null || area == null || action == null || !area.supports(action)) {
            return false;
        }
        Permission permission = permissionFor(action);
        return permission != null && RolePermissions.permissionsOf(role).contains(permission);
    }

    /** Full default matrix for a role — every area, every supported action. */
    public static Map<String, Map<String, Boolean>> defaults(UserRole role) {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (ProductionAccessArea area : ProductionAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (ProductionAccessAction action : area.actions()) {
                actions.put(action.key(), defaultAllow(role, area, action));
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** An empty matrix — what a scope is worth when its configuration cannot be read. */
    public static Map<String, Map<String, Boolean>> denyAll() {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (ProductionAccessArea area : ProductionAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (ProductionAccessAction action : area.actions()) {
                actions.put(action.key(), false);
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** The catalog the Access Management UI renders, straight from the enum. */
    public static List<Map<String, Object>> catalog() {
        return Arrays.stream(ProductionAccessArea.values())
                .map(area -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("key", area.key());
                    entry.put("label", area.label());
                    entry.put("actions", area.actions().stream().map(ProductionAccessAction::key).toList());
                    return entry;
                })
                .toList();
    }

    // ── Request → (area, action) ──────────────────────────────────────────

    /** One protected request: the Production area and the action it requires. */
    public record Requirement(ProductionAccessArea area, ProductionAccessAction action) {
    }

    /**
     * Map an HTTP request inside the Production module to the permission it
     * requires. Returns {@code null} for requests this policy does not own — the
     * Access Management endpoints themselves, the production tracker (shared with
     * the Sales tracker page), and the shared document repository calls it
     * deliberately leaves to the existing {@code DOCUMENT_*} checks.
     *
     * @param method      HTTP method
     * @param requestPath request path <em>within the application context</em>
     *                    (e.g. {@code /production-orders/4/start-production})
     * @param queryString raw query string, used to recognise the
     *                    Production-scoped document repository read
     *                    ({@code scope=production})
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
        if (path.equals("/production/access") || path.startsWith("/production/access/")) {
            return null; // guarded by the ADMIN role, not by a Production permission
        }
        // The SHARED document repository: only its Production-scoped READ belongs to
        // this policy. Uploads, downloads, deletes and the other modules' listings stay
        // on the pre-existing DOCUMENT_* authorities, so nothing here can break them.
        if (path.equals("/documents") && !"GET".equals(verb) && !"HEAD".equals(verb)) {
            return null;
        }

        ProductionAccessArea area = areaOf(path, queryString);
        if (area == null) {
            return null;
        }

        // The integration endpoint advances a work order through its workflow.
        if (path.startsWith("/integration/") && "POST".equals(verb)) {
            return new Requirement(ProductionAccessArea.ORDERS, ProductionAccessAction.EDIT);
        }

        if ("GET".equals(verb) || "HEAD".equals(verb)) {
            String last = lastSegment(path);
            if ("download".equals(last)) {
                return new Requirement(area, area.supports(ProductionAccessAction.DOWNLOAD)
                        ? ProductionAccessAction.DOWNLOAD
                        : ProductionAccessAction.VIEW);
            }
            return new Requirement(area, ProductionAccessAction.VIEW);
        }

        if ("DELETE".equals(verb)) {
            return new Requirement(area, ProductionAccessAction.DELETE);
        }

        // POST / PUT / PATCH
        String last = lastSegment(path);
        ProductionAccessAction action = writeAction(area, verb, path, last);
        if (action == null || !area.supports(action)) {
            // A pair the area does not declare can never be granted, so it must
            // never be required either: fall back to the closest declared write.
            action = area.supports(ProductionAccessAction.EDIT)
                    ? ProductionAccessAction.EDIT
                    : ProductionAccessAction.CREATE;
        }
        return new Requirement(area, action);
    }

    /** The action a write on this path requires, before the declared-action check. */
    private static ProductionAccessAction writeAction(ProductionAccessArea area, String verb,
                                                      String path, String last) {
        if ("bulk-delete".equals(last) || "bulk-permanent-delete".equals(last)) {
            return ProductionAccessAction.DELETE;
        }
        // A CAD conversion is started and cancelled from the model screens.
        if (area == ProductionAccessArea.MODELS
                && ("cad-conversion".equals(last) || "cancel".equals(last))) {
            return ProductionAccessAction.CONVERT;
        }
        if (last.startsWith("submit") || last.startsWith("resubmit")) {
            return ProductionAccessAction.SUBMIT;
        }
        if (last.startsWith("approve") || last.startsWith("reject") || "final-approve".equals(last)
                || "verify".equals(last) || "send-back".equals(last)) {
            return ProductionAccessAction.APPROVE;
        }
        // Once placed on the request, the order's own start/complete endpoints
        // carry the suffix (start-production), so these match by prefix.
        if (last.startsWith("start")) {
            return ProductionAccessAction.START;
        }
        if (last.startsWith("complete")) {
            return ProductionAccessAction.COMPLETE;
        }
        switch (last) {
            case "start":
                return ProductionAccessAction.START;
            case "hold":
            case "resume":
                return ProductionAccessAction.HOLD;
            case "complete":
                return ProductionAccessAction.COMPLETE;
            case "skip":
                return ProductionAccessAction.SKIP;
            case "pass":
                return ProductionAccessAction.PASS;
            case "fail":
                return ProductionAccessAction.FAIL;
            case "cancel":
                return ProductionAccessAction.CANCEL;
            case "ready-for-dispatch":
                return ProductionAccessAction.RELEASE;
            case "convert":
                return ProductionAccessAction.CONVERT;
            case "export":
                return ProductionAccessAction.EXPORT;
            case "download":
                return ProductionAccessAction.DOWNLOAD;
            case "file":
                // PUT /drawings/{id}/file and /models/{id}/file replace the file.
                return "PUT".equals(verb) ? ProductionAccessAction.UPLOAD : ProductionAccessAction.VIEW;
            case "attachments":
            case "documents":
            case "upload":
                return ProductionAccessAction.UPLOAD;
            default:
                break;
        }
        // Settings are a collection of master-data resources, not one record:
        // every create is a POST under /production/settings/**.
        if (area == ProductionAccessArea.SETTINGS && "POST".equals(verb)) {
            return ProductionAccessAction.CREATE;
        }
        if (path.equals(collectionPath(area)) && "POST".equals(verb)) {
            return ProductionAccessAction.CREATE;
        }
        // Every other write targets an existing record: archive/restore, status,
        // the QC data / checklist patches, pending-qc, packed, return-to-draft …
        return ProductionAccessAction.EDIT;
    }

    private static String collectionPath(ProductionAccessArea area) {
        return switch (area) {
            case ORDERS -> "/production-orders";
            case TECHNICAL_VERIFICATION -> "/technical-verifications";
            case DRAWINGS -> "/drawings";
            case MODELS -> "/models";
            case CASTING -> "/castings";
            case FABRICATION -> "/fabrications";
            case MACHINE_SHOP -> "/machine-shop";
            case ASSEMBLY -> "/assemblies";
            case QUALITY -> "/quality-inspections";
            case PACKING -> "/packing";
            case DISPATCH -> "/dispatch";
            case ACKNOWLEDGEMENT -> "/acknowledgements";
            case ENTRY -> "/production-entries";
            default -> "";
        };
    }

    private static String lastSegment(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    /**
     * The area a path belongs to.
     *
     * <p><b>Two deliberate exceptions.</b> {@code /production-trackers/**} is the
     * data source of the Sales-side Production Tracker page
     * ({@code /sales-orders/production-tracker}) and is not part of the
     * Production module's own screens, so gating it here would change Sales
     * behaviour. {@code /documents/**} is the ERP's SHARED document repository:
     * Sales, Production and Purchase all use the same controller and page, and
     * every write/download there is already protected by the pre-existing
     * {@code DOCUMENT_*} authorities. This policy therefore owns only the
     * Production-scoped read ({@code /documents?scope=production}).
     */
    private static ProductionAccessArea areaOf(String path, String queryString) {
        if (path.equals("/production-kpi") || path.startsWith("/production-kpi/")) {
            return ProductionAccessArea.DASHBOARD;
        }
        // The integration endpoints read and advance Production WORK ORDERS
        // (traceability, quantities, can-start-*, advance), so they belong to the
        // Orders area — except the dashboard summary, which is Dashboard data.
        if (path.equals("/integration/dashboard")) {
            return ProductionAccessArea.DASHBOARD;
        }
        if (path.equals("/integration") || path.startsWith("/integration/")) {
            return ProductionAccessArea.ORDERS;
        }
        if (path.startsWith("/production-orders")) {
            return ProductionAccessArea.ORDERS;
        }
        if (path.startsWith("/technical-verifications")) {
            return ProductionAccessArea.TECHNICAL_VERIFICATION;
        }
        if (path.startsWith("/drawings")) {
            return ProductionAccessArea.DRAWINGS;
        }
        if (path.startsWith("/models") || path.startsWith("/cad-conversion")) {
            return ProductionAccessArea.MODELS;
        }
        if (path.startsWith("/castings")) {
            return ProductionAccessArea.CASTING;
        }
        if (path.startsWith("/fabrications")) {
            return ProductionAccessArea.FABRICATION;
        }
        if (path.startsWith("/machine-shop")) {
            return ProductionAccessArea.MACHINE_SHOP;
        }
        if (path.startsWith("/assemblies")) {
            return ProductionAccessArea.ASSEMBLY;
        }
        if (path.startsWith("/quality-inspections")) {
            return ProductionAccessArea.QUALITY;
        }
        if (path.startsWith("/packing")) {
            return ProductionAccessArea.PACKING;
        }
        if (path.startsWith("/dispatch")) {
            return ProductionAccessArea.DISPATCH;
        }
        if (path.startsWith("/acknowledgements")) {
            return ProductionAccessArea.ACKNOWLEDGEMENT;
        }
        if (path.startsWith("/production-entries")) {
            return ProductionAccessArea.ENTRY;
        }
        if (path.startsWith("/production/reports") || path.startsWith("/audit")) {
            return ProductionAccessArea.REPORTS;
        }
        if (path.startsWith("/production/settings")) {
            return ProductionAccessArea.SETTINGS;
        }
        if (path.equals("/documents") && isProductionScoped(queryString)) {
            return ProductionAccessArea.DOCUMENTS;
        }
        return null;
    }

    /** True when the repository read is the Production module's scoped listing. */
    private static boolean isProductionScoped(String queryString) {
        if (queryString == null) {
            return false;
        }
        for (String part : queryString.split("&")) {
            int equals = part.indexOf('=');
            if (equals <= 0) {
                continue;
            }
            String name = part.substring(0, equals);
            String value = part.substring(equals + 1);
            if ("scope".equalsIgnoreCase(name) && "production".equalsIgnoreCase(value.trim())) {
                return true;
            }
        }
        return false;
    }
}
