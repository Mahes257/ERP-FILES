// ============================================================
// Sidebar navigation — single source of truth for menu items.
// Used by the Sidebar (rendering), the routes builder (path
// definitions) and the Header (breadcrumbs).
//
// Items with `children` render as expandable/collapsible groups.
// Child paths reuse existing Production routes wherever possible.
// ============================================================
export const menuItems = [
  { key: 'dashboard', label: 'Dashboard', path: '/production', icon: 'dashboard' },
  { key: 'orders', label: 'Production Work Orders', path: '/production/orders', icon: 'clipboard' },
  { key: 'technical-verification', label: 'Technical Verification', path: '/production/technical-verification', icon: 'shield-check' },
  { key: 'drawings', label: 'Drawings', path: '/production/drawings', icon: 'file-text' },
  { key: 'models', label: 'Models', path: '/production/models', icon: 'box' },
  { key: 'casting', label: 'Casting', path: '/production/casting', icon: 'flame' },
  { key: 'fabrication', label: 'Fabrication', path: '/production/fabrication', icon: 'layers' },
  { key: 'assembly', label: 'Assembly', path: '/production/assembly', icon: 'box' },
  { key: 'quality', label: 'Quality', path: '/production/quality', icon: 'shield-check' },
  { key: 'packing', label: 'Packing', path: '/production/packing', icon: 'package' },
  { key: 'dispatch', label: 'Dispatch', path: '/production/dispatch', icon: 'truck' },
  {
    key: 'reports',
    label: 'Reports',
    path: '/production/reports',
    icon: 'bar-chart',
    children: [
      { key: 'reports-production-summary', label: 'Production Summary', path: '/production/reports/production-summary' },
      { key: 'reports-machine-utilization', label: 'Machine Utilization', path: '/production/reports/machine-utilization' },
      { key: 'reports-department-efficiency', label: 'Department Efficiency', path: '/production/reports/department-efficiency' },
      { key: 'reports-material-consumption', label: 'Material Consumption', path: '/production/reports/material-consumption' },
      { key: 'reports-delay-analysis', label: 'Delay Analysis', path: '/production/reports/delay-analysis' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    path: '/production/settings',
    icon: 'sliders',
    children: [
      { key: 'settings-users-roles', label: 'Users & Roles', path: '/production/settings/users-roles' },
      { key: 'settings-machines', label: 'Machines', path: '/production/settings/machines' },
      { key: 'settings-work-centers', label: 'Work Centers', path: '/production/settings/work-centers' },
      { key: 'settings-parameters', label: 'Production Parameters', path: '/production/settings/parameters' },
      { key: 'settings-status-masters', label: 'Status Masters', path: '/production/settings/status-masters' },
    ],
  },
];

export const brand = {
  name: 'Vishak Tech',
  module: 'ERP · Production',
};

export const adminUser = {
  name: 'Admin User',
  role: 'Administrator',
  initials: 'AU',
};
