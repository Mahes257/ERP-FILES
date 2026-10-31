/**
 * marketing/hooks/useMarketingSidebarCounts.js
 * ------------------------------------------------------------------
 * Pending-work badge for the Marketing group's "Offline Marketing" entry — the
 * Marketing counterpart of purchase/hooks/usePurchaseSidebarCounts,
 * sales/hooks/useSalesSidebarCounts and
 * production/hooks/useProductionSidebarCounts (same architecture: ONE
 * module-level store, one deferred batch of requests, stale-window re-reads,
 * bounded retry, mutation/approval refresh).
 *
 * WHAT IS COUNTED
 * ---------------
 * Every Marketing workflow record that is waiting on a HUMAN — its own status
 * is Draft, Pending or Pending Approval. Approved / Completed / Cancelled /
 * Rejected / Active records are never counted, and one record is counted once
 * even if it carries two matching states (Draft + Pending Approval).
 *
 * The five workflows that actually carry these states, each read from its own
 * module endpoint so the number matches what the page's own tab lists:
 *
 *   Q Forms          /marketing/q-forms           status  Draft | Pending
 *                    (the form's own status list is Not Prepared / Draft /
 *                    Filled & Submitted / Pending / Not Required)
 *   Travel Plans     /marketing/travel-plans      status  Draft, and the
 *                    "Pending Approval" tab — which this module filters with
 *                    status 'Submitted' (TravelPlanner's TAB_STATUS.pending)
 *   Travel Schedules /marketing/travel-schedules  status  Draft, and
 *                    'Submitted' (TravelScheduler's TAB_STATUS.pending)
 *   Expenses         /marketing/expenses          approvalStatus Draft, and
 *                    'Submitted' (MarketingExpenses' "Pending Approval" tab);
 *                    the trip's own status (Active / Trip OFF) is lifecycle,
 *                    not an approval state, so it is ignored
 *   Follow-ups       /marketing/follow-ups        status  Pending
 *
 * 'Submitted' is therefore counted as Pending Approval for the three workflows
 * whose UI labels it that way — that is the module's own definition of the
 * state, not a new one. A record whose status is literally "Pending Approval"
 * is counted everywhere (no current workflow stores that literal, but the rule
 * must not depend on that).
 *
 * Leads and Visits carry no Draft/Pending/Pending-Approval state and are not
 * queried. Marketing Settings has no pending workload at all.
 *
 * The store is (re)loaded on first read, on navigation once the cached snapshot
 * is older than ROUTE_STALE_MS (scheduled in an idle slot so it never competes
 * with the destination page's own requests), when the tab regains focus, and
 * after a global approval change (PENDING_APPROVAL_REFRESH_EVENT). Concurrent
 * refreshes are coalesced; failures keep the last known count.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';

/** Sidebar count keys this store publishes (Marketing group only). */
export const MARKETING_COUNT_KEYS = ['offlineMarketing'];

const EMPTY_COUNTS = Object.fromEntries(MARKETING_COUNT_KEYS.map((key) => [key, 0]));
const EMPTY_SNAPSHOT = { counts: EMPTY_COUNTS };

/** Reuse the cached snapshot this long before a navigation re-reads it. */
const ROUTE_STALE_MS = 30 * 1000;
const IDLE_REFRESH_MS = 400;
/** Bounded retry for a first load in which every request failed. */
const FAILURE_RETRY_DELAYS_MS = [2000, 6000];

/** The three states this badge counts, lowercase for comparison. */
export const PENDING_WORK_STATUSES = ['draft', 'pending', 'pending approval'];

/**
 * Statuses the module itself labels "Pending Approval" but stores under a
 * different word. Travel plans, travel schedules and expense trips use
 * 'Submitted' — every one of their "Pending Approval" tabs filters on it.
 */
const PENDING_APPROVAL_ALIASES = ['submitted'];

/* ── payload normalisation ──────────────────────────────────────────────── */

/** Accepts `{data: …}` envelopes, bare payloads and null alike. */
function payload(value) {
  if (value && typeof value === 'object' && 'data' in value) {
    return value.data ?? null;
  }
  return value ?? null;
}

/** Rows from a bare array, a Spring page envelope or an ApiResponse wrapper. */
function rows(value) {
  const body = payload(value);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.content)) return body.content;
  if (Array.isArray(value?.content)) return value.content;
  return [];
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** True when this status/approval status is waiting on a person. */
export function isPendingWorkStatus(value, { aliases = PENDING_APPROVAL_ALIASES } = {}) {
  const status = norm(value);
  if (!status) return false;
  return PENDING_WORK_STATUSES.includes(status) || aliases.includes(status);
}

/**
 * Distinct records in one workflow list that are waiting on a person.
 *
 * A record is tested on its `status` (the workflow's own state) and, where the
 * workflow keeps the approval separately, on `approvalStatus`. It is counted
 * once even when both match.
 *
 * @param {object[]} list     workflow rows
 * @param {object}   options  `{ aliases, fields }`
 */
export function countPendingWork(list, { aliases = PENDING_APPROVAL_ALIASES, fields = ['status', 'approvalStatus'] } = {}) {
  const seen = new Set();
  let count = 0;
  for (const row of list) {
    const id = row?.id ?? row?.formNo ?? row?.planNo ?? row?.scheduleNo ?? row?.tripNo;
    if (id != null) {
      const key = String(id);
      if (seen.has(key)) continue;
    }
    if (fields.some((field) => isPendingWorkStatus(row?.[field], { aliases }))) {
      count += 1;
      if (id != null) seen.add(String(id));
    }
  }
  return count;
}

/**
 * Pure derivation of the Offline Marketing badge. Exported for tests — every
 * input is an API response (or null when that call failed, which contributes 0).
 */
export function deriveMarketingSidebarCounts({
  qForms,
  travelPlans,
  travelSchedules,
  expenses,
  followUps
} = {}) {
  return {
    offlineMarketing: countPendingWork(rows(qForms))
      + countPendingWork(rows(travelPlans))
      + countPendingWork(rows(travelSchedules))
      + countPendingWork(rows(expenses), { fields: ['approvalStatus', 'status'] })
      + countPendingWork(rows(followUps))
  };
}

/* ── shared store ───────────────────────────────────────────────────────── */

let snapshot = EMPTY_SNAPSHOT;
let lastLoadedAt = 0;
let inFlight = null;
let failureRetryTimer = null;
let failureRetryAttempt = 0;
let subscriptionsInstalled = false;
const listeners = new Set();

function getSnapshotValue() {
  return snapshot;
}

function emit() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      /* A badge listener must never break the store. */
    }
  });
}

function subscribeStore(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function clearFailureRetry() {
  if (failureRetryTimer) {
    clearTimeout(failureRetryTimer);
    failureRetryTimer = null;
  }
}

function scheduleFailureRetry() {
  if (failureRetryTimer || failureRetryAttempt >= FAILURE_RETRY_DELAYS_MS.length) return;
  const delay = FAILURE_RETRY_DELAYS_MS[failureRetryAttempt];
  failureRetryAttempt += 1;
  failureRetryTimer = setTimeout(() => {
    failureRetryTimer = null;
    refreshMarketingSidebarCounts();
  }, delay);
}

/** Runs the badge queries once and publishes the derived snapshot. */
async function loadCounts() {
  try {
    /* Each query is isolated: one failing endpoint must not discard the counts
       of the others (the derivation treats null as 0). */
    const safe = (call) => Promise.resolve().then(call).catch(() => null);
    const params = { size: 500 };
    const [qForms, travelPlans, travelSchedules, expenses, followUps] = await Promise.all([
      // `api.get` resolves to the axios response, so `.data` is the payload.
      safe(async () => (await api.get('/marketing/q-forms', { params })).data),
      safe(async () => (await api.get('/marketing/travel-plans', { params })).data),
      safe(async () => (await api.get('/marketing/travel-schedules', { params })).data),
      safe(async () => (await api.get('/marketing/expenses', { params })).data),
      safe(async () => (await api.get('/marketing/follow-ups', { params })).data)
    ]);

    const inputs = { qForms, travelPlans, travelSchedules, expenses, followUps };

    // Nothing loaded at all and nothing has ever been published: the backend is
    // not reachable yet, so retry shortly instead of showing "no badge".
    if (snapshot === EMPTY_SNAPSHOT && Object.values(inputs).every((value) => value == null)) {
      scheduleFailureRetry();
      return snapshot;
    }

    snapshot = { counts: deriveMarketingSidebarCounts(inputs) };
    lastLoadedAt = Date.now();
    failureRetryAttempt = 0;
    clearFailureRetry();
    emit();
    return snapshot;
  } catch {
    /* Keep the last-known count — the pages render their own error states. */
    if (snapshot === EMPTY_SNAPSHOT) scheduleFailureRetry();
    return snapshot;
  }
}

/** Refresh now (single-flight: concurrent callers share one round). */
export function refreshMarketingSidebarCounts() {
  if (!inFlight) {
    inFlight = loadCounts().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function scheduleIdleRefresh(delayMs = IDLE_REFRESH_MS) {
  const run = () => refreshMarketingSidebarCounts();
  if (typeof window === 'undefined') return run();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: delayMs });
    return undefined;
  }
  setTimeout(run, delayMs);
  return undefined;
}

function refreshIfStale(maxAgeMs = ROUTE_STALE_MS) {
  if (snapshot !== EMPTY_SNAPSHOT && Date.now() - lastLoadedAt < maxAgeMs) {
    return Promise.resolve(snapshot);
  }
  return scheduleIdleRefresh();
}

/** One shared listener for the tab's lifetime (approval decisions moved). */
function ensureSubscriptions() {
  if (subscriptionsInstalled || typeof window === 'undefined') return;
  subscriptionsInstalled = true;
  // Wrapped, not passed directly: the listener would otherwise receive the
  // event object as `scheduleIdleRefresh`'s delay argument.
  window.addEventListener(PENDING_APPROVAL_REFRESH_EVENT, () => scheduleIdleRefresh());
}

/**
 * Pending-work count for the Marketing group.
 *
 * Returns a stable snapshot (same object identity until the number actually
 * moves), so React re-renders the sidebar only when the count changes.
 */
export default function useMarketingSidebarCounts() {
  const value = useSyncExternalStore(subscribeStore, getSnapshotValue, getSnapshotValue);
  const { pathname } = useLocation();

  useEffect(() => {
    ensureSubscriptions();
    refreshIfStale();
  }, []);

  useEffect(() => {
    refreshIfStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Returning to the tab: pick up approvals made elsewhere.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === 'visible') refreshIfStale();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, []);

  const refresh = useCallback(() => refreshMarketingSidebarCounts(), []);

  return { counts: value.counts, refresh };
}
