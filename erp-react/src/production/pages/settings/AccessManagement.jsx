/**
 * production/pages/settings/AccessManagement.jsx
 * ------------------------------------------------------------------
 * Production Settings → Access Management — the same panel as Marketing
 * Settings → Access Management: pick a role or a single user, see whether the
 * scope has a saved configuration or is running on its role defaults, and
 * switch the actions that genuinely exist in each Production area.
 *
 * Every switch is enforced by the backend (ProductionAccessInterceptor +
 * @productionAccess on the settings writes); this screen only shows the
 * effective state. Configuration is ADMIN-only, on its own resource
 * (/production/access/**), so it never touches the settings document, the
 * Users & Roles master data or the other Production masters.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Save } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../../components/Common/ConfirmDialog';
import { getStoredUser } from '../../../services/authService';
import productionAccessService from '../../../services/productionAccessService';
import { reloadProductionAccess } from '../../access/useProductionAccess';
import { PRODUCTION_AREAS, ACTION_LABELS } from '../../access/catalog';
import '../../../components/Marketing/marketing-access.css';

function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <label className="ss-toggle" title={label}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <span className="ss-toggle-slider" />
    </label>
  );
}

export default function AccessManagement() {
  const isAdminUser = String(getStoredUser()?.role || '').toUpperCase() === 'ADMIN';

  const [options, setOptions] = useState(null);
  const [scope, setScope] = useState({ type: 'ROLE', key: '' });
  const [scopeData, setScopeData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [banner, setBanner] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = Boolean(
    draft && scopeData && JSON.stringify(draft) !== JSON.stringify(scopeData.permissions || {})
  );

  /**
   * Every user an administrator can configure, from the one source both screens
   * share: the ERP accounts (they can sign in) plus the Production Users &
   * Roles register (master data, no sign-in). The backend removes a register
   * row whose email already belongs to an account, so nobody is listed twice.
   */
  const userChoices = useMemo(() => {
    const accounts = (options?.users || []).map((user) => ({ ...user, account: true }));
    const production = (options?.productionUsers || []).map((user) => ({ ...user, account: false }));
    return [...accounts, ...production].sort((a, b) =>
      String(a.fullName || '').localeCompare(String(b.fullName || ''), undefined, { sensitivity: 'base' }));
  }, [options]);

  const refreshOptions = useCallback(async () => {
    if (!isAdminUser) return;
    try {
      const payload = await productionAccessService.getOptions();
      setOptions(payload);
      setScope((previous) => {
        const roles = payload?.roles || [];
        const users = [...(payload?.users || []), ...(payload?.productionUsers || [])];
        if (previous.type === 'ROLE' && roles.includes(previous.key)) return previous;
        if (previous.type === 'USER' && users.some((u) => String(u.id) === String(previous.key))) return previous;
        return { type: 'ROLE', key: roles.includes('USER') ? 'USER' : (roles[0] || '') };
      });
    } catch (err) {
      setError(err);
    }
  }, [isAdminUser]);

  useEffect(() => { refreshOptions(); }, [refreshOptions]);

  const loadScope = useCallback(async (nextScope) => {
    if (!isAdminUser || !nextScope?.key) {
      setScopeData(null);
      setDraft(null);
      return;
    }
    setLoading(true);
    setError(null);
    setBanner(null);
    try {
      const data = await productionAccessService.getScope(nextScope.type, nextScope.key);
      setScopeData(data);
      setDraft(data?.permissions || null);
    } catch (err) {
      setScopeData(null);
      setDraft(null);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [isAdminUser]);

  useEffect(() => { loadScope(scope); }, [scope, loadScope]);

  const toggle = (areaKey, actionKey) => {
    setDraft((previous) => (previous ? {
      ...previous,
      [areaKey]: { ...(previous[areaKey] || {}), [actionKey]: !previous?.[areaKey]?.[actionKey] }
    } : previous));
    setBanner(null);
  };

  const save = async () => {
    if (!scope.key || !draft) return;
    setSaving(true);
    setBanner(null);
    try {
      const saved = await productionAccessService.saveScope(scope.type, scope.key, draft);
      setScopeData(saved);
      setDraft(saved?.permissions || draft);
      setBanner({
        tone: 'success',
        text: `Production access saved for ${scope.type === 'ROLE' ? `role ${scope.key}` : 'the selected user'}.`
      });
      await refreshOptions();
      // The administrator's own view is refreshed immediately, so a change to
      // their own scope is reflected without a reload (the backend enforces it).
      reloadProductionAccess();
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err?.response?.status === 403
          ? 'Only an Administrator can change Production access.'
          : err?.message || 'Failed to save Production access.'
      });
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!scope.key) return;
    setSaving(true);
    setBanner(null);
    try {
      const cleared = await productionAccessService.resetScope(scope.type, scope.key);
      setScopeData(cleared);
      setDraft(cleared?.permissions || null);
      setBanner({ tone: 'success', text: 'Access reset — this scope now inherits its role defaults.' });
      await refreshOptions();
      reloadProductionAccess();
    } catch (err) {
      setBanner({
        tone: 'error',
        text: err?.response?.status === 403
          ? 'Only an Administrator can change Production access.'
          : err?.message || 'Failed to reset Production access.'
      });
    } finally {
      setSaving(false);
      setConfirmReset(false);
    }
  };

  const selectedUser = useMemo(
    () => userChoices.find((user) => String(user.id) === String(scope.key)) || null,
    [userChoices, scope.key]
  );

  if (!isAdminUser) {
    return (
      <>
        <PageHeader
          title="Access Management"
          subtitle="Decide which Production pages and actions each role or user may use."
        />
        <div className="ss-section">
          <p className="ss-hint" style={{ margin: 0 }}>
            Only an Administrator can view or change Production access.
          </p>
        </div>
      </>
    );
  }

  if (error && !options) {
    return (
      <>
        <PageHeader title="Access Management" subtitle="Production access could not be loaded." />
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Failed to load Production access.'}</p>
          <button type="button" className="cpr-error-retry" onClick={refreshOptions}>Try Again</button>
        </div>
      </>
    );
  }

  if (!options) {
    return (
      <>
        <PageHeader title="Access Management" subtitle="Decide which Production pages and actions each role or user may use." />
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading access configuration" />
        </div>
      </>
    );
  }

  const scopeLabel = scope.type === 'ROLE'
    ? `Role: ${scope.key}`
    : `User: ${selectedUser ? `${selectedUser.fullName} (${selectedUser.email})` : scope.key}`;
  const selectedIsProductionOnly = scope.type === 'USER' && selectedUser && !selectedUser.account;

  return (
    <>
      <PageHeader
        title="Access Management"
        subtitle="Decide which Production pages and actions each role or user may use. The backend enforces every saved permission on the Production APIs."
      />

      <div className="space-y-5">
        <div className="ss-section">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="ss-field" style={{ margin: 0 }}>
              <span className="ss-label">Configure access for</span>
              <select
                value={scope.type}
                onChange={(event) => {
                  const type = event.target.value;
                  if (type === 'ROLE') setScope({ type: 'ROLE', key: options.roles?.[0] || '' });
                  else setScope({
                    type: 'USER',
                    key: userChoices[0]?.id ? String(userChoices[0].id) : ''
                  });
                }}
                className="ss-input"
              >
                <option value="ROLE">Role</option>
                <option value="USER">User</option>
              </select>
            </label>
            <label className="ss-field" style={{ margin: 0 }}>
              <span className="ss-label">{scope.type === 'ROLE' ? 'Role' : 'User'}</span>
              {scope.type === 'ROLE' ? (
                <select
                  value={scope.key}
                  onChange={(event) => setScope({ type: 'ROLE', key: event.target.value })}
                  className="ss-input"
                >
                  {(options.roles || []).map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
              ) : (
                <select
                  value={scope.key}
                  onChange={(event) => setScope({ type: 'USER', key: event.target.value })}
                  className="ss-input"
                >
                  {userChoices.map((user) => (
                    <option key={user.id} value={String(user.id)}>
                      {user.fullName} — {user.email} ({user.account ? user.role : (user.productionRole || user.role)})
                      {user.account ? '' : ' · Production user, no sign-in'}
                    </option>
                  ))}
                </select>
              )}
            </label>
          </div>

          {/* Configured or inherited — never "looks configured" just because
              the panel rendered. */}
          {selectedIsProductionOnly && (
            <p className="ss-hint" style={{ margin: 0 }}>
              <strong>{selectedUser.fullName}</strong> is a Production Users &amp; Roles record (role{' '}
              {selectedUser.productionRole || selectedUser.role}), not an ERP login account: the configuration is saved
              against its stable id <strong>{selectedUser.id}</strong> and is enforced for them once an ERP account with{' '}
              <strong>{selectedUser.email}</strong> signs in. That account is then listed here in its own right, and any
              configuration saved on the account itself takes precedence over this one.
            </p>
          )}

          <div className={`mk-access-status ${scopeData?.configured ? 'is-configured' : 'is-default'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-slate-800">{scopeLabel}</p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  {scopeData?.configured
                    ? `Configured${scopeData?.updatedBy ? ` — last saved by ${scopeData.updatedBy}` : ''}. These exact permissions are enforced.`
                    : (scope.type === 'ROLE'
                      ? 'Not configured — this role still has exactly the Production access it had before Access Management, derived from its existing role permissions.'
                      : selectedIsProductionOnly
                        ? 'No personal configuration — this Production user follows the USER role’s configuration and defaults.'
                        : 'No personal configuration — this user follows their role’s configuration or default access.')}
                </p>
              </div>
              {dirty && <span className="text-[11px] font-bold text-amber-700">Unsaved changes</span>}
            </div>
          </div>
        </div>

        {banner && (
          <div
            className={`cpr-error-banner`}
            role="status"
            style={banner.tone === 'success' ? {
              background: '#ecfdf5', borderColor: '#a7f3d0', color: '#065f46'
            } : undefined}
          >
            <p style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {banner.tone === 'success'
                ? <CheckCircle2 size={14} aria-hidden="true" />
                : <AlertTriangle size={14} aria-hidden="true" />}
              {banner.text}
            </p>
          </div>
        )}

        <p className="text-[11px] text-slate-500">
          A page with <strong>View</strong> OFF is hidden from the Production navigation and its URL and API are
          refused. Turning any other action OFF hides that control and the backend rejects it where it is a server
          operation — Print and Export are browser-side, so they are enforced by the UI. An action a Production page
          does not have is never offered here.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading permissions" />
          </div>
        ) : !draft ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-600">Select a role or user to configure Production access.</p>
          </div>
        ) : (
          <div className="mk-access-grid">
            {PRODUCTION_AREAS.map((area) => {
              const viewOn = Boolean(draft?.[area.key]?.view);
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
                      const checked = Boolean(draft?.[area.key]?.[actionKey]);
                      const label = `${area.label} — ${ACTION_LABELS[actionKey] || actionKey}`;
                      return (
                        <div key={actionKey} className="mk-access-row">
                          <span className="mk-access-row-label">{ACTION_LABELS[actionKey] || actionKey}</span>
                          <span className={`mk-access-row-state${checked ? ' is-on' : ''}`} aria-hidden="true">
                            {checked ? 'On' : 'Off'}
                          </span>
                          <Toggle
                            checked={checked}
                            label={label}
                            disabled={saving}
                            onChange={() => toggle(area.key, actionKey)}
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

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            disabled={saving || !scope.key}
            className="btn btn-secondary"
          >
            <RefreshCw size={14} aria-hidden="true" /> Reset to defaults
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !dirty}
            className="btn btn-primary"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Saving…</>
              : <><Save size={14} aria-hidden="true" /> Save Access</>}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset Production access for this scope?"
        message="The saved permissions for the selected role or user are removed and it inherits its role defaults again. Other roles and users are not touched. Marketing and Sales access are not affected, and no Production master data or Users & Roles record is changed."
        confirmLabel="Reset Access"
        variant="danger"
        icon={RefreshCw}
        loading={saving}
        onConfirm={reset}
        onCancel={() => !saving && setConfirmReset(false)}
      />
    </>
  );
}
