/**
 * sales/access/catalog.js
 * ------------------------------------------------------------------
 * The Sales access catalog — the frontend mirror of
 * com.vishatech.erp.sales.access.SalesAccessArea.
 *
 * It lists exactly the functional areas that exist in the Sales module and, per
 * area, only the actions that really exist on that page. Quotations have no
 * approval endpoint, so no Approve switch; Cost Workouts have no export, so no
 * Export switch; the Dashboard is view-only. The backend validates every saved
 * key against the same catalog, so the two cannot silently drift: an unknown
 * area/action is rejected there.
 *
 * `routes` is the URL prefix a page of that area lives under — the navigation
 * hides an item when none of the areas it leads to is viewable.
 * ------------------------------------------------------------------
 */

export const SALES_AREAS = [
  {
    key: 'dashboard',
    label: 'Sales Dashboard',
    actions: ['view'],
    routes: ['/sales/dashboard']
  },
  {
    key: 'leads',
    label: 'CRM · Leads',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'import', 'upload'],
    routes: ['/leads']
  },
  {
    key: 'clients',
    label: 'CRM · Clients',
    actions: ['view', 'create', 'edit', 'delete', 'upload'],
    routes: ['/clients']
  },
  {
    key: 'contacts',
    label: 'CRM · Contacts',
    actions: ['view', 'create', 'edit', 'delete'],
    routes: ['/contacts']
  },
  {
    key: 'followups',
    label: 'CRM · Follow-ups',
    actions: ['view', 'create', 'edit', 'delete', 'upload'],
    routes: ['/followups']
  },
  {
    key: 'cpr',
    label: 'CPR',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'export', 'upload'],
    routes: ['/cprs', '/cpr/technical-verification']
  },
  {
    key: 'costWorkouts',
    label: 'Cost Workouts',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve'],
    routes: ['/cost-workouts']
  },
  {
    key: 'profitWorkouts',
    label: 'Profit Workouts',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve'],
    routes: ['/profit-workouts']
  },
  {
    key: 'quotations',
    label: 'Quotations',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'send', 'upload'],
    routes: ['/quotations']
  },
  {
    key: 'salesContracts',
    label: 'Sales Contracts',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'import', 'upload'],
    routes: ['/sales-contracts']
  },
  {
    key: 'cpo',
    label: 'Customer Purchase Orders',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
    routes: ['/sales-orders']
  },
  {
    key: 'deliveryChallans',
    label: 'Delivery Challans',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'upload'],
    routes: ['/delivery-challans']
  },
  {
    key: 'proformaInvoices',
    label: 'Proforma Invoices',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'send', 'upload'],
    routes: ['/proforma-invoices', '/packing-lists']
  },
  {
    key: 'invoices',
    label: 'Invoices',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'send', 'upload'],
    routes: ['/invoices']
  },
  {
    key: 'paymentReceipts',
    label: 'Payment Receipts',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'upload'],
    routes: ['/payment-receipts']
  },
  {
    key: 'creditNotes',
    label: 'Credit Notes',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'export', 'upload'],
    routes: ['/credit-notes']
  },
  {
    key: 'documents',
    label: 'Documents',
    actions: ['view'],
    routes: ['/documents']
  },
  {
    key: 'reports',
    label: 'Sales Reports',
    actions: ['view', 'export'],
    routes: ['/sales/reports']
  },
  {
    key: 'settings',
    label: 'Sales Settings',
    actions: ['view', 'edit'],
    routes: ['/sales/settings']
  }
];

/** Human labels for the action switches, in the order the matrix shows them. */
export const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  submit: 'Submit',
  send: 'Send',
  export: 'Export',
  import: 'Import',
  upload: 'Upload'
};

/**
 * The Sales sidebar's parent modules, each of which is only useful while at
 * least one of its areas is viewable. Mirrors SalesNav's CRM / CPR / Sales
 * Execution grouping.
 */
export const SALES_MODULES = [
  { key: 'crm', label: 'CRM', areas: ['leads', 'clients', 'contacts', 'followups'] },
  { key: 'cpr', label: 'CPR', areas: ['cpr', 'costWorkouts', 'profitWorkouts'] },
  {
    key: 'salesExec',
    label: 'Sales Execution',
    areas: ['quotations', 'salesContracts', 'cpo', 'deliveryChallans', 'proformaInvoices',
      'invoices', 'paymentReceipts', 'creditNotes']
  }
];

/** An empty matrix: every area, every supported action OFF (fail closed). */
export function emptyPermissions() {
  const matrix = {};
  for (const area of SALES_AREAS) {
    const actions = {};
    for (const action of area.actions) actions[action] = false;
    matrix[area.key] = actions;
  }
  return matrix;
}

/** True when `permissions` grants `action` on `area` (missing => false). */
export function allows(permissions, areaKey, action = 'view') {
  return Boolean(permissions?.[areaKey]?.[action]);
}

/** True when at least one area of a sidebar module is viewable. */
export function canViewModule(permissions, moduleKey) {
  const module = SALES_MODULES.find((entry) => entry.key === moduleKey);
  return Boolean(module) && module.areas.some((area) => allows(permissions, area, 'view'));
}

/** True when at least one Sales area is viewable at all. */
export function canViewSales(permissions) {
  return SALES_AREAS.some((area) => allows(permissions, area.key, 'view'));
}

/** The area a pathname belongs to, by its longest matching route prefix. */
export function areaForPath(pathname) {
  if (!pathname) return null;
  let best = null;
  for (const area of SALES_AREAS) {
    for (const route of area.routes || []) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        if (!best || route.length > best.route.length) best = { area, route };
      }
    }
  }
  return best ? best.area.key : null;
}

export default SALES_AREAS;
