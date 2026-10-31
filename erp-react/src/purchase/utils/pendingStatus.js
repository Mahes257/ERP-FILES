/**
 * purchase/utils/pendingStatus.js
 * ------------------------------------------------------------------
 * The single source of truth for "pending / action-required" records
 * across the Purchase module. Shared by:
 *
 *   • the sidebar count badges (usePurchaseSidebarCounts) — a badge
 *     is shown ONLY when its pending count is > 0, and
 *   • the table pending dots (PurchaseTable `statusDotTone`) — a red
 *     dot renders ONLY on rows that are pending / action-required.
 *
 * Because both consumers read the SAME predicates here, a record can
 * never be counted in the sidebar while its table row shows no dot
 * (or vice versa). Nothing is hardcoded — every predicate reads the
 * record's own persisted status field.
 *
 * Pending semantics per document (statuses that still require user
 * action):
 *   PR / Purchase Requisition — Draft, Pending Approval, Returned
 *     (pre-approval workflow. Approved / Rejected / Converted / PO
 *     Raised and terminal states are never pending).
 *   RFQ — Pending Approval, Quotation Received, Evaluation (Draft
 *     is incomplete / not yet committed; Sent is normal waiting for
 *     vendor, no buyer action required; Approved / Awarded / Closed /
 *     Cancelled are terminal).
 *   Vendor Quotation — Received (a received quote needs an
 *     accept / reject decision; Pending quotes are still awaiting the
 *     vendor's response).
 *   Purchase Order — status Pending Approval with a Pending approval
 *     decision (Draft is not yet submitted; Approved / Released / later
 *     stages are past the approval gate).
 *   Vendor — Pending Approval.
 *   RFQ Follow-up — Pending status only (open reminder;
 *     Completed / Cancelled never count); sidebar badge uses
 *     isFollowUpActionable (Pending + Overdue).
 *   Released PO acknowledgement — derived Pending acknowledgement
 *     (see utils/poAcknowledgement).
 *   Invoice — Submitted (awaiting invoice approval).
 *   Three-way matching — Pending Match or Mismatch (awaiting the
 *     match decision or requiring correction; Exception follows its
 *     own error styling; Matched is done).
 *   Payment approval / recording — Approved with a passed three-way
 *     match (awaiting the payment decision).
 *   Goods Receipt (GRN) — Expected (awaiting receipt) or Pending
 *     Inspection (awaiting QC); Received is complete.
 *   Quality Inspection — Pending (awaiting a pass/fail decision) or
 *     Passed-but-not-posted (awaiting inventory posting).
 *   Shipment Tracking — Pending Dispatch, In Transit or Delayed (all
 *     need monitoring / status updates); Delivered is complete.
 *   Manufacturing / Packing — In Production or Packed (in progress and
 *     can be advanced); Ready to Ship is terminal for this page.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, INVOICE_STATUS, MATCH_STATUS, PO_STATUS, PR_STATUS, QUOTATION_STATUS, RFQ_STATUS, VENDOR_STATUS } from '../constants';
import { FOLLOWUP_STATUS, FOLLOWUP_BUCKET } from '../services/rfqFollowUp';
import {
  GRN_STATUS,
  INSPECTION_STATUS,
  PACKING_STATUS,
  SHIPMENT_STATUS
} from '../services/logistics';
import { ACK_STATUS, getPoAckStatus } from './poAcknowledgement';

/** Pending statuses for a Purchase Requisition. */
export const PR_PENDING_STATUSES = [
  PR_STATUS.DRAFT,
  PR_STATUS.PENDING_APPROVAL,
  PR_STATUS.RETURNED
];

/** Pending / action-required statuses for an RFQ — Pending Approval,
 *  Quotation Received, Evaluation and the Approval Flow stages (1st /
 *  2nd / Final Approval — each still awaits an approval decision).
 *  Draft RFQs are not counted (incomplete, not yet committed); Sent
 *  RFQs are not counted (normal waiting-for-vendor, no buyer action
 *  required). See statusTone.js for the visual tone mapping. */
export const RFQ_PENDING_STATUSES = [
  RFQ_STATUS.PENDING_APPROVAL,
  RFQ_STATUS.QUOTATION_RECEIVED,
  RFQ_STATUS.EVALUATION,
  RFQ_STATUS.FIRST_APPROVAL,
  RFQ_STATUS.SECOND_APPROVAL,
  RFQ_STATUS.FINAL_APPROVAL
];

/** True when a requisition still needs user action. */
export const isPrPending = (record) => PR_PENDING_STATUSES.includes(record?.status);

/** True when an RFQ still needs sourcing action. */
export const isRfqPending = (record) => RFQ_PENDING_STATUSES.includes(record?.status);

/** True when a vendor quotation awaits an accept / reject decision. */
export const isQuotationPending = (quote) => quote?.status === QUOTATION_STATUS.RECEIVED;

/** True when a purchase order actually awaits the approval decision —
 *  submitted (status Pending Approval) and still Pending. Draft POs are
 *  not waiting for approval (they have not been submitted); Approved /
 *  Released / later stages have passed the approval gate. Read from the
 *  record's own persisted status + approvalStatus, exactly like the PO
 *  Approval console buckets. */
export const isPoPending = (order) =>
  order?.status === PO_STATUS.PENDING_APPROVAL
  && (order?.approvalStatus ?? APPROVAL_STATUS.PENDING) === APPROVAL_STATUS.PENDING;

/** True when a vendor awaits approval. */
export const isVendorPending = (vendor) => vendor?.status === VENDOR_STATUS.PENDING;

/** True when an RFQ follow-up is still open (not completed / cancelled). */
export const isFollowUpPending = (followUp) =>
  (followUp?.workflowStatus ?? followUp?.status) === FOLLOWUP_STATUS.PENDING;

/** True when an RFQ follow-up requires buyer action — Pending status
 *  OR Overdue (past its due date, needs attention). Completed and
 *  Cancelled follow-ups are never actionable. This is the predicate
 *  that drives the sidebar badge count for RFQ Follow-ups. */
export const isFollowUpActionable = (followUp) => {
  const status = followUp?.workflowStatus ?? followUp?.status;
  return status === FOLLOWUP_STATUS.PENDING || status === FOLLOWUP_BUCKET.OVERDUE;
};

/** True when a released PO still awaits supplier acknowledgement. */
export const isAckPending = (order) => getPoAckStatus(order) === ACK_STATUS.PENDING;

/** True when an invoice awaits approval — Submitted lifecycle status
 *  only (Draft is not yet in the workflow; Approved / Paid / Partially
 *  Paid are past the approval step). Reads the persisted lifecycle
 *  status, exactly like the Invoice List's Approve action. */
export const isInvoicePending = (invoice) => invoice?.status === INVOICE_STATUS.SUBMITTED;

/** The derived three-way match status on a read record — the mock read
 *  layer exposes it on `status` (with `matchStatus` persisted after a
 *  match / approval / payment), the API on `matchStatus`, so both
 *  conventions are honoured. */
function matchStatusOf(row) {
  return row?.matchStatus || row?.status;
}

/** True when a three-way-match row still requires action — PENDING
 *  or MISMATCH status (both need a buyer decision). Exception follows
 *  its own error styling. Matched is done. */
export const isMatchPending = (row) =>
  matchStatusOf(row) === MATCH_STATUS.PENDING ||
  matchStatusOf(row) === MATCH_STATUS.MISMATCH;

/** True when an invoice awaits payment approval / recording — the
 *  three-way match has passed and nothing is paid yet (the exact gate
 *  the payment pages enforce before settling). Paid / Partially Paid
 *  never count. */
export const isPaymentPending = (invoice) =>
  matchStatusOf(invoice) === MATCH_STATUS.MATCHED && !(Number(invoice?.paidAmount) > 0);

/** True when a goods receipt (GRN) still needs action — expected (awaiting
 *  receipt) or pending inspection (awaiting QC). Received is complete. */
export const isGrnPending = (grn) =>
  grn?.status === GRN_STATUS.EXPECTED || grn?.status === GRN_STATUS.PENDING_INSPECTION;

/** True when a quality inspection still needs action — awaiting a pass /
 *  fail decision, or passed but not yet posted to inventory. */
export const isInspectionPending = (inspection) =>
  inspection?.status === INSPECTION_STATUS.PENDING ||
  (inspection?.status === INSPECTION_STATUS.PASSED && !inspection?.postedAt);

/** True when a shipment still needs action — awaiting dispatch, in transit,
 *  or delayed (all need monitoring / status updates). Delivered is complete. */
export const isShipmentPending = (shipment) =>
  shipment?.status === SHIPMENT_STATUS.PENDING ||
  shipment?.status === SHIPMENT_STATUS.IN_TRANSIT ||
  shipment?.status === SHIPMENT_STATUS.DELAYED;

/** True when a manufacturing / packing job is still in progress (can be
 *  advanced). Ready to Ship is the terminal stage for this page. */
export const isPackingPending = (job) =>
  job?.status === PACKING_STATUS.IN_PRODUCTION || job?.status === PACKING_STATUS.PACKED;

/** ------------------------------------------------------------------
 * countActionRequired(records, isActionable)
 * ------------------------------------------------------------------
 * Shared helper for sidebar badge counts — returns the number of
 * records that still require user action.
 *
 * Usage:
 *   countActionRequired(rfqs, isRfqPending)
 *   countActionRequired(vendors, isVendorPending)
 *   countActionRequired(followUps, isFollowUpPending)
 *
 * This guarantees the sidebar badge, KPI cards, table filters and
 * pending/overdue counts always agree — they all derive from the
 * same predicate (isActionable) applied to the same record set.
 * ------------------------------------------------------------------
 */
export function countActionRequired(records, isActionable) {
  return Array.isArray(records) ? records.filter(isActionable).length : 0;
}

export default {
  PR_PENDING_STATUSES,
  RFQ_PENDING_STATUSES,
  isPrPending,
  isRfqPending,
  isQuotationPending,
  isPoPending,
  isVendorPending,
  isFollowUpPending,
  isFollowUpActionable,
  isAckPending,
  isInvoicePending,
  isMatchPending,
  isPaymentPending,
  isGrnPending,
  isInspectionPending,
  isShipmentPending,
  isPackingPending,
  countActionRequired
};
