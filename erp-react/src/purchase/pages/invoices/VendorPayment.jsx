/**
 * purchase/pages/invoices/VendorPayment.jsx
 * ------------------------------------------------------------------
 * Vendor Payment — record full or partial payments against approved
 * invoices with outstanding balance. Filters to only show payable
 * invoices (approved, not fully paid, not rejected).
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote, BookOpen, CheckCircle2, Download, Eye, FileText, History,
  Loader2, RefreshCw, Search, Wallet, X, Landmark
} from 'lucide-react';
import { useToast } from '../../components/ui';
import { PurchaseListPage, PurchaseSearch, PurchaseEmptyState, PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell } from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import useKpiFilter from '../../hooks/useKpiFilter';
import { invoiceService } from '../../services/invoice';
import { INVOICE_STATUS, PAYMENT_STATUS } from '../../constants';
import { isPayable, formatAmount, derivePaymentStatus, getInvoiceActions, getInvoiceOutstanding } from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import PaymentDrawer from './PaymentDrawer';
import PaymentHistoryModal from './PaymentHistoryModal';
import PaymentLedgerModal from './PaymentLedgerModal';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const KPI_DEFS = [
  { key: 'total', label: 'Total Invoices', icon: Banknote, color: '#0284c7', bg: 'rgba(2,132,199,0.10)' },
  { key: 'payableValue', label: 'Total Payable', icon: Wallet, color: '#d97706', bg: 'rgba(217,119,6,0.10)', currency: true },
  { key: 'Paid', label: 'Paid Invoices', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'paidValue', label: 'Paid Value', icon: Banknote, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', currency: true }
];

const STATUS_SEGMENTS = [
  { key: INVOICE_STATUS.APPROVED, label: 'Unpaid' },
  { key: INVOICE_STATUS.PARTIAL, label: 'Partially Paid' },
  { key: INVOICE_STATUS.PAID, label: 'Paid' },
  { key: INVOICE_STATUS.OVERDUE, label: 'Overdue' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PAYMENT_COLUMNS = [
  { key: 'invoiceNo', label: 'Invoice No', visible: true },
  { key: 'vendor', label: 'Vendor', visible: true },
  { key: 'poNo', label: 'PO No', visible: true },
  { key: 'invoiceDate', label: 'Invoice Date', visible: true },
  { key: 'dueDate', label: 'Due Date', visible: true },
  { key: 'total', label: 'Invoice Amount', visible: true },
  { key: 'paidAmount', label: 'Paid Amount', visible: true },
  { key: 'outstanding', label: 'Outstanding', visible: true },
  { key: 'paymentStatus', label: 'Payment Status', visible: true },
  { key: 'actions', label: 'Actions', visible: true }
];

export default function VendorPayment() {
  const navigate = useNavigate();
  /* Payments is its own area (bounded by Purchase Invoice): recording, batch
     paying and reversing all need Payments · Pay, enforced server-side too. */
  const { can } = usePurchaseAccess();
  const canPay = can('payments', 'pay');
  const toast = useToast();

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
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
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

  const [columns, setColumns] = useState(() => PAYMENT_COLUMNS.map((col) => ({ ...col })));
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [payTarget, setPayTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [showBatchConfirm, setShowBatchConfirm] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [vendorBalances, setVendorBalances] = useState([]);
  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  useEffect(() => {
    let cancelled = false;
    invoiceService
      .getInvoiceStats()
      .then((data) => { if (!cancelled) setStats(data); })
      .catch(() => {});
    invoiceService
      .getVendorPaymentBalances()
      .then((data) => { if (!cancelled) setVendorBalances(data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const refreshStats = () => {
    invoiceService.getInvoiceStats().then(setStats).catch(() => {});
    invoiceService.getVendorPaymentBalances().then(setVendorBalances).catch(() => {});
  };

  const refreshAll = useCallback(() => {
    refresh();
    refreshStats();
  }, [refresh]);

  /* Counts come from the same lifecycle-status source the server filter
     uses (stats), not the derived payment state — otherwise the tab badge
     and the filtered table disagree (e.g. "Unpaid" counted by payment
     status but the API filters by invoice status). */
  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: stats?.[seg.key] ?? 0
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const resetAll = () => {
    resetFilters();
    setSearchInput('');
    setSelectedIds([]);
    resetKpiAndStatus();
  };

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };

  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'invoiceNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const payableRecords = useMemo(() => records.filter(isPayable), [records]);
  const selectedPayableRecords = useMemo(
    () => payableRecords.filter((r) => selectedIds.includes(r.id)),
    [payableRecords, selectedIds]
  );
  const selectedTotal = useMemo(
    () => selectedPayableRecords.reduce((sum, r) => sum + getInvoiceOutstanding(r), 0),
    [selectedPayableRecords]
  );

  const kpiCards = KPI_DEFS.map((def) => ({
    ...def,
    value: def.currency ? formatAmount(stats?.[def.key] ?? 0) : String(stats?.[def.key] ?? 0)
  }));

  /* Shared KPI ↔ status-tab bridge (same interaction model as
     Invoice Management). Filter vocabulary = invoice payment state
     (the same states the status segments already use). */
  const { activeKpi, selectKpi, selectToken } = useKpiFilter({
    kpiMap: {
      total: 'All',
      payableValue: 'All',
      Paid: INVOICE_STATUS.PAID,
      paidValue: INVOICE_STATUS.PAID
    },
    tokenKpi: {
      'All': 'total',
      [INVOICE_STATUS.APPROVED]: null,
      [INVOICE_STATUS.PARTIAL]: null,
      [INVOICE_STATUS.PAID]: 'Paid',
      [INVOICE_STATUS.OVERDUE]: null
    },
    allToken: 'All',
    allKpi: 'total',
    initialKpi: 'total',
    applyToken: (token) => setFilter('status', token)
  });

  const resetKpiAndStatus = () => selectToken('All');

  const handleRecordPayment = async (paymentData) => {
    const result = await runMutation(() =>
      invoiceService.recordPayment(payTarget.id, {
        method: paymentData.method,
        full: false,
        amount: paymentData.amount,
        paymentNo: paymentData.paymentNo,
        paymentDate: paymentData.paymentDate,
        transactionReference: paymentData.transactionReference,
        bank: paymentData.bankAccount,
        currency: paymentData.currency,
        exchangeRate: paymentData.exchangeRate,
        charges: paymentData.charges,
        tds: paymentData.tds,
        notes: paymentData.notes
      })
    );
    if (result.ok) {
      toast.success(`${payTarget.invoiceNo} payment recorded successfully`);
      setPayTarget(null);
      refresh();
      refreshStats();
    } else {
      toast.error(result.error?.message || 'Failed to record payment');
    }
  };

  const handleBatchPayment = async () => {
    if (selectedPayableRecords.length === 0) return;
    let successCount = 0;
    let failCount = 0;
    for (const rec of selectedPayableRecords) {
      /* Credit notes approved against an invoice reduce what we pay. */
      const outstanding = getInvoiceOutstanding(rec);
      if (outstanding <= 0) { failCount++; continue; }
      const result = await runMutation(() =>
        invoiceService.recordPayment(rec.id, {
          method: 'Bank Transfer',
          full: true,
          amount: outstanding
        })
      );
      if (result.ok) successCount++;
      else failCount++;
    }
    toast.success(`Payment batch: ${successCount} succeeded, ${failCount} failed`);
    setSelectedIds([]);
    setShowBatchConfirm(false);
    refresh();
    refreshStats();
  };

  const handleExport = async (type) => {
    try {
      const result = await invoiceService.getInvoices({ search: debouncedSearch, page: 1, pageSize: 10000 });
      const all = (result.data || []).filter(isPayable);
      const title = 'Vendor Payment';
      if (type === 'excel') await exportExcel(columns, all, 'vendor-payments');
      else if (type === 'pdf') await exportPdf({ title, columns, records: all, filename: 'vendor-payments' });
      else if (type === 'csv') exportCsv(columns, all, 'vendor-payments');
      else if (type === 'print') printTable(title, columns, all);
      toast.success('Payments exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export payments');
    }
  };

  const renderers = useMemo(
    () => ({
      invoiceNo: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/invoices/${row.id}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.invoiceNo}
        </button>
      ),
      vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
      poNo: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/orders/${row.poNo}`)}
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
      paidAmount: (row) => (
        <span className="font-semibold text-slate-600 tabular-nums whitespace-nowrap">{formatAmount(row.paidAmount || 0)}</span>
      ),
      outstanding: (row) => {
        /* Approved credit / debit notes adjust the payable balance. */
        const outstanding = getInvoiceOutstanding(row);
        return (
          <span className={`font-bold tabular-nums whitespace-nowrap ${outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
            {formatAmount(outstanding)}
          </span>
        );
      },
      paymentStatus: (row) => {
        const ps = derivePaymentStatus(row) || PAYMENT_STATUS.UNPAID;
        return <PurchaseStatusCell status={ps} />;
      }
    }),
    [navigate]
  );

  const handleBulk = async (key) => {
    if (key === 'export') {
      if (selectedIds.length === 0) { toast.info('No invoices selected'); return; }
      const selected = records.filter((r) => selectedIds.includes(r.id));
      exportCsv(columns, selected, 'vendor-payments-selected');
      toast.success(`${selected.length} invoices exported`);
    } else if (key === 'batch') {
      if (selectedPayableRecords.length === 0) { toast.info('No payable invoices selected'); return; }
      setShowBatchConfirm(true);
    } else if (key === 'pay') {
      if (selectedPayableRecords.length !== 1) { toast.info('Select exactly one invoice to record payment'); return; }
      const row = selectedPayableRecords[0];
      setPayTarget(row);
    }
  };

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Vendor Payment' }
        ],
        icon: Banknote,
        title: 'Vendor Payment',
        subtitle: 'Record payments against approved invoices with outstanding balances'
      }}
      flowNav={<ModuleTabNav module="invoices" />}
      error={error}
      onRetry={refreshAll}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi, loading: stats == null }}
      tabs={{
        primary: {
          label: 'All Payables',
          count: stats?.total ?? 0,
          active: !filters.status || filters.status === 'All',
          onSelect: () => { selectToken('All'); setSelectedIds([]); }
        },
        segments: {
          tabs: segments,
          activeKey: filters.status || 'All',
          onSelect: (status) => { selectToken(status); setSelectedIds([]); },
          ariaLabel: 'Payment status'
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
              id="vendorPaymentSearchInput"
              placeholder="Search invoice / PO / vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Payable Invoices"
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLedgerOpen(true)}>
              <BookOpen size={12} /> Payment Ledger
            </button>
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
        actions: [
          { key: 'export', label: 'Export Selected', icon: Download },
          { key: 'batch', label: 'Create Payment Batch', icon: Banknote },
          { key: 'pay', label: 'Record Payment', icon: Wallet },
        ],
        onAction: handleBulk,
        id: 'vendorPaymentBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected: records.length > 0 && records.every((row) => selectedIds.includes(row.id)),
        someSelected: selectedIds.length > 0 && !(records.length > 0 && records.every((row) => selectedIds.includes(row.id))),
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers,
        idColumn: 'invoiceNo',
        tableId: 'vendorPaymentTable',
        rowClass: (row) => {
          if (!isPayable(row)) return 'opacity-50 cursor-not-allowed';
          return '';
        },
        alignCenter: ['paymentStatus'],
        alignRight: ['total', 'paidAmount', 'outstanding'],
        rowActions: (row) => {
          const actions = getInvoiceActions(row);
          const paymentStatus = derivePaymentStatus(row);
          const items = [];
          items.push({ key: 'view', label: 'View Invoice', icon: Eye });
          if (paymentStatus === PAYMENT_STATUS.UNPAID) {
            /* Unpaid → View Invoice, View Approval, Record Payment */
            items.push({ key: 'view-approval', label: 'View Approval', icon: CheckCircle2 });
            if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', icon: Banknote });
          } else if (paymentStatus === PAYMENT_STATUS.PARTIALLY_PAID) {
            /* Partially Paid → View Invoice, View Payment History, Record Payment */
            if (actions.viewPaymentHistory) items.push({ key: 'history', label: 'Payment History', icon: History });
            if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', icon: Banknote });
          } else if (paymentStatus === PAYMENT_STATUS.PAID) {
            /* Paid → View Invoice, View Payment, Payment History, View Advice */
            items.push({ key: 'view-payment', label: 'View Payment', icon: Wallet });
            if (actions.viewPaymentHistory) items.push({ key: 'history', label: 'Payment History', icon: History });
            items.push({ key: 'view-advice', label: 'View Advice', icon: FileText });
          } else {
            items.push({ key: 'view', label: 'View Invoice', icon: Eye });
            if (actions.recordPayment) items.push({ key: 'pay', label: 'Record Payment', icon: Banknote });
            if (actions.viewPaymentHistory) items.push({ key: 'history', label: 'Payment History', icon: History });
          }
          if (actions.download) items.push({ key: 'download', label: 'Download Receipt', icon: Download });
          return items;
        },
        onRowAction: (key, row) => {
          if (key === 'view') navigate(`/purchase/invoices/${row.id}`);
          else if (key === 'pay') setPayTarget(row);
          else if (key === 'history') setHistoryTarget(row);
          else if (key === 'view-approval') navigate('/purchase/invoices/payment-approval');
          else if (key === 'view-payment') navigate(`/purchase/invoices/${row.id}`);
          else if (key === 'view-advice') navigate('/purchase/invoices/payment-advice');
          else if (key === 'download') toast.success(`Downloading receipt for ${row.invoiceNo}`);
        },
        emptyContent: (
          <PurchaseEmptyState
            icon={Search}
            title="No Payable Invoices"
            message="No approved invoices with outstanding balances found."
            action={
              searchInput ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSearchInput('')}>
                  <X size={12} /> Clear Search
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
      {selectedIds.length > 0 && selectedPayableRecords.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white rounded-xl shadow-2xl border border-slate-200 px-5 py-3 flex items-center gap-4">
          <span className="text-xs font-bold text-slate-700">
            {selectedPayableRecords.length} payable invoice{selectedPayableRecords.length !== 1 ? 's' : ''} selected
          </span>
          <span className="text-xs font-bold text-sky-700 tabular-nums">
            Total outstanding: {formatAmount(selectedTotal)}
          </span>
          <button
            type="button"
            onClick={() => setShowBatchConfirm(true)}
            disabled={actionLoading}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            {actionLoading && <Loader2 size={12} className="animate-spin" />}
            Create Payment Batch
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="text-[11px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      <PaymentDrawer
        open={payTarget !== null}
        invoice={payTarget}
        onClose={() => setPayTarget(null)}
        onConfirm={handleRecordPayment}
        actionLoading={actionLoading}
      />

      <PaymentHistoryModal
        open={historyTarget !== null}
        invoice={historyTarget}
        onClose={() => setHistoryTarget(null)}
        onChanged={() => { refresh(); refreshStats(); }}
      />

      <PaymentLedgerModal
        open={ledgerOpen}
        onClose={() => setLedgerOpen(false)}
        onChanged={() => { refresh(); refreshStats(); }}
      />

      {vendorBalances.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 mb-3">
            <Landmark size={14} className="text-slate-400" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Vendor Balances</h3>
            <span className="text-[10px] text-slate-400">Live from the payment ledger</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wide border-b border-slate-100">
                  <th className="py-1.5 pr-3">Vendor</th>
                  <th className="py-1.5 pr-3 text-right">Invoices</th>
                  <th className="py-1.5 pr-3 text-right">Invoiced</th>
                  <th className="py-1.5 pr-3 text-right">Net Payable</th>
                  <th className="py-1.5 pr-3 text-right">Credit Notes</th>
                  <th className="py-1.5 pr-3 text-right">Debit Notes</th>
                  <th className="py-1.5 pr-3 text-right">Paid</th>
                  <th className="py-1.5 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {vendorBalances.slice(0, 8).map((b) => (
                  <tr key={b.vendor} className="hover:bg-slate-50/60">
                    <td className="py-2 pr-3 font-semibold text-slate-700">{b.vendor}</td>
                    <td className="py-2 pr-3 text-right text-slate-500 tabular-nums">{b.invoices}</td>
                    <td className="py-2 pr-3 text-right text-slate-600 tabular-nums">{formatAmount(b.invoiced)}</td>
                    <td className="py-2 pr-3 text-right text-slate-600 tabular-nums">{formatAmount(b.netPayable)}</td>
                    <td className="py-2 pr-3 text-right text-emerald-600 font-semibold tabular-nums">{formatAmount(b.creditNotes || 0)}</td>
                    <td className="py-2 pr-3 text-right text-rose-600 font-semibold tabular-nums">{formatAmount(b.debitNotes || 0)}</td>
                    <td className="py-2 pr-3 text-right text-emerald-600 font-semibold tabular-nums">{formatAmount(b.paid)}</td>
                    <td className={`py-2 text-right font-bold tabular-nums ${b.outstanding > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{formatAmount(b.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showBatchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowBatchConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Confirm Payment Batch</h3>
            <p className="text-xs text-slate-500 mb-4">
              Record full payment for {selectedPayableRecords.length} invoice{selectedPayableRecords.length !== 1 ? 's' : ''}.
            </p>
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 mb-4 max-h-48 overflow-y-auto">
              {selectedPayableRecords.map((rec) => {
                const outstanding = getInvoiceOutstanding(rec);
                return (
                  <div key={rec.id} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                    <span className="text-xs font-semibold text-slate-700">{rec.invoiceNo}</span>
                    <span className="text-xs font-bold text-amber-600 tabular-nums">{formatAmount(outstanding)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Total to Pay</span>
              <span className="text-lg font-bold text-sky-700 tabular-nums">{formatAmount(selectedTotal)}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBatchConfirm(false)}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              {canPay && (
                <button
                  type="button"
                  onClick={handleBatchPayment}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white"
                >
                  {actionLoading && <Loader2 size={12} className="animate-spin" />}
                  Confirm Batch Payment
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PurchaseListPage>
  );
}
