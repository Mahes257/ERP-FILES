import { useCallback, useEffect, useState } from 'react';
import useDebounce from './useDebounce';
import costWorkoutService from '../services/costWorkoutService';
import { normalizeApiError } from '../services/cprService';
import { normalizeCw } from '../utils/costWorkoutHelpers';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../utils/pendingApproval';

const KPI_STATUS = {
  all: '',
  draft: 'draft',
  completed: 'completed',
  submitted: 'submitted',
  approved: 'approved',
  rejected: 'rejected',
  totalvalue: ''
};

function parsePageResponse(response) {
  if (Array.isArray(response)) {
    return { list: response, total: response.length };
  }
  if (response?.content) {
    return { list: response.content, total: response.totalElements ?? response.content.length };
  }
  if (Array.isArray(response?.data)) {
    return { list: response.data, total: response.total ?? response.data.length };
  }
  if (Array.isArray(response?.data?.content)) {
    return { list: response.data.content, total: response.data.totalElements ?? response.data.content.length };
  }
  return { list: [], total: 0 };
}

function buildParams({ subtab, activeKpi, page, pageSize, search, sortKey, sortDirection, filters }) {
  const params = {
    page: Math.max(0, page - 1),
    size: pageSize,
    sort: sortKey ? `${sortKey},${sortDirection}` : undefined
  };
  if (search) params.search = search;
  if (subtab === 1) params.status = 'archived';
  else if (subtab === 2) params.status = 'deleted';
  else if (filters.status) params.status = filters.status;
  else if (KPI_STATUS[activeKpi]) params.status = KPI_STATUS[activeKpi];
  if (filters.cwNo) params.search = [params.search, filters.cwNo].filter(Boolean).join(' ');
  if (filters.cprRef) params.cprRef = filters.cprRef;
  if (filters.customer) params.customer = filters.customer;
  if (filters.company) params.company = filters.company;
  if (filters.preparedBy) params.preparedBy = filters.preparedBy;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  Object.keys(params).forEach((key) => {
    if (params[key] === undefined || params[key] === '') delete params[key];
  });
  return params;
}

export default function useCostWorkouts(options = {}) {
  const { pageSize: initialPageSize = 10, autoLoad = true, initialStatus = '' } = options;

  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [searchInput, setSearchInput] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState(() => (initialStatus ? { status: initialStatus } : {}));
  const [subtab, setSubtab] = useState(0);
  const [activeKpi, setActiveKpi] = useState('all');
  const [loading, setLoading] = useState(autoLoad);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    completed: 0,
    submitted: 0,
    approved: 0,
    rejected: 0,
    archived: 0,
    deleted: 0,
    totalValue: 0
  });
  const [tabCounts, setTabCounts] = useState({ active: 0, archived: 0, deleted: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    let cancelled = false;
    // Abort the in-flight request on unmount / dep change so a stalled socket
    // is released immediately instead of occupying a browser connection slot
    // until the global 30s timeout fires.
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const params = buildParams({
          subtab,
          activeKpi,
          page,
          pageSize,
          search: debouncedSearch,
          sortKey,
          sortDirection: sortDir,
          filters
        });
        const response = await costWorkoutService.listCws(params, { signal: controller.signal });
        if (cancelled) return;
        const parsed = parsePageResponse(response);
        setData(parsed.list.map(normalizeCw));
        setTotalCount(parsed.total);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(normalizeApiError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [page, pageSize, debouncedSearch, sortKey, sortDir, subtab, activeKpi, filters, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    // Abort the in-flight stats request on unmount / dep change.
    const controller = new AbortController();

    const loadStats = async () => {
      try {
        const res = await costWorkoutService.getStats({ signal: controller.signal });
        if (cancelled) return;
        const s = res?.data ?? res ?? {};
        setStats({
          total: s.total ?? 0,
          draft: s.draft ?? 0,
          completed: s.completed ?? 0,
          submitted: s.submitted ?? 0,
          approved: s.approved ?? 0,
          rejected: s.rejected ?? 0,
          archived: s.archived ?? 0,
          deleted: s.deleted ?? 0,
          totalValue: s.totalValue ?? 0
        });
        setTabCounts({
          active: s.active ?? s.total ?? 0,
          archived: s.archived ?? 0,
          deleted: s.deleted ?? 0
        });
      } catch (err) {
        if (!cancelled) setError(normalizeApiError(err));
      }
    };

    loadStats();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [refreshKey]);

  const runMutation = useCallback(async (operation) => {
    setActionLoading(true);
    try {
      const result = await operation();
      setError(null);
      setRefreshKey((key) => key + 1);
      // Sidebar pending-approval count refreshes after approval/status changes.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      return { ok: true, data: result };
    } catch (err) {
      const normalized = normalizeApiError(err);
      setError(normalized);
      return { ok: false, error: normalized };
    } finally {
      setActionLoading(false);
    }
  }, []);

  const archiveCw = useCallback((id) => runMutation(() => costWorkoutService.archiveCw(id)), [runMutation]);
  const restoreCw = useCallback((id) => runMutation(() => costWorkoutService.restoreCw(id)), [runMutation]);
  const deleteCw = useCallback((id) => runMutation(() => costWorkoutService.deleteCw(id)), [runMutation]);
  const permanentDeleteCw = useCallback((id) => runMutation(() => costWorkoutService.permanentDeleteCw(id)), [runMutation]);
  const submitCw = useCallback((id) => runMutation(() => costWorkoutService.submitCw(id)), [runMutation]);
  const approveCw = useCallback((id, remarks) => runMutation(() => costWorkoutService.approveCw(id, remarks)), [runMutation]);
  const rejectCw = useCallback((id, remarks) => runMutation(() => costWorkoutService.rejectCw(id, remarks)), [runMutation]);
  const duplicateCw = useCallback((id) => runMutation(() => costWorkoutService.duplicateCw(id)), [runMutation]);
  const convertCw = useCallback((id) => runMutation(() => costWorkoutService.convertToQuotation(id)), [runMutation]);
  const convertPw = useCallback((id) => runMutation(() => costWorkoutService.convertToProfitWorkout(id)), [runMutation]);

  const bulkArchive = useCallback(
    async (ids) => {
      let ok = true;
      let error = null;
      setActionLoading(true);
      try {
        for (const id of ids) {
          const res = await costWorkoutService.archiveCw(id);
          if (!res) ok = false;
        }
        setRefreshKey((key) => key + 1);
      } catch (err) {
        ok = false;
        error = normalizeApiError(err);
      } finally {
        setActionLoading(false);
      }
      return { ok, error };
    },
    []
  );

  const bulkRestore = useCallback(
    async (ids) => {
      let ok = true;
      let error = null;
      setActionLoading(true);
      try {
        for (const id of ids) {
          const res = await costWorkoutService.restoreCw(id);
          if (!res) ok = false;
        }
        setRefreshKey((key) => key + 1);
      } catch (err) {
        ok = false;
        error = normalizeApiError(err);
      } finally {
        setActionLoading(false);
      }
      return { ok, error };
    },
    []
  );

  const bulkDelete = useCallback(
    async (ids) => {
      let ok = true;
      let error = null;
      setActionLoading(true);
      try {
        for (const id of ids) {
          const res = await costWorkoutService.deleteCw(id);
          if (!res) ok = false;
        }
        setRefreshKey((key) => key + 1);
      } catch (err) {
        ok = false;
        error = normalizeApiError(err);
      } finally {
        setActionLoading(false);
      }
      return { ok, error };
    },
    []
  );

  const bulkPermanentDelete = useCallback(
    async (ids) => {
      let ok = true;
      let error = null;
      setActionLoading(true);
      try {
        for (const id of ids) {
          const res = await costWorkoutService.permanentDeleteCw(id);
          if (!res) ok = false;
        }
        setRefreshKey((key) => key + 1);
      } catch (err) {
        ok = false;
        error = normalizeApiError(err);
      } finally {
        setActionLoading(false);
      }
      return { ok, error };
    },
    []
  );

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const goToPage = useCallback((nextPage) => setPage(Math.max(1, nextPage)), []);

  const changePageSize = useCallback((size) => {
    setPageSizeState(size);
    setPage(1);
  }, []);

  const toggleSort = useCallback((key) => {
    setSortKey(key);
    setSortDir((dir) => (sortKey === key && dir === 'asc' ? 'desc' : 'asc'));
    setPage(1);
  }, [sortKey]);

  const setSearch = useCallback((value) => {
    setSearchInput(value);
    setPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setPage(1);
  }, []);

  const setFilter = useCallback((key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (value === undefined || value === null || value === '') delete next[key];
      return next;
    });
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
    setSearchInput('');
    setActiveKpi('all');
    setPage(1);
  }, []);

  const selectKpi = useCallback((key) => {
    setActiveKpi((prev) => (prev === key ? 'all' : key));
    setPage(1);
  }, []);

  const switchSubtab = useCallback((index) => {
    setSubtab(index);
    setFilters({});
    setSearchInput('');
    setActiveKpi('all');
    setPage(1);
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    data,
    totalCount,
    loading,
    actionLoading,
    error,
    stats,
    tabCounts,
    pagination: { page, pageSize, totalCount, totalPages },
    searchInput,
    sortKey,
    sortDir,
    filters,
    activeKpi,
    subtab,
    setSearch,
    clearSearch,
    setFilter,
    resetFilters,
    selectKpi,
    switchSubtab,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    archiveCw,
    restoreCw,
    deleteCw,
    permanentDeleteCw,
    submitCw,
    approveCw,
    rejectCw,
    duplicateCw,
    convertCw,
    convertPw,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  };
}
