/**
 * purchase/services/prRfqWorkflow.test.js
 * ------------------------------------------------------------------
 * Unit tests for the Create-RFQ-from-PR lifecycle invariants:
 *
 *   1. Ready-for-RFQ PR → Converted to RFQ
 *   2. Duplicate prevention (one PR can never produce two RFQs)
 *   3. PO Raised only after PO creation
 *
 * All tests are self-contained — they create their own fixtures and
 * do NOT depend on any seed/demo data.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, PR_RFQ_ELIGIBLE, PR_STATUS, REVIEW_STATUS, RFQ_STATUS } from '../constants';
import { mockRequisitionService, requisitionsStore } from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import { vendorsStore } from './vendor';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity/audit actor names. */
function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

function setAdmin() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'QA Approver', email: 'qa@test.com', role: 'ADMIN' }));
}

beforeEach(() => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  setActor();
});

/* ---- Helper: create a PR and advance it to Ready for RFQ ---- */
async function createReadyForRfqPr() {
  setAdmin();
  const pr = await mockRequisitionService.createRequisition({
    title: 'Ready PR', department: 'Production', requester: 'QA Buyer',
    priority: 'High', expectedDate: '2026-09-30', currency: 'INR',
    items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 5, rate: 100, expectedRate: 100 }]
  });
  await mockRequisitionService.submitRequisition(pr.id);
  await mockRequisitionService.approveRequisition(pr.id);
  await mockRequisitionService.completeTechnicalReview(pr.id);
  return mockRequisitionService.getRequisition(pr.id);
}

/* ---- Helper: create a PR in Draft state ---- */
async function createDraftPr() {
  return mockRequisitionService.createRequisition({
    title: 'Draft PR', department: 'IT', requester: 'Other User',
    priority: 'Medium', expectedDate: '2026-10-01', currency: 'INR',
    items: [{ product: 'Laptop', hsn: '8471', uom: 'Nos', qty: 2, rate: 50000, expectedRate: 50000 }]
  });
}

/* ---- Helper: create a rejected PR ---- */
async function createRejectedPr() {
  setAdmin();
  const pr = await mockRequisitionService.createRequisition({
    title: 'Rejected PR', department: 'Maintenance', requester: 'Other User',
    priority: 'Low', expectedDate: '2026-10-01', currency: 'INR',
    items: [{ product: 'Spares', hsn: '8504', uom: 'Nos', qty: 10, rate: 500, expectedRate: 500 }]
  });
  await mockRequisitionService.submitRequisition(pr.id);
  await mockRequisitionService.rejectRequisition(pr.id, 'Not needed');
  return mockRequisitionService.getRequisition(pr.id);
}

describe('PR → Converted to RFQ', () => {
  it('markConvertedToRfq moves a Ready-for-RFQ PR to Converted to RFQ (never PO Raised)', async () => {
    const before = await createReadyForRfqPr();
    expect(before.status).toBe(PR_STATUS.READY_FOR_RFQ);
    expect(before.status).not.toBe(PR_STATUS.PO_RAISED);

    const updated = await mockRequisitionService.markConvertedToRfq(before.id, 'RFQ-TEST-9999');

    expect(updated.status).toBe(PR_STATUS.CONVERTED);
    expect(updated.status).not.toBe(PR_STATUS.PO_RAISED);
    expect(updated.rfqNo).toBe('RFQ-TEST-9999');
    const rfqEntry = updated.activity.find((entry) => entry.type === 'rfq');
    expect(rfqEntry).toBeTruthy();
    expect(rfqEntry.label).toContain('Converted to RFQ RFQ-TEST-9999');
    expect(rfqEntry.actor).toBe('QA Approver');
  });

  it('convertToRfq creates a Draft RFQ and carries the full PR data handoff', async () => {
    const readyPr = await createReadyForRfqPr();
    const { created, errors } = await mockRequisitionService.convertToRfq([readyPr.id]);

    expect(errors).toHaveLength(0);
    expect(created).toHaveLength(1);
    const rfq = created[0];

    expect(rfq.status).toBe(RFQ_STATUS.DRAFT);
    expect(rfq.reference).toBe(readyPr.prNo);
    expect(rfq.title).toContain('Ready PR');
    expect(rfq.department).toBe('Production');
    expect(rfq.requester).toBe('QA Buyer');
    expect(rfq.priority).toBe('High');
    expect(rfq.currency).toBe('INR');

    expect(rfq.items).toHaveLength(1);
    expect(rfq.items[0].product).toBe('Widget');
    expect(rfq.items[0].qty).toBe(5);
    expect(rfq.items[0].rate).toBe(100);

    const pr = await mockRequisitionService.getRequisition(readyPr.id);
    expect(pr.status).toBe(PR_STATUS.CONVERTED);
    expect(pr.status).not.toBe(PR_STATUS.PO_RAISED);
    expect(pr.rfqNo).toBe(rfq.rfqNo);
  });

  it('the converted RFQ stores the PR number', async () => {
    const readyPr = await createReadyForRfqPr();
    const { created, errors } = await mockRequisitionService.convertToRfq([readyPr.id]);
    expect(errors).toHaveLength(0);
    const rfq = created[0];

    expect(rfq.prNo).toBe(readyPr.prNo);
    expect(rfq.reference).toBe(readyPr.prNo);
  });

  it('convertToRfq refuses a REJECTED PR', async () => {
    const rejected = await createRejectedPr();
    const { created, errors } = await mockRequisitionService.convertToRfq([rejected.id]);

    expect(created).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe(rejected.id);
    expect(errors[0].error).toMatch(/only ready-for-rfq requisitions can be converted/i);
  });
});

describe('Duplicate conversion prevention', () => {
  it('markConvertedToRfq refuses a PR that is already converted', async () => {
    const readyPr = await createReadyForRfqPr();
    await mockRequisitionService.markConvertedToRfq(readyPr.id, 'RFQ-TEST-0001');
    await expect(mockRequisitionService.markConvertedToRfq(readyPr.id, 'RFQ-TEST-0002')).rejects.toThrow(
      /already linked to RFQ RFQ-TEST-0001/
    );
  });

  it('markConvertedToRfq refuses a Draft PR', async () => {
    const draft = await createDraftPr();
    await expect(mockRequisitionService.markConvertedToRfq(draft.id, 'RFQ-TEST-0001')).rejects.toThrow(
      /Only ready-for-RFQ requisitions can be converted/
    );
  });

  it('convertToRfq reports partial success and never converts non-ready PRs', async () => {
    const readyPr = await createReadyForRfqPr();
    const draftPr = await createDraftPr();

    const { created, errors } = await mockRequisitionService.convertToRfq([readyPr.id, draftPr.id]);

    expect(created).toHaveLength(1);
    expect(created[0].reference).toBe(readyPr.prNo);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe(draftPr.id);
    expect(errors[0].error).toMatch(/only ready-for-rfq requisitions can be converted/i);

    const converted = await mockRequisitionService.getRequisition(readyPr.id);
    expect(converted.status).toBe(PR_STATUS.CONVERTED);
    const untouched = await mockRequisitionService.getRequisition(draftPr.id);
    expect(untouched.status).toBe(PR_STATUS.DRAFT);
  });

  it('convertToRfq never creates a duplicate RFQ for an already-converted PR', async () => {
    const countRfqsFor = (reference) =>
      rfqsStore.all.filter((rfq) => rfq.reference === reference).length;

    const readyPr = await createReadyForRfqPr();
    const first = await mockRequisitionService.convertToRfq([readyPr.id]);
    expect(first.created).toHaveLength(1);
    expect(countRfqsFor(readyPr.prNo)).toBe(1);

    const second = await mockRequisitionService.convertToRfq([readyPr.id]);
    expect(second.created).toHaveLength(0);
    expect(second.errors).toHaveLength(1);
    expect(second.errors[0].error).toMatch(/only ready-for-rfq requisitions can be converted/i);
    expect(countRfqsFor(readyPr.prNo)).toBe(1);
  });
});

describe('PR approval → Technical Review separation', () => {
  /** Creates a fresh Draft and submits it (Pending Approval). */
  async function createdPendingPr() {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Flow separation test', department: 'Production',
      requester: 'QA Buyer', priority: 'High', expectedDate: '2026-09-30',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9001', uom: 'Nos', qty: 2, rate: 100, expectedRate: 100 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    return pr;
  }

  it('PR approval is not terminal — the PR moves into Technical Specification Review', async () => {
    setAdmin();
    const pr = await createdPendingPr();
    const approved = await mockRequisitionService.approveRequisition(pr.id);

    expect(approved.status).toBe(PR_STATUS.TECHNICAL_REVIEW);
    expect(approved.status).not.toBe(PR_STATUS.APPROVED);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);

    expect(approved.technicalReview?.reviewStatus ?? REVIEW_STATUS.NOT_STARTED)
      .not.toBe(REVIEW_STATUS.REVIEWED);

    expect(PR_RFQ_ELIGIBLE.includes(approved.status)).toBe(false);
    const { created, errors } = await mockRequisitionService.convertToRfq([pr.id]);
    expect(created).toHaveLength(0);
    expect(errors[0].error).toMatch(/only ready-for-rfq requisitions can be converted/i);
  });

  it('technical approval is a separate action — only then is the PR Ready for RFQ', async () => {
    setAdmin();
    const pr = await createdPendingPr();

    await expect(mockRequisitionService.completeTechnicalReview(pr.id)).rejects.toThrow(
      /only requisitions in technical review can be approved/i
    );

    await mockRequisitionService.approveRequisition(pr.id);

    const reviewed = await mockRequisitionService.saveTechnicalReview(pr.id, {
      specification: 'Widget spec', reviewStatus: REVIEW_STATUS.REVIEWED
    });
    expect(reviewed.status).toBe(PR_STATUS.TECHNICAL_REVIEW);
    expect(reviewed.technicalReview?.reviewStatus).toBe(REVIEW_STATUS.REVIEWED);
    expect(PR_RFQ_ELIGIBLE.includes(reviewed.status)).toBe(false);

    const ready = await mockRequisitionService.completeTechnicalReview(pr.id, 'Spec conforms');
    expect(ready.status).toBe(PR_STATUS.READY_FOR_RFQ);
    expect(ready.technicalReview?.reviewStatus).toBe(REVIEW_STATUS.REVIEWED);
    expect(ready.technicalReview?.reviewedBy).toBe('QA Approver');

    expect(PR_RFQ_ELIGIBLE.includes(ready.status)).toBe(true);
    const { created, errors } = await mockRequisitionService.convertToRfq([pr.id]);
    expect(errors).toHaveLength(0);
    expect(created).toHaveLength(1);
    expect(created[0].reference).toBe(pr.prNo);
  });

  it('saveTechnicalReview is refused before the PR approval', async () => {
    setAdmin();
    const pr = await createdPendingPr();
    await expect(
      mockRequisitionService.saveTechnicalReview(pr.id, { specification: 'Premature' })
    ).rejects.toThrow(/technical review/i);

    const untouched = await mockRequisitionService.getRequisition(pr.id);
    expect(untouched.status).toBe(PR_STATUS.PENDING_APPROVAL);
    expect(untouched.technicalReview).toBeUndefined();
  });

  it('approvalStatus is never Approved before the approve action runs', async () => {
    setAdmin();
    const pr = await createdPendingPr();
    const pending = await mockRequisitionService.getRequisition(pr.id);
    expect(pending.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(pending.status).toBe(PR_STATUS.PENDING_APPROVAL);
  });

  it('a fully processed PR is internally consistent', async () => {
    setAdmin();
    const pr = await createdPendingPr();
    await mockRequisitionService.approveRequisition(pr.id);
    await mockRequisitionService.saveTechnicalReview(pr.id, {
      specification: 'Spec', reviewStatus: REVIEW_STATUS.REVIEWED
    });
    const ready = await mockRequisitionService.completeTechnicalReview(pr.id, 'OK');

    expect(ready.status).toBe(PR_STATUS.READY_FOR_RFQ);
    expect(ready.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(ready.approvedBy).toBeTruthy();
    expect(ready.technicalReview?.reviewStatus).toBe(REVIEW_STATUS.REVIEWED);

    const types = ready.activity.map((entry) => entry.type);
    expect(types).toContain('submit');
    expect(types).toContain('approve');
    expect(types).toContain('review');
  });
});
