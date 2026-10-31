/**
 * purchase/pages/invoices/InvoiceView.jsx
 * ------------------------------------------------------------------
 * Invoice Detail — full invoice (details, amounts, payment info) with
 * approval and payment recording actions. Built on the shared Purchase
 * page shell so it matches the master design.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Banknote, CheckCircle2, Clock3, FileDown, FileText, History, LayoutDashboard, Link2, Loader2, MinusCircle, Paperclip, Pencil, PlusCircle, Printer, RefreshCw, Receipt, Send, Trash2
} from 'lucide-react';
import { ConfirmDialog, Modal, NumberInput, SelectInput, useToast } from '../../components/ui';
import Tabs from '../../components/ui/Tabs';
import AttachmentList from '../../components/AttachmentList';
import SourceDocumentsDrawer from '../../components/SourceDocumentsDrawer';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { invoiceService } from '../../services/invoice';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { requisitionService } from '../../services/requisition';
import { rfqService } from '../../services/rfq';
import { logisticsService } from '../../services/logistics';
import { INVOICE_STATUS, MATCH_STATUS, PAYMENT_METHODS } from '../../constants';
import { formatAmount, getPaymentStatusBadge, formatAuditTimeline, getInvoiceOutstanding, isPayable } from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const VALUE = 'text-xs font-semibold text-slate-800';
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

function DetailItem({ label, value }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className={`${VALUE} mt-1`}>{value || '—'}</div>
    </div>
  );
}

const MATCH_TONES = {
  'Matched': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Partial': 'bg-amber-50 text-amber-700 border-amber-200',
  'Mismatch': 'bg-rose-50 text-rose-700 border-rose-200',
  'Blocked': 'bg-red-50 text-red-700 border-red-200',
  'Pending Match': 'bg-slate-50 text-slate-600 border-slate-200',
  'Exception': 'bg-orange-50 text-orange-700 border-orange-200'
};

const MATCH_ICONS = {
  'Matched': CheckCircle2,
  'Partial': AlertTriangle,
  'Mismatch': AlertTriangle,
  'Blocked': AlertTriangle,
  'Pending Match': Clock3,
  'Exception': AlertTriangle
};

function MatchPill({ status, reasons }) {
  const tone = MATCH_TONES[status] || 'bg-slate-100 text-slate-600 border-slate-200';
  const Icon = MATCH_ICONS[status] || AlertTriangle;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${tone}`}
      title={(reasons || []).join('\n')}
    >
      <Icon className="w-3 h-3" />
      {status || 'Not Computed'}
    </span>
  );
}

const VIEW_TABS = [
  { key: 'overview', label: 'Overview', icon: Receipt },
  { key: 'line-items', label: 'Line Items', icon: FileText },
  { key: 'three-way', label: '3-Way Match', icon: Link2 },
  { key: 'approval', label: 'Approval', icon: CheckCircle2 },
  { key: 'payment', label: 'Payment', icon: Banknote },
  { key: 'documents', label: 'Documents', icon: Paperclip },
  { key: 'activity', label: 'Activity', icon: History }
];

const PAYMENT_TONES = {
  'Unpaid': 'bg-slate-100 text-slate-700 border-slate-200',
  'Scheduled': 'bg-blue-50 text-blue-700 border-blue-200',
  'Processing': 'bg-amber-50 text-amber-700 border-amber-200',
  'Paid': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Partially Paid': 'bg-sky-50 text-sky-700 border-sky-200'
};

/* ─────────────────────────────────────────────────────────────────
 * ThreeWayMatchBar — visual three-way match status with exception states
 * ───────────────────────────────────────────────────────────────── */
function ThreeWayMatchBar({ matchStatus, invoiceNo, poNo, grnNo, invoiceAmount, poAmount, matchReasons }) {
  const hasReasons = (matchReasons || []).length > 0;
  const variance = (Number(invoiceAmount) || 0) - (Number(poAmount) || 0);
  const isMatched = matchStatus === 'Matched';
  const isPartial = matchStatus === 'Partial';
  const isMismatch = matchStatus === 'Mismatch' || matchStatus === 'Blocked';
  const isException = matchStatus === 'Exception';

  return (
    <div className={`rounded-xl border mb-4 overflow-hidden ${
      isMatched ? 'border-emerald-200 bg-emerald-50/30' :
      isPartial ? 'border-amber-200 bg-amber-50/30' :
      isMismatch || isException ? 'border-rose-200 bg-rose-50/30' :
      'border-slate-200 bg-white'
    }`}>
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Three-Way Match</span>
        </div>
        <MatchPill status={matchStatus} reasons={matchReasons} />
      </div>
      <div className="px-5 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Invoice */}
          <div className={`rounded-lg border px-3 py-2.5 ${
            isMatched ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice</div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">{invoiceNo || '—'}</div>
            <div className="text-sm font-extrabold text-slate-900 mt-0.5 tabular-nums">{formatAmount(invoiceAmount)}</div>
          </div>
          {/* PO */}
          <div className={`rounded-lg border px-3 py-2.5 ${
            isMatched ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchase Order</div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">{poNo || '—'}</div>
            <div className="text-sm font-extrabold text-slate-900 mt-0.5 tabular-nums">{formatAmount(poAmount)}</div>
          </div>
          {/* GRN */}
          <div className={`rounded-lg border px-3 py-2.5 ${
            isMatched ? 'border-emerald-200 bg-emerald-50/50' : 'border-slate-200 bg-white'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GRN</div>
            <div className="text-xs font-bold text-slate-800 mt-0.5">{grnNo || '—'}</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Goods Receipt Note</div>
          </div>
          {/* Variance */}
          <div className={`rounded-lg border px-3 py-2.5 ${
            isMatched ? 'border-emerald-200 bg-emerald-50/50' :
            variance > 0 ? 'border-rose-200 bg-rose-50/50' :
            variance < 0 ? 'border-amber-200 bg-amber-50/50' :
            'border-slate-200 bg-white'
          }`}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Variance</div>
            <div className={`text-sm font-extrabold mt-0.5 tabular-nums ${
              isMatched ? 'text-emerald-700' :
              variance > 0 ? 'text-rose-700' :
              variance < 0 ? 'text-amber-700' :
              'text-slate-800'
            }`}>
              {variance === 0 ? '₹0.00' : formatAmount(Math.abs(variance))}
            </div>
            <div className={`text-[10px] mt-0.5 font-semibold ${
              isMatched ? 'text-emerald-600' :
              variance > 0 ? 'text-rose-600' :
              variance < 0 ? 'text-amber-600' :
              'text-slate-500'
            }`}>
              {variance === 0 ? 'Exact match' : variance > 0 ? 'Overcharge' : 'Undercharge'}
            </div>
          </div>
        </div>
        {/* Exception reasons */}
        {hasReasons && (
          <div className="mt-3 space-y-1.5">
            {matchReasons.map((reason, i) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <AlertTriangle className="w-3 h-3 text-rose-500 mt-0.5 shrink-0" />
                <span className="font-semibold text-rose-700">{reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvoiceView() {
  const navigate = useNavigate();
  /* Action-level gates — the backend re-checks each on /api/purchase/invoices/**.
     Three-Way Matching and Payments are their own areas: an invoice may be
     readable while its match result and payment actions are not. */
  const { can } = usePurchaseAccess();
  const canEditInvoice = can('invoices', 'edit');
  const canSubmitInvoice = can('invoices', 'submit');
  const canApproveInvoice = can('invoices', 'approve');
  const canRejectInvoice = can('invoices', 'reject');
  const canDeleteInvoice = can('invoices', 'delete');
  const canPrintInvoice = can('invoices', 'print');
  const canPayInvoice = can('payments', 'pay');
  const canCreateNote = can('adjustmentNotes', 'create');
  const { id } = useParams();
  const toast = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'delete'
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [full, setFull] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState('');
  /* Document-chain links — PO (via the invoice), then PR / RFQ / GRNs. */
  const [linkedPo, setLinkedPo] = useState(null);
  const [linkedPr, setLinkedPr] = useState(null);
  const [linkedRfq, setLinkedRfq] = useState(null);
  const [linkedGrns, setLinkedGrns] = useState([]);
  /* Credit / Debit notes raised against this invoice. */
  const [linkedNotes, setLinkedNotes] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await invoiceService.getInvoice(id);
        if (cancelled) return;
        setRecord(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /* Best-effort document chain: PR → RFQ → PO → GRN → Invoice. Each link
     simply hides when its source document cannot be found. */
  useEffect(() => {
    let cancelled = false;
    if (!record?.poNo) return undefined;
    const loadChain = async () => {
      try {
        const po = await purchaseOrderService.getOrder(record.poNo);
        if (cancelled) return;
        setLinkedPo(po);
        const prNo = po.prNo || po.reference || '';
        if (prNo) {
          const result = await requisitionService.getRequisitions({ search: prNo, page: 1, pageSize: 10 });
          if (!cancelled) {
            const match = (result.data || []).find((pr) => pr.prNo === prNo);
            setLinkedPr(match ? { id: match.id, prNo: match.prNo } : null);
          }
        }
        if (po.rfqNo) {
          const rfqs = await rfqService.getRfqs({ rfqNo: po.rfqNo, page: 1, pageSize: 10 });
          if (!cancelled) {
            const rfqMatch = (rfqs.data || []).find((rfq) => rfq.rfqNo === po.rfqNo);
            setLinkedRfq(rfqMatch ? { id: rfqMatch.id, rfqNo: rfqMatch.rfqNo } : null);
          }
        }
        const grns = await logisticsService.getGrns({ search: record.poNo, page: 1, pageSize: 50 });
        if (!cancelled) {
          setLinkedGrns((grns.data || []).filter((grn) => grn.poNo === record.poNo).map((grn) => grn.grnNo));
        }
      } catch {
        /* Chain links are best-effort — never block the invoice view. */
      }
    };
    loadChain();
    return () => {
      cancelled = true;
    };
  }, [record?.poNo]);

  /* Credit / Debit notes linked to this original invoice. */
  useEffect(() => {
    let cancelled = false;
    if (!record?.invoiceNo) return undefined;
    invoiceService
      .getAdjustmentNotesForInvoice({ invoiceNo: record.invoiceNo })
      .then((result) => { if (!cancelled) setLinkedNotes(result.notes || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [record?.invoiceNo]);

  const runAction = async (operation, successMessage) => {
    setBusy(true);
    try {
      const updated = await operation();
      setRecord(updated);
      toast.success(successMessage);
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  };

  const recordPayment = async () => {
    if (!record) return;
    setBusy(true);
    try {
      const updated = await invoiceService.recordPayment(record.id, { method, full, amount: paymentAmount });
      setRecord(updated);
      toast.success(full ? `${record.invoiceNo} fully paid` : `${record.invoiceNo} partially paid`);
      setPaymentOpen(false);
      setPaymentAmount('');
    } catch (err) {
      toast.error(err?.message || 'Failed to record payment');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PurchasePageLayout className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </PurchasePageLayout>
    );
  }

  if (notFound || !record) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Invoice not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/invoices')}
            className="erp-btn-primary mt-4"
          >
            ← Back to Invoices
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const details = [
    { label: 'Vendor', value: record.vendor },
    {
      label: 'PO Reference',
      value: record.poNo ? (
        <button
          type="button"
          onClick={() => navigate(`/purchase/orders/${record.poNo}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
        >
          {record.poNo}
        </button>
      ) : (
        '—'
      )
    },
    { label: 'Invoice Date', value: formatDate(record.invoiceDate) },
    { label: 'Due Date', value: formatDate(record.dueDate) },
    { label: 'Payment Method', value: record.paymentMethod || '—' },
    { label: 'Payment Date', value: record.paymentDate ? formatDate(record.paymentDate) : '—' },
    { label: 'Three-Way Match', value: <MatchPill status={record.matchStatus} reasons={record.matchReasons} /> },
    { label: 'Status', value: <PurchaseStatusBadge status={record.status} /> }
  ];

  /* Complete document chain — PR → RFQ → PO → GRN → Invoice. */
  const chain = [
    { label: 'PR', value: linkedPr?.prNo || linkedPo?.prNo || linkedPo?.reference || null, to: linkedPr ? `/purchase/requisition/${linkedPr.id}` : null },
    { label: 'RFQ', value: linkedRfq?.rfqNo || linkedPo?.rfqNo || null, to: linkedRfq ? `/purchase/rfq/${linkedRfq.id}` : null },
    { label: 'PO', value: linkedPo?.poNo || record.poNo || null, to: linkedPo ? `/purchase/orders/${linkedPo.poNo}` : null },
    { label: 'GRN', value: linkedGrns.length ? linkedGrns.join(', ') : null, to: null },
    { label: 'Invoice', value: record.invoiceNo || null, to: null }
  ].filter((chip) => chip.value);

  /* The invoice payload does not carry the PO value; fall back to the
     linked purchase order's amount (best-effort chain load). */
  const poAmount = record.poTotal || record.poAmount || linkedPo?.amount;

  const paymentBadge = getPaymentStatusBadge(record);
  const paidAmount = Number(record.paidAmount) || 0;
  /* Outstanding is the adjusted balance — approved credit / debit notes
     and payments both count. */
  const outstanding = getInvoiceOutstanding(record);
  const adjustments = record.adjustments || { credit: 0, debit: 0, net: 0, count: 0 };
  /* Legacy Credit / Debit Note documents are adjustments themselves —
     notes are only raised against real vendor invoices. */
  const isNoteDocument = /credit note|debit note/i.test(String(record.invoiceType || ''));
  const auditEntries = formatAuditTimeline(record.auditHistory);

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: record.invoiceNo }
        ]}
        icon={FileText}
        title={record.invoiceNo}
        subtitle={record.vendor ? `Invoice from ${record.vendor}` : 'Purchase invoice'}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/invoices')} className="btn btn-ghost btn-sm">
              <ArrowLeft size={12} /> Back to Invoices
            </button>
            {canEditInvoice && (
              <button type="button" onClick={() => navigate(`/purchase/invoices/${record.id}/edit`)} className="btn btn-ghost btn-sm">
                <Pencil size={12} /> Edit
              </button>
            )}
            {/* Print fires the browser print dialog on the rendered Invoice
                document (?print=1); PDF Preview opens the same document
                on screen without printing — two distinct behaviors. */}
            {canPrintInvoice && (
              <>
                <button type="button" onClick={() => navigate(`/purchase/invoices/${record.id}/print?print=1`)} className="btn btn-ghost btn-sm">
                  <Printer size={12} /> Print
                </button>
                <button type="button" onClick={() => navigate(`/purchase/invoices/${record.id}/print`)} className="btn btn-ghost btn-sm">
                  <FileDown size={12} /> PDF Preview
                </button>
              </>
            )}
            <button type="button" onClick={() => navigate(`/purchase/invoices/${record.id}/360`)} className="btn btn-ghost btn-sm">
              <LayoutDashboard size={12} /> 360° View
            </button>
            {!isNoteDocument && canCreateNote && (
              <>
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/invoices/notes/new?invoice=${record.id}&type=${encodeURIComponent('Credit Note')}`)}
                  className="btn btn-ghost btn-sm"
                >
                  <MinusCircle size={12} /> Credit Note
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/invoices/notes/new?invoice=${record.id}&type=${encodeURIComponent('Debit Note')}`)}
                  className="btn btn-ghost btn-sm"
                >
                  <PlusCircle size={12} /> Debit Note
                </button>
              </>
            )}
            {canSubmitInvoice && record.status === INVOICE_STATUS.DRAFT && (
              <button
                type="button"
                onClick={() => setConfirmAction('submit')}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><Send size={16} /></span> Submit Invoice
              </button>
            )}
            {canApproveInvoice && record.status === INVOICE_STATUS.SUBMITTED && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction('approve')}
                  disabled={busy}
                  className="erp-btn-primary"
                >
                  <span className="erp-btn-icon"><CheckCircle2 size={16} /></span> Approve Invoice
                </button>
                {canRejectInvoice && (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('reject')}
                    disabled={busy}
                    className="po-btn po-btn-danger"
                  >
                    <span className="erp-btn-icon"><AlertTriangle size={16} /></span> Reject
                  </button>
                )}
              </>
            )}
            {canSubmitInvoice && record.status === INVOICE_STATUS.REJECTED && (
              <button
                type="button"
                onClick={() => setConfirmAction('resubmit')}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><RefreshCw size={16} /></span> Resubmit Invoice
              </button>
            )}
            {canPayInvoice && isPayable(record) && (
              <button
                type="button"
                onClick={() => {
                  setMethod(PAYMENT_METHODS[0]);
                  setFull(true);
                  setPaymentAmount('');
                  setPaymentOpen(true);
                }}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><Banknote size={16} /></span> Record Payment
              </button>
            )}
            {canDeleteInvoice && (
              <button
                type="button"
                onClick={() => setConfirmAction('delete')}
                disabled={busy}
                className="po-btn po-btn-danger"
              >
                <Trash2 className="po-btn-icon-ic" /> Delete
              </button>
            )}
          </>
        }
      />

      {/* ═══════════════════════════════════════════════════════════════
          INVOICE STRONG HEADER — Key info at a glance
          ═══════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice No</div>
            <div className="text-sm font-extrabold text-slate-800 mt-0.5">{record.invoiceNo}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendor</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5 truncate" title={record.vendor}>{record.vendor || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Status</div>
            <div className="mt-1"><PurchaseStatusBadge status={record.status} /></div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Value</div>
            <div className="text-sm font-extrabold text-slate-800 mt-0.5 tabular-nums">{formatAmount(record.total)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PO Reference</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">{record.poNo || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendor Invoice No</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5 truncate" title={record.vendorInvoiceNo}>{record.vendorInvoiceNo || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GRN Reference</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">{record.grnNo || (linkedGrns.length ? linkedGrns.join(', ') : '—')}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Three-Way Match</div>
            <div className="mt-1"><MatchPill status={record.matchStatus} reasons={record.matchReasons} /></div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          THREE-WAY MATCH STATUS BAR — visual exception states
          ═══════════════════════════════════════════════════════════════ */}
      <ThreeWayMatchBar
        matchStatus={record.matchStatus}
        invoiceNo={record.invoiceNo}
        poNo={record.poNo}
        grnNo={linkedGrns.length ? linkedGrns.join(', ') : null}
        invoiceAmount={record.total}
        poAmount={poAmount}
        matchReasons={record.matchReasons}
      />

      {/* Tabs */}
      <Tabs tabs={VIEW_TABS} activeKey={activeTab} onChange={setActiveTab} />

      {/* ── Overview Tab ────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <>
          {/* Complete document chain — PR → RFQ → PO → GRN → Invoice. */}
          <PurchaseSectionCard title="Document Chain" subtitle="PR → RFQ → PO → GRN → Invoice">
            <div className="flex flex-wrap items-center gap-2">
              {chain.map((chip, index) => (
                <div key={chip.label} className="flex items-center gap-2">
                  {index > 0 && <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" aria-hidden="true" />}
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{chip.label}</span>
                    {chip.to ? (
                      <button
                        type="button"
                        onClick={() => navigate(chip.to)}
                        className="text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
                      >
                        {chip.value}
                      </button>
                    ) : (
                      <span className="text-xs font-bold text-slate-700">{chip.value}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </PurchaseSectionCard>

          {/* Three-way match reasons — inline, not just tooltip. */}
          {(record.matchReasons || []).length > 0 && (
            <PurchaseSectionCard title="Three-Way Match Findings" subtitle="Exact mismatch reasons">
              <div className="space-y-1.5">
                {(record.matchReasons || []).map((reason, index) => (
                  <p key={index} className="text-xs font-semibold text-rose-600 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                    {reason}
                  </p>
                ))}
              </div>
            </PurchaseSectionCard>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
            <div className="xl:col-span-2 space-y-5">
              <PurchaseSectionCard title="Invoice Details" subtitle="Billing and payment information">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
                  {details.map((item) => (
                    <DetailItem key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
                {record.notes && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className={LABEL}>Notes</div>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{record.notes}</p>
                  </div>
                )}
              </PurchaseSectionCard>

              <PurchaseSectionCard title="Amount Breakdown" subtitle="Taxable value, GST and total">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount (excl. GST)</div>
                    <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(record.amount)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GST</div>
                    <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(record.gst)}</div>
                  </div>
                  <div className="rounded-lg bg-[#EDF7F4] border border-[#0B4A3D]/20 p-4">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#0A4F44]">Total</div>
                    <div className="text-lg font-bold text-[#0B4A3D] mt-1 tabular-nums">{formatAmount(record.total)}</div>
                  </div>
                </div>
              </PurchaseSectionCard>

              {/* Credit / Debit notes raised against this invoice */}
              <PurchaseSectionCard
                title="Credit / Debit Notes"
                subtitle={adjustments.count > 0 ? `${adjustments.count} approved note(s) adjusting the ledger` : 'Adjustments raised against this invoice'}
              >
                {(adjustments.count > 0 || linkedNotes.length > 0) && (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Credit Notes</div>
                      <div className="text-sm font-bold text-emerald-800 mt-0.5 tabular-nums">{formatAmount(adjustments.credit)}</div>
                    </div>
                    <div className="rounded-lg bg-rose-50 border border-rose-100 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">Debit Notes</div>
                      <div className="text-sm font-bold text-rose-800 mt-0.5 tabular-nums">{formatAmount(adjustments.debit)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Net Effect</div>
                      <div className={`text-sm font-bold mt-0.5 tabular-nums ${adjustments.net < 0 ? 'text-emerald-700' : adjustments.net > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                        {adjustments.net === 0 ? formatAmount(0) : adjustments.net < 0 ? '−' : '+'}{formatAmount(Math.abs(adjustments.net))}
                      </div>
                    </div>
                  </div>
                )}

                {linkedNotes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-5 text-center">
                    <p className="text-xs font-semibold text-slate-600">No credit / debit notes have been raised against this invoice.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Use a credit note for returns, rejections or rate corrections — it reduces the outstanding and the vendor payable once approved.</p>
                    {!isNoteDocument && (
                      <div className="flex items-center justify-center gap-2 mt-3">
                        <button
                          type="button"
                          onClick={() => navigate(`/purchase/invoices/notes/new?invoice=${record.id}&type=${encodeURIComponent('Credit Note')}`)}
                          className="po-btn po-btn-primary"
                        >
                          <MinusCircle className="po-btn-icon-ic" /> Credit Note
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/purchase/invoices/notes/new?invoice=${record.id}&type=${encodeURIComponent('Debit Note')}`)}
                          className="po-btn po-btn-secondary"
                        >
                          <PlusCircle className="po-btn-icon-ic" /> Debit Note
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {linkedNotes.map((note) => {
                      const isCreditNote = String(note.noteType).toLowerCase().includes('credit');
                      return (
                        <div key={note.id} className="py-2.5 flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isCreditNote ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                            {isCreditNote
                              ? <MinusCircle className="w-3.5 h-3.5 text-emerald-700" />
                              : <PlusCircle className="w-3.5 h-3.5 text-rose-700" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              type="button"
                              onClick={() => navigate('/purchase/invoices/notes')}
                              className="text-xs font-bold text-[#0B4A3D] hover:underline cursor-pointer"
                            >
                              {note.noteNo}
                            </button>
                            <div className="text-[11px] text-slate-500 truncate">{note.reason || '—'} · {formatDate(note.noteDate)}</div>
                          </div>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            note.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : note.status === 'Submitted' ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : note.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-200'
                                  : note.status === 'Reversed' ? 'bg-violet-50 text-violet-700 border-violet-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {note.status}
                          </span>
                          <span className={`text-xs font-bold tabular-nums shrink-0 ${isCreditNote ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {isCreditNote ? '−' : '+'}{formatAmount(note.total)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </PurchaseSectionCard>
            </div>

            <div className="space-y-5">
              <PurchaseSectionCard title="Payment Status" subtitle="Settlement progress">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Status</div>
                      <div className="mt-1"><PurchaseStatusBadge status={record.status} /></div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Status</div>
                      <div className="mt-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${PAYMENT_TONES[paymentBadge.label] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                          {paymentBadge.label}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5 tabular-nums">{formatAmount(paidAmount)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding</div>
                      <div className={`text-sm font-bold mt-0.5 tabular-nums ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>{formatAmount(outstanding)}</div>
                    </div>
                  </div>
                </div>
                {record.paymentDate && (
                  <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                    <p className="text-[11px] font-semibold text-emerald-700">
                      Paid on {formatDate(record.paymentDate)} via {record.paymentMethod || '—'}
                    </p>
                  </div>
                )}
              </PurchaseSectionCard>

              <PurchaseSectionCard title="Next Steps" subtitle="Move the invoice through the payment flow">
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => navigate('/purchase/invoices/three-way-matching')}
                    className="w-full flex items-center gap-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400" /> Three Way Matching
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/purchase/invoices/payment-approval')}
                    className="w-full flex items-center gap-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" /> Payment Approval
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/purchase/invoices/vendor-payment')}
                    className="w-full flex items-center gap-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <Banknote className="w-3.5 h-3.5 text-slate-400" /> Vendor Payment
                  </button>
                </div>
              </PurchaseSectionCard>
            </div>
          </div>
        </>
      )}

      {/* ── Line Items Tab ───────────────────────────────────────── */}
      {activeTab === 'line-items' && (
        <PurchaseSectionCard title="Line Items" subtitle="Invoiced items from purchase order">
          {(record.lineItems || record.items || []).length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">#</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Description</th>
                    <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">HSN/SAC</th>
                    <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                    <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Unit Price</th>
                    <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {(record.lineItems || record.items || []).map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2 px-3 font-semibold text-slate-600">{idx + 1}</td>
                      <td className="py-2 px-3 font-semibold text-slate-800">{item.description || item.name || '—'}</td>
                      <td className="py-2 px-3 text-slate-500">{item.hsn || item.hsnCode || '—'}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{item.quantity || item.qty || '—'}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatAmount(item.unitPrice || item.rate)}</td>
                      <td className="py-2 px-3 text-right font-bold tabular-nums">{formatAmount(item.amount || item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No line items recorded for this invoice.</p>
          )}
        </PurchaseSectionCard>
      )}

      {/* ── Three-Way Match Tab ─────────────────────────────────── */}
      {activeTab === 'three-way' && (
        <div className="space-y-5">
          <PurchaseSectionCard title="Three-Way Matching Status" subtitle="Invoice ↔ PO ↔ GRN comparison">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Match Status</div>
                <div className="mt-2"><MatchPill status={record.matchStatus} reasons={record.matchReasons} /></div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchase Order</div>
                <div className="text-sm font-bold text-slate-800 mt-2">{record.poNo || '—'}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GRN Reference</div>
                <div className="text-sm font-bold text-slate-800 mt-2">{linkedGrns.length ? linkedGrns.join(', ') : '—'}</div>
              </div>
            </div>
          </PurchaseSectionCard>

          {(record.matchReasons || []).length > 0 && (
            <PurchaseSectionCard title="Match Findings" subtitle="Details requiring attention">
              <div className="space-y-2">
                {(record.matchReasons || []).map((reason, index) => (
                  <div key={index} className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-100">
                    <AlertTriangle className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold text-rose-700">{reason}</p>
                  </div>
                ))}
              </div>
            </PurchaseSectionCard>
          )}

          <PurchaseSectionCard title="Amount Comparison" subtitle="Invoice vs PO amounts">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Amount</div>
                <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(record.total)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PO Amount</div>
                <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(poAmount)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Variance</div>
                <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatAmount((Number(record.total) || 0) - (Number(poAmount) || 0))}</div>
              </div>
            </div>
          </PurchaseSectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/purchase/invoices/three-way-matching')}
              className="erp-btn-primary"
            >
              Open 3-Way Matching Page
            </button>
          </div>
        </div>
      )}

      {/* ── Approval Tab ─────────────────────────────────────────── */}
      {activeTab === 'approval' && (
        <div className="space-y-5">
          <PurchaseSectionCard title="Approval Status" subtitle="Current approval state">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Status</div>
                <div className="mt-2"><PurchaseStatusBadge status={record.status} /></div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Three-Way Match</div>
                <div className="mt-2"><MatchPill status={record.matchStatus} reasons={record.matchReasons} /></div>
              </div>
            </div>
          </PurchaseSectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/purchase/invoices/payment-approval')}
              className="erp-btn-primary"
            >
              Open Approval Page
            </button>
          </div>
        </div>
      )}

      {/* ── Payment Tab ─────────────────────────────────────────── */}
      {activeTab === 'payment' && (
        <div className="space-y-5">
          <PurchaseSectionCard title="Payment Information" subtitle="Settlement details">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Amount</div>
                <div className="text-lg font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(record.total)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Paid Amount</div>
                <div className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{formatAmount(paidAmount)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding</div>
                <div className={`text-lg font-bold mt-1 tabular-nums ${outstanding > 0 ? 'text-amber-700' : 'text-emerald-600'}`}>{formatAmount(outstanding)}</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Method</div>
                <div className="text-sm font-bold text-slate-800 mt-2">{record.paymentMethod || '—'}</div>
              </div>
            </div>
            {record.paymentDate && (
              <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2.5">
                <p className="text-[11px] font-semibold text-emerald-700">
                  Paid on {formatDate(record.paymentDate)} via {record.paymentMethod || '—'}
                </p>
              </div>
            )}
          </PurchaseSectionCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => navigate('/purchase/invoices/vendor-payment')}
              className="erp-btn-primary"
            >
              Open Vendor Payment Page
            </button>
          </div>
        </div>
      )}

      {/* ── Documents Tab ────────────────────────────────────────── */}
      {activeTab === 'documents' && (
        <div className="space-y-5">
          <PurchaseSectionCard
            title="Attachments"
            subtitle={`${(record.attachments || []).length} supporting document(s)`}
            icon={Paperclip}
          >
            <AttachmentList
              attachments={record.attachments || []}
              fallbackDate={record.createdAt}
            />
          </PurchaseSectionCard>

          <PurchaseSectionCard
            title="Documents"
            subtitle="Linked documents from the repository"
            icon={FileText}
          >
            <SourceDocumentsDrawer
              sourceId={record.id}
              stage="Purchase Invoice"
              label="Invoice Documents"
            />
          </PurchaseSectionCard>
        </div>
      )}

      {/* ── Activity Tab ─────────────────────────────────────────── */}
      {activeTab === 'activity' && (
        <PurchaseSectionCard title="Activity History" subtitle="Audit trail of all actions">
          {auditEntries.length > 0 ? (
            <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
              {[...auditEntries].reverse().map((entry, i) => {
                const actionLabels = {
                  created: 'Invoice Created', submitted: 'Submitted', approved: 'Approved',
                  rejected: 'Rejected', resubmitted: 'Resubmitted', payment_recorded: 'Payment Recorded',
                  payment_scheduled: 'Payment Scheduled', advice_generated: 'Advice Generated', advice_sent: 'Advice Sent'
                };
                return (
                  <div key={i} className="flex items-start gap-2.5 py-3">
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
          ) : (
            <p className="text-xs text-slate-400 py-4 text-center">No activity recorded yet.</p>
          )}
        </PurchaseSectionCard>
      )}

      <ConfirmDialog
        open={confirmAction === 'approve'}
        title="Approve invoice?"
        message={`${record.invoiceNo} will be approved and queued for payment.`}
        confirmLabel="Approve"
        variant="default"
        icon={CheckCircle2}
        loading={busy}
        onConfirm={() => runAction(() => invoiceService.approveInvoice(record.id), `${record.invoiceNo} approved`)}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'submit'}
        title="Submit invoice?"
        message={`${record.invoiceNo} will be submitted for three-way matching and payment approval.`}
        confirmLabel="Submit"
        variant="default"
        icon={Send}
        loading={busy}
        onConfirm={() => runAction(() => invoiceService.submitInvoice(record.id), `${record.invoiceNo} submitted for approval`)}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'reject'}
        title="Reject invoice?"
        message={`${record.invoiceNo} will be rejected and moved back to draft status.`}
        confirmLabel="Reject"
        variant="danger"
        icon={AlertTriangle}
        loading={busy}
        onConfirm={() => runAction(() => invoiceService.rejectInvoice(record.id), `${record.invoiceNo} rejected`)}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'resubmit'}
        title="Resubmit invoice?"
        message={`${record.invoiceNo} will be resubmitted for review.`}
        confirmLabel="Resubmit"
        variant="default"
        icon={RefreshCw}
        loading={busy}
        onConfirm={() => runAction(() => invoiceService.resubmitInvoice(record.id), `${record.invoiceNo} resubmitted`)}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Delete invoice?"
        message={`This will permanently remove ${record.invoiceNo}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onConfirm={async () => {
          await runAction(() => invoiceService.deleteInvoice(record.id), `${record.invoiceNo} deleted`);
          navigate('/purchase/invoices');
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <Modal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        title={`Record Payment — ${record.invoiceNo}`}
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => setPaymentOpen(false)}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={recordPayment}
              disabled={busy}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Record Payment
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">Invoice Total</span>
            <span className="text-lg font-bold text-slate-900 tabular-nums">{formatAmount(record.total)}</span>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Method</label>
            <SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </SelectInput>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input type="radio" checked={full} onChange={() => setFull(true)} className="accent-[#0B4A3D]" />
              Full payment
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
              <input type="radio" checked={!full} onChange={() => setFull(false)} className="accent-[#0B4A3D]" />
              Partial payment
            </label>
          </div>
          {!full && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Payment Amount
              </label>
              <NumberInput
                min="0"
                step="any"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                ariaLabel="Partial payment amount"
              />
            </div>
          )}
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}
