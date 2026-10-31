/**
 * purchase/pages/rfq/RfqFollowUps.jsx
 * ------------------------------------------------------------------
 * RFQ & Quotations → RFQ Follow-ups.
 *
 * UX pattern  : the CRM Follow Up page — breadcrumb + page header,
 *               compact follow-up KPIs (Today's / Overdue / Due Today /
 *               Upcoming), status tabs with live counts, searchable
 *               toolbar, filter panel, export + column picker, row
 *               action menu, empty states and a New Follow-up modal.
 * Visual      : the Purchase design language (cpr-page scaffold,
 *               pr-kpi-grid cards, pr-tabs, pr-toolbar, pr-filter-panel,
 *               pr-table — the shared Purchase list library).
 * Data        : rfqFollowUpService only — a tracking layer ON TOP of
 *               the existing RFQ store. Follow-ups reference existing
 *               RFQs by number; the RFQ workflow is never modified.
 *
 * The page answers "which RFQs need follow-up today or soon?" — it is
 * an ADDITIONAL follow-up/tracking layer, not a second RFQ list.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Archive, ArrowLeft, BellRing, CalendarClock, CalendarDays,
  CheckCircle2, Clock3, Download, Eye, Filter, PencilLine, Plus, RefreshCw,
  Search, Trash2, X, XCircle
} from 'lucide-react';
import { useToast } from '../../components/ui';
import RfqTabNav from '../../components/RfqTabNav';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import Modal from '../../components/ui/Modal';
import RfqFollowUpDetail from '../../components/RfqFollowUpDetail';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import { FOLLOWUP_COLUMNS, PRIORITIES, RFQ_STATUSES } from '../../constants';
import { formatDate } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import { FOLLOWUP_STATUS, FOLLOWUP_TYPES, rfqFollowUpService } from '../../services/rfqFollowUp';
import { isFollowUpPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseList from '../../hooks/usePurchaseList';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

/** Priority → chip class (same system as the PR / RFQ lists). */
const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

/**
 * KPI cards — the same card component/arrangement as every Purchase
 * list, with follow-up wording. Counts come from getFollowUpStats;
 * nothing is hardcoded.
 */
const KPI_CARDS = [
  { key: 'today', label: "Today's Follow-ups", icon: CalendarClock, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, color: '#DC2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'dueToday', label: 'Due Today', icon: Clock3, color: '#D97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'upcoming', label: 'Upcoming', icon: CalendarDays, color: '#2563EB', bg: 'rgba(37,99,235,0.10)' }
];

/**
 * KPI card → display-bucket mapping used when a card filters the list.
 * "Today's Follow-ups" shares the Due Today bucket (a follow-up due
 * today IS today's follow-up — the same definition as the CRM page),
 * so clicking either card applies the same status filter.
 */
const KPI_BUCKET = {
  today: 'Due Today',
  overdue: 'Overdue',
  dueToday: 'Due Today',
  upcoming: 'Upcoming'
};

/** Filter groups for the panel + status tab keys. */
const FILTER_KEYS = ['status', 'type', 'priority', 'vendor', 'assignedTo', 'rfqStatus', 'dateFrom', 'dateTo'];
const SELECT_FILTER_KEYS = ['status', 'type', 'priority', 'vendor', 'assignedTo', 'rfqStatus'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Columns that can never be hidden through the Columns dropdown. */
const MANDATORY_COLUMNS = ['rfqNo', 'status', 'actions'];
/** localStorage key for column visibility (CRM Follow Up mechanism). */
const COLUMNS_STORAGE_KEY = 'vishak:rfq-followups:columns';

/** Lifecycle segments — the PR Active / Archived / Deleted structure.
 *  Follow-ups use a soft-delete lifecycle (recordState field). Deleted
 *  records appear in the Deleted tab and can be restored. Archived is
 *  reserved for future use. The Active segment is the working list
 *  (the follow-up status filters in the filter panel still apply on
 *  top of it). */
const LIFECYCLE_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'deleted', label: 'Deleted' }
];

/** Maps the active query + filters to the service signature. */
function listParams(search, filters, page, pageSize, sortKey, sortDirection) {
  return {
    search,
    status: filters.status || 'All',
    type: filters.type || 'All',
    priority: filters.priority || 'All',
    vendor: filters.vendor || 'All',
    assignedTo: filters.assignedTo || 'All',
    rfqStatus: filters.rfqStatus || 'All',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    page,
    pageSize,
    sortBy: sortKey,
    sortDir: sortDirection
  };
}

export default function RfqFollowUps() {
  const navigate = useNavigate();
  const toast = useToast();

  /* Lifecycle view — mirrors the PR segmented control (Active is the
     default working list; Archived / Deleted are layout-only empty
     views). Declared before fetchPage because that memo references
     `tab` (a temporal-dead-zone error if declared later in the body). */
  const [tab, setTab] = useState('active');

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      const params = listParams(search, filters, page, pageSize, sortKey, sortDirection);
      params.lifecycle = tab;
      return rfqFollowUpService.getFollowUps(params);
    },
    [tab]
  );

  /* Soonest first — an action queue, so overdue/due-today surface first. */
  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount },
    search, sortKey, sortDirection, filters,
    setSearch, setFilter, resetFilters, goToPage, changePageSize, toggleSort, refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10, sortKey: 'followUpDate', sortDir: 'asc' });

  /* Column visibility — restored from localStorage, mandatory locked. */
  const [columns, setColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY));
      if (Array.isArray(saved)) {
        const map = Object.fromEntries(saved.map((entry) => [entry.key, entry.visible]));
        return FOLLOWUP_COLUMNS.map((col) => ({
          ...col,
          visible: MANDATORY_COLUMNS.includes(col.key) ? true : (map[col.key] ?? col.visible)
        }));
      }
    } catch { /* ignore invalid stored columns */ }
    return FOLLOWUP_COLUMNS.map((col) => ({ ...col }));
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  /* Active KPI card key (null = All Follow-ups). Drives the selected
     card highlight; the list filter itself is applied through the
     status filter so the table refetches automatically. */
  const [kpiFilter, setKpiFilter] = useState(null);

  /* Modal state — detail, reschedule, delete. */
  const [detailRecord, setDetailRecord] = useState(null);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch]);

  /* KPI + tab counts (getFollowUpStats). */
  useEffect(() => {
    let cancelled = false;
    rfqFollowUpService
      .getFollowUpStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion]);

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const persistColumns = (next) => {
    setColumns(next);
    try {
      localStorage.setItem(
        COLUMNS_STORAGE_KEY,
        JSON.stringify(next.map((col) => ({ key: col.key, visible: col.visible !== false })))
      );
    } catch { /* ignore storage failure */ }
  };

  const toggleColumn = (key) => {
    if (MANDATORY_COLUMNS.includes(key)) return;
    persistColumns(columns.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    persistColumns(columns.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    persistColumns(
      columns.map((col) => (MANDATORY_COLUMNS.includes(col.key) ? col : { ...col, visible: false }))
    );

  const refreshPage = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  /* Primary tab — the full follow-up list (clears the KPI + status
     filters). */
  const goAllFollowUps = () => {
    setFilter('status', 'All');
    setKpiFilter(null);
    setTab('active');
    setSelectedIds([]);
  };

  /* Lifecycle segment (Active / Archived / Deleted) — mirrors the PR
     segmented control. Active is the working list; Archived / Deleted
     switch to their layout-only empty views (the table is refetched so
     it returns no rows). Leaving Active also clears the KPI selection,
     exactly like the status filter. */
  const selectLifecycle = (key) => {
    if (key !== 'active') {
      setFilter('status', 'All');
      setKpiFilter(null);
    }
    setTab(key);
    setSelectedIds([]);
    refresh();
  };

  /* KPI card click — filters the list to that card's bucket (no
     navigation). Clicking the active card again clears the filter back
     to All Follow-ups. The filter is applied through the shared status
     filter so the existing data flow refetches the table. */
  const handleKpiSelect = (key) => {
    if (kpiFilter === key) {
      setKpiFilter(null);
      setFilter('status', 'All');
    } else {
      setKpiFilter(key);
      setFilter('status', KPI_BUCKET[key] || 'All');
    }
    setSelectedIds([]);
  };

  const kpiCards = KPI_CARDS.map((card) => ({
    ...card,
    /* "Today's Follow-ups" reads the due-today count — the stats field
       for the due-today bucket (there is no separate `today` field). */
    value: String(stats?.[card.key === 'today' ? 'dueToday' : card.key] ?? 0)
  }));

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const fetchAll = () => {
    const params = listParams(search, filters, 1, 10000, sortKey, sortDirection);
    params.lifecycle = tab;
    return rfqFollowUpService
      .getFollowUps(params)
      .then((result) => result.data);
  };

  const runFollowUpAction = async (operation, successMessage, errorMessage) => {
    const result = await runMutation(operation);
    if (result.ok) toast.success(successMessage);
    else toast.error(result.error?.message || errorMessage);
    return result.ok;
  };

  /* ------------------------- row / detail actions ------------------------- */
  const handleRowAction = async (key, row) => {
    if (key === 'view') {
      setDetailRecord(row);
    } else if (key === 'edit') {
      navigate(`/purchase/rfq/follow-ups/${row.id}/edit`);
    } else if (key === 'complete') {
      const ok = await runFollowUpAction(
        () => rfqFollowUpService.completeFollowUp(row.id),
        `${row.followUpNo} marked completed`,
        'Failed to complete follow-up'
      );
      if (ok) setStatsVersion((v) => v + 1);
    } else if (key === 'reschedule') {
      setRescheduleTarget(row);
      setRescheduleDate(row.followUpDate || '');
      setRescheduleTime(row.followUpTime || '10:00');
    } else if (key === 'cancel') {
      const ok = await runFollowUpAction(
        () => rfqFollowUpService.cancelFollowUp(row.id),
        `${row.followUpNo} cancelled`,
        'Failed to cancel follow-up'
      );
      if (ok) setStatsVersion((v) => v + 1);
    } else if (key === 'restore') {
      const ok = await runFollowUpAction(
        () => rfqFollowUpService.restoreFollowUp(row.id),
        `${row.followUpNo} restored to active`,
        'Failed to restore follow-up'
      );
      if (ok) setStatsVersion((v) => v + 1);
    } else if (key === 'delete') {
      setDeleteTarget({ id: row.id, followUpNo: row.followUpNo });
      setDeleteOpen(true);
    }
  };

  const openRfq = (row) => {
    if (row.rfqId) navigate(`/purchase/rfq/${row.rfqId}`);
  };

  const handleReschedule = async () => {
    if (!rescheduleTarget) return;
    if (!rescheduleDate) {
      toast.error('Follow-up date is required');
      return;
    }
    const ok = await runFollowUpAction(
      () => rfqFollowUpService.rescheduleFollowUp(rescheduleTarget.id, rescheduleDate, rescheduleTime),
      `${rescheduleTarget.followUpNo} rescheduled to ${formatDate(rescheduleDate)}`,
      'Failed to reschedule follow-up'
    );
    if (ok) {
      setRescheduleTarget(null);
      setStatsVersion((v) => v + 1);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.bulk) {
      const result = await runMutation(() =>
        Promise.all(deleteTarget.bulk.map((id) => rfqFollowUpService.deleteFollowUp(id)))
      );
      if (result.ok) {
        toast.success(`${deleteTarget.bulk.length} follow-up(s) deleted`);
        setSelectedIds([]);
      } else {
        toast.error(result.error?.message || 'Failed to delete follow-ups');
      }
    } else {
      const result = await runMutation(() => rfqFollowUpService.deleteFollowUp(deleteTarget.id));
      if (result.ok) toast.success(`${deleteTarget.followUpNo} deleted`);
      else toast.error(result.error?.message || 'Failed to delete follow-up');
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
    setStatsVersion((v) => v + 1);
  };

  /* ------------------------------ filters ------------------------------ */
  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilter(key, SELECT_FILTER_KEYS.includes(key) ? value || 'All' : value);
    });
    /* Keep the KPI highlight truthful — if the panel status no longer
       matches the active KPI bucket (or is cleared), drop the KPI
       selection. */
    const appliedStatus = draftFilters.status || 'All';
    if (KPI_BUCKET[kpiFilter] !== appliedStatus) setKpiFilter(null);
    setSelectedIds([]);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    resetFilters();
    setKpiFilter(null);
    setSearchInput('');
    setSelectedIds([]);
  };

  const toggleFilters = () => {
    const next = !filterOpen;
    if (next) {
      setDraftFilters(
        FILTER_KEYS.reduce((acc, key) => {
          const value = filters[key];
          if (value && value !== 'All') acc[key] = value;
          return acc;
        }, {})
      );
    }
    setFilterOpen(next);
  };

  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key] && filters[key] !== 'All').length;

  /* Vendor / assignee dropdown options come from the loaded records
     (same pattern as the CRM Follow-up page). */
  const vendorOptions = useMemo(
    () => Array.from(new Set(records.map((row) => row.vendor).filter(Boolean))).sort(),
    [records]
  );
  const assignedOptions = useMemo(
    () => Array.from(new Set(records.map((row) => row.assignedTo).filter(Boolean))).sort(),
    [records]
  );

  /* ------------------------------- export ------------------------------- */
  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'RFQ Follow-ups', columns, records: rows, filename: 'rfq-followups' });
      else if (type === 'excel') await exportExcel(columns, rows, 'rfq-followups');
      else if (type === 'csv') exportCsv(columns, rows, 'rfq-followups');
      else if (type === 'print') printTable('RFQ Follow-ups', columns, rows);
      toast.success('Follow-ups exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export follow-ups');
    }
  };

  const handleBulk = async (key, ids) => {
    if (key === 'delete') {
      setDeleteTarget({ bulk: ids });
      setDeleteOpen(true);
      return;
    }
    if (key === 'archive') {
      /* UI-only — matches the RFQ List bar layout but the Follow-up
         service has no archive state, so this is a clear no-op notice. */
      toast.info('Archiving is not available for Follow-ups');
      return;
    }
    if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No follow-ups selected to export');
          return;
        }
        exportCsv(columns, selected, 'rfq-followups-selected');
        toast.success(`${selected.length} follow-up(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export follow-ups');
      }
    }
  };

  /* Flat button row — Export | Archive | Delete, same structure and
     styling as the RFQ List bulk bar (no More dropdown). */
  const bulkActions = useMemo(
    () => [
      { key: 'export', label: 'Export', icon: Download },
      { key: 'archive', label: 'Archive', icon: Archive },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
    ],
    []
  );

  /* ------------------------------ table cells ------------------------------ */
  const renderCell = useMemo(
    () => ({
      rfqNo: (row) => (
        <a
          href={row.rfqId ? `/purchase/rfq/${row.rfqId}` : '#'}
          onClick={(e) => {
            e.preventDefault();
            if (row.rfqId) navigate(`/purchase/rfq/${row.rfqId}`);
          }}
        >
          {row.rfqNo}
        </a>
      ),
      rfqTitle: (row) => (
        <span className="cpr-cell-truncate" title={row.rfqTitle}>{row.rfqTitle || '—'}</span>
      ),
      vendor: (row) => <span className="cpr-cell-truncate" title={row.vendor}>{row.vendor || '—'}</span>,
      requester: (row) => <span className="cpr-cell-truncate">{row.requester || '—'}</span>,
      type: (row) => (
        <span className="fu-type-chip" title={row.type}>{row.type || '—'}</span>
      ),
      dueDate: (row) => <span className="cpr-cell-date">{row.followUpDate ? formatDate(row.followUpDate) : '—'}</span>,
      nextFollowUp: (row) => <span className="cpr-cell-date">{row.followUpDate ? formatDate(row.followUpDate) : '—'}</span>,
      lastContact: (row) => <span className="cpr-cell-date">{row.lastContact ? formatDate(row.lastContact) : '—'}</span>,
      priority: (row) => (
        <span className={`cpr-priority ${PRIORITY_CLASS[row.priority] || PRIORITY_CLASS.Medium}`}>
          {row.priority || 'Medium'}
        </span>
      ),
      status: (row) => <PurchaseStatusCell status={row.status || 'Upcoming'} />,
      assignedTo: (row) => <span className="cpr-cell-truncate">{row.assignedTo || '—'}</span>
    }),
    [navigate]
  );

  /** Row menu — View, Edit, Mark Completed / Reschedule / Cancel (pending
      only), Delete. */
  const buildRowActions = (row) => {
    const actions = [{ key: 'view', label: 'View Follow-up', icon: Eye }];
    /* Deleted records show Restore instead of workflow actions. */
    if (row.recordState === 'deleted') {
      actions.push({ key: 'restore', label: 'Restore', icon: RefreshCw });
      return actions;
    }
    if (row.workflowStatus === FOLLOWUP_STATUS.PENDING) {
      actions.push({ key: 'complete', label: 'Mark Completed', icon: CheckCircle2 });
      actions.push({ key: 'reschedule', label: 'Reschedule', icon: CalendarClock });
      actions.push({ key: 'cancel', label: 'Cancel Follow-up', icon: XCircle });
    }
    actions.push({ key: 'edit', label: 'Edit', icon: PencilLine });
    actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    return actions;
  };

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'RFQ Follow-ups' }
        ],
        icon: BellRing,
        title: 'RFQ Follow-ups',
        subtitle: 'Track vendor responses, quotation deadlines and RFQ actions that require follow-up.',
        actions: (
          <button
            type="button"
            className="erp-btn-primary"
            onClick={() => navigate('/purchase/rfq/follow-ups/new')}
          >
            <span className="erp-btn-icon"><Plus size={16} /></span> New Follow-up
          </button>
        )
      }}
      flowNav={<RfqTabNav />}
      error={error}
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, gridClass: 'fu-kpi-grid', activeKey: kpiFilter, onSelect: handleKpiSelect }}
      tabs={{
        primary: { label: 'All Follow-ups', count: stats?.total ?? 0, onSelect: goAllFollowUps },
        segments: {
          tabs: LIFECYCLE_TABS.map((item) => ({
            key: item.key,
            label: item.label,
            count: item.key === 'active' ? (stats?.active ?? stats?.total ?? 0) : (stats?.[item.key] ?? 0)
          })),
          activeKey: tab,
          onSelect: selectLifecycle,
          ariaLabel: 'Follow-up lifecycle'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleFilters}
              aria-label="Toggle filters"
              aria-expanded={filterOpen}
            >
              <Filter size={12} /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(searchInput || activeFilterCount > 0) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="rfqFollowUpSearchInput"
              placeholder="Search RFQ Number, Title, Vendor, Requester, Type..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search RFQ follow-ups"
            />
            <PurchaseExportDropdown buttonLabel="Export Follow-ups" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={MANDATORY_COLUMNS}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'rfqFollowUpFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'status', id: 'fu-status', label: 'Follow-up Status', value: draftFilters.status || 'All',
            options: [
              { value: 'All', label: 'All Statuses' },
              { value: 'Overdue', label: 'Overdue' },
              { value: 'Due Today', label: 'Due Today' },
              { value: 'Upcoming', label: 'Upcoming' },
              { value: 'Completed', label: 'Completed' },
              { value: 'Cancelled', label: 'Cancelled' }
            ],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, status: v }))
          },
          {
            key: 'type', id: 'fu-type', label: 'Follow-up Type', value: draftFilters.type || 'All',
            options: [{ value: 'All', label: 'All Types' }, ...FOLLOWUP_TYPES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, type: v }))
          },
          {
            key: 'priority', id: 'fu-priority', label: 'Priority', value: draftFilters.priority || 'All',
            options: [{ value: 'All', label: 'All Priorities' }, ...PRIORITIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, priority: v }))
          },
          {
            key: 'vendor', id: 'fu-vendor', label: 'Vendor', value: draftFilters.vendor || 'All',
            options: [{ value: 'All', label: 'All Vendors' }, ...vendorOptions.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, vendor: v }))
          },
          {
            key: 'assignedTo', id: 'fu-assigned', label: 'Assigned To', value: draftFilters.assignedTo || 'All',
            options: [{ value: 'All', label: 'All Users' }, ...assignedOptions.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, assignedTo: v }))
          },
          {
            key: 'rfqStatus', id: 'fu-rfq-status', label: 'RFQ Status', value: draftFilters.rfqStatus || 'All',
            options: [{ value: 'All', label: 'All RFQ Statuses' }, ...RFQ_STATUSES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, rfqStatus: v }))
          },
          {
            key: 'dateFrom', id: 'fu-due-from', label: 'Due Date From', type: 'date', value: draftFilters.dateFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v }))
          },
          {
            key: 'dateTo', id: 'fu-due-to', label: 'Due Date To', type: 'date', value: draftFilters.dateTo || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateTo: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'rfqFollowUpBulkActionBar'
      }}
      table={{
        columns: visibleColumns,
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) =>
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers: renderCell,
        idColumn: 'rfqNo',
        tableId: 'rfqFollowUpTable',
        alignCenter: ['dueDate', 'nextFollowUp', 'priority', 'status'],
        alignRight: [],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        /* Pending dot — open (pending) follow-ups only, colored by the
           same semantic tone as the status badge (Overdue = red, Due
           Today = orange, Upcoming = blue); completed / cancelled rows
           never render it (same set as the sidebar badge). */
        /* Pending highlight — the shared light-orange identification
           wash on the checkbox + RFQ-number cells for open (pending)
           follow-ups only; completed / cancelled rows stay normal. */
        rowClass: (row) => pendingWorkClass(isFollowUpPending(row)),
        /* Clicking a follow-up row opens its details (CRM Follow-ups
           behaviour) — the checkbox and the ⋮ menu stop propagation. */
        onRowClick: (row) => setDetailRecord(row),
        emptyContent: (
          tab === 'deleted' ? (
            <div className="cpr-empty">
              <Trash2 size={48} aria-hidden="true" />
              <h3>No Deleted Follow-ups</h3>
              <p>Your trash is empty. Deleted follow-ups will appear here.</p>
              <button type="button" className="btn btn-primary" onClick={() => selectLifecycle('active')}>
                <ArrowLeft size={14} /> Back to Active Follow-ups
              </button>
            </div>
          ) : tab === 'archived' ? (
            <div className="cpr-empty">
              <Archive size={48} aria-hidden="true" />
              <h3>No Archived Follow-ups</h3>
              <p>Archived follow-ups will appear here.</p>
            </div>
          ) : hasFilters ? (
            <PurchaseEmptyState
              icon={Search}
              title="No follow-ups match your filters."
              message="Try adjusting your search or filters."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Filters
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={BellRing}
              title="No RFQ Follow-ups"
              message="Create a follow-up to track vendor responses and quotation deadlines."
              action={
                <button
                  type="button"
                  className="erp-btn-primary"
                  onClick={() => navigate('/purchase/rfq/follow-ups/new')}
                >
                  <span className="erp-btn-icon"><Plus size={16} /></span> New Follow-up
                </button>
              }
            />
          )
        )
      }}
      pagination={{
        page,
        totalPages,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: goToPage,
        onPageSizeChange: changePageSize
      }}
    >
      {/* ===== DETAIL MODAL ===== */}
      <RfqFollowUpDetail
        open={detailRecord !== null}
        onClose={() => setDetailRecord(null)}
        record={detailRecord}
        loading={actionLoading}
        onOpenRfq={() => {
          if (detailRecord) {
            openRfq(detailRecord);
            setDetailRecord(null);
          }
        }}
        onEdit={() => {
          if (detailRecord) {
            navigate(`/purchase/rfq/follow-ups/${detailRecord.id}/edit`, { state: { from: 'detail' } });
            setDetailRecord(null);
          }
        }}
        onReschedule={() => {
          if (detailRecord) {
            setRescheduleTarget(detailRecord);
            setRescheduleDate(detailRecord.followUpDate || '');
            setRescheduleTime(detailRecord.followUpTime || '10:00');
            setDetailRecord(null);
          }
        }}
        onComplete={async () => {
          if (!detailRecord) return;
          const ok = await runFollowUpAction(
            () => rfqFollowUpService.completeFollowUp(detailRecord.id),
            `${detailRecord.followUpNo} marked completed`,
            'Failed to complete follow-up'
          );
          if (ok) {
            setDetailRecord(null);
            setStatsVersion((v) => v + 1);
          }
        }}
        onCancel={async () => {
          if (!detailRecord) return;
          const ok = await runFollowUpAction(
            () => rfqFollowUpService.cancelFollowUp(detailRecord.id),
            `${detailRecord.followUpNo} cancelled`,
            'Failed to cancel follow-up'
          );
          if (ok) {
            setDetailRecord(null);
            setStatsVersion((v) => v + 1);
          }
        }}
        onDelete={() => {
          if (detailRecord) {
            setDeleteTarget({ id: detailRecord.id, followUpNo: detailRecord.followUpNo });
            setDetailRecord(null);
            setDeleteOpen(true);
          }
        }}
      />

      {/* ===== RESCHEDULE MODAL ===== */}
      <Modal
        open={rescheduleTarget !== null}
        onClose={() => setRescheduleTarget(null)}
        title={`Reschedule ${rescheduleTarget?.followUpNo || 'Follow-up'}`}
        footer={
          <>
            <button
              type="button"
              onClick={() => setRescheduleTarget(null)}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReschedule}
              disabled={actionLoading}
              className="flex items-center gap-1.5 text-xs font-bold text-white px-4 py-2 rounded-lg transition-all cursor-pointer disabled:opacity-50 bg-gradient-to-r from-[#0F5C4C] to-[#0B4A3D] hover:from-[#136754] hover:to-[#0F5C4C] shadow-sm"
            >
              <CalendarClock className="w-3.5 h-3.5" /> Save
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1" htmlFor="fu-res-date">
              Follow-up Date *
            </label>
            <input
              id="fu-res-date"
              type="date"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] transition-colors"
              value={rescheduleDate}
              onChange={(e) => setRescheduleDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1" htmlFor="fu-res-time">
              Follow-up Time
            </label>
            <input
              id="fu-res-time"
              type="time"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] transition-colors"
              value={rescheduleTime}
              onChange={(e) => setRescheduleTime(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      {/* ===== DELETE CONFIRM ===== */}
      <ConfirmDialog
        open={deleteOpen}
        title={deleteTarget?.bulk ? 'Delete selected follow-ups?' : 'Delete follow-up?'}
        message={
          deleteTarget?.bulk
            ? `This will move ${deleteTarget.bulk.length} selected follow-up(s) to the Deleted tab. You can restore them later. The linked RFQs are not affected.`
            : `This will move ${deleteTarget?.followUpNo || 'this follow-up'} to the Deleted tab. You can restore it later. The linked RFQ is not affected.`
        }
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      />
    </PurchaseListPage>
  );
}
