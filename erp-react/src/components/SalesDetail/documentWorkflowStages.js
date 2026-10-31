/**
 * Sales Contract document workflow stages (ERP SC document pipeline):
 * Draft → Correction → VST Sign → Final Document.
 *
 * Kept in a separate module so the DocumentWorkflow component file stays
 * component-only (react-refresh rule) and both the view page and any other
 * consumer can import the exact stage set.
 */
export const SALES_CONTRACT_WORKFLOW_STAGES = [
  { label: 'Draft', dateLabel: 'Draft Date', awaiting: 'No draft document uploaded yet' },
  { label: 'Correction', dateLabel: 'Correction Date', awaiting: 'No correction document yet' },
  { label: 'VST Sign', dateLabel: 'VST Sign Date', awaiting: 'No VST signed document yet' },
  { label: 'Final Document', dateLabel: 'Final Document Date', awaiting: 'No final document yet' }
];

export const SALES_CONTRACT_WORKFLOW_ACTIONS = ['Correct', 'Sign', 'Finalize'];
