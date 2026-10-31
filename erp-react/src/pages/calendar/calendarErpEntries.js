/**
 * pages/calendar/calendarErpEntries.js
 * ------------------------------------------------------------------
 * The bridge between the read-only ERP feed (`GET /calendar/entries`) and the
 * event shape the Calendar views already render.
 *
 * Two rules drive everything here:
 *
 *   1. **Local events are never touched.** Manual events keep living in
 *      `localStorage` under `erp-calendar-events` (see `calendarEvents.js`).
 *      Derived entries are held in memory only, are never written to that key
 *      and never replace a local event.
 *   2. **Nothing is invented.** If the backend sends an entry without a date it
 *      is dropped (a Calendar cannot place it), and a missing time stays
 *      missing — the entry renders as all-day instead of being given a made-up
 *      hour.
 *
 * A derived event carries `source: 'erp'` and `readOnly: true`, so the page can
 * distinguish it from a local event by data alone: no edit or delete action is
 * ever offered for it.
 */

import { categoryFor } from './calendarEvents';
import { isValidDateKey } from './calendarUtils';

/** Ids of derived events carry this prefix, so they can never collide with a local id. */
export const ERP_EVENT_ID_PREFIX = 'erp:';

/** Human labels for the modules the backend can currently feed the calendar from. */
export const ERP_SOURCE_LABELS = Object.freeze({
  sales: 'Sales',
  marketing: 'Marketing',
  crm: 'CRM',
  purchase: 'Purchase',
  cpr: 'CPR',
  production: 'Production'
});

/**
 * Backend sources that belong to an existing Calendar category.
 *
 * The Calendar has seven category keys, and a CPR (Cost/Profit Review) is part
 * of the Sales workflow — it is raised from a customer requirement, costs the
 * job and is converted into a Quotation. Its entries are therefore mapped onto
 * the existing **Sales** category rather than a separate key.
 *
 * That mapping is the whole integration: the chip counts are derived from
 * `categoryFor(event.category).key` (`countByCategory(scopedEvents)`), and the
 * filter hides by that same key, so the Sales chip automatically counts and
 * shows Sales *and* CPR entries for the displayed range, and switching Sales off
 * hides both. No new category, chip or second count path exists, and every other
 * key, colour and filter keeps its behaviour.
 *
 * The entry's own `erpSource` stays `cpr`, so the read-only dialog and the
 * status line still say "CPR" — only the category (colour + filter) is shared.
 */
export const ERP_SOURCE_CATEGORIES = Object.freeze({
  cpr: 'sales'
});

/** "marketing" → "Marketing"; an unknown module is shown as-is, never hidden. */
export function erpSourceLabel(source) {
  const key = String(source ?? '').trim();
  if (!key) return 'ERP';
  return ERP_SOURCE_LABELS[key] || key.charAt(0).toUpperCase() + key.slice(1);
}

/** "marketing, crm" → "Marketing + CRM" for the status line. */
export function describeSources(sources = []) {
  const labels = [...new Set(sources.map(erpSourceLabel))];
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} + ${labels[labels.length - 1]}`;
}

/** A source-record status, or '' — never a guessed "pending"/"overdue". */
function statusOf(entry) {
  const status = entry?.status;
  return typeof status === 'string' ? status.trim() : '';
}

/** Store-provided time is only used when it is a real HH:MM value. */
function timeOf(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : '';
}

/**
 * One backend entry → one Calendar event.
 *
 * Returns `null` for anything the Calendar cannot place honestly: no id, or no
 * valid `YYYY-MM-DD` date. Everything else is copied from the entry.
 */
export function buildErpEvent(entry) {
  if (!entry || !entry.id) return null;
  const date = String(entry.date ?? '');
  if (!isValidDateKey(date)) return null;

  const start = timeOf(entry.startTime);
  // An end without a start cannot be placed on the grid, so it is dropped with
  // the missing start rather than shown as a half-known range.
  const end = start ? timeOf(entry.endTime) : '';
  const sourceCategory = ERP_SOURCE_CATEGORIES[String(entry.category ?? '').trim()];
  const category = categoryFor(sourceCategory || entry.category).key;
  const title = String(entry.title ?? '').trim() || 'ERP record';

  return {
    id: `${ERP_EVENT_ID_PREFIX}${String(entry.id)}`,
    title,
    date,
    start,
    end,
    category,
    // No description is derived: the source record owns its own text.
    description: '',
    source: 'erp',
    readOnly: true,
    // Provenance, used by the read-only dialog and the status line.
    erpSource: String(entry.source ?? ''),
    entityType: String(entry.entityType ?? ''),
    entityId: entry.entityId ?? null,
    status: statusOf(entry),
    linkPath: typeof entry.linkPath === 'string' && entry.linkPath ? entry.linkPath : '',
    // All-day when the backend says so OR when no usable time was sent.
    allDay: Boolean(entry.allDay) || !start
  };
}

/**
 * A whole response → derived events.
 *
 * Malformed entries are dropped, and duplicate ids (the same record dated the
 * same day) collapse to the first occurrence, so a module that returns the same
 * entry twice cannot draw it twice.
 */
export function erpEntriesToEvents(payload) {
  const entries = Array.isArray(payload?.entries) ? payload.entries : [];
  const seen = new Set();
  const events = [];
  entries.forEach((entry) => {
    const event = buildErpEvent(entry);
    if (!event || seen.has(event.id)) return;
    seen.add(event.id);
    events.push(event);
  });
  return events;
}

/**
 * Merge the two independent sets for rendering.
 *
 * A local event always wins its own id, and derived events are appended in the
 * backend's order. The local list is returned untouched when there is no feed,
 * so the page behaves exactly as before the backend existed.
 */
export function mergeCalendarEvents(localEvents = [], erpEvents = []) {
  const locals = Array.isArray(localEvents) ? localEvents : [];
  if (!Array.isArray(erpEvents) || erpEvents.length === 0) return locals;

  const ids = new Set(locals.map((event) => event?.id).filter(Boolean));
  const derived = [];
  erpEvents.forEach((event) => {
    if (!event?.id || ids.has(event.id)) return;
    ids.add(event.id);
    derived.push(event);
  });
  return derived.length === 0 ? locals : [...locals, ...derived];
}

/** True when the event must be presented as read-only. */
export function isReadOnlyEvent(event) {
  return Boolean(event?.readOnly) || event?.source === 'erp';
}

/** Local events only — the ones the Calendar may edit and delete. */
export function localEventsOf(events = []) {
  return events.filter((event) => !isReadOnlyEvent(event));
}

/**
 * The fetch result state the page renders.
 *
 * `ready` with zero entries is a successful empty result. `error` keeps the
 * previously loaded entries so a transient failure does not blank a working
 * calendar.
 *
 * Loading is DERIVED ({@link isErpFeedLoading}) rather than stored: a request is
 * outstanding whenever the settled range is not the range on screen (or a retry
 * was requested), which means no component has to set state synchronously at
 * the start of an effect just to say "loading".
 */
export const ERP_STATE_IDLE = 'idle';
export const ERP_STATE_READY = 'ready';
export const ERP_STATE_ERROR = 'error';

const EMPTY_FEED = Object.freeze({
  status: ERP_STATE_IDLE,
  events: [],
  sources: [],
  unavailableSources: [],
  error: '',
  range: null,
  settledAttempt: 0
});

/** Initial feed state. */
export function emptyErpFeed() {
  return { ...EMPTY_FEED };
}

/** True while the feed on screen has not been settled for this range/attempt. */
export function isErpFeedLoading(feed, range, attempt = 0) {
  const settled = feed?.range;
  if (!settled || !range) return true;
  return (
    settled.from !== range.from ||
    settled.to !== range.to ||
    (feed.settledAttempt || 0) !== attempt
  );
}

/** Successful response → feed state. */
export function readyErpFeed(payload, range, attempt = 0) {
  return {
    status: ERP_STATE_READY,
    events: erpEntriesToEvents(payload),
    sources: Array.isArray(payload?.sources) ? [...payload.sources] : [],
    unavailableSources: Array.isArray(payload?.unavailableSources)
      ? [...payload.unavailableSources]
      : [],
    error: '',
    range: range || null,
    settledAttempt: attempt
  };
}

/**
 * Failed request → feed state that keeps the last successful entries.
 *
 * A first-load failure therefore shows an honest empty calendar plus the error,
 * while a refresh failure keeps the previously loaded ERP entries on screen and
 * says they are the last loaded set — never a fake success.
 */
export function failedErpFeed(previous, message, range, attempt = 0) {
  return {
    ...(previous || emptyErpFeed()),
    status: ERP_STATE_ERROR,
    // A failed refresh keeps the previous sources/entries, but never claims the
    // failed range: `range` records what was actually settled so the derived
    // loading flag turns off and the error is shown instead.
    range: range || previous?.range || null,
    settledAttempt: attempt,
    error: String(message || 'The ERP calendar feed could not be loaded.')
  };
}
