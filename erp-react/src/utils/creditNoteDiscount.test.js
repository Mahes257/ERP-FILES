/**
 * src/utils/creditNoteDiscount.test.js
 * ------------------------------------------------------------------
 * Behavioural half of the "no discount on a Credit Note" proof (the wiring half
 * lives in tests/credit-note-discount-removal.test.js and runs with
 * `npm run test:node`).
 *
 * A Credit Note has no discount CONTROL: no item Discount % column and no
 * header discount input exist, so a NEW note can never apply a discount —
 * a value arriving with its lines (source invoice/receipt, restored draft or
 * bulk upload) is normalized away.
 *
 * A LEGACY note is the opposite case: it may hold a genuine historical discount
 * that must survive opening, viewing and saving untouched. Its stored values are
 * preserved on load and re-submitted unchanged, so an unrelated edit cannot
 * silently flatten history.
 *
 * The shared engine itself is NOT weakened: a quotation / invoice / proforma
 * line still applies its own discount, and the header discount of those
 * documents still reduces their grand total.
 *
 * Run: npm run test:unit
 */

import { describe, it, expect } from 'vitest';
import {
  computeTotals,
  lineAmount,
  round2,
  serializeCreditNote,
  withoutDiscount
} from './salesHelpers';
import { defaultSalesItemsColumns, SALES_ITEM_ORDER } from './salesItemsColumns';

/** A NEW credit-note line: no discount — the shape the module now produces. */
const cnLine = (over = {}) => ({ qty: 2, rate: 100, discountPct: 0, gstRate: 18, ...over });

/**
 * Exactly what SalesTotals computes for the `creditNote` variant: the record's
 * OWN historical discounts (per-item sums + header %) reduce the taxable value,
 * and they are 0 for every new note because no control can set them.
 */
function creditNoteTotals(items, { charges = 0, headerDiscountPct = 0 } = {}) {
  const t = computeTotals(items, { discountPct: 0, charges, roundOffEnabled: false });
  const lineDisc = round2((t.lines || []).reduce((sum, l) => sum + l.discount, 0));
  const headerDisc = round2(Number(t.subTotal) * (Number(headerDiscountPct) / 100));
  const discount = round2(lineDisc + headerDisc);
  const taxable = round2(Number(t.subTotal) - discount);
  return { ...t, discount, taxable, grand: round2(taxable + t.taxTotal + t.charges) };
}

describe('Credit Note · columns', () => {
  it('ships no Discount % column', () => {
    expect(SALES_ITEM_ORDER.creditNote).not.toContain('discount');
    expect(defaultSalesItemsColumns({ variant: 'creditNote' }).map((c) => c.key)).toEqual([
      'sno', 'desc', 'hsn', 'qty', 'unit', 'rate', 'gst', 'taxable', 'total', 'actions'
    ]);
  });
});

describe('Credit Note · line and total math', () => {
  it('taxes a line on qty × rate, with no discount deduction', () => {
    expect(lineAmount(cnLine())).toEqual({
      qty: 2, rate: 100, total: 200, discount: 0, taxable: 200, tax: 36, amount: 236
    });
  });

  it('keeps sub total / GST / grand total free of any discount', () => {
    // 2 × 100 @18% plus 1 × 50 @18%, additional charges ₹25.
    const t = creditNoteTotals([cnLine(), cnLine({ qty: 1, rate: 50 })], { charges: 25 });
    expect(t.subTotal).toBe(250);
    expect(t.discount).toBe(0);
    expect(t.taxable).toBe(250);
    expect(t.taxTotal).toBe(45);
    expect(t.cgstTotal).toBe(22.5);
    expect(t.sgstTotal).toBe(22.5);
    expect(t.grand).toBe(320);
  });

  it('a NEW note has no hidden deduction: nothing is applied to it', () => {
    // A discount reaching a new record (source document / draft / bulk upload)
    // is normalized away before the pipeline sees it, so the note is priced at
    // qty × rate whatever it arrived with.
    const injected = [cnLine({ discountPct: 5 }), cnLine({ qty: 1, rate: 50, discountPct: 10 })];
    const t = creditNoteTotals(withoutDiscount(injected), { charges: 25 });
    expect([t.subTotal, t.discount, t.taxable, t.taxTotal, t.grand]).toEqual([250, 0, 250, 45, 320]);
  });

  it('a LEGACY note keeps the discount it was saved with (data preserved)', () => {
    // The same two lines as they were stored long ago: 5% and 10% item
    // discounts. They must NOT be normalized away on load — the note keeps its
    // historical taxable base (235) and grand total (302.30).
    const legacyLines = [cnLine({ discountPct: 5 }), cnLine({ qty: 1, rate: 50, discountPct: 10 })];
    const t = creditNoteTotals(legacyLines, { charges: 25 });
    expect([t.subTotal, t.discount, t.taxable, t.taxTotal, t.grand]).toEqual([250, 15, 235, 42.3, 302.3]);
    // A header discount on such a record is applied to its Sub Total the same
    // way it always was (taxable = Sub Total − all discounts).
    const withHeader = creditNoteTotals(legacyLines, { charges: 25, headerDiscountPct: 10 });
    expect([withHeader.discount, withHeader.taxable, withHeader.grand]).toEqual([40, 210, 277.3]);
  });

  it('zero stays zero: a 0% header discount is not treated as "no value"', () => {
    const t = creditNoteTotals([cnLine()], { headerDiscountPct: 0 });
    expect([t.discount, t.taxable, t.grand]).toEqual([0, 200, 236]);
  });

  it('normalizes any stray discount and leaves a clean list untouched', () => {
    const clean = [cnLine(), cnLine({ qty: 1, rate: 50 })];
    expect(withoutDiscount(clean)).toBe(clean);
    expect(withoutDiscount([cnLine({ discountPct: '5' }), cnLine()]).map((it) => it.discountPct)).toEqual([0, 0]);
    expect(withoutDiscount(null)).toEqual([]);
    expect(withoutDiscount(undefined)).toEqual([]);
  });
});

describe('Credit Note · save payload', () => {
  const form = {
    cnNo: 'CN-2026-000123',
    cnDate: '2026-10-15',
    status: 'Draft',
    source: 'inv',
    sourceRef: 'INV-2026-000456',
    sourceDate: '2026-10-01',
    taxType: 'CGST + SGST',
    clientName: 'Acme Industries',
    currency: 'INR',
    charges: 25,
    settlementMethod: 'Bank Transfer',
    reason: 'Rate Difference'
  };

  it('a NEW note sends no discount at all', () => {
    const payload = serializeCreditNote(form, [cnLine(), cnLine({ qty: 1, rate: 50 })]);
    expect(payload.discountPct).toBe(0);
    expect(payload.items.map((it) => it.discountPct)).toEqual([0, 0]);
    expect(payload.items.map((it) => [it.qty, it.rate, it.gstRate])).toEqual([[2, 100, 18], [1, 50, 18]]);
    expect(payload.charges).toBe(25);
  });

  it('a LEGACY note is re-submitted with exactly the discount it was loaded with', () => {
    const legacyForm = { ...form, discountPct: 7.5 };
    const legacyItems = [cnLine({ discountPct: 5 }), cnLine({ qty: 1, rate: 50, discountPct: 10 })];
    const payload = serializeCreditNote(legacyForm, legacyItems);
    expect(payload.discountPct).toBe(7.5);
    expect(payload.items.map((it) => it.discountPct)).toEqual([5, 10]);
    // Nothing else about those lines is rewritten.
    expect(payload.items.map((it) => [it.qty, it.rate, it.gstRate])).toEqual([[2, 100, 18], [1, 50, 18]]);
  });

  it('editing an unrelated field does not flatten the stored discount', () => {
    const legacyForm = { ...form, discountPct: 7.5, remarks: 'address typo fixed' };
    const legacyItems = [cnLine({ discountPct: 5 }), cnLine({ qty: 1, rate: 50, discountPct: 10 })];
    const payload = serializeCreditNote(legacyForm, legacyItems);
    expect(payload.discountPct).toBe(7.5);
    expect(payload.items.map((it) => it.discountPct)).toEqual([5, 10]);
    expect(payload.remarks).toBe('address typo fixed');
  });

  it('still submits every field a saved credit note depends on', () => {
    const payload = serializeCreditNote(form, [cnLine()]);
    [
      'cnNo', 'cnDate', 'status', 'source', 'sourceRef', 'sourceDate', 'settlementMethod',
      'reason', 'taxType', 'clientName', 'charges', 'currency'
    ].forEach((key) => expect(payload, key).toHaveProperty(key));
  });
});

describe('Other document types keep their discount behaviour', () => {
  it('a quotation / invoice line still applies its item discount', () => {
    expect(lineAmount({ qty: 2, rate: 100, discountPct: 10, gstRate: 18 })).toEqual({
      qty: 2, rate: 100, total: 200, discount: 20, taxable: 180, tax: 32.4, amount: 212.4
    });
  });

  it('a header discount still reduces those grand totals', () => {
    const t = computeTotals([{ qty: 2, rate: 100, discountPct: 0, gstRate: 18 }], { discountPct: 10, charges: 5 });
    expect([t.subTotal, t.discount, t.taxTotal, t.grandTotal]).toEqual([200, 20, 36, 221]);
  });

  it('no other variant gained or lost a discount column', () => {
    ['invoice', 'proforma', 'export', 'proformaExport', 'packingList', 'default'].forEach((variant) => {
      expect(SALES_ITEM_ORDER[variant]).not.toContain('discount');
    });
  });
});
