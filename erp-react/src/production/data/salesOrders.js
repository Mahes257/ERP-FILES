// ============================================================
// Sales Orders — the Sales side of the Sales → Production link.
//
// This project has no Sales module of its own, so this is a
// minimal USER-ENTRY-ONLY Sales Order master that lets Production
// Orders reference real Sales data. The Sales Order is the single
// source of truth for Customer / Product / Ordered Quantity /
// Delivery Date; the Production Order stores only the link
// (salesOrderId + salesOrderItemId + salesOrderNumber) plus the
// auto-populated snapshot shown in its forms and tables.
//
// A Sales Order holds a DYNAMIC `items` array — there is no fixed
// item limit (1, 5, 20, 50, 100+ items all use the same structure).
// Nothing is seeded here; every order and item is user-entered.
// ============================================================

/** Sales Orders are USER-ENTRY-ONLY: the list starts empty. */
export const salesOrders = [];

/**
 * Next automatic Sales Order number: SO-0001, SO-0002, …
 * Derived from the existing user-created Sales Orders so numbering
 * never duplicates and continues correctly after a browser refresh.
 */
export function nextSalesOrderNumber(orders = []) {
  let max = 0;
  orders.forEach((so) => {
    const match = /^SO-(\d+)$/.exec(String(so.salesOrderNumber || ''));
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `SO-${String(max + 1).padStart(4, '0')}`;
}

/** Auto amount = quantity × rate (empty when no rate is given). */
export function itemAmount(item) {
  const qty = Number(item?.quantity) || 0;
  const rate = item?.rate == null || item?.rate === '' ? null : Number(item.rate);
  return rate == null ? null : qty * rate;
}

/** Normalize a single item row into the canonical item shape. */
export function normalizeItem(item, soId, index) {
  const productName = String(item?.productName || '');
  return {
    id: item?.id || `${soId}-item-${index + 1}`,
    itemNo: item?.itemNo ?? index + 1,
    productName,
    productCode: String(item?.productCode || ''),
    description: String(item?.description || ''),
    quantity: Number(item?.quantity) || 0,
    unit: String(item?.unit || 'Pcs'),
    rate: item?.rate == null || item?.rate === '' ? null : Number(item.rate),
    amount: itemAmount(item),
    deliveryDate: String(item?.deliveryDate || ''),
    remarks: String(item?.remarks || ''),
  };
}

/**
 * Normalize a stored Sales Order into the current items-based shape.
 *
 * Legacy single-product Sales Orders (created before multi-item
 * support) are converted into a one-item Sales Order so existing
 * user data keeps working — nothing is deleted or lost.
 */
export function normalizeSalesOrder(so) {
  if (!so) return so;
  if (Array.isArray(so.items) && so.items.length > 0) {
    return {
      ...so,
      items: so.items.map((item, index) => normalizeItem(item, so.id || 'so', index)),
    };
  }
  // Legacy single-product record → one item.
  return {
    ...so,
    items: [
      normalizeItem(
        {
          productName: so.productName,
          productCode: so.productCode,
          quantity: so.orderedQuantity,
          deliveryDate: so.deliveryDate,
        },
        so.id || 'so',
        0
      ),
    ],
  };
}

/** Normalize a stored Sales Order list (applied on load). */
export function normalizeSalesOrders(list = []) {
  return list.map(normalizeSalesOrder).filter(Boolean);
}

/**
 * Find an item inside a Sales Order by id. Falls back to the first
 * item so orders created before item ids existed still link cleanly.
 */
export function salesOrderItem(so, itemId) {
  if (!so || !Array.isArray(so.items) || so.items.length === 0) return null;
  return so.items.find((item) => item.id === itemId) || so.items[0] || null;
}

/**
 * Production orders linked to a Sales Order item. Orders created
 * before item ids existed are matched by (Sales Order + product
 * name); newer orders match by the stable salesOrderItemId.
 */
export function ordersForItem(orders, so, item) {
  if (!so || !item) return [];
  return (orders || []).filter((order) => {
    if (order.salesOrderId !== so.id) return false;
    if (order.salesOrderItemId) return order.salesOrderItemId === item.id;
    return order.product === item.productName;
  });
}

/**
 * Fulfilment status of a Sales Order item, derived ONLY from the
 * linked Production + Dispatch records (never from the Sales Order's
 * original data):
 *
 *   PENDING PRODUCTION — no production order linked yet
 *   IN PROGRESS        — production started, nothing dispatched yet
 *   PARTIALLY FULFILLED — some quantity produced/dispatched, remainder pending
 *   FULFILLED          — full ordered quantity dispatched
 */
export function salesOrderItemStatus(stats) {
  const ordered = Number(stats?.orderedQty) || 0;
  const produced = Number(stats?.producedQty) || 0;
  const dispatched = Number(stats?.dispatchedQty) || 0;
  if (ordered > 0 && dispatched >= ordered) return 'FULFILLED';
  if (produced <= 0) return 'PENDING PRODUCTION';
  if (dispatched > 0) return 'PARTIALLY FULFILLED';
  return 'IN PROGRESS';
}
