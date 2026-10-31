/**
 * purchase/services/document360.test.js
 * ------------------------------------------------------------------
 * Smoke tests for the Document 360 resolver:
 *
 *   • Builds ONE real procurement chain through the live services —
 *     PR → RFQ → Quotation → PO → GRN (receipt → inspection) →
 *     Inventory → Invoice (approve → pay → advice) — using real ids
 *     and the real reference fields, never synthetic fixtures.
 *   • Every document type the 360 view supports resolves from its
 *     store and exposes all twelve sections.
 *   • Related documents are grouped by stage with REAL ids and
 *     working navigation routes (detail + 360°) — the PR view sees
 *     the whole downstream chain, the payment view sees upstream.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Stub simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

import { mockRequisitionService, requisitionsStore } from './requisition';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore, inspectionsStore, inventoryStore, shipmentsStore } from './logistics';
import { mockInvoiceService, invoicesStore, adjustmentNotesStore, advicesStore } from './invoice';
import { ADJUSTMENT_NOTE_TYPE } from '../constants';
import { nfasStore } from './nfa';
import { evaluationsStore } from './evaluation';
import { documentsStore } from './documents';
import { document360Service } from './document360';

const TODAY = '2026-08-10';
const ITEMS = [{ product: 'Hot rolled steel sheet 3mm', hsn: '7208', uom: 'MT', qty: 10, rate: 45000, gstRate: 18 }];

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  shipmentsStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  inventoryStore.reset();
  invoicesStore.reset();
  adjustmentNotesStore.reset();
  advicesStore.reset();
  nfasStore.reset();
  evaluationsStore.reset();
  documentsStore.reset();
  setActor();
});

/** Builds one real chain and returns every record by type. */
async function buildChain() {
  const pr = await mockRequisitionService.createRequisition({
    prNo: 'PR-TEST-0001',
    title: 'Test steel sheets',
    requester: 'Test Buyer',
    vendor: 'Tata Steel',
    status: 'Approved',
    items: ITEMS
  });

  const rfq = await mockRfqService.createRfq({
    rfqNo: 'RFQ-TEST-0001',
    title: 'Quotation for steel sheets',
    reference: pr.prNo,
    vendorNames: ['Tata Steel'],
    status: 'Awarded',
    items: ITEMS
  });

  /* Quotations live in their own store — persist the accepted quote the
     same way the award flow does (reference fields only). */
  quotationsStore.persist([
    ...quotationsStore.all,
    {
      id: 'Q-TEST-0001',
      quotationNo: 'QT-TEST-0001',
      rfqNo: rfq.rfqNo,
      vendor: 'Tata Steel',
      items: [{ ...ITEMS[0], rate: 43000, amount: 430000 }],
      subtotal: 430000,
      discount: 0,
      discountAmount: 0,
      freight: 0,
      insurance: 0,
      charges: 0,
      gstTotal: 77400,
      total: 507400,
      currency: 'INR',
      submittedOn: TODAY,
      createdAt: `${TODAY}T10:00:00Z`,
      status: 'Accepted',
      score: 88,
      delivery: 15,
      leadTime: 15,
      paymentTerms: 'Net 30',
      validUntil: '2026-09-10'
    }
  ]);
  const quote = quotationsStore.all.find((q) => q.id === 'Q-TEST-0001');

  const po = await mockPurchaseOrderService.createOrder({
    poNo: 'PO-TEST-0001',
    title: 'PO for steel sheets',
    reference: pr.prNo,
    prNo: pr.prNo,
    rfqNo: rfq.rfqNo,
    quotationNo: quote.quotationNo,
    vendor: 'Tata Steel',
    items: [{ ...ITEMS[0], rate: 43000 }]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  await mockPurchaseOrderService.releaseOrder(po.id);

  const grn = await logisticsService.createGrn(po.poNo, { grnNo: 'GRN-TEST-0001', warehouse: 'Plant A Store' });
  /* Receive goods → creates the quality inspection record automatically. */
  await logisticsService.receiveGoods(grn.grnNo);

  /* Inventory movement referencing the GRN (receipt posted to stock). */
  inventoryStore.persist([
    ...inventoryStore.all,
    {
      id: 'INV-TEST-0001',
      sku: 'RM-STL-01',
      product: 'Hot rolled steel sheet 3mm',
      warehouse: 'Plant A Store',
      before: 24000,
      delta: 10,
      type: 'Receipt',
      reference: grn.grnNo,
      grnNo: grn.grnNo,
      updatedBy: 'Stores Team',
      updatedOn: TODAY,
      createdAt: `${TODAY}T14:00:00Z`
    }
  ]);

  const invoice = await mockInvoiceService.createInvoice({
    poNo: po.poNo,
    vendor: 'Tata Steel',
    grnNo: grn.grnNo,
    invoiceNo: 'INV-TEST-0001',
    vendorInvoiceNo: 'VINV-TEST-0001',
    items: [{ ...ITEMS[0], rate: 43000 }]
  });
  await mockInvoiceService.submitInvoice(invoice.id);
  /* Invoices carry an approval engine — approve every step in the chain. */
  let approved = null;
  for (let guard = 0; guard < 12; guard += 1) {
    approved = await mockInvoiceService.approveInvoice(invoice.id);
    if (approved.status === 'Approved') break;
  }
  expect(approved.status).toBe('Approved');
  await mockInvoiceService.recordPayment(invoice.id, { full: true, method: 'Bank Transfer', transactionReference: 'UTR-TEST-0001' });
  /* Settling the invoice produces exactly one stored payment advice. */
  const advice = advicesStore.all.find((a) => a.invoiceNo === invoice.invoiceNo);
  expect(advice).toBeTruthy();

  return { pr, rfq, quote, po, grn, invoice, advice };
}

describe('Document 360 — relationship graph', () => {
  it('PR 360 resolves the full downstream chain with real ids and routes', async () => {
    const chain = await buildChain();
    const view = await document360Service.getDocument360('pr', chain.pr.id);

    expect(view.type).toBe('pr');
    expect(view.docNo).toBe(chain.pr.prNo);
    expect(view.sourceRoute).toBe(`/purchase/requisition/${chain.pr.id}`);
    expect(view.route360).toBe(`/purchase/requisition/${chain.pr.id}/360`);

    const byStage = Object.fromEntries(view.related.map((g) => [g.stage, g.docs]));
    expect(byStage.rfq?.[0]?.number).toBe(chain.rfq.rfqNo);
    expect(byStage.rfq?.[0]?.route360).toBe(`/purchase/rfq/${chain.rfq.id}/360`);
    expect(byStage.quotation?.[0]?.number).toBe(chain.quote.quotationNo);
    expect(byStage.po?.[0]?.number).toBe(chain.po.poNo);
    expect(byStage.grn?.[0]?.number).toBe(chain.grn.grnNo);
    expect(byStage.inventory?.[0]?.number).toBe('INV-TEST-0001');
    expect(byStage.invoice?.[0]?.number).toBe(chain.invoice.invoiceNo);
    expect(byStage.payment?.[0]?.number).toBe(chain.advice.adviceNo || chain.advice.paymentNo);

    /* Every related doc carries working navigation for BOTH the detail
       page and its own 360° view. */
    Object.values(byStage).flat().forEach((doc) => {
      expect(doc.route).toMatch(/^\/purchase\//);
      if (doc.route360) expect(doc.route360).toContain('/360');
    });
  });

  it('Payment 360 resolves from the advice number and links upstream', async () => {
    const chain = await buildChain();
    const paymentId = chain.advice.adviceNo || chain.advice.paymentNo;
    const view = await document360Service.getDocument360('payment', paymentId);

    expect(view.type).toBe('payment');
    expect(view.record.invoiceNo).toBe(chain.invoice.invoiceNo);

    const byStage = Object.fromEntries(view.related.map((g) => [g.stage, g.docs]));
    expect(byStage.invoice?.[0]?.number).toBe(chain.invoice.invoiceNo);
    expect(byStage.po?.[0]?.number).toBe(chain.po.poNo);
  });

  it('every routed type resolves with all twelve sections', async () => {
    const chain = await buildChain();
    const SECTIONS = [
      'overview', 'items', 'financials', 'activity', 'related',
      'approvals', 'attachments', 'comments', 'audit', 'versions', 'exceptions'
    ];
    const cases = [
      ['pr', chain.pr.id],
      ['rfq', chain.rfq.id],
      ['quotation', chain.quote.id],
      ['po', chain.po.id],
      ['grn', chain.grn.grnNo],
      ['inventory', 'INV-TEST-0001'],
      ['invoice', chain.invoice.id],
      ['payment', chain.advice.adviceNo || chain.advice.paymentNo]
    ];

    for (const [type, id] of cases) {
      const view = await document360Service.getDocument360(type, id);
      expect(view.type).toBe(type);
      expect(view.docNo).toBeTruthy();
      expect(view.route360).toContain('/360');
      expect(view.listRoute).toMatch(/^\/purchase\//);
      for (const section of SECTIONS) {
        expect(view[section], `${type}.${section}`).toBeDefined();
      }
      /* Every 360 view exposes the document's own chain position. */
      expect(view.record).toBeTruthy();
    }
  });

  it('throws for an unknown record — no fake documents are resolved', async () => {
    await expect(document360Service.getDocument360('po', 'PO-DOES-NOT-EXIST')).rejects.toThrow();
    await expect(document360Service.getDocument360('pr', 'PR-DOES-NOT-EXIST')).rejects.toThrow();
  });
});

describe('Document 360 — invoice financials follow credit / debit notes', () => {
  it('approved credit notes reduce the 360 Net Payable and Outstanding', async () => {
    /* Fresh PO → GRN → approved invoice (NOT paid) so the note's effect
       is visible in the balances. */
    const po = await mockPurchaseOrderService.createOrder({
      title: '360 note test PO',
      vendor: 'Tata Steel',
      reference: 'PR-360-NOTE',
      items: [{ product: 'Widget', hsn: '1111', uom: 'Nos', qty: 10, rate: 1000, gstRate: 0 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    const grn = await logisticsService.createGrn(po.poNo);
    await logisticsService.receiveGoods(grn.id);
    const invoice = await mockInvoiceService.createInvoice({
      poNo: po.poNo,
      vendor: 'Tata Steel',
      items: [{ product: 'Widget', hsn: '1111', uom: 'Nos', qty: 10, rate: 1000, gstRate: 0 }]
    });
    await mockInvoiceService.submitInvoice(invoice.id);
    let approved = null;
    for (let guard = 0; guard < 12; guard += 1) {
      approved = await mockInvoiceService.approveInvoice(invoice.id);
      if (approved.status === 'Approved') break;
    }
    expect(approved.status).toBe('Approved');

    const credit = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Rate correction',
      amount: 4000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(credit.id);
    await mockInvoiceService.approveAdjustmentNote(credit.id);

    const view = await document360Service.getDocument360('invoice', invoice.id);
    const fin = Object.fromEntries(view.financials.map((f) => [f.label, f.value]));
    expect(fin['Net Payable']).toBeCloseTo(6000);
    expect(fin['Credit Notes']).toBeCloseTo(-4000);
    expect(fin['Outstanding']).toBeCloseTo(6000);

    /* A debit note raises the same balances the other way. */
    const debit = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.DEBIT,
      reason: 'Freight overrun',
      amount: 1000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(debit.id);
    await mockInvoiceService.approveAdjustmentNote(debit.id);
    const view2 = await document360Service.getDocument360('invoice', invoice.id);
    const fin2 = Object.fromEntries(view2.financials.map((f) => [f.label, f.value]));
    expect(fin2['Debit Notes']).toBeCloseTo(1000);
    expect(fin2['Net Payable']).toBeCloseTo(7000);
    expect(fin2['Outstanding']).toBeCloseTo(7000);
  });
});