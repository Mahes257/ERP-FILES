/**
 * purchase/components/approval/approvalDecorators.js
 * ------------------------------------------------------------------
 * Presentation-only helpers for the Approval Center. Everything here
 * derives DISPLAY fields from the existing requisition records — it
 * never mutates the store, the service or the API. Seed records don't
 * carry buyer / company / branch / warehouse, so these are derived
 * deterministically for UI + filtering only.
 * ------------------------------------------------------------------
 */
import {
  BRANCHES, BUYERS, COMPANIES, PR_STATUS, WAREHOUSES
} from '../../constants';
import { formatDateTime } from '../../utils/helpers';

/** Linear approval lifecycle (Draft → … → PO Created) following the
 *  canonical Purchase workflow: the PR approval is ONE stage that moves
 *  the record into the Technical Specification Review stage, and the
 *  technical approval is a SEPARATE stage that makes the PR eligible
 *  for RFQ creation. The old Department / Finance / Management sub-
 *  approval chain no longer exists — the PR approval consolidates it. */
export const APPROVAL_STAGES = [
  { key: 'Draft', label: 'Draft' },
  { key: 'Submitted', label: 'Submitted' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Technical Review', label: 'Technical Review' },
  { key: 'Ready for RFQ', label: 'Ready for RFQ' },
  { key: 'Converted to RFQ', label: 'Converted to RFQ' },
  { key: 'PO Created', label: 'PO Created' }
];

/** Deterministic approver per linear stage (mock assignment for UI). */
const STAGE_APPROVER = {
  Draft: '',
  Submitted: 'Sanjay Kumar',
  Approved: 'Sanjay Kumar',
  'Technical Review': 'Sanjay Kumar',
  'Ready for RFQ': 'Sanjay Kumar',
  'Converted to RFQ': 'Kavita Rao',
  'PO Created': 'Kavita Rao'
};

/** Actor → role lookup used by the approval history timelines. */
export const ACTOR_ROLES = {
  'Sanjay Kumar': 'Procurement Manager',
  'Amit Verma': 'Department Head',
  'Meera Joshi': 'Finance Controller',
  'Vikram Singh': 'Plant Head',
  'Kavita Rao': 'Buyer',
  'Rahul Sharma': 'Production Engineer',
  'Arjun Mehta': 'Production Supervisor',
  'Priya Patel': 'IT Lead',
  'Sneha Iyer': 'Quality Engineer',
  'Neha Gupta': 'Admin Executive',
  'Rohan Desai': 'Projects Engineer',
  'Divya Menon': 'Calibration Engineer',
  'Ananya Nair': 'Network Admin',
  'Aarav Khanna': 'Automation Engineer',
  'Current User': 'Approver'
};

export function roleFor(actor) {
  return ACTOR_ROLES[actor] || 'Approver';
}

function stableIndex(value, mod) {
  let hash = 0;
  const str = String(value == null ? '' : value);
  for (let i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return hash % mod;
}

/** Maps a record's status onto the linear approval stage index. */
export function stageIndexFor(record) {
  const status = record?.status;
  if (status === PR_STATUS.DRAFT) return 0;
  if (status === PR_STATUS.PENDING_APPROVAL) return 1;
  if (status === PR_STATUS.APPROVED) return 2; /* PR approval complete — awaiting technical review */
  if (status === PR_STATUS.TECHNICAL_REVIEW) return 3; /* in the technical review stage */
  if (status === PR_STATUS.READY_FOR_RFQ) return 4; /* technical review approved */
  if (status === PR_STATUS.CONVERTED) return 5; /* RFQ raised — PO not created yet */
  if (status === PR_STATUS.PO_RAISED) return 6;
  if (status === PR_STATUS.RETURNED) return 1;
  if (status === PR_STATUS.REJECTED) return 1;
  return 1;
}

export function stageNameFor(record) {
  return APPROVAL_STAGES[stageIndexFor(record)].label;
}

function latestActivityTs(record) {
  const list = record?.activity || [];
  let latest = '';
  list.forEach((entry) => {
    if (entry?.timestamp && new Date(entry.timestamp).getTime() > new Date(latest || 0).getTime()) {
      latest = entry.timestamp;
    }
  });
  return latest;
}

/**
 * Returns a clone of the record carrying display + filter fields:
 * buyer, company, branch, warehouse, stage, assignedTo, requiredDate,
 * age, lastUpdated plus raw `_`-prefixed values for sorting.
 */
export function decorateRecord(record) {
  const id = record?.id || record?.prNo || '';
  const buyer = record?.buyer || BUYERS[stableIndex(id, BUYERS.length)];
  const company = record?.company || COMPANIES[stableIndex(`${id}c`, COMPANIES.length)];
  const branch = record?.branch || BRANCHES[stableIndex(`${id}b`, BRANCHES.length)];
  const warehouse = record?.warehouse || WAREHOUSES[stableIndex(`${id}w`, WAREHOUSES.length)];

  const stageIndex = stageIndexFor(record);
  const stage = APPROVAL_STAGES[stageIndex].label;
  const assignedTo = STAGE_APPROVER[stage] || record?.requester || '—';

  const createdTs = new Date(record?.createdAt || record?.date || Date.now()).getTime();
  const rawLast = latestActivityTs(record);
  const lastTs = rawLast ? new Date(rawLast).getTime() : createdTs;
  const ageDays = Math.max(0, Math.floor((Date.now() - createdTs) / 86400000));

  return {
    ...record,
    buyer,
    company,
    branch,
    warehouse,
    stage,
    stageIndex,
    assignedTo,
    requiredDate: record?.expectedDate || '',
    age: ageDays,
    lastUpdated: formatDateTime(new Date(lastTs)),
    _createdTs: createdTs,
    _lastUpdatedTs: lastTs,
    _ageDays: ageDays
  };
}

export function isSameDay(aTs, bTs = Date.now()) {
  const a = new Date(aTs);
  const b = new Date(bTs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Count of approvals whose approve event happened today. */
export function approvedTodayCount(records = []) {
  return records.filter((record) =>
    (record.activity || []).some((entry) => entry.type === 'approve' && isSameDay(entry.timestamp))
  ).length;
}

/** Average hours between submit → approve across all records (0 if none). */
export function averageApprovalHours(records = []) {
  const diffs = [];
  records.forEach((record) => {
    const submitted = (record.activity || []).find((entry) => entry.type === 'submit');
    const approved = (record.activity || []).find((entry) => entry.type === 'approve');
    if (submitted?.timestamp && approved?.timestamp) {
      const diff = new Date(approved.timestamp) - new Date(submitted.timestamp);
      if (diff > 0) diffs.push(diff / 3600000);
    }
  });
  if (diffs.length === 0) return 0;
  return diffs.reduce((sum, value) => sum + value, 0) / diffs.length;
}

/** "2d 4h", "3h 20m" style human duration. */
export function formatDuration(hours) {
  const totalMinutes = Math.round((Number(hours) || 0) * 60);
  if (!Number.isFinite(totalMinutes) || totalMinutes <= 0) return '—';
  const days = Math.floor(totalMinutes / 1440);
  const hrs = Math.floor((totalMinutes % 1440) / 60);
  const mins = totalMinutes % 60;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

/** Records pending approval for more than `days` days. */
export function pendingOverdue(records = [], days = 3) {
  return records.filter((record) => {
    if (record.status !== PR_STATUS.PENDING_APPROVAL) return false;
    const created = new Date(record.createdAt || record.date || 0).getTime();
    return Math.floor((Date.now() - created) / 86400000) > days;
  });
}

/** Pending records within `days` of the required (expected) date. */
export function urgentByDate(records = [], days = 7) {
  const today = new Date();
  const limit = today.getTime() + days * 86400000;
  return records.filter((record) => {
    if (record.status !== PR_STATUS.PENDING_APPROVAL) return false;
    const expected = new Date(record.expectedDate || 0).getTime();
    return expected >= today.getTime() && expected <= limit;
  });
}

/** Event → label for the approval-history feed. */
export const ACTIVITY_META = {
  submit: { label: 'Submitted for approval', tone: 'blue' },
  review: { label: 'Technical review completed', tone: 'indigo' },
  approve: { label: 'Approved', tone: 'green' },
  reject: { label: 'Rejected', tone: 'red' },
  return: { label: 'Returned for changes', tone: 'gray' },
  po: { label: 'PO created', tone: 'cyan' },
  rfq: { label: 'Converted to RFQ', tone: 'cyan' },
  comment: { label: 'Comment added', tone: 'slate' }
};
