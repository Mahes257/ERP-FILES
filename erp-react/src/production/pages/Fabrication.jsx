import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ShopFloorBoard from '../components/production/shopfloor/ShopFloorBoard';
import WorkOrderJourneyTracker from '../components/production/WorkOrderJourneyTracker';
import { fabricationJobs, fabricationWorkflow } from '../data/fabrication';

// ============================================================
// Fabrication stage tabs — horizontal filter tabs
// ============================================================
// The stage vocabulary lives in data/fabrication.js; the tabs, the Stage
// dropdown and the Work Order workflow all read that one list.
const FABRICATION_STAGE_TABS = ['All Stages', ...fabricationWorkflow];

// ============================================================
// Status tabs for the Fabrication page
// ============================================================
const FABRICATION_STATUS_TABS = ['All', 'Pending', 'In Progress', 'Completed', 'On Hold'];
import { useProductionEntry } from '../context/ProductionEntryContext';
import { useDashboardNav } from '../context/DashboardNavContext';

const COLUMNS = [
  'Work Order',
  'Order Description',
  'Stage',
  'Status',
  'Progress',
  'Action',
];

const SEARCH_FIELDS = ['product', 'operator'];

const FILTER_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'operator', label: 'Operator' },
  { key: 'productionOrder', label: 'Work Order' },
];

/**
 * Fabrication shop floor. `stage` (optional) narrows the board to a
 * single workflow stage — used by the nested sidebar routes
 * (/production/fabrication/cutting, /production/fabrication/welding, ...).
 *
 * Clicking a Work Order number opens the Work Order flow inline.
 */
export default function Fabrication({ stage, createPage = false, editPage = false }) {
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchParams] = useSearchParams();
  const { saveEntry, loadEntriesForOrder } = useProductionEntry();
  const { nav, clearNav } = useDashboardNav();

  /* `/production/fabrication/new` and `/production/fabrication/:id/edit`
     render the very same board component in page mode: the whole board (list,
     cards, tabs, toolbar) is replaced by the Fabrication form rendered as a
     full page. */
  const isPage = createPage || editPage;
  const initialWorkOrder = createPage ? (searchParams.get('workOrder') || '') : '';

  // Apply dashboard navigation state on mount (e.g. click Raw Material from dashboard)
  useEffect(() => {
    if (nav?.stage) {
      // The stage filter is handled by the ShopFloorBoard's stageTabs + activeStageTab
      clearNav();
    }
  }, [nav, clearNav]);

  const handleJobChange = useCallback((job, action) => {
    /* An inline stage change is already persisted by the board; here the only
       thing left is to revalidate this page's entry store (the View page and
       the Work Order flow read from it), never to write the entry again. */
    if (action === 'stage') {
      if (job.productionOrder) loadEntriesForOrder(job.productionOrder);
      return;
    }
    if (action === 'delete') {
      // Nothing to do: the shop floor board already deleted the single
      // Production Entry behind this job.
      //
      // This branch used to call deleteEntriesForOrder(job.productionOrder),
      // which removed EVERY stage entry of the Work Order — the same defect
      // fixed in Casting. It was guarded by a match in the local `entries`
      // list, which is never populated, so it deleted nothing when it should
      // have and would have wiped unrelated stages if it ever matched.
      return;
    }
    if (!job.productionOrder || !job.stage) return;
    saveEntry({
      workOrderId: job.productionOrder,
      // The backend upserts on (work order, item, stage). Omitting the item
      // made this second write insert a DUPLICATE row whenever the stored
      // entry carried one (the board's own write keeps it).
      workOrderItemId: job.workOrderItemId || '',
      productionType: 'Fabrication',
      stage: job.stage,
      inputQuantity: Number(job.plannedQuantity) || 0,
      outputQuantity: Number(job.completedQuantity) || 0,
      rejectedQuantity: Number(job.rejectedQuantity) || 0,
      operator: job.operator || '',
      date: job.startDate || job.date || new Date().toISOString().slice(0, 10),
      remarks: job.remarks || '',
      status: job.status || 'Pending',
    });
  }, [saveEntry, loadEntriesForOrder]);

  if (!isPage && selectedWorkOrder) {
    return (
      <WorkOrderJourneyTracker
        productionType="Fabrication"
        title={`Fabrication — Work Order ${selectedWorkOrder}`}
        selectedWorkOrder={selectedWorkOrder}
        onClose={() => setSelectedWorkOrder(null)}
      />
    );
  }

  return (
    <ShopFloorBoard
      /* Force a fresh mount when switching between the board and the
         dedicated create page — otherwise React reuses the same instance,
         the form state initialiser never re-runs and the create page
         renders empty when reached by in-app navigation. */
      key={createPage ? 'fabrication-create' : editPage ? 'fabrication-edit' : 'fabrication-board'}
      title="Fabrication"
      subtitle="Manage fabrication jobs from technical verification through powder coat/paint."
      jobs={fabricationJobs}
      /* No workflow card — stage process shown as horizontal tabs */
      columns={COLUMNS}
      searchFields={SEARCH_FIELDS}
      filterFields={FILTER_FIELDS}
      searchPlaceholder="Search by work order, item name or operator..."
      tableTitle="Fabrication Jobs"
      stage={stage}
      storageKey="fabrication"
      idPrefix="FAB"
      createLabel="Create Fabrication Job"
      productionType="Fabrication"
      stageTabs={FABRICATION_STAGE_TABS}
      statusTabs={FABRICATION_STATUS_TABS}
      dropdownStageOptions={fabricationWorkflow}
      moduleName="fabrication"
      onWorkOrderClick={(wo) => setSelectedWorkOrder(wo)}
      onJobChange={handleJobChange}
      /* Create Fabrication Job opens a dedicated full-page route instead of
         an in-page overlay. */
      createPath={isPage ? undefined : '/production/fabrication/new'}
      createPage={createPage}
      editPage={editPage}
      createBackPath="/production/fabrication"
      initialWorkOrder={initialWorkOrder}
    />
  );
}
