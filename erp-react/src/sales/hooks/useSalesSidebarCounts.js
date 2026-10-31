/**
 * sales/hooks/useSalesSidebarCounts.js
 * ------------------------------------------------------------------
 * Pending-count badges for the Sales submenu (CRM, CPR, Sales Execution) —
 * the Sales counterpart of purchase/hooks/usePurchaseSidebarCounts,
 * with the same architecture: ONE module-level store shared by every consumer,
 * a single deferred batch of requests, mutation-driven refresh, and a bounded
 * retry when the first batch fails.
 *
 * Every number is a PENDING / action-required count taken from an existing
 * backend endpoint. Approved / completed / rejected / cancelled / archived /
 * deleted records are never counted, and a zero count renders no badge at all.
 *
 *   CRM               → follow-ups whose own status is Open — the same rows the
 *                       Follow-ups page's "Open" tab lists. A lead has no
 *                       approval/pending state of its own; its actionable work
 *                       IS its follow-up, so counting leads separately would
 *                       double count the same work.
 *   CPR               → GET /approvals/summary `customerPurchaseRequest`: the
 *                       CPR approval queue plus the downstream stages that are
 *                       still waiting on a decision (technical verification,
 *                       cost workout SUBMITTED, profit workout SUBMITTED).
 *   Sales Execution   → `salesExecution` from the same summary (quotation /
 *                       sales contract / CPO / credit note awaiting approval)
 *                       PLUS the execution queues that live on the hub's own
 *                       tabs: E-Actions in "Pending", quality inspections
 *                       "Pending" and packing lists "Pending". Each is a
 *                       different record type, so nothing is counted twice.
 *
 * Not badged: Sales Dashboard, Documents, Sales Reports and Sales Settings have
 * no count key in the sidebar tree, so they never render a badge (and the store
 * does not query for them).
 *
 * The store is (re)loaded:
 *   • on first read, and whenever the cached snapshot is older than
 *     ROUTE_STALE_MS, scheduled in an idle slot so it never competes with the
 *     destination page's own requests;
 *   • immediately (debounced) after a Sales mutation — salesServiceFactory
 *     dispatches SALES_DATA_CHANGED_EVENT after every successful write — and
 *     after any approval change (PENDING_APPROVAL_REFRESH_EVENT).
 * Concurrent refreshes are coalesced; failures keep the last known counts.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/axiosInstance';
import salesOrderEActionService from '../../services/salesOrderEActionService';
import qualityInspectionService from '../../services/qualityInspectionService';
import { packingApi } from '../../production/utils/api';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import { SALES_DATA_CHANGED_EVENT } from '../utils/salesDataEvents';

/** Sidebar count keys this store publishes (Sales group only). */
export const SALES_COUNT_KEYS = ['crm', 'cpr', 'salesExec'];

const EMPTY_COUNTS = Object.fromEntries(SALES_COUNT_KEYS.map((key) => [key, 0]));
const EMPTY_SNAPSHOT = { counts: EMPTY_COUNTS };

/** Reuse the cached snapshot this long before a navigation re-reads it. */
const ROUTE_STALE_MS = 30 * 1000;
const MUTATION_DEBOUNCE_MS = 150;
const IDLE_REFRESH_MS = 400;
/** Bounded retry for a first load in which every request failed. */
const FAILURE_RETRY_DELAYS_MS = [2000, 6000];

/* ── payload normalisation ──────────────────────────────────────────────── */

/** Accepts `{data: …}` envelopes, bare payloads and null alike. */
function payload(value) {
  if (value && typeof value === 'object' && 'data' in value) {
    return value.data ?? null;
  }
  return value ?? null;
}

/** Rows from a bare array or a Spring page envelope. */
function rows(value) {
  const body = payload(value);
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.content)) return body.content;
  if (Array.isArray(value?.content)) return value.content;
  return [];
}

function num(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Pure derivation of the four Sales badges. Exported for tests — every input
 * is an API response (or null when that call failed, which counts as 0).
 */
export function deriveSalesSidebarCounts({
  summary,
  eActionStats,
  qcStats,
  packingStats,
  followUps
} = {}) {
  const summaryBody = payload(summary) || {};

  // CRM — follow-ups that are still open.
  const crm = rows(followUps).filter(
    (row) => String(row?.status || row?.currentStatus || '').toLowerCase() === 'open'
  ).length;

  // CPR — the backend's own CPR-family pending total.
  const cpr = num(summaryBody.customerPurchaseRequest);

  // Sales Execution — document approvals plus the hub's execution queues.
  const eActionPending = num(payload(eActionStats)?.byStatus?.Pending);
  const qcPending = num(payload(qcStats)?.pendingInspections);
  const packingPending = num(payload(packingStats)?.pending);
  const salesExec = num(summaryBody.salesExecution)
    + eActionPending + qcPending + packingPending;

  return { crm, cpr, salesExec };
}

/* ── shared store ───────────────────────────────────────────────────────── */

let snapshot = EMPTY_SNAPSHOT;
let lastLoadedAt = 0;
let inFlight = null;
let mutationTimer = null;
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
    refreshSalesSidebarCounts();
  }, delay);
}

/** Runs the badge queries once and publishes the derived snapshot. */
async function loadCounts() {
  try {
    /* Each query is isolated: one failing endpoint must not discard the counts
       of all the others (the derivation treats null as 0). */
    const safe = (call) => Promise.resolve().then(call).catch(() => null);
    const [summary, eActionStats, qcStats, packingStats, followUps] = await Promise.all([
      // `api.get` resolves to the axios response; the services below already
      // hand back the response BODY, so unwrap one level here to keep every
      // input to the derivation shaped the same way.
      safe(async () => (await api.get('/approvals/summary')).data),
      safe(() => salesOrderEActionService.stats()),
      safe(() => qualityInspectionService.getStats()),
      safe(() => packingApi.getStats()),
      safe(() => api.get('/followups', { params: { page: 0, size: 500 } }))
    ]);

    // Nothing loaded at all and nothing has ever been published: this is the
    // "backend not reachable yet" case, not a genuine zero. Retry shortly
    // instead of silently showing no badges until the next navigation.
    if (
      snapshot === EMPTY_SNAPSHOT
      && [summary, eActionStats, qcStats, packingStats, followUps].every((value) => value == null)
    ) {
      scheduleFailureRetry();
      return snapshot;
    }

    snapshot = {
      counts: deriveSalesSidebarCounts({ summary, eActionStats, qcStats, packingStats, followUps })
    };
    lastLoadedAt = Date.now();
    failureRetryAttempt = 0;
    clearFailureRetry();
    emit();
    return snapshot;
  } catch {
    /* Keep the last-known counts — the pages render their own error states. */
    if (snapshot === EMPTY_SNAPSHOT) scheduleFailureRetry();
    return snapshot;
  }
}

/** Refresh now (single-flight: concurrent callers share one round). */
export function refreshSalesSidebarCounts() {
  if (!inFlight) {
    inFlight = loadCounts().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function scheduleIdleRefresh(delayMs = IDLE_REFRESH_MS) {
  const run = () => refreshSalesSidebarCounts();
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

/** Coalesce mutation bursts (a save can write several collections). */
function scheduleMutationRefresh() {
  if (mutationTimer) clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    mutationTimer = null;
    refreshSalesSidebarCounts();
  }, MUTATION_DEBOUNCE_MS);
}

/** One shared set of listeners for the tab's lifetime. */
function ensureSubscriptions() {
  if (subscriptionsInstalled || typeof window === 'undefined') return;
  subscriptionsInstalled = true;
  window.addEventListener(SALES_DATA_CHANGED_EVENT, scheduleMutationRefresh);
  window.addEventListener(PENDING_APPROVAL_REFRESH_EVENT, scheduleMutationRefresh);
}

/**
 * Pending counts for the Sales submenu.
 *
 * Returns a stable snapshot (same object identity until the numbers actually
 * move), so React re-renders the sidebar only when a count changes.
 */
export default function useSalesSidebarCounts() {
  const value = useSyncExternalStore(subscribeStore, getSnapshotValue, getSnapshotValue);
  const { pathname } = useLocation();

  useEffect(() => {
    ensureSubscriptions();
    // First consumer in this tab: read the counts if the snapshot is stale.
    refreshIfStale();
  }, []);

  // Navigation: only re-read once the snapshot has aged past the window, in an
  // idle slot, so the destination page's own requests always go first.
  useEffect(() => {
    refreshIfStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Returning to the tab: pick up changes made in another tab.
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

  const refresh = useCallback(() => refreshSalesSidebarCounts(), []);

  return { counts: value.counts, refresh };
}
