import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

/**
 * Reference PR No catalog (Sales).
 *
 * ONE dropdown, TWO origins — both served by the real Spring Boot backend, no
 * static arrays and no frontend-only storage:
 *   - 'CPR'    → the PR No is carried by a real CPR row (cpr.reference_pr_no)
 *   - 'DIRECT' → the PR No was registered straight from the Quotation form
 *                (pr_references table) because no CPR exists for it.
 *
 * Every method returns the raw ApiResponse body ({ success, message, data }) to
 * match the other ERP services; callers read `res.data`.
 */
const prReferenceService = {
  /** Merged autocomplete (CPR-carried + direct), capped at 20 by the backend. */
  async search(q) {
    return request(async () => {
      const { data } = await api.get('/pr-references', { params: { q } });
      return data;
    });
  },

  /**
   * Exact case-insensitive lookup across both origins. Resolves to
   * `{ data: null }` when the PR No does not exist anywhere yet — that is the
   * "brand new reference" signal, not an error.
   */
  async lookup(referencePrNo) {
    return request(async () => {
      const { data } = await api.get('/pr-references/lookup', { params: { referencePrNo } });
      return data;
    });
  },

  /** Register a PR No directly from the Quotation form (no CPR is created). */
  async create(payload) {
    return request(async () => {
      const { data } = await api.post('/pr-references', payload);
      return data;
    });
  },

  /** Register-if-new / return-if-existing — never duplicates a PR No. */
  async resolve(referencePrNo, { clientId, clientName } = {}) {
    return request(async () => {
      const { data } = await api.post('/pr-references/resolve', {
        referencePrNo,
        clientId: clientId == null || clientId === '' ? null : Number(clientId),
        clientName: clientName || null
      });
      return data;
    });
  }
};

export default prReferenceService;
