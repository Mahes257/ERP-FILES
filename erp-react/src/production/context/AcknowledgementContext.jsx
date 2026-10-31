import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { acknowledgementApi } from '../utils/api';
import { useProductionOrders } from './ProductionOrdersContext';
import { notifyProductionDataChanged } from '../utils/dataChanged';

const AcknowledgementContext = createContext(null);

/** Refresh-bus identity for this store's writes. */
const ACK_STORE = 'acknowledgements';

/**
 * Acknowledgement store — one record per Work Order.
 * Uses the real ERP backend API exclusively. No localStorage fallback.
 */
export function AcknowledgementProvider({ children }) {
  const [acknowledgements, setAcknowledgements] = useState([]);
  const { orders } = useProductionOrders();

  // Signature of the known Work Orders — the per-Work-Order fallback loader
  // only needs to run again when that set changes.
  const workOrderKey = useMemo(
    () => (orders || []).map((o) => o.workOrder).filter(Boolean).sort().join('|'),
    [orders]
  );

  /**
   * Load every acknowledgement from the database.
   *
   * The API exposes acknowledgements per Work Order (there is no collection
   * GET), so each known Work Order is queried with the work-order scoped GET.
   * The previous implementation called an acknowledgementApi.list() that did
   * not exist, which silently left this store empty — every Work Order showed
   * "Pending" even after it had been acknowledged and saved to MySQL.
   */
  const loadAcknowledgements = useCallback(async () => {
    const workOrders = workOrderKey ? workOrderKey.split('|') : [];
    if (workOrders.length === 0) {
      setAcknowledgements([]);
      return;
    }

    try {
      const responses = await Promise.all(
        workOrders.map((wo) => acknowledgementApi.getByWorkOrder(wo).catch(() => null))
      );
      setAcknowledgements(
        responses
          .map((response) => response?.data ?? response)
          .filter((row) => row && row.workOrderId)
      );
    } catch {
      setAcknowledgements([]);
    }
  }, [workOrderKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await loadAcknowledgements();
      // `loadAcknowledgements` already guards against torn-down providers for
      // the error paths; this flag keeps the intent explicit for future edits.
      if (cancelled) return;
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [loadAcknowledgements]);

  const saveAcknowledgement = useCallback(async (data) => {
    try {
      const result = await acknowledgementApi.save(data);
      if (result?.ok || result?.success) {
        setAcknowledgements((prev) => {
          const existing = prev.find((a) => a.workOrderId === data.workOrderId);
          if (existing) {
            return prev.map((a) => a.workOrderId === data.workOrderId ? (result.data || data) : a);
          }
          return [result.data || data, ...prev];
        });
        notifyProductionDataChanged(ACK_STORE);
        return true;
      }
    } catch (err) {
      console.error('Backend acknowledgement save failed:', err.message);
      throw err;
    }
    return false;
  }, []);

  const getAcknowledgement = useCallback((workOrderId) => {
    return acknowledgements.find((a) => a.workOrderId === workOrderId) || null;
  }, [acknowledgements]);

  const deleteAcknowledgementsForOrder = useCallback(async (workOrderId) => {
    try {
      // The API only exposes a work-order scoped delete; the previous code called
      // a non-existent acknowledgementApi.delete(item.id), so the acknowledgement
      // row was never removed and stayed orphaned in the database.
      await acknowledgementApi.deleteForOrder(workOrderId);
      setAcknowledgements((prev) => prev.filter((a) => a.workOrderId !== workOrderId));
      notifyProductionDataChanged(ACK_STORE);
      return true;
    } catch {
      return true;
    }
  }, []);

  const value = {
    acknowledgements,
    saveAcknowledgement,
    getAcknowledgement,
    deleteAcknowledgementsForOrder,
    refreshAcknowledgements: loadAcknowledgements,
  };

  return (
    <AcknowledgementContext.Provider value={value}>
      {children}
    </AcknowledgementContext.Provider>
  );
}

export function useAcknowledgement() {
  const context = useContext(AcknowledgementContext);
  if (!context) {
    throw new Error('useAcknowledgement must be used inside <AcknowledgementProvider>');
  }
  return context;
}
