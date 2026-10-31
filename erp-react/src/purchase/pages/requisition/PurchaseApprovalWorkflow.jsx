/**
 * purchase/pages/requisition/PurchaseApprovalWorkflow.jsx
 * ------------------------------------------------------------------
 * PR Approval Center — converted onto the Purchase Requisition List
 * design system (the MASTER UI). Uses ONLY the shared Purchase list
 * components (PurchasePageLayout, PurchaseHeader cpr variant,
 * PurchaseKpiCards, PurchaseSegmentedTabs, PurchaseToolbar, PurchaseSearch,
 * PurchaseFilters, PurchaseExportDropdown, PurchaseColumnsDropdown,
 * PurchaseTable, PurchasePagination, PurchaseEmptyState,
 * PurchaseStatusBadge) and the shared cpr styles — no page-specific
 * table/toolbar CSS and no duplicated components.
 *
 * Approval-specific surface only: the ApprovalDrawer (quick details)
 * and the ApprovalDecisionDialog (approve / reject / return with
 * comment, signature, attachment). Row actions (View · Quick Details ·
 * Approve · Reject · Return) live in the shared three-dot menu, exactly
 * like the master list and the Technical Spec Review queue. All
 * mutations flow through the existing requisitionService.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock, Download, Eye, FileText,
  Filter, IndianRupee, RefreshCw, RotateCcw, Search, X, XCircle
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown, PurchaseEmptyState,
  PurchaseStatusCell
} from '../../components/list';
import ApprovalDrawer from '../../components/approval/ApprovalDrawer';
import ApprovalDecisionDialog from '../../components/approval/ApprovalDecisionDialog';
import { decorateRecord } from '../../components/approval/approvalDecorators';
import { requisitionService } from '../../services/requisition';
import { PR_STATUS } from '../../constants';
import { formatAmountConverted } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';
import '../../styles/approval-center.css';

/* ============================== CONSTANTS ============================== */

/* "All Approvals" header tab key — selects every approval record by
   clearing the workflow status filter (distinct from Pending). */
const ALL_APPROVALS = 'ALL';

/* The three actionable statuses — shown as a shared segmented pill
   control (Pending is the default selected tab). The "Approved" tab
   groups every approved-stage status: legacy Approved, Technical
   Specification Review (in the queue), and Ready for RFQ. */
const APPROVED_GROUP = [PR_STATUS.APPROVED, PR_STATUS.TECHNICAL_REVIEW, PR_STATUS.READY_FOR_RFQ];

const STATUS_TABS = [
  { key: PR_STATUS.PENDING_APPROVAL, label: 'Pending' },
  { key: PR_STATUS.APPROVED, label: 'Approved' },
  { key: PR_STATUS.REJECTED, label: 'Rejected' }
];

/* Focused KPI set — enterprise dashboard cards (icon tile + value +
   label + subtitle). lucide stand-ins for the MUI spec icons:
   Schedule→Clock · CheckCircle→CheckCircle2 · PriorityHigh→AlertTriangle ·
   CurrencyRupee→IndianRupee. */
const KPI_DEFS = [
  { key: 'pendingApproval', label: 'Pending Approval', sub: 'Waiting for Approval', icon: Clock, color: '#ea580c', bg: 'rgba(249,115,22,0.12)' },
  { key: 'approvedToday', label: 'Approved Today', sub: 'Approved Today', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.12)' },
  { key: 'highPriority', label: 'High Priority', sub: 'Requires Immediate Action', icon: AlertTriangle, color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  { key: 'pendingValue', label: 'Total Pending Value', sub: 'Pending Purchase Value', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' }
];

/* Lean column set — everything else lives in the approval drawer. Widths
   follow the Vendor List scale so the table reads identically. */
const COLUMN_DEFS = [
  { key: 'prNo', label: 'PR No', width: 120, sortable: true, locked: true },
  { key: 'title', label: 'Requisition', width: 220, sortable: true },
  { key: 'department', label: 'Department', width: 140, sortable: true },
  { key: 'vendor', label: 'Vendor', width: 180, sortable: true },
  { key: 'priority', label: 'Priority', width: 105, sortable: true, align: 'center' },
  { key: 'status', label: 'Approval Status', width: 150, sortable: true, align: 'center' },
  { key: 'requiredDate', label: 'Required Date', width: 130, sortable: true },
  { key: 'amount', label: 'Amount', width: 130, sortable: true, align: 'right' }
];

const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const FILTER_KEYS = ['priority', 'department', 'requiredFrom'];

/* ============================ SORT / FORMAT ============================ */

function sortValue(record, key) {
  if (key === 'amount') return Number(record.amount) || 0;
  if (key === 'requiredDate') return new Date(record.requiredDate || 0).getTime();
  return String(record[key] == null ? '' : record[key]).toLowerCase();
}

/* ============================== PAGE ============================== */

export default function PurchaseApprovalWorkflow() {
  const navigate = useNavigate();
  const toast = useToast();

  const [allRecords, setAllRecords] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [columns, setColumns] = useState(() => COLUMN_DEFS.map((col) => ({ ...col })));

  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState(() => ({}));
  const [draftFilters, setDraftFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [kpiActive, setKpiActive] = useState(null);

  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedIds, setSelectedIds] = useState([]);
  const [drawerId, setDrawerId] = useState(null);
  const [decision, setDecision] = useState(null);
  const [decisionKey, setDecisionKey] = useState(0);
  const [bulkConfirm, setBulkConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const [activeTab, setActiveTab] = useState(ALL_APPROVALS);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      requisitionService.getRequisitions({ page: 1, pageSize: 1000 }),
      requisitionService.getRequisitionStats()
    ])
      .then(([list, statsData]) => {
        if (cancelled) return;
        setAllRecords(list.data.map(decorateRecord));
        setStats(statsData);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    setLoading(true);
    try {
      const [list, statsData] = await Promise.all([
        requisitionService.getRequisitions({ page: 1, pageSize: 1000 }),
        requisitionService.getRequisitionStats()
      ]);
      setAllRecords(list.data.map(decorateRecord));
      setStats(statsData);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------ Columns ------------------------------ */
  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => ({ ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.locked ? col : { ...col, visible: false })));

  /* ------------------------------ KPI values ------------------------------ */
  const kpiValues = useMemo(() => {
    const pending = allRecords.filter((r) => r.status === PR_STATUS.PENDING_APPROVAL);
    return {
      pendingApproval: pending.length,
      approvedToday: allRecords.filter((r) =>
        (r.activity || []).some((e) => e.type === 'approve' && new Date(e.timestamp).toDateString() === new Date().toDateString())
      ).length,
      highPriority: pending.filter((r) => r.priority === 'High' || r.priority === 'Critical').length,
      pendingValue: formatAmountConverted(pending.reduce((sum, r) => sum + (Number(r.amount) || 0), 0), '')
    };
  }, [allRecords]);

  const kpiCards = KPI_DEFS.map((def) => ({
    ...def,
    value: String(kpiValues[def.key])
  }));

  /* Distinct departments for the filter drawer. */
  const departmentOptions = useMemo(() => {
    const set = new Set(allRecords.map((r) => r.department).filter(Boolean));
    return [...set].sort();
  }, [allRecords]);

  /* ------------------------------ Filtering ------------------------------ */
  const filtered = useMemo(() => {
    const kpiMatch = (record) => {
      if (kpiActive === 'pendingApproval' || kpiActive === 'pendingValue') {
        return record.status === PR_STATUS.PENDING_APPROVAL;
      }
      if (kpiActive === 'approvedToday') {
        return (record.activity || []).some((e) =>
          e.type === 'approve' && new Date(e.timestamp).toDateString() === new Date().toDateString()
        );
      }
      if (kpiActive === 'highPriority') {
        return record.status === PR_STATUS.PENDING_APPROVAL &&
          (record.priority === 'High' || record.priority === 'Critical');
      }
      return true;
    };

    const query = searchInput.trim().toLowerCase();

    return allRecords.filter((record) => {
      if (!kpiMatch(record)) return false;

      if (!kpiActive && filters.status) {
        const allowed = filters.status === PR_STATUS.APPROVED ? APPROVED_GROUP : [filters.status];
        if (!allowed.includes(record.status)) return false;
      }

      if (query) {
        const haystack = [
          record.prNo, record.title, record.vendor, record.requester,
          record.department, record.project, record.buyer
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }

      if (filters.department && record.department !== filters.department) return false;
      if (filters.priority && record.priority !== filters.priority) return false;
      if (filters.requiredFrom && record.requiredDate && record.requiredDate < filters.requiredFrom) return false;

      return true;
    });
  }, [allRecords, searchInput, filters, kpiActive]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av === bv) return 0;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDirection === 'asc' ? av - bv : bv - av;
      }
      return sortDirection === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const pageInfo = `Showing ${sorted.length > 0 ? (safePage - 1) * pageSize + 1 : 0}-${Math.min(safePage * pageSize, sorted.length)} of ${sorted.length}`;

  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key] && filters[key] !== '').length;
  const hasFilters = Boolean(searchInput.trim()) || activeFilterCount > 0;

  /* ------------------------------ Actions ------------------------------ */
  const handleKpiClick = (key) => {
    setKpiActive((prev) => (prev === key ? null : key));
    setPage(1);
  };

  const handleTabChange = (key) => {
    setActiveTab(key);
    setKpiActive(null);
    setFilters((prev) => ({ ...prev, status: key }));
    setPage(1);
  };

  /* "All Approvals" header tab — selects EVERY approval record by
     clearing the workflow status filter entirely (no status predicate). */
  const goAllApprovals = () => {
    setActiveTab(ALL_APPROVALS);
    setKpiActive(null);
    setFilters((prev) => {
      const next = { ...prev };
      delete next.status;
      return next;
    });
    setSelectedIds([]);
    setPage(1);
  };

  const toggleFilters = () => {
    const next = !filterOpen;
    if (next) {
      setDraftFilters(
        FILTER_KEYS.reduce((acc, key) => {
          const value = filters[key];
          if (value && value !== '') acc[key] = value;
          return acc;
        }, {})
      );
    }
    setFilterOpen(next);
  };

  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilters((prev) => {
        const next = { ...prev };
        if (value === '') delete next[key];
        else next[key] = value;
        return next;
      });
    });
    setPage(1);
    setFilterOpen(false);
  };

  const clearAll = () => {
    setDraftFilters({});
    setFilters({});
    setKpiActive(null);
    setSearchInput('');
    setActiveTab(ALL_APPROVALS);
    setPage(1);
  };

  const runDecision = async (payload) => {
    setBusy(true);
    try {
      const { action, record, comment } = payload;
      if (action === 'approve') await requisitionService.approveRequisition(record.id, comment || 'Approved');
      else await requisitionService.rejectRequisition(record.id, comment || 'Rejected');
      toast.success(
        action === 'approve' ? `${record.prNo} approved` : `${record.prNo} rejected`
      );
      setDecision(null);
      setSelectedIds((ids) => ids.filter((id) => id !== record.id));
      await reload();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const handleBulkAction = (key, ids) => {
    if (key === 'approve') setBulkConfirm({ key, ids, label: 'Approve', variant: 'default' });
    else if (key === 'reject') setBulkConfirm({ key, ids, label: 'Reject', variant: 'danger' });
    else if (key === 'export') exportCsv(COLUMN_DEFS, filtered, 'pr-approval');
  };

  const confirmBulk = async () => {
    if (!bulkConfirm) return;
    setBusy(true);
    try {
      const { key, ids } = bulkConfirm;
      const ops = ids.map((id) =>
        key === 'approve' ? requisitionService.approveRequisition(id, 'Approved in bulk')
          : requisitionService.rejectRequisition(id, 'Rejected in bulk')
      );
      await Promise.all(ops);
      toast.success(`${ids.length} requisition(s) ${key === 'approve' ? 'approved' : 'rejected'}`);
      setBulkConfirm(null);
      setSelectedIds([]);
      await reload();
    } catch (err) {
      toast.error(err?.message || 'Bulk action failed');
    } finally {
      setBusy(false);
    }
  };

  const runExport = async (format) => {
    if (format === 'csv') exportCsv(COLUMN_DEFS, filtered, 'pr-approval');
    else if (format === 'excel') await exportExcel(COLUMN_DEFS, filtered, 'pr-approval');
    else if (format === 'print') printTable('PR Approval Queue', COLUMN_DEFS, filtered);
    else if (format === 'pdf') {
      setBusy(true);
      try {
        await exportPdf({
          title: 'PR Approval Queue',
          filename: 'pr-approval',
          meta: [
            ['Module', 'Purchase Requisition Approval'],
            ['Generated', new Date().toLocaleString('en-GB')],
            ['Records', String(filtered.length)]
          ],
          columns: COLUMN_DEFS,
          records: filtered
        });
      } finally {
        setBusy(false);
      }
    }
  };

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  /* ------------------------------ Row actions ------------------------------ */
  const buildRowActions = (row) => {
    const actions = [
      { key: 'view', label: 'View', icon: Eye },
      { key: 'details', label: 'Quick Details', icon: FileText }
    ];
    if (row.status === PR_STATUS.PENDING_APPROVAL) {
      actions.push({ divider: true });
      actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
      actions.push({ key: 'reject', label: 'Reject', icon: XCircle, danger: true });
    }
    return actions;
  };

  const handleRowAction = (key, row) => {
    if (key === 'view') navigate(`/purchase/requisition/${row.id}`);
    else if (key === 'details') setDrawerId(row.id);
    else if (key === 'approve' || key === 'reject') {
      setDecision({ mode: key, record: row });
      setDecisionKey((k) => k + 1);
    }
  };

  const toggleRow = (id) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const renderers = useMemo(
    () => ({
      prNo: (row) => (
        <a href={`/purchase/requisition/${row.id}`} onClick={(e) => { e.preventDefault(); navigate(`/purchase/requisition/${row.id}`); }}>
          {row.prNo}
        </a>
      ),
      title: (row) => <span className="cpr-cell-truncate" title={row.title}>{row.title || '—'}</span>,
      department: (row) => <span className="cpr-cell-truncate">{row.department || '—'}</span>,
      vendor: (row) => <span className="cpr-cell-truncate" title={row.vendor}>{row.vendor || '—'}</span>,
      priority: (row) => (
        <span className={`cpr-priority ${PRIORITY_CLASS[row.priority] || PRIORITY_CLASS.Medium}`}>
          {row.priority || 'Medium'}
        </span>
      ),
      status: (row) => <PurchaseStatusCell status={row.status || 'Draft'} />,
      requiredDate: (row) => (
        <span className="cpr-cell-muted">{row.requiredDate ? formatDate(row.requiredDate) : '—'}</span>
      ),
      amount: (row) => (
        <span className="cpr-amount">{formatAmountConverted(row.amount, row.currency)}</span>
      )
    }),
    [navigate]
  );

  const drawerRecord = allRecords.find((r) => r.id === drawerId) || null;
  const allSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const bulkActions = [
    { key: 'approve', label: 'Approve', icon: CheckCircle2 },
    { key: 'reject', label: 'Reject', icon: XCircle, danger: true },
    { key: 'export', label: 'Export', icon: Download }
  ];

  /* ------------------------------ Render ------------------------------ */
  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Purchase Requisition', to: '/purchase/requisition' },
          { label: 'PR Approval Center' }
        ],
        icon: ClipboardList,
        title: 'PR Approval Center'
      }}
      error={error}
      onRetry={reload}
      kpis={{
        cards: kpiCards,
        loading,
        gridClass: 'ac-kpi-grid',
        activeKey: kpiActive,
        onSelect: handleKpiClick
      }}
      tabs={{
        /* ALL APPROVALS HEADER TAB — mirrors the master list's
           "All Requisitions" header (same pr-tabs / pr-tab client-tab /
           tab-count markup and classes). Active when selected; when it
           is, no segmented status tab is highlighted. */
        primary: {
          label: 'All Approvals',
          count: stats?.total ?? 0,
          active: activeTab === ALL_APPROVALS,
          onSelect: goAllApprovals
        },
        segments: {
          tabs: STATUS_TABS.map((tab) => ({
            ...tab,
            count:
              tab.key === PR_STATUS.APPROVED
                ? APPROVED_GROUP.reduce((sum, status) => sum + (stats?.byStatus?.[status] ?? 0), 0)
                : stats?.byStatus?.[tab.key] ?? 0
          })),
          activeKey: activeTab,
          onSelect: handleTabChange,
          ariaLabel: 'Approval status'
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
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={reload}>
              <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="acSearchInput"
              placeholder="Search PR Number, Title, Requester..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search approvals"
            />
            <PurchaseExportDropdown buttonLabel="Export Approvals" onExport={runExport} />
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
        open: filterOpen,
        panelId: 'acFilterPanel',
        onApply: applyFilters,
        onReset: clearAll,
        groups: [
          {
            key: 'priority', id: 'ac-priority', label: 'Priority', value: draftFilters.priority || 'All',
            options: [{ value: 'All', label: 'All Priorities' }, ...['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, priority: v === 'All' ? '' : v }))
          },
          {
            key: 'department', id: 'ac-department', label: 'Department', value: draftFilters.department || 'All',
            options: [{ value: 'All', label: 'All Departments' }, ...departmentOptions.map((dep) => ({ value: dep, label: dep }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, department: v === 'All' ? '' : v }))
          },
          {
            key: 'requiredFrom', id: 'ac-required-from', label: 'Required From', type: 'date', value: draftFilters.requiredFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, requiredFrom: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulkAction(key, selectedIds),
        id: 'bulkActionBar'
      }}
      table={{
        columns: visibleColumns,
        rows: pageRows,
        loading: loading && allRecords.length === 0,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? pageRows.map((row) => row.id) : []),
        onToggleRow: toggleRow,
        sortKey,
        sortDirection,
        onSort: handleSort,
        renderers,
        idColumn: 'prNo',
        tableId: 'acTable',
        /* Pending highlight — the shared light-orange identification
           wash on the checkbox + PR-number cells for requisitions still
           awaiting approval (the same Pending Approval state the PR List
           highlights and the sidebar badge counts); approved / rejected /
           returned rows stay normal. */
        rowClass: (row) => pendingWorkClass(row.status === PR_STATUS.PENDING_APPROVAL),
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        actionMenuLabel: 'Approval actions',
        emptyContent: (
          hasFilters ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Requisitions"
              message="No requisitions matching your search / filters."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearAll}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={ClipboardList}
              title="No Requisitions in Queue"
              message="There are no purchase requisitions waiting for approval."
            />
          )
        )
      }}
      pagination={{
        page: safePage,
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
      {/* ===== DRAWER + DECISION DIALOG + BULK CONFIRM ===== */}
      <ApprovalDrawer
        open={!!drawerRecord}
        record={drawerRecord}
        onClose={() => setDrawerId(null)}
        addBusy={busy}
        onAddComment={async (text) => {
          if (!drawerId) return;
          await requisitionService.addComment(drawerId, text);
          await reload();
          toast.success('Comment added');
        }}
        onDecision={(mode, record) => {
          setDecision({ mode, record });
          setDecisionKey((k) => k + 1);
        }}
      />

      <ApprovalDecisionDialog
        key={decisionKey}
        open={!!decision}
        mode={decision?.mode || 'approve'}
        record={decision?.record || null}
        onClose={() => setDecision(null)}
        onSubmit={runDecision}
        busy={busy}
        submitLabel={
          decision?.mode === 'approve' ? 'Approve'
            : decision?.mode === 'reject' ? 'Reject' : 'Return'
        }
      />

      <ConfirmDialog
        open={!!bulkConfirm}
        title={`${bulkConfirm?.label} ${bulkConfirm?.ids?.length || 0} selected`}
        message={
          bulkConfirm?.key === 'approve'
            ? 'Approve all selected pending requisitions.'
            : bulkConfirm?.key === 'reject'
              ? 'Reject all selected pending requisitions.'
              : 'Return all selected pending requisitions to their requesters.'
        }
        confirmLabel={busy ? 'Applying…' : bulkConfirm?.label}
        variant={bulkConfirm?.variant}
        icon={bulkConfirm?.key === 'approve' ? CheckCircle2 : bulkConfirm?.key === 'reject' ? XCircle : RotateCcw}
        loading={busy}
        onConfirm={confirmBulk}
        onCancel={() => !busy && setBulkConfirm(null)}
      />
    </PurchaseListPage>
  );
}