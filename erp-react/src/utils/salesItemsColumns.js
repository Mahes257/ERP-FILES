/**
 * salesItemsColumns.js — default column configuration for the shared Sales
 * items grid (Proforma Invoice, Invoice, Credit Note, Delivery Challan,
 * Sales Contract, Sales Order, Packing List, Export invoice/proforma).
 *
 * One shape for every variant, matching the CPR item grid's column model so the
 * SAME Manage Columns + drag-resize toolkit drives all of them:
 *   { id, key, label, type, required, system, hidden, width, order }
 *
 * `sno` (serial number) and `actions` are structural: they stay protected in
 * Manage Columns (no remove, no custom column inserted after them) but remain
 * resizable where the business logic allows.
 */

export const SALES_ITEM_LABELS = {
  sno: 'S.No',
  qty: 'Qty',
  unit: 'UOM',
  hsn: 'HSN',
  desc: 'Description',
  sku: 'Item Code',
  drawingNo: 'Drawing No',
  material: 'Material',
  manufacturer: 'Manufacturer',
  countryOfOrigin: 'Country of Origin',
  marksNos: 'Marks & Nos / Container No',
  noKindPkgs: 'No. & Kind of Pkgs',
  netWeight: 'Net Weight (KGS)',
  grossWeight: 'Gross Weight (KGS)',
  rate: 'Rate',
  discount: 'Discount %',
  gst: 'GST %',
  taxable: 'Taxable Amount',
  total: 'Total',
  amount: 'Amount',
  actions: 'Actions'
};

const SALES_ITEM_WIDTHS = {
  sno: 46,
  qty: 76,
  unit: 76,
  hsn: 96,
  desc: 300,
  sku: 120,
  drawingNo: 110,
  material: 110,
  manufacturer: 130,
  countryOfOrigin: 130,
  marksNos: 150,
  noKindPkgs: 150,
  netWeight: 110,
  grossWeight: 110,
  rate: 100,
  discount: 92,
  gst: 96,
  taxable: 120,
  total: 110,
  amount: 110,
  actions: 96
};

/**
 * The physical column order of each grid variant (unchanged from the ERP).
 *
 * `creditNote` deliberately carries NO `discount` column: a Credit Note line is
 * priced at qty × rate and the module no longer has an item Discount % at all.
 * The column is dropped from this default set AND from any stored
 * configuration for the credit-note grid (SalesItemGrid passes
 * `excludeKeys: ['discount']`, which prunes it and rewrites the saved config),
 * so it cannot reappear through Manage Columns. Every other variant keeps its
 * own column set — discount support elsewhere is untouched.
 */
export const SALES_ITEM_ORDER = {
  export: ['sno', 'desc', 'sku', 'drawingNo', 'material', 'hsn', 'manufacturer', 'countryOfOrigin', 'qty', 'unit', 'rate', 'total', 'actions'],
  proformaExport: ['sno', 'marksNos', 'noKindPkgs', 'desc', 'sku', 'drawingNo', 'material', 'hsn', 'manufacturer', 'countryOfOrigin', 'qty', 'unit', 'rate', 'total', 'actions'],
  packingList: ['sno', 'desc', 'marksNos', 'noKindPkgs', 'qty', 'unit', 'netWeight', 'grossWeight', 'actions'],
  proforma: ['sno', 'desc', 'hsn', 'qty', 'unit', 'rate', 'gst', 'amount', 'actions'],
  creditNote: ['sno', 'desc', 'hsn', 'qty', 'unit', 'rate', 'gst', 'taxable', 'total', 'actions'],
  invoice: ['sno', 'qty', 'unit', 'hsn', 'desc', 'rate', 'gst', 'amount', 'actions'],
  default: ['sno', 'qty', 'unit', 'hsn', 'desc', 'rate', 'gst', 'amount', 'actions']
};

/** Variant-specific label overrides (the reference tables differ by module). */
function labelFor(key, variant) {
  if (variant === 'proforma') {
    if (key === 'qty') return 'Quantity';
    if (key === 'unit') return 'Unit';
    if (key === 'hsn') return 'HS Code';
    if (key === 'desc') return 'Description of Goods';
    if (key === 'amount') return 'Amount (USD)';
    if (key === 'rate') return 'Unit Price (USD)';
  }
  if (variant === 'packingList' && key === 'desc') return 'Description of Goods';
  if (variant === 'creditNote' && key === 'desc') return 'Item';
  if ((variant === 'export' || variant === 'proformaExport') && key === 'desc') return 'Product / Description';
  return SALES_ITEM_LABELS[key] || key;
}

/**
 * Default column configuration for the Quotation / Sales form item grid
 * (S.NO | SKU | QTY | UOM | [HSN] | ITEM DESCRIPTION | GST | RATE | AMOUNT |
 * ACTIONS). The "Show SKU" / "HSN Column View" Advanced Options feed the
 * defaults; the user can still hide/reorder/resize/rename and add custom
 * columns through Manage Columns, and every change is persisted.
 */
export function defaultQuotationItemColumns({ showSku = true, showHsn = true } = {}) {
  const order = ['sno', 'sku', 'qty', 'unit', 'hsn', 'desc', 'gst', 'rate', 'amount', 'actions']
    .filter((key) => (key === 'sku' ? showSku : key === 'hsn' ? showHsn : true));
  const defaults = { sno: 46, sku: 120, qty: 76, unit: 86, hsn: 104, desc: 340, gst: 150, rate: 110, amount: 120, actions: 92 };
  return order.map((key, i) => ({
    id: key,
    key,
    label: SALES_ITEM_LABELS[key] || key,
    type: key === 'sno' ? 'index'
      : key === 'actions' ? 'actions'
        : ['qty', 'rate'].includes(key) ? 'number'
          : ['gst', 'amount'].includes(key) ? 'computed'
            : 'text',
    required: false,
    system: true,
    hidden: false,
    width: defaults[key] || 140,
    order: i + 1
  }));
}

/**
 * The quotation item grid's row TOTAL column.
 *
 * It is a STRUCTURAL column of the create/edit grid, exactly like `sno` and
 * `actions`: it always renders, immediately before ACTIONS, and is deliberately
 * NOT part of the manageable/persisted column configuration. Two reasons:
 *
 *  · the column's position is fixed by the quotation layout (between AMOUNT and
 *    ACTIONS), so it is not a user choice to hide, move or remove: Manage
 *    Columns does not offer it, the same way it does not offer ACTIONS; and
 *  · the column configuration is SHARED (`gridKey: 'sales.items.quotation'`) by
 *    the read-only surfaces — the quotation preview/design page, the View page
 *    and the generated PDF resolve their columns from that same stored config.
 *    Those surfaces read their line values from the SAVED record, which carries
 *    no per-line total, so persisting a total column would make them render a
 *    zero/blank TOTAL. Keeping the column out of the stored configuration
 *    leaves every one of those surfaces exactly as it is today.
 *
 * Its value is not stored: it is derived live from the row (see
 * QuotationFormPage's `computeRows` — base amount + CGST + SGST), i.e. the same
 * numbers the quotation summary adds up.
 */
export const QUOTATION_ROW_TOTAL_COLUMN = Object.freeze({
  id: 'rowTotal',
  key: 'total',
  label: 'Total',
  type: 'computed',
  width: 120
});

/**
 * Insert the row TOTAL column immediately BEFORE the Actions column.
 *
 * Returns a new array (the managed column list is never mutated) with any
 * previous row-total entry removed first, so the result always has exactly one
 * TOTAL column and it is always the one right before ACTIONS — the position the
 * quotation layout requires. A list without an Actions column gets TOTAL at the
 * end rather than losing it.
 */
export function withRowTotalColumn(columns = [], totalColumn = QUOTATION_ROW_TOTAL_COLUMN) {
  const list = (Array.isArray(columns) ? columns : []).filter(
    (c) => c && c.id !== totalColumn.id && c.key !== totalColumn.key
  );
  const actionsIndex = list.findIndex((c) => c.key === 'actions' || c.id === 'actions');
  if (actionsIndex === -1) return [...list, { ...totalColumn }];
  return [...list.slice(0, actionsIndex), { ...totalColumn }, ...list.slice(actionsIndex)];
}

/**
 * Default column configuration for a variant. `showHsn=false` drops HSN from
 * the default set (the Advanced Option toggle) while the saved value is kept.
 */
export function defaultSalesItemsColumns({ variant = 'invoice', showHsn = true } = {}) {
  const order = SALES_ITEM_ORDER[variant] || SALES_ITEM_ORDER.default;
  return order
    .filter((key) => (key === 'hsn' ? showHsn : true))
    .map((key, i) => ({
      id: key,
      key,
      label: labelFor(key, variant),
      type: ['sno'].includes(key) ? 'index'
        : ['actions'].includes(key) ? 'actions'
          : ['qty', 'rate', 'netWeight', 'grossWeight'].includes(key) ? 'number'
            // GST/amount columns are computed (or driven by the header GST
            // control) — they are managed (hide/reorder/rename/resize) but not
            // free-text edited.
            : ['gst', 'taxable', 'total', 'amount'].includes(key) ? 'computed'
              : 'text',
      required: false,
      system: true,
      hidden: false,
      width: SALES_ITEM_WIDTHS[key] || 120,
      order: i + 1
    }));
}
