/**
 * purchase/pages/requisition/PurchaseRequisitionList.jsx
 * ------------------------------------------------------------------
 * Purchase Requisition list — a fully self-contained Purchase module
 * page. It renders KPI cards, lifecycle tabs, search, filters, bulk
 * actions, the requisition table and pagination over the Purchase
 * module's own requisition service (usePurchaseRequests +
 * requisitionService). It is fully self-contained within the Purchase
 * module — no cross-module imports and no cross-module references; the
 * breadcrumb is Dashboard > Purchase > Purchase Requisition.
 *
 * The page is the MASTER design of the Purchase module and renders
 * through the shared PurchaseListPage composed layout (header, error
 * banner, KPI cards, All Requisitions tab + Active/Archived
 * segmented control, toolbar, filter panel, bulk action bar, table and
 * pagination) — the exact structure every other Purchase list page
 * reuses. All business logic (data hook, handlers, row actions, empty
 * states) lives here; only the shared UI/layout comes from the
 * component.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, CheckCircle2, ClipboardList, Clock3,
  Copy, Download, Eye, Filter, IndianRupee, Layers, Pencil, Plus,
  Printer, RefreshCw, Search, Trash2, X, XCircle
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import {
  DEPARTMENTS, PR_APPROVED_GROUP, PR_COLUMNS, PR_RFQ_ELIGIBLE, PR_STATUS, PR_STATUSES, PRIORITIES, PROJECTS, USERS, VENDORS
} from '../../constants';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { formatAmount } from '../../utils/purchase';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { requisitionService } from '../../services/requisition';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import { canApproveRequisitions } from '../../utils/access';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseRequests from '../../hooks/usePurchaseRequests';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

/** Priority → chip class. */
const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

/**
 * KPI cards rendered above the table.
 * `color` drives the icon tint; `bg` is the soft icon-tile wash.
 */
const KPI_CARDS = [
  { key: 'total', label: 'Total Requisitions', icon: ClipboardList, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pendingApproval', label: 'Pending Approval', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  /* Converted to RFQ = green (successful transition — matches the badge). */
  { key: 'converted', label: 'Converted to RFQ', icon: Layers, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'totalValue', label: 'Total Value', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', currency: true }
];

/** KPI key → requisition status filter. The "Approved" card filters by
    every approved-stage status (legacy Approved, Technical Specification
    Review, Ready for RFQ) — the mock service accepts an array. */
const STATUS_FILTER_MAP = {
  pendingApproval: PR_STATUS.PENDING_APPROVAL,
  approved: PR_APPROVED_GROUP,
  rejected: PR_STATUS.REJECTED,
  converted: PR_STATUS.CONVERTED
};

const FILTER_KEYS = ['department', 'requester', 'vendor', 'status', 'priority', 'project', 'dateFrom', 'dateTo'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function PurchaseRequisitionList() {
  const navigate = useNavigate();
  /* Create is its own permission: the backend refuses POST /requisitions too, so
     hiding the control is only the convenience half of the gate. */
  const { can } = usePurchaseAccess();
  const canCreate = can('requisition', 'create');
  const toast = useToast();

  const {
    requests, loading, actionLoading, error,
    pagination: { page, pageSize, totalCount },
    search, sortKey, sortDirection, tab, setTab, filters,
    setSearch, setFilter, resetFilters, goToPage, changePageSize, toggleSort, refresh,
    deleteRequest, bulkDelete, archiveRequest, bulkArchive, duplicateRequest,
    bulkConvertToRfq,
    approveRequest, rejectRequest
  } = usePurchaseRequests();

  /* Role-based access — resolved from the stored session (ADMIN role /
     PURCHASE_REQUISITION_APPROVAL permission), never the display name. */
  const isApprover = useMemo(() => canApproveRequisitions(), []);

  const [columns, setColumns] = useState(() => PR_COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [activeKpi, setActiveKpi] = useState('total');

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Debounced search → hook. */
  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch]);

  /* Stats (KPI cards + tab counts). */
  useEffect(() => {
    let cancelled = false;
    requisitionService
      .getRequisitionStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion, tab]);

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'prNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const refreshPage = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  const selectKpi = (key) => {
    if (key === activeKpi) {
      setActiveKpi('total');
      setFilter('status', 'All');
    } else {
      setActiveKpi(key);
      setFilter('status', STATUS_FILTER_MAP[key] || 'All');
    }
    setSelectedIds([]);
  };

  /* Primary tab — the full Active list. */
  const primaryTab = { label: 'All Requisitions', count: stats?.tabs?.active ?? 0 };

  const goActive = () => {
    setActiveKpi('total');
    setFilter('status', 'All');
    setTab('active');
    setSelectedIds([]);
    setSearchInput('');
  };

  const kpiCards = KPI_CARDS.map((card) => ({
    ...card,
    value: card.currency ? formatAmount(stats?.[card.key] ?? 0) : String(stats?.[card.key] ?? 0)
  }));

  const tabs = [
    { key: 'draft', label: 'Draft', count: stats?.draft ?? 0, status: PR_STATUS.DRAFT },
    { key: 'pending', label: 'Pending Approval', count: stats?.pendingApproval ?? 0, status: PR_STATUS.PENDING_APPROVAL },
    { key: 'approved', label: 'Approved', count: stats?.approved ?? 0, status: PR_APPROVED_GROUP },
    { key: 'converted', label: 'Converted to RFQ', count: stats?.converted ?? 0, status: PR_STATUS.CONVERTED },
    { key: 'rejected', label: 'Rejected', count: stats?.rejected ?? 0, status: PR_STATUS.REJECTED },
    { key: 'archived', label: 'Archived', count: stats?.tabs?.archived ?? 0 }
  ];

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const buildRowActions = (row) => {
    /* A Pending Approval PR shows only approval-stage actions for an
       authorised approver — workflow actions like Convert to RFQ appear
       only after the PR has passed approval. */
    if (isApprover && row?.status === PR_STATUS.PENDING_APPROVAL) {
      return [
        { key: 'view', label: 'View', icon: Eye },
        { key: 'approve', label: 'Approve', icon: CheckCircle2 },
        { key: 'reject', label: 'Reject', icon: XCircle, danger: true }
      ];
    }
    return tab === 'active'
      ? [
          { key: 'view', label: 'View', icon: Eye },
          { key: 'edit', label: 'Edit', icon: Pencil },
          { key: 'duplicate', label: 'Duplicate', icon: Copy },
          { key: 'print', label: 'Print', icon: Printer },
          { divider: true },
          { key: 'archive', label: 'Archive', icon: Archive },
          { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
        ]
      : [
          { key: 'view', label: 'View', icon: Eye },
          { key: 'duplicate', label: 'Duplicate', icon: Copy },
          { key: 'print', label: 'Print', icon: Printer },
          { divider: true },
          { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
        ];
  };

  const handleRowAction = async (key, row) => {
    if (key === 'view') navigate(`/purchase/requisition/${row.id}`);
    else if (key === 'edit') navigate(`/purchase/requisition/${row.id}/edit`);
    else if (key === 'print') navigate(`/purchase/requisition/${row.id}/print`);
    else if (key === 'approve') {
      const result = await approveRequest(row.id, 'Approved by the authorised approver');
      if (result.ok) {
        toast.success(`${row.prNo} approved — moved to Technical Specification Review`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to approve requisition');
    } else if (key === 'reject') {
      const result = await rejectRequest(row.id, 'Rejected by the authorised approver');
      if (result.ok) {
        toast.success(`${row.prNo} rejected`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to reject requisition');
    } else if (key === 'duplicate') {
      const result = await duplicateRequest(row.id);
      if (result.ok) {
        toast.success(`${result.data.prNo} created as a copy`);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to duplicate requisition');
    } else if (key === 'archive') {
      const result = await archiveRequest(row.id);
      if (result.ok) toast.success(`${row.prNo} archived`);
      else toast.error(result.error?.message || 'Failed to archive requisition');
    } else if (key === 'delete') {
      setPendingDelete({ id: row.id, prNo: row.prNo });
      setDeleteOpen(true);
    }
  };

  const fetchAll = () =>
    requisitionService
      .getRequisitions({
        search,
        tab,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All',
        department: filters.department && filters.department !== 'All' ? filters.department : 'All',
        requester: filters.requester && filters.requester !== 'All' ? filters.requester : 'All',
        vendor: filters.vendor && filters.vendor !== 'All' ? filters.vendor : 'All',
        priority: filters.priority && filters.priority !== 'All' ? filters.priority : 'All',
        project: filters.project && filters.project !== 'All' ? filters.project : 'All',
        dateFrom: filters.dateFrom || '',
        dateTo: filters.dateTo || '',
        page: 1,
        pageSize: 10000
      })
      .then((result) => result.data);

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'Purchase Requisitions', columns, records: rows, filename: 'purchase-requisitions' });
      else if (type === 'excel') await exportExcel(columns, rows, 'purchase-requisitions');
      else if (type === 'csv') exportCsv(columns, rows, 'purchase-requisitions');
      else if (type === 'print') printTable('Purchase Requisitions', columns, rows);
      toast.success('Requisitions exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export requisitions');
    }
  };

  const handleBulk = async (key, ids) => {
    if (key === 'delete') {
      setPendingDelete({ bulk: ids });
      setDeleteOpen(true);
      return;
    }
    if (key === 'archive') {
      const result = await bulkArchive(ids);
      if (result.ok) {
        toast.success(`${ids.length} requisition(s) archived`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to archive requisitions');
    } else if (key === 'convert') {
      /* Only Ready-for-RFQ / Approved PRs can be converted — a mixed
         selection still works. */
      const eligible = requests.filter((row) => ids.includes(row.id) && PR_RFQ_ELIGIBLE.includes(row.status));
      if (eligible.length === 0) {
        toast.info('None of the selected requisitions are approved');
        return;
      }
      const result = await bulkConvertToRfq(eligible.map((row) => row.id));
      if (result.ok) {
        const { created = [], errors = [] } = result.data || {};
        if (created.length > 0) {
          toast.success(`${created.length} RFQ(s) created from approved requisitions`);
          setStatsVersion((v) => v + 1);
        }
        if (errors.length > 0) {
          toast.error(errors.map((err) => err.error || 'Conversion failed').join(' · '));
        }
        setSelectedIds([]);
      } else {
        toast.error(result.error?.message || 'Failed to convert requisitions to RFQ');
      }
    } else if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No requisitions selected to export');
          return;
        }
        exportCsv(columns, selected, 'purchase-requisitions-selected');
        toast.success(`${selected.length} requisition(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export requisitions');
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.bulk) {
      const result = await bulkDelete(pendingDelete.bulk);
      if (result.ok) {
        /* The backend record lifecycle soft-deletes (recordState =
           deleted); the records are kept in trash, never destroyed. */
        toast.success(`${pendingDelete.bulk.length} requisition(s) moved to trash`);
      } else toast.error(result.error?.message || 'Failed to delete requisitions');
    } else {
      const result = await deleteRequest(pendingDelete.id);
      if (result.ok) toast.success(`${pendingDelete.prNo} moved to trash`);
      else toast.error(result.error?.message || 'Failed to delete requisition');
    }
    setDeleteOpen(false);
    setPendingDelete(null);
    /* The mutation hook has already reloaded the list with the active
       filters, so the removed row cannot linger. Keep the user's current
       search, filters, KPI and tab instead of resetting the whole view
       (and firing a second list request) after every delete. */
    setStatsVersion((v) => v + 1);
  };

  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilter(key, key.includes('date') ? value : value || 'All');
    });
    setSelectedIds([]);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    resetFilters();
    setSearchInput('');
    setSelectedIds([]);
    setActiveKpi('total');
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

  const activeFilterCount = FILTER_KEYS.filter((key) => {
    if (key === 'status') {
      const val = filters.status;
      return val && val !== 'All' && !(Array.isArray(val) && val.length === 0);
    }
    return filters[key] && filters[key] !== 'All';
  }).length;

  const bulkActions = useMemo(() => {
    const actions = [{ key: 'export', label: 'Export', icon: Download }];
    if (tab === 'active') {
      actions.unshift({ key: 'convert', label: 'Convert to RFQ', icon: Layers });
      actions.push({ key: 'archive', label: 'Archive', icon: Archive });
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    } else {
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return actions;
  }, [tab]);

  const renderCell = useMemo(
    () => ({
      prNo: (row) => (
        <a
          href={`/purchase/requisition/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/requisition/${row.id}`);
          }}
        >
          {row.prNo}
        </a>
      ),
      department: (row) => <span className="cpr-cell-truncate">{row.department || '—'}</span>,
      project: (row) => (
        <span className="cpr-cell-truncate" title={row.project}>{row.project || '—'}</span>
      ),
      requester: (row) => <span className="cpr-cell-truncate">{row.requester || '—'}</span>,
      vendor: (row) => <span className="cpr-cell-truncate">{row.vendor || '—'}</span>,
      priority: (row) => (
        <span className={`cpr-priority ${PRIORITY_CLASS[row.priority] || PRIORITY_CLASS.Medium}`}>
          {row.priority || 'Medium'}
        </span>
      ),
      status: (row) => {
        const label = tab === 'active' ? row.status || 'Draft' : 'Archived';
        return <PurchaseStatusCell status={label} />;
      },
      date: (row) => <span className="cpr-cell-muted">{formatDate(row.date) || '—'}</span>,
      expectedDate: (row) => (
        <span className="cpr-cell-muted">{row.expectedDate ? formatDate(row.expectedDate) : '—'}</span>
      ),
      amount: (row) => <span className="cpr-amount">{formatAmount(row.amount, row.currency)}</span>
    }),
    [navigate, tab]
  );

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = requests.length > 0 && requests.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <PurchaseListPage
      header={{
        crumb: 'Purchase Requisition',
        icon: ClipboardList,
        title: 'Purchase Requisitions',
        subtitle: 'Create, track and approve material and service purchase requests.',
        actions: canCreate ? (
          <button
            type="button"
            className="erp-btn-primary"
            onClick={() => navigate('/purchase/requisition/new')}
          >
            <span className="erp-btn-icon"><Plus size={16} /></span> Create Purchase Requisition
          </button>
        ) : null
      }}
      flowNav={<ModuleTabNav module="requisition" />}
      error={error}
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { ...primaryTab, onSelect: goActive },
        segments: {
          tabs,
          activeKey: tab === 'active' && filters.status && filters.status !== 'All'
            ? tabs.find((t) => t.status && JSON.stringify(t.status) === JSON.stringify(filters.status))?.key || null
            : tab === 'archived' ? 'archived'
            : null,
          onSelect: (key) => {
            const selectedTab = tabs.find((t) => t.key === key);
            setActiveKpi('total');
            if (selectedTab?.status) {
              /* Workflow status tab — filter within active records. */
              setTab('active');
              setFilter('status', selectedTab.status);
            } else if (key === 'archived') {
              setTab('archived');
              setFilter('status', 'All');
            } else {
              /* 'all' — reset to full active list. */
              setTab('active');
              setFilter('status', 'All');
            }
            setSelectedIds([]);
          },
          ariaLabel: 'Requisition lifecycle'
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
              id="prSearchInput"
              placeholder="Search PR Number, Title, Requester..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Requisitions"
            />
            <PurchaseExportDropdown buttonLabel="Export Requisitions" onExport={handleExport} />
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
        panelId: 'filterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'department', id: 'prl-dept', label: 'Department', value: draftFilters.department || 'All',
            options: [{ value: 'All', label: 'All Departments' }, ...DEPARTMENTS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, department: v }))
          },
          {
            key: 'requester', id: 'prl-requester', label: 'Requester', value: draftFilters.requester || 'All',
            options: [{ value: 'All', label: 'All Requesters' }, ...USERS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, requester: v }))
          },
          {
            key: 'vendor', id: 'prl-vendor', label: 'Vendor', value: draftFilters.vendor || 'All',
            options: [{ value: 'All', label: 'All Vendors' }, ...VENDORS.map((vendor) => ({ value: vendor.name, label: vendor.name }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, vendor: v }))
          },
          {
            key: 'status', id: 'prl-status', label: 'Status', value: draftFilters.status || 'All',
            options: [{ value: 'All', label: 'All Status' }, ...PR_STATUSES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, status: v }))
          },
          {
            key: 'priority', id: 'prl-priority', label: 'Priority', value: draftFilters.priority || 'All',
            options: [{ value: 'All', label: 'All Priorities' }, ...PRIORITIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, priority: v }))
          },
          {
            key: 'project', id: 'prl-project', label: 'Project', value: draftFilters.project || 'All',
            options: [{ value: 'All', label: 'All Projects' }, ...PROJECTS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, project: v }))
          },
          {
            key: 'dateFrom', id: 'prl-date-from', label: 'Date From', type: 'date', value: draftFilters.dateFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v }))
          },
          {
            key: 'dateTo', id: 'prl-date-to', label: 'Date To', type: 'date', value: draftFilters.dateTo || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateTo: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'bulkActionBar'
      }}
      table={{
        columns: visibleColumns,
        rows: requests,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? requests.map((row) => row.id) : []),
        onToggleRow: (id) =>
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers: renderCell,
        /* Rows in the canonical Pending Approval state get a very subtle
           warning-orange wash on the LEFT selection + PR-number cells only
           (the shared .is-pending-work highlight in cpr-list.css — the
           reference style for the whole module). Everything else in the
           row stays untouched. */
        rowClass: (row) => pendingWorkClass(row.status === PR_STATUS.PENDING_APPROVAL),
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        idColumn: 'prNo',
        tableId: 'prTable',
        getRowId: (row) => row.id,
        emptyContent: (
          tab === 'archived' ? (
            <div className="cpr-empty">
              <Archive size={48} aria-hidden="true" />
              <h3>No Archived Requisitions</h3>
              <p>{hasFilters ? 'No archived requisitions matching your search criteria.' : 'Archived requisitions will appear here.'}</p>
            </div>
          ) : hasFilters ? (
            <div className="cpr-empty">
              <Search size={48} aria-hidden="true" />
              <h3>No Purchase Requisitions Found</h3>
              <p>No requisitions matching your search criteria.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear Filters
              </button>
            </div>
          ) : (
            <div className="cpr-empty">
              <ClipboardList size={48} aria-hidden="true" />
              <h3>No Purchase Requisitions Found</h3>
              <p>Create a purchase requisition to begin the procurement process.</p>
              {canCreate && (
                <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/requisition/new')}>
                  <span className="erp-btn-icon"><Plus size={16} /></span> Create Purchase Requisition
                </button>
              )}
            </div>
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
      {/* ===== DELETE CONFIRM ===== */}
      <ConfirmDialog
        open={deleteOpen}
        title={pendingDelete?.bulk ? 'Move selected requisition(s) to trash?' : 'Move requisition to trash?'}
        message={
          pendingDelete?.bulk
            ? `${pendingDelete.bulk.length} selected requisition(s) will be removed from the active list and moved to trash. The records are kept and can be restored.`
            : `${pendingDelete?.prNo || 'This requisition'} will be removed from the active list and moved to trash. The record is kept and can be restored.`
        }
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setPendingDelete(null);
        }}
      />
    </PurchaseListPage>
  );
}
