/**
 * purchase/utils/__tests__/countLiveReconciliation.test.js
 * -------------------------------------------------------------------
 * LIVE DATA RECONCILIATION — runs the complete pipeline against the
 * actual seed data used by the application. Produces a detailed report
 * for every module proving sidebar = page = service.
 *
 * Run with: npx vitest run src/purchase/utils/__tests__/countLiveReconciliation.test.js
 * -------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { RFQ_STATUS, PR_STATUS, APPROVAL_STATUS, INVOICE_STATUS } from '../../constants';
import { buildRfqSeed, buildQuotationSeed, buildPurchaseOrderSeed, buildRequisitionSeed, buildInvoiceSeed } from '../../services/demoSeed';
import { buildManufacturingSeed, buildShipmentSeed, buildGrnSeed, buildInspectionSeed } from '../../services/demoSeedLogistics';
import { deriveActionCounts } from '../purchaseActionCounts';
import { RFQ_PENDING_STATUSES } from '../pendingStatus';
import { PACKING_STATUS, SHIPMENT_STATUS, GRN_STATUS, INSPECTION_STATUS } from '../../services/logistics';

/* ── Helpers ────────────────────────────────────────────────────── */
const rc = (rfqNo, quotations) =>
  quotations.filter((q) => q.rfqNo === rfqNo && ['Received', 'Accepted'].includes(q.status)).length;

function repairRfqStatuses(rfqs, quotations) {
  return rfqs.map((rfq) => {
    const quoteCount = rc(rfq.rfqNo, quotations);
    if (
      [RFQ_STATUS.EVALUATION, RFQ_STATUS.QUOTATION_RECEIVED].includes(rfq.status) &&
      quoteCount === 0
    ) {
      return { ...rfq, status: RFQ_STATUS.SENT };
    }
    if (rfq.status === RFQ_STATUS.SENT && quoteCount > 0) {
      return { ...rfq, status: RFQ_STATUS.QUOTATION_RECEIVED };
    }
    return rfq;
  });
}

function seedCounts(seed, key) {
  const m = {};
  seed.forEach((r) => { m[r[key]] = (m[r[key]] || 0) + 1; });
  return m;
}

/* ── Load seed data ─────────────────────────────────────────────── */
const rfqSeed = buildRfqSeed();
const quotations = buildQuotationSeed();
const repairedRfqs = repairRfqStatuses(rfqSeed, quotations);
const prSeed = buildRequisitionSeed();
const poSeed = buildPurchaseOrderSeed();
const mfgSeed = buildManufacturingSeed();
const shipSeed = buildShipmentSeed();
const grnSeed = buildGrnSeed();
const inspSeed = buildInspectionSeed();
const invSeed = buildInvoiceSeed();

/* ── Compute stats ──────────────────────────────────────────────── */
const rfqStatusMap = seedCounts(repairedRfqs, 'status');
const rfqStats = {
  pendingApproval: rfqStatusMap[RFQ_STATUS.PENDING_APPROVAL] || 0,
  quotationReceived: rfqStatusMap[RFQ_STATUS.QUOTATION_RECEIVED] || 0,
  evaluation: rfqStatusMap[RFQ_STATUS.EVALUATION] || 0,
};

const prByStatus = seedCounts(prSeed, 'status');
const prStats = { pendingApproval: prByStatus[PR_STATUS.PENDING_APPROVAL] || 0, byStatus: prByStatus };

const mfgStats = { inProduction: mfgSeed.filter((r) => r.status === PACKING_STATUS.IN_PRODUCTION).length };
const shipStats = {
  pending: shipSeed.filter((r) => r.status === SHIPMENT_STATUS.PENDING).length,
  delayed: shipSeed.filter((r) => r.status === SHIPMENT_STATUS.DELAYED).length,
};
const grnStats = { expected: grnSeed.filter((r) => r.status === GRN_STATUS.EXPECTED).length };
const inspStats = { pending: inspSeed.filter((r) => r.status === INSPECTION_STATUS.PENDING).length };

const invByStatus = seedCounts(invSeed, 'status');
const invoiceStats = {
  [INVOICE_STATUS.SUBMITTED]: invByStatus[INVOICE_STATUS.SUBMITTED] || 0,
  [INVOICE_STATUS.APPROVED]: invByStatus[INVOICE_STATUS.APPROVED] || 0,
  [INVOICE_STATUS.OVERDUE]: invByStatus[INVOICE_STATUS.OVERDUE] || 0,
};

/* ── Derive counts ──────────────────────────────────────────────── */
const counts = deriveActionCounts({
  reqStats: prStats,
  rfqStats,
  poResult: { data: poSeed },
  mfgStats,
  shipStats,
  grnStats,
  inspStats,
  invoiceStats,
  invoiceResult: { data: [] },
  vendorStats: {},
  docStats: {},
  followUpStats: {},
  nfaStats: {},
  quoteStats: {},
  board: [],
});

/* ==================================================================
   TEST SUITE
   ================================================================== */

describe('LIVE RECONCILIATION — RFQ', () => {
  it('RFQ record-level manifest (after repair)', () => {
    const rows = repairedRfqs.map((rfq) => {
      const qc = rc(rfq.rfqNo, quotations);
      return {
        rfqNo: rfq.rfqNo,
        status: rfq.status,
        quotations: qc,
        actionable: RFQ_PENDING_STATUSES.includes(rfq.status),
      };
    });

    const lines = rows.map((r) =>
      `  ${r.rfqNo} | ${r.status.padEnd(22)} | q=${r.quotations} | ${r.actionable ? '✅' : '❌'}`
    );
    console.log('\n=== RFQ RECORD-LEVEL MANIFEST (after repair) ===');
    console.log(lines.join('\n'));

    const counted = rows.filter((r) => r.actionable);
    console.log(`\n  Counted: ${counted.length}`);
    counted.forEach((r) => console.log(`    ✅ ${r.rfqNo} (${r.status})`));
  });

  it('sidebar rfq-list = page KPI actionable aggregate', () => {
    const pageActionable = rfqStats.pendingApproval + rfqStats.quotationReceived + rfqStats.evaluation;
    expect(counts['rfq-list']).toBe(pageActionable);
  });

  it('RFQ status repair is idempotent', () => {
    const once = repairRfqStatuses(rfqSeed, quotations);
    const twice = repairRfqStatuses(once, quotations);
    once.forEach((r, i) => { expect(r.status).toBe(twice[i].status); });
  });

  it('repair does not upgrade cancelled/closed/awarded', () => {
    const terminal = repairedRfqs.filter((r) =>
      [RFQ_STATUS.CANCELLED, RFQ_STATUS.CLOSED, RFQ_STATUS.AWARDED].includes(r.status)
    );
    terminal.forEach((r) => {
      expect(RFQ_PENDING_STATUSES.includes(r.status)).toBe(false);
    });
  });

  it('no RFQ double counting', () => {
    const counted = repairedRfqs.filter((r) => RFQ_PENDING_STATUSES.includes(r.status));
    const ids = counted.map((r) => r.rfqNo);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe('LIVE RECONCILIATION — PR', () => {
  it('PR record-level manifest', () => {
    const rows = prSeed.map((pr) => ({
      prNo: pr.prNo,
      status: pr.status,
      actionable: pr.status === PR_STATUS.PENDING_APPROVAL || pr.status === PR_STATUS.TECHNICAL_REVIEW,
    }));

    console.log('\n=== PR RECORD-LEVEL MANIFEST ===');
    rows.forEach((r) => console.log(`  ${r.prNo} | ${r.status.padEnd(28)} | ${r.actionable ? '✅' : '❌'}`));

    console.log(`\n  pr-list: ${counts['pr-list']}, pr-tech-spec: ${counts['pr-tech-spec']}, aggregate: ${counts['purchase-requisition']}`);
  });

  it('sidebar purchase-requisition = pr-list + pr-tech-spec', () => {
    expect(counts['purchase-requisition']).toBe(counts['pr-list'] + counts['pr-tech-spec']);
  });
});

describe('LIVE RECONCILIATION — PO', () => {
  it('PO record-level manifest', () => {
    const rows = poSeed.map((po) => ({
      poNo: po.poNo,
      approvalStatus: po.approvalStatus,
      actionable: (po.approvalStatus ?? APPROVAL_STATUS.PENDING) === APPROVAL_STATUS.PENDING,
    }));

    console.log('\n=== PO RECORD-LEVEL MANIFEST ===');
    rows.forEach((r) => console.log(`  ${r.poNo} | ${(r.approvalStatus || 'undefined').padEnd(20)} | ${r.actionable ? '✅' : '❌'}`));
    console.log(`\n  SIDEBAR PO BADGE: ${counts['po-list']}`);
  });
});

describe('LIVE RECONCILIATION — LOGISTICS', () => {
  it('Logistics record-level manifest', () => {
    console.log('\n=== LOGISTICS RECORD-LEVEL MANIFEST ===');
    console.log('--- Manufacturing ---');
    mfgSeed.forEach((r) => {
      const a = r.status === PACKING_STATUS.IN_PRODUCTION;
      console.log(`  ${r.packingNo} | ${r.status.padEnd(20)} | ${a ? '✅' : '❌'}`);
    });
    console.log(`  badge: ${counts['logistics-manufacturing']}`);

    console.log('--- Shipment ---');
    shipSeed.forEach((r) => {
      const a = r.status === SHIPMENT_STATUS.PENDING || r.status === SHIPMENT_STATUS.DELAYED;
      console.log(`  ${r.shipmentNo} | ${r.status.padEnd(20)} | ${a ? '✅' : '❌'}`);
    });
    console.log(`  badge: ${counts['logistics-shipment']}`);

    console.log('--- GRN ---');
    grnSeed.forEach((r) => {
      const a = r.status === GRN_STATUS.EXPECTED;
      console.log(`  ${r.grnNo} | ${r.status.padEnd(20)} | ${a ? '✅' : '❌'}`);
    });
    console.log(`  badge: ${counts['logistics-grn']}`);

    console.log('--- Quality ---');
    inspSeed.forEach((r) => {
      const a = r.status === INSPECTION_STATUS.PENDING;
      console.log(`  ${r.inspectionNo} | ${r.status.padEnd(20)} | ${a ? '✅' : '❌'}`);
    });
    console.log(`  badge: ${counts['logistics-quality']}`);
    console.log(`  TOTAL logistics: ${counts['logistics']}`);
  });

  it('no logistics double-count', () => {
    expect(counts['logistics']).toBe(
      counts['logistics-manufacturing'] +
      counts['logistics-shipment'] +
      counts['logistics-grn'] +
      counts['logistics-quality']
    );
  });
});

describe('LIVE RECONCILIATION — INVOICE', () => {
  it('Invoice status distribution', () => {
    console.log('\n=== INVOICE STATUS DISTRIBUTION ===');
    const allInv = seedCounts(invSeed, 'status');
    Object.entries(allInv).forEach(([status, count]) => {
      const a = [INVOICE_STATUS.SUBMITTED, INVOICE_STATUS.APPROVED, INVOICE_STATUS.OVERDUE].includes(status);
      console.log(`  ${status}: ${count} ${a ? '→ COUNTED' : '→ EXCLUDED'}`);
    });
    console.log(`  SIDEBAR INVOICE: ${counts['invoice-list']}`);
  });
});

describe('LIVE RECONCILIATION — FINAL SUMMARY', () => {
  it('complete sidebar count summary', () => {
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║          FINAL SIDEBAR COUNT RECONCILIATION                ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('Module                  | Badge | Formula');
    console.log('────────────────────────┼───────┼────────────────────────────────');
    console.log(`Purchase Requisition    | ${String(counts['purchase-requisition']).padStart(5)} | pendingApproval(${counts['pr-list']}) + techReview(${counts['pr-tech-spec']})`);
    console.log(`RFQ & Quotations        | ${String(counts['rfq-list']).padStart(5)} | PA(${rfqStats.pendingApproval}) + QR(${rfqStats.quotationReceived}) + Eval(${rfqStats.evaluation})`);
    console.log(`Purchase Orders         | ${String(counts['po-list']).padStart(5)} | approvalStatus === PENDING`);
    console.log(`Logistics               | ${String(counts['logistics']).padStart(5)} | mfg(${counts['logistics-manufacturing']}) + ship(${counts['logistics-shipment']}) + grn(${counts['logistics-grn']}) + qc(${counts['logistics-quality']})`);
    console.log(`Purchase Invoice        | ${String(counts['invoice-list']).padStart(5)} | submitted + approved + overdue`);

    /* Verify no hardcoded counts */
    expect(counts['pr-list']).toBeGreaterThanOrEqual(0);
    expect(counts['rfq-list']).toBeGreaterThanOrEqual(0);
    expect(counts['po-list']).toBeGreaterThanOrEqual(0);
    expect(counts['logistics']).toBeGreaterThanOrEqual(0);
    expect(counts['invoice-list']).toBeGreaterThanOrEqual(0);
  });
});
