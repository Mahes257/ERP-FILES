import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { dispatchApi } from '../utils/api';
import { notifyProductionDataChanged } from '../utils/dataChanged';

export const DispatchContext = createContext(null);

/** Refresh-bus identity for this store's writes. */
const DISPATCH_STORE = 'dispatch';

/**
 * Render a backend enum name as the display label the UI works with:
 * 'IN_TRANSIT' → 'In Transit'. Every status comparison in the module (the
 * status tabs, the row-action transitions, the form's Status select and the
 * list badge) uses display case, so leaving the raw enum here meant a saved
 * record never matched its own tab and never offered its next transition.
 */
function toDisplayStatus(raw) {
  if (!raw) return 'Draft';
  const small = new Set(['for', 'of', 'and', 'to']);
  return String(raw)
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      const lower = word.toLowerCase();
      if (i > 0 && small.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Map frontend dispatch record to backend expected field names.
 */
function mapToBackend(record) {
  const mapped = {
    dispatchNumber: record.id, // frontend uses 'id' as the dispatch number
    workOrderId: record.productionOrder,
    packingListId: record.packingListId,
    salesOrderNumber: record.salesOrderNumber,
    customer: record.customer,
    product: record.product,
    quantity: record.quantity,
    dispatchDate: record.dispatchDate,
    expectedDeliveryDate: record.expectedDeliveryDate,
    transporter: record.transporter,
    vehicleNumber: record.vehicleNo,
    lrTrackingNumber: record.lrTrackingNo,
    packingStatus: record.packingStatus || 'Not Packed',
    packageCount: Number(record.packageCount) || 0,
    status: record.status?.replace(/ /g, '_').toUpperCase() || 'DRAFT',
    remarks: record.remarks,
  };
  if (record.backendId) mapped.id = record.backendId;
  return mapped;
}

/**
 * Map backend response to frontend expected field names.
 */
function mapFromBackend(dto) {
  return {
    backendId: dto.id,
    id: dto.dispatchNumber,
    productionOrder: dto.workOrderId,
    packingListId: dto.packingListId,
    salesOrderNumber: dto.salesOrderNumber,
    customer: dto.customer,
    product: dto.product,
    quantity: dto.quantity,
    dispatchDate: dto.dispatchDate,
    expectedDeliveryDate: dto.expectedDeliveryDate,
    transporter: dto.transporter,
    vehicleNo: dto.vehicleNumber,
    lrTrackingNo: dto.lrTrackingNumber,
    packingStatus: dto.packingStatus || 'Not Packed',
    packageCount: dto.packageCount || 0,
    status: toDisplayStatus(dto.status),
    remarks: dto.remarks,
    createdBy: dto.createdBy,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/**
 * Dispatch store backed by MySQL via Spring Boot API.
 */
export function DispatchProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRecords = useCallback(async (params = {}) => {
    try {
      const response = await dispatchApi.list({ size: 100, ...params });
      if ((response.ok || response.success) && response.data) {
        const rawRecords = response.data.content || (Array.isArray(response.data) ? response.data : []);
        setRecords(rawRecords.map(mapFromBackend));
      }
      setError(null);
    } catch (err) {
      console.error('Failed to fetch dispatch records:', err);
      setError(err.message);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await dispatchApi.getStats();
      if ((response.ok || response.success) && response.data) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch dispatch stats:', err);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchRecords(), fetchStats()]);
      setLoading(false);
    };
    init();
  }, [fetchRecords, fetchStats]);

  const createDispatch = async (record) => {
    try {
      const backendData = mapToBackend(record);
      const response = await dispatchApi.create(backendData);
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(DISPATCH_STORE);
        return response.data;
      }
      throw new Error(response.message || 'Failed to create dispatch');
    } catch (err) {
      console.error('Failed to create dispatch:', err);
      throw err;
    }
  };

  const updateDispatch = async (id, record) => {
    try {
      const backendData = mapToBackend(record);
      let backendId = record.backendId;
      if (!backendId) {
        const existing = records.find(r => r.id === id);
        backendId = existing?.backendId;
      }
      const response = await dispatchApi.update(backendId || id, backendData);
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(DISPATCH_STORE);
        return response.data;
      }
      throw new Error(response.message || 'Failed to update dispatch');
    } catch (err) {
      console.error('Failed to update dispatch:', err);
      throw err;
    }
  };

  const deleteDispatch = async (id) => {
    try {
      const existing = records.find(r => r.id === id);
      const backendId = existing?.backendId || id;
      const response = await dispatchApi.delete(backendId);
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(DISPATCH_STORE);
        return true;
      }
      throw new Error(response.message || 'Failed to delete dispatch');
    } catch (err) {
      console.error('Failed to delete dispatch:', err);
      throw err;
    }
  };

  /**
   * Transition a dispatch record to a new status.
   */
  const transitionDispatch = async (id, nextStatus) => {
    try {
      const currentRecord = records.find(r => r.id === id);
      if (!currentRecord) {
        return { ok: false, message: 'Record not found' };
      }

      const backendStatus = nextStatus.replace(/ /g, '_').toUpperCase();
      const response = await dispatchApi.update(currentRecord.backendId, {
        ...mapToBackend(currentRecord),
        status: backendStatus,
      });
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(DISPATCH_STORE);
        return { ok: true, record: response.data, from: currentRecord.status, to: nextStatus };
      }
      throw new Error(response.message || 'Failed to transition dispatch');
    } catch (err) {
      console.error('Failed to transition dispatch:', err);
      return { ok: false, message: err.message };
    }
  };

  /**
   * Find dispatch record(s) for a given Work Order number.
   */
  const getDispatchForOrder = (workOrder) =>
    records.filter((r) => r.productionOrder === workOrder);

  /**
   * Get the latest dispatch record for a Work Order.
   */
  const getLatestDispatchForOrder = (workOrder) => {
    const dispatches = records.filter((r) => r.productionOrder === workOrder);
    return dispatches.length > 0 ? dispatches[0] : null;
  };

  const value = {
    records,
    stats,
    loading,
    error,
    createDispatch,
    updateDispatch,
    deleteDispatch,
    transitionDispatch,
    getDispatchForOrder,
    getLatestDispatchForOrder,
    refresh: fetchRecords,
    refreshStats: fetchStats,
  };

  return <DispatchContext.Provider value={value}>{children}</DispatchContext.Provider>;
}

export function useDispatch() {
  const context = useContext(DispatchContext);
  if (!context) {
    throw new Error('useDispatch must be used inside <DispatchProvider>');
  }
  return context;
}
