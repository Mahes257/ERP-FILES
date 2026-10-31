/**
 * purchase/services/base.js
 * ------------------------------------------------------------------
 * Shared mock-service infrastructure for the Purchase module.
 * Provides lazy localStorage-backed collections and date helpers.
 * Nothing touches the browser at import time, so these services can
 * be imported anywhere (including Node tests).
 *
 * Collections are initialised empty — no seed data is auto-loaded.
 * localStorage is used for genuine UI state and user-created business
 * records (column preferences, form drafts, vendor records, RFQs, etc.).
 * ------------------------------------------------------------------
 */

export const LATENCY_MS = 0;

export const storageKeys = {
  requisitions: 'purchase-requisitions-v5',
  vendors: 'purchase-vendors-v4',
  rfqs: 'purchase-rfqs-v5',
  quotations: 'purchase-quotations-v4',
  orders: 'purchase-orders-v3',
  invoices: 'purchase-invoices-v2',
  adjustmentNotes: 'purchase-adjustment-notes-v1',
  advices: 'purchase-payment-advices-v1',
  evaluations: 'purchase-evaluations-v1',
  rfqFollowUps: 'purchase-rfq-followups-v1',
  settings: 'purchase-settings-v1',
  nfas: 'purchase-nfas-v1',
  vendorDocuments: 'purchase-vendor-documents-v1',
  manufacturing: 'purchase-manufacturing-v2',
  shipments: 'purchase-shipments-v2',
  grns: 'purchase-grns-v2',
  inspections: 'purchase-inspections-v2',
  inventory: 'purchase-inventory-v2',
  documents: 'purchase-documents-v2',
  notifications: 'purchase-notifications-v1'
};

/* ------------------------------------------------------------------
 * One-time storage cleanup — removes stale seeded/demo business data
 * left in localStorage by earlier versions of the application. Runs
 * exactly once; subsequent page loads are unaffected.
 *
 * Bump CLEANUP_VERSION when another round of demo-data removal is
 * needed (e.g. after a new seed function is added and then removed).
 * ------------------------------------------------------------------ */
const CLEANUP_VERSION = 3;
const CLEANUP_KEY = 'purchase-data-cleanup-v';

/** Prefixes for Purchase form-draft localStorage keys. */
const DRAFT_PREFIXES = [
  'purchase.pr.draft',
  'purchase.rfq.draft',
  'purchase.quotation.draft',
  'purchase.po.draft',
  'purchase.invoice.draft',
  'purchase.vendor.draft',
  'purchase.mfr.draft',
  'purchase.shipment.draft',
  'purchase.grn.draft',
  'purchase.inspection.draft',
  'purchase.inventory.draft',
  'purchase.nfa.draft',
  'purchase.document.draft',
];

function runStorageCleanup() {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const flag = Number(localStorage.getItem(`${CLEANUP_KEY}${CLEANUP_VERSION}`));
    if (flag === CLEANUP_VERSION) return; // already cleaned
    /* Remove every Purchase business-data collection so the app starts
       with empty counts and empty tables. This does NOT touch:
       · master data (purchase.masters.v1.*) — dropdown defaults
       · column preferences (vishak:*:columns) — user UI choices
       · item catalog (purchase.itemCatalog.v1) — product metadata */
    Object.values(storageKeys).forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    /* Remove stale Purchase form drafts left by earlier testing runs.
       Prefixes cover every entity type that uses useFormDraft. */
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && DRAFT_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => {
      try { localStorage.removeItem(key); } catch { /* ignore */ }
    });
    /* Mark cleanup as complete. */
    localStorage.setItem(`${CLEANUP_KEY}${CLEANUP_VERSION}`, String(CLEANUP_VERSION));
  } catch {
    /* Storage unavailable or full — skip silently. */
  }
}

/* Run cleanup at module-load time (once per page/session). */
runStorageCleanup();

export const clone = (value) => JSON.parse(JSON.stringify(value));

export const delay = (ms = LATENCY_MS) => new Promise((resolve) => setTimeout(resolve, ms));

export function todayLocal() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

export function readStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`[purchase] Failed to read ${key} from storage.`, error);
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[purchase] Failed to persist ${key}.`, error);
  }
  notifyDataChange();
}

/* Lightweight change bus — fired whenever any Purchase collection is
   persisted. Lets cross-cutting consumers (e.g. the sidebar count
   badges) recompute from the same mock/services layer the pages use,
   so the sidebar never carries its own stale copy of the data. */
const dataListeners = new Set();

export function subscribePurchaseData(listener) {
  dataListeners.add(listener);
  return () => {
    dataListeners.delete(listener);
  };
}

function notifyDataChange() {
  dataListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* A listener must never break persistence. */
    }
  });
}

/** Window event fired after a SUCCESSFUL Purchase API write (create /
 *  update / approve / reject / delete …). The backend is the source of
 *  truth in API mode, so there is no local storage write to hook into —
 *  this event lets cross-cutting consumers (the sidebar badge counts)
 *  refresh in place after a mutation instead of re-querying every
 *  endpoint on every route change. */
export const PURCHASE_DATA_CHANGED_EVENT = 'erp:purchase-data-changed';

export function notifyPurchaseDataChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PURCHASE_DATA_CHANGED_EVENT));
}

/**
 * Lazy collection backed by localStorage. `all` seeds on first access
 * (only then touching localStorage), so importing a service is safe
 * in any environment. `persist` writes back after mutations.
 *
 * seedBuilder returns [] by default — no demo data is injected.
 * Real data is loaded from the REST API via withFallback().
 */
export function createCollection(key, seedBuilder) {
  let cache = null;

  const ensure = () => {
    if (cache) return cache;
    const stored = readStorage(key);
    if (stored != null && (Array.isArray(stored) || typeof stored === 'object')) {
      cache = stored;
      return cache;
    }
    cache = seedBuilder();
    writeStorage(key, cache);
    return cache;
  };

  return {
    get all() {
      return ensure();
    },
    persist(list) {
      cache = list;
      writeStorage(key, list);
    },
    reset() {
      cache = null;
    }
  };
}

export function countStatus(statuses, value) {
  return statuses.filter((status) => status === value).length;
}

/** Applies pagination + simple equality filters to a record list. */
export function paginate(records, { page = 1, pageSize = 10 } = {}) {
  const total = records.length;
  const start = (page - 1) * pageSize;
  const pageRecords = records.slice(start, start + pageSize);
  return {
    data: clone(pageRecords),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}
