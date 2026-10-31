/**
 * purchase/pages/logistics/ShipmentTracking.jsx
 * ------------------------------------------------------------------
 * Shipment Tracking — monitor inbound shipments from vendors with
 * status tabs (Pending / In Transit / Delivered / Delayed), linked
 * to PO and packing records. Built on the shared Purchase list kit
 * so it matches the master list design.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  CheckCircle2, Clock3, Download, Edit3, Eye, LayoutList, PackageCheck, Plus, RefreshCw,
  Search, Ship, Truck, X
} from 'lucide-react';
import { ConfirmDialog, DateInput, Modal, SelectInput, TextInput, useToast } from '../../components/ui';
import { PurchaseListPage, PurchaseSearch, PurchaseEmptyState, PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseStatusCell } from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { logisticsService, RECEIVING_MAX_PAGE_SIZE, SHIPMENT_STATUS } from '../../services/logistics';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { APPROVAL_STATUS, TRANSPORT_MODES } from '../../constants';

import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  { key: 'shipmentNo', label: 'Shipment No', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'poNo', label: 'PO No', width: 140, sortable: true, visible: true },
  { key: 'packingNo', label: 'Packing No', width: 130, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'carrier', label: 'Carrier', width: 160, sortable: true, visible: true },
  { key: 'mode', label: 'Mode', width: 90, sortable: true, visible: true, align: 'center' },
  { key: 'dispatchDate', label: 'Dispatch', width: 120, sortable: true, visible: true },
  { key: 'etd', label: 'ETD', width: 120, sortable: true, visible: true },
  { key: 'eta', label: 'ETA', width: 120, sortable: true, visible: true },
  { key: 'trackingNo', label: 'Tracking No', width: 130, sortable: true, visible: true },
  { key: 'destination', label: 'Destination', width: 160, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const STATUS_SEGMENTS = [
  { key: SHIPMENT_STATUS.PENDING, label: 'Pending Dispatch' },
  { key: SHIPMENT_STATUS.IN_TRANSIT, label: 'In Transit' },
  { key: SHIPMENT_STATUS.DELIVERED, label: 'Delivered' },
  { key: SHIPMENT_STATUS.DELAYED, label: 'Delayed' }
];

const KPI_DEFS = [
  { key: 'total', label: 'Total Shipments', icon: Ship, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pending', label: 'Pending Dispatch', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'inTransit', label: 'In Transit', icon: Truck, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'delayed', label: 'Delayed', icon: Clock3, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function ShipmentTracking() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreateShipment = can('shipments', 'create');
  const location = useLocation();
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await logisticsService.getShipments({
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
  const [statusTarget, setStatusTarget] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [trackingTarget, setTrackingTarget] = useState(null);
  const [trackingNo, setTrackingNo] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [releasedPOs, setReleasedPOs] = useState([]);
  const [shipForm, setShipForm] = useState({ poNo: '', packingNo: '', carrier: '', mode: 'Road', etd: '', eta: '', destination: '' });
  const [activeKpi, setActiveKpi] = useState('total');

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Auto-redirect to Shipment form when navigated from Manufacturing/Packing
     with pre-filled PO and packing number. */
  const navStateRef = useRef(location.state);
  useEffect(() => {
    const navState = navStateRef.current;
    if (navState?.poNo) {
      navStateRef.current = null;
      window.history.replaceState({}, document.title);
      navigate('/purchase/logistics/shipment/new', { state: navState });
    }
  }, []);

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
      .getShipmentStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStats = () => {
    logisticsService.getShipmentStats().then(setStats).catch(() => {});
  };

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'shipmentNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats?.[def.key] ?? 0) }));
  const selectKpi = (key) => {
    const newKey = activeKpi === key ? 'total' : key;
    setActiveKpi(newKey);
    if (newKey === 'total') {
      setFilter('status', 'All');
    } else if (newKey === 'pending') {
      setFilter('status', SHIPMENT_STATUS.PENDING);
    } else if (newKey === 'inTransit') {
      setFilter('status', SHIPMENT_STATUS.IN_TRANSIT);
    } else if (newKey === 'delivered') {
      setFilter('status', SHIPMENT_STATUS.DELIVERED);
    } else if (newKey === 'delayed') {
      setFilter('status', SHIPMENT_STATUS.DELAYED);
    }
  };
  const statKeyFor = (status) => {
    if (status === SHIPMENT_STATUS.PENDING) return 'pending';
    if (status === SHIPMENT_STATUS.IN_TRANSIT) return 'inTransit';
    if (status === SHIPMENT_STATUS.DELIVERED) return 'delivered';
    if (status === SHIPMENT_STATUS.DELAYED) return 'delayed';
    return null;
  };
  const segments = STATUS_SEGMENTS.map((seg) => ({
    ...seg,
    count: stats?.[statKeyFor(seg.key)] ?? 0
  }));

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const confirmStatus = async () => {
    if (!statusTarget) return;
    const { row, status } = statusTarget;
    const result = await runMutation(() => logisticsService.updateShipment(row.id, { status }));
    if (result.ok) toast.success(`${row.shipmentNo} marked as ${status.toLowerCase()}`);
    else toast.error(result.error?.message || 'Failed to update shipment');
    setStatusTarget(null);
    refresh();
    refreshStats();
  };

  const openCreate = async () => {
    setCreateOpen(true);
    setShipForm({ poNo: '', packingNo: '', carrier: '', mode: 'Road', etd: '', eta: '', destination: '' });
    try {
      const response = await purchaseOrderService.getOrders({ page: 1, pageSize: 500 });
      setReleasedPOs(response.data.filter((order) => order.approvalStatus === APPROVAL_STATUS.APPROVED));
    } catch {
      setReleasedPOs([]);
    }
  };

  const confirmCreate = async () => {
    if (!shipForm.poNo) {
      toast.error('Select a released purchase order');
      return;
    }
    const result = await runMutation(() =>
      logisticsService.createShipment({
        poNo: shipForm.poNo,
        packingNo: shipForm.packingNo,
        carrier: shipForm.carrier,
        mode: shipForm.mode,
        etd: shipForm.etd,
        eta: shipForm.eta,
        destination: shipForm.destination
      })
    );
    if (result.ok) toast.success(`Shipment created for ${shipForm.poNo}`);
    else toast.error(result.error?.message || 'Failed to create shipment');
    setCreateOpen(false);
    refresh();
    refreshStats();
  };

  const openEdit = (row) => {
    setEditTarget(row);
  };

  const confirmEdit = async () => {
    if (!editTarget) return;
    const result = await runMutation(() => logisticsService.updateShipment(editTarget.id, {
      carrier: editTarget.carrier,
      mode: editTarget.mode,
      destination: editTarget.destination,
      notes: editTarget.notes
    }));
    if (result.ok) toast.success(`${editTarget.shipmentNo} updated`);
    else toast.error(result.error?.message || 'Failed to update shipment');
    setEditTarget(null);
    refresh();
    refreshStats();
  };

  const openUpdateTracking = (row) => {
    setTrackingTarget(row);
    setTrackingNo(row.trackingNo || '');
  };

  const confirmUpdateTracking = async () => {
    if (!trackingTarget) return;
    const result = await runMutation(() => logisticsService.updateShipment(trackingTarget.id, {
      trackingNo: trackingNo.trim()
    }));
    if (result.ok) toast.success(`${trackingTarget.shipmentNo} tracking updated`);
    else toast.error(result.error?.message || 'Failed to update tracking');
    setTrackingTarget(null);
    setTrackingNo('');
    refresh();
    refreshStats();
  };

  /* ─── Create GRN from delivered shipment ─── */
  const handleCreateGrnFromShipment = async (row) => {
    if (!row.poNo) {
      toast.error('Shipment has no linked PO');
      return;
    }
    const result = await runMutation(() =>
      logisticsService.createGrn(row.poNo, { shipmentNo: row.shipmentNo, warehouse: row.destination || '' })
    );
    if (result.ok) toast.success(`GRN ${result.data?.grnNo || ''} created for ${row.poNo}`);
    else toast.error(result.error?.message || 'Failed to create GRN');
    refresh();
    refreshStats();
  };

  const handleRowAction = (key, row) => {
    if (key === 'view') navigate(`/purchase/logistics/shipment/${row.shipmentNo}`);
    else if (key === 'edit') openEdit(row);
    else if (key === 'dispatch') setStatusTarget({ row, status: SHIPMENT_STATUS.IN_TRANSIT });
    else if (key === 'tracking') openUpdateTracking(row);
    else if (key === 'transit') setStatusTarget({ row, status: SHIPMENT_STATUS.IN_TRANSIT });
    else if (key === 'deliver') setStatusTarget({ row, status: SHIPMENT_STATUS.DELIVERED });
    else if (key === 'po') navigate(`/purchase/orders/${row.poNo}`);
    else if (key === 'packing' && row.packingNo) navigate(`/purchase/logistics/manufacturing/${row.packingNo}`);
    else if (key === 'create-grn') handleCreateGrnFromShipment(row);
  };

  const handleExport = async (type) => {
    try {
      const result = await logisticsService.getShipments({
        search,
        status: filters.status || 'All',
        page: 1,
        /* The backend caps a page at this size — export reads the widest
           page the API allows, never the whole table. */
        pageSize: RECEIVING_MAX_PAGE_SIZE
      });
      if (type === 'csv') exportCsv(columns, result.data, 'shipment-tracking');
      toast.success('Shipments exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export shipments');
    }
  };

  const renderers = useMemo(
    () => ({
      shipmentNo: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/logistics/shipment/${row.shipmentNo}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.shipmentNo}
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
      packingNo: (row) => row.packingNo ? (
        <button
          type="button"
          onClick={() => navigate(`/purchase/logistics/manufacturing/${row.packingNo}`)}
          className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.packingNo}
        </button>
      ) : <span className="text-slate-400">—</span>,
      vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
      mode: (row) => (
        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{row.mode}</span>
      ),
      dispatchDate: (row) => <span className="text-slate-500 whitespace-nowrap">{row.dispatchDate ? formatDate(row.dispatchDate) : '—'}</span>,
      etd: (row) => <span className="text-slate-500 whitespace-nowrap">{row.etd ? formatDate(row.etd) : '—'}</span>,
      eta: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.eta)}</span>,
      trackingNo: (row) => <span className="text-slate-600 font-mono">{row.trackingNo || '—'}</span>,
      destination: (row) => <span className="text-slate-600 truncate" title={row.destination}>{row.destination || '—'}</span>,
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Shipment Tracking' }
        ],
        icon: Ship,
        title: 'Shipment Tracking',
        subtitle: 'Monitor inbound shipments and delivery status',
        actions: (
          <>
            {canCreateShipment && (
            <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/logistics/shipment/new')}>
              <span className="erp-btn-icon"><Plus size={14} /></span> New Shipment
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
      errorMessage="Failed to load shipments."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        primary: { label: 'All Shipments', count: stats?.total ?? 0, onSelect: () => setFilter('status', 'All') },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: (status) => setFilter('status', status),
          ariaLabel: 'Shipment status'
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
              id="shipmentSearchInput"
              placeholder="Search by shipment no, PO, vendor, carrier..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Shipments"
            />
            <PurchaseExportDropdown buttonLabel="Export Shipments" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['shipmentNo', 'actions']}
            />
          </>
        )
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [
          { key: 'export', label: 'Export', icon: Download },
          { key: 'updateStatus', label: 'Update Status', icon: CheckCircle2 },
        ],
        onAction: async (key) => {
          if (key === 'export') handleExport('csv');
          else if (key === 'updateStatus') {
            const valid = selectedIds.map((id) => records.find((r) => r.shipmentNo === id)).filter(Boolean)
              .filter((r) => r.status !== SHIPMENT_STATUS.DELIVERED);
            if (valid.length === 0) { toast.info('No eligible shipments selected'); return; }
            let successCount = 0;
            for (const row of valid) {
              const nextStatus = row.status === SHIPMENT_STATUS.PENDING ? SHIPMENT_STATUS.IN_TRANSIT : SHIPMENT_STATUS.DELIVERED;
              const result = await runMutation(() => logisticsService.updateShipment(row.id, { status: nextStatus }));
              if (result.ok) successCount++;
            }
            if (successCount > 0) toast.success(`${successCount} shipment(s) status updated`);
            else toast.error('Failed to update shipment statuses');
            setSelectedIds([]);
            refresh();
            refreshStats();
          }
        },
        id: 'shipmentBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected: records.length > 0 && records.every((row) => selectedIds.includes(row.shipmentNo)),
        someSelected: selectedIds.length > 0 && !(records.length > 0 && records.every((row) => selectedIds.includes(row.shipmentNo))),
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.shipmentNo) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        idColumn: 'shipmentNo',
        tableId: 'shipmentTable',
        alignCenter: ['mode', 'status'],
        rowActions: (row) => {
          const actions = [];
          actions.push({ key: 'view', label: 'View Details', icon: Eye });
          if (row.status === SHIPMENT_STATUS.PENDING) {
            actions.push({ key: 'dispatch', label: 'Mark Dispatched', icon: CheckCircle2 });
          }
          if (row.status === SHIPMENT_STATUS.IN_TRANSIT || row.status === SHIPMENT_STATUS.PENDING) {
            actions.push({ key: 'tracking', label: 'Update Tracking', icon: Edit3 });
          }
          if (row.status === SHIPMENT_STATUS.IN_TRANSIT) {
            actions.push({ key: 'deliver', label: 'Mark Delivered', icon: CheckCircle2 });
          }
          if (row.status !== SHIPMENT_STATUS.DELIVERED) {
            actions.push({ key: 'edit', label: 'Edit Shipment', icon: Edit3 });
          }
          if (row.status === SHIPMENT_STATUS.DELIVERED && row.poNo) {
            actions.push({ key: 'create-grn', label: 'Create GRN', icon: PackageCheck });
          }
          actions.push({ key: 'po', label: 'View PO', icon: Truck });
          if (row.packingNo) {
            actions.push({ key: 'packing', label: 'View Packing', icon: Ship });
          }
          return actions;
        },
        onRowAction: handleRowAction,
        emptyContent: (
          search ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Shipments"
              message="No shipments matching your search criteria."
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
              title="No Shipments Found"
              message="No shipments found matching your criteria."
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
        open={statusTarget !== null}
        title={statusTarget?.status === SHIPMENT_STATUS.DELIVERED ? 'Mark shipment delivered?' : 'Mark shipment in transit?'}
        message={`${statusTarget?.row?.shipmentNo} will be marked as ${statusTarget?.status?.toLowerCase()}.`}
        confirmLabel={statusTarget?.status === SHIPMENT_STATUS.DELIVERED ? 'Delivered' : 'In Transit'}
        variant={statusTarget?.status === SHIPMENT_STATUS.DELAYED ? 'danger' : 'default'}
        icon={statusTarget?.status === SHIPMENT_STATUS.DELIVERED ? CheckCircle2 : Truck}
        loading={actionLoading}
        onConfirm={confirmStatus}
        onCancel={() => setStatusTarget(null)}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Shipment"
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmCreate}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Shipment
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Purchase Order
            </label>
            <SelectInput value={shipForm.poNo} onChange={(e) => setShipForm((f) => ({ ...f, poNo: e.target.value }))}>
              <option value="">Select released PO</option>
              {releasedPOs.map((order) => (
                <option key={order.poNo} value={order.poNo}>
                  {order.poNo} — {order.vendor}
                </option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Packing No (optional)
            </label>
            <TextInput value={shipForm.packingNo} onChange={(e) => setShipForm((f) => ({ ...f, packingNo: e.target.value }))} placeholder="e.g. MFR-2026-014" />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
              Carrier
            </label>
            <TextInput value={shipForm.carrier} onChange={(e) => setShipForm((f) => ({ ...f, carrier: e.target.value }))} placeholder="e.g. Blue Dart Freight" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Mode</label>
              <SelectInput value={shipForm.mode} onChange={(e) => setShipForm((f) => ({ ...f, mode: e.target.value }))}>
                {TRANSPORT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{mode}</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                Destination
              </label>
              <TextInput value={shipForm.destination} onChange={(e) => setShipForm((f) => ({ ...f, destination: e.target.value }))} placeholder="e.g. Plant A Store, Pune" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                ETD (Estimated Departure)
              </label>
              <DateInput
                value={shipForm.etd}
                onChange={(e) => setShipForm((f) => ({ ...f, etd: e.target.value }))}
                ariaLabel="Estimated time of departure"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">
                ETA (Estimated Arrival)
              </label>
              <DateInput
                value={shipForm.eta}
                onChange={(e) => setShipForm((f) => ({ ...f, eta: e.target.value }))}
                ariaLabel="Estimated time of arrival"
              />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={`Edit Shipment — ${editTarget?.shipmentNo}`}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmEdit}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Changes
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Carrier</label>
            <TextInput value={editTarget?.carrier || ''} onChange={(e) => setEditTarget((t) => ({ ...t, carrier: e.target.value }))} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Mode</label>
            <SelectInput value={editTarget?.mode || 'Road'} onChange={(e) => setEditTarget((t) => ({ ...t, mode: e.target.value }))}>
              {TRANSPORT_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Destination</label>
            <TextInput value={editTarget?.destination || ''} onChange={(e) => setEditTarget((t) => ({ ...t, destination: e.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={trackingTarget !== null}
        onClose={() => { setTrackingTarget(null); setTrackingNo(''); }}
        title={`Update Tracking — ${trackingTarget?.shipmentNo}`}
        maxWidth="max-w-sm"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setTrackingTarget(null); setTrackingNo(''); }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmUpdateTracking}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Update
            </button>
          </>
        }
      >
        <div>
          <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Tracking Number</label>
          <TextInput value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} placeholder="e.g. BDT-88412" />
        </div>
      </Modal>
    </PurchaseListPage>
  );
}
