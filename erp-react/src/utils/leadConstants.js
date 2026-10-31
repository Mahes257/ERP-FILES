// ERP pipeline stages (ERP/js/leads.js) — exact order and wording.
// ERP stage badge colours (ERP/css/leads.css .vl-stage-*) — exact hexes.
export const STAGES = [
  { value: 'New', label: 'New', chip: 'bg-[#f3f4f6] text-[#374151] border border-[#e5e7eb]' },
  { value: 'Contacted', label: 'Contacted', chip: 'bg-[#dbeafe] text-[#083D34] border border-[#bfdbfe]' },
  { value: 'Qualified', label: 'Qualified', chip: 'bg-[#d1fae5] text-[#065f46] border border-[#a7f3d0]' },
  { value: 'Proposal', label: 'Proposal', chip: 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]' },
  { value: 'Proposal Sent', label: 'Proposal Sent', chip: 'bg-[#fef3c7] text-[#92400e] border border-[#fde68a]' },
  { value: 'Negotiation', label: 'Negotiation', chip: 'bg-[#fce7f3] text-[#9d174d] border border-[#fbcfe8]' },
  { value: 'Won', label: 'Won', chip: 'bg-[#d1fae5] text-[#065f46] border border-[#a7f3d0]' },
  { value: 'Lost', label: 'Lost', chip: 'bg-[#fce4ec] text-[#c62828] border border-[#fecaca]' }
];

export const STAGE_BY_VALUE = Object.fromEntries(STAGES.map((s) => [s.value, s]));

export const PIPELINE_ORDER = STAGES.map((s) => s.value);

export const LEAD_STATUSES = [
  { value: 'Active', label: 'Active' },
  { value: 'Inactive', label: 'Inactive' },
  { value: 'Archived', label: 'Archived' }
];

export const LEAD_SOURCES = [
  'Website',
  'Referral',
  'Cold Call',
  'Trade Show',
  'LinkedIn',
  'Email Campaign',
  'Advertisement'
];

export const LEAD_COLUMNS = [
  { key: 'name', label: 'Lead Target', width: 210, sortable: true, visible: true, sticky: 'left' },
  { key: 'company', label: 'Company Entity', width: 170, sortable: true, visible: true, align: 'left' },
  { key: 'value', label: 'Estimated Value', width: 150, sortable: true, visible: true, align: 'right' },
  { key: 'stage', label: 'Pipeline Stage', width: 135, sortable: true, visible: true, align: 'center' },
  { key: 'owner', label: 'Owner', width: 150, sortable: true, visible: true, align: 'left' },
  { key: 'contact', label: 'Phone / Email', width: 210, sortable: false, visible: true, align: 'left' },
  { key: 'source', label: 'Lead Source', width: 140, sortable: true, visible: false, align: 'left' },
  { key: 'date', label: 'Registry Date', width: 135, sortable: true, visible: true, align: 'left' },
  { key: 'status', label: 'Status', width: 115, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

export const DEFAULT_VISIBLE_COLUMNS = LEAD_COLUMNS.filter((c) => c.visible).map((c) => c.key);

export const AVATAR_COLORS = [
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
  'bg-indigo-100 text-indigo-800',
  'bg-teal-100 text-teal-800',
  'bg-purple-100 text-purple-800',
  'bg-orange-100 text-orange-800',
  'bg-blue-100 text-blue-800',
  'bg-pink-100 text-pink-800'
];

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

export const STORAGE_KEYS = {
  columns: 'vishak:leads:columns',
  pageSize: 'vishak:leads:pageSize'
};
