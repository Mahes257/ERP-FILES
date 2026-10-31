// ============================================================
// Identifier migration — Work Order Number is the ONLY primary
// production identifier.
//
// Legacy orders stored TWO identifiers: a `productionOrder`
// (PO-0001…) and a `workOrder` (WO-1001…), and every process
// record (shop floor jobs, quality inspections, packing records,
// dispatch records, stage entries) referenced the PO number.
//
// This migration runs synchronously inside
// ProductionOrdersProvider, before the other stores load:
//
//   1. Renumbers legacy orders to WO-0001, WO-0002, … in their
//      existing order (nothing is deleted or duplicated).
//   2. Drops the `productionOrder` field from orders entirely —
//      `workOrder` is now the id AND the display identifier.
//   3. Rewrites every process record / stage entry reference from
//      the old PO number to the new Work Order number.
//   4. Cleans stale legacy identifier fields (`po`, `poNumber`,
//      `productionOrderNumber`, old `workOrder`) from process
//      records — `productionOrder` is the single canonical link
//      to the Work Order, and `workOrderId` for stage entries.
//
// After the migration the app is WO-only; running it again only
// performs the (idempotent) cleanup pass.
// ============================================================
import { loadData, saveData } from '../utils/storage';

/** localStorage keys whose records reference orders by `productionOrder`. */
const RECORD_KEYS = ['casting', 'fabrication', 'machineShop', 'assembly', 'quality', 'packing', 'dispatch'];

// ============================================================
// Multi-item migration — Work Orders now contain an `items` array.
// Legacy orders had a single product/quantity/productionType at
// the top level. This migration wraps them into a single item.
// ============================================================
// ============================================================
// Stale casting job cleanup — remove casting jobs that reference
// Work Orders which no longer exist. This prevents stale demo/
// legacy data from showing phantom counts on the Casting page.
// ============================================================
export function runCastingCleanup() {
  const orders = loadData('orders', []);
  const validWOs = new Set(orders.map((o) => o.workOrder));
  const casting = loadData('casting', []);
  const cleaned = casting.filter((job) => validWOs.has(job.productionOrder));
  if (cleaned.length !== casting.length) {
    saveData('casting', cleaned);
    return true;
  }
  return false;
}

export function runMultiItemMigration() {
  const orders = loadData('orders', []);
  let changed = false;
  const migrated = orders.map((order) => {
    // Already migrated — has items array
    if (order.items && Array.isArray(order.items) && order.items.length > 0) return order;
    changed = true;
    const itemId = `${order.workOrder || order.id}-item-1`;
    return {
      ...order,
      items: [
        {
          id: itemId,
          productName: order.product || '',
          productCode: order.productCode || '',
          quantity: Number(order.quantity) || 0,
          producedQty: Number(order.producedQty) || 0,
          rejectedQty: Number(order.rejectedQty) || 0,
          productionType: order.productionType || 'Casting',
          department: order.department || 'Casting',
          currentStage: order.currentStage || '',
          status: order.status || 'Pending',
          batchNumber: order.batchNumber || '',
          patternNumber: order.patternNumber || '',
          drawingNumber: order.drawingNumber || '',
          unit: order.unit || '',
        },
      ],
    };
  });
  if (changed) saveData('orders', migrated);
  return changed;
}

export function runIdentifierMigration() {
  const orders = loadData('orders', []);
  const legacy = orders.filter((order) => order.productionOrder);

  if (legacy.length > 0) {
    // Map old PO (and old WO) → new sequential Work Order number.
    const remap = {};
    let counter = 0;
    const migratedOrders = orders.map((order) => {
      if (!order.productionOrder) return order;
      counter += 1;
      const newWO = `WO-${String(counter).padStart(4, '0')}`;
      remap[order.productionOrder] = newWO;
      remap[order.workOrder] = newWO;
      const { productionOrder, ...rest } = order;
      return { ...rest, id: newWO, workOrder: newWO };
    });
    saveData('orders', migratedOrders);

    // Process records referenced the PO number — rewrite to the WO.
    RECORD_KEYS.forEach((key) => {
      const records = loadData(key, []);
      if (!records.length) return;
      saveData(
        key,
        records.map((record) => {
          const ref = record.productionOrder;
          return ref && remap[ref] ? { ...record, productionOrder: remap[ref] } : record;
        })
      );
    });

    // Stage entries reference the identifier as productionOrderId —
    // rename the field to workOrderId and rewrite the value.
    const entries = loadData('entries', []);
    if (entries.length) {
      saveData(
        'entries',
        entries.map((entry) => {
          const ref = entry.productionOrderId;
          if (ref && remap[ref]) {
            const { productionOrderId, ...rest } = entry;
            return { ...rest, workOrderId: remap[ref] };
          }
          return entry;
        })
      );
    }
  }

  // Idempotent cleanup — always strip stale legacy identifier fields.
  RECORD_KEYS.forEach((key) => {
    const records = loadData(key, []);
    if (!records.length) return;
    let changed = false;
    const cleaned = records.map((record) => {
      const { workOrder: _wo, po: _po, poNumber: _poN, productionOrderNumber: _pon, ...rest } = record;
      if (Object.keys(rest).length !== Object.keys(record).length) changed = true;
      return rest;
    });
    if (changed) saveData(key, cleaned);
  });

  const entries = loadData('entries', []);
  if (entries.length) {
    let changed = false;
    const cleaned = entries.map((entry) => {
      const { po: _po, workOrder: _wo, productionOrder: _pon, productionOrderNumber: _poN, ...rest } = entry;
      if (Object.keys(rest).length !== Object.keys(entry).length) changed = true;
      return rest;
    });
    if (changed) saveData('entries', cleaned);
  }

  return legacy.length > 0;
}
