import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { modelApi } from '../utils/api';
import {
  notifyProductionDataChanged,
  subscribeProductionDataChanged,
} from '../utils/dataChanged';

const ModelsContext = createContext(null);

/** Refresh-bus identity so this store never re-fetches its own writes. */
const MODELS_STORE = 'models';

/**
 * Models store — manages 3D CAD models linked to Work Orders.
 * Uses the real ERP backend API exclusively. No localStorage fallback.
 */
export function ModelsProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  // True once the backend has answered a real API call successfully. Used by
  // ModelsPage to decide whether a real multipart file upload is possible.
  const [backendAvailable, setBackendAvailable] = useState(false);

  const fetchModels = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await modelApi.list({ size: 500 });
      const content = result?.data?.content || result?.content || [];
      setRecords(content);
      setBackendAvailable(true);
    } catch (err) {
      console.error('Failed to load models:', err.message);
      setError(err.message);
      setRecords([]);
      setBackendAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const result = await modelApi.getStats();
      setStats(result?.data || result);
      setBackendAvailable(true);
    } catch {
      setStats(null);
      setBackendAvailable(false);
    }
  }, []);

  useEffect(() => {
    fetchModels();
    fetchStats();
  }, [fetchModels, fetchStats]);

  useEffect(
    () => subscribeProductionDataChanged(MODELS_STORE, () => { fetchModels(); fetchStats(); }),
    [fetchModels, fetchStats]
  );

  const saveModel = async (data) => {
    try {
      if (data.id && typeof data.id === 'number') {
        await modelApi.update(data.id, {
          workOrderId: data.workOrderId,
          workOrderItemId: data.workOrderItemId,
          itemName: data.itemName || '',
          modelRevision: data.modelRevision || 'Rev A',
          uploadedBy: data.uploadedBy || 'System',
        });
      } else {
        const result = await modelApi.create({
          workOrderId: data.workOrderId,
          workOrderItemId: data.workOrderItemId,
          itemName: data.itemName || '',
          modelNumber: data.modelNumber,
          modelRevision: data.modelRevision || 'Rev A',
          uploadedBy: data.uploadedBy || 'System',
        });
        if (!result?.ok && !result?.success) {
          throw new Error(result?.message || 'Failed to create model');
        }
      }
      await fetchModels();
      await fetchStats();
      // This store already reloaded itself — tell the OTHER stores only.
      notifyProductionDataChanged(MODELS_STORE);
    } catch (err) {
      console.error('Failed to save model:', err);
      throw err;
    }
    return true;
  };

  const deleteModel = async (id) => {
    try {
      if (typeof id === 'number') {
        await modelApi.delete(id);
        await fetchModels();
        await fetchStats();
        notifyProductionDataChanged(MODELS_STORE);
      }
    } catch (err) {
      console.error('Failed to delete model:', err);
      throw err;
    }
    return true;
  };

  const getModelsForItem = (workOrderId, workOrderItemId) =>
    records.filter((r) => r.workOrderId === workOrderId && r.workOrderItemId === workOrderItemId);

  const getModelsForOrder = (workOrderId) =>
    records.filter((r) => r.workOrderId === workOrderId);

  const getModel = (id) => records.find((r) => r.id === id) || null;

  const computedStats = stats || {
    total: records.length,
    pending: records.filter((r) => (r.verificationStatus || 'Pending') === 'Pending').length,
    verified: records.filter((r) => r.verificationStatus === 'Verified').length,
    rejected: records.filter((r) => r.verificationStatus === 'Rejected').length,
  };

  const value = {
    records, loading, error, stats: computedStats, backendAvailable,
    refresh: fetchModels, refreshStats: fetchStats,
    saveModel, deleteModel,
    getModelsForItem, getModelsForOrder, getModel,
  };

  return <ModelsContext.Provider value={value}>{children}</ModelsContext.Provider>;
}

export function useModels() {
  const context = useContext(ModelsContext);
  if (!context) throw new Error('useModels must be used inside <ModelsProvider>');
  return context;
}

export { ModelsContext };
