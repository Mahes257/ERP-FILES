/**
 * purchase/hooks/usePurchaseDashboard.js
 * ------------------------------------------------------------------
 * Data orchestrator for the Purchase Dashboard. Loads every dashboard
 * section from the dashboard service in parallel and exposes
 * loading / error / refresh. Accepts a `period` parameter so the
 * entire dashboard recalculates when the date range changes.
 *
 * Every section the Dashboard renders is loaded here, from a single
 * refresh signal:
 *
 *   1. Dashboard sections   — dashboardService.* (stats, recent
 *                             requests, pending approvals, pipeline,
 *                             alerts, vendors, analytics …)
 *   2. Section statistics   — the per-module stat endpoints the KPI
 *                             row / Action Center read (RFQ, quotation,
 *                             evaluation, PO, GRN, invoice).
 *
 * Both groups must be refreshed together — otherwise a refresh leaves
 * half the dashboard showing stale numbers. Because they share this
 * hook, one `refresh()` reloads everything exactly once, and the
 * loading / error state is a single source of truth.
 *
 * Section statistics are loaded with Promise.allSettled: they are
 * independent reads, so a failure in one must never blank the whole
 * dashboard. A failed section degrades to `null` (callers fall back to
 * their own defaults) and is reported through `statsError`.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardService } from '../services/dashboard';
import { rfqService } from '../services/rfq';
import { evaluationService } from '../services/evaluation';
import { purchaseOrderService } from '../services/purchaseOrder';
import { logisticsService } from '../services/logistics';
import { invoiceService } from '../services/invoice';

/**
 * Supplementary per-module statistics, in the order they are consumed.
 * Each entry is [key, loader] — the key is what `data[key]` exposes.
 */
const SECTION_STATS = [
  ['rfqStats', () => rfqService.getRfqStats()],
  ['quoteStats', () => rfqService.getQuotationStats()],
  ['evalBoard', () => evaluationService.getEvaluationBoard()],
  ['orderStats', () => purchaseOrderService.getOrderStats()],
  ['grnStats', () => logisticsService.getGrnStats()],
  ['invStats', () => invoiceService.getInvoiceStats()],
];

export default function usePurchaseDashboard(period = 'all') {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statsError, setStatsError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  /* In-flight guard — a refresh must never stack a second batch of
     requests on top of one that is still running. */
  const inFlight = useRef(false);
  /* Resolver for an outstanding refresh() call, so callers can report the
     outcome once the reload has actually settled. */
  const settle = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      inFlight.current = true;
      setLoading(true);
      let outcome = null;
      try {
        const [
          stats,
          recentRequests,
          pendingApprovals,
          poStatus,
          monthlyAnalytics,
          topVendors,
          sourcingSnapshot,
          approvalBreakdown,
          financialSnapshot,
          alerts,
          pipelineStages,
        ] = await Promise.all([
          dashboardService.getDashboardStats(period),
          dashboardService.getRecentRequests(8, period),
          dashboardService.getPendingApprovals(period),
          dashboardService.getPurchaseOrderStatus(period),
          dashboardService.getMonthlyAnalytics(period),
          dashboardService.getTopVendors(5, period),
          dashboardService.getSourcingSnapshot(period),
          dashboardService.getApprovalBreakdown(period),
          dashboardService.getFinancialSnapshot(period),
          dashboardService.getAlerts(period),
          dashboardService.getPipelineStages(period),
        ]);

        /* Section statistics — settled individually so one failing
           module cannot take the whole dashboard down. */
        const settled = await Promise.allSettled(SECTION_STATS.map(([, loader]) => loader()));

        if (cancelled) return;

        const sections = {};
        const failed = [];
        settled.forEach((result, index) => {
          const [key] = SECTION_STATS[index];
          if (result.status === 'fulfilled') {
            sections[key] = result.value ?? null;
          } else {
            sections[key] = null;
            failed.push({ key, reason: result.reason });
          }
        });

        setData({
          stats,
          recentRequests,
          pendingApprovals,
          poStatus,
          monthlyAnalytics,
          topVendors,
          sourcingSnapshot,
          approvalBreakdown,
          financialSnapshot,
          alerts,
          pipelineStages,
          ...sections,
        });
        const sectionsError = failed.length
          ? Object.assign(
              new Error(
                failed.length === SECTION_STATS.length
                  ? 'Some dashboard statistics could not be loaded.'
                  : `Some dashboard statistics could not be loaded (${failed.map((f) => f.key).join(', ')}).`
              ),
              { sections: failed.map((f) => f.key) }
            )
          : null;

        setError(null);
        setStatsError(sectionsError);
        outcome = { ok: true, error: null, statsError: sectionsError };
      } catch (err) {
        if (!cancelled) setError(err);
        outcome = { ok: false, error: err, statsError: null };
      } finally {
        if (!cancelled) {
          setLoading(false);
          inFlight.current = false;
        }
        /* Always resolve, so a caller awaiting refresh() can never hang. */
        const pending = settle.current;
        settle.current = null;
        if (pending) pending(outcome);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [period, refreshKey]);

  /**
   * Guarded refresh.
   *
   * Reloads every dashboard section exactly once and returns a promise
   * that resolves with `{ ok, error, statsError }` when the reload has
   * settled — so callers can show accurate success/error feedback
   * instead of guessing from the shared loading flag.
   *
   * Resolves with `null` when a reload is already running, so an
   * accidental double click can never fire a second batch of requests.
   */
  const refresh = useCallback(() => {
    if (inFlight.current) return Promise.resolve(null);
    inFlight.current = true;
    return new Promise((resolve) => {
      settle.current = resolve;
      setRefreshKey((key) => key + 1);
    });
  }, []);

  return { data, loading, error, statsError, refresh, refreshKey };
}
