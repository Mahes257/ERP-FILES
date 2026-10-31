// ============================================================
// Casting shop floor — process workflow (roadmap) + empty job list.
// Process: Technical Verification → Shell Preparation → Pouring →
// Blasting → Fettling.
//
// This list is the Casting module's SINGLE stage definition: the
// Casting board uses it for its stage tabs and for the Stage dropdown,
// and data/entries.js reuses it for the Casting Work Order workflow —
// so the casting stage vocabulary is never duplicated.
//
// Casting jobs are USER-ENTRY-ONLY: the board starts empty and every
// job is created by the user through the UI. Records are persisted in
// the Production Entries API by useShopFloorJobs — nothing is seeded
// here.
// ============================================================

export const castingWorkflow = [
  'Technical Verification',
  'Shell Preparation',
  'Pouring',
  'Blasting',
  'Fettling',
];

export const castingJobs = [];

/** An entry no longer blocks the workflow. */
export const castingEntryDone = (entry) =>
  Boolean(entry) && (entry.status === 'Completed' || entry.status === 'Skipped');

/**
 * Stage state derived ONLY from the saved Casting stage entries of one Work
 * Order — the single source the Casting list, the View page and the stage
 * strip share, so they can never disagree.
 *
 * - `done`    : the stage has a stored entry whose status is Completed/Skipped
 *               (never inferred from the stage order or from an approval)
 * - `current` : the stage the Work Order is actually sitting on — an
 *               In Progress entry, otherwise the highest recorded stage,
 *               exactly like the list's Stage column
 * - legacy stages (e.g. 'QC', 'Melting') are ignored for the five-step
 *   progress but stay visible in the entry history untouched
 *
 * @param {Array} entries Casting stage entries of ONE Work Order
 */
export const castingStageProgress = (entries = []) => {
  const byStage = new Map();
  (entries || []).forEach((entry) => {
    if (!entry?.stage || !castingWorkflow.includes(entry.stage)) return;
    byStage.set(entry.stage, entry);
  });

  const active = (entries || []).find(
    (entry) => entry?.status === 'In Progress' && castingWorkflow.includes(entry.stage)
  );
  const recorded = castingWorkflow.filter((stage) => byStage.has(stage));
  const currentStage = active?.stage || recorded[recorded.length - 1] || '';

  const steps = castingWorkflow.map((stage) => {
    const entry = byStage.get(stage) || null;
    return {
      stage,
      entry,
      status: entry?.status || 'Pending',
      done: castingEntryDone(entry),
      current: stage === currentStage,
    };
  });

  const doneCount = steps.filter((step) => step.done).length;
  const total = castingWorkflow.length;
  return {
    steps,
    currentStage,
    doneCount,
    total,
    percent: total > 0 ? Math.round((doneCount / total) * 100) : 0,
  };
};
