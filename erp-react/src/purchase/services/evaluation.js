/**
 * purchase/services/evaluation.js
 * ------------------------------------------------------------------
 * Mock Procurement Evaluation service — connects Technical Evaluation,
 * Commercial Evaluation, Price Negotiation, Supplier Selection and
 * Selection Approval into one sequential workflow:
 *
 *   Quotation Comparison → Price Negotiation →
 *   Technical Evaluation → Commercial Evaluation → Supplier
 *   Selection → Selection Approval → RFQ Award
 *
 * Scores are DERIVED from the actual stored quotations (quoted totals,
 * delivery days, payment terms, warranty, freight/charges, vendor
 * rating) so every page reflects real quotation data. Workflow state —
 * step completions, negotiation history, the explicit supplier choice
 * and its approval — persists to localStorage via a lazy collection.
 *
 * Guards (enforced at the service boundary, all invalid transitions
 * throw):
 *   - evaluation only for RFQs that are open for bids (Sent / Quotation
 *     Received / Evaluation) with at least one received quotation;
 *   - technical evaluation requires received quotations;
 *   - commercial requires technical completed;
 *   - negotiation is a quotation-preparation step — it requires only
 *     received quotations and happens BEFORE technical / commercial
 *     evaluation when required (it never blocks them and never follows
 *     them);
 *   - selection requires technical + commercial completed and an
 *     explicit vendor choice — never automatic;
 *   - approval requires a completed selection;
 *   - RFQ award (see rfq.js awardRfq) requires an APPROVED selection.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, QUOTATION_STATUS, RFQ_STATUS, deriveWorkflowStage, stageIndex } from '../constants';
import { clone, createCollection, delay, storageKeys } from './base';
import { getCurrentActor, isApiMode } from './api-client';
import { rfqApi } from './api/rfqApi';
import { rfqsStore, quotationsStore } from './rfq';
import { vendorsStore } from './vendor';
import {
  normalizePaymentTerms,
  validatePaymentTerms,
  paymentTermsLabel
} from '../utils/paymentTerms';

export const NEGOTIATION_STAGES = ['Not Started', 'In Progress', 'Agreed', 'Rejected'];

/** Cost-estimation workflow statuses — persisted on the evaluation
 *  record (record.costEstimateStatus). NOT_STARTED is the default
 *  (no estimate stored yet); IN_PROGRESS is set when a draft is saved;
 *  COMPLETED is set by the final completion, which unlocks Technical
 *  Evaluation. */
/** @deprecated Cost Estimation has been removed from the workflow. */
export const COST_ESTIMATE_STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed'
};

const TECH_CRITERIA = [
  { key: 'compliance', label: 'Specification Compliance', weight: 40 },
  { key: 'quality', label: 'Quality & Certification', weight: 25 },
  { key: 'delivery', label: 'Delivery Capability', weight: 20 },
  { key: 'postPurchase', label: 'Post-Purchase Support', weight: 15 }
];

const COMMERCIAL_CRITERIA = [
  { key: 'price', label: 'Price', weight: 50 },
  { key: 'payment', label: 'Payment Terms', weight: 20 },
  { key: 'deliveryCharges', label: 'Delivery Charges', weight: 15 },
  { key: 'warranty', label: 'Warranty & Post-Purchase', weight: 15 }
];

/** True when an RFQ is eligible for evaluation (open with bids invited).
 *  PENDING_APPROVAL is included because a post-technical-evaluation RFQ
 *  advances to Pending Approval (the Approval Flow stage) while still
 *  carrying live quotations — the evaluation board and pages must keep
 *  showing it. FIRST / SECOND / FINAL_APPROVAL are the Approval Flow
 *  stages: the RFQ keeps its live quotations (and its completed
 *  evaluation state) until the award, so the board keeps showing it
 *  with the SAME status the RFQ list reports. An RFQ in the INITIAL
 *  Pending Approval stage never has quotations, so it is naturally
 *  excluded by the quotation checks. */
function isOpenForEvaluation(rfq) {
  return [
    RFQ_STATUS.SENT,
    RFQ_STATUS.QUOTATION_RECEIVED,
    RFQ_STATUS.EVALUATION,
    RFQ_STATUS.PENDING_APPROVAL,
    RFQ_STATUS.FIRST_APPROVAL,
    RFQ_STATUS.SECOND_APPROVAL,
    RFQ_STATUS.FINAL_APPROVAL
  ].includes(rfq.status);
}

/**
 * READ gate — the RFQ still has an evaluation context to SHOW.
 *
 * Reading a workflow context is deliberately NOT the same question as
 * being allowed to change one. `isOpenForEvaluation()` above stays the
 * guard for every MUTATION (technical / commercial completion,
 * negotiation rounds, payment terms, supplier selection, per-vendor
 * scores and decisions). This predicate governs the READ paths — the
 * single-RFQ board and the evaluation rows/lists — and additionally
 * admits AWARDED RFQs.
 *
 * An awarded RFQ is the end of the same chain, not a different one: it
 * still carries the received quotations and the stored technical /
 * commercial / negotiation / selection / approval state that the
 * Technical Evaluation page, the Price Comparative Statement (detail +
 * print) and the Approval Flow (NFA) detail read back. Blocking those
 * reads made a finished RFQ render as "RFQ not available for technical
 * evaluation", and — because the PCS page derives its "Continue" step
 * from the same context — left the workflow without the
 * completed-technical-evaluation flag, so it re-offered Technical
 * Evaluation instead of advancing to the Approval Flow.
 *
 * Reaching the context still requires real data: the rows are built
 * from received (non-rejected) quotations, so a draft or cancelled RFQ
 * with no quotation yields nothing regardless of this gate.
 */
function hasEvaluationContext(rfq) {
  return isOpenForEvaluation(rfq) || rfq.status === RFQ_STATUS.AWARDED;
}

function nowIso() {
  return new Date().toISOString();
}

function entry(type, label, note = '') {
  const actor = getCurrentActor();
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    actor: actor.name || 'System',
    timestamp: nowIso(),
    note
  };
}

/** Deterministic pseudo-random variation for qualitative criteria. */
function seededScore(seed, base) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 997;
  }
  const variation = (hash % 25) - 12; // -12 .. +12
  return Math.max(45, Math.min(98, base + variation));
}

function clampScore(value) {
  return Math.max(40, Math.min(100, Math.round(value)));
}

function vendorRating(name) {
  const vendor = vendorsStore.all.find((entry) => entry.name === name);
  return Number(vendor?.rating) || 3.5;
}

/** Delivery-capability score from the ACTUAL quoted delivery days. */
function deliveryScore(quote) {
  const days = Number(quote.delivery) || 0;
  return clampScore(100 - days * 1.5);
}

/** Payment-terms score from the ACTUAL quoted payment terms. */
function paymentTermsScore(terms) {
  const map = {
    Advance: 30,
    'On Delivery': 40,
    '7 Days': 50,
    '15 Days': 60,
    '30 Days': 70,
    '45 Days': 80,
    '60 Days': 90,
    '90 Days': 100
  };
  return map[terms] ?? 60;
}

/** Warranty score from the ACTUAL quoted warranty term. */
function warrantyScore(warranty) {
  const months = Number.parseInt(String(warranty || ''), 10);
  if (!Number.isFinite(months)) return warranty === 'None' ? 15 : 60;
  if (months >= 12) return 100;
  if (months >= 6) return 70;
  if (months >= 3) return 50;
  return 30;
}

/** Delivery-charges score from the ACTUAL quoted freight/insurance/charges. */
function deliveryChargesScore(quote, peers) {
  const chargesOf = (q) => (Number(q.freight) || 0) + (Number(q.insurance) || 0) + (Number(q.charges) || 0);
  const value = chargesOf(quote);
  const values = peers.map(chargesOf);
  const min = values.length ? Math.min(...values) : value;
  const max = values.length ? Math.max(...values) : value;
  const range = max - min || 1;
  return clampScore(100 - ((value - min) / range) * 40);
}

/** Builds the derived evaluation rows for every RFQ that is open for
 *  bids and has at least one received (non-rejected) quotation. All
 *  figures come from the actual stored quotations. */
function buildEvaluationRows() {
  const rows = [];
  rfqsStore.all.forEach((rfq) => {
    if (!hasEvaluationContext(rfq)) return;
    const quotes = quotationsStore.all
      .filter((quote) => quote.rfqNo === rfq.rfqNo)
      .filter((quote) => quote.status !== QUOTATION_STATUS.REJECTED)
      .sort((a, b) => a.total - b.total);

    if (quotes.length === 0) return;

    quotes.forEach((quote) => {
      const rating = vendorRating(quote.vendor);

      const technical = TECH_CRITERIA.map((criterion) => {
        let score;
        if (criterion.key === 'quality') score = clampScore(rating * 18);
        else if (criterion.key === 'delivery') score = deliveryScore(quote);
        else score = seededScore(`${rfq.rfqNo}-${quote.vendor}-${criterion.key}`, 80);
        return { ...criterion, score };
      });
      const technicalTotal = Math.round(
        technical.reduce((sum, criterion) => sum + criterion.score * (criterion.weight / 100), 0)
      );

      const cheapest = quotes[0].total;
      const priceScore =
        cheapest > 0 ? Math.max(55, Math.round(100 - ((quote.total - cheapest) / cheapest) * 60)) : 80;
      const commercial = COMMERCIAL_CRITERIA.map((criterion) => {
        let score;
        if (criterion.key === 'price') score = priceScore;
        else if (criterion.key === 'payment') score = paymentTermsScore(quote.paymentTerms);
        else if (criterion.key === 'deliveryCharges') score = deliveryChargesScore(quote, quotes);
        else score = warrantyScore(quote.warranty);
        return { ...criterion, score };
      });
      const commercialTotal = Math.round(
        commercial.reduce((sum, criterion) => sum + criterion.score * (criterion.weight / 100), 0)
      );

      rows.push({
        id: quote.id,
        rfqNo: rfq.rfqNo,
        rfqId: rfq.id,
        rfqStatus: rfq.status,
        vendor: quote.vendor,
        quoteId: quote.id,
        total: quote.total,
        currency: quote.currency,
        delivery: Number(quote.delivery) || 0,
        paymentTerms: quote.paymentTerms || '',
        warranty: quote.warranty || '',
        vendorRating: Number(quote.vendorRating) || rating,
        technical,
        technicalTotal,
        commercial,
        commercialTotal,
        overall: Math.round(technicalTotal * 0.6 + commercialTotal * 0.4),
        status: quote.status
      });
    });
  });
  return rows;
}

/** Lazy evaluation records keyed by RFQ. In API mode the cache is
 *  re-hydrated from the backend on first use (see ensureApiData) so the
 *  database — not browser storage — is the source of truth. */
export const evaluationsStore = createCollection(storageKeys.evaluations, () => []);

/**
 * Resolves an RFQ from the local cache by numeric id OR RFQ number.
 * A <select> always hands back a string while the API sends numeric
 * ids, so the comparison must be loose or every lookup reads as
 * "not found" for a perfectly valid selection.
 */
function findRfq(reference) {
  if (reference == null || reference === '') return null;
  const target = String(reference);
  return (
    rfqsStore.all.find((entry) => String(entry.id) === target || entry.rfqNo === target) || null
  );
}

function findRecord(rfqId, rfqNo) {
  const id = rfqId == null ? '' : String(rfqId);
  const no = rfqNo == null ? '' : String(rfqNo);
  return (
    evaluationsStore.all.find(
      (entry) => String(entry.id) === id || (no !== '' && entry.rfqNo === no)
    ) || null
  );
}

/* ==================================================================
   BACKEND PERSISTENCE (API mode)
   ------------------------------------------------------------------
   The evaluation engine must not treat browser-local storage as the
   source of truth. The RFQ/quotation context is read from the backend,
   the evaluation document (technical scores, negotiation rounds,
   supplier selection, approval) is loaded from and written to
   purchase_rfq_evaluation_records, and every round is additionally
   queryable per RFQ.
   ================================================================== */
let hydration = null;

/** Normalises a paged API payload into its row array. */
function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

/**
 * Loads the real RFQs, quotations and saved evaluation documents into
 * the local caches. Runs once per session (the promise is memoised) so
 * every derived figure — evaluation rows, board stages, award
 * allocations — is computed from database records.
 */
async function ensureApiData() {
  if (!isApiMode()) return null;
  if (hydration) return hydration;
  hydration = (async () => {
    try {
      const [rfqPage, quotePage, stored] = await Promise.all([
        rfqApi.list({ page: 1, pageSize: 500 }),
        rfqApi.quotations({ page: 1, pageSize: 500 }),
        rfqApi.evaluationRecords()
      ]);
      const rfqs = rowsOf(rfqPage);
      const quotes = rowsOf(quotePage);
      rfqsStore.all.splice(0, rfqsStore.all.length, ...rfqs);
      quotationsStore.all.splice(0, quotationsStore.all.length, ...quotes);
      evaluationsStore.all.splice(0, evaluationsStore.all.length);
      (Array.isArray(stored) ? stored : []).forEach((entry) => {
        const record = entry?.record;
        if (!record || typeof record !== 'object') return;
        const rfqNo = record.rfqNo || entry.rfqNo;
        const rfq = rfqs.find((item) => item.rfqNo === rfqNo);
        evaluationsStore.all.push({
          ...record,
          id: rfq?.id ?? record.id ?? entry.rfqRef ?? rfqNo,
          rfqNo
        });
      });
      return {
        rfqs: rfqs.length,
        quotations: quotes.length,
        records: evaluationsStore.all.length
      };
    } catch (error) {
      /* Never cache a failure — the next call retries. */
      hydration = null;
      throw error;
    }
  })();
  return hydration;
}

/** Persists one evaluation document (and its rounds) to the backend. */
async function persistApiRecord(record) {
  if (!record?.rfqNo) return null;
  const rfq = rfqsStore.all.find((entry) => entry.rfqNo === record.rfqNo) || null;
  let stage = record.stage ?? null;
  try {
    stage = buildBoard().find((item) => item.rfqNo === record.rfqNo)?.stage ?? stage;
  } catch { /* the stage is informational — never block the write */ }
  return rfqApi.saveEvaluationRecord(record.rfqNo, {
    ...clone(record),
    rfqRef: record.id == null ? null : String(record.id),
    stage: stage ?? rfq?.status ?? null
  });
}

/** Creates (and persists) a fresh record for an RFQ on first mutation. */
function ensureRecord(rfq) {
  let record = findRecord(rfq.id, rfq.rfqNo);
  if (record) {
    /* Migrate legacy records: add vendorEvaluations if missing. */
    if (!record.vendorEvaluations) record.vendorEvaluations = {};
    return record;
  }
  record = {
    id: rfq.id,
    rfqNo: rfq.rfqNo,
    technical: null,
    commercial: null,
    negotiations: [],
    vendorEvaluations: {},
    selection: null,
    approval: null,
    activity: []
  };
  evaluationsStore.all.push(record);
  evaluationsStore.persist(evaluationsStore.all);
  return record;
}

/**
 * Filter negotiation rounds for a specific vendor/quotation.
 * When quotationId is provided:
 *   - Rounds WITH a quotationId are matched ONLY by quotationId
 *   - Rounds WITHOUT a quotationId (old records) are matched by vendor name
 * This prevents cross-contamination when a vendor has multiple quotations.
 * When quotationId is not provided, falls back to vendor-name matching.
 */
function roundsFor(record, vendor, quotationId) {
  return (record?.negotiations || []).filter((entry) => {
    if (quotationId) {
      /* If the round has a quotationId, match by it exclusively. */
      if (entry.quotationId) return entry.quotationId === quotationId;
      /* Old record without quotationId — fall back to vendor name. */
      return entry.vendor === vendor;
    }
    /* No quotationId provided — match by vendor name only. */
    return entry.vendor === vendor;
  });
}

/** Latest agreed negotiation amount for a vendor/quotation (null when none agreed). */
function agreedAmount(record, vendor, quotationId) {
  const rounds = roundsFor(record, vendor, quotationId);
  const agreed = [...rounds].reverse().find((entry) => entry.stage === 'Agreed');
  return agreed ? Math.round((Number(agreed.amount) || 0) * 100) / 100 : null;
}

function negotiationStage(record, vendor, quotationId) {
  const rounds = roundsFor(record, vendor, quotationId);
  return rounds.length ? rounds[rounds.length - 1].stage : 'Not Started';
}

/* ------------------------------------------------------------------ */
/*  PER-VENDOR TECHNICAL EVALUATION STATUS                             */
/*                                                                     */
/*  Each vendor quotation gets its own independent evaluation:          */
/*  scores, decision, evaluatedBy/at. The RFQ-level status is          */
/*  derived from all vendor evaluations.                               */
/* ------------------------------------------------------------------ */

/** Technical evaluation statuses for individual vendors. */
export const VENDOR_EVAL_STATUS = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  QUALIFIED: 'Technically Qualified',
  NOT_QUALIFIED: 'Not Qualified',
  REJECTED: 'Rejected'
};

/** Qualification threshold — vendors scoring >= this are qualified. */
export const QUALIFICATION_THRESHOLD = 70;

/**
 * Returns the vendorEvaluations map from a record (creates if missing).
 * Keyed by vendor name → { scores, remarks, decision, evaluatedBy, evaluatedAt }
 */
function getVendorEvaluations(record) {
  if (!record) return {};
  if (!record.vendorEvaluations) record.vendorEvaluations = {};
  return record.vendorEvaluations;
}

/**
 * Derives the per-vendor evaluation status from stored scores/decision.
 * If no evaluation exists for the vendor → Pending.
 * If scores entered but no decision → In Progress.
 * If decision made → Technically Qualified or Not Qualified.
 */
function deriveVendorEvalStatus(record, vendorName) {
  const evals = getVendorEvaluations(record);
  const vendorEval = evals[vendorName];
  if (!vendorEval) return VENDOR_EVAL_STATUS.PENDING;
  if (vendorEval.decision === 'Qualified') return VENDOR_EVAL_STATUS.QUALIFIED;
  if (vendorEval.decision === 'Not Qualified') return VENDOR_EVAL_STATUS.NOT_QUALIFIED;
  if (vendorEval.decision === 'Rejected') return VENDOR_EVAL_STATUS.REJECTED;
  /* Scores exist but decision not yet made → In Progress. */
  if (vendorEval.scores && Object.keys(vendorEval.scores).length > 0) {
    return VENDOR_EVAL_STATUS.IN_PROGRESS;
  }
  return VENDOR_EVAL_STATUS.PENDING;
}

/**
 * Computes the weighted technical total from a scores object.
 * scores: { compliance: 86, quality: 77, delivery: 79, postPurchase: 69 }
 * Returns 0-100 weighted total.
 */
function computeTechnicalTotal(scores) {
  if (!scores || typeof scores !== 'object') return 0;
  let total = 0;
  for (const criterion of TECH_CRITERIA) {
    const score = Number(scores[criterion.key]) || 0;
    total += score * (criterion.weight / 100);
  }
  return Math.round(total);
}

/* ------------------------------------------------------------------ */
/*  STRICT WORKFLOW GATES — the single source of truth for stage       */
/*  prerequisites. Every page derives its lock state from the board's  */
/*  `gates` map (built from these exact predicates) and every service  */
/*  method re-checks them at the boundary, so URL manipulation, direct */
/*  navigation, console calls or stale frontend state can never bypass */
/*  a gate — an unauthorized transition is always rejected.            */
/*                                                                     */
/*    Technical Evaluation requires:  Comparison + Negotiation         */
/*    Commercial Evaluation requires: Technical                       */
/*    Supplier Selection requires:    Comparison + Negotiation +       */
/*                                    Technical + Commercial +         */
/*                                    Payment Terms                   */
/* ------------------------------------------------------------------ */

/** Comparison completed — the workflow has reached Comparison or later. */
function comparisonCompleted(rfq) {
  return stageIndex(deriveWorkflowStage(rfq)) >= stageIndex('COMPARISON');
}

/** Negotiation completed — at least one round closed as Agreed. */
function negotiationCompleted(record) {
  return (record?.negotiations || []).some((round) => round.stage === 'Agreed');
}

/** Payment terms finalized — structured terms stored on the record or RFQ. */
function paymentTermsFinalized(record, rfq) {
  return Boolean(record?.paymentTerms?.type || rfq?.paymentTerms?.type);
}

/**
 * Lock messages per stage — the first unmet prerequisite (in canonical
 * order) with a clear, actionable message. `null` = the stage is
 * unlocked. Exposed on every board item so the UI renders exactly the
 * same rule the service enforces.
 */
function workflowGateMessages(record, rfq) {
  const comparison = comparisonCompleted(rfq);
  const negotiation = negotiationCompleted(record);
  const technical = Boolean(record?.technical);
  const commercial = Boolean(record?.commercial);
  const payment = paymentTermsFinalized(record, rfq);
  return {
    technical: !comparison
      ? 'Complete the quotation comparison before starting the technical evaluation.'
      : !negotiation
        ? 'Complete the negotiation before starting the technical evaluation.'
        : null,
    commercial: !technical
      ? 'Complete the technical evaluation before starting the commercial evaluation.'
      : null,
    selection: !comparison
      ? 'Complete the quotation comparison before selecting a supplier.'
      : !negotiation
        ? 'Complete the negotiation before selecting a supplier.'
        : !technical
            ? 'Complete the technical evaluation before selecting a supplier.'
            : !commercial
              ? 'Complete the commercial evaluation before selecting a supplier.'
              : !payment
                ? 'Finalize the payment terms before selecting a supplier.'
                : null
  };
}

/** Merges live derived rows with the stored workflow state into a board item. */
function boardFor(rfq, rows, record) {
  const vendorEvals = getVendorEvaluations(record);
  const vendors = rows.map((row) => {
    const vendorEval = vendorEvals[row.vendor] || {};
    const evalStatus = deriveVendorEvalStatus(record, row.vendor);
    /* Use stored scores when available, fall back to derived scores. */
    const storedScores = vendorEval.scores || {};
    const technical = TECH_CRITERIA.map((criterion) => {
      const storedScore = Number(storedScores[criterion.key]);
      const derivedScore = row.technical?.find((c) => c.key === criterion.key)?.score ?? 0;
      return { ...criterion, score: Number.isFinite(storedScore) ? storedScore : derivedScore };
    });
    const technicalTotal = vendorEval.scores
      ? computeTechnicalTotal(vendorEval.scores)
      : (row.technicalTotal || 0);
    return {
      ...clone(row),
      technical,
      technicalTotal,
      evalStatus,
      evalDecision: vendorEval.decision || null,
      evalRemarks: vendorEval.remarks || '',
      evaluatedBy: vendorEval.evaluatedBy || null,
      evaluatedAt: vendorEval.evaluatedAt || null,
      negotiatedValue: agreedAmount(record, row.vendor, row.quoteId),
      negotiationStage: negotiationStage(record, row.vendor, row.quoteId),
      rounds: roundsFor(record, row.vendor, row.quoteId).map(clone)
    };
  });
  /* Derive RFQ-level technical status from per-vendor evaluations. */
  const vendorStatuses = vendors.map((v) => v.evalStatus);
  const allDecided = vendorStatuses.every(
    (s) => s !== VENDOR_EVAL_STATUS.PENDING && s !== VENDOR_EVAL_STATUS.IN_PROGRESS
  );
  const qualifiedCount = vendorStatuses.filter((s) => s === VENDOR_EVAL_STATUS.QUALIFIED).length;
  const notQualifiedCount = vendorStatuses.filter((s) => s === VENDOR_EVAL_STATUS.NOT_QUALIFIED).length;
  const pendingCount = vendorStatuses.filter((s) => s === VENDOR_EVAL_STATUS.PENDING).length;
  return {
    rfqId: rfq.id,
    rfqNo: rfq.rfqNo,
    rfqStatus: rfq.status,
    currency: rfq.currency || 'INR',
    title: rfq.title || '',
    priority: rfq.priority || '',
    date: rfq.createdAt || '',
    dueDate: rfq.dueDate || '',
    department: rfq.department || '',
    project: rfq.project || '',
    buyer: rfq.buyer || '',
    requester: rfq.requester || '',
    vendorCount: rfq.vendorCount ?? (Array.isArray(rfq.vendors) ? rfq.vendors.length : 0),
    quotationReceived: rfq.quotationReceived ?? rows.length,
    vendors,
    items: clone(rfq.items || []),
    negotiations: (record?.negotiations || []).map(clone),
    steps: {
      followUp: Boolean(rfq.sentAt),
      quotations: rows.length > 0,
      negotiation: (record?.negotiations || []).length > 0,
      negotiationAgreed: negotiationCompleted(record),
      payment: Boolean(record?.paymentTerms?.type || rfq.paymentTerms?.type),
      technical: Boolean(record?.technical),
      commercial: Boolean(record?.commercial),
      selection: Boolean(record?.selection),
      approval: record?.approval?.status || null
    },
    technical: record?.technical ? clone(record.technical) : null,
    commercial: record?.commercial ? clone(record.commercial) : null,
    paymentTerms: record?.paymentTerms || rfq.paymentTerms
      ? clone(record?.paymentTerms || rfq.paymentTerms)
      : null,
    selection: record?.selection ? clone(record.selection) : null,
    approval: record?.approval ? clone(record.approval) : null,
    activity: (record?.activity || []).map(clone),
    workflowStage: stageOf(rfq, record),
    gates: workflowGateMessages(record, rfq),

    /* Per-vendor evaluation summary. */
    vendorEvalSummary: {
      total: vendors.length,
      evaluated: qualifiedCount + notQualifiedCount,
      allDecided,
      qualified: qualifiedCount,
      notQualified: notQualifiedCount,
      pending: pendingCount,
      statuses: vendorStatuses
    }
  };
}

function buildBoard() {
  const items = [];
  rfqsStore.all.forEach((rfq) => {
    if (!hasEvaluationContext(rfq)) return;
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    if (rows.length === 0) return;
    items.push(boardFor(rfq, rows, findRecord(rfq.id, rfq.rfqNo)));
  });
  return items.sort((a, b) => a.rfqNo.localeCompare(b.rfqNo));
}

/** Stable per-line key for an RFQ item (quotation items are aligned to
 *  RFQ lines by index — the existing convention — so the key is the
 *  RFQ id + line index, with the product kept for display). */
export function itemKeyOf(rfqId, index) {
  return `${rfqId}:${index}`;
}

/**
 * Builds the item-wise award allocations for an RFQ from a stored
 * supplier selection. When the selection carries explicit
 * `allocations` (item-wise / split award) those win; otherwise the
 * classic single-vendor selection awards EVERY RFQ line to the
 * selected vendor at that vendor's QUOTATION rates. When a
 * negotiation was completed, per-line negotiated rates from the
 * latest round's itemRates are used instead, so the PO reflects
 * the final agreed price. Pure — never mutates the stores.
 */
export function buildAwardAllocations(rfq, selection, quotes = []) {
  const items = Array.isArray(rfq?.items) ? rfq.items : [];
  const rfqQuotes = quotes.filter((quote) => quote.rfqNo === rfq?.rfqNo);

  if (selection?.allocations && selection.allocations.length > 0) {
    return selection.allocations.map((allocation) => ({ ...allocation }));
  }

  if (!selection?.selectedVendor || !rfq) return [];
  const quote = rfqQuotes.find(
    (entry) =>
      entry.vendor === selection.selectedVendor &&
      entry.status !== QUOTATION_STATUS.REJECTED
  );
  if (!quote) return [];

  /* Look up the latest negotiation itemRates for this vendor so the
     PO uses the negotiated price, not the raw quotation rate.
     Match by quotationId when available for multi-vendor safety. */
  const record = findRecord(rfq.id, rfq.rfqNo);
  const selectedQuoteId = quote?.id || null;
  const vendorRounds = roundsFor(record, selection.selectedVendor, selectedQuoteId);
  const latestItemRates = [...vendorRounds]
    .reverse()
    .find((r) => r.itemRates && typeof r.itemRates === 'object' && Object.keys(r.itemRates).length > 0)?.itemRates || null;

  return items.map((item, index) => {
    const line = quote.items?.[index] || {};
    /* Use negotiated rate when available, fall back to quotation rate. */
    const negotiatedPrice = latestItemRates?.[index] != null
      ? Number(latestItemRates[index])
      : null;
    const unitPrice = negotiatedPrice != null && Number.isFinite(negotiatedPrice) && negotiatedPrice > 0
      ? Math.round(negotiatedPrice * 100) / 100
      : Math.round((Number(line.rate ?? item.rate ?? item.expectedRate) || 0) * 100) / 100;
    const qty = Number(item.qty ?? line.qty) || 0;
    return {
      itemKey: itemKeyOf(rfq.id, index),
      product: item.product || line.product || '',
      uom: item.uom || line.uom || '',
      qty,
      vendor: selection.selectedVendor,
      quoteId: quote.id,
      unitPrice,
      lineTotal: Math.round(unitPrice * qty * 100) / 100
    };
  });
}

async function persistRecord(record) {
  /* Keep the session cache in step, then make the database the source
     of truth. Callers `return persistRecord(...)` from async methods,
     so the write is awaited before the action reports success. */
  evaluationsStore.persist(evaluationsStore.all);
  if (isApiMode()) {
    await persistApiRecord(record);
  }
  return clone(record);
}

/**
 * Syncs the shared RFQ lifecycle status once the technical evaluation is
 * complete with at least one technically qualified vendor: the RFQ moves
 * from Evaluation to Pending Approval — the Approval Flow (NFA) stage.
 *
 * The status lives on the shared RFQ record (rfqsStore), so the RFQ list,
 * detail page and every other consumer read the same value. Idempotent and
 * forward-only — a later lifecycle status (Awarded / Closed / Cancelled)
 * is never regressed, and an RFQ without a qualified vendor stays in
 * Evaluation. Completion is recognised exactly like the UI and the NFA
 * service: the RFQ-level `record.technical` flag OR every vendor with a
 * received quotation has received a decision.
 */
function syncRfqApprovalStatus(rfq, record) {
  if (!rfq || !record) return;
  if (
    ![
      RFQ_STATUS.SENT,
      RFQ_STATUS.QUOTATION_RECEIVED,
      RFQ_STATUS.EVALUATION,
      RFQ_STATUS.PENDING_APPROVAL
    ].includes(rfq.status)
  ) {
    return;
  }
  /* Already in the Approval Flow stage — nothing to do. */
  if (rfq.status === RFQ_STATUS.PENDING_APPROVAL) return;

  const quotedVendors = quotationsStore.all
    .filter((quote) => quote.rfqNo === rfq.rfqNo && quote.status !== QUOTATION_STATUS.REJECTED)
    .map((quote) => quote.vendor);
  const evals = getVendorEvaluations(record);
  const allDecided =
    quotedVendors.length > 0 &&
    quotedVendors.every((name) =>
      ['Qualified', 'Not Qualified', 'Rejected'].includes(evals[name]?.decision)
    );
  const evaluationComplete = Boolean(record.technical) || allDecided;
  const hasQualified = Object.values(evals).some((v) => v.decision === 'Qualified');
  if (!evaluationComplete || !hasQualified) return;

  const index = rfqsStore.all.findIndex((entry) => entry.id === rfq.id);
  if (index === -1) return;
  rfqsStore.all[index] = {
    ...rfqsStore.all[index],
    status: RFQ_STATUS.PENDING_APPROVAL,
    activity: [
      ...(Array.isArray(rfqsStore.all[index].activity) ? rfqsStore.all[index].activity : []),
      entry(
        'status',
        `${rfq.rfqNo} moved to Pending Approval — technical evaluation completed`,
        'At least one vendor is technically qualified'
      )
    ]
  };
  rfqsStore.persist(rfqsStore.all);
}

/**
 * Advances the RFQ's persisted workflowStage — FORWARD ONLY, following
 * the canonical order in constants/workflow.js (a later stage never
 * regresses an earlier one). The RFQ keeps its document lifecycle
 * `status` untouched; `workflowStage` is the actual procurement stage.
 */
function advanceWorkflowStage(rfq, stage) {
  if (stageIndex(stage) <= stageIndex(rfq.workflowStage)) return;
  const index = rfqsStore.all.findIndex((entry) => entry.id === rfq.id);
  if (index === -1) return;
  rfqsStore.all[index] = { ...rfqsStore.all[index], workflowStage: stage };
  rfqsStore.persist(rfqsStore.all);
}

/**
 * The furthest procurement stage actually reached by an RFQ, per the
 * canonical workflow order — the persisted workflowStage plus every
 * evaluation step completed in the record. Used by the board so every
 * evaluation page reports the same stage the stepper shows.
 */
function stageOf(rfq, record) {
  const reached = [deriveWorkflowStage(rfq)];
  if ((record?.negotiations || []).length > 0) reached.push('NEGOTIATION');
  if (record?.technical) reached.push('TECHNICAL_EVALUATION');
  if (record?.commercial) reached.push('COMMERCIAL_EVALUATION');
  if (record?.selection) reached.push('SUPPLIER_SELECTION');
  if (rfq.status === RFQ_STATUS.AWARDED) reached.push('PURCHASE_ORDER');
  return [...reached].sort((a, b) => stageIndex(b) - stageIndex(a))[0] || 'RFQ';
}

/**
 * Public helper — exported for tests. Returns negotiation rounds matching
 * a vendor/quotationId, with backward-compatible fallback to vendor name.
 */
export { roundsFor };

export const evaluationService = {
  /** All derived evaluation rows (technical + commercial + overall). */
  async getEvaluationRows() {
    await delay();
    return clone(buildEvaluationRows());
  },

  /** Technical evaluation: ranked by technical score. */
  async getTechnicalEvaluation() {
    await delay();
    return clone(
      buildEvaluationRows()
        .sort((a, b) => b.technicalTotal - a.technicalTotal || a.total - b.total)
        .map((row, index) => ({ ...row, rank: index + 1 }))
    );
  },

  /** Commercial evaluation: ranked by commercial score then price. */
  async getCommercialEvaluation() {
    await delay();
    return clone(
      buildEvaluationRows()
        .sort((a, b) => b.commercialTotal - a.commercialTotal || a.total - b.total)
        .map((row, index) => ({ ...row, rank: index + 1 }))
    );
  },

  /** Per-RFQ board with vendor rows + workflow step state. */
  async getEvaluationBoard() {
    await delay();
    return clone(buildBoard());
  },

  /** Single-RFQ board (id or rfqNo), or null when not open for bids. */
  async getEvaluation(rfqId) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq || !hasEvaluationContext(rfq)) return null;
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    if (rows.length === 0) return null;
    return clone(boardFor(rfq, rows, findRecord(rfq.id, rfq.rfqNo)));
  },

  /** Board items with the selection / approval state (for the selection page). */
  async getSupplierSelections() {
    await delay();
    return clone(buildBoard());
  },

  /**
   * Completes the technical evaluation for an RFQ. All quotations of the
   * RFQ are scored against the technical criteria and the completion
   * (actor, timestamp, remarks) is recorded. One-way — repeats refused.
   */
  async completeTechnicalEvaluation(rfqId, { remarks = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be evaluated');
    }
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    if (rows.length === 0) {
      throw new Error('No received quotations available for technical evaluation');
    }
    const record = ensureRecord(rfq);
    if (record.technical) throw new Error('Technical evaluation already completed');
    /* STRICT GATES — Technical Evaluation requires the comparison and the
       negotiation (a round closed as Agreed) to be completed. Direct
       service calls are rejected — the canonical order is never bypassed. */
    if (!comparisonCompleted(rfq)) {
      throw new Error('Complete the quotation comparison before starting the technical evaluation');
    }
    if (!negotiationCompleted(record)) {
      throw new Error('Complete the negotiation before starting the technical evaluation');
    }
    const actor = getCurrentActor();
    record.technical = { completedAt: nowIso(), completedBy: actor.name || 'System', remarks: String(remarks || '') };
    record.activity.push(entry('technical', `${rfq.rfqNo} technical evaluation completed`, remarks));
    /* Technical Evaluation completed → Commercial Evaluation pending. */
    advanceWorkflowStage(rfq, 'COMMERCIAL_EVALUATION');
    /* With a technically qualified vendor the shared RFQ lifecycle status
       advances to Pending Approval (the Approval Flow stage) so the RFQ
       list and every consumer show the same status. */
    syncRfqApprovalStatus(rfq, record);
    return persistRecord(record);
  },

  /**
   * Completes the commercial evaluation — requires the technical step
   * first. Scores come from the actual quotation values. An optional
   * structured `paymentTerms` payload can be finalized at the same
   * time (validated against the 100% rules); when omitted the RFQ can
   * still be completed here and terms finalized later via
   * `finalizePaymentTerms` before supplier selection.
   */
  async completeCommercialEvaluation(rfqId, { remarks = '', paymentTerms } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be evaluated');
    }
    const record = ensureRecord(rfq);
    if (!record.technical) {
      throw new Error('Complete the technical evaluation before the commercial evaluation');
    }
    if (record.commercial) throw new Error('Commercial evaluation already completed');
    const actor = getCurrentActor();
    record.commercial = { completedAt: nowIso(), completedBy: actor.name || 'System', remarks: String(remarks || '') };
    record.activity.push(entry('commercial', `${rfq.rfqNo} commercial evaluation completed`, remarks));
    advanceWorkflowStage(rfq, 'COMMERCIAL_EVALUATION');
    if (paymentTerms) {
      const normalized = normalizePaymentTerms(paymentTerms);
      const errors = validatePaymentTerms(normalized);
      if (errors.length > 0) throw new Error(errors[0]);
      record.paymentTerms = normalized;
      record.activity.push(
        entry('payment-terms', `Payment Terms Created — ${paymentTermsLabel(normalized)}`, remarks)
      );
      /* Mirror onto the RFQ so PO creation can read the finalized terms. */
      const rfqIndex = rfqsStore.all.findIndex((entry) => entry.id === rfq.id);
      rfqsStore.all[rfqIndex] = { ...rfqsStore.all[rfqIndex], paymentTerms: clone(normalized) };
      rfqsStore.persist(rfqsStore.all);
    }
    return persistRecord(record);
  },

  /**
   * Payment Terms Finalization — stores (or updates) the finalized
   * structured payment terms on the evaluation record AND mirrors them
   * onto the RFQ so a subsequently raised PO inherits them. Typically
   * finalized during / right after the commercial evaluation, before
   * supplier selection. Requires the commercial evaluation; once the
   * selection is approved the terms are locked. Every change is
   * audited.
   */
  async finalizePaymentTerms(rfqId, { paymentTerms, remarks = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can finalize payment terms');
    }
    const record = ensureRecord(rfq);
    if (!record.technical || !record.commercial) {
      throw new Error('Complete technical and commercial evaluation before finalizing payment terms');
    }
    if (record.selection && record.approval?.status === APPROVAL_STATUS.APPROVED) {
      throw new Error('Payment terms cannot be changed after the selection is approved');
    }
    const normalized = normalizePaymentTerms(paymentTerms || {});
    const errors = validatePaymentTerms(normalized);
    if (errors.length > 0) throw new Error(errors[0]);
    const existed = Boolean(record.paymentTerms?.type || rfq.paymentTerms?.type);
    record.paymentTerms = normalized;
    record.activity.push(
      entry(
        'payment-terms',
        existed
          ? `Payment Terms Modified — ${paymentTermsLabel(normalized)}`
          : `Payment Terms Created — ${paymentTermsLabel(normalized)}`,
        remarks
      )
    );
    /* Mirror onto the RFQ so raisePurchaseOrder can carry the terms. */
    const rfqIndex = rfqsStore.all.findIndex((entry) => entry.id === rfq.id);
    rfqsStore.all[rfqIndex] = { ...rfqsStore.all[rfqIndex], paymentTerms: clone(normalized) };
    rfqsStore.persist(rfqsStore.all);
    return persistRecord(record);
  },

  /**
   * Records a negotiation round against one of the RFQ's quotations.
   * The ORIGINAL quotation is never touched — the quoted value stays on
   * the quotation while every round (offer amount, stage, note, actor,
   * timestamp) is appended to the negotiation history. Negotiation is a
   * quotation-preparation step performed after Quotation Comparison and
   * before Technical / Commercial Evaluation when required — it only
   * needs received quotations and never blocks the evaluations.
   */
  async recordNegotiation(rfqId, vendor, { amount = 0, stage, note = '', itemRates, quotationId, vendorId } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be negotiated');
    }
    const record = ensureRecord(rfq);
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    const matchedRow = rows.find((row) => row.vendor === vendor);
    if (!matchedRow) {
      throw new Error(`No quotation from ${vendor} for this RFQ`);
    }
    /* Resolve quotationId and vendorId when not provided explicitly.
       Use the matched evaluation row's quoteId, and resolve vendorId
       from the vendor master when available. */
    const resolvedQuoteId = quotationId || matchedRow.quoteId || null;
    let resolvedVendorId = vendorId || null;
    if (!resolvedVendorId) {
      const vendorRecord = vendorsStore.all.find(
        (entry) => entry.name === vendor || (entry.name && entry.name.includes(vendor))
      );
      resolvedVendorId = vendorRecord?.id || null;
    }
    if (!NEGOTIATION_STAGES.includes(stage)) {
      throw new Error('Invalid negotiation stage');
    }
    if (stage === 'Agreed' && !(Number(amount) > 0)) {
      throw new Error('Enter the agreed rate before closing the negotiation');
    }
    const actor = getCurrentActor();
    const priorRounds = (record.negotiations || []).filter((entry) => entry.vendor === vendor).length;
    record.negotiations.push({
      id: `neg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      vendor,
      ...(resolvedQuoteId ? { quotationId: resolvedQuoteId } : {}),
      ...(resolvedVendorId ? { vendorId: resolvedVendorId } : {}),
      round: priorRounds + 1,
      amount: Number(amount) || 0,
      stage,
      note: String(note || ''),
      actor: actor.name || 'System',
      timestamp: nowIso(),
      /* Item-level negotiated rates — keyed by line index, storing the
         per-unit negotiated price so the Final Negotiation page can
         restore them on re-open and downstream pages can derive
         line totals from the negotiated prices. */
      ...(itemRates && typeof itemRates === 'object' ? { itemRates } : {})
    });
    record.activity.push(
      entry('negotiation', `${rfq.rfqNo} negotiation with ${vendor} — ${stage}`, note || `Round ${priorRounds + 1}`)
    );
    /* A first round moves comparison → negotiation; closing a round as
       Agreed completes the negotiation. */
    advanceWorkflowStage(rfq, 'NEGOTIATION');
    return persistRecord(record);
  },

  /**
   * Explicitly selects a supplier for the RFQ. Never automatic — the
   * caller must name the vendor. The selection records the vendor, the
   * quotation and the final value (the agreed negotiated rate when the
   * negotiation closed as Agreed, otherwise the quoted total).
   */
  async completeSupplierSelection(rfqId, vendor, { rationale = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be awarded');
    }
    const record = ensureRecord(rfq);
    /* GATES — PCS supplier selection requires comparison + negotiation.
       Technical evaluation and approval are downstream steps. */
    if (!comparisonCompleted(rfq)) {
      throw new Error('Complete the quotation comparison before selecting a supplier');
    }
    if (!negotiationCompleted(record)) {
      throw new Error('Complete the negotiation before selecting a supplier');
    }
    const row = buildEvaluationRows().find(
      (entry) => entry.rfqNo === rfq.rfqNo && entry.vendor === vendor
    );
    if (!row) throw new Error(`No quotation from ${vendor} for this RFQ`);
    /* A pending or approved selection is one-way; a REJECTED selection
       is void, so the buyer may pick a different supplier instead. */
    if (record.selection && record.approval?.status !== APPROVAL_STATUS.REJECTED) {
      throw new Error(`A supplier has already been selected for ${rfq.rfqNo}`);
    }
    const actor = getCurrentActor();
    const agreed = agreedAmount(record, vendor);
    const finalizedTerms = record.paymentTerms || rfq.paymentTerms || null;
    record.selection = {
      selectedVendor: vendor,
      selectedQuoteId: row.quoteId,
      finalValue: agreed ?? row.total,
      rationale: String(rationale || ''),
      selectedAt: nowIso(),
      selectedBy: actor.name || 'System',
      /* Finalized payment terms ride the selection — visible before the
         final award and inherited by the raised PO. */
      ...(finalizedTerms ? { paymentTerms: clone(finalizedTerms) } : {})
    };
    /* A fresh selection always re-opens the approval step. */
    record.approval = null;
    record.activity.push(entry('selection', `${rfq.rfqNo} supplier selected — ${vendor}`, rationale));
    advanceWorkflowStage(rfq, 'SUPPLIER_SELECTION');
    return persistRecord(record);
  },

  /**
   * Records an ITEM-WISE supplier selection (split award support). The
   * buyer explicitly picks a vendor per RFQ line; every line must be
   * allocated exactly once, to a vendor that actually quoted it. When
   * every line lands on the same vendor the selection is stored as the
   * classic single-vendor selection (selectedVendor / selectedQuoteId
   * set), so downstream single-vendor consumers keep working; when
   * vendors differ it is a split award (mode 'split', selectedVendor
   * null) carrying the full `allocations` list. The selection stays
   * editable until it is approved — the buyer can change vendors before
   * the final award — and is final once approved. Requires technical +
   * commercial evaluation completed.
   */
  async completeItemWiseSelection(rfqId, { allocations = [], rationale = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be awarded');
    }
    const record = ensureRecord(rfq);
    /* GATES — PCS supplier selection requires comparison + negotiation.
       Technical evaluation and approval are downstream steps. */
    if (!comparisonCompleted(rfq)) {
      throw new Error('Complete the quotation comparison before selecting a supplier');
    }
    if (!negotiationCompleted(record)) {
      throw new Error('Complete the negotiation before selecting a supplier');
    }
    /* The allocation stays editable while the selection is pending or
       rejected — only an APPROVED selection is final, because changing
       it after approval would invalidate the awarded decision. */
    if (record.selection && record.approval?.status === APPROVAL_STATUS.APPROVED) {
      throw new Error(`The approved selection for ${rfq.rfqNo} cannot be changed`);
    }

    const items = Array.isArray(rfq.items) ? rfq.items : [];
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    const rfqQuotes = quotationsStore.all.filter((quote) => quote.rfqNo === rfq.rfqNo);
    const cleaned = (Array.isArray(allocations) ? allocations : []).filter(
      (allocation) => allocation && allocation.itemKey !== undefined && allocation.vendor
    );
    if (cleaned.length === 0) throw new Error('Select a vendor for at least one item');

    /* Every RFQ line must be allocated exactly once — the comparison UI
       enforces this, the service re-validates so partial payloads from
       any caller are refused. */
    const itemKeys = cleaned.map((allocation) => String(allocation.itemKey));
    if (new Set(itemKeys).size !== itemKeys.length) {
      throw new Error('Each item can be allocated to only one vendor');
    }
    const expectedKeys = items.map((item, index) => itemKeyOf(rfq.id, index));
    const missing = expectedKeys.filter((key) => !itemKeys.includes(key));
    if (missing.length > 0) {
      throw new Error('All items must be allocated before saving the selection');
    }

    /* Normalise against the stored quotations: quoteId + unit price +
       line total come from the vendor's quotation, overridden by the
       latest negotiation itemRates when available. */
    const normalized = expectedKeys.map((key) => {
      const allocation = cleaned.find((entry) => String(entry.itemKey) === key);
      const index = expectedKeys.indexOf(key);
      const item = items[index] || {};
      const row = rows.find((entry) => entry.vendor === allocation.vendor);
      if (!row) throw new Error(`No quotation from ${allocation.vendor} for this RFQ`);
      const quote = rfqQuotes.find((entry) => entry.id === row.quoteId);
      const line = quote?.items?.[index] || {};
      /* Use the negotiated rate from the latest round's itemRates when
         available; fall back to the quotation rate.
         Match by quotationId for multi-vendor safety. */
      const vendorRounds = roundsFor(record, allocation.vendor, row.quoteId);
      const latestItemRates = [...vendorRounds]
        .reverse()
        .find((r) => r.itemRates && typeof r.itemRates === 'object' && Object.keys(r.itemRates).length > 0)?.itemRates || null;
      const negotiatedPrice = latestItemRates?.[index] != null
        ? Number(latestItemRates[index])
        : null;
      const unitPrice = negotiatedPrice != null && Number.isFinite(negotiatedPrice) && negotiatedPrice > 0
        ? Math.round(negotiatedPrice * 100) / 100
        : Math.round((Number(line.rate) || 0) * 100) / 100;
      if (!(unitPrice > 0)) {
        throw new Error(`${allocation.vendor} did not quote "${item.product || 'item'}" — it cannot be allocated to them`);
      }
      const qty = Number(item.qty ?? line.qty) || 0;
      return {
        itemKey: key,
        product: item.product || line.product || '',
        uom: item.uom || line.uom || '',
        qty,
        vendor: allocation.vendor,
        quoteId: row.quoteId,
        unitPrice,
        lineTotal: Math.round(unitPrice * qty * 100) / 100
      };
    });

    const suppliers = [...new Set(normalized.map((allocation) => allocation.vendor))];
    const split = suppliers.length > 1;
    const finalValue = Math.round(
      normalized.reduce((sum, allocation) => sum + (allocation.lineTotal || 0), 0) * 100
    ) / 100;
    const actor = getCurrentActor();
    const first = normalized[0];
    const finalizedTerms = record.paymentTerms || rfq.paymentTerms || null;
    record.selection = {
      mode: split ? 'split' : 'single',
      allocations: normalized,
      selectedVendor: split ? null : first.vendor,
      selectedQuoteId: split ? null : first.quoteId,
      finalValue,
      rationale: String(rationale || ''),
      selectedAt: nowIso(),
      selectedBy: actor.name || 'System',
      /* Finalized payment terms ride the split selection too — every
         raised PO inherits them with its own computed amounts. */
      ...(finalizedTerms ? { paymentTerms: clone(finalizedTerms) } : {})
    };
    /* A fresh selection always re-opens the approval step. */
    record.approval = null;
    record.activity.push(
      entry(
        'selection',
        split
          ? `${rfq.rfqNo} item-wise selection — ${suppliers.length} suppliers (${suppliers.join(', ')})`
          : `${rfq.rfqNo} supplier selected — ${first.vendor}`,
        rationale
      )
    );
    advanceWorkflowStage(rfq, 'SUPPLIER_SELECTION');
    return persistRecord(record);
  },

  /**
   * Reviews the supplier selection — the only path to an approved
   * selection, which is the precondition for the RFQ award. Records the
   * approver, date, decision (Approved / Rejected) and remarks.
   */
  async approveSupplierSelection(rfqId, { decision, remarks = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    const record = ensureRecord(rfq);
    if (!record.selection) {
      throw new Error('Select a supplier before approving the selection');
    }
    if (![APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED].includes(decision)) {
      throw new Error('Invalid approval decision');
    }
    if (record.approval?.status === APPROVAL_STATUS.APPROVED) {
      throw new Error('Supplier selection already approved');
    }
    const actor = getCurrentActor();
    record.approval = {
      status: decision,
      decision,
      approver: actor.name || 'System',
      date: nowIso(),
      remarks: String(remarks || '')
    };
    record.activity.push(entry('approval', `${rfq.rfqNo} supplier selection ${decision.toLowerCase()}`, remarks));
    /* The finalized terms are formally approved together with the
       selection — audited so the terms approval is traceable. */
    if (record.selection?.paymentTerms) {
      record.activity.push(
        entry(
          'payment-terms',
          `Payment Terms Approved — ${paymentTermsLabel(record.selection.paymentTerms)}`,
          `Approved by ${actor.name || 'Admin'}`
        )
      );
    }
    return persistRecord(record);
  },

  async getEvaluationCriteria() {
    await delay();
    return clone({ technical: TECH_CRITERIA, commercial: COMMERCIAL_CRITERIA });
  },

  /* ================================================================
     PER-VENDOR TECHNICAL EVALUATION
     ================================================================ */

  /**
   * Saves technical evaluation scores for a single vendor within an RFQ.
   * Scores are keyed by criterion (compliance, quality, delivery, postPurchase).
   * The vendor evaluation status is derived from the stored scores.
   *
   * @param {string} rfqId - RFQ id or rfqNo
   * @param {string} vendorName - Vendor name (from the quotation)
   * @param {object} scores - { compliance: Number, quality: Number, delivery: Number, postPurchase: Number }
   * @param {string} remarks - Optional remarks for this evaluation
   */
  async saveVendorEvaluation(rfqId, vendorName, { scores = {}, remarks = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be evaluated');
    }
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    if (!rows.some((row) => row.vendor === vendorName)) {
      throw new Error(`No quotation from ${vendorName} for this RFQ`);
    }
    const record = ensureRecord(rfq);
    const evals = getVendorEvaluations(record);
    const existing = evals[vendorName] || {};
    const actor = getCurrentActor();
    const technicalTotal = computeTechnicalTotal(scores);
    evals[vendorName] = {
      scores,
      technicalTotal,
      remarks: String(remarks || existing.remarks || ''),
      decision: existing.decision || null,
      evaluatedBy: actor.name || 'System',
      evaluatedAt: nowIso()
    };
    record.activity.push(
      entry('vendor-evaluation', `${rfq.rfqNo} — ${vendorName} scores saved (${technicalTotal}/100)`, remarks)
    );
    return persistRecord(record);
  },

  /**
   * Records a technical decision for a single vendor within an RFQ.
   * Decision: 'Qualified' | 'Not Qualified' | 'Rejected'
   *
   * @param {string} rfqId - RFQ id or rfqNo
   * @param {string} vendorName - Vendor name
   * @param {string} decision - 'Qualified' | 'Not Qualified' | 'Rejected'
   * @param {string} remarks - Optional remarks
   */
  async setVendorDecision(rfqId, vendorName, decision, { remarks = '' } = {}) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    if (!isOpenForEvaluation(rfq)) {
      throw new Error('Only RFQs with received quotations can be evaluated');
    }
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    if (!rows.some((row) => row.vendor === vendorName)) {
      throw new Error(`No quotation from ${vendorName} for this RFQ`);
    }
    if (!['Qualified', 'Not Qualified', 'Rejected'].includes(decision)) {
      throw new Error('Invalid decision — must be Qualified, Not Qualified, or Rejected');
    }
    const record = ensureRecord(rfq);
    const evals = getVendorEvaluations(record);
    const existing = evals[vendorName] || {};
    const actor = getCurrentActor();
    evals[vendorName] = {
      ...existing,
      decision,
      decisionRemarks: String(remarks || ''),
      decidedBy: actor.name || 'System',
      decidedAt: nowIso()
    };
    record.activity.push(
      entry('vendor-decision', `${rfq.rfqNo} — ${vendorName} marked as ${decision}`, remarks)
    );
    /* The last decision may complete the evaluation — when at least one
       vendor is qualified, advance the shared RFQ status to Pending
       Approval so the list reflects the technical evaluation state. */
    syncRfqApprovalStatus(rfq, record);
    return persistRecord(record);
  },

  /**
   * Returns per-vendor evaluation details for an RFQ.
   * Used by the detail page to render individual vendor evaluation cards.
   */
  async getVendorEvaluations(rfqId) {
    await delay();
    const rfq = findRfq(rfqId);
    if (!rfq) throw new Error('RFQ not found');
    const record = findRecord(rfq.id, rfq.rfqNo);
    const rows = buildEvaluationRows().filter((row) => row.rfqNo === rfq.rfqNo);
    const evals = getVendorEvaluations(record);
    return rows.map((row) => {
      const vendorEval = evals[row.vendor] || {};
      const storedScores = vendorEval.scores || {};
      const technical = TECH_CRITERIA.map((criterion) => {
        const storedScore = Number(storedScores[criterion.key]);
        const derivedScore = row.technical?.find((c) => c.key === criterion.key)?.score ?? 0;
        return { ...criterion, score: Number.isFinite(storedScore) ? storedScore : derivedScore };
      });
      const technicalTotal = vendorEval.scores
        ? computeTechnicalTotal(vendorEval.scores)
        : (row.technicalTotal || 0);
      return {
        ...clone(row),
        technical,
        technicalTotal,
        evalStatus: deriveVendorEvalStatus(record, row.vendor),
        evalDecision: vendorEval.decision || null,
        evalRemarks: vendorEval.remarks || '',
        evaluatedBy: vendorEval.evaluatedBy || null,
        evaluatedAt: vendorEval.evaluatedAt || null
      };
    });
  }
};

/* ==================================================================
   API-mode hydration hook
   ------------------------------------------------------------------
   Every service call first makes sure the real RFQ, quotation and
   evaluation data has been loaded from the database, so the board,
   the scores and the award allocations are derived from actual
   records rather than browser storage. ensureApiData() memoises its
   work, so this adds nothing to the steady-state cost.
   ================================================================== */
if (isApiMode()) {
  Object.keys(evaluationService).forEach((key) => {
    const original = evaluationService[key];
    if (typeof original !== 'function') return;
    evaluationService[key] = async function withApiData(...args) {
      await ensureApiData();
      return original.apply(evaluationService, args);
    };
  });
}
