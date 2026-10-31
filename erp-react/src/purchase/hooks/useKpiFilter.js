/**
 * purchase/hooks/useKpiFilter.js
 * ------------------------------------------------------------------
 * Shared KPI ↔ status-filter bridge used by every Invoice Management
 * module (Invoice List, 3-Way Matching, Payment Approval, Vendor
 * Payment, Payment Advice, Credit / Debit Notes) so that:
 *
 *   KPI click        → KPI selected + list filter applied + status
 *                      tab synchronized
 *   status tab click → list filter applied + matching KPI selected
 *
 * There is ONE source of truth: the filter *token* that a KPI maps to.
 * The page owns the actual list/fetch state and receives it through
 * `applyToken`; this hook only keeps the two controls (KPI cards and
 * status tabs) pointing at that same token.
 *
 * Token vocabulary is page-defined (e.g. 'All', an INVOICE_STATUS, a
 * MATCH_STATUS, or a view key for Payment Advice). KPI keys are the
 * `key` used by the KPI card definitions.
 *
 * Behavior matches the Invoice Management reference:
 *  - clicking the already-active KPI clears the filter back to All;
 *  - selecting a status tab highlights the KPI whose token matches it
 *    (or clears the KPI highlight when no KPI represents that token);
 *  - clicking "All" selects the module's All-KPI when one exists.
 *
 * State is local to each module instance, so navigating between
 * modules never leaks a KPI selection into another module.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export default function useKpiFilter({
  /* kpiKey → filter token (e.g. { total: 'All', Approved: 'Approved' }) */
  kpiMap = {},
  /* token → kpiKey used when a status tab is clicked (e.g. { 'All': 'total' }) */
  tokenKpi = {},
  /* token that represents "all records" (clearing the filter) */
  allToken = 'All',
  /* kpiKey shown when the All token is active (may be null) */
  allKpi = null,
  /* KPI highlighted on first render (may be null) */
  initialKpi = null,
  /* single source of truth consumer — applies the filter token to the
     page's own list/fetch state */
  applyToken
}) {
  const applyRef = useRef(applyToken);
  useEffect(() => {
    applyRef.current = applyToken;
  }, [applyToken]);

  const [activeKpi, setActiveKpi] = useState(initialKpi);

  const tokenOf = useCallback((kpiKey) => (kpiMap[kpiKey] != null ? kpiMap[kpiKey] : allToken), [kpiMap, allToken]);
  const kpiOf = useCallback((token) => (tokenKpi[token] != null ? tokenKpi[token] : token === allToken ? allKpi : null), [tokenKpi, allToken, allKpi]);

  const selectKpi = useCallback((kpiKey) => {
    const token = tokenOf(kpiKey);
    const togglingOff = activeKpi === kpiKey;
    const nextKpi = togglingOff ? kpiOf(allToken) : kpiKey;
    setActiveKpi(nextKpi);
    applyRef.current?.(togglingOff ? allToken : token);
  }, [activeKpi, tokenOf, kpiOf, allToken]);

  const selectToken = useCallback((token) => {
    setActiveKpi(kpiOf(token));
    applyRef.current?.(token);
  }, [kpiOf]);

  const clear = useCallback(() => {
    setActiveKpi(kpiOf(allToken));
    applyRef.current?.(allToken);
  }, [kpiOf, allToken]);

  return { activeKpi, selectKpi, selectToken, clear };
}
