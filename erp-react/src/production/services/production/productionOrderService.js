// ============================================================
// Work Order service.
// Data access for the Production Orders module and the order
// lifecycle used by the dashboard, detail page and handoffs.
// The Work Order Number is the ONLY production identifier.
//
// Demo implementation: pure functions over the in-memory order
// dataset (held in React state by ProductionOrdersContext).
// Future: replace internals with API calls — signatures below are
// the stable contract (the `orders` dataset argument is dropped).
// ============================================================
import { ok, fail } from './index';

/** ID generation for records created without an explicit id. */
const nextId = (orders, prefix = 'WO') =>
  `${prefix}-${String(
    orders.reduce((max, order) => {
      const n = Number(String(order.id).split('-').pop());
      return Number.isFinite(n) && n > max ? n : max;
    }, 0) + 1
  ).padStart(4, '0')}`;

export const productionOrderService = {
  /** Read all orders (returns the dataset as-is). */
  getProductionOrders: (orders) => orders,

  /** Read one order by stable id. */
  getProductionOrderById: (orders, id) => orders.find((order) => order.id === id),

  /**
   * Create an order. Normalises the id (trimmed, auto-generated if
   * missing) and rejects duplicate ids.
   */
  createProductionOrder: (orders, data) => {
    const record = {
      ...data,
      id: String(data.id ?? '').trim() || nextId(orders),
    };
    if (orders.some((order) => order.id === record.id)) {
      return fail(orders, `Production order ${record.id} already exists.`);
    }
    return ok([record, ...orders], record);
  },

  /** Update an existing order by stable id (merges over the record). */
  updateProductionOrder: (orders, id, data) => {
    const existing = orders.find((order) => order.id === id);
    if (!existing) return fail(orders, `Production order ${id} not found.`);
    const record = { ...existing, ...data, id: existing.id };
    return ok(
      orders.map((order) => (order.id === id ? record : order)),
      record
    );
  },

  /** Delete an order by stable id. */
  deleteProductionOrder: (orders, id) => {
    if (!orders.some((order) => order.id === id)) {
      return fail(orders, `Production order ${id} not found.`);
    }
    return ok(
      orders.filter((order) => order.id !== id),
      { id }
    );
  },

  /**
   * Required-field / quantity validation for the order form.
   * Returns a message or null. Mirrors the UI rules so the service
   * contract can later be enforced server-side.
   */
  validateProductionOrder: (data) => {
    if (!data?.workOrder) return 'Work Order number is required.';
    if (!data?.product) return 'Item Name is required.';
    const quantity = Number(data?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return 'Quantity must be greater than zero.';
    }
    return null;
  },
};
