import api from '../api/axiosInstance';
import createSalesService from './salesServiceFactory';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const salesCrud = createSalesService('quotations');

/**
 * quotationService — the existing Sales CRUD service (`/quotations`) extended
 * with the Quotation Overview page's own endpoints. Nothing is duplicated: the
 * CRUD/workflow surface comes straight from the shared factory, and only the
 * Overview-specific persistence is added here.
 *
 *   Remarks → /quotations/{id}/remarks      (quotation_remarks MySQL table)
 */
const quotationService = {
  ...salesCrud,

  /** Saved remarks for one quotation, newest first, with real authors. */
  async listRemarks(id) {
    return request(async () => {
      const { data } = await api.get(`/quotations/${id}/remarks`);
      return data?.data ?? [];
    });
  },

  /** Add a remark; the backend records the authenticated user as its author. */
  async addRemark(id, text) {
    return request(async () => {
      const { data } = await api.post(`/quotations/${id}/remarks`, { text });
      return data?.data ?? data;
    });
  },

  async deleteRemark(id, remarkId) {
    return request(async () => {
      const { data } = await api.delete(`/quotations/${id}/remarks/${remarkId}`);
      return data;
    });
  }
};

export default quotationService;
