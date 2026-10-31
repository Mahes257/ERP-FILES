import { AVATAR_COLORS } from './leadConstants';
import { currencySymbol } from './currencyUtils';
import { internalNotesMeta, parseInternalNotes } from './leadNotes';

// The ERP's single, stable Lead document-number format: LEAD-<id padded to 6>.
// The document number NEVER changes for a lead's lifetime (revisions are
// internal snapshots), and every module that references a lead must use this
// exact formatted number — never the raw numeric id.
export function formatLeadNo(id) {
  return id != null && id !== '' ? `LEAD-${String(id).padStart(6, '0')}` : '';
}

/**
 * Format a monetary value with the correct currency symbol.
 * Defaults to INR (₹) when no currency is provided.
 */
export function formatINR(value, currency = 'INR') {
  const num = Number(value);
  if (!Number.isFinite(num)) return `${currencySymbol(currency)}0`;
  return `${currencySymbol(currency)}${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

// Compact Indian-format currency for pipeline stage totals (ERP formatCurrencyShort).
export function formatCurrencyShort(amount, currency = 'INR') {
  const num = Number(amount) || 0;
  const sym = currencySymbol(currency);
  if (num >= 10000000) return `${sym}${(num / 10000000).toFixed(1)}Cr`;
  if (num >= 100000) return `${sym}${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${sym}${(num / 1000).toFixed(1)}K`;
  return formatINR(num, currency);
}

export function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function avatarColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Follow-up time: stored as a 24h "HH:MM" string (from <input type="time">) or
// a 12h "HH:MM AM/PM" string; Date values are formatted as well.
export function formatTime(value) {
  if (value == null || value === '') return '';
  const s = String(value);
  if (/^\d{1,2}:\d{2}/.test(s)) {
    const [h, m] = s.split(':').map(Number);
    if (h > 23 || m > 59) return s;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(hour12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function toISODate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

export function formatRelativeTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return formatDate(value);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function pick(obj, keys) {
  if (!obj) return undefined;
  for (let i = 0; i < keys.length; i += 1) {
    if (obj[keys[i]] !== undefined && obj[keys[i]] !== null && obj[keys[i]] !== '') {
      return obj[keys[i]];
    }
  }
  return undefined;
}

export function normalizeLead(raw = {}) {
  const name = pick(raw, ['name', 'leadName', 'fullName']) || `${raw.firstName || ''} ${raw.lastName || ''}`.trim();
  const value = pick(raw, ['value', 'estimatedValue', 'dealValue']);
  const date = pick(raw, ['date', 'createdAt', 'createdDate', 'registryDate']);

  return {
    id: raw.id,
    name,
    firstName: raw.firstName || (name || '').split(' ')[0] || '',
    lastName: raw.lastName || (name || '').split(' ').slice(1).join(' ') || '',
    company: pick(raw, ['company', 'companyName', 'organisation']) || '',
    title: raw.title || raw.designation || '',
    phone: pick(raw, ['phone', 'mobile', 'phoneNumber']) || '',
    email: raw.email || '',
    value: value !== undefined && value !== '' ? Number(value) : 0,
    stage: pick(raw, ['stage', 'pipelineStage']) || 'New',
    source: raw.source || raw.leadSource || '',
    owner: pick(raw, ['owner', 'assignedTo', 'ownerName']) || '',
    priority: raw.priority || '',
    status: pick(raw, ['status', 'leadStatus']) || 'Active',
    date,
    updatedAt: raw.updatedAt || raw.lastUpdated || raw.modifiedAt || date || '',
    website: raw.website || '',
    address: raw.address || '',
    city: raw.city || '',
    state: raw.state || '',
    pincode: raw.pincode || '',
    country: raw.country || '',
    notes: Array.isArray(raw.notes) ? raw.notes : [],
    activities: Array.isArray(raw.activities) ? raw.activities : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    businessName: raw.businessName || '',
    businessType: raw.businessType || '',
    industry: raw.industry || '',
    taxId: raw.taxId || '',
    secondaryName: raw.secondaryName || '',
    secondaryPhone: raw.secondaryPhone || '',
    secondaryEmail: raw.secondaryEmail || '',
    // Fields the Lead API returns and both the create/edit form and the View
    // page read. They were previously dropped here, so the Lead View rendered
    // "—" for values that were present in MySQL (API → DTO mapping gap).
    pan: raw.pan || '',
    preferredVendor: raw.preferredVendor || '',
    project: raw.project || '',
    internalNotes: raw.internalNotes || '',
    description: raw.description || '',
    mapNo: raw.mapNo || '',
    expectedCloseDate: raw.expectedCloseDate || raw.closeDate || '',
    createdBy: raw.createdBy || raw.createdByName || '',
    // Aliases used by the single-lead export / PDF columns (leadNo, contact,
    // expected value) and the ERP pipeline column.
    leadNo: raw.leadNo || formatLeadNo(raw.id),
    contactPerson: raw.contactPerson || name,
    expectedValue: value !== undefined && value !== '' ? Number(value) : 0
  };
}

export function serializeLead(lead) {
  return {
    leadName: lead.name,
    firstName: lead.firstName,
    lastName: lead.lastName,
    companyName: lead.company,
    designation: lead.title,
    phone: lead.phone,
    email: lead.email,
    estimatedValue: Number(lead.value) || 0,
    pipelineStage: lead.stage,
    leadSource: lead.source,
    assignedTo: lead.owner,
    priority: lead.priority || 'Medium',
    website: lead.website,
    address: lead.address,
    city: lead.city,
    state: lead.state,
    pincode: lead.pincode,
    country: lead.country,
    businessName: lead.businessName,
    businessType: lead.businessType,
    industry: lead.industry,
    taxId: lead.taxId,
    secondaryName: lead.secondaryName,
    secondaryPhone: lead.secondaryPhone,
    secondaryEmail: lead.secondaryEmail,
    description: lead.description || ''
  };
}

export function getCellValue(lead, key) {
  switch (key) {
    case 'name':
      return lead.name || '';
    case 'company':
      return lead.company || '';
    case 'value':
      return formatINR(lead.value);
    case 'stage':
      return lead.stage || '';
    case 'owner':
      return lead.owner || '';
    case 'contact':
      return [lead.phone, lead.email].filter(Boolean).join(' ');
    case 'source':
      return lead.source || '';
    case 'date':
      return formatDate(lead.date);
    case 'status':
      return lead.status || '';
    default:
      return lead[key] != null ? String(lead[key]) : '';
  }
}

export function buildLeadFormPrefill(raw) {
  // Tolerate an ApiResponse envelope ({ success, message, data }) so the form
  // never renders empty defaults when the raw API body is passed in directly.
  const lead = normalizeLead(raw?.data ?? raw);
  const rawNotes = Array.isArray(raw?.notes)
    ? raw.notes.map((note) => (typeof note === 'string' ? note : note?.text || '')).join('\n')
    : typeof raw?.notes === 'string'
      ? raw.notes
      : '';
  return {
    businessName: lead.businessName || '',
    businessType: lead.businessType || '',
    industry: lead.industry || '',
    taxId: lead.taxId || '',
    website: lead.website || '',
    name: lead.name || '',
    company: lead.company || '',
    title: lead.title || '',
    value: lead.value && lead.value !== 0 ? String(lead.value) : '',
    stage: lead.stage || 'New',
    source: lead.source || 'Website',
    email: lead.email || '',
    phone: lead.phone || '',
    secondaryName: lead.secondaryName || '',
    secondaryEmail: lead.secondaryEmail || '',
    secondaryPhone: lead.secondaryPhone || '',
    address: lead.address || '',
    city: lead.city || '',
    state: lead.state || '',
    pincode: lead.pincode || '',
    country: lead.country || 'India',
    owner: lead.owner || 'Admin User',
    priority: lead.priority || 'Medium',
    notes: rawNotes,
    description: lead.description || '',
    // The notes column can hold a legacy CRM metadata envelope alongside (or
    // instead of) the written note. The textarea gets the written text only;
    // the envelope travels beside it so a save can put it back untouched
    // (see composeInternalNotes) — the stored value, API and DB are unchanged.
    internalNotes: parseInternalNotes(lead.internalNotes).text,
    internalNotesMeta: internalNotesMeta(lead.internalNotes)
  };
}

export function buildExportFilename(prefix) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${prefix}-${stamp}`;
}

export function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

/**
 * The most recent follow-up date across a record's own follow-ups (deleted ones
 * excluded). Used by the CRM lists' "Last Follow-up" column so it reflects real
 * follow-up data instead of the record's own updated timestamp.
 */
export function latestFollowUpDate(history) {
  return (
    (history || [])
      .filter((fu) => String(fu.status || '').toLowerCase() !== 'deleted')
      .map((fu) => String(fu.followupDate || '').slice(0, 10))
      .filter(Boolean)
      .sort()
      .pop() || ''
  );
}

/**
 * "Next Follow-up" = the earliest still-upcoming nextFollowupDate across a
 * record's own follow-ups. Returns '' when nothing is scheduled.
 */
export function nextFollowUpDate(history) {
  const today = todayISO();
  return (
    (history || [])
      .filter((fu) => String(fu.status || '').toLowerCase() !== 'deleted')
      .map((fu) => String(fu.nextFollowupDate || '').slice(0, 10))
      .filter((d) => d && d >= today)
      .sort()[0] || ''
  );
}

export function buildLeadSearchString(lead) {
  return [
    lead.name,
    lead.company,
    lead.phone,
    lead.email,
    lead.stage,
    lead.owner,
    lead.source,
    lead.city,
    lead.status
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}
