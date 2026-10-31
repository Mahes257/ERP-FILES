import api from '../api/axiosInstance';

/**
 * Sales Dashboard — reads the read-only backend aggregation
 * (GET /sales/dashboard). All numbers come from real Sales/CRM data.
 */
const salesDashboardService = {
  async getSummary() {
    const { data } = await api.get('/sales/dashboard');
    return data;
  },
};

export default salesDashboardService;