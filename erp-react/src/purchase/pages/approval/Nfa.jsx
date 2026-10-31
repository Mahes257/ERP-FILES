/**
 * purchase/pages/approval/Nfa.jsx
 * ------------------------------------------------------------------
 * NFA – Note for Approval list — the Approval Flow stage of the
 * purchase workflow. Lists every note raised after Approval Flow
 * with its own approval lifecycle (Draft → Pending Approval →
 * Approved / Rejected) and the master PR list layout (shared
 * PurchaseListPage): KPI cards, an "All NFAs" primary tab with the
 * Active / Archived / Deleted segmented control, search, status
 * filter, export, columns, pagination and row / bulk actions.
 *
 * Route: /purchase/rfq/approval
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArrowLeft, CheckCircle2, ClipboardList, Clock3, Download,
  Eye, FileText, IndianRupee, Plus,  RefreshCw, Search, Send, ShoppingCart, Stamp,
  Trash2, Undo2, X, XCircle
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import { NFA_COLUMNS, NFA_STATUS, NFA_STATUSES } from '../../constants';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { formatAmount } from '../../utils/purchase';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import { nfaService } from '../../services/nfa';
import RfqTabNav from '../../components/RfqTabNav';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseList from '../../hooks/usePurchaseList';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

/** KPI cards rendered above the table. */
const KPI_DEFS = [
  { key: 'total', label: 'Total Notes', icon: ClipboardList, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'draft', label: 'Draft', icon: FileText, color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
  { key: 'firstPending', label: '1st Approval', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'secondPending', label: '2nd Approval', icon: Clock3, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'finalPending', label: 'Final Approval', icon: Stamp, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'totalValue', label: 'Total Value', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', currency: true }
];

/** KPI key → NFA status filter. */
const STATUS_FILTER_MAP = {
  draft: NFA_STATUS.DRAFT,
  firstPending: NFA_STATUS.FIRST_APPROVAL,
  secondPending: NFA_STATUS.SECOND_APPROVAL,
  finalPending: NFA_STATUS.FINAL_APPROVAL,
  approved: NFA_STATUS.APPROVED,
  rejected: NFA_STATUS.REJECTED
};

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function Nfa() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreateNfa = can('nfa', 'create');
  const toast = useToast();

  /* Lifecycle tab — declared BEFORE the fetchPage memo (TDZ-safe, the
     same pattern as the RFQ / evaluation lists). */
  const [tab, setTab] = useState('active');
  const [columns, setColumns] = useState(() => NFA_COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [activeKpi, setActiveKpi] = useState('total');

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) =>
      nfaService.getNfas({
        search,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All',
        recordState: tab,
        page,
        pageSize,
        sortKey,
        sortDirection
      }),
    [tab]
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount },
    search,
    sortKey,
    sortDirection,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10, sortKey: 'raisedAt', sortDir: 'desc' });

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Debounced search → hook (declared AFTER the usePurchaseList
     destructure — setSearch must be initialized before the effect's
     dependency array is evaluated, or the page throws a TDZ
     "Cannot access 'setSearch' before initialization" error). */
  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch]);

  /* Stats (KPI cards + tab counts). */
  useEffect(() => {
    let cancelled = false;
    nfaService
      .getNfaStats()
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
      prev.map((col) => (col.key === 'nfaNo' || col.key === 'actions' ? col : { ...col, visible: false }))
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
  const primaryTab = { label: 'All Notes', count: stats?.total ?? 0 };

  const goActive = () => {
    setActiveKpi('total');
    setFilter('status', 'All');
    setTab('active');
    setSelectedIds([]);
    refresh();
  };

  const kpiCards = KPI_DEFS.map((card) => ({
    ...card,
    value: card.currency ? formatAmount(stats?.[card.key] ?? 0) : String(stats?.[card.key] ?? 0)
  }));

  const tabs = [
    { key: 'active', label: 'Active', count: stats?.active ?? 0 },
    { key: 'archived', label: 'Archived', count: stats?.archived ?? 0 },
    { key: 'deleted', label: 'Deleted', count: stats?.deleted ?? 0 }
  ];

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const buildRowActions = (row) => {
    if (tab !== 'active') {
      return [
        { key: 'view', label: 'View', icon: Eye },
        { key: 'restore', label: 'Restore', icon: Undo2, success: true },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      ];
    }
    const actions = [{ key: 'view', label: 'View', icon: Eye }];
    if (row.status === NFA_STATUS.DRAFT) {
      actions.push({ key: 'submit', label: 'Submit for Approval', icon: Send });
    } else if (row.currentStage) {
      /* Stage in progress → continue the workflow at that stage. */
      actions.push({ key: 'approve', label: `Approve ${row.currentStage}`, icon: CheckCircle2 });
      actions.push({ key: 'reject', label: `Reject ${row.currentStage}`, icon: XCircle, danger: true });
    } else if (row.status === NFA_STATUS.APPROVED) {
      /* Fully approved → the next step is raising the Purchase Order
         with the approved line items (nfaService.preparePoConversion).
         Once a PO has actually been raised the action switches to
         opening that PO — the award is never converted twice. */
      actions.push(row.poNo
        ? { key: 'viewPo', label: 'View Purchase Order', icon: ShoppingCart }
        : { key: 'convertPo', label: 'Convert to Purchase Order', icon: ShoppingCart });
    }
    actions.push({ divider: true });
    actions.push({ key: 'archive', label: 'Archive', icon: Archive });
    actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    return actions;
  };

  const handleRowAction = async (key, row) => {
    if (key === 'view') {
      navigate(`/purchase/rfq/approval/${row.id}`);
    } else if (key === 'submit') {
      const result = await runMutation(() => nfaService.submitNfa(row.id));
      if (result.ok) {
        toast.success(`${row.nfaNo} submitted for approval`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to submit note');
    } else if (key === 'approve') {
      const result = await runMutation(() => nfaService.approveStage(row.id, { stage: row.currentStage }));
      if (result.ok) {
        toast.success(`${row.nfaNo} — ${row.currentStage} stage approved`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to approve note');
    } else if (key === 'reject') {
      const result = await runMutation(() => nfaService.rejectStage(row.id, { stage: row.currentStage }));
      if (result.ok) {
        toast.success(`${row.nfaNo} — ${row.currentStage} stage rejected`);
        setStatsVersion((v) => v + 1);
        setSelectedIds((prev) => prev.filter((id) => id !== row.id));
      } else toast.error(result.error?.message || 'Failed to reject note');
    } else if (key === 'viewPo') {
      /* The note was already converted — open its raised PO directly. */
      navigate(`/purchase/orders/${row.poNo}`);
    } else if (key === 'convertPo') {
      /* Same service-side conversion NfaDetail uses: derive the PO
         pre-fill from the approved note's RFQ → quotation → selection
         data and open the PO create form with it. When the award was
         already converted (a PO exists for the note's RFQ + supplier),
         no second PO is ever raised — the existing PO is opened. */
      try {
        const result = await nfaService.preparePoConversion(row.id);
        if (result.existing) {
          toast.info(`${row.nfaNo} is already converted — opening ${result.existing.poNo}`);
          navigate(`/purchase/orders/${result.existing.id}`);
        } else {
          navigate('/purchase/orders/new', { state: { poPrefill: result.prefill } });
        }
      } catch (err) {
        toast.error(err?.message || 'Could not prepare the purchase order');
      }
    } else if (key === 'archive') {
      const result = await runMutation(() => nfaService.archiveNfa(row.id));
      if (result.ok) toast.success(`${row.nfaNo} archived`);
      else toast.error(result.error?.message || 'Failed to archive note');
    } else if (key === 'restore') {
      const result = await runMutation(() => nfaService.restoreNfa(row.id));
      if (result.ok) toast.success(`${row.nfaNo} restored to active`);
      else toast.error(result.error?.message || 'Failed to restore note');
    } else if (key === 'delete') {
      setPendingDelete({ id: row.id, nfaNo: row.nfaNo });
      setDeleteOpen(true);
    }
  };

  const fetchAll = () =>
    nfaService
      .getNfas({
        search,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All',
        recordState: tab,
        page: 1,
        pageSize: 10000
      })
      .then((result) => result.data);

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'NFA – Notes for Approval', columns, records: rows, filename: 'nfa-notes' });
      else if (type === 'excel') await exportExcel(columns, rows, 'nfa-notes');
      else if (type === 'csv') exportCsv(columns, rows, 'nfa-notes');
      else if (type === 'print') printTable('Approval Flow', columns, rows);
      toast.success('Notes exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export notes');
    }
  };

  const handleBulk = async (key, ids) => {
    if (key === 'delete') {
      setPendingDelete({ bulk: ids });
      setDeleteOpen(true);
      return;
    }
    if (key === 'archive') {
      const result = await runMutation(() => nfaService.bulkArchive(ids));
      if (result.ok) {
        toast.success(`${ids.length} note(s) archived`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to archive notes');
    } else if (key === 'restore') {
      const result = await runMutation(() => nfaService.bulkRestore(ids));
      if (result.ok) {
        toast.success(`${ids.length} note(s) restored`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to restore notes');
    } else if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No notes selected to export');
          return;
        }
        exportCsv(columns, selected, 'nfa-notes-selected');
        toast.success(`${selected.length} note(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export notes');
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.bulk) {
      const result = await runMutation(() => nfaService.bulkDelete(pendingDelete.bulk));
      if (result.ok) {
        toast.success(`${pendingDelete.bulk.length} notes moved to Deleted`);
        setSelectedIds([]);
      } else toast.error(result.error?.message || 'Failed to delete notes');
    } else {
      const result = await runMutation(() => nfaService.deleteNfa(pendingDelete.id));
      if (result.ok) toast.success(`${pendingDelete.nfaNo} moved to Deleted`);
      else toast.error(result.error?.message || 'Failed to delete note');
    }
    setDeleteOpen(false);
    setPendingDelete(null);
    setStatsVersion((v) => v + 1);
  };

  const applyFilters = () => {
    const value = draftFilters.status || '';
    setFilter('status', value || 'All');
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
      setDraftFilters((prev) => ({
        ...prev,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All'
      }));
    }
    setFilterOpen(next);
  };

  const activeFilterCount = filters.status && filters.status !== 'All' ? 1 : 0;

  const bulkActions = useMemo(() => {
    const actions = [{ key: 'export', label: 'Export', icon: Download }];
    if (tab === 'active') {
      actions.push({ key: 'archive', label: 'Archive', icon: Archive });
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    } else {
      actions.unshift({ key: 'restore', label: 'Restore', icon: Undo2 });
      actions.splice(1, 0, { key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return actions;
  }, [tab]);

  const renderCell = useMemo(
    () => ({
      nfaNo: (row) => (
        <a
          href={`/purchase/rfq/approval/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/rfq/approval/${row.id}`);
          }}
        >
          {row.nfaNo}
        </a>
      ),
      rfqNo: (row) => (
        <a
          href={`/purchase/rfq/${row.rfqId}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/rfq/${row.rfqId}`);
          }}
        >
          {row.rfqNo}
        </a>
      ),
      title: (row) => (
        <span className="cpr-cell-truncate" title={row.rfqTitle}>{row.rfqTitle || '—'}</span>
      ),
      supplier: (row) => (
        <span className="cpr-cell-truncate" title={row.supplier}>
          {row.supplier || '—'}
          {row.split && (
            <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-600">
              Split
            </span>
          )}
        </span>
      ),
      amount: (row) => <span className="cpr-amount">{formatAmount(row.amount, row.currency)}</span>,
      raisedDate: (row) => <span className="cpr-cell-muted">{formatDate(row.raisedAt) || '—'}</span>,
      status: (row) => {
        const label =
          tab === 'active' ? row.status || NFA_STATUS.DRAFT : tab === 'archived' ? 'Archived' : 'Deleted';
        return <PurchaseStatusCell status={label} />;
      }
    }),
    [navigate, tab]
  );

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <PurchaseListPage
      flowNav={<RfqTabNav />}
      header={{
        crumb: [
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Approval Flow' }
        ],
        icon: Stamp,
        title: 'Approval Flow',
        subtitle: 'Review and approve procurement decisions after PCS, Technical Evaluation, and Supplier Selection — before Purchase Orders',
        actions: (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
              <RefreshCw size={12} /> Refresh
            </button>
            {canCreateNfa && (
              <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/rfq/approval/new')}>
                <span className="erp-btn-icon"><Plus size={16} /></span> New Approval Note
              </button>
            )}
          </>
        )
      }}
      error={error}
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { ...primaryTab, onSelect: goActive },
        segments: {
          tabs,
          activeKey: tab,
          onSelect: (key) => {
            if (key !== 'active') {
              setActiveKpi('total');
              setFilter('status', 'All');
            }
            setTab(key);
            setSelectedIds([]);
            refresh();
          },
          ariaLabel: 'Approval Flow lifecycle'
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
              <FilterIcon /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
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
              id="nfaSearchInput"
              placeholder="Search Approval, RFQ, Supplier..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Notes"
            />
            <PurchaseExportDropdown buttonLabel="Export Notes" onExport={handleExport} />
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
        panelId: 'nfaFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'status', id: 'nfa-status', label: 'Status', value: draftFilters.status || 'All',
            options: [
              { value: 'All', label: 'All Statuses' },
              ...NFA_STATUSES.map((value) => ({ value, label: value }))
            ],
            onChange: (value) => setDraftFilters((prev) => ({ ...prev, status: value }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'nfaBulkActionBar'
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
        /* Pending highlight — the shared light-orange wash on the
           NFA-number cell for notes awaiting an approval decision. */
        rowClass: (row) => pendingWorkClass(Boolean(row.currentStage)),
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        idColumn: 'nfaNo',
        tableId: 'nfaTable',
        getRowId: (row) => row.id,
        emptyContent:
          tab === 'deleted' ? (
            <div className="cpr-empty">
              <Trash2 size={48} aria-hidden="true" />
              <h3>No Deleted Notes</h3>
              <p>Your trash is empty. Deleted notes will appear here.</p>
              <button type="button" className="btn btn-primary" onClick={() => setTab('active')}>
                <ArrowLeft size={14} /> Back to Active Notes
              </button>
            </div>
          ) : tab === 'archived' ? (
            <div className="cpr-empty">
              <Archive size={48} aria-hidden="true" />
              <h3>No Archived Notes</h3>
              <p>{hasFilters ? 'No archived notes matching your search criteria.' : 'Archived notes will appear here.'}</p>
            </div>
          ) : hasFilters ? (
            <div className="cpr-empty">
              <Search size={48} aria-hidden="true" />
              <h3>No Matching Notes</h3>
              <p>No notes matching your search criteria.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear Search
              </button>
            </div>
          ) : (
            <div className="cpr-empty">
              <Stamp size={48} aria-hidden="true" />
              <h3>No Approval Notes</h3>
              <p>Raise your first approval note after PCS, Technical Evaluation, and Supplier Selection to get started.</p>
              <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/rfq/approval/new')}>
                <span className="erp-btn-icon"><Plus size={16} /></span> New Approval Note
              </button>
            </div>
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
        title={pendingDelete?.bulk ? 'Delete selected notes?' : 'Delete note?'}
        message={
          pendingDelete?.bulk
            ? `This will move ${pendingDelete.bulk.length} selected note(s) to the Deleted tab. You can restore them later.`
            : `This will move ${pendingDelete?.nfaNo || 'this note'} to the Deleted tab. You can restore it later.`
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

/* Small inline filter icon (avoids an extra named import at the top). */
function FilterIcon() {
  return (
    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
    </svg>
  );
}
