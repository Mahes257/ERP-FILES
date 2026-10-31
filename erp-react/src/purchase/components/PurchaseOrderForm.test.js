/**
 * purchase/components/PurchaseOrderForm.test.js
 * ------------------------------------------------------------------
 * Unit tests for the PO form's line-item state mapping
 * (buildPoFormItems) — the layer that turns converted / stored item
 * rows into form rows.
 *
 * Regression: opening /purchase/orders/new from an approved NFA showed
 * a blank Line Items table with ₹0 totals. Converted item rows must
 * always win over the empty default row, and a stale blank row must
 * never be treated as real data.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { buildPoFormItems } from '../utils/poItems';

/* One converted item exactly as nfaService.buildPoPrefill derives it
   (product, description/spec, category, HSN, UOM, qty, rate, tax). */
const CONVERTED_ITEMS = [
  {
    itemCode: 'PR-2026-0042-01',
    product: 'Hydraulic hose DN19',
    specification: 'EN 853 2SN DN19',
    category: 'Spares',
    hsn: '4009',
    uom: 'Meter',
    qty: 200,
    rate: 285,
    gstRate: 18
  },
  {
    itemCode: 'PR-2026-0042-02',
    product: 'Quick coupling G1/2',
    specification: 'ISO 7241-1 B series',
    category: 'Spares',
    hsn: '7307',
    uom: 'Nos',
    qty: 40,
    rate: 430,
    gstRate: 18
  }
];

describe('PurchaseOrderForm — buildPoFormItems (conversion pre-fill rows)', () => {
  it('keeps every converted item row with its full data — no empty default row appended', () => {
    const rows = buildPoFormItems(CONVERTED_ITEMS);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      itemCode: 'PR-2026-0042-01',
      product: 'Hydraulic hose DN19',
      specification: 'EN 853 2SN DN19',
      category: 'Spares',
      hsn: '4009',
      uom: 'Meter',
      qty: 200,
      rate: 285,
      gstRate: 18
    });
    expect(rows[1]).toMatchObject({
      product: 'Quick coupling G1/2',
      qty: 40,
      rate: 430,
      gstRate: 18
    });
    /* No blank/placeholder row hides among the real rows. */
    expect(rows.some((row) => !String(row.product || '').trim())).toBe(false);
    expect(rows.every((row) => Number(row.qty) > 0 && Number(row.rate) > 0)).toBe(true);
  });

  it('adds exactly one empty default row only when there is no real data', () => {
    for (const empty of [undefined, [], [{}]]) {
      const rows = buildPoFormItems(empty);
      expect(rows).toHaveLength(1);
      expect(String(rows[0].product || '').trim()).toBe('');
      expect(rows[0].qty).toBe('');
      expect(rows[0].rate).toBe('');
    }
  });

  it('drops fully blank rows that sneak in with converted data', () => {
    const rows = buildPoFormItems([
      { product: '', qty: '', rate: '', gstRate: 18 },
      ...CONVERTED_ITEMS,
      { product: '', qty: '', rate: '', gstRate: 18 }
    ]);
    expect(rows).toHaveLength(2);
  });

  it('keeps a partially filled row (product present) — real data is never silently dropped', () => {
    const rows = buildPoFormItems([{ product: 'Spare widget', qty: '', rate: '', gstRate: 18 }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].product).toBe('Spare widget');
  });
});
