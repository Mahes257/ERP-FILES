// ============================================================
// Dispatch service.
// Data access for dispatch records. Records reference Work Orders by
// stable id (stored in `productionOrder`, e.g. 'WO-0001').
//
// Dispatch Number format: DISP-YYYY-NNN (e.g. DISP-2026-001)
// Work Order Number: flows through the entire journey unchanged.
//
// Demo implementation: pure functions over the in-memory dispatch
// dataset (held in React state by the DispatchContext).
// Future: replace internals with API calls.
// ============================================================
import { ok, fail } from './index';
import { nextDispatchNumber, canTransitionDispatch } from '../../data/dispatch';

export const dispatchService = {
  /** Read all dispatch records. */
  getDispatchRecords: (records) => records,

  /** Create a dispatch record. Auto-generates Dispatch Number if not provided. */
  createDispatch: (records, data) => {
    const record = {
      ...data,
      id: String(data.id ?? '').trim() || nextDispatchNumber(records),
      status: data.status || 'Draft',
    };
    if (records.some((record_) => record_.id === record.id)) {
      return fail(records, `Dispatch record ${record.id} already exists.`);
    }
    return ok([record, ...records], record);
  },

  /** Update a dispatch record by stable id (merges over the record). */
  updateDispatch: (records, id, data) => {
    const existing = records.find((record) => record.id === id);
    if (!existing) return fail(records, `Dispatch record ${id} not found.`);
    const record = { ...existing, ...data, id: existing.id };
    return ok(
      records.map((record_) => (record_.id === id ? record : record_)),
      record
    );
  },

  /** Delete a dispatch record by stable id. */
  deleteDispatch: (records, id) => {
    if (!records.some((record) => record.id === id)) {
      return fail(records, `Dispatch record ${id} not found.`);
    }
    return ok(
      records.filter((record) => record.id !== id),
      { id }
    );
  },

  /**
   * Transition a dispatch record to a new status.
   * Returns { ok, record, from, to }.
   */
  transitionDispatch: (records, id, nextStatus) => {
    const record = records.find((r) => r.id === id);
    if (!record) return fail(records, `Dispatch record ${id} not found.`);
    if (!canTransitionDispatch(record.status, nextStatus)) {
      return fail(records, `Cannot transition ${record.status} → ${nextStatus}.`);
    }
    const updated = { ...record, status: nextStatus };
    return ok(
      records.map((r) => (r.id === id ? updated : r)),
      updated
    );
  },

  /**
   * Validate dispatch data before create/update.
   * Checks required fields and packing status constraints.
   */
  validateDispatch: (data, packingStatus) => {
    if (!data?.productionOrder) return 'Work Order is required.';
    if (Number(data?.quantity) <= 0) return 'Quantity must be greater than zero.';
    if (!data?.dispatchDate) return 'Dispatch Date is required.';

    // Cannot dispatch if not packed
    if (data?.status === 'Ready' && packingStatus === 'Not Packed') {
      return 'Cannot mark as Ready — Packing is not completed for this Work Order.';
    }

    return null;
  },

  /**
   * Create a dispatch record from a Packing List.
   * Auto-fills Work Order, product, quantity, and packing details.
   */
  createFromPackingList: (records, packingRecord, order) => {
    if (!packingRecord || !order) {
      return fail(records, 'Packing List and Work Order are required.');
    }

    const data = {
      productionOrder: order.workOrder,
      salesOrderNumber: order.salesOrderNumber || '',
      product: order.product || '',
      customer: order.customer || '',
      quantity: Number(packingRecord.quantity) || Number(order.quantity) || 0,
      packingListId: packingRecord.id,
      status: 'Draft',
      dispatchDate: '',
      transporter: '',
      vehicleNo: '',
      lrTrackingNo: '',
      remarks: '',
    };

    return dispatchService.createDispatch(records, data);
  },
};
