// ============================================================
// Dispatch — data model, statuses, and helpers.
//
// Dispatch is the FINAL stage of the Work Order journey:
//   Work Order → Acknowledgement → Technical Verification →
//   Casting/Fabrication → Assembly → QC → Packing → Dispatch
//
// Dispatch records are created from COMPLETED Packing Lists.
// The Work Order Number flows through the entire journey.
//
// Dispatch Number (DISP-YYYY-NNN) is the only new transaction
// number generated at Dispatch.
// ============================================================

/**
 * Dispatch status flow:
 *   Draft → Ready → Dispatched → In Transit → Delivered
 *
 * - Draft:       Record created, details not finalized.
 * - Ready:       Packing completed, all dispatch details ready.
 * - Dispatched:  Vehicle assigned, material shipped.
 * - In Transit:  Material currently in transportation.
 * - Delivered:   Customer received the material.
 */
export const DISPATCH_STATUSES = ['Draft', 'Ready', 'Dispatched', 'In Transit', 'Delivered'];

/** Status transitions allowed for a Dispatch record. */
export const DISPATCH_TRANSITIONS = {
  Draft: ['Ready'],
  Ready: ['Dispatched'],
  Dispatched: ['In Transit'],
  'In Transit': ['Delivered'],
  Delivered: [],
};

/** Is `nextStatus` a valid step forward from `status`? */
export const canTransitionDispatch = (status, nextStatus) =>
  (DISPATCH_TRANSITIONS[status] || []).includes(nextStatus);

/**
 * Packing status options shown in Dispatch.
 * Derived from the Work Order's packing records.
 */
export const PACKING_STATUS_OPTIONS = ['Not Packed', 'Partially Packed', 'Packed'];

/**
 * Generate the next Dispatch Number: DISP-2026-001, DISP-2026-002, …
 * The year is included for clarity; the sequence resets each year.
 */
export function nextDispatchNumber(records = []) {
  const currentYear = new Date().getFullYear();
  const prefix = `DISP-${currentYear}`;
  let max = 0;
  records.forEach((record) => {
    const match = new RegExp(`^DISP-${currentYear}-(\\d+)$`).exec(String(record.id || ''));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

/**
 * Derive packing status for a Work Order based on its packing records.
 *
 * - Not Packed:      No packing records with quantity > 0.
 * - Partially Packed: Some quantity packed but less than ordered.
 * - Packed:          Full quantity has been packed.
 */
export function derivePackingStatus(order, packingRecords) {
  if (!order) return 'Not Packed';
  const wo = order.workOrder;
  const orderedQty = Number(order.quantity) || 0;

  // Find all packing records that contain items for this Work Order
  const relevantPacking = packingRecords.filter((record) => {
    if (record.productionOrder === wo) return true;
    if (!Array.isArray(record.packingBoxes)) return false;
    return record.packingBoxes.some((box) =>
      Array.isArray(box.items) && box.items.some((item) => item.workOrder === wo)
    );
  });

  if (relevantPacking.length === 0) return 'Not Packed';

  // Calculate total packed quantity for this Work Order
  let totalPacked = 0;
  relevantPacking.forEach((record) => {
    // No box/item detail at all — the record came from the API, whose table
    // keeps only the header + packed total (packing_lists has no box/item
    // storage). Its stored packed quantity is authoritative.
    if (!Array.isArray(record.packingBoxes) || record.packingBoxes.length === 0) {
      if (record.productionOrder === wo) totalPacked += Number(record.packedQuantity) || 0;
      return;
    }

    // Sum the quantities of the items that reference this Work Order.
    let fromItems = 0;
    let hasItemDetail = false;
    record.packingBoxes.forEach((box) => {
      if (!Array.isArray(box.items)) return;
      box.items.forEach((item) => {
        hasItemDetail = true;
        if (item.workOrder === wo) fromItems += Number(item.quantity) || 0;
      });
    });
    if (hasItemDetail) {
      totalPacked += fromItems;
      return;
    }

    // Boxes but nothing inside them — same fallback: reading boxes alone
    // reported 0 for every saved Packing List, so the derived status was
    // permanently 'Not Packed', which blocked the Draft → Ready transition
    // (Ready requires a completed Packing).
    if (record.productionOrder === wo) totalPacked += Number(record.packedQuantity) || 0;
  });

  if (totalPacked <= 0) return 'Not Packed';
  if (orderedQty > 0 && totalPacked >= orderedQty) return 'Packed';
  return 'Partially Packed';
}

/**
 * Get package count for a Work Order from packing records.
 *
 * A package is a packing box. Boxes live only in the frontend document model —
 * the API stores the packing header alone — so a record read back from the API
 * carries no boxes and used to contribute 0 no matter how much it had packed.
 * Rows without box detail therefore fall back to counting the packing document
 * itself, which is the one package the application shows for such a list.
 */
export function packageCount(order, packingRecords) {
  if (!order) return 0;
  const wo = order.workOrder;
  let count = 0;
  packingRecords.forEach((record) => {
    const isForOrder = record.productionOrder === wo;
    if (!Array.isArray(record.packingBoxes) || record.packingBoxes.length === 0) {
      if (isForOrder) count++;
      return;
    }
    let matched = false;
    record.packingBoxes.forEach((box) => {
      if (Array.isArray(box.items) && box.items.some((item) => item.workOrder === wo)) {
        count++;
        matched = true;
      }
    });
    if (!matched && isForOrder) count++;
  });
  return count;
}

/**
 * Get packed quantity for a Work Order.
 */
export function packedQtyForOrder(order, packingRecords) {
  if (!order) return 0;
  const wo = order.workOrder;
  let totalPacked = 0;
  packingRecords.forEach((record) => {
    if (!Array.isArray(record.packingBoxes) || record.packingBoxes.length === 0) {
      // No boxes at all — fall back to the record's own packed total.
      if (record.productionOrder === wo) totalPacked += Number(record.packedQuantity) || 0;
      return;
    }
    let fromItems = 0;
    let hasItemDetail = false;
    record.packingBoxes.forEach((box) => {
      if (!Array.isArray(box.items)) return;
      box.items.forEach((item) => {
        hasItemDetail = true;
        if (item.workOrder === wo) fromItems += Number(item.quantity) || 0;
      });
    });
    if (hasItemDetail) {
      totalPacked += fromItems;
      return;
    }
    // No item detail — this record came from the API, so its stored packed
    // total is authoritative (same blind spot as derivePackingStatus).
    if (record.productionOrder === wo) totalPacked += Number(record.packedQuantity) || 0;
  });
  return totalPacked;
}

export const initialDispatchRecords = [];
