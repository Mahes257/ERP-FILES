import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import exchangeRateService from '../../services/exchangeRateService';
import { isAuthenticated } from '../../services/authService';

const REFRESH_MS = 24 * 60 * 60 * 1000; // 24 hours

const ExchangeRateContext = createContext(null);

/**
 * Centralized exchange rates for the whole app (single source of truth).
 *
 * - Loads the latest rates (cached in MySQL by the backend) ONCE per session.
 * - Silently refreshes in the background when the cached rates are stale or
 *   older than 24 hours — no page reload, no UI disruption.
 * - If the backend/provider is unavailable, the last cached rates stay in
 *   memory so quotations keep working.
 *
 * Navigation note: the provider sits above the router, and rates change at
 * most once a day — so the load is guarded by a "already loaded" ref. Earlier
 * this effect re-ran on every pathname change, issuing a GET
 * /exchange-rates/latest (plus a POST /exchange-rates/refresh when stale) on
 * every single page transition even though nothing had changed.
 */
export function ExchangeRateProvider({ children }) {
  const [rates, setRates] = useState({});
  const [base, setBase] = useState('INR');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();
  // True once the rates have been read successfully — navigation must not
  // re-issue the request. Reset only by a full page reload / sign-out.
  const loadedRef = useRef(false);
  const inFlightRef = useRef(false);

  const applyLatest = useCallback((payload) => {
    const d = payload?.data ?? payload ?? {};
    if (d.base) setBase(d.base);
    if (d.rates && typeof d.rates === 'object') setRates(d.rates);
    if (d.lastUpdated) setLastUpdated(d.lastUpdated);
    setStale(Boolean(d.stale));
  }, []);

  useEffect(() => {
    let cancelled = false;

    // This provider is mounted above the route tree, including /signin.
    // Protected exchange-rate endpoints must not be called until login has
    // stored an access or refresh token. The pathname dependency retries the
    // initial load when navigation moves from /signin to the ERP, but once the
    // rates are loaded every further navigation reuses them (no refetch).
    if (!isAuthenticated() || loadedRef.current || inFlightRef.current) {
      return () => {
        cancelled = true;
      };
    }
    inFlightRef.current = true;

    (async () => {
      try {
        const res = await exchangeRateService.getLatest();
        if (cancelled) return;
        loadedRef.current = true;
        setError(null);
        applyLatest(res);
        const d = res?.data ?? res ?? {};
        const last = d.lastUpdated ? new Date(d.lastUpdated) : null;
        const needsRefresh =
          d.stale || !last || Number.isNaN(last.getTime()) || Date.now() - last.getTime() > REFRESH_MS;
        if (needsRefresh) {
          // Background daily refresh — never blocks or reloads the UI.
          exchangeRateService
            .refresh()
            .then((r) => {
              if (!cancelled) applyLatest(r);
            })
            .catch(() => {});
        }
      } catch (requestError) {
        if (!cancelled) {
          // Preserve any rates already in memory while exposing the failure
          // to consumers; the Axios interceptor owns auth refresh/sign-out.
          setError(requestError);
        }
      } finally {
        inFlightRef.current = false;
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyLatest, location.pathname]);

  /** Manual "Refresh Now" (used by Financial Settings). */
  const refreshNow = useCallback(async () => {
    const res = await exchangeRateService.refresh();
    applyLatest(res);
    return res?.data ?? res ?? {};
  }, [applyLatest]);

  return (
    <ExchangeRateContext.Provider
      value={{ rates, base, lastUpdated, stale, loading, error, refreshNow }}
    >
      {children}
    </ExchangeRateContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useExchangeRates() {
  const ctx = useContext(ExchangeRateContext);
  if (!ctx) {
    return { rates: {}, base: 'INR', lastUpdated: null, stale: false, loading: false, error: null, refreshNow: async () => ({}) };
  }
  return ctx;
}
