/**
 * purchase/services/reportsInsights.test.js
 * ------------------------------------------------------------------
 * Tests for the 15 comprehensive reports (computeAllReports):
 *
 *   • every report computes from the supplied real records — nothing
 *     hardcoded,
 *   • the math is exact for a hand-built fixture (spend, aging,
 *     conversion, savings, delivery, quality, payables, forecast),
 *   • vendor / department / project filters narrow the data.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { computeAllReports } from './reports';

/* Wide custom range so every fixture date is included. */
const ALL = { dateRange: 'custom', customStart: '2026-01-01', customEnd: '2026-12-31' };

function fixtureStores() {
  return {
    requisitions: [
      { id: 'pr1', prNo: 'PR-1', department: 'Production', project: 'Project A', status: 'Pending Approval', createdAt: '2026-01-10T09:00:00Z', items: [{ qty: 10, rate: 1000 }] },
      { id: 'pr2', prNo: 'PR-2', department: 'IT', project: 'Project B', status: 'Approved', createdAt: '2026-02-10T09:00:00Z', amount: 5000 },
      { id: 'pr3', prNo: 'PR-3', department: 'Production', project: 'Project A', status: 'Converted to RFQ', createdAt: '2026-03-10T09:00:00Z', amount: 9999 }
    ],
    rfqs: [
      { id: 'rfq1', rfqNo: 'RFQ-1', title: 'Steel', status: 'Awarded', project: 'Project A', estimatedValue: 10000, awardedValue: 8000, createdAt: '2026-01-05T09:00:00Z' },
      { id: 'rfq2', rfqNo: 'RFQ-2', title: 'Cables', status: 'Closed', project: 'Project A', estimatedValue: 5000, createdAt: '2026-02-05T09:00:00Z' },
      { id: 'rfq3', rfqNo: 'RFQ-3', title: 'Tools', status: 'Quotation Received', project: 'Project B', createdAt: '2026-03-05T09:00:00Z' }
    ],
    quotations: [
      { id: 'q1', rfqNo: 'RFQ-1', vendor: 'Vendor X', total: 8000, submittedOn: '2026-01-06' },
      { id: 'q2', rfqNo: 'RFQ-2', vendor: 'Vendor X', total: 4500, submittedOn: '2026-02-06' },
      { id: 'q3', rfqNo: 'RFQ-3', vendor: 'Vendor Y', total: 6000, submittedOn: '2026-03-06', leadTime: 12 }
    ],
    evaluations: [],
    orders: [
      { id: 'o1', poNo: 'PO-1', vendor: 'Vendor X', status: 'In Progress', project: 'Project A', orderDate: '2026-01-15', amount: 8000, rfqNo: 'RFQ-1' },
      { id: 'o2', poNo: 'PO-2', vendor: 'Vendor Y', status: 'Approved', project: 'Project B', orderDate: '2026-02-15', amount: 6000, expectedDate: '2026-03-01' },
      { id: 'o3', poNo: 'PO-3', vendor: 'Vendor X', status: 'Completed', project: 'Project A', orderDate: '2026-03-15', amount: 3000 }
    ],
    grns: [
      { id: 'g1', grnNo: 'GRN-1', poNo: 'PO-1', vendor: 'Vendor X', receivedOn: '2026-01-20', createdAt: '2026-01-20' },
      { id: 'g2', grnNo: 'GRN-2', poNo: 'PO-2', vendor: 'Vendor Y', receivedOn: '2026-03-10', createdAt: '2026-03-10' }
    ],
    inspections: [
      { id: 'i1', inspectionNo: 'QC-1', vendor: 'Vendor X', poNo: 'PO-1', grnNo: 'GRN-1', status: 'Passed', inspectedOn: '2026-01-21' },
      { id: 'i2', inspectionNo: 'QC-2', vendor: 'Vendor X', poNo: 'PO-1', grnNo: 'GRN-1', status: 'Failed', inspectedOn: '2026-01-22' },
      { id: 'i3', inspectionNo: 'QC-3', vendor: 'Vendor Y', poNo: 'PO-2', grnNo: 'GRN-2', status: 'Passed', inspectedOn: '2026-03-11' }
    ],
    inventory: [
      { id: 'INV-1', product: 'Steel', warehouse: 'Plant A', type: 'Receipt', delta: 100, reference: 'GRN-1', createdAt: '2026-01-21' },
      { id: 'INV-2', product: 'Steel', warehouse: 'Plant A', type: 'Issue', delta: -40, reference: 'Dept issue', createdAt: '2026-01-28' },
      { id: 'INV-3', product: 'Cable', warehouse: 'Plant B', type: 'Receipt', delta: 500, reference: 'GRN-2', createdAt: '2026-03-11' }
    ],
    invoices: [
      { id: 'inv1', invoiceNo: 'INV-1', vendor: 'Vendor X', poNo: 'PO-1', status: 'Approved', total: 8000, paidAmount: 0, invoiceDate: '2026-01-25', dueDate: '2026-02-24' },
      { id: 'inv2', invoiceNo: 'INV-2', vendor: 'Vendor Y', poNo: 'PO-2', status: 'Paid', total: 6000, paidAmount: 6000, invoiceDate: '2026-03-01', dueDate: '2026-03-31' },
      { id: 'inv3', invoiceNo: 'INV-3', vendor: 'Vendor X', poNo: 'PO-1', status: 'Approved', total: 3000, paidAmount: 1000, invoiceDate: '2026-03-20', dueDate: '2030-12-31' }
    ],
    advices: [],
    vendors: [
      { id: 'v1', name: 'Vendor X', category: 'Steel', status: 'Approved', rating: 4 },
      { id: 'v2', name: 'Vendor Y', category: 'Electrical', status: 'Approved', rating: 5 }
    ]
  };
}

const todayYear = new Date().getFullYear();

describe('computeAllReports — spend reports', () => {
  it('procurement spend totals real PO value', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    /* 8000 + 6000 + 3000 */
    expect(r.procurementSpend.total).toBe(17000);
    expect(r.procurementSpend.orderCount).toBe(3);
    expect(r.procurementSpend.avgOrder).toBe(Math.round(17000 / 3));
    expect(r.procurementSpend.byMonth.some((m) => m.value === 8000)).toBe(true);
  });

  it('spend by vendor / category / department group real records', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    const vendorRow = r.spendByVendor.rows.find((row) => row.vendor === 'Vendor X');
    expect(vendorRow.spend).toBe(11000); // PO-1 + PO-3
    expect(vendorRow.orderCount).toBe(2);
    expect(vendorRow.pct).toBe(round1(11000 / 17000));

    const categoryRow = r.spendByCategory.rows.find((row) => row.category === 'Steel');
    expect(categoryRow.spend).toBe(11000);

    const deptRow = r.spendByDepartment.rows.find((row) => row.department === 'Production');
    /* PR-1 items (10000) + PR-3 (9999) — PR-3 is converted, still counted
       because the department report uses all requisitions. */
    expect(deptRow.spend).toBe(19999);
  });
});

describe('computeAllReports — aging', () => {
  it('PO aging buckets only open orders', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.poAging.openCount).toBe(2); // PO-1 (In Progress), PO-2 (Approved)
    expect(r.poAging.rows.every((row) => row.poNo !== 'PO-3')).toBe(true);
    const value = r.poAging.rows.reduce((s, row) => s + row.amount, 0);
    expect(value).toBe(14000);
  });

  it('PR aging buckets open requisitions only', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.prAging.openCount).toBe(2); // PR-1 + PR-2
    expect(r.prAging.rows.map((row) => row.prNo)).not.toContain('PR-3');
    expect(r.prAging.rows.reduce((s, row) => s + row.amount, 0)).toBe(15000);
  });
});

describe('computeAllReports — conversion & savings', () => {
  it('RFQ conversion derives quotations, awards and PO conversions', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.rfqConversion.totals.total).toBe(3);
    expect(r.rfqConversion.totals.withQuotations).toBe(3);
    expect(r.rfqConversion.totals.awarded).toBe(1); // RFQ-1
    expect(r.rfqConversion.totals.converted).toBe(1); // RFQ-1 → PO-1

    const row = r.rfqConversion.rows.find((x) => x.rfqNo === 'RFQ-1');
    expect(row.quotationCount).toBe(1);
    expect(row.awarded).toBe(true);
    expect(row.convertedToPo).toBe(true);
    expect(row.poNo).toBe('PO-1');
  });

  it('negotiation savings equal estimate minus award', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.negotiationSavings.totals.count).toBe(1); // only RFQ-1 has both
    expect(r.negotiationSavings.totals.totalEstimated).toBe(10000);
    expect(r.negotiationSavings.totals.totalAwarded).toBe(8000);
    expect(r.negotiationSavings.totals.totalSavings).toBe(2000);
    expect(r.negotiationSavings.totals.savingsPct).toBe(20);
  });
});

describe('computeAllReports — supplier, delivery, quality', () => {
  it('supplier performance computes on-time and quality per vendor', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    const vendorX = r.supplierPerformance.rows.find((row) => row.vendor === 'Vendor X');
    expect(vendorX.spend).toBe(11000);
    expect(vendorX.orderCount).toBe(2);
    /* GRN-1 has no PO expected date → counted on-time. */
    expect(vendorX.onTime).toBe(1);
    expect(vendorX.onTimePct).toBe(100);
    /* QC-1 passed, QC-2 failed → 50% pass */
    expect(vendorX.inspectionCount).toBe(2);
    expect(vendorX.qualityPassRate).toBe(50);
    expect(vendorX.failed).toBe(1);

    const vendorY = r.supplierPerformance.rows.find((row) => row.vendor === 'Vendor Y');
    expect(vendorY.onTime).toBe(0); // GRN-2 late vs PO-2 expectedDate
    expect(vendorY.onTimePct).toBe(0);
  });

  it('delivery performance flags late receipts with delay days', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.deliveryPerformance.totals.total).toBe(2);
    expect(r.deliveryPerformance.totals.onTime).toBe(1);
    expect(r.deliveryPerformance.totals.late).toBe(1);
    const grn2 = r.deliveryPerformance.rows.find((row) => row.grnNo === 'GRN-2');
    expect(grn2.onTime).toBe(false);
    expect(grn2.delayDays).toBe(9); // 2026-03-10 vs 2026-03-01
  });

  it('quality report derives pass / rejection rates from inspections', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.quality.totals.total).toBe(3);
    expect(r.quality.totals.passed).toBe(2);
    expect(r.quality.totals.failed).toBe(1);
    expect(r.quality.totals.passRate).toBe(67); // round(2/3*100)
    expect(r.quality.totals.rejectionRate).toBe(33);
    const byVendor = r.quality.byVendor.find((v) => v.vendor === 'Vendor X');
    expect(byVendor.rejectionRate).toBe(50);
  });
});

describe('computeAllReports — inventory & payments', () => {
  it('inventory movement groups by type and totals quantities', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.inventoryMovement.totals.totalMovements).toBe(3);
    expect(r.inventoryMovement.totals.receiptQty).toBe(600);
    expect(r.inventoryMovement.totals.issueQty).toBe(40);
    expect(r.inventoryMovement.totals.netQty).toBe(560);
    const receipt = r.inventoryMovement.byType.find((t) => t.type === 'Receipt');
    expect(receipt.count).toBe(2);
    expect(receipt.quantity).toBe(600);
  });

  it('invoice aging buckets only unpaid invoices', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    expect(r.invoiceAging.rows.length).toBe(2); // INV-1, INV-3 (INV-2 fully paid)
    expect(r.invoiceAging.totalOutstanding).toBe(10000); // 8000 + 2000
  });

  it('outstanding payables aggregates per vendor', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    const vendorX = r.outstandingPayables.byVendor.find((v) => v.vendor === 'Vendor X');
    expect(vendorX.invoiced).toBe(11000);
    expect(vendorX.paid).toBe(1000);
    expect(vendorX.outstanding).toBe(10000);
    expect(vendorX.invoiceCount).toBe(2);
  });

  it('overdue payments come from past due dates; forecast from future ones', () => {
    const r = computeAllReports(fixtureStores(), ALL);
    /* INV-1 overdue (due 2026-02-24); INV-3 due in 2030 — not overdue. */
    expect(r.payments.overdue.count).toBe(1);
    expect(r.payments.overdue.totalOverdue).toBe(8000);
    expect(r.payments.overdue.rows[0].invoiceNo).toBe('INV-1');

    /* Forecast: only INV-3 has a future due date within 90 days (2030 is
       beyond the 90-day window, so it is excluded unless today ≈ 2030). */
    if (todayYear === 2030) {
      expect(r.payments.forecast.count).toBe(1);
      expect(r.payments.forecast.totalUpcoming).toBe(2000);
    } else {
      expect(r.payments.forecast.count).toBe(0);
    }
  });
});

describe('computeAllReports — filters', () => {
  it('vendor filter narrows every record-backed report', () => {
    const r = computeAllReports(fixtureStores(), { ...ALL, vendor: 'Vendor Y' });
    expect(r.procurementSpend.total).toBe(6000); // only PO-2
    expect(r.spendByVendor.rows.length).toBe(1);
    expect(r.poAging.rows.map((row) => row.poNo)).toEqual(['PO-2']);
    expect(r.deliveryPerformance.totals.total).toBe(1);
    expect(r.quality.totals.total).toBe(1);
    expect(r.outstandingPayables.rows.length).toBe(0); // INV-2 is paid
  });

  it('department filter narrows requisition-backed reports', () => {
    const r = computeAllReports(fixtureStores(), { ...ALL, department: 'IT' });
    expect(r.prAging.openCount).toBe(1);
    expect(r.prAging.rows[0].prNo).toBe('PR-2');
    expect(r.spendByDepartment.rows.length).toBe(1);
    expect(r.spendByDepartment.rows[0].department).toBe('IT');
  });

  it('project filter narrows requisitions, RFQs, orders and invoices', () => {
    const r = computeAllReports(fixtureStores(), { ...ALL, project: 'Project B' });
    expect(r.procurementSpend.total).toBe(6000); // PO-2 only
    expect(r.rfqConversion.totals.total).toBe(1); // RFQ-3 only
    expect(r.prAging.rows.map((row) => row.prNo)).toEqual(['PR-2']);
    expect(r.outstandingPayables.rows.length).toBe(0); // INV-2 (Project-less) + INV-1/3 (Project A) excluded
  });
});

function round1(value) {
  return Math.round(value * 1000) / 10;
}