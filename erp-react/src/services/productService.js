import api from '../api/axiosInstance';
import { normalizeApiError } from './cprService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const productService = {
  async list(q) {
    return request(async () => {
      const { data } = await api.get('/products', { params: q ? { q } : {} });
      return data?.data ?? data ?? [];
    });
  }
};

export default productService;
