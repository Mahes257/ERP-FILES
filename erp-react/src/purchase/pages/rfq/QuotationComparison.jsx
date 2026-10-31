/**
 * purchase/pages/rfq/QuotationComparison.jsx
 * ------------------------------------------------------------------
 * Price Comparative Statement — pick an RFQ and compare every vendor quote
 * side by side (unit rates, discount, charges, GST and grand total).
 *
 * The PRIMARY comparison is ITEM-WISE: every RFQ line is compared
 * independently across all valid vendor quotations, the lowest valid
 * quote per item is highlighted and recommended, and each line can be
 * allocated to its own supplier (split awards supported). Vendor-level
 * totals remain available as a secondary comparison.
 *
 * Item-wise selections persist through the evaluation service
 * (completeItemWiseSelection). Comparison NEVER awards vendors, approves
 * the selection or raises POs — those responsibilities live in Supplier
 * Selection / Purchase Order. The only next action here is proceeding to
 * Final Negotiation.
 * ------------------------------------------------------------------
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, FileSpreadsheet, FileText, Gauge, History, Loader2, RefreshCw, Scale, Split, TrendingDown, TrendingUp, Truck, Trophy, Users, Wallet
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import EvaluationPipeline from '../../components/EvaluationPipeline';
import { stepperStepsFor } from '../../constants';
import { useToast } from '../../components/ui';
import { rfqService } from '../../services/rfq';
import { evaluationService, itemKeyOf } from '../../services/evaluation';
import { APPROVAL_STATUS, QUOTATION_STATUS } from '../../constants';
import { resolveRfqIdForComparison } from '../../utils/quoting';
import { formatAmount } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { exportExcel } from '../../utils/export';
import '../../styles/cpr-list.css';

/** Quotations eligible for comparison — pending placeholders, rejected
 *  and withdrawn quotes are excluded (missing item prices are shown as
 *  "Not Quoted", never as ₹0). */
const VALID_QUOTE_STATUSES = [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED];

export default function QuotationComparison() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [rfqs, setRfqs] = useState([]);
  const [selectedRfqId, setSelectedRfqId] = useState(searchParams.get('rfq') || '');
  const [comparison, setComparison] = useState(null);
  /* The evaluation record for the selected RFQ — supplies the stored
     item-wise selection and its approval state (which locks editing).
     Best-effort; null when not evaluable. */
  const [evaluation, setEvaluation] = useState(null);
  const [loadingRfqs, setLoadingRfqs] = useState(true);
  const [loadingComparison, setLoadingComparison] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  /* Item-wise allocation map keyed by itemKey (RFQ id + line index). */
  const [allocations, setAllocations] = useState({});
  const [allocationBusy, setAllocationBusy] = useState(false);
  /* Presentation-only: item-wise section collapsed state and per-vendor
     "View Details" expansion (keyed by quote id). */
  const [itemWiseOpen, setItemWiseOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState({});
  /* Quotation History section — collapsed by default */
  const [historyOpen, setHistoryOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    let cancelled = false;
    rfqService
      .getRfqs({ page: 1, pageSize: 100 })
      .then((response) => {
        if (cancelled) return;
        setRfqs(response.data);
        /* Normalize the deep link to the internal id so the select shows
           the right option and the evaluation lookup hits the right record
           (see resolveRfqIdForComparison). */
        const requested = searchParams.get('rfq') || '';
        setSelectedRfqId(resolveRfqIdForComparison(response.data, requested));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingRfqs(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRfqId) return;
    let cancelled = false;

    const load = async () => {
      setLoadingComparison(true);
      setError(null);
      try {
        const [data, evaluationData] = await Promise.all([
          rfqService.getQuotationComparison(selectedRfqId),
          evaluationService.getEvaluation(selectedRfqId).catch(() => null)
        ]);
        if (cancelled) return;
        setComparison(data);
        setEvaluation(evaluationData);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoadingComparison(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [selectedRfqId, refreshKey]);

  const rfqItems = useMemo(() => comparison?.rfq?.items || [], [comparison]);

  /* Estimated RFQ value — the enriched record exposes it, but fall back to
     a line-item computation so the summary never shows a stale ₹0. */
  const estimatedValue =
    comparison?.rfq?.estimatedValue ??
    rfqItems.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate ?? item.expectedRate) || 0), 0);

  /* Only RECEIVED / ACCEPTED quotations take part in the comparison. */
  const validQuotes = useMemo(
    () => (comparison?.quotes || []).filter((quote) => VALID_QUOTE_STATUSES.includes(quote.status)),
    [comparison]
  );

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
          quoted
        };
      });
      const quotedRows = rows.filter((row) => row.quoted);
      const lowest = quotedRows.length
        ? quotedRows.reduce((best, row) => (row.unitPrice < best.unitPrice ? row : best))
        : null;
      return { item, index, key, rows, lowest };
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
          lineTotal: entry.lowest.lineTotal
        };
      }
    });
    return map;
  }, [itemMatrix]);

  /* Stored selection → allocation map (explicit allocations win; a
     classic single-vendor selection awards every line to that vendor). */
  const storedAllocations = useMemo(() => {
    const selection = evaluation?.selection;
    if (!selection) return null;
    if (Array.isArray(selection.allocations) && selection.allocations.length > 0) {
      const map = {};
      selection.allocations.forEach((allocation) => {
        map[allocation.itemKey] = { ...allocation };
      });
      return map;
    }
    const map = {};
    itemMatrix.forEach((entry) => {
      const row = entry.rows.find((candidate) => candidate.vendor === selection.selectedVendor);
      if (row) {
        map[entry.key] = {
          itemKey: entry.key,
          product: entry.item.product || '',
          uom: entry.item.uom || '',
          qty: Number(entry.item.qty) || 0,
          vendor: row.vendor,
          quoteId: row.quoteId,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal
        };
      }
    });
    return Object.keys(map).length ? map : null;
  }, [evaluation, itemMatrix]);

  /* Initialise the editable allocation map from the stored selection,
     or the recommended (lowest) vendors when nothing is stored yet. */
  useEffect(() => {
    queueMicrotask(() => {
      setAllocations(storedAllocations || recommendedAllocations);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRfqId, comparison?.rfq?.id, evaluation?.selection?.selectedAt]);

  const allocationList = Object.values(allocations).filter(Boolean);
  const supplierCount = new Set(allocationList.map((allocation) => allocation.vendor)).size;
  const selectedValue =
    Math.round(allocationList.reduce((sum, allocation) => sum + (allocation.lineTotal || 0), 0) * 100) / 100;
  const splitSelection = supplierCount > 1;
  const savingsVsEstimate = Math.max(0, estimatedValue - selectedValue);
  /* Editing locks once the selection is approved (or the RFQ is awarded);
     a pending or rejected selection stays editable before final award. */
  const selectionApproved = evaluation?.approval?.status === APPROVAL_STATUS.APPROVED;
  const selectionLocked = selectionApproved || Boolean(comparison?.awarded);

  /* Vendors currently allocated at least one item (used to mark the
     selected supplier in the Quick Comparison table). */
  const allocatedVendors = useMemo(
    () => new Set(allocationList.map((allocation) => allocation.vendor)),
    [allocationList]
  );

  /* Persists the full item-wise allocation through the evaluation
     service — every item must be allocated exactly once. */
  const saveAllocations = async (map) => {
    const list = Object.values(map).filter(Boolean);
    if (list.length === 0 || list.length !== itemMatrix.length) {
      toast.error('Select a vendor for every item before saving');
      return;
    }
    setAllocationBusy(true);
    try {
      await evaluationService.completeItemWiseSelection(selectedRfqId, { allocations: list });
      toast.success('Item-wise selection saved');
      setRefreshKey((key) => key + 1);
    } catch (err) {
      toast.error(err?.message || 'Failed to save selection');
    } finally {
      setAllocationBusy(false);
    }
  };

  const handleSelectVendor = async (itemKey, vendor) => {
    if (!selectedRfqId || selectionLocked || allocationBusy) return;
    const entry = itemMatrix.find((candidate) => candidate.key === itemKey);
    const row = entry?.rows.find((candidate) => candidate.vendor === vendor);
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
        lineTotal: row.lineTotal
      }
    };
    setAllocations(next);
    await saveAllocations(next);
  };

  /* Classic single-vendor selection — awards every RFQ line to the chosen
     vendor through the same item-wise persistence path (a vendor must have
     quoted every item to be selectable here). */
  const selectVendorForAllItems = async (vendor) => {
    if (!selectedRfqId || selectionLocked || allocationBusy) return;
    const map = {};
    itemMatrix.forEach((entry) => {
      const row = entry.rows.find((candidate) => candidate.vendor === vendor && candidate.quoted);
      if (row) {
        map[entry.key] = {
          itemKey: entry.key,
          product: entry.item.product || '',
          uom: entry.item.uom || '',
          qty: Number(entry.item.qty) || 0,
          vendor: row.vendor,
          quoteId: row.quoteId,
          unitPrice: row.unitPrice,
          lineTotal: row.lineTotal
        };
      }
    });
    if (Object.keys(map).length !== itemMatrix.length) {
      toast.error(`${vendor} has not quoted every item`);
      return;
    }
    setAllocations(map);
    await saveAllocations(map);
  };

  const resetToRecommended = async () => {
    if (selectionLocked || allocationBusy) return;
    setAllocations(recommendedAllocations);
    await saveAllocations(recommendedAllocations);
  };

  const handleExport = async (type) => {
    if (!comparison) return;
    if (type !== 'excel') return;
    const columns = [
      { key: 'rank', label: 'Rank', visible: true },
      { key: 'vendor', label: 'Vendor', visible: true },
      { key: 'subtotal', label: 'Basic Amount', visible: true },
      { key: 'discount', label: 'Discount %', visible: true },
      { key: 'freight', label: 'Freight', visible: true },
      { key: 'gstTotal', label: 'Tax', visible: true },
      { key: 'total', label: 'Grand Total', visible: true },
      { key: 'delivery', label: 'Delivery (days)', visible: true },
      { key: 'leadTime', label: 'Lead Time (days)', visible: true },
      { key: 'paymentTerms', label: 'Payment Terms', visible: true },
      { key: 'warranty', label: 'Warranty', visible: true },
      { key: 'vendorRating', label: 'Vendor Rating', visible: true },
      { key: 'score', label: 'Composite Score', visible: true },
      { key: 'status', label: 'Status', visible: true }
    ];
    await exportExcel(columns, comparison.quotes, `rfq-comparison-${comparison.rfq.rfqNo}`);
    toast.success('Comparison exported to Excel');
  };

  /* ----- Item-wise section rendering (collapsible, compact) ----- */
  const renderItemWise = (currency) => {
    if (itemMatrix.length === 0) return null;

    const vendorColumns = validQuotes.map((quote) => quote);

    return (
      <PurchaseSectionCard
        title={
          <button
            type="button"
            onClick={() => setItemWiseOpen((open) => !open)}
            className="inline-flex items-center gap-2 cursor-pointer group text-left"
            aria-expanded={itemWiseOpen}
          >
            <Split className="w-4 h-4 text-indigo-500" />
            <span className="inline-flex items-center gap-2">
              Item-wise Comparison
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600">
                {itemMatrix.length} item{itemMatrix.length > 1 ? 's' : ''}
              </span>
            </span>
            <ChevronDown
              className={`w-3.5 h-3.5 text-slate-400 transition-transform group-hover:text-slate-600 ${itemWiseOpen ? 'rotate-180' : ''}`}
            />
          </button>
        }
        subtitle="Every RFQ line is compared independently across all valid vendor quotations — click a vendor cell to award that item"
        action={
          !selectionLocked && itemMatrix.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={resetToRecommended}
                disabled={allocationBusy}
                className="btn btn-ghost btn-sm"
              >
                Reset to Recommended
              </button>
              {selectionApproved ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Selection Approved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700">
                  {allocationBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {evaluation?.selection ? 'Selection saved — pending approval' : 'Select vendors per item'}
                </span>
              )}
            </div>
          ) : null
        }
        bodyClassName="p-0"
      >
        {!itemWiseOpen ? (
          /* Collapsed — one-line summary with an Expand shortcut */
          <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-[11px] font-semibold text-slate-500">
            <span>{itemMatrix.length} item{itemMatrix.length > 1 ? 's' : ''}</span>
            <span className="text-slate-300">·</span>
            <span>{allocationList.length ? `${supplierCount} supplier${supplierCount > 1 ? 's' : ''} selected` : 'no selection yet'}</span>
            <span className="text-slate-300">·</span>
            <span>
              Selected award value{' '}
              <span className="font-bold text-slate-700 tabular-nums">
                {allocationList.length ? formatAmount(selectedValue, currency) : '—'}
              </span>
            </span>
            {splitSelection && (
              <>
                <span className="text-slate-300">·</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600">
                  <Split className="w-2.5 h-2.5" /> Split award
                </span>
              </>
            )}
            <button
              type="button"
              onClick={() => setItemWiseOpen(true)}
              className="ml-auto text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
            >
              Expand
            </button>
          </div>
        ) : (
          <div className="px-5 py-4">
            {/* Compact summary strip */}
            <div className="flex flex-wrap gap-2 mb-4">
              {[
                { label: 'Items', value: String(itemMatrix.length) },
                { label: 'Suppliers Selected', value: allocationList.length ? String(supplierCount) : '—' },
                { label: 'Selected Award Value', value: allocationList.length ? formatAmount(selectedValue, currency) : '—' },
                { label: 'Estimated Value', value: formatAmount(estimatedValue, currency) },
                { label: 'Savings vs Estimate', value: formatAmount(savingsVsEstimate, currency) },
                { label: 'Split Award', value: allocationList.length ? (splitSelection ? 'YES' : 'NO') : '—' }
              ].map((chip) => (
                <span
                  key={chip.label}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50/60 px-2.5 py-1.5"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{chip.label}</span>
                  <span className="text-xs font-bold text-slate-700 tabular-nums">{chip.value}</span>
                </span>
              ))}
            </div>

            {/* Compact item-wise table: one row per item, one column per vendor */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[720px]">
                <thead>
                  <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                    <th className="px-3 py-2 sticky left-0 bg-white">Item</th>
                    {vendorColumns.map((quote) => (
                      <th key={quote.id} className="px-3 py-2 text-center">{quote.vendor}</th>
                    ))}
                    <th className="px-3 py-2 text-center">Recommended</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {itemMatrix.map((entry, index) => {
                    const selected = allocations[entry.key];
                    return (
                      <tr key={entry.key} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-3 py-2.5 sticky left-0 bg-white">
                          <div className="text-xs font-bold text-slate-800">{entry.item.product || `Item ${index + 1}`}</div>
                          <div className="text-[10px] text-slate-400">
                            Qty {Number(entry.item.qty) || 0} {entry.item.uom || ''}
                          </div>
                        </td>
                        {vendorColumns.map((quote) => {
                          const row = entry.rows.find((candidate) => candidate.quoteId === quote.id);
                          const isLowest = entry.lowest && row?.quoted && row.quoteId === entry.lowest.quoteId;
                          const isSelected = selected && row && selected.quoteId === row.quoteId && selected.vendor === row.vendor;
                          if (!row || !row.quoted) {
                            return (
                              <td key={quote.id} className="px-3 py-2.5 text-center text-slate-300 italic">
                                Not Quoted
                              </td>
                            );
                          }
                          return (
                            <td
                              key={quote.id}
                              onClick={() => !selectionLocked && row.quoted && handleSelectVendor(entry.key, row.vendor)}
                              title={
                                selectionLocked
                                  ? 'Selection locked'
                                  : `Award ${entry.item.product || `item ${index + 1}`} to ${row.vendor}`
                              }
                              className={`px-3 py-2.5 text-center align-top ${
                                selectionLocked ? '' : 'cursor-pointer'
                              } ${isSelected ? 'bg-emerald-50/70 ring-1 ring-inset ring-emerald-200 rounded-lg' : ''}`}
                            >
                              <div className={`font-bold tabular-nums ${isLowest ? 'text-sky-700' : isSelected ? 'text-emerald-700' : 'text-slate-700'}`}>
                                {formatAmount(row.unitPrice, row.currency)}
                              </div>
                              <div className="text-[10px] text-slate-400 tabular-nums mt-0.5">
                                Line {formatAmount(row.lineTotal, row.currency)}
                              </div>
                              <div className="flex items-center justify-center gap-1 mt-1 flex-wrap">
                                {isLowest && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-sky-100 text-sky-700">
                                    <TrendingUp className="w-2.5 h-2.5" /> Lowest
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-700">
                                    <Check className="w-2.5 h-2.5" /> Selected
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                        <td className="px-3 py-2.5 text-center">
                          {entry.lowest ? (
                            <span className="inline-flex flex-col items-center gap-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700">
                                <Check className="w-2.5 h-2.5" /> {entry.lowest.vendor}
                              </span>
                              {entry.lowest.lineTotal != null && (
                                <span className="text-[10px] text-slate-400 tabular-nums">
                                  {formatAmount(entry.lowest.lineTotal, entry.lowest.currency)}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="px-1 pt-3 text-[11px] text-slate-400">
              Click any vendor cell above to award that item to the vendor — or use the Select button in the Quick
              Comparison table to award every item to one supplier.
            </p>
          </div>
        )}
      </PurchaseSectionCard>
    );
  };

  const renderComparison = () => {
    if (loadingComparison) {
      return (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      );
    }

    if (error || !comparison) {
      return (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Unable to load comparison</p>
          <p className="text-xs text-slate-400 mt-1">{error?.message || 'Please select an RFQ.'}</p>
        </div>
      );
    }

    const { rfq, quotes, winner, highlights } = comparison;
    const currency = rfq.currency;

    const splitAwarded = Boolean(rfq.splitAward) && Array.isArray(rfq.awardedAllocations) && rfq.awardedAllocations.length > 0;
    const awardedVendors = splitAwarded
      ? [...new Set(rfq.awardedAllocations.map((allocation) => allocation.vendor))]
      : rfq.awardedVendor
        ? [rfq.awardedVendor]
        : [];

    const toggleDetails = (quoteId) => {
      setDetailsOpen((open) => ({ ...open, [quoteId]: !open[quoteId] }));
    };

    const vendorQuotedAll = (vendor) =>
      itemMatrix.length > 0 && itemMatrix.every((entry) => entry.rows.some((row) => row.vendor === vendor && row.quoted));

    /* Recommendation reason — derived from the existing comparison data,
       never hardcoded. */
    const reasonParts = [];
    if (highlights?.lowestPrice?.vendor === winner?.vendor) reasonParts.push('lowest total price');
    if (highlights?.bestScore?.vendor === winner?.vendor) reasonParts.push('best composite score');
    if (highlights?.fastestDelivery?.vendor === winner?.vendor) reasonParts.push('fastest delivery');
    const recommendationReason = reasonParts.length
      ? `Best overall offer — ${reasonParts.join(' and ')}.`
      : 'Recommended by the quotation comparison.';

    const highlightBadge = (quote) => {
      const badges = [];
      if (highlights?.lowestPrice?.vendor === quote.vendor) {
        badges.push({ label: 'Lowest Price', Icon: Wallet, cls: 'bg-sky-50 text-sky-700 border-sky-200' });
      }
      if (highlights?.fastestDelivery?.vendor === quote.vendor) {
        badges.push({ label: 'Fastest Delivery', Icon: Truck, cls: 'bg-amber-50 text-amber-700 border-amber-200' });
      }
      if (highlights?.bestScore?.vendor === quote.vendor) {
        badges.push({ label: 'Best Score', Icon: Gauge, cls: 'bg-purple-50 text-purple-700 border-purple-200' });
      }
      return badges;
    };

    return (
      <div className="space-y-5">
        {/* ===== RFQ SUMMARY — one compact card ===== */}
        <PurchaseSectionCard title={rfq.title || rfq.rfqNo} subtitle={`${rfq.rfqNo} · Ref ${rfq.reference || '—'}`} bodyClassName="p-0">
          <div className="px-5 pt-4">
            <EvaluationPipeline steps={stepperStepsFor('COMPARISON')} ariaLabel="Price Comparative Statement workflow" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-3 px-5 py-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">RFQ Number</div>
              <div className="text-xs font-semibold text-slate-800 mt-1">{rfq.rfqNo}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Reference PR</div>
              <div className="text-xs font-semibold text-slate-800 mt-1">{rfq.reference || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Category</div>
              <div className="text-xs font-semibold text-slate-800 mt-1">{rfq.category || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Due Date</div>
              <div className="text-xs font-semibold text-slate-800 mt-1">{formatDate(rfq.dueDate) || '—'}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Quotes</div>
              <div className="text-xs font-semibold text-slate-800 mt-1">{quotes.length} received</div>
            </div>
          </div>
        </PurchaseSectionCard>

        {comparison.awarded && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <Trophy className="w-4 h-4 text-emerald-600 shrink-0" />
                <p className="text-xs font-semibold text-emerald-800">
                  This RFQ was{' '}
                  <span className="font-bold">
                    {splitAwarded
                      ? `awarded across ${awardedVendors.length} suppliers`
                      : `awarded to ${comparison.awarded.vendor}`}
                  </span>{' '}
                  on {formatDateTime(comparison.awarded.awardedAt)} at{' '}
                  <span className="font-bold">{formatAmount(comparison.awarded.total, currency)}</span>.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                {splitAwarded && awardedVendors.map((vendor) => (
                  <span key={vendor} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-white border border-emerald-300 text-emerald-800">
                    <Users className="w-3 h-3" /> {vendor}
                  </span>
                ))}
              </div>
            </div>
            {splitAwarded && (
              <div className="overflow-x-auto bg-white/60 rounded-lg border border-emerald-200">
                <table className="w-full text-left text-[11px] min-w-[520px]">
                  <thead>
                    <tr className="text-emerald-800/60 text-[10px] font-bold uppercase tracking-wider border-b border-emerald-200">
                      <th className="px-3 py-2">Item</th>
                      <th className="px-3 py-2">Vendor</th>
                      <th className="px-3 py-2 text-right">Unit Price</th>
                      <th className="px-3 py-2 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-emerald-100">
                    {rfq.awardedAllocations.map((allocation, index) => (
                      <tr key={allocation.itemKey || index}>
                        <td className="px-3 py-2 font-semibold text-emerald-900">{allocation.product || `Item ${index + 1}`}</td>
                        <td className="px-3 py-2 font-semibold text-emerald-800">{allocation.vendor}</td>
                        <td className="px-3 py-2 text-right text-emerald-900 tabular-nums">{formatAmount(allocation.unitPrice, currency)}</td>
                        <td className="px-3 py-2 text-right font-bold text-emerald-900 tabular-nums">{formatAmount(allocation.lineTotal, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              {(rfq.poNos?.length ? rfq.poNos : rfq.poNo ? [rfq.poNo] : []).map((poNo) => (
                <button
                  key={poNo}
                  type="button"
                  onClick={() => navigate(`/purchase/orders/${poNo}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-white border border-emerald-300 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" /> View PO {poNo}
                </button>
              ))}
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500">
                <FileText className="w-3.5 h-3.5" /> Purchase Orders are raised in the Purchase Order stage (after Approval Flow)
              </span>
            </div>
          </div>
        )}

        {quotes.length === 0 ? (
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
            <Scale className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-xs font-bold text-slate-500">No quotations received yet</p>
            <p className="text-[11px] text-slate-400 mt-1">Quotes will appear here once vendors respond to the RFQ.</p>
          </div>
        ) : (
          <>
            {/* ===== CURRENT QUOTATIONS — the main comparison table ===== */}
            <PurchaseSectionCard
              title={
                <span className="inline-flex items-center gap-2">
                  <Scale className="w-4 h-4 text-sky-500" />
                  Current Quotations
                </span>
              }
              subtitle="Latest valid quotations received for this RFQ"
              bodyClassName="p-0"
            >
              <div className="max-h-[480px] overflow-auto">
                <table className="w-full text-left text-xs min-w-[820px]">
                  <thead>
                    <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100 sticky top-0 bg-white z-10">
                      <th className="px-4 py-2.5">Vendor</th>
                      <th className="px-4 py-2.5">Quote ID</th>
                      <th className="px-4 py-2.5 text-right">Submitted</th>
                      <th className="px-4 py-2.5 text-right">Total Amount</th>
                      <th className="px-4 py-2.5 text-right">Delivery</th>
                      <th className="px-4 py-2.5 text-right">Lead Time</th>
                      <th className="px-4 py-2.5">Payment Terms</th>
                      <th className="px-4 py-2.5">Warranty</th>
                      <th className="px-4 py-2.5 text-right">Score</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {quotes.map((quote) => {
                      const isWinner = winner && quote.id === winner.id;
                      const isSelected = allocatedVendors.has(quote.vendor);
                      const allAwardedToVendor =
                        isSelected && allocationList.length === itemMatrix.length && allocationList.every((a) => a.vendor === quote.vendor);
                      const details = detailsOpen[quote.id];
                      const badges = highlightBadge(quote);
                      return (
                        <Fragment key={quote.id}>
                          <tr
                            className={`transition-colors ${
                              isSelected ? 'bg-emerald-50/50' : isWinner ? 'bg-sky-50/30' : 'hover:bg-slate-50/60'
                            }`}
                          >
                            <td className="px-4 py-3">
                              <button
                                type="button"
                                onClick={() => toggleDetails(quote.id)}
                                className="inline-flex items-center gap-1.5 cursor-pointer group text-left"
                              >
                                <ChevronRight
                                  className={`w-3.5 h-3.5 text-slate-300 transition-transform group-hover:text-slate-500 ${details ? 'rotate-90' : ''}`}
                                />
                                <span className="font-semibold text-slate-800">{quote.vendor || '—'}</span>
                              </button>
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                {badges.map(({ label, Icon, cls }) => (
                                  <span key={label} className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${cls}`}>
                                    <Icon className="w-2.5 h-2.5" /> {label}
                                  </span>
                                ))}
                                {isSelected && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold border border-emerald-200 bg-emerald-50 text-emerald-700">
                                    {allAwardedToVendor ? (
                                      <>
                                        <Trophy className="w-2.5 h-2.5" /> Selected
                                      </>
                                    ) : (
                                      <>
                                        <Check className="w-2.5 h-2.5" /> Selected (partial)
                                      </>
                                    )}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              <span className="font-mono text-[11px]">{quote.quotationNo || quote.id}</span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600">
                              {quote.submittedOn ? formatDate(quote.submittedOn) : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-bold tabular-nums ${isWinner ? 'text-sky-700' : 'text-slate-800'}`}>
                                {formatAmount(quote.total, quote.currency)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                              {quote.delivery ? `${quote.delivery} days` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                              {quote.leadTime ? `${quote.leadTime} days` : '—'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">{quote.paymentTerms || '—'}</td>
                            <td className="px-4 py-3 text-slate-600">{quote.warranty || '—'}</td>
                            <td className="px-4 py-3 text-right text-slate-600 tabular-nums">
                              {quote.vendorRating ? `${quote.vendorRating} / 5` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {quote.score != null ? (
                                <span
                                  className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                    quote.score >= 75 ? 'bg-emerald-50 text-emerald-700' : quote.score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {quote.score}/100
                                </span>
                              ) : (
                                '—'
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <PurchaseStatusBadge status={quote.status} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              {allAwardedToVendor ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                                </span>
                              ) : selectionLocked ? (
                                <span className="text-slate-300 text-[11px]">{isSelected ? 'Partial' : '—'}</span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => selectVendorForAllItems(quote.vendor)}
                                  disabled={allocationBusy || !vendorQuotedAll(quote.vendor)}
                                  title={
                                    vendorQuotedAll(quote.vendor)
                                      ? `Award every item to ${quote.vendor}`
                                      : `${quote.vendor} has not quoted every item`
                                  }
                                  className="btn btn-primary btn-sm"
                                >
                                  {allocationBusy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Check className="po-btn-icon-ic" />}
                                  Select
                                </button>
                              )}
                            </td>
                          </tr>
                          {details && (
                            <tr className="bg-slate-50/60">
                              <td colSpan={11} className="px-4 py-3">
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3">
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Rank</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">#{quote.rank}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Basic Amount</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5 tabular-nums">{formatAmount(quote.subtotal, quote.currency)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Discount</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{quote.discount ? `${quote.discount}%` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Freight</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5 tabular-nums">{quote.freight ? formatAmount(quote.freight, quote.currency) : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Tax</div>
                                    {/* API quotes carry the tax as `tax`; `gstTotal` is the mock's name. */}
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5 tabular-nums">{formatAmount(quote.tax ?? quote.gstTotal, quote.currency)}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delivery</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{quote.delivery ? `${quote.delivery} days` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Lead Time</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{quote.leadTime ? `${quote.leadTime} days` : '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Payment Terms</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{quote.paymentTerms || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Warranty</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{quote.warranty || '—'}</div>
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendor Rating</div>
                                    <div className="text-xs font-semibold text-slate-700 mt-0.5">{quote.vendorRating ? `${quote.vendorRating} / 5` : '—'}</div>
                                  </div>
                                  {quote.submittedOn && (
                                    <div>
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Submitted</div>
                                      <div className="text-xs font-semibold text-slate-700 mt-0.5">{formatDate(quote.submittedOn)}</div>
                                    </div>
                                  )}
                                </div>
                                {quote.score != null && (
                                  <div className="mt-3 rounded-lg bg-white border border-slate-100 px-3 py-2.5 max-w-xl">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-[11px] font-bold text-slate-500">Composite Score</span>
                                      <span
                                        className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                          quote.score >= 75 ? 'bg-emerald-50 text-emerald-700' : quote.score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
                                        }`}
                                      >
                                        {quote.score}/100
                                      </span>
                                    </div>
                                    {(quote.scoreBreakdown ? Object.entries(quote.scoreBreakdown) : []).map(([key, value]) => (
                                      <div key={key} className="mb-1.5 last:mb-0">
                                        <div className="flex items-center justify-between text-[10px] mb-0.5">
                                          <span className="font-bold text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                                          <span className="font-semibold text-slate-500">{value}</span>
                                        </div>
                                        <div className="h-1 bg-slate-200/70 rounded-full overflow-hidden">
                                          <div className="h-full rounded-full bg-slate-400" style={{ width: `${value}%` }} />
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {quote.notes && (
                                  <p className="mt-3 text-[11px] text-slate-500 bg-white border border-slate-100 rounded-lg px-3 py-2 max-w-xl">{quote.notes}</p>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </PurchaseSectionCard>

            {/* ===== BEST CURRENT OFFER — compact recommendation cards ===== */}
            {winner && (
              <PurchaseSectionCard
                title={
                  <span className="inline-flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-emerald-500" />
                    Best Current Offer
                  </span>
                }
                subtitle="Automatically identified based on price, delivery, score and vendor rating"
              >
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg bg-sky-50 border border-sky-200 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-sky-600">Lowest Price</div>
                    <div className="text-xs font-bold text-sky-800 mt-1">{highlights?.lowestPrice?.vendor || '—'}</div>
                    <div className="text-[11px] text-sky-600 tabular-nums mt-0.5">
                      {highlights?.lowestPrice ? formatAmount(highlights.lowestPrice.total, currency) : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">Fastest Delivery</div>
                    <div className="text-xs font-bold text-amber-800 mt-1">{highlights?.fastestDelivery?.vendor || '—'}</div>
                    <div className="text-[11px] text-amber-600 mt-0.5">
                      {highlights?.fastestDelivery?.delivery ? `${highlights.fastestDelivery.delivery} days` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-purple-50 border border-purple-200 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600">Best Score</div>
                    <div className="text-xs font-bold text-purple-800 mt-1">{highlights?.bestScore?.vendor || '—'}</div>
                    <div className="text-[11px] text-purple-600 mt-0.5">
                      {highlights?.bestScore?.score != null ? `${highlights.bestScore.score}/100` : '—'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Recommended</div>
                    <div className="text-xs font-bold text-emerald-800 mt-1">{winner.vendor}</div>
                    <div className="text-[11px] text-emerald-600 mt-0.5">{recommendationReason}</div>
                  </div>
                </div>
              </PurchaseSectionCard>
            )}

            {/* ===== ITEM-WISE COMPARISON — collapsible ===== */}
            {renderItemWise(currency)}

            {/* ===== QUOTATION HISTORY — collapsed by default ===== */}
            {quotes.length > 0 && (
              <PurchaseSectionCard
                title={
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((open) => !open)}
                    className="inline-flex items-center gap-2 cursor-pointer group text-left"
                    aria-expanded={historyOpen}
                  >
                    <History className="w-4 h-4 text-slate-500" />
                    <span>Quotation History</span>
                    <ChevronDown
                      className={`w-3.5 h-3.5 text-slate-400 transition-transform group-hover:text-slate-600 ${historyOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                }
                subtitle="Previous quotations submitted for this RFQ — compare old vs current prices"
              >
                {!historyOpen ? (
                  <div className="flex items-center gap-2 px-1 pb-1 text-[11px] text-slate-400">
                    <span>{quotes.length} quotation{quotes.length > 1 ? 's' : ''} received</span>
                    <span className="text-slate-300">·</span>
                    <span>Click to view price history and old vs current comparison</span>
                    <button
                      type="button"
                      onClick={() => setHistoryOpen(true)}
                      className="ml-auto text-sky-600 hover:text-sky-700 font-bold cursor-pointer"
                    >
                      Expand
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Price History Table */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 mb-2">Price History</h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                              <th className="px-3 py-2">Date</th>
                              <th className="px-3 py-2">Quote ID</th>
                              <th className="px-3 py-2">Vendor</th>
                              <th className="px-3 py-2 text-right">Amount</th>
                              <th className="px-3 py-2 text-right">Change</th>
                              <th className="px-3 py-2 text-right">%</th>
                              <th className="px-3 py-2">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {[...quotes].sort((a, b) => new Date(b.submittedOn) - new Date(a.submittedOn)).map((quote, index, sorted) => {
                              const prev = sorted[index + 1];
                              const diff = prev ? quote.total - prev.total : null;
                              const pct = prev && prev.total > 0 ? ((diff / prev.total) * 100) : null;
                              return (
                                <tr key={quote.id} className="hover:bg-slate-50/60">
                                  <td className="px-3 py-2 text-slate-600">{formatDate(quote.submittedOn)}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">{quote.quotationNo || quote.id}</td>
                                  <td className="px-3 py-2 font-semibold text-slate-800">{quote.vendor}</td>
                                  <td className="px-3 py-2 text-right font-bold text-slate-800 tabular-nums">{formatAmount(quote.total, currency)}</td>
                                  <td className="px-3 py-2 text-right">
                                    {diff != null ? (
                                      <span className={`inline-flex items-center gap-0.5 font-bold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        {diff < 0 ? <TrendingDown className="w-3 h-3" /> : diff > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                                        {diff < 0 ? '↓' : diff > 0 ? '↑' : '—'} {formatAmount(Math.abs(diff), currency)}
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">Latest</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2 text-right">
                                    {pct != null ? (
                                      <span className={`font-bold ${pct < 0 ? 'text-emerald-600' : pct > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                        {pct < 0 ? '' : '+'}{pct.toFixed(2)}%
                                      </span>
                                    ) : (
                                      <span className="text-slate-400">—</span>
                                    )}
                                  </td>
                                  <td className="px-3 py-2"><PurchaseStatusBadge status={quote.status} /></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Old vs Current Item Price Comparison */}
                    {itemMatrix.length > 0 && validQuotes.length >= 2 && (() => {
                      /* Group quotes by vendor, sort by date descending. For each vendor,
                         compare the latest vs previous quote's per-item prices. */
                      const vendorQuotes = {};
                      [...quotes].sort((a, b) => new Date(b.submittedOn) - new Date(a.submittedOn)).forEach((quote) => {
                        if (!vendorQuotes[quote.vendor]) vendorQuotes[quote.vendor] = [];
                        vendorQuotes[quote.vendor].push(quote);
                      });
                      const vendorsWithHistory = Object.entries(vendorQuotes).filter(([, q]) => q.length >= 2);
                      if (vendorsWithHistory.length === 0) return null;
                      return (
                        <div className="mt-4">
                          <h4 className="text-xs font-bold text-slate-700 mb-2">Old vs Current Item Price</h4>
                          {vendorsWithHistory.map(([vendor, q]) => {
                            const latest = q[0];
                            const previous = q[1];
                            return (
                              <div key={vendor} className="mb-3 last:mb-0">
                                <div className="text-[11px] font-bold text-slate-600 mb-1.5">{vendor}</div>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-left text-xs">
                                    <thead>
                                      <tr className="text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                                        <th className="px-3 py-1.5">Item</th>
                                        <th className="px-3 py-1.5 text-right">Current</th>
                                        <th className="px-3 py-1.5 text-right">Previous</th>
                                        <th className="px-3 py-1.5 text-right">Difference</th>
                                        <th className="px-3 py-1.5 text-right">%</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                      {rfqItems.map((item, index) => {
                                        const currLine = latest.items?.[index];
                                        const prevLine = previous.items?.[index];
                                        const currRate = currLine ? Number(currLine.rate) : null;
                                        const prevRate = prevLine ? Number(prevLine.rate) : null;
                                        if (currRate == null && prevRate == null) return null;
                                        const diff = currRate != null && prevRate != null ? currRate - prevRate : null;
                                        const pct = diff != null && prevRate > 0 ? (diff / prevRate) * 100 : null;
                                        return (
                                          <tr key={`${vendor}-${index}`} className="hover:bg-slate-50/60">
                                            <td className="px-3 py-1.5 font-semibold text-slate-700">{item.product || `Item ${index + 1}`}</td>
                                            <td className="px-3 py-1.5 text-right font-bold text-slate-800 tabular-nums">
                                              {currRate != null ? formatAmount(currRate, currency) : '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right text-slate-500 tabular-nums">
                                              {prevRate != null ? formatAmount(prevRate, currency) : '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right">
                                              {diff != null ? (
                                                <span className={`inline-flex items-center gap-0.5 font-bold ${diff < 0 ? 'text-emerald-600' : diff > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                  {diff < 0 ? <TrendingDown className="w-3 h-3" /> : diff > 0 ? <TrendingUp className="w-3 h-3" /> : null}
                                                  {diff < 0 ? '↓' : diff > 0 ? '↑' : '—'} {formatAmount(Math.abs(diff), currency)}
                                                </span>
                                              ) : '—'}
                                            </td>
                                            <td className="px-3 py-1.5 text-right">
                                              {pct != null ? (
                                                <span className={`font-bold ${pct < 0 ? 'text-emerald-600' : pct > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                                                  {pct < 0 ? '' : '+'}{pct.toFixed(2)}%
                                                </span>
                                              ) : '—'}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </PurchaseSectionCard>
            )}

            {/* ===== SELECTED SUPPLIER — summary before proceeding ===== */}
            {allocationList.length > 0 && (
              <PurchaseSectionCard
                title={
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    Selected Supplier
                  </span>
                }
                subtitle="Review your selection before proceeding to Final Negotiation"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Supplier</div>
                    <div className="text-sm font-bold text-slate-800 mt-1">
                      {splitSelection ? `${supplierCount} suppliers (split award)` : allocationList[0]?.vendor || '—'}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected Quote</div>
                    <div className="text-sm font-bold text-slate-800 mt-1">
                      {allocationList.length === 1 ? allocationList[0]?.quoteId || '—' : `${allocationList.length} items allocated`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Selected Value</div>
                    <div className="text-lg font-bold text-emerald-800 mt-1 tabular-nums">{formatAmount(selectedValue, currency)}</div>
                    {savingsVsEstimate > 0 && (
                      <div className="text-[11px] text-emerald-600 mt-0.5">Saves {formatAmount(savingsVsEstimate, currency)} vs estimate</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/purchase/rfq/negotiation')}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 px-4 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
                    Proceed to Final Negotiation <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] text-slate-400">
                    After negotiation, the selected supplier will move to Approval Flow
                  </span>
                </div>
              </PurchaseSectionCard>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Price Comparative Statement' }
        ]}
        icon={Scale}
        title="Price Comparative Statement"
        subtitle="Compare vendor quotations item-wise, recommend the best supplier per line, and proceed to Final Negotiation"
        actions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => handleExport('excel')}
              disabled={!comparison}
            >
              <FileSpreadsheet size={12} /> Excel
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/purchase/rfq')}>
              <ChevronLeft size={12} /> Back to RFQs
            </button>
          </>
        }
      />

      <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <label className="block">
          <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Select RFQ</span>
          <select
            value={selectedRfqId}
            onChange={(e) => setSelectedRfqId(e.target.value)}
            className="bg-surface border border-slate-200 rounded-lg px-3 py-2.5 text-xs text-slate-700 outline-none cursor-pointer transition-colors focus:border-blue-500/60 min-w-[280px]"
          >
            {loadingRfqs ? <option>Loading RFQs...</option> : null}
            {rfqs.map((rfq) => (
              <option key={rfq.id} value={rfq.id}>{rfq.rfqNo} — {rfq.title}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => setRefreshKey((key) => key + 1)}
          className="btn btn-ghost btn-sm mt-5"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {renderComparison()}
    </PurchasePageLayout>
  );
}
