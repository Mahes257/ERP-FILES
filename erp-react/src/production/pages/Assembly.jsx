import React, { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ShopFloorBoard from '../components/production/shopfloor/ShopFloorBoard';
import WorkOrderJourneyTracker from '../components/production/WorkOrderJourneyTracker';
import { assemblyJobs, assemblyWorkflow } from '../data/assembly';

// ============================================================
// Status tabs for the Assembly page
// ============================================================
const ASSEMBLY_STATUS_TABS = ['All', 'Pending', 'In Progress', 'Completed', 'On Hold'];
import { useProductionEntry } from '../context/ProductionEntryContext';

// 'Stage' sits right after Work Order / Order Description, exactly like the
// Casting and Fabrication tables. It shows the persisted stage of the Work
// Order and is editable in place (see ShopFloorOrderTable).
const COLUMNS = [
  'Work Order',
  'Order Description',
  'Stage',
  'Status',
  'Progress',
  'Action',
];

const SEARCH_FIELDS = ['product', 'assemblyTask', 'operator'];

const FILTER_FIELDS = [
  { key: 'status', label: 'Status' },
  { key: 'operator', label: 'Operator' },
  { key: 'productionOrder', label: 'Work Order' },
];

/**
 * Assembly shop floor.
 * Clicking a Work Order number opens the Work Order flow inline.
 */
export default function Assembly({ createPage = false, editPage = false }) {
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [searchParams] = useSearchParams();
  const { saveEntry, loadEntriesForOrder } = useProductionEntry();

  /* `/production/assembly/new` and `/production/assembly/:id/edit` render the
     very same board component in page mode: the whole board (list, cards,
     tabs, toolbar) is replaced by the Assembly form rendered as a full page. */
  const isPage = createPage || editPage;
  const initialWorkOrder = createPage ? (searchParams.get('workOrder') || '') : '';

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
      // which removed EVERY stage entry of the Work Order (the defect fixed in
      // Casting and Fabrication). It was guarded by a match in the local
      // `entries` list, which is never populated.
      return;
    }
    if (!job.productionOrder || !job.stage) return;
    // Record the Assembly section's OWN production type. This used to save the
    // Work Order's type (productionTypeOf(wo)), which re-typed every Assembly
    // job to the order's type on any create/edit/status action — so the work
    // done here stopped being Assembly work, disappeared from this section and
    // surfaced on the Casting/Fabrication board instead. Assembly entries carry
    // their own type; the Work Order stays the source of truth for its master
    // data (item, drawing, quantities), which is unchanged below.
    const prodType = 'Assembly';
    saveEntry({
      workOrderId: job.productionOrder,
      // The backend upserts on (work order, item, stage). Omitting the item
      // made this second write insert a DUPLICATE row whenever the stored entry
      // carried one (the board's own write keeps it).
      workOrderItemId: job.workOrderItemId || '',
      productionType: prodType,
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
        title={`Work Order ${selectedWorkOrder}`}
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
      key={createPage ? 'assembly-create' : editPage ? 'assembly-edit' : 'assembly-board'}
      title="Assembly"
      subtitle="Manage assembly jobs and track production status."
      jobs={assemblyJobs}
      /* No workflow card — status shown as horizontal tabs */
      columns={COLUMNS}
      searchFields={SEARCH_FIELDS}
      filterFields={FILTER_FIELDS}
      searchPlaceholder="Search by work order, item name, task or operator..."
      tableTitle="Assembly Jobs"
      storageKey="assembly"
      idPrefix="ASM"
      createLabel="Create Assembly Job"
      stageFilter="Assembly"
      /* The Assembly section consumes ANY Work Order — cast and fabricated
         parts are assembled here too — so every Production Order is listed and
         each row aggregates only its Assembly entries (see useShopFloorJobs /
         ProductionEntry.productionType). */
      allWorkOrders
      /* The six Assembly stages — the one definition in data/assembly.js —
         drive the bordered Stage field on the form and the inline Stage
         editor on the table. */
      dropdownStageOptions={assemblyWorkflow}
      statusTabs={ASSEMBLY_STATUS_TABS}
      extraFields={[
        { key: 'assemblyTask', label: 'Assembly Task', type: 'text', placeholder: 'e.g. Sub-Assembly, Final Assembly' },
      ]}
      moduleName="assembly"
      onWorkOrderClick={(wo) => setSelectedWorkOrder(wo)}
      onJobChange={handleJobChange}
      /* Create Assembly Job opens a dedicated full-page route instead of an
         in-page overlay. */
      createPath={isPage ? undefined : '/production/assembly/new'}
      createPage={createPage}
      editPage={editPage}
      createBackPath="/production/assembly"
      initialWorkOrder={initialWorkOrder}
    />
  );
}
