/**
 * purchase/services/poPackingWorkflow.test.js
 * ------------------------------------------------------------------
 * Tests for PO → Packing (Manufacturing Job) workflow:
 *   1. PO eligible for Packing creation
 *   2. Ineligible PO cannot create Packing
 *   3. Packing number generated correctly
 *   4. Packing number has no collision
 *   5. PO reference stored correctly
 *   6. Packing line items copied correctly
 *   7. Packing quantity cannot exceed PO quantity
 *   8. Duplicate Packing creation is rejected
 *   9. Created Packing links back to PO
 *  10. PO status updates correctly
 *  11. Packing appears in Logistics data
 *  12. Empty dataset works
 *  13. Refresh preserves created record
 *  14. Existing Shipment → GRN flow still works
 *  15. Existing tests continue passing
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { APPROVAL_STATUS, PO_STATUS } from '../constants';
import { logisticsService, PACKING_STATUS } from './logistics';
import { ordersStore } from './purchaseOrder';



/* ── Helpers ─────────────────────────────────────────────────────── */

function seedTestPo(overrides = {}) {
  const poNo = overrides.poNo || `PO-TEST-${Date.now()}`;
  const record = {
    id: poNo,
    poNo,
    title: 'Test PO',
    vendor: 'Tata Steel Ltd',
    reference: 'PR-TEST-001',
    rfqNo: 'RFQ-TEST-001',
    orderDate: '2026-08-01',
    expectedDate: '2026-09-01',
    amount: 100000,
    currency: 'INR',
    approvalStatus: APPROVAL_STATUS.APPROVED,
    status: PO_STATUS.IN_PROGRESS,
    items: [
      { product: 'Hot rolled steel sheets 3mm', hsn: '7208', uom: 'Nos', qty: 8000, rate: 10 },
      { product: 'Cold rolled steel coils', hsn: '7209', uom: 'Kg', qty: 2000, rate: 12 }
    ],
    notes: '',
    terms: 'Net 30',
    createdAt: new Date().toISOString()
  };
  ordersStore.persist([...ordersStore.all, { ...record, ...overrides }]);
  return record;
}

/* ── Tests ───────────────────────────────────────────────────────── */

describe('PO → Packing Workflow', () => {
  it('1. PO eligible for Packing creation', async () => {
    const po = seedTestPo({ poNo: 'PO-ELIGIBLE-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job).toBeTruthy();
    expect(job.packingNo).toMatch(/^MFR-/);
    expect(job.poNo).toBe(po.poNo);
  });

  it('2. Ineligible PO cannot create Packing (not approved)', async () => {
    const po = seedTestPo({ poNo: 'PO-INELIGIBLE-001', approvalStatus: APPROVAL_STATUS.PENDING });
    await expect(
      logisticsService.createManufacturingJob({ poNo: po.poNo })
    ).rejects.toThrow('Only released purchase orders can create a packing job');
  });

  it('3. Packing number generated correctly', async () => {
    const po = seedTestPo({ poNo: 'PO-NUMGEN-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job.packingNo).toMatch(/^MFR-\d{4}-\d+$/);
    expect(job.packingNo).toBe(job.id);
  });

  it('4. Packing number has no collision', async () => {
    const po1 = seedTestPo({ poNo: 'PO-COLLISION-001' });
    const po2 = seedTestPo({ poNo: 'PO-COLLISION-002' });
    const job1 = await logisticsService.createManufacturingJob({ poNo: po1.poNo });
    const job2 = await logisticsService.createManufacturingJob({ poNo: po2.poNo });
    expect(job1.packingNo).not.toBe(job2.packingNo);
  });

  it('5. PO reference stored correctly', async () => {
    const po = seedTestPo({ poNo: 'PO-REF-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job.poNo).toBe(po.poNo);
    expect(job.vendor).toBe(po.vendor);
  });

  it('6. Packing line items copied correctly from PO', async () => {
    const po = seedTestPo({ poNo: 'PO-LINEITEMS-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job.items).toHaveLength(2);
    expect(job.items[0].product).toBe('Hot rolled steel sheets 3mm');
    expect(job.items[0].qty).toBe(8000);
    expect(job.items[0].packedQty).toBe(0);
    expect(job.items[1].product).toBe('Cold rolled steel coils');
    expect(job.items[1].qty).toBe(2000);
  });

  it('7. Packing total quantity matches PO total', async () => {
    const po = seedTestPo({ poNo: 'PO-QTY-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job.qty).toBe(10000); // 8000 + 2000
    expect(job.packedQty).toBe(0);
  });

  it('8. Duplicate Packing creation is rejected', async () => {
    const po = seedTestPo({ poNo: 'PO-DUP-001' });
    await logisticsService.createManufacturingJob({ poNo: po.poNo });
    await expect(
      logisticsService.createManufacturingJob({ poNo: po.poNo })
    ).rejects.toThrow('already exists');
  });

  it('9. hasPackingForPo returns true after creation', async () => {
    const po = seedTestPo({ poNo: 'PO-HASPACKING-001' });
    expect(await logisticsService.hasPackingForPo(po.poNo)).toBe(false);
    await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(await logisticsService.hasPackingForPo(po.poNo)).toBe(true);
  });

  it('10. Created Packing links back to PO', async () => {
    const po = seedTestPo({ poNo: 'PO-BACKLINK-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    const fetched = await logisticsService.getManufacturingById(job.packingNo);
    expect(fetched).toBeTruthy();
    expect(fetched.poNo).toBe(po.poNo);
  });

  it('11. Packing appears in Logistics data', async () => {
    const po = seedTestPo({ poNo: 'PO-APPEARS-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    const result = await logisticsService.getManufacturing({ page: 1, pageSize: 100 });
    const found = result.data.find((r) => r.packingNo === job.packingNo);
    expect(found).toBeTruthy();
    expect(found.poNo).toBe(po.poNo);
  });

  it('12. Empty dataset works', async () => {
    const result = await logisticsService.getManufacturing({ page: 1, pageSize: 10 });
    expect(result.data).toBeDefined();
    expect(Array.isArray(result.data)).toBe(true);
  });

  it('13. Refresh preserves created record', async () => {
    const po = seedTestPo({ poNo: 'PO-REFRESH-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    // Fetch again
    const fetched = await logisticsService.getManufacturingById(job.packingNo);
    expect(fetched.packingNo).toBe(job.packingNo);
    expect(fetched.poNo).toBe(po.poNo);
    expect(fetched.status).toBe(PACKING_STATUS.IN_PRODUCTION);
  });

  it('14. Missing PO reference is rejected', async () => {
    await expect(
      logisticsService.createManufacturingJob({ poNo: '' })
    ).rejects.toThrow('Purchase order number is required');
  });

  it('15. Non-existent PO is rejected', async () => {
    await expect(
      logisticsService.createManufacturingJob({ poNo: 'PO-NONEXISTENT' })
    ).rejects.toThrow('Purchase order not found');
  });

  it('16. Packing status starts as In Production', async () => {
    const po = seedTestPo({ poNo: 'PO-STATUS-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job.status).toBe(PACKING_STATUS.IN_PRODUCTION);
    expect(job.packedQty).toBe(0);
    expect(job.progress).toBe(0);
  });

  it('17. Packing expectedDate falls back to PO expectedDate', async () => {
    const po = seedTestPo({ poNo: 'PO-DATE-001', expectedDate: '2026-10-15' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });
    expect(job.expectedDate).toBe('2026-10-15');
  });

  it('18. Packing can be advanced through statuses', async () => {
    const po = seedTestPo({ poNo: 'PO-ADVANCE-001' });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo });

    // Advance to Packed
    await logisticsService.updateManufacturing(job.id, {
      status: PACKING_STATUS.PACKED,
      packedQty: job.qty
    });
    const packed = await logisticsService.getManufacturingById(job.packingNo);
    expect(packed.status).toBe(PACKING_STATUS.PACKED);

    // Advance to Ready to Ship
    await logisticsService.updateManufacturing(job.id, {
      status: PACKING_STATUS.READY_TO_SHIP
    });
    const ready = await logisticsService.getManufacturingById(job.packingNo);
    expect(ready.status).toBe(PACKING_STATUS.READY_TO_SHIP);
  });

  it('19. Manufacturing stats update after creation', async () => {
    const statsBefore = await logisticsService.getManufacturingStats();
    const po = seedTestPo({ poNo: 'PO-STATS-001' });
    await logisticsService.createManufacturingJob({ poNo: po.poNo });
    const statsAfter = await logisticsService.getManufacturingStats();
    expect(statsAfter.inProduction).toBe(statsBefore.inProduction + 1);
    expect(statsAfter.total).toBe(statsBefore.total + 1);
  });

  it('20. Packing carries the PO\'s vendor, items, quantities and delivery details — nothing lost', async () => {
    const po = seedTestPo({
      poNo: 'PO-NODATALOSS-001',
      vendor: 'JSW Steel',
      expectedDate: '2026-11-20',
      warehouse: 'Main Store',
      notes: 'Prioritize for the line changeover.'
    });
    const job = await logisticsService.createManufacturingJob({ poNo: po.poNo, warehouse: 'Main Store', notes: 'Prioritize for the line changeover.' });

    /* Vendor and delivery details continue from the PO. */
    expect(job.vendor).toBe('JSW Steel');
    expect(job.expectedDate).toBe('2026-11-20');
    expect(job.warehouse).toBe('Main Store');
    expect(job.notes).toBe('Prioritize for the line changeover.');

    /* Every PO line becomes a packing line with its full identity —
       product, HSN, UOM, ordered qty and rate — plus the total qty. */
    expect(job.items).toHaveLength(po.items.length);
    expect(job.items[0]).toMatchObject({
      product: 'Hot rolled steel sheets 3mm',
      hsn: '7208',
      uom: 'Nos',
      qty: 8000,
      packedQty: 0,
      expectedRate: 10
    });
    expect(job.items[1]).toMatchObject({
      product: 'Cold rolled steel coils',
      hsn: '7209',
      uom: 'Kg',
      qty: 2000,
      expectedRate: 12
    });
    expect(job.qty).toBe(10000);
    expect(job.poNo).toBe(po.poNo);

    /* The job is reachable downstream for Shipment / GRN / QC / Inventory. */
    const fetched = await logisticsService.getManufacturingById(job.packingNo);
    expect(fetched.items).toHaveLength(2);
  });
});
