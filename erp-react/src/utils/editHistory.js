import api from '../api/axiosInstance';

/**
 * Edit History (project-wide).
 *
 * Every module records field-level edit history server-side into the shared
 * `edit_history` table. Each successful edit gets a sequential version
 * number; rows of one edit share that version. These helpers fetch that
 * history and the edit count so the UI can show "Edited N times" and
 * "Edited — Version N" entries inside the existing timeline/history areas.
 *
 * moduleKey (frontend camelCase) → backend module identifier (kebab-case).
 */
export const EDIT_HISTORY_MODULES = {
  quotation: 'quotation',
  salesOrder: 'sales-order',
  salesContract: 'sales-contract',
  proformaInvoice: 'proforma-invoice',
  deliveryChallan: 'delivery-challan',
  invoice: 'invoice',
  creditNote: 'credit-note',
  paymentReceipt: 'payment-receipt',
  lead: 'lead',
  cpr: 'cpr',
  costWorkout: 'cost-workout',
  profitWorkout: 'profit-workout',
  customer: 'customer',
  followUp: 'follow-up',
  cprTechnicalVerification: 'cpr-technical-verification'
};

export function editHistoryModulePath(moduleKey) {
  return EDIT_HISTORY_MODULES[moduleKey] || moduleKey;
}

/** Fetch grouped edit history from an explicit endpoint (modules whose
 * history is served under a different authority/path). */
export async function fetchEditHistoryFromUrl(url) {
  if (!url) return [];
  try {
    const res = await api.get(url);
    const body = res?.data;
    return Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
  } catch {
    return [];
  }
}

/** Fetch grouped edit history: [{ version, changedBy, createdAt, changeSummary, changes: [{field, oldValue, newValue}] }] newest first. */
export async function fetchEditHistory(moduleKey, recordId) {
  if (recordId == null) return [];
  return fetchEditHistoryFromUrl(`/history/${editHistoryModulePath(moduleKey)}/${recordId}`);
}

/** Fetch the number of times a record has been edited (0 = never). */
export async function fetchEditCount(moduleKey, recordId) {
  if (recordId == null) return 0;
  try {
    const res = await api.get(`/history/${editHistoryModulePath(moduleKey)}/${recordId}/count`);
    const body = res?.data;
    return Number(body?.data?.count) || 0;
  } catch {
    return 0;
  }
}

/** "Edited 1 time" / "Edited 2 times" label. */
export function editCountLabel(count) {
  const n = Number(count) || 0;
  if (n <= 0) return null;
  return n === 1 ? 'Edited 1 time' : `Edited ${n} times`;
}
