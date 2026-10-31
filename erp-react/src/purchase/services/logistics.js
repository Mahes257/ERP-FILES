/**
 * purchase/services/logistics.js
 * ------------------------------------------------------------------
 * Mock Logistics service for the Purchase module: manufacturing /
 * packing progress, shipment tracking, goods receipt (GRN), quality
 * inspection and inventory updates. Data persists to localStorage via
 * lazy collections.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, PO_STATUS } from '../constants';
import { nextSeqNo } from '../utils/purchase';
import { ordersStore, purchaseOrderService } from './purchaseOrder';
import { getLogisticsDefaults, getSequence, issueNextNumber, readSettings } from './settings';
import { clone, createCollection, delay, storageKeys, todayLocal } from './base';
import { notifyWorkflowEvent } from './notificationFeed';
import { logisticsApi } from './api/logisticsApi';
import { isApiMode } from './api-client';
import { RECEIVING_PAGE_SIZE_MAX } from './api/logisticsPaging';

/**
 * Widest page a receiving list may ask for. The backend clamps every page
 * size to this value, so export / report callers use it instead of asking
 * for "everything" (which the server would cap anyway).
 */
export const RECEIVING_MAX_PAGE_SIZE = RECEIVING_PAGE_SIZE_MAX;

export const SHIPMENT_STATUS = {
  PENDING: 'Pending Dispatch',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  DELAYED: 'Delayed'
};

export const GRN_STATUS = {
  EXPECTED: 'Expected',
  RECEIVED: 'Received',
  PENDING_INSPECTION: 'Pending Inspection'
};

export const INSPECTION_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  PASSED: 'Passed',
  FAILED: 'Failed',
  PARTIALLY_ACCEPTED: 'Partially Accepted'
};

export const INVENTORY_TYPE = {
  RECEIPT: 'Receipt',
  ISSUE: 'Issue',
  ADJUSTMENT: 'Adjustment',
  TRANSFER: 'Transfer'
};

export const PACKING_STATUS = {
  IN_PRODUCTION: 'In Production',
  PACKED: 'Packed',
  READY_TO_SHIP: 'Ready to Ship'
};

/** Seed logistics data — returns empty. Real data from the API. */
function manufacturingSeed() {
  return [];
}

/** Seed shipments — returns empty. Real data from the API. */
function shipmentSeed() {
  return [];
}

/** Seed GRNs — returns empty. Real data from the API. */
function grnSeed() {
  return [];
}

/** Seed inspections — returns empty. Real data from the API. */
function inspectionSeed() {
  return [];
}

/** Seed inventory — returns empty. Real data from the API. */
function inventorySeed() {
  return [];
}

export const manufacturingStore = createCollection(storageKeys.manufacturing, manufacturingSeed);
export const shipmentsStore = createCollection(storageKeys.shipments, shipmentSeed);
export const grnsStore = createCollection(storageKeys.grns, grnSeed);
export const inspectionsStore = createCollection(storageKeys.inspections, inspectionSeed);
export const inventoryStore = createCollection(storageKeys.inventory, inventorySeed);

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

/**
 * Cumulative received quantity per product line across every posted GRN
 * (Expected GRNs contribute nothing). Used to drive the linked PO's
 * delivery status so partial receipts stay Partial and a PO only becomes
 * Completed once all ordered quantities are actually received.
 */
function receiptQuantitiesByPo(poNo) {
  const map = {};
  grnsStore.all
    .filter((grn) => grn.poNo === poNo && grn.status !== GRN_STATUS.EXPECTED)
    .forEach((grn) => {
      (grn.items || []).forEach((item) => {
        const product = String(item.product || '').trim();
        const received = Number(item.received) || 0;
        if (product) map[product] = (map[product] || 0) + received;
      });
    });
  return map;
}

/**
 * Recomputes a PO's delivery status from posted receipts. Adds per-item
 * received quantities (capped at the ordered quantity) and advances the
 * status Open → Partial → Completed only when receipts warrant it. The
 * PO must be released (approved); otherwise nothing changes.
 */
async function syncPoDeliveryStatus(poNo) {
  const records = ordersStore.all;
  const index = records.findIndex((entry) => entry.id === poNo || entry.poNo === poNo);
  if (index === -1) return null;
  const order = records[index];
  if (order.approvalStatus !== APPROVAL_STATUS.APPROVED) return clone(order);

  const receivedMap = receiptQuantitiesByPo(poNo);
  const items = (order.items || []).map((item) => {
    const product = String(item.product || '').trim();
    const received = Math.min(Number(receivedMap[product]) || 0, Number(item.qty) || 0);
    /* Ordered / Received / Pending — pending can never go negative. */
    return { ...item, receivedQty: received, pendingQty: Math.max(0, (Number(item.qty) || 0) - received) };
  });
  records[index] = { ...order, items };
  ordersStore.persist(records);

  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const totalReceived = items.reduce((sum, item) => sum + (Number(item.receivedQty) || 0), 0);
  const allReceived = totalQty > 0 && totalReceived >= totalQty;
  const anyReceived = totalReceived > 0;
  const nextStatus = allReceived ? PO_STATUS.COMPLETED : anyReceived ? PO_STATUS.PARTIALLY_DELIVERED : PO_STATUS.IN_PROGRESS;

  if (nextStatus !== order.status) {
    /* Reuses the validated delivery setter so the PO timeline records the
       transition exactly like a manual delivery update. */
    await purchaseOrderService.setDeliveryStatus(poNo, nextStatus);
  }
  return ordersStore.all.find((entry) => entry.poNo === poNo);
}

/**
 * Opens a quality inspection record for a received GRN. Seeded GRNs
 * already carry one — a fresh record is created only when the GRN has
 * none, so the QC step is reachable for every received GRN exactly once.
 */
function ensureInspectionForGrn(grn) {
  if (!grn || !grn.grnNo) return null;
  const records = inspectionsStore.all;
  if (records.some((entry) => entry.grnNo === grn.grnNo)) return null;
  const inspectionNo = nextSeqNo(records, 'QC', 'inspectionNo', 4200);
  const inspection = {
    id: inspectionNo,
    inspectionNo,
    grnNo: grn.grnNo,
    poNo: grn.poNo || '',
    vendor: grn.vendor || '',
    inspectedOn: '',
    status: INSPECTION_STATUS.PENDING,
    defects: 0,
    inspector: 'Quality Team',
    notes: `Awaiting inspection of ${grn.grnNo}`,
    items: (grn.items || []).map((item) => ({
      itemCode: item.itemCode || '',
      product: item.product || '',
      hsn: item.hsn || '',
      uom: item.uom || 'Nos',
      receivedQty: Number(item.received) || 0,
      inspectedQty: 0,
      acceptedQty: 0,
      rejectedQty: 0
    })),
    createdAt: new Date().toISOString()
  };
  records.push(inspection);
  inspectionsStore.persist(records);
  return inspection;
}

/**
 * API-mode counterpart of ensureInspectionForGrn. The backend records the
 * GRN receipt but leaves opening the QC record to the caller, so a receipt
 * in API mode would otherwise strand the goods with no reachable inspection.
 * Idempotent — exactly one inspection per GRN. `knownInspections` lets a
 * caller that already fetched the list avoid a second request.
 */
async function ensureApiInspectionForGrn(grn, knownInspections = null) {
  if (!grn || !grn.grnNo) return null;
  if (grn.status === GRN_STATUS.EXPECTED) return null;
  /* Ask for the single inspection of THIS GRN instead of pulling the list. */
  const list = knownInspections ?? (await logisticsApi.inspections({ grnNo: grn.grnNo, pageSize: 1 })).data;
  if ((list || []).some((entry) => entry.grnNo === grn.grnNo)) return null;
  return logisticsApi.createInspection({
    grnNo: grn.grnNo,
    inspector: 'Quality Team',
    remarks: `Awaiting inspection of ${grn.grnNo}`,
    items: (grn.items || []).map((item) => ({
      product: item.product || '',
      receivedQty: Number(item.received) || Number(item.qty) || 0,
      inspectedQty: 0,
      acceptedQty: 0,
      rejectedQty: 0
    }))
  });
}

/**
 * The backend has no "posted" flag on an inspection — the inventory ledger
 * is local in both data modes, so a posting recorded here is what proves an
 * inspection was already posted. Deriving it keeps the Post-to-Inventory
 * action from being offered twice across a page reload.
 */
function withLocalPostingState(inspection) {
  if (!inspection || inspection.postedAt) return inspection;
  const posted = inventoryStore.all.some(
    (entry) => entry.type === INVENTORY_TYPE.RECEIPT && entry.reference === inspection.grnNo
  );
  return posted ? { ...inspection, postedAt: new Date().toISOString() } : inspection;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/* ------------------------------------------------------------------
 * Inventory quantity helpers — ONE source of truth for on-hand stock.
 * The on-hand balance for an item is always derived from the movement
 * ledger (running sum of deltas per SKU + warehouse), never from a
 * separate counter that could drift out of sync.
 * ---------------------------------------------------------------- */

/**
 * Current on-hand quantity for an item in a warehouse, computed from the
 * existing ledger. Matches by SKU when available, otherwise by product
 * name (manual movements without a SKU still reconcile).
 */
function onHandQuantity({ sku = '', product = '', warehouse = '' } = {}) {
  return inventoryStore.all.reduce((sum, entry) => {
    const sameItem = sku ? entry.sku === sku : entry.product === product;
    const sameWarehouse = !warehouse || entry.warehouse === warehouse;
    return sameItem && sameWarehouse ? sum + toNumber(entry.delta) : sum;
  }, 0);
}

/**
 * Generates the next Inventory Movement (INV) number through the
 * central numbering engine — its own independent sequence, so it can
 * never collide with Vendor Invoice (VINV) or any other namespace.
 */
function nextInventoryId(records) {
  const seq = getSequence(readSettings()?.numbering, 'Inventory Movement') || {};
  const prefix = seq.prefix || 'INV';
  const existing = records.map((entry) => String(entry.id || '')).filter((id) => id.startsWith(`${prefix}-`));
  return issueNextNumber('Inventory Movement', existing).number;
}

function simplePaginate(records, { page = 1, pageSize = 10, search = '', filters = {} } = {}) {
  const query = String(search).trim().toLowerCase();
  let filtered = records.filter((record) => {
    if (filters.status && record.status !== filters.status) return false;
    if (filters.vendor && record.vendor !== filters.vendor) return false;
    if (filters.type && record.type !== filters.type) return false;
    if (query) {
      const haystack = Object.values(record)
        .filter((value) => typeof value === 'string' || typeof value === 'number')
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return {
    data: clone(filtered.slice(start, start + pageSize)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

/**
 * The backend's by-id routes for manufacturing, shipments and inspections take
 * the NUMERIC row id (`/manufacturing/{id}` → `Long id`), but every route, link
 * and action in the UI carries the document NUMBER ("MFR-2026-0003"). The list
 * endpoints already search on that number, so resolve it to the row's real id
 * before calling a by-id route. Numeric ids pass straight through unchanged.
 */
async function apiRowByNumber(listFn, id, numberKey) {
  const result = await listFn({ search: String(id), pageSize: RECEIVING_PAGE_SIZE_MAX });
  return (result?.data || []).find(
    (entry) => String(entry[numberKey]) === String(id) || String(entry.id) === String(id)
  ) || null;
}

async function apiIdByNumber(listFn, id, numberKey) {
  if (id != null && /^\d+$/.test(String(id))) return id;
  const row = await apiRowByNumber(listFn, id, numberKey);
  return row ? row.id : id;
}

export const logisticsService = {
  /** ------------------------- Manufacturing / Packing ---------------------- */
  async getManufacturing({ search = '', status = 'All', page = 1, pageSize = 10 } = {}) {
    if (isApiMode()) {
      /* Server-side paging: one request returns exactly one page — the
         backend searches, filters and sorts across the whole table. */
      return logisticsApi.manufacturing({ page, pageSize, search, status });
    }
    await delay();
    return simplePaginate(manufacturingStore.all, { search, page, pageSize, filters: { status: toFilter(status) } });
  },

  async getManufacturingStats() {
    if (isApiMode()) {
      const raw = await logisticsApi.manufacturingStats();
      return { total: raw.total || 0, inProduction: raw.inProduction || 0, packed: raw.packed || 0, ready: raw.ready || 0 };
    }
    await delay();
    const records = manufacturingStore.all;
    return {
      total: records.length,
      inProduction: records.filter((entry) => entry.status === PACKING_STATUS.IN_PRODUCTION).length,
      packed: records.filter((entry) => entry.status === PACKING_STATUS.PACKED).length,
      ready: records.filter((entry) => entry.status === PACKING_STATUS.READY_TO_SHIP).length
    };
  },

  /** The next MFR number the backend will assign — shown on the New Packing
      form instead of the mock store's sequence. */
  async getNextMfrNumber() {
    if (isApiMode()) {
      const result = await logisticsApi.nextMfrNumber();
      return result?.mfrNo || '';
    }
    await delay();
    return nextSeqNo(manufacturingStore.all, 'MFR', 'packingNo', 4200);
  },

  async getManufacturingById(id) {
    if (isApiMode()) {
      /* Resolve the packing NUMBER the routes carry to the backend row. */
      return apiRowByNumber(logisticsApi.manufacturing, id, 'packingNo');
    }
    await delay();
    const record = manufacturingStore.all.find((entry) => entry.id === id || entry.packingNo === id);
    return record ? clone(record) : null;
  },

  async hasPackingForPo(poNo) {
    if (isApiMode()) {
      /* A single row answers the question — no list download needed. */
      const result = await logisticsApi.manufacturing({ poNo, pageSize: 1 });
      return (result?.data || []).length > 0;
    }
    await delay();
    return manufacturingStore.all.some((entry) => entry.poNo === poNo);
  },

  async createManufacturingJob(payload = {}) {
    if (isApiMode()) {
      return logisticsApi.createManufacturing(payload);
    }
    await delay();
    const poNo = payload.poNo || '';
    if (!poNo) throw new Error('Purchase order number is required');
    let order = ordersStore.all.find((entry) => entry.poNo === poNo);
    if (!order) {
      try {
        const result = await purchaseOrderService.getOrders({ search: poNo, page: 1, pageSize: 50 });
        order = (result.data || []).find((entry) => entry.poNo === poNo);
      } catch { /* ignore */ }
    }
    if (!order) throw new Error('Purchase order not found');
    if (order.approvalStatus !== APPROVAL_STATUS.APPROVED) {
      throw new Error('Only released purchase orders can create a packing job');
    }
    const existing = manufacturingStore.all.find((entry) => entry.poNo === poNo);
    if (existing) {
      throw new Error(`A packing job (${existing.packingNo}) already exists for ${poNo}. Each purchase order can only have one packing job.`);
    }
    const records = manufacturingStore.all;
    const packingNo = nextSeqNo(records, 'MFR', 'packingNo', 4200);
    const poItems = (order.items || []).map((item) => ({
      product: item.product || '', hsn: item.hsn || '', uom: item.uom || 'Nos',
      qty: Number(item.qty) || 0, packedQty: 0, expectedRate: Number(item.rate || item.expectedRate) || 0
    }));
    const totalQty = poItems.reduce((sum, item) => sum + item.qty, 0);
    const job = {
      id: packingNo, packingNo, poNo,
      product: payload.product || poItems[0]?.product || '',
      vendor: order.vendor || '', qty: Number(payload.qty) || totalQty, packedQty: 0,
      items: poItems, status: PACKING_STATUS.IN_PRODUCTION, progress: 0,
      startDate: payload.startDate || todayLocal(), expectedDate: payload.expectedDate || order.expectedDate || '',
      warehouse: payload.warehouse || '', notes: payload.notes || '', createdAt: new Date().toISOString()
    };
    records.push(job);
    manufacturingStore.persist(records);
    return clone(job);
  },

  async updateManufacturing(id, patch = {}) {
    if (isApiMode()) {
      return logisticsApi.updateManufacturing(await apiIdByNumber(logisticsApi.manufacturing, id, 'packingNo'), patch);
    }
    await delay();
    const records = manufacturingStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Packing record not found');
    records[index] = { ...records[index], ...patch, id: records[index].id };
    manufacturingStore.persist(records);
    return clone(records[index]);
  },

  /** ------------------------------ Shipments -------------------------------- */
  async getShipments({ search = '', status = 'All', page = 1, pageSize = 10 } = {}) {
    if (isApiMode()) {
      /* Server-side paging: one request returns exactly one page. */
      return logisticsApi.shipments({ page, pageSize, search, status });
    }
    await delay();
    return simplePaginate(shipmentsStore.all, { search, page, pageSize, filters: { status: toFilter(status) } });
  },

  async getShipmentStats() {
    if (isApiMode()) {
      const raw = await logisticsApi.shipmentStats();
      return { total: raw.total || 0, pending: raw.pending || 0, inTransit: raw.inTransit || 0, delivered: raw.delivered || 0, delayed: raw.delayed || 0 };
    }
    await delay();
    const records = shipmentsStore.all;
    return {
      total: records.length,
      pending: records.filter((entry) => entry.status === SHIPMENT_STATUS.PENDING).length,
      inTransit: records.filter((entry) => entry.status === SHIPMENT_STATUS.IN_TRANSIT).length,
      delivered: records.filter((entry) => entry.status === SHIPMENT_STATUS.DELIVERED).length,
      delayed: records.filter((entry) => entry.status === SHIPMENT_STATUS.DELAYED).length
    };
  },

  async getShipmentById(id) {
    if (isApiMode()) {
      /* Resolve the shipment NUMBER the routes carry to the backend row. */
      return apiRowByNumber(logisticsApi.shipments, id, 'shipmentNo');
    }
    await delay();
    const record = shipmentsStore.all.find((entry) => entry.id === id || entry.shipmentNo === id);
    return record ? clone(record) : null;
  },

  async updateShipment(id, patch = {}) {
    if (isApiMode()) {
      return logisticsApi.updateShipment(await apiIdByNumber(logisticsApi.shipments, id, 'shipmentNo'), patch);
    }
    await delay();
    const records = shipmentsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Shipment not found');
    const current = records[index];
    const nextStatus = patch.status || current.status;
    if (current.status === SHIPMENT_STATUS.DELIVERED && nextStatus !== SHIPMENT_STATUS.DELIVERED) {
      throw new Error('A delivered shipment cannot be moved back');
    }
    if (nextStatus === SHIPMENT_STATUS.DELIVERED && current.status === SHIPMENT_STATUS.PENDING) {
      throw new Error('Shipment must be dispatched before it can be marked delivered');
    }
    records[index] = {
      ...current,
      ...patch,
      id: current.id,
      /* A delivery is only a delivery once we can say when it happened. */
      receivedOn:
        nextStatus === SHIPMENT_STATUS.DELIVERED
          ? current.receivedOn || todayLocal()
          : current.receivedOn || '',
      /* Auto-set dispatch date when marking as in-transit. */
      dispatchDate:
        nextStatus === SHIPMENT_STATUS.IN_TRANSIT && !current.dispatchDate
          ? todayLocal()
          : current.dispatchDate
    };
    shipmentsStore.persist(records);
    return clone(records[index]);
  },

  /** Creates a shipment against a released (approved) purchase order. */
  async createShipment(payload = {}) {
    if (isApiMode()) {
      return logisticsApi.createShipment(payload);
    }
    await delay();
    const poNo = payload.poNo || '';
    const order = ordersStore.all.find((entry) => entry.poNo === poNo);
    if (!order) throw new Error('Purchase order not found');
    /* Released-only gate — the same precondition (and the same condition) the
       goods-receipt path already enforces. An approved-but-not-released PO was
       never sent to the vendor, so it cannot be shipped. */
    if (order.approvalStatus !== APPROVAL_STATUS.APPROVED) {
      throw new Error('Only released purchase orders can create a shipment');
    }
    const records = shipmentsStore.all;
    const shipmentNo = nextSeqNo(records, 'SHP', 'shipmentNo', 4200);
    const shipment = {
      id: shipmentNo, shipmentNo, poNo,
      packingNo: payload.packingNo || '', vendor: order.vendor || '',
      carrier: payload.carrier || '', mode: payload.mode || 'Road',
      dispatchDate: payload.dispatchDate || '', eta: payload.eta || '',
      destination: payload.destination || '',
      status: payload.status || SHIPMENT_STATUS.PENDING,
      trackingNo: payload.trackingNo || '', notes: payload.notes || '',
      createdAt: new Date().toISOString()
    };
    records.push(shipment);
    shipmentsStore.persist(records);
    /* Shipment is a declared notification type (notificationFeed emits GRN and
       Inspection already); creating a shipment is the workflow event that
       feeder expects, so emit it here like the sibling logistics events. */
    notifyWorkflowEvent({
      type: 'Shipment',
      title: `${shipment.shipmentNo} created`,
      message: `Shipment ${shipment.shipmentNo} was created for ${poNo} on ${todayLocal()} \u2014 ${order.vendor || 'supplier'}.`,
      route: `/purchase/logistics/shipment/${shipment.shipmentNo}`,
      documentNo: shipment.shipmentNo,
      related: { type: 'shipment', id: shipment.id, poNo, vendor: order.vendor || '' },
      sourceEvent: 'createShipment'
    });
    return clone(shipment);
  },

  /** ------------------------------ Goods Receipt ---------------------------- */
  async getGrns({ search = '', status = 'All', page = 1, pageSize = 10 } = {}) {
    if (isApiMode()) {
      /* Server-side paging: one request returns exactly one page. */
      return logisticsApi.grns({ page, pageSize, search, status });
    }
    await delay();
    return simplePaginate(grnsStore.all, { search, page, pageSize, filters: { status: toFilter(status) } });
  },

  /**
   * Authoritative next GRN number. The local guess (`nextSeqNo`) is derived
   * from an empty local store in API mode, so it would repeat the same
   * number and the backend would reject the second GRN as a duplicate.
   */
  async getNextGrnNumber() {
    if (isApiMode()) {
      const result = await logisticsApi.nextGrnNumber();
      return result?.grnNo || result?.nextNumber || result;
    }
    await delay();
    return nextSeqNo(grnsStore.all, 'GRN', 'grnNo', 4200);
  },

  async getGrnStats() {
    if (isApiMode()) {
      /* Counted in the database — the KPI cards no longer depend on a list. */
      const raw = await logisticsApi.grnStats();
      return {
        total: Number(raw?.total) || 0,
        expected: Number(raw?.expected) || 0,
        received: Number(raw?.received) || 0,
        pendingInspection: Number(raw?.pendingInspection) || 0
      };
    }
    await delay();
    const records = grnsStore.all;
    return {
      total: records.length,
      expected: records.filter((entry) => entry.status === GRN_STATUS.EXPECTED).length,
      received: records.filter((entry) => entry.status === GRN_STATUS.RECEIVED).length,
      pendingInspection: records.filter((entry) => entry.status === GRN_STATUS.PENDING_INSPECTION).length
    };
  },

  async getGrnById(id) {
    if (isApiMode()) return logisticsApi.grn(id);
    await delay();
    const record = grnsStore.all.find((entry) => entry.id === id || entry.grnNo === id);
    return record ? clone(record) : null;
  },

  /**
   * Posts a goods receipt. `items` (optional array of { product, received })
   * allows partial receipts; when omitted every line defaults to its ordered
   * quantity. Receiving more than the outstanding ordered quantity across all
   * GRNs for the PO is refused (no silent over-receipt). Posting recomputes
   * the linked PO's delivery status (Partial → Completed only when all
   * required quantities are received).
   */
  async receiveGoods(id, items = []) {
    if (isApiMode()) {
      const received = await logisticsApi.receiveGrn(id, items);
      /* A receipt opens the QC step in the local data mode; the backend
         does not do it for us, so mirror the behaviour here. */
      await ensureApiInspectionForGrn(received);
      return received;
    }
    await delay();
    const records = grnsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('GRN not found');
    const grn = records[index];
    if (grn.status !== GRN_STATUS.EXPECTED) {
      throw new Error(`${grn.grnNo} has already been received`);
    }
    const order = ordersStore.all.find((entry) => entry.poNo === grn.poNo);
    if (!order) throw new Error(`Purchase order ${grn.poNo} not found`);
    if (order.approvalStatus !== APPROVAL_STATUS.APPROVED) {
      throw new Error('Only released purchase orders can receive goods');
    }

    /* Outstanding = ordered minus everything already received on other
       GRNs for the same PO (this GRN has received nothing yet). */
    const alreadyReceived = {};
    records.forEach((other) => {
      if (other.id === grn.id || other.poNo !== grn.poNo) return;
      if (other.status === GRN_STATUS.EXPECTED) return;
      (other.items || []).forEach((item) => {
        const product = String(item.product || '').trim();
        if (product) alreadyReceived[product] = (alreadyReceived[product] || 0) + (Number(item.received) || 0);
      });
    });

    const explicitList = items.length > 0;
    const receivedItems = (grn.items || []).map((item) => {
      const product = String(item.product || '').trim();
      const ordered = Number(item.qty) || 0;
      const requested = explicitList
        ? Number(items.find((entry) => String(entry.product || '').trim() === product)?.received) || 0
        : ordered;
      const remaining = Math.max(0, ordered - (alreadyReceived[product] || 0));
      if (requested < 0 || requested > remaining) {
        throw new Error(
          `Received quantity for ${product} exceeds the outstanding order quantity (${remaining})`
        );
      }
      /* Ordered / Received / Pending per line — pending = qty - received. */
      return { ...item, received: requested, pending: Math.max(0, ordered - requested) };
    });

    records[index] = {
      ...grn,
      status: GRN_STATUS.PENDING_INSPECTION,
      receivedOn: todayLocal(),
      receivedAt: todayLocal(),
      items: receivedItems
    };
    grnsStore.persist(records);

    /* A receipt opens a quality inspection record against the GRN (one
       per GRN — seeded records already have theirs) so the QC step is
       reachable — unless Logistics Defaults disable inspections. */
    const inspectionsEnabled = getLogisticsDefaults().inspectionRequired !== false;
    if (inspectionsEnabled) {
      ensureInspectionForGrn(records[index]);
    }

    await syncPoDeliveryStatus(grn.poNo);
    notifyWorkflowEvent({
      type: 'GRN',
      title: `${grn.grnNo} received`,
      message: `Goods for ${grn.poNo} received on ${todayLocal()} against ${grn.grnNo} — ${grn.items?.length || 0} line item(s).`,
      route: `/purchase/logistics/grn/${grn.grnNo}`,
      documentNo: grn.grnNo,
      related: { type: 'grn', id: grn.id, poNo: grn.poNo, vendor: order.vendor || '' },
      sourceEvent: 'receiveGoods'
    });
    if (inspectionsEnabled) {
      notifyWorkflowEvent({
        type: 'Inspection',
        title: `Inspection pending — ${grn.grnNo}`,
        message: `${grn.grnNo} was received and is awaiting quality inspection.`,
        route: `/purchase/logistics/quality`,
        documentNo: grn.grnNo,
        related: { type: 'grn', id: grn.id, poNo: grn.poNo, vendor: order.vendor || '' },
        sourceEvent: 'receiveGoods'
      });
    }
    return clone(records[index]);
  },

  /** Creates a goods receipt (GRN) against a released purchase order. */
  async createGrn(poNo, { grnNo: grnNoOverride, shipmentNo = '', warehouse = '' } = {}) {
    if (isApiMode()) {
      return logisticsApi.createGrn({
        poNo,
        grnNo: grnNoOverride,
        warehouse,
        shipmentNo
      });
    }
    await delay();
    const order = ordersStore.all.find((entry) => entry.poNo === poNo);
    if (!order) throw new Error('Purchase order not found');
    if (order.approvalStatus !== APPROVAL_STATUS.APPROVED) {
      throw new Error('Only released purchase orders can create a goods receipt');
    }
    const records = grnsStore.all;
    const grnNo = grnNoOverride || nextSeqNo(records, 'GRN', 'grnNo', 4200);
    /* Prevent duplicate GRN numbers. */
    if (records.some((entry) => entry.grnNo === grnNo)) {
      throw new Error(`GRN number ${grnNo} already exists`);
    }
    const grn = {
      id: grnNo,
      grnNo,
      poNo,
      shipmentNo,
      vendor: order.vendor || '',
      /* Default receiving warehouse comes from Logistics Defaults. */
      warehouse: warehouse || getLogisticsDefaults().defaultWarehouse || '',
      receivedOn: '',
      status: GRN_STATUS.EXPECTED,
      items: (order.items || []).map((item) => ({
        itemCode: item.itemCode || '',
        product: item.product || '',
        hsn: item.hsn || '',
        uom: item.uom || 'Nos',
        qty: Number(item.qty) || 0,
        received: 0
      })),
      createdAt: new Date().toISOString(),
      receivedAt: ''
    };
    records.push(grn);
    grnsStore.persist(records);
    return clone(grn);
  },

  /** Updates an expected GRN's line quantities (before receipt). */
  async updateGrn(id, patch = {}) {
    if (isApiMode()) {
      return logisticsApi.updateGrn(id, patch);
    }
    await delay();
    const records = grnsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('GRN not found');
    const grn = records[index];
    if (grn.status !== GRN_STATUS.EXPECTED) {
      throw new Error(`${grn.grnNo} can only be edited before goods are received`);
    }
    const updated = { ...grn };
    if (patch.items) updated.items = patch.items;
    if (patch.shipmentNo !== undefined) updated.shipmentNo = patch.shipmentNo;
    if (patch.warehouse !== undefined) updated.warehouse = patch.warehouse;
    records[index] = updated;
    grnsStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Sends an expected/received GRN to quality inspection. For EXPECTED
   * GRNs this performs the receipt (receiveGoods) and opens the
   * inspection. For PENDING_INSPECTION GRNs it simply returns the
   * existing inspection record. This is a convenience wrapper used by
   * the GRN list's "Send to Inspection" action.
   */
  async sendToInspection(grnId) {
    if (isApiMode()) {
      const grn = await logisticsApi.grn(grnId);
      if (!grn) throw new Error('GRN not found');
      if (grn.status === GRN_STATUS.EXPECTED) {
        throw new Error('Goods must be received before sending to inspection');
      }
      const existing = await logisticsApi.inspections({ grnNo: grn.grnNo, pageSize: 1 });
      const inspection = (existing?.data || [])[0];
      if (inspection) return inspection;
      return ensureApiInspectionForGrn(grn, existing?.data || []);
    }
    await delay();
    const records = grnsStore.all;
    const index = records.findIndex((entry) => entry.id === grnId);
    if (index === -1) throw new Error('GRN not found');
    const grn = records[index];
    if (grn.status === GRN_STATUS.EXPECTED) {
      throw new Error('Goods must be received before sending to inspection');
    }
    /* Find the existing inspection for this GRN. */
    const inspection = inspectionsStore.all.find((entry) => entry.grnNo === grn.grnNo);
    if (!inspection) throw new Error(`No inspection record found for ${grn.grnNo}. Receive goods first.`);
    return clone(inspection);
  },

  /** ---------------------------- Quality Inspection -------------------------- */
  async getInspections({ search = '', status = 'All', page = 1, pageSize = 10 } = {}) {
    if (isApiMode()) {
      /* Server-side paging: one request returns exactly one page. */
      return logisticsApi.inspections({ page, pageSize, search, status });
    }
    await delay();
    return simplePaginate(inspectionsStore.all, { search, page, pageSize, filters: { status: toFilter(status) } });
  },

  async getInspectionStats() {
    if (isApiMode()) {
      /* Counted in the database — the KPI cards no longer depend on a list. */
      const raw = await logisticsApi.inspectionStats();
      return {
        total: Number(raw?.total) || 0,
        pending: Number(raw?.pending) || 0,
        inProgress: Number(raw?.inProgress) || 0,
        passed: Number(raw?.passed) || 0,
        failed: Number(raw?.failed) || 0,
        partiallyAccepted: Number(raw?.partiallyAccepted) || 0
      };
    }
    await delay();
    const records = inspectionsStore.all;
    return {
      total: records.length,
      pending: records.filter((entry) => entry.status === INSPECTION_STATUS.PENDING).length,
      inProgress: records.filter((entry) => entry.status === INSPECTION_STATUS.IN_PROGRESS).length,
      passed: records.filter((entry) => entry.status === INSPECTION_STATUS.PASSED).length,
      failed: records.filter((entry) => entry.status === INSPECTION_STATUS.FAILED).length,
      partiallyAccepted: records.filter((entry) => entry.status === INSPECTION_STATUS.PARTIALLY_ACCEPTED).length
    };
  },

  async getInspectionById(id) {
    if (isApiMode()) {
      /* ONE inspection per request — the detail page used to download the
         whole inspection list (and its paging) just to pick one row. */
      try {
        const record = await logisticsApi.inspection(id);
        return record ? withLocalPostingState(record) : null;
      } catch {
        return null;
      }
    }
    await delay();
    const record = inspectionsStore.all.find((entry) => entry.id === id || entry.inspectionNo === id);
    return record ? clone(record) : null;
  },

  /**
   * Creates a new quality inspection record. Typically inspections are
   * auto-created when goods are received (ensureInspectionForGrn), but
   * this method allows manual creation for edge cases.
   */
  async createInspection(payload = {}) {
    if (isApiMode()) {
      /* The backend stores the inspection comment in `remarks`; the form field
         is `notes`. Without the mapping the typed note was silently dropped. */
      const { notes, ...rest } = payload;
      return logisticsApi.createInspection({ ...rest, remarks: payload.remarks || notes || '' });
    }
    await delay();
    const grnNo = payload.grnNo || '';
    if (!grnNo) throw new Error('GRN reference is required');
    const grn = grnsStore.all.find((entry) => entry.grnNo === grnNo || entry.id === grnNo);
    if (!grn) throw new Error(`GRN ${grnNo} not found`);
    /* Prevent duplicate inspection for the same GRN. */
    const existing = inspectionsStore.all.find((entry) => entry.grnNo === grnNo);
    if (existing) {
      throw new Error(`Inspection ${existing.inspectionNo} already exists for ${grnNo}`);
    }
    const records = inspectionsStore.all;
    const inspectionNo = nextSeqNo(records, 'QC', 'inspectionNo', 4200);
    const inspection = {
      id: inspectionNo,
      inspectionNo,
      grnNo,
      poNo: grn.poNo || '',
      vendor: grn.vendor || '',
      inspectedOn: '',
      status: INSPECTION_STATUS.PENDING,
      defects: 0,
      inspector: payload.inspector || 'Quality Team',
      notes: payload.notes || '',
      items: (grn.items || []).map((item) => ({
        product: item.product || '',
        receivedQty: Number(item.received) || Number(item.qty) || 0,
        inspectedQty: 0,
        acceptedQty: 0,
        rejectedQty: 0
      })),
      createdAt: new Date().toISOString()
    };
    records.push(inspection);
    inspectionsStore.persist(records);
    notifyWorkflowEvent({
      type: 'Inspection',
      title: `Inspection ${inspection.inspectionNo} opened`,
      message: `Quality inspection ${inspection.inspectionNo} was opened for ${grnNo} — status ${inspection.status}.`,
      route: `/purchase/logistics/quality/${inspection.inspectionNo}`,
      documentNo: inspection.inspectionNo,
      related: { type: 'inspection', id: inspection.id, grnNo, poNo: grn.poNo || '', vendor: grn.vendor || '' },
      sourceEvent: 'createInspection'
    });
    return clone(inspection);
  },

  /**
   * Starts an inspection — moves from Pending to In Progress.
   */
  async startInspection(id) {
    if (isApiMode()) return logisticsApi.updateInspection(await apiIdByNumber(logisticsApi.inspections, id, 'inspectionNo'), { status: INSPECTION_STATUS.IN_PROGRESS });
    await delay();
    const records = inspectionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Inspection not found');
    if (records[index].status !== INSPECTION_STATUS.PENDING) {
      throw new Error('Only pending inspections can be started');
    }
    records[index] = { ...records[index], status: INSPECTION_STATUS.IN_PROGRESS };
    inspectionsStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Sets the inspection result with per-item quantities.
   * Validates: inspectedQty <= receivedQty, acceptedQty + rejectedQty <= inspectedQty.
   */
  async setInspectionResult(id, status, { notes = '', items = [], defects = 0 } = {}) {
    if (isApiMode()) {
      if (!Object.values(INSPECTION_STATUS).includes(status)) {
        throw new Error('Invalid inspection result');
      }
      if (status === INSPECTION_STATUS.IN_PROGRESS) {
        throw new Error('Cannot set result to In Progress — use startInspection');
      }
      /* Same partial-acceptance normalisation as the local branch so both
         data modes settle on an identical final status. */
      let finalStatus = status;
      if (status === INSPECTION_STATUS.PASSED && items.length > 0) {
        const anyRejected = items.some((item) => Number(item.rejectedQty) > 0);
        const allInspected = items.every((item) => Number(item.inspectedQty) >= Number(item.receivedQty));
        if (anyRejected && allInspected) finalStatus = INSPECTION_STATUS.PARTIALLY_ACCEPTED;
      }
      const reason = String(notes || '').trim();
      if (finalStatus === INSPECTION_STATUS.FAILED && !reason) {
        throw new Error('A rejection reason is required to fail an inspection');
      }
      return logisticsApi.updateInspection(await apiIdByNumber(logisticsApi.inspections, id, 'inspectionNo'), {
        status: finalStatus,
        remarks: reason,
        rejectionReason: finalStatus === INSPECTION_STATUS.FAILED ? reason : '',
        ...(items.length > 0 ? { items } : {})
      });
    }
    await delay();
    if (!Object.values(INSPECTION_STATUS).includes(status)) {
      throw new Error('Invalid inspection result');
    }
    if (status === INSPECTION_STATUS.IN_PROGRESS) {
      throw new Error('Cannot set result to In Progress — use startInspection');
    }
    const records = inspectionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Inspection not found');

    const inspection = records[index];

    /* Validate per-item quantities when provided */
    if (items.length > 0) {
      for (const item of items) {
        const received = Number(item.receivedQty) || 0;
        const inspected = Number(item.inspectedQty) || 0;
        const accepted = Number(item.acceptedQty) || 0;
        const rejected = Number(item.rejectedQty) || 0;

        if (inspected > received) {
          throw new Error(`Inspected qty for ${item.product} exceeds received qty (${received})`);
        }
        if (accepted + rejected > inspected) {
          throw new Error(`Accepted + rejected qty for ${item.product} exceeds inspected qty (${inspected})`);
        }
      }
    }

    /* Auto-detect partial acceptance when items have mixed results */
    let finalStatus = status;
    if (status === INSPECTION_STATUS.PASSED && items.length > 0) {
      const anyRejected = items.some((item) => Number(item.rejectedQty) > 0);
      const allInspected = items.every((item) => Number(item.inspectedQty) >= Number(item.receivedQty));
      if (anyRejected && allInspected) {
        finalStatus = INSPECTION_STATUS.PARTIALLY_ACCEPTED;
      }
    }

    const totalDefects = items.length > 0
      ? items.reduce((sum, item) => sum + (Number(item.rejectedQty) || 0), 0)
      : defects;

    records[index] = {
      ...inspection,
      status: finalStatus,
      notes: notes || inspection.notes,
      items: items.length > 0 ? items : inspection.items,
      defects: totalDefects,
      inspectedOn: todayLocal()
    };
    inspectionsStore.persist(records);

    /* A passed/partially-accepted inspection closes the GRN receipt loop
       (Pending Inspection → Received) so the goods-receipt lifecycle
       completes end to end. */
    if ((finalStatus === INSPECTION_STATUS.PASSED || finalStatus === INSPECTION_STATUS.PARTIALLY_ACCEPTED)
        && inspection.grnNo) {
      const grns = grnsStore.all;
      const grnIndex = grns.findIndex((entry) => entry.id === inspection.grnNo);
      if (grnIndex !== -1 && grns[grnIndex].status === GRN_STATUS.PENDING_INSPECTION) {
        grns[grnIndex] = { ...grns[grnIndex], status: GRN_STATUS.RECEIVED };
        grnsStore.persist(grns);
      }
    }
    return clone(records[index]);
  },

  /** ----------------------------- Inventory Update --------------------------- */
  async getInventory({ search = '', type = 'All', page = 1, pageSize = 10 } = {}) {
    if (isApiMode()) {
      /* Server-side paging: one request returns exactly one page. */
      return logisticsApi.inventory({ page, pageSize, search, type });
    }
    await delay();
    return simplePaginate(inventoryStore.all, { search, page, pageSize, filters: { type: toFilter(type) } });
  },

  async getInventoryStats() {
    if (isApiMode()) {
      const raw = await logisticsApi.inventoryStats();
      return {
        total: Number(raw.total) || 0,
        receipts: Number(raw.receipts) || 0,
        adjustments: Number(raw.adjustments) || 0,
        issues: Number(raw.issues) || 0,
        transfers: Number(raw.transfers) || 0,
        netMovement: Number(raw.netMovement) || 0
      };
    }
    await delay();
    const records = inventoryStore.all;
    return {
      total: records.length,
      receipts: records.filter((entry) => entry.type === INVENTORY_TYPE.RECEIPT).length,
      adjustments: records.filter((entry) => entry.type === INVENTORY_TYPE.ADJUSTMENT).length,
      issues: records.filter((entry) => entry.type === INVENTORY_TYPE.ISSUE).length,
      transfers: records.filter((entry) => entry.type === INVENTORY_TYPE.TRANSFER && entry.direction === 'Out').length,
      netMovement: records.reduce((sum, entry) => sum + toNumber(entry.delta), 0)
    };
  },

  async getInventoryById(id) {
    if (isApiMode()) {
      return logisticsApi.inventoryMovement(id);
    }
    await delay();
    return clone(inventoryStore.all.find((entry) => entry.id === id) || null);
  },

  async getInventoryByInspectionNo(inspectionNo) {
    if (isApiMode()) {
      return logisticsApi.inventoryByInspection(inspectionNo);
    }
    await delay();
    const records = inventoryStore.all.filter((entry) => entry.inspectionNo === inspectionNo);
    return clone(records);
  },

  /**
   * Records a manual stock movement (receipt / adjustment / issue).
   *
   * Quantity rules are enforced here — the single place that turns a
   * movement into ledger numbers — so every entry stays consistent:
   *   · Receipt    → delta = +qty   (stock in)
   *   · Issue      → delta = -qty   (stock out)
   *   · Adjustment → delta = signed amount (typed +/- by the user)
   *   · Before     = current on-hand from the ledger (when the caller
   *                  does not supply an explicit historical before value)
   *   · After      = Before + Delta
   *
   * Accepts the legacy { before, delta } shape as well as the newer
   * { quantity, type } shape, normalising both to the same rules.
   */
  async addInventoryUpdate(payload = {}) {
    if (isApiMode()) {
      /* The backend applies the same sign rules and the same on-hand
         guard, and is the only writer of the ledger, so Before/After
         always reconcile with the persisted stock. */
      return logisticsApi.createInventory({
        type: payload.type || INVENTORY_TYPE.ADJUSTMENT,
        sku: payload.sku || '',
        product: payload.product || '',
        warehouse: payload.warehouse || '',
        location: payload.location || '',
        uom: payload.uom || '',
        quantity: payload.quantity,
        delta: payload.delta,
        before: payload.before,
        reference: payload.reference || '',
        notes: payload.notes || '',
        updatedBy: payload.updatedBy || '',
        date: payload.date || '',
        inspectionNo: payload.inspectionNo || '',
        poNo: payload.poNo || '',
        grnNo: payload.grnNo || ''
      });
    }
    await delay();
    const records = inventoryStore.all;
    const type = Object.values(INVENTORY_TYPE).includes(payload.type)
      ? payload.type
      : INVENTORY_TYPE.ADJUSTMENT;
    const sku = String(payload.sku || '').trim();
    const product = String(payload.product || '').trim();
    const warehouse = String(payload.warehouse || '').trim();

    /* Raw quantity: prefer the new `quantity` field, fall back to the
       legacy signed `delta` field so older callers keep working. */
    const hasQuantity = payload.quantity !== undefined && payload.quantity !== null && payload.quantity !== '';
    const hasDelta = payload.delta !== undefined && payload.delta !== null && payload.delta !== '';
    const raw = hasQuantity
      ? toNumber(payload.quantity)
      : hasDelta
        ? toNumber(payload.delta)
        : 0;
    const magnitude = Math.abs(raw);

    /* Transfers are two-sided movements between warehouses/locations —
       they are recorded through transferStock(), never through this
       single-location entry point. */
    if (type === INVENTORY_TYPE.TRANSFER) {
      throw new Error('Stock transfers move goods between warehouses — use the transfer option (from / to warehouse)');
    }

    let delta;
    if (type === INVENTORY_TYPE.RECEIPT) {
      /* A receipt always adds stock — a stray minus sign must not turn
         a receipt into a write-off. */
      delta = magnitude;
    } else if (type === INVENTORY_TYPE.ISSUE) {
      /* An issue always removes stock. */
      delta = -magnitude;
    } else {
      /* Adjustment amount is explicitly signed by the user. */
      delta = hasQuantity || !hasDelta ? raw : magnitude;
    }

    /* Before: explicit historical value wins; otherwise derive on-hand
       from the ledger so Before/After always reconcile with stock. */
    const hasExplicitBefore = payload.before !== undefined && payload.before !== null && payload.before !== '';
    const before = hasExplicitBefore ? toNumber(payload.before) : onHandQuantity({ sku, product, warehouse });
    const after = before + delta;

    /* Negative-stock guard — issues and negative adjustments may never
       push a location below zero unless the caller explicitly opts in
       (allowNegative: true, reserved for audited stock take-ons). */
    if (after < -0.000001 && !payload.allowNegative) {
      throw new Error(
        type === INVENTORY_TYPE.ISSUE
          ? `Insufficient stock: issuing ${magnitude} would take ${product || sku} below zero (on hand ${before}).`
          : `Insufficient stock: this adjustment would take ${product || sku} below zero (on hand ${before}).`
      );
    }

    const record = {
      id: nextInventoryId(records),
      sku,
      product,
      warehouse,
      before,
      delta,
      after,
      type,
      reference: String(payload.reference || '').trim(),
      notes: String(payload.notes || '').trim(),
      updatedOn: payload.date || todayLocal(),
      updatedBy: payload.updatedBy || 'Stores Team',
      createdAt: new Date().toISOString()
    };
    records.push(record);
    inventoryStore.persist(records);
    return clone(record);
  },

  /**
   * Transfers stock between two warehouses/locations as a PAIR of ledger
   * entries (type Transfer): a negative entry out of the source and a
   * positive entry into the destination. Both entries share a
   * `transferRef`, carry the full source-document context and are
   * reversed together — a transfer can never unbalance the ledger.
   */
  async transferStock(payload = {}) {
    if (isApiMode()) {
      return logisticsApi.transferInventory({
        sku: payload.sku || '',
        product: payload.product || '',
        uom: payload.uom || '',
        quantity: payload.quantity,
        fromWarehouse: payload.fromWarehouse || '',
        toWarehouse: payload.toWarehouse || '',
        fromLocation: payload.fromLocation || '',
        toLocation: payload.toLocation || '',
        reference: payload.reference || '',
        notes: payload.notes || '',
        updatedBy: payload.updatedBy || '',
        date: payload.date || ''
      });
    }
    await delay();
    const sku = String(payload.sku || '').trim();
    const product = String(payload.product || '').trim();
    const fromWarehouse = String(payload.fromWarehouse || '').trim();
    const toWarehouse = String(payload.toWarehouse || '').trim();
    const fromLocation = String(payload.fromLocation || '').trim();
    const toLocation = String(payload.toLocation || '').trim();
    if (!sku && !product) throw new Error('Enter a SKU or product name to transfer');
    if (!fromWarehouse || !toWarehouse) throw new Error('Both source and destination warehouses are required');
    const samePlace = fromWarehouse === toWarehouse && (!fromLocation || fromLocation === toLocation);
    if (samePlace) {
      throw new Error('Source and destination must differ (different warehouse or location)');
    }
    const qty = toNumber(payload.quantity);
    if (!Number.isFinite(qty) || qty <= 0) throw new Error('Enter a quantity greater than zero to transfer');

    const records = inventoryStore.all;
    const sourceBefore = onHandQuantity({ sku, product, warehouse: fromWarehouse });
    if (sourceBefore + 0.000001 < qty) {
      throw new Error(`Insufficient stock: transferring ${qty} would take ${product || sku} below zero (on hand ${sourceBefore} in ${fromWarehouse}).`);
    }
    const destinationBefore = onHandQuantity({ sku, product, warehouse: toWarehouse });
    const actor = String(payload.updatedBy || 'Stores Team').trim() || 'Stores Team';
    const now = new Date().toISOString();
    const sourceId = nextInventoryId(records);
    const destinationId = nextInventoryId([...records, { id: sourceId }]);
    const transferRef = payload.transferRef || sourceId;
    const base = {
      sku,
      product,
      uom: payload.uom || '',
      type: INVENTORY_TYPE.TRANSFER,
      transferRef,
      poNo: payload.poNo || '',
      grnNo: payload.grnNo || '',
      reference: String(payload.reference || '').trim() || `Transfer ${sourceId} → ${destinationId}`,
      notes: String(payload.notes || '').trim(),
      updatedBy: actor,
      updatedOn: payload.date || todayLocal(),
      createdAt: now
    };
    const source = {
      ...base,
      id: sourceId,
      warehouse: fromWarehouse,
      location: fromLocation,
      fromWarehouse,
      toWarehouse,
      fromLocation,
      toLocation,
      direction: 'Out',
      counterpartId: destinationId,
      before: sourceBefore,
      delta: -qty,
      after: sourceBefore - qty
    };
    const destination = {
      ...base,
      id: destinationId,
      warehouse: toWarehouse,
      location: toLocation,
      fromWarehouse,
      toWarehouse,
      fromLocation,
      toLocation,
      direction: 'In',
      counterpartId: sourceId,
      before: destinationBefore,
      delta: qty,
      after: destinationBefore + qty
    };
    records.push(source, destination);
    inventoryStore.persist(records);
    return clone({ source, destination });
  },

  /**
   * Reverses a manual stock movement by posting an equal-and-opposite
   * ledger entry linked to the original (`reversalOf`). Business rules:
   *   · Only manual movements can be reversed (records posted from an
   *     inspection carry an `inspectionNo` and are corrected upstream).
   *   · A movement can only be reversed once.
   *   · A reversal entry itself can never be reversed.
   *   · Transfers are two-sided — reversing either leg reverses BOTH legs
   *     so the pair nets back to zero.
   *   · A reversal may never drive stock below zero.
   * The original is stamped with the reversal id so the audit trail is
   * unambiguous and stats stay derived from the ledger.
   */
  async reverseInventoryMovement(id, { notes = '', updatedBy = 'Stores Team' } = {}) {
    if (isApiMode()) {
      return logisticsApi.reverseInventory(id, { notes, updatedBy });
    }
    await delay();
    const records = inventoryStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Inventory movement not found');
    const original = records[index];
    if (original.reversalOf) throw new Error('A reversal entry cannot be reversed');
    if (original.reversalId) throw new Error(`${original.id} has already been reversed`);
    if (original.inspectionNo) {
      throw new Error(`${original.id} was posted from inspection ${original.inspectionNo} — reverse it at the source document instead`);
    }
    const reason = String(notes || '').trim();
    const actor = String(updatedBy || 'Stores Team').trim() || 'Stores Team';
    const now = new Date().toISOString();

    /* ── Equal-and-opposite reversal entry for one ledger row ── */
    const reversalFor = (target, recordsSoFar) => {
      const warehouse = String(target.warehouse || '').trim();
      const sku = String(target.sku || '').trim();
      const product = String(target.product || '').trim();
      const reversalDelta = -toNumber(target.delta);
      const before = onHandQuantity({ sku, product, warehouse });
      const after = before + reversalDelta;
      if (after < -0.000001) {
        throw new Error(
          `Cannot reverse ${target.id}: the reversal would take ${product || sku} below zero in ${warehouse || 'the warehouse'} (on hand ${before}). Adjust stock first.`
        );
      }
      return {
        id: nextInventoryId(recordsSoFar),
        sku: target.sku || '',
        product: target.product || '',
        uom: target.uom || '',
        warehouse,
        location: target.location || '',
        before,
        delta: reversalDelta,
        after,
        type: INVENTORY_TYPE.ADJUSTMENT,
        reference: `Reversal of ${target.id}`,
        notes: reason,
        reversalOf: target.id,
        updatedOn: todayLocal(),
        updatedBy: actor,
        createdAt: now
      };
    };

    /* ── Transfer reversal: both legs together ── */
    if (original.type === INVENTORY_TYPE.TRANSFER) {
      const counterpartIndex = records.findIndex(
        (entry) => entry.id !== original.id && entry.transferRef === original.transferRef && !entry.reversalId && !entry.reversalOf
      );
      if (counterpartIndex === -1) {
        throw new Error(`Cannot reverse transfer ${original.transferRef}: its counterpart entry is missing or already reversed. Adjust stock manually instead.`);
      }
      const counterpart = records[counterpartIndex];
      const first = reversalFor(original, records);
      const second = reversalFor(counterpart, [...records, first]);
      records.push(first, second);
      records[index] = { ...original, reversalId: first.id, reversedOn: first.createdAt };
      records[counterpartIndex] = { ...counterpart, reversalId: second.id, reversedOn: second.createdAt };
      inventoryStore.persist(records);
      return clone({ reversalOut: original.delta < 0 ? first : second, reversalIn: original.delta < 0 ? second : first, reversed: [original.id, counterpart.id] });
    }

    const reversal = reversalFor(original, records);
    records.push(reversal);
    records[index] = { ...original, reversalId: reversal.id, reversedOn: reversal.createdAt };
    inventoryStore.persist(records);
    return clone(reversal);
  },

  /**
   * Full movement ledger + summary for one item (SKU preferred, product
   * name fallback). Used by the Inventory Detail page to render the
   * movement history and current stock summary from real data.
   */
  async getInventoryLedgerForItem({ sku = '', product = '', warehouse = '' } = {}) {
    if (isApiMode()) {
      const raw = await logisticsApi.inventoryLedger({ sku, product, warehouse });
      return {
        records: raw.records || [],
        onHand: Number(raw.onHand) || 0,
        netIn: Number(raw.netIn) || 0,
        netOut: Number(raw.netOut) || 0,
        totalMovements: Number(raw.totalMovements) || 0,
        receipts: Number(raw.receipts) || 0,
        issues: Number(raw.issues) || 0,
        adjustments: Number(raw.adjustments) || 0,
        lastMovementOn: raw.lastMovementOn || ''
      };
    }
    await delay();
    const itemKey = sku ? String(sku).trim() : '';
    const productKey = itemKey ? '' : String(product || '').trim();
    const movements = inventoryStore.all.filter((entry) => {
      const sameItem = itemKey ? entry.sku === itemKey : entry.product === productKey;
      const sameWarehouse = !warehouse || entry.warehouse === warehouse;
      return sameItem && sameWarehouse;
    });
    const sorted = [...movements].sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
    const onHand = movements.reduce((sum, entry) => sum + toNumber(entry.delta), 0);
    const netIn = movements.reduce((sum, entry) => sum + Math.max(0, toNumber(entry.delta)), 0);
    const netOut = movements.reduce((sum, entry) => sum + Math.max(0, -toNumber(entry.delta)), 0);
    return {
      records: clone(sorted),
      onHand,
      netIn,
      netOut,
      totalMovements: movements.length,
      receipts: movements.filter((entry) => entry.type === INVENTORY_TYPE.RECEIPT).length,
      issues: movements.filter((entry) => entry.type === INVENTORY_TYPE.ISSUE).length,
      adjustments: movements.filter((entry) => entry.type === INVENTORY_TYPE.ADJUSTMENT).length,
      lastMovementOn: sorted[0]?.createdAt || sorted[0]?.updatedOn || ''
    };
  },

  /**
   * Current stock position per item + warehouse — derived from the ledger
   * (sum of deltas), never from a counter. Used by reconciliation and the
   * stock-position panels on the Inventory pages.
   */
  async getInventoryBalances() {
    await delay();
    const map = new Map();
    inventoryStore.all.forEach((entry) => {
      const itemKey = String(entry.sku || entry.product || '').trim();
      const warehouse = String(entry.warehouse || '').trim() || 'Unassigned';
      if (!itemKey) return;
      const key = `${itemKey}::${warehouse}`;
      const row = map.get(key) || {
        sku: entry.sku || '',
        product: entry.product || '',
        warehouse: entry.warehouse || '',
        onHand: 0,
        netIn: 0,
        netOut: 0,
        movements: 0,
        lastMovementOn: ''
      };
      const delta = toNumber(entry.delta);
      row.onHand = Math.round((row.onHand + delta) * 1000000) / 1000000;
      row.netIn += Math.max(0, delta);
      row.netOut += Math.max(0, -delta);
      row.movements += 1;
      const ts = entry.createdAt || entry.updatedOn || '';
      if (ts && ts > (row.lastMovementOn || '')) row.lastMovementOn = ts;
      map.set(key, row);
    });
    return clone([...map.values()]);
  },

  /**
   * Reconcile one item/warehouse: ledger on-hand vs the physically
   * counted quantity. Variance = counted − on-hand, so a positive
   * variance means the physical count found MORE stock than the ledger.
   */
  async reconcileInventoryItem({ sku = '', product = '', warehouse = '', expectedQuantity = 0 } = {}) {
    await delay();
    if (!sku && !product) throw new Error('Enter a SKU or product name to reconcile');
    if (!warehouse) throw new Error('Warehouse is required for reconciliation');
    const expected = toNumber(expectedQuantity);
    const ledger = await this.getInventoryLedgerForItem({ sku, product, warehouse });
    const onHand = Math.round(ledger.onHand * 1000000) / 1000000;
    const variance = Math.round((expected - onHand) * 1000000) / 1000000;
    return {
      sku,
      product,
      warehouse,
      onHand,
      expectedQuantity: expected,
      variance,
      matched: Math.abs(variance) < 0.000001,
      movements: ledger.totalMovements,
      lastMovementOn: ledger.lastMovementOn
    };
  },

  /**
   * Audits the whole movement ledger for internal consistency:
   *   · every entry satisfies after = before + delta
   *   · no duplicate transaction ids
   *   · no negative after-quantities (a ledger written through this
   *     service can only go negative via an explicit allowNegative call)
   *   · transfer legs always have an unreversed counterpart
   * Returns the audit summary + the list of problem entries.
   */
  async auditInventoryLedger() {
    await delay();
    const records = inventoryStore.all;
    const errors = [];
    const seen = new Set();
    const transferRefs = new Map();
    records.forEach((entry) => {
      if (seen.has(entry.id)) errors.push({ id: entry.id, reason: 'Duplicate transaction id' });
      seen.add(entry.id);
      const before = toNumber(entry.before);
      const delta = toNumber(entry.delta);
      const after = toNumber(entry.after);
      if (Math.abs(after - (before + delta)) > 0.000001) {
        errors.push({ id: entry.id, reason: `after (${after}) ≠ before (${before}) + delta (${delta})` });
      }
      if (entry.type !== INVENTORY_TYPE.ADJUSTMENT && after < -0.000001 && !entry.reversalOf) {
        errors.push({ id: entry.id, reason: `Negative on-hand after ${entry.type.toLowerCase()} (${after})` });
      }
      if (entry.type === INVENTORY_TYPE.TRANSFER) {
        const list = transferRefs.get(entry.transferRef) || [];
        list.push(entry);
        transferRefs.set(entry.transferRef, list);
      }
    });
    transferRefs.forEach((legs, transferRef) => {
      const unreversed = legs.filter((leg) => !leg.reversalId && !leg.reversalOf);
      if (unreversed.length !== 2) {
        errors.push({ id: transferRef, reason: `Transfer has ${unreversed.length} unreversed leg(s) — expected exactly 2` });
      }
      const net = Math.round(legs.reduce((sum, leg) => sum + toNumber(leg.delta), 0) * 1000000) / 1000000;
      if (net !== 0 && legs.length % 2 === 0) {
        errors.push({ id: transferRef, reason: `Transfer net delta is ${net}, expected 0` });
      }
    });
    return {
      ok: errors.length === 0,
      checked: records.length,
      errors,
      transfers: transferRefs.size
    };
  },

  /**
   * Posts a passed/partially-accepted inspection's ACCEPTED quantity into
   * the inventory ledger. Only a PASSED or PARTIALLY_ACCEPTED inspection
   * that references a received GRN can post; the posted quantity equals
   * the inspection's acceptedQty per line (rejected goods never enter
   * stock). Duplicate postings are refused twice — a `postedAt` stamp on
   * the inspection AND a ledger-level check for an existing receipt
   * referencing the same GRN. Every posting carries the full document
   * chain (PO → GRN → QC) so the inventory trail stays traceable.
   */
  async postInventoryFromInspection(inspectionId, { warehouse = 'Main Store', updatedBy = 'Stores Team' } = {}) {
    await delay();
    /* The ledger stays local in both data modes (there is no inventory API),
       so in API mode the inspection and its GRN are read from the backend
       and then posted into the same ledger. */
    let inspection;
    let inspectionIndex = 0;
    let inspections = inspectionsStore.all;
    let grn;
    if (isApiMode()) {
      /* ONE inspection and ONE GRN — the posting path used to download the
         whole inspection and GRN tables to pick two rows. */
      try {
        inspection = await logisticsApi.inspection(inspectionId);
      } catch {
        inspection = null;
      }
      if (!inspection) throw new Error('Inspection not found');
      inspections = [inspection];
      try {
        grn = await logisticsApi.grn(inspection.grnNo);
      } catch {
        grn = null;
      }
    } else {
      const localIndex = inspections.findIndex((entry) => entry.id === inspectionId);
      if (localIndex === -1) throw new Error('Inspection not found');
      inspectionIndex = localIndex;
      inspection = inspections[localIndex];
      grn = grnsStore.all.find((entry) => entry.id === inspection.grnNo);
    }
    if (inspection.status !== INSPECTION_STATUS.PASSED && inspection.status !== INSPECTION_STATUS.PARTIALLY_ACCEPTED) {
      throw new Error('Only a passed or partially accepted inspection can post to inventory');
    }
    const alreadyPosted = isApiMode() ? withLocalPostingState(inspection) : inspection;
    if (alreadyPosted.postedAt) {
      throw new Error(`${inspection.inspectionNo} has already been posted to inventory`);
    }
    if (!grn) throw new Error(`GRN ${inspection.grnNo} not found`);
    if (grn.status !== GRN_STATUS.RECEIVED) {
      throw new Error('Goods must be received and inspected before posting to inventory');
    }
    /* Ledger-level duplicate guard — no two receipts may reference the
       same GRN, even across different inspection records. Read the live
       ledger so the guard holds in API mode too (where the store is empty). */
    /* Only rows that could collide matter — ask the server for exactly those
       instead of pulling the whole ledger into the browser. */
    const existingLedger = isApiMode()
      ? ((await logisticsApi.inventory({ reference: grn.grnNo, type: INVENTORY_TYPE.RECEIPT, pageSize: 1 }))?.data || [])
      : inventoryStore.all;
    if (existingLedger.some((entry) => entry.type === INVENTORY_TYPE.RECEIPT && entry.reference === grn.grnNo)) {
      throw new Error(`${grn.grnNo} has already been posted to inventory`);
    }

    /* Use inspection items with acceptedQty when available, otherwise
       fall back to GRN received quantities. */
    const inspectionItems = inspection.items || [];
    const hasAcceptedQty = inspectionItems.some((item) => Number(item.acceptedQty) > 0);

    const records = inventoryStore.all;
    /* Source lines: inspection accepted qty when available, otherwise the
       GRN's received quantities. Rejected goods never enter stock. */
    const sourceLines = hasAcceptedQty
      ? inspectionItems
          .filter((item) => Number(item.acceptedQty) > 0)
          .map((item) => ({
            item,
            received: Number(item.receivedQty) || 0,
            accepted: Number(item.acceptedQty) || 0,
            rejected: Number(item.rejectedQty) || 0,
            inspected: Number(item.inspectedQty) || 0
          }))
      : (grn.items || [])
          .filter((item) => Number(item.received) > 0)
          .map((item) => ({
            item,
            received: Number(item.received) || 0,
            accepted: Number(item.received) || 0,
            rejected: 0,
            inspected: Number(item.received) || 0
          }));
    if (sourceLines.length === 0) {
      throw new Error('No accepted quantity to post to inventory');
    }

    if (isApiMode()) {
      /* The ledger is persisted server-side, so each accepted line is posted
         through the inventory API — the backend derives Before/After from the
         stored stock, so successive lines of the same item chain correctly
         and nothing is written only to this browser. */
      const posted = [];
      for (const { item, accepted } of sourceLines) {
        posted.push(await logisticsApi.createInventory({
          type: INVENTORY_TYPE.RECEIPT,
          sku: item.sku || item.itemCode || '',
          product: item.product || '',
          uom: item.uom || 'Nos',
          warehouse,
          location: grn.warehouse || '',
          quantity: accepted,
          reference: grn.grnNo,
          poNo: grn.poNo || '',
          grnNo: grn.grnNo,
          inspectionNo: inspection.inspectionNo,
          updatedBy,
          notes: `Posted from inspection ${inspection.inspectionNo}`
        }));
      }
      return posted;
    }

    /* Before/After are read from the LIVE ledger (the single source of
       truth): successive lines of the same item in one posting chain from
       the running on-hand, so every receipt reconciles with stock. */
    const running = new Map();
    const runKey = (item) => `${(item.sku || item.itemCode || '').trim().toLowerCase() || (item.product || '').trim().toLowerCase()}::wh:${warehouse.trim().toLowerCase()}`;
    const onHandFor = (item) => {
      const key = runKey(item);
      if (!running.has(key)) {
        running.set(key, onHandQuantity({ sku: item.sku || item.itemCode || '', product: item.product || '', warehouse }));
      }
      return running.get(key);
    };
    const posts = [];
    let cumulative = records;
    sourceLines.forEach(({ item, received, accepted, rejected, inspected }) => {
      const before = onHandFor(item);
      const after = before + accepted;
      running.set(runKey(item), after);
      const id = nextInventoryId(cumulative);
      cumulative = [...cumulative, { id }];
      posts.push({
        id,
        sku: item.sku || item.itemCode || '',
        itemCode: item.itemCode || '',
        product: item.product || '',
        uom: item.uom || 'Nos',
        warehouse,
        location: grn.warehouse || '',
        before,
        delta: accepted,
        after,
        type: INVENTORY_TYPE.RECEIPT,
        reference: grn.grnNo,
        poNo: grn.poNo || '',
        grnNo: grn.grnNo,
        inspectionNo: inspection.inspectionNo,
        shipmentNo: grn.shipmentNo || '',
        receivedQty: received,
        acceptedQty: accepted,
        rejectedQty: rejected,
        inspectedQty: inspected,
        postedQty: accepted,
        pendingQty: 0,
        status: 'Posted',
        batchLot: '',
        updatedOn: todayLocal(),
        updatedBy,
        createdAt: new Date().toISOString()
      });
    });
    records.push(...posts);
    inventoryStore.persist(records);

    inspections[inspectionIndex] = { ...inspection, postedAt: new Date().toISOString() };
    inspectionsStore.persist(inspections);
    return clone(posts);
  }
};
