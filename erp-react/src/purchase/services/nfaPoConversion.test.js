/**
 * purchase/services/nfaPoConversion.test.js
 * ------------------------------------------------------------------
 * Regression tests for the NFA → Purchase Order conversion.
 *
 * BUG (fixed): once an Approval Workflow (NFA) was fully approved, the
 * "Create Purchase Order" action opened the PO create form with NO
 * context, so a PO created through it ended up with empty / default
 * line items. The fix derives the PO pre-fill from the SAME shared
 * stores the note was raised from via nfaService.buildPoPrefill() —
 * a complete continuation of the approved procurement record:
 *
 *   PR → RFQ → Quotation → negotiation → Technical Evaluation →
 *   Supplier Selection → NFA Approval
 *
 * Tests:
 *   1. Approved NFA → pre-fill carries every RFQ line with the
 *      supplier's rates, quantities, tax, spec, category, UOM/HSN
 *   2. The originating PR's logistics / commercial headers (GST type,
 *      transport mode, warehouse, cost center, location, delivery
 *      address, incoterm) cascade onto the PO pre-fill
 *   3. Approval context (NFA purpose / justification, supplier
 *      selection rationale, quotation remarks) and quotation freight /
 *      charges / warranty flow into the pre-fill; nothing upstream is
 *      replaced by a blank
 *   4. Submitting the pre-fill through purchaseOrderService.createOrder
 *      produces a PO whose items / vendor / document chain / totals are
 *      populated (never blank)
 *   5. buildPoPrefill refuses notes that are not fully approved
 *   6. buildPoPrefill refuses split awards (per-supplier PO raise)
 *   7. buildPoPrefill refuses an approved note whose supplier has no
 *      quotation (cannot derive line items)
 *   8. Once the award/selection has a live PO, a duplicate conversion is
 *      refused (buildPoPrefill) and preparePoConversion routes the UI to
 *      the existing PO instead of a second create form
 *   9. A cancelled PO frees the chain — the award may be converted again
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NFA_STATUS, PO_STATUS } from '../constants';
import { evaluationService, evaluationsStore } from './evaluation';
import { nfaService, nfasStore } from './nfa';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { mockRequisitionService, requisitionsStore } from './requisition';
import { mockVendorService, vendorsStore } from './vendor';
import { calcDocumentTotals } from '../utils/purchase';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity / actor names. */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';

function rfqItems() {
  return [
    { product: 'Hydraulic hose DN19', category: 'Spares', itemCode: 'PR-2026-0042-01', hsn: '4009', uom: 'Meter', qty: 200, rate: 285, expectedRate: 285, specification: 'EN 853 2SN DN19', requiredDate: '2026-09-15' },
    { product: 'Quick coupling G1/2', category: 'Spares', itemCode: 'PR-2026-0042-02', hsn: '7307', uom: 'Nos', qty: 40, rate: 430, expectedRate: 430, specification: 'ISO 7241-1 B series', requiredDate: '2026-09-15' }
  ];
}

/** Creates the originating PR with logistics / commercial headers. */
async function createPr() {
  return mockRequisitionService.createRequisition({
    title: 'Hydraulic hoses and couplings for maintenance',
    department: 'Maintenance',
    project: 'General Operations',
    requester: 'Rohan Desai',
    buyer: 'Amit Verma',
    priority: 'High',
    expectedDate: '2026-10-01',
    currency: 'INR',
    gstType: 'Inter-State (IGST)',
    incoterm: 'FOB',
    transportMode: 'Road',
    warehouse: 'Main Store',
    costCenter: 'CC-1002 Maintenance',
    location: 'Pune Plant',
    deliveryAddress: 'Plant 1 - Main Gate, Pune',
    notes: 'Maintenance critical - confirm lead time before award.',
    attachments: [
      { id: 'pr-att-001', name: 'PR_Requirement.pdf', type: 'pdf', size: 120000 }
    ],
    items: rfqItems().map((item) => ({
      product: item.product, specification: item.specification, hsn: item.hsn,
      uom: item.uom, qty: item.qty, rate: item.rate, gstRate: 18
    }))
  });
}

/** Creates a fresh single-vendor RFQ and walks it to Sent. */
async function createSentRfq(reference) {
  const draft = await mockRfqService.createRfq({
    title: 'Hydraulic hoses and couplings',
    reference,
    department: 'Maintenance',
    project: 'General Operations',
    requester: 'Rohan Desai',
    buyer: 'Amit Verma',
    priority: 'High',
    dueDate: '2026-09-10',
    currency: 'INR',
    vendorNames: [VENDOR_A],
    attachments: [
      { id: 'rfq-att-001', name: 'Hose_Spec_EN853.pdf', type: 'pdf', size: 80000 }
    ],
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  await mockRfqService.sendRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

function quotationFor(rfq, vendor, overrides = {}) {
  return {
    rfqNo: rfq.rfqNo,
    vendor,
    submittedOn: '2026-08-15',
    validUntil: '2026-08-31',
    currency: rfq.currency,
    discount: overrides.discount ?? 2,
    charges: overrides.charges ?? 10,
    freight: overrides.freight ?? 150,
    insurance: overrides.insurance ?? 50,
    leadTime: 15,
    delivery: 12,
    paymentTerms: '30 Days',
    warranty: '12 Months',
    notes: 'Rate valid for 30 days from quotation date.',
    attachments: [
      { id: 'qt-att-001', name: 'Quotation_Offer.pdf', type: 'pdf', size: 204800 }
    ],
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

/** Records an Agreed negotiation round (no per-line rates). */
async function agreeNegotiation(rfqId, vendor = VENDOR_A) {
  const rfq = await mockRfqService.getRfq(rfqId);
  const quote = quotationsStore.all.find((entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === vendor);
  await evaluationService.recordNegotiation(rfqId, vendor, {
    amount: quote.total,
    stage: 'Agreed',
    note: 'Rate confirmed'
  });
}

/**
 * Full setup: PR → RFQ → quotation → negotiation → supplier selection →
 * qualified technical evaluation → NFA raised, submitted and fully
 * approved. Returns the approved note, linked RFQ and originating PR.
 */
async function setupApprovedNfa() {
  const pr = await createPr();
  const rfq = await createSentRfq(pr.prNo);
  await mockRfqService.saveQuotation(quotationFor(rfq, VENDOR_A));
  await mockRfqService.startEvaluation(rfq.id);
  await agreeNegotiation(rfq.id, VENDOR_A);
  await evaluationService.completeSupplierSelection(rfq.id, VENDOR_A, {
    rationale: 'Lowest evaluated total after negotiation with 12-month warranty'
  });
  await evaluationService.saveVendorEvaluation(rfq.id, VENDOR_A, {
    scores: { compliance: 85, quality: 80, delivery: 75, postPurchase: 70 },
    remarks: ''
  });
  await evaluationService.setVendorDecision(rfq.id, VENDOR_A, 'Qualified', { remarks: 'Meets threshold' });
  await evaluationService.completeTechnicalEvaluation(rfq.id);

  const note = await nfaService.createNfa({
    rfqId: rfq.id,
    purpose: 'Approval to place the PO for hydraulic hoses',
    justification: 'Single qualified vendor at the negotiated rate'
  });
  let current = await nfaService.submitNfa(note.id);
  while (current.currentStage) {
    current = await nfaService.approveStage(current.id, { stage: current.currentStage });
  }
  expect(current.status).toBe(NFA_STATUS.APPROVED);
  return { pr, rfq: await mockRfqService.getRfq(rfq.id), note: current };
}

/* ================================================================ */

describe('NFA → Purchase Order conversion', () => {
  beforeEach(async () => {
    localStorage.clear();
    evaluationsStore.reset();
    nfasStore.reset();
    rfqsStore.reset();
    quotationsStore.reset();
    ordersStore.reset();
    requisitionsStore.reset();
    vendorsStore.reset();
    setActor();
    for (const name of [VENDOR_A, VENDOR_B]) {
      const v = await mockVendorService.createVendor({ name, status: 'Approved' });
      await mockVendorService.setVendorStatus(v.id, 'Approved');
    }
  });

  it('derives a complete PO pre-fill from the RFQ items + approved quotation', async () => {
    const { rfq, note } = await setupApprovedNfa();
    const quote = quotationsStore.all.find((q) => q.rfqNo === rfq.rfqNo && q.vendor === VENDOR_A);

    const prefill = await nfaService.buildPoPrefill(note.id);

    /* Header / document chain carry over. */
    expect(prefill.vendor).toBe(VENDOR_A);
    expect(prefill.rfqNo).toBe(rfq.rfqNo);
    expect(prefill.quotationNo).toBe(quote.quotationNo);
    expect(prefill.currency).toBe('INR');
    expect(prefill.expectedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(prefill.awardedValue).toBe(note.amount);

    /* Line items are never blank — item code, product, spec, category,
       HSN, UOM, qty, unit price and tax all come from the RFQ →
       quotation chain. */
    expect(prefill.items).toHaveLength(2);
    expect(prefill.items[0]).toMatchObject({
      itemCode: 'PR-2026-0042-01',
      product: 'Hydraulic hose DN19',
      specification: 'EN 853 2SN DN19',
      category: 'Spares',
      hsn: '4009',
      uom: 'Meter',
      qty: 200,
      rate: 285,
      gstRate: 18
    });
    expect(prefill.items[1]).toMatchObject({
      itemCode: 'PR-2026-0042-02',
      product: 'Quick coupling G1/2',
      specification: 'ISO 7241-1 B series',
      category: 'Spares',
      hsn: '7307',
      uom: 'Nos',
      qty: 40,
      rate: 430,
      gstRate: 18
    });
    for (const item of prefill.items) {
      expect(String(item.product || '').trim()).not.toBe('');
      expect(Number(item.qty)).toBeGreaterThan(0);
      expect(Number(item.rate)).toBeGreaterThan(0);
    }
    const totals = calcDocumentTotals(prefill.items, prefill.discount, prefill.charges);
    expect(totals.total).toBeGreaterThan(0);
  });

  it('cascades the originating PR logistics/commercial headers onto the pre-fill', async () => {
    const { pr, note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);

    /* PR reference preserved on the PO. */
    expect(prefill.reference).toBe(pr.prNo);
    expect(prefill.prNo).toBe(pr.prNo);

    /* Logistics / commercial headers the sourcing flow never re-captures
       come from the PR — never blanked. */
    expect(prefill.gstType).toBe('Inter-State (IGST)');
    expect(prefill.transportMode).toBe('Road');
    expect(prefill.warehouse).toBe('Main Store');
    expect(prefill.costCenter).toBe('CC-1002 Maintenance');
    expect(prefill.location).toBe('Pune Plant');
    expect(prefill.deliveryAddress).toBe('Plant 1 - Main Gate, Pune');
    expect(prefill.incoterm).toBe('FOB');
  });

  it('carries approval context, quotation commercial terms and attachments — nothing lost to blanks', async () => {
    const { note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);

    /* Approval context flows into the private notes. */
    expect(prefill.internalNotes).toContain(note.nfaNo);
    expect(prefill.internalNotes).toContain(note.purpose);
    expect(prefill.internalNotes).toContain(note.justification);
    expect(prefill.internalNotes).toContain('Lowest evaluated total after negotiation');

    /* Commercial terms from the quotation. */
    expect(prefill.terms).toBe('30 Days');
    expect(prefill.warranty).toBe('12 Months');
    expect(prefill.freight).toBe(150);
    expect(prefill.insurance).toBe(50);
    /* Charges fold in freight + insurance exactly like award-raised POs. */
    expect(prefill.charges).toBe(10 + 150 + 50);
    expect(prefill.vendorNotes).toBe('Rate valid for 30 days from quotation date.');
    expect(prefill.notes).toContain('Maintenance critical');

    /* No finalized structured payment terms → null (not a fabricated
       default). Delivery terms ride through from the RFQ commercial
       terms — upstream values are never blanked. */
    expect(prefill.paymentTerms).toBeNull();
    expect(prefill.deliveryTerms).toBe('30 Days');
    expect(prefill.sourceLabel).toBe(`approved NFA ${note.nfaNo}`);

    /* Relevant attachments (PR + RFQ + quotation) are deduplicated. */
    const attachmentNames = prefill.attachments.map((a) => a.name).sort();
    expect(attachmentNames).toEqual([
      'Hose_Spec_EN853.pdf',
      'PR_Requirement.pdf',
      'Quotation_Offer.pdf'
    ]);
  });

  it('creating the PO from the pre-fill persists real line items, terms and totals', async () => {
    const { rfq, note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);

    /* The PO create form submits its initialData through
       purchaseOrderService.createOrder — simulate that submission. */
    const created = await mockPurchaseOrderService.createOrder({
      ...prefill,
      status: PO_STATUS.PENDING_APPROVAL
    });

    expect(created.items).toHaveLength(2);
    expect(created.items[0]).toMatchObject({ product: 'Hydraulic hose DN19', qty: 200, rate: 285, gstRate: 18 });
    expect(created.items[1]).toMatchObject({ product: 'Quick coupling G1/2', qty: 40, rate: 430, gstRate: 18 });
    expect(created.vendor).toBe(VENDOR_A);
    expect(created.rfqNo).toBe(rfq.rfqNo);
    expect(created.quotationNo).toBe(prefill.quotationNo);
    expect(created.gstType).toBe('Inter-State (IGST)');
    expect(created.freight).toBe(150);
    expect(created.insurance).toBe(50);
    expect(created.warranty).toBe('12 Months');
    expect(created.amount).toBeGreaterThan(0);

    const totals = calcDocumentTotals(prefill.items, prefill.discount, prefill.charges);
    expect(created.amount).toBe(totals.total);
    expect(created.amount).toBe(created.totals.total);

    /* The stored PO record (what every page reads) carries the items. */
    const stored = ordersStore.all.find((o) => o.id === created.id);
    expect(stored.items).toHaveLength(2);
  });

  it('refuses to convert a note that is not fully approved', async () => {
    const { note } = await setupApprovedNfa();

    const index = nfasStore.all.findIndex((entry) => entry.id === note.id);
    nfasStore.all[index] = { ...nfasStore.all[index], status: NFA_STATUS.DRAFT };
    nfasStore.persist(nfasStore.all);

    await expect(nfaService.buildPoPrefill(note.id)).rejects.toThrow(
      /Only fully approved notes can be converted to a purchase order/
    );
  });

  it('refuses to convert a split award through the single-PO pre-fill', async () => {
    const { note } = await setupApprovedNfa();

    const index = nfasStore.all.findIndex((entry) => entry.id === note.id);
    nfasStore.all[index] = {
      ...nfasStore.all[index],
      suppliers: [VENDOR_A, VENDOR_B],
      split: true
    };
    nfasStore.persist(nfasStore.all);

    await expect(nfaService.buildPoPrefill(note.id)).rejects.toThrow(/Split award/);
  });

  it('refuses to convert when the approved supplier has no quotation', async () => {
    const { note } = await setupApprovedNfa();

    quotationsStore.persist(quotationsStore.all.filter((q) => q.vendor !== VENDOR_A));

    await expect(nfaService.buildPoPrefill(note.id)).rejects.toThrow(/No quotation found/);
  });

  it('refuses a duplicate conversion once the award already has a PO', async () => {
    const { rfq, note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);
    const first = await mockPurchaseOrderService.createOrder({
      ...prefill,
      status: PO_STATUS.PENDING_APPROVAL
    });

    /* Second conversion of the same award/selection must not produce a
       second PO — the service refuses it and names the existing PO. */
    await expect(nfaService.buildPoPrefill(note.id)).rejects.toThrow(
      new RegExp(`already exists for ${rfq.rfqNo}`)
    );

    /* The PO store still holds exactly one PO for the RFQ + supplier. */
    const matches = ordersStore.all.filter(
      (po) => po.rfqNo === rfq.rfqNo && po.vendor === VENDOR_A
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].poNo).toBe(first.poNo);
  });

  it('preparePoConversion returns the existing PO instead of a new pre-fill', async () => {
    const { rfq, note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);
    const first = await mockPurchaseOrderService.createOrder({
      ...prefill,
      status: PO_STATUS.PENDING_APPROVAL
    });

    /* The UI conversion router must tell the caller to OPEN the existing
       PO — never hand out a pre-fill that creates a duplicate. */
    const result = await nfaService.preparePoConversion(note.id);
    expect(result.existing).toBeTruthy();
    expect(result.existing.poNo).toBe(first.poNo);
    expect(result.prefill).toBeUndefined();

    /* RFQ-raise parity: the linked RFQ still resolves its PO. */
    const enriched = await mockRfqService.getRfq(rfq.id);
    expect(enriched.poNo).toBe(first.poNo);
  });

  it('a cancelled PO does not block a fresh conversion of the award', async () => {
    const { note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);
    const first = await mockPurchaseOrderService.createOrder({
      ...prefill,
      status: PO_STATUS.PENDING_APPROVAL
    });
    /* The prior PO was cancelled — the chain is free again, so a fresh
       conversion is permitted (no duplicate live PO exists). */
    await mockPurchaseOrderService.cancelOrder(first.id);

    const result = await nfaService.preparePoConversion(note.id);
    expect(result.existing).toBeUndefined();
    expect(result.prefill).toBeTruthy();
    expect(result.prefill.rfqNo).toBe(prefill.rfqNo);
  });

  it('records the raised PO on the NFA so its detail shows the link', async () => {
    const { note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);

    /* The create-form payload carries the source note for the PO record. */
    expect(prefill.nfaId).toBe(note.id);
    expect(prefill.nfaNo).toBe(note.nfaNo);

    /* The PO create form submits the prefill through createOrder... */
    const created = await mockPurchaseOrderService.createOrder({
      ...prefill,
      status: PO_STATUS.PENDING_APPROVAL
    });
    const storedPo = ordersStore.all.find((o) => o.id === created.id);
    expect(storedPo.nfaId).toBe(note.id);
    expect(storedPo.nfaNo).toBe(note.nfaNo);

    /* ...then links the note back (the form calls recordPoRaised). */
    const linked = await nfaService.recordPoRaised({ nfaId: note.id, poNo: created.poNo });
    expect(linked.poNo).toBe(created.poNo);
    expect(linked.poNos).toContain(created.poNo);
    expect(linked.activity.some((a) => a.type === 'po' && a.label.includes(created.poNo))).toBe(true);

    /* The NFA detail (getNfa) carries the raised PO number. */
    const detail = await nfaService.getNfa(note.id);
    expect(detail.poNo).toBe(created.poNo);

    /* Future conversions short-circuit to the existing PO — no prefill,
       no second record. */
    const result = await nfaService.preparePoConversion(note.id);
    expect(result.existing).toBeTruthy();
    expect(result.existing.poNo).toBe(created.poNo);
    expect(result.prefill).toBeUndefined();
    const matches = ordersStore.all.filter(
      (po) => po.rfqNo === note.rfqNo && po.vendor === VENDOR_A && po.status !== 'Cancelled'
    );
    expect(matches).toHaveLength(1);
  });

  it('recordPoRaised is idempotent and ignores unknown / unapproved notes', async () => {
    const { note } = await setupApprovedNfa();
    const prefill = await nfaService.buildPoPrefill(note.id);
    const created = await mockPurchaseOrderService.createOrder({
      ...prefill,
      status: PO_STATUS.PENDING_APPROVAL
    });

    /* Unknown note → null, nothing written. */
    expect(await nfaService.recordPoRaised({ nfaId: 'NFA-NOPE', poNo: created.poNo })).toBeNull();

    /* An unapproved note is never linked (record stays untouched). */
    const index = nfasStore.all.findIndex((entry) => entry.id === note.id);
    nfasStore.all[index] = { ...nfasStore.all[index], status: NFA_STATUS.DRAFT };
    nfasStore.persist(nfasStore.all);
    expect(await nfaService.recordPoRaised({ nfaId: note.id, poNo: created.poNo })).toBeNull();
    expect(nfasStore.all[index].poNo).toBeNull();

    /* Re-approve and link — linking twice stays idempotent (one PO, one
       activity entry). */
    nfasStore.all[index] = { ...nfasStore.all[index], status: NFA_STATUS.APPROVED };
    nfasStore.persist(nfasStore.all);
    await nfaService.recordPoRaised({ nfaId: note.id, poNo: created.poNo });
    const twice = await nfaService.recordPoRaised({ nfaId: note.id, poNo: created.poNo });
    expect(twice.poNos).toEqual([created.poNo]);
    expect(twice.activity.filter((a) => a.type === 'po')).toHaveLength(1);
  });
});
