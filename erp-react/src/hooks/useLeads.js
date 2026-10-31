import { useState, useEffect, useCallback } from 'react';
import leadService, { normalizeApiError } from '../services/leadService';
import customerService from '../services/customerService';
import followUpService from '../services/followUpService';
import contactService from '../services/contactService';
import { normalizeLead } from '../utils/leadHelpers';

// CRM list endpoints are backed by different real REST resources:
//   leads      -> /leads        (leadService)     — the Leads module
//   contacts   -> /contacts     (contactService)  — the Contacts module (contacts table)
//   customers  -> /customers    (customerService) — the Clients module (customers table)
//   followups  -> /followups    (followUpService) — the Follow-ups module (real followups table)
function resolveService(endpoint) {
  if (endpoint === 'customers') return customerService;
  if (endpoint === 'followups') return followUpService;
  if (endpoint === 'contacts') return contactService;
  return leadService;
}

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
  if (Array.isArray(response?.results)) {
    return { list: response.results, total: response.total ?? response.results.length };
  }
  if (Array.isArray(response?.list)) {
    return { list: response.list, total: response.total ?? response.list.length };
  }
  return { list: [], total: 0 };
}

function buildParams({ page, pageSize, search, sortKey, sortDirection, filters }) {
  const params = {
    page: Math.max(0, page - 1),
    size: pageSize,
    search: search.trim() || undefined,
    sort: sortKey ? `${sortKey},${sortDirection}` : undefined
  };
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value;
    }
  });
  Object.keys(params).forEach((key) => {
    if (params[key] === undefined) delete params[key];
  });
  return params;
}

export default function useLeads(options = {}) {
  const { pageSize: initialPageSize = 10, autoLoad = true, endpoint = 'leads' } = options;

  // The real service behind this endpoint (customers/followups/leads).
  const svc = resolveService(endpoint);
  // /customers returns the full list (no server pagination) — paginate locally.
  const clientSidePagination = endpoint === 'customers';

  const [leads, setLeads] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [search, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [filters, setFilters] = useState({});
  const [loading, setLoading] = useState(autoLoad);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isFallback, setIsFallback] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Abort the in-flight request on unmount / dep change so a stalled socket
    // is released immediately instead of occupying a browser connection slot
    // until the global 30s timeout fires.
    const controller = new AbortController();

    const load = async () => {
      setLoading(true);
      try {
        const response = await svc.listCrm(
          endpoint,
          buildParams({ page, pageSize, search, sortKey, sortDirection, filters }),
          { signal: controller.signal }
        );
        if (cancelled) return;
        const parsed = parsePageResponse(response);
        // Only the LEADS endpoint gets the lead field projection. Contacts,
        // customers and follow-ups keep their raw response rows: a contact is
        // not a lead, so projecting it through normalizeLead would replace its
        // real fields (contactType, leadId, clientId, status) with lead defaults.
        let list = endpoint === 'leads' ? parsed.list.map(normalizeLead) : parsed.list;
        if (clientSidePagination) {
          const start = (page - 1) * pageSize;
          list = list.slice(start, start + pageSize);
        }
        setLeads(list);
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
  }, [page, pageSize, search, sortKey, sortDirection, filters, refreshKey, endpoint, svc, clientSidePagination]);

  const runMutation = useCallback(async (operation) => {
    setActionLoading(true);
    try {
      const result = await operation();
      setError(null);
      setRefreshKey((key) => key + 1);
      return { ok: true, data: result };
    } catch (err) {
      const normalized = normalizeApiError(err);
      setError(normalized);
      return { ok: false, error: normalized };
    } finally {
      setActionLoading(false);
    }
  }, []);

  // ---- Endpoint-aware mutations ------------------------------------------
  const createLead = useCallback(
    (payload) => runMutation(() => (svc.create ? svc.create(payload) : leadService.createLead(payload))),
    [runMutation, svc]
  );
  const updateLead = useCallback(
    (id, payload) => runMutation(() => (svc.update ? svc.update(id, payload) : leadService.updateLead(id, payload))),
    [runMutation, svc]
  );
  const deleteLead = useCallback(
    (id) =>
      runMutation(() => {
        if (svc.remove) return svc.remove(id);
        if (svc.delete) return svc.delete(id);
        return leadService.deleteLead(id);
      }),
    [runMutation, svc]
  );
  const permanentDeleteLead = useCallback(
    (id) =>
      runMutation(() => {
        if (svc.permanentDelete) return svc.permanentDelete(id);
        return leadService.permanentDeleteLead(id);
      }),
    [runMutation, svc]
  );
  const archiveLead = useCallback(
    (id) => runMutation(() => (svc.archive ? svc.archive(id) : leadService.archiveLead(id))),
    [runMutation, svc]
  );
  const restoreLead = useCallback(
    (id) => runMutation(() => (svc.restore ? svc.restore(id) : leadService.restoreLead(id))),
    [runMutation, svc]
  );
  const markInactive = useCallback((id) => runMutation(() => leadService.markInactive(id)), [runMutation]);
  const markActive = useCallback((id) => runMutation(() => leadService.markActive(id)), [runMutation]);

  // Bulk operations: use the module's bulk endpoint when it exists (leads),
  // otherwise apply the single-record operation directly (customers/follow-ups).
  // The raw service calls are used here (not the wrapped mutations) so the
  // outer runMutation performs exactly one refresh.
  const bulkDelete = useCallback(
    (ids) =>
      runMutation(async () => {
        if (svc.bulkDelete) return svc.bulkDelete(ids);
        if (svc.remove) await Promise.all(ids.map((id) => svc.remove(id)));
        else if (svc.delete) await Promise.all(ids.map((id) => svc.delete(id)));
        else await leadService.bulkDelete(ids);
        return ids;
      }),
    [runMutation, svc]
  );
  const bulkArchive = useCallback(
    (ids) =>
      runMutation(async () => {
        if (svc.bulkArchive) return svc.bulkArchive(ids);
        if (svc.archive) await Promise.all(ids.map((id) => svc.archive(id)));
        else await leadService.bulkArchive(ids);
        return ids;
      }),
    [runMutation, svc]
  );
  const bulkRestore = useCallback(
    (ids) =>
      runMutation(async () => {
        if (svc.bulkRestore) return svc.bulkRestore(ids);
        if (svc.restore) await Promise.all(ids.map((id) => svc.restore(id)));
        else await leadService.bulkRestore(ids);
        return ids;
      }),
    [runMutation, svc]
  );
  const bulkPermanentDelete = useCallback(
    (ids) =>
      runMutation(async () => {
        if (svc.bulkPermanentDelete) return svc.bulkPermanentDelete(ids);
        if (svc.permanentDelete) await Promise.all(ids.map((id) => svc.permanentDelete(id)));
        else await leadService.bulkPermanentDelete(ids);
        return ids;
      }),
    [runMutation, svc]
  );

  const assignOwner = useCallback((id, owner) => runMutation(() => leadService.assignOwner(id, owner)), [runMutation]);
  const changeStage = useCallback((id, stage) => runMutation(() => leadService.changeStage(id, stage)), [runMutation]);
  const changePriority = useCallback((id, priority) => runMutation(() => leadService.changePriority(id, priority)), [runMutation]);
  const duplicateLead = useCallback(
    (id) => runMutation(() => (svc.duplicate ? svc.duplicate(id) : leadService.duplicateLead(id))),
    [runMutation, svc]
  );
  // Import is only supported by the Leads module. Customers, follow-ups and
  // contacts have no import endpoint — never fall back to the leads import
  // (that would silently write leads instead of the module's own records).
  const importLeads = useCallback(
    (formData) => {
      if (endpoint !== 'leads') {
        return Promise.resolve({
          ok: false,
          error: { message: 'Import is not supported for this module' }
        });
      }
      return runMutation(() => leadService.importLeads(formData));
    },
    [runMutation, endpoint]
  );

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
    setPage(1);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setPage(1);
  }, []);

  const refresh = useCallback(() => {
    setIsFallback(false);
    setRefreshKey((key) => key + 1);
  }, []);

  // Bump counter exposed so list pages can react to explicit refreshes
  // (e.g. re-fetch subtab counts after a mutation) without depending on a
  // value that changes on every list load.
  const refreshCount = refreshKey;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    leads,
    loading,
    actionLoading,
    error,
    isFallback,
    pagination: { page, pageSize, totalCount, totalPages },
    search,
    sortKey,
    sortDirection,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    clearSearch,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    refreshCount,
    createLead,
    updateLead,
    deleteLead,
    permanentDeleteLead,
    archiveLead,
    restoreLead,
    markInactive,
    markActive,
    bulkDelete,
    bulkArchive,
    bulkRestore,
    bulkPermanentDelete,
    assignOwner,
    changeStage,
    changePriority,
    duplicateLead,
    importLeads
  };
}
