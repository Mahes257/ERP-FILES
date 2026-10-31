/**
 * salesOrderColumns.js — default column configuration for the Customer
 * Purchase Order (CPO) grids.
 * ----------------------------------------------------------------------
 * Two independent grids, each with its own persisted configuration:
 *
 *   · Items        → gridKey `sales.items.salesOrder`
 *   · E-Actions    → gridKey `sales.eactions.salesOrder`
 *
 * The column shape is the shared one every Sales & Marketing grid uses
 * ({ id, key, label, type, required, system, hidden, width, order }) so the
 * SAME Manage Columns + drag-resize toolkit drives both.
 *
 * IMPORTANT: only the CONFIGURATION is stored (once, per grid, in MySQL). The
 * values of user-defined columns live per row in `row.customFields[columnId]`,
 * so a new CPO never inherits another record's values.
 */

const itemCol = (key, label, type, width, i, extra = {}) => ({
  id: key,
  key,
  label,
  type,
  required: false,
  system: true,
  hidden: false,
  width,
  order: i + 1,
  ...extra
});

/**
 * Default CPO item columns — every column maps to a REAL persisted
 * `sales_order_items` field (material, description, drawing no, item code,
 * delivery, qty, UOM, HSN, rate, disc %, GST %). Total is computed.
 * `showHsn=false` drops HSN from the default set (the HSN Column View
 * Advanced Option) — a saved configuration always wins.
 */
export function defaultSalesOrderItemColumns({ showHsn = true } = {}) {
  const defs = [
    itemCol('sno', 'S.No', 'index', 46, 0),
    itemCol('material', 'Material', 'text', 140, 1),
    itemCol('desc', 'Item Description', 'text', 260, 2),
    itemCol('drawingNo', 'Drawing No', 'text', 130, 3),
    itemCol('sku', 'Item Code', 'text', 120, 4),
    itemCol('delivery', 'Delivery', 'text', 120, 5),
    itemCol('qty', 'Qty', 'number', 80, 6),
    itemCol('unit', 'UOM', 'text', 84, 7),
    itemCol('hsn', 'HSN', 'text', 100, 8),
    itemCol('rate', 'Rate', 'number', 110, 9),
    itemCol('discount', 'Disc %', 'number', 90, 10),
    itemCol('gst', 'GST %', 'number', 96, 11),
    itemCol('total', 'Total', 'computed', 120, 12),
    itemCol('actions', 'Actions', 'actions', 96, 13)
  ].filter((c) => (c.key === 'hsn' ? showHsn : true));
  return defs.map((c, i) => ({ ...c, order: i + 1 }));
}

/**
 * Default E-Actions / Participation columns. `sno` and `actions` are the only
 * protected structural columns; every other column is a real business column
 * and can be renamed, reordered, hidden or resized. New custom columns are the
 * user's to add through Manage Columns.
 */
export function defaultEActionColumns() {
  return [
    itemCol('sno', 'S.No', 'index', 46, 0),
    itemCol('eaParticipant', 'Participant / Team', 'text', 180, 1),
    itemCol('eaAction', 'Assigned Action', 'text', 260, 2),
    itemCol('eaAssignedTo', 'Assigned To', 'text', 150, 3),
    itemCol('eaStatus', 'Status', 'text', 140, 4),
    itemCol('eaRequestedOn', 'Requested On', 'date', 140, 5),
    itemCol('eaStartedOn', 'Started On', 'date', 140, 6),
    itemCol('eaCompletedOn', 'Completed On', 'date', 140, 7),
    itemCol('eaResult', 'Result', 'text', 220, 8),
    itemCol('eaRemarks', 'Remarks', 'text', 220, 9),
    itemCol('actions', 'Actions', 'actions', 96, 10)
  ];
}

/** Select options — the existing supported values, not hardcoded elsewhere. */
export const RELEASE_METHOD_OPTIONS = ['Direct Release', 'E-Action / Participation', 'Other'];
export const YES_NO_OPTIONS = ['Yes', 'No'];
export const ACTION_TYPE_OPTIONS = ['Direct Release', 'E-Auction', 'Participation', 'Review'];
export const E_ACTION_STATUS_OPTIONS = ['Pending', 'In Progress', 'Completed', 'On Hold', 'Cancelled'];
