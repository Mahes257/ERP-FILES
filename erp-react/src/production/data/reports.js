// ============================================================
// Reports — vocabulary only.
//
// The five reports are calculated in the backend (ProductionReportService)
// from the persisted Production tables, so this module holds nothing but the
// report registry and the filter vocabularies the screens render:
//
//   Reports UI → reportService → /production/reports/* → MySQL
//
// No report value is computed in the browser any more. The report registry is
// the single source of truth for the landing cards and the report switcher;
// the department and status lists are the controlled vocabularies the filter
// bar offers.
// ============================================================

// ---- Report registry (single source of truth for nav + cards) ----
export const REPORTS = [
  {
    key: 'production-summary',
    label: 'Production Summary',
    icon: 'bar-chart',
    path: '/production/reports/production-summary',
    description: 'Order volumes, completion and progress across production.',
  },
  {
    key: 'machine-utilization',
    label: 'Machine Utilization',
    icon: 'settings',
    path: '/production/reports/machine-utilization',
    description: 'Available, running and idle hours per machine.',
  },
  {
    key: 'department-efficiency',
    label: 'Department Efficiency',
    icon: 'layers',
    path: '/production/reports/department-efficiency',
    description: 'Output versus planned effort per department.',
  },
  {
    key: 'material-consumption',
    label: 'Material Consumption',
    icon: 'package',
    path: '/production/reports/material-consumption',
    description: 'Issued, consumed and remaining quantities by material.',
  },
  {
    key: 'delay-analysis',
    label: 'Delay Analysis',
    icon: 'clock',
    path: '/production/reports/delay-analysis',
    description: 'Delayed orders with reasons and delay days.',
  },
];

export const REPORT_DEPARTMENTS = [
  'Casting',
  'Fabrication',
  'Machine Shop',
  'Assembly',
  'Quality',
  'Packing',
  'Dispatch',
];

export const REPORT_STATUSES = [
  'Pending',
  'In Progress',
  'Pending QC',
  'Completed',
  'Packed',
  'Ready for Dispatch',
];

export const emptyReportFilters = () => ({
  dateFrom: '',
  dateTo: '',
  department: 'All',
  status: 'All',
});
