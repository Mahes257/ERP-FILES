/**
 * purchase/services/budgetControl.test.js
 * ------------------------------------------------------------------
 * Tests for Purchase Budget Control:
 *   · utilisation (Budget / Committed PO / Actual Invoice / Paid /
 *     Available) is computed LIVE from real PO + invoice records
 *   · validation on PO create / submit / approve reports the exact
 *     shortage
 *   · approval is prevented when configured to block
 *   · an exception workflow is allowed when configured
 * Budget figures always come from settings — never hardcoded.
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_STATUS } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore, inspectionsStore, shipmentsStore } from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { settingsService, settingsStore } from './settings';
import {
  computeBudgetUtilization, checkBudget, assertBudgetAllowed,
  findBudgetRow, fiscalYearFor
} from './budgetControl';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Budget Buyer', email: 'budget@test.com' }));
}

const CONTEXT = {
  docType: 'PO',
  department: 'Production',
  project: 'Unit 2 Expansion',
  costCenter: '',
  fiscalYear: '2026'
};

async function configureBudget({ amount = 100000, block = true, exception = false } = {}) {
  await settingsService.updateSettings({
    budgetControl: {
      enabled: true,
      blockApprovalWhenExceeded: block,
      allowExceptionWorkflow: exception,
      fiscalYear: '2026',
      budgets: [
        { id: 'b1', department: 'Production', project: '', costCenter: '', fiscalYear: '2026', amount, active: true },
        { id: 'b2', department: '', project: '', costCenter: '', fiscalYear: '2026', amount: 5000000, active: true }
      ]
    }
  });
}

/** Approved + released PO with a single line: qty 100 × rate 600 = 60000. */
async function createReleasedPo(amount = 60000) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Budget Test PO',
    vendor: 'Tata Steel Ltd',
    reference: 'PR-BUDGET-1',
    department: 'Production',
    project: 'Unit 2 Expansion',
    items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 100, rate: amount / 100, gstRate: 0 }]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  return mockPurchaseOrderService.releaseOrder(po.id);
}

beforeEach(async () => {
  localStorage.clear();
  ordersStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  shipmentsStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  settingsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  await mockVendorService.createVendor({ name: 'Tata Steel Ltd' });
  await mockVendorService.setVendorStatus((await mockVendorService.getVendors({ search: 'Tata' })).data[0].id, 'Approved');
});

describe('Budget utilisation from real records', () => {
  it('reports budget / committed / actual / paid / available', async () => {
    await configureBudget({ amount: 100000 });
    expect(computeBudgetUtilization(CONTEXT).available).toBe(100000);

    const po = await createReleasedPo(60000);
    expect(computeBudgetUtilization(CONTEXT).committed).toBe(60000);
    expect(computeBudgetUtilization(CONTEXT).available).toBe(40000);

    /* GRN + fully matching invoice, then pay it. */
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel Ltd',
      amount: 60000,
      gst: 0,
      status: INVOICE_STATUS.SUBMITTED,
      items: [{ product: 'Widget A', qty: 100, rate: 600, gst: 0 }]
    });
    await mockInvoiceService.approveInvoice(invoice.id);
    await mockInvoiceService.recordPayment(invoice.id, { full: true });

    const u = computeBudgetUtilization(CONTEXT);
    expect(u.committed).toBe(60000);
    expect(u.actualInvoiced).toBe(60000);
    expect(u.paid).toBe(60000);
    /* The PO value was reserved once — invoicing + paying does not
       consume extra budget. */
    expect(u.openCommitment).toBe(0);
    expect(u.available).toBe(40000);
  });

  it('ignores Draft / Pending / Cancelled POs when committing', async () => {
    await configureBudget({ amount: 100000 });
    const draft = await mockPurchaseOrderService.createOrder({
      title: 'Draft PO',
      vendor: 'Tata Steel Ltd',
      reference: 'PR-DRAFT',
      department: 'Production',
      status: 'Draft',
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 10, rate: 1000, gstRate: 0 }]
    });
    expect(draft.status).toBe('Draft');
    const u = computeBudgetUtilization(CONTEXT);
    expect(u.committed).toBe(0);
    expect(u.available).toBe(100000);
  });

  it('finds the most specific matching budget row', async () => {
    await settingsService.updateSettings({
      budgetControl: {
        enabled: true, blockApprovalWhenExceeded: true, allowExceptionWorkflow: false, fiscalYear: '2026',
        budgets: [
          { id: 'g1', department: 'Production', project: '', costCenter: '', fiscalYear: '2026', amount: 100000, active: true },
          { id: 'g2', department: 'Production', project: 'Unit 2 Expansion', costCenter: '', fiscalYear: '2026', amount: 50000, active: true }
        ]
      }
    });
    const row = findBudgetRow(CONTEXT);
    expect(row.id).toBe('g2');
    expect(fiscalYearFor('2026-09-01')).toBe('2026');
  });
});

describe('Validation on create / submit / approve', () => {
  it('reports the EXACT shortage and blocks approval when configured', async () => {
    await configureBudget({ amount: 100000 });
    const check = checkBudget(CONTEXT, { amount: 150000 });
    expect(check.ok).toBe(false);
    expect(check.shortage).toBe(50000);
    expect(check.blocked).toBe(true);

    expect(() => assertBudgetAllowed(CONTEXT, { amount: 150000 })).toThrow(/shortage 50000/);
    expect(() => assertBudgetAllowed(CONTEXT, { amount: 150000 })).toThrow(/exceeds the available budget/);
  });

  it('blocks PO creation when the budget is exceeded', async () => {
    await configureBudget({ amount: 100000 });
    await expect(
      mockPurchaseOrderService.createOrder({
        title: 'Too Expensive',
        vendor: 'Tata Steel Ltd',
        reference: 'PR-BIG',
        department: 'Production',
        items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 100, rate: 2000, gstRate: 0 }]
      })
    ).rejects.toThrow(/Budget control/);
  });

  it('blocks PO approval when the budget is exceeded at the gate', async () => {
    /* The PO is created while the seeded budget (₹25M for Production)
       still covers it — approval is the moment the value commits, so
       the gate must re-check against the budget configured at approval
       time and refuse when the budget has since been tightened. */
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Gate PO',
      vendor: 'Tata Steel Ltd',
      reference: 'PR-GATE',
      department: 'Production',
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 100, rate: 1200, gstRate: 0 }]
    });
    await configureBudget({ amount: 100000 });
    await expect(mockPurchaseOrderService.approveOrder(po.id)).rejects.toThrow(/Budget control/);
  });

  it('allows an exception workflow when configured and flags the shortage', async () => {
    await configureBudget({ amount: 100000, block: false, exception: true });
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Exception PO',
      vendor: 'Tata Steel Ltd',
      reference: 'PR-EXC',
      department: 'Production',
      items: [{ product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 100, rate: 1500, gstRate: 0 }]
    });
    expect(po.budget).toBeDefined();
    expect(po.budget.ok).toBe(false);
    expect(po.budget.exceptionAllowed).toBe(true);
    expect(po.budget.shortage).toBe(50000);

    /* Exception allowed → approval succeeds and the shortage is kept.
       The high-value chain is parallel (Finance Controller + Director),
       so both steps must approve before the PO is approved. */
    let approved = await mockPurchaseOrderService.approveOrder(po.id, { stepIndex: 0, approver: 'Finance Controller' });
    expect(approved.status).toBe('Pending Approval'); /* still awaiting Director */
    approved = await mockPurchaseOrderService.approveOrder(po.id, { stepIndex: 1, approver: 'Director' });
    expect(approved.status).toBe('Approved');
    expect(approved.budget.exception).toBe(true);
  });

  it('budget label is derived from the matched row', async () => {
    await configureBudget({ amount: 100000 });
    const check = checkBudget(CONTEXT, { amount: 5000 });
    expect(check.row).toBeDefined();
    expect(String(check.row.department)).toBe('Production');
  });
});