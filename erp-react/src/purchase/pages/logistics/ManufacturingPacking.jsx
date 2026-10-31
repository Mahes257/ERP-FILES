/**
 * purchase/pages/logistics/ManufacturingPacking.jsx
 * ------------------------------------------------------------------
 * Manufacturing / Packing — tracks production and packing progress
 * against purchase orders with status tabs, calculated progress from
 * actual quantities (packedQty / orderedQty), and inline updates.
 * Built on the shared Purchase list kit so it matches the master
 * list design.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, CheckCircle2, Download, Eye, Factory, LayoutList, Loader2, PackageCheck, Plus,
  RefreshCw, Search, Ship, Truck, X
} from 'lucide-react';
import { ConfirmDialog, Modal, NumberInput, useToast } from '../../components/ui';
import { PurchaseListPage, PurchaseSearch, PurchaseEmptyState, PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell } from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { logisticsService, PACKING_STATUS, RECEIVING_MAX_PAGE_SIZE } from '../../services/logistics';

import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  { key: 'packingNo', label: 'Packing No', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'poNo', label: 'PO No', width: 140, sortable: true, visible: true },
  { key: 'product', label: 'Product / Item', width: 220, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'qty', label: 'Qty', width: 90, sortable: true, visible: true, align: 'right' },
  { key: 'packedQty', label: 'Packed', width: 90, sortable: true, visible: true, align: 'right' },
  { key: 'balanceQty', label: 'Balance', width: 90, sortable: true, visible: true, align: 'right' },
  { key: 'progress', label: 'Progress', width: 150, sortable: false, visible: true, align: 'center' },
  { key: 'expectedDate', label: 'ETD', width: 120, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const STATUS_SEGMENTS = [
  { key: PACKING_STATUS.IN_PRODUCTION, label: 'In Production' },
  { key: PACKING_STATUS.PACKED, label: 'Packed' },
  { key: PACKING_STATUS.READY_TO_SHIP, label: 'Ready to Ship' }
];

const KPI_DEFS = [
  { key: 'total', label: 'Total Jobs', icon: Boxes, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'inProduction', label: 'In Production', icon: Factory, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'packed', label: 'Packed', icon: PackageCheck, color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)' },
  { key: 'ready', label: 'Ready to Ship', icon: Truck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** The table derives Balance and Progress from qty / packedQty (the stored
 *  record has no balance field at all, and its stored progress is never
 *  recomputed), so exports must derive them the same way or those two columns
 *  come out empty / 0 in every exported file. */
const withDerivedQty = (rows = []) =>
  rows.map((row) => {
    const ordered = Number(row.qty) || 0;
    const packed = Number(row.packedQty) || 0;
    return {
      ...row,
      balanceQty: Math.max(0, ordered - packed),
      progress: ordered > 0 ? Math.round((packed / ordered) * 100) : 0
    };
  });

export default function ManufacturingPacking() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreatePacking = can('packing', 'create');
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await logisticsService.getManufacturing({
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
  const [advanceTarget, setAdvanceTarget] = useState(null);
  const [updateTarget, setUpdateTarget] = useState(null);
  const [updateQty, setUpdateQty] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  useEffect(() => {
    let cancelled = false;
    logisticsService
      .getManufacturingStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStats = () => {
    logisticsService.getManufacturingStats().then(setStats).catch(() => {});
  };

  /* Refresh must reload BOTH the table page and the KPI counts — the stats
     effect only runs on mount, so a list-only refresh would leave the cards
     showing stale numbers. */
  const refreshAll = () => {
    refresh();
    refreshStats();
  };

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'packingNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats?.[def.key] ?? 0) }));
  /* The highlighted KPI is DERIVED from the status filter, so the cards,
     the segment tabs and the table can never disagree about what is shown
     (previously each segment click left the old KPI card lit). */
  const activeKpi = useMemo(() => {
    if (filters.status === PACKING_STATUS.IN_PRODUCTION) return 'inProduction';
    if (filters.status === PACKING_STATUS.PACKED) return 'packed';
    if (filters.status === PACKING_STATUS.READY_TO_SHIP) return 'ready';
    return 'total';
  }, [filters.status]);

  /* Every status-filter change drops the current selection: the held row ids
     belong to rows that may not be on the new page, so a "3 selected" count
     could otherwise act on records that are no longer visible. */
  const applyStatusFilter = (status) => {
    setSelectedIds([]);
    setFilter('status', status);
  };

  const showAllJobs = () => {
    /* Idempotent: re-selecting the already-active filter must not trigger a
       redundant list fetch (setFilter builds a new object otherwise). */
    setSelectedIds([]);
    if (filters.status && filters.status !== 'All') setFilter('status', 'All');
  };

  const selectKpi = (key) => {
    const next = activeKpi === key ? 'total' : key;
    if (next === 'total') showAllJobs();
    else if (next === 'inProduction') applyStatusFilter(PACKING_STATUS.IN_PRODUCTION);
    else if (next === 'packed') applyStatusFilter(PACKING_STATUS.PACKED);
    else if (next === 'ready') applyStatusFilter(PACKING_STATUS.READY_TO_SHIP);
  };
  const statKeyFor = (status) => {
    if (status === PACKING_STATUS.IN_PRODUCTION) return 'inProduction';
    if (status === PACKING_STATUS.PACKED) return 'packed';
    if (status === PACKING_STATUS.READY_TO_SHIP) return 'ready';
    return null;
  };
  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: stats?.[statKeyFor(seg.key)] ?? 0
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  /* Selection stores row IDS — the shared table's getRowId is row.id — so
     every bulk action must match on row.id, not the packing number. */
  const selectedRecords = useMemo(
    () => records.filter((row) => selectedIds.includes(row.id)),
    [records, selectedIds]
  );

  const advanceTargetRow = (row) => {
    const next = row.status === PACKING_STATUS.IN_PRODUCTION
      ? PACKING_STATUS.PACKED
      : row.status === PACKING_STATUS.PACKED
        ? PACKING_STATUS.READY_TO_SHIP
        : null;
    if (!next) return;
    setAdvanceTarget({ row, next });
  };

  const confirmAdvance = async () => {
    if (!advanceTarget) return;
    const { row, next } = advanceTarget;
    const result = await runMutation(() => logisticsService.updateManufacturing(row.id, {
      status: next,
      packedQty: next === PACKING_STATUS.PACKED ? row.qty : row.packedQty
    }));
    if (result.ok) toast.success(`${row.packingNo} moved to ${next}`);
    else toast.error(result.error?.message || 'Failed to update packing status');
    setAdvanceTarget(null);
    refresh();
    refreshStats();
  };

  const openUpdatePacking = (row) => {
    setUpdateTarget(row);
    setUpdateQty(String(row.packedQty || 0));
  };

  const confirmUpdatePacking = async () => {
    if (!updateTarget) return;
    const newPacked = Number(updateQty) || 0;
    if (newPacked < 0 || newPacked > updateTarget.qty) {
      toast.error(`Packed quantity must be between 0 and ${updateTarget.qty}`);
      return;
    }
    const result = await runMutation(() => logisticsService.updateManufacturing(updateTarget.id, {
      packedQty: newPacked,
      status: newPacked >= updateTarget.qty
        ? PACKING_STATUS.PACKED
        : newPacked > 0
          ? PACKING_STATUS.IN_PRODUCTION
          : updateTarget.status
    }));
    if (result.ok) toast.success(`${updateTarget.packingNo} packing updated`);
    else toast.error(result.error?.message || 'Failed to update packing');
    setUpdateTarget(null);
    refresh();
    refreshStats();
  };

  const handleRowAction = (key, row) => {
    if (key === 'view') navigate(`/purchase/logistics/manufacturing/${row.packingNo}`);
    else if (key === 'update') openUpdatePacking(row);
    else if (key === 'advance') advanceTargetRow(row);
    else if (key === 'shipment') navigate('/purchase/logistics/shipment/new', { state: { poNo: row.poNo, packingNo: row.packingNo } });
    else if (key === 'po') navigate(`/purchase/orders/${row.poNo}`);
  };

  const handleExport = async (type) => {
    try {
      const result = await logisticsService.getManufacturing({
        search,
        status: filters.status || 'All',
        page: 1,
        /* The backend caps a page at this size — export reads the widest
           page the API allows, never the whole table. */
        pageSize: RECEIVING_MAX_PAGE_SIZE
      });
      const rows = withDerivedQty(result.data);
      if (type === 'pdf') await exportPdf({ title: 'Manufacturing / Packing Jobs', columns, records: rows, filename: 'manufacturing-packing' });
      else if (type === 'excel') await exportExcel(columns, rows, 'manufacturing-packing');
      else if (type === 'csv') exportCsv(columns, rows, 'manufacturing-packing');
      else if (type === 'print') printTable('Manufacturing / Packing Jobs', columns, rows);
      toast.success('Packing jobs exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export packing jobs');
    }
  };

  const renderers = useMemo(
    () => ({
      packingNo: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/logistics/manufacturing/${row.packingNo}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.packingNo}
        </button>
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
      product: (row) => <span className="text-xs font-semibold text-slate-800">{row.product || '—'}</span>,
      qty: (row) => <span className="text-slate-600 tabular-nums">{Number(row.qty) || 0}</span>,
      packedQty: (row) => <span className="font-bold text-slate-800 tabular-nums">{Number(row.packedQty) || 0}</span>,
      balanceQty: (row) => {
        const balance = Math.max(0, (Number(row.qty) || 0) - (Number(row.packedQty) || 0));
        return <span className={`tabular-nums ${balance === 0 ? 'text-emerald-600 font-bold' : 'text-slate-600'}`}>{balance}</span>;
      },
      progress: (row) => {
        const ordered = Number(row.qty) || 0;
        const packed = Number(row.packedQty) || 0;
        const pct = ordered > 0 ? Math.round((packed / ordered) * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-sky-500'}`}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="text-[11px] font-bold text-slate-500">{pct}%</span>
          </div>
        );
      },
      expectedDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.expectedDate)}</span>,
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Manufacturing / Packing' }
        ],
        icon: Factory,
        title: 'Manufacturing / Packing',
        subtitle: 'Track production and packing progress for purchased goods',
        actions: (
          <>
            {canCreatePacking && (
            <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/logistics/manufacturing/new')}>
              <span className="erp-btn-icon"><Plus size={14} /></span> New Packing
            </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        )
      }}
      flowNav={<ModuleTabNav module="logistics" />}
      error={error}
      errorMessage="Failed to load packing jobs."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: {
          label: 'All Jobs',
          count: stats?.total ?? 0,
          active: !filters.status || filters.status === 'All',
          onSelect: showAllJobs
        },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: applyStatusFilter,
          ariaLabel: 'Packing status'
        }
      }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            {(searchInput || filters.status) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                resetFilters();
                setSearchInput('');
              }}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="packingSearchInput"
              placeholder="Search by packing no, PO, product, vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Packing Jobs"
            />
            <PurchaseExportDropdown buttonLabel="Export Jobs" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['packingNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [
          { key: 'export', label: 'Export', icon: Download },
          { key: 'markPacked', label: 'Mark Packed', icon: PackageCheck },
        ],
        onAction: async (key) => {
          if (key === 'export') {
            /* Bulk export writes the SELECTED rows (the bar says "n selected"). */
            if (selectedRecords.length === 0) { toast.info('No packing jobs selected to export'); return; }
            exportCsv(columns, withDerivedQty(selectedRecords), 'manufacturing-packing-selected');
            toast.success('Packing jobs exported');
          }
          else if (key === 'markPacked') {
            const valid = selectedRecords
              .filter((r) => r.status === PACKING_STATUS.IN_PRODUCTION || r.status === PACKING_STATUS.PACKED);
            if (valid.length === 0) { toast.info('No eligible records selected'); return; }
            let successCount = 0;
            for (const row of valid) {
              const result = await runMutation(() => logisticsService.updateManufacturing(row.id, {
                status: PACKING_STATUS.PACKED,
                packedQty: row.qty
              }));
              if (result.ok) successCount++;
            }
            if (successCount > 0) toast.success(`${successCount} job(s) marked as Packed`);
            else toast.error('Failed to update packing status');
            setSelectedIds([]);
            refresh();
            refreshStats();
          }
        },
        id: 'mfgBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected: records.length > 0 && records.every((row) => selectedIds.includes(row.id)),
        someSelected: selectedIds.length > 0 && !(records.length > 0 && records.every((row) => selectedIds.includes(row.id))),
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        idColumn: 'packingNo',
        tableId: 'packingTable',
        alignCenter: ['progress', 'status'],
        alignRight: ['qty', 'packedQty', 'balanceQty'],
        rowActions: (row) => {
          const actions = [];
          actions.push({ key: 'view', label: 'View Details', icon: Eye });
          if (row.status === PACKING_STATUS.IN_PRODUCTION || row.status === PACKING_STATUS.PACKED) {
            actions.push({ key: 'update', label: 'Update Packing', icon: PackageCheck });
          }
          if (row.status !== PACKING_STATUS.READY_TO_SHIP) {
            actions.push({
              key: 'advance',
              label: `Mark ${row.status === PACKING_STATUS.IN_PRODUCTION ? 'Packed' : 'Ready to Ship'}`,
              icon: CheckCircle2
            });
          }
          if (row.status === PACKING_STATUS.READY_TO_SHIP) {
            actions.push({ key: 'shipment', label: 'Create Shipment', icon: Ship });
          }
          actions.push({ key: 'po', label: 'View PO', icon: Truck });
          return actions;
        },
        onRowAction: handleRowAction,
        emptyContent: (
          search ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Jobs"
              message="No packing jobs matching your search criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => {
                  resetFilters();
                  setSearchInput('');
                }}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={LayoutList}
              title="No Jobs Found"
              message="No manufacturing / packing jobs found."
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
      <ConfirmDialog
        open={advanceTarget !== null}
        title="Advance packing stage?"
        message={`${advanceTarget?.row?.packingNo} will be moved to ${advanceTarget?.next}.`}
        confirmLabel="Advance"
        variant="default"
        icon={CheckCircle2}
        loading={actionLoading}
        onConfirm={confirmAdvance}
        onCancel={() => setAdvanceTarget(null)}
      />

      <Modal
        open={updateTarget !== null}
        onClose={() => { setUpdateTarget(null); setUpdateQty(''); }}
        title={`Update Packing — ${updateTarget?.packingNo}`}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setUpdateTarget(null); setUpdateQty(''); }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmUpdatePacking}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Update
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">Ordered Quantity</span>
            <span className="font-bold text-slate-800">{updateTarget?.qty || 0}</span>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Packed Quantity
            </label>
            <NumberInput
              min="0"
              max={updateTarget?.qty || 0}
              value={updateQty}
              onChange={(e) => setUpdateQty(e.target.value)}
              ariaLabel="Packed quantity"
            />
            <p className="text-[10px] text-slate-400 mt-1">Max: {updateTarget?.qty || 0} (cannot exceed ordered qty)</p>
          </div>
          {updateTarget && (
            <div className="flex items-center justify-between text-xs rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
              <span className="text-slate-500">Balance</span>
              <span className="font-bold text-slate-800">{Math.max(0, (updateTarget.qty || 0) - (Number(updateQty) || 0))}</span>
            </div>
          )}
        </div>
      </Modal>
    </PurchaseListPage>
  );
}
