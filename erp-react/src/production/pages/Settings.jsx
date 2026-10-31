import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import { machineService, workCenterService, settingsService } from '../services/production';
import './Settings.css';

/**
 * Production Settings → Overview.
 *
 * Presentation follows the Sales Settings overview exactly: section heading +
 * description, a Configuration Health card and the compact three-column status
 * cards. Every number on this page is derived from the data the section pages
 * actually persist — nothing is hardcoded.
 *
 * A section counts as configured when it holds at least one stored record
 * (Production Parameters: when at least one parameter override has been saved),
 * so the health percentage is a real measure of what has been set up.
 */
const SECTIONS = [
  {
    to: '/production/settings/users-roles',
    icon: 'users',
    title: 'Users & Roles',
    description: 'Production users, roles, departments and active status.',
    countKey: 'users',
  },
  {
    to: '/production/settings/machines',
    icon: 'cpu',
    title: 'Machines',
    description: 'Machine master for the Machine Shop and utilization reporting.',
    countKey: 'machines',
  },
  {
    to: '/production/settings/work-centers',
    icon: 'grid',
    title: 'Work Centers',
    description: 'Physical work centers used across the shop floor.',
    countKey: 'workCenters',
  },
  {
    to: '/production/settings/parameters',
    icon: 'sliders',
    title: 'Production Parameters',
    description: 'Default priorities, statuses, departments and feature toggles.',
    countKey: null,
  },
  {
    to: '/production/settings/status-masters',
    icon: 'flag',
    title: 'Status Masters',
    description: 'Status values for orders, shop floor, quality, packing and dispatch.',
    countKey: 'statuses',
  },
];

/** "3 records" / "No records yet" for a section that stores records. */
function countLabel(count) {
  if (count === undefined) return 'Loading…';
  if (count === 0) return 'No records yet';
  return `${count} record${count === 1 ? '' : 's'}`;
}

export default function Settings() {
  // Record counts of the persisted masters. The users register is Production
  // master data stored on the server (production.users in app_settings, USR-NNN
  // ids — see UserRoleManager), so its count comes from the same endpoint the
  // Users & Roles screen and Access Management read.
  const [counts, setCounts] = useState({
    users: undefined,
    machines: undefined,
    workCenters: undefined,
    statuses: undefined,
  });
  // Production Parameters are configured once at least one override is stored
  // on the server; the factory defaults alone are not a configuration.
  const [parametersConfigured, setParametersConfigured] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [users, machines, workCenters, statuses, parameters] = await Promise.allSettled([
        settingsService.listUsers(),
        machineService.listMachines(),
        workCenterService.listWorkCenters(),
        settingsService.listStatusMasterRecords(),
        settingsService.loadParameters(),
      ]);
      if (cancelled) return;
      // listUsers resolves to the rows themselves; the master endpoints answer
      // with the {success, message, data} envelope.
      const countOf = (result, unwrap = false) =>
        result.status === 'fulfilled'
          ? ((unwrap ? result.value : result.value.data) || []).length
          : undefined;
      setCounts((prev) => ({
        ...prev,
        users: countOf(users, true),
        machines: countOf(machines),
        workCenters: countOf(workCenters),
        statuses: countOf(statuses),
      }));
      // The parameters endpoint answers with the stored overrides only (the
      // factory defaults are never written), so any key here is real configuration.
      setParametersConfigured(
        parameters.status === 'fulfilled'
          ? Object.keys(parameters.value?.data || {}).length > 0
          : undefined,
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isConfigured = (section) => {
    if (!section.countKey) return parametersConfigured;
    const count = counts[section.countKey];
    return count === undefined ? undefined : count > 0;
  };

  const resolved = SECTIONS.map((section) => ({ ...section, configured: isConfigured(section) }));
  const known = resolved.filter((section) => section.configured !== undefined);
  const configuredCount = known.filter((section) => section.configured).length;
  const percentage = known.length ? Math.round((configuredCount / SECTIONS.length) * 100) : 0;
  const status = percentage === 100 ? 'healthy' : 'warning';

  return (
    <div className="ss-section">
      <h3 className="ss-section-title">Settings Overview</h3>
      <p className="ss-section-desc">
        Every Production configuration area, with the record count currently stored on the server.
      </p>

      {/* Configuration Health — the share of Production sections that already
          hold stored configuration. Computed above; never hardcoded. */}
      <div className={`ss-health ss-health--${status}`}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'inherit' }}>Configuration Health</div>
          <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
            {configuredCount} of {SECTIONS.length} sections configured from the saved values
          </div>
          <div className="ss-progress">
            <span style={{ width: `${percentage}%` }} />
          </div>
        </div>
        <div className="ss-health-value">{percentage}%</div>
      </div>

      <div className="ss-status-grid">
        {resolved.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className={`ss-status-card${section.configured ? '' : ' is-attention'}`}
          >
            <span className="ss-status-icon">
              <Icon name={section.icon} size={18} />
            </span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span className="ss-status-name" style={{ display: 'block' }}>{section.title}</span>
              <span className="ss-status-state" style={{ display: 'block' }}>
                {section.countKey
                  ? countLabel(counts[section.countKey])
                  : (section.configured === undefined
                    ? 'Loading…'
                    : (section.configured ? 'Configured' : 'Factory defaults only'))}
              </span>
              <span className="ss-status-desc" style={{ display: 'block' }}>{section.description}</span>
            </span>
            <Icon name="chevron-right" size={16} />
          </Link>
        ))}
      </div>

      <p className="ss-note" style={{ marginTop: 14 }}>
        Production Settings holds the master data the other modules reference — users &amp; roles, machines
        (Machine Shop / Machine Utilization), work centers (Shop Floor), parameters (Orders / Quality) and
        status masters (Orders / Shop Floor / Quality / Packing / Dispatch). Every count above is read from the
        value the corresponding section stores on the server, and Access Management decides who may use them.
      </p>
    </div>
  );
}
