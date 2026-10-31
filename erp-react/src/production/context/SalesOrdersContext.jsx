import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import api from '../../api/axiosInstance';
import {
  buildSalesOrderOptionsParams,
  normalizeSalesOrderDetail,
  normalizeSalesOrderOption,
  resolveSalesOrderId,
  unwrapApiData,
} from '../utils/salesOrderReadModel';

const SalesOrdersContext = createContext(null);

/**
 * Sales Orders (CPOs) for the Production module — served by the REAL ERP
 * backend. No localStorage. No fake data.
 *
 * `/sales-orders` returns FULL Sales Order records: every row is assembled
 * with its items, attachments, timeline and history. Walking all of its pages
 * to fill a dropdown loaded the entire Sales Order dataset into the browser on
 * every Production mount, so this provider now reads:
 *
 *   - GET /sales-orders/options  → one bounded request of slim CPO rows
 *     (id, CPO number, customer, order date, item count) for pickers/filters;
 *   - GET /sales-orders/{id}     → ONE full Sales Order, fetched on demand
 *     (and cached) by the screens that need its line items.
 */
export function SalesOrdersProvider({ children }) {
  const [salesOrders, setSalesOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // In-flight promise guard: a React re-render, StrictMode double-invoke or a
  // second retry click must not fire a duplicate options request.
  const optionsRequest = useRef(null);
  // Full Sales Orders are fetched per id, once per session, on demand.
  const detailCache = useRef(new Map());

  /** Load the slim CPO option feed (defaults to every visible CPO). */
  const loadSalesOrders = useCallback(async ({ search } = {}) => {
    if (optionsRequest.current) return optionsRequest.current;
    const request = (async () => {
      try {
        setLoading(true);
        setError(null);
        const { data } = await api.get('/sales-orders/options', {
          params: buildSalesOrderOptionsParams({ search }),
        });
        const rows = unwrapApiData(data);
        const options = (Array.isArray(rows) ? rows : [])
          .map(normalizeSalesOrderOption)
          .filter(Boolean);
        detailCache.current.clear();
        setSalesOrders(options);
        return true;
      } catch (err) {
        console.error('Failed to load CPO options from Sales:', err?.message || err);
        setError(err);
        return false;
      } finally {
        setLoading(false);
        optionsRequest.current = null;
      }
    })();
    optionsRequest.current = request;
    return request;
  }, []);

  useEffect(() => {
    loadSalesOrders();
  }, [loadSalesOrders]);

  /** The slim option row for a CPO id or SO/CPO number, if it is loaded. */
  const getSalesOrderOption = useCallback(
    (idOrNumber) => {
      if (idOrNumber == null || idOrNumber === '') return null;
      const wanted = String(idOrNumber);
      return (
        salesOrders.find(
          (so) =>
            so.id === wanted ||
            (so.salesOrderId != null && String(so.salesOrderId) === wanted) ||
            so.salesOrderNumber === wanted
        ) || null
      );
    },
    [salesOrders]
  );

  /**
   * Read ONE CPO in the option shape by DATABASE ID — including a superseded
   * revision, which the option feed deliberately omits (it serves only the
   * current row of each revision chain). Used to keep an already-saved link
   * visible in pickers such as the Work Order's CPO Reference.
   *
   * Resolves with the option, or null when the CPO cannot be read — the caller
   * then falls back to the saved reference instead of showing a blank field.
   * The failure is rendered in place, so it must NOT replace the page with the
   * global error screen (`suppressGlobalError`).
   */
  const fetchSalesOrderOption = useCallback(
    async (idOrNumber) => {
      const wanted = String(idOrNumber ?? '').trim();
      // `/sales-orders/{id}` binds a numeric path variable; a CPO NUMBER is
      // resolved from the loaded feed instead (or by the caller's fallback).
      if (!/^\d+$/.test(wanted)) return null;
      const known = getSalesOrderOption(wanted);
      if (known) return known;
      try {
        const { data } = await api.get(`/sales-orders/${wanted}`, {
          suppressGlobalError: true,
        });
        return normalizeSalesOrderDetail(unwrapApiData(data));
      } catch {
        return null;
      }
    },
    [getSalesOrderOption]
  );

  /**
   * Fetch ONE full Sales Order (with its line items) by CPO id or SO/CPO
   * number. Resolves to null when the reference does not match a Sales Order,
   * so callers never trigger a request for an unknown id.
   */
  const getSalesOrderById = useCallback(
    async (idOrNumber) => {
      const salesOrderId = resolveSalesOrderId(salesOrders, idOrNumber);
      if (salesOrderId == null) return null;
      if (detailCache.current.has(salesOrderId)) return detailCache.current.get(salesOrderId);
      const { data } = await api.get(`/sales-orders/${salesOrderId}`);
      const detail = normalizeSalesOrderDetail(unwrapApiData(data));
      if (detail) detailCache.current.set(salesOrderId, detail);
      return detail;
    },
    [salesOrders]
  );

  /** Add a sales order — delegates to the real backend. */
  const addSalesOrder = useCallback(async () => {
    try {
      // Sales Orders are created through the Sales module, not Production
      // This method is kept for API compatibility but should not be used
      console.warn('Sales Orders should be created through the Sales module');
      return null;
    } catch (err) {
      console.error('Failed to create sales order:', err);
      return null;
    }
  }, []);

  const value = {
    salesOrders,
    loading,
    error,
    loadSalesOrders,
    addSalesOrder,
    getSalesOrderOption,
    getSalesOrderById,
    fetchSalesOrderOption,
  };

  return (
    <SalesOrdersContext.Provider value={value}>{children}</SalesOrdersContext.Provider>
  );
}

export function useSalesOrders() {
  const context = useContext(SalesOrdersContext);
  if (!context) {
    throw new Error('useSalesOrders must be used inside <SalesOrdersProvider>');
  }
  return context;
}
