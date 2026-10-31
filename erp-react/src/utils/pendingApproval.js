/**
 * pendingApproval.js
 * ------------------------------------------------------------------
 * Shared helpers for the Pending Approval UX (light-green row highlight,
 * status dot beside the document number, sidebar pending count).
 *
 * Pending Approval = a record that is ACTUALLY waiting for an approval
 * action in its module's workflow. 'Submitted' is never Pending Approval:
 * submitted records keep their normal styling and are never counted or
 * highlighted (Cost Workout / Profit Workout / Sales Contract submitted
 * records report 0 pending).
 *
 * Status vocabulary per module (verified against the live backend /stats
 * responses):
 *   - CPR, Quotations, Credit Notes      -> 'pending approval'
 *   - CPR Technical Verification         -> 'under verification'
 *   - Sales Orders (CPO)                 -> 'pending review'
 *   - Sales Contracts                    -> 'under review'
 *   - Cost Workout / Profit Workout      -> none (submitted ≠ pending)
 * ------------------------------------------------------------------
 */

/** Window event dispatched after approval/status mutations so the sidebar count refreshes live. */
export const PENDING_APPROVAL_REFRESH_EVENT = 'erp:pending-approval-changed';

const NORMALIZE_SPACE = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * True when the record's status is the literal "Pending Approval" family
 * (pending approval / pending_approval / pendingapproval).
 */
export function isPendingApprovalStatus(status) {
  const key = NORMALIZE_SPACE(status);
  return key === 'pending approval' || key === 'pending_approval' || key === 'pendingapproval';
}

/**
 * Complete awaiting-approval status family across the ERP (each module's own
 * existing vocabulary — verified against the module status configs):
 *   - literal 'pending approval'      -> CPR, Quotations, Credit Notes
 *   - 'under review'                  -> Sales Contracts (awaiting review)
 *   - 'pending review'                -> Sales Orders (awaiting approval)
 *   - 'under verification'            -> CPR Technical Verification
 * 'Submitted' and the Cost/Profit Workout 'pending' alias are deliberately
 * NOT in this family — submitted is never Pending Approval. Statuses outside
 * this family (draft, submitted, approved, rejected, cancelled, archived,
 * deleted, and the non-approval sales statuses such as sent/issued/paid)
 * never match, so no highlight is shown for them.
 */
export function isApprovalPendingStatus(status) {
  const key = NORMALIZE_SPACE(status);
  return (
    key === 'pending approval' ||
    key === 'pending_approval' ||
    key === 'pendingapproval' ||
    key === 'under review' ||
    key === 'pending review' ||
    key === 'under verification'
  );
}

/**
 * Row-level "pending approval" check used by the shared tables. The CPR table
 * is shared by CPR (pending approval), the Cost/Profit Workouts (submitted —
 * NOT pending approval) and CPR Technical Verification (under verification);
 * the sales table sees the literal pending-approval status plus the Sales
 * Contract / Sales Order awaiting states.
 */
export function isRowPendingApproval(status) {
  return isApprovalPendingStatus(status);
}

/**
 * Returns a CSS class for status-based cell background highlighting.
 * Used on the document-number <td> to give a very-light status wash
 * instead of showing an inline badge.
 */
export function statusCellBgClass(status) {
  const key = NORMALIZE_SPACE(status);
  if (
    key === 'pending approval' ||
    key === 'pending_approval' ||
    key === 'pendingapproval' ||
    key === 'under review' ||
    key === 'pending review' ||
    key === 'under verification'
  ) {
    return 'po-status-bg-pending';
  }
  if (key === 'approved' || key === 'active' || key === 'completed' || key === 'paid') {
    return 'po-status-bg-approved';
  }
  if (key === 'rejected' || key === 'cancelled') {
    return 'po-status-bg-rejected';
  }
  return '';
}
