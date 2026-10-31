/**
 * purchase/hooks/usePurchaseRequests.js
 * ------------------------------------------------------------------
 * Data orchestrator for the Purchase Requisition list. Loads pages
 * from the mock requisitionService with search / filters / sort and
 * exposes mutations (delete, submit, approve, reject, convert to RFQ).
 * ------------------------------------------------------------------
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { requisitionService } from '../services/requisition';

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? 'All' : value;
}

export default function usePurchaseRequests({ pageSize: initialPageSize = 10 } = {}) {
  const [requests, setRequests] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [search, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [tab, setTabState] = useState('active');
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const response = await requisitionService.getRequisitions({
          search,
          tab,
          status: toFilter(filters.status),
          department: toFilter(filters.department),
          requester: toFilter(filters.requester),
          vendor: toFilter(filters.vendor),
          priority: toFilter(filters.priority),
          project: toFilter(filters.project),
          dateFrom: filters.dateFrom || '',
          dateTo: filters.dateTo || '',
          page,
          pageSize,
          sortBy: sortKey,
          sortDir: sortDirection
        });
        if (cancelled) return;
        setRequests(response.data);
        setTotalCount(response.total);
        if (response.totalPages > 0 && page > response.totalPages) {
          setPage(response.totalPages);
        }
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
  }, [page, pageSize, search, sortKey, sortDirection, tab, filters, refreshKey]);

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
        /* Reload the list with the active filters so the changed row is
           re-read from the backend rather than left stale in place. */
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

  const deleteRequest = useCallback((id) => runMutation(() => requisitionService.deleteRequisition(id)), [runMutation]);
  const bulkDelete = useCallback(
    (ids) => runMutation(() => Promise.all(ids.map((id) => requisitionService.deleteRequisition(id)))),
    [runMutation]
  );
  const archiveRequest = useCallback((id) => runMutation(() => requisitionService.archiveRequisition(id)), [runMutation]);
  const bulkArchive = useCallback(
    (ids) => runMutation(() => Promise.all(ids.map((id) => requisitionService.archiveRequisition(id)))),
    [runMutation]
  );
  const submitRequest = useCallback((id) => runMutation(() => requisitionService.submitRequisition(id)), [runMutation]);
  const approveRequest = useCallback((id, note) => runMutation(() => requisitionService.approveRequisition(id, note)), [runMutation]);
  const bulkApprove = useCallback(
    (ids) => runMutation(() => Promise.all(ids.map((id) => requisitionService.approveRequisition(id, 'Approved in bulk')))),
    [runMutation]
  );
  const bulkConvertToRfq = useCallback(
    (ids) => runMutation(() => requisitionService.convertToRfq(ids)),
    [runMutation]
  );
  const rejectRequest = useCallback((id, note) => runMutation(() => requisitionService.rejectRequisition(id, note)), [runMutation]);
  const returnRequest = useCallback((id, note) => runMutation(() => requisitionService.returnRequisition(id, note)), [runMutation]);
  const duplicateRequest = useCallback((id) => runMutation(() => requisitionService.duplicateRequisition(id)), [runMutation]);
  const saveTechnicalReview = useCallback((id, review) => runMutation(() => requisitionService.saveTechnicalReview(id, review)), [runMutation]);

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

  const setTab = useCallback((nextTab) => {
    setTabState(nextTab);
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
    setPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((key) => key + 1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    requests,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    search,
    sortKey,
    sortDirection,
    tab,
    setTab,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    clearSearch,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    deleteRequest,
    bulkDelete,
    archiveRequest,
    bulkArchive,
    submitRequest,
    approveRequest,
    bulkApprove,
    bulkConvertToRfq,
    rejectRequest,
    returnRequest,
    duplicateRequest,
    saveTechnicalReview
  };
}
