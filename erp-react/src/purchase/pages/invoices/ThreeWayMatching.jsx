/**
 * purchase/pages/invoices/ThreeWayMatching.jsx
 * ------------------------------------------------------------------
 * Three-Way Matching — real workflow comparing:
 *   Purchase Order ↔ Goods Receipt (GRN) ↔ Vendor Invoice
 *
 * The matching engine computes live from actual invoice/PO/GRN data.
 * Each row expands into a detailed per-line comparison showing PO
 * lines, GRN lines, Invoice lines, quantities, rates, taxes, totals,
 * variance and matching reason.
 *
 * Workflow:
 *   Pending Match → Matched → Eligible for Payment Approval
 *   Pending Match → Mismatch → Review → Resolve/Reject → Re-match
 *   Pending Match → Exception → Approve Exception → Matched
 *
 * Every override requires a reason and produces an audit entry.
 * No payment approval is allowed while unresolved blocking exceptions remain.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  Download, Eye, FileText, LayoutList, Loader2, PackageCheck, Receipt, RefreshCw,
  RotateCcw, Scale, Search, Shield, ShieldCheck, X
} from 'lucide-react';
import { ConfirmDialog, Modal, TextArea, TextInput, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState,
  PurchaseExportDropdown, PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { invoiceService } from '../../services/invoice';
import { logisticsService, GRN_STATUS } from '../../services/logistics';
import { MATCH_STATUS } from '../../constants';
import useKpiFilter from '../../hooks/useKpiFilter';
import { isMatchPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { formatAmount } from '../../utils/paymentUtils';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

import usePurchaseAccess from '../../access/usePurchaseAccess';
/* ═══════════════════════════════════════════════════════════════════ */
/*  Constants                                                         */
/* ═══════════════════════════════════════════════════════════════════ */

/** Value tolerance (±%) applied when comparing invoice total vs PO value. */
const MATCH_TOLERANCE_PCT = 2;

const COLUMNS = [
  { key: 'poNo', label: 'PO No', width: 170, sortable: true, visible: true, sticky: 'left' },
  { key: 'vendor', label: 'Vendor', width: 150, sortable: true, visible: true },
  { key: 'grnCount', label: 'GRN', width: 70, sortable: false, visible: true, align: 'center' },
  { key: 'orderQty', label: 'PO Qty', width: 85, sortable: true, visible: true, align: 'right' },
  { key: 'grnQty', label: 'GRN Qty', width: 85, sortable: true, visible: true, align: 'right' },
  { key: 'invoiceQty', label: 'Inv Qty', width: 85, sortable: true, visible: true, align: 'right' },
  { key: 'qtyVariance', label: 'Qty Var', width: 85, sortable: true, visible: true, align: 'right' },
  { key: 'orderAmount', label: 'PO Value', width: 105, sortable: true, visible: true, align: 'right' },
  { key: 'invoiceAmount', label: 'Invoice', width: 105, sortable: true, visible: true, align: 'right' },
  { key: 'valueVariance', label: 'Val Var', width: 95, sortable: true, visible: true, align: 'right' },
  { key: 'status', label: 'Match Status', width: 140, sortable: false, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const KPI_DEFS = [
  { key: 'matched', label: 'Matched', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'partial', label: 'Partially Matched', icon: Clock3, color: '#0d9488', bg: 'rgba(13,148,136,0.10)' },
  { key: 'mismatch', label: 'Mismatches', icon: AlertTriangle, color: '#e11d48', bg: 'rgba(225,29,72,0.10)' },
  { key: 'pending', label: 'Pending Match', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'exception', label: 'Exceptions', icon: Shield, color: '#64748b', bg: 'rgba(100,116,139,0.10)' }
];



/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                    */
/* ═══════════════════════════════════════════════════════════════════ */
export default function ThreeWayMatching() {
  const navigate = useNavigate();
  /* Re-running the match is Three-Way Matching · Match (bounded by Purchase
     Invoice). The POST /invoices/{id}/match endpoint re-checks it. */
  const { can } = usePurchaseAccess();
  const canMatch = can('invoiceMatching', 'match');
  const toast = useToast();

  /* ─── Data State ─── */
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [matchFilter, setMatchFilter] = useState('all'); // 'all' | MATCH_STATUS value
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);

  /* ─── UI State ─── */
  const [expanded, setExpanded] = useState(() => new Set());
  const [selectedIds, setSelectedIds] = useState([]);
  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));

  /* ─── Modal State ─── */
  const [overrideModal, setOverrideModal] = useState(null); // { row, action: 'override'|'reject'|'approveException' }
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideStatus, setOverrideStatus] = useState(MATCH_STATUS.MATCHED);
  const [resolvedField, setResolvedField] = useState('');
  const [tolerance, setTolerance] = useState('');
  const [confirmDialog, setConfirmDialog] = useState(null); // { row, action, title, message }

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  /* ─── Load Data ─── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orders, invoices, grns] = await Promise.all([
        purchaseOrderService.getOrders({ page: 1, pageSize: 500 }),
        invoiceService.getInvoices({ page: 1, pageSize: 500 }),
        logisticsService.getGrns({ page: 1, pageSize: 500 })
      ]);

      const invoiceByPo = new Map();
      invoices.data.forEach((invoice) => {
        if (!invoiceByPo.has(invoice.poNo)) invoiceByPo.set(invoice.poNo, invoice);
      });

      const grnsByPo = new Map();
      grns.data.forEach((grn) => {
        if (!grnsByPo.has(grn.poNo)) grnsByPo.set(grn.poNo, []);
        grnsByPo.get(grn.poNo).push(grn);
      });

      const computed = orders.data.map((order) => {
        const invoice = invoiceByPo.get(order.poNo) || null;
        const grnList = grnsByPo.get(order.poNo) || [];
        const postedGrns = grnList.filter((grn) => grn.status !== GRN_STATUS.EXPECTED);

        /* Quantities */
        const orderQty = (order.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0);
        const grnQty = postedGrns.reduce(
          (sum, grn) => sum + (grn.items || []).reduce((s, item) => s + Number(item.received || 0), 0), 0
        ) || 0;
        const invoiceQty = invoice?.items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 0;

        /* Quantities variance */
        const qtyVariance = invoiceQty > 0 ? invoiceQty - orderQty : 0;

        /* Values */
        const orderAmount = Number(order.amount) || 0;
        const invoiceAmount = invoice?.total ?? null;
        const valueVariance = invoiceAmount != null ? invoiceAmount - orderAmount : 0;

        /* Match status — use the service-computed status when available (respects overrides) */
        const matchStatus = invoice?.matchStatus || (postedGrns.length > 0 ? MATCH_STATUS.PENDING : MATCH_STATUS.PENDING);
        const matchReasons = invoice?.matchReasons || [];
        const matchDetails = invoice?.matchDetails || [];
        const vendorMatched = invoice ? (invoice.vendorMatched !== false) : true;
        const grnReceived = postedGrns.length > 0;

        /* Override info */
        const overrideStatus = invoice?.overrideStatus || null;
        const overrideReason = invoice?.overrideReason || null;
        const overrideBy = invoice?.overrideBy || null;
        const overrideAt = invoice?.overrideAt || null;

        return {
          poNo: order.poNo,
          vendor: order.vendor,
          invoiceId: invoice?.id || null,
          invoiceNo: invoice?.invoiceNo || null,
          invoiceStatus: invoice?.status || null,
          grnNo: grnList.length ? grnList.map((g) => g.grnNo).join(', ') : null,
          grnCount: postedGrns.length,
          orderQty,
          grnQty,
          invoiceQty,
          qtyVariance,
          orderAmount,
          invoiceAmount,
          valueVariance,
          matchStatus,
          matchReasons,
          matchDetails,
          vendorMatched,
          grnReceived,
          /* Item-level data for detail expansion */
          poItems: order.items || [],
          grnItems: postedGrns.flatMap((g) => g.items || []),
          invoiceItems: invoice?.items || [],
          /* Override info */
          overrideStatus,
          overrideReason,
          overrideBy,
          overrideAt,
          /* Audit */
          auditHistory: invoice?.auditHistory || []
        };
      });

      setRows(computed);
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

  /* ─── Filtering ─── */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (matchFilter !== 'all' && row.matchStatus !== matchFilter) return false;
      if (!q) return true;
      return [row.poNo, row.vendor, row.invoiceNo, row.grnNo].filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [rows, query, matchFilter]);

  /* ─── KPIs — calculated live from data ─── */
  const stats = useMemo(() => ({
    matched: rows.filter((r) => r.matchStatus === MATCH_STATUS.MATCHED).length,
    partial: rows.filter((r) => r.matchStatus === MATCH_STATUS.PARTIAL).length,
    mismatch: rows.filter((r) => r.matchStatus === MATCH_STATUS.MISMATCH).length,
    pending: rows.filter((r) => r.matchStatus === MATCH_STATUS.PENDING).length,
    exception: rows.filter((r) => r.matchStatus === MATCH_STATUS.EXCEPTION).length
  }), [rows]);

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats[def.key] ?? 0) }));

  /* Shared KPI ↔ status-tab bridge (same interaction model as
     Invoice Management). Match statuses are the filter vocabulary. */
  const { activeKpi, selectKpi, selectToken } = useKpiFilter({
    kpiMap: {
      matched: MATCH_STATUS.MATCHED,
      partial: MATCH_STATUS.PARTIAL,
      mismatch: MATCH_STATUS.MISMATCH,
      pending: MATCH_STATUS.PENDING,
      exception: MATCH_STATUS.EXCEPTION
    },
    tokenKpi: {
      all: null,
      [MATCH_STATUS.MATCHED]: 'matched',
      [MATCH_STATUS.PARTIAL]: 'partial',
      [MATCH_STATUS.MISMATCH]: 'mismatch',
      [MATCH_STATUS.PENDING]: 'pending',
      [MATCH_STATUS.EXCEPTION]: 'exception'
    },
    allToken: 'all',
    allKpi: null,
    initialKpi: null,
    applyToken: (token) => setMatchFilter(token)
  });

  /* Empty-state label for the currently active match filter. */
  const activeMatchLabel = ({
    [MATCH_STATUS.MATCHED]: 'Matched',
    [MATCH_STATUS.PARTIAL]: 'Partially Matched',
    [MATCH_STATUS.MISMATCH]: 'Mismatch',
    [MATCH_STATUS.PENDING]: 'Pending Match',
    [MATCH_STATUS.EXCEPTION]: 'Exception'
  })[matchFilter];

  /* ─── Column toggles ─── */
  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };
  const showAllColumns = () => setColumns((prev) => prev.map((c) => (c.key === 'actions' ? c : { ...c, visible: true })));
  const hideAllColumns = () => setColumns((prev) => prev.map((c) => (c.key === 'poNo' || c.key === 'actions' ? c : { ...c, visible: false })));

  const pageInfo = `Showing ${filtered.length > 0 ? 1 : 0}–${filtered.length} of ${filtered.length}`;

  /* ─── Expand/Collapse ─── */
  const toggleExpanded = useCallback((poNo) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(poNo)) next.delete(poNo);
      else next.add(poNo);
      return next;
    });
  }, []);

  /* ─── Export ─── */
  const handleExport = () => {
    exportCsv(
      COLUMNS.filter((c) => c.key !== 'actions'),
      filtered,
      'three-way-matching'
    );
    toast.success('Matching report exported');
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Actions — Match / Re-match / Override / Reject / Approve         */
  /* ═══════════════════════════════════════════════════════════════════ */

  const runAction = useCallback(async (action, row, options = {}) => {
    if (!row.invoiceId) {
      toast.error('No invoice linked to this PO — create an invoice first');
      return;
    }
    setActionLoading(true);
    try {
      let result;
      switch (action) {
        case 'rematch':
          result = await invoiceService.rematchInvoice(row.invoiceId);
          toast.success(`${row.poNo} match re-computed — ${result.matchStatus}`);
          break;
        case 'override':
          result = await invoiceService.overrideMatch(row.invoiceId, {
            status: options.status || MATCH_STATUS.MATCHED,
            reason: options.reason,
            resolvedField: options.resolvedField || '',
            tolerance: options.tolerance || ''
          });
          toast.success(`${row.poNo} match overridden to ${result.matchStatus}`);
          break;
        case 'reject':
          result = await invoiceService.rejectMatch(row.invoiceId, { reason: options.reason });
          toast.success(`${row.poNo} invoice rejected`);
          break;
        case 'approveException':
          result = await invoiceService.approveException(row.invoiceId, { reason: options.reason });
          toast.success(`${row.poNo} exception approved`);
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

  /* ─── Open Override Modal ─── */
  const openOverrideModal = (row, action) => {
    setOverrideModal({ row, action });
    setOverrideReason('');
    setOverrideStatus(action === 'reject' ? MATCH_STATUS.MISMATCH : MATCH_STATUS.MATCHED);
    setResolvedField('');
    setTolerance('');
  };

  const confirmOverride = async () => {
    if (!overrideModal) return;
    const { row, action } = overrideModal;
    if (!overrideReason.trim()) {
      toast.error('Reason is required');
      return;
    }
    await runAction(action, row, {
      status: overrideStatus,
      reason: overrideReason.trim(),
      resolvedField: resolvedField.trim(),
      tolerance: tolerance.trim()
    });
    setOverrideModal(null);
  };

  /* ─── Re-match Confirmation ─── */
  const handleRematch = (row) => {
    setConfirmDialog({
      row,
      action: 'rematch',
      title: 'Re-run match?',
      message: `This will clear any override and recompute the three-way match for ${row.poNo} from the current PO, GRN and invoice data.`
    });
  };

  const confirmDialogAction = async () => {
    if (!confirmDialog) return;
    await runAction(confirmDialog.action, confirmDialog.row, confirmDialog.options || {});
    setConfirmDialog(null);
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Row Actions — status-aware                                       */
  /* ═══════════════════════════════════════════════════════════════════ */

  const tableRowActions = useCallback((row) => {
    const actions = [];

    /* Always: View Details (expands the row) */
    actions.push({ key: 'view-details', label: 'View Details', icon: Eye });

    /* Always: Open Purchase Order */
    actions.push({ key: 'po', label: 'Open Purchase Order', icon: FileText });

    /* Open Invoice — only when invoice exists */
    if (row.invoiceId) {
      actions.push({ key: 'invoice', label: 'Open Invoice', icon: Eye });
    }

    /* Open GRN — only when GRN exists */
    if (row.grnNo) {
      actions.push({ key: 'grn', label: 'Open GRN', icon: PackageCheck });
    }

    /* Create Vendor Invoice — goods received but no invoice yet */
    if (!row.invoiceId && row.grnReceived) {
      actions.push({ key: 'create-invoice', label: 'Create Vendor Invoice', icon: Receipt });
    }

    /* Status-specific actions */
    if (row.matchStatus === MATCH_STATUS.PENDING && row.invoiceId) {
      actions.push({ key: 'rematch', label: 'Match / Reconcile', icon: RotateCcw });
    }

    if (row.matchStatus === MATCH_STATUS.MISMATCH) {
      actions.push({ key: 'override', label: 'Review Mismatch', icon: ShieldCheck });
      actions.push({ key: 'reject', label: 'Reject Invoice', icon: X, danger: true });
    }

    if (row.matchStatus === MATCH_STATUS.EXCEPTION) {
      actions.push({ key: 'approveException', label: 'Approve Exception', icon: ShieldCheck });
    }

    if (row.matchStatus === MATCH_STATUS.MATCHED) {
      actions.push({ key: 'view-match-details', label: 'View Match Details', icon: Scale });
    }

    return actions;
  }, []);

  const handleRowAction = useCallback((key, row) => {
    if (key === 'view-details' || key === 'view-match-details') {
      toggleExpanded(row.poNo);
    } else if (key === 'po') {
      navigate(`/purchase/orders/${row.poNo}`);
    } else if (key === 'grn') {
      navigate(`/purchase/logistics/grn`);
    } else if (key === 'invoice') {
      navigate(`/purchase/invoices/${row.invoiceId}`);
    } else if (key === 'create-invoice') {
      const firstGrn = String(row.grnNo || '').split(',').map((s) => s.trim()).filter(Boolean)[0] || '';
      navigate(`/purchase/invoices/new?grn=${encodeURIComponent(firstGrn)}&po=${encodeURIComponent(row.poNo)}`);
    } else if (key === 'override') {
      openOverrideModal(row, 'override');
    } else if (key === 'reject') {
      openOverrideModal(row, 'reject');
    } else if (key === 'approveException') {
      openOverrideModal(row, 'approveException');
    } else if (key === 'rematch') {
      handleRematch(row);
    }
  }, [navigate, toggleExpanded]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Cell Renderers                                                   */
  /* ═══════════════════════════════════════════════════════════════════ */

  const renderers = useMemo(() => ({
    poNo: (row) => (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => toggleExpanded(row.poNo)}
          className="text-slate-400 hover:text-[#0B4A3D] transition-colors cursor-pointer"
          aria-label={expanded.has(row.poNo) ? 'Collapse match details' : 'Expand match details'}
        >
          {expanded.has(row.poNo) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/purchase/orders/${row.poNo}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.poNo}
        </button>
        <div className="text-[11px] text-slate-400">
          {row.invoiceNo || 'no invoice'}
        </div>
      </div>
    ),
    vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor}</span>,
    grnCount: (row) =>
      row.grnReceived ? (
        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-xs">
          <CheckCircle2 className="w-3.5 h-3.5" aria-label="GRN received" />
          {row.grnCount}
        </span>
      ) : (
        <span className="text-slate-300">—</span>
      ),
    orderQty: (row) => <span className="text-slate-600 tabular-nums">{row.orderQty}</span>,
    grnQty: (row) => <span className="text-slate-600 tabular-nums">{row.grnQty || '—'}</span>,
    invoiceQty: (row) => (
      <span className="text-slate-600 tabular-nums">{row.invoiceQty || '—'}</span>
    ),
    qtyVariance: (row) => {
      if (!row.invoiceQty) return <span className="text-slate-300">—</span>;
      const v = row.qtyVariance;
      return (
        <span className={`tabular-nums font-bold ${v === 0 ? 'text-emerald-600' : v > 0 ? 'text-rose-600' : 'text-amber-600'}`}>
          {v > 0 ? `+${v}` : v}
        </span>
      );
    },
    orderAmount: (row) => (
      <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.orderAmount)}</span>
    ),
    invoiceAmount: (row) => (
      <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">
        {row.invoiceAmount != null ? formatAmount(row.invoiceAmount) : '—'}
      </span>
    ),
    valueVariance: (row) => {
      if (row.invoiceAmount == null) return <span className="text-slate-300">—</span>;
      const v = row.valueVariance;
      const pct = row.orderAmount ? ((v / row.orderAmount) * 100).toFixed(1) : '0';
      return (
        <span className={`tabular-nums font-bold ${Math.abs(v) <= 0.01 ? 'text-emerald-600' : v > 0 ? 'text-rose-600' : 'text-amber-600'}`}>
          {v > 0 ? '+' : ''}{formatAmount(v)}
          <span className="text-[10px] ml-1 opacity-60">({pct}%)</span>
        </span>
      );
    },
    status: (row) => (
      <div>
        <StatusPill status={row.matchStatus} />
        {row.overrideReason && (
          <div className="text-[10px] font-semibold text-sky-600 mt-0.5 max-w-[160px] truncate" title={row.overrideReason}>
            Override: {row.overrideReason}
          </div>
        )}
        {!row.overrideReason && row.matchReasons.length > 0 && (
          <div
            className="text-[10px] font-semibold text-slate-400 mt-0.5 max-w-[160px] truncate"
            title={row.matchReasons.join('\n')}
          >
            {row.matchReasons[0]}
          </div>
        )}
      </div>
    ),
  }), [expanded, navigate, toggleExpanded]);

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Expanded Row — Detailed PO / GRN / Invoice Comparison             */
  /* ═══════════════════════════════════════════════════════════════════ */

  const renderExpandedRow = (row) => {
    if (!expanded.has(row.poNo)) return null;
    return (
      <ExpandedDetail row={row} navigate={navigate} />
    );
  };

  /* ═══════════════════════════════════════════════════════════════════ */
  /*  Render                                                           */
  /* ═══════════════════════════════════════════════════════════════════ */

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Three Way Matching' }
        ],
        icon: Scale,
        title: 'Three Way Matching',
        subtitle: 'Reconcile purchase order, goods receipt and vendor invoice',
        actions: (
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={12} /> Refresh
          </button>
        )
      }}
      flowNav={<ModuleTabNav module="invoices" />}
      error={error}
      errorMessage="Failed to load matching data."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { label: 'All Orders', count: rows.length, active: matchFilter === 'all', onSelect: () => { selectToken('all'); setSelectedIds([]); } },
        segments: {
          tabs: [
            { key: 'all', label: 'All', count: rows.length },
            { key: MATCH_STATUS.MATCHED, label: 'Matched', count: stats.matched },
            { key: MATCH_STATUS.PARTIAL, label: 'Partially Matched', count: stats.partial },
            { key: MATCH_STATUS.MISMATCH, label: 'Mismatches', count: stats.mismatch },
            { key: MATCH_STATUS.PENDING, label: 'Pending', count: stats.pending },
            { key: MATCH_STATUS.EXCEPTION, label: 'Exceptions', count: stats.exception }
          ],
          activeKey: matchFilter,
          onSelect: (status) => { selectToken(status); setSelectedIds([]); },
          ariaLabel: 'Match status'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            {(query || matchFilter !== 'all') && (
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
              id="threeWaySearchInput"
              placeholder="Search by PO, vendor, invoice, GRN..."
              value={query}
              onChange={setQuery}
              label="Search Three Way Matching"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['poNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [
          { key: 'export', label: 'Export Selected', icon: Download },
          { key: 'rematch', label: 'Re-match Selected', icon: RotateCcw },
          { key: 'resolve', label: 'Resolve Exception', icon: ShieldCheck },
        ],
        onAction: async (key) => {
          if (key === 'export') {
            const selected = filtered.filter((r) => selectedIds.includes(r.poNo));
            exportCsv(COLUMNS.filter((c) => c.key !== 'actions'), selected, 'three-way-matching-selected');
            toast.success(`${selected.length} records exported`);
          } else if (key === 'rematch') {
            if (!canMatch) { toast.error('Your Purchase access does not allow running the three-way match.'); return; }
            const eligible = filtered.filter((r) => selectedIds.includes(r.poNo) && r.invoiceId);
            if (eligible.length === 0) { toast.info('No eligible records selected'); return; }
            let count = 0;
            for (const row of eligible) {
              try { await invoiceService.rematchInvoice(row.invoiceId); count++; } catch { /* skip failed */ }
            }
            toast.success(`${count} match(es) re-computed`);
            setSelectedIds([]);
            refresh();
          } else if (key === 'resolve') {
            const eligible = filtered.filter((r) => selectedIds.includes(r.poNo) && r.matchStatus === MATCH_STATUS.EXCEPTION && r.invoiceId);
            if (eligible.length === 0) { toast.info('No excepted records selected'); return; }
            openOverrideModal(eligible[0], 'approveException');
          }
        },
        id: 'matchingBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: filtered,
        loading,
        selectable: true,
        selectedIds,
        allSelected: filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.poNo)),
        someSelected: selectedIds.length > 0 && !(filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.poNo))),
        onSelectAll: (checked) => setSelectedIds(checked ? filtered.map((row) => row.poNo) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        rowActions: tableRowActions,
        onRowAction: handleRowAction,
        idColumn: 'poNo',
        getRowId: (row) => row.poNo,
        tableId: 'threeWayMatchingTable',
        rowClass: (row) => pendingWorkClass(isMatchPending(row)),
        alignCenter: ['grnCount', 'status'],
        alignRight: ['orderQty', 'grnQty', 'invoiceQty', 'qtyVariance', 'orderAmount', 'invoiceAmount', 'valueVariance'],
        renderExpandedRow,
        emptyContent: (
          query ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Orders"
              message="No purchase orders matching your search criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(''); selectToken('all'); setSelectedIds([]); }}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : matchFilter !== 'all' ? (
            <PurchaseEmptyState
              icon={LayoutList}
              title={`No ${activeMatchLabel || 'Matched'} Records`}
              message={`No purchase orders currently have a "${activeMatchLabel || matchFilter}" match status.`}
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => selectToken('all')}>
                  <X size={12} /> Show All Orders
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={LayoutList}
              title="Nothing to Reconcile"
              message="No purchase orders found to reconcile."
            />
          )
        )
      }}
    >
      {/* ── Tolerance Info Banner ── */}
      <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 flex items-center gap-2.5">
        <Scale className="w-4 h-4 text-sky-600 shrink-0" />
        <p className="text-xs font-semibold text-sky-700">
          Tolerance of ±{MATCH_TOLERANCE_PCT}% applies to the invoice total vs PO value.
          Line-level price / tax / quantity mismatches are flagged at any variance — an invoice line
          differing from the PO rate or GRN quantity fails the match even when the total is within tolerance.
          Every override produces an audit entry.
        </p>
      </div>

      {/* ── Override / Reject / Approve Exception Modal ── */}
      <Modal
        open={overrideModal !== null}
        onClose={() => setOverrideModal(null)}
        title={
          overrideModal?.action === 'reject' ? `Reject Invoice — ${overrideModal?.row?.poNo}`
          : overrideModal?.action === 'approveException' ? `Approve Exception — ${overrideModal?.row?.poNo}`
          : `Resolve Mismatch — ${overrideModal?.row?.poNo}`
        }
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOverrideModal(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmOverride}
              disabled={actionLoading || !overrideReason.trim()}
              className={
                overrideModal?.action === 'reject'
                  ? 'po-btn po-btn-danger disabled:opacity-50 disabled:cursor-not-allowed'
                  : 'po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed'
              }
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {overrideModal?.action === 'reject' ? 'Reject' : 'Confirm'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Current match reasons */}
          {overrideModal?.row?.matchReasons?.length > 0 && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500 mb-1.5">Current Mismatch Reasons</p>
              {overrideModal.row.matchReasons.map((reason, i) => (
                <p key={i} className="text-xs font-semibold text-rose-600 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  {reason}
                </p>
              ))}
            </div>
          )}

          {/* Override status (for override action) */}
          {overrideModal?.action === 'override' && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Set Match Status
              </label>
              <div className="flex gap-2">
                {[
                  { value: MATCH_STATUS.MATCHED, label: 'Matched', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
                  { value: MATCH_STATUS.PENDING, label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-300' }
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setOverrideStatus(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                      overrideStatus === opt.value ? opt.color : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Resolved field (optional) */}
          {overrideModal?.action === 'override' && (
            <TextInput
              label="Resolved Field (optional)"
              value={resolvedField}
              onChange={(e) => setResolvedField(e.target.value)}
              placeholder="e.g. quantity, unit price, tax rate"
            />
          )}

          {/* Tolerance (optional) */}
          {overrideModal?.action === 'override' && (
            <TextInput
              label="Tolerance Applied (optional)"
              value={tolerance}
              onChange={(e) => setTolerance(e.target.value)}
              placeholder="e.g. within 5% vendor agreement"
            />
          )}

          {/* Reason (required) */}
          <TextArea
            label={overrideModal?.action === 'reject' ? 'Rejection Reason *' : 'Override Reason *'}
            rows={3}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder={
              overrideModal?.action === 'reject'
                ? 'Explain why this invoice is being rejected...'
                : 'Explain why this mismatch is being overridden...'
            }
          />
          {!overrideReason.trim() && (
            <p className="text-[11px] text-rose-500 font-semibold">Reason is required for audit trail</p>
          )}

          {/* Audit note */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Audit Trail</p>
            <p className="text-xs text-slate-600 mt-0.5">
              This action will be recorded with your user name, timestamp and reason in the invoice audit history.
            </p>
          </div>
        </div>
      </Modal>

      {/* ── Re-match Confirmation Dialog ── */}
      <ConfirmDialog
        open={confirmDialog !== null}
        title={confirmDialog?.title || ''}
        message={confirmDialog?.message || ''}
        confirmLabel="Re-run Match"
        variant="default"
        icon={RotateCcw}
        loading={actionLoading}
        onConfirm={confirmDialogAction}
        onCancel={() => setConfirmDialog(null)}
      />
    </PurchaseListPage>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  StatusPill                                                        */
/* ═══════════════════════════════════════════════════════════════════ */

function StatusPill({ status }) {
  const labels = {
    [MATCH_STATUS.MATCHED]: 'Matched',
    [MATCH_STATUS.PARTIAL]: 'Partially Matched',
    [MATCH_STATUS.MISMATCH]: 'Mismatch',
    [MATCH_STATUS.EXCEPTION]: 'Exception',
    [MATCH_STATUS.PENDING]: 'Pending Match'
  };
  /* Shared status pill — the same cpr-status-cell renderer every other
     Purchase list uses, so the match state always shows the same tone
     (green = matched, orange = pending, red = mismatch/exception). */
  return <PurchaseStatusCell status={labels[status] || 'Pending Match'} />;
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  ExpandedDetail — Per-line PO / GRN / Invoice Comparison Table     */
/* ═══════════════════════════════════════════════════════════════════ */

function ExpandedDetail({ row }) {
  const tolerance = MATCH_TOLERANCE_PCT / 100;

  /* Build per-product comparison */
  const productMap = new Map();

  /* PO items */
  (row.poItems || []).forEach((item) => {
    const key = String(item.product || '').trim().toLowerCase();
    if (!key) return;
    productMap.set(key, {
      product: item.product,
      poQty: Number(item.qty) || 0,
      poRate: Number(item.rate) || 0,
      poGst: Number(item.gstRate) || 0,
      poTotal: (Number(item.qty) || 0) * (Number(item.rate) || 0),
      grnQty: 0,
      invoiceQty: 0,
      invoiceRate: 0,
      invoiceGst: 0,
      invoiceTotal: 0
    });
  });

  /* GRN items */
  (row.grnItems || []).forEach((item) => {
    const key = String(item.product || '').trim().toLowerCase();
    if (!productMap.has(key)) {
      productMap.set(key, {
        product: item.product, poQty: 0, poRate: 0, poGst: 0, poTotal: 0,
        grnQty: 0, invoiceQty: 0, invoiceRate: 0, invoiceGst: 0, invoiceTotal: 0
      });
    }
    productMap.get(key).grnQty += Number(item.received) || 0;
  });

  /* Invoice items */
  (row.invoiceItems || []).forEach((item) => {
    const key = String(item.product || '').trim().toLowerCase();
    if (!productMap.has(key)) {
      productMap.set(key, {
        product: item.product, poQty: 0, poRate: 0, poGst: 0, poTotal: 0,
        grnQty: 0, invoiceQty: 0, invoiceRate: 0, invoiceGst: 0, invoiceTotal: 0
      });
    }
    const entry = productMap.get(key);
    entry.invoiceQty = Number(item.qty) || 0;
    entry.invoiceRate = Number(item.rate ?? item.price) || 0;
    entry.invoiceGst = Number(item.gst ?? item.gstRate) || 0;
    entry.invoiceTotal = entry.invoiceQty * entry.invoiceRate;
  });

  const lines = Array.from(productMap.values());

  /* Mismatch reasons */
  const reasons = row.matchReasons || [];

  const hasOverride = Boolean(row.overrideReason);

  return (
    <div className="px-4 py-3 bg-slate-50/60">
      {/* ── Status Summary ── */}
      <div className="flex items-center gap-3 mb-3">
        <StatusPill status={row.matchStatus} />
        {hasOverride && (
          <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
            Overridden by {row.overrideBy} — {new Date(row.overrideAt).toLocaleDateString('en-IN')}
          </span>
        )}
      </div>

      {/* ── Mismatch Reasons ── */}
      {reasons.length > 0 ? (
        <div className="mb-3 space-y-1.5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-500">Mismatch Reasons & Variances</p>
          {reasons.map((reason, index) => (
            <p key={index} className="text-xs font-semibold text-rose-600 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
              {reason}
            </p>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          No mismatches — invoice aligns with the purchase order and goods receipt.
        </p>
      )}

      {/* ── Aggregate Comparison ── */}
      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Purchase Order</p>
          <p className="text-xs font-semibold text-slate-700">{row.poNo}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Qty: {row.orderQty} · Value: {formatAmount(row.orderAmount)}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Goods Receipt</p>
          <p className="text-xs font-semibold text-slate-700">{row.grnNo || 'No GRN'}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Qty: {row.grnQty}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Vendor Invoice</p>
          <p className="text-xs font-semibold text-slate-700">{row.invoiceNo || 'No Invoice'}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Qty: {row.invoiceQty} · Value: {row.invoiceAmount != null ? formatAmount(row.invoiceAmount) : '—'}</p>
        </div>
      </div>

      {/* ── Variance Summary ── */}
      {row.invoiceAmount != null && (
        <div className="flex items-center gap-4 mb-3 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Qty Variance:</span>
            <span className={`font-bold ${row.qtyVariance === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              {row.qtyVariance > 0 ? '+' : ''}{row.qtyVariance}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Value Variance:</span>
            <span className={`font-bold ${Math.abs(row.valueVariance) <= row.orderAmount * tolerance ? 'text-emerald-600' : 'text-rose-600'}`}>
              {row.valueVariance > 0 ? '+' : ''}{formatAmount(row.valueVariance)}
              ({((row.valueVariance / (row.orderAmount || 1)) * 100).toFixed(1)}%)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Tolerance:</span>
            <span className="font-semibold text-slate-600">±{MATCH_TOLERANCE_PCT}%</span>
          </div>
        </div>
      )}

      {/* ── Per-Line Comparison Table ── */}
      {lines.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <th className="px-3 py-2">Product / Item</th>
                <th className="px-3 py-2 text-right">PO Qty</th>
                <th className="px-3 py-2 text-right">GRN Qty</th>
                <th className="px-3 py-2 text-right">Inv Qty</th>
                <th className="px-3 py-2 text-right">Qty Var</th>
                <th className="px-3 py-2 text-right">PO Rate</th>
                <th className="px-3 py-2 text-right">Inv Rate</th>
                <th className="px-3 py-2 text-right">Rate Var</th>
                <th className="px-3 py-2 text-right">PO Tax</th>
                <th className="px-3 py-2 text-right">Inv Tax</th>
                <th className="px-3 py-2 text-right">PO Total</th>
                <th className="px-3 py-2 text-right">Inv Total</th>
                <th className="px-3 py-2 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, index) => {
                const qtyVar = line.invoiceQty - line.poQty;
                const rateVar = line.invoiceRate - line.poRate;

                const lineMatched = line.poQty > 0
                  ? line.invoiceQty === line.poQty
                    && Math.abs(line.invoiceRate - line.poRate) <= 0.001
                    && Math.abs(line.invoiceGst - line.poGst) <= 0.001
                  : true;
                return (
                  <tr key={index} className="border-t border-slate-100 hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-semibold text-slate-700">{line.product}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.poQty}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.grnQty || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.invoiceQty || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={`font-bold ${qtyVar === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {line.invoiceQty ? (qtyVar > 0 ? `+${qtyVar}` : qtyVar) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{formatAmount(line.poRate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.invoiceRate ? formatAmount(line.invoiceRate) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <span className={`font-bold ${Math.abs(rateVar) <= 0.001 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {line.invoiceRate ? (rateVar > 0 ? '+' : '') + formatAmount(rateVar) : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.poGst ? `${line.poGst}%` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">{line.invoiceGst ? `${line.invoiceGst}%` : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">{formatAmount(line.poTotal)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-700">{line.invoiceTotal ? formatAmount(line.invoiceTotal) : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      {lineMatched ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 inline" aria-label="Line matched" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-rose-500 inline" aria-label="Line mismatch" />
                      )}
                    </td>
                  </tr>
                );
              })}
              {/* Total row */}
              {lines.length > 1 && (
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold">
                  <td className="px-3 py-2 text-slate-700">TOTAL</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{lines.reduce((s, l) => s + l.poQty, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{lines.reduce((s, l) => s + l.grnQty, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{lines.reduce((s, l) => s + l.invoiceQty, 0)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {(() => {
                      const totalQtyVar = lines.reduce((s, l) => s + l.invoiceQty, 0) - lines.reduce((s, l) => s + l.poQty, 0);
                      return <span className={`font-bold ${totalQtyVar === 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{totalQtyVar > 0 ? `+${totalQtyVar}` : totalQtyVar}</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatAmount(lines.reduce((s, l) => s + l.poTotal, 0))}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatAmount(lines.reduce((s, l) => s + l.invoiceTotal, 0))}</td>
                  <td className="px-3 py-2" />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Audit Trail Preview (last 3 entries) ── */}
      {row.auditHistory?.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Recent Audit Trail</p>
          <div className="space-y-1">
            {row.auditHistory.slice(-3).reverse().map((entry, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">{entry.action}</span>
                <span>by {entry.actor}</span>
                <span className="text-slate-400">·</span>
                <span>{new Date(entry.timestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                {entry.details?.reason && <span className="text-slate-400 italic truncate max-w-[200px]">— {entry.details.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
