/**
 * purchase/utils/statusTone.js
 * ------------------------------------------------------------------
 * The single source of truth for the Purchase module's semantic
 * color system. Every workflow status maps onto ONE of five tones:
 *
 *   green  = SUCCESS / COMPLETED / APPROVED
 *   orange = PENDING / NEEDS ACTION
 *   red    = REJECTED / CANCELLED / FAILED / EXCEPTION
 *   blue   = INFORMATION / SENT / IN PROGRESS
 *   gray   = DRAFT / NEUTRAL
 *
 * Consumed by PurchaseStatusBadge (status pills), the table status
 * dots (PurchaseTable `statusDotTone`), the KPI cards and the page
 * tone maps — so the SAME status always renders the SAME color
 * everywhere (badge color === dot color === KPI color).
 *
 * Priority is deliberately NOT part of this map — priority chips keep
 * their own independent scale (Critical = red, High = orange,
 * Medium = gray, Low = green) and never influence status colors.
 * ------------------------------------------------------------------
 */
export const STATUS_TONES = {
  /* -------- GREEN — success / completed / approved -------- */
  Approved: 'green',
  'Ready for RFQ': 'green',
  Converted: 'green',
  'Converted to RFQ': 'green',
  'PO Raised': 'green',
  Completed: 'green',
  Paid: 'green',
  Accepted: 'green',
  Active: 'green',
  Acknowledged: 'green',
  Reviewed: 'green',
  'Ready to Ship': 'green',
  Delivered: 'green',
  Passed: 'green',
  Agreed: 'green',
  Awarded: 'green',
  Matched: 'green',

  /* -------- ORANGE — pending / waiting for user action -------- */
  Pending: 'orange',
  'Pending Approval': 'orange',
  /* Approval Flow stages — both the RFQ status wording (1st / 2nd /
     Final Approval) and the NFA note wording (First / Second /
     Final Approval) render the same orange tone. */
  '1st Approval': 'orange',
  '2nd Approval': 'orange',
  'First Approval': 'orange',
  'Second Approval': 'orange',
  'Final Approval': 'orange',
  'Pending Review': 'orange',
  'Pending Match': 'orange',
  'Pending Dispatch': 'orange',
  'Pending Inspection': 'orange',
  'Pending Acknowledgement': 'orange',
  'Pending Payment': 'orange',
  'Waiting for Quotations': 'orange',
  Returned: 'orange',
  'Technical Specification Review': 'orange',
  'Ready for Review': 'orange',
  Evaluation: 'orange',
  'Due Today': 'orange',

  /* -------- BLUE — information / sent / in progress -------- */
  Sent: 'blue',
  'Sent to Vendors': 'blue',
  'RFQ Sent': 'blue',
  'In Progress': 'blue',
  'Negotiation in Progress': 'blue',
  'Technical Evaluation': 'blue',
  'Commercial Evaluation': 'blue',
  'Quotation Received': 'blue',
  Received: 'blue',
  Submitted: 'blue',
  Open: 'blue',
  Issued: 'blue',
  Processing: 'blue',
  Unpaid: 'orange',
  Scheduled: 'orange',
  'Not Issued': 'gray',
  Reversed: 'gray',
  Partial: 'blue',
  'Partially Matched': 'blue',
  /* Partial payment progress is a warning state — money is still due. */
  'Partially Paid': 'orange',
  Released: 'blue',
  'Supplier Acknowledged': 'blue',
  'Partially Delivered': 'blue',
  'In Transit': 'blue',
  'In Production': 'blue',
  Packed: 'blue',
  'In Review': 'blue',
  Expected: 'blue',
  Upcoming: 'blue',

  /* -------- RED — rejected / cancelled / failed / exception -------- */
  Rejected: 'red',
  Cancelled: 'red',
  Cancel: 'red',
  Failed: 'red',
  Exception: 'red',
  Blocked: 'red',
  Overdue: 'red',
  Delayed: 'red',
  Mismatch: 'red',

  /* -------- GRAY — draft / neutral / terminal-archive -------- */
  Draft: 'gray',
  'Not Started': 'gray',
  'Not Required': 'gray',
  Closed: 'gray',
  Archived: 'gray',
  Deleted: 'gray'
};

/** Resolve the semantic tone for a status string (gray fallback). */
export function getStatusTone(status) {
  return STATUS_TONES[status] || 'gray';
}

/** True when a status is pending / needs action (orange tone). */
export function isPendingStatus(status) {
  return getStatusTone(status) === 'orange';
}

/** Priority chips keep an INDEPENDENT scale — never workflow status. */
export const PRIORITY_TONES = {
  Critical: 'red',
  High: 'orange',
  Medium: 'gray',
  Low: 'green'
};

export function getPriorityTone(priority) {
  return PRIORITY_TONES[priority] || 'gray';
}

export default { STATUS_TONES, getStatusTone, PRIORITY_TONES, getPriorityTone };
