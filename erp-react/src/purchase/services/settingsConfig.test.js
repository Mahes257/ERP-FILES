/**
 * purchase/services/settingsConfig.test.js
 * ------------------------------------------------------------------
 * Verifies the central configuration system: every Settings section is
 * actually consumed by the application.
 *
 *   · Document Numbering   → nextSeqNo / nextInvoiceNo / nextInventoryId
 *   · Workflow             → PO status transitions (service + fallback)
 *   · Tax                  → default tax rate on new line items
 *   · Payment Terms        → invoice due dates
 *   · Logistics Defaults   → GRN creation / inspection gating
 *   · Company / PDF        → print letterhead + terms fallback
 *   · Notifications        → alerts derived from real records
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDefaultTaxRate, getDefaultTermsContent, getLogisticsDefaults,
  getPrintCompany, readSettings, recordNumberIssued, settingsService, settingsStore
} from './settings';
import { nextSeqNo } from '../utils/purchase';
import { isValidPOTransition } from './workflowConfig';
import { invoiceDueDate } from './invoice';
import { deriveAlerts } from './notifications';
import {
  grnsStore, inspectionsStore, logisticsService
} from './logistics';
import { PO_STATUS } from '../constants';
import { ordersStore } from './purchaseOrder';

function shiftDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

const YEAR = new Date().getFullYear();

beforeEach(() => {
  settingsStore.reset();
  ordersStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
});

/* ================================================================== */
/*  Document Numbering → generated document numbers                    */
/* ================================================================== */
describe('Numbering → document numbers', () => {
  it('uses the configured prefix, padding and counter', async () => {
    await settingsService.updateSettings({
      numbering: {
        ...readSettings().numbering,
        PO: { prefix: 'PUR', fy: '2026', startNo: 1, currentNo: 0, padding: 5 }
      }
    });
    expect(nextSeqNo([], 'PO', 'poNo', 4200, 4)).toBe(`PUR-${YEAR}-00001`);
    expect(nextSeqNo([{ poNo: `PUR-${YEAR}-00001` }], 'PO', 'poNo', 4200, 4)).toBe(`PUR-${YEAR}-00002`);
  });

  it('never collides with existing records even when the counter lags', async () => {
    await settingsService.updateSettings({
      numbering: {
        ...readSettings().numbering,
        GRN: { prefix: 'GRN', fy: '2026', startNo: 1, currentNo: 3, padding: 4 }
      }
    });
    const records = [{ grnNo: `GRN-${YEAR}-0040` }];
    expect(nextSeqNo(records, 'GRN', 'grnNo', 4200, 4)).toBe(`GRN-${YEAR}-0041`);
  });

  it('persists the issued counter so the Settings panel stays live', async () => {
    settingsStore.reset();
    const cfgBefore = readSettings().numbering.RFQ;
    recordNumberIssued('RFQ', `RFQ-${YEAR}-0099`);
    expect(readSettings().numbering.RFQ.currentNo).toBeGreaterThanOrEqual(Math.max(Number(cfgBefore.currentNo), 99));
  });

  it('keeps the legacy call-site behavior for unconfigured types', () => {
    const no = nextSeqNo([], 'XX', 'code', 7, 3);
    expect(no).toBe(`XX-${YEAR}-008`);
  });
});

/* ================================================================== */
/*  Workflow → status transitions                                      */
/* ================================================================== */
describe('Workflow → status transitions', () => {
  it('falls back to the canonical matrix when no workflow is configured', () => {
    settingsStore.reset();
    expect(isValidPOTransition(PO_STATUS.APPROVED, PO_STATUS.RELEASED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.DRAFT, PO_STATUS.RELEASED)).toBe(false);
  });

  it('honours the configured allowedTransitions when a workflow exists', async () => {
    await settingsService.updateSettings({
      workflow: {
        ...readSettings().workflow,
        PO: [
          { stage: 'Draft', displayName: 'Draft', enabled: true, allowedTransitions: ['Pending Approval'] },
          { stage: 'Pending Approval', displayName: 'Pending Approval', enabled: true, allowedTransitions: ['Approved'] },
          { stage: 'Approved', displayName: 'Approved', enabled: true, allowedTransitions: ['Released'] }
        ]
      }
    });
    /* Approved → Cancelled was allowed canonically but removed in Settings. */
    expect(isValidPOTransition(PO_STATUS.APPROVED, PO_STATUS.CANCELLED)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.APPROVED, PO_STATUS.RELEASED)).toBe(true);
    /* Unconfigured stages still fall back to the canonical matrix. */
    expect(isValidPOTransition(PO_STATUS.RELEASED, PO_STATUS.SUPPLIER_ACKNOWLEDGED)).toBe(true);
  });
});

/* ================================================================== */
/*  Tax Settings → line-item defaults                                  */
/* ================================================================== */
describe('Tax Settings → default tax rate', () => {
  it('defaults to the configured tax label', async () => {
    settingsStore.reset();
    expect(getDefaultTaxRate()).toBe(18);
    await settingsService.updateSettings({ defaults: { ...readSettings().defaults, tax: '12%' } });
    expect(getDefaultTaxRate()).toBe(12);
    await settingsService.updateSettings({
      defaults: { ...readSettings().defaults, tax: '' },
      procurementDefaults: { ...readSettings().procurementDefaults, defaultTax: '5%' }
    });
    expect(getDefaultTaxRate()).toBe(5);
  });
});

/* ================================================================== */
/*  Payment Terms → invoice due dates                                  */
/* ================================================================== */
describe('Payment Terms → invoice due dates', () => {
  it('computes the due date from the PO credit period', () => {
    expect(invoiceDueDate({}, { paymentTerms: { type: 'Net 30', creditDays: 30 } }, '2026-03-01')).toBe('2026-03-31');
  });

  it('matches a configured Settings payment term by name', () => {
    settingsStore.reset();
    expect(invoiceDueDate({ paymentTerms: 'Net 45' }, {}, '2026-03-01')).toBe('2026-04-15');
  });

  it('returns an empty due date when nothing can be derived', () => {
    expect(invoiceDueDate({}, {}, '')).toBe('');
    expect(invoiceDueDate({}, {}, '2026-03-01')).toBe('');
  });
});

/* ================================================================== */
/*  Logistics Defaults → GRN / inspection                              */
/* ================================================================== */
describe('Logistics Defaults → GRN / inspection', () => {
  async function seedReleasedOrder(poNo, status = 'Supplier Acknowledged') {
    ordersStore.persist([{
      id: poNo, poNo,
      approvalStatus: 'Approved',
      status,
      vendor: 'Vendor X',
      items: [{ product: 'Widget A', qty: 10, rate: 100 }]
    }]);
  }

  it('defaults the GRN warehouse from Logistics Defaults', async () => {
    await settingsService.updateSettings({
      logisticsDefaults: { ...getLogisticsDefaults(), defaultWarehouse: 'Central WH' }
    });
    await seedReleasedOrder('PO-WH-1');
    grnsStore.persist([]);
    const grn = await logisticsService.createGrn('PO-WH-1');
    expect(grn.warehouse).toBe('Central WH');
  });

  it('skips the inspection record when inspectionRequired is false', async () => {
    await settingsService.updateSettings({
      logisticsDefaults: { ...getLogisticsDefaults(), inspectionRequired: false }
    });
    await seedReleasedOrder('PO-NOQC-1');
    grnsStore.persist([]);
    inspectionsStore.persist([]);
    const grn = await logisticsService.createGrn('PO-NOQC-1');
    const received = await logisticsService.receiveGoods(grn.grnNo);
    expect(received.status).toBe('Pending Inspection');
    expect(inspectionsStore.all.filter((i) => i.grnNo === grn.grnNo).length).toBe(0);
  });

  it('opens an inspection record by default', async () => {
    await settingsService.resetSettings();
    await seedReleasedOrder('PO-QC-1');
    grnsStore.persist([]);
    inspectionsStore.persist([]);
    const grn = await logisticsService.createGrn('PO-QC-1');
    await logisticsService.receiveGoods(grn.grnNo);
    expect(inspectionsStore.all.filter((i) => i.grnNo === grn.grnNo).length).toBe(1);
  });
});

/* ================================================================== */
/*  Company / PDF / Terms → print documents                            */
/* ================================================================== */
describe('Company / Terms → print documents', () => {
  it('returns the configured company profile with a fallback', () => {
    settingsStore.reset();
    expect(getPrintCompany().name).toBe('Vishak Engineering Pvt Ltd');
    expect(getPrintCompany().gstin).toBe('27AABCV1234E1ZP');
  });

  it('falls back to defaults when the company section is cleared', async () => {
    await settingsService.updateSettings({ company: { ...readSettings().company, name: '', gstin: '' } });
    const co = getPrintCompany();
    expect(co.name).toBe('Vishak Engineering Pvt Ltd');
    expect(co.gstin).toBe('');
  });

  it('returns the default active terms template', () => {
    settingsStore.reset();
    expect(getDefaultTermsContent()).toContain('All goods shall conform');
  });
});

/* ================================================================== */
/*  Notifications → alerts derived from real records                   */
/* ================================================================== */
describe('Notifications → alerts', () => {
  const rules = [
    { id: 'r1', event: 'PR approval pending', enabled: true, recipientRole: 'Approver' },
    { id: 'r2', event: 'RFQ deadline approaching', enabled: true, recipientRole: 'Buyer', reminderAfter: 3 },
    { id: 'r3', event: 'Payment overdue', enabled: false, recipientRole: 'Finance' }
  ];

  const stores = {
    requisitions: [{ id: 'pr1', prNo: `PR-${YEAR}-0001`, status: 'Pending Approval', title: 'HR coil' }],
    rfqs: [
      { id: 'rfq1', rfqNo: `RFQ-${YEAR}-0001`, status: 'Sent', title: 'Steel', dueDate: shiftDays(2) },
      { id: 'rfq2', rfqNo: `RFQ-${YEAR}-0002`, status: 'Closed', title: 'Old', dueDate: shiftDays(1) }
    ],
    orders: [],
    grns: [],
    inspections: [],
    invoices: [{
      id: 'inv1', invoiceNo: `INV-${YEAR}-9001`, status: 'Approved', matchStatus: 'Matched',
      total: 5000, paidAmount: 0, vendor: 'Vendor X'
    }]
  };

  it('counts real pending records per enabled rule', () => {
    const alerts = deriveAlerts({ rules, stores });
    expect(alerts).toHaveLength(2);
    const pr = alerts.find((a) => a.event === 'PR approval pending');
    expect(pr.count).toBe(1);
    expect(pr.items[0].route).toBe(`/purchase/requisition/pr1`);
    const rfq = alerts.find((a) => a.event === 'RFQ deadline approaching');
    /* Closed RFQ excluded even though its deadline is near. */
    expect(rfq.count).toBe(1);
    expect(rfq.items[0].number).toBe(`RFQ-${YEAR}-0001`);
  });

  it('excludes disabled rules entirely', () => {
    const alerts = deriveAlerts({ rules, stores });
    expect(alerts.some((a) => a.event === 'Payment overdue')).toBe(false);
  });

  it('produces no alerts when every enabled rule matches nothing', () => {
    const alerts = deriveAlerts({
      rules,
      stores: { requisitions: [], rfqs: [], orders: [], grns: [], inspections: [], invoices: [] }
    });
    expect(alerts.every((a) => a.count === 0)).toBe(true);
  });
});

/* ================================================================== */
/*  Save / Refresh / Reset round-trip                                  */
/* ================================================================== */
describe('Save / Refresh / Reset semantics', () => {
  it('Save persists and Reset restores the saved values', async () => {
    settingsStore.reset();
    const original = readSettings();
    /* Edit + Save. */
    await settingsService.updateSettings({ company: { ...original.company, name: 'Edited Co' } });
    expect(readSettings().company.name).toBe('Edited Co');
    /* Re-read (Refresh) retains the saved value. */
    /* `.resolves` must be awaited: vitest reports an unawaited async assertion
       as a failure, and without it the assertion was never actually checked. */
    await expect(settingsService.getSettings().then((s) => s.company.name)).resolves.toBe('Edited Co');
    /* Factory reset still available via the service. */
    const reset = await settingsService.resetSettings();
    expect(reset.company.name).toBe('Vishak Engineering Pvt Ltd');
  });
});