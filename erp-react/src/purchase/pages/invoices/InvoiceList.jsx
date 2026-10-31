/**
 * purchase/pages/invoices/InvoiceList.jsx
 * ------------------------------------------------------------------
 * Purchase Invoice Management — searchable, filterable, sortable grid
 * with status tabs, column visibility, status-aware row actions,
 * validity-gated bulk actions, and an inline detail drawer. Real-time:
 * every status change refreshes table rows, KPIs, tab counts,
 * payment eligibility and matching status immediately.
 *
 * Layout matches the Manufacturing/Packing page UX:
 *   Level 1: "All Invoices N" primary tab
 *   Level 2: Segmented status pills in bordered container
 *   Toolbar: Clear + Refresh left | Search + Export + Columns right
 *   Bulk: Status-aware actions with count
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Banknote, CheckCircle2, Download, Edit3, Eye, FileText,
  Link2, MinusCircle, Plus, PlusCircle, Printer, RefreshCw, Search, Send, Trash2, Wallet, X
} from 'lucide-react';
import { ConfirmDialog, Modal, NumberInput, SelectInput, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState,
  PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell
} from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import useKpiFilter from '../../hooks/useKpiFilter';
import { invoiceService } from '../../services/invoice';
import { INVOICE_COLUMNS, INVOICE_STATUS, MATCH_STATUS, PAYMENT_METHODS } from '../../constants';
import { isInvoicePending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import {
  formatAmount, derivePaymentStatus, getPaymentStatusBadge,
  getInvoiceActions, getBulkActions, formatAuditTimeline, getInvoiceOutstanding
} from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ─── Status Segments (Level 2 tabs) ──────────────────────────── */
const STATUS_SEGMENTS = [
  { key: INVOICE_STATUS.SUBMITTED, label: 'Submitted' },
  { key: INVOICE_STATUS.APPROVED, label: 'Approved' },
  { key: INVOICE_STATUS.PARTIAL, label: 'Partially Paid' },
  { key: INVOICE_STATUS.PAID, label: 'Paid' },
  { key: INVOICE_STATUS.OVERDUE, label: 'Overdue' },
  { key: INVOICE_STATUS.REJECTED, label: 'Rejected' },
  { key: INVOICE_STATUS.DRAFT, label: 'Draft' }
];

/* ─── KPI Definitions ─────────────────────────────────────────── */
const KPI_DEFS = [
  { key: 'total', label: 'Total Invoices', icon: FileText, color: '#4f46e5', bg: 'rgba(99,102,241,0.10)' },
  { key: 'Approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'outstanding', label: 'Outstanding', icon: Wallet, color: '#d97706', bg: 'rgba(217,119,6,0.10)', currency: true },
  { key: 'paidValue', label: 'Paid Value', icon: Banknote, color: '#0284c7', bg: 'rgba(2,132,199,0.10)', currency: true }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* ─── Blocking Reasons ────────────────────────────────────────── */
function getBlockReasons(invoice) {
  const reasons = [];
  const actions = getInvoiceActions(invoice);
  if (!actions.approve && invoice.status === INVOICE_STATUS.SUBMITTED) {
    if (invoice.matchStatus !== MATCH_STATUS.MATCHED) {
      reasons.push(`Three-way match is ${invoice.matchStatus || 'pending'} — must be Matched before approval`);
    }
  }
  if (!actions.recordPayment && [INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL].includes(invoice.status)) {
    if (invoice.matchStatus !== MATCH_STATUS.MATCHED) {
      reasons.push(`Payment blocked — match is ${invoice.matchStatus || 'pending'}`);
    }
    if (derivePaymentStatus(invoice) === 'Paid') {
      reasons.push('Invoice is already fully paid');
    }
  }
  return reasons;
}

export default function InvoiceList() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreate = can('invoices', 'create');
  const toast = useToast();

  /* ─── Data fetching ─────────────────────────────────────────── */
  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await invoiceService.getInvoices({
        search,
        status: filters.status || 'All',
        page,
        pageSize
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
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  /* ─── Local state ───────────────────────────────────────────── */
  const [columns, setColumns] = useState(() => INVOICE_COLUMNS.map((c) => ({ ...c })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [payFull, setPayFull] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditRecord, setAuditRecord] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  /* ─── Stats (real-time) ─────────────────────────────────────── */
  const loadStats = useCallback(() => {
    invoiceService.getInvoiceStats().then(setStats).catch(() => {});
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshStats = () => {
    invoiceService.getInvoiceStats().then(setStats).catch(() => {});
  };

  /* ─── Refresh both table + stats after any mutation ──────────── */
  const refreshAll = useCallback(() => {
    refresh();
    refreshStats();
  }, [refresh]);

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

  /* Shared KPI ↔ status-tab bridge (Invoice Management is the
     reference interaction model for every Invoice module). */
  const { activeKpi, selectKpi, selectToken } = useKpiFilter({
    kpiMap: {
      total: 'All',
      Approved: INVOICE_STATUS.APPROVED,
      outstanding: 'All',
      paidValue: INVOICE_STATUS.PAID
    },
    tokenKpi: {
      'All': 'total',
      [INVOICE_STATUS.APPROVED]: 'Approved',
      [INVOICE_STATUS.PAID]: 'paidValue'
    },
    allToken: 'All',
    allKpi: 'total',
    initialKpi: 'total',
    applyToken: (token) => setFilter('status', token)
  });

  const resetKpiAndStatus = () => selectToken('All');

  /* ─── Segmented status tabs with live counts ────────────────── */
  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: stats?.[seg.key] ?? 0
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}–${Math.min(page * pageSize, totalCount)} of ${totalCount}`;
  const hasFilters = Boolean(searchInput) || Boolean(filters.status);
  const resetAll = () => { resetFilters(); setSearchInput(''); setSelectedIds([]); resetKpiAndStatus(); };

  

  /* ─── Navigate to invoice overview ──────────────────────────── */
  const navigateToInvoice = useCallback((invoice) => {
    navigate(`/purchase/invoices/${invoice.id}`);
  }, [navigate]);

  /* ─── Row actions (status-aware) ────────────────────────────── */
  const handleRowAction = async (key, row) => {
    if (key === 'view' || key === 'details') {
      navigateToInvoice(row);
    } else if (key === 'credit-note' || key === 'debit-note') {
      navigate(`/purchase/invoices/notes/new?invoice=${row.id}&type=${encodeURIComponent(key === 'credit-note' ? 'Credit Note' : 'Debit Note')}`);
    } else if (key === 'edit') {
      navigate(`/purchase/invoices/${row.id}/edit`);
    } else if (key === 'match') {
      navigate('/purchase/invoices/three-way-matching');
    } else if (key === 'approve') {
      const reasons = getBlockReasons(row);
      if (reasons.length > 0) {
        toast.error(reasons[0]);
        return;
      }
      setConfirmAction({ type: 'approve', record: row });
    } else if (key === 'reject') {
      setConfirmAction({ type: 'reject', record: row });
    } else if (key === 'submit') {
      const result = await runMutation(() => invoiceService.submitInvoice(row.id));
      if (result.ok) {
        toast.success(`${row.invoiceNo} submitted for approval`);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to submit');
      }
    } else if (key === 'resubmit') {
      const result = await runMutation(() => invoiceService.resubmitInvoice(row.id));
      if (result.ok) {
        toast.success(`${row.invoiceNo} resubmitted for approval`);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to resubmit');
      }
    } else if (key === 'pay') {
      const reasons = getBlockReasons(row);
      if (reasons.length > 0) {
        toast.error(reasons[0]);
        return;
      }
      setPaymentTarget(row);
      setPayMethod(PAYMENT_METHODS[0]);
      setPayFull(true);
      setPayAmount('');
      setPaymentModalOpen(true);
    } else if (key === 'advice') {
      const result = await runMutation(() => invoiceService.generateAdvice(row.id));
      if (result.ok) {
        toast.success(`Advice generated for ${row.invoiceNo}`);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to generate advice');
      }
    } else if (key === 'send-advice') {
      const result = await runMutation(() => invoiceService.sendAdvice(row.id));
      if (result.ok) {
        toast.success(`Advice sent for ${row.invoiceNo}`);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to send advice');
      }
    } else if (key === 'delete') {
      setDeleteTarget(row);
      setConfirmOpen(true);
    } else if (key === 'print') {
      navigate(`/purchase/invoices/${row.id}/print`);
    } else if (key === 'audit') {
      setAuditRecord(row);
      setAuditModalOpen(true);
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
      doc.text(`Total: ${row.total || '—'}`, 20, 54);
      doc.text(`Status: ${row.status || '—'}`, 20, 60);
      doc.text(`Match Status: ${row.matchStatus || '—'}`, 20, 66);
      doc.save(`${row.invoiceNo}.pdf`);
      toast.success('Invoice PDF downloaded');
    }
  };

  /* ─── Confirm approve / reject ──────────────────────────────── */
  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    setActionBusy(true);
    try {
      if (confirmAction.type === 'approve') {
        const result = await runMutation(() => invoiceService.approveInvoice(confirmAction.record.id));
        if (result.ok) {
          toast.success(`${confirmAction.record.invoiceNo} approved`);
          refreshAll();
        } else {
          toast.error(result.error?.message || 'Failed to approve');
        }
      } else if (confirmAction.type === 'reject') {
        const result = await runMutation(() => invoiceService.rejectInvoice(confirmAction.record.id));
        if (result.ok) {
          toast.success(`${confirmAction.record.invoiceNo} rejected`);
          refreshAll();
        } else {
          toast.error(result.error?.message || 'Failed to reject');
        }
      }
    } finally {
      setActionBusy(false);
      setConfirmAction(null);
    }
  };

  /* ─── Confirm delete ────────────────────────────────────────── */
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.bulk) {
      const result = await runMutation(() => Promise.all(deleteTarget.bulk.map((id) => invoiceService.deleteInvoice(id))));
      if (result.ok) {
        toast.success(`${deleteTarget.bulk.length} invoice(s) deleted`);
        setSelectedIds([]);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to delete invoices');
      }
    } else {
      const result = await runMutation(() => invoiceService.deleteInvoice(deleteTarget.id));
      if (result.ok) {
        toast.success(`${deleteTarget.invoiceNo} deleted`);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to delete invoice');
      }
    }
    setConfirmOpen(false);
    setDeleteTarget(null);
  };

  /* ─── Payment modal confirm ─────────────────────────────────── */
  const confirmPayment = async () => {
    if (!paymentTarget) return;
    const result = await runMutation(() =>
      invoiceService.recordPayment(paymentTarget.id, { method: payMethod, full: payFull, amount: payAmount })
    );
    if (result.ok) {
      toast.success(payFull ? `${paymentTarget.invoiceNo} fully paid` : `${paymentTarget.invoiceNo} partially paid`);
      refreshAll();
    } else {
      toast.error(result.error?.message || 'Failed to record payment');
    }
    setPaymentModalOpen(false);
    setPaymentTarget(null);
  };

  

  /* ─── Export ─────────────────────────────────────────────────── */
  const handleExport = async (type) => {
    try {
      const result = await invoiceService.getInvoices({ search, status: filters.status || 'All', page: 1, pageSize: 10000 });
      const all = result.data || [];
      const title = 'Purchase Invoices';
      if (type === 'excel') await exportExcel(columns, all, 'purchase-invoices');
      else if (type === 'pdf') await exportPdf({ title, columns, records: all, filename: 'purchase-invoices' });
      else if (type === 'csv') exportCsv(columns, all, 'purchase-invoices');
      else if (type === 'print') printTable(title, columns, all);
      toast.success('Invoices exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export invoices');
    }
  };

  /* ─── Bulk actions (validity-gated, status-aware) ───────────── */
  const selectedRecords = useMemo(
    () => records.filter((row) => selectedIds.includes(row.id)),
    [records, selectedIds]
  );

  const validBulkActions = useMemo(() => {
    const base = getBulkActions(selectedRecords);
    const actions = [];
    if (base.some((a) => a.key === 'approve')) {
      actions.push({ key: 'bulk-approve', label: 'Submit for Approval', icon: Send });
    }
    actions.push({ key: 'export', label: 'Export Selected', icon: Download });
    if (base.some((a) => a.key === 'delete')) {
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return actions;
  }, [selectedRecords]);

  const handleBulk = async (key) => {
    if (key === 'bulk-approve') {
      const approvable = selectedRecords.filter((r) => getInvoiceActions(r).approve);
      if (approvable.length === 0) {
        toast.info('No selected invoices are eligible for approval');
        return;
      }
      const result = await runMutation(() => Promise.all(approvable.map((r) => invoiceService.approveInvoice(r.id))));
      if (result.ok) {
        toast.success(`${approvable.length} invoice(s) approved`);
        setSelectedIds([]);
        refreshAll();
      } else {
        toast.error(result.error?.message || 'Failed to approve invoices');
      }
    } else if (key === 'export') {
      if (selectedRecords.length === 0) { toast.info('No invoices selected'); return; }
      exportCsv(columns, selectedRecords, 'purchase-invoices-selected');
      toast.success(`${selectedRecords.length} invoices exported`);
    } else if (key === 'delete') {
      setDeleteTarget({ bulk: selectedIds });
      setConfirmOpen(true);
    }
  };

  /* ─── Table renderers ───────────────────────────────────────── */
  const renderers = useMemo(
    () => ({
      invoiceNo: (row) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); navigateToInvoice(row); }}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.invoiceNo}
        </button>
      ),
      vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
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
        const tones = {
          [MATCH_STATUS.MATCHED]: 'text-emerald-700 bg-emerald-50',
          [MATCH_STATUS.MISMATCH]: 'text-rose-600 bg-rose-50',
          [MATCH_STATUS.PENDING]: 'text-amber-700 bg-amber-50',
          [MATCH_STATUS.EXCEPTION]: 'text-slate-600 bg-slate-100'
        };
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${tones[ms] || 'text-slate-600 bg-slate-100'}`}
            title={(row.matchReasons || []).join('\n')}
          >
            {ms}
          </span>
        );
      },
      paymentStatus: (row) => {
        const badge = getPaymentStatusBadge(row);
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.color}`}>
            {badge.label}
          </span>
        );
      },
      outstanding: (row) => {
        /* Approved credit / debit notes shrink this balance. */
        const outstanding = getInvoiceOutstanding(row);
        return (
          <span className={`font-bold tabular-nums whitespace-nowrap ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>
            {formatAmount(outstanding)}
          </span>
        );
      },
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate, navigateToInvoice]
  );

  /* ─── Row click navigates to invoice overview ──────────────── */
  const handleRowClick = useCallback((row) => {
    navigateToInvoice(row);
  }, [navigateToInvoice]);

  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  /* ─── Render ────────────────────────────────────────────────── */
  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Invoice Management' }
        ],
        icon: FileText,
        title: 'Invoice Management',
        subtitle: 'Manage vendor invoices, three-way matching, approvals and payments',
        actions: canCreate ? (
          <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/invoices/new')}>
            <span className="erp-btn-icon"><Plus size={16} /></span> Record Invoice
          </button>
        ) : null
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
              id="invoiceSearchInput"
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
        actions: validBulkActions,
        onAction: handleBulk,
        id: 'invoiceBulkActionBar'
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
        renderers,
        idColumn: 'invoiceNo',
        tableId: 'invoiceTable',
        rowClass: (row) => pendingWorkClass(isInvoicePending(row)),
        alignCenter: ['status', 'matchStatus', 'paymentStatus'],
        alignRight: ['total', 'outstanding'],
        onRowClick: handleRowClick,
        rowActions: (row) => {
          const actions = getInvoiceActions(row);
          const status = row.status;
          const items = [];

          /* ── Always first: View ───────────────────────────── */
          items.push({ key: 'view', label: 'View', icon: Eye });

          /* ── Credit / Debit notes (real vendor invoices only) ── */
          const isNoteDoc = /credit note|debit note/i.test(String(row.invoiceType || ''));
          const canAdjust = !isNoteDoc && [
            INVOICE_STATUS.APPROVED, INVOICE_STATUS.PARTIAL,
            INVOICE_STATUS.PAID, INVOICE_STATUS.OVERDUE
          ].includes(status);
          if (canAdjust) {
            items.push({ key: 'credit-note', label: 'Credit Note', icon: MinusCircle, section: 'adjust' });
            items.push({ key: 'debit-note', label: 'Debit Note', icon: PlusCircle, section: 'adjust' });
          }

          /* ── Status-specific actions ──────────────────────── */
          if (status === INVOICE_STATUS.DRAFT) {
            if (actions.edit) items.push({ key: 'edit', label: 'Edit', icon: Edit3 });
            if (actions.submit) items.push({ key: 'submit', label: 'Submit', icon: Send });
            if (actions.delete) items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
          } else if (status === INVOICE_STATUS.SUBMITTED) {
            if (actions.match || actions.reviewMismatch || actions.resolveException) {
              items.push({ key: 'match', label: '3-Way Match', icon: Link2 });
            }
            if (actions.approve) items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
            if (actions.reject) items.push({ key: 'reject', label: 'Reject', icon: AlertTriangle, danger: true });
            items.push({ key: 'download', label: 'Download PDF', icon: Download });
            items.push({ key: 'print', label: 'Print', icon: Printer });
          } else if (status === INVOICE_STATUS.APPROVED) {
            if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', icon: Banknote });
            if (actions.generateAdvice || actions.sendAdvice) {
              items.push({ key: 'advice', label: 'Payment Advice', icon: FileText });
            }
            items.push({ key: 'download', label: 'Download PDF', icon: Download });
            items.push({ key: 'print', label: 'Print', icon: Printer });
          } else if (status === INVOICE_STATUS.PAID) {
            if (actions.generateAdvice || actions.sendAdvice) {
              items.push({ key: 'advice', label: 'Payment Advice', icon: FileText });
            }
            items.push({ key: 'download', label: 'Download PDF', icon: Download });
            items.push({ key: 'print', label: 'Print', icon: Printer });
          } else if (status === INVOICE_STATUS.PARTIAL) {
            if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', icon: Banknote });
            if (actions.generateAdvice || actions.sendAdvice) {
              items.push({ key: 'advice', label: 'Payment Advice', icon: FileText });
            }
            items.push({ key: 'download', label: 'Download PDF', icon: Download });
            items.push({ key: 'print', label: 'Print', icon: Printer });
          } else if (status === INVOICE_STATUS.REJECTED) {
            if (actions.edit) items.push({ key: 'edit', label: 'Edit', icon: Edit3 });
            if (actions.resubmit) items.push({ key: 'resubmit', label: 'Resubmit', icon: RefreshCw });
          } else if (status === INVOICE_STATUS.OVERDUE) {
            if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', icon: Banknote });
            if (actions.generateAdvice || actions.sendAdvice) {
              items.push({ key: 'advice', label: 'Payment Advice', icon: FileText });
            }
            items.push({ key: 'download', label: 'Download PDF', icon: Download });
            items.push({ key: 'print', label: 'Print', icon: Printer });
          }

          return items;
        },
        onRowAction: handleRowAction,
        emptyContent: (
          <PurchaseEmptyState
            icon={Search}
            title="No Invoices Found"
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
      {/* Delete confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        title={deleteTarget?.bulk ? 'Delete selected invoices?' : 'Delete invoice?'}
        message={
          deleteTarget?.bulk
            ? `This will permanently remove ${deleteTarget.bulk.length} invoice(s). This action cannot be undone.`
            : `This will permanently remove ${deleteTarget?.invoiceNo || 'this invoice'}. This action cannot be undone.`
        }
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setDeleteTarget(null); }}
      />

      {/* Approve / Reject confirmation */}
      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.type === 'approve' ? 'Approve invoice?' : 'Reject invoice?'}
        message={
          confirmAction?.type === 'approve'
            ? `${confirmAction?.record?.invoiceNo} will be approved and queued for payment.`
            : `${confirmAction?.record?.invoiceNo} will be rejected and moved back to draft.`
        }
        confirmLabel={confirmAction?.type === 'approve' ? 'Approve' : 'Reject'}
        variant={confirmAction?.type === 'approve' ? 'default' : 'danger'}
        icon={confirmAction?.type === 'approve' ? CheckCircle2 : AlertTriangle}
        loading={actionBusy}
        onConfirm={executeConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Payment modal */}
      <Modal
        open={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        title={paymentTarget ? `Record Payment — ${paymentTarget.invoiceNo}` : 'Record Payment'}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setPaymentModalOpen(false)} className="btn btn-ghost btn-sm">Cancel</button>
            <button type="button" onClick={confirmPayment} disabled={actionLoading} className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {actionLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />}
              Record Payment
            </button>
          </>
        }
      >
        {paymentTarget && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Invoice Total</span>
              <span className="text-lg font-bold text-slate-900 tabular-nums">{formatAmount(paymentTarget.total)}</span>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Method</label>
              <SelectInput value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="radio" checked={payFull} onChange={() => setPayFull(true)} className="accent-[#0B4A3D]" />
                Full payment
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input type="radio" checked={!payFull} onChange={() => setPayFull(false)} className="accent-[#0B4A3D]" />
                Partial payment
              </label>
            </div>
            {!payFull && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Amount</label>
                <NumberInput min="0" step="any" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder="0.00" ariaLabel="Partial payment amount" />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Audit timeline modal */}
      <Modal
        open={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        title={auditRecord ? `Audit — ${auditRecord.invoiceNo}` : 'Audit Timeline'}
        maxWidth="max-w-lg"
        footer={<button type="button" onClick={() => setAuditModalOpen(false)} className="btn btn-ghost btn-sm">Close</button>}
      >
        {auditRecord && (
          <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
            {formatAuditTimeline(auditRecord.auditHistory).length === 0 && (
              <p className="text-xs text-slate-500 py-4 text-center">No audit entries</p>
            )}
            {[...formatAuditTimeline(auditRecord.auditHistory)].reverse().map((entry, i) => {
              const actionLabels = {
                created: 'Invoice Created', submitted: 'Submitted', approved: 'Approved',
                rejected: 'Rejected', resubmitted: 'Resubmitted', payment_recorded: 'Payment Recorded',
                payment_scheduled: 'Payment Scheduled', advice_generated: 'Advice Generated', advice_sent: 'Advice Sent'
              };
              return (
                <div key={i} className="flex items-start gap-2.5 py-2.5">
                  <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#0B4A3D] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700">{actionLabels[entry.action] || entry.action}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{entry.actor || 'System'} · {entry.timeLabel}</div>
                    {entry.details?.note && <div className="text-[11px] text-slate-500 mt-0.5 italic">{entry.details.note}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>


    </PurchaseListPage>
  );
}
