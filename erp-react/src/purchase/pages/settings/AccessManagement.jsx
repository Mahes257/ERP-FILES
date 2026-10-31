/**
 * purchase/pages/settings/AccessManagement.jsx
 * ------------------------------------------------------------------
 * Purchase Settings → Access Management.
 *
 * The same panel as Marketing, Sales and Production Settings → Access
 * Management: pick a role or a single user, see whether that scope has a saved
 * configuration or is still running on its inherited defaults, and switch the
 * actions that genuinely exist per Purchase area.
 *
 * Every switch is enforced by the backend (/purchase/access plus the Purchase
 * access interceptor on /api/purchase/**); this UI is the convenience layer on
 * top of it. The section is ADMIN-only, exactly like the other modules: the
 * backend refuses every management call from anyone else, and the navigation
 * item is only rendered for an administrator.
 *
 * The permission matrix is saved as its own resource, so it saves and resets
 * independently of the Purchase settings document around it.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import { useCurrentUser } from '../../../components/Common';
import purchaseAccessService from '../../../services/purchaseAccessService';
import { reloadPurchaseAccess } from '../../access/usePurchaseAccess';
import { ACTION_HINTS, ACTION_LABELS, PURCHASE_AREAS } from '../../access/catalog';
import '../../../components/Marketing/marketing-access.css';

/** The Purchase design system's switch (settings-polish.css `.st-toggle`). */
function Toggle({ checked, onChange, disabled = false, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="st-toggle"
    />
  );
}

export default function AccessManagement() {
  const toast = useToast();
  const { isAdmin } = useCurrentUser();

  const [options, setOptions] = useState(null);
  const [scope, setScope] = useState({ type: 'ROLE', key: '' });
  const [scopeData, setScopeData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const dirty = Boolean(
    draft && scopeData && JSON.stringify(draft) !== JSON.stringify(scopeData.permissions || {})
  );

  const loadOptions = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const payload = await purchaseAccessService.getOptions();
      setOptions(payload);
      setScope((prev) => {
        if (prev.key) return prev;
        const firstRole = payload?.roles?.[0] || '';
        return { type: 'ROLE', key: firstRole };
      });
    } catch (err) {
      setError(err);
    }
  }, [isAdmin]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  const loadScope = useCallback(async (target) => {
    if (!target?.key) {
      setScopeData(null);
      setDraft(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await purchaseAccessService.getScope(target.type, target.key);
      setScopeData(data);
      setDraft(data?.permissions || null);
    } catch (err) {
      setError(err);
      setScopeData(null);
      setDraft(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadScope(scope); }, [scope, loadScope]);

  const toggle = (areaKey, actionKey) => {
    setDraft((prev) => (prev ? {
      ...prev,
      [areaKey]: { ...(prev[areaKey] || {}), [actionKey]: !prev?.[areaKey]?.[actionKey] }
    } : prev));
  };

  const save = async () => {
    if (!scope.key || !draft) return;
    setSaving(true);
    try {
      const saved = await purchaseAccessService.saveScope(scope.type, scope.key, draft);
      setScopeData(saved);
      setDraft(saved?.permissions || draft);
      toast.success(`Purchase access saved for ${scope.type === 'ROLE' ? `role ${scope.key}` : 'the selected user'}.`);
      await loadOptions();
      // The administrator's own navigation is refreshed immediately (the backend
      // already enforces the new rules).
      reloadPurchaseAccess();
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 403
        ? 'Only an Administrator can change Purchase access.'
        : err?.message || 'Failed to save Purchase access.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!scope.key) return;
    setSaving(true);
    try {
      const cleared = await purchaseAccessService.resetScope(scope.type, scope.key);
      setScopeData(cleared);
      setDraft(cleared?.permissions || null);
      toast.success('Access reset — this scope now inherits its defaults.');
      await loadOptions();
      reloadPurchaseAccess();
    } catch (err) {
      const status = err?.response?.status;
      toast.error(status === 403
        ? 'Only an Administrator can change Purchase access.'
        : err?.message || 'Failed to reset Purchase access.');
    } finally {
      setSaving(false);
      setConfirmReset(false);
    }
  };

  const selectedUser = useMemo(
    () => (options?.users || []).find((user) => String(user.id) === String(scope.key)),
    [options, scope.key]
  );
  const scopeLabel = scope.type === 'ROLE'
    ? `Role: ${scope.key}`
    : `User: ${selectedUser ? `${selectedUser.fullName} (${selectedUser.email})` : scope.key}`;

  if (!isAdmin) {
    return (
      <div className="st-banner st-banner-warning">
        Only an Administrator can view or change Purchase access.
      </div>
    );
  }

  if (error && !options) {
    return (
      <div className="st-banner st-banner-danger flex items-center justify-between gap-3">
        <p className="st-text-xs st-text-semibold">{error?.message || 'Failed to load Purchase access.'}</p>
        <button type="button" className="st-btn st-btn-ghost" onClick={() => { setError(null); loadOptions(); }}>
          <RefreshCw className="w-3.5 h-3.5" /> Try Again
        </button>
      </div>
    );
  }

  if (!options) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading access configuration" />
      </div>
    );
  }

  return (
    <div className="st-space-y-4">
      <div className="st-banner st-banner-info">
        <strong>Access Management</strong> decides which Purchase pages and actions each role or user may use.
        The backend enforces every saved permission on the Purchase APIs; the switches here are the visible layer
        on top of that gate.
      </div>

      {/* Scope selector — a role's configuration or one user's override */}
      <div className="st-form-grid">
        <label className="block">
          <span className="st-label">Configure access for</span>
          <select
            className="st-select"
            value={scope.type}
            onChange={(e) => {
              const type = e.target.value;
              if (type === 'ROLE') setScope({ type: 'ROLE', key: options.roles?.[0] || '' });
              else setScope({ type: 'USER', key: options.users?.[0]?.id ? String(options.users[0].id) : '' });
            }}
          >
            <option value="ROLE">Role</option>
            <option value="USER">User</option>
          </select>
        </label>
        <label className="block">
          <span className="st-label">{scope.type === 'ROLE' ? 'Role' : 'User'}</span>
          {scope.type === 'ROLE' ? (
            <select
              className="st-select"
              value={scope.key}
              onChange={(e) => setScope({ type: 'ROLE', key: e.target.value })}
            >
              {(options.roles || []).map((role) => <option key={role} value={role}>{role}</option>)}
            </select>
          ) : (options.users || []).length === 0 ? (
            <p className="st-text-xs st-text-light m-0">No users exist yet.</p>
          ) : (
            <select
              className="st-select"
              value={scope.key}
              onChange={(e) => setScope({ type: 'USER', key: e.target.value })}
            >
              {(options.users || []).map((user) => (
                <option key={user.id} value={String(user.id)}>
                  {user.fullName} — {user.email} ({user.role})
                </option>
              ))}
            </select>
          )}
        </label>
      </div>

      {/* Configured or inherited — never "looks configured" just because the panel rendered. */}
      <div className={`mk-access-status ${scopeData?.configured ? 'is-configured' : 'is-default'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold text-slate-800">{scopeLabel}</p>
            <p className="text-[11px] text-slate-600 mt-0.5">
              {scopeData?.configured
                ? `Configured${scopeData?.updatedBy ? ` — last saved by ${scopeData.updatedBy}` : ''}. These exact permissions are enforced.`
                : (scope.type === 'ROLE'
                  ? 'Not configured — this role still has exactly the Purchase access it had before Access Management, derived from its existing role permissions.'
                  : 'No personal configuration — this user follows their role’s configuration or default access.')}
            </p>
          </div>
          {dirty && <span className="text-[11px] font-bold text-amber-700">Unsaved changes</span>}
        </div>
      </div>

      <p className="st-text-xs st-text-light">
        A page with <strong>View</strong> OFF is hidden from the Purchase navigation and its URL and API are
        refused. Turning Create, Edit, Delete, Approve, Reject, Submit, Release and the rest OFF hides that action
        and the backend rejects it. An action a Purchase page does not have is never offered here.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading permissions" />
        </div>
      ) : !draft ? (
        <div className="st-banner st-banner-info">
          {scope.type === 'USER' && (options.users || []).length === 0
            ? 'There is no user to configure yet.'
            : 'Select a role or user to configure Purchase access.'}
        </div>
      ) : (
        <div className="mk-access-grid">
          {PURCHASE_AREAS.map((area) => {
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
                        <span className="mk-access-row-label" title={ACTION_HINTS[actionKey] || ''}>
                          {ACTION_LABELS[actionKey] || actionKey}
                          {ACTION_HINTS[actionKey] && (
                            <span className="block text-[10px] font-normal text-slate-500">
                              {ACTION_HINTS[actionKey]}
                            </span>
                          )}
                        </span>
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

      <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-slate-100">
        <button
          type="button"
          onClick={() => setConfirmReset(true)}
          disabled={saving || !scope.key}
          className="mk-access-btn"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Reset to defaults
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="st-btn st-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving
            ? <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Saving…</>
            : <><Save className="w-4 h-4" aria-hidden="true" /> Save Access</>}
        </button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Reset access to defaults?"
        message={`This clears the saved Purchase permissions for ${scopeLabel}. It will inherit its ${scope.type === 'ROLE' ? 'role' : 'role-level'} defaults again.`}
        confirmLabel="Reset Access"
        variant="warning"
        icon={ShieldCheck}
        loading={saving}
        onConfirm={reset}
        onCancel={() => !saving && setConfirmReset(false)}
      />
    </div>
  );
}
