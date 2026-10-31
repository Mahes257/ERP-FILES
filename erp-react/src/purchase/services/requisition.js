/**
 * purchase/services/requisition.js
 * ------------------------------------------------------------------
 * Mock service for the Purchase Requisition workflow. Deterministic
 * in-memory data persisted to localStorage via the lazy collection,
 * with simulated latency so the UI exercises real async loading.
 * ------------------------------------------------------------------
 */
import { APPROVAL_STATUS, PR_APPROVED_GROUP, PR_RECORD_STATE, PR_RFQ_ELIGIBLE, PR_STATUS, REVIEW_STATUS, RFQ_STATUS } from '../constants';
import { nextPRNo, normalizePurchaseRequest } from '../utils/purchase';
import { canApproveRequisitions } from '../utils/access';
import { mockRfqService, rfqsStore } from './rfq';
import { requisitionApi } from './api/requisitionApi';
import { getCurrentActor, withFallback } from './api-client';
import { getStoredUser } from '../../services/authService';
import { clone, countStatus, createCollection, delay, paginate, storageKeys, todayLocal } from './base';
import {
  QUEUE_PAGE_SIZE_DEFAULT,
  buildQueueQuery,
  compareQueueRows,
  isReviewedOn,
  matchesQueueRow
} from '../utils/technicalReviewQueue';
import { REVIEW_STAGE_STATUS, reviewStatusOf } from '../utils/technicalReview';


export { APPROVAL_STATUS, PR_STATUS };

/**
 * PR approval authorization. A pending requisition may only be approved
 * or rejected by a user with PR approval permission (ADMIN role or the
 * PURCHASE_REQUISITION_APPROVAL permission). Enforced inside the service
 * itself, so hiding buttons in the UI is never the only line of defence —
 * direct calls (console, route, manipulated state) are rejected too.
 */
function assertApprover() {
  const actor = getCurrentActor();
  /* Merge the normalized actor's role with the stored user's optional
     permission array, then authorize in a single check. */
  const authorized = canApproveRequisitions({ ...(getStoredUser() || {}), role: actor.role });
  if (!authorized) {
    const error = new Error('Forbidden: only an authorised PR approver can approve or reject requisitions');
    error.status = 403;
    throw error;
  }
  return actor;
}



/** Seed requisitions — returns empty. Real data from the API. */
function buildSeedRequests() {
  return [];
}
/** Lazy, localStorage-backed requisition collection (mock fallback). */
export const requisitionsStore = createCollection(storageKeys.requisitions, buildSeedRequests);

function resolveSortValue(record, key) {
  if (key === 'amount') return Number(record.amount) || 0;
  if (key === 'date' || key === 'expectedDate') return new Date(record[key] || 0).getTime();
  return String(record[key] == null ? '' : record[key]).toLowerCase();
}

export const mockRequisitionService = {
  /** ------------------------------ List / CRUD ----------------------------- */
  async getRequisitions({
    search = '',
    tab = 'active',
    status = 'All',
    department = 'All',
    requester = 'All',
    vendor = 'All',
    priority = 'All',
    project = 'All',
    dateFrom = '',
    dateTo = '',
    page = 1,
    pageSize = 10,
    sortBy = 'createdAt',
    sortDir = 'desc'
  } = {}) {
    await delay();
    const records = requisitionsStore.all;
    const query = String(search).trim().toLowerCase();
    const statusFilter = status === 'All' ? null : status;
    const matchesStatus = (recordStatus) => {
      if (!statusFilter) return true;
      return Array.isArray(statusFilter)
        ? statusFilter.includes(recordStatus)
        : recordStatus === statusFilter;
    };
    const departmentFilter = department === 'All' ? null : department;
    const requesterFilter = requester === 'All' ? null : requester;
    const vendorFilter = vendor === 'All' ? null : vendor;
    const priorityFilter = priority === 'All' ? null : priority;
    const projectFilter = project === 'All' ? null : project;

    let filtered = records.filter((record) => {
      const state = record.recordState || PR_RECORD_STATE.ACTIVE;
      if (tab === 'active' && state !== PR_RECORD_STATE.ACTIVE) return false;
      if (tab === 'archived' && state !== PR_RECORD_STATE.ARCHIVED) return false;
      if (!matchesStatus(record.status)) return false;
      if (departmentFilter && record.department !== departmentFilter) return false;
      if (requesterFilter && record.requester !== requesterFilter) return false;
      if (vendorFilter && record.vendor !== vendorFilter) return false;
      if (priorityFilter && record.priority !== priorityFilter) return false;
      if (projectFilter && record.project !== projectFilter) return false;
      if (dateFrom && record.date && record.date < dateFrom) return false;
      if (dateTo && record.date && record.date > dateTo) return false;
      if (query) {
        const haystack = [
          record.id,
          record.prNo,
          record.title,
          record.requester,
          record.department,
          record.vendor,
          record.priority,
          record.project
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    filtered = [...filtered].sort((a, b) => {
      const aValue = resolveSortValue(a, sortBy);
      const bValue = resolveSortValue(b, sortBy);
      if (aValue === bValue) return 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return sortDir === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

    const result = paginate(filtered, { page, pageSize });
    result.data = result.data.map((record) => {
      const copy = { ...record };
      delete copy.totals;
      return copy;
    });
    return result;
  },

  async getRequisition(id) {
    await delay();
    const record = requisitionsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Requisition not found');
    /* Totals are derived on every read so records persisted before the
       GST-type fix (or edited elsewhere) always carry current-format
       totals — never stale CGST/SGST/IGST components. */
    return clone(normalizePurchaseRequest(record));
  },

  async createRequisition(payload = {}) {
    await delay();
    const records = requisitionsStore.all;
    const prNo = payload.prNo || nextPRNo(records);
    /* Prevent duplicate PR numbers. */
    if (records.some((entry) => entry.prNo === prNo)) {
      throw new Error(`PR number ${prNo} already exists`);
    }
    const now = new Date().toISOString();
    const normalized = normalizePurchaseRequest({
      ...payload,
      id: prNo,
      prNo,
      status: payload.status || PR_STATUS.DRAFT,
      approvalStatus: APPROVAL_STATUS.PENDING,
      createdAt: now,
      date: todayLocal(),
      activity: [
        { type: 'create', label: 'Requisition created', actor: payload.requester || 'Admin', timestamp: now }
      ]
    });
    records.push(normalized);
    requisitionsStore.persist(records);
    return clone(normalized);
  },

  async updateRequisition(id, patch = {}) {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    if (![PR_STATUS.DRAFT, PR_STATUS.RETURNED, PR_STATUS.PENDING_APPROVAL].includes(records[index].status)) {
      throw new Error(`Cannot edit ${records[index].prNo}: only Draft, Returned, or Pending Approval requisitions can be edited`);
    }
    const merged = normalizePurchaseRequest({ ...records[index], ...patch });
    records[index] = merged;
    requisitionsStore.persist(records);
    return clone(merged);
  },

  /** Permanently deletes a requisition from the store.
      Blocks deletion when downstream RFQ records reference this PR. */
  async deleteRequisition(id) {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const target = records[index];
    /* Referential integrity — prevent deletion when an RFQ still
       references this PR via its prNo or reference field. */
    const linkedRfqs = rfqsStore.all.filter(
      (rfq) => (rfq.prNo === target.prNo || rfq.reference === target.prNo)
    );
    if (linkedRfqs.length > 0) {
      const rfqNos = linkedRfqs.map((r) => r.rfqNo).join(', ');
      throw new Error(
        `Cannot delete ${target.prNo}: it is referenced by RFQ(s) ${rfqNos}. ` +
        'Remove the RFQ link first or delete the RFQ(s) before deleting this requisition.'
      );
    }
    const next = records.filter((entry) => entry.id !== id);
    requisitionsStore.persist(next);
    return { id };
  },

  /** Moves a requisition to the Archived tab. */
  async archiveRequisition(id) {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    records[index] = { ...records[index], recordState: PR_RECORD_STATE.ARCHIVED };
    requisitionsStore.persist(records);
    return { id };
  },

  /** ------------------------------ Workflow -------------------------------- */
  async submitRequisition(id) {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status !== PR_STATUS.DRAFT && existing.status !== PR_STATUS.RETURNED) {
      throw new Error('Only draft or returned requisitions can be submitted');
    }
    const now = new Date().toISOString();
    records[index] = normalizePurchaseRequest({
      ...existing,
      status: PR_STATUS.PENDING_APPROVAL,
      activity: [...existing.activity, { type: 'submit', label: 'Submitted for approval', actor: existing.requester, timestamp: now }]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  async approveRequisition(id, note = '') {
    await delay();
    const actor = assertApprover();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status !== PR_STATUS.PENDING_APPROVAL) throw new Error('Only pending requisitions can be approved');
    if (existing.requester === actor.name) {
      throw new Error('A requester cannot approve their own purchase requisition');
    }
    const now = new Date().toISOString();
    records[index] = normalizePurchaseRequest({
      ...existing,
      /* Purchasing approval is no longer terminal — the approved PR moves
         straight into the Technical Specification Review stage. */
      status: PR_STATUS.TECHNICAL_REVIEW,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      approvedBy: actor.name,
      approvalNote: note || existing.approvalNote,
      approvalDate: now,
      activity: [...existing.activity, { type: 'approve', label: `Approved by ${actor.name} · moved to ${PR_STATUS.TECHNICAL_REVIEW}`, actor: actor.name, timestamp: now }]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  async rejectRequisition(id, note = '') {
    await delay();
    const actor = assertApprover();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status !== PR_STATUS.PENDING_APPROVAL) throw new Error('Only pending requisitions can be rejected');
    const now = new Date().toISOString();
    records[index] = normalizePurchaseRequest({
      ...existing,
      status: PR_STATUS.REJECTED,
      approvalStatus: APPROVAL_STATUS.REJECTED,
      approvalNote: note || existing.approvalNote,
      approvalDate: now,
      activity: [...existing.activity, { type: 'reject', label: `Rejected by ${actor.name}`, actor: actor.name, timestamp: now }]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Marks an approved requisition as converted to an RFQ draft (used by
   * the Create RFQ flow after the RFQ has been persisted). Records the
   * generated RFQ number and an `rfq` activity entry. Refuses to convert
   * a PR that is not Approved — in particular a PR already linked to an
   * RFQ or a PO — so one requisition can never produce two RFQs.
   */
  async markConvertedToRfq(id, rfqNo = '') {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status === PR_STATUS.CONVERTED || existing.status === PR_STATUS.PO_RAISED) {
      throw new Error(
        existing.rfqNo
          ? `${existing.prNo} is already linked to RFQ ${existing.rfqNo}`
          : `${existing.prNo} is already ${existing.status}`
      );
    }
    if (!PR_RFQ_ELIGIBLE.includes(existing.status)) {
      throw new Error('Only ready-for-RFQ requisitions can be converted to an RFQ');
    }
    const actor = getCurrentActor();
    const now = new Date().toISOString();
    const linkedRfq = rfqNo || existing.rfqNo || '';
    records[index] = normalizePurchaseRequest({
      ...existing,
      status: PR_STATUS.CONVERTED,
      rfqNo: linkedRfq,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        {
          type: 'rfq',
          label: `Converted to RFQ ${linkedRfq}`,
          actor: actor.name,
          timestamp: now,
          note: `RFQ ${linkedRfq} created from ${existing.prNo}`
        }
      ]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Converts approved requisitions into RFQ drafts. Each selected PR must
   * be in Approved status; converted PRs move to the dedicated Converted
   * state (Converted to RFQ — never PO Raised), record the generated RFQ
   * number and gain an `rfq` activity entry (so the same PR cannot be
   * converted twice). The PR only becomes PO Raised later, when an actual
   * Purchase Order is created. Returns the created RFQs plus per-PR
   * errors so the list can report partial success.
   */
  async convertToRfq(ids = []) {
    await delay();
    const records = requisitionsStore.all;
    const idList = Array.isArray(ids) ? ids : [ids];
    const created = [];
    const errors = [];

    for (const id of idList) {
      const index = records.findIndex((entry) => entry.id === id);
      if (index === -1) {
        errors.push({ id, error: 'Requisition not found' });
        continue;
      }
      const existing = records[index];
      if (!PR_RFQ_ELIGIBLE.includes(existing.status)) {
        errors.push({
          id,
          prNo: existing.prNo,
          error: `${existing.prNo} is ${existing.status} — only ready-for-RFQ requisitions can be converted`
        });
        continue;
      }
      const payload = {
        title: existing.title || `RFQ for ${existing.prNo}`,
        description: existing.notes || '',
        reference: existing.prNo,
        category: existing.items?.[0]?.category || 'General',
        department: existing.department || '',
        project: existing.project || '',
        requester: existing.requester || '',
        buyer: existing.buyer || '',
        priority: existing.priority || 'Medium',
        validity: 30,
        dueDate: existing.expectedDate || '',
        currency: existing.currency || 'INR',
        deliveryAddress: existing.deliveryAddress || existing.branch || '',
        notes: existing.internalNotes || '',
        commercialTerms: { paymentTerms: existing.terms || '30 Days' },
        items: (existing.items || []).map((item) => ({
          /* itemCode keeps the RFQ line linked to its source PR item. */
          itemCode: item.itemCode || '',
          category: item.category || '',
          product: item.product || '',
          hsn: item.hsn || '',
          uom: item.uom || 'Nos',
          qty: Number(item.qty) || 0,
          rate: Number(item.rate) || 0,
          expectedRate: Number(item.rate) || 0,
          specification: item.remarks || '',
          requiredDate: existing.expectedDate || ''
        })),
        attachments: existing.attachments || [],
        status: RFQ_STATUS.DRAFT
      };
      let rfq;
      try {
        rfq = await mockRfqService.createRfq(payload);
      } catch (err) {
        errors.push({ id, prNo: existing.prNo, error: err?.message || 'Failed to create RFQ' });
        continue;
      }
      try {
        await mockRequisitionService.markConvertedToRfq(id, rfq.rfqNo);
      } catch (err) {
        errors.push({ id, prNo: existing.prNo, error: err?.message || 'Failed to link RFQ to requisition' });
        continue;
      }
      created.push(rfq);
    }

    /* markConvertedToRfq() already persisted each successful conversion
       (status, rfqNo, activity entry) against a fresh read of the store.
       Do NOT re-persist the `records` snapshot captured at the top of
       this function — it predates those writes and would silently
       overwrite them back to Approved, allowing a duplicate RFQ to be
       created on a subsequent call for the same PR. */
    return { created, errors };
  },

  /** Approves the technical specification review, moving the requisition
   *  to Ready for RFQ (the state from which it can be converted into an
   *  RFQ draft). Only accepts PRs currently in the Technical Specification
   *  Review stage. */
  async completeTechnicalReview(id, note = '') {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status === PR_STATUS.CONVERTED || existing.status === PR_STATUS.PO_RAISED) {
      throw new Error(
        existing.rfqNo
          ? `${existing.prNo} is already linked to RFQ ${existing.rfqNo}`
          : `${existing.prNo} is already ${existing.status}`
      );
    }
    if (existing.status !== PR_STATUS.TECHNICAL_REVIEW) {
      throw new Error('Only requisitions in technical review can be approved');
    }
    const actor = getCurrentActor();
    const now = new Date().toISOString();
    records[index] = normalizePurchaseRequest({
      ...existing,
      status: PR_STATUS.READY_FOR_RFQ,
      technicalReview: existing.technicalReview
        ? { ...existing.technicalReview, reviewStatus: REVIEW_STATUS.REVIEWED, reviewedBy: actor.name, reviewedAt: now }
        : { specification: '', drawing: '', materialGrade: '', dimensions: '', comments: note || '', reviewStatus: REVIEW_STATUS.REVIEWED, reviewedBy: actor.name, reviewedAt: now },
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'review', label: `Technical review approved · ${PR_STATUS.READY_FOR_RFQ}`, actor: actor.name, timestamp: now, note: note || 'Technical specification approved' }
      ]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  /** Returns a requisition to the requester for changes. Only
   *  permitted from the Technical Specification Review stage — the
   *  requester corrects the PR and re-submits through the normal
   *  approval flow. */
  async returnRequisition(id, note = '') {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status !== PR_STATUS.TECHNICAL_REVIEW) {
      throw new Error('Only requisitions in technical review can be returned');
    }
    const actor = getCurrentActor();
    const now = new Date().toISOString();
    records[index] = normalizePurchaseRequest({
      ...existing,
      status: PR_STATUS.RETURNED,
      activity: [
        ...existing.activity,
        { type: 'return', label: `Returned to requester by ${actor.name}`, actor: actor.name, timestamp: now, note: note || 'Please review and resubmit.' }
      ]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  /** Creates a new Draft copy of an existing requisition. */
  async duplicateRequisition(id) {
    await delay();
    const records = requisitionsStore.all;
    const source = records.find((entry) => entry.id === id);
    if (!source) throw new Error('Requisition not found');
    const prNo = nextPRNo(records);
    const now = new Date().toISOString();
    const normalized = normalizePurchaseRequest({
      ...source,
      id: prNo,
      prNo,
      title: source.title ? `${source.title} (Copy)` : 'Copied requisition',
      status: PR_STATUS.DRAFT,
      approvalStatus: APPROVAL_STATUS.PENDING,
      approvalNote: '',
      approvalDate: '',
      recordState: PR_RECORD_STATE.ACTIVE,
      technicalReview: null,
      comments: [],
      createdAt: now,
      date: todayLocal(),
      activity: [{ type: 'create', label: 'Requisition created (duplicate)', actor: source.requester || 'Admin', timestamp: now }]
    });
    records.push(normalized);
    requisitionsStore.persist(records);
    return clone(normalized);
  },

  /** Persists the technical review for a requisition. The review can
   *  only be recorded while the PR is in the Technical Specification
   *  Review stage — a draft, pending-approval or other status has not
   *  reached the TSR stage yet. */
  async saveTechnicalReview(id, review = {}) {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    if (existing.status !== PR_STATUS.TECHNICAL_REVIEW) {
      throw new Error('Only requisitions in technical review can receive a technical review');
    }
    const actor = getCurrentActor();
    const now = new Date().toISOString();
    const normalizedReview = {
      specification: review.specification || '',
      drawing: review.drawing || '',
      materialGrade: review.materialGrade || '',
      dimensions: review.dimensions || '',
      comments: review.comments || '',
      reviewStatus: review.reviewStatus || REVIEW_STATUS.REVIEWED,
      reviewedBy: actor.name,
      reviewedAt: now
    };
    records[index] = normalizePurchaseRequest({
      ...existing,
      technicalReview: normalizedReview,
      activity: [
        ...existing.activity,
        { type: 'review', label: `Technical review ${normalizedReview.reviewStatus.toLowerCase()}`, actor: actor.name, timestamp: now, note: normalizedReview.comments || undefined }
      ]
    });
    requisitionsStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Requisitions in the Technical Specification Review stage — the review
   * queue. Local data mode mirrors the backend query (same stage scope,
   * same filters, same FIFO ordering) and pages the result, so the screen
   * behaves identically with or without the API.
   */
  async getTechnicalReviewQueue({
    page = 1,
    pageSize = QUEUE_PAGE_SIZE_DEFAULT,
    search = '',
    filters = {},
    kpiActive = null,
    sortKey = null,
    sortDirection = 'asc'
  } = {}) {
    await delay();
    const query = buildQueueQuery({ page, pageSize, search, filters, kpiActive, sortKey, sortDirection });
    const rows = requisitionsStore.all.filter((record) => matchesQueueRow(record, query));
    rows.sort((a, b) => compareQueueRows(a, b, query.sort));
    const start = (query.page - 1) * query.size;
    return {
      data: clone(rows.slice(start, start + query.size)),
      total: rows.length,
      page: query.page,
      pageSize: query.size,
      totalPages: Math.max(1, Math.ceil(rows.length / query.size))
    };
  },

  /**
   * Review-queue KPI counts + filter options for local data mode. Mirrors
   * the backend: the queue figures come from the whole stage, and
   * "Reviewed Today" counts reviews recorded today in any stage.
   */
  async getTechnicalReviewQueueStats() {
    await delay();
    const queue = requisitionsStore.all.filter((record) =>
      matchesQueueRow(record, {})
    );
    const active = requisitionsStore.all.filter(
      (record) => (record.recordState || PR_RECORD_STATE.ACTIVE) === PR_RECORD_STATE.ACTIVE
    );
    const distinct = (values) => [...new Set(values.filter(Boolean))].sort();
    return {
      pendingReview: queue.length,
      reviewedToday: active.filter((record) => isReviewedOn(record.technicalReview?.reviewedAt)).length,
      highPriority: queue.filter((record) => record.priority === 'High' || record.priority === 'Critical').length,
      reviewed: queue.filter((record) => reviewStatusOf(record) === REVIEW_STAGE_STATUS.REVIEWED).length,
      departments: distinct(queue.map((record) => record.department)),
      vendors: distinct(queue.map((record) => record.vendor)),
      assignees: distinct(queue.map((record) => record.buyer))
    };
  },

  /** ------------------------------- Stats ---------------------------------- */
  async getRequisitionStats() {
    await delay();
    const records = requisitionsStore.all;
    const active = records.filter((r) => (r.recordState || PR_RECORD_STATE.ACTIVE) === PR_RECORD_STATE.ACTIVE);
    const byStatus = Object.values(PR_STATUS).reduce((acc, status) => {
      acc[status] = countStatus(active.map((record) => record.status), status);
      return acc;
    }, {});
    return {
      total: active.length,
      value: active.reduce((sum, record) => sum + record.amount, 0),
      totalValue: active.reduce((sum, record) => sum + record.amount, 0),
      byStatus,
      pendingApproval: byStatus[PR_STATUS.PENDING_APPROVAL],
      approved: PR_APPROVED_GROUP.reduce((sum, status) => sum + byStatus[status], 0),
      draft: byStatus[PR_STATUS.DRAFT],
      rejected: byStatus[PR_STATUS.REJECTED],
      converted: byStatus[PR_STATUS.CONVERTED],
      tabs: {
        active: active.length,
        archived: records.filter((r) => r.recordState === PR_RECORD_STATE.ARCHIVED).length
      },
      byCurrency: active.reduce((acc, record) => {
        const key = record.currency || 'INR';
        acc[key] = (acc[key] || 0) + record.amount;
        return acc;
      }, {})
    };
  },

  /** ------------------------------ Detail API ------------------------------ */

  /** Fetches a single requisition (backend-friendly alias of getRequisition). */
  async getById(id) {
    return mockRequisitionService.getRequisition(id);
  },

  /** Creates an editable copy of a requisition (alias of duplicateRequisition). */
  async duplicate(id) {
    return mockRequisitionService.duplicateRequisition(id);
  },

  /** Approves a pending requisition (alias of approveRequisition). */
  async approve(id, note = '') {
    return mockRequisitionService.approveRequisition(id, note);
  },

  /** Rejects a pending requisition (alias of rejectRequisition). */
  async reject(id, note = '') {
    return mockRequisitionService.rejectRequisition(id, note);
  },

  /**
   * Appends a comment to a requisition and records a `comment` activity
   * entry. Returns the updated record.
   */
  async addComment(id, text = '') {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const comment = { id: `cmt-${Date.now()}`, author: 'Current User', text: String(text), createdAt: now };
    const next = normalizePurchaseRequest({
      ...existing,
      comments: [...(Array.isArray(existing.comments) ? existing.comments : []), comment],
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'comment', label: 'Comment added', actor: 'Current User', timestamp: now, note: String(text) }
      ]
    });
    records[index] = next;
    requisitionsStore.persist(records);
    return clone(next);
  },

  /**
   * Builds the vertical timeline for a requisition from its activity
   * stream plus any comments / attachments. `status` on each event is
   * the requisition status after that event (best-effort, mock).
   */
  async getTimeline(id) {
    await delay();
    const record = requisitionsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Requisition not found');

    const events = (record.activity || []).map((entry, index) => {
      /* Status after each event follows the canonical flow — PR approval
         is not terminal, it moves the record into the Technical
         Specification Review stage (approvalStatus APPROVED, status
         TECHNICAL_REVIEW). A 'review' event is the technical-review
         decision: the approved entry moves the PR to Ready for RFQ,
         plain saves leave the lifecycle status unchanged. */
      const statusAfter = {
        create: PR_STATUS.DRAFT,
        submit: PR_STATUS.PENDING_APPROVAL,
        approve: PR_STATUS.TECHNICAL_REVIEW,
        reject: PR_STATUS.REJECTED,
        return: PR_STATUS.RETURNED,
        po: PR_STATUS.PO_RAISED,
        rfq: PR_STATUS.CONVERTED
      }[entry.type];
      const resolvedStatus =
        entry.type === 'review'
          ? (String(entry.label || '').includes('approved') ? PR_STATUS.READY_FOR_RFQ : record.status)
          : (statusAfter || record.status);
      return {
        id: entry.id || `${record.id}-evt-${index + 1}`,
        type: entry.type,
        label: entry.label,
        actor: entry.actor || 'System',
        timestamp: entry.timestamp,
        note: entry.note || '',
        status: resolvedStatus
      };
    });

    (record.comments || []).forEach((comment, index) => {
      events.push({
        id: comment.id || `${record.id}-cmt-${index + 1}`,
        type: 'comment',
        label: 'Comment added',
        actor: comment.author || 'Current User',
        timestamp: comment.createdAt,
        note: comment.text,
        status: record.status
      });
    });

    (record.attachments || []).forEach((attachment, index) => {
      events.push({
        id: `att-${index + 1}`,
        type: 'attachment',
        label: 'Attachment uploaded',
        actor: 'Current User',
        timestamp: record.createdAt,
        note: attachment.name || 'File',
        status: record.status
      });
    });

    return {
      id,
      prNo: record.prNo,
      events: events.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0))
    };
  },

  /**
   * Builds the audit log for a requisition. Entries carry old/new
   * values plus a deterministic (mock) IP and device per event.
   */
  async getActivity(id) {
    await delay();
    const record = requisitionsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Requisition not found');

    const mockIps = ['10.20.4.15', '10.20.4.23', '10.20.5.7', '172.16.8.12', '10.20.4.31'];
    const mockDevices = ['Chrome 126 · Windows 11', 'Chrome 126 · macOS 14', 'Edge 126 · Windows 11', 'Firefox 127 · Windows 11'];
    /* Audit old/new values follow the canonical flow: approval moves the
       PR from Pending Approval into Technical Specification Review (the
       record's approvalStatus becomes Approved, not its lifecycle
       status), and PO Raised only follows a Converted-to-RFQ record. */
    const changeFor = {
      create: { oldValue: '', newValue: PR_STATUS.DRAFT },
      submit: { oldValue: PR_STATUS.DRAFT, newValue: PR_STATUS.PENDING_APPROVAL },
      approve: { oldValue: PR_STATUS.PENDING_APPROVAL, newValue: PR_STATUS.TECHNICAL_REVIEW },
      reject: { oldValue: PR_STATUS.PENDING_APPROVAL, newValue: PR_STATUS.REJECTED },
      return: { oldValue: '', newValue: PR_STATUS.RETURNED },
      po: { oldValue: PR_STATUS.CONVERTED, newValue: PR_STATUS.PO_RAISED },
      rfq: { oldValue: PR_STATUS.READY_FOR_RFQ, newValue: PR_STATUS.CONVERTED }
    };

    const entries = (record.activity || []).map((entry, index) => {
      const change = changeFor[entry.type] || { oldValue: '', newValue: entry.note || '' };
      return {
        id: entry.id || `${record.id}-act-${index + 1}`,
        date: entry.timestamp,
        user: entry.actor || 'System',
        action: entry.label || entry.type,
        oldValue: change.oldValue,
        newValue: change.newValue,
        ip: mockIps[index % mockIps.length],
        device: mockDevices[index % mockDevices.length],
        remarks: entry.note || ''
      };
    });

    return { id, prNo: record.prNo, entries };
  },

  /**
   * Returns a ready-to-render print document: requisition record plus
   * company profile and signature placeholders.
   */
  async printPreview(id) {
    await delay();
    const record = requisitionsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Requisition not found');
    const actor = getCurrentActor();
    return {
      /* Re-normalize so the printed tax split (IGST vs CGST/SGST) is
         always derived from the record's current GST type. */
      record: clone(normalizePurchaseRequest(record)),
      company: {
        name: 'ABC Manufacturing Pvt Ltd',
        address: 'Plot 42, MIDC Industrial Area, Pune, Maharashtra 411026',
        gstin: '27AAACA1234A1Z5',
        phone: '+91 20 4890 1200',
        email: 'procurement@abcmfg.example'
      },
      preparedBy: record.requester || '—',
      checkedBy: record.buyer || 'Kavita Rao',
      approvedBy: record.approvalStatus === APPROVAL_STATUS.APPROVED ? actor.name : '—',
      generatedAt: new Date().toISOString()
    };
  },

  /**
   * Records a `print` activity entry after the requisition PDF has been
   * exported from the print preview page (so the timeline reflects it).
   * The PDF itself is generated from the preview DOM (utils/export.js),
   * keeping print preview and PDF on a single shared template.
   */
  async logPrintActivity(id) {
    await delay();
    const records = requisitionsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Requisition not found');
    const existing = records[index];
    const now = new Date().toISOString();
    records[index] = normalizePurchaseRequest({
      ...existing,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'print', label: 'PDF exported', actor: 'Current User', timestamp: now, note: existing.prNo }
      ]
    });
    requisitionsStore.persist(records);
    return { ok: true, prNo: existing.prNo };
  }
};

/**
 * API-first requisition service facade.
 *
 * Calls the real Spring Boot API through the shared Axios client; if
 * the backend is unreachable (network error) it gracefully falls back
 * to the mock implementation above, so the UI never breaks offline.
 * The public interface is IDENTICAL to the mock's, so components are
 * untouched.
 */
/**
 * Client-side recordState filter applied to API results so that
 * soft-deleted / archived records never leak into the wrong tab
 * regardless of the backend's query handling.
 */
function applyTabFilter(result, tab) {
  if (!tab || !result || !Array.isArray(result.data)) return result;
  const filtered = result.data.filter((record) => {
    if (tab === 'active' && (record.recordState || PR_RECORD_STATE.ACTIVE) !== PR_RECORD_STATE.ACTIVE) return false;
    if (tab === 'archived' && record.recordState !== PR_RECORD_STATE.ARCHIVED) return false;
    return true;
  });
  /* The backend already applies the record-state filter, so this is a
     safety net that normally removes nothing. In that case the whole
     response — including its pagination totals — must pass through
     untouched: replacing `total` with the current page's row count
     would cap every list at a single page (the page size clamps the
     "of N" readout and the total-pages calculation). */
  if (filtered.length === result.data.length) return result;
  const removed = result.data.length - filtered.length;
  const total = Math.max(0, (Number(result.total) || result.data.length) - removed);
  const pageSize = Number(result.pageSize) || filtered.length || 1;
  return {
    ...result,
    data: filtered,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize))
  };
}

export const requisitionService = {
  async getNextRequisitionNumber() {
    return withFallback(
      async () => {
        const result = await requisitionApi.nextNumber();
        return result?.prNo || result?.nextNumber || result;
      },
      async () => nextPRNo(requisitionsStore.all)
    );
  },

  async getRequisitions(options = {}) {
    return withFallback(
      async () => {
        const result = await requisitionApi.list(options);
        return applyTabFilter(result, options.tab);
      },
      () => mockRequisitionService.getRequisitions(options)
    );
  },

  async getRequisition(id) {
    return withFallback(
      () => requisitionApi.get(id),
      () => mockRequisitionService.getRequisition(id)
    );
  },

  async createRequisition(payload = {}) {
    return withFallback(
      () => requisitionApi.create(payload),
      () => mockRequisitionService.createRequisition(payload)
    );
  },

  async updateRequisition(id, patch = {}) {
    return withFallback(
      () => requisitionApi.update(id, patch),
      () => mockRequisitionService.updateRequisition(id, patch)
    );
  },

  async deleteRequisition(id) {
    return withFallback(
      () => requisitionApi.delete(id),
      () => mockRequisitionService.deleteRequisition(id)
    );
  },

  async archiveRequisition(id) {
    return withFallback(
      () => requisitionApi.archive(id),
      () => mockRequisitionService.archiveRequisition(id)
    );
  },

  async submitRequisition(id) {
    return withFallback(
      () => requisitionApi.submit(id),
      () => mockRequisitionService.submitRequisition(id)
    );
  },

  async approveRequisition(id, note = '') {
    return withFallback(
      () => requisitionApi.approve(id, note),
      () => mockRequisitionService.approveRequisition(id, note)
    );
  },

  async rejectRequisition(id, note = '') {
    return withFallback(
      () => requisitionApi.reject(id, note),
      () => mockRequisitionService.rejectRequisition(id, note)
    );
  },

  /** Marks one approved PR as converted to a specific RFQ (Create RFQ flow). */
  async markConvertedToRfq(id, rfqNo = '') {
    return withFallback(
      () => requisitionApi.markConvertedToRfq(id, rfqNo),
      () => mockRequisitionService.markConvertedToRfq(id, rfqNo)
    );
  },

  async convertToRfq(ids = []) {
    return withFallback(() => requisitionApi.convertToRfq(ids), () => mockRequisitionService.convertToRfq(ids));
  },

  async returnRequisition(id, note = '') {
    return withFallback(
      () => requisitionApi.returnToRequester(id, note),
      () => mockRequisitionService.returnRequisition(id, note)
    );
  },

  /** Approves the technical specification review (Ready for RFQ). */
  async completeTechnicalReview(id, note = '') {
    return withFallback(
      () => requisitionApi.completeTechnicalReview(id, note),
      () => mockRequisitionService.completeTechnicalReview(id, note)
    );
  },

  async duplicateRequisition(id) {
    return withFallback(
      () => requisitionApi.duplicate(id),
      () => mockRequisitionService.duplicateRequisition(id)
    );
  },

  async saveTechnicalReview(id, review = {}) {
    return withFallback(
      () => requisitionApi.saveTechnicalReview(id, review),
      () => mockRequisitionService.saveTechnicalReview(id, review)
    );
  },

  /**
   * Technical Specification Review queue — ONE bounded page.
   *
   * The queue used to pull 500 requisitions and filter/paginate them in the
   * browser (which also made the KPI counts depend on an arbitrary window of
   * rows). The backend now owns the stage scope, every filter, the ordering
   * and the counts, and returns exactly the page being shown.
   */
  async getTechnicalReviewQueue(options = {}) {
    return withFallback(
      () => requisitionApi.technicalReviewQueue(options),
      () => mockRequisitionService.getTechnicalReviewQueue(options)
    );
  },

  /** Review-queue KPI counts + filter options (database counts). */
  async getTechnicalReviewQueueStats() {
    return withFallback(
      () => requisitionApi.technicalReviewQueueStats(),
      () => mockRequisitionService.getTechnicalReviewQueueStats()
    );
  },

  async getRequisitionStats() {
    return withFallback(
      () => requisitionApi.stats(),
      () => mockRequisitionService.getRequisitionStats()
    );
  },

  async getById(id) {
    return requisitionService.getRequisition(id);
  },

  async duplicate(id) {
    return requisitionService.duplicateRequisition(id);
  },

  async approve(id, note = '') {
    return requisitionService.approveRequisition(id, note);
  },

  async reject(id, note = '') {
    return requisitionService.rejectRequisition(id, note);
  },

  async addComment(id, text = '') {
    return withFallback(
      () => requisitionApi.addComment(id, text),
      () => mockRequisitionService.addComment(id, text)
    );
  },

  async getTimeline(id) {
    return withFallback(
      async () => {
        const result = await requisitionApi.activity(id);
        /* Backend returns a plain array; the Timeline component expects
           { id, events } or similar envelope. Wrap the array. */
        if (Array.isArray(result)) {
          return { id, events: result };
        }
        return result;
      },
      () => mockRequisitionService.getTimeline(id)
    );
  },

  async getActivity(id) {
    return withFallback(
      async () => {
        const [result, record] = await Promise.all([
          requisitionApi.activity(id),
          requisitionApi.get(id).catch(() => null),
        ]);
        /* The backend activity endpoint returns a plain array of entries,
           but downstream components (PurchaseRequisitionActivity) expect
           the { id, prNo, entries } envelope the mock service returns.
           Normalise the API array into that shape. */
        if (Array.isArray(result)) {
          return { id, prNo: record?.prNo || '', entries: result };
        }
        return result;
      },
      () => mockRequisitionService.getActivity(id)
    );
  },

  async printPreview(id) {
    return withFallback(
      async () => {
        const record = await requisitionApi.get(id);
        return {
          record,
          company: {
            name: 'ABC Manufacturing Pvt Ltd',
            address: 'Plot 42, MIDC Industrial Area, Pune, Maharashtra 411026',
            gstin: '27AAACA1234A1Z5',
            phone: '+91 20 4890 1200',
            email: 'procurement@abcmfg.example'
          },
          preparedBy: record.requester || '—',
          checkedBy: record.buyer || 'Kavita Rao',
          approvedBy:
            record.approvedBy ||
            (record.approvalStatus === APPROVAL_STATUS.APPROVED ? getCurrentActor().name : '—'),
          generatedAt: new Date().toISOString()
        };
      },
      () => mockRequisitionService.printPreview(id)
    );
  },

  async logPrintActivity(id) {
    return withFallback(
      () => requisitionApi.addComment(id, 'PDF exported'),
      () => mockRequisitionService.logPrintActivity(id)
    );
  }
};
