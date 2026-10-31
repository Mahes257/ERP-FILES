/**
 * purchase/pages/orders/OrderList.jsx
 * ------------------------------------------------------------------
 * Purchase Order List — workflow-driven list with:
 *   • Flat status tabs (Draft, Pending Approval, Approved, etc.)
 *   • URL-synchronized stage, search
 *   • Stage-aware action menus that perform real operations
 *   • Correct pagination reflecting filtered counts
 *
 * Route: /purchase/orders
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Ban, CheckCircle2, ClipboardList,
  Clock3, Download, Edit3, Eye, FileCheck, FileDown, Filter, IndianRupee, Package,
  Plus, Printer, RefreshCw, Send, Search, Trash2, Truck, X
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { purchaseOrderService } from '../../services/purchaseOrder';
import {
  PO_COLUMNS, PO_STATUS, PO_STATUSES,
  canCancelPO
} from '../../constants';
import { isValidPOTransition } from '../../services/workflowConfig';
import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Flat status tabs — replaces the old lifecycle + secondary two-tier system. */
const STATUS_TABS = [
  { key: PO_STATUS.DRAFT, label: 'Draft' },
  { key: PO_STATUS.PENDING_APPROVAL, label: 'Pending Approval' },
  { key: PO_STATUS.APPROVED, label: 'Approved' },
  { key: PO_STATUS.RELEASED, label: 'Released' },
  { key: PO_STATUS.IN_PROGRESS, label: 'In Progress' },
  { key: PO_STATUS.COMPLETED, label: 'Completed' }
];

/**
 * KPI cards — counts are derived from stats, never hardcoded.
 */
const KPI_DEFS = [
  { key: 'total', label: 'Total Orders', icon: ClipboardList, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'active', label: 'Active', icon: Clock3, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: PO_STATUS.PARTIALLY_DELIVERED, label: 'Partial Delivery', icon: Package, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: PO_STATUS.COMPLETED, label: 'Completed', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'value', label: 'Order Value', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', currency: true }
];

/* ============================== HELPERS ============================== */

/** Map a status tab selection to a status filter string for the service. */
function buildStatusFilter(statusTab) {
  if (!statusTab) return 'All';
  return statusTab;
}

/* ============================== STAGE-AWARE ACTIONS ============================== */

/**
 * Build the contextual action menu for a PO based on its workflow stage.
 * Always starts with View + Print, then adds stage-specific actions.
 */
function buildRowActions(row) {
  const actions = [];
  const s = row.status;

  /* — Always present — */
  actions.push({ key: 'view', label: 'View', icon: Eye });

  /* — DRAFT — */
  if (s === PO_STATUS.DRAFT) {
    actions.push({ key: 'edit', label: 'Edit', icon: Edit3 });
    actions.push({ key: 'submit', label: 'Submit for Approval', icon: Send });
  }

  /* — PENDING APPROVAL — */
  if (s === PO_STATUS.PENDING_APPROVAL) {
    actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
  }

  /* — APPROVED — */
  if (s === PO_STATUS.APPROVED && isValidPOTransition(s, PO_STATUS.RELEASED)) {
    actions.push({ key: 'release', label: 'Release PO', icon: ArrowRight });
  }

  /* — RELEASED — */
  if (s === PO_STATUS.RELEASED && isValidPOTransition(s, PO_STATUS.SUPPLIER_ACKNOWLEDGED)) {
    actions.push({ key: 'acknowledge', label: 'Record Acknowledgement', icon: FileCheck });
  }

  /* — SUPPLIER ACKNOWLEDGED — */
  if (s === PO_STATUS.SUPPLIER_ACKNOWLEDGED && isValidPOTransition(s, PO_STATUS.IN_PROGRESS)) {
    actions.push({ key: 'start', label: 'Mark In Progress', icon: Truck });
  }

  /* — IN PROGRESS — */
  if (s === PO_STATUS.IN_PROGRESS) {
    if (isValidPOTransition(s, PO_STATUS.PARTIALLY_DELIVERED)) {
      actions.push({ key: 'mark-partial', label: 'Mark Partially Delivered', icon: Package });
    }
    if (isValidPOTransition(s, PO_STATUS.COMPLETED)) {
      actions.push({ key: 'complete', label: 'Mark Completed', icon: CheckCircle2 });
    }
  }

  /* — PARTIALLY DELIVERED — */
  if (s === PO_STATUS.PARTIALLY_DELIVERED) {
    if (isValidPOTransition(s, PO_STATUS.COMPLETED)) {
      actions.push({ key: 'complete', label: 'Mark Completed', icon: CheckCircle2 });
    }
  }

  /* — COMPLETED — */
  if (s === PO_STATUS.COMPLETED && isValidPOTransition(s, PO_STATUS.CLOSED)) {
    actions.push({ key: 'close', label: 'Close PO', icon: FileCheck });
  }

  /* — Always present (before danger zone) — Print fires the browser
     dialog on the rendered PO document; PDF Preview opens the same
     document on screen without printing. */
  actions.push({ key: 'print', label: 'Print', icon: Printer });
  actions.push({ key: 'pdf', label: 'PDF Preview', icon: FileDown });

  /* — Danger zone — */
  if (canCancelPO(s)) {
    actions.push({ divider: true });
    actions.push({ key: 'cancel', label: 'Cancel PO', icon: Ban, danger: true });
  }

  return actions;
}

/** Check if a PO can be safely deleted. */
function isDeletable(row) {
  return row.status === PO_STATUS.DRAFT || row.status === PO_STATUS.PENDING_APPROVAL;
}

/** Build bulk actions for the selection. */
function buildBulkActions(selectedIds, records) {
  const selected = records.filter((r) => selectedIds.includes(r.id));
  if (selected.length === 0) return [];

  const allDeletable = selected.every(isDeletable);
  const hasPending = selected.some((r) => r.status === PO_STATUS.PENDING_APPROVAL);
  const actions = [{ key: 'export', label: 'Export', icon: Download }];

  if (hasPending) {
    actions.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
  }
  if (allDeletable) {
    actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
  }
  return actions;
}

/* ============================== COMPONENT ============================== */

export default function OrderList() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreate = can('orders', 'create');
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  /* — URL-synced state — */
  const [statusTab, setStatusTab] = useState(() => searchParams.get('stage') || null);
  const [activeKpi, setActiveKpi] = useState('total');
  const [searchInput, setSearchInput] = useState(() => searchParams.get('q') || '');

  /* — URL sync: write params when state changes — */
  const syncUrl = useCallback((stage, q) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (stage) next.set('stage', stage);
      else next.delete('stage');
      if (q) next.set('q', q);
      else next.delete('q');
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  /* — Fetch page — passes the correct status filter to the service. */
  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      let statusFilter;
      const explicitStage = filters.status && filters.status !== 'All' ? filters.status : null;
      if (explicitStage) {
        statusFilter = explicitStage;
      } else {
        statusFilter = buildStatusFilter(statusTab);
      }
      const response = await purchaseOrderService.getOrders({
        search,
        status: statusFilter,
        page,
        pageSize,
        sortBy: sortKey,
        sortDir: sortDirection
      });
      return response;
    },
    [statusTab]
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

  /* — UI state — */
  const [columns, setColumns] = useState(() => PO_COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [confirmActionOpen, setConfirmActionOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Debounced search → hook. */
  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      syncUrl(statusTab, debouncedSearch || null);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch, statusTab, syncUrl]);

  /* Stats (KPI cards + tab counts). */
  useEffect(() => {
    let cancelled = false;
    purchaseOrderService
      .getOrderStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [statsVersion]);

  const refreshPage = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  /* =================== STATUS TAB SELECTION =================== */

  const selectStatusTab = useCallback((key) => {
    const newTab = statusTab === key ? null : key;
    setStatusTab(newTab);
    setActiveKpi('total');
    setFilter('status', 'All');
    setSelectedIds([]);
    syncUrl(newTab, searchInput || null);
    refresh();
  }, [statusTab, setFilter, syncUrl, searchInput, refresh]);

  /* =================== KPI CLICK-TO-FILTER =================== */

  const selectKpi = useCallback((key) => {
    if (key === activeKpi) {
      setActiveKpi('total');
      setFilter('status', 'All');
      setStatusTab(null);
      syncUrl(null, searchInput || null);
    } else if (key === 'active') {
      setActiveKpi('active');
      setFilter('status', 'All');
      setStatusTab(null);
      syncUrl(null, searchInput || null);
    } else {
      setActiveKpi(key);
      setFilter('status', key);
      setStatusTab(null);
      syncUrl(null, searchInput || null);
    }
    setSelectedIds([]);
  }, [activeKpi, setFilter, syncUrl, searchInput]);

  /* =================== COLUMNS =================== */

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);
  const COLUMNS_STORAGE_KEY = 'vishak:po:columns';

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
    if (key === 'poNo' || key === 'actions') return;
    persistColumns(columns.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    persistColumns(columns.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    persistColumns(columns.map((col) => (['poNo', 'actions'].includes(col.key) ? col : { ...col, visible: false })));

  /* =================== KPI / TAB DATA =================== */

  const kpiCards = KPI_DEFS.map((def) => {
    let value;
    if (def.key === 'active') {
      const activeCount = STATUS_TABS.reduce((sum, s) => sum + (stats?.[s.key] ?? 0), 0);
      value = String(activeCount);
    } else if (def.currency) {
      value = formatAmount(stats?.value ?? 0);
    } else {
      value = String(stats?.[def.key] ?? 0);
    }
    return { ...def, value };
  });

  const allCount = useMemo(() => {
    if (!stats) return 0;
    /* The "All Purchase Orders" heading is the true total. Summing only the
       status tabs undercounts whenever a PO sits in a status without its own
       tab (Supplier Acknowledged, Partially Delivered, Closed, Cancelled) —
       the backend already returns the real total, so prefer it. */
    if (typeof stats.total === 'number') return stats.total;
    return STATUS_TABS.reduce((sum, tab) => sum + (stats[tab.key] ?? 0), 0);
  }, [stats]);

  /* ── Dynamic section heading & count ── */
  const scopeHeading = useMemo(() => ({
    label: 'All Purchase Orders',
    count: allCount
  }), [allCount]);

  const statusTabs = useMemo(() => {
    return STATUS_TABS.map((tab) => ({
      ...tab,
      count: stats?.[tab.key] ?? 0
    }));
  }, [stats]);

  const totalPagesCalc = Math.max(1, totalPages || 1);
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  /* =================== CELL RENDERERS =================== */

  const renderers = useMemo(
    () => ({
      poNo: (row) => (
        <a
          href={`/purchase/orders/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/orders/${row.id}`);
          }}
        >
          {row.poNo}
        </a>
      ),
      title: (row) => (
        <span className="cpr-cell-truncate" title={row.title}>{row.title || '—'}</span>
      ),
      vendor: (row) => <span className="cpr-cell-truncate" title={row.vendor}>{row.vendor || '—'}</span>,
      reference: (row) => <span className="cpr-cell-truncate" title={row.reference}>{row.reference || '—'}</span>,
      amount: (row) => (
        <span className="cpr-amount">{formatAmount(row.amount, row.currency)}</span>
      ),
      orderDate: (row) => <span className="cpr-cell-muted">{formatDate(row.orderDate) || '—'}</span>,
      expectedDate: (row) => <span className="cpr-cell-muted">{formatDate(row.expectedDate) || '—'}</span>,
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  /* =================== SELECTION =================== */

  const hasFilters = Boolean(search) || statusTab !== null || Object.keys(filters).some((k) => filters[k] && filters[k] !== 'All');
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  /* =================== FILTERS =================== */

  const toggleFilters = () => setFilterOpen((prev) => !prev);

  const applyFilters = () => {
    if (draftFilters.status) {
      setFilter('status', draftFilters.status);
      setStatusTab(null);
      syncUrl(null, searchInput || null);
    }
    setSelectedIds([]);
    setFilterOpen(false);
  };

  const resetAll = useCallback(() => {
    setDraftFilters({});
    resetFilters();
    setSearchInput('');
    setSelectedIds([]);
    setActiveKpi('total');
    setStatusTab(null);
    syncUrl(null, null);
  }, [resetFilters, syncUrl]);

  /* =================== EXPORT =================== */

  const fetchAll = () => {
    const statusFilter = statusTab ? statusTab : 'All';
    return purchaseOrderService
      .getOrders({ search, status: statusFilter, page: 1, pageSize: 10000 })
      .then((result) => result.data);
  };

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'Purchase Orders', columns, records: rows, filename: 'purchase-orders' });
      else if (type === 'excel') await exportExcel(columns, rows, 'purchase-orders');
      else if (type === 'csv') exportCsv(columns, rows, 'purchase-orders');
      else if (type === 'print') printTable('Purchase Orders', columns, rows);
      toast.success('Purchase orders exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export purchase orders');
    }
  };

  /* =================== ROW ACTIONS =================== */

  const handleRowAction = async (key, row) => {
    if (key === 'view') {
      navigate(`/purchase/orders/${row.id}`);
    } else if (key === 'print') {
      navigate(`/purchase/orders/${row.id}/print?print=1`);
    } else if (key === 'pdf') {
      navigate(`/purchase/orders/${row.id}/print`);
    } else if (key === 'edit') {
      navigate(`/purchase/orders/${row.id}/edit`);
    } else if (key === 'approve') {
      const result = await runMutation(() => purchaseOrderService.approveOrder(row.id));
      if (result.ok) {
        toast.success(`${row.poNo} approved`);
        refresh();
        setStatsVersion((v) => v + 1);
      } else {
        toast.error(result.error?.message || 'Failed to approve PO');
      }
    } else if (key === 'release') {
      setConvertTarget({ row, toStatus: PO_STATUS.RELEASED, label: 'Release PO' });
      setConvertOpen(true);
    } else if (key === 'acknowledge') {
      setConvertTarget({ row, toStatus: PO_STATUS.SUPPLIER_ACKNOWLEDGED, label: 'Record Acknowledgement' });
      setConvertOpen(true);
    } else if (key === 'start') {
      setConvertTarget({ row, toStatus: PO_STATUS.IN_PROGRESS, label: 'Mark In Progress' });
      setConvertOpen(true);
    } else if (key === 'mark-partial') {
      setConvertTarget({ row, toStatus: PO_STATUS.PARTIALLY_DELIVERED, label: 'Mark Partially Delivered' });
      setConvertOpen(true);
    } else if (key === 'complete') {
      setConvertTarget({ row, toStatus: PO_STATUS.COMPLETED, label: 'Mark Completed' });
      setConvertOpen(true);
    } else if (key === 'close') {
      setConfirmTarget({ row, action: 'close', label: 'Close PO', message: `${row.poNo} will be permanently closed. This action cannot be undone.` });
      setConfirmActionOpen(true);
    } else if (key === 'submit') {
      setConfirmTarget({ row, action: 'submit', label: 'Submit for Approval', message: `${row.poNo} will be submitted for approval.` });
      setConfirmActionOpen(true);
    } else if (key === 'cancel') {
      setConvertTarget({ row, toStatus: PO_STATUS.CANCELLED, label: 'Cancel PO', danger: true });
      setConvertOpen(true);
    }
  };

  /* =================== BULK ACTIONS =================== */

  const handleBulk = async (key, ids) => {
    if (key === 'delete') {
      const selected = records.filter((r) => ids.includes(r.id));
      const eligible = selected.filter(isDeletable);
      const notEligible = selected.filter((r) => !isDeletable(r));

      if (notEligible.length > 0) {
        setDeleteTarget({
          bulk: ids,
          eligible: eligible.map((r) => r.id),
          notEligible: notEligible.map((r) => ({
            poNo: r.poNo,
            status: r.status,
            reason: `Stage: ${r.status} — not eligible for deletion`
          }))
        });
      } else {
        setDeleteTarget({ bulk: ids, eligible: ids, notEligible: [] });
      }
      setConfirmOpen(true);
    } else if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((r) => ids.includes(r.id));
        if (selected.length === 0) toast.info('No purchase orders selected to export');
        else {
          exportCsv(columns, selected, 'purchase-orders-selected');
          toast.success(`${selected.length} purchase orders exported`);
        }
      } catch (err) {
        toast.error(err?.message || 'Failed to export');
      }
    } else if (key === 'approve') {
      const pendingIds = records
        .filter((r) => ids.includes(r.id) && r.status === PO_STATUS.PENDING_APPROVAL)
        .map((r) => r.id);
      if (pendingIds.length === 0) {
        toast.info('No pending purchase orders to approve');
        return;
      }
      const result = await runMutation(() => Promise.all(pendingIds.map((id) => purchaseOrderService.approveOrder(id))));
      if (result.ok) {
        toast.success(`${pendingIds.length} purchase order(s) approved`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else {
        toast.error(result.error?.message || 'Failed to approve purchase orders');
      }
    }
  };

  const bulkActions = useMemo(() => buildBulkActions(selectedIds, records), [selectedIds, records]);

  /* =================== DELETE CONFIRMATION =================== */

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.bulk) {
      const idsToDelete = deleteTarget.eligible || deleteTarget.bulk;
      if (idsToDelete.length === 0) {
        setConfirmOpen(false);
        setDeleteTarget(null);
        return;
      }
      const result = await runMutation(() =>
        Promise.all(idsToDelete.map((id) => purchaseOrderService.deleteOrder(id)))
      );
      if (result.ok) {
        const msg = deleteTarget.notEligible?.length > 0
          ? `${idsToDelete.length} order(s) deleted. ${deleteTarget.notEligible.length} protected (not eligible).`
          : `${idsToDelete.length} purchase order(s) deleted`;
        toast.success(msg);
        setSelectedIds([]);
        refresh();
      } else {
        toast.error(result.error?.message || 'Failed to delete purchase orders');
      }
    } else {
      const result = await runMutation(() => purchaseOrderService.deleteOrder(deleteTarget.id));
      if (result.ok) {
        toast.success(`${deleteTarget.poNo} deleted`);
        refresh();
      } else {
        toast.error(result.error?.message || 'Failed to delete purchase order');
      }
    }
    setConfirmOpen(false);
    setDeleteTarget(null);
    setStatsVersion((v) => v + 1);
  };

  const confirmTitle = deleteTarget?.bulk
    ? deleteTarget.notEligible?.length > 0
      ? 'Delete eligible purchase orders?'
      : 'Delete selected purchase orders?'
    : 'Delete purchase order?';

  const confirmMessage = useMemo(() => {
    if (!deleteTarget) return '';
    if (deleteTarget.bulk) {
      const eligibleCount = deleteTarget.eligible?.length || deleteTarget.bulk.length;
      const notEligible = deleteTarget.notEligible || [];
      if (notEligible.length > 0) {
        return (
          <div>
            <p className="mb-2">Selected: {deleteTarget.bulk.length}</p>
            <p className="mb-1 text-emerald-700 font-semibold">Eligible for deletion: {eligibleCount}</p>
            <p className="mb-2 text-red-600 font-semibold">Not eligible: {notEligible.length}</p>
            <ul className="list-disc list-inside text-xs text-slate-600 space-y-0.5 mb-3">
              {notEligible.map((item) => (
                <li key={item.poNo}>
                  <strong>{item.poNo}</strong> — {item.reason}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">This action cannot be undone.</p>
          </div>
        );
      }
      return `This will permanently remove ${eligibleCount} order(s). This action cannot be undone.`;
    }
    return `This will permanently remove ${deleteTarget?.poNo || 'this order'}. This action cannot be undone.`;
  }, [deleteTarget]);

  const confirmLabel = deleteTarget?.bulk && deleteTarget.notEligible?.length > 0
    ? `Delete Eligible Orders (${deleteTarget.eligible?.length || 0})`
    : 'Delete';

  /* =================== STAGE CONVERSION =================== */

  const confirmConvert = async () => {
    if (!convertTarget) return;
    const { row, toStatus } = convertTarget;
    const poNo = row.poNo;

    let result;
    if (toStatus === PO_STATUS.CANCELLED) {
      result = await runMutation(() => purchaseOrderService.cancelOrder(row.id));
    } else if (toStatus === PO_STATUS.APPROVED) {
      result = await runMutation(() => purchaseOrderService.approveOrder(row.id));
    } else if (toStatus === PO_STATUS.RELEASED) {
      result = await runMutation(() => purchaseOrderService.releaseOrder(row.id));
    } else if (toStatus === PO_STATUS.SUPPLIER_ACKNOWLEDGED) {
      result = await runMutation(() => purchaseOrderService.acknowledgeOrder(row.id));
    } else if (toStatus === PO_STATUS.IN_PROGRESS) {
      result = await runMutation(() => purchaseOrderService.startOrder(row.id));
    } else if (toStatus === PO_STATUS.PARTIALLY_DELIVERED) {
      result = await runMutation(() => purchaseOrderService.markPartiallyDelivered(row.id));
    } else if (toStatus === PO_STATUS.COMPLETED) {
      result = await runMutation(() => purchaseOrderService.completeOrder(row.id));
    } else if (toStatus === PO_STATUS.CLOSED) {
      result = await runMutation(() => purchaseOrderService.closeOrder(row.id));
    } else {
      result = await runMutation(() => purchaseOrderService.updateOrder(row.id, { status: toStatus }));
    }

    if (result.ok) {
      toast.success(`${poNo} → ${toStatus}`);
      refresh();
      setStatsVersion((v) => v + 1);
    } else {
      toast.error(result.error?.message || `Failed to update ${poNo}`);
    }
    setConvertOpen(false);
    setConvertTarget(null);
  };

  /* =================== CONFIRM ACTION (Close / Submit) =================== */

  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    const { row, action } = confirmTarget;
    let result;
    if (action === 'close') {
      result = await runMutation(() => purchaseOrderService.closeOrder(row.id));
    } else if (action === 'submit') {
      /* Dedicated submit transition — the backend keeps status
         workflow-driven, so a field patch would never move Draft →
         Pending Approval (and the old two-key patch returned 400).
         The endpoint also resets approvalStatus to Pending itself. */
      result = await runMutation(() => purchaseOrderService.submitOrder(row.id));
    }
    if (result?.ok) {
      toast.success(action === 'close' ? `${row.poNo} closed` : `${row.poNo} submitted for approval`);
      refresh();
      setStatsVersion((v) => v + 1);
    } else {
      toast.error(result?.error?.message || `Failed to ${action} PO`);
    }
    setConfirmActionOpen(false);
    setConfirmTarget(null);
  };

  /* =================== EMPTY STATE =================== */

  const emptyContent = useMemo(() => {
    if (hasFilters || statusTab) {
      return (
        <div className="cpr-empty">
          <Search size={48} aria-hidden="true" />
          <h3>No Purchase Orders Found</h3>
          <p>There's no purchase order in this stage.</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
            <X size={12} /> Clear Filter
          </button>
        </div>
      );
    }
    return (
      <div className="cpr-empty">
        <ClipboardList size={48} aria-hidden="true" />
        <h3>No Purchase Orders Found</h3>
        <p>Create your first purchase order to start procurement.</p>
        <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/orders/new')}>
          <span className="erp-btn-icon"><Plus size={16} /></span> Create Purchase Order
        </button>
      </div>
    );
  }, [hasFilters, statusTab, navigate, resetAll]);

  /* =================== RENDER =================== */

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'PO List' }
        ],
        icon: ClipboardList,
        title: 'Purchase Orders',
        subtitle: 'Manage purchase orders from creation to delivery.',
        actions: canCreate ? (
          <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/orders/new')}>
            <span className="erp-btn-icon"><Plus size={16} /></span> Create Purchase Order
          </button>
        ) : null
      }}
      flowNav={<ModuleTabNav module="orders" />}
      error={error}
      errorMessage="Failed to load purchase orders."
      onRetry={refreshPage}
      kpis={{
        cards: kpiCards,
        activeKey: activeKpi,
        onSelect: selectKpi
      }}
      tabs={{
        primary: {
          label: 'All Purchase Orders',
          count: scopeHeading.count,
          active: !statusTab,
          onSelect: () => {
            setStatusTab(null);
            setActiveKpi('total');
            setFilter('status', 'All');
            setSelectedIds([]);
            syncUrl(null, searchInput || null);
            refresh();
          }
        },
        segments: {
          tabs: statusTabs,
          activeKey: statusTab,
          onSelect: selectStatusTab,
          ariaLabel: 'Purchase order status'
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
            {(searchInput || statusTab !== null || (filters.status && filters.status !== 'All')) && (
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
              id="poSearchInput"
              placeholder="Search PO Number, Title, Vendor, Reference..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Purchase Orders"
            />
            <PurchaseExportDropdown buttonLabel="Export Orders" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['poNo', 'actions']}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'poFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'status', id: 'po-status', label: 'PO Stages',
            value: draftFilters.status || 'All',
            options: [{ value: 'All', label: 'All Stages' }, ...PO_STATUSES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, status: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'poBulkActionBar'
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
        renderers,
        idColumn: 'poNo',
        tableId: 'poTable',
        alignCenter: ['status'],
        alignRight: ['amount'],
        getRowId: (row) => row.id,
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        emptyContent
      }}
      pagination={{
        page,
        totalPages: totalPagesCalc,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: goToPage,
        onPageSizeChange: changePageSize
      }}
    >
      {/* DELETE CONFIRM */}
      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmLabel}
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />

      {/* STAGE CONVERSION / CANCEL CONFIRM */}
      {convertOpen && convertTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${convertTarget.danger ? 'bg-red-50' : 'bg-[#0A4F44]/10'}`}>
                <ArrowRight size={18} className={convertTarget.danger ? 'text-red-600' : 'text-[#0A4F44]'} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-800">{convertTarget.label}</h3>
                <p className="text-xs text-slate-500">{convertTarget.row.poNo}</p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">PO Number</span>
                  <span className="text-slate-800 font-semibold">{convertTarget.row.poNo}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Vendor</span>
                  <span className="text-slate-700">{convertTarget.row.vendor || '—'}</span>
                </div>
                <div className="border-t border-slate-200" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">Current Stage</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                    {convertTarget.row.status}
                  </span>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowRight size={16} className="text-slate-400" />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">New Stage</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    convertTarget.danger ? 'bg-red-50 text-red-700' : 'bg-[#0A4F44]/10 text-[#0A4F44]'
                  }`}>
                    {convertTarget.toStatus}
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 text-center">
                {convertTarget.danger
                  ? 'This action cannot be undone. The PO will be permanently cancelled.'
                  : `This will move ${convertTarget.row.poNo} to "${convertTarget.toStatus}".`}
              </p>
            </div>
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                onClick={() => { setConvertOpen(false); setConvertTarget(null); }}
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors ${
                  convertTarget.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-[#0A4F44] hover:bg-[#083D34]'
                }`}
                onClick={confirmConvert}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : convertTarget.danger ? 'Confirm Cancel' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* CONFIRM ACTION (Close / Submit) */}
      <ConfirmDialog
        open={confirmActionOpen}
        title={confirmTarget?.label || 'Confirm Action'}
        message={confirmTarget?.message || ''}
        confirmLabel={confirmTarget?.action === 'close' ? 'Close PO' : 'Submit'}
        variant={confirmTarget?.action === 'close' ? 'danger' : 'default'}
        icon={confirmTarget?.action === 'close' ? FileCheck : Send}
        loading={actionLoading}
        onConfirm={handleConfirmAction}
        onCancel={() => { setConfirmActionOpen(false); setConfirmTarget(null); }}
      />
    </PurchaseListPage>
  );
}
