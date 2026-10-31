// ============================================================
// Production Orders — demo data + shared option lists.
// Single source of truth for the Orders module.
// ============================================================

export const PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Urgent'];

export const STATUS_OPTIONS = [
  'Draft',
  'Pending Production Approval',
  'Production Approved',
  'Pending Admin Approval',
  'Admin Approved',
  'Approved',
  'Pending',
  'In Progress',
  'Hold',
  'Pending QC',
  'Completed',
  'Packed',
  'Ready for Dispatch',
  'Cancelled',
];

export const DEPARTMENT_OPTIONS = [
  'Casting',
  'Fabrication',
  'Machine Shop',
  'Assembly',
  'Quality',
  'Packing',
  'Dispatch',
];

// Department filter options (per roadmap).
export const FILTER_DEPARTMENT_OPTIONS = ['Casting', 'Fabrication', 'Machine Shop', 'Assembly'];

export const STAGE_OPTIONS = [
  'Casting',
  'Fabrication',
  'Machine Shop',
  'Assembly',
  'Quality',
  'Packing',
  'Dispatch',
];

// Granular work stages grouped under their lifecycle module so the
// Current Stage filter works with realistic stage names (Blasting, Welding…).
/**
 * Stage groups — QC / Quality is the final production stage.
 * Packing and Dispatch are separate modules (not production stages).
 */
export const STAGE_GROUPS = {
  Casting: ['Shell Preparation', 'Pouring', 'Blasting', 'QC'],
  Fabrication: ['Raw Material', 'Cutting', 'Bending', 'Welding', 'Hard Facing', 'QC'],
  Assembly: ['Assembly', 'Quality'],
};

/** Map a granular stage to its lifecycle module ('Blasting' → 'Casting'). */
export const stageGroupOf = (stage) => {
  if (!stage) return '';
  for (const [group, stages] of Object.entries(STAGE_GROUPS)) {
    if (stages.includes(stage)) return group;
  }
  return stage;
};

// Production orders are USER-ENTRY-ONLY: the list starts empty and
// every order is created by the user through the UI. Records are
// persisted in localStorage (src/utils/storage.js) via the
// ProductionOrdersContext — nothing is seeded here.
export const productionOrders = [];

/**
 * Next automatic Work Order Number — the ONLY production identifier.
 *
 * Work Orders follow `WO-0001, WO-0002, …`, derived from the EXISTING
 * user-created orders so numbering never duplicates and continues
 * correctly after a browser refresh:
 *
 *   no orders   → WO-0001
 *   WO-0001     → WO-0002
 *   WO-0007     → WO-0008
 */
export function nextWorkOrderNumber(orders = []) {
  let maxWo = 0;
  orders.forEach((order) => {
    const woMatch = /^WO-(\d+)$/.exec(String(order.workOrder || ''));
    if (woMatch) maxWo = Math.max(maxWo, Number(woMatch[1]));
  });
  return `WO-${String(maxWo + 1).padStart(4, '0')}`;
}

// Batch number prefix per Production Type.
export const BATCH_PREFIX = {
  Casting: 'CAST',
  Fabrication: 'FAB',
  Assembly: 'ASM',
};

/**
 * Next automatic Batch Number for a Production Type.
 *
 * Batch numbers follow the type prefix and increment per existing
 * user-created orders of that type (CAST-001, CAST-002, FAB-001, …)
 * so batches never duplicate and numbering continues after refresh.
 */
export function nextBatchNumber(orders = [], productionType) {
  const prefix = BATCH_PREFIX[productionType];
  if (!prefix) return '';
  let max = 0;
  orders.forEach((order) => {
    const match = /^(CAST|FAB|ASM)-(\d+)$/.exec(String(order.batchNumber || ''));
    if (match && match[1] === prefix) max = Math.max(max, Number(match[2]));
  });
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}
