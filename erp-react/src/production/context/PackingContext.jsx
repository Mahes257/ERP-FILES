import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { packingApi } from '../utils/api';
import { notifyProductionDataChanged } from '../utils/dataChanged';

export const PackingContext = createContext(null);

/** Refresh-bus identity for this store's writes. */
const PACKING_STORE = 'packing';

/**
 * Map backend packing record to frontend expected field names.
 */
function mapToBackend(record) {
  const mapped = {
    packingListNumber: record.id, // frontend uses 'id' as the list number
    workOrderId: record.productionOrder,
    salesOrderNumber: record.salesOrderNumber,
    customer: record.customer,
    product: record.product,
    productionQuantity: record.quantity,
    packedQuantity: record.packedQuantity || 0,
    packingDate: record.packingDate,
    status: record.status,
    remarks: record.remarks,
  };
  // Keep backend id for update/delete operations
  if (record.backendId) mapped.id = record.backendId;
  return mapped;
}

/**
 * Display form of a backend status.
 *
 * The backend stores/returns the enum name ('COMPLETED', 'IN_PROGRESS',
 * 'READY_FOR_DISPATCH'), while the status tabs and the filter options compare
 * against display case ('Completed', 'In Progress', 'Ready for Dispatch').
 * Without this normalisation the "Completed" tab showed its count but listed no
 * rows, because 'COMPLETED' !== 'Completed'.
 */
function toDisplayStatus(raw) {
  if (!raw) return 'Pending';
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
 * Map backend response to frontend expected field names.
 */
function mapFromBackend(dto) {
  return {
    backendId: dto.id,
    id: dto.packingListNumber,
    productionOrder: dto.workOrderId,
    salesOrderNumber: dto.salesOrderNumber,
    customer: dto.customer,
    product: dto.product,
    quantity: dto.productionQuantity,
    packedQuantity: dto.packedQuantity || 0,
    packingDate: dto.packingDate,
    status: toDisplayStatus(dto.status),
    remarks: dto.remarks,
    createdBy: dto.createdBy,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

/**
 * Packing store backed by MySQL via Spring Boot API.
 */
export function PackingProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRecords = useCallback(async (params = {}) => {
    try {
      const response = await packingApi.list({ size: 100, ...params });
      if ((response.ok || response.success) && response.data) {
        const rawRecords = response.data.content || (Array.isArray(response.data) ? response.data : []);
        setRecords(rawRecords.map(mapFromBackend));
      }
      setError(null);
    } catch (err) {
      console.error('Failed to fetch packing records:', err);
      setError(err.message);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const response = await packingApi.getStats();
      if ((response.ok || response.success) && response.data) {
        setStats(response.data);
      }
    } catch (err) {
      console.error('Failed to fetch packing stats:', err);
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

  const createPackingRecord = async (record) => {
    try {
      const backendData = mapToBackend(record);
      const response = await packingApi.create(backendData);
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(PACKING_STORE);
        return response.data;
      }
      throw new Error(response.message || 'Failed to create packing record');
    } catch (err) {
      console.error('Failed to create packing record:', err);
      throw err;
    }
  };

  const updatePackingRecord = async (id, record) => {
    try {
      const backendData = mapToBackend(record);
      // Use backendId if available, otherwise find by frontend id
      let backendId = record.backendId;
      if (!backendId) {
        const existing = records.find(r => r.id === id);
        backendId = existing?.backendId;
      }
      const response = await packingApi.update(backendId || id, backendData);
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(PACKING_STORE);
        return response.data;
      }
      throw new Error(response.message || 'Failed to update packing record');
    } catch (err) {
      console.error('Failed to update packing record:', err);
      throw err;
    }
  };

  const deletePackingRecord = async (id) => {
    try {
      // Find backend id from frontend id
      const existing = records.find(r => r.id === id);
      const backendId = existing?.backendId || id;
      const response = await packingApi.delete(backendId);
      if (response.ok || response.success) {
        await Promise.all([fetchRecords(), fetchStats()]);
        notifyProductionDataChanged(PACKING_STORE);
        return true;
      }
      throw new Error(response.message || 'Failed to delete packing record');
    } catch (err) {
      console.error('Failed to delete packing record:', err);
      throw err;
    }
  };

  const value = {
    records,
    stats,
    loading,
    error,
    createPackingRecord,
    updatePackingRecord,
    deletePackingRecord,
    refresh: fetchRecords,
    refreshStats: fetchStats,
  };

  return <PackingContext.Provider value={value}>{children}</PackingContext.Provider>;
}

export function usePacking() {
  const context = useContext(PackingContext);
  if (!context) {
    throw new Error('usePacking must be used inside <PackingProvider>');
  }
  return context;
}
