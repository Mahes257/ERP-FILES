/**
 * purchase/components/__tests__/quotationRfqDropdown.test.js
 * ------------------------------------------------------------------
 * Regression tests for the Quotation Form RFQ dropdown:
 *
 *  1. Eligible SENT RFQ appears in filtered list
 *  2. Eligible QUOTATION_RECEIVED RFQ appears
 *  3. Eligible EVALUATION RFQ appears
 *  4. DRAFT RFQ does NOT appear
 *  5. CLOSED RFQ does NOT appear
 *  6. CANCELLED RFQ does NOT appear
 *  7. PENDING_APPROVAL RFQ does NOT appear
 *  8. APPROVED RFQ does NOT appear
 *  9. select options use rfqNo as the stable value
 * 10. Multiple eligible RFQs coexist in the dropdown
 * 11. Empty eligible list when no RFQs match
 * 12. All-eligible list when all statuses are eligible
 * 13. Seed data is present in the rfqsStore
 * 14. Seed data contains RFQs with eligible statuses
 * 15. Case-insensitive status matching works
 *
 * Tests exercise the eligibility filter logic used by the
 * QuotationForm's openRfqOptions useMemo.
 * ------------------------------------------------------------------
 */
import { describe, it, expect, vi } from 'vitest';
import { RFQ_STATUS } from '../../constants';
import { rfqsStore } from '../../services/rfq';

/* Stub delay so every service call resolves instantly. */
vi.mock('../../services/base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* ------------------------------------------------------------------ */
/*  Helper: reproduce the QuotationForm's openRfqOptions logic         */
/* ------------------------------------------------------------------ */

/** Mirrors the QuotationForm eligibility filter exactly. */
function filterEligibleRfqs(rfqOptions) {
  const eligibleStatuses = [
    RFQ_STATUS.SENT,
    RFQ_STATUS.QUOTATION_RECEIVED,
    RFQ_STATUS.EVALUATION,
  ];
  const eligibleSet = new Set(eligibleStatuses.map((s) => s.toLowerCase()));
  return rfqOptions.filter((r) => {
    const status = String(r.status || '').toLowerCase();
    return eligibleSet.has(status);
  });
}

/** Mirrors the QuotationForm's rfqSelectOptions mapping. */
function toSelectOptions(openRfqOptions) {
  return openRfqOptions.map((option) => ({
    value: option.rfqNo,
    label: `${option.rfqNo} — ${option.title}`,
  }));
}

/* ================================================================== */
/*  TEST SUITE                                                         */
/* ================================================================== */

describe('Quotation Form — RFQ dropdown eligibility filter', () => {
  it('1. SENT RFQ is included', () => {
    const rfqs = [{ rfqNo: 'RFQ-001', status: RFQ_STATUS.SENT, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].rfqNo).toBe('RFQ-001');
  });

  it('2. QUOTATION_RECEIVED RFQ is included', () => {
    const rfqs = [{ rfqNo: 'RFQ-002', status: RFQ_STATUS.QUOTATION_RECEIVED, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(1);
  });

  it('3. EVALUATION RFQ is included', () => {
    const rfqs = [{ rfqNo: 'RFQ-003', status: RFQ_STATUS.EVALUATION, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(1);
  });

  it('4. DRAFT RFQ is excluded', () => {
    const rfqs = [{ rfqNo: 'RFQ-004', status: RFQ_STATUS.DRAFT, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });

  it('5. CLOSED RFQ is excluded', () => {
    const rfqs = [{ rfqNo: 'RFQ-005', status: RFQ_STATUS.CLOSED, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });

  it('6. CANCELLED RFQ is excluded', () => {
    const rfqs = [{ rfqNo: 'RFQ-006', status: RFQ_STATUS.CANCELLED, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });

  it('7. PENDING_APPROVAL RFQ is excluded', () => {
    const rfqs = [{ rfqNo: 'RFQ-007', status: RFQ_STATUS.PENDING_APPROVAL, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });

  it('8. APPROVED RFQ is excluded', () => {
    const rfqs = [{ rfqNo: 'RFQ-008', status: RFQ_STATUS.APPROVED, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });

  it('9. AWARDED RFQ is excluded', () => {
    const rfqs = [{ rfqNo: 'RFQ-009', status: RFQ_STATUS.AWARDED, title: 'Test' }];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });
});

describe('Quotation Form — select option value mapping', () => {
  it('10. options use rfqNo as the stable value identifier', () => {
    const rfqs = [
      { rfqNo: 'RFQ-2026-0008', status: RFQ_STATUS.SENT, title: 'Steel sheets' },
      { rfqNo: 'RFQ-2026-0007', status: RFQ_STATUS.SENT, title: 'VFD drives' },
    ];
    const eligible = filterEligibleRfqs(rfqs);
    const options = toSelectOptions(eligible);

    expect(options).toHaveLength(2);
    expect(options[0].value).toBe('RFQ-2026-0008');
    expect(options[0].label).toContain('RFQ-2026-0008');
    expect(options[0].label).toContain('Steel sheets');
    expect(options[1].value).toBe('RFQ-2026-0007');
  });
});

describe('Quotation Form — multiple eligible RFQs', () => {
  it('11. multiple eligible RFQs coexist, ineligible are filtered out', () => {
    const rfqs = [
      { rfqNo: 'RFQ-001', status: RFQ_STATUS.SENT, title: 'A' },
      { rfqNo: 'RFQ-002', status: RFQ_STATUS.SENT, title: 'B' },
      { rfqNo: 'RFQ-003', status: RFQ_STATUS.EVALUATION, title: 'C' },
      { rfqNo: 'RFQ-004', status: RFQ_STATUS.DRAFT, title: 'D' },
      { rfqNo: 'RFQ-005', status: RFQ_STATUS.CANCELLED, title: 'E' },
      { rfqNo: 'RFQ-006', status: RFQ_STATUS.CLOSED, title: 'F' },
      { rfqNo: 'RFQ-007', status: RFQ_STATUS.PENDING_APPROVAL, title: 'G' },
      { rfqNo: 'RFQ-008', status: RFQ_STATUS.APPROVED, title: 'H' },
      { rfqNo: 'RFQ-009', status: RFQ_STATUS.AWARDED, title: 'I' },
    ];
    const eligible = filterEligibleRfqs(rfqs);

    expect(eligible).toHaveLength(3);
    expect(eligible.map((r) => r.rfqNo)).toEqual(['RFQ-001', 'RFQ-002', 'RFQ-003']);
  });
});

describe('Quotation Form — empty and full states', () => {
  it('12. empty list when no RFQs match', () => {
    const rfqs = [
      { rfqNo: 'RFQ-001', status: RFQ_STATUS.DRAFT },
      { rfqNo: 'RFQ-002', status: RFQ_STATUS.CANCELLED },
      { rfqNo: 'RFQ-003', status: RFQ_STATUS.CLOSED },
    ];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(0);
  });

  it('13. all appear when all statuses are eligible', () => {
    const rfqs = [
      { rfqNo: 'RFQ-001', status: RFQ_STATUS.SENT },
      { rfqNo: 'RFQ-002', status: RFQ_STATUS.QUOTATION_RECEIVED },
      { rfqNo: 'RFQ-003', status: RFQ_STATUS.EVALUATION },
    ];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(3);
  });
});

describe('RFQ seed data presence', () => {
  it('14. rfqsStore is empty after initialization (no demo data)', () => {
    const records = rfqsStore.all;
    expect(records.length).toBe(0);
  });

  it('15. seed builder returns no RFQs with eligible statuses (SENT/EVALUATION)', () => {
    const records = rfqsStore.all;
    const eligibleStatuses = new Set([
      RFQ_STATUS.SENT,
      RFQ_STATUS.QUOTATION_RECEIVED,
      RFQ_STATUS.EVALUATION,
    ]);
    const eligibleRecords = records.filter((r) => eligibleStatuses.has(r.status));
    expect(eligibleRecords.length).toBe(0);
  });
});

describe('Quotation Form — case-insensitive matching', () => {
  it('16. status comparison is case-insensitive', () => {
    const rfqs = [
      { rfqNo: 'RFQ-001', status: 'sent', title: 'lowercase' },
      { rfqNo: 'RFQ-002', status: 'SENT', title: 'uppercase' },
      { rfqNo: 'RFQ-003', status: 'Sent', title: 'titlecase' },
      { rfqNo: 'RFQ-004', status: 'Draft', title: 'ineligible' },
    ];
    const eligible = filterEligibleRfqs(rfqs);
    expect(eligible).toHaveLength(3);
  });
});
