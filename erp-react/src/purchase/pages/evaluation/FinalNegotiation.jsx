/**
 * purchase/pages/evaluation/FinalNegotiation.jsx
 * ------------------------------------------------------------------
 * Final Negotiation — negotiate with shortlisted vendors and record
 * final commercial terms before Price Comparative Statement.
 *
 * Workflow: Quotations → Final Negotiation → Price Comparative Statement
 * Route: /purchase/rfq/negotiation
 *
 * FIX: All comparisons use a LIKE-FOR-LIKE pre-tax basis.
 * Both original and negotiated values are computed using the same
 * calcDocumentTotals() path with the same discount/charges/tax so
 * there is never a GST-mixing bug. Savings can be zero, positive
 * (reduction) or negative (increase) — increases are never hidden.
 * ------------------------------------------------------------------
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, Clock3, AlertTriangle, FileText, History, Loader2,
  MessageSquare, RefreshCw, Save, Scale, Search, Send, Shield, TrendingDown,
  TrendingUp, ChevronRight, Star
} from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RfqTabNav from '../../components/RfqTabNav';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { calcDocumentTotals, formatAmount, round2 } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

/** Compact info chip used in the RFQ info strip. */
function InfoChip({ label, value, color }) {
  return (
    <div className="flex flex-col">
      <span className={LABEL}>{label}</span>
      <span className={`text-xs font-semibold mt-0.5 truncate ${color || 'text-slate-800'}`} title={String(value || '')}>
        {value || '—'}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * NegotiationHistoryRow — renders a single saved negotiation round
 * with visual timeline dot and progression indicator.
 * ───────────────────────────────────────────────────────────────── */
const NegotiationHistoryRow = memo(function NegotiationHistoryRow({ round, currency, isLast }) {
  const stageColor = {
    Agreed: 'bg-emerald-500',
    Rejected: 'bg-red-500',
    'In Progress': 'bg-amber-500',
    'Not Started': 'bg-slate-400',
  };
  const stageBadge = {
    Agreed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Rejected: 'bg-red-50 text-red-700 border-red-200',
    'In Progress': 'bg-amber-50 text-amber-700 border-amber-200',
    'Not Started': 'bg-slate-100 text-slate-500 border-slate-200',
  };

  const hasItemRates = round.itemRates && typeof round.itemRates === 'object' && Object.keys(round.itemRates).length > 0;

  return (
    <div className="flex gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
      {/* Timeline column */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-3 h-3 rounded-full ${stageColor[round.stage] || stageColor['Not Started']} ring-2 ring-white shadow-sm`} />
        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-1" />}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-bold text-slate-700">Round {round.round}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${stageBadge[round.stage] || stageBadge['Not Started']}`}>
            {round.stage === 'Agreed' && <CheckCircle2 className="w-2.5 h-2.5" />}
            {round.stage === 'Rejected' && <AlertTriangle className="w-2.5 h-2.5" />}
            {round.stage === 'In Progress' && <Clock3 className="w-2.5 h-2.5" />}
            {round.stage}
          </span>
          <span className="text-[10px] text-slate-300">·</span>
          <span className="text-[10px] text-slate-400">{round.actor || 'System'}</span>
          <span className="text-[10px] text-slate-300">·</span>
          <span className="text-[10px] text-slate-400">
            {round.timestamp ? new Date(round.timestamp).toLocaleString() : '—'}
          </span>
        </div>
        {round.note && (
          <p className="text-[11px] text-slate-600 mt-1.5 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">{round.note}</p>
        )}
        <div className="flex items-center gap-4 mt-1.5">
          {round.amount > 0 && (
            <span className="text-[11px] text-slate-500">
              Recorded value: <span className="font-bold text-slate-700 tabular-nums">{formatAmount(round.amount, currency)}</span>
            </span>
          )}
          {hasItemRates && (
            <span className="text-[10px] text-slate-400 inline-flex items-center gap-1">
              <FileText className="w-3 h-3" /> {Object.keys(round.itemRates).length} lines
            </span>
          )}
        </div>
      </div>
    </div>
  );
});

export default function FinalNegotiation() {
  const navigate = useNavigate();
  /* Saving a negotiation round is an evaluation write; completing it ends the
     negotiation. Both are gated by Final Negotiation · Evaluate (and by the
     RFQ parent on the server). */
  const { can } = usePurchaseAccess();
  const canEvaluateNegotiation = can('rfqNegotiation', 'evaluate');
  const toast = useToast();

  /* ─── RFQ list ─── */
  const [rfqs, setRfqs] = useState([]);
  const [selectedRfqId, setSelectedRfqId] = useState('');

  /* ─── Selected RFQ data ─── */
  const [rfqData, setRfqData] = useState(null);
  const [quotations, setQuotations] = useState([]);
  const [evaluationBoard, setEvaluationBoard] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  /* ─── Vendor / negotiation state ─── */
  const [selectedVendor, setSelectedVendor] = useState('');
  /** Item-level negotiated rates keyed by line index.
   *  CRITICAL: This is the SOURCE OF TRUTH for the UI inputs.
   *  It is ONLY reset by (a) selecting a new vendor/quotation
   *  and (b) the hydration useEffect finding saved rounds.
   *  A save operation MUST NOT overwrite these values. */
  const [negotiatedRates, setNegotiatedRates] = useState({});
  /** When true, the hydration useEffect will not overwrite
   *  negotiatedRates — prevents the save→reload flash. */
  const suppressHydrationRef = useRef(false);
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  /* ─── Confirmation modals ─── */
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showIncreaseConfirm, setShowIncreaseConfirm] = useState(false);

  /* ─── Load RFQs ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await rfqService.getRfqs({ page: 1, pageSize: 200 });
        if (cancelled) return;
        const eligible = (result.data || []).filter(
          (rfq) => (rfq.quotationReceived || 0) > 0
            || rfq.status === 'Quotation Received'
            || rfq.status === 'Evaluation'
        );
        setRfqs(eligible);
      } catch { /* empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedRfqId) return;
    let cancelled = false;
    (async () => {
      setLoadingDetail(true);
      try {
        const [rfqResult, compResult, boardResult] = await Promise.all([
          rfqService.getRfqs({ page: 1, pageSize: 100 }),
          rfqService.getQuotationComparison(selectedRfqId).catch(() => null),
          evaluationService.getEvaluationBoard().catch(() => null)
        ]);
        if (cancelled) return;
        /* The select's value is always a string while the API sends the
           numeric id — compare loosely or every RFQ reads "not found". */
        const rfq = (rfqResult.data || []).find((r) => String(r.id) === String(selectedRfqId));
        setRfqData(rfq || null);
        setQuotations(compResult?.quotes || []);
        const boardItem = (boardResult || []).find((item) => String(item.rfqId) === String(selectedRfqId));
        setEvaluationBoard(boardItem || null);
        const quotes = compResult?.quotes || [];
        if (quotes.length > 0) {
          setSelectedVendor((prev) => prev || quotes[0].vendor);
        }
      } catch {
        if (!cancelled) { setRfqData(null); setQuotations([]); setEvaluationBoard(null); }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRfqId, refreshKey]);

  /* ─── Derived data ─── */
  const selectedQuote = useMemo(
    () => quotations.find((q) => q.vendor === selectedVendor) || null,
    [quotations, selectedVendor]
  );

  /* ─── Vendor status map — per-vendor negotiation status for tabs ─── */
  const vendorStatusMap = useMemo(() => {
    const map = {};
    quotations.forEach((q) => {
      const vendorRounds = (evaluationBoard?.negotiations || []).filter((r) => r.vendor === q.vendor);
      const hasAgreed = vendorRounds.some((r) => r.stage === 'Agreed');
      const inProgress = vendorRounds.some((r) => r.stage === 'In Progress');
      const totalValue = (q.items || []).reduce((s, item) => s + (Number(item.amount) || Number(item.rate) * Number(item.qty) || 0), 0);
      map[q.vendor] = {
        vendor: q.vendor,
        status: hasAgreed ? 'Agreed' : inProgress ? 'In Progress' : 'Not Started',
        rounds: vendorRounds.length,
        totalValue,
        latestAmount: vendorRounds.length > 0 ? vendorRounds[vendorRounds.length - 1].amount : totalValue,
        quotationId: q.id,
      };
    });
    return map;
  }, [quotations, evaluationBoard]);

  /* Resolve vendorId and quotationId for the selected vendor. */
  const selectedVendorId = useMemo(() => {
    if (!selectedQuote) return null;
    const boardVendor = (evaluationBoard?.vendors || []).find((v) => v.vendor === selectedVendor);
    return boardVendor?.vendorId || selectedQuote.vendorId || null;
  }, [selectedQuote, selectedVendor, evaluationBoard]);
  /* Note: vendorId is resolved server-side in recordNegotiation when not
     provided by the client. This field is optional and informational. */

  const selectedQuotationId = useMemo(() => {
    if (!selectedQuote) return null;
    return selectedQuote.id || selectedQuote.quotationNo || null;
  }, [selectedQuote]);

  const negotiationRounds = useMemo(() => {
    if (!evaluationBoard || !selectedVendor) return [];
    return (evaluationBoard.negotiations || []).filter((r) => {
      if (r.vendor === selectedVendor) return true;
      if (selectedQuotationId && r.quotationId === selectedQuotationId) return true;
      return false;
    });
  }, [evaluationBoard, selectedVendor, selectedQuotationId]);

  const negotiationComplete = evaluationBoard?.steps?.negotiationAgreed || false;

  /* Tax rate from RFQ commercial terms (default 18%). */
  const taxRate = Number(rfqData?.commercialTerms?.taxRate) || 18;

  /* Quotation-level discount and charges — reused for both
   * original and negotiated totals to ensure like-for-like comparison. */
  const quoteDiscount = Number(selectedQuote?.discount) || 0;
  const quoteCharges = Number(selectedQuote?.freight || 0)
    + Number(selectedQuote?.insurance || 0)
    + Number(selectedQuote?.charges || 0);

  /* ─── Item-level calculation — SINGLE SOURCE OF TRUTH ───
   *
   * Every financial figure (line values, totals, savings, summary)
   * derives from this one memoized computation. Both original and
   * negotiated values use the SAME calculation path through
   * calcDocumentTotals() with the SAME discount/charges/taxRate.
   * ─────────────────────────────────────────────────────────── */
  const itemRows = useMemo(() => {
    if (!selectedQuote || !rfqData) return [];
    const rfqItems = rfqData.items || [];
    return rfqItems.map((rfqItem, index) => {
      const quoteItem = (selectedQuote.items || [])[index] || {};
      const originalRate = round2(Number(quoteItem.rate) || Number(rfqItem.rate) || 0);

      /* Use negotiated rate from state, falling back to original. */
      const inputRate = negotiatedRates[index];
      const negotiatedRate = inputRate !== undefined
        ? round2(Number(inputRate))
        : originalRate;

      const qty = Number(rfqItem.qty) || Number(quoteItem.qty) || 0;

      /* Build comparable items for calcDocumentTotals.
       * The original items use quote rates, negotiated use negotiated rates.
       * Both include the same gstRate from the RFQ commercial terms. */
      const commonItem = {
        product: rfqItem.product || quoteItem.product || `Item ${index + 1}`,
        hsn: rfqItem.hsn || quoteItem.hsn || '',
        uom: rfqItem.uom || quoteItem.uom || '—',
        qty,
        gstRate: taxRate,
      };

      const originalItems = [{ ...commonItem, rate: originalRate }];
      const negotiatedItems = [{ ...commonItem, rate: negotiatedRate }];

      /* Use calcDocumentTotals for both — same path, same rules. */
      const originalResult = calcDocumentTotals(originalItems, quoteDiscount, quoteCharges);
      const negotiatedResult = calcDocumentTotals(negotiatedItems, quoteDiscount, quoteCharges);

      const originalLineTotal = round2(originalResult.total);
      const negotiatedLineTotal = round2(negotiatedResult.total);
      const lineChange = round2(negotiatedLineTotal - originalLineTotal);
      const lineChangePct = originalLineTotal > 0
        ? round2((lineChange / originalLineTotal) * 100)
        : 0;

      /* Pre-GST line values for the item table display. */
      const originalLineSubtotal = round2(originalResult.taxable);
      const negotiatedLineSubtotal = round2(negotiatedResult.taxable);
      const lineGst = round2(negotiatedResult.gstTotal);
      const lineDiscount = round2(originalResult.discountAmount);

      const hasChange = inputRate !== undefined && Number(inputRate) !== originalRate;

      return {
        index,
        product: rfqItem.product || quoteItem.product || `Item ${index + 1}`,
        description: rfqItem.specification || '',
        uom: rfqItem.uom || quoteItem.uom || '—',
        qty,
        originalRate,
        negotiatedRate,
        originalLineSubtotal,
        negotiatedLineSubtotal,
        lineDiscount,
        lineGst,
        originalLineTotal,
        negotiatedLineTotal,
        lineChange,
        lineChangePct,
        hasChange,
      };
    });
  }, [selectedQuote, rfqData, negotiatedRates, taxRate, quoteDiscount, quoteCharges]);

  /* ─── Derived totals — SINGLE SOURCE OF TRUTH ───
   *
   * Both original and negotiated totals come from the same
   * calcDocumentTotals() path. Savings = original − negotiated.
   * Positive savings = reduction, negative = increase. No clamping.
   * ─────────────────────────────────────────────────────────── */
  const totals = useMemo(() => {
    const subtotal = round2(itemRows.reduce((s, r) => s + r.negotiatedLineSubtotal, 0));
    const originalSubtotal = round2(itemRows.reduce((s, r) => s + r.originalLineSubtotal, 0));
    const gstTotal = round2(itemRows.reduce((s, r) => s + r.lineGst, 0));

    /* Original comparable value = sum of original line totals from calcDocumentTotals. */
    const originalComparable = round2(itemRows.reduce((s, r) => s + r.originalLineTotal, 0));
    /* Negotiated comparable value = sum of negotiated line totals from calcDocumentTotals. */
    const negotiatedComparable = round2(itemRows.reduce((s, r) => s + r.negotiatedLineTotal, 0));

    /* Savings = positive when negotiated is lower, negative when higher. */
    const savings = round2(originalComparable - negotiatedComparable);
    const savingsPct = originalComparable > 0
      ? round2((savings / originalComparable) * 100)
      : 0;

    /* Final value = negotiated total (includes GST + charges from calcDocumentTotals). */
    const finalValue = negotiatedComparable;

    return {
      originalSubtotal,
      subtotal,
      gstTotal,
      originalComparable,
      negotiatedComparable,
      savings,
      savingsPct,
      finalValue,
    };
  }, [itemRows]);

  /* Whether the negotiation has resulted in a price increase. */
  const isPriceIncrease = totals.savings < 0;

  /* ─── Initialize negotiated rates when vendor changes or data loads ───
   *
   * Priority for populating the "Negotiated Rate" column:
   *   1. Latest saved negotiation itemRates (survives save/refresh/navigation)
   *   2. Existing quotation item rate
   *   3. RFQ item rate
   *
   * CRITICAL: Never overwrite a saved negotiation with quotation data.
   * When suppressHydrationRef is true (set after a successful save),
   * skip this effect to prevent the optimistic update from being
   * overwritten by a stale evaluation board snapshot.
   * ─────────────────────────────────────────────────────────── */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!selectedQuote || !rfqData) {
      setNegotiatedRates({});
      return;
    }
    /* During a refresh (evaluationBoard may be null transiently), do NOT
       reset negotiated rates — keep the current values until fresh data
       arrives. This prevents the save→reload cycle from flashing back to
       quotation rates. */
    if (!evaluationBoard && loadingDetail) return;

    /* After a successful save, the optimistic update already has the
       correct itemRates. Skip hydration to prevent overwriting. */
    if (suppressHydrationRef.current) {
      suppressHydrationRef.current = false;
      return;
    }

    /* Restore from the LATEST saved negotiation round that has itemRates.
     * Match by quotationId when available, fall back to vendor name.
     * This covers both Agreed AND In-Progress rounds — negotiated rates
     * must survive save, reload, navigation, and reopening. We find the
     * last round with itemRates (highest round number wins), regardless
     * of stage. */
    const latestRoundWithRates = [...negotiationRounds]
      .reverse()
      .find((r) => r.itemRates && typeof r.itemRates === 'object' && Object.keys(r.itemRates).length > 0);
    if (latestRoundWithRates) {
      setNegotiatedRates({ ...latestRoundWithRates.itemRates });
    } else {
      /* No saved rates exist — initialize with original quoted rates. */
      const rfqItems = rfqData.items || [];
      const rates = {};
      rfqItems.forEach((rfqItem, index) => {
        const quoteItem = (selectedQuote.items || [])[index] || {};
        rates[index] = round2(Number(quoteItem.rate) || Number(rfqItem.rate) || 0);
      });
      setNegotiatedRates(rates);
    }
  }, [selectedQuote, rfqData, evaluationBoard, negotiationRounds, loadingDetail, suppressHydrationRef]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* ─── Handle item rate change ─── */
  const handleRateChange = (index, value) => {
    setNegotiatedRates((prev) => ({
      ...prev,
      [index]: value === '' ? '' : value,
    }));
  };

  /* ─── Mark Complete — validation ─── */
  const validateBeforeComplete = useCallback(() => {
    if (!selectedRfqId) return 'Please select an RFQ.';
    if (!selectedVendor) return 'Please select a vendor.';
    if (!selectedQuote) return 'No quotation found for the selected vendor.';
    if (!itemRows || itemRows.length === 0) return 'No items found in the RFQ.';
    for (const row of itemRows) {
      if (row.qty <= 0) return `Quantity must be greater than zero for "${row.product}".`;
      if (!Number.isFinite(row.negotiatedRate) || row.negotiatedRate < 0) {
        return `Invalid negotiated price for "${row.product}".`;
      }
    }
    if (!Number.isFinite(totals.originalComparable)) return 'Original value calculation error.';
    if (!Number.isFinite(totals.negotiatedComparable)) return 'Negotiated value calculation error.';
    if (!Number.isFinite(totals.finalValue)) return 'Final value calculation error.';
    return null;
  }, [selectedRfqId, selectedVendor, selectedQuote, itemRows, totals]);

  /* ─── Actions ─── */
  const handleSaveRound = async (stage = 'In Progress') => {
    if (!selectedRfqId || !selectedVendor) return;
    setSaving(true);
    try {
      /* Record the comparable (pre-tax) negotiated value — same basis as the comparison.
         Pass quotationId and vendorId for multi-vendor identity. */
      await evaluationService.recordNegotiation(selectedRfqId, selectedVendor, {
        amount: totals.negotiatedComparable,
        stage,
        note: remark || (totals.savings > 0
          ? `Round saved — Savings: ${formatAmount(totals.savings, rfqData?.currency)}`
          : totals.savings < 0
            ? `Round saved — Increase: ${formatAmount(Math.abs(totals.savings), rfqData?.currency)}`
            : 'Round saved — No change'),
        itemRates: { ...negotiatedRates },
        quotationId: selectedQuotationId,
        vendorId: selectedVendorId,
      });
      /* Prevent the hydration useEffect from overwriting the rates we
         just saved. The optimistic update below provides the correct
         itemRates; the useEffect must not replace them with stale data. */
      suppressHydrationRef.current = true;
      /* Optimistically append the saved round to the local board state
         so the UI immediately reflects the saved rates WITHOUT waiting
         for a full data reload (which would transiently reset rates to
         quotation defaults). */
      const savedRound = {
        id: `neg-${Date.now()}`,
        vendor: selectedVendor,
        ...(selectedQuotationId ? { quotationId: selectedQuotationId } : {}),
        ...(selectedVendorId ? { vendorId: selectedVendorId } : {}),
        round: (negotiationRounds.length || 0) + 1,
        amount: totals.negotiatedComparable,
        stage,
        note: remark || '',
        actor: 'Buyer',
        timestamp: new Date().toISOString(),
        itemRates: { ...negotiatedRates },
      };
      setEvaluationBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          negotiations: [...(prev.negotiations || []), savedRound],
          vendors: (prev.vendors || []).map((v) =>
            v.vendor === selectedVendor
              ? { ...v, rounds: [...(v.rounds || []), savedRound] }
              : v
          ),
        };
      });
      toast.success(`Negotiation round saved for ${selectedVendor}`);
      setRemark('');
      /* Optional background refresh — do NOT await, and do NOT use
         refreshKey which would trigger a full data reload cycle. */
    } catch (err) {
      toast.error(err?.message || 'Failed to save negotiation');
    } finally {
      setSaving(false);
    }
  };

  /** Called when user confirms mark-complete (handles price increase check). */
  const doMarkComplete = useCallback(async () => {
    setShowCompleteConfirm(false);
    setShowIncreaseConfirm(false);
    if (!selectedRfqId || !selectedVendor) return;
    setCompleting(true);
    try {
      /* Record the comparable (pre-tax) negotiated value — same basis as the comparison.
         Pass quotationId and vendorId for multi-vendor identity. */
      await evaluationService.recordNegotiation(selectedRfqId, selectedVendor, {
        amount: totals.negotiatedComparable,
        stage: 'Agreed',
        note: remark || (totals.savings > 0
          ? `Negotiation completed — Final: ${formatAmount(totals.negotiatedComparable, rfqData?.currency)} (Savings: ${formatAmount(totals.savings, rfqData?.currency)})`
          : totals.savings < 0
            ? `Negotiation completed — Final: ${formatAmount(totals.negotiatedComparable, rfqData?.currency)} (Increase: ${formatAmount(Math.abs(totals.savings), rfqData?.currency)})`
            : `Negotiation completed — Final: ${formatAmount(totals.negotiatedComparable, rfqData?.currency)} (No change)`),
        itemRates: { ...negotiatedRates },
        quotationId: selectedQuotationId,
        vendorId: selectedVendorId,
      });
      suppressHydrationRef.current = true;
      /* Optimistically append the agreed round — same pattern as handleSaveRound. */
      const savedRound = {
        id: `neg-${Date.now()}`,
        vendor: selectedVendor,
        ...(selectedQuotationId ? { quotationId: selectedQuotationId } : {}),
        ...(selectedVendorId ? { vendorId: selectedVendorId } : {}),
        round: (negotiationRounds.length || 0) + 1,
        amount: totals.negotiatedComparable,
        stage: 'Agreed',
        note: remark || '',
        actor: 'Buyer',
        timestamp: new Date().toISOString(),
        itemRates: { ...negotiatedRates },
      };
      setEvaluationBoard((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          negotiations: [...(prev.negotiations || []), savedRound],
          vendors: (prev.vendors || []).map((v) =>
            v.vendor === selectedVendor
              ? { ...v, rounds: [...(v.rounds || []), savedRound] }
              : v
          ),
          steps: { ...prev.steps, negotiationAgreed: true },
        };
      });
      toast.success(`Negotiation completed for ${selectedVendor}`);
      setRemark('');
    } catch (err) {
      toast.error(err?.message || 'Failed to complete negotiation');
    } finally {
      setCompleting(false);
    }
  }, [selectedRfqId, selectedVendor, totals, remark, rfqData, negotiatedRates, negotiationRounds.length, selectedQuotationId, selectedVendorId, toast]);

  /** Trigger mark-complete with price increase check. */
  const handleMarkComplete = useCallback(() => {
    const error = validateBeforeComplete();
    if (error) {
      toast.error(error);
      return;
    }
    if (isPriceIncrease) {
      setShowIncreaseConfirm(true);
    } else {
      setShowCompleteConfirm(true);
    }
  }, [validateBeforeComplete, isPriceIncrease, toast]);

  const handleVendorChange = (vendor) => {
    setSelectedVendor(vendor);
    /* Do NOT eagerly clear negotiatedRates — the hydration useEffect
       handles initialization from saved rounds or quotation defaults.
       Clearing here causes a flash of empty/original rates. */
    setRemark('');
  };

  /* ─── PCS navigation — only when negotiation is agreed ─── */
  const handleProceedToPCS = useCallback(() => {
    if (!negotiationComplete) {
      toast.error('Complete the negotiation before proceeding to PCS.');
      return;
    }
    navigate(`/purchase/rfq/price-comparative-statement?rfq=${selectedRfqId}`);
  }, [negotiationComplete, navigate, selectedRfqId, toast]);

  /* ─── Memoized KPI strip data ─── */
  const kpiData = useMemo(() => {
    if (!rfqData) return null;
    return [
      { label: 'RFQ', value: rfqData.rfqNo, color: 'text-slate-800' },
      { label: 'Title', value: rfqData.title, color: 'text-slate-800' },
      { label: 'Date', value: formatDate(rfqData.createdAt), color: 'text-blue-700' },
      { label: 'Required', value: formatDate(rfqData.dueDate), color: 'text-amber-700' },
      { label: 'Vendors', value: String(new Set(quotations.map((q) => q.vendor)).size), color: 'text-violet-700' },
      { label: 'Quotes', value: String(quotations.length), color: 'text-teal-700' },
      { label: 'Status', value: negotiationComplete ? 'Agreed' : negotiationRounds.length > 0 ? 'In Progress' : 'Not Started', color: negotiationComplete ? 'text-emerald-700' : 'text-amber-700' },
    ];
  }, [rfqData, quotations, negotiationComplete, negotiationRounds.length]);

  /* ─── Memoized negotiation history ─── */
  const reversedRounds = useMemo(
    () => [...negotiationRounds].reverse(),
    [negotiationRounds]
  );

  return (
    <PurchasePageLayout>
      {/* ─── Header + Context ─── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Final Negotiation' }
        ]}
        icon={Scale}
        title="Final Negotiation"
        subtitle="Finalize commercial terms with shortlisted vendors"
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw size={12} /> Refresh
          </button>
        }
      />

      <RfqTabNav />

      {/* ─── RFQ Setup + Negotiation Status ─── */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5">
        <div className="flex items-center gap-4">
          {/* RFQ selector */}
          <div className="flex items-center gap-2">
            <Scale className="w-3.5 h-3.5 text-slate-400" />
            <span className={LABEL}>RFQ</span>
            <select
              value={selectedRfqId}
              onChange={(e) => { setSelectedRfqId(e.target.value); setSelectedVendor(''); setNegotiatedRates({}); }}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700 outline-none cursor-pointer focus:border-[#0B4A3D] transition-colors"
            >
              <option value="">{rfqs.length === 0 ? 'Loading...' : 'Select an RFQ'}</option>
              {rfqs.map((rfq) => (
                <option key={rfq.id} value={rfq.id}>{rfq.rfqNo} — {rfq.title}</option>
              ))}
            </select>
          </div>
          {/* Quote Status */}
          <div className="flex items-center gap-2">
            <span className={LABEL}>Quote Status</span>
            {selectedQuote ? (
              <PurchaseStatusBadge status={selectedQuote.status} />
            ) : (
              <span className="text-xs text-slate-400">—</span>
            )}
          </div>
          {/* Negotiation Status */}
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${negotiationComplete ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : negotiationRounds.length > 0 ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500 border border-slate-200'}`}>
              {negotiationComplete ? <CheckCircle2 className="w-3 h-3" /> : <Clock3 className="w-3 h-3" />}
              {negotiationComplete ? 'Negotiation Agreed' : negotiationRounds.length > 0 ? `${negotiationRounds.length} Round${negotiationRounds.length !== 1 ? 's' : ''} — In Progress` : 'Not Started'}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Vendor Tabs — one tab per quotation ─── */}
      {quotations.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5">
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Vendors Under Consideration</span>
            <span className="text-[10px] font-semibold text-slate-400">({quotations.length} vendor{quotations.length !== 1 ? 's' : ''})</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quotations.map((q) => {
              const vs = vendorStatusMap[q.vendor] || {};
              const isActive = q.vendor === selectedVendor;
              const statusColor = {
                'Agreed': 'bg-emerald-100 text-emerald-700 border-emerald-200',
                'In Progress': 'bg-amber-100 text-amber-700 border-amber-200',
                'Not Started': 'bg-slate-100 text-slate-500 border-slate-200',
              };
              return (
                <button
                  key={q.vendor}
                  type="button"
                  onClick={() => handleVendorChange(q.vendor)}
                  className={`flex-shrink-0 flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer ${
                    isActive
                      ? 'border-[#0B4A3D] bg-[#EDF7F4] shadow-sm'
                      : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  {/* Vendor Initials */}
                  <div className={`flex items-center justify-center w-9 h-9 rounded-lg text-xs font-bold ${
                    isActive ? 'bg-[#0B4A3D] text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    {(q.vendor || 'V').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold truncate ${isActive ? 'text-[#0B4A3D]' : 'text-slate-700'}`}>{q.vendor}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${statusColor[vs.status] || statusColor['Not Started']}`}>
                        {vs.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-slate-400 tabular-nums">{formatAmount(vs.latestAmount, rfqData?.currency)}</span>
                      {vs.rounds > 0 && (
                        <span className="text-[10px] text-slate-400">· {vs.rounds} round{vs.rounds !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-[#0B4A3D] ml-1" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── RFQ Summary Strip ─── */}
      {rfqData && (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-3">
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-7 gap-x-4 gap-y-2">
            {kpiData.map((item) => (
              <InfoChip key={item.label} label={item.label} value={item.value} color={item.color} />
            ))}
          </div>
        </div>
      )}

      {/* ─── Loading / Empty States ─── */}
      {loadingDetail && (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading quotation data...
        </div>
      )}

      {!loadingDetail && selectedRfqId && !rfqData && (
        <div className="text-center py-12 text-slate-400">
          <Search className="w-7 h-7 mx-auto mb-2 opacity-40" />
          <p className="text-sm font-semibold">RFQ not found</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          NEGOTIATION WORKSPACE — primary content
          ══════════════════════════════════════════════════════════════ */}
      {!loadingDetail && selectedQuote && rfqData && (
        <>
          {/* ─── Item Table ─── */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Table header with inline actions */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Negotiation Workspace</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Edit negotiated rates per line · Tax: <span className="font-bold text-slate-600">{taxRate}%</span> ·
                  {quoteDiscount > 0 && <>{' '}Discount: <span className="font-bold text-slate-600">{quoteDiscount}%</span> ·</>}
                  {' '}Comparisons use the same document calculation rules
                </p>
              </div>
              {!negotiationComplete && canEvaluateNegotiation && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleSaveRound('In Progress')}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveRound('In Progress')}
                    disabled={saving}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" /> Submit Round
                  </button>
                  <button
                    type="button"
                    onClick={handleMarkComplete}
                    disabled={completing}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {completing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                    Mark Complete
                  </button>
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-500 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-4 py-2.5 sticky left-0 bg-slate-50/80 z-10 w-[180px]">Item</th>
                    <th className="px-4 py-2.5 w-[150px]">Description</th>
                    <th className="px-4 py-2.5 text-center w-[70px]">Qty</th>
                    <th className="px-4 py-2.5 text-right w-[100px]">Original Rate</th>
                    <th className="px-4 py-2.5 text-right w-[120px]">Negotiated Rate</th>
                    <th className="px-4 py-2.5 text-right w-[100px]">Original Value</th>
                    <th className="px-4 py-2.5 text-right w-[100px]">Negotiated Value</th>
                    <th className="px-4 py-2.5 text-right w-[110px]">Savings / Change</th>
                    <th className="px-4 py-2.5 text-right w-[90px]">Tax</th>
                    <th className="px-4 py-2.5 text-right w-[110px]">Final Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemRows.map((row) => (
                    <tr key={row.index} className={`transition-colors ${row.hasChange ? (row.lineChange >= 0 ? 'bg-red-50/20' : 'bg-amber-50/30') : 'hover:bg-slate-50/50'}`}>
                      <td className="px-4 py-3 font-semibold text-slate-800 sticky left-0 bg-white z-10">
                        <div className="min-w-[140px]">
                          <span className="text-[11px]">{row.product}</span>
                          {row.uom !== '—' && <span className="text-[10px] text-slate-400 ml-1">({row.uom})</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-500 text-[11px] max-w-[140px] truncate" title={row.description}>
                        {row.description || '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-slate-700 font-medium">
                        {row.qty}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-400 font-medium">
                        {formatAmount(row.originalRate, rfqData.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {negotiationComplete ? (
                          <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${row.hasChange ? (row.lineChange < 0 ? 'text-emerald-700' : 'text-red-700') : 'text-slate-800'}`}>
                            {row.hasChange && (row.lineChange < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />)}
                            {formatAmount(row.negotiatedRate, rfqData.currency)}
                          </span>
                        ) : (
                          <input
                            type="number"
                            value={negotiatedRates[row.index] ?? ''}
                            placeholder={String(row.originalRate)}
                            onChange={(e) => handleRateChange(row.index, e.target.value)}
                            className={`w-[110px] border rounded-md px-2.5 py-1.5 text-[11px] text-right tabular-nums outline-none focus:ring-1 transition-all ${
                              row.hasChange
                                ? row.lineChange < 0
                                  ? 'border-amber-300 bg-amber-50/60 font-bold text-amber-800 focus:border-amber-400 focus:ring-amber-100'
                                  : row.lineChange > 0
                                    ? 'border-red-300 bg-red-50/60 font-bold text-red-800 focus:border-red-400 focus:ring-red-100'
                                    : 'border-slate-200 bg-white text-slate-800 focus:border-blue-400 focus:ring-blue-100 hover:border-slate-300'
                                : 'border-slate-200 bg-white text-slate-800 focus:border-blue-400 focus:ring-blue-100 hover:border-slate-300'
                            }`}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {formatAmount(row.originalLineSubtotal, rfqData.currency)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-700 font-medium">
                        {formatAmount(row.negotiatedLineSubtotal, rfqData.currency)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.hasChange ? (
                          row.lineChange < 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                                <TrendingDown className="w-2.5 h-2.5" /> {formatAmount(Math.abs(row.lineChange), rfqData.currency)}
                              </span>
                              <span className="text-[10px] text-emerald-600">{Math.abs(row.lineChangePct)}% reduction</span>
                            </div>
                          ) : row.lineChange > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-red-700">
                                <TrendingUp className="w-2.5 h-2.5" /> {formatAmount(row.lineChange, rfqData.currency)}
                              </span>
                              <span className="text-[10px] text-red-600">{row.lineChangePct}% increase</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-semibold text-slate-500">No Change</span>
                          )
                        ) : (
                          <span className="text-[10px] font-semibold text-slate-400">No Change</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                        {formatAmount(row.lineGst, rfqData.currency)}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-800 tabular-nums">
                        {formatAmount(row.negotiatedLineTotal, rfqData.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {/* ─── Table Footer: Totals ─── */}
                <tfoot>
                  <tr className="bg-slate-50/60 border-t border-slate-200">
                    <td colSpan={5} className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Totals</span>
                        {totals.savings > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <TrendingDown className="w-3 h-3" /> Save {formatAmount(totals.savings, rfqData.currency)} ({totals.savingsPct}%)
                          </span>
                        )}
                        {totals.savings < 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                            <TrendingUp className="w-3 h-3" /> +{formatAmount(Math.abs(totals.savings), rfqData.currency)} ({Math.abs(totals.savingsPct)}% increase)
                          </span>
                        )}
                        {totals.savings === 0 && (
                          <span className="text-[10px] font-semibold text-slate-400">No change</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-600 tabular-nums">
                      {formatAmount(totals.originalSubtotal, rfqData.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-slate-700 tabular-nums">
                      {formatAmount(totals.subtotal, rfqData.currency)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums" />
                    <td className="px-4 py-3 text-right font-bold text-slate-600 tabular-nums">
                      {formatAmount(totals.gstTotal, rfqData.currency)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-extrabold tabular-nums ${isPriceIncrease ? 'text-red-700' : 'text-emerald-700'}`}>
                        {formatAmount(totals.finalValue, rfqData.currency)}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ─── Financial Summary ─── */}
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Negotiation Summary</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                <div className={LABEL}>Original Value</div>
                <div className="text-sm font-bold text-slate-700 mt-1 tabular-nums">{formatAmount(totals.originalComparable, rfqData?.currency)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Before Tax</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                <div className={LABEL}>Negotiated Value</div>
                <div className="text-sm font-bold text-slate-800 mt-1 tabular-nums">{formatAmount(totals.negotiatedComparable, rfqData?.currency)}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Before Tax</div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                <div className={LABEL}>{isPriceIncrease ? 'Price Increase' : 'Savings'}</div>
                <div className={`text-sm font-bold mt-1 tabular-nums ${totals.savings > 0 ? 'text-emerald-700' : totals.savings < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                  {totals.savings > 0 ? formatAmount(totals.savings, rfqData?.currency)
                    : totals.savings < 0 ? formatAmount(Math.abs(totals.savings), rfqData?.currency)
                    : '₹0.00'}
                </div>
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2.5">
                <div className={LABEL}>{isPriceIncrease ? 'Increase %' : 'Savings %'}</div>
                <div className="text-sm font-bold mt-1">
                  {totals.savings > 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-700">
                      <TrendingDown className="w-3 h-3" /> {totals.savingsPct}%
                    </span>
                  ) : totals.savings < 0 ? (
                    <span className="inline-flex items-center gap-0.5 text-red-700">
                      <TrendingUp className="w-3 h-3" /> {Math.abs(totals.savingsPct)}%
                    </span>
                  ) : (
                    <span className="text-slate-500">0.00%</span>
                  )}
                </div>
                {/* Savings progress bar */}
                <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${isPriceIncrease ? 'bg-red-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(Math.abs(totals.savingsPct), 100)}%` }}
                  />
                </div>
              </div>
              <div className={`rounded-lg border px-3 py-2.5 ${isPriceIncrease ? 'bg-gradient-to-br from-red-50 to-red-100/50 border-red-200' : 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 border-emerald-200'}`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${isPriceIncrease ? 'text-red-600' : 'text-emerald-600'}`}>Final Value (Incl. Tax)</div>
                <div className={`text-base font-extrabold mt-1 tabular-nums ${isPriceIncrease ? 'text-red-700' : 'text-emerald-700'}`}>{formatAmount(totals.finalValue, rfqData?.currency)}</div>
              </div>
            </div>
          </div>

          {/* ─── Remarks + Commercial Terms ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2 mb-2.5">
                <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Remarks</span>
              </div>
              {!negotiationComplete ? (
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Negotiation notes — e.g. vendor agreed to reduction on bulk order…"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 transition-colors"
                />
              ) : (
                <p className="text-xs text-slate-500 italic">Negotiation completed — no further remarks needed.</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Commercial Terms</span>
              </div>
              <div className="space-y-2.5">
                {[
                  { label: 'Delivery', value: selectedQuote?.delivery ? `${selectedQuote.delivery} days` : '—' },
                  { label: 'Payment', value: selectedQuote?.paymentTerms || '—' },
                  { label: 'Warranty', value: selectedQuote?.warranty || '—' },
                ].map((t) => (
                  <div key={t.label} className="flex items-center justify-between">
                    <span className={LABEL}>{t.label}</span>
                    <span className="text-xs font-semibold text-slate-700">{t.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Bottom Action Bar ─── */}
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {negotiationComplete ? (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Negotiation agreed — ready for Price Comparative Statement
                  </span>
                ) : (
                  <span>Save your progress or mark negotiation complete to proceed.</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!negotiationComplete && (
                  <button
                    type="button"
                    onClick={handleMarkComplete}
                    disabled={completing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    {completing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                    Mark Negotiation Complete
                  </button>
                )}
                <button
                type="button"
                onClick={handleProceedToPCS}
                style={{
                  backgroundColor: '#075E54',
                  borderColor: '#075E54',
                  color: '#FFFFFF',
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <Scale className="w-3.5 h-3.5" />
                  Proceed to PCS
                  <ArrowRight className="w-3.5 h-3.5" />
                  </button>
              </div>
            </div>
          </div>

          {/* ─── Negotiation History ─── */}
          {reversedRounds.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Negotiation History</span>
                  <span className="text-[10px] font-semibold text-slate-400">({negotiationRounds.length} round{negotiationRounds.length !== 1 ? 's' : ''})</span>
                </div>
              </div>
              <div>
                {reversedRounds.map((round, idx) => (
                  <NegotiationHistoryRow
                    key={round.id || idx}
                    round={round}
                    currency={rfqData?.currency}
                    isLast={idx === reversedRounds.length - 1}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Empty state ─── */}
      {!selectedRfqId && (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 mb-3">
            <Scale className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm font-semibold text-slate-600">Select an RFQ to begin negotiation</p>
          <p className="text-xs text-slate-400 mt-1">Choose an RFQ with received quotations from the setup panel above</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          CONFIRMATION MODALS
          ══════════════════════════════════════════════════════════════ */}

      {/* ─── Price Increase Confirmation ─── */}
      {showIncreaseConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 border border-red-200">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Price Increase Detected</h3>
                <p className="text-[11px] text-slate-500">The negotiated value is higher than the original quotation.</p>
              </div>
            </div>
            <div className="bg-red-50/50 border border-red-100 rounded-lg p-3 mb-4 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Original Value:</span>
                <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totals.originalComparable, rfqData?.currency)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-600">Negotiated Value:</span>
                <span className="font-bold text-red-700 tabular-nums">{formatAmount(totals.negotiatedComparable, rfqData?.currency)}</span>
              </div>
              <div className="border-t border-red-100 pt-1.5 flex justify-between text-xs">
                <span className="text-red-600 font-semibold">Increase:</span>
                <span className="font-bold text-red-700 tabular-nums">
                  {formatAmount(Math.abs(totals.savings), rfqData?.currency)} ({Math.abs(totals.savingsPct)}%)
                </span>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Do you want to continue?</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setShowIncreaseConfirm(false); }}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doMarkComplete}
                className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-lg transition-colors shadow-sm"
              >
                Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mark Complete Confirmation ─── */}
      {showCompleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Confirm Negotiation Complete</h3>
                <p className="text-[11px] text-slate-500">Review the final negotiation details before confirming.</p>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">RFQ:</span>
                <span className="font-bold text-slate-800">{rfqData?.rfqNo || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Vendor:</span>
                <span className="font-bold text-slate-800">{selectedVendor}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2" />
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Original Quoted Value:</span>
                <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totals.originalComparable, rfqData?.currency)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Negotiated Value:</span>
                <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totals.negotiatedComparable, rfqData?.currency)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{isPriceIncrease ? 'Price Increase:' : 'Savings:'}</span>
                <span className={`font-bold tabular-nums ${isPriceIncrease ? 'text-red-700' : 'text-emerald-700'}`}>
                  {totals.savings !== 0 ? formatAmount(Math.abs(totals.savings), rfqData?.currency) : '₹0.00'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">{isPriceIncrease ? 'Increase %:' : 'Savings %:'}</span>
                <span className={`font-bold tabular-nums ${isPriceIncrease ? 'text-red-700' : 'text-emerald-700'}`}>
                  {Math.abs(totals.savingsPct)}%
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Tax ({taxRate}%):</span>
                <span className="font-bold text-slate-700 tabular-nums">{formatAmount(totals.gstTotal, rfqData?.currency)}</span>
              </div>
              <div className="border-t border-slate-200 pt-2 mt-2" />
              <div className="flex justify-between text-xs">
                <span className="text-slate-600 font-semibold">Final Payable Value:</span>
                <span className={`font-extrabold tabular-nums ${isPriceIncrease ? 'text-red-700' : 'text-emerald-700'}`}>
                  {formatAmount(totals.finalValue, rfqData?.currency)}
                </span>
              </div>
            </div>

            {/* Commercial Terms */}
            <div className="bg-slate-50 border border-slate-100 rounded-lg p-4 mb-4 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Delivery:</span>
                <span className="font-semibold text-slate-700">{selectedQuote?.delivery ? `${selectedQuote.delivery} days` : '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Payment:</span>
                <span className="font-semibold text-slate-700">{selectedQuote?.paymentTerms || '—'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Warranty:</span>
                <span className="font-semibold text-slate-700">{selectedQuote?.warranty || '—'}</span>
              </div>
            </div>

            {remark && (
              <div className="bg-slate-50 border border-slate-100 rounded-lg p-3 mb-4">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Remarks</span>
                <p className="text-xs text-slate-600 mt-1">{remark}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCompleteConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doMarkComplete}
                disabled={completing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 rounded-lg transition-colors shadow-sm disabled:opacity-50"
              >
                {completing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Confirm & Complete
              </button>
            </div>
          </div>
        </div>
      )}
    </PurchasePageLayout>
  );
}
