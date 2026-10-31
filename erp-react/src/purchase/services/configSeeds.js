/**
 * purchase/services/configSeeds.js
 * ------------------------------------------------------------------
 * Settings seed builders for the configurable engines (approval rules,
 * budget control, three-way matching). Kept in their own module so
 * services/settings.js and the engines can share ONE source of seed
 * data without creating circular imports (the engines import settings,
 * so settings must not import the engines).
 * ------------------------------------------------------------------ */
import { approvalRuleSeed } from './approvalEngine';

export { approvalRuleSeed };

/** Default Budget Control configuration. */
export function budgetControlSeed() {
  return {
    enabled: true,
    blockApprovalWhenExceeded: true,
    allowExceptionWorkflow: false,
    fiscalYear: String(new Date().getFullYear()),
    budgets: [
      { id: 'budget-1', department: 'Production', project: '', costCenter: '', fiscalYear: '2026', amount: 25000000, active: true },
      { id: 'budget-2', department: 'Projects', project: '', costCenter: '', fiscalYear: '2026', amount: 18000000, active: true },
      { id: 'budget-3', department: 'Maintenance', project: '', costCenter: '', fiscalYear: '2026', amount: 8000000, active: true },
      { id: 'budget-4', department: 'IT', project: '', costCenter: '', fiscalYear: '2026', amount: 6000000, active: true },
      { id: 'budget-5', department: 'Purchase', project: '', costCenter: '', fiscalYear: '2026', amount: 5000000, active: true },
      { id: 'budget-6', department: '', project: '', costCenter: '', fiscalYear: '2026', amount: 12000000, active: true }
    ]
  };
}

/** Default 3-Way Matching configuration. */
export function matchingConfigSeed() {
  return {
    enabled: true,
    requireMatchToApprove: true,
    allowOverride: true,
    tolerances: {
      quantityPct: 0,
      ratePct: 0,
      taxPct: 0,
      valuePct: 2
    }
  };
}