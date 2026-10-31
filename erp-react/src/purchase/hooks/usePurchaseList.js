/**
 * purchase/hooks/usePurchaseList.js
 * ------------------------------------------------------------------
 * Generic list orchestrator for the Purchase module. Takes a page
 * fetcher `fetchPage({ search, filters, page, pageSize, sortKey,
 * sortDirection })` returning `{ data, total }` and exposes query
 * state plus refresh. Used by the vendor / RFQ / PO / invoice lists.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? 'All' : value;
}

export default function usePurchaseList(
  fetchPage,
  {
    pageSize: initialPageSize = 10,
    sortKey: initialSortKey = 'createdAt',
    sortDir: initialSortDir = 'desc'
  } = {}
) {
  const [records, setRecords] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [search, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState(initialSortDir);
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRef = useRef(fetchPage);
  useEffect(() => {
    fetchRef.current = fetchPage;
  }, [fetchPage]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetchRef.current({
          search,
          filters,
          page,
          pageSize,
          sortKey,
          sortDirection
        });
        if (cancelled) return;
        setRecords(response.data);
        setTotalCount(response.total);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, search, sortKey, sortDirection, filters, refreshKey]);

  /* In-flight mutation — a second submission (double click, double Enter)
     joins the request already running instead of issuing another one, so a
     mutation can never be applied twice. */
  const inFlightMutation = useRef(null);

  const runMutation = useCallback(async (operation) => {
    if (inFlightMutation.current) return inFlightMutation.current;
    setActionLoading(true);
    const run = (async () => {
      try {
        const result = await operation();
        setError(null);
        setRefreshKey((key) => key + 1);
        return { ok: true, data: result };
      } catch (err) {
        setError(err);
        return { ok: false, error: err };
      } finally {
        setActionLoading(false);
        inFlightMutation.current = null;
      }
    })();
    inFlightMutation.current = run;
    return run;
  }, []);

  const goToPage = useCallback((nextPage) => {
    setPage(Math.max(1, nextPage));
  }, []);

  const changePageSize = useCallback((size) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const toggleSort = useCallback(
    (key) => {
      setSortKey(key);
      setSortDirection((direction) => (sortKey === key && direction === 'asc' ? 'desc' : 'asc'));
    },
    [sortKey]
  );

  const setSearch = useCallback((value) => {
    setSearchQuery(value);
    setPage(1);
  }, []);

  /* Idempotent — re-selecting the value already applied must not produce a
     new filter object, because that would trigger a redundant list fetch
     (the effect depends on the filters object). */
  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const clearing = value === undefined || value === null || value === '';
      if (clearing ? !(key in prev) : prev[key] === value) return prev;
      const next = { ...prev, [key]: value };
      if (clearing) delete next[key];
      return next;
    });
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    search,
    sortKey,
    sortDirection,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    runMutation
  };
}

export { toFilter };
