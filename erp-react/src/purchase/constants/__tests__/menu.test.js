/**
 * purchase/constants/__tests__/menu.test.js
 * ------------------------------------------------------------------
 * Tests for PURCHASE_CATEGORIES menu configuration — verifies that
 * every category with a badge has a valid countKey mapping that
 * matches a key in deriveActionCounts output.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { PURCHASE_CATEGORIES } from '../menu';
import { APPROVAL_STATUS, PO_STATUS } from '../../constants';
import { deriveActionCounts } from '../../utils/purchaseActionCounts';

/* Empty data shape for deriveActionCounts. */
function emptyData() {
  return {
    reqStats: {}, nfaStats: {}, rfqStats: {}, quoteStats: {},
    followUpStats: {}, board: [], poResult: { data: [] },
    vendorStats: {}, invoiceStats: {}, invoiceResult: { data: [] },
    docStats: {}, mfgStats: {}, shipStats: {}, grnStats: {},
    inspStats: {}
  };
}

describe('PURCHASE_CATEGORIES menu configuration', () => {
  it('every category has a unique key', () => {
    const keys = PURCHASE_CATEGORIES.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('categories with countKey have a valid count derivation', () => {
    const counts = deriveActionCounts(emptyData());
    PURCHASE_CATEGORIES.forEach((cat) => {
      if (cat.countKey) {
        expect(counts).toHaveProperty(cat.countKey);
        expect(typeof counts[cat.countKey]).toBe('number');
      }
    });
  });

  it('categories without countKey are Dashboard, Reports, Settings', () => {
    const noCount = PURCHASE_CATEGORIES.filter((c) => !c.countKey);
    expect(noCount.map((c) => c.key)).toEqual([
      'purchase-dashboard',
      'purchase-reports',
      'purchase-settings'
    ]);
  });

  it('categories with children have valid count derivation for each leaf key', () => {
    const counts = deriveActionCounts(emptyData());
    PURCHASE_CATEGORIES.forEach((cat) => {
      if (cat.children) {
        cat.children.forEach((leaf) => {
          expect(leaf.key).toBeTruthy();
          expect(counts).toHaveProperty(leaf.key);
          expect(typeof counts[leaf.key]).toBe('number');
        });
      }
    });
  });

  it('countKey values map to the correct leaf counts', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 3, byStatus: {} },
      vendorStats: { pending: 2 },
      rfqStats: { pendingApproval: 1, quotationReceived: 1, evaluation: 1 },
      poResult: { data: [{ status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING }] },
      mfgStats: { inProduction: 1 },
      grnStats: { expected: 2 },
      invoiceStats: { Submitted: 4 },
      docStats: { pending: 5 }
    });

    expect(counts['pr-list']).toBe(3);
    expect(counts['purchase-requisition']).toBe(3); // pr-list + pr-tech-spec = 3 + 0
    expect(counts['vendor-list']).toBe(2);
    expect(counts['rfq-list']).toBe(3);
    expect(counts['po-list']).toBe(1);
    expect(counts['logistics']).toBe(3); // 0 + 0 + 2 + 0
    expect(counts['invoices']).toBe(4);  // 4 + 0
    expect(counts['vendor-documents']).toBe(5);
  });
});
