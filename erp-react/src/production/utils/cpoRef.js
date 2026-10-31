import { cpoNo } from '../../utils/salesHelpers';

/**
 * CPO-reference helpers for Production Work Orders.
 *
 * A Work Order's CPO reference is only valid when the real `sales_orders`
 * primary key is present (salesOrderId). Historical/test records such as
 * TEST-PO-001 … TEST-PO-010 carry a legacy `salesOrderNumber` (e.g.
 * SO-2026-101) with no salesOrderId — those Sales Orders do not exist and
 * must never be presented as valid linked CPOs.
 */

/** True when the order is linked to a real sales_orders record. */
export const isLinkedCpo = (order) =>
  Boolean(order?.salesOrderId != null && String(order.salesOrderId).trim() !== '');

/** The display CPO number (CPO-YYYY-NNN) when linked, otherwise null. */
export const cpoDisplay = (order) => {
  if (!isLinkedCpo(order)) return null;
  return cpoNo(order?.salesOrderNumber || '') || cpoNo(String(order.salesOrderId)) || null;
};

/** The raw stored reference for an unlinked order (e.g. SO-2026-101), else null. */
export const unlinkedCpoNumber = (order) => {
  if (isLinkedCpo(order)) return null;
  const raw = order?.salesOrderNumber;
  return raw && String(raw).trim() !== '' ? raw : null;
};