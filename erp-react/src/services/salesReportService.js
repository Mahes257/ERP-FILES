import api from '../api/axiosInstance';

/**
 * Sales Reports — reads the read-only backend aggregation
 * (GET /sales/reports). All numbers come from real Sales module data
 * with server-side date/status/module/client filtering.
 */
const salesReportService = {
  /**
   * Fetch the complete sales report for the given filter parameters.
   * @param {Object} params - { dateFrom, dateTo, status, module, client }
   * @returns {Object} ApiResponse containing { totalRecords, kpis, monthlyTrend, statusDistribution, moduleBreakdown, records }
   */
  async getReport(params = {}) {
    const { data } = await api.get('/sales/reports', { params });
    return data;
  },
};

export default salesReportService;
