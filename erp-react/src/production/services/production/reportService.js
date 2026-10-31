// ============================================================
// Report service.
// Centralised access to the five roadmap reports:
//   Production Summary · Machine Utilization · Department
//   Efficiency · Material Consumption · Delay Analysis
//
// Every report is calculated in the backend from the persisted
// Production tables and returned as that report's rows plus its
// summary:
//
//   Reports UI
//        ↓
//   reportService (this module)
//        ↓
//   productionReportApi → /production/reports/* → MySQL
//
// Nothing is calculated in the browser and no browser-stored data is
// mixed in: the machine hours come from the persisted machine master
// (Settings → Machines), the order figures from production_orders and
// production_entries, and the consumption figures from
// production_order_items. A report with no matching records simply
// returns an empty result and the page shows its empty state.
//
// Backed by:
//   GET /production/reports/production-summary
//   GET /production/reports/machine-utilization
//   GET /production/reports/department-efficiency
//   GET /production/reports/material-consumption
//   GET /production/reports/delay-analysis
// ============================================================
import { productionReportApi } from '../../utils/api';

export const reportService = {
  /** Production Summary — filtered orders + computed summary + departments. */
  getProductionSummary: (filters) => productionReportApi.productionSummary(filters),

  /** Machine Utilization — persisted machine master hours and utilization. */
  getMachineUtilization: (filters) => productionReportApi.machineUtilization(filters),

  /** Department Efficiency — output vs planned quantity per department. */
  getDepartmentEfficiency: (filters) => productionReportApi.departmentEfficiency(filters),

  /** Material Consumption — planned / issued / consumed quantity per item. */
  getMaterialConsumption: (filters) => productionReportApi.materialConsumption(filters),

  /** Delay Analysis — orders past their due date with computed delay days. */
  getDelayAnalysis: (filters) => productionReportApi.delayAnalysis(filters),
};

// The report registry and filter vocabularies stay frontend-side: they are the
// cards, dropdown options and default filter state the screens render.
export {
  REPORTS,
  REPORT_DEPARTMENTS,
  REPORT_STATUSES,
  emptyReportFilters,
} from '../../data/reports';
