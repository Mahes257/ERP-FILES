/**
 * purchase/pages/logistics/QualityInspection.jsx
 * ------------------------------------------------------------------
 * Quality Inspection — inspect received goods with Pass / Fail /
 * Partial Accept decisions, defect counts and inspection notes.
 * Built on the shared Purchase list kit so it matches the master list.
 *
 * Route: /purchase/logistics/quality
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, CheckCircle2, ClipboardCheck, Download, Edit3, Eye,
  LayoutList, Loader2, Play, Plus, RefreshCw, Search, Send, X, XCircle
} from 'lucide-react';
import { Modal, NumberInput, TextArea, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState,
  PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell
} from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { logisticsService, INSPECTION_STATUS, RECEIVING_MAX_PAGE_SIZE } from '../../services/logistics';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  { key: 'inspectionNo', label: 'Inspection No', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'grnNo', label: 'GRN No', width: 130, sortable: true, visible: true },
  { key: 'poNo', label: 'PO No', width: 140, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 140, sortable: true, visible: true },
  { key: 'item', label: 'Item / Material', width: 180, sortable: true, visible: true },
  { key: 'receivedQty', label: 'Received Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'inspectedQty', label: 'Inspected Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'acceptedQty', label: 'Accepted Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'rejectedQty', label: 'Rejected Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'inspector', label: 'Inspector', width: 130, sortable: true, visible: true },
  { key: 'inspectedOn', label: 'Inspection Date', width: 120, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const STATUS_SEGMENTS = [
  { key: INSPECTION_STATUS.PENDING, label: 'Pending' },
  { key: INSPECTION_STATUS.IN_PROGRESS, label: 'In Progress' },
  { key: INSPECTION_STATUS.PASSED, label: 'Passed' },
  { key: INSPECTION_STATUS.FAILED, label: 'Failed' },
  { key: INSPECTION_STATUS.PARTIALLY_ACCEPTED, label: 'Partial Accept' }
];

const KPI_DEFS = [
  { key: 'total', label: 'Total Inspections', icon: ClipboardCheck, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pending', label: 'Pending', icon: ClipboardCheck, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'inProgress', label: 'In Progress', icon: Play, color: '#0284C7', bg: 'rgba(2,132,199,0.10)' },
  { key: 'passed', label: 'Passed', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'failed', label: 'Failed', icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'partiallyAccepted', label: 'Partial Accept', icon: CheckCircle2, color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function QualityInspection() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreateInspection = can('inspections', 'create');
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await logisticsService.getInspections({
        search,
        status: filters.status || 'All',
        page,
        pageSize
      });
      return response;
    },
    []
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    search,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [postTarget, setPostTarget] = useState(null);
  const [posting, setPosting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeKpi, setActiveKpi] = useState('total');

  /* Record Result modal state */
  const [recordTarget, setRecordTarget] = useState(null);
  const [resultStatus, setResultStatus] = useState(INSPECTION_STATUS.PASSED);
  const [resultNotes, setResultNotes] = useState('');
  const [resultItems, setResultItems] = useState([]);

  const debouncedSearch = useDebounce(searchInput, 400);
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setSelectedIds([]), 0);
    return () => clearTimeout(timer);
  }, [filters.status]);

  useEffect(() => {
    let cancelled = false;
    logisticsService.getInspectionStats().then((data) => { if (!cancelled) setStats(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const refreshStats = () => {
    logisticsService.getInspectionStats().then(setStats).catch(() => {});
  };

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () => setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () => setColumns((prev) => prev.map((col) => (col.key === 'inspectionNo' || col.key === 'actions' ? col : { ...col, visible: false })));

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats?.[def.key] ?? 0) }));
  const selectKpi = (key) => {
    const newKey = activeKpi === key ? 'total' : key;
    setActiveKpi(newKey);
    if (newKey === 'total') {
      setFilter('status', 'All');
    } else if (newKey === 'pending') {
      setFilter('status', INSPECTION_STATUS.PENDING);
    } else if (newKey === 'inProgress') {
      setFilter('status', INSPECTION_STATUS.IN_PROGRESS);
    } else if (newKey === 'passed') {
      setFilter('status', INSPECTION_STATUS.PASSED);
    } else if (newKey === 'failed') {
      setFilter('status', INSPECTION_STATUS.FAILED);
    } else if (newKey === 'partiallyAccepted') {
      setFilter('status', INSPECTION_STATUS.PARTIALLY_ACCEPTED);
    }
  };
  const statKeyFor = (status) => {
    if (status === INSPECTION_STATUS.PENDING) return 'pending';
    if (status === INSPECTION_STATUS.IN_PROGRESS) return 'inProgress';
    if (status === INSPECTION_STATUS.PASSED) return 'passed';
    if (status === INSPECTION_STATUS.FAILED) return 'failed';
    if (status === INSPECTION_STATUS.PARTIALLY_ACCEPTED) return 'partiallyAccepted';
    return null;
  };
  const segments = STATUS_SEGMENTS.map((seg) => ({ ...seg, count: stats?.[statKeyFor(seg.key)] ?? 0 }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  /* ─── Start Inspection ─── */
  const handleStartInspection = async (row) => {
    const result = await runMutation(() => logisticsService.startInspection(row.id));
    if (result.ok) toast.success(`${row.inspectionNo} inspection started`);
    else toast.error(result.error?.message || 'Failed to start inspection');
    refresh();
    refreshStats();
  };

  /* ─── Open Record Result modal ─── */
  const openRecordResult = (row, status) => {
    setRecordTarget(row);
    setResultStatus(status);
    setResultNotes('');
    setResultItems(
      (row.items || []).map((item) => ({
        ...item,
        inspectedQty: Number(item.inspectedQty) || 0,
        acceptedQty: Number(item.acceptedQty) || 0,
        rejectedQty: Number(item.rejectedQty) || 0
      }))
    );
  };

  /* ─── Confirm Record Result ─── */
  const confirmRecordResult = async () => {
    if (!recordTarget) return;
    /* Validate quantities */
    for (const item of resultItems) {
      const received = Number(item.receivedQty) || 0;
      const inspected = Number(item.inspectedQty) || 0;
      const accepted = Number(item.acceptedQty) || 0;
      const rejected = Number(item.rejectedQty) || 0;
      if (inspected > received) {
        toast.error(`Inspected qty for ${item.product} exceeds received qty (${received})`);
        return;
      }
      if (accepted + rejected > inspected) {
        toast.error(`Accepted + rejected qty for ${item.product} exceeds inspected qty (${inspected})`);
        return;
      }
    }
    const result = await runMutation(() =>
      logisticsService.setInspectionResult(recordTarget.id, resultStatus, {
        notes: resultNotes.trim(),
        items: resultItems
      })
    );
    if (result.ok) toast.success(`${recordTarget.inspectionNo} marked as ${resultStatus.toLowerCase()}`);
    else toast.error(result.error?.message || 'Failed to update inspection');
    setRecordTarget(null);
    refresh();
    refreshStats();
  };

  /* ─── Post to Inventory ─── */
  const confirmPosting = async () => {
    if (!postTarget || posting) return;
    setPosting(true);
    const result = await runMutation(() => logisticsService.postInventoryFromInspection(postTarget.row.id));
    if (result.ok) toast.success(`${postTarget.row.inspectionNo} accepted quantity posted to inventory`);
    else toast.error(result.error?.message || 'Failed to post to inventory');
    setPostTarget(null);
    setPosting(false);
    refresh();
    refreshStats();
  };

  /* ─── Row Actions ─── */
  const handleRowAction = (key, row) => {
    if (key === 'view') navigate(`/purchase/logistics/quality/${row.inspectionNo}`);
    else if (key === 'start') handleStartInspection(row);
    else if (key === 'pass') openRecordResult(row, INSPECTION_STATUS.PASSED);
    else if (key === 'fail') openRecordResult(row, INSPECTION_STATUS.FAILED);
    else if (key === 'partial') openRecordResult(row, INSPECTION_STATUS.PARTIALLY_ACCEPTED);
    else if (key === 'record') openRecordResult(row, resultStatus);
    else if (key === 'post') setPostTarget({ row });
    else if (key === 'view-grn') navigate(`/purchase/logistics/grn/${row.grnNo}`);
    else if (key === 'view-po') navigate(`/purchase/orders/${row.poNo}`);
  };

  /* ─── Export ─── */
  const handleExport = async (type) => {
    try {
      /* One widest-allowed page (the server cap) — never the whole table. */
      const result = await logisticsService.getInspections({ search, status: filters.status || 'All', page: 1, pageSize: RECEIVING_MAX_PAGE_SIZE });
      if (type === 'csv') exportCsv(columns, result.data, 'quality-inspection');
      toast.success('Inspections exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export inspections');
    }
  };

  /* ─── Cell Renderers ─── */
  const renderers = useMemo(() => ({
    inspectionNo: (row) => (
      <button
        type="button"
        onClick={() => navigate(`/purchase/logistics/quality/${row.inspectionNo}`)}
        className="font-bold text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
      >
        {row.inspectionNo}
      </button>
    ),
    grnNo: (row) => (
      row.grnNo ? (
        <button
          type="button"
          onClick={() => navigate(`/purchase/logistics/grn/${row.grnNo}`)}
          className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.grnNo}
        </button>
      ) : <span className="text-slate-400">—</span>
    ),
    poNo: (row) => (
      <button
        type="button"
        onClick={() => navigate(`/purchase/orders/${row.poNo}`)}
        className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
      >
        {row.poNo}
      </button>
    ),
    vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
    item: (row) => {
      const items = row.items || [];
      const first = items[0]?.product || '—';
      const more = items.length > 1 ? ` (+${items.length - 1})` : '';
      return (
        <span className="text-slate-600 whitespace-nowrap" title={items.map((i) => i.product).join(', ')}>
          {first}{more}
        </span>
      );
    },
    receivedQty: (row) => {
      const total = (row.items || []).reduce((sum, i) => sum + (Number(i.receivedQty) || 0), 0);
      return <span className="text-slate-600 tabular-nums">{total}</span>;
    },
    inspectedQty: (row) => {
      const total = (row.items || []).reduce((sum, i) => sum + (Number(i.inspectedQty) || 0), 0);
      return <span className="text-slate-600 tabular-nums">{total}</span>;
    },
    acceptedQty: (row) => {
      const total = (row.items || []).reduce((sum, i) => sum + (Number(i.acceptedQty) || 0), 0);
      return <span className="font-bold text-emerald-700 tabular-nums">{total}</span>;
    },
    rejectedQty: (row) => {
      const total = (row.items || []).reduce((sum, i) => sum + (Number(i.rejectedQty) || 0), 0);
      return (
        <span className={`tabular-nums ${total > 0 ? 'font-bold text-rose-600' : 'text-slate-500'}`}>{total}</span>
      );
    },
    inspector: (row) => <span className="text-slate-600">{row.inspector || '—'}</span>,
    inspectedOn: (row) => <span className="text-slate-500 whitespace-nowrap">{row.inspectedOn ? formatDate(row.inspectedOn) : '—'}</span>,
    status: (row) => <PurchaseStatusCell status={row.status} />
  }), [navigate]);

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Quality Inspection' }
        ],
        icon: ClipboardCheck,
        title: 'Quality Inspection',
        subtitle: 'Inspect received goods and record pass/fail decisions.',
        actions: (
          <>
            {canCreateInspection && (
            <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/logistics/quality/new')}>
              <span className="erp-btn-icon"><Plus size={14} /></span> New Inspection
            </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        )
      }}
      flowNav={<ModuleTabNav module="logistics" />}
      error={error}
      errorMessage="Failed to load inspections."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { label: 'All Inspections', count: stats?.total ?? 0, onSelect: () => setFilter('status', 'All') },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: (status) => setFilter('status', status),
          ariaLabel: 'Inspection result'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            {(searchInput || filters.status) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => { resetFilters(); setSearchInput(''); }}>
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
              id="inspectionSearchInput"
              placeholder="Search by inspection no, GRN, PO, vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Inspections"
            />
            <PurchaseExportDropdown buttonLabel="Export Inspections" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['inspectionNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [
          { key: 'export', label: 'Export', icon: Download },
          { key: 'startInspection', label: 'Start Inspection', icon: ClipboardCheck },
        ],
        onAction: async (key) => {
          if (key === 'export') handleExport('csv');
          else if (key === 'startInspection') {
            const valid = selectedIds.map((id) => records.find((r) => r.inspectionNo === id)).filter(Boolean)
              .filter((r) => r.status === INSPECTION_STATUS.PENDING);
            if (valid.length === 0) { toast.info('No pending inspections selected'); return; }
            let successCount = 0;
            for (const row of valid) {
              const result = await runMutation(() => logisticsService.startInspection(row.id));
              if (result.ok) successCount++;
            }
            if (successCount > 0) toast.success(`${successCount} inspection(s) started`);
            else toast.error('Failed to start inspections');
            setSelectedIds([]);
            refresh();
            refreshStats();
          }
        },
        id: 'qcBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected: records.length > 0 && records.every((row) => selectedIds.includes(row.inspectionNo)),
        someSelected: selectedIds.length > 0 && !(records.length > 0 && records.every((row) => selectedIds.includes(row.inspectionNo))),
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.inspectionNo) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        idColumn: 'inspectionNo',
        tableId: 'inspectionTable',
        alignCenter: ['status'],
        alignRight: ['receivedQty', 'inspectedQty', 'acceptedQty', 'rejectedQty'],
        rowActions: (row) => {
          const actions = [{ key: 'view', label: 'View Inspection', icon: Eye }];
          if (row.status === INSPECTION_STATUS.PENDING) {
            actions.push({ key: 'start', label: 'Start Inspection', icon: Play });
          }
          if (row.status === INSPECTION_STATUS.IN_PROGRESS) {
            actions.push({ key: 'pass', label: 'Pass', icon: CheckCircle2 });
            actions.push({ key: 'fail', label: 'Fail', icon: XCircle, danger: true });
            actions.push({ key: 'partial', label: 'Partial Accept', icon: Edit3 });
          }
          if ((row.status === INSPECTION_STATUS.PASSED || row.status === INSPECTION_STATUS.PARTIALLY_ACCEPTED) && !row.postedAt) {
            actions.push({ key: 'post', label: 'Post to Inventory', icon: ArrowDownToLine });
          }
          actions.push({ key: 'view-grn', label: 'View GRN', icon: Send });
          actions.push({ key: 'view-po', label: 'View PO', icon: Eye });
          return actions;
        },
        onRowAction: handleRowAction,
        onRowClick: (row) => navigate(`/purchase/logistics/quality/${row.inspectionNo}`),
        emptyContent: (
          search ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Inspections"
              message="No inspections matching your search criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { resetFilters(); setSearchInput(''); }}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={LayoutList}
              title="No Inspections Found"
              message="No inspections found matching your criteria."
            />
          )
        )
      }}
      pagination={{
        page,
        totalPages,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: goToPage,
        onPageSizeChange: changePageSize
      }}
    >
      {/* ── Post to Inventory Modal ── */}
      <Modal
        open={postTarget !== null}
        onClose={() => setPostTarget(null)}
        title={`Post to inventory — ${postTarget?.row?.inspectionNo || ''}`}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" onClick={() => setPostTarget(null)} className="btn btn-ghost btn-sm">Cancel</button>
            <button
              type="button"
              onClick={confirmPosting}
              disabled={actionLoading || posting}
              className="po-btn po-btn-primary"
            >
              {posting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Post Accepted Quantity
            </button>
          </>
        }
      >
        <p className="text-xs text-slate-600">
          The accepted quantity of <strong>{postTarget?.row?.grnNo || 'the GRN'}</strong> will be posted
          into the inventory ledger as a receipt. Rejected goods never enter stock.
        </p>
      </Modal>

      {/* ── Record Result Modal ── */}
      <Modal
        open={recordTarget !== null}
        onClose={() => { setRecordTarget(null); setResultItems([]); }}
        title={`Record Result — ${recordTarget?.inspectionNo || ''}`}
        maxWidth="max-w-xl"
        footer={
          <>
            <button type="button" onClick={() => { setRecordTarget(null); setResultItems([]); }} className="btn btn-ghost btn-sm">Cancel</button>
            <button
              type="button"
              onClick={confirmRecordResult}
              disabled={actionLoading}
              className={
                resultStatus === INSPECTION_STATUS.PASSED ? 'po-btn po-btn-primary'
                : resultStatus === INSPECTION_STATUS.FAILED ? 'po-btn po-btn-danger'
                : 'po-btn po-btn-primary'
              }
            >
              {resultStatus === INSPECTION_STATUS.PASSED && 'Mark Passed'}
              {resultStatus === INSPECTION_STATUS.FAILED && 'Mark Failed'}
              {resultStatus === INSPECTION_STATUS.PARTIALLY_ACCEPTED && 'Partial Accept'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600">
            Enter inspected quantities per line. Accepted + Rejected must not exceed Inspected.
          </p>

          {/* Status selector */}
          <div className="flex gap-2">
            {[
              { value: INSPECTION_STATUS.PASSED, label: 'Pass', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
              { value: INSPECTION_STATUS.FAILED, label: 'Fail', color: 'bg-rose-100 text-rose-700 border-rose-300' },
              { value: INSPECTION_STATUS.PARTIALLY_ACCEPTED, label: 'Partial', color: 'bg-sky-100 text-sky-700 border-sky-300' }
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setResultStatus(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                  resultStatus === opt.value ? opt.color : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Items table */}
          {resultItems.length > 0 && (
            <div className="rounded-lg border border-slate-200 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200">
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Product</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-500">Received</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-500">Inspected</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-500">Accepted</th>
                    <th className="px-3 py-2 text-right font-bold text-slate-500">Rejected</th>
                  </tr>
                </thead>
                <tbody>
                  {resultItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-slate-50">
                      <td className="px-3 py-2 font-semibold text-slate-700">{item.product}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{item.receivedQty}</td>
                      <td className="px-3 py-2 text-right">
                        <NumberInput
                          min="0"
                          max={item.receivedQty}
                          value={item.inspectedQty}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setResultItems((prev) => prev.map((p, i) => i === idx ? { ...p, inspectedQty: val } : p));
                          }}
                          ariaLabel={`Inspected qty for ${item.product}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <NumberInput
                          min="0"
                          max={item.inspectedQty}
                          value={item.acceptedQty}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setResultItems((prev) => prev.map((p, i) => i === idx ? { ...p, acceptedQty: val } : p));
                          }}
                          ariaLabel={`Accepted qty for ${item.product}`}
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <NumberInput
                          min="0"
                          max={item.inspectedQty}
                          value={item.rejectedQty}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setResultItems((prev) => prev.map((p, i) => i === idx ? { ...p, rejectedQty: val } : p));
                          }}
                          ariaLabel={`Rejected qty for ${item.product}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <TextArea
            rows={3}
            value={resultNotes}
            onChange={(e) => setResultNotes(e.target.value)}
            placeholder="Inspection notes / defect summary (optional)"
          />
        </div>
      </Modal>
    </PurchaseListPage>
  );
}
