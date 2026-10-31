/**
 * purchase/services/rfqFollowUp.js
 * ------------------------------------------------------------------
 * RFQ Follow-ups — a tracking layer ON TOP of the existing RFQ data.
 * Follow-ups are user-created reminders that reference an existing
 * RFQ (by rfqNo — never a duplicate RFQ). They answer "which RFQs
 * need follow-up today or soon?" without touching the RFQ workflow.
 *
 * Data persists to localStorage via the shared lazy collection. Each
 * follow-up stores its own type / due date / priority / assignee /
 * notes / reminder plus a full activity trail; RFQ fields (title,
 * status, requester) are DERIVED at read time from the live RFQ
 * store, so the page always reflects the current RFQ state and the
 * sidebar badge stays a single source of truth.
 *
 * Status model:
 *   workflowStatus  Pending | Completed | Cancelled  (the record's
 *                   own lifecycle — drives the sidebar "open" count)
 *   status          the DISPLAY bucket derived at read time:
 *                   Overdue | Due Today | Upcoming | Completed |
 *                   Cancelled — drives the Status column, badge
 *                   tone, tabs and the status filter.
 * ------------------------------------------------------------------
 */
import { USERS } from '../constants';
import { safeGetTime } from '../utils/helpers';
import { getCurrentActor, isApiMode, withFallback } from './api-client';
import { clone, createCollection, delay, paginate, storageKeys, todayLocal } from './base';
import { rfqApi } from './api/rfqApi';
import { rfqFollowUpApi } from './api/rfqFollowUpApi';
/* Circular with ./rfq (which imports ensureSentFollowUp below) is safe:
   the stores are only touched at call time, never at module evaluation. */
import { QUOTATION_STATUS, quotationsStore, rfqsStore } from './rfq';

/** Follow-up types (the situations this page tracks). */
export const FOLLOWUP_TYPES = [
  'Vendor Response Pending',
  'Quotation Due Soon',
  'Quotation Overdue',
  'Vendor Has Not Responded',
  'Quotation Received — Review Pending',
  'Evaluation Pending',
  'Supplier Selection Pending',
  'RFQ Approval Pending'
];

/** Follow-up workflow lifecycle (the record's own state). */
export const FOLLOWUP_STATUS = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

/** Display buckets — derived from the due date relative to today. */
export const FOLLOWUP_BUCKET = {
  OVERDUE: 'Overdue',
  DUE_TODAY: 'Due Today',
  UPCOMING: 'Upcoming',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled'
};

/** Bucket ordering used when sorting by status. */
const BUCKET_ORDER = {
  [FOLLOWUP_BUCKET.OVERDUE]: 0,
  [FOLLOWUP_BUCKET.DUE_TODAY]: 1,
  [FOLLOWUP_BUCKET.UPCOMING]: 2,
  [FOLLOWUP_BUCKET.COMPLETED]: 3,
  [FOLLOWUP_BUCKET.CANCELLED]: 4
};

function nowIso() {
  return new Date().toISOString();
}

function activityEntry(type, label, note = '') {
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


/** Local-date ISO helper: today shifted by `days` (no timezone drift). */
function shiftDate(days) {
  const date = new Date(`${todayLocal()}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Next follow-up number (FU-YYYY-NNNN) above the highest stored one. */
function nextFollowUpNo(records) {
  const year = new Date().getFullYear();
  const highest = records.reduce((max, record) => {
    const match = /^FU-(\d{4})-(\d+)$/.exec(String(record.followUpNo || record.id || ''));
    if (!match || Number(match[1]) !== year) return max;
    return Math.max(max, Number(match[2]));
  }, 0);
  return `FU-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/**
 * Seed follow-ups derived from the LIVE RFQ store — one per workflow
 * situation the page tracks, with dates relative to today so the
 * Overdue / Due Today / Upcoming / Completed buckets are all
 * populated when the demo first loads. Nothing is hardcoded: the
 * counts come from these records (which reference real RFQs).
 */
/** Seed follow-ups — returns empty. */
function followUpSeed() {
  return [];
}

/** Lazy, localStorage-backed follow-up collection. */
export const rfqFollowUpsStore = createCollection(storageKeys.rfqFollowUps, followUpSeed);

function toFilterValue(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

/**
 * Derives the display status bucket and live RFQ fields for a stored
 * record. Completed / Cancelled records always show their own bucket
 * (their old due date must never surface them as Overdue).
 */
function enrichRecord(record) {
  const rfq = rfqsStore.all.find((entry) => entry.rfqNo === record.rfqNo);
  const today = todayLocal();
  const due = record.followUpDate || '';
  let bucket;
  if (record.status === FOLLOWUP_STATUS.COMPLETED) bucket = FOLLOWUP_BUCKET.COMPLETED;
  else if (record.status === FOLLOWUP_STATUS.CANCELLED) bucket = FOLLOWUP_BUCKET.CANCELLED;
  else if (due && due < today) bucket = FOLLOWUP_BUCKET.OVERDUE;
  else if (due === today) bucket = FOLLOWUP_BUCKET.DUE_TODAY;
  else bucket = FOLLOWUP_BUCKET.UPCOMING;
  return {
    ...record,
    rfqId: rfq?.id || null,
    rfqTitle: rfq?.title || '',
    rfqStatus: rfq?.status || '',
    requester: rfq?.requester || '',
    workflowStatus: record.status || FOLLOWUP_STATUS.PENDING,
    /* Display bucket — the Status column / tabs / status filter key. */
    status: bucket,
    dueDate: record.followUpDate,
    nextFollowUp: record.followUpDate || null
  };
}

const OPEN = (record) => record.workflowStatus === FOLLOWUP_STATUS.PENDING;

/** Chase window when the RFQ has no usable due date (or it already passed). */
const AUTO_FOLLOWUP_DEFAULT_DAYS = 7;

/**
 * Auto-creates a "Vendor Response Pending" follow-up when an RFQ is
 * sent to vendors but has NO responses yet — the business rule behind
 * the Follow-ups page ("which RFQs need follow-up today or soon?").
 *
 * Idempotent: skips when the RFQ already has an open follow-up for
 * this situation, so repeated sends / refreshes never create
 * duplicates. The due date follows the RFQ's own closing date when it
 * is still ahead, otherwise a sensible chase window. Direct store
 * operation (no simulated latency) so sendRfq stays snappy.
 */
export function ensureSentFollowUp(rfq) {
  if (!rfq?.rfqNo) return null;

  /* Only RFQs with NO received responses need the vendor-response
     reminder — a quote already on file means the chase is moot. */
  const hasResponses = quotationsStore.all.some(
    (quote) =>
      quote.rfqNo === rfq.rfqNo &&
      [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(quote.status)
  );
  if (hasResponses) return null;

  const records = rfqFollowUpsStore.all;
  /* Dedupe — never stack a second vendor-response reminder on an RFQ
     that already carries an open one. */
  const existing = records.find(
    (record) =>
      record.rfqNo === rfq.rfqNo &&
      record.status === FOLLOWUP_STATUS.PENDING &&
      record.type === FOLLOWUP_TYPES[0]
  );
  if (existing) return null;

  const followUpNo = nextFollowUpNo(records);
  const now = nowIso();
  const due =
    rfq.dueDate && rfq.dueDate >= todayLocal()
      ? rfq.dueDate
      : shiftDate(AUTO_FOLLOWUP_DEFAULT_DAYS);
  const record = {
    id: followUpNo,
    followUpNo,
    rfqNo: rfq.rfqNo,
    vendor: rfq.vendors?.[0] || '',
    type: FOLLOWUP_TYPES[0],
    status: FOLLOWUP_STATUS.PENDING,
    followUpDate: due,
    followUpTime: '10:00',
    priority: rfq.priority || 'Medium',
    assignedTo: rfq.buyer || rfq.requester || '',
    notes: `Auto-created: ${rfq.rfqNo} sent to ${rfq.vendorCount || (rfq.vendors || []).length || 0} vendor(s) — awaiting responses.`,
    reminder: true,
    lastContact: null,
    createdAt: now,
    updatedAt: now,
    autoCreated: true,
    activity: [
      activityEntry(
        'create',
        `${followUpNo} created for ${rfq.rfqNo} — awaiting vendor responses`,
        'Auto-created when the RFQ was sent to vendors'
      )
    ]
  };
  records.push(record);
  rfqFollowUpsStore.persist(records);
  return clone(record);
}

export const mockRfqFollowUpService = {
  /** Paginated follow-up list with search + filters + sorting. */
  async getFollowUps({
    search = '',
    status = 'All',
    type = 'All',
    priority = 'All',
    vendor = 'All',
    assignedTo = 'All',
    rfqStatus = 'All',
    dateFrom = '',
    dateTo = '',
    lifecycle = 'active',
    page = 1,
    pageSize = 10,
    sortBy = 'followUpDate',
    sortDir = 'asc'
  } = {}) {
    await delay();
    const records = isApiMode()
      ? (await rfqFollowUpApi.list({ page: 1, pageSize: 1000 })).data
      : rfqFollowUpsStore.all.map(enrichRecord);
    const query = String(search).trim().toLowerCase();
    const statusFilter = toFilterValue(status);
    const typeFilter = toFilterValue(type);
    const priorityFilter = toFilterValue(priority);
    const vendorFilter = toFilterValue(vendor);
    const assignedFilter = toFilterValue(assignedTo);
    const rfqStatusFilter = toFilterValue(rfqStatus);

    const lifecycleView = lifecycle || 'active';
    let filtered = records.filter((record) => {
      /* Lifecycle filter: active excludes archived/deleted; deleted shows
         only deleted; archived shows only archived. */
      const recordState = record.recordState || 'active';
      if (lifecycleView === 'active' && recordState !== 'active') return false;
      if (lifecycleView === 'deleted' && recordState !== 'deleted') return false;
      if (lifecycleView === 'archived' && recordState !== 'archived') return false;
      if (statusFilter && record.status !== statusFilter) return false;
      if (typeFilter && record.type !== typeFilter) return false;
      if (priorityFilter && record.priority !== priorityFilter) return false;
      if (vendorFilter && record.vendor !== vendorFilter) return false;
      if (assignedFilter && record.assignedTo !== assignedFilter) return false;
      if (rfqStatusFilter && record.rfqStatus !== rfqStatusFilter) return false;
      if (dateFrom && record.followUpDate < dateFrom) return false;
      if (dateTo && record.followUpDate > dateTo) return false;
      if (query) {
        const haystack = [
          record.rfqNo, record.rfqTitle, record.vendor, record.requester,
          record.type, record.notes, record.assignedTo
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    const STRING_SORT_KEYS = ['rfqNo', 'rfqTitle', 'vendor', 'requester', 'type', 'priority', 'assignedTo'];
    const DATE_SORT_KEYS = ['followUpDate', 'dueDate', 'nextFollowUp', 'lastContact', 'createdAt'];
    const sortable = [...STRING_SORT_KEYS, ...DATE_SORT_KEYS, 'status'];
    const safeKey = sortable.includes(sortBy) ? sortBy : 'followUpDate';
    filtered = [...filtered].sort((a, b) => {
      let aValue;
      let bValue;
      if (safeKey === 'status') {
        aValue = BUCKET_ORDER[a.status] ?? 9;
        bValue = BUCKET_ORDER[b.status] ?? 9;
      } else if (DATE_SORT_KEYS.includes(safeKey)) {
        aValue = safeGetTime(a[safeKey]);
        bValue = safeGetTime(b[safeKey]);
      } else {
        aValue = String(a[safeKey] || '');
        bValue = String(b[safeKey] || '');
      }
      if (aValue === bValue) return 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDir === 'asc' ? aValue - bValue : bValue - aValue;
      }
      return sortDir === 'asc'
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

    return paginate(filtered, { page, pageSize });
  },

  /** Single follow-up (enriched). */
  async getFollowUp(id) {
    if (isApiMode()) {
      const page = await rfqFollowUpApi.list({ page: 1, pageSize: 1000 });
      const record = page.data.find((entry) => String(entry.id) === String(id) || entry.followUpNo === id);
      if (!record) {
        const error = new Error('Follow-up not found');
        error.status = 404;
        throw error;
      }
      return record;
    }
    await delay();
    const record = rfqFollowUpsStore.all.find((entry) => entry.id === id || entry.followUpNo === id);
    if (!record) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    return clone(enrichRecord(record));
  },

  /** Existing RFQs for the create/edit modal's RFQ selector. */
  async getRfqOptions() {
    await delay();
    return clone(
      rfqsStore.all.map((rfq) => ({
        id: rfq.id,
        rfqNo: rfq.rfqNo,
        title: rfq.title,
        vendors: rfq.vendors || [],
        requester: rfq.requester || '',
        buyer: rfq.buyer || '',
        priority: rfq.priority || 'Medium',
        dueDate: rfq.dueDate || '',
        status: rfq.status || ''
      }))
    );
  },

  /** KPI + tab + sidebar counts — derived from the records, nothing hardcoded. */
  async getFollowUpStats() {
    if (isApiMode()) return rfqFollowUpApi.stats();
    await delay();
    const records = rfqFollowUpsStore.all.map(enrichRecord);
    const isActive = (record) => (record.recordState || 'active') === 'active';
    const isArchived = (record) => record.recordState === 'archived';
    const isDeleted = (record) => record.recordState === 'deleted';
    return {
      total: records.length,
      /* Active = records with recordState 'active' (default when unset).
         Deleted/Archived records are excluded — they live in their own
         lifecycle tabs. Completed / cancelled records are still "active"
         records (they have a workflow status, not a lifecycle state). */
      active: records.filter(isActive).length,
      archived: records.filter(isArchived).length,
      deleted: records.filter(isDeleted).length,
      pending: records.filter((record) => isActive(record) && OPEN(record)).length,
      overdue: records.filter((record) => isActive(record) && record.status === FOLLOWUP_BUCKET.OVERDUE).length,
      dueToday: records.filter((record) => isActive(record) && record.status === FOLLOWUP_BUCKET.DUE_TODAY).length,
      upcoming: records.filter((record) => isActive(record) && record.status === FOLLOWUP_BUCKET.UPCOMING).length,
      completed: records.filter((record) => isActive(record) && record.status === FOLLOWUP_BUCKET.COMPLETED).length
    };
  },

  /** Users available for the Assigned To field (project user master). */
  async getUsers() {
    await delay();
    return clone(USERS);
  },

  /** Creates a follow-up against an EXISTING RFQ (never a new RFQ). */
  async createFollowUp(payload = {}) {
    if (isApiMode()) return rfqFollowUpApi.create(payload);
    await delay();
    const rfq = rfqsStore.all.find((entry) => entry.rfqNo === payload.rfqNo);
    if (!rfq) {
      const error = new Error('Select an existing RFQ for the follow-up');
      error.status = 400;
      throw error;
    }
    const records = rfqFollowUpsStore.all;
    const followUpNo = payload.followUpNo || nextFollowUpNo(records);
    /* Prevent duplicate Follow-up numbers. */
    if (records.some((entry) => entry.followUpNo === followUpNo)) {
      throw new Error(`Follow-up number ${followUpNo} already exists`);
    }
    const actor = getCurrentActor();
    const now = nowIso();
    const record = {
      id: followUpNo,
      followUpNo,
      rfqNo: payload.rfqNo,
      vendor: payload.vendor || rfq.vendors?.[0] || '',
      type: payload.type || FOLLOWUP_TYPES[0],
      status: FOLLOWUP_STATUS.PENDING,
      followUpDate: payload.followUpDate || '',
      followUpTime: payload.followUpTime || '10:00',
      priority: payload.priority || rfq.priority || 'Medium',
      assignedTo: payload.assignedTo || actor.name || rfq.buyer || '',
      notes: payload.notes || '',
      reminder: Boolean(payload.reminder),
      lastContact: payload.lastContact || null,
      createdAt: now,
      updatedAt: now,
      activity: [activityEntry('create', `${followUpNo} created for ${payload.rfqNo}`)]
    };
    records.push(record);
    rfqFollowUpsStore.persist(records);
    return clone(enrichRecord(record));
  },

  /** General edit of a follow-up's own fields. */
  async updateFollowUp(id, payload = {}) {
    if (isApiMode()) return rfqFollowUpApi.update(id, payload);
    await delay();
    const records = rfqFollowUpsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.followUpNo === id);
    if (index === -1) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    const existing = records[index];
    const next = {
      ...existing,
      vendor: payload.vendor ?? existing.vendor,
      type: payload.type ?? existing.type,
      followUpDate: payload.followUpDate ?? existing.followUpDate,
      followUpTime: payload.followUpTime ?? existing.followUpTime,
      priority: payload.priority ?? existing.priority,
      assignedTo: payload.assignedTo ?? existing.assignedTo,
      notes: payload.notes ?? existing.notes,
      reminder: payload.reminder ?? existing.reminder,
      status: payload.status ?? existing.status,
      updatedAt: nowIso()
    };
    /* Re-opening a completed / cancelled follow-up (status back to
       Pending) clears its lifecycle timestamps so it is genuinely
       active again; moving to a terminal state stamps the matching
       lifecycle fields. The sidebar "active" count derives from the
       status, so the badge reacts immediately. */
    if (next.status === FOLLOWUP_STATUS.PENDING) {
      delete next.completedAt;
      delete next.completedBy;
      delete next.cancelledAt;
      delete next.cancelledBy;
    } else if (next.status === FOLLOWUP_STATUS.COMPLETED) {
      const actor = getCurrentActor();
      next.completedAt = next.completedAt || nowIso();
      next.completedBy = next.completedBy || actor.name || 'System';
      delete next.cancelledAt;
      delete next.cancelledBy;
    } else if (next.status === FOLLOWUP_STATUS.CANCELLED) {
      const actor = getCurrentActor();
      next.cancelledAt = next.cancelledAt || nowIso();
      next.cancelledBy = next.cancelledBy || actor.name || 'System';
      delete next.completedAt;
      delete next.completedBy;
    }
    next.activity = [
      ...(Array.isArray(existing.activity) ? existing.activity : []),
      activityEntry(
        'update',
        existing.status && next.status !== existing.status
          ? `${next.followUpNo} status changed from ${existing.status} to ${next.status}`
          : `${next.followUpNo} updated`
      )
    ];
    records[index] = next;
    rfqFollowUpsStore.persist(records);
    return clone(enrichRecord(next));
  },

  /** Marks a pending follow-up completed. */
  async completeFollowUp(id) {
    if (isApiMode()) return rfqFollowUpApi.complete(id);
    await delay();
    const records = rfqFollowUpsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.followUpNo === id);
    if (index === -1) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    const existing = records[index];
    if (existing.status !== FOLLOWUP_STATUS.PENDING) {
      const error = new Error('Only pending follow-ups can be completed');
      error.status = 400;
      throw error;
    }
    const now = nowIso();
    const actor = getCurrentActor();
    const next = {
      ...existing,
      status: FOLLOWUP_STATUS.COMPLETED,
      completedAt: now,
      completedBy: actor.name || 'System',
      updatedAt: now
    };
    next.activity = [
      ...(Array.isArray(existing.activity) ? existing.activity : []),
      activityEntry('complete', `${next.followUpNo} marked completed`)
    ];
    records[index] = next;
    rfqFollowUpsStore.persist(records);
    return clone(enrichRecord(next));
  },

  /** Moves a pending follow-up to a new date/time. */
  async rescheduleFollowUp(id, followUpDate, followUpTime) {
    /* API mode: `PUT /rfq-follow-ups/{id}` applies the WHOLE record — any
       field left out falls back to a default — so the stored values are
       merged in rather than sending a date-only payload that would wipe
       notes, assignee and priority. The pending-only rule is preserved. */
    if (isApiMode()) {
      if (!followUpDate) {
        const error = new Error('Follow-up date is required');
        error.status = 400;
        throw error;
      }
      const page = await rfqFollowUpApi.list({ page: 1, pageSize: 200 });
      const existing = (page.data || []).find(
        (row) => String(row.id) === String(id) || row.followUpNo === id
      );
      if (!existing) {
        const error = new Error('Follow-up not found');
        error.status = 404;
        throw error;
      }
      if (existing.workflowStatus && existing.workflowStatus !== 'Pending') {
        const error = new Error('Only pending follow-ups can be rescheduled');
        error.status = 400;
        throw error;
      }
      return rfqFollowUpApi.update(existing.id, {
        vendor: existing.vendor,
        type: existing.type,
        followUpDate,
        followUpTime: followUpTime || existing.followUpTime || '10:00',
        priority: existing.priority,
        assignedTo: existing.assignedTo,
        notes: existing.notes,
        reminder: existing.reminder
      });
    }
    await delay();
    if (!followUpDate) {
      const error = new Error('Follow-up date is required');
      error.status = 400;
      throw error;
    }
    const records = rfqFollowUpsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.followUpNo === id);
    if (index === -1) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    const existing = records[index];
    if (existing.status !== FOLLOWUP_STATUS.PENDING) {
      const error = new Error('Only pending follow-ups can be rescheduled');
      error.status = 400;
      throw error;
    }
    const now = nowIso();
    const next = {
      ...existing,
      followUpDate,
      followUpTime: followUpTime || existing.followUpTime || '10:00',
      updatedAt: now
    };
    next.activity = [
      ...(Array.isArray(existing.activity) ? existing.activity : []),
      activityEntry('reschedule', `${next.followUpNo} rescheduled to ${followUpDate}`)
    ];
    records[index] = next;
    rfqFollowUpsStore.persist(records);
    return clone(enrichRecord(next));
  },

  /** Cancels a pending follow-up — the follow-up is no longer
   *  actionable and leaves the sidebar "open" count (the referenced
   *  RFQ is never touched). One-way: only pending follow-ups can be
   *  cancelled. */
  async cancelFollowUp(id) {
    if (isApiMode()) return rfqFollowUpApi.cancel(id);
    await delay();
    const records = rfqFollowUpsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.followUpNo === id);
    if (index === -1) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    const existing = records[index];
    if (existing.status !== FOLLOWUP_STATUS.PENDING) {
      const error = new Error('Only pending follow-ups can be cancelled');
      error.status = 400;
      throw error;
    }
    const now = nowIso();
    const actor = getCurrentActor();
    const next = {
      ...existing,
      status: FOLLOWUP_STATUS.CANCELLED,
      cancelledAt: now,
      cancelledBy: actor.name || 'System',
      updatedAt: now
    };
    next.activity = [
      ...(Array.isArray(existing.activity) ? existing.activity : []),
      activityEntry('cancel', `${next.followUpNo} cancelled`)
    ];
    records[index] = next;
    rfqFollowUpsStore.persist(records);
    return clone(enrichRecord(next));
  },

  /** Soft-deletes a follow-up (moves it to the Deleted tab, restorable). */
  async deleteFollowUp(id) {
    if (isApiMode()) return rfqFollowUpApi.remove(id);
    await delay();
    const records = rfqFollowUpsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.followUpNo === id);
    if (index === -1) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    const existing = records[index];
    const now = nowIso();
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      recordState: 'deleted',
      deletedAt: existing.deletedAt || now,
      deletedBy: existing.deletedBy || actor.name || 'System',
      updatedAt: now,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        activityEntry('delete', `${existing.followUpNo} moved to deleted`)
      ]
    };
    rfqFollowUpsStore.persist(records);
    return clone(records[index]);
  },

  /** Restores a soft-deleted follow-up back to Active. */
  async restoreFollowUp(id) {
    if (isApiMode()) return rfqFollowUpApi.restore(id);
    await delay();
    const records = rfqFollowUpsStore.all;
    const index = records.findIndex((entry) => entry.id === id || entry.followUpNo === id);
    if (index === -1) {
      const error = new Error('Follow-up not found');
      error.status = 404;
      throw error;
    }
    const existing = records[index];
    const now = nowIso();
    records[index] = {
      ...existing,
      recordState: 'active',
      deletedAt: null,
      deletedBy: null,
      updatedAt: now,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        activityEntry('restore', `${existing.followUpNo} restored to active`)
      ]
    };
    rfqFollowUpsStore.persist(records);
    return clone(records[index]);
  }
};

/** Public facade (demo mode — direct mock, same seam as the others). */
export const rfqFollowUpService = {
  ...mockRfqFollowUpService,

  /* API-backed override: the mock read the localStorage RFQ store, which
     is empty in API mode, so the follow-up form's RFQ Number dropdown
     never had any options. Reads the live RFQ records from the backend
     instead (same payload the RFQ list page renders) and maps them to
     the option shape the form expects — vendors included, since RFQs
     link vendors by NAME (purchase_rfqs.vendor_names_json → API
     `vendors` / `vendorNames`) and the form filters options by the
     selected vendor. The mock store remains the offline fallback. */
  async getRfqOptions() {
    return withFallback(
      async () => {
        const page = await rfqApi.list({ page: 1, pageSize: 200 });
        return (page.data || []).map((rfq) => ({
          id: rfq.id,
          rfqNo: rfq.rfqNo,
          title: rfq.title,
          vendors: rfq.vendors || rfq.vendorNames || [],
          requester: rfq.requester || '',
          buyer: rfq.buyer || '',
          priority: rfq.priority || 'Medium',
          dueDate: rfq.dueDate || '',
          status: rfq.status || ''
        }));
      },
      () => mockRfqFollowUpService.getRfqOptions()
    );
  }
};

export default rfqFollowUpService;
