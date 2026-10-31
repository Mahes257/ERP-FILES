/**
 * production/utils/dataChanged.js
 * ------------------------------------------------------------------
 * The Production module refresh bus.
 *
 * The module previously refreshed by dispatching a bare DOM event
 * (`new Event('production-data-changed')`) from every write, while every
 * store subscribed with `window.addEventListener`. That produced two
 * classes of wasted requests:
 *
 *   1. SELF ECHO — a store that had just saved called its own
 *      `fetchX()` and then dispatched the event, which its own listener
 *      handled by calling `fetchX()` a second time. Verified in
 *      DrawingsContext, ModelsContext and TechnicalVerificationContext:
 *      one save = the list and the stats were fetched twice.
 *
 *   2. BURST AMPLIFICATION — a single user action can dispatch several
 *      events (a multi-step status path, or one save that also triggers
 *      dependent cleanup). Every event woke every mounted store, so a
 *      burst of N events cost N full refresh passes of every list+stats
 *      endpoint in the module.
 *
 * This module keeps the same DOM event name — so any listener outside the
 * module that still uses `window.addEventListener('production-data-changed',
 * …)` keeps working unchanged — and adds:
 *
 *   · `notifyProductionDataChanged(source)` tags the emitter, and
 *   · `subscribeProductionDataChanged(id, handler)` skips the event its own
 *     store emitted, and collapses a burst of events into ONE handler call.
 *
 * Wiring notes:
 *   · keep `id` stable and unique per store (module-scoped string),
 *   · a subscriber is invoked at most once per burst window,
 *   · handlers must stay side-effect free apart from their refresh call.
 * ------------------------------------------------------------------
 */

export const PRODUCTION_DATA_CHANGED_EVENT = 'production-data-changed';

/** Events inside this window are treated as one burst. */
export const PRODUCTION_CHANGE_COALESCE_MS = 150;

/** id -> handler, one entry per subscribed store. */
const subscribers = new Map();
/** Handlers waiting to run at the end of the current burst window. */
const pending = new Set();
let flushTimer = null;
let listening = false;

function flush() {
  flushTimer = null;
  if (pending.size === 0) return;
  const ready = Array.from(pending);
  pending.clear();
  ready.forEach((handler) => {
    try {
      handler();
    } catch {
      /* One failing store must never stop the others refreshing. */
    }
  });
}

function onEvent(event) {
  const source = event?.detail?.source ?? null;
  subscribers.forEach((handler, id) => {
    // The emitter already refreshed its own copy — skip the echo.
    if (source && id === source) return;
    pending.add(handler);
  });
  if (pending.size === 0) return;
  // A burst collapses into the single window that is already running.
  if (flushTimer) return;
  flushTimer = setTimeout(flush, PRODUCTION_CHANGE_COALESCE_MS);
}

/**
 * Announce that Production data changed.
 * @param {string|null} source store id that already refreshed itself.
 */
export function notifyProductionDataChanged(source = null) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(PRODUCTION_DATA_CHANGED_EVENT, { detail: { source } })
  );
}

/**
 * Subscribe to data-change notifications.
 *
 * @param {string} id      this store's id (see `notifyProductionDataChanged`)
 * @param {() => void} handler refresh function — called at most once per burst
 * @returns {() => void} unsubscribe
 */
export function subscribeProductionDataChanged(id, handler) {
  if (typeof handler !== 'function') return () => {};

  subscribers.set(id, handler);
  if (!listening && typeof window !== 'undefined') {
    window.addEventListener(PRODUCTION_DATA_CHANGED_EVENT, onEvent);
    listening = true;
  }

  return () => {
    subscribers.delete(id);
    pending.delete(handler);
  };
}
