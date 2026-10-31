/**
 * purchase/services/inventoryLedger.test.js
 * ------------------------------------------------------------------
 * Inventory transaction-ledger rules on top of logisticsService:
 *   • every movement records id/before/delta/after + context fields
 *   • receipts/issues/adjustments follow the shared sign rules
 *   • transfers are two-sided ledger entries that always net zero
 *   • invalid negative stock is refused (issues, negative adjustments)
 *   • transfer reversals reverse BOTH legs
 *   • inspection postings chain Before/After from the live ledger
 *   • balances/reconciliation/audit derive from the ledger only
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVENTORY_TYPE, logisticsService, inventoryStore, grnsStore, inspectionsStore, GRN_STATUS, INSPECTION_STATUS } from './logistics';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function resetStores() {
  localStorage.clear();
  inventoryStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
}

beforeEach(resetStores);

const SKU = 'RM-LEDGER-01';
const PRODUCT = 'Ledger bolt';
const WH_A = 'Plant A Store';
const WH_B = 'Plant B Store';

const receipt = (qty, { warehouse = WH_A } = {}) =>
  logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse, type: INVENTORY_TYPE.RECEIPT, quantity: qty, updatedBy: 'QA' });

describe('inventory ledger — receipts & issues', () => {
  it('records id / before / delta / after and context on a receipt', async () => {
    const entry = await receipt(5);
    expect(entry.id).toMatch(/^INV-\d{4}-\d{3}$/);
    expect(entry.sku).toBe(SKU);
    expect(entry.warehouse).toBe(WH_A);
    expect(entry.type).toBe(INVENTORY_TYPE.RECEIPT);
    expect(entry.before).toBe(0);
    expect(entry.delta).toBe(5);
    expect(entry.after).toBe(5);
    expect(entry.updatedBy).toBe('QA');
    expect(entry.createdAt).toBeTruthy();
  });

  it('chains the next receipt from the running on-hand', async () => {
    await receipt(5);
    const second = await receipt(3);
    expect(second.before).toBe(5);
    expect(second.after).toBe(8);
  });

  it('refuses an issue that would drive stock below zero', async () => {
    await expect(
      logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ISSUE, quantity: 5 })
    ).rejects.toThrow(/Insufficient stock/);
    expect(inventoryStore.all).toHaveLength(0);
  });

  it('allows an issue up to the available stock and then refuses over-issue', async () => {
    await receipt(5);
    const issue = await logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ISSUE, quantity: 3 });
    expect(issue.before).toBe(5);
    expect(issue.delta).toBe(-3);
    expect(issue.after).toBe(2);
    await expect(
      logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ISSUE, quantity: 5 })
    ).rejects.toThrow(/Insufficient stock/);
    const ledger = await logisticsService.getInventoryLedgerForItem({ sku: SKU, warehouse: WH_A });
    expect(ledger.onHand).toBe(2);
  });

  it('refuses a negative adjustment below zero unless explicitly allowed', async () => {
    await receipt(5);
    await expect(
      logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ADJUSTMENT, quantity: -8 })
    ).rejects.toThrow(/below zero/);
    const allowed = await logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ADJUSTMENT, quantity: -8, allowNegative: true });
    expect(allowed.after).toBe(-3);
  });
});

describe('inventory ledger — transfers', () => {
  it('moves stock between warehouses as two net-zero ledger entries', async () => {
    await receipt(10);
    const { source, destination } = await logisticsService.transferStock({ sku: SKU, product: PRODUCT, quantity: 4, fromWarehouse: WH_A, toWarehouse: WH_B, updatedBy: 'QA' });
    expect(source.type).toBe(INVENTORY_TYPE.TRANSFER);
    expect(source.direction).toBe('Out');
    expect(source.warehouse).toBe(WH_A);
    expect(source.delta).toBe(-4);
    expect(source.after).toBe(6);
    expect(destination.direction).toBe('In');
    expect(destination.warehouse).toBe(WH_B);
    expect(destination.delta).toBe(4);
    expect(destination.after).toBe(4);
    expect(source.counterpartId).toBe(destination.id);

    const ledgerA = await logisticsService.getInventoryLedgerForItem({ sku: SKU, warehouse: WH_A });
    const ledgerB = await logisticsService.getInventoryLedgerForItem({ sku: SKU, warehouse: WH_B });
    expect(ledgerA.onHand).toBe(6);
    expect(ledgerB.onHand).toBe(4);
    const audit = await logisticsService.auditInventoryLedger();
    expect(audit.ok).toBe(true);
  });

  it('refuses transfers from an empty warehouse and to the same place', async () => {
    await expect(
      logisticsService.transferStock({ sku: SKU, product: PRODUCT, quantity: 2, fromWarehouse: WH_A, toWarehouse: WH_B })
    ).rejects.toThrow(/Insufficient stock/);
    await receipt(10);
    await expect(
      logisticsService.transferStock({ sku: SKU, product: PRODUCT, quantity: 2, fromWarehouse: WH_A, toWarehouse: WH_A })
    ).rejects.toThrow(/must differ/);
  });

  it('reverses both legs of a transfer together', async () => {
    await receipt(10);
    const { source } = await logisticsService.transferStock({ sku: SKU, product: PRODUCT, quantity: 4, fromWarehouse: WH_A, toWarehouse: WH_B });
    const reversal = await logisticsService.reverseInventoryMovement(source.id, { updatedBy: 'QA' });
    expect(reversal.reversed).toHaveLength(2);
    const ledgerA = await logisticsService.getInventoryLedgerForItem({ sku: SKU, warehouse: WH_A });
    const ledgerB = await logisticsService.getInventoryLedgerForItem({ sku: SKU, warehouse: WH_B });
    expect(ledgerA.onHand).toBe(10);
    expect(ledgerB.onHand).toBe(0);
    await expect(logisticsService.reverseInventoryMovement(source.id)).rejects.toThrow(/already been reversed/);
  });

  it('records a reversed issue as an adjustment that returns stock', async () => {
    await receipt(10);
    const issue = await logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ISSUE, quantity: 4 });
    const reversal = await logisticsService.reverseInventoryMovement(issue.id);
    expect(reversal.delta).toBe(4);
    expect(reversal.reversalOf).toBe(issue.id);
    const ledger = await logisticsService.getInventoryLedgerForItem({ sku: SKU, warehouse: WH_A });
    expect(ledger.onHand).toBe(10);
  });
});

describe('inventory ledger — balances, reconciliation & audit', () => {
  it('derives balances and reconciliation variance from the ledger', async () => {
    await receipt(10);
    await logisticsService.transferStock({ sku: SKU, product: PRODUCT, quantity: 4, fromWarehouse: WH_A, toWarehouse: WH_B });
    const balances = await logisticsService.getInventoryBalances();
    const a = balances.find((row) => row.warehouse === WH_A && row.sku === SKU);
    const b = balances.find((row) => row.warehouse === WH_B && row.sku === SKU);
    expect(a.onHand).toBe(6);
    expect(b.onHand).toBe(4);

    const matched = await logisticsService.reconcileInventoryItem({ sku: SKU, product: PRODUCT, warehouse: WH_A, expectedQuantity: 6 });
    expect(matched.matched).toBe(true);
    expect(matched.variance).toBe(0);
    const countDiff = await logisticsService.reconcileInventoryItem({ sku: SKU, product: PRODUCT, warehouse: WH_A, expectedQuantity: 5 });
    expect(countDiff.matched).toBe(false);
    expect(countDiff.variance).toBe(-1); // physical count is 1 short
  });

  it('audit flags an entry whose arithmetic is broken', async () => {
    inventoryStore.persist([{ id: 'INV-2099-001', sku: SKU, product: PRODUCT, warehouse: WH_A, before: 10, delta: 5, after: 999, type: INVENTORY_TYPE.RECEIPT }]);
    const audit = await logisticsService.auditInventoryLedger();
    expect(audit.ok).toBe(false);
    expect(audit.errors.some((e) => e.reason.includes('after (999)'))).toBe(true);
  });

  it('stats count receipts, issues, adjustments and transfer pairs', async () => {
    await receipt(5);
    await logisticsService.addInventoryUpdate({ sku: SKU, product: PRODUCT, warehouse: WH_A, type: INVENTORY_TYPE.ADJUSTMENT, quantity: 2 });
    await logisticsService.transferStock({ sku: SKU, product: PRODUCT, quantity: 2, fromWarehouse: WH_A, toWarehouse: WH_B });
    const stats = await logisticsService.getInventoryStats();
    expect(stats.receipts).toBe(1);
    expect(stats.adjustments).toBe(1);
    expect(stats.transfers).toBe(1); // one completed transfer pair
  });
});

describe('inventory ledger — inspection posting chains from live stock', () => {
  it('posts accepted quantity with before = existing on-hand', async () => {
    await receipt(7); // Plant A already holds 7
    grnsStore.persist([{
      id: 'GRN-LEDGER-1', grnNo: 'GRN-LEDGER-1', poNo: 'PO-LEDGER-1',
      status: GRN_STATUS.RECEIVED, warehouse: WH_A,
      items: [{ product: PRODUCT, sku: SKU, qty: 3, received: 3 }]
    }]);
    inspectionsStore.persist([{
      id: 'QC-LEDGER-1', inspectionNo: 'QC-LEDGER-1', grnNo: 'GRN-LEDGER-1', poNo: 'PO-LEDGER-1',
      status: INSPECTION_STATUS.PASSED,
      items: [{ product: PRODUCT, sku: SKU, receivedQty: 3, inspectedQty: 3, acceptedQty: 3, rejectedQty: 0 }]
    }]);
    const posts = await logisticsService.postInventoryFromInspection('QC-LEDGER-1', { warehouse: WH_A, updatedBy: 'QA' });
    expect(posts).toHaveLength(1);
    expect(posts[0].type).toBe(INVENTORY_TYPE.RECEIPT);
    expect(posts[0].before).toBe(7);
    expect(posts[0].delta).toBe(3);
    expect(posts[0].after).toBe(10);
    /* Duplicate postings of the same GRN are refused. */
    await expect(logisticsService.postInventoryFromInspection('QC-LEDGER-1', { warehouse: WH_A })).rejects.toThrow(/already been posted|has already been posted/i);
    const audit = await logisticsService.auditInventoryLedger();
    expect(audit.ok).toBe(true);
  });
});
