/**
 * purchase/utils/__tests__/purchaseActionCounts.test.js
 * ------------------------------------------------------------------
 * Comprehensive tests for the central Purchase action-count system.
 * Every sidebar badge rule is verified against its business meaning.
 *
 * These tests exercise deriveActionCounts (the pure synchronous
 * derivation) and the individual predicates in pendingStatus.js
 * that back each count.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { PR_STATUS, RFQ_STATUS, INVOICE_STATUS, MATCH_STATUS, APPROVAL_STATUS, PO_STATUS } from '../../constants';
import { FOLLOWUP_STATUS, FOLLOWUP_BUCKET } from '../../services/rfqFollowUp';
import { GRN_STATUS, INSPECTION_STATUS } from '../../services/logistics';
import {
  isPrPending,
  isRfqPending,
  isFollowUpPending,
  isFollowUpActionable,
  isQuotationPending,
  isPoPending,
  isMatchPending,
  isPaymentPending,
  isGrnPending,
  isInspectionPending,
  RFQ_PENDING_STATUSES
} from '../pendingStatus';
import { deriveActionCounts } from '../purchaseActionCounts';

/* Helper: empty data shape matching the deriveActionCounts signature. */
function emptyData() {
  return {
    reqStats: {},
    nfaStats: {},
    rfqStats: {},
    quoteStats: {},
    followUpStats: {},
    board: [],
    poResult: { data: [] },
    vendorStats: {},
    invoiceStats: {},
    invoiceResult: { data: [] },
    docStats: {},
    mfgStats: {},
    shipStats: {},
    grnStats: {},
    inspStats: {}
  };
}

/* ========================================================================
   PR — Pending Approval only
   ======================================================================== */

describe('PR badge — Pending Approval only', () => {
  it('counts Pending Approval PRs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 5, byStatus: { [PR_STATUS.PENDING_APPROVAL]: 5 } }
    });
    expect(counts['pr-list']).toBe(5);
  });

  it('does NOT count Draft PRs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 0, byStatus: { [PR_STATUS.DRAFT]: 3 } }
    });
    expect(counts['pr-list']).toBe(0);
  });

  it('does NOT count Approved PRs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 0, byStatus: { [PR_STATUS.APPROVED]: 2 } }
    });
    expect(counts['pr-list']).toBe(0);
  });

  it('does NOT count Rejected PRs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 0, byStatus: { [PR_STATUS.REJECTED]: 1 } }
    });
    expect(counts['pr-list']).toBe(0);
  });

  it('does NOT count Converted to RFQ PRs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 0, byStatus: { [PR_STATUS.CONVERTED]: 4 } }
    });
    expect(counts['pr-list']).toBe(0);
  });

  it('handles missing reqStats gracefully', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['pr-list']).toBe(0);
  });

  it('isPrPending predicate is consistent', () => {
    expect(isPrPending({ status: PR_STATUS.PENDING_APPROVAL })).toBe(true);
    expect(isPrPending({ status: PR_STATUS.DRAFT })).toBe(true);
    expect(isPrPending({ status: PR_STATUS.RETURNED })).toBe(true);
    expect(isPrPending({ status: PR_STATUS.APPROVED })).toBe(false);
    expect(isPrPending({ status: PR_STATUS.REJECTED })).toBe(false);
    expect(isPrPending({ status: PR_STATUS.CONVERTED })).toBe(false);
    expect(isPrPending(null)).toBe(false);
  });
});

/* ========================================================================
   Technical Specification Review
   ======================================================================== */

describe('Technical Specification Review badge', () => {
  it('counts PRs in TECHNICAL_REVIEW status', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 0, byStatus: { [PR_STATUS.TECHNICAL_REVIEW]: 3 } }
    });
    expect(counts['pr-tech-spec']).toBe(3);
  });

  it('does NOT count completed/locked reviews', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 0, byStatus: { [PR_STATUS.READY_FOR_RFQ]: 2 } }
    });
    expect(counts['pr-tech-spec']).toBe(0);
  });

  it('handles missing byStatus gracefully', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['pr-tech-spec']).toBe(0);
  });
});

/* ========================================================================
   RFQ — Pending Approval + Quotation Received + Evaluation only
   ======================================================================== */

describe('RFQ badge — Pending Approval + Quotation Received + Evaluation', () => {
  it('counts Pending Approval RFQs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { pendingApproval: 3 }
    });
    expect(counts['rfq-list']).toBe(3);
  });

  it('counts Quotation Received RFQs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { quotationReceived: 2 }
    });
    expect(counts['rfq-list']).toBe(2);
  });

  it('counts Evaluation RFQs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { evaluation: 1 }
    });
    expect(counts['rfq-list']).toBe(1);
  });

  it('sums all three action-required statuses', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { pendingApproval: 3, quotationReceived: 2, evaluation: 1 }
    });
    expect(counts['rfq-list']).toBe(6);
  });

  it('does NOT count Draft RFQs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { draft: 5, pendingApproval: 0, quotationReceived: 0, evaluation: 0 }
    });
    expect(counts['rfq-list']).toBe(0);
  });

  it('does NOT count Sent RFQs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { sent: 4, pendingApproval: 0, quotationReceived: 0, evaluation: 0 }
    });
    expect(counts['rfq-list']).toBe(0);
  });

  it('does NOT count Approved/Awarded/Closed/Cancelled RFQs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      rfqStats: { draft: 0, pendingApproval: 0, sent: 0, quotationReceived: 0, evaluation: 0 }
    });
    expect(counts['rfq-list']).toBe(0);
  });

  it('RFQ_PENDING_STATUSES excludes Draft and Sent', () => {
    expect(RFQ_PENDING_STATUSES).not.toContain(RFQ_STATUS.DRAFT);
    expect(RFQ_PENDING_STATUSES).not.toContain(RFQ_STATUS.SENT);
    expect(RFQ_PENDING_STATUSES).toContain(RFQ_STATUS.PENDING_APPROVAL);
    expect(RFQ_PENDING_STATUSES).toContain(RFQ_STATUS.QUOTATION_RECEIVED);
    expect(RFQ_PENDING_STATUSES).toContain(RFQ_STATUS.EVALUATION);
  });

  it('isRfqPending predicate is consistent', () => {
    expect(isRfqPending({ status: RFQ_STATUS.PENDING_APPROVAL })).toBe(true);
    expect(isRfqPending({ status: RFQ_STATUS.QUOTATION_RECEIVED })).toBe(true);
    expect(isRfqPending({ status: RFQ_STATUS.EVALUATION })).toBe(true);
    expect(isRfqPending({ status: RFQ_STATUS.DRAFT })).toBe(false);
    expect(isRfqPending({ status: RFQ_STATUS.SENT })).toBe(false);
    expect(isRfqPending({ status: RFQ_STATUS.APPROVED })).toBe(false);
    expect(isRfqPending({ status: RFQ_STATUS.AWARDED })).toBe(false);
    expect(isRfqPending(null)).toBe(false);
  });
});

/* ========================================================================
   RFQ Follow-ups — Pending + Overdue only
   ======================================================================== */

describe('RFQ Follow-ups badge — Pending + Overdue only', () => {
  it('counts pending follow-ups from stats.pending', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      followUpStats: { pending: 4, overdue: 1, completed: 2 }
    });
    expect(counts['rfq-follow-ups']).toBe(4);
  });

  it('falls back to overdue when pending is missing', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      followUpStats: { overdue: 3 }
    });
    expect(counts['rfq-follow-ups']).toBe(3);
  });

  it('returns 0 when stats is empty', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['rfq-follow-ups']).toBe(0);
  });

  it('does NOT count completed follow-ups as actionable', () => {
    // A stats object with only completed = 5 should produce 0
    const counts = deriveActionCounts({
      ...emptyData(),
      followUpStats: { completed: 5, pending: 0, overdue: 0 }
    });
    expect(counts['rfq-follow-ups']).toBe(0);
  });

  it('isFollowUpPending predicate: only Pending workflow status', () => {
    expect(isFollowUpPending({ workflowStatus: FOLLOWUP_STATUS.PENDING })).toBe(true);
    expect(isFollowUpPending({ workflowStatus: FOLLOWUP_STATUS.COMPLETED })).toBe(false);
    expect(isFollowUpPending({ workflowStatus: FOLLOWUP_STATUS.CANCELLED })).toBe(false);
    expect(isFollowUpPending(null)).toBe(false);
  });

  it('isFollowUpActionable predicate: Pending OR Overdue bucket', () => {
    expect(isFollowUpActionable({ workflowStatus: FOLLOWUP_STATUS.PENDING })).toBe(true);
    expect(isFollowUpActionable({ status: FOLLOWUP_BUCKET.OVERDUE })).toBe(true);
    expect(isFollowUpActionable({ workflowStatus: FOLLOWUP_STATUS.COMPLETED })).toBe(false);
    expect(isFollowUpActionable({ workflowStatus: FOLLOWUP_STATUS.CANCELLED })).toBe(false);
    expect(isFollowUpActionable({ status: FOLLOWUP_BUCKET.UPCOMING })).toBe(false);
    expect(isFollowUpActionable(null)).toBe(false);
  });

  it('isFollowUpActionable checks workflowStatus first, falls back to status', () => {
    // Enriched records have workflowStatus (persisted) and status (bucket).
    // When workflowStatus is COMPLETED, the follow-up is not actionable
    // even if the bucket is OVERDUE (workflowStatus takes precedence).
    expect(isFollowUpActionable({ workflowStatus: FOLLOWUP_STATUS.PENDING, status: FOLLOWUP_BUCKET.OVERDUE })).toBe(true);
    expect(isFollowUpActionable({ workflowStatus: FOLLOWUP_STATUS.COMPLETED, status: FOLLOWUP_BUCKET.OVERDUE })).toBe(false);
    // When workflowStatus is missing, falls back to status (bucket)
    expect(isFollowUpActionable({ status: FOLLOWUP_BUCKET.OVERDUE })).toBe(true);
  });
});

/* ========================================================================
   Vendor Quotations — Received only
   ======================================================================== */

describe('Vendor Quotations badge — Received only', () => {
  it('counts received quotations', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      quoteStats: { received: 5 }
    });
    expect(counts['vendor-quotations']).toBe(5);
  });

  it('does NOT count pending/accepted/rejected quotations', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      quoteStats: { received: 0 }
    });
    expect(counts['vendor-quotations']).toBe(0);
  });

  it('isQuotationPending predicate', () => {
    expect(isQuotationPending({ status: 'Received' })).toBe(true);
    expect(isQuotationPending({ status: 'Pending' })).toBe(false);
    expect(isQuotationPending({ status: 'Accepted' })).toBe(false);
    expect(isQuotationPending(null)).toBe(false);
  });
});

/* ========================================================================
   PCS — Price Comparative Statement
   ======================================================================== */

describe('PCS badge', () => {
  it('counts items with quotations but not yet at Comparison', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        { workflowStage: 'SOURCING', steps: { quotations: true } },
        { workflowStage: 'COMPARISON', steps: { quotations: true } },
        { workflowStage: 'NEGOTIATION', steps: { quotations: true } }
      ]
    });
    expect(counts['price-comparative-statement']).toBe(1); // only SOURCING
  });

  it('returns 0 when board is empty', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['price-comparative-statement']).toBe(0);
  });
});

/* ========================================================================
   Technical Evaluation
   ======================================================================== */

describe('Technical Evaluation badge', () => {
  it('counts items with no technical step and unlocked gate', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        { workflowStage: 'COMPARISON', steps: {}, gates: {} },
        { workflowStage: 'COMPARISON', steps: { technical: false }, gates: {} }
      ]
    });
    expect(counts['technical-evaluation']).toBe(2);
  });

  it('does NOT count items with completed technical step', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        { workflowStage: 'COMPARISON', steps: { technical: true }, gates: { technical: true } }
      ]
    });
    expect(counts['technical-evaluation']).toBe(0);
  });

  it('does NOT count items where technical step is in progress', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        { workflowStage: 'COMPARISON', steps: { technical: true }, gates: { technical: false } }
      ]
    });
    expect(counts['technical-evaluation']).toBe(0);
  });
});

/* ========================================================================
   Final Negotiation
   ======================================================================== */

describe('Final Negotiation badge', () => {
  it('counts items at Comparison with no round agreed and not past negotiation', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        {
          workflowStage: 'COMPARISON',
          steps: { quotations: true, negotiationAgreed: false }
        }
      ]
    });
    expect(counts['final-negotiation']).toBe(1);
  });

  it('does NOT count items that have reached Technical Evaluation', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        {
          workflowStage: 'TECHNICAL_EVALUATION',
          steps: { quotations: true, negotiationAgreed: false }
        }
      ]
    });
    expect(counts['final-negotiation']).toBe(0);
  });

  it('does NOT count items with negotiation agreed', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      board: [
        {
          workflowStage: 'COMPARISON',
          steps: { quotations: true, negotiationAgreed: true }
        }
      ]
    });
    expect(counts['final-negotiation']).toBe(0);
  });
});

/* ========================================================================
   Approval Flow (NFA)
   ======================================================================== */

describe('Approval Flow badge', () => {
  it('sums first + second + final pending', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      nfaStats: { firstPending: 2, secondPending: 1, finalPending: 3 }
    });
    expect(counts['approval-flow']).toBe(6);
  });

  it('returns 0 when no pending approvals', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      nfaStats: { firstPending: 0, secondPending: 0, finalPending: 0 }
    });
    expect(counts['approval-flow']).toBe(0);
  });
});

/* ========================================================================
   Purchase Orders — Pending Approval only
   ======================================================================== */

describe('PO badge — Pending Approval only', () => {
  it('counts submitted POs actually awaiting the approval decision', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      poResult: {
        data: [
          /* Awaiting the approval decision — counts. */
          { id: '1', status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
          /* Already approved (past the gate) — not counted. */
          { id: '2', status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED },
          /* Draft — not submitted yet, not waiting for approval. */
          { id: '3', status: PO_STATUS.DRAFT, approvalStatus: APPROVAL_STATUS.PENDING }
        ]
      }
    });
    expect(counts['po-list']).toBe(1);
  });

  it('counts a submitted PO whose approvalStatus is missing (defaults Pending)', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      poResult: { data: [{ id: '1', status: PO_STATUS.PENDING_APPROVAL }] }
    });
    expect(counts['po-list']).toBe(1);
  });

  it('does NOT count drafts, approved, released or rejected POs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      poResult: {
        data: [
          { id: '1', status: PO_STATUS.DRAFT, approvalStatus: APPROVAL_STATUS.PENDING },
          { id: '2', status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED },
          { id: '3', status: PO_STATUS.RELEASED, approvalStatus: APPROVAL_STATUS.APPROVED },
          { id: '4', status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.REJECTED }
        ]
      }
    });
    expect(counts['po-list']).toBe(0);
  });

  it('isPoPending predicate', () => {
    expect(isPoPending({ status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING })).toBe(true);
    expect(isPoPending({ status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.APPROVED })).toBe(false);
    expect(isPoPending({ status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.REJECTED })).toBe(false);
    expect(isPoPending({ status: PO_STATUS.DRAFT, approvalStatus: APPROVAL_STATUS.PENDING })).toBe(false);
    expect(isPoPending({ status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED })).toBe(false);
    expect(isPoPending({})).toBe(false);
    expect(isPoPending(null)).toBe(false);
  });
});

/* ========================================================================
   Supplier Acknowledgement — pending acknowledgements only
   ======================================================================== */

describe('Supplier Acknowledgement badge', () => {
  it('counts pending acknowledgements from actually-released POs only', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      poResult: {
        data: [
          { id: '1', status: PO_STATUS.RELEASED, approvalStatus: APPROVAL_STATUS.APPROVED, acknowledged: false, expectedDate: '2099-12-31' },
          { id: '2', status: PO_STATUS.SUPPLIER_ACKNOWLEDGED, approvalStatus: APPROVAL_STATUS.APPROVED, acknowledged: true },
          { id: '3', status: PO_STATUS.RELEASED, approvalStatus: APPROVAL_STATUS.APPROVED, acknowledged: false, expectedDate: '2099-12-31' },
          /* Approved but never released — was never sent to the supplier
             and must not be counted as an awaiting acknowledgement. */
          { id: '4', status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED, acknowledged: false, expectedDate: '2099-12-31' }
        ]
      }
    });
    expect(counts['po-released-ack']).toBe(2);
  });

  it('does NOT count already-acknowledged POs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      poResult: {
        data: [
          { id: '1', status: PO_STATUS.SUPPLIER_ACKNOWLEDGED, approvalStatus: APPROVAL_STATUS.APPROVED, acknowledged: true }
        ]
      }
    });
    expect(counts['po-released-ack']).toBe(0);
  });
});

/* ========================================================================
   Logistics: Manufacturing/Packing
   ======================================================================== */

describe('Logistics Manufacturing badge — In Production only', () => {
  it('counts in-production jobs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      mfgStats: { inProduction: 3 }
    });
    expect(counts['logistics-manufacturing']).toBe(3);
  });

  it('does NOT count packed or ready-to-ship jobs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      mfgStats: { inProduction: 0, packed: 5, readyToShip: 2 }
    });
    expect(counts['logistics-manufacturing']).toBe(0);
  });
});

/* ========================================================================
   Logistics: Dispatch — action-required / exception only
   ======================================================================== */

describe('Logistics Dispatch badge — pending + delayed only', () => {
  it('counts pending + delayed shipments (not inTransit)', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      shipStats: { delayed: 2, inTransit: 5, pending: 1 }
    });
    expect(counts['logistics-shipment']).toBe(3);
  });

  it('does NOT count delivered or inTransit shipments', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      shipStats: { inTransit: 5, delayed: 0, pending: 0 }
    });
    expect(counts['logistics-shipment']).toBe(0);
  });
});

/* ========================================================================
   GRN — Expected + Pending Inspection
   ======================================================================== */

describe('GRN badge — Expected only (pendingInspection handled by Quality)', () => {
  it('counts expected GRNs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      grnStats: { expected: 3 }
    });
    expect(counts['logistics-grn']).toBe(3);
  });

  it('does NOT count pendingInspection GRNs (handled by Quality badge)', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      grnStats: { pendingInspection: 2 }
    });
    expect(counts['logistics-grn']).toBe(0);
  });

  it('counts only expected when both expected and pendingInspection exist', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      grnStats: { expected: 3, pendingInspection: 2 }
    });
    expect(counts['logistics-grn']).toBe(3);
  });

  it('does NOT count received GRNs', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      grnStats: { received: 10, expected: 0, pendingInspection: 0 }
    });
    expect(counts['logistics-grn']).toBe(0);
  });

  it('isGrnPending predicate', () => {
    expect(isGrnPending({ status: GRN_STATUS.EXPECTED })).toBe(true);
    expect(isGrnPending({ status: GRN_STATUS.PENDING_INSPECTION })).toBe(true);
    expect(isGrnPending({ status: GRN_STATUS.RECEIVED })).toBe(false);
    expect(isGrnPending(null)).toBe(false);
  });
});

/* ========================================================================
   Quality Inspection — Pending only
   ======================================================================== */

describe('Quality Inspection badge — Pending only', () => {
  it('counts pending inspections', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      inspStats: { pending: 4 }
    });
    expect(counts['logistics-quality']).toBe(4);
  });

  it('does NOT count passed/failed inspections', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      inspStats: { pending: 0, passed: 3, failed: 1 }
    });
    expect(counts['logistics-quality']).toBe(0);
  });

  it('isInspectionPending predicate', () => {
    expect(isInspectionPending({ status: INSPECTION_STATUS.PENDING })).toBe(true);
    expect(isInspectionPending({ status: INSPECTION_STATUS.PASSED, postedAt: null })).toBe(true);
    expect(isInspectionPending({ status: INSPECTION_STATUS.PASSED, postedAt: '2026-01-01' })).toBe(false);
    expect(isInspectionPending({ status: INSPECTION_STATUS.FAILED })).toBe(false);
    expect(isInspectionPending(null)).toBe(false);
  });
});

/* ========================================================================
   Invoice — Submitted + Approved + Overdue
   ======================================================================== */

describe('Invoice badge — Submitted + Approved + Overdue', () => {
  it('counts submitted invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.SUBMITTED]: 3 }
    });
    expect(counts['invoice-list']).toBe(3);
  });

  it('counts approved invoices (awaiting payment)', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.APPROVED]: 2 }
    });
    expect(counts['invoice-list']).toBe(2);
  });

  it('counts overdue invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.OVERDUE]: 1 }
    });
    expect(counts['invoice-list']).toBe(1);
  });

  it('sums all three actionable statuses', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: {
        [INVOICE_STATUS.SUBMITTED]: 3,
        [INVOICE_STATUS.APPROVED]: 2,
        [INVOICE_STATUS.OVERDUE]: 1
      }
    });
    expect(counts['invoice-list']).toBe(6);
  });

  it('does NOT count Draft invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.DRAFT]: 5 }
    });
    expect(counts['invoice-list']).toBe(0);
  });

  it('does NOT count Paid invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.PAID]: 10 }
    });
    expect(counts['invoice-list']).toBe(0);
  });

  it('does NOT count Rejected invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.REJECTED]: 2 }
    });
    expect(counts['invoice-list']).toBe(0);
  });
});

/* ========================================================================
   3-Way Match — Pending Match + Mismatch
   ======================================================================== */

describe('3-Way Match badge — Pending Match + Mismatch', () => {
  it('counts Pending Match rows', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.PENDING },
          { matchStatus: MATCH_STATUS.MATCHED }
        ]
      }
    });
    expect(counts['invoice-three-way']).toBe(1);
  });

  it('counts Mismatch rows (requires buyer correction)', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.MISMATCH },
          { matchStatus: MATCH_STATUS.PENDING }
        ]
      }
    });
    expect(counts['invoice-three-way']).toBe(2);
  });

  it('does NOT count Matched rows', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [{ matchStatus: MATCH_STATUS.MATCHED }]
      }
    });
    expect(counts['invoice-three-way']).toBe(0);
  });

  it('does NOT count Exception rows', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [{ matchStatus: MATCH_STATUS.EXCEPTION }]
      }
    });
    expect(counts['invoice-three-way']).toBe(0);
  });

  it('isMatchPending predicate includes Mismatch', () => {
    expect(isMatchPending({ matchStatus: MATCH_STATUS.PENDING })).toBe(true);
    expect(isMatchPending({ matchStatus: MATCH_STATUS.MISMATCH })).toBe(true);
    expect(isMatchPending({ matchStatus: MATCH_STATUS.MATCHED })).toBe(false);
    expect(isMatchPending({ matchStatus: MATCH_STATUS.EXCEPTION })).toBe(false);
    expect(isMatchPending(null)).toBe(false);
  });
});

/* ========================================================================
   Payment Approval — matched and not yet paid
   ======================================================================== */

describe('Payment Approval badge', () => {
  it('counts matched invoices with no payment', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.MATCHED, paidAmount: 0 },
          { matchStatus: MATCH_STATUS.MATCHED }
        ]
      }
    });
    expect(counts['invoice-payment-approval']).toBe(2);
  });

  it('does NOT count paid invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [{ matchStatus: MATCH_STATUS.MATCHED, paidAmount: 1000 }]
      }
    });
    expect(counts['invoice-payment-approval']).toBe(0);
  });

  it('does NOT count unmatched invoices', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [{ matchStatus: MATCH_STATUS.PENDING }]
      }
    });
    expect(counts['invoice-payment-approval']).toBe(0);
  });

  it('vendor-payment uses the same logic as payment-approval', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [{ matchStatus: MATCH_STATUS.MATCHED, paidAmount: 0 }]
      }
    });
    expect(counts['invoice-vendor-payment']).toBe(counts['invoice-payment-approval']);
  });

  it('isPaymentPending predicate', () => {
    expect(isPaymentPending({ matchStatus: MATCH_STATUS.MATCHED, paidAmount: 0 })).toBe(true);
    expect(isPaymentPending({ matchStatus: MATCH_STATUS.MATCHED })).toBe(true);
    expect(isPaymentPending({ matchStatus: MATCH_STATUS.MATCHED, paidAmount: 500 })).toBe(false);
    expect(isPaymentPending({ matchStatus: MATCH_STATUS.PENDING })).toBe(false);
    expect(isPaymentPending(null)).toBe(false);
  });
});

/* ========================================================================
   Vendor List — Pending Approval only
   ======================================================================== */

describe('Vendor List badge', () => {
  it('counts vendors pending approval', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      vendorStats: { pending: 3 }
    });
    expect(counts['vendor-list']).toBe(3);
  });
});

/* ========================================================================
   Vendor Documents — Pending verification only
   ======================================================================== */

describe('Vendor Documents badge', () => {
  it('counts documents pending verification', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      docStats: { pending: 7 }
    });
    expect(counts['vendor-documents']).toBe(7);
  });

  it('does NOT count verified/expired documents', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      docStats: { pending: 0, verified: 10, expired: 2 }
    });
    expect(counts['vendor-documents']).toBe(0);
  });
});

/* ========================================================================
   NFA — same as Approval Flow
   ======================================================================== */

describe('NFA badge', () => {
  it('is identical to approval-flow', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      nfaStats: { firstPending: 1, secondPending: 2, finalPending: 3 }
    });
    expect(counts['nfa']).toBe(counts['approval-flow']);
    expect(counts['nfa']).toBe(6);
  });
});

/* ========================================================================
   Edge cases — undefined/null/empty
   ======================================================================== */

describe('Edge cases', () => {
  it('returns all zeros when everything is empty', () => {
    const counts = deriveActionCounts(emptyData());
    const zeros = Object.values(counts).every((v) => v === 0);
    expect(zeros).toBe(true);
  });

  it('handles null board gracefully', () => {
    const counts = deriveActionCounts({ ...emptyData(), board: null });
    expect(counts['price-comparative-statement']).toBe(0);
    expect(counts['technical-evaluation']).toBe(0);
    expect(counts['final-negotiation']).toBe(0);
  });

  it('handles null poResult gracefully', () => {
    const counts = deriveActionCounts({ ...emptyData(), poResult: null });
    expect(counts['po-list']).toBe(0);
    expect(counts['po-released-ack']).toBe(0);
  });

  it('handles null invoiceResult gracefully', () => {
    const counts = deriveActionCounts({ ...emptyData(), invoiceResult: null });
    expect(counts['invoice-three-way']).toBe(0);
    expect(counts['invoice-payment-approval']).toBe(0);
    expect(counts['invoice-vendor-payment']).toBe(0);
  });

  it('handles missing stats fields with ?? fallback', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      followUpStats: {},
      invoiceStats: {},
      grnStats: {},
      mfgStats: {},
      shipStats: {},
      inspStats: {}
    });
    expect(counts['rfq-follow-ups']).toBe(0);
    expect(counts['invoice-list']).toBe(0);
    expect(counts['logistics-grn']).toBe(0);
    expect(counts['logistics-manufacturing']).toBe(0);
    expect(counts['logistics-shipment']).toBe(0);
    expect(counts['logistics-quality']).toBe(0);
  });
});

/* ========================================================================
   Sidebar badge visibility — zero/hide, one/show, multiple/show
   ======================================================================== */

describe('Sidebar badge visibility rules', () => {
  it('returns 0 for all keys when no action-required records exist', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['pr-list']).toBe(0);
    expect(counts['rfq-list']).toBe(0);
    expect(counts['po-list']).toBe(0);
    expect(counts['invoice-list']).toBe(0);
    expect(counts['logistics']).toBe(0);
    expect(counts['invoices']).toBe(0);
  });

  it('shows badge with count 1 when exactly one PR is pending approval', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 1, byStatus: { [PR_STATUS.PENDING_APPROVAL]: 1 } }
    });
    expect(counts['pr-list']).toBe(1);
  });

  it('shows badge with count 5 when five PRs are pending approval', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 5, byStatus: { [PR_STATUS.PENDING_APPROVAL]: 5 } }
    });
    expect(counts['pr-list']).toBe(5);
  });

  it('hides badge (count 0) for all categories when no actionable records exist', () => {
    const counts = deriveActionCounts(emptyData());
    const allZero = Object.values(counts).every((v) => v === 0);
    expect(allZero).toBe(true);
  });
});

/* ========================================================================
   Status transitions — completed item removes badge, new item increases
   ======================================================================== */

describe('Status transitions affecting sidebar badges', () => {
  it('PR approval removes badge: pending → approved', () => {
    // Before: 3 PRs pending approval
    const before = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 3, byStatus: { [PR_STATUS.PENDING_APPROVAL]: 3 } }
    });
    expect(before['pr-list']).toBe(3);

    // After: 1 approved, 2 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      reqStats: { pendingApproval: 2, byStatus: { [PR_STATUS.PENDING_APPROVAL]: 2, [PR_STATUS.APPROVED]: 1 } }
    });
    expect(after['pr-list']).toBe(2);
  });

  it('RFQ received increases badge: sent → quotation received', () => {
    // Before: 2 RFQs pending approval
    const before = deriveActionCounts({
      ...emptyData(),
      rfqStats: { pendingApproval: 2, quotationReceived: 0, evaluation: 0 }
    });
    expect(before['rfq-list']).toBe(2);

    // After: 1 RFQ gets quotation received, 1 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      rfqStats: { pendingApproval: 1, quotationReceived: 1, evaluation: 0 }
    });
    expect(after['rfq-list']).toBe(2);
  });

  it('PO approval removes badge: pending → approved', () => {
    // Before: 4 submitted POs awaiting the approval decision
    const before = deriveActionCounts({
      ...emptyData(),
      poResult: {
        data: [
          { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
          { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
          { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
          { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
        ]
      }
    });
    expect(before['po-list']).toBe(4);

    // After: 2 approved (status Approved), 2 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      poResult: {
        data: [
          { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
          { status: PO_STATUS.PENDING_APPROVAL, approvalStatus: APPROVAL_STATUS.PENDING },
          { status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED },
          { status: PO_STATUS.APPROVED, approvalStatus: APPROVAL_STATUS.APPROVED },
        ]
      }
    });
    expect(after['po-list']).toBe(2);
  });

  it('Invoice payment removes badge: matched+unpaid → paid', () => {
    // Before: 2 invoices awaiting payment
    const before = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.MATCHED, paidAmount: 0 },
          { matchStatus: MATCH_STATUS.MATCHED, paidAmount: 0 },
        ]
      }
    });
    expect(before['invoice-payment-approval']).toBe(2);

    // After: 1 paid, 1 still awaiting
    const after = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.MATCHED, paidAmount: 500 },
          { matchStatus: MATCH_STATUS.MATCHED, paidAmount: 0 },
        ]
      }
    });
    expect(after['invoice-payment-approval']).toBe(1);
  });

  it('GRN completion removes badge: expected → received', () => {
    // Before: 3 GRNs expected
    const before = deriveActionCounts({
      ...emptyData(),
      grnStats: { expected: 3, pendingInspection: 0 }
    });
    expect(before['logistics-grn']).toBe(3);

    // After: 2 received, 1 still expected
    const after = deriveActionCounts({
      ...emptyData(),
      grnStats: { expected: 1, pendingInspection: 0 }
    });
    expect(after['logistics-grn']).toBe(1);
  });

  it('Vendor approval removes badge: pending → approved', () => {
    // Before: 5 vendors pending
    const before = deriveActionCounts({
      ...emptyData(),
      vendorStats: { pending: 5 }
    });
    expect(before['vendor-list']).toBe(5);

    // After: 3 approved, 2 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      vendorStats: { pending: 2 }
    });
    expect(after['vendor-list']).toBe(2);
  });

  it('Follow-up completion removes badge: pending → completed', () => {
    // Before: 4 pending follow-ups
    const before = deriveActionCounts({
      ...emptyData(),
      followUpStats: { pending: 4, overdue: 0 }
    });
    expect(before['rfq-follow-ups']).toBe(4);

    // After: 2 completed, 2 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      followUpStats: { pending: 2, overdue: 0 }
    });
    expect(after['rfq-follow-ups']).toBe(2);
  });

  it('Document verification removes badge: pending → verified', () => {
    // Before: 6 docs pending
    const before = deriveActionCounts({
      ...emptyData(),
      docStats: { pending: 6 }
    });
    expect(before['vendor-documents']).toBe(6);

    // After: 4 verified, 2 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      docStats: { pending: 2 }
    });
    expect(after['vendor-documents']).toBe(2);
  });

  it('Three-way match resolution removes badge: pending → matched', () => {
    // Before: 3 invoices pending match
    const before = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.PENDING },
          { matchStatus: MATCH_STATUS.PENDING },
          { matchStatus: MATCH_STATUS.PENDING },
        ]
      }
    });
    expect(before['invoice-three-way']).toBe(3);

    // After: 2 matched, 1 still pending
    const after = deriveActionCounts({
      ...emptyData(),
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.MATCHED },
          { matchStatus: MATCH_STATUS.MATCHED },
          { matchStatus: MATCH_STATUS.PENDING },
        ]
      }
    });
    expect(after['invoice-three-way']).toBe(1);
  });
});

/* ========================================================================
   Category-level aggregates (sidebar top-level counts)
   ======================================================================== */

describe('Category-level sidebar aggregates', () => {
  it('logistics aggregates all sub-counts (no double-counting)', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      mfgStats: { inProduction: 2 },
      shipStats: { delayed: 1, pending: 2, inTransit: 3 },
      grnStats: { expected: 3, pendingInspection: 1 },
      inspStats: { pending: 2 }
    });
    expect(counts['logistics']).toBe(10);
    expect(counts['logistics-manufacturing']).toBe(2);
    expect(counts['logistics-shipment']).toBe(3);  // pending(2) + delayed(1) — inTransit excluded
    expect(counts['logistics-grn']).toBe(3);        // expected only — pendingInspection handled by Quality
    expect(counts['logistics-quality']).toBe(2);
  });

  it('logistics returns 0 when no actionable logistics records', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['logistics']).toBe(0);
  });

  it('invoices aggregates invoice-list + invoice-three-way', () => {
    const counts = deriveActionCounts({
      ...emptyData(),
      invoiceStats: { [INVOICE_STATUS.SUBMITTED]: 3 },
      invoiceResult: {
        data: [
          { matchStatus: MATCH_STATUS.PENDING },
          { matchStatus: MATCH_STATUS.MATCHED },
        ]
      }
    });
    expect(counts['invoices']).toBe(4); // 3 submitted + 1 pending match
    expect(counts['invoice-list']).toBe(3);
    expect(counts['invoice-three-way']).toBe(1);
  });

  it('invoices returns 0 when no actionable invoices', () => {
    const counts = deriveActionCounts(emptyData());
    expect(counts['invoices']).toBe(0);
  });

  it('each top-level category has a count key', () => {
    const counts = deriveActionCounts(emptyData());
    // Categories with countKey in PURCHASE_CATEGORIES
    expect(counts['pr-list']).toBeDefined();
    expect(counts['vendor-list']).toBeDefined();
    expect(counts['rfq-list']).toBeDefined();
    expect(counts['po-list']).toBeDefined();
    expect(counts['logistics']).toBeDefined();
    expect(counts['invoices']).toBeDefined();
    expect(counts['vendor-documents']).toBeDefined();
  });
});
