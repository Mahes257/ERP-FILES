/**
 * purchase/utils/purchaseActionCounts.js
 * ------------------------------------------------------------------
 * The SINGLE source of truth for sidebar badge counts across the
 * entire Purchase module. Every count represents ONLY actionable
 * work — records that require a buyer decision or next step.
 *
 * Architecture:
 *   • deriveActionCounts(data) — pure synchronous function that
 *     computes all counts from pre-fetched service data. Safe for
 *     unit testing with arbitrary inputs.
 *   • getPurchaseActionCounts() — async function that fetches from
 *     all Purchase services and delegates to deriveActionCounts.
 *     Used by the sidebar hook.
 *
 * Every count is backed by the SAME predicates in pendingStatus.js
 * that drive table pending dots and KPI cards — one source of truth.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, INVOICE_STATUS, PO_STATUS, PR_STATUS, stageIndex } from '../constants';
import { isPoReleased } from '../constants/poStage';
import {
  isMatchPending,
  isPaymentPending,
  RFQ_PENDING_STATUSES
} from './pendingStatus';
import { countPendingAcknowledgements } from './poAcknowledgement';

/** Maps a canonical RFQ status to the stats field name in getRfqStats. */
const RFQ_STATS_FIELD = {
  [RFQ_STATUS.PENDING_APPROVAL]: 'pendingApproval',
  [RFQ_STATUS.QUOTATION_RECEIVED]: 'quotationReceived',
  [RFQ_STATUS.EVALUATION]: 'evaluation',
  [RFQ_STATUS.FIRST_APPROVAL]: 'firstApproval',
  [RFQ_STATUS.SECOND_APPROVAL]: 'secondApproval',
  [RFQ_STATUS.FINAL_APPROVAL]: 'finalApproval'
};

/* Re-export RFQ_STATUS locally (avoids circular dependency). */
import { RFQ_STATUS } from '../constants';

/**
 * Pure derivation of all sidebar badge counts from pre-fetched
 * service data. Returns an object keyed by sidebar leaf ID.
 *
 * @param {Object} data - Named service responses (see type below)
 * @returns {Object} counts - { [leafKey]: number }
 *
 * Every count is a PENDING / action-required count only.
 * Zero counts are rendered as no badge (LeafItem hides them).
 */
export function deriveActionCounts({
  reqStats,
  nfaStats,
  rfqStats,
  quoteStats,
  followUpStats,
  board,
  poResult,
  vendorStats,
  invoiceStats,
  invoiceResult,
  docStats,
  mfgStats,
  shipStats,
  grnStats,
  inspStats
}) {
  const safe = (obj) => obj || {};
  const data = (result) => result?.data || [];
  const sumFields = (obj, fields) => fields.reduce((s, f) => s + (obj?.[f] || 0), 0);

  /* ------------------------------------------------------------------ */
  /*  PR — Pending Approval only                                         */
  /* ------------------------------------------------------------------ */
  const byStatus = safe(reqStats).byStatus || {};
  const prPending = safe(reqStats).pendingApproval ?? byStatus[PR_STATUS.PENDING_APPROVAL] ?? 0;

  /* ------------------------------------------------------------------ */
  /*  Technical Specification Review                                     */
  /* ------------------------------------------------------------------ */
  const technicalReview = byStatus[PR_STATUS.TECHNICAL_REVIEW] || 0;

  /* ------------------------------------------------------------------ */
  /*  RFQ — Pending Approval + Quotation Received + Evaluation only      */
  /*  (Draft is incomplete; Sent is normal waiting-for-vendor;           */
  /*  Approved / Awarded / Closed / Cancelled are terminal)              */
  /* ------------------------------------------------------------------ */
  const rfqPending = RFQ_PENDING_STATUSES.reduce(
    (sum, status) => sum + (safe(rfqStats)[RFQ_STATS_FIELD[status]] || 0),
    0
  );

  /* ------------------------------------------------------------------ */
  /*  RFQ Follow-ups — Pending + Overdue only                            */
  /*  (Completed / Cancelled are never actionable)                       */
  /* ------------------------------------------------------------------ */
  const followUpActionable = safe(followUpStats).pending
    ?? safe(followUpStats).overdue
    ?? 0;

  /* ------------------------------------------------------------------ */
  /*  Vendor Quotations — Received only (awaiting accept/reject)         */
  /* ------------------------------------------------------------------ */
  const quotationReceived = safe(quoteStats).received ?? 0;

  /* ------------------------------------------------------------------ */
  /*  PCS — Price Comparative Statement                                  */
  /*  Board items with quotations received but workflow not yet at       */
  /*  Comparison stage.                                                  */
  /* ------------------------------------------------------------------ */
  const items = Array.isArray(board) ? board : [];
  const atStage = (item, stage) => stageIndex(item?.workflowStage) >= stageIndex(stage);

  const pcsPending = items.filter(
    (item) => item?.steps?.quotations && !atStage(item, 'COMPARISON')
  ).length;

  /* ------------------------------------------------------------------ */
  /*  Technical Evaluation — board items whose technical step is         */
  /*  pending AND the strict workflow gate is unlocked.                  */
  /* ------------------------------------------------------------------ */
  const techEvalPending = items.filter(
    (item) => !item?.steps?.technical && !item?.gates?.technical
  ).length;

  /* ------------------------------------------------------------------ */
  /*  Final Negotiation — reached Comparison, no round agreed,          */
  /*  not past negotiation (reached Technical Evaluation or later).      */
  /* ------------------------------------------------------------------ */
  const negotiationPending = items.filter(
    (item) =>
      item?.steps?.quotations &&
      atStage(item, 'COMPARISON') &&
      !item?.steps?.negotiationAgreed &&
      !atStage(item, 'TECHNICAL_EVALUATION')
  ).length;

  /* ------------------------------------------------------------------ */
  /*  Approval Flow (NFA) — First + Second + Final pending               */
  /* ------------------------------------------------------------------ */
  const approvalFlowPending = sumFields(safe(nfaStats), ['firstPending', 'secondPending', 'finalPending']);

  /* ------------------------------------------------------------------ */
  /*  PO — awaiting the approval decision only (submitted, status
     Pending Approval). Drafts are not waiting for approval and later
     stages have passed the gate — exactly like the PO Approval page. */
  /* ------------------------------------------------------------------ */
  const poPending = data(poResult).filter(
    (order) =>
      order.status === PO_STATUS.PENDING_APPROVAL
      && (order.approvalStatus ?? APPROVAL_STATUS.PENDING) === APPROVAL_STATUS.PENDING
  ).length;

  /* ------------------------------------------------------------------ */
  /*  Supplier Acknowledgement — pending acknowledgements from POs that
     were actually released to the supplier (status Released or beyond;
     Approved-but-not-released POs were never sent). */
  /* ------------------------------------------------------------------ */
  const releasedOrders = data(poResult).filter((order) => isPoReleased(order.status));
  const ackPending = countPendingAcknowledgements(releasedOrders);

  /* ------------------------------------------------------------------ */
  /*  PO Releases — approved POs not yet released to the supplier
     (status Approved = the release decision is the next step). */
  /* ------------------------------------------------------------------ */
  const poReleases = data(poResult).filter(
    (order) => order.status === PO_STATUS.APPROVED
  ).length;

  /* ------------------------------------------------------------------ */
  /*  Logistics: Manufacturing/Packing — In Production only              */
  /*  (Packed is in progress but can be advanced; Ready to Ship is       */
  /*  terminal. Only In Production = genuinely needs buyer attention.)   */
  /* ------------------------------------------------------------------ */
  const mfgPending = safe(mfgStats).inProduction ?? 0;

  /* ------------------------------------------------------------------ */
  /*  Logistics: Dispatch — action-required states only                  */
  /*  (Pending Dispatch = needs dispatch action; Delayed = needs         */
  /*  exception handling. In Transit = waiting for delivery — no         */
  /*  immediate action needed; Delivered = complete.)                    */
  /* ------------------------------------------------------------------ */
  const dispatchPending = sumFields(safe(shipStats), ['pending', 'delayed']);

  /* ------------------------------------------------------------------ */
  /*  Logistics: GRN — Expected / awaiting receipt only                  */
  /*  (Pending Inspection is handled by the Quality count;               */
  /*  Received = complete.)                                              */
  /* ------------------------------------------------------------------ */
  const grnPending = safe(grnStats).expected ?? 0;

  /* ------------------------------------------------------------------ */
  /*  Quality — Pending inspection only                                  */
  /* ------------------------------------------------------------------ */
  const qualityPending = safe(inspStats).pending ?? 0;

  /* ------------------------------------------------------------------ */
  /*  Invoice — Submitted + Approved (awaiting payment) + Overdue        */
  /*  (Draft is not yet in workflow; Paid / Partially Paid / Rejected    */
  /*  are past the action step)                                          */
  /* ------------------------------------------------------------------ */
  const invoiceActionable =
    (safe(invoiceStats)[INVOICE_STATUS.SUBMITTED] || 0) +
    (safe(invoiceStats)[INVOICE_STATUS.APPROVED] || 0) +
    (safe(invoiceStats)[INVOICE_STATUS.OVERDUE] || 0);

  /* ------------------------------------------------------------------ */
  /*  3-Way Match — Pending Match + Mismatch (both require action)       */
  /* ------------------------------------------------------------------ */
  const invoiceRows = data(invoiceResult);
  const matchPendingCount = invoiceRows.filter((row) => isMatchPending(row)).length;

  /* ------------------------------------------------------------------ */
  /*  Payment Approval — matched and not yet paid                        */
  /* ------------------------------------------------------------------ */
  const paymentApprovalCount = invoiceRows.filter((row) => isPaymentPending(row)).length;

  /* ------------------------------------------------------------------ */
  /*  Vendor Documents — pending verification only                       */
  /* ------------------------------------------------------------------ */
  const vendorDocPending = safe(docStats).pending ?? 0;

  /* ------------------------------------------------------------------ */
  /*  Work Queue aggregate — the exact sum of the ten actionable queue
     categories (services/workQueue.js uses the SAME predicates, so the
     sidebar badge always equals the queue page total): PR approvals +
     RFQ actions + PO approvals + PO releases + supplier acks + pending
     GRNs + pending inspections + invoice matching + invoice approvals
     (submitted only) + payments due. */
  /* ------------------------------------------------------------------ */
  const invoiceApprovalsQueue = invoiceRows.filter(
    (row) => row.status === INVOICE_STATUS.SUBMITTED
  ).length;

  /* ------------------------------------------------------------------ */
  /*  Assemble sidebar leaf counts                                       */
  /* ------------------------------------------------------------------ */
  const leafCounts = {
    'pr-list': prPending,
    'pr-tech-spec': technicalReview,
    'vendor-list': safe(vendorStats).pending ?? 0,
    'rfq-list': rfqPending,
    'rfq-follow-ups': followUpActionable,
    'vendor-quotations': quotationReceived,
    'price-comparative-statement': pcsPending,
    'technical-evaluation': techEvalPending,
    'final-negotiation': negotiationPending,
    'approval-flow': approvalFlowPending,
    'po-list': poPending,
    'po-released-ack': ackPending,
    'invoice-list': invoiceActionable,
    'invoice-three-way': matchPendingCount,
    'invoice-payment-approval': paymentApprovalCount,
    'invoice-vendor-payment': paymentApprovalCount,
    'logistics-manufacturing': mfgPending,
    'logistics-shipment': dispatchPending,
    'logistics-grn': grnPending,
    'logistics-quality': qualityPending,
    'vendor-documents': vendorDocPending,
    'nfa': approvalFlowPending,
    'work-queue':
      prPending +
      rfqPending +
      poPending +
      poReleases +
      ackPending +
      grnPending +
      qualityPending +
      matchPendingCount +
      invoiceApprovalsQueue +
      paymentApprovalCount
  };

  /* ------------------------------------------------------------------ */
  /*  Category-level aggregates (sidebar top-level badge counts)         */
  /*  These sum multiple leaf counts for top-level menu items that       */
  /*  represent a group of sub-sections.                                */
  /* ------------------------------------------------------------------ */
  /* Purchase Requisition — combined PR pending + tech review */
  leafCounts['purchase-requisition'] =
    leafCounts['pr-list'] +
    leafCounts['pr-tech-spec'];

  leafCounts['logistics'] =
    leafCounts['logistics-manufacturing'] +
    leafCounts['logistics-shipment'] +
    leafCounts['logistics-grn'] +
    leafCounts['logistics-quality'];
  leafCounts['invoices'] =
    leafCounts['invoice-list'] +
    leafCounts['invoice-three-way'];

  return leafCounts;
}

/**
 * Pure derivation of the overdue highlight object (RFQ Follow-ups).
 * Used by the sidebar to pulse overdue badges.
 */
export function deriveOverdueHighlights({ followUpStats }) {
  return {
    'rfq-follow-ups': followUpStats?.overdue ?? 0
  };
}

/**
 * Async function that fetches all Purchase service data and returns
 * the computed action counts. Used by the sidebar hook.
 */
export async function getPurchaseActionCounts() {
  const { requisitionService } = await import('../services/requisition');
  const { nfaService } = await import('../services/nfa');
  const { rfqService } = await import('../services/rfq');
  const { rfqFollowUpService } = await import('../services/rfqFollowUp');
  const { evaluationService } = await import('../services/evaluation');
  const { purchaseOrderService } = await import('../services/purchaseOrder');
  const { vendorService } = await import('../services/vendor');
  const { invoiceService } = await import('../services/invoice');
  const { logisticsService } = await import('../services/logistics');
  const { vendorDocumentService } = await import('../services/vendorDocuments');

  const [
    reqStats, nfaStats, rfqStats, quoteStats,
    followUpStats, board, poResult, vendorStats,
    invoiceStats, invoiceResult, docStats,
    mfgStats, shipStats, grnStats, inspStats
  ] = await Promise.all([
    requisitionService.getRequisitionStats(),
    nfaService.getNfaStats(),
    rfqService.getRfqStats(),
    rfqService.getQuotationStats(),
    rfqFollowUpService.getFollowUpStats(),
    evaluationService.getEvaluationBoard(),
    purchaseOrderService.getOrders({ page: 1, pageSize: 500 }),
    vendorService.getVendorStats(),
    invoiceService.getInvoiceStats(),
    invoiceService.getInvoices({ page: 1, pageSize: 500 }),
    vendorDocumentService.getDocumentStats(),
    logisticsService.getManufacturingStats(),
    logisticsService.getShipmentStats(),
    logisticsService.getGrnStats(),
    logisticsService.getInspectionStats()
  ]);

  return {
    counts: deriveActionCounts({
      reqStats, nfaStats, rfqStats, quoteStats,
      followUpStats, board, poResult, vendorStats,
      invoiceStats, invoiceResult, docStats,
      mfgStats, shipStats, grnStats, inspStats
    }),
    overdue: deriveOverdueHighlights({ followUpStats })
  };
}

export default {
  deriveActionCounts,
  deriveOverdueHighlights,
  getPurchaseActionCounts
};
