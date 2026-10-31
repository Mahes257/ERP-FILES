// ============================================================
// Packing — Packing List data + helpers.
//
// Packing Lists support a HIERARCHICAL structure:
//
//   PackingList
//   ├── Header Details (exporter, buyer, shipping info)
//   └── packingBoxes[]
//         ├── boxNumber, packageType, length, width, height
//         ├── packingWeight (weight of wooden box / packing material)
//         └── items[]
//               ├── description, partNumber, manufacturer
//               ├── countryOfOrigin, hsCode
//               ├── quantity, unit
//               └── netWeight (total net weight for item)
//
// WEIGHT CALCULATION (automatic):
//   Item Net Weight = Quantity × Unit Net Weight
//   Box Net Weight  = SUM(Item Net Weights in box)
//   Box Gross Weight = Box Net Weight + Packing Weight
//   Total Net Weight = SUM(Box Net Weights)
//   Total Gross Weight = SUM(Box Gross Weights)
//
// CRITICAL: Gross Weight is always CALCULATED, never manually entered.
// Packing Weight is the user-entered weight of the box/packing material.
//
// Legacy flat records (items[] at the top level with no packingBoxes)
// are migrated on read so old data keeps working.
//
// Records are persisted in localStorage by the PackingContext.
// ============================================================
import { ENTRY_WORKFLOWS } from './entries';

/** Simple Packing List statuses. */
/* The statuses a Packing List can actually hold — these mirror the backend
   PackingStatus enum. 'Dispatched' belongs to the Dispatch module and was
   offered here as a filter option the backend rejects (PackingStatus.valueOf
   would throw on it), so it is deliberately not part of this list. */
export const PACKING_STATUSES = ['Pending', 'In Progress', 'Completed', 'Ready for Dispatch'];

/** Common package kinds (suggestions — never a fixed list). */
export const PACKAGE_KINDS = ['WOODEN BOX', 'PALLET', 'CARTON', 'CRATE'];

/** Default declaration text (editable per list). */
export const DEFAULT_DECLARATION =
  'We declare that this Packing List shows the actual weight and details of the goods described and that all particulars are true and correct.';

/** Next automatic Packing List number: PL-0001, PL-0002, … */
export function nextPackingListNumber(records = []) {
  let max = 0;
  records.forEach((record) => {
    const match = /^PL-(\d+)$/.exec(String(record.id || record.packingListNumber || ''));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `PL-${String(max + 1).padStart(4, '0')}`;
}

// ----------------------------------------------------------------
// Legacy migration: flat items[] → packingBoxes[{items}]
// ----------------------------------------------------------------

/** Create a blank packing box object. */
export function createEmptyBox(boxNumber = 1) {
  return {
    id: `box-${Date.now()}-${boxNumber}`,
    boxNumber,
    packageType: 'WOODEN BOX',
    length: '',
    width: '',
    height: '',
    packingWeight: 0, // weight of box/packing material — user-entered
    items: [],
  };
}

/** Create a blank packing item object. */
export function createEmptyItem(itemNo = 1) {
  return {
    id: `item-${Date.now()}-${itemNo}`,
    itemNo,
    workOrder: '', // linked Production Work Order
    description: '',
    partNumber: '',
    manufacturer: '',
    countryOfOrigin: '',
    hsCode: '',
    quantity: 0,
    unit: 'Pcs',
    unitNetWeight: 0, // per-unit net weight
    netWeight: 0, // total net weight = quantity × unitNetWeight (auto-calculated)
    qcAcceptedQty: 0, // QC accepted quantity (read-only, from Work Order)
    alreadyPackedQty: 0, // already packed for this Work Order
    availableQty: 0, // available = qcAccepted - alreadyPacked
  };
}

/**
 * Prefill values for the Packing List CREATE form from a saved CPO.
 *
 * Used by CPO → Generate Packing List, which opens the existing
 * `/production/packing/new` form with `?so=<cpo id>`. The form owns the fields
 * below, so only those are returned, and only when the CPO really holds a
 * value: a missing source value must never overwrite the form's own default
 * (today's packing date, INDIA origin, the remembered exporter profile…).
 *
 * Packing-specific data (boxes, package types, dimensions, weights, the item →
 * Work Order allocation) has no CPO source and is deliberately left to the
 * form's existing manual workflow. Each prefilled item keeps an EMPTY Work
 * Order because eligibility for packing depends on that Work Order's QC
 * sign-off, which the form's own picker resolves.
 *
 * The saved Packing List keeps `salesOrderNumber` / `customer` / `product` /
 * `unit` as its source reference — those are the fields the packing_lists
 * table actually stores.
 */
export function packingPrefillFromCpo(cpo) {
  if (!cpo || typeof cpo !== 'object') return null;
  const items = Array.isArray(cpo.items) ? cpo.items : [];
  const text = (value) => (value == null ? '' : String(value).trim());
  const prefill = {};
  const put = (key, value) => {
    const cleaned = text(value);
    if (cleaned) prefill[key] = cleaned;
  };

  // Source reference + summary the packing list persists.
  if (cpo.id != null && text(cpo.id)) prefill.salesOrderId = String(cpo.id);
  put('salesOrderNumber', cpo.soNo);
  put('customer', cpo.clientName);
  put('product', items[0]?.description);
  put('unit', items[0]?.uom ?? items[0]?.unit);

  // Buyer / exporter block.
  put('buyerName', cpo.clientName);
  put('buyerAddress', cpo.shippingAddress || cpo.billingAddress);
  put('gstin', cpo.gstin);
  put('pan', cpo.pan);

  // Invoice / shipping block — values that exist on the CPO itself.
  put('invoiceCurrency', cpo.currency);
  if (cpo.grandTotal != null && text(cpo.grandTotal)) prefill.invoiceAmount = cpo.grandTotal;
  put('paymentTerms', cpo.paymentTerms);
  put('commodity', items[0]?.description);
  put('hsCode', items[0]?.hsn);
  put('drawingNumber', items[0]?.drawingNo);

  // One box, one row per CPO line item (descriptions/quantities/units only).
  const boxItems = items
    .map((item, index) => {
      const description = text(item.description);
      if (!description) return null;
      return {
        ...createEmptyItem(index + 1),
        description,
        partNumber: text(item.sku),
        hsCode: text(item.hsn),
        quantity: Number(item.qty) || 0,
        unit: text(item.uom ?? item.unit) || prefill.unit || 'Pcs',
      };
    })
    .filter(Boolean);

  if (boxItems.length) {
    prefill.packingBoxes = [{ ...createEmptyBox(1), items: boxItems }];
  }

  return prefill;
}

/**
 * Migrate a legacy flat packing record to the new hierarchical structure.
 * If the record already has packingBoxes, return it unchanged.
 */
export function migrateRecord(record) {
  if (!record) return record;
  if (Array.isArray(record.packingBoxes) && record.packingBoxes.length > 0) {
    // Ensure migrated records have packingWeight and item netWeight
    return {
      ...record,
      packingBoxes: record.packingBoxes.map((box) => {
        // Backward compat: if box has old netWeight/grossWeight but no packingWeight
        const packingWeight = box.packingWeight !== undefined
          ? box.packingWeight
          : Math.max(0, (Number(box.grossWeight) || 0) - (Number(box.netWeight) || 0));
        return {
          ...box,
          packingWeight,
          items: (box.items || []).map((item) => ({
            ...item,
            netWeight: item.netWeight !== undefined ? item.netWeight : (Number(item.unitNetWeight) || 0) * (Number(item.quantity) || 0),
          })),
        };
      }),
    };
  }

  // Legacy: flat items[] with no packingBoxes
  const legacyItems = Array.isArray(record.items) ? record.items : [];
  if (legacyItems.length === 0 && !record.product) return record;

  // Calculate net/gross from legacy items
  const totalNet = legacyItems.reduce((s, i) => s + (Number(i.netWeight) || 0), 0);
  const totalGross = legacyItems.reduce((s, i) => s + (Number(i.grossWeight) || 0), 0);

  const box = {
    id: `box-migrated-${record.id || Date.now()}`,
    boxNumber: 1,
    packageType: legacyItems[0]?.kindOfPackage || 'WOODEN BOX',
    length: '',
    width: '',
    height: '',
    packingWeight: Math.max(0, totalGross - totalNet),
    items: legacyItems.map((item, idx) => ({
      id: item.id || `item-migrated-${idx + 1}`,
      itemNo: idx + 1,
      description: item.description || record.product || '',
      partNumber: '',
      manufacturer: '',
      countryOfOrigin: '',
      hsCode: '',
      quantity: Number(item.qty) || Number(item.quantity) || 0,
      unit: item.unit || 'Pcs',
      netWeight: 0,
      marksNos: item.marksNos || '',
      kindOfPackage: item.kindOfPackage || '',
      noOfPackages: Number(item.noOfPackages) || 0,
    })),
  };

  return { ...record, packingBoxes: [box] };
}

/**
 * Ensure a record has a packingBoxes array (migrate legacy if needed).
 * Returns the record with packingBoxes always present.
 */
export function ensureBoxes(record) {
  if (!record) return record;
  if (Array.isArray(record.packingBoxes)) return record;
  return migrateRecord(record);
}

// ----------------------------------------------------------------
// Box-level calculations
// ----------------------------------------------------------------

/**
 * Calculate totals for a single packing box.
 *
 * WEIGHT CALCULATION:
 *   Item Net Weight = user-entered (total net weight)
 *   Box Net Weight  = SUM(Item Net Weights)
 *   Box Gross Weight = Box Net Weight + Packing Weight
 *
 * Packing Weight is user-entered (weight of box/packing material).
 * Gross Weight is always auto-calculated, never manually entered.
 */
export function boxTotals(box) {
  if (!box || !Array.isArray(box.items)) {
    return { qty: 0, net: 0, packingWeight: 0, gross: 0, itemCount: 0 };
  }
  const qty = box.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  // Box Net Weight = sum of item netWeight values
  const net = box.items.reduce((sum, item) => {
    return sum + (Number(item.netWeight) || 0);
  }, 0);
  const packingWeight = Number(box.packingWeight) || 0;
  // Box Gross Weight = Net + Packing Weight (auto-calculated)
  const gross = net + packingWeight;
  return {
    qty,
    net,
    packingWeight,
    gross,
    itemCount: box.items.length,
  };
}

/** Calculate overall totals across all boxes. */
export function overallTotals(packingBoxes) {
  if (!Array.isArray(packingBoxes)) {
    return { boxes: 0, qty: 0, net: 0, gross: 0, totalItems: 0 };
  }
  return packingBoxes.reduce(
    (acc, box) => {
      const bt = boxTotals(box);
      return {
        boxes: acc.boxes + 1,
        qty: acc.qty + bt.qty,
        net: acc.net + bt.net,
        gross: acc.gross + bt.gross,
        totalItems: acc.totalItems + bt.itemCount,
      };
    },
    { boxes: 0, qty: 0, net: 0, gross: 0, totalItems: 0 }
  );
}

// ----------------------------------------------------------------
// Packable quantity helpers (unchanged logic, works with nested)
// ----------------------------------------------------------------

/** Total packed quantity of a record — sums from packingBoxes[].items[].quantity. */
export function packedQtyOf(record) {
  if (!record) return 0;
  const rec = ensureBoxes(record);

  // New structure: sum from packingBoxes
  if (Array.isArray(rec.packingBoxes) && rec.packingBoxes.length > 0) {
    const fromBoxes = rec.packingBoxes.reduce((total, box) => {
      if (!Array.isArray(box.items)) return total;
      return total + box.items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    }, 0);
    // A record read back from the API carries no box/item detail (packing_lists
    // stores only the header + packed total) and `ensureBoxes` fills in an empty
    // box for it — so a zero here means "no item detail", NOT "nothing packed".
    // Falling through keeps the persisted packed quantity authoritative instead
    // of reporting 0 for every saved list (which also silently disabled the
    // Dispatch over-dispatch guard, since that compares against this value).
    if (fromBoxes > 0) return fromBoxes;
  }

  // Legacy fallback: flat items[]
  if (Array.isArray(rec.items) && rec.items.length > 0) {
    const fromItems = rec.items.reduce((total, item) => total + (Number(item.qty) || 0), 0);
    if (fromItems > 0) return fromItems;
  }

  // Persisted summary written by the Packing form — the only packed quantity
  // available for records loaded from the backend.
  return Number(rec.packedQuantity) || 0;
}

/**
 * QC Accepted quantity of a Work Order.
 *
 * The QC / Quality stage is the FINAL production stage.
 * Its outputQuantity = accepted quantity.
 * Its rejectedQuantity = rejected quantity.
 * Only accepted quantity becomes available for Packing.
 */
/** Get the QC/Quality stage name for a production type. */
export function qcStageName(type) {
  const flow = ENTRY_WORKFLOWS[type] || [];
  // QC stage is named 'QC' for Casting/Fabrication and 'Quality' for Assembly.
  // It is NOT the last stage (Dispatch comes after).
  return flow.find((s) => s === 'QC' || s === 'Quality') || 'QC';
}

/**
 * Stage labels that record a QC sign-off.
 *
 * QC is written under more than one label by the existing screens: the Quality
 * module always records the entry as 'QC' (whatever the production type), the
 * Assembly workflow calls that gate 'Quality', and the generic stage-entry
 * vocabulary (ENTRY_WORKFLOWS.QC) calls it 'QC Inspection'. Matching only the
 * label derived from one Work Order's own workflow therefore reported
 * "no completed QC" for Work Orders whose sign-off was recorded under one of
 * the other labels — e.g. every Assembly Work Order inspected through the
 * Quality module.
 */
export const QC_STAGES = ['QC', 'Quality', 'QC Inspection'];

/** Did this stage record a QC sign-off? */
export function isQcStage(stage) {
  return QC_STAGES.includes(String(stage || '').trim());
}

/**
 * QC Accepted quantity of a Work Order.
 *
 * The QC / Quality stage is the FINAL production stage.
 * Its outputQuantity = accepted quantity.
 * Its rejectedQuantity = rejected quantity.
 * Only accepted quantity becomes available for Packing.
 *
 * QC sign-offs are stored per Work Order ITEM (`workOrderItemId`), so a Work
 * Order with several items collects one accepted quantity per item — reading
 * only the first matching row (as this used to) reported the first item's
 * quantity and silently dropped the rest. Rows written without an item id are
 * order-level totals, so they are only used when the Work Order has no
 * item-level sign-offs (otherwise the item rows and the total would be
 * counted twice).
 */
export function qcAcceptedQty(order, entries) {
  if (!order) return 0;
  const wo = order.workOrder;
  const cleared = (entries || []).filter(
    (entry) =>
      entry &&
      entry.workOrderId === wo &&
      isQcStage(entry.stage) &&
      // 'Completed' is the stage-entry status; 'Passed' is the inspection
      // outcome some older QC rows were written with. Both mean QC cleared.
      (entry.status === 'Completed' || entry.status === 'Passed')
  );
  if (cleared.length === 0) return 0;

  const perItem = new Map();
  const orderLevel = [];
  cleared.forEach((entry) => {
    const itemId = entry.workOrderItemId == null ? '' : String(entry.workOrderItemId);
    if (itemId === '') orderLevel.push(Number(entry.outputQuantity) || 0);
    else perItem.set(itemId, Math.max(perItem.get(itemId) || 0, Number(entry.outputQuantity) || 0));
  });

  if (perItem.size > 0) {
    return [...perItem.values()].reduce((total, qty) => total + qty, 0);
  }
  // No item breakdown: the order-level row IS the accepted quantity (take the
  // largest one when duplicates exist rather than summing snapshots).
  return orderLevel.length ? Math.max(...orderLevel) : 0;
}

/**
 * Completed production quantity of a Work Order.
 * For packing purposes, this is the QC accepted quantity.
 */
export function completedProductionQty(order, entries, jobsByWO) {
  return qcAcceptedQty(order, entries);
}

/** Quantity already packed for a Work Order (excludes the record being edited). */
export function alreadyPackedQty(records, workOrder, excludeId) {
  return (records || [])
    .filter((record) => record.id !== excludeId)
    .reduce((total, record) => {
      const rec = ensureBoxes(record);

      // Sum quantities from items that reference this Work Order.
      let fromItems = 0;
      let hasItemDetail = false;
      (rec.packingBoxes || []).forEach((box) => {
        (box.items || []).forEach((item) => {
          hasItemDetail = true;
          if (item.workOrder === workOrder) fromItems += Number(item.quantity) || 0;
        });
      });
      if (hasItemDetail) return total + fromItems;

      // No item detail on this record — it came from the API, whose table keeps
      // only the packed total. Count its persisted packed quantity when it
      // belongs to this Work Order, otherwise a Work Order stayed "fully
      // available" after being packed and could be packed again past its
      // produced quantity.
      return rec.productionOrder === workOrder
        ? total + (Number(rec.packedQuantity) || 0)
        : total;
    }, 0);
}

/** Available packing quantity for a Work Order: completed − already packed. */
export function packableQuantityFor(order, entries, jobsByWO, records, excludeId) {
  const produced = completedProductionQty(order, entries, jobsByWO);
  const packed = alreadyPackedQty(records, order.workOrder, excludeId);
  return Math.max(0, produced - packed);
}

/** Auto status for a Packing List: Pending → In Progress → Completed. */
export function derivePackingStatus(quantity, packedTotal) {
  const qty = Number(quantity) || 0;
  const packed = Number(packedTotal) || 0;
  if (qty > 0 && packed >= qty) return 'Completed';
  if (packed > 0) return 'In Progress';
  return 'Pending';
}

/**
 * Get all Work Orders eligible for packing.
 * A Work Order is eligible if its QC/Quality stage is completed
 * and it has remaining available quantity.
 */
export function eligibleWorkOrdersForPacking(orders, entries, records, excludeId) {
  return (orders || []).filter((order) => {
    const accepted = qcAcceptedQty(order, entries);
    if (accepted <= 0) return false;
    const packed = alreadyPackedQty(records, order.workOrder, excludeId);
    return packed < accepted;
  });
}
