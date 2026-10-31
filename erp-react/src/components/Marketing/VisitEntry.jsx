import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Save, ArrowLeft, CalendarDays, Clock, MapPin, Users, Building2,
  Phone, Mail, CheckCircle2, Edit3,
  Trash2, Upload, Camera
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast, FormField, TextInput, TextArea, SelectInput } from '../Common';
import { useFormDraft } from '../../hooks/useFormDraft';
import marketingService from '../../services/marketingService';
import marketingSettingsService from '../../services/marketingSettingsService';
import './marketing-form-actions.css';

// ============================== Constants ==============================
// These are fallbacks; the real values come from Marketing Settings (visitSettings / followupSettings)

// ============================== State ==============================
// Fallback status lists. This must be a plain constant — calling useState at
// module scope is an invalid hook call that throws on import and made the whole
// Visit Entry page render an error boundary. The component seeds its state from
// this constant instead.
const DEFAULT_DYNAMIC_STATUSES = {
  appointmentStatuses: ['Fixed', 'Direct Visit', 'Rescheduled', 'Cancelled', 'Completed'],
  visitStatuses: ['Planned', 'In Progress', 'Completed', 'Cancelled'],
  outcomes: [
    'Lead Generated', 'Existing Customer Opportunity', 'Existing Opportunity',
    'Existing Order', 'Follow-up Required', 'Need Further Discussion',
    'Not Interested', 'No Lead', 'Lost Opportunity', 'Lost', 'Other'
  ],
  followupModes: ['Visit', 'Phone', 'WhatsApp', 'Email', 'Online Meeting', 'Other']
};

// ============================== Section Component ==============================

function Section({ title, icon: Icon, number, children, collapsed, onToggle, badge }) {
  return (
    <div className="ve-section">
      <button type="button" className="ve-section-header" onClick={onToggle}>
        <div className="ve-section-title-row">
          <span className="ve-section-num">{number}</span>
          {Icon && <Icon size={15} className="text-[#0B4A3D]" />}
          <span className="ve-section-title">{title}</span>
          {badge != null && badge !== undefined && (
            <span className="ve-section-badge">{badge}</span>
          )}
        </div>
        <span className={`ve-section-chevron${collapsed ? ' collapsed' : ''}`}>▼</span>
      </button>
      {!collapsed && <div className="ve-section-body">{children}</div>}
    </div>
  );
}

// ============================== Change History Card ==============================

function ChangeHistorySection({ history }) {
  if (!history || history.length === 0) return null;

  // Group changes by date + changeType
  const groups = [];
  let currentGroup = null;
  for (const ch of history) {
    const dateStr = ch.changedAt ? new Date(ch.changedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    const groupKey = `${dateStr}_${ch.changeType}`;
    if (!currentGroup || currentGroup.key !== groupKey) {
      currentGroup = { key: groupKey, date: dateStr, type: ch.changeType, changedBy: ch.changedBy, changes: [] };
      groups.push(currentGroup);
    }
    currentGroup.changes.push(ch);
  }

  return (
    <div className="ve-change-history">
      {groups.map((g, gi) => (
        <div key={gi} className="ve-change-group">
          <div className="ve-change-group-header">
            <span className={`ve-change-type-badge ${g.type === 'RESCHEDULE' ? 'reschedule' : 'edit'}`}>
              {g.type === 'RESCHEDULE' ? '📅 Rescheduled' : '✏️ Edited'}
            </span>
            <span className="ve-change-date">{g.date}</span>
            {g.changedBy && <span className="ve-change-by">by {g.changedBy}</span>}
          </div>
          <div className="ve-change-items">
            {g.changes.map((ch, ci) => (
              <div key={ci} className="ve-change-item">
                <span className="ve-change-field">{ch.fieldName}</span>
                <span className="ve-change-old">{ch.oldValue || '—'}</span>
                <span className="ve-change-arrow">→’</span>
                <span className="ve-change-new">{ch.newValue || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================== Main Component ==============================

export default function VisitEntry() {
  const toast = useToast();
  const navigate = useNavigate();
  const { id: visitIdParam } = useParams();
  const isNew = !visitIdParam || visitIdParam === 'new';

  const [dynamicStatuses, setDynamicStatuses] = useState(DEFAULT_DYNAMIC_STATUSES);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [visitId, setVisitId] = useState(visitIdParam ? Number(visitIdParam) : null);

  // Section collapse states
  const [collapsed, setCollapsed] = useState({});

  // ---- Linked data ----
  const [changeHistory, setChangeHistory] = useState([]);
  const [loadingLinked, setLoadingLinked] = useState(false);

  // ---- Visit Data ----
  const [form, setForm] = useState({
    scheduleDate: new Date().toISOString().slice(0, 10),
    companyName: '',
    location: '',
    address: '',
    latitude: '',
    longitude: '',
    appointmentStatus: 'Fixed',
    appointmentDate: '',
    appointmentTime: '',
    marketingUser: '',
    leadNo: '',
    meetingPerson: '',
    designation: '',
    phone: '',
    email: '',
    entryTime: '',
    exitTime: '',
    visitStatus: 'Planned',
    visitDescription: '',
    // Visit Summary
    outcome: '',
    discussion: '',
    customerRequirement: '',
    technicalDiscussion: '',
    customerFeedback: '',
    nextAction: '',
    followupDate: '',
    followupRemarks: '',
    followupMode: '',
  });

  // ---- form draft persistence (new visits only) ----
  const draftRestoredRef = useRef(false);
  const isEdit = !isNew;
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    'marketing-visits', visitIdParam || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );

  const set = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }));

  // ---- restore unsaved draft from localStorage (new visits only) ----
  useEffect(() => {
    if (isEdit || draftRestoredRef.current) return;
    const draft = restoreDraft();
    if (draft && draft.form) {
      setForm(prev => ({ ...prev, ...draft.form }));
    }
    draftRestoredRef.current = true;
  }, [isEdit, restoreDraft]);

  // ---- persist draft to localStorage (new visits only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    if (!form.companyName && !form.location) return;
    persistDraft({ form });
  }, [form, isEdit, persistDraft]);

  // ---- Load linked data (Q Form, Expenses, Follow-ups) ----
  const loadLinkedData = useCallback(async (vid) => {
    if (!vid) return;
    setLoadingLinked(true);
    try {
      // Load change history for this visit
      try {
        const chRes = await marketingService.changeHistory(vid);
        const chData = chRes?.data ?? chRes;
        setChangeHistory(Array.isArray(chData) ? chData : []);
      } catch {
        setChangeHistory([]);
      }
    } finally {
      setLoadingLinked(false);
    }
  }, []);

  // ---- Load dynamic statuses from Marketing Settings ----
  useEffect(() => {
    let cancelled = false;
    marketingSettingsService.getSettings().then((s) => {
      if (cancelled) return;
      const vs = s?.visitSettings || {};
      const fs = s?.followupSettings || {};
      setDynamicStatuses({
        appointmentStatuses: vs.appointmentStatuses?.map((x) => x.name) || ['Fixed', 'Direct Visit', 'Rescheduled', 'Cancelled', 'Completed'],
        visitStatuses: vs.visitStatuses?.map((x) => x.name) || ['Planned', 'In Progress', 'Completed', 'Cancelled'],
        outcomes: vs.outcomes?.map((x) => x.name) || [
          'Lead Generated', 'Existing Customer Opportunity', 'Existing Opportunity',
          'Existing Order', 'Follow-up Required', 'Need Further Discussion',
          'Not Interested', 'No Lead', 'Lost Opportunity', 'Lost', 'Other'
        ],
        followupModes: fs.followupTypes?.map((x) => x.name) || ['Visit', 'Phone', 'WhatsApp', 'Email', 'Online Meeting', 'Other']
      });
    }).catch(() => { /* keep fallbacks */ });
    return () => { cancelled = true; };
  }, []);

  // Load existing visit
  useEffect(() => {
    if (!visitId) return;
    setLoading(true);
    marketingService.get(visitId)
      .then(res => {
        const data = res?.data ?? res;
        setForm(prev => ({
          ...prev,
          scheduleDate: data.scheduleDate || prev.scheduleDate,
          companyName: data.companyName || '',
          location: data.location || '',
          address: data.address || '',
          latitude: data.latitude || '',
          longitude: data.longitude || '',
          appointmentStatus: data.appointmentStatus || 'Fixed',
          appointmentDate: data.appointmentDate || '',
          appointmentTime: data.appointmentTime || '',
          marketingUser: data.marketer || '',
          leadNo: data.leadNo || '',
          meetingPerson: data.meetingPerson || data.contactPerson || '',
          designation: data.meetingDesignation || data.designation || '',
          phone: data.phone || '',
          email: data.email || '',
          entryTime: data.entryDateTime || '',
          exitTime: data.exitDateTime || '',
          visitStatus: data.visitStatus || 'Planned',
          visitDescription: data.visitDescription || '',
          outcome: data.outcome || '',
          discussion: data.discussion || '',
          customerRequirement: data.requirement || '',
          technicalDiscussion: data.technicalDiscussion || '',
          customerFeedback: data.customerFeedback || '',
          nextAction: data.nextAction || '',
          followupDate: data.followupDate || '',
          followupRemarks: data.followupRemarks || '',
          followupMode: data.followupMode || '',
        }));
        // Load linked data after visit loads
        loadLinkedData(data.id);
      })
      .catch(err => toast.error(err?.message || 'Failed to load visit'))
      .finally(() => setLoading(false));
  }, [visitId, toast, loadLinkedData]);

  // Save visit
  const handleSave = async (statusAction) => {
    if (!form.companyName.trim()) { toast.error('Company / Plant name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        companyName: form.companyName,
        scheduleDate: form.scheduleDate || null,
        location: form.location,
        address: form.address,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        appointmentStatus: form.appointmentStatus,
        appointmentDate: form.appointmentDate || null,
        appointmentTime: form.appointmentTime,
        marketer: form.marketingUser,
        contactPerson: form.meetingPerson,
        designation: form.designation,
        phone: form.phone,
        email: form.email,
        meetingPerson: form.meetingPerson,
        meetingDesignation: form.designation,
        entryDateTime: form.entryTime || null,
        exitDateTime: form.exitTime || null,
        visitStatus: statusAction || form.visitStatus,
        visitDescription: form.visitDescription,
        outcome: form.outcome,
        discussion: form.discussion,
        requirement: form.customerRequirement,
        technicalDiscussion: form.technicalDiscussion,
        customerFeedback: form.customerFeedback,
        nextAction: form.nextAction,
        followupDate: form.followupDate || null,
        followupRemarks: form.followupRemarks,
        leadNo: form.leadNo,
      };

      let saved;
      if (visitId) {
        saved = await marketingService.update(visitId, payload);
      } else {
        saved = await marketingService.create(payload);
        const data = saved?.data ?? saved;
        if (data?.id) {
          setVisitId(data.id);
          navigate(`/marketing/visits/${data.id}/edit`, { replace: true });
        }
      }
      // Clear localStorage draft after successful save
      clearFormDraft();
      toast.success(visitId ? 'Visit updated' : 'Visit created');
    } catch (err) {
      toast.error(err?.message || 'Failed to save visit');
    } finally {
      setSaving(false);
    }
  };

  const toggleSection = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  if (loading) {
    return (
      <div className="ve-root">
        <div className="ve-loading"><div className="ve-spinner" /></div>
      </div>
    );
  }

  return (
    <div className="ve-root">
      {/* Header */}
      <div className="ve-header">
        <div className="ve-header-left">
          <button type="button" onClick={() => navigate('/marketing')} className="ve-back">
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="ve-title">
              {isNew ? 'New Marketing Visit' : `Visit ${form.companyName || ''}`}
            </h1>
            <p className="ve-subtitle">
              {isNew ? 'Create a new marketing visit record' : (
                <>Edit / Reschedule — all changes propagate to Calendar, Map, Q Forms, Visit Summary & Expenses</>
              )}
            </p>
          </div>
        </div>
        <div className="ve-header-actions mkt-action-scope">
          <button type="button" onClick={() => handleSave()} disabled={saving} className="erp-create-btn">
            <Save size={14} /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button type="button" onClick={() => handleSave('Completed')} disabled={saving} className="erp-create-btn">
            <CheckCircle2 size={14} /> Save & Complete
          </button>
        </div>
      </div>

      {/* Sections */}
      <div className="ve-sections">
        {/* A. Visit / Plan Information — MASTER COMMON FIELDS */}
        <Section title="Visit / Plan Information" icon={CalendarDays} number="A"
          collapsed={collapsed.plan} onToggle={() => toggleSection('plan')}>
          <div className="ve-grid">
            <FormField label="Schedule Date" required>
              <TextInput type="date" value={form.scheduleDate} onChange={set('scheduleDate')} />
            </FormField>
            <FormField label="Company / Plant" required>
              <TextInput value={form.companyName} onChange={set('companyName')} placeholder="e.g. India Cements" />
            </FormField>
            <FormField label="Location">
              <TextInput value={form.location} onChange={set('location')} placeholder="City / plant location" />
            </FormField>
            <FormField label="Address">
              <TextInput value={form.address} onChange={set('address')} placeholder="Full address" />
            </FormField>
            <FormField label="Appointment Status">
              <SelectInput value={form.appointmentStatus} onChange={set('appointmentStatus')}>
                {dynamicStatuses.appointmentStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            </FormField>
            <FormField label="Marketing User">
              <TextInput value={form.marketingUser} onChange={set('marketingUser')} placeholder="Marketer name" />
            </FormField>
            <FormField label="Meeting Person">
              <TextInput value={form.meetingPerson} onChange={set('meetingPerson')} placeholder="Contact person" />
            </FormField>
            <FormField label="Designation">
              <TextInput value={form.designation} onChange={set('designation')} placeholder="e.g. Purchase Manager" />
            </FormField>
            <FormField label="Phone">
              <TextInput value={form.phone} onChange={set('phone')} />
            </FormField>
            <FormField label="Email">
              <TextInput type="email" value={form.email} onChange={set('email')} />
            </FormField>
            <FormField label="Lead Number">
              <TextInput value={form.leadNo} onChange={set('leadNo')} placeholder="Lead reference" />
            </FormField>
            <FormField label="Latitude">
              <TextInput value={form.latitude} onChange={set('latitude')} placeholder="e.g. 13.0827" />
            </FormField>
            <FormField label="Longitude">
              <TextInput value={form.longitude} onChange={set('longitude')} placeholder="e.g. 80.2707" />
            </FormField>
          </div>
        </Section>

        {/* B. Visit Execution */}
        <Section title="Visit Execution" icon={Clock} number="B"
          collapsed={collapsed.execution} onToggle={() => toggleSection('execution')}>
          <div className="ve-grid">
            <FormField label="Visit Status">
              <SelectInput value={form.visitStatus} onChange={set('visitStatus')}>
                {dynamicStatuses.visitStatuses.map(s => <option key={s} value={s}>{s}</option>)}
              </SelectInput>
            </FormField>
            <FormField label="Entry Time">
              <TextInput type="datetime-local" value={form.entryTime} onChange={set('entryTime')} />
            </FormField>
            <FormField label="Exit Time">
              <TextInput type="datetime-local" value={form.exitTime} onChange={set('exitTime')} />
            </FormField>
            <div className="ve-full">
              <FormField label="Visit Description">
                <TextArea value={form.visitDescription} onChange={set('visitDescription')} rows={3}
                  placeholder="Describe the visit purpose and activities..." />
              </FormField>
            </div>
          </div>
        </Section>

        {/* D. Visit Summary — Linked to this Visit */}
        <Section title="Visit Summary" icon={Users} number="D"
          collapsed={collapsed.summary} onToggle={() => toggleSection('summary')}
          badge={form.outcome || undefined}>
          <div className="ve-grid">
            <FormField label="Outcome">
              <SelectInput value={form.outcome} onChange={set('outcome')}>
                <option value="">— Select —</option>
                {dynamicStatuses.outcomes.map(o => <option key={o} value={o}>{o}</option>)}
              </SelectInput>
            </FormField>
            <FormField label="Next Action">
              <TextInput value={form.nextAction} onChange={set('nextAction')} placeholder="e.g. Send quotation" />
            </FormField>
            <FormField label="Follow-up Date">
              <TextInput type="date" value={form.followupDate} onChange={set('followupDate')} />
            </FormField>
            <FormField label="Follow-up Mode">
              <SelectInput value={form.followupMode} onChange={set('followupMode')}>
                <option value="">— Select —</option>
                {dynamicStatuses.followupModes.map(m => <option key={m} value={m}>{m}</option>)}
              </SelectInput>
            </FormField>
            <div className="ve-full">
              <FormField label="Discussion">
                <TextArea value={form.discussion} onChange={set('discussion')} rows={3}
                  placeholder="Meeting discussion points..." />
              </FormField>
            </div>
            <div className="ve-full">
              <FormField label="Customer Requirement">
                <TextArea value={form.customerRequirement} onChange={set('customerRequirement')} rows={2} />
              </FormField>
            </div>
            <div className="ve-full">
              <FormField label="Technical Discussion">
                <TextArea value={form.technicalDiscussion} onChange={set('technicalDiscussion')} rows={2} />
              </FormField>
            </div>
            <div className="ve-full">
              <FormField label="Customer Feedback">
                <TextArea value={form.customerFeedback} onChange={set('customerFeedback')} rows={2} />
              </FormField>
            </div>
            <div className="ve-full">
              <FormField label="Follow-up Remarks">
                <TextArea value={form.followupRemarks} onChange={set('followupRemarks')} rows={2} />
              </FormField>
            </div>
          </div>


        </Section>

        {/* G. Change History — Previous edits/reschedules */}
        {!isNew && changeHistory.length > 0 && (
          <Section title="Change History" icon={Clock} number="G"
            collapsed={collapsed.history} onToggle={() => toggleSection('history')}
            badge={`${changeHistory.length} changes`}>
            <ChangeHistorySection history={changeHistory} />
          </Section>
        )}
      </div>
    </div>
  );
}
