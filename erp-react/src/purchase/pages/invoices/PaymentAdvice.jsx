/**
 * purchase/pages/invoices/PaymentAdvice.jsx
 * ------------------------------------------------------------------
 * Payment Advice — complete workflow for generating, managing and
 * sending payment advices to vendors.
 *
 * Data sources:
 *   1. Existing issued advices (from advicesStore)
 *   2. Eligible paid invoices — paid but no advice yet
 *
 * Workflow:
 *   Vendor Payment → Paid → (auto-available here) → Generate Advice →
 *   Issued → Sent
 *
 * Notes:
 *   - An advice is Issued when a payment advice has been generated for a
 *     paid invoice (it references the Payment No., Invoice No., Vendor, PO,
 *     Paid On, Payment Method, Amount and Status).
 *   - An advice is Sent when it was actually sent to the vendor (not merely
 *     because it was generated / Issued).
 *   - Payment Advice is a downstream output of a vendor payment, not a
 *     prerequisite for Credit / Debit Notes. Notes are invoice adjustments
 *     that can happen independently before or after payment.
 *
 * Actions: View, Generate, Regenerate, Download PDF, Print,
 *          Send to Vendor, View Audit
 *
 * Bulk: Export, Generate Advice, Download, Send
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Banknote, CheckCircle2, Clock3, Download, Eye, FileText,
  LayoutDashboard, Printer, RefreshCw, Send, X
} from 'lucide-react';
import { ConfirmDialog, Modal, TextArea, TextInput, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState,
  PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell
} from '../../components/list';
import { invoiceService } from '../../services/invoice';
import { ADVICE_STATUS } from '../../constants';
import { formatAmount } from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import useKpiFilter from '../../hooks/useKpiFilter';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

import usePurchaseAccess from '../../access/usePurchaseAccess';
/* ═══════════════════════════════════════════════════════════════════ */
/*  Constants                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

const COMPANY_INFO = {
  name: 'ABC Manufacturing Pvt Ltd',
  address: 'Pune Plant - Main Gate, Pune 411001, India',
  phone: '+91 20 2567 8900',
  email: 'accounts@abcmanufacturing.in',
  gstin: '27AABCA1234C1Z5',
  pan: 'AABCA1234C'
};

const ADVICE_COLUMNS = [
  { key: 'adviceNo', label: 'Advice No', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'paymentNo', label: 'Payment No', width: 130, sortable: true, visible: true },
  { key: 'transactionReference', label: 'Txn Ref', width: 140, sortable: true, visible: true },
  { key: 'invoiceNo', label: 'Invoice No', width: 130, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'poNo', label: 'PO No', width: 120, sortable: true, visible: true },
  { key: 'paidOn', label: 'Paid On', width: 115, sortable: true, visible: true },
  { key: 'method', label: 'Method', width: 130, sortable: true, visible: true },
  { key: 'amount', label: 'Amount', width: 120, sortable: true, visible: true, align: 'right' },
  { key: 'status', label: 'Status', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];



const KPI_DEFS = [
  { key: 'totalAdvices', label: 'Total Advices', icon: FileText, color: '#4f46e5', bg: 'rgba(99,102,241,0.10)' },
  { key: 'issued', label: 'Issued', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'sent', label: 'Sent', icon: Send, color: '#0284c7', bg: 'rgba(2,132,199,0.10)' },
  { key: 'eligible', label: 'Awaiting Advice', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'totalValue', label: 'Total Value', icon: Banknote, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', currency: true }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                    */
/* ═══════════════════════════════════════════════════════════════════ */
export default function PaymentAdvice() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  /* Advices are the payment step of an invoice — Payments · Pay. */
  const canPay = can('payments', 'pay');
  const toast = useToast();

  /* ─── Data State ─── */
  const [activeTab, setActiveTab] = useState('advices'); // 'advices' | 'eligible'
  const [adviceStatus, setAdviceStatus] = useState('All'); // 'All' | Issued | Sent (within advices tab; Issued does not mean Sent)
  const [advices, setAdvices] = useState([]);
  const [eligibleInvoices, setEligibleInvoices] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── UI State ─── */
  const [columns, setColumns] = useState(() => ADVICE_COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortKey, setSortKey] = useState('adviceNo');
  const [sortDirection, setSortDirection] = useState('asc');

  /* ─── Modal State ─── */
  const [sendModal, setSendModal] = useState(null); // advice or invoice row
  const [sendForm, setSendForm] = useState({ recipient: '', subject: '', message: '' });
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [auditModal, setAuditModal] = useState(null);

  /* ─── Document Chain Modal ─── */
  const [chain, setChain] = useState(null);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  /* ─── Row Actions (shared ⋮ menu) ─────────────────────────────── */
  const tableRowActions = useCallback((row) => {
    const actions = [];
    if (activeTab === 'advices') {
      const adviceStatus = row.status === ADVICE_STATUS.SENT ? 'Sent' : 'Issued';
      actions.push({ key: 'view-advice', label: 'View Advice', icon: Eye });
      actions.push({ key: 'view-invoice', label: 'View Invoice', icon: FileText });
      actions.push({ key: '360', label: '360° view', icon: LayoutDashboard });
      actions.push({ key: 'download', label: 'Download Advice', icon: Download });
      actions.push({ key: 'print', label: 'Print Advice', icon: Printer });
      if (adviceStatus === 'Issued' && canPay) {
        actions.push({ key: 'send', label: 'Send Advice', icon: Send });
      }
      actions.push({ key: 'audit', label: 'View Audit', icon: Eye });
    } else {
      /* Eligible (Awaiting Advice) tab — no payment exists yet, so the
         360° view opens the invoice's chain instead. */
      actions.push({ key: 'view-invoice', label: 'View Invoice', icon: Eye });
      actions.push({ key: '360', label: '360° view', icon: LayoutDashboard });
      if (canPay) {
        actions.push({ key: 'generate', label: 'Generate Advice', icon: FileText });
        actions.push({ key: 'preview', label: 'Preview Advice', icon: FileText });
        actions.push({ key: 'send', label: 'Send Advice', icon: Send });
      }
    }
    return actions;
  }, [activeTab, canPay]);

  /* ─── Load Data ─── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [adviceList, eligible] = await Promise.all([
        invoiceService.getPaymentAdvices(),
        invoiceService.getEligibleInvoices()
      ]);
      setAdvices(adviceList);
      setEligibleInvoices(eligible);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load, refreshKey]);

  /* ─── Column Management ─── */
  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () => setColumns((prev) => prev.map((col) => col.key === 'actions' ? col : { ...col, visible: true }));
  const hideAllColumns = () => setColumns((prev) => prev.map((col) => (col.key === (activeTab === 'advices' ? 'adviceNo' : 'invoiceNo') || col.key === 'actions' ? col : { ...col, visible: false })));

  /* ─── Filtering ─── */
  const sourceData = activeTab === 'advices' ? advices : eligibleInvoices;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sourceData.filter((row) => {
      if (activeTab === 'advices' && adviceStatus !== 'All' && row.status !== adviceStatus) return false;
      if (!q) return true;
      const fields = activeTab === 'advices'
        ? [row.adviceNo, row.paymentNo, row.transactionReference, row.invoiceNo, row.vendor, row.poNo]
        : [row.invoiceNo, row.vendor, row.poNo];
      return fields.filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [sourceData, query, activeTab, adviceStatus]);

  /* ─── Sorting ─── */
  const sorted = useMemo(() => {
    const numericKeys = ['amount', 'total', 'paidAmount'];
    const valueOf = (row, key) => {
      if (numericKeys.includes(key)) return Number(row[key]) || 0;
      return String(row[key] ?? '').toLowerCase();
    };
    return [...filtered].sort((a, b) => {
      const aValue = valueOf(a, sortKey);
      const bValue = valueOf(b, sortKey);
      if (aValue === bValue) return 0;
      const cmp = aValue > bValue ? 1 : -1;
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDirection]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDirection('asc'); }
    setPage(1);
  };

  /* ─── Pagination ─── */
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageInfo = `Showing ${sorted.length > 0 ? (safePage - 1) * pageSize + 1 : 0}-${Math.min(safePage * pageSize, sorted.length)} of ${sorted.length}`;

  /* ─── KPIs ─── */
  const stats = useMemo(() => ({
    totalAdvices: advices.length,
    issued: advices.filter((a) => a.status === ADVICE_STATUS.ISSUED || (!a.sentOn && a.status !== ADVICE_STATUS.SENT)).length,
    sent: advices.filter((a) => a.status === ADVICE_STATUS.SENT).length,
    eligible: eligibleInvoices.length,
    totalValue: advices.reduce((sum, a) => sum + (Number(a.amount) || 0), 0)
  }), [advices, eligibleInvoices]);

  const kpiCards = KPI_DEFS.map((def) => ({
    ...def,
    value: def.currency ? formatAmount(stats?.[def.key] ?? 0) : String(stats?.[def.key] ?? 0)
  }));

  /* Shared KPI ↔ view/status bridge (same interaction model as
     Invoice Management). The advice page has two data views
     (Advices / Awaiting Advice) and advice states (Issued / Sent).
     Issued here means a payment advice has been generated; it is independent
     of Sent and of Credit / Debit Note adjustments, which are invoice-ledger
     operations. */
  const { activeKpi, selectKpi, selectToken } = useKpiFilter({
    kpiMap: {
      totalAdvices: 'all',
      issued: 'issued',
      sent: 'sent',
      eligible: 'eligible',
      totalValue: 'all'
    },
    tokenKpi: {
      'all': 'totalAdvices',
      issued: 'issued',
      sent: 'sent',
      eligible: 'eligible'
    },
    allToken: 'all',
    allKpi: 'totalAdvices',
    initialKpi: null,
    applyToken: (token) => {
      if (token === 'eligible') {
        setActiveTab('eligible');
        setAdviceStatus('All');
      } else if (token === 'issued') {
        setActiveTab('advices');
        setAdviceStatus(ADVICE_STATUS.ISSUED);
      } else if (token === 'sent') {
        setActiveTab('advices');
        setAdviceStatus(ADVICE_STATUS.SENT);
      } else {
        setActiveTab('advices');
        setAdviceStatus('All');
      }
    }
  });

  const hasAdviceFilter = activeTab === 'advices' && adviceStatus !== 'All';

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Actions                                                          */
  /* ═══════════════════════════════════════════════════════════════════ */

  const runAction = useCallback(async (action, data, options = {}) => {
    setActionLoading(true);
    try {
      switch (action) {
        case 'generate':
          await invoiceService.generateAdvice(data.id);
          toast.success(`Advice generated for ${data.invoiceNo}`);
          break;
        case 'regenerate':
          await invoiceService.regenerateAdvice(data.id);
          toast.success(`Advice regenerated for ${data.invoiceNo}`);
          break;
        case 'send':
          await invoiceService.sendAdviceWithDetails(data.id, options);
          toast.success(`Advice sent for ${data.invoiceNo}`);
          break;
        default:
          break;
      }
      refresh();
    } catch (err) {
      toast.error(err?.message || `Failed to ${action}`);
    } finally {
      setActionLoading(false);
    }
  }, [refresh, toast]);

  /* ─── Generate Advice ─── */
  const handleGenerate = (row) => {
    setConfirmDialog({
      title: 'Generate Payment Advice?',
      message: `Generate a payment advice for ${row.invoiceNo} — ${row.vendor}? This will create an official advice document.`,
      action: 'generate',
      data: row
    });
  };

  /* ─── Regenerate Advice (available via row action in advices tab) ─── */

  /* ─── Send Advice ─── */
  const openSendModal = (row) => {
    setSendModal(row);
    setSendForm({
      recipient: row.vendorEmail || '',
      subject: `Payment Advice — ${row.invoiceNo || row.adviceNo}`,
      message: `Dear ${row.vendor},\n\nPlease find attached the payment advice for Invoice ${row.invoiceNo}.\n\nPayment Details:\n- Amount: ${formatAmount(row.amount || row.total)}\n- Method: ${row.method || row.paymentMethod}\n- Date: ${row.paidOn || row.paymentDate}\n\nPlease acknowledge receipt.\n\nRegards,\n${COMPANY_INFO.name}`
    });
  };

  const confirmSend = async () => {
    if (!sendModal) return;
    await runAction('send', sendModal, sendForm);
    setSendModal(null);
  };

  /* ─── Helpers — content generation and download ─── */
  const generateAdviceContent = useCallback((row) => {
    const paidOn = row.paidOn || row.paymentDate || 'N/A';
    const method = row.method || row.paymentMethod || 'N/A';
    const amount = row.amount || row.total || 0;
    return [
      `<div class="header">`,
      `<h1>${COMPANY_INFO.name}</h1>`,
      `<p>${COMPANY_INFO.address}</p>`,
      `<p>GSTIN: ${COMPANY_INFO.gstin} | PAN: ${COMPANY_INFO.pan}</p>`,
      `<p>Phone: ${COMPANY_INFO.phone} | Email: ${COMPANY_INFO.email}</p>`,
      `</div>`,
      `<hr/>`,
      `<h2>PAYMENT ADVICE</h2>`,
      `<table>`,
      `<tr><th>Advice No</th><td>${row.adviceNo || 'Pending'}</td></tr>`,
      `<tr><th>Payment No</th><td>${row.paymentNo || 'N/A'}</td></tr>`,
      `<tr><th>Transaction Reference</th><td>${row.transactionReference || 'N/A'}</td></tr>`,
      `<tr><th>Invoice No</th><td>${row.invoiceNo}</td></tr>`,
      `<tr><th>PO No</th><td>${row.poNo || 'N/A'}</td></tr>`,
      `<tr><th>Vendor</th><td>${row.vendor}</td></tr>`,
      `<tr><th>Payment Date</th><td>${paidOn}</td></tr>`,
      `<tr><th>Payment Method</th><td>${method}</td></tr>`,
      `<tr><th>Amount Paid</th><td class="amount">${formatAmount(amount)}</td></tr>`,
      `<tr><th>Status</th><td>${row.status || 'Issued'}</td></tr>`,
      `</table>`,
      `<p style="margin-top:30px;font-size:12px;color:#666">`,
      `This is a system-generated payment advice. For queries, contact ${COMPANY_INFO.email}.`,
      `</p>`
    ].join('\n');
  }, []);

  /* ─── Download PDF ─── */
  const handleDownloadPdf = async (dlRow) => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const content = generateAdviceContent(dlRow);
    const text = content.replace(/<[^>]+>/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    const lines = doc.splitTextToSize(text, 170);
    doc.setFontSize(10);
    let y = 20;
    lines.forEach((line) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(line, 20, y);
      y += 5;
    });
    doc.save(`Payment-Advice-${dlRow.adviceNo || dlRow.invoiceNo}.pdf`);
    toast.success('Payment advice PDF downloaded');
  };

  /* ─── Print ─── */
  const handlePrint = useCallback((printRow) => {
    const content = generateAdviceContent(printRow);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`<html><head><title>Payment Advice ${printRow.adviceNo || printRow.invoiceNo}</title>`);
      printWindow.document.write('<style>body{font-family:Arial,sans-serif;padding:40px;max-width:800px;margin:0 auto}table{width:100%;border-collapse:collapse;margin:20px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f5f5f5;font-weight:bold}.header{text-align:center;margin-bottom:30px}.amount{font-size:18px;font-weight:bold;color:#0B4A3D}</style>');
      printWindow.document.write('</head><body>');
      printWindow.document.write(content);
      printWindow.document.write('</body></html>');
      printWindow.document.close();
      printWindow.print();
    }
  }, [generateAdviceContent]);

  const handleRowAction = useCallback((key, row) => {
    if (key === 'view-advice' || key === 'view-invoice') {
      navigate(`/purchase/invoices/${row.invoiceId || row.id}`);
    } else if (key === '360') {
      navigate(activeTab === 'advices'
        ? `/purchase/payments/${row.adviceNo || row.paymentNo || row.invoiceNo}/360`
        : `/purchase/invoices/${row.invoiceId || row.id}/360`);
    } else if (key === 'download') {
      handleDownloadPdf(row);
    } else if (key === 'print') {
      handlePrint(row);
    } else if (key === 'send') {
      openSendModal(row);
    } else if (key === 'generate') {
      handleGenerate(row);
    } else if (key === 'preview') {
      handleDownloadPdf(row);
    } else if (key === 'audit') {
      setAuditModal(row);
    }
  }, [navigate, handleDownloadPdf, handlePrint, openSendModal, handleGenerate, activeTab]);

  /* ─── Bulk Actions ─── */
  const handleBulkAction = async (key) => {
    if (key === 'export') {
      exportCsv(columns.filter((c) => c.key !== 'actions'), sorted, 'payment-advice');
      toast.success('Payment advices exported');
      return;
    }
    if (selectedIds.length === 0) {
      toast.info('No records selected');
      return;
    }
    if (activeTab === 'eligible') {
      if (key === 'generate') {
        const ids = selectedIds;
        setActionLoading(true);
        try {
          const result = await invoiceService.bulkGenerateAdvices(ids);
          toast.success(`${result.success} advice(s) generated`);
          if (result.failed > 0) toast.error(`${result.failed} failed`);
        } catch (err) {
          toast.error(err?.message || 'Bulk generation failed');
        } finally {
          setActionLoading(false);
          refresh();
        }
      }
    } else {
      if (key === 'send') {
        const ids = selectedIds;
        setActionLoading(true);
        try {
          const result = await invoiceService.bulkSendAdvices(ids);
          toast.success(`${result.success} advice(s) sent`);
          if (result.failed > 0) toast.error(`${result.failed} failed`);
        } catch (err) {
          toast.error(err?.message || 'Bulk send failed');
        } finally {
          setActionLoading(false);
          refresh();
        }
      }
      if (key === 'download') {
        selectedIds.forEach((id) => {
          const row = advices.find((a) => a.adviceNo === id);
          if (row) handleDownloadPdf(row);
        });
      }
    }
    setSelectedIds([]);
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Renderers                                                        */
  /* ═══════════════════════════════════════════════════════════════════ */

  const adviceRenderers = useMemo(() => ({
    adviceNo: (row) => (
      <div>
        <span className="font-bold text-[#0B4A3D] whitespace-nowrap">{row.adviceNo}</span>
        {row.paymentNo && <div className="text-[10px] text-slate-400">{row.paymentNo}</div>}
      </div>
    ),
    paymentNo: (row) => (
      <button type="button" onClick={() => setChain(row)} className="font-semibold text-slate-600 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap">
        {row.paymentNo || '—'}
      </button>
    ),
    transactionReference: (row) => <span className="text-slate-600 tabular-nums">{row.transactionReference || '—'}</span>,
    invoiceNo: (row) => (
      <button type="button" onClick={() => navigate(`/purchase/invoices/${row.invoiceId || row.id}`)} className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap">
        {row.invoiceNo}
      </button>
    ),
    vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
    poNo: (row) => (
      <button type="button" onClick={() => navigate(`/purchase/orders/${row.poNo}`)} className="font-semibold text-slate-600 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap">
        {row.poNo || '—'}
      </button>
    ),
    paidOn: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.paidOn)}</span>,
    method: (row) => <span className="text-slate-600">{row.method}</span>,
    amount: (row) => <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.amount)}</span>,
    status: (adviceRow) => {
      const adviceStatus = adviceRow.status === ADVICE_STATUS.SENT ? 'Sent' : 'Issued';
      return <PurchaseStatusCell status={adviceStatus} />;
    }
  }), [navigate, setChain]);

  const eligibleRenderers = useMemo(() => ({
    invoiceNo: (row) => (
      <button type="button" onClick={() => navigate(`/purchase/invoices/${row.id}`)} className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap">
        {row.invoiceNo}
      </button>
    ),
    vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
    poNo: (row) => (
      <button type="button" onClick={() => navigate(`/purchase/orders/${row.poNo}`)} className="font-semibold text-slate-600 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap">
        {row.poNo || '—'}
      </button>
    ),
    invoiceDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.invoiceDate)}</span>,
    total: (row) => <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.total)}</span>,
    paymentMethod: (row) => <span className="text-slate-600">{row.paymentMethod || '—'}</span>,
    paidAmount: (row) => <span className="font-bold text-emerald-700 tabular-nums whitespace-nowrap">{formatAmount(row.paidAmount)}</span>,
    status: () => <PurchaseStatusCell status="Paid" />
  }), [navigate]);

  const currentRenderers = activeTab === 'advices' ? adviceRenderers : eligibleRenderers;

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Bulk Config                                                      */
  /* ═══════════════════════════════════════════════════════════════════ */

  const bulkActions = activeTab === 'advices'
    ? [
        { key: 'export', label: 'Export', icon: Download },
        { key: 'download', label: 'Download PDF', icon: FileText },
        { key: 'send', label: 'Send to Vendor', icon: Send }
      ]
    : [
        { key: 'export', label: 'Export', icon: Download },
        { key: 'generate', label: 'Generate Advice', icon: FileText }
      ];

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Render                                                           */
  /* ═══════════════════════════════════════════════════════════════════ */

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Payment Advice' }
        ],
        icon: FileText,
        title: 'Payment Advice',
        subtitle: 'Generate, manage and send payment advices to vendors',
        actions: (
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={12} /> Refresh
          </button>
        )
      }}
      flowNav={<ModuleTabNav module="invoices" />}
      error={error}
      errorMessage="Failed to load payment advices."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: {
          label: activeTab === 'advices' ? 'Payment Advices' : 'Eligible Invoices',
          count: activeTab === 'advices' ? advices.length : eligibleInvoices.length,
          active: activeTab === 'advices',
          onSelect: () => { selectToken('all'); setSelectedIds([]); }
        },
        segments: {
          tabs: [
            { key: 'advices', label: 'Advices', count: advices.length },
            { key: 'eligible', label: 'Awaiting Advice', count: eligibleInvoices.length }
          ],
          activeKey: activeTab,
          onSelect: (key) => { selectToken(key === 'advices' ? 'all' : 'eligible'); setSelectedIds([]); },
          ariaLabel: 'Payment advice view'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            {(query || hasAdviceFilter) && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => { setQuery(''); selectToken('all'); setSelectedIds([]); }}
              >
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
              id="paymentAdviceSearchInput"
              placeholder={activeTab === 'advices' ? 'Search by advice no, invoice, vendor...' : 'Search by invoice, vendor, PO...'}
              value={query}
              onChange={setQuery}
              label="Search Payment Advices"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={() => handleBulkAction('export')} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={[activeTab === 'advices' ? 'adviceNo' : 'invoiceNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: handleBulkAction,
        id: 'paymentAdviceBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: pageRows,
        loading,
        selectable: true,
        selectedIds,
        allSelected: pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.adviceNo || row.invoiceNo)),
        someSelected: selectedIds.length > 0 && !(pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.adviceNo || row.invoiceNo))),
        onSelectAll: (checked) => setSelectedIds(checked ? pageRows.map((row) => row.adviceNo || row.invoiceNo) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers: currentRenderers,
        rowActions: tableRowActions,
        onRowAction: handleRowAction,
        idColumn: activeTab === 'advices' ? 'adviceNo' : 'invoiceNo',
        tableId: 'paymentAdviceTable',
        alignCenter: ['status'],
        alignRight: activeTab === 'advices' ? ['amount'] : ['total', 'paidAmount'],
        emptyContent: (
          activeTab === 'advices' ? (
            hasAdviceFilter ? (
              <PurchaseEmptyState
                icon={adviceStatus === ADVICE_STATUS.SENT ? Send : FileText}
                title={`No ${adviceStatus} Advices`}
                message={`No payment advices currently have a "${adviceStatus}" status.`}
                action={
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectToken('all')}>
                    <X size={12} /> Show All Advices
                  </button>
                }
              />
            ) : (
              <PurchaseEmptyState
                icon={FileText}
                title="No Payment Advices"
                message="No payment advices yet. Generate advices from paid invoices."
              />
            )
          ) : (
            <PurchaseEmptyState
              icon={Clock3}
              title="No Eligible Invoices"
              message="No paid invoices awaiting advice generation."
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
        onPageSizeChange: (size) => { setPageSize(size); setPage(1); }
      }}
    >
      {/* ── Send to Vendor Modal ── */}
      <Modal
        open={sendModal !== null}
        onClose={() => setSendModal(null)}
        title={`Send Advice — ${sendModal?.invoiceNo || sendModal?.adviceNo || ''}`}
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSendModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmSend}
              disabled={actionLoading || !sendForm.recipient.trim()}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading && <span className="animate-spin mr-1">⏳</span>}
              <Send size={12} /> Send Advice
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Company Info */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">From</p>
            <p className="text-xs font-semibold text-slate-700">{COMPANY_INFO.name}</p>
            <p className="text-[11px] text-slate-500">{COMPANY_INFO.email}</p>
          </div>

          {/* Vendor Info */}
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">To (Vendor)</p>
            <p className="text-xs font-semibold text-slate-700">{sendModal?.vendor || '—'}</p>
            <p className="text-[11px] text-slate-500">PO: {sendModal?.poNo || '—'}</p>
          </div>

          {/* Payment Summary */}
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-1">Payment Summary</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><span className="text-slate-500">Invoice:</span> <span className="font-semibold text-slate-700">{sendModal?.invoiceNo}</span></div>
              <div><span className="text-slate-500">Amount:</span> <span className="font-bold text-emerald-700">{formatAmount(sendModal?.amount || sendModal?.total || 0)}</span></div>
              <div><span className="text-slate-500">Method:</span> <span className="font-semibold text-slate-700">{sendModal?.method || sendModal?.paymentMethod || '—'}</span></div>
              <div><span className="text-slate-500">Date:</span> <span className="font-semibold text-slate-700">{sendModal?.paidOn || sendModal?.paymentDate || '—'}</span></div>
            </div>
          </div>

          {/* Send Form */}
          <TextInput
            label="Recipient Email *"
            value={sendForm.recipient}
            onChange={(e) => setSendForm((f) => ({ ...f, recipient: e.target.value }))}
            placeholder="vendor@example.com"
          />
          <TextInput
            label="Subject *"
            value={sendForm.subject}
            onChange={(e) => setSendForm((f) => ({ ...f, subject: e.target.value }))}
            placeholder="Payment Advice Subject"
          />
          <TextArea
            label="Message"
            rows={6}
            value={sendForm.message}
            onChange={(e) => setSendForm((f) => ({ ...f, message: e.target.value }))}
            placeholder="Payment advice message..."
          />
        </div>
      </Modal>

      {/* ── Confirm Dialog ── */}
      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel={confirmDialog?.action === 'regenerate' ? 'Regenerate' : 'Generate'}
        variant="default"
        icon={FileText}
        loading={actionLoading}
        onConfirm={() => {
          if (!confirmDialog) return;
          runAction(confirmDialog.action, confirmDialog.data);
          setConfirmDialog(null);
        }}
        onCancel={() => setConfirmDialog(null)}
      />

      {/* ── Audit Trail Modal ── */}
      <Modal
        open={auditModal !== null}
        onClose={() => setAuditModal(null)}
        title={`Audit Trail — ${auditModal?.adviceNo || auditModal?.invoiceNo || ''}`}
        maxWidth="max-w-lg"
        footer={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAuditModal(null)}>
            Close
          </button>
        }
      >
        {auditModal && (
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Advice No</p>
                <p className="font-semibold text-slate-700 mt-0.5">{auditModal.adviceNo || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice No</p>
                <p className="font-semibold text-slate-700 mt-0.5">{auditModal.invoiceNo}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Issued By</p>
                <p className="font-semibold text-slate-700 mt-0.5">{auditModal.issuedBy || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</p>
                <p className="font-semibold text-slate-700 mt-0.5">{auditModal.status || '—'}</p>
              </div>
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit History</p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {(auditModal.auditHistory || []).length > 0 ? (
                auditModal.auditHistory.slice().reverse().map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs border-l-2 border-slate-200 pl-3 py-1">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-700">{entry.action}</p>
                      <p className="text-slate-500">by {entry.actor} · {new Date(entry.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                      {entry.details?.reason && <p className="text-slate-400 italic mt-0.5">Reason: {entry.details.reason}</p>}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">No audit entries</p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Document Chain Modal ── */}
      <Modal
        open={chain !== null}
        onClose={() => setChain(null)}
        title={`Document Chain — ${chain?.adviceNo || ''}`}
        maxWidth="max-w-2xl"
        footer={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setChain(null)}>
            Close
          </button>
        }
      >
        {chain && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment No</p>
                <p className="font-semibold text-slate-700 mt-0.5">{chain.paymentNo || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transaction Ref</p>
                <p className="font-semibold text-slate-700 mt-0.5 tabular-nums">{chain.transactionReference || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid On</p>
                <p className="font-semibold text-slate-700 mt-0.5">{chain.paidOn ? formatDate(chain.paidOn) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Method</p>
                <p className="font-semibold text-slate-700 mt-0.5">{chain.method || '—'}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount</p>
                <p className="font-semibold text-slate-700 mt-0.5 tabular-nums">{formatAmount(chain.amount || 0)}</p>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid By</p>
                <p className="font-semibold text-slate-700 mt-0.5">{chain.paidBy || '—'}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[
                { label: 'PO', value: chain.poNo, to: `/purchase/orders/${chain.poNo}` },
                { label: 'Invoice', value: chain.invoiceNo, to: `/purchase/invoices/${chain.invoiceNo}` },
                { label: 'Payment', value: chain.paymentNo },
                { label: 'Advice', value: chain.adviceNo }
              ].filter((c) => c.value).map((chip, index) => (
                <div key={chip.label} className="flex items-center gap-2">
                  {index > 0 && <span className="text-slate-300">→</span>}
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{chip.label}</span>
                    {chip.to ? (
                      <button type="button" onClick={() => { setChain(null); navigate(chip.to); }} className="text-xs font-bold text-[#0B4A3D] hover:underline cursor-pointer">
                        {chip.value}
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-700">{chip.value}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </PurchaseListPage>
  );
}
