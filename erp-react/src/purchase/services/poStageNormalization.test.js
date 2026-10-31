/**
 * purchase/services/poStageNormalization.test.js
 * ------------------------------------------------------------------
 * Tests for the canonical PO stage system:
 *
 *   1. Legacy Open → In Progress normalization
 *   2. Legacy Partial → Partially Delivered normalization
 *   3. Every valid stage transition
 *   4. Invalid transitions are prevented
 *   5. Returned PO objects never expose legacy Open/Partial
 *   6. Dashboard and stats use canonical stages
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  APPROVAL_STATUS,
  PO_STATUS,
  isValidPOTransition,
  normalizePOStatus,
  normalizePoRecord
} from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

/* Deterministic signed-in user for activity/audit actor names. */
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
   LEGACY STATUS NORMALIZATION
   ================================================================== */

describe('normalizePOStatus — legacy-to-canonical mapping', () => {
  it('maps "Open" to "In Progress"', () => {
    expect(normalizePOStatus('Open')).toBe(PO_STATUS.IN_PROGRESS);
  });

  it('maps "Partial" to "Partially Delivered"', () => {
    expect(normalizePOStatus('Partial')).toBe(PO_STATUS.PARTIALLY_DELIVERED);
  });

  it('passes canonical stages through unchanged', () => {
    Object.values(PO_STATUS).forEach((status) => {
      expect(normalizePOStatus(status)).toBe(status);
    });
  });

  it('returns unknown values as-is', () => {
    expect(normalizePOStatus('SomethingWeird')).toBe('SomethingWeird');
    expect(normalizePOStatus('')).toBe('');
    expect(normalizePOStatus(null)).toBeNull();
    expect(normalizePOStatus(undefined)).toBeUndefined();
  });
});

describe('normalizePoRecord — record-level normalization', () => {
  it('normalizes the status field of a PO record', () => {
    const order = { id: 'X', status: 'Open', poNo: 'PO-TEST' };
    const normalized = normalizePoRecord(order);
    expect(normalized.status).toBe(PO_STATUS.IN_PROGRESS);
  });

  it('returns the same reference when status is already canonical', () => {
    const order = { id: 'X', status: PO_STATUS.COMPLETED, poNo: 'PO-TEST' };
    const result = normalizePoRecord(order);
    expect(result).toBe(order); // same reference — no unnecessary clone
  });

  it('returns null/undefined as-is', () => {
    expect(normalizePoRecord(null)).toBeNull();
    expect(normalizePoRecord(undefined)).toBeUndefined();
  });
});

/* ==================================================================
   SERVICE-LAYER: RETURNED PO OBJECTS NEVER EXPOSE LEGACY STATUS
   ================================================================== */

describe('returned PO objects never expose legacy Open/Partial', () => {
  it('getOrder normalizes a PO with legacy "Open" status', async () => {
    // Directly inject a legacy record into the store
    const records = ordersStore.all;
    records.push({
      id: 'LEGACY-001',
      poNo: 'PO-LEGACY-001',
      status: 'Open',
      title: 'Legacy Open PO',
      vendor: 'Test Vendor',
      reference: 'PR-2026-0999',
      orderDate: '2026-08-01',
      expectedDate: '2026-09-01',
      terms: '30 Days',
      discount: 0,
      charges: 0,
      amount: 10000,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      items: [],
      activity: []
    });
    ordersStore.persist(records);

    const po = await mockPurchaseOrderService.getOrder('LEGACY-001');
    expect(po.status).toBe(PO_STATUS.IN_PROGRESS);
    expect(po.status).not.toBe('Open');
  });

  it('getOrder normalizes a PO with legacy "Partial" status', async () => {
    const records = ordersStore.all;
    records.push({
      id: 'LEGACY-002',
      poNo: 'PO-LEGACY-002',
      status: 'Partial',
      title: 'Legacy Partial PO',
      vendor: 'Test Vendor',
      reference: 'PR-2026-0998',
      orderDate: '2026-08-01',
      expectedDate: '2026-09-01',
      terms: '30 Days',
      discount: 0,
      charges: 0,
      amount: 20000,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      items: [],
      activity: []
    });
    ordersStore.persist(records);

    const po = await mockPurchaseOrderService.getOrder('LEGACY-002');
    expect(po.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(po.status).not.toBe('Partial');
  });

  it('getOrders normalizes legacy statuses in every returned record', async () => {
    const records = ordersStore.all;
    records.push(
      {
        id: 'LEGACY-003',
        poNo: 'PO-LEGACY-003',
        status: 'Open',
        title: 'Legacy Open 3',
        vendor: 'A',
        orderDate: '2026-08-01',
        approvalStatus: APPROVAL_STATUS.APPROVED,
        items: [],
        activity: []
      },
      {
        id: 'LEGACY-004',
        poNo: 'PO-LEGACY-004',
        status: 'Partial',
        title: 'Legacy Partial 4',
        vendor: 'B',
        orderDate: '2026-08-02',
        approvalStatus: APPROVAL_STATUS.APPROVED,
        items: [],
        activity: []
      }
    );
    ordersStore.persist(records);

    const result = await mockPurchaseOrderService.getOrders({
      search: 'PO-LEGACY',
      page: 1,
      pageSize: 10
    });

    result.data.forEach((po) => {
      expect(po.status).not.toBe('Open');
      expect(po.status).not.toBe('Partial');
      expect(PO_STATUS[Object.keys(PO_STATUS).find((k) => PO_STATUS[k] === po.status)]).toBeDefined()
        || expect(Object.values(PO_STATUS)).toContain(po.status);
    });
  });

  it('getOrderStats counts legacy statuses under canonical stages', async () => {
    const records = ordersStore.all;
    records.push(
      {
        id: 'LEGACY-005',
        poNo: 'PO-LEGACY-005',
        status: 'Open',
        vendor: 'A',
        orderDate: '2026-08-01',
        approvalStatus: APPROVAL_STATUS.APPROVED,
        amount: 5000,
        items: [],
        activity: []
      },
      {
        id: 'LEGACY-006',
        poNo: 'PO-LEGACY-006',
        status: 'Partial',
        vendor: 'B',
        orderDate: '2026-08-02',
        approvalStatus: APPROVAL_STATUS.APPROVED,
        amount: 8000,
        items: [],
        activity: []
      }
    );
    ordersStore.persist(records);

    const stats = await mockPurchaseOrderService.getOrderStats();
    // Legacy "Open" should be counted under IN_PROGRESS
    expect(stats[PO_STATUS.IN_PROGRESS]).toBeGreaterThanOrEqual(1);
    // Legacy "Partial" should be counted under PARTIALLY_DELIVERED
    expect(stats[PO_STATUS.PARTIALLY_DELIVERED]).toBeGreaterThanOrEqual(1);
    // No "Open" or "Partial" keys in stats
    expect(stats.Open).toBeUndefined();
    expect(stats.Partial).toBeUndefined();
  });
});

/* ==================================================================
   STAGE TRANSITIONS — valid transitions
   ================================================================== */

describe('PO stage transitions — valid transitions', () => {
  /** Helper: create a fresh PO (starts at Pending Approval) */
  async function createFreshPo(overrides = {}) {
    return mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      reference: 'PR-TEST',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }],
      ...overrides
    });
  }

  it('Open → In Progress: legacy record returned with canonical In Progress', async () => {
    // Inject a legacy "Open" record
    const records = ordersStore.all;
    records.push({
      id: 'OPEN-001',
      poNo: 'PO-OPEN-001',
      status: 'Open',
      title: 'Open PO',
      vendor: 'V',
      orderDate: '2026-08-01',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      amount: 1000,
      items: [],
      activity: []
    });
    ordersStore.persist(records);

    const po = await mockPurchaseOrderService.getOrder('OPEN-001');
    expect(po.status).toBe(PO_STATUS.IN_PROGRESS);
  });

  it('Partial → Partially Delivered: legacy record returned with canonical stage', async () => {
    const records = ordersStore.all;
    records.push({
      id: 'PARTIAL-001',
      poNo: 'PO-PARTIAL-001',
      status: 'Partial',
      title: 'Partial PO',
      vendor: 'V',
      orderDate: '2026-08-01',
      approvalStatus: APPROVAL_STATUS.APPROVED,
      amount: 1000,
      items: [],
      activity: []
    });
    ordersStore.persist(records);

    const po = await mockPurchaseOrderService.getOrder('PARTIAL-001');
    expect(po.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
  });

  it('Draft → Pending Approval (via updateOrder)', async () => {
    const created = await createFreshPo({ status: PO_STATUS.DRAFT });
    expect(created.status).toBe(PO_STATUS.DRAFT);

    const updated = await mockPurchaseOrderService.updateOrder(created.id, {
      status: PO_STATUS.PENDING_APPROVAL,
      approvalStatus: APPROVAL_STATUS.PENDING
    });
    expect(updated.status).toBe(PO_STATUS.PENDING_APPROVAL);
  });

  it('Pending Approval → Approved (via approveOrder)', async () => {
    const created = await createFreshPo();
    expect(created.status).toBe(PO_STATUS.PENDING_APPROVAL);

    const approved = await mockPurchaseOrderService.approveOrder(created.id);
    expect(approved.status).toBe(PO_STATUS.APPROVED);
    expect(approved.approvalStatus).toBe(APPROVAL_STATUS.APPROVED);
    expect(approved.activity.at(-1)).toMatchObject({
      type: 'approve',
      label: `${created.poNo} approved`
    });
  });

  it('Approved → Released (via releaseOrder)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);

    const released = await mockPurchaseOrderService.releaseOrder(created.id);
    expect(released.status).toBe(PO_STATUS.RELEASED);
    expect(released.releasedAt).toBeTruthy();
  });

  it('Released → Supplier Acknowledged (via acknowledgeOrder)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);
    await mockPurchaseOrderService.releaseOrder(created.id);

    const acked = await mockPurchaseOrderService.acknowledgeOrder(created.id);
    expect(acked.status).toBe(PO_STATUS.SUPPLIER_ACKNOWLEDGED);
    expect(acked.acknowledged).toBe(true);
    expect(acked.acknowledgedBy).toBe(created.vendor);
  });

  it('Supplier Acknowledged → In Progress (via startOrder)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);
    await mockPurchaseOrderService.releaseOrder(created.id);
    await mockPurchaseOrderService.acknowledgeOrder(created.id);

    const started = await mockPurchaseOrderService.startOrder(created.id);
    expect(started.status).toBe(PO_STATUS.IN_PROGRESS);
    expect(started.startedAt).toBeTruthy();
  });

  it('In Progress → Partially Delivered (via markPartiallyDelivered)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);
    await mockPurchaseOrderService.releaseOrder(created.id);
    await mockPurchaseOrderService.acknowledgeOrder(created.id);
    await mockPurchaseOrderService.startOrder(created.id);

    const partial = await mockPurchaseOrderService.markPartiallyDelivered(created.id);
    expect(partial.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);
    expect(partial.partiallyDeliveredAt).toBeTruthy();
  });

  it('In Progress → Completed (via completeOrder)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);
    await mockPurchaseOrderService.releaseOrder(created.id);
    await mockPurchaseOrderService.acknowledgeOrder(created.id);
    await mockPurchaseOrderService.startOrder(created.id);

    const completed = await mockPurchaseOrderService.completeOrder(created.id);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);
    expect(completed.completedAt).toBeTruthy();
  });

  it('Partially Delivered → Completed (via completeOrder)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);
    await mockPurchaseOrderService.releaseOrder(created.id);
    await mockPurchaseOrderService.acknowledgeOrder(created.id);
    await mockPurchaseOrderService.startOrder(created.id);
    await mockPurchaseOrderService.markPartiallyDelivered(created.id);

    const completed = await mockPurchaseOrderService.completeOrder(created.id);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);
  });

  it('Completed → Closed (via closeOrder)', async () => {
    const created = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(created.id);
    await mockPurchaseOrderService.releaseOrder(created.id);
    await mockPurchaseOrderService.acknowledgeOrder(created.id);
    await mockPurchaseOrderService.startOrder(created.id);
    await mockPurchaseOrderService.completeOrder(created.id);

    const closed = await mockPurchaseOrderService.closeOrder(created.id);
    expect(closed.status).toBe(PO_STATUS.CLOSED);
    expect(closed.closedAt).toBeTruthy();
  });

  it('Any valid active stage → Cancelled (via cancelOrder)', async () => {
    const stages = [
      PO_STATUS.PENDING_APPROVAL,
      PO_STATUS.APPROVED,
      PO_STATUS.RELEASED,
      PO_STATUS.SUPPLIER_ACKNOWLEDGED,
      PO_STATUS.IN_PROGRESS,
      PO_STATUS.PARTIALLY_DELIVERED
    ];

    for (const stage of stages) {
      // Reset store for each iteration
      ordersStore.reset();
      setActor();

      const created = await createFreshPo();
      // Advance to the target stage
      if (stage !== PO_STATUS.PENDING_APPROVAL) {
        await mockPurchaseOrderService.approveOrder(created.id);
      }
      if ([PO_STATUS.RELEASED, PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.IN_PROGRESS,
        PO_STATUS.PARTIALLY_DELIVERED].includes(stage)) {
        await mockPurchaseOrderService.releaseOrder(created.id);
      }
      if ([PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.IN_PROGRESS, PO_STATUS.PARTIALLY_DELIVERED].includes(stage)) {
        await mockPurchaseOrderService.acknowledgeOrder(created.id);
      }
      if ([PO_STATUS.IN_PROGRESS, PO_STATUS.PARTIALLY_DELIVERED].includes(stage)) {
        await mockPurchaseOrderService.startOrder(created.id);
      }
      if (stage === PO_STATUS.PARTIALLY_DELIVERED) {
        await mockPurchaseOrderService.markPartiallyDelivered(created.id);
      }

      expect((await mockPurchaseOrderService.getOrder(created.id)).status).toBe(stage);

      const cancelled = await mockPurchaseOrderService.cancelOrder(created.id);
      expect(cancelled.status).toBe(PO_STATUS.CANCELLED);
      expect(cancelled.cancelledAt).toBeTruthy();
    }
  });

  it('full lifecycle: create → approve → release → acknowledge → start → partial → complete → close', async () => {
    const po = await createFreshPo();

    const approved = await mockPurchaseOrderService.approveOrder(po.id);
    expect(approved.status).toBe(PO_STATUS.APPROVED);

    const released = await mockPurchaseOrderService.releaseOrder(po.id);
    expect(released.status).toBe(PO_STATUS.RELEASED);

    const acked = await mockPurchaseOrderService.acknowledgeOrder(po.id);
    expect(acked.status).toBe(PO_STATUS.SUPPLIER_ACKNOWLEDGED);

    const started = await mockPurchaseOrderService.startOrder(po.id);
    expect(started.status).toBe(PO_STATUS.IN_PROGRESS);

    const partial = await mockPurchaseOrderService.markPartiallyDelivered(po.id);
    expect(partial.status).toBe(PO_STATUS.PARTIALLY_DELIVERED);

    const completed = await mockPurchaseOrderService.completeOrder(po.id);
    expect(completed.status).toBe(PO_STATUS.COMPLETED);

    const closed = await mockPurchaseOrderService.closeOrder(po.id);
    expect(closed.status).toBe(PO_STATUS.CLOSED);

    // Re-read from store: everything persisted with canonical stage
    const reloaded = await mockPurchaseOrderService.getOrder(po.id);
    expect(reloaded.status).toBe(PO_STATUS.CLOSED);
  });
});

/* ==================================================================
   STAGE TRANSITIONS — invalid transitions prevented
   ================================================================== */

describe('PO stage transitions — invalid transitions prevented', () => {
  async function createFreshPo() {
    return mockPurchaseOrderService.createOrder({
      title: 'Test PO',
      vendor: 'Test Vendor',
      reference: 'PR-TEST',
      terms: '30 Days',
      items: [{ product: 'Item', hsn: '7208', uom: 'Kg', qty: 100, rate: 25, gstRate: 18 }]
    });
  }

  it('cannot approve an already-approved PO', async () => {
    const po = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(po.id);
    await expect(mockPurchaseOrderService.approveOrder(po.id)).rejects.toThrow(
      /Cannot approve.*current stage is/
    );
  });

  it('cannot release a pending-approval PO', async () => {
    const po = await createFreshPo();
    await expect(mockPurchaseOrderService.releaseOrder(po.id)).rejects.toThrow(
      /Cannot release.*current stage is/
    );
  });

  it('cannot acknowledge a pending-approval PO', async () => {
    const po = await createFreshPo();
    await expect(mockPurchaseOrderService.acknowledgeOrder(po.id)).rejects.toThrow(
      /Cannot acknowledge.*current stage is/
    );
  });

  it('cannot start a pending-approval PO', async () => {
    const po = await createFreshPo();
    await expect(mockPurchaseOrderService.startOrder(po.id)).rejects.toThrow(
      /Cannot start.*current stage is/
    );
  });

  it('cannot complete a pending-approval PO', async () => {
    const po = await createFreshPo();
    await expect(mockPurchaseOrderService.completeOrder(po.id)).rejects.toThrow(
      /Cannot complete.*current stage is/
    );
  });

  it('cannot close a pending-approval PO', async () => {
    const po = await createFreshPo();
    await expect(mockPurchaseOrderService.closeOrder(po.id)).rejects.toThrow(
      /Cannot close.*current stage is/
    );
  });

  it('cannot move a completed PO backwards', async () => {
    const po = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    await mockPurchaseOrderService.startOrder(po.id);
    await mockPurchaseOrderService.completeOrder(po.id);

    await expect(
      mockPurchaseOrderService.setDeliveryStatus(po.id, PO_STATUS.IN_PROGRESS)
    ).rejects.toThrow(/completed purchase order cannot be moved back/);
  });

  it('cannot move a closed PO', async () => {
    const po = await createFreshPo();
    await mockPurchaseOrderService.approveOrder(po.id);
    await mockPurchaseOrderService.releaseOrder(po.id);
    await mockPurchaseOrderService.acknowledgeOrder(po.id);
    await mockPurchaseOrderService.startOrder(po.id);
    await mockPurchaseOrderService.completeOrder(po.id);
    await mockPurchaseOrderService.closeOrder(po.id);

    await expect(mockPurchaseOrderService.cancelOrder(po.id)).rejects.toThrow(
      /Cannot cancel.*current stage is/
    );
  });

  it('cannot move a cancelled PO', async () => {
    const po = await createFreshPo();
    await mockPurchaseOrderService.cancelOrder(po.id);

    await expect(mockPurchaseOrderService.approveOrder(po.id)).rejects.toThrow(
      /Cannot approve.*current stage is/
    );
  });
});

/* ==================================================================
   isValidPOTransition — direct unit tests
   ================================================================== */

describe('isValidPOTransition — transition matrix', () => {
  it('validates all forward transitions', () => {
    expect(isValidPOTransition(PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.PENDING_APPROVAL, PO_STATUS.APPROVED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.PENDING_APPROVAL, PO_STATUS.CANCELLED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.APPROVED, PO_STATUS.RELEASED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.APPROVED, PO_STATUS.CANCELLED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.RELEASED, PO_STATUS.SUPPLIER_ACKNOWLEDGED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.RELEASED, PO_STATUS.CANCELLED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.IN_PROGRESS)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.CANCELLED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.IN_PROGRESS, PO_STATUS.PARTIALLY_DELIVERED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.IN_PROGRESS, PO_STATUS.COMPLETED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.IN_PROGRESS, PO_STATUS.CANCELLED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.PARTIALLY_DELIVERED, PO_STATUS.COMPLETED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.PARTIALLY_DELIVERED, PO_STATUS.CANCELLED)).toBe(true);
    expect(isValidPOTransition(PO_STATUS.COMPLETED, PO_STATUS.CLOSED)).toBe(true);
  });

  it('rejects backward transitions', () => {
    expect(isValidPOTransition(PO_STATUS.COMPLETED, PO_STATUS.IN_PROGRESS)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.CLOSED, PO_STATUS.COMPLETED)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.CANCELLED, PO_STATUS.DRAFT)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.RELEASED, PO_STATUS.APPROVED)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.IN_PROGRESS, PO_STATUS.RELEASED)).toBe(false);
  });

  it('rejects skipped transitions', () => {
    expect(isValidPOTransition(PO_STATUS.DRAFT, PO_STATUS.COMPLETED)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.PENDING_APPROVAL, PO_STATUS.RELEASED)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.APPROVED, PO_STATUS.COMPLETED)).toBe(false);
  });

  it('closed and cancelled are terminal', () => {
    expect(isValidPOTransition(PO_STATUS.CLOSED, PO_STATUS.CANCELLED)).toBe(false);
    expect(isValidPOTransition(PO_STATUS.CANCELLED, PO_STATUS.CLOSED)).toBe(false);
  });
});
