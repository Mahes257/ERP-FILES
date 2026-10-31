import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../../api/axiosInstance';
import { notifyProductionDataChanged } from '../utils/dataChanged';

const ProductionEntryContext = createContext(null);

/**
 * Shared stage-entry store backed by the ERP database via the
 * /v1/production-entries API.
 *
 * BOTH entry modes (automatic stage flow and manual stage entry) write
 * to this SAME dataset — one record per (workOrderId, workOrderItemId, stage).
 *
 * Record shape from backend:
 *   { id, workOrderId, workOrderItemId, productionType, stage, inputQuantity,
 *     outputQuantity, rejectedQuantity, operator, date, status,
 *     remarks, createdAt, updatedAt }
 */
export function ProductionEntryProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  /** Load entries for a specific work order from the backend. */
  const loadEntriesForOrder = useCallback(async (workOrderId) => {
    if (!workOrderId) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/production-entries/order/${encodeURIComponent(workOrderId)}`);
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setEntries((prev) => {
        // Merge: keep entries from other orders, replace entries for this order
        const otherOrders = prev.filter((e) => e.workOrderId !== workOrderId);
        return [...otherOrders, ...list];
      });
    } catch (err) {
      console.error('Failed to load production entries:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Load all production entries from the backend (used by the Production Summary report). */
  const loadAllEntries = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/production-entries');
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setEntries(list);
    } catch (err) {
      console.error('Failed to load all production entries:', err);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load all entries on mount so the Production Summary report has
  // the data it needs for rejected quantity and WIP calculations.
  useEffect(() => {
    loadAllEntries();
  }, [loadAllEntries]);

  /** Create or update the entry for (workOrderId, workOrderItemId, stage). */
  const saveEntry = useCallback(async (data) => {
    try {
      const payload = {
        workOrderId: data.workOrderId,
        workOrderItemId: data.workOrderItemId || '',
        productionType: data.productionType || '',
        stage: data.stage,
        inputQuantity: data.inputQuantity ?? 0,
        outputQuantity: data.outputQuantity ?? 0,
        rejectedQuantity: data.rejectedQuantity ?? 0,
        operator: data.operator || '',
        // The backend expects `entryDate` (CreateProductionEntryRequest) — the
        // old `date` key was dropped by Jackson, so every entry written through
        // this path was stored with a NULL entry_date.
        entryDate: data.entryDate || data.date || new Date().toISOString().split('T')[0],
        status: data.status || 'Completed',
        remarks: data.remarks || '',
      };

      const { data: result } = await api.post('/production-entries', payload);
      const saved = result?.data || result;

      if (saved) {
        setEntries((prev) => {
          const existing = prev.find(
            (entry) =>
              entry.workOrderId === data.workOrderId &&
              entry.stage === data.stage &&
              (entry.workOrderItemId || '') === (data.workOrderItemId || '')
          );
          if (existing) {
            return prev.map((entry) =>
              entry.id === saved.id ? { ...entry, ...saved } : entry
            );
          }
          return [saved, ...prev];
        });
      }
      // Shop-floor writes are Production writes: announce them on the module's
      // change bus so the sidebar's pending badges (and every other Production
      // store) re-read instead of waiting for the next navigation.
      notifyProductionDataChanged();
      return true;
    } catch (err) {
      console.error('Failed to save production entry:', err);
      return false;
    }
  }, []);

  /** Delete a stage entry by id. */
  const deleteEntry = useCallback(async (id) => {
    try {
      await api.delete(`/production-entries/${id}`);
      setEntries((prev) => prev.filter((entry) => entry.id !== id));
      notifyProductionDataChanged();
      return true;
    } catch (err) {
      console.error('Failed to delete production entry:', err);
      return false;
    }
  }, []);

  /** Delete ALL stage entries belonging to a specific Work Order. */
  const deleteEntriesForOrder = useCallback(async (workOrderId) => {
    try {
      await api.delete(`/production-entries/order/${encodeURIComponent(workOrderId)}`);
      setEntries((prev) => prev.filter((entry) => entry.workOrderId !== workOrderId));
      notifyProductionDataChanged();
      return true;
    } catch (err) {
      console.error('Failed to delete entries for order:', err);
      return false;
    }
  }, []);

  /** Delete ALL stage entries belonging to a specific Work Order Item. */
  const deleteEntriesForItem = useCallback((workOrderId, workOrderItemId) => {
    // The backend doesn't have a per-item delete, so filter locally
    // after deleting via the order-level endpoint if needed
    setEntries((prev) =>
      prev.filter(
        (entry) =>
          entry.workOrderId !== workOrderId ||
          (entry.workOrderItemId || '') !== (workOrderItemId || '')
      )
    );
    return true;
  }, []);

  /** All entries for one Work Order. */
  const entriesForOrder = useCallback(
    (workOrderId) => entries.filter((entry) => entry.workOrderId === workOrderId),
    [entries]
  );

  /** All entries for one specific Work Order Item. */
  const entriesForItem = useCallback(
    (workOrderId, workOrderItemId) =>
      entries.filter(
        (entry) =>
          entry.workOrderId === workOrderId &&
          (entry.workOrderItemId || '') === (workOrderItemId || '')
      ),
    [entries]
  );

  /** The entry for a specific (Work Order, Item, stage), if any. */
  const getEntry = useCallback(
    (workOrderId, stage, workOrderItemId) =>
      entries.find(
        (entry) =>
          entry.workOrderId === workOrderId &&
          entry.stage === stage &&
          (entry.workOrderItemId || '') === (workOrderItemId || '')
      ) || null,
    [entries]
  );

  /** Backward-compatible getEntry without workOrderItemId. */
  const getEntryLegacy = useCallback(
    (workOrderId, stage) =>
      entries.find(
        (entry) => entry.workOrderId === workOrderId && entry.stage === stage
      ) || null,
    [entries]
  );

  const value = {
    entries,
    loading,
    loadEntriesForOrder,
    loadAllEntries,
    saveEntry,
    deleteEntry,
    deleteEntriesForOrder,
    deleteEntriesForItem,
    entriesForOrder,
    entriesForItem,
    getEntry,
    getEntryLegacy,
  };

  return (
    <ProductionEntryContext.Provider value={value}>{children}</ProductionEntryContext.Provider>
  );
}

export function useProductionEntry() {
  const context = useContext(ProductionEntryContext);
  if (!context) {
    throw new Error('useProductionEntry must be used inside <ProductionEntryProvider>');
  }
  return context;
}
