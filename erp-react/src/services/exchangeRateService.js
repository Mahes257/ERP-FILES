import api from '../api/axiosInstance';
import { normalizeApiError } from './masterService';

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

const exchangeRateService = {
  /** Latest cached-or-fresh rates: { base, lastUpdated, rates, stale, source }. */
  async getLatest() {
    return request(async () => {
      const { data } = await api.get('/exchange-rates/latest');
      return data;
    });
  },

  /** Force a provider refresh (fallback to cache on failure). */
  async refresh() {
    return request(async () => {
      const { data } = await api.post('/exchange-rates/refresh');
      return data;
    });
  },

  /** Settings → Financial Settings: { baseCurrency, lastUpdated, stale }. */
  async getFinancial() {
    return request(async () => {
      const { data } = await api.get('/settings/financial');
      return data;
    });
  },

  /** Change the base currency (ADMIN only). */
  async updateFinancial(baseCurrency) {
    return request(async () => {
      const { data } = await api.put('/settings/financial', { baseCurrency });
      return data;
    });
  }
};

export default exchangeRateService;
