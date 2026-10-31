import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Edit3,
  Trash2,
  X,
  ChevronDown,
  Building2,
  History,
  ExternalLink,
  Filter,
  RefreshCw,
  Clock,
  CheckCircle2,
  PhoneCall,
  CalendarPlus,
  Layers,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { useToast, FormField, TextInput, TextArea, Modal, ActionMenu, CreationActionBar } from '../Common';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import './marketing-form-actions.css';
import StatusBadge from '../Common/StatusBadge';
import SalesKpiCards from '../SalesTable/SalesKpiCards';
import SalesFilterPanel from '../SalesTable/SalesFilterPanel';
import SalesBreadcrumb from '../SalesTable/SalesBreadcrumb';
import CprPagination from '../CprTable/CprPagination';
import { openInNewTab as openRouteInNewTab } from '../../utils/navigationHelpers';
import marketingService from '../../services/marketingService';
import marketingSettingsService from '../../services/marketingSettingsService';

// ============================== Constants ==============================

const ACTIVITY_TYPES = [
  { key: 'followup', label: 'Follow-up', color: '#0B4A3D', bg: '#E8F0EE' },
  { key: 'extension', label: 'Visit Extension', color: '#7c3aed', bg: '#f5f3ff' },
];

// Rows per page in the follow-up / extension list. The value is referenced by the
// pagination maths below (totalPages, pageRows, the "Showing x—y of z" footer);
// without this declaration the whole page threw "PAGE_SIZE is not defined".
const PAGE_SIZE = 10;

// Fallback constants — overridden by dynamic settings from Marketing Settings
const STATUS_OPTIONS_FALLBACK = ['Pending','Scheduled','Completed','Interested','Not Interested','Negotiation','Waiting for Customer','Quotation Required','Converted','Cancelled','Overdue','Rescheduled'];
const OUTCOME_OPTIONS_FALLBACK = ['Interested','Not Interested','Need More Discussion','Quotation Required','Negotiation','Converted','No Lead','Existing Order','Lost Opportunity'];

// Dynamic settings from Marketing Settings (used inside component)
function useDynamicOptions() {
  const [dynamicOptions, setDynamicOptions] = useState({
    statuses: STATUS_OPTIONS_FALLBACK,
    outcomes: OUTCOME_OPTIONS_FALLBACK,
    followupTypes: ['Phone Call', 'WhatsApp', 'Email', 'Physical Meeting', 'Online Meeting'],
    nextActions: ['Send Quotation', 'Follow-up Call', 'Schedule Meeting', 'Send Email', 'Visit Again', 'Create Lead', 'Handover to Sales', 'No Action Required']
  });
  useEffect(() => {
    let cancelled = false;
    marketingSettingsService.getSettings().then((s) => {
      if (cancelled) return;
      const fs = s?.followupSettings || {};
      const ls = s?.leadSettings || {};
      setDynamicOptions({
        statuses: (fs.followupStatuses || []).map((x) => x.name).length > 0
          ? (fs.followupStatuses || []).map((x) => x.name)
          : [...STATUS_OPTIONS_FALLBACK],
        outcomes: (ls.leadStages || []).map((x) => x.name).length > 0
          ? (ls.leadStages || []).map((x) => x.name)
          : [...OUTCOME_OPTIONS_FALLBACK],
        followupTypes: (fs.followupTypes || []).map((x) => x.name).length > 0
          ? (fs.followupTypes || []).map((x) => x.name)
          : ['Phone Call', 'WhatsApp', 'Email', 'Physical Meeting', 'Online Meeting'],
        nextActions: ['Send Quotation', 'Follow-up Call', 'Schedule Meeting', 'Send Email', 'Visit Again', 'Create Lead', 'Handover to Sales', 'No Action Required']
      });
    }).catch(() => { /* keep fallbacks */ });
    return () => { cancelled = true; };
  }, []);
  return dynamicOptions;
}

// ============================== Helpers ==============================

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// Display reference built from the record's real ID (no generated FU-xxxx number
// exists in the data model). Matches the QF-{id} convention used elsewhere.
const isExtensionRow = (a) => String(a?.activityType || a?.source || '').toLowerCase().includes('extension');

// Follow-ups (marketing_followups) and extensions (marketing_visit_activities) are
// separate tables, so their ids overlap (both start at 1). The merged list must
// therefore be identified by source + id, not by id alone — keying rows by id
// produced duplicate React keys and made row highlight/scroll target the wrong record.
const activityRowKey = (a) => `${isExtensionRow(a) ? 'activity' : 'followup'}-${a?.id}`;
const activityRef = (a) => (isExtensionRow(a) ? `EXT-${a.id}` : `FU-${a.id}`);

const activityTypeMeta = (a) => ACTIVITY_TYPES.find(t => t.key === (isExtensionRow(a) ? 'extension' : 'followup')) || ACTIVITY_TYPES[0];

// Normalise a marketing_followups record (GET /marketing/follow-ups) into the
// same row shape used by the list so the two datasets render uniformly.
const followUpRow = (f) => ({
  id: f.id,
  source: 'followup',
  activityType: 'followup',
  visitNo: f.visitNo || (f.visitId != null ? `V-${f.visitId}` : ''),
  companyName: f.companyName || '',
  contactName: f.contactName || '',
  visitLocation: f.location || '',
  assignedEmployee: f.marketer || f.createdBy || '',
  activityDate: f.followupDate,
  nextAction: f.nextAction || '',
  status: f.status || 'Pending',
  updatedAt: f.updatedAt,
  mode: f.mode || '',
  purpose: f.purpose || '',
  customerResponse: f.customerResponse || '',
  remarks: f.remarks || '',
  visitId: f.visitId,
  leadId: f.leadId,
});

// ============================== Editable Creatable Dropdown ==============================

function EditableDropdown({ label, value, onChange, masterKey, options: staticOptions, placeholder, required }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [customValues, setCustomValues] = useState([]);
  const ref = useRef(null);
  const toast = useToast();

  // Load master values
  const [masterValues, setMasterValues] = useState([]);
  useEffect(() => {
    if (!masterKey) return;
    let cancelled = false;
    marketingService.getMasterValues(masterKey).then(res => {
      if (!cancelled) {
        const vals = Array.isArray(res) ? res.map(v => v.value || v) : [];
        setMasterValues(vals);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [masterKey]);

  const allOptions = useMemo(() => {
    const combined = [...new Set([...(staticOptions || []), ...masterValues, ...customValues])];
    if (!query) return combined;
    return combined.filter(o => o.toLowerCase().includes(query.toLowerCase()));
  }, [staticOptions, masterValues, customValues, query]);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleAddCustom = async () => {
    const val = query.trim();
    if (!val) return;
    if (masterKey) {
      try {
        await marketingService.createMasterValue(masterKey, val);
        setMasterValues(prev => [...prev, val]);
      } catch { /* already exists */ }
    } else {
      setCustomValues(prev => [...prev, val]);
    }
    onChange({ target: { value: val } });
    setQuery('');
    setOpen(false);
    toast.success(`"${val}" added`);
  };

  return (
    <FormField label={label} required={required}>
      <div className="ved-dropdown" ref={ref}>
        <button type="button" className="ved-trigger" onClick={() => setOpen(!open)}>
          <span className={value ? 'ved-value' : 'ved-placeholder'}>{value || placeholder || `Select ${label}`}</span>
          <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
        </button>
        {open && (
          <div className="ved-menu">
            <div className="ved-search-wrap">
              <input
                type="text"
                className="ved-search"
                placeholder="Search or type..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
            </div>
            <div className="ved-options">
              {allOptions.map(opt => (
                <button
                  key={opt}
                  type="button"
                  className={`ved-option${opt === value ? ' selected' : ''}`}
                  onClick={() => { onChange({ target: { value: opt } }); setOpen(false); setQuery(''); }}
                >
                  {opt}
                </button>
              ))}
              {query && !allOptions.some(o => o.toLowerCase() === query.toLowerCase()) && (
                <button type="button" className="ved-add-custom" onClick={handleAddCustom}>
                  <Plus size={12} /> Add "{query}"
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </FormField>
  );
}

// ============================== Original Visit Picker ==============================
// Shown inside the creation form when no visit has been preselected, so the
// user picks the original visit as part of the form (never as a pre-step).

function OriginalVisitPicker({ visits, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return visits;
    const q = query.toLowerCase();
    return visits.filter(v =>
      (v.companyName || '').toLowerCase().includes(q) ||
      (v.visitNo || '').toLowerCase().includes(q) ||
      (v.contactPerson || '').toLowerCase().includes(q) ||
      (v.location || '').toLowerCase().includes(q)
    );
  }, [visits, query]);

  return (
    <div className="vfue-selector" ref={ref}>
      <label className="vfue-selector-label">Original Visit <span style={{ color: '#ef4444' }}>*</span></label>
      <button type="button" className="vfue-selector-trigger" onClick={() => setOpen(!open)}>
        <Building2 size={15} className="text-slate-400" />
        <span className={value ? 'vfue-sel-value' : 'vfue-sel-placeholder'}>
          {value
            ? `${value.visitNo || ''} — ${value.companyName || ''}${value.location ? ` (${value.location})` : ''}`
            : 'Search by business, contact, visit reference...'}
        </span>
        <ChevronDown size={14} className={open ? 'rotate-180' : ''} />
      </button>
      {open && (
        <div className="vfue-sel-menu">
          <input
            type="text"
            className="vfue-sel-search"
            placeholder="🔍 Search visits..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="vfue-sel-list">
            {filtered.length === 0 && <div className="vfue-sel-empty">No visits found</div>}
            {filtered.map(v => (
              <button
                key={v.id}
                type="button"
                className={`vfue-sel-item${value && value.id === v.id ? ' selected' : ''}`}
                onClick={() => { onChange(v); setOpen(false); setQuery(''); }}
              >
                <div className="vfue-sel-item-main">
                  <strong>{v.companyName || '—'}</strong>
                  <span>{v.contactPerson || '—'} · {v.visitNo || ''}{v.location ? ` · ${v.location}` : ''}</span>
                </div>
                <span className="vfue-sel-item-date">{v.scheduleDate || ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================== Activity Form ==============================
// Reused by the standalone Follow-up / Visit Extension creation & edit pages.

export function ActivityForm({ type, initial = {}, visit, visits = [], onSave, onCancel, saving }) {
  const toast = useToast();
  const dynamicOptions = useDynamicOptions();
  const [form, setForm] = useState(() => ({
    activityDate: new Date().toISOString().slice(0, 10),
    activityTime: '',
    companyName: visit?.companyName || '',
    contactName: visit?.contactPerson || '',
    contactDesignation: visit?.designation || '',
    contactDepartment: '',
    contactPhone: visit?.phone || '',
    contactWhatsApp: '',
    contactEmail: visit?.email || '',
    followupType: 'Phone Call',
    discussion: '',
    customerResponse: '',
    status: 'Pending',
    outcome: '',
    customerRequirement: '',
    nextAction: '',
    nextFollowupDate: '',
    nextFollowupTime: '',
    assignedEmployee: '',
    remarks: '',
    groupName: '',
    ...initial,
  }));
  const [linkedVisit, setLinkedVisit] = useState(visit || null);

  const resolvedType = type || initial.activityType || 'followup';
  const isExtension = resolvedType === 'extension';

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  const handleLinkVisit = (v) => {
    setLinkedVisit(v);
    setForm(prev => ({
      ...prev,
      companyName: prev.companyName || v.companyName || '',
      contactName: prev.contactName || v.contactPerson || '',
      contactDesignation: prev.contactDesignation || v.designation || '',
      contactPhone: prev.contactPhone || v.phone || '',
      contactEmail: prev.contactEmail || v.email || '',
    }));
  };

  const submit = () => {
    if (!form.activityDate) { toast.error('Activity date is required'); return; }
    if (!linkedVisit?.id) { toast.error('Please select the original visit first'); return; }
    onSave({
      ...form,
      activityType: resolvedType,
      visitId: linkedVisit.id,
    });
  };

  return (
    <div className="af-form">
      {!visit && (
        <>
          <h4 className="af-section-title">Original Visit</h4>
          <OriginalVisitPicker visits={visits} value={linkedVisit} onChange={handleLinkVisit} />
          {linkedVisit && (
            <div className="ovr-card" style={{ marginTop: 10 }}>
              <div className="ovr-header">
                <Building2 size={16} className="text-[#0B4A3D]" />
                <h4 className="ovr-title">Linked Visit</h4>
              </div>
              <div className="ovr-grid">
                <div className="ovr-field"><span>Visit Reference</span><strong>{linkedVisit.visitNo || '—'}</strong></div>
                <div className="ovr-field"><span>Business</span><strong>{linkedVisit.companyName || '—'}</strong></div>
                <div className="ovr-field"><span>Contact</span><strong>{linkedVisit.contactPerson || '—'}</strong></div>
                <div className="ovr-field"><span>Location</span><strong>{linkedVisit.location || '—'}</strong></div>
                <div className="ovr-field"><span>Visit Date</span><strong>{linkedVisit.scheduleDate || '—'}</strong></div>
                <div className="ovr-field"><span>Mobile</span><strong>{linkedVisit.phone || '—'}</strong></div>
              </div>
            </div>
          )}
        </>
      )}

      <h4 className="af-section-title">
        {isExtension ? 'Visit Extension Details' : 'Follow-up Details'}
      </h4>

      <div className="af-grid">
        <FormField label="Activity Date" required>
          <TextInput type="date" value={form.activityDate} onChange={set('activityDate')} />
        </FormField>
        <FormField label="Activity Time">
          <TextInput type="time" value={form.activityTime} onChange={set('activityTime')} />
        </FormField>
      </div>

      <h4 className="af-section-title">Business & Contact</h4>
      <div className="af-grid">
        <FormField label="Business">
          <TextInput value={form.companyName} onChange={set('companyName')} placeholder="Business name" />
        </FormField>
        <FormField label="Contact Name">
          <TextInput value={form.contactName} onChange={set('contactName')} placeholder="Contact person" />
        </FormField>
        <EditableDropdown label="Designation" value={form.contactDesignation} onChange={set('contactDesignation')} masterKey="mkt_designations" placeholder="Select or type..." />
        <EditableDropdown label="Department" value={form.contactDepartment} onChange={set('contactDepartment')} masterKey="mkt_departments" placeholder="Select or type..." />
        <FormField label="Phone">
          <TextInput value={form.contactPhone} onChange={set('contactPhone')} />
        </FormField>
        <FormField label="WhatsApp">
          <TextInput value={form.contactWhatsApp} onChange={set('contactWhatsApp')} />
        </FormField>
        <FormField label="Email">
          <TextInput type="email" value={form.contactEmail} onChange={set('contactEmail')} />
        </FormField>
      </div>

      {!isExtension && (
        <>
          <h4 className="af-section-title">Follow-up</h4>
          <div className="af-grid">
            <EditableDropdown label="Follow-up Type" value={form.followupType} onChange={set('followupType')} masterKey="mkt_followup_types" placeholder="Select type..." />
            <EditableDropdown label="Status" value={form.status} onChange={set('status')} masterKey="mkt_statuses" options={dynamicOptions.statuses} placeholder="Select status..." />
          </div>
        </>
      )}

      <h4 className="af-section-title">Discussion & Outcome</h4>
      <div className="af-grid">
        <div className="af-full">
          <FormField label={isExtension ? 'Purpose' : 'Discussion / Update'}>
            <TextArea value={form.discussion} onChange={set('discussion')} rows={3} placeholder="Describe the discussion..." />
          </FormField>
        </div>
        {isExtension && (
          <div className="af-full">
            <FormField label="Customer Requirement">
              <TextArea value={form.customerRequirement} onChange={set('customerRequirement')} rows={2} />
            </FormField>
          </div>
        )}
        <div className="af-full">
          <FormField label="Customer Response">
            <TextArea value={form.customerResponse} onChange={set('customerResponse')} rows={2} />
          </FormField>
        </div>
        <EditableDropdown label="Outcome" value={form.outcome} onChange={set('outcome')} masterKey="mkt_outcomes" options={dynamicOptions.outcomes} placeholder="Select outcome..." />
        {!isExtension && (
          <EditableDropdown label="Status" value={form.status} onChange={set('status')} masterKey="mkt_statuses" options={dynamicOptions.statuses} placeholder="Select status..." />
        )}
      </div>

      <h4 className="af-section-title">Next Follow-up</h4>
      <div className="af-grid">
        <EditableDropdown label="Next Action" value={form.nextAction} onChange={set('nextAction')} masterKey="mkt_next_actions" placeholder="Select action..." />
        <FormField label="Next Follow-up Date">
          <TextInput type="date" value={form.nextFollowupDate} onChange={set('nextFollowupDate')} />
        </FormField>
        <FormField label="Next Follow-up Time">
          <TextInput type="time" value={form.nextFollowupTime} onChange={set('nextFollowupTime')} />
        </FormField>
        <FormField label="Assigned Employee">
          <TextInput value={form.assignedEmployee} onChange={set('assignedEmployee')} placeholder="Employee name" />
        </FormField>
      </div>

      <h4 className="af-section-title">Additional</h4>
      <div className="af-grid">
        <EditableDropdown label="Group" value={form.groupName} onChange={set('groupName')} masterKey="mkt_groups" placeholder="Select group..." />
        <div className="af-full">
          <FormField label="Remarks">
            <TextArea value={form.remarks} onChange={set('remarks')} rows={2} />
          </FormField>
        </div>
      </div>

      {/* ERP standard creation action bar (the enclosing page/modal header
          already carries the "Back to List" action). */}
      <CreationActionBar
        showBackToList={false}
        className="mkt-action-scope"
        onCancel={onCancel}
        onSave={submit}
        saveLabel={saving ? 'Saving...' : initial?.id ? 'Save Changes' : 'Save'}
        disabled={saving}
      />
    </div>
  );
}

// ============================== Main Component — Complete List Page ==============================

/**
 * Creation actions for Follow-ups & Extensions.
 *
 * Shared by the standalone page header (`/marketing/follow-ups`) and the
 * Marketing hub header, so both render the exact same ERP buttons and open the
 * existing creation routes in a new tab (the ERP convention for embedded list
 * pages — see SalesExecHub).
 */
export function FollowUpExtensionActions() {
  const { can } = useMarketingAccess();
  if (!can('followups', 'create')) return null;
  return (
    <>
      <button
        type="button"
        className="po-btn po-btn-secondary"
        onClick={() => openRouteInNewTab('/marketing/follow-ups/extensions/new')}
        title="Create New Visit Extension"
      >
        <CalendarPlus className="po-btn-icon-ic" />
        <span>Visit Extension</span>
      </button>
      <button
        type="button"
        className="po-btn po-btn-primary"
        onClick={() => openRouteInNewTab('/marketing/follow-ups/new')}
        title="Create New Follow-up"
      >
        <Plus className="po-btn-icon-ic" />
        <span>New Follow-up</span>
      </button>
    </>
  );
}

/** Status comparison that ignores case / surrounding whitespace. */
const isStatus = (record, expected) =>
  String(record?.status || '').trim().toLowerCase() === expected;

/**
 * Follow-ups & Extensions list.
 *
 * `embedded` is set by the Marketing hub, which renders the breadcrumb, page
 * title and module tabs itself (same contract as SalesListPage / Cprs). The
 * standalone route renders that header here instead.
 */
export default function VisitFollowUpExtension({ embedded = false }) {
  // Follow-up / Extension action permissions (UI gate; the backend enforces).
  const { can } = useMarketingAccess();
  const canEdit = can('followups', 'edit');
  const canDelete = can('followups', 'delete');
  const toast = useToast();
  const dynamicOptions = useDynamicOptions();

  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Search / filters (applied over the complete dataset)
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filter panel visibility — ERP pattern: a "Show Filters" toggle in the
  // toolbar opens the shared pr-filter-panel below it.
  const [showFilters, setShowFilters] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);

  // Open-follow-up modal + row highlight
  const [openActivity, setOpenActivity] = useState(null);
  const [highlightId, setHighlightId] = useState(null);
  const tableRef = useRef(null);

  // The Marketing Follow-ups dataset lives in marketing_followups; visit
  // extensions live in marketing_visit_activities (activityType=extension).
  // Load both from their own APIs and merge into a single typed list.
  const loadActivities = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [followUpsRes, activityList] = await Promise.all([
        marketingService.listFollowUps({ size: 500 }),
        marketingService.listActivities(),
      ]);
      const followUps = (followUpsRes?.content || (Array.isArray(followUpsRes) ? followUpsRes : []))
        .map(followUpRow);
      const extensions = (Array.isArray(activityList) ? activityList : [])
        .filter((a) => isExtensionRow(a))
        .map((a) => ({ ...a, source: 'activity', activityType: 'extension' }));
      setActivities([...followUps, ...extensions]);
    } catch (err) {
      setLoadError(err?.message || 'Failed to load follow-ups and extensions.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadActivities, 0);
    return () => clearTimeout(t);
  }, [loadActivities]);

  // Clear highlight after a moment
  useEffect(() => {
    if (!highlightId) return undefined;
    const t = setTimeout(() => setHighlightId(null), 2600);
    return () => clearTimeout(t);
  }, [highlightId]);

  const followupCount = useMemo(() => activities.filter(a => a.source === 'followup' || !isExtensionRow(a)).length, [activities]);
  const extensionCount = activities.length - followupCount;

  const assignedOptions = useMemo(() => {
    const set = new Set();
    activities.forEach(a => {
      const name = a.assignedEmployee || a.createdBy || '';
      if (name) set.add(name);
    });
    return [...set].sort();
  }, [activities]);

  const statusOptions = useMemo(() => {
    const present = [...new Set(activities.map(a => a.status).filter(Boolean))];
    const ordered = dynamicOptions.statuses.filter(s => present.includes(s));
    const rest = present.filter(s => !dynamicOptions.statuses.includes(s)).sort();
    return [...ordered, ...rest];
  }, [activities]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activities.filter(a => {
      if (typeFilter && a.activityType !== typeFilter) return false;
      if (statusFilter && (a.status || '') !== statusFilter) return false;
      if (assignedFilter && (a.assignedEmployee || a.createdBy || '') !== assignedFilter) return false;
      if (dateFrom && (!a.activityDate || String(a.activityDate) < dateFrom)) return false;
      if (dateTo && (!a.activityDate || String(a.activityDate) > dateTo)) return false;
      if (!q) return true;
      const hay = [
        activityRef(a), a.visitNo, a.companyName, a.contactName, a.visitLocation,
        a.assignedEmployee, a.createdBy, a.status, a.nextAction, a.outcome, a.followupType
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [activities, search, typeFilter, statusFilter, assignedFilter, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(safePage * pageSize, safePage * pageSize + pageSize);

  const hasFilters = !!(search || typeFilter || statusFilter || assignedFilter || dateFrom || dateTo);

  // ---- Shared ERP filter panel (same component the Sales lists use) ----
  const filterValues = useMemo(() => ({
    type: typeFilter,
    status: statusFilter,
    assigned: assignedFilter,
    dateFrom,
    dateTo
  }), [typeFilter, statusFilter, assignedFilter, dateFrom, dateTo]);

  const filterFields = useMemo(() => ([
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      placeholder: 'All Types',
      options: [
        { value: 'followup', label: 'Follow-up' },
        { value: 'extension', label: 'Visit Extension' }
      ]
    },
    {
      key: 'status',
      label: 'Status',
      type: statusOptions.length ? 'select' : 'text',
      placeholder: 'All Statuses',
      options: statusOptions
    },
    {
      key: 'assigned',
      label: 'Assigned To',
      type: assignedOptions.length ? 'select' : 'text',
      placeholder: 'Everyone',
      options: assignedOptions
    },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ]), [statusOptions, assignedOptions]);

  const setFilter = useCallback((key, value) => {
    if (key === 'type') setTypeFilter(value);
    else if (key === 'status') setStatusFilter(value);
    else if (key === 'assigned') setAssignedFilter(value);
    else if (key === 'dateFrom') setDateFrom(value);
    else if (key === 'dateTo') setDateTo(value);
    setPage(0);
  }, []);

  // ---- KPI summary cards ----
  // Plain counts over the records the backend returned (no invented metrics).
  const kpiCards = useMemo(() => ([
    { key: 'total', label: 'Total Records', value: activities.length, icon: Layers, color: '#0A4F44', static: true },
    { key: 'followups', label: 'Follow-ups', value: followupCount, icon: PhoneCall, color: '#2563eb', static: true },
    { key: 'extensions', label: 'Visit Extensions', value: extensionCount, icon: CalendarPlus, color: '#7c3aed', static: true },
    { key: 'pending', label: 'Pending', value: activities.filter((a) => isStatus(a, 'pending')).length, icon: Clock, color: '#d97706', static: true },
    { key: 'overdue', label: 'Overdue', value: activities.filter((a) => isStatus(a, 'overdue')).length, icon: AlertTriangle, color: '#dc2626', static: true },
    { key: 'completed', label: 'Completed', value: activities.filter((a) => isStatus(a, 'completed')).length, icon: CheckCircle2, color: '#16a34a', static: true }
  ]), [activities, followupCount, extensionCount]);

  const resetFilters = () => {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    setAssignedFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  const openInNewTab = (path) => {
    window.open(path, '_blank', 'noopener');
  };

  const handleOpenExistingPage = () => {
    const act = openActivity;
    setOpenActivity(null);
    if (!act) return;
    // Reveal the row: clear search/filters, jump to its page, scroll + flash.
    resetFilters();
    const idx = activities.findIndex(a => activityRowKey(a) === activityRowKey(act));
    if (idx >= 0) {
      setPage(Math.floor(idx / pageSize));
      setTimeout(() => {
        setHighlightId(activityRowKey(act));
        const row = tableRef.current?.querySelector(`[data-activity-id="${activityRowKey(act)}"]`);
        row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
    }
  };

  const handleDelete = async (e, act) => {
    e?.stopPropagation();
    if (!window.confirm(`Delete ${activityRef(act)}?`)) return;
    try {
      if (act.source === 'followup') {
        await marketingService.deleteFollowUp(act.id);
        toast.success('Follow-up deleted');
      } else {
        await marketingService.deleteActivity(act.id);
        toast.success('Activity deleted');
      }
      loadActivities();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete');
    }
  };

  return (
    /* Same page shell as every other ERP list page (Cprs / SalesListPage) so the
       shared .cpr-page toolbar, filter panel, table and pagination styles apply. */
    <div className="purchase-page cpr-page flex-1">

      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside the hub) ===== */}
      {!embedded && (
        <>
          <SalesBreadcrumb
            items={[
              { label: 'Marketing', to: '/marketing' },
              { label: 'Follow-ups & Extensions' }
            ]}
          />
          <div className="pr-page-header">
            <div className="pr-page-header-title">
              <h1>
                <History size={20} />
                Follow-ups & Extensions
              </h1>
              <p className="po-page-header-subtitle">
                Manage marketing activities, visits, follow-ups, forms and expenses.
              </p>
            </div>
            <div className="pr-page-header-actions">
              <FollowUpExtensionActions />
            </div>
          </div>
        </>
      )}

      {/* ===== KPI CARDS (counts over the records the backend returned) ===== */}
      <SalesKpiCards cards={kpiCards} />

      {/* ===== All Records primary tab (PR reference: pr-tab with count) ===== */}
      <div className="pr-tabs">
        <button type="button" role="tab" aria-selected="true" className="pr-tab active">
          All Follow-ups & Extensions <span className="tab-count">{activities.length}</span>
        </button>
      </div>

      {/* ===== Segmented control (same chrome as Cprs / CrmErpList / QFormList) =====
          Splits the merged dataset by record type. Both counts are real counts
          over the records the backend returned — no invented buckets. */}
      <div className="segmented-control" role="tablist" aria-label="Record type">
        {[
          { value: '', label: 'All Records', count: activities.length },
          { value: 'followup', label: 'Follow-ups', count: followupCount },
          { value: 'extension', label: 'Visit Extensions', count: extensionCount }
        ].map((tab) => (
          <button
            key={tab.value || 'all'}
            type="button"
            role="tab"
            aria-selected={typeFilter === tab.value}
            className={`segmented-option${typeFilter === tab.value ? ' active' : ''}`}
            onClick={() => setFilter('type', tab.value)}
          >
            {tab.label} <span className="tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ===== TOOLBAR (Show Filters + Refresh left | Search + count right) ===== */}
      <div className="pr-toolbar">
        <div className="pr-toolbar-left">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="btn btn-ghost btn-sm"
            aria-expanded={showFilters}
          >
            <Filter size={12} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadActivities}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>

        <div className="pr-toolbar-right">
          <input
            type="text"
            className="pr-search-input"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search Follow-up No, Customer, Visit Reference..."
            aria-label="Search follow-ups and extensions"
            autoComplete="off"
          />
          {search && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => { setSearch(''); setPage(0); }}
            >
              <X size={12} /> Clear
            </button>
          )}
          <span className="toolbar-count">
            Showing {filtered.length === 0 ? '0-0' : `${safePage * pageSize + 1}-${Math.min((safePage + 1) * pageSize, filtered.length)}`} of {filtered.length}
          </span>
        </div>
      </div>

      {/* ===== FILTER PANEL (shared ERP panel) ===== */}
      <SalesFilterPanel
        open={showFilters}
        filters={filterValues}
        onChange={setFilter}
        onReset={resetFilters}
        fields={filterFields}
      />

      {/* ===== ERROR STATE ===== */}
      {loadError && (
        <div className="cpr-error-banner" role="alert">
          <p>{loadError}</p>
          <button type="button" className="cpr-error-retry" onClick={loadActivities}>Try Again</button>
        </div>
      )}

      {/* ===== TABLE ===== */}
      <div className="pr-table-card">
        <div className="pr-table-wrap" ref={tableRef}>
          <table className="pr-table sgrid sgrid-mkt pr-table-fixed" style={{ tableLayout: 'fixed', minWidth: 1720 }}>
            <colgroup>
              <col style={{ width: 130 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 110 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 170 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 180 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 150 }} />
              <col style={{ width: 100 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="sgrid-pin sgrid-first">Follow-up No</th>
                <th>Type</th>
                <th>Visit</th>
                <th>Customer</th>
                <th>Contact Person</th>
                <th>Location</th>
                <th>Assigned To</th>
                <th>Date</th>
                <th>Next Action</th>
                <th>Status</th>
                <th>Updated</th>
                <th className="sgrid-pin-actions" style={{ textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>Loading follow-ups and extensions...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px 20px', color: '#9CA3AF' }}>
                  {hasFilters ? 'No follow-ups or extensions match the current search / filters.' : 'No follow-ups or extensions yet. Use "+ New Follow-up" or "+ Visit Extension" to create the first one.'}
                </td></tr>
              ) : (
                pageRows.map(a => {
                  const meta = activityTypeMeta(a);
                  return (
                    <tr
                      key={activityRowKey(a)}
                      data-activity-id={activityRowKey(a)}
                      className={`vfue-row${highlightId === activityRowKey(a) ? ' vfue-row-flash' : ''}`}
                    >
                      <td className="sgrid-pin sgrid-first">
                        <button
                          type="button"
                          className="vfue-ref-link"
                          onClick={() => setOpenActivity(a)}
                          title="Open follow-up"
                        >
                          {activityRef(a)}
                        </button>
                      </td>
                      <td>
                        <span className="vfue-type-badge" style={{ color: meta.color, backgroundColor: meta.bg }}>
                          {meta.label}
                        </span>
                      </td>
                      <td className="cell-id" title={a.visitNo || `V-${a.visitId || ''}`}>{a.visitNo || `V-${a.visitId || ''}`}</td>
                      <td style={{ fontWeight: 600 }} title={a.companyName || a.visitCompanyName || ''}>{a.companyName || a.visitCompanyName || '—'}</td>
                      <td title={a.contactName || ''}>{a.contactName || '—'}</td>
                      <td title={a.visitLocation || ''}>{a.visitLocation || '—'}</td>
                      <td title={a.assignedEmployee || a.createdBy || ''}>{a.assignedEmployee || a.createdBy || '—'}</td>
                      <td className="cell-date">{fmtDate(a.activityDate)}</td>
                      <td title={a.nextAction || ''}>{a.nextAction || '—'}</td>
                      <td><StatusBadge status={a.status} /></td>
                      <td className="cell-date">{fmtDateTime(a.updatedAt)}</td>
                      <td className="sgrid-pin-actions" style={{ textAlign: 'center' }}>
                        <ActionMenu
                          triggerClassName="erp-row-action-btn"
                          items={[
                            { key: 'view', label: `View ${meta.label}`, icon: Eye },
                            ...(canEdit ? [{ key: 'edit', label: 'Edit', icon: Edit3 }] : []),
                            ...(canDelete ? [
                              { divider: true },
                              { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
                            ] : [])
                          ]}
                          onAction={(key) => {
                            if (key === 'view') setOpenActivity(a);
                            else if (key === 'edit') openInNewTab(`/marketing/follow-ups/${a.id}/edit?src=${a.source === 'followup' ? 'followup' : 'activity'}`);
                            else if (key === 'delete') handleDelete(null, a);
                          }}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===== PAGINATION (shared ERP pagination) ===== */}
      {!loading && (
        <CprPagination
          total={filtered.length}
          currentPage={safePage + 1}
          totalPages={totalPages}
          pageSize={pageSize}
          onPageChange={(p) => setPage(p - 1)}
          onPageSizeChange={(size) => { setPageSize(size); setPage(0); }}
        />
      )}

      {/* Open Follow-up modal */}
      <Modal
        open={!!openActivity}
        onClose={() => setOpenActivity(null)}
        title={openActivity ? `Open ${activityRef(openActivity)}` : 'Open Follow-up'}
        maxWidth="max-w-sm"
        footer={
          openActivity && (
            <div className="w-full flex flex-col gap-2">
              <button type="button" className="vfue-btn primary w-full justify-center" onClick={handleOpenExistingPage}>
                Open in Existing Page
              </button>
              <button type="button" className="vfue-btn secondary w-full justify-center" onClick={() => { const path = '/marketing/follow-ups'; setOpenActivity(null); openInNewTab(path); }}>
                <ExternalLink size={13} /> Open in New Tab
              </button>
              <button type="button" className="vfue-btn secondary w-full justify-center" onClick={() => setOpenActivity(null)}>
                Cancel
              </button>
            </div>
          )
        }
      >
        {openActivity && (
          <div className="space-y-2 text-[12px] text-slate-600">
            <div className="flex justify-between gap-2"><span className="text-slate-400">Customer</span><strong className="text-slate-800 text-right">{openActivity.companyName || openActivity.visitCompanyName || '—'}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Visit</span><strong className="text-slate-800 text-right">{openActivity.visitNo || '—'}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Contact</span><strong className="text-slate-800 text-right">{openActivity.contactName || '—'}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Location</span><strong className="text-slate-800 text-right">{openActivity.visitLocation || '—'}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Date</span><strong className="text-slate-800 text-right">{fmtDate(openActivity.activityDate)}</strong></div>
            <div className="flex justify-between gap-2"><span className="text-slate-400">Status</span><strong className="text-slate-800 text-right"><StatusBadge status={openActivity.status} /></strong></div>
          </div>
        )}
      </Modal>
    </div>
  );
}