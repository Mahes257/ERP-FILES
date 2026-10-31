/**
 * pages/sales/SalesSettings.jsx
 * ------------------------------------------------------------------
 * Sales Settings — the Sales module's configuration centre.
 *
 * The page is a deliberate PARITY PORT of the PDE Settings screen
 * (PDE/src/pde/pages/settings/SettingsPage.jsx): the same administration
 * shell, grouped left navigation, section titles + descriptions, section
 * cards, and the same draft/save model —
 *
 *   · the screen edits a DRAFT; nothing is written until Save Changes
 *   · the sticky bar carries Reset Changes (discard the draft), the
 *     "Unsaved changes" marker, the "Saved" confirmation and the
 *     Save Changes action, disabled whenever there is nothing to save
 *   · Reset All (factory defaults) is a separate, confirmed action
 *   · Import / Export move a validated settings document in and out
 *
 * Differences are only those Sales genuinely requires: values persist to
 * the backend (/settings/sales → app_settings.sales_settings, ADMIN-only
 * writes) instead of localStorage, and every section holds Sales-specific
 * configuration.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowDown, ArrowUp, Banknote, Bell, Building2, Check,
  CheckCircle2, ChevronRight, Clock, Coins, Database, Download, FileText,
  Globe, Hash, Loader2, Plus, RefreshCw, RotateCcw, Save, Scale,
  Settings2, ShieldCheck, Trash2, Truck, Upload, Wallet, Wifi, WifiOff, Zap
} from 'lucide-react';
import salesSettingsService from '../../services/salesSettingsService';
import exchangeRateService from '../../services/exchangeRateService';
import documentSettingsService, { DOCUMENT_VISIBILITY_OPTIONS } from '../../services/documentSettingsService';
import { getStoredUser } from '../../services/authService';
import ConfirmDialog from '../../components/Common/ConfirmDialog';
import salesAccessService from '../../services/salesAccessService';
import { reloadSalesAccess } from '../../sales/access/useSalesAccess';
import { SALES_AREAS, ACTION_LABELS } from '../../sales/access/catalog';
import '../../styles/settings-shell.css';
import './sales-settings.css';
// The Access Management permission matrix (permission cards, ON/OFF badges and
// the configured/default status strip) — the same stylesheet the Marketing
// Access Management section renders with, so both modules are identical.
import '../../components/Marketing/marketing-access.css';

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

/** Deep copy so the draft can never alias the saved baseline. */
const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

const currentFy = () => String(new Date().getFullYear());

/* ================================================================== */
/*  Navigation — grouped exactly like the PDE Settings rail            */
/* ================================================================== */
const NAV_GROUPS = [
  {
    key: 'workspace',
    label: 'Workspace',
    items: [
      { key: 'overview', label: 'Overview', icon: Zap },
      { key: 'general', label: 'General', icon: Settings2 }
    ]
  },
  {
    key: 'configuration',
    label: 'Configuration',
    items: [
      { key: 'tax', label: 'Tax Settings', icon: Scale },
      { key: 'currency', label: 'Currency & Exchange Rates', icon: Banknote },
      { key: 'payment', label: 'Payment Terms', icon: Wallet },
      { key: 'delivery', label: 'Delivery & Logistics', icon: Truck }
    ]
  },
  {
    key: 'documents',
    label: 'Documents & Output',
    items: [
      { key: 'numbering', label: 'Document Numbering', icon: Hash },
      { key: 'pdf', label: 'PDF / Document Defaults', icon: FileText }
    ]
  },
  {
    key: 'rules',
    label: 'Rules & Access',
    items: [
      { key: 'approval', label: 'Approval & Workflow', icon: ShieldCheck },
      { key: 'notifications', label: 'Notifications', icon: Bell },
      // Access Management is the one ADMIN-only section: it decides who may use
      // Sales, so only an administrator may see or change it.
      { key: 'access', label: 'Access Management', icon: ShieldCheck, adminOnly: true }
    ]
  },
  {
    key: 'data',
    label: 'Data & Organization',
    items: [
      { key: 'masters', label: 'Sales Masters', icon: Database },
      { key: 'company', label: 'Company / Organization', icon: Building2 }
    ]
  }
];

const SECTION_KEYS = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.key));
const SECTION_BY_KEY = Object.fromEntries(NAV_GROUPS.flatMap((group) => group.items).map((item) => [item.key, item]));

/** Section title + description, rendered by the shell above the body. */
const SECTION_META = {
  overview: { title: 'Settings Overview', desc: 'A live summary of the Sales configuration. Status is derived from the saved values.' },
  general: { title: 'General Settings', desc: 'Configure the defaults every new Sales document starts from.' },
  approval: { title: 'Approval & Workflow', desc: 'Decide which Sales documents need approval and the levels they pass through.' },
  tax: { title: 'Tax Settings', desc: 'Configure the tax rates available to new Sales documents. Historical tax values are never rewritten.' },
  currency: { title: 'Currency & Exchange Rates', desc: 'Display, rounding and supported-currency preferences for the Sales module.' },
  payment: { title: 'Payment Terms', desc: 'Credit periods and advance percentages used to derive new document due dates.' },
  delivery: { title: 'Delivery & Logistics', desc: 'Delivery terms and transport companies available on Delivery Challans and related documents.' },
  numbering: { title: 'Document Numbering', desc: 'Prefixes, financial year and sequence length for each Sales document type. Existing documents and counters are never renumbered.' },
  pdf: { title: 'PDF / Document Defaults', desc: 'What Sales documents show when they are printed or exported, and the default visibility of new general documents.' },
  notifications: { title: 'Notification Preferences', desc: 'Which Sales events raise a notification for the team.' },
  access: { title: 'Access Management', desc: 'Decide which Sales pages and actions each role or user may use. The backend enforces every saved permission on the Sales APIs.' },
  masters: { title: 'Sales Masters', desc: 'Reusable master lists offered by Sales forms and documents.' },
  company: { title: 'Company / Organization', desc: 'Sales-scoped company details printed on Sales documents.' }
};

/* ================================================================== */
/*  Shared controls — the same visual contract as the PDE screen       */
/* ================================================================== */
function Toggle({ checked, onChange, disabled = false, title, label }) {
  return (
    <label className="ss-toggle" title={title || label}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-label={label}
      />
      <span className="ss-toggle-slider" />
    </label>
  );
}

function IconButton({ icon: Icon, label, onClick, tone = 'neutral', disabled = false }) {
  return (
    <button
      type="button"
      className={`ss-icon-btn${tone !== 'neutral' ? ` ss-icon-btn--${tone}` : ''}`}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon size={15} aria-hidden="true" />
    </button>
  );
}

/** Label + control row used by every toggle list. */
function ToggleRow({ label, checked, onChange, disabled }) {
  return (
    <div className="ss-row">
      <span className="ss-row-label">{label}</span>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function Card({ title, aside, children, flush = false }) {
  return (
    <section className="ss-card">
      {title && (
        <div className="ss-card-header">
          <h4>{title}</h4>
          {aside && <span>{aside}</span>}
        </div>
      )}
      <div className={`ss-card-body${flush ? ' ss-card-body--flush' : ''}`}>{children}</div>
    </section>
  );
}

/* ================================================================== */
/*  Exchange rates — provider-backed, read-only in Settings            */
/* ================================================================== */
const CURRENCY_SYMBOLS = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'د.إ', JPY: '¥', SGD: 'S$', AUD: 'A$', CAD: 'C$', CHF: 'CHF' };
const ALL_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'SGD', 'AUD', 'CAD', 'CHF'];

function ExchangeRatesPanel({ rateRounding = 4, enabledCurrencies = [], baseCurrency = 'INR', autoSync, frequency, onAutoSyncChange, onFrequencyChange, notify }) {
  const [rates, setRates] = useState([]);
  const [lastSync, setLastSync] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const applyPayload = useCallback((data) => {
    if (!data || !data.rates) return false;
    const base = data.base || baseCurrency;
    setRates(
      Object.entries(data.rates)
        .filter(([code]) => code !== base)
        .map(([code, rate]) => ({
          currency: code,
          rate: typeof rate === 'number' ? rate : parseFloat(rate) || 0,
          symbol: CURRENCY_SYMBOLS[code] || code
        }))
    );
    setLastSync(data.lastUpdated || new Date().toISOString());
    return true;
  }, [baseCurrency]);

  /* Read the latest cached rates. Never invents values when the provider is
     unreachable — the panel reports the failure in place instead. */
  const fetchLatest = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const data = await exchangeRateService.getLatest();
      if (applyPayload(data)) setStatus('success');
      else setStatus('error');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to fetch exchange rates');
      setStatus('error');
    }
  }, [applyPayload]);

  const refresh = useCallback(async () => {
    setStatus('refreshing');
    setError(null);
    try {
      const data = await exchangeRateService.refresh();
      if (applyPayload(data)) {
        setStatus('success');
        notify?.('success', 'Exchange rates refreshed successfully.');
      } else {
        setStatus('error');
        setError('The provider returned no rates.');
      }
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Unable to refresh exchange rates');
      setStatus('error');
    }
  }, [applyPayload, notify]);

  useEffect(() => { queueMicrotask(fetchLatest); }, [fetchLatest]);

  const formatTimestamp = (iso) => {
    if (!iso) return 'Never';
    try {
      return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch {
      return iso;
    }
  };

  const visible = rates.filter((r) => enabledCurrencies.includes(r.currency) && r.currency !== baseCurrency);
  const busy = status === 'loading' || status === 'refreshing';

  return (
    <div>
      <div className="ss-row" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <span className="ss-inline">
          {autoSync ? <Wifi size={14} style={{ color: '#10B981' }} /> : <WifiOff size={14} style={{ color: '#94A3B8' }} />}
          <span className="ss-row-label">Automatic Rate Updates</span>
        </span>
        <span className="ss-inline">
          {autoSync && (
            <>
              <span className="ss-hint">Frequency</span>
              <select
                className="ss-select ss-input-sm"
                style={{ width: 120 }}
                value={frequency || 'daily'}
                onChange={(e) => onFrequencyChange?.(e.target.value)}
                aria-label="Automatic rate update frequency"
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </>
          )}
          <Toggle checked={!!autoSync} onChange={(v) => onAutoSyncChange?.(v)} />
        </span>
      </div>

      <div className="ss-row">
        <span className="ss-inline">
          <Globe size={14} style={{ color: '#94A3B8' }} />
          <span className="ss-hint">Base currency</span>
          <strong style={{ fontSize: 12 }}>{baseCurrency} ({CURRENCY_SYMBOLS[baseCurrency] || baseCurrency})</strong>
        </span>
        <span className="ss-inline">
          <Clock size={13} style={{ color: '#94A3B8' }} />
          <span className="ss-hint">Last synchronized: {formatTimestamp(lastSync)}</span>
        </span>
      </div>

      <div className="ss-inline" style={{ justifyContent: 'space-between', margin: '12px 0' }}>
        <span className="ss-hint">
          {status === 'error' ? (error || 'Unable to load exchange rates') : busy ? 'Fetching exchange rates…' : 'Rates loaded from the configured provider'}
        </span>
        <button type="button" className="po-btn po-btn-secondary po-btn-sm" onClick={refresh} disabled={busy}>
          <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Refresh Rates
        </button>
      </div>

      {status === 'error' && lastSync && (
        <div className="ss-banner ss-banner--info" role="status" style={{ marginBottom: 12 }}>
          <p>
            <AlertTriangle size={13} style={{ verticalAlign: -2, marginRight: 6 }} />
            Exchange-rate provider unavailable — showing the last successfully retrieved rates.
          </p>
        </div>
      )}

      <div style={{ border: '1px solid var(--ss-border)', borderRadius: 12, overflow: 'hidden' }}>
        <table className="ss-table">
          <thead>
            <tr>
              <th>Currency</th>
              <th className="ss-right">Rate to {baseCurrency}</th>
              <th className="ss-right">1 {baseCurrency} =</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="ss-empty">
                  {busy ? 'Loading exchange rates…' : 'No exchange rates available for the enabled currencies.'}
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <tr key={r.currency}>
                <td>
                  <span className="ss-module-cell">
                    <strong>{r.currency}</strong>
                    <span className="ss-hint">{r.symbol}</span>
                  </span>
                </td>
                <td className="ss-right ss-num">{r.symbol}{r.rate.toFixed(Number(rateRounding) || 4)}</td>
                <td className="ss-right ss-hint">{r.rate > 0 ? `1 ${baseCurrency} = ${r.currency} ${(1 / r.rate).toFixed(Number(rateRounding) || 4)}` : '—'}</td>
                <td>
                  {r.rate > 0
                    ? <span className="ss-inline" style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}><Check size={12} /> Live</span>
                    : <span className="ss-hint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function SalesSettings() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  /* Active section lives in the URL (?section=…) so a direct link and a
     browser refresh both land on the right section, exactly like a route —
     while the in-page rail keeps PDE's internal-section interaction model. */
  const requested = searchParams.get('section');
  const section = SECTION_KEYS.includes(requested) ? requested : 'overview';
  const setSection = useCallback((key) => {
    const next = new URLSearchParams(searchParams);
    if (!key || key === 'overview') next.delete('section');
    else next.set('section', key);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const [settings, setSettings] = useState(null);      // the DRAFT being edited
  const [savedSettings, setSavedSettings] = useState(null); // last saved baseline
  const [loading, setLoading] = useState(true);
  const [banner, setBanner] = useState(null);
  const [saveState, setSaveState] = useState('idle');  // idle | saving | saved
  const [importing, setImporting] = useState(false);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [docDefaultVisibility, setDocDefaultVisibility] = useState('ADMIN_ONLY');
  const [savingDocVisibility, setSavingDocVisibility] = useState(false);
  const isAdminUser = String(getStoredUser()?.role || '').toUpperCase() === 'ADMIN';

  /* ===== Access Management state (ADMIN only) =====
     Sales Access Management is its own backend resource (/sales/access), saved
     independently of the settings document below: a permission change must
     never rewrite the configuration, and vice versa. */
  const [accessOptions, setAccessOptions] = useState(null);
  const [accessScope, setAccessScope] = useState({ type: 'ROLE', key: '' });
  const [accessScopeData, setAccessScopeData] = useState(null);
  const [accessDraft, setAccessDraft] = useState(null);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessError, setAccessError] = useState(null);
  const [confirmAccessReset, setConfirmAccessReset] = useState(false);
  // Unsaved-permission guards: there is no autosave, so leaving the section is
  // the one place a permission edit can be lost.
  const [pendingSection, setPendingSection] = useState(null);
  const [confirmDiscardAccess, setConfirmDiscardAccess] = useState(false);

  // The rail is unchanged for everyone else: an ADMIN-only item (Access
  // Management) is the only thing this filter removes.
  const navGroups = useMemo(() => (isAdminUser
    ? NAV_GROUPS
    : NAV_GROUPS
      .map((group) => ({ ...group, items: group.items.filter((item) => !item.adminOnly) }))
      .filter((group) => group.items.length > 0)), [isAdminUser]);

  const notify = useCallback((tone, text) => setBanner({ tone, text }), []);

  /* ── Load the persisted configuration ───────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await salesSettingsService.getSettings();
      setSettings(clone(data));
      setSavedSettings(clone(data));
      setBanner(null);
    } catch (err) {
      setSettings(null);
      setBanner({
        tone: 'error',
        text: err?.response?.data?.message || err?.message || 'Failed to load Sales Settings.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { queueMicrotask(load); }, [load]);

  /* Document default visibility is its own backend setting; load it in place
     and keep the existing default when the call fails. The read is ADMIN-only
     server-side, so it is kept out of the global error page: a user who may
     only VIEW Sales Settings keeps the page (the control stays disabled below)
     instead of being replaced by "Access Denied". */
  useEffect(() => {
    let cancelled = false;
    documentSettingsService.get({ suppressGlobalError: true })
      .then((data) => { if (!cancelled && data?.defaultVisibility) setDocDefaultVisibility(data.defaultVisibility); })
      .catch(() => { /* keep the current value; the control reports its own errors on save */ });
    return () => { cancelled = true; };
  }, []);

  /* ── Unsaved-changes tracking (the PDE dirty model) ─────────────── */
  const isDirty = useMemo(() => {
    if (!settings || !savedSettings) return false;
    try { return JSON.stringify(settings) !== JSON.stringify(savedSettings); } catch { return false; }
  }, [settings, savedSettings]);

  /* Health is scored from the SAVED document, never the draft. */
  const health = useMemo(
    () => (savedSettings ? salesSettingsService.getConfigHealth(savedSettings) : null),
    [savedSettings]
  );

  const update = useCallback((patch) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveState('idle');
  }, []);

  const updateNested = useCallback((sectionKey, field, value) => {
    setSettings((prev) => (prev ? { ...prev, [sectionKey]: { ...prev[sectionKey], [field]: value } } : prev));
    setSaveState('idle');
  }, []);

  /* ── SAVE — persist first, confirm after ────────────────────────── */
  const save = useCallback(async () => {
    if (!settings) return;
    setSaveState('saving');
    setBanner(null);
    try {
      const updated = await salesSettingsService.updateSettings(clone(settings));
      setSettings(clone(updated));
      setSavedSettings(clone(updated));
      setSaveState('saved');
      setBanner({ tone: 'success', text: 'Settings saved. Every Sales screen now uses the new configuration.' });
      window.setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 2500);
    } catch (err) {
      setSaveState('idle');
      const status = err?.response?.status;
      setBanner({
        tone: 'error',
        text: status === 403
          ? 'Only an ADMIN can change Sales Settings.'
          : (err?.response?.data?.message || err?.message || 'Failed to save settings — nothing was changed.')
      });
    }
  }, [settings]);

  /* ── RESET CHANGES — discard the draft, keep the stored settings ── */
  const resetChanges = useCallback(() => {
    if (!savedSettings) return;
    setSettings(clone(savedSettings));
    setSaveState('idle');
    setBanner({ tone: 'info', text: 'Unsaved changes discarded — the last saved settings are back.' });
  }, [savedSettings]);

  /* ── RESET ALL — factory defaults, confirmed, counters preserved ── */
  const resetAll = useCallback(async () => {
    setResetBusy(true);
    try {
      const defaults = await salesSettingsService.resetSettings();
      setSettings(clone(defaults));
      setSavedSettings(clone(defaults));
      setSaveState('idle');
      setConfirmResetAll(false);
      setBanner({ tone: 'success', text: 'All Sales settings were restored to their factory defaults. Document numbering counters were preserved.' });
    } catch (err) {
      setConfirmResetAll(false);
      const status = err?.response?.status;
      setBanner({
        tone: 'error',
        text: status === 403
          ? 'Only an ADMIN can change Sales Settings.'
          : (err?.response?.data?.message || err?.message || 'Reset failed — nothing was changed.')
      });
    } finally {
      setResetBusy(false);
    }
  }, []);

  /* ── EXPORT — the saved document, as a JSON backup ──────────────── */
  const handleExport = useCallback(() => {
    try {
      const json = salesSettingsService.exportSettings();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sales-settings-backup.json';
      a.click();
      URL.revokeObjectURL(url);
      notify('success', 'Settings exported.');
    } catch (err) {
      notify('error', err?.message || 'Could not export settings.');
    }
  }, [notify]);

  /* ── IMPORT — parse + validate first, then persist ──────────────── */
  const applyImport = useCallback(async (jsonText) => {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      notify('error', 'The file was rejected — it is not valid JSON. No settings were changed.');
      return;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      notify('error', 'The file was rejected — expected a settings object. No settings were changed.');
      return;
    }
    const known = SECTION_KEYS.some((key) => Object.prototype.hasOwnProperty.call(parsed, key));
    if (!known) {
      notify('error', 'The file was rejected — it contains no recognisable Sales Settings section. No settings were changed.');
      return;
    }
    setImporting(true);
    try {
      const updated = await salesSettingsService.importSettings(jsonText);
      setSettings(clone(updated));
      setSavedSettings(clone(updated));
      setSaveState('idle');
      notify('success', 'Settings imported, validated and saved.');
    } catch (err) {
      const status = err?.response?.status;
      notify('error', status === 403
        ? 'Only an ADMIN can change Sales Settings.'
        : (err?.response?.data?.message || err?.message || 'The file was rejected — no settings were changed.'));
    } finally {
      setImporting(false);
    }
  }, [notify]);

  const handleImport = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => { applyImport(String(ev.target?.result ?? '')); };
      reader.readAsText(file);
    };
    input.click();
  }, [applyImport]);

  const handleDocVisibilityChange = async (value) => {
    const previous = docDefaultVisibility;
    setDocDefaultVisibility(value);
    setSavingDocVisibility(true);
    try {
      const data = await documentSettingsService.updateDefaultVisibility(value);
      if (data?.defaultVisibility) setDocDefaultVisibility(data.defaultVisibility);
      notify('success', 'Default document visibility saved.');
    } catch (err) {
      setDocDefaultVisibility(previous);
      const status = err?.response?.status;
      notify('error', status === 403
        ? 'Only an ADMIN can change document settings.'
        : (err?.response?.data?.message || 'Failed to save default visibility.'));
    } finally {
      setSavingDocVisibility(false);
    }
  };

  /* ================================================================ */
  /*  OVERVIEW                                                         */
  /* ================================================================ */
  const renderOverview = () => {
    if (!health) return null;
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
            const sec = SECTION_BY_KEY[check.key];
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
                  {!check.configured && check.hint && (
                    <span className="ss-status-hint" style={{ display: 'block' }}>{check.hint}</span>
                  )}
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
    const fields = [
      { label: 'Default Sales Executive', field: 'defaultSalesExecutive', placeholder: 'Enter name…' },
      { label: 'Default Currency', field: 'defaultCurrency', type: 'select', options: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY'] },
      { label: 'Default Payment Terms', field: 'defaultPaymentTerms', type: 'select', options: ['Advance', 'COD', '7 Days', '15 Days', '30 Days', '45 Days', '60 Days'] },
      { label: 'Default Delivery Terms', field: 'defaultDeliveryTerms', type: 'select', options: ['Ex-Works', 'FOB', 'CIF', 'CFR', 'FOR', 'Door Delivery'] },
      { label: 'Default Tax Type', field: 'defaultTaxType', type: 'select', options: ['GST', 'IGST', 'VAT', 'No Tax'] },
      { label: 'Default Country', field: 'defaultCountry' },
      { label: 'Default State', field: 'defaultState' },
      { label: 'Default Number Format', field: 'defaultNumberFormat', type: 'select', options: ['Indian', 'International', 'European'] },
      { label: 'Default Sales Status', field: 'defaultSalesStatus', type: 'select', options: ['Draft', 'Pending', 'Active', 'Submitted'] },
      { label: 'Default Priority', field: 'defaultPriority', type: 'select', options: ['High', 'Medium', 'Low'] },
      { label: 'Default Validity Days', field: 'defaultValidityDays', type: 'number' }
    ];
    return (
      <Card title="Sales Document Defaults" aside="Applied to new Sales documents">
        <div className="ss-grid">
          {fields.map((f) => (
            <div className="ss-field" key={f.field}>
              <label className="ss-label" htmlFor={`general-${f.field}`}>{f.label}</label>
              {f.type === 'select' ? (
                <select id={`general-${f.field}`} className="ss-select" value={g[f.field] || ''} onChange={setF(f.field)}>
                  <option value="">Select…</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  id={`general-${f.field}`}
                  className="ss-input"
                  type={f.type === 'number' ? 'number' : 'text'}
                  value={g[f.field] ?? ''}
                  placeholder={f.placeholder}
                  onChange={setF(f.field)}
                />
              )}
            </div>
          ))}
          <div className="ss-field" style={{ gridColumn: '1 / -1' }}>
            <label className="ss-label" htmlFor="general-discount">Default Discount Policy</label>
            <textarea id="general-discount" className="ss-input" rows={3} value={g.defaultDiscountPolicy || ''} onChange={setF('defaultDiscountPolicy')} />
          </div>
        </div>
      </Card>
    );
  };

  /* ================================================================ */
  /*  APPROVAL & WORKFLOW                                              */
  /* ================================================================ */
  const renderApproval = () => {
    const a = settings?.approval || {};
    const matrix = a.levels || [];
    const setLevel = (index, patch) => {
      const next = matrix.map((row) => ({ ...row }));
      next[index] = { ...next[index], ...patch };
      update({ approval: { ...a, levels: next } });
    };
    const moveLevel = (index, dir) => {
      const next = matrix.map((row) => ({ ...row }));
      const target = index + dir;
      if (target < 0 || target >= next.length) return;
      [next[index], next[target]] = [next[target], next[index]];
      next.forEach((row, i) => { row.level = i + 1; });
      update({ approval: { ...a, levels: next } });
    };
    return (
      <>
        <Card title="Approval Requirements">
          {[
            ['quotationApproval', 'Quotation Approval Required'],
            ['salesContractApproval', 'Sales Contract Approval Required'],
            ['salesOrderApproval', 'Customer Purchase Order Approval Required'],
            ['creditNoteApproval', 'Credit Note Approval Required']
          ].map(([field, label]) => (
            <ToggleRow key={field} label={label} checked={!!a[field]} onChange={(v) => updateNested('approval', field, v)} />
          ))}
        </Card>

        <Card title="Approval Levels" aside={`${matrix.length} level${matrix.length === 1 ? '' : 's'}`} flush>
          <table className="ss-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ width: 110 }}>Level</th>
                <th>Approver Role</th>
                <th className="ss-right">Min Amount</th>
                <th className="ss-right">Max Amount</th>
                <th className="ss-center">Days</th>
                <th className="ss-center">Active</th>
                <th className="ss-center" style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {matrix.length === 0 && (
                <tr><td colSpan={7} className="ss-empty">No approval levels configured.</td></tr>
              )}
              {matrix.map((row, index) => (
                <tr key={row.level || index}>
                  <td><strong>Level {row.level || index + 1}</strong></td>
                  <td>
                    <input
                      className="ss-input ss-input-sm"
                      style={{ maxWidth: 200 }}
                      value={row.role || ''}
                      onChange={(e) => setLevel(index, { role: e.target.value })}
                      aria-label={`Level ${index + 1} approver role`}
                    />
                  </td>
                  <td className="ss-right">
                    <input
                      className="ss-input ss-input-sm ss-right"
                      style={{ maxWidth: 130 }}
                      type="number"
                      value={row.minAmount ?? 0}
                      onChange={(e) => setLevel(index, { minAmount: Number(e.target.value) || 0 })}
                      aria-label={`Level ${index + 1} minimum amount`}
                    />
                  </td>
                  <td className="ss-right">
                    <input
                      className="ss-input ss-input-sm ss-right"
                      style={{ maxWidth: 130 }}
                      type="number"
                      placeholder="0 = No limit"
                      value={row.maxAmount ?? 0}
                      onChange={(e) => setLevel(index, { maxAmount: Number(e.target.value) || 0 })}
                      aria-label={`Level ${index + 1} maximum amount`}
                    />
                  </td>
                  <td className="ss-center">
                    <input
                      className="ss-input ss-input-sm ss-center"
                      style={{ maxWidth: 70 }}
                      type="number"
                      value={row.days ?? 2}
                      onChange={(e) => setLevel(index, { days: Number(e.target.value) || 0 })}
                      aria-label={`Level ${index + 1} days`}
                    />
                  </td>
                  <td className="ss-center">
                    <Toggle checked={row.enabled !== false} onChange={(v) => setLevel(index, { enabled: v })} />
                  </td>
                  <td className="ss-center">
                    <span className="ss-inline" style={{ justifyContent: 'center' }}>
                      <IconButton icon={ArrowUp} label="Move level up" onClick={() => moveLevel(index, -1)} disabled={index === 0} />
                      <IconButton icon={ArrowDown} label="Move level down" onClick={() => moveLevel(index, 1)} disabled={index === matrix.length - 1} />
                      <IconButton
                        icon={Trash2}
                        label={`Remove level ${index + 1}`}
                        tone="danger"
                        onClick={() => {
                          const next = matrix.filter((_, i) => i !== index).map((r, i) => ({ ...r, level: i + 1 }));
                          update({ approval: { ...a, levels: next } });
                        }}
                      />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <button
          type="button"
          className="ss-add-btn"
          onClick={() => update({
            approval: {
              ...a,
              levels: [...matrix, { level: matrix.length + 1, role: '', minAmount: 0, maxAmount: 0, days: 2, enabled: true }]
            }
          })}
        >
          <Plus size={14} /> Add Level
        </button>
      </>
    );
  };

  /* ================================================================ */
  /*  TAX SETTINGS                                                     */
  /* ================================================================ */
  const renderTax = () => {
    const taxSettings = settings?.taxSettings || {};
    const taxes = taxSettings.taxRates || [];
    const active = taxes.filter((t) => t.active !== false);
    const avgRate = active.length > 0 ? (active.reduce((sum, t) => sum + (Number(t.rate) || 0), 0) / active.length).toFixed(1) : '0';
    const setRows = (next) => update({ taxSettings: { ...taxSettings, taxRates: next } });
    const setRow = (index, patch) => {
      const next = taxes.map((row) => ({ ...row }));
      next[index] = { ...next[index], ...patch };
      setRows(next);
    };
    return (
      <>
        <div className="ss-kpis">
          {[
            { label: 'Total Rates', value: taxes.length },
            { label: 'Active', value: active.length },
            { label: 'Inactive', value: taxes.length - active.length },
            { label: 'Average Rate', value: `${avgRate}%` }
          ].map((stat) => (
            <div className="ss-kpi" key={stat.label}>
              <div className="ss-kpi-value">{stat.value}</div>
              <div className="ss-kpi-label">{stat.label}</div>
            </div>
          ))}
        </div>

        <Card title="Tax Rates" aside={`${taxes.length} configured`} flush>
          <table className="ss-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th className="ss-right" style={{ width: 110 }}>Rate %</th>
                <th>Label</th>
                <th className="ss-right">CGST %</th>
                <th className="ss-right">SGST %</th>
                <th className="ss-center">Active</th>
                <th className="ss-center">Default</th>
                <th className="ss-center" style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {taxes.length === 0 && (
                <tr><td colSpan={7} className="ss-empty">No tax rates configured.</td></tr>
              )}
              {taxes.map((row, index) => (
                <tr key={`${row.label || 'rate'}-${index}`}>
                  <td className="ss-right">
                    <input
                      className="ss-input ss-input-sm ss-right"
                      style={{ maxWidth: 90 }}
                      type="number"
                      value={row.rate ?? 0}
                      onChange={(e) => {
                        const rate = Number(e.target.value) || 0;
                        setRow(index, { rate, cgst: rate / 2, sgst: rate / 2 });
                      }}
                      aria-label={`Tax rate ${index + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      className="ss-input ss-input-sm"
                      style={{ maxWidth: 220 }}
                      value={row.label || ''}
                      onChange={(e) => setRow(index, { label: e.target.value })}
                      aria-label={`Tax label ${index + 1}`}
                    />
                  </td>
                  <td className="ss-right ss-num">{row.cgst ?? 0}%</td>
                  <td className="ss-right ss-num">{row.sgst ?? 0}%</td>
                  <td className="ss-center">
                    <Toggle checked={row.active !== false} onChange={(v) => setRow(index, { active: v })} />
                  </td>
                  <td className="ss-center">
                    <input
                      type="radio"
                      name="tax-default"
                      className="ss-radio"
                      checked={!!row.default}
                      onChange={() => setRows(taxes.map((t, i) => ({ ...t, default: i === index })))}
                      aria-label={`Make ${row.label || `rate ${index + 1}`} the default`}
                    />
                  </td>
                  <td className="ss-center">
                    <IconButton
                      icon={Trash2}
                      label={`Remove tax rate ${row.label || index + 1}`}
                      tone="danger"
                      onClick={() => setRows(taxes.filter((_, i) => i !== index))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <button
          type="button"
          className="ss-add-btn"
          onClick={() => setRows([...taxes, { rate: 0, label: 'New Tax', cgst: 0, sgst: 0, active: true, default: false }])}
        >
          <Plus size={14} /> Add Tax Rate
        </button>
      </>
    );
  };

  /* ================================================================ */
  /*  CURRENCY & EXCHANGE RATES                                        */
  /* ================================================================ */
  const renderCurrency = () => {
    const c = settings?.currencySettings || {};
    const enabled = c.enabledCurrencies || ['INR'];
    const baseCurrency = settings?.exchangeRates?.baseCurrency || c.displayCurrency || 'INR';
    const updateCurr = (field, value) => updateNested('currencySettings', field, value);
    return (
      <>
        <Card title={<><Coins size={14} /> Currency &amp; Number Format</>} aside="Display and calculation preferences">
          <div className="ss-grid">
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-display">Display Currency</label>
              <select id="curr-display" className="ss-select" value={c.displayCurrency || ''} onChange={(e) => updateCurr('displayCurrency', e.target.value)}>
                {ALL_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </div>
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-symbol">Custom Currency Symbol</label>
              <input id="curr-symbol" className="ss-input" value={c.customCurrencySymbol || ''} onChange={(e) => updateCurr('customCurrencySymbol', e.target.value)} placeholder="Auto" />
            </div>
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-decimals">Decimal Digits</label>
              <input id="curr-decimals" className="ss-input" type="number" value={c.decimalDigits ?? 2} onChange={(e) => updateCurr('decimalDigits', Number(e.target.value) || 0)} />
            </div>
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-system">Number System</label>
              <select id="curr-system" className="ss-select" value={c.numberSystem || 'Indian'} onChange={(e) => updateCurr('numberSystem', e.target.value)}>
                <option>Indian</option>
                <option>International</option>
                <option>European</option>
              </select>
            </div>
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-qty">Quantity Rounding</label>
              <input id="curr-qty" className="ss-input" type="number" value={c.quantityRounding ?? 2} onChange={(e) => updateCurr('quantityRounding', Number(e.target.value) || 0)} />
            </div>
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-rate">Rate Rounding</label>
              <input id="curr-rate" className="ss-input" type="number" value={c.rateRounding ?? 4} onChange={(e) => updateCurr('rateRounding', Number(e.target.value) || 0)} />
            </div>
            <div className="ss-field">
              <label className="ss-label" htmlFor="curr-position">Symbol Position</label>
              <select id="curr-position" className="ss-select" value={c.symbolPosition || 'before'} onChange={(e) => updateCurr('symbolPosition', e.target.value)}>
                <option value="before">Before (₹ 100)</option>
                <option value="after">After (100 ₹)</option>
                <option value="none">None</option>
              </select>
            </div>
            <ToggleRow label="Thousand Separator" checked={c.thousandSeparator !== false} onChange={(v) => updateCurr('thousandSeparator', v)} />
          </div>
        </Card>

        <Card title={<><Banknote size={14} /> Supported Currencies</>} aside="Available across Sales modules">
          <div className="ss-tabs" style={{ marginBottom: 0 }}>
            {ALL_CURRENCIES.map((code) => {
              const isSelected = enabled.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  className={`ss-tab${isSelected ? ' active' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    const next = isSelected ? enabled.filter((x) => x !== code) : [...enabled, code];
                    if (next.length === 0) return; // at least one currency must stay enabled
                    updateCurr('enabledCurrencies', next);
                  }}
                >
                  <strong>{CURRENCY_SYMBOLS[code] || code}</strong> {code}
                  {isSelected && <Check size={12} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </Card>

        <Card title={<><RefreshCw size={14} /> Exchange Rates</>} aside="Synchronized from the configured provider">
          <ExchangeRatesPanel
            rateRounding={c.rateRounding}
            enabledCurrencies={enabled}
            baseCurrency={baseCurrency}
            autoSync={c.autoSyncEnabled !== false}
            frequency={c.syncFrequency || 'daily'}
            onAutoSyncChange={(v) => updateCurr('autoSyncEnabled', v)}
            onFrequencyChange={(v) => updateCurr('syncFrequency', v)}
            notify={notify}
          />
        </Card>
      </>
    );
  };

  /* ================================================================ */
  /*  PAYMENT TERMS                                                    */
  /* ================================================================ */
  const renderPayment = () => {
    const terms = settings?.paymentTerms || [];
    const setRows = (next) => update({ paymentTerms: next });
    const setRow = (index, patch) => {
      const next = terms.map((row) => ({ ...row }));
      next[index] = { ...next[index], ...patch };
      setRows(next);
    };
    return (
      <>
        <Card title="Payment Terms" aside={`${terms.length} configured`} flush>
          <table className="ss-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th className="ss-right" style={{ width: 110 }}>Credit Days</th>
                <th className="ss-right" style={{ width: 110 }}>Advance %</th>
                <th className="ss-right">Balance %</th>
                <th className="ss-center">Active</th>
                <th className="ss-center">Default</th>
                <th className="ss-center" style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {terms.length === 0 && (
                <tr><td colSpan={7} className="ss-empty">No payment terms configured.</td></tr>
              )}
              {terms.map((row, index) => (
                <tr key={`${row.name || 'term'}-${index}`}>
                  <td>
                    <input
                      className="ss-input ss-input-sm"
                      style={{ maxWidth: 200 }}
                      value={row.name || ''}
                      onChange={(e) => setRow(index, { name: e.target.value })}
                      aria-label={`Payment term ${index + 1} name`}
                    />
                  </td>
                  <td className="ss-right">
                    <input
                      className="ss-input ss-input-sm ss-right"
                      style={{ maxWidth: 90 }}
                      type="number"
                      value={row.days ?? 0}
                      onChange={(e) => setRow(index, { days: Number(e.target.value) || 0 })}
                      aria-label={`Payment term ${index + 1} credit days`}
                    />
                  </td>
                  <td className="ss-right">
                    <input
                      className="ss-input ss-input-sm ss-right"
                      style={{ maxWidth: 90 }}
                      type="number"
                      value={row.advancePercent ?? 0}
                      onChange={(e) => {
                        const adv = Number(e.target.value) || 0;
                        setRow(index, { advancePercent: adv, balancePercent: 100 - adv });
                      }}
                      aria-label={`Payment term ${index + 1} advance percent`}
                    />
                  </td>
                  <td className="ss-right ss-num">{row.balancePercent ?? 100}%</td>
                  <td className="ss-center">
                    <Toggle checked={row.active !== false} onChange={(v) => setRow(index, { active: v })} />
                  </td>
                  <td className="ss-center">
                    <input
                      type="radio"
                      name="payment-default"
                      className="ss-radio"
                      checked={!!row.default}
                      onChange={() => setRows(terms.map((t, i) => ({ ...t, default: i === index })))}
                      aria-label={`Make ${row.name || `term ${index + 1}`} the default`}
                    />
                  </td>
                  <td className="ss-center">
                    <IconButton
                      icon={Trash2}
                      label={`Remove payment term ${row.name || index + 1}`}
                      tone="danger"
                      onClick={() => setRows(terms.filter((_, i) => i !== index))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <button
          type="button"
          className="ss-add-btn"
          onClick={() => setRows([...terms, { name: 'New Term', days: 30, advancePercent: 0, balancePercent: 100, active: true, default: false }])}
        >
          <Plus size={14} /> Add Payment Term
        </button>
      </>
    );
  };

  /* ================================================================ */
  /*  DELIVERY & LOGISTICS                                             */
  /* ================================================================ */
  const renderDelivery = () => {
    const d = settings?.deliveryTerms || [];
    const t = settings?.transportCompanies || [];
    const listCard = (title, aside, rows, key) => (
      <>
        <Card title={title} aside={aside} flush>
          <table className="ss-table" style={{ minWidth: 480 }}>
            <thead>
              <tr>
                <th>Name</th>
                <th className="ss-center" style={{ width: 100 }}>Active</th>
                <th className="ss-center" style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={3} className="ss-empty">Nothing configured yet.</td></tr>
              )}
              {rows.map((row, i) => (
                <tr key={`${key}-${i}`}>
                  <td>
                    <input
                      className="ss-input ss-input-sm"
                      style={{ maxWidth: 240 }}
                      value={row.name || ''}
                      onChange={(e) => {
                        const next = rows.map((x) => ({ ...x }));
                        next[i] = { ...next[i], name: e.target.value };
                        update({ [key]: next });
                      }}
                      aria-label={`${title} entry ${i + 1}`}
                    />
                  </td>
                  <td className="ss-center">
                    <Toggle
                      checked={row.active !== false}
                      onChange={(v) => {
                        const next = rows.map((x) => ({ ...x }));
                        next[i] = { ...next[i], active: v };
                        update({ [key]: next });
                      }}
                    />
                  </td>
                  <td className="ss-center">
                    <IconButton
                      icon={Trash2}
                      label={`Remove ${row.name || `${title} entry ${i + 1}`}`}
                      tone="danger"
                      onClick={() => update({ [key]: rows.filter((_, idx) => idx !== i) })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <button
          type="button"
          className="ss-add-btn"
          onClick={() => update({ [key]: [...rows, { name: key === 'deliveryTerms' ? 'New Term' : 'New Company', active: true }] })}
          style={{ marginBottom: 16 }}
        >
          <Plus size={14} /> Add {key === 'deliveryTerms' ? 'Delivery Term' : 'Transport Company'}
        </button>
      </>
    );
    return (
      <>
        {listCard('Delivery Terms', `${d.length} configured`, d, 'deliveryTerms')}
        {listCard('Transport Companies', `${t.length} configured`, t, 'transportCompanies')}
      </>
    );
  };

  /* ================================================================ */
  /*  DOCUMENT NUMBERING                                               */
  /* ================================================================ */
  const renderNumbering = () => {
    const numbering = settings?.documentNumbering || {};
    const fy = currentFy();
    const docTypes = [
      { key: 'Quotation', label: 'Quotation' },
      { key: 'SalesContract', label: 'Sales Contract' },
      { key: 'SalesOrder', label: 'Customer Purchase Order' },
      { key: 'ProformaInvoice', label: 'Proforma Invoice' },
      { key: 'DeliveryChallan', label: 'Delivery Challan' },
      { key: 'Invoice', label: 'Invoice' },
      { key: 'CreditNote', label: 'Credit Note' },
      { key: 'PaymentReceipt', label: 'Payment Receipt' }
    ];
    const setCfg = (key, cfg, patch) => update({ documentNumbering: { ...numbering, [key]: { ...cfg, ...patch } } });
    return (
      <Card title="Document Numbering" aside="Prefix, financial year and sequence length" flush>
        <table className="ss-table" style={{ minWidth: 760 }}>
          <thead>
            <tr>
              <th>Document Type</th>
              <th style={{ width: 120 }}>Prefix</th>
              <th style={{ width: 110 }}>Financial Year</th>
              <th className="ss-right" style={{ width: 110 }}>Current No</th>
              <th className="ss-center" style={{ width: 110 }}>Padding</th>
              <th style={{ width: 190 }}>Next Number (preview)</th>
            </tr>
          </thead>
          <tbody>
            {docTypes.map(({ key, label }) => {
              const cfg = numbering[key] || { prefix: key.substring(0, 3).toUpperCase(), fy, startNo: 1, currentNo: 0, padding: 4 };
              const cfgFy = cfg.fy || fy;
              const padding = Math.max(1, Number(cfg.padding) || 4);
              const preview = `${cfg.prefix || 'DOC'}-${cfgFy}-${String((Number(cfg.currentNo) || 0) + 1).padStart(padding, '0')}`;
              return (
                <tr key={key}>
                  <td><strong>{label}</strong></td>
                  <td>
                    <input
                      className="ss-input ss-input-sm"
                      style={{ maxWidth: 100 }}
                      value={cfg.prefix || ''}
                      onChange={(e) => setCfg(key, cfg, { prefix: e.target.value })}
                      aria-label={`${label} prefix`}
                    />
                  </td>
                  <td>
                    <input
                      className="ss-input ss-input-sm"
                      style={{ maxWidth: 100 }}
                      value={cfgFy}
                      onChange={(e) => setCfg(key, cfg, { fy: e.target.value })}
                      aria-label={`${label} financial year`}
                    />
                  </td>
                  <td className="ss-right ss-num">{Number(cfg.currentNo) || 0}</td>
                  <td className="ss-center">
                    <input
                      className="ss-input ss-input-sm ss-center"
                      style={{ maxWidth: 70 }}
                      type="number"
                      min={1}
                      value={cfg.padding ?? 4}
                      onChange={(e) => setCfg(key, cfg, { padding: Math.max(1, Number(e.target.value) || 1) })}
                      aria-label={`${label} padding`}
                    />
                  </td>
                  <td><span className="ss-mono">{preview}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    );
  };

  /* ================================================================ */
  /*  PDF / DOCUMENT DEFAULTS                                          */
  /* ================================================================ */
  const renderPdf = () => {
    const d = settings?.documentDefaults || {};
    const updatePdf = (field, value) => updateNested('documentDefaults', field, value);
    const flags = [
      { label: 'Show HSN', field: 'showHSN' },
      { label: 'Show HSN Summary', field: 'showHSNSummary' },
      { label: 'Show Tax Summary', field: 'showTaxSummary' },
      { label: 'Show Total', field: 'showTotal' },
      { label: 'Show Serial Number', field: 'showSerialNumber' },
      { label: 'Show Batch', field: 'showBatch' },
      { label: 'Show Unit', field: 'showUnit' },
      { label: 'Show Description', field: 'showDescription' },
      { label: 'Show Images', field: 'showImages' },
      { label: 'Show Thumbnails', field: 'showThumbnails' },
      { label: 'Show Company Logo', field: 'showCompanyLogo' },
      { label: 'Show GSTIN', field: 'showGstin' },
      { label: 'Show Bank Details', field: 'showBankDetails' },
      { label: 'Show Signature', field: 'signature' }
    ];
    return (
      <>
        <Card title="Printed Content" aside="Applies to new document output">
          <div className="ss-grid">
            {flags.map((flag) => (
              <ToggleRow key={flag.field} label={flag.label} checked={!!d[flag.field]} onChange={(v) => updatePdf(flag.field, v)} />
            ))}
          </div>
        </Card>

        <Card title="Footer & Terms">
          <div className="ss-field" style={{ marginBottom: 14 }}>
            <label className="ss-label" htmlFor="pdf-signature-label">Signature Label</label>
            <input id="pdf-signature-label" className="ss-input" value={d.signatureLabel || ''} onChange={(e) => updatePdf('signatureLabel', e.target.value)} placeholder="Authorized Signatory" />
          </div>
          <div className="ss-field" style={{ marginBottom: 14 }}>
            <label className="ss-label" htmlFor="pdf-terms">Terms &amp; Conditions</label>
            <textarea id="pdf-terms" className="ss-input" rows={3} value={d.termsAndConditions || ''} onChange={(e) => updatePdf('termsAndConditions', e.target.value)} />
          </div>
          <div className="ss-field">
            <label className="ss-label" htmlFor="pdf-footer">Footer Text</label>
            <textarea id="pdf-footer" className="ss-input" rows={2} value={d.footer || ''} onChange={(e) => updatePdf('footer', e.target.value)} />
          </div>
        </Card>

        <Card title="Document Visibility" aside="Saved immediately">
          <div className="ss-row" style={{ borderBottom: 0 }}>
            <span style={{ minWidth: 0 }}>
              <span className="ss-row-label" style={{ display: 'block' }}>Default Visibility for New General Documents</span>
              <span className="ss-hint">
                Applied when a general document is created without a specific visibility. Existing documents are never changed.
              </span>
            </span>
            <select
              className="ss-select"
              style={{ maxWidth: 220 }}
              value={docDefaultVisibility}
              disabled={savingDocVisibility || !isAdminUser}
              onChange={(e) => handleDocVisibilityChange(e.target.value)}
              aria-label="Default document visibility"
            >
              {DOCUMENT_VISIBILITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          {!isAdminUser && <p className="ss-hint" style={{ margin: '8px 0 0' }}>Only an ADMIN can change document settings.</p>}
        </Card>
      </>
    );
  };

  /* ================================================================ */
  /*  NOTIFICATIONS                                                    */
  /* ================================================================ */
  const renderNotifications = () => {
    const n = settings?.notifications || {};
    const toggles = [
      ['quotationPendingApproval', 'Quotation Pending Approval'],
      ['quotationExpiring', 'Quotation Expiring'],
      ['quotationAccepted', 'Quotation Accepted'],
      ['salesContractPendingApproval', 'Sales Contract Pending Approval'],
      ['salesOrderPendingApproval', 'Customer Purchase Order Pending Approval'],
      ['invoiceOverdue', 'Invoice Overdue'],
      ['paymentReceived', 'Payment Received'],
      ['creditNotePendingApproval', 'Credit Note Pending Approval'],
      ['emailNotifications', 'Email Notifications'],
      ['browserNotifications', 'Browser Notifications']
    ];
    return (
      <Card title="Sales Notification Events" aside="Applies to the signed-in role">
        {toggles.map(([field, label]) => (
          <ToggleRow key={field} label={label} checked={!!n[field]} onChange={(v) => updateNested('notifications', field, v)} />
        ))}
      </Card>
    );
  };

  /* ================================================================ */
  /*  SALES MASTERS                                                    */
  /* ================================================================ */
  const renderMasters = () => {
    const m = settings?.masters || {};
    const masters = [
      { key: 'salesExecutives', label: 'Sales Executives' },
      { key: 'paymentModes', label: 'Payment Modes' },
      { key: 'creditNoteReasons', label: 'Credit Note Reasons' },
      { key: 'warrantyPeriods', label: 'Warranty Periods' },
      { key: 'contractDurations', label: 'Contract Durations' }
    ];
    return (
      <>
        {masters.map(({ key, label }) => {
          const items = m[key] || [];
          return (
            <div key={key}>
              <Card title={label} aside={`${items.length} entr${items.length === 1 ? 'y' : 'ies'}`} flush>
                <table className="ss-table" style={{ minWidth: 480 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="ss-center" style={{ width: 100 }}>Active</th>
                      <th className="ss-center" style={{ width: 90 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={3} className="ss-empty">Nothing configured yet.</td></tr>
                    )}
                    {items.map((row, i) => (
                      <tr key={`${key}-${i}`}>
                        <td>
                          <input
                            className="ss-input ss-input-sm"
                            style={{ maxWidth: 240 }}
                            value={row.name || ''}
                            onChange={(e) => {
                              const next = items.map((x) => ({ ...x }));
                              next[i] = { ...next[i], name: e.target.value };
                              update({ masters: { ...m, [key]: next } });
                            }}
                            aria-label={`${label} entry ${i + 1}`}
                          />
                        </td>
                        <td className="ss-center">
                          <Toggle
                            checked={row.active !== false}
                            onChange={(v) => {
                              const next = items.map((x) => ({ ...x }));
                              next[i] = { ...next[i], active: v };
                              update({ masters: { ...m, [key]: next } });
                            }}
                          />
                        </td>
                        <td className="ss-center">
                          <IconButton
                            icon={Trash2}
                            label={`Remove ${row.name || `${label} entry ${i + 1}`}`}
                            tone="danger"
                            onClick={() => update({ masters: { ...m, [key]: items.filter((_, idx) => idx !== i) } })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
              <button
                type="button"
                className="ss-add-btn"
                style={{ marginBottom: 16 }}
                onClick={() => update({ masters: { ...m, [key]: [...items, { name: 'New Item', active: true }] } })}
              >
                <Plus size={14} /> Add {label}
              </button>
            </div>
          );
        })}
      </>
    );
  };

  /* ================================================================ */
  /*  COMPANY / ORGANIZATION                                           */
  /* ================================================================ */
  const renderCompany = () => {
    const c = settings?.companyPreferences || {};
    const updateComp = (field, value) => updateNested('companyPreferences', field, value);
    // Exactly the rule the Configuration Health scores (service.getConfigHealth):
    // the flags this section owns, plus the two optional overrides.
    const companyDetailsEnabled = ['showCompanyHeader', 'showGSTIN', 'showPAN', 'letterheadEnabled']
      .some((field) => c[field] === true);
    const hasBankAccount = String(c.defaultBankAccount || '').trim().length > 0;
    const hasInvoiceFooter = String(c.invoiceFooter || '').trim().length > 0;
    const sectionComplete = companyDetailsEnabled || hasBankAccount || hasInvoiceFooter;
    return (
      <Card title="Company Details on Sales Documents" aside="Sales-scoped, other modules are untouched">
        <p className="ss-note">
          This section counts as configured once at least one company detail below is shown on Sales
          documents, or a default bank account / invoice footer is entered. Save Changes stores the
          values and the Overview recalculates its health from them.
        </p>
        {[
          ['showCompanyHeader', 'Show Company Header on Documents'],
          ['showGSTIN', 'Show GSTIN'],
          ['showPAN', 'Show PAN'],
          ['letterheadEnabled', 'Enable Letterhead']
        ].map(([field, label]) => (
          <ToggleRow key={field} label={label} checked={!!c[field]} onChange={(v) => updateComp(field, v)} />
        ))}
        <div className="ss-field" style={{ marginTop: 14 }}>
          <label className="ss-label" htmlFor="company-bank">
            Default Bank Account <span className="ss-label-optional">(optional override)</span>
          </label>
          <input id="company-bank" className="ss-input" value={c.defaultBankAccount || ''} onChange={(e) => updateComp('defaultBankAccount', e.target.value)} placeholder="Bank account details" />
        </div>
        <div className="ss-field" style={{ marginTop: 14 }}>
          <label className="ss-label" htmlFor="company-footer">
            Invoice Footer <span className="ss-label-optional">(optional override)</span>
          </label>
          <textarea id="company-footer" className="ss-input" rows={2} value={c.invoiceFooter || ''} onChange={(e) => updateComp('invoiceFooter', e.target.value)} />
        </div>
        {!sectionComplete && (
          <p className="ss-note ss-note--attention" role="status">
            This section is still incomplete: no company detail is enabled and both overrides are empty,
            so nothing would identify the company on a Sales document. Enable at least one option above, or
            enter a bank account / invoice footer, then choose Save Changes.
          </p>
        )}
      </Card>
    );
  };

  /* ================================================================ */
  /*  ACCESS MANAGEMENT (ADMIN only)                                   */
  /* ================================================================ */
  const accessDirty = Boolean(
    accessDraft && accessScopeData
    && JSON.stringify(accessDraft) !== JSON.stringify(accessScopeData.permissions || {})
  );

  /* Refresh the roles/users/areas the selectors render, and pick a sensible
     default scope on first load. ADMIN-only: for anyone else this stays empty
     and the section is not reachable at all. */
  const refreshAccessOptions = useCallback(async () => {
    if (!isAdminUser) return;
    try {
      const options = await salesAccessService.getOptions();
      setAccessOptions(options);
      setAccessScope((prev) => {
        const roles = options?.roles || [];
        const users = options?.users || [];
        if (prev.type === 'ROLE' && roles.includes(prev.key)) return prev;
        if (prev.type === 'USER' && users.some((u) => String(u.id) === String(prev.key))) return prev;
        return { type: 'ROLE', key: roles.includes('USER') ? 'USER' : (roles[0] || '') };
      });
    } catch {
      // A transient failure simply leaves the last known state — it never
      // grants anything, because the backend enforces independently.
    }
  }, [isAdminUser]);

  useEffect(() => { queueMicrotask(refreshAccessOptions); }, [refreshAccessOptions]);

  /* Load one scope's effective permissions (saved configuration, or the
     defaults it inherits today). */
  const loadAccessScope = useCallback(async (scope) => {
    if (!isAdminUser || !scope?.key) {
      setAccessScopeData(null);
      setAccessDraft(null);
      return;
    }
    setAccessLoading(true);
    setAccessError(null);
    try {
      const data = await salesAccessService.getScope(scope.type, scope.key);
      setAccessScopeData(data);
      setAccessDraft(data?.permissions || null);
    } catch (err) {
      setAccessScopeData(null);
      setAccessDraft(null);
      setAccessError(err);
    } finally {
      setAccessLoading(false);
    }
  }, [isAdminUser]);

  useEffect(() => {
    if (section === 'access') queueMicrotask(() => loadAccessScope(accessScope));
  }, [section, accessScope, loadAccessScope]);

  /* Warn before the browser closes/navigates away with unsaved permissions. */
  useEffect(() => {
    if (!accessDirty) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [accessDirty]);

  /* Leaving the section discards a draft only after an explicit confirmation. */
  const changeSection = useCallback((key) => {
    if (section === 'access' && accessDirty && key !== 'access') {
      setPendingSection(key);
      setConfirmDiscardAccess(true);
      return;
    }
    setSection(key);
  }, [section, accessDirty, setSection]);

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
      const saved = await salesAccessService.saveScope(accessScope.type, accessScope.key, accessDraft);
      setAccessScopeData(saved);
      setAccessDraft(saved?.permissions || accessDraft);
      notify('success', `Sales access saved for ${accessScope.type === 'ROLE' ? `role ${accessScope.key}` : 'the selected user'}.`);
      await refreshAccessOptions();
      // The administrator's own view is refreshed immediately so a change to
      // their own scope is reflected without a reload (the backend already
      // enforces it).
      reloadSalesAccess();
    } catch (err) {
      const status = err?.response?.status;
      notify('error', status === 403
        ? 'Only an Administrator can change Sales access.'
        : err?.message || 'Failed to save Sales access.');
    } finally {
      setAccessSaving(false);
    }
  };

  const resetAccess = async () => {
    if (!accessScope.key) return;
    setAccessSaving(true);
    try {
      const reset = await salesAccessService.resetScope(accessScope.type, accessScope.key);
      setAccessScopeData(reset);
      setAccessDraft(reset?.permissions || null);
      notify('success', 'Access reset — this scope now inherits its role defaults.');
      await refreshAccessOptions();
      reloadSalesAccess();
    } catch (err) {
      const status = err?.response?.status;
      notify('error', status === 403
        ? 'Only an Administrator can change Sales access.'
        : err?.message || 'Failed to reset Sales access.');
    } finally {
      setAccessSaving(false);
      setConfirmAccessReset(false);
    }
  };

  /**
   * Access Management — the same panel as Marketing Settings → Access
   * Management: pick a role or a single user, see whether it has a saved
   * configuration or is running on its defaults, and switch the actions that
   * genuinely exist per area. Every switch is enforced by the backend
   * (/sales/access + the Sales access interceptor); this UI is the convenience
   * layer on top of it.
   */
  const renderAccess = () => {
    if (!isAdminUser) {
      return (
        <Card title="Access Management" aside="Administrator only">
          <p className="ss-hint" style={{ margin: 0 }}>
            Only an Administrator can view or change Sales access.
          </p>
        </Card>
      );
    }

    if (accessError) {
      return (
        <div className="cpr-error-banner" role="alert">
          <p>{accessError?.message || 'Failed to load Sales access for this scope.'}</p>
          <button type="button" className="cpr-error-retry" onClick={() => loadAccessScope(accessScope)}>Try Again</button>
        </div>
      );
    }

    if (!accessOptions) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading access configuration" />
        </div>
      );
    }

    const selectedUser = (accessOptions.users || []).find((u) => String(u.id) === String(accessScope.key));
    const scopeLabel = accessScope.type === 'ROLE'
      ? `Role: ${accessScope.key}`
      : `User: ${selectedUser ? `${selectedUser.fullName} (${selectedUser.email})` : accessScope.key}`;

    return (
      <div className="space-y-5">
        {/* Scope selector — a role's configuration or one user's override */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="ss-field" style={{ margin: 0 }}>
            <span className="ss-label">Configure access for</span>
            <select
              value={accessScope.type}
              onChange={(e) => {
                const type = e.target.value;
                if (type === 'ROLE') setAccessScope({ type: 'ROLE', key: accessOptions.roles?.[0] || '' });
                else setAccessScope({
                  type: 'USER',
                  key: accessOptions.users?.[0]?.id ? String(accessOptions.users[0].id) : ''
                });
              }}
              className="ss-input"
            >
              <option value="ROLE">Role</option>
              <option value="USER">User</option>
            </select>
          </label>
          <label className="ss-field" style={{ margin: 0 }}>
            <span className="ss-label">{accessScope.type === 'ROLE' ? 'Role' : 'User'}</span>
            {accessScope.type === 'ROLE' ? (
              <select value={accessScope.key} onChange={(e) => setAccessScope({ type: 'ROLE', key: e.target.value })} className="ss-input">
                {(accessOptions.roles || []).map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            ) : (
              <select value={accessScope.key} onChange={(e) => setAccessScope({ type: 'USER', key: e.target.value })} className="ss-input">
                {(accessOptions.users || []).map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.fullName} — {user.email} ({user.role})
                  </option>
                ))}
              </select>
            )}
          </label>
        </div>

        {/* Configured or inherited — never "looks configured" just because the
            panel rendered. */}
        <div className={`mk-access-status ${accessScopeData?.configured ? 'is-configured' : 'is-default'}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-slate-800">{scopeLabel}</p>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {accessScopeData?.configured
                  ? `Configured${accessScopeData?.updatedBy ? ` — last saved by ${accessScopeData.updatedBy}` : ''}. These exact permissions are enforced.`
                  : (accessScope.type === 'ROLE'
                    ? 'Not configured — this role still has exactly the Sales access it had before Access Management, derived from its existing role permissions.'
                    : 'No personal configuration — this user follows their role’s configuration or default access.')}
              </p>
            </div>
            {accessDirty && <span className="text-[11px] font-bold text-amber-700">Unsaved changes</span>}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          A page with <strong>View</strong> OFF is hidden from the Sales navigation and its URL and API are
          refused. Turning Create, Edit, Delete, Approve, Submit, Send, Export, Import or Upload OFF hides
          that action and the backend rejects it. An action a Sales page does not have is never offered here.
        </p>

        {accessLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading permissions" />
          </div>
        ) : !accessDraft ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold text-slate-600">Select a role or user to configure Sales access.</p>
          </div>
        ) : (
          <div className="mk-access-grid">
            {SALES_AREAS.map((area) => {
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
                          <Toggle
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

        {/* Access Management has its own resource, so it saves independently of
            the Sales settings document above. */}
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setConfirmAccessReset(true)}
            disabled={accessSaving || !accessScope.key}
            className="mk-access-btn"
          >
            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" /> Reset to defaults
          </button>
          <button
            type="button"
            onClick={saveAccess}
            disabled={accessSaving || !accessDirty}
            className="po-btn po-btn-primary po-btn-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {accessSaving
              ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Saving…</>
              : <><Save size={13} aria-hidden="true" /> Save Access</>}
          </button>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  SECTION ROUTER                                                   */
  /* ================================================================ */
  const renderSection = () => {
    switch (section) {
      case 'overview': return renderOverview();
      case 'access': return renderAccess();
      case 'general': return renderGeneral();
      case 'approval': return renderApproval();
      case 'tax': return renderTax();
      case 'currency': return renderCurrency();
      case 'payment': return renderPayment();
      case 'delivery': return renderDelivery();
      case 'numbering': return renderNumbering();
      case 'pdf': return renderPdf();
      case 'notifications': return renderNotifications();
      case 'masters': return renderMasters();
      case 'company': return renderCompany();
      default: return renderOverview();
    }
  };

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  const meta = SECTION_META[section] || SECTION_META.overview;

  if (loading) {
    return (
      <div className="purchase-page cpr-page ss-page flex-1 flex flex-col bg-app font-sans antialiased text-slate-800 w-full max-w-full min-w-0">
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" aria-label="Loading settings" />
        </div>
      </div>
    );
  }

  return (
    <div className="purchase-page cpr-page ss-page flex-1 flex flex-col bg-app font-sans antialiased text-slate-800 w-full max-w-full min-w-0">
      {/* Breadcrumb */}
      <nav className="po-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} aria-hidden="true" />
        <span className="bc-current">Sales Settings</span>
      </nav>

      {/* Page header + actions */}
      <div className="po-page-header">
        <div className="min-w-0">
          <h1><Settings2 className="w-5 h-5" style={{ color: '#0A4F44' }} aria-hidden="true" /> Sales Settings</h1>
          <p className="po-page-header-subtitle">Configure defaults, approvals, taxes, numbering and masters for every Sales module</p>
        </div>
        <div className="po-page-header-actions">
          <button type="button" onClick={handleImport} disabled={importing} className="po-btn po-btn-secondary po-btn-sm">
            <Upload size={13} /> Import
          </button>
          <button type="button" onClick={handleExport} className="po-btn po-btn-secondary po-btn-sm">
            <Download size={13} /> Export
          </button>
          <button type="button" onClick={() => setConfirmResetAll(true)} className="po-btn po-btn-danger po-btn-sm">
            <RotateCcw size={13} /> Reset All
          </button>
        </div>
      </div>

      {/* Feedback banner — save / reset / import outcomes */}
      {banner && (
        <div className={`ss-banner ss-banner--${banner.tone}`} role={banner.tone === 'error' ? 'alert' : 'status'}>
          <p>{banner.text}</p>
          <button type="button" onClick={() => setBanner(null)}>Dismiss</button>
        </div>
      )}

      {/* Settings layout: grouped rail + content */}
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
          {settings ? renderSection() : (
            <Card title="Settings unavailable">
              <p className="ss-hint" style={{ margin: 0 }}>The Sales configuration could not be loaded.</p>
              <button type="button" className="po-btn po-btn-primary po-btn-sm" style={{ marginTop: 12 }} onClick={load}>
                <RefreshCw size={13} /> Retry
              </button>
            </Card>
          )}
        </div>
      </div>

      {/* Sticky action bar — Reset Changes discards the draft; Save persists. */}
      <div className="ss-actions">
        <div className="ss-actions-left">
          <button
            type="button"
            className="po-btn po-btn-ghost po-btn-sm"
            onClick={resetChanges}
            disabled={!isDirty}
            title={isDirty ? 'Discard the unsaved changes on this screen' : 'No unsaved changes'}
          >
            <RotateCcw size={13} /> Reset Changes
          </button>
          {isDirty && <span className="ss-dirty">Unsaved changes</span>}
        </div>
        <div className="ss-actions-right">
          {saveState === 'saved' && (
            <span className="ss-saved"><CheckCircle2 size={14} aria-hidden="true" /> Saved</span>
          )}
          <button
            type="button"
            className="po-btn po-btn-primary po-btn-sm"
            onClick={save}
            disabled={!isDirty || saveState === 'saving'}
            title={isDirty ? 'Save the configuration' : 'Nothing to save'}
          >
            {saveState === 'saving'
              ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Saving…</>
              : <><Save size={13} aria-hidden="true" /> Save Changes</>}
          </button>
        </div>
      </div>

      {/* Access Management uses its own resource, so it has its own confirmation
          dialogs rather than the settings Reset All flow. */}
      <ConfirmDialog
        open={confirmAccessReset}
        title="Reset Sales access for this scope?"
        message="The saved permissions for the selected role or user are removed and it inherits its role defaults again. Other roles and users are not touched. Marketing access is not affected."
        confirmLabel="Reset Access"
        variant="danger"
        icon={RotateCcw}
        loading={accessSaving}
        onConfirm={resetAccess}
        onCancel={() => !accessSaving && setConfirmAccessReset(false)}
      />

      <ConfirmDialog
        open={confirmDiscardAccess}
        title="Discard unsaved permission changes?"
        message="The permission switches you changed have not been saved. Leaving the section discards them."
        confirmLabel="Discard changes"
        variant="danger"
        icon={AlertTriangle}
        onConfirm={() => {
          setAccessDraft(accessScopeData?.permissions || null);
          setConfirmDiscardAccess(false);
          if (pendingSection) {
            setSection(pendingSection);
            setPendingSection(null);
          }
        }}
        onCancel={() => {
          setConfirmDiscardAccess(false);
          setPendingSection(null);
        }}
      />

      <ConfirmDialog
        open={confirmResetAll}
        title="Reset ALL Sales settings?"
        message="Every Sales setting — defaults, approvals, tax rates, currencies, payment terms, delivery, numbering format, document output, notifications, masters and company preferences — returns to its factory default. Existing documents, records and document-numbering counters are never touched. This cannot be undone."
        confirmLabel="Reset All Settings"
        variant="danger"
        icon={RotateCcw}
        loading={resetBusy}
        onConfirm={resetAll}
        onCancel={() => !resetBusy && setConfirmResetAll(false)}
      />
    </div>
  );
}
