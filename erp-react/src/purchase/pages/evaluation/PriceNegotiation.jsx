/**
 * purchase/pages/evaluation/PriceNegotiation.jsx
 * ------------------------------------------------------------------
 * Final Negotiation — LIST view showing RFQs and their negotiation
 * status. One row per RFQ. Opens NegotiationWorkspace for a specific
 * RFQ/vendor pair.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive, ArrowLeft, CheckCircle2, Clock3, Eye, Filter,
  RefreshCw, Scale, Search, SearchCheck, Trash2, X
} from 'lucide-react';
import { useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import { PRIORITIES, RFQ_STATUSES } from '../../constants';
import { evaluationService } from '../../services/evaluation';
import { formatDate } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf } from '../../utils/export';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseList from '../../hooks/usePurchaseList';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

const KPI_CARDS = [
  { key: 'total', label: 'Total RFQs', icon: SearchCheck, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pending', label: 'Pending Negotiation', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'agreed', label: 'Agreed', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' }
];

const STATUS_FILTER_MAP = {
  pending: 'Pending',
  agreed: 'Agreed'
};

const LIFECYCLE_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'deleted', label: 'Deleted' }
];

const NEGOTIATION_COLUMNS = [
  { key: 'rfqNo', label: 'RFQ No', width: 140, sortable: true, visible: true, sticky: 'left' },
  { key: 'title', label: 'Title', width: 230, sortable: true, visible: true },
  { key: 'vendors', label: 'Vendors', width: 190, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'negotiation', label: 'Negotiation', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'priority', label: 'Priority', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'date', label: 'Date', width: 125, sortable: true, visible: true },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const SELECT_FILTER_KEYS = ['rfqStatus', 'priority'];
const FILTER_KEYS = [...SELECT_FILTER_KEYS, 'dateFrom', 'dateTo'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
const MANDATORY_COLUMNS = ['rfqNo', 'status', 'actions'];

function toRow(item) {
  const agreed = Boolean(item.steps?.negotiationAgreed);
  return {
    rfqId: item.rfqId,
    rfqNo: item.rfqNo,
    title: item.title || '',
    priority: item.priority || '',
    date: item.date || '',
    currency: item.currency || 'INR',
    rfqStatus: item.rfqStatus,
    vendorNames: (item.vendors || []).map((v) => v.vendor),
    agreed,
    negotiationState: agreed ? 'Agreed' : 'Pending'
  };
}

function sortValue(row, key) {
  switch (key) {
    case 'vendors': return row.vendorNames.join(', ');
    case 'negotiation': return row.agreed ? 1 : 0;
    case 'status': return row.rfqStatus;
    case 'date': return row.date || '';
    case 'priority': return row.priority || '';
    default: return row[key] ?? '';
  }
}

export default function PriceNegotiation() {
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('active');

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      if (tab !== 'active') return { data: [], total: 0 };
      const board = await evaluationService.getEvaluationBoard();
      let rows = (board || []).map(toRow);

      const q = String(search || '').trim().toLowerCase();
      if (q) {
        rows = rows.filter(
          (row) =>
            row.rfqNo.toLowerCase().includes(q) ||
            row.title.toLowerCase().includes(q) ||
            row.vendorNames.some((name) => name.toLowerCase().includes(q))
        );
      }
      const state = filters.status && filters.status !== 'All' ? filters.status : 'All';
      if (state !== 'All') rows = rows.filter((row) => row.negotiationState === state);
      const rfqStatus = filters.rfqStatus && filters.rfqStatus !== 'All' ? filters.rfqStatus : 'All';
      if (rfqStatus !== 'All') rows = rows.filter((row) => row.rfqStatus === rfqStatus);
      const priority = filters.priority && filters.priority !== 'All' ? filters.priority : 'All';
      if (priority !== 'All') rows = rows.filter((row) => row.priority === priority);
      if (filters.dateFrom) rows = rows.filter((row) => String(row.date).slice(0, 10) >= filters.dateFrom);
      if (filters.dateTo) rows = rows.filter((row) => String(row.date).slice(0, 10) <= filters.dateTo);

      const key = sortKey || 'date';
      const dir = sortDirection === 'asc' ? 1 : -1;
      rows = [...rows].sort((a, b) => {
        const av = sortValue(a, key);
        const bv = sortValue(b, key);
        if (av === bv) return 0;
        return (av < bv ? -1 : 1) * dir;
      });

      const total = rows.length;
      const start = (page - 1) * pageSize;
      return { data: rows.slice(start, start + pageSize), total };
    },
    [tab]
  );

  const {
    records, loading, error,
    pagination: { page, pageSize, totalCount, totalPages },
    search, sortKey, sortDirection, filters,
    setSearch, setFilter, resetFilters, goToPage, changePageSize, toggleSort, refresh
  } = usePurchaseList(fetchPage, { pageSize: 10, sortKey: 'date', sortDir: 'desc' });

  const [columns, setColumns] = useState(() => NEGOTIATION_COLUMNS.map((col) => ({ ...col })));
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [activeKpi, setActiveKpi] = useState('total');

  const debouncedSearch = useDebounce(searchInput, 400);
  useEffect(() => { setSearch(debouncedSearch); }, [debouncedSearch, setSearch]);

  useEffect(() => {
    let cancelled = false;
    evaluationService.getEvaluationBoard().then((board) => {
      if (cancelled) return;
      const rows = (board || []).map(toRow);
      setStats({
        total: rows.length,
        pending: rows.filter((r) => r.negotiationState === 'Pending').length,
        agreed: rows.filter((r) => r.negotiationState === 'Agreed').length
      });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [statsVersion]);

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);
  const toggleColumn = (key) => {
    if (MANDATORY_COLUMNS.includes(key)) return;
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () => setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () => setColumns((prev) => prev.map((col) => (MANDATORY_COLUMNS.includes(col.key) ? col : { ...col, visible: false })));
  const refreshPage = () => { refresh(); setStatsVersion((v) => v + 1); };

  const selectKpi = (key) => {
    if (key === activeKpi) { setActiveKpi('total'); setFilter('status', 'All'); }
    else { setActiveKpi(key); setFilter('status', STATUS_FILTER_MAP[key] || 'All'); }
    setTab('active');
  };

  const goAllRfqs = () => { setActiveKpi('total'); setFilter('status', 'All'); setTab('active'); };
  const selectLifecycle = (key) => {
    if (key !== 'active') { setActiveKpi('total'); setFilter('status', 'All'); }
    setTab(key); refresh();
  };

  const kpiCards = KPI_CARDS.map((card) => ({ ...card, value: String(stats?.[card.key] ?? 0) }));
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const fetchAll = () => {
    if (tab !== 'active') return Promise.resolve([]);
    return evaluationService.getEvaluationBoard().then((board) => {
      let rows = (board || []).map(toRow);
      const q = String(search || '').trim().toLowerCase();
      if (q) rows = rows.filter((r) => r.rfqNo.toLowerCase().includes(q) || r.title.toLowerCase().includes(q));
      return rows;
    });
  };

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'Final Negotiation', columns, records: rows, filename: 'final-negotiation' });
      else if (type === 'excel') await exportExcel(columns, rows, 'final-negotiation');
      else if (type === 'csv') exportCsv(columns, rows, 'final-negotiation');
      toast.success('Final negotiation exported');
    } catch (err) { toast.error(err?.message || 'Failed to export'); }
  };

  const handleRowAction = (key, row) => {
    if (key === 'negotiate') {
      const firstVendor = row.vendorNames[0] || '';
      navigate(`/purchase/rfq/negotiation/${row.rfqId}/${firstVendor}`);
    } else if (key === 'view-rfq') {
      navigate(`/purchase/rfq/${row.rfqId}`);
    }
  };

  const buildRowActions = (row) => {
    const actions = [];
    if (!row.agreed) actions.push({ key: 'negotiate', label: 'Negotiate', icon: Scale });
    actions.push({ key: 'view-rfq', label: 'View RFQ', icon: Eye });
    return actions;
  };

  const renderCell = useMemo(
    () => ({
      rfqNo: (row) => (
        <a
          href={`/purchase/rfq/negotiation/${row.rfqId}`}
          onClick={(e) => { e.preventDefault(); navigate(`/purchase/rfq/negotiation/${row.rfqId}`); }}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
        >
          {row.rfqNo}
        </a>
      ),
      title: (row) => <span className="cpr-cell-truncate" title={row.title}>{row.title || '—'}</span>,
      vendors: (row) => row.vendorNames.length > 0 ? (
        <span className="cpr-cell-truncate" title={row.vendorNames.join(', ')}>{row.vendorNames.join(', ')}</span>
      ) : <span className="cpr-cell-muted">—</span>,
      status: (row) => <PurchaseStatusCell status={row.rfqStatus} />,
      negotiation: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${row.agreed ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-600'}`}>
          {row.negotiationState}
        </span>
      ),
      priority: (row) => (
        <span className={`cpr-priority ${PRIORITY_CLASS[row.priority] || PRIORITY_CLASS.Medium}`}>
          {row.priority || 'Medium'}
        </span>
      ),
      date: (row) => <span className="cpr-cell-muted">{formatDate(row.date) || '—'}</span>
    }),
    [navigate]
  );

  const hasFilters = Boolean(search) || FILTER_KEYS.some((key) => filters[key] && filters[key] !== 'All');
  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilter(key, SELECT_FILTER_KEYS.includes(key) ? value || 'All' : value);
    });
    setFilterOpen(false);
  };
  const resetAll = () => { setDraftFilters({}); resetFilters(); setSearchInput(''); setActiveKpi('total'); };
  const toggleFilters = () => {
    const next = !filterOpen;
    if (next) {
      setDraftFilters(FILTER_KEYS.reduce((acc, key) => {
        const value = filters[key];
        if (value && value !== 'All') acc[key] = value;
        return acc;
      }, {}));
    }
    setFilterOpen(next);
  };

  return (
    <PurchaseListPage
      header={{
        crumb: [{ label: 'RFQ & Quotations' }, { label: 'Final Negotiation' }],
        icon: Scale,
        title: 'Final Negotiation',
        subtitle: 'Negotiate pricing and commercial terms with vendors',
        actions: (
          <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
            <RefreshCw size={12} /> Refresh
          </button>
        )
      }}
      error={error}
      errorMessage="Failed to load negotiation data."
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { label: 'All RFQs', count: stats?.total ?? 0, onSelect: goAllRfqs },
        segments: {
          tabs: LIFECYCLE_TABS.map((item) => ({ key: item.key, label: item.label, count: item.key === 'active' ? (stats?.total ?? 0) : 0 })),
          activeKey: tab,
          onSelect: selectLifecycle,
          ariaLabel: 'Negotiation lifecycle'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={toggleFilters} aria-label="Toggle filters" aria-expanded={filterOpen}>
              <Filter size={12} /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(searchInput || hasFilters) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch id="negotiationSearchInput" placeholder="Search RFQ No, Title, Vendor..." value={searchInput} onChange={setSearchInput} label="Search negotiations" />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <PurchaseColumnsDropdown columns={columns} onToggleColumn={toggleColumn} onShowAll={showAllColumns} onHideAll={hideAllColumns} lockedKeys={MANDATORY_COLUMNS} />
          </>
        )
      }}
      filters={{
        open: filterOpen, panelId: 'negotiationFilterPanel', onApply: applyFilters, onReset: resetAll,
        groups: [
          { key: 'rfqStatus', id: 'fn-rfq-status', label: 'RFQ Status', value: draftFilters.rfqStatus || 'All', options: [{ value: 'All', label: 'All RFQ Statuses' }, ...RFQ_STATUSES.map((v) => ({ value: v, label: v }))], onChange: (v) => setDraftFilters((prev) => ({ ...prev, rfqStatus: v })) },
          { key: 'priority', id: 'fn-priority', label: 'Priority', value: draftFilters.priority || 'All', options: [{ value: 'All', label: 'All Priorities' }, ...PRIORITIES.map((v) => ({ value: v, label: v }))], onChange: (v) => setDraftFilters((prev) => ({ ...prev, priority: v })) },
          { key: 'dateFrom', id: 'fn-date-from', label: 'Date From', type: 'date', value: draftFilters.dateFrom || '', onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v })) },
          { key: 'dateTo', id: 'fn-date-to', label: 'Date To', type: 'date', value: draftFilters.dateTo || '', onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateTo: v })) }
        ]
      }}
      table={{
        columns: visibleColumns, rows: records, loading, selectable: false,
        sortKey, sortDirection, onSort: toggleSort, renderers: renderCell,
        getRowId: (row) => row.rfqId, idColumn: 'rfqNo', tableId: 'negotiationTable',
        alignCenter: ['status', 'negotiation', 'priority'], alignRight: [],
        rowActions: buildRowActions, onRowAction: handleRowAction,
        emptyContent: (
          tab === 'deleted' ? (
            <div className="cpr-empty">
              <Trash2 size={48} aria-hidden="true" />
              <h3>No Deleted Negotiations</h3>
              <p>Your trash is empty.</p>
              <button type="button" className="btn btn-primary" onClick={() => selectLifecycle('active')}><ArrowLeft size={14} /> Back to Active</button>
            </div>
          ) : tab === 'archived' ? (
            <div className="cpr-empty"><Archive size={48} aria-hidden="true" /><h3>No Archived Negotiations</h3></div>
          ) : hasFilters ? (
            <PurchaseEmptyState icon={Search} title="No RFQs match your filters." message="Try adjusting your search or filters." action={<button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}><X size={12} /> Clear Filters</button>} />
          ) : (
            <PurchaseEmptyState icon={Scale} title="No RFQs awaiting negotiation" message="RFQs with received quotations appear here." />
          )
        )
      }}
      pagination={{ page, totalPages, pageSize, pageSizeOptions: PAGE_SIZE_OPTIONS, pageInfo, onPageChange: goToPage, onPageSizeChange: changePageSize }}
    />
  );
}
