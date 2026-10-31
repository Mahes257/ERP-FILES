import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ShopFloorBoard from '../components/production/shopfloor/ShopFloorBoard';
import WorkOrderJourneyTracker from '../components/production/WorkOrderJourneyTracker';
import { castingWorkflow } from '../data/casting';
import { useProductionEntry } from '../context/ProductionEntryContext';

// ============================================================
// Casting stage tabs — horizontal filter tabs
// ============================================================
const CASTING_STAGE_TABS = [
  'All Stages',
  ...castingWorkflow, // Technical Verification → Shell Preparation → Pouring → Blasting → Fettling
];

// ============================================================
// Status tabs for the Casting page
// ============================================================
const CASTING_STATUS_TABS = ['All', 'Pending', 'In Progress', 'Completed', 'On Hold'];

// ============================================================
// Table columns — matches the required layout
// ============================================================
// 'Stage' replaces the former 'Current Stage' column — both show the same
// casting stage, so keeping both would print the stage twice. The column sits
// right after Work Order / Order Description. The three-dot actions and the
// expanded per-job table are unchanged.
const COLUMNS = [
  'Work Order',
  'Order Description',
  'Stage',
  'Progress',
  'Status',
  'Created Date',
  'Actions',
];

// ============================================================
// Search and filter configuration
// ============================================================
const SEARCH_FIELDS = ['workOrder', 'product', 'customer'];

const FILTER_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'customer', label: 'Customer' },
];

/**
 * Casting shop floor page.
 *
 * Layout:
 *   Header → Summary Cards → Stage Tabs → Status Tabs → Search/Filters → Jobs Table
 *
 * The casting process (Technical Verification → … → Fettling) is shown as:
 *   1. Horizontal stage tabs that filter the jobs table
 *   2. The Stage column and the Stage field on the create/edit form
 *
 * Clicking a Work Order number opens the Work Order journey inline.
 */
export default function Casting({ stage, createPage = false, editPage = false }) {
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchParams] = useSearchParams();
  const { saveEntry, loadEntriesForOrder } = useProductionEntry();

  /* `/production/casting/new` and `/production/casting/:id/edit` render the
     very same board component in page mode: the whole board (list, cards,
     tabs, toolbar) is replaced by the Casting form rendered as a full page. */
  const isPage = createPage || editPage;
  const initialWorkOrder = createPage ? (searchParams.get('workOrder') || '') : '';

  // Sync a ShopFloorBoard job to a ProductionEntryContext entry so
  // the Work Order Flow reflects per-stage status.
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
      // which deleted EVERY stage entry of the Work Order whenever the (often
      // empty) entries list happened to contain a match — and did nothing at
      // all when it did not, so the deleted job simply returned on refresh.
      return;
    }
    if (!job.productionOrder || !job.stage) return;
    saveEntry({
      workOrderId: job.productionOrder,
      // The backend upserts on (work order, item, stage). Omitting the item
      // made this second write insert a DUPLICATE row whenever the stored
      // entry carried one (the board's own write keeps it).
      workOrderItemId: job.workOrderItemId || '',
      productionType: 'Casting',
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
        productionType="Casting"
        title={`Casting — Work Order ${selectedWorkOrder}`}
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
      key={createPage ? 'casting-create' : editPage ? 'casting-edit' : 'casting-board'}
      title="Casting"
      subtitle="Track the casting process from technical verification through fettling."
      jobs={[]}
      /* Do NOT pass workflow — the casting process is shown as stage tabs, not a separate workflow card */
      columns={COLUMNS}
      searchFields={SEARCH_FIELDS}
      filterFields={FILTER_FIELDS}
      searchPlaceholder="Search by work order, item name or customer..."
      tableTitle="Casting Jobs"
      stage={stage}
      storageKey="casting"
      idPrefix="CST"
      createLabel="Create Casting Job"
      productionType="Casting"
      stageTabs={CASTING_STAGE_TABS}
      statusTabs={CASTING_STATUS_TABS}
      dropdownStageOptions={castingWorkflow}
      moduleName="casting"
      onWorkOrderClick={(wo) => setSelectedWorkOrder(wo)}
      onJobChange={handleJobChange}
      /* Create Casting Job opens a dedicated full-page route instead of
         an in-page overlay. */
      createPath={isPage ? undefined : '/production/casting/new'}
      createPage={createPage}
      editPage={editPage}
      createBackPath="/production/casting"
      initialWorkOrder={initialWorkOrder}
    />
  );
}
