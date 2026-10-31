import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { productionOrderApi } from '../utils/api';
import {
  notifyProductionDataChanged,
  subscribeProductionDataChanged,
} from '../utils/dataChanged';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';

/** Refresh-bus identity so this store never re-fetches its own writes. */
const ORDERS_STORE = 'orders';

/**
 * The database id of an existing Work Order item, or undefined for an item the
 * form has not saved yet. Sent with an update so the backend keeps each item on
 * its own row (and therefore its own due date and attachments) when items are
 * added or removed.
 */
const existingItemId = (id) => {
  const raw = String(id ?? '').trim();
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
};

/** Item payload shared by create and update — item-wise due date included. */
const itemPayload = (item) => ({
  id: existingItemId(item.id),
  productName: item.productName,
  productCode: item.productCode,
  quantity: Number(item.quantity) || 0,
  productionType: item.productionType,
  patternNumber: item.patternNumber,
  drawingNumber: item.drawingNumber,
  drawingRevision: item.drawingRevision,
  dueDate: item.dueDate || undefined,
});

// ============================================================
// Production Order lifecycle:
// Draft → Pending Production Approval → Production Approved
// → Pending Admin Approval → Admin Approved → Approved
// → In Progress → Pending QC → Completed → Packed
// → Ready for Dispatch → Dispatched
// ============================================================
export const ORDER_TRANSITIONS = {
  Draft: ['Pending Production Approval', 'Cancelled'],
  'Pending Production Approval': ['Production Approved', 'Production Rejected', 'Cancelled'],
  'Production Approved': ['Pending Admin Approval', 'Cancelled'],
  'Pending Admin Approval': ['Admin Approved', 'Admin Rejected', 'Cancelled'],
  'Admin Approved': ['Approved', 'Cancelled'],
  Approved: ['In Progress', 'Cancelled'],
  Pending: ['In Progress', 'Cancelled'],
  'In Progress': ['Pending QC', 'Cancelled'],
  'Pending QC': ['Completed', 'Failed', 'Cancelled'],
  Completed: ['Packed', 'Cancelled'],
  Packed: ['Ready for Dispatch', 'Cancelled'],
  'Ready for Dispatch': ['Dispatched', 'Cancelled'],
  Dispatched: [],
  Failed: ['In Progress', 'Pending QC', 'Cancelled'],
  Hold: ['In Progress', 'Cancelled'],
  'Production Rejected': ['Draft', 'Cancelled'],
  'Admin Rejected': ['Production Approved', 'Cancelled'],
  Cancelled: [],
};

export const canTransitionOrder = (status, nextStatus) =>
  (ORDER_TRANSITIONS[status] || []).includes(nextStatus);

const ProductionOrdersContext = createContext(null);

/**
 * Production Orders provider — uses the real ERP backend API exclusively.
 * No localStorage fallback. The database is the single source of truth.
 */
export function ProductionOrdersProvider({ children }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // The list endpoint caps `size` at 100 rows per page, so requesting a single
  // page of 500 silently returned only the first 100 Work Orders — everything
  // beyond that was missing from the list, the search, the tab counters and the
  // pagination. Walk the pages so the module always works on the full table.
  const PAGE_SIZE = 100;
  const MAX_PAGES = 100; // safety stop (10 000 orders)

  const fetchAllOrders = useCallback(async () => {
    const all = [];
    let page = 0;
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const result = await productionOrderApi.list({ page, size: PAGE_SIZE });
      const data = result?.data || result || {};
      const content = Array.isArray(data.content) ? data.content : [];
      all.push(...content);
      page += 1;
      if (data.last === true || content.length < PAGE_SIZE || page >= MAX_PAGES) break;
    }
    return all;
  }, []);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const content = await fetchAllOrders();
      setOrders(content.map((dto) => ({
        ...dto,
        id: dto.workOrder,
        // The backend DTO exposes the Work Order string as `id` and the
        // real database primary key as `backendId`. Every /production-orders/{id}
        // endpoint takes that numeric key, so `backendId` MUST be the numeric id.
        backendId: dto.backendId ?? dto.id,
      })));
      return true;
    } catch (err) {
      console.error('Failed to load production orders:', err.message);
      setOrders([]);
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchAllOrders]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Listen for external data changes
  useEffect(() => subscribeProductionDataChanged(ORDERS_STORE, () => loadOrders()), [loadOrders]);

  const addOrder = useCallback(async (order) => {
    try {
      const result = await productionOrderApi.create({
        salesOrderId: order.salesOrderId,
        salesOrderNumber: order.salesOrderNumber,
        customer: order.customer,
        customerCode: order.customerCode,
        startDate: order.startDate,
        dueDate: order.dueDate,
        priority: order.priority,
        remarks: order.remarks,
        items: (order.items || []).map(itemPayload),
      });
      if (result?.data) {
        const newOrder = {
          ...result.data,
          id: result.data.workOrder,
          backendId: result.data.backendId ?? result.data.id,
        };
        setOrders((prev) => [newOrder, ...prev]);
        notifyProductionDataChanged(ORDERS_STORE);
        return { ok: true, order: newOrder };
      }
      return { ok: false, error: result?.message || 'The Work Order could not be created.' };
    } catch (err) {
      // Surface the validation message the backend rejected the create with
      // (missing dates / items / invalid production type) instead of returning
      // null and letting the form navigate away as if it had saved.
      const backendMessage = err?.response?.data?.message;
      const error =
        backendMessage && !/unexpected error/i.test(backendMessage)
          ? backendMessage
          : err?.message || 'The Work Order could not be created.';
      console.error('Backend create failed:', error);
      return { ok: false, error };
    }
  }, []);

  const updateOrder = useCallback(async (updated) => {
    const order = orders.find((o) => o.id === updated.id);
    const backendId = order?.backendId || updated.backendId;
    if (!backendId) return null;
    try {
      const result = await productionOrderApi.update(backendId, {
        salesOrderId: updated.salesOrderId,
        salesOrderNumber: updated.salesOrderNumber,
        customer: updated.customer,
        customerCode: updated.customerCode,
        startDate: updated.startDate,
        dueDate: updated.dueDate,
        priority: updated.priority,
        remarks: updated.remarks,
        items: (updated.items || []).map(itemPayload),
      });
      if (result?.data) {
        const newOrder = {
          ...result.data,
          id: result.data.workOrder,
          backendId: result.data.backendId ?? result.data.id,
        };
        setOrders((prev) => prev.map((o) => (o.id === updated.id ? newOrder : o)));
        notifyProductionDataChanged(ORDERS_STORE);
        return { ok: true, order: newOrder };
      }
      return { ok: false, error: result?.message || 'The Work Order could not be saved.' };
    } catch (err) {
      // The backend only allows edits while the order is in Draft status; report
      // that (and any validation message) instead of returning null, which made
      // the form navigate away as if the edit had been saved.
      const backendMessage = err?.response?.data?.message;
      const error =
        backendMessage && !/unexpected error/i.test(backendMessage)
          ? backendMessage
          : `Work Order ${order?.workOrder || updated.id} could not be saved. Only Work Orders in Draft status can be edited.`;
      console.error('Backend update failed:', error);
      return { ok: false, error };
    }
  }, [orders]);

  /**
   * Delete a Work Order. Resolves with { ok, error } so callers can tell the
   * user why a delete was refused and — critically — only cascade-delete the
   * dependent records once the Work Order row is actually gone.
   */
  const deleteOrder = useCallback(async (id) => {
    const order = orders.find((o) => o.id === id || o.workOrder === id);
    const backendId = order?.backendId;
    if (!backendId) {
      return { ok: false, error: `Work Order ${id} could not be found.` };
    }
    try {
      await productionOrderApi.delete(backendId);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      notifyProductionDataChanged(ORDERS_STORE);
      // Report which Work Order the server actually removed so the caller's
      // dependent-record cleanup always targets the deleted row.
      return { ok: true, workOrder: order?.workOrder, backendId };
    } catch (err) {
      // The backend refuses to delete anything that is not in Draft status; the
      // old code swallowed that failure, so the UI reported success while the
      // Work Order (and every related record) stayed in the database.
      const backendMessage = err?.response?.data?.message;
      const error =
        backendMessage && !/unexpected error/i.test(backendMessage)
          ? backendMessage
          : `Work Order ${order?.workOrder || id} cannot be deleted. Only Work Orders in Draft status can be deleted.`;
      console.error('Backend delete failed:', error);
      return { ok: false, error };
    }
  }, [orders]);

  const getOrder = useCallback((id) => {
    // Work Orders are addressed by their WO number in the UI, but other modules
    // (notifications) reference them by their database id. Accept both so a deep
    // link such as a Production approval notification opens the record.
    return orders.find(
      (order) => order.id === id || order.workOrder === id || String(order.backendId) === String(id)
    );
  }, [orders]);

  /**
   * Apply ONE status step for an order, using the status given in `fromStatus`
   * rather than the (possibly stale) copy held in React state. This lets a
   * multi-step path be applied step by step inside a single render.
   */
  const applyTransition = useCallback(async (order, fromStatus, nextStatus, remarks) => {
    const backendId = order?.backendId;
    if (!order || !backendId) return { ok: false, order, from: fromStatus, to: nextStatus };

    try {
      let result;
      switch (nextStatus) {
        case 'Pending Production Approval':
          result = await productionOrderApi.submitProductionApproval(backendId, remarks);
          break;
        case 'Production Approved':
          if (fromStatus === 'Admin Rejected') {
            result = await productionOrderApi.resubmitToProduction(backendId, remarks);
          } else {
            result = await productionOrderApi.approveProduction(backendId, remarks);
          }
          break;
        case 'Pending Admin Approval':
          result = await productionOrderApi.submitAdminApproval(backendId, remarks);
          break;
        case 'Admin Approved':
          result = await productionOrderApi.approveAdmin(backendId, remarks);
          break;
        case 'Approved':
          result = await productionOrderApi.finalApprove(backendId, remarks);
          break;
        case 'In Progress':
          if (fromStatus === 'Approved' || fromStatus === 'Pending') {
            result = await productionOrderApi.startProduction(backendId, remarks);
          } else if (fromStatus === 'Hold') {
            result = await productionOrderApi.resume(backendId, remarks);
          }
          break;
        // In Progress → Pending QC is its own backend transition; sending it to
        // /complete asked the server for Completed, which the workflow validator
        // rejects (a QC gate cannot be skipped).
        case 'Pending QC':
          result = await productionOrderApi.sendToQuality(backendId, remarks);
          break;
        case 'Completed':
          result = await productionOrderApi.complete(backendId, remarks);
          break;
        case 'Packed':
          result = await productionOrderApi.markPacked(backendId, remarks);
          break;
        case 'Ready for Dispatch':
          result = await productionOrderApi.markReadyForDispatch(backendId, remarks);
          break;
        case 'Hold':
          result = await productionOrderApi.hold(backendId, remarks);
          break;
        case 'Cancelled':
          result = await productionOrderApi.cancel(backendId, remarks);
          break;
        case 'Production Rejected':
          result = await productionOrderApi.rejectProduction(backendId, remarks);
          break;
        case 'Admin Rejected':
          result = await productionOrderApi.rejectAdmin(backendId, remarks);
          break;
        case 'Draft':
          if (fromStatus === 'Production Rejected') {
            result = await productionOrderApi.returnToDraft(backendId, remarks);
          } else {
            result = await productionOrderApi.submitProductionApproval(backendId, remarks);
          }
          break;
        default:
          result = await productionOrderApi.submitProductionApproval(backendId, remarks);
      }
      // The ERP ApiResponse envelope is { success, message, data } — there is no
      // `ok` flag, so checking only `result.ok` made every successful transition
      // look like a failure (and skipped the local state update).
      if ((result?.ok || result?.success) && result.data) {
        const updatedOrder = {
          ...result.data,
          id: result.data.workOrder,
          backendId: result.data.backendId ?? result.data.id,
        };
        setOrders((prev) => prev.map((o) => (o.id === updatedOrder.id ? updatedOrder : o)));
        notifyProductionDataChanged(ORDERS_STORE);
        // Approval-stage transitions change the shared Pending Approvals badge;
        // refresh it now instead of waiting for the stale-after window. Same
        // event the Sales hooks dispatch after their own mutations.
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
        }
        return { ok: true, order: updatedOrder, from: fromStatus, to: nextStatus };
      }
    } catch (err) {
      console.error('Backend transition failed:', err.message);
    }
    return { ok: false, order, from: fromStatus, to: nextStatus };
  }, []);

  const transitionOrderStatus = useCallback(async (id, nextStatus, remarks) => {
    const order = orders.find((o) => o.id === id);
    if (!order || !canTransitionOrder(order.status, nextStatus)) {
      return { ok: false, order, from: order?.status, to: nextStatus };
    }
    return applyTransition(order, order.status, nextStatus, remarks);
  }, [orders, applyTransition]);

  const transitionOrderPath = useCallback(async (id, steps) => {
    let order = orders.find((o) => o.id === id);
    if (!order) return { ok: false, order };
    let current = order.status;
    const applied = [];
    for (const step of steps) {
      if (step === current) continue;
      if (!canTransitionOrder(current, step)) {
        return { ok: false, order, from: current, to: step };
      }
      applied.push(step);
      current = step;
    }
    if (applied.length === 0) {
      return { ok: true, order, from: order.status, to: current };
    }

    // Every intermediate status is persisted in order — sending only the final
    // step asked the backend to jump straight there and the workflow validator
    // rejected it (e.g. Completed → Ready for Dispatch without going via Packed).
    let result = { ok: true, order, from: order.status, to: order.status };
    let fromStatus = order.status;
    for (const step of applied) {
      result = await applyTransition(order, fromStatus, step);
      if (!result.ok) return result;
      order = result.order;
      fromStatus = step;
    }
    return result;
  }, [orders, applyTransition]);

  const value = {
    orders,
    addOrder,
    updateOrder,
    deleteOrder,
    getOrder,
    transitionOrderStatus,
    transitionOrderPath,
    backendAvailable: true,
    loading,
    refreshOrders: loadOrders,
  };

  return (
    <ProductionOrdersContext.Provider value={value}>{children}</ProductionOrdersContext.Provider>
  );
}

export function useProductionOrders() {
  const context = useContext(ProductionOrdersContext);
  if (!context) {
    throw new Error('useProductionOrders must be used inside <ProductionOrdersProvider>');
  }
  return context;
}
