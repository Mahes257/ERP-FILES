import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PdfPrintButtons from '../components/PdfPrintButtons';
import Icon from '../components/icons/Icon';
import Modal from '../components/production/Modal';
import ProductionTableToolbar from '../components/production/ProductionTableToolbar';
import ProductionBulkActionBar from '../components/production/ProductionBulkActionBar';
import ShopFloorFilters from '../components/production/shopfloor/ShopFloorFilters';
import ModuleSummaryCards from '../components/production/ModuleSummaryCards';
import useProductionAccess from '../access/useProductionAccess';
import SettingsTable, { SettingsRowActions } from '../components/production/settings/SettingsTable';
import PackingListForm from '../components/production/packing/PackingListForm';
import WorkOrderJourneyTracker from '../components/production/WorkOrderJourneyTracker';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useSalesOrders } from '../context/SalesOrdersContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import { productionTypeOf } from '../data/entries';
import { usePacking } from '../context/PackingContext';
import {
  PACKING_STATUSES,
  packedQtyOf,
  packableQuantityFor,
  completedProductionQty,
  nextPackingListNumber,
  derivePackingStatus,
  ensureBoxes,
  overallTotals,
  packingPrefillFromCpo,
} from '../data/packing';
import salesOrderService from '../../services/salesOrderService';
import { loadData } from '../utils/storage';
import { formatDate } from '../utils/format';
import { useDashboardNav } from '../context/DashboardNavContext';
import './Packing.css';
import '../components/production/shopfloor/ShopFloorTable.css';

const SEARCH_FIELDS = ['id', 'productionOrder', 'salesOrderNumber', 'product', 'operator'];

const PACKING_COLUMNS = [
  { key: 'id', label: 'Packing List', render: (row) => <td className="cell-strong">{row.id}</td> },
  { key: 'productionOrder', label: 'Work Order', render: (row, extra) => (
    <td className="cell-strong">
      {extra?.onWorkOrderClick && row.productionOrder ? (
        <button
          type="button"
          className="po-link"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#1677ff', fontWeight: 600, fontSize: 'inherit' }}
          onClick={() => extra.onWorkOrderClick(row.productionOrder)}
        >
          {row.productionOrder}
        </button>
      ) : (
        row.productionOrder || '—'
      )}
    </td>
  ) },
  { key: 'salesOrderNumber', label: 'Sales Order', render: (row) => <td>{row.salesOrderNumber || '—'}</td> },
  { key: 'product', label: 'Order Description', render: (row) => <td>{row.product || '—'}</td> },
  { key: 'customer', label: 'Customer', render: (row) => <td>{row.customer || '—'}</td> },
  { key: 'packed', label: 'Packed Qty', render: (row) => <td>{packedQtyOf(row)}</td> },
  {
    key: 'boxes',
    label: 'Boxes / Items',
    render: (row) => {
      const rec = ensureBoxes(row);
      const t = overallTotals(rec.packingBoxes || []);
      return (
        <td className="cell-muted">
          {t.boxes} {t.boxes === 1 ? 'box' : 'boxes'} · {t.totalItems} items
        </td>
      );
    },
  },
  { key: 'packingDate', label: 'Packing Date', render: (row) => <td>{formatDate(row.packingDate)}</td> },
  { key: 'status', label: 'Status', statusKey: 'status' },
];

const SUMMARY_CARDS = [
  { key: 'total', label: 'Total Packing Lists', icon: 'clipboard', tone: 'blue', hint: 'all packing lists' },
  { key: 'pending', label: 'Pending Packing', icon: 'clock', tone: 'amber', hint: 'lists awaiting packing' },
  { key: 'inProgress', label: 'Packing In Progress', icon: 'play', tone: 'blue', hint: 'partially packed' },
  { key: 'completed', label: 'Completed', icon: 'package', tone: 'green', hint: 'fully packed lists' },
  { key: 'readyForDispatch', label: 'Ready for Dispatch', icon: 'truck', tone: 'teal', hint: 'packed & cleared' },
];

const EMPTY_FILTERS = { status: 'All' };

// Status Tabs for Packing page
const PACKING_STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Completed', label: 'Completed' },
  { key: 'Ready for Dispatch', label: 'Ready for Dispatch' },
];

// Maps each status tab to the matching key returned by the backend /packing/stats endpoint.
const PACKING_TAB_TO_STATS_KEY = {
  Pending: 'pending',
  'In Progress': 'inProgress',
  Completed: 'completed',
  'Ready for Dispatch': 'readyForDispatch',
};

export default function Packing({ createPage = false, editPage = false }) {
  /* Access Management: Create/Edit/Delete plus the page's CSV export. The
     backend rejects each protected call independently. */
  const { can } = useProductionAccess();
  const canEditPacking = can('packing', 'edit');
  const canDeletePacking = can('packing', 'delete');
  const navigate = useNavigate();
  const { orders, transitionOrderPath, refreshOrders } = useProductionOrders();
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const { salesOrders } = useSalesOrders();
  const { entries, saveEntry, loadAllEntries } = useProductionEntry();
  const { records, stats, loading, createPackingRecord, updatePackingRecord, deletePackingRecord, refresh } = usePacking();

  // The Work Order picker in the packing-item modal must reflect the CURRENT
  // database, not the snapshot captured when the app mounted: Work Orders
  // created and, above all, QC sign-offs recorded in another session/tab only
  // reached this page after a full reload, so genuinely packable Work Orders
  // were reported as "no completed QC" until then. Opening the item modal
  // re-reads the three sources its eligibility rule uses.
  const refreshPackingSources = React.useCallback(() => {
    refreshOrders?.();
    loadAllEntries?.();
    refresh?.();
  }, [refreshOrders, loadAllEntries, refresh]);
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
     route (`createPage`) and the edit route (`editPage`). The edit route reads
     its record from the URL, so a reload or a deep link reopens that exact
     Packing List instead of losing it with the list's row-click state. */
  const { id: editId } = useParams();
  /* CPO → Generate Packing List opens this create route with `?so=<cpo id>` —
     the same source-document convention CPO → Proforma Invoice uses. The CPO
     is only READ here: nothing is written until the user saves the form. */
  const [searchParams] = useSearchParams();
  const sourceCpoId = createPage ? (searchParams.get('so') || '') : '';
  const [sourcePrefill, setSourcePrefill] = useState(null);
  const [sourceLoading, setSourceLoading] = useState(Boolean(sourceCpoId));
  const isPage = createPage || editPage;
  const routedRecord = editPage
    ? records.find((record) => String(record.id) === String(editId)) || null
    : null;
  const formState = routedRecord ? { mode: 'edit', record: routedRecord } : null;
  useEffect(() => {
    if (!sourceCpoId) {
      setSourcePrefill(null);
      setSourceLoading(false);
      return undefined;
    }
    let cancelled = false;
    setSourceLoading(true);
    (async () => {
      try {
        // The full CPO (with its line items) — `get` is the Sales service the
        // rest of the ERP reads documents through. A failed read leaves the
        // form at its normal create state instead of blocking the page.
        const response = await salesOrderService.get(sourceCpoId, { suppressGlobalError: true });
        if (!cancelled) setSourcePrefill(packingPrefillFromCpo(response?.data ?? response ?? null));
      } catch (err) {
        console.error('Failed to load the source CPO for the Packing List:', err?.message || err);
        if (!cancelled) setSourcePrefill(null);
      } finally {
        if (!cancelled) setSourceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceCpoId]);

  const [deleting, setDeleting] = useState(null);
  const [createdId, setCreatedId] = useState(null); // for post-create navigation
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

// Completed shop floor job quantities per Work Order (all modules)
  const jobsByWO = useMemo(() => {
    const map = {};
    ['casting', 'fabrication', 'machineShop', 'assembly'].forEach((key) => {
      (loadData(key, []) || []).forEach((job) => {
        if (!job.productionOrder) return;
        if (!map[job.productionOrder]) map[job.productionOrder] = [];
        map[job.productionOrder].push(job);
      });
    });
    return map;
  }, []);

  // Available packing quantity per Work Order
  const packableByWO = useMemo(() => {
    const map = {};
    orders.forEach((order) => {
      const available = packableQuantityFor(order, entries, jobsByWO, records);
      if (available > 0) map[order.workOrder] = available;
    });
    return map;
  }, [orders, entries, jobsByWO, records]);

  // Completed production quantity per Work Order
  const completedByWO = useMemo(() => {
    const map = {};
    orders.forEach((order) => {
      map[order.workOrder] = completedProductionQty(order, entries, jobsByWO);
    });
    return map;
  }, [orders, entries, jobsByWO]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((record) => {
      const matchesSearch =
        !q || SEARCH_FIELDS.some((key) => String(record[key] ?? '').toLowerCase().includes(q));
      // Tab filter
      if (activeTab !== 'All' && record.status !== activeTab) return false;
      return matchesSearch;
    });
  }, [records, searchQuery, activeTab]);

  // Tab counts — single source of truth is the backend statistics endpoint,
  // computed from the SAME persisted packing_lists rows shown in the table.
  const tabCounts = useMemo(() => {
    const counts = { All: stats?.total ?? 0 };
    PACKING_STATUS_TABS.forEach((tab) => {
      if (tab.key === 'All') return;
      counts[tab.key] = stats?.[PACKING_TAB_TO_STATS_KEY[tab.key]] ?? 0;
    });
    return counts;
  }, [stats]);

  // KPI summary cards — calculated from backend /packing/stats (DB-backed),
  // never from a frontend-only counter or a different data source.
  const summary = useMemo(
    () => ({
      total: stats?.total ?? 0,
      pending: stats?.pending ?? 0,
      inProgress: stats?.inProgress ?? 0,
      completed: stats?.completed ?? 0,
      readyForDispatch: stats?.readyForDispatch ?? 0,
    }),
    [stats]
  );

  const filtersActive = searchQuery.trim() !== '' || filters.status !== 'All';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
  };

  // Navigate to preview after creating a new Packing List
  const lastCreatedId = useMemo(() => {
    if (formState) return null;
    if (records.length > 0 && !createdId) {
      const newest = records[0];
      if (newest.createdAt && (Date.now() - new Date(newest.createdAt).getTime()) < 2000) {
        return newest.id;
      }
    }
    return null;
  }, [records, createdId, formState]);

  // Navigate after create
  React.useEffect(() => {
    if (lastCreatedId) {
      setCreatedId(lastCreatedId);
      navigate(`/production/packing/${lastCreatedId}/preview`);
    }
  }, [lastCreatedId, navigate]);

  // Sync Packing record status to ProductionEntryContext for the Work Order Flow.
  const syncPackingStage = (record) => {
    if (!record.productionOrder) return;
    const wo = orders.find((o) => o.workOrder === record.productionOrder);
    const prodType = wo ? productionTypeOf(wo) : 'Casting';
    const statusMap = {
      'Dispatched': 'Completed',
      'Packed': 'Completed',
      'Ready for Dispatch': 'In Progress',
      'Pending': 'Pending',
      'Hold': 'Hold',
    };
    const packedQty = Number(record.packedQuantity) || 0;
    /* The Packing stage consumes the finished (QC-accepted) quantity and outputs
       the packed quantity. This used to send inputQuantity: 0, which violates the
       backend rule "output + rejected cannot exceed input" — so every packing save
       with a packed quantity was rejected with a 400, the Work Order's Packing
       stage never advanced, and (API errors being escalated globally) the browser
       was thrown onto the 400 error page right after a successful save. The max()
       keeps the entry valid even when the produced quantity cannot be resolved. */
    const producedQty = Number(completedByWO[record.productionOrder]) || 0;
    saveEntry({
      workOrderId: record.productionOrder,
      productionType: prodType,
      stage: 'Packing',
      inputQuantity: Math.max(producedQty, packedQty),
      outputQuantity: packedQty,
      rejectedQuantity: 0,
      operator: '',
      date: record.date || new Date().toISOString().slice(0, 10),
      remarks: record.remarks || '',
      status: statusMap[record.status] || record.status || 'Pending',
    });
  };

  /* Create Packing List lives on its own route — the list page only
     navigates there, so the form is never rendered inline. */
  const openCreate = () => {
    navigate('/production/packing/new');
  };

  /* Closing the form on either dedicated route means "back to the list". */
  const closeForm = () => {
    if (isPage) navigate('/production/packing');
  };

  // A stale / unknown edit link returns to the list rather than rendering an
  // empty form. Deliberately waits for the list to load first.
  useEffect(() => {
    if (!editPage || loading || routedRecord) return;
    navigate('/production/packing', { replace: true });
  }, [editPage, loading, routedRecord, navigate]);

  /* `mode` comes from the form footer: 'save' keeps the existing behaviour,
     'continue' opens the saved Packing List's preview. */
  const handleSubmit = async (values, { mode } = {}) => {
    const order = orders.find((o) => o.workOrder === values.productionOrder);
    const packedTotal = packedQtyOf(values);
    const record = {
      ...values,
      product: order?.product ?? values.product,
      // The list's Customer column and the document header both read `customer`,
      // but it was never carried into the payload, so every saved Packing List
      // stored a NULL customer and the column showed "—" for all of them.
      customer: order?.customer ?? values.customer ?? '',
      salesOrderId: order?.salesOrderId ?? values.salesOrderId,
      salesOrderNumber: order?.salesOrderNumber ?? values.salesOrderNumber,
      unit: order?.unit ?? values.unit,
      packedQuantity: packedTotal,
      status: derivePackingStatus(values.quantity, packedTotal),
    };

    try {
      if (formState?.mode === 'edit') {
        await updatePackingRecord(formState.record.id, record);
        syncPackingStage(record);
        if (mode === 'continue') {
          navigate(`/production/packing/${encodeURIComponent(formState.record.id)}/preview`);
        } else if (isPage) {
          navigate('/production/packing');
        }
      } else {
        const created = await createPackingRecord(record);
        syncPackingStage(record);
        /* No `setFormState` here: the form's open/close state is derived from
           the route (`/production/packing/new` vs `/:id/edit`), so there is no
           such setter — calling it threw "setFormState is not defined" AFTER
           the record had been created, which surfaced as a failed save and
           left the user on a form that had actually been saved. */
        if (mode === 'continue') {
          /* The create above is awaited, so the list already exists when its
             preview opens. Seeding `createdId` stops the post-create hand-off
             below from navigating a second time.

             The route `/production/packing/:id/preview` resolves the record by
             its PACKING LIST NUMBER: the create response carries that in
             `packingListNumber` while its `id` is the database primary key
             (1, 2, …). Navigating with the numeric key landed on "Packing List
             not found", so only the number is used — `record.id` (the number
             the form was created with) is the fallback. */
          const savedId = created?.packingListNumber || record.id;
          setCreatedId(savedId);
          navigate(`/production/packing/${encodeURIComponent(savedId)}/preview`);
        } else {
          setCreatedId(null);
          /* The list's post-create hand-off (open the new list's preview) is
             driven by the records effect below — it fires here too, so the
             create page keeps the exact same success behaviour as before. */
        }
      }
    } catch (err) {
      console.error('Failed to save packing list:', err);
      alert('Failed to save packing list: ' + (err.message || 'Unknown error. Please try again.'));
    }
  };

  const confirmDelete = () => {
    deletePackingRecord(deleting.id);
    setDeleting(null);
  };

  /* One form element serves both dedicated pages: `/production/packing/new`
     (create) and `/production/packing/:id/edit` (edit) — always in-flow
     `layout="page"`, never the overlay. */
  const packingForm = (
    <PackingListForm
      orders={orders}
      salesOrders={salesOrders}
      entries={entries}
      initialValues={editPage ? routedRecord : null}
      nextListNumber={nextPackingListNumber(records)}
      packableByWO={packableByWO}
      completedByWO={completedByWO}
      records={records}
      title={
        createPage
          ? `Create Packing List — ${nextPackingListNumber(records)}`
          : formState?.mode === 'edit'
            ? `Edit ${formState.record.id}`
            : `Create Packing List — ${nextPackingListNumber(records)}`
      }
      onSubmit={handleSubmit}
      onCancel={closeForm}
      onRefreshSources={refreshPackingSources}
      prefill={editPage ? null : sourcePrefill}
      layout="page"
    />
  );

  /* `/production/packing/new` and `/production/packing/:id/edit` render the
     form instead of the board: no header, KPI cards, tabs, toolbar or table
     behind it. The form is rendered unconditionally (not behind a state flag)
     so that in-app navigation into these routes can never land on an empty
     page. */
  if (isPage) {
    // The record is read from the list the context is still fetching — hold
    // the page rather than flashing an empty form.
    if (editPage && !routedRecord) return <div className="page" />;
    // Hold the page while the source CPO is read, so the form mounts ONCE with
    // the prefill already in its initial state (no post-mount overwrite of
    // anything the user has started typing).
    if (createPage && sourceCpoId && sourceLoading) return <div className="page" />;
    return <div className="page">{packingForm}</div>;
  }

  // When a Work Order number is clicked, show the Work Order flow inline
  if (selectedWorkOrder) {
    return (
      <div className="page">
        <WorkOrderJourneyTracker
          title={`Packing — Work Order ${selectedWorkOrder}`}
          selectedWorkOrder={selectedWorkOrder}
          onClose={() => setSelectedWorkOrder(null)}
        />
      </div>
    );
  }

  // Handoff: completed Packing List → Ready for Dispatch
  const readyForDispatch = (record) => {
    transitionOrderPath(record.productionOrder, ['Packed', 'Ready for Dispatch']);
    navigate('/production/dispatch');
  };

  const orderOptions = orders.map((order) => order.workOrder);
  const orderSelectOptions = orders.map((order) => ({
    value: order.workOrder,
    label: order.workOrder,
  }));

  return (
    <div className="page">
      <PageHeader
        title="Packing"
        subtitle="Pack finished production into professional Packing Lists — only completed production quantity is available."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {can('packing', 'create') && (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={15} /> Create Packing List
              </button>
            )}
          </div>
        }
      />

      <ModuleSummaryCards cards={SUMMARY_CARDS} values={summary} onCardClick={(key) => window.open(`/production/kpi/packing/${key}`, '_blank')} />

      {/* Status Tabs */}
      <div className="sf-stage-tabs">
        {PACKING_STATUS_TABS.map((tab) => (
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
        searchPlaceholder="Search by packing list, sales order, item name or operator..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalRecords={filtered.length}
        pageStart={filtered.length > 0 ? 1 : 0}
        pageEnd={filtered.length}
      />

      {/* Collapsible filters */}
      {showFiltersOpen && (
        <ShopFloorFilters
          ariaLabel="Search packing lists"
          searchPlaceholder="Search by packing list, sales order, item name or operator..."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          fields={[
            { key: 'status', label: 'Status', options: ['All', ...PACKING_STATUSES] },
          ]}
          filters={filters}
          onChange={setFilters}
          onClear={clearAll}
          clearVisible={filtersActive}
        />
      )}

      <section className="pt-table-card">
        {/* Same heading block as the Assembly board (.sf-board-*) so the
            list card reads identically across the Production screens. */}
        <div className="sf-board-head">
          <div>
            <h3 className="sf-board-title">Packing Lists</h3>
            <p className="sf-board-subtitle">
              Showing {filtered.length} of {records.length} packing lists
            </p>
          </div>
        </div>

        {/* Bulk Action Bar */}
        <ProductionBulkActionBar
          count={selectedIds.length}
          onExport={can('packing', 'export') && selectedIds.length > 0 ? () => {
            const selected = filtered.filter((r) => selectedIds.includes(r.id));
            const csv = selected.map((r) => `${r.id},${r.productionOrder},${r.product},${r.status}`).join('\n');
            const blob = new Blob([`Packing List,Work Order,Product,Status\n${csv}`], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'packing-lists-export.csv';
            a.click();
            URL.revokeObjectURL(url);
          } : undefined}
          onDelete={selectedIds.length > 0 ? () => setBulkDeleteConfirm(true) : undefined}
        />

        {filtered.length > 0 ? (
          <SettingsTable
            columns={PACKING_COLUMNS}
            rows={filtered}
            extra={{ onWorkOrderClick: (wo) => setSelectedWorkOrder(wo) }}
            onSelectionChange={setSelectedIds}
            renderActions={(record) => (
              <SettingsRowActions
                item={record}
                labels={{ singular: 'Packing List', name: 'id' }}
                canEdit={canEditPacking}
                canDelete={canDeletePacking}
                onPreview={(item) => navigate(`/production/preview/packing/${encodeURIComponent(item.id)}`)}
                onView={(item) => navigate(`/production/packing/${item.id}/preview`)}
                /* ⋮ → Edit opens the dedicated full-size edit page instead of
                   a half-width overlay panel over the still-mounted list. */
                onEdit={(item) => navigate(`/production/packing/${encodeURIComponent(item.id)}/edit`)}
                onDelete={setDeleting}
              />
            )}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="package" size={22} />
            </span>
            <h4>No packing lists found</h4>
            <p>
              {records.length === 0
                ? 'Create a Packing List once a Work Order has completed production.'
                : 'No records match your search and filter criteria.'}
            </p>
            {records.length === 0 && (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={14} /> Create Packing List
              </button>
            )}
          </div>
        )}
      </section>

      {deleting && (
        <Modal
          title="Delete Packing List"
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
          <p className="confirm-text">Are you sure you want to delete this Packing List?</p>
          <p className="confirm-subtext">
            <strong>{deleting.id}</strong> · {deleting.productionOrder} · {deleting.product}
          </p>
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <Modal
          title="Bulk Delete Packing Lists"
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
                  if (rec) deletePackingRecord(rec.id);
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
            Are you sure you want to delete {selectedIds.length} selected packing list{selectedIds.length > 1 ? 's' : ''}?
          </p>
          <p className="confirm-subtext">This action cannot be undone.</p>
        </Modal>
      )}
    </div>
  );
}

