/**
 * production/access/catalog.js
 * ------------------------------------------------------------------
 * The Production access catalog — the frontend mirror of
 * com.vishatech.erp.production.access.ProductionAccessArea.
 *
 * It lists exactly the functional areas that exist in the Production module and,
 * per area, only the actions that really exist on that page. Technical
 * Verification has no update endpoint, so no Edit switch; Packing and Dispatch
 * have no approval, so no Approve switch; the Dashboard and Documents are
 * view-only. The backend validates every saved key against the same catalog, so
 * the two cannot silently drift: an unknown area/action is rejected there.
 *
 * `routes` is the URL prefix the page of that area lives under — the navigation
 * hides an item when its area is not viewable.
 * ------------------------------------------------------------------
 */

export const PRODUCTION_AREAS = [
  { key: 'dashboard', label: 'Production Dashboard', actions: ['view'], routes: ['/production'] },
  {
    key: 'orders',
    label: 'Production Work Orders',
    actions: ['view', 'create', 'edit', 'delete', 'submit', 'approve', 'start', 'hold',
      'complete', 'release', 'cancel', 'upload', 'print'],
    routes: ['/production/orders']
  },
  {
    key: 'technicalVerification',
    label: 'Technical Verification',
    actions: ['view', 'create', 'delete', 'submit', 'approve', 'print'],
    routes: ['/production/technical-verification']
  },
  {
    key: 'drawings',
    label: 'Drawings',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'upload', 'download', 'print'],
    routes: ['/production/drawings']
  },
  {
    key: 'models',
    label: 'Models',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'upload', 'convert', 'print'],
    routes: ['/production/models']
  },
  {
    key: 'casting',
    label: 'Casting',
    actions: ['view', 'create', 'edit', 'delete', 'start', 'hold', 'complete', 'skip', 'print'],
    routes: ['/production/casting']
  },
  {
    key: 'fabrication',
    label: 'Fabrication',
    actions: ['view', 'create', 'edit', 'delete', 'start', 'hold', 'complete', 'print'],
    routes: ['/production/fabrication']
  },
  {
    key: 'machineShop',
    label: 'Machine Shop',
    actions: ['view', 'create', 'edit', 'delete', 'start', 'hold', 'complete', 'print'],
    routes: ['/production/machine-shop']
  },
  {
    key: 'assembly',
    label: 'Assembly',
    actions: ['view', 'create', 'edit', 'delete', 'start', 'hold', 'complete', 'print'],
    routes: ['/production/assembly']
  },
  {
    key: 'quality',
    label: 'Quality',
    actions: ['view', 'create', 'edit', 'delete', 'start', 'pass', 'fail', 'hold', 'export', 'print'],
    routes: ['/production/quality']
  },
  {
    key: 'packing',
    label: 'Packing',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    routes: ['/production/packing']
  },
  {
    key: 'dispatch',
    label: 'Dispatch',
    actions: ['view', 'create', 'edit', 'delete', 'export', 'print'],
    routes: ['/production/dispatch']
  },
  {
    key: 'acknowledgement',
    label: 'Acknowledgement',
    actions: ['view', 'create', 'delete'],
    routes: ['/production/acknowledgement']
  },
  {
    key: 'entry',
    label: 'Production Entry',
    actions: ['view', 'create', 'delete'],
    routes: ['/production/entry']
  },
  { key: 'documents', label: 'Documents', actions: ['view'], routes: ['/production/documents'] },
  { key: 'reports', label: 'Reports', actions: ['view', 'export', 'print'], routes: ['/production/reports'] },
  {
    key: 'settings',
    label: 'Production Settings',
    actions: ['view', 'create', 'edit', 'delete'],
    routes: ['/production/settings']
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
  start: 'Start',
  hold: 'Hold',
  complete: 'Complete',
  skip: 'Skip',
  pass: 'Pass',
  fail: 'Fail',
  cancel: 'Cancel',
  release: 'Release',
  convert: 'Convert',
  upload: 'Upload',
  download: 'Download',
  export: 'Export',
  print: 'Print'
};

/** An empty matrix: every area, every supported action OFF (fail closed). */
export function emptyPermissions() {
  const matrix = {};
  for (const area of PRODUCTION_AREAS) {
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

/** True when at least one Production area is viewable at all. */
export function canViewProduction(permissions) {
  return PRODUCTION_AREAS.some((area) => allows(permissions, area.key, 'view'));
}

/** The area a pathname belongs to, by its longest matching route prefix. */
export function areaForPath(pathname) {
  if (!pathname) return null;
  let best = null;
  for (const area of PRODUCTION_AREAS) {
    for (const route of area.routes || []) {
      if (pathname === route || pathname.startsWith(`${route}/`)) {
        if (!best || route.length > best.route.length) best = { area, route };
      }
    }
  }
  return best ? best.area.key : null;
}

export default PRODUCTION_AREAS;
