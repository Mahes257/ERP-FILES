import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

/**
 * E-Actions / Participation rows of Customer Purchase Orders.
 *
 * These rows live in the SAME `sales_order_e_actions` table the CPO
 * Create/Edit form writes through (SalesOrderRequest.eActions) — this service
 * only exposes them across orders so the standalone E-Actions view can list,
 * create, update and delete them without loading whole CPO aggregates.
 */
async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const base = '/sales-orders/e-actions';

const salesOrderEActionService = {
  /** Page of E-Actions (Spring Page: { content, totalElements, totalPages, ... }). */
  async list(params = {}, options = {}) {
    return request(async () => {
      const { data } = await api.get(base, { params, signal: options.signal });
      return data;
    });
  },

  /** One E-Action with its CPO context (the view/overview page). */
  async get(id, options = {}) {
    return request(async () => {
      const { data } = await api.get(`${base}/${id}`, { signal: options.signal });
      return data;
    });
  },

  /** CPO / Participant-Team / Status values actually present in MySQL. */
  async options(options = {}) {
    return request(async () => {
      const { data } = await api.get(`${base}/options`, { signal: options.signal });
      return data?.data || data;
    });
  },

  /** Real per-status counts for the list summary cards. */
  async stats(options = {}) {
    return request(async () => {
      const { data } = await api.get(`${base}/stats`, { signal: options.signal });
      return data?.data || data;
    });
  },

  async create(salesOrderId, payload) {
    return request(async () => {
      const { data } = await api.post(`/sales-orders/${salesOrderId}/e-actions`, payload);
      return data;
    });
  },

  async update(salesOrderId, actionId, payload) {
    return request(async () => {
      const { data } = await api.put(`/sales-orders/${salesOrderId}/e-actions/${actionId}`, payload);
      return data;
    });
  },

  async remove(salesOrderId, actionId) {
    return request(async () => {
      const { data } = await api.delete(`/sales-orders/${salesOrderId}/e-actions/${actionId}`);
      return data;
    });
  },

  /* ------------------------------------------------------------------
   * Standalone (CPO-less) rows.
   *
   * An E-Action may be raised against a CPO reference the user typed when the
   * order is not one of the CPO records here: the payload then carries
   * `cpoReference` instead of `salesOrderId`. These three calls address the row
   * by its OWN id, because no Customer Purchase Order aggregate holds it — the
   * linked calls above cannot (there is no CPO id to put in the path).
   * ------------------------------------------------------------------ */

  /** Create an E-Action from the payload: an existing CPO or a typed reference. */
  async createStandalone(payload) {
    return request(async () => {
      const { data } = await api.post(base, payload);
      return data;
    });
  },

  /** Update one E-Action by its own id (rows raised against a typed reference). */
  async updateStandalone(actionId, payload) {
    return request(async () => {
      const { data } = await api.put(`${base}/${actionId}`, payload);
      return data;
    });
  },

  /** Delete one E-Action by its own id (rows raised against a typed reference). */
  async removeStandalone(actionId) {
    return request(async () => {
      const { data } = await api.delete(`${base}/${actionId}`);
      return data;
    });
  }
};

export default salesOrderEActionService;
