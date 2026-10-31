/**
 * purchase/hooks/usePurchaseSidebarCounts.js
 * ------------------------------------------------------------------
 * Sidebar count badges for the Purchase submenu — a single source of
 * truth shared with the pages themselves. Every count is derived from
 * the SAME service/data layer the list pages use, and every count is
 * a PENDING / action-required count only (see utils/pendingStatus for
 * the shared pending semantics). Approved / Completed / Rejected /
 * Cancelled / Closed / Awarded and other non-pending records are
 * never counted, and a zero pending count renders no badge at all
 * (LeafItem hides the badge when count === 0).
 *
 *   Purchase Requisition List   → PRs whose canonical status is
 *                                 PENDING_APPROVAL only — the exact
 *                                 same field as the Pending Approval
 *                                 KPI card (requisitionService
 *                                 getRequisitionStats.pendingApproval).
 *                                 Draft / Returned / Approved /
 *                                 Rejected / Converted / PO Raised and
 *                                 every other status never count.
 *   Technical Specification     → PRs in the canonical TECHNICAL_REVIEW
 *     Review                      stage (set automatically on approval).
 *   Vendor List                 → vendors with status Pending Approval
 *                                 (vendorService getVendorStats).
 *   RFQ List                    → RFQs requiring action: Draft, Pending
 *                                 Approval, Sent, Quotation Received,
 *                                 Evaluation (rfqService getRfqStats).
 *                                 Approved / Awarded / Closed /
 *                                 Cancelled RFQs are never counted.
 *   RFQ Follow-ups              → total active follow-up records —
 *                                 matches the RFQ Follow-ups page
 *                                 "Active" tab count (all records that
 *                                 are not archived or deleted).
 *   Vendor Quotations           → quotations in Received status (await
 *                                 an accept / reject decision).
 *   Quotation Comparison        → board items with received quotations
 *                                 whose workflow has not reached
 *                                 Comparison yet (startEvaluation opens
 *                                 it).
 *   Price Negotiation           → board items whose workflow reached
 *                                 Comparison with no round closed as
 *                                 Agreed and not past negotiation.
 *   Technical Evaluation        → board items whose technical step is
 *                                 pending AND the strict workflow gate
 *                                 is unlocked (Comparison + Negotiation
 *                                 done).
 *   Commercial Evaluation       → board items whose commercial step is
 *                                 pending AND the gate is unlocked
 *                                 (Technical done).
 *   Supplier Selection          → board items with no selection yet AND
 *                                 the gate unlocked (the full sourcing
 *                                 sequence + payment terms done).
 *   Purchase Order List         → POs with approvalStatus Pending
 *                                 (awaiting approval / release).
 *   Released PO & Supplier Ack  → released POs still awaiting supplier
 *                                 acknowledgement (PENDING only —
 *                                 exceptions are never counted; see
 *                                 utils/poAcknowledgement).
 *   Invoice List                → invoices in the Submitted lifecycle
 *                                 status (awaiting approval — the same
 *                                 count as the Submitted tab / KPI).
 *   Three-Way Matching          → invoices whose derived match status
 *                                 is Pending (awaiting the 3-way match).
 *   Payment Approval            → invoices that are matched and not yet
 *                                 paid (awaiting the payment decision).
 *   Vendor Payment              → same matched-and-unpaid set as Payment
 *                                 Approval (awaiting payment recording).
 *   Payment Advice              → no count (issued advice documents have
 *                                 no pending workflow state).
 *   PCS – Price Comparative     → board items with quotations received
 *     Statement                   whose selection is not yet done.
 *   TBE – Technical Bid          → board items whose technical bid
 *     Assessment                  evaluation is not yet completed.
 *   TBE – Technical Bid          → board items whose technical bid
 *     Assessment                  evaluation is not yet completed.
 *   TBER – Technical Bid         → board items whose technical bid
 *     Evaluation Report           evaluation report is not yet completed.
 *   Logistics: Manufacturing     → jobs in In Production status.
 *     / Packing
 *   Logistics: Shipment          → shipments in In Transit or Delayed.
 *     Tracking
 *   Logistics: Goods Receipt     → GRNs in Expected or Pending
 *     / GRN                        Inspection status.
 *   Logistics: Quality           → inspections in Pending status.
 *     Inspection
 *   NFA – Note for Approval     → notes awaiting the approval decision
 *                                 (Pending Approval only — Draft /
 *                                 Approved / Rejected are never counted;
 *                                 the badge is the exact same field as
 *                                 the Pending Approval KPI card).
 *   Vendor Documents            → documents awaiting verification
 *                                 (Pending only — Verified / Expired /
 *                                 archived / deleted never count; the
 *                                 badge is the exact same field as the
 *                                 Pending Verification KPI card).
 *
 * The hook returns { counts, overdueCounts } — counts drives the badge
 * numbers, overdueCounts drives the extra overdue pulse highlight on
 * the leaves that carry overdue items (currently RFQ Follow-ups).
 *
 * Nothing is hardcoded. The counts live in ONE module-level store that
 * every badge consumer shares (the in-page tab navs render one of these
 * hooks per page — ModuleTabNav or RfqTabNav), so mounting/navigating
 * between Purchase pages never restarts the badge queries.
 *
 * The store is (re)loaded:
 *   • on first read and whenever the cached snapshot is older than
 *     ROUTE_STALE_MS — a light stale-while-revalidate guard, so normal
 *     navigation reuses the already-loaded counts instead of firing
 *     15 stat/list requests on every route change. A stale read is run in
 *     an idle slot so it never delays the destination page's own data, and
 *   • immediately (debounced) after every purchase data mutation — the
 *     local change bus (subscribePurchaseData in services/base.js), the
 *     window event the Purchase API client dispatches after a successful
 *     write (PURCHASE_DATA_CHANGED_EVENT), and the global approval-change
 *     event all invalidate the snapshot, so approving / submitting /
 *     entering a quotation updates the badges without a route change, and
 *   • when the tab regains focus/visibility and the snapshot is stale.
 * Concurrent refreshes are coalesced into a single set of requests.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { PURCHASE_DATA_CHANGED_EVENT, subscribePurchaseData } from '../services/base';
// Re-exported so consumers/tests have a single import site for the event.
export { PURCHASE_DATA_CHANGED_EVENT } from '../services/base';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import { requisitionService } from '../services/requisition';
import { nfaService } from '../services/nfa';
import { vendorDocumentService } from '../services/vendorDocuments';
import { rfqService } from '../services/rfq';
import { evaluationService } from '../services/evaluation';
import { rfqFollowUpService } from '../services/rfqFollowUp';
import { purchaseOrderService } from '../services/purchaseOrder';
import { vendorService } from '../services/vendor';
import { invoiceService } from '../services/invoice';
import { logisticsService } from '../services/logistics';
import { deriveActionCounts, deriveOverdueHighlights } from '../utils/purchaseActionCounts';

/** Leaf keys (PURCHASE_CATEGORIES menu keys) that carry a count badge.
 *  Includes both leaf-level keys (used by in-page tab navs) and
 *  category-level aggregate keys (used by the sidebar top-level items). */
const COUNTED_LEAF_KEYS = [
  'work-queue',
  'pr-list',
  'pr-tech-spec',
  'purchase-requisition',
  'vendor-list',
  'rfq-list',
  'rfq-follow-ups',
  'vendor-quotations',
  'final-negotiation',
  'price-comparative-statement',
  'approval-flow',
  'technical-evaluation',
  'po-list',
  'po-released-ack',
  'logistics-manufacturing',
  'logistics-shipment',
  'logistics-grn',
  'logistics-quality',
  'invoice-list',
  'invoice-three-way',
  'invoice-payment-approval',
  'invoice-vendor-payment',
  'vendor-documents',
  'logistics',
  'invoices'
];

/** Initial shape before the first fetch. Zero counts are NOT rendered —
 *  LeafItem only shows the badge when the count is > 0, so empty stages
 *  simply show no badge at all. */
const EMPTY_COUNTS = Object.fromEntries(COUNTED_LEAF_KEYS.map((key) => [key, 0]));
const EMPTY_OVERDUE = { 'rfq-follow-ups': 0 };

/**
 * Backward-compatible wrapper — delegates to deriveActionCounts in
 * utils/purchaseActionCounts.js. The named-param signature is preserved
 * so existing tests continue to pass.
 */
export function deriveSidebarCounts(params) {
  return deriveActionCounts(params);
}

/** Backward-compatible wrapper — delegates to deriveOverdueHighlights. */
export function deriveOverdueCounts({ followUpStats }) {
  return deriveOverdueHighlights({ followUpStats });
}

/* ==================================================================
 * Shared badge-count store
 * ------------------------------------------------------------------
 * One module-level snapshot for the whole app. Every tab nav that
 * renders a badge reads from this store, so N mounted consumers cost
 * exactly ONE set of requests (previously every consumer re-fetched 15
 * endpoints on every route change).
 * ================================================================== */

/** Reuse the cached snapshot for this long before re-reading it on a
 *  route change / tab focus. Any purchase mutation refreshes immediately. */
const ROUTE_STALE_MS = 30 * 1000;

/** Mutations arrive in bursts (one save can persist several collections);
 *  coalesce them into a single refresh pass. */
const MUTATION_DEBOUNCE_MS = 150;

/** Deferral for a stale (non-mutation) refresh so it never competes with
 *  the destination page's critical data requests during navigation. */
const IDLE_REFRESH_MS = 400;

const EMPTY_SNAPSHOT = { counts: EMPTY_COUNTS, overdueCounts: EMPTY_OVERDUE };

let snapshot = EMPTY_SNAPSHOT;
let lastLoadedAt = 0;
let inFlight = null;
let mutationTimer = null;
let busUnsubscribe = null;
const listeners = new Set();

/** Bounded retry for a first load in which EVERY request failed.
 *
 *  That happens when the badge store is read while the backend is still
 *  starting (or briefly unreachable): the store publishes nothing, and the
 *  badges would stay empty until some later navigation happened to satisfy the
 *  staleness window. Two retries cover a restart without ever polling, and a
 *  successful read clears the schedule. A signed-in user who genuinely has no
 *  Purchase access also produces an all-null batch (every endpoint 403s); the
 *  retries are bounded, so that case stops after two attempts. */
const FAILURE_RETRY_DELAYS_MS = [2000, 6000];
let failureRetryTimer = null;
let failureRetryAttempt = 0;

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
    refreshPurchaseSidebarCounts();
  }, delay);
}

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

/** Runs the badge queries once and publishes the derived snapshot. */
async function loadCounts() {
  try {
    /* Each query is isolated: one failing endpoint must not discard the
       counts of all the others (deriveActionCounts tolerates null). */
    const safe = (call) => call.catch(() => null);
    const stats = await Promise.all([
      safe(requisitionService.getRequisitionStats()),
      safe(nfaService.getNfaStats()),
      safe(rfqService.getRfqStats()),
      safe(rfqService.getQuotationStats()),
      safe(rfqFollowUpService.getFollowUpStats()),
      safe(evaluationService.getEvaluationBoard()),
      safe(purchaseOrderService.getOrders({ page: 1, pageSize: 500 })),
      safe(vendorService.getVendorStats()),
      safe(invoiceService.getInvoiceStats()),
      safe(invoiceService.getInvoices({ page: 1, pageSize: 500 })),
      safe(vendorDocumentService.getDocumentStats()),
      safe(logisticsService.getManufacturingStats()),
      safe(logisticsService.getShipmentStats()),
      safe(logisticsService.getGrnStats()),
      safe(logisticsService.getInspectionStats())
    ]);

    // Nothing loaded at all and nothing has ever been published: this is the
    // "backend was not reachable yet" case, not a genuine set of zero counts.
    // Keep the (empty) snapshot and retry shortly instead of silently showing
    // no badges until the next route change.
    if (snapshot === EMPTY_SNAPSHOT && stats.every((value) => value == null)) {
      scheduleFailureRetry();
      return snapshot;
    }

    snapshot = {
      counts: deriveSidebarCounts({
        reqStats: stats[0],
        nfaStats: stats[1],
        rfqStats: stats[2],
        quoteStats: stats[3],
        followUpStats: stats[4],
        board: stats[5],
        poResult: stats[6],
        vendorStats: stats[7],
        invoiceStats: stats[8],
        invoiceResult: stats[9],
        docStats: stats[10],
        mfgStats: stats[11],
        shipStats: stats[12],
        grnStats: stats[13],
        inspStats: stats[14]
      }),
      overdueCounts: deriveOverdueCounts({ followUpStats: stats[4] })
    };
    lastLoadedAt = Date.now();
    failureRetryAttempt = 0;
    clearFailureRetry();
    emit();
    return snapshot;
  } catch {
    /* Keep the last-known counts on failure — the lists show their own
       error states; the next invalidation or stale read retries. */
    if (snapshot === EMPTY_SNAPSHOT) scheduleFailureRetry();
    return snapshot;
  }
}

/** Refresh now (single-flight: concurrent callers share one round). */
export function refreshPurchaseSidebarCounts() {
  if (!inFlight) {
    inFlight = loadCounts().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

/**
 * Refresh only when the cached snapshot is older than maxAgeMs.
 *
 * A stale (not mutated) read is scheduled for an idle slot instead of
 * firing mid-navigation: the destination page's own list/stats requests
 * must always get the browser's connection slots first. This is
 * prioritisation, not a delay — the badges simply repaint a moment later.
 */
function refreshIfStale(maxAgeMs = ROUTE_STALE_MS) {
  if (snapshot !== EMPTY_SNAPSHOT && Date.now() - lastLoadedAt < maxAgeMs) return Promise.resolve(snapshot);
  return scheduleIdleRefresh();
}

/** Runs a non-critical refresh when the thread/network is free. */
function scheduleIdleRefresh(delayMs = IDLE_REFRESH_MS) {
  const run = () => refreshPurchaseSidebarCounts();
  if (typeof window === 'undefined') return run();
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: delayMs });
    return undefined;
  }
  setTimeout(run, delayMs);
  return undefined;
}

/** Coalesce mutation bursts into one refresh pass. */
function scheduleMutationRefresh() {
  if (mutationTimer) clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    mutationTimer = null;
    refreshPurchaseSidebarCounts();
  }, MUTATION_DEBOUNCE_MS);
}

/** One shared subscription to every invalidation source. Installed the
 *  first time a badge consumer mounts and kept for the tab's lifetime so
 *  approvals / quotation entries update the badges in place. */
function ensureInvalidationSubscriptions() {
  if (busUnsubscribe) return;
  const onLocalMutation = () => scheduleMutationRefresh();
  const unsubscribeBus = subscribePurchaseData(onLocalMutation);
  window.addEventListener(PURCHASE_DATA_CHANGED_EVENT, onLocalMutation);
  window.addEventListener(PENDING_APPROVAL_REFRESH_EVENT, onLocalMutation);
  busUnsubscribe = () => {
    unsubscribeBus();
    window.removeEventListener(PURCHASE_DATA_CHANGED_EVENT, onLocalMutation);
    window.removeEventListener(PENDING_APPROVAL_REFRESH_EVENT, onLocalMutation);
  };
}

function subscribeStore(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Shared sidebar badge counts for the Purchase module.
 *
 * Returns the cached snapshot (identical object identity until the data
 * actually changes, so React re-renders only when the numbers move) and
 * refreshes it only when it is genuinely stale or a mutation occurred.
 */
export default function usePurchaseSidebarCounts() {
  const value = useSyncExternalStore(subscribeStore, getSnapshotValue, getSnapshotValue);
  const mountedRef = useRef(false);

  useEffect(() => {
    ensureInvalidationSubscriptions();
  }, []);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      // First consumer in this tab (or a fresh page reload): read the
      // counts, but only if the snapshot is stale — normal navigation
      // reuses the data already in memory.
      refreshIfStale();
    }
  }, []);

  // Multi-tab / returning-to-tab safety: re-read once when the tab becomes
  // visible again and the snapshot has aged past the staleness window.
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

  const refresh = useCallback(() => refreshPurchaseSidebarCounts(), []);

  return { counts: value.counts, overdueCounts: value.overdueCounts, refresh };
}
