/**
 * purchase/services/rfqWorkflow.test.js
 * ------------------------------------------------------------------
 * End-to-end unit tests for the RFQ sourcing lifecycle:
 *
 *   Draft → Pending Approval → Approved → Sent → Quotation Received
 *   → Evaluation → Awarded
 *
 * Every test walks a freshly created RFQ through the MOCK service
 * (same code path the demo mode uses) and asserts BOTH the status
 * transition AND the activity/timeline entry at each step, plus the
 * guard rails that stop stages being skipped.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, QUOTATION_STATUS, RFQ_STATUS, VENDOR_RECORD_STATE, VENDOR_STATUS } from '../constants';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { requisitionsStore } from './requisition';
import { ordersStore } from './purchaseOrder';
import { mockVendorService, vendorsStore } from './vendor';
import { evaluationService, evaluationsStore } from './evaluation';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity/audit actor names. */
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
  for (const name of VENDORS) {
    const v = await mockVendorService.createVendor({ name, status: VENDOR_STATUS.APPROVED });
    await mockVendorService.setVendorStatus(v.id, VENDOR_STATUS.APPROVED);
  }
});

const VENDORS = ['Tata Steel Ltd', 'JSW Steel'];

/* Valid finalized payment terms used by the strict-gate evaluation flows. */
const TERMS = { type: 'Against Delivery', balanceTrigger: 'Against Delivery' };

function rfqItems() {
  return [
    { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, expectedRate: 24.5, specification: 'IS 2062 E250', requiredDate: '2026-09-15' },
    { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, expectedRate: 28, specification: 'IS 2062', requiredDate: '2026-09-15' }
  ];
}

/** Creates a fresh Draft RFQ with two invited vendors. */
async function createDraftRfq() {
  return mockRfqService.createRfq({
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
    charges: 0,
    leadTime: overrides.leadTime ?? 15,
    delivery: overrides.delivery ?? 12,
    paymentTerms: '30 Days',
    warranty: '12 Months',
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

describe('RFQ end-to-end sourcing lifecycle', () => {
  it('walks Draft → Pending Approval → Approved → Sent → Quotation Received → Evaluation → Awarded', async () => {
    const draft = await createDraftRfq();

    /* Draft. */
    expect(draft.status).toBe(RFQ_STATUS.DRAFT);
    expect(draft.activity.some((entry) => entry.type === 'create')).toBe(true);

    /* Submit → Pending Approval. */
    const submitted = await mockRfqService.submitForReview(draft.id);
    expect(submitted.status).toBe(RFQ_STATUS.PENDING_APPROVAL);
    expect(submitted.activity.at(-1)).toMatchObject({
      type: 'submit',
      label: `${draft.rfqNo} submitted for approval`
    });

    /* Approve → Approved. */
    const approved = await mockRfqService.approveRfq(draft.id);
    expect(approved.status).toBe(RFQ_STATUS.APPROVED);
    expect(approved.activity.at(-1)).toMatchObject({
      type: 'approve',
      label: `${draft.rfqNo} approved`
    });

    /* Send → Sent (with per-vendor invitation activity). The send entry
       comes BEFORE the per-vendor mail entries in the activity array. */
    const sent = await mockRfqService.sendRfq(draft.id);
    expect(sent.status).toBe(RFQ_STATUS.SENT);
    expect(sent.sentAt).toBeTruthy();
    expect(sent.activity.find((entry) => entry.type === 'send')).toMatchObject({
      type: 'send',
      label: `${draft.rfqNo} sent to ${VENDORS.length} vendor(s)`
    });
    const mailEntries = sent.activity.filter((entry) => entry.type === 'mail');
    expect(mailEntries).toHaveLength(VENDORS.length);
    expect(mailEntries.map((entry) => entry.label)).toEqual(
      VENDORS.map((vendor) => `Invitation sent to ${vendor}`)
    );

    /* First received quotation auto-advances Sent → Quotation Received. */
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[0]));
    const withQuote = await mockRfqService.getRfq(draft.id);
    expect(withQuote.status).toBe(RFQ_STATUS.QUOTATION_RECEIVED);
    expect(withQuote.activity.at(-1)).toMatchObject({
      type: 'quote',
      label: `Quotation received from ${VENDORS[0]}`
    });

    /* Second vendor also quotes (RFQ already Quotation Received, so no
       double auto-advance). */
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[1]));

    /* Start evaluation → Evaluation. */
    const evaluated = await mockRfqService.startEvaluation(draft.id);
    expect(evaluated.status).toBe(RFQ_STATUS.EVALUATION);
    expect(evaluated.activity.at(-1)).toMatchObject({
      type: 'review',
      label: `${draft.rfqNo} evaluation started`
    });

    /* Phase 3 — complete the evaluation pipeline before awarding (strict
       gates: negotiation closes as Agreed + payment terms finalized). */
    const quoteA = quotationsStore.all.find((entry) => entry.rfqNo === draft.rfqNo && entry.vendor === VENDORS[0]);
    await evaluationService.recordNegotiation(draft.id, VENDORS[0], { amount: quoteA.total, stage: 'Agreed', note: 'Rate confirmed' });
    await evaluationService.completeTechnicalEvaluation(draft.id);
    await evaluationService.completeCommercialEvaluation(draft.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(draft.id, VENDORS[0], { rationale: 'Best overall fit' });
    await evaluationService.approveSupplierSelection(draft.id, { decision: APPROVAL_STATUS.APPROVED, remarks: 'Approved by committee' });

    /* Award → Awarded, winner + loser quotations updated. The award
       references the selected supplier, quotation and final value. */
    const awarded = await mockRfqService.awardRfq(draft.id);
    expect(awarded.status).toBe(RFQ_STATUS.AWARDED);
    expect(awarded.awardedVendor).toBe(VENDORS[0]);
    expect(awarded.awardedValue).toBeGreaterThan(0);
    expect(awarded.awardedAt).toBeTruthy();
    expect(awarded.activity.at(-1)).toMatchObject({
      type: 'award',
      label: `${draft.rfqNo} awarded to ${VENDORS[0]}`
    });

    /* Quotation statuses: winner Accepted, other vendors Rejected. */
    const quotes = quotationsStore.all.filter((quote) => quote.rfqNo === draft.rfqNo);
    expect(quotes.find((quote) => quote.vendor === VENDORS[0]).status).toBe(QUOTATION_STATUS.ACCEPTED);
    expect(quotes.find((quote) => quote.vendor === VENDORS[1]).status).toBe(QUOTATION_STATUS.REJECTED);
  });

  it('records every step in the timeline in order', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[0]));
    await mockRfqService.startEvaluation(draft.id);
    const quoteForTimeline = quotationsStore.all.find((entry) => entry.rfqNo === draft.rfqNo && entry.vendor === VENDORS[0]);
    await evaluationService.recordNegotiation(draft.id, VENDORS[0], { amount: quoteForTimeline.total, stage: 'Agreed', note: 'Rate confirmed' });
    await evaluationService.completeTechnicalEvaluation(draft.id);
    await evaluationService.completeCommercialEvaluation(draft.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(draft.id, VENDORS[0]);
    await evaluationService.approveSupplierSelection(draft.id, { decision: APPROVAL_STATUS.APPROVED });
    await mockRfqService.awardRfq(draft.id);

    const timeline = await mockRfqService.getRfqTimeline(draft.id);
    const labels = timeline.map((entry) => entry.label);

    /* create + submit + approve + send + (2× mail) + quote + review + award. */
    expect(labels[0]).toBe(`${draft.rfqNo} created`);
    expect(labels).toEqual([
      `${draft.rfqNo} created`,
      `${draft.rfqNo} submitted for approval`,
      `${draft.rfqNo} approved`,
      `${draft.rfqNo} sent to ${VENDORS.length} vendor(s)`,
      `Invitation sent to ${VENDORS[0]}`,
      `Invitation sent to ${VENDORS[1]}`,
      `Quotation received from ${VENDORS[0]}`,
      `${draft.rfqNo} evaluation started`,
      `${draft.rfqNo} awarded to ${VENDORS[0]}`
    ]);
  });
});

describe('RFQ stage guards', () => {
  it('refuses to skip the approval stage (approve before submit)', async () => {
    const draft = await createDraftRfq();
    await expect(mockRfqService.approveRfq(draft.id)).rejects.toThrow(/Only pending RFQs can be approved/);
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.DRAFT);
  });

  it('refuses to send before approval', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await expect(mockRfqService.sendRfq(draft.id)).rejects.toThrow(/Only approved RFQs can be sent to vendors/);
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.PENDING_APPROVAL);
  });

  it('refuses to send without at least one invited vendor', async () => {
    const draft = await mockRfqService.createRfq({
      title: 'No-vendor RFQ',
      reference: 'PR-2026-0046',
      vendorNames: [],
      items: rfqItems()
    });
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await expect(mockRfqService.sendRfq(draft.id)).rejects.toThrow(
      /Select at least one vendor before sending the RFQ/
    );
  });

  it('refuses to submit an RFQ without line items', async () => {
    const draft = await mockRfqService.createRfq({
      title: 'Itemless RFQ',
      reference: 'PR-2026-0046',
      vendorNames: VENDORS,
      items: []
    });
    await expect(mockRfqService.submitForReview(draft.id)).rejects.toThrow(
      /Add at least one line item before submitting the RFQ/
    );
    /* The RFQ stays Draft — the submit did not happen. */
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.DRAFT);
  });

  it('refuses to start evaluation before the RFQ is sent', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await expect(mockRfqService.startEvaluation(draft.id)).rejects.toThrow(/Only sent RFQs can move to evaluation/);
  });

  it('derives the Overdue bucket from actual past due dates (stats + status filter)', async () => {
    const all = (await mockRfqService.getRfqs({ page: 1, pageSize: 100 })).data;
    /* The expected overdue set mirrors isOverdueRfq exactly — non-terminal
       statuses (Draft / Awarded / Closed / Cancelled excluded) whose due
       date is in the past. Derived dynamically so the assertion holds on
       any run date. */
    const expected = all.filter(
      (rfq) =>
        rfq.dueDate &&
        ![RFQ_STATUS.DRAFT, RFQ_STATUS.AWARDED, RFQ_STATUS.CLOSED, RFQ_STATUS.CANCELLED].includes(rfq.status) &&
        new Date(`${rfq.dueDate}T00:00:00Z`).getTime() < Date.now()
    );

    const stats = await mockRfqService.getRfqStats();
    expect(stats.overdue).toBe(expected.length);

    const overdue = (await mockRfqService.getRfqs({ status: 'Overdue', page: 1, pageSize: 100 })).data;
    expect(overdue.length).toBe(expected.length);
    expect(overdue.every((rfq) => expected.some((item) => item.id === rfq.id))).toBe(true);
  });

  it('refuses to award before the RFQ is sent (status guard)', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    /* Approved — never sent, so no quotation can exist yet. */
    await expect(mockRfqService.awardRfq(draft.id, VENDORS[0])).rejects.toThrow(
      /Only RFQs with received quotations can be awarded/
    );
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.APPROVED);
  });

  it('refuses to award before the supplier selection is completed and approved', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[0]));

    /* No supplier selection yet — award refused. */
    await expect(mockRfqService.awardRfq(draft.id, VENDORS[0])).rejects.toThrow(
      /Complete supplier selection before awarding/
    );
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.QUOTATION_RECEIVED);

    /* Selection completed but not yet approved — still refused. The RFQ
       moves into evaluation (comparison) first, then
       the technical + commercial evaluations, all mandatory stages. */
    await mockRfqService.startEvaluation(draft.id);
    const quoteForGate = quotationsStore.all.find((entry) => entry.rfqNo === draft.rfqNo && entry.vendor === VENDORS[0]);
    await evaluationService.recordNegotiation(draft.id, VENDORS[0], { amount: quoteForGate.total, stage: 'Agreed', note: 'Rate confirmed' });
    await evaluationService.completeTechnicalEvaluation(draft.id);
    await evaluationService.completeCommercialEvaluation(draft.id, { paymentTerms: TERMS });
    await evaluationService.completeSupplierSelection(draft.id, VENDORS[0]);
    await expect(mockRfqService.awardRfq(draft.id, VENDORS[0])).rejects.toThrow(
      /must be approved before awarding/
    );
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.EVALUATION);
  });
});

describe('RFQ delete guard (data-integrity)', () => {
  it('allows deleting a Draft RFQ with no quotations', async () => {
    const draft = await createDraftRfq();
    await expect(mockRfqService.deleteRfq(draft.id)).resolves.toEqual({ id: draft.id });
    await expect(mockRfqService.getRfq(draft.id)).rejects.toThrow();
  });

  it('refuses to delete a Sent RFQ (vendors already engaged)', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    await expect(mockRfqService.deleteRfq(draft.id)).rejects.toThrow(/cannot be deleted/);
    /* The record must still exist afterwards — a rejected delete must not
       partially remove it. */
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.SENT);
  });

  it('refuses to delete an RFQ that has quotations on file, even if Draft', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[0]));
    /* Cancel returns it to a nominally "deletable" status, but the
       quotation on file must still block deletion (no orphan quote). */
    await mockRfqService.cancelRfq(draft.id);
    await expect(mockRfqService.deleteRfq(draft.id)).rejects.toThrow(/quotation/);
  });

  it('allows deleting a Cancelled RFQ that never received quotations', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.cancelRfq(draft.id);
    await expect(mockRfqService.deleteRfq(draft.id)).resolves.toEqual({ id: draft.id });
  });
});

describe('RFQ post-send edit guard (no silent scope/terms mutation)', () => {
  it('refuses to change items on a Sent RFQ', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    await expect(mockRfqService.updateRfq(draft.id, { items: rfqItems() })).rejects.toThrow(
      /can no longer be edited/
    );
  });

  it('refuses to change commercialTerms on an Awarded RFQ', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    await mockRfqService.saveQuotation(quotationFor(draft, VENDORS[0]));
    await expect(
      mockRfqService.updateRfq(draft.id, { commercialTerms: { paymentTerms: '60 Days' } })
    ).rejects.toThrow(/can no longer be edited/);
  });

  it('still allows adding vendors to a Sent RFQ (late-invite use case)', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);
    const updated = await mockRfqService.updateRfq(draft.id, { vendors: [...VENDORS, 'ABB'] });
    expect(updated.vendors).toContain('ABB');
    expect(updated.vendorCount).toBe(3);
  });

  it('allows editing items freely while still Draft', async () => {
    const draft = await createDraftRfq();
    const updated = await mockRfqService.updateRfq(draft.id, { items: [rfqItems()[0]] });
    expect(updated.items).toHaveLength(1);
  });
});

describe('RFQ approval workflow (Pending / Approved / Rejected)', () => {
  it('stores the approver, date, decision and remarks on approval', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);

    const approved = await mockRfqService.approveRfq(draft.id, 'Approved — within budget');

    expect(approved.status).toBe(RFQ_STATUS.APPROVED);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(approved.approvalDecision).toMatchObject({
      approver: 'Test Buyer',
      decision: APPROVAL_STATUS.APPROVED,
      remarks: 'Approved — within budget'
    });
    expect(approved.approvalDecision.date).toBeTruthy();
  });

  it('rejects a pending RFQ — approval Rejected, RFQ Cancelled, decision recorded', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);

    const rejected = await mockRfqService.rejectRfq(draft.id, 'Budget cut for this quarter');

    expect(rejected.status).toBe(RFQ_STATUS.CANCELLED);
    expect(rejected.approvalStatus).toBe(APPROVAL_STATUS.REJECTED);
    expect(rejected.approvalDecision).toMatchObject({
      approver: 'Test Buyer',
      decision: APPROVAL_STATUS.REJECTED,
      remarks: 'Budget cut for this quarter'
    });
    expect(rejected.approvalDecision.date).toBeTruthy();
    expect(rejected.activity.at(-1)).toMatchObject({
      type: 'reject',
      label: `${draft.rfqNo} rejected — approval not granted`
    });

    /* A rejected (cancelled) RFQ can never be sent to vendors. */
    await expect(mockRfqService.sendRfq(draft.id)).rejects.toThrow(/Only approved RFQs can be sent/);
  });

  it('refuses to reject an RFQ that is not pending approval', async () => {
    const draft = await createDraftRfq();
    await expect(mockRfqService.rejectRfq(draft.id)).rejects.toThrow(/Only pending RFQs can be rejected/);
  });

  it('a duplicated RFQ starts a fresh approval cycle', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);

    const copy = await mockRfqService.duplicateRfq(draft.id);
    expect(copy.status).toBe(RFQ_STATUS.DRAFT);
    expect(copy.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(copy.approvalDecision).toBeNull();
  });
});

describe('RFQ vendor eligibility (Approved only)', () => {
  it('getRfqEligibleVendors returns only Approved vendors with an active record state', async () => {
    /* Create non-approved vendors to verify they are excluded. */
    await mockVendorService.createVendor({ name: 'Pending Vendor A' });
    const blockedVendor = await mockVendorService.createVendor({ name: 'Blocked Vendor B' });
    await mockVendorService.setVendorStatus(blockedVendor.id, VENDOR_STATUS.BLOCKED);
    const rejectedVendor = await mockVendorService.createVendor({ name: 'Rejected Vendor C' });
    await mockVendorService.setVendorStatus(rejectedVendor.id, VENDOR_STATUS.REJECTED);

    const eligible = await mockVendorService.getRfqEligibleVendors();
    expect(eligible.length).toBeGreaterThan(0);
    eligible.forEach((vendor) => {
      expect(vendor.status).toBe(VENDOR_STATUS.APPROVED);
      expect(vendor.recordState || VENDOR_RECORD_STATE.ACTIVE).toBe(VENDOR_RECORD_STATE.ACTIVE);
    });
    /* Pending / Blocked / Rejected masters never appear in the pool. */
    const names = eligible.map((vendor) => vendor.name);
    expect(names).not.toContain('Pending Vendor A');
    expect(names).not.toContain('Blocked Vendor B');
    expect(names).not.toContain('Rejected Vendor C');
  });

  it('refuses to send an RFQ invited to a Pending vendor', async () => {
    /* Create a vendor with Pending status. */
    const pendingVendor = await mockVendorService.createVendor({ name: 'Pending Vendor X' });
    const draft = await mockRfqService.createRfq({
      title: 'Pending vendor RFQ',
      reference: 'PR-2026-0045',
      vendorNames: [pendingVendor.name, 'JSW Steel'],
      items: rfqItems()
    });
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);

    await expect(mockRfqService.sendRfq(draft.id)).rejects.toThrow(/not approved vendors/);
    /* The RFQ stays Approved — the send did not happen. */
    expect((await mockRfqService.getRfq(draft.id)).status).toBe(RFQ_STATUS.APPROVED);
  });

  it('refuses to send an RFQ invited to a Blocked vendor', async () => {
    /* Create a vendor with Blocked status. */
    const blockedVendor = await mockVendorService.createVendor({ name: 'Blocked Vendor Y' });
    await mockVendorService.setVendorStatus(blockedVendor.id, VENDOR_STATUS.BLOCKED);
    const draft = await mockRfqService.createRfq({
      title: 'Blocked vendor RFQ',
      reference: 'PR-2026-0045',
      vendorNames: [blockedVendor.name],
      items: rfqItems()
    });
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);

    await expect(mockRfqService.sendRfq(draft.id)).rejects.toThrow(/not approved vendors/);
  });

  it('sends when every invited vendor is Approved', async () => {
    /* Tata Steel Ltd + JSW Steel both resolve to Approved master records. */
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);

    const sent = await mockRfqService.sendRfq(draft.id);
    expect(sent.status).toBe(RFQ_STATUS.SENT);
  });

  it('timeline records the reject event alongside create / submit', async () => {
    const draft = await createDraftRfq();
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.rejectRfq(draft.id, 'Scope deferred');

    const timeline = await mockRfqService.getRfqTimeline(draft.id);
    const labels = timeline.map((entry) => entry.label);
    expect(labels).toEqual([
      `${draft.rfqNo} created`,
      `${draft.rfqNo} submitted for approval`,
      `${draft.rfqNo} rejected — approval not granted`
    ]);
    expect(timeline.at(-1).note).toBe('Scope deferred');
  });
});
