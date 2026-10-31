import { formatLeadNo } from './leadHelpers';

// Status values come from the original ERP's master data (vt_master_pr_statuses)
// plus the ERP's 'Submitted' value used when submitting for approval. The React
// backend persists an enum (draft / pending approval / approved / rejected /
// converted / archived / deleted), so display values are mapped to the closest
// backend-safe status on serialize (mirrors the ERP's own status field).
export const STATUS_OPTIONS = [
  'Draft', 'Pending', 'Open', 'Approved', 'Rejected', 'Closed', 'Cancelled', 'Submitted'
];

// Display status (ERP form) -> backend enum status.
const DISPLAY_TO_BACKEND_STATUS = {
  'Draft': 'draft',
  'Pending': 'pending approval',
  'Open': 'pending approval',
  'Approved': 'approved',
  'Rejected': 'rejected',
  'Closed': 'approved',
  'Cancelled': 'rejected',
  'Submitted': 'pending approval'
};

export function normalizeStatus(value) {
  const status = (value || 'draft').trim();
  return DISPLAY_TO_BACKEND_STATUS[status] || status;
}

// Jackson-safe string coercion. The backend DTO declares every one of these
// fields as String, so a stray array/object (e.g. a lead's `notes` list leaking
// into an auto-filled field) must never reach the JSON payload — Jackson would
// reject it with "Cannot deserialize value of type String from Array value".
// Arrays are joined into a comma-separated string, objects are JSON-stringified,
// and null/undefined become ''.
function toStr(value) {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === 'object' && v !== null ? '' : String(v))).filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function normalizeCpr(raw = {}) {
  const createdAt = raw.createdAt || raw.date || raw.updatedAt || '';
  return {
    ...raw,
    client: raw.client || raw.clientName || '',
    createdBy: raw.createdBy || raw.requestedBy || '',
    description: raw.description || '',
    status: raw.status || 'draft',
    approvalStatus: raw.approvalStatus || '',
    items: (Array.isArray(raw.items) ? raw.items : []).map((it) => ({
      ...it,
      // Item Notes: a first-class API field. Legacy rows may only carry the
      // value in their custom fields, so fall back to that without losing it.
      notes: it.notes ?? (it.customFields && typeof it.customFields === 'object' ? it.customFields.notes : '') ?? '',
      attachments: Array.isArray(it.attachments)
        ? it.attachments
        : typeof it.attachmentsJson === 'string' && it.attachmentsJson
          ? (() => {
              try {
                const parsed = JSON.parse(it.attachmentsJson);
                return Array.isArray(parsed) ? parsed : [];
              } catch {
                return [];
              }
            })()
          : []
    })),
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    comments: Array.isArray(raw.comments) ? raw.comments : [],
    quotationId: raw.quotationId ?? null,
    quotationDeadline: raw.quotationDeadline || '',
    extendedDeadline: raw.extendedDeadline || '',
    costWorkoutId: raw.costWorkoutId ?? null,
    costWorkoutCwNo: raw.costWorkoutCwNo || '',
    costWorkoutStatus: raw.costWorkoutStatus || '',
    createdAt
  };
}

// ---- Quotation Deadline / Extended Deadline helpers --------------------------
// Options for the Extended Deadline dropdown. The effective deadline is stored
// in extendedDeadline ('' = no extension); the original quotationDeadline is
// always preserved separately.
export const EXTENDED_DEADLINE_OPTIONS = [
  { value: 'NONE', label: 'No Extension' },
  { value: '+1', label: '+1 Day' },
  { value: '+3', label: '+3 Days' },
  { value: '+7', label: '+7 Days' },
  { value: '+14', label: '+14 Days' },
  { value: 'CUSTOM', label: 'Custom Date' }
];

function toYmd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDaysToDate(dateStr, days) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() + Number(days) || 0);
  return toYmd(d);
}

function dayDiff(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/** Effective quotation deadline = extended deadline when set, else the original. */
export function effectiveQuotationDeadline(quotationDeadline, extendedDeadline) {
  return extendedDeadline || quotationDeadline || '';
}

/**
 * Re-derive the dropdown option from the stored dates so the edit form shows
 * exactly what was saved: exact +1/+3/+7/+14 day differences map back to their
 * option, anything else that differs is a Custom Date, and no extension is
 * 'NONE'. An extended date without a base deadline is treated as Custom.
 */
export function deriveExtendedDeadlineOption(quotationDeadline, extendedDeadline) {
  if (!extendedDeadline) return 'NONE';
  if (!quotationDeadline) return 'CUSTOM';
  if (extendedDeadline === quotationDeadline) return 'NONE';
  const diff = dayDiff(quotationDeadline, extendedDeadline);
  if (diff === 1) return '+1';
  if (diff === 3) return '+3';
  if (diff === 7) return '+7';
  if (diff === 14) return '+14';
  return 'CUSTOM';
}

// ---- CPR item-grid custom column helpers ------------------------------------
// Column configuration lives on the form as itemColumns: [{id, key, label,
// type, required, system, order}]. System columns map to real CprItem fields;
// custom columns carry a stable generated id (custom_xxx) whose per-row values
// are stored in item.customFields. Persisted through serializeCpr -> Spring
// Boot -> MySQL (Cpr.itemColumnsJson / CprItem.customFieldsJson) — never
// localStorage.

let customColumnSeq = 0;

/** Stable id for a new user-defined column (never derived from its label). */
export function newCustomColumnId() {
  customColumnSeq += 1;
  return `custom_${Date.now().toString(36)}_${customColumnSeq}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Default rendered width per CPR item column (also the fallback width for
 * legacy saved configurations that predate drag-to-resize). Every configurable
 * column is drag-resizable; the serial number, grip, computed Total and the
 * Actions column stay structural and fixed. Custom columns get 150px.
 */
export const CPR_COLUMN_DEFAULT_WIDTH = {
  drawingNo: 130,
  description: 220,
  specification: 160,
  qty: 80,
  unit: 100,
  estimatedCost: 120,
  remarks: 180,
  custom: 150
};

/** Clamp a stored width into the shared resizable band (60–900px). */
export function cprColumnWidth(id, width) {
  const n = Math.round(Number(width));
  if (Number.isFinite(n) && n > 0) return Math.min(900, Math.max(60, n));
  return CPR_COLUMN_DEFAULT_WIDTH[id] || CPR_COLUMN_DEFAULT_WIDTH.custom;
}

/** The default CPR Item Details grid configuration (Drawing No. stays optional). */
export function defaultCprItemColumns() {
  const col = (id, key, label, type, required, order) => ({
    id, key, label, type, required, system: true, order, width: CPR_COLUMN_DEFAULT_WIDTH[id] || CPR_COLUMN_DEFAULT_WIDTH.custom
  });
  return [
    col('drawingNo', 'drawingNo', 'Drawing No.', 'text', false, 1),
    col('description', 'description', 'Material', 'text', true, 2),
    col('specification', 'specification', 'Description', 'text', false, 3),
    col('qty', 'qty', 'Qty', 'number', true, 4),
    col('unit', 'unit', 'UOM', 'text', true, 5),
    col('estimatedCost', 'estimatedCost', 'Est. Cost (₹)', 'number', false, 6),
    col('remarks', 'remarks', 'Remarks', 'text', false, 7)
  ];
}

/** Sanitizes a saved column list from the API; falls back to defaults. */
export function normalizeCprItemColumns(raw) {
  const defaults = defaultCprItemColumns();
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  const seen = new Set();
  const cleaned = [];
  raw.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const id = typeof c.id === 'string' && c.id ? c.id : null;
    if (!id || seen.has(id)) return;
    seen.add(id);
    cleaned.push({
      id,
      key: typeof c.key === 'string' && c.key ? c.key : id,
      label: typeof c.label === 'string' && c.label ? c.label : id,
      type: typeof c.type === 'string' && c.type ? c.type : 'text',
      required: Boolean(c.required),
      system: Boolean(c.system),
      order: Number.isFinite(c.order) ? c.order : i,
      // Visibility is user-managed per column and persisted with the config;
      // missing flag (legacy rows) means visible.
      hidden: Boolean(c.hidden),
      // Drag-resize width, persisted with the column config; legacy rows fall
      // back to the column's sensible default width.
      width: cprColumnWidth(id, c.width)
    });
  });
  return cleaned.sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, order: i + 1 }));
}

/** Whether the saved configuration differs from the default column set. */
export function hasCustomItemColumns(columns) {
  return (columns || []).some((c) => !c.system);
}

export function serializeCpr(form = {}, items = []) {
  const sourceType = toStr(form.sourceType);
  const sourceId = form.sourceId != null ? String(form.sourceId) : '';
  // The ERP derives leadNo from the selected source (lead id when a lead is
  // selected, empty for clients) rather than from the text field. When editing
  // (sourceType not restorable from the API) the stored leadNo is preserved.
  // The ERP requires the FULL formatted Lead document number (LEAD-000077),
  // never the raw numeric id — every module that reads this field expects the
  // same format as the Lead list column.
  const leadNo = sourceType === 'lead' ? formatLeadNo(sourceId) : sourceType === 'client' ? '' : (form.leadNo || '');
  return {
    prNo: toStr(form.prNo),
    referencePrNo: toStr(form.referencePrNo),
    prDate: toStr(form.prDate),
    department: toStr(form.department),
    requestedBy: toStr(form.requestedBy),
    requiredDate: toStr(form.requiredDate),
    quotationDeadline: toStr(form.quotationDeadline),
    extendedDeadline: toStr(form.extendedDeadline),
    priority: toStr(form.priority),
    status: toStr(normalizeStatus(form.status)),
    sourceLead: toStr(form.sourceLead),
    // Payload parity with the ERP's collectData(): it sends sourceType/sourceId/
    // leadId/clientId so the backend could persist the real source identity.
    sourceType,
    sourceId,
    leadId: sourceType === 'lead' ? sourceId : '',
    clientId: sourceType === 'client' ? sourceId : '',
    clientName: toStr(form.clientName),
    contactPerson: toStr(form.contactPerson),
    phone: toStr(form.phone),
    email: toStr(form.email),
    company: toStr(form.company),
    gst: toStr(form.gst),
    project: toStr(form.project),
    leadNo: toStr(leadNo),
    pan: toStr(form.pan),
    vendor: toStr(form.vendor),
    billingAddress: toStr(form.billingAddress),
    shippingAddress: toStr(form.shippingAddress),
    remarks: toStr(form.remarks),
    description: toStr(form.description),
    costWorkout: form.costWorkout != null && form.costWorkout !== '' ? Number(form.costWorkout) : null,
    profitPercent: form.profitPercent != null && form.profitPercent !== '' ? Number(form.profitPercent) : null,
    // Item-grid column configuration — persisted only when the document has
    // its OWN column configuration (a user action via Manage Columns, or the
    // module configuration a new CPR is opened with). When the form carries
    // none, null is stored and the record keeps following the module
    // configuration instead of freezing today's defaults into it.
    itemColumns: Array.isArray(form.itemColumns) && form.itemColumns.length > 0
      ? form.itemColumns
      : [],
    items: items.map((item) => {
      // Build a set of active column IDs so orphaned custom field entries
      // (from removed columns) are stripped before saving. When the form
      // carries NO column configuration the grid is rendering the module
      // configuration, so its custom column ids are still valid — never strip
      // values in that case (empty values are always dropped).
      const activeColIds = new Set((form.itemColumns || []).map((c) => c.id));
      const rawCustomFields = item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
        ? item.customFields
        : {};
      const cleanedCustomFields = Object.fromEntries(
        Object.entries(rawCustomFields).filter(([k, v]) =>
          // "notes" is the reserved key the backend uses to persist the item's
          // Notes, so it is never treated as an orphaned custom-column value.
          k && v != null && String(v) !== '' && (k === 'notes' || activeColIds.size === 0 || activeColIds.has(k))
        )
      );
      return {
        drawingNo: toStr(item.drawingNo),
        description: toStr(item.description),
        specification: toStr(item.specification),
        qty: item.qty != null && item.qty !== '' ? Number(item.qty) : 1,
        unit: toStr(item.unit),
        estimatedCost: item.estimatedCost != null && item.estimatedCost !== '' ? Number(item.estimatedCost) : 0,
        remarks: toStr(item.remarks),
        // Item Notes (may be multi-line) — belongs to this row only.
        notes: toStr(item.notes),
        fileName: toStr(item.fileName),
        fileSize: item.fileSize != null && item.fileSize !== '' ? Number(item.fileSize) : 0,
        fileType: toStr(item.fileType),
        attachments: Array.isArray(item.attachments) ? item.attachments : [],
        customFields: cleanedCustomFields
      };
    })
  };
}

// ---- CPR number sequence helpers --------------------------------------------
// Format: CPR-[YEAR]-[6-DIGIT SEQUENCE], e.g. CPR-2026-000094. Revision rows
// carry a suffix like CPR-2026-000094(3) — the base sequence is what counts,
// and deleted/archived records must never free a number for reuse.
const CPR_NO_PATTERN = /^CPR-(\d{4})-(\d{6})(?:\(\d+\))?$/;

/** Highest base sequence used by the given CPR numbers in a year (0 when none). */
export function maxCprSequence(records, year = new Date().getFullYear()) {
  let max = 0;
  for (const record of records || []) {
    const prNo = typeof record === 'string' ? record : record?.prNo;
    if (!prNo) continue;
    const match = String(prNo).trim().match(CPR_NO_PATTERN);
    if (!match) continue;
    const recordYear = Number(match[1]);
    if (recordYear !== year) continue;
    max = Math.max(max, Number(match[2]));
  }
  return max;
}

/** Builds a CPR number for a year + sequence (preserves 6-digit leading zeros). */
export function buildCprNumber(year, sequence) {
  return `CPR-${year}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Next unused CPR number for the year: highest existing sequence + 1, then
 * increment again if that number is already used. Considers every provided
 * record — active, archived and deleted alike — so a number is never reused.
 */
export function nextCprNumber(records, year = new Date().getFullYear()) {
  const used = new Set();
  for (const record of records || []) {
    const prNo = typeof record === 'string' ? record : record?.prNo;
    // Normalize revision suffixes (CPR-2026-000095(3) -> CPR-2026-000095) so a
    // revision alone also blocks reuse of its base number.
    if (prNo) used.add(String(prNo).trim().replace(/\(\d+\)$/, ''));
  }
  let sequence = maxCprSequence(records, year) + 1;
  while (used.has(buildCprNumber(year, sequence))) {
    sequence += 1;
  }
  return buildCprNumber(year, sequence);
}

export function cprToForm(raw) {
  const cpr = normalizeCpr(raw);
  // The ERP's edit flow shows 'Submitted' only when the stored status is
  // Submitted, otherwise 'Draft' — mirror that exactly.
  const rawStatus = String(cpr.status || '').toLowerCase();
  const status = rawStatus === 'submitted' || rawStatus === 'pending approval' ? 'Submitted' : 'Draft';
  return {
    prNo: cpr.prNo || '',
    referencePrNo: cpr.referencePrNo || '',
    prDate: (cpr.prDate || cpr.date || '').slice(0, 10),
    department: cpr.department || '',
    requestedBy: cpr.requestedBy || '',
    requiredDate: (cpr.requiredDate || '').slice(0, 10),
    quotationDeadline: (cpr.quotationDeadline || '').slice(0, 10),
    extendedDeadline: (cpr.extendedDeadline || '').slice(0, 10),
    priority: cpr.priority || '',
    status,
    sourceLead: cpr.sourceLead || '',
    sourceType: cpr.sourceType || '',
    sourceId: cpr.sourceId != null ? String(cpr.sourceId) : '',
    clientName: cpr.clientName || '',
    contactPerson: cpr.contactPerson || '',
    phone: cpr.phone || '',
    email: cpr.email || '',
    company: cpr.company || '',
    gst: cpr.gst || '',
    project: cpr.project || '',
    leadNo: cpr.leadNo || '',
    pan: cpr.pan || '',
    vendor: cpr.vendor || '',
    billingAddress: cpr.billingAddress || '',
    shippingAddress: cpr.shippingAddress || '',
    remarks: cpr.remarks || '',
    description: cpr.description || '',
    costWorkout: cpr.costWorkout != null ? String(cpr.costWorkout) : '',
    profitPercent: cpr.profitPercent != null ? String(cpr.profitPercent) : '',
    // Saved item-grid column configuration (id/label/type/order per column) —
    // restored exactly as saved so reopening never resets user columns.
    // Left EMPTY when the record carries no snapshot of its own: the Item
    // Details grid then resolves the same chain the CPR Overview uses
    // (record snapshot → module configuration `sales.items.cpr` → built-in
    // defaults), so Edit and Overview always render the SAME columns. Filling
    // in the defaults here made Edit ignore the module configuration and
    // disagree with the Overview for records created without a snapshot.
    itemColumns: Array.isArray(raw.itemColumns) && raw.itemColumns.length > 0
      ? normalizeCprItemColumns(raw.itemColumns)
      : []
  };
}

export function cprToRequest(cpr, overrides = {}) {
  const form = cprToForm(cpr);
  const items = Array.isArray(cpr.items) ? cpr.items : [];
  return { ...serializeCpr(form, items), ...overrides };
}

export function cprDocument(cpr = {}) {
  const items = Array.isArray(cpr.items) ? cpr.items : [];
  const total = items.reduce((sum, it) => sum + (Number(it.qty) || 0) * (Number(it.estimatedCost) || 0), 0);
  const costWorkout = Number(cpr.costWorkout) || 0;
  const profit = costWorkout > 0 ? total - costWorkout : null;
  const profitOnCost = costWorkout > 0 && total > 0 ? (profit / costWorkout) * 100 : null;
  const marginPct = total > 0 && profit != null ? (profit / total) * 100 : null;
  return { items, total, costWorkout, profit, profitOnCost, marginPct };
}

export function buildCprLink(cpr) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/cprs/${cpr.id}`;
}

export function shareCpr(cpr) {
  const url = buildCprLink(cpr);
  const text = `${cpr.prNo || 'CPR'}${cpr.client ? ` · ${cpr.client}` : ''} — ${url}`;
  const tryShare = () =>
    navigator.share ? navigator.share({ title: cpr.prNo || 'CPR', text, url }) : Promise.reject(new Error('no-share'));
  return tryShare()
    .then(() => ({ ok: true, action: 'share' }))
    .catch((err) => {
      if (err && err.name === 'AbortError') return { ok: true, action: 'cancelled' };
      if (err && err.message === 'no-share') return navigator.clipboard.writeText(url).then(() => ({ ok: true, action: 'copy' }));
      return navigator.clipboard
        .writeText(url)
        .then(() => ({ ok: true, action: 'copy' }))
        .catch((clipboardError) => ({ ok: false, error: clipboardError }));
    });
}

// ---- CPR list refresh bus ------------------------------------------------
// A successful create can happen while the list is mounted in this tab (a
// modal/inline save) or in ANOTHER tab (the "New CPR" button opens the
// creation route in a new tab so the list stays open). A plain window event
// only reaches this tab, so the same notification is also written to
// localStorage: the browser fires `storage` in the other tabs, which lets an
// open list reload without a manual browser refresh.
export const CPR_LIST_REFRESH_EVENT = 'erp:cpr-list-changed';
const CPR_LIST_REFRESH_STORAGE_KEY = 'erp:cpr-list-changed:last';

/** Announces that a CPR was saved successfully and mounted lists should reload. */
export function notifyCprListRefresh() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(CPR_LIST_REFRESH_EVENT));
  try {
    // Unique value per notification so repeated saves in the same millisecond
    // still produce a storage event in the other tabs.
    window.localStorage.setItem(
      CPR_LIST_REFRESH_STORAGE_KEY,
      `${Date.now()}:${Math.random().toString(36).slice(2)}`
    );
  } catch {
    // localStorage can be unavailable (private mode / quota) — the in-tab
    // window event above still refreshes a mounted list.
  }
}

/** Subscribes a CPR list loader to refresh notifications from this or another tab. */
export function subscribeCprListRefresh(handler) {
  if (typeof window === 'undefined' || typeof handler !== 'function') return () => {};
  const onStorage = (event) => {
    if (event.key === CPR_LIST_REFRESH_STORAGE_KEY) handler();
  };
  window.addEventListener(CPR_LIST_REFRESH_EVENT, handler);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CPR_LIST_REFRESH_EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}

export function emailCpr(cpr) {
  try {
    const subject = encodeURIComponent(`${cpr.prNo || 'CPR'}${cpr.client ? ` - ${cpr.client}` : ''}`);
    const body = encodeURIComponent(
      `Dear ${cpr.contactPerson || 'Sir/Madam'},\n\nPlease find the purchase request ${cpr.prNo} for your reference.\n\n` +
        `${cpr.description ? `Description: ${cpr.description}\n` : ''}` +
        `${cpr.requiredDate ? `Required by: ${cpr.requiredDate}\n` : ''}\n` +
        `Reference: ${buildCprLink(cpr)}`
    );
    window.location.href = `mailto:${cpr.email || ''}?subject=${subject}&body=${body}`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open email client' };
  }
}
