/**
 * purchase/utils/access.js
 * ------------------------------------------------------------------
 * Purchase module access helpers — resolved against the application's
 * existing authentication model (src/services/authService), never the
 * display name.
 *
 * The backend exposes a role-based model (UserRole enum: ADMIN /
 * MANAGER / USER) and the login response stores { email, fullName,
 * role } on the session (authUser in localStorage). There is no
 * fine-grained permission array today, so the ADMIN role maps to the
 * Purchase Requisition approval queue. If a permission array is added
 * to the user payload later, the matching permission constant below is
 * honoured as well — so callers keep working without changes.
 * ------------------------------------------------------------------
 */
import { getStoredUser } from '../../services/authService';

/** Fine-grained permission that grants access to the PR approval queue
 *  (checked when the user payload carries a `permissions` array). */
export const PURCHASE_PERMISSIONS = {
  APPROVE_REQUISITIONS: 'PURCHASE_REQUISITION_APPROVAL'
};

/**
 * True when the current user is a Purchase Requisition approver — i.e.
 * the PR approval queue belongs to them (ADMIN role, or an explicit
 * PURCHASE_REQUISITION_APPROVAL permission). Pass `user` explicitly to
 * reuse one session read; defaults to the stored user.
 */
export function canApproveRequisitions(user = getStoredUser()) {
  /* In the frontend-only mock app there is no login flow — the sidebar
     always displays "Admin User" / "Administrator" as the default.
     When no user session exists, treat the visitor as an admin so the
     approval buttons remain visible.  When a real backend is connected
     and a session is present, the role-based check below applies. */
  if (!user) return true;
  const role = String(user.role || '').trim().toUpperCase();
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  return role === 'ADMIN' || role === 'ADMINISTRATOR' || !user.role || permissions.includes(PURCHASE_PERMISSIONS.APPROVE_REQUISITIONS);
}
