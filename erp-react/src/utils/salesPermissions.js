/**
 * salesPermissions.js
 * ------------------------------------------------------------------
 * The frontend mirror of the backend's Sales authority map.
 *
 * `com.vishatech.erp.security.RolePermissions` is the single source of truth
 * for role → permission: ADMIN receives every permission, MANAGER receives
 * SALES_DELETE, USER does not. Every Sales delete endpoint enforces it — the
 * single `DELETE /{id}`, `POST /bulk-delete` and `POST /bulk-permanent-delete`
 * of the eight Sales document controllers, plus the E-Action deletes — so the
 * UI needs the same answer to decide whether to offer a delete at all.
 *
 * This is a UI gate: usability, never enforcement. The server re-checks
 * SALES_DELETE on every request and remains the only security boundary;
 * withholding the action here only keeps a plain USER from walking into a 403.
 * ------------------------------------------------------------------
 */

/** Roles that hold SALES_DELETE, per RolePermissions.permissionsOf(UserRole). */
export const SALES_DELETE_ROLES = Object.freeze(['ADMIN', 'MANAGER']);

/** True when `role` holds the backend SALES_DELETE authority. */
export function hasSalesDelete(role) {
  return SALES_DELETE_ROLES.includes(String(role ?? '').trim().toUpperCase());
}
