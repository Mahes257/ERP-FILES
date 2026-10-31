// ============================================================
// Packing service.
// Data access for packing records. Records reference Work Orders by
// stable id (stored in `productionOrder`, e.g. 'WO-0001').
//
// Records now use a hierarchical structure:
//   packingBoxes[] → items[]
// Legacy flat records are migrated on read.
// ============================================================
import { ok, fail } from './index';
import { ensureBoxes, packedQtyOf } from '../../data/packing';

const nextId = (records, prefix = 'PL') =>
  `${prefix}-${String(
    records.reduce((max, record) => {
      const n = Number(String(record.id).split('-').pop());
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  ).padStart(4, '0')}`;

/** Ensure all boxes have proper numbering. */
function renumberBoxes(boxes) {
  return (boxes || []).map((box, idx) => ({
    ...box,
    boxNumber: idx + 1,
    items: (box.items || []).map((item, i) => ({
      ...item,
      itemNo: i + 1,
    })),
  }));
}

export const packingService = {
  /** Read all packing records — migrates legacy on the fly. */
  getPackingRecords: (records) => (records || []).map(ensureBoxes),

  /**
   * Create a Packing List record. The Packing List Number (PL-0001…)
   * is AUTO-GENERATED — never typed by the user. Rejects duplicates.
   */
  createPackingRecord: (records, data) => {
    const boxes = renumberBoxes(data.packingBoxes || []);
    const record = {
      ...data,
      id: String(data.id ?? '').trim() || nextId(records),
      packingBoxes: boxes,
      // Keep flat items for backward compat with Dispatch/validation
      items: flattenBoxes(boxes),
      packedQuantity: packedQtyOf({ packingBoxes: boxes }),
      createdAt: new Date().toISOString(),
    };
    if (records.some((r) => r.id === record.id)) {
      return fail(records, `Packing List ${record.id} already exists.`);
    }
    return ok([record, ...records], record);
  },

  /** Update a Packing List record by stable id (merges over the record). */
  updatePackingRecord: (records, id, data) => {
    const existing = records.find((r) => r.id === id);
    if (!existing) return fail(records, `Packing List ${id} not found.`);
    const boxes = renumberBoxes(data.packingBoxes || existing.packingBoxes || []);
    const record = {
      ...existing,
      ...data,
      id: existing.id,
      packingBoxes: boxes,
      items: flattenBoxes(boxes),
      packedQuantity: packedQtyOf({ packingBoxes: boxes }),
      updatedAt: new Date().toISOString(),
    };
    return ok(
      records.map((r) => (r.id === id ? record : r)),
      record
    );
  },

  /** Delete a Packing List record by stable id. */
  deletePackingRecord: (records, id) => {
    if (!records.some((r) => r.id === id)) {
      return fail(records, `Packing List ${id} not found.`);
    }
    return ok(
      records.filter((r) => r.id !== id),
      { id }
    );
  },

  /**
   * Quantity-chain validation.
   */
  validatePacking: (data, acceptedQuantity) => {
    if (!data?.productionOrder) return 'Work Order is required.';
    const qty = Number(data?.quantity) || packedQtyOf(data);
    if (qty <= 0) return 'Quantity must be greater than zero.';
    if (Number(data?.packedQuantity) > Number(data?.quantity)) {
      return 'Packed quantity cannot exceed the order quantity.';
    }
    if (acceptedQuantity > 0 && Number(data?.packedQuantity) > acceptedQuantity) {
      return `Packed quantity cannot exceed the QC accepted quantity (${acceptedQuantity}).`;
    }
    return null;
  },
};

/** Flatten packingBoxes → flat items[] for backward compatibility (Dispatch, etc.). */
function flattenBoxes(boxes) {
  if (!Array.isArray(boxes)) return [];
  const result = [];
  let itemNo = 1;
  boxes.forEach((box) => {
    (box.items || []).forEach((item) => {
      result.push({
        ...item,
        itemNo: itemNo++,
        // Map new fields back to legacy names for Dispatch compat
        qty: Number(item.quantity) || 0,
        marksNos: item.marksNos || '',
        kindOfPackage: item.kindOfPackage || box.packageType || '',
        noOfPackages: item.noOfPackages || 0,
      });
    });
  });
  return result;
}
