/**
 * purchase/utils/pendingHighlight.js
 * ------------------------------------------------------------------
 * The single shared "pending / action-required" visual marker for the
 * Purchase module — the exact mechanism behind the Purchase Requisition
 * List's Pending Approval highlight, now used by EVERY Purchase list and
 * evaluation board so the whole module speaks one notification language:
 *
 *   • SIDEBAR   — orange circular badge (see usePurchaseSidebarCounts /
 *                 AppLayout LeafItem) shown only while pending count > 0
 *   • TABLE     — a very subtle light-orange background on the LEFT
 *                 identification cells ONLY (selection checkbox +
 *                 document-number cell), never the full row (see
 *                 .is-pending-work in cpr-list.css)
 *   • CARD      — the same light-orange wash on the card header (the
 *                 identification area holding the document number) of
 *                 pending board items (evaluation pages)
 *
 * Pages gate the class with their OWN pending predicate (the same one
 * that drives the sidebar count, so badge and table can never
 * disagree — see utils/pendingStatus). Nothing is hardcoded: the class
 * is only ever applied to records the page itself derives as genuinely
 * pending / awaiting action.
 * ------------------------------------------------------------------
 */

/** Shared pending-work marker class — styled once in cpr-list.css. */
export const PENDING_WORK_CLASS = 'is-pending-work';

/** Returns the shared pending class when `pending` is true, else ''. */
export function pendingWorkClass(pending) {
  return pending ? PENDING_WORK_CLASS : '';
}

/** Row-friendly form: pendingRowClass(row, isPending(row)). */
export function pendingRowClass(row, isPending) {
  return isPending(row) ? PENDING_WORK_CLASS : '';
}

export default {
  PENDING_WORK_CLASS,
  pendingWorkClass,
  pendingRowClass
};
