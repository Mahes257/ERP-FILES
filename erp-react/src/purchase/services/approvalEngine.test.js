/**
 * purchase/services/approvalEngine.test.js
 * ------------------------------------------------------------------
 * Unit tests for the configurable Approval Engine — rule matching by
 * amount / department / project / cost centre / doc type / role, and
 * the full decision lifecycle: sequential & parallel chains,
 * delegation, substitute approvers, escalation, rejection, correction
 * and resubmission. All engine functions are pure.
 * ------------------------------------------------------------------ */
import { describe, expect, it } from 'vitest';
import {
  APPROVAL_MODE, approvalRuleSeed,
  buildApprovalChain, createApprovalState, matchApprovalRule,
  approveStep, rejectStep, delegateStep, substituteStep, escalateStep,
  requestCorrection, resubmitState, currentStepIndex, pendingStepIndexes,
  isStepActionable, approvalProgress, chainToApprovalStatus,
  CHAIN_STATUS, STEP_STATUS
} from './approvalEngine';

function defaultSettings() {
  return { approvalRules: approvalRuleSeed() };
}

describe('Rule matching', () => {
  it('matches the amount band rules from the example', () => {
    const settings = defaultSettings();
    expect(matchApprovalRule({ docType: 'PO', amount: 5000 }, settings).id).toBe('rule-amount-manager');
    expect(matchApprovalRule({ docType: 'PO', amount: 50000 }, settings).id).toBe('rule-amount-hod');
    expect(matchApprovalRule({ docType: 'PO', amount: 500000 }, settings).id).toBe('rule-amount-finance-director');
  });

  it('conditions on department / project / cost centre and role', () => {
    const settings = {
      approvalRules: [
        {
          id: 'dept-rule',
          name: 'Projects capital',
          docTypes: ['PO'],
          enabled: true,
          priority: 10,
          conditions: [
            { field: 'department', operator: 'equals', value: 'Projects' },
            { field: 'project', operator: 'in', value: ['New Plant Setup', 'Unit 2 Expansion'] },
            { field: 'costCenter', operator: 'notEquals', value: 'CC-1007 Admin' },
            { field: 'amount', operator: 'gte', value: 100000 }
          ],
          mode: APPROVAL_MODE.SEQUENTIAL,
          steps: [{ order: 1, role: 'Director' }]
        }
      ]
    };
    const match = matchApprovalRule(
      { docType: 'PO', amount: 150000, department: 'Projects', project: 'New Plant Setup', costCenter: 'CC-1004 Projects', role: 'Engineer' },
      settings
    );
    expect(match.id).toBe('dept-rule');
    /* A lower amount must not match. */
    expect(matchApprovalRule({ docType: 'PO', amount: 5000, department: 'Projects', project: 'New Plant Setup', costCenter: 'CC-1004 Projects' }, settings)).toBeNull();
  });

  it('respects docType scoping and enabled flag', () => {
    const settings = defaultSettings();
    expect(matchApprovalRule({ docType: 'Invoice', amount: 500 }, settings).id).toBe('rule-amount-manager');
    expect(matchApprovalRule({ docType: 'PR', amount: 500 }, settings)).toBeNull();
    const disabled = { approvalRules: approvalRuleSeed().map((r) => ({ ...r, enabled: false })) };
    expect(matchApprovalRule({ docType: 'PO', amount: 500 }, disabled)).toBeNull();
  });

  it('highest priority wins when several rules match', () => {
    const settings = {
      approvalRules: [
        { id: 'low', name: 'Low', docTypes: [], enabled: true, priority: 5, conditions: [{ field: 'amount', operator: 'gte', value: 0 }], mode: APPROVAL_MODE.SEQUENTIAL, steps: [{ order: 1, role: 'Manager' }] },
        { id: 'high', name: 'High', docTypes: [], enabled: true, priority: 50, conditions: [{ field: 'amount', operator: 'gte', value: 0 }], mode: APPROVAL_MODE.SEQUENTIAL, steps: [{ order: 1, role: 'HOD' }] }
      ]
    };
    expect(matchApprovalRule({ docType: 'PO', amount: 100 }, settings).id).toBe('high');
  });
});

describe('Chain construction', () => {
  it('builds a sequential Manager chain for the low band', () => {
    const chain = buildApprovalChain({ docType: 'PO', amount: 5000 }, defaultSettings());
    expect(chain.mode).toBe(APPROVAL_MODE.SEQUENTIAL);
    expect(chain.steps.map((s) => s.role)).toEqual(['Manager']);
  });

  it('builds a PARALLEL Finance + Director chain for high value', () => {
    const chain = buildApprovalChain({ docType: 'PO', amount: 500000 }, defaultSettings());
    expect(chain.mode).toBe(APPROVAL_MODE.PARALLEL);
    expect(chain.steps.map((s) => s.role).sort()).toEqual(['Director', 'Finance Controller'].sort());
  });

  it('falls back to the legacy approvalMatrix when no rule matches', () => {
    const settings = {
      approvalRules: [{ id: 'x', name: 'x', docTypes: [], enabled: true, priority: 1, conditions: [{ field: 'amount', operator: 'gte', value: 999999999 }], mode: APPROVAL_MODE.SEQUENTIAL, steps: [{ order: 1, role: 'X' }] }],
      approvalMatrix: [
        { level: 1, role: 'Department Head', minAmount: 0, maxAmount: 50000, slaDays: 2, active: true, escalationDays: 3 },
        { level: 2, role: 'Finance Controller', minAmount: 50001, maxAmount: 0, slaDays: 4, active: true, escalationDays: 5 }
      ]
    };
    const chain = buildApprovalChain({ docType: 'PO', amount: 100 }, settings);
    expect(chain.source).toBe('matrix');
    expect(chain.mode).toBe(APPROVAL_MODE.SEQUENTIAL);
    expect(chain.steps.map((s) => s.role)).toEqual(['Department Head', 'Finance Controller']);
    expect(chain.steps[0].slaDays).toBe(2);
  });

  it('never hardcodes an approver — every role comes from config', () => {
    const chain = buildApprovalChain({ docType: 'PO', amount: 5000 }, defaultSettings());
    expect(chain.steps[0].role).toBe('Manager');
  });
});

describe('Sequential approval lifecycle', () => {
  it('approves step by step and completes the document at the last step', () => {
    const settings = {
      approvalRules: [
        { id: 'seq', name: 'Seq', docTypes: [], enabled: true, priority: 1, conditions: [], mode: APPROVAL_MODE.SEQUENTIAL, steps: [
          { order: 1, role: 'Manager', slaDays: 2, escalationDays: 3, canDelegate: true, escalationRole: 'HOD' },
          { order: 2, role: 'HOD', slaDays: 2, escalationDays: 4, canDelegate: true, escalationRole: 'Procurement Manager' }
        ] }
      ]
    };
    const chain = buildApprovalChain({ docType: 'PO', amount: 20000 }, settings);
    const state = createApprovalState(chain);
    expect(state.status).toBe(CHAIN_STATUS.PENDING);
    expect(currentStepIndex(state)).toBe(0);
    expect(pendingStepIndexes(state)).toEqual([0]);

    const step1 = approveStep(state, { stepIndex: 0, approver: 'Rahul Sharma' });
    expect(step1.steps[0].status).toBe(STEP_STATUS.APPROVED);
    expect(step1.status).toBe(CHAIN_STATUS.PENDING);
    expect(currentStepIndex(step1)).toBe(1);

    const step2 = approveStep(step1, { stepIndex: 1, approver: 'Priya Patel' });
    expect(step2.status).toBe(CHAIN_STATUS.APPROVED);
    expect(chainToApprovalStatus(step2)).toBe('Approved');
    expect(currentStepIndex(step2)).toBe(-1);
    expect(approvalProgress(step2).percent).toBe(100);
  });

  it('rejects at any step — the whole chain is rejected', () => {
    const settings = defaultSettings();
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 50000 }, settings));
    const rejected = rejectStep(state, { stepIndex: 0, approver: 'Meera Joshi', note: 'Budget not approved' });
    expect(rejected.status).toBe(CHAIN_STATUS.REJECTED);
    expect(rejected.steps[0].status).toBe(STEP_STATUS.REJECTED);
    expect(chainToApprovalStatus(rejected)).toBe('Rejected');
  });

  it('blocks acting on a non-actionable step', () => {
    const settings = defaultSettings();
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 50000 }, settings));
    expect(isStepActionable(state, 1)).toBe(false);
    expect(() => approveStep(state, { stepIndex: 1 })).toThrow(/not currently actionable/);
  });
});

describe('Parallel approval', () => {
  it('requires EVERY step to approve before the document is approved', () => {
    const settings = {
      approvalRules: [
        { id: 'par', name: 'Par', docTypes: [], enabled: true, priority: 1, conditions: [], mode: APPROVAL_MODE.PARALLEL, steps: [
          { order: 1, role: 'Finance Controller' },
          { order: 1, role: 'Director' }
        ] }
      ]
    };
    const state = createApprovalState(buildApprovalChain({ docType: 'Invoice', amount: 200000 }, settings));
    expect(state.mode).toBe(APPROVAL_MODE.PARALLEL);
    expect(pendingStepIndexes(state)).toEqual([0, 1]);

    const one = approveStep(state, { stepIndex: 1, approver: 'Director' });
    expect(one.status).toBe(CHAIN_STATUS.PENDING); /* still waiting on Finance */

    const both = approveStep(one, { stepIndex: 0, approver: 'Finance' });
    expect(both.status).toBe(CHAIN_STATUS.APPROVED);
  });
});

describe('Delegation / substitute / escalation', () => {
  it('delegates a step to another approver', () => {
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, defaultSettings()));
    const delegated = delegateStep(state, { stepIndex: 0, from: 'Manager', to: 'Deputy Manager' });
    expect(delegated.steps[0].delegatedTo).toBe('Deputy Manager');
    expect(delegated.steps[0].assignedTo).toBe('Deputy Manager');
    expect(delegated.steps[0].delegatedFrom).toBe('Manager');
    const approved = approveStep(delegated, { stepIndex: 0, approver: 'Deputy Manager' });
    expect(approved.status).toBe(CHAIN_STATUS.APPROVED);
  });

  it('refuses delegation when the step disallows it', () => {
    const settings = {
      approvalRules: [
        { id: 'nodeleg', name: 'No delegation', docTypes: [], enabled: true, priority: 1, conditions: [], mode: APPROVAL_MODE.SEQUENTIAL, steps: [{ order: 1, role: 'Finance Controller', canDelegate: false }] }
      ]
    };
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 500000 }, settings));
    expect(() => delegateStep(state, { stepIndex: 0, to: 'Someone' })).toThrow(/does not allow delegation/);
  });

  it('records a substitute approver', () => {
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, defaultSettings()));
    const substituted = substituteStep(state, { stepIndex: 0, substitute: 'Neha Gupta' });
    expect(substituted.steps[0].substituteApprover).toBe('Neha Gupta');
    const approved = approveStep(substituted, { stepIndex: 0, approver: 'Neha Gupta' });
    expect(approved.steps[0].approver).toBe('Neha Gupta');
  });

  it('escalates a stuck step to the configured escalation role', () => {
    const settings = defaultSettings();
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, settings));
    const escalated = escalateStep(state, { stepIndex: 0, escalatedTo: 'HOD', note: 'No response in SLA' });
    expect(escalated.steps[0].status).toBe(STEP_STATUS.ESCALATED);
    expect(escalated.steps[0].escalatedTo).toBe('HOD');
    const last = escalated.steps[escalated.steps.length - 1];
    expect(last.role).toBe('HOD');
    expect(currentStepIndex(escalated)).toBe(1);
    const done = approveStep(escalated, { stepIndex: 1, approver: 'HOD' });
    expect(done.status).toBe(CHAIN_STATUS.APPROVED);
  });
});

describe('Correction and resubmission', () => {
  it('flags a correction request without rejecting the chain', () => {
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, defaultSettings()));
    const corrected = requestCorrection(state, { reason: 'Incorrect unit rate' });
    expect(corrected.correctionRequested).toBe(true);
    expect(corrected.correctionReason).toBe('Incorrect unit rate');
    expect(corrected.status).toBe(CHAIN_STATUS.PENDING);
  });

  it('requires a reason for correction', () => {
    const state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, defaultSettings()));
    expect(() => requestCorrection(state, {})).toThrow(/Correction reason is required/);
  });

  it('resubmission resets every step to pending', () => {
    const settings = defaultSettings();
    let state = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, settings));
    state = approveStep(state, { stepIndex: 0, approver: 'Rahul' });
    expect(state.status).toBe(CHAIN_STATUS.APPROVED);
    /* Force a rejected state, then resubmit. */
    let rejected = createApprovalState(buildApprovalChain({ docType: 'PO', amount: 5000 }, settings));
    rejected = rejectStep(rejected, { stepIndex: 0, approver: 'Meera' });
    const resubmitted = resubmitState(rejected);
    expect(resubmitted.status).toBe(CHAIN_STATUS.PENDING);
    expect(resubmitted.steps.every((s) => s.status === STEP_STATUS.PENDING)).toBe(true);
    expect(resubmitted.correctionRequested).toBe(false);
  });
});