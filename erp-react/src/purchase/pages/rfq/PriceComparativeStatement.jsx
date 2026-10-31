/**
 * purchase/pages/rfq/PriceComparativeStatement.jsx
 * ------------------------------------------------------------------
 * Price Comparative Statement — RFQ-level LIST page.
 * Shows all eligible RFQs in a proper ERP data table using the shared
 * PurchaseListPage layout (same as RFQ List).
 *
 * Route: /purchase/rfq/price-comparative-statement
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3, CheckCircle2, ClipboardList, Clock3, Download, Eye,
  FileText, IndianRupee, Scale, ShieldCheck, Trophy, X
} from 'lucide-react';
import RfqTabNav from '../../components/RfqTabNav';
import PurchaseStatusCell from '../../components/list/PurchaseStatusCell';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
} from '../../components/list';
import { ConfirmDialog } from '../../components/ui';
import { PCS_COLUMNS } from '../../constants';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
import { formatAmount } from '../../utils/purchase';
import { exportCsv, exportExcel } from '../../utils/export';
import '../../styles/cpr-list.css';

/* ─── KPI definitions ─── */
const KPI_DEFS = [
  { key: 'total', label: 'Total PCS', icon: ClipboardList, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'evaluation', label: 'Pending Evaluation', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'awarded', label: 'Awarded', icon: Trophy, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'pending', label: 'Pending Approval', icon: CheckCircle2, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'value', label: 'Total Quoted Value', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', currency: true },
];

/* ─── Status filter labels ─── */
const FILTER_TABS = [
  { key: 'all', label: 'All RFQs' },
  { key: 'Evaluation', label: 'Evaluation' },
  { key: 'Awarded', label: 'Awarded' },
  { key: 'Quotation Received', label: 'Pending Approval' },
];

/* ─── Status-aware action eligibility ─── */
const STATUS_ELIGIBILITY = {
  compare: { Evaluation: true, 'Quotation Received': true, Sent: true },
  approval: { 'Quotation Received': true, Sent: true },
  award: { Evaluation: true },
};

function getBulkActions(selectedRows) {
  if (selectedRows.length === 0) return { primary: [], secondary: [], warning: null };

  const statuses = [...new Set(selectedRows.map((r) => r.status))];
  const hasMultipleStatuses = statuses.length > 1;
  const count = selectedRows.length;

  const primary = [];
  const secondary = [];

  /* Export — always available */
  primary.push({ key: 'export', label: 'Export', icon: Download });

  /* Compare Selected — needs 2+ compatible rows */
  const canCompare = count >= 2 && selectedRows.every((r) => STATUS_ELIGIBILITY.compare[r.status]);
  secondary.push({
    key: 'compare',
    label: 'Compare Selected',
    icon: Scale,
    disabled: !canCompare,
    tooltip: !canCompare
      ? count < 2
        ? 'Select at least 2 records to compare'
        : 'Selected records have incompatible statuses for comparison'
      : undefined,
  });

  /* Proceed to Technical Evaluation */
  const canProceedToTechEval = count >= 1 && selectedRows.every((r) => STATUS_ELIGIBILITY.approval[r.status]);
  secondary.push({
    key: 'tech-eval',
    label: 'Proceed to Technical Evaluation',
    icon: ShieldCheck,
    disabled: !canProceedToTechEval,
    tooltip: !canProceedToTechEval
      ? 'Selected records are not eligible for technical evaluation'
      : undefined,
  });

  /* Award Selected */
  const canAward = count >= 1 && selectedRows.every((r) => STATUS_ELIGIBILITY.award[r.status]);
  secondary.push({
    key: 'award',
    label: 'Award Selected',
    icon: Trophy,
    disabled: !canAward,
    tooltip: !canAward
      ? selectedRows.every((r) => r.status === 'Awarded')
        ? 'Selected records are already awarded'
        : 'Only records in Evaluation status can be awarded'
      : undefined,
  });

  let warning = null;
  if (hasMultipleStatuses) {
    const eligibleActions = [];
    if (canCompare) eligibleActions.push('Compare');
    if (canProceedToTechEval) eligibleActions.push('Tech Eval');
    if (canAward) eligibleActions.push('Award');
    if (eligibleActions.length === 0) {
      warning = 'Selected records have different workflow statuses. Only Export is available.';
    } else {
      warning = `Selected records have different workflow statuses. Only ${eligibleActions.join(', ')} and Export are available.`;
    }
  }

  return { primary, secondary, warning };
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function PriceComparativeStatement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /* Deep link — Final Negotiation / the negotiation workspace / an approval
     note hand off to a single statement with the RFQ's id in ?rfq=. Only the
     detail route renders one RFQ, so honour the hand-off instead of dropping
     the user on the RFQ picker. */
  const rfqParam = searchParams.get('rfq');

  /* ─── State ─── */
  const [rfqs, setRfqs] = useState([]);
  const [comparisons, setComparisons] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [activeKpi, setActiveKpi] = useState('total');
  const [refreshKey, setRefreshKey] = useState(0);
  const [columns, setColumns] = useState(PCS_COLUMNS);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMessage, setActionMessage] = useState(null);
  /* Award confirmation target — the RFQ rows awaiting an explicit Confirm.
     Nothing is written until the dialog is confirmed, so Cancel is a true
     no-op (matches the app's delete/approve/reject confirmation pattern). */
  const [awardTarget, setAwardTarget] = useState(null);
  /* In-flight guard — a second click must not post a second award. */
  const awardingRef = useRef(false);

  /* ─── Load eligible RFQs ─── */
  useEffect(() => {
    let cancelled = false;

    const loadRfqs = async () => {
      try {
        const result = await rfqService.getRfqs({ page: 1, pageSize: 200 });
        if (cancelled) return;

        const eligible = (result.data || []).filter(
          (rfq) => (rfq.quotationReceived || 0) > 0
            || rfq.status === 'Quotation Received'
            || rfq.status === 'Evaluation'
            || rfq.status === 'Awarded'
        );

        setRfqs(eligible);

        /* Load comparison data in parallel */
        const comparisonPromises = eligible.map(async (rfq) => {
          try {
            const comp = await rfqService.getQuotationComparison(rfq.id);
            return { id: rfq.id, comparison: comp };
          } catch {
            return { id: rfq.id, comparison: null };
          }
        });

        const results = await Promise.all(comparisonPromises);
        if (cancelled) return;

        const compMap = {};
        results.forEach(({ id, comparison }) => { compMap[id] = comparison; });
        setComparisons(compMap);
      } catch (err) {
        if (!cancelled) setError(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRfqs();
    return () => { cancelled = true; };
  }, [refreshKey]);

  /* ─── Stats ─── */
  const stats = useMemo(() => {
    let evaluation = 0;
    let awarded = 0;
    let pending = 0;
    let totalValue = 0;

    rfqs.forEach((rfq) => {
      if (rfq.status === 'Evaluation') evaluation += 1;
      else if (rfq.status === 'Awarded') awarded += 1;
      else if (rfq.status === 'Quotation Received') pending += 1;

      const comp = comparisons[rfq.id];
      const est = comp?.estimatedValue
        || rfq.items?.reduce(
          (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate ?? item.expectedRate) || 0),
          0
        ) || 0;
      totalValue += est;
    });

    return { total: rfqs.length, evaluation, awarded, pending, value: totalValue };
  }, [rfqs, comparisons]);

  const kpiCards = useMemo(
    () => KPI_DEFS.map((def) => ({
      ...def,
      value: def.currency ? formatAmount(stats[def.key], 'INR') : stats[def.key],
    })),
    [stats]
  );

  /* ─── Column visibility ─── */
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible !== false),
    [columns]
  );

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  };

  const showAllColumns = () => setColumns((prev) => prev.map((c) => ({ ...c, visible: true })));
  const hideAllColumns = () => setColumns((prev) => prev.map((c) => ({
    ...c,
    visible: ['rfqNo', 'actions'].includes(c.key),
  })));

  /* ─── Filtered list ─── */
  const filteredRfqs = useMemo(() => {
    let rows = rfqs;
    const q = searchInput.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (rfq) =>
          rfq.rfqNo.toLowerCase().includes(q)
          || (rfq.title || '').toLowerCase().includes(q)
          || (rfq.reference || '').toLowerCase().includes(q)
      );
    }
    if (filterStatus !== 'all') {
      rows = rows.filter((rfq) => rfq.status === filterStatus);
    }
    return rows;
  }, [rfqs, searchInput, filterStatus]);

  /* ─── Selected rows data ─── */
  const selectedRows = useMemo(
    () => rfqs.filter((rfq) => selectedIds.includes(rfq.id)),
    [rfqs, selectedIds]
  );

  /* ─── Status-aware bulk actions ─── */
  const bulkConfig = useMemo(() => getBulkActions(selectedRows), [selectedRows]);

  /* ─── KPI select ─── */
  const selectKpi = useCallback((key) => {
    setActiveKpi(key);
    if (key === 'total') setFilterStatus('all');
    else if (key === 'evaluation') setFilterStatus('Evaluation');
    else if (key === 'awarded') setFilterStatus('Awarded');
    else if (key === 'pending') setFilterStatus('Quotation Received');
  }, []);

  /* ─── Row actions ─── */
  const buildRowActions = useCallback((row) => {
    const actions = [
      { key: 'view-pcs', label: 'View PCS', icon: Eye },
      { key: 'view-rfq', label: 'View RFQ', icon: FileText },
    ];
    if (row.status === 'Evaluation') {
      actions.push({ key: 'award', label: 'Award', icon: Trophy });
    }
    return actions;
  }, []);

  /* ─── Award ─── */
  /* The award is the RFQ-level transition owned by the RFQ service
     (POST /rfqs/{id}/award). The awarded supplier is the STORED supplier
     selection on the RFQ's evaluation record — never the recommended or
     lowest quote, which is only a suggestion. A selection that was never
     stored is refused here the same way the service refuses it, so the
     button can never report an award that did not happen. */
  const resolveSelectedVendor = useCallback(async (rfq) => {
    const evaluation = await evaluationService.getEvaluation(rfq.id);
    const selection = evaluation?.selection || null;
    if (!selection) return '';
    if (selection.selectedVendor) return selection.selectedVendor;
    /* Split award — the RFQ records ONE awarded supplier, the primary
       (largest value share), which is the service's own award rule. */
    const allocations = Array.isArray(selection.allocations) ? selection.allocations : [];
    const share = {};
    allocations.forEach((allocation) => {
      share[allocation.vendor] = (share[allocation.vendor] || 0) + (Number(allocation.lineTotal) || 0);
    });
    return Object.entries(share).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  }, []);

  const handleAward = useCallback(async (rows) => {
    /* Ref guard as well as the render flag: a second click in the same
       tick must not post a second award. */
    if (awardingRef.current || rows.length === 0) return;
    awardingRef.current = true;
    const awarded = [];
    const failed = [];
    try {
      /* Sequential — one RFQ per call, so a refusal never hides behind a
         batch and the message names the RFQ that failed. */
      for (const rfq of rows) {
        let vendor = '';
        try {
          vendor = await resolveSelectedVendor(rfq);
        } catch {
          vendor = '';
        }
        if (!vendor) {
          failed.push(`Complete the supplier selection for ${rfq.rfqNo} before awarding.`);
          continue;
        }
        try {
          await rfqService.awardRfq(rfq.id, vendor);
          awarded.push(`${rfq.rfqNo} awarded to ${vendor}`);
        } catch (err) {
          failed.push(err?.message || `Failed to award ${rfq.rfqNo}`);
        }
      }
      if (awarded.length > 0) {
        setSelectedIds([]);
        /* Re-read — the RFQ status, the KPI counts and the row's own
           actions all change with the award. */
        setLoading(true);
        setRefreshKey((key) => key + 1);
      }
      /* The success line is only ever built from awards the backend
         confirmed; every refusal keeps its real message. */
      if (failed.length === 0) {
        setActionMessage({ type: 'success', text: awarded.join(' · ') });
      } else {
        setActionMessage({ type: 'error', text: failed.join(' ') });
      }
      setTimeout(() => setActionMessage(null), 6000);
    } finally {
      awardingRef.current = false;
    }
  }, [resolveSelectedVendor]);

  const handleRowAction = useCallback((key, row) => {
    if (key === 'view-pcs') navigate(`/purchase/rfq/price-comparative-statement/${row.id}`);
    else if (key === 'view-rfq') navigate(`/purchase/rfq/${row.id}`);
    else if (key === 'award') {
      setAwardTarget([row]);
    }
  }, [navigate]);

  /* ─── Selection helpers ─── */
  const allSelected = filteredRfqs.length > 0 && filteredRfqs.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback((checked) => {
    setSelectedIds(checked ? filteredRfqs.map((row) => row.id) : []);
  }, [filteredRfqs]);

  const handleToggleRow = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  /* Clear selection when search/filter changes */
  useEffect(() => {
    const timer = setTimeout(() => setSelectedIds([]), 0);
    return () => clearTimeout(timer);
  }, [searchInput, filterStatus]);

  /* ─── Cell renderers ─── */
  const renderCell = useMemo(() => ({
    sNo: (_row) => {
      const idx = filteredRfqs.findIndex((r) => r.id === _row.id);
      return <span className="tabular-nums text-slate-400">{idx + 1}</span>;
    },
    rfqNo: (row) => (
      <a
        href={`/purchase/rfq/price-comparative-statement/${row.id}`}
        onClick={(e) => {
          e.preventDefault();
          navigate(`/purchase/rfq/price-comparative-statement/${row.id}`);
        }}
      >
        {row.rfqNo}
      </a>
    ),
    prNo: (row) => (
      <span className="cpr-cell-muted">{row.reference || '—'}</span>
    ),
    description: (row) => (
      <span className="cpr-cell-truncate" title={row.title}>{row.title || '—'}</span>
    ),
    status: (row) => (
      <PurchaseStatusCell status={row.status} />
    ),
    quotes: (row) => {
      const comp = comparisons[row.id];
      const count = comp?.quotes?.length || row.quotationReceived || 0;
      return (
        <span className="cpr-count-chip">
          {count} Quote{count !== 1 ? 's' : ''}
        </span>
      );
    },
  }), [navigate, comparisons, filteredRfqs]);

  const MANDATORY_COLUMNS = ['rfqNo', 'actions'];

  const refreshPage = () => { setLoading(true); setRefreshKey((k) => k + 1); };

  /* ─── Export ─── */
  const handleExport = useCallback(async (type, rows) => {
    const data = rows || filteredRfqs;
    if (data.length === 0) return;
    const exportData = data.map((rfq, index) => {
      const comp = comparisons[rfq.id];
      const count = comp?.quotes?.length || rfq.quotationReceived || 0;
      return {
        'S.No': index + 1,
        'RFQ Number': rfq.rfqNo,
        'PR Number': rfq.reference || '—',
        'Description': rfq.title || '',
        'Status': rfq.status || '',
        'Quotes': count,
      };
    });
    const cols = Object.keys(exportData[0] || {}).map((key) => ({ key, label: key, visible: true }));
    if (type === 'excel') await exportExcel(cols, exportData, 'pcs-list');
    else exportCsv(cols, exportData, 'pcs-list');
  }, [filteredRfqs, comparisons]);

  /* ─── Bulk action handler ─── */
  const handleBulkAction = useCallback((key) => {
    if (key === 'export') {
      handleExport('csv', selectedRows);
      setActionMessage({ type: 'success', text: `Exported ${selectedRows.length} record${selectedRows.length !== 1 ? 's' : ''}.` });
      setTimeout(() => setActionMessage(null), 3000);
    } else if (key === 'compare') {
      if (selectedRows.length < 2) {
        setActionMessage({ type: 'error', text: 'Select at least 2 records to compare.' });
        setTimeout(() => setActionMessage(null), 3000);
        return;
      }
      const incompatible = selectedRows.filter((r) => !STATUS_ELIGIBILITY.compare[r.status]);
      if (incompatible.length > 0) {
        setActionMessage({
          type: 'error',
          text: `Cannot compare: ${incompatible.map((r) => r.rfqNo).join(', ')} have incompatible statuses.`,
        });
        setTimeout(() => setActionMessage(null), 4000);
        return;
      }
      setActionMessage({ type: 'success', text: `Comparing ${selectedRows.length} records.` });
      setTimeout(() => setActionMessage(null), 3000);
    } else if (key === 'tech-eval') {
      const ineligible = selectedRows.filter((r) => !STATUS_ELIGIBILITY.approval[r.status]);
      if (ineligible.length > 0) {
        setActionMessage({
          type: 'error',
          text: `Cannot proceed: ${ineligible.map((r) => r.rfqNo).join(', ')} are not eligible.`,
        });
        setTimeout(() => setActionMessage(null), 4000);
        return;
      }
      /* Navigate to Technical Evaluation for the first selected RFQ */
      if (selectedRows.length === 1) {
        navigate(`/purchase/rfq/technical-evaluation/${selectedRows[0].id}`);
      } else {
        navigate('/purchase/rfq/technical-evaluation');
      }
    } else if (key === 'award') {
      const ineligible = selectedRows.filter((r) => !STATUS_ELIGIBILITY.award[r.status]);
      if (ineligible.length > 0) {
        const alreadyAwarded = ineligible.filter((r) => r.status === 'Awarded');
        const otherIneligible = ineligible.filter((r) => r.status !== 'Awarded');
        let msg = 'Cannot award: ';
        if (alreadyAwarded.length > 0) msg += `${alreadyAwarded.map((r) => r.rfqNo).join(', ')} already awarded. `;
        if (otherIneligible.length > 0) msg += `${otherIneligible.map((r) => r.rfqNo).join(', ')} not in Evaluation status.`;
        setActionMessage({ type: 'error', text: msg.trim() });
        setTimeout(() => setActionMessage(null), 4000);
        return;
      }
      /* Open the confirmation; the real award runs only on Confirm. */
      setAwardTarget(selectedRows);
    }
  }, [selectedRows, handleExport]);

  if (rfqParam) {
    return <Navigate to={`/purchase/rfq/price-comparative-statement/${rfqParam}`} replace />;
  }

  return (
    <>
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Price Comparative Statement' },
        ],
        icon: BarChart3,
        title: 'Price Comparative Statement',
        subtitle: 'Compare quotations across RFQs and proceed to approval.',
      }}
      flowNav={<RfqTabNav />}
      error={error}
      errorMessage="Failed to load RFQs."
      onRetry={refreshPage}
      kpis={{
        cards: kpiCards,
        activeKey: activeKpi,
        onSelect: selectKpi,
      }}
      tabs={{
        segments: {
          tabs: FILTER_TABS.map((tab) => ({
            key: tab.key,
            label: tab.label,
            count: tab.key === 'all' ? stats.total : rfqs.filter((r) => r.status === tab.key).length,
          })),
          activeKey: filterStatus,
          onSelect: (key) => { setFilterStatus(key); setActiveKpi('total'); },
          ariaLabel: 'PCS status',
        },
      }}
      toolbar={{
        left: (
          <>
            <span className="toolbar-count">
              {loading ? '—' : filteredRfqs.length} RFQ{filteredRfqs.length !== 1 ? 's' : ''}
            </span>
            {(searchInput || filterStatus !== 'all') && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setFilterStatus('all'); setActiveKpi('total'); }}>
                <X size={12} /> Clear
              </button>
            )}
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="pcsSearchInput"
              placeholder="Search RFQ Number, PR, Description…"
              value={searchInput}
              onChange={setSearchInput}
              label="Search PCS"
            />
            <PurchaseExportDropdown buttonLabel="Export PCS" onExport={(type) => handleExport(type)} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={MANDATORY_COLUMNS}
            />
          </>
        ),
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkConfig.primary.filter((a) => !a.disabled),
        moreActions: bulkConfig.secondary.filter((a) => !a.disabled),
        onAction: handleBulkAction,
        id: 'pcsBulkActionBar',
      }}
      table={{
        columns: visibleColumns,
        rows: filteredRfqs,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: handleSelectAll,
        onToggleRow: handleToggleRow,
        renderers: renderCell,
        idColumn: 'rfqNo',
        tableId: 'pcsTable',
        alignCenter: ['status', 'quotes'],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        onRowClick: (row) => navigate(`/purchase/rfq/price-comparative-statement/${row.id}`),
        emptyContent: (
          searchInput || filterStatus !== 'all' ? (
            <div className="cpr-empty">
              <Scale size={48} aria-hidden="true" />
              <h3>No RFQs match your search</h3>
              <p>Try adjusting your search or filters.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setFilterStatus('all'); setActiveKpi('total'); }}>
                <X size={12} /> Clear Filters
              </button>
            </div>
          ) : (
            <div className="cpr-empty">
              <Scale size={48} aria-hidden="true" />
              <h3>No RFQs Available</h3>
              <p>RFQs with received quotations will appear here for price comparison.</p>
            </div>
          )
        ),
      }}
    />

    {/* ── Award confirmation ── */}
    <ConfirmDialog
      open={!!awardTarget}
      title={awardTarget?.length > 1 ? 'Award selected RFQs?' : 'Award RFQ?'}
      message={
        awardTarget?.length > 1
          ? `The stored supplier selection for ${awardTarget.map((r) => r.rfqNo).join(', ')} will be awarded. This marks the RFQ(s) Awarded and records the winning supplier.`
          : `The stored supplier selection for ${awardTarget?.[0]?.rfqNo || 'this RFQ'} will be awarded. This marks the RFQ Awarded and records the winning supplier.`
      }
      confirmLabel="Award"
      variant="success"
      icon={Trophy}
      loading={false}
      onConfirm={() => {
        const rows = awardTarget || [];
        setAwardTarget(null);
        handleAward(rows);
      }}
      onCancel={() => setAwardTarget(null)}
    />

    {/* ── Action feedback toast ── */}
    {actionMessage && (
      <div
        className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-xs font-bold transition-all ${
          actionMessage.type === 'error'
            ? 'bg-rose-600 text-white'
            : 'bg-[#0B4A3D] text-white'
        }`}
      >
        {actionMessage.type === 'error' ? (
          <X size={14} />
        ) : (
          <CheckCircle2 size={14} />
        )}
        {actionMessage.text}
      </div>
    )}

    {/* ── Mixed-status warning banner ── */}
    {selectedIds.length > 0 && bulkConfig.warning && (
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-700 shadow-lg">
          <span className="shrink-0">⚠</span>
          {bulkConfig.warning}
          <button
            type="button"
            onClick={() => setSelectedIds([])}
            className="ml-2 text-amber-600 hover:text-amber-800 underline shrink-0"
          >
            Clear
          </button>
        </div>
      </div>
    )}
    </>
  );
}
