/**
 * purchase/services/masterStore.js
 * ------------------------------------------------------------------
 * Master-data store for the Purchase module (frontend only).
 *
 * Every master dropdown in the Purchase forms (Department, Requester,
 * Buyer, Vendor, Company, Branch, Project, Category, UOM, GST Type,
 * Warehouse, Location, Delivery Address, Transport Mode, Incoterm,
 * Currency, Payment Terms, Cost Center, Priority) reads and writes
 * through this single module.
 *
 * Persistence today is localStorage; the API surface is deliberately
 * async (Promise-based) and result-shaped ({ ok, item, error }) so that
 * swapping localStorage for a real backend later only requires
 * replacing the bodies of these functions — callers stay untouched.
 *
 * Items are { id, name, system }. `system: true` marks seeded defaults,
 * which cannot be deleted (renames are allowed for custom items only).
 * ------------------------------------------------------------------
 */
import {
  BRANCHES, BUYERS, COMPANIES, COST_CENTERS, CURRENCIES, DELIVERY_ADDRESSES,
  DEPARTMENTS, GST_TYPES, HSN_SAC, INCOTERMS, ITEM_CATEGORIES, LOCATIONS, PAYMENT_TERMS,
  PRIORITIES, PROJECTS, PR_TYPES, TRANSPORT_MODES, UNITS, USERS, VENDORS, WAREHOUSES
} from '../constants';

/** Master definitions: key → { label, default values (seeds) }. */
export const MASTER_DEFS = {
  departments: { label: 'Department', defaults: DEPARTMENTS },
  requesters: { label: 'Requester', defaults: USERS },
  buyers: { label: 'Buyer', defaults: BUYERS },
  vendors: { label: 'Vendor', defaults: VENDORS.map((v) => v.name) },
  companies: { label: 'Company', defaults: COMPANIES },
  branches: { label: 'Branch', defaults: BRANCHES },
  projects: { label: 'Project', defaults: PROJECTS },
  categories: { label: 'Category', defaults: ITEM_CATEGORIES },
  uoms: { label: 'UOM', defaults: UNITS },
  gstTypes: { label: 'GST Type', defaults: GST_TYPES },
  warehouses: { label: 'Warehouse', defaults: WAREHOUSES },
  locations: { label: 'Location', defaults: LOCATIONS },
  deliveryAddresses: { label: 'Delivery Address', defaults: DELIVERY_ADDRESSES },
  transportModes: { label: 'Transport Mode', defaults: TRANSPORT_MODES },
  incoterms: { label: 'Incoterm', defaults: INCOTERMS },
  currencies: { label: 'Currency', defaults: CURRENCIES },
  paymentTerms: { label: 'Payment Terms', defaults: PAYMENT_TERMS },
  costCenters: { label: 'Cost Center', defaults: COST_CENTERS },
  priorities: { label: 'Priority', defaults: PRIORITIES },
  hsnCodes: { label: 'HSN / SAC', defaults: HSN_SAC },
  prTypes: { label: 'PR Type', defaults: PR_TYPES }
};

export const MASTER_KEYS = Object.keys(MASTER_DEFS);

const STORAGE_PREFIX = 'purchase.masters.v1.';

/* In-memory cache + subscriber registry (all within this module, so the
   API swap later does not leak into components). */
const cache = new Map();
const subscribers = new Map();

function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x';
}

function seed(key) {
  return MASTER_DEFS[key].defaults.map((name) => ({
    id: `sys-${slugify(name)}`,
    name: String(name).trim(),
    system: true
  }));
}

function persist(key, items) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(items));
  } catch {
    /* storage full / unavailable — keep in-memory only */
  }
}

function loadFromStorage(key) {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    /* corrupt entry — fall through to seeds */
  }
  return null;
}

function getItems(key) {
  if (!MASTER_DEFS[key]) throw new Error(`Unknown master key: ${key}`);
  if (!cache.has(key)) {
    const stored = loadFromStorage(key);
    const base = seed(key);

    /* Self-heal + canonical ordering: a stored master can lag behind the
       current seed. The currency master in particular was cached with
       only 5 codes in an older build — without healing, that stale list
       would permanently limit every CurrencySelect (Vendor, Requisition,
       RFQ, PO) to those few codes instead of the full ISO-4217 master.
       Rebuild the list as the current system seeds in seed order (kept
       stored values when present), then custom user-added values in
       stored order. Custom additions are preserved and system defaults
       are re-added, so a master can never shrink — and every dropdown
       sorts identically to a fresh install. */
    if (stored && Array.isArray(stored) && stored.length > 0) {
      const lowerName = (item) => String(item?.name || '').trim().toLowerCase();
      const byName = new Map(stored.map((item) => [lowerName(item), item]));
      const seedNames = new Set(base.map((seedItem) => seedItem.name.trim().toLowerCase()));
      const custom = stored.filter((item) => !seedNames.has(lowerName(item)));
      const merged = [
        ...base.map((seedItem) => byName.get(seedItem.name.trim().toLowerCase()) || seedItem),
        ...custom
      ];
      if (merged.length !== stored.length || merged.some((item, index) => item !== stored[index])) {
        persist(key, merged);
      }
      cache.set(key, merged);
      return cache.get(key);
    }

    cache.set(key, base);
  }
  return cache.get(key);
}

function notify(key) {
  const set = subscribers.get(key);
  if (set) {
    const items = [...getItems(key)];
    set.forEach((cb) => cb(items));
  }
}

function persistAndNotify(key) {
  persist(key, getItems(key));
  notify(key);
}

/* ============================ PUBLIC API ============================ */

/** Resolve the full list of items for a master.
 *  ALWAYS returns an array — callers can safely call .map(), .filter(),
 *  .find(), .length, etc. without additional guards.
 *
 *  If the key is unknown, throws (callers should catch if needed).
 *  If the internal store is somehow corrupted, returns an empty array
 *  rather than throwing — the error is logged but never surfaces as a
 *  TypeError on the consumer.
 */
export function listMaster(key) {
  try {
    const items = getItems(key);
    if (!Array.isArray(items)) {
      console.warn(`[masterStore] listMaster('${key}') returned non-array, falling back to []`);
      return [];
    }
    return [...items];
  } catch (err) {
    console.error(`[masterStore] listMaster('${key}') failed:`, err);
    return [];
  }
}

/** Subscribe to changes for a master. Returns an unsubscribe fn. */
export function subscribeMaster(key, callback) {
  if (!subscribers.has(key)) subscribers.set(key, new Set());
  subscribers.get(key).add(callback);
  return () => {
    subscribers.get(key)?.delete(callback);
  };
}

/**
 * Add a value to a master. Rejects duplicates (case-insensitive, trimmed).
 * Result: { ok, item } | { ok: false, error: 'EMPTY' | 'DUPLICATE' }.
 */
export async function addMasterItem(key, name) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: 'EMPTY' };
  const items = getItems(key);
  if (items.some((i) => i.name.trim().toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: 'DUPLICATE' };
  }
  const item = {
    id: `cust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    system: false
  };
  items.push(item);
  persistAndNotify(key);
  return { ok: true, item };
}

/**
 * Rename a value in a master. Rejects duplicates.
 * Result: { ok, item, previousName } | { ok: false, error }.
 */
export async function renameMasterItem(key, id, name) {
  const clean = String(name || '').trim();
  if (!clean) return { ok: false, error: 'EMPTY' };
  const items = getItems(key);
  const target = items.find((i) => i.id === id);
  if (!target) return { ok: false, error: 'NOT_FOUND' };
  if (items.some((i) => i.id !== id && i.name.trim().toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: 'DUPLICATE' };
  }
  const previousName = target.name;
  target.name = clean;
  persistAndNotify(key);
  return { ok: true, item: { ...target }, previousName };
}

/**
 * Delete a value from a master. System defaults cannot be deleted.
 * Result: { ok, item } | { ok: false, error: 'NOT_FOUND' | 'SYSTEM' }.
 */
export async function removeMasterItem(key, id) {
  const items = getItems(key);
  const target = items.find((i) => i.id === id);
  if (!target) return { ok: false, error: 'NOT_FOUND' };
  if (target.system) return { ok: false, error: 'SYSTEM' };
  cache.set(key, items.filter((i) => i.id !== id));
  persistAndNotify(key);
  return { ok: true, item: { ...target } };
}
