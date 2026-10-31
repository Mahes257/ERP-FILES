/**
 * PendingApprovalContext.jsx
 * ------------------------------------------------------------------
 * Supplies the live "Pending Approval" counts for the sidebar badges: one
 * number per module that has an approval workflow, plus the parent totals
 * (Customer Purchase Request, Sales Execution) and the global total.
 *
 * Count source: the consolidated backend endpoint GET /approvals/summary
 * (backend/database is the source of truth — each module reuses its existing
 * COUNT-based stats logic, so these numbers always match the module pages).
 * Draft / approved / rejected / archived / deleted / cancelled and
 * superseded revision rows are NEVER counted. A record is pending while it
 * sits in its module's approval queue: 'pending approval' (CPR, Quotation,
 * Credit Note), 'submitted' (Cost Workout, Profit Workout, Sales Contract —
 * the status those services' own approve/reject actions accept), 'under
 * review' (Sales Contract), 'pending review' (Sales Order), 'under
 * verification' (CPR Technical Verification) and the Production Order
 * approval queues ('Pending Production Approval' / 'Pending Admin Approval' —
 * the two stages approve-production / approve-admin accept) together with the
 * normal Production 'Pending' status (released work orders waiting to be
 * started — not an approval stage, but pending production work all the same).
 *
 * Modules without an approval workflow (Leads, Clients, Follow-ups, Proforma
 * Invoices, Delivery Challans, Invoices, Payment Receipts) report 0.
 *
 * Refresh strategy (no polling, no per-navigation traffic):
 *   - once on app load
 *   - whenever a data-mutating action completes (approve / reject / submit /
 *     status change) — hooks dispatch PENDING_APPROVAL_REFRESH_EVENT
 *   - on a route change / tab focus ONLY when the last successful read is
 *     older than STALE_AFTER_MS. Navigating between pages does not change
 *     anybody's pending-approval count, so the previous behaviour (one
 *     GET /approvals/summary on every single route change) was pure
 *     navigation overhead; mutations still refresh the badges instantly.
 * ------------------------------------------------------------------
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { AUTH_STATE_CHANGED_EVENT, getStoredToken } from '../../services/tokenStorage';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';

const PendingApprovalContext = createContext({
  counts: {},
  count: 0,
  customerPurchaseRequest: 0,
  salesExecution: 0,
  production: 0,
  purchase: 0,
  loading: false,
  refresh: () => {}
});

// eslint-disable-next-line react-refresh/only-export-components
export function usePendingApprovals() {
  return useContext(PendingApprovalContext);
}

const STALE_AFTER_MS = 15 * 1000;

/** Deferral for a stale (non-mutation) badge refresh so it never competes
 *  with the destination page's critical requests during navigation. */
const IDLE_REFRESH_MS = 400;

function runWhenIdle(task, delayMs = IDLE_REFRESH_MS) {
  if (typeof window === 'undefined') {
    task();
    return;
  }
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: delayMs });
    return;
  }
  setTimeout(task, delayMs);
}

// Map of summary key -> sidebar module key. Keys with no approval workflow
// stay 0 and simply never render a badge.
const SUMMARY_KEYS = {
  cpr: 'cpr',
  cprTv: 'cprTv',
  costWorkout: 'costWorkout',
  profitWorkout: 'profitWorkout',
  quotations: 'quotation',
  salesContracts: 'salesContract',
  salesOrders: 'salesOrder',
  creditNotes: 'creditNote',
  productionOrders: 'productionOrder',
  // Purchase approval queues — see ApprovalSummaryService (PURCHASE_APPROVE).
  purchaseRequisitions: 'purchaseRequisition',
  purchaseVendors: 'purchaseVendor',
  purchaseRfqs: 'purchaseRfq',
  purchaseOrders: 'purchaseOrder',
  purchaseInvoices: 'purchaseInvoice',
  leads: 'leads',
  clients: 'clients',
  followups: 'followups',
  proformaInvoices: 'proformaInvoice',
  deliveryChallans: 'deliveryChallan',
  invoices: 'invoice',
  paymentReceipts: 'paymentReceipt'
};

export function PendingApprovalProvider({ children }) {
  const [counts, setCounts] = useState({});
  const [count, setCount] = useState(0);
  const [customerPurchaseRequest, setCustomerPurchaseRequest] = useState(0);
  const [salesExecution, setSalesExecution] = useState(0);
  const [production, setProduction] = useState(0);
  const [purchase, setPurchase] = useState(0);
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  const pathRef = useRef(location.pathname);
  const mountedRef = useRef(false);
  // Timestamp of the last SUCCESSFUL summary read (0 = never read yet).
  const lastLoadedAtRef = useRef(0);
  // Coalesce overlapping refreshes (e.g. a mutation event firing while a
  // route-change refresh is still in flight) instead of stacking requests.
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return;
    // No signed-in session (e.g. the /signin page): nothing to count.
    if (!getStoredToken()) return;
    inFlightRef.current = true;
    try {
      const res = await api.get('/approvals/summary');
      const s = res?.data?.data ?? res?.data ?? {};
      const nextCounts = {};
      Object.entries(SUMMARY_KEYS).forEach(([summaryKey, moduleKey]) => {
        nextCounts[moduleKey] = Number(s[summaryKey]) || 0;
      });
      // Parent totals come from the backend; fall back to summing the child
      // module counts if the endpoint shape ever changes.
      const fallbackCpr =
        nextCounts.cpr + nextCounts.cprTv + nextCounts.costWorkout + nextCounts.profitWorkout;
      const fallbackSalesExecution =
        nextCounts.quotation +
        nextCounts.salesContract +
        nextCounts.salesOrder +
        nextCounts.creditNote;
      const fallbackGlobal = Object.values(nextCounts).reduce((sum, value) => sum + value, 0);
      setCounts(nextCounts);
      setCustomerPurchaseRequest(Number(s.customerPurchaseRequest) || fallbackCpr);
      setSalesExecution(Number(s.salesExecution) || fallbackSalesExecution);
      // Production: backend-gated per status (PRODUCTION_APPROVE for the
      // approval queues, PRODUCTION_EDIT for released 'Pending' work orders),
      // so a user who can action none of it simply receives 0.
      setProduction(Number(s.production) || nextCounts.productionOrder);
      // Purchase: five approval queues, each already gated by PURCHASE_APPROVE
      // on the server, so a user who cannot approve simply receives 0.
      const fallbackPurchase =
        nextCounts.purchaseRequisition +
        nextCounts.purchaseVendor +
        nextCounts.purchaseRfq +
        nextCounts.purchaseOrder +
        nextCounts.purchaseInvoice;
      setPurchase(Number(s.purchase) || fallbackPurchase);
      setCount(Number(s.global) || fallbackGlobal);
      lastLoadedAtRef.current = Date.now();
    } catch {
      // Keep the last known counts on failure — best effort, never blocking.
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  // Initial load (deferred so it never blocks first paint) + live refresh on
  // data-mutating actions (no polling).
  useEffect(() => {
    const initialTimer = setTimeout(refresh, 0);
    window.addEventListener(PENDING_APPROVAL_REFRESH_EVENT, refresh);
    window.addEventListener(AUTH_STATE_CHANGED_EVENT, refresh);
    return () => {
      clearTimeout(initialTimer);
      window.removeEventListener(PENDING_APPROVAL_REFRESH_EVENT, refresh);
      window.removeEventListener(AUTH_STATE_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  // Navigation refresh (stale-while-revalidate): moving between pages never
  // changes the counts, so only re-read when the cached summary has aged out —
  // and even then only in an idle slot, so the destination page's own data
  // requests always win the browser's connection slots. Mutations below stay
  // immediate.
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      pathRef.current = location.pathname;
      return undefined;
    }
    if (location.pathname !== pathRef.current) {
      pathRef.current = location.pathname;
      if (Date.now() - lastLoadedAtRef.current >= STALE_AFTER_MS) {
        runWhenIdle(() => refresh());
      }
    }
    return undefined;
  }, [location.pathname, refresh]);

  // Multi-tab safety (no polling): when the user returns to this tab, re-read
  // the summary so changes made in another tab are reflected — but reuse the
  // cached value while it is still fresh.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoadedAtRef.current >= STALE_AFTER_MS) {
        runWhenIdle(() => refresh());
      }
    };
    const onFocus = () => {
      if (Date.now() - lastLoadedAtRef.current >= STALE_AFTER_MS) runWhenIdle(() => refresh());
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  return (
    <PendingApprovalContext.Provider
      value={{ counts, count, customerPurchaseRequest, salesExecution, production, purchase, loading, refresh }}
    >
      {children}
    </PendingApprovalContext.Provider>
  );
}
