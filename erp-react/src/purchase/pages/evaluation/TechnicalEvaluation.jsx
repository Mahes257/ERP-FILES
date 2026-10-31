/**
 * purchase/pages/evaluation/TechnicalEvaluation.jsx
 * ------------------------------------------------------------------
 * Technical Evaluation — LIST view using PurchaseListPage ERP layout.
 * Evaluates technical compliance of shortlisted vendor quotations.
 * Each vendor quotation is evaluated independently with its own scores
 * and decision (Qualified / Not Qualified).
 *
 * Route: /purchase/rfq/technical-evaluation
 * Workflow: Approval Flow → Technical Evaluation → Purchase Orders
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Clock3, Eye,
  SearchCheck, RefreshCw, X, Users
} from 'lucide-react';
import RfqTabNav from '../../components/RfqTabNav';
import PurchaseStatusCell from '../../components/list/PurchaseStatusCell';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseColumnsDropdown,
} from '../../components/list';
import { TE_COLUMNS } from '../../constants';
import { evaluationService } from '../../services/evaluation';
import { formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

/* ==================== KPI Definitions ==================== */
const KPI_DEFS = [
  { key: 'total', label: 'Total RFQs', icon: ClipboardCheck, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pending', label: 'Pending', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'completed', label: 'Completed', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'locked', label: 'Locked', icon: AlertTriangle, color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
];

/* ==================== Status Helpers ==================== */
/**
 * Data-driven evaluation state derived from per-vendor evaluations.
 * States: pending | in_progress | completed | locked
 */
function evaluationState(item) {
  if (item.steps?.technical) return 'completed';
  if (item.gates?.technical) return 'locked';
  const summary = item.vendorEvalSummary;
  if (summary && summary.evaluated) return 'in_progress';
  return 'pending';
}

const STATE_LABELS = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  locked: 'Locked'
};

const STATE_DOT_TONE = {
  pending: 'orange',
  in_progress: 'blue',
  completed: 'green',
  locked: 'gray'
};

/* ==================== Main Component ==================== */
export default function TechnicalEvaluation() {
  const navigate = useNavigate();

  const [board, setBoard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [filterState, setFilterState] = useState('all');
  const [activeKpi, setActiveKpi] = useState('total');
  const [refreshKey, setRefreshKey] = useState(0);
  const [columns, setColumns] = useState(TE_COLUMNS);
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    let cancelled = false;
    evaluationService.getEvaluationBoard()
      .then((data) => {
        if (!cancelled) {
          setBoard(data || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [refreshKey]);

  /* Stats — data-driven from per-vendor evaluations */
  const stats = useMemo(() => {
    const total = board.length;
    const pending = board.filter((item) => evaluationState(item) === 'pending').length;
    const inProgress = board.filter((item) => evaluationState(item) === 'in_progress').length;
    const completed = board.filter((item) => evaluationState(item) === 'completed').length;
    const locked = board.filter((item) => evaluationState(item) === 'locked').length;
    return { total, pending, in_progress: inProgress, completed, locked };
  }, [board]);

  const kpiCards = useMemo(
    () => KPI_DEFS.map((def) => ({
      ...def,
      value: stats[def.key] ?? 0,
    })),
    [stats]
  );

  /* Filtered list */
  const filtered = useMemo(() => {
    let rows = board;
    const q = searchInput.trim().toLowerCase();
    if (q) {
      rows = rows.filter((item) =>
        item.rfqNo.toLowerCase().includes(q)
        || (item.title || '').toLowerCase().includes(q)
        || (item.vendors || []).some((v) => v.vendor.toLowerCase().includes(q))
      );
    }
    if (filterState !== 'all') {
      rows = rows.filter((item) => evaluationState(item) === filterState);
    }
    return rows.sort((a, b) => (a.rfqNo || '').localeCompare(b.rfqNo || ''));
  }, [board, searchInput, filterState]);

  /* Column visibility helpers */
  const visibleColumns = useMemo(
    () => columns.filter((c) => c.visible !== false),
    [columns]
  );

  const toggleColumn = (key) => {
    setColumns((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  };

  const showAllColumns = () => setColumns((prev) => prev.map((c) => ({ ...c, visible: true })));

  const hideAllColumns = () => setColumns((prev) => prev.map((c) => ({
    ...c,
    visible: ['rfqNo', 'actions'].includes(c.key)
  })));

  /* Select KPI card */
  const selectKpi = (key) => {
    setActiveKpi(key);
    if (key === 'total') setFilterState('all');
    else if (KPI_DEFS.some((d) => d.key === key)) setFilterState(key);
  };

  /* Row actions */
  const buildRowActions = (row) => {
    const state = evaluationState(row);
    const actions = [];
    actions.push({ key: 'view', label: 'View Evaluation', icon: Eye });
    if (state === 'pending' || state === 'in_progress') {
      actions.push({ key: 'continue', label: 'Continue Evaluation', icon: ClipboardCheck });
    }
    return actions;
  };

  const handleRowAction = (key, row) => {
    if (key === 'view' || key === 'continue') {
      navigate(`/purchase/rfq/technical-evaluation/${row.rfqId}`);
    }
  };

  /* ─── Selection helpers ─── */
  const allSelected = filtered.length > 0 && filtered.every((row) => selectedIds.includes(row.rfqId));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback((checked) => {
    setSelectedIds(checked ? filtered.map((row) => row.rfqId) : []);
  }, [filtered]);

  const handleToggleRow = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  /* Cell renderers */
  const renderCell = useMemo(() => ({
    sNo: (_row) => {
      const idx = filtered.findIndex((r) => r.rfqId === _row.rfqId);
      return <span className="tabular-nums text-slate-400">{idx + 1}</span>;
    },
    rfqNo: (row) => (
      <a
        href={`/purchase/rfq/technical-evaluation/${row.rfqId}`}
        onClick={(e) => {
          e.preventDefault();
          navigate(`/purchase/rfq/technical-evaluation/${row.rfqId}`);
        }}
      >
        {row.rfqNo}
      </a>
    ),
    title: (row) => (
      <span className="cpr-cell-truncate" title={row.title}>{row.title || '—'}</span>
    ),
    vendorCount: (row) => {
      const summary = row.vendorEvalSummary;
      return (
        <div className="flex items-center gap-1.5">
          <span className="cpr-count-chip">{(row.vendors || []).length}</span>
          {summary && summary.evaluated && (
            <span className="text-[10px] font-semibold text-slate-400">
              ({summary.evaluated ? 'evaluated' : ''})
            </span>
          )}
        </div>
      );
    },
    bestScore: (row) => {
      const best = (row.vendors || []).reduce(
        (best, v) => (v.technicalTotal > best ? v.technicalTotal : best), 0
      );
      return (
        <span className="tabular-nums font-semibold">
          {best > 0 ? `${best}/100` : '—'}
        </span>
      );
    },
    evalDate: (row) => (
      <span className="cpr-cell-muted">{formatDate(row.date) || '—'}</span>
    ),
    currency: (row) => (
      <span>{row.currency || 'INR'}</span>
    ),
    status: (row) => {
      const state = evaluationState(row);
      return (
        <PurchaseStatusCell
          status={STATE_LABELS[state] || state}
        />
      );
    },
    progress: (row) => {
      const state = evaluationState(row);
      const summary = row.vendorEvalSummary;
      let pct = 0;
      if (state === 'completed') pct = 100;
      else if (state === 'in_progress' && summary) {
        const total = summary.total || 1;
        const decided = (summary.qualified || 0) + (summary.notQualified || 0);
        pct = Math.round((decided / total) * 80) + 10;
      } else if (state === 'pending') pct = 5;
      return (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden" style={{ minWidth: 40 }}>
            <div
              className="h-full bg-[#0B4A3D] rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-slate-400 tabular-nums">{pct}%</span>
        </div>
      );
    },
  }), [navigate, filtered]);

  /* Mandatory columns (cannot be hidden) */
  const MANDATORY_COLUMNS = ['rfqNo', 'actions'];

  const refreshPage = () => { setLoading(true); setRefreshKey((k) => k + 1); };

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Technical Evaluation' }
        ],
        icon: SearchCheck,
        title: 'Technical Evaluation',
        subtitle: 'Evaluate technical compliance of shortlisted vendor quotations.',
        actions: (
          <button type="button" className="erp-btn-primary" onClick={refreshPage}>
            <RefreshCw size={14} /> Refresh
          </button>
        )
      }}
      flowNav={<RfqTabNav />}
      error={error}
      errorMessage="Failed to load evaluations."
      onRetry={refreshPage}
      kpis={{
        cards: kpiCards,
        activeKey: activeKpi,
        onSelect: selectKpi,
      }}
      tabs={{
        primary: {
          label: 'All Evaluations',
          count: stats.total,
          onSelect: () => { setFilterState('all'); setActiveKpi('total'); }
        },
        segments: {
          tabs: ['all', 'pending', 'in_progress', 'completed', 'locked'].map((key) => ({
            key,
            label: key === 'all' ? 'All' : STATE_LABELS[key] || key,
            count: key === 'all' ? stats.total : stats[key] || 0,
          })),
          activeKey: filterState,
          onSelect: (key) => { setFilterState(key); setActiveKpi(key === 'all' ? 'total' : key); },
          ariaLabel: 'Evaluation status'
        }
      }}
      toolbar={{
        left: (
          <>
            <span className="toolbar-count">
              {filtered.length} RFQ{filtered.length !== 1 ? 's' : ''}
            </span>
            {(searchInput || filterState !== 'all') && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setFilterState('all'); setActiveKpi('total'); }}>
                <X size={12} /> Clear
              </button>
            )}
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="teSearchInput"
              placeholder="Search RFQ, Title, Vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Technical Evaluations"
            />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={MANDATORY_COLUMNS}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [],
        onAction: () => {},
        id: 'teBulkActionBar',
      }}
      table={{
        columns: visibleColumns,
        rows: filtered,
        /* Board rows carry their identity as `rfqId` (the same id used by
           selection and navigation) — not `id`, so the table's default
           `(row) => row.id` key would be undefined for every row. */
        getRowId: (row) => row.rfqId,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: handleSelectAll,
        onToggleRow: handleToggleRow,
        sortKey: null,
        sortDirection: null,
        renderers: renderCell,
        statusDotTone: (row) => STATE_DOT_TONE[evaluationState(row)] || 'gray',
        idColumn: 'rfqNo',
        tableId: 'teTable',
        alignCenter: ['vendorCount', 'bestScore', 'status', 'progress'],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        onRowClick: (row) => navigate(`/purchase/rfq/technical-evaluation/${row.rfqId}`),
        emptyContent: (
          searchInput || filterState !== 'all' ? (
            <div className="cpr-empty">
              <SearchCheck size={48} aria-hidden="true" />
              <h3>No RFQs match your search</h3>
              <p>Try adjusting your search or filters.</p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearchInput(''); setFilterState('all'); setActiveKpi('total'); }}>
                <X size={12} /> Clear Filters
              </button>
            </div>
          ) : (
            <div className="cpr-empty">
              <SearchCheck size={48} aria-hidden="true" />
              <h3>No Technical Evaluations</h3>
              <p>RFQs awaiting technical evaluation will appear here.</p>
            </div>
          )
        )
      }}
    />
  );
}
