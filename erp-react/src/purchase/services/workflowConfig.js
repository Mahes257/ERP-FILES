/**
 * purchase/services/workflowConfig.js
 * ------------------------------------------------------------------
 * Config-aware status transition validation.
 *
 * The canonical transition matrix in constants (PO_STAGE_TRANSITIONS)
 * remains the built-in default, but the Settings → Workflow section can
 * redefine each document's stages and their allowed transitions. This
 * module is the single entry point the service layer and UI use so that
 * a workflow edited in Settings actually changes which transitions are
 * permitted — the fallback keeps unconfigured documents behaving exactly
 * as the canonical matrix describes.
 * ------------------------------------------------------------------ */
import { PO_STAGE_TRANSITIONS } from '../constants';
import { getWorkflowConfig } from './settings';

/**
 * Whether a PO may move from stage `from` to stage `to`.
 *
 * When Settings → Workflow defines a PO workflow, the configured stage's
 * `allowedTransitions` list governs (matching by stage key or display
 * name on both the current stage and the target). Without a configured
 * workflow — or when the current stage is not configured — the canonical
 * PO_STAGE_TRANSITIONS matrix is the authority.
 */
export function isValidPOTransition(from, to) {
  const stages = getWorkflowConfig('PO');
  if (!Array.isArray(stages) || stages.length === 0) {
    return (PO_STAGE_TRANSITIONS[from] || []).includes(to);
  }
  const stage = stages.find(
    (s) => s.enabled !== false && (s.stage === from || s.displayName === from)
  );
  if (!stage) {
    return (PO_STAGE_TRANSITIONS[from] || []).includes(to);
  }
  const allowed = (stage.allowedTransitions || []).map((t) => String(t).trim());
  if (allowed.includes(String(to).trim())) return true;
  /* Also accept a target configured by its stage key (not just name). */
  const toStage = stages.find((s) => s.displayName === to || s.stage === to);
  return toStage ? allowed.includes(String(toStage.stage).trim()) : false;
}

/** Forward conversions (excludes Cancelled) honouring the configured workflow. */
export function getForwardPOConversions(status) {
  return PO_STAGE_TRANSITIONS[status] || [];
}