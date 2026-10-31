/**
 * purchase/constants/rfq.js
 * ------------------------------------------------------------------
 * Canonical RFQ lifecycle statuses — single source of truth.
 *
 * This file exists to break the circular dependency between
 * index.js (barrel) and workflow.js.  workflow.js needs RFQ_STATUS
 * at runtime, but index.js re-exports everything from workflow.js.
 * Defining RFQ_STATUS here lets both files import from the same
 * non-circular source.
 *
 *   Draft → Pending Approval → Approved → Sent → Quotation Received →
 *   Evaluation → Pending Approval → 1st Approval → 2nd Approval →
 *   Final Approval → Approved → Awarded → Closed (Cancelled is a
 *   terminal side-branch).
 *
 * After the technical evaluation the RFQ enters the Approval Flow
 * (NFA): the RFQ status tracks the note's active approval stage —
 * Pending Approval once the evaluation completes, 1st Approval while
 * the First stage is active, 2nd Approval / Final Approval as each
 * stage is approved, and Approved once the note is fully approved.
 * The nfaService is the only writer of those stages (see
 * nfa.syncRfqStatus / nfa.repairRfqApprovalStatuses).
 * ------------------------------------------------------------------
 */

/**
 * RFQ lifecycle statuses — full enterprise sourcing workflow:
 * Draft → Pending Approval → Approved → Sent → Quotation Received →
 * Evaluation → Pending Approval → 1st Approval → 2nd Approval →
 * Final Approval → Approved → Awarded → Closed (Cancelled is a
 * terminal side-branch).
 *
 * `FIRST_APPROVAL` / `SECOND_APPROVAL` / `FINAL_APPROVAL` are the
 * Approval Flow (NFA) stages — the RFQ status while each approval
 * stage of the linked note is active.
 */
export const RFQ_STATUS = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  SENT: 'Sent',
  QUOTATION_RECEIVED: 'Quotation Received',
  EVALUATION: 'Evaluation',
  FIRST_APPROVAL: '1st Approval',
  SECOND_APPROVAL: '2nd Approval',
  FINAL_APPROVAL: 'Final Approval',
  AWARDED: 'Awarded',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled'
};

export const RFQ_STATUSES = Object.values(RFQ_STATUS);
