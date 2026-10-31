import { purchaseDelete, purchaseGet, purchasePost, purchasePut } from '../../api';
import { normalizePage, unwrapResponse } from '../api-client';

const path = '/rfq-follow-ups';

/**
 * Re-throws an API failure with the server's own message.
 *
 * Spring answers a rejected create/update with
 * `{ success: false, message: "Follow-up number already exists" }`; Axios only
 * exposes its generic "Request failed with status code 400" on `error.message`,
 * which is what the form's toast used to show. Carrying the server message
 * (and status/response) through keeps the form honest about WHY the save was
 * refused.
 */
function withServerMessage(error) {
  const payload = error?.response?.data;
  const message = typeof payload === 'string' ? payload : payload?.message || payload?.error;
  if (!message) return error;
  const wrapped = new Error(message);
  wrapped.status = error.response?.status;
  wrapped.response = error.response;
  return wrapped;
}

export const rfqFollowUpApi = {
  async list({ page = 1, pageSize = 10 } = {}) {
    const { data } = await purchaseGet(path, { page: page - 1, size: pageSize });
    return normalizePage(unwrapResponse(data));
  },
  async stats() {
    const { data } = await purchaseGet(`${path}/stats`);
    return unwrapResponse(data);
  },
  async create(payload) {
    try {
      const { data } = await purchasePost(path, payload);
      return unwrapResponse(data);
    } catch (error) {
      throw withServerMessage(error);
    }
  },
  async update(id, payload) {
    try {
      const { data } = await purchasePut(`${path}/${id}`, payload);
      return unwrapResponse(data);
    } catch (error) {
      throw withServerMessage(error);
    }
  },
  async complete(id) {
    const { data } = await purchasePost(`${path}/${id}/complete`);
    return unwrapResponse(data);
  },
  async cancel(id) {
    const { data } = await purchasePost(`${path}/${id}/cancel`);
    return unwrapResponse(data);
  },
  async remove(id) {
    const { data } = await purchaseDelete(`${path}/${id}`);
    return unwrapResponse(data);
  },
  async restore(id) {
    const { data } = await purchasePost(`${path}/${id}/restore`);
    return unwrapResponse(data);
  }
};
