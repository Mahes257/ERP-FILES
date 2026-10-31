/**
 * purchase/access/catalog.js
 * ------------------------------------------------------------------
 * The Purchase access catalog — the frontend mirror of
 * com.vishatech.erp.purchase.access.PurchaseAccessArea.
 *
 * It lists exactly the functional areas that exist in the Purchase module and,
 * per area, only the actions that really exist there. The Dashboard and the Work
 * Queue are read-only, the shared document repository is view-only for Purchase,
 * and there is no Import anywhere in the module — so no such switch is shown.
 * The backend validates every saved key against the same catalog, so the two
 * cannot silently drift: an unknown area/action is rejected there.
 *
 * `parent` names the module a submodule belongs to. The backend ANDs a
 * submodule's permission with its parent's (see PurchaseAccessService), so a
 * submodule can only narrow access — the UI state returned by /access/me is
 * already parent-adjusted, and turning a switch on here can never exceed the
 * parent module.
 *
 * `routes` is the URL prefix a page of that area lives under — the navigation
 * hides an item when the user's View permission for its area is OFF, and the
 * route guard refuses a hand-typed URL. `areaForPath` resolves a path to the
 * area with the longest matching prefix, so a submodule route wins over its
 * parent module's prefix.
 * ------------------------------------------------------------------
 */

export const PURCHASE_AREAS = [
  {
    key: 'dashboard',
    label: 'Purchase Dashboard',
    actions: ['view'],
    routes: ['/purchase/dashboard']
  },
  {
    key: 'workQueue',
    label: 'Work Queue',
    actions: ['view'],
    routes: ['/purchase/work-queue']
  },
  {
    key: 'requisition',
    label: 'Purchase Requisition',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'convert', 'upload', 'print'],
    routes: ['/purchase/requisition']
  },
  {
    key: 'prTechSpec',
    label: 'PR Technical Specification Review',
    parent: 'requisition',
    actions: ['view', 'approve', 'reject'],
    routes: ['/purchase/requisition/tech-spec']
  },
  {
    key: 'vendors',
    label: 'Vendor Management',
    actions: ['view', 'create', 'edit', 'delete', 'upload', 'download', 'export', 'print'],
    routes: ['/purchase/vendors', '/purchase/vendor-management']
  },
  {
    key: 'vendorPerformance',
    label: 'Vendor Performance',
    parent: 'vendors',
    actions: ['view', 'export'],
    routes: ['/purchase/vendors/performance']
  },
  {
    key: 'vendorReports',
    label: 'Vendor Reports',
    parent: 'vendors',
    actions: ['view', 'export', 'print'],
    routes: ['/purchase/vendors/reports']
  },
  {
    key: 'rfq',
    label: 'RFQ & Quotations',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'evaluate',
      'award', 'close', 'cancel', 'upload', 'download', 'print', 'export'],
    routes: ['/purchase/rfq', '/purchase/quotations']
  },
  {
    key: 'rfqTechnicalEvaluation',
    label: 'Technical Evaluation',
    parent: 'rfq',
    actions: ['view', 'evaluate'],
    routes: ['/purchase/rfq/technical-evaluation']
  },
  {
    key: 'rfqNegotiation',
    label: 'Final Negotiation',
    parent: 'rfq',
    actions: ['view', 'evaluate', 'print'],
    routes: ['/purchase/rfq/negotiation']
  },
  {
    key: 'rfqPcs',
    label: 'Price Comparative Statement',
    parent: 'rfq',
    actions: ['view', 'export', 'print'],
    routes: ['/purchase/rfq/price-comparative-statement']
  },
  {
    key: 'nfa',
    label: 'NFA (Technical Purchase Approval)',
    parent: 'rfq',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'print'],
    routes: ['/purchase/rfq/approval']
  },
  {
    key: 'followUps',
    label: 'RFQ Follow-ups',
    actions: ['view', 'create', 'edit', 'delete', 'complete', 'cancel'],
    routes: ['/purchase/rfq/follow-ups']
  },
  {
    key: 'orders',
    label: 'Purchase Orders',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'release',
      'acknowledge', 'print', 'export'],
    routes: ['/purchase/orders']
  },
  {
    key: 'logistics',
    label: 'Logistics',
    actions: ['view', 'create', 'edit', 'delete', 'receive', 'upload', 'download', 'print', 'export'],
    routes: ['/purchase/logistics']
  },
  {
    key: 'packing',
    label: 'Logistics · Packing',
    parent: 'logistics',
    actions: ['view', 'create', 'edit', 'print'],
    routes: ['/purchase/logistics/manufacturing']
  },
  {
    key: 'shipments',
    label: 'Logistics · Shipments',
    parent: 'logistics',
    actions: ['view', 'create', 'edit'],
    routes: ['/purchase/logistics/shipment']
  },
  {
    key: 'grn',
    label: 'Logistics · Goods Receipt (GRN)',
    parent: 'logistics',
    actions: ['view', 'create', 'edit', 'receive', 'print'],
    routes: ['/purchase/logistics/grn']
  },
  {
    key: 'inspections',
    label: 'Logistics · Quality Inspections',
    parent: 'logistics',
    actions: ['view', 'create', 'edit'],
    routes: ['/purchase/logistics/quality']
  },
  {
    key: 'inventory',
    label: 'Logistics · Inventory',
    parent: 'logistics',
    actions: ['view', 'create', 'edit'],
    routes: ['/purchase/logistics/inventory']
  },
  {
    key: 'invoices',
    label: 'Purchase Invoice',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'match', 'pay',
      'print', 'export'],
    routes: ['/purchase/invoices', '/purchase/invoice']
  },
  {
    key: 'invoiceMatching',
    label: 'Three-Way Matching',
    parent: 'invoices',
    actions: ['view', 'match'],
    routes: ['/purchase/invoices/three-way-matching']
  },
  {
    key: 'payments',
    label: 'Payments',
    parent: 'invoices',
    actions: ['view', 'pay'],
    routes: [
      '/purchase/invoices/payment-approval',
      '/purchase/invoices/vendor-payment',
      '/purchase/invoices/payment-advice',
      '/purchase/payments'
    ]
  },
  {
    key: 'adjustmentNotes',
    label: 'Adjustment Notes',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'reject', 'print'],
    routes: ['/purchase/invoices/notes']
  },
  {
    key: 'documents',
    label: 'Documents',
    actions: ['view'],
    routes: ['/purchase/documents']
  },
  {
    key: 'reports',
    label: 'Reports',
    actions: ['view', 'export', 'print'],
    routes: ['/purchase/reports']
  },
  {
    key: 'settings',
    label: 'Purchase Settings',
    actions: ['view', 'edit'],
    routes: ['/purchase/settings']
  }
];

/** Human labels for the action switches, in the order the matrix shows them. */
export const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  submit: 'Submit',
  approve: 'Approve',
  reject: 'Reject',
  release: 'Release',
  acknowledge: 'Acknowledge',
  convert: 'Convert',
  evaluate: 'Evaluate',
  award: 'Award',
  close: 'Close',
  cancel: 'Cancel',
  complete: 'Complete',
  receive: 'Receive',
  match: 'Match',
  pay: 'Pay',
  upload: 'Upload',
  download: 'Download',
  export: 'Export',
  print: 'Print'
};

/**
 * One-line meaning of each action, shown under the toggle so an administrator
 * knows exactly what turning it off does. Only actions that exist somewhere in
 * Purchase are listed.
 */
export const ACTION_HINTS = {
  view: 'Open the page and read its records',
  create: 'Open the new-record form and save a new record',
  edit: 'Change an existing record',
  delete: 'Delete a record',
  submit: 'Submit into the approval workflow',
  approve: 'Approve, or return for correction',
  reject: 'Reject at a workflow gate',
  release: 'Release an approved order to the supplier',
  acknowledge: 'Record the supplier acknowledgement',
  convert: 'Convert a requisition into an RFQ',
  evaluate: 'Run or save a quotation evaluation',
  award: 'Award the RFQ to a vendor',
  close: 'Close the RFQ',
  cancel: 'Cancel the record',
  complete: 'Complete the follow-up',
  receive: 'Receive goods against a GRN',
  match: 'Run the three-way match',
  pay: 'Record, advise or reverse a payment',
  upload: 'Upload an attachment',
  download: 'Download a vendor document',
  export: 'Export the list or report',
  print: 'Print the document'
};

/** An empty matrix: every area, every supported action OFF (fail closed). */
export function emptyPermissions() {
  const matrix = {};
  for (const area of PURCHASE_AREAS) {
    const actions = {};
    for (const action of area.actions) actions[action] = false;
    matrix[area.key] = actions;
  }
  return matrix;
}

/** The catalog entry for an area key, or undefined. */
export function areaDefinition(areaKey) {
  return PURCHASE_AREAS.find((area) => area.key === areaKey);
}

/** True when `permissions` grants `action` on `area` (missing => false). */
export function allows(permissions, areaKey, action = 'view') {
  return Boolean(permissions?.[areaKey]?.[action]);
}

/** The area a pathname belongs to, by its longest matching route prefix. */
export function areaForPath(pathname) {
  if (!pathname) return null;
  let best = null;
  for (const area of PURCHASE_AREAS) {
    for (const route of area.routes || []) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        if (!best || route.length > best.route.length) best = { area, route };
      }
    }
  }
  return best ? best.area.key : null;
}

/** True when the user may open any Purchase page at all. */
export function canViewPurchase(permissions) {
  return PURCHASE_AREAS.some((area) => allows(permissions, area.key, 'view'));
}

export default PURCHASE_AREAS;
