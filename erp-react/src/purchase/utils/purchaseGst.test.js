/**
 * purchase/utils/purchaseGst.test.js
 * ------------------------------------------------------------------
 * GST TYPE BEHAVIOR — Purchase Requisition tax calculation.
 *
 * Verifies that `calcDocumentTotals` honours the form's GST Type:
 *   Inter-State  → IGST only (CGST/SGST = 0)
 *   Intra-State  → CGST + SGST split (IGST = 0)
 *   Nil Rated / Exempt / Composite → zero output GST
 * per-line rates, non-taxable charges, round-off and the
 * edit-mode / reload flow through the mock requisition service.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { calcDocumentTotals, gstTaxMode, normalizePurchaseRequest, round2 } from './purchase';
import { mockRequisitionService } from '../services/requisition';

const INTER = 'Inter-State (IGST)';
const INTRA = 'Intra-State (CGST+SGST)';
const NIL = 'Nil Rated';
const EXEMPT = 'Exempt';
const COMPOSITE = 'Composite';

/** One line of ₹10,000 @ 18%. */
const singleItem = [{ product: 'A', qty: 1, rate: 10000, gstRate: 18 }];

describe('GST tax mode resolution', () => {
  it('maps each GST type to the correct tax mode', () => {
    expect(gstTaxMode(INTER)).toBe('inter');
    expect(gstTaxMode(INTRA)).toBe('intra');
    expect(gstTaxMode(NIL)).toBe('none');
    expect(gstTaxMode(EXEMPT)).toBe('none');
    expect(gstTaxMode(COMPOSITE)).toBe('none');
    /* Legacy documents without a GST type keep the CGST/SGST split. */
    expect(gstTaxMode('')).toBe('intra');
    expect(gstTaxMode(undefined)).toBe('intra');
  });
});

describe('GST type — single item calculations', () => {
  it('1. Inter-State calculates IGST only (CGST/SGST = 0)', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, INTER);
    expect(totals.taxable).toBe(10000);
    expect(totals.igst).toBe(1800);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.gstTotal).toBe(1800);
    expect(totals.total).toBe(11800);
    expect(totals.roundedTotal).toBe(11800);
    /* Per-line carries the IGST component too (used by item tables). */
    expect(totals.lines[0]).toMatchObject({ taxable: 10000, igst: 1800, cgst: 0, sgst: 0, total: 11800 });
  });

  it('2. Intra-State calculates CGST + SGST (IGST = 0)', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, INTRA);
    expect(totals.taxable).toBe(10000);
    expect(totals.cgst).toBe(900);
    expect(totals.sgst).toBe(900);
    expect(totals.igst).toBe(0);
    expect(totals.gstTotal).toBe(1800);
    expect(totals.total).toBe(11800);
  });

  it('3. switching IGST → Intra-State recalculates with no stale values', () => {
    const inter = calcDocumentTotals(singleItem, 0, 0, INTER);
    const intra = calcDocumentTotals(singleItem, 0, 0, INTRA);
    expect(intra.igst).toBe(0); // IGST must not linger
    expect(intra.cgst).toBe(900);
    expect(intra.sgst).toBe(900);
    expect(intra.gstTotal).toBe(inter.gstTotal); // ₹1,800 both ways
    expect(intra.roundedTotal).toBe(inter.roundedTotal); // grand total unchanged
  });

  it('4. switching Intra-State → IGST recalculates with no stale values', () => {
    const intra = calcDocumentTotals(singleItem, 0, 0, INTRA);
    const inter = calcDocumentTotals(singleItem, 0, 0, INTER);
    expect(inter.cgst).toBe(0); // CGST must not linger
    expect(inter.sgst).toBe(0); // SGST must not linger
    expect(inter.igst).toBe(1800);
    expect(inter.gstTotal).toBe(intra.gstTotal);
    expect(inter.roundedTotal).toBe(intra.roundedTotal);
  });

  it('5. Nil Rated gives zero GST everywhere', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, NIL);
    expect(totals.igst).toBe(0);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.gstTotal).toBe(0);
    expect(totals.total).toBe(10000);
    expect(totals.roundedTotal).toBe(10000);
  });

  it('6. Exempt gives zero GST everywhere', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, EXEMPT);
    expect(totals.igst).toBe(0);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.gstTotal).toBe(0);
    expect(totals.total).toBe(10000);
  });

  it('7. Composite gives zero output GST (project rule — no alternate calc defined)', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, COMPOSITE);
    expect(totals.igst).toBe(0);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
    expect(totals.gstTotal).toBe(0);
    expect(totals.total).toBe(10000);
  });
});

describe('GST type — multiple items, per-line rates', () => {
  const twoItems = [
    { product: 'A', qty: 1, rate: 1000, gstRate: 18 },
    { product: 'B', qty: 1, rate: 2000, gstRate: 5 }
  ];

  it('8/9. each item is taxed at its own rate, independently', () => {
    /* Inter-State: Item A IGST = 180, Item B IGST = 100 → 280. */
    const inter = calcDocumentTotals(twoItems, 0, 0, INTER);
    expect(inter.lines[0]).toMatchObject({ taxable: 1000, igst: 180, total: 1180 });
    expect(inter.lines[1]).toMatchObject({ taxable: 2000, igst: 100, total: 2100 });
    expect(inter.igst).toBe(280);
    expect(inter.gstTotal).toBe(280);

    /* Intra-State: Item A CGST 90 + SGST 90; Item B CGST 50 + SGST 50. */
    const intra = calcDocumentTotals(twoItems, 0, 0, INTRA);
    expect(intra.lines[0]).toMatchObject({ cgst: 90, sgst: 90, igst: 0 });
    expect(intra.lines[1]).toMatchObject({ cgst: 50, sgst: 50, igst: 0 });
    expect(intra.cgst).toBe(140);
    expect(intra.sgst).toBe(140);
    expect(intra.igst).toBe(0);
    expect(intra.gstTotal).toBe(280);

    /* Same total GST either way — only the split differs. */
    expect(intra.gstTotal).toBe(inter.gstTotal);
    expect(intra.roundedTotal).toBe(inter.roundedTotal);
  });

  it('keeps totals mathematically consistent (taxable + GST = line/order totals)', () => {
    const inter = calcDocumentTotals(twoItems, 0, 0, INTER);
    expect(inter.taxable).toBe(3000);
    expect(inter.lines.reduce((sum, l) => sum + l.total, 0)).toBeCloseTo(inter.total - inter.charges, 5);
    expect(inter.total).toBe(3280);
  });
});

describe('Charges and round off', () => {
  it('10. non-taxable charges are NOT taxed and are added after GST', () => {
    /* ₹10,000 taxable @ 18% inter-state + ₹60 charges → 10,000 + 1,800 + 60. */
    const totals = calcDocumentTotals(singleItem, 0, 60, INTER);
    expect(totals.igst).toBe(1800); // 18% of 10,000 — never 18% of 10,060
    expect(totals.charges).toBe(60);
    expect(totals.total).toBe(11860);
    expect(totals.roundedTotal).toBe(11860);

    const intra = calcDocumentTotals(singleItem, 0, 60, INTRA);
    expect(intra.cgst + intra.sgst).toBe(1800);
    expect(intra.total).toBe(11860);
  });

  it('11. round off is recalculated from the current total on every mode change', () => {
    const make = (mode) => calcDocumentTotals([{ product: 'A', qty: 3, rate: 1000.33, gstRate: 18 }], 0, 0, mode);

    const inter = make(INTER);
    const intra = make(INTRA);

    /* Both derive roundOff from their own total — nothing stale.
       roundOff is stored at 2dp, so compare against the rounded
       difference (the raw subtraction carries float noise). */
    expect(inter.roundOff).toBe(round2(inter.roundedTotal - inter.total));
    expect(intra.roundOff).toBe(round2(intra.roundedTotal - intra.total));
    expect(Math.abs(inter.roundOff)).toBeLessThan(1);
    expect(Math.abs(intra.roundOff)).toBeLessThan(1);

    /* Identical taxable base → identical rounded grand total and round off. */
    expect(inter.total).toBe(intra.total);
    expect(inter.roundOff).toBe(intra.roundOff);
  });
});

describe('GST validation invariants', () => {
  it('Inter-State: IGST > 0, CGST = 0, SGST = 0', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, INTER);
    expect(totals.igst).toBeGreaterThan(0);
    expect(totals.cgst).toBe(0);
    expect(totals.sgst).toBe(0);
  });

  it('Intra-State: IGST = 0 and CGST + SGST = GST total', () => {
    const totals = calcDocumentTotals(singleItem, 0, 0, INTRA);
    expect(totals.igst).toBe(0);
    expect(totals.cgst + totals.sgst).toBe(totals.gstTotal);
  });

  it('Nil Rated / Exempt / Composite: every GST component is 0', () => {
    [NIL, EXEMPT, COMPOSITE].forEach((gstType) => {
      const totals = calcDocumentTotals(singleItem, 0, 0, gstType);
      expect(totals.igst).toBe(0);
      expect(totals.cgst).toBe(0);
      expect(totals.sgst).toBe(0);
      expect(totals.gstTotal).toBe(0);
    });
  });
});

describe('normalizePurchaseRequest (stored totals follow gstType)', () => {
  it('13. computes totals from the raw gstType — no stale tax values', () => {
    const inter = normalizePurchaseRequest({ gstType: INTER, items: singleItem });
    expect(inter.totals.igst).toBe(1800);
    expect(inter.totals.cgst).toBe(0);
    expect(inter.totals.sgst).toBe(0);

    const intra = normalizePurchaseRequest({ gstType: INTRA, items: singleItem });
    expect(intra.totals.igst).toBe(0);
    expect(intra.totals.cgst).toBe(900);
    expect(intra.totals.sgst).toBe(900);

    const nil = normalizePurchaseRequest({ gstType: NIL, items: singleItem });
    expect(nil.totals.igst).toBe(0);
    expect(nil.totals.cgst).toBe(0);
    expect(nil.totals.sgst).toBe(0);
    expect(nil.totals.total).toBe(10000);
  });
});

describe('12. edit mode and reload — mock requisition service', () => {
  const payload = {
    title: 'GST edit-mode test',
    department: 'Production',
    requester: 'Rahul Sharma',
    currency: 'INR',
    gstType: INTER,
    items: [{ product: 'A', qty: 1, rate: 10000, gstRate: 18 }]
  };

  it('creates with IGST, edits to Intra-State, reloads, then switches back', async () => {
    const created = await mockRequisitionService.createRequisition(payload);
    expect(created.gstType).toBe(INTER);
    expect(created.totals.igst).toBe(1800);
    expect(created.totals.cgst).toBe(0);
    expect(created.totals.sgst).toBe(0);
    expect(created.totals.roundedTotal).toBe(11800);

    /* Edit: IGST → CGST+SGST, then save. */
    const edited = await mockRequisitionService.updateRequisition(created.id, { gstType: INTRA });
    expect(edited.gstType).toBe(INTRA);
    expect(edited.totals.igst).toBe(0); // IGST cleared on save
    expect(edited.totals.cgst).toBe(900);
    expect(edited.totals.sgst).toBe(900);
    expect(edited.totals.roundedTotal).toBe(11800);

    /* Reload — the persisted record preserves GST type + recalculated totals. */
    const reloaded = await mockRequisitionService.getRequisition(created.id);
    expect(reloaded.gstType).toBe(INTRA);
    expect(reloaded.totals.igst).toBe(0);
    expect(reloaded.totals.cgst).toBe(900);
    expect(reloaded.totals.sgst).toBe(900);
    expect(reloaded.totals.roundedTotal).toBe(11800);

    /* Switch back: CGST+SGST → IGST, save and reload again. */
    const back = await mockRequisitionService.updateRequisition(created.id, { gstType: INTER });
    expect(back.totals.igst).toBe(1800);
    expect(back.totals.cgst).toBe(0); // CGST cleared
    expect(back.totals.sgst).toBe(0); // SGST cleared

    const reloadedBack = await mockRequisitionService.getRequisition(created.id);
    expect(reloadedBack.gstType).toBe(INTER);
    expect(reloadedBack.totals.igst).toBe(1800);
    expect(reloadedBack.totals.cgst).toBe(0);
    expect(reloadedBack.totals.sgst).toBe(0);
    expect(reloadedBack.totals.roundedTotal).toBe(11800);
  });
});
