import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import PdfPrintButtons from '../components/PdfPrintButtons';
import Icon from '../components/icons/Icon';
import Modal from '../components/production/Modal';
import ProductionTableToolbar from '../components/production/ProductionTableToolbar';
import ProductionBulkActionBar from '../components/production/ProductionBulkActionBar';
import ShopFloorFilters from '../components/production/shopfloor/ShopFloorFilters';
import ModuleSummaryCards from '../components/production/ModuleSummaryCards';
import QualityTable, { QualityRowActions } from '../components/production/quality/QualityTable';
import QualityForm from '../components/production/quality/QualityForm';
import WorkOrderJourneyTracker from '../components/production/WorkOrderJourneyTracker';
import { useQuality } from '../context/QualityContext';
import { productionKpiApi } from '../utils/api';
import { subscribeProductionDataChanged } from '../utils/dataChanged';
import { useProductionOrders } from '../context/ProductionOrdersContext';
import { useProductionEntry } from '../context/ProductionEntryContext';
import { FILTER_DEPARTMENT_OPTIONS } from '../data/orders';
import { productionTypeOf } from '../data/entries';
import { INSPECTION_TYPES, QUALITY_STATUSES, emptyChecklist } from '../data/quality';
import { useDashboardNav } from '../context/DashboardNavContext';
import useProductionAccess from '../access/useProductionAccess';
import './Quality.css';
import '../components/production/shopfloor/ShopFloorTable.css';

const SEARCH_FIELDS = ['id', 'productionOrder', 'workOrder', 'product', 'inspector'];

const FILTER_FIELDS = [
  { key: 'status', label: 'Status', options: ['All', ...QUALITY_STATUSES] },
  { key: 'department', label: 'Department', options: ['All', ...FILTER_DEPARTMENT_OPTIONS] },
  { key: 'inspectionType', label: 'Inspection Type', options: ['All', ...INSPECTION_TYPES] },
];

const EMPTY_FILTERS = { status: 'All', department: 'All', inspectionType: 'All' };

/* KPI cards — the same shared card grid the Packing page uses, so the two
   modules share one card system (dimensions, padding, icon box, tones, gaps and
   responsive breakpoints). Only the labels/icons/hints below are Quality's.
   The numbers still come from `GET /production-kpi/quality/counts`. */
const SUMMARY_CARDS = [
  { key: 'pending', label: 'QC Pending', icon: 'clock', tone: 'amber', hint: 'inspections awaiting start' },
  { key: 'today', label: 'Inspections Today', icon: 'calendar', tone: 'blue', hint: 'scheduled or worked today' },
  { key: 'accepted', label: 'Accepted', icon: 'check', tone: 'green', hint: 'units accepted' },
  { key: 'rejected', label: 'Rejected', icon: 'x', tone: 'red', hint: 'units rejected' },
  { key: 'onHold', label: 'On Hold', icon: 'pause', tone: 'gray', hint: 'inspections on hold' },
];

/** Zeroes until the counters arrive, so the grid never jumps (or reads null). */
const EMPTY_SUMMARY = { pending: 0, today: 0, accepted: 0, rejected: 0, onHold: 0 };

// Status Tabs for Quality page
const STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'Pending', label: 'Pending' },
  { key: 'In Progress', label: 'In Progress' },
  { key: 'Passed', label: 'Passed' },
  { key: 'Failed', label: 'Failed' },
];

export default function Quality({ createPage = false, editPage = false }) {
  /* Access Management: Create/Edit/Delete of an inspection plus the
     protected page actions. The backend re-checks each call. */
  const { can } = useProductionAccess();
  const canEditQuality = can('quality', 'edit');
  const canDeleteQuality = can('quality', 'delete');
  const { id: editId } = useParams();
  const { inspections, loading, addInspection, updateInspection, deleteInspection, saveQcData } = useQuality();
  const { orders } = useProductionOrders();
  const { saveEntry } = useProductionEntry();
  const navigate = useNavigate();
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);

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
     inspection instead of losing it with the list's row-click state. */
  const isPage = createPage || editPage;
  const routedInspection = editPage
    ? inspections.find((inspection) => String(inspection.id) === String(editId)) || null
    : null;
  const editingInspection = routedInspection;
  const [deletingInspection, setDeletingInspection] = useState(null);
  // Read-only Preview (Actions ⋮ → Preview) — same UX as Quotations.
  const [selectedIds, setSelectedIds] = useState([]);
  /* A rejected save is reported ON the form. The quality write endpoints opt
     out of the global error page, so without this the user would get no
     feedback at all; and the previous behaviour (letting the interceptor take
     over) replaced the whole route with "Page Not Found" even though the form
     and its unsaved input were still perfectly valid. */
  const [submitError, setSubmitError] = useState('');
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

  const filteredInspections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return inspections.filter((inspection) => {
      const matchesSearch =
        !q ||
        SEARCH_FIELDS.some((key) => String(inspection[key] ?? '').toLowerCase().includes(q));
      // Tab filter
      if (activeTab !== 'All' && inspection.status !== activeTab) return false;
      const matchesDepartment =
        filters.department === 'All' || inspection.department === filters.department;
      const matchesType =
        filters.inspectionType === 'All' || inspection.inspectionType === filters.inspectionType;
      return matchesSearch && matchesDepartment && matchesType;
    });
  }, [inspections, searchQuery, filters, activeTab]);

  // Tab counts — status totals over the inspections this page has loaded (the
  // list needs those rows anyway to render itself).
  const tabCounts = useMemo(() => {
    const counts = { All: inspections.length };
    STATUS_TABS.forEach((tab) => {
      if (tab.key === 'All') return;
      counts[tab.key] = inspections.filter((i) => i.status === tab.key).length;
    });
    return counts;
  }, [inspections]);

  // KPI cards — counted and summed by the database (accepted/rejected are unit
  // sums), so the cards no longer depend on how many inspections were fetched.
  const [summaryValues, setSummaryValues] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loadCounts = async () => {
      try {
        const response = await productionKpiApi.counts('quality');
        if (!cancelled) setSummaryValues(response?.data ?? response);
      } catch {
        /* Keep the last known counters — the list reports its own errors. */
      }
    };
    loadCounts();
    // Coalesced: a burst of writes reloads these counters once, not once each.
    const unsubscribe = subscribeProductionDataChanged('quality-view', loadCounts);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Work Orders that actually exist — used to flag quality records whose
  // work_order reference is missing or points to a non-existent Work Order.
  const knownWorkOrders = useMemo(
    () => new Set(orders.map((o) => o.workOrder)),
    [orders]
  );

  const filtersActive =
    searchQuery.trim() !== '' ||
    filters.status !== 'All' ||
    filters.department !== 'All' ||
    filters.inspectionType !== 'All';

  const clearAll = () => {
    setSearchQuery('');
    setFilters(EMPTY_FILTERS);
  };

  const openCreate = () => {
    /* No editing state to reset: `editingInspection` is derived from the URL
       (`routedInspection`), so it is already null here and the Create route
       renders the form empty. This handler used to call the removed
       `setEditingInspection(null)` — a leftover from when the record was held
       in state instead of the route — which threw
       "ReferenceError: setEditingInspection is not defined" on every click. */
    /* Create Inspection lives on its own route — the list page only
       navigates there, so the form is never rendered inline. */
    navigate('/production/quality/new');
  };

  /* ⋮ → Edit opens the dedicated full-size edit page (the same presentation
     as Create Inspection) instead of a half-width overlay panel over the
     still-mounted list. */
  const openEdit = (inspection) => {
    navigate(`/production/quality/${encodeURIComponent(inspection.id)}/edit`);
  };

  // A stale / unknown edit link returns to the list rather than rendering an
  // empty form. Deliberately waits for the list to load first.
  useEffect(() => {
    if (!editPage || loading || routedInspection) return;
    navigate('/production/quality', { replace: true });
  }, [editPage, loading, routedInspection, navigate]);

  // Map Quality inspection status to a ProductionEntryContext stage entry status.
  const syncQcStage = useCallback((inspection) => {
    if (!inspection.productionOrder) return;
    // Look up the Work Order to determine its production type,
    // then create a stage entry that matches the workflow.
    const wo = orders.find((o) => o.workOrder === inspection.productionOrder);
    const prodType = wo ? productionTypeOf(wo) : 'Casting';
    const statusMap = {
      'Passed': 'Completed',
      'Failed': 'Hold',
      'In Progress': 'In Progress',
      'Pending': 'Pending',
      'Hold': 'Hold',
    };
    // Pass through the actual accepted/rejected quantities from the
    // inspection so that qcAcceptedQty() in packing.js can determine
    // how much is available for packing.
    saveEntry({
      workOrderId: inspection.productionOrder,
      // The entry is upserted on (order, item, stage). Without the item the QC
      // stage row could not be tied to the item it inspected, and two items of
      // one Work Order inspected at QC collapsed onto a single row.
      workOrderItemId: inspection.workOrderItemId || '',
      productionType: prodType,
      stage: 'QC',
      inputQuantity: Number(inspection.quantityInspected) || 0,
      outputQuantity: Number(inspection.acceptedQuantity) || 0,
      rejectedQuantity: Number(inspection.rejectedQuantity) || 0,
      operator: inspection.inspector || '',
      date: inspection.date || new Date().toISOString().slice(0, 10),
      remarks: inspection.remarks || '',
      status: statusMap[inspection.status] || inspection.status || 'Pending',
    });
  }, [saveEntry, orders]);

  /* Closing the form on either dedicated route means "back to the list". */
  const closeForm = () => {
    if (isPage) navigate('/production/quality');
  };

  const describeSaveError = (err, fallback) => {
    const status = err?.response?.status;
    const serverMessage = err?.response?.data?.message || err?.response?.data?.error;
    if (status === 404) {
      return serverMessage
        ? `Could not save the inspection — ${serverMessage}`
        : 'Could not save the inspection: the record no longer exists. It may have been deleted.';
    }
    return serverMessage || err?.message || fallback;
  };

  /* `mode` comes from the form footer: 'save' keeps the existing behaviour
     (back to the list), 'continue' opens the saved inspection's preview. */
  const handleFormSubmit = async (values, { mode } = {}) => {
    // Extract QC-specific data to save separately
    const { inspectionReport, dimensionalInspection, materialTestCertificate, finalQcInfo, ...inspectionFields } = values;

    setSubmitError('');

    // The record this save lands on — used by Save and Continue.
    let savedId = editingInspection ? editingInspection.id : null;

    try {
      if (editingInspection) {
        // The QC sections are owned by the dedicated `saveQcData` call below.
        // Spreading the record snapshot re-sent those four JSON fields as they
        // were when the form was OPENED, in a second PUT that raced the qc-data
        // PUT — so a QC section edited here could be silently reverted to its
        // pre-edit value. `inspectionFields` never contains them (they are
        // destructured out of the form values above); drop the stale copies too.
        const {
          inspectionReport: _staleReport,
          dimensionalInspection: _staleDimensional,
          materialTestCertificate: _staleMtc,
          finalQcInfo: _staleFinalQc,
          ...editingSnapshot
        } = editingInspection;
        /* The identifier of the record being edited is the one it was LOADED
           with — the route/list identity — never the Inspection ID box. That
           field is bound to the primary key the update targets, so taking the
           value from the form meant any change to it (a retyped number, a
           trimmed space) sent `PUT /quality-inspections/<new id>` and the
           backend answered 404 because no record with that id exists. */
        const persistedId = editingInspection.id;
        const editableFields = { ...editingSnapshot, ...inspectionFields, id: persistedId };
        // Both requests rewrite the whole inspection row on the backend, so
        // issuing them together let them race: whichever committed last won, and
        // when the update (whose copy of the four JSON columns came from the row
        // as it was when the form opened) committed after `saveQcData`, a
        // QC section edited here was silently reverted to its previous value.
        // Awaiting the update first makes the QC data the final write.
        await updateInspection(editableFields);
        syncQcStage(editableFields);
        // Save QC data (Inspection Report, Dimensional, MTC, Final QC)
        await saveQcData(persistedId, {
          inspectionReport,
          dimensionalInspection,
          materialTestCertificate,
          finalQcInfo,
        });
      } else {
        const newInspection = {
          ...inspectionFields,
          checklist: emptyChecklist(),
          history: [
            {
              date: new Date().toISOString(),
              action: 'Inspection Created',
              user: 'QC Planner',
              previousStatus: '—',
              newStatus: values.status,
              remarks: values.remarks || 'Inspection raised from the Quality module.',
            },
          ],
        };
        // Await the create so the QC data is saved against the inspection's real
        // database id. A new inspection has no id in the form values, so the old
        // values.id call sent PUT .../quality-inspections/undefined/qc-data and the
        // report / dimensional / MTC / final-QC data was silently discarded.
        const created = await addInspection(newInspection);
        syncQcStage(newInspection);
        const newId = created?.id ?? created?.backendId;
        if (newId) {
          savedId = newId;
          await saveQcData(newId, {
            inspectionReport,
            dimensionalInspection,
            materialTestCertificate,
            finalQcInfo,
          });
        }
      }
    } catch (err) {
      // Stay on the form so the entered values can be corrected and retried.
      setSubmitError(
        describeSaveError(err, editingInspection ? 'Failed to update the inspection.' : 'Failed to create the inspection.')
      );
      return;
    }
    if (mode === 'continue' && savedId) {
      navigate(`/production/preview/quality/${encodeURIComponent(savedId)}`);
      return;
    }
    if (isPage) navigate('/production/quality');
  };

  const confirmDelete = () => {
    if (deletingInspection) deleteInspection(deletingInspection.id);
    setDeletingInspection(null);
  };

  /* One form element serves both dedicated pages: `/production/quality/new`
     (create) and `/production/quality/:id/edit` (edit) — always in-flow
     `layout="page"`, never the overlay. */
  const qualityForm = (
    <QualityForm
      initialValues={editPage ? routedInspection : null}
      existingIds={inspections.map((inspection) => inspection.id)}
      orders={orders}
      title={
        createPage
          ? 'Create Inspection — Quality'
          : editingInspection
            ? `Edit ${editingInspection.id}`
            : 'Create Inspection'
      }
      onSubmit={handleFormSubmit}
      onCancel={closeForm}
      submitError={submitError}
      layout="page"
    />
  );

  /* `/production/quality/new` and `/production/quality/:id/edit` render the
     form instead of the board: no header, KPI cards, tabs, toolbar or table
     behind it. The form is rendered unconditionally (not behind a state flag)
     so that in-app navigation into these routes can never land on an empty
     page. */
  if (isPage) {
    // The record is read from the list the context is still fetching — hold
    // the page rather than flashing an empty form.
    if (editPage && !routedInspection) return <div className="page" />;
    return <div className="page">{qualityForm}</div>;
  }

  // When a Work Order number is clicked, show the Work Order flow inline
  if (selectedWorkOrder) {
    return (
      <WorkOrderJourneyTracker
        title={`Quality — Work Order ${selectedWorkOrder}`}
        selectedWorkOrder={selectedWorkOrder}
        onClose={() => setSelectedWorkOrder(null)}
      />
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Quality"
        subtitle="Plan inspections, record results and manage QC sign-off for production orders."
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {can('quality', 'create') && (
              <button type="button" className="btn btn-primary" onClick={openCreate}>
                <Icon name="plus" size={15} /> Create Inspection
              </button>
            )}
          </div>
        }
      />

      <ModuleSummaryCards
        cards={SUMMARY_CARDS}
        values={summaryValues || EMPTY_SUMMARY}
        onCardClick={(key) => window.open(`/production/kpi/quality/${key}`, '_blank')}
      />

      {/* Status Tabs */}
      <div className="sf-stage-tabs">
        {STATUS_TABS.map((tab) => (
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
        searchPlaceholder="Search by inspection ID, item name or inspector..."
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        totalRecords={filteredInspections.length}
        pageStart={filteredInspections.length > 0 ? 1 : 0}
        pageEnd={filteredInspections.length}
      />

      {/* Collapsible filters */}
      {showFiltersOpen && (
        <ShopFloorFilters
          ariaLabel="Search inspections"
          searchPlaceholder="Search by inspection ID, item name or inspector..."
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          fields={FILTER_FIELDS}
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
            <h3 className="sf-board-title">QC Inspections</h3>
            <p className="sf-board-subtitle">
              Showing {filteredInspections.length} of {inspections.length} inspections
            </p>
          </div>
        </div>

        {/* Bulk Action Bar */}
        <ProductionBulkActionBar
          count={selectedIds.length}
          onExport={selectedIds.length > 0 ? () => {
            const selected = filteredInspections.filter((i) => selectedIds.includes(i.id));
            const csv = selected.map((i) => `${i.id},${i.productionOrder},${i.product},${i.status}`).join('\n');
            const blob = new Blob([`Inspection ID,Work Order,Product,Status\n${csv}`], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'quality-inspections-export.csv';
            a.click();
            URL.revokeObjectURL(url);
          } : undefined}
          onDelete={selectedIds.length > 0 ? () => setBulkDeleteConfirm(true) : undefined}
        />

        {filteredInspections.length > 0 ? (
          <QualityTable
            inspections={filteredInspections}
            knownWorkOrders={knownWorkOrders}
            onWorkOrderClick={(wo) => setSelectedWorkOrder(wo)}
            onSelectionChange={setSelectedIds}
            renderActions={(inspection) => (
              <QualityRowActions
                inspection={inspection}
                onPreview={(inspection) => navigate(`/production/preview/quality/${encodeURIComponent(inspection.id)}`)}
                onView={() => navigate(`/production/quality/${inspection.id}`)}
                onEdit={openEdit}
                onDelete={setDeletingInspection}
                canEdit={canEditQuality}
                canDelete={canDeleteQuality}
              />
            )}
          />
        ) : (
          <div className="sf-empty">
            <span className="sf-empty-icon">
              <Icon name="search" size={22} />
            </span>
            <h4>No inspections found</h4>
            <p>No records match your search and filter criteria.</p>
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              Clear Filters
            </button>
          </div>
        )}
      </section>

      {deletingInspection && (
        <Modal
          title="Delete Inspection"
          size="sm"
          onClose={() => setDeletingInspection(null)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setDeletingInspection(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={confirmDelete}>
                <Icon name="trash" size={14} /> Delete
              </button>
            </>
          }
        >
          <p className="confirm-text">Are you sure you want to delete this inspection?</p>
          <p className="confirm-subtext">
            <strong>{deletingInspection.id}</strong> · {deletingInspection.product}
          </p>
        </Modal>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirm && (
        <Modal
          title="Bulk Delete Inspections"
          size="sm"
          onClose={() => setBulkDeleteConfirm(false)}
          footer={
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setBulkDeleteConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={() => {
                selectedIds.forEach((id) => {
                  const insp = inspections.find((i) => i.id === id);
                  if (insp) deleteInspection(insp.id);
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
            Are you sure you want to delete {selectedIds.length} selected inspection{selectedIds.length > 1 ? 's' : ''}?
          </p>
          <p className="confirm-subtext">This action cannot be undone.</p>
        </Modal>
      )}

    </div>
  );
}
