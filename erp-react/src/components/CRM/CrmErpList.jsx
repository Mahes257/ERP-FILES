import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  X, ChevronLeft, ChevronRight,
  Archive, RotateCcw, Trash2, RefreshCw, Filter, Users, ExternalLink, Contact2
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { openInNewTab } from '../../utils/navigationHelpers';
import SalesBreadcrumb from '../SalesTable/SalesBreadcrumb';
import useLeads from '../../hooks/useLeads';
import useDebounce from '../../hooks/useDebounce';
import useClickOutside from '../../hooks/useClickOutside';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import leadService from '../../services/leadService';
import customerService from '../../services/customerService';
import ExportDropdown from '../Export';
import { ColumnResizer, ManageColumnsButton, useColumnResize } from '../GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { isProtectedColumn } from '../../utils/gridColumns';
import ImportButton from '../Common/ImportButton';
import { ConfirmDialog, useToast, ActionMenu, NewCreationMenu, RecordOpenPopover, SortIcon } from '../Common';
import SalesKpiCards from '../SalesTable/SalesKpiCards';
import { LeadViewModal } from '../LeadDetail';
import CrmRecordHistoryDropdown from './CrmRecordHistoryDropdown';
import { isRowPendingApproval, statusCellBgClass } from '../../utils/pendingApproval';
import { shareLead, sendEmail } from '../../utils/leadActions';
import cellKind from '../../utils/cellKind';
import '../../pages/crm/crm-erp.css';

const CONFIRM_CONFIG = {
  archive: { title: 'Archive Record', icon: Archive, variant: 'warning', confirmLabel: 'Archive' },
  restore: { title: 'Restore Record', icon: RotateCcw, variant: 'default', confirmLabel: 'Restore' },
  delete: { title: 'Move to Trash', icon: Trash2, variant: 'warning', confirmLabel: 'Move to Trash' },
  permanentDelete: { title: 'Delete Permanently', icon: Trash2, variant: 'danger', confirmLabel: 'Delete Permanently' },
  toggleStatus: { title: 'Change Client Status', icon: RefreshCw, variant: 'warning', confirmLabel: 'Confirm' },
  bulkArchive: { title: 'Archive Selected', icon: Archive, variant: 'warning', confirmLabel: 'Archive' },
  bulkRestore: { title: 'Restore Selected', icon: RotateCcw, variant: 'default', confirmLabel: 'Restore' },
  bulkDelete: { title: 'Move Selected to Trash', icon: Trash2, variant: 'warning', confirmLabel: 'Move to Trash' },
  bulkPermanentDelete: { title: 'Delete Selected Permanently', icon: Trash2, variant: 'danger', confirmLabel: 'Delete Permanently' }
};

const SUCCESS_MESSAGES = {
  archive: 'Record archived successfully',
  restore: 'Record restored successfully',
  delete: 'Record moved to trash',
  permanentDelete: 'Record permanently deleted',
  toggleStatus: 'Client status updated successfully',
  bulkArchive: (count) => `${count} record(s) archived`,
  bulkRestore: (count) => `${count} record(s) restored`,
  bulkDelete: (count) => `${count} record(s) moved to trash`,
  bulkPermanentDelete: (count) => `${count} record(s) permanently deleted`
};

const SUBTABS = [
  { value: 'Active', label: 'Active', status: '' },
  { value: 'Archived', label: 'Archived', status: 'Archived' },
  { value: 'Deleted', label: 'Deleted', status: 'Deleted' }
];

/* Fixed width of the leading selection-checkbox column. The Lead No column
 * pins right AFTER it — useStickyColumnLeft measures the real rendered
 * checkbox width every layout, and the CSS fallback offset in crm-erp.css
 * (.crm-sticky-leadno-head / .crm-sticky-leadno → left: 50px) must match
 * this constant so there is never a jump before/after measurement. */
const SELECT_ALL_WIDTH = 50;

/* Fallback width (px) for a column that declares no explicit `width` while
 * OTHER columns of the same table do. Only used to complete the colgroup of a
 * table that opted into explicit column widths — tables where no column
 * declares a width keep the original equal-width layout untouched. */
const FALLBACK_COLUMN_WIDTH = 160;

/* Table min-width (px) used by tables that do NOT declare column widths —
 * the pre-existing CRM list floor (equal-width columns inside it). */
const DEFAULT_TABLE_MIN_WIDTH = 1600;

/* Breadcrumb item mapping per CRM endpoint */
const CRM_BREADCRUMB_MAP = {
  leads: { label: 'CRM', to: '/crm' },
  customers: { label: 'CRM', to: '/crm' },
  followups: { label: 'CRM', to: '/crm' },
  contacts: { label: 'CRM', to: '/crm' }
};

/* Page-title mapping for CRM endpoints */
const CRM_PAGE_SUBTITLE = {
  leads: 'leads',
  customers: 'clients',
  followups: 'follow-ups',
  contacts: 'contacts'
};

export default function CrmErpList({
  title,
  titleIcon: TitleIcon = null,
  breadcrumb = ['Dashboard', 'Sales', 'Module'],
  endpoint,
  noun = 'record',
  filename,
  columns = [],
  // Column keys retired from this grid (e.g. a column removed from the page's
  // defaults after users had already saved a column configuration). They are
  // dropped from the rendered grid, from Manage Columns AND from the persisted
  // grid config, so the retired column can never be re-enabled.
  excludeColumns = [],
  renderers = {},
  kpis = [],
  filters = [],
  addButton = null,
  importButton = null,
  bulkModuleKey = null,
  extraHeaderActions = null,
  searchPlaceholder = 'Search...',
  rowActions = null,
  onRowAction: extraRowAction,
  emptyMessage = 'No records found matching your criteria.',
  errorMessage = 'Failed to load records. Please try again.',
  modalSlot = null,
  embedded = false,
  viewRoute = null,
  // Width (px) of the leading selection-checkbox column. Pages that need a
  // wider/tighter selection column can override it; the default keeps the
  // existing CRM lists pixel-identical.
  selectColumnWidth = SELECT_ALL_WIDTH,
  // Wide-ERP-grid modifier: adds the `crm-erp-spacious` class to the table so
  // the page gets the generous cell padding / row rhythm defined in
  // crm-erp.css ("SPACIOUS DATA GRID"). Never applied unless a page asks for
  // it, so Clients / Follow-ups keep their current compact layout.
  spacious = false
}) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  // CRM record version-history module key (record_revisions snapshot system):
  // the list endpoints are 'leads' / 'customers' / 'followups'.
  const revisionModuleKey = {
    leads: 'lead',
    customers: 'customer',
    followups: 'followUp'
  }[endpoint] || endpoint;

  const {
    leads: rows,
    loading,
    error,
    pagination,
    setSearch,
    setFilter,
    resetFilters,
    filters: apiFilters,
    toggleSort,
    sortKey,
    sortDirection,
    goToPage,
    changePageSize,
    refresh,
    refreshCount,
    archiveLead,
    restoreLead,
    deleteLead,
    permanentDeleteLead,
    duplicateLead,
    assignOwner,
    changeStage,
    changePriority,
    importLeads,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  } = useLeads({ pageSize: 10, endpoint });

  const [activeSubtab, setActiveSubtab] = useState('Active');
  // Lifecycle views. The leads grid gets an extra "Closed" view between
  // Archived and Deleted: closed leads are excluded from the Active list and
  // its counts, but stay findable here (status Inactive = the persisted closed
  // state). Clients / follow-ups / contacts keep their existing three views.
  const subtabs = useMemo(
    () => (endpoint === 'leads'
      ? [
          SUBTABS[0],
          SUBTABS[1],
          { value: 'Closed', label: 'Closed', status: 'Inactive' },
          SUBTABS[2]
        ]
      : SUBTABS),
    [endpoint]
  );
  const [subtabCounts, setSubtabCounts] = useState({ Active: 0, Archived: 0, Closed: 0, Deleted: 0 });
  const [statusCounts, setStatusCounts] = useState({});
  // The true unfiltered total count — persisted so the "Total" KPI always
  // shows the real total even when a KPI-specific filter narrows the list.
  const [totalRecordCount, setTotalRecordCount] = useState(0);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeKpi, setActiveKpi] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [viewRow, setViewRow] = useState(null);
  const [clientFilterValues, setClientFilterValues] = useState({});
  const filterRef = useRef(null);
  // Record open popover — appears when the user clicks a record number.
  const [recordPopover, setRecordPopover] = useState(null);

  // Only values these endpoints actually accept belong here (see the count
  // effect below). Hoisted above the URL/filter effects because they validate
  // incoming `status` / `stage` params against it.
  const STATUS_OPTIONS = {
    leads: [
      { label: 'New', param: 'stage', value: 'New' },
      { label: 'Qualified', param: 'stage', value: 'Qualified' },
      { label: 'Proposal Sent', param: 'stage', value: 'Proposal Sent' },
      { label: 'Won', param: 'stage', value: 'Won' },
      { label: 'Lost', param: 'stage', value: 'Lost' }
    ],
    customers: [
      { label: 'Active', param: 'status', value: 'Active' },
      { label: 'Inactive', param: 'status', value: 'Inactive' }
    ],
    followups: [
      { label: 'Open', param: 'status', value: 'Open' },
      { label: 'Completed', param: 'status', value: 'Completed' }
    ]
  }[endpoint] || [];

  // Whether a value may be sent to the current endpoint as its `stage` / `status`
  // filter. The leads API only accepts its pipeline stages in `stage` (New /
  // Qualified / Proposal Sent / Won / Lost); any other label makes it answer
  // HTTP 400 — which is what the informational "Today's Follow-ups" / "Overdue
  // Follow-ups" KPI cards did when their label was mapped to a stage.
  const isAcceptedFilterValue = (value) =>
    endpoint !== 'leads' || STATUS_OPTIONS.some((opt) => opt.param === 'stage' && opt.label === value);

  // ===== URL PARAMETER SYNCHRONIZATION =====
  // Parse URL query params to initialize KPI selection and filters.
  // The URL is the source of truth for KPI clicks (e.g. /leads?status=New).
  const urlStatus = searchParams.get('status') || '';
  const urlStage = searchParams.get('stage') || '';
  const urlSource = searchParams.get('source') || '';
  const urlPriority = searchParams.get('priority') || '';
  const urlOwner = searchParams.get('owner') || '';

  // Initialize activeKpi from URL on mount
  const urlStatusRef = useRef(urlStatus);
  // The `status` URL/KPI param means a pipeline STAGE for leads, but the record
  // STATUS for clients / follow-ups — map it to the column the endpoint owns.
  const statusParamKey = endpoint === 'leads' ? 'stage' : 'status';
  useEffect(() => {
    if (urlStatus && isAcceptedFilterValue(urlStatus)) {
      setActiveKpi(urlStatus.toLowerCase());
      // Set the API filter to match the URL status
      setFilter(statusParamKey, urlStatus);
    } else if (urlStage && isAcceptedFilterValue(urlStage)) {
      setActiveKpi(urlStage.toLowerCase());
      setFilter('stage', urlStage);
    } else {
      // No URL param — clear filter
      setActiveKpi('');
      setFilter('stage', '');
    }
    // Also set any other URL params as client filters
    if (urlSource) setClientFilterValues((prev) => ({ ...prev, source: urlSource }));
    if (urlPriority) setClientFilterValues((prev) => ({ ...prev, priority: urlPriority }));
    if (urlOwner) setClientFilterValues((prev) => ({ ...prev, owner: urlOwner }));
    urlStatusRef.current = urlStatus;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Sync activeKpi when URL changes (e.g. browser back/forward)
  useEffect(() => {
    if (urlStatus !== urlStatusRef.current) {
      urlStatusRef.current = urlStatus;
      if (urlStatus && isAcceptedFilterValue(urlStatus)) {
        setActiveKpi(urlStatus.toLowerCase());
        setFilter(statusParamKey, urlStatus);
      } else {
        setActiveKpi('');
        setFilter(statusParamKey, '');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlStatus, setFilter, statusParamKey]);

  // Track the unfiltered total record count. When no KPI filter is active and
  // no special status filter is set, the pagination.totalCount IS the real total.
  useEffect(() => {
    if (!activeKpi && !apiFilters?.stage && !apiFilters?.status) {
      setTotalRecordCount(pagination.totalCount);
    }
  }, [pagination.totalCount, activeKpi, apiFilters?.stage, apiFilters?.status]);

  // Column management (Manage Columns popup, reorder, show/hide, rename, Reset
  // to Default, drag-to-resize, persistence) comes from the SAME shared toolkit
  // the CPR list uses (components/GridColumns + hooks/useManagedGrid), so every
  // CRM list behaves and looks exactly like CPR instead of keeping its own
  // checkbox-only dropdown. The configuration is stored per grid through the
  // shared grid-config store (MySQL, restored on every open). `columns` stays
  // the page's own default column set — a submodule's columns are never changed
  // by this, only how the user manages them.
  const grid = useManagedGrid({
    gridKey: `crm.list.${endpoint}`,
    defaults: columns,
    allowCustom: false,
    excludeKeys: excludeColumns,
    protectedKeys: ['checkbox', 'actions']
  });
  // Drag-to-resize writes into the FULL column list, so a hidden column keeps
  // both its hidden flag and its width when another column is resized.
  const resize = useColumnResize({ columns: grid.columns, onChange: grid.setColumns });

  // Sticky first-column (doc ID / Lead No) and last-column (Actions) — same
  // pattern as SalesListPage using useStickyColumnLeft. The pinned column is the
  // page's record-number column (its first default column), so reordering the
  // other columns never moves the pinned one. `@width` re-measures the offset
  // after a resize so the pinned cells stay aligned.
  const headerRowRef = useRef(null);
  const firstColKey = columns[0]?.key;
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey: firstColKey,
    visibleKeys: grid.visibleColumns.map((c) => `${c.key}@${c.width}`)
  });
  const isStickyFirst = (col) => firstColKey && col.key === firstColKey;
  const isStickyActions = (col) => col.key === 'actions';


  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(debouncedSearch), 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  useClickOutside(filterRef, () => setShowFilters(false), showFilters);

  // Live subtab counts straight from the API (status-filtered totals).
  // Runs once on mount and after every explicit refresh (mutations), NOT on
  // every list load: depending on pagination.totalCount here would re-fire 3
  // extra API calls whenever the page/sort/filter changes the list total.
  useEffect(() => {
    let cancelled = false;
    // Abort the in-flight count requests on unmount / re-run so a slow count
    // never occupies a browser connection slot or updates stale state.
    const controller = new AbortController();
    (async () => {
      try {
        const results = await Promise.all(
          subtabs.map((tab) =>
            leadService
              .listCrm(endpoint, { page: 0, size: 1, ...(tab.status ? { status: tab.status } : {}) }, { signal: controller.signal })
              .then((res) => {
                if (Array.isArray(res)) return res.length;
                if (res?.content) return res.totalElements ?? res.content.length;
                if (res?.data?.content) return res.data.totalElements ?? res.data.content.length;
                if (Array.isArray(res?.data)) return res.data.length;
                if (res?.data?.total != null) return res.data.total;
                if (res?.totalElements != null) return res.totalElements;
                if (res?.total != null) return res.total;
                return 0;
              })
              .catch(() => 0)
          )
        );
        if (cancelled) return;
        const counts = {};
        subtabs.forEach((tab, index) => {
          counts[tab.value] = results[index];
        });
        setSubtabCounts(counts);
      } catch { /* counts are best-effort */ }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
    // `subtabs` only changes with the endpoint, so the counts are still fetched
    // once per module (not on every list load).
  }, [endpoint, refreshCount, subtabs]);

  // Per-status record counts for tab badges (RFQ reference pattern).
  // Fetches count for each status option via the same API used by the list.
  // For leads, the pipeline stage (New/Qualified/etc.) lives in the `stage`
  // column, while `status` is the record lifecycle (Active/Archived/Deleted).
  // The count-fetch must use the correct backend query parameter (`stage` vs
  // `status`) so the backend doesn't reject or misinterpret the value.
  // Only values these endpoints actually accept belong here. "Pending Approval"
  // used to be probed as a lead/customer/follow-up *status*, but it is not one:
  // a lead's status is the record lifecycle (Active/Archived/Deleted) and its
  // pipeline position lives in `stage`. The leads endpoint rejected the value
  // with HTTP 400 "Invalid status: Pending Approval" on every CRM page load, and
  // none of the three KPI builders read the resulting count.
  useEffect(() => {
    if (STATUS_OPTIONS.length === 0) return;
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const results = await Promise.all(
          STATUS_OPTIONS.map((opt) =>
            leadService
              .listCrm(endpoint, { page: 0, size: 1, [opt.param]: opt.value }, { signal: controller.signal })
              .then((res) => {
                if (Array.isArray(res)) return res.length;
                if (res?.content) return res.totalElements ?? res.content.length;
                if (res?.data?.content) return res.data.totalElements ?? res.data.content.length;
                if (Array.isArray(res?.data)) return res.data.length;
                if (res?.data?.total != null) return res.data.total;
                if (res?.totalElements != null) return res.totalElements;
                if (res?.total != null) return res.total;
                return 0;
              })
          )
        );
        if (cancelled) return;
        const counts = {};
        STATUS_OPTIONS.forEach((opt, i) => {
          counts[opt.label] = results[i];
        });
        setStatusCounts(counts);

        // Also fetch the unfiltered total count (no stage/status filter) so
        // the "Total" KPI always shows the real total, even when a KPI
        // filter is active.
        const totalRes = await leadService
          .listCrm(endpoint, { page: 0, size: 1 }, { signal: controller.signal });
        if (!cancelled) {
          const t = (
            totalRes?.totalElements ?? totalRes?.data?.totalElements ??
            totalRes?.total ?? totalRes?.data?.total ??
            (Array.isArray(totalRes) ? totalRes.length : 0)
          );
          setTotalRecordCount(t);
        }
      } catch { /* best-effort */ }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, refreshCount, STATUS_OPTIONS.length]);

  const handleSubtabChange = (tab) => {
    setActiveSubtab(tab.value);
    setSelectedIds([]);
    setFilter('status', tab.status);
  };

  // Client-side filters (ERP fields with no backend param are applied to the
  // rows returned by the API for the current page — real data, no mock).
  const clientFilterable = filters.filter((f) => f.mode === 'client');
  const filteredRows = useMemo(() => {
    const activeClientFilters = clientFilterable.filter((f) => clientFilterValues[f.key] && clientFilterValues[f.key] !== '');
    if (activeClientFilters.length === 0) return rows;
    return rows.filter((row) =>
      activeClientFilters.every((f) => {
        const value = clientFilterValues[f.key];
        if (typeof f.match === 'function') return f.match(row, value);
        const dataKey = f.dataKey || f.key;
        return String(row[dataKey] ?? '') === String(value);
      })
    );
  }, [rows, clientFilterValues, clientFilterable]);

  const displayCount = clientFilterable.some((f) => clientFilterValues[f.key] && clientFilterValues[f.key] !== '')
    ? filteredRows.length
    : pagination.totalCount;

  const { page, pageSize } = pagination;
  const start = displayCount === 0 ? 0 : Math.min((page - 1) * pageSize + 1, displayCount);
  const end = Math.min(page * pageSize, displayCount);

  const selectedOnPage = useMemo(
    () => filteredRows.filter((row) => selectedIds.includes(row.id)),
    [filteredRows, selectedIds]
  );

  const bulkActions = useMemo(() => {
    if (selectedIds.length === 0) return [];
    // Deleted tab: only Restore + Permanent Delete (trash-parity with sales modules).
    if (activeSubtab === 'Deleted') {
      return [
        { key: 'bulkRestore', label: 'Restore', icon: RotateCcw, variant: 'default' },
        { key: 'bulkPermanentDelete', label: 'Delete Permanently', icon: Trash2, variant: 'danger' }
      ];
    }
    const anyArchived = selectedOnPage.some((row) => row.status === 'Archived');
    const anyActive = selectedOnPage.some((row) => row.status !== 'Archived');
    const actions = [];
    if (anyActive) actions.push({ key: 'bulkArchive', label: 'Archive', icon: Archive, variant: 'default' });
    if (anyArchived) actions.push({ key: 'bulkRestore', label: 'Restore', icon: RotateCcw, variant: 'default' });
    actions.push({ key: 'bulkDelete', label: 'Delete', icon: Trash2, variant: 'danger' });
    return actions;
  }, [selectedIds, selectedOnPage, activeSubtab]);

  const handleDuplicate = useCallback(
    async (row) => {
      const result = await duplicateLead(row.id);
      if (result.ok) toast.success(`${row.name} duplicated`);
      else toast.error(result.error?.message || 'Duplicate failed');
    },
    [duplicateLead, toast]
  );

  const handleShare = useCallback(
    async (row) => {
      const result = await shareLead(row);
      if (result.ok && result.action === 'copy') toast.success('Share link copied to clipboard');
      else if (!result.ok) toast.error('Unable to share this record');
    },
    [toast]
  );

  const handleRowAction = useCallback(
    (actionKey, row) => {
      switch (actionKey) {
        case 'view':
        case 'viewDetails':
        case 'viewClient':
          // Navigate to the full View page instead of opening the inline modal.
          if (viewRoute) navigate(viewRoute(row));
          else setViewRow(row);
          break;
        case 'openInNewTab': {
          // Open the record detail in a new browser tab.
          let route = `/leads/${row.id}`;
          if (endpoint === 'customers') route = `/clients/${row.id}`;
          else if (endpoint === 'followups') route = `/followups/${row.id}`;
          else if (endpoint === 'contacts') route = `/contacts/${row.id}`;
          openInNewTab(route);
          break;
        }
        case 'edit':
          // Endpoint-aware edit route: clients edit via /clients/:id/edit,
          // follow-ups via /followups/:id/edit and contacts via
          // /contacts/:id/edit; only leads use /leads/:id/edit.
          if (endpoint === 'customers') navigate(`/clients/${row.id}/edit`);
          else if (endpoint === 'followups') navigate(`/followups/${row.id}/edit`);
          else if (endpoint === 'contacts') navigate(`/contacts/${row.id}/edit`);
          else navigate(`/leads/${row.id}/edit`);
          break;
        case 'duplicate':
          handleDuplicate(row);
          break;
        case 'share':
          handleShare(row);
          break;
        case 'sendEmail':
          sendEmail(row);
          break;
        case 'archive':
          setConfirmState({ type: 'archive', ids: [row.id], label: row.name });
          break;
        case 'restore':
          setConfirmState({ type: 'restore', ids: [row.id], label: row.name });
          break;
        case 'delete':
          setConfirmState({ type: 'delete', ids: [row.id], label: row.name });
          break;
        case 'permanentDelete':
          setConfirmState({ type: 'permanentDelete', ids: [row.id], label: row.name });
          break;
        case 'toggleStatus':
          // Client menu STATUS action (Mark as Inactive / Mark as Active). Only
          // supported for the customers endpoint; confirmed like other actions.
          if (endpoint === 'customers') {
            const next = row.status === 'Inactive' ? 'Active' : 'Inactive';
            setConfirmState({
              type: 'toggleStatus',
              ids: [row.id],
              label: row.businessName || row.name || 'Client',
              nextStatus: next
            });
          }
          break;
        default:
          // `refresh` is passed so page-level custom actions (e.g. Follow-ups
          // Mark Completed / Reschedule) can reload the list after mutating.
          extraRowAction?.(actionKey, row, refresh);
          break;
      }
    },
    [navigate, extraRowAction, handleDuplicate, handleShare, endpoint, refresh]
  );

  const handleBulkAction = (actionKey) => {
    setConfirmState({ type: actionKey, ids: selectedIds });
  };

  const buildConfirmMessage = (state) => {
    const count = state.ids.length;
    const label = count === 1 && state.label ? `"${state.label}"` : `${count} selected ${noun}(s)`;
    switch (state.type) {
      case 'archive':
        return `Archive ${label}? Archived records can be restored anytime.`;
      case 'restore':
        return `Restore ${label} to active records?`;
      case 'delete':
        return `Move ${label} to trash? It can be restored from the Deleted tab.`;
      case 'permanentDelete':
        return `Permanently delete ${label}? This action cannot be undone.`;
      case 'toggleStatus':
        return `Mark ${label} as ${state.nextStatus}? This updates the client's status across the CRM.`;
      case 'bulkArchive':
        return `Archive ${count} selected ${noun}(s)? Archived records can be restored anytime.`;
      case 'bulkRestore':
        return `Restore ${count} selected ${noun}(s) to active records?`;
      case 'bulkDelete':
        return `Move ${count} selected ${noun}(s) to trash? They can be restored from the Deleted tab.`;
      case 'bulkPermanentDelete':
        return `Permanently delete ${count} selected ${noun}(s)? This action cannot be undone.`;
      default:
        return '';
    }
  };

  const executeConfirm = async () => {
    if (!confirmState) return;
    const { type, ids } = confirmState;
    setConfirmState((prev) => ({ ...prev, loading: true }));
    let result;
    switch (type) {
      case 'archive':
        result = await archiveLead(ids[0]);
        break;
      case 'restore':
        result = await restoreLead(ids[0]);
        break;
      case 'delete':
        result = await deleteLead(ids[0]);
        break;
      case 'permanentDelete':
        result = await permanentDeleteLead(ids[0]);
        break;
      case 'toggleStatus':
        result = await customerService.setStatus(ids[0], confirmState.nextStatus);
        break;
      case 'bulkArchive':
        result = await bulkArchive(ids);
        break;
      case 'bulkRestore':
        result = await bulkRestore(ids);
        break;
      case 'bulkDelete':
        result = await bulkDelete(ids);
        break;
      case 'bulkPermanentDelete':
        result = await bulkPermanentDelete(ids);
        break;
      default:
        result = { ok: false, error: { message: 'Unknown operation' } };
    }

    if (result.ok) {
      const message = typeof SUCCESS_MESSAGES[type] === 'function' ? SUCCESS_MESSAGES[type](ids.length) : SUCCESS_MESSAGES[type];
      toast.success(message);
      setSelectedIds([]);
      setConfirmState(null);
      // Status toggles update the underlying row — refresh so the badge and the
      // menu's Mark as Inactive/Active label stay in sync with the saved state.
      if (type === 'toggleStatus') refresh();
    } else {
      toast.error(result.error?.message || 'Operation failed');
      setConfirmState((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleKpiClick = (kpi) => {
    // Toggle active KPI (click same KPI to deselect)
    const newActiveKpi = activeKpi === kpi.key ? '' : kpi.key;
    setActiveKpi(newActiveKpi);

    // Each page's KPI card owns its own filter semantics — leads filter by
    // pipeline stage, follow-ups by status / date bucket, clients by status.
    // Only the leads endpoint stores its pipeline position in `stage`, so ONLY
    // leads may use the stage-based path below. For every other endpoint the
    // card's own onClick is the source of truth. Previously the shared stage
    // logic ran for ALL endpoints, so a follow-ups "Open" card queried
    // /followups?stage=Open (a lead-stage column) and always returned an empty
    // list, while client cards silently filtered nothing.
    if (endpoint !== 'leads') {
      if (newActiveKpi && typeof kpi.onClick === 'function') {
        kpi.onClick();
      } else {
        // Deselect (or a purely informational card) → clear every filter the
        // cards apply so the list returns to its unfiltered state.
        resetAllFilters();
      }
      return;
    }

    // Leads: pipeline-stage KPI filtering (unchanged behaviour).
    // Update URL search params to reflect the KPI filter.
    // This ensures the filter persists across page reloads and browser
    // back/forward navigation.
    const newParams = new URLSearchParams(searchParams);
    // Only cards that stand for a real pipeline stage filter the list. The page
    // also renders informational cards ("Today's / Overdue Follow-ups" here,
    // and "Total Leads") whose labels are not lead stages — sending those as
    // `stage` made /leads answer HTTP 400. Those cards keep their own onClick.
    const isStageKpi = Boolean(newActiveKpi) && isAcceptedFilterValue(kpi.label);
    if (isStageKpi) {
      newParams.set('status', kpi.label);
      setFilter('stage', kpi.label);
    } else {
      // Deselected, or a card that is not a stage filter — clear the filter.
      newParams.delete('status');
      setFilter('stage', '');
      if (newActiveKpi && typeof kpi.onClick === 'function') kpi.onClick();
    }
    // Use replace to avoid polluting browser history for every KPI click
    setSearchParams(newParams, { replace: true });
    // NOTE: We do NOT navigate to kpi.newTabUrl here — the URL param update
    // above is sufficient. Navigating would cause a full component remount,
    // losing all in-memory state (filters, selection, scroll position).
  };


  const handleImport = async (formData) => {
    const result = await importLeads(formData);
    if (result.ok) toast.success('Import completed successfully');
    else toast.error(result.error?.message || 'Import failed');
  };

  const setClientFilter = useCallback((key, value) => {
    setClientFilterValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const kpiCards = typeof kpis === 'function'
    ? kpis({ rows, totalCount: totalRecordCount || displayCount, statusCounts, setFilter, setClientFilter })
    : kpis;

  // The table renders the SHARED managed configuration (order + visibility),
  // not merely a panel that lists it, so reordering/hiding really moves and
  // removes the columns.
  const visibleColumns = grid.visibleColumns;

  // --- Column sizing -----------------------------------------------------
  // A page may declare an explicit pixel `width` per column (the Leads list
  // does). When it does, the widths are rendered as a <colgroup> and the
  // table's min-width becomes their SUM, so every column keeps the exact
  // width the page configured and the table scrolls horizontally inside
  // .pr-table-wrap instead of being squeezed into the viewport. The sum is
  // recomputed from the VISIBLE columns, so hiding a column via the Columns
  // dropdown narrows the grid (and the pinned Lead No offset re-measures)
  // without breaking the scroll. Tables whose columns declare no width keep
  // the previous behaviour exactly: no colgroup, min-width 1600, the browser
  // distributing that floor equally.
  const selectColWidth = Number(selectColumnWidth) > 0 ? Number(selectColumnWidth) : SELECT_ALL_WIDTH;
  // Widths come from the shared resize controller (live value while dragging,
  // committed width afterwards). A table that declares no widths keeps its
  // existing equal-width layout until a column is actually dragged.
  const colWidthOf = (col) => {
    const width = resize.widthOf(col);
    return width != null ? width : FALLBACK_COLUMN_WIDTH;
  };
  // A table opts into explicit widths when its defaults declare one (the Leads
  // grid) or once ANY column has been resized through Manage Columns.
  const usesColumnWidths = grid.columns.some((col) => Number(col.width) > 0);
  const tableMinWidth = usesColumnWidths
    ? selectColWidth + visibleColumns.reduce((sum, col) => sum + colWidthOf(col), 0)
    : DEFAULT_TABLE_MIN_WIDTH;
  const allPageSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id));

  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredRows.some((row) => row.id === id)));
    } else {
      const ids = new Set(selectedIds);
      filteredRows.forEach((row) => ids.add(row.id));
      setSelectedIds([...ids]);
    }
  };

  const resetAllFilters = () => {
    resetFilters();
    setClientFilterValues({});
    setActiveSubtab('Active');
    setActiveKpi('');
    // Clear URL KPI params so stale filters don't persist after reset
    const clean = new URLSearchParams(searchParams);
    clean.delete('status');
    clean.delete('stage');
    clean.delete('source');
    clean.delete('priority');
    clean.delete('owner');
    setSearchParams(clean, { replace: true });
  };

  // The New ▾ dropdown lives on every module page — derive the bulk-upload
  // module key from the CRM endpoint unless the page overrides it.
  const resolvedBulkModuleKey =
    bulkModuleKey ||
    ({ leads: 'lead', customers: 'client', followups: 'followup', contacts: 'contact' }[endpoint] || endpoint);

  // CRM module tab definitions — match PR's ModuleTabNav pattern.
  const CRM_TABS = [
    { key: 'leads', label: 'Leads', icon: Users, path: '/leads' },
    { key: 'customers', label: 'Clients', icon: Users, path: '/clients' },
    { key: 'contacts', label: 'Contacts', icon: Contact2, path: '/contacts' },
    { key: 'followups', label: 'Follow-ups', icon: Users, path: '/followups' }
  ];

  const currentCrmTab = CRM_TABS.find((t) => t.key === endpoint) || CRM_TABS[0];

  // Build SalesBreadcrumb items: CRM sub-page items
  const breadcrumbItems = useMemo(() => {
    const crmItem = CRM_BREADCRUMB_MAP[endpoint] || { label: 'CRM', to: '/crm' };
    return [crmItem, { label: title }];
  }, [endpoint, title]);

  const staticHeader = (
    <>
      {/* Breadcrumb (PR design — SalesBreadcrumb component) */}
      <SalesBreadcrumb items={breadcrumbItems} />

      {/* Page header (PR design — exact match to cpr-list.css .pr-page-header) */}
      <div className="pr-page-header">
        <div>
          <h1>
            {TitleIcon && <TitleIcon />}
            {title}
          </h1>
          <p className="po-page-header-subtitle">
            Manage your CRM {CRM_PAGE_SUBTITLE[endpoint] || 'records'}
          </p>
        </div>
        <div className="pr-page-header-actions">
          {extraHeaderActions}
          {importButton &&
            (importButton.onImport ? (
              <ImportButton onImport={handleImport} buttonLabel={importButton.label} />
            ) : (
              <button className="po-btn po-btn-ghost po-btn-sm" onClick={importButton.onClick}>
                {importButton.icon && <importButton.icon />}
                {importButton.label}
              </button>
            ))}
          {addButton && (
            <NewCreationMenu
              moduleKey={resolvedBulkModuleKey}
              createTo={addButton.to}
              buttonLabel="New"
              buttonClassName="erp-btn-primary"
              dedupeService={{ list: (params) => leadService.listCrm(endpoint, params) }}
              openInNewTab
            />
          )}
        </div>
      </div>

      {/* CRM module tabs — match PR's ModuleTabNav */}
      <div className="pr-tabs" style={{ marginBottom: 0 }}>
        {CRM_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={tab.key === endpoint}
            className={`pr-tab ${tab.key === endpoint ? 'active' : ''}`}
            onClick={() => navigate(tab.path)}
          >
            <tab.icon size={13} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Error banner (inside static header) */}
      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{errorMessage} {error?.message ? `(${error.message})` : ''}</p>
          <button type="button" className="cpr-error-retry" onClick={refresh}>Retry</button>
        </div>
      )}
    </>
  );

  // When embedded inside a Hub (e.g. CrmHub), skip the static header —
  // the parent already provides the page header + internal tabs.
  // But still render ALL content: KPI, tabs, toolbar, table, pagination.
  const contentBody = (
    <>
      {/* KPI cards */}
      {kpiCards.length > 0 && (
        <SalesKpiCards cards={kpiCards} activeKpi={activeKpi} onSelect={(key) => {
          const kpi = kpiCards.find((k) => k.key === key);
          if (kpi) handleKpiClick(kpi);
        }} />
      )}

      {/* All Records primary tab */}
      <div className="pr-tabs">
        <button type="button" role="tab" aria-selected="true" className="pr-tab active">
          {title === 'Your Leads' ? 'All Leads'
            : title === 'Your Clients' ? 'All Clients'
            : title === 'Your Contacts' ? 'All Contacts'
            : 'All Follow-ups'}
          <span className="tab-count">{pagination.totalCount}</span>
        </button>
      </div>

      {/* Segmented control — Active / Archived / (Closed) / Deleted */}
      <div className="segmented-control" role="tablist" aria-label="Record status">
        {subtabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeSubtab === tab.value}
            className={`segmented-option${activeSubtab === tab.value ? ' active' : ''}`}
            onClick={() => handleSubtabChange(tab)}
          >
            {tab.label} <span className="tab-count">{subtabCounts[tab.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="pr-toolbar">
        <div className="pr-toolbar-left">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowFilters((prev) => !prev)}
          >
            <Filter size={12} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={refresh}
            title="Refresh"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
        <div className="pr-toolbar-right">
          <input
            type="text"
            className="pr-search-input"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={`Search ${noun}s`}
            autoComplete="off"
          />
          <ExportDropdown leads={filteredRows} columns={visibleColumns} filename={filename} noun={noun} />
          <ManageColumnsButton manager={grid.manager} />
          <span className="toolbar-count">Showing {start}–{end} of {displayCount}</span>
        </div>
      </div>

      {/* Filter panel */}
      <div className={`pr-filter-panel ${showFilters ? 'show' : ''}`} ref={filterRef}>
        <div className="pr-filter-grid">
          {filters.map((filter) => {
            if (filter.type === 'date') {
              return (
                <div className="filter-group" key={filter.key}>
                  <span className="filter-label">{filter.label}</span>
                  <input
                    type="date"
                    value={(filter.mode === 'client' ? clientFilterValues[filter.key] : apiFilters[filter.apiKey || filter.key]) || ''}
                    onChange={(e) => {
                      if (filter.mode === 'client') {
                        setClientFilterValues((prev) => ({ ...prev, [filter.key]: e.target.value }));
                      } else {
                        setFilter(filter.apiKey || filter.key, e.target.value);
                      }
                    }}
                  />
                </div>
              );
            }
            const options =
              typeof filter.options === 'function' ? filter.options(filteredRows) : filter.options;
            return (
              <div className="filter-group" key={filter.key}>
                <span className="filter-label">{filter.label}</span>
                <select
                  value={(filter.mode === 'client' ? clientFilterValues[filter.key] : apiFilters[filter.apiKey || filter.key]) || ''}
                  onChange={(e) => {
                    if (filter.mode === 'client') {
                      setClientFilterValues((prev) => ({ ...prev, [filter.key]: e.target.value }));
                    } else {
                      setFilter(filter.apiKey || filter.key, e.target.value);
                    }
                  }}
                >
                  {(options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            );
          })}
          <div className="filter-actions">
            <button className="po-btn po-btn-ghost po-btn-sm" onClick={resetAllFilters}>
              <X size={13} />
              Reset
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{errorMessage} {error?.message ? `(${error.message})` : ''}</p>
          <button type="button" className="cpr-error-retry" onClick={refresh}>Retry</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
      <div className="bulk-action-bar visible">
        <span className="bulk-count"><strong>{selectedIds.length}</strong> selected</span>
        <div className="bulk-actions">
          {bulkActions.map((action) => (
            <button
              key={action.key}
              className={`btn btn-ghost btn-sm${action.variant === 'danger' ? ' btn-bulk-danger' : ''}`}
              onClick={() => handleBulkAction(action.key)}
            >
              <action.icon size={12} />
              {action.label}
            </button>
          ))}
          <ExportDropdown
            leads={selectedOnPage}
            columns={visibleColumns}
            filename={`${filename}-selected`}
            noun={noun}
            variant="dark"
            buttonLabel="Export"
          />
        </div>
      </div>
      )}

      {/* Table */}
      <div className="pr-table-card">
        <div className="pr-table-wrap">
          <table
            id="crmErpTable"
            /* `sgrid` is the shared sticky data grid (styles/sticky-data-grid.css)
               that pins the checkbox, the record number and Actions for every
               list table in the CRM / CPR / Sales / Marketing modules. */
            className={`pr-table sgrid sgrid-sales${spacious ? ' crm-erp-spacious' : ''}`}
            /* Fixed layout keeps every column at its configured width. The
               pinned cells carry the shared `sgrid-*` classes; their left
               offset is the real rendered checkbox width measured by
               useStickyColumnLeft, so nothing here is hardcoded. */
            style={{
              tableLayout: 'fixed',
              minWidth: tableMinWidth,
              borderCollapse: 'separate',
              borderSpacing: 0
            }}
          >
            {usesColumnWidths && (
              <colgroup>
                <col style={{ width: selectColWidth }} />
                {visibleColumns.map((col) => (
                  <col key={col.key} style={{ width: colWidthOf(col) }} />
                ))}
              </colgroup>
            )}
            <thead>
              <tr ref={headerRowRef}>
                {/* Select-all checkbox column — pinned at left: 0. The shared
                    .pr-table thead rule z-indexes EVERY header cell at 10, so
                    the pinned-header z values live in sticky-data-grid.css and
                    are deliberately ABOVE that base layer (see z-ladder there). */}
                <th
                  className="checkbox-cell sgrid-pin sgrid-first"
                  style={{ width: selectColWidth }}
                >
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all"
                  />
                </th>
                {visibleColumns.map((col) => {
                  const sortField = col.sortField || col.key;
                  const canResize = !isProtectedColumn(col);
                  // Sticky-column classes come from the shared grid
                  // (sticky-data-grid.css): opaque backgrounds + the z-index
                  // ladder live there so scrolled cells can never paint over
                  // the pinned ones. Offsets: checkbox left: 0, record number at
                  // the measured checkbox width, Actions pinned right: 0.
                  const stickyClass = isStickyActions(col)
                    ? ' sgrid-pin-actions'
                    : isStickyFirst(col)
                      ? ' sgrid-pin'
                      : '';
                  return (
                    <th
                      key={col.key}
                      data-sticky-key={col.key}
                      aria-sort={
                        col.sortable
                          ? sortKey === sortField
                            ? sortDirection === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                          : undefined
                      }
                      className={`${col.sortable ? 'sortable' : ''}${stickyClass}${canResize ? ' grid-resizable-th' : ''}`}
                      style={{
                        textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                        ...(isStickyFirst(col) ? { left: stickyLeft } : isStickyActions(col) ? { right: 0 } : {})
                      }}
                      onClick={col.sortable ? () => toggleSort(sortField) : undefined}
                    >
                      {col.label}
                      {col.sortable && <SortIcon active={sortKey === sortField} />}
                      {canResize && <ColumnResizer column={col} resize={resize} />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>Loading…</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1} style={{ textAlign: 'center', padding: '40px 20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1F1A' }}>{emptyMessage}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className={`${selectedIds.includes(row.id) ? 'is-selected' : ''} group`}>
                    <td className="checkbox-cell sgrid-pin sgrid-first">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                          )
                        }
                        aria-label={`Select ${row.name}`}
                      />
                    </td>
                    {visibleColumns.map((col, index) => {
                      const rowPending = isRowPendingApproval(row.status);
                      if (col.key === 'actions') {
                        const actions = rowActions ? rowActions(row) : [];
                        return (
                          <td key={col.key} className="sgrid-pin-actions" style={{ textAlign: 'center' }}>
                            <ActionMenu
                              items={actions}
                              onAction={(key) => handleRowAction(key, row)}
                              triggerClassName="erp-row-action-btn"
                              menuClassName="crm-erp-row-actions-menu"
                            />
                          </td>
                        );
                      }
                      const renderer = renderers[col.key];
                      const value = row[col.key];
                      const isRecordNum = col.key === 'leadNo' || col.key === 'clientCode' || col.key === 'followupNo';
                      const kindClass = cellKind(col.key);
                      const cellTitle = kindClass === 'cell-id' && value != null ? String(value) : undefined;
                      return (
                        <td
                          key={col.key}
                          title={cellTitle}
                          className={`${isStickyFirst(col) ? 'sgrid-pin' : 'group-hover:bg-[#F0FAF7]'} ${kindClass}`}
                          style={{
                            textAlign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left',
                            ...(isStickyFirst(col) ? { left: stickyLeft } : {})
                          }}
                        >
                          {renderer ? renderer(row, value) : (
                            isRecordNum && viewRoute ? (
                              <a
                                href={viewRoute(row)}
                                className="text-[#0B4A3D] font-semibold cursor-pointer hover:underline"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const nounLabel = noun.charAt(0).toUpperCase() + noun.slice(1);
                                  setRecordPopover({
                                    label: String(value || ''),
                                    type: nounLabel,
                                    route: viewRoute(row),
                                    onExisting: () => navigate(viewRoute(row)),
                                    anchorRef: { current: e.currentTarget.parentElement }
                                  });
                                }}
                              >
                                {value != null ? String(value) : '—'}
                              </a>
                            ) : (
                              <span className={isRecordNum ? 'text-[#0B4A3D] font-semibold cursor-pointer hover:underline' : ''}>
                                {value != null ? String(value) : '—'}
                              </span>
                            )
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="vt-pagination">
          <div className="vt-pagination-left">
            <span className="vt-pg-info">
              Showing {start} to {end} of {displayCount} entries
            </span>
            <span className="vt-pg-rows">
              Rows:{' '}
              <select
                className="vt-pg-select"
                value={pageSize}
                onChange={(e) => changePageSize(Number(e.target.value))}
                aria-label="Rows per page"
              >
                {[5, 10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </span>
          </div>
          <div className="vt-pagination-right">
            <div className="page-btns">
              <button type="button" className="vt-pg-first" title="First" disabled={page <= 1} onClick={() => goToPage(1)}>
                <ChevronLeft size={12} aria-hidden="true" />
              </button>
              <button type="button" className="vt-pg-prev" title="Previous" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                <ChevronLeft size={12} aria-hidden="true" />
              </button>
              {Array.from({ length: pagination.totalPages }).slice(0, 5).map((_, i) => (
                <button
                  key={i + 1}
                  type="button"
                  className={`vt-pg-num${page === i + 1 ? ' active' : ''}`}
                  onClick={() => goToPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button type="button" className="vt-pg-next" title="Next" disabled={page >= pagination.totalPages} onClick={() => goToPage(page + 1)}>
                <ChevronRight size={12} aria-hidden="true" />
              </button>
              <button type="button" className="vt-pg-last" title="Last" disabled={page >= pagination.totalPages} onClick={() => goToPage(pagination.totalPages)}>
                <ChevronRight size={12} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (embedded) {
    return (
      <>
        <div className="purchase-page cpr-page">
          {contentBody}
        </div>
        {confirmState && CONFIRM_CONFIG[confirmState.type] && (
          <ConfirmDialog
            open={confirmState !== null}
            title={CONFIRM_CONFIG[confirmState.type].title}
            message={buildConfirmMessage(confirmState)}
            confirmLabel={CONFIRM_CONFIG[confirmState.type].confirmLabel}
            variant={CONFIRM_CONFIG[confirmState.type].variant}
            icon={CONFIRM_CONFIG[confirmState.type].icon}
            loading={confirmState.loading || false}
            onConfirm={executeConfirm}
            onCancel={() => setConfirmState(null)}
          />
        )}
        <LeadViewModal
          key={viewRow?.id ?? 'view-modal-closed'}
          open={viewRow !== null}
          lead={viewRow}
          onClose={() => setViewRow(null)}
        />
        {typeof modalSlot === 'function'
          ? modalSlot({ assignOwner, changeStage, changePriority, toast, refresh })
          : modalSlot}
        {/* ===== RECORD OPEN POPOVER (also rendered when embedded in a Hub) ===== */}
        <RecordOpenPopover
          open={recordPopover !== null}
          recordLabel={recordPopover?.label || ''}
          recordType={recordPopover?.type || 'Record'}
          route={recordPopover?.route || '/'}
          onOpenExisting={recordPopover?.onExisting}
          onClose={() => setRecordPopover(null)}
          anchorRef={recordPopover?.anchorRef}
        />
      </>
    );
  }

  return (
    <div className="purchase-page cpr-page flex-1 flex flex-col bg-app font-sans antialiased text-slate-800 w-full max-w-full min-w-0">
      {/* Static header — non-scrolling, matches PR PurchasePageLayout */}
      <div className="cpr-page-static-header">
        {staticHeader}
      </div>

      {/* Scrollable content — matches PR PurchasePageLayout */}
      <div className="cpr-page-scroll-content">
        {contentBody}
      </div>

      {confirmState && CONFIRM_CONFIG[confirmState.type] && (
        <ConfirmDialog
          open={confirmState !== null}
          title={CONFIRM_CONFIG[confirmState.type].title}
          message={buildConfirmMessage(confirmState)}
          confirmLabel={CONFIRM_CONFIG[confirmState.type].confirmLabel}
          variant={CONFIRM_CONFIG[confirmState.type].variant}
          icon={CONFIRM_CONFIG[confirmState.type].icon}
          loading={confirmState.loading || false}
          onConfirm={executeConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      <LeadViewModal
        key={viewRow?.id ?? 'view-modal-closed'}
        open={viewRow !== null}
        lead={viewRow}
        onClose={() => setViewRow(null)}
      />

      {typeof modalSlot === 'function'
        ? modalSlot({ assignOwner, changeStage, changePriority, toast, refresh })
        : modalSlot}

      {/* ===== RECORD OPEN POPOVER ===== */}
      <RecordOpenPopover
        open={recordPopover !== null}
        recordLabel={recordPopover?.label || ''}
        recordType={recordPopover?.type || 'Record'}
        route={recordPopover?.route || '/'}
        onOpenExisting={recordPopover?.onExisting}
        onClose={() => setRecordPopover(null)}
        anchorRef={recordPopover?.anchorRef}
      />
    </div>
  );
}

/* === END OF COMPONENT === */
