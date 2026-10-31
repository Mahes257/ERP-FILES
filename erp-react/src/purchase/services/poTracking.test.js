/**
 * purchase/services/poTracking.test.js
 * ------------------------------------------------------------------
 * Unit tests for the single source of truth of PO quantity / value
 * tracking (services/poTracking). Pure fixtures — no store dependency —
 * so every scenario is deterministic:
 *   • baseline (no documents)
 *   • partial delivery
 *   • QC acceptance / rejection split
 *   • partial invoicing across two invoices
 *   • partial + full payment allocation
 *   • Draft / Rejected invoices never count
 * ------------------------------------------------------------------ */
import { describe, expect, it } from 'vitest';
import { trackPurchaseOrder, buildTrackingContext } from './poTracking';
import { grnsStore } from './logistics';
import { invoicesStore } from './invoice';
import { INVOICE_STATUS } from '../constants';

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */
const PO = {
  poNo: 'PO-TEST-0001',
  items: [
    { product: 'HR coil 3mm', qty: 100, rate: 10 },
    { product: 'MS plate 6mm', qty: 50, rate: 20 }
  ]
};

const GRN = (overrides = {}) => ({
  id: 'GRN-TEST-1',
  grnNo: 'GRN-TEST-1',
  poNo: 'PO-TEST-0001',
  status: 'Received',
  items: [{ product: 'HR coil 3mm', qty: 100, received: 40 }],
  ...overrides
});

const QC = (overrides = {}) => ({
  id: 'QC-TEST-1',
  inspectionNo: 'QC-TEST-1',
  grnNo: 'GRN-TEST-1',
  poNo: 'PO-TEST-0001',
  status: 'Passed',
  items: [
    { product: 'HR coil 3mm', receivedQty: 40, inspectedQty: 40, acceptedQty: 38, rejectedQty: 2 }
  ],
  ...overrides
});

const INVOICE = (overrides = {}) => ({
  id: 'VINV-TEST-1',
  invoiceNo: 'VINV-TEST-1',
  poNo: 'PO-TEST-0001',
  status: INVOICE_STATUS.SUBMITTED,
  total: 250,
  paidAmount: 0,
  items: [{ product: 'HR coil 3mm', qty: 25, rate: 10 }],
  ...overrides
});

function ctx({ grns = [], inspections = [], invoices = [] } = {}) {
  return { grns, inspections, invoices };
}

/* ------------------------------------------------------------------ */
/*  Baseline                                                           */
/* ------------------------------------------------------------------ */
describe('poTracking — baseline', () => {
  const order = PO;
  const t = trackPurchaseOrder(order, ctx());

  it('reports the ordered matrix when no documents exist', () => {
    expect(t.totals.orderedQty).toBe(150);
    expect(t.totals.receivedQty).toBe(0);
    expect(t.totals.acceptedQty).toBe(0);
    expect(t.totals.invoicedQty).toBe(0);
    expect(t.totals.paidQty).toBe(0);
    expect(t.totals.remainingQty).toBe(150);
  });

  it('reports ordered values and outstanding = ordered value', () => {
    expect(t.totals.orderedValue).toBe(2000);
    expect(t.totals.invoicedValue).toBe(0);
    expect(t.totals.paidValue).toBe(0);
    expect(t.totals.outstandingValue).toBe(2000);
  });

  it('derives Not Received / Not Invoiced / Unpaid states', () => {
    expect(t.delivery.status).toBe('Not Received');
    expect(t.invoicing.status).toBe('Not Invoiced');
    expect(t.payment.status).toBe('Unpaid');
  });

  it('keeps one row per PO line with ordered qty/value', () => {
    expect(t.lines).toHaveLength(2);
    expect(t.lines[0]).toMatchObject({ product: 'HR coil 3mm', orderedQty: 100, orderedValue: 1000 });
    expect(t.lines[1]).toMatchObject({ product: 'MS plate 6mm', orderedQty: 50, orderedValue: 1000 });
  });
});

/* ------------------------------------------------------------------ */
/*  Partial delivery                                                   */
/* ------------------------------------------------------------------ */
describe('poTracking — partial delivery', () => {
  const t = trackPurchaseOrder(PO, ctx({ grns: [GRN()] }));

  it('accumulates received quantity from a posted GRN only', () => {
    expect(t.totals.receivedQty).toBe(40);
    expect(t.totals.remainingQty).toBe(110);
    expect(t.lines[0].receivedQty).toBe(40);
    expect(t.lines[0].remainingQty).toBe(60);
    expect(t.lines[1].receivedQty).toBe(0);
    expect(t.lines[1].remainingQty).toBe(50);
  });

  it('derives partial delivery status + received value', () => {
    expect(t.delivery.status).toBe('Partially Received');
    expect(t.delivery.percent).toBe(27); // 40/150 rounded
    expect(t.totals.receivedValue).toBe(400);
    expect(t.lines[0].receivedValue).toBe(400);
  });

  it('never counts an EXPECTED (unreceived) GRN', () => {
    const t2 = trackPurchaseOrder(PO, ctx({ grns: [GRN({ status: 'Expected' })] }));
    expect(t2.totals.receivedQty).toBe(0);
    expect(t2.delivery.status).toBe('Not Received');
  });

  it('caps received quantity at the ordered quantity', () => {
    const overflow = trackPurchaseOrder(PO, ctx({ grns: [GRN({ items: [{ product: 'HR coil 3mm', qty: 100, received: 999 }] })] }));
    expect(overflow.lines[0].receivedQty).toBe(100);
    expect(overflow.lines[0].remainingQty).toBe(0);
    expect(overflow.delivery.status).toBe('Partially Received'); // other line not received
  });
});

/* ------------------------------------------------------------------ */
/*  QC acceptance / rejection                                          */
/* ------------------------------------------------------------------ */
describe('poTracking — inspection accepted/rejected split', () => {
  const t = trackPurchaseOrder(PO, ctx({ grns: [GRN()], inspections: [QC()] }));

  it('maps acceptedQty and rejectedQty to the line', () => {
    expect(t.lines[0].acceptedQty).toBe(38);
    expect(t.lines[0].rejectedQty).toBe(2);
    expect(t.totals.acceptedQty).toBe(38);
    expect(t.totals.rejectedQty).toBe(2);
  });

  it('ignores pending inspections that have no inspected quantities', () => {
    const pending = QC({ status: 'Pending', items: [{ product: 'HR coil 3mm', receivedQty: 40, inspectedQty: 0, acceptedQty: 0, rejectedQty: 0 }] });
    const t2 = trackPurchaseOrder(PO, ctx({ grns: [GRN()], inspections: [pending] }));
    expect(t2.totals.acceptedQty).toBe(0);
    expect(t2.totals.rejectedQty).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Partial invoicing (two invoices)                                   */
/* ------------------------------------------------------------------ */
describe('poTracking — partial invoicing across invoices', () => {
  it('partially invoiced until the received quantity is covered', () => {
    const t = trackPurchaseOrder(PO, ctx({
      grns: [GRN()], // HR coil received = 40
      invoices: [INVOICE({ id: 'VINV-1', items: [{ product: 'HR coil 3mm', qty: 25, rate: 10 }] })]
    }));
    expect(t.totals.invoicedQty).toBe(25);
    expect(t.invoicing.status).toBe('Partially Invoiced'); // 25 of 40 received
    expect(t.lines[0].invoicedQty).toBe(25);
    expect(t.lines[0].uninvoicedQty).toBe(75);
    expect(t.totals.invoicedValue).toBe(250);
  });

  it('accumulates a second invoice and reaches Fully Invoiced', () => {
    const t = trackPurchaseOrder(PO, ctx({
      grns: [GRN()],
      invoices: [
        INVOICE({ id: 'VINV-1', items: [{ product: 'HR coil 3mm', qty: 25, rate: 10 }] }),
        INVOICE({ id: 'VINV-2', items: [{ product: 'HR coil 3mm', qty: 15, rate: 10 }] })
      ]
    }));
    expect(t.totals.invoicedQty).toBe(40);
    expect(t.invoicing.status).toBe('Fully Invoiced');
    expect(t.lines[0].uninvoicedQty).toBe(60);
  });

  it('ignores Draft and Rejected invoices', () => {
    const t = trackPurchaseOrder(PO, ctx({
      grns: [GRN()],
      invoices: [
        INVOICE({ id: 'VINV-D', status: INVOICE_STATUS.DRAFT, items: [{ product: 'HR coil 3mm', qty: 90, rate: 10 }] }),
        INVOICE({ id: 'VINV-R', status: INVOICE_STATUS.REJECTED, items: [{ product: 'HR coil 3mm', qty: 5, rate: 10 }] })
      ]
    }));
    expect(t.totals.invoicedQty).toBe(0);
    expect(t.invoicing.status).toBe('Not Invoiced');
  });
});

/* ------------------------------------------------------------------ */
/*  Payments                                                           */
/* ------------------------------------------------------------------ */
describe('poTracking — payments', () => {
  const invoiced = [
    INVOICE({ id: 'VINV-1', total: 250, paidAmount: 125, items: [{ product: 'HR coil 3mm', qty: 25, rate: 10 }] })
  ];

  it('allocates a partial payment pro-rata to the invoiced lines', () => {
    const t = trackPurchaseOrder(PO, ctx({ grns: [GRN()], invoices: invoiced }));
    expect(t.payment.status).toBe('Partially Paid');
    expect(t.totals.paidValue).toBe(125); // 50% of 250
    expect(t.lines[0].paidValue).toBe(125);
    expect(t.lines[0].paidQty).toBe(12.5);
    expect(t.totals.outstandingValue).toBe(1875); // 2000 − 125
  });

  it('reports Paid after the invoice is fully paid', () => {
    const t = trackPurchaseOrder(PO, ctx({
      grns: [GRN()],
      invoices: [INVOICE({ id: 'VINV-1', total: 250, paidAmount: 250, items: [{ product: 'HR coil 3mm', qty: 25, rate: 10 }] })]
    }));
    expect(t.payment.status).toBe('Paid');
    expect(t.totals.paidValue).toBe(250);
    expect(t.lines[0].paidQty).toBe(25);
    expect(t.totals.unpaidValue).toBe(0);
    expect(t.totals.outstandingValue).toBe(1750);
  });

  it('stays Unpaid with no payment on the invoice', () => {
    const t = trackPurchaseOrder(PO, ctx({ grns: [GRN()], invoices: [INVOICE()] }));
    expect(t.payment.status).toBe('Unpaid');
    expect(t.totals.paidValue).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  Structure                                                          */
/* ------------------------------------------------------------------ */
describe('poTracking — structure & ordering guarantees', () => {
  const t = trackPurchaseOrder(PO, ctx({
    grns: [GRN()],
    inspections: [QC()],
    invoices: [INVOICE()]
  }));

  it('exposes every requested per-line quantity and value field', () => {
    const row = t.lines[0];
    for (const field of [
      'orderedQty', 'receivedQty', 'acceptedQty', 'rejectedQty', 'invoicedQty', 'paidQty',
      'remainingQty', 'orderedValue', 'receivedValue', 'invoicedValue', 'paidValue', 'outstandingValue'
    ]) {
      expect(row).toHaveProperty(field);
    }
  });

  it('keeps per-line values consistent with totals and lists invoice ids', () => {
    expect(t.totals.receivedQty).toBe(t.lines.reduce((s, l) => s + l.receivedQty, 0));
    expect(t.totals.invoicedValue).toBe(t.lines.reduce((s, l) => s + l.invoicedValue, 0));
    expect(t.invoiceIds).toEqual(['VINV-TEST-1']);
  });

  it('never returns negative remaining or outstanding values', () => {
    t.lines.forEach((line) => {
      expect(line.remainingQty).toBeGreaterThanOrEqual(0);
      expect(line.outstandingValue).toBeGreaterThanOrEqual(0);
    });
  });
});

/* ------------------------------------------------------------------ */
/*  Live-store context (same path the UI uses by default)              */
/* ------------------------------------------------------------------ */
describe('poTracking — persisted store context', () => {
  it('builds the context from the real GRN / Invoice stores', () => {
    const prevGrns = grnsStore.all;
    const prevInvoices = invoicesStore.all;
    try {
      grnsStore.persist([GRN()]);
      invoicesStore.persist([INVOICE()]);
      const ctx = buildTrackingContext();
      expect(ctx.grns).toHaveLength(1);
      expect(ctx.invoices).toHaveLength(1);
      const t = trackPurchaseOrder(PO); // default context = live stores
      expect(t.totals.receivedQty).toBe(40);
      expect(t.totals.invoicedQty).toBe(25);
      expect(t.totals.remainingQty).toBe(110);
      expect(t.totals.outstandingValue).toBe(2000);
    } finally {
      grnsStore.persist(prevGrns);
      invoicesStore.persist(prevInvoices);
    }
  });
});
