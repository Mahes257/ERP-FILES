/**
 * purchase/pages/invoices/PaymentApproval.jsx
 * ------------------------------------------------------------------
 * Payment Approval Workflow — review and approve submitted invoices
 * for payment. Only invoices with a passed three-way match (Matched)
 * are eligible. Includes: eligibility-gated table, status-aware row
 * actions, bulk approval with mixed-eligibility guard, approval
 * detail drawer, and real-time KPI/status refresh.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Download, Eye,
  FileText, History, Link2, RefreshCw, Wallet, X
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState,
  PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell
} from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import useKpiFilter from '../../hooks/useKpiFilter';
import { invoiceService } from '../../services/invoice';
import { INVOICE_STATUS, MATCH_STATUS } from '../../constants';
import { isPaymentPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import {
  formatAmount, isApprovalEligible, getApprovalBlockReasons,
  getInvoiceActions
} from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import ApprovalDetailDrawer from './ApprovalDetailDrawer';
import InvoiceDetailDrawer from './InvoiceDetailDrawer';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ─── Column set for approval context ─────────────────────────── */
const APPROVAL_COLUMNS = [
  { key: 'invoiceNo', label: 'Invoice No', width: 140, sortable: true, visible: true, sticky: 'left' },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'poNo', label: 'PO No', width: 130, sortable: true, visible: true },
  { key: 'invoiceDate', label: 'Invoice Date', width: 120, sortable: true, visible: true },
  { key: 'dueDate', label: 'Due Date', width: 120, sortable: true, visible: true },
  { key: 'total', label: 'Amount', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'matchStatus', label: 'Matching', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'status', label: 'Approval Status', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/* ─── Status Tabs ─────────────────────────────────────────────── */
const STATUS_TABS = [
  { key: INVOICE_STATUS.SUBMITTED, label: 'Submitted' },
  { key: INVOICE_STATUS.APPROVED, label: 'Approved' },
  { key: INVOICE_STATUS.PAID, label: 'Paid' },
  { key: INVOICE_STATUS.OVERDUE, label: 'Overdue' }
];

/* ─── KPI Definitions ─────────────────────────────────────────── */
const KPI_DEFS = [
  { key: 'pendingApproval', label: 'Pending Approval', icon: Wallet, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'Approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'Paid', label: 'Paid', icon: CheckCircle2, color: '#0284c7', bg: 'rgba(2,132,199,0.10)' },
  { key: 'outstanding', label: 'Outstanding', icon: Wallet, color: '#d97706', bg: 'rgba(217,119,6,0.10)', currency: true }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function PaymentApproval() {
  const navigate = useNavigate();
  const toast = useToast();

  /* ─── Data fetching ─────────────────────────────────────────── */
  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      const response = await invoiceService.getInvoices({
        search,
        status: filters.status || 'All',
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
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    search,
    sortKey,
    sortDirection,
    filters,
    setSearch,
    setFilter,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  /* ─── Local state ───────────────────────────────────────────── */
  const [columns, setColumns] = useState(() => APPROVAL_COLUMNS.map((c) => ({ ...c })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  /* View Invoice — read-only overview drawer */
  const [viewDrawerOpen, setViewDrawerOpen] = useState(false);
  const [viewDrawerInvoiceId, setViewDrawerInvoiceId] = useState(null);
  /* Review — approval workspace drawer */
  const [reviewDrawerOpen, setReviewDrawerOpen] = useState(false);
  const [reviewDrawerInvoiceId, setReviewDrawerInvoiceId] = useState(null);
  /* Matching — inline three-way comparison modal */
  const [matchModalInvoice, setMatchModalInvoice] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => { setSearch(debouncedSearch); }, [debouncedSearch, setSearch]);

  /* ─── Stats (real-time) ─────────────────────────────────────── */
  const loadStats = useCallback(() => {
    invoiceService.getInvoiceStats().then((data) => {
      if (!data) return;
      /* Compute pendingApproval from raw records — count submitted + matched */
      invoiceService.getInvoices({ status: INVOICE_STATUS.SUBMITTED, page: 1, pageSize: 10000 })
        .then((result) => {
          const pending = (result.data || []).filter((r) => r.matchStatus === MATCH_STATUS.MATCHED).length;
          setStats({ ...data, pendingApproval: pending });
        })
        .catch(() => setStats(data));
    }).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshAll = useCallback(() => {
    refresh();
    loadStats();
  }, [refresh, loadStats]);

  /* ─── Column toggles ────────────────────────────────────────── */
  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };
  const showAllColumns = () => setColumns((prev) => prev.map((c) => (c.key === 'actions' ? c : { ...c, visible: true })));
  const hideAllColumns = () => setColumns((prev) => prev.map((c) => (c.key === 'invoiceNo' || c.key === 'actions' ? c : { ...c, visible: false })));

  /* ─── KPI cards ─────────────────────────────────────────────── */
  const kpiCards = KPI_DEFS.map((def) => ({
    ...def,
    value: def.currency ? formatAmount(stats?.[def.key] ?? 0) : String(stats?.[def.key] ?? 0)
  }));

  /* Shared KPI ↔ status-tab bridge (same interaction model as
     Invoice Management). */
  const { activeKpi, selectKpi, selectToken } = useKpiFilter({
    kpiMap: {
      pendingApproval: INVOICE_STATUS.SUBMITTED,
      Approved: INVOICE_STATUS.APPROVED,
      Paid: INVOICE_STATUS.PAID,
      outstanding: 'All'
    },
    tokenKpi: {
      'All': null,
      [INVOICE_STATUS.SUBMITTED]: 'pendingApproval',
      [INVOICE_STATUS.APPROVED]: 'Approved',
      [INVOICE_STATUS.PAID]: 'Paid',
      [INVOICE_STATUS.OVERDUE]: null
    },
    allToken: 'All',
    allKpi: null,
    initialKpi: null,
    applyToken: (token) => setFilter('status', token)
  });

  const resetKpiAndStatus = () => selectToken('All');

  const segments = STATUS_TABS.map((tab) => ({
    ...tab,
    count: stats?.[tab.key] ?? 0
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`;
  const hasFilters = Boolean(searchInput) || Boolean(filters.status);
  const resetAll = () => { setSearchInput(''); setSelectedIds([]); resetKpiAndStatus(); };

  /* ─── Drawers ───────────────────────────────────────────────── */
  const openViewDrawer = useCallback((invoice) => {
    setViewDrawerInvoiceId(invoice.id);
    setViewDrawerOpen(true);
  }, []);

  const openReviewDrawer = useCallback((invoice) => {
    setReviewDrawerInvoiceId(invoice.id);
    setReviewDrawerOpen(true);
  }, []);

  /* ─── Row actions (approval-specific, eligibility-gated) ──── */
  const handleRowAction = async (key, row) => {
    if (key === 'view' || key === 'details') {
      /* View Invoice — read-only overview */
      openViewDrawer(row);
    } else if (key === 'review') {
      /* Review — dedicated approval workspace */
      openReviewDrawer(row);
    } else if (key === 'edit') {
      navigate(`/purchase/invoices/${row.id}/edit`);
    } else if (key === 'match') {
      /* View Matching — open the three-way matching page with context */
      setMatchModalInvoice(row);
    } else if (key === 'approve') {
      if (!isApprovalEligible(row)) {
        const reasons = getApprovalBlockReasons(row);
        toast.error(reasons[0] || 'Invoice is not eligible for approval');
        return;
      }
      setConfirmAction({ type: 'approve', record: row });
    } else if (key === 'reject') {
      setConfirmAction({ type: 'reject', record: row });
    } else if (key === 'correct') {
      setConfirmAction({ type: 'correct', record: row });
    } else if (key === 'resubmit') {
      const result = await runMutation(() => invoiceService.resubmitInvoice(row.id));
      if (result.ok) {
        toast.success(`${row.invoiceNo} resubmitted`);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to resubmit');
      }
    } else if (key === 'proceed-payment') {
      navigate('/purchase/invoices/vendor-payment');
    } else if (key === 'view-advice') {
      navigate('/purchase/invoices/payment-advice');
    } else if (key === 'view-payment') {
      navigate('/purchase/invoices/vendor-payment');
    } else if (key === 'audit') {
      openViewDrawer(row);
    } else if (key === 'download') {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(`Invoice ${row.invoiceNo}`, 20, 20);
      doc.setFontSize(10);
      doc.text(`Vendor: ${row.vendor || '—'}`, 20, 30);
      doc.text(`PO No: ${row.poNo || '—'}`, 20, 36);
      doc.text(`Invoice Date: ${row.invoiceDate || '—'}`, 20, 42);
      doc.text(`Due Date: ${row.dueDate || '—'}`, 20, 48);
      doc.text(`Amount: ${row.total || '—'}`, 20, 54);
      doc.text(`Status: ${row.status || '—'}`, 20, 60);
      doc.text(`Match Status: ${row.matchStatus || '—'}`, 20, 66);
      doc.save(`${row.invoiceNo}.pdf`);
      toast.success('Invoice PDF downloaded');
    }
  };

  /* ─── Review drawer action handler (approve/reject/correct from drawer) ── */
  const handleReviewDrawerAction = useCallback(async (key, record, opts = {}) => {
    setReviewDrawerOpen(false);
    if (key === 'approve') {
      setConfirmAction({ type: 'approve', record, note: opts.note });
    } else if (key === 'reject') {
      setConfirmAction({ type: 'reject', record, reason: opts.reason });
    } else if (key === 'correct') {
      setConfirmAction({ type: 'correct', record, reason: opts.reason });
    }
  }, []);

  /* ─── Execute confirm action ────────────────────────────────── */
  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    try {
      let result;
      if (confirmAction.type === 'approve') {
        result = await runMutation(() => invoiceService.approveInvoice(confirmAction.record.id, { note: confirmAction.note || '' }));
        if (result.ok) {
          toast.success(`${confirmAction.record.invoiceNo} approved for payment`);
          refreshAll();
        }
      } else if (confirmAction.type === 'reject') {
        result = await runMutation(() => invoiceService.rejectInvoice(confirmAction.record.id, { reason: confirmAction.reason || '' }));
        if (result.ok) {
          toast.success(`${confirmAction.record.invoiceNo} rejected`);
          refreshAll();
        }
      } else if (confirmAction.type === 'correct') {
        result = await runMutation(() => invoiceService.requestCorrection(confirmAction.record.id, { reason: confirmAction.reason || '' }));
        if (result.ok) {
          toast.success(`Correction requested for ${confirmAction.record.invoiceNo}`);
          refreshAll();
        }
      }
      if (!result?.ok) {
        toast.error(result?.error?.message || 'Action failed');
      }
    } finally {
      setActionBusy(false);
      setConfirmAction(null);
    }
  };

  /* ─── Export ─────────────────────────────────────────────────── */
  const handleExport = async (type) => {
    try {
      const result = await invoiceService.getInvoices({ search, status: filters.status || 'All', page: 1, pageSize: 10000 });
      const all = result.data || [];
      const title = 'Payment Approval';
      if (type === 'excel') await exportExcel(columns, all, 'payment-approval');
      else if (type === 'pdf') await exportPdf({ title, columns, records: all, filename: 'payment-approval' });
      else if (type === 'csv') exportCsv(columns, all, 'payment-approval');
      else if (type === 'print') printTable(title, columns, all);
      toast.success('Payment approvals exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export');
    }
  };

  /* ─── Bulk approval (mixed-eligibility guard) ───────────────── */
  const selectedRecords = useMemo(
    () => records.filter((row) => selectedIds.includes(row.id)),
    [records, selectedIds]
  );

  const eligibleCount = useMemo(
    () => selectedRecords.filter((r) => isApprovalEligible(r)).length,
    [selectedRecords]
  );

  const allEligible = selectedRecords.length > 0 && eligibleCount === selectedRecords.length;
  const someEligible = eligibleCount > 0 && eligibleCount < selectedRecords.length;

  const bulkActions = useMemo(() => {
    const actions = [];
    if (allEligible) {
      actions.push({ key: 'bulk-approve', label: `Approve (${selectedRecords.length})`, icon: CheckCircle2 });
    } else if (someEligible) {
      actions.push({ key: 'bulk-approve-partial', label: `Approve Eligible (${eligibleCount}/${selectedRecords.length})`, icon: CheckCircle2 });
    }
    actions.push({ key: 'export', label: 'Export Selected', icon: Download });
    return actions;
  }, [allEligible, someEligible, selectedRecords.length, eligibleCount]);

  const handleBulk = async (key) => {
    if (key === 'bulk-approve') {
      if (!allEligible) {
        toast.error('Some selected invoices are not eligible for approval.');
        return;
      }
      const result = await runMutation(() => Promise.all(selectedRecords.map((r) => invoiceService.approveInvoice(r.id))));
      if (result.ok) {
        toast.success(`${selectedRecords.length} invoice(s) approved for payment`);
        setSelectedIds([]);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to approve invoices');
      }
    } else if (key === 'bulk-approve-partial') {
      toast.error('Some selected invoices are not eligible for approval. Deselect ineligible invoices first.');
    } else if (key === 'export') {
      if (selectedRecords.length === 0) { toast.info('No invoices selected'); return; }
      exportCsv(columns, selectedRecords, 'payment-approval-selected');
      toast.success(`${selectedRecords.length} invoices exported`);
    }
  };

  /* ─── Table renderers ───────────────────────────────────────── */
  const renderers = useMemo(
    () => ({
      invoiceNo: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openViewDrawer(row); }}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.invoiceNo}
        </button>
      ),
      vendor: (row) => (
        <div>
          <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>
          {row.correctionRequested && (
            <div className="text-[10px] font-bold text-amber-600 mt-0.5">Correction Requested</div>
          )}
        </div>
      ),
      poNo: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigate(`/purchase/orders/${row.poNo}`); }}
          className="font-semibold text-slate-600 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.poNo || '—'}
        </button>
      ),
      invoiceDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.invoiceDate)}</span>,
      dueDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.dueDate)}</span>,
      total: (row) => (
        <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.total)}</span>
      ),
      matchStatus: (row) => {
        const ms = row.matchStatus || 'Pending Match';
        return (
          <span title={(row.matchReasons || []).join('\n')}>
            <PurchaseStatusCell status={ms} />
          </span>
        );
      },
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate, openViewDrawer]
  );

  const handleRowClick = useCallback((row) => openViewDrawer(row), [openViewDrawer]);
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  /* ─── Confirm dialog messages ───────────────────────────────── */
  const confirmTitle = confirmAction?.type === 'approve'
    ? 'Approve invoice?'
    : confirmAction?.type === 'reject'
      ? 'Reject invoice?'
      : 'Request correction?';
  const confirmMessage = confirmAction?.type === 'approve'
    ? `${confirmAction?.record?.invoiceNo} will be approved and become payable in Vendor Payment.`
    : confirmAction?.type === 'reject'
      ? `${confirmAction?.record?.invoiceNo} will be rejected and moved back to draft. Please provide a reason.`
      : `A correction request will be sent for ${confirmAction?.record?.invoiceNo}. The vendor must resubmit. Please provide a reason.`;
  const confirmLabel = confirmAction?.type === 'approve'
    ? 'Approve for Payment'
    : confirmAction?.type === 'reject'
      ? 'Reject Invoice'
      : 'Send Correction Request';
  const confirmVariant = confirmAction?.type === 'approve' ? 'default' : 'danger';
  const confirmIcon = confirmAction?.type === 'approve' ? CheckCircle2 : AlertTriangle;

  /* ─── Render ────────────────────────────────────────────────── */
  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Payment Approval' }
        ],
        icon: CheckCircle2,
        title: 'Payment Approval',
        subtitle: 'Review and approve submitted invoices for payment'
      }}
      flowNav={<ModuleTabNav module="invoices" />}
      error={error}
      onRetry={refreshAll}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi, loading: stats == null }}
      tabs={{
        primary: {
          label: 'All Invoices',
          count: stats?.total ?? 0,
          active: !filters.status || filters.status === 'All',
          onSelect: () => { selectToken('All'); setSelectedIds([]); }
        },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: (status) => { selectToken(status); setSelectedIds([]); },
          ariaLabel: 'Invoice status'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            {(searchInput || filters.status) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="paymentApprovalSearchInput"
              placeholder="Search invoice / PO / vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Invoices"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['invoiceNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: handleBulk,
        id: 'approvalBulkActionBar'
      }}
      table={{
        columns: columns.filter((c) => c.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers,
        idColumn: 'invoiceNo',
        tableId: 'paymentApprovalTable',
        rowClass: (row) => {
          const classes = [pendingWorkClass(isPaymentPending(row))];
          if (isApprovalEligible(row)) classes.push('bg-emerald-50/40');
          return classes.filter(Boolean).join(' ');
        },
        alignCenter: ['status', 'matchStatus'],
        alignRight: ['total'],
        onRowClick: handleRowClick,
        rowActions: (row) => {
          const actions = getInvoiceActions(row);
          const items = [];
          if (row.status === INVOICE_STATUS.SUBMITTED) {
            /* Submitted → View Invoice, Review, Approve, Reject, View Matching, Request Correction */
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
            items.push({ key: 'review', label: 'Review', icon: FileText });
            if (actions.approve) {
              items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
            }
            if (actions.reject) {
              items.push({ key: 'reject', label: 'Reject', icon: AlertTriangle, danger: true });
            }
            items.push({ key: 'correct', label: 'Request Correction', icon: AlertTriangle });
            if (actions.match || actions.reviewMismatch || actions.resolveException) {
              items.push({ key: 'match', label: 'View Matching', icon: Link2 });
            }
          } else if (row.status === INVOICE_STATUS.APPROVED) {
            /* Approved → View Invoice, View Matching, Proceed to Payment */
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
            items.push({ key: 'match', label: 'View Matching', icon: Link2 });
            items.push({ key: 'proceed-payment', label: 'Proceed to Payment', icon: Wallet });
          } else if (row.status === INVOICE_STATUS.PAID) {
            /* Paid → View Invoice, View Payment */
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
            items.push({ key: 'view-payment', label: 'View Payment', icon: Wallet });
          } else if (row.status === INVOICE_STATUS.OVERDUE) {
            /* Overdue → View Invoice, View Payment */
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
            items.push({ key: 'view-payment', label: 'View Payment', icon: Wallet });
          } else if (row.status === INVOICE_STATUS.REJECTED) {
            /* Rejected → View Invoice, Review History */
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
            items.push({ key: 'audit', label: 'Review History', icon: History });
          } else {
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
          }
          if (actions.resubmit) {
            items.push({ key: 'resubmit', label: 'Resubmit', icon: RefreshCw });
          }
          items.push({ key: 'download', label: 'Download Invoice', icon: Download });
          return items;
        },
        onRowAction: handleRowAction,
        emptyContent: (
          <PurchaseEmptyState
            icon={Wallet}
            title="No Invoices Pending Approval"
            message="No invoices matching your criteria."
            action={
              hasFilters ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Filters
                </button>
              ) : undefined
            }
          />
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
      {/* Approve / Reject / Correct confirmation */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel={confirmLabel}
        variant={confirmVariant}
        icon={confirmIcon}
        loading={actionBusy}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {/* View Invoice — read-only overview */}
      <InvoiceDetailDrawer
        open={viewDrawerOpen}
        invoiceId={viewDrawerInvoiceId}
        onClose={() => setViewDrawerOpen(false)}
      />

      {/* Review — approval workspace */}
      <ApprovalDetailDrawer
        open={reviewDrawerOpen}
        invoiceId={reviewDrawerInvoiceId}
        onClose={() => setReviewDrawerOpen(false)}
        onAction={handleReviewDrawerAction}
      />

      {/* View Matching — navigate to matching page */}
      {matchModalInvoice && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={() => setMatchModalInvoice(null)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#EDF7F4] flex items-center justify-center">
                <Link2 className="w-5 h-5 text-[#0B4A3D]" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">View Three-Way Matching</div>
                <div className="text-xs text-slate-500">{matchModalInvoice.invoiceNo} — {matchModalInvoice.poNo}</div>
              </div>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Open the Three-Way Matching workspace to compare Purchase Order, Goods Receipt, and Invoice line by line.
            </p>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMatchModalInvoice(null)}
                className="px-3 py-2 rounded-lg text-xs font-bold text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setMatchModalInvoice(null);
                  navigate('/purchase/invoices/three-way-matching');
                }}
                className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] transition-colors cursor-pointer"
              >
                Open Matching Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </PurchaseListPage>
  );
}
