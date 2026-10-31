/**
 * detailColumns.js — the SHARED read-only column layer for every Sales &
 * Marketing View / Preview / PDF surface.
 * ------------------------------------------------------------------------
 * The editable grids and the read-only surfaces must never drift apart, so
 * this module owns ONE definition of:
 *
 *   · the default column sets a detail table falls back to
 *     (`DETAIL_COLUMN_SETS` — built from the SAME builders the editable grids
 *     use, so the column ids/keys/widths always match), and
 *   · how a saved column VALUE is resolved for display/print
 *     (`resolveDetailValue` — qty, rates, computed amounts, custom columns…).
 *
 * A View/Preview page therefore only needs:
 *
 *   1. the persisted column configuration (MySQL grid config store or the
 *      record's own saved column JSON — see useDetailColumns), and
 *   2. the record's item rows,
 *
 * and it renders the exact same columns, order, labels and visibility the user
 * configured in the creation/edit grid. Nothing is hardcoded per page.
 *
 * Historical documents stay immutable: when a record carries its own saved
 * column configuration, that configuration wins over the module default.
 */

import { defaultQuotationItemColumns, defaultSalesItemsColumns } from './salesItemsColumns';
import { defaultSalesOrderItemColumns } from './salesOrderColumns';
import { normalizeGridColumns } from './gridColumns';

/* ------------------------------------------------------------------ *
 * Value resolution
 * ------------------------------------------------------------------ */

const isEmpty = (v) => v === null || v === undefined || v === '';

function asNumber(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Default money/number formatting used when the caller passes no ctx. */
const defaultCtx = {
  money: (v) => {
    const n = asNumber(v, 0);
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  },
  number: (v) => String(asNumber(v, 0)),
  text: (v) => (isEmpty(v) ? '' : String(v))
};

function ctxFormat(ctx, kind, value, fallback) {
  const fn = ctx && typeof ctx[kind] === 'function' ? ctx[kind] : defaultCtx[kind];
  try {
    return fn ? fn(value) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Per-key resolvers. Each returns a DISPLAY STRING (used by both the on-screen
 * detail tables and the print/PDF builders, so the two can never diverge).
 * A key missing from this map falls through to the row's own field, which is
 * what makes user-added custom columns work automatically.
 */
const RESOLVERS = {
  /* --- shared item keys (sales items + quotation items) --- */
  sno: (row, ctx) => ctxFormat(ctx, 'text', row.__index ?? ''),
  sku: (row, ctx) => ctxFormat(ctx, 'text', row.sku ?? row.itemCode ?? row.productCode),
  qty: (row, ctx) => ctxFormat(ctx, 'number', row.qty ?? row.quantity ?? 0),
  unit: (row, ctx) => ctxFormat(ctx, 'text', row.unit || row.uom),
  hsn: (row, ctx) => ctxFormat(ctx, 'text', row.hsn || row.hsnCode),
  desc: (row, ctx) => ctxFormat(ctx, 'text', row.description ?? row.itemDescription ?? row.desc),
  gst: (row) => `${asNumber(row.gstRate ?? row.tax ?? row.gst, 0)}%`,
  rate: (row, ctx) => ctxFormat(ctx, 'money', row.rate ?? row.unitPrice ?? 0),
  amount: (row, ctx) => ctxFormat(ctx, 'money', row.amount ?? row.totalAmount ?? row.total ?? 0),
  discount: (row) => `${asNumber(row.discountPct ?? row.discount, 0)}%`,
  // Taxable value: the amount the GST is applied to. `netAmount` is the field
  // the Credit Note (and every other sales item) response actually returns —
  // backend `net = grossAmount − discountAmount`, i.e. exactly the taxable
  // value; `taxable`/`taxableAmount` stay first for stored snapshots and any
  // older payload. The chain uses `??`, so a legitimate numeric 0 is kept (only
  // null/undefined fall through), and `amount`/`total` (which include tax) are
  // deliberately NOT used here. A `taxable` column exists only in the
  // credit-note column set, so this cannot change another module's figures.
  taxable: (row, ctx) => ctxFormat(ctx, 'money', row.taxable ?? row.taxableAmount ?? row.netAmount ?? 0),
  total: (row, ctx) => ctxFormat(ctx, 'money', row.total ?? row.amount ?? row.totalAmount ?? 0),

  /* --- extended sales-item keys (export / packing list) --- */
  drawingNo: (row, ctx) => ctxFormat(ctx, 'text', row.drawingNo ?? row.drawingNumber),
  material: (row, ctx) => ctxFormat(ctx, 'text', row.material),
  manufacturer: (row, ctx) => ctxFormat(ctx, 'text', row.manufacturer),
  countryOfOrigin: (row, ctx) => ctxFormat(ctx, 'text', row.countryOfOrigin),
  marksNos: (row, ctx) => ctxFormat(ctx, 'text', row.marksNos ?? row.marksAndNos),
  noKindPkgs: (row, ctx) => ctxFormat(ctx, 'text', row.noKindPkgs ?? row.packages),
  netWeight: (row, ctx) => ctxFormat(ctx, 'text', row.netWeight),
  grossWeight: (row, ctx) => ctxFormat(ctx, 'text', row.grossWeight),

  /* --- CPR item details --- */
  cprDrawingNo: (row, ctx) => ctxFormat(ctx, 'text', row.drawingNo),
  cprDescription: (row, ctx) => ctxFormat(ctx, 'text', row.itemDescription ?? row.description),
  cprSpecification: (row, ctx) => ctxFormat(ctx, 'text', row.specification ?? row.spec),
  cprQty: (row, ctx) => ctxFormat(ctx, 'number', row.qty ?? row.quantity ?? 0),
  cprUom: (row, ctx) => ctxFormat(ctx, 'text', row.uom || row.unit),
  cprEstCost: (row, ctx) => ctxFormat(ctx, 'money', row.estimatedCost ?? row.estCost ?? row.unitPrice ?? 0),
  cprTotal: (row, ctx) => ctxFormat(ctx, 'money', row.totalCost ?? row.total ?? row.amount ?? 0),
  cprRemarks: (row, ctx) => ctxFormat(ctx, 'text', row.remarks),

  /* --- Cost Workout / Profit Workout items --- */
  cwDescription: (row, ctx) => ctxFormat(ctx, 'text', row.description ?? row.itemDescription),
  cwQty: (row, ctx) => ctxFormat(ctx, 'number', row.qty ?? row.quantity ?? 0),
  cwCategory: (row, ctx) => ctxFormat(ctx, 'text', row.category),
  cwUnit: (row, ctx) => ctxFormat(ctx, 'text', row.unit || row.uom),
  cwRate: (row, ctx) => ctxFormat(ctx, 'money', row.rate ?? row.costRate ?? 0),
  cwAmount: (row, ctx) => ctxFormat(ctx, 'money', row.amount ?? row.costAmount ?? 0),
  cwRemarks: (row, ctx) => ctxFormat(ctx, 'text', row.remarks),
  pwCostRate: (row, ctx) => ctxFormat(ctx, 'money', row.costRate ?? row.rate ?? 0),
  pwSellingRate: (row, ctx) => ctxFormat(ctx, 'money', row.sellingRate ?? 0),
  pwCostAmount: (row, ctx) => ctxFormat(ctx, 'money', row.costAmount ?? row.amount ?? 0),
  pwSellingAmount: (row, ctx) => ctxFormat(ctx, 'money', row.sellingAmount ?? 0),
  pwProfitUnit: (row, ctx) => ctxFormat(ctx, 'money', row.profitPerUnit ?? 0),
  pwProfitAmount: (row, ctx) => ctxFormat(ctx, 'money', row.profitAmount ?? 0),
  pwMargin: (row) => `${asNumber(row.marginPercent ?? row.margin, 0)}%`
};

/**
 * Resolve one column's display value for a row.
 *
 * @param {object} column  the saved column definition { key, id, type, … }
 * @param {object} row     the record's item/detail row
 * @param {object} [ctx]   optional overrides: { money, number, text }
 * @returns {string}
 */
export function resolveDetailValue(column, row, ctx) {
  if (!column || !row) return '';
  const key = column.key;
  // 1. A user-defined column reads its per-row saved value (independent per
  //    row, keyed by the column's stable id — never derived from its label).
  if (!column.system) {
    const raw = row.customFields ? row.customFields[column.id] : row[column.id];
    if (column.type === 'number') return isEmpty(raw) ? '' : ctxFormat(ctx, 'number', raw);
    if (column.type === 'date') return isEmpty(raw) ? '' : ctxFormat(ctx, 'text', raw);
    return ctxFormat(ctx, 'text', raw);
  }
  // 2. A known business column uses its shared resolver.
  const resolver = RESOLVERS[key];
  if (resolver) return resolver(row, ctx) ?? '';
  // 3. Unknown/system keys fall through to the raw field so a renamed column
  //    (or a future field) still shows its saved value.
  return ctxFormat(ctx, 'text', row[key]);
}

/* ------------------------------------------------------------------ *
 * Default column sets
 * ------------------------------------------------------------------ */

const cp = (cols) => cols.map((c) => ({ ...c }));

/**
 * Named default column sets. The `gridKey` is the SAME key the editable grid
 * persists to, which is what makes the View/Preview automatically follow the
 * user's configuration.
 */
export const DETAIL_COLUMN_SETS = {
  quotationItems: {
    gridKey: 'sales.items.quotation',
    defaults: () => cp(defaultQuotationItemColumns({ showSku: true, showHsn: true }))
  },
  proformaItems: {
    gridKey: 'sales.items.proforma',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'proforma', showHsn: true }))
  },
  invoiceItems: {
    gridKey: 'sales.items.invoice',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'invoice', showHsn: true }))
  },
  creditNoteItems: {
    gridKey: 'sales.items.creditNote',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'creditNote', showHsn: true }))
  },
  packingListItems: {
    gridKey: 'sales.items.packingList',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'packingList', showHsn: true }))
  },
  exportItems: {
    gridKey: 'sales.items.export',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'export', showHsn: true }))
  },
  proformaExportItems: {
    gridKey: 'sales.items.proformaExport',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'proformaExport', showHsn: true }))
  },
  defaultItems: {
    gridKey: 'sales.items.default',
    defaults: () => cp(defaultSalesItemsColumns({ variant: 'default', showHsn: true }))
  },
  // Customer Purchase Order item grid — the SAME configuration the CPO
  // create/edit grid writes to MySQL, so View/Preview/Print/PDF render exactly
  // the columns (order, labels, visibility, custom columns) the user set.
  salesOrderItems: {
    gridKey: 'sales.items.salesOrder',
    defaults: () => cp(defaultSalesOrderItemColumns({ showHsn: true }))
  },
  costWorkoutItems: {
    gridKey: 'sales.items.costworkout',
    defaults: () => ([
      { id: 'sno', key: 'sno', label: 'S.No', width: 46, align: 'center', system: true, required: true },
      { id: 'cwDescription', key: 'cwDescription', label: 'Description', width: 280, system: true },
      { id: 'cwQty', key: 'cwQty', label: 'Qty', width: 80, align: 'center', system: true },
      { id: 'cwCategory', key: 'cwCategory', label: 'Category', width: 140, system: true },
      { id: 'cwUnit', key: 'cwUnit', label: 'Unit', width: 90, align: 'center', system: true },
      { id: 'cwRate', key: 'cwRate', label: 'Rate', width: 110, align: 'right', system: true },
      { id: 'cwAmount', key: 'cwAmount', label: 'Amount', width: 120, align: 'right', system: true },
      { id: 'cwRemarks', key: 'cwRemarks', label: 'Remarks', width: 180, system: true }
    ])
  },
  profitWorkoutItems: {
    gridKey: 'sales.items.profitworkout',
    defaults: () => ([
      { id: 'sno', key: 'sno', label: 'S.No', width: 46, align: 'center', system: true, required: true },
      { id: 'cwDescription', key: 'cwDescription', label: 'Description', width: 260, system: true },
      { id: 'cwQty', key: 'cwQty', label: 'Qty', width: 76, align: 'center', system: true },
      { id: 'cwCategory', key: 'cwCategory', label: 'Category', width: 130, system: true },
      { id: 'cwUnit', key: 'cwUnit', label: 'Unit', width: 84, align: 'center', system: true },
      { id: 'pwCostRate', key: 'pwCostRate', label: 'Cost Rate', width: 110, align: 'right', system: true },
      { id: 'pwSellingRate', key: 'pwSellingRate', label: 'Selling Rate', width: 110, align: 'right', system: true },
      { id: 'pwCostAmount', key: 'pwCostAmount', label: 'Cost Amount', width: 120, align: 'right', system: true },
      { id: 'pwSellingAmount', key: 'pwSellingAmount', label: 'Selling Amount', width: 130, align: 'right', system: true },
      { id: 'pwProfitUnit', key: 'pwProfitUnit', label: 'Profit / Unit', width: 110, align: 'right', system: true },
      { id: 'pwProfitAmount', key: 'pwProfitAmount', label: 'Profit Amount', width: 120, align: 'right', system: true },
      { id: 'pwMargin', key: 'pwMargin', label: 'Margin %', width: 100, align: 'right', system: true }
    ])
  }
};

/**
 * Normalize a saved configuration against a named set's defaults.
 * `recordColumns` (a document's own saved JSON, e.g. CPR's itemColumnsJson)
 * takes precedence — that is what keeps historical versions immutable.
 */
export function detailColumnsFor(setName, { recordColumns, hideKeys = [] } = {}) {
  const set = DETAIL_COLUMN_SETS[setName];
  const defaults = set ? set.defaults() : [];
  const source = Array.isArray(recordColumns) && recordColumns.length > 0 ? recordColumns : null;
  const normalized = normalizeGridColumns(source, defaults);
  return normalized.filter((c) => !hideKeys.includes(c.key));
}

/** Ordered, visible columns only (what a detail table actually renders). */
export function visibleDetailColumns(columns) {
  return (columns || [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .filter((c) => !c.hidden);
}

/** The gridKey a named set persists to (null for unknown sets). */
export function gridKeyForSet(setName) {
  return DETAIL_COLUMN_SETS[setName]?.gridKey || null;
}

/** Document "type" values that use the export item-grid variant. */
const EXPORT_TYPES = new Set([
  'export', 'export invoice', 'export proforma', 'export proforma invoice',
  'export quotation', 'export packing list'
]);

function isExportDocument(doc) {
  const raw = String(doc?.invoiceType || doc?.quotationType || doc?.type || doc?.piType || '').toLowerCase();
  return EXPORT_TYPES.has(raw) || raw.includes('export');
}

/**
 * Which named column set a module's View/Preview must render.
 * Mirrors EXACTLY the variant each creation form's item grid persists to, so
 * the read-only surface can never drift from the editable one.
 */
export function itemColumnSetForModule(moduleKey, doc) {
  const isExport = isExportDocument(doc);
  switch (moduleKey) {
    case 'quotation':
      return 'quotationItems';
    case 'proformaInvoice':
      return isExport ? 'proformaExportItems' : 'proformaItems';
    case 'creditNote':
      return 'creditNoteItems';
    case 'packingList':
      return 'packingListItems';
    case 'salesOrder':
      // The CPO has its OWN item grid configuration (sales.items.salesOrder),
      // so its detail/preview/PDF columns follow the CPO grid the user set.
      return 'salesOrderItems';
    case 'invoice':
    case 'salesContract':
    case 'deliveryChallan':
      return isExport ? 'exportItems' : 'invoiceItems';
    default:
      return null;
  }
}

/**
 * Rows for a detail table: attaches the 1-based index used by the serial
 * column and (unless already present) an empty customFields bag so custom
 * columns resolve to '' instead of throwing on old records.
 */
export function detailRows(rows) {
  return (rows || []).map((row, i) => ({
    ...(row || {}),
    __index: i + 1,
    customFields: (row && row.customFields) || {}
  }));
}
