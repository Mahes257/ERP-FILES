/**
 * purchase/pages/evaluation/TechnicalEvaluationDetail.jsx
 * ------------------------------------------------------------------
 * Technical Evaluation — DETAIL view for ONE RFQ.
 * Multi-vendor evaluation with per-vendor scores and decisions.
 *
 * Each vendor quotation is evaluated independently:
 *   - Enter scores for 4 weighted criteria
 *   - Save scores (persisted)
 *   - Make a technical decision (Qualified / Not Qualified)
 *   - RFQ-level status derived from all vendor decisions
 *
 * Route: /purchase/rfq/technical-evaluation/:rfqId
 * Workflow: Evaluation → Technical Decision → Proceed to Approval
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronLeft, ClipboardCheck,
  FileText, FileSearch, Loader2, RefreshCw, SearchCheck, Shield,
  TrendingUp, ArrowRight, Save, X
} from 'lucide-react';
import { Modal, NumberInput, TextArea, useToast } from '../../components/ui';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { evaluationService, VENDOR_EVAL_STATUS, QUALIFICATION_THRESHOLD } from '../../services/evaluation';
import { nfaService } from '../../services/nfa';
import { formatAmount } from '../../utils/purchase';
import { formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';

/* ==================== Technical Criteria Definition ==================== */
const TECH_CRITERIA = [
  { key: 'compliance', label: 'Specification Compliance', weight: 40, icon: ClipboardCheck },
  { key: 'quality', label: 'Quality & Certification', weight: 25, icon: Shield },
  { key: 'delivery', label: 'Delivery Capability', weight: 20, icon: TrendingUp },
  { key: 'postPurchase', label: 'Post-Purchase Support', weight: 15, icon: FileText },
];

function criterionScore(row, key) {
  return row.technical?.find((c) => c.key === key)?.score ?? 0;
}

/* ==================== 3-Step Progress Indicator ==================== */
function EvalProgress({ evalDone, decisionDone }) {
  const steps = [
    {
      label: 'Evaluation',
      done: evalDone,
      active: !evalDone,
    },
    {
      label: 'Technical Decision',
      done: decisionDone,
      active: evalDone && !decisionDone,
    },
    {
      label: 'Proceed to Approval',
      done: false,
      active: evalDone && decisionDone,
    },
  ];

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-3">
          {i > 0 && <span className="text-slate-300 text-xs">→</span>}
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
            s.done
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : s.active
                ? 'bg-[#0B4A3D] text-white border border-[#0B4A3D]'
                : 'bg-slate-50 text-slate-400 border border-slate-200'
          }`}>
            {s.done ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-4 h-4 rounded-full border-2 border-current flex items-center justify-center text-[8px]">{i + 1}</span>}
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==================== Compact RFQ Info Card ==================== */
function RfqInfoCard({ item }) {
  const summary = item.vendorEvalSummary || {};
  const fields = [
    { label: 'RFQ Number', value: item.rfqNo },
    { label: 'RFQ Title', value: item.title },
    { label: 'Status', value: <PurchaseStatusBadge status={item.rfqStatus} /> },
    { label: 'Vendors', value: `${item.vendors?.length || 0} (${summary.qualified || 0} Qualified, ${summary.notQualified || 0} Not Qualified)` },
  ];
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">RFQ Information</h3>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 px-5 py-4">
        {fields.map((f) => (
          <div key={f.label}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{f.label}</div>
            <div className="text-xs font-semibold text-slate-800 mt-0.5 truncate" title={typeof f.value === 'string' ? f.value : undefined}>
              {f.value || '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ==================== Editable Vendor Evaluation Card ==================== */
function VendorEvalCard({
  row, rank, currency, isExpanded, onToggle,
  onSaveScores, onSaveDecision, saving
}) {
  const [editing, setEditing] = useState(false);
  const [scores, setScores] = useState(() => {
    const s = {};
    TECH_CRITERIA.forEach((c) => { s[c.key] = criterionScore(row, c.key); });
    return s;
  });
  const [remarks, setRemarks] = useState(row.evalRemarks || '');
  const [confirmDecision, setConfirmDecision] = useState(null);

  const technicalTotal = useMemo(() => {
    let total = 0;
    TECH_CRITERIA.forEach((c) => { total += (Number(scores[c.key]) || 0) * (c.weight / 100); });
    return Math.round(total);
  }, [scores]);

  const isQualified = technicalTotal >= QUALIFICATION_THRESHOLD;
  const evalStatus = row.evalStatus || VENDOR_EVAL_STATUS.PENDING;
  const hasDecision = evalStatus === VENDOR_EVAL_STATUS.QUALIFIED || evalStatus === VENDOR_EVAL_STATUS.NOT_QUALIFIED;

  const handleSave = async () => {
    await onSaveScores(row.vendor, scores, remarks);
    setEditing(false);
  };

  const handleDecision = async (decision) => {
    await onSaveDecision(row.vendor, decision, `Marked as ${decision}`);
    setConfirmDecision(null);
  };

  const resetScores = () => {
    const s = {};
    TECH_CRITERIA.forEach((c) => { s[c.key] = criterionScore(row, c.key); });
    setScores(s);
    setRemarks(row.evalRemarks || '');
    setEditing(false);
  };

  return (
    <div className={`rounded-xl border bg-white overflow-hidden transition-shadow ${
      hasDecision
        ? (evalStatus === VENDOR_EVAL_STATUS.QUALIFIED ? 'border-emerald-200' : 'border-rose-200')
        : editing
          ? 'border-[#0B4A3D] shadow-md'
          : 'border-slate-200'
    }`}>
      {/* Vendor Header */}
      <div className={`px-5 py-4 flex items-center justify-between ${
        hasDecision
          ? (evalStatus === VENDOR_EVAL_STATUS.QUALIFIED ? 'bg-emerald-50/40' : 'bg-rose-50/40')
          : 'bg-slate-50/40'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold shrink-0 ${
            rank === 1 ? 'bg-emerald-100 text-emerald-700' : rank === 2 ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-500'
          }`}>
            #{rank}
          </span>
          <span className="text-sm font-bold text-slate-800 truncate">{row.vendor}</span>
        </div>
        <div className="flex items-center gap-2">
          {hasDecision && (
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
              evalStatus === VENDOR_EVAL_STATUS.QUALIFIED
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                : 'bg-rose-100 text-rose-700 border border-rose-200'
            }`}>
              {evalStatus === VENDOR_EVAL_STATUS.QUALIFIED ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
              {evalStatus === VENDOR_EVAL_STATUS.QUALIFIED ? 'TECHNICALLY QUALIFIED' : 'NOT QUALIFIED'}
            </span>
          )}
          {!hasDecision && evalStatus === VENDOR_EVAL_STATUS.IN_PROGRESS && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 bg-blue-100 text-blue-700 border border-blue-200">
              Scores Entered
            </span>
          )}
        </div>
      </div>

      {/* Technical Score + Criteria */}
      <div className="px-5 py-4">
        {/* Overall Score */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Technical Score</span>
          <span className={`text-lg font-extrabold ${isQualified ? 'text-emerald-700' : 'text-rose-600'}`}>
            {technicalTotal}
          </span>
          <span className="text-xs text-slate-400">/ 100</span>
          <span className="text-[10px] text-slate-400 ml-2">(threshold: {QUALIFICATION_THRESHOLD})</span>
          {/* Visual score bar */}
          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden ml-3" style={{ minWidth: 60, maxWidth: 120 }}>
            <div
              className={`h-full rounded-full transition-all ${isQualified ? 'bg-emerald-500' : 'bg-rose-500'}`}
              style={{ width: `${technicalTotal}%` }}
            />
          </div>
        </div>

        {/* 4 Score Metrics — always-visible visual bars + editable or read-only */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {TECH_CRITERIA.map((c) => {
            const score = editing ? (Number(scores[c.key]) || 0) : criterionScore(row, c.key);
            return (
              <div key={c.key} className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{c.label}</div>
                  <span className="text-[10px] text-slate-400">{c.weight}%</span>
                </div>
                {editing ? (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={scores[c.key] || ''}
                    onChange={(e) => setScores((prev) => ({ ...prev, [c.key]: Number(e.target.value) || 0 }))}
                    className="w-full h-8 px-2 rounded-md border border-slate-200 text-sm font-bold text-slate-800 outline-none focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D]/20"
                  />
                ) : (
                  <div className="flex items-baseline gap-1">
                    <span className="text-sm font-extrabold text-slate-800">{score}</span>
                    <span className="text-[10px] text-slate-400">/ 100</span>
                  </div>
                )}
                {/* Visual score bar */}
                <div className="h-1.5 bg-slate-200/70 rounded-full overflow-hidden mt-1.5">
                  <div
                    className="h-full rounded-full bg-[#0B4A3D] transition-all"
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Edit / Save / Cancel / Decision */}
        <div className="flex items-center gap-2 mt-3">
          {!editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
              >
                <ClipboardCheck className="w-3 h-3" /> Edit Scores
              </button>
              {!hasDecision && evalStatus !== VENDOR_EVAL_STATUS.PENDING && (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDecision('Qualified')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="w-3 h-3" /> Mark Qualified
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDecision('Not Qualified')}
                    className="inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer text-white bg-rose-600 hover:bg-rose-700"
                  >
                    <AlertTriangle className="w-3 h-3" /> Mark Not Qualified
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={onToggle}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                {isExpanded ? 'Hide' : 'View'} Details
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-1.5 rounded-lg cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save Scores
              </button>
              <button
                type="button"
                onClick={resetScores}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </>
          )}
        </div>

        {/* Remarks */}
        {editing && (
          <div className="mt-3">
            <TextArea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional evaluation remarks for this vendor..."
            />
          </div>
        )}
      </div>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="px-5 pb-4 border-t border-slate-100 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Score Breakdown with Bars */}
            <div>
              <h4 className="text-[11px] font-bold text-slate-500 mb-2">Score Breakdown</h4>
              <div className="space-y-2">
                {TECH_CRITERIA.map((c) => {
                  const score = editing ? (Number(scores[c.key]) || 0) : criterionScore(row, c.key);
                  return (
                    <div key={c.key}>
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span className="font-bold text-slate-500">{c.label} ({c.weight}%)</span>
                        <span className="font-semibold text-slate-600">{score}/100</span>
                      </div>
                      <div className="h-1.5 bg-slate-200/70 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#0B4A3D]" style={{ width: `${score}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Commercial Reference (secondary) */}
            <div>
              <h4 className="text-[11px] font-bold text-slate-500 mb-2">Commercial Reference</h4>
              <div className="space-y-1.5">
                {[
                  { label: 'Quoted Value', value: formatAmount(row.total, currency) },
                  { label: 'Delivery', value: row.delivery ? `${row.delivery} days` : '—' },
                  { label: 'Payment Terms', value: row.paymentTerms || '—' },
                  { label: 'Warranty', value: row.warranty || '—' },
                  { label: 'Evaluated By', value: row.evaluatedBy || '—' },
                  { label: 'Evaluated At', value: row.evaluatedAt ? formatDateTime(row.evaluatedAt) : '—' },
                ].map((field) => (
                  <div key={field.label} className="flex justify-between text-[11px]">
                    <span className="text-slate-400">{field.label}</span>
                    <span className="font-semibold text-slate-700">{field.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Decision Modal */}
      {confirmDecision && (
        <div className="px-5 pb-4 border-t border-slate-100 pt-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
            <p className="text-xs font-semibold text-amber-700 mb-2">
              Confirm: Mark <strong>{row.vendor}</strong> as <strong>{confirmDecision}</strong>?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDecision(confirmDecision)}
                disabled={saving}
                className={`inline-flex items-center gap-1 text-[11px] font-bold px-3 py-1.5 rounded-lg cursor-pointer ${
                  confirmDecision === 'Qualified'
                    ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                    : 'text-white bg-rose-600 hover:bg-rose-700'
                } disabled:opacity-50`}
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : confirmDecision === 'Qualified' ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                Confirm {confirmDecision}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDecision(null)}
                className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==================== Main Component ==================== */
export default function TechnicalEvaluationDetail() {
  const navigate = useNavigate();
  const { rfqId } = useParams();
  const toast = useToast();

  const [item, setItem] = useState(null);
  const [vendorRows, setVendorRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedVendor, setExpandedVendor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const [boardData, vendorData] = await Promise.all([
        evaluationService.getEvaluation(rfqId),
        evaluationService.getVendorEvaluations(rfqId)
      ]);
      if (!boardData) {
        setNotFound(true);
        return;
      }
      setItem(boardData);
      setVendorRows(vendorData || []);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [rfqId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  /* Save scores for a vendor */
  const handleSaveScores = async (vendorName, scores, remarks) => {
    setSaving(true);
    try {
      await evaluationService.saveVendorEvaluation(item.rfqId, vendorName, { scores, remarks });
      toast.success(`Scores saved for ${vendorName}`);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Failed to save scores');
    } finally {
      setSaving(false);
    }
  };

  /* Make a technical decision for a vendor */
  const handleSaveDecision = async (vendorName, decision, remarks) => {
    setSaving(true);
    try {
      await evaluationService.setVendorDecision(item.rfqId, vendorName, decision, { remarks });
      toast.success(`${vendorName} marked as ${decision}`);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Failed to save decision');
    } finally {
      setSaving(false);
    }
  };

  /* Complete the RFQ-level technical evaluation, then open the Approval
     Flow for THIS RFQ. If the RFQ-level flag is already set this is a
     no-op; otherwise it sets record.technical so downstream services
     (nfa.buildCandidates) recognise the evaluation as complete.
     approvalFlowRouteFor() then resolves the RFQ's real approval state:
     the create page (pre-selected via ?rfqId=) while a note can still be
     raised, or the note this RFQ already raised when the Approval Flow
     has already passed this point — never the generic list, and never a
     create page that would refuse the RFQ. */
  const handleProceedToApproval = async () => {
    if (!completed) {
      try {
        await evaluationService.completeTechnicalEvaluation(item.rfqId, {
          remarks: 'Technical evaluation completed — proceeding to approval'
        });
        await load();
      } catch {
        /* If the strict workflow gate prevents explicit completion (e.g.
           comparison / negotiation not recorded), the NFA service now
           recognises per-vendor decisions as proof of completion, so
           we still navigate. */
      }
    }
    navigate(await nfaService.approvalFlowRouteFor(item.rfqId, item.rfqNo));
  };

  /* Sorted vendors by technical score */
  const sortedVendors = useMemo(() => {
    return [...vendorRows].sort(
      (a, b) => b.technicalTotal - a.technicalTotal || a.total - b.total
    );
  }, [vendorRows]);

  /* Summary stats — data-driven from per-vendor evaluations */
  const summaryStats = useMemo(() => {
    if (!item) return { total: 0, evaluated: 0, qualified: 0, notQualified: 0, pending: 0, bestVendor: null };
    const vendors = vendorRows || [];
    const evaluated = vendors.filter((v) => v.evalStatus !== VENDOR_EVAL_STATUS.PENDING).length;
    const qualified = vendors.filter((v) => v.evalStatus === VENDOR_EVAL_STATUS.QUALIFIED).length;
    const notQualified = vendors.filter((v) => v.evalStatus === VENDOR_EVAL_STATUS.NOT_QUALIFIED).length;
    const pending = vendors.filter((v) => v.evalStatus === VENDOR_EVAL_STATUS.PENDING).length;
    const bestVendor = vendors.length > 0
      ? vendors.reduce((best, v) => (v.technicalTotal > (best?.technicalTotal || 0) ? v : best), null)
      : null;
    return { total: vendors.length, evaluated, qualified, notQualified, pending, bestVendor };
  }, [item, vendorRows]);

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !item) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <FileSearch className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">RFQ not available for technical evaluation</p>
          <p className="text-xs text-slate-400 mt-1">It may have been awarded, closed, or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/technical-evaluation')}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to Technical Evaluation
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const completed = Boolean(item.steps?.technical);
  const locked = false; /* Cost Estimation removed — no lock gates remain */
  const allDecided = summaryStats.qualified + summaryStats.notQualified === summaryStats.total && summaryStats.total > 0;
  const bestQualified = summaryStats.bestVendor && summaryStats.bestVendor.technicalTotal >= QUALIFICATION_THRESHOLD;
  /* The Proceed button is driven by per-vendor decision state, not the
     RFQ-level record.technical flag — users may have decided every vendor
     without explicitly completing the RFQ-level evaluation. */
  const canProceed = allDecided && summaryStats.qualified > 0;
  /* Approval readiness — the Approval Flow raises its note from the RFQ's
     supplier SELECTION, so completed per-vendor decisions alone are not
     enough. Eligible when a selection is stored, or when the same pair the
     NFA service derives it from exists (the highest-scoring qualified
     vendor has a received quotation). Same rule, same source of truth, so
     this page never promises a stage the Approval Flow would refuse. */
  const qualifiedWithQuote = [...(item.vendors || [])]
    .filter((v) => v.evalStatus === VENDOR_EVAL_STATUS.QUALIFIED)
    .sort((a, b) => (b.technicalTotal || 0) - (a.technicalTotal || 0))[0] || null;
  const selectionStored = Boolean(item.steps?.selection);
  const selectionDerivable = Boolean(qualifiedWithQuote?.quoteId);
  const approvalReady = selectionStored || selectionDerivable;

  return (
    <PurchasePageLayout>
      {/* ── HEADER ── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Technical Evaluation', to: '/purchase/rfq/technical-evaluation' },
          { label: item.rfqNo }
        ]}
        icon={SearchCheck}
        title="Technical Evaluation"
        subtitle={`${item.rfqNo} — ${item.title || 'Evaluate technical compliance of vendor quotations'}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/purchase/rfq/technical-evaluation')}
              className="btn btn-ghost btn-sm"
            >
              <ChevronLeft size={12} /> Back to List
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
      />

      {/* ── PROGRESS INDICATOR ── */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3">
        <EvalProgress evalDone={canProceed || completed} decisionDone={allDecided} />
      </div>

      {/* ── RFQ INFORMATION ── */}
      <RfqInfoCard item={item} />

      {/* ── EVALUATION SUMMARY ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Evaluation Summary</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-0 divide-x divide-slate-100">
          <div className="px-5 py-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Vendors</div>
            <div className="text-xl font-extrabold text-slate-800 mt-1">{summaryStats.total}</div>
          </div>
          <div className="px-5 py-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Evaluated</div>
            <div className="text-xl font-extrabold text-blue-600 mt-1">{summaryStats.evaluated}</div>
          </div>
          <div className="px-5 py-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Technically Qualified</div>
            <div className="text-xl font-extrabold text-emerald-600 mt-1">{summaryStats.qualified}</div>
          </div>
          <div className="px-5 py-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Not Qualified</div>
            <div className="text-xl font-extrabold text-rose-500 mt-1">{summaryStats.notQualified}</div>
          </div>
          <div className="px-5 py-4 text-center">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pending</div>
            <div className="text-xl font-extrabold text-amber-600 mt-1">{summaryStats.pending}</div>
          </div>
        </div>
      </div>

      {/* ── VENDOR EVALUATIONS ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Vendor Evaluation</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {allDecided
              ? 'All vendor evaluations complete. Review decisions below.'
              : 'Enter scores for each vendor, then record a technical decision.'}
          </p>
        </div>
        <div className="p-5 space-y-4">
          {sortedVendors.length === 0 ? (
            <div className="py-12 text-center">
              <FileSearch className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-xs font-bold text-slate-500">No vendor quotations available</p>
            </div>
          ) : (
            sortedVendors.map((row, index) => (
              <VendorEvalCard
                key={row.quoteId}
                row={row}
                rank={index + 1}
                currency={item.currency}
                isExpanded={expandedVendor === row.quoteId}
                onToggle={() => setExpandedVendor(expandedVendor === row.quoteId ? null : row.quoteId)}
                onSaveScores={handleSaveScores}
                onSaveDecision={handleSaveDecision}
                saving={saving}
              />
            ))
          )}
        </div>
      </div>

      {/* ── TECHNICAL DECISION (RFQ-level summary) ── */}
      {allDecided && (
        <div className={`rounded-xl border bg-white overflow-hidden ${
          bestQualified ? 'border-emerald-200' : 'border-rose-200'
        }`}>
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Technical Decision</h3>
          </div>
          <div className="px-5 py-5">
            {bestQualified ? (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-emerald-700">TECHNICALLY QUALIFIED VENDORS: {summaryStats.qualified}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {summaryStats.notQualified} vendor(s) not qualified. Only qualified vendors may proceed to Approval.
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <div className="text-sm font-bold text-rose-600">NO VENDOR MET THE TECHNICAL THRESHOLD</div>
                  <p className="text-xs text-slate-500 mt-1">None of the evaluated vendors meet the required technical threshold ({QUALIFICATION_THRESHOLD}/100).</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── QUALIFIED VENDORS LIST ── */}
      {allDecided && summaryStats.qualified > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">              <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Qualified Vendors — Eligible for Approval</h3>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-2">
              {sortedVendors
                .filter((v) => v.evalStatus === VENDOR_EVAL_STATUS.QUALIFIED)
                .map((v, i) => (
                  <div key={v.quoteId} className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${
                    i === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'
                  }`}>
                    <div className="flex items-center gap-2.5">
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold ${
                        i === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {i + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{v.vendor}</span>
                      <span className="text-[10px] font-bold text-emerald-600">✓ Qualified</span>
                    </div>
                    <span className="text-sm font-extrabold text-emerald-700">
                      {v.technicalTotal}/100
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── NOT QUALIFIED VENDORS LIST ── */}
      {allDecided && summaryStats.notQualified > 0 && (
        <div className="rounded-xl border border-rose-200 bg-white">
          <div className="px-5 py-3 border-b border-rose-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-rose-600">Not Qualified Vendors</h3>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-2">
              {sortedVendors
                .filter((v) => v.evalStatus === VENDOR_EVAL_STATUS.NOT_QUALIFIED)
                .map((v) => (
                  <div key={v.quoteId} className="flex items-center justify-between px-4 py-2.5 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xs font-bold text-slate-800">{v.vendor}</span>
                      <span className="text-[10px] font-bold text-rose-500">✕ Not Qualified</span>
                    </div>
                    <span className="text-sm font-extrabold text-rose-500">
                      {v.technicalTotal}/100
                    </span>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* ── NEXT STEP / PROCEED TO APPROVAL ── */}
      {!locked && (
        <div className={`rounded-xl border bg-white px-5 py-4 ${
          canProceed && approvalReady ? 'border-emerald-200' : 'border-slate-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">
                {canProceed && approvalReady ? 'Ready to Proceed' : 'Next Step'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {canProceed && approvalReady
                  ? 'All vendor evaluations are complete. Proceed to the Approval Flow for procurement approval.'
                  : canProceed && !approvalReady
                    ? 'All vendor decisions are recorded, but this RFQ has no completed supplier selection yet — the Approval Note is raised from that selection. Complete the Price Comparative Statement first.'
                    : summaryStats.pending > 0
                      ? `${summaryStats.pending} vendor(s) pending decisions. Complete all vendor decisions before proceeding.`
                      : summaryStats.qualified === 0 && allDecided
                        ? 'No qualified vendors. Consider re-evaluating or adjusting criteria.'
                        : 'Enter scores for each vendor, then record a technical decision.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/purchase/rfq/technical-evaluation')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Back to List
              </button>
              {canProceed && approvalReady && (
                <button
                  type="button"
                  onClick={handleProceedToApproval}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-6 py-2.5 rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  Proceed to Approval <ArrowRight className="w-4 h-4" />
                </button>
              )}
              {canProceed && !approvalReady && (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/rfq/price-comparative-statement/${item.rfqId}`)}
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-6 py-2.5 rounded-lg transition-colors cursor-pointer shadow-sm"
                >
                  Complete Supplier Selection <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </PurchasePageLayout>
  );
}
