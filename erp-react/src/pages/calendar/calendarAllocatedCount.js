/**
 * pages/calendar/calendarAllocatedCount.js
 * ------------------------------------------------------------------
 * The "Today Allocated" count, shared by the Calendar page's own math and the
 * ERP topbar badge.
 *
 * The number is NOT re-implemented here. It is the same expression the page
 * renders next to its calendar icon:
 *
 *   todayAllocatedEvents(mergeCalendarEvents(localEvents, erpEvents), now).length
 *
 * filtered by the same role-scoped categories. "Today Allocated" means today's
 * events whose time window has not finished yet (see `calendarUtils.js`), so it
 * is not the total event count.
 *
 * Why a tiny store instead of a hook that fetches on its own: the Calendar is
 * opened in its own tab and does not mount the ERP shell, so the two never run
 * at the same time. Within the shell, every page shares ONE read of today's ERP
 * feed and one clock tick — navigating between modules cannot multiply requests
 * and every page shows the same number.
 *
 * Honest states:
 *   loading → no badge yet (a number is not known)
 *   ready   → the count, including a genuine 0
 *   error   → no badge when nothing was ever loaded (an unavailable read is not
 *             a zero); a later refresh failure keeps the last known number.
 * ------------------------------------------------------------------
 */
import { useSyncExternalStore } from 'react';
import { fetchCalendarEntries } from '../../services/calendarService';
import { getStoredUser } from '../../services/tokenStorage';
import { mergeCalendarEvents, readyErpFeed } from './calendarErpEntries';
import {
  CALENDAR_ROLE_AREAS,
  calendarRoleFor,
  categoryFor,
  listEvents
} from './calendarEvents';
import { todayAllocatedEvents, toDateKey } from './calendarUtils';

/** Re-read the clock: an event whose end time passes leaves the count. */
const CLOCK_REFRESH_MS = 60_000;
/** Re-read today's ERP entries after this long (they can be edited elsewhere). */
const FEED_TTL_MS = 5 * 60_000;
/** The Calendar's local event list (written by `calendarEvents.js`). */
const LOCAL_EVENTS_KEY = 'erp-calendar-events';

const EMPTY = Object.freeze({ status: 'loading', count: null });

let snapshot = EMPTY;
/** Today's ERP-derived events (read-only, never persisted). */
let erpEvents = [];
/** The day the loaded feed belongs to — a new day needs a new read. */
let feedDay = '';
let lastFeedAt = 0;
let inflight = null;
let tickTimer = null;
let started = false;
const listeners = new Set();

/** The category keys the signed-in role can see (mirrors the page's default). */
function roleAreas() {
  const role = calendarRoleFor(getStoredUser()?.role);
  return new Set(CALENDAR_ROLE_AREAS[role] || CALENDAR_ROLE_AREAS.ADMIN);
}

function computeCount(now = new Date()) {
  const areas = roleAreas();
  const scoped = mergeCalendarEvents(listEvents(), erpEvents)
    .filter((event) => areas.has(categoryFor(event?.category).key));
  return todayAllocatedEvents(scoped, now).length;
}

function publish(next) {
  if (next.status === snapshot.status && next.count === snapshot.count) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** Recompute against the live clock and the current local event list. */
function publishCount() {
  if (snapshot.status !== 'ready') return;
  publish({ status: 'ready', count: computeCount() });
}

/** One shared read of today's ERP feed. */
function loadFeed() {
  if (inflight) return inflight;
  const today = toDateKey(new Date());
  if (snapshot.status !== 'ready') publish({ status: 'loading', count: null });

  inflight = fetchCalendarEntries({ from: today, to: today })
    .then((payload) => {
      erpEvents = readyErpFeed(payload, { from: today, to: today }).events;
      feedDay = today;
      lastFeedAt = Date.now();
      publish({ status: 'ready', count: computeCount() });
    })
    .catch(() => {
      // Nothing trustworthy was ever loaded: show no badge rather than a
      // made-up zero. A failed refresh keeps the previous number.
      if (snapshot.status !== 'ready') publish({ status: 'error', count: null });
      feedDay = today;
      lastFeedAt = Date.now();
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

function ensureFreshFeed() {
  const today = toDateKey(new Date());
  if (feedDay !== today || Date.now() - lastFeedAt >= FEED_TTL_MS) loadFeed();
}

function tick() {
  ensureFreshFeed();
  publishCount();
}

const onStorage = (event) => {
  if (event.key && event.key !== LOCAL_EVENTS_KEY) return;
  publishCount();
};

const onVisibility = () => {
  if (document.visibilityState !== 'visible') return;
  ensureFreshFeed();
  publishCount();
};

function start() {
  started = true;
  ensureFreshFeed();
  tickTimer = window.setInterval(tick, CLOCK_REFRESH_MS);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
}

function stop() {
  started = false;
  if (tickTimer) window.clearInterval(tickTimer);
  tickTimer = null;
  window.removeEventListener('storage', onStorage);
  document.removeEventListener('visibilitychange', onVisibility);
}

function subscribe(listener) {
  listeners.add(listener);
  if (!started) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

const getSnapshot = () => snapshot;

/** `{ status: 'loading' | 'ready' | 'error', count: number | null }` */
export function useAllocatedCount() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Test helper: reset the shared store without touching the server or storage. */
export function resetAllocatedCountStore() {
  stop();
  listeners.clear();
  snapshot = EMPTY;
  erpEvents = [];
  feedDay = '';
  lastFeedAt = 0;
  inflight = null;
}
