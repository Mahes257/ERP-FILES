// ============================================================
// Fabrication shop floor — process workflow (roadmap) + empty list.
// Process: Technical Verification → Raw Material → Cutting → Bending →
// Welding → Hard Facing → Powder Coat/Paint.
//
// This list is the Fabrication module's SINGLE stage definition: the
// Fabrication board uses it for its stage tabs and its Stage dropdown,
// and data/entries.js reuses it for the Fabrication Work Order workflow
// (the same pattern the Casting stages use).
//
// Downstream QC / Packing / Dispatch are SEPARATE modules with their own
// entries — they are not Fabrication stages. Legacy rows stored under those
// stage names are left untouched and still show in the entry history.
//
// Fabrication jobs are USER-ENTRY-ONLY: the board starts empty and every
// job is created by the user through the UI. Records are persisted in the
// Production Entries API by useShopFloorJobs — nothing is seeded here.
// ============================================================

export const fabricationWorkflow = [
  'Technical Verification',
  'Raw Material',
  'Cutting',
  'Bending',
  'Welding',
  'Hard Facing',
  'Powder Coat/Paint',
];

export const fabricationJobs = [];

/** An entry no longer blocks the workflow. */
export const fabricationEntryDone = (entry) =>
  Boolean(entry) && (entry.status === 'Completed' || entry.status === 'Skipped');

/**
 * Stage state derived ONLY from the saved Fabrication stage entries of one
 * Work Order — the single source the Fabrication list, the View page and the
 * stage strip share, so they can never disagree.
 *
 * - `done`    : the stage has a stored entry whose status is Completed/Skipped
 *               (never inferred from the stage order or from an approval)
 * - `current` : the stage the Work Order is actually sitting on — an
 *               In Progress entry, otherwise the highest recorded stage,
 *               exactly like the list's Stage column
 * - legacy stages (e.g. 'QC', 'Packing', 'Dispatch') are ignored for the
 *   seven-step progress but stay visible in the entry history untouched
 *
 * @param {Array} entries Fabrication stage entries of ONE Work Order
 */
export const fabricationStageProgress = (entries = []) => {
  const byStage = new Map();
  (entries || []).forEach((entry) => {
    if (!entry?.stage || !fabricationWorkflow.includes(entry.stage)) return;
    byStage.set(entry.stage, entry);
  });

  const active = (entries || []).find(
    (entry) => entry?.status === 'In Progress' && fabricationWorkflow.includes(entry.stage)
  );
  const recorded = fabricationWorkflow.filter((stage) => byStage.has(stage));
  const currentStage = active?.stage || recorded[recorded.length - 1] || '';

  const steps = fabricationWorkflow.map((stage) => {
    const entry = byStage.get(stage) || null;
    return {
      stage,
      entry,
      status: entry?.status || 'Pending',
      done: fabricationEntryDone(entry),
      current: stage === currentStage,
    };
  });

  const doneCount = steps.filter((step) => step.done).length;
  const total = fabricationWorkflow.length;
  return {
    steps,
    currentStage,
    doneCount,
    total,
    percent: total > 0 ? Math.round((doneCount / total) * 100) : 0,
  };
};
