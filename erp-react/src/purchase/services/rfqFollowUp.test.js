/**
 * purchase/services/rfqFollowUp.test.js
 * ------------------------------------------------------------------
 * Unit tests for the RFQ Follow-ups service — the tracking layer on
 * top of the RFQ data.
 *
 * Covered:
 *   BUCKETS   Display status derivation (Overdue / Due Today /
 *             Upcoming / Completed / Cancelled) + live RFQ field
 *             enrichment
 *   CRUD      create / get / update / complete / reschedule / cancel /
 *             delete — happy paths, state guards and 400/404 errors;
 *             the referenced RFQ is never modified
 *   STATS     getFollowUpStats across every bucket
 *   LIST      search, filters, sorting and pagination of getFollowUps
 *
 * The tests exercise the mock services directly against fresh
 * in-memory stores per test. `delay` is stubbed so the suite stays
 * fast; dates are computed relative to the real local "today" (the
 * same logic the service uses), so bucket assertions are always
 * deterministic.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOWUP_BUCKET, FOLLOWUP_STATUS, FOLLOWUP_TYPES, mockRfqFollowUpService, rfqFollowUpsStore
} from './rfqFollowUp';
import { rfqsStore, quotationsStore } from './rfq';
import { evaluationsStore } from './evaluation';
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

beforeEach(() => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  evaluationsStore.reset();
  rfqFollowUpsStore.reset();
  setActor();
});

/* --- Local-date helpers (mirror base.js todayLocal / service shiftDate) --- */

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function shiftDays(days) {
  const date = new Date(`${localToday()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/* --- Fixtures ------------------------------------------------------------ */

const VENDOR_A = 'Tata Steel Ltd';

/** Minimal RFQ fixture for test setup — idempotent. */
const TEST_RFQ_NO = 'RFQ-TEST-001';
function seedTestRfq() {
  if (rfqsStore.all.some((r) => r.rfqNo === TEST_RFQ_NO)) return TEST_RFQ_NO;
  const rfq = {
    id: TEST_RFQ_NO,
    rfqNo: TEST_RFQ_NO,
    title: 'Test RFQ for follow-up',
    status: 'Sent',
    vendors: [VENDOR_A],
    vendorCount: 1,
    dueDate: shiftDays(7),
    currency: 'INR',
    requester: 'Test Buyer',
    createdAt: new Date().toISOString(),
    items: []
  };
  rfqsStore.persist([...rfqsStore.all, rfq]);
  return rfq.rfqNo;
}

/** First seeded RFQ — a valid rfqNo for follow-up creation. */
function seedRfqNo() {
  return seedTestRfq();
}

const createdFor = (rfqNo) => rfqFollowUpsStore.all.filter((record) => record.rfqNo === rfqNo);

/** Creates a follow-up and returns the enriched result. */
async function createFollowUp(overrides = {}) {
  return mockRfqFollowUpService.createFollowUp({
    rfqNo: seedRfqNo(),
    type: FOLLOWUP_TYPES[0],
    followUpDate: shiftDays(2),
    followUpTime: '10:00',
    priority: 'High',
    notes: 'Chase quotation',
    reminder: true,
    ...overrides
  });
}

/* ==========================================================================
   DISPLAY BUCKETS
   ========================================================================== */

describe('Follow-up display buckets', () => {
  it('derives Overdue when a pending due date is before today', async () => {
    const record = await createFollowUp({ followUpDate: shiftDays(-3) });
    expect(record.workflowStatus).toBe(FOLLOWUP_STATUS.PENDING);
    expect(record.status).toBe(FOLLOWUP_BUCKET.OVERDUE);
  });

  it('derives Due Today when the due date is today', async () => {
    const record = await createFollowUp({ followUpDate: localToday() });
    expect(record.status).toBe(FOLLOWUP_BUCKET.DUE_TODAY);
  });

  it('derives Upcoming when the due date is ahead', async () => {
    const record = await createFollowUp({ followUpDate: shiftDays(5) });
    expect(record.status).toBe(FOLLOWUP_BUCKET.UPCOMING);
  });

  it('keeps Completed records Completed even with an old due date', async () => {
    const record = await createFollowUp({ followUpDate: shiftDays(-10) });
    const completed = await mockRfqFollowUpService.completeFollowUp(record.id);
    expect(completed.status).toBe(FOLLOWUP_BUCKET.COMPLETED);
  });

  it('keeps Cancelled records Cancelled even with an old due date', async () => {
    const record = await createFollowUp({ followUpDate: shiftDays(-10) });
    const cancelled = await mockRfqFollowUpService.cancelFollowUp(record.id);
    expect(cancelled.status).toBe(FOLLOWUP_BUCKET.CANCELLED);
  });

  it('enriches live RFQ fields (id, title, status, requester) and mirrors the due date', async () => {
    seedTestRfq();
    const rfq = rfqsStore.all.find((entry) => entry.rfqNo === TEST_RFQ_NO);
    const due = shiftDays(1);
    const record = await createFollowUp({ followUpDate: due });

    expect(record.rfqId).toBe(rfq.id);
    expect(record.rfqTitle).toBe(rfq.title);
    expect(record.rfqStatus).toBe(rfq.status);
    expect(record.requester).toBe(rfq.requester);
    expect(record.dueDate).toBe(due);
    expect(record.nextFollowUp).toBe(due);
  });
});

/* ==========================================================================
   CRUD
   ========================================================================== */

describe('Follow-up CRUD', () => {
  it('create — builds a numbered record, defaults from the RFQ, and a create activity entry', async () => {
    seedTestRfq();
    const rfq = rfqsStore.all.find((entry) => entry.rfqNo === TEST_RFQ_NO);
    /* Empty priority / vendor fall through to the RFQ-derived defaults. */
    const record = await createFollowUp({ priority: '', vendor: '' });

    expect(record.followUpNo).toMatch(/^FU-\d{4}-\d{4}$/);
    expect(record.id).toBe(record.followUpNo);
    /* Lifecycle state lives on workflowStatus; `status` is the display bucket. */
    expect(record.workflowStatus).toBe(FOLLOWUP_STATUS.PENDING);
    expect(record.rfqNo).toBe(rfq.rfqNo);
    /* Defaults derived from the referenced RFQ. */
    expect(record.vendor).toBe(rfq.vendors?.[0] || '');
    expect(record.priority).toBe(rfq.priority || 'Medium');
    expect(record.assignedTo).toBe('Test Buyer'); // current actor
    expect(record.reminder).toBe(true);
    expect(record.activity[0].type).toBe('create');
    /* Exactly one record with this number exists for the RFQ. */
    expect(createdFor(rfq.rfqNo).filter((entry) => entry.followUpNo === record.followUpNo)).toHaveLength(1);
  });

  it('create — rejects an rfqNo that does not exist (400)', async () => {
    await expect(
      mockRfqFollowUpService.createFollowUp({ rfqNo: 'RFQ-9999-9999', type: FOLLOWUP_TYPES[0] })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('create — never creates a duplicate RFQ (the RFQ store is untouched)', async () => {
    seedTestRfq();
    const before = rfqsStore.all.length;
    await createFollowUp();
    expect(rfqsStore.all.length).toBe(before);
  });

  it('get — finds by id and by followUpNo', async () => {
    const created = await createFollowUp();
    const byId = await mockRfqFollowUpService.getFollowUp(created.id);
    const byNo = await mockRfqFollowUpService.getFollowUp(created.followUpNo);
    expect(byId.followUpNo).toBe(created.followUpNo);
    expect(byNo.followUpNo).toBe(created.followUpNo);
  });

  it('get — 404 for an unknown follow-up', async () => {
    await expect(mockRfqFollowUpService.getFollowUp('FU-9999-0000')).rejects.toMatchObject({
      status: 404
    });
  });

  it('update — edits editable fields, keeps status, appends an update activity entry', async () => {
    const created = await createFollowUp({ notes: 'original' });
    const updated = await mockRfqFollowUpService.updateFollowUp(created.id, {
      notes: 'revised',
      priority: 'Critical',
      followUpDate: shiftDays(6)
    });

    expect(updated.notes).toBe('revised');
    expect(updated.priority).toBe('Critical');
    expect(updated.followUpDate).toBe(shiftDays(6));
    expect(updated.workflowStatus).toBe(FOLLOWUP_STATUS.PENDING);
    expect(updated.activity.some((entry) => entry.type === 'update')).toBe(true);
  });

  it('update — 404 for an unknown follow-up', async () => {
    await expect(
      mockRfqFollowUpService.updateFollowUp('FU-9999-0000', { notes: 'x' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('complete — marks a pending follow-up completed with actor + timestamp and an activity entry', async () => {
    const created = await createFollowUp();
    const completed = await mockRfqFollowUpService.completeFollowUp(created.id);

    /* The enriched `status` is the display bucket; lifecycle is on workflowStatus. */
    expect(completed.status).toBe(FOLLOWUP_BUCKET.COMPLETED);
    expect(completed.workflowStatus).toBe(FOLLOWUP_STATUS.COMPLETED);
    expect(completed.completedBy).toBe('Test Buyer');
    expect(completed.completedAt).toBeTruthy();
    expect(completed.activity.some((entry) => entry.type === 'complete')).toBe(true);
  });

  it('complete — refuses non-pending follow-ups (400)', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.completeFollowUp(created.id);
    await expect(mockRfqFollowUpService.completeFollowUp(created.id)).rejects.toMatchObject({
      status: 400
    });
    const cancelled = await createFollowUp({ followUpDate: shiftDays(1) });
    await mockRfqFollowUpService.cancelFollowUp(cancelled.id);
    await expect(mockRfqFollowUpService.completeFollowUp(cancelled.id)).rejects.toMatchObject({
      status: 400
    });
  });

  it('reschedule — moves a pending follow-up to a new date and records the activity', async () => {
    const created = await createFollowUp({ followUpDate: shiftDays(1) });
    const newDate = shiftDays(9);
    const rescheduled = await mockRfqFollowUpService.rescheduleFollowUp(created.id, newDate, '14:30');

    expect(rescheduled.followUpDate).toBe(newDate);
    expect(rescheduled.followUpTime).toBe('14:30');
    expect(rescheduled.activity.some((entry) => entry.type === 'reschedule')).toBe(true);
  });

  it('reschedule — requires a date (400) and refuses non-pending follow-ups (400)', async () => {
    const created = await createFollowUp();
    await expect(mockRfqFollowUpService.rescheduleFollowUp(created.id, '', '10:00')).rejects.toMatchObject({
      status: 400
    });
    await mockRfqFollowUpService.completeFollowUp(created.id);
    await expect(
      mockRfqFollowUpService.rescheduleFollowUp(created.id, shiftDays(2), '10:00')
    ).rejects.toMatchObject({ status: 400 });
  });

  it('cancel — marks a pending follow-up cancelled with actor + timestamp and an activity entry', async () => {
    const created = await createFollowUp();
    const cancelled = await mockRfqFollowUpService.cancelFollowUp(created.id);

    /* The enriched `status` is the display bucket; lifecycle is on workflowStatus. */
    expect(cancelled.status).toBe(FOLLOWUP_BUCKET.CANCELLED);
    expect(cancelled.workflowStatus).toBe(FOLLOWUP_STATUS.CANCELLED);
    expect(cancelled.cancelledBy).toBe('Test Buyer');
    expect(cancelled.cancelledAt).toBeTruthy();
    expect(cancelled.activity.some((entry) => entry.type === 'cancel')).toBe(true);
  });

  it('cancel — refuses non-pending follow-ups (400)', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.cancelFollowUp(created.id);
    await expect(mockRfqFollowUpService.cancelFollowUp(created.id)).rejects.toMatchObject({
      status: 400
    });
    const completed = await createFollowUp({ followUpDate: shiftDays(2) });
    await mockRfqFollowUpService.completeFollowUp(completed.id);
    await expect(mockRfqFollowUpService.cancelFollowUp(completed.id)).rejects.toMatchObject({
      status: 400
    });
  });

  it('delete — soft-deletes the record (moves to Deleted tab) and 404s on unknown ids', async () => {
    const created = await createFollowUp();
    const before = rfqFollowUpsStore.all.length;
    const removed = await mockRfqFollowUpService.deleteFollowUp(created.id);

    expect(removed.followUpNo).toBe(created.followUpNo);
    /* Soft-delete: the record stays in the store but with recordState 'deleted'. */
    expect(rfqFollowUpsStore.all.length).toBe(before);
    expect(rfqFollowUpsStore.all.find((r) => r.id === created.id)?.recordState).toBe('deleted');
    /* Deleting an already-deleted record is idempotent — returns the record. */
    const alreadyDeleted = await mockRfqFollowUpService.deleteFollowUp(created.id);
    expect(alreadyDeleted.recordState).toBe('deleted');
    /* Unknown ids still 404. */
    await expect(mockRfqFollowUpService.deleteFollowUp('NON-EXISTENT')).rejects.toMatchObject({
      status: 404
    });
  });
});

/* ==========================================================================
   STATS
   ========================================================================== */

describe('Follow-up stats', () => {
  it('computes total / pending / overdue / dueToday / upcoming / completed from actual records', async () => {
    /* Clear the seed so the set below is the ONLY data — exact counts. */
    for (const record of [...rfqFollowUpsStore.all]) {
      await mockRfqFollowUpService.deleteFollowUp(record.id);
    }
    /* Deterministic set: 1 overdue, 1 due today, 1 upcoming, 1 completed, 1 cancelled. */
    await createFollowUp({ followUpDate: shiftDays(-2) });
    await createFollowUp({ followUpDate: localToday(), type: 'Quotation Due Soon' });
    const upcoming = await createFollowUp({ followUpDate: shiftDays(3), type: 'Evaluation Pending' });
    await mockRfqFollowUpService.completeFollowUp(upcoming.id);
    const cancelMe = await createFollowUp({ followUpDate: shiftDays(4) });
    await mockRfqFollowUpService.cancelFollowUp(cancelMe.id);
    /* Completed + cancelled no longer count as pending or actionable. */

    const stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.total).toBe(4);
    expect(stats.pending).toBe(2);
    expect(stats.overdue).toBe(1);
    expect(stats.dueToday).toBe(1);
    expect(stats.upcoming).toBe(0);
    expect(stats.completed).toBe(1);
  });

  it('completing a pending follow-up shifts it out of pending into completed', async () => {
    const created = await createFollowUp({ followUpDate: shiftDays(1) });
    const before = await mockRfqFollowUpService.getFollowUpStats();
    expect(before.pending).toBeGreaterThan(0);

    await mockRfqFollowUpService.completeFollowUp(created.id);
    const after = await mockRfqFollowUpService.getFollowUpStats();

    expect(after.pending).toBe(before.pending - 1);
    expect(after.completed).toBe(before.completed + 1);
  });

  it('the seed itself produces consistent stats with no negative or NaN buckets', async () => {
    const stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.total).toBe(rfqFollowUpsStore.all.length);
    expect(stats.pending + stats.completed).toBeLessThanOrEqual(stats.total);
    for (const value of Object.values(stats)) {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

/* ==========================================================================
   LIST (search / filters / sorting / pagination)
   ========================================================================== */

describe('getFollowUps list', () => {
  it('paginates and reports the correct total', async () => {
    /* Create enough follow-ups to guarantee pagination. */
    await createFollowUp();
    await createFollowUp();
    await createFollowUp();
    const total = rfqFollowUpsStore.all.length;

    const result = await mockRfqFollowUpService.getFollowUps({ page: 1, pageSize: 3 });
    expect(result.total).toBe(total);
    expect(result.data).toHaveLength(3);
    expect(result.totalPages).toBe(Math.ceil(total / 3));
  });

  it('searches across rfqNo, title, vendor and type', async () => {
    const created = await createFollowUp({ notes: 'Search me loudly', type: 'Evaluation Pending' });
    const rfq = rfqsStore.all.find((entry) => entry.rfqNo === seedRfqNo());

    const byRfqNo = await mockRfqFollowUpService.getFollowUps({ search: created.rfqNo });
    expect(byRfqNo.data.some((record) => record.id === created.id)).toBe(true);

    const byTitle = await mockRfqFollowUpService.getFollowUps({ search: rfq.title.slice(0, 10) });
    expect(byTitle.data.some((record) => record.id === created.id)).toBe(true);

    const byVendor = await mockRfqFollowUpService.getFollowUps({ search: created.vendor });
    expect(byVendor.data.some((record) => record.id === created.id)).toBe(true);

    const byType = await mockRfqFollowUpService.getFollowUps({ search: 'Evaluation Pending' });
    expect(byType.data.some((record) => record.type === 'Evaluation Pending')).toBe(true);
  });

  it('filters by status bucket, type, priority and vendor', async () => {
    const overdueCreated = await createFollowUp({
      type: 'Evaluation Pending', priority: 'Critical', followUpDate: shiftDays(-1)
    });
    await createFollowUp({ type: 'Quotation Due Soon', priority: 'Low', followUpDate: shiftDays(4) });

    const overdue = await mockRfqFollowUpService.getFollowUps({ status: FOLLOWUP_BUCKET.OVERDUE });
    expect(overdue.data.every((record) => record.status === FOLLOWUP_BUCKET.OVERDUE)).toBe(true);
    expect(overdue.data.some((record) => record.id === overdueCreated.id)).toBe(true);

    const critical = await mockRfqFollowUpService.getFollowUps({ priority: 'Critical' });
    expect(critical.data.every((record) => record.priority === 'Critical')).toBe(true);

    const typeFilter = await mockRfqFollowUpService.getFollowUps({ type: 'Quotation Due Soon' });
    expect(typeFilter.data.every((record) => record.type === 'Quotation Due Soon')).toBe(true);

    const vendorCreated = await createFollowUp({ vendor: VENDOR_A });
    const vendorFilter = await mockRfqFollowUpService.getFollowUps({ vendor: VENDOR_A });
    expect(vendorFilter.data.every((record) => record.vendor === VENDOR_A)).toBe(true);
    expect(vendorFilter.data.some((record) => record.id === vendorCreated.id)).toBe(true);
  });

  it('filters by due-date range and by RFQ status', async () => {
    const from = shiftDays(2);
    const to = shiftDays(8);
    await createFollowUp({ followUpDate: from });
    await createFollowUp({ followUpDate: to });
    await createFollowUp({ followUpDate: shiftDays(30) });

    const inRange = await mockRfqFollowUpService.getFollowUps({ dateFrom: from, dateTo: to });
    expect(inRange.data.every((record) => record.followUpDate >= from && record.followUpDate <= to)).toBe(true);

    const rfq = rfqsStore.all.find((entry) => entry.rfqNo === seedRfqNo());
    const byRfqStatus = await mockRfqFollowUpService.getFollowUps({ rfqStatus: rfq.status });
    expect(byRfqStatus.data.every((record) => record.rfqStatus === rfq.status)).toBe(true);
  });

  it('sorts by due date ascending by default and by status bucket order when asked', async () => {
    await createFollowUp({ followUpDate: shiftDays(10) });
    await createFollowUp({ followUpDate: shiftDays(-5) });
    await createFollowUp({ followUpDate: shiftDays(2) });

    const byDate = await mockRfqFollowUpService.getFollowUps({ sortBy: 'followUpDate', sortDir: 'asc' });
    const dates = byDate.data.map((record) => record.followUpDate).filter(Boolean);
    expect([...dates].sort()).toEqual(dates);

    const byStatus = await mockRfqFollowUpService.getFollowUps({ sortBy: 'status', sortDir: 'asc' });
    const statuses = byStatus.data.map((record) => record.status);
    /* Bucket rank order: Overdue → Due Today → Upcoming → Completed → Cancelled. */
    const BUCKET_RANK = [
      FOLLOWUP_BUCKET.OVERDUE, FOLLOWUP_BUCKET.DUE_TODAY, FOLLOWUP_BUCKET.UPCOMING,
      FOLLOWUP_BUCKET.COMPLETED, FOLLOWUP_BUCKET.CANCELLED
    ];
    const ranks = statuses.map((status) => BUCKET_RANK.indexOf(status));
    expect(ranks.every((rank, index) => index === 0 || ranks[index - 1] <= rank)).toBe(true);
  });
});

/* ==========================================================================
   DELETE → DELETED TAB LIFECYCLE
   ========================================================================== */

describe('Delete lifecycle — soft-delete and Deleted tab', () => {
  it('1. delete moves follow-up out of Active', async () => {
    const created = await createFollowUp();
    const activeBefore = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'active' });
    expect(activeBefore.data.some((r) => r.id === created.id)).toBe(true);

    await mockRfqFollowUpService.deleteFollowUp(created.id);

    const activeAfter = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'active' });
    expect(activeAfter.data.some((r) => r.id === created.id)).toBe(false);
  });

  it('2. delete makes follow-up appear in Deleted tab', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.deleteFollowUp(created.id);

    const deleted = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'deleted' });
    expect(deleted.data.some((r) => r.id === created.id)).toBe(true);
    expect(deleted.data.find((r) => r.id === created.id).recordState).toBe('deleted');
  });

  it('3. active count decreases after delete', async () => {
    const created = await createFollowUp();
    const statsBefore = await mockRfqFollowUpService.getFollowUpStats();
    const activeBefore = statsBefore.active;

    await mockRfqFollowUpService.deleteFollowUp(created.id);

    const statsAfter = await mockRfqFollowUpService.getFollowUpStats();
    expect(statsAfter.active).toBe(activeBefore - 1);
  });

  it('4. deleted count increases after delete', async () => {
    const statsBefore = await mockRfqFollowUpService.getFollowUpStats();
    const deletedBefore = statsBefore.deleted;

    const created = await createFollowUp();
    await mockRfqFollowUpService.deleteFollowUp(created.id);

    const statsAfter = await mockRfqFollowUpService.getFollowUpStats();
    expect(statsAfter.deleted).toBe(deletedBefore + 1);
  });

  it('5. deleted state persists after store reload', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.deleteFollowUp(created.id);

    /* Simulate reload by re-reading from the store directly. */
    const record = rfqFollowUpsStore.all.find((r) => r.id === created.id);
    expect(record).toBeDefined();
    expect(record.recordState).toBe('deleted');
  });

  it('6. restore moves follow-up back to Active', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.deleteFollowUp(created.id);

    await mockRfqFollowUpService.restoreFollowUp(created.id);

    const active = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'active' });
    expect(active.data.some((r) => r.id === created.id)).toBe(true);
    expect(active.data.find((r) => r.id === created.id).recordState).toBe('active');

    const deleted = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'deleted' });
    expect(deleted.data.some((r) => r.id === created.id)).toBe(false);
  });

  it('7. deleted records are excluded from Active lifecycle view', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.deleteFollowUp(created.id);

    const active = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'active' });
    expect(active.data.every((r) => r.id !== created.id)).toBe(true);
  });

  it('8. deleting an already-deleted record is idempotent', async () => {
    const created = await createFollowUp();
    await mockRfqFollowUpService.deleteFollowUp(created.id);

    /* Second delete should not throw or duplicate. */
    const result = await mockRfqFollowUpService.deleteFollowUp(created.id);
    expect(result.recordState).toBe('deleted');
    expect(rfqFollowUpsStore.all.filter((r) => r.followUpNo === created.followUpNo)).toHaveLength(1);
  });

  it('9. subscriber/list state updates after deletion', async () => {
    const created = await createFollowUp();
    const before = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'active' });
    expect(before.data.some((r) => r.id === created.id)).toBe(true);

    await mockRfqFollowUpService.deleteFollowUp(created.id);

    /* A fresh query reflects the change. */
    const after = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'active' });
    expect(after.data.some((r) => r.id === created.id)).toBe(false);
    const deletedView = await mockRfqFollowUpService.getFollowUps({ lifecycle: 'deleted' });
    expect(deletedView.data.some((r) => r.id === created.id)).toBe(true);
  });
});
