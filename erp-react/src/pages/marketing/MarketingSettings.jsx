/**
 * pages/marketing/MarketingSettings.jsx
 * ------------------------------------------------------------------
 * Marketing Settings — enterprise Marketing configuration centre.
 *
 * Landing page with:
 *   • Config-health summary bar (percentage + per-section status)
 *   • Section cards for navigation
 *   • Full configuration for every Marketing setting
 *
 * UI matches the PR Settings page exactly:
 *   prm-card layout, po-breadcrumb, po-page-header, sidebar nav,
 *   form constants (TH/TD/INPUT/SELECT/LABEL/CHECK), po-btn classes,
 *   toggle switch, table styling, button patterns.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronRight,
  FileText, Hash, Loader2, Plus, RefreshCw, Save,
  Settings2, ShieldCheck, Trash2,
  Bell, Zap, MapPin, PhoneCall, Receipt,
  Truck, Calendar, Navigation, Database
} from 'lucide-react';
import marketingSettingsService from '../../services/marketingSettingsService';
import marketingAccessService from '../../services/marketingAccessService';
import { MARKETING_AREAS, ACTION_LABELS } from '../../marketing/access/catalog';
import useMarketingAccess, { reloadMarketingAccess } from '../../marketing/access/useMarketingAccess';
import { useToast, useCurrentUser } from '../../components/Common';
import ConfirmDialog from '../../components/Common/ConfirmDialog';
import '../../styles/cpr-list.css';
// The shared ERP settings shell (grouped left rail, section title +
// description, cards, field grid, tables, health card, sticky bar) — the same
// stylesheet that renders Sales Settings and Production Settings, so Marketing
// Settings reads as another settings module of the same application.
import '../../styles/settings-shell.css';
// ...bound to the Marketing palette (mirrors pages/sales/sales-settings.css).
import './marketing-settings.css';
// Access Management controls (switch + permission matrix). A real stylesheet,
// not Tailwind utilities: the app's unlayered global `button { background:
// none; border: none }` reset outranks `@layer utilities` and would render the
// switches (and the Reset buttons) completely transparent.
import '../../components/Marketing/marketing-access.css';

/* ================================================================== */
/*  Shared field classes — the Sales Settings shell equivalents         */
/* ================================================================== */
// Fields, labels and table cells use the shared settings-shell classes so
// Marketing Settings renders the same controls as Sales Settings. Only sizing
// / alignment utilities are appended where a field needs them (the shell
// classes never set max-width, min-width or text-align).
const TH = '';
const TD = '';
const INPUT = 'ss-input';
const SELECT = 'ss-select';
const LABEL = 'ss-label';
const CHECK = 'w-4 h-4 accent-[#0B4A3D] cursor-pointer rounded';
// Add / remove row actions in the list editors.
const ADD_BTN = 'ss-add-btn';
const REMOVE_BTN = 'p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600';

/* ================================================================== */
/*  Toggle switch — ON/OFF switch for one permission                   */
/* ================================================================== */
/**
 * Styled by `.mk-toggle` in components/Marketing/marketing-access.css, not by
 * Tailwind `bg-*` utilities: the global unlayered `button { background: none;
 * border: none }` reset (src/production/styles/global.css) outranks Tailwind's
 * `@layer utilities`, which left the track transparent in both states and made
 * every permission look unset. See that stylesheet for the full explanation.
 */
function ToggleSwitch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ? `${label}: ${checked ? 'on' : 'off'}` : undefined}
      title={label ? `${label}: ${checked ? 'ON' : 'OFF'}` : undefined}
      disabled={disabled}
      onClick={onChange}
      className="mk-toggle"
    />
  );
}

/* ================================================================== */
/*  Settings navigation — grouped exactly like the Sales Settings rail  */
/* ================================================================== */
/* Every Marketing section keeps its key, label, icon and destination; the
   groups only organise the existing items into the shell's visual hierarchy
   (shared with Sales Settings: src/styles/settings-shell.css). */
const NAV_GROUPS = [
  {
    key: 'workspace',
    label: 'Workspace',
    items: [
      { key: 'health', label: 'Overview', icon: Zap },
      { key: 'general', label: 'General', icon: Settings2 }
    ]
  },
  {
    key: 'leads',
    label: 'Leads & Campaigns',
    items: [
      { key: 'lead', label: 'Lead Management', icon: Database },
      { key: 'campaign', label: 'Campaign Settings', icon: Hash },
      { key: 'channels', label: 'Marketing Channels', icon: Navigation },
      { key: 'templates', label: 'Template Settings', icon: FileText },
      { key: 'automation', label: 'Automation', icon: Zap }
    ]
  },
  {
    key: 'operations',
    label: 'Field Operations',
    items: [
      { key: 'visit', label: 'Visit & Appointments', icon: MapPin },
      { key: 'followup', label: 'Follow-up', icon: PhoneCall },
      { key: 'qform', label: 'Q-Form', icon: FileText },
      { key: 'calendar', label: 'Calendar', icon: Calendar },
      { key: 'location', label: 'Location & Map', icon: Navigation }
    ]
  },
  {
    key: 'finance',
    label: 'Finance & Travel',
    items: [
      { key: 'expense', label: 'Marketing Expenses', icon: Receipt },
      { key: 'expenseApproval', label: 'Expense Approval', icon: ShieldCheck },
      { key: 'travel', label: 'Travel Settings', icon: Truck }
    ]
  },
  {
    key: 'system',
    label: 'System',
    items: [
      { key: 'notifications', label: 'Notifications', icon: Bell },
      { key: 'masters', label: 'Marketing Masters', icon: Database },
      { key: 'numbering', label: 'Document Numbering', icon: Hash }
    ]
  },
  {
    key: 'access',
    // Access Management is the one ADMIN-only section: it decides who may use
    // the Marketing pages and which actions they may perform.
    label: 'Rules & Access',
    adminOnly: true,
    items: [
      { key: 'access', label: 'Access Management', icon: ShieldCheck, adminOnly: true }
    ]
  }
];

/** Flat list of every section — also the Configuration Health lookup. */
const SECTIONS = NAV_GROUPS.flatMap((group) => group.items.map((item) => ({
  ...item,
  adminOnly: item.adminOnly || group.adminOnly || false
})));

/** Section title + description, rendered by the shell above the body. */
const SECTION_META = {
  health: { title: 'Settings Overview', desc: 'A live summary of the Marketing configuration. Status is derived from the saved values.' },
  general: { title: 'General Settings', desc: 'Default marketer, visit duration, working days and the other Marketing module defaults.' },
  lead: { title: 'Lead Management', desc: 'Lead sources, stages, statuses and priorities used across Marketing.' },
  campaign: { title: 'Campaign Settings', desc: 'Campaign types, statuses, objectives and priorities, plus budget limits and naming.' },
  channels: { title: 'Marketing Channels', desc: 'The channels available throughout the Marketing module — campaigns, leads, follow-ups and reports.' },
  templates: { title: 'Template Settings', desc: 'Email, message, campaign, follow-up and notification templates used by Marketing.' },
  automation: { title: 'Automation', desc: 'Which Marketing workflows run automatically, and how leads are assigned and scored.' },
  visit: { title: 'Visit & Appointments', desc: 'Appointment and visit statuses, outcomes, priorities and daily visit limits.' },
  followup: { title: 'Follow-up', desc: 'Follow-up types, statuses, reminder and escalation timings, and per-lead limits.' },
  qform: { title: 'Q-Form', desc: 'Question categories, answer types and the rules a Q-Form follows.' },
  calendar: { title: 'Calendar', desc: 'Working hours, slot durations and the working days shown in the Marketing calendar.' },
  location: { title: 'Location & Map', desc: 'Location accuracy, map defaults, GPS requirements and location categories.' },
  expense: { title: 'Marketing Expenses', desc: 'Expense categories, travel/food/stay types, payment methods and expense limits.' },
  expenseApproval: { title: 'Expense Approval', desc: 'Approval thresholds and the rules that decide when a Marketing expense needs approval.' },
  travel: { title: 'Travel Settings', desc: 'Default travel mode, trip duration, booking lead time, trip limits and travel approvals.' },
  notifications: { title: 'Notification Preferences', desc: 'Which Marketing events raise a notification for the team.' },
  masters: { title: 'Marketing Masters', desc: 'Marketers, visit types, location categories and the other shared Marketing master data.' },
  numbering: { title: 'Document Numbering', desc: 'Prefixes, financial year and sequence length for each Marketing document type. Existing documents and counters are never renumbered.' },
  access: { title: 'Access Management', desc: 'Decide which Marketing pages and actions each role or user may use.' }
};

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function MarketingSettings() {
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin } = useCurrentUser();
  // Saving the Marketing configuration is the Settings area's Edit action.
  // Access Management (below) stays ADMIN-only — it is a separate capability.
  const { can: canMarketingAction } = useMarketingAccess();
  const canEditSettings = isAdmin && canMarketingAction('settings', 'edit');
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState('health');
  const [health, setHealth] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  /* ===== Access Management state (ADMIN only) ===== */
  const [accessOptions, setAccessOptions] = useState(null);
  const [accessScope, setAccessScope] = useState({ type: 'ROLE', key: '' });
  const [accessScopeData, setAccessScopeData] = useState(null);
  const [accessDraft, setAccessDraft] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [confirmAccessReset, setConfirmAccessReset] = useState(false);
  // Unsaved-changes guards: leaving the section or switching scope discards a
  // draft only after an explicit confirmation. There is no autosave, so this is
  // the one place a permission edit can be lost.
  const [pendingSection, setPendingSection] = useState(null);
  const [pendingScope, setPendingScope] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // The rail is grouped like Sales Settings. Admin-only groups/items (Access
  // Management) are omitted for everyone else; every other section is always
  // present with its existing key, label and destination.
  const navGroups = useMemo(() => NAV_GROUPS
    .filter((group) => !group.adminOnly || isAdmin)
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.adminOnly || isAdmin) }))
    .filter((group) => group.items.length > 0), [isAdmin]);

  /** Section title + description shown above the body, exactly as in Sales Settings. */
  const meta = SECTION_META[section] || SECTION_META.health;

  const accessDirty = Boolean(
    accessDraft && accessScopeData
    && JSON.stringify(accessDraft) !== JSON.stringify(accessScopeData.permissions || {})
  );

  // Refresh the Access Management summary (used by the selectors and by
  // Configuration Health). Admin-only; a failure just leaves the last state.
  const refreshAccessOptions = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const options = await marketingAccessService.getOptions();
      setAccessOptions(options);
      setAccessScope((prev) => {
        const roles = options?.roles || [];
        const users = options?.users || [];
        if (prev.type === 'ROLE' && roles.includes(prev.key)) return prev;
        if (prev.type === 'USER' && users.some((u) => String(u.id) === String(prev.key))) return prev;
        return { type: 'ROLE', key: roles.includes('USER') ? 'USER' : (roles[0] || '') };
      });
      setHealth(marketingSettingsService.getConfigHealth({
        configured: (options?.configuredScopes || []).length > 0
      }));
    } catch {
      // Access Management requires ADMIN; a non-admin or a transient failure
      // simply leaves the last known state and never grants anything.
    }
  }, [isAdmin]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await marketingSettingsService.getSettings();
      const h = marketingSettingsService.getConfigHealth(isAdmin ? { configured: false } : undefined);
      setSettings(data);
      setHealth(h);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    refreshAccessOptions();
  }, [isAdmin, refreshAccessOptions]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  /* ===== Load one scope's permissions ===== */
  const loadAccessScope = useCallback(async (scope) => {
    if (!isAdmin || !scope?.key) {
      setAccessScopeData(null);
      setAccessDraft(null);
      return;
    }
    setAccessLoading(true);
    setAccessError(null);
    try {
      const data = await marketingAccessService.getScope(scope.type, scope.key);
      setAccessScopeData(data);
      setAccessDraft(data?.permissions || null);
    } catch (err) {
      setAccessScopeData(null);
      setAccessDraft(null);
      setAccessError(err);
    } finally {
      setAccessLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    // Deferred a microtask (same pattern as the settings load above) so the
    // scope fetch never runs as a synchronous state write inside the effect.
    if (section === 'access') queueMicrotask(() => loadAccessScope(accessScope));
  }, [section, accessScope, loadAccessScope]);

  // Warn before the browser closes/navigates away with unsaved permissions.
  useEffect(() => {
    if (!accessDirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [accessDirty]);

  const changeSection = (key) => {
    if (section === 'access' && accessDirty && key !== 'access') {
      setPendingSection(key);
      setConfirmDiscard(true);
      return;
    }
    setSection(key);
  };

  const changeScope = (type, key) => {
    const next = { type, key };
    if (accessDirty) {
      setPendingScope(next);
      setConfirmDiscard(true);
      return;
    }
    setAccessScope(next);
  };

  const discardAccessDraft = () => {
    setAccessDraft(accessScopeData?.permissions || null);
    setConfirmDiscard(false);
    if (pendingSection) {
      setSection(pendingSection);
      setPendingSection(null);
    }
    if (pendingScope) {
      setAccessScope(pendingScope);
      setPendingScope(null);
    }
  };

  const toggleAccess = (areaKey, actionKey) => {
    setAccessDraft((prev) => (prev ? {
      ...prev,
      [areaKey]: { ...(prev[areaKey] || {}), [actionKey]: !prev?.[areaKey]?.[actionKey] }
    } : prev));
  };

  const saveAccess = async () => {
    if (!accessScope.key || !accessDraft) return;
    setAccessSaving(true);
    try {
      const saved = await marketingAccessService.saveScope(accessScope.type, accessScope.key, accessDraft);
      setAccessScopeData(saved);
      setAccessDraft(saved?.permissions || accessDraft);
      toast.success('Marketing access saved');
      await refreshAccessOptions();
      // The administrator's own view is refreshed immediately so a change to
      // their own scope is reflected without a reload (the backend is already
      // enforcing it).
      reloadMarketingAccess();
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 403
        ? 'Only an Administrator can change Marketing access.'
        : err?.message || 'Failed to save Marketing access');
    } finally {
      setAccessSaving(false);
    }
  };

  const resetAccess = async () => {
    if (!accessScope.key) return;
    setAccessSaving(true);
    try {
      const reset = await marketingAccessService.resetScope(accessScope.type, accessScope.key);
      setAccessScopeData(reset);
      setAccessDraft(reset?.permissions || null);
      toast.success('Access reset — this scope now inherits its role defaults');
      await refreshAccessOptions();
      reloadMarketingAccess();
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 403
        ? 'Only an Administrator can change Marketing access.'
        : err?.message || 'Failed to reset Marketing access');
    } finally {
      setAccessSaving(false);
      setConfirmAccessReset(false);
    }
  };

  /* ===== Validation — same pattern as Sales Settings (task §8) =====
   * Prevents empty/duplicate list entries and invalid numeric ranges
   * before anything reaches the API. Returns an error message or null. */
  const validateSettings = (s) => {
    if (!s || typeof s !== 'object') return 'Settings payload is invalid.';
    const dupCheck = (list, label) => {
      const names = (list || []).map((x) => String(x?.name || x || '').trim().toLowerCase()).filter(Boolean);
      if (names.length !== new Set(names).size) return `Duplicate values are not allowed in ${label}.`;
      return null;
    };
    const checks = [
      dupCheck(s.leadSettings?.leadSources, 'Lead Sources'),
      dupCheck(s.leadSettings?.leadStages, 'Lead Stages'),
      dupCheck(s.leadSettings?.leadStatuses, 'Lead Statuses'),
      dupCheck(s.leadSettings?.leadPriorities, 'Lead Priorities'),
      dupCheck(s.campaignSettings?.campaignTypes, 'Campaign Types'),
      dupCheck(s.campaignSettings?.campaignStatuses, 'Campaign Statuses'),
      dupCheck(s.campaignSettings?.campaignObjectives, 'Campaign Objectives'),
      dupCheck(s.campaignSettings?.campaignPriorities, 'Campaign Priorities'),
      dupCheck(s.marketingChannels, 'Marketing Channels'),
      dupCheck(s.followupSettings?.followupTypes, 'Follow-up Types'),
      dupCheck(s.followupSettings?.followupStatuses, 'Follow-up Statuses'),
      dupCheck(s.followupSettings?.followupPriorities, 'Follow-up Priorities'),
      s.expenseSettings?.maxSingleExpense < 0 ? 'Max Single Expense cannot be negative.' : null,
      s.campaignSettings?.budget?.maxBudgetPerCampaign < 0 ? 'Max Budget Per Campaign cannot be negative.' : null,
      s.campaignSettings?.naming?.prefix && !/^[A-Za-z0-9-]{1,10}$/.test(s.campaignSettings.naming.prefix)
        ? 'Campaign prefix must be 1-10 letters, digits or dashes.' : null
    ];
    return checks.find(Boolean) || null;
  };

  const save = async () => {
    if (!settings) return;
    const validationError = validateSettings(settings);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSaving(true);
    try {
      const updated = await marketingSettingsService.updateSettings(settings);
      setSettings(updated);
      setHealth(marketingSettingsService.getConfigHealth(isAdmin ? { configured: Boolean(accessOptions?.configuredScopes?.length) } : undefined));
      toast.success('Settings saved');
      // Access Management is a separate resource, but "Save Settings" must not
      // silently leave pending permission changes unsaved either.
      if (accessDirty) await saveAccess();
    } catch (err) {
      // 403 = non-admin tried to write (backend enforces ADMIN-only) —
      // surface an honest message instead of a generic failure.
      const status = err?.response?.status;
      const msg = status === 403
        ? 'Only an Administrator can change Marketing Settings.'
        : err?.message || 'Failed to save settings';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const update = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const updateNested = useCallback((sectionKey, field, value) => {
    setSettings((prev) => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], [field]: value }
    }));
  }, []);

  /* ================================================================ */
  /*  OVERVIEW / HEALTH                                                */
  /* ================================================================ */
  const renderHealth = () => {
    if (!health) return null;
    // Same health card + status-card grid as Sales Settings. The values stay
    // derived from the saved configuration (getConfigHealth), never hardcoded.
    return (
      <>
        <div className={`ss-health ss-health--${health.status}`}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'inherit' }}>Configuration Health</div>
            <div style={{ fontSize: 12, marginTop: 2, opacity: 0.85 }}>
              {health.configured} of {health.total} sections configured from the saved values
            </div>
            <div className="ss-progress">
              <span style={{ width: `${health.percentage}%` }} />
            </div>
          </div>
          <div className="ss-health-value">{health.percentage}%</div>
        </div>

        <div className="ss-status-grid">
          {health.checks.map((check) => {
            const sec = SECTIONS.find((s) => s.key === check.key);
            const Icon = sec?.icon || Settings2;
            return (
              <button
                key={check.key}
                type="button"
                onClick={() => setSection(check.key)}
                className={`ss-status-card${check.configured ? '' : ' is-attention'}`}
              >
                <span className="ss-status-icon"><Icon size={18} aria-hidden="true" /></span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span className="ss-status-name" style={{ display: 'block' }}>{check.label}</span>
                  <span className="ss-status-state" style={{ display: 'block' }}>
                    {check.configured ? 'Configured' : 'Needs attention'}
                  </span>
                </span>
                <ChevronRight size={16} style={{ color: '#94A3B8', flexShrink: 0 }} aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </>
    );
  };

  /* ================================================================ */
  /*  GENERAL                                                          */
  /* ================================================================ */
  const renderGeneral = () => {
    const g = settings?.general || {};
    const setF = (field) => (e) => updateNested('general', field, e.target.value);
    // Marketer names come from the Marketers master list — the same source that
    // feeds the marketer option lists (settingsOptions: masters.marketers) — so
    // the default marketer can never drift from the configured master. A legacy
    // value that is no longer in the master stays selectable instead of being
    // silently dropped.
    const marketerOptions = [...new Set([
      ...(settings?.masters?.marketers || [])
        .filter((m) => m && m.active !== false && String(m.name || '').trim())
        .map((m) => m.name),
      ...(String(g.defaultMarketer || '').trim() ? [g.defaultMarketer] : [])
    ])];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[{ label: 'Default Marketer', field: 'defaultMarketer', type: 'select', options: marketerOptions },
            { label: 'Default Visit Duration (min)', field: 'defaultVisitDuration', type: 'number' },
            { label: 'Default Visit Status', field: 'defaultVisitStatus', type: 'select', options: ['Scheduled', 'Confirmed', 'Planned', 'In Progress'] },
            { label: 'Default Priority', field: 'defaultPriority', type: 'select', options: ['High', 'Medium', 'Low'] },
            { label: 'Default Follow-up Period (days)', field: 'defaultFollowupPeriod', type: 'number' },
            { label: 'Default Location Type', field: 'defaultLocationType', type: 'select', options: ['Office', 'Factory', 'Site', 'Client Location'] },
            { label: 'Working Days Start', field: 'workingDaysStart', type: 'select', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] },
            { label: 'Working Days End', field: 'workingDaysEnd', type: 'select', options: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] }
          ].map((f) => (
            <label key={f.field} className="block">
              <span className={LABEL}>{f.label}</span>
              {f.type === 'select' ? (
                <select value={g[f.field] || ''} onChange={setF(f.field)} className={SELECT}>
                  <option value="">Select...</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.type === 'number' ? (
                <input type="number" value={g[f.field] || ''} onChange={setF(f.field)} className={INPUT} />
              ) : (
                <input type="text" value={g[f.field] || ''} onChange={setF(f.field)} className={INPUT} placeholder={f.placeholder} />
              )}
            </label>
          ))}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  VISIT & APPOINTMENTS                                              */
  /* ================================================================ */
  const renderVisit = () => {
    const v = settings?.visitSettings || {};
    const lists = [
      { key: 'appointmentStatuses', label: 'Appointment Statuses' },
      { key: 'visitStatuses', label: 'Visit Statuses' },
      { key: 'priorities', label: 'Priorities' },
      { key: 'outcomes', label: 'Visit Outcomes' }
    ];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[{ label: 'Default Visit Type', field: 'defaultVisitType', type: 'select', options: ['Meeting', 'Presentation', 'Site Visit', 'Follow-up', 'Demo'] },
            { label: 'Max Visits Per Day', field: 'maxVisitsPerDay', type: 'number' }
          ].map((f) => (
            <label key={f.field} className="block">
              <span className={LABEL}>{f.label}</span>
              {f.type === 'select' ? (
                <select value={v[f.field] || ''} onChange={(e) => updateNested('visitSettings', f.field, e.target.value)} className={SELECT}>
                  <option value="">Select...</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type="number" value={v[f.field] || ''} onChange={(e) => updateNested('visitSettings', f.field, Number(e.target.value) || 0)} className={INPUT} />
              )}
            </label>
          ))}
          {[
            ['requireCheckIn', 'Require Check-in'],
            ['requireCheckOut', 'Require Check-out'],
            ['allowReschedule', 'Allow Reschedule']
          ].map(([field, label]) => (
            <div key={field} className="ss-row">
              <span className="ss-row-label">{label}</span>
              <ToggleSwitch checked={v[field] || false} onChange={() => updateNested('visitSettings', field, !v[field])} />
            </div>
          ))}
        </div>
        {lists.map(({ key, label }) => {
          const items = v[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[400px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, name: e.target.value }; update({ visitSettings: { ...v, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ visitSettings: { ...v, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ visitSettings: { ...v, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ visitSettings: { ...v, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ================================================================ */
  /*  FOLLOW-UP                                                         */
  /* ================================================================ */
  const renderFollowup = () => {
    const f = settings?.followupSettings || {};
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[{ label: 'Default Follow-up Days', field: 'defaultFollowupDays' },
            { label: 'Reminder Before Due (days)', field: 'reminderBeforeDue' },
            { label: 'Escalation Days', field: 'escalationDays' },
            { label: 'Max Follow-ups Per Lead', field: 'maxFollowupsPerLead' }
          ].map((f2) => (
            <label key={f2.field} className="block">
              <span className={LABEL}>{f2.label}</span>
              <input type="number" value={f[f2.field] || ''} onChange={(e) => updateNested('followupSettings', f2.field, Number(e.target.value) || 0)} className={INPUT} />
            </label>
          ))}
          <div className="ss-row">
            <span className="ss-row-label">Auto-Escalate</span>
            <ToggleSwitch checked={f.autoEscalate || false} onChange={() => updateNested('followupSettings', 'autoEscalate', !f.autoEscalate)} />
          </div>
        </div>
        <h4 className="ss-subheading">Reminder & Escalation Settings</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Reminder Enabled</span>
            <ToggleSwitch checked={f.reminder?.enabled !== false} onChange={() => updateNested('followupSettings', 'reminder.enabled', !(f.reminder?.enabled !== false))} /></label>
          <label className="block"><span className={LABEL}>Default Reminder (days before due)</span>
            <input type="number" value={f.reminder?.defaultReminderDays ?? 1} onChange={(e) => updateNested('followupSettings', 'reminder.defaultReminderDays', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Default Follow-up Duration (minutes)</span>
            <input type="number" value={f.defaultDurationMinutes ?? 30} onChange={(e) => updateNested('followupSettings', 'defaultDurationMinutes', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Escalation Enabled</span>
            <ToggleSwitch checked={f.escalation?.enabled || false} onChange={() => updateNested('followupSettings', 'escalation.enabled', !(f.escalation?.enabled || false))} /></label>
          <label className="block"><span className={LABEL}>Escalate After (days)</span>
            <input type="number" value={f.escalation?.escalateAfterDays ?? 3} onChange={(e) => updateNested('followupSettings', 'escalation.escalateAfterDays', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Max Escalations</span>
            <input type="number" value={f.escalation?.maxEscalations ?? 3} onChange={(e) => updateNested('followupSettings', 'escalation.maxEscalations', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Escalate To Role</span>
            <input type="text" value={f.escalation?.escalateToRole || ''} onChange={(e) => updateNested('followupSettings', 'escalation.escalateToRole', e.target.value)} className={INPUT} placeholder="e.g. Marketing Manager" /></label>
        </div>
        {[
          { key: 'followupTypes', label: 'Follow-up Types' },
          { key: 'followupStatuses', label: 'Follow-up Statuses' },
          { key: 'followupPriorities', label: 'Follow-up Priorities' }
        ].map(({ key, label }) => {
          const items = f[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[400px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, name: e.target.value }; update({ followupSettings: { ...f, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ followupSettings: { ...f, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ followupSettings: { ...f, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ followupSettings: { ...f, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
        <h4 className="ss-subheading">Follow-up Intervals (recurring)</h4>
        <div className="overflow-x-auto">
          <table className="ss-table min-w-[400px]">
            <thead>
              <tr><th className={TH}>Label</th><th className={`${TH} text-right`}>Days</th><th className={`${TH} text-center`}>Actions</th></tr>
            </thead>
            <tbody>
              {(f.intervals || []).map((row, i) => (
                <tr key={i}>
                  <td className={TD}><input value={row.label || ''} onChange={(e) => { const next = [...(f.intervals || [])]; next[i] = { ...row, label: e.target.value }; update({ followupSettings: { ...f, intervals: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                  <td className={`${TD} text-right`}><input type="number" min="1" value={row.days || 1} onChange={(e) => { const next = [...(f.intervals || [])]; next[i] = { ...row, days: Number(e.target.value) || 1 }; update({ followupSettings: { ...f, intervals: next } }); }} className={`${INPUT} max-w-[100px] text-right`} /></td>
                  <td className={`${TD} text-center`}><button type="button" onClick={() => update({ followupSettings: { ...f, intervals: (f.intervals || []).filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update({ followupSettings: { ...f, intervals: [...(f.intervals || []), { label: 'New Interval', days: 7 }] } })} className={ADD_BTN}><Plus className="w-3.5 h-3.5" /> Add Interval</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  MARKETING EXPENSES                                               */
  /* ================================================================ */
  const renderExpense = () => {
    const e = settings?.expenseSettings || {};
    const lists = [
      { key: 'expenseCategories', label: 'Expense Categories' },
      { key: 'travelTypes', label: 'Travel Types' },
      { key: 'foodTypes', label: 'Food Types' },
      { key: 'stayTypes', label: 'Stay Types' },
      { key: 'otherExpenseTypes', label: 'Other Expense Types' },
      { key: 'paymentMethods', label: 'Payment Methods' },
      { key: 'billStatuses', label: 'Bill Statuses' }
    ];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Max Single Expense</span><input type="number" value={e.maxSingleExpense || ''} onChange={(ev) => updateNested('expenseSettings', 'maxSingleExpense', Number(ev.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Require Bill Above</span><input type="number" value={e.requireBillAbove || ''} onChange={(ev) => updateNested('expenseSettings', 'requireBillAbove', Number(ev.target.value) || 0)} className={INPUT} /></label>
        </div>
        {lists.map(({ key, label }) => {
          const items = e[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[400px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(ev) => { const next = [...items]; next[i] = { ...row, name: ev.target.value }; update({ expenseSettings: { ...e, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ expenseSettings: { ...e, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ expenseSettings: { ...e, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ expenseSettings: { ...e, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ================================================================ */
  /*  EXPENSE APPROVAL                                                  */
  /* ================================================================ */
  const renderExpenseApproval = () => {
    const ea = settings?.expenseApproval || {};
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {[
            ['approvalRequired', 'Approval Required'],
            ['enableAutoApproval', 'Enable Auto-Approval']
          ].map(([field, label]) => (
            <div key={field} className="ss-row">
              <span className="ss-row-label">{label}</span>
              <ToggleSwitch checked={ea[field] || false} onChange={() => updateNested('expenseApproval', field, !ea[field])} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[{ label: 'Approval Threshold', field: 'approvalThreshold' },
            { label: 'Auto-Approval Below', field: 'autoApprovalBelow' },
            { label: 'Bill Requirement Threshold', field: 'billRequirementThreshold' }
          ].map((f) => (
            <label key={f.field} className="block">
              <span className={LABEL}>{f.label}</span>
              <input type="number" value={ea[f.field] || ''} onChange={(e) => updateNested('expenseApproval', f.field, Number(e.target.value) || 0)} className={INPUT} />
            </label>
          ))}
        </div>
        <h4 className="ss-subheading">Approval Levels</h4>
        <div className="overflow-x-auto">
          <table className="ss-table min-w-[600px]">
            <thead>
              <tr><th className={TH}>Level</th><th className={TH}>Role</th><th className={`${TH} text-right`}>Max Amount</th><th className={`${TH} text-center`}>Days</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
            </thead>
            <tbody>
              {(ea.approvalLevels || []).map((row, index) => (
                <tr key={index}>
                  <td className={`${TD} font-bold text-slate-800`}>Level {index + 1}</td>
                  <td className={TD}><input type="text" value={row.role || ''} onChange={(e) => { const next = [...(ea.approvalLevels || [])]; next[index] = { ...row, role: e.target.value }; update({ expenseApproval: { ...ea, approvalLevels: next } }); }} className={`${INPUT} max-w-[180px]`} /></td>
                  <td className={`${TD} text-right`}><input type="number" value={row.maxAmount || 0} onChange={(e) => { const next = [...(ea.approvalLevels || [])]; next[index] = { ...row, maxAmount: Number(e.target.value) || 0 }; update({ expenseApproval: { ...ea, approvalLevels: next } }); }} className={`${INPUT} max-w-[120px] text-right`} /></td>
                  <td className={`${TD} text-center`}><input type="number" value={row.days || 2} onChange={(e) => { const next = [...(ea.approvalLevels || [])]; next[index] = { ...row, days: Number(e.target.value) || 0 }; update({ expenseApproval: { ...ea, approvalLevels: next } }); }} className={`${INPUT} max-w-[70px] text-center mx-auto`} /></td>
                  <td className={`${TD} text-center`}><input type="checkbox" checked={row.enabled !== false} onChange={() => { const next = [...(ea.approvalLevels || [])]; next[index] = { ...row, enabled: !row.enabled }; update({ expenseApproval: { ...ea, approvalLevels: next } }); }} className={CHECK} /></td>
                  <td className={`${TD} text-center`}><button type="button" onClick={() => { const next = (ea.approvalLevels || []).filter((_, i) => i !== index); update({ expenseApproval: { ...ea, approvalLevels: next } }); }} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => { const levels = [...(ea.approvalLevels || []), { level: (ea.approvalLevels || []).length + 1, role: '', maxAmount: 0, days: 2, enabled: true }]; update({ expenseApproval: { ...ea, approvalLevels: levels } }); }} className={ADD_BTN}><Plus className="w-3.5 h-3.5" /> Add Level</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  TRAVEL SETTINGS                                                   */
  /* ================================================================ */
  const renderTravel = () => {
    const t = settings?.travelSettings || {};
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block"><span className={LABEL}>Default Travel Mode</span><select value={t.defaultTravelMode || ''} onChange={(e) => updateNested('travelSettings', 'defaultTravelMode', e.target.value)} className={SELECT}><option value="">Select...</option><option>Bus</option><option>Taxi / Cab</option><option>Train</option><option>Flight</option></select></label>
        <label className="block"><span className={LABEL}>Default Trip Duration (days)</span><input type="number" value={t.defaultTripDuration || ''} onChange={(e) => updateNested('travelSettings', 'defaultTripDuration', Number(e.target.value) || 0)} className={INPUT} /></label>
        <label className="block"><span className={LABEL}>Max Stops Per Trip</span><input type="number" value={t.maxStopsPerTrip || ''} onChange={(e) => updateNested('travelSettings', 'maxStopsPerTrip', Number(e.target.value) || 0)} className={INPUT} /></label>
        <label className="block"><span className={LABEL}>Advance Booking Days</span><input type="number" value={t.advanceBookingDays || ''} onChange={(e) => updateNested('travelSettings', 'advanceBookingDays', Number(e.target.value) || 0)} className={INPUT} /></label>
        <label className="block"><span className={LABEL}>Expense Limit Per Day</span><input type="number" value={t.expenseLimitPerDay || ''} onChange={(e) => updateNested('travelSettings', 'expenseLimitPerDay', Number(e.target.value) || 0)} className={INPUT} /></label>
        {[
          ['tripApprovalRequired', 'Trip Approval Required'],
          ['checkInRequired', 'Check-in Required'],
          ['checkOutRequired', 'Check-out Required'],
          ['allowStopReordering', 'Allow Stop Reordering'],
          ['requireDailyReport', 'Require Daily Report']
        ].map(([field, label]) => (
          <div key={field} className="ss-row">
            <span className="ss-row-label">{label}</span>
            <ToggleSwitch checked={t[field] || false} onChange={() => updateNested('travelSettings', field, !t[field])} />
          </div>
        ))}
      </div>
    );
  };

  /* ================================================================ */
  /*  Q-FORM                                                            */
  /* ================================================================ */
  const renderQForm = () => {
    const q = settings?.qFormSettings || {};
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Max Questions Per Form</span><input type="number" value={q.maxQuestionsPerForm || ''} onChange={(e) => updateNested('qFormSettings', 'maxQuestionsPerForm', Number(e.target.value) || 0)} className={INPUT} /></label>
          {[
            ['mandatoryQuestions', 'Mandatory Questions'],
            ['allowFollowUp', 'Allow Follow-up'],
            ['autoAssignMarketer', 'Auto-Assign Marketer']
          ].map(([field, label]) => (
            <div key={field} className="ss-row">
              <span className="ss-row-label">{label}</span>
              <ToggleSwitch checked={q[field] || false} onChange={() => updateNested('qFormSettings', field, !q[field])} />
            </div>
          ))}
        </div>
        {[
          { key: 'questionCategories', label: 'Question Categories' },
          { key: 'answerTypes', label: 'Answer Types' }
        ].map(({ key, label }) => {
          const items = q[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[400px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(ev) => { const next = [...items]; next[i] = { ...row, name: ev.target.value }; update({ qFormSettings: { ...q, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ qFormSettings: { ...q, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ qFormSettings: { ...q, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ qFormSettings: { ...q, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ================================================================ */
  /*  CALENDAR                                                          */
  /* ================================================================ */
  const renderCalendar = () => {
    const c = settings?.calendarSettings || {};
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const toggleDay = (day) => {
      const working = c.workingDays || [];
      updateNested('calendarSettings', 'workingDays', working.includes(day) ? working.filter((d) => d !== day) : [...working, day]);
    };
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Working Hours Start</span><input type="time" value={c.workingHoursStart || ''} onChange={(e) => updateNested('calendarSettings', 'workingHoursStart', e.target.value)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Working Hours End</span><input type="time" value={c.workingHoursEnd || ''} onChange={(e) => updateNested('calendarSettings', 'workingHoursEnd', e.target.value)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Default Visit Duration (min)</span><input type="number" value={c.defaultVisitDurationMinutes || ''} onChange={(e) => updateNested('calendarSettings', 'defaultVisitDurationMinutes', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Buffer Between Visits (min)</span><input type="number" value={c.bufferBetweenVisitsMinutes || ''} onChange={(e) => updateNested('calendarSettings', 'bufferBetweenVisitsMinutes', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Reminder Before Visit (min)</span><input type="number" value={c.reminderBeforeVisitMinutes || ''} onChange={(e) => updateNested('calendarSettings', 'reminderBeforeVisitMinutes', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Slot Duration (min)</span><input type="number" value={c.slotDurationMinutes || ''} onChange={(e) => updateNested('calendarSettings', 'slotDurationMinutes', Number(e.target.value) || 0)} className={INPUT} /></label>
          <div className="ss-row">
            <span className="ss-row-label">Show Weekends</span>
            <ToggleSwitch checked={c.showWeekends || false} onChange={() => updateNested('calendarSettings', 'showWeekends', !c.showWeekends)} />
          </div>
        </div>
        <h4 className="ss-subheading">Working Days</h4>
        <div className="flex flex-wrap gap-2">
          {days.map((day) => (
            <button key={day} type="button" onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${(c.workingDays || []).includes(day) ? 'bg-[#E8F0EE] border-[#0B4A3D] text-[#0B4A3D]' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  LOCATION & MAP                                                    */
  /* ================================================================ */
  const renderLocation = () => {
    const l = settings?.locationSettings || {};
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Location Accuracy (m)</span><input type="number" value={l.locationAccuracyThreshold || ''} onChange={(e) => updateNested('locationSettings', 'locationAccuracyThreshold', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Default Map Zoom</span><input type="number" value={l.defaultMapZoom || ''} onChange={(e) => updateNested('locationSettings', 'defaultMapZoom', Number(e.target.value) || 0)} className={INPUT} /></label>
          {[
            ['gpsCheckInRequired', 'GPS Check-in Required'],
            ['gpsCheckOutRequired', 'GPS Check-out Required'],
            ['showDistanceOnVisit', 'Show Distance on Visit'],
            ['trackRouteHistory', 'Track Route History']
          ].map(([field, label]) => (
            <div key={field} className="ss-row">
              <span className="ss-row-label">{label}</span>
              <ToggleSwitch checked={l[field] || false} onChange={() => updateNested('locationSettings', field, !l[field])} />
            </div>
          ))}
        </div>
        <h4 className="ss-subheading">Location Categories</h4>
        <div className="overflow-x-auto">
          <table className="ss-table min-w-[400px]">
            <thead>
              <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
            </thead>
            <tbody>
              {(l.locationCategories || []).map((row, i) => (
                <tr key={i}>
                  <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...(l.locationCategories || [])]; next[i] = { ...row, name: e.target.value }; update({ locationSettings: { ...l, locationCategories: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                  <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...(l.locationCategories || [])]; next[i] = { ...row, active: !row.active }; update({ locationSettings: { ...l, locationCategories: next } }); }} className={CHECK} /></td>
                  <td className={`${TD} text-center`}><button type="button" onClick={() => update({ locationSettings: { ...l, locationCategories: (l.locationCategories || []).filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update({ locationSettings: { ...l, locationCategories: [...(l.locationCategories || []), { name: 'New Category', active: true }] } })} className={ADD_BTN}><Plus className="w-3.5 h-3.5" /> Add Category</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  NOTIFICATIONS                                                     */
  /* ================================================================ */
  const renderNotifications = () => {
    const n = settings?.notifications || {};
    const toggles = [
      ['visitReminder', 'Visit Reminder'],
      ['followupDue', 'Follow-up Due'],
      ['followupOverdue', 'Follow-up Overdue'],
      ['travelPlanPendingApproval', 'Travel Registry Pending Approval'],
      ['travelPlanApproved', 'Travel Registry Approved'],
      ['expensePendingApproval', 'Expense Pending Approval'],
      ['expenseApproved', 'Expense Approved'],
      ['expenseRejected', 'Expense Rejected'],
      ['qFormPending', 'Q-Form Pending'],
      ['emailNotifications', 'Email Notifications'],
      ['browserNotifications', 'Browser Notifications']
    ];
    return (
      <div className="space-y-3">
        {toggles.map(([field, label]) => (
          <div key={field} className="ss-row">
            <span className="ss-row-label">{label}</span>
            <ToggleSwitch checked={n[field] || false} onChange={() => updateNested('notifications', field, !n[field])} />
          </div>
        ))}
      </div>
    );
  };

  /* ================================================================ */
  /*  MARKETING MASTERS                                                 */
  /* ================================================================ */
  const renderMasters = () => {
    const m = settings?.masters || {};
    const masters = [
      { key: 'marketers', label: 'Marketers' },
      { key: 'visitTypes', label: 'Visit Types' },
      { key: 'locationCategories', label: 'Location Categories' }
    ];
    return (
      <div className="space-y-5">
        {masters.map(({ key, label }) => {
          const items = m[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[400px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, name: e.target.value }; update({ masters: { ...m, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ masters: { ...m, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ masters: { ...m, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ masters: { ...m, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ================================================================ */
  /*  DOCUMENT NUMBERING (FY-aware, matches Purchase pattern)            */
  /* ================================================================ */
  const renderNumbering = () => {
    const numbering = settings?.documentNumbering || {};
    const docTypes = [
      { key: 'Lead', label: 'Lead' },
      { key: 'Visit', label: 'Visit' },
      { key: 'FollowUp', label: 'Follow-up' },
      { key: 'Expense', label: 'Marketing Expense' },
      { key: 'TravelPlan', label: 'Travel Registry' },
      { key: 'QForm', label: 'Q-Form' }
    ];
    const fy = String(new Date().getFullYear());
    return (
      <div className="space-y-3">
        <div className="overflow-x-auto">
          <table className="ss-table min-w-[700px]">
            <thead>
              <tr><th className={TH}>Document Type</th><th className={TH}>Prefix</th><th className={TH}>FY</th><th className={`${TH} text-right`}>Start No</th><th className={`${TH} text-right`}>Current</th><th className={`${TH} text-center`}>Padding</th><th className={TH}>Next Preview</th><th className={`${TH} text-center`}>Actions</th></tr>
            </thead>
            <tbody>
              {docTypes.map(({ key, label }) => {
                const cfg = numbering[key] || { prefix: key.substring(0, 3).toUpperCase(), fy, startNo: 1, currentNo: 0, padding: 4 };
                const cfgFY = cfg.fy || fy;
                const preview = `${cfg.prefix}-${cfgFY}-${String((cfg.currentNo || 0) + 1).padStart(cfg.padding || 4, '0')}`;
                const updateCfg = (patch) => update({ documentNumbering: { ...numbering, [key]: { ...cfg, ...patch } } });
                return (
                  <tr key={key}>
                    <td className={`${TD} font-bold text-slate-800`}>{label}</td>
                    <td className={TD}><input value={cfg.prefix || ''} onChange={(e) => updateCfg({ prefix: e.target.value })} className={`${INPUT} max-w-[80px]`} /></td>
                    <td className={TD}><input value={cfgFY} onChange={(e) => updateCfg({ fy: e.target.value })} className={`${INPUT} max-w-[80px]`} /></td>
                    <td className={`${TD} text-right`}><input type="number" value={cfg.startNo || 1} onChange={(e) => updateCfg({ startNo: Number(e.target.value) || 1 })} className={`${INPUT} max-w-[80px] text-right`} /></td>
                    <td className={`${TD} text-right font-semibold text-slate-700`}>{cfg.currentNo || 0}</td>
                    <td className={`${TD} text-center`}><input type="number" value={cfg.padding || 4} onChange={(e) => updateCfg({ padding: Number(e.target.value) || 4 })} className={`${INPUT} max-w-[60px] text-center mx-auto`} /></td>
                    <td className={`${TD} font-mono text-xs font-bold text-[#0B4A3D]`}>{preview}</td>
                    <td className={`${TD} text-center`}><button type="button" onClick={() => updateCfg({ currentNo: 0 })} className="text-[10px] font-bold text-rose-500 hover:text-rose-700 underline cursor-pointer">Reset</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  LEAD MANAGEMENT                                                    */
  /* ================================================================ */
  const renderLead = () => {
    const l = settings?.leadSettings || {};
    const subLists = [
      { key: 'leadSources', label: 'Lead Sources' },
      { key: 'leadStages', label: 'Lead Stages' },
      { key: 'leadStatuses', label: 'Lead Statuses' },
      { key: 'leadPriorities', label: 'Lead Priorities' }
    ];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Default Lead Source', field: 'defaultLeadSource', type: 'select', options: l.leadSources || [] },
            { label: 'Default Lead Status', field: 'defaultLeadStatus', type: 'select', options: l.leadStatuses || [] },
            { label: 'Default Lead Priority', field: 'defaultLeadPriority', type: 'select', options: l.leadPriorities || [] },
            { label: 'Default Lead Stage', field: 'defaultLeadStage', type: 'select', options: l.leadStages || [] }
          ].map((f) => (
            <label key={f.field} className="block">
              <span className={LABEL}>{f.label}</span>
              {f.type === 'select' ? (
                <select value={l[f.field] || ''} onChange={(e) => updateNested('leadSettings', f.field, e.target.value)} className={SELECT}>
                  <option value="">Select...</option>
                  {(f.options || []).map((o) => <option key={o?.name || o} value={o?.name || o}>{o?.name || o}</option>)}
                </select>
              ) : (
                <input type="text" value={l[f.field] || ''} onChange={(e) => updateNested('leadSettings', f.field, e.target.value)} className={INPUT} />
              )}
            </label>
          ))}
        </div>
        {subLists.map(({ key, label }) => {
          const items = l[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[500px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, name: e.target.value }; update({ leadSettings: { ...l, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ leadSettings: { ...l, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ leadSettings: { ...l, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ leadSettings: { ...l, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
        <h4 className="ss-subheading">Lead Scoring Rules</h4>
        <div className="overflow-x-auto">
          <table className="ss-table min-w-[620px]">
            <thead>
              <tr><th className={TH}>Field</th><th className={TH}>Condition</th><th className={`${TH} text-right`}>Threshold</th><th className={`${TH} text-right`}>Weight</th><th className={`${TH} text-center`}>Actions</th></tr>
            </thead>
            <tbody>
              {(l.scoringRules || []).map((row, i) => (
                <tr key={i}>
                  <td className={TD}><input value={row.field || ''} onChange={(e) => { const next = [...(l.scoringRules || [])]; next[i] = { ...row, field: e.target.value }; update({ leadSettings: { ...l, scoringRules: next } }); }} className={`${INPUT} max-w-[180px]`} /></td>
                  <td className={TD}>
                    <select value={row.condition || 'greater_than'} onChange={(e) => { const next = [...(l.scoringRules || [])]; next[i] = { ...row, condition: e.target.value }; update({ leadSettings: { ...l, scoringRules: next } }); }} className={`${SELECT} max-w-[150px]`}>
                      <option value="greater_than">Greater than</option>
                      <option value="less_than">Less than</option>
                      <option value="is">Is</option>
                      <option value="is_not">Is not</option>
                      <option value="contains">Contains</option>
                    </select>
                  </td>
                  <td className={`${TD} text-right`}><input type="number" value={row.threshold ?? 0} onChange={(e) => { const next = [...(l.scoringRules || [])]; next[i] = { ...row, threshold: Number(e.target.value) || 0 }; update({ leadSettings: { ...l, scoringRules: next } }); }} className={`${INPUT} max-w-[120px] text-right`} /></td>
                  <td className={`${TD} text-right`}><input type="number" min="0" max="100" value={row.weight ?? 0} onChange={(e) => { const next = [...(l.scoringRules || [])]; next[i] = { ...row, weight: Number(e.target.value) || 0 }; update({ leadSettings: { ...l, scoringRules: next } }); }} className={`${INPUT} max-w-[80px] text-right`} /></td>
                  <td className={`${TD} text-center`}><button type="button" onClick={() => update({ leadSettings: { ...l, scoringRules: (l.scoringRules || []).filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update({ leadSettings: { ...l, scoringRules: [...(l.scoringRules || []), { field: 'New Field', condition: 'greater_than', threshold: 0, weight: 10 }] } })} className={ADD_BTN}><Plus className="w-3.5 h-3.5" /> Add Scoring Rule</button>
        <h4 className="ss-subheading">Lead Qualification Settings</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Require Lead Score</span>
            <ToggleSwitch checked={l.qualification?.requireLeadScore || false} onChange={() => updateNested('leadSettings', 'qualification.requireLeadScore', !(l.qualification?.requireLeadScore || false))} /></label>
          <label className="block"><span className={LABEL}>Minimum Score for Qualification</span>
            <input type="number" value={l.qualification?.minimumScoreForQualification || 50} onChange={(e) => updateNested('leadSettings', 'qualification.minimumScoreForQualification', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Auto Assign on Create</span>
            <ToggleSwitch checked={l.qualification?.autoAssignOnCreate || false} onChange={() => updateNested('leadSettings', 'qualification.autoAssignOnCreate', !(l.qualification?.autoAssignOnCreate || false))} /></label>
          <label className="block"><span className={LABEL}>Require Contact Info</span>
            <ToggleSwitch checked={l.qualification?.requireContactInfo !== false} onChange={() => updateNested('leadSettings', 'qualification.requireContactInfo', !(l.qualification?.requireContactInfo !== false))} /></label>
          <label className="block sm:col-span-2"><span className={LABEL}>Require Company Name</span>
            <ToggleSwitch checked={l.qualification?.requireCompanyName !== false} onChange={() => updateNested('leadSettings', 'qualification.requireCompanyName', !(l.qualification?.requireCompanyName !== false))} /></label>
        </div>
        <h4 className="ss-subheading">Lead Assignment Rules</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Auto Assign</span>
            <ToggleSwitch checked={l.assignment?.autoAssign || false} onChange={() => updateNested('leadSettings', 'assignment.autoAssign', !(l.assignment?.autoAssign || false))} /></label>
          <label className="block"><span className={LABEL}>Assignment Method</span>
            <select value={l.assignment?.assignmentMethod || 'round_robin'} onChange={(e) => updateNested('leadSettings', 'assignment.assignmentMethod', e.target.value)} className={SELECT}>
              <option value="round_robin">Round Robin</option>
              <option value="load_balanced">Load Balanced</option>
              <option value="manual">Manual</option>
            </select></label>
          <label className="block"><span className={LABEL}>Default Assign To</span>
            <input type="text" value={l.assignment?.defaultAssignTo || ''} onChange={(e) => updateNested('leadSettings', 'assignment.defaultAssignTo', e.target.value)} className={INPUT} placeholder="Marketer name" /></label>
          <label className="block"><span className={LABEL}>Notify on Assignment</span>
            <ToggleSwitch checked={l.assignment?.notifyOnAssignment !== false} onChange={() => updateNested('leadSettings', 'assignment.notifyOnAssignment', !(l.assignment?.notifyOnAssignment !== false))} /></label>
        </div>
        <h4 className="ss-subheading">Lead Conversion Settings</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Convert To</span>
            <select value={l.conversion?.convertTo || 'Lead'} onChange={(e) => updateNested('leadSettings', 'conversion.convertTo', e.target.value)} className={SELECT}>
              <option value="Lead">Lead</option>
              <option value="Customer">Customer</option>
              <option value="Opportunity">Opportunity</option>
            </select></label>
          <label className="block"><span className={LABEL}>Status on Convert</span>
            <input type="text" value={l.conversion?.statusOnConvert || 'Active'} onChange={(e) => updateNested('leadSettings', 'conversion.statusOnConvert', e.target.value)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Create Follow-up on Convert</span>
            <ToggleSwitch checked={l.conversion?.createFollowUpOnConvert !== false} onChange={() => updateNested('leadSettings', 'conversion.createFollowUpOnConvert', !(l.conversion?.createFollowUpOnConvert !== false))} /></label>
          <label className="block"><span className={LABEL}>Follow-up Type on Convert</span>
            <input type="text" value={l.conversion?.followUpType || 'Call'} onChange={(e) => updateNested('leadSettings', 'conversion.followUpType', e.target.value)} className={INPUT} /></label>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  CAMPAIGN SETTINGS                                                  */
  /* ================================================================ */
  const renderCampaign = () => {
    const c = settings?.campaignSettings || {};
    const subLists = [
      { key: 'campaignTypes', label: 'Campaign Types' },
      { key: 'campaignStatuses', label: 'Campaign Statuses' },
      { key: 'campaignObjectives', label: 'Campaign Objectives' },
      { key: 'campaignPriorities', label: 'Campaign Priorities' }
    ];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Default Campaign Type', field: 'defaultType', type: 'select', options: c.campaignTypes || [] },
            { label: 'Default Campaign Status', field: 'defaultStatus', type: 'select', options: c.campaignStatuses || [] },
            { label: 'Default Campaign Objective', field: 'defaultObjective', type: 'select', options: c.campaignObjectives || [] },
            { label: 'Default Campaign Priority', field: 'defaultPriority', type: 'select', options: c.campaignPriorities || [] }
          ].map((f) => (
            <label key={f.field} className="block">
              <span className={LABEL}>{f.label}</span>
              {f.type === 'select' ? (
                <select value={c[f.field] || ''} onChange={(e) => updateNested('campaignSettings', f.field, e.target.value)} className={SELECT}>
                  <option value="">Select...</option>
                  {(f.options || []).map((o) => <option key={o?.name || o} value={o?.name || o}>{o?.name || o}</option>)}
                </select>
              ) : (
                <input type="text" value={c[f.field] || ''} onChange={(e) => updateNested('campaignSettings', f.field, e.target.value)} className={INPUT} />
              )}
            </label>
          ))}
        </div>
        {subLists.map(({ key, label }) => {
          const items = c[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[500px]">
                  <thead>
                    <tr><th className={TH}>Name</th><th className={`${TH} text-center`}>Active</th><th className={`${TH} text-center`}>Actions</th></tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, name: e.target.value }; update({ campaignSettings: { ...c, [key]: next } }); }} className={`${INPUT} max-w-[200px]`} /></td>
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ campaignSettings: { ...c, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ campaignSettings: { ...c, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => update({ campaignSettings: { ...c, [key]: [...items, { name: 'New Item', active: true }] } })} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
        <h4 className="ss-subheading">Campaign Budget Settings</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Default Currency</span>
            <select value={c.budget?.defaultCurrency || 'INR'} onChange={(e) => updateNested('campaignSettings', 'budget.defaultCurrency', e.target.value)} className={SELECT}>
              <option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option>
            </select></label>
          <label className="block"><span className={LABEL}>Require Budget</span>
            <ToggleSwitch checked={c.budget?.requireBudget !== false} onChange={() => updateNested('campaignSettings', 'budget.requireBudget', !(c.budget?.requireBudget !== false))} /></label>
          <label className="block"><span className={LABEL}>Max Budget Per Campaign</span>
            <input type="number" value={c.budget?.maxBudgetPerCampaign || 10000000} onChange={(e) => updateNested('campaignSettings', 'budget.maxBudgetPerCampaign', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Default Budget Period</span>
            <select value={c.budget?.defaultBudgetPeriod || 'monthly'} onChange={(e) => updateNested('campaignSettings', 'budget.defaultBudgetPeriod', e.target.value)} className={SELECT}>
              <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="campaign">Campaign</option>
            </select></label>
        </div>
        <h4 className="ss-subheading">Campaign Naming Convention</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block"><span className={LABEL}>Prefix</span>
            <input type="text" value={c.naming?.prefix || 'CMP'} onChange={(e) => updateNested('campaignSettings', 'naming.prefix', e.target.value)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Auto Numbering</span>
            <ToggleSwitch checked={c.naming?.useAutoNumbering !== false} onChange={() => updateNested('campaignSettings', 'naming.useAutoNumbering', !(c.naming?.useAutoNumbering !== false))} /></label>
          <label className="block"><span className={LABEL}>Include Date</span>
            <ToggleSwitch checked={c.naming?.includeDate || false} onChange={() => updateNested('campaignSettings', 'naming.includeDate', !(c.naming?.includeDate || false))} /></label>
          <label className="block"><span className={LABEL}>Pattern</span>
            <input type="text" value={c.naming?.pattern || '{prefix}-{number}'} onChange={(e) => updateNested('campaignSettings', 'naming.pattern', e.target.value)} className={INPUT} /></label>
        </div>
        <h4 className="ss-subheading">Campaign Channels</h4>
        <p className="text-xs text-slate-500 -mt-2">Channels come from the Marketing Channels section — tick the ones campaigns may use.</p>
        <div className="flex flex-wrap gap-2">
          {(settings?.marketingChannels || []).filter((ch) => ch.active !== false).map((ch) => {
            const selected = (c.campaignChannels || []).some((x) => (x?.name || x) === ch.name);
            const toggle = () => {
              const next = selected
                ? (c.campaignChannels || []).filter((x) => (x?.name || x) !== ch.name)
                : [...(c.campaignChannels || []), ch.name];
              updateNested('campaignSettings', 'campaignChannels', next);
            };
            return (
              <button key={ch.name} type="button" onClick={toggle}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${selected ? 'bg-[#E8F0EE] border-[#0B4A3D] text-[#0B4A3D]' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                {ch.name}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  MARKETING CHANNELS                                                 */
  /* ================================================================ */
  const renderChannels = () => {
    const ch = settings?.marketingChannels || [];
    return (
      <div className="space-y-4">
        <p className="ss-note">Marketing channels are available throughout the Marketing module — in campaigns, leads, follow-ups, and reports.</p>
        <div className="overflow-x-auto">
          <table className="ss-table min-w-[600px]">
            <thead>
              <tr><th className={TH}>Channel Name</th><th className={`${TH} text-center`}>Active</th><th className={TH}>Icon</th><th className={TH}>Color</th><th className={`${TH} text-center`}>Actions</th></tr>
            </thead>
            <tbody>
              {ch.map((row, i) => (
                <tr key={i}>
                  <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...ch]; next[i] = { ...row, name: e.target.value }; update({ marketingChannels: next }); }} className={`${INPUT} max-w-[180px]`} /></td>
                  <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...ch]; next[i] = { ...row, active: !row.active }; update({ marketingChannels: next }); }} className={CHECK} /></td>
                  <td className={TD}><input value={row.icon || ''} onChange={(e) => { const next = [...ch]; next[i] = { ...row, icon: e.target.value }; update({ marketingChannels: next }); }} className={`${INPUT} max-w-[120px]`} placeholder="icon name" /></td>
                  <td className={TD}><input value={row.color || ''} onChange={(e) => { const next = [...ch]; next[i] = { ...row, color: e.target.value }; update({ marketingChannels: next }); }} className={`${INPUT} max-w-[120px]`} placeholder="#hex color" /></td>
                  <td className={`${TD} text-center`}><button type="button" onClick={() => update({ marketingChannels: ch.filter((_, idx) => idx !== i) })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" onClick={() => update({ marketingChannels: [...ch, { name: 'New Channel', active: true, icon: 'ellipsis', color: '#6B7280' }] })} className={ADD_BTN}><Plus className="w-3.5 h-3.5" /> Add Channel</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  TEMPLATE SETTINGS                                                  */
  /* ================================================================ */
  const renderTemplates = () => {
    const t = settings?.templateSettings || {};
    const templateGroups = [
      { key: 'emailTemplates', label: 'Email Templates', fields: ['name', 'subject', 'body'] },
      { key: 'messageTemplates', label: 'Message Templates', fields: ['name', 'body'] },
      { key: 'campaignTemplates', label: 'Campaign Templates', fields: ['name', 'description'] },
      { key: 'followupTemplates', label: 'Follow-up Templates', fields: ['name', 'body'] },
      { key: 'notificationTemplates', label: 'Notification Templates', fields: ['name', 'subject', 'body'] }
    ];
    return (
      <div className="space-y-5">
        {templateGroups.map(({ key, label, fields }) => {
          const items = t[key] || [];
          return (
            <div key={key}>
              <h4 className="ss-subheading">{label}</h4>
              <div className="overflow-x-auto">
                <table className="ss-table min-w-[600px]">
                  <thead>
                    <tr>
                      <th className={TH}>Name</th>
                      {fields.filter(f => f !== 'name').map(f => <th key={f} className={TH}>{f.charAt(0).toUpperCase() + f.slice(1)}</th>)}
                      <th className={`${TH} text-center`}>Active</th>
                      <th className={`${TH} text-center`}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row, i) => (
                      <tr key={i}>
                        <td className={TD}><input value={row.name || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, name: e.target.value }; update({ templateSettings: { ...t, [key]: next } }); }} className={`${INPUT} max-w-[160px]`} /></td>
                        {fields.filter(f => f !== 'name').map(f => (
                          <td key={f} className={TD}><textarea value={row[f] || ''} onChange={(e) => { const next = [...items]; next[i] = { ...row, [f]: e.target.value }; update({ templateSettings: { ...t, [key]: next } }); }} className={`${INPUT} min-w-[200px]`} rows={2} /></td>
                        ))}
                        <td className={`${TD} text-center`}><input type="checkbox" checked={row.active !== false} onChange={() => { const next = [...items]; next[i] = { ...row, active: !row.active }; update({ templateSettings: { ...t, [key]: next } }); }} className={CHECK} /></td>
                        <td className={`${TD} text-center`}><button type="button" onClick={() => update({ templateSettings: { ...t, [key]: items.filter((_, idx) => idx !== i) } })} className={REMOVE_BTN}><Trash2 className="w-3 h-3" /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" onClick={() => {
                const defaults = { name: 'New Template', active: true };
                const newItem = { ...defaults, ...Object.fromEntries(fields.filter(f => f !== 'name').map(f => [f, ''])) };
                update({ templateSettings: { ...t, [key]: [...items, newItem] } });
              }} className={`${ADD_BTN} mt-3`}><Plus className="w-3.5 h-3.5" /> Add {label.replace(/s$/, '')}</button>
            </div>
          );
        })}
      </div>
    );
  };

  /* ================================================================ */
  /*  AUTOMATION SETTINGS                                                */
  /* ================================================================ */
  const renderAutomation = () => {
    const a = settings?.automationSettings || {};
    return (
      <div className="space-y-5">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs text-slate-600">Automation settings configure which workflows are enabled. Rules and criteria can be expanded in future releases without changing this architecture.</p>
        </div>
        <h4 className="ss-subheading">Lead Assignment Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Lead Assignment Automation</span>
            <ToggleSwitch checked={a.leadAssignment?.enabled || false} onChange={() => updateNested('automationSettings', 'leadAssignment.enabled', !(a.leadAssignment?.enabled || false))} />
          </div>
          <label className="block"><span className={LABEL}>Assignment Method</span>
            <select value={a.leadAssignment?.method || 'round_robin'} onChange={(e) => updateNested('automationSettings', 'leadAssignment.method', e.target.value)} className={SELECT}>
              <option value="round_robin">Round Robin</option>
              <option value="load_balanced">Load Balanced</option>
              <option value="manual">Manual</option>
            </select></label>
          <label className="block"><span className={LABEL}>Notify Assignee</span>
            <ToggleSwitch checked={a.leadAssignment?.notifyAssignee !== false} onChange={() => updateNested('automationSettings', 'leadAssignment.notifyAssignee', !(a.leadAssignment?.notifyAssignee !== false))} /></label>
        </div>
        <h4 className="ss-subheading">Lead Scoring Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Lead Scoring</span>
            <ToggleSwitch checked={a.leadScoring?.enabled || false} onChange={() => updateNested('automationSettings', 'leadScoring.enabled', !(a.leadScoring?.enabled || false))} />
          </div>
          <label className="block"><span className={LABEL}>Auto-Qualify Threshold</span>
            <input type="number" value={a.leadScoring?.autoQualifyThreshold || 70} onChange={(e) => updateNested('automationSettings', 'leadScoring.autoQualifyThreshold', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Recalculate on Update</span>
            <ToggleSwitch checked={a.leadScoring?.recalculateOnUpdate !== false} onChange={() => updateNested('automationSettings', 'leadScoring.recalculateOnUpdate', !(a.leadScoring?.recalculateOnUpdate !== false))} /></label>
        </div>
        <h4 className="ss-subheading">Follow-up Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Follow-up Automation</span>
            <ToggleSwitch checked={a.followupAutomation?.enabled || false} onChange={() => updateNested('automationSettings', 'followupAutomation.enabled', !(a.followupAutomation?.enabled || false))} />
          </div>
          <label className="block"><span className={LABEL}>Trigger on Status Change</span>
            <ToggleSwitch checked={a.followupAutomation?.triggerOnStatusChange || false} onChange={() => updateNested('automationSettings', 'followupAutomation.triggerOnStatusChange', !(a.followupAutomation?.triggerOnStatusChange || false))} /></label>
          <label className="block"><span className={LABEL}>Trigger on Date</span>
            <ToggleSwitch checked={a.followupAutomation?.triggerOnDate !== false} onChange={() => updateNested('automationSettings', 'followupAutomation.triggerOnDate', !(a.followupAutomation?.triggerOnDate !== false))} /></label>
          <label className="block"><span className={LABEL}>Default Interval (days)</span>
            <input type="number" value={a.followupAutomation?.defaultIntervalDays || 3} onChange={(e) => updateNested('automationSettings', 'followupAutomation.defaultIntervalDays', Number(e.target.value) || 0)} className={INPUT} /></label>
        </div>
        <h4 className="ss-subheading">Campaign Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Campaign Automation</span>
            <ToggleSwitch checked={a.campaignAutomation?.enabled || false} onChange={() => updateNested('automationSettings', 'campaignAutomation.enabled', !(a.campaignAutomation?.enabled || false))} />
          </div>
          <label className="block"><span className={LABEL}>Auto-Start on Approval</span>
            <ToggleSwitch checked={a.campaignAutomation?.autoStartOnApproval || false} onChange={() => updateNested('automationSettings', 'campaignAutomation.autoStartOnApproval', !(a.campaignAutomation?.autoStartOnApproval || false))} /></label>
          <label className="block"><span className={LABEL}>Auto-Pause on Budget Exhausted</span>
            <ToggleSwitch checked={a.campaignAutomation?.autoPauseOnBudgetExhausted !== false} onChange={() => updateNested('automationSettings', 'campaignAutomation.autoPauseOnBudgetExhausted', !(a.campaignAutomation?.autoPauseOnBudgetExhausted !== false))} /></label>
          <label className="block"><span className={LABEL}>Auto Notifications</span>
            <ToggleSwitch checked={a.campaignAutomation?.autoNotifications !== false} onChange={() => updateNested('automationSettings', 'campaignAutomation.autoNotifications', !(a.campaignAutomation?.autoNotifications !== false))} /></label>
        </div>
        <h4 className="ss-subheading">Reminder Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Reminder Automation</span>
            <ToggleSwitch checked={a.reminderAutomation?.enabled !== false} onChange={() => updateNested('automationSettings', 'reminderAutomation.enabled', !(a.reminderAutomation?.enabled !== false))} />
          </div>
          <label className="block"><span className={LABEL}>Remind Before Due</span>
            <ToggleSwitch checked={a.reminderAutomation?.remindBeforeDue !== false} onChange={() => updateNested('automationSettings', 'reminderAutomation.remindBeforeDue', !(a.reminderAutomation?.remindBeforeDue !== false))} /></label>
          <label className="block"><span className={LABEL}>Remind Days Before</span>
            <input type="number" value={a.reminderAutomation?.remindDaysBefore || 1} onChange={(e) => updateNested('automationSettings', 'reminderAutomation.remindDaysBefore', Number(e.target.value) || 0)} className={INPUT} /></label>
        </div>
        <h4 className="ss-subheading">Notification Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Notification Automation</span>
            <ToggleSwitch checked={a.notificationAutomation?.enabled !== false} onChange={() => updateNested('automationSettings', 'notificationAutomation.enabled', !(a.notificationAutomation?.enabled !== false))} />
          </div>
          <label className="block"><span className={LABEL}>Channels</span>
            <select multiple value={a.notificationAutomation?.channels || []} onChange={(e) => { const next = Array.from(e.target.selectedOptions, o => o.value); updateNested('automationSettings', 'notificationAutomation.channels', next); }} className={SELECT}>
              <option value="browser">Browser</option>
              <option value="email">Email</option>
            </select></label>
        </div>
        <h4 className="ss-subheading">Lead Conversion Automation</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="ss-row">
            <span className="ss-row-label">Enable Lead Conversion Automation</span>
            <ToggleSwitch checked={a.leadConversionAutomation?.enabled || false} onChange={() => updateNested('automationSettings', 'leadConversionAutomation.enabled', !(a.leadConversionAutomation?.enabled || false))} />
          </div>
          <label className="block"><span className={LABEL}>Auto-Create Follow-up</span>
            <ToggleSwitch checked={a.leadConversionAutomation?.autoCreateFollowUp !== false} onChange={() => updateNested('automationSettings', 'leadConversionAutomation.autoCreateFollowUp', !(a.leadConversionAutomation?.autoCreateFollowUp !== false))} /></label>
          <label className="block"><span className={LABEL}>Auto-Update Status</span>
            <ToggleSwitch checked={a.leadConversionAutomation?.autoUpdateStatus || false} onChange={() => updateNested('automationSettings', 'leadConversionAutomation.autoUpdateStatus', !(a.leadConversionAutomation?.autoUpdateStatus || false))} /></label>
          <label className="block"><span className={LABEL}>Default Status</span>
            <input type="text" value={a.leadConversionAutomation?.defaultStatus || 'Active'} onChange={(e) => updateNested('automationSettings', 'leadConversionAutomation.defaultStatus', e.target.value)} className={INPUT} /></label>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  ACCESS MANAGEMENT (ADMIN)                                         */
  /* ================================================================ */
  const renderAccess = () => {
    if (!isAdmin) {
      return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold text-slate-600">
            Marketing access can only be configured by an Administrator.
          </p>
        </div>
      );
    }
    if (accessError) {
      return (
        <div className="cpr-error-banner" role="alert">
          <p>{accessError?.message || 'Failed to load Marketing access for this scope.'}</p>
          <button type="button" className="cpr-error-retry" onClick={() => loadAccessScope(accessScope)}>Try Again</button>
        </div>
      );
    }
    if (!accessOptions) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      );
    }

    const roleLabel = (role) => role;
    const selectedUser = (accessOptions.users || []).find((u) => String(u.id) === String(accessScope.key));
    const scopeLabel = accessScope.type === 'ROLE'
      ? `Role: ${roleLabel(accessScope.key)}`
      : `User: ${selectedUser ? `${selectedUser.fullName} (${selectedUser.email})` : accessScope.key}`;

    return (
      <div className="space-y-5">
        {/* Scope selector */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block">
            <span className={LABEL}>Configure access for</span>
            <select
              value={accessScope.type}
              onChange={(e) => changeScope(e.target.value, e.target.value === 'ROLE'
                ? (accessOptions.roles?.[0] || '')
                : (accessOptions.users?.[0]?.id ? String(accessOptions.users[0].id) : ''))}
              className={SELECT}
            >
              <option value="ROLE">Role</option>
              <option value="USER">User</option>
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>{accessScope.type === 'ROLE' ? 'Role' : 'User'}</span>
            {accessScope.type === 'ROLE' ? (
              <select value={accessScope.key} onChange={(e) => changeScope('ROLE', e.target.value)} className={SELECT}>
                {(accessOptions.roles || []).map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            ) : (
              <select value={accessScope.key} onChange={(e) => changeScope('USER', e.target.value)} className={SELECT}>
                {(accessOptions.users || []).map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.fullName} — {user.email} ({user.role})
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        {/* Status of the selected scope */}
        <div className={`mk-access-status ${accessScopeData?.configured ? 'is-configured' : 'is-default'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800">{scopeLabel}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {accessScopeData?.configured
                  ? `Configured${accessScopeData?.updatedBy ? ` — last saved by ${accessScopeData.updatedBy}` : ''}. These exact permissions are enforced.`
                  : (accessScope.type === 'ROLE'
                    ? 'Not configured — currently using the role’s default Marketing access (the module behaves exactly as it did before Access Management).'
                    : 'No personal configuration — this user follows their role’s configuration or default access.')}
              </p>
            </div>
            {accessDirty && <span className="text-[11px] font-bold text-amber-700">Unsaved changes</span>}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          A page with <strong>View</strong> OFF is hidden from navigation and its URL/API are refused. Turning
          Create, Edit, Delete, Approve, Export, Print or Upload OFF hides that action and the backend rejects it.
          An action a page does not have is never offered here.
        </p>

        {accessLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
          </div>
        ) : !accessDraft ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-600">Select a role or user to configure Marketing access.</p>
          </div>
        ) : (
          <div className="mk-access-grid">
            {MARKETING_AREAS.map((area) => {
              const viewOn = Boolean(accessDraft?.[area.key]?.view);
              return (
                <div key={area.key} className="mk-access-card">
                  <div className="mk-access-card-head">
                    <h4 className="mk-access-card-title">{area.label}</h4>
                    {/* The badge is derived from this area's own View switch. */}
                    <span className={`mk-access-badge ${viewOn ? 'is-on' : 'is-off'}`}>
                      {viewOn ? 'Visible' : 'Hidden'}
                    </span>
                  </div>
                  <div className="mk-access-rows">
                    {area.actions.map((actionKey) => {
                      const checked = Boolean(accessDraft?.[area.key]?.[actionKey]);
                      const label = `${area.label} — ${ACTION_LABELS[actionKey] || actionKey}`;
                      return (
                        <div key={actionKey} className="mk-access-row">
                          <span className="mk-access-row-label">{ACTION_LABELS[actionKey] || actionKey}</span>
                          <span className={`mk-access-row-state${checked ? ' is-on' : ''}`} aria-hidden="true">
                            {checked ? 'On' : 'Off'}
                          </span>
                          <ToggleSwitch
                            checked={checked}
                            label={label}
                            disabled={accessSaving}
                            onChange={() => toggleAccess(area.key, actionKey)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Section-level actions — Access Management has its own resource, so it
            saves independently of the Marketing settings blob above. */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setConfirmAccessReset(true)}
            disabled={accessSaving || !accessScope.key}
            className="mk-access-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Reset to defaults
          </button>
          <button
            type="button"
            onClick={saveAccess}
            disabled={accessSaving || !accessDirty}
            className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {accessSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Access
          </button>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  SECTION ROUTER                                                    */
  /* ================================================================ */
  const renderSection = () => {
    switch (section) {
      case 'health': return renderHealth();
      case 'general': return renderGeneral();
      case 'lead': return renderLead();
      case 'campaign': return renderCampaign();
      case 'channels': return renderChannels();
      case 'templates': return renderTemplates();
      case 'automation': return renderAutomation();
      case 'visit': return renderVisit();
      case 'followup': return renderFollowup();
      case 'expense': return renderExpense();
      case 'expenseApproval': return renderExpenseApproval();
      case 'travel': return renderTravel();
      case 'qform': return renderQForm();
      case 'calendar': return renderCalendar();
      case 'location': return renderLocation();
      case 'notifications': return renderNotifications();
      case 'masters': return renderMasters();
      case 'numbering': return renderNumbering();
      case 'access': return renderAccess();
      default: return renderHealth();
    }
  };

  /* ================================================================ */
  /*  RENDER                                                            */
  /* ================================================================ */
  if (loading) {
    return (
      <div className="purchase-page cpr-page flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="purchase-page cpr-page ss-page flex-1 flex flex-col bg-app font-sans antialiased text-slate-800 w-full max-w-full min-w-0">
      {/* Breadcrumb — same pattern as Sales Settings */}
      <nav className="po-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/marketing')}>Marketing</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} aria-hidden="true" />
        <span className="bc-current">Marketing Settings</span>
      </nav>

      {/* Page header + actions */}
      <div className="po-page-header">
        <div className="min-w-0">
          <h1><Settings2 className="w-5 h-5" style={{ color: '#0A4F44' }} aria-hidden="true" /> Marketing Settings</h1>
          <p className="po-page-header-subtitle">Configure leads, campaigns, channels, templates, automation, visits, follow-ups, expenses, travel, Q-Forms and masters for all Marketing modules</p>
        </div>
        <div className="po-page-header-actions">
          {canEditSettings ? (
            <>
              <button type="button" onClick={() => setConfirmReset(true)} className="po-btn po-btn-secondary po-btn-sm">
                <RefreshCw size={13} /> Reset
              </button>
              <button type="button" onClick={save} disabled={saving} className="po-btn po-btn-primary po-btn-sm">
                {saving ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Saving…</> : <><Save size={13} aria-hidden="true" /> Save Settings</>}
              </button>
            </>
          ) : (
            <span className="ss-hint">Read-only — Administrator access is required to edit.</span>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="ss-banner ss-banner--error" role="alert">
          <p>{error?.message || 'Failed to load settings.'}</p>
          <button type="button" onClick={load}>Retry</button>
        </div>
      )}

      {/* Health indicator — jumps to the Overview section that explains it */}
      {health && health.status !== 'healthy' && (
        <div className="ss-banner ss-banner--info" role="status">
          <p>
            <strong>Configuration Health: {health.percentage}%</strong>
            {' — '}{health.total - health.configured} section(s) need attention.
          </p>
          <button type="button" onClick={() => setSection('health')}>View</button>
        </div>
      )}

      {/* Settings layout — grouped rail + content, exactly like Sales Settings */}
      <div className="ss-layout">
        <nav className="ss-nav" aria-label="Settings sections">
          {navGroups.map((group) => (
            <div key={group.key} className="ss-nav-group">
              <span className="ss-nav-group-label">{group.label}</span>
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = section === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`ss-nav-item${active ? ' active' : ''}`}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => changeSection(item.key)}
                  >
                    <Icon aria-hidden="true" /> <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="ss-content">
          <h3 className="ss-section-title">{meta.title}</h3>
          <p className="ss-section-desc">{meta.desc}</p>
          {/* Overview renders its own cards (the Configuration Health card and
              the status-card grid) straight into the content column, exactly
              as Sales Settings does. Every other section body sits in the
              shell's card, the equivalent of the shell card Sales Settings
              wraps its configuration blocks in. */}
          {section === 'health' ? renderSection() : (
            <section className="ss-card">
              <div className="ss-card-body">
                {renderSection()}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Confirm Access Management reset — restores the role's documented default access */}
      <ConfirmDialog
        open={confirmAccessReset}
        title="Reset Marketing access"
        message={`Remove the saved Marketing access for ${accessScope.type === 'ROLE' ? `role ${accessScope.key}` : 'this user'}? The scope will go back to its role's default Marketing access — the behaviour the module had before any configuration. This does not grant anything beyond that default.`}
        confirmLabel="Reset Access"
        variant="danger"
        icon={RefreshCw}
        loading={accessSaving}
        onConfirm={resetAccess}
        onCancel={() => !accessSaving && setConfirmAccessReset(false)}
      />

      {/* Unsaved Access Management changes guard */}
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard unsaved changes?"
        message="The Marketing access changes for this scope have not been saved. Leaving now discards them."
        confirmLabel="Discard"
        variant="danger"
        loading={false}
        onConfirm={discardAccessDraft}
        onCancel={() => { setConfirmDiscard(false); setPendingSection(null); setPendingScope(null); }}
      />

      {/* Confirm Reset Dialog */}
      <ConfirmDialog open={confirmReset} title="Reset all settings" message="Reset all Marketing Settings to system defaults? This cannot be undone." confirmLabel="Reset All" variant="danger" icon={RefreshCw} loading={saving} onConfirm={async () => { setSaving(true); try { const defaults = await marketingSettingsService.resetSettings(); setSettings(defaults); setHealth(marketingSettingsService.getConfigHealth()); toast.success('Settings reset to defaults'); } catch (err) { toast.error(err?.message || 'Reset failed'); } finally { setSaving(false); setConfirmReset(false); } }} onCancel={() => !saving && setConfirmReset(false)} />
    </div>
  );
}
