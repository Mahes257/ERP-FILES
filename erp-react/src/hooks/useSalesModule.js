import { useCallback, useEffect, useMemo, useState } from 'react';
import useDebounce from './useDebounce';
import { normalizeApiError } from '../services/cprService';
import { NORMALIZERS } from '../utils/salesHelpers';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../utils/pendingApproval';

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

/**
 * Generic list hook for the Sales Execution modules.
 * options:
 *  - service: sales service instance (factory-built)
 *  - moduleKey: 'quotation' | 'salesContract' | ...
 *  - statusMap: KPI key -> status value (or '' for all)
 *  - statusValueMap: display status label -> backend status value (for the status filter)
 *  - searchKeys: extra filter keys folded into the search text
 *  - extraParams: filter key -> backend query param name
 */
export default function useSalesModule(options = {}) {
  const {
    service,
    moduleKey,
    statusMap = {},
    statusValueMap = {},
    searchKeys = [],
    extraParams = {},
    pageSize: initialPageSize = 10,
    autoLoad = true
  } = options;

  const normalize = useMemo(() => NORMALIZERS[moduleKey] || ((raw) => raw), [moduleKey]);

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
  const [stats, setStats] = useState({});
  const [tabCounts, setTabCounts] = useState({ active: 0, archived: 0, deleted: 0, all: 0 });
  const [refreshKey, setRefreshKey] = useState(0);

  const debouncedSearch = useDebounce(searchInput, 300);

  // NOTE: searchKeys / extraParams / statusMap / statusValueMap must be
  // STABLE identities (module-level constants). If a caller passes inline
  // literals, buildParams gets a new identity every render and the load
  // effect below re-fires endlessly (infinite loading loop).
  const buildParams = useCallback(() => {
    const params = {
      page: Math.max(0, page - 1),
      size: pageSize,
      sort: sortKey ? `${sortKey},${sortDir}` : undefined
    };
    const searchParts = [debouncedSearch];
    searchKeys.forEach((key) => {
      if (filters[key]) searchParts.push(filters[key]);
    });
    const searchText = searchParts.filter(Boolean).join(' ').trim();
    if (searchText) params.search = searchText;

    if (filters.status) {
      params.status = statusValueMap[filters.status] || filters.status;
    } else if (subtab === 1) {
      params.status = 'archived';
    } else if (subtab === 2) {
      params.status = 'deleted';
    } else if (statusMap[activeKpi]) {
      params.status = statusMap[activeKpi];
    }

    Object.entries(extraParams).forEach(([filterKey, queryParam]) => {
      if (filters[filterKey]) params[queryParam] = filters[filterKey];
    });
    if (filters.dateFrom) params.dateFrom = filters.dateFrom;
    if (filters.dateTo) params.dateTo = filters.dateTo;
    if (filters.minAmount) params.minAmount = filters.minAmount;
    if (filters.maxAmount) params.maxAmount = filters.maxAmount;

    Object.keys(params).forEach((key) => {
      if (params[key] === undefined || params[key] === '') delete params[key];
    });
    return params;
  }, [page, pageSize, debouncedSearch, sortKey, sortDir, subtab, activeKpi, filters, searchKeys, extraParams, statusMap, statusValueMap]);

  useEffect(() => {
    let cancelled = false;
    // Abort the in-flight request on unmount / dep change so a stalled socket
    // is released immediately instead of occupying a browser connection slot
    // until the global 30s timeout fires.
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await service.list(buildParams(), { signal: controller.signal });
        if (cancelled) return;
        const parsed = parsePageResponse(response);
        setData(parsed.list.map(normalize));
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
  }, [buildParams, service, normalize, refreshKey]);

  useEffect(() => {
    let cancelled = false;
    // Abort the in-flight stats request on unmount / dep change.
    const controller = new AbortController();
    const loadStats = async () => {
      try {
        const res = await service.getStats({ signal: controller.signal });
        if (cancelled) return;
        const s = res?.data ?? res ?? {};
        setStats(s);
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
  }, [service, refreshKey]);

  const runMutation = useCallback(
    async (operation) => {
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
    },
    []
  );

  const archive = useCallback((id) => runMutation(() => service.archive(id)), [runMutation, service]);
  const restore = useCallback((id) => runMutation(() => service.restore(id)), [runMutation, service]);
  const remove = useCallback((id) => runMutation(() => service.delete(id)), [runMutation, service]);
  const changeStatus = useCallback((id, status) => runMutation(() => service.changeStatus(id, status)), [runMutation, service]);
  const duplicate = useCallback((id) => runMutation(() => service.duplicate(id)), [runMutation, service]);
  const approve = useCallback((id) => runMutation(() => service.approve(id)), [runMutation, service]);
  const postAction = useCallback((id, action, payload) => runMutation(() => service.postAction(id, action, payload)), [runMutation, service]);
  const bulkArchive = useCallback((ids) => runMutation(() => service.bulkArchive(ids)), [runMutation, service]);
  const bulkRestore = useCallback((ids) => runMutation(() => service.bulkRestore(ids)), [runMutation, service]);
  const bulkDelete = useCallback((ids) => runMutation(() => service.bulkDelete(ids)), [runMutation, service]);
  const bulkPermanentDelete = useCallback((ids) => runMutation(() => service.bulkPermanentDelete(ids)), [runMutation, service]);
  const permanentDelete = useCallback((id) => runMutation(() => service.permanentDelete(id)), [runMutation, service]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);
  const goToPage = useCallback((nextPage) => setPage(Math.max(1, nextPage)), []);
  const changePageSize = useCallback((size) => {
    setPageSizeState(size);
    setPage(1);
  }, []);
  const toggleSort = useCallback(
    (key) => {
      setSortKey(key);
      setSortDir((dir) => (sortKey === key && dir === 'asc' ? 'desc' : 'asc'));
      setPage(1);
    },
    [sortKey]
  );
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

  const exportParams = useCallback(() => buildParams(), [buildParams]);

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
    archive,
    restore,
    remove,
    changeStatus,
    duplicate,
    approve,
    postAction,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete,
    permanentDelete
  };
}
