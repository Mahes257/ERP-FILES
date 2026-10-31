// ============================================================
// Quality / QC — vocabulary + dummy inspection dataset.
// Generic, flexible inspection records connected to Production
// Orders and departments. No industry-specific inspection standard
// is claimed.
//
// The list below serves as seed data when localStorage has no
// existing quality records. Once the user creates/edits/deletes
// inspections, the persisted dataset in localStorage takes over
// and this seed is never re-applied.
// ============================================================

export const INSPECTION_TYPES = ['Incoming', 'In-Process', 'Final'];

export const QUALITY_STATUSES = ['Pending', 'In Progress', 'Passed', 'Failed', 'Hold'];

// Generic checklist template — not a mandatory industry standard.
export const CHECKLIST_TEMPLATE = [
  { name: 'Visual Inspection' },
  { name: 'Dimensional Check' },
  { name: 'Surface Condition' },
  { name: 'Workmanship' },
  { name: 'Final Verification' },
];

/** Seed a checklist with N/A results (used for new inspections). */
export const emptyChecklist = () =>
  CHECKLIST_TEMPLATE.map((item) => ({ name: item.name, result: 'N/A', remarks: '' }));

