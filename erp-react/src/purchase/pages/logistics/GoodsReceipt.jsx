/**
 * purchase/pages/logistics/GoodsReceipt.jsx
 * ------------------------------------------------------------------
 * Goods Receipt (GRN) — record and track goods receipts against
 * purchase orders with status tabs, row actions, and proper
 * PO/shipment relationships.
 *
 * Route: /purchase/logistics/grn
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Clock3, Download, Edit3, Eye, LayoutList, Loader2, PackageCheck,
  Plus, Receipt, RefreshCw, Search, Send, Truck, X
} from 'lucide-react';
import { Modal, NumberInput, SelectInput, TextInput, useToast } from '../../components/ui';
import {
  PurchaseListPage, PurchaseSearch, PurchaseEmptyState,
  PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell
} from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { logisticsService, GRN_STATUS, RECEIVING_MAX_PAGE_SIZE, grnsStore } from '../../services/logistics';
import { invoiceCoverage } from '../../services/invoice';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { nextSeqNo } from '../../utils/purchase';
import { APPROVAL_STATUS } from '../../constants';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  { key: 'grnNo', label: 'GRN No', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'poNo', label: 'PO No', width: 140, sortable: true, visible: true },
  { key: 'shipmentNo', label: 'Shipment No', width: 140, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'receivedOn', label: 'Received On', width: 120, sortable: true, visible: true },
  { key: 'lineCount', label: 'Lines', width: 70, sortable: true, visible: true, align: 'center' },
  { key: 'orderedQty', label: 'Ordered Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'receivedQty', label: 'Received Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'balanceQty', label: 'Balance Qty', width: 110, sortable: true, visible: true, align: 'right' },
  { key: 'status', label: 'Status', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const STATUS_SEGMENTS = [
  { key: GRN_STATUS.EXPECTED, label: 'Expected' },
  { key: GRN_STATUS.RECEIVED, label: 'Received' },
  { key: GRN_STATUS.PENDING_INSPECTION, label: 'Pending Inspection' }
];

const KPI_DEFS = [
  { key: 'total', label: 'Total GRNs', icon: PackageCheck, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'expected', label: 'Expected', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'received', label: 'Received', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'pendingInspection', label: 'Pending Inspection', icon: Truck, color: '#0ea5e9', bg: 'rgba(14,165,233,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function GoodsReceipt() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreateGrn = can('grn', 'create');
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await logisticsService.getGrns({
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
  const [receiveTarget, setReceiveTarget] = useState(null);
  const [qtyInputs, setQtyInputs] = useState({});
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editQtyInputs, setEditQtyInputs] = useState({});
  const [releasedPOs, setReleasedPOs] = useState([]);
  const [selectedPo, setSelectedPo] = useState('');
  const [userGrnNo, setUserGrnNo] = useState('');
  const [shipmentNo, setShipmentNo] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeKpi, setActiveKpi] = useState('total');

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
    logisticsService
      .getGrnStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const refreshStats = () => {
    logisticsService.getGrnStats().then(setStats).catch(() => {});
  };

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'grnNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats?.[def.key] ?? 0) }));
  const selectKpi = (key) => {
    const newKey = activeKpi === key ? 'total' : key;
    setActiveKpi(newKey);
    if (newKey === 'total') {
      setFilter('status', 'All');
    } else if (newKey === 'expected') {
      setFilter('status', GRN_STATUS.EXPECTED);
    } else if (newKey === 'received') {
      setFilter('status', GRN_STATUS.RECEIVED);
    } else if (newKey === 'pendingInspection') {
      setFilter('status', GRN_STATUS.PENDING_INSPECTION);
    }
  };
  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: seg.key === GRN_STATUS.EXPECTED ? stats?.expected ?? 0
      : seg.key === GRN_STATUS.RECEIVED ? stats?.received ?? 0
      : stats?.pendingInspection ?? 0
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  /* ─── Receive Goods ─── */
  const confirmReceive = async () => {
    if (!receiveTarget) return;
    const items = (receiveTarget.items || []).map((item) => ({
      product: item.product,
      received: Number(qtyInputs[item.product] ?? item.qty) || 0
    }));
    const result = await runMutation(() => logisticsService.receiveGoods(receiveTarget.id, items));
    if (result.ok) toast.success(`${receiveTarget.grnNo} goods received`);
    else toast.error(result.error?.message || 'Failed to receive goods');
    setReceiveTarget(null);
    setQtyInputs({});
    refresh();
    refreshStats();
  };

  /* ─── Edit GRN ─── */
  const confirmEdit = async () => {
    if (!editTarget) return;
    const items = (editTarget.items || []).map((item) => ({
      product: item.product,
      qty: Number(editQtyInputs[item.product] ?? item.qty) || 0,
      received: item.received || 0
    }));
    const result = await runMutation(() => logisticsService.updateGrn(editTarget.id, { items }));
    if (result.ok) toast.success(`${editTarget.grnNo} updated`);
    else toast.error(result.error?.message || 'Failed to update GRN');
    setEditTarget(null);
    setEditQtyInputs({});
    refresh();
    refreshStats();
  };

  /* ─── Send to Inspection ─── */
  const handleSendToInspection = useCallback(async (row) => {
    const result = await runMutation(() => logisticsService.sendToInspection(row.id));
    if (result.ok) toast.success(`${row.grnNo} sent to inspection`);
    else toast.error(result.error?.message || 'Failed to send to inspection');
    refresh();
    refreshStats();
  }, [runMutation, toast, refresh]);

  /* ─── Row Actions ─── */
  const handleRowAction = useCallback((key, row) => {
    if (key === 'view') navigate(`/purchase/logistics/grn/${row.grnNo}`);
    else if (key === 'view-po') navigate(`/purchase/orders/${row.poNo}`);
    else if (key === 'view-shipment') {
      if (row.shipmentNo) navigate(`/purchase/logistics/shipment/${row.shipmentNo}`);
      else toast.info('No shipment linked to this GRN');
    }
    else if (key === 'receive') {
      setQtyInputs((row.items || []).reduce((acc, item) => ({ ...acc, [item.product]: item.qty }), {}));
      setReceiveTarget(row);
    }
    else if (key === 'edit') {
      setEditQtyInputs((row.items || []).reduce((acc, item) => ({ ...acc, [item.product]: item.qty }), {}));
      setEditTarget(row);
    }
    else if (key === 'invoice') {
      const coverage = invoiceCoverage({ poNo: row.poNo, grnNo: row.grnNo });
      if (coverage.invoices.length > 0) {
        navigate(`/purchase/invoices/${coverage.invoices[0]}`);
      } else {
        navigate(`/purchase/invoices/new?grn=${encodeURIComponent(row.grnNo)}&po=${encodeURIComponent(row.poNo)}`);
      }
    }
  }, [navigate, toast, handleSendToInspection]);

  const buildRowActions = useCallback((row) => {
    const actions = [
      { key: 'view', label: 'View GRN', icon: Eye },
    ];
    if (row.status === GRN_STATUS.EXPECTED) {
      actions.push({ key: 'edit', label: 'Edit GRN', icon: Edit3 });
      actions.push({ key: 'receive', label: 'Receive Goods', icon: PackageCheck });
    }
    if (row.status === GRN_STATUS.PENDING_INSPECTION) {
      actions.push({ key: 'inspection', label: 'Send to Inspection', icon: Send });
    }
    if (row.status !== GRN_STATUS.EXPECTED) {
      const receivedQty = (row.items || []).reduce((sum, item) => sum + (Number(item.received) || 0), 0);
      if (receivedQty > 0) {
        const coverage = invoiceCoverage({ poNo: row.poNo, grnNo: row.grnNo });
        actions.push({
          key: 'invoice',
          label: coverage.invoices.length > 0 ? 'View Invoice' : 'Create Invoice',
          icon: Receipt
        });
      }
    }
    actions.push({ key: 'view-po', label: 'View PO', icon: Truck });
    if (row.shipmentNo) {
      actions.push({ key: 'view-shipment', label: 'View Shipment', icon: Truck });
    }
    return actions;
  }, []);

  /* ─── Create GRN (legacy modal trigger; page-level create uses /new) ─── */
  // eslint-disable-next-line no-unused-vars -- kept as the trigger for the inline create modal
  const openCreateGrn = async () => {
    setCreateOpen(true);
    setSelectedPo('');
    setShipmentNo('');
    setWarehouse('');
    setUserGrnNo(nextSeqNo(grnsStore.all, 'GRN', 'grnNo', 4200));
    try {
      const response = await purchaseOrderService.getOrders({ page: 1, pageSize: 500 });
      setReleasedPOs(response.data.filter((order) => order.approvalStatus === APPROVAL_STATUS.APPROVED));
    } catch {
      setReleasedPOs([]);
    }
  };

  const confirmCreateGrn = async () => {
    if (!selectedPo) {
      toast.error('Select a released purchase order');
      return;
    }
    const result = await runMutation(() =>
      logisticsService.createGrn(selectedPo, { grnNo: userGrnNo, shipmentNo, warehouse })
    );
    if (result.ok) toast.success(`GRN created for ${selectedPo}`);
    else toast.error(result.error?.message || 'Failed to create goods receipt');
    setCreateOpen(false);
    setSelectedPo('');
    refresh();
    refreshStats();
  };

  /* ─── Export ─── */
  const handleExport = async (type) => {
    try {
      const result = await logisticsService.getGrns({
        search,
        status: filters.status || 'All',
        page: 1,
        /* The backend caps a page at this size — export reads the widest
           page the API allows, never the whole table. */
        pageSize: RECEIVING_MAX_PAGE_SIZE
      });
      if (type === 'csv') exportCsv(columns, result.data, 'goods-receipt');
      toast.success('Goods receipts exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export goods receipts');
    }
  };

  /* ─── Cell Renderers ─── */
  const renderers = useMemo(
    () => ({
      grnNo: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/logistics/grn/${row.grnNo}`)}
          className="font-bold text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.grnNo}
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
      shipmentNo: (row) => (
        row.shipmentNo ? (
          <button
            type="button"
            onClick={() => navigate(`/purchase/logistics/shipment/${row.shipmentNo}`)}
            className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
          >
            {row.shipmentNo}
          </button>
        ) : <span className="text-slate-400">—</span>
      ),
      vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
      receivedOn: (row) => (
        <span className="text-slate-500 whitespace-nowrap">
          {row.receivedOn ? formatDate(row.receivedOn) : '—'}
        </span>
      ),
      lineCount: (row) => <span className="text-slate-600 tabular-nums">{row.items?.length || 0}</span>,
      orderedQty: (row) => (
        <span className="text-slate-600 tabular-nums">
          {row.items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 0}
        </span>
      ),
      receivedQty: (row) => (
        <span className="font-bold text-slate-800 tabular-nums">
          {row.items?.reduce((sum, item) => sum + Number(item.received || 0), 0) || 0}
        </span>
      ),
      balanceQty: (row) => {
        const ordered = row.items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 0;
        const received = row.items?.reduce((sum, item) => sum + Number(item.received || 0), 0) || 0;
        const balance = Math.max(0, ordered - received);
        return (
          <span className={`tabular-nums ${balance > 0 ? 'text-amber-600 font-semibold' : 'text-emerald-600 font-bold'}`}>
            {balance}
          </span>
        );
      },
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Goods Receipt (GRN)' }
        ],
        icon: PackageCheck,
        title: 'Goods Receipt (GRN)',
        subtitle: 'Record goods received against Purchase Orders.',
        actions: (
          <>
            {canCreateGrn && (
            <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/logistics/grn/new')}>
              <span className="erp-btn-icon"><Plus size={14} /></span> New GRN
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
      errorMessage="Failed to load goods receipts."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { label: 'All GRNs', count: stats?.total ?? 0, onSelect: () => setFilter('status', 'All') },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: (status) => setFilter('status', status),
          ariaLabel: 'Goods receipt status'
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="grnSearchInput"
              placeholder="Search by GRN no, PO, vendor..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Goods Receipts"
            />
            <PurchaseExportDropdown buttonLabel="Export GRNs" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['grnNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [
          { key: 'export', label: 'Export', icon: Download },
          { key: 'receive', label: 'Mark Received', icon: PackageCheck },
          { key: 'inspection', label: 'Send to Inspection', icon: Send },
        ],
        onAction: async (key) => {
          if (key === 'export') handleExport('csv');
          else if (key === 'receive') {
            const valid = selectedIds.map((id) => records.find((r) => r.grnNo === id)).filter(Boolean)
              .filter((r) => r.status === GRN_STATUS.EXPECTED);
            if (valid.length === 0) { toast.info('No expected GRNs selected'); return; }
            let successCount = 0;
            for (const row of valid) {
              const result = await runMutation(() => logisticsService.receiveGoods(row.id, []));
              if (result.ok) successCount++;
            }
            if (successCount > 0) toast.success(`${successCount} GRN(s) received`);
            else toast.error('Failed to receive goods');
            setSelectedIds([]);
            refresh();
            refreshStats();
          }
          else if (key === 'inspection') {
            const valid = selectedIds.map((id) => records.find((r) => r.grnNo === id)).filter(Boolean)
              .filter((r) => r.status === GRN_STATUS.PENDING_INSPECTION);
            if (valid.length === 0) { toast.info('No GRNs pending inspection selected'); return; }
            let successCount = 0;
            for (const row of valid) {
              const result = await runMutation(() => logisticsService.sendToInspection(row.id));
              if (result.ok) successCount++;
            }
            if (successCount > 0) toast.success(`${successCount} GRN(s) sent to inspection`);
            else toast.error('Failed to send to inspection');
            setSelectedIds([]);
            refresh();
            refreshStats();
          }
        },
        id: 'grnBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected: records.length > 0 && records.every((row) => selectedIds.includes(row.grnNo)),
        someSelected: selectedIds.length > 0 && !(records.length > 0 && records.every((row) => selectedIds.includes(row.grnNo))),
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.grnNo) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        idColumn: 'grnNo',
        tableId: 'grnTable',
        alignCenter: ['lineCount', 'status'],
        alignRight: ['orderedQty', 'receivedQty', 'balanceQty'],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        onRowClick: (row) => navigate(`/purchase/logistics/grn/${row.grnNo}`),
        emptyContent: (
          search ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching GRNs"
              message="No goods receipts matching your search criteria."
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
              title="No GRNs Found"
              message="No goods receipts found matching your criteria."
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
      {/* ── Create GRN Modal ── */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Goods Receipt (GRN)"
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCreateGrn}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create GRN
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Creates a goods receipt against a released purchase order. You can then post
            the receipt (full or partial) from the GRN list.
          </p>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              GRN Number
            </label>
            <input
              type="text"
              value={userGrnNo}
              onChange={(e) => setUserGrnNo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-[#0B4A3D] focus:ring-1 focus:ring-[#0B4A3D] outline-none"
              placeholder="Auto-generated"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Purchase Order
            </label>
            <SelectInput value={selectedPo} onChange={(e) => setSelectedPo(e.target.value)}>
              <option value="">Select released PO</option>
              {releasedPOs.map((order) => (
                <option key={order.poNo} value={order.poNo}>
                  {order.poNo} — {order.vendor}
                </option>
              ))}
            </SelectInput>
          </div>
          <TextInput
            label="Shipment No (optional)"
            value={shipmentNo}
            onChange={(e) => setShipmentNo(e.target.value)}
            placeholder="e.g. SHP-2026-021"
          />
          <TextInput
            label="Warehouse"
            value={warehouse}
            onChange={(e) => setWarehouse(e.target.value)}
            placeholder="e.g. Plant A Store, Pune"
          />
        </div>
      </Modal>

      {/* ── Receive Goods Modal ── */}
      <Modal
        open={receiveTarget !== null}
        onClose={() => { setReceiveTarget(null); setQtyInputs({}); }}
        title={`Receive Goods — ${receiveTarget?.grnNo}`}
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => { setReceiveTarget(null); setQtyInputs({}); }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReceive}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Post Receipt
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Enter the quantity actually received per line. Partial receipts keep the PO at{' '}
            <strong>Partial</strong> until the full ordered quantity arrives.
          </p>
          {(receiveTarget?.items || []).map((item) => (
            <div
              key={item.product}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{item.product}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Ordered: {item.qty}</div>
              </div>
              <div className="w-28 shrink-0">
                <NumberInput
                  min="0"
                  max={item.qty}
                  value={qtyInputs[item.product] ?? item.qty}
                  onChange={(e) => setQtyInputs((prev) => ({ ...prev, [item.product]: e.target.value }))}
                  ariaLabel={`Received quantity for ${item.product}`}
                />
              </div>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Edit GRN Modal ── */}
      <Modal
        open={editTarget !== null}
        onClose={() => { setEditTarget(null); setEditQtyInputs({}); }}
        title={`Edit GRN — ${editTarget?.grnNo}`}
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => { setEditTarget(null); setEditQtyInputs({}); }}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEdit}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Adjust the ordered quantities for each line before receiving goods.
          </p>
          {(editTarget?.items || []).map((item) => (
            <div
              key={item.product}
              className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{item.product}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Current qty: {item.qty}</div>
              </div>
              <div className="w-28 shrink-0">
                <NumberInput
                  min="0"
                  value={editQtyInputs[item.product] ?? item.qty}
                  onChange={(e) => setEditQtyInputs((prev) => ({ ...prev, [item.product]: e.target.value }))}
                  ariaLabel={`Ordered quantity for ${item.product}`}
                />
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </PurchaseListPage>
  );
}
