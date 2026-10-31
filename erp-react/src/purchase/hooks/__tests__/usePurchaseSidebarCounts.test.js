/**
 * purchase/hooks/__tests__/usePurchaseSidebarCounts.test.js
 * ------------------------------------------------------------------
 * Tests for the sidebar badge count logic for RFQ Follow-ups.
 *
 * The sidebar badge must show the ACTIVE RFQ follow-up count — the exact
 * same field the RFQ Follow-ups page "Active" tab reads
 * (getFollowUpStats.active). A regression here once made the hook read
 * the QUOTATION stats as the follow-up stats (a positional mix-up in the
 * Promise.all destructuring), so the badge showed the total quotation
 * count (17) instead of the active follow-up count.
 *
 * These tests exercise:
 *   1. the pure deriveSidebarCounts / deriveOverdueCounts functions the
 *      hook now calls (explicit named params — a mapping mix-up is
 *      structurally impossible), and
 *   2. the follow-up service lifecycle that feeds the active count
 *      (created / completed / cancelled / re-opened / deleted /
 *      refreshed) — no React rendering needed.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOWUP_STATUS,
  FOLLOWUP_TYPES,
  mockRfqFollowUpService,
  rfqFollowUpsStore,
} from '../../services/rfqFollowUp';
import { mockRfqService, rfqsStore, quotationsStore } from '../../services/rfq';
import { evaluationsStore } from '../../services/evaluation';
import { ordersStore } from '../../services/purchaseOrder';
import { requisitionsStore } from '../../services/requisition';
import { vendorsStore } from '../../services/vendor';
import { deriveOverdueCounts, deriveSidebarCounts } from '../usePurchaseSidebarCounts';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('../../services/base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem(
    'authUser',
    JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }),
  );
}

beforeEach(async () => {
  localStorage.clear();
  requisitionsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  ordersStore.reset();
  vendorsStore.reset();
  evaluationsStore.reset();
  rfqFollowUpsStore.reset();
  setActor();
  /* Seed one RFQ so seedRfqNo() has a valid rfqNo to read from
     rfqsStore.all[0].rfqNo.  The createFollowUp helper depends
     on this record existing. */
  await mockRfqService.createRfq({
    title: 'Seed RFQ for sidebar counts',
    items: [
      { product: 'Item A', hsn: '8504', uom: 'Nos', qty: 10, rate: 100, expectedRate: 100, specification: 'Test', requiredDate: '2026-09-15' },
    ],
    currency: 'INR',
    vendorNames: [],
  });
});

/* --- Local-date helpers -------------------------------------------------- */

function localToday() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function shiftDays(days) {
  const date = new Date(`${localToday()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/* --- Fixture helpers ------------------------------------------------------ */

function seedRfqNo() {
  return rfqsStore.all[0].rfqNo;
}

async function createFollowUp(overrides = {}) {
  return mockRfqFollowUpService.createFollowUp({
    rfqNo: seedRfqNo(),
    type: FOLLOWUP_TYPES[0],
    followUpDate: shiftDays(1),
    followUpTime: '10:00',
    priority: 'Medium',
    notes: 'Test follow-up',
    ...overrides,
  });
}

async function clearFollowUps() {
  for (const record of [...rfqFollowUpsStore.all]) {
    await mockRfqFollowUpService.deleteFollowUp(record.id);
  }
}

/* ========================================================================
   SIDEBAR BADGE DERIVATION (the hook's pure count function)
   ======================================================================== */

describe('deriveSidebarCounts — RFQ Follow-ups badge mapping', () => {
  it('uses the follow-up stats pending field, NOT the quotation stats or active field', () => {
    // The regression: quotation stats (17 quotes) were once fed in as the
    // follow-up stats, so the badge showed 17. The named-param signature
    // makes passing the wrong object to the wrong key a test failure.
    const counts = deriveSidebarCounts({
      followUpStats: { total: 6, active: 6, pending: 4, overdue: 2 },
      quoteStats: { total: 17, received: 3 },
      rfqStats: { draft: 1, pendingApproval: 0, sent: 0, quotationReceived: 0, evaluation: 0 },
      reqStats: { pendingApproval: 2, byStatus: {} },
      vendorStats: { pending: 0 },
      nfaStats: { firstPending: 1, secondPending: 0, finalPending: 0 },
      docStats: { pending: 3 },
      board: [],
      poResult: { data: [] },
      invoiceStats: { Submitted: 0 },
      invoiceResult: { data: [] },
      mfgStats: {},
      shipStats: {},
      grnStats: {},
      inspStats: {},
    });

    expect(counts['rfq-follow-ups']).toBe(4); // pending follow-ups only (not 6 active, not 17 quotes)
    expect(counts['vendor-quotations']).toBe(3); // received quotations
  });

  it('matches pending follow-ups (actionable: Pending + Overdue, not all active)', () => {
    const stats = { total: 6, active: 6, pending: 4, overdue: 1, dueToday: 1, upcoming: 2, completed: 1 };
    const counts = deriveSidebarCounts({
      followUpStats: stats,
      quoteStats: { total: 17, received: 3 },
      rfqStats: { draft: 0, pendingApproval: 0, sent: 0, quotationReceived: 0, evaluation: 0 },
      reqStats: { pendingApproval: 0, byStatus: {} },
      vendorStats: { pending: 0 },
      nfaStats: { firstPending: 0, secondPending: 0, finalPending: 0 },
      docStats: { pending: 0 },
      board: [],
      poResult: { data: [] },
      invoiceStats: {},
      invoiceResult: { data: [] },
      mfgStats: {},
      shipStats: {},
      grnStats: {},
      inspStats: {},
    });

    expect(counts['rfq-follow-ups']).toBe(stats.pending); // pending only, not active
  });

  it('falls back to overdue when the stats object has no pending field', () => {
    const counts = deriveSidebarCounts({
      followUpStats: { total: 5, overdue: 3 },
      quoteStats: { total: 17, received: 3 },
      rfqStats: { draft: 0, pendingApproval: 0, sent: 0, quotationReceived: 0, evaluation: 0 },
      reqStats: { pendingApproval: 0, byStatus: {} },
      vendorStats: { pending: 0 },
      nfaStats: { firstPending: 0, secondPending: 0, finalPending: 0 },
      docStats: { pending: 0 },
      board: [],
      poResult: { data: [] },
      invoiceStats: {},
      invoiceResult: { data: [] },
      mfgStats: {},
      shipStats: {},
      grnStats: {},
      inspStats: {},
    });

    expect(counts['rfq-follow-ups']).toBe(3); // overdue fallback
  });

  it('drives the overdue highlight from the follow-up stats only', () => {
    const overdue = deriveOverdueCounts({ followUpStats: { overdue: 3 } });
    expect(overdue['rfq-follow-ups']).toBe(3);

    const none = deriveOverdueCounts({ followUpStats: { overdue: 0 } });
    expect(none['rfq-follow-ups']).toBe(0);
  });
});

/* ========================================================================
   FOLLOW-UP SERVICE LIFECYCLE (the active count feeding the badge)
   ======================================================================== */

describe('RFQ Follow-up active count (sidebar badge source)', () => {
  it('counts every non-deleted record as active — the page Active tab', async () => {
    await clearFollowUps();

    // 1 overdue + 1 due today + 2 upcoming + 1 completed = 5 records
    await createFollowUp({ followUpDate: shiftDays(-1) });
    await createFollowUp({ followUpDate: localToday() });
    await createFollowUp({ followUpDate: shiftDays(3) });
    await createFollowUp({ followUpDate: shiftDays(7) });
    const done = await createFollowUp({ followUpDate: shiftDays(10) });
    await mockRfqFollowUpService.completeFollowUp(done.id);

    const stats = await mockRfqFollowUpService.getFollowUpStats();

    expect(stats.total).toBe(5);
    expect(stats.active).toBe(5); // all records — page Active tab count
    expect(stats.pending).toBe(4); // completed record excluded from pending
  });

  it('badge increases when a follow-up is created and decreases when deleted', async () => {
    await clearFollowUps();

    const fu = await createFollowUp();
    let stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.active).toBe(1);
    expect(stats.total).toBe(1);

    // Created follow-up appears in the active count (page Active tab too)
    const counts = deriveSidebarCounts({
      followUpStats: stats,
      quoteStats: { total: 0, received: 0 },
      rfqStats: { draft: 0, pendingApproval: 0, sent: 0, quotationReceived: 0, evaluation: 0 },
      reqStats: { pendingApproval: 0, byStatus: {} },
      vendorStats: { pending: 0 },
      nfaStats: { firstPending: 0, secondPending: 0, finalPending: 0 },
      docStats: { pending: 0 },
      board: [],
      poResult: { data: [] },
      invoiceStats: {},
      invoiceResult: { data: [] },
      mfgStats: {},
      shipStats: {},
      grnStats: {},
      inspStats: {},
    });
    expect(counts['rfq-follow-ups']).toBe(1);

    // Deleting removes it from the active count
    await mockRfqFollowUpService.deleteFollowUp(fu.id);
    stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.active).toBe(0);
  });

  it('keeps completed/cancelled records in the active count (still active, like the page tab)', async () => {
    await clearFollowUps();

    const fu = await createFollowUp();
    await mockRfqFollowUpService.completeFollowUp(fu.id);

    let stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.active).toBe(1); // completed record is still active
    expect(stats.pending).toBe(0);

    const cancelMe = await createFollowUp();
    await mockRfqFollowUpService.cancelFollowUp(cancelMe.id);

    stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.active).toBe(2); // cancelled record is still active
    expect(stats.pending).toBe(0);
  });

  it('re-opening a completed follow-up restores it to the pending bucket (status changed)', async () => {
    await clearFollowUps();

    const fu = await createFollowUp({ followUpDate: shiftDays(1) });
    await mockRfqFollowUpService.completeFollowUp(fu.id);

    let stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.active).toBe(1); // still active before re-open
    expect(stats.pending).toBe(0);

    // Re-open by changing the status back to Pending
    await mockRfqFollowUpService.updateFollowUp(fu.id, {
      status: FOLLOWUP_STATUS.PENDING,
    });

    stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.active).toBe(1); // active count unchanged
    expect(stats.pending).toBe(1); // now pending again — action required
    expect(stats.completed).toBe(0);
  });

  it('overdue count updates when a follow-up date changes to past', async () => {
    await clearFollowUps();

    const fu = await createFollowUp({ followUpDate: shiftDays(5) });
    let stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.upcoming).toBe(1);
    expect(stats.overdue).toBe(0);

    await mockRfqFollowUpService.updateFollowUp(fu.id, {
      followUpDate: shiftDays(-1),
    });

    stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.upcoming).toBe(0);
    expect(stats.overdue).toBe(1);
    expect(stats.active).toBe(1); // still active
  });

  it('due today count updates when a follow-up date changes to today', async () => {
    await clearFollowUps();

    const fu = await createFollowUp({ followUpDate: shiftDays(3) });
    let stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.upcoming).toBe(1);
    expect(stats.dueToday).toBe(0);

    await mockRfqFollowUpService.updateFollowUp(fu.id, {
      followUpDate: localToday(),
    });

    stats = await mockRfqFollowUpService.getFollowUpStats();
    expect(stats.upcoming).toBe(0);
    expect(stats.dueToday).toBe(1);
  });

  it('active + completed + cancelled are internally consistent with the total', async () => {
    await clearFollowUps();

    await createFollowUp({ followUpDate: shiftDays(-1) });
    await createFollowUp({ followUpDate: localToday() });
    await createFollowUp({ followUpDate: shiftDays(3) });
    const done = await createFollowUp({ followUpDate: shiftDays(7) });
    const cancelled = await createFollowUp({ followUpDate: shiftDays(10) });
    await mockRfqFollowUpService.completeFollowUp(done.id);
    await mockRfqFollowUpService.cancelFollowUp(cancelled.id);

    const stats = await mockRfqFollowUpService.getFollowUpStats();
    // active = every record that is not archived/deleted = total here
    expect(stats.active).toBe(stats.total);
    // pending buckets sum to pending
    expect(stats.overdue + stats.dueToday + stats.upcoming).toBe(stats.pending);
  });
});