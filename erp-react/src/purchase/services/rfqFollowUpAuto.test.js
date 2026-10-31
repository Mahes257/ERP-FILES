/**
 * purchase/services/rfqFollowUpAuto.test.js
 * ------------------------------------------------------------------
 * Unit tests for the auto-created follow-up business rule:
 *
 *   Approved RFQ → Send to vendors (no responses yet) → auto
 *   "Vendor Response Pending" follow-up is created
 *
 * Rules covered:
 *   RULE 1  Sending an RFQ with no responses auto-creates a pending
 *           "Vendor Response Pending" follow-up for that RFQ
 *   RULE 2  The auto rule is idempotent — never a duplicate when the
 *           RFQ already carries an open vendor-response follow-up
 *   RULE 3  Re-sending an RFQ does not stack a second follow-up
 *   RULE 4  An RFQ that already HAS received responses gets no
 *           auto follow-up (the chase is moot)
 *
 * The tests exercise the MOCK services directly against fresh
 * in-memory stores per test. `delay` is stubbed so the suite stays
 * fast.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FOLLOWUP_STATUS, FOLLOWUP_TYPES, mockRfqFollowUpService, rfqFollowUpsStore
} from './rfqFollowUp';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
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
  const { mockVendorService } = await import('./vendor');
  for (const name of ['Tata Steel Ltd', 'JSW Steel']) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

const VENDOR_A = 'Tata Steel Ltd';
const VENDOR_B = 'JSW Steel';

function rfqItems() {
  return [
    { product: 'HR coil 3mm', hsn: '7208', uom: 'Kg', qty: 8000, rate: 24.5, expectedRate: 24.5, specification: 'IS 2062 E250', requiredDate: '2026-09-15' },
    { product: 'MS plate 6mm', hsn: '7208', uom: 'Kg', qty: 1200, rate: 28, expectedRate: 28, specification: 'IS 2062', requiredDate: '2026-09-15' }
  ];
}

/** Creates a fresh RFQ in Approved state (not yet sent). */
async function createApprovedRfq() {
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
    vendorNames: [VENDOR_A, VENDOR_B],
    items: rfqItems()
  });
  await mockRfqService.submitForReview(draft.id);
  await mockRfqService.approveRfq(draft.id);
  return mockRfqService.getRfq(draft.id);
}

const followUpsFor = (rfqNo) =>
  rfqFollowUpsStore.all.filter((record) => record.rfqNo === rfqNo);

describe('Auto follow-up when an RFQ is sent', () => {
  it('RULE 1 — sending an RFQ with no responses auto-creates a pending vendor-response follow-up', async () => {
    /* The due-date rule is "the RFQ's own closing date while it is still ahead,
       otherwise a 7-day chase window", so the assertion below is only stable
       while the clock is before the closing date. It silently became today+7
       once 2026-09-10 passed; freezing Date (and only Date — the service delays
       stay real, they are mocked away in this file) pins the branch under test. */
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-01T09:00:00Z'));
    try {
      const rfq = await createApprovedRfq();
      expect(followUpsFor(rfq.rfqNo)).toHaveLength(0);

      const sent = await mockRfqService.sendRfq(rfq.id);

      const auto = followUpsFor(rfq.rfqNo);
      expect(auto).toHaveLength(1);
      expect(auto[0].type).toBe(FOLLOWUP_TYPES[0]); // 'Vendor Response Pending'
      expect(auto[0].status).toBe(FOLLOWUP_STATUS.PENDING);
      expect(auto[0].autoCreated).toBe(true);
      expect(auto[0].rfqNo).toBe(rfq.rfqNo);
      /* Closing date still ahead → the follow-up is due on it. */
      expect(auto[0].followUpDate).toBe('2026-09-10');
      /* The activity trail records the auto-creation. */
      expect(auto[0].activity.some((entry) => entry.type === 'create')).toBe(true);
      expect(sent.status).toBe('Sent');
    } finally {
      vi.useRealTimers();
    }
  });

  it("RULE 1b — an RFQ whose closing date has passed gets the 7-day chase window", async () => {
    /* The other half of the same rule, and the branch that made the assertion
       above drift as time moved on. */
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-15T09:00:00Z'));
    try {
      const rfq = await createApprovedRfq();
      await mockRfqService.sendRfq(rfq.id);

      const auto = followUpsFor(rfq.rfqNo);
      expect(auto).toHaveLength(1);
      expect(rfq.dueDate).toBe('2026-09-10');
      expect(auto[0].followUpDate).toBe('2026-10-22'); // today + 7 days
    } finally {
      vi.useRealTimers();
    }
  });

  it('RULE 2 — never duplicates when an open vendor-response follow-up already exists', async () => {
    const rfq = await createApprovedRfq();
    const before = rfqFollowUpsStore.all.length;
    /* A manually-created reminder for the same situation already exists
       before the RFQ is sent — the auto rule must not stack on top. */
    await mockRfqFollowUpService.createFollowUp({
      rfqNo: rfq.rfqNo,
      type: FOLLOWUP_TYPES[0],
      followUpDate: '2026-09-05',
      followUpTime: '10:00',
      priority: 'High'
    });
    expect(followUpsFor(rfq.rfqNo).filter((record) => record.status === FOLLOWUP_STATUS.PENDING)).toHaveLength(1);

    await mockRfqService.sendRfq(rfq.id);
    /* Exactly one record was added overall (the manual one only). */
    expect(rfqFollowUpsStore.all.length).toBe(before + 1);
    expect(followUpsFor(rfq.rfqNo).filter((record) => record.status === FOLLOWUP_STATUS.PENDING)).toHaveLength(1);
  });

  it('RULE 3 — re-sending the RFQ does not create a second follow-up', async () => {
    const rfq = await createApprovedRfq();
    await mockRfqService.sendRfq(rfq.id);
    expect(followUpsFor(rfq.rfqNo)).toHaveLength(1);

    /* Move the RFQ back to Approved and send it again — the open
       follow-up is reused, never duplicated. */
    await mockRfqService.updateRfq(rfq.id, { status: 'Approved' });
    await mockRfqService.sendRfq(rfq.id);
    expect(followUpsFor(rfq.rfqNo)).toHaveLength(1);
  });

  it('RULE 4 — an RFQ that already has received responses gets no auto follow-up', async () => {
    const rfq = await createApprovedRfq();
    await mockRfqService.sendRfq(rfq.id);
    /* A vendor responds. */
    await mockRfqService.saveQuotation({
      rfqNo: rfq.rfqNo,
      vendor: VENDOR_A,
      submittedOn: '2026-08-15',
      validUntil: '2026-08-31',
      currency: 'INR',
      discount: 2,
      charges: 0,
      leadTime: 15,
      delivery: 12,
      paymentTerms: '30 Days',
      warranty: '12 Months',
      items: rfqItems().map((item) => ({
        product: item.product, hsn: item.hsn, uom: item.uom,
        qty: item.qty, rate: item.rate, gstRate: 18
      }))
    });

    const before = followUpsFor(rfq.rfqNo).length;
    /* Sending again (defensively: RFQ forced back to Approved) must not
       add a follow-up once responses exist. */
    await mockRfqService.updateRfq(rfq.id, { status: 'Approved' });
    await mockRfqService.sendRfq(rfq.id);
    expect(followUpsFor(rfq.rfqNo)).toHaveLength(before);
  });
});
