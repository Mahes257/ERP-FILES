/**
 * marketing/access/catalog.js
 * ------------------------------------------------------------------
 * The Marketing access catalog — the frontend mirror of
 * com.vishatech.erp.marketing.access.MarketingAccessArea.
 *
 * It lists exactly the functional areas that exist in the Marketing module
 * and, per area, only the actions that really exist on that page. Pages that
 * have no delete never offer a delete switch; the dashboard and calendar are
 * view-only. The backend validates every saved key against the same catalog,
 * so the two cannot silently drift: an unknown area/action is rejected there.
 *
 * `routes` is what the route guard and the navigation use to decide which
 * area a URL belongs to.
 * ------------------------------------------------------------------
 */

export const MARKETING_AREAS = [
  {
    key: 'dashboard',
    label: 'Marketing Dashboard',
    actions: ['view'],
    routes: ['/marketing/dashboard']
  },
  {
    key: 'visits',
    label: 'Visits & Visit Entry',
    actions: ['view', 'create', 'edit', 'delete', 'export'],
    routes: ['/marketing/visits']
  },
  {
    key: 'followups',
    label: 'Follow-ups & Extensions',
    actions: ['view', 'create', 'edit', 'delete'],
    routes: ['/marketing/follow-ups']
  },
  {
    key: 'qforms',
    label: 'Q Forms',
    actions: ['view', 'create', 'edit', 'delete', 'print', 'upload'],
    routes: ['/marketing/q-forms']
  },
  {
    key: 'expenses',
    label: 'Marketing Expenses',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'print', 'upload'],
    routes: ['/marketing/expenses']
  },
  {
    key: 'travelScheduler',
    label: 'Travel Scheduler',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'upload'],
    routes: ['/marketing/travel-scheduler']
  },
  {
    key: 'travelRegistry',
    label: 'Travel Registry',
    actions: ['view', 'create', 'edit', 'delete', 'approve', 'upload'],
    routes: ['/marketing/travel-planners']
  },
  {
    key: 'calendar',
    label: 'Calendar',
    actions: ['view'],
    routes: ['/marketing/calendar']
  },
  {
    key: 'map',
    label: 'Location & Map',
    // upload = the location detail panel's photo upload
    // (POST /marketing/map/locations/:id/photos), which the backend checks
    // against map.upload. Without the switch a configured scope could never be
    // granted that upload.
    actions: ['view', 'create', 'edit', 'delete', 'upload'],
    routes: ['/marketing/map', '/marketing/locations']
  },
  {
    key: 'settings',
    label: 'Marketing Settings',
    actions: ['view', 'edit'],
    routes: ['/marketing/settings']
  }
];

/** Human labels for the action switches, in the order the matrix shows them. */
export const ACTION_LABELS = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  approve: 'Approve',
  export: 'Export',
  print: 'Print',
  upload: 'Upload'
};

/** The areas that make up the Offline Marketing hub (everything but Settings). */
export const HUB_AREAS = MARKETING_AREAS.filter((area) => area.key !== 'settings');

/** An empty matrix: every area, every supported action OFF (fail closed). */
export function emptyPermissions() {
  const matrix = {};
  for (const area of MARKETING_AREAS) {
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

/** True when at least one hub area is viewable. */
export function canViewHub(permissions) {
  return HUB_AREAS.some((area) => allows(permissions, area.key, 'view'));
}

export default MARKETING_AREAS;
