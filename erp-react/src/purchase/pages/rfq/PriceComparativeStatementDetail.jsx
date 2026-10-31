/**
 * purchase/pages/rfq/PriceComparativeStatementDetail.jsx
 * ------------------------------------------------------------------
 * PCS Details / Overview — redesigned with a decision-first layout:
 * Purchase Decision Summary → Recommendation Panel → Vendor Comparison
 * → Item-wise Quotation Comparison → Decision Insights → Approval Bar.
 *
 * Route: /purchase/rfq/price-comparative-statement/:rfqId
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, BarChart3, Check, CheckCircle2,
  FileSpreadsheet, Loader2, Printer, RefreshCw, Scale, Trophy
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { useToast } from '../../components/ui';
import { rfqService } from '../../services/rfq';
import { evaluationService, itemKeyOf } from '../../services/evaluation';
import { nfaService } from '../../services/nfa';
import { APPROVAL_STATUS, QUOTATION_STATUS, NFA_APPROVAL_STAGES } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';

import '../../styles/cpr-list.css';
import '../../styles/pcs.css';

/* Quotations eligible for comparison — pending placeholders, rejected
 * and withdrawn quotes are excluded. */
const VALID_QUOTE_STATUSES = [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED];

/* ─── Sub-components ─── */

function PcsLoading() {
  return (
    <div className="flex items-center justify-center py-16 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-xs font-semibold">Loading PCS comparison…</span>
    </div>
  );
}

function PcsError({ error, onBack }) {
  return (
    <div className="pcs-empty-state">
      <Scale className="w-8 h-8 text-slate-300 mx-auto mb-2" />
      <p className="text-xs font-bold text-slate-500">Unable to load PCS data</p>
      <p className="text-[11px] text-slate-400 mt-1">{error?.message || 'Please try again.'}</p>
      <button type="button" onClick={onBack} className="btn btn-ghost btn-sm mt-3">
        <ArrowLeft size={12} /> Back to PCS List
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function PriceComparativeStatementDetail() {
  const navigate = useNavigate();
  const { rfqId } = useParams();
  const toast = useToast();
  const selectAllRef = useRef(null);

  /* ─── State ─── */
  const [comparison, setComparison] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [allocations, setAllocations] = useState({});
  const [allocationBusy, setAllocationBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  /* ─── Load comparison + evaluation data ─── */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setError(null);
      setLoading(true);
      try {
        const [data, evalData] = await Promise.all([
          rfqService.getQuotationComparison(rfqId),
          evaluationService.getEvaluation(rfqId).catch(() => null),
        ]);
        if (cancelled) return;
        setComparison(data);
        setEvaluation(evalData);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [rfqId, refreshKey]);

  /* ─── Derived data ─── */
  const rfqItems = useMemo(() => comparison?.rfq?.items || [], [comparison]);

  const validQuotes = useMemo(
    () => (comparison?.quotes || []).filter((q) => VALID_QUOTE_STATUSES.includes(q.status)),
    [comparison]
  );

  const rfq = comparison?.rfq;

  /* Per-item matrix: every valid quote against every RFQ line. */
  const itemMatrix = useMemo(() => {
    if (!comparison) return [];
    return rfqItems.map((item, index) => {
      const key = itemKeyOf(comparison.rfq.id, index);
      const rows = validQuotes.map((quote) => {
        const line = quote.items?.[index] || null;
        const unitPrice = line ? Number(line.rate) : NaN;
        const quoted = Boolean(line) && Number.isFinite(unitPrice) && unitPrice > 0;
        const qty = quoted ? Number(item.qty ?? line.qty) || 0 : 0;
        return {
          quoteId: quote.id,
          vendor: quote.vendor,
          currency: quote.currency,
          unitPrice: quoted ? Math.round(unitPrice * 100) / 100 : null,
          qty,
          lineTotal: quoted ? Math.round(unitPrice * qty * 100) / 100 : null,
          quoted,
        };
      });
      const quotedRows = rows.filter((r) => r.quoted);
      const lowest = quotedRows.length
        ? quotedRows.reduce((best, r) => (r.unitPrice < best.unitPrice ? r : best))
        : null;
      const highest = quotedRows.length
        ? quotedRows.reduce((worst, r) => (r.unitPrice > worst.unitPrice ? r : worst))
        : null;
      const avgRate = quotedRows.length
        ? Math.round((quotedRows.reduce((sum, r) => sum + r.unitPrice, 0) / quotedRows.length) * 100) / 100
        : null;
      return { item, index, key, rows, lowest, highest, avgRate, quotedCount: quotedRows.length };
    });
  }, [comparison, rfqItems, validQuotes]);

  /* Default allocation = the lowest valid quote for every item. */
  const recommendedAllocations = useMemo(() => {
    const map = {};
    itemMatrix.forEach((entry) => {
      if (entry.lowest) {
        map[entry.key] = {
          itemKey: entry.key,
          product: entry.item.product || '',
          uom: entry.item.uom || '',
          qty: Number(entry.item.qty) || 0,
          vendor: entry.lowest.vendor,
          quoteId: entry.lowest.quoteId,
          unitPrice: entry.lowest.unitPrice,
          lineTotal: entry.lowest.lineTotal,
        };
      }
    });
    return map;
  }, [itemMatrix]);

  /* Stored selection → allocation map. */
  const storedAllocations = useMemo(() => {
    const selection = evaluation?.selection;
    if (!selection) return null;
    if (Array.isArray(selection.allocations) && selection.allocations.length > 0) {
      const map = {};
      selection.allocations.forEach((a) => { map[a.itemKey] = { ...a }; });
      return map;
    }
    const map = {};
    itemMatrix.forEach((entry) => {
      const row = entry.rows.find((c) => c.vendor === selection.selectedVendor);
      if (row) {
        map[entry.key] = {
          itemKey: entry.key,
          product: entry.item.product || '',
          uom: entry.item.uom || '',
          qty: Number(entry.item.qty) || 0,
          vendor: row.vendor,
          quoteId: row.quoteId,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal,
        };
      }
    });
    return Object.keys(map).length ? map : null;
  }, [evaluation, itemMatrix]);

  /* Initialise allocations from stored selection or recommended. */
  useEffect(() => {
    queueMicrotask(() => {
      setAllocations(storedAllocations || recommendedAllocations);
    });
  }, [rfqId, comparison?.rfq?.id, evaluation?.selection?.selectedAt, recommendedAllocations, storedAllocations]);

  const allocationList = Object.values(allocations).filter(Boolean);
  const supplierCount = new Set(allocationList.map((a) => a.vendor)).size;
  const selectedValue = Math.round(allocationList.reduce((sum, a) => sum + (a.lineTotal || 0), 0) * 100) / 100;
  const splitSelection = supplierCount > 1;

  const selectionApproved = evaluation?.approval?.status === APPROVAL_STATUS.APPROVED;
  const selectionLocked = selectionApproved || Boolean(comparison?.awarded);
  const technicalCompleted = Boolean(evaluation?.steps?.technical);
  /* The selection is only real once the service has STORED it — the
     allocation map above always holds the recommended allocation, which
     is a suggestion, not a decision. */
  const selectionStored = Boolean(evaluation?.selection);
  const negotiationAgreed = Boolean(evaluation?.steps?.negotiationAgreed);

  /**
   * Persists the item-wise allocation and REPORTS the outcome.
   *
   * The workflow gates (comparison → negotiation → selection) are owned by
   * the service, so a refusal must never be swallowed: advancing without a
   * stored selection is exactly what left an RFQ at "Ready to Proceed" in
   * the Technical Evaluation while the Approval Flow had no supplier
   * selection to raise its note from.
   */
  const saveAllocations = useCallback(async (map) => {
    const list = Object.values(map).filter(Boolean);
    if (list.length === 0 || list.length !== itemMatrix.length) {
      return { ok: false, reason: 'Select a vendor for every item before saving the selection.' };
    }
    setAllocationBusy(true);
    try {
      await evaluationService.completeItemWiseSelection(rfqId, { allocations: list });
      /* Re-read so the page reflects the STORED selection instead of only
         the recommended allocation rendered above. */
      setRefreshKey((key) => key + 1);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: err?.message || 'Failed to save the supplier selection.' };
    } finally {
      setAllocationBusy(false);
    }
  }, [rfqId, itemMatrix.length]);

  /* Persist + surface the service's reason when the gate refuses. */
  const persistSelection = useCallback(async (map) => {
    const result = await saveAllocations(map);
    if (!result.ok) toast.error(result.reason);
    return result.ok;
  }, [saveAllocations, toast]);

  const handleSelectVendor = useCallback(async (itemKey, vendor) => {
    if (!rfqId || selectionLocked || allocationBusy) return;
    const entry = itemMatrix.find((c) => c.key === itemKey);
    const row = entry?.rows.find((c) => c.vendor === vendor);
    if (!entry || !row) return;
    const next = {
      ...allocations,
      [itemKey]: {
        itemKey,
        product: entry.item.product || '',
        uom: entry.item.uom || '',
        qty: Number(entry.item.qty) || 0,
        vendor: row.vendor,
        quoteId: row.quoteId,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
      },
    };
    setAllocations(next);
    await persistSelection(next);
  }, [rfqId, selectionLocked, allocationBusy, itemMatrix, allocations, persistSelection]);

  const handleSelectAllForVendor = useCallback(async (vendor) => {
    if (!rfqId || selectionLocked || allocationBusy) return;
    const map = {};
    let allQuoted = true;
    itemMatrix.forEach((entry) => {
      const row = entry.rows.find((c) => c.vendor === vendor && c.quoted);
      if (row) {
        map[entry.key] = {
          itemKey: entry.key,
          product: entry.item.product || '',
          uom: entry.item.uom || '',
          qty: Number(entry.item.qty) || 0,
          vendor: row.vendor,
          quoteId: row.quoteId,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal,
        };
      } else {
        allQuoted = false;
      }
    });
    if (!allQuoted || Object.keys(map).length !== itemMatrix.length) return;
    setAllocations(map);
    await persistSelection(map);
  }, [rfqId, selectionLocked, allocationBusy, itemMatrix, persistSelection]);

  const resetToRecommended = useCallback(async () => {
    if (selectionLocked || allocationBusy) return;
    setAllocations(recommendedAllocations);
    await persistSelection(recommendedAllocations);
  }, [selectionLocked, allocationBusy, recommendedAllocations, persistSelection]);

  /* ─── Navigate to next workflow step ─── */
  const handleContinue = useCallback(async () => {
    if (allocationList.length === 0) return;
    setSubmitting(true);
    try {
      /* The selection MUST be stored before advancing — the Approval Flow
         raises the note from it. A refused save (e.g. the Final
         Negotiation gate) stops the workflow here with the real reason
         instead of stranding the RFQ downstream. */
      const saved = await persistSelection(allocations);
      if (!saved) return;
      if (!technicalCompleted) {
        /* PCS completed → next step is Technical Evaluation */
        navigate(`/purchase/rfq/technical-evaluation/${rfqId}`);
      } else {
        /* Tech Eval completed → the Approval Flow for THIS RFQ (the note it
           already raised, or the pre-selected create page). */
        navigate(await nfaService.approvalFlowRouteFor(rfqId, rfq?.rfqNo));
      }
    } finally {
      setSubmitting(false);
    }
  }, [allocationList.length, allocations, navigate, rfqId, rfq?.rfqNo, technicalCompleted, persistSelection]);

  /* ─── Export ─── */
  const handleExport = useCallback(async () => {
    if (!comparison || itemMatrix.length === 0) return;

    const header = [
      'S.No', 'PR No', 'Material Code', 'Item Description', 'Qty', 'UoM',
      ...validQuotes.map((q, i) => `Q${i} - ${q.vendor} (Rate)`),
      ...validQuotes.map((q, i) => `Q${i} - ${q.vendor} (Total)`),
      'Lowest Rate Vendor',
    ];

    const body = itemMatrix.map((entry, idx) => {
      const row = [
        idx + 1,
        rfq?.reference || '—',
        entry.item.hsn || entry.item.materialCode || '—',
        entry.item.product || '',
        entry.item.qty || 0,
        entry.item.uom || '',
      ];
      entry.rows.forEach((r) => {
        row.push(r.unitPrice != null ? r.unitPrice : '—');
      });
      entry.rows.forEach((r) => {
        row.push(r.lineTotal != null ? r.lineTotal : '—');
      });
      row.push(entry.lowest?.vendor || '—');
      return row;
    });

    const sheet = [header, ...body];
    try {
      // SheetJS is ~420 kB and only needed for the Excel path. Loading it on
      // demand keeps it out of this route's eager chunk; a failed load falls
      // through to the CSV fallback in the catch below, exactly as before.
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet(sheet);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'PCS');
      XLSX.writeFile(wb, `pcs-${rfq?.rfqNo || 'comparison'}.xlsx`);
    } catch {
      const csv = sheet.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pcs-${rfq?.rfqNo || 'comparison'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }, [comparison, itemMatrix, validQuotes, rfq]);

  /* ─── Select All checkbox state ─── */
  const allSelected = useMemo(() => {
    if (itemMatrix.length === 0) return false;
    return itemMatrix.every((e) => {
      const a = allocations[e.key];
      return a && a.vendor;
    });
  }, [itemMatrix, allocations]);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = !allSelected && allocationList.length > 0;
    }
  }, [allSelected, allocationList.length]);

  /* ─── Derived KPI values for Decision Summary ─── */
  const quotedValue = useMemo(() => {
    if (!validQuotes.length) return 0;
    return Math.round(validQuotes.reduce((sum, q) => sum + (q.total || 0), 0) * 100) / 100;
  }, [validQuotes]);

  const maxQuotedValue = useMemo(() => {
    if (!validQuotes.length) return 0;
    return Math.max(...validQuotes.map((q) => q.total || 0));
  }, [validQuotes]);

  const savings = Math.max(0, maxQuotedValue - selectedValue);

  const avgDelivery = useMemo(() => {
    const withDelivery = validQuotes.filter((q) => {
      const d = Number(q.delivery);
      return Number.isFinite(d) && d > 0;
    });
    if (!withDelivery.length) return null;
    return Math.round(withDelivery.reduce((sum, q) => sum + Number(q.delivery), 0) / withDelivery.length);
  }, [validQuotes]);

  const awardType = splitSelection ? 'Split Award' : supplierCount === 1 ? 'Single Award' : '—';

  /* Vendor-level stats for the comparison table */
  const vendorStats = useMemo(() => {
    return validQuotes.map((quote, qIndex) => {
      const vendorItems = itemMatrix.filter((e) => e.rows.some((r) => r.quoteId === quote.id && r.quoted));
      const vendorTotal = itemMatrix.reduce((sum, e) => {
        const r = e.rows.find((c) => c.quoteId === quote.id && c.quoted);
        return sum + (r?.lineTotal || 0);
      }, 0);
      const allocatedCount = allocationList.filter((a) => a.vendor === quote.vendor).length;
      const allocatedTotal = allocationList.filter((a) => a.vendor === quote.vendor).reduce((sum, a) => sum + (a.lineTotal || 0), 0);
      const isSelected = allocatedCount > 0;
      return {
        quote,
        qIndex,
        vendorItems: vendorItems.length,
        vendorTotal,
        allocatedCount,
        allocatedTotal: Math.round(allocatedTotal * 100) / 100,
        isSelected,
        score: quote.score,
        delivery: quote.delivery,
      };
    });
  }, [validQuotes, itemMatrix, allocationList]);

  /* ═══════════════════════════════════════════════════════════════ */
  /*  Render                                                        */
  /* ═══════════════════════════════════════════════════════════════ */
  return (
    <PurchasePageLayout>
      {/* ─── Page Header ─── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Price Comparative Statement', to: '/purchase/rfq/price-comparative-statement' },
          { label: rfq ? `${rfq.rfqNo} — PCS Details` : 'PCS Details' }
        ]}
        icon={BarChart3}
        title="Price Comparative Statement"
        subtitle={rfq ? `${rfq.rfqNo} — ${rfq.title || 'PCS Details'}` : 'PCS Details'}
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate('/purchase/rfq/price-comparative-statement')}
            >
              <ArrowLeft size={12} /> Back to List
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => navigate(`/purchase/rfq/price-comparative-statement/${rfqId}/print`)}
            >
              <Printer size={12} /> Print
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleExport}
              disabled={!comparison || itemMatrix.length === 0}
            >
              <FileSpreadsheet size={12} /> Export
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
      />

      {/* ─── Loading ─── */}
      {loading && <PcsLoading />}

      {/* ─── Error ─── */}
      {!loading && error && (
        <PcsError error={error} onBack={() => navigate('/purchase/rfq/price-comparative-statement')} />
      )}

      {/* ─── No Quotes ─── */}
      {!loading && !error && comparison && validQuotes.length === 0 && (
        <div className="pcs-empty-state">
          <Scale className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs font-bold text-slate-500">No quotations received for this RFQ</p>
          <p className="text-[11px] text-slate-400 mt-1">Quotes will appear here once vendors respond.</p>
        </div>
      )}

      {/* ─── Main Content ─── */}
      {!loading && !error && comparison && validQuotes.length > 0 && (
        <div className="pcs-content">

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  1. RFQ Header Summary                                */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="pcs-table-card">
            <div className="pcs-rfq-summary-grid">
              <div className="pcs-rfq-summary-item">
                <span className="pcs-rfq-summary-label">RFQ Number</span>
                <span className="pcs-rfq-summary-value pcs-rfq-summary-primary">{rfq.rfqNo}</span>
              </div>
              <div className="pcs-rfq-summary-item">
                <span className="pcs-rfq-summary-label">PR Number</span>
                <span className="pcs-rfq-summary-value">{rfq.reference || '—'}</span>
              </div>
              <div className="pcs-rfq-summary-item">
                <span className="pcs-rfq-summary-label">RFQ Date</span>
                <span className="pcs-rfq-summary-value">{formatDate(rfq.createdAt) || '—'}</span>
              </div>
              <div className="pcs-rfq-summary-item">
                <span className="pcs-rfq-summary-label">Status</span>
                <PurchaseStatusBadge status={rfq.status} variant="cpr" />
              </div>
              {rfq.category && (
                <div className="pcs-rfq-summary-item">
                  <span className="pcs-rfq-summary-label">Category</span>
                  <span className="pcs-rfq-summary-value">{rfq.category}</span>
                </div>
              )}
              {rfq.department && (
                <div className="pcs-rfq-summary-item">
                  <span className="pcs-rfq-summary-label">Department</span>
                  <span className="pcs-rfq-summary-value">{rfq.department}</span>
                </div>
              )}
              {rfq.project && (
                <div className="pcs-rfq-summary-item">
                  <span className="pcs-rfq-summary-label">Project</span>
                  <span className="pcs-rfq-summary-value">{rfq.project}</span>
                </div>
              )}
              {rfq.description && (
                <div className="pcs-rfq-summary-item pcs-rfq-summary-full">
                  <span className="pcs-rfq-summary-label">Description</span>
                  <span className="pcs-rfq-summary-value">{rfq.description}</span>
                </div>
              )}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  2. Decision Summary — KPI Cards                       */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="pcs-table-card">
            <div className="pcs-section-header">
              <span className="pcs-section-title">Purchase Decision Summary</span>
            </div>
            <div className="pcs-decision-kpi-grid">
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">Quoted Value</span>
                <span className="pcs-decision-kpi-value">{formatAmount(quotedValue, rfq.currency)}</span>
                <span className="pcs-decision-kpi-sub">{validQuotes.length} quotation{validQuotes.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">Recommended Award</span>
                <span className="pcs-decision-kpi-value pcs-decision-kpi-primary">
                  {allocationList.length ? formatAmount(selectedValue, rfq.currency) : '—'}
                </span>
                <span className="pcs-decision-kpi-sub">{supplierCount} vendor{supplierCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">Savings</span>
                <span className={`pcs-decision-kpi-value ${savings > 0 ? 'pcs-decision-kpi-green' : ''}`}>
                  {allocationList.length ? formatAmount(savings, rfq.currency) : '—'}
                </span>
                <span className="pcs-decision-kpi-sub">
                  {allocationList.length && quotedValue > 0 ? `${Math.round((savings / quotedValue) * 1000) / 10}%` : '—'}
                </span>
              </div>
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">Suppliers Selected</span>
                <span className="pcs-decision-kpi-value">{allocationList.length ? String(supplierCount) : '—'}</span>
                <span className="pcs-decision-kpi-sub">of {validQuotes.length} quoted</span>
              </div>
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">Items</span>
                <span className="pcs-decision-kpi-value">{itemMatrix.length}</span>
                <span className="pcs-decision-kpi-sub">{allocationList.length} allocated</span>
              </div>
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">Award Type</span>
                <span className={`pcs-decision-kpi-value ${splitSelection ? 'pcs-decision-kpi-amber' : ''}`}>
                  {awardType}
                </span>
                <span className="pcs-decision-kpi-sub">
                  {splitSelection ? `${supplierCount} vendors` : 'single vendor'}
                </span>
              </div>
              <div className="pcs-decision-kpi">
                <span className="pcs-decision-kpi-label">ETD / Delivery</span>
                <span className="pcs-decision-kpi-value">
                  {avgDelivery != null ? `${avgDelivery} Days` : '—'}
                </span>
                <span className="pcs-decision-kpi-sub">average</span>
              </div>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  3. Recommendation Panel                               */}
          {/* ═══════════════════════════════════════════════════════ */}
          {allocationList.length > 0 && (
            <div className="pcs-table-card">
              <div className="pcs-section-header">
                <span className="pcs-section-title">Recommended Purchase Decision</span>
                {splitSelection && (
                  <span className="pcs-rec-split-badge">Split Award Recommended</span>
                )}
              </div>
              <div className="pcs-rec-panel">
                {(() => {
                  /* Group allocations by vendor */
                  const byVendor = {};
                  allocationList.forEach((a) => {
                    if (!byVendor[a.vendor]) byVendor[a.vendor] = [];
                    byVendor[a.vendor].push(a);
                  });
                  return Object.entries(byVendor).map(([vendor, items]) => {
                    const vendorTotal = items.reduce((sum, a) => sum + (a.lineTotal || 0), 0);
                    return (
                      <div key={vendor} className="pcs-rec-vendor-row">
                        <div className="pcs-rec-vendor-info">
                          <span className="pcs-rec-vendor-name">{vendor}</span>
                          <span className="pcs-rec-vendor-items">
                            {items.map((a) => a.product || a.itemKey).join(' · ')}
                          </span>
                        </div>
                        <div className="pcs-rec-vendor-value">
                          {formatAmount(Math.round(vendorTotal * 100) / 100, rfq.currency)}
                        </div>
                      </div>
                    );
                  });
                })()}
                <div className="pcs-rec-footer">
                  <span className="pcs-rec-footer-label">Recommended Value</span>
                  <span className="pcs-rec-footer-value">{formatAmount(selectedValue, rfq.currency)}</span>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  4. Vendor Comparison Table                            */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="pcs-table-card">
            <div className="pcs-section-header">
              <span className="pcs-section-title">Vendor Comparison</span>
            </div>
            <div className="pcs-table-scroll">
              <table className="pcs-table pcs-vendor-compare-table">
                <thead>
                  <tr>
                    <th className="pcs-th">Vendor</th>
                    <th className="pcs-th" style={{ textAlign: 'center' }}>Items Quoted</th>
                    <th className="pcs-th pcs-th-right">Quoted Value</th>
                    <th className="pcs-th pcs-th-right">Selected Value</th>
                    <th className="pcs-th pcs-th-right">Savings</th>
                    <th className="pcs-th" style={{ textAlign: 'center' }}>ETD</th>
                    <th className="pcs-th" style={{ textAlign: 'center' }}>Score</th>
                    <th className="pcs-th" style={{ textAlign: 'center' }}>Status</th>
                    {!selectionLocked && (
                      <th className="pcs-th" style={{ textAlign: 'center', minWidth: 100 }}>Action</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {vendorStats.map(({ quote, qIndex, vendorItems, vendorTotal, allocatedCount, allocatedTotal, isSelected, score, delivery }) => {
                    const isWinner = comparison?.winner && quote.id === comparison.winner.id;
                    return (
                      <tr key={quote.id} className={`pcs-comparison-row ${isSelected ? 'pcs-vendor-row-selected' : ''}`}>
                        <td className="pcs-td">
                          <div className="pcs-vendor-cell">
                            <span className="pcs-vendor-cell-q">Q{qIndex}</span>
                            <span className={`pcs-vendor-cell-name ${isSelected ? 'pcs-vendor-cell-name--selected' : ''}`}>
                              {quote.vendor}
                            </span>
                            {isWinner && (
                              <span className="pcs-vendor-cell-winner">
                                <Trophy className="w-2.5 h-2.5" /> Best
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="pcs-td" style={{ textAlign: 'center' }}>
                          {vendorItems}/{itemMatrix.length}
                        </td>
                        <td className="pcs-td pcs-td-right tabular-nums">
                          {formatAmount(vendorTotal, quote.currency)}
                        </td>
                        <td className="pcs-td pcs-td-right tabular-nums">
                          {isSelected ? (
                            <span className="pcs-vendor-selected-val">{formatAmount(allocatedTotal, rfq.currency)}</span>
                          ) : '—'}
                        </td>
                        <td className="pcs-td pcs-td-right tabular-nums">
                          {isSelected && vendorTotal > allocatedTotal
                            ? formatAmount(vendorTotal - allocatedTotal, rfq.currency)
                            : '—'}
                        </td>
                        <td className="pcs-td" style={{ textAlign: 'center' }}>
                          {delivery ? (String(delivery).toLowerCase().includes('day') ? String(delivery) : `${delivery} Days`) : '—'}
                        </td>
                        <td className="pcs-td" style={{ textAlign: 'center' }}>
                          {score != null ? `${score}/100` : '—'}
                        </td>
                        <td className="pcs-td" style={{ textAlign: 'center' }}>
                          {isSelected ? (
                            <span className="pcs-status-badge pcs-status-selected">
                              <Check className="w-2.5 h-2.5" /> Selected
                            </span>
                          ) : (
                            <span className="pcs-status-badge pcs-status-quoted">Quoted</span>
                          )}
                        </td>
                        {!selectionLocked && (
                          <td className="pcs-td" style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleSelectAllForVendor(quote.vendor)}
                              disabled={allocationBusy || vendorItems !== itemMatrix.length}
                              className="btn btn-ghost btn-xs"
                            >
                              {allocatedCount === itemMatrix.length && allocationList.length > 0
                                ? <><CheckCircle2 size={11} /> Selected</>
                                : <>Select All</>
                              }
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!selectionLocked && itemMatrix.length > 0 && (
              <div className="pcs-vendor-compare-actions">
                <button type="button" onClick={resetToRecommended} disabled={allocationBusy} className="btn btn-ghost btn-sm">
                  Reset to Recommended
                </button>
                {evaluation?.selection && (
                  <span className="pcs-selection-saved-badge">
                    {allocationBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Selection saved
                  </span>
                )}
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  5. Item-wise Quotation Comparison Table                */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="pcs-table-card">
            <div className="pcs-table-header">
              <div className="pcs-table-header-left">
                <Scale className="pcs-table-header-icon" />
                <span className="pcs-table-header-title">Item-wise Quotation Comparison</span>
                <span className="pcs-badge pcs-badge-count">
                  {itemMatrix.length} item{itemMatrix.length !== 1 ? 's' : ''}
                </span>
                {allocationList.length > 0 && (
                  <span className="pcs-badge pcs-badge-selected">
                    {allocationList.length} allocated
                  </span>
                )}
              </div>
              {!selectionLocked && itemMatrix.length > 0 && (
                <label className="pcs-select-all-label">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (allSelected) {
                        /* Clear — handled implicitly by just deselecting */
                      }
                    }}
                    className="pcs-checkbox"
                    disabled
                  />
                  <span className="pcs-select-all-text">
                    Click cells to select vendors per item
                  </span>
                </label>
              )}
            </div>

            <div className="pcs-table-scroll pcs-comparison-scroll">
              <div className="pcs-scroll-fade" aria-hidden="true" />
              <table className="pcs-table pcs-comparison-table">
                <thead>
                  {/* Row 1: static columns (rowspan=2) + vendor name headers (colspan=2) */}
                  <tr>
                    <th className="pcs-th pcs-th-sticky-left" rowSpan={2} style={{ width: 42 }}>S.No</th>
                    <th className="pcs-th pcs-th-sticky-left" rowSpan={2} style={{ left: 42, width: 100 }}>PR No</th>
                    <th className="pcs-th pcs-th-sticky-left" rowSpan={2} style={{ left: 142, width: 90 }}>Material Code</th>
                    <th className="pcs-th pcs-th-sticky-left" rowSpan={2} style={{ left: 232, minWidth: 180 }}>Item Description</th>
                    <th className="pcs-th pcs-th-sticky-left pcs-th-right" rowSpan={2} style={{ left: 412, width: 60 }}>Qty</th>
                    {/* Dynamic quotation columns — vendor name spans 2 sub-cols */}
                    {validQuotes.map((quote, qIndex) => (
                      <th key={quote.id} className="pcs-th pcs-th-quote-group" colSpan={2}>
                        <div className="pcs-th-quote-group-inner">
                          <span className="pcs-th-quote-id">Q{qIndex}</span>
                          <span className="pcs-th-quote-vendor">{quote.vendor}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                  {/* Row 2: Rate | Total sub-headers for each quotation, adjacent */}
                  <tr>
                    {validQuotes.flatMap((quote) => [
                      <th key={`${quote.id}-rate`} className="pcs-th pcs-th-sub">
                        <span className="pcs-th-sub-label">Rate</span>
                      </th>,
                      <th key={`${quote.id}-total`} className="pcs-th pcs-th-sub">
                        <span className="pcs-th-sub-label">Total</span>
                      </th>,
                    ])}
                  </tr>
                </thead>
                <tbody>
                  {itemMatrix.map((entry, idx) => {
                    const selected = allocations[entry.key];
                    return (
                      <tr key={entry.key} className="pcs-comparison-row">
                        {/* Static columns — sticky */}
                        <td className="pcs-td pcs-td-sticky-left tabular-nums text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="pcs-td pcs-td-sticky-left">
                          <span className="pcs-td-rfq-no">{rfq.reference || '—'}</span>
                        </td>
                        <td className="pcs-td pcs-td-sticky-left">
                          <span className="text-[11px] font-medium text-slate-600">
                            {entry.item.hsn || entry.item.materialCode || '—'}
                          </span>
                        </td>
                        <td className="pcs-td pcs-td-sticky-left">
                          <div className="pcs-td-item">
                            <span className="pcs-td-item-name">{entry.item.product || `Item ${idx + 1}`}</span>
                            {entry.item.specification && (
                              <span className="pcs-td-item-spec" title={entry.item.specification}>
                                {entry.item.specification}
                              </span>
                            )}
                            {entry.quotedCount > 1 && (
                              <span className="pcs-item-stats-row">
                                <span className="pcs-item-stat" title="Lowest rate">
                                  Low: {entry.lowest ? formatAmount(entry.lowest.unitPrice, entry.lowest.currency) : '—'}
                                </span>
                                <span className="pcs-item-stat" title="Average rate">
                                  Avg: {entry.avgRate != null ? formatAmount(entry.avgRate, validQuotes[0]?.currency) : '—'}
                                </span>
                                <span className="pcs-item-stat" title="Highest rate">
                                  High: {entry.highest ? formatAmount(entry.highest.unitPrice, entry.highest.currency) : '—'}
                                </span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="pcs-td pcs-td-sticky-left pcs-td-right tabular-nums">
                          {entry.item.qty || 0}
                          <span className="text-slate-400 ml-0.5">{entry.item.uom || ''}</span>
                        </td>
                        {/* Dynamic quotation columns — each vendor gets Rate + Total adjacent */}
                        {entry.rows.flatMap((r, qIndex) => {
                          const isLowest = entry.lowest && r.quoted && r.quoteId === entry.lowest.quoteId;
                          const isSelected = selected && r && selected.quoteId === r.quoteId && selected.vendor === r.vendor;

                          if (!r || !r.quoted) {
                            return [
                              <td key={`rate-${r.quoteId || qIndex}`} className="pcs-td pcs-td-sub pcs-td-not-quoted">—</td>,
                              <td key={`total-${r.quoteId || qIndex}`} className="pcs-td pcs-td-sub pcs-td-sub-total pcs-td-not-quoted">—</td>,
                            ];
                          }

                          return [
                            /* Rate cell */
                            <td
                              key={`rate-${r.quoteId}`}
                              onClick={() => !selectionLocked && handleSelectVendor(entry.key, r.vendor)}
                              className={`pcs-td pcs-td-sub ${selectionLocked ? '' : 'pcs-td-clickable'} ${isSelected ? 'pcs-td-selected' : ''}`}
                              title={selectionLocked ? 'Selection locked' : `Select ${r.vendor} for this item`}
                            >
                              <div className="pcs-sub-cell-rate">
                                <span className={`pcs-quote-rate ${isLowest ? 'pcs-quote-lowest' : isSelected ? 'pcs-quote-selected-rate' : ''}`}>
                                  {formatAmount(r.unitPrice, r.currency)}
                                </span>
                                <div className="pcs-sub-cell-badges">
                                  {isLowest && (
                                    <span className="pcs-lowest-badge">
                                      <Trophy className="w-2.5 h-2.5" /> Lowest
                                    </span>
                                  )}
                                  {isSelected && (
                                    <span className="pcs-selected-badge">
                                      <Check className="w-2.5 h-2.5" /> Selected
                                    </span>
                                  )}
                                </div>
                              </div>
                            </td>,
                            /* Total cell — adjacent to Rate */
                            <td
                              key={`total-${r.quoteId}`}
                              onClick={() => !selectionLocked && handleSelectVendor(entry.key, r.vendor)}
                              className={`pcs-td pcs-td-sub pcs-td-sub-total ${selectionLocked ? '' : 'pcs-td-clickable'} ${isSelected ? 'pcs-td-selected' : ''}`}
                              title={selectionLocked ? 'Selection locked' : `Select ${r.vendor} for this item`}
                            >
                              <span className="pcs-quote-total">
                                {formatAmount(r.lineTotal, r.currency)}
                              </span>
                            </td>,
                          ];
                        })}
                      </tr>
                    );
                  })}
                  {/* Totals row */}
                  <tr className="pcs-comparison-total-row">
                    <td className="pcs-td pcs-td-sticky-left" colSpan={5}>
                      <span className="pcs-total-label">Vendor Totals</span>
                    </td>
                    {/* Each vendor: empty Rate cell + Total value cell, adjacent */}
                    {validQuotes.flatMap((quote) => {
                      const total = itemMatrix.reduce((sum, e) => {
                        const r = e.rows.find((c) => c.vendor === quote.vendor && c.quoted);
                        return sum + (r?.lineTotal || 0);
                      }, 0);
                      return [
                        <td key={`rate-${quote.id}`} className="pcs-td pcs-td-sub pcs-td-total" />,
                        <td key={`total-${quote.id}`} className="pcs-td pcs-td-sub pcs-td-sub-total pcs-td-total">
                          <span className="pcs-total-value">{formatAmount(total, quote.currency)}</span>
                        </td>,
                      ];
                    })}
                  </tr>
                  {/* Item-level stats summary row */}
                  <tr className="pcs-comparison-total-row" style={{ background: 'rgba(7,94,84,0.03)' }}>
                    <td className="pcs-td pcs-td-sticky-left" colSpan={5}>
                      <span className="pcs-total-label" style={{ color: '#075E54' }}>Item Price Stats</span>
                    </td>
                    {validQuotes.flatMap((quote) => [
                      <td key={`rate-stat-${quote.id}`} className="pcs-td pcs-td-sub" />,
                      <td key={`total-stat-${quote.id}`} className="pcs-td pcs-td-sub" />,
                    ])}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  6. Decision Insights                                  */}
          {/* ═══════════════════════════════════════════════════════ */}
          {comparison?.highlights && (() => {
            /* Compute vendor matrix totals so insights match the table. */
            const vendorMatrixTotals = {};
            validQuotes.forEach((quote) => {
              vendorMatrixTotals[quote.vendor] = itemMatrix.reduce((sum, e) => {
                const r = e.rows.find((c) => c.vendor === quote.vendor && c.quoted);
                return sum + (r?.lineTotal || 0);
              }, 0);
            });

            const lowestVendor = comparison.highlights.lowestPrice?.vendor;
            const lowestTotal = lowestVendor ? vendorMatrixTotals[lowestVendor] : null;

            const bestVendor = comparison.highlights.bestScore?.vendor;
            const bestScore = comparison.highlights.bestScore?.score;

            const fastestVendor = comparison.highlights.fastestDelivery?.vendor;
            const fastestDelivery = comparison.highlights.fastestDelivery?.delivery;

            return (
              <div className="pcs-insights-grid">
                {lowestVendor && (
                  <div className="pcs-insight-card">
                    <span className="pcs-insight-label">Lowest Price</span>
                    <span className="pcs-insight-vendor">{lowestVendor}</span>
                    <span className="pcs-insight-value">
                      {lowestTotal != null ? formatAmount(lowestTotal, rfq.currency) : '—'}
                    </span>
                  </div>
                )}
                {bestVendor && (
                  <div className="pcs-insight-card">
                    <span className="pcs-insight-label">Best Commercial Score</span>
                    <span className="pcs-insight-vendor">{bestVendor}</span>
                    <span className="pcs-insight-value">
                      {bestScore != null && bestScore > 0 ? `${bestScore}/100` : '—'}
                    </span>
                  </div>
                )}
                {fastestVendor && (
                  <div className="pcs-insight-card">
                    <span className="pcs-insight-label">Fastest ETD</span>
                    <span className="pcs-insight-vendor">{fastestVendor}</span>
                    <span className="pcs-insight-value">
                      {fastestDelivery ? `${fastestDelivery} Days` : '—'}
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ═══════════════════════════════════════════════════════ */}
          {/*  7. Approval Readiness Bar                              */}
          {/* ═══════════════════════════════════════════════════════ */}
          <div className="pcs-action-bar">
            <div className="pcs-action-bar-left">
              <div className="pcs-action-bar-ready">
                {selectionStored && technicalCompleted ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#075E54]" />
                    <span className="pcs-action-bar-title">Ready for Approval</span>
                  </>
                ) : selectionStored ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#075E54]" />
                    <span className="pcs-action-bar-title">Supplier Selected — Ready for Technical Evaluation</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-amber-500" />
                    <span className="pcs-action-bar-title">Select Suppliers Above</span>
                  </>
                )}
                {/* The recommendation is shown as soon as the comparison
                    loads, so state WHY it is not yet a decision. */}
                {!selectionStored && allocationList.length > 0 && !negotiationAgreed && (
                  <p className="text-[11px] font-semibold text-amber-600 mt-0.5">
                    Complete the Final Negotiation before the selection can be saved.{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/purchase/rfq/negotiation')}
                      className="underline font-bold cursor-pointer"
                    >
                      Open Negotiation
                    </button>
                  </p>
                )}
              </div>
              {allocationList.length > 0 ? (
                <span className="pcs-action-bar-summary">
                  <strong className="text-[#075E54]">{allocationList.length} item{allocationList.length !== 1 ? 's' : ''}</strong>
                  {' · '}
                  <strong>{supplierCount} vendor{supplierCount !== 1 ? 's' : ''}</strong>
                  {' · '}
                  <strong className="text-[#075E54]">{formatAmount(selectedValue, rfq.currency)}</strong>
                </span>
              ) : (
                <span className="pcs-action-bar-summary text-slate-400">Select vendors for each item above</span>
              )}
              <div className="pcs-approval-stepper-mini">
                {NFA_APPROVAL_STAGES.map((stage, idx) => (
                  <div key={stage} className="pcs-approval-step">
                    <div className="pcs-approval-step-dot">{idx + 1}</div>
                    <span className="pcs-approval-step-label">{stage}</span>
                    {idx < NFA_APPROVAL_STAGES.length - 1 && <div className="pcs-approval-step-line" />}
                  </div>
                ))}
              </div>
            </div>
            <div className="pcs-action-bar-right">
              <button
                type="button"
                onClick={() => navigate('/purchase/rfq/price-comparative-statement')}
                className="btn btn-ghost btn-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleContinue}
                disabled={submitting || allocationList.length === 0}
                className="pcs-action-btn-primary"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
                {technicalCompleted ? 'Continue to Approval →' : 'Continue to Technical Evaluation →'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PurchasePageLayout>
  );
}
