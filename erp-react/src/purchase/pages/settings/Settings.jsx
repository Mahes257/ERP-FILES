/**
 * purchase/pages/settings/Settings.jsx
 * ------------------------------------------------------------------
 * Purchase Settings — enterprise procurement configuration centre.
 *
 * Landing page with:
 *   Config-health summary bar (percentage + per-section status)
 *   Section cards for navigation
 *   Full configuration for every procurement setting
 *   Recent changes audit panel
 *
 * Uses the unified settings-polish.css ERP design system.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ArrowDown, ArrowUp, Banknote, Building2, ChevronDown, ChevronRight, Copy,
  FileText, Hash, Info, Layers, ListFilter, Loader2, Package, Plus,
  RefreshCw, Save, Scale, Search, Settings2, ShieldCheck, Trash2, Truck,
  Users, Wallet, Clock, Bell, BookOpen, Zap, X, Undo2
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import ModuleTabNav from '../../components/ModuleTabNav';
import { settingsService, NUMBERING_DEFAULTS, NUMBERING_DOC_TYPES, validatePrefixes, RESET_POLICIES } from '../../services/settings';
import { listMaster } from '../../services/masterStore';
import { formatAmount } from '../../utils/purchase';
import { useToast } from '../../components/ui';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import CurrencyExchangeSection from './CurrencyExchangeSection';
import HsnSacSettings from './HsnSacSettings';
import ItemCatalogSettings from './ItemCatalogSettings';
import AccessManagement from './AccessManagement';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { useCurrentUser } from '../../../components/Common';

/* ------------------------------------------------------------------ */
/*  Shared class names (all backed by settings-polish.css)              */
/* ------------------------------------------------------------------ */
const INPUT = 'st-input';
const INPUT_R = 'st-input st-input-right';
const INPUT_C = 'st-input st-input-center';
const INPUT_SM = 'st-input st-input-sm';
const INPUT_XS = 'st-input st-input-xs';
const SELECT = 'st-select';
const LABEL = 'st-label';
const CHECK = 'st-check';
const ICON_BTN = (danger = false) => `st-btn-icon${danger ? ' st-btn-icon-danger' : ''}`;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/*  Section definitions                                                 */
/* ------------------------------------------------------------------ */
const SECTIONS = [
  { key: 'health', label: 'Overview', icon: Zap, color: 'text-emerald-600' },
  { key: 'approval', label: 'Approval Matrix', icon: ShieldCheck, color: 'text-indigo-600' },
  { key: 'approvalRules', label: 'Approval Rules', icon: ShieldCheck, color: 'text-indigo-600' },
  { key: 'budget', label: 'Budget Control', icon: Wallet, color: 'text-emerald-600' },
  { key: 'matching', label: '3-Way Matching', icon: Scale, color: 'text-violet-600' },
  { key: 'tax', label: 'Tax Settings', icon: Scale, color: 'text-violet-600' },
  { key: 'currency', label: 'Currency & Exchange Rates', icon: Banknote, color: 'text-amber-600' },
  { key: 'payment', label: 'Payment Terms', icon: Wallet, color: 'text-emerald-600' },
  { key: 'hsn', label: 'HSN / SAC', icon: Hash, color: 'text-rose-600' },
  { key: 'items', label: 'Items / Products', icon: Package, color: 'text-sky-600' },
  { key: 'logistics', label: 'Logistics Defaults', icon: Truck, color: 'text-sky-600' },
  { key: 'pdf', label: 'PDF / Document Defaults', icon: FileText, color: 'text-rose-600' },
  { key: 'terms', label: 'Terms & Conditions', icon: BookOpen, color: 'text-violet-600' },
  { key: 'company', label: 'Company / Organization', icon: Building2, color: 'text-sky-600' },
  { key: 'numbering', label: 'Document Numbering', icon: Hash, color: 'text-rose-600' },
  { key: 'workflow', label: 'Workflow Settings', icon: Layers, color: 'text-violet-600' },
  { key: 'notifications', label: 'Notifications', icon: Bell, color: 'text-amber-600' },
  { key: 'audit', label: 'Audit / Security', icon: Clock, color: 'text-slate-600' },
  // Access Management is the one ADMIN-only section: it decides who may use the
  // Purchase module, so it is never offered to a non-administrator.
  { key: 'access', label: 'Access Management', icon: ShieldCheck, color: 'text-indigo-600', adminOnly: true }
];

/* ------------------------------------------------------------------ */
/*  Toggle switch component                                             */
/* ------------------------------------------------------------------ */
function ToggleSwitch({ checked, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange} className="st-toggle" />
  );
}

/* ================================================================== */
/*  MAIN COMPONENT                                                     */
/* ================================================================== */
export default function Settings() {
  const toast = useToast();
  const { isAdmin } = useCurrentUser();
  // Purchase Settings → Edit: the page may be read with View alone; changing the
  // configuration needs the Edit permission (the backend enforces the same rule
  // on every settings write).
  const { can: canPurchase } = usePurchaseAccess();
  const canEditSettings = canPurchase('settings', 'edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const section = searchParams.get('section') || 'health';
  const setSection = useCallback((key) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('section', key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [health, setHealth] = useState(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmFactoryReset, setConfirmFactoryReset] = useState(false);
  const [confirmResetSection, setConfirmResetSection] = useState(null);
  const [warehouses, setWarehouses] = useState([]);

  /* Approval rule collapse state */
  const [collapsedRules, setCollapsedRules] = useState({});
  const toggleRule = (key) => setCollapsedRules((prev) => ({ ...prev, [key]: !prev[key] }));

  /* Approval rule inline doc-type editor state */
  const [docEditRule, setDocEditRule] = useState(null);
  /* Approval rule inline priority editor state */
  const [prioEditRule, setPrioEditRule] = useState(null);

  /* Workflow tab state */
  const [activeWorkflowDoc, setActiveWorkflowDoc] = useState('PR');

  /* Tax preview state */
  const [previewBase, setPreviewBase] = useState(100000);

  /* Terms expanded state */
  const [expandedTc, setExpandedTc] = useState(null);

  /* Audit filter state */
  const [auditFilter, setAuditFilter] = useState('');
  const [auditSearch, setAuditSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [data, h] = await Promise.all([
        settingsService.getSettings(),
        settingsService.getConfigHealth()
      ]);
      // Notification rules are the one section the BACKEND enforces, so what
      // the grid shows must be what the server is actually applying. The local
      // draft is kept when the server has no rule set yet (first run).
      let notificationRules = data?.notificationRules || [];
      try {
        const serverRules = await settingsService.getServerNotificationRules();
        if (Array.isArray(serverRules) && serverRules.length > 0) {
          notificationRules = serverRules;
        }
      } catch {
        // Server unreachable — keep the local draft rather than blanking the grid.
      }
      setSettings({ ...data, notificationRules });
      setHealth(h);
      setWarehouses(listMaster('warehouses').map((i) => i.name));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const save = async () => {
    if (!settings) return;
    if (settings.approvalMatrix) {
      const matrix = settings.approvalMatrix;
      const levels = matrix.levels || [];
      for (const level of levels) {
        if (level.active) {
          if (level.minAmount < 0 || level.maxAmount < 0) {
            toast.error('Approval matrix: amounts cannot be negative');
            return;
          }
          if (level.maxAmount > 0 && level.minAmount > level.maxAmount) {
            toast.error(`Approval matrix: min amount exceeds max for ${level.label || 'level'}`);
            return;
          }
          if (level.slaDays < 0) {
            toast.error('Approval matrix: SLA days cannot be negative');
            return;
          }
        }
      }
      const activeLevels = levels.filter((l) => l.active && l.maxAmount > 0);
      for (let i = 0; i < activeLevels.length; i++) {
        for (let j = i + 1; j < activeLevels.length; j++) {
          const a = activeLevels[i];
          const b = activeLevels[j];
          if (a.minAmount <= b.maxAmount && b.minAmount <= a.maxAmount) {
            toast.error(`Approval matrix: overlapping ranges between "${a.label}" and "${b.label}"`);
            return;
          }
        }
      }
    }
    setSaving(true);
    try {
      const saved = await settingsService.updateSettings(settings);
      // Mirror the notification rules to the backend: they decide whether a
      // Purchase event notifies anyone, so they cannot stay browser-only.
      try {
        const serverRules = await settingsService.saveServerNotificationRules(
          saved?.notificationRules || settings.notificationRules || []
        );
        setSettings((prev) => ({ ...prev, notificationRules: serverRules }));
        toast.success('Settings saved');
      } catch (rulesError) {
        // The local draft is saved; the server refused the rule change (it is
        // ADMIN-only). Say so instead of implying the rules are being enforced.
        toast.warning(
          'Settings saved locally — notification rules need an administrator to save before they are enforced.'
        );
        if (rulesError?.response?.status && rulesError.response.status !== 403) {
          toast.error(rulesError?.message || 'Notification rules could not be saved');
        }
      }
      const h = await settingsService.getConfigHealth();
      setHealth(h);
    } catch (err) {
      toast.error(err?.message || 'Failed to save settings');
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

  /* Audit history filtered */
  const auditHistory = useMemo(() => {
    const history = settings?.auditHistory || [];
    let result = history;
    if (auditFilter) result = result.filter((h) => h.section === auditFilter);
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      result = result.filter((h) => (h.setting || '').toLowerCase().includes(q) || (h.changedBy || '').toLowerCase().includes(q));
    }
    return result;
  }, [settings, auditFilter, auditSearch]);

  const auditSections = useMemo(() => [...new Set((settings?.auditHistory || []).map((h) => h.section))].filter(Boolean), [settings]);

  /* ================================================================ */
  /*  OVERVIEW / HEALTH                                                 */
  /* ================================================================ */
  const renderHealth = () => {
    if (!health) return null;
    const stateStyles = {
      configured: { card: 'st-badge-success', dot: 'bg-emerald-500', border: 'border-emerald-200 bg-white hover:border-emerald-300' },
      partial: { card: 'st-badge-warning', dot: 'bg-amber-500', border: 'border-amber-200 bg-amber-50/40 hover:border-amber-300' },
      missing: { card: 'st-badge-danger', dot: 'bg-rose-500', border: 'border-rose-200 bg-rose-50/40 hover:border-rose-300' }
    };
    const stateLabels = { configured: 'Configured', partial: 'Partial', missing: 'Not Configured' };
    return (
      <div className="st-space-y-4">
        <div className={`rounded-xl border p-5 ${health.status === 'healthy' ? 'border-emerald-200 bg-emerald-50/60' : health.status === 'warning' ? 'border-amber-200 bg-amber-50/60' : 'border-rose-200 bg-rose-50/60'}`}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="st-text-sm st-text-bold st-text-dark">Configuration Health</h3>
              <p className="st-text-xs st-text-muted mt-0.5">{health.configured} of {health.total} sections configured{health.partial > 0 ? ` · ${health.partial} partial` : ''}</p>
            </div>
            <div className={`text-3xl font-bold tabular-nums ${health.status === 'healthy' ? 'text-emerald-600' : health.status === 'warning' ? 'text-amber-600' : 'text-rose-600'}`}>{health.percentage}%</div>
          </div>
          <div className="st-health-bar">
            <div className={`st-health-bar-fill ${health.status === 'healthy' ? 'st-health-good' : health.status === 'warning' ? 'st-health-warn' : 'st-health-bad'}`} style={{ width: `${health.percentage}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {health.checks.map((check) => {
            const st = stateStyles[check.status] || stateStyles.missing;
            const sec = SECTIONS.find((s) => s.key === check.key);
            const Icon = sec?.icon || Settings2;
            return (
              <button key={check.key} type="button" onClick={() => setSection(check.key)} className={`flex items-center gap-3 p-4 rounded-xl border text-left transition-all cursor-pointer ${st.border}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${st.card}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="st-text-xs st-text-bold st-text-dark st-text-truncate">{check.label}</div>
                  <div className="st-text-xxs st-text-light mt-0.5 st-text-truncate">{check.detail}</div>
                  <div className="mt-1.5">
                    <span className={`st-badge ${st.card}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {stateLabels[check.status]}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  APPROVAL MATRIX                                                   */
  /* ================================================================ */
  const renderApproval = () => {
    const matrix = settings?.approvalMatrix || [];
    const errs = settingsService.validateApprovalMatrix(matrix);
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info">
          Auto-approve below {formatAmount(settings?.approval?.autoApproveBelow ?? 0)} · Two-level above {formatAmount(settings?.approval?.twoLevelAbove ?? 0)} · Active levels: {matrix.filter((r) => r.active).length}
        </div>
        <div className="st-table-wrap">
          <div className="st-table-scroll">
            <table className="st-table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ width: 70 }}>Level</th>
                  <th style={{ minWidth: 160 }}>Approver Role</th>
                  <th className="st-td-right" style={{ width: 120 }}>Min Amount</th>
                  <th className="st-td-right" style={{ width: 120 }}>Max Amount</th>
                  <th className="st-td-center" style={{ width: 80 }}>SLA (days)</th>
                  <th style={{ minWidth: 140 }}>Fallback</th>
                  <th className="st-td-center" style={{ width: 90 }}>Escalation</th>
                  <th className="st-td-center" style={{ width: 60 }}>Active</th>
                  <th className="st-td-center" style={{ width: 90 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((row, index) => (
                  <tr key={row.level}>
                    <td data-label="Level"><span className="st-td-bold">Level {row.level}</span></td>
                    <td data-label="Approver Role"><input type="text" value={row.role} onChange={(e) => { const next = [...matrix]; next[index] = { ...row, role: e.target.value }; update({ approvalMatrix: next }); }} className={INPUT} /></td>
                    <td data-label="Min Amount" className="st-td-right"><input type="number" value={row.minAmount} onChange={(e) => { const next = [...matrix]; next[index] = { ...row, minAmount: Number(e.target.value) || 0 }; update({ approvalMatrix: next }); }} className={`${INPUT_R} st-input-w110`} /></td>
                    <td data-label="Max Amount" className="st-td-right"><input type="number" value={row.maxAmount} onChange={(e) => { const next = [...matrix]; next[index] = { ...row, maxAmount: Number(e.target.value) || 0 }; update({ approvalMatrix: next }); }} className={`${INPUT_R} st-input-w110`} placeholder="0 = No limit" /></td>
                    <td data-label="SLA" className="st-td-center"><input type="number" value={row.slaDays} onChange={(e) => { const next = [...matrix]; next[index] = { ...row, slaDays: Number(e.target.value) || 0 }; update({ approvalMatrix: next }); }} className={`${INPUT_C} ${INPUT_XS}`} /></td>
                    <td data-label="Fallback"><input type="text" value={row.fallbackApprover || ''} onChange={(e) => { const next = [...matrix]; next[index] = { ...row, fallbackApprover: e.target.value }; update({ approvalMatrix: next }); }} className={INPUT} placeholder="Optional" /></td>
                    <td data-label="Escalation" className="st-td-center"><input type="number" value={row.escalationDays} onChange={(e) => { const next = [...matrix]; next[index] = { ...row, escalationDays: Number(e.target.value) || 0 }; update({ approvalMatrix: next }); }} className={`${INPUT_C} ${INPUT_XS}`} /></td>
                    <td data-label="Active" className="st-td-center"><input type="checkbox" checked={row.active} onChange={() => { const next = [...matrix]; next[index] = { ...row, active: !row.active }; update({ approvalMatrix: next }); }} className={CHECK} /></td>
                    <td data-label="Actions" className="st-td-actions">
                      <div className="inline-flex items-center gap-1 justify-center">
                        {index > 0 && <button type="button" onClick={() => { const next = [...matrix]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; next.forEach((r, i) => { r.level = i + 1; }); update({ approvalMatrix: next }); }} className={ICON_BTN()} title="Move up"><ArrowUp className="w-3 h-3" /></button>}
                        {index < matrix.length - 1 && <button type="button" onClick={() => { const next = [...matrix]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; next.forEach((r, i) => { r.level = i + 1; }); update({ approvalMatrix: next }); }} className={ICON_BTN()} title="Move down"><ArrowDown className="w-3 h-3" /></button>}
                        <button type="button" onClick={() => { const next = matrix.filter((_, i) => i !== index); next.forEach((r, i) => { r.level = i + 1; }); update({ approvalMatrix: next }); }} className={ICON_BTN(true)} title="Remove"><Trash2 className="w-3 h-3" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => { const maxL = matrix.length > 0 ? Math.max(...matrix.map((r) => r.level)) : 0; const lastMax = matrix.length > 0 ? matrix[matrix.length - 1].maxAmount : 0; update({ approvalMatrix: [...matrix, { level: maxL + 1, role: '', minAmount: (lastMax || 0) + 1, maxAmount: 0, slaDays: 3, active: true, fallbackApprover: '', escalationDays: 5 }] }); }} className="st-btn st-btn-outline"><Plus className="w-3.5 h-3.5" /> Add Level</button>
          <button type="button" onClick={() => { const last = matrix[matrix.length - 1]; if (last) update({ approvalMatrix: [...matrix, { ...last, level: last.level + 1, minAmount: last.maxAmount + 1, maxAmount: 0 }] }); }} className="st-btn st-btn-ghost"><Copy className="w-3.5 h-3.5" /> Duplicate Last</button>
        </div>
        {errs.length > 0 && <div className="st-banner st-banner-danger"><p className="st-text-bold mb-1">Validation Issues:</p>{errs.map((e, i) => <p key={i} className="st-text-xs">• {e}</p>)}</div>}
      </div>
    );
  };

  /* ================================================================ */
  /*  TAX                                                               */
  /* ================================================================ */
  const renderTax = () => {
    const taxes = settings?.taxRates || [];
    const activeCount = taxes.filter((t) => t.active).length;
    const avgRate = activeCount > 0 ? (taxes.filter((t) => t.active).reduce((s, t) => s + t.rate, 0) / activeCount).toFixed(1) : '0';
    return (
      <div className="st-space-y-4">
        <div className="st-form-grid-4">
          {[{ label: 'Total Taxes', value: taxes.length }, { label: 'Active', value: activeCount }, { label: 'Inactive', value: taxes.length - activeCount }, { label: 'Avg Rate', value: `${avgRate}%` }].map((stat) => (
            <div key={stat.label} className="st-stat"><div className="st-stat-value">{stat.value}</div><div className="st-stat-label">{stat.label}</div></div>
          ))}
        </div>
        <div className="st-table-wrap">
          <div className="st-table-scroll">
            <table className="st-table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Code</th>
                  <th style={{ minWidth: 150 }}>Name</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th className="st-td-right" style={{ width: 80 }}>Rate %</th>
                  <th className="st-td-right" style={{ width: 80 }}>CGST %</th>
                  <th className="st-td-right" style={{ width: 80 }}>SGST %</th>
                  <th className="st-td-right" style={{ width: 80 }}>IGST %</th>
                  <th style={{ minWidth: 120 }}>Applicable To</th>
                  <th className="st-td-center" style={{ width: 60 }}>Active</th>
                  <th className="st-td-center" style={{ width: 60 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {taxes.map((row, index) => (
                  <tr key={row.id || index}>
                    <td data-label="Code"><input value={row.code} onChange={(e) => { const next = [...taxes]; next[index] = { ...row, code: e.target.value }; update({ taxRates: next }); }} className={`${INPUT} ${INPUT_SM}`} /></td>
                    <td data-label="Name"><input value={row.name} onChange={(e) => { const next = [...taxes]; next[index] = { ...row, name: e.target.value }; update({ taxRates: next }); }} className={INPUT} /></td>
                    <td data-label="Type"><select value={row.type} onChange={(e) => { const next = [...taxes]; next[index] = { ...row, type: e.target.value }; update({ taxRates: next }); }} className={`${SELECT} ${INPUT_SM}`}><option>GST</option><option>TDS</option><option>CESS</option><option>Other</option></select></td>
                    <td data-label="Rate %" className="st-td-right"><input type="number" value={row.rate} onChange={(e) => { const rate = Number(e.target.value) || 0; const next = [...taxes]; next[index] = { ...row, rate, cgst: rate / 2, sgst: rate / 2, igst: rate }; update({ taxRates: next }); }} className={`${INPUT_R} ${INPUT_SM}`} /></td>
                    <td data-label="CGST %" className="st-td-right"><span className="st-td-bold st-td-mono">{row.cgst}%</span></td>
                    <td data-label="SGST %" className="st-td-right"><span className="st-td-bold st-td-mono">{row.sgst}%</span></td>
                    <td data-label="IGST %" className="st-td-right"><span className="st-td-bold st-td-mono">{row.igst}%</span></td>
                    <td data-label="Applicable To"><div className="flex flex-wrap gap-1">{(row.applicableTo || []).map((a) => <span key={a} className="st-badge st-badge-neutral">{a}</span>)}</div></td>
                    <td data-label="Active" className="st-td-center"><input type="checkbox" checked={row.active} onChange={() => { const next = [...taxes]; next[index] = { ...row, active: !row.active }; update({ taxRates: next }); }} className={CHECK} /></td>
                    <td data-label="Actions" className="st-td-actions"><button type="button" onClick={() => update({ taxRates: taxes.filter((_, i) => i !== index) })} className={ICON_BTN(true)}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button type="button" onClick={() => update({ taxRates: [...taxes, { id: `tax-${Date.now()}`, code: 'GST-NEW', name: 'New Tax', rate: 0, type: 'GST', cgst: 0, sgst: 0, igst: 0, applicableTo: ['PO', 'Invoice'], active: true, effectiveDate: todayStr() }] })} className="st-btn st-btn-outline"><Plus className="w-3.5 h-3.5" /> Add Tax</button>
        <div className="st-preview-box">
          <p className="st-text-xs st-text-bold st-text-dark mb-3">Tax Calculation Preview</p>
          <label className="block mb-3"><span className={LABEL}>Base Amount</span><input type="number" value={previewBase} onChange={(e) => setPreviewBase(Number(e.target.value) || 0)} className={`${INPUT} ${INPUT_SM} st-input-wmax200`} /></label>
          <div className="st-space-y-2 st-text-xs">
            <div className="flex justify-between"><span className="st-text-muted">Base Amount</span><span className="st-td-bold st-td-mono">{formatAmount(previewBase)}</span></div>
            <div className="flex justify-between"><span className="st-text-muted">CGST 9%</span><span className="st-td-bold st-td-mono">{formatAmount(previewBase * 0.09)}</span></div>
            <div className="flex justify-between"><span className="st-text-muted">SGST 9%</span><span className="st-td-bold st-td-mono">{formatAmount(previewBase * 0.09)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-2"><span className="st-text-xs st-text-bold st-text-dark">Grand Total</span><span className="st-text-xs st-text-bold st-text-accent st-td-mono">{formatAmount(previewBase * 1.18)}</span></div>
          </div>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  PAYMENT TERMS                                                     */
  /* ================================================================ */
  const renderPayment = () => {
    const terms = settings?.paymentTerms || [];
    const pay = settings?.payment || {};
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info">
          Payment ledger controls: by default a payment that exceeds the invoice&apos;s outstanding balance is refused. Enable overpayment to allow explicitly recorded overpayments.
        </div>
        <div className="st-toggle-row">
          <span className="st-toggle-row-label">Allow Overpayment</span>
          <ToggleSwitch checked={pay.allowOverpayment !== false} onChange={() => update({ payment: { ...pay, allowOverpayment: pay.allowOverpayment === false } })} />
        </div>
        <div className="st-table-wrap">
          <div className="st-table-scroll">
            <table className="st-table" style={{ minWidth: 780 }}>
              <thead>
                <tr>
                  <th style={{ width: 80 }}>Code</th>
                  <th style={{ minWidth: 170 }}>Name</th>
                  <th className="st-td-right" style={{ width: 90 }}>Credit Days</th>
                  <th className="st-td-right" style={{ width: 90 }}>Advance %</th>
                  <th className="st-td-right" style={{ width: 90 }}>Balance %</th>
                  <th style={{ minWidth: 160 }}>Due Date Rule</th>
                  <th className="st-td-center" style={{ width: 60 }}>Active</th>
                  <th className="st-td-center" style={{ width: 60 }}>Default</th>
                  <th className="st-td-center" style={{ width: 60 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((row, index) => (
                  <tr key={row.id || index}>
                    <td data-label="Code"><input value={row.code} onChange={(e) => { const next = [...terms]; next[index] = { ...row, code: e.target.value }; update({ paymentTerms: next }); }} className={`${INPUT} ${INPUT_SM}`} /></td>
                    <td data-label="Name"><input value={row.name} onChange={(e) => { const next = [...terms]; next[index] = { ...row, name: e.target.value }; update({ paymentTerms: next }); }} className={INPUT} /></td>
                    <td data-label="Credit Days" className="st-td-right"><input type="number" value={row.creditDays} onChange={(e) => { const next = [...terms]; next[index] = { ...row, creditDays: Number(e.target.value) || 0 }; update({ paymentTerms: next }); }} className={`${INPUT_R} ${INPUT_SM}`} /></td>
                    <td data-label="Advance %" className="st-td-right"><input type="number" value={row.advancePercent} onChange={(e) => { const next = [...terms]; const adv = Number(e.target.value) || 0; next[index] = { ...row, advancePercent: adv, balancePercent: 100 - adv }; update({ paymentTerms: next }); }} className={`${INPUT_R} ${INPUT_SM}`} /></td>
                    <td data-label="Balance %" className="st-td-right"><span className="st-td-bold st-td-mono">{row.balancePercent}%</span></td>
                    <td data-label="Due Date Rule"><select value={row.dueDateRule} onChange={(e) => { const next = [...terms]; next[index] = { ...row, dueDateRule: e.target.value }; update({ paymentTerms: next }); }} className={SELECT}><option>Invoice Date + Days</option><option>On Invoice</option><option>Delivery + Days</option><option>Custom</option></select></td>
                    <td data-label="Active" className="st-td-center"><input type="checkbox" checked={row.active} onChange={() => { const next = [...terms]; next[index] = { ...row, active: !row.active }; update({ paymentTerms: next }); }} className={CHECK} /></td>
                    <td data-label="Default" className="st-td-center"><input type="radio" checked={!!row.default} onChange={() => update({ paymentTerms: terms.map((t, i) => ({ ...t, default: i === index })) })} className={CHECK} /></td>
                    <td data-label="Actions" className="st-td-actions"><button type="button" onClick={() => update({ paymentTerms: terms.filter((_, i) => i !== index) })} className={ICON_BTN(true)}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button type="button" onClick={() => update({ paymentTerms: [...terms, { id: `pt-${Date.now()}`, code: 'NEW', name: 'New Term', creditDays: 30, advancePercent: 0, balancePercent: 100, dueDateRule: 'Invoice Date + Days', active: true }] })} className="st-btn st-btn-outline"><Plus className="w-3.5 h-3.5" /> Add Payment Term</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  COMPANY                                                           */
  /* ================================================================ */
  const renderCompany = () => {
    const c = settings?.company || {};
    const setF = (f) => (e) => updateNested('company', f, e.target.value);
    const setBank = (f) => (e) => setSettings((prev) => ({ ...prev, company: { ...prev.company, bank: { ...prev.company?.bank, [f]: e.target.value } } }));
    const setSig = (f) => (e) => setSettings((prev) => ({ ...prev, company: { ...prev.company, signature: { ...prev.company?.signature, [f]: e.target.value } } }));
    return (
      <div className="st-space-y-4">
        <PurchaseSectionCard title="Company Information" subtitle="Legal entity details used on documents and reports">
          <div className="st-form-grid">
            {[{ label: 'Company Name', field: 'name' }, { label: 'Legal Name', field: 'legalName' }, { label: 'GSTIN', field: 'gstin' }, { label: 'PAN', field: 'pan' }, { label: 'CIN', field: 'cin' }, { label: 'TAN', field: 'tan' }, { label: 'Email', field: 'email' }, { label: 'Phone', field: 'phone' }, { label: 'Website', field: 'website' }, { label: 'City', field: 'city' }, { label: 'State', field: 'state' }, { label: 'Country', field: 'country' }, { label: 'PIN', field: 'pin' }].map((f) => (
              <label key={f.field} className="block"><span className={LABEL}>{f.label}</span><input type="text" value={c[f.field] || ''} onChange={setF(f.field)} className={INPUT} /></label>
            ))}
            <label className="block st-span-full"><span className={LABEL}>Registered Address</span><textarea rows={2} value={c.address || ''} onChange={setF('address')} className="st-textarea" /></label>
            <label className="block st-span-full"><span className={LABEL}>Billing Address</span><textarea rows={2} value={c.billingAddress || ''} onChange={setF('billingAddress')} className="st-textarea" /></label>
            <label className="block st-span-full"><span className={LABEL}>Shipping Address</span><textarea rows={2} value={c.shippingAddress || ''} onChange={setF('shippingAddress')} className="st-textarea" /></label>
          </div>
        </PurchaseSectionCard>
        <PurchaseSectionCard title="Bank Details" subtitle="Used on payment documents and PO">
          <div className="st-form-grid">
            {[{ label: 'Bank Name', field: 'bankName' }, { label: 'Account Name', field: 'accountName' }, { label: 'Account Number', field: 'accountNumber' }, { label: 'IFSC', field: 'ifsc' }, { label: 'SWIFT', field: 'swift' }, { label: 'Branch', field: 'branch' }].map((f) => (
              <label key={f.field} className="block"><span className={LABEL}>{f.label}</span><input type="text" value={c.bank?.[f.field] || ''} onChange={setBank(f.field)} className={INPUT} /></label>
            ))}
          </div>
        </PurchaseSectionCard>
        <PurchaseSectionCard title="Document Signature" subtitle="Authorized signatory for generated documents">
          <div className="st-form-grid">
            <label className="block"><span className={LABEL}>Authorized Signatory</span><input type="text" value={c.signature?.authorizedSignatory || ''} onChange={setSig('authorizedSignatory')} className={INPUT} /></label>
            <label className="block"><span className={LABEL}>Designation</span><input type="text" value={c.signature?.designation || ''} onChange={setSig('designation')} className={INPUT} /></label>
          </div>
        </PurchaseSectionCard>
      </div>
    );
  };

  /* ================================================================ */
  /*  NUMBERING                                                         */
  /* ================================================================ */
  const renderNumbering = () => {
    const numbering = settings?.numbering || {};
    const docTypes = NUMBERING_DOC_TYPES;
    const nextNo = (cfg) => `${cfg.prefix}-${cfg.fy}-${String((Number(cfg.currentNo) || 0) + 1).padStart(cfg.padding || 4, '0')}`;
    const prefixErrors = validatePrefixes(numbering);
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info">
          Every document type has its own independent sequence — prefix, FY, start/current counter, padding and reset policy. Inventory Movement (INV) and Vendor Invoice (VINV) deliberately use different prefixes so they can never collide.
        </div>
        {prefixErrors.length > 0 && (
          <div className="st-banner st-banner-danger">
            {prefixErrors.map((err) => <p key={err} className="st-text-xs st-text-semibold">{err}</p>)}
          </div>
        )}
        <div className="st-num-wrap">
          <div className="st-table-scroll">
            <table className="st-num-table" style={{ minWidth: 920 }}>
              <thead>
                <tr>
                  <th className="st-num-col-type">Document Type</th>
                  <th className="st-num-col-prefix">Prefix</th>
                  <th className="st-num-col-fy">FY</th>
                  <th className="st-num-col-start st-num-h-right">Start No</th>
                  <th className="st-num-col-current st-num-h-right">Current</th>
                  <th className="st-num-col-padding st-num-h-right">Padding</th>
                  <th className="st-num-col-reset">Reset Policy</th>
                  <th className="st-num-col-preview">Next Preview</th>
                  <th className="st-num-col-actions st-num-h-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docTypes.map((dt) => {
                  const cfg = numbering[dt] || NUMBERING_DEFAULTS[dt] || { prefix: dt, fy: '2026', startNo: 1, currentNo: 0, padding: 4, resetPolicy: 'never' };
                  const preview = nextNo(cfg);
                  const label = cfg.label || NUMBERING_DEFAULTS[dt]?.label || dt;
                  return (
                    <tr key={dt}>
                      <td className="st-num-col-type" data-label="Document Type"><span className="st-num-label">{label}</span></td>
                      <td className="st-num-col-prefix" data-label="Prefix"><input value={cfg.prefix} onChange={(e) => update({ numbering: { ...numbering, [dt]: { ...cfg, prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') } } })} className="st-num-input" /></td>
                      <td className="st-num-col-fy" data-label="FY"><input value={cfg.fy} onChange={(e) => update({ numbering: { ...numbering, [dt]: { ...cfg, fy: e.target.value } } })} className="st-num-input" /></td>
                      <td className="st-num-col-start" data-label="Start No"><input type="number" value={cfg.startNo} onChange={(e) => update({ numbering: { ...numbering, [dt]: { ...cfg, startNo: Number(e.target.value) || 1 } } })} className="st-num-input st-num-input-right" /></td>
                      <td className="st-num-col-current" data-label="Current"><span className="st-num-current">{cfg.currentNo}</span></td>
                      <td className="st-num-col-padding" data-label="Padding"><input type="number" value={cfg.padding} onChange={(e) => update({ numbering: { ...numbering, [dt]: { ...cfg, padding: Number(e.target.value) || 4 } } })} className="st-num-input st-num-input-right" /></td>
                      <td className="st-num-col-reset" data-label="Reset Policy">
                        <select value={cfg.resetPolicy || 'never'} onChange={(e) => update({ numbering: { ...numbering, [dt]: { ...cfg, resetPolicy: e.target.value } } })} className="st-num-select">
                          {RESET_POLICIES.map((policy) => <option key={policy} value={policy}>{policy === 'never' ? 'Never' : 'Fiscal Year'}</option>)}
                        </select>
                      </td>
                      <td className="st-num-col-preview" data-label="Next Preview"><span className="st-num-preview">{preview}</span></td>
                      <td className="st-num-col-actions" data-label="Actions"><button type="button" onClick={() => setConfirmResetSection(dt)} className="st-num-reset">Reset</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  WORKFLOW                                                           */
  /* ================================================================ */
  const renderWorkflow = () => {
    const workflow = settings?.workflow || {};
    const stages = workflow[activeWorkflowDoc] || [];
    const docTypes = Object.keys(workflow);
    return (
      <div className="st-space-y-4">
        <div className="st-pill-tabs">
          {docTypes.map((dt) => <button key={dt} type="button" onClick={() => setActiveWorkflowDoc(dt)} className={`st-pill-tab ${activeWorkflowDoc === dt ? 'st-pill-active' : ''}`}>{dt}</button>)}
        </div>
        <div className="st-table-wrap">
          <div className="st-table-scroll">
            <table className="st-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th className="st-td-center" style={{ width: 50 }}>Seq</th>
                  <th style={{ minWidth: 120 }}>Stage</th>
                  <th style={{ minWidth: 150 }}>Display Name</th>
                  <th className="st-td-center" style={{ width: 70 }}>SLA</th>
                  <th style={{ minWidth: 140 }}>Responsible</th>
                  <th style={{ minWidth: 130 }}>Escalation</th>
                  <th style={{ minWidth: 160 }}>Transitions</th>
                  <th className="st-td-center" style={{ width: 60 }}>Active</th>
                </tr>
              </thead>
              <tbody>
                {stages.map((stage, i) => (
                  <tr key={stage.stage}>
                    <td data-label="Seq" className="st-td-center"><span className="st-td-muted st-td-bold">{stage.sequence}</span></td>
                    <td data-label="Stage"><span className="st-td-bold">{stage.stage}</span></td>
                    <td data-label="Display Name"><input value={stage.displayName} onChange={(e) => update({ workflow: { ...workflow, [activeWorkflowDoc]: stages.map((s, j) => j === i ? { ...s, displayName: e.target.value } : s) } })} className={INPUT} /></td>
                    <td data-label="SLA" className="st-td-center"><input type="number" value={stage.sla} onChange={(e) => update({ workflow: { ...workflow, [activeWorkflowDoc]: stages.map((s, j) => j === i ? { ...s, sla: Number(e.target.value) || 0 } : s) } })} className={`${INPUT_C} ${INPUT_XS}`} /></td>
                    <td data-label="Responsible"><input value={stage.responsibleRole} onChange={(e) => update({ workflow: { ...workflow, [activeWorkflowDoc]: stages.map((s, j) => j === i ? { ...s, responsibleRole: e.target.value } : s) } })} className={INPUT} /></td>
                    <td data-label="Escalation"><input value={stage.escalation || ''} onChange={(e) => update({ workflow: { ...workflow, [activeWorkflowDoc]: stages.map((s, j) => j === i ? { ...s, escalation: e.target.value } : s) } })} className={INPUT} placeholder="None" /></td>
                    <td data-label="Transitions"><div className="flex flex-wrap gap-1">{(stage.allowedTransitions || []).map((t) => <span key={t} className="st-badge st-badge-primary">{t}</span>)}</div></td>
                    <td data-label="Active" className="st-td-center"><input type="checkbox" checked={stage.enabled} onChange={() => update({ workflow: { ...workflow, [activeWorkflowDoc]: stages.map((s, j) => j === i ? { ...s, enabled: !s.enabled } : s) } })} className={CHECK} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  NOTIFICATIONS                                                     */
  /* ================================================================ */
  const renderNotifications = () => {
    const rules = settings?.notificationRules || [];
    return (
      <div className="st-table-wrap">
        <div className="st-table-scroll">
          <table className="st-table" style={{ minWidth: 870 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Event</th>
                <th className="st-td-center" style={{ width: 70 }}>Enabled</th>
                <th style={{ minWidth: 130 }}>Recipient</th>
                <th className="st-td-center" style={{ width: 90 }}>Remind After</th>
                <th className="st-td-center" style={{ width: 90 }}>Escalate After</th>
                <th style={{ width: 110 }}>Repeat</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={rule.id}>
                  <td data-label="Event"><span className="st-td-bold">{rule.event}</span></td>
                  <td data-label="Enabled" className="st-td-center"><input type="checkbox" checked={rule.enabled} onChange={() => update({ notificationRules: rules.map((r, j) => j === i ? { ...r, enabled: !r.enabled } : r) })} className={CHECK} /></td>
                  <td data-label="Recipient"><input value={rule.recipientRole} onChange={(e) => update({ notificationRules: rules.map((r, j) => j === i ? { ...r, recipientRole: e.target.value } : r) })} className={`${INPUT} ${INPUT_SM}`} /></td>
                  <td data-label="Remind After" className="st-td-center"><input type="number" value={rule.reminderAfter} onChange={(e) => update({ notificationRules: rules.map((r, j) => j === i ? { ...r, reminderAfter: Number(e.target.value) || 0 } : r) })} className={`${INPUT_C} ${INPUT_XS}`} /></td>
                  <td data-label="Escalate After" className="st-td-center"><input type="number" value={rule.escalateAfter} onChange={(e) => update({ notificationRules: rules.map((r, j) => j === i ? { ...r, escalateAfter: Number(e.target.value) || 0 } : r) })} className={`${INPUT_C} ${INPUT_XS}`} /></td>
                  <td data-label="Repeat"><select value={rule.repeatInterval} onChange={(e) => update({ notificationRules: rules.map((r, j) => j === i ? { ...r, repeatInterval: e.target.value } : r) })} className={SELECT}><option value="once">Once</option><option value="daily">Daily</option><option value="every 2 days">Every 2 days</option><option value="weekly">Weekly</option></select></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  LOGISTICS                                                         */
  /* ================================================================ */
  const renderLogistics = () => {
    const d = settings?.logisticsDefaults || {};
    return (
      <div className="st-space-y-4">
        <div className="st-form-grid">
          <label className="block"><span className={LABEL}>Default Warehouse</span><select value={d.defaultWarehouse || ''} onChange={(e) => updateNested('logisticsDefaults', 'defaultWarehouse', e.target.value)} className={SELECT}><option value="">Select...</option>{warehouses.map((w) => <option key={w} value={w}>{w}</option>)}</select></label>
          <label className="block"><span className={LABEL}>Receiving Location</span><input value={d.receivingLocation || ''} onChange={(e) => updateNested('logisticsDefaults', 'receivingLocation', e.target.value)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Over-Delivery Tolerance %</span><input type="number" value={d.overDeliveryTolerance || 0} onChange={(e) => updateNested('logisticsDefaults', 'overDeliveryTolerance', Number(e.target.value))} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Under-Delivery Tolerance %</span><input type="number" value={d.underDeliveryTolerance || 0} onChange={(e) => updateNested('logisticsDefaults', 'underDeliveryTolerance', Number(e.target.value))} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Delivery Reminder Days</span><input type="number" value={d.deliveryReminderDays || 0} onChange={(e) => updateNested('logisticsDefaults', 'deliveryReminderDays', Number(e.target.value))} className={INPUT} /></label>
        </div>
        <div className="st-space-y-2">
          {[{ label: 'Inspection Required', field: 'inspectionRequired' }, { label: 'GRN Required', field: 'grnRequired' }, { label: 'Packing Required', field: 'packingRequired' }, { label: 'Shipping Docs Required', field: 'shippingDocsRequired' }, { label: 'Partial Delivery Allowed', field: 'partialDeliveryAllowed' }].map((t) => (
            <div key={t.field} className="st-toggle-row">
              <span className="st-toggle-row-label">{t.label}</span>
              <ToggleSwitch checked={d[t.field]} onChange={() => updateNested('logisticsDefaults', t.field, !d[t.field])} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  PDF / DOCUMENT                                                    */
  /* ================================================================ */
  const renderPdf = () => {
    const d = settings?.pdfDefaults || {};
    return (
      <div className="st-space-y-4">
        <div className="st-form-grid">
          <label className="block"><span className={LABEL}>Page Size</span><select value={d.pageSize || 'A4'} onChange={(e) => updateNested('pdfDefaults', 'pageSize', e.target.value)} className={SELECT}><option>A4</option><option>Letter</option><option>Legal</option></select></label>
          <label className="block"><span className={LABEL}>Orientation</span><select value={d.orientation || 'Portrait'} onChange={(e) => updateNested('pdfDefaults', 'orientation', e.target.value)} className={SELECT}><option>Portrait</option><option>Landscape</option></select></label>
          <label className="block st-span-full"><span className={LABEL}>Header Text</span><input value={d.headerText || ''} onChange={(e) => updateNested('pdfDefaults', 'headerText', e.target.value)} className={INPUT} /></label>
          <label className="block st-span-full"><span className={LABEL}>Footer Text</span><input value={d.footerText || ''} onChange={(e) => updateNested('pdfDefaults', 'footerText', e.target.value)} className={INPUT} /></label>
        </div>
        <div className="st-space-y-2">
          {[{ label: 'Show Company Logo', field: 'companyLogo' }, { label: 'Show Company Address', field: 'showCompanyAddress' }, { label: 'Show GSTIN', field: 'showGstin' }, { label: 'Show PAN', field: 'showPan' }, { label: 'Show Bank Details', field: 'showBankDetails' }, { label: 'Show Terms & Conditions', field: 'showTerms' }, { label: 'Show Signature', field: 'showSignature' }, { label: 'Show Approval History', field: 'showApprovalHistory' }, { label: 'Show QR Code', field: 'showQrCode' }, { label: 'Show Document Metadata', field: 'showMetadata' }].map((t) => (
            <div key={t.field} className="st-toggle-row">
              <span className="st-toggle-row-label">{t.label}</span>
              <ToggleSwitch checked={d[t.field]} onChange={() => updateNested('pdfDefaults', t.field, !d[t.field])} />
            </div>
          ))}
        </div>
      </div>
    );
  };

  /* ================================================================ */
  /*  TERMS & CONDITIONS                                                */
  /* ================================================================ */
  const renderTerms = () => {
    const tc = settings?.termsAndConditions || [];
    return (
      <div className="st-space-y-3">
        {tc.map((template) => (
          <div key={template.id} className="st-expand-card">
            <button type="button" onClick={() => setExpandedTc(expandedTc === template.id ? null : template.id)} className="st-expand-trigger">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="st-text-xs st-text-bold st-text-dark st-text-truncate">{template.name}</span>
                <span className="st-badge st-badge-neutral">{template.category}</span>
                {template.isDefault && <span className="st-badge st-badge-success">Default</span>}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <input type="checkbox" checked={template.active} onChange={(e) => { e.stopPropagation(); update({ termsAndConditions: tc.map((t) => t.id === template.id ? { ...t, active: !t.active } : t) }); }} className={CHECK} />
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform ${expandedTc === template.id ? 'rotate-90' : ''}`} />
              </div>
            </button>
            {expandedTc === template.id && (
              <div className="st-expand-card-body">
                <textarea rows={6} value={template.content} onChange={(e) => update({ termsAndConditions: tc.map((t) => t.id === template.id ? { ...t, content: e.target.value } : t) })} className="st-textarea st-textarea-mono" />
                <div className="flex items-center gap-3 mt-3">
                  <button type="button" onClick={() => update({ termsAndConditions: tc.map((t) => t.id === template.id ? { ...t, isDefault: true } : { ...t, isDefault: false }) })} className="st-link-btn">Set as Default</button>
                  <span className="text-slate-300">|</span>
                  <button type="button" onClick={() => update({ termsAndConditions: tc.filter((t) => t.id !== template.id) })} className="st-link-btn st-link-danger">Delete</button>
                </div>
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={() => update({ termsAndConditions: [...tc, { id: `tc-${Date.now()}`, category: 'Purchase Terms', name: 'New Template', content: 'Enter terms here...', active: true, isDefault: false }] })} className="st-btn st-btn-outline"><Plus className="w-3.5 h-3.5" /> Add Template</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  AUDIT HISTORY                                                     */
  /* ================================================================ */
  const renderAudit = () => (
    <div className="st-space-y-4">
      {/* Danger zone — full factory reset, kept separate from the
          header Reset (which restores the last saved values). */}
      <div className="st-banner st-banner-danger flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="st-text-xs st-text-bold">Restore System Defaults</p>
          <p className="st-text-xxs st-text-light mt-0.5">Reset every section back to the factory defaults shipped with the app. This overwrites the saved configuration and cannot be undone.</p>
        </div>
        <button type="button" onClick={() => setConfirmFactoryReset(true)} className="st-btn st-btn-danger">Reset to Defaults</button>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block"><span className={LABEL}>Search</span><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" /><input value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} className={`${INPUT} ${INPUT_SM} st-input-search st-input-wmax200`} placeholder="Search..." /></div></label>
        <label className="block"><span className={LABEL}>Section</span><select value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)} className={`${SELECT} ${INPUT_SM}`}><option value="">All Sections</option>{auditSections.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      </div>
      <div className="st-table-wrap">
        <div className="st-table-scroll">
          <table className="st-table" style={{ minWidth: 720 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 140 }}>Setting</th>
                <th style={{ width: 110 }}>Section</th>
                <th style={{ width: 130 }}>Old Value</th>
                <th style={{ width: 130 }}>New Value</th>
                <th style={{ width: 110 }}>Changed By</th>
                <th style={{ minWidth: 140 }}>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {auditHistory.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="Setting"><span className="st-td-bold">{entry.setting}</span></td>
                  <td data-label="Section"><span className="st-badge st-badge-neutral">{entry.section}</span></td>
                  <td data-label="Old Value"><span className="st-td-muted st-td-truncate">{entry.oldValue}</span></td>
                  <td data-label="New Value"><span className="st-td-bold st-td-truncate">{entry.newValue}</span></td>
                  <td data-label="Changed By"><span className="st-td-muted">{entry.changedBy}</span></td>
                  <td data-label="Timestamp"><span className="st-td-nowrap st-td-muted">{entry.changedAt ? new Date(entry.changedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></td>
                </tr>
              ))}
              {auditHistory.length === 0 && <tr><td colSpan={6} className="st-empty">No changes recorded yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="st-text-xs st-text-light">Showing {auditHistory.length} of {(settings?.auditHistory || []).length} entries</p>
    </div>
  );

  /* ================================================================ */
  /*  PROCUREMENT DEFAULTS                                              */
  /* ================================================================ */
  const renderProcurementDefaults = () => {
    const pd = settings?.procurementDefaults || {};
    const fields = [
      { key: 'defaultCurrency', label: 'Default Currency' },
      { key: 'defaultTax', label: 'Default Tax' },
      { key: 'defaultPaymentTerms', label: 'Default Payment Terms' },
      { key: 'defaultDeliveryTerms', label: 'Default Delivery Terms' },
      { key: 'defaultIncoterm', label: 'Default Incoterm' },
      { key: 'defaultWarehouse', label: 'Default Warehouse' },
      { key: 'defaultDepartment', label: 'Default Department' },
      { key: 'defaultPriority', label: 'Default Priority' },
      { key: 'defaultBuyer', label: 'Default Buyer' },
      { key: 'defaultApprovalWorkflow', label: 'Default Approval Workflow' }
    ];
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info">Defaults applied when new PR / RFQ / PO documents are created unless overridden on the document.</div>
        <PurchaseSectionCard title="Procurement Defaults" subtitle="Used as the starting values on new purchasing documents">
          <div className="st-form-grid">
            {fields.map((f) => (
              <label key={f.key} className="block">
                <span className={LABEL}>{f.label}</span>
                <input type="text" list="purchase-defaults-suggestions" value={pd[f.key] || ''} onChange={(e) => updateNested('procurementDefaults', f.key, e.target.value)} className={INPUT} />
              </label>
            ))}
          </div>
          <datalist id="purchase-defaults-suggestions">
            <option value="INR" /><option value="USD" /><option value="EUR" />
            <option value="18%" /><option value="12%" /><option value="5%" /><option value="0%" />
            <option value="Net 30" /><option value="Net 15" /><option value="Net 7" /><option value="Net 45" /><option value="Net 60" />
            <option value="FOB" /><option value="CIF" /><option value="EXW" /><option value="DAP" />
            <option value="Main Store" /><option value="Purchase" /><option value="Medium" /><option value="High" /><option value="Low" />
          </datalist>
        </PurchaseSectionCard>
        <p className="st-text-xs st-text-light">Saved with the global <strong>Save Settings</strong> button alongside every other section.</p>
      </div>
    );
  };

  /* ================================================================ */
  /*  APPROVAL RULES (configurable approval engine)                    */
  /* ================================================================ */
  const renderApprovalRules = () => {
    const rules = settings?.approvalRules || [];
    const updateRule = (index, patch) => {
      const next = [...rules];
      next[index] = { ...next[index], ...patch };
      update({ approvalRules: next });
    };
    const updateStep = (ruleIndex, stepIndex, patch) => {
      const rule = rules[ruleIndex];
      const steps = (rule.steps || []).map((s, i) => (i === stepIndex ? { ...s, ...patch } : s));
      updateRule(ruleIndex, { steps });
    };
    const updateCondition = (ruleIndex, condIndex, patch) => {
      const rule = rules[ruleIndex];
      const conditions = (rule.conditions || []).map((c, i) => (i === condIndex ? { ...c, ...patch } : c));
      updateRule(ruleIndex, { conditions });
    };
    const FIELD_LABEL = { amount: 'Amount', department: 'Department', project: 'Project', costCenter: 'Cost Centre', docType: 'Doc Type', role: 'Role' };
    const OPERATOR_LABEL = { equals: 'equals', notEquals: 'not equals', in: 'is one of', notIn: 'is none of', gte: '≥', lte: '≤', between: 'between' };
    const isBetween = (op) => op === 'between';
    const modeLabel = (m) => (m === 'parallel' ? 'Parallel' : 'Sequential');
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info st-rule-banner">
          <Info className="w-4 h-4 shrink-0" />
          <span>Approval routing is resolved dynamically using amount, department, project, cost centre, document type and role. When no rule matches, the <strong>Approval Matrix</strong> is used as the fallback chain.</span>
        </div>
        {rules.length === 0 ? (
          <div className="st-rule-empty">No approval rules configured yet. Add a rule to define an approval workflow.</div>
        ) : (
          <div className="st-space-y-3">
            {rules.map((rule, ruleIndex) => {
              const ruleKey = rule.id || ruleIndex;
              const collapsed = collapsedRules[ruleKey];
              const docList = rule.docTypes || [];
              return (
                <div key={ruleKey} className="st-rule-card">
                  <div className="st-rule-trigger" role="button" tabIndex={0} onClick={() => toggleRule(ruleKey)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleRule(ruleKey); } }}>
                    <div className="st-rule-id">
                      <span className="st-rule-icon"><ShieldCheck className="w-4 h-4" /></span>
                      <div className="min-w-0 flex-1">
                        <input value={rule.name} placeholder="Rule name" onClick={(e) => e.stopPropagation()} onChange={(e) => updateRule(ruleIndex, { name: e.target.value })} className={`${INPUT} st-rule-name-input`} />
                        <div className="st-rule-meta">
                          <span className="st-prio-field">
                            <span className="st-td-muted">Priority</span>
                            {prioEditRule === ruleKey ? (
                              <input
                                autoFocus type="number" defaultValue={rule.priority}
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => { updateRule(ruleIndex, { priority: Number(e.target.value) || 0 }); setPrioEditRule(null); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); e.stopPropagation(); }}
                                className={`${INPUT} st-input-xs st-prio-input`}
                              />
                            ) : (
                              <button type="button" className="st-prio-value" onClick={(e) => { e.stopPropagation(); setPrioEditRule(ruleKey); }}><strong>{rule.priority}</strong></button>
                            )}
                          </span>
                          <span className="st-rule-doctypes">
                            {docEditRule === ruleKey ? (
                              <input
                                autoFocus
                                defaultValue={(rule.docTypes || []).join(', ')}
                                placeholder="All if empty"
                                onClick={(e) => e.stopPropagation()}
                                onBlur={(e) => {
                                  const clean = e.target.value.split(',').map((s) => s.trim()).filter(Boolean);
                                  if (clean.join(',') !== (rule.docTypes || []).join(',')) updateRule(ruleIndex, { docTypes: clean });
                                  setDocEditRule(null);
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } e.stopPropagation(); }}
                                className={`${INPUT} st-input-sm st-doc-edit-input`}
                              />
                            ) : docList.length === 0 ? (
                              <button type="button" className="st-rule-doc-edit-btn" onClick={(e) => { e.stopPropagation(); setDocEditRule(ruleKey); }}><span className="st-rule-doctype-empty">All document types</span></button>
                            ) : (
                              <button type="button" className="st-rule-doc-edit-btn" onClick={(e) => { e.stopPropagation(); setDocEditRule(ruleKey); }}>
                                {docList.map((d, i) => <span key={i} className="st-rule-doctype-token">{d.trim() || '?'}</span>)}
                              </button>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="st-rule-right">
                      <span className={`st-rule-status ${rule.enabled ? 'st-rule-status-active' : 'st-rule-status-inactive'}`}>{rule.enabled ? 'Active' : 'Inactive'}</span>
                      <span className={`st-rule-mode ${rule.mode === 'parallel' ? 'st-rule-mode-parallel' : 'st-rule-mode-sequential'}`}>{modeLabel(rule.mode)}</span>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${collapsed ? '' : 'rotate-180'}`} />
                    </div>
                  </div>
                  {!collapsed && (
                    <div className="st-rule-body">
                      {/* ── ZONE 1: WHAT / CONDITIONS ── */}
                      <div className="st-rule-zone">
                        <div className="st-rule-zone-head">
                          <span className="st-rule-zone-label"><span className="st-rule-zone-icon"><ListFilter className="w-3 h-3" /></span>Conditions<span className="st-rule-zone-hint">all must match</span></span>
                        </div>
                        <div className="st-cond-list">
                          {(rule.conditions || []).map((cond, condIndex) => (
                            <div key={condIndex} className="st-cond-row">
                              <select value={cond.field} onChange={(e) => updateCondition(ruleIndex, condIndex, { field: e.target.value })} className={`${SELECT} st-cond-field`}>
                                {['amount', 'department', 'project', 'costCenter', 'docType', 'role'].map((f) => <option key={f} value={f}>{FIELD_LABEL[f] || f}</option>)}
                              </select>
                              <select value={cond.operator} onChange={(e) => updateCondition(ruleIndex, condIndex, { operator: e.target.value })} className={`${SELECT} st-cond-operator`}>
                                {['equals', 'notEquals', 'in', 'notIn', 'gte', 'lte', 'between'].map((op) => <option key={op} value={op}>{OPERATOR_LABEL[op] || op}</option>)}
                              </select>
                              <input
                                value={Array.isArray(cond.value) ? (isBetween(cond.operator) ? cond.value[0] || '' : cond.value.join(', ')) : cond.value}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (isBetween(cond.operator)) {
                                    const parts = Array.isArray(cond.value) ? [...cond.value] : [];
                                    parts[0] = raw.trim();
                                    updateCondition(ruleIndex, condIndex, { value: parts });
                                  } else {
                                    const value = ['in', 'notIn'].includes(cond.operator)
                                      ? raw.split(',').map((s) => s.trim()).filter(Boolean)
                                      : raw;
                                    updateCondition(ruleIndex, condIndex, { value });
                                  }
                                }}
                                className={`${INPUT} st-cond-value`}
                                placeholder={isBetween(cond.operator) ? 'low' : 'value'}
                              />
                              {isBetween(cond.operator) && (
                                <input
                                  value={(Array.isArray(cond.value) ? cond.value : [])[1] || ''}
                                  onChange={(e) => {
                                    const parts = Array.isArray(cond.value) ? [...cond.value] : [];
                                    parts[1] = e.target.value.trim();
                                    updateCondition(ruleIndex, condIndex, { value: parts });
                                  }}
                                  className={`${INPUT} st-cond-value2`}
                                  placeholder="high"
                                />
                              )}
                              <button type="button" onClick={() => updateRule(ruleIndex, { conditions: (rule.conditions || []).filter((_, i) => i !== condIndex) })} className="st-cond-remove"><X className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <button type="button" onClick={() => updateRule(ruleIndex, { conditions: [...(rule.conditions || []), { field: 'amount', operator: 'gte', value: '' }] })} className="st-add-secondary"><Plus className="w-3.5 h-3.5" /> Add Condition</button>
                        </div>
                      </div>
                      {/* ── ZONE 2: WHO / APPROVAL CHAIN ── */}
                      <div className="st-rule-zone">
                        <div className="st-rule-zone-head">
                          <span className="st-rule-zone-label"><span className="st-rule-zone-icon"><Users className="w-3 h-3" /></span>Approval Chain<span className="st-rule-zone-hint">{rule.mode === 'parallel' ? 'steps approve in parallel' : 'steps approve sequentially'}</span></span>
                        </div>
                        <div className="st-chain-steps">
                          {(rule.steps || []).map((step, stepIndex) => (
                            <div key={stepIndex} className="st-step-wrap">
                              {stepIndex > 0 && (
                                rule.mode === 'parallel'
                                  ? <div className="st-connector-parallel"><span style={{ fontSize: 9, fontWeight: 700, color: '#818CF8', letterSpacing: '0.5px' }}>PARALLEL</span></div>
                                  : <div className="st-step-connector"><ArrowDown className="w-4 h-4" /></div>
                              )}
                              <div className="st-step-row">
                                <span className="st-step-num">{String(stepIndex + 1).padStart(2, '0')}</span>
                                <div className="st-step-main">
                                  <span className="st-step-role-label">Role</span>
                                  <input value={step.role} onChange={(e) => updateStep(ruleIndex, stepIndex, { role: e.target.value })} className={`${INPUT} st-input-sm st-step-role-input`} placeholder="Approver role" />
                                </div>
                                <div className="st-step-detail">
                                  <label className="st-step-field"><span className="st-step-field-label">SLA</span><input type="number" value={step.slaDays} onChange={(e) => updateStep(ruleIndex, stepIndex, { slaDays: Number(e.target.value) || 0 })} className={`${INPUT} st-input-xs st-step-num-input`} /><span>days</span></label>
                                  <label className="st-step-field"><span className="st-step-field-label">Escalate</span><input type="number" value={step.escalationDays} onChange={(e) => updateStep(ruleIndex, stepIndex, { escalationDays: Number(e.target.value) || 0 })} className={`${INPUT} st-input-xs st-step-num-input`} /><span>days</span></label>
                                  <input value={step.escalationRole || ''} onChange={(e) => updateStep(ruleIndex, stepIndex, { escalationRole: e.target.value })} className={`${INPUT} st-input-sm st-input-wmax140`} placeholder="Escalation role" />
                                  <label className="st-step-field st-step-delegate"><input type="checkbox" checked={step.canDelegate} onChange={() => updateStep(ruleIndex, stepIndex, { canDelegate: !step.canDelegate })} className={`${CHECK} w-3 h-3`} /> Delegate</label>
                                </div>
                                <div className="st-step-removerow">
                                  <button type="button" onClick={() => updateRule(ruleIndex, { steps: (rule.steps || []).filter((_, i) => i !== stepIndex) })} className={ICON_BTN(true)}><Trash2 className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(rule.steps || []).length === 0 && <div className="st-rule-empty" style={{ padding: 20, marginBottom: 8 }}>No approval steps. Add a step to build the chain.</div>}
                        <div style={{ marginTop: 10 }}>
                          <button type="button" onClick={() => updateRule(ruleIndex, { steps: [...(rule.steps || []), { order: (rule.steps || []).length + 1, role: '', slaDays: 2, escalationDays: 4, canDelegate: true, substituteRole: '', escalationRole: '' }] })} className="st-add-secondary"><Plus className="w-3.5 h-3.5" /> Add Approval Step</button>
                        </div>
                      </div>
                      {/* ── Zone footer actions ── */}
                      <div className="st-rule-zone" style={{ borderTop: '1px solid #F1F5F9', paddingTop: 10, paddingBottom: 10 }}>
                        <div className="flex items-center gap-2" style={{ justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => updateRule(ruleIndex, { enabled: !rule.enabled })} className="st-btn st-btn-sm">{rule.enabled ? 'Disable' : 'Enable'}</button>
                          <button type="button" onClick={() => update({ approvalRules: rules.filter((_, i) => i !== ruleIndex) })} className="st-btn st-btn-sm st-btn-danger"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button type="button" onClick={() => update({ approvalRules: [...rules, { id: `rule-${Date.now()}`, name: 'New Rule', docTypes: ['PO', 'Invoice'], enabled: true, priority: 10, conditions: [], mode: 'sequential', steps: [{ order: 1, role: 'Manager', slaDays: 2, escalationDays: 4, canDelegate: true, substituteRole: '', escalationRole: '' }] }] })} className="st-btn st-btn-outline"><Plus className="w-3.5 h-3.5" /> Add Rule</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  BUDGET CONTROL                                                   */
  /* ================================================================ */
  const renderBudget = () => {
    const bc = settings?.budgetControl || { budgets: [] };
    const budgets = bc.budgets || [];
    const updateBc = (patch) => update({ budgetControl: { ...bc, ...patch } });
    const updateBudget = (index, patch) => {
      const next = [...budgets];
      next[index] = { ...next[index], ...patch };
      updateBc({ budgets: next });
    };
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info">
          Budget utilisation is computed LIVE from real PO and invoice records — never hardcoded. Validation runs when creating, submitting and approving purchase orders.
        </div>
        <div className="st-form-grid-3">
          <div className="st-toggle-row"><span className="st-toggle-row-label">Budget Control Enabled</span><ToggleSwitch checked={bc.enabled} onChange={() => updateBc({ enabled: !bc.enabled })} /></div>
          <div className="st-toggle-row"><span className="st-toggle-row-label">Block Approval When Exceeded</span><ToggleSwitch checked={bc.blockApprovalWhenExceeded} onChange={() => updateBc({ blockApprovalWhenExceeded: !bc.blockApprovalWhenExceeded })} /></div>
          <div className="st-toggle-row"><span className="st-toggle-row-label">Allow Exception Workflow</span><ToggleSwitch checked={bc.allowExceptionWorkflow} onChange={() => updateBc({ allowExceptionWorkflow: !bc.allowExceptionWorkflow })} /></div>
        </div>
        <label className="block st-input-wmax140"><span className={LABEL}>Fiscal Year</span><input value={bc.fiscalYear || ''} onChange={(e) => updateBc({ fiscalYear: e.target.value })} className={INPUT} /></label>
        <div className="st-table-wrap">
          <div className="st-table-scroll">
            <table className="st-table" style={{ minWidth: 820 }}>
              <thead>
                <tr>
                  <th style={{ minWidth: 130 }}>Department</th>
                  <th style={{ minWidth: 150 }}>Project</th>
                  <th style={{ minWidth: 130 }}>Cost Center</th>
                  <th style={{ width: 80 }}>FY</th>
                  <th className="st-td-right" style={{ width: 130 }}>Budget Amount</th>
                  <th className="st-td-center" style={{ width: 60 }}>Active</th>
                  <th className="st-td-center" style={{ width: 60 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((row, index) => (
                  <tr key={row.id || index}>
                    <td data-label="Department"><input value={row.department || ''} onChange={(e) => updateBudget(index, { department: e.target.value })} className={INPUT} placeholder="Any" /></td>
                    <td data-label="Project"><input value={row.project || ''} onChange={(e) => updateBudget(index, { project: e.target.value })} className={INPUT} placeholder="Any" /></td>
                    <td data-label="Cost Center"><input value={row.costCenter || ''} onChange={(e) => updateBudget(index, { costCenter: e.target.value })} className={INPUT} placeholder="Any" /></td>
                    <td data-label="FY"><input value={row.fiscalYear || ''} onChange={(e) => updateBudget(index, { fiscalYear: e.target.value })} className={`${INPUT} ${INPUT_SM}`} placeholder="Any" /></td>
                    <td data-label="Budget Amount" className="st-td-right"><input type="number" value={row.amount} onChange={(e) => updateBudget(index, { amount: Number(e.target.value) || 0 })} className={`${INPUT_R} st-input-wmax130`} /></td>
                    <td data-label="Active" className="st-td-center"><input type="checkbox" checked={row.active} onChange={() => updateBudget(index, { active: !row.active })} className={CHECK} /></td>
                    <td data-label="Actions" className="st-td-actions"><button type="button" onClick={() => updateBc({ budgets: budgets.filter((_, i) => i !== index) })} className={ICON_BTN(true)}><Trash2 className="w-3.5 h-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <button type="button" onClick={() => updateBc({ budgets: [...budgets, { id: `budget-${Date.now()}`, department: '', project: '', costCenter: '', fiscalYear: bc.fiscalYear || '', amount: 0, active: true }] })} className="st-btn st-btn-outline"><Plus className="w-3.5 h-3.5" /> Add Budget</button>
      </div>
    );
  };

  /* ================================================================ */
  /*  3-WAY MATCHING                                                   */
  /* ================================================================ */
  const renderMatching = () => {
    const m = settings?.matching || { tolerances: {} };
    const tol = m.tolerances || {};
    const updateTol = (key, value) => update({ matching: { ...m, tolerances: { ...tol, [key]: value } } });
    return (
      <div className="st-space-y-4">
        <div className="st-banner st-banner-info">
          Every invoice line is compared against the PO and GRN for quantity, rate, tax and value. Invoice approval is blocked when the matching rules require a successful match.
        </div>
        <div className="st-form-grid-3">
          <div className="st-toggle-row"><span className="st-toggle-row-label">Matching Enabled</span><ToggleSwitch checked={m.enabled !== false} onChange={() => update({ matching: { ...m, enabled: m.enabled === false } })} /></div>
          <div className="st-toggle-row"><span className="st-toggle-row-label">Require Full Match</span><ToggleSwitch checked={m.requireMatchToApprove !== false} onChange={() => update({ matching: { ...m, requireMatchToApprove: m.requireMatchToApprove === false } })} /></div>
          <div className="st-toggle-row"><span className="st-toggle-row-label">Allow Manual Override</span><ToggleSwitch checked={m.allowOverride !== false} onChange={() => update({ matching: { ...m, allowOverride: m.allowOverride === false } })} /></div>
        </div>
        <div className="st-form-grid-4">
          <label className="block"><span className={LABEL}>Quantity Tolerance %</span><input type="number" min="0" step="any" value={tol.quantityPct ?? 0} onChange={(e) => updateTol('quantityPct', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Rate Tolerance %</span><input type="number" min="0" step="any" value={tol.ratePct ?? 0} onChange={(e) => updateTol('ratePct', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Tax Tolerance %</span><input type="number" min="0" step="any" value={tol.taxPct ?? 0} onChange={(e) => updateTol('taxPct', Number(e.target.value) || 0)} className={INPUT} /></label>
          <label className="block"><span className={LABEL}>Total Value Tolerance %</span><input type="number" min="0" step="any" value={tol.valuePct ?? 2} onChange={(e) => updateTol('valuePct', Number(e.target.value) || 0)} className={INPUT} /></label>
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
      case 'approval': return renderApproval();
      case 'approvalRules': return renderApprovalRules();
      case 'budget': return renderBudget();
      case 'matching': return renderMatching();
      case 'tax': return renderTax();
      case 'currency': return <CurrencyExchangeSection settings={settings} update={update} mode="currency" />;
      case 'exchangeRates': return <CurrencyExchangeSection settings={settings} update={update} mode="exchange" />;
      case 'currencyExchange': return <CurrencyExchangeSection settings={settings} update={update} mode="both" />;
      case 'payment': return renderPayment();
      case 'company': return renderCompany();
      case 'numbering': return renderNumbering();
      case 'workflow': return renderWorkflow();
      case 'notifications': return renderNotifications();
      case 'audit': return renderAudit();
      case 'logistics': return renderLogistics();
      case 'pdf': return renderPdf();
      case 'terms': return renderTerms();
      case 'hsn': return <HsnSacSettings />;
      case 'items': return <ItemCatalogSettings />;
      case 'access': return <AccessManagement />;
      case 'procurementDefaults': return renderProcurementDefaults();
      default: return renderHealth();
    }
  };

  /* ================================================================ */
  /*  RENDER                                                            */
  /* ================================================================ */
  if (loading) {
    return (
      <PurchasePageLayout className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        crumb="Purchase · Settings"
        title="Purchase Settings"
        subtitle="Configure procurement rules, finance, workflow, documents and company preferences"
        actions={
          <>
            <button type="button" onClick={refresh} className="st-btn st-btn-ghost" title="Re-read the last saved settings (unsaved edits are discarded)"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
            <button type="button" onClick={() => setConfirmReset(true)} disabled={!canEditSettings} className="st-btn st-btn-ghost disabled:opacity-60 disabled:cursor-not-allowed" title={canEditSettings ? 'Restore the last saved settings (unsaved edits are discarded)' : 'Your Purchase access does not allow editing settings'}><Undo2 className="w-3.5 h-3.5" /> Reset</button>
            <button type="button" onClick={save} disabled={saving || !canEditSettings} className="st-btn st-btn-primary disabled:opacity-60 disabled:cursor-not-allowed" title={canEditSettings ? 'Save every section' : 'Your Purchase access does not allow editing settings'}>{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Settings</button>
          </>
        }
      />
      <ModuleTabNav module="settings" />
      {error && <div className="st-banner st-banner-danger flex items-center justify-between gap-3 mb-4"><p className="st-text-xs st-text-semibold">{error?.message || 'Failed to load settings.'}</p><button type="button" onClick={refresh} className="st-text-xs st-text-bold underline cursor-pointer">Retry</button></div>}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 mt-5 items-start">
        <nav className="st-sidebar lg:sticky lg:top-20">
          {SECTIONS.filter((sec) => !sec.adminOnly || isAdmin).map((sec) => {
            const Icon = sec.icon;
            const isActive = section === sec.key;
            return (
              <button key={sec.key} type="button" onClick={() => setSection(sec.key)} className={`st-nav-item ${isActive ? 'st-nav-active' : ''}`}>
                <Icon className={isActive ? 'st-text-accent' : sec.color} />
                <span className="truncate">{sec.label}</span>
              </button>
            );
          })}
        </nav>
        <div><PurchaseSectionCard>{renderSection()}</PurchaseSectionCard></div>
      </div>

      <ConfirmDialog open={confirmReset} title="Discard unsaved changes?" message="Restore the last saved settings? Any edits made since the last Save will be lost." confirmLabel="Restore Saved" variant="warning" icon={Undo2} onConfirm={async () => { setConfirmReset(false); await load(); toast.success('Restored last saved settings'); }} onCancel={() => setConfirmReset(false)} />
      <ConfirmDialog open={confirmFactoryReset} title="Reset all settings to system defaults" message="This overwrites the saved configuration with the factory defaults and cannot be undone." confirmLabel="Reset All" variant="danger" icon={RefreshCw} loading={saving} onConfirm={async () => { setSaving(true); try { const data = await settingsService.resetSettings(); setSettings(data); const h = await settingsService.getConfigHealth(); setHealth(h); toast.success('Settings reset to system defaults'); } catch (err) { toast.error(err?.message || 'Reset failed'); } finally { setSaving(false); setConfirmFactoryReset(false); } }} onCancel={() => !saving && setConfirmFactoryReset(false)} />
      <ConfirmDialog open={confirmResetSection !== null} title={`Reset ${confirmResetSection} numbering`} message={`Reset the ${confirmResetSection || ''} document counter to its starting number?`} confirmLabel="Reset Counter" variant="warning" icon={RefreshCw} onConfirm={async () => { if (confirmResetSection) { try { const updated = await settingsService.resetNumbering(confirmResetSection); setSettings(updated); toast.success(`${confirmResetSection} numbering reset`); } catch (err) { toast.error(err?.message || 'Reset failed'); } } setConfirmResetSection(null); }} onCancel={() => setConfirmResetSection(null)} />
    </PurchasePageLayout>
  );
}
