/**
 * purchase/pages/vendors/VendorList.jsx
 * ------------------------------------------------------------------
 * Vendor Management list — a fully self-contained Purchase module
 * page. It renders KPI cards, status lifecycle tabs, search, filters,
 * bulk actions, the vendor table and pagination over the Purchase
 * module's own vendor service. It mirrors the Purchase Requisition
 * List master design (purchase-page.cpr-page shell, shared list
 * components + cpr-list.css) with only the business data changing.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArrowLeft, Building2, CheckCircle2, Clock3, Copy, Download, Eye, Filter,
  History, IndianRupee, Pencil, Plus, Printer, RefreshCw, Search,
  ShieldCheck, Star, Trash2, Undo2, UserX, X
} from 'lucide-react';
import { ConfirmDialog, Modal, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import { VENDOR_CATEGORIES, VENDOR_COLUMNS, VENDOR_STATUS, VENDOR_STATUSES } from '../../constants';
import { avatarColor, formatDate, formatDateTime, getInitials } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { formatAmount } from '../../utils/purchase';
import { vendorService } from '../../services/vendor';
import { isVendorPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseList from '../../hooks/usePurchaseList';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

/** KPI cards rendered above the table (master CPR hex-style palette). */
const KPI_CARDS = [
  { key: 'total', label: 'Total Vendors', icon: Building2, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pending', label: 'Pending Approval', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'approved', label: 'Approved', icon: ShieldCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'blocked', label: 'Blocked', icon: UserX, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'totalSpend', label: 'Total Spend', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', currency: true }
];

/** KPI key → vendor status filter. */
const STATUS_FILTER_MAP = {
  pending: VENDOR_STATUS.PENDING,
  approved: VENDOR_STATUS.APPROVED,
  blocked: VENDOR_STATUS.BLOCKED
};

const FILTER_KEYS = ['status', 'category', 'state'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function VendorList() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreate = can('vendors', 'create');
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      const response = await vendorService.getVendors({
        search,
        status: filters.status || 'All',
        category: filters.category || 'All',
        state: filters.state || 'All',
        page,
        pageSize,
        sortBy: sortKey,
        sortDir: sortDirection
      });
      return response;
    },
    []
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
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
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  const [columns, setColumns] = useState(() => VENDOR_COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingBlock, setPendingBlock] = useState(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [activeKpi, setActiveKpi] = useState('total');
  const [history, setHistory] = useState(null);

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Debounced search → hook. */
  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch]);

  /* Stats (KPI cards + lifecycle tab counts). */
  useEffect(() => {
    let cancelled = false;
    vendorService
      .getVendorStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion]);

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'id' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const refreshPage = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  /* Approved count — the stats service now tracks it directly (so
     rejected vendors are not counted as approved); fall back to the
     old derivation if the field is absent. */
  const approvedCount = stats?.approved ?? 0;

  const goAll = () => {
    setActiveKpi('total');
    setFilter('status', 'All');
    setSelectedIds([]);
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

  const selectStatus = (status) => {
    setActiveKpi('total');
    setFilter('status', status);
    setSelectedIds([]);
  };

  const kpiCards = KPI_CARDS.map((card) => ({
    ...card,
    value: card.currency ? formatAmount(stats?.[card.key] ?? 0) : String(stats?.[card.key] ?? 0)
  }));

  const segments = [
    { key: VENDOR_STATUS.PENDING, label: 'Pending Approval', count: stats?.pending ?? 0 },
    { key: VENDOR_STATUS.APPROVED, label: 'Approved', count: approvedCount },
    { key: VENDOR_STATUS.BLOCKED, label: 'Blocked', count: stats?.blocked ?? 0 },
    { key: 'Archived', label: 'Archived', count: stats?.archived ?? 0 },
    { key: 'Deleted', label: 'Deleted', count: stats?.deleted ?? 0 }
  ];

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const buildRowActions = (row) => {
    // Archived view offers Restore instead of Edit/Archive — mirrors the
    // Purchase Requisition list's archived-tab action set.
    if (filters.status === 'Archived') {
      return [
        { key: 'view', label: 'View', icon: Eye },
        { key: 'duplicate', label: 'Duplicate', icon: Copy },
        { key: 'print', label: 'Print', icon: Printer },
        { divider: true },
        { key: 'restore', label: 'Restore', icon: Undo2, success: true },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      ];
    }
    // Deleted view — restore or delete only (mirrors the NFA deleted-tab
    // action set; editing a soft-deleted vendor is not offered).
    if (filters.status === 'Deleted') {
      return [
        { key: 'view', label: 'View', icon: Eye },
        { key: 'restore', label: 'Restore', icon: Undo2, success: true },
        { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
      ];
    }
    /* Active list actions — status-dependent lifecycle actions:
       Pending → Approve; Approved → Activate; Active → Block/Archive;
       Blocked → Approve (unblock). */
    const lifecycleActions = [];
    if (isVendorPending(row)) {
      lifecycleActions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2, success: true });
    } else if (row?.status === VENDOR_STATUS.APPROVED) {
      lifecycleActions.push({ key: 'block', label: 'Block', icon: UserX, danger: true });
      lifecycleActions.push({ key: 'archive', label: 'Archive', icon: Archive });
    } else if (row?.status === VENDOR_STATUS.BLOCKED) {
      lifecycleActions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2, success: true });
    }
    return [
      { key: 'view', label: 'View', icon: Eye },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'duplicate', label: 'Duplicate', icon: Copy },
      { key: 'print', label: 'Print', icon: Printer },
      { divider: true },
      ...lifecycleActions,
      { key: 'history', label: 'History', icon: History },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
    ];
  };

  const printVendor = (row) => {
    const exportCols = visibleColumns
      .filter((col) => col.key !== 'actions')
      .map((col) => ({ key: col.key, label: col.label }));
    printTable(`Vendor ${row.id}`, exportCols, [row]);
  };

  const openHistory = async (row) => {
    setHistory({ vendor: row, entries: [], loading: true });
    try {
      const result = await vendorService.getVendorActivity(row.id);
      setHistory({ vendor: row, entries: Array.isArray(result?.entries) ? result.entries : [], loading: false });
    } catch (err) {
      setHistory({ vendor: row, entries: [], loading: false });
      toast.error(err?.message || 'Failed to load vendor history');
    }
  };

  const handleRowAction = async (key, row) => {
    if (key === 'view') navigate(`/purchase/vendors/${row.id}`);
    else if (key === 'edit') navigate(`/purchase/vendors/${row.id}/edit`);
    else if (key === 'print') printVendor(row);
    else if (key === 'history') openHistory(row);
    else if (key === 'duplicate') {
      const result = await runMutation(() => vendorService.duplicateVendor(row.id));
      if (result.ok) {
        toast.success(`${result.data.name} created as a copy`);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to duplicate vendor');
    } else if (key === 'approve') {
      const result = await runMutation(() => vendorService.setVendorStatus(row.id, VENDOR_STATUS.APPROVED));
      if (result.ok) {
        toast.success(`${row.name} approved`);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to approve vendor');
    } else if (key === 'block') {
      setPendingBlock({ id: row.id, name: row.name });
      setBlockOpen(true);
    } else if (key === 'archive') {
      setPendingArchive({ id: row.id, name: row.name });
      setArchiveOpen(true);
    } else if (key === 'restore') {
      const result = await runMutation(() => vendorService.restoreVendor(row.id));
      if (result.ok) {
        toast.success(`${row.name} restored`);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to restore vendor');
    } else if (key === 'delete') {
      setPendingDelete({ id: row.id, name: row.name });
      setDeleteOpen(true);
    }
  };

  const fetchAll = () =>
    vendorService
      .getVendors({
        search,
        status: filters.status && filters.status !== 'All' ? filters.status : 'All',
        category: filters.category && filters.category !== 'All' ? filters.category : 'All',
        state: filters.state && filters.state !== 'All' ? filters.state : 'All',
        page: 1,
        pageSize: 10000
      })
      .then((result) => result.data);

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'Vendors', columns, records: rows, filename: 'vendors' });
      else if (type === 'excel') await exportExcel(columns, rows, 'vendors');
      else if (type === 'csv') exportCsv(columns, rows, 'vendors');
      else if (type === 'print') printTable('Vendors', columns, rows);
      toast.success('Vendors exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export vendors');
    }
  };

  const handleBulk = async (key, ids) => {
    if (key === 'delete') {
      setPendingDelete({ bulk: ids });
      setDeleteOpen(true);
      return;
    }
    if (key === 'archive') {
      const result = await runMutation(() => vendorService.bulkArchive(ids));
      if (result.ok) {
        toast.success(`${ids.length} vendor(s) archived`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to archive vendors');
      return;
    }
    if (key === 'restore') {
      const result = await runMutation(() => vendorService.bulkRestore(ids));
      if (result.ok) {
        toast.success(`${ids.length} vendor(s) restored`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to restore vendors');
      return;
    }
    if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No vendors selected to export');
          return;
        }
        exportCsv(columns, selected, 'vendors-selected');
        toast.success(`${selected.length} vendor(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export vendors');
      }
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.bulk) {
      const result = await runMutation(() => vendorService.bulkDelete(pendingDelete.bulk));
      if (result.ok) {
        toast.success(`${pendingDelete.bulk.length} vendors moved to Deleted`);
        setSelectedIds([]);
      } else toast.error(result.error?.message || 'Failed to delete vendors');
    } else {
      const result = await runMutation(() => vendorService.deleteVendor(pendingDelete.id));
      if (result.ok) toast.success(`${pendingDelete.name} moved to Deleted`);
      else toast.error(result.error?.message || 'Failed to delete vendor');
    }
    setDeleteOpen(false);
    setPendingDelete(null);
    setStatsVersion((v) => v + 1);
  };

  const confirmBlock = async () => {
    if (!pendingBlock) return;
    const result = await runMutation(() => vendorService.setVendorStatus(pendingBlock.id, VENDOR_STATUS.BLOCKED));
    if (result.ok) {
      toast.success(`${pendingBlock.name} blocked`);
      setStatsVersion((v) => v + 1);
    } else toast.error(result.error?.message || 'Failed to block vendor');
    setBlockOpen(false);
    setPendingBlock(null);
  };

  const confirmArchive = async () => {
    if (!pendingArchive) return;
    const result = await runMutation(() => vendorService.archiveVendor(pendingArchive.id));
    if (result.ok) {
      toast.success(`${pendingArchive.name} archived`);
      setStatsVersion((v) => v + 1);
    } else toast.error(result.error?.message || 'Failed to archive vendor');
    setArchiveOpen(false);
    setPendingArchive(null);
  };

  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilter(key, value || 'All');
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
          // The 'Archived' / 'Deleted' segment sentinels have no option in
          // the Status dropdown (which lists VENDOR_STATUSES) — seed them
          // as 'All' so the panel never shows an unmatched value.
          if (key === 'status' && (value === 'Archived' || value === 'Deleted')) {
            acc[key] = 'All';
          } else if (value && value !== 'All') {
            acc[key] = value;
          }
          return acc;
        }, {})
      );
    }
    setFilterOpen(next);
  };

  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key] && filters[key] !== 'All').length;

  /* Flat button row — Export | Archive | Delete on the active list (the
     RFQ List structure), and Export | Restore | Delete on the Archived /
     Deleted tabs where the archived/soft-deleted rows are restored or
     purged instead of archived again. */
  const bulkActions = useMemo(() => {
    const actions = [{ key: 'export', label: 'Export', icon: Download }];
    if (filters.status === 'Archived' || filters.status === 'Deleted') {
      actions.push({ key: 'restore', label: 'Restore', icon: Undo2 });
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    } else {
      actions.push({ key: 'archive', label: 'Archive', icon: Archive });
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return actions;
  }, [filters.status]);

  const renderCell = useMemo(
    () => ({
      id: (row) => (
        <a
          href={`/purchase/vendors/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/vendors/${row.id}`);
          }}
        >
          {row.id}
        </a>
      ),
      name: (row) => {
        /* Preferred mirrors the Vendor Sourcing derivation (rating ≥ 4.2
           or on-time delivery ≥ 92%) so the badge matches exactly. */
        const preferred = Number(row.rating) >= 4.2 || Number(row.onTimeDelivery) >= 92;
        return (
          <button
            type="button"
            onClick={() => navigate(`/purchase/vendors/${row.id}`)}
            className="flex items-center gap-2.5 text-left group cursor-pointer"
          >
            <span className={`flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold shrink-0 ${avatarColor(row.name)}`}>
              {getInitials(row.name)}
            </span>
            <span className="min-w-0">
              <span
                className="cpr-cell-truncate block font-semibold text-slate-800 group-hover:text-[#0B4A3D] group-hover:underline"
                title={row.name}
              >
                {row.name || '—'}
              </span>
              {preferred && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-px">
                  <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" aria-hidden="true" /> Preferred
                </span>
              )}
            </span>
          </button>
        );
      },
      category: (row) => <span className="cpr-cell-truncate">{row.category || '—'}</span>,
      city: (row) => <span className="cpr-cell-truncate">{row.city || '—'}</span>,
      state: (row) => <span className="cpr-cell-truncate">{row.state || '—'}</span>,
      /* GST and Email carry a hover tooltip so the complete value is
         always reachable even when a cell must ellipsize. */
      gstin: (row) => <span className="cpr-cell-truncate" title={row.gstin}>{row.gstin || '—'}</span>,
      phone: (row) => <span className="cpr-cell-truncate">{row.phone || '—'}</span>,
      email: (row) => <span className="cpr-cell-truncate" title={row.email}>{row.email || '—'}</span>,
      status: (row) => <PurchaseStatusCell status={row.status} />,
      rating: (row) => (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 tabular-nums">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden="true" />
          {(row.rating ?? 0).toFixed(1)}
        </span>
      ),
      onTimeDelivery: (row) => (
        <span className={`text-xs font-bold tabular-nums ${Number(row.onTimeDelivery) >= 90 ? 'text-emerald-600' : Number(row.onTimeDelivery) >= 75 ? 'text-amber-600' : 'text-rose-600'}`}>
          {row.onTimeDelivery}%
        </span>
      ),
      createdAt: (row) => <span className="cpr-cell-muted">{formatDate(row.createdAt) || '—'}</span>
    }),
    [navigate]
  );

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <PurchaseListPage
      header={{
        crumb: 'Vendor Management',
        icon: Building2,
        title: 'Vendors',
        subtitle: 'Maintain the vendor master, approvals and performance',
        actions: canCreate ? (
          <>
            <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/vendors/new')}>
              <span className="erp-btn-icon"><Plus size={16} /></span> Create Vendor
            </button>
          </>
        ) : null
      }}
      flowNav={<ModuleTabNav module="vendors" />}
      error={error}
      errorMessage="Failed to load vendors."
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { label: 'All Vendors', count: stats?.total ?? 0, onSelect: goAll },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: selectStatus,
          ariaLabel: 'Vendor workflow status'
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
              id="vendorSearchInput"
              placeholder="Search vendor, category, city, GST..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Vendors"
            />
            <PurchaseExportDropdown buttonLabel="Export Vendors" onExport={handleExport} />
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
        panelId: 'vendorFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'status', id: 'vl-status', label: 'Status', value: draftFilters.status || 'All',
            options: [{ value: 'All', label: 'All Status' }, ...VENDOR_STATUSES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, status: v }))
          },
          {
            key: 'category', id: 'vl-category', label: 'Category', value: draftFilters.category || 'All',
            options: [{ value: 'All', label: 'All Categories' }, ...VENDOR_CATEGORIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, category: v }))
          },
          {
            key: 'state', id: 'vl-state', label: 'State', value: draftFilters.state || 'All',
            options: [
              { value: 'All', label: 'All States' },
              /* Option objects (not raw strings) — PurchaseFilters keys each
                 <option> by opt.value, so raw values render undefined keys. */
              ...Array.from(new Set(['Maharashtra', 'Karnataka'])).map((state) => ({ value: state, label: state }))
            ],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, state: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'vendorBulkActionBar'
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
        /* Pending highlight — the shared light-orange identification
           wash on the checkbox + vendor cells for vendors awaiting
           approval; approved / rejected vendors stay normal. */
        /* Pending highlight — the shared light-orange identification
           wash on the checkbox + vendor cells for vendors awaiting
           approval; approved / rejected vendors stay normal. */
        rowClass: (row) => pendingWorkClass(isVendorPending(row)),
        idColumn: 'id',
        tableId: 'vendorTable',
        alignCenter: ['status', 'rating', 'onTimeDelivery'],
        alignRight: [],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        emptyContent: (
          filters.status === 'Deleted' ? (
            <div className="cpr-empty">
              <Trash2 size={48} aria-hidden="true" />
              <h3>No Deleted Vendors</h3>
              <p>
                {Boolean(search) || activeFilterCount > 1
                  ? 'No deleted vendors matching your search criteria.'
                  : 'Your trash is empty. Deleted vendors will appear here.'}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => selectStatus(VENDOR_STATUS.APPROVED)}>
                <ArrowLeft size={14} /> Back to Approved
              </button>
            </div>
          ) : filters.status === 'Archived' ? (
            <PurchaseEmptyState
              icon={Archive}
              title="No Archived Vendors"
              message={
                Boolean(search) || activeFilterCount > 1
                  ? 'No archived vendors matching your search criteria.'
                  : 'Archived vendors will appear here.'
              }
            />
          ) : hasFilters ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Vendors"
              message="No vendors matching your search criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={Building2}
              title="No Vendors Found"
              message="Register your first vendor to build the vendor master."
              action={
                <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/vendors/new')}>
                  <span className="erp-btn-icon"><Plus size={16} /></span> Register Vendor
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
      {/* ===== HISTORY MODAL (shared Modal; audit trail from vendorService.getVendorActivity) ===== */}
      <Modal
        open={Boolean(history)}
        onClose={() => setHistory(null)}
        title={history?.vendor ? `History — ${history.vendor.name}` : 'Vendor History'}
        maxWidth="max-w-lg"
      >
        {history?.loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">Loading vendor history…</p>
        ) : history && history.entries.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No activity recorded for this vendor yet.</p>
        ) : (
          <div className="space-y-4">
            {history?.entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <span className="mt-1.5 w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-slate-800 leading-snug">{entry.action}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {formatDateTime(entry.date)} · {entry.user}
                    {entry.ip ? ` · ${entry.ip}` : ''}
                  </p>
                  {(entry.oldValue || entry.newValue) && (
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {entry.oldValue ? `${entry.oldValue} → ${entry.newValue}` : entry.newValue}
                    </p>
                  )}
                  {entry.remarks && <p className="text-[11px] text-slate-400 italic mt-0.5">{entry.remarks}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* ===== DELETE CONFIRM ===== */}
      <ConfirmDialog
        open={deleteOpen}
        title={pendingDelete?.bulk ? 'Delete selected vendors?' : 'Delete vendor?'}
        message={
          pendingDelete?.bulk
            ? `This will move ${pendingDelete.bulk.length} selected vendor(s) to the Deleted tab. You can restore them later.`
            : `This will move ${pendingDelete?.name || 'this vendor'} to the Deleted tab. You can restore it later.`
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

      {/* ===== BLOCK CONFIRM ===== */}
      <ConfirmDialog
        open={blockOpen}
        title="Block vendor?"
        message={`Blocking ${pendingBlock?.name || 'this vendor'} will prevent it from being invited to RFQs and quotations.`}
        confirmLabel="Block"
        variant="danger"
        icon={UserX}
        loading={actionLoading}
        onConfirm={confirmBlock}
        onCancel={() => {
          setBlockOpen(false);
          setPendingBlock(null);
        }}
      />

      {/* ===== ARCHIVE CONFIRM ===== */}
      <ConfirmDialog
        open={archiveOpen}
        title="Archive vendor?"
        message={`Archiving ${pendingArchive?.name || 'this vendor'} will remove it from the active list. You can restore it from the Archived tab.`}
        confirmLabel="Archive"
        variant="danger"
        icon={Archive}
        loading={actionLoading}
        onConfirm={confirmArchive}
        onCancel={() => {
          setArchiveOpen(false);
          setPendingArchive(null);
        }}
      />
    </PurchaseListPage>
  );
}
