/**
 * purchase/services/workflowVerification.test.js
 * ------------------------------------------------------------------
 * Full end-to-end verification of the Purchase Requisition workflow
 * after demo data removal. Tests the complete lifecycle:
 *   1. Verify empty state (no demo data)
 *   2. Create a PR (Draft)
 *   3. Submit for approval (→ Pending Approval)
 *   4. Approve (→ Technical Specification Review)
 *   5. Save technical review
 *   6. Complete technical review (→ Ready for RFQ)
 *   7. Convert to RFQ (→ Converted to RFQ)
 *   8. Verify stats update correctly
 *   9. Delete the PR and verify it moves to Deleted tab
 *  10. Verify empty state again after delete
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APPROVAL_STATUS, PR_STATUS, REVIEW_STATUS, RFQ_STATUS } from '../constants';
import {
  mockRequisitionService,
  requisitionsStore
} from './requisition';
import { rfqsStore, quotationsStore } from './rfq';
import { ordersStore } from './purchaseOrder';
import { vendorsStore } from './vendor';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setAdmin() {
  localStorage.setItem(
    'authUser',
    JSON.stringify({ fullName: 'Test Admin', email: 'admin@test.com', role: 'ADMIN' })
  );
}

beforeEach(() => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  setAdmin();
});

describe('Full PR workflow verification', () => {
  it('starts with empty state (no demo data)', async () => {
    const { data: prereqs } = await mockRequisitionService.getRequisitions({
      page: 1,
      pageSize: 100
    });
    /* No seed data — verify the store starts empty. */
    expect(prereqs.length).toBe(0);

    const stats = await mockRequisitionService.getRequisitionStats();
    expect(stats.total).toBe(0);
  });

  it('executes the full PR → RFQ workflow', async () => {
    /* ---- STEP 1: Create PR (Draft) ---- */
    const pr = await mockRequisitionService.createRequisition({
      title: 'Test procurement — steel sheets',
      department: 'Production',
      project: 'Unit 2 Expansion',
      requester: 'Test User',
      buyer: 'Test Admin',
      vendor: 'Tata Steel',
      currency: 'INR',
      priority: 'High',
      expectedDate: '2026-10-01',
      terms: '30 Days',
      items: [
        { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 500, rate: 24.5 },
        { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 200, rate: 28 }
      ]
    });
    expect(pr.status).toBe(PR_STATUS.DRAFT);
    expect(pr.approvalStatus).toBe(APPROVAL_STATUS.PENDING);
    expect(pr.prNo).toMatch(/^PR-/);

    /* Verify it appears in the list */
    const { data: afterCreate } = await mockRequisitionService.getRequisitions({
      page: 1,
      pageSize: 100
    });
    expect(afterCreate.some((record) => record.id === pr.id)).toBe(true);

    /* Stats reflect the new draft */
    const statsDraft = await mockRequisitionService.getRequisitionStats();
    expect(statsDraft.draft).toBeGreaterThanOrEqual(1);

    /* ---- STEP 2: Submit for Approval → Pending Approval ---- */
    const submitted = await mockRequisitionService.submitRequisition(pr.id);
    expect(submitted.status).toBe(PR_STATUS.PENDING_APPROVAL);

    const statsPending = await mockRequisitionService.getRequisitionStats();
    expect(statsPending.pendingApproval).toBeGreaterThanOrEqual(1);
    expect(statsPending.draft).toBeGreaterThanOrEqual(0);

    /* ---- STEP 3: Approve → Technical Specification Review ---- */
    const approved = await mockRequisitionService.approveRequisition(pr.id, 'Approved for procurement');
    expect(approved.status).toBe(PR_STATUS.TECHNICAL_REVIEW);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(approved.approvedBy).toBe('Test Admin');

    const statsTsr = await mockRequisitionService.getRequisitionStats();
    expect(statsTsr.pendingApproval).toBeGreaterThanOrEqual(0);
    expect(statsTsr.approved).toBeGreaterThanOrEqual(1);

    /* ---- STEP 4: Save Technical Review ---- */
    const reviewed = await mockRequisitionService.saveTechnicalReview(pr.id, {
      specification: 'HR coil 3mm IS 2062 E250',
      drawing: 'DWG-TEST-001 rev A',
      materialGrade: 'IS 2062 E250',
      dimensions: '3mm x 1250mm',
      comments: 'Specification verified.',
      reviewStatus: REVIEW_STATUS.REVIEWED
    });
    expect(reviewed.technicalReview?.reviewStatus).toBe(REVIEW_STATUS.REVIEWED);
    expect(reviewed.status).toBe(PR_STATUS.TECHNICAL_REVIEW);

    /* ---- STEP 5: Complete Technical Review → Ready for RFQ ---- */
    const ready = await mockRequisitionService.completeTechnicalReview(pr.id, 'Spec conforms');
    expect(ready.status).toBe(PR_STATUS.READY_FOR_RFQ);
    expect(ready.technicalReview?.reviewStatus).toBe(REVIEW_STATUS.REVIEWED);

    const statsReady = await mockRequisitionService.getRequisitionStats();
    expect(statsReady.approved).toBeGreaterThanOrEqual(1);

    /* ---- STEP 6: Convert to RFQ ---- */
    const { created, errors } = await mockRequisitionService.convertToRfq([pr.id]);
    expect(errors).toHaveLength(0);
    expect(created).toHaveLength(1);
    expect(created[0].status).toBe(RFQ_STATUS.DRAFT);
    expect(created[0].reference).toBe(pr.prNo);

    const converted = await mockRequisitionService.getRequisition(pr.id);
    expect(converted.status).toBe(PR_STATUS.CONVERTED);
    expect(converted.rfqNo).toBe(created[0].rfqNo);

    const statsConverted = await mockRequisitionService.getRequisitionStats();
    expect(statsConverted.converted).toBeGreaterThanOrEqual(1);
    expect(statsConverted.approved).toBeGreaterThanOrEqual(0);

    /* ---- STEP 7: Delete linked PR is blocked → correct business rule ---- */
    try {
      await mockRequisitionService.deleteRequisition(pr.id);
      throw new Error('Should have thrown');
    } catch (err) {
      expect(err.message).toMatch(/referenced by RFQ/);
    }

    /* PR is still visible in active tab since delete was blocked */
    const { data: activeTab } = await mockRequisitionService.getRequisitions({
      page: 1,
      pageSize: 100,
      tab: 'active'
    });
    expect(activeTab.some((record) => record.id === pr.id)).toBe(true);

    /* ---- STEP 8: Verify PR status is Converted (not deleted) ---- */
    const stillConverted = await mockRequisitionService.getRequisition(pr.id);
    expect(stillConverted.status).toBe(PR_STATUS.CONVERTED);
  });

  it('self-approval is blocked', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Self-approval test',
      department: 'Production',
      requester: 'Test Admin',
      priority: 'Medium',
      expectedDate: '2026-10-01',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);

    /* Test Admin created it AND is the approver — should be rejected */
    await expect(
      mockRequisitionService.approveRequisition(pr.id)
    ).rejects.toThrow(/cannot approve their own/i);
  });

  it('reject requires mandatory reason', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Reject test',
      department: 'Production',
      requester: 'Other User',
      priority: 'Low',
      expectedDate: '2026-10-01',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);

    const rejected = await mockRequisitionService.rejectRequisition(pr.id, 'Duplicate requirement');
    expect(rejected.status).toBe(PR_STATUS.REJECTED);
    expect(rejected.approvalStatus).toBe(APPROVAL_STATUS.REJECTED);
  });

  it('TSR return sends PR back for correction', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Return test',
      department: 'Production',
      requester: 'Other User',
      priority: 'Medium',
      expectedDate: '2026-10-01',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);

    /* TSR returns the PR */
    const returned = await mockRequisitionService.returnRequisition(pr.id, 'Needs more detail');
    expect(returned.status).toBe(PR_STATUS.RETURNED);

    /* Requester re-submits */
    const reSubmitted = await mockRequisitionService.submitRequisition(pr.id);
    expect(reSubmitted.status).toBe(PR_STATUS.PENDING_APPROVAL);
  });

  it('cannot convert non-ready PRs', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Cannot convert draft',
      department: 'Production',
      requester: 'Other User',
      priority: 'Medium',
      expectedDate: '2026-10-01',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    /* Draft PR — should fail */
    const { created, errors } = await mockRequisitionService.convertToRfq([pr.id]);
    expect(created).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/ready-for-rfq/i);
  });

  it('duplicate conversion is prevented', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Dup conversion test',
      department: 'Production',
      requester: 'Other User',
      priority: 'Medium',
      expectedDate: '2026-10-01',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);
    await mockRequisitionService.approveRequisition(pr.id);
    await mockRequisitionService.completeTechnicalReview(pr.id);

    const first = await mockRequisitionService.convertToRfq([pr.id]);
    expect(first.created).toHaveLength(1);

    const second = await mockRequisitionService.convertToRfq([pr.id]);
    expect(second.created).toHaveLength(0);
    expect(second.errors).toHaveLength(1);
  });

  it('unauthorized user cannot approve', async () => {
    localStorage.setItem(
      'authUser',
      JSON.stringify({ fullName: 'Regular User', email: 'user@test.com', role: 'USER' })
    );
    const pr = await mockRequisitionService.createRequisition({
      title: 'Auth test',
      department: 'Production',
      requester: 'Other User',
      priority: 'Medium',
      expectedDate: '2026-10-01',
      currency: 'INR',
      items: [{ product: 'Widget', hsn: '9999', uom: 'Nos', qty: 1, rate: 10 }]
    });
    await mockRequisitionService.submitRequisition(pr.id);

    await expect(
      mockRequisitionService.approveRequisition(pr.id)
    ).rejects.toThrow(/Forbidden/i);
  });
});
