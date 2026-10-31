/**
 * purchase/utils/quoting.js
 * ------------------------------------------------------------------
 * Shared quoting/comparison helpers for the Purchase RFQ module.
 * Kept as plain module functions so the page components stay
 * Fast-Refresh friendly (a component file should only export
 * components).
 * ------------------------------------------------------------------
 */

/**
 * Resolves the RFQ to open for the comparison page from the URL query.
 * Accepts either the internal id (used by in-app RFQ list / detail
 * links) or the human-facing number (RFQ-2026-0008 — the
 * vendor-quotations "Compare Quotes" row action). Returns the internal
 * id of the matching RFQ, or the first RFQ when nothing matches (the
 * page must always render a selection), or '' for an empty list.
 */
export function resolveRfqIdForComparison(rfqs, requested) {
  /* `requested` always comes from the URL query string (a string), while a
     real RFQ row's `id` is numeric — so `rfq.id === requested` was false for
     every in-app deep link (?rfq=3 vs id 3) and the resolver silently fell
     back to the FIRST RFQ. Compare both sides as strings so an id param and
     an rfqNo param resolve regardless of type. Invalid params still fall
     back to the first RFQ (the page must always render a selection). */
  const wanted = requested == null ? '' : String(requested).trim();
  const match = (rfqs || []).find(
    (rfq) => String(rfq?.id ?? '') === wanted || String(rfq?.rfqNo ?? '') === wanted
  );
  return match ? match.id : rfqs?.[0]?.id || '';
}