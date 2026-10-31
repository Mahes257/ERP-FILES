import { purchaseGet, purchasePatch, purchasePost } from '../../api';
import { normalizePage, unwrapResponse } from '../api-client';
import { buildPageParams } from './logisticsPaging';

/**
 * Purchase Receiving / Logistics REST client.
 *
 * Every LIST endpoint here is server-paged: the caller asks for one page
 * (page / pageSize / search / filters / sort) and gets back the uniform
 * { data, total, page, pageSize, totalPages } shape. There is deliberately
 * no "give me every row" call — the backend caps a page at 100 records.
 *
 * A caller that passes no paging options (report snapshots, pickers)
 * receives the widest page the API allows (see RECEIVING_PAGE_SIZE_SNAPSHOT
 * in ./logisticsPaging.js).
 */
export const logisticsApi = {
  // ==================== Goods Receipt (GRN) ====================
  async grns({ page, pageSize, search, sort, status, vendor, poNo } = {}) {
    const { data } = await purchaseGet('/grns', buildPageParams({ page, pageSize, search, sort, status, vendor, poNo }));
    return normalizePage(unwrapResponse(data));
  },
  async grnStats() {
    const { data } = await purchaseGet('/grns/stats');
    return unwrapResponse(data);
  },
  async grn(id) {
    const { data } = await purchaseGet(`/grns/${id}`);
    return unwrapResponse(data);
  },
  async nextGrnNumber() {
    const { data } = await purchaseGet('/grns/next-number');
    return unwrapResponse(data);
  },
  async createGrn(payload) {
    const { data } = await purchasePost('/grns', payload);
    return unwrapResponse(data);
  },
  async receiveGrn(id, items = []) {
    const { data } = await purchasePost(`/grns/${id}/receive`, { items });
    return unwrapResponse(data);
  },
  async updateGrn(id, patch) {
    const { data } = await purchasePatch(`/grns/${id}`, patch);
    return unwrapResponse(data);
  },

  // ==================== Quality Inspection ====================
  async inspections({ page, pageSize, search, sort, status, grnNo } = {}) {
    const { data } = await purchaseGet('/inspections', buildPageParams({ page, pageSize, search, sort, status, grnNo }));
    return normalizePage(unwrapResponse(data));
  },
  async inspectionStats() {
    const { data } = await purchaseGet('/inspections/stats');
    return unwrapResponse(data);
  },
  /** ONE inspection by numeric id or by its inspection number. */
  async inspection(id) {
    const { data } = await purchaseGet(`/inspections/${encodeURIComponent(id)}`);
    return unwrapResponse(data);
  },
  async createInspection(payload) {
    const { data } = await purchasePost('/inspections', payload);
    return unwrapResponse(data);
  },
  async updateInspection(id, patch) {
    const { data } = await purchasePatch(`/inspections/${id}`, patch);
    return unwrapResponse(data);
  },

  // ==================== Manufacturing / Packing ====================
  async manufacturing({ page, pageSize, search, sort, status, poNo } = {}) {
    const { data } = await purchaseGet('/manufacturing', buildPageParams({ page, pageSize, search, sort, status, poNo }));
    return normalizePage(unwrapResponse(data));
  },
  async manufacturingStats() {
    const { data } = await purchaseGet('/manufacturing/stats');
    return unwrapResponse(data);
  },
  async nextMfrNumber() {
    const { data } = await purchaseGet('/manufacturing/next-number');
    return unwrapResponse(data);
  },
  async createManufacturing(payload) {
    const { data } = await purchasePost('/manufacturing', payload);
    return unwrapResponse(data);
  },
  async updateManufacturing(id, patch) {
    const { data } = await purchasePatch(`/manufacturing/${id}`, patch);
    return unwrapResponse(data);
  },

  // ==================== Shipments ====================
  async shipments({ page, pageSize, search, sort, status, poNo, vendor } = {}) {
    const { data } = await purchaseGet('/shipments', buildPageParams({ page, pageSize, search, sort, status, poNo, vendor }));
    return normalizePage(unwrapResponse(data));
  },
  async shipmentStats() {
    const { data } = await purchaseGet('/shipments/stats');
    return unwrapResponse(data);
  },
  async createShipment(payload) {
    const { data } = await purchasePost('/shipments', payload);
    return unwrapResponse(data);
  },
  async shipment(id) {
    const { data } = await purchaseGet(`/shipments/${id}`);
    return unwrapResponse(data);
  },
  async updateShipment(id, patch) {
    const { data } = await purchasePatch(`/shipments/${id}`, patch);
    return unwrapResponse(data);
  },

  // ==================== Inventory Update ====================
  async inventory({ page, pageSize, search, sort, type, warehouse, sku, product, reference, inspectionNo } = {}) {
    const { data } = await purchaseGet('/inventory', buildPageParams({ page, pageSize, search, sort, type, warehouse, sku, product, reference, inspectionNo }));
    return normalizePage(unwrapResponse(data));
  },
  async inventoryStats() {
    const { data } = await purchaseGet('/inventory/stats');
    return unwrapResponse(data);
  },
  async inventoryLedger({ sku = '', product = '', warehouse = '' } = {}) {
    const { data } = await purchaseGet('/inventory/ledger', { sku, product, warehouse });
    return unwrapResponse(data);
  },
  async inventoryByInspection(inspectionNo) {
    const { data } = await purchaseGet(`/inventory/by-inspection/${encodeURIComponent(inspectionNo)}`);
    return unwrapResponse(data);
  },
  async inventoryMovement(id) {
    const { data } = await purchaseGet(`/inventory/${encodeURIComponent(id)}`);
    return unwrapResponse(data);
  },
  async createInventory(payload) {
    const { data } = await purchasePost('/inventory', payload);
    return unwrapResponse(data);
  },
  async transferInventory(payload) {
    const { data } = await purchasePost('/inventory/transfer', payload);
    return unwrapResponse(data);
  },
  async reverseInventory(id, payload = {}) {
    const { data } = await purchasePost(`/inventory/${encodeURIComponent(id)}/reverse`, payload);
    return unwrapResponse(data);
  }
};
