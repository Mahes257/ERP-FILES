import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Plus, Filter, X, Save, Send, Check, Trash2, CalendarClock, ScanSearch, Ban,
  AlertTriangle, CheckCircle, RotateCcw, ChevronDown
} from 'lucide-react';
import { useToast, ActionMenu, RecordPreviewModal } from '../Common';
import StatusBadge from '../Common/StatusBadge';
import marketingService, { travelScheduleAttachments } from '../../services/marketingService';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import customerService from '../../services/customerService';
import PendingAttachments from '../SalesForm/PendingAttachments';
import SalesAttachments from '../SalesDetail/SalesAttachments';
import '../../pages/crm/crm-erp.css';
import './marketing-form-actions.css';

// ============================== Constants ==============================

// Tab KEYS drive the server-side `status` param; labels are display-only.
const SCHEDULE_TABS = [
  { key: 'all', label: 'All Schedules' },
  { key: 'create', label: 'New Schedule' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' }
];

// Status filter per tab (server-side `status` param on /marketing/travel-schedules).
// 'all' / 'create' send no status -> every schedule the caller may see.
const TAB_STATUS = {
  pending: 'Submitted',
  approved: 'Approved',
  upcoming: 'Approved',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const EDITABLE_STATUSES = ['Draft', 'Submitted', 'Revision Required', 'Rejected'];

const PRIORITY_CLASS = {
  Normal: 'text-slate-500',
  High: 'text-amber-600 font-bold',
  Urgent: 'text-rose-600 font-bold'
};

const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');
const fmtTime = (v) => (v ? String(v).slice(0, 5) : '');
const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16).replace('T', ' ');
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

function parsePageResponse(response) {
  if (Array.isArray(response)) return { list: response, total: response.length };
  if (response?.content) return { list: response.content, total: response.totalElements ?? response.content.length };
  return { list: [], total: 0 };
}

function parseListPayload(response) {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  return [];
}

// ============================== Module-level fetchers ==============================
// Kept outside the components so each render body stays free of traced setState
// chains (the repo's react-hooks rules flag those) and stays consistent with
// how the Travel Registry loads its data.

async function fetchCustomers(setCustomers) {
  try {
    const res = await customerService.list();
    setCustomers(parseListPayload(res));
  } catch {
    // The client picker is optional — no CRM read access means no options.
    setCustomers([]);
  }
}

async function fetchScheduleAttachments(setAttachments, scheduleId) {
  if (!scheduleId) return;
  try {
    const res = await marketingService.getTravelScheduleAttachments(scheduleId);
    setAttachments(parseListPayload(res));
  } catch {
    setAttachments([]);
  }
}

async function fetchScheduleOptions(setOptions) {
  try {
    setOptions(await marketingService.getTravelScheduleOptions());
  } catch {
    setOptions({ purposes: [], priorities: [], travelModes: [], employees: [] });
  }
}

async function fetchSchedules(setters, params) {
  const { setSchedules, setTotal, setLoading, setLoadError } = setters;
  setLoading(true);
  setLoadError('');
  try {
    const res = await marketingService.listTravelSchedules(params);
    const parsed = parsePageResponse(res);
    setSchedules(parsed.list);
    setTotal(parsed.total);
  } catch (err) {
    setSchedules([]);
    setTotal(0);
    setLoadError(err?.message || 'Failed to load travel schedules');
  } finally {
    setLoading(false);
  }
}

// ============================== Typeable select ==============================

/**
 * TypeableSelect — "select an existing option or type a new one" dropdown for
 * the New Schedule form.
 *
 * The module's own option list stays the source of choices: focusing the field
 * shows every option, typing filters them case-insensitively, ↑/↓ move the
 * highlight and a click selects. A value the list does not carry can still be
 * entered — typed text is committed with Enter (or by leaving the field), and an
 * exact match is stored in the option's canonical casing, so "plant survey"
 * becomes "Plant Survey" instead of a second, differently-cased entry.
 *
 * Enter commits THIS field only: it never submits the schedule. Escape closes
 * the list, and clearing the text clears the field, which the form's existing
 * required-field check then reports on save.
 *
 * Only fields whose column stores free text and whose service accepts it may
 * use this control — identifiers (employee, customer) and closed enums (priority,
 * travel mode) stay plain selects so they can never carry an invalid reference.
 */
function TypeableSelect({
  value,
  options = [],
  onChange,
  inputClassName,
  placeholder = 'Select or type…',
  emptyLabel = '— None —',
  maxLength,
  ariaLabel
}) {
  const [open, setOpen] = useState(false);
  // `typed` separates "just opened — show every option" from "the user is
  // filtering", so opening the field never hides the value already stored.
  const [typed, setTyped] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => String(option).toLowerCase().includes(q));
  }, [options, query]);

  // A click outside the field closes the list (and the blur below commits).
  useEffect(() => {
    if (!open) return undefined;
    const onDocumentMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentMouseDown);
    return () => document.removeEventListener('mousedown', onDocumentMouseDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setTyped(false);
    setQuery('');
    setHighlight(-1);
  };

  // Empty input clears the field; otherwise an exact option match keeps the
  // option's canonical casing and anything else is stored exactly as typed.
  const commit = (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) {
      onChange('');
      return;
    }
    const match = options.find(
      (option) => String(option).trim().toLowerCase() === text.toLowerCase()
    );
    onChange(match || text);
  };

  const commitSelection = () => {
    if (highlight >= 0 && filtered[highlight] != null) commit(filtered[highlight]);
    else if (typed) commit(query);
    close();
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => (filtered.length ? (h < filtered.length - 1 ? h + 1 : 0) : -1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => (filtered.length ? (h > 0 ? h - 1 : filtered.length - 1) : -1));
    } else if (event.key === 'Enter') {
      // Accept this field's value — never submit the schedule form.
      event.preventDefault();
      event.stopPropagation();
      if (open) commitSelection();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const trimmedQuery = query.trim();
  const offersCustomRow =
    Boolean(trimmedQuery) &&
    !options.some((option) => String(option).trim().toLowerCase() === trimmedQuery.toLowerCase());

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        role="combobox"
        autoComplete="off"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-autocomplete="list"
        aria-label={ariaLabel || placeholder}
        value={open && typed ? query : value || ''}
        maxLength={maxLength}
        placeholder={placeholder}
        className={`${inputClassName} pr-6`}
        onFocus={() => { setOpen(true); setTyped(false); setQuery(''); setHighlight(-1); }}
        onClick={() => { if (!open) { setOpen(true); setTyped(false); setQuery(''); setHighlight(-1); } }}
        onChange={(event) => {
          setOpen(true);
          setTyped(true);
          setQuery(event.target.value);
          setHighlight(-1);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          // A typed value is kept even without Enter, so clicking a Save button
          // straight from the field cannot silently drop it.
          if (typed && trimmedQuery !== String(value || '').trim()) commit(trimmedQuery);
          close();
        }}
      />
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      {open && (
        <div
          id={listId}
          role="listbox"
          aria-label={ariaLabel || placeholder}
          className="absolute left-0 right-0 top-full mt-1 z-40 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg"
        >
          {!trimmedQuery && (
            <button
              type="button"
              role="option"
              aria-selected={false}
              onMouseDown={(event) => { event.preventDefault(); commit(''); close(); }}
              className="w-full text-left px-2 py-1.5 text-xs text-slate-400 border-b border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
            >
              {emptyLabel}
            </button>
          )}
          {filtered.map((option, index) => (
            <div
              key={option}
              role="option"
              aria-selected={index === highlight}
              onMouseDown={(event) => { event.preventDefault(); commit(option); close(); }}
              onMouseEnter={() => setHighlight(index)}
              className={`px-2 py-1.5 text-xs border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer ${
                index === highlight ? 'bg-slate-100 text-slate-700' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {option}
            </div>
          ))}
          {filtered.length === 0 && !offersCustomRow && (
            <div className="px-2 py-1.5 text-xs text-slate-400">No matching option</div>
          )}
          {offersCustomRow && (
            <button
              type="button"
              onMouseDown={(event) => { event.preventDefault(); commit(trimmedQuery); close(); }}
              className="w-full text-left px-2 py-1.5 text-xs font-semibold text-[#0B4A3D] border-b border-slate-100 last:border-b-0 hover:bg-[#0B4A3D]/5 transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <Plus size={12} className="shrink-0" /> Use &quot;{trimmedQuery}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ============================== Schedule Form ==============================

/**
 * The scheduling form: Schedule Details, Date/Time & Route, Coordination and a
 * read-only Approval panel.
 *
 * Approval is deliberately NOT an editable field: the record is always created
 * as Draft and only the workflow endpoints (Submit / Approve / Reject / Request
 * Revision) move the status, so the form can never self-approve.
 */
function ScheduleForm({ schedule, options, onSave, onCancel }) {
  // Attachment upload is its own permission (travelScheduler → Upload).
  const { can } = useMarketingAccess();
  const canUpload = can('travelScheduler', 'upload');
  const isEdit = Boolean(schedule?.id);
  const [form, setForm] = useState(() => ({
    scheduleTitle: schedule?.scheduleTitle || '',
    assignedUserId: schedule?.assignedUserId ? String(schedule.assignedUserId) : '',
    purpose: schedule?.purpose || '',
    priority: schedule?.priority || 'Normal',
    startDate: schedule?.startDate || '',
    startTime: schedule?.startTime ? String(schedule.startTime).slice(0, 5) : '',
    endDate: schedule?.endDate || '',
    endTime: schedule?.endTime ? String(schedule.endTime).slice(0, 5) : '',
    startingLocation: schedule?.startingLocation || '',
    endingLocation: schedule?.destination || schedule?.endingLocation || '',
    travelMode: schedule?.travelMode || 'Car',
    estimatedDistanceKm: schedule?.estimatedDistanceKm != null ? String(schedule.estimatedDistanceKm) : '',
    customerId: schedule?.customerId ? String(schedule.customerId) : '',
    meetingDetails: schedule?.meetingDetails || '',
    contactPerson: schedule?.contactPerson || '',
    contactPhone: schedule?.contactPhone || '',
    remarks: schedule?.remarks || ''
  }));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  // Files picked here are STAGED: they are uploaded right after the schedule
  // exists, so a stored file can never outlive a failed save.
  const [stagedFiles, setStagedFiles] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [attachments, setAttachments] = useState([]);

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // Purposes the module list does not carry. A typed purpose stays available in
  // the dropdown for the rest of the form's life (and a re-opened schedule
  // re-offers its own stored purpose), never twice — the merge below is
  // case-insensitive, and an exact match resolves to the option itself.
  const [customPurposes, setCustomPurposes] = useState(() =>
    schedule?.purpose ? [schedule.purpose] : []
  );

  const purposeOptions = useMemo(() => {
    const seen = new Set();
    return [...(options?.purposes || []), ...customPurposes].filter((purpose) => {
      const key = String(purpose).trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [options, customPurposes]);

  // The purpose column is free text server-side, so a value outside the list is
  // valid — it is simply remembered here so the picker keeps offering it.
  const changePurpose = (value) => {
    setForm((prev) => ({ ...prev, purpose: value ?? '' }));
    const text = String(value ?? '').trim();
    if (!text) return;
    const known = purposeOptions.some(
      (purpose) => String(purpose).trim().toLowerCase() === text.toLowerCase()
    );
    if (known) return;
    setCustomPurposes((prev) => (prev.some(
      (purpose) => String(purpose).trim().toLowerCase() === text.toLowerCase()
    ) ? prev : [...prev, text]));
  };

  // Optional client picker — the existing customer master.
  useEffect(() => {
    fetchCustomers(setCustomers);
  }, []);

  const loadAttachments = useCallback(
    () => fetchScheduleAttachments(setAttachments, schedule?.id),
    [schedule?.id]
  );

  useEffect(() => { loadAttachments(); }, [loadAttachments]);

  const validate = () => {
    const next = {};
    if (!form.scheduleTitle.trim()) next.scheduleTitle = 'Schedule title is required';
    if (!form.assignedUserId) next.assignedUserId = 'Employee is required';
    if (!form.purpose.trim()) next.purpose = 'Travel purpose is required';
    if (!form.startDate) next.startDate = 'Start date is required';
    if (!form.startTime) next.startTime = 'Start time is required';
    if (!form.endDate) next.endDate = 'End date is required';
    if (!form.endTime) next.endTime = 'End time is required';
    if (!form.startingLocation.trim()) next.startingLocation = 'Starting location is required';
    if (!form.endingLocation.trim()) next.endingLocation = 'Destination is required';
    if (form.startDate && form.startTime && form.endDate && form.endTime) {
      const start = new Date(`${form.startDate}T${form.startTime}`);
      const end = new Date(`${form.endDate}T${form.endTime}`);
      if (!Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime()) && end < start) {
        next.endTime = 'End date/time cannot be earlier than the start date/time';
      }
    }
    const distance = Number(form.estimatedDistanceKm);
    if (form.estimatedDistanceKm !== '' && !Number.isNaN(distance) && distance < 0) {
      next.estimatedDistanceKm = 'Estimated distance cannot be negative';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Only writable fields — status, approval fields, schedule number and the
  // requester are server-derived and never sent back.
  const buildPayload = () => ({
    scheduleTitle: form.scheduleTitle.trim(),
    assignedUserId: Number(form.assignedUserId),
    purpose: form.purpose,
    priority: form.priority,
    startDate: form.startDate,
    startTime: form.startTime,
    endDate: form.endDate,
    endTime: form.endTime,
    startingLocation: form.startingLocation.trim(),
    endingLocation: form.endingLocation.trim(),
    travelMode: form.travelMode,
    estimatedDistanceKm: form.estimatedDistanceKm === '' ? null : Number(form.estimatedDistanceKm),
    customerId: form.customerId ? Number(form.customerId) : null,
    meetingDetails: form.meetingDetails || null,
    contactPerson: form.contactPerson || null,
    contactPhone: form.contactPhone || null,
    remarks: form.remarks || null
  });

  const submit = (mode) => async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave(buildPayload(), stagedFiles, mode, schedule?.id);
    } finally {
      setSaving(false);
    }
  };

  const fieldClass = (key) =>
    `w-full px-2 py-1.5 border rounded-lg text-xs ${errors[key] ? 'border-rose-400' : 'border-slate-200'}`;
  const errorText = (key) => errors[key] && <span className="block text-[10px] text-rose-500 mt-0.5">{errors[key]}</span>;

  return (
    <div className="space-y-5">
      {/* ---------- A. Schedule Details ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Schedule Details</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isEdit && (
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Schedule Number</label>
              <input type="text" value={schedule?.scheduleNo || ''} readOnly className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500" />
            </div>
          )}
          <div className={isEdit ? '' : 'sm:col-span-2'}>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Schedule Title *</label>
            <input type="text" value={form.scheduleTitle} onChange={set('scheduleTitle')} placeholder="e.g. Coimbatore plant visit" className={fieldClass('scheduleTitle')} />
            {errorText('scheduleTitle')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Employee / Assigned To *</label>
            <select value={form.assignedUserId} onChange={set('assignedUserId')} className={fieldClass('assignedUserId')}>
              <option value="">— Select employee —</option>
              {(options?.employees || []).map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </select>
            {errorText('assignedUserId')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Travel Purpose *</label>
            <TypeableSelect
              value={form.purpose}
              options={purposeOptions}
              onChange={changePurpose}
              inputClassName={fieldClass('purpose')}
              placeholder="Select or type a purpose…"
              emptyLabel="— Select purpose —"
              ariaLabel="Travel Purpose"
              maxLength={100}
            />
            <span className="block text-[10px] text-slate-400 mt-0.5">Pick a purpose, or type a new one and press Enter.</span>
            {errorText('purpose')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Priority</label>
            <select value={form.priority} onChange={set('priority')} className={fieldClass('priority')}>
              {(options?.priorities || ['Normal', 'High', 'Urgent']).map((priority) => <option key={priority}>{priority}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Requested By</label>
            <input type="text" value={schedule?.requestedBy || 'You'} readOnly className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 text-slate-500" />
            <span className="block text-[10px] text-slate-400 mt-0.5">Recorded from the signed-in user on save.</span>
          </div>
        </div>
      </div>

      {/* ---------- B. Date, Time & Route ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Date, Time &amp; Route</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Start Date *</label>
            <input type="date" value={form.startDate} onChange={set('startDate')} className={fieldClass('startDate')} />
            {errorText('startDate')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Start Time *</label>
            <input type="time" value={form.startTime} onChange={set('startTime')} className={fieldClass('startTime')} />
            {errorText('startTime')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">End Date *</label>
            <input type="date" value={form.endDate} onChange={set('endDate')} className={fieldClass('endDate')} />
            {errorText('endDate')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">End Time *</label>
            <input type="time" value={form.endTime} onChange={set('endTime')} className={fieldClass('endTime')} />
            {errorText('endTime')}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Starting Location *</label>
            <input type="text" value={form.startingLocation} onChange={set('startingLocation')} placeholder="e.g. Erode" className={fieldClass('startingLocation')} />
            {errorText('startingLocation')}
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Destination *</label>
            <input type="text" value={form.endingLocation} onChange={set('endingLocation')} placeholder="e.g. Coimbatore" className={fieldClass('endingLocation')} />
            {errorText('endingLocation')}
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Travel Mode</label>
            <select value={form.travelMode} onChange={set('travelMode')} className={fieldClass('travelMode')}>
              {(options?.travelModes || ['Car', 'Train', 'Flight', 'Other']).map((mode) => <option key={mode}>{mode}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Estimated Distance (km)</label>
            <input type="number" min="0" step="0.1" value={form.estimatedDistanceKm} onChange={set('estimatedDistanceKm')} className={fieldClass('estimatedDistanceKm')} />
            {errorText('estimatedDistanceKm')}
          </div>
        </div>
      </div>

      {/* ---------- C. Coordination Details ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Coordination</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Client / Customer</label>
            <select value={form.customerId} onChange={set('customerId')} className={fieldClass('customerId')}>
              <option value="">— None —</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.businessName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Contact Person</label>
            <input type="text" value={form.contactPerson} onChange={set('contactPerson')} className={fieldClass('contactPerson')} />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Contact Phone</label>
            <input type="text" value={form.contactPhone} onChange={set('contactPhone')} className={fieldClass('contactPhone')} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Meeting / Visit Details</label>
            <textarea rows={2} value={form.meetingDetails} onChange={set('meetingDetails')} placeholder="Appointment, agenda or site-visit notes" className={fieldClass('meetingDetails')} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Remarks / Additional Notes</label>
            <textarea rows={2} value={form.remarks} onChange={set('remarks')} className={fieldClass('remarks')} />
          </div>
        </div>
      </div>

      {/* ---------- Attachments ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attachments</h3>
          {stagedFiles.length > 0 && (
            <span className="text-[10px] font-bold text-amber-600">{stagedFiles.length} pending upload</span>
          )}
        </div>
        {canUpload ? (
          <>
            <PendingAttachments files={stagedFiles} onChange={setStagedFiles} />
            <p className="text-[10px] text-slate-400 mt-2">
              Tickets, itineraries and invitations — stored in the shared ERP attachment pool and uploaded with this schedule.
            </p>
          </>
        ) : (
          <p className="text-[11px] text-slate-400">Attachment upload is not permitted for your Marketing access.</p>
        )}
        {isEdit && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">
              Stored Attachments ({attachments.length})
            </h4>
            <SalesAttachments
              service={travelScheduleAttachments}
              docId={schedule.id}
              attachments={attachments}
              onChanged={loadAttachments}
              variant="table"
            />
          </div>
        )}
      </div>

      {/* ---------- D. Approval & Status (read-only) ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Approval &amp; Status</h3>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-slate-400">Status:</span>
          <StatusBadge status={schedule?.status || 'Draft'} />
          {schedule?.approvalStatus && (
            <>
              <span className="text-slate-400 ml-2">Approval:</span>
              <StatusBadge status={schedule.approvalStatus} />
            </>
          )}
          {schedule?.approvedBy && (
            <span className="text-slate-400 ml-2">Approved By: <span className="font-bold text-slate-600">{schedule.approvedBy}</span></span>
          )}
          {schedule?.approvedAt && (
            <span className="text-slate-400 ml-2">on <span className="font-bold text-slate-600">{fmtDateTime(schedule.approvedAt)}</span></span>
          )}
        </div>
        {schedule?.rejectionReason && (
          <p className="text-[11px] mt-2"><span className="text-slate-400">Rejection Reason:</span> <span className="font-bold text-rose-600">{schedule.rejectionReason}</span></p>
        )}
        {schedule?.revisionComments && (
          <p className="text-[11px] mt-2"><span className="text-slate-400">Revision Comments:</span> <span className="font-bold text-amber-600">{schedule.revisionComments}</span></p>
        )}
        <p className="text-[10px] text-slate-400 mt-3 flex items-start gap-1">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          A schedule is saved as Draft. Approval is a workflow decision — use Submit for Approval, then Approve / Reject / Request Revision on the saved record.
        </p>
      </div>

      {/* ---------- Actions ---------- */}
      <div className="mkt-form-footer">
        <div className="mkt-form-footer-group">
          <button type="button" onClick={onCancel} className="erp-create-btn mkt-btn-secondary" disabled={saving}>
            <X size={13} /> Cancel
          </button>
          <button type="button" onClick={submit('save')} className="erp-create-btn" disabled={saving}>
            <Save size={13} /> {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Save Schedule'}
          </button>
        </div>
        <div className="mkt-form-footer-group">
          <button type="button" onClick={submit('submit')} className="erp-create-btn" disabled={saving}>
            <Send size={13} /> Save &amp; Submit for Approval
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================== Main Travel Scheduler ==============================

export default function TravelScheduler() {
  // Travel Scheduler action permissions (UI gate; the backend enforces).
  const { can } = useMarketingAccess();
  const canCreate = can('travelScheduler', 'create');
  const canEdit = can('travelScheduler', 'edit');
  const canDelete = can('travelScheduler', 'delete');
  const canApprove = can('travelScheduler', 'approve');
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [schedules, setSchedules] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size] = useState(15);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterEmployee, setFilterEmployee] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDestination, setFilterDestination] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [options, setOptions] = useState(null);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formLoading, setFormLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewDetail, setPreviewDetail] = useState(null);

  const isCreateTab = activeTab === 'create' && canCreate;

  const loadSchedules = useCallback(() => {
    const isUpcoming = activeTab === 'upcoming';
    fetchSchedules({ setSchedules, setTotal, setLoading, setLoadError }, {
      page: page - 1,
      size,
      sort: 'createdAt,desc',
      search: search || undefined,
      status: filterStatus || TAB_STATUS[activeTab],
      assignedUserId: filterEmployee || undefined,
      destination: filterDestination || undefined,
      dateFrom: isUpcoming ? todayLocal() : (dateFrom || undefined),
      dateTo: isUpcoming ? undefined : (dateTo || undefined)
    });
  }, [page, size, search, activeTab, filterStatus, filterEmployee, filterDestination, dateFrom, dateTo]);

  useEffect(() => { loadSchedules(); }, [loadSchedules]);

  // Form pickers come from the module's own options endpoint.
  useEffect(() => { fetchScheduleOptions(setOptions); }, []);

  const resetFilters = () => {
    setFilterEmployee('');
    setFilterStatus('');
    setFilterDestination('');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    setPage(1);
  };

  const startCreate = () => {
    setEditingSchedule(null);
    setActiveTab('create');
  };

  const startEdit = async (row) => {
    setFormLoading(true);
    try {
      const detail = await marketingService.getTravelSchedule(row.id);
      setEditingSchedule(detail || row);
      setActiveTab('create');
    } catch (err) {
      toast.error(err?.message || 'Failed to open schedule');
    } finally {
      setFormLoading(false);
    }
  };

  const handleSave = async (payload, files, mode, id) => {
    try {
      let scheduleId = id;
      let saved;
      if (id) {
        saved = await marketingService.updateTravelSchedule(id, payload);
        toast.success('Schedule updated');
      } else {
        saved = await marketingService.createTravelSchedule(payload);
        scheduleId = saved?.id;
        toast.success('Travel schedule created');
      }
      if (files?.length && scheduleId) {
        const results = await travelScheduleAttachments.uploadMany(scheduleId, files);
        const failed = results.filter((r) => !r.ok);
        if (failed.length === 0) toast.success(`${results.length} attachment(s) uploaded`);
        else if (failed.length === results.length) toast.error(failed[0].error?.message || 'Attachments failed to upload');
        else toast.warning(`${results.length - failed.length} uploaded, ${failed.length} failed`);
      }
      if (mode === 'submit' && scheduleId) {
        await marketingService.submitTravelSchedule(scheduleId);
        toast.success('Schedule submitted for approval');
      }
      setEditingSchedule(null);
      setActiveTab('all');
      await loadSchedules();
    } catch (err) {
      toast.error(err?.message || 'Failed to save travel schedule');
    }
  };

  const runWorkflow = async (fn, successMessage) => {
    try {
      await fn();
      toast.success(successMessage);
      await loadSchedules();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    }
  };

  const openPreview = async (row) => {
    setPreview(row);
    setPreviewDetail(null);
    try {
      setPreviewDetail(await marketingService.getTravelSchedule(row.id));
    } catch {
      // The list projection is already enough to render the preview.
    }
  };

  const actionItems = (row) => {
    const items = [{ key: 'preview', label: 'Preview', icon: ScanSearch }];
    if (canEdit && EDITABLE_STATUSES.includes(row.status)) {
      items.push({ key: 'edit', label: 'Edit', icon: Save });
    }
    if (canEdit && (row.status === 'Draft' || row.status === 'Revision Required')) {
      items.push({ key: 'submit', label: 'Submit for Approval', icon: Send });
    }
    if (canApprove && row.status === 'Submitted') {
      items.push({ key: 'approve', label: 'Approve', icon: Check });
      items.push({ key: 'reject', label: 'Reject', icon: Ban });
      items.push({ key: 'revision', label: 'Request Revision', icon: RotateCcw });
    }
    if (canEdit && row.status === 'Approved') {
      items.push({ key: 'complete', label: 'Mark Completed', icon: CheckCircle });
    }
    if (canEdit && row.status !== 'Completed' && row.status !== 'Cancelled') {
      items.push({ key: 'cancel', label: 'Cancel Schedule', icon: X });
    }
    if (canDelete && row.status === 'Draft') {
      items.push({ key: 'delete', label: 'Delete', icon: Trash2 });
    }
    return items;
  };

  const onAction = (row) => async (key) => {
    if (key === 'preview') return openPreview(row);
    if (key === 'edit') return startEdit(row);
    if (key === 'submit') {
      return runWorkflow(() => marketingService.submitTravelSchedule(row.id), 'Submitted for approval');
    }
    if (key === 'approve') {
      if (!window.confirm(`Approve ${row.scheduleNo || 'this schedule'}?`)) return;
      return runWorkflow(() => marketingService.approveTravelSchedule(row.id), 'Schedule approved');
    }
    if (key === 'reject') {
      const reason = window.prompt('Rejection reason (required):');
      if (!reason) return;
      return runWorkflow(() => marketingService.rejectTravelSchedule(row.id, { rejectionReason: reason }), 'Schedule rejected');
    }
    if (key === 'revision') {
      const comments = window.prompt('Revision comments (required):');
      if (!comments) return;
      return runWorkflow(() => marketingService.requestTravelScheduleRevision(row.id, { revisionComments: comments }), 'Revision requested');
    }
    if (key === 'complete') {
      if (!window.confirm('Mark this schedule as completed?')) return;
      return runWorkflow(() => marketingService.completeTravelSchedule(row.id), 'Schedule completed');
    }
    if (key === 'cancel') {
      const reason = window.prompt('Cancellation reason (required):');
      if (!reason) return;
      return runWorkflow(() => marketingService.cancelTravelSchedule(row.id, reason), 'Schedule cancelled');
    }
    if (key === 'delete') {
      if (!window.confirm('Delete this draft schedule? This cannot be undone.')) return;
      return runWorkflow(() => marketingService.deleteTravelSchedule(row.id), 'Draft deleted');
    }
    return undefined;
  };

  const totalPages = Math.max(1, Math.ceil(total / size));
  const previewRecord = previewDetail || preview;
  const employees = useMemo(() => options?.employees || [], [options]);
  const employeeName = (id) => employees.find((employee) => String(employee.id) === String(id))?.name || '';

  return (
    <div className="purchase-page cpr-page">
      <div className="pr-page-header">
        <div className="pr-page-header-title">
          <h1>
            <CalendarClock size={22} />
            Travel Scheduler
          </h1>
          <p className="po-page-header-subtitle">Schedule employee travel, routes and coordination in advance.</p>
        </div>
        <div className="pr-page-header-actions">
          <button type="button" onClick={() => setShowFilters((v) => !v)} className="erp-btn-secondary">
            <Filter size={14} /> Filters
          </button>
          <button type="button" onClick={startCreate} className="erp-btn-primary">
            <Plus size={14} /> New Travel Schedule
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">Advanced Filters</h4>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-400">Employee</label>
              <select value={filterEmployee} onChange={(e) => { setFilterEmployee(e.target.value); setPage(1); }} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5">
                <option value="">All employees</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400">Status</label>
              <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5">
                <option value="">All statuses</option>
                {['Draft', 'Submitted', 'Approved', 'Rejected', 'Revision Required', 'Completed', 'Cancelled'].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400">Destination</label>
              <input type="text" value={filterDestination} onChange={(e) => { setFilterDestination(e.target.value); setPage(1); }} placeholder="Filter..." className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400">From Date</label>
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5" />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400">To Date</label>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="w-full px-2 py-1 border border-slate-200 rounded text-[11px] mt-0.5" />
            </div>
          </div>
          <button type="button" onClick={resetFilters} className="mt-3 text-[10px] font-bold text-rose-500 hover:bg-rose-50 px-2 py-1 rounded cursor-pointer">
            Clear Filters
          </button>
        </div>
      )}

      <div className="pr-tabs">
        {SCHEDULE_TABS.filter((tab) => tab.key !== 'create' || canCreate).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => { setActiveTab(tab.key); setPage(1); setEditingSchedule(null); }}
            className={`pr-tab ${activeTab === tab.key ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs">
          <AlertTriangle size={14} />
          <span className="flex-1">{loadError}</span>
          <button type="button" onClick={loadSchedules} className="font-bold underline cursor-pointer">Retry</button>
        </div>
      )}

      {isCreateTab ? (
        formLoading ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-400">Loading schedule…</div>
        ) : (
          <ScheduleForm
            key={editingSchedule?.id || 'new'}
            schedule={editingSchedule}
            options={options}
            onSave={handleSave}
            onCancel={() => { setEditingSchedule(null); setActiveTab('all'); }}
          />
        )
      ) : (
        <>
          <div className="pr-toolbar">
            <div className="pr-toolbar-left">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by Schedule No, Title, Employee, Destination, Purpose..."
                className="pr-search-input"
                style={{ width: 380 }}
              />
            </div>
            <div className="pr-toolbar-right">
              <span className="toolbar-count">{total} schedule(s)</span>
            </div>
          </div>

          <div className="pr-table-card">
            <div className="pr-table-wrap">
              <table className="pr-table sgrid sgrid-mkt pr-table-fixed" style={{ tableLayout: 'fixed', minWidth: 1240 }}>
                <colgroup>
                  <col style={{ width: 130 }} />
                  <col style={{ width: 230 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 160 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Schedule No</th>
                    <th>Title</th>
                    <th>Employee</th>
                    <th>Travel Date</th>
                    <th>Destination</th>
                    <th>Purpose</th>
                    <th>Priority</th>
                    <th>Status</th>
                    <th className="sgrid-pin-actions" style={{ textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="me-empty">Loading travel schedules…</td></tr>
                  ) : schedules.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="me-empty">
                        <div className="py-6">
                          <CalendarClock size={22} className="mx-auto text-slate-300 mb-2" />
                          <p>No travel schedules found.</p>
                          <p className="text-[11px] text-slate-400 mt-1">Create one with “New Travel Schedule”, or widen the filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    schedules.map((row) => (
                      <tr key={row.id} className="clickable group" onClick={() => openPreview(row)}>
                        <td className="me-td-blue cell-id" title={row.scheduleNo || `TS-${row.id}`}>{row.scheduleNo || `TS-${row.id}`}</td>
                        <td title={row.scheduleTitle || ''}>{row.scheduleTitle}</td>
                        <td title={row.assignedTo || ''}>{row.assignedTo || employeeName(row.assignedUserId) || '—'}</td>
                        <td className="cell-date">{fmtDate(row.travelDate || row.startDate)}</td>
                        <td className="me-td-muted" title={row.destination || ''}>{row.destination || '—'}</td>
                        <td>{row.purpose || '—'}</td>
                        <td className={PRIORITY_CLASS[row.priority] || 'text-slate-500'}>{row.priority || '—'}</td>
                        <td><StatusBadge status={row.status} /></td>
                        <td className="sgrid-pin-actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                          <ActionMenu
                            items={actionItems(row)}
                            onAction={onAction(row)}
                            triggerClassName="erp-row-action-btn"
                            buttonLabel={`Actions for ${row.scheduleNo || row.id}`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
              <p className="me-td-muted" style={{ fontSize: 12 }}>
                Showing {(page - 1) * size + 1}—{Math.min(page * size, total)} of {total}
              </p>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="qtn-btn qtn-btn-secondary" style={{ height: 36, padding: '0 16px' }}>Prev</button>
                <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 10px', fontSize: 12, fontWeight: 700, color: '#6B7280' }}>{page} / {totalPages}</span>
                <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="qtn-btn qtn-btn-secondary" style={{ height: 36, padding: '0 16px' }}>Next</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== READ-ONLY PREVIEW ===== */}
      <RecordPreviewModal
        open={preview !== null}
        onClose={() => { setPreview(null); setPreviewDetail(null); }}
        title={previewRecord?.scheduleNo || (previewRecord?.id != null ? `TS-${previewRecord.id}` : 'Travel Schedule')}
        subtitle={previewRecord?.scheduleTitle || ''}
        status={previewRecord?.status}
        sections={[
          {
            heading: 'Schedule Details',
            rows: [
              ['Schedule No', previewRecord?.scheduleNo],
              ['Title', previewRecord?.scheduleTitle],
              ['Employee', previewRecord?.assignedTo],
              ['Travel Purpose', previewRecord?.purpose],
              ['Priority', previewRecord?.priority],
              ['Requested By', previewRecord?.requestedBy]
            ]
          },
          {
            heading: 'Date, Time & Route',
            rows: [
              ['Travel Date', fmtDate(previewRecord?.travelDate || previewRecord?.startDate)],
              ['Start', `${fmtDate(previewRecord?.startDate)} ${fmtTime(previewRecord?.startTime)}`.trim()],
              ['End', `${fmtDate(previewRecord?.endDate)} ${fmtTime(previewRecord?.endTime)}`.trim()],
              ['Route', previewRecord?.startingLocation || previewRecord?.destination
                ? `${previewRecord?.startingLocation || '—'} → ${previewRecord?.destination || '—'}` : ''],
              ['Travel Mode', previewRecord?.travelMode],
              ['Estimated Distance', previewRecord?.estimatedDistanceKm != null ? `${previewRecord.estimatedDistanceKm} km` : '']
            ]
          },
          {
            heading: 'Coordination',
            rows: [
              ['Client / Customer', previewRecord?.customerName],
              ['Contact Person', previewRecord?.contactPerson],
              ['Contact Phone', previewRecord?.contactPhone],
              ['Meeting / Visit', previewRecord?.meetingDetails],
              ['Remarks', previewRecord?.remarks]
            ]
          },
          {
            heading: 'Approval',
            rows: [
              ['Status', previewRecord?.status],
              ['Approval Status', previewRecord?.approvalStatus],
              ['Approved By', previewRecord?.approvedBy],
              ['Approved At', previewRecord?.approvedAt ? fmtDateTime(previewRecord.approvedAt) : ''],
              ['Rejection Reason', previewRecord?.rejectionReason],
              ['Revision Comments', previewRecord?.revisionComments],
              ['Cancelled By', previewRecord?.cancelledBy],
              ['Cancellation Reason', previewRecord?.cancellationReason]
            ]
          }
        ]}
        footer={
          preview && (
            <>
              <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={() => { setPreview(null); setPreviewDetail(null); }}>
                Close
              </button>
              {EDITABLE_STATUSES.includes(preview.status) && (
                <button
                  type="button"
                  className="po-btn po-btn-primary po-btn-sm"
                  onClick={() => { const row = preview; setPreview(null); setPreviewDetail(null); startEdit(row); }}
                >
                  Edit
                </button>
              )}
              {(preview.status === 'Draft' || preview.status === 'Revision Required') && (
                <button
                  type="button"
                  className="po-btn po-btn-primary po-btn-sm"
                  onClick={() => { const row = preview; setPreview(null); setPreviewDetail(null); onAction(row)('submit'); }}
                >
                  Submit for Approval
                </button>
              )}
            </>
          )
        }
      />
    </div>
  );
}
