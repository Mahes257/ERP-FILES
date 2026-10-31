/**
 * purchase/pages/orders/OrderView.jsx
 * ------------------------------------------------------------------
 * Purchase Order Detail — full PO (details, line items, cost summary,
 * delivery status) with approval / delivery-status actions and the
 * activity timeline.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Banknote, Boxes, Check, CheckCircle2, ChevronLeft, FileCheck, FileDown, FileText, Handshake, LayoutDashboard, Loader2, Paperclip, Pencil, Printer, Receipt, Rocket, Send, Trash2, Truck, XCircle
} from 'lucide-react';
import { ConfirmDialog, FormField, Modal, SelectInput, TextArea, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseSummary from '../../components/PurchaseSummary';
import PurchaseItemTable from '../../components/PurchaseItemTable';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import AttachmentList from '../../components/AttachmentList';
import SourceDocumentsDrawer from '../../components/SourceDocumentsDrawer';
import PaymentTermsForm from '../../components/PaymentTermsForm';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { rfqService } from '../../services/rfq';
import { requisitionService } from '../../services/requisition';
import { GRN_STATUS, grnsStore, logisticsService } from '../../services/logistics';
import { trackPurchaseOrder } from '../../services/poTracking';
import { APPROVAL_STATUS, PAYMENT_METHODS, PO_CANONICAL_STAGES, PO_STATUS } from '../../constants';
import { canApproveRequisitions } from '../../utils/access';
import { formatAmount } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { ADVANCE_STATUS, advanceAmount, balanceAmount, paymentTermsLabel } from '../../utils/paymentTerms';
import '../../styles/cpr-list.css';

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

/* ─────────────────────────────────────────────────────────────────
 * PoWorkflowPipeline — visual PO lifecycle stages
 * ───────────────────────────────────────────────────────────────── */
const PO_WORKFLOW_STAGES = [
  { key: 'Draft', label: 'Draft' },
  { key: 'Pending Approval', label: 'Approval' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Released', label: 'Sent' },
  { key: 'Supplier Acknowledged', label: 'Acknowledged' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Partially Delivered', label: 'Partial' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Closed', label: 'Closed' },
];

/* PO Stage Progress pipeline — the canonical lifecycle stages from the
   single source of truth (PO_CANONICAL_STAGES), shown horizontally in
   the PO detail sidebar. The terminal Closed / Cancelled states are
   NOT pipeline steps: Closed renders the pipeline complete and
   Cancelled shows a badge, exactly like the top-of-page workflow rail. */
const PO_STAGE_PROGRESS = PO_CANONICAL_STAGES.slice(0, 8);

function PoWorkflowPipeline({ currentStatus }) {
  const currentIdx = PO_WORKFLOW_STAGES.findIndex((s) => s.key === currentStatus);
  const isCancelled = currentStatus === 'Cancelled';

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Truck className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Order Workflow</span>
        {isCancelled && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-700 border border-rose-200 ml-2">
            CANCELLED
          </span>
        )}
      </div>
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {PO_WORKFLOW_STAGES.map((stage, idx) => {
          const isCompleted = currentIdx >= 0 && idx < currentIdx;
          const isCurrent = stage.key === currentStatus;
          return (
            <div key={stage.key} className="flex items-center flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                isCurrent
                  ? 'bg-[#0B4A3D] text-white shadow-sm'
                  : isCompleted
                    ? 'bg-[#EDF7F4] text-[#0B4A3D] border border-[#0B4A3D]/20'
                    : 'bg-slate-50 text-slate-400 border border-slate-100'
              }`}>
                {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                {stage.label}
              </div>
              {idx < PO_WORKFLOW_STAGES.length - 1 && (
                <div className={`w-4 h-px mx-0.5 ${isCompleted ? 'bg-[#0B4A3D]/30' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function OrderView() {
  const navigate = useNavigate();
  /* Action-level gates. The backend re-checks every one of these on
     /api/purchase/orders/** — a hidden button is only the convenience half. */
  const { can } = usePurchaseAccess();
  const canEditPo = can('orders', 'edit');
  const canSubmitPo = can('orders', 'submit');
  const canApprovePo = can('orders', 'approve');
  const canRejectPo = can('orders', 'reject');
  const canReleasePo = can('orders', 'release');
  const canAcknowledgePo = can('orders', 'acknowledge');
  const canPrintPo = can('orders', 'print');
  const canCreateInvoice = can('invoices', 'create');
  const { id } = useParams();
  const toast = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'approve' | 'delete' | 'deliver' | {type:'deliver',status}
  /* Generic workflow-stage action (submit / release / acknowledge /
     start / close …) confirmed through one shared dialog. */
  const [stageAction, setStageAction] = useState(null); // key of STAGE_CONFIRMS
  /* Packing creation modal. */
  const [packingModal, setPackingModal] = useState(false);
  const [packingForm, setPackingForm] = useState({ warehouse: '', notes: '' });
  /* Advance payment workflow modals. */
  const [advanceModal, setAdvanceModal] = useState(null); // { mode: 'request' | 'decide' | 'pay', decision? }
  const [advanceForm, setAdvanceForm] = useState({ dueDate: '', bankInfo: '', notes: '' });
  const [advanceRemarks, setAdvanceRemarks] = useState('');
  const [payInfo, setPayInfo] = useState({ method: PAYMENT_METHODS[0], reference: '' });
  /* Payment terms edit modal (also the path to unblock release when the
     RFQ was raised without finalized terms). */
  const [termsModal, setTermsModal] = useState(false);
  const [termsDraft, setTermsDraft] = useState(null);
  /* Existing approval permission gates the advance approve/reject. */
  const isApprover = useMemo(() => canApproveRequisitions(), []);
  /* Upstream documents resolved from the PO's chain fields — enables the
     PR → RFQ → Quotation → Award → PO document chain links. Best-effort:
     each link simply hides when its source document cannot be found. */
  const [linkedPr, setLinkedPr] = useState(null);
  const [linkedRfq, setLinkedRfq] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await purchaseOrderService.getOrder(id);
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

  /* Resolve the source PR and RFQ (the routes take internal ids, not
     numbers) so the document chain can deep-link back up the chain. */
  const prNo = record?.prNo || record?.reference || '';
  const rfqNo = record?.rfqNo || '';
  useEffect(() => {
    let cancelled = false;
    if (!prNo && !rfqNo) {
      queueMicrotask(() => {
        setLinkedPr(null);
        setLinkedRfq(null);
      });
      return undefined;
    }
    if (prNo) {
      requisitionService
        .getRequisitions({ search: prNo, page: 1, pageSize: 10 })
        .then((result) => {
          if (cancelled) return;
          const match = (result.data || []).find((pr) => pr.prNo === prNo);
          setLinkedPr(match ? { id: match.id, prNo: match.prNo } : null);
        })
        .catch(() => {
          if (!cancelled) setLinkedPr(null);
        });
    }
    if (rfqNo) {
      rfqService
        .getRfqs({ rfqNo, page: 1, pageSize: 10 })
        .then((result) => {
          if (cancelled) return;
          const match = (result.data || []).find((rfq) => rfq.rfqNo === rfqNo);
          /* Keep the award data from the source RFQ so the chain still shows
             the negotiated value / award date even when the PO predates the
             chain fields (seeded records). */
          setLinkedRfq(match ? { id: match.id, rfqNo: match.rfqNo, awardedValue: match.awardedValue, awardedAt: match.awardedAt } : null);
        })
        .catch(() => {
          if (!cancelled) setLinkedRfq(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [prNo, rfqNo]);

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
      setStageAction(null);
      setAdvanceModal(null);
      setTermsModal(false);
    }
  };

  const confirmAdvance = async () => {
    if (!advanceModal || busy) return;
    setBusy(true);
    try {
      if (advanceModal.mode === 'request') {
        const updated = await purchaseOrderService.requestAdvancePayment(record.id, advanceForm);
        setRecord(updated);
        toast.success(`${record.poNo} advance payment submitted for approval`);
        setAdvanceModal(null);
      } else if (advanceModal.mode === 'decide') {
        const updated = await purchaseOrderService.decideAdvancePayment(record.id, {
          decision: advanceModal.decision,
          remarks: advanceRemarks
        });
        setRecord(updated);
        toast.success(`Advance payment ${advanceModal.decision.toLowerCase()} for ${record.poNo}`);
        setAdvanceModal(null);
        setAdvanceRemarks('');
      } else if (advanceModal.mode === 'pay') {
        const updated = await purchaseOrderService.markAdvancePaid(record.id, payInfo);
        setRecord(updated);
        toast.success(`${record.poNo} advance paid`);
        setAdvanceModal(null);
      }
    } catch (err) {
      toast.error(err?.message || 'Advance payment action failed');
    } finally {
      setBusy(false);
    }
  };

  const saveTerms = async () => {
    if (!termsDraft?.type || busy) return;
    setBusy(true);
    try {
      const updated = await purchaseOrderService.updatePaymentTerms(record.id, { paymentTerms: termsDraft });
      setRecord(updated);
      toast.success(`Payment terms updated for ${record.poNo}`);
      setTermsModal(false);
    } catch (err) {
      toast.error(err?.message || 'Failed to update payment terms');
    } finally {
      setBusy(false);
    }
  };

  /** Creates a packing / manufacturing job from the current PO. */
  const handleCreatePacking = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const job = await logisticsService.createManufacturingJob({
        poNo: record.poNo,
        warehouse: packingForm.warehouse,
        notes: packingForm.notes
      });
      toast.success(`Packing job ${job.packingNo} created for ${record.poNo}`);
      setPackingModal(false);
      setPackingForm({ warehouse: '', notes: '' });
      navigate(`/purchase/logistics/manufacturing/${job.packingNo}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to create packing job');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !record) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Purchase order not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/orders')}
            className="erp-btn-primary mt-4"
          >
            <span className="erp-btn-icon"><FileText size={16} /></span> Go to Purchase Orders
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Workflow stage actions (confirmed via one dialog) ──
     Each entry maps the next VALID action for a PO stage to its real
     service transition — the same single status model as the lists. */
  const STAGE_CONFIRMS = {
    submit: {
      title: 'Submit for approval?',
      confirmLabel: 'Submit',
      icon: Send,
      message: `${record.poNo} will be submitted for approval.`,
      run: () => purchaseOrderService.submitOrder(record.id),
      success: `${record.poNo} submitted for approval`
    },
    reject: {
      title: 'Reject purchase order?',
      confirmLabel: 'Reject',
      icon: XCircle,
      message: `${record.poNo} will be rejected during approval.`,
      run: () => purchaseOrderService.rejectOrder(record.id),
      success: `${record.poNo} rejected`
    },
    release: {
      title: 'Release purchase order?',
      confirmLabel: 'Release',
      icon: Rocket,
      message: `${record.poNo} will be released to ${record.vendor || 'the supplier'}.`,
      run: () => purchaseOrderService.releaseOrder(record.id),
      success: `${record.poNo} released to ${record.vendor || 'supplier'}`
    },
    ack: {
      title: 'Record supplier acknowledgement?',
      confirmLabel: 'Acknowledge',
      icon: Handshake,
      message: `${record.poNo} will be recorded as acknowledged by ${record.vendor || 'the supplier'}.`,
      run: () => purchaseOrderService.acknowledgeOrder(record.id),
      success: `${record.poNo} acknowledged by ${record.vendor || 'supplier'}`
    },
    start: {
      title: 'Start this purchase order?',
      confirmLabel: 'Start In Progress',
      icon: Truck,
      message: `${record.poNo} will move from Supplier Acknowledged to In Progress.`,
      run: () => purchaseOrderService.startOrder(record.id),
      success: `${record.poNo} is now In Progress`
    },
    close: {
      title: 'Close purchase order?',
      confirmLabel: 'Close',
      icon: FileCheck,
      message: `${record.poNo} will be closed. This cannot be undone.`,
      run: () => purchaseOrderService.closeOrder(record.id),
      success: `${record.poNo} closed`
    }
  };

  /* Goods-receipt + invoice linkage for this PO (live from the shared
     stores, so PO ↔ GRN ↔ Invoice stays consistent everywhere). */
  const poGrns = grnsStore.all.filter(
    (grn) => grn.poNo === record.poNo && grn.status !== GRN_STATUS.EXPECTED
  );
  /* ── Central PO quantity/value tracking ────────────────────────────
     Single calculator (services/poTracking) derived from the real GRN /
     QC / Invoice / Payment records — never recomputed per page. If the
     order already carries a tracking snapshot (service-attached) it is
     used as-is; otherwise it is derived live from the shared stores. */
  const tracking = record.tracking || trackPurchaseOrder(record);
  const grnReceivedQty = tracking.totals.receivedQty;
  const coverage = {
    status: tracking.invoicing.status,
    amount: tracking.totals.invoicedValue,
    paid: tracking.totals.paidValue,
    invoices: tracking.invoiceIds
  };
  const invoiceStatusTone =
    coverage.status === 'Fully Invoiced'
      ? 'text-emerald-700'
      : coverage.status === 'Partially Invoiced'
        ? 'text-amber-700'
        : 'text-slate-600';

  const details = [
    { label: 'Vendor', value: record.vendor },
    { label: 'PR Reference', value: record.reference },
    { label: 'RFQ Reference', value: record.rfqNo || '—' },
    { label: 'Quotation', value: record.quotationNo || '—' },
    { label: 'Order Date', value: record.orderDate },
    { label: 'ETD', value: record.expectedDate },
    { label: 'Currency', value: record.currency },
    { label: 'Payment Terms', value: record.terms },
    { label: 'Delivery Terms', value: record.deliveryTerms || '—' },
    { label: 'Warranty', value: record.warranty || '—' },
    { label: 'Freight', value: record.freight ? formatAmount(record.freight, record.currency) : '—' },
    { label: 'Discount', value: record.discount ? `${record.discount}%` : '—' },
    { label: 'Charges', value: record.charges ? formatAmount(record.charges, record.currency) : '—' },
    { label: 'Award Value', value: record.awardedValue ? formatAmount(record.awardedValue, record.currency) : '—' },
    { label: 'Approval', value: <PurchaseStatusBadge status={record.approvalStatus} /> },
    { label: 'Delivery Status', value: <PurchaseStatusBadge status={record.status} /> },
    {
      label: 'Invoice Status',
      value: (
        <span className={`text-xs font-bold ${invoiceStatusTone}`}>
          {coverage.status}
          {coverage.amount > 0 ? ` · ${formatAmount(coverage.amount, record.currency)}` : ''}
        </span>
      )
    }
  ];

  /* Document chain chips — PR → RFQ → Quotation → Award → PO. Links are
     resolved best-effort from the PO's chain fields; the Quotation and
     Award chips jump to the RFQ's quotation/comparison screens. */
  const chain = [
    {
      label: 'PR',
      value: linkedPr?.prNo || record.prNo || record.reference || null,
      to: linkedPr ? `/purchase/requisition/${linkedPr.id}` : null
    },
    {
      label: 'RFQ',
      value: linkedRfq?.rfqNo || record.rfqNo || null,
      to: linkedRfq ? `/purchase/rfq/${linkedRfq.id}` : null
    },
    {
      label: 'Quotation',
      value: record.quotationNo || null,
      to: record.rfqNo ? `/purchase/rfq/quotations?rfq=${record.rfqNo}` : null
    },
    {
      label: 'Award',
      /* Fall back to the linked RFQ's award data for records raised before
         the chain fields existed. */
      value: record.awardedValue ?? linkedRfq?.awardedValue
        ? formatAmount(record.awardedValue ?? linkedRfq?.awardedValue, record.currency)
        : null,
      to: linkedRfq ? `/purchase/rfq/compare?rfq=${linkedRfq.id}` : null
    },    {
      label: 'PO',
      value: record.poNo,
      to: null
    },
    ...poGrns.slice(0, 3).map((grn) => ({
      label: 'GRN',
      value: grn.grnNo,
      to: `/purchase/logistics/grn/${grn.grnNo}`
    })),
    ...coverage.invoices.slice(0, 3).map((invoiceId) => ({
      label: 'Invoice',
      value: invoiceId,
      to: `/purchase/invoices/${invoiceId}`
    })),
    ...(coverage.paid > 0
      ? [
          {
            label: 'Payment',
            value: coverage.invoices[0] ? `Paid ${formatAmount(coverage.paid, record.currency)}` : null,
            to: coverage.invoices[0] ? `/purchase/invoices/${coverage.invoices[0]}` : null
          }
        ]
      : [])
  ].filter((chip) => chip.value);

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'View' }
        ]}
        icon={FileText}
        title={record.poNo}
        subtitle={record.title || 'Purchase order'}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/orders')} className="btn btn-ghost btn-sm">
              <ChevronLeft size={12} /> Back
            </button>
            {/* Edit only while the PO is pre-approval (Draft / Pending
                Approval); once approved the document is frozen and the
                action is not offered. */}
            {canEditPo && [PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL].includes(record.status) && (
              <button type="button" onClick={() => navigate(`/purchase/orders/${record.id}/edit`)} className="btn btn-ghost btn-sm">
                <Pencil size={12} /> Edit
              </button>
            )}
            {/* Invoice linkage — Create Invoice once goods are received
                (and not yet fully invoiced), otherwise jump to the
                invoice(s). */}
            {coverage.invoices.length > 0 ? (
              <button type="button" onClick={() => navigate(`/purchase/invoices/${coverage.invoices[0]}`)} className="btn btn-ghost btn-sm">
                <Receipt size={12} /> View Invoice
              </button>
            ) : canCreateInvoice && grnReceivedQty > 0 && coverage.status !== 'Fully Invoiced' ? (
              <button type="button" onClick={() => navigate(`/purchase/invoices/new?po=${encodeURIComponent(record.poNo)}`)} className="btn btn-ghost btn-sm">
                <Receipt size={12} /> Create Invoice
              </button>
            ) : null}
            <button type="button" onClick={() => navigate(`/purchase/orders/${record.id}/360`)} className="btn btn-ghost btn-sm">
              <LayoutDashboard size={12} /> 360° View
            </button>
            {/* Print fires the browser print dialog on the rendered PO
                document (?print=1); PDF Preview opens the same document
                on screen without printing — two distinct behaviors. */}
            {canPrintPo && (
              <>
                <button type="button" onClick={() => navigate(`/purchase/orders/${record.id}/print?print=1`)} className="btn btn-ghost btn-sm">
                  <Printer size={12} /> Print
                </button>
                <button type="button" onClick={() => navigate(`/purchase/orders/${record.id}/print`)} className="btn btn-ghost btn-sm">
                  <FileDown size={12} /> PDF Preview
                </button>
              </>
            )}
            {/* ── Stage-aware workflow actions ──
                Only the actions VALID for the PO's current stored stage
                are offered (same single status model as the lists); the
                next operational step is always exposed. */}
            {canSubmitPo && record.status === PO_STATUS.DRAFT && (
              <button
                type="button"
                onClick={() => setStageAction('submit')}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><Send size={16} /></span> Submit for Approval
              </button>
            )}
            {canApprovePo && record.status === PO_STATUS.PENDING_APPROVAL && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction('approve')}
                  disabled={busy}
                  className="erp-btn-primary"
                >
                  <span className="erp-btn-icon"><CheckCircle2 size={16} /></span> Approve PO
                </button>
                {canRejectPo && record.approvalStatus === APPROVAL_STATUS.PENDING && (
                  <button
                    type="button"
                    onClick={() => setStageAction('reject')}
                    disabled={busy}
                    className="btn btn-ghost btn-sm"
                  >
                    <XCircle size={12} /> Reject
                  </button>
                )}
              </>
            )}
            {canReleasePo && record.status === PO_STATUS.APPROVED && record.approvalStatus === APPROVAL_STATUS.APPROVED && (
              <button
                type="button"
                onClick={() => {
                  /* Never silently release a PO whose required payment
                     terms were never finalized. */
                  if (record.paymentTermsRequired && !record.paymentTerms?.type) {
                    toast.error('Payment terms must be finalized before PO release.');
                    setTermsDraft(record.paymentTerms || null);
                    setTermsModal(true);
                    return;
                  }
                  setStageAction('release');
                }}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><Rocket size={16} /></span> Release PO
              </button>
            )}
            {canAcknowledgePo && record.status === PO_STATUS.RELEASED && (
              <button
                type="button"
                onClick={() => setStageAction('ack')}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><Handshake size={16} /></span> Record Supplier Acknowledgement
              </button>
            )}
            {canEditPo && record.status === PO_STATUS.SUPPLIER_ACKNOWLEDGED && (
              <button
                type="button"
                onClick={() => setStageAction('start')}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><Truck size={16} /></span> Start In Progress
              </button>
            )}
            {canEditPo && record.status === PO_STATUS.IN_PROGRESS && record.approvalStatus === APPROVAL_STATUS.APPROVED && (
              <>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: 'deliver', status: PO_STATUS.PARTIALLY_DELIVERED })}
                  disabled={busy}
                  className="btn btn-ghost btn-sm"
                >
                  <Truck size={12} /> Mark Partially Delivered
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmAction({ type: 'deliver', status: PO_STATUS.COMPLETED })}
                  disabled={busy}
                  className="erp-btn-primary"
                >
                  <span className="erp-btn-icon"><CheckCircle2 size={16} /></span> Mark Completed
                </button>
              </>
            )}
            {canEditPo && record.status === PO_STATUS.PARTIALLY_DELIVERED && (
              <button
                type="button"
                onClick={() => setConfirmAction({ type: 'deliver', status: PO_STATUS.COMPLETED })}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><CheckCircle2 size={16} /></span> Mark Completed
              </button>
            )}
            {record.status === PO_STATUS.COMPLETED && (
              <button
                type="button"
                onClick={() => setStageAction('close')}
                disabled={busy}
                className="erp-btn-primary"
              >
                <span className="erp-btn-icon"><FileCheck size={16} /></span> Close PO
              </button>
            )}
            {/* Packing — operational action available while the PO is
                approved and executing (unchanged from before). */}
            {record.approvalStatus === APPROVAL_STATUS.APPROVED && [
              PO_STATUS.IN_PROGRESS, PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.RELEASED,
              PO_STATUS.APPROVED, PO_STATUS.PARTIALLY_DELIVERED
            ].includes(record.status) && (
              <button
                type="button"
                onClick={() => setPackingModal(true)}
                disabled={busy}
                className="btn btn-ghost btn-sm"
              >
                <Boxes size={12} /> Create Packing
              </button>
            )}
            {/* Delete — only while deletion is allowed by the service
                (Draft / Pending Approval). */}
            {[PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL].includes(record.status) && (
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
          PO STRONG HEADER — Key info at a glance
          ═══════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PO Number</div>
            <div className="text-sm font-extrabold text-slate-800 mt-0.5">{record.poNo}</div>
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
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Order Value</div>
            <div className="text-sm font-extrabold text-slate-800 mt-0.5 tabular-nums">{formatAmount(record.amount, record.currency)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivery</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">{record.expectedDate ? formatDate(record.expectedDate) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Terms</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5 truncate" title={record.terms}>{record.terms || '—'}</div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          PO WORKFLOW PIPELINE — Draft → Closed
          ═══════════════════════════════════════════════════════════════ */}
      <PoWorkflowPipeline currentStatus={record.status} />

      {/* Complete document chain — PR → RFQ → Quotation → Award → PO.
          Inherited from the award; every link deep-links to its source. */}
      <PurchaseSectionCard title="Document Chain" subtitle="PR → RFQ → Quotation → Award → PO">
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
        {(record.awardedAt || linkedRfq?.awardedAt) && (
          <p className="mt-2.5 text-[11px] text-slate-400">
            Awarded on{' '}
            <span className="font-semibold text-slate-600">
              {formatDateTime(record.awardedAt || linkedRfq?.awardedAt)}
            </span>
          </p>
        )}
      </PurchaseSectionCard>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 space-y-5">
          <PurchaseSectionCard title="Order Details" subtitle={`Placed with ${record.vendor || '—'}`}>
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

          <PurchaseSectionCard title="Line Items" subtitle={`${record.items?.length || 0} item(s) with GST`}>
            <PurchaseItemTable
              readOnly
              items={record.items || []}
              lines={record.totals?.lines || []}
              currency={record.currency || 'INR'}
            />
          </PurchaseSectionCard>

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
              stage="Purchase Order"
              label="PO Documents"
            />
          </PurchaseSectionCard>
        </div>

        <div className="space-y-5 xl:sticky xl:top-[76px] self-start">
          <PurchaseSummary totals={record.totals} currency={record.currency || 'INR'} />

          {/* Payment terms + payment summary — inherited from the finalized
              quotation terms; the PO never silently differs from the award. */}
          <PurchaseSectionCard
            title="Payment Terms"
            subtitle={record.paymentTerms?.type ? 'Finalized during commercial evaluation' : 'Not finalized'}
            icon={Banknote}
            action={
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                setTermsDraft(record.paymentTerms || null);
                setTermsModal(true);
              }}>
                <Pencil size={12} /> Edit
              </button>
            }
          >
            {record.paymentTerms?.type ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <div className={LABEL}>Terms</div>
                  <div className="text-xs font-bold text-slate-800 mt-0.5">{paymentTermsLabel(record.paymentTerms)}</div>
                  {record.paymentTerms.notes && (
                    <div className="text-[11px] text-slate-500 mt-0.5">{record.paymentTerms.notes}</div>
                  )}
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 space-y-1.5">
                  <div className={LABEL}>Payment Summary</div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">PO Value</span>
                    <span className="font-bold text-slate-800 tabular-nums">{formatAmount(record.amount, record.currency)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Advance Required</span>
                    <span className="font-bold text-emerald-700 tabular-nums">
                      {formatAmount(advanceAmount(record.paymentTerms, record.amount), record.currency)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600">Balance</span>
                    <span className="font-bold text-slate-800 tabular-nums">
                      {formatAmount(balanceAmount(record.paymentTerms, record.amount), record.currency)}
                    </span>
                  </div>
                </div>

                {record.advanceMilestones?.length > 0 && (
                  <div className="rounded-lg border border-slate-200 overflow-hidden">
                    <div className="bg-slate-50 px-3 py-1.5">
                      <span className={LABEL}>Milestones</span>
                    </div>
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-50 text-slate-400 text-[10px] uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-1.5">Milestone</th>
                          <th className="px-3 py-1.5 text-right">Amount</th>
                          <th className="px-3 py-1.5 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {record.advanceMilestones.map((milestone, index) => (
                          <tr key={index}>
                            <td className="px-3 py-1.5 text-slate-700">{milestone.percentage}% {milestone.trigger || 'Milestone'}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-slate-700 tabular-nums">
                              {formatAmount(milestone.amount, record.currency)}
                            </td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                milestone.status === 'Paid' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}>
                                {milestone.status || 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs font-semibold text-amber-700">
                Payment terms have not been finalized. Finalize them before PO release.
              </p>
            )}
          </PurchaseSectionCard>

          {/* Advance payment — a separate workflow state from supplier
              acknowledgement; only exists when the finalized terms require
              an advance (> 0%). */}
          {Number(record.advanceAmount) > 0 && (
            <PurchaseSectionCard title="Advance Payment" subtitle="Separate from supplier acknowledgement">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Status</span>
                  <PurchaseStatusBadge status={record.advanceStatus || ADVANCE_STATUS.NOT_REQUIRED} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Advance Amount</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatAmount(record.advanceAmount, record.currency)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">Remaining Balance</span>
                  <span className="font-bold text-slate-800 tabular-nums">{formatAmount(record.balanceAmount, record.currency)}</span>
                </div>

                {record.advanceStatus === ADVANCE_STATUS.PAID && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2 space-y-1">
                    <div className={LABEL}>Paid</div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Amount</span>
                      <span className="font-bold text-emerald-700 tabular-nums">{formatAmount(record.advancePaidAmount, record.currency)}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Paid on</span>
                      <span className="font-semibold text-slate-700">{record.advancePaidAt ? formatDateTime(record.advancePaidAt) : '—'}</span>
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-500">Method</span>
                      <span className="font-semibold text-slate-700">{record.advancePaidMethod || '—'}{record.advancePaidReference ? ` · ${record.advancePaidReference}` : ''}</span>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {[ADVANCE_STATUS.REQUIRED, ADVANCE_STATUS.REJECTED].includes(record.advanceStatus) && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => {
                        setAdvanceForm({ dueDate: '', bankInfo: '', notes: '' });
                        setAdvanceModal({ mode: 'request' });
                      }}
                    >
                      Submit for Approval
                    </button>
                  )}
                  {record.advanceStatus === ADVANCE_STATUS.PENDING_APPROVAL && isApprover && (
                    <>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => setAdvanceModal({ mode: 'decide', decision: APPROVAL_STATUS.APPROVED })}
                      >
                        <CheckCircle2 className="po-btn-icon-ic" /> Approve
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={busy}
                        onClick={() => setAdvanceModal({ mode: 'decide', decision: APPROVAL_STATUS.REJECTED })}
                      >
                        Reject
                      </button>
                    </>
                  )}
                  {record.advanceStatus === ADVANCE_STATUS.APPROVED && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const updated = await purchaseOrderService.startAdvanceProcessing(record.id);
                          setRecord(updated);
                          toast.success('Advance payment processing started');
                        } catch (err) {
                          toast.error(err?.message || 'Failed to start processing');
                        }
                      }}
                    >
                      Start Processing
                    </button>
                  )}
                  {[ADVANCE_STATUS.APPROVED, ADVANCE_STATUS.PAYMENT_PROCESSING].includes(record.advanceStatus) && (
                    <button
                      type="button"
                      className="erp-btn-primary"
                      disabled={busy}
                      onClick={() => setAdvanceModal({ mode: 'pay' })}
                    >
                      <Banknote className="po-btn-icon-ic" /> Mark as Paid
                    </button>
                  )}
                </div>
              </div>
            </PurchaseSectionCard>
          )}

          <PurchaseSectionCard title="Approval Workflow" subtitle="Order activity stream">
            <PurchaseApprovalTimeline activity={record.activity || []} />
          </PurchaseSectionCard>

          <PurchaseSectionCard title="PO Stage Progress" subtitle="Purchase order lifecycle and fulfilment status">
            <div className="flex items-center gap-0 w-full overflow-x-auto pb-1">
              {PO_STAGE_PROGRESS.map((stage, idx) => {
                const isCurrent = record.status === stage;
                /* Closed (the post-completion terminal) renders the whole
                   pipeline complete; otherwise the current stage is the
                   record's position in the canonical lifecycle. */
                const pipelineIdx = record.status === PO_STATUS.CLOSED
                  ? PO_STAGE_PROGRESS.length
                  : PO_STAGE_PROGRESS.indexOf(record.status);
                const isCompleted = pipelineIdx >= 0 && idx < pipelineIdx;
                return (
                  <div key={stage} className="flex items-center flex-1 last:flex-initial min-w-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/purchase/orders?stage=${encodeURIComponent(stage)}`)}
                      title={`View ${stage} purchase orders`}
                      className="flex flex-col items-center gap-1.5 cursor-pointer group min-w-[62px] px-0.5"
                    >
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all ${
                        isCurrent
                          ? 'bg-[#0B4A3D] border-[#0B4A3D] text-white ring-2 ring-[#0B4A3D]/20'
                          : isCompleted
                            ? 'bg-emerald-500 border-emerald-500 text-white'
                            : 'bg-slate-100 border-slate-200 text-slate-400 group-hover:border-slate-300 group-hover:text-slate-500'
                      }`}>
                        {isCompleted ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : idx + 1}
                      </div>
                      <span className={`text-[9px] leading-tight text-center max-w-[72px] ${
                        isCurrent
                          ? 'font-bold text-[#0B4A3D]'
                          : isCompleted
                            ? 'font-semibold text-emerald-700'
                            : 'text-slate-400'
                      }`}>
                        {stage}
                      </span>
                    </button>
                    {idx < PO_STAGE_PROGRESS.length - 1 && (
                      <div className={`flex-1 h-0.5 mx-1 rounded transition-colors ${
                        pipelineIdx >= 0 && idx < pipelineIdx ? 'bg-emerald-400' : 'bg-slate-200'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
            {record.status === PO_STATUS.CANCELLED && (
              <p className="mt-3 text-[10px] font-bold text-rose-600 uppercase tracking-wide">
                Cancelled — this purchase order will not progress through the pipeline.
              </p>
            )}
          </PurchaseSectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmAction === 'approve'}
        title="Approve purchase order?"
        message={`${record.poNo} will be approved and released to ${record.vendor || 'the vendor'}.${
          record.paymentTerms?.type
            ? `\n\nPayment Terms: ${paymentTermsLabel(record.paymentTerms)}.`
            : ''
        }`}
        confirmLabel="Approve"
        variant="default"
        icon={CheckCircle2}
        loading={busy}
        onConfirm={() => runAction(() => purchaseOrderService.approveOrder(record.id), `${record.poNo} approved`)}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Shared confirm for the stage-driven workflow actions (submit /
          release / acknowledge / start / close…). */}
      <ConfirmDialog
        open={stageAction !== null && Boolean(STAGE_CONFIRMS[stageAction])}
        title={STAGE_CONFIRMS[stageAction]?.title}
        message={STAGE_CONFIRMS[stageAction]?.message}
        confirmLabel={STAGE_CONFIRMS[stageAction]?.confirmLabel}
        variant="default"
        icon={STAGE_CONFIRMS[stageAction]?.icon}
        loading={busy}
        onConfirm={() => {
          const definition = STAGE_CONFIRMS[stageAction];
          if (definition) runAction(definition.run, definition.success);
        }}
        onCancel={() => setStageAction(null)}
      />

      {/* Advance payment request modal */}
      <Modal
        open={advanceModal?.mode === 'request'}
        onClose={() => setAdvanceModal(null)}
        title={`Advance Payment Request — ${record.poNo}`}
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdvanceModal(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirmAdvance}>
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <CheckCircle2 className="po-btn-icon-ic" />}
              Submit for Approval
            </button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs text-slate-600">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div>
              <span className={LABEL}>PO Number</span>
              <div className="font-bold text-slate-800 mt-0.5">{record.poNo}</div>
            </div>
            <div>
              <span className={LABEL}>Vendor</span>
              <div className="font-bold text-slate-800 mt-0.5">{record.vendor || '—'}</div>
            </div>
            <div>
              <span className={LABEL}>PO Total</span>
              <div className="font-bold text-slate-800 mt-0.5">{formatAmount(record.amount, record.currency)}</div>
            </div>
            <div>
              <span className={LABEL}>Advance Amount</span>
              <div className="font-bold text-emerald-700 mt-0.5">{formatAmount(record.advanceAmount, record.currency)}</div>
            </div>
            <div className="col-span-2">
              <span className={LABEL}>Payment Terms</span>
              <div className="font-semibold text-slate-700 mt-0.5">{paymentTermsLabel(record.paymentTerms)}</div>
            </div>
          </div>
          <FormField label="Due Date">
            <input type="date" className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2" value={advanceForm.dueDate} onChange={(e) => setAdvanceForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
          </FormField>
          <FormField label="Bank / Payment Information">
            <TextArea rows={2} value={advanceForm.bankInfo} onChange={(e) => setAdvanceForm((prev) => ({ ...prev, bankInfo: e.target.value }))} placeholder="Vendor bank account, IFSC, payment method…" />
          </FormField>
          <FormField label="Notes">
            <TextArea rows={2} value={advanceForm.notes} onChange={(e) => setAdvanceForm((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Advance release conditions…" />
          </FormField>
        </div>
      </Modal>

      {/* Advance payment approve/reject modal */}
      <Modal
        open={advanceModal?.mode === 'decide'}
        onClose={() => setAdvanceModal(null)}
        title={`${advanceModal?.decision === APPROVAL_STATUS.APPROVED ? 'Approve' : 'Reject'} advance payment — ${record.poNo}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdvanceModal(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirmAdvance}>
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <CheckCircle2 className="po-btn-icon-ic" />}
              Submit Review
            </button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs text-slate-600">
          <p>
            Advance of{' '}
            <strong className="text-emerald-700">{formatAmount(record.advanceAmount, record.currency)}</strong> for {record.poNo}{' '}
            will be {advanceModal?.decision === APPROVAL_STATUS.APPROVED ? 'approved' : 'rejected'}.
          </p>
          <FormField label="Remarks">
            <TextArea rows={2} value={advanceRemarks} onChange={(e) => setAdvanceRemarks(e.target.value)} placeholder="Approval remarks…" />
          </FormField>
        </div>
      </Modal>

      {/* Advance payment record modal */}
      <Modal
        open={advanceModal?.mode === 'pay'}
        onClose={() => setAdvanceModal(null)}
        title={`Record advance payment — ${record.poNo}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAdvanceModal(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirmAdvance}>
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <CheckCircle2 className="po-btn-icon-ic" />}
              Mark as Paid
            </button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs text-slate-600">
          <p>
            The advance of{' '}
            <strong className="text-emerald-700">{formatAmount(record.advanceAmount, record.currency)}</strong> will be recorded as
            paid against {record.poNo}. The amount always comes from the finalized payment terms — it cannot be changed here.
          </p>
          <FormField label="Payment Method" required>
            <SelectInput registration={{ onChange: (e) => setPayInfo((prev) => ({ ...prev, method: e.target.value })), value: payInfo.method }}>
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>{method}</option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="Transaction Reference">
            <input type="text" className="w-full text-xs rounded-lg border border-slate-300 px-3 py-2" value={payInfo.reference} onChange={(e) => setPayInfo((prev) => ({ ...prev, reference: e.target.value }))} placeholder="UTR / cheque no / reference…" />
          </FormField>
        </div>
      </Modal>

      {/* Payment terms edit modal — also the fix path when release is
          blocked because the RFQ was raised without finalized terms. */}
      <Modal
        open={termsModal}
        onClose={() => setTermsModal(false)}
        title={`Payment Terms — ${record.poNo}`}
        maxWidth="max-w-2xl"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTermsModal(false)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={saveTerms}>
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <CheckCircle2 className="po-btn-icon-ic" />}
              Save Payment Terms
            </button>
          </>
        }
      >
        <PaymentTermsForm value={termsDraft} onChange={setTermsDraft} total={record.amount} currency={record.currency} />
      </Modal>

      <ConfirmDialog
        open={confirmAction === 'deliver' || (confirmAction && confirmAction.type === 'deliver')}
        title="Update delivery status?"
        message={`${record.poNo} will be marked as ${confirmAction?.status || PO_STATUS.COMPLETED}.`}
        confirmLabel="Update"
        variant="default"
        icon={Truck}
        loading={busy}
        onConfirm={() =>
          runAction(
            () => purchaseOrderService.setDeliveryStatus(record.id, confirmAction?.status || PO_STATUS.COMPLETED),
            `${record.poNo} marked as ${confirmAction?.status || PO_STATUS.COMPLETED}`
          )
        }
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'delete'}
        title="Delete purchase order?"
        message={`This will permanently remove ${record.poNo}. This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onConfirm={async () => {
          await runAction(() => purchaseOrderService.deleteOrder(record.id), `${record.poNo} deleted`);
          navigate('/purchase/orders');
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* ── CREATE PACKING MODAL ── */}
      <Modal
        open={packingModal}
        onClose={() => { setPackingModal(false); setPackingForm({ warehouse: '', notes: '' }); }}
        title={`Create Packing for ${record.poNo}`}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setPackingModal(false); setPackingForm({ warehouse: '', notes: '' }); }}>
              Cancel
            </button>
            <button type="button" onClick={handleCreatePacking} disabled={busy} className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Create Packing
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Creates a packing job for <strong className="text-slate-800">{record.poNo}</strong> with all {record.items?.length || 0} line item(s) copied from the purchase order.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Warehouse / Location (optional)
            </label>
            <input
              type="text"
              value={packingForm.warehouse}
              onChange={(e) => setPackingForm((prev) => ({ ...prev, warehouse: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D] outline-none"
              placeholder="e.g. Plant A Store, Pune"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Notes (optional)
            </label>
            <textarea
              rows={2}
              value={packingForm.notes}
              onChange={(e) => setPackingForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D] outline-none"
              placeholder="Optional packing instructions..."
            />
          </div>
          {/* Quantity summary */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">Total ordered quantity</span>
              <span className="font-bold text-slate-800">{(record.items || []).reduce((sum, item) => sum + (Number(item.qty) || 0), 0)}</span>
            </div>
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-slate-500">Line items</span>
              <span className="font-bold text-slate-800">{record.items?.length || 0}</span>
            </div>
          </div>
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}
