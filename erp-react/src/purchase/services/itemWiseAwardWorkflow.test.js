/**
 * purchase/services/itemWiseAwardWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for ITEM-WISE quotation comparison and supplier selection
 * (split-award support):
 *
 *   Quotations → Item-wise comparison → Item-wise selection →
 *   Selection approval → Split award → One PO per awarded supplier
 *
 * Covers the item-wise business rules:
 *   RULE 1  Every RFQ line must be allocated exactly once
 *   RULE 2  An item can only be allocated to a vendor that quoted it
 *   RULE 3  A vendor without a valid quotation cannot be selected
 *   RULE 4  A single-vendor item-wise selection is stored as the classic
 *           single selection (mode 'single', selectedVendor set)
 *   RULE 5  A multi-vendor allocation is a SPLIT award (mode 'split')
 *   RULE 6  Selection stays editable until approved; an approved
 *           selection cannot be changed
 *   RULE 7  Award accepts every selected vendor's quotation and rejects
 *           the rest; the RFQ records the item-wise allocation
 *   RULE 8  A split award raises ONE purchase order per awarded vendor,
 *           each carrying only that vendor's allocated lines
 *   RULE 9  A single-vendor award still raises one PO with all lines
 *           (legacy path unchanged)
 *
 * The tests exercise the MOCK services directly against fresh in-memory
 * stores per test. `delay` is stubbed so the suite stays fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, QUOTATION_STATUS, RFQ_STATUS } from '../constants';
import { evaluationService, evaluationsStore } from './evaluation';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import { requisitionsStore } from './requisition';
import { vendorsStore } from './vendor';

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
  evaluationsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  for (const name of ['Tata Steel Ltd', 'JSW Steel', 'Bharat Forge']) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';

function rfqItems() {
  return [
    { product: 'Pen', hsn: '9608', uom: 'Nos', qty: 10, rate: 10, expectedRate: 10, specification: 'Blue ink', requiredDate: '2026-09-15' },
    { product: 'Mouse', hsn: '8471', uom: 'Nos', qty: 20, rate: 6, expectedRate: 6, specification: 'Wireless', requiredDate: '2026-09-15' }
  ];
}

/** Creates a fresh Sent RFQ with two invited vendors (no quotations yet). */
async function createSentRfq() {
  const draft = await mockRfqService.createRfq({
    title: 'Stationery and peripherals',
    reference: 'PR-2026-0045',
    department: 'Production',
    project: 'Unit 2 Expansion',
    requester: 'Rahul Sharma',
    buyer: 'Kavita Rao',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: [VENDOR_A, VENDOR_B],
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

/** Builds a quotation with explicit per-item rates. */
function quotationFor(rfq, vendor, rates = [], overrides = {}) {
  return {
    rfqNo: rfq.rfqNo,
    vendor,
    submittedOn: '2026-08-15',
    validUntil: '2026-08-31',
    currency: rfq.currency,
    discount: 0,
    charges: 0,
    freight: 0,
    insurance: 0,
    leadTime: 15,
    delivery: 12,
    paymentTerms: '30 Days',
    warranty: '12 Months',
    items: rfq.items.map((item, index) => ({
      product: item.product,
      hsn: item.hsn,
      uom: item.uom,
      qty: item.qty,
      /* An explicit rate list wins (index-aligned); otherwise inherit the
         RFQ's expected rate. */
      rate: rates[index] ?? item.rate ?? item.expectedRate ?? 0,
      gstRate: 18
    })),
    ...overrides
  };
}

/* Valid finalized payment terms used by the strict-gate selection flow. */
const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

/**
 * Drives an RFQ to the evaluation stage with two quotations whose rates
 * favour DIFFERENT vendors per item (the split-award scenario):
 *   Pen   → A ₹10, B ₹8   → B recommended
 *   Mouse → A ₹3,  B ₹5   → A recommended
 * Strict gates: negotiation closes as Agreed and payment terms are
 * finalized before the evaluations and the selection.
 */
async function createEvaluatedRfq() {
  const rfq = await createSentRfq();
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_A, [10, 3]));
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_B, [8, 5]));
  await mockRfqService.startEvaluation(rfq.id);
  const quoteA = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDOR_A);
  await evaluationService.recordNegotiation(rfq.id, VENDOR_A, { amount: quoteA.total, stage: 'Agreed', note: 'Rate confirmed' });
  await evaluationService.completeTechnicalEvaluation(rfq.id);
  await evaluationService.completeCommercialEvaluation(rfq.id, { paymentTerms: TERMS });
  return mockRfqService.getRfq(rfq.id);
}

const allocation = (rfq, index, vendor) => ({
  itemKey: `${rfq.id}:${index}`,
  vendor
});

describe('Item-wise selection guards', () => {
  it('RULE 1 — refuses a selection that does not allocate every RFQ line', async () => {
    const rfq = await createEvaluatedRfq();
    await expect(
      evaluationService.completeItemWiseSelection(rfq.id, { allocations: [allocation(rfq, 0, VENDOR_B)] })
    ).rejects.toThrow(/All items must be allocated/);
  });

  it('RULE 1 — refuses a selection that allocates one item twice', async () => {
    const rfq = await createEvaluatedRfq();
    await expect(
      evaluationService.completeItemWiseSelection(rfq.id, {
        allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 0, VENDOR_A), allocation(rfq, 1, VENDOR_A)]
      })
    ).rejects.toThrow(/only one vendor/);
  });

  it('RULE 2 — refuses to allocate an item the vendor did not quote', async () => {
    const rfq = await createEvaluatedRfq();
    /* Simulate a vendor that never quoted the second line: its stored
       quotation carries only the Pen line. The comparison must refuse
       allocating the Mouse to it. */
    const quoteA = quotationsStore.all.find(
      (entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === VENDOR_A
    );
    quotationsStore.persist(
      quotationsStore.all.map((entry) =>
        entry.id === quoteA.id ? { ...entry, items: [entry.items[0]] } : entry
      )
    );

    await expect(
      evaluationService.completeItemWiseSelection(rfq.id, {
        allocations: [allocation(rfq, 0, VENDOR_A), allocation(rfq, 1, VENDOR_A)]
      })
    ).rejects.toThrow(/did not quote/);
  });

  it('RULE 3 — refuses a vendor without a valid quotation', async () => {
    const rfq = await createEvaluatedRfq();
    /* Bharat Forge was never invited / quoted on this RFQ. */
    await expect(
      evaluationService.completeItemWiseSelection(rfq.id, {
        allocations: [allocation(rfq, 0, 'Bharat Forge'), allocation(rfq, 1, VENDOR_A)]
      })
    ).rejects.toThrow(/No quotation from Bharat Forge/);
  });

  it('RULE 6 — a pending selection can be changed, an approved one cannot', async () => {
    const rfq = await createEvaluatedRfq();
    /* First save — pending, editable. */
    await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_A)]
    });
    /* Re-save with a different allocation before approval is allowed. */
    await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_A), allocation(rfq, 1, VENDOR_B)]
    });

    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
    await expect(
      evaluationService.completeItemWiseSelection(rfq.id, {
        allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_A)]
      })
    ).rejects.toThrow(/cannot be changed/);
  });
});

describe('Item-wise selection model', () => {
  it('RULE 4 — every line to one vendor stores the classic single selection', async () => {
    const rfq = await createEvaluatedRfq();
    const saved = await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_B)],
      rationale: 'Vendor B wins everything'
    });

    expect(saved.selection.mode).toBe('single');
    expect(saved.selection.selectedVendor).toBe(VENDOR_B);
    expect(saved.selection.selectedQuoteId).toMatch(/^QT-/);
    expect(saved.selection.allocations).toHaveLength(2);
    expect(saved.selection.allocations.every((entry) => entry.vendor === VENDOR_B)).toBe(true);
    /* Line totals normalised from the stored quotation (10 × 8 + 20 × 5). */
    expect(saved.selection.allocations[0]).toMatchObject({ product: 'Pen', qty: 10, unitPrice: 8, lineTotal: 80 });
    expect(saved.selection.allocations[1]).toMatchObject({ product: 'Mouse', qty: 20, unitPrice: 5, lineTotal: 100 });
    expect(saved.selection.finalValue).toBe(180);
  });

  it('RULE 5 — split allocation is stored with mode split and no single vendor', async () => {
    const rfq = await createEvaluatedRfq();
    const saved = await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_A)]
    });

    expect(saved.selection.mode).toBe('split');
    expect(saved.selection.selectedVendor).toBeNull();
    expect(saved.selection.selectedQuoteId).toBeNull();
    expect(saved.selection.allocations).toHaveLength(2);
    expect(saved.selection.allocations[0].vendor).toBe(VENDOR_B);
    expect(saved.selection.allocations[1].vendor).toBe(VENDOR_A);
    /* 10 × 8 (B) + 20 × 3 (A) = 140. */
    expect(saved.selection.finalValue).toBe(140);
  });
});

describe('Split award and multi-PO creation', () => {
  it('RULE 7 — a split award accepts every selected vendor and records the allocation', async () => {
    const rfq = await createEvaluatedRfq();
    await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_A)]
    });
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(rfq.id);

    const awarded = await mockRfqService.getRfq(rfq.id);
    expect(awarded.status).toBe(RFQ_STATUS.AWARDED);
    expect(awarded.splitAward).toBe(true);
    expect(awarded.awardedAllocations).toHaveLength(2);
    expect(awarded.awardedAllocations.map((entry) => entry.vendor).sort()).toEqual([VENDOR_A, VENDOR_B].sort());
    expect(awarded.awardedValue).toBe(140);

    /* Both vendors' quotations accepted, everything else rejected. */
    const statuses = quotationsStore.all
      .filter((entry) => entry.rfqNo === rfq.rfqNo)
      .map((entry) => ({ vendor: entry.vendor, status: entry.status }));
    expect(statuses).toEqual([
      { vendor: VENDOR_A, status: QUOTATION_STATUS.ACCEPTED },
      { vendor: VENDOR_B, status: QUOTATION_STATUS.ACCEPTED }
    ]);
  });

  it('RULE 8 — a split award raises one PO per supplier with only its lines', async () => {
    const rfq = await createEvaluatedRfq();
    await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_A)]
    });
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(rfq.id);

    const { po, pos } = await mockRfqService.raisePurchaseOrder(rfq.id);
    expect(pos).toHaveLength(2);
    expect(new Set(pos.map((entry) => entry.vendor))).toEqual(new Set([VENDOR_A, VENDOR_B]));

    /* Each PO carries only its own vendor's lines at the quoted rates. */
    const poB = pos.find((entry) => entry.vendor === VENDOR_B);
    const poA = pos.find((entry) => entry.vendor === VENDOR_A);
    expect(poB.items).toHaveLength(1);
    expect(poB.items[0]).toMatchObject({ product: 'Pen', qty: 10, rate: 8, gstRate: 18 });
    expect(poA.items).toHaveLength(1);
    expect(poA.items[0]).toMatchObject({ product: 'Mouse', qty: 20, rate: 3, gstRate: 18 });

    /* The document chain is preserved per PO. */
    expect(poB.rfqNo).toBe(rfq.rfqNo);
    expect(poB.prNo).toBe('PR-2026-0045');
    expect(poA.rfqNo).toBe(rfq.rfqNo);
    expect(poA.prNo).toBe('PR-2026-0045');

    /* The RFQ records every raised PO. */
    const after = await mockRfqService.getRfq(rfq.id);
    expect(after.poNos).toHaveLength(2);
    expect(after.poNo).toBe(po.poNo);
  });

  it('RULE 9 — a single-vendor item-wise award raises one PO with all lines', async () => {
    const rfq = await createEvaluatedRfq();
    await evaluationService.completeItemWiseSelection(rfq.id, {
      allocations: [allocation(rfq, 0, VENDOR_B), allocation(rfq, 1, VENDOR_B)]
    });
    await evaluationService.approveSupplierSelection(rfq.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(rfq.id);

    const awarded = await mockRfqService.getRfq(rfq.id);
    expect(awarded.splitAward).toBe(false);
    expect(awarded.awardedVendor).toBe(VENDOR_B);
    expect(awarded.awardedValue).toBe(180);

    const { po, pos } = await mockRfqService.raisePurchaseOrder(rfq.id);
    expect(pos).toHaveLength(1);
    expect(po.vendor).toBe(VENDOR_B);
    expect(po.items).toHaveLength(2);
    expect(po.items[0]).toMatchObject({ product: 'Pen', qty: 10, rate: 8 });
    expect(po.items[1]).toMatchObject({ product: 'Mouse', qty: 20, rate: 5 });
    /* Single-vendor award keeps the final selected value on the PO. */
    expect(po.awardedValue).toBe(180);
  });
});
