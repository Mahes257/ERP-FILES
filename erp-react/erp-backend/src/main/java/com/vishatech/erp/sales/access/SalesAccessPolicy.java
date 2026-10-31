package com.vishatech.erp.sales.access;

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
 * The Sales access policy: the documented default permissions and the single
 * request → (area, action) mapping the backend enforces.
 *
 * <h2>Default policy</h2>
 *
 * Access Management is an opt-in override. A scope (role or user) that has
 * never been configured keeps exactly the capability it has today, which is
 * already expressed by {@link RolePermissions} — the project's single source of
 * truth for role → permission expansion, and the authority set the Sales
 * controllers already enforce with
 * {@code @PreAuthorize("hasAuthority('SALES_CREATE')")} and friends.
 *
 * <p>The default for a (role, area, action) triple is therefore derived, not
 * invented: the action is mapped to the permission its endpoints require today
 * (Sales → {@code SALES_*}, CRM → {@code CRM_*}, CPR → {@code CPR_*}, the shared
 * repository → {@code DOCUMENT_*}, Sales Settings writes →
 * {@code SETTINGS_MANAGE}) and the role's existing permission set answers the
 * question. Consequences that match the shipped behaviour:
 *
 * <ul>
 *   <li>ADMIN and MANAGER get every Sales action except Sales Settings editing
 *       (only ADMIN holds {@code SETTINGS_MANAGE});</li>
 *   <li>USER keeps view/create/edit everywhere it has {@code *_CREATE}/{@code *_EDIT}
 *       but never delete/approve, and can read Sales Settings;</li>
 *   <li>an unknown role or an unauthenticated caller is granted nothing.</li>
 * </ul>
 *
 * Because both layers stay in place — the interceptor only ever *adds* a
 * restriction, the existing {@code hasAuthority} checks are untouched — a
 * default can never widen access that exists today.
 *
 * <h2>Fail closed</h2>
 *
 * Defaults are the documented fallback for an <em>unconfigured</em> scope only.
 * A stored configuration that cannot be read, or a permission missing from a
 * saved configuration, never falls back to "allowed" — see
 * {@link SalesAccessService}.
 */
public final class SalesAccessPolicy {

    private SalesAccessPolicy() {
    }

    private static final Set<String> APPROVAL_SUFFIXES =
            Set.of("approve", "reject", "send-back", "float", "issue");

    /** The permission family an area belongs to, for default derivation. */
    private static String familyOf(SalesAccessArea area) {
        return switch (area) {
            case LEADS, CLIENTS, CONTACTS, FOLLOWUPS -> "CRM";
            case CPR, COST_WORKOUTS, PROFIT_WORKOUTS -> "CPR";
            case DOCUMENTS -> "DOCUMENT";
            case SETTINGS -> "SETTINGS";
            default -> "SALES";
        };
    }

    /**
     * The existing permission an action requires on the endpoints that implement
     * it. {@code null} means "no such capability exists in the role model", and
     * is treated as not granted.
     */
    private static Permission permissionFor(SalesAccessArea area, SalesAccessAction action) {
        String family = familyOf(area);
        String suffix = switch (action) {
            case VIEW -> "VIEW";
            case CREATE, EXPORT, IMPORT, SEND, UPLOAD -> "CREATE";
            case EDIT, SUBMIT -> "EDIT";
            case DELETE -> "DELETE";
            case APPROVE -> "APPROVE";
        };
        String name = family + "_" + suffix;
        return Arrays.stream(Permission.values())
                .filter(permission -> permission.name().equals(name))
                .findFirst()
                .orElse(null);
    }

    /**
     * The pre-existing Sales capability of a role for one area + action.
     *
     * <p>Sales Settings are the one area outside the module permission families:
     * the settings endpoint is readable by every authenticated user
     * ({@code @PreAuthorize("isAuthenticated()")}) and writable only with
     * {@code SETTINGS_MANAGE}.
     */
    public static boolean defaultAllow(UserRole role, SalesAccessArea area, SalesAccessAction action) {
        if (role == null || area == null || action == null || !area.supports(action)) {
            return false;
        }
        if (area == SalesAccessArea.SETTINGS) {
            return action == SalesAccessAction.VIEW
                    || (action == SalesAccessAction.EDIT
                        && RolePermissions.permissionsOf(role).contains(Permission.SETTINGS_MANAGE));
        }
        Permission permission = permissionFor(area, action);
        return permission != null && RolePermissions.permissionsOf(role).contains(permission);
    }

    /** Full default matrix for a role — every area, every supported action. */
    public static Map<String, Map<String, Boolean>> defaults(UserRole role) {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (SalesAccessArea area : SalesAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (SalesAccessAction action : area.actions()) {
                actions.put(action.key(), defaultAllow(role, area, action));
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** An empty matrix — what a scope is worth when its configuration cannot be read. */
    public static Map<String, Map<String, Boolean>> denyAll() {
        Map<String, Map<String, Boolean>> matrix = new LinkedHashMap<>();
        for (SalesAccessArea area : SalesAccessArea.values()) {
            Map<String, Boolean> actions = new LinkedHashMap<>();
            for (SalesAccessAction action : area.actions()) {
                actions.put(action.key(), false);
            }
            matrix.put(area.key(), actions);
        }
        return matrix;
    }

    /** The catalog the Access Management UI renders, straight from the enum. */
    public static List<Map<String, Object>> catalog() {
        return Arrays.stream(SalesAccessArea.values())
                .map(area -> {
                    Map<String, Object> entry = new LinkedHashMap<>();
                    entry.put("key", area.key());
                    entry.put("label", area.label());
                    entry.put("actions", area.actions().stream().map(SalesAccessAction::key).toList());
                    return entry;
                })
                .toList();
    }

    // ── Request → (area, action) ──────────────────────────────────────────

    /** One protected request: the Sales area and the action it requires. */
    public record Requirement(SalesAccessArea area, SalesAccessAction action) {
    }

    /**
     * Map an HTTP request inside the Sales module to the permission it requires.
     * Returns {@code null} for requests this policy does not own — the Access
     * Management endpoints themselves, anything outside the Sales paths, and the
     * shared repository calls it deliberately leaves to the existing
     * {@code DOCUMENT_*} checks.
     *
     * @param method         HTTP method
     * @param requestPath    request path <em>within the application context</em>
     *                       (e.g. {@code /quotations/4/approve})
     * @param queryString    raw query string, used to recognise the Sales-scoped
     *                       document repository read ({@code scope=sales})
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

        // Access Management configures Sales access — it must stay reachable to
        // an administrator even when Sales itself is off, so it is guarded by the
        // ADMIN role, not by a Sales permission.
        if (path.equals("/sales/access") || path.startsWith("/sales/access/")) {
            return null;
        }

        SalesAccessArea area = areaOf(path, queryString);
        if (area == null) {
            return null;
        }

        if ("GET".equals(verb) || "HEAD".equals(verb)) {
            return new Requirement(area, SalesAccessAction.VIEW);
        }
        if ("DELETE".equals(verb)) {
            return new Requirement(area, deleteActionFor(area, path));
        }

        // POST / PUT / PATCH
        String last = path.substring(path.lastIndexOf('/') + 1);

        if ("bulk-permanent-delete".equals(last)) {
            return new Requirement(area, SalesAccessAction.DELETE);
        }
        if ("bulk-delete".equals(last)) {
            return new Requirement(area, trashDeleteIsAnEdit(area)
                    ? SalesAccessAction.EDIT
                    : SalesAccessAction.DELETE);
        }
        if ("export".equals(last)) {
            return new Requirement(area, SalesAccessAction.EXPORT);
        }
        if ("import".equals(last) || "extract".equals(last)) {
            return new Requirement(area, SalesAccessAction.IMPORT);
        }
        if ("send".equals(last)) {
            return new Requirement(area, SalesAccessAction.SEND);
        }
        if ("submit".equals(last)) {
            return new Requirement(area, SalesAccessAction.SUBMIT);
        }
        if (APPROVAL_SUFFIXES.contains(last)) {
            return new Requirement(area, SalesAccessAction.APPROVE);
        }
        if ("POST".equals(verb) && ("attachments".equals(last)
                || "documents".equals(last)
                || "upload".equals(last))) {
            return new Requirement(area, SalesAccessAction.UPLOAD);
        }
        if ("POST".equals(verb) && isCreateTarget(area, path)) {
            return new Requirement(area, SalesAccessAction.CREATE);
        }
        // Every other write targets an existing record and therefore needs EDIT:
        // archive/restore, status, duplicate, the convert-* chain, mark-paid,
        // generate-*, the e-action children and the visibility/division patches.
        return new Requirement(area, SalesAccessAction.EDIT);
    }

    /**
     * The CPR family splits deletion in two, and its authorities do too.
     *
     * <p>{@code DELETE /cprs/{id}}, {@code POST /cprs/bulk-delete} and the
     * workouts' {@code DELETE /{id}} only move the record to the trash and are
     * annotated {@code CPR_EDIT} — the same authority as any other record edit,
     * so a USER may do them (see {@code CprApiTest}). The narrower
     * {@code CPR_DELETE} is reserved for the irreversible ones:
     * {@code POST /cprs/bulk-permanent-delete}, {@code DELETE
     * /{id}/permanent} on the workouts, and the technical verification's own
     * routes. The Delete switch therefore means exactly what it means on those
     * endpoints — never more — and the trash-style delete stays an Edit.
     */
    private static boolean trashDeleteIsAnEdit(SalesAccessArea area) {
        return area == SalesAccessArea.CPR
                || area == SalesAccessArea.COST_WORKOUTS
                || area == SalesAccessArea.PROFIT_WORKOUTS;
    }

    /** The action a DELETE on this path requires, mirroring the endpoint's own authority. */
    private static SalesAccessAction deleteActionFor(SalesAccessArea area, String path) {
        if (!trashDeleteIsAnEdit(area)) {
            return SalesAccessAction.DELETE;
        }
        if (path.endsWith("/permanent") || path.startsWith("/cpr-technical-verifications")) {
            return SalesAccessAction.DELETE;
        }
        return SalesAccessAction.EDIT;
    }

    /** True when this POST creates a new record in the area's own collection. */
    private static boolean isCreateTarget(SalesAccessArea area, String path) {
        if (path.equals(collectionPath(area))) {
            return true;
        }
        return switch (area) {
            // The CPO child collection is created from the same page as an order.
            case CPO -> path.equals("/sales-orders/e-actions");
            // CPR's technical verification is its own collection under the same page.
            case CPR -> path.equals("/cpr-technical-verifications");
            default -> false;
        };
    }

    private static String collectionPath(SalesAccessArea area) {
        return switch (area) {
            case LEADS -> "/leads";
            case CLIENTS -> "/customers";
            case CONTACTS -> "/contacts";
            case FOLLOWUPS -> "/followups";
            case CPR -> "/cprs";
            case COST_WORKOUTS -> "/cost-workouts";
            case PROFIT_WORKOUTS -> "/profit-workouts";
            case QUOTATIONS -> "/quotations";
            case SALES_CONTRACTS -> "/sales-contracts";
            case CPO -> "/sales-orders";
            case DELIVERY_CHALLANS -> "/delivery-challans";
            case PROFORMA_INVOICES -> "/proforma-invoices";
            case INVOICES -> "/invoices";
            case PAYMENT_RECEIPTS -> "/payment-receipts";
            case CREDIT_NOTES -> "/credit-notes";
            default -> "";
        };
    }

    /**
     * The area a path belongs to.
     *
     * <p><b>Documents exception.</b> {@code /documents/**} is the ERP's SHARED
     * document repository: the very same controller and page serve Sales
     * ({@code scope=sales}) and Production ({@code /production/documents}), and
     * every write, download and delete there is already protected by the
     * pre-existing {@code DOCUMENT_*} authorities plus the repository's own
     * per-record permission checks. Gating those shared paths with a Sales
     * permission would silently change Production and Purchase behaviour, which
     * is out of scope, so this policy only owns the Sales-scoped read
     * ({@code /documents?scope=sales}) and returns {@code null} for the rest.
     */
    private static SalesAccessArea areaOf(String path, String queryString) {
        if (path.equals("/sales/dashboard") || path.startsWith("/sales/dashboard/")) {
            return SalesAccessArea.DASHBOARD;
        }
        if (path.equals("/sales/reports") || path.startsWith("/sales/reports/")) {
            return SalesAccessArea.REPORTS;
        }
        if (path.equals("/settings/sales") || path.startsWith("/settings/sales/")) {
            return SalesAccessArea.SETTINGS;
        }
        if (path.startsWith("/sales-orders")) {
            return SalesAccessArea.CPO;
        }
        if (path.startsWith("/delivery-challans")) {
            return SalesAccessArea.DELIVERY_CHALLANS;
        }
        if (path.startsWith("/proforma-invoices")) {
            return SalesAccessArea.PROFORMA_INVOICES;
        }
        if (path.startsWith("/invoices")) {
            return SalesAccessArea.INVOICES;
        }
        if (path.startsWith("/payment-receipts")) {
            return SalesAccessArea.PAYMENT_RECEIPTS;
        }
        if (path.startsWith("/credit-notes")) {
            return SalesAccessArea.CREDIT_NOTES;
        }
        if (path.startsWith("/sales-contracts")) {
            return SalesAccessArea.SALES_CONTRACTS;
        }
        if (path.startsWith("/quotations")) {
            return SalesAccessArea.QUOTATIONS;
        }
        if (path.startsWith("/cprs") || path.startsWith("/cpr-technical-verifications")) {
            return SalesAccessArea.CPR;
        }
        if (path.startsWith("/cost-workouts")) {
            return SalesAccessArea.COST_WORKOUTS;
        }
        if (path.startsWith("/profit-workouts")) {
            return SalesAccessArea.PROFIT_WORKOUTS;
        }
        if (path.startsWith("/leads")) {
            return SalesAccessArea.LEADS;
        }
        if (path.startsWith("/customers")) {
            return SalesAccessArea.CLIENTS;
        }
        if (path.startsWith("/contacts")) {
            return SalesAccessArea.CONTACTS;
        }
        if (path.startsWith("/followups")) {
            return SalesAccessArea.FOLLOWUPS;
        }
        if (path.equals("/documents") && isSalesScoped(queryString)) {
            return SalesAccessArea.DOCUMENTS;
        }
        return null;
    }

    /** True when the repository read is the Sales module's scoped listing. */
    private static boolean isSalesScoped(String queryString) {
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
            if ("scope".equalsIgnoreCase(name) && "sales".equalsIgnoreCase(value.trim())) {
                return true;
            }
        }
        return false;
    }
}
