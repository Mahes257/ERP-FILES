/**
 * purchase/utils/approvalCreateFlow.js
 * ------------------------------------------------------------------
 * Technical Evaluation → Approval Note create handoff.
 *
 * When the buyer completes a Technical Evaluation and clicks
 * "Proceed to Approval", the app opens the Approval Note CREATE page
 * for that SAME RFQ (never the generic Approval Flow list). The RFQ is
 * passed as a ?rfqId= query parameter and the create page pre-selects
 * the matching candidate.
 *
 *   approvalCreateRoute(rfqId)      — URL the Technical Evaluation page
 *                                     navigates to (builds the ?rfqId).
 *   selectInitialRfqId(candidates, requestedRfqId)
 *                                   — initial Source RFQ chosen by the
 *                                     create page from the same contract.
 *
 * Choosing WHICH of the two destinations an RFQ must land on (the
 * create page, or the note it already raised) needs the Approval Flow's
 * own state, so that resolver lives with that state in
 * `services/nfa.js` as `approvalFlowRouteFor()` and reuses
 * approvalCreateRoute() below — the URL shapes stay here in one place.
 *
 * These helpers are the two ends of one navigation contract; keep
 * them together so the query-parameter semantics never drift.
 * ------------------------------------------------------------------
 */

/**
 * Route for the Approval Note creation page pre-selected with an RFQ.
 * Technical Evaluation → Proceed to Approval opens the create page with
 * the current RFQ selected instead of the generic Approval Flow list.
 */
export function approvalCreateRoute(rfqId) {
  return `/purchase/rfq/approval/new?rfqId=${encodeURIComponent(rfqId)}`;
}

/**
 * Chooses the initial Source RFQ for the create form.
 * When an rfqId query parameter was supplied (Technical Evaluation →
 * Proceed to Approval), select that EXACT RFQ. If it is not an eligible
 * candidate, return '' so the page shows the validation state instead of
 * silently switching to another RFQ. With no rfqId, fall back to the
 * first eligible candidate (existing behaviour).
 */
export function selectInitialRfqId(candidates, requestedRfqId = '') {
  const requested = String(requestedRfqId || '').trim();
  if (requested) {
    const match = candidates.find((candidate) => sameRfqId(candidate.rfqId, requested));
    return match ? String(match.rfqId) : '';
  }
  return candidates.length > 0 ? String(candidates[0].rfqId) : '';
}

/**
 * Compares an RFQ identifier from a URL query parameter with one from a
 * candidate row.
 *
 * The query parameter is ALWAYS a string (`?rfqId=5` → `"5"`) while the
 * candidate comes from the RFQ store where `rfq.id` is a NUMBER — so
 * `===` between the two never matches a valid RFQ and would make the
 * create page report an eligible RFQ as ineligible. The same asymmetry
 * applies to a native `<select>` (its `value` is always a string).
 * Normalise both sides; an RFQ is identified by its id, never its type.
 */
export function sameRfqId(a, b) {
  if (a == null || a === '' || b == null || b === '') return false;
  return String(a).trim() === String(b).trim();
}
