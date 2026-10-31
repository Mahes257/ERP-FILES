/**
 * production/hooks/useProductionSidebarCounts.js
 * ------------------------------------------------------------------
 * Pending-work badges for the Production submenu — the Production counterpart
 * of purchase/hooks/usePurchaseSidebarCounts and
 * sales/hooks/useSalesSidebarCounts, with the same architecture: ONE
 * module-level store shared by every consumer, a single deferred batch of
 * requests, mutation-driven refresh and a bounded retry when the first batch
 * fails.
 *
 * Every number is the SAME "pending" figure the module's own page shows — not
 * an approval-only subset, and never a stage/total count:
 *
 *   Production Work Orders → /production-kpi/orders/counts
 *                            draft + prodApproval + adminApproval: every order
 *                            that still needs an action before it is Approved.
 *   Technical Verification → /technical-verifications/stats `pending`
 *   Drawings               → /drawings/stats `pending`
 *   Models                 → /models/stats `pending`
 *   Quality                → /production-kpi/quality/counts `pending`
 *   Packing                → /packing/stats `pending`
 *   Machine Shop           → /machine-shop/stats `pendingJobs`
 *
 *   Casting / Fabrication / Assembly are shop-floor boards whose "Pending" KPI
 *   card is counted over WORK-ORDER GROUPS, not over job rows: a work order is
 *   Pending when none of its jobs has started (an order with no entry yet is
 *   Pending too). The board derives that from the production orders plus their
 *   production entries (ShopFloorBoard's `groups`) — so the badge derives it the
 *   same way from the same two endpoints, and Casting reads 4 while a raw
 *   entry tally would read 2. Assembly is a section board over ALL work orders
 *   (`allWorkOrders`), Casting/Fabrication are type boards.
 *
 * Not badged: Production (dashboard), Documents, Reports and Settings have no
 * count key in the sidebar tree, so they never render a badge (and the store
 * does not query for them).
 *
 * The store is (re)loaded:
 *   • on first read, and whenever the cached snapshot is older than
 *     ROUTE_STALE_MS, scheduled in an idle slot so it never competes with the
 *     destination page's own requests;
 *   • immediately (debounced) after any Production write — the module already
 *     broadcasts `production-data-changed` from every successful save — and
 *     after any approval change (PENDING_APPROVAL_REFRESH_EVENT).
 * Concurrent refreshes are coalesced; failures keep the last known counts.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/axiosInstance';
import {
  tvApi,
  drawingApi,
  modelApi,
  machineShopApi,
  packingApi,
  dispatchApi
} from '../utils/api';
import { PRODUCTION_DATA_CHANGED_EVENT } from '../utils/dataChanged';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';

/** Sidebar count keys this store publishes (Production group only). */
export const PRODUCTION_COUNT_KEYS = [
  'orders',
  'technicalVerification',
  'drawings',
  'models',
  'casting',
  'fabrication',
  'machineShop',
  'assembly',
  'quality',
  'packing',
  'dispatch'
];

const EMPTY_COUNTS = Object.fromEntries(PRODUCTION_COUNT_KEYS.map((key) => [key, 0]));
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
 * Work-order groups for one shop-floor board, mirroring ShopFloorBoard:
 * each order's status is Pending while none of its jobs has started (and when
 * it has no job at all yet), Completed when every job is completed, otherwise
 * In Progress / Hold when a job says so.
 *
 * @param {object[]} orders      production orders (with `items`)
 * @param {object[]} entries     production entries (jobs)
 * @param {string}   type        production type of the board ('Casting', …)
 * @param {boolean}  allOrders   true for section boards over every work order
 * @returns {string[]} one status per work-order group
 */
export function shopFloorGroupStatuses(orders, entries, type, allOrders = false) {
  const typeOrders = allOrders
    ? orders
    : orders.filter((order) => {
      if (order?.productionType) return order.productionType === type;
      const items = order?.items || [];
      return items.length ? items.some((item) => item.productionType === type) : false;
    });

  const jobsByOrder = new Map();
  entries
    .filter((entry) => !entry?.productionType || entry.productionType === type)
    .forEach((entry) => {
      const key = entry.workOrderId || 'Unassigned';
      if (!jobsByOrder.has(key)) jobsByOrder.set(key, []);
      jobsByOrder.get(key).push(entry);
    });

  return typeOrders.map((order) => {
    const jobs = jobsByOrder.get(order.workOrder) || [];
    if (jobs.length === 0) return 'Pending';
    if (jobs.every((job) => job.status === 'Completed')) return 'Completed';
    if (jobs.some((job) => job.status === 'In Progress')) return 'In Progress';
    if (jobs.some((job) => job.status === 'Hold')) return 'Hold';
    return 'Pending';
  });
}

/**
 * Pure derivation of the twelve Production badges. Exported for tests — every
 * input is an API response (or null when that call failed, which counts as 0).
 */
export function deriveProductionSidebarCounts({
  orders,
  entries,
  orderCounts,
  tvStats,
  drawingStats,
  modelStats,
  qualityCounts,
  packingStats,
  dispatchStats,
  machineShopStats
} = {}) {
  const orderList = rows(orders);
  const entryList = rows(entries);
  const pending = (statuses) => statuses.filter((status) => status === 'Pending').length;

  // Work orders — every order not yet fully approved needs an action.
  const orderKpis = payload(orderCounts) || {};
  const ordersPending = num(orderKpis.draft)
    + num(orderKpis.prodApproval)
    + num(orderKpis.adminApproval);

  // Dispatch — records not yet shipped (draft and cleared/staged).
  const dispatchBody = payload(dispatchStats) || {};

  return {
    orders: ordersPending,
    technicalVerification: num(payload(tvStats)?.pending),
    drawings: num(payload(drawingStats)?.pending),
    models: num(payload(modelStats)?.pending),
    casting: pending(shopFloorGroupStatuses(orderList, entryList, 'Casting')),
    fabrication: pending(shopFloorGroupStatuses(orderList, entryList, 'Fabrication')),
    machineShop: num(payload(machineShopStats)?.pendingJobs),
    assembly: pending(shopFloorGroupStatuses(orderList, entryList, 'Assembly', true)),
    quality: num(payload(qualityCounts)?.pending),
    packing: num(payload(packingStats)?.pending),
    dispatch: num(dispatchBody.draft) + num(dispatchBody.ready)
  };
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
    refreshProductionSidebarCounts();
  }, delay);
}

/** Runs the badge queries once and publishes the derived snapshot. */
async function loadCounts() {
  try {
    /* Each query is isolated: one failing endpoint must not discard the counts
       of all the others (the derivation treats null as 0). */
    const safe = (call) => Promise.resolve().then(call).catch(() => null);
    const [
      orders,
      entries,
      orderCounts,
      tvStats,
      drawingStats,
      modelStats,
      qualityCounts,
      packingStats,
      dispatchStats,
      machineShopStats
    ] = await Promise.all([
      // `api.get` resolves to the axios response; the api/service helpers below
      // already hand back the response BODY, so unwrap one level here to keep
      // every input to the derivation shaped the same way.
      safe(async () => (await api.get('/production-orders', { params: { page: 0, size: 500 } })).data),
      safe(async () => (await api.get('/production-entries')).data),
      safe(async () => (await api.get('/production-kpi/orders/counts')).data),
      safe(() => tvApi.getStats()),
      safe(() => drawingApi.getStats()),
      safe(() => modelApi.getStats()),
      safe(async () => (await api.get('/production-kpi/quality/counts')).data),
      safe(() => packingApi.getStats()),
      safe(() => dispatchApi.getStats()),
      safe(() => machineShopApi.getStats())
    ]);

    const inputs = {
      orders,
      entries,
      orderCounts,
      tvStats,
      drawingStats,
      modelStats,
      qualityCounts,
      packingStats,
      dispatchStats,
      machineShopStats
    };

    // Nothing loaded at all and nothing has ever been published: this is the
    // "backend not reachable yet" case, not a genuine zero. Retry shortly
    // instead of silently showing no badges until the next navigation.
    if (snapshot === EMPTY_SNAPSHOT && Object.values(inputs).every((value) => value == null)) {
      scheduleFailureRetry();
      return snapshot;
    }

    snapshot = { counts: deriveProductionSidebarCounts(inputs) };
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
export function refreshProductionSidebarCounts() {
  if (!inFlight) {
    inFlight = loadCounts().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

function scheduleIdleRefresh(delayMs = IDLE_REFRESH_MS) {
  const run = () => refreshProductionSidebarCounts();
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
    refreshProductionSidebarCounts();
  }, MUTATION_DEBOUNCE_MS);
}

/** One shared set of listeners for the tab's lifetime. */
function ensureSubscriptions() {
  if (subscriptionsInstalled || typeof window === 'undefined') return;
  subscriptionsInstalled = true;
  // The module's own change bus (every Production write dispatches it) plus the
  // global approval refresh: a badge can move when a decision is recorded in a
  // page that never writes a Production row itself.
  window.addEventListener(PRODUCTION_DATA_CHANGED_EVENT, scheduleMutationRefresh);
  window.addEventListener(PENDING_APPROVAL_REFRESH_EVENT, scheduleMutationRefresh);
}

/**
 * Pending-work counts for the Production submenu.
 *
 * Returns a stable snapshot (same object identity until the numbers actually
 * move), so React re-renders the sidebar only when a count changes.
 */
export default function useProductionSidebarCounts() {
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

  const refresh = useCallback(() => refreshProductionSidebarCounts(), []);

  return { counts: value.counts, refresh };
}
