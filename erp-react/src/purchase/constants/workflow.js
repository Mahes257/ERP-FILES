/**
 * purchase/constants/workflow.js
 * ------------------------------------------------------------------
 * THE ONE canonical Purchase / RFQ workflow definition.
 *
 * Every stage list, stepper, pipeline and page in the Purchase module
 * MUST derive its ordering from `PURCHASE_WORKFLOW` below — there is
 * exactly ONE source of truth for stage ordering. Never define a
 * parallel stage array anywhere else.
 *
 *   RFQ → FOLLOW_UP → QUOTATIONS → COMPARISON → NEGOTIATION →
 *   TECHNICAL_EVALUATION → COMMERCIAL_EVALUATION →
 *   SUPPLIER_SELECTION → PURCHASE_ORDER → PO_APPROVAL → PO_RELEASED →
 *   SUPPLIER_ACKNOWLEDGEMENT → CLOSED
 *
 * Two distinct concepts travel side by side:
 *
 *   • RFQ `status`       — the DOCUMENT LIFECYCLE state (Draft /
 *     Pending Approval / Approved / Sent / … / Closed). It is the
 *     persisted, filterable lifecycle field and is never replaced.
 *   • `workflowStage`    — the ACTUAL PROCUREMENT STAGE the record is
 *     currently working in (one of the keys below). Persisted on the
 *     RFQ record wherever the data model supports it; derived from
 *     `status` + evaluation progress when absent (see
 *     deriveWorkflowStage).
 *
 * Helpers (getWorkflowStage / canEnterStage / canCompleteStage /
 * getNextStage / getPreviousStage) are the ONLY way pages and services
 * reason about stage ordering.
 * ------------------------------------------------------------------
 */
import { RFQ_STATUS } from './rfq';

/** Canonical stage order — the single source of truth. */
export const PURCHASE_WORKFLOW = [
  { key: 'RFQ', label: 'RFQ' },
  { key: 'FOLLOW_UP', label: 'Follow-up' },
  { key: 'QUOTATIONS', label: 'Quotations' },
  { key: 'COMPARISON', label: 'Comparison' },
  { key: 'NEGOTIATION', label: 'Negotiation' },
  { key: 'TECHNICAL_EVALUATION', label: 'Technical Evaluation' },
  { key: 'COMMERCIAL_EVALUATION', label: 'Commercial Evaluation' },
  { key: 'SUPPLIER_SELECTION', label: 'Supplier Selection' },
  { key: 'PURCHASE_ORDER', label: 'Purchase Order' },
  { key: 'PO_APPROVAL', label: 'PO Approval' },
  { key: 'PO_RELEASED', label: 'PO Released' },
  { key: 'SUPPLIER_ACKNOWLEDGEMENT', label: 'Supplier Acknowledgement' },
  { key: 'CLOSED', label: 'Closed' }
];

/** Stage keys in canonical order (lightweight form of the above). */
export const PURCHASE_WORKFLOW_STAGES = PURCHASE_WORKFLOW.map((stage) => stage.key);

/** stage key → definition lookup. */
export const WORKFLOW_BY_STAGE = Object.fromEntries(
  PURCHASE_WORKFLOW.map((stage) => [stage.key, stage])
);

/** stage key → canonical label lookup. */
export const WORKFLOW_LABEL = Object.fromEntries(
  PURCHASE_WORKFLOW.map((stage) => [stage.key, stage.label])
);

/**
 * The sourcing / evaluation pages (comparison, negotiation,
 * technical / commercial evaluation, supplier selection)
 * render the stepper over THIS subset — the procurement stages before
 * the PO lifecycle. It is DERIVED from PURCHASE_WORKFLOW, so the
 * ordering always matches the canonical workflow; it is not a second
 * definition.
 */
export const EVALUATION_STAGES = PURCHASE_WORKFLOW.filter((stage) =>
  [
    'RFQ', 'FOLLOW_UP', 'QUOTATIONS', 'COMPARISON', 'NEGOTIATION',
    'TECHNICAL_EVALUATION', 'COMMERCIAL_EVALUATION',
    'SUPPLIER_SELECTION', 'PURCHASE_ORDER'
  ].includes(stage.key)
);

/** Short display labels for the shared sourcing stepper (the CSS
 *  uppercases labels, so these render as TECHNICAL,
 *  COMMERCIAL, SELECTION, PURCHASE ORDER). */
const STEPPER_LABELS = {
  TECHNICAL_EVALUATION: 'Technical',
  COMMERCIAL_EVALUATION: 'Commercial',
  SUPPLIER_SELECTION: 'Selection',
  PURCHASE_ORDER: 'Purchase Order'
};

/** The 10-stage stepper shown on every sourcing page — DERIVED from
 *  EVALUATION_STAGES (itself derived from PURCHASE_WORKFLOW), so the
 *  ordering always matches the ONE canonical workflow. Only the
 *  display labels differ (short forms for the shared pills). */
export const WORKFLOW_STEPPER = EVALUATION_STAGES.map((stage) => ({
  key: stage.key,
  label: STEPPER_LABELS[stage.key] || stage.label
}));

/**
 * Page-scoped stepper steps: stages before `activeStage` are done,
 * `activeStage` is current, everything after is pending. Every page
 * passes its OWN stage so a later stage is never shown as active
 * (e.g. Supplier Selection always highlights SELECTION, never a
 * pending negotiation).
 */
export function stepperStepsFor(activeStage) {
  const index = WORKFLOW_STEPPER.findIndex((step) => step.key === activeStage);
  if (index === -1) return [];
  return WORKFLOW_STEPPER.map((step, i) => ({
    key: step.key,
    label: step.label,
    state: i < index ? 'done' : i === index ? 'current' : 'pending'
  }));
}

/**
 * True when a canonical evaluation stage is complete for a board item.
 * The board item exposes its step state via `item.steps` (followUp /
 * quotations / negotiation / technical / commercial / selection) and
 * the RFQ's document lifecycle via `item.rfqStatus`.
 */
function isStageDone(stageKey, item) {
  const s = item.steps || {};
  switch (stageKey) {
    /* RFQ is a passive stage — the RFQ exists, so it never blocks. */
    case 'RFQ':
      return true;
    /* Follow-up is reached once the RFQ is sent (a follow-up is
       auto-created on send). */
    case 'FOLLOW_UP':
      return Boolean(s.followUp);
    /* Quotations + Comparison are reached once at least one vendor
       quotation is received. */
    case 'QUOTATIONS':
    case 'COMPARISON':
      return Boolean(s.quotations);
    /* Negotiation is completed ONLY when a round actually closed as
       Agreed (the strict workflow gate — Technical Evaluation requires
       it). Recording an opening round is progress, not completion. */
    case 'NEGOTIATION':
      return Boolean(s.negotiationAgreed);
    case 'TECHNICAL_EVALUATION':
      return Boolean(s.technical);
    case 'COMMERCIAL_EVALUATION':
      return Boolean(s.commercial);
    case 'SUPPLIER_SELECTION':
      return Boolean(s.selection);
    /* Purchase Order — complete once the RFQ is awarded (the selection
       must be approved before the award, enforced at the service). */
    case 'PURCHASE_ORDER':
      return item.rfqStatus === RFQ_STATUS.AWARDED;
    default:
      return false;
  }
}

/**
 * Derives the per-step state (done / current / pending) from an
 * evaluation board item. Steps before the first incomplete step are
 * done, that step is current, everything after is pending.
 */
export function evaluationSteps(item) {
  if (!item) return [];
  const firstPending = EVALUATION_STAGES.find((stage) => !isStageDone(stage.key, item));
  const currentIndex = firstPending ? EVALUATION_STAGES.indexOf(firstPending) : EVALUATION_STAGES.length;
  return EVALUATION_STAGES.map((stage, index) => ({
    key: stage.key,
    label: stage.label,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'pending'
  }));
}

/** Index of a stage in the canonical order (-1 when unknown). */
export function stageIndex(stage) {
  return PURCHASE_WORKFLOW_STAGES.indexOf(stage);
}

/**
 * Validates / normalises a stage key — returns the canonical key when
 * the value is a known stage, otherwise null.
 */
export function getWorkflowStage(stage) {
  return WORKFLOW_BY_STAGE[stage] ? stage : null;
}

/** The stage immediately AFTER `stage` (null for the last / unknown). */
export function getNextStage(stage) {
  const index = stageIndex(stage);
  if (index === -1 || index === PURCHASE_WORKFLOW.length - 1) return null;
  return PURCHASE_WORKFLOW[index + 1].key;
}

/** The stage immediately BEFORE `stage` (null for the first / unknown). */
export function getPreviousStage(stage) {
  const index = stageIndex(stage);
  if (index <= 0) return null;
  return PURCHASE_WORKFLOW[index - 1].key;
}

/** True when `stage` comes at or after `current` in the canonical order. */
export function isStageAtOrAfter(stage, current) {
  return stageIndex(stage) >= stageIndex(current);
}

/**
 * May the workflow move INTO `target` given it currently sits at
 * `current`? Forward movement only — a target at the current position
 * (re-entering to keep working it) or any later stage is allowed;
 * jumping backwards is never allowed. An unknown current position
 * means the workflow has not started, so any valid stage is reachable.
 */
export function canEnterStage(current, target) {
  const targetIndex = stageIndex(target);
  if (targetIndex === -1) return false;
  const currentIndex = stageIndex(current);
  if (currentIndex === -1) return true;
  return targetIndex >= currentIndex;
}

/**
 * May `target` be marked complete given the workflow is at `current`?
 * A stage can only be completed once the workflow has reached it (at
 * or after the current position). Completing the current stage is what
 * advances the workflow to the next stage.
 */
export function canCompleteStage(current, target) {
  const targetIndex = stageIndex(target);
  if (targetIndex === -1) return false;
  const currentIndex = stageIndex(current);
  if (currentIndex === -1) return false;
  return targetIndex >= currentIndex;
}

/* ------------------------------------------------------------------ */
/*  RFQ document lifecycle → default procurement stage.                */
/*  These are the DEFAULT positions: a persisted `workflowStage` on    */
/*  the record always wins (the record may have advanced further via   */
/*  evaluation / PO activity). Cancelled is a terminal side-branch     */
/*  with no stage of its own — the record keeps whatever stage it had. */
/* ------------------------------------------------------------------ */
export const RFQ_STATUS_STAGE = {
  Draft: 'RFQ',
  'Pending Approval': 'RFQ',
  Approved: 'RFQ',
  Sent: 'FOLLOW_UP',
  'Quotation Received': 'QUOTATIONS',
  Evaluation: 'COMPARISON',
  /* Approval Flow (NFA) stages — reached after the supplier selection;
     the award (PURCHASE_ORDER) follows the approval. Only a fallback:
     a persisted workflowStage always wins. */
  '1st Approval': 'SUPPLIER_SELECTION',
  '2nd Approval': 'SUPPLIER_SELECTION',
  'Final Approval': 'SUPPLIER_SELECTION',
  Awarded: 'PURCHASE_ORDER',
  Closed: 'CLOSED'
};

/**
 * Resolves the current procurement stage for an RFQ record. A
 * persisted `workflowStage` wins (it is the source of truth once the
 * workflow has advanced); otherwise the stage is derived from the
 * document lifecycle `status`. Unknown / not-started records fall back
 * to the first stage (RFQ).
 */
export function deriveWorkflowStage(rfq) {
  if (rfq?.workflowStage && WORKFLOW_BY_STAGE[rfq.workflowStage]) {
    return rfq.workflowStage;
  }
  return RFQ_STATUS_STAGE[rfq?.status] || 'RFQ';
}

export default {
  PURCHASE_WORKFLOW,
  PURCHASE_WORKFLOW_STAGES,
  WORKFLOW_BY_STAGE,
  WORKFLOW_LABEL,
  EVALUATION_STAGES,
  WORKFLOW_STEPPER,
  stepperStepsFor,
  RFQ_STATUS_STAGE,
  stageIndex,
  getWorkflowStage,
  getNextStage,
  getPreviousStage,
  isStageAtOrAfter,
  canEnterStage,
  canCompleteStage,
  deriveWorkflowStage
};
