/**
 * purchase/services/approvalEngine.js
 * ------------------------------------------------------------------
 * Configurable Approval Engine — replaces the fixed amount-only
 * approval matrix with rule-driven approval chains.
 *
 * Rules are configured in Settings (settings.approvalRules) and may
 * condition on ANY of:
 *   · amount       — document value (PO / invoice total)
 *   · department   — requesting department
 *   · project      — project code/name
 *   · costCenter   — cost centre
 *   · docType      — document type (PR / PO / Invoice / NFA …)
 *   · role         — requester / actor role
 *
 * A rule defines an ordered set of approval STEPS, each carrying the
 * approver ROLE plus SLA / escalation / delegation settings. The
 * engine supports:
 *   · Sequential approval — steps approve one after another
 *   · Parallel approval   — all steps approve independently
 *   · Delegation          — an approver hands their step to another
 *   · Substitute approver — a substitute acts in place of the step
 *   · Escalation          — a stuck step escalates to a higher role
 *   · Rejection           — any step can reject the document
 *   · Correction          — approver asks for corrections (document
 *                           stays in the queue, flagged)
 *   · Resubmission        — a rejected document is re-entered and the
 *                           chain restarts
 *
 * When no enabled rule matches the document context, the engine falls
 * back to the legacy approvalMatrix levels (sequential chain) so
 * existing configurations keep working. Approvers are NEVER hardcoded
 * here — every role comes from the configured rules / matrix.
 *
 * All functions in this module are PURE (no storage access) so they
 * are trivially testable; document services persist the returned
 * state on their records.
 * ------------------------------------------------------------------ */
import { APPROVAL_STATUS } from '../constants';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

export const APPROVAL_MODE = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel'
};

/** Fields a rule condition may test. */
export const APPROVAL_RULE_FIELDS = [
  'amount',
  'department',
  'project',
  'costCenter',
  'docType',
  'role'
];

/** Condition operators supported by the rule engine. */
export const APPROVAL_CONDITION_OPERATORS = [
  'equals',
  'notEquals',
  'in',
  'notIn',
  'gte',
  'lte',
  'between'
];

/** Per-step statuses. */
export const STEP_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  ESCALATED: 'Escalated',
  CORRECTION_REQUESTED: 'Correction Requested'
};

/** Overall chain statuses. */
export const CHAIN_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
};

function nowIso() {
  return new Date().toISOString();
}

/* ------------------------------------------------------------------ */
/*  Default rules (Settings seed)                                     */
/*  Example: ₹0–10,000 → Manager · ₹10,001–100,000 → HOD ·            */
/*           ₹100,001+ → Finance / Director (parallel)                */
/* ------------------------------------------------------------------ */
export function approvalRuleSeed() {
  return [
    {
      id: 'rule-amount-manager',
      name: 'Low value — Manager',
      docTypes: ['PO', 'Invoice'],
      enabled: true,
      priority: 100,
      conditions: [{ field: 'amount', operator: 'between', value: [0, 10000] }],
      mode: APPROVAL_MODE.SEQUENTIAL,
      steps: [
        { order: 1, role: 'Manager', slaDays: 2, escalationDays: 3, canDelegate: true, substituteRole: '', escalationRole: 'HOD' }
      ],
      allowException: true
    },
    {
      id: 'rule-amount-hod',
      name: 'Medium value — HOD',
      docTypes: ['PO', 'Invoice'],
      enabled: true,
      priority: 90,
      conditions: [{ field: 'amount', operator: 'between', value: [10001, 100000] }],
      mode: APPROVAL_MODE.SEQUENTIAL,
      steps: [
        { order: 1, role: 'HOD', slaDays: 2, escalationDays: 4, canDelegate: true, substituteRole: '', escalationRole: 'Procurement Manager' }
      ],
      allowException: true
    },
    {
      id: 'rule-amount-finance-director',
      name: 'High value — Finance & Director (parallel)',
      docTypes: ['PO', 'Invoice'],
      enabled: true,
      priority: 80,
      conditions: [{ field: 'amount', operator: 'gte', value: 100001 }],
      mode: APPROVAL_MODE.PARALLEL,
      steps: [
        { order: 1, role: 'Finance Controller', slaDays: 3, escalationDays: 5, canDelegate: false, substituteRole: '', escalationRole: 'Managing Director' },
        { order: 1, role: 'Director', slaDays: 3, escalationDays: 5, canDelegate: false, substituteRole: '', escalationRole: 'Managing Director' }
      ],
      allowException: true
    },
    {
      id: 'rule-department-capital',
      name: 'Capital / Project spend — additional Director approval',
      docTypes: ['PO'],
      enabled: true,
      priority: 70,
      conditions: [
        { field: 'department', operator: 'in', value: ['Projects', 'IT', 'Production'] },
        { field: 'amount', operator: 'gte', value: 250000 }
      ],
      mode: APPROVAL_MODE.SEQUENTIAL,
      steps: [
        { order: 1, role: 'HOD', slaDays: 2, escalationDays: 4, canDelegate: true, substituteRole: '', escalationRole: 'Procurement Manager' },
        { order: 2, role: 'Finance Controller', slaDays: 3, escalationDays: 5, canDelegate: false, substituteRole: '', escalationRole: 'Managing Director' },
        { order: 3, role: 'Director', slaDays: 3, escalationDays: 6, canDelegate: false, substituteRole: '', escalationRole: 'Managing Director' }
      ],
      allowException: true
    }
  ];
}

/* ------------------------------------------------------------------ */
/*  Rule matching                                                     */
/* ------------------------------------------------------------------ */

/** Whether a rule applies to a document type (empty list = all). */
export function ruleAppliesToDocType(rule, docType) {
  const docTypes = Array.isArray(rule.docTypes) ? rule.docTypes : [];
  if (docTypes.length === 0) return true;
  return docTypes.map((d) => String(d).trim().toLowerCase()).includes(String(docType || '').trim().toLowerCase());
}

/** Resolves a condition field from the document context. */
function fieldValue(context, field) {
  if (field === 'amount') return Number(context.amount);
  if (field === 'docType') return String(context.docType || '').trim();
  return String(context[field] || '').trim();
}

/** Evaluates one condition against a context value. */
export function evaluateCondition(condition, context) {
  const actual = fieldValue(context, condition.field);
  const expected = condition.value;
  switch (condition.operator) {
    case 'equals':
      return String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'notEquals':
      return String(actual).toLowerCase() !== String(expected).toLowerCase();
    case 'in':
      return Array.isArray(expected)
        ? expected.some((v) => String(v).toLowerCase() === String(actual).toLowerCase())
        : String(actual).toLowerCase() === String(expected).toLowerCase();
    case 'notIn':
      return Array.isArray(expected)
        ? !expected.some((v) => String(v).toLowerCase() === String(actual).toLowerCase())
        : String(actual).toLowerCase() !== String(expected).toLowerCase();
    case 'gte':
      return Number(actual) >= Number(expected);
    case 'lte':
      return Number(actual) <= Number(expected);
    case 'between': {
      const [min, max] = Array.isArray(expected) ? expected : [0, expected];
      return Number(actual) >= Number(min) && Number(actual) <= Number(max);
    }
    default:
      return false;
  }
}

/** All conditions of a rule must match (AND semantics). */
export function conditionsMatch(conditions = [], context) {
  return (conditions || []).every((condition) => evaluateCondition(condition, context));
}

/**
 * Picks the highest-priority enabled rule that applies to the document
 * type and whose conditions all match the context. Returns null when
 * no rule matches.
 */
export function matchApprovalRule(context, settings = {}) {
  const rules = (settings.approvalRules || []).filter((rule) => rule.enabled !== false);
  const applicable = rules.filter(
    (rule) => ruleAppliesToDocType(rule, context.docType) && conditionsMatch(rule.conditions, context)
  );
  applicable.sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0));
  return applicable[0] || null;
}

/* ------------------------------------------------------------------ */
/*  Chain construction                                                */
/* ------------------------------------------------------------------ */

/**
 * Builds the approval chain (ordered steps) for a document context.
 * Preference order:
 *   1. highest-priority matching approvalRule
 *   2. legacy approvalMatrix levels (sequential fallback)
 *   3. a single default "Approver" step
 */
export function buildApprovalChain(context, settings = {}) {
  const rule = matchApprovalRule(context, settings);
  if (rule) {
    return {
      source: 'rules',
      ruleId: rule.id,
      ruleName: rule.name,
      mode: rule.mode === APPROVAL_MODE.PARALLEL ? APPROVAL_MODE.PARALLEL : APPROVAL_MODE.SEQUENTIAL,
      allowException: rule.allowException !== false,
      steps: (rule.steps || []).map((step, index) => ({
        order: Number(step.order) || index + 1,
        role: String(step.role || '').trim() || 'Approver',
        slaDays: Number(step.slaDays) || 0,
        escalationDays: Number(step.escalationDays) || 0,
        canDelegate: step.canDelegate !== false,
        substituteRole: String(step.substituteRole || '').trim(),
        escalationRole: String(step.escalationRole || '').trim()
      }))
    };
  }

  const matrix = (settings.approvalMatrix || [])
    .filter((row) => row.active)
    .sort((a, b) => (Number(a.level) || 0) - (Number(b.level) || 0));
  if (matrix.length > 0) {
    return {
      source: 'matrix',
      ruleId: null,
      ruleName: 'Approval Matrix',
      mode: APPROVAL_MODE.SEQUENTIAL,
      allowException: true,
      steps: matrix.map((row) => ({
        order: Number(row.level) || 1,
        role: String(row.role || '').trim() || 'Approver',
        slaDays: Number(row.slaDays) || 0,
        escalationDays: Number(row.escalationDays) || 0,
        canDelegate: true,
        substituteRole: '',
        escalationRole: String(row.fallbackApprover || '').trim()
      }))
    };
  }

  return {
    source: 'default',
    ruleId: null,
    ruleName: 'Default Approval',
    mode: APPROVAL_MODE.SEQUENTIAL,
    allowException: true,
    steps: [{ order: 1, role: 'Approver', slaDays: 2, escalationDays: 4, canDelegate: true, substituteRole: '', escalationRole: '' }]
  };
}

/* ------------------------------------------------------------------ */
/*  State                                                             */
/* ------------------------------------------------------------------ */

/**
 * Creates the runtime approval state for a document from a chain.
 * The state is persisted on the document and advanced by the pure
 * helpers below.
 */
export function createApprovalState(chain) {
  return {
    source: chain.source,
    ruleId: chain.ruleId || null,
    ruleName: chain.ruleName || '',
    mode: chain.mode,
    allowException: chain.allowException !== false,
    status: CHAIN_STATUS.PENDING,
    steps: (chain.steps || []).map((step, index) => ({
      ...step,
      index,
      status: STEP_STATUS.PENDING,
      assignedTo: step.role,
      approver: '',
      approvedAt: '',
      decidedAt: '',
      note: '',
      delegatedFrom: '',
      delegatedTo: '',
      substituteApprover: '',
      escalatedTo: ''
    })),
    correctionRequested: false,
    correctionReason: '',
    decidedAt: ''
  };
}

/** First step still awaiting a decision (sequential chains). */
export function currentStepIndex(state) {
  if (!state || !Array.isArray(state.steps)) return -1;
  return state.steps.findIndex((step) => step.status === STEP_STATUS.PENDING);
}

/** Steps currently awaiting a decision (all pending for parallel). */
export function pendingStepIndexes(state) {
  if (!state || !Array.isArray(state.steps)) return [];
  if (state.mode === APPROVAL_MODE.PARALLEL) {
    return state.steps.map((s, i) => (s.status === STEP_STATUS.PENDING ? i : -1)).filter((i) => i !== -1);
  }
  const current = currentStepIndex(state);
  return current === -1 ? [] : [current];
}

/** Whether a step may currently be acted on. */
export function isStepActionable(state, stepIndex) {
  if (!state || state.status !== CHAIN_STATUS.PENDING) return false;
  return pendingStepIndexes(state).includes(stepIndex);
}

/** Overall progress — approved steps / total steps. */
export function approvalProgress(state) {
  const steps = state?.steps || [];
  if (steps.length === 0) return { approved: 0, total: 0, percent: 0, pending: true };
  const approved = steps.filter((s) => s.status === STEP_STATUS.APPROVED || s.status === STEP_STATUS.ESCALATED).length;
  return {
    approved,
    total: steps.length,
    percent: Math.round((approved / steps.length) * 100),
    pending: state.status === CHAIN_STATUS.PENDING
  };
}

/* ------------------------------------------------------------------ */
/*  Decisions (pure — return a new state)                             */
/* ------------------------------------------------------------------ */

function withStep(state, stepIndex, patch) {
  const steps = (state.steps || []).map((step, index) => (index === stepIndex ? { ...step, ...patch } : step));
  /* An ESCALATED step is resolved — its decision moved to the
     escalation role — so it counts as complete once the escalation
     step approves. */
  const resolved = (step) => step.status === STEP_STATUS.APPROVED || step.status === STEP_STATUS.ESCALATED;
  const allApproved = steps.length > 0 && steps.every(resolved);
  return {
    ...state,
    steps,
    status: allApproved ? CHAIN_STATUS.APPROVED : state.status,
    decidedAt: allApproved ? nowIso() : state.decidedAt
  };
}

/**
 * Approves one step. The step must currently be actionable (the single
 * pending step of a sequential chain, or any pending step of a
 * parallel chain). Approving the final step approves the document.
 */
export function approveStep(state, { stepIndex, approver = '', note = '' } = {}) {
  if (!isStepActionable(state, stepIndex)) {
    throw new Error('This approval step is not currently actionable');
  }
  const step = state.steps[stepIndex];
  const actor = String(approver || '').trim() || step.assignedTo || step.role;
  return withStep(state, stepIndex, {
    status: STEP_STATUS.APPROVED,
    approver: actor,
    approvedAt: nowIso(),
    decidedAt: nowIso(),
    note: String(note || '').trim(),
    /* A substitute who approves is recorded as such. */
    substituteApprover: step.substituteApprover || ''
  });
}

/**
 * Rejects the document at a step. Any actionable step may reject —
 * the whole chain is marked Rejected and the decision is recorded on
 * that step.
 */
export function rejectStep(state, { stepIndex, approver = '', note = '' } = {}) {
  if (!isStepActionable(state, stepIndex)) {
    throw new Error('This approval step is not currently actionable');
  }
  const step = state.steps[stepIndex];
  const steps = (state.steps || []).map((s, index) =>
    index === stepIndex
      ? { ...s, status: STEP_STATUS.REJECTED, approver: approver || step.assignedTo || step.role, decidedAt: nowIso(), note: String(note || '').trim() }
      : s
  );
  return { ...state, steps, status: CHAIN_STATUS.REJECTED, decidedAt: nowIso() };
}

/**
 * Delegation — the assigned approver hands the step to another role /
 * person. The step stays pending but its `assignedTo` changes; the
 * original assignment is kept in `delegatedFrom` for the audit trail.
 */
export function delegateStep(state, { stepIndex, from = '', to = '', note = '' } = {}) {
  if (!isStepActionable(state, stepIndex)) {
    throw new Error('This approval step is not currently actionable');
  }
  const step = state.steps[stepIndex];
  if (step.canDelegate === false) {
    throw new Error(`Step ${stepIndex + 1} (${step.role}) does not allow delegation`);
  }
  if (!String(to || '').trim()) {
    throw new Error('A delegate approver is required');
  }
  return withStep(state, stepIndex, {
    assignedTo: String(to).trim(),
    delegatedFrom: String(from || '').trim() || step.assignedTo,
    delegatedTo: String(to).trim(),
    note: String(note || '').trim()
  });
}

/**
 * Substitute approver — records that a substitute will act in place
 * of the assigned approver. The step remains pending and may be
 * approved by the substitute (approveStep records the substitute).
 */
export function substituteStep(state, { stepIndex, substitute = '', note = '' } = {}) {
  if (!isStepActionable(state, stepIndex)) {
    throw new Error('This approval step is not currently actionable');
  }
  if (!String(substitute || '').trim()) {
    throw new Error('A substitute approver is required');
  }
  return withStep(state, stepIndex, {
    substituteApprover: String(substitute).trim(),
    assignedTo: String(substitute).trim(),
    note: String(note || '').trim()
  });
}

/**
 * Escalation — a stuck step escalates to a higher role. The step is
 * marked Escalated and a new pending step for the escalation role is
 * appended (sequential chains) or added to the parallel round, so the
 * document can still complete.
 */
export function escalateStep(state, { stepIndex, escalatedTo = '', note = '' } = {}) {
  if (!isStepActionable(state, stepIndex)) {
    throw new Error('This approval step is not currently actionable');
  }
  const step = state.steps[stepIndex];
  const target = String(escalatedTo || '').trim() || step.escalationRole;
  if (!target) {
    throw new Error('No escalation role is configured for this step');
  }
  const escalated = (state.steps || []).map((s, index) =>
    index === stepIndex
      ? { ...s, status: STEP_STATUS.ESCALATED, escalatedTo: target, decidedAt: nowIso(), note: String(note || '').trim() }
      : s
  );
  const maxOrder = Math.max(...escalated.map((s) => Number(s.order) || 0), 0);
  escalated.push({
    order: maxOrder + 1,
    role: target,
    assignedTo: target,
    status: STEP_STATUS.PENDING,
    approver: '',
    approvedAt: '',
    decidedAt: '',
    note: '',
    delegatedFrom: '',
    delegatedTo: '',
    substituteApprover: '',
    escalatedTo: '',
    slaDays: step.slaDays,
    escalationDays: step.escalationDays,
    canDelegate: false,
    substituteRole: '',
    escalationRole: ''
  });
  /* Re-index after the insert. */
  const reindexed = escalated.map((s, index) => ({ ...s, index }));
  const allApproved = reindexed.length > 0 && reindexed.every((s) => s.status === STEP_STATUS.APPROVED);
  return {
    ...state,
    steps: reindexed,
    status: allApproved ? CHAIN_STATUS.APPROVED : state.status,
    decidedAt: allApproved ? nowIso() : state.decidedAt
  };
}

/**
 * Correction — the approver asks the requester to correct the
 * document. The chain stays Pending but is flagged; the document
 * remains editable and can be resubmitted by the requester.
 */
export function requestCorrection(state, { reason = '' } = {}) {
  if (!reason || !String(reason).trim()) {
    throw new Error('Correction reason is required');
  }
  return {
    ...state,
    correctionRequested: true,
    correctionReason: String(reason).trim()
  };
}

/**
 * Resubmission — a rejected (or corrected) document re-enters the
 * queue. All steps reset to Pending and the chain status returns to
 * Pending; the previous decisions remain in the audit trail.
 */
export function resubmitState(state) {
  if (state.status !== CHAIN_STATUS.REJECTED && state.status !== CHAIN_STATUS.PENDING) {
    throw new Error('Only rejected or pending approvals can be resubmitted');
  }
  return {
    ...state,
    status: CHAIN_STATUS.PENDING,
    correctionRequested: false,
    correctionReason: '',
    decidedAt: '',
    steps: (state.steps || []).map((step, index) => ({
      ...step,
      index,
      status: STEP_STATUS.PENDING,
      approver: '',
      approvedAt: '',
      decidedAt: '',
      note: '',
      delegatedFrom: '',
      delegatedTo: '',
      substituteApprover: '',
      escalatedTo: ''
    }))
  };
}

/* ------------------------------------------------------------------ */
/*  Convenience — overall approval status for the document record      */
/* ------------------------------------------------------------------ */

/** Maps a chain status to the legacy APPROVAL_STATUS bucket. */
export function chainToApprovalStatus(state) {
  if (!state) return APPROVAL_STATUS.PENDING;
  if (state.status === CHAIN_STATUS.APPROVED) return APPROVAL_STATUS.APPROVED;
  if (state.status === CHAIN_STATUS.REJECTED) return APPROVAL_STATUS.REJECTED;
  return APPROVAL_STATUS.PENDING;
}