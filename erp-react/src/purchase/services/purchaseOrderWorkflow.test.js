/**
 * purchase/services/purchaseOrderWorkflow.test.js
 * -------------------------------------------------------------------
 * Unit tests for the Purchase Order workflow lifecycle.
 * -------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, PO_RELEASED_STAGES, PO_STATUS } from '../constants';
import { isPoPending } from '../utils/pendingStatus';
import { paymentTermRows, PAYMENT_TERMS_TYPE } from '../utils/paymentTerms';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity/audit actor names. */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

/** Create test PO fixtures. Called before every test. */
let PENDING_OPEN;
let APPROVED_OPEN;
let APPROVED_COMPLETED;
let ACKNOWLEDGED;

beforeEach(async () => {
  localStorage.clear();
  ordersStore.reset();
  setActor();

  const pending = await mockPurchaseOrderService.createOrder({
    title: 'Pending PO', vendor: 'Tata Steel Ltd', reference: 'PR-TEST-001',
    terms: '30 Days', items: [{ product: 'Item A', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
  });
  PENDING_OPEN = pending.id;

  const approved = await mockPurchaseOrderService.createOrder({
    title: 'Approved PO', vendor: 'JSW Steel', reference: 'PR-TEST-002',
    terms: '30 Days', items: [{ product: 'Item B', hsn: '7208', uom: 'Kg', qty: 200, rate: 30, gstRate: 18 }]
  });
  await mockPurchaseOrderService.approveOrder(approved.id);
  await mockPurchaseOrderService.releaseOrder(approved.id);
  APPROVED_OPEN = approved.id;

  const completed = await mockPurchaseOrderService.createOrder({
    title: 'Completed PO', vendor: 'Crompton Greaves', reference: 'PR-TEST-003',
    terms: '15 Days', items: [{ product: 'Item C', hsn: '8517', uom: 'Nos', qty: 3, rate: 6200, gstRate: 18 }]
  });
  await mockPurchaseOrderService.approveOrder(completed.id);
  await mockPurchaseOrderService.releaseOrder(completed.id);
  await mockPurchaseOrderService.setDeliveryStatus(completed.id, PO_STATUS.COMPLETED);
  APPROVED_COMPLETED = completed.id;

  const ack = await mockPurchaseOrderService.createOrder({
    title: 'Acknowledged PO', vendor: 'Dell Technologies', reference: 'PR-TEST-004',
    terms: '7 Days', items: [{ product: 'Item D', hsn: '8471', uom: 'Nos', qty: 12, rate: 7200, gstRate: 18 }]
  });
  await mockPurchaseOrderService.approveOrder(ack.id);
  await mockPurchaseOrderService.releaseOrder(ack.id);
  await mockPurchaseOrderService.acknowledgeOrder(ack.id);
  await mockPurchaseOrderService.setDeliveryStatus(ack.id, PO_STATUS.COMPLETED);
  ACKNOWLEDGED = ack.id;
});

/** Creates a brand-new Pending/Open PO. */
async function createFreshPo() {
  return mockPurchaseOrderService.createOrder({
    title: 'Test order from PR-2026-0099', vendor: 'Tata Steel Ltd',
    reference: 'PR-2026-0099', terms: '30 Days',
    items: [{ product: 'Test item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
  });
}

describe('PO lifecycle end-to-end', () => {
  it('walks create → approve/release → acknowledge → delivery, persisting every step', async () => {
    const created = await createFreshPo();

    expect(created.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(created.status).toBe(PO_STATUS.PENDING_APPROVAL);
    expect(created.activity.at(-1)).toMatchObject({ type: 'create', label: 'Purchase order created' });

    const approved = await mockPurchaseOrderService.approveOrder(created.id);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(approved.status).toBe(PO_STATUS.APPROVED);
    expect(approved.approvedAt).toBeTruthy();
    expect(approved.activity.at(-1)).toMatchObject({ type: 'approve', label: `${created.poNo} approved` });

    const released = await mockPurchaseOrderService.releaseOrder(created.id);
    expect(released.status).toBe(PO_STATUS.RELEASED);

    const acknowledged = await mockPurchaseOrderService.acknowledgeOrder(created.id);
    expect(acknowledged.acknowledged).toBe(true);
    expect(acknowledged.acknowledgedBy).toBe(created.vendor);
    expect(acknowledged.acknowledgedAt).toBeTruthy();

    const partial = await mockPurchaseOrderService.setDeliveryStatus(created.id, PO_STATUS.PARTIALLY_DELIVERED);
    expect(partial.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);

    const completed = await mockPurchaseOrderService.setDeliveryStatus(created.id, PO_STATUS.COMPLETED);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);

    const reloaded = await mockPurchaseOrderService.getOrder(created.id);
    expect(reloaded.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(reloaded.status).toBe(PO_STATUS.COMPLETED);
    expect(reloaded.acknowledged).toBe(true);
  });
});

describe('PO approval / release guards', () => {
  it('refuses to approve an already-approved PO', async () => {
    await expect(mockPurchaseOrderService.approveOrder(APPROVED_OPEN)).rejects.toThrow(
      /Cannot approve.*current stage is/
    );
  });

  it('refuses to approve a missing PO', async () => {
    await expect(mockPurchaseOrderService.approveOrder('PO-NOPE')).rejects.toThrow(/Purchase order not found/);
  });

  it('reject path: pending → rejected → re-approved, with history intact', async () => {
    const rejected = await mockPurchaseOrderService.rejectOrder(PENDING_OPEN);
    expect(rejected.approvalStatus).toBe(APPROVAL_STATUS.REJECTED);
    expect(rejected.rejectedAt).toBeTruthy();
    expect(rejected.activity.at(-1)).toMatchObject({
      type: 'reject', label: `${PENDING_OPEN} rejected during approval`
    });

    const reapproved = await mockPurchaseOrderService.approveOrder(PENDING_OPEN);
    expect(reapproved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(reapproved.approvedAt).toBeTruthy();

    const timeline = (await mockPurchaseOrderService.getOrder(PENDING_OPEN)).activity.map((entry) => entry.type);
    expect(timeline).toEqual(['create', 'reject', 'approve']);
  });

  it('refuses to reject a non-pending PO', async () => {
    await expect(mockPurchaseOrderService.rejectOrder(APPROVED_OPEN)).rejects.toThrow(
      /Only pending purchase orders can be rejected/
    );
  });
});

describe('PO delivery-status transitions', () => {
  it('refuses an invalid delivery status', async () => {
    await expect(mockPurchaseOrderService.setDeliveryStatus(APPROVED_OPEN, 'Shipped')).rejects.toThrow(
      /Invalid delivery status/
    );
  });

  it('refuses delivery on an unreleased (pending approval) PO', async () => {
    await expect(mockPurchaseOrderService.setDeliveryStatus(PENDING_OPEN, PO_STATUS.PARTIALLY_DELIVERED)).rejects.toThrow(
      /Cannot set delivery status/
    );
    expect((await mockPurchaseOrderService.getOrder(PENDING_OPEN)).status).toBe(PO_STATUS.PENDING_APPROVAL);
  });

  it('refuses to move a completed PO backwards', async () => {
    await expect(mockPurchaseOrderService.setDeliveryStatus(APPROVED_COMPLETED, PO_STATUS.IN_PROGRESS)).rejects.toThrow(
      /A completed purchase order cannot be moved back/
    );
    expect((await mockPurchaseOrderService.getOrder(APPROVED_COMPLETED)).status).toBe(PO_STATUS.COMPLETED);
  });

  it('allows forward Open → Partial → Completed on a released PO', async () => {
    const partial = await mockPurchaseOrderService.setDeliveryStatus(APPROVED_OPEN, PO_STATUS.PARTIALLY_DELIVERED);
    expect(partial.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    const completed = await mockPurchaseOrderService.setDeliveryStatus(APPROVED_OPEN, PO_STATUS.COMPLETED);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);
  });
});

describe('supplier acknowledgement persistence', () => {
  it('acknowledges a released PO and the flag persists across reads', async () => {
    const result = await mockPurchaseOrderService.acknowledgeOrder(APPROVED_OPEN);
    expect(result.acknowledged).toBe(true);
    expect(result.acknowledgedBy).toBe('JSW Steel');
    expect(result.acknowledgedAt).toBeTruthy();

    const reloaded = await mockPurchaseOrderService.getOrder(APPROVED_OPEN);
    expect(reloaded.acknowledged).toBe(true);
  });

  it('refuses acknowledgement of an unreleased (pending approval) PO', async () => {
    await expect(mockPurchaseOrderService.acknowledgeOrder(PENDING_OPEN)).rejects.toThrow(
      /Cannot acknowledge.*current stage is/
    );
  });

  it('refuses to acknowledge an already-acknowledged PO', async () => {
    await expect(mockPurchaseOrderService.acknowledgeOrder(ACKNOWLEDGED)).rejects.toThrow(
      /already acknowledged/
    );
  });
});

describe('PO stats', () => {
  it('reports stats from the created fixtures (approval buckets from actual status)', async () => {
    const stats = await mockPurchaseOrderService.getOrderStats();
    /* Fixtures: 1 pending approval, 1 released, 2 completed (1 of them
       acknowledged). Approval buckets come from the real stored status:
       pendingApproval = submitted + Pending decision (Draft excluded),
       approved = status Approved only (released/completed are in their
       own lifecycle buckets). */
    expect(stats.total).toBe(4);
    expect(stats.pendingApproval).toBe(1);
    expect(stats.approved).toBe(0);
    expect(stats[PO_STATUS.RELEASED]).toBe(1);
    expect(stats[PO_STATUS.COMPLETED]).toBe(2);
    expect(stats.rejected).toBe(0);
    expect(stats.acknowledged).toBe(1);
    expect(stats.value).toBeGreaterThan(0);
  });

  it('never counts Draft POs as pending approval', async () => {
    const draft = await mockPurchaseOrderService.createOrder({
      title: 'Draft PO', vendor: 'V', terms: '30 Days', status: PO_STATUS.DRAFT,
      items: [{ product: 'X', hsn: '1', uom: 'Nos', qty: 1, rate: 10, gstRate: 18 }]
    });
    expect(draft.status).toBe(PO_STATUS.DRAFT);
    expect(draft.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(isPoPending(draft)).toBe(false);
    const stats = await mockPurchaseOrderService.getOrderStats();
    expect(stats.pendingApproval).toBe(1); /* only the submitted fixture */
  });

  it('updates stats as the lifecycle progresses', async () => {
    await mockPurchaseOrderService.rejectOrder(PENDING_OPEN);
    const stats = await mockPurchaseOrderService.getOrderStats();
    expect(stats.pendingApproval).toBe(0);
    expect(stats.rejected).toBe(1);
  });
});

describe('PO edit workflow (Edit button → updateOrder)', () => {
  it('edits a Pending Approval PO: fields + items update, totals recompute, workflow untouched', async () => {
    const created = await createFreshPo();
    const original = await mockPurchaseOrderService.getOrder(created.id);
    const newItems = [
      { product: 'Edited item', hsn: '7208', uom: 'Kg', qty: 150, rate: 30, gstRate: 18 }
    ];

    /* Mirrors the edit form submit: the full record with the corrected
       fields, still Pending Approval. */
    const updated = await mockPurchaseOrderService.updateOrder(created.id, {
      title: 'Corrected PO title',
      vendor: 'JSW Steel',
      items: newItems,
      status: PO_STATUS.PENDING_APPROVAL
    });

    expect(updated.title).toBe('Corrected PO title');
    expect(updated.vendor).toBe('JSW Steel');
    expect(updated.items).toEqual(newItems);
    /* Status / approval lane and identity are preserved. */
    expect(updated.status).toBe(PO_STATUS.PENDING_APPROVAL);
    expect(updated.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(updated.poNo).toBe(original.poNo);
    /* Totals are recomputed from the edited line items. */
    expect(updated.totals.total).toBe(updated.amount);
    expect(updated.amount).not.toBe(original.amount);
    /* Approval history untouched. */
    expect(updated.activity).toEqual(original.activity);

    /* The detail page reloads from the same store and sees the edit. */
    const reloaded = await mockPurchaseOrderService.getOrder(created.id);
    expect(reloaded.title).toBe('Corrected PO title');
    expect(reloaded.items).toEqual(newItems);
    expect(reloaded.status).toBe(PO_STATUS.PENDING_APPROVAL);
  });

  it('edits a Draft PO: stays Draft, then moves to Pending Approval on submit', async () => {
    const draft = await mockPurchaseOrderService.createOrder({
      title: 'Test order from PR-2026-0099', vendor: 'Tata Steel Ltd',
      reference: 'PR-2026-0099', terms: '30 Days', status: PO_STATUS.DRAFT,
      items: [{ product: 'Test item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
    expect(draft.status).toBe(PO_STATUS.DRAFT);

    /* "Save Draft" from the edit form keeps the document a Draft. */
    const stillDraft = await mockPurchaseOrderService.updateOrder(draft.id, {
      title: 'Draft tweak',
      status: PO_STATUS.DRAFT
    });
    expect(stillDraft.status).toBe(PO_STATUS.DRAFT);
    expect(stillDraft.title).toBe('Draft tweak');

    /* "Update Purchase Order" from the edit form submits it. */
    const submitted = await mockPurchaseOrderService.updateOrder(draft.id, {
      title: 'Draft tweak',
      status: PO_STATUS.PENDING_APPROVAL,
      approvalStatus: APPROVAL_STATUS.PENDING
    });
    expect(submitted.status).toBe(PO_STATUS.PENDING_APPROVAL);
    expect(submitted.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
  });

  it('editing a rejected Pending Approval PO re-enters the approval queue with history intact', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.rejectOrder(created.id);
    const rejected = await mockPurchaseOrderService.getOrder(created.id);
    expect(rejected.approvalStatus).toBe(APPROVAL_STATUS.REJECTED);

    const edited = await mockPurchaseOrderService.updateOrder(created.id, {
      title: 'Fixed after rejection',
      items: [{ product: 'Item A', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }],
      status: PO_STATUS.PENDING_APPROVAL
    });
    expect(edited.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    /* The rejection stays on the record — approval history is not erased. */
    expect(edited.rejectedAt).toBeTruthy();
    expect(edited.activity.map((entry) => entry.type)).toEqual(['create', 'reject']);

    const approved = await mockPurchaseOrderService.approveOrder(created.id);
    expect(approved.status).toBe(PO_STATUS.APPROVED);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
  });

  it('refuses edits on frozen (approved / released / completed) POs but allows audit patches', async () => {
    await expect(
      mockPurchaseOrderService.updateOrder(APPROVED_OPEN, { title: 'nope', status: PO_STATUS.APPROVED })
    ).rejects.toThrow(/only Draft or Pending Approval purchase orders can be edited/);

    await expect(
      mockPurchaseOrderService.updateOrder(APPROVED_COMPLETED, {
        items: [{ product: 'Hacked', hsn: 'x', uom: 'Nos', qty: 1, rate: 1, gstRate: 18 }]
      })
    ).rejects.toThrow(/only Draft or Pending Approval purchase orders can be edited/);

    /* Activity-only audit patches still work on any status. */
    const audit = await mockPurchaseOrderService.updateOrder(APPROVED_OPEN, {
      activity: [{ type: 'note', label: 'Audit note', actor: 'Test Buyer', timestamp: new Date().toISOString() }]
    });
    expect(audit.activity).toHaveLength(1);
    expect(audit.status).toBe(PO_STATUS.RELEASED);
  });

  it('never lets an edit jump or regress the workflow stage', async () => {
    const pending = await createFreshPo();
    await expect(
      mockPurchaseOrderService.updateOrder(pending.id, { status: PO_STATUS.APPROVED })
    ).rejects.toThrow(/Cannot move .* via edit/);
    await expect(
      mockPurchaseOrderService.updateOrder(pending.id, { status: PO_STATUS.DRAFT })
    ).rejects.toThrow(/Cannot move .* via edit/);
    expect((await mockPurchaseOrderService.getOrder(pending.id)).status).toBe(PO_STATUS.PENDING_APPROVAL);
  });
});

describe('PO print page — payment terms rendering data', () => {
  it('printPreview delivers structured terms that map to safe display rows (no raw object)', async () => {
    /* A finalized PO: paymentTerms is the normalized structured object —
       the exact value that used to crash the print template when passed
       straight into JSX. */
    const created = await mockPurchaseOrderService.createOrder({
      title: 'Print terms PO',
      vendor: 'Tata Steel Ltd',
      reference: 'PR-PRINT-001',
      terms: '30 Days',
      paymentTerms: {
        type: PAYMENT_TERMS_TYPE.PARTIAL_ADVANCE,
        advancePercentage: 30,
        advanceTrigger: 'Against PO / Order Confirmation'
      },
      items: [{ product: 'Print item', hsn: '7208', uom: 'Kg', qty: 10, rate: 25, gstRate: 18 }]
    });
    const preview = await mockPurchaseOrderService.printPreview(created.id);

    const terms = preview.record.paymentTerms;
    expect(terms).toEqual(expect.objectContaining({
      type: PAYMENT_TERMS_TYPE.PARTIAL_ADVANCE,
      advancePercentage: 30,
      balancePercentage: 70
    }));

    /* The template maps the object through paymentTermRows() — every
       row is renderable text or a milestone list, never the object. */
    const rows = paymentTermRows(terms);
    const labels = rows.map((row) => row.label);
    expect(labels).toEqual(expect.arrayContaining(['Payment Type', 'Advance', 'Balance']));
    rows.forEach((row) => {
      if (row.milestones) {
        expect(Array.isArray(row.milestones)).toBe(true);
      } else {
        expect(typeof row.value).toBe('string');
      }
    });
  });

  it('legacy string payment terms on a stored PO stay renderable', async () => {
    /* Legacy records predate the structured normalization — their
       paymentTerms field may still be a plain string. */
    const records = ordersStore.all;
    records.push({
      id: 'LEGACY-TERMS-001',
      poNo: 'PO-LEGACY-TERMS-001',
      title: 'Legacy terms PO',
      vendor: 'Vendor Ltd',
      reference: 'PR-LEGACY-001',
      terms: '30 Days',
      paymentTerms: '45 Days Credit',
      status: PO_STATUS.PENDING_APPROVAL,
      approvalStatus: APPROVAL_STATUS.PENDING,
      orderDate: '2026-08-01',
      currency: 'INR',
      amount: 0,
      totals: {},
      items: [],
      activity: []
    });
    ordersStore.persist(records);

    const preview = await mockPurchaseOrderService.printPreview('LEGACY-TERMS-001');
    const rows = paymentTermRows(preview.record.paymentTerms);
    expect(rows).toEqual([{ key: 'terms', label: 'Payment Terms', value: '45 Days Credit' }]);
  });
});

describe('PO workflow after supplier acknowledgement — Supplier Acknowledged → … → Closed', () => {
  /** Recreates the PO-2026-4201-style record: created, approved,
   *  released and acknowledged, then exercises every remaining step. */
  async function acknowledgedPo() {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'CRCA coils for stamping line',
      vendor: 'JSW Steel',
      reference: 'PR-2026-0038',
      rfqNo: 'RFQ-2026-0001',
      quotationNo: 'QTN-2026-0112',
      terms: '30 Days',
      items: [{ product: 'CRCA coil 1.2mm', hsn: '7209', uom: 'Kg', qty: 15000, rate: 18, gstRate: 18 }]
    });
    const approved = await mockPurchaseOrderService.approveOrder(po.id);
    expect(approved.status).toBe(PO_STATUS.APPROVED);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

    const released = await mockPurchaseOrderService.releaseOrder(po.id);
    expect(released.status).toBe(PO_STATUS.RELEASED);
    /* Release mirrors status onto the stage descriptors + records ack
       as pending — single source (status) written together. */
    expect(released.releaseStage).toBe('Released');
    expect(released.acknowledgementStage).toBe('Pending');
    expect(released.releasedAt).toBeTruthy();

    const acked = await mockPurchaseOrderService.acknowledgeOrder(po.id);
    expect(acked.status).toBe(PO_STATUS.SUPPLIER_ACKNOWLEDGED);
    expect(acked.acknowledged).toBe(true);
    expect(acked.acknowledgedAt).toBeTruthy();
    expect(acked.acknowledgedDate).toBe(acked.acknowledgedAt.slice(0, 10));
    expect(acked.acknowledgementStage).toBe('Acknowledged');
    expect(acked.releaseStage).toBe('Released');
    return { po, acked };
  }

  it('runs Supplier Acknowledged → In Progress → Partially Delivered → Completed → Closed', async () => {
    const { po } = await acknowledgedPo();

    const started = await mockPurchaseOrderService.startOrder(po.id);
    expect(started.status).toBe(PO_STATUS.IN_PROGRESS);
    expect(started.startedAt).toBeTruthy();

    const partial = await mockPurchaseOrderService.markPartiallyDelivered(po.id, {
      receivedItems: [{ product: 'CRCA coil 1.2mm', receivedQty: 5000 }]
    });
    expect(partial.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(partial.partiallyDeliveredAt).toBeTruthy();

    const completed = await mockPurchaseOrderService.completeOrder(po.id, {
      receivedItems: [{ product: 'CRCA coil 1.2mm', receivedQty: 15000 }]
    });
    expect(completed.status).toBe(PO_STATUS.COMPLETED);
    expect(completed.completedAt).toBeTruthy();

    const closed = await mockPurchaseOrderService.closeOrder(po.id);
    expect(closed.status).toBe(PO_STATUS.CLOSED);
    expect(closed.closedAt).toBeTruthy();

    /* Every status change left a structured audit entry. */
    const reloaded = await mockPurchaseOrderService.getOrder(po.id);
    const types = reloaded.activity.map((entry) => entry.type);
    expect(types).toEqual(['create', 'approve', 'release', 'acknowledge', 'start', 'delivery', 'complete', 'close']);
    const transitions = reloaded.activity.filter((entry) => entry.previousStatus !== undefined);
    expect(transitions).toHaveLength(7);
    expect(transitions[0]).toMatchObject({
      poNo: po.poNo,
      previousStatus: PO_STATUS.PENDING_APPROVAL,
      newStatus: PO_STATUS.APPROVED,
      action: 'approve'
    });
    expect(transitions[3]).toMatchObject({
      poNo: po.poNo,
      previousStatus: PO_STATUS.SUPPLIER_ACKNOWLEDGED,
      newStatus: PO_STATUS.IN_PROGRESS,
      action: 'start'
    });
    expect(transitions[4]).toMatchObject({ previousStatus: PO_STATUS.IN_PROGRESS, newStatus: PO_STATUS.PARTIALLY_DELIVERED, action: 'delivery' });
    expect(transitions[5]).toMatchObject({ previousStatus: PO_STATUS.PARTIALLY_DELIVERED, newStatus: PO_STATUS.COMPLETED, action: 'complete' });
    transitions.forEach((entry) => {
      expect(entry.actor).toBeTruthy();
      expect(entry.timestamp).toBeTruthy();
    });

    /* Stats — the lifecycle memberships mirror the store. */
    const stats = await mockPurchaseOrderService.getOrderStats();
    expect(stats[PO_STATUS.IN_PROGRESS]).toBe(0);
    expect(stats[PO_STATUS.COMPLETED]).toBe(2); /* the 2 completed fixtures — this PO is now Closed */
    expect(stats[PO_STATUS.CLOSED]).toBe(1);
  });

  it('an acknowledged PO belongs to the released workspace; Approved ones do not', async () => {
    const { po } = await acknowledgedPo();

    const unReleased = await mockPurchaseOrderService.createOrder({
      title: 'Not yet sent', vendor: 'V', terms: '30 Days',
      items: [{ product: 'X', hsn: '1', uom: 'Nos', qty: 1, rate: 10, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(unReleased.id);

    const all = await mockPurchaseOrderService.getOrders({ page: 1, pageSize: 500 });
    const releasedRows = all.data.filter((order) => PO_RELEASED_STAGES.includes(order.status));
    const ids = releasedRows.map((order) => order.id);
    /* Acknowledged PO is in the workspace; the approved-but-never-sent
       PO is NOT (it was never released to the supplier). */
    expect(ids).toContain(po.id);
    expect(ids).not.toContain(unReleased.id);
  });

  it('persists the workflow state across reads (browser refresh equivalent)', async () => {
    const { po } = await acknowledgedPo();
    await mockPurchaseOrderService.startOrder(po.id);

    /* A fresh read (what the detail page performs on mount / after a
       browser refresh) returns the SAME persisted state — the store is
       localStorage-backed; nothing is held only in page state. */
    const reloaded = await mockPurchaseOrderService.getOrder(po.id);
    expect(reloaded.status).toBe(PO_STATUS.IN_PROGRESS);
    expect(reloaded.startedAt).toBeTruthy();
    expect(reloaded.acknowledged).toBe(true);

    /* The PO Approval console must never show this PO (it is past the
       approval gate and not waiting for a decision). */
    expect(isPoPending(reloaded)).toBe(false);
  });
});
