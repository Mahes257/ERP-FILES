import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList,
  Clock, Filter, ListOrdered, Megaphone, MessageSquare,
  Phone, Plus, Search, Target, TrendingUp, User, X, XCircle
} from 'lucide-react';
import { FormField, Modal, SelectInput, TextArea, TextInput, useToast } from '../components/Common';
import StatusBadge from '../components/Common/StatusBadge';
import SalesKpiCards from '../components/SalesTable/SalesKpiCards';
import useStickyColumnLeft from '../hooks/useStickyColumnLeft';
import marketingService from '../services/marketingService';
import customerService from '../services/customerService';
import QuestionnaireForm from '../components/Marketing/QuestionnaireForm';
import QFormPreview from '../components/Marketing/QFormPreview';
import QFormList from '../components/Marketing/QFormList';
import TravelPlanner from '../components/Marketing/TravelPlanner';
import MarketingExpenses from '../components/Marketing/MarketingExpenses';
import MarketingMapPage from '../components/Marketing/MarketingMapPage';

// ============================== Constants ==============================

const VIEWS = [
  { key: 'today', label: 'Today' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'pending-followups', label: 'Pending Follow-ups' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'completed', label: 'Completed' },
  { key: 'leads', label: 'Leads' },
  { key: 'handover', label: 'Handover' },
  { key: 'qforms', label: 'Q Forms' },
  { key: 'travel-planner', label: 'Travel Registry' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'map', label: 'Marketing Map' }
];

const APPOINTMENT_STATUSES = ['Fixed', 'Direct Visit', 'Pending Confirmation', 'Rescheduled', 'Cancelled'];
const VISIT_STATUSES = ['Planned', 'In Progress', 'Completed', 'Rescheduled', 'Cancelled', 'No Visit'];
const NEW_VISIT_QFORM_STATUSES = ['Not Prepared', 'Filled & Submitted'];
const QFORM_STATUSES = ['Not Prepared', 'Draft', 'Filled & Submitted', 'Pending', 'Not Required'];
const FOLLOWUP_STATUSES = ['Pending', 'Completed', 'Overdue', 'Rescheduled', 'Cancelled', 'No Response'];
const FOLLOWUP_MODES = ['Visit', 'Phone', 'WhatsApp', 'Email', 'Online Meeting', 'Other'];
const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];
const OUTCOMES = [
  'Lead Generated', 'Existing Customer Opportunity', 'Existing Order', 'Follow-up Required',
  'No Lead', 'Not Interested', 'Lost Opportunity', 'Need Further Discussion', 'Other'
];

const SUMMARY_CARDS = [
  { key: 'todayVisits', label: "Today's Visits", view: 'today', icon: CalendarDays, color: '#16A34A', newTabUrl: '/marketing?view=today' },
  { key: 'upcomingVisits', label: 'Upcoming Visits', view: 'upcoming', icon: Clock, color: '#2563EB', newTabUrl: '/marketing?view=upcoming' },
  { key: 'pendingVisits', label: 'Pending Visits', view: 'pending-visits', icon: User, color: '#D97706', newTabUrl: '/marketing?view=pending-visits' },
  { key: 'completedVisits', label: 'Completed Visits', view: 'completed', icon: CheckCircle2, color: '#059669', newTabUrl: '/marketing?view=completed' },
  { key: 'overdueFollowups', label: 'Overdue Follow-ups', view: 'overdue', icon: XCircle, color: '#DC2626', newTabUrl: '/marketing?view=overdue' },
  { key: 'todayFollowups', label: "Today's Follow-ups", view: 'today-followups', icon: Phone, color: '#4F46E5', newTabUrl: '/marketing?view=today-followups' },
  { key: 'leadsGenerated', label: 'Leads Generated', view: 'leads', icon: Target, color: '#7C3AED', newTabUrl: '/leads' },
  { key: 'qualifiedLeads', label: 'Qualified Leads', view: 'qualified-leads', icon: TrendingUp, color: '#16A34A', newTabUrl: '/leads?status=Qualified' },
  { key: 'noLeadVisits', label: 'No Lead Visits', view: 'no-lead', icon: XCircle, color: '#6B7280', newTabUrl: '/marketing?view=no-lead' },
  { key: 'salesHandoverPending', label: 'Sales Handover Pending', view: 'handover', icon: Megaphone, color: '#EA580C', newTabUrl: '/marketing?view=handover' }
];

const PILL = {
  Fixed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Direct Visit': 'bg-sky-50 text-sky-700 border-sky-200',
  'Pending Confirmation': 'bg-amber-50 text-amber-700 border-amber-200',
  Rescheduled: 'bg-violet-50 text-violet-700 border-violet-200',
  Cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  Planned: 'bg-slate-100 text-slate-600 border-slate-200',
  'No Visit': 'bg-slate-100 text-slate-500 border-slate-200',
  Scheduled: 'bg-slate-100 text-slate-600 border-slate-200',
  'In Progress': 'bg-[#E8F0EE] text-[#0B4A3D] border-[#B8D4CC]',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Not Prepared': 'bg-slate-100 text-slate-500 border-slate-200',
  Draft: 'bg-amber-50 text-amber-700 border-amber-200',
  'Filled & Submitted': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  'Not Required': 'bg-slate-100 text-slate-500 border-slate-200',
  Overdue: 'bg-rose-50 text-rose-700 border-rose-200',
  'No Response': 'bg-slate-100 text-slate-500 border-slate-200',
  'Lead Generated': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Existing Customer Opportunity': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Existing Order': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Follow-up Required': 'bg-amber-50 text-amber-700 border-amber-200',
  'No Lead': 'bg-slate-100 text-slate-500 border-slate-200',
  'Not Interested': 'bg-rose-50 text-rose-700 border-rose-200',
  'Lost Opportunity': 'bg-rose-50 text-rose-700 border-rose-200',
  'Need Further Discussion': 'bg-sky-50 text-sky-700 border-sky-200',
  Other: 'bg-slate-100 text-slate-500 border-slate-200',
  'Ready for Sales': 'bg-amber-50 text-amber-700 border-amber-200',
  'Handed Over': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Not Ready': 'bg-slate-100 text-slate-500 border-slate-200'
};

const TABLE_COLUMNS = [
  { key: 'visitNo', label: 'Visit' },
  { key: 'scheduleDate', label: 'Schedule Date' },
  { key: 'companyName', label: 'Company / Plant' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'appointmentStatus', label: 'Appointment' },
  { key: 'visitStatus', label: 'Visit Status' },
  { key: 'qFormStatus', label: 'Q Form' },
  { key: 'leadNo', label: 'Lead No' },
  { key: 'requirementPriority', label: 'Priority' },
  { key: 'nextAction', label: 'Next Action' },
  { key: 'followupDate', label: 'Follow-up Date' },
  { key: 'followupStatus', label: 'Follow-up' },
  { key: 'outcome', label: 'Outcome' },
  { key: 'handoverStatus', label: 'Handover' }
];

// ============================== Helpers ==============================

const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—');

const fmtDateTime = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 16).replace('T', ' ');
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
};

const fmtINR = (v) =>
  v == null || v === '' ? '—' : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

function StatusPill({ status }) {
  return <StatusBadge status={status} />;
}

function parsePageResponse(response) {
  if (Array.isArray(response)) return { list: response, total: response.length };
  if (response?.content) return { list: response.content, total: response.totalElements ?? response.content.length };
  if (Array.isArray(response?.data)) return { list: response.data, total: response.total ?? response.data.length };
  if (Array.isArray(response?.data?.content)) {
    return { list: response.data.content, total: response.data.totalElements ?? response.data.content.length };
  }
  return { list: [], total: 0 };
}

// ============================== New Visit ==============================

function NewVisitModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [customers, setCustomers] = useState([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    scheduleDate: new Date().toISOString().slice(0, 10),
    companyName: '',
    customerId: '',
    location: '',
    appointmentStatus: 'Fixed',
    appointmentDate: '',
    appointmentTime: '',
    contactPerson: '',
    designation: '',
    phone: '',
    email: '',
    appointmentRemarks: '',
    qFormStatus: 'Not Prepared'
  });

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    customerService
      .list()
      .then((res) => {
        const rows = Array.isArray(res) ? res : res?.data ?? [];
        if (!cancelled) setCustomers(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onCustomerChange = (e) => {
    const id = e.target.value;
    const customer = customers.find((c) => String(c.id) === id);
    setForm((prev) => ({
      ...prev,
      customerId: id,
      companyName: customer ? customer.businessName : prev.companyName,
      contactPerson: customer ? customer.contactPerson || prev.contactPerson : prev.contactPerson,
      phone: customer ? customer.phone || prev.phone : prev.phone,
      email: customer ? customer.email || prev.email : prev.email,
      location: customer ? [customer.billingCity, customer.billingState].filter(Boolean).join(', ') || prev.location : prev.location
    }));
  };

  const submit = async () => {
    if (!form.companyName && !form.customerId) {
      toast.error('Company / Plant name or a Customer is required');
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, customerId: form.customerId ? Number(form.customerId) : null };
      await marketingService.create(payload);
      toast.success('Visit created');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to create visit');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New Visit" maxWidth="max-w-2xl">
      <div className="space-y-5">
        <div>
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Basic Information</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Schedule Date">
              <TextInput type="date" value={form.scheduleDate} onChange={set('scheduleDate')} />
            </FormField>
            <FormField label="Marketer">
              <TextInput value={form.marketer || ''} placeholder="Auto — current user" disabled />
            </FormField>
            <FormField label="Customer / Prospect">
              <SelectInput value={form.customerId} onChange={onCustomerChange}>
                <option value="">— Select Customer —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.businessName}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Company / Plant Name">
              <TextInput value={form.companyName} onChange={set('companyName')} placeholder="e.g. ABC Cement" />
            </FormField>
            <FormField label="Location">
              <TextInput value={form.location} onChange={set('location')} placeholder="City / plant location" />
            </FormField>
            <FormField label="Appointment Status">
              <SelectInput value={form.appointmentStatus} onChange={set('appointmentStatus')}>
                {APPOINTMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Appointment Details</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Appointment Date">
              <TextInput type="date" value={form.appointmentDate} onChange={set('appointmentDate')} />
            </FormField>
            <FormField label="Appointment Time">
              <TextInput type="time" value={form.appointmentTime} onChange={set('appointmentTime')} />
            </FormField>
            <FormField label="Contact Person">
              <TextInput value={form.contactPerson} onChange={set('contactPerson')} />
            </FormField>
            <FormField label="Designation">
              <TextInput value={form.designation} onChange={set('designation')} />
            </FormField>
            <FormField label="Phone">
              <TextInput value={form.phone} onChange={set('phone')} />
            </FormField>
            <FormField label="Email">
              <TextInput type="email" value={form.email} onChange={set('email')} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Appointment Remarks">
                <TextArea value={form.appointmentRemarks} onChange={set('appointmentRemarks')} rows={2} />
              </FormField>
            </div>
          </div>
        </div>

        <div>
          <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2.5">Marketing Visit</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Q Form Status">
              <SelectInput value={form.qFormStatus} onChange={set('qFormStatus')}>
                {NEW_VISIT_QFORM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Visit Status">
              <TextInput value="Planned" disabled />
            </FormField>
          </div>
        </div>

        <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 h-[36px] rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 h-[36px] rounded-lg text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] transition-colors cursor-pointer disabled:opacity-50"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            {saving ? 'Creating...' : 'Create Visit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================== Visit Detail ==============================

function SectionCard({ title, icon: Icon, children, action }) {
  return (
    <section className="qpo-view-section">
      <div className="qpo-dash-card-header">
        <h3>
          {Icon && <Icon />}
          {title}
        </h3>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

const DetailField = ({ label, value }) => (
  <div className="min-w-0">
    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{label}</div>
    <div className="text-xs text-slate-700 font-medium break-words">{value || '—'}</div>
  </div>
);

function VisitDetailModal({ visitId, onClose, onChanged, onOpenQForm }) {
  const toast = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({});
  const [visitHistory, setVisitHistory] = useState([]);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [showReschedule, setShowReschedule] = useState(false);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [showLinkLead, setShowLinkLead] = useState(false);
  const [leadSearch, setLeadSearch] = useState('');
  const [leadOptions, setLeadOptions] = useState([]);
  const [leadForm, setLeadForm] = useState({ leadName: '', estimatedValue: '', priority: 'Medium' });

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const load = useCallback(async () => {
    // Modal is always mounted; never fetch a visit when no id is selected
    // (would otherwise fire GET /marketing/visits/null →’ 400 on page load).
    if (!visitId) return;
    setLoading(true);
    try {
      const res = await marketingService.get(visitId);
      const data = res?.data ?? res;
      setDetail(data);
      setForm({
        scheduleDate: data.scheduleDate || '',
        companyName: data.companyName || '',
        location: data.location || '',
        appointmentStatus: data.appointmentStatus || 'Fixed',
        appointmentDate: data.appointmentDate || '',
        appointmentTime: data.appointmentTime || '',
        contactPerson: data.contactPerson || '',
        designation: data.designation || '',
        phone: data.phone || '',
        email: data.email || '',
        appointmentRemarks: data.appointmentRemarks || '',
        meetingPerson: data.meetingPerson || '',
        meetingDesignation: data.meetingDesignation || '',
        qFormStatus: data.qFormStatus || 'Not Prepared',
        qFormDetails: data.qFormDetails || '',
        qFormRemarks: data.qFormRemarks || '',
        requirement: data.requirement || '',
        productService: data.productService || '',
        quantity: data.quantity || '',
        technicalRequirement: data.technicalRequirement || '',
        expectedPurchaseTimeline: data.expectedPurchaseTimeline || '',
        budget: data.budget || '',
        requirementPriority: data.requirementPriority || '',
        technicalRemarks: data.technicalRemarks || '',
        visitDescription: data.visitDescription || '',
        discussion: data.discussion || '',
        customerResponse: data.customerResponse || '',
        customerFeedback: data.customerFeedback || '',
        technicalDiscussion: data.technicalDiscussion || '',
        remarks: data.remarks || '',
        outcome: data.outcome || '',
        noLeadReason: data.noLeadReason || '',
        nextAction: data.nextAction || '',
        followupDate: data.followupDate || '',
        followupMode: data.followupMode || '',
        followupStatus: data.followupStatus || 'Pending',
        followupCustomerResponse: data.followupCustomerResponse || '',
        followupRemarks: data.followupRemarks || '',
        handoverStatus: data.handoverStatus || 'Not Ready',
        handoverRemarks: data.handoverRemarks || ''
      });
      const hist = await marketingService.visitHistory(visitId);
      setVisitHistory(Array.isArray(hist?.data) ? hist.data : []);
    } catch (err) {
      toast.error(err?.message || 'Failed to load visit');
    } finally {
      setLoading(false);
    }
  }, [visitId, toast]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [visitId, load]);

  const run = async (operation, successMessage) => {
    setSaving(true);
    try {
      const res = await operation();
      const data = res?.data ?? res;
      setDetail(data);
      toast.success(successMessage);
      onChanged();
      return data;
    } catch (err) {
      toast.error(err?.message || 'Action failed');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const saveBasic = () =>
    run(
      () => marketingService.update(visitId, {
        scheduleDate: form.scheduleDate || null,
        companyName: form.companyName,
        location: form.location,
        appointmentStatus: form.appointmentStatus,
        appointmentDate: form.appointmentDate || null,
        appointmentTime: form.appointmentTime,
        contactPerson: form.contactPerson,
        designation: form.designation,
        phone: form.phone,
        email: form.email,
        appointmentRemarks: form.appointmentRemarks
      }),
      'Visit information saved'
    );

  const saveQForm = () =>
    run(
      () => marketingService.saveQForm(visitId, {
        qFormStatus: form.qFormStatus,
        qFormDetails: form.qFormDetails,
        qFormRemarks: form.qFormRemarks
      }),
      'Q Form saved'
    );

  const saveRequirement = () =>
    run(
      () => marketingService.saveRequirement(visitId, {
        requirement: form.requirement,
        productService: form.productService,
        quantity: form.quantity,
        technicalRequirement: form.technicalRequirement,
        expectedPurchaseTimeline: form.expectedPurchaseTimeline,
        budget: form.budget,
        requirementPriority: form.requirementPriority,
        technicalRemarks: form.technicalRemarks
      }),
      'Requirement saved'
    );

  const saveDiscussion = () =>
    run(
      () => marketingService.saveDiscussion(visitId, {
        visitDescription: form.visitDescription,
        discussion: form.discussion,
        customerResponse: form.customerResponse,
        customerFeedback: form.customerFeedback,
        technicalDiscussion: form.technicalDiscussion,
        remarks: form.remarks
      }),
      'Discussion saved'
    );

  const saveOutcome = () =>
    run(
      () => marketingService.setOutcome(visitId, { outcome: form.outcome, noLeadReason: form.noLeadReason }),
      'Outcome saved'
    );

  const quickAction = (visitStatus) =>
    run(() => marketingService.changeStatus(visitId, visitStatus), `Visit ${visitStatus.toLowerCase()}`);

  const recordEntry = () =>
    run(
      () =>
        marketingService.recordEntry(visitId, {
          meetingPerson: form.meetingPerson,
          meetingDesignation: form.meetingDesignation
        }),
      'Entry recorded'
    );

  const recordExit = () => run(() => marketingService.recordExit(visitId, {}), 'Exit recorded');

  const addFollowUp = () =>
    run(
      () =>
        marketingService.addFollowUp(visitId, {
          followupDate: form.followupDate || new Date().toISOString().slice(0, 10),
          mode: form.followupMode || 'Phone',
          status: form.followupStatus || 'Pending',
          nextAction: form.nextAction,
          customerResponse: form.followupCustomerResponse,
          remarks: form.followupRemarks
        }),
      'Follow-up added'
    );

  const completeFollowUp = () => {
    const latest = detail?.followUpHistory?.[0];
    if (!latest) {
      toast.error('No follow-up to complete');
      return;
    }
    run(
      () =>
        marketingService.updateFollowUp(visitId, latest.id, {
          followupDate: latest.followupDate,
          mode: latest.mode,
          status: 'Completed',
          nextAction: latest.nextAction,
          customerResponse: latest.customerResponse,
          remarks: latest.remarks
        }),
      'Follow-up completed'
    );
  };

  const rescheduleFollowUp = () => {
    if (!rescheduleDate) {
      toast.error('Choose a new follow-up date');
      return;
    }
    const latest = detail?.followUpHistory?.[0];
    run(
      () =>
        marketingService.updateFollowUp(visitId, latest.id, {
          followupDate: rescheduleDate,
          mode: latest.mode,
          status: 'Rescheduled',
          nextAction: latest.nextAction,
          customerResponse: latest.customerResponse,
          remarks: latest.remarks
        }),
      'Follow-up rescheduled'
    );
    setShowReschedule(false);
    setRescheduleDate('');
  };

  const createLead = () =>
    run(
      () =>
        marketingService.createLead(visitId, {
          leadName: leadForm.leadName || undefined,
          estimatedValue: leadForm.estimatedValue ? Number(leadForm.estimatedValue) : undefined,
          priority: leadForm.priority || undefined
        }),
      'Lead created from visit'
    ).then((data) => {
      if (data) setShowLeadForm(false);
    });

  const searchLeads = async (query) => {
    setLeadSearch(query);
    try {
      const res = await marketingService.listLeads({ search: query, size: 15 });
      const rows = Array.isArray(res) ? res : res?.content ?? [];
      setLeadOptions(rows);
    } catch {
      setLeadOptions([]);
    }
  };

  const linkLead = (leadId) =>
    run(() => marketingService.linkLead(visitId, leadId), 'Lead linked to visit').then(() => setShowLinkLead(false));

  const saveHandover = (handoverStatus) =>
    run(
      () =>
        marketingService.handover(visitId, {
          handoverStatus,
          handoverRemarks: form.handoverRemarks
        }),
      handoverStatus === 'Handed Over' ? 'Marked as handed over' : 'Marked ready for Sales'
    );

  if (!detail) {
    return (
      <Modal open={Boolean(visitId)} onClose={onClose} title="Visit Details" maxWidth="max-w-4xl">
        <div className="flex items-center justify-center py-16">
          <div className="inline-block h-7 w-7 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </Modal>
    );
  }

  const latestFollowUp = detail.followUpHistory?.[0];

  return (
    <Modal open={Boolean(visitId)} onClose={onClose} title={`Visit ${detail.visitNo}`} maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Header summary */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">{detail.companyName || detail.customerName || '—'}</div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              {[detail.marketer, detail.location, detail.contactPerson].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <StatusPill status={detail.visitStatus} />
            <StatusPill status={detail.appointmentStatus} />
            {detail.leadNo && <StatusPill status={detail.leadStage} />}
            <StatusPill status={detail.handoverStatus} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="inline-block h-7 w-7 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* A. Visit Information */}
            <SectionCard title="Visit Information" icon={CalendarDays}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                <FormField label="Schedule Date">
                  <TextInput type="date" value={form.scheduleDate} onChange={set('scheduleDate')} />
                </FormField>
                <FormField label="Company / Plant">
                  <TextInput value={form.companyName} onChange={set('companyName')} />
                </FormField>
                <FormField label="Location">
                  <TextInput value={form.location} onChange={set('location')} />
                </FormField>
                <FormField label="Appointment Status">
                  <SelectInput value={form.appointmentStatus} onChange={set('appointmentStatus')}>
                    {APPOINTMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Appointment Date">
                  <TextInput type="date" value={form.appointmentDate} onChange={set('appointmentDate')} />
                </FormField>
                <FormField label="Appointment Time">
                  <TextInput type="time" value={form.appointmentTime} onChange={set('appointmentTime')} />
                </FormField>
                <FormField label="Contact Person">
                  <TextInput value={form.contactPerson} onChange={set('contactPerson')} />
                </FormField>
                <FormField label="Designation">
                  <TextInput value={form.designation} onChange={set('designation')} />
                </FormField>
                <FormField label="Phone">
                  <TextInput value={form.phone} onChange={set('phone')} />
                </FormField>
                <FormField label="Email">
                  <TextInput type="email" value={form.email} onChange={set('email')} />
                </FormField>
                <div className="sm:col-span-2 lg:col-span-4">
                  <FormField label="Appointment Remarks">
                    <TextArea value={form.appointmentRemarks} onChange={set('appointmentRemarks')} rows={2} />
                  </FormField>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 mb-4">
                <ActionButton onClick={saveBasic} disabled={saving} variant="primary">
                  Save Visit Information
                </ActionButton>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
                <DetailField label="Visit ID" value={detail.visitNo} />
                <DetailField label="Marketer" value={detail.marketer} />
                <DetailField label="Customer" value={detail.customerName} />
                <DetailField label="Entry / Exit" value={`${fmtDateTime(detail.entryDateTime)} →’ ${fmtDateTime(detail.exitDateTime)}`} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {['Planned', 'Scheduled', 'In Progress'].includes(detail.visitStatus) && (
                  <ActionButton onClick={() => quickAction('In Progress')} disabled={saving}>
                    Start Visit
                  </ActionButton>
                )}
                {['Planned', 'Scheduled'].includes(detail.visitStatus) && (
                  <ActionButton onClick={recordEntry} disabled={saving}>
                    Record Entry
                  </ActionButton>
                )}
                {detail.visitStatus !== 'Completed' && detail.visitStatus !== 'Cancelled' && (
                  <>
                    <ActionButton onClick={recordExit} disabled={saving}>
                      Record Exit
                    </ActionButton>
                    <ActionButton onClick={() => quickAction('Completed')} disabled={saving} variant="primary">
                      Complete Visit
                    </ActionButton>
                    <ActionButton onClick={() => quickAction('Rescheduled')} disabled={saving}>
                      Reschedule
                    </ActionButton>
                    <ActionButton onClick={() => quickAction('Cancelled')} disabled={saving} variant="danger">
                      Cancel
                    </ActionButton>
                  </>
                )}
              </div>
            </SectionCard>

            {/* B. Actual Visit */}
            <SectionCard title="Actual Visit" icon={Clock}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                <DetailField label="Entry Date & Time" value={fmtDateTime(detail.entryDateTime)} />
                <DetailField label="Exit Date & Time" value={fmtDateTime(detail.exitDateTime)} />
                <DetailField label="Meeting Person" value={detail.meetingPerson} />
                <DetailField label="Designation" value={detail.meetingDesignation} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Meeting Person">
                  <TextInput value={form.meetingPerson} onChange={set('meetingPerson')} placeholder="Who was met" />
                </FormField>
                <FormField label="Designation">
                  <TextInput value={form.meetingDesignation} onChange={set('meetingDesignation')} placeholder="e.g. Purchase Manager" />
                </FormField>
              </div>
              {detail.visitStatus !== 'Completed' && detail.visitStatus !== 'Cancelled' && (
                <div className="mt-3 flex gap-2">
                  <ActionButton onClick={recordEntry} disabled={saving}>
                    Save Entry
                  </ActionButton>
                  <ActionButton onClick={recordExit} disabled={saving}>
                    Save Exit
                  </ActionButton>
                </div>
              )}
            </SectionCard>

            {/* C. Q Form & Requirement */}
            <SectionCard title="Q Form & Requirement" icon={ClipboardList}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Q Form Status">
                  <SelectInput value={form.qFormStatus} onChange={set('qFormStatus')}>
                    {QFORM_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Requirement Priority">
                  <SelectInput value={form.requirementPriority} onChange={set('requirementPriority')}>
                    <option value="">—</option>
                    {PRIORITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Q Form Details">
                    <TextArea value={form.qFormDetails} onChange={set('qFormDetails')} rows={3} />
                  </FormField>
                </div>
                <div className="sm:col-span-2">
                  <FormField label="Customer Requirement">
                    <TextArea value={form.requirement} onChange={set('requirement')} rows={3} />
                  </FormField>
                </div>
                <FormField label="Product / Service">
                  <TextInput value={form.productService} onChange={set('productService')} />
                </FormField>
                <FormField label="Quantity">
                  <TextInput value={form.quantity} onChange={set('quantity')} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Technical Requirement">
                    <TextArea value={form.technicalRequirement} onChange={set('technicalRequirement')} rows={2} />
                  </FormField>
                </div>
                <FormField label="Expected Purchase Timeline">
                  <TextInput value={form.expectedPurchaseTimeline} onChange={set('expectedPurchaseTimeline')} placeholder="e.g. Q4 2026" />
                </FormField>
                <FormField label="Budget (if applicable)">
                  <TextInput value={form.budget} onChange={set('budget')} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Technical Remarks">
                    <TextArea value={form.technicalRemarks} onChange={set('technicalRemarks')} rows={2} />
                  </FormField>
                </div>
              </div>
              <div className="mt-3 flex gap-2 flex-wrap">
                <ActionButton onClick={saveQForm} disabled={saving} variant="primary">
                  Save Q Form
                </ActionButton>
                <ActionButton onClick={saveRequirement} disabled={saving} variant="primary">
                  Save Requirement
                </ActionButton>
                <button
                  type="button"
                  onClick={() => onOpenQForm?.(visitId)}
                  className="inline-flex items-center gap-1.5 px-4 h-[34px] rounded-lg text-xs font-bold bg-[#0B4A3D] text-white hover:bg-[#083D34] transition-colors cursor-pointer"
                >
                  <ClipboardList size={13} /> Open Q Form
                </button>
              </div>
              {detail.qFormSubmittedAt && (
                <p className="mt-2 text-[11px] text-slate-400">Submitted {fmtDateTime(detail.qFormSubmittedAt)}</p>
              )}
            </SectionCard>

            {/* D. Discussion */}
            <SectionCard title="Discussion" icon={MessageSquare}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <FormField label="Visit Description">
                    <TextArea value={form.visitDescription} onChange={set('visitDescription')} rows={2} />
                  </FormField>
                </div>
                <div className="sm:col-span-2">
                  <FormField label="Discussion">
                    <TextArea value={form.discussion} onChange={set('discussion')} rows={3} />
                  </FormField>
                </div>
                <FormField label="Customer Response">
                  <TextArea value={form.customerResponse} onChange={set('customerResponse')} rows={2} />
                </FormField>
                <FormField label="Customer Feedback">
                  <TextArea value={form.customerFeedback} onChange={set('customerFeedback')} rows={2} />
                </FormField>
                <div className="sm:col-span-2">
                  <FormField label="Technical Discussion">
                    <TextArea value={form.technicalDiscussion} onChange={set('technicalDiscussion')} rows={2} />
                  </FormField>
                </div>
                <div className="sm:col-span-2">
                  <FormField label="Remarks">
                    <TextArea value={form.remarks} onChange={set('remarks')} rows={2} />
                  </FormField>
                </div>
              </div>
              <div className="mt-3">
                <ActionButton onClick={saveDiscussion} disabled={saving} variant="primary">
                  Save Discussion
                </ActionButton>
              </div>
            </SectionCard>

            {/* E. Lead */}
            <SectionCard
              title="Lead"
              icon={Target}
              action={
                detail.leadNo ? (
                  <span className="text-[11px] font-bold text-[#0B4A3D]">{detail.leadNo}</span>
                ) : undefined
              }
            >
              {detail.leadId ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <DetailField label="Lead Number" value={detail.leadNo} />
                    <DetailField label="Lead Status" value={detail.leadStatus} />
                    <DetailField label="Stage" value={detail.leadStage} />
                    <DetailField label="Priority" value={detail.leadPriority} />
                    <DetailField label="Estimated Value" value={fmtINR(detail.estimatedValue)} />
                    <DetailField label="Lead Source" value="Offline Marketing" />
                    <DetailField label="Created" value={fmtDateTime(detail.leadCreatedAt)} />
                  </div>
                  <p className="text-[11px] text-slate-400">
                    This visit is linked to a standalone Marketing Lead (source: Offline Marketing). The lead stays in this
                    module until future Sales integration is added.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {!showLeadForm && !showLinkLead && (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton onClick={() => setShowLeadForm(true)} disabled={saving} variant="primary">
                        Create Lead
                      </ActionButton>
                      <ActionButton onClick={() => { setShowLinkLead(true); searchLeads(''); }} disabled={saving}>
                        Link Existing Lead
                      </ActionButton>
                    </div>
                  )}
                  {showLeadForm && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <FormField label="Lead Name (optional)">
                          <TextInput value={leadForm.leadName} onChange={(e) => setLeadForm((p) => ({ ...p, leadName: e.target.value }))} />
                        </FormField>
                        <FormField label="Estimated Value">
                          <TextInput type="number" value={leadForm.estimatedValue} onChange={(e) => setLeadForm((p) => ({ ...p, estimatedValue: e.target.value }))} />
                        </FormField>
                        <FormField label="Priority">
                          <SelectInput value={leadForm.priority} onChange={(e) => setLeadForm((p) => ({ ...p, priority: e.target.value }))}>
                            {PRIORITIES.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </SelectInput>
                        </FormField>
                      </div>
                      <div className="flex gap-2">
                        <ActionButton onClick={createLead} disabled={saving} variant="primary">
                          Create Lead
                        </ActionButton>
                        <ActionButton onClick={() => setShowLeadForm(false)} disabled={saving}>
                          Cancel
                        </ActionButton>
                      </div>
                    </div>
                  )}
                  {showLinkLead && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3">
                      <FormField label="Search existing leads">
                        <TextInput
                          value={leadSearch}
                          onChange={(e) => searchLeads(e.target.value)}
                          placeholder="Company / contact / phone..."
                        />
                      </FormField>
                      {leadOptions.length > 0 ? (
                        <ul className="max-h-52 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg bg-white">
                          {leadOptions.map((lead) => (
                            <li key={lead.id}>
                              <button
                                type="button"
                                onClick={() => linkLead(lead.id)}
                                className="w-full text-left px-3 py-2 hover:bg-emerald-50/60 transition-colors cursor-pointer"
                              >
                                <span className="block text-xs font-bold text-slate-700">
                                  {lead.leadNo || `L-${String(lead.id).padStart(3, '0')}`} · {lead.companyName}
                                </span>
                                <span className="block text-[10px] text-slate-400">
                                  {[lead.contactPerson, lead.phone, lead.stage].filter(Boolean).join(' · ')}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[11px] text-slate-400">No leads match — create a new one instead.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>

            {/* F. Follow-up (current) */}
            <SectionCard title="Current Follow-up" icon={Phone}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-3">
                <DetailField label="Next Action" value={detail.nextAction} />
                <DetailField label="Follow-up Date" value={fmtDate(detail.followupDate)} />
                <DetailField label="Mode" value={detail.followupMode} />
                <DetailField label="Status" value={detail.followupStatus} />
                <DetailField label="Customer Response" value={detail.followupCustomerResponse} />
                <DetailField label="Remarks" value={detail.followupRemarks} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100">
                <FormField label="Next Action">
                  <TextInput value={form.nextAction} onChange={set('nextAction')} placeholder="e.g. Send quotation" />
                </FormField>
                <FormField label="Follow-up Date">
                  <TextInput type="date" value={form.followupDate} onChange={set('followupDate')} />
                </FormField>
                <FormField label="Follow-up Mode">
                  <SelectInput value={form.followupMode} onChange={set('followupMode')}>
                    {FOLLOWUP_MODES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Follow-up Status">
                  <SelectInput value={form.followupStatus} onChange={set('followupStatus')}>
                    {FOLLOWUP_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Customer Response">
                  <TextArea value={form.followupCustomerResponse} onChange={set('followupCustomerResponse')} rows={2} />
                </FormField>
                <FormField label="Remarks">
                  <TextArea value={form.followupRemarks} onChange={set('followupRemarks')} rows={2} />
                </FormField>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <ActionButton onClick={addFollowUp} disabled={saving} variant="primary">
                  Add Follow-up
                </ActionButton>
                {latestFollowUp && ['Pending', 'Overdue', 'Rescheduled'].includes(latestFollowUp.status) && (
                  <>
                    <ActionButton onClick={completeFollowUp} disabled={saving}>
                      Complete Follow-up
                    </ActionButton>
                    <ActionButton onClick={() => setShowReschedule((v) => !v)} disabled={saving}>
                      Reschedule
                    </ActionButton>
                  </>
                )}
              </div>

              {showReschedule && (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                  <FormField label="New Follow-up Date" className="flex-1 min-w-[160px]">
                    <TextInput type="date" value={rescheduleDate} onChange={(e) => setRescheduleDate(e.target.value)} />
                  </FormField>
                  <ActionButton onClick={rescheduleFollowUp} disabled={saving} variant="primary">
                    Save Reschedule
                  </ActionButton>
                </div>
              )}
            </SectionCard>

            {/* G. Follow-up History */}
            <SectionCard title="Follow-up History" icon={ListOrdered}>
              {detail.followUpHistory?.length ? (
                <ul className="space-y-2.5">
                  {detail.followUpHistory.map((fu) => (
                    <li key={fu.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-700">{fmtDate(fu.followupDate)}</span>
                          <span className="text-[10px] text-slate-400 font-semibold uppercase">{fu.mode}</span>
                          <StatusPill status={fu.status} />
                        </div>
                        <span className="text-[10px] text-slate-400">{fu.createdBy}</span>
                      </div>
                      {fu.nextAction && <p className="mt-1 text-xs text-slate-600">Next action: <span className="font-semibold">{fu.nextAction}</span></p>}
                      {fu.customerResponse && <p className="mt-0.5 text-[11px] text-slate-500">{fu.customerResponse}</p>}
                      {fu.remarks && <p className="mt-0.5 text-[11px] text-slate-400 italic">{fu.remarks}</p>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No follow-ups recorded yet.</p>
              )}
            </SectionCard>

            {/* H. Visit History */}
            <SectionCard title="Visit History" icon={HistoryIcon}>
              {visitHistory.length ? (
                <ul className="space-y-2.5">
                  {visitHistory.map((v) => (
                    <li key={v.id} className="rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-700">{v.visitNo}</span>
                          <span className="text-[10px] text-slate-400 font-semibold">{fmtDate(v.scheduleDate)}</span>
                          <StatusPill status={v.visitStatus} />
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {v.companyName || v.customerName}
                        {v.outcome ? ` — ${v.outcome}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-slate-400">No earlier visits for this lead/customer.</p>
              )}
            </SectionCard>

            {/* I. Outcome */}
            <SectionCard title="Outcome" icon={CheckCircle2}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Visit Outcome">
                  <SelectInput value={form.outcome} onChange={set('outcome')}>
                    <option value="">— Select Outcome —</option>
                    {OUTCOMES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                {form.outcome === 'No Lead' && (
                  <FormField label="Reason (required)">
                    <TextInput value={form.noLeadReason} onChange={set('noLeadReason')} placeholder="Why no lead?" />
                  </FormField>
                )}
              </div>
              <div className="mt-3">
                <ActionButton onClick={saveOutcome} disabled={saving} variant="primary">
                  Save Outcome
                </ActionButton>
              </div>
            </SectionCard>

            {/* J. Sales Handover */}
            <SectionCard title="Sales Handover" icon={Megaphone}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <DetailField label="Handover Status" value={detail.handoverStatus} />
                <DetailField label="Handed Over To" value={detail.handoverTo} />
                <DetailField label="Handover Date" value={fmtDateTime(detail.handoverAt)} />
                <DetailField label="Remarks" value={detail.handoverRemarks} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <FormField label="Handover Remarks">
                  <TextArea value={form.handoverRemarks} onChange={set('handoverRemarks')} rows={2} />
                </FormField>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {detail.handoverStatus !== 'Ready for Sales' && (
                  <ActionButton onClick={() => saveHandover('Ready for Sales')} disabled={saving} variant="primary">
                    Ready for Sales
                  </ActionButton>
                )}
                {detail.handoverStatus !== 'Handed Over' && (
                  <ActionButton onClick={() => saveHandover('Handed Over')} disabled={saving}>
                    Mark Handed Over
                  </ActionButton>
                )}
              </div>
              {!detail.leadId && (
                <p className="mt-2 text-[11px] text-amber-600 font-semibold">
                  Create or link a Marketing Lead first — handover marks the opportunity ready for a future Sales handover.
                </p>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </Modal>
  );
}

function ActionButton({ children, onClick, disabled, variant = 'default' }) {
  const styles = {
    default: 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200',
    primary: 'bg-[#0B4A3D] text-white hover:bg-[#083D34]',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200'
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1 px-3 h-[32px] rounded-lg text-[11px] font-bold transition-colors cursor-pointer disabled:opacity-50 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

const HistoryIcon = ListOrdered;

// ============================== Performance ==============================

function Metric({ label, value, tone = '' }) {
  // Numbers get thousands separators; pre-formatted strings ("33%", "₹1,00,000")
  // are shown as-is — Number() must not be applied to them (would render NaN).
  const display =
    value === null || value === undefined || value === ''
      ? '0'
      : typeof value === 'number'
        ? value.toLocaleString()
        : String(value);
  return (
    <div className="pr-kpi-card qtn-kpi-card" style={{ minHeight: 80, height: 'auto', padding: 14 }}>
      <div className="qtn-kpi-body">
        <div className={`qtn-kpi-count ${tone || ''}`} title={display}>{display}</div>
        <div className="qtn-kpi-label" title={label}>{label}</div>
      </div>
    </div>
  );
}

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' }
];

const fmtLocalDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function rangeForPreset(preset) {
  const now = new Date();
  if (preset === 'today') {
    const f = fmtLocalDate(now);
    return { from: f, to: f };
  }
  if (preset === 'week') {
    // Monday-start week.
    const start = new Date(now);
    start.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { from: fmtLocalDate(start), to: fmtLocalDate(end) };
  }
  if (preset === 'month') {
    return {
      from: fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 1)),
      to: fmtLocalDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
    };
  }
  // lastMonth
  return {
    from: fmtLocalDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
    to: fmtLocalDate(new Date(now.getFullYear(), now.getMonth(), 0))
  };
}

function PerformancePanel({ onClose }) {
  const toast = useToast();
  const [marketer, setMarketer] = useState('');
  const [preset, setPreset] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [marketerOptions, setMarketerOptions] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (marketer) params.marketer = marketer;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await marketingService.performance(params);
      const payload = res?.data ?? res;
      setData(payload);
      // Keep the marketer dropdown populated even while a filter is active.
      const names = (payload?.marketers || []).map((m) => m?.marketer).filter(Boolean);
      setMarketerOptions((prev) => [...new Set([...prev, ...names])].sort());
    } catch (err) {
      setError(err?.message || 'Failed to load performance data. Please try again.');
      setData(null);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [marketer, dateFrom, dateTo, toast]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const applyPreset = (key) => {
    const range = rangeForPreset(key);
    setPreset(key);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const clearRange = () => {
    setPreset('');
    setDateFrom('');
    setDateTo('');
  };

  const rows = data?.marketers || [];
  const outcomes = data?.outcomes ? Object.entries(data.outcomes).sort((a, b) => b[1] - a[1]) : [];
  const isEmpty =
    hasLoaded &&
    !loading &&
    !error &&
    (data?.totalVisits || 0) === 0 &&
    (data?.totalFollowups || 0) === 0 &&
    (data?.leadsGenerated || 0) === 0 &&
    rows.length === 0;

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50/70 border-b border-slate-100 rounded-t-xl">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800">
          <TrendingUp className="w-4 h-4 text-[#0B4A3D]" aria-hidden="true" />
          Marketing Performance
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          aria-label="Close performance"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4">
        {/* Date range presets + filters */}
        <div className="flex flex-wrap items-end gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => applyPreset(p.key)}
                className={`px-3 h-[32px] rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  preset === p.key
                    ? 'bg-[#0B4A3D] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {p.label}
              </button>
            ))}
            {preset && (
              <button
                type="button"
                onClick={clearRange}
                className="px-3 h-[32px] rounded-lg text-[11px] font-bold text-slate-500 hover:bg-slate-200 bg-slate-100 transition-colors cursor-pointer"
              >
                All Time
              </button>
            )}
          </div>
          <FormField label="Marketer" className="min-w-[180px]">
            <SelectInput value={marketer} onChange={(e) => setMarketer(e.target.value)}>
              <option value="">All Marketers</option>
              {marketerOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </SelectInput>
          </FormField>
          <FormField label="From">
            <TextInput type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </FormField>
          <FormField label="To">
            <TextInput type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </FormField>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="inline-block h-6 w-6 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
          </div>
        ) : isEmpty ? (
          <p className="text-xs text-slate-400 text-center py-16">No Marketing data available for the selected period.</p>
        ) : (
          <div className="space-y-5">
            {/* 1. Visit Performance */}
            <SectionCard title="Visit Performance" icon={CalendarDays}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <Metric label="Total Visits" value={data?.totalVisits} tone="text-[#0B4A3D]" />
                <Metric label="Today's Visits" value={data?.todayVisits} />
                <Metric label="Upcoming Visits" value={data?.upcomingVisits} />
                <Metric label="Pending Visits" value={data?.pendingVisits} />
                <Metric label="Completed Visits" value={data?.completedVisits} tone="text-emerald-600" />
                <Metric label="Cancelled Visits" value={data?.cancelledVisits} tone="text-rose-600" />
                <Metric label="Rescheduled Visits" value={data?.rescheduledVisits} />
                <Metric label="Direct Visits" value={data?.directVisits} />
                <Metric label="Fixed Appointments" value={data?.fixedAppointments} />
              </div>
            </SectionCard>

            {/* 2. Q Form Performance */}
            <SectionCard title="Q Form Performance" icon={ClipboardList}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <Metric label="Not Prepared" value={data?.qformsNotPrepared} />
                <Metric label="Filled & Submitted" value={data?.qformsSubmitted} tone="text-emerald-600" />
                <Metric label="Q Form Completion %" value={`${data?.qformCompletionPct || 0}%`} tone="text-[#0B4A3D]" />
              </div>
            </SectionCard>

            {/* 3. Lead Performance */}
            <SectionCard title="Lead Performance" icon={Target}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                <Metric label="Leads Generated" value={data?.leadsGenerated} tone="text-emerald-600" />
                <Metric label="Qualified Leads" value={data?.qualifiedLeads} tone="text-emerald-600" />
                <Metric label="Leads on Follow-up" value={data?.leadsOnFollowup} />
                <Metric label="No Lead Visits" value={data?.noLeadVisits} />
                <Metric label="Lost Leads" value={data?.lostLeads} tone="text-rose-600" />
                <Metric label="Pipeline Value" value={fmtINR(data?.estimatedPipelineValue)} tone="text-[#0B4A3D]" />
              </div>
            </SectionCard>

            {/* 4. Follow-up Performance */}
            <SectionCard title="Follow-up Performance" icon={Phone}>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <Metric label="Total Follow-ups" value={data?.totalFollowups} />
                <Metric label="Completed" value={data?.completedFollowups} tone="text-emerald-600" />
                <Metric label="Pending" value={data?.pendingFollowups} />
                <Metric label="Overdue" value={data?.overdueFollowups} tone="text-rose-600" />
                <Metric label="Rescheduled" value={data?.rescheduledFollowups} />
                <Metric label="Follow-up Completion %" value={`${data?.followupCompletionPct || 0}%`} tone="text-[#0B4A3D]" />
              </div>
            </SectionCard>

            {/* 5. Visit Outcome Performance */}
            <SectionCard title="Visit Outcome Performance" icon={MessageSquare}>
              {outcomes.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {outcomes.map(([outcome, count]) => (
                    <span
                      key={outcome}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                    >
                      <span className="font-bold text-slate-700">{outcome}</span>
                      <span className="font-bold text-[#0B4A3D]">{count}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">No visit outcomes recorded for the selected period.</p>
              )}
            </SectionCard>

            {/* 6. Marketer Performance */}
            <SectionCard title="Marketer Performance" icon={User}>
              {rows.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400">
                        {['Marketer', 'Total Visits', 'Completed', 'Q Forms Submitted', 'Leads Generated', 'Follow-ups', 'Overdue Follow-ups'].map((h) => (
                          <th key={h} className="px-3 py-2.5 font-bold whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row) => (
                        <tr key={row.marketer} className="hover:bg-emerald-50/40 transition-colors">
                          <td className="px-3 py-2.5 font-bold text-slate-700 whitespace-nowrap">{row.marketer}</td>
                          <td className="px-3 py-2.5">{row.totalVisits}</td>
                          <td className="px-3 py-2.5">{row.completedVisits}</td>
                          <td className="px-3 py-2.5">{row.qformsSubmitted}</td>
                          <td className="px-3 py-2.5 font-semibold text-emerald-700">{row.leadsGenerated}</td>
                          <td className="px-3 py-2.5">{row.followups}</td>
                          <td className="px-3 py-2.5 text-rose-600 font-semibold">{row.overdueFollowups}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-slate-400">No marketer data for the selected period.</p>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================== Page ==============================

export default function Marketing() {
  const toast = useToast();
  // Read the initial tab from URL query param (e.g. /marketing?tab=qforms)
  const getInitialView = () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab && ['qforms', 'travel-planner', 'expenses', 'map'].includes(tab)) return tab;
    } catch {}
    return '';
  };
  const [view, setView] = useState(getInitialView);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({});
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [visits, setVisits] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [showPerformance, setShowPerformance] = useState(false);
  const [qFormVisitId, setQFormVisitId] = useState(null);
  const [showNewQForm, setShowNewQForm] = useState(false);
  const [previewFormId, setPreviewFormId] = useState(null);
  const performanceRef = useRef(null);

  // Row selection (matching Sales checkbox pattern)
  const [selectedIds, setSelectedIds] = useState([]);
  const allPageSelected = visits.length > 0 && visits.every((row) => selectedIds.includes(row.id));
  const toggleSelectAll = () => {
    if (allPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visits.some((row) => row.id === id)));
    } else {
      const ids = new Set(selectedIds);
      visits.forEach((row) => ids.add(row.id));
      setSelectedIds([...ids]);
    }
  };

  // Sticky first column (Visit No)
  const headerRowRef = useRef(null);
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey: 'visitNo',
    visibleKeys: TABLE_COLUMNS.map((c) => c.key)
  });
  const stickyShadow = 'shadow-[1px_0_0_rgba(15,23,42,0.06)]';

  // The Performance panel renders below the table — scroll it into view so
  // clicking the button visibly opens it.
  useEffect(() => {
    if (showPerformance) {
      performanceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [showPerformance]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  const loadSummary = useCallback(async () => {
    try {
      const res = await marketingService.summary();
      setSummary(res?.data ?? res);
    } catch {
      // summary is best-effort
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(loadSummary, 0);
    return () => clearTimeout(timer);
  }, [loadSummary, refreshKey]);

  const listParams = useMemo(() => {
    const params = { page: page - 1, size: pageSize, search: search.trim() || undefined, view: view || undefined };
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') params[key] = value;
    });
    return params;
  }, [page, pageSize, search, view, filters]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const res = await marketingService.list(listParams, { signal: controller.signal });
        if (cancelled) return;
        const parsed = parsePageResponse(res);
        setVisits(parsed.list);
        setTotal(parsed.total);
      } catch (err) {
        if (cancelled) return;
        if (err?.message && err.message !== 'canceled') toast.error(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [listParams, refreshKey, toast]);

  // ---- Search autocomplete (real Marketing data via /marketing/search) ----
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  // Debounced (350 ms) server-side autocomplete; clearing the box restores the
  // normal table (existing filters stay applied).
  useEffect(() => {
    const term = search.trim();
    const timer = setTimeout(async () => {
      if (!term) {
        setSuggestions([]);
        setSuggestOpen(false);
        setSearchError(false);
        return;
      }
      setSearching(true);
      setSearchError(false);
      try {
        const res = await marketingService.search(term, 10);
        const list = Array.isArray(res?.data) ? res.data : [];
        setSuggestions(list);
        setHighlight(list.length > 0 ? 0 : -1);
        setSuggestOpen(true);
      } catch {
        setSuggestions([]);
        setSearchError(true);
        setSuggestOpen(true);
      } finally {
        setSearching(false);
      }
    }, term ? 350 : 0);
    return () => clearTimeout(timer);
  }, [search]);

  const selectSuggestion = (s) => {
    setSuggestOpen(false);
    if (s.type === 'visit') {
      // Open the existing record for editing — never create a new one.
      setDetailId(s.id);
    } else if (s.openVisitId) {
      setDetailId(s.openVisitId);
    } else {
      toast.info('This lead has no linked visit yet — create a visit to edit it.');
    }
  };

  const onSearchKeyDown = (e) => {
    if (!suggestOpen || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = suggestions[highlight] ?? suggestions[0];
      if (target) selectSuggestion(target);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestOpen(false);
    }
  };

  const marketers = useMemo(() => {
    const set = new Set();
    visits.forEach((v) => v.marketer && set.add(v.marketer));
    return Array.from(set).sort();
  }, [visits]);

  const setFilter = (key, value) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (value === '' || value == null) delete next[key];
      return next;
    });
    setPage(1);
  };

  const applyCard = (card) => {
    setFilters({});
    setView(card.view);
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleCreated = () => {
    refresh();
  };

  const handleChanged = () => {
    refresh();
  };

  return (
    <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
      <div className="max-w-[1400px] mx-auto">
        {/* Breadcrumb — matches .po-breadcrumb */}
        <div className="po-breadcrumb">
          <a onClick={() => window.location.href = '/dashboard'}>Dashboard</a>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <a onClick={() => {}}>Marketing</a>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <span className="current">Offline Marketing</span>
        </div>

        {/* Header — matches .po-page-header */}
        <div className="po-page-header">
          <h1>
            <Megaphone /> Offline Marketing
          </h1>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowPerformance((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#DCEAE5] px-4 h-[38px] rounded-[9px] transition-colors cursor-pointer"
            >
              <TrendingUp className="w-4 h-4" aria-hidden="true" />
              Performance
            </button>
            <button
              type="button"
              onClick={() => setNewModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 h-[38px] rounded-[9px] transition-colors shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              New Visit
            </button>
          </div>
        </div>

        {/* View tabs — matches .po-tabs */}
        <div className="po-tabs">
          <button
            type="button"
            onClick={() => { setView(''); setPage(1); }}              className={`po-tab${view === '' ? ' active' : ''}`}
          >
            All Visits
          </button>
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => { setView(v.key); setPage(1); }}
              className={`px-3.5 h-[34px] rounded-lg text-[12px] font-bold transition-colors cursor-pointer whitespace-nowrap ${
                view === v.key ? 'bg-[#0B4A3D] text-white shadow-sm' : 'bg-surface border border-slate-200 text-slate-500 hover:text-slate-700'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Summary cards */}
        {summary && (
          <SalesKpiCards
            cards={SUMMARY_CARDS.map((card) => ({
              ...card,
              value: Number(summary?.[card.key] || 0).toLocaleString()
            }))}
            activeKpi={SUMMARY_CARDS.find((c) => c.view === view)?.key || null}
            onSelect={(key) => {
              const card = SUMMARY_CARDS.find((c) => c.key === key);
              if (card) applyCard(card);
            }}
          />
        )}

        {/* Search + filters — matches .po-toolbar / .po-search-box */}
        <div className="crm-erp-toolbar" style={{ marginBottom: 16 }}>
          <div className="crm-erp-toolbar-left">
            <div className="po-search-box">
              <Search />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                onKeyDown={onSearchKeyDown}
                onBlur={() => setTimeout(() => setSuggestOpen(false), 150)}
                placeholder="Search Visit ID, Lead No, Company, Contact..."
              />

              {/* Autocomplete dropdown (existing Marketing records from the database) */}
              {suggestOpen && (
                <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg max-h-72 overflow-y-auto">
                  {searching ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400">Searching...</div>
                  ) : searchError ? (
                    <div className="px-3 py-2.5 text-xs font-semibold text-rose-600">Unable to search Marketing records.</div>
                  ) : suggestions.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-slate-400">No matching Marketing records found.</div>
                  ) : (
                    suggestions.map((s, i) => (
                      <button
                        key={`${s.type}-${s.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => selectSuggestion(s)}
                        onMouseEnter={() => setHighlight(i)}
                        className={`w-full text-left px-3 py-2 border-b border-slate-50 last:border-0 transition-colors cursor-pointer ${
                          i === highlight ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-slate-800 truncate">{s.companyName || '—'}</span>
                          <span
                            className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                              s.type === 'visit' ? 'bg-[#0B4A3D] text-white' : 'bg-indigo-100 text-indigo-700'
                            }`}
                          >
                            {s.type === 'visit' ? 'VISIT' : 'LEAD'}
                          </span>
                        </div>
                        <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                          {[s.visitNo, s.leadNo ? `Lead: ${s.leadNo}` : null, s.date, s.location]
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                        <div className="text-[10px] text-slate-400">{[s.contactPerson, s.phone].filter(Boolean).join(' · ') || '—'}</div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center justify-center gap-1.5 px-4 h-[36px] rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                showFilters ? 'bg-[#0B4A3D] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Filter className="w-3.5 h-3.5" aria-hidden="true" />
              Filters
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 mt-3 pt-3 border-t border-slate-100">
              <FormField label="Marketer">
                <SelectInput value={filters.marketer || ''} onChange={(e) => setFilter('marketer', e.target.value)}>
                  <option value="">All</option>
                  {marketers.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Date From">
                <TextInput type="date" value={filters.dateFrom || ''} onChange={(e) => setFilter('dateFrom', e.target.value)} />
              </FormField>
              <FormField label="Date To">
                <TextInput type="date" value={filters.dateTo || ''} onChange={(e) => setFilter('dateTo', e.target.value)} />
              </FormField>
              <FormField label="Appointment Status">
                <SelectInput value={filters.appointmentStatus || ''} onChange={(e) => setFilter('appointmentStatus', e.target.value)}>
                  <option value="">All</option>
                  {APPOINTMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Visit Status">
                <SelectInput value={filters.visitStatus || ''} onChange={(e) => setFilter('visitStatus', e.target.value)}>
                  <option value="">All</option>
                  {VISIT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Q Form Status">
                <SelectInput value={filters.qFormStatus || ''} onChange={(e) => setFilter('qFormStatus', e.target.value)}>
                  <option value="">All</option>
                  {QFORM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Lead Status">
                <SelectInput value={filters.leadStatus || ''} onChange={(e) => setFilter('leadStatus', e.target.value)}>
                  <option value="">All</option>
                  {['New', 'Contacted', 'Qualified', 'Proposal', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Priority">
                <SelectInput value={filters.priority || ''} onChange={(e) => setFilter('priority', e.target.value)}>
                  <option value="">All</option>
                  {PRIORITIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Follow-up Status">
                <SelectInput value={filters.followupStatus || ''} onChange={(e) => setFilter('followupStatus', e.target.value)}>
                  <option value="">All</option>
                  {FOLLOWUP_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Outcome">
                <SelectInput value={filters.outcome || ''} onChange={(e) => setFilter('outcome', e.target.value)}>
                  <option value="">All</option>
                  {OUTCOMES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Location">
                <TextInput value={filters.location || ''} onChange={(e) => setFilter('location', e.target.value)} placeholder="City / plant" />
              </FormField>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => { setFilters({}); setView(''); setSearch(''); setPage(1); }}
                  className="px-3 h-[36px] rounded-lg text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Table — Q Forms or Travel Planner view when those tabs are active */}
        {view === 'qforms' ? (
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4">
            <QFormList onOpenForm={(visitId) => setQFormVisitId(visitId)} onNewForm={() => setShowNewQForm(true)} />
          </div>
        ) : view === 'travel-planner' ? (
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4">
            <TravelPlanner />
          </div>
        ) : view === 'expenses' ? (
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4">
            <MarketingExpenses />
          </div>
        ) : view === 'map' ? (
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <MarketingMapPage />
          </div>
        ) : (
        <div className="po-table-card">
          <div className="po-table-wrap">
            <table className="po-table" style={{ minWidth: 1200 }}>
              <thead>
                <tr ref={headerRowRef}>
                  <th className="checkbox-cell sticky left-0 z-[3] bg-[var(--purchase-card)]" style={{ width: 50 }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  {TABLE_COLUMNS.map((col, idx) => (
                    <th
                      key={col.key}
                      data-sticky-key={col.key}
                      className={idx === 0 ? 'sticky z-[3] bg-[var(--purchase-card)]' : ''}
                      style={idx === 0 ? { left: stickyLeft } : undefined}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visits.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setDetailId(row.id)}
                    className={`${selectedIds.includes(row.id) ? 'is-selected' : ''} cursor-pointer group`}
                  >
                    <td className="checkbox-cell sticky left-0 z-[2] bg-[var(--purchase-card)] group-hover:bg-[#F0FAF7] shadow-[1px_0_0_rgba(15,23,42,0.06)]">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={() =>
                          setSelectedIds((prev) =>
                            prev.includes(row.id) ? prev.filter((id) => id !== row.id) : [...prev, row.id]
                          )
                        }
                        aria-label={`Select ${row.visitNo}`}
                      />
                    </td>
                    <td
                      className="px-3 py-2.5 font-bold text-[#0B4A3D] whitespace-nowrap sticky z-[2] bg-[var(--purchase-card)] group-hover:bg-[#F8FAFC]"
                      style={{ left: stickyLeft }}
                    >
                      <a
                        href={`/marketing/visits/${row.id}/edit`}
                        
                        
                        className="text-[#0B4A3D] hover:underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.visitNo}
                      </a>
                    </td>
                    <td className="px-3 py-2.5 cell-date">{fmtDate(row.scheduleDate)}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-700" style={{ overflowWrap: 'anywhere' }} title={row.companyName || row.customerName || ''}>{row.companyName || row.customerName || '—'}</div>
                      {row.location && <div className="text-[10px] text-slate-400" style={{ overflowWrap: 'anywhere' }} title={row.location}>{row.location}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-600" style={{ overflowWrap: 'anywhere' }} title={row.contactPerson || ''}>{row.contactPerson || '—'}</div>
                      {row.phone && <div className="text-[10px] text-slate-400">{row.phone}</div>}
                    </td>
                    <td className="px-3 py-2.5"><StatusPill status={row.appointmentStatus} /></td>
                    <td className="px-3 py-2.5"><StatusPill status={row.visitStatus} /></td>
                    <td className="px-3 py-2.5"><StatusPill status={row.qFormStatus} /></td>
                    <td className="px-3 py-2.5 cell-id">
                      {row.leadNo ? (
                        <a
                          href={`/leads/${row.leadId || row.id}`}
                          className="font-bold text-violet-700 hover:underline cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.leadNo}
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {row.requirementPriority ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white ${
                          row.requirementPriority === 'High' || row.requirementPriority === 'Urgent'
                            ? 'bg-rose-500'
                            : row.requirementPriority === 'Medium'
                              ? 'bg-amber-500'
                              : 'bg-slate-400'
                        }`}>
                          {row.requirementPriority}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5" style={{ overflowWrap: 'anywhere' }} title={row.nextAction || ''}>{row.nextAction || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5 cell-date">{fmtDate(row.followupDate)}</td>
                    <td className="px-3 py-2.5"><StatusPill status={row.followupStatus} /></td>
                    <td className="px-3 py-2.5" style={{ overflowWrap: 'anywhere' }} title={row.outcome || ''}>{row.outcome || <span className="text-slate-300">—</span>}</td>
                    <td className="px-3 py-2.5"><StatusPill status={row.handoverStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!loading && visits.length === 0 && (
            <div className="py-14 text-center">
              <div className="h-14 w-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mx-auto mb-3">
                <CalendarDays className="w-6 h-6 text-slate-300" aria-hidden="true" />
              </div>
              <p className="text-sm font-bold text-slate-600">No visits found</p>
              <p className="text-xs text-slate-400 mt-1">Try adjusting the filters, or create a new visit.</p>
            </div>
          )}

          {loading && (
            <div className="flex justify-center py-14">
              <div className="inline-block h-7 w-7 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
            </div>
          )}

          {/* Pagination — matches .crm-erp-pagination */}
          <div className="crm-erp-pagination">
            <div className="crm-erp-pagination-controls">
              <span>
                {total.toLocaleString()} visit{total === 1 ? '' : 's'}
              </span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="crm-erp-page-size"
                aria-label="Page size"
              >
                {[10, 25, 50, 100].map((s) => (
                  <option key={s} value={s}>
                    {s} / page
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-default"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="crm-erp-page-btn active">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="crm-erp-page-btn"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Performance panel */}
        <div ref={performanceRef}>
          {showPerformance && <PerformancePanel onClose={() => setShowPerformance(false)} />}
        </div>
      </div>

      <NewVisitModal open={newModalOpen} onClose={() => setNewModalOpen(false)} onCreated={handleCreated} />
      <VisitDetailModal
        visitId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={handleChanged}
        // "Open Q Form" in the visit detail opens this visit's existing
        // Questionnaire Form modal (owned by this page).
        onOpenQForm={(id) => { setDetailId(null); setQFormVisitId(id); }}
      />
      {qFormVisitId && !previewFormId && (
        <Modal open={true} onClose={() => { setQFormVisitId(null); setPreviewFormId(null); }} title="Questionnaire Form" maxWidth="max-w-5xl">
          <QuestionnaireForm visitId={qFormVisitId} onClose={() => { setQFormVisitId(null); setPreviewFormId(null); }}
            onSaveAndContinue={(fid) => { setPreviewFormId(fid); }} />
        </Modal>
      )}
      {showNewQForm && !previewFormId && (
        <Modal open={true} onClose={() => { setShowNewQForm(false); setPreviewFormId(null); }} title="New Questionnaire Form" maxWidth="max-w-5xl">
          <QuestionnaireForm visitId={null} onClose={() => { setShowNewQForm(false); setPreviewFormId(null); }}
            onSaveAndContinue={(fid) => { setPreviewFormId(fid); }} />
        </Modal>
      )}
      {previewFormId && (
        <Modal open={true} onClose={() => setPreviewFormId(null)} title="Q Form Preview" maxWidth="max-w-5xl">
          <QFormPreview formId={previewFormId} onClose={() => setPreviewFormId(null)} />
        </Modal>
      )}
    </div>
  );
}
