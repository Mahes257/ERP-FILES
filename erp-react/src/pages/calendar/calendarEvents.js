/**
 * pages/calendar/calendarEvents.js
 * ------------------------------------------------------------------
 * The event catalogue and the FRONTEND-ONLY store behind the standalone
 * Calendar module.
 *
 * Scope note (this phase is UI only): there is no calendar API yet. Events
 * therefore live in this browser (localStorage) behind a tiny read/write pair,
 * so the whole feature is exercised end to end without inventing an endpoint,
 * touching the shared MySQL data or pretending a backend call happened. When a
 * real calendar service lands, `listEvents`/`saveEvents` are the only two
 * functions that have to change — every view consumes the in-memory list.
 *
 * Categories mirror the ERP's top-level areas rather than every submodule: the
 * calendar stays readable (one colour per area) while an event still records
 * which area it belongs to, so later backend integrations
 * (Sales Execution, Purchase, Production, Marketing, Engineering, Accounts…)
 * can map onto a stable key.
 */

const STORAGE_KEY = 'erp-calendar-events';

/**
 * The seven areas an ERP calendar entry can belong to. `color` is the solid
 * accent (left rule / dot / chip text), `tint` the soft wash behind it — both
 * chosen from the palette the ERP already uses for status colours.
 */
export const ERP_CATEGORIES = [
  { key: 'sales', label: 'Sales Execution', short: 'Sales', color: '#0B4A3D', tint: '#E8F0EE', tintDark: 'rgba(60, 178, 152, 0.20)' },
  { key: 'crm', label: 'CRM & Leads', short: 'CRM', color: '#2563EB', tint: '#EFF6FF', tintDark: 'rgba(96, 165, 250, 0.20)' },
  { key: 'marketing', label: 'Marketing', short: 'Marketing', color: '#0E7490', tint: '#ECFEFF', tintDark: 'rgba(34, 211, 238, 0.18)' },
  { key: 'purchase', label: 'Purchase & Logistics', short: 'Purchase', color: '#B45309', tint: '#FFF7ED', tintDark: 'rgba(251, 191, 36, 0.20)' },
  { key: 'production', label: 'Production & Quality', short: 'Production', color: '#7C3AED', tint: '#F5F3FF', tintDark: 'rgba(167, 139, 250, 0.22)' },
  { key: 'engineering', label: 'Engineering Design', short: 'Design', color: '#0369A1', tint: '#F0F9FF', tintDark: 'rgba(56, 189, 248, 0.18)' },
  { key: 'general', label: 'General / Other', short: 'General', color: '#475569', tint: '#F1F5F9', tintDark: 'rgba(148, 163, 184, 0.18)' }
];

export const CATEGORY_MAP = Object.fromEntries(ERP_CATEGORIES.map((entry) => [entry.key, entry]));

/**
 * The categories the filter row shows, in display order.
 *
 * CRM and Engineering Design are deliberately absent from the CHIP ROW only:
 * they stay fully defined in ERP_CATEGORIES (key, colour, label) and their
 * events keep rendering. A category with no chip can never be switched off, so
 * omitting it here cannot hide or discard anything — the page treats every key
 * outside this list as permanently visible.
 */
export const CALENDAR_FILTER_CATEGORY_KEYS = [
  'marketing',
  'sales',
  'purchase',
  'production',
  'general'
];

export const DEFAULT_CATEGORY_KEY = 'general';

/** Falls back to the neutral area for an unknown/absent key — never throws. */
export function categoryFor(key) {
  return CATEGORY_MAP[key] || CATEGORY_MAP[DEFAULT_CATEGORY_KEY];
}

/** A blank draft used by the Add Event form (today, next full hour, one hour long). */
export function emptyDraft(dateKey, startTime = '09:00', endTime = '10:00') {
  return {
    id: null,
    title: '',
    date: dateKey,
    start: startTime,
    end: endTime,
    category: DEFAULT_CATEGORY_KEY,
    description: ''
  };
}

/** Event → the exact draft shape the form edits. */
export function toDraft(event) {
  return {
    id: event?.id ?? null,
    title: event?.title ?? '',
    date: event?.date ?? '',
    start: event?.start ?? '',
    end: event?.end ?? '',
    category: categoryFor(event?.category).key,
    description: event?.description ?? ''
  };
}

let idCounter = 0;

/** Local, collision-free-enough id — no backend identity is implied by it. */
export function createEventId() {
  idCounter += 1;
  const random = Math.random().toString(36).slice(2, 8);
  return `cal-${Date.now().toString(36)}-${idCounter}-${random}`;
}

/**
 * Draft (+ optional existing id) → a stored event.
 *
 * Callers validate first; this only normalises, so a saved event always has the
 * same shape however it was created.
 */
export function buildEvent(draft, { id = null, now = new Date().toISOString() } = {}) {
  return {
    id: id || draft?.id || createEventId(),
    title: String(draft?.title ?? '').trim(),
    date: String(draft?.date ?? '').trim(),
    start: String(draft?.start ?? '').trim(),
    end: String(draft?.end ?? '').trim(),
    category: categoryFor(draft?.category).key,
    description: String(draft?.description ?? '').trim(),
    // Marks the record as locally held so the future backend phase can migrate
    // (or discard) it knowingly instead of mistaking it for server data.
    source: 'local',
    createdAt: draft?.createdAt || now,
    updatedAt: now
  };
}

function safeStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Accepts only well-formed stored records; anything else is dropped. */
function normalizeStored(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (!raw.id || !raw.title || !raw.date || !raw.start || !raw.end) return null;
  return {
    id: String(raw.id),
    title: String(raw.title),
    date: String(raw.date),
    start: String(raw.start),
    end: String(raw.end),
    category: categoryFor(raw.category).key,
    description: String(raw.description || ''),
    source: raw.source || 'local',
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || ''
  };
}

/**
 * Every locally held event.
 *
 * Storage is treated as untrusted input: a corrupt, hand-edited or
 * half-written value yields an empty (or partially usable) list rather than
 * breaking the page.
 */
export function listEvents() {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeStored).filter(Boolean);
  } catch {
    return [];
  }
}

/** Replaces the stored list. Returns false when storage is unavailable/full. */
export function saveEvents(events = []) {
  const storage = safeStorage();
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(events.map(normalizeStored).filter(Boolean)));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * In-memory list operations (pure — the page owns the state)
 * ------------------------------------------------------------------ */

export function upsertEvent(events, event) {
  const exists = events.some((entry) => entry.id === event.id);
  return exists ? events.map((entry) => (entry.id === event.id ? event : entry)) : [...events, event];
}

export function removeEvent(events, id) {
  return events.filter((entry) => entry.id !== id);
}

/* ------------------------------------------------------------------ *
 * Role scope (frontend preview only)
 * ------------------------------------------------------------------ */

/**
 * The roles the Calendar can be previewed as.
 *
 * These are the ERP's REAL role keys (`com.vishatech.erp.entity.UserRole`) —
 * ADMIN / MANAGER / USER — not invented ones. The selector that uses them is a
 * preview control: this page has no calendar API of its own in this phase, every
 * event lives in this browser, and nothing chosen here is sent anywhere. It
 * never widens what the signed-in account may do on any backend endpoint.
 */
export const CALENDAR_ROLES = [
  { key: 'ADMIN', label: 'Admin' },
  { key: 'MANAGER', label: 'Manager' },
  { key: 'USER', label: 'User' }
];

/** The role the preview starts on when the session carries no usable role. */
export const DEFAULT_CALENDAR_ROLE = 'ADMIN';

/** Anything → a known role key (never throws, never returns junk). */
export function calendarRoleFor(value) {
  const key = String(value ?? '').trim().toUpperCase();
  return CALENDAR_ROLES.some((role) => role.key === key) ? key : DEFAULT_CALENDAR_ROLE;
}

/**
 * Which ERP areas each role may see in the Calendar.
 *
 * Admin is guaranteed the WHOLE calendar: every one of the seven categories,
 * always — that is the one hard rule here.
 *
 * MANAGER and USER currently resolve to the same full set, and that is not a
 * shortcut: the backend's single role → permission map
 * (`RolePermissions.permissionsOf`) grants all three roles VIEW on every module
 * the seven categories stand for (Sales, Purchase, Production, CRM, CPR,
 * Marketing, Documents). Narrowing a role is therefore a one-line change in
 * THIS table — and it would still only affect what this preview paints, never
 * what the server allows.
 */
export const CALENDAR_ROLE_AREAS = Object.freeze({
  ADMIN: Object.freeze(ERP_CATEGORIES.map((entry) => entry.key)),
  MANAGER: Object.freeze(ERP_CATEGORIES.map((entry) => entry.key)),
  USER: Object.freeze(ERP_CATEGORIES.map((entry) => entry.key))
});

/** The category keys a role may see (Admin always gets all seven). */
export function categoriesForRole(role) {
  return CALENDAR_ROLE_AREAS[calendarRoleFor(role)];
}

/** How many events each category holds — used for the filter chips. */
export function countByCategory(events = []) {
  const counts = {};
  events.forEach((event) => {
    const key = categoryFor(event?.category).key;
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
}
