/**
 * purchase/services/quotationWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the RFQ → Vendor Quotation → Comparison phase:
 *
 *   Approved / Sent RFQ → Vendor Quotation → Multiple quotations →
 *   Quotation Comparison (built from stored quotation data)
 *
 * Covers the quotation business rules:
 *   RULE 1  A quotation must reference a valid RFQ
 *   RULE 2  A quotation cannot be recorded for a cancelled RFQ
 *   RULE 3  The vendor must be one of the RFQ's invited vendors
 *   RULE 4  Quotations only from Approved vendor masters
 *   RULE 5  Quotation numbers are unique
 *   RULE 6  A live quotation is never overwritten (same vendor, same RFQ)
 *   RULE 7  Multiple vendors may submit quotations for one RFQ
 *   RULE 8  Quotation items automatically inherit the RFQ items
 *   RULE 9  Quotations reference the RFQ, the PR and the vendor
 *   RULE 10 Quotations carry the full commercial field set, with freight
 *           and insurance included in the grand total
 *   RULE 11 The comparison is built from actual stored quotations
 *   RULE 12 The first received quotation advances Sent → Quotation Received
 *
 * The tests exercise the MOCK services directly (same code path the
 * demo mode uses) against a fresh in-memory store per test. `delay`
 * is stubbed to resolve instantly so the suite stays fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QUOTATION_STATUS, RFQ_STATUS } from '../constants';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { ordersStore } from './purchaseOrder';
import { vendorsStore } from './vendor';
import { calcDocumentTotals, round2 } from '../utils/purchase';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity / actor names. */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  setActor();
  /* Populate Approved vendors so RFQ send and quotation validation pass. */
  const { mockVendorService } = await import('./vendor');
  const vendorNames = ['Tata Steel Ltd', 'JSW Steel', 'Bharat Forge', 'Godrej Consumer'];
  for (const name of vendorNames) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const VENDORS = ['Tata Steel Ltd', 'JSW Steel'];

/** Create minimal RFQ fixtures needed by the tests. */
async function seedTestFixtures() {
  // Create a Cancelled RFQ for RULE 2
  const draft1 = await mockRfqService.createRfq({
    title: 'Office furniture',
    reference: 'PR-TEST-001',
    category: 'IT & Office Equipment',
    department: 'Admin',
    project: 'General Operations',
    buyer: 'Test Buyer',
    priority: 'Low',
    validity: 30,
    vendorNames: ['Godrej Consumer'],
    items: [{ product: 'Executive workstation', hsn: '9403', uom: 'Nos', qty: 12, rate: 18500 }]
  });
  await mockRfqService.cancelRfq(draft1.id, 'Budget realignment');

  // Create a Sent RFQ with Tata / JSW / Bharat Forge for RULE 3+ tests
  const draft2 = await mockRfqService.createRfq({
    title: 'CRCA coils for stamping',
    reference: 'PR-TEST-002',
    category: 'Steel & Metals',
    department: 'Production',
    project: 'Unit 2 Expansion',
    buyer: 'Test Buyer',
    priority: 'High',
    validity: 30,
    vendorNames: ['Tata Steel Ltd', 'JSW Steel', 'Bharat Forge'],
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft2.id);
  await mockRfqService.approveRfq(draft2.id);
  await mockRfqService.sendRfq(draft2.id);
}

function rfqItems() {
  return [
    { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, expectedRate: 24.5, specification: 'IS 2062 E250', requiredDate: '2026-09-15' },
    { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, expectedRate: 28, specification: 'IS 2062', requiredDate: '2026-09-15' }
  ];
}

/** Creates a fresh RFQ (Draft → Approved → Sent) with two invited vendors. */
async function createSentRfq() {
  const draft = await mockRfqService.createRfq({
    title: 'Steel sheets for chassis line',
    reference: 'PR-2026-0045',
    department: 'Production',
    project: 'Unit 2 Expansion',
    requester: 'Rahul Sharma',
    buyer: 'Kavita Rao',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: VENDORS,
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

/** Builds a quotation payload for one vendor from the RFQ's items. */
function quotationFor(rfq, vendor, overrides = {}) {
  return {
    rfqNo: rfq.rfqNo,
    vendor,
    submittedOn: '2026-08-15',
    validUntil: '2026-08-31',
    currency: rfq.currency,
    discount: overrides.discount ?? 2,
    charges: overrides.charges ?? 0,
    leadTime: overrides.leadTime ?? 15,
    delivery: overrides.delivery ?? 12,
    deliveryTerms: overrides.deliveryTerms ?? '15 Days',
    paymentTerms: '30 Days',
    warranty: '12 Months',
    notes: overrides.notes ?? 'Commercial offer',
    items: rfq.items.map((item) => ({
      product: item.product,
      hsn: item.hsn,
      uom: item.uom,
      qty: item.qty,
      rate: item.rate ?? item.expectedRate ?? 0,
      gstRate: 18
    })),
    ...overrides
  };
}

/** Forces a stored RFQ into Sent status (bypasses the send guard where a
 *  blocked vendor would otherwise refuse — used to test the quotation
 *  rules in isolation). */
async function forceSent(rfqId, rfqNo) {
  await mockRfqService.updateRfq(rfqId, { status: RFQ_STATUS.SENT });
  return rfqsStore.all.find((entry) => entry.rfqNo === rfqNo);
}

describe('Quotation entry guards', () => {
  it('RULE 1 — refuses a quotation without a valid RFQ', async () => {
    await expect(mockRfqService.saveQuotation({ vendor: VENDORS[0], items: [] })).rejects.toThrow(
      /must reference a valid RFQ/
    );
    await expect(
      mockRfqService.saveQuotation({ rfqNo: 'RFQ-NOT-EXIST', vendor: VENDORS[0], items: [] })
    ).rejects.toThrow(/must reference a valid RFQ/);
  });

  it('RULE 2 — refuses a quotation for a Cancelled RFQ', async () => {
    await seedTestFixtures();
    /* Find the Cancelled RFQ. */
    const cancelled = rfqsStore.all.find((r) => r.status === RFQ_STATUS.CANCELLED);
    await expect(
      mockRfqService.saveQuotation({
        rfqNo: cancelled.rfqNo,
        vendor: 'Godrej Consumer',
        items: [{ product: 'Desk', qty: 1, rate: 100 }]
      })
    ).rejects.toThrow(/cancelled RFQ/);
  });

  it('RULE 3 — refuses a quotation from a vendor not invited to the RFQ', async () => {
    await seedTestFixtures();
    /* Find the Sent RFQ. */
    const sent = rfqsStore.all.find((r) => r.status === RFQ_STATUS.SENT);
    await expect(
      mockRfqService.saveQuotation({
        rfqNo: sent.rfqNo,
        vendor: 'Bosch',
        items: [{ product: 'Hose', qty: 1, rate: 100 }]
      })
    ).rejects.toThrow(/not invited to this RFQ/);
  });

  it('RULE 4 — refuses a quotation from an unapproved vendor master', async () => {
    /* Create a vendor with Pending status (not Approved) — invited to
       the RFQ but not eligible to quote. */
    const { mockVendorService } = await import('./vendor');
    const pendingVendor = await mockVendorService.createVendor({ name: 'Pending Vendor Co' });
    const rfq = await mockRfqService.createRfq({
      title: 'Furniture RFQ',
      reference: 'PR-2026-0045',
      vendorNames: [pendingVendor.name, 'JSW Steel'],
      items: rfqItems()
    });
    await forceSent(rfq.id, rfq.rfqNo);

    await expect(
      mockRfqService.saveQuotation({ ...quotationFor({ ...rfq, items: rfqItems() }, pendingVendor.name) })
    ).rejects.toThrow(/not approved/);

    /* The eligible invited vendor can still quote. */
    const quote = await mockRfqService.saveQuotation(
      quotationFor({ ...rfq, items: rfqItems() }, 'JSW Steel')
    );
    expect(quote.vendor).toBe('JSW Steel');
    expect(quote.status).toBe(QUOTATION_STATUS.RECEIVED);
  });

  it('RULE 5 — refuses a duplicate quotation number', async () => {
    const rfq = await createSentRfq();
    /* Save a quotation to get a number, then try to reuse it. */
    const first = await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));
    const dupeNo = first.quotationNo;
    await expect(
      mockRfqService.saveQuotation({ ...quotationFor(rfq, VENDORS[1]), quotationNo: dupeNo })
    ).rejects.toThrow(new RegExp(`Quotation number ${dupeNo} already exists`));
  });

  it('RULE 6 — a live quotation from the same vendor is never overwritten', async () => {
    const rfq = await createSentRfq();
    const first = await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));
    expect(first.status).toBe(QUOTATION_STATUS.RECEIVED);

    await expect(
      mockRfqService.saveQuotation({ ...quotationFor(rfq, VENDORS[0]), discount: 10 })
    ).rejects.toThrow(/already submitted a quotation/);

    /* Still exactly one quotation from that vendor. */
    const quotes = quotationsStore.all.filter(
      (quote) => quote.rfqNo === rfq.rfqNo && quote.vendor === VENDORS[0]
    );
    expect(quotes).toHaveLength(1);
    expect(quotes[0].discount).toBe(2);
  });

  it('RULE 7 — multiple vendors may submit quotations for one RFQ', async () => {
    const rfq = await createSentRfq();
    await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));
    await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[1]));

    const quotes = quotationsStore.all.filter((quote) => quote.rfqNo === rfq.rfqNo);
    expect(quotes).toHaveLength(2);
    expect(quotes.map((quote) => quote.vendor).sort()).toEqual([...VENDORS].sort());
    /* Each quotation got its own number. */
    expect(new Set(quotes.map((quote) => quote.quotationNo)).size).toBe(2);
  });

  it('a Pending placeholder is filled in place instead of being overwritten', async () => {
    /* Create a Sent RFQ with a Pending placeholder quotation already
       in the store for one vendor. When the actual response arrives,
       the placeholder must be updated in-place, not duplicated. */
    const rfq = await createSentRfq();
    /* Manually insert a Pending placeholder for VENDORS[0]. */
    const placeholderQuotationNo = 'QT-PENDING-0001';
    const placeholder = {
      id: 'QT-PENDING-0001',
      quotationNo: placeholderQuotationNo,
      rfqNo: rfq.rfqNo,
      rfqId: rfq.id,
      prNo: rfq.prNo,
      vendor: VENDORS[0],
      status: QUOTATION_STATUS.PENDING,
      items: [],
      submittedOn: '',
      validUntil: '',
      currency: 'INR',
      discount: 0, charges: 0, freight: 0, insurance: 0,
      leadTime: 0, delivery: 0, paymentTerms: '', warranty: '',
      notes: '',
      subtotal: 0, gstTotal: 0, total: 0,
      score: 0, scoreBreakdown: null,
      vendorRating: 0, vendorId: '',
      createdAt: new Date().toISOString()
    };
    quotationsStore.persist([...quotationsStore.all, placeholder]);

    const before = quotationsStore.all.filter(
      (quote) => quote.rfqNo === rfq.rfqNo && quote.vendor === VENDORS[0]
    );
    expect(before).toHaveLength(1);
    expect(before[0].status).toBe(QUOTATION_STATUS.PENDING);
    const placeholderId = before[0].id;
    const placeholderNo = before[0].quotationNo;

    const saved = await mockRfqService.saveQuotation({
      rfqNo: rfq.rfqNo,
      vendor: VENDORS[0],
      discount: 2.5,
      items: [
        { product: 'Digital caliper 150mm', qty: 4, rate: 3100, gstRate: 18 },
        { product: 'Hardness tester kit', qty: 1, rate: 5100, gstRate: 18 }
      ]
    });

    expect(saved.id).toBe(placeholderId);
    expect(saved.quotationNo).toBe(placeholderNo);
    expect(saved.status).toBe(QUOTATION_STATUS.RECEIVED);

    const after = quotationsStore.all.filter(
      (quote) => quote.rfqNo === rfq.rfqNo && quote.vendor === VENDORS[0]
    );
    expect(after).toHaveLength(1);
    expect(after[0].status).toBe(QUOTATION_STATUS.RECEIVED);
  });

  it('id-bearing updates (accept / reject) bypass the duplicate guard', async () => {
    const rfq = await createSentRfq();
    const saved = await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));

    const accepted = await mockRfqService.saveQuotation({ ...saved, status: QUOTATION_STATUS.ACCEPTED });
    expect(accepted.status).toBe(QUOTATION_STATUS.ACCEPTED);
    expect(accepted.id).toBe(saved.id);

    const rejected = await mockRfqService.saveQuotation({ ...saved, status: QUOTATION_STATUS.REJECTED });
    expect(rejected.status).toBe(QUOTATION_STATUS.REJECTED);
  });
});

describe('Quotation data model', () => {
  it('RULE 8 — quotation items automatically inherit the RFQ items', async () => {
    const rfq = await createSentRfq();
    const quote = await mockRfqService.saveQuotation({ rfqNo: rfq.rfqNo, vendor: VENDORS[0] });

    expect(quote.items).toHaveLength(rfq.items.length);
    expect(quote.items.map((item) => item.product)).toEqual(rfq.items.map((item) => item.product));
    expect(quote.items[0].qty).toBe(8000);
    /* Quoted at the RFQ's expected rate. */
    expect(quote.items[0].rate).toBe(24.5);
  });

  it('RULE 9 — quotations reference the RFQ, the PR and the vendor', async () => {
    const rfq = await createSentRfq();
    const quote = await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));

    expect(quote.rfqNo).toBe(rfq.rfqNo);
    expect(quote.prNo).toBe('PR-2026-0045');
    expect(quote.vendor).toBe(VENDORS[0]);
    expect(quote.quotationNo).toMatch(/^QT-\d{3,}$/);
  });

  it('RULE 10 — carries the full commercial field set with freight + insurance in the total', async () => {
    const rfq = await createSentRfq();
    const items = rfqItems().map((item) => ({
      product: item.product,
      hsn: item.hsn,
      uom: item.uom,
      qty: item.qty,
      rate: item.rate,
      gstRate: 18
    }));
    const quote = await mockRfqService.saveQuotation(
      quotationFor(rfq, VENDORS[0], {
        items,
        discount: 2,
        charges: 200,
        freight: 1000,
        insurance: 500,
        deliveryTerms: 'Ex-Works',
        leadTime: 15,
        delivery: 12,
        paymentTerms: '30 Days',
        warranty: '12 Months',
        remarks: 'Freight ex-works, insurance buyer arranged'
      })
    );

    expect(quote.quotationNo).toMatch(/^QT-\d{3,}$/);
    expect(quote.rfqNo).toBe(rfq.rfqNo);
    expect(quote.prNo).toBe('PR-2026-0045');
    expect(quote.vendor).toBe(VENDORS[0]);
    expect(quote.submittedOn).toBeTruthy();
    expect(quote.validUntil).toBeTruthy();
    expect(quote.currency).toBe('INR');
    expect(quote.paymentTerms).toBe('30 Days');
    expect(quote.deliveryTerms).toBe('Ex-Works');
    expect(quote.leadTime).toBe(15);
    expect(quote.delivery).toBe(12);
    expect(quote.warranty).toBe('12 Months');
    expect(quote.freight).toBe(1000);
    expect(quote.insurance).toBe(500);
    expect(quote.discount).toBe(2);
    expect(quote.charges).toBe(200);
    expect(quote.remarks).toBe('Freight ex-works, insurance buyer arranged');
    expect(quote.attachments).toEqual([]);

    /* Basic amount = subtotal, tax = GST, and the grand total includes
       freight + insurance on top of the computed document total. */
    const totals = calcDocumentTotals(items, 2, 200);
    expect(quote.subtotal).toBe(totals.subtotal);
    expect(quote.gstTotal).toBe(totals.gstTotal);
    expect(quote.total).toBe(round2(totals.total + 1000 + 500));
  });

  it('carries the vendor master rating for comparison display', async () => {
    const rfq = await createSentRfq();
    const quote = await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));

    const master = vendorsStore.all.find((vendor) => vendor.name.includes('Tata'));
    expect(quote.vendorRating).toBe(Number(master?.rating) || 0);
  });
});

describe('Quotation comparison', () => {
  it('RULE 11 — the comparison is built from actual stored quotations with every required column', async () => {
    const rfq = await createSentRfq();
    await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0], { freight: 1000, discount: 2 }));
    await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[1], { freight: 0, discount: 1.5 }));

    const comparison = await mockRfqService.getQuotationComparison(rfq.id);
    expect(comparison.rfq.rfqNo).toBe(rfq.rfqNo);
    expect(comparison.rfq.prNo).toBe('PR-2026-0045');
    expect(comparison.quotes).toHaveLength(2);

    /* Every quote exposes the full comparison column set. */
    comparison.quotes.forEach((quote) => {
      expect(typeof quote.vendor).toBe('string');
      expect(typeof quote.subtotal).toBe('number'); /* Basic Amount */
      expect(typeof quote.discount).toBe('number');
      expect(typeof quote.freight).toBe('number');
      expect(typeof quote.gstTotal).toBe('number'); /* Tax */
      expect(typeof quote.total).toBe('number');
      expect(typeof quote.delivery).toBe('number');
      expect(typeof quote.leadTime).toBe('number');
      expect(typeof quote.paymentTerms).toBe('string');
      expect(typeof quote.warranty).toBe('string');
      expect(typeof quote.vendorRating).toBe('number');
    });

    /* Winner derives from the stored data — the best composite score,
       with the lowest-price highlight following the grand total. */
    const bestScored = [...comparison.quotes].sort((a, b) => b.score - a.score)[0];
    const lowestTotal = [...comparison.quotes].sort((a, b) => a.total - b.total)[0];
    expect(comparison.winner.id).toBe(bestScored.id);
    expect(comparison.winner.vendor).toBe(bestScored.vendor);
    expect(comparison.highlights.bestScore.id).toBe(bestScored.id);
    expect(comparison.highlights.lowestPrice.id).toBe(lowestTotal.id);
  });

  it('RULE 12 — the first received quotation advances Sent → Quotation Received', async () => {
    const rfq = await createSentRfq();
    expect(rfq.status).toBe(RFQ_STATUS.SENT);

    await mockRfqService.saveQuotation(quotationFor(rfq, VENDORS[0]));
    const advanced = await mockRfqService.getRfq(rfq.id);
    expect(advanced.status).toBe(RFQ_STATUS.QUOTATION_RECEIVED);
    expect(advanced.activity.at(-1)).toMatchObject({
      type: 'quote',
      label: `Quotation received from ${VENDORS[0]}`
    });
  });
});
