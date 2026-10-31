// ============================================================
// Production Dashboard — demo data (frontend only).
// All dashboard data lives here, separate from presentation
// components, so it can be swapped for real data later.
// ============================================================

// KPI cards — each card links to its module route.
// NOTE: `value` is a fallback only; ProductionDashboard derives the
// live values from the shared order/dispatch demo data so the KPIs
// never contradict the rest of the module.
export const kpiCards = [
  {
    key: 'active-jobs',
    label: 'Active Jobs',
    value: 0,
    hint: 'orders in production',
    icon: 'clipboard',
    path: '/production/orders',
  },
  {
    key: 'casting-jobs',
    label: 'Casting Jobs',
    value: 0,
    hint: 'orders in casting',
    icon: 'flame',
    path: '/production/casting',
  },
  {
    key: 'fabrication-jobs',
    label: 'Fabrication Jobs',
    value: 0,
    hint: 'orders in fabrication',
    icon: 'layers',
    path: '/production/fabrication',
  },
  {
    key: 'qc-pending',
    label: 'QC Pending',
    value: 0,
    hint: 'awaiting inspection',
    icon: 'shield-check',
    path: '/production/quality',
  },
  {
    key: 'packed',
    label: 'Packed',
    value: 0,
    hint: 'packing completed',
    icon: 'package',
    path: '/production/packing',
  },
  {
    key: 'dispatch-today',
    label: 'Dispatch Today',
    value: 0,
    hint: 'shipped today',
    icon: 'truck',
    path: '/production/dispatch',
  },
];

// Quick action shortcuts (navigation only — records are user-created).
export const quickActions = [
  { label: 'Create Work Order', icon: 'plus', path: '/production/orders' },
  { label: 'View Work Orders', icon: 'clipboard', path: '/production/orders' },
  { label: 'View QC Pending', icon: 'shield-check', path: '/production/quality' },
  { label: "View Today's Dispatch", icon: 'truck', path: '/production/dispatch' },
];
