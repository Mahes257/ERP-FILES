import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { drawingApi } from '../utils/api';
import {
  notifyProductionDataChanged,
  subscribeProductionDataChanged,
} from '../utils/dataChanged';

const DrawingsContext = createContext(null);

/** Refresh-bus identity so this store never re-fetches its own writes. */
const DRAWINGS_STORE = 'drawings';

/**
 * Drawings store — manages 2D engineering drawings linked to Work Orders.
 * Uses the real ERP backend API exclusively. No localStorage fallback.
 */
export function DrawingsProvider({ children }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const fetchDrawings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await drawingApi.list({ size: 500 });
      const content = result?.data?.content || result?.content || [];
      setRecords(content);
    } catch (err) {
      console.error('Failed to load drawings:', err.message);
      setError(err.message);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const result = await drawingApi.getStats();
      setStats(result?.data || result);
    } catch {
      setStats(null);
    }
  }, []);

  useEffect(() => {
    fetchDrawings();
    fetchStats();
  }, [fetchDrawings, fetchStats]);

  useEffect(
    () => subscribeProductionDataChanged(DRAWINGS_STORE, () => { fetchDrawings(); fetchStats(); }),
    [fetchDrawings, fetchStats]
  );

  const saveDrawing = async (data) => {
    try {
      const hasFile = data.file instanceof File;

      if (data.id && typeof data.id === 'number') {
        // Update: a newly selected file is replaced through the file endpoint,
        // then the metadata is saved.
        //
        // This used to post the whole multipart body to PUT /drawings/{id},
        // which only consumes JSON — the request answered 415 "Unsupported
        // media type", so neither the replacement file nor the edited metadata
        // was saved.
        if (hasFile) {
          const formData = new FormData();
          formData.append('file', data.file);
          formData.append('performedBy', data.uploadedBy || 'System');
          const { default: api } = await import('../../api/axiosInstance');
          await api.put(`/drawings/${data.id}/file`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        }
        await drawingApi.update(data.id, {
          workOrderId: data.workOrderId,
          workOrderItemId: data.workOrderItemId,
          itemName: data.itemName || '',
          drawingRevision: data.drawingRevision || 'Rev A',
          uploadedBy: data.uploadedBy || 'System',
        });
      } else {
        // Create: if a file was selected, upload via multipart
        if (hasFile) {
          const formData = new FormData();
          const drawingJson = {
            workOrderId: data.workOrderId,
            workOrderItemId: data.workOrderItemId,
            itemName: data.itemName || '',
            drawingNumber: data.drawingNumber,
            drawingRevision: data.drawingRevision || 'Rev A',
            uploadedBy: data.uploadedBy || 'System',
          };
          formData.append('drawing', new Blob([JSON.stringify(drawingJson)], { type: 'application/json' }));
          formData.append('file', data.file);
          const { default: api } = await import('../../api/axiosInstance');
          const result = await api.post('/drawings', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          if (!result?.data?.success) {
            throw new Error(result?.data?.message || 'Failed to create drawing');
          }
        } else {
          const result = await drawingApi.create({
            workOrderId: data.workOrderId,
            workOrderItemId: data.workOrderItemId,
            itemName: data.itemName || '',
            drawingNumber: data.drawingNumber,
            drawingRevision: data.drawingRevision || 'Rev A',
            uploadedBy: data.uploadedBy || 'System',
          });
          if (!result?.ok && !result?.success) {
            throw new Error(result?.message || 'Failed to create drawing');
          }
        }
      }
      await fetchDrawings();
      await fetchStats();
      // This store already reloaded itself — tell the OTHER stores only.
      notifyProductionDataChanged(DRAWINGS_STORE);
    } catch (err) {
      console.error('Failed to save drawing:', err);
      throw err;
    }
    return true;
  };

  const deleteDrawing = async (id) => {
    try {
      if (typeof id === 'number') {
        await drawingApi.delete(id);
        await fetchDrawings();
        await fetchStats();
        notifyProductionDataChanged(DRAWINGS_STORE);
      }
    } catch (err) {
      console.error('Failed to delete drawing:', err);
      throw err;
    }
    return true;
  };

  const getDrawingsForItem = (workOrderId, workOrderItemId) =>
    records.filter((r) => r.workOrderId === workOrderId && r.workOrderItemId === workOrderItemId);

  const getDrawingsForOrder = (workOrderId) =>
    records.filter((r) => r.workOrderId === workOrderId);

  const getDrawing = (id) => records.find((r) => r.id === id) || null;

  const computedStats = stats || {
    total: records.length,
    pending: records.filter((r) => (r.verificationStatus || 'Pending') === 'Pending').length,
    verified: records.filter((r) => r.verificationStatus === 'Verified').length,
    rejected: records.filter((r) => r.verificationStatus === 'Rejected').length,
  };

  const value = {
    records, loading, error, stats: computedStats,
    backendAvailable: true,
    refresh: fetchDrawings, refreshStats: fetchStats,
    saveDrawing, deleteDrawing,
    getDrawingsForItem, getDrawingsForOrder, getDrawing,
  };

  return <DrawingsContext.Provider value={value}>{children}</DrawingsContext.Provider>;
}

export function useDrawings() {
  const context = useContext(DrawingsContext);
  if (!context) throw new Error('useDrawings must be used inside <DrawingsProvider>');
  return context;
}

export { DrawingsContext };
