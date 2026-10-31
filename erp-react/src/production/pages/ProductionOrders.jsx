import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import PdfPrintButtons from '../components/PdfPrintButtons';
import Icon from '../components/icons/Icon';
import ProductionOrderTable from '../components/production/ProductionOrderTable';
import ApprovalProgressSection from '../components/production/ApprovalProgressSection';
import ProductionOrderFilters from '../components/production/ProductionOrderFilters';
import RowActionsDropdown from '../components/production/RowActionsDropdown';
import Modal from '../components/production/Modal';
import ActionFeedback from '../components/production/ActionFeedback';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import useProductionAccess from '../access/useProductionAccess';
import { useProductionEntry } from '../context/ProductionEntryContext';
import { useAcknowledgement } from '../context/AcknowledgementContext';
import { useTechnicalVerification } from '../context/TechnicalVerificationContext';
import { useSalesOrders } from '../context/SalesOrdersContext';
import { useQuality } from '../context/QualityContext';
import { usePacking } from '../context/PackingContext';
import { useDispatch } from '../context/DispatchContext';
import { useCurrentUser } from '../../components/Common/CurrentUserContext';
import { stageGroupOf } from '../data/orders';
import { productionTypeOf, currentStageFor, progressFor } from '../data/entries';
import { productionKpiApi } from '../utils/api';
import { subscribeProductionDataChanged } from '../utils/dataChanged';
import { orderTabCounts } from '../utils/kpiQuery';
import { loadData, saveData } from '../utils/storage';
import { cpoNo } from '../../utils/salesHelpers';
import './ProductionOrders.css';

// ============================================================
// Status Tabs — unified view for all order statuses
// ============================================================
const STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Production Approval', label: 'Production Approval' },
  { key: 'Admin Approval', label: 'Admin Approval' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Production Rejected', label: 'Prod Rejected' },
  { key: 'Admin Rejected', label: 'Admin Rejected' },
  { key: 'Cancelled', label: 'Cancelled' },
];

// Which statuses belong to each tab
const TAB_STATUSES = {
  All: null, // special — show everything
  Draft: ['Draft'],
  'Production Approval': ['Pending Production Approval', 'Production Approved'],
  'Admin Approval': ['Pending Admin Approval', 'Admin Approved'],
  Approved: ['Approved'],
  'Production Rejected': ['Production Rejected'],
  'Admin Rejected': ['Admin Rejected'],
  Cancelled: ['Cancelled'],
};

// Columns for the main production order list (Status removed — shown in ApprovalProgress section)
const ORDER_COLUMNS = [
  'Work Order',
  'CPO Reference',
  'Items',
  'Order Description',
  'Production Type',
  'Current Stage',
  'Progress',
  'Actions',
];

// Columns for draft/approval orders (simpler — no Progress column)
const APPROVAL_COLUMNS = [
  'Work Order',
  'CPO Reference',
  'Items',
  'Order Description',
  'Created Date',
  'Actions',
];

const EMPTY_FILTERS = {
  status: 'All',
  productionType: 'All',
  department: 'All',
  stage: 'All',
  salesOrder: 'All',
  dueDate: 'All',
};
const PAGE_SIZE = 10;

// Approval status mappings
const APPROVAL_WORKFLOW = {
  Draft: { next: 'Pending Production Approval', label: 'Submit for Approval', icon: 'send' },
  'Pending Production Approval': { next: 'Production Approved', label: 'Approve', icon: 'check' },
  'Production Approved': { next: 'Pending Admin Approval', label: 'Submit to Admin', icon: 'send' },
  'Pending Admin Approval': { next: 'Admin Approved', label: 'Approve', icon: 'check' },
  'Admin Approved': { next: 'Approved', label: 'Final Approve', icon: 'check-circle' },
  Approved: { next: null, label: 'Approved', icon: 'check-circle' },
};

export default function ProductionOrders() {
  const { orders, deleteOrder, transitionOrderStatus, refreshOrders, loading: ordersLoading } = useProductionOrders();
  const { deleteEntriesForOrder, entriesForOrder } = useProductionEntry();
  const { deleteAcknowledgementsForOrder, getAcknowledgement } = useAcknowledgement();
  const { deleteTechnicalVerificationsForOrder, getTechnicalVerification } = useTechnicalVerification();
  const { salesOrders } = useSalesOrders();
  const { inspections, deleteInspection } = useQuality();
  const { records: packingRecords, deletePackingRecord } = usePacking();
  const { records: dispatchRecords, deleteDispatch } = useDispatch();
  const { currentUser, isAdmin } = useCurrentUser();
  const navigate = useNavigate();

  /* Production Access Management — this page's own switches. Presentation only:
     the backend enforces the same pairs on every /production-orders call. */
  const { can: canProduction } = useProductionAccess();
  const canOrders = (action) => canProduction('orders', action);

  // Listen for hash changes (e.g. when clicking Drafts sidebar items)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = decodeURIComponent(window.location.hash.slice(1));
      if (!hash) {
        setActiveTab('All');
        return;
      }
      const statusToTab = {
        'Draft': 'Draft',
        'Pending Production Approval': 'Production Approval',
        'Production Approved': 'Production Approval',
        'Pending Admin Approval': 'Admin Approval',
        'Admin Approved': 'Admin Approval',
        'Approved': 'Approved',
      };
      const tab = statusToTab[hash];
      if (tab) setActiveTab(tab);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showFiltersOpen, setShowFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  // Read hash fragment to determine initial tab (e.g. /production/orders#Draft)
  const [activeTab, setActiveTab] = useState(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (!hash) return 'All';
    const statusToTab = {
      'Draft': 'Draft',
      'Pending Production Approval': 'Production Approval',
      'Production Approved': 'Production Approval',
      'Pending Admin Approval': 'Admin Approval',
      'Admin Approved': 'Admin Approval',
      'Approved': 'Approved',
    };
    return statusToTab[hash] || 'All';
  });
  const [deletingOrder, setDeletingOrder] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  // Delete results (success / refused) are surfaced through the same toast
  // component the other Production screens use.
  const [feedback, setFeedback] = useState(null);

  // Related process records per order (for deletion warnings)
  const relatedCounts = useMemo(() => {
    const counts = {};
    const count = (records) =>
      (records || []).forEach((record) => {
        if (record.productionOrder) {
          counts[record.productionOrder] = (counts[record.productionOrder] || 0) + 1;
        }
      });
    count(inspections);
    count(packingRecords);
    count(dispatchRecords);
    ['casting', 'fabrication', 'machineShop', 'assembly'].forEach((key) =>
      count(loadData(key, []))
    );
    return counts;
  }, [inspections, packingRecords, dispatchRecords]);

  const salesOrderOptions = useMemo(
    () => salesOrders.map((so) => so.salesOrderNumber).sort(),
    [salesOrders]
  );

  // Filter orders based on active tab, search, and dropdown filters
  const filteredOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const tabStatuses = TAB_STATUSES[activeTab];

    return orders.filter((order) => {
      // Tab filter
      if (tabStatuses && !tabStatuses.includes(order.status)) return false;

      // Search filter
      const itemSearchFields = (order.items || []).flatMap((item) => [
        item.productName, item.productCode, item.patternNumber, item.drawingNumber,
      ]);
      const matchesSearch =
        !q ||
        [
          order.workOrder,
          order.salesOrderNumber,
          order.product,
          order.department,
          order.status,
          ...itemSearchFields,
        ].some((value) => (value || '').toLowerCase().includes(q));

      const matchesProductionType =
        filters.productionType === 'All' || productionTypeOf(order) === filters.productionType;
      const matchesDepartment =
        filters.department === 'All' || order.department === filters.department;
      const matchesStage =
        filters.stage === 'All' || stageGroupOf(order.currentStage) === filters.stage;
      const matchesSalesOrder =
        filters.salesOrder === 'All' || order.salesOrderNumber === filters.salesOrder;

      let matchesDueDate = true;
      if (filters.dueDate !== 'All' && order.dueDate) {
        const due = new Date(order.dueDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const doneStatuses = ['Completed', 'Packed', 'Ready for Dispatch'];
        if (filters.dueDate === 'Overdue') {
          matchesDueDate = due < today && !doneStatuses.includes(order.status);
        } else {
          const endOfWeek = new Date(today);
          endOfWeek.setDate(today.getDate() + (7 - today.getDay()));
          const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          const horizon = filters.dueDate === 'Due This Week' ? endOfWeek : endOfMonth;
          matchesDueDate = due >= today && due <= horizon;
        }
      }

      return (
        matchesSearch &&
        matchesProductionType &&
        matchesDepartment &&
        matchesStage &&
        matchesSalesOrder &&
        matchesDueDate
      );
    });
  }, [orders, searchQuery, filters, activeTab]);

  // Tab counts / KPI cards — counted by the database, not by walking the
  // loaded orders in the browser (see ProductionKpiService.orderCounts).
  const [tabCounts, setTabCounts] = useState(() => orderTabCounts(null));

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      try {
        const response = await productionKpiApi.counts('orders');
        if (!cancelled) setTabCounts(orderTabCounts(response?.data ?? response));
      } catch {
        /* Keep the last known counters — the list itself reports its own error. */
      }
    };
    loadCounts();
    // Coalesced: a burst of writes reloads these counters once, not once each.
    const unsubscribe = subscribeProductionDataChanged('orders-view', loadCounts);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const filtersActive =
    searchQuery.trim() !== '' ||
    filters.status !== 'All' ||
    filters.productionType !== 'All' ||
    filters.department !== 'All' ||
    filters.stage !== 'All' ||
    filters.salesOrder !== 'All' ||
    filters.dueDate !== 'All';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  // Current Stage / Progress in this list are DERIVED with the same helpers and
  // the same records the detail page (/production/orders/:id) uses — the
  // persisted stage entries plus the Acknowledgement and Technical Verification
  // records (src/production/data/entries.js → currentStageFor / progressFor).
  //
  // Root cause of the stale rows: the table used to print the STORED
  // production_orders.current_stage / progress columns, which are only written
  // when the Work Order itself is created, edited or approved — never when a
  // stage entry is recorded. A Work Order whose stages are already complete
  // therefore kept its original stage and 0% (WO-0005: list "Shell Preparation /
  // 0%" vs detail "Completed / 86%").
  //
  // Only the rows handed to the table are enriched: tab filtering, search,
  // pagination, status/approval actions and KPI counts keep using the raw
  // order, so none of that behaviour changes.
  const pageOrders = filteredOrders
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((order) => {
      const orderEntries = entriesForOrder(order.workOrder);
      const ackRecord = getAcknowledgement(order.workOrder);
      const tvRecord = getTechnicalVerification(order.workOrder);
      return {
        ...order,
        currentStage: currentStageFor(order, orderEntries, ackRecord, tvRecord),
        progress: progressFor(order, orderEntries, ackRecord, tvRecord),
      };
    });
  if (page > totalPages && totalPages > 0) setPage(totalPages);

  // The backend restricts both operations to Draft Work Orders.
  const draftOnlyMessage = (verb, order) =>
    `Work Order ${order.workOrder} cannot be ${verb} — its status is ${order.status}. Only Work Orders in Draft status can be ${verb}.`;

  const openEditForm = (order) => {
    if (order.status !== 'Draft') {
      setFeedback({ message: draftOnlyMessage('edited', order), tone: 'error' });
      return;
    }
    navigate(`/production/orders/${order.id}/edit`);
  };

  // Reload the list straight from the API/database and report the outcome.
  const handleRefresh = async () => {
    const ok = await refreshOrders();
    setFeedback(
      ok === false
        ? { message: 'Could not reload Work Orders from the server.', tone: 'error' }
        : { message: 'Work Orders reloaded from the database.', tone: 'success' }
    );
  };

  const handleApproval = async (order) => {
    if (!isAdmin) return;

    const workflow = APPROVAL_WORKFLOW[order.status];
    if (!workflow || !workflow.next) return;

    const result = await transitionOrderStatus(order.id, workflow.next);
    if (result.ok) {
      setSelectedOrder(result.order);
    }
  };

  const handleReject = async (order) => {
    if (!isAdmin) return;

    const remarks = prompt('Enter rejection remarks (optional):') || 'Rejected by admin';
    // Use stage-specific rejection
    let rejectStatus;
    if (order.status === 'Pending Production Approval') {
      rejectStatus = 'Production Rejected';
    } else if (order.status === 'Pending Admin Approval') {
      rejectStatus = 'Admin Rejected';
    } else {
      rejectStatus = 'Cancelled';
    }
    const result = await transitionOrderStatus(order.id, rejectStatus, remarks);
    if (result.ok) {
      setSelectedOrder(result.order);
    }
  };

  /**
   * Remove every record that hangs off a Work Order that has just been deleted
   * from the database.
   *
   * The single-row and bulk delete flows MUST share this: the bulk flow used to
   * clean up only the shop-floor jobs, so acknowledgement / Technical
   * Verification / inspection / packing / dispatch rows stayed behind, orphaned
   * against a Work Order that no longer existed.
   */
  const purgeOrderDependents = (woNumber) => {
    if (!woNumber) return;
    deleteEntriesForOrder(woNumber);
    // Shop floor jobs (casting, fabrication, assembly) live in localStorage.
    ['casting', 'fabrication', 'assembly'].forEach((key) => {
      const jobs = loadData(key, []);
      const cleaned = jobs.filter((j) => j.productionOrder !== woNumber);
      if (cleaned.length !== jobs.length) {
        saveData(key, cleaned);
        // Notify any mounted shop floor pages to re-sync from localStorage
        window.dispatchEvent(new CustomEvent('shopfloor-sync', { detail: { key } }));
      }
    });
    inspections
      .filter((insp) => insp.productionOrder === woNumber)
      .forEach((insp) => deleteInspection(insp.id));
    // A packing list stores its Work Order as `productionOrder` — the context
    // maps the API's `workOrderId` onto that field. Filtering on `rec.workOrder`
    // never matched anything, so packing lists were never cleaned up.
    packingRecords
      .filter((rec) => rec.productionOrder === woNumber)
      .forEach((rec) => deletePackingRecord(rec.id));
    dispatchRecords
      .filter((rec) => rec.productionOrder === woNumber)
      .forEach((rec) => deleteDispatch(rec.id));
    deleteAcknowledgementsForOrder(woNumber);
    deleteTechnicalVerificationsForOrder(woNumber);
  };

  const confirmDelete = async () => {
    if (deletingOrder) {
      const woNumber = deletingOrder.workOrder;
      // The server only deletes Work Orders in Draft status. Asking anyway
      // returned a 500 that replaced the whole page with the global error
      // screen, so the rule is enforced here first and reported in the toast.
      if (deletingOrder.status !== 'Draft') {
        setFeedback({
          message: draftOnlyMessage('deleted', deletingOrder),
          tone: 'error',
        });
        setDeletingOrder(null);
        return;
      }
      // Only remove the dependent records once the Work Order itself is gone —
      // the backend refuses to delete anything that is not in Draft status, and
      // the old flow wiped the shop-floor / QC / packing / dispatch rows for an
      // order that still existed.
      const result = await deleteOrder(deletingOrder.id);
      if (!result?.ok) {
        setFeedback({ message: result?.error || `Could not delete ${woNumber}.`, tone: 'error' });
        setDeletingOrder(null);
        return;
      }
      purgeOrderDependents(woNumber);
      setFeedback({ message: `${woNumber} deleted.`, tone: 'success' });
    }
    setDeletingOrder(null);
  };

  // Determine if the current tab shows approval-style orders
  const isApprovalTab = activeTab !== 'All';

  // Reset selected order when it's no longer in the filtered list
  // (e.g., after approval moves it to a different tab)
  useEffect(() => {
    if (selectedOrder && !filteredOrders.find((o) => o.id === selectedOrder.id)) {
      setSelectedOrder(null);
    }
  }, [activeTab, filteredOrders]);

  const pageInfo = filteredOrders.length > 0
    ? `Showing ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, filteredOrders.length)} of ${filteredOrders.length}`
    : 'No records';

  return (
    <div className="po-prod-page">
      <ActionFeedback
        message={feedback?.message}
        tone={feedback?.tone}
        onDismiss={() => setFeedback(null)}
      />

      {/* ===== PAGE HEADER — Purchase Requisition style ===== */}
      <div className="po-prod-header">
        <div className="po-prod-header-left">
          <div className="po-prod-breadcrumb">
            <a href="/production/dashboard">Dashboard</a>
            <span className="bc-sep">›</span>
            <span className="bc-current">Production</span>
            <span className="bc-sep">›</span>
            <span className="bc-current">Production Work Orders</span>
          </div>
          <h1 className="po-prod-title">
            <Icon name="clipboard" size={22} /> Production Work Orders
          </h1>
          <p className="po-prod-subtitle">
            Manage Work Orders raised from Customer Purchase Orders (CPOs).
          </p>
        </div>
        <div className="po-prod-header-actions">
          {/* Create is its own Production Access Management switch: the button
              is hidden when it is OFF and the backend refuses /production-orders. */}
          {canOrders('create') && (
            <button type="button" className="po-prod-btn-primary" onClick={() => navigate('/production/orders/new')}>
              <Icon name="plus" size={16} /> Create Work Order
            </button>
          )}
        </div>
      </div>

      {/* ===== SCROLLABLE CONTENT BELOW STICKY HEADER ===== */}
      <div className="po-prod-scroll-content">

      {/* ===== KPI CARDS — Frosted Glass Enterprise ===== */}
      <div className="po-prod-kpi-grid">
        {[
          { key: 'total', num: tabCounts.All || 0, label: 'Total Orders', icon: 'clipboard', tone: 'neutral' },
          { key: 'draft', num: tabCounts.Draft || 0, label: 'Draft', icon: 'file-text', tone: 'gray' },
          { key: 'prodApproval', num: tabCounts['Production Approval'] || 0, label: 'Production Approval', icon: 'clock', tone: 'amber' },
          { key: 'adminApproval', num: tabCounts['Admin Approval'] || 0, label: 'Admin Approval', icon: 'shield', tone: 'blue' },
          { key: 'approved', num: tabCounts.Approved || 0, label: 'Approved', icon: 'check-circle', tone: 'green' },
          { key: 'prodRejected', num: tabCounts['Production Rejected'] || 0, label: 'Prod Rejected', icon: 'x-circle', tone: 'red' },
          { key: 'adminRejected', num: tabCounts['Admin Rejected'] || 0, label: 'Admin Rejected', icon: 'x-circle', tone: 'red' },
          { key: 'cancelled', num: tabCounts.Cancelled || 0, label: 'Cancelled', icon: 'x-circle', tone: 'red' },
        ].map((card) => (
          <div key={card.key} className="po-prod-kpi clickable" onClick={() => window.open(`/production/kpi/orders/${card.key}`, '_blank')} role="button" tabIndex={0} title={`View ${card.label} details (opens in new tab)`} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.open(`/production/kpi/orders/${card.key}`, '_blank'); } }}>
            <div className="po-prod-kpi-icon-num">
              <span className={`po-prod-kpi-icon ${card.tone}`}>
                <Icon name={card.icon} size={19} />
              </span>
              <div className="po-prod-kpi-count">{card.num}</div>
            </div>
            <div className="po-prod-kpi-label">{card.label}</div>
          </div>
        ))}
      </div>

      {/* ===== STATUS TABS — Underline Style ===== */}
      <div className="po-prod-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`po-prod-tab ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => {
              setActiveTab(tab.key);
              setPage(1);
              if (tab.key === 'All') {
                window.history.pushState(null, '', '/production/orders');
              } else {
                window.history.pushState(null, '', `/production/orders#${encodeURIComponent(tab.label)}`);
              }
            }}
          >
            {tab.label}
            <span className="tab-count">{tabCounts[tab.key] || 0}</span>
          </button>
        ))}
      </div>

      {/* ===== TOOLBAR — Purchase RFQ pattern ===== */}
      <div className="po-prod-toolbar">
        <div className="po-prod-toolbar-left">
          <button
            type="button"
            className={`po-prod-btn po-prod-btn-ghost po-prod-btn-sm ${filtersActive ? 'active' : ''}`}
            onClick={() => setShowFiltersOpen((v) => !v)}
            aria-label="Toggle filters"
            aria-expanded={showFiltersOpen}
          >
            <Icon name="filter" size={12} /> {showFiltersOpen ? 'Hide Filters' : 'Show Filters'}
          </button>
          {(searchQuery || filtersActive) && (
            <button type="button" className="po-prod-btn po-prod-btn-ghost po-prod-btn-sm" onClick={clearAll}>
              <Icon name="x" size={12} /> Clear
            </button>
          )}
          {/* Re-reads the Work Orders from the database. This previously called
              setSearchQuery(searchQuery), which React bails out of, so the
              button did nothing at all. */}
          <button
            type="button"
            className="po-prod-btn po-prod-btn-ghost po-prod-btn-sm"
            onClick={handleRefresh}
            disabled={ordersLoading}
          >
            <Icon name="refresh-cw" size={12} /> Refresh
          </button>
        </div>
        <div className="po-prod-toolbar-right">
          <div className="po-prod-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search Work Order, CPO, Description..."
              aria-label="Search Production Work Orders"
            />
          </div>
          <span className="toolbar-count">{pageInfo}</span>
        </div>
      </div>

      {/* ===== FILTER PANEL ===== */}
      <div className={`po-prod-filter-panel ${showFiltersOpen ? 'show' : ''}`}>
        <ProductionOrderFilters
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          clearVisible={filtersActive}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          salesOrderOptions={salesOrderOptions}
        />
      </div>

      {/* ===== APPROVAL WORKFLOW STATUS ===== */}
      <ApprovalProgressSection
        selectedOrder={selectedOrder}
        onAdvance={handleApproval}
        onReject={handleReject}
      />

      {/* ===== BULK ACTION BAR ===== */}
      <div className={`po-prod-bulk-bar ${selectedIds.length > 0 ? 'visible' : ''}`}>
        <span className="po-prod-bulk-count"><strong>{selectedIds.length}</strong> selected</span>
        <div className="po-prod-bulk-actions">
          <button type="button" className="po-prod-btn-ghost" onClick={() => {
            const csv = pageOrders.filter((o) => selectedIds.includes(o.id)).map((o) => `${o.workOrder},${o.product || ''},${o.status}`).join('\n');
            const blob = new Blob([`Work Order,Product,Status\n${csv}`], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'production-orders-export.csv';
            a.click();
            URL.revokeObjectURL(url);
          }}>
            <Icon name="download" size={12} /> Export
          </button>
          {canOrders('delete') && <button type="button" className="po-prod-btn-ghost btn-bulk-danger" onClick={() => setBulkDeleteConfirm(true)}>
            <Icon name="trash" size={12} /> Delete
          </button>}
        </div>
      </div>

      {/* ===== ORDER TABLE — Purchase Requisition Table Style ===== */}
      <div className="po-prod-table-card">
        <div className="po-prod-table-wrap">
        <div className="orders-page-head" style={{ padding: '14px 16px 0' }}>
          <div>
            <h3 className="orders-page-title">
              {activeTab === 'All' ? 'All Orders' : activeTab}
            </h3>
            <p className="orders-page-subtitle">
              Showing {filteredOrders.length} of {orders.length} orders
            </p>
          </div>
        </div>

        {filteredOrders.length > 0 ? (
          <ProductionOrderTable
            orders={pageOrders}
            columns={isApprovalTab ? APPROVAL_COLUMNS : ORDER_COLUMNS}
            title=""
            onRowClick={(order) => setSelectedOrder(order)}
            selectedRowId={selectedOrder?.id}
            onSelectionChange={setSelectedIds}
            renderActions={(order) => (
              <RowActionsDropdown
                actions={[
                  {
                    label: 'Preview',
                    icon: <Icon name="eye" size={13} />,
                    onClick: () => navigate(`/production/preview/orders/${encodeURIComponent(order.workOrder || order.id)}`),
                  },
                  {
                    label: 'View Details',
                    icon: <Icon name="external-link" size={13} />,
                    onClick: () => navigate(`/production/orders/${order.id}`),
                  },
                  ...(canOrders('print') ? [{
                    label: 'Print',
                    icon: <Icon name="printer" size={13} />,
                    onClick: () => window.print(),
                  },
                  {
                    label: 'Export PDF',
                    icon: <Icon name="download" size={13} />,
                    onClick: async () => {
                      try {
                        const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
                        const pdfDoc = await PDFDocument.create();
                        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                        const page = pdfDoc.addPage([842, 595]);
                        let y = 560;
                        const margin = 40;
                        page.drawText('Production Order - ' + order.workOrder, { x: margin, y, size: 18, font: boldFont, color: rgb(0.13, 0.55, 0.13) });
                        y -= 30;
                        page.drawText('Work Order: ' + order.workOrder, { x: margin, y, size: 11, font });
                        y -= 18;
                        page.drawText('CPO Reference: ' + (cpoNo(order.salesOrderNumber) || 'N/A'), { x: margin, y, size: 11, font });
                        y -= 18;
                        page.drawText('Status: ' + (order.status || 'N/A'), { x: margin, y, size: 11, font });
                        y -= 18;
                        page.drawText('Production Type: ' + (order.productionType || 'N/A'), { x: margin, y, size: 11, font });
                        const pdfBytes = await pdfDoc.save();
                        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = `${order.workOrder}.pdf`; a.click();
                        URL.revokeObjectURL(url);
                      } catch (e) { console.error('PDF export failed', e); }
                    },
                  }] : []),
                  ...(activeTab !== 'Approved' ? [
                    ...(canOrders('edit') ? [{
                      label: 'Edit',
                      icon: <Icon name="edit" size={13} />,
                      onClick: () => openEditForm(order),
                    }] : []),
                    ...(canOrders('delete') ? [{
                      label: 'Delete',
                      icon: <Icon name="trash" size={13} />,
                      danger: true,
                      onClick: () => setDeletingOrder(order),
                    }] : []),
                  ] : []),
                ]}
              />
            )}
          />
        ) : (
          <div className="empty-state">
            <span className="empty-icon">
              <Icon name="search" size={22} />
            </span>
            <h4>No orders found</h4>
            <p>
              {activeTab === 'All'
                ? 'No production orders yet. Click "Create Work Order" to start.'
                : `No orders in the "${activeTab}" stage.`}
            </p>
            {filtersActive && (
              <button type="button" className="btn btn-secondary" onClick={clearAll}>
                Clear Filters
              </button>
            )}
          </div>
        )}

        {/* Pagination */}
        {filteredOrders.length > 0 && totalPages > 1 && (
          <div className="sf-pagination" style={{ borderTop: '1px solid #E2E8F0', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span className="sf-pagination-info" style={{ fontSize: 12, color: '#64748B' }}>
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredOrders.length)} of{' '}
              {filteredOrders.length} orders
            </span>
            <div className="sf-pagination-controls" style={{ display: 'flex', gap: 3 }}>
              <button
                type="button"
                className="btn btn-secondary sf-pagination-btn"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <Icon name="chevron-left" size={13} /> Prev
              </button>
              <span className="sf-pagination-page" style={{ padding: '0 10px', fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center' }}>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="btn btn-secondary sf-pagination-btn"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <Icon name="chevron-right" size={13} />
              </button>
            </div>
          </div>
        )}
        </div>{/* .po-prod-table-wrap */}
      </div>{/* .po-prod-table-card */}

      {/* Delete Confirmation Modal */}
      {deletingOrder && (
        <Modal
          title="Delete Production Order"
          size="sm"
          onClose={() => setDeletingOrder(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeletingOrder(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          }
        >
          <p className="confirm-text">Are you sure you want to delete this Work Order?</p>
          <p className="confirm-subtext">
            <strong>{deletingOrder.workOrder}</strong> · {deletingOrder.product}
          </p>
          {relatedCounts[deletingOrder.workOrder] > 0 && (
            <p className="confirm-subtext confirm-warning">
              This Work Order is referenced by{' '}
              <strong>{relatedCounts[deletingOrder.workOrder]}</strong> process record
              {relatedCounts[deletingOrder.workOrder] > 1 ? 's' : ''} (shop floor / quality /
              packing / dispatch). Deleting it leaves those records without a link to an active
              Work Order.
            </p>
          )}
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <Modal
          title="Bulk Delete Work Orders"
          size="sm"
          onClose={() => setBulkDeleteConfirm(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={async () => {
                const refused = [];
                for (const id of selectedIds) {
                  const order = orders.find((o) => o.id === id);
                  if (!order) continue;
                  if (order.status !== 'Draft') {
                    refused.push(order.workOrder);
                    continue;
                  }
                  // eslint-disable-next-line no-await-in-loop
                  const result = await deleteOrder(order.id);
                  if (!result?.ok) {
                    refused.push(order.workOrder);
                    continue;
                  }
                  purgeOrderDependents(order.workOrder);
                }
                if (refused.length > 0) {
                  setFeedback({
                    message: `Only Work Orders in Draft status can be deleted — kept: ${refused.join(', ')}.`,
                    tone: 'error',
                  });
                }
                setSelectedIds([]);
                setBulkDeleteConfirm(false);
              }}>
                <Icon name="trash" size={14} /> Delete {selectedIds.length} item{selectedIds.length > 1 ? 's' : ''}
              </button>
            </>
          }
        >
          <p className="confirm-text">
            Are you sure you want to delete {selectedIds.length} selected work order{selectedIds.length > 1 ? 's' : ''}?
          </p>
          <p className="confirm-subtext">This action cannot be undone.</p>
        </Modal>
      )}

      </div>{/* .po-prod-scroll-content */}
    </div>
  );
}
