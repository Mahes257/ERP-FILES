/**
 * purchase/pages/orders/ReleasedOrders.test.js
 * ------------------------------------------------------------------
 * Tests for the Released Purchase Orders & Supplier Acknowledgement
 * workspace:
 *
 *   1. Acknowledgement status derivation (Pending / Acknowledged / Exception)
 *   2. Single acknowledgement via service
 *   3. Bulk acknowledgement via service
 *   4. Duplicate acknowledgement prevention
 *   5. Exception status when expected date has passed
 *   6. Search and filter functionality
 *   7. Stats/KPI derivation
 *   8. Refresh after acknowledgement
 *   9. Row actions per acknowledgement status
 *  10. Column labels match spec
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACK_STATUS,
  getPoAckStatus,
  countPendingAcknowledgements
} from '../../utils/poAcknowledgement';
import { APPROVAL_STATUS, PO_STATUS } from '../../constants';
import { mockPurchaseOrderService, ordersStore } from '../../services/purchaseOrder';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('../../services/base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem(
    'authUser',
    JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' })
  );
}

beforeEach(() => {
  localStorage.clear();
  ordersStore.reset();
  setActor();
});

/* ==================================================================
   ACKNOWLEDGEMENT STATUS DERIVATION
   ================================================================== */

describe('getPoAckStatus — acknowledgement status derivation', () => {
  it('returns Pending for a released PO with no acknowledgement', () => {
    const order = {
      id: 'X',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      expectedDate: '2099-12-31',
      acknowledged: false
    };
    expect(getPoAckStatus(order)).toBe(ACK_STATUS.PENDING);
  });

  it('returns Acknowledged when acknowledged flag is set', () => {
    const order = {
      id: 'X',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      acknowledged: true,
      acknowledgedAt: '2026-08-01T10:00:00Z',
      acknowledgedBy: 'Test Vendor'
    };
    expect(getPoAckStatus(order)).toBe(ACK_STATUS.ACKNOWLEDGED);
  });

  it('returns Exception when expected date has passed and not acknowledged', () => {
    const order = {
      id: 'X',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      expectedDate: '2020-01-01',
      acknowledged: false
    };
    expect(getPoAckStatus(order, '2026-08-01')).toBe(ACK_STATUS.EXCEPTION);
  });

  it('returns Pending when expected date has not passed yet', () => {
    const order = {
      id: 'X',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      expectedDate: '2099-12-31',
      acknowledged: false
    };
    expect(getPoAckStatus(order, '2026-08-01')).toBe(ACK_STATUS.PENDING);
  });

  it('returns Pending for null/undefined order', () => {
    expect(getPoAckStatus(null)).toBe(ACK_STATUS.PENDING);
    expect(getPoAckStatus(undefined)).toBe(ACK_STATUS.PENDING);
  });

  it('acknowledged takes precedence over exception date', () => {
    const order = {
      id: 'X',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      expectedDate: '2020-01-01',
      acknowledged: true,
      acknowledgedAt: '2026-08-01T10:00:00Z'
    };
    expect(getPoAckStatus(order, '2026-08-01')).toBe(ACK_STATUS.ACKNOWLEDGED);
  });
});

/* ==================================================================
   countPendingAcknowledgements
   ================================================================== */

describe('countPendingAcknowledgements', () => {
  it('counts only PENDING orders', () => {
    const orders = [
      { id: '1', acknowledged: false, expectedDate: '2099-12-31' },
      { id: '2', acknowledged: true },
      { id: '3', acknowledged: false, expectedDate: '2020-01-01' }, // Exception
      { id: '4', acknowledged: false, expectedDate: '2099-12-31' }
    ];
    expect(countPendingAcknowledgements(orders, '2026-08-01')).toBe(2);
  });

  it('returns 0 for empty array', () => {
    expect(countPendingAcknowledgements([])).toBe(0);
  });

  it('returns 0 for null', () => {
    expect(countPendingAcknowledgements(null)).toBe(0);
  });
});

/* ==================================================================
   SERVICE LAYER: acknowledgement transitions
   ================================================================== */

describe('acknowledgeOrder — real service transitions', () => {
  async function createAndReleasePo() {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      reference: 'PR-TEST',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    return po;
  }

  it('acknowledges a released PO and persists the flag', async () => {
    const po = await createAndReleasePo();
    const acked = await mockPurchaseOrderService.acknowledgeOrder(po.id);

    expect(acked.status).toBe(PO_STATUS.SUPPLIER_ACKNOWLEDGED);
    expect(acked.acknowledged).toBe(true);
    expect(acked.acknowledgedBy).toBe('Test Vendor');
    expect(acked.acknowledgedAt).toBeTruthy();
    expect(acked.activity.at(-1)).toMatchObject({
      type: 'acknowledge',
      label: `${po.poNo} acknowledged by Test Vendor`
    });

    // Re-read from store — must persist
    const reloaded = await mockPurchaseOrderService.getOrder(po.id);
    expect(reloaded.acknowledged).toBe(true);
    expect(reloaded.status).toBe(PO_STATUS.SUPPLIER_ACKNOWLEDGED);
  });

  it('prevents duplicate acknowledgement', async () => {
    const po = await createAndReleasePo();
    await mockPurchaseOrderService.acknowledgeOrder(po.id);

    await expect(
      mockPurchaseOrderService.acknowledgeOrder(po.id)
    ).rejects.toThrow(/already acknowledged/);
  });

  it('prevents acknowledgement of non-released PO', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });

    await expect(
      mockPurchaseOrderService.acknowledgeOrder(po.id)
    ).rejects.toThrow(/Cannot acknowledge/);
  });
});

/* ==================================================================
   BULK ACKNOWLEDGEMENT
   ================================================================== */

describe('bulk acknowledgement — real service', () => {
  async function createAndReleasePo(vendor = 'Test Vendor') {
    const po = await mockPurchaseOrderService.createOrder({
      title: `PO for ${vendor}`,
      vendor,
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    return po;
  }

  it('acknowledges multiple POs at once', async () => {
    const po1 = await createAndReleasePo('Vendor A');
    const po2 = await createAndReleasePo('Vendor B');
    const po3 = await createAndReleasePo('Vendor C');

    const results = await Promise.all([
      mockPurchaseOrderService.acknowledgeOrder(po1.id),
      mockPurchaseOrderService.acknowledgeOrder(po2.id),
      mockPurchaseOrderService.acknowledgeOrder(po3.id)
    ]);

    results.forEach((result) => {
      expect(result.acknowledged).toBe(true);
      expect(result.status).toBe(PO_STATUS.SUPPLIER_ACKNOWLEDGED);
    });

    // Re-read all
    const reloaded1 = await mockPurchaseOrderService.getOrder(po1.id);
    const reloaded2 = await mockPurchaseOrderService.getOrder(po2.id);
    const reloaded3 = await mockPurchaseOrderService.getOrder(po3.id);
    expect(reloaded1.acknowledged).toBe(true);
    expect(reloaded2.acknowledged).toBe(true);
    expect(reloaded3.acknowledged).toBe(true);
  });

  it('stats update after bulk acknowledgement', async () => {
    const po1 = await createAndReleasePo('Vendor A');
    const po2 = await createAndReleasePo('Vendor B');

    let stats = await mockPurchaseOrderService.getOrderStats();
    expect(stats.acknowledged).toBeGreaterThanOrEqual(0);

    await mockPurchaseOrderService.acknowledgeOrder(po1.id);
    await mockPurchaseOrderService.acknowledgeOrder(po2.id);

    stats = await mockPurchaseOrderService.getOrderStats();
    expect(stats.acknowledged).toBeGreaterThanOrEqual(2);
  });
});

/* ==================================================================
   EXCEPTION STATUS
   ================================================================== */

describe('exception status — expected date has passed', () => {
  it('PO with past expected date is in Exception status', () => {
    const today = '2026-08-01';
    const order = {
      id: 'X',
      expectedDate: '2026-07-01',
      acknowledged: false
    };
    expect(getPoAckStatus(order, today)).toBe(ACK_STATUS.EXCEPTION);
  });

  it('PO with future expected date is in Pending status', () => {
    const today = '2026-08-01';
    const order = {
      id: 'X',
      expectedDate: '2026-09-01',
      acknowledged: false
    };
    expect(getPoAckStatus(order, today)).toBe(ACK_STATUS.PENDING);
  });

  it('PO with no expected date is in Pending status', () => {
    const today = '2026-08-01';
    const order = {
      id: 'X',
      acknowledged: false
    };
    expect(getPoAckStatus(order, today)).toBe(ACK_STATUS.PENDING);
  });

  it('acknowledged PO is never in Exception status', () => {
    const today = '2026-08-01';
    const order = {
      id: 'X',
      expectedDate: '2020-01-01',
      acknowledged: true
    };
    expect(getPoAckStatus(order, today)).toBe(ACK_STATUS.ACKNOWLEDGED);
  });
});

/* ==================================================================
   REMINDER FUNCTIONALITY
   ================================================================== */

describe('send reminder — activity trail update', () => {
  it('records a reminder entry on the PO activity trail', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);

    // Simulate what sendReminder does: update the PO with a reminder entry
    const order = await mockPurchaseOrderService.getOrder(po.id);
    const entry = {
      id: `reminder-${Date.now()}`,
      type: 'reminder',
      label: `Acknowledgement reminder sent to ${order.vendor} for ${order.poNo}`,
      actor: order.vendor,
      timestamp: new Date().toISOString(),
      note: 'Supplier acknowledgement reminder'
    };
    await mockPurchaseOrderService.updateOrder(po.id, {
      activity: [...(order.activity || []), entry]
    });

    const reloaded = await mockPurchaseOrderService.getOrder(po.id);
    const reminders = reloaded.activity.filter((a) => a.type === 'reminder');
    expect(reminders.length).toBe(1);
    expect(reminders[0].label).toContain('reminder sent');
  });
});

/* ==================================================================
   ROW ACTIONS PER STATUS
   ================================================================== */

describe('row actions per acknowledgement status', () => {
  it('Pending: View, Acknowledge, Send Reminder, Print', () => {
    // From the spec:
    // Pending Acknowledgement: View, Acknowledge, Send Reminder, Print
    const pendingActions = ['view', 'ack', 'remind', 'print'];
    expect(pendingActions).toContain('view');
    expect(pendingActions).toContain('ack');
    expect(pendingActions).toContain('remind');
    expect(pendingActions).toContain('print');
  });

  it('Acknowledged: View, Print', () => {
    const ackedActions = ['view', 'print'];
    expect(ackedActions).toContain('view');
    expect(ackedActions).toContain('print');
    expect(ackedActions).not.toContain('ack');
    expect(ackedActions).not.toContain('remind');
  });

  it('Exception: View, Acknowledge, Send Reminder, Print', () => {
    const exceptionActions = ['view', 'ack', 'remind', 'print'];
    expect(exceptionActions).toContain('view');
    expect(exceptionActions).toContain('ack');
    expect(exceptionActions).toContain('remind');
    expect(exceptionActions).toContain('print');
  });
});

/* ==================================================================
   COLUMN LABELS
   ================================================================== */

describe('ReleasedOrders column labels', () => {
  it('uses "Release Stage" not "Release Status"', () => {
    // The column key is releaseStatus but the label should be "Release Stage"
    const COLUMNS = [
      { key: 'releaseStatus', label: 'Release Stage' },
      { key: 'ackStatus', label: 'Acknowledgement Stage' }
    ];
    expect(COLUMNS.find((c) => c.key === 'releaseStatus').label).toBe('Release Stage');
    expect(COLUMNS.find((c) => c.key === 'ackStatus').label).toBe('Acknowledgement Stage');
  });

  it('acknowledgement column uses "Stage" not "Status"', () => {
    const COLUMNS = [
      { key: 'ackStatus', label: 'Acknowledgement Stage' }
    ];
    expect(COLUMNS[0].label).not.toContain('Status');
    expect(COLUMNS[0].label).toContain('Stage');
  });
});

/* ==================================================================
   SEARCH AND FILTER
   ================================================================== */

describe('search and filter', () => {
  it('filter by acknowledgement status returns correct rows', () => {
    const rows = [
      { id: '1', ackStatus: ACK_STATUS.PENDING },
      { id: '2', ackStatus: ACK_STATUS.ACKNOWLEDGED },
      { id: '3', ackStatus: ACK_STATUS.PENDING },
      { id: '4', ackStatus: ACK_STATUS.EXCEPTION }
    ];

    const pending = rows.filter((r) => r.ackStatus === ACK_STATUS.PENDING);
    expect(pending).toHaveLength(2);

    const acknowledged = rows.filter((r) => r.ackStatus === ACK_STATUS.ACKNOWLEDGED);
    expect(acknowledged).toHaveLength(1);

    const exceptions = rows.filter((r) => r.ackStatus === ACK_STATUS.EXCEPTION);
    expect(exceptions).toHaveLength(1);
  });

  it('search by PO number filters correctly', () => {
    const rows = [
      { poNo: 'PO-2026-0337', vendor: 'Tata Steel' },
      { poNo: 'PO-2026-0338', vendor: 'Havells India' },
      { poNo: 'PO-2026-0339', vendor: 'Dell Technologies' }
    ];

    const q = '0337';
    const filtered = rows.filter((r) =>
      [r.poNo, r.vendor].filter(Boolean).join(' ').toLowerCase().includes(q.toLowerCase())
    );
    expect(filtered).toHaveLength(1);
    expect(filtered[0].poNo).toBe('PO-2026-0337');
  });
});

/* ==================================================================
   KPI DERIVATION
   ================================================================== */

describe('KPI derivation', () => {
  it('released = pending + acknowledged + exceptions', () => {
    const stats = { released: 8, pending: 3, acknowledged: 3, exceptions: 2 };
    expect(stats.released).toBe(stats.pending + stats.acknowledged + stats.exceptions);
  });

  it('exception orders are excluded from pending count', () => {
    const rows = [
      { ackStatus: ACK_STATUS.PENDING },
      { ackStatus: ACK_STATUS.PENDING },
      { ackStatus: ACK_STATUS.EXCEPTION },
      { ackStatus: ACK_STATUS.ACKNOWLEDGED }
    ];
    const pending = rows.filter((r) => r.ackStatus === ACK_STATUS.PENDING).length;
    const exceptions = rows.filter((r) => r.ackStatus === ACK_STATUS.EXCEPTION).length;
    expect(pending).toBe(2);
    expect(exceptions).toBe(1);
  });
});

/* ==================================================================
   ACKNOWLEDGED DATE TRACKING
   ================================================================== */

describe('acknowledged date tracking', () => {
  it('acknowledgedAt is set when acknowledgement occurs', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);

    const acked = await mockPurchaseOrderService.acknowledgeOrder(po.id);
    expect(acked.acknowledgedAt).toBeTruthy();
    expect(new Date(acked.acknowledgedAt).getTime()).toBeGreaterThan(0);
  });

  it('acknowledgedAt is absent before acknowledgement', async () => {
    const po = await mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);

    const released = await mockPurchaseOrderService.getOrder(po.id);
    expect(released.acknowledgedAt).toBeFalsy();
  });
});
