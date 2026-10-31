/**
 * dropdownManager.js
 * ------------------------------------------------------------------
 * Reusable, strictly-frontend dropdown option management for Leads,
 * Clients and Follow-ups.
 *
 * Every manageable option list ("category") is identified by a key and
 * has a base list (the ERP list) that users can extend and re-label.
 * User changes (added values, renames, disabled values) are stored as a
 * small overlay in localStorage, layered on top of the base list at read
 * time — so the ERP base list stays authoritative, existing records keep
 * their stored values, and the configuration survives page refresh.
 *
 * Behaviour guaranteed by every consumer:
 *   - Add        : case-insensitive duplicate prevention against base+added.
 *   - Edit       : re-label an option (existing records keep their value).
 *   - Disable    : value disappears from *new* selections; existing records
 *                  still display the previously selected value.
 *
 * For Lead Stage / Lead Status the backend stores enum values, so:
 *   - Renames are a display-layer re-label (stageToApiLabel() resolves the
 *     original enum label before any API call, so the backend keeps working).
 *   - Values outside the ERP pipeline are visible on the board but cannot be
 *     persisted — the existing backend validation surfaces an honest error.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { Star, Phone, CheckCircle2, FileText, Send, Handshake, Trophy, XCircle } from 'lucide-react';
import { STAGES, STAGE_BY_VALUE } from './leadConstants';
import CURRENCIES from '../data/erpCurrencies.json';

const STORAGE_KEY = 'vishak:dropdown-manager:v1';
const CHANGE_EVENT = 'vishak:dropdown-manager:change';

// ---- Registry of manageable flat option lists -----------------------------
// base = the ERP option list (single source of truth). Values are strings.
export const FLAT_CATEGORIES = {
  lead_stage: {
    label: 'Lead Stage',
    base: STAGES.map((s) => s.value)
  },
  lead_priority: {
    label: 'Lead Priority',
    base: ['Low', 'Medium', 'High', 'Urgent']
  },
  lead_status: {
    label: 'Lead Status',
    base: ['Active', 'Inactive']
  },
  lead_source: {
    label: 'Lead Source',
    // ERP js/leads.js _populateFormDropdowns — exact list
    base: [
      'Website', 'Referral', 'LinkedIn', 'Trade Show', 'Email Campaign',
      'Cold Call', 'Partner', 'Social Media', 'Word of Mouth', 'Other'
    ]
  },
  lead_industry: {
    label: 'Lead Industry',
    // ERP js/leads.js _populateFormDropdowns — exact list
    base: [
      'Information Technology', 'Retail', 'Telecommunications', 'Energy', 'Banking',
      'Manufacturing', 'Pharmaceuticals', 'Construction', 'Healthcare', 'Education',
      'Hospitality', 'Real Estate', 'Transportation', 'Media', 'Other'
    ]
  },
  lead_business_type: {
    label: 'Business Type',
    base: ['Sole Proprietorship', 'Partnership', 'Private Limited', 'LLP', 'Public Limited']
  },
  fu_mode: {
    label: 'Follow-up Mode',
    // ERP followup-create.html — exact list
    base: ['Call', 'Email', 'WhatsApp', 'Meeting', 'Site Visit', 'Demo', 'Video Call', 'Other']
  },
  fu_priority: {
    label: 'Follow-up Priority',
    base: ['Low', 'Medium', 'High', 'Urgent']
  },
  fu_status: {
    label: 'Follow-up Status',
    base: ['Open', 'Pending', 'Completed', 'Missed', 'Cancelled', 'Rescheduled', 'In Progress']
  },
  fu_outcome: {
    label: 'Follow-up Outcome',
    base: [
      'Interested', 'Not Interested', 'Follow-up Required', 'Quotation Sent',
      'Negotiation', 'Won', 'Lost', 'No Response', 'Callback Requested'
    ]
  },
  fu_reminder: {
    label: 'Follow-up Reminder',
    base: [
      '15 Minutes Before', '30 Minutes Before', '1 Hour Before', 'Same Day',
      '1 Day Before', '2 Days Before', '1 Week Before'
    ]
  },
  fu_reminder_type: {
    label: 'Reminder Type',
    base: ['Email', 'SMS', 'WhatsApp', 'Push Notification', 'Phone Call']
  }
};

// Base stage metadata for the Kanban (ERP lead-pipeline colours + icons).
export const STAGE_META = {
  New: { color: '#6b7280', icon: Star },
  Contacted: { color: '#0B4A3D', icon: Phone },
  Qualified: { color: '#065f46', icon: CheckCircle2 },
  Proposal: { color: '#d97706', icon: FileText },
  'Proposal Sent': { color: '#d97706', icon: Send },
  Negotiation: { color: '#9d174d', icon: Handshake },
  Won: { color: '#059669', icon: Trophy },
  Lost: { color: '#dc2626', icon: XCircle }
};

export const PRIORITY_META = {
  Low: { color: '#6b7280' },
  Medium: { color: '#d97706' },
  High: { color: '#dc2626' },
  Urgent: { color: '#7c3aed' }
};

// ---- Persistence -----------------------------------------------------------
function readStore() {
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function writeStore(store) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota / serialization errors are best-effort — the UI still works.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

/** Subscribe to any option-list change (same tab + cross-tab). Returns unsubscribe. */
export function subscribeDropdownChanges(cb) {
  const handler = () => cb();
  window.addEventListener(CHANGE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHANGE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

/** React hook: bump whenever option lists change so selects re-render. */
export function useDropdownVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeDropdownChanges(() => setVersion((v) => v + 1)), []);
  return version;
}

// ---- Helpers ---------------------------------------------------------------
const norm = (v) => String(v == null ? '' : v).trim();
const normKey = (v) => norm(v).toLowerCase();

function flatOverlay(categoryKey) {
  const store = readStore();
  return store.flat?.[categoryKey] || {};
}

/** Reverse a rename: given an effective value, return the base/original value. */
export function resolveOriginal(categoryKey, value) {
  const renames = flatOverlay(categoryKey).renames || {};
  const found = Object.keys(renames).find((old) => normKey(renames[old]) === normKey(value));
  return found || norm(value);
}

/** Forward rename: given a base/stored value, return its managed display label. */
export function displayFor(categoryKey, value) {
  const renames = flatOverlay(categoryKey).renames || {};
  const v = norm(value);
  return renames[v] || v;
}

// ---- Flat option lists -----------------------------------------------------
/**
 * Effective options for a category.
 * @returns [{ value, original, enabled }]
 */
export function getFlatOptions(categoryKey) {
  const cat = FLAT_CATEGORIES[categoryKey];
  if (!cat) return [];
  const overlay = flatOverlay(categoryKey);
  const renames = overlay.renames || {};
  const disabled = (overlay.disabled || []).map(normKey);
  const base = cat.base || [];
  const added = overlay.added || [];
  const seen = new Set();
  const out = [];
  for (const raw of [...base, ...added]) {
    const value = renames[raw] || raw;
    const k = normKey(value);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ value, original: raw, enabled: !disabled.includes(k) });
  }
  return out;
}

/** Options a user may newly select (disabled values are hidden). */
export function getEnabledOptions(categoryKey) {
  return getFlatOptions(categoryKey).filter((o) => o.enabled);
}

// ---- Flat mutations (Add / Edit / Enable-Disable) --------------------------
export function addFlatValue(categoryKey, value) {
  const v = norm(value);
  if (!v) return { ok: false, error: 'Value cannot be empty' };
  if (getFlatOptions(categoryKey).some((o) => normKey(o.value) === normKey(v))) {
    return { ok: false, error: `"${v}" already exists` };
  }
  const store = readStore();
  store.flat = store.flat || {};
  store.flat[categoryKey] = store.flat[categoryKey] || {};
  store.flat[categoryKey].added = [...(store.flat[categoryKey].added || []), v];
  writeStore(store);
  return { ok: true };
}

export function renameFlatValue(categoryKey, oldValue, newValue) {
  const target = norm(newValue);
  if (!target) return { ok: false, error: 'Value cannot be empty' };
  const opts = getFlatOptions(categoryKey);
  if (opts.some((o) => normKey(o.value) === normKey(target) && normKey(o.value) !== normKey(oldValue))) {
    return { ok: false, error: `"${target}" already exists` };
  }
  const original = resolveOriginal(categoryKey, oldValue);
  const store = readStore();
  store.flat = store.flat || {};
  store.flat[categoryKey] = store.flat[categoryKey] || {};
  store.flat[categoryKey].renames = { ...(store.flat[categoryKey].renames || {}), [original]: target };
  writeStore(store);
  return { ok: true };
}

export function setFlatEnabled(categoryKey, value, enabled) {
  const original = resolveOriginal(categoryKey, value);
  const store = readStore();
  store.flat = store.flat || {};
  store.flat[categoryKey] = store.flat[categoryKey] || {};
  const disabled = (store.flat[categoryKey].disabled || []).filter((d) => normKey(d) !== normKey(original));
  if (!enabled) disabled.push(original);
  store.flat[categoryKey].disabled = disabled;
  writeStore(store);
  return { ok: true };
}

// ---- Backend-backed master keys (EditableMasterDropdown) -------------------
// The options themselves live in MySQL via /masters/{key}; only the
// enable/disable state is a frontend overlay (keyed by the master key).
export function isValueDisabled(categoryKey, value) {
  return (flatOverlay(categoryKey).disabled || []).some((d) => normKey(d) === normKey(value));
}

export function setValueDisabled(categoryKey, value, disabled) {
  const store = readStore();
  store.flat = store.flat || {};
  store.flat[categoryKey] = store.flat[categoryKey] || {};
  const list = (store.flat[categoryKey].disabled || []).filter((d) => normKey(d) !== normKey(value));
  if (disabled) list.push(value);
  store.flat[categoryKey].disabled = list;
  writeStore(store);
  return { ok: true };
}

// ---- Stage helpers ---------------------------------------------------------
/** Resolve a stage label to the backend-persistable (original enum) label. */
export function stageToApiLabel(value) {
  return resolveOriginal('lead_stage', value);
}

/** Stage metadata for the Kanban column header (colour + icon). */
export function stageMeta(value) {
  const original = resolveOriginal('lead_stage', value);
  return STAGE_META[original] || { color: '#6b7280', icon: Star };
}

/** Stage chip classes for badges (list view / modals). */
export function stageChip(value) {
  const original = resolveOriginal('lead_stage', value);
  return STAGE_BY_VALUE[original]?.chip || 'bg-slate-100 text-slate-600 border border-slate-200';
}

/** Priority preview colour (Change Priority modal). */
export function priorityMeta(value) {
  const original = resolveOriginal('lead_priority', value);
  return PRIORITY_META[original] || { color: '#6b7280' };
}

// ---- Currency ---------------------------------------------------------------
// Overlay: { added: [{code, symbol, name}], disabled: [code], edited: { code: {symbol,name} } }
export function getCurrencies() {
  const overlay = readStore().currency || {};
  const edited = overlay.edited || {};
  const disabled = (overlay.disabled || []).map(normKey);
  const base = CURRENCIES.map((c) => ({
    code: c.code,
    symbol: edited[c.code]?.symbol ?? c.symbol,
    name: edited[c.code]?.name ?? c.name,
    enabled: !disabled.includes(normKey(c.code)),
    original: c.code,
    added: false
  }));
  const added = (overlay.added || []).map((c) => ({
    code: c.code,
    symbol: c.symbol,
    name: c.name,
    enabled: !disabled.includes(normKey(c.code)),
    original: c.code,
    added: true
  }));
  const seen = new Set();
  return [...base, ...added].filter((c) => {
    const k = normKey(c.code);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function getEnabledCurrencies() {
  return getCurrencies().filter((c) => c.enabled);
}

export function addCurrency({ code, symbol, name }) {
  const c = norm(code);
  if (!c) return { ok: false, error: 'Currency code is required' };
  if (getCurrencies().some((x) => normKey(x.code) === normKey(c))) {
    return { ok: false, error: `Currency "${c}" already exists` };
  }
  const store = readStore();
  store.currency = store.currency || {};
  store.currency.added = [...(store.currency.added || []), { code: c, symbol: norm(symbol) || c, name: norm(name) || c }];
  writeStore(store);
  return { ok: true };
}

export function editCurrency(code, { symbol, name }) {
  const store = readStore();
  store.currency = store.currency || {};
  store.currency.edited = { ...(store.currency.edited || {}), [norm(code)]: { symbol: norm(symbol), name: norm(name) } };
  writeStore(store);
  return { ok: true };
}

export function setCurrencyEnabled(code, enabled) {
  const store = readStore();
  store.currency = store.currency || {};
  const disabled = (store.currency.disabled || []).filter((d) => normKey(d) !== normKey(code));
  if (!enabled) disabled.push(code);
  store.currency.disabled = disabled;
  writeStore(store);
  return { ok: true };
}
