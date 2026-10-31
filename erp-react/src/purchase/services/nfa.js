/**
 * purchase/services/nfa.js
 * ------------------------------------------------------------------
 * NFA – Note for Approval mock service.
 *
 * The formal note raised AFTER Supplier Selection that documents the
 * proposed procurement — the selected supplier(s), the final value
 * from the selection and the justification — and carries it through
 * its own approval lifecycle before the Purchase Order stage:
 *
 *   Draft → Submitted (Pending Approval) → Approved / Rejected
 *
 * Each NFA is a self-contained document referencing an RFQ whose
 * supplier selection has been completed (the source of the supplier
 * and final value). Raising a note requires that selection; the note
 * never fabricates its own numbers. The lifecycle, approval decision,
 * record state (active / archived / deleted) and full activity trail
 * persist to localStorage via a lazy collection — the same pattern as
 * every other Purchase module service.
 *
 * The NFA approval is a document-level gate that records WHO approved
 * the proposed procurement and when; the RFQ award / PO-raise flow
 * keeps its existing gates (approved supplier selection) unchanged.
 * ------------------------------------------------------------------
 */
import { NFA_RECORD_STATE, NFA_STATUS, NFA_APPROVAL_STAGE, NFA_APPROVAL_STAGES, NFA_STAGE_STATUS, NFA_STAGE_TO_STATUS, PO_STATUS, QUOTATION_STATUS, RFQ_STATUS } from '../constants';
import { safeGetTime } from '../utils/helpers';
import { clone, createCollection, delay, paginate, storageKeys } from './base';
import { getCurrentActor } from './api-client';
import { rfqApi } from './api/rfqApi';
import { approvalCreateRoute } from '../utils/approvalCreateFlow';
import { rfqsStore, quotationsStore } from './rfq';
import { buildAwardAllocations, evaluationsStore } from './evaluation';
/* Circular with ./requisition is safe the same way as rfq.js: the store
   is only touched at call time inside buildPoPrefill, never during
   module evaluation. */
import { requisitionsStore } from './requisition';
/* Read-only link to the PO store for the duplicate-conversion guard:
   purchaseOrder.js never imports this module, so the edge is
   one-directional (same pattern as rfq.js → purchaseOrder.js). */
import { ordersStore } from './purchaseOrder';

function nowIso() {
  return new Date().toISOString();
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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


/** Trailing numeric sequence of a current-year NFA number (0 for legacy ids). */
function nfaSeq(record) {
  const value = String(record?.nfaNo || record?.id || '');
  const year = new Date().getFullYear();
  const match = new RegExp(`^NFA-${year}-(\\d+)$`).exec(value);
  return match ? Number(match[1]) : 0;
}

/** Next NFA number (NFA-YYYY-NNNN) — one above the highest existing
 *  current-year sequence, so it can never collide with a stored note. */
function nextNfaNo(records = []) {
  const year = new Date().getFullYear();
  const highest = records.reduce((max, record) => Math.max(max, nfaSeq(record)), 0);
  return `NFA-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/**
 * Seed notes — coherent with the RFQ seed's workflow positions:
 *   · NFA-2026-0002 (Approved)  → RFQ-2026-0005, awarded to Tata Steel
 *     at ₹1,28,938.60 — the approved note that preceded the award.
 *   · NFA-2026-0001 (Pending)   → RFQ-2026-0003 (SS pipes, under
 *     evaluation) — the note awaiting the buyer's approval decision.
 */
/** Seed NFAs — returns empty. */
function nfaSeed() {
  return [];
}
export const nfasStore = createCollection(storageKeys.nfas, nfaSeed);

/* ------------------------------------------------------------------ */
/*  RFQ STATUS SYNCHRONISATION                                         */
/*                                                                     */
/*  The Approval Flow (NFA) is the DRIVER of the shared RFQ lifecycle  */
/*  status once the technical evaluation is complete. Every NFA        */
/*  transition below mirrors the note's approval stage onto the RFQ    */
/*  record (rfqsStore), so the RFQ list, RFQ detail, Technical         */
/*  Evaluation board, Approval Flow and PO pages all read the SAME     */
/*  persisted status — no page keeps its own copy.                    */
/*                                                                     */
/*    Technical Evaluation done  → RFQ  Pending Approval               */
/*    note submitted             → RFQ  1st Approval                  */
/*    1st stage approved         → RFQ  2nd Approval                  */
/*    2nd stage approved         → RFQ  Final Approval                */
/*    Final stage approved       → RFQ  Approved                      */
/*                                                                     */
/*  repairRfqApprovalStatuses() re-applies the same derivation to      */
/*  EVERY note on read, so records whose RFQ status was left stale     */
/*  (e.g. an NFA advanced before the sync existed, or data seeded      */
/*  with a mismatched RFQ status) are healed the moment the RFQ list,  */
/*  RFQ detail, sidebar or Approval Flow page loads.                   */
/* ------------------------------------------------------------------ */

/** NFA lifecycle status → shared RFQ lifecycle status while the
 *  Approval Flow runs. DRAFT is a raised-but-unsubmitted note (the
 *  RFQ still sits in Pending Approval); PENDING_APPROVAL / FIRST_-
 *  APPROVAL both mean the First stage is active (1st Approval); the
 *  later stages map to their exact RFQ statuses. REJECTED is
 *  intentionally absent — a rejected note never regresses the RFQ. */
const NFA_TO_RFQ_STATUS = {
  [NFA_STATUS.DRAFT]: RFQ_STATUS.PENDING_APPROVAL,
  [NFA_STATUS.PENDING_APPROVAL]: RFQ_STATUS.FIRST_APPROVAL,
  [NFA_STATUS.FIRST_APPROVAL]: RFQ_STATUS.FIRST_APPROVAL,
  [NFA_STATUS.SECOND_APPROVAL]: RFQ_STATUS.SECOND_APPROVAL,
  [NFA_STATUS.FINAL_APPROVAL]: RFQ_STATUS.FINAL_APPROVAL,
  [NFA_STATUS.APPROVED]: RFQ_STATUS.APPROVED
};

/** Forward order of the RFQ approval-flow statuses — used to keep the
 *  sync forward-only and idempotent. Statuses outside this map (Draft,
 *  Sent, Awarded, Closed, Cancelled, …) are never regressed. */
const RFQ_APPROVAL_RANK = {
  [RFQ_STATUS.PENDING_APPROVAL]: 1,
  [RFQ_STATUS.FIRST_APPROVAL]: 2,
  [RFQ_STATUS.SECOND_APPROVAL]: 3,
  [RFQ_STATUS.FINAL_APPROVAL]: 4,
  [RFQ_STATUS.APPROVED]: 5
};

/** RFQ statuses still inside the sourcing / approval flow — the only
 *  states the NFA may advance. Terminal RFQs (Awarded / Closed /
 *  Cancelled) are never touched. */
const RFQ_APPROVAL_ELIGIBLE = [
  RFQ_STATUS.SENT,
  RFQ_STATUS.QUOTATION_RECEIVED,
  RFQ_STATUS.EVALUATION,
  RFQ_STATUS.PENDING_APPROVAL,
  RFQ_STATUS.FIRST_APPROVAL,
  RFQ_STATUS.SECOND_APPROVAL,
  RFQ_STATUS.FINAL_APPROVAL
];

/**
 * Mirrors an NFA approval stage onto the shared RFQ lifecycle status.
 * Forward-only and idempotent: an RFQ that already sits at a later
 * stage (or a terminal state) is never regressed, and every change is
 * written to the RFQ record so the activity trail reflects it. A
 * rejected note leaves the RFQ where it is (it keeps its current
 * approval position).
 */
function syncRfqStatus(rfq, rfqStatus) {
  if (!rfq || !rfqStatus) return;
  const index = rfqsStore.all.findIndex(
    (entry) => entry.id === rfq.id || entry.rfqNo === rfq.rfqNo
  );
  if (index === -1) return;
  const current = rfqsStore.all[index];
  const nextRank = RFQ_APPROVAL_RANK[rfqStatus];
  if (!nextRank) return;
  if (!RFQ_APPROVAL_ELIGIBLE.includes(current.status)) return;
  const currentRank = RFQ_APPROVAL_RANK[current.status];
  if (currentRank && currentRank >= nextRank) return;
  rfqsStore.all[index] = {
    ...current,
    status: rfqStatus,
    activity: [
      ...(Array.isArray(current.activity) ? current.activity : []),
      entry(
        'status',
        `${rfq.rfqNo} moved to ${rfqStatus} — Approval Flow progressed`,
        `NFA ${rfq.rfqNo} reached ${rfqStatus}`
      )
    ]
  };
  rfqsStore.persist(rfqsStore.all);
}

/**
 * Re-derives every note's linked RFQ status from the note's persisted
 * approval stage and persists any change. Idempotent and forward-only —
 * the same derivation the transitions apply, run over ALL notes so
 * stale RFQ statuses are healed on read. Called by the RFQ service on
 * every RFQ read and by the NFA service on every note read.
 */
export function repairRfqApprovalStatuses() {
  nfasStore.all.forEach((note) => {
    const rfq = rfqsStore.all.find(
      (entry) => entry.id === note.rfqId || entry.rfqNo === note.rfqNo
    );
    syncRfqStatus(rfq, NFA_TO_RFQ_STATUS[note.status]);
  });
}

/** Finds a note by internal id or human-facing number. */
function findNfa(id) {
  return nfasStore.all.find((entry) => entry.id === id || entry.nfaNo === id) || null;
}

function persist() {
  nfasStore.persist(nfasStore.all);
}

function saveRecord(record) {
  persist();
  return clone(record);
}

/** The supplier selection for an RFQ (id or rfqNo) from the evaluation store.
 *  When no explicit selection exists (user went straight from Technical
 *  Evaluation to Approval), derives the selection from the qualified
 *  vendor's quotation — the highest-scoring qualified vendor wins. */
function selectionFor(rfq) {
  if (!rfq) return null;
  const record = evaluationsStore.all.find(
    (entry) => entry.id === rfq?.id || entry.rfqNo === rfq?.rfqNo
  );
  if (record?.selection) return record.selection;
  /* No explicit selection — derive from qualified vendor evaluations.
     Find the highest-scoring qualified vendor and use their quotation
     as the selection. */
  const vendorEvals = record?.vendorEvaluations || {};
  const qualifiedVendors = Object.entries(vendorEvals)
    .filter(([, v]) => v.decision === 'Qualified')
    .sort((a, b) => (b[1].technicalTotal || 0) - (a[1].technicalTotal || 0));
  if (qualifiedVendors.length === 0) return null;
  const [bestVendor] = qualifiedVendors[0];
  const quote = quotationsStore.all.find(
    (q) => q.rfqNo === rfq.rfqNo && q.vendor === bestVendor && q.status !== 'Rejected'
  );
  if (!quote) return null;
  return {
    selectedVendor: bestVendor,
    selectedQuoteId: quote.id,
    finalValue: quote.total ?? 0,
    rationale: 'Selected via technical evaluation — qualified vendor with highest score',
    selectedAt: record?.vendorEvaluations?.[bestVendor]?.decidedAt || new Date().toISOString(),
    selectedBy: record?.vendorEvaluations?.[bestVendor]?.decidedBy || 'System'
  };
}

/** Supplier names of a selection (single or split award). */
function selectionSuppliers(selection) {
  if (!selection) return [];
  if (selection.selectedVendor) return [selection.selectedVendor];
  return [...new Set((selection.allocations || []).map((allocation) => allocation.vendor))].filter(Boolean);
}

/**
 * Derives whether technical evaluation is effectively complete from
 * per-vendor evaluation data.  Returns true when the RFQ-level
 * `record.technical` flag is set OR when every vendor quotation has
 * received a decision (Qualified / Not Qualified / Rejected).
 */
function isTechnicalEvaluationComplete(evalRecord) {
  if (evalRecord?.technical) return true;
  /* Check per-vendor evaluations — if ALL vendor quotations for this
     RFQ have a decision, the technical evaluation is effectively done
     even if the RFQ-level completion flag was never explicitly set. */
  const vendorEvals = evalRecord?.vendorEvaluations || {};
  const vendorNames = Object.keys(vendorEvals);
  if (vendorNames.length === 0) return false;
  return vendorNames.every(
    (name) => vendorEvals[name]?.decision === 'Qualified'
      || vendorEvals[name]?.decision === 'Not Qualified'
      || vendorEvals[name]?.decision === 'Rejected'
  );
}

/** RFQs whose supplier selection is completed AND technical evaluation
 *  is completed with at least one qualified vendor — the "New NFA"
 *  candidates. The note is raised from the selection, so every field
 *  is derived, never hand-typed. */
function buildCandidates() {
  const nfaRfqNos = new Set(
    nfasStore.all
      .filter((note) => (note.recordState || NFA_RECORD_STATE.ACTIVE) !== NFA_RECORD_STATE.DELETED)
      .map((note) => note.rfqNo)
  );
  const candidates = [];
  rfqsStore.all.forEach((rfq) => {
    if (nfaRfqNos.has(rfq.rfqNo)) return;
    const selection = selectionFor(rfq);
    if (!selection) return;
    const suppliers = selectionSuppliers(selection);
    if (suppliers.length === 0) return;
    /* Require technical evaluation to be completed before approval.
       Accept either the RFQ-level completion flag OR per-vendor
       evaluations where every vendor has received a decision. */
    const evalRecord = evaluationsStore.all.find(
      (entry) => entry.id === rfq.id || entry.rfqNo === rfq.rfqNo
    );
    if (!isTechnicalEvaluationComplete(evalRecord)) return;
    /* Require at least one vendor to be technically qualified. */
    const vendorEvals = evalRecord.vendorEvaluations || {};
    const hasQualifiedVendor = Object.values(vendorEvals).some(
      (v) => v.decision === 'Qualified'
    );
    if (!hasQualifiedVendor) return;
    candidates.push({
      rfqId: rfq.id,
      rfqNo: rfq.rfqNo,
      title: rfq.title || '',
      suppliers,
      supplier: suppliers.length > 1 ? `Split award (${suppliers.length} suppliers)` : suppliers[0],
      split: suppliers.length > 1,
      amount: selection.finalValue ?? 0,
      currency: rfq.currency || 'INR',
      selectedAt: selection.selectedAt || '',
      paymentTerms: selection.paymentTerms || null
    });
  });
  return candidates.sort((a, b) => a.rfqNo.localeCompare(b.rfqNo));
}

/* ------------------------------------------------------------------ */
/*  NFA → PURCHASE ORDER CONVERSION                                    */
/*                                                                     */
/*  A fully approved note converts to a Purchase Order through the     */
/*  shared PO-create form. buildPoPrefill() derives the form's         */
/*  initial values from the SAME stores the note was raised from —     */
/*  the linked RFQ's line items and the approved supplier's quotation  */
/*  (using per-line negotiated rates when the selection recorded       */
/*  them) — so the generated PO is never blank and matches the         */
/*  approved items and values shown in the note.                       */
/* ------------------------------------------------------------------ */

/** Local-date (YYYY-MM-DD) `days` from today — quotation lead time →
 *  expected delivery derivation, matching the award-raised PO rule. */
function localDatePlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + (Number(days) || 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The quotation whose prices are the approved source for `supplier`
 *  on an RFQ — the ACCEPTED one wins, otherwise the supplier's
 *  received quotation (never a rejected one). */
function supplierQuotationFor(rfq, supplier) {
  const rfqQuotes = quotationsStore.all.filter((q) => q.rfqNo === rfq.rfqNo && q.vendor === supplier);
  return (
    rfqQuotes.find((q) => q.status === QUOTATION_STATUS.ACCEPTED) ||
    rfqQuotes.find((q) => q.status !== QUOTATION_STATUS.REJECTED) ||
    null
  );
}

/** Linked PR of an RFQ (matched by prNo / reference) — the upstream
 *  source for the logistics / commercial headers the RFQ never
 *  re-captures (GST type, transport mode, warehouse, cost center,
 *  location, …). Null when the RFQ has no PR reference or it is not
 *  in the store. */
function linkedPrOf(rfq) {
  const prNo = String(rfq?.prNo || rfq?.reference || '').trim();
  if (!prNo) return null;
  return requisitionsStore.all.find((entry) => entry.prNo === prNo) || null;
}

/** The live Purchase Order already raised for an award/selection — the
 *  PO record carries the RFQ number and the awarded supplier (both the
 *  RFQ award-raise flow and the NFA conversion write them), so a
 *  non-cancelled PO with the same RFQ + supplier is the ONE source of
 *  truth that a conversion already happened. Used to refuse duplicate
 *  conversions: an award/selection is converted exactly once. */
function existingPoForAward(rfqNo, vendor) {
  if (!rfqNo || !vendor) return null;
  return (
    ordersStore.all.find(
      (po) =>
        po.rfqNo === rfqNo &&
        po.vendor === vendor &&
        po.status !== PO_STATUS.CANCELLED
    ) || null
  );
}

/** Per-line award allocations (final negotiated / quoted unit prices)
 *  for the note's supplier, when the evaluation record carries an
 *  explicit selection — the same derivation award-raised POs use.
 *  Null when there is no selection or it does not match the supplier. */
function allocationPricesFor(rfq, supplier) {
  const record = evaluationsStore.all.find(
    (entry) => entry.id === rfq.id || entry.rfqNo === rfq.rfqNo
  );
  if (!record?.selection) return null;
  const allocations = buildAwardAllocations(rfq, record.selection, quotationsStore.all);
  const itemCount = Array.isArray(rfq.items) ? rfq.items.length : 0;
  if (
    itemCount > 0 &&
    allocations.length === itemCount &&
    allocations.every((allocation) => allocation.vendor === supplier)
  ) {
    return allocations;
  }
  return null;
}

export const nfaService = {
  /** Returns the next auto-generated NFA number for display. */
  getNextNfaNo() {
    return nextNfaNo(nfasStore.all);
  },

  /** List with search + status filter, scoped to a record state (the
   *  Active / Archived / Deleted tab), sortable, paginated. */
  async getNfas({
    search = '',
    status = 'All',
    recordState = NFA_RECORD_STATE.ACTIVE,
    page = 1,
    pageSize = 10,
    sortKey = 'raisedAt',
    sortDirection = 'desc'
  } = {}) {
    await delay();
    /* Reading the notes is a read of the shared workflow state — heal
       any RFQ whose status was left behind by an earlier stage. */
    repairRfqApprovalStatuses();
    const query = String(search || '').toLowerCase().trim();
    let records = nfasStore.all.filter(
      (note) => (note.recordState || NFA_RECORD_STATE.ACTIVE) === recordState
    );
    if (status && status !== 'All') {
      records = records.filter((note) => note.status === status);
    }
    if (query) {
      records = records.filter((note) =>
        [note.nfaNo, note.rfqNo, note.rfqTitle, note.supplier].some((value) =>
          String(value || '').toLowerCase().includes(query)
        )
      );
    }
    /* Column sorting — the list's column keys map onto the stored
       fields (raisedDate is the raisedAt timestamp). Same convention
       as the RFQ / quotation services; newest-first is the default. */
    const STRING_SORT_KEYS = ['nfaNo', 'rfqNo', 'rfqTitle', 'supplier', 'status'];
    const NUMERIC_SORT_KEYS = ['amount'];
    const DATE_SORT_KEYS = ['raisedAt', 'raisedDate'];
    const safeKey = [...STRING_SORT_KEYS, ...NUMERIC_SORT_KEYS, ...DATE_SORT_KEYS].includes(sortKey)
      ? sortKey
      : 'raisedAt';
    const dir = sortDirection === 'asc' ? 1 : -1;
    records = [...records].sort((a, b) => {
      let aValue;
      let bValue;
      if (NUMERIC_SORT_KEYS.includes(safeKey)) {
        aValue = Number(a.amount) || 0;
        bValue = Number(b.amount) || 0;
      } else if (DATE_SORT_KEYS.includes(safeKey)) {
        aValue = safeGetTime(a.raisedAt);
        bValue = safeGetTime(b.raisedAt);
      } else {
        aValue = String(a[safeKey] || '');
        bValue = String(b[safeKey] || '');
      }
      if (aValue === bValue) return 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') return dir * (aValue - bValue);
      return dir * String(aValue).localeCompare(String(bValue));
    });
    return paginate(records, { page, pageSize });
  },

  /** KPI + tab counts (status counts over ACTIVE notes only). */
  async getNfaStats() {
    await delay();
    repairRfqApprovalStatuses();
    const active = nfasStore.all.filter(
      (note) => (note.recordState || NFA_RECORD_STATE.ACTIVE) === NFA_RECORD_STATE.ACTIVE
    );
    const byStatus = (status) => active.filter((note) => note.status === status).length;
    const firstPending = active.filter(
      (note) => note.currentStage === NFA_APPROVAL_STAGE.FIRST
    ).length;
    const secondPending = active.filter(
      (note) => note.currentStage === NFA_APPROVAL_STAGE.SECOND
    ).length;
    const finalPending = active.filter(
      (note) => note.currentStage === NFA_APPROVAL_STAGE.FINAL
    ).length;
    return {
      total: active.length,
      draft: byStatus(NFA_STATUS.DRAFT),
      pendingApproval: byStatus(NFA_STATUS.PENDING_APPROVAL),
      firstApproval: byStatus(NFA_STATUS.FIRST_APPROVAL),
      secondApproval: byStatus(NFA_STATUS.SECOND_APPROVAL),
      finalApproval: byStatus(NFA_STATUS.FINAL_APPROVAL),
      approved: byStatus(NFA_STATUS.APPROVED),
      rejected: byStatus(NFA_STATUS.REJECTED),
      firstPending,
      secondPending,
      finalPending,
      totalValue: round2(active.reduce((sum, note) => sum + (Number(note.amount) || 0), 0)),
      active: active.length,
      archived: nfasStore.all.filter((note) => note.recordState === NFA_RECORD_STATE.ARCHIVED).length,
      deleted: nfasStore.all.filter((note) => note.recordState === NFA_RECORD_STATE.DELETED).length
    };
  },

  /** Single note by internal id or human-facing number (null when absent). */
  async getNfa(id) {
    await delay();
    repairRfqApprovalStatuses();
    const note = findNfa(id);
    return note ? clone(note) : null;
  },

  /** RFQs ready for a new note (completed selection, no NFA yet). */
  async getNfaCandidates() {
    await delay();
    return clone(buildCandidates());
  },

  /**
   * Where an RFQ's "Proceed to Approval" step must land.
   *
   * The Approval Flow raises ONE note per RFQ, so buildCandidates()
   * deliberately refuses an RFQ that already has one — NfaCreate renders
   * a validation state instead of silently switching RFQs. For an RFQ
   * whose Technical Evaluation has just been completed that refusal is a
   * dead end, because the workflow's next step for that SAME RFQ is the
   * note it already raised.
   *
   *   note can still be raised → the create page pre-selected with
   *                              ?rfqId= (approvalCreateRoute)
   *   note already exists      → that note inside the Approval Flow
   *   anything indeterminate   → the create page, so the user sees the
   *                              real reason instead of a silent switch
   *
   * Resolved from the same stores the Approval Flow list and the create
   * page read, so it never routes to something the workflow would refuse.
   */
  async approvalFlowRouteFor(rfqId, rfqNo = '') {
    if (rfqId == null || rfqId === '') return '/purchase/rfq/approval';
    const id = String(rfqId);
    try {
      const candidates = await this.getNfaCandidates();
      if ((candidates || []).some((candidate) => String(candidate.rfqId) === id)) {
        return approvalCreateRoute(id);
      }
      const notes = await this.getNfas({ search: rfqNo || '', pageSize: 200 });
      const rows = Array.isArray(notes) ? notes : (notes?.data || []);
      const existing = rows.find((note) => String(note.rfqNo) === String(rfqNo)) || null;
      if (existing?.id) return `/purchase/rfq/approval/${existing.id}`;
    } catch {
      /* Fall through to the documented create-page handoff. */
    }
    return approvalCreateRoute(id);
  },

  /**
   * NFA → Purchase Order conversion router — the ONE entry point every
   * UI action must use. Returns:
   *
   *   { existing: { id, poNo } } — the award/selection was already
   *     converted (a live PO exists for the note's RFQ + supplier).
   *     The caller must open that PO — never raise another one.
   *   { prefill }                — a fresh PO may be raised from the
   *     fully approved note; `prefill` is the create-form payload
   *     from buildPoPrefill().
   *
   * Guarding here (instead of only in buildPoPrefill) lets the UI
   * redirect to the existing PO instead of showing a dead-end error.
   */
  async preparePoConversion(id) {
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    if (note.status !== NFA_STATUS.APPROVED) {
      throw new Error('Only fully approved notes can be converted to a purchase order');
    }
    const rfq = rfqsStore.all.find((entry) => entry.id === note.rfqId || entry.rfqNo === note.rfqNo);
    if (!rfq) throw new Error(`Linked RFQ ${note.rfqNo || note.rfqId || ''} not found`);
    const suppliers = Array.isArray(note.suppliers) && note.suppliers.length > 0
      ? note.suppliers
      : [note.supplier].filter(Boolean);
    if (suppliers.length !== 1) {
      throw new Error(`Split award (${suppliers.length} suppliers) — raise each purchase order from the award instead`);
    }
    /* The note itself may already record the raised PO (set by
       recordPoRaised once the PO create form submits) — the fastest
       signal that this award was converted. A live (non-cancelled)
       stored PO is required: a cancelled PO frees the chain. */
    if (note.poNo) {
      const linked = ordersStore.all.find(
        (po) =>
          (po.id === note.poNo || po.poNo === note.poNo) &&
          po.status !== PO_STATUS.CANCELLED
      );
      if (linked) {
        return { existing: { id: linked.id || linked.poNo, poNo: linked.poNo } };
      }
    }
    const existing = existingPoForAward(rfq.rfqNo, suppliers[0]);
    if (existing) {
      return { existing: { id: existing.id || existing.poNo, poNo: existing.poNo } };
    }
    const prefill = await this.buildPoPrefill(id);
    return { prefill };
  },

  /**
   * Records that a Purchase Order was raised from an approved note — the
   * counterpart of preparePoConversion, called by the PO create form
   * after a successful createOrder. Persists the PO number on the note
   * (poNo / poNos / poRaisedAt + an audit entry) so the NFA detail and
   * list can show the raised PO, and future conversions short-circuit
   * to it. Idempotent per PO number; no-ops for unknown / unapproved
   * notes so the PO save flow never fails because of bookkeeping.
   */
  async recordPoRaised({ nfaId, poNo } = {}) {
    if (!nfaId || !poNo) return null;
    const index = nfasStore.all.findIndex((entry) => entry.id === nfaId || entry.nfaNo === nfaId);
    if (index === -1) return null;
    const note = nfasStore.all[index];
    if (note.status !== NFA_STATUS.APPROVED) return null;
    if ((note.poNos || []).includes(poNo)) return clone(note);
    nfasStore.all[index] = {
      ...note,
      poNo,
      poNos: [...new Set([...(note.poNos || []), poNo])],
      poRaisedAt: note.poRaisedAt || nowIso(),
      activity: [
        ...(note.activity || []),
        entry('po', `Purchase Order ${poNo} raised against ${note.nfaNo}`)
      ]
    };
    nfasStore.persist(nfasStore.all);
    return clone(nfasStore.all[index]);
  },

  /**
   * Builds the Purchase Order create-form pre-fill for a FULLY APPROVED
   * note — the shared-service side of the NFA → PO conversion. The
   * payload is a complete continuation of the approved procurement
   * record: every value that exists upstream in the PR → RFQ →
   * Quotation → comparison/negotiation → Technical Evaluation →
   * Supplier Selection → NFA chain is carried forward (an upstream
   * value is never replaced by a blank default), so the submitted PO
   * inherits the approved items, prices, vendor, document references,
   * commercial / logistics terms, notes and attachments.
   *
   * Throws when the award/selection already has a live PO (duplicate
   * conversion) — the message carries the existing PO number.
   */
  async buildPoPrefill(id) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    if (note.status !== NFA_STATUS.APPROVED) {
      throw new Error('Only fully approved notes can be converted to a purchase order');
    }
    const rfq = rfqsStore.all.find((entry) => entry.id === note.rfqId || entry.rfqNo === note.rfqNo);
    if (!rfq) throw new Error(`Linked RFQ ${note.rfqNo || note.rfqId || ''} not found`);
    const suppliers = Array.isArray(note.suppliers) && note.suppliers.length > 0
      ? note.suppliers
      : [note.supplier].filter(Boolean);
    if (suppliers.length !== 1) {
      throw new Error(`Split award (${suppliers.length} suppliers) — raise each purchase order from the award instead`);
    }
    const vendor = suppliers[0];
    /* Duplicate-conversion guard — this award/selection has already
       produced a PO (raised via the RFQ award flow or a previous
       conversion). A second PO for the same award is a duplicate, so
       the conversion is refused and the existing PO is returned in the
       error so the caller can open it. */
    const alreadyConverted = existingPoForAward(rfq.rfqNo, vendor);
    if (alreadyConverted) {
      throw new Error(
        `Purchase order ${alreadyConverted.poNo} already exists for ${rfq.rfqNo} (${vendor}) — open the existing PO instead of creating a duplicate`
      );
    }
    const quote = supplierQuotationFor(rfq, vendor);
    if (!quote) {
      throw new Error(`No quotation found from ${vendor} for ${rfq.rfqNo} — cannot derive PO line items`);
    }
    const rfqItems = Array.isArray(rfq.items) ? rfq.items : [];
    if (rfqItems.length === 0) {
      throw new Error(`RFQ ${rfq.rfqNo} has no line items to convert`);
    }

    /* The complete upstream chain: the originating PR (logistics /
       commercial headers the sourcing flow never re-copies), the
       evaluation record (selection rationale, finalized terms) and the
       commercial terms block on the RFQ. */
    const pr = linkedPrOf(rfq);
    const evaluation = evaluationsStore.all.find(
      (entry) => entry.id === rfq.id || entry.rfqNo === rfq.rfqNo
    ) || null;
    const selection = evaluation?.selection || null;
    const commercialTerms = rfq.commercialTerms || {};
    const defaultTaxRate = Number(commercialTerms.taxRate) || 18;

    /* Line items — the RFQ line is authoritative for item code /
       description / specification / category / HSN / UOM / qty; the
       unit price is the approved supplier's per-line NEGOTIATED rate
       when the selection recorded one, otherwise the quotation rate.
       Tax comes from the quotation line, then the RFQ commercial
       terms. */
    const allocations = allocationPricesFor(rfq, vendor);
    const quoteItems = Array.isArray(quote.items) ? quote.items : [];
    const items = rfqItems.map((item, index) => {
      const line = quoteItems[index] || {};
      const allocation = allocations?.[index] || null;
      const rateValue = Number(allocation?.unitPrice ?? line.rate ?? item.rate ?? item.expectedRate);
      const gstValue = Number(line.gstRate ?? defaultTaxRate);
      return {
        itemCode: item.itemCode || line.itemCode || '',
        product: item.product || line.product || '',
        specification: item.specification || line.specification || '',
        category: item.category || line.category || '',
        hsn: item.hsn || line.hsn || '',
        uom: item.uom || line.uom || 'Nos',
        qty: Number(item.qty ?? line.qty) || 0,
        rate: round2(Number.isFinite(rateValue) ? rateValue : 0),
        gstRate: Number.isFinite(gstValue) ? gstValue : 18
      };
    });

    /* Commercial figures — quotation first, PR fills only what the
       sourcing flow does not capture. */
    const leadDays = Number(quote.leadTime) || 0;
    const freight = Number(quote.freight) || 0;
    const insurance = Number(quote.insurance) || 0;
    const charges = round2((Number(quote.charges) || 0) + freight + insurance);
    const today = new Date().toISOString().slice(0, 10);

    /* Relevant attachments — PR requirement docs, RFQ spec docs and the
       quotation are carried (deduplicated); the PO stays a complete
       continuation of the approved record. */
    const seenAttachmentKeys = new Set();
    const attachments = [
      ...(Array.isArray(pr?.attachments) ? pr.attachments : []),
      ...(Array.isArray(rfq.attachments) ? rfq.attachments : []),
      ...(Array.isArray(quote.attachments) ? quote.attachments : [])
    ].filter((attachment) => {
      if (!attachment || typeof attachment !== 'object') return false;
      const key = `${attachment.name || ''}|${attachment.id || ''}`;
      if (seenAttachmentKeys.has(key)) return false;
      seenAttachmentKeys.add(key);
      return Boolean(attachment.name || attachment.id);
    });

    /* NFA purpose / justification + supplier-selection rationale +
       requisition notes flow into the PO's notes so the approved
       decision context is never lost. */
    const approvalContext = [
      `${note.nfaNo} — approved procurement (${vendor})`,      note.purpose ? `Purpose: ${note.purpose}` : '',
      note.justification ? `Justification: ${note.justification}` : '',
      selection?.rationale ? `Supplier selection: ${selection.rationale}` : ''
    ].filter(Boolean).join('\n\n');
    const internalNotes = [
      approvalContext,
      [pr?.internalNotes, pr?.remarks].filter(Boolean).join('\n\n')
    ].filter(Boolean).join('\n\n');

    return {
      title: rfq.title || `Purchase order against ${rfq.rfqNo}`,
      vendor,
      /* Document chain — originating PR, RFQ, the approved quotation and
         the NFA note itself. Carried onto the PO record so the raised
         order can be linked back to the note after creation. */
      reference: rfq.reference || rfq.prNo || pr?.prNo || '',
      prNo: rfq.prNo || rfq.reference || pr?.prNo || '',
      rfqNo: rfq.rfqNo,
      nfaId: note.id,
      nfaNo: note.nfaNo,
      quotationNo: quote.quotationNo || quote.id || '',
      orderDate: today,
      expectedDate: leadDays > 0 ? localDatePlusDays(leadDays) : (pr?.expectedDate || rfq.deliveryDate || ''),
      deliveryDate: rfq.deliveryDate || pr?.deliveryDate || '',
      currency: rfq.currency || pr?.currency || 'INR',
      gstType: rfq.gstType || pr?.gstType || '',
      /* Payment terms — finalized structured terms win (mirrored onto
         the RFQ by the evaluation), else the quotation / RFQ terms /
         PR label. */
      terms: quote.paymentTerms || commercialTerms.paymentTerms || pr?.terms || '30 Days',
      paymentTerms: rfq.paymentTerms || pr?.paymentTerms || null,
      deliveryTerms: quote.deliveryTerms || commercialTerms.deliveryTerms || pr?.deliveryTerms || '',
      deliveryInstructions: rfq.deliveryInstructions || pr?.deliveryInstructions || '',
      warranty: quote.warranty || commercialTerms.warranty || pr?.warranty || '',
      incoterm: rfq.incoterm || pr?.incoterm || '',
      transportMode: pr?.transportMode || rfq.transportMode || '',
      warehouse: pr?.warehouse || rfq.warehouse || '',
      costCenter: pr?.costCenter || rfq.costCenter || '',
      location: pr?.location || rfq.location || '',
      deliveryAddress: rfq.deliveryAddress || pr?.deliveryAddress || pr?.branch || '',
      discount: Number(quote.discount) || Number(pr?.discount) || 0,
      charges,
      freight,
      insurance,
      items,
      notes: rfq.notes || pr?.notes || '',
      internalNotes,
      vendorNotes: quote.notes || '',
      termsAndConditions: rfq.termsAndConditions || quote.termsAndConditions || pr?.termsAndConditions || '',
      attachments,
      awardedValue: note.amount ?? 0,
      sourceLabel: `approved NFA ${note.nfaNo}`
    };
  },

  /**
   * Raises a DRAFT note for an RFQ whose supplier selection has been
   * completed. The supplier, final value and currency are derived from
   * the stored selection — never hand-typed — so the note always
   * documents the actual award decision. A second note for the same
   * RFQ is refused.
   */
  async createNfa({ rfqId, nfaNo: nfaNoOverride, purpose = '', justification = '', remarks = '' } = {}) {
    await delay();
    const rfq = rfqsStore.all.find((entry) => entry.id === rfqId || entry.rfqNo === rfqId);
    if (!rfq) throw new Error('RFQ not found');
    const selection = selectionFor(rfq);
    if (!selection) {
      throw new Error('No supplier selection or qualified vendor found — complete supplier selection or technical evaluation first');
    }
    /* Require technical evaluation to be completed before approval.
       Accept either the RFQ-level completion flag OR per-vendor
       evaluations where every vendor has received a decision. */
    const evalRecord = evaluationsStore.all.find(
      (entry) => entry.id === rfq.id || entry.rfqNo === rfq.rfqNo
    );
    if (!isTechnicalEvaluationComplete(evalRecord)) {
      throw new Error('Complete the technical evaluation before raising an NFA');
    }
    /* Require at least one vendor to be technically qualified. */
    const vendorEvals = evalRecord.vendorEvaluations || {};
    const hasQualifiedVendor = Object.values(vendorEvals).some(
      (v) => v.decision === 'Qualified'
    );
    if (!hasQualifiedVendor) {
      throw new Error('At least one vendor must be technically qualified before raising an NFA');
    }
    const existing = nfasStore.all.find(
      (note) =>
        note.rfqNo === rfq.rfqNo &&
        (note.recordState || NFA_RECORD_STATE.ACTIVE) !== NFA_RECORD_STATE.DELETED
    );
    if (existing) throw new Error(`An NFA already exists for ${rfq.rfqNo}`);
    const suppliers = selectionSuppliers(selection);
    const actor = getCurrentActor();
    const nfaNo = nfaNoOverride || nextNfaNo(nfasStore.all);
    /* Prevent duplicate NFA numbers. */
    if (nfasStore.all.some((entry) => entry.nfaNo === nfaNo)) {
      throw new Error(`NFA number ${nfaNo} already exists`);
    }
    const note = {
      id: nfaNo,
      nfaNo,
      rfqId: rfq.id,
      rfqNo: rfq.rfqNo,
      rfqTitle: rfq.title || '',
      supplier: suppliers.length > 1 ? `Split award (${suppliers.length} suppliers)` : suppliers[0] || '—',
      suppliers,
      split: suppliers.length > 1,
      amount: selection.finalValue ?? 0,
      currency: rfq.currency || 'INR',
      /* Raised Purchase Order link — populated by recordPoRaised once a
         PO is created from this approved note. */
      poNo: null,
      poNos: [],
      poRaisedAt: null,
      status: NFA_STATUS.DRAFT,
      purpose: String(purpose || ''),
      justification: String(justification || ''),
      raisedBy: actor.name || 'System',
      raisedAt: nowIso(),
      submittedBy: null,
      submittedAt: null,
      approvedBy: null,
      approvedAt: null,
      approvalRemarks: '',
      approvalStages: NFA_APPROVAL_STAGES.map((stage) => ({
        stage,
        status: NFA_STAGE_STATUS.PENDING,
        approver: null,
        approvedAt: null,
        remarks: ''
      })),
      currentStage: null,
      recordState: NFA_RECORD_STATE.ACTIVE,
      activity: [entry('nfa', `${nfaNo} raised for ${rfq.rfqNo}`, remarks)]
    };
    nfasStore.all.push(note);
    persist();
    /* Raising the note enters the Approval Flow — the shared RFQ status
       advances to Pending Approval (idempotent: an RFQ already there —
       or further along — is left untouched). This also repairs records
       whose technical evaluation completed without the status sync. */
    syncRfqStatus(rfq, RFQ_STATUS.PENDING_APPROVAL);
    return clone(note);
  },

  /** Submits a DRAFT note for approval → Pending Approval (First stage active). */
  async submitNfa(id, { remarks = '' } = {}) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    if (note.status !== NFA_STATUS.DRAFT) {
      throw new Error('Only draft notes can be submitted for approval');
    }
    const actor = getCurrentActor();
    note.status = NFA_STATUS.PENDING_APPROVAL;
    note.currentStage = NFA_APPROVAL_STAGE.FIRST;
    note.submittedBy = actor.name || 'System';
    note.submittedAt = nowIso();
    note.activity.push(entry('nfa-submit', `${note.nfaNo} submitted for approval`, remarks));
    /* Submitted → the First stage is active, so the RFQ moves to
       1st Approval. */
    syncRfqStatus(rfqsStore.all.find((entry) => entry.id === note.rfqId || entry.rfqNo === note.rfqNo), NFA_TO_RFQ_STATUS[note.status]);
    return saveRecord(note);
  },

  /** Returns the next stage in the approval sequence, or null if at final. */
  _nextStage(currentStage) {
    const idx = NFA_APPROVAL_STAGES.indexOf(currentStage);
    return idx >= 0 && idx < NFA_APPROVAL_STAGES.length - 1
      ? NFA_APPROVAL_STAGES[idx + 1]
      : null;
  },

  /** Approves the current stage of a Pending/Stage-pending note. */
  async approveStage(id, { stage, remarks = '' } = {}) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    const targetStage = stage || note.currentStage;
    if (!targetStage) throw new Error('No active approval stage');
    const stageObj = note.approvalStages?.find((s) => s.stage === targetStage);
    if (!stageObj) throw new Error(`Approval stage "${targetStage}" not found`);
    if (stageObj.status !== NFA_STAGE_STATUS.PENDING) {
      throw new Error(`Stage "${targetStage}" has already been ${stageObj.status.toLowerCase()}`);
    }
    const actor = getCurrentActor();
    stageObj.status = NFA_STAGE_STATUS.APPROVED;
    stageObj.approver = actor.name || 'System';
    stageObj.approvedAt = nowIso();
    stageObj.remarks = String(remarks || '');
    note.activity.push(entry('nfa-stage-approve', `${note.nfaNo} — ${targetStage} stage approved`, remarks));
    const nextStage = this._nextStage(targetStage);
    if (nextStage) {
      note.currentStage = nextStage;
      note.status = NFA_STAGE_TO_STATUS[nextStage] || NFA_STATUS.PENDING_APPROVAL;
    } else {
      note.currentStage = null;
      note.status = NFA_STATUS.APPROVED;
      note.approvedBy = actor.name || 'System';
      note.approvedAt = nowIso();
      note.approvalRemarks = String(remarks || '');
      note.activity.push(entry('nfa-approve', `${note.nfaNo} fully approved — all stages complete`));
      /* When the NFA is fully approved, mirror the approval onto the
         evaluation record so that the downstream Award gate
         (evaluation.approval.status === 'Approved') is satisfied. */
      const evalRecord = evaluationsStore.all.find(
        (entry) => entry.id === note.rfqId || entry.rfqNo === note.rfqNo
      );
      if (evalRecord && !evalRecord.approval) {
        const approvalData = {
          status: 'Approved',
          decision: 'Approved',
          approver: actor.name || 'System',
          date: nowIso(),
          remarks: String(remarks || '')
        };
        evalRecord.approval = approvalData;
        evaluationsStore.persist(evaluationsStore.all);
        /* Persist the approval to the backend so the Award gate
           (evaluation.approval.status === 'Approved') is satisfied
           even after a page refresh. */
        const payload = { ...evalRecord, approval: approvalData };
        rfqApi.saveEvaluationRecord(evalRecord.rfqNo, payload).catch(() => {});
      }
    }
    /* The approval stage drives the shared RFQ status: First approved →
       2nd Approval, Second approved → Final Approval, Final approved
       → Approved. */
    syncRfqStatus(
      rfqsStore.all.find((entry) => entry.id === note.rfqId || entry.rfqNo === note.rfqNo),
      NFA_TO_RFQ_STATUS[note.status]
    );
    return saveRecord(note);
  },

  /** Rejects the current stage of a Pending/Stage-pending note. */
  async rejectStage(id, { stage, remarks = '' } = {}) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    const targetStage = stage || note.currentStage;
    if (!targetStage) throw new Error('No active approval stage');
    const stageObj = note.approvalStages?.find((s) => s.stage === targetStage);
    if (!stageObj) throw new Error(`Approval stage "${targetStage}" not found`);
    if (stageObj.status !== NFA_STAGE_STATUS.PENDING) {
      throw new Error(`Stage "${targetStage}" has already been ${stageObj.status.toLowerCase()}`);
    }
    const actor = getCurrentActor();
    stageObj.status = NFA_STAGE_STATUS.REJECTED;
    stageObj.approver = actor.name || 'System';
    stageObj.rejectedBy = actor.name || 'System';
    stageObj.rejectedAt = nowIso();
    stageObj.remarks = String(remarks || '');
    note.status = NFA_STATUS.REJECTED;
    note.currentStage = null;
    note.rejectedBy = actor.name || 'System';
    note.rejectedAt = nowIso();
    note.approvalRemarks = String(remarks || '');
    note.activity.push(entry('nfa-stage-reject', `${note.nfaNo} — ${targetStage} stage rejected`, remarks));
    note.activity.push(entry('nfa-reject', `${note.nfaNo} rejected at ${targetStage} stage`));
    return saveRecord(note);
  },

  /** Approves a Pending Approval note (legacy single-stage — kept for backward compat). */
  async approveNfa(id, { remarks = '' } = {}) {
    return this.approveStage(id, { stage: undefined, remarks });
  },

  /** Rejects a Pending Approval note (legacy single-stage — kept for backward compat). */
  async rejectNfa(id, { remarks = '' } = {}) {
    return this.rejectStage(id, { stage: undefined, remarks });
  },

  /** Moves a note to Archived (removed from the Active list, restorable). */
  async archiveNfa(id) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    note.recordState = NFA_RECORD_STATE.ARCHIVED;
    note.activity.push(entry('nfa-archive', `${note.nfaNo} archived`));
    return saveRecord(note);
  },

  /** Restores an archived / deleted note back to Active. */
  async restoreNfa(id) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    note.recordState = NFA_RECORD_STATE.ACTIVE;
    note.activity.push(entry('nfa-restore', `${note.nfaNo} restored to active`));
    return saveRecord(note);
  },

  /** Soft-deletes a note (moved to the Deleted tab, restorable). */
  async deleteNfa(id) {
    await delay();
    const note = findNfa(id);
    if (!note) throw new Error('NFA not found');
    note.recordState = NFA_RECORD_STATE.DELETED;
    note.activity.push(entry('nfa-delete', `${note.nfaNo} moved to deleted`));
    return saveRecord(note);
  },

  /** Bulk archive (active list). */
  async bulkArchive(ids) {
    await delay();
    const set = new Set(ids);
    nfasStore.all.forEach((note) => {
      if (set.has(note.id)) note.recordState = NFA_RECORD_STATE.ARCHIVED;
    });
    persist();
    return clone(nfasStore.all.filter((note) => set.has(note.id)));
  },

  /** Bulk restore (archived / deleted lists). */
  async bulkRestore(ids) {
    await delay();
    const set = new Set(ids);
    nfasStore.all.forEach((note) => {
      if (set.has(note.id)) note.recordState = NFA_RECORD_STATE.ACTIVE;
    });
    persist();
    return clone(nfasStore.all.filter((note) => set.has(note.id)));
  },

  /** Bulk soft-delete. */
  async bulkDelete(ids) {
    await delay();
    const set = new Set(ids);
    nfasStore.all.forEach((note) => {
      if (set.has(note.id)) note.recordState = NFA_RECORD_STATE.DELETED;
    });
    persist();
    return clone(nfasStore.all.filter((note) => set.has(note.id)));
  }
};

export default nfaService;
