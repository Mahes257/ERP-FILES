// ============================================================
// Production Entry — hybrid stage flow definitions.
//
// The Production module supports BOTH automatic stage flow and
// manual stage entry through ONE shared process-record structure
// (stage entries stored under localStorage `production.entries`).
// Production Type selects the stage workflow; the Production Order
// remains the single source of truth for all master information.
//
// No demo records are created here — only vocabulary + helpers.
// ============================================================
import { castingWorkflow } from './casting';
import { fabricationWorkflow } from './fabrication';
import { assemblyWorkflow } from './assembly';

/** Production entry types that have a defined stage workflow. */
export const PRODUCTION_TYPES = ['Casting', 'Fabrication', 'Assembly'];

/**
 * Every Production Entry section of the module. Casting / Fabrication /
 * Assembly entries belong to Work Orders of the same type; QC / Packing /
 * Dispatch are downstream stages that record process entries against any
 * Work Order — each entry always keeps its own `productionType`.
 */
export const ENTRY_MODULE_TYPES = ['Casting', 'Fabrication', 'Assembly', 'QC', 'Packing', 'Dispatch'];

/** Entry sections that consume ANY Work Order (downstream stages). */
export const DOWNSTREAM_ENTRY_TYPES = ['QC', 'Packing', 'Dispatch'];

/** Status vocabulary for a stage entry. */
export const ENTRY_STATUSES = ['Pending', 'In Progress', 'Hold', 'Completed', 'Skipped'];

/** Standard hold reasons shown when a stage is put on Hold. */
export const HOLD_REASONS = [
  'Machine Maintenance',
  'Material Shortage',
  'Quality Issue',
  'Waiting for Approval',
  'Other',
];

/** Standard skip reasons shown when a stage is officially skipped. */
export const SKIP_REASONS = [
  'Not Applicable',
  'Customer Approved Deviation',
  'Replaced by Alternative Process',
  'Duplicate of Previous Stage',
  'Other',
];

/**
 * Roadmap stage workflows, in order.
 * Each production type includes its full downstream flow:
 * Acknowledgement & Technical Verification (Work Order fields,
 * displayed as prefix in WorkOrderJourneyTracker) →
 * production stages → QC → Packing → Dispatch.
 *
 * The downstream entry sections (QC / Packing / Dispatch) each get
 * their OWN single-stage workflow with stage names distinct from
 * every production workflow above — so a downstream entry can never
 * be confused with (or overwrite) a production stage entry.
 */
export const ENTRY_WORKFLOWS = {
  // The Casting stages live in ONE place (data/casting.js) so the Casting
  // board's tabs/dropdown and the Work Order workflow can never disagree.
  Casting: [...castingWorkflow],
  // Same for Fabrication (data/fabrication.js). QC / Packing / Dispatch are
  // separate modules, not Fabrication stages.
  Fabrication: [...fabricationWorkflow],
  // And for Assembly (data/assembly.js): Technical Verification → Pending →
  // Assembly → Quality → Packing → Dispatch.
  Assembly: [...assemblyWorkflow],
  // Downstream entry sections — one dedicated stage each.
  QC: ['QC Inspection'],
  Packing: ['Packing'],
  Dispatch: ['Dispatch'],
};

/** Ordered stages for a production type (empty when unknown). */
export const workflowForType = (type) => ENTRY_WORKFLOWS[type] || [];

/**
 * The production type of an order. New orders carry `productionType`
 * explicitly; older orders fall back to their department.
 */
export const productionTypeOf = (order) =>
  order?.productionType ||
  (order?.department === 'Fabrication'
    ? 'Fabrication'
    : order?.department === 'Assembly'
      ? 'Assembly'
      : order?.department === 'Casting'
        ? 'Casting'
        : 'Casting');

/**
 * The effective current stage of an order within its workflow.
 * An order created before this system may hold a department-level
 * current stage ('Casting') — in that case the workflow's first
 * stage is the effective current one.
 */
export const effectiveCurrentStage = (order) => {
  const flow = workflowForType(productionTypeOf(order));
  if (!flow.length) return '';
  return flow.includes(order?.currentStage) ? order.currentStage : flow[0];
};

/** The stage that follows `stage` in `type`'s workflow ('Completed' after the last). */
export const nextEntryStage = (type, stage) => {
  const flow = workflowForType(type);
  const index = flow.indexOf(stage);
  if (index === -1) return flow[0] || '';
  return index < flow.length - 1 ? flow[index + 1] : 'Completed';
};

/** Pending / balance = input − output − rejected, never negative. */
export const pendingQuantity = (input, output, rejected) =>
  Math.max(0, (Number(input) || 0) - (Number(output) || 0) - (Number(rejected) || 0));

/** Entries recorded for one Work Order. */
const entriesOf = (workOrderId, entries) =>
  (entries || []).filter((entry) => entry.workOrderId === workOrderId);

/**
 * Entries of one Work Order that belong to the ORDER'S OWN production
 * type. Stage entries are strictly separated per Production stage —
 * a QC / Packing / Dispatch entry against a Casting Work Order must
 * never influence the Casting workflow's derived status, progress or
 * quantity totals (and vice versa). Legacy records without
 * `productionType` fall back to matching the order's workflow stages.
 */
export const orderEntriesOf = (order, entries) => {
  const type = productionTypeOf(order);
  const flow = workflowForType(type);
  return (entries || []).filter(
    (entry) =>
      entry.workOrderId === order?.workOrder &&
      (entry.productionType ? entry.productionType === type : flow.includes(entry.stage))
  );
};

/** Is a stage entry "done" (no longer blocks the workflow)? */
const entryDone = (entry) =>
  Boolean(entry) && (entry.status === 'Completed' || entry.status === 'Skipped');

/**
 * OVERALL Work Order status — automatically derived from the stage
 * entries, never manually typed.
 *
 * Accepts optional ackRecord / tvRecord so the status accounts for
 * the Acknowledgement → Technical Verification → Production flow:
 *
 *   - ack not acknowledged      → Pending (awaiting acknowledgement)
 *   - ack done, TV pending      → In Progress (awaiting TV)
 *   - TV done, no stage started → In Progress (awaiting first stage)
 *   - any stage on Hold         → Hold
 *   - any stage In Progress     → In Progress
 *   - all stages done           → Completed
 *   - order explicitly cancelled → Cancelled
 */
export const overallStatusFor = (order, entries, ackRecord, tvRecord) => {
  if (!order) return 'Pending';
  if (order.status === 'Cancelled') return 'Cancelled';

  // Draft & approval statuses are direct — not derived from entries.
  const draftStatuses = [
    'Draft', 'Pending Production Approval', 'Production Approved',
    'Pending Admin Approval', 'Admin Approved', 'Approved',
  ];
  if (draftStatuses.includes(order.status)) return order.status;

  // Acknowledgement gate — must be completed before anything else.
  const ackDone = ackRecord?.status === 'Acknowledged';
  if (!ackDone) return 'Pending';

  // Technical Verification gate — must be completed after Ack.
  const tvDone = tvRecord?.verificationStatus === 'Verified';
  if (!tvDone) return 'In Progress';

  // All gates passed — derive from production stage entries.
  const orderEntries = orderEntriesOf(order, entries);
  if (orderEntries.length === 0) return 'In Progress';
  if (orderEntries.some((entry) => entry.status === 'Hold')) return 'Hold';
  if (orderEntries.some((entry) => entry.status === 'In Progress')) return 'In Progress';
  const flow = workflowForType(productionTypeOf(order));
  if (flow.length && flow.every((stage) => entryDone(orderEntries.find((e) => e.stage === stage)))) {
    return 'Completed';
  }
  return 'In Progress';
};

/**
 * CURRENT STAGE — automatic, never typed.
 *
 * Accepts optional ackRecord / tvRecord to enforce the
 * Approval → Technical Verification → Production flow.
 *
 * Returns one of:
 *   'Approval'                — approval not yet completed
 *   'Technical Verification'  — approval done, TV not yet completed
 *   <production stage name>   — the first active/pending production stage
 *   'Completed'               — every stage is done
 */
export const currentStageFor = (order, entries, ackRecord, tvRecord) => {
  const flow = workflowForType(productionTypeOf(order));

  // Approval gate — must come first (both Production + Admin).
  const approvalDone = Boolean(order?.productionApprovedBy && order?.adminApprovedBy);
  if (!approvalDone) return 'Approval';

  // Technical Verification gate — must come second.
  const tvDone = tvRecord?.verificationStatus === 'Verified';
  if (!tvDone) return 'Technical Verification';

  // All gates passed — find the current production stage.
  if (!flow.length) return effectiveCurrentStage(order);
  const orderEntries = orderEntriesOf(order, entries);
  const activeStage = flow.find((stage) => {
    const entry = orderEntries.find((e) => e.stage === stage);
    return entry && (entry.status === 'In Progress' || entry.status === 'Hold');
  });
  if (activeStage) return activeStage;
  const pendingStage = flow.find((stage) => !entryDone(orderEntries.find((e) => e.stage === stage)));
  return pendingStage || 'Completed';
};

/**
 * PROGRESS — completed-or-skipped workflow stages ÷ total stages,
 * plus Acknowledgement and Technical Verification as the first two
 * steps. Skipped stages count as handled so they don't block.
 *
 * Total steps = 2 (Ack + TV) + production workflow length.
 */
export const progressFor = (order, entries, ackRecord, tvRecord) => {
  const flow = workflowForType(productionTypeOf(order));
  if (!flow.length) return order?.progress || 0;

  // Count Ack + TV as the first two steps. A workflow that CONTAINS
  // 'Technical Verification' as its own first stage (Casting) already counts
  // that gate once, through the stage entries — counting the TV record as well
  // made the same step count twice and inflated the percentage denominator.
  const tvIsWorkflowStage = flow.includes('Technical Verification');
  let doneCount = 0;
  const ackDone = ackRecord?.status === 'Acknowledged';
  const tvDone = tvRecord?.verificationStatus === 'Verified';
  if (ackDone) doneCount += 1;
  if (tvDone && !tvIsWorkflowStage) doneCount += 1;

  // Count production stage entries.
  const orderEntries = orderEntriesOf(order, entries);
  doneCount += flow.filter((stage) =>
    entryDone(orderEntries.find((e) => e.stage === stage))
  ).length;

  const totalSteps = (tvIsWorkflowStage ? 1 : 2) + flow.length;
  return totalSteps ? Math.min(100, Math.round((doneCount / totalSteps) * 100)) : 0;
};

// ============================================================
// Item-level helpers for multi-item Work Orders.
// Each item in a Work Order has its own production type, workflow,
// quantities, and status.
// ============================================================

/** Get the production type of a specific item. */
export const productionTypeOfItem = (item) =>
  item?.productionType || 'Casting';

/** Get the workflow for a specific item. */
export const workflowForItem = (item) =>
  workflowForType(productionTypeOfItem(item));

/**
 * Item-level overall status — derived from the item's own stage
 * entries, Acknowledgement, and Technical Verification.
 */
export const itemOverallStatus = (order, item, entries, ackRecord, tvRecord) => {
  if (!order || !item) return 'Pending';

  const draftStatuses = [
    'Draft', 'Pending Production Approval', 'Production Approved',
    'Pending Admin Approval', 'Admin Approved', 'Approved',
  ];
  if (draftStatuses.includes(order.status)) return order.status;

  // Approval gate
  const approvalDone = Boolean(order?.productionApprovedBy && order?.adminApprovedBy);
  if (!approvalDone) return 'Pending';

  // Technical Verification gate
  const tvDone = tvRecord?.verificationStatus === 'Verified';
  if (!tvDone) return 'In Progress';

  // Derive from item's own stage entries
  const itemEntries = itemEntriesOf(order, item, entries);
  if (itemEntries.length === 0) return 'In Progress';
  if (itemEntries.some((e) => e.status === 'Hold')) return 'Hold';
  if (itemEntries.some((e) => e.status === 'In Progress')) return 'In Progress';
  const flow = workflowForItem(item);
  if (flow.length && flow.every((stage) => entryDone(itemEntries.find((e) => e.stage === stage)))) {
    return 'Completed';
  }
  return 'In Progress';
};

/**
 * Item-level current stage.
 */
export const itemCurrentStage = (order, item, entries, ackRecord, tvRecord) => {
  const flow = workflowForItem(item);

  const ackDone = ackRecord?.status === 'Acknowledged';
  if (!ackDone) return 'Acknowledgement';

  const tvDone = tvRecord?.verificationStatus === 'Verified';
  if (!tvDone) return 'Technical Verification';

  if (!flow.length) return item?.currentStage || item?.productionType || '';
  const itemEntries = itemEntriesOf(order, item, entries);
  const activeStage = flow.find((stage) => {
    const entry = itemEntries.find((e) => e.stage === stage);
    return entry && (entry.status === 'In Progress' || entry.status === 'Hold');
  });
  if (activeStage) return activeStage;
  const pendingStage = flow.find((stage) => !entryDone(itemEntries.find((e) => e.stage === stage)));
  return pendingStage || 'Completed';
};

/**
 * Item-level progress percentage.
 */
export const itemProgress = (order, item, entries, ackRecord, tvRecord) => {
  const flow = workflowForItem(item);
  if (!flow.length) return 0;

  let doneCount = 0;
  const ackDone = ackRecord?.status === 'Acknowledged';
  const tvDone = tvRecord?.verificationStatus === 'Verified';
  if (ackDone) doneCount += 1;
  if (tvDone) doneCount += 1;

  const itemEntries = itemEntriesOf(order, item, entries);
  doneCount += flow.filter((stage) =>
    entryDone(itemEntries.find((e) => e.stage === stage))
  ).length;

  const totalSteps = 2 + flow.length;
  return totalSteps ? Math.min(100, Math.round((doneCount / totalSteps) * 100)) : 0;
};

/**
 * Entries for a specific Work Order Item.
 */
const itemEntriesOf = (order, item, entries) => {
  const type = productionTypeOfItem(item);
  const flow = workflowForType(type);
  return (entries || []).filter(
    (entry) =>
      entry.workOrderId === order?.workOrder &&
      (entry.workOrderItemId || '') === (item?.id || '') &&
      (entry.productionType ? entry.productionType === type : flow.includes(entry.stage))
  );
};

/**
 * Work Order overall status derived from ALL items.
 * Only Completed when every item is Completed.
 */
export const workOrderOverallStatus = (order, entries, ackRecord, tvRecord) => {
  if (!order) return 'Pending';
  const items = order.items || [];
  if (items.length === 0) return order.status || 'Pending';

  const draftStatuses = [
    'Draft', 'Pending Production Approval', 'Production Approved',
    'Pending Admin Approval', 'Admin Approved', 'Approved',
  ];
  if (draftStatuses.includes(order.status)) return order.status;

  const itemStatuses = items.map((item) =>
    itemOverallStatus(order, item, entries, ackRecord, tvRecord)
  );

  if (itemStatuses.every((s) => s === 'Completed')) return 'Completed';
  if (itemStatuses.some((s) => s === 'Hold')) return 'Hold';
  if (itemStatuses.some((s) => s === 'In Progress')) return 'In Progress';
  return 'In Progress';
};

/**
 * Work Order progress derived from all items (average of item progresses).
 */
export const workOrderProgress = (order, entries, ackRecord, tvRecord) => {
  const items = order.items || [];
  if (items.length === 0) return order?.progress || 0;
  const progresses = items.map((item) =>
    itemProgress(order, item, entries, ackRecord, tvRecord)
  );
  return Math.round(progresses.reduce((a, b) => a + b, 0) / progresses.length);
};

/**
 * Total quantity across all items in a Work Order.
 */
export const totalQuantityOfOrder = (order) =>
  (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

/**
 * Get an item by its ID from a Work Order.
 */
export const getItemById = (order, itemId) =>
  (order.items || []).find((item) => item.id === itemId) || null;

/**
 * Update a single item within a Work Order's items array.
 */
export const updateItemInOrder = (order, itemId, updates) => ({
  ...order,
  items: (order.items || []).map((item) =>
    item.id === itemId ? { ...item, ...updates } : item
  ),
});
