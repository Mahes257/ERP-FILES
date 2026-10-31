/**
 * purchase/utils/inventoryMovement.js
 * ------------------------------------------------------------------
 * Shared movement-quantity helpers for the Inventory Update module.
 * Movement sign rules are defined ONCE here so the list modal, the
 * /new movement form and the detail page all show the same math:
 *
 *   Receipt    → delta = +qty      (stock in)
 *   Issue      → delta = -qty      (stock out)
 *   Adjustment → delta = signed amount the user types
 *   Transfer   → two-sided movement (out of one warehouse INTO another);
 *                previewed with transferPreview(fromOnHand, toOnHand)
 *   Before     = on-hand from the ledger (single source of truth)
 *   After      = Before + Delta
 * ------------------------------------------------------------------
 */
import { INVENTORY_TYPE } from '../services/logistics';

/** Signed ledger delta implied by a movement type + quantity. */
export function movementDelta(type, quantity) {
  const qty = Number(quantity);
  if (!Number.isFinite(qty)) return 0;
  if (type === INVENTORY_TYPE.RECEIPT) return Math.abs(qty);
  if (type === INVENTORY_TYPE.ISSUE) return -Math.abs(qty);
  /* A transfer has no single side — use transferPreview(). */
  if (type === INVENTORY_TYPE.TRANSFER) return 0;
  /* Adjustment amount is explicitly signed. */
  return qty;
}

/** Full Before / Delta / After preview given on-hand stock. */
export function movementPreview(type, quantity, onHand = 0) {
  const delta = movementDelta(type, quantity);
  return { before: onHand, delta, after: onHand + delta };
}

/**
 * Preview for a stock transfer: the source warehouse loses qty and the
 * destination warehouse gains it. Quantity is always positive.
 */
export function transferPreview(quantity, onHandFrom = 0, onHandTo = 0) {
  const qty = Math.abs(Number(quantity)) || 0;
  return {
    quantity: qty,
    from: { warehouse: 'source', onHand: onHandFrom, delta: -qty, after: onHandFrom - qty },
    to: { warehouse: 'destination', onHand: onHandTo, delta: qty, after: onHandTo + qty }
  };
}

/** Help text shown next to the quantity field per movement type. */
export const MOVEMENT_QUANTITY_HINT = {
  [INVENTORY_TYPE.RECEIPT]: 'Quantity received into stock (stock increases).',
  [INVENTORY_TYPE.ISSUE]: 'Quantity issued out of stock (stock decreases).',
  [INVENTORY_TYPE.ADJUSTMENT]: 'Signed amount — e.g. +5 adds stock, -5 removes stock.',
  [INVENTORY_TYPE.TRANSFER]: 'Quantity moved between the source and destination warehouses.'
};
