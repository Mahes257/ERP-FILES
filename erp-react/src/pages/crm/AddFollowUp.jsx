import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useToast, Accordion, FormField, TextInput, SelectInput, TextArea, ManagedSelect, CreationActionBar } from '../../components/Common';
import leadService from '../../services/leadService';
import customerService from '../../services/customerService';
import followUpService from '../../services/followUpService';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import { useFormDraft } from '../../hooks/useFormDraft';
import {
  User,
  Calendar,
  MessageSquare,
  Forward,
  Info,
  Paperclip,
  Upload,
  X,
  Loader2,
  ChevronLeft,
} from 'lucide-react';
import { getEnabledOptions } from '../../utils/dropdownManager';
// The lead's document number is the CRM-wide LEAD-000000 format; the list API
// returns only the numeric id, so it must be formatted like every other CRM
// surface (otherwise this sidebar showed a bare "103").
import { formatLeadNo } from '../../utils/leadHelpers';
import { MAX_ATTACHMENT_SIZE_LABEL, getAttachmentSelectionError } from '../../utils/attachmentStorage';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{7,}$/;
// Follow-up option lists are managed from the frontend (dropdownManager — the
// base lists mirror ERP followup-create.html exactly).

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

const EMPTY_FORM = {
  leadId: '',
  clientId: '',
  customer: '',
  contactPerson: '',
  phone: '',
  email: '',
  leadStatus: '',
  source: '',
  industry: '',
  executive: '',
  address: '',
  followupDate: new Date().toISOString().slice(0, 10),
  time: '',
  mode: '',
  priority: 'Medium',
  currentStatus: '',
  outcome: '',
  discussionSummary: '',
  customerFeedback: '',
  requirement: '',
  nextFollowupDate: '',
  assignTo: 'Self',
  reminder: '',
  reminderType: ''
};

export default function AddFollowUp() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  // Lead actions menu deep-link: ?leadId=<id> (&mode=Call for “Log Call—)
  const [searchParams] = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const prefillMode = searchParams.get('mode');
  const prefillClientId = searchParams.get('clientId');

  const [leads, setLeads] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!editingId);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({ moduleKey: 'followup', setForm, enabled: !editingId });
  // ---- form draft persistence (new follow-ups only) ----
  const isEdit = !!editingId;
  const draftRestoredRef = useRef(false);
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    'followups', editingId || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  // ---- restore unsaved draft from localStorage (new follow-ups only) ----
  useEffect(() => {
    if (isEdit || draftRestoredRef.current) return;
    const draft = restoreDraft();
    if (draft && draft.form) {
      setForm(prev => ({ ...prev, ...draft.form }));
    }
    draftRestoredRef.current = true;
  }, [isEdit, restoreDraft]);

  // ---- persist draft to localStorage (new follow-ups only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    if (!form.leadId && !form.followUpType) return;
    persistDraft({ form });
  }, [form, isEdit, persistDraft]);

  useEffect(() => {
    let cancelled = false;
    leadService
      .listLeads({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const rows = Array.isArray(res)
          ? res
          : res?.content || res?.data?.content || res?.data?.rows || [];
        setLeads(rows);
        // Deep-linked from the Lead actions menu: pre-select the lead and
        // auto-populate the ERP Lead Information section (readonly fields).
        // Never applied in edit mode (edit URLs carry no leadId param).
        if (prefillLeadId && !editingId) {
          const lead = rows.find((l) => String(l.id) === String(prefillLeadId));
          if (lead) {
            setForm((prev) => ({
              ...prev,
              leadId: String(lead.id),
              customer: lead.businessName || lead.company || lead.name || '',
              contactPerson: lead.name || lead.contactPerson || '',
              phone: lead.phone || lead.mobile || '',
              email: lead.email || '',
              leadStatus: lead.status || lead.stage || '',
              source: lead.source || lead.leadSource || '',
              industry: lead.industry || '',
              executive: lead.owner || lead.assignedTo || '',
              address: lead.address || '',
              ...(prefillMode && getEnabledOptions('fu_mode').some((o) => o.value === prefillMode) ? { mode: prefillMode } : {})
            }));
          }
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [prefillLeadId, prefillMode, editingId]);

  // Client actions menu deep-link (Create Follow-up): ?clientId=<id> pre-fills
  // the Lead Information section from the saved Client record (mirrors the ERP
  // auto-detecting a client ID and loading the client). The Lead dropdown stays
  // required — the ERP followup form also marks Lead as a required field.
  useEffect(() => {
    if (!prefillClientId || editingId) return;
    let cancelled = false;
    customerService
      .get(prefillClientId)
      .then((res) => {
        if (cancelled) return;
        const c = res?.data ?? res ?? {};
        setForm((prev) => ({
          ...prev,
          clientId: String(c.id ?? ''),
          customer: c.businessName || c.company || c.name || '',
          contactPerson: c.contactPerson || '',
          phone: c.phone || '',
          email: c.email || '',
          industry: c.industry || '',
          executive: c.salesPerson || '',
          address: c.billingAddress || ''
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [prefillClientId, editingId]);

  // ---- Edit mode: load the real follow-up from /followups/{id} -------------
  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await followUpService.get(editingId);
        if (cancelled) return;
        const f = res?.data ?? res ?? {};
        setForm({
          leadId: f.leadId != null ? String(f.leadId) : '',
          clientId: f.clientId != null ? String(f.clientId) : '',
          customer: f.companyName || '',
          contactPerson: f.contactPerson || '',
          phone: f.phone || '',
          email: f.email || '',
          leadStatus: f.leadStage || '',
          source: f.source || '',
          industry: f.industry || '',
          executive: f.executive || '',
          address: f.address || '',
          followupDate: f.followupDate || '',
          time: f.time || '',
          mode: f.mode || '',
          priority: f.priority || 'Medium',
          currentStatus: f.currentStatus || '',
          outcome: f.outcome || '',
          discussionSummary: f.discussionSummary || '',
          customerFeedback: f.customerFeedback || '',
          requirement: f.requirement || '',
          nextFollowupDate: f.nextFollowupDate || '',
          assignTo: f.assignTo || 'Self',
          reminder: f.reminder || '',
          reminderType: f.reminderType || ''
        });
      } catch (err) {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load follow-up');
        navigate('/followups');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, navigate, toast]);

  const selectedLead = leads.find((l) => String(l.id) === String(form.leadId));

  const handleLeadSelect = (e) => {
    const id = e.target.value;
    const lead = leads.find((l) => String(l.id) === String(id));
    if (lead) {
      // ERP Lead Information section auto-populates from the selected lead (readonly)
      setForm((prev) => ({
        ...prev,
        leadId: id,
        customer: lead.businessName || lead.company || lead.name || '',
        contactPerson: lead.name || lead.contactPerson || '',
        phone: lead.phone || lead.mobile || '',
        email: lead.email || '',
        leadStatus: lead.status || lead.stage || '',
        source: lead.source || lead.leadSource || '',
        industry: lead.industry || '',
        executive: lead.owner || lead.assignedTo || '',
        address: lead.address || ''
      }));
    } else {
      setForm((prev) => ({ ...prev, leadId: id }));
    }
  };

  const handleFiles = (e) => {
    const all = Array.from(e.target.files || []);
    const files = all.filter((file) => {
      const err = getAttachmentSelectionError(file);
      if (err) {
        toast.warning(err.message);
        return false;
      }
      return true;
    });
    if (files.length > 0) setAttachmentFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const removeFile = (index) => setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));

  const validate = () => {
    const next = {};
    // ERP parity: a follow-up is linked to a Lead and/or a Client — one is required.
    if (!form.leadId && !form.clientId) next.leadId = 'Select a Lead or Client';
    if (!form.followupDate) next.followupDate = 'Follow-up Date is required';
    if (!form.mode) next.mode = 'Mode is required';
    if (!form.discussionSummary.trim()) next.discussionSummary = 'Discussion Summary is required';
    if (form.email && !EMAIL_PATTERN.test(form.email)) next.email = 'Enter a valid email address';
    if (form.phone && !PHONE_PATTERN.test(form.phone)) next.phone = 'Enter a valid phone number';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => {
    // Real FollowUpRequest shape — persisted to the `followups` table via
    // /followups. The backend snapshots the selected lead's details server-side
    // (applyLead), so the leadId is the source of the lead relationship.
    return {
      leadId: form.leadId ? Number(form.leadId) : null,
      clientId: form.clientId ? Number(form.clientId) : null,
      leadName: form.contactPerson.trim() || form.customer.trim() || selectedLead?.name || '',
      companyName: form.customer || selectedLead?.businessName || '',
      contactPerson: form.contactPerson.trim() || '',
      phone: form.phone,
      email: form.email,
      leadStage: form.leadStatus || selectedLead?.stage || '',
      source: form.source || selectedLead?.source || '',
      industry: form.industry || selectedLead?.industry || '',
      executive: form.executive || form.assignTo || '',
      address: form.address || selectedLead?.address || '',
      followupDate: form.followupDate,
      time: form.time,
      mode: form.mode,
      priority: form.priority,
      currentStatus: form.currentStatus,
      outcome: form.outcome,
      discussionSummary: form.discussionSummary,
      customerFeedback: form.customerFeedback,
      requirement: form.requirement,
      nextFollowupDate: form.nextFollowupDate,
      assignTo: form.assignTo,
      reminder: form.reminder,
      reminderType: form.reminderType,
      status: undefined // backend keeps lifecycle status (Open/Archived)
    };
  };

  // Upload selected attachments to the real /followups/{id}/attachments endpoint.
  const uploadAttachments = async (followUpId) => {
    for (const file of attachmentFiles) {
      const formData = new FormData();
      formData.append('file', file);
      await followUpService.addAttachment(followUpId, formData);
    }
  };

  const save = async (mode) => {
    // ERP save() semantics: draft skips the Discussion Summary requirement and
    // keeps the form; 'new' resets the form; 'exit' (continue) navigates to list.
    if (mode !== 'draft') {
      if (!validate()) return;
      // ERP past-date confirm (non-draft)
      const today = new Date().toISOString().split('T')[0];
      if (form.followupDate && form.followupDate < today) {
        const ok = window.confirm(
          `The follow-up date (${form.followupDate}) is in the past. Are you sure you want to proceed?`
        );
        if (!ok) return;
      }
    } else {
      const next = {};
      if (!form.leadId && !form.clientId) next.leadId = 'Select a Lead or Client';
      if (!form.followupDate) next.followupDate = 'Follow-up Date is required';
      if (!form.mode) next.mode = 'Mode is required';
      setErrors(next);
      if (Object.keys(next).length > 0) return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = editingId
        ? await followUpService.update(editingId, payload)
        : await followUpService.create(payload);
      const created = res?.data ?? res ?? {};
      const savedId = editingId || created.id;
      if (attachmentFiles.length > 0 && savedId) {
        try {
          await uploadAttachments(savedId);
        } catch {
          toast.error('Follow-up saved, but one or more attachments failed to upload');
        }
      }
      // Clear localStorage draft after successful save
      clearFormDraft();
      toast.success(editingId ? 'Follow-up updated successfully' : mode === 'draft' ? 'Follow-up saved' : 'Follow-up created successfully');
      if (mode === 'continue') {
        // Save & Continue: open this follow-up's record page after the
        // confirmed save (edit mode re-opens the same id).
        navigate(savedId ? `/followups/${savedId}` : '/followups');
      } else if (mode === 'new') {
        setForm(EMPTY_FORM);
        setAttachmentFiles([]);
        setErrors({});
      }
      // 'draft' keeps the form populated (ERP keeps it for editing)
    } catch (err) {
      toast.error(err?.message || (editingId ? 'Failed to update follow-up' : 'Failed to create follow-up'));
    } finally {
      setSubmitting(false);
    }
  };

  // ERP Lead Details sidebar (fuLeadSummary) — Lead No, Company, Contact, Phone,
  // Email, Source, Stage, Expected Value, Last Follow-up
  const assigneeOptions = () => {
    const names = ['Self'];
    leads.forEach((l) => {
      const a = l.owner || l.assignedTo || '';
      if (a && !names.includes(a)) names.push(a);
    });
    return names;
  };

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>CRM</span>
        <span>&gt;</span>
        <span>Follow-ups</span>
        <span>&gt;</span>
        <span className="text-slate-600">{editingId ? 'Edit' : 'New'}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{editingId ? 'Edit Follow-up' : 'Create Follow-up'}</h1>
          <div className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500 font-bold">*</span> are required
          </div>
        </div>
        <button
          onClick={() => navigate('/followups')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to Follow-ups
        </button>
      </div>

      {loading ? (
        <div className="bg-surface border border-slate-200 rounded-xl p-10 text-center text-xs font-semibold text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading follow-up…
        </div>
      ) : (
      <form onSubmit={(e) => { e.preventDefault(); save('continue'); }}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          {/* MAIN FORM (left) */}
          <div className="lg:col-span-2 space-y-4">
            {/* 1. LEAD INFORMATION */}
            <Accordion title="Lead Information" icon={User} defaultOpen>
              <div className="space-y-4">
                <FormField label="Lead" required error={errors.leadId}>
                  <SelectInput value={form.leadId} onChange={handleLeadSelect} error={!!errors.leadId}>
                    <option value="">Select Lead</option>
                    {leads.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.leadNo || l.id} — {l.businessName || l.company || l.name}
                      </option>
                    ))}
                  </SelectInput>
                </FormField>
                <div className={GRID}>
                  <FormField label="Customer / Company">
                    <TextInput value={form.customer} readOnly placeholder="Auto-filled from lead" className="bg-slate-100/70" />
                  </FormField>
                  <FormField label="Contact Person">
                    <TextInput value={form.contactPerson} onChange={set('contactPerson')} placeholder="Contact person name" />
                  </FormField>
                  <FormField label="Phone">
                    <TextInput value={form.phone} readOnly placeholder="Auto-filled from lead" className="bg-slate-100/70" />
                  </FormField>
                  <FormField label="Email">
                    <TextInput type="email" value={form.email} readOnly placeholder="Auto-filled from lead" className="bg-slate-100/70" />
                  </FormField>
                  <FormField label="Lead Status">
                    <TextInput value={form.leadStatus} readOnly placeholder="Auto-filled" className="bg-slate-100/70" />
                  </FormField>
                  <FormField label="Source">
                    <TextInput value={form.source} readOnly placeholder="Auto-filled" className="bg-slate-100/70" />
                  </FormField>
                  <FormField label="Industry">
                    <TextInput value={form.industry} readOnly placeholder="Auto-filled" className="bg-slate-100/70" />
                  </FormField>
                  <FormField label="Executive">
                    <TextInput value={form.executive} readOnly placeholder="Auto-filled" className="bg-slate-100/70" />
                  </FormField>
                </div>
                <FormField label="Address">
                  <TextArea value={form.address} readOnly rows={2} placeholder="Auto-filled" className="bg-slate-100/70" />
                </FormField>

              </div>
            </Accordion>

            {/* 2. FOLLOW-UP DETAILS */}
            <Accordion title="Follow-up Details" icon={Calendar} defaultOpen>
              <div className={GRID}>
                <FormField label="Follow-up Date" required error={errors.followupDate}>
                  <TextInput type="date" value={form.followupDate} onChange={set('followupDate')} error={!!errors.followupDate} />
                </FormField>
                <FormField label="Time">
                  <TextInput type="time" value={form.time} onChange={set('time')} />
                </FormField>
                <FormField label="Mode" required error={errors.mode}>
                  <ManagedSelect
                    categoryKey="fu_mode"
                    label="Follow-up Mode"
                    value={form.mode}
                    onChange={(v) => setForm((prev) => ({ ...prev, mode: v }))}
                    placeholder="Select Mode"
                    error={!!errors.mode}
                  />
                </FormField>
                <FormField label="Priority">
                  <ManagedSelect
                    categoryKey="fu_priority"
                    label="Follow-up Priority"
                    value={form.priority}
                    onChange={(v) => setForm((prev) => ({ ...prev, priority: v }))}
                    placeholder="Select Priority"
                  />
                </FormField>
                <FormField label="Current Status">
                  <ManagedSelect
                    categoryKey="fu_status"
                    label="Follow-up Status"
                    value={form.currentStatus}
                    onChange={(v) => setForm((prev) => ({ ...prev, currentStatus: v }))}
                    placeholder="Select Status"
                  />
                </FormField>
                <FormField label="Outcome">
                  <ManagedSelect
                    categoryKey="fu_outcome"
                    label="Follow-up Outcome"
                    value={form.outcome}
                    onChange={(v) => setForm((prev) => ({ ...prev, outcome: v }))}
                    placeholder="-- Select Outcome --"
                  />
                </FormField>
              </div>
            </Accordion>

            {/* 3. DISCUSSION */}
            <Accordion title="Discussion" icon={MessageSquare} defaultOpen>
              <div className="space-y-4">
                <FormField label="Discussion Summary" required error={errors.discussionSummary}>
                  <TextArea value={form.discussionSummary} onChange={set('discussionSummary')} rows={4} error={!!errors.discussionSummary} placeholder="Summarise the discussion with the lead..." />
                </FormField>
                <FormField label="Customer Feedback">
                  <TextArea value={form.customerFeedback} onChange={set('customerFeedback')} rows={3} placeholder="Customer's feedback and response to our offerings" />
                </FormField>
                <FormField label="Requirement">
                  <TextArea value={form.requirement} onChange={set('requirement')} rows={3} placeholder="What are the customer's requirements?" />
                </FormField>
              </div>
            </Accordion>

            {/* 4. NEXT ACTION */}
            <Accordion title="Next Action" icon={Forward} defaultOpen>
              <div className={GRID}>
                <FormField label="Next Follow-up Date">
                  <TextInput type="date" value={form.nextFollowupDate} onChange={set('nextFollowupDate')} />
                </FormField>
                <FormField label="Assign To">
                  <SelectInput value={form.assignTo} onChange={set('assignTo')}>
                    <option value="">Select Assignee</option>
                    {assigneeOptions().map((o) => <option key={o} value={o}>{o}</option>)}
                  </SelectInput>
                </FormField>
                <FormField label="Reminder">
                  <ManagedSelect
                    categoryKey="fu_reminder"
                    label="Follow-up Reminder"
                    value={form.reminder}
                    onChange={(v) => setForm((prev) => ({ ...prev, reminder: v }))}
                    placeholder="No Reminder"
                  />
                </FormField>
                <FormField label="Reminder Type">
                  <ManagedSelect
                    categoryKey="fu_reminder_type"
                    label="Reminder Type"
                    value={form.reminderType}
                    onChange={(v) => setForm((prev) => ({ ...prev, reminderType: v }))}
                    placeholder="Select Reminder Type"
                  />
                </FormField>
              </div>
            </Accordion>
          </div>

          {/* SIDE PANEL (right) */}
          <div className="lg:col-span-1 space-y-4">
            {/* 5. LEAD DETAILS */}
            <Accordion title="Lead Details" icon={Info} defaultOpen>
              <div className="space-y-2.5">
                {[
                  ['Lead No', selectedLead?.leadNo || (selectedLead?.id != null ? formatLeadNo(selectedLead.id) : 'N/A')],
                  ['Company', selectedLead ? (selectedLead.businessName || selectedLead.company || selectedLead.name || 'N/A') : 'N/A'],
                  ['Contact', selectedLead ? (selectedLead.name || selectedLead.contactPerson || 'N/A') : 'N/A'],
                  ['Phone', selectedLead?.phone || selectedLead?.mobile || 'N/A'],
                  ['Email', selectedLead?.email || 'N/A'],
                  ['Source', selectedLead?.source || selectedLead?.leadSource || 'N/A'],
                  ['Stage', selectedLead?.stage || selectedLead?.status || 'N/A'],
                  ['Expected Value', selectedLead?.value ? `₹${Number(selectedLead.value).toLocaleString('en-IN')}` : 'N/A'],
                  ['Last Follow-up', 'N/A']
                ].map(([label, value]) => (
                  <div key={label}>
                    <span className="block text-[11px] text-slate-400 font-semibold">{label}</span>
                    <span className="block text-xs font-semibold text-slate-800 mt-0.5 truncate">{value}</span>
                  </div>
                ))}
              </div>
            </Accordion>

            {/* 6. ATTACHMENTS */}
            <Accordion title="Attachments" icon={Paperclip} defaultOpen>
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-slate-200 rounded-lg py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-600 transition-colors cursor-pointer"
                >
                  <Upload className="w-5 h-5" />
                  <p className="text-xs font-semibold">
                    Drag &amp; drop files or <span className="text-emerald-600 underline">browse</span>
                  </p>
                  <p className="text-[10px] text-slate-400">PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</p>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={handleFiles}
                />
                {attachmentFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 mb-2">
                      <Paperclip className="w-3 h-3 text-slate-400" /> Uploaded Files
                    </div>
                    <div className="space-y-2">
                      {attachmentFiles.map((file, index) => (
                        <div key={`${file.name}-${index}`} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
                            <p className="text-[10px] text-slate-400">{formatBytes(file.size)}</p>
                          </div>
                          <button type="button" onClick={() => removeFile(index)} className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer" aria-label={`Remove ${file.name}`}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Accordion>
          </div>
        </div>

        {/* FOOTER (ERP: Cancel | Save Draft  â  Save & Create New | Save & Continue) */}
        {/* ERP standard creation action bar */}
        <CreationActionBar
          showBackToList={false}
          onCancel={() => navigate('/followups')}
          onSaveDraft={() => save('draft')}
          onSaveNew={() => save('new')}
          onSave={() => save('continue')}
          saveLabel={submitting ? 'Saving...' : 'Save & Continue'}
          disabled={submitting}
        />
      </form>
      )}
    </div>
  );
}
