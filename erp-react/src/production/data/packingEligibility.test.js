/**
 * src/production/data/packingEligibility.test.js
 * ---------------------------------------------------------------------------
 * Production → Packing → Add Packing Item → Work Order dropdown.
 *
 * The dropdown lists the Work Orders that may still be packed:
 *
 *   completed QC sign-off  AND  remaining packable quantity (> 0)
 *
 * These tests pin that rule — and the two defects that used to hide genuinely
 * eligible Work Orders from it:
 *
 *   STAGE LABEL   QC is stored as 'QC' by the Quality module, as 'Quality' in
 *                 the Assembly workflow and as 'QC Inspection' in the generic
 *                 stage-entry vocabulary. Reading only the label derived from
 *                 the Work Order's own workflow reported "no completed QC".
 *   ITEM ROWS     QC sign-offs are stored per Work Order item; only the first
 *                 matching row used to be read, so multi-item Work Orders were
 *                 credited with the first item's accepted quantity only.
 *
 * Run: npx vitest run src/production/data/packingEligibility.test.js
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  QC_STAGES,
  isQcStage,
  qcAcceptedQty,
  alreadyPackedQty,
  eligibleWorkOrdersForPacking,
  packableQuantityFor
} from './packing';

const root = join(import.meta.dirname, '..', '..', '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const order = (overrides = {}) => ({
  workOrder: 'WO-0001',
  productionType: 'Fabrication',
  status: 'Approved',
  ...overrides
});

const entry = (overrides = {}) => ({
  workOrderId: 'WO-0001',
  workOrderItemId: '',
  stage: 'QC',
  status: 'Completed',
  inputQuantity: 10,
  outputQuantity: 10,
  rejectedQuantity: 0,
  ...overrides
});

const packingRecord = (overrides = {}) => ({
  id: 'PL-0001',
  productionOrder: 'WO-0001',
  quantity: 10,
  packedQuantity: 10,
  packingBoxes: [],
  ...overrides
});

describe('Packing eligibility · completed QC is recognised under every label', () => {
  it('lists the labels the existing screens write QC under', () => {
    expect(QC_STAGES).toEqual(expect.arrayContaining(['QC', 'Quality', 'QC Inspection']));
    expect(isQcStage('QC')).toBe(true);
    expect(isQcStage('Quality')).toBe(true);
    expect(isQcStage('QC Inspection')).toBe(true);
    expect(isQcStage(' QC ')).toBe(true);
    expect(isQcStage('Packing')).toBe(false);
    expect(isQcStage('')).toBe(false);
  });

  it("counts an Assembly Work Order whose QC was recorded as 'QC'", () => {
    const wo = order({ workOrder: 'WO-ASM', productionType: 'Assembly' });
    const entries = [entry({ workOrderId: 'WO-ASM', stage: 'QC', outputQuantity: 12 })];
    expect(qcAcceptedQty(wo, entries)).toBe(12);
  });

  it("counts an Assembly Work Order whose QC was recorded as 'Quality'", () => {
    const wo = order({ workOrder: 'WO-ASM', productionType: 'Assembly' });
    const entries = [entry({ workOrderId: 'WO-ASM', stage: 'Quality', outputQuantity: 7 })];
    expect(qcAcceptedQty(wo, entries)).toBe(7);
  });

  it("counts QC recorded through the generic stage entry as 'QC Inspection'", () => {
    const entries = [entry({ stage: 'QC Inspection', outputQuantity: 4 })];
    expect(qcAcceptedQty(order(), entries)).toBe(4);
  });

  it('ignores a QC row that is not completed', () => {
    const entries = [entry({ status: 'Pending' }), entry({ stage: 'Packing', status: 'Completed' })];
    expect(qcAcceptedQty(order(), entries)).toBe(0);
  });

  it('never reads another Work Order’s QC', () => {
    const entries = [entry({ workOrderId: 'WO-0002', outputQuantity: 9 })];
    expect(qcAcceptedQty(order(), entries)).toBe(0);
  });
});

describe('Packing eligibility · accepted quantity of multi-item Work Orders', () => {
  it('sums the QC sign-off of every item', () => {
    const entries = [
      entry({ workOrderItemId: '71', outputQuantity: 40 }),
      entry({ workOrderItemId: '72', outputQuantity: 25 })
    ];
    expect(qcAcceptedQty(order(), entries)).toBe(65);
  });

  it('does not add an order-level total on top of the item rows', () => {
    const entries = [
      entry({ workOrderItemId: '', outputQuantity: 40 }),
      entry({ workOrderItemId: '71', outputQuantity: 40 })
    ];
    expect(qcAcceptedQty(order(), entries)).toBe(40);
  });

  it('uses the latest row for an item instead of adding snapshots', () => {
    const entries = [
      entry({ workOrderItemId: '71', outputQuantity: 40 }),
      entry({ workOrderItemId: '71', outputQuantity: 40 }),
      entry({ workOrderItemId: '72', outputQuantity: 5 })
    ];
    expect(qcAcceptedQty(order(), entries)).toBe(45);
  });

  it('falls back to the order-level row when the Work Order has no item breakdown', () => {
    expect(qcAcceptedQty(order(), [entry({ outputQuantity: 6 })])).toBe(6);
  });
});

describe('Packing eligibility · the dropdown rule', () => {
  it('lists a QC-cleared Work Order that still has quantity left', () => {
    const orders = [order()];
    const entries = [entry({ outputQuantity: 100 })];
    expect(eligibleWorkOrdersForPacking(orders, entries, []).map((o) => o.workOrder)).toEqual(['WO-0001']);
  });

  it('keeps a fully packed Work Order out', () => {
    const orders = [order()];
    const entries = [entry({ outputQuantity: 6 })];
    const records = [packingRecord({ packedQuantity: 6 })];
    expect(eligibleWorkOrdersForPacking(orders, entries, records)).toEqual([]);
    expect(alreadyPackedQty(records, 'WO-0001')).toBe(6);
    expect(packableQuantityFor(orders[0], entries, {}, records)).toBe(0);
  });

  it('keeps a partially packed Work Order in, with the remaining quantity', () => {
    const orders = [order()];
    const entries = [entry({ outputQuantity: 100 })];
    const records = [packingRecord({ packedQuantity: 60 })];
    expect(eligibleWorkOrdersForPacking(orders, entries, records)).toHaveLength(1);
    expect(packableQuantityFor(orders[0], entries, {}, records)).toBe(40);
  });

  it('keeps Work Orders with no completed QC out, however much they produced', () => {
    const orders = [
      order({ workOrder: 'WO-0001' }),
      order({ workOrder: 'WO-0002', productionType: 'Casting' })
    ];
    const entries = [entry({ workOrderId: 'WO-0001', status: 'In Progress', outputQuantity: 10 })];
    expect(eligibleWorkOrdersForPacking(orders, entries, [])).toEqual([]);
  });

  it('excludes the packing list being edited from its own packed quantity', () => {
    const records = [packingRecord({ id: 'PL-0007', packedQuantity: 10 })];
    expect(alreadyPackedQty(records, 'WO-0001', 'PL-0007')).toBe(0);
  });
});

describe('Packing eligibility · the modal re-reads its sources', () => {
  it('opening the Add Packing Item modal refreshes orders, QC entries and packing lists', () => {
    const form = read('src/production/components/production/packing/PackingListForm.jsx');
    const addBlock = form.slice(form.indexOf('const addItemToBox'), form.indexOf('const editItemInBox'));
    expect(addBlock).toMatch(/onRefreshSources\?\.\(\)/);
    expect(addBlock).toMatch(/setItemModal\(/);

    const page = read('src/production/pages/Packing.jsx');
    expect(page).toMatch(/refreshOrders\?\.\(\)/);
    expect(page).toMatch(/loadAllEntries\?\.\(\)/);
    expect(page).toMatch(/refresh\?\.\(\)/);
    expect(page).toMatch(/onRefreshSources=\{refreshPackingSources\}/);
  });
});
