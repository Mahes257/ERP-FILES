/**
 * purchase/pages/rfq/QuotationComparison.test.js
 * ------------------------------------------------------------------
 * Unit tests for the Quotation Comparison deep-link normalization.
 *
 * The `?rfq=` query param may carry either the internal RFQ id
 * (RFQ-0008 — RFQ list / detail links) or the human-facing number
 * (RFQ-2026-0008 — the vendor-quotations "Compare Quotes" row action).
 * The page must resolve BOTH to the internal id so the RFQ selector
 * opens the right record instead of silently resetting to the first
 * RFQ (the pre-fix behaviour when a vendor-quotations deep link was
 * opened).
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { resolveRfqIdForComparison } from '../../utils/quoting';

/* Same shape as rfqService.getRfqs rows — internal id + rfqNo. */
const RFQS = [
  { id: 'RFQ-0006', rfqNo: 'RFQ-2026-0006', title: 'VFD panels' },
  { id: 'RFQ-0007', rfqNo: 'RFQ-2026-0007', title: 'Contactor spares' },
  { id: 'RFQ-0008', rfqNo: 'RFQ-2026-0008', title: 'Hot rolled steel coils' }
];

describe('resolveRfqIdForComparison (deep-link normalization)', () => {
  it('resolves a human-facing rfqNo param to the internal id', () => {
    /* The vendor-quotations "Compare Quotes" row action navigates with
       the quote's rfqNo field — this is the regression this guard fixes. */
    expect(resolveRfqIdForComparison(RFQS, 'RFQ-2026-0008')).toBe('RFQ-0008');
    expect(resolveRfqIdForComparison(RFQS, 'RFQ-2026-0006')).toBe('RFQ-0006');
  });

  it('passes an internal id param through unchanged', () => {
    /* RFQ list / detail links navigate with the internal id. */
    expect(resolveRfqIdForComparison(RFQS, 'RFQ-0007')).toBe('RFQ-0007');
  });

  it('falls back to the first RFQ when the param matches nothing', () => {
    /* A stale / invalid param must still render a selection. */
    expect(resolveRfqIdForComparison(RFQS, 'RFQ-2026-9999')).toBe('RFQ-0006');
  });

  it('falls back to the first RFQ for an empty param', () => {
    expect(resolveRfqIdForComparison(RFQS, '')).toBe('RFQ-0006');
    expect(resolveRfqIdForComparison(RFQS, null)).toBe('RFQ-0006');
  });

  it('resolves a numeric id param against numeric RFQ ids (API shape)', () => {
    /* API RFQ rows carry a numeric id while the ?rfq= param is always a
       string — a strict === left every in-app deep link unmatched and the
       page opened the FIRST RFQ (the wrong-record regression). */
    const numeric = [
      { id: 8, rfqNo: 'RFQ-2026-0042' },
      { id: 3, rfqNo: 'RFQ-2026-0027' }
    ];
    expect(resolveRfqIdForComparison(numeric, '3')).toBe(3);
    expect(resolveRfqIdForComparison(numeric, '8')).toBe(8);
    expect(resolveRfqIdForComparison(numeric, 'RFQ-2026-0027')).toBe(3);
    /* An unknown id still falls back to the first RFQ (unchanged). */
    expect(resolveRfqIdForComparison(numeric, '999')).toBe(8);
  });

  it('returns "" for an empty RFQ list (no crash, no bogus selection)', () => {
    expect(resolveRfqIdForComparison([], 'RFQ-2026-0008')).toBe('');
    expect(resolveRfqIdForComparison(undefined, 'RFQ-2026-0008')).toBe('');
  });
});
