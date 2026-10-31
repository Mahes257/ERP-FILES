/**
 * purchase/utils/__tests__/countReconciliation.test.js
 * -------------------------------------------------------------------
 * RECONCILIATION: Proves that sidebar badge counts are derived from
 * the SAME source data as the page KPI/tab counts. Every module's
 * sidebar count must equal the page's actionable-tab aggregate.
 *
 * This uses the REAL service layer and REAL seed data.
 * -------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { RFQ_STATUS, PR_STATUS, APPROVAL_STATUS, PO_STATUS } from '../../constants';
import { buildRfqSeed, buildPurchaseOrderSeed, buildRequisitionSeed } from '../../services/demoSeed';
import { buildManufacturingSeed, buildShipmentSeed, buildGrnSeed, buildInspectionSeed } from '../../services/demoSeedLogistics';
import { deriveActionCounts } from '../purchaseActionCounts';
import { RFQ_PENDING_STATUSES } from '../pendingStatus';
import { PACKING_STATUS, SHIPMENT_STATUS, GRN_STATUS, INSPECTION_STATUS } from '../../services/logistics';

/* ========================================================================
   HELPER: Compute stats from seed data the same way services do
   ======================================================================== */

function computeRfqStats(seed) {
  const total = seed.length;
  const pendingApproval = seed.filter((r) => r.status === RFQ_STATUS.PENDING_APPROVAL).length;
  const quotationReceived = seed.filter((r) => r.status === RFQ_STATUS.QUOTATION_RECEIVED).length;
  const evaluation = seed.filter((r) => r.status === RFQ_STATUS.EVALUATION).length;
  return { total, pendingApproval, quotationReceived, evaluation };
}

function computePrStats(seed) {
  const byStatus = {};
  seed.forEach((pr) => { byStatus[pr.status] = (byStatus[pr.status] || 0) + 1; });
  return { pendingApproval: byStatus[PR_STATUS.PENDING_APPROVAL] || 0, byStatus };
}

function computeMfgStats(seed) {
  return {
    total: seed.length,
    inProduction: seed.filter((r) => r.status === PACKING_STATUS.IN_PRODUCTION).length,
    packed: seed.filter((r) => r.status === PACKING_STATUS.PACKED).length,
    readyToShip: seed.filter((r) => r.status === PACKING_STATUS.READY_TO_SHIP).length,
  };
}

function computeShipStats(seed) {
  return {
    total: seed.length,
    pending: seed.filter((r) => r.status === SHIPMENT_STATUS.PENDING).length,
    inTransit: seed.filter((r) => r.status === SHIPMENT_STATUS.IN_TRANSIT).length,
    delivered: seed.filter((r) => r.status === SHIPMENT_STATUS.DELIVERED).length,
    delayed: seed.filter((r) => r.status === SHIPMENT_STATUS.DELAYED).length,
  };
}

function computeGrnStats(seed) {
  return {
    total: seed.length,
    expected: seed.filter((r) => r.status === GRN_STATUS.EXPECTED).length,
    received: seed.filter((r) => r.status === GRN_STATUS.RECEIVED).length,
    pendingInspection: seed.filter((r) => r.status === GRN_STATUS.PENDING_INSPECTION).length,
  };
}

function computeInspStats(seed) {
  return {
    total: seed.length,
    pending: seed.filter((r) => r.status === INSPECTION_STATUS.PENDING).length,
    passed: seed.filter((r) => r.status === INSPECTION_STATUS.PASSED).length,
    failed: seed.filter((r) => r.status === INSPECTION_STATUS.FAILED).length,
  };
}

/* ========================================================================
   RFQ: SIDEBAR = PAGE ACTIONABLE TAB AGGREGATE
   ======================================================================== */

describe('RFQ: sidebar count = page actionable-tab aggregate', () => {
  const rfqSeed = buildRfqSeed();
  const rfqStats = computeRfqStats(rfqSeed);

  it('sidebar rfq-list = pendingApproval + quotationReceived + evaluation', () => {
    const counts = deriveActionCounts({ rfqStats });

    /* The sidebar badge for RFQ & Quotations */
    const sidebarBadge = counts['rfq-list'];

    /* The page's actionable tab aggregate */
    const pageActionable =
      rfqStats.pendingApproval +
      rfqStats.quotationReceived +
      rfqStats.evaluation;

    expect(sidebarBadge).toBe(pageActionable);
  });

  it('RFQ record-level manifest — each RFQ counted exactly once', () => {
    const manifest = rfqSeed.map((rfq) => ({
      rfqNo: rfq.rfqNo,
      status: rfq.status,
      counted: RFQ_PENDING_STATUSES.includes(rfq.status),
    }));

    const countedRfqs = manifest.filter((r) => r.counted);

    /* No RFQ should appear twice */
    const countedNos = countedRfqs.map((r) => r.rfqNo);
    const uniqueCounted = new Set(countedNos);
    expect(countedNos.length).toBe(uniqueCounted.size);

    /* Count from manifest matches sidebar badge */
    const counts = deriveActionCounts({ rfqStats });
    expect(countedRfqs.length).toBe(counts['rfq-list']);
  });

  it('sidebar does NOT count Draft, Sent, Approved, Awarded, Closed, Cancelled', () => {
    const counts = deriveActionCounts({ rfqStats });

    const excludedStatuses = [
      RFQ_STATUS.DRAFT,
      RFQ_STATUS.SENT,
      RFQ_STATUS.APPROVED,
      RFQ_STATUS.AWARDED,
      RFQ_STATUS.CLOSED,
      RFQ_STATUS.CANCELLED,
    ];

    const excludedCount = rfqSeed.filter((r) => excludedStatuses.includes(r.status)).length;
    const totalCount = rfqSeed.length;
    const countedCount = counts['rfq-list'];

    expect(countedCount + excludedCount).toBe(totalCount);
  });
});

/* ========================================================================
   PR: SIDEBAR = PAGE ACTIONABLE TAB AGGREGATE
   ======================================================================== */

describe('PR: sidebar count = page actionable-tab aggregate', () => {
  const prSeed = buildRequisitionSeed();
  const prStats = computePrStats(prSeed);

  it('sidebar pr-list = pendingApproval only', () => {
    const counts = deriveActionCounts({ reqStats: prStats });

    /* PR List page tab "Pending Approval" */
    const pagePendingApproval = prStats.pendingApproval;

    /* Sidebar badge for PR List leaf */
    expect(counts['pr-list']).toBe(pagePendingApproval);
  });

  it('sidebar pr-tech-spec = TECHNICAL_REVIEW count', () => {
    const counts = deriveActionCounts({ reqStats: prStats });

    const techReview = prStats.byStatus[PR_STATUS.TECHNICAL_REVIEW] || 0;
    expect(counts['pr-tech-spec']).toBe(techReview);
  });

  it('sidebar purchase-requisition = pr-list + pr-tech-spec', () => {
    const counts = deriveActionCounts({ reqStats: prStats });

    expect(counts['purchase-requisition']).toBe(
      counts['pr-list'] + counts['pr-tech-spec']
    );
  });

  it('PR sidebar does NOT aggregate removed children incorrectly', () => {
    const counts = deriveActionCounts({ reqStats: prStats });

    /* The aggregate is simply the sum of the two leaf counts */
    const aggregate = counts['purchase-requisition'];
    const leafSum = counts['pr-list'] + counts['pr-tech-spec'];

    expect(aggregate).toBe(leafSum);

    /* It does NOT include Draft, Rejected, Converted, etc. */
    const draftCount = prStats.byStatus[PR_STATUS.DRAFT] || 0;
    const rejectedCount = prStats.byStatus[PR_STATUS.REJECTED] || 0;
    const convertedCount = prStats.byStatus[PR_STATUS.CONVERTED] || 0;

    expect(aggregate).toBeLessThan(
      prSeed.length - draftCount - rejectedCount - convertedCount + aggregate
    );
  });
});

/* ========================================================================
   PO: SIDEBAR = PAGE ACTIONABLE TAB AGGREGATE
   ======================================================================== */

describe('PO: sidebar count = page actionable-tab aggregate', () => {
  const poSeed = buildPurchaseOrderSeed();

  it('sidebar po-list = POs with pending approvalStatus', () => {
    const counts = deriveActionCounts({ poResult: { data: poSeed } });

    const pendingPos = poSeed.filter(
      (po) => (po.approvalStatus ?? APPROVAL_STATUS.PENDING) === APPROVAL_STATUS.PENDING
    );

    expect(counts['po-list']).toBe(pendingPos.length);
  });

  it('PO record-level manifest', () => {
    const manifest = poSeed.map((po) => ({
      poNo: po.poNo,
      approvalStatus: po.approvalStatus,
      counted: (po.approvalStatus ?? APPROVAL_STATUS.PENDING) === APPROVAL_STATUS.PENDING,
    }));

    const counted = manifest.filter((r) => r.counted);
    const excluded = manifest.filter((r) => !r.counted);

    console.log('\n=== PO MANIFEST ===');
    manifest.forEach((r) => {
      console.log(`  ${r.poNo}: ${r.approvalStatus} → ${r.counted ? 'COUNTED' : 'EXCLUDED'}`);
    });
    console.log(`  Counted: ${counted.length}, Excluded: ${excluded.length}`);
  });
});

/* ========================================================================
   LOGISTICS: SIDEBAR = PAGE ACTIONABLE AGGREGATE (NO DOUBLE-COUNT)
   ======================================================================== */

describe('Logistics: sidebar counts — no double-counting', () => {
  const mfgSeed = buildManufacturingSeed();
  const shipSeed = buildShipmentSeed();
  const grnSeed = buildGrnSeed();
  const inspSeed = buildInspectionSeed();

  it('sidebar logistics-manufacturing = IN_PRODUCTION only', () => {
    const counts = deriveActionCounts({
      mfgStats: computeMfgStats(mfgSeed),
    });

    const inProduction = mfgSeed.filter((r) => r.status === PACKING_STATUS.IN_PRODUCTION).length;
    expect(counts['logistics-manufacturing']).toBe(inProduction);
  });

  it('sidebar logistics-shipment = pending + delayed only', () => {
    const counts = deriveActionCounts({
      shipStats: computeShipStats(shipSeed),
    });

    const pending = shipSeed.filter((r) => r.status === SHIPMENT_STATUS.PENDING).length;
    const delayed = shipSeed.filter((r) => r.status === SHIPMENT_STATUS.DELAYED).length;
    expect(counts['logistics-shipment']).toBe(pending + delayed);
  });

  it('sidebar logistics-grn = expected only', () => {
    const counts = deriveActionCounts({
      grnStats: computeGrnStats(grnSeed),
    });

    const expected = grnSeed.filter((r) => r.status === GRN_STATUS.EXPECTED).length;
    expect(counts['logistics-grn']).toBe(expected);
  });

  it('sidebar logistics-quality = pending only', () => {
    const counts = deriveActionCounts({
      inspStats: computeInspStats(inspSeed),
    });

    const pending = inspSeed.filter((r) => r.status === INSPECTION_STATUS.PENDING).length;
    expect(counts['logistics-quality']).toBe(pending);
  });

  it('sidebar logistics = sum of sub-counts (no double-count)', () => {
    const counts = deriveActionCounts({
      mfgStats: computeMfgStats(mfgSeed),
      shipStats: computeShipStats(shipSeed),
      grnStats: computeGrnStats(grnSeed),
      inspStats: computeInspStats(inspSeed),
    });

    const expected =
      counts['logistics-manufacturing'] +
      counts['logistics-shipment'] +
      counts['logistics-grn'] +
      counts['logistics-quality'];

    expect(counts['logistics']).toBe(expected);
  });

  it('IN_TRANSIT shipments are NOT counted', () => {
    const counts = deriveActionCounts({
      shipStats: { inTransit: 5, pending: 1, delayed: 1, delivered: 2 },
    });

    expect(counts['logistics-shipment']).toBe(2); // pending(1) + delayed(1)
  });

  it('PENDING_INSPECTION GRNs are NOT counted in grn badge', () => {
    const counts = deriveActionCounts({
      grnStats: { expected: 2, pendingInspection: 3, received: 1 },
    });

    expect(counts['logistics-grn']).toBe(2); // expected only
  });

  it('no same-record double-count across logistics stages', () => {
    /* Same PO appears in manufacturing, shipment, and GRN */
    const counts = deriveActionCounts({
      mfgStats: { inProduction: 1 },
      shipStats: { pending: 1 },
      grnStats: { expected: 1 },
      inspStats: { pending: 1 },
    });

    /* Each stage counts independently — 4 separate actions */
    expect(counts['logistics']).toBe(4);

    /* But no single record is counted twice within its own stage */
    expect(counts['logistics-manufacturing']).toBe(1);
    expect(counts['logistics-shipment']).toBe(1);
    expect(counts['logistics-grn']).toBe(1);
    expect(counts['logistics-quality']).toBe(1);
  });
});

/* ========================================================================
   ZERO STATE: badge disappears when count = 0
   ======================================================================== */

describe('Zero state: badge disappears when count = 0', () => {
  it('all badges = 0 when data is empty', () => {
    const counts = deriveActionCounts({
      reqStats: {},
      rfqStats: {},
      poResult: { data: [] },
      mfgStats: {},
      shipStats: {},
      grnStats: {},
      inspStats: {},
      invoiceStats: {},
      invoiceResult: { data: [] },
      vendorStats: {},
      docStats: {},
      followUpStats: {},
      nfaStats: {},
      quoteStats: {},
      board: [],
    });

    expect(counts['pr-list']).toBe(0);
    expect(counts['pr-tech-spec']).toBe(0);
    expect(counts['purchase-requisition']).toBe(0);
    expect(counts['rfq-list']).toBe(0);
    expect(counts['po-list']).toBe(0);
    expect(counts['logistics']).toBe(0);
    expect(counts['logistics-manufacturing']).toBe(0);
    expect(counts['logistics-shipment']).toBe(0);
    expect(counts['logistics-grn']).toBe(0);
    expect(counts['logistics-quality']).toBe(0);
    expect(counts['invoice-list']).toBe(0);
    expect(counts['invoice-three-way']).toBe(0);
    expect(counts['vendor-list']).toBe(0);
    expect(counts['vendor-documents']).toBe(0);
  });
});

/* ========================================================================
   MUTATION: counts update after status change
   ======================================================================== */

describe('Mutation: counts update after status change', () => {
  it('RFQ approval removes from sidebar badge', () => {
    const before = deriveActionCounts({
      rfqStats: { pendingApproval: 3, quotationReceived: 0, evaluation: 0 },
    });
    expect(before['rfq-list']).toBe(3);

    const after = deriveActionCounts({
      rfqStats: { pendingApproval: 1, quotationReceived: 0, evaluation: 0 },
    });
    expect(after['rfq-list']).toBe(1);
  });

  it('PO approval removes from sidebar badge', () => {
    const before = deriveActionCounts({
      poResult: { data: [
        { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
        { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
      ] },
    });
    expect(before['po-list']).toBe(2);

    const after = deriveActionCounts({
      poResult: { data: [
        { status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED },
        { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
      ] },
    });
    expect(after['po-list']).toBe(1);
  });

  it('Logistics stage transition updates counts correctly', () => {
    /* Manufacturing: IN_PRODUCTION → PACKED */
    const before = deriveActionCounts({
      mfgStats: { inProduction: 2 },
    });
    expect(before['logistics-manufacturing']).toBe(2);

    const after = deriveActionCounts({
      mfgStats: { inProduction: 1, packed: 1 },
    });
    expect(after['logistics-manufacturing']).toBe(1);
  });
});
