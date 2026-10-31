// ============================================================
// Assembly shop floor — process workflow (roadmap) + empty list.
// Process: Technical Verification → Pending → Assembly → Quality →
// Packing → Dispatch.
//
// This list is the Assembly module's SINGLE stage definition: the Assembly
// board uses it for its Stage dropdown and inline Stage editing, and
// data/entries.js reuses it for the Assembly Work Order workflow — so the
// Assembly stage vocabulary is never duplicated.
//
// Technical Verification is the FIRST stage here, exactly as it is for
// Casting/Fabrication. The Work Order's approval + Technical Verification
// gates stay in the workflow as well; the journey/preview renderers detect the
// stage and do not print the gate a second time.
//
// Assembly jobs are USER-ENTRY-ONLY: the board starts empty and every job is
// created by the user through the UI. Records are persisted in the Production
// Entries API by useShopFloorJobs — nothing is seeded here.
// ============================================================

export const assemblyWorkflow = [
  'Technical Verification',
  'Pending',
  'Assembly',
  'Quality',
  'Packing',
  'Dispatch',
];

export const assemblyJobs = [];

/** An entry no longer blocks the workflow. */
export const assemblyEntryDone = (entry) =>
  Boolean(entry) && (entry.status === 'Completed' || entry.status === 'Skipped');

/**
 * Stage state derived ONLY from the saved Assembly stage entries of one Work
 * Order — the single source the Assembly list, the View page and the stage
 * strip share, so they can never disagree.
 *
 * - `done`    : the stage has a stored entry whose status is Completed/Skipped
 *               (never inferred from the stage order or from an approval, and
 *               never from a value merely selected in a dropdown)
 * - `current` : the stage the Work Order is actually sitting on — an
 *               In Progress entry, otherwise the highest recorded stage,
 *               exactly like the list's Stage column
 * - legacy stages (e.g. 'Sub-Assembly', 'Final Assembly' — the free-text
 *   "Assembly Task" older rows stored in the stage column) are ignored for the
 *   six-step progress but stay visible in the entry history untouched
 *
 * @param {Array} entries Assembly stage entries of ONE Work Order
 */
export const assemblyStageProgress = (entries = []) => {
  const byStage = new Map();
  (entries || []).forEach((entry) => {
    if (!entry?.stage || !assemblyWorkflow.includes(entry.stage)) return;
    byStage.set(entry.stage, entry);
  });

  const active = (entries || []).find(
    (entry) => entry?.status === 'In Progress' && assemblyWorkflow.includes(entry.stage)
  );
  const recorded = assemblyWorkflow.filter((stage) => byStage.has(stage));
  const currentStage = active?.stage || recorded[recorded.length - 1] || '';

  const steps = assemblyWorkflow.map((stage) => {
    const entry = byStage.get(stage) || null;
    return {
      stage,
      entry,
      status: entry?.status || 'Pending',
      done: assemblyEntryDone(entry),
      current: stage === currentStage,
    };
  });

  const doneCount = steps.filter((step) => step.done).length;
  const total = assemblyWorkflow.length;
  return {
    steps,
    currentStage,
    doneCount,
    total,
    percent: total > 0 ? Math.round((doneCount / total) * 100) : 0,
  };
};
