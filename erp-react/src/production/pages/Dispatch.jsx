import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PdfPrintButtons from '../components/PdfPrintButtons';
import Icon from '../components/icons/Icon';
import Modal from '../components/production/Modal';
import ProductionTableToolbar from '../components/production/ProductionTableToolbar';
import ProductionBulkActionBar from '../components/production/ProductionBulkActionBar';
import ShopFloorFilters from '../components/production/shopfloor/ShopFloorFilters';
import ModuleSummaryCards from '../components/production/ModuleSummaryCards';
import SettingsTable, { SettingsRowActions } from '../components/production/settings/SettingsTable';
import SettingsFormModal from '../components/production/settings/SettingsFormModal';
import RowActionsDropdown from '../components/production/RowActionsDropdown';
import useProductionAccess from '../access/useProductionAccess';
import ActionFeedback from '../components/production/ActionFeedback';
import WorkOrderJourneyTracker from '../components/production/WorkOrderJourneyTracker';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import { useDispatch } from '../context/DispatchContext';
import { usePacking } from '../context/PackingContext';
import { useAcknowledgement } from '../context/AcknowledgementContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { productionTypeOf, currentStageFor, workflowForType } from '../data/entries';
import {
  DISPATCH_STATUSES,
  PACKING_STATUS_OPTIONS,
  derivePackingStatus,
  packageCount,
  nextDispatchNumber,
} from '../data/dispatch';
import { packedQtyOf, ensureBoxes } from '../data/packing';
import { useDashboardNav } from '../context/DashboardNavContext';
import { formatDate } from '../utils/format';
import './Dispatch.css';
import '../components/production/shopfloor/ShopFloorTable.css';

const SEARCH_FIELDS = ['id', 'productionOrder', 'packingListId', 'product', 'transporter', 'vehicleNo'];

const DISPATCH_COLUMNS = [
  { key: 'id', label: 'Dispatch No.', render: (row) => <td className="cell-strong">{row.id}</td> },
  {
    key: 'productionOrder',
    label: 'Work Order',
    render: (row, extra) => {
      const known = row.productionOrder ? (extra?.knownWorkOrders ? extra.knownWorkOrders.has(row.productionOrder) : true) : false;
      if (known && extra?.onWorkOrderClick) {
        return (
          <td>
            <button
              type="button"
              className="po-link"
              onClick={() => extra.onWorkOrderClick(row.productionOrder)}
            >
              {row.productionOrder}
            </button>
          </td>
        );
      }
      if (row.productionOrder) {
        return (
          <td>
            <span
              style={{ color: '#94A3B8', fontSize: 12 }}
              title="The referenced Work Order does not exist — this dispatch record is not linked to a valid Work Order"
            >
              {row.productionOrder} <em>(not found)</em>
            </span>
          </td>
        );
      }
      return <td className="cell-muted">—</td>;
    },
  },
  { key: 'salesOrderNumber', label: 'Order / PO No.', render: (row) => <td className="cell-muted">{row.salesOrderNumber || '\u2014'}</td> },
  { key: 'product', label: 'Order Description', render: (row) => <td>{row.product}</td> },
  {
    key: 'packingStatus',
    label: 'Packing Status',
    render: (row) => {
      const status = row.packingStatus || 'Not Packed';
      const cls = status === 'Packed' ? 'badge-green' : status === 'Partially Packed' ? 'badge-amber' : 'badge-gray';
      return <td><span className={cls}>{status}</span></td>;
    },
  },
  { key: 'packageCount', label: 'Packages', render: (row) => <td>{row.packageCount || 0}</td> },
  { key: 'packingListId', label: 'Packing List', render: (row) => <td className="cell-muted">{row.packingListId || '\u2014'}</td> },
  { key: 'dispatchDate', label: 'Dispatch Date', render: (row) => <td>{formatDate(row.dispatchDate)}</td> },
  { key: 'transporter', label: 'Transporter', render: (row) => <td className="cell-muted">{row.transporter || '\u2014'}</td> },
  { key: 'vehicleNo', label: 'Vehicle No.', render: (row) => <td className="cell-muted">{row.vehicleNo || '\u2014'}</td> },
  { key: 'lrTrackingNo', label: 'LR / Tracking', render: (row) => <td className="cell-muted">{row.lrTrackingNo || '\u2014'}</td> },
  { key: 'status', label: 'Status', statusKey: 'status' },
];
const SUMMARY_CARDS = [
  { key: 'total', label: 'Total Dispatch Records', icon: 'clipboard', tone: 'blue', hint: 'all dispatch records' },
  { key: 'draft', label: 'Draft', icon: 'file-text', tone: 'gray', hint: 'dispatches not yet ready' },
  { key: 'ready', label: 'Ready', icon: 'truck', tone: 'blue', hint: 'cleared and staged' },
  { key: 'dispatched', label: 'Dispatched', icon: 'check', tone: 'green', hint: 'shipped shipments' },
  { key: 'inTransit', label: 'In Transit', icon: 'navigation', tone: 'amber', hint: 'currently in transit' },
  { key: 'delivered', label: 'Delivered', icon: 'package', tone: 'green', hint: 'completed deliveries' },
];

const EMPTY_FILTERS = { status: 'All', dispatchDate: '' };

// Status Tabs for Dispatch page
const DISPATCH_STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Ready', label: 'Ready' },
  { key: 'Dispatched', label: 'Dispatched' },
  { key: 'In Transit', label: 'In Transit' },
  { key: 'Delivered', label: 'Delivered' },
];

// Maps each status tab to the matching key returned by the backend /dispatch/stats endpoint.
const DISPATCH_TAB_TO_STATS_KEY = {
  Draft: 'draft',
  Ready: 'ready',
  Dispatched: 'dispatched',
  'In Transit': 'inTransit',
  Delivered: 'delivered',
};

export default function Dispatch({ createPage = false, editPage = false }) {
  /* Access Management: Create/Edit/Delete plus the page's CSV export. The
     backend rejects each protected call independently. */
  const { can } = useProductionAccess();
  const canEditDispatch = can('dispatch', 'edit');
  const canDeleteDispatch = can('dispatch', 'delete');
  const navigate = useNavigate();
  const { orders } = useProductionOrders();
  const { entries, saveEntry } = useProductionEntry();
  const { records, stats, loading, createDispatch, updateDispatch, deleteDispatch, transitionDispatch } = useDispatch();
  const { records: packingRecords } = usePacking();
  const { getAcknowledgement } = useAcknowledgement();
  const { getTechnicalVerification } = useTechnicalVerification();
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFiltersOpen, setShowFiltersOpen] = useState(false);
  const { nav, clearNav } = useDashboardNav();
  const [activeTab, setActiveTab] = useState('All');

  // Apply dashboard navigation state on mount
  useEffect(() => {
    if (nav?.status) {
      setActiveTab(nav.status);
      clearNav();
    }
  }, [nav, clearNav]);
  /* Both entry points render the same form as a full-size page: the create
     route (`createPage`) and the edit route (`editPage`). React Router reuses
     this component instance when moving between the list and a form route, so
     the useState initialiser alone is not enough. The edit route reads its
     record from the URL, so a reload or a deep link reopens that exact Dispatch
     instead of losing it with the list's row-click state. */
  const { id: editId } = useParams();
  const isPage = createPage || editPage;
  const routedRecord = editPage
    ? records.find((record) => String(record.id) === String(editId)) || null
    : null;
  const [localFormState, setFormState] = useState(
    createPage ? { mode: 'create', record: null } : null
  );
  // On the dedicated edit route the form is driven by the URL; everywhere else
  // (the read-only View panel) it stays the row-click state.
  const formState = editPage
    ? routedRecord
      ? { mode: 'edit', record: routedRecord }
      : null
    : localFormState;
  /* On the edit route the form waits for the record named in the URL, so it
     can never mount empty while the list is still loading. The board is
     skipped on that route, so nothing renders behind the form. */
  const formVisible = editPage ? !!routedRecord : !!formState || createPage;

  useEffect(() => {
    setFormState(createPage ? { mode: 'create', record: null } : null);
  }, [createPage]);

  // A stale / unknown edit link returns to the list rather than rendering an
  // empty form. Deliberately waits for the list to load first.
  useEffect(() => {
    if (!editPage || loading || routedRecord) return;
    navigate('/production/dispatch', { replace: true });
  }, [editPage, loading, routedRecord, navigate]);
  const [deleting, setDeleting] = useState(null);
  const [feedback, setFeedback] = useState(null);
  // Read-only Preview (Actions ⋮ → Preview) — same UX as Quotations.
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  // Auto-create draft Dispatch records for Work Orders that have
  // reached the Dispatch stage but don't have a dispatch record yet.
  const autoCreateDispatchRecords = useCallback(() => {
    orders.forEach((order) => {
      const ackRecord = getAcknowledgement(order.workOrder);
      const tvRecord = getTechnicalVerification(order.workOrder);
      const currentStage = currentStageFor(order, entries, ackRecord, tvRecord);

      // Only auto-create for Work Orders whose current stage is 'Dispatch'
      if (currentStage !== 'Dispatch') return;

      // Check if a dispatch record already exists for this Work Order
      const existingDispatch = records.find((r) => r.productionOrder === order.workOrder);
      if (existingDispatch) return;

      // Check packing status
      const packingStatusVal = derivePackingStatus(order, packingRecords);
      const pkgCount = packageCount(order, packingRecords);

      // Create draft dispatch record — default quantity to the packed
      // amount, NOT the full Work Order quantity, to avoid immediate
      // validation errors when the user opens the form.
      const dispatchNo = nextDispatchNumber(records);
      createDispatch({
        id: dispatchNo,
        productionOrder: order.workOrder,
        salesOrderNumber: order.salesOrderNumber || '',
        customer: order.customer || '',
        product: order.product || '',
        quantity: 0,
        packingStatus: packingStatusVal,
        packageCount: pkgCount,
        dispatchDate: '',
        transporter: '',
        vehicleNo: '',
        lrTrackingNo: '',
        status: 'Draft',
        remarks: '',
      });
    });
  }, [orders, records, packingRecords, entries, getAcknowledgement, getTechnicalVerification, createDispatch]);

  // Run auto-creation when orders or packing records change
  useEffect(() => {
    autoCreateDispatchRecords();
  }, [autoCreateDispatchRecords]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !q || SEARCH_FIELDS.some((key) => String(record[key] ?? '').toLowerCase().includes(q));
      // Tab filter
      if (activeTab !== 'All' && record.status !== activeTab) return false;
      const matchesDate = !filters.dispatchDate || record.dispatchDate === filters.dispatchDate;
      return matchesSearch && matchesDate;
    });
  }, [records, searchQuery, filters, activeTab]);

  // Tab counts — single source of truth is the backend statistics endpoint,
  // computed from the SAME persisted dispatches rows shown in the table.
  const tabCounts = useMemo(() => {
    const counts = { All: stats?.total ?? 0 };
    DISPATCH_STATUS_TABS.forEach((tab) => {
      if (tab.key === 'All') return;
      counts[tab.key] = stats?.[DISPATCH_TAB_TO_STATS_KEY[tab.key]] ?? 0;
    });
    return counts;
  }, [stats]);

  // KPI summary cards — calculated from backend /dispatch/stats (DB-backed),
  // never from a frontend-only counter or a different date-filtered source.
  const summary = useMemo(
    () => ({
      total: stats?.total ?? 0,
      draft: stats?.draft ?? 0,
      ready: stats?.ready ?? 0,
      dispatched: stats?.dispatched ?? 0,
      inTransit: stats?.inTransit ?? 0,
      delivered: stats?.delivered ?? 0,
    }),
    [stats]
  );

  const filtersActive =
    searchQuery.trim() !== '' || filters.status !== 'All' || filters.dispatchDate !== '';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
  };
  const syncDispatchStage = (record) => {
    if (!record.productionOrder) return;
    const wo = orders.find((o) => o.workOrder === record.productionOrder);
    const prodType = wo ? productionTypeOf(wo) : 'Casting';
    const statusMap = {
      'Delivered': 'Completed',
      'Dispatched': 'Completed',
      'In Transit': 'In Progress',
      'Ready': 'In Progress',
      'Draft': 'Pending',
    };
    const dispatchQty = Number(record.quantity) || 0;
    saveEntry({
      workOrderId: record.productionOrder,
      productionType: prodType,
      stage: 'Dispatch',
      inputQuantity: dispatchQty,
      outputQuantity: dispatchQty,
      rejectedQuantity: 0,
      operator: record.transporter || '',
      date: record.dispatchDate || new Date().toISOString().slice(0, 10),
      remarks: record.remarks || '',
      status: statusMap[record.status] || record.status || 'Pending',
    });
  };

  const handleSubmit = (values) => {
    const order = orders.find((o) => o.workOrder === values.productionOrder);
    const packingStatusVal = order ? derivePackingStatus(order, packingRecords) : 'Not Packed';
    const pkgCount = order ? packageCount(order, packingRecords) : 0;
    const record = {
      ...values,
      product: order?.product ?? values.product,
      customer: order?.customer ?? values.customer,
      salesOrderNumber: order?.salesOrderNumber ?? values.salesOrderNumber ?? '',
      packingStatus: packingStatusVal,
      packageCount: pkgCount,
    };

    if (formState?.mode === 'edit') {
      updateDispatch(formState.record.id, record);
      syncDispatchStage(record);
    } else {
      createDispatch(record);
      syncDispatchStage(record);
    }
    /* On the dedicated create / edit routes, saving returns to the list. */
    setFormState(null);
    if (isPage) navigate('/production/dispatch');
  };

  /* Create Dispatch lives on its own route — the list page only navigates
     there, so the form is never rendered inline. */
  const openCreate = () => {
    navigate('/production/dispatch/new');
  };

  /* Closing the form on a dedicated create / edit route means "back to the
     list"; the read-only View panel still just closes. */
  const closeForm = () => {
    setFormState(null);
    if (isPage) navigate('/production/dispatch');
  };

  const confirmDelete = () => {
    deleteDispatch(deleting.id);
    setDeleting(null);
  };

  // transitionDispatch is async — awaiting it is what makes the feedback stop
  // reporting "Could not transition" for transitions the backend accepted.
  const handleTransition = async (record, nextStatus) => {
    const result = await transitionDispatch(record.id, nextStatus);
    if (result.ok) {
      syncDispatchStage({ ...record, status: nextStatus });
      setFeedback({
        message: `${record.id} moved to ${nextStatus}.`,
        tone: 'success',
      });
    } else {
      setFeedback({
        message: `Could not transition to ${nextStatus}.`,
        tone: 'error',
      });
    }
  };

  const packablePackingLists = useMemo(() => {
    return packingRecords.filter((r) => {
      const status = r.status || '';
      return status === 'Completed' || status === 'Packed';
    });
  }, [packingRecords]);

  const packingListSelectOptions = packablePackingLists.map((pl) => ({
    value: pl.id,
    label: `${pl.id} \u2014 ${pl.product} \u00b7 ${packedQtyOf(pl)} qty`
  }));

  const orderOptions = orders.map((order) => ({
    value: order.workOrder,
    label: `${order.workOrder} \u2014 ${order.product}`
  }));

  if (selectedWorkOrder) {
    return (
      <div className="page">
        <WorkOrderJourneyTracker
          title={`Dispatch \u2014 Work Order ${selectedWorkOrder}`}
          selectedWorkOrder={selectedWorkOrder}
          onClose={() => setSelectedWorkOrder(null)}
        />
      </div>
    );
  }
  const getDispatchFields = (currentValues) => [
    { key: 'productionOrder', label: 'Work Order *', type: 'select', options: orderOptions, required: true, placeholder: 'Select a Work Order\u2026', hint: 'Select the Work Order to dispatch. All details auto-fill from the linked Work Order.' },
    { key: 'salesOrderNumber', label: 'Order / PO No.', type: 'text', disabled: true, placeholder: 'Auto-filled from Work Order' },
    { key: 'customer', label: 'Customer / Vendor', type: 'text', disabled: true, placeholder: 'Auto-filled from Work Order' },
    { key: 'product', label: 'Product / Item *', type: 'text', disabled: true, placeholder: 'Auto-filled from Work Order', wide: true },
    { key: 'quantity', label: 'Quantity *', type: 'number', min: 1, required: true, hint: 'Dispatch quantity (max: packed quantity)' },
    {
      key: 'packingListId',
      label: 'Packing List',
      type: 'select',
      options: packingListSelectOptions,
      placeholder: packablePackingLists.length ? 'Select a Packing List (optional)\u2026' : 'No packing lists available',
      hint: packablePackingLists.length
        ? 'Select a completed Packing List to auto-fill quantity details.'
        : 'No completed Packing Lists available for dispatch.',
    },
    { key: 'packingStatus', label: 'Packing Status', type: 'select', options: PACKING_STATUS_OPTIONS, disabled: true, default: 'Not Packed', hint: 'Derived from Packing records — must be Packed or Partially Packed' },
    { key: 'packageCount', label: 'Package Count', type: 'number', disabled: true, placeholder: 'Auto-filled from Packing' },
    { key: 'dispatchDate', label: 'Dispatch Date *', type: 'date', required: true },
    { key: 'transporter', label: 'Transporter', type: 'text', placeholder: 'Transporter name' },
    { key: 'vehicleNo', label: 'Vehicle No.', type: 'text', placeholder: 'TN 09 AB 1234' },
    { key: 'lrTrackingNo', label: 'LR / Tracking No.', type: 'text', placeholder: 'LR-12345 / Tracking ID' },
    { key: 'status', label: 'Status *', type: 'select', options: DISPATCH_STATUSES, required: true, default: 'Draft', hint: 'Draft \u2192 Ready \u2192 Dispatched \u2192 In Transit \u2192 Delivered' },
    { key: 'remarks', label: 'Remarks', type: 'textarea', placeholder: 'Optional notes\u2026', wide: true },
  ];
  return (
    <div className="page">
      {/* The Dispatch board is skipped entirely on the dedicated create and
          edit routes — only the form below is rendered. */}
      {!isPage && (
        <>
      <PageHeader
        title="Dispatch"
        subtitle="Final stage of the Work Order journey. Dispatch records auto-created when Packing is completed."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {can('dispatch', 'create') && (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={15} /> Create Dispatch
              </button>
            )}
          </div>
        }
      />

      <ModuleSummaryCards cards={SUMMARY_CARDS} values={summary} onCardClick={(key) => window.open(`/production/kpi/dispatch/${key}`, '_blank')} />

      {/* Status Tabs */}
      <div className="sf-stage-tabs">
        {DISPATCH_STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`sf-stage-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span className="sf-stage-tab-count">{tabCounts[tab.key] || 0}</span>
          </button>
        ))}
      </div>

      {/* TABLE TOOLBAR — Purchase RFQ pattern */}
      <ProductionTableToolbar
        showFilters={showFiltersOpen}
        onToggleFilters={() => setShowFiltersOpen((v) => !v)}
        filtersActive={filtersActive}
        onRefresh={() => setSearchQuery(searchQuery)}
        searchPlaceholder="Search by dispatch no., work order, product, transporter..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalRecords={filtered.length}
        pageStart={filtered.length > 0 ? 1 : 0}
        pageEnd={filtered.length}
      />

      {/* Collapsible filters */}
      {showFiltersOpen && (
        <ShopFloorFilters
          ariaLabel="Search dispatch records"
          searchPlaceholder="Search by dispatch no., work order, product, transporter..."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          fields={[{ key: 'status', label: 'Status', options: ['All', ...DISPATCH_STATUSES] }]}
          dateField={{ key: 'dispatchDate', label: 'Dispatch Date' }}
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          clearVisible={filtersActive}
        />
      )}

      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      <section className="pt-table-card">
        {/* Same heading block as the Assembly board (.sf-board-*) so the
            list card reads identically across the Production screens. */}
        <div className="sf-board-head">
          <div>
            <h3 className="sf-board-title">Dispatch Records</h3>
            <p className="sf-board-subtitle">
              Showing {filtered.length} of {records.length} dispatch records
            </p>
          </div>
        </div>

        {/* Bulk Action Bar */}
        <ProductionBulkActionBar
          count={selectedIds.length}
          onExport={can('dispatch', 'export') && selectedIds.length > 0 ? () => {
            const selected = filtered.filter((r) => selectedIds.includes(r.id));
            const csv = selected.map((r) => `${r.id},${r.productionOrder},${r.product},${r.status}`).join('\n');
            const blob = new Blob([`Dispatch No.,Work Order,Product,Status\n${csv}`], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'dispatch-records-export.csv';
            a.click();
            URL.revokeObjectURL(url);
          } : undefined}
          onDelete={selectedIds.length > 0 ? () => setBulkDeleteConfirm(true) : undefined}
        />

        {filtered.length > 0 ? (
          <SettingsTable
            columns={DISPATCH_COLUMNS}
            rows={filtered}
            extra={{
              onWorkOrderClick: (wo) => setSelectedWorkOrder(wo),
              knownWorkOrders: new Set(orders.map((o) => o.workOrder)),
            }}
            onSelectionChange={setSelectedIds}
            renderActions={(record) => (
              <RowActionsDropdown
                actions={[
                  ...(record.status === 'Draft' ? [{
                    label: 'Mark Ready',
                    icon: <Icon name="check" size={13} />,
                    onClick: () => handleTransition(record, 'Ready'),
                  }] : []),
                  ...(record.status === 'Ready' ? [{
                    label: 'Dispatch',
                    icon: <Icon name="truck" size={13} />,
                    onClick: () => handleTransition(record, 'Dispatched'),
                  }] : []),
                  ...(record.status === 'Dispatched' ? [{
                    label: 'In Transit',
                    icon: <Icon name="navigation" size={13} />,
                    onClick: () => handleTransition(record, 'In Transit'),
                  }] : []),
                  ...(record.status === 'In Transit' ? [{
                    label: 'Delivered',
                    icon: <Icon name="package" size={13} />,
                    onClick: () => handleTransition(record, 'Delivered'),
                  }] : []),
                  {
                    label: 'Preview',
                    icon: <Icon name="eye" size={13} />,
                    onClick: () => navigate(`/production/preview/dispatch/${encodeURIComponent(record.id || record.backendId)}`),
                  },
                  {
                    label: 'View',
                    icon: <Icon name="external-link" size={13} />,
                    onClick: () => setFormState({ mode: 'view', record }),
                  },
                  ...(canEditDispatch ? [{
                    label: 'Edit',
                    icon: <Icon name="edit" size={13} />,
                    /* ⋮ → Edit opens the dedicated full-size edit page instead
                       of a half-width overlay panel over the still-mounted
                       list. */
                    onClick: () => navigate(`/production/dispatch/${encodeURIComponent(record.id)}/edit`),
                  }] : []),
                  ...(canDeleteDispatch ? [{
                    label: 'Delete',
                    icon: <Icon name="trash" size={13} />,
                    danger: true,
                    onClick: () => setDeleting(record),
                  }] : []),
                ]}
              />
            )}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="truck" size={22} />
            </span>
            <h4>No dispatch records found</h4>
            <p>No records match your search and filter criteria.</p>
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              Clear Filters
            </button>
          </div>
        )}
      </section>
        </>
      )}
      {formVisible && (
        <SettingsFormModal
          title={
            createPage
              ? 'Create Dispatch — Dispatch'
              : formState.mode === 'view'
                ? `View ${formState.record.id}`
                : formState.mode === 'edit'
                  ? `Edit ${formState.record.id}`
                  : 'Create Dispatch'
          }
          fields={getDispatchFields}
          initialValues={formState?.record ?? null}
          mode={formState?.mode ?? 'create'}
          idKey="id"
          existingIds={records.map((r) => r.id)}
          onValuesChange={(key, value, current) => {
            if (key === 'packingListId') {
              const pl = packingRecords.find((p) => p.id === value);
              if (!pl) return null;
              const woSet = new Set();
              const migrated = ensureBoxes(pl);
              (migrated.packingBoxes || []).forEach((box) => {
                (box.items || []).forEach((item) => {
                  if (item.workOrder) woSet.add(item.workOrder);
                });
              });
              const firstWO = [...woSet][0] || pl.productionOrder || '';
              const order = orders.find((o) => o.workOrder === firstWO);
              const packingStatusVal = order ? derivePackingStatus(order, packingRecords) : 'Not Packed';
              const pkgCount = order ? packageCount(order, packingRecords) : 0;
              return {
                productionOrder: firstWO,
                salesOrderNumber: order?.salesOrderNumber || '',
                customer: order?.customer || '',
                product: order?.product || pl.product || '',
                // Always use the PL's actual packed quantity — never keep
                // a stale quantity from a previously selected Work Order.
                quantity: packedQtyOf(pl) || 0,
                packingStatus: packingStatusVal,
                packageCount: pkgCount,
              };
            }
            if (key === 'productionOrder') {
              const order = orders.find((o) => o.workOrder === value);
              if (!order) return null;
              const packingStatusVal = derivePackingStatus(order, packingRecords);
              const pkgCount = packageCount(order, packingRecords);
              return {
                salesOrderNumber: order.salesOrderNumber ?? '',
                customer: order.customer ?? '',
                product: order.product ?? '',
                quantity: current.quantity || order.quantity || 0,
                packingStatus: packingStatusVal,
                packageCount: pkgCount,
              };
            }
            return null;
          }}
          validate={(values) => {
            if (values.quantity <= 0) return 'Quantity must be greater than zero.';
            if (!values.dispatchDate) return 'Dispatch Date is required.';
            if (values.status === 'Ready' && values.packingStatus === 'Not Packed') {
              return 'Cannot mark as Ready \u2014 Packing is not completed for this Work Order.';
            }
            if (values.status === 'Ready' && values.packingStatus === 'Partially Packed') {
              // Allow Ready for partially packed — show warning but don't block
            }
            if (values.packingListId) {
              const pl = packingRecords.find((p) => p.id === values.packingListId);
              if (pl) {
                const packed = packedQtyOf(pl);
                if (packed > 0 && values.quantity > packed) {
                  return `Cannot dispatch ${values.quantity} \u2014 only ${packed} packed in ${values.packingListId}.`;
                }
              }
            }
            // Check if Work Order is at Dispatch stage
            if (values.productionOrder) {
              const wo = orders.find((o) => o.workOrder === values.productionOrder);
              if (wo) {
                const ackRecord = getAcknowledgement(wo.workOrder);
                const tvRecord = getTechnicalVerification(wo.workOrder);
                const currentStage = currentStageFor(wo, entries, ackRecord, tvRecord);
                if (currentStage === 'Acknowledgement') {
                  return 'Work Order must be acknowledged before dispatch.';
                }
                if (currentStage === 'Technical Verification') {
                  return 'Work Order must pass Technical Verification before dispatch.';
                }
              }
            }
            return null;
          }}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          fullPage={true}
          layout={isPage ? 'page' : 'modal'}
        />
      )}

      {deleting && (
        <Modal
          title="Delete Dispatch Record"
          size="sm"
          onClose={() => setDeleting(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeleting(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          }
        >
          <p className="confirm-text">Are you sure you want to delete this dispatch record?</p>
          <p className="confirm-subtext">
            <strong>{deleting.id}</strong> \u00b7 {deleting.productionOrder} \u00b7 {deleting.product}
          </p>
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <Modal
          title="Bulk Delete Dispatch Records"
          size="sm"
          onClose={() => setBulkDeleteConfirm(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => {
                selectedIds.forEach((id) => {
                  const rec = records.find((r) => r.id === id);
                  if (rec) deleteDispatch(rec.id);
                });
                setSelectedIds([]);
                setBulkDeleteConfirm(false);
              }}>
                <Icon name="trash" size={14} /> Delete {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''}
              </button>
            </>
          }
        >
          <p className="confirm-text">
            Are you sure you want to delete {selectedIds.length} selected dispatch record{selectedIds.length > 1 ? 's' : ''}?
          </p>
          <p className="confirm-subtext">This action cannot be undone.</p>
        </Modal>
      )}

    </div>
  );
}
