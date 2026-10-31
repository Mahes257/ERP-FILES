/**
 * purchase/services/itemCatalog.js
 * ------------------------------------------------------------------
 * ERP Item / Product Master for the Purchase module.
 *
 * Every line-item document (PR · RFQ · Quotation · PO · Packing · GRN ·
 * Inventory · Invoice) draws its item definitions from this single
 * master. When a user picks an item (by SKU or name) in a document
 * form, `itemToLine` auto-fills the line with the master attributes —
 * name, category, HSN/SAC, tax, UOMs and default rate — so the same
 * item is defined exactly once and every document stays consistent.
 *
 * Each item carries:
 *   SKU (itemCode) · Item Name (product) · Description · Category ·
 *   UOM (purchase UOM) · Stock UOM · UOM conversion (factor from
 *   purchase → stock) · HSN/SAC · Tax · Default Rate ·
 *   Preferred Vendors · Lead Time · Minimum Stock · Reorder Level ·
 *   Warehouse · Batch Tracking · Serial Tracking · Active/Inactive
 *
 * Persistence: localStorage (purchase.itemCatalog.v1).
 * Legacy records (the older minimal shape) are normalised on read so
 * existing data keeps working untouched.
 * ------------------------------------------------------------------ */


const STORAGE_KEY = 'purchase.itemCatalog.v1';

/* ------------------------------------------------------------------ */
/*  Seed data — extracted from demo PR/RFQ/PO records. The master is   */
/*  the single source for new documents; legacy records keep their own */
/*  inline copies so nothing already in flight breaks.                 */
/* ------------------------------------------------------------------ */
const SEED_ITEMS = [
  { itemCode: 'HR-3MM', product: 'Hot rolled steel sheet 3mm (IS 2062 E250)', category: 'Raw Material', hsn: '7208', uom: 'Kg', standardRate: 24.5, tax: 18, leadTimeDays: 14, minStock: 5000, reorderLevel: 8000, warehouse: 'Plant A Store' },
  { itemCode: 'MS-6MM', product: 'MS plate 6mm', category: 'Raw Material', hsn: '7208', uom: 'Kg', standardRate: 28, tax: 18, leadTimeDays: 14, minStock: 1000, reorderLevel: 1500, warehouse: 'Plant A Store' },
  { itemCode: 'PC-DT-01', product: 'Dell OptiPlex 7020 Tower', category: 'IT & Office Equipment', hsn: '8471', uom: 'Nos', standardRate: 5800, tax: 18, leadTimeDays: 7, minStock: 2, reorderLevel: 5, warehouse: 'IT Store' },
  { itemCode: 'PC-MON-01', product: 'Dell 24 inch monitor', category: 'IT & Office Equipment', hsn: '8528', uom: 'Nos', standardRate: 1200, tax: 18, leadTimeDays: 7, minStock: 2, reorderLevel: 5, warehouse: 'IT Store' },
  { itemCode: 'VFD-15KW', product: 'VFD drive 15 kW', category: 'Electrical & Automation', hsn: '8504', uom: 'Nos', standardRate: 14500, tax: 18, leadTimeDays: 21, minStock: 1, reorderLevel: 2, warehouse: 'Main Store' },
  { itemCode: 'CTR-65A', product: 'Power contactor 65A', category: 'Electrical & Automation', hsn: '8536', uom: 'Nos', standardRate: 850, tax: 18, leadTimeDays: 21, minStock: 4, reorderLevel: 8, warehouse: 'Main Store' },
  { itemCode: 'PLC-CPU', product: 'Siemens S7-1500 CPU 1515-2 PN', category: 'Electrical & Automation', hsn: '8537', uom: 'Nos', standardRate: 285000, tax: 18, leadTimeDays: 45, minStock: 1, reorderLevel: 1, warehouse: 'Main Store' },
  { itemCode: 'PLC-IO', product: 'SM 321 DI 32x24VDC', category: 'Electrical & Automation', hsn: '8537', uom: 'Nos', standardRate: 12800, tax: 18, leadTimeDays: 45, minStock: 1, reorderLevel: 2, warehouse: 'Main Store' },
  { itemCode: 'PLC-PROG', product: 'TIA Portal V18 license', category: 'Electrical & Automation', hsn: '8523', uom: 'Pack', standardRate: 65000, tax: 18, leadTimeDays: 15, minStock: 0, reorderLevel: 1, warehouse: 'Main Store' },
  { itemCode: 'FL-DN150', product: 'Forged flange DN150', category: 'Forgings & Castings', hsn: '7307', uom: 'Nos', standardRate: 1850, tax: 18, leadTimeDays: 30, minStock: 10, reorderLevel: 20, warehouse: 'Plant B Store' },
  { itemCode: 'FL-DN100', product: 'Forged flange DN100', category: 'Forgings & Castings', hsn: '7307', uom: 'Nos', standardRate: 1250, tax: 18, leadTimeDays: 30, minStock: 10, reorderLevel: 20, warehouse: 'Plant B Store' },
  { itemCode: 'LED-BH-20', product: 'LED bulkhead 20W', category: 'Electrical & Automation', hsn: '9405', uom: 'Nos', standardRate: 420, tax: 18, leadTimeDays: 10, minStock: 20, reorderLevel: 40, warehouse: 'Main Store' },
  { itemCode: 'LED-HB-200', product: 'LED high bay 200W', category: 'Electrical & Automation', hsn: '9405', uom: 'Nos', standardRate: 1550, tax: 18, leadTimeDays: 10, minStock: 5, reorderLevel: 10, warehouse: 'Main Store' },
  { itemCode: 'CAL-CAL-01', product: 'Digital caliper 150mm', category: 'Instruments & Calibration', hsn: '9017', uom: 'Nos', standardRate: 3200, tax: 18, leadTimeDays: 20, minStock: 1, reorderLevel: 2, warehouse: 'Main Store' },
  { itemCode: 'CAL-HT-01', product: 'Hardness tester kit', category: 'Instruments & Calibration', hsn: '9024', uom: 'Nos', standardRate: 5200, tax: 18, leadTimeDays: 30, minStock: 1, reorderLevel: 1, warehouse: 'Main Store' },
  { itemCode: 'CRCA-12', product: 'CRCA coil 1.2mm', category: 'Raw Material', hsn: '7209', uom: 'Kg', standardRate: 18, tax: 18, leadTimeDays: 14, minStock: 8000, reorderLevel: 12000, warehouse: 'Plant A Store' },
  { itemCode: 'CRCA-08', product: 'CRCA sheet 0.8mm', category: 'Raw Material', hsn: '7209', uom: 'Kg', standardRate: 20, tax: 18, leadTimeDays: 14, minStock: 3000, reorderLevel: 5000, warehouse: 'Plant A Store' },
  { itemCode: 'WLD-ER70', product: 'ER70S-6 welding wire 1.2mm', category: 'Consumables', hsn: '7217', uom: 'Kg', standardRate: 85, tax: 18, leadTimeDays: 10, minStock: 50, reorderLevel: 100, warehouse: 'Central Store' },
  { itemCode: 'WLD-E6013', product: 'E6013 welding electrode 3.15mm', category: 'Consumables', hsn: '7217', uom: 'Kg', standardRate: 65, tax: 18, leadTimeDays: 10, minStock: 40, reorderLevel: 80, warehouse: 'Central Store' },
  { itemCode: 'CVL-OPC', product: 'OPC 43 cement', category: 'Consumables', hsn: '2523', uom: 'Ton', stockUom: 'Kg', uomConversion: { factor: 1000 }, standardRate: 380, tax: 28, leadTimeDays: 5, minStock: 10, reorderLevel: 20, warehouse: 'Central Store' },
  { itemCode: 'CVL-TMT', product: 'TMT bar 16mm', category: 'Raw Material', hsn: '7214', uom: 'Ton', stockUom: 'Kg', uomConversion: { factor: 1000 }, standardRate: 52000, tax: 18, leadTimeDays: 7, minStock: 5, reorderLevel: 10, warehouse: 'Plant A Store' },
  { itemCode: 'CBL-3C25', product: 'FR-LSH armoured cable 3Cx2.5 sq mm', category: 'Electrical & Automation', hsn: '8544', uom: 'Meter', standardRate: 42, tax: 18, leadTimeDays: 15, minStock: 200, reorderLevel: 400, warehouse: 'Central Store' },
  { itemCode: 'CBL-3C10', product: 'FR-LSH armoured cable 3Cx10 sq mm', category: 'Electrical & Automation', hsn: '8544', uom: 'Meter', standardRate: 120, tax: 18, leadTimeDays: 15, minStock: 100, reorderLevel: 250, warehouse: 'Central Store' },
  { itemCode: 'HYD-HSE-DN19', product: 'Hydraulic hose DN19', category: 'Spares', hsn: '4009', uom: 'Meter', standardRate: 285, tax: 18, leadTimeDays: 20, minStock: 20, reorderLevel: 50, warehouse: 'Plant B Store' },
  { itemCode: 'HYD-QC-G12', product: 'Quick coupling G1/2', category: 'Spares', hsn: '7307', uom: 'Nos', standardRate: 430, tax: 18, leadTimeDays: 20, minStock: 10, reorderLevel: 25, warehouse: 'Plant B Store' },
  { itemCode: 'SS-PIPE-50NB', product: 'SS 304 seamless pipe 50NB', category: 'Raw Material', hsn: '7304', uom: 'Meter', standardRate: 1150, tax: 18, leadTimeDays: 30, minStock: 30, reorderLevel: 60, warehouse: 'Plant A Store' },
  { itemCode: 'SS-PIPE-25NB', product: 'SS 304 seamless pipe 25NB', category: 'Raw Material', hsn: '7304', uom: 'Meter', standardRate: 640, tax: 18, leadTimeDays: 30, minStock: 30, reorderLevel: 60, warehouse: 'Plant A Store' },
  { itemCode: 'SAF-SHOE-01', product: 'Safety shoes (steel toe)', category: 'PPE & Safety', hsn: '6403', uom: 'Pair', standardRate: 950, tax: 12, leadTimeDays: 10, minStock: 10, reorderLevel: 25, warehouse: 'Central Store', preferredVendors: ['SafetyPlus India'] },
  { itemCode: 'SAF-HELM-01', product: 'Safety helmet', category: 'PPE & Safety', hsn: '6506', uom: 'Nos', standardRate: 260, tax: 12, leadTimeDays: 10, minStock: 20, reorderLevel: 40, warehouse: 'Central Store', preferredVendors: ['SafetyPlus India'] },
  { itemCode: 'SW-24P-01', product: 'Managed switch 24 port', category: 'IT & Office Equipment', hsn: '8517', uom: 'Nos', standardRate: 6200, tax: 18, leadTimeDays: 14, minStock: 1, reorderLevel: 3, warehouse: 'IT Store' },
  { itemCode: 'WS-EXEC-01', product: 'Executive workstation', category: 'IT & Office Equipment', hsn: '9403', uom: 'Nos', standardRate: 18500, tax: 18, leadTimeDays: 21, minStock: 1, reorderLevel: 2, warehouse: 'IT Store' }
];

/* ------------------------------------------------------------------ */
/*  Normalisation — every legacy/minimal record gets the full ERP      */
/*  field set with safe defaults, so existing data keeps working.      */
/* ------------------------------------------------------------------ */
export function normalizeItem(item = {}, index = 0) {
  const uom = item.uom || 'Nos';
  const conversion = item.uomConversion || null;
  return {
    id: item.id || (item.itemCode ? `seed-${index + 1}` : `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    itemCode: item.itemCode || '',
    product: item.product || '',
    description: item.description || '',
    category: item.category || '',
    /* Purchase UOM (the UOM documents order in) */
    uom,
    /* Stock UOM (the UOM inventory is tracked in) — defaults to the
       purchase UOM when no separate conversion exists. */
    stockUom: item.stockUom || (conversion ? (conversion.toUom || '') : uom) || uom,
    uomConversion: conversion || null,
    hsn: item.hsn || '',
    tax: Number(item.tax) || 0,
    standardRate: Number(item.standardRate) || 0,
    preferredVendors: Array.isArray(item.preferredVendors) ? item.preferredVendors : [],
    leadTimeDays: Number(item.leadTimeDays) || 0,
    minStock: Number(item.minStock) || 0,
    reorderLevel: Number(item.reorderLevel) || 0,
    warehouse: item.warehouse || '',
    batchTracking: Boolean(item.batchTracking),
    serialTracking: Boolean(item.serialTracking),
    /* Legacy records have no `active` flag — default them to active;
       explicit falsy (false / 0) stays inactive. */
    active: item.active === undefined ? true : Boolean(item.active)
  };
}

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                    */
/* ------------------------------------------------------------------ */
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(normalizeItem);
    }
  } catch { /* ignore */ }
  return SEED_ITEMS.map((item, i) => normalizeItem(item, i));
}

function persist(items) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch { /* full */ }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/** Return all active catalog items. */
export function getActiveItems() {
  return loadAll().filter((i) => i.active !== false);
}

/** Return all items (active + inactive) for the settings page. */
export function getAllItems() {
  return loadAll();
}

/** Find a single item by id. */
export function getItemById(id) {
  return loadAll().find((i) => i.id === id) || null;
}

/** Find an item by SKU (item code) or exact product name. */
export function getItemByCode(code) {
  const q = String(code || '').trim().toLowerCase();
  if (!q) return null;
  return loadAll().find((i) =>
    i.itemCode.toLowerCase() === q || i.product.toLowerCase() === q
  ) || null;
}

/** Find items matching a search term (SKU, name, description, category,
 *  HSN or preferred vendor). */
export function searchItems(term) {
  const q = String(term).trim().toLowerCase();
  if (!q) return getActiveItems();
  return getActiveItems().filter((i) => {
    const haystack = [
      i.itemCode, i.product, i.description, i.category, i.hsn,
      ...(i.preferredVendors || [])
    ].join(' ').toLowerCase();
    return haystack.includes(q);
  });
}

/**
 * Map a master item onto a document line-item row (the auto-fill
 * payload used by the PR / RFQ / PO forms): name, category, HSN, UOMs,
 * default rate and tax all come from the single item master.
 */
export function itemToLine(item) {
  const normalized = normalizeItem(item || {});
  return {
    product: normalized.product,
    category: normalized.category,
    hsn: normalized.hsn,
    uom: normalized.uom,
    rate: normalized.standardRate,
    gstRate: normalized.tax
  };
}

/**
 * Convert a purchase-UOM quantity into the stock UOM using the item's
 * configured conversion factor (stock units per 1 purchase unit).
 * Returns the converted number; without a conversion the quantity is
 * returned unchanged.
 */
export function convertQuantity(item, quantity, fromUom = '') {
  const normalized = normalizeItem(item || {});
  const qty = Number(quantity) || 0;
  if (!normalized.uomConversion || !Number.isFinite(Number(normalized.uomConversion.factor))) {
    return qty;
  }
  /* Only convert when the caller's UOM matches the purchase UOM and a
     separate stock UOM is configured. */
  const same = !fromUom || String(fromUom).toLowerCase() === String(normalized.uom).toLowerCase();
  if (!same || !normalized.stockUom || normalized.stockUom === normalized.uom) return qty;
  return Math.round(qty * Number(normalized.uomConversion.factor) * 10000) / 10000;
}

/** Add a new catalog item. Returns { ok, item, error }. */
export function addItem(data) {
  if (!data?.itemCode || !data?.product) {
    return { ok: false, error: 'Item code and product name are required.' };
  }
  const items = loadAll();
  if (items.some((i) => i.itemCode.toLowerCase() === String(data.itemCode).trim().toLowerCase())) {
    return { ok: false, error: `Item code "${data.itemCode}" already exists.` };
  }
  const item = normalizeItem({
    ...data,
    id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    preferredVendors: Array.isArray(data.preferredVendors)
      ? data.preferredVendors.filter(Boolean)
      : String(data.preferredVendors || '').split(',').map((v) => v.trim()).filter(Boolean)
  });
  items.push(item);
  persist(items);
  return { ok: true, item };
}

/** Update an existing catalog item. Returns { ok, item, error }. */
export function updateItem(id, patch) {
  const items = loadAll();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return { ok: false, error: 'Item not found.' };
  if (patch.itemCode && items.some((i) => i.itemCode.toLowerCase() === String(patch.itemCode).trim().toLowerCase() && i.id !== id)) {
    return { ok: false, error: `Item code "${patch.itemCode}" already exists.` };
  }
  items[idx] = normalizeItem({ ...items[idx], ...patch, preferredVendors: patch.preferredVendors !== undefined ? (Array.isArray(patch.preferredVendors) ? patch.preferredVendors : String(patch.preferredVendors).split(',').map((v) => v.trim()).filter(Boolean)) : items[idx].preferredVendors });
  persist(items);
  return { ok: true, item: items[idx] };
}

/** Remove a catalog item (soft-delete by setting active=false). */
export function removeItem(id) {
  return updateItem(id, { active: false });
}

/** Hard-delete (only for non-seed items). */
export function hardDeleteItem(id) {
  const items = loadAll();
  const item = items.find((i) => i.id === id);
  if (!item) return { ok: false, error: 'Item not found.' };
  if (String(id).startsWith('seed-')) {
    return { ok: false, error: 'Cannot delete seed items.' };
  }
  persist(items.filter((i) => i.id !== id));
  return { ok: true };
}