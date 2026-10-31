import { useState, useEffect, useCallback } from 'react';

/**
 * useAsyncData — generic data fetch hook with loading / error / fallback
 * states. Falls back to `fallbackData` when the request fails so the UI
 * keeps rendering (same graceful-degradation behaviour as useLeads).
 */
export default function useAsyncData(fetcher, options = {}) {
  const { fallbackData, deps = [] } = options;
  const [data, setData] = useState(fallbackData ?? []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const result = await fetcher();
        if (cancelled) return;
        setData(result);
        setError(null);
        setIsFallback(false);
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setIsFallback(true);
        if (fallbackData) setData(fallbackData);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, ...deps]);

  return { data, loading, error, isFallback, refresh };
}
