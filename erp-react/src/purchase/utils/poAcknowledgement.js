/**
 * purchase/utils/poAcknowledgement.js
 * ------------------------------------------------------------------
 * Supplier acknowledgement status helpers — a single source of truth
 * shared by the combined "Released Purchase Orders & Supplier
 * Acknowledgement" page and the Purchase sidebar badge.
 *
 * The PO store persists acknowledgement as a plain boolean
 * (`acknowledged`) plus `acknowledgedAt` / `acknowledgedBy`; these
 * helpers are the only place that derive a workflow status from it,
 * so the page and the badge can never disagree.
 * ------------------------------------------------------------------
 */
import { todayLocal } from '../services/base';

/** Derived acknowledgement statuses. `REJECTED` is kept as a filter
 *  option for parity with the workflow vocabulary, but the current
 *  data model has no supplier "rejected acknowledgement" state — the
 *  acknowledge action either succeeds or is refused — so it is never
 *  produced and simply matches no rows. */
export const ACK_STATUS = {
  PENDING: 'Pending',
  ACKNOWLEDGED: 'Acknowledged',
  REJECTED: 'Rejected',
  EXCEPTION: 'Exception'
};

export const ACK_STATUS_OPTIONS = Object.values(ACK_STATUS);

/**
 * Derived acknowledgement status for a released PO:
 *  - Acknowledged — the persisted `acknowledged` flag is set.
 *  - Exception    — NOT acknowledged and the expected delivery date
 *                   has passed (the supplier missed the acknowledgement
 *                   window, so the PO is escalated as an exception).
 *  - Pending      — NOT acknowledged and the expected delivery date
 *                   has not passed yet.
 *
 * Dates are compared as YYYY-MM-DD (the store's date format), so the
 * derivation is timezone-stable. Nothing is hardcoded — every branch
 * reads the persisted order record.
 */
export function getPoAckStatus(order, today = todayLocal()) {
  if (!order) return ACK_STATUS.PENDING;
  /* The mock store persists a boolean `acknowledged`; the REST API persists
     `acknowledgedAt` (plus `acknowledgedBy`) instead and exposes no boolean
     flag. Treat either as proof of acknowledgement so an acknowledged PO is
     not shown as Pending in API mode. */
  if (order.acknowledged || order.acknowledgedAt) return ACK_STATUS.ACKNOWLEDGED;
  if (order.expectedDate && order.expectedDate < today) return ACK_STATUS.EXCEPTION;
  return ACK_STATUS.PENDING;
}

/**
 * Count of POs awaiting supplier acknowledgement (PENDING only —
 * exceptions are excluded, matching the "Pending Acknowledgement" KPI
 * and the sidebar badge: released = pending + acknowledged + exception).
 */
export function countPendingAcknowledgements(orders, today = todayLocal()) {
  if (!Array.isArray(orders)) return 0;
  return orders.filter((order) => getPoAckStatus(order, today) === ACK_STATUS.PENDING).length;
}
