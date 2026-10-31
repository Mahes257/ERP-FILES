/**
 * purchase/pages/approval/NfaDetail.jsx
 * ------------------------------------------------------------------
 * NFA (Note for Approval) detail page — redesigned as a compact ERP
 * approval workspace with 3-stage sequential approval (First → Second
 * → Final). Shows a horizontal approval stepper, compact summary cards,
 * and stage-specific approve/reject actions. Approved NFAs unlock PO
 * creation.
 *
 * Route: /purchase/rfq/approval/:id
 * ------------------------------------------------------------------
 */
import { memo, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, BadgeCheck, CheckCircle2, ChevronLeft,
  ExternalLink, FileText, Loader2, Mail, MapPin, Phone, Printer, Send,
  Stamp, Trophy, XCircle,
  Check
} from 'lucide-react';
import { ConfirmDialog, FormField, Modal, TextArea, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import { NFA_STATUS, NFA_APPROVAL_STAGES, NFA_STAGE_STATUS } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDateTime, formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { nfaService } from '../../services/nfa';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
import { vendorsStore } from '../../services/vendor';
import { documentsService } from '../../services/documents';
import '../../styles/cpr-list.css';

/* ─── Layout constants ─── */
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* ─── Sub-components ─── */

function DetailItem({ label, value, valueClass = '' }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className={`${VALUE} mt-1 ${valueClass}`}>{value || '—'}</div>
    </div>
  );
}

const NfaLoading = memo(function NfaLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
});

const NfaNotFound = memo(function NfaNotFound({ navigate }) {
  return (
    <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
      <p className="text-sm font-bold text-slate-700">Approval Flow record not found</p>
      <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
      <button type="button" onClick={() => navigate('/purchase/rfq/approval')} className="erp-btn-primary mt-4">
        <span className="erp-btn-icon"><Stamp size={16} /></span> Go to Approval Flow
      </button>
    </div>
  );
});

/* ─── Approval Stepper ────────────────────────────────────────────── */
function ApprovalStepper({ record }) {
  const stages = record.approvalStages || [];
  const currentStage = record.currentStage;
  const isApproved = record.status === NFA_STATUS.APPROVED;
  const isRejected = record.status === NFA_STATUS.REJECTED;

  return (
    <div className="flex items-center gap-0 w-full">
      {NFA_APPROVAL_STAGES.map((stage, idx) => {
        const stageObj = stages.find((s) => s.stage === stage);
        const stageStatus = stageObj?.status || NFA_STAGE_STATUS.PENDING;
        const isApprovedStage = stageStatus === NFA_STAGE_STATUS.APPROVED;
        const isRejectedStage = stageStatus === NFA_STAGE_STATUS.REJECTED;
        const isActive = currentStage === stage && !isApproved && !isRejected;
        const isCompleted = isApprovedStage;
        const isFailed = isRejectedStage;

        const bgClass = isCompleted
          ? 'bg-emerald-500 border-emerald-500'
          : isFailed
            ? 'bg-red-500 border-red-500'
            : isActive
              ? 'bg-amber-400 border-amber-400 animate-pulse'
              : 'bg-slate-200 border-slate-200';

        const labelClass = isCompleted
          ? 'text-emerald-700 font-bold'
          : isFailed
            ? 'text-red-600 font-bold'
            : isActive
              ? 'text-amber-700 font-bold'
              : 'text-slate-400';

        return (
          <div key={stage} className="flex items-center flex-1 last:flex-initial">
            <div className="flex flex-col items-center gap-1.5 min-w-[80px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold border-2 transition-all ${bgClass}`}>
                {isCompleted ? <Check className="w-4 h-4" /> : isFailed ? <XCircle className="w-4 h-4" /> : idx + 1}
              </div>
              <div className="text-center">
                <div className={`text-[10px] uppercase tracking-wider ${labelClass}`}>{stage}</div>
                {stageObj?.approver && (
                  <div className="text-[9px] text-slate-500 mt-0.5 max-w-[90px] truncate" title={stageObj.approver}>
                    {stageObj.approver}
                  </div>
                )}
                {stageObj?.approvedAt && (
                  <div className="text-[9px] text-slate-400">{formatDate(stageObj.approvedAt)}</div>
                )}
              </div>
            </div>
            {idx < NFA_APPROVAL_STAGES.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 rounded transition-colors ${
                isCompleted ? 'bg-emerald-400' : 'bg-slate-200'
              }`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Approval Status Banner ─── */
function ApprovalStatusBanner({ record, onOpenPo }) {
  const status = record.status;
  const isApproved = status === NFA_STATUS.APPROVED;
  const isRejected = status === NFA_STATUS.REJECTED;
  const isDraft = status === NFA_STATUS.DRAFT;
  const hasActiveStage = Boolean(record.currentStage);

  const tone = isApproved ? 'emerald' : isRejected ? 'red' : isDraft ? 'slate' : 'amber';
  const bgMap = { emerald: 'bg-emerald-50 border-emerald-200', red: 'bg-red-50 border-red-200', amber: 'bg-amber-50 border-amber-200', slate: 'bg-slate-50 border-slate-200' };
  const textMap = { emerald: 'text-emerald-700', red: 'text-red-700', amber: 'text-amber-700', slate: 'text-slate-700' };

  return (
    <div className={`rounded-xl border ${bgMap[tone]} px-5 py-4`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isApproved ? 'bg-emerald-100' : isRejected ? 'bg-red-100' : 'bg-amber-100'
          }`}>
            {isApproved && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {isRejected && <XCircle className="w-5 h-5 text-red-600" />}
            {!isApproved && !isRejected && <Send className="w-5 h-5 text-amber-600" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className={`text-sm font-bold ${textMap[tone]}`}>
                {isApproved ? 'Approved — All Stages Complete' : isRejected ? `Rejected at ${record.currentStage || ''} Stage` : isDraft ? 'Draft' : `Awaiting ${record.currentStage || ''} Approval`}
              </h3>
              <PurchaseStatusBadge status={status} variant="cpr" />
            </div>
            {isApproved && (
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-slate-600">Fully Approved By: <span className="font-bold">{record.approvedBy || '—'}</span></p>
                <p className="text-xs text-slate-600">Approval Date: <span className="font-bold">{formatDateTime(record.approvedAt)}</span></p>
                {record.poNo && (
                  <p className="text-xs text-slate-600 mt-1">
                    Purchase Order Raised:{' '}
                    <button type="button" onClick={() => onOpenPo?.(record.poNo)} className="font-bold text-[#0B4A3D] hover:underline cursor-pointer">
                      {record.poNo}
                    </button>
                  </p>
                )}
              </div>
            )}
            {isRejected && (
              <div className="mt-1 space-y-0.5">
                <p className="text-xs text-slate-600">Rejected By: <span className="font-bold">{record.approvedBy || '—'}</span></p>
                <p className="text-xs text-slate-600">Date: <span className="font-bold">{formatDateTime(record.approvedAt)}</span></p>
                {record.approvalRemarks && (
                  <p className="text-xs text-slate-600 mt-1">Reason: <span className="font-bold text-red-700">{record.approvalRemarks}</span></p>
                )}
              </div>
            )}
            {hasActiveStage && !isApproved && !isRejected && (
              <div className="mt-1">
                <p className="text-xs text-slate-600">Stage {NFA_APPROVAL_STAGES.indexOf(record.currentStage) + 1} of 3 — <span className="font-bold">{record.currentStage}</span> approval pending.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Document Chain ─── */
function DocumentChain({ record, linkedRfq, navigate, onCreatePo }) {
  const prNo = linkedRfq?.prNo || record.rfqNo;
  const rfqId = linkedRfq?.id;
  const pcsUrl = rfqId ? `/purchase/rfq/price-comparative-statement?rfq=${rfqId}` : null;
  const isApproved = record.status === NFA_STATUS.APPROVED;

  const openChip = (chip) => {
    if (chip.label === 'PO' && chip.to) {
      /* A PO was already raised for this approved note — open it. */
      navigate(chip.to);
      return;
    }
    if (chip.label === 'PO' && isApproved && onCreatePo) {
      onCreatePo();
      return;
    }
    if (chip.to) navigate(chip.to);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[
        { label: 'PR', value: prNo, to: `/purchase/requisition` },
        { label: 'RFQ', value: record.rfqNo, to: rfqId ? `/purchase/rfq/${rfqId}` : null },
        { label: 'Quotations', value: 'View', to: record.rfqNo ? `/purchase/rfq/quotations?rfq=${encodeURIComponent(record.rfqNo)}` : `/purchase/rfq/quotations` },
        { label: 'PCS', value: 'View', to: pcsUrl },
        { label: 'Negotiation', value: 'View', to: `/purchase/rfq/negotiation` },
        { label: 'NFA', value: record.nfaNo, to: null, current: true },
        /* PO chip — once a PO was raised from this note the chip shows
           the actual PO number and deep-links to it (the award is never
           converted twice); otherwise it offers Create PO on approval. */
        { label: 'PO', value: record.poNo || (isApproved ? 'Create PO' : 'Pending'), to: record.poNo ? `/purchase/orders/${record.poNo}` : null }
      ].map((chip, index) => (
        <div key={chip.label} className="flex items-center gap-1.5">
          {index > 0 && <ArrowRight className="w-3 h-3 text-slate-300 shrink-0" aria-hidden="true" />}
          <div className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] ${
            chip.current
              ? 'border-[#075E54] bg-[#075E54]/5 text-[#075E54] font-bold'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}>
            <span className="uppercase tracking-wider opacity-60">{chip.label}</span>
            {chip.to || (chip.label === 'PO' && isApproved && onCreatePo) ? (
              <button type="button" onClick={() => openChip(chip)} className="font-bold text-[#0B4A3D] hover:underline cursor-pointer">
                {chip.value}
              </button>
            ) : (
              <span className="font-bold">{chip.value}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Vendor Selection Justification ─── */
function SelectionJustification({ record, evaluation, linkedRfq, quotation }) {
  const justification = record.justification || record.purpose || '';
  const selection = evaluation?.selection;

  const points = useMemo(() => {
    const items = [];
    if (justification) items.push(justification);
    const vendors = evaluation?.vendors || [];
    if (selection?.selectedVendor) {
      const selectedVendorQuotes = vendors.filter((v) => v.vendor === selection.selectedVendor);
      if (selectedVendorQuotes.length > 0) {
        const v = selectedVendorQuotes[0];
        if (v.negotiatedValue != null) items.push(`Negotiated value: ${formatAmount(v.negotiatedValue, linkedRfq?.currency || 'INR')}`);
        if (v.score != null) items.push(`Overall score: ${v.score}/100`);
      }
    }
    if (quotation?.leadTime) items.push(`Delivery: ${quotation.leadTime}`);
    return items.filter(Boolean);
  }, [justification, selection, evaluation, linkedRfq, quotation]);

  const scores = useMemo(() => {
    if (!evaluation) return null;
    const tech = evaluation.technical;
    const comm = evaluation.commercial;
    if (!tech && !comm) return null;
    return {
      technical: tech?.score || tech?.total || null,
      commercial: comm?.score || comm?.total || null,
      overall: tech?.total && comm?.total ? Math.round((tech.total + comm.total) / 2) : null
    };
  }, [evaluation]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {points.map((point, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 shrink-0" />
            {point}
          </span>
        ))}
        {points.length === 0 && (
          <span className="text-xs text-slate-400 italic">No selection justification recorded.</span>
        )}
      </div>
      {scores && (
        <div className="flex flex-wrap gap-3 mt-2">
          {scores.technical != null && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 text-xs font-bold text-blue-700 border border-blue-200">
              Technical: {scores.technical}/100
            </div>
          )}
          {scores.commercial != null && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-50 text-xs font-bold text-violet-700 border border-violet-200">
              Commercial: {scores.commercial}/100
            </div>
          )}
          {scores.overall != null && (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#075E54]/10 text-xs font-bold text-[#075E54] border border-[#075E54]/25">
              <Trophy className="w-3 h-3" /> Overall: {scores.overall}/100
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function NfaDetail() {
  const navigate = useNavigate();
  /* NFA (Technical Purchase Approval) is its own area: submit, approve, reject
     and print are separately configurable, bounded by the RFQ parent. */
  const { can } = usePurchaseAccess();
  const canSubmitNfa = can('nfa', 'submit');
  const canApproveNfa = can('nfa', 'approve');
  const canRejectNfa = can('nfa', 'reject');
  const canPrintNfa = can('nfa', 'print');
  const { id } = useParams();
  const toast = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decisionModal, setDecisionModal] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [submitConfirm, setSubmitConfirm] = useState(false);

  /* Linked data */
  const [linkedRfq, setLinkedRfq] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [allQuotes, setAllQuotes] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [vendorDetails, setVendorDetails] = useState(null);
  const [documents, setDocuments] = useState([]);

  /* ─── Load NFA record ─── */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await nfaService.getNfa(id);
        if (cancelled) return;
        if (!data) { setNotFound(true); return; }
        setRecord(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [id]);

  /* ─── Resolve linked RFQ + quotation + evaluation data ─── */
  useEffect(() => {
    let cancelled = false;
    if (!record?.rfqNo) return;

    const rfqNo = record.rfqNo;

    rfqService.getRfqs({ rfqNo, page: 1, pageSize: 10 })
      .then((result) => {
        if (cancelled) return;
        const match = (result.data || []).find((r) => r.rfqNo === rfqNo);
        if (match) {
          setLinkedRfq({
            id: match.id,
            rfqNo: match.rfqNo,
            title: match.title,
            prNo: match.prNo || match.reference || '',
            department: match.department || '',
            project: match.project || '',
            requester: match.requester || '',
            commercialTerms: match.commercialTerms || {},
            items: match.items || [],
            currency: match.currency || 'INR'
          });

          rfqService.getQuotationComparison(match.id).then((comp) => {
            if (cancelled) return;
            const quotes = comp?.quotes || [];
            setAllQuotes(quotes);
            const vendorQuote = quotes.find((q) => q.vendor === record.supplier) || quotes[0] || null;
            setQuotation(vendorQuote);
          }).catch(() => {});

          evaluationService.getEvaluation(match.id).then((evalData) => {
            if (cancelled) return;
            setEvaluation(evalData);
          }).catch(() => {});
        }
      })
      .catch(() => {});

    const vendorMatch = vendorsStore.all.find((v) => v.name === record.supplier);
    if (vendorMatch && !cancelled) {
      setTimeout(() => setVendorDetails(vendorMatch), 0);
    }

    documentsService.getDocuments({ rfqNo, page: 1, pageSize: 100 }).then((result) => {
      if (cancelled) return;
      setDocuments(result.data || []);
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [record?.rfqNo, record?.supplier]);

  /* ─── Action handlers ─── */
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
      setDecisionModal(null);
      setSubmitConfirm(false);
      setRemarks('');
    }
  };

  const confirmDecision = async () => {
    if (!decisionModal || busy) return;
    if (decisionModal === 'approve') {
      await runAction(
        () => nfaService.approveStage(record.id, { stage: record.currentStage, remarks }),
        `${record.nfaNo} — ${record.currentStage} stage approved`
      );
    } else if (decisionModal === 'reject') {
      await runAction(
        () => nfaService.rejectStage(record.id, { stage: record.currentStage, remarks }),
        `${record.nfaNo} — ${record.currentStage} stage rejected`
      );
    }
  };

  /* NFA → PO conversion: route through the service conversion guard.
     If the award/selection was already converted, the existing PO is
     opened — a second PO is never raised for the same award. Otherwise
     the PO create form is opened pre-filled from the shared RFQ →
     quotation → supplier-selection stores, so the generated PO carries
     the approved line items, vendor and values instead of starting
     blank. */
  const openPoCreate = async () => {
    if (busy || !record || record.status !== NFA_STATUS.APPROVED) return;
    setBusy(true);
    try {
      const result = await nfaService.preparePoConversion(record.id);
      if (result.existing) {
        toast.info(`${record.nfaNo} is already converted — opening ${result.existing.poNo}`);
        navigate(`/purchase/orders/${result.existing.id}`);
      } else {
        navigate('/purchase/orders/new', { state: { poPrefill: result.prefill } });
      }
    } catch (err) {
      toast.error(err?.message || 'Could not prepare the purchase order');
    } finally {
      setBusy(false);
    }
  };

  /* ─── Derive commercial summary from quotation data ─── */
  const commercialSummary = useMemo(() => {
    if (!record) {
      return { quotedAmount: 0, negotiatedAmount: 0, discount: 0, tax: 0, freight: 0, finalAmount: 0, savings: 0, savingsPct: 0 };
    }
    if (!quotation) {
      return { quotedAmount: record.amount || 0, negotiatedAmount: record.amount || 0, discount: 0, tax: 0, freight: 0, finalAmount: record.amount || 0, savings: 0, savingsPct: 0 };
    }
    const quoted = quotation.total || 0;
    const negotiated = record.amount || quoted;
    const discount = quotation.discountAmount || 0;
    const tax = quotation.gstTotal || 0;
    const freight = (Number(quotation.freight) || 0) + (Number(quotation.insurance) || 0) + (Number(quotation.charges) || 0);
    const savings = Math.max(0, quoted - negotiated);
    const savingsPct = quoted > 0 ? Math.round((savings / quoted) * 1000) / 10 : 0;
    return { quotedAmount: quoted, negotiatedAmount: negotiated, discount, tax, freight, finalAmount: negotiated, savings, savingsPct };
  }, [quotation, record]);

  /* ─── Derive item details from linked RFQ + quotation ─── */
  const itemDetails = useMemo(() => {
    const rfqItems = linkedRfq?.items || [];
    if (rfqItems.length === 0) return [];
    return rfqItems.map((rfqItem, idx) => {
      const quoteLine = quotation?.items?.[idx] || {};
      const qty = Number(rfqItem.qty) || Number(quoteLine.qty) || 0;
      const unitPrice = Number(quoteLine.rate) || Number(rfqItem.rate) || 0;
      const gstRate = Number(quoteLine.gstRate || linkedRfq?.commercialTerms?.taxRate) || 18;
      const lineTotal = Math.round(qty * unitPrice * 100) / 100;
      const taxAmount = Math.round(lineTotal * (gstRate / 100) * 100) / 100;
      return {
        product: rfqItem.product || quoteLine.product || `Item ${idx + 1}`,
        specification: rfqItem.specification || '',
        qty,
        uom: rfqItem.uom || quoteLine.uom || '',
        unitPrice,
        gstRate,
        lineTotal: Math.round((lineTotal + taxAmount) * 100) / 100
      };
    });
  }, [linkedRfq, quotation]);

  const terms = linkedRfq?.commercialTerms || {};

  /* ─── Loading / Error states ─── */
  if (loading) return <PurchasePageLayout><NfaLoading /></PurchasePageLayout>;
  if (notFound || !record) return <PurchasePageLayout><NfaNotFound navigate={navigate} /></PurchasePageLayout>;

  const isDraft = record.status === NFA_STATUS.DRAFT;
  const isApproved = record.status === NFA_STATUS.APPROVED;
  const isRejected = record.status === NFA_STATUS.REJECTED;
  const hasActiveStage = Boolean(record.currentStage) && !isApproved && !isRejected;
  const currency = record.currency || 'INR';
  const stageLabel = record.currentStage ? `${NFA_APPROVAL_STAGES.indexOf(record.currentStage) + 1}/3` : '';

  return (
    <PurchasePageLayout>
      {/* ─── Page Header ─── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Approval Flow', to: '/purchase/rfq/approval' },
          { label: record.nfaNo }
        ]}
        icon={Stamp}
        title={record.nfaNo}
        subtitle={`${record.rfqTitle || 'Approval Flow'}${record.currentStage ? ` — Stage ${stageLabel}` : ''}`}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/rfq/approval')} className="btn btn-ghost btn-sm">
              <ChevronLeft size={12} /> Back
            </button>
            {canPrintNfa && (
              <button type="button" onClick={() => navigate(`/purchase/rfq/approval/${record.id}/print`)} className="btn btn-ghost btn-sm">
                <Printer size={12} /> Print
              </button>
            )}
            {canSubmitNfa && isDraft && (
              <button type="button" onClick={() => setSubmitConfirm(true)} disabled={busy} className="erp-btn-primary">
                <span className="erp-btn-icon"><Send size={16} /></span> Submit for Approval
              </button>
            )}
            {canApproveNfa && hasActiveStage && (
              <>
                {canRejectNfa && (
                  <button type="button" onClick={() => setDecisionModal('reject')} disabled={busy} className="po-btn po-btn-danger">
                    <XCircle className="po-btn-icon-ic" /> Reject
                  </button>
                )}
                <button type="button" onClick={() => setDecisionModal('approve')} disabled={busy} className="erp-btn-primary">
                  <span className="erp-btn-icon"><CheckCircle2 size={16} /></span> Approve {record.currentStage}
                </button>
              </>
            )}
            {isApproved && (record.poNo ? (
              /* A PO was already raised from this note — open it instead
                 of offering a second conversion. */
              <button type="button" onClick={() => navigate(`/purchase/orders/${record.poNo}`)} disabled={busy} className="erp-btn-primary">
                <span className="erp-btn-icon"><FileText size={16} /></span> View Purchase Order
              </button>
            ) : (
              <button type="button" onClick={openPoCreate} disabled={busy} className="erp-btn-primary">
                <span className="erp-btn-icon"><FileText size={16} /></span> Create Purchase Order
              </button>
            ))}
          </>
        }
      />

      {/* ─── Approval Stepper ─── */}
      <div className="bg-surface border border-slate-200 rounded-xl px-6 py-4 shadow-sm">
        <ApprovalStepper record={record} />
      </div>

      {/* ─── Approval Status Banner ─── */}
      <ApprovalStatusBanner record={record} onOpenPo={(poNo) => navigate(`/purchase/orders/${poNo}`)} />

      {/* ─── Compact Summary Row ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <DetailItem label="PR Number" value={linkedRfq?.prNo || record.rfqNo || '—'} />
        <DetailItem label="RFQ" value={record.rfqNo || '—'} />
        <DetailItem label="Department" value={linkedRfq?.department || '—'} />
        <DetailItem label="Vendor" value={record.supplier || '—'} />
        <DetailItem label="Final Value" value={formatAmount(record.amount, currency)} valueClass="text-[#075E54] font-bold text-sm" />
        <DetailItem label="Purpose" value={record.purpose || '—'} />
      </div>

      {/* ─── Item Details ─── */}
      {itemDetails.length > 0 && (
        <PurchaseSectionCard title="Item Details" subtitle="Items being purchased under this approval">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[700px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left">Item</th>
                  <th className="px-4 py-2.5 text-left">Specification</th>
                  <th className="px-4 py-2.5 text-right">Qty</th>
                  <th className="px-4 py-2.5 text-right">Unit Price</th>
                  <th className="px-4 py-2.5 text-right">Tax</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {itemDetails.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-slate-800">{item.product}</td>
                    <td className="px-4 py-2.5 text-slate-500 text-[11px] max-w-[200px] truncate" title={item.specification}>
                      {item.specification || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {item.qty} <span className="text-slate-400">{item.uom}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                      {formatAmount(item.unitPrice, currency)}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">{item.gstRate}%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#075E54]">
                      {formatAmount(item.lineTotal, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </PurchaseSectionCard>
      )}

      {/* ─── Commercial Summary + Vendor Info (2-col) ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <PurchaseSectionCard title="Commercial Summary" subtitle="Financial breakdown">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <DetailItem label="Quoted Amount" value={formatAmount(commercialSummary.quotedAmount, currency)} />
            <DetailItem label="Negotiated Amount" value={formatAmount(commercialSummary.negotiatedAmount, currency)} />
            <DetailItem label="Discount" value={commercialSummary.discount > 0 ? formatAmount(commercialSummary.discount, currency) : '—'} />
            <DetailItem label="Tax" value={formatAmount(commercialSummary.tax, currency)} />
            <DetailItem label="Freight / Other" value={commercialSummary.freight > 0 ? formatAmount(commercialSummary.freight, currency) : '—'} />
            <DetailItem label="Final Amount" value={formatAmount(commercialSummary.finalAmount, currency)} valueClass="text-[#075E54] font-bold text-sm" />
            <DetailItem label="Savings" value={commercialSummary.savings > 0 ? formatAmount(commercialSummary.savings, currency) : '—'} valueClass={commercialSummary.savings > 0 ? 'text-emerald-600' : ''} />
            <DetailItem label="Savings %" value={commercialSummary.savingsPct > 0 ? `${commercialSummary.savingsPct}%` : '—'} valueClass={commercialSummary.savingsPct > 0 ? 'text-emerald-600' : ''} />
          </div>
        </PurchaseSectionCard>

        <PurchaseSectionCard title="Selected Vendor" subtitle="Vendor details">
          <div className="space-y-2.5">
            <DetailItem label="Vendor Name" value={vendorDetails?.name || record.supplier || '—'} />
            {vendorDetails?.email && (
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-600">{vendorDetails.email}</span>
              </div>
            )}
            {vendorDetails?.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs text-slate-600">{vendorDetails.phone}</span>
              </div>
            )}
            {vendorDetails?.gstin && <DetailItem label="GST / Tax ID" value={vendorDetails.gstin} />}
            {vendorDetails?.formattedAddress && (
              <div className="flex items-start gap-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                <span className="text-xs text-slate-600">{vendorDetails.formattedAddress}</span>
              </div>
            )}
            {!vendorDetails && <p className="text-xs text-slate-400 italic">Vendor details not available.</p>}
          </div>
        </PurchaseSectionCard>
      </div>

      {/* ─── Vendor Selection Justification ─── */}
      <PurchaseSectionCard title="Vendor Selection Justification" subtitle="Why this vendor was selected">
        <SelectionJustification record={record} evaluation={evaluation} linkedRfq={linkedRfq} quotation={quotation} />
      </PurchaseSectionCard>

      {/* ─── Quotation Comparison ─── */}
      {allQuotes.length > 0 && (
        <PurchaseSectionCard title="Quotation Comparison" subtitle="Comparison of vendor quotations">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[650px]">
              <thead>
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left">Vendor</th>
                  <th className="px-4 py-2.5">Quotation</th>
                  <th className="px-4 py-2.5 text-right">Quoted</th>
                  <th className="px-4 py-2.5 text-right">Negotiated</th>
                  <th className="px-4 py-2.5 text-right">Final Value</th>
                  <th className="px-4 py-2.5 text-right">Delivery</th>
                  <th className="px-4 py-2.5">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allQuotes
                  .filter((q) => ['Received', 'Accepted'].includes(q.status))
                  .sort((a, b) => (a.total || 0) - (b.total || 0))
                  .map((q) => {
                    const isSelected = q.vendor === record.supplier;
                    return (
                      <tr key={q.id} className={`transition-colors ${isSelected ? 'bg-[#075E54]/5 border-l-2 border-l-[#075E54]' : 'hover:bg-slate-50/40'}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-semibold ${isSelected ? 'text-[#075E54]' : 'text-slate-800'}`}>{q.vendor}</span>
                            {isSelected && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-[#075E54] text-white">
                                <Trophy className="w-2.5 h-2.5" /> Selected
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className="font-mono text-[11px] text-slate-500">{q.quotationNo || q.id}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{formatAmount(q.total, currency)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                          {isSelected && record.amount ? formatAmount(record.amount, currency) : formatAmount(q.total, currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-bold text-[#075E54]">
                          {isSelected && record.amount ? formatAmount(record.amount, currency) : formatAmount(q.total, currency)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600">{q.delivery || '—'}</td>
                        <td className="px-4 py-2.5 text-slate-600">{q.paymentTerms || '—'}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </PurchaseSectionCard>
      )}

      {/* ─── Commercial Terms ─── */}
      <PurchaseSectionCard title="Commercial Terms" subtitle="Terms from the quotation and RFQ">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4">
          <DetailItem label="Tax" value={terms.taxRate ? `${terms.taxRate}% GST` : '—'} />
          <DetailItem label="Incoterm" value={terms.incoterm || '—'} />
          <DetailItem label="Payment Terms" value={quotation?.paymentTerms || terms.paymentTerms || '—'} />
          <DetailItem label="Delivery Terms" value={terms.deliveryTerms || '—'} />
          <DetailItem label="Delivery Period" value={quotation?.leadTime ? `${quotation.leadTime} days` : '—'} />
          <DetailItem label="Warranty" value={quotation?.warranty || terms.warranty || '—'} />
          <DetailItem label="Freight" value={terms.freight || '—'} />
          <DetailItem label="Remarks" value={record.purpose || '—'} />
        </div>
      </PurchaseSectionCard>

      {/* ─── Attachments ─── */}
      {documents.length > 0 && (
        <PurchaseSectionCard title="Attachments" subtitle="Supporting documents">
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.docId || doc.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{doc.name || doc.docNo}</p>
                    <p className="text-[10px] text-slate-400">{doc.stage || 'Document'} · {doc.uploadedAt ? formatDate(doc.uploadedAt) : '—'}</p>
                  </div>
                </div>
                <a
                  href={doc.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-[#0B4A3D] bg-[#EDF7F4] border border-[#0B4A3D]/20 rounded-md hover:bg-[#E0F2EC] transition-colors shrink-0"
                >
                  <ExternalLink size={10} /> View
                </a>
              </div>
            ))}
          </div>
        </PurchaseSectionCard>
      )}

      {/* ─── Bottom: Approval History + Document Chain + Next Step ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 space-y-5">
          <PurchaseSectionCard title="Approval History" subtitle="Workflow activity and decision trail">
            <PurchaseApprovalTimeline activity={record.activity || []} emptyLabel="No workflow activity recorded yet." />
          </PurchaseSectionCard>
        </div>

        <div className="space-y-5 xl:sticky xl:top-[76px] self-start">
          <PurchaseSectionCard title="Document Chain" subtitle="Procurement workflow chain">
            <DocumentChain record={record} linkedRfq={linkedRfq} navigate={navigate} onCreatePo={openPoCreate} />
          </PurchaseSectionCard>

          {isApproved && (record.poNo ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mb-2">
                <BadgeCheck className="w-3.5 h-3.5" /> Purchase Order Raised
              </h4>
              <p className="text-xs text-emerald-600 mb-3">
                All 3 approval stages complete. Purchase Order <strong>{record.poNo}</strong> was raised for{' '}
                <strong>{record.supplier || 'the selected vendor'}</strong> at{' '}
                <strong>{formatAmount(record.amount, currency)}</strong>.
              </p>
              <button
                type="button"
                onClick={() => navigate(`/purchase/orders/${record.poNo}`)}
                disabled={busy}
                className="inline-flex items-center gap-2 text-xs font-bold text-white bg-[#075E54] hover:bg-[#064D44] px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-60"
              >
                <FileText size={14} /> View Purchase Order
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h4 className="text-xs font-bold text-emerald-700 flex items-center gap-1.5 mb-2">
                <BadgeCheck className="w-3.5 h-3.5" /> Next Step
              </h4>
              <p className="text-xs text-emerald-600 mb-3">
                All 3 approval stages complete. Create a Purchase Order for <strong>{record.supplier || 'the selected vendor'}</strong> at <strong>{formatAmount(record.amount, currency)}</strong>.
              </p>
              <button
                type="button"
                onClick={openPoCreate}
                disabled={busy}
                className="inline-flex items-center gap-2 text-xs font-bold text-white bg-[#075E54] hover:bg-[#064D44] px-4 py-2 rounded-lg transition-colors shadow-sm disabled:opacity-60"
              >
                <FileText size={14} /> Create Purchase Order
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Submit for Approval Confirmation ─── */}
      <ConfirmDialog
        open={submitConfirm}
        title="Submit for approval?"
        message={`${record.nfaNo} will be submitted for 3-stage sequential approval: First → Second → Final. Each stage requires a separate approval before the Purchase Order stage is unlocked.`}
        confirmLabel="Submit for Approval"
        variant="default"
        icon={Send}
        loading={busy}
        onConfirm={() => runAction(() => nfaService.submitNfa(record.id), `${record.nfaNo} submitted for approval`)}
        onCancel={() => setSubmitConfirm(false)}
      />

      {/* ─── Approve / Reject Decision Modal ─── */}
      <Modal
        open={Boolean(decisionModal)}
        onClose={() => { setDecisionModal(null); setRemarks(''); }}
        title={`${decisionModal === 'approve' ? 'Approve' : 'Reject'} ${record.currentStage || ''} Stage — ${record.nfaNo}`}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setDecisionModal(null); setRemarks(''); }}>Cancel</button>
            <button
              type="button"
              className={decisionModal === 'approve' ? 'btn btn-primary btn-sm' : 'po-btn po-btn-danger'}
              disabled={busy || (decisionModal === 'reject' && !remarks.trim())}
              onClick={confirmDecision}
            >
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : decisionModal === 'approve' ? <CheckCircle2 className="po-btn-icon-ic" /> : <XCircle className="po-btn-icon-ic" />}
              {decisionModal === 'approve' ? `Approve ${record.currentStage}` : `Reject ${record.currentStage}`}
            </button>
          </>
        }
      >
        <div className="space-y-3.5 text-xs text-slate-600">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
            <div>
              <span className={LABEL}>Approval Number</span>
              <div className="font-bold text-slate-800 mt-0.5">{record.nfaNo}</div>
            </div>
            <div>
              <span className={LABEL}>Vendor</span>
              <div className="font-bold text-slate-800 mt-0.5">{record.supplier || '—'}</div>
            </div>
            <div>
              <span className={LABEL}>RFQ</span>
              <div className="font-bold text-slate-800 mt-0.5">{record.rfqNo}</div>
            </div>
            <div>
              <span className={LABEL}>Value</span>
              <div className="font-bold text-emerald-700 mt-0.5">{formatAmount(record.amount, currency)}</div>
            </div>
            <div>
              <span className={LABEL}>Current Stage</span>
              <div className="font-bold text-amber-700 mt-0.5">{record.currentStage} ({NFA_APPROVAL_STAGES.indexOf(record.currentStage) + 1}/3)</div>
            </div>
            <div>
              <span className={LABEL}>Next Stage</span>
              <div className="font-bold text-slate-800 mt-0.5">
                {(() => {
                  const stages = NFA_APPROVAL_STAGES;
                  const idx = stages.indexOf(record.currentStage);
                  return idx >= 0 && idx < stages.length - 1 ? stages[idx + 1] : 'All Complete';
                })()}
              </div>
            </div>
          </div>
          <p>
            {decisionModal === 'approve'
              ? `This approves the ${record.currentStage} stage of ${record.nfaNo}. The NFA then advances to the next approval stage${record.currentStage === 'Final' ? ' and becomes fully approved' : ''}.`
              : `This rejects ${record.nfaNo} at the ${record.currentStage} stage. The NFA will not proceed further.`}
          </p>
          {decisionModal === 'approve' && record.currentStage === 'Final' && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
              <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Final Stage — Approve to Complete NFA
              </p>
              <p className="text-[11px] text-emerald-600 mt-1">
                Approving the Final stage fully approves the NFA and unlocks Purchase Order creation for <strong>{record.supplier || 'the selected vendor'}</strong> at <strong>{formatAmount(record.amount, currency)}</strong>.
              </p>
            </div>
          )}
          <FormField label={decisionModal === 'reject' ? 'Reason for Rejection *' : 'Comments / Remarks'}>
            <TextArea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={decisionModal === 'approve' ? 'Approval remarks…' : 'Provide a reason for rejection…'}
            />
          </FormField>
          {decisionModal === 'reject' && !remarks.trim() && (
            <p className="text-[10px] text-red-500">A reason is required for rejection.</p>
          )}
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}
