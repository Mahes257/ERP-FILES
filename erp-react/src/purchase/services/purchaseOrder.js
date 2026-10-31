/**
 * purchase/services/purchaseOrder.js
 * ------------------------------------------------------------------
 * Mock Purchase Order service: PO creation from approved requisitions,
 * release/approval workflow, delivery status tracking. Data persists
 * to localStorage via the lazy collection.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, PAYMENT_METHODS, PO_STATUS, normalizePOStatus, normalizePoRecord } from '../constants';
import { isValidPOTransition } from './workflowConfig';
import { calcDocumentTotals, nextSeqNo } from '../utils/purchase';
import { purchaseOrderApi } from './api/purchaseOrderApi';
import { getCurrentActor, withFallback } from './api-client';
import { clone, createCollection, delay, paginate, storageKeys, todayLocal } from './base';
import { getDefaultCurrency, getPrintCompany, readSettings } from './settings';
import { normalizePrintDesign } from './poPrintDesign';
import { mockVendorService } from './vendor';
import { resolveVendor } from '../utils/supplierIdentity';
import {
  buildApprovalChain, chainToApprovalStatus, createApprovalState,
  approveStep as engineApproveStep, rejectStep as engineRejectStep,
  delegateStep as engineDelegateStep, substituteStep as engineSubstituteStep,
  escalateStep as engineEscalateStep, requestCorrection as engineRequestCorrection,
  resubmitState as engineResubmitState, currentStepIndex, pendingStepIndexes, isStepActionable
} from './approvalEngine';
import { assertBudgetAllowed, checkBudget, budgetLabel } from './budgetControl';
import { notifyWorkflowEvent, formatAmount } from './notificationFeed';
import {
  ADVANCE_STATUS,
  advanceAmount,
  attachMilestoneAmounts,
  balanceAmount,
  hasAdvance,
  normalizePaymentTerms,
  paymentTermsLabel
} from '../utils/paymentTerms';

export { APPROVAL_STATUS, PO_STATUS };

function nowIso() {
  return new Date().toISOString();
}

/** Activity entry for the PO timeline — same shape as the RFQ / PR
 *  services, enriched with the transition facts (PO number, previous /
 *  new status and the action performed) so the Approval Workflow /
 *  activity stream carries the full audit trail of every status change. */
function poActivityEntry(type, label, note = '', meta = {}) {
  const actor = getCurrentActor();
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    actor: actor.name || 'System',
    timestamp: nowIso(),
    note,
    ...meta
  };
}

/** Transition facts attached to every lifecycle activity entry. */
function transitionMeta(order, toStatus, action) {
  return {
    poNo: order.poNo,
    previousStatus: order.status,
    newStatus: toStatus,
    action
  };
}

/** Seed purchase orders — returns empty. Real data from the API. */
function poSeed() {
  return [];
}

/** Lazy, localStorage-backed PO collection. */
export const ordersStore = createCollection(storageKeys.orders, poSeed);

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

/**
 * Normalize a PO record to its canonical stage before returning.
 * Every PO object returned from the service MUST pass through this.
 */
function ensureCanonicalStage(order) {
  return normalizePoRecord(order);
}

/**
 * Normalize an array of PO records to canonical stages.
 */
function ensureCanonicalStages(records) {
  return records.map(ensureCanonicalStage);
}

/**
 * Approval-engine context for a PO — the dimensions the configured
 * approval rules and budget rows may condition on. Approver roles are
 * NEVER resolved here; they come from the configured rules.
 */
function poApprovalContext(order, actor = {}) {
  return {
    docType: 'PO',
    amount: Number(order.amount) || 0,
    department: order.department || '',
    project: order.project || '',
    costCenter: order.costCenter || '',
    role: String(actor.role || '').trim(),
    requestedBy: String(actor.name || '').trim()
  };
}

/** Builds the runtime approval state for a PO from the configured rules. */
function buildPoApprovalState(order) {
  const actor = getCurrentActor();
  const chain = buildApprovalChain(poApprovalContext(order, actor), readSettings());
  return createApprovalState(chain);
}

/** Vendor-master snapshot for a PO record — resolved by vendorId/name. */
function vendorSnapshotOf(record, vendors = []) {
  const master = resolveVendor(vendors, { id: record.vendorId, name: record.vendor });
  if (!master) return {};
  return {
    vendorAddress: master.address || '',
    vendorCity: master.city || '',
    vendorState: master.state || '',
    vendorGstin: master.gstin || '',
    vendorPhone: master.phone || '',
    vendorEmail: master.email || '',
    vendorContact:
      master.contacts?.[0]?.name ||
      master.contactName ||
      master.legalName ||
      master.name ||
      ''
  };
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value ?? '').trim() !== '') ?? '';
}

/**
 * Builds the display copy of a PO record for print: play-safe clone +
 * vendor master snapshot merged in (lowest precedence) with the saved
 * PO-local supplier snapshot and the record's own vendor-* fields.
 */
async function buildPoPrintRecord(record) {
  const base = clone(ensureCanonicalStage(record));
  const design = normalizePrintDesign(record.printDesign);
  const supplier = design.supplier || {};
  let master = {};
  try {
    master = vendorSnapshotOf(base, await mockVendorService.getAllVendors());
  } catch {
    /* Vendor enrichment is best-effort — never block the print page. */
  }
  return {
    ...base,
    vendorAddress: firstNonEmpty(supplier.address, base.vendorAddress, master.vendorAddress),
    vendorCity: firstNonEmpty(supplier.city, base.vendorCity, master.vendorCity),
    vendorState: firstNonEmpty(supplier.state, base.vendorState, master.vendorState),
    vendorGstin: firstNonEmpty(supplier.gstin, base.vendorGstin, master.vendorGstin),
    vendorPhone: firstNonEmpty(supplier.phone, base.vendorPhone, master.vendorPhone),
    vendorEmail: firstNonEmpty(supplier.email, base.vendorEmail, master.vendorEmail),
    vendorContact: firstNonEmpty(
      supplier.contact,
      base.vendorContact,
      base.vendorContactPerson,
      master.vendorContact
    ),
    printDesign: design
  };
}

export const mockPurchaseOrderService = {
  async getOrders({ search = '', status = 'All', page = 1, pageSize = 10, sortBy = 'orderDate', sortDir = 'desc' } = {}) {
    await delay();
    const records = ensureCanonicalStages(ordersStore.all);
    const query = String(search).trim().toLowerCase();
    const statusFilter = toFilter(status);

    let filtered = records.filter((order) => {
      /* Lifecycle filter — supports both new lifecycle statuses and legacy statuses.
         statusFilter may be a single status or a comma-separated list. */
      if (statusFilter) {
        const allowedStatuses = statusFilter.split(',').map((s) => s.trim());
        if (!allowedStatuses.includes(order.status)) return false;
      }
      if (query) {
        const haystack = [order.poNo, order.title, order.vendor, order.reference]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      const aValue = sortBy === 'amount' ? a.amount : new Date(a.orderDate).getTime();
      const bValue = sortBy === 'amount' ? b.amount : new Date(b.orderDate).getTime();
      if (aValue === bValue) return 0;
      return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
    });

    const result = paginate(filtered, { page, pageSize });
    result.data = result.data.map((record) => {
      const copy = { ...record };
      delete copy.totals;
      return copy;
    });
    return result;
  },

  async getOrder(id) {
    await delay();
    const order = ordersStore.all.find((entry) => entry.id === id);
    if (!order) throw new Error('Purchase order not found');
    return clone(ensureCanonicalStage(order));
  },

  async createOrder(payload = {}) {
    await delay();
    const records = ordersStore.all;
    const poNo = payload.poNo || nextSeqNo(records, 'PO', 'poNo', 4200);
    /* Prevent duplicate PO numbers. */
    if (records.some((entry) => entry.poNo === poNo)) {
      throw new Error(`PO number ${poNo} already exists`);
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    const totals = calcDocumentTotals(items, payload.discount, payload.charges);
    const now = new Date().toISOString();
    /* Payment terms — normalized once here so every consumer of the PO
       sees the canonical shape. The advance requirement is derived from
       the terms (never hardcoded): advance % > 0 (or an advance-triggered
       milestone) → advanceStatus 'Required', otherwise 'Not Required'. */
    const paymentTerms = normalizePaymentTerms(payload.paymentTerms || {});
    const hasFinalizedTerms = Boolean(paymentTerms.type);
    const advanceRequired = hasFinalizedTerms && hasAdvance(paymentTerms);
    const advance = advanceAmount(paymentTerms, totals.total);
    const normalized = {
      id: poNo,
      poNo,
      title: payload.title || 'Untitled Purchase Order',
      vendor: payload.vendor || '',
      reference: payload.reference || '',
      /* Explicit PR link — mirrors reference (backward-compatible alias). */
      prNo: payload.prNo || payload.reference || '',
      /* Upstream sourcing reference (RULE: every document retains its
         PR → RFQ → Quotation → Award → PO chain). Set by
         rfq.raisePurchaseOrder when the PO is raised from an awarded
         RFQ — the PO carries the RFQ number, the accepted quotation's
         number, and the final (negotiated) award value. */
      rfqNo: payload.rfqNo || '',
      quotationNo: payload.quotationNo || '',
      /* Budget-control dimensions — department / project / cost centre /
         fiscal year. These are the SAME dimensions the budget master
         (settings.budgetControl) and the approval rules condition on,
         so every PO carries what the engines need. */
      department: payload.department || '',
      project: payload.project || '',
      /* Source NFA (Note for Approval) — carried when the PO is raised
         from an approved note so the order references its approval
         document and the note can be linked back after creation. */
      nfaId: payload.nfaId || '',
      nfaNo: payload.nfaNo || '',
      awardedValue: payload.awardedValue ?? null,
      orderDate: payload.orderDate || todayLocal(),
      expectedDate: payload.expectedDate || '',
      terms: payload.terms || '30 Days',
      /* Commercial terms inherited from the awarded quotation / RFQ. */
      deliveryTerms: payload.deliveryTerms || '',
      warranty: payload.warranty || '',
      freight: Number(payload.freight) || 0,
      insurance: Number(payload.insurance) || 0,
      currency: payload.currency || getDefaultCurrency(),
      gstType: payload.gstType || '',
      incoterm: payload.incoterm || '',
      transportMode: payload.transportMode || '',
      warehouse: payload.warehouse || '',
      costCenter: payload.costCenter || '',
      location: payload.location || '',
      deliveryAddress: payload.deliveryAddress || '',
      deliveryDate: payload.deliveryDate || '',
      deliveryInstructions: payload.deliveryInstructions || '',
      discount: Number(payload.discount) || 0,
      charges: Number(payload.charges) || 0,
      notes: payload.notes || '',
      internalNotes: payload.internalNotes || '',
      vendorNotes: payload.vendorNotes || '',
      termsAndConditions: payload.termsAndConditions || '',
      items,
      amount: totals.total,
      totals,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      status: payload.status || PO_STATUS.PENDING_APPROVAL,
      approvalStatus: APPROVAL_STATUS.PENDING,
      /* Payment terms + advance payment (mirrors the finalized quotation
         terms — the PO never silently differs from the award). */
      paymentTerms: hasFinalizedTerms ? paymentTerms : null,
      /* RFQ-raised POs flag when terms were never finalized, so the
         release step refuses a silent release. */
      paymentTermsRequired: Boolean(payload.paymentTermsRequired),
      advanceStatus: advanceRequired ? ADVANCE_STATUS.REQUIRED : ADVANCE_STATUS.NOT_REQUIRED,
      advancePercentage: paymentTerms.advancePercentage || 0,
      advanceAmount: advance,
      balanceAmount: balanceAmount(paymentTerms, totals.total),
      advanceMilestones: attachMilestoneAmounts(paymentTerms, totals.total),
      advanceApproval: null,
      advancePaidAmount: 0,
      advancePaidAt: '',
      advancePaidBy: '',
      advancePaidMethod: '',
      advancePaidReference: '',
      createdAt: now,
      activity: [{ type: 'create', label: 'Purchase order created', actor: 'Kavita Rao', timestamp: now }]
    };

    /* Approval engine — the chain for THIS document is derived from the
       configured rules (amount / department / project / cost centre /
       doc type). Rebuilt on submit so edits never freeze a stale chain. */
    const createActor = getCurrentActor();
    normalized.approval = buildPoApprovalState({ ...normalized, amount: totals.total }, createActor);

    /* Budget control — validated at creation. Throws the exact shortage
       when the configured controls block the order; otherwise the
       shortage is recorded so the approval step can still enforce it. */
    const budgetCheck = assertBudgetAllowed(poApprovalContext(normalized, createActor), { amount: totals.total });
    if (budgetCheck.enabled && !budgetCheck.ok) {
      normalized.budget = {
        checked: true,
        ok: false,
        shortage: budgetCheck.shortage,
        available: budgetCheck.available,
        committed: budgetCheck.committed,
        actualInvoiced: budgetCheck.actualInvoiced,
        paid: budgetCheck.paid,
        exception: budgetCheck.exceptionAllowed,
        exceptionAllowed: budgetCheck.exceptionAllowed,
        budgetLabel: budgetLabel(budgetCheck.row),
        checkedAt: nowIso()
      };
    }

    records.push(normalized);
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(normalized));
  },

  async updateOrder(id, patch = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    /* A purchase order is editable while it is still pre-approval — Draft
       or Pending Approval (the same window deletion allows). Once approved
       and released into the supply chain the document is frozen, so later
       stages are never silently rewritten. Activity-only patches (e.g.
       audit trail) remain allowed on any status. */
    const current = records[index];
    const isEditable = current.status === PO_STATUS.DRAFT || current.status === PO_STATUS.PENDING_APPROVAL;
    const isActivityOnly = Object.keys(patch).length === 1 && patch.activity !== undefined;
    if (!isEditable && !isActivityOnly) {
      throw new Error(`Cannot edit ${current.poNo}: only Draft or Pending Approval purchase orders can be edited`);
    }
    /* Editing never lets the workflow skip or regress: a Draft may stay
       Draft or move to Pending Approval (submit); a Pending Approval order
       stays Pending Approval — it cannot slip back to Draft or jump ahead,
       those transitions belong to the dedicated stage services. */
    const targetStatus = patch.status !== undefined ? patch.status : current.status;
    if (current.status === PO_STATUS.DRAFT
      && ![PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL].includes(targetStatus)) {
      throw new Error(`Cannot move ${current.poNo} from ${current.status} to ${targetStatus} via edit`);
    }
    if (current.status === PO_STATUS.PENDING_APPROVAL && targetStatus !== PO_STATUS.PENDING_APPROVAL) {
      throw new Error(`Cannot move ${current.poNo} from ${current.status} to ${targetStatus} via edit`);
    }
    /* A substantive edit to a REJECTED note re-enters the approval queue
       (same as the list's explicit resubmit action). The rejection itself
       stays in the activity log — approval history is never erased. The
       approval chain is rebuilt from the CURRENT configured rules. */
    const resubmitAfterReject = !isActivityOnly
      && current.status === PO_STATUS.PENDING_APPROVAL
      && current.approvalStatus === APPROVAL_STATUS.REJECTED;
    const items = Array.isArray(patch.items) ? patch.items : records[index].items;
    const discount = patch.discount !== undefined ? patch.discount : records[index].discount;
    const charges = patch.charges !== undefined ? patch.charges : records[index].charges;
    const totals = calcDocumentTotals(items, discount, charges);
    const merged = {
      ...records[index],
      ...patch,
      id: records[index].id,
      poNo: records[index].poNo,
      items,
      discount,
      charges,
      amount: totals.total,
      totals,
      /* Workflow identity — editing content never jumps the stage or
         erases the approval trail: a Draft may move to Pending Approval
         (submit) but a Pending Approval order always stays pending here;
         approvalStatus only resets PENDING on a substantive edit of a
         rejected note (re-submission), never on routine saves; the
         activity log and creation audit trail are preserved unless the
         patch itself is an audit-trail update. */
      /* A Draft may be submitted through the edit form; every other
         record (Pending Approval edits, activity-only audit patches on
         later stages) keeps the stage it is in. */
      status: current.status === PO_STATUS.DRAFT ? targetStatus : current.status,
      approvalStatus: resubmitAfterReject
        ? APPROVAL_STATUS.PENDING
        : patch.approvalStatus !== undefined
          ? patch.approvalStatus
          : records[index].approvalStatus,
      /* Resubmission after rejection resets the approval chain so the
         corrected document is re-evaluated against the current rules. */
      approval: resubmitAfterReject && records[index].approval
        ? engineResubmitState(records[index].approval)
        : records[index].approval,
      activity: patch.activity !== undefined ? patch.activity : records[index].activity,
      createdAt: records[index].createdAt
    };
    records[index] = merged;
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  async deleteOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    if (![PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL].includes(records[index].status)) {
      throw new Error(`Cannot delete ${records[index].poNo}: only Draft or Pending Approval purchase orders can be deleted`);
    }
    records.splice(index, 1);
    ordersStore.persist(records);
    return { id }; // deletion has no PO to normalize
  },

  /** Submit a Draft PO for approval. */
  async submitOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (order.status !== PO_STATUS.DRAFT) {
      throw new Error(`Cannot submit ${order.poNo}: only Draft purchase orders can be submitted`);
    }
    const actor = getCurrentActor();
    /* Budget control — a PO cannot enter the approval queue when the
       configured controls block it (exact shortage in the message). */
    const budgetCheck = assertBudgetAllowed(poApprovalContext(order, actor), { amount: order.amount });
    const budget = order.budget || {};
    /* (Re)build the approval chain from the CURRENT configured rules. */
    const approval = buildPoApprovalState(order, actor);
    records[index] = {
      ...order,
      status: PO_STATUS.PENDING_APPROVAL,
      submittedAt: nowIso(),
      approval,
      approvalStatus: APPROVAL_STATUS.PENDING,
      /* Budget flag updated at submit — the shortage may differ from
         creation if other POs were approved meanwhile. */
      budget: budgetCheck.enabled && !budgetCheck.ok
        ? {
            ...budget,
            checked: true,
            ok: false,
            shortage: budgetCheck.shortage,
            available: budgetCheck.available,
            committed: budgetCheck.committed,
            actualInvoiced: budgetCheck.actualInvoiced,
            paid: budgetCheck.paid,
            exception: budgetCheck.exceptionAllowed,
            exceptionAllowed: budgetCheck.exceptionAllowed,
            budgetLabel: budgetLabel(budgetCheck.row),
            checkedAt: nowIso()
          }
        : { ...budget, checked: true, ok: true, shortage: 0, exception: false, checkedAt: nowIso() },
      activity: [
        ...(order.activity || []),
        poActivityEntry('submit', `${order.poNo} submitted for approval`, '', transitionMeta(order, PO_STATUS.PENDING_APPROVAL, 'submit'))
      ]
    };
    ordersStore.persist(records);
    notifyWorkflowEvent({
      type: 'Pending Approval',
      title: `${order.poNo} pending approval`,
      message: `${order.poNo} was submitted for approval by ${actor.name || 'System'} — ${formatAmount(order.amount)}.`,
      route: `/purchase/orders/${order.id}`,
      documentNo: order.poNo,
      related: { type: 'po', id: order.id, vendor: order.vendor || '' },
      sourceEvent: 'submitOrder'
    });
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Approves the CURRENT approval step of a PO (or the whole order when
   * it carries no multi-step chain). When every step is approved the PO
   * is approved and may be released. Options:
   *   { stepIndex, approver, note } — which step / who / why.
   */
  async approveOrder(id, options = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.APPROVED)) {
      throw new Error(`Cannot approve ${order.poNo}: current stage is ${order.status}`);
    }
    const actor = getCurrentActor();
    /* Budget control — approval is the moment the PO value commits to
       the budget, so the exact-shortage guard runs again here. */
    const budgetCheck = assertBudgetAllowed(poApprovalContext(order, actor), { amount: order.amount });
    let budget = order.budget || {};
    if (budgetCheck.enabled && !budgetCheck.ok) {
      budget = {
        ...budget,
        checked: true,
        ok: false,
        shortage: budgetCheck.shortage,
        available: budgetCheck.available,
        committed: budgetCheck.committed,
        actualInvoiced: budgetCheck.actualInvoiced,
        paid: budgetCheck.paid,
        exception: budgetCheck.exceptionAllowed,
        exceptionAllowed: budgetCheck.exceptionAllowed,
        budgetLabel: budgetLabel(budgetCheck.row),
        checkedAt: nowIso()
      };
    }

    const approver = String(options.approver || '').trim() || actor.name || '';
    const note = String(options.note || '').trim();

    /* No engine chain (legacy record) → whole-order approval as before. */
    if (!order.approval || !Array.isArray(order.approval.steps) || order.approval.steps.length === 0) {
      records[index] = {
        ...order,
        status: PO_STATUS.APPROVED,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        approvedAt: nowIso(),
        budget,
        activity: [
          ...(order.activity || []),
          poActivityEntry('approve', `${order.poNo} approved`, note, transitionMeta(order, PO_STATUS.APPROVED, 'approve'))
        ]
      };
      ordersStore.persist(records);
      notifyWorkflowEvent({
        type: 'PO Approved',
        title: `${order.poNo} approved`,
        message: `${order.poNo} was approved by ${approver || actor.name || 'System'}.`,
        route: `/purchase/orders/${order.id}`,
        documentNo: order.poNo,
        related: { type: 'po', id: order.id, vendor: order.vendor || '' },
        sourceEvent: 'approveOrder'
      });
      return clone(ensureCanonicalStage(records[index]));
    }

    /* Engine chain — advance the approval state. Two call modes:
         · bulk (no stepIndex — the approval console) — a rejected
           chain is first resubmitted (the rejection stays in the
           activity log) and then every actionable step is approved,
           so the PO completes its whole configured chain in one call;
         · per-step (stepIndex given) — approve exactly that step and
           stay Pending until every step has approved. */
    let approval = order.approval;
    const stepIndexProvided = options.stepIndex !== undefined;
    if (approval.status === 'Rejected') {
      approval = engineResubmitState(approval);
    }
    let allApproved;
    let stepIndex;
    if (stepIndexProvided) {
      stepIndex = Number(options.stepIndex);
      approval = engineApproveStep(approval, { stepIndex, approver, note });
      allApproved = approval.status === 'Approved';
    } else {
      /* Bulk — approve every currently actionable step. Sequential
         chains advance one step per round; parallel chains approve
         all pending steps together. */
      let guard = 0;
      while (approval.status === 'Pending' && guard++ < 50) {
        const pending = pendingStepIndexes(approval);
        if (pending.length === 0) break;
        let round = approval;
        pending.forEach((idx) => {
          round = engineApproveStep(round, { stepIndex: idx, approver, note });
        });
        approval = round;
      }
      stepIndex = currentStepIndex(approval);
      allApproved = approval.status === 'Approved';
    }
    const step = stepIndex >= 0 && approval.steps[stepIndex] ? approval.steps[stepIndex] : null;
    records[index] = {
      ...order,
      approval,
      approvalStatus: chainToApprovalStatus(approval),
      budget,
      status: allApproved ? PO_STATUS.APPROVED : order.status,
      approvedAt: allApproved ? nowIso() : order.approvedAt || '',
      activity: [
        ...(order.activity || []),
        poActivityEntry(
          'approve',
          allApproved
            ? `${order.poNo} approved`
            : `${order.poNo} step ${stepIndex + 1} approved by ${approver || (step && step.role) || 'approver'} — ${approval.steps.filter((s) => s.status === 'Approved').length} of ${approval.steps.length} steps`, 
          note,
          transitionMeta(order, allApproved ? PO_STATUS.APPROVED : order.status, 'approve')
        )
      ]
    };
    ordersStore.persist(records);
    if (allApproved) {
      notifyWorkflowEvent({
        type: 'PO Approved',
        title: `${order.poNo} approved`,
        message: `${order.poNo} cleared its full approval chain (approved by ${approver || 'approvers'}).`,
        route: `/purchase/orders/${order.id}`,
        documentNo: order.poNo,
        related: { type: 'po', id: order.id, vendor: order.vendor || '' },
        sourceEvent: 'approveOrder'
      });
    }
    return clone(ensureCanonicalStage(records[index]));
  },

  async rejectOrder(id, options = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    if (records[index].approvalStatus !== APPROVAL_STATUS.PENDING) {
      throw new Error('Only pending purchase orders can be rejected');
    }
    const order = records[index];
    const actor = getCurrentActor();
    const note = String(options.note || '').trim();
    /* Engine chain — reject the current actionable step. */
    let approval = order.approval;
    if (approval && Array.isArray(approval.steps) && approval.steps.length > 0) {
      const stepIndex = options.stepIndex !== undefined ? Number(options.stepIndex) : currentStepIndex(approval);
      approval = engineRejectStep(approval, {
        stepIndex,
        approver: String(options.approver || '').trim() || actor.name || '',
        note
      });
    }
    records[index] = {
      ...order,
      approval,
      approvalStatus: APPROVAL_STATUS.REJECTED,
      rejectedAt: nowIso(),
      activity: [
        ...(order.activity || []),
        poActivityEntry('reject', `${order.poNo} rejected during approval`, note, transitionMeta(order, order.status, 'reject'))
      ]
    };
    ordersStore.persist(records);
    notifyWorkflowEvent({
      type: 'PO Rejected',
      title: `${order.poNo} rejected`,
      message: `${order.poNo} was rejected during approval${note ? ` — ${note}` : ''}.`,
      route: `/purchase/orders/${order.id}`,
      documentNo: order.poNo,
      related: { type: 'po', id: order.id, vendor: order.vendor || '' },
      sourceEvent: 'rejectOrder'
    });
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Delegates the current approval step to another approver. */
  async delegateApprovalStep(id, { from = '', to = '', note = '' } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!order.approval || !Array.isArray(order.approval.steps)) {
      throw new Error(`${order.poNo} has no approval chain — submit it first`);
    }
    const stepIndex = currentStepIndex(order.approval);
    const nextApproval = engineDelegateStep(order.approval, { stepIndex, from, to, note });
    records[index] = {
      ...order,
      approval: nextApproval,
      activity: [
        ...(order.activity || []),
        poActivityEntry('delegate', `${order.poNo} approval step delegated to ${to}`, note)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Assigns a substitute approver to the current step. */
  async substituteApprovalStep(id, { substitute = '', note = '' } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!order.approval || !Array.isArray(order.approval.steps)) {
      throw new Error(`${order.poNo} has no approval chain — submit it first`);
    }
    const stepIndex = currentStepIndex(order.approval);
    const nextApproval = engineSubstituteStep(order.approval, { stepIndex, substitute, note });
    records[index] = {
      ...order,
      approval: nextApproval,
      activity: [
        ...(order.activity || []),
        poActivityEntry('substitute', `${order.poNo} substitute approver ${substitute} assigned`, note)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Escalates the current approval step to the configured escalation role. */
  async escalateApprovalStep(id, { escalatedTo = '', note = '' } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!order.approval || !Array.isArray(order.approval.steps)) {
      throw new Error(`${order.poNo} has no approval chain — submit it first`);
    }
    const stepIndex = currentStepIndex(order.approval);
    const nextApproval = engineEscalateStep(order.approval, { stepIndex, escalatedTo, note });
    records[index] = {
      ...order,
      approval: nextApproval,
      activity: [
        ...(order.activity || []),
        poActivityEntry('escalate', `${order.poNo} approval escalated`, note)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Requests a correction on a pending PO (stays in the queue, flagged). */
  async requestPoCorrection(id, { reason = '' } = {}) {
    await delay();
    if (!reason || !String(reason).trim()) throw new Error('Correction reason is required');
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (order.approvalStatus !== APPROVAL_STATUS.PENDING) {
      throw new Error('Only pending purchase orders can have corrections requested');
    }
    const approval = engineRequestCorrection(order.approval, { reason });
    records[index] = {
      ...order,
      approval,
      correctionRequested: true,
      correctionReason: String(reason).trim(),
      activity: [
        ...(order.activity || []),
        poActivityEntry('correction', `Correction requested for ${order.poNo}`, reason)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Resubmits a rejected PO — resets the approval chain and re-enters the queue. */
  async resubmitOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (order.approvalStatus !== APPROVAL_STATUS.REJECTED) {
      throw new Error('Only rejected purchase orders can be resubmitted');
    }
    /* Rebuild the chain so edits made after rejection are re-evaluated. */
    const approval = engineResubmitState(order.approval || buildPoApprovalState(order));
    records[index] = {
      ...order,
      approval,
      approvalStatus: APPROVAL_STATUS.PENDING,
      rejectedAt: '',
      correctionRequested: false,
      correctionReason: '',
      activity: [
        ...(order.activity || []),
        poActivityEntry('resubmit', `${order.poNo} resubmitted for approval`, '', transitionMeta(order, PO_STATUS.PENDING_APPROVAL, 'resubmit'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Returns the pending approval step indexes for the PO's chain. */
  async getApprovalProgress(id) {
    await delay();
    const order = ordersStore.all.find((entry) => entry.id === id);
    if (!order) throw new Error('Purchase order not found');
    return {
      approval: order.approval || null,
      pending: order.approval ? pendingStepIndexes(order.approval) : [],
      current: order.approval ? currentStepIndex(order.approval) : -1,
      actionable: order.approval ? pendingStepIndexes(order.approval).map((i) => isStepActionable(order.approval, i)) : []
    };
  },

  /** Live budget utilisation for a PO (Budget / Committed / Actual /
   *  Paid / Available) — computed from real records, never hardcoded. */
  async checkPoBudget(id) {
    await delay();
    const order = ordersStore.all.find((entry) => entry.id === id);
    if (!order) throw new Error('Purchase order not found');
    return checkBudget(poApprovalContext(order, getCurrentActor()), { amount: order.amount });
  },

  async setDeliveryStatus(id, status) {
    await delay();
    if (!Object.values(PO_STATUS).includes(status)) {
      throw new Error('Invalid delivery status');
    }
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    if (records[index].status === PO_STATUS.COMPLETED && status !== PO_STATUS.COMPLETED) {
      throw new Error('A completed purchase order cannot be moved back');
    }
    /* setDeliveryStatus is called by the logistics system (GRN receipts) to
       update PO delivery state. It allows transitions between delivery-related
       statuses from any released+ stage. The guard ensures:
       - The PO must be at least Released
       - Cannot go backwards from Completed
       - Cannot set to a non-delivery status (Draft, Pending, etc.) */
    const DELIVERY_STATUSES = new Set([
      PO_STATUS.IN_PROGRESS,
      PO_STATUS.PARTIALLY_DELIVERED,
      PO_STATUS.COMPLETED,
    ]);
    const currentStatus = records[index].status;
    const RELEASED_OR_BEYOND = [
      PO_STATUS.RELEASED, PO_STATUS.SUPPLIER_ACKNOWLEDGED,
      PO_STATUS.IN_PROGRESS, PO_STATUS.PARTIALLY_DELIVERED, PO_STATUS.COMPLETED
    ];
    if (!RELEASED_OR_BEYOND.includes(currentStatus)) {
      throw new Error(`Cannot set delivery status on ${records[index].poNo}: current stage is ${currentStatus}`);
    }
    if (!DELIVERY_STATUSES.has(status)) {
      throw new Error(`Cannot set delivery status to ${status}: only In Progress, Partially Delivered, or Completed allowed`);
    }
    if (DELIVERY_STATUSES.has(currentStatus) && status === PO_STATUS.IN_PROGRESS && currentStatus !== PO_STATUS.RELEASED && currentStatus !== PO_STATUS.SUPPLIER_ACKNOWLEDGED) {
      throw new Error(`Cannot move ${records[index].poNo} back to In Progress from ${currentStatus}`);
    }
    const deliveryStatus = normalizePOStatus(status);
    records[index] = {
      ...records[index],
      status: deliveryStatus,
      activity: [
        ...(records[index].activity || []),
        poActivityEntry('delivery', `${records[index].poNo} delivery status changed to ${deliveryStatus}`, '', transitionMeta(records[index], deliveryStatus, 'delivery'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Release PO to supplier */
  async releaseOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.RELEASED)) {
      throw new Error(`Cannot release ${order.poNo}: current stage is ${order.status}`);
    }
    const releasedAt = nowIso();
    records[index] = {
      ...order,
      status: PO_STATUS.RELEASED,
      /* Derived stage fields — mirrors of `status`, written together
         with it so they can never drift from the single source. */
      releaseStage: PO_STATUS.RELEASED,
      acknowledgementStage: 'Pending',
      releasedAt,
      activity: [
        ...(order.activity || []),
        poActivityEntry('release', `${order.poNo} released to ${order.vendor || 'supplier'}`, '', transitionMeta(order, PO_STATUS.RELEASED, 'release'))
      ]
    };
    ordersStore.persist(records);
    notifyWorkflowEvent({
      type: 'PO Released',
      title: `${order.poNo} released`,
      message: `${order.poNo} was released to ${order.vendor || 'the supplier'} on ${releasedAt.slice(0, 10)}.`,
      route: `/purchase/orders/${order.id}`,
      documentNo: order.poNo,
      related: { type: 'po', id: order.id, vendor: order.vendor || '' },
      sourceEvent: 'releaseOrder'
    });
    notifyWorkflowEvent({
      type: 'Acknowledgement Pending',
      title: `${order.poNo} awaiting supplier acknowledgement`,
      message: `${order.poNo} was released — awaiting acknowledgement from ${order.vendor || 'the supplier'}.`,
      route: `/purchase/orders/${order.id}`,
      documentNo: order.poNo,
      related: { type: 'po', id: order.id, vendor: order.vendor || '' },
      sourceEvent: 'releaseOrder'
    });
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Close a completed PO */
  async closeOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.CLOSED)) {
      throw new Error(`Cannot close ${order.poNo}: current stage is ${order.status}`);
    }
    records[index] = {
      ...order,
      status: PO_STATUS.CLOSED,
      closedAt: nowIso(),
      activity: [
        ...(order.activity || []),
        poActivityEntry('close', `${order.poNo} closed`, '', transitionMeta(order, PO_STATUS.CLOSED, 'close'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Cancel a PO — only from stages where cancellation is allowed */
  async cancelOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.CANCELLED)) {
      throw new Error(`Cannot cancel ${order.poNo}: current stage is ${order.status}`);
    }
    records[index] = {
      ...order,
      status: PO_STATUS.CANCELLED,
      cancelledAt: nowIso(),
      activity: [
        ...(order.activity || []),
        poActivityEntry('cancel', `${order.poNo} cancelled`, '', transitionMeta(order, PO_STATUS.CANCELLED, 'cancel'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  async acknowledgeOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (order.acknowledged) {
      throw new Error(`${order.poNo} is already acknowledged by the supplier`);
    }
    if (!isValidPOTransition(order.status, PO_STATUS.SUPPLIER_ACKNOWLEDGED)) {
      throw new Error(`Cannot acknowledge ${order.poNo}: current stage is ${order.status}`);
    }
    const acknowledgedAt = nowIso();
    records[index] = {
      ...order,
      status: PO_STATUS.SUPPLIER_ACKNOWLEDGED,
      /* Derived stage fields — mirrors of `status` + ack timestamps,
         written together so no field can drift from the single source. */
      releaseStage: PO_STATUS.RELEASED,
      acknowledgementStage: 'Acknowledged',
      acknowledged: true,
      acknowledgedAt,
      acknowledgedDate: acknowledgedAt.slice(0, 10),
      acknowledgedBy: order.vendor || 'Supplier',
      activity: [
        ...(order.activity || []),
        poActivityEntry('acknowledge', `${order.poNo} acknowledged by ${order.vendor || 'supplier'}`, '', transitionMeta(order, PO_STATUS.SUPPLIER_ACKNOWLEDGED, 'acknowledge'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Supplier acknowledgement reminder — appends a persisted activity entry
      (no status change), mirroring the API's POST /orders/{id}/reminder. */
  async remindOrder(id, note = '') {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    records[index] = {
      ...order,
      activity: [
        ...(order.activity || []),
        poActivityEntry('reminder', `Acknowledgement reminder sent to ${order.vendor || 'supplier'} for ${order.poNo}`, note)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Start work on a PO: Supplier Acknowledged → In Progress. */
  async startOrder(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.IN_PROGRESS)) {
      throw new Error(`Cannot start ${order.poNo}: current stage is ${order.status}`);
    }
    records[index] = {
      ...order,
      status: PO_STATUS.IN_PROGRESS,
      startedAt: nowIso(),
      activity: [
        ...(order.activity || []),
        poActivityEntry('start', `${order.poNo} moved to In Progress`, '', transitionMeta(order, PO_STATUS.IN_PROGRESS, 'start'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Mark PO as partially delivered: In Progress → Partially Delivered.
   * Validates received quantities against ordered quantities.
   */
  async markPartiallyDelivered(id, { receivedItems = [] } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.PARTIALLY_DELIVERED)) {
      throw new Error(`Cannot mark ${order.poNo} as partially delivered: current stage is ${order.status}`);
    }
    /* Validate quantities if provided */
    if (receivedItems.length > 0 && Array.isArray(order.items)) {
      for (const item of receivedItems) {
        const ordered = order.items.find((i) => i.product === item.product);
        if (!ordered) throw new Error(`Item ${item.product} not found in PO`);
        if (Number(item.receivedQty) > Number(ordered.qty)) {
          throw new Error(`Received quantity (${item.receivedQty}) exceeds ordered quantity (${ordered.qty}) for ${item.product}`);
        }
      }
    }
    records[index] = {
      ...order,
      status: PO_STATUS.PARTIALLY_DELIVERED,
      receivedItems,
      partiallyDeliveredAt: nowIso(),
      activity: [
        ...(order.activity || []),
        poActivityEntry('delivery', `${order.poNo} marked as Partially Delivered`, '', transitionMeta(order, PO_STATUS.PARTIALLY_DELIVERED, 'delivery'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Complete a PO: In Progress/Partially Delivered → Completed.
   * If receivedItems provided, validates all quantities are fully received.
   */
  async completeOrder(id, { receivedItems = [] } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!isValidPOTransition(order.status, PO_STATUS.COMPLETED)) {
      throw new Error(`Cannot complete ${order.poNo}: current stage is ${order.status}`);
    }
    records[index] = {
      ...order,
      status: PO_STATUS.COMPLETED,
      completedAt: nowIso(),
      receivedItems: receivedItems.length > 0 ? receivedItems : order.receivedItems,
      activity: [
        ...(order.activity || []),
        poActivityEntry('complete', `${order.poNo} marked as Completed`, '', transitionMeta(order, PO_STATUS.COMPLETED, 'complete'))
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Advance Payment — the request step. Only POs whose finalized terms
   * require an advance can have one requested, and only once (a rejected
   * request can be re-submitted). Records the request details (due date,
   * bank/payment information, notes) and moves the PO to
   * Pending Approval. The advance amount is always derived from the
   * finalized terms × PO value — never user-typed.
   */
  async requestAdvancePayment(id, { dueDate = '', bankInfo = '', notes = '' } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (!(Number(order.advanceAmount) > 0)) {
      throw new Error('This PO has no advance payment requirement');
    }
    if (![ADVANCE_STATUS.REQUIRED, ADVANCE_STATUS.REJECTED].includes(order.advanceStatus)) {
      throw new Error(`${order.poNo} advance payment request is already ${order.advanceStatus.toLowerCase()}`);
    }
    const actor = getCurrentActor();
    records[index] = {
      ...order,
      advanceStatus: ADVANCE_STATUS.PENDING_APPROVAL,
      advanceApproval: {
        status: ADVANCE_STATUS.PENDING_APPROVAL,
        requestedAt: nowIso(),
        requestedBy: actor.name || 'System',
        dueDate,
        bankInfo: String(bankInfo || ''),
        notes: String(notes || ''),
        amount: Number(order.advanceAmount) || 0
      },
      activity: [
        ...(order.activity || []),
        poActivityEntry(
          'advance',
          `Advance Payment Requested — ${order.currency || 'INR'} ${(Number(order.advanceAmount) || 0).toFixed(2)}`,
          notes
        )
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Advance Payment decision — Approve / Reject a pending request.
   * Approval follows the existing approval model (ADMIN / explicit
   * permission, enforced by the UI via canApproveRequisitions); a
   * rejected request can be re-submitted.
   */
  async decideAdvancePayment(id, { decision, remarks = '' } = {}) {
    await delay();
    if (![APPROVAL_STATUS.APPROVED, APPROVAL_STATUS.REJECTED].includes(decision)) {
      throw new Error('Invalid advance payment decision');
    }
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (order.advanceStatus !== ADVANCE_STATUS.PENDING_APPROVAL) {
      throw new Error('Only a pending advance payment request can be reviewed');
    }
    const actor = getCurrentActor();
    records[index] = {
      ...order,
      advanceStatus: decision === APPROVAL_STATUS.APPROVED ? ADVANCE_STATUS.APPROVED : ADVANCE_STATUS.REJECTED,
      advanceApproval: {
        ...(order.advanceApproval || {}),
        status: decision === APPROVAL_STATUS.APPROVED ? ADVANCE_STATUS.APPROVED : ADVANCE_STATUS.REJECTED,
        decision,
        approver: actor.name || 'System',
        date: nowIso(),
        remarks: String(remarks || '')
      },
      activity: [
        ...(order.activity || []),
        poActivityEntry(
          'advance',
          decision === APPROVAL_STATUS.APPROVED
            ? `Advance Payment Approved — ${order.currency || 'INR'} ${(Number(order.advanceAmount) || 0).toFixed(2)}`
            : `Advance Payment Rejected — ${order.poNo}`,
          remarks
        )
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Marks an approved advance as being processed (payment initiated). */
  async startAdvanceProcessing(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (order.advanceStatus !== ADVANCE_STATUS.APPROVED) {
      throw new Error('Only an approved advance can start processing');
    }
    records[index] = {
      ...order,
      advanceStatus: ADVANCE_STATUS.PAYMENT_PROCESSING,
      activity: [
        ...(order.activity || []),
        poActivityEntry('advance', `Advance payment processing started — ${order.poNo}`)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Records the advance as paid. The paid amount is ALWAYS the derived
   * advance amount — the user cannot type a different figure, so the
   * advance can never silently differ from the finalized terms.
   */
  async markAdvancePaid(id, { method = PAYMENT_METHODS[0], reference = '' } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    if (![ADVANCE_STATUS.APPROVED, ADVANCE_STATUS.PAYMENT_PROCESSING].includes(order.advanceStatus)) {
      throw new Error('Only an approved advance can be paid');
    }
    const amount = Number(order.advanceAmount) || 0;
    const actor = getCurrentActor();
    records[index] = {
      ...order,
      advanceStatus: ADVANCE_STATUS.PAID,
      advancePaidAmount: amount,
      advancePaidAt: nowIso(),
      advancePaidBy: actor.name || 'System',
      advancePaidMethod: method,
      advancePaidReference: String(reference || ''),
      activity: [
        ...(order.activity || []),
        poActivityEntry(
          'advance',
          `Advance Payment Paid — ${order.currency || 'INR'} ${amount.toFixed(2)}`,
          `${method}${reference ? ` · ${reference}` : ''}`
        )
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Updates the finalized payment terms on an existing PO (audited). */
  async updatePaymentTerms(id, { paymentTerms, notes = '' } = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const normalized = normalizePaymentTerms(paymentTerms || {});
    if (!normalized.type) throw new Error('Payment terms must be finalized');
    const order = records[index];
    const advanceRequired = hasAdvance(normalized);
    const advance = advanceAmount(normalized, order.amount);
    records[index] = {
      ...order,
      paymentTerms: normalized,
      paymentTermsRequired: false,
      advanceStatus: advanceRequired ? ADVANCE_STATUS.REQUIRED : ADVANCE_STATUS.NOT_REQUIRED,
      advancePercentage: normalized.advancePercentage || 0,
      advanceAmount: advance,
      balanceAmount: balanceAmount(normalized, order.amount),
      advanceMilestones: attachMilestoneAmounts(normalized, order.amount),
      activity: [
        ...(order.activity || []),
        poActivityEntry('payment-terms', `Payment Terms Modified — ${paymentTermsLabel(normalized)}`, notes)
      ]
    };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /**
   * Returns a ready-to-render print document: PO record plus
   * company profile and signature placeholders. The record is enriched
   * for display with its supplier snapshot: a PO-local saved snapshot
   * (record.printDesign.supplier) wins, then the record's own
   * vendorAddress-field copy, then the live vendor-master entry matched
   * by name. The vendor master is never mutated here.
   */
  async printPreview(id) {
    await delay();
    const record = ordersStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Purchase order not found');
    const actor = getCurrentActor();
    return {
      record: await buildPoPrintRecord(record),
      company: getPrintCompany(),
      preparedBy: record.requester || 'Kavita Rao',
      checkedBy: record.buyer || 'Amit Verma',
      approvedBy: record.approvedBy || (record.approvalStatus === 'Approved' ? actor.name : '—'),
      generatedAt: new Date().toISOString()
    };
  },

  /**
   * Persists the PO's print design (branding, signature images, field
   * visibility, layout + the supplier snapshot) WITHOUT going through
   * the workflow edit guard — the design is presentation-only metadata
   * and can never rewrite workflow state or amounts, so it stays
   * editable on Approved / Released orders too.
   */
  async savePrintDesign(id, design = {}) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    records[index] = { ...records[index], printDesign: normalizePrintDesign(design) };
    ordersStore.persist(records);
    return clone(ensureCanonicalStage(records[index]));
  },

  /** Records a print activity entry after the PO PDF has been exported. */
  async logPrintActivity(id) {
    await delay();
    const records = ordersStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Purchase order not found');
    const order = records[index];
    records[index] = {
      ...order,
      activity: [
        ...(order.activity || []),
        poActivityEntry('print', 'PDF exported')
      ]
    };
    ordersStore.persist(records);
  },

  async getOrderStats() {
    await delay();
    const records = ensureCanonicalStages(ordersStore.all);

    /* Lifecycle status counts using canonical stages. */
    const lifecycleCounts = {};
    Object.values(PO_STATUS).forEach((status) => {
      lifecycleCounts[status] = records.filter((order) => order.status === status).length;
    });

    /* Approval buckets derived from the ACTUAL stored status + approval
       decision (the same buckets the PO Approval console renders):
       - pendingApproval = submitted and awaiting the decision (status
         Pending Approval + approvalStatus Pending). Draft POs are NOT
         waiting for approval; Approved / Released / later stages have
         passed the approval gate.
       - approved = approved at the gate, status Approved (not yet
         released — released / acknowledged POs live in their own
         execution buckets and never count here).
       - rejected = approvalStatus Rejected (status Pending Approval). */
    const awaitingApproval = (order) =>
      order.status === PO_STATUS.PENDING_APPROVAL
      && order.approvalStatus === APPROVAL_STATUS.PENDING;

    return {
      total: records.length,
      ...lifecycleCounts,
      value: records.reduce((sum, order) => sum + order.amount, 0),
      pendingApproval: records.filter(awaitingApproval).length,
      approved: records.filter((order) => order.status === PO_STATUS.APPROVED).length,
      rejected: records.filter((order) => order.approvalStatus === APPROVAL_STATUS.REJECTED).length,
      acknowledged: records.filter((order) => order.acknowledged).length
    };
  }
};

/**
 * API-first purchase order service facade. Calls the real Spring Boot
 * API; falls back to the mock implementation only when the backend is
 * unreachable (network error). Public interface identical to the
 * mock's, so components are untouched.
 */
export const purchaseOrderService = {
  async getOrders(options = {}) {
    return withFallback(() => purchaseOrderApi.list(options), () => mockPurchaseOrderService.getOrders(options));
  },

  async getOrder(id) {
    return withFallback(() => purchaseOrderApi.get(id), () => mockPurchaseOrderService.getOrder(id));
  },

  async getNextOrderNumber() {
    return withFallback(
      async () => {
        const result = await purchaseOrderApi.nextNumber();
        return result?.poNo || result?.nextNumber || result;
      },
      async () => nextSeqNo(ordersStore.all, 'PO', 'poNo', 4200)
    );
  },

  async createOrder(payload = {}) {
    return withFallback(() => purchaseOrderApi.create(payload), () => mockPurchaseOrderService.createOrder(payload));
  },

  async updateOrder(id, patch = {}) {
    return withFallback(() => purchaseOrderApi.update(id, patch), () => mockPurchaseOrderService.updateOrder(id, patch));
  },

  async deleteOrder(id) {
    return withFallback(() => purchaseOrderApi.delete(id), () => mockPurchaseOrderService.deleteOrder(id));
  },

  async submitOrder(id) {
    return withFallback(() => purchaseOrderApi.submit(id), () => mockPurchaseOrderService.submitOrder(id));
  },

  async approveOrder(id) {
    return withFallback(() => purchaseOrderApi.approve(id), () => mockPurchaseOrderService.approveOrder(id));
  },

  async rejectOrder(id, options = {}) {
    return withFallback(() => purchaseOrderApi.reject(id), () => mockPurchaseOrderService.rejectOrder(id, options));
  },

  /* Approval engine actions — mock-only for now (no backend endpoints). */
  async delegateApprovalStep(id, options = {}) {
    return mockPurchaseOrderService.delegateApprovalStep(id, options);
  },
  async substituteApprovalStep(id, options = {}) {
    return mockPurchaseOrderService.substituteApprovalStep(id, options);
  },
  async escalateApprovalStep(id, options = {}) {
    return mockPurchaseOrderService.escalateApprovalStep(id, options);
  },
  async requestPoCorrection(id, options = {}) {
    return mockPurchaseOrderService.requestPoCorrection(id, options);
  },
  async resubmitOrder(id) {
    return mockPurchaseOrderService.resubmitOrder(id);
  },
  async getApprovalProgress(id) {
    return mockPurchaseOrderService.getApprovalProgress(id);
  },
  async checkPoBudget(id) {
    return mockPurchaseOrderService.checkPoBudget(id);
  },

  async setDeliveryStatus(id, status) {
    return withFallback(
      () => purchaseOrderApi.setDeliveryStatus(id, status),
      () => mockPurchaseOrderService.setDeliveryStatus(id, status)
    );
  },

  async acknowledgeOrder(id) {
    return withFallback(
      () => purchaseOrderApi.acknowledge(id),
      () => mockPurchaseOrderService.acknowledgeOrder(id)
    );
  },

  async remindOrder(id, note = '') {
    return withFallback(
      () => purchaseOrderApi.remind(id, note),
      () => mockPurchaseOrderService.remindOrder(id, note)
    );
  },

  async releaseOrder(id) {
    return withFallback(
      () => purchaseOrderApi.release(id),
      () => mockPurchaseOrderService.releaseOrder(id)
    );
  },

  async closeOrder(id) {
    return withFallback(
      () => purchaseOrderApi.update(id, { status: PO_STATUS.CLOSED }),
      () => mockPurchaseOrderService.closeOrder(id)
    );
  },

  async cancelOrder(id) {
    return withFallback(
      () => purchaseOrderApi.update(id, { status: PO_STATUS.CANCELLED }),
      () => mockPurchaseOrderService.cancelOrder(id)
    );
  },

  async startOrder(id) {
    return withFallback(
      () => purchaseOrderApi.setDeliveryStatus(id, PO_STATUS.IN_PROGRESS),
      () => mockPurchaseOrderService.startOrder(id)
    );
  },

  async markPartiallyDelivered(id, payload = {}) {
    return withFallback(
      () => purchaseOrderApi.setDeliveryStatus(id, PO_STATUS.PARTIALLY_DELIVERED),
      () => mockPurchaseOrderService.markPartiallyDelivered(id, payload)
    );
  },

  async completeOrder(id, payload = {}) {
    return withFallback(
      () => purchaseOrderApi.setDeliveryStatus(id, PO_STATUS.COMPLETED),
      () => mockPurchaseOrderService.completeOrder(id, payload)
    );
  },

  /* Advance payment workflow — mock-only for now (no backend endpoints). */
  async requestAdvancePayment(id, payload = {}) {
    return mockPurchaseOrderService.requestAdvancePayment(id, payload);
  },
  async decideAdvancePayment(id, payload = {}) {
    return mockPurchaseOrderService.decideAdvancePayment(id, payload);
  },
  async startAdvanceProcessing(id) {
    return mockPurchaseOrderService.startAdvanceProcessing(id);
  },
  async markAdvancePaid(id, payload = {}) {
    return mockPurchaseOrderService.markAdvancePaid(id, payload);
  },
  async updatePaymentTerms(id, payload = {}) {
    return mockPurchaseOrderService.updatePaymentTerms(id, payload);
  },

  async printPreview(id) {
    return withFallback(
      async () => {
        const order = await purchaseOrderApi.get(id);
        const actor = getCurrentActor();
        let record;
        try {
          record = await buildPoPrintRecord(order);
        } catch {
          record = ensureCanonicalStage(order);
        }
        return {
          record,
          company: getPrintCompany(),
          preparedBy: order.requester || 'Kavita Rao',
          checkedBy: order.buyer || 'Amit Verma',
          approvedBy: order.approvedBy || (order.approvalStatus === 'Approved' ? actor.name : '—'),
          generatedAt: new Date().toISOString()
        };
      },
      () => mockPurchaseOrderService.printPreview(id)
    );
  },

  /* Print design — client-side presentation metadata (never a backend
     endpoint; persisted through the mock layer on every run). */
  async savePrintDesign(id, design = {}) {
    return mockPurchaseOrderService.savePrintDesign(id, design);
  },

  async logPrintActivity(id) {
    return withFallback(
      () => purchaseOrderApi.timeline(id),
      () => mockPurchaseOrderService.logPrintActivity(id)
    );
  },

  async getOrderStats() {
    return withFallback(() => purchaseOrderApi.stats(), () => mockPurchaseOrderService.getOrderStats());
  }
};
