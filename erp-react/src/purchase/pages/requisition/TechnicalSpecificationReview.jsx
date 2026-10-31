/**
 * purchase/pages/requisition/TechnicalSpecificationReview.jsx
 * ------------------------------------------------------------------
 * Technical Specification Review — an action queue for the technical
 * reviewer. It shows ONLY requisitions currently in the canonical
 * Technical Specification Review stage (PR_STATUS.TECHNICAL_REVIEW) —
 * nothing pending Admin approval, already reviewed, returned or
 * converted. It is designed to look like another tab inside the
 * Purchase module. It
 * reuses the shared Purchase list design system (cpr-list.css +
 * requisition-list-polish.css + the shared list components) so the
 * page matches the Purchase Requisition list exactly: shared header,
 * KPI cards, toolbar, search, filter drawer, table (sticky dark-green
 * header, sorting), columns dropdown, pagination inside the card,
 * skeleton / empty states and the three-dot row action menu.
 *
 * The existing review process is untouched: the technical review
 * modal, saveTechnicalReview and all approval mutations flow through
 * the existing requisitionService. Clicking a row opens the existing
 * review modal; actions flow through the shared row menu.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Eye, FileText, Filter,
  Loader2, RefreshCw, RotateCcw, Save, Search, SearchCheck,
  TrendingUp, X
} from 'lucide-react';
import { ConfirmDialog, Modal, TextArea, TextInput, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import useDebounce from '../../hooks/useDebounce';
import { requisitionService } from '../../services/requisition';
import { REVIEW_STATUS } from '../../constants';
import {
  QUEUE_PAGE_SIZE_EXPORT,
  mapQueueStats
} from '../../utils/technicalReviewQueue';
import { formatAmountConverted } from '../../utils/purchase';
import {
  REVIEW_STAGE_STATUS, hasDrawing, isActionable, itemLabel,
  materialStatusOf, reviewStatusOf, specificationStatusOf
} from '../../utils/technicalReview';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';
import '../../styles/technical-review.css';

import usePurchaseAccess from '../../access/usePurchaseAccess';
const KPI_DEFS = [
  { key: 'pendingReview', label: 'Pending Review', icon: SearchCheck, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'reviewedToday', label: 'Reviewed Today', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'highPriority', label: 'High Priority', icon: TrendingUp, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' }
];

const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

const REVIEW_STATUS_OPTIONS = [
  REVIEW_STAGE_STATUS.READY,
  REVIEW_STAGE_STATUS.PENDING_APPROVAL,
  REVIEW_STAGE_STATUS.REVIEWED,
  REVIEW_STAGE_STATUS.RETURNED
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Table columns (widths follow the Vendor List scale so the table
    reads identically to the rest of the Purchase module). */
const TSR_COLUMNS = [
  { key: 'prNo', label: 'PR No', width: 120, sortable: true, visible: true },
  { key: 'item', label: 'Item', width: 200, sortable: true, visible: true },
  { key: 'department', label: 'Department', width: 140, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 180, sortable: true, visible: true },
  { key: 'assignedBy', label: 'Assigned By', width: 140, sortable: true, visible: true },
  { key: 'priority', label: 'Priority', width: 105, sortable: true, visible: true },
  { key: 'specification', label: 'Specification', width: 110, sortable: false, visible: true },
  { key: 'drawing', label: 'Drawing', width: 120, sortable: false, visible: true },
  { key: 'material', label: 'Material', width: 110, sortable: false, visible: true },
  { key: 'reviewStatus', label: 'Status', width: 150, sortable: true, visible: true }
];

const EXPORT_COLUMNS = [
  { key: 'prNo', label: 'PR No' },
  { key: 'item', label: 'Item' },
  { key: 'department', label: 'Department' },
  { key: 'vendor', label: 'Vendor' },
  { key: 'assignedBy', label: 'Assigned By' },
  { key: 'priority', label: 'Priority' },
  { key: 'specification', label: 'Specification' },
  { key: 'drawing', label: 'Drawing' },
  { key: 'material', label: 'Material' },
  { key: 'reviewStatus', label: 'Review Status' }
];

const SECONDARY =
  'inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none';

const emptyReviewForm = () => ({
  specification: '',
  drawing: '',
  materialGrade: '',
  dimensions: '',
  comments: '',
  reviewStatus: REVIEW_STATUS.REVIEWED
});

/* ToneBadge was replaced by PurchaseStatusCell per the module-wide
   status-cell migration — only pending statuses get a colored cell;
   all other statuses render as normal table text. */

function PriorityChip({ priority }) {
  return <span className={`cpr-priority ${PRIORITY_CLASS[priority] || PRIORITY_CLASS.Medium}`}>{priority}</span>;
}

/*
 * Sorting used to happen here (sortValueFor + a client-side array sort).
 * The ordering now lives in the database — the queue request carries the
 * sort column and the backend orders the WHOLE queue, not just the rows
 * this page happens to hold. See utils/technicalReviewQueue.js.
 */

/** Display-only enrichment applied to every row the queue returns. */
function toQueueRow(record) {
  return {
    ...record,
    _reviewStatus: reviewStatusOf(record),
    _spec: specificationStatusOf(record),
    _material: materialStatusOf(record),
    _item: itemLabel(record),
    _drawing: hasDrawing(record) ? record.technicalReview.drawing : '',
    _assignedBy: record.buyer || ''
  };
}

export default function TechnicalSpecificationReview() {
  const navigate = useNavigate();
  /* PR Technical Specification Review is its own area: Approve / Return need
     prTechSpec.approve / .reject, and saving a review needs its .approve
     (the review is the approval record). The requisition parent still bounds
     it — the backend ANDs the two. */
  const { can } = usePurchaseAccess();
  const canApproveSpec = can('prTechSpec', 'approve');
  const canRejectSpec = can('prTechSpec', 'reject');
  const canEditSpec = can('requisition', 'edit');
  const toast = useToast();

  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState(() => mapQueueStats(null));
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});

  const [columns, setColumns] = useState(() => TSR_COLUMNS.map((col) => ({ ...col })));
  const [sortKey, setSortKey] = useState(null);
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [reviewTarget, setReviewTarget] = useState(null);
  const [form, setForm] = useState(emptyReviewForm());
  const [saving, setSaving] = useState(false);

  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [kpiActive, setKpiActive] = useState(null);

  /* Debounced search: the term is applied on the server, so it is sent once
     the typing settles instead of on every keystroke. */
  const debouncedSearch = useDebounce(searchInput, 400);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(debouncedSearch);
      setPage(1);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch]);

  /*
   * The queue state that drives the request. Search, the filter drawer, the
   * active KPI card and the sort column are all part of it — the backend
   * filters, sorts and counts in the database and returns exactly one page.
   * The browser never holds more rows than it shows.
   *
   * This is passed in its RAW screen form (page / pageSize / search / filters /
   * kpiActive / sortKey / sortDirection); `buildQueueQuery` turns it into the
   * API query inside the service. It must NOT be pre-built here — doing so
   * would hand the service an already-built query, which the second pass would
   * re-interpret as screen state and silently drop every filter, the sort and
   * the chosen page size.
   */
  const queueQuery = useMemo(
    () => ({ page, pageSize, search, filters, kpiActive, sortKey, sortDirection }),
    [page, pageSize, search, filters, kpiActive, sortKey, sortDirection]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const result = await requisitionService.getTechnicalReviewQueue(queueQuery);
        if (cancelled) return;
        const lastPage = Math.max(1, result?.totalPages || 1);
        setRecords(result?.data || []);
        setTotal(result?.total || 0);
        setTotalPages(lastPage);
        /* Rows can disappear under a pager that moved past the end; step back
           onto the last real page instead of showing an empty table. */
        if (queueQuery.page > lastPage) setPage(lastPage);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [queueQuery, refreshKey]);

  /* KPI cards and the filter options are database counts over the whole queue —
     they can no longer be skewed by how many rows were downloaded. */
  useEffect(() => {
    let cancelled = false;
    requisitionService
      .getTechnicalReviewQueueStats()
      .then((data) => {
        if (!cancelled) setStats(mapQueueStats(data));
      })
      .catch(() => {
        if (!cancelled) setStats(mapQueueStats(null));
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  /* ------------------------------ Derived rows ------------------------------ */
  /* Action queue — the backend already scopes the result to requisitions in
     the canonical Technical Specification Review stage (active record state,
     never Pending Approval / Returned / converted), so the page renders the
     rows it was given. */
  const rows = useMemo(() => records.map(toQueueRow), [records]);

  /* KPI cards come from the queue stats endpoint (database counts). */
  const kpi = useMemo(() => ({
    pendingReview: stats.pendingReview,
    reviewedToday: stats.reviewedToday,
    highPriority: stats.highPriority
  }), [stats]);

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: kpi[def.key] }));

  /* Filter options are the distinct values of the WHOLE queue, not of the
     page on screen. */
  const departmentOptions = stats.departments;
  const vendorOptions = stats.vendors;
  const assignedByOptions = stats.assignees;

  /* ------------------------------ Filtering ------------------------------ */
  /* Every filter (KPI card, drawer value, search term) is applied by the
     backend inside the queue query above — see queueQuery. The rows on screen
     are therefore already filtered, searched and sorted. */
  const activeFilterCount =
    Object.keys(filters).filter((key) => filters[key] !== '' && filters[key] != null).length;

  const handleFilterChange = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev };
      if (value === undefined || value === null || value === '') delete next[key];
      else next[key] = value;
      return next;
    });
    setPage(1);
  };

  const clearAll = () => {
    setFilters({});
    setSearchInput('');
    setSearch('');
    setKpiActive(null);
    setPage(1);
  };

  const handleKpiClick = (key) => {
    setKpiActive((prev) => (prev === key ? null : key));
    setPage(1);
  };

  /* ------------------------------ Sorting + pagination ------------------------------ */
  const toggleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
    setPage(1);
  };

  /* The rows on screen ARE one page of the queue — the server pages it, so
     there is no slicing (and no re-sorting) left to do here. */
  const currentPage = Math.min(page, totalPages) || 1;
  const pageRows = rows;
  const pageInfo = total > 0
    ? `Showing ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, total)} of ${total}`
    : 'Showing 0 of 0';

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => ({ ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'prNo' ? col : { ...col, visible: false })));

  /* ------------------------------ Actions ------------------------------ */
  const openReview = (record) => {
    setReviewTarget(record);
    setForm(emptyReviewForm());
  };

  const closeReview = () => {
    setReviewTarget(null);
    setForm(emptyReviewForm());
  };

  const setField = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const saveReview = async () => {
    if (!reviewTarget) return;
    setSaving(true);
    try {
      await requisitionService.saveTechnicalReview(reviewTarget.id, form);
      toast.success(`${reviewTarget.prNo} technical review saved`);
      closeReview();
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Failed to save technical review');
    } finally {
      setSaving(false);
    }
  };

  const requestAction = (mode, record) => setConfirmAction({ mode, record });

  const runConfirm = async () => {
    if (!confirmAction) return;
    const { mode, record } = confirmAction;
    setBusy(true);
    try {
      if (mode === 'approve') {
        /* Technical approval only — the queue holds PRs already past
           Admin approval (status TECHNICAL_REVIEW). Approving moves the
           PR to Ready for RFQ. Admin PR approval never happens here. */
        await requisitionService.completeTechnicalReview(record.id, 'Approved from technical review');
      } else {
        await requisitionService.returnRequisition(record.id, 'Returned from technical review');
      }
      toast.success(
        `${record.prNo} ${mode === 'approve' ? 'approved' : 'returned'}`
      );
      setConfirmAction(null);
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Export stays bounded: it reads the widest page the queue endpoint allows
   * with the SAME query the table is showing, instead of pulling the whole
   * table into the browser.
   */
  const runExport = async (format) => {
    setBusy(true);
    try {
      const result = await requisitionService.getTechnicalReviewQueue({
        ...queueQuery,
        page: 1,
        pageSize: QUEUE_PAGE_SIZE_EXPORT
      });
      const data = (result?.data || []).map(toQueueRow).map((row) => ({
        prNo: row.prNo,
        item: row._item,
        department: row.department,
        vendor: row.vendor || 'Not Assigned',
        assignedBy: row.vendor ? (row._assignedBy || '\u2014') : 'Not Assigned',
        priority: row.priority,
        specification: row._spec,
        drawing: row._drawing || '—',
        material: row._material,
        reviewStatus: row._reviewStatus
      }));

      if (format === 'csv') exportCsv(EXPORT_COLUMNS, data, 'technical-review');
      else if (format === 'excel') await exportExcel(EXPORT_COLUMNS, data, 'technical-review');
      else if (format === 'print') printTable('Technical Specification Review', EXPORT_COLUMNS, data);
      else if (format === 'pdf') {
        await exportPdf({
          title: 'Technical Specification Review',
          filename: 'technical-review',
          meta: [
            ['Module', 'Purchase Requisition · Technical Review'],
            ['Generated', new Date().toLocaleString('en-GB')],
            ['Records', String(data.length)]
          ],
          columns: EXPORT_COLUMNS,
          records: data
        });
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to export the review queue');
    } finally {
      setBusy(false);
    }
  };

  /* ------------------------------ Table wiring ------------------------------ */
  const renderers = useMemo(
    () => ({
      prNo: (row) => (
        <a
          href={`/purchase/requisition/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            navigate(`/purchase/requisition/${row.id}`);
          }}
        >
          {row.prNo}
        </a>
      ),
      item: (row) => <span className="cpr-cell-truncate" title={row.title}>{row._item}</span>,
      vendor: (row) => {
        const name = row.vendor || '';
        return (
          <span className="cpr-cell-truncate" title={name}>
            {name || 'Not Assigned'}
          </span>
        );
      },
      assignedBy: (row) => {
        const hasVendor = Boolean(row.vendor);
        const assigned = row._assignedBy || '';
        const display = hasVendor ? (assigned || '\u2014') : 'Not Assigned';
        return (
          <span className="cpr-cell-truncate" title={display}>
            {display}
          </span>
        );
      },
      priority: (row) => <PriorityChip priority={row.priority} />,
      specification: (row) => <PurchaseStatusCell status={row._spec} />,
      drawing: (row) =>
        row._drawing ? (
          <button
            type="button"
            className="tsr-view-drawing"
            title={`Open ${row._drawing}`}
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/purchase/requisition/${row.id}`);
            }}
          >
            <FileText className="w-3.5 h-3.5" /> View Drawing
          </button>
        ) : (
          <span className="tsr-missing">
            <AlertTriangle className="w-3 h-3" /> Missing
          </span>
        ),
      material: (row) => <PurchaseStatusCell status={row._material} />,
      reviewStatus: (row) => <PurchaseStatusCell status={row._reviewStatus} />
    }),
    [navigate]
  );

  const buildRowActions = (row) => {
    const actions = [
      { key: 'view', label: 'View', icon: Eye },
      { key: 'review', label: 'Review Specification', icon: SearchCheck }
    ];
    if (isActionable(row) && canApproveSpec) {
      actions.push({ divider: true });
      actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
      if (canRejectSpec) actions.push({ key: 'return', label: 'Return', icon: RotateCcw });
    }
    return actions;
  };

  const handleRowAction = (key, row) => {
    if (key === 'view') navigate(`/purchase/requisition/${row.id}`);
    else if (key === 'review') openReview(row);
    else if (key === 'approve') requestAction('approve', row);
    else if (key === 'return') requestAction('return', row);
  };

  /* ------------------------------ Render ------------------------------ */
  return (
    <PurchaseListPage
      header={{
        crumb: 'Technical Review',
        icon: SearchCheck,
        title: 'Technical Specification Review'
      }}
      flowNav={<ModuleTabNav module="requisition" />}
      errorBanner={
        error && (
          <div className="mb-1 rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-rose-600">{error?.message || 'Failed to load review queue.'}</p>
            <button type="button" onClick={refresh} className="text-xs font-bold text-rose-600 underline cursor-pointer">Retry</button>
          </div>
        )
      }
      kpis={{ cards: kpiCards, loading, activeKey: kpiActive, onSelect: handleKpiClick }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFilterPanelOpen((value) => !value)}
              aria-label="Toggle filters"
              aria-expanded={filterPanelOpen}
            >
              <Filter size={12} /> {filterPanelOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(search || activeFilterCount > 0) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="tsrSearch"
              placeholder="Search PR, item, vendor…"
              value={searchInput}
              onChange={setSearchInput}
              label="Search technical review queue"
            />
            <PurchaseExportDropdown buttonLabel="Export Review Queue" onExport={runExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />
          </>
        )
      }}
      filters={{
        open: filterPanelOpen,
        panelId: 'tsrFilterPanel',
        onApply: () => setFilterPanelOpen(false),
        onReset: clearAll,
        groups: [
          {
            key: 'department', id: 'tsr-dept', label: 'Department', value: filters.department || 'All',
            options: [{ value: 'All', label: 'All Departments' }, ...departmentOptions.map((v) => ({ value: v, label: v }))],
            onChange: (v) => handleFilterChange('department', v === 'All' ? '' : v)
          },
          {
            key: 'vendor', id: 'tsr-vendor', label: 'Vendor', value: filters.vendor || 'All',
            options: [{ value: 'All', label: 'All Vendors' }, ...vendorOptions.map((v) => ({ value: v, label: v }))],
            onChange: (v) => handleFilterChange('vendor', v === 'All' ? '' : v)
          },
          {
            key: 'assignedBy', id: 'tsr-assigned-by', label: 'Assigned By', value: filters.assignedBy || 'All',
            options: [{ value: 'All', label: 'All Assignees' }, ...assignedByOptions.map((v) => ({ value: v, label: v }))],
            onChange: (v) => handleFilterChange('assignedBy', v === 'All' ? '' : v)
          },
          {
            key: 'priority', id: 'tsr-priority', label: 'Priority', value: filters.priority || 'All',
            options: [{ value: 'All', label: 'All Priorities' }, ...['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))],
            onChange: (v) => handleFilterChange('priority', v === 'All' ? '' : v)
          },
          {
            key: 'reviewStatus', id: 'tsr-review-status', label: 'Review Status', value: filters.reviewStatus || 'All',
            options: [{ value: 'All', label: 'All Review Status' }, ...REVIEW_STATUS_OPTIONS.map((s) => ({ value: s, label: s }))],
            onChange: (v) => handleFilterChange('reviewStatus', v === 'All' ? '' : v)
          },
          {
            key: 'dateFrom', id: 'tsr-date-from', label: 'Date From', type: 'date', value: filters.dateFrom || '',
            onChange: (v) => handleFilterChange('dateFrom', v)
          },
          {
            key: 'dateTo', id: 'tsr-date-to', label: 'Date To', type: 'date', value: filters.dateTo || '',
            onChange: (v) => handleFilterChange('dateTo', v)
          }
        ]
      }}
      table={{
        columns: visibleColumns,
        rows: pageRows,
        loading: loading && rows.length === 0,
        selectable: false,
        renderers,
        idColumn: 'prNo',
        tableId: 'tsrTable',
        sortKey,
        sortDirection,
        onSort: toggleSort,
        /* Pending dot — only rows that still need the review action,
           colored by the same semantic tone as the review badge
           (Ready for Review = orange); reviewed / returned rows render
           none (same pending set as the sidebar badge). Rendered in the
           id cell (non-selectable). */
        /* Pending highlight — the shared light-orange identification
           wash on the PR-number cell for rows still awaiting technical
           review (same pending set as the sidebar badge). */
        rowClass: (row) => pendingWorkClass(isActionable(row)),
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        actionMenuLabel: 'Review actions',
        onRowClick: openReview,
        emptyContent: (
          <PurchaseEmptyState
            icon={Search}
            title={stats.pendingReview === 0 ? 'No Requisitions Ready' : 'No Matching Requisitions'}
            message={
              stats.pendingReview === 0
                ? 'Nothing is ready for technical review right now.'
                : 'No requisitions match your search / filters.'
            }
          />
        )
      }}
      pagination={{
        page: currentPage,
        totalPages,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: setPage,
        onPageSizeChange: (size) => {
          setPageSize(size);
          setPage(1);
        }
      }}
    >
      {/* Technical review modal — existing review process, unchanged */}
      <Modal
        open={reviewTarget !== null}
        onClose={closeReview}
        title={reviewTarget ? `Technical Review — ${reviewTarget.prNo}` : 'Technical Review'}
        maxWidth="max-w-2xl"
        footer={
          <>
            <button type="button" onClick={closeReview} className={SECONDARY}>Cancel</button>
            {canEditSpec && (
              <button
                type="button"
                onClick={saveReview}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-violet-600 to-violet-700 hover:from-violet-700 hover:to-violet-800 text-white"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <Save className="w-3.5 h-3.5" /> Save Review
              </button>
            )}
          </>
        }
      >
        {reviewTarget && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PR No</div>
                <div className="text-xs font-bold text-slate-800">{reviewTarget.prNo}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Department</div>
                <div className="text-xs font-bold text-slate-800">{reviewTarget.department}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Requester</div>
                <div className="text-xs font-bold text-slate-800">{reviewTarget.requester}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</div>
                <div className="text-xs font-bold text-slate-800">{formatAmountConverted(reviewTarget.amount, reviewTarget.currency)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</div>
                <div className="mt-0.5">
                  <PurchaseStatusCell status={reviewStatusOf(reviewTarget)} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Specification</span>
                <TextInput value={form.specification} onChange={setField('specification')} placeholder="e.g. IS 2062 E250 steel" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Drawing</span>
                <TextInput value={form.drawing} onChange={setField('drawing')} placeholder="e.g. F-2271 rev C" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Material Grade</span>
                <TextInput value={form.materialGrade} onChange={setField('materialGrade')} placeholder="e.g. E250 / Fe415" />
              </label>
              <label className="block">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Dimensions</span>
                <TextInput value={form.dimensions} onChange={setField('dimensions')} placeholder="e.g. 3mm x 1250 x 2500" />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Comments</span>
                <TextArea rows={3} value={form.comments} onChange={setField('comments')} placeholder="Technical comments for the procurement team..." />
              </label>
              <label className="block sm:col-span-2">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Review Status</span>
                <select
                  value={form.reviewStatus}
                  onChange={setField('reviewStatus')}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none transition-all focus:border-blue-500/60 focus:bg-surface cursor-pointer"
                >
                  {[REVIEW_STATUS.IN_REVIEW, REVIEW_STATUS.REVIEWED, REVIEW_STATUS.NOT_REQUIRED].map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* Approve / Return confirmation */}
      <ConfirmDialog
        open={confirmAction !== null}
        title={confirmAction?.mode === 'approve' ? 'Approve technical review' : 'Return requisition'}
        message={
          confirmAction?.mode === 'approve'
            ? `Approve the technical specification review for ${confirmAction?.record?.prNo} and mark it Ready for RFQ?`
            : `Return ${confirmAction?.record?.prNo} to its requester with feedback for changes?`
        }
        confirmLabel={confirmAction?.mode === 'approve' ? 'Approve' : 'Return'}
        variant={confirmAction?.mode === 'approve' ? 'default' : 'warning'}
        icon={confirmAction?.mode === 'approve' ? CheckCircle2 : RotateCcw}
        loading={busy}
        onConfirm={runConfirm}
        onCancel={() => !busy && setConfirmAction(null)}
      />
    </PurchaseListPage>
  );
}
