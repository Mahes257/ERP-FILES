import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, ArrowLeft, BarChart3, BedDouble, Bus, Calendar, Camera, Check,
  ChevronDown, ChevronUp, Clock, DollarSign, Edit3, FileImage, FileSpreadsheet,
  FileText, LogOut, MapPin, Package, Paperclip, Plus, Printer, Repeat, Save,
  Send, Trash2, Upload, UtensilsCrossed, X
, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { openInNewTab } from '../../utils/navigationHelpers';
import { useToast } from '../Common';
import StatusBadge from '../Common/StatusBadge';
import SalesKpiCards from '../SalesTable/SalesKpiCards';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import marketingService from '../../services/marketingService';
import { EXPENSE_CATEGORIES, TYPE_OPTIONS, CUSTOM_TYPE_MARKER, BILL_STATUSES } from '../../config/expenseOptions';
import '../../pages/sales/quotation-create.css';
import './marketing-expenses.css';
import './marketing-form-actions.css';
import '../../pages/crm/crm-erp.css';

const EXPENSE_TABS = [
  { key: '', label: 'All Expenses' },
  { key: 'Active', label: 'Active' },
  { key: 'tripoff', label: 'Completed' },
  { key: 'pending-submission', label: 'Pending Submission' },
  { key: 'Submitted', label: 'Pending Approval' },
  { key: 'Approved', label: 'Approved' },
  { key: 'Rejected', label: 'Rejected' }
];

const PURPOSES = ['Marketing Visit', 'Plant Visit', 'Customer Visit', 'Follow-up', 'Survey', 'Other'];
const PAYMENT_METHODS = ['Cash', 'Card', 'UPI', 'Online Transfer', 'Other'];
const ACCEPTED_BILL_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
];
const ACCEPT = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
].join(',');

const STATUS_PILL = {
  Planned: 'me-pill',
  Active: 'me-pill me-pill-blue',
  'Completed': 'me-pill me-pill-teal',
  Completed: 'me-pill me-pill-green',
  Cancelled: 'me-pill'
};
const APPROVAL_PILL = {
  Draft: 'me-pill',
  Submitted: 'me-pill me-pill-blue',
  'Pending Approval': 'me-pill me-pill-amber',
  Approved: 'me-pill me-pill-green',
  Rejected: 'me-pill me-pill-rose',
  'Correction Requested': 'me-pill me-pill-amber'
};
const BILL_PILL = {
  'WITH BILL': 'me-pill me-pill-green',
  'WITHOUT BILL': 'me-pill'
};

const TYPE_LABEL = { Travel: 'Travel Type', Stay: 'Stay Type', Food: 'Food Type', Other: 'Expense Type' };
const CATEGORY_TYPES = ['Travel', 'Stay', 'Food', 'Other'];

// Is the selected value the "custom/Other" marker for this category?
function isCustomMarker(category, value) {
  return !!category && (CUSTOM_TYPE_MARKER[category] === value);
}

// Resolve the initial sub-type state for the form — supports legacy rows saved
// before expenseSubType existed (falls back to travelMode/mealType/…).
function subTypeState(expense) {
  const category = expense?.expenseType;
  const list = category ? (TYPE_OPTIONS[category] || []) : [];
  const raw = (expense?.expenseSubType || expense?.travelMode || expense?.mealType
    || expense?.localTravelMode || '').trim();
  if (raw && list.length && !list.includes(raw)) {
    return { subType: CUSTOM_TYPE_MARKER[category] || '', draft: raw };
  }
  return { subType: raw || (list[0] || ''), draft: '' };
}

// One-line "Details" column value for an expense row.
function subDetail(exp) {
  const kind = (exp.expenseSubType || exp.travelMode || exp.mealType || '').trim();
  if (exp.expenseType === 'Travel') {
    return kind ? `${kind}${exp.ticketNumber ? ` · ${exp.ticketNumber}` : ''}` : (exp.description || '—');
  }
  if (exp.expenseType === 'Stay') {
    return [kind || 'Stay', exp.hotelName, exp.numberOfNights ? `${exp.numberOfNights}n` : ''].filter(Boolean).join(' · ') || '—';
  }
  if (exp.expenseType === 'Food') {
    return [kind, exp.numberOfPersons ? `${exp.numberOfPersons}p` : ''].filter(Boolean).join(' · ') || '—';
  }
  return exp.expenseSubType || exp.description || exp.travelPurpose || '—';
}

const CAT_ICON = {
  Travel: Bus,
  Stay: BedDouble,
  Food: UtensilsCrossed,
  Other: Package
};
const CAT_CHIP = {
  Travel: 'me-chip me-chip-travel',
  Stay: 'me-chip me-chip-stay',
  Food: 'me-chip me-chip-food',
  Other: 'me-chip me-chip-other'
};

const fmtDate = (v) => v ? String(v).slice(0, 10) : '—';
const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};
const fmtINR = (v) => v == null ? '₹0' : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const fmtFileSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
const parsePage = (res) => {
  if (Array.isArray(res)) return { list: res, total: res.length };
  if (res?.content) return { list: res.content, total: res.totalElements ?? res.content.length };
  return { list: [], total: 0 };
};
const parseList = (res) => {
  if (Array.isArray(res)) return res;
  if (res?.content) return res.content;
  return [];
};

function fmtDuration(start, end) {
  if (!start || !end) return '—';
  const s = new Date(start), e = new Date(end);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '—';
  const ms = e - s;
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (hrs >= 24) {
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h ${mins}m`;
  }
  return `${hrs}h ${mins}m`;
}

function Pill({ status }) {
  return <StatusBadge status={status} />;
}

function captureLocation() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });
}

const isImageType = (t) => t && t.startsWith('image/');

function BillIcon({ type }) {
  if (isImageType(type)) return <FileImage size={18} />;
  if (type === 'application/pdf') return <FileText size={18} />;
  if (type && (type.includes('sheet') || type === 'text/csv')) return <FileSpreadsheet size={18} />;
  return <Paperclip size={18} />;
}

const TONE = {
  slate: { bg: '#F3F4F6', color: '#475569' },
  teal: { bg: '#E8F0EE', color: '#0B4A3D' },
  green: { bg: '#ECFDF5', color: '#047857' },
  amber: { bg: '#FFFBEB', color: '#D97706' },
  orange: { bg: '#FFF7ED', color: '#C2410C' },
  rose: { bg: '#FFF1F2', color: '#BE123C' }
};

function SummaryCards({ summary, onFilter, activeTab = '', dateFrom, dateTo, onDateChange }) {
  const cards = [
    { key: 'activeTrips', label: 'Active Expenses', value: summary?.activeTrips, filter: 'Active', icon: MapPin, tone: 'teal' },
    { key: 'pendingSubmission', label: 'Pending Submission', value: summary?.pendingSubmission, filter: 'pending-submission', icon: Send, tone: 'amber' },
    { key: 'pendingApproval', label: 'Pending Approval', value: summary?.pendingApproval, filter: 'Submitted', icon: Clock, tone: 'orange' },
    { key: 'approvedTrips', label: 'Approved', value: summary?.approvedTrips, filter: 'Approved', icon: Check, tone: 'green' },
    { key: 'completedTrips', label: 'Completed', value: summary?.completedTrips, filter: 'tripoff', icon: LogOut, tone: 'slate' },
    { key: 'rejectedTrips', label: 'Rejected', value: summary?.rejectedTrips, filter: 'Rejected', icon: X, tone: 'rose' },
    { key: 'totalExpenseAmount', label: 'Total Expenses', value: fmtINR(summary?.totalExpenseAmount), currency: true, icon: DollarSign, tone: 'slate' },
    { key: 'withBillAmount', label: 'With Bill', value: fmtINR(summary?.withBillAmount), currency: true, icon: FileText, tone: 'green' },
    { key: 'withoutBillAmount', label: 'Without Bill', value: fmtINR(summary?.withoutBillAmount), currency: true, icon: FileText, tone: 'amber' }
  ];
  return (
    <div>
      <div className="flex" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Calendar size={14} className="me-td-muted" />
          <span className="me-kv-label">Period</span>
        </span>
        <input type="date" value={dateFrom} onChange={(e) => onDateChange('from', e.target.value)}
          className="qtn-input qtn-input-sm" style={{ width: 150 }} />
        <span className="me-td-muted">to</span>
        <input type="date" value={dateTo} onChange={(e) => onDateChange('to', e.target.value)}
          className="qtn-input qtn-input-sm" style={{ width: 150 }} />
        {(dateFrom || dateTo) && (
          <button onClick={() => { onDateChange('from', ''); onDateChange('to', ''); }}
            className="me-link me-del-link">Clear</button>
        )}
      </div>
      <SalesKpiCards
        cards={cards.map((c) => ({
          key: c.key,
          label: c.label,
          value: c.value ?? '\u2014',
          icon: c.icon,
          color: (TONE[c.tone] || TONE.slate).color,
          static: !c.filter,
          newTabUrl: '/marketing/expenses'
        }))}
        activeKpi={activeTab}
        onSelect={(key) => {
          const c = cards.find((card) => card.key === key);
          if (c?.filter) onFilter?.(c.filter);
        }}
      />
    </div>
  );
}

function TripPrintView({ trip }) {
  if (!trip) return null;
  return (
    <div id="expense-print-area" className="me-print-sheet">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #expense-print-area, #expense-print-area * { visibility: visible; }
          #expense-print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
        }
      `}</style>
      <div className="text-center mb-6">
        <h1 className="text-lg font-bold">VISHAK TECH</h1>
        <p className="text-xs text-slate-500">Marketing Expense Report</p>
      </div>
      <div className="text-[11px] space-y-4">
        <div className="grid grid-cols-2 gap-3 border border-slate-300 rounded p-3">
          <div><strong>Expense No:</strong> {trip.tripNo}</div>
          <div><strong>Marketer:</strong> {trip.marketer}</div>
          <div><strong>Start Location:</strong> {trip.startLocation}</div>
          <div><strong>Destination:</strong> {trip.destination}</div>
          <div><strong>Purpose:</strong> {trip.purpose}</div>
          <div><strong>Status:</strong> {trip.status}</div>
          <div><strong>Started:</strong> {fmtDateTime(trip.tripOnDateTime)}</div>
          <div><strong>Completed:</strong> {fmtDateTime(trip.tripOffDateTime)}</div>
          {trip.expectedEndDate && <div><strong>Expected End:</strong> {fmtDate(trip.expectedEndDate)} {trip.expectedEndTime || ''}</div>}
          <div><strong>Duration:</strong> {fmtDuration(trip.tripOnDateTime, trip.tripOffDateTime)}</div>
          {trip.visitRef && <div><strong>Visit Ref:</strong> {trip.visitRef}</div>}
          <div><strong>Total Expenses:</strong> {fmtINR(trip.totalAmount)}</div>
        </div>

        <h3 className="font-bold text-xs border-b border-slate-300 pb-1">Expense Details</h3>
        <table className="w-full text-[10px] border border-slate-300">
          <thead>
            <tr className="bg-slate-100">
              <th className="border border-slate-300 px-2 py-1 text-left">#</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Date</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Type</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Details</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Amount</th>
              <th className="border border-slate-300 px-2 py-1 text-left">Bill</th>
            </tr>
          </thead>
          <tbody>
            {(trip.expenses || []).map((exp, idx) => (
              <tr key={exp.id}>
                <td className="border border-slate-300 px-2 py-1">{idx + 1}</td>
                <td className="border border-slate-300 px-2 py-1">{fmtDate(exp.expenseDate)}</td>
                <td className="border border-slate-300 px-2 py-1">{exp.expenseType}</td>
                <td className="border border-slate-300 px-2 py-1">
                  {exp.travelMode ? `${exp.travelMode}: ${exp.travelFrom || ''} →’ ${exp.travelTo || ''}` :
                    exp.hotelName ? exp.hotelName :
                    exp.restaurantVendor ? `${exp.restaurantVendor} (${exp.mealType || ''})` :
                    exp.description ? exp.description :
                    exp.location || ''}
                </td>
                <td className="border border-slate-300 px-2 py-1 font-bold">{fmtINR(exp.amount)}</td>
                <td className="border border-slate-300 px-2 py-1">{exp.billStatus}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-50 font-bold">
              <td colSpan={4} className="border border-slate-300 px-2 py-1 text-right">Total:</td>
              <td className="border border-slate-300 px-2 py-1">{fmtINR(trip.totalAmount)}</td>
              <td className="border border-slate-300 px-2 py-1"></td>
            </tr>
          </tfoot>
        </table>

        <div className="grid grid-cols-4 gap-3 mt-3 text-[10px]">
          <div className="border border-slate-300 rounded p-2 text-center"><div className="font-bold">{fmtINR(trip.travelTotal)}</div><div>Travel</div></div>
          <div className="border border-slate-300 rounded p-2 text-center"><div className="font-bold">{fmtINR(trip.stayTotal)}</div><div>Stay</div></div>
          <div className="border border-slate-300 rounded p-2 text-center"><div className="font-bold">{fmtINR(trip.foodTotal)}</div><div>Food</div></div>
          <div className="border border-slate-300 rounded p-2 text-center"><div className="font-bold">{fmtINR(trip.totalAmount)}</div><div>Grand Total</div></div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-8">
          <div className="border-t border-slate-300 pt-2 text-center">
            <p className="text-[10px]">Marketer Signature</p>
            <div className="h-12"></div>
            <p className="text-[10px]">{trip.marketer}</p>
          </div>
          <div className="border-t border-slate-300 pt-2 text-center">
            <p className="text-[10px]">Approved By</p>
            <div className="h-12"></div>
            <p className="text-[10px]">{trip.approvedBy || '—'}</p>          </div>
        </div>
      </div>
    </div>
  );
}


const TL_STYLE = {
  EXPENSE_CREATED: ['me-tl-slate', Activity, 'Expense Created'],
  EXPENSE_STARTED: ['me-tl-blue', MapPin, 'Started'],
  EXPENSE_ADDED: ['me-tl-green', Plus, 'Expense Added'],
  EXPENSE_UPDATED: ['me-tl-slate', Edit3, 'Expense Updated'],
  EXPENSE_DELETED: ['me-tl-rose', Trash2, 'Expense Deleted'],
  EXPENSE_SUBMITTED: ['me-tl-amber', Send, 'Submitted for Approval'],
  EXPENSE_COMPLETED: ['me-tl-teal', LogOut, 'Completed'],
  APPROVED: ['me-tl-green', Check, 'Approved'],
  REJECTED: ['me-tl-rose', X, 'Rejected'],
  CORRECTION_REQUESTED: ['me-tl-amber', Repeat, 'Correction Requested'],
  DEFAULT: ['me-tl-slate', Activity, 'Event']
};

function Timeline({ audit }) {
  if (!audit || audit.length === 0) return <p className="me-td-muted">No events yet.</p>;
  return (
    <div className="me-timeline">
      {audit.map(l => {
        const [dotCls, Icon, title] = TL_STYLE[l.action] || TL_STYLE.DEFAULT;
        return (
          <div key={l.id} className="me-tl-item">
            <span className={`me-tl-dot ${dotCls}`}><Icon size={9} /></span>
            <div className="me-tl-title">{title}</div>
            <div className="me-tl-meta">{fmtDateTime(l.performedAt)} · by {l.performedBy}</div>
            {l.description && <div className="me-tl-desc">{l.description}</div>}
          </div>
        );
      })}
    </div>
  );
}

function TripModal({ open, onClose, onSave, trip }) {
  const toast = useToast();
  const [form, setForm] = useState({
    startLocation: '', destination: '', purpose: '',
    startDate: new Date().toISOString().slice(0, 10), startTime: '',
    expectedEndDate: '', expectedEndTime: '', remarks: '',
    visitRef: ''
  });
  const [visits, setVisits] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      setForm(trip ? {
        startLocation: trip.startLocation || '', destination: trip.destination || '',
        purpose: trip.purpose || '', startDate: trip.startDate || '',
        startTime: trip.startTime || '', expectedEndDate: trip.expectedEndDate || '',
        expectedEndTime: trip.expectedEndTime || '', remarks: trip.remarks || '',
        visitRef: trip.visitRef || ''
      } : {
        startLocation: '', destination: '', purpose: '',
        startDate: new Date().toISOString().slice(0, 10), startTime: '',
        expectedEndDate: '', expectedEndTime: '', remarks: '',
        visitRef: ''
      });
      setSaving(false);
    }, 0);
    marketingService.list({ page: 0, size: 500 }).then(r => setVisits(parseList(r))).catch(() => setVisits([]));
    return () => clearTimeout(id);
  }, [open, trip]);

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const submit = async () => {
    if (!form.startLocation) { toast.error('Start location is required'); return; }
    if (!form.startDate) { toast.error('Start date is required'); return; }
    setSaving(true);
    try {
      await onSave(form);
    } catch (err) { toast.error(err?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  if (!open) return null;
  const visitLabel = (v) => `${v.visitNo || `VST-${v.id}`} — ${v.companyName || v.location || ''}`;

  return (
    <div className="me-modal-overlay">
      <div className="me-modal me-modal-lg">
        <div className="me-modal-head">
          <h3>{trip ? <><Edit3 size={16} /> Edit Marketing Expense — {trip.tripNo}</> : <><Plus size={16} /> New Marketing Expense</>}</h3>
          <button onClick={onClose} className="me-modal-close"><X size={16} /></button>
        </div>
        <div className="me-modal-body">
          <div className="qtn-grid-2">
            <div className="qtn-field"><label>Start Location <span className="required">*</span></label>
              <input className="qtn-input" value={form.startLocation} onChange={set('startLocation')} placeholder="e.g. Erode" /></div>
            <div className="qtn-field"><label>Destination / Main Region</label>
              <input className="qtn-input" value={form.destination} onChange={set('destination')} placeholder="e.g. Chennai" /></div>
          </div>
          <div className="qtn-grid-2" style={{ marginTop: 16 }}>
            <div className="qtn-field"><label>Purpose of Marketing Visit</label>
              <select className="qtn-select" value={form.purpose} onChange={set('purpose')}>
                <option value="">— Select —</option>{PURPOSES.map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div className="qtn-field"><label>Marketing Visit Reference</label>
              <input className="qtn-input" value={form.visitRef} onChange={set('visitRef')} placeholder="e.g. VST-001 or visit description" /></div>
          </div>
          <div className="qtn-grid-2" style={{ marginTop: 16 }}>
            <div className="qtn-field"><label>Start Date <span className="required">*</span></label>
              <input type="date" className="qtn-input" value={form.startDate} onChange={set('startDate')} /></div>
            <div className="qtn-field"><label>Start Time</label>
              <input type="time" className="qtn-input" value={form.startTime} onChange={set('startTime')} /></div>
            <div className="qtn-field"><label>End Date</label>
              <input type="date" className="qtn-input" value={form.expectedEndDate} onChange={set('expectedEndDate')} /></div>
            <div className="qtn-field"><label>End Time</label>
              <input type="time" className="qtn-input" value={form.expectedEndTime} onChange={set('expectedEndTime')} /></div>
          </div>
          <div className="qtn-grid-2" style={{ marginTop: 16 }}>
            <div className="qtn-field"><label>Remarks</label>
              <textarea className="qtn-input" value={form.remarks} onChange={set('remarks')} rows={2} /></div>
          </div>
        </div>
        <div className="me-modal-foot mkt-action-scope">
          <button onClick={onClose} className="erp-create-btn mkt-btn-secondary">Cancel</button>
          <button onClick={submit} disabled={saving} className="erp-create-btn"><Save size={15} /> {trip ? 'Save Changes' : 'Create Marketing Expense'}</button>
        </div>
      </div>
    </div>
  );
}

function CorrectionModal({ open, onClose, onSave }) {
  const [reason, setReason] = useState('');
  const [comments, setComments] = useState('');
  if (!open) return null;
  return (
    <div className="me-modal-overlay">
      <div className="me-modal">
        <div className="me-modal-head">
          <h3>Request Correction</h3>
          <button onClick={onClose} className="me-modal-close"><X size={16} /></button>
        </div>
        <div className="me-modal-body">
          <div className="qtn-field" style={{ marginBottom: 14 }}>
            <label>Reason for Correction <span className="required">*</span></label>
            <textarea className="qtn-input" rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Missing receipt for taxi expense" />
          </div>
          <div className="qtn-field">
            <label>Additional Comments</label>
            <textarea className="qtn-input" rows={2} value={comments} onChange={e => setComments(e.target.value)} placeholder="Any specific corrections needed..." />
          </div>
        </div>
        <div className="me-modal-foot mkt-action-scope">
          <button onClick={onClose} className="erp-create-btn mkt-btn-secondary">Cancel</button>
          <button onClick={() => { if (!reason.trim()) return; onSave({ rejectionReason: reason, correctionComments: comments }); }}
            disabled={!reason.trim()} className="erp-create-btn">
            <Repeat size={15} /> Send Correction Request
          </button>
        </div>
      </div>
    </div>
  );
}

function ExpenseModal({ open, onClose, onSave, expense }) {
  // Bill upload is its own permission (expenses → Upload).
  const { can } = useMarketingAccess();
  const canUpload = can('expenses', 'upload');
  const toast = useToast();
  const [form, setForm] = useState({});
  const [billStatus, setBillStatus] = useState('WITHOUT BILL');
  const [billFile, setBillFile] = useState(null);
  const [billPreview, setBillPreview] = useState(null);
  const [pendingRemoves, setPendingRemoves] = useState([]);
  const [customTypeDraft, setCustomTypeDraft] = useState('');
  const existingFileRef = useRef(null);
  const cameraRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const id = setTimeout(() => {
      const init = subTypeState(expense);
      setForm(expense
        ? { ...expense, expenseSubType: init.subType }
        : { expenseType: 'Travel', expenseSubType: TYPE_OPTIONS.Travel[0], billStatus: 'WITHOUT BILL' });
      setCustomTypeDraft(init.draft);
      setBillStatus(expense?.billStatus || 'WITHOUT BILL');
      setBillFile(null);
      setBillPreview(null);
      setPendingRemoves([]);
    }, 0);
    return () => clearTimeout(id);
  }, [open, expense]);

  const set = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const onCategoryChange = (e) => {
    const value = e.target.value;
    setForm(p => ({
      ...p,
      expenseType: value,
      expenseSubType: (TYPE_OPTIONS[value] || [])[0] || '',
      description: ''
    }));
    setCustomTypeDraft('');
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      toast.error('Supported: JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, CSV'); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10 MB'); return;
    }
    setBillFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setBillPreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setBillPreview('file');
    }
  };

  const handleSave = async () => {
    const type = form.expenseType || 'Travel';
    const custom = isCustomMarker(type, form.expenseSubType) ? customTypeDraft.trim() : '';
    const effectiveSubType = custom || form.expenseSubType || '';
    const existing = (expense?.attachments || []).filter(a => !pendingRemoves.includes(a.id));
    if (billStatus === 'WITH BILL' && !billFile && existing.length === 0) {
      toast.error('WITH BILL requires a bill attachment'); return;
    }
    if (billStatus === 'WITHOUT BILL' && (!form.withoutBillReason || !form.withoutBillReason.trim())) {
      toast.error('Without Bill requires a reason'); return;
    }
    if (!form.expenseDate) { toast.error('Date is required'); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error('Amount must be greater than 0'); return; }
    if (!effectiveSubType) { toast.error(`${TYPE_LABEL[type]} is required`); return; }
    if (custom.length > 50) { toast.error('Custom type must be under 50 characters'); return; }
    if (form.amount && Number(form.amount) >= 10000) {
      if (!window.confirm('This expense is ₹10,000 or more. Continue?')) return;
    }
    await onSave({ ...form, expenseSubType: effectiveSubType, billStatus }, billFile, pendingRemoves);
  };

  if (!open) return null;
  const type = form.expenseType || 'Travel';

  return (
    <div className="me-modal-overlay">
      <div className="me-modal me-modal-lg">
        <div className="me-modal-head">
          <h3>{expense?.id ? <><Edit3 size={16} /> Edit Expense</> : <><Plus size={16} /> Add Expense</>}</h3>
          <button onClick={onClose} className="me-modal-close"><X size={16} /></button>
        </div>
        <div className="me-modal-body">
          <div className="qtn-grid-3" style={{ marginBottom: 16 }}>
            <div className="qtn-field"><label>Expense Category <span className="required">*</span></label>
              <select className="qtn-select" value={form.expenseType} onChange={onCategoryChange}>
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
            <div className="qtn-field"><label>Date <span className="required">*</span></label>
              <input type="date" className="qtn-input" value={form.expenseDate || ''} onChange={set('expenseDate')} /></div>
            <div className="qtn-field"><label>Time</label>
              <input type="time" className="qtn-input" value={form.expenseTime || ''} onChange={set('expenseTime')} /></div>
          </div>

          <div className="qtn-grid-2" style={{ marginBottom: 16 }}>
            <div className="qtn-field">
              <label>{TYPE_LABEL[type]} <span className="required">*</span></label>
              <select className="qtn-select" value={form.expenseSubType || ''} onChange={set('expenseSubType')}>
                <option value="">— Select —</option>
                {CATEGORY_TYPES.includes(type) && (TYPE_OPTIONS[type] || []).map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {isCustomMarker(type, form.expenseSubType) && (
              <div className="qtn-field">
                <label>Specify {TYPE_LABEL[type].toLowerCase()} <span className="required">*</span></label>
                <input className="qtn-input" value={customTypeDraft} onChange={e => setCustomTypeDraft(e.target.value)}
                  placeholder="Type a new value (e.g. Ferry, Snacks)…" />
              </div>
            )}
          </div>

          {type === 'Travel' && (
            <div className="qtn-grid-2" style={{ marginBottom: 16 }}>
              <div className="qtn-field"><label>Operator / Provider</label>
                <input className="qtn-input" value={form.operatorProvider || ''} onChange={set('operatorProvider')} placeholder="e.g. KSRTC / Ola / IRCTC" /></div>
              <div className="qtn-field"><label>From</label>
                <input className="qtn-input" value={form.travelFrom || ''} onChange={set('travelFrom')} placeholder="e.g. Erode" /></div>
              <div className="qtn-field"><label>To</label>
                <input className="qtn-input" value={form.travelTo || ''} onChange={set('travelTo')} placeholder="e.g. Chennai" /></div>
              <div className="qtn-field"><label>Ticket No</label>
                <input className="qtn-input" value={form.ticketNumber || ''} onChange={set('ticketNumber')} /></div>
              <div className="qtn-field"><label>Passenger Name</label>
                <input className="qtn-input" value={form.passengerName || ''} onChange={set('passengerName')} /></div>
              <div className="qtn-field"><label>Travel Purpose</label>
                <input className="qtn-input" value={form.travelPurpose || ''} onChange={set('travelPurpose')} placeholder="e.g. Client meeting" /></div>
            </div>
          )}
          {type === 'Stay' && (
            <div className="qtn-grid-2" style={{ marginBottom: 16 }}>
              <div className="qtn-field"><label>Hotel / Lodge Name</label>
                <input className="qtn-input" value={form.hotelName || ''} onChange={set('hotelName')} placeholder="e.g. Grand Hotel" /></div>
              <div className="qtn-field"><label>Nights</label>
                <input type="number" min="0" className="qtn-input" value={form.numberOfNights || ''} onChange={set('numberOfNights')} /></div>
              <div className="qtn-field"><label>Check-in Date</label>
                <input type="date" className="qtn-input" value={form.checkInDate || ''} onChange={set('checkInDate')} /></div>
              <div className="qtn-field"><label>Check-in Time</label>
                <input type="time" className="qtn-input" value={form.checkInTime || ''} onChange={set('checkInTime')} /></div>
              <div className="qtn-field"><label>Check-out Date</label>
                <input type="date" className="qtn-input" value={form.checkOutDate || ''} onChange={set('checkOutDate')} /></div>
              <div className="qtn-field"><label>Check-out Time</label>
                <input type="time" className="qtn-input" value={form.checkOutTime || ''} onChange={set('checkOutTime')} /></div>
            </div>
          )}
          {type === 'Food' && (
            <div className="qtn-grid-3" style={{ marginBottom: 16 }}>
              <div className="qtn-field"><label>Restaurant / Vendor</label>
                <input className="qtn-input" value={form.restaurantVendor || ''} onChange={set('restaurantVendor')} placeholder="e.g. Hotel Saravana" /></div>
              <div className="qtn-field"><label>Persons</label>
                <input type="number" min="1" className="qtn-input" value={form.numberOfPersons || ''} onChange={set('numberOfPersons')} /></div>
              <div className="qtn-field"><label>Meal Occasion</label>
                <input className="qtn-input" value={form.location || ''} onChange={set('location')} placeholder="e.g. Client lunch" /></div>
            </div>
          )}
          {type === 'Other' && (
            <div className="qtn-grid-2" style={{ marginBottom: 16 }}>
              <div className="qtn-field"><label>Vendor / Place</label>
                <input className="qtn-input" value={form.location || ''} onChange={set('location')} placeholder="e.g. Chennai" /></div>
              <div className="qtn-field"><label>Notes / Details</label>
                <input className="qtn-input" value={form.description || ''} onChange={set('description')} placeholder="Optional notes (e.g. toll plaza name)" /></div>
            </div>
          )}

          <div className="qtn-grid-3" style={{ marginBottom: 16 }}>
            <div className="qtn-field"><label>Amount (₹) <span className="required">*</span></label>
              <input type="number" step="0.01" min="0" className="qtn-input" value={form.amount || ''} onChange={set('amount')} /></div>
            <div className="qtn-field"><label>Payment Method</label>
              <select className="qtn-select" value={form.paymentMethod || ''} onChange={set('paymentMethod')}>
                <option value="">— Select —</option>{PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select></div>
            <div className="qtn-field"><label>Bill Status <span className="required">*</span></label>
              <select className="qtn-select" value={billStatus} onChange={e => { setBillStatus(e.target.value); setForm(p => ({ ...p, billStatus: e.target.value })); }}>
                {BILL_STATUSES.map(b => <option key={b}>{b}</option>)}
              </select></div>
          </div>

          {form.amount && Number(form.amount) >= 10000 && (
            <div className="me-warn me-warn-amber"><AlertTriangle size={14} /><span>High-value expense (≥ ₹10,000). This will be flagged for approval review.</span></div>
          )}

          {billStatus === 'WITHOUT BILL' && (
            <div className="qtn-field" style={{ marginBottom: 16 }}>
              <label>Reason for Without Bill <span className="required">*</span></label>
              <textarea className="qtn-input" rows={2} value={form.withoutBillReason || ''} onChange={set('withoutBillReason')} placeholder="Why is the bill unavailable? (required)" />
            </div>
          )}

          {billStatus === 'WITH BILL' && (
            <div style={{ marginBottom: 16 }}>
              {(expense?.attachments || []).length > 0 && (
                <div className="me-attach-list" style={{ marginBottom: 12 }}>
                  {(expense.attachments || []).filter(a => !pendingRemoves.includes(a.id)).map(a => (
                    <div key={a.id} className="me-file-chip">
                      <BillIcon type={a.contentType} />
                      <span className="me-fname">{a.name}</span>
                      <span className="me-fsize">{fmtFileSize(a.size)}</span>
                      <button onClick={() => setPendingRemoves(p => [...p, a.id])} className="me-link me-del-link"
                        style={{ marginLeft: 6 }}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="me-upload-zone">
                <div>
                  <div className="me-upload-actions">
                    {canUpload ? (
                      <>
                        <button type="button" onClick={() => cameraRef.current?.click()} className="qtn-btn qtn-btn-secondary" style={{ height: 38 }}>
                          <Camera size={14} /> Take Photo</button>
                        <button type="button" onClick={() => existingFileRef.current?.click()} className="qtn-btn qtn-btn-secondary" style={{ height: 38 }}>
                          <Upload size={14} /> {expense?.id ? 'Replace / Add Bill' : 'Upload Bill'}</button>
                      </>
                    ) : (
                      <span className="me-td-muted">Bill upload is not permitted for your Marketing access.</span>
                    )}
                    <input ref={existingFileRef} type="file" accept={ACCEPT} className="me-print-hide" style={{ display: 'none' }} onChange={handleFile} />
                    <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="me-print-hide" style={{ display: 'none' }} onChange={handleFile} />
                  </div>
                  <p className="me-td-muted" style={{ marginTop: 8, fontSize: 11 }}>JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, CSV · max 10 MB</p>
                </div>
                {billFile && (
                  <div className="me-file-chip">
                    {billPreview === 'file' ? <BillIcon type={billFile.type} /> : isImageType(billFile.type) ? <img src={billPreview} alt="" className="me-thumb-img" /> : <BillIcon type={billFile.type} />}
                    <span className="me-fname">{billFile.name}</span>
                    <span className="me-fsize">{fmtFileSize(billFile.size)}</span>
                    <button onClick={() => { setBillFile(null); setBillPreview(null); }} className="me-link me-del-link" style={{ marginLeft: 6 }}>Remove</button>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="qtn-field">
            <label>Remarks</label>
            <textarea className="qtn-input" rows={2} value={form.remarks || ''} onChange={set('remarks')} placeholder="Any additional notes..." />
          </div>
        </div>
        <div className="me-modal-foot mkt-action-scope">
          <button onClick={onClose} className="erp-create-btn mkt-btn-secondary">Cancel</button>
          <button onClick={handleSave} className="erp-create-btn">{expense?.id ? 'Update Expense' : 'Save Expense'}</button>
        </div>
      </div>
    </div>
  );
}

function TripDetail({ tripId, onClose, onChanged }) {
  const toast = useToast();
  // Marketing Expenses action permissions (UI gate; the backend enforces).
  const { can } = useMarketingAccess();
  const canCreate = can('expenses', 'create');
  const canEdit = can('expenses', 'edit');
  const canDelete = can('expenses', 'delete');
  const canApprove = can('expenses', 'approve');
  const canPrint = can('expenses', 'print');
  const [trip, setTrip] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showCorrection, setShowCorrection] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showEditTrip, setShowEditTrip] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) return;
    setLoading(true);
    try {
      const res = await marketingService.getExpenseTrip(tripId);
      setTrip(res?.data || res);
    } catch (err) {    toast.error(err?.message || 'Failed to load expense'); }
    finally { setLoading(false); }
  }, [tripId, toast]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (!cancelled) await load();
    };
    run();
    return () => { cancelled = true; };
  }, [load]);

  const refresh = async () => { await load(); onChanged?.(); };

  if (loading) return <div className="me-loading">Loading...</div>;
  if (!trip) return <div className="me-loading">Expense not found</div>;

  const isActive = trip.status === 'Active';
  const isTripOff = trip.status === 'Completed';
  const isDraft = trip.approvalStatus === 'Draft';
  const isSubmitted = trip.approvalStatus === 'Submitted';
  const isApproved = trip.approvalStatus === 'Approved';
  const isRejected = trip.approvalStatus === 'Rejected';
  const canManageExpenses = !isSubmitted && !isApproved;
  const canEditTrip = isDraft && !isActive;
  const duration = fmtDuration(trip.tripOnDateTime, trip.tripOffDateTime);
  const expenses = trip.expenses || [];
  const billsAttached = expenses.reduce((n, e) => n + (e.attachments?.length || 0), 0);
  const highValueExpenses = expenses.filter(e => Number(e.amount) >= 10000);
  const missingBills = expenses.filter(e => e.billStatus === 'WITH BILL' && (!e.attachments || e.attachments.length === 0));

  const startTrip = async () => {
    try {
      const loc = await captureLocation();
      const payload = { tripOnLocation: trip.startLocation || undefined };
      if (loc) { payload.tripOnLatitude = loc.latitude; payload.tripOnLongitude = loc.longitude; }
      await marketingService.startExpenseTrip(trip.id, payload);
      await refresh();
    toast.success('Expense started');
    } catch (err) { toast.error(err?.message || 'Failed to activate expense'); }
  };

  const endTrip = async () => {
    if (!window.confirm('Complete this expense? No more changes will be allowed.')) return;
    try {
      const loc = await captureLocation();
      const payload = { tripOffLocation: trip.destination || undefined };
      if (loc) { payload.tripOffLatitude = loc.latitude; payload.tripOffLongitude = loc.longitude; }
      await marketingService.endExpenseTrip(trip.id, payload);
      await refresh();
    toast.success('Expense completed');
    } catch (err) { toast.error(err?.message || 'Failed to complete expense'); }
  };

  const submitTrip = async () => {
    const incomplete = expenses.filter(e => !e.expenseDate || !e.amount);
    if (incomplete.length > 0) { toast.error(`${incomplete.length} expense(s) missing required fields (date/amount)`); return; }
    if (missingBills.length > 0) { toast.error(`${missingBills.length} expense(s) marked WITH BILL but missing attachments`); return; }
    if (!window.confirm('Submit expenses for approval?')) return;
    try {
      await marketingService.submitExpenseTrip(trip.id);
      await refresh();
      toast.success('Submitted for approval');
    } catch (err) { toast.error(err?.message || 'Submit failed'); }
  };

  const approveTrip = async () => {
    const highCount = highValueExpenses.length;
    const noBillCount = expenses.filter(e => e.billStatus === 'WITHOUT BILL').length;
    let msg = 'Approve this expense?';
    if (highCount > 0) msg += `\n\nHigh-value expenses: ${highCount}`;
    if (noBillCount > 0) msg += `\nWithout-bill entries: ${noBillCount}`;
    if (!window.confirm(msg)) return;
    try {
      await marketingService.approveExpenseTrip(trip.id);
      await refresh();
      toast.success('Approved');
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const rejectTrip = async () => {
    const reason = window.prompt('Rejection reason (required):');
    if (!reason || !reason.trim()) return;
    try {
      await marketingService.rejectExpenseTrip(trip.id, { rejectionReason: reason });
      await refresh();
      toast.success('Rejected');
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const deleteExpense = async (exp) => {
    if (!window.confirm(`Delete expense EXP-${exp.id}?`)) return;
    try {
      await marketingService.deleteExpense(trip.id, exp.id);
      await refresh();
      toast.success('Expense deleted');
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const deleteTrip = async () => {
    if (!window.confirm('Delete this expense record and all its entries?')) return;
    try {
      await marketingService.deleteExpenseTrip(trip.id);
      toast.success('Expense deleted');
      onClose();
      onChanged?.();
    } catch (err) { toast.error(err?.message || 'Failed'); }
  };

  const saveExpense = async (data, newFile, pendingRemovesList) => {
    try {
      let newExpenseId = null;
      if (editingExpense?.id) {
        await marketingService.updateExpense(trip.id, editingExpense.id, data);
        newExpenseId = editingExpense.id;
      } else {
        const res = await marketingService.addExpense(trip.id, data);
        const updated = res?.data || res;
        newExpenseId = (updated?.expenses || []).reduce((m, e) => (!m || e.id > m.id) ? e : m, null)?.id || null;
      }
      for (const attId of pendingRemovesList) {
        try { await marketingService.deleteExpenseBill(trip.id, attId); } catch { /* keep going */ }
      }
      if (newFile && newExpenseId) {
        await marketingService.uploadExpenseBill(trip.id, newExpenseId, newFile);
      }
      setShowExpenseForm(false);
      await refresh();
      toast.success(editingExpense?.id ? 'Expense updated' : 'Expense saved');
    } catch (err) { toast.error(err?.message || 'Failed to save expense'); }
  };

  const saveTripInfo = async (form) => {
    await marketingService.updateExpenseTrip(trip.id, form);
    setShowEditTrip(false);
    await refresh();
    toast.success('Expense updated');
  };

  return (
    <div>
      <TripPrintView trip={trip} />
      <div className="me-head" style={{ marginTop: 4 }}>
        <div>
          <button onClick={onClose} className="me-crumb"><ArrowLeft size={15} /> Back to Expenses</button>
          <div className="me-head-left" style={{ marginTop: 10 }}>
            <span className="me-head-icon"><MapPin size={20} /></span>
            <div>
              <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                {trip.tripNo}
                <Pill status={trip.status} map={STATUS_PILL} />
                <Pill status={trip.approvalStatus} map={APPROVAL_PILL} />
              </h1>
              <p className="me-subtitle">{trip.marketer} · started {fmtDate(trip.startDate)}{duration !== '—' ? ` · duration ${duration}` : ''}</p>
            </div>
          </div>
        </div>
        <div className="me-head-actions">
          {canEditTrip && canEdit && (
            <button onClick={() => setShowEditTrip(true)} className="qtn-btn qtn-btn-secondary" style={{ height: 38 }}><Edit3 size={14} /> Edit Expense Details</button>
          )}
          {isDraft && trip.status === 'Planned' && canDelete && (
            <button onClick={deleteTrip} className="qtn-btn qtn-btn-secondary" style={{ height: 38, color: '#DC2626' }}><Trash2 size={14} /> Delete Expense Record</button>
          )}
          {canPrint && <button onClick={() => window.print()} className="qtn-btn qtn-btn-secondary" style={{ height: 38 }}><Printer size={14} /> Print</button>}
        </div>
      </div>

      <div className="qtn-create-grid">
        <div className="qtn-main-form">
          <div className="qtn-card">
            <div className="qtn-card-header">              <h3><FileText size={15} /> Expense Details</h3></div>
            <div className="qtn-card-body">
              <div className="me-info-grid">
                <div className="me-kv"><span className="me-kv-label">Marketer</span><span className="me-kv-value">{trip.marketer}</span></div>
                <div className="me-kv"><span className="me-kv-label">Start Location</span><span className="me-kv-value">{trip.startLocation || '—'}</span></div>
                <div className="me-kv"><span className="me-kv-label">Destination / Region</span><span className="me-kv-value">{trip.destination || '—'}</span></div>
                <div className="me-kv"><span className="me-kv-label">Purpose</span><span className="me-kv-value">{trip.purpose || '—'}</span></div>
                <div className="me-kv"><span className="me-kv-label">Start Date</span><span className="me-kv-value">{fmtDate(trip.startDate)}{trip.startTime ? ` ${trip.startTime}` : ''}</span></div>
                <div className="me-kv"><span className="me-kv-label">Expected End</span><span className="me-kv-value">{trip.expectedEndDate ? `${fmtDate(trip.expectedEndDate)}${trip.expectedEndTime ? ' ' + trip.expectedEndTime : ''}` : '—'}</span></div>
                <div className="me-kv"><span className="me-kv-label">Marketing Visit Ref</span><span className="me-kv-value">{trip.visitRef || '—'}</span></div>
                <div className="me-kv"><span className="me-kv-label">Status</span><span className="me-kv-value">{trip.status}{trip.approvalStatus !== 'Draft' ? ` · ${trip.approvalStatus}` : ''}</span></div>
              </div>
              {trip.remarks && <p className="me-td-muted" style={{ marginTop: 14, fontSize: 12 }}><strong>Remarks:</strong> {trip.remarks}</p>}
            </div>
          </div>

          <div className="qtn-card">
            <div className="qtn-card-header"><h3><DollarSign size={15} /> Expense Summary</h3></div>
            <div className="qtn-card-body">
              <div className="me-stats">
                <div className="me-stat me-stat-cat"><div className="me-stat-value">{fmtINR(trip.travelTotal)}</div><div className="me-stat-label">Travel ({expenses.filter(e => e.expenseType === 'Travel').length})</div></div>
                <div className="me-stat me-stat-cat"><div className="me-stat-value">{fmtINR(trip.stayTotal)}</div><div className="me-stat-label">Stay ({expenses.filter(e => e.expenseType === 'Stay').length})</div></div>
                <div className="me-stat me-stat-cat"><div className="me-stat-value">{fmtINR(trip.foodTotal)}</div><div className="me-stat-label">Food ({expenses.filter(e => e.expenseType === 'Food').length})</div></div>
                <div className="me-stat me-stat-cat"><div className="me-stat-value">{fmtINR(trip.otherTotal)}</div><div className="me-stat-label">Other ({expenses.filter(e => e.expenseType === 'Other').length})</div></div>
                <div className="me-stat me-stat-cat"><div className="me-stat-value me-stat-currency">{fmtINR(trip.withBillTotal)}</div><div className="me-stat-label">With Bill</div></div>
                <div className="me-stat me-stat-cat"><div className="me-stat-value me-stat-currency">{fmtINR(trip.withoutBillTotal)}</div><div className="me-stat-label">Without Bill</div></div>
                <div className="me-stat"><div className="me-stat-value">{expenses.length}</div><div className="me-stat-label">Entries</div></div>
                <div className="me-stat"><div className="me-stat-value">{billsAttached}</div><div className="me-stat-label">Bills Attached</div></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
                <span className="me-kv-value">Grand Total</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0B4A3D' }}>{fmtINR(trip.totalAmount)}</span>
              </div>
            </div>
          </div>

          <div className="qtn-card">
            <div className="qtn-card-header">
              <h3><Activity size={15} /> Expense Lifecycle Timeline</h3>
              <button onClick={() => setShowTimeline(!showTimeline)} className="me-modal-close">
                {showTimeline ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>
            {showTimeline && (
              <div className="qtn-card-body">
                <Timeline audit={trip.auditLog} />
              </div>
            )}
          </div>

          <div className="qtn-card">
            <div className="qtn-card-header">
              <h3><FileText size={15} /> Expenses ({expenses.length})</h3>
              {isActive && canCreate && (
                <button onClick={() => { setEditingExpense(null); setShowExpenseForm(true); }} className="qtn-btn qtn-btn-primary" style={{ height: 36 }}>
                  <Plus size={14} /> Add Expense
                </button>
              )}
            </div>
            {highValueExpenses.length > 0 && (
              <div style={{ padding: '0 24px' }}>
                <div className="me-warn me-warn-amber">
                  <AlertTriangle size={14} />
                  <span><strong>{highValueExpenses.length} high-value expense(s) (≥ ₹10,000)</strong> — flagged for approver review.</span>
                </div>
              </div>
            )}
            <div className="me-table-wrap">
              <table className="me-table">
                <thead>
                  <tr>
                    <th>ID</th><th>Date</th><th>Type</th><th>Details</th><th>Vendor / From</th>
                    <th>To</th><th>Payment</th><th className="me-td-right">Amount</th><th>Bill</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(exp => {
                    const Icon = CAT_ICON[exp.expenseType] || Package;
                    return (
                      <tr key={exp.id}>
                        <td className="me-td-blue">EXP-{exp.id}</td>
                        <td>{fmtDate(exp.expenseDate)} {exp.expenseTime || ''}</td>
                        <td><span className={CAT_CHIP[exp.expenseType] || 'me-chip me-chip-other'}><Icon size={10} /> {exp.expenseType}</span></td>
                        <td>
                          {subDetail(exp)}
                        </td>
                        <td className="me-td-muted">{exp.operatorProvider || exp.hotelName || exp.restaurantVendor || exp.location || '—'}</td>
                        <td className="me-td-muted">{exp.travelTo || '—'}</td>
                        <td className="me-td-muted">{exp.paymentMethod || '—'}</td>
                        <td className="me-td-right me-td-strong">{fmtINR(exp.amount)}</td>
                        <td>
                          <Pill status={exp.billStatus} map={BILL_PILL} />
                          {exp.billStatus === 'WITH BILL' && (exp.attachments?.length || 0) > 0 && (
                            <span className="me-td-muted" style={{ marginLeft: 4 }}>({(exp.attachments || []).length})</span>
                          )}
                          {exp.billStatus === 'WITHOUT BILL' && exp.withoutBillReason && (
                            <span title={exp.withoutBillReason} className="me-td-muted" style={{ marginLeft: 4 }}>· info</span>
                          )}
                        </td>
                        <td>
                          <span className="me-row-actions">
                            {canManageExpenses && canEdit && (
                              <button className="me-icon-btn me-edit" title="Edit" onClick={() => { setEditingExpense(exp); setShowExpenseForm(true); }}><Edit3 size={13} /></button>
                            )}
                            {canManageExpenses && !isApproved && !isSubmitted && canDelete && (
                              <button className="me-icon-btn me-del" title="Delete" onClick={() => deleteExpense(exp)}><Trash2 size={13} /></button>
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {expenses.length === 0 && (
                    <tr><td colSpan={10} className="me-empty">No expenses yet. Start the expense and add entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="qtn-sidebar-form">
          <div className="qtn-card">
            <div className="qtn-card-header">              <h3><MapPin size={15} /> Expense Journey</h3></div>
            <div className="qtn-card-body">
              <div className="me-journey">
                <div className="me-journey-row">
                  <span className="me-journey-badge" style={{ background: '#9CA3AF' }}>NEW</span>
                  <span className="me-jl">{fmtDateTime(trip.createdAt)}</span>
                  <span className="me-jv">Expense Created</span>
                </div>
                <div className="me-journey-row">
                  <span className="me-journey-badge" style={{ background: '#2563EB' }}>START</span>
                  <span className="me-jl">{trip.tripOnDateTime ? fmtDateTime(trip.tripOnDateTime) : '—'}</span>
                  <span className="me-jv">{trip.tripOnLocation || trip.startLocation || 'Not started'}</span>
                </div>
                <div className="me-journey-row">
                  <span className="me-journey-badge" style={{ background: '#10B981' }}>EX</span>
                  <span className="me-jl">{expenses.length ? `${expenses.length} entries` : '—'}</span>
                  <span className="me-jv">{expenses.length ? fmtINR(trip.totalAmount) : 'No expenses'}</span>
                </div>
                <div className="me-journey-row">
                  <span className="me-journey-badge" style={{ background: '#EF4444' }}>END</span>
                  <span className="me-jl">{trip.tripOffDateTime ? fmtDateTime(trip.tripOffDateTime) : '—'}</span>
                  <span className="me-jv">{trip.tripOffLocation || trip.destination || 'Not ended'}</span>
                </div>
                <div className="me-journey-row">
                  <span className="me-journey-badge" style={{ background: isApproved ? '#10B981' : isRejected ? '#EF4444' : '#F59E0B' }}>
                    {isApproved ? 'OK' : isRejected ? 'NO' : 'SB'}
                  </span>
                  <span className="me-jl">{isApproved ? `${fmtDateTime(trip.approvedAt)}` : (trip.auditLog || []).find(l => l.action === 'EXPENSE_SUBMITTED') ? fmtDateTime((trip.auditLog || []).find(l => l.action === 'EXPENSE_SUBMITTED').performedAt) : '—'}</span>
                  <span className="me-jv">{isApproved ? `Approved by ${trip.approvedBy || '—'}` : isRejected ? 'Rejected' : trip.approvalStatus}</span>
                </div>
              </div>
            </div>
          </div>

          {isTripOff && isDraft && missingBills.length > 0 && (
            <div className="me-warn me-warn-rose"><AlertTriangle size={14} /><span><strong>Attention:</strong> {missingBills.length} expense(s) marked WITH BILL are missing attachments. Add bills before submitting.</span></div>
          )}
          {trip.rejectionReason && (
            <div className="me-warn me-warn-rose"><X size={14} /><span><strong>Rejected:</strong> {trip.rejectionReason}</span></div>
          )}
          {trip.correctionComments && (
            <div className="me-warn me-warn-amber"><Repeat size={14} /><span><strong>Correction requested:</strong> {trip.correctionComments}</span></div>
          )}

          <div className="qtn-card">
            <div className="qtn-card-header"><h3><Clock size={15} /> Reference</h3></div>
            <div className="qtn-card-body">
              <div className="me-info-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="me-kv"><span className="me-kv-label">Created</span><span className="me-kv-value">{fmtDateTime(trip.createdAt)}</span></div>
                <div className="me-kv"><span className="me-kv-label">Last Updated</span><span className="me-kv-value">{fmtDateTime(trip.updatedAt)}</span></div>
                <div className="me-kv"><span className="me-kv-label">Approved By</span><span className="me-kv-value">{trip.approvedBy || '—'}</span></div>
                {trip.totalAmount != null && <div className="me-kv"><span className="me-kv-label">Total</span><span className="me-kv-value">{fmtINR(trip.totalAmount)}</span></div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="qtn-form-footer mkt-action-scope">
        <div className="qtn-form-footer-left">
          <button onClick={onClose} className="erp-create-btn mkt-btn-secondary"><ArrowLeft size={15} /> Back to Expenses</button>
        </div>
        <div className="qtn-form-footer-right">
          {isDraft && !isActive && !trip.tripOnDateTime && !isTripOff && (
            <button onClick={startTrip} className="erp-create-btn"><MapPin size={15} /> Start Expense</button>
          )}
          {isActive && (
            <>
              {canCreate && <button onClick={() => { setEditingExpense(null); setShowExpenseForm(true); }} className="erp-create-btn"><Plus size={15} /> Add Expense</button>}
              {canEdit && <button onClick={endTrip} className="qtn-btn" style={{ background: '#E11D48', color: '#fff' }}><LogOut size={15} /> Complete Expense</button>}
            </>
          )}
          {isTripOff && isDraft && canEdit && (              <button onClick={submitTrip} className="erp-create-btn"><Send size={15} /> Submit for Approval</button>
          )}
          {isTripOff && isRejected && canEdit && (              <button onClick={submitTrip} className="erp-create-btn"><Send size={15} /> Resubmit for Approval</button>
          )}
          {isSubmitted && canApprove && (
            <>
              <button onClick={approveTrip} className="erp-create-btn"><Check size={15} /> Approve</button>
              <button onClick={rejectTrip} className="qtn-btn" style={{ background: '#E11D48', color: '#fff' }}><X size={15} /> Reject</button>
              <button onClick={() => setShowCorrection(true)} className="qtn-btn" style={{ background: '#D97706', color: '#fff' }}><Repeat size={15} /> Request Correction</button>
            </>
          )}
          {isApproved && canPrint && (
            <button onClick={() => window.print()} className="erp-create-btn"><Printer size={15} /> Print Report</button>
          )}
        </div>
      </div>

      <ExpenseModal open={showExpenseForm} onClose={() => setShowExpenseForm(false)} expense={editingExpense} onSave={saveExpense} />
      <CorrectionModal open={showCorrection} onClose={() => setShowCorrection(false)}
        onSave={async (payload) => {
          try {
            await marketingService.requestExpenseCorrection(trip.id, payload);
            await refresh();
            toast.success('Correction requested');
          } catch (err) { toast.error(err?.message || 'Failed'); }
          setShowCorrection(false);
        }} />
      <TripModal open={showEditTrip} onClose={() => setShowEditTrip(false)} trip={trip} onSave={saveTripInfo} />
    </div>
  );
}

export default function MarketingExpenses() {
  const toast = useToast();
  const { can } = useMarketingAccess();
  const canCreateExpense = can('expenses', 'create');
  const [activeTab, setActiveTab] = useState('');
  const [trips, setTrips] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [size] = useState(15);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const allPageSelected = trips.length > 0 && trips.every((row) => selectedIds.includes(row.id));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !trips.some((row) => row.id === id)));
    } else {
      const ids = new Set(selectedIds);
      trips.forEach((row) => ids.add(row.id));
      setSelectedIds([...ids]);
    }
  };
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const headerRowRef = useRef(null);
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey: 'tripNo',
    visibleKeys: ['tripNo', 'marketer', 'visitRef', 'startLocation', 'destination', 'startDate', 'tripOffDateTime', 'duration', 'status', 'approvalStatus', 'expenseCount', 'withBillTotal', 'totalAmount']
  });

  const loadTrips = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, size, sort: 'createdAt,desc' };
      if (search) params.search = search;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      if (activeTab === 'Active') params.status = 'Active';
      else if (activeTab === 'tripoff') params.status = 'Completed';
      else if (activeTab === 'pending-submission') { params.status = 'Completed'; params.approvalStatus = 'Draft'; }
      else if (activeTab === 'Submitted') params.approvalStatus = 'Submitted';
      else if (activeTab === 'Approved') params.approvalStatus = 'Approved';
      else if (activeTab === 'Rejected') params.approvalStatus = 'Rejected';
      else if (activeTab === 'Completed') params.status = 'Completed';
      const res = await marketingService.listExpenseTrips(params);
      const parsed = parsePage(res);
      if (activeTab === 'Completed') {
        const closed = (parsed.list || []).filter(t => t.approvalStatus === 'Approved' || t.approvalStatus === 'Rejected');
        setTrips(closed);
        setTotal(closed.length);
      } else {
        setTrips(parsed.list);
        setTotal(parsed.total);
      }
    } catch { setTrips([]); setTotal(0); }
    finally { setLoading(false); }
  }, [page, size, search, activeTab, dateFrom, dateTo]);

  const loadSummary = useCallback(async () => {
    try {
      const params = {};
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await marketingService.getExpenseSummary(params);
      setSummary(res?.data || res);
    } catch { /* keep previous */ }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (!cancelled) await loadTrips();
    };
    run();
    return () => { cancelled = true; };
  }, [loadTrips]);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await Promise.resolve();
      if (!cancelled) await loadSummary();
    };
    run();
    return () => { cancelled = true; };
  }, [loadSummary]);

  if (selectedTripId) {
    return (
      <div className="qtn-create-page me-page">
        <div className="qtn-create-inner">
          <TripDetail tripId={selectedTripId} onClose={() => setSelectedTripId(null)} onChanged={() => { loadTrips(); loadSummary(); }} />
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(total / size);

  return (
    <div className="purchase-page cpr-page">
      {/* Breadcrumb (Purchase PR design) */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button type="button" className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <button type="button" className="bc-link" onClick={() => navigate('/marketing')}>Marketing</button>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span className="bc-current">Expenses</span>
      </nav>

      {/* Page Header (Purchase PR design) */}
      <div className="pr-page-header">
        <div className="pr-page-header-title">
          <h1>
            <BarChart3 size={22} />
            Marketing Expenses
          </h1>
          <p className="po-page-header-subtitle">Record marketing visit expenses, manage bills, and route through approval.</p>
        </div>
        {canCreateExpense && (
          <div className="pr-page-header-actions">
            <button onClick={() => openInNewTab('/marketing/expenses/new')} className="erp-btn-primary"><Plus size={14} /> New Marketing Expense</button>
          </div>
        )}
      </div>

        <SummaryCards summary={summary} dateFrom={dateFrom} dateTo={dateTo}
          activeTab={activeTab}
          onDateChange={(which, val) => { if (which === 'from') setDateFrom(val); else setDateTo(val); setPage(0); }}
          onFilter={(tab) => { setActiveTab(tab); setPage(0); }} />

        <div className="pr-tabs">
          {EXPENSE_TABS.map(tab => (
            <button key={tab.key} onClick={() => { setActiveTab(tab.key); setPage(0); }}
              className={`pr-tab ${activeTab === tab.key ? 'active' : ''}`}>{tab.label}</button>
          ))}
        </div>

        <div className="pr-toolbar">
          <div className="pr-toolbar-left">
            <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}              placeholder="Search by expense no, marketer, location, purpose, visit ref..." className="pr-search-input" style={{ width: 360 }} />
          </div>
          <div className="pr-toolbar-right">
            <span className="toolbar-count">{total} expense(s)</span>
          </div>
        </div>

        <div className="pr-table-card">
          <div className="pr-table-wrap">
            {/* `sgrid` = the shared sticky data grid (styles/sticky-data-grid.css):
                the checkbox and Expense No stay pinned while the table scrolls. */}
            <table className="pr-table sgrid sgrid-mkt pr-table-fixed" style={{ tableLayout: 'fixed', minWidth: 1720 }}>
              <colgroup>
                <col style={{ width: 50 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 130 }} />
              </colgroup>
              <thead>
                <tr ref={headerRowRef}>
                  <th className="checkbox-cell sgrid-pin sgrid-first" style={{ width: 50 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th data-sticky-key="tripNo" data-sticky-col="true" className="sgrid-pin" style={{ left: stickyLeft }}>Expense No</th><th>Marketer</th><th>Marketing Visit</th><th>Start Location</th><th>Destination</th><th>Start Date</th><th>End Date</th><th>Duration</th>
                  <th>Status</th><th>Approval</th><th>Expenses</th><th>With Bill</th><th className="me-td-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={14} className="me-empty">Loading...</td></tr>
                : trips.length === 0 ? <tr><td colSpan={14} className="me-empty">No expenses found. Create one to begin.</td></tr>
                : trips.map(t => (
                  <tr key={t.id} className={`${selectedIds.includes(t.id) ? 'is-selected' : ''} clickable group`} onClick={() => setSelectedTripId(t.id)}>
                    <td className="checkbox-cell sgrid-pin sgrid-first" data-sticky-col="true">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(t.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(t.id) ? prev.filter((id) => id !== t.id) : [...prev, t.id]
                          )
                        }
                        aria-label={`Select ${t.tripNo}`}
                      />
                    </td>
                    <td className="me-td-blue cell-id sgrid-pin" style={{ left: stickyLeft }}>
                        <a
                          href={`/marketing/expenses/${t.id}/edit`}
                          className="text-[#0B4A3D] font-bold hover:underline cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                          title={t.tripNo}
                        >
                          {t.tripNo}
                        </a>
                      </td>
                    <td title={t.marketer || ''}>{t.marketer}</td>
                    <td className="me-td-muted" title={t.visitRef || ''}>{t.visitRef || '—'}</td>
                    <td title={t.startLocation || ''}>{t.startLocation || '—'}</td>
                    <td className="me-td-muted" title={t.destination || ''}>{t.destination || '—'}</td>
                    <td className="cell-date">{fmtDate(t.startDate)}</td>
                    <td className="me-td-muted cell-date">{t.tripOffDateTime ? fmtDateTime(t.tripOffDateTime) : '—'}</td>
                    <td className="me-td-muted">{fmtDuration(t.tripOnDateTime, t.tripOffDateTime)}</td>
                    <td><Pill status={t.status} map={STATUS_PILL} /></td>
                    <td><Pill status={t.approvalStatus} map={APPROVAL_PILL} /></td>
                    <td>{t.expenseCount || 0}</td>
                    <td style={{ color: '#047857', fontWeight: 700 }}>{fmtINR(t.withBillTotal)}</td>
                    <td className="me-td-right me-td-strong">{fmtINR(t.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <p className="me-td-muted" style={{ fontSize: 12 }}>Showing {page * size + 1}—{Math.min((page + 1) * size, total)} of {total}</p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                className="qtn-btn qtn-btn-secondary" style={{ height: 36, padding: '0 16px' }}>Prev</button>
              <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 10px', fontSize: 12, fontWeight: 700, color: '#6B7280' }}>{page + 1} / {totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                className="qtn-btn qtn-btn-secondary" style={{ height: 36, padding: '0 16px' }}>Next</button>
            </div>
          </div>
        )}

    </div>
  );
}