import { Link, useLocation } from 'react-router-dom';
import Icon from '../../icons/Icon';
import { getStoredUser } from '../../../../services/authService';
import '../../../../styles/settings-shell.css';
import './production-settings.css';

/**
 * ============================================================
 * Production Settings — shared shell (PDE Settings parity)
 * ============================================================
 *
 * The Production Settings module keeps its own ROUTES (every section is a real
 * page with its own URL, so deep links, refresh and browser back/forward all
 * keep working). What this shell adds is the PDE Settings chrome around them:
 *
 *   breadcrumb → page heading → grouped left rail + content column
 *
 * — the same structure the PDE reference renders, and the same one the ERP's
 * Sales Settings screen uses, so the two modules read as one settings
 * application.
 *
 * Only navigation lives here; each section page still owns its data, its
 * controls and its persistence.
 *
 * The rail uses the SAME grouped taxonomy as Sales Settings
 * (Workspace · Configuration · Documents & Output · Rules & Access ·
 * Data & Organization), so the two settings workspaces read as one application.
 *
 * A group is only rendered when it holds a real Production section. That is why
 * there is no "Documents & Output" group: Production stores no document
 * numbering or PDF defaults, so a rail entry there would be a dead link.
 * Production's real status vocabularies for Work Order / Shop Floor / Quality /
 * Packing / Dispatch live in Status Masters, where each category already has its
 * own tab and CRUD screen, and its notification preferences live on the
 * Notifications section.
 */
const NAV_GROUPS = [
  {
    key: 'workspace',
    label: 'Workspace',
    items: [
      { key: 'overview', label: 'Overview', path: '/production/settings', icon: 'settings' },
    ],
  },
  {
    key: 'masters',
    label: 'Master Data',
    items: [
      { key: 'machines', label: 'Machines', path: '/production/settings/machines', icon: 'cpu' },
      { key: 'work-centers', label: 'Work Centers', path: '/production/settings/work-centers', icon: 'grid' },
    ],
  },
  {
    key: 'configuration',
    label: 'Production Configuration',
    items: [
      { key: 'parameters', label: 'Production Parameters', path: '/production/settings/parameters', icon: 'sliders' },
      { key: 'status-masters', label: 'Status Masters', path: '/production/settings/status-masters', icon: 'flag' },
    ],
  },
  {
    key: 'rules',
    label: 'Rules & Access',
    items: [
      // Which Production workflow events raise a notification for the team. The
      // toggles are read server-side by the publisher, so they gate real
      // notifications rather than only their own saved state.
      { key: 'notifications', label: 'Notifications', path: '/production/settings/notifications', icon: 'bell' },
      // Access Management decides who may use which Production page and action.
      // It is the one ADMIN-only section: the whole management surface is
      // ROLE_ADMIN on the backend, so the rail only offers it to an admin.
      {
        key: 'access-management',
        label: 'Access Management',
        path: '/production/settings/access',
        icon: 'lock',
        adminOnly: true,
      },
    ],
  },
  {
    key: 'data',
    label: 'Data & Organization',
    items: [
      { key: 'users-roles', label: 'Users & Roles', path: '/production/settings/users-roles', icon: 'users' },
    ],
  },
];

/** The rail item whose route is the current page (longest match wins). */
function activeKey(pathname) {
  const items = NAV_GROUPS.flatMap((group) => group.items);
  let best = null;
  for (const item of items) {
    const isExact = pathname === item.path;
    const isChild = pathname.startsWith(`${item.path}/`);
    if (!isExact && !isChild) continue;
    if (!best || item.path.length > best.path.length) best = item;
  }
  return best?.key;
}

export default function ProductionSettingsShell({ children }) {
  const { pathname } = useLocation();
  const active = activeKey(pathname);
  // The rail is unchanged for everyone else: the ADMIN-only item is filtered
  // out, exactly like Marketing and Sales Settings do.
  const isAdminUser = String(getStoredUser()?.role || '').toUpperCase() === 'ADMIN';
  const navGroups = NAV_GROUPS
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.adminOnly || isAdminUser) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="page production-settings">
      <nav className="po-breadcrumb" aria-label="Breadcrumb">
        <Link to="/production" className="bc-link">Production</Link>
        <Icon name="chevron-right" size={10} />
        <span className="bc-current">Production Settings</span>
      </nav>

      <div className="po-page-header">
        <div className="min-w-0">
          <h1>
            <Icon name="settings" size={20} /> Production Settings
          </h1>
          <p className="po-page-header-subtitle">
            Configure Production master data, parameters, status vocabularies, users and access.
          </p>
        </div>
      </div>

      <div className="ss-layout">
        <nav className="ss-nav" aria-label="Settings sections">
          {navGroups.map((group) => (
            <div key={group.key} className="ss-nav-group">
              <span className="ss-nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const isActive = active === item.key;
                return (
                  <Link
                    key={item.key}
                    to={item.path}
                    className={`ss-nav-item${isActive ? ' active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon name={item.icon} size={14} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="ss-content">{children}</div>
      </div>
    </div>
  );
}
