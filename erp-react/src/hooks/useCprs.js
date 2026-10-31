import { useCallback, useEffect, useState } from 'react';
import useDebounce from './useDebounce';
import cprService, { normalizeApiError } from '../services/cprService';
import { normalizeCpr, subscribeCprListRefresh } from '../utils/cprHelpers';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../utils/pendingApproval';

const KPI_STATUS = {
  all: '',
  draft: 'draft',
  costworkout: 'cost workout',
  pendingapproval: 'pending approval',
  approved: 'approved',
  converted: 'converted',
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
    return { list: response.data, total: response.total ?? response.totalCount ?? response.data.length };
  }
  if (Array.isArray(response?.data?.content)) {
    return { list: response.data.content, total: response.data.totalElements ?? response.data.content.length };
  }
  if (Array.isArray(response?.items)) {
    return { list: response.items, total: response.total ?? response.items.length };
  }
  return { list: [], total: 0 };
}

function buildSearch(filters, search) {
  const parts = [search];
  ['no', 'client', 'lead', 'salesPerson'].forEach((key) => {
    if (filters[key]) parts.push(filters[key]);
  });
  return parts.filter(Boolean).join(' ').trim();
}

function buildStatus({ subtab, activeKpi, filters }) {
  if (filters.status) return filters.status;
  if (filters.stage) return filters.stage;
  if (subtab === 1) return 'archived';
  if (subtab === 2) return 'deleted';
  return KPI_STATUS[activeKpi] || '';
}

function buildParams({ subtab, activeKpi, page, pageSize, search, sortKey, sortDirection, filters }) {
  const params = {
    page: Math.max(0, page - 1),
    size: pageSize,
    sort: sortKey ? `${sortKey},${sortDirection}` : undefined
  };
  const searchText = buildSearch(filters, search);
  if (searchText) params.search = searchText;
  const status = buildStatus({ subtab, activeKpi, filters });
  if (status) params.status = status;
  if (filters.approval) params.approval = filters.approval;
  if (filters.department) params.department = filters.department;
  if (filters.dateFrom) params.dateFrom = filters.dateFrom;
  if (filters.dateTo) params.dateTo = filters.dateTo;
  Object.keys(params).forEach((key) => {
    if (params[key] === undefined || params[key] === '') delete params[key];
  });
  return params;
}

export default function useCprs(options = {}) {
  const { pageSize: initialPageSize = 10, autoLoad = true } = options;

  const [data, setData] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [searchInput, setSearchInput] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [filters, setFilters] = useState({});
  const [subtab, setSubtab] = useState(0);
  const [activeKpi, setActiveKpi] = useState('all');
  const [loading, setLoading] = useState(autoLoad);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    total: 0,
    draft: 0,
    costWorkout: 0,
    pendingApproval: 0,
    approved: 0,
    converted: 0,
    rejected: 0,
    totalAmt: 0
  });
  const [tabCounts, setTabCounts] = useState({ active: 0, archived: 0, deleted: 0, all: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const debouncedSearch = useDebounce(searchInput, 300);

  // Reload after a CPR is created in this tab or in another tab where the
  // creation route was opened while this list stayed mounted. Only successful
  // saves publish this notification, so a failed create never refreshes a
  // phantom row into the list.
  useEffect(
    () => subscribeCprListRefresh(() => setRefreshKey((key) => key + 1)),
    []
  );

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
        const response = await cprService.listCprs(params, { signal: controller.signal });
        if (cancelled) return;
        const parsed = parsePageResponse(response);
        setData(parsed.list.map(normalizeCpr));
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
        const res = await cprService.getStats({ signal: controller.signal });
        if (cancelled) return;
        const s = res?.data ?? res ?? {};
        setStats({
          total: s.total ?? 0,
          draft: s.draft ?? 0,
          costWorkout: s.costWorkout ?? 0,
          pendingApproval: s.pendingApproval ?? 0,
          approved: s.approved ?? 0,
          converted: s.converted ?? 0,
          rejected: s.rejected ?? 0,
          totalAmt: s.totalAmt ?? 0
        });
        setTabCounts({
          active: s.active ?? s.total ?? 0,
          archived: s.archived ?? 0,
          deleted: s.deleted ?? 0,
          all: (s.active ?? s.total ?? 0) + (s.archived ?? 0) + (s.deleted ?? 0)
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

  const archiveCpr = useCallback((id) => runMutation(() => cprService.archiveCpr(id)), [runMutation]);
  const restoreCpr = useCallback((id) => runMutation(() => cprService.restoreCpr(id)), [runMutation]);
  const deleteCpr = useCallback((id) => runMutation(() => cprService.deleteCpr(id)), [runMutation]);
  const submitCpr = useCallback((id) => runMutation(() => cprService.submitCpr(id)), [runMutation]);
  const approveCpr = useCallback((id, remarks) => runMutation(() => cprService.approveCpr(id, remarks)), [runMutation]);
  const rejectCpr = useCallback((id, remarks) => runMutation(() => cprService.rejectCpr(id, remarks)), [runMutation]);
  const sendBackCpr = useCallback((id, remarks) => runMutation(() => cprService.sendBackCpr(id, remarks)), [runMutation]);
  const convertCpr = useCallback((id) => runMutation(() => cprService.convertToQuotation(id)), [runMutation]);
  const convertCprToCustomer = useCallback((id) => runMutation(() => cprService.convertToCustomer(id)), [runMutation]);
  const duplicateCpr = useCallback((id) => runMutation(() => cprService.duplicateCpr(id)), [runMutation]);
  const bulkArchive = useCallback((ids) => runMutation(() => cprService.bulkArchive(ids)), [runMutation]);
  const bulkRestore = useCallback((ids) => runMutation(() => cprService.bulkRestore(ids)), [runMutation]);
  const bulkDelete = useCallback((ids) => runMutation(() => cprService.bulkDelete(ids)), [runMutation]);
  const bulkPermanentDelete = useCallback((ids) => runMutation(() => cprService.bulkPermanentDelete(ids)), [runMutation]);

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

  const exportParams = useCallback(
    () =>
      buildParams({
        subtab,
        activeKpi,
        page,
        pageSize,
        search: debouncedSearch,
        sortKey,
        sortDirection: sortDir,
        filters
      }),
    [subtab, activeKpi, page, pageSize, debouncedSearch, sortKey, sortDir, filters]
  );

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
    exportParams,
    archiveCpr,
    restoreCpr,
    deleteCpr,
    submitCpr,
    approveCpr,
    rejectCpr,
    sendBackCpr,
    convertCpr,
    convertCprToCustomer,
    duplicateCpr,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  };
}
