/**
 * src/utils/creditNoteTaxableAmount.test.js
 * ------------------------------------------------------------------
 * Credit Note detail page — the ITEM table's `Taxable Amount` column.
 *
 * Confirmed API contract (GET /v1/credit-notes/{id}, credit note 5, read-only):
 *
 *   item = { id, description, sku, uom, qty, rate, discountPct, gstRate,
 *            grossAmount, discountAmount, netAmount, cgst, sgst, total }
 *   2 × ₹100 @18%  →  grossAmount 200, discountAmount 0, netAmount 200,
 *                     cgst 18, sgst 18, total 236
 *
 * Backend CreditNoteService.itemResponse computes
 *   net = gross − gross × discountPct / 100   (= the value GST is applied to)
 * so `netAmount` IS the taxable value of a Credit Note line. The detail resolver
 * previously read only `taxable` / `taxableAmount`, neither of which the response
 * returns, and therefore rendered ₹0.00.
 *
 * Covered here:
 *   FIELD      `netAmount` is used when the row carries no taxable/taxableAmount
 *   ZERO       a legitimate numeric 0 stays 0 (never replaced by a fallback)
 *   PRECEDENCE stored snapshots with taxable/taxableAmount keep winning
 *   FORMAT     money formatting / currency context is unchanged
 *   SCOPE      the fix cannot reach another module (only the credit-note column
 *              set has a `taxable` column) and `amount`/`total` still ignore
 *              `netAmount`
 *
 * Run: npm run test:unit
 */

import { describe, it, expect } from 'vitest';
import { resolveDetailValue } from './detailColumns';
import { defaultSalesItemsColumns as itemsColumns } from './salesItemsColumns';

/** A credit-note item exactly as the API returns it (credit note 5). */
const apiItem = (over = {}) => ({
  id: 11,
  description: 'View Action Test B',
  sku: '',
  uom: 'Nos',
  qty: 2,
  rate: 100,
  discountPct: 0,
  gstRate: 18,
  grossAmount: 200,
  discountAmount: 0,
  netAmount: 200,
  cgst: 18,
  sgst: 18,
  total: 236,
  ...over
});

const TAXABLE_COL = { id: 'taxable', key: 'taxable', label: 'Taxable Amount', type: 'computed', system: true };
const TOTAL_COL = { id: 'total', key: 'total', label: 'Total', type: 'computed', system: true };
const AMOUNT_COL = { id: 'amount', key: 'amount', label: 'Amount', type: 'computed', system: true };

describe('Credit Note detail · Taxable Amount column', () => {
  it('renders the API netAmount instead of ₹0.00', () => {
    expect(resolveDetailValue(TAXABLE_COL, apiItem())).toBe('₹200.00');
  });

  it('applies the record’s own historical discount (netAmount is post-discount)', () => {
    // 2 × 100 with a stored 10 % line discount → gross 200, discount 20, net 180.
    const legacy = apiItem({
      discountPct: 10,
      discountAmount: 20,
      netAmount: 180,
      cgst: 16.2,
      sgst: 16.2,
      total: 212.4
    });
    expect(resolveDetailValue(TAXABLE_COL, legacy)).toBe('₹180.00');
    // The column is the taxable value — not the gross and not the tax-inclusive total.
    expect(resolveDetailValue(TAXABLE_COL, legacy)).not.toBe('₹200.00');
    expect(resolveDetailValue(TOTAL_COL, legacy)).toBe('₹212.40');
  });

  it('keeps a legitimate numeric zero as zero', () => {
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ netAmount: 0, grossAmount: 0, total: 0 }))).toBe('₹0.00');
    // A stored snapshot that explicitly says 0 wins over a later netAmount field.
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ taxable: 0, taxableAmount: 0, netAmount: 500 }))).toBe('₹0.00');
    // …and a missing row still falls back to 0 rather than throwing.
    expect(resolveDetailValue(TAXABLE_COL, {})).toBe('₹0.00');
  });

  it('keeps stored taxable / taxableAmount first in the fallback chain', () => {
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ taxable: 111, netAmount: 200 }))).toBe('₹111.00');
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ taxableAmount: 123.45, netAmount: 200 }))).toBe('₹123.45');
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ taxable: null, taxableAmount: undefined, netAmount: 200 }))).toBe('₹200.00');
  });

  it('keeps the existing money formatting and the caller’s currency context', () => {
    const ctx = { money: (v) => `USD ${Number(v).toFixed(2)}` };
    expect(resolveDetailValue(TAXABLE_COL, apiItem(), ctx)).toBe('USD 200.00');
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ netAmount: 0 }), ctx)).toBe('USD 0.00');
    // Default formatting stays Indian-grouped with 2 decimals.
    expect(resolveDetailValue(TAXABLE_COL, apiItem({ netAmount: 1234567.5 }))).toBe('₹12,34,567.50');
  });

  it('never leaks netAmount into Amount / Total, which include tax', () => {
    expect(resolveDetailValue(TOTAL_COL, apiItem())).toBe('₹236.00');
    expect(resolveDetailValue(AMOUNT_COL, { netAmount: 200, total: 236 })).toBe('₹236.00');
  });

  it('cannot change another module: only the credit-note column set has a Taxable column', () => {
    const creditNote = itemsColumns({ variant: 'creditNote' }).map((c) => c.key);
    expect(creditNote).toContain('taxable');
    ['invoice', 'proforma', 'export', 'proformaExport', 'packingList', 'default'].forEach((variant) => {
      expect(itemsColumns({ variant }).map((c) => c.key)).not.toContain('taxable');
    });
    // The detail layer builds the credit-note set from the same builder, so the
    // column the resolver feeds only ever appears there.
    expect(creditNote).toEqual(['sno', 'desc', 'hsn', 'qty', 'unit', 'rate', 'gst', 'taxable', 'total', 'actions']);
  });
});
