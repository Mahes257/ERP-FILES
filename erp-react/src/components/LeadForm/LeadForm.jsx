import { useState, useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase, Target, User, UserPlus, MapPin, UserCheck,
  Paperclip, StickyNote, Lock, Upload, X, Save, RotateCcw, Loader2
} from 'lucide-react';
import { Accordion, FormField, TextInput, SelectInput, TextArea, ManagedSelect, useToast } from '../Common';
import leadService from '../../services/leadService';
import marketingSettingsService from '../../services/marketingSettingsService';
import { serializeLead } from '../../utils/leadHelpers';
import { composeInternalNotes } from '../../utils/leadNotes';
import { getAttachmentSelectionError } from '../../utils/attachmentStorage';
import { stageToApiLabel } from '../../utils/dropdownManager';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{7,}$/;
const NUMERIC_PATTERN = /^\d*$/;

const SECTIONS = [
  { key: 'business', title: 'Business Information', subtitle: 'Company and organization details', icon: Briefcase },
  { key: 'lead', title: 'Lead Information', subtitle: 'Deal, pipeline stage and value', icon: Target },
  { key: 'primary', title: 'Primary Contact', subtitle: 'Main point of contact', icon: User },
  { key: 'secondary', title: 'Secondary Contact', subtitle: 'Alternate contact person', icon: UserPlus },
  { key: 'address', title: 'Address', subtitle: 'Registered business address', icon: MapPin },
  { key: 'assignment', title: 'Assignment', subtitle: 'Owner and pipeline assignment', icon: UserCheck },
  { key: 'attachments', title: 'Attachments', subtitle: 'Supporting documents and files', icon: Paperclip },
  { key: 'notes', title: 'Notes', subtitle: 'Notes visible to the team', icon: StickyNote },
  { key: 'internal', title: 'Internal Notes', subtitle: 'Private notes for the team only', icon: Lock }
];

const DEFAULT_VALUES = {
  businessName: '',
  businessType: '',
  industry: '',
  taxId: '',
  website: '',
  name: '',
  company: '',
  title: '',
  value: '',
  stage: 'New',
  source: 'Website',
  priority: 'Medium',
  email: '',
  phone: '',
  secondaryName: '',
  secondaryEmail: '',
  secondaryPhone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  country: 'India',
  owner: 'Admin User',
  notes: '',
  description: '',
  internalNotes: ''
};

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

export default function LeadForm({ initialData, leadId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm({ defaultValues: { ...DEFAULT_VALUES, ...initialData }, mode: 'onTouched' });

  // Managed dropdown fields are driven by local state (react-hook-form's
  // watch() is avoided here to keep the React Compiler lint clean).
  const [managedFields, setManagedFields] = useState(() => ({
    businessType: initialData?.businessType || DEFAULT_VALUES.businessType || '',
    stage: initialData?.stage || DEFAULT_VALUES.stage,
    source: initialData?.source || DEFAULT_VALUES.source,
    priority: initialData?.priority || DEFAULT_VALUES.priority
  }));
  const setManaged = (key) => (v) => setManagedFields((f) => ({ ...f, [key]: v }));

  // Marketing Settings defaults (DB-backed): apply the administrator-
  // configured default Lead Source / Stage / Priority for NEW leads only —
  // never when editing an existing lead (initialData wins).
  useEffect(() => {
    if (leadId || initialData) return; // edit mode — keep the record's values
    let cancelled = false;
    marketingSettingsService
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        const ls = s?.leadSettings || {};
        setManagedFields((f) => ({
          ...f,
          stage: f.stage || ls.defaultLeadStage || DEFAULT_VALUES.stage,
          source: f.source || ls.defaultLeadSource || DEFAULT_VALUES.source,
          priority: f.priority || ls.defaultLeadPriority || DEFAULT_VALUES.priority
        }));
      })
      .catch(() => { /* hardcoded fallbacks remain */ });
    return () => { cancelled = true; };
  }, [leadId, initialData]);

  const [submitting, setSubmitting] = useState(false);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const fileInputRef = useRef(null);
  const [users, setUsers] = useState(() => (initialData?.owner ? [{ id: 'current', name: initialData.owner }] : []));

  useEffect(() => {
    let cancelled = false;
    leadService
      .getUsers()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? data?.users ?? [];
        if (cancelled) return;
        setUsers((prev) => {
          const seen = new Set(prev.map((user) => user?.name ?? user?.email));
          const merged = [...prev];
          list.forEach((user) => {
            const name = user?.name ?? user?.email;
            if (name && !seen.has(name)) {
              seen.add(name);
              merged.push(user);
            }
          });
          return merged;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [initialData?.owner]);

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
    if (files.length > 0) {
      setAttachmentFiles((prev) => [...prev, ...files]);
    }
    e.target.value = '';
  };

  const removeFile = (index) => {
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      const payload = {
        ...serializeLead({
          ...values,
          stage: managedFields.stage,
          source: managedFields.source,
          priority: managedFields.priority
        }),
        // Renamed stages resolve back to the original ERP label; the backend
        // enum parser accepts the original label (custom stages fail honestly).
        pipelineStage: stageToApiLabel(managedFields.stage),
        notes: values.notes,
        // The textarea shows the written note only; the legacy CRM metadata
        // envelope that travelled with it (if any) is re-attached here so
        // client number / currency / credit limit / linked contacts / shipping
        // details / status are preserved exactly as stored.
        internalNotes: composeInternalNotes(values.internalNotesMeta, values.internalNotes),
        attachments: attachmentFiles.map((file) => ({ name: file.name, size: file.size, type: file.type }))
      };
      if (leadId) {
        await leadService.updateLead(leadId, payload);
        toast.success('Lead updated successfully');
      } else {
        await leadService.createLead(payload);
        toast.success('Lead created successfully');
      }
      reset({ ...DEFAULT_VALUES });
      setAttachmentFiles([]);
      navigate('/leads');
    } catch (err) {
      toast.error(err?.message || (leadId ? 'Failed to update lead' : 'Failed to create lead'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    reset({ ...DEFAULT_VALUES });
    setAttachmentFiles([]);
  };

  const renderSection = (key) => {
    switch (key) {
      case 'business':
        return (
          <div className={GRID}>
            <FormField label="Business Name" required error={errors.businessName?.message}>
              <TextInput
                registration={register('businessName', { required: 'Business name is required' })}
                error={!!errors.businessName}
                placeholder="Registered business name"
              />
            </FormField>
            <FormField label="Business Type">
              <ManagedSelect
                categoryKey="lead_business_type"
                label="Business Type"
                value={managedFields.businessType || ''}
                onChange={setManaged('businessType')}
                placeholder="Select type"
              />
            </FormField>
            <FormField label="Industry">
              <TextInput registration={register('industry')} placeholder="e.g. Manufacturing, IT, Logistics" />
            </FormField>
            <FormField label="Tax ID / GST">
              <TextInput registration={register('taxId')} placeholder="GST number" />
            </FormField>
            <FormField label="Website" className="sm:col-span-2">
              <TextInput registration={register('website')} placeholder="https://company.com" />
            </FormField>
          </div>
        );

      case 'lead':
        return (
          <div className={GRID}>
            <FormField label="Lead Name" required error={errors.name?.message}>
              <TextInput
                registration={register('name', { required: 'Lead name is required' })}
                error={!!errors.name}
                placeholder="Full name of the lead"
              />
            </FormField>
            <FormField label="Company" required error={errors.company?.message}>
              <TextInput
                registration={register('company', { required: 'Company is required' })}
                error={!!errors.company}
                placeholder="Company / organisation"
              />
            </FormField>
            <FormField label="Designation">
              <TextInput registration={register('title')} placeholder="e.g. Procurement Head" />
            </FormField>
            <FormField label="Estimated Value (INR)" hint="Entered in Indian Rupees">
              <TextInput
                type="number"
                min="0"
                step="1"
                registration={register('value', {
                  pattern: { value: NUMERIC_PATTERN, message: 'Enter a valid number' }
                })}
                error={!!errors.value}
                placeholder="0"
              />
            </FormField>
            <FormField label="Pipeline Stage">
              <ManagedSelect
                categoryKey="lead_stage"
                label="Lead Stage"
                value={managedFields.stage || ''}
                onChange={setManaged('stage')}
                placeholder="Select stage"
              />
            </FormField>
            <FormField label="Lead Source">
              <ManagedSelect
                categoryKey="lead_source"
                label="Lead Source"
                value={managedFields.source || ''}
                onChange={setManaged('source')}
                placeholder="Select source"
              />
            </FormField>
            <FormField label="Priority">
              <ManagedSelect
                categoryKey="lead_priority"
                label="Lead Priority"
                value={managedFields.priority || ''}
                onChange={setManaged('priority')}
                placeholder="Select priority"
              />
            </FormField>
            <FormField label="Lead Description" className="sm:col-span-2">
              <TextArea
                registration={register('description')}
                rows={4}
                placeholder="Enter lead description"
              />
            </FormField>
          </div>
        );

      case 'primary':
        return (
          <div className={GRID}>
            <FormField label="Email Address" required error={errors.email?.message}>
              <TextInput
                type="email"
                registration={register('email', {
                  required: 'Email is required',
                  pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email address' }
                })}
                error={!!errors.email}
                placeholder="name@company.com"
              />
            </FormField>
            <FormField label="Phone Number" required error={errors.phone?.message}>
              <TextInput
                type="tel"
                registration={register('phone', {
                  required: 'Phone is required',
                  pattern: { value: PHONE_PATTERN, message: 'Enter a valid phone number' }
                })}
                error={!!errors.phone}
                placeholder="+91 98765 43210"
              />
            </FormField>
          </div>
        );

      case 'secondary':
        return (
          <div className={GRID}>
            <FormField label="Contact Name">
              <TextInput registration={register('secondaryName')} placeholder="Alternate contact person" />
            </FormField>
            <FormField label="Phone Number" error={errors.secondaryPhone?.message}>
              <TextInput
                type="tel"
                registration={register('secondaryPhone', {
                  pattern: { value: PHONE_PATTERN, message: 'Enter a valid phone number' }
                })}
                error={!!errors.secondaryPhone}
                placeholder="+91 98765 43210"
              />
            </FormField>
            <FormField label="Email Address" className="sm:col-span-2" error={errors.secondaryEmail?.message}>
              <TextInput
                type="email"
                registration={register('secondaryEmail', {
                  pattern: { value: EMAIL_PATTERN, message: 'Enter a valid email address' }
                })}
                error={!!errors.secondaryEmail}
                placeholder="alternate@company.com"
              />
            </FormField>
          </div>
        );

      case 'address':
        return (
          <div className={GRID}>
            <FormField label="Address" className="sm:col-span-2">
              <TextArea registration={register('address')} placeholder="Street, building, area" />
            </FormField>
            <FormField label="City">
              <TextInput registration={register('city')} placeholder="City" />
            </FormField>
            <FormField label="State">
              <TextInput registration={register('state')} placeholder="State" />
            </FormField>
            <FormField label="PIN Code">
              <TextInput registration={register('pincode')} placeholder="PIN code" />
            </FormField>
            <FormField label="Country">
              <TextInput registration={register('country')} placeholder="Country" />
            </FormField>
          </div>
        );

      case 'assignment':
        return (
          <div className={GRID}>
            <FormField label="Assign Owner">
              <SelectInput registration={register('owner')}>
                {users.map((user) => (
                  <option key={user?.id ?? user?.name ?? user?.email} value={user?.name ?? user?.email}>
                    {user?.name ?? user?.email}
                  </option>
                ))}
              </SelectInput>
            </FormField>
          </div>
        );

      case 'attachments':
        return (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-slate-200 rounded-lg py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-600 transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5" />
              <span className="text-xs font-semibold">Click to attach files</span>
            </button>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFiles} />
            {attachmentFiles.length > 0 && (
              <div className="space-y-2">
                {attachmentFiles.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-400">{formatBytes(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-1 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'notes':
        return (
          <div>
            <FormField label="Notes" hint="Visible to everyone on the team">
              <TextArea registration={register('notes')} rows={4} placeholder="Add public notes about this lead..." />
            </FormField>
          </div>
        );

      case 'internal':
        return (
          <div>
            <FormField label="Internal Notes" hint="Private notes for the team only">
              <TextArea registration={register('internalNotes')} rows={4} placeholder="Add internal comments..." />
            </FormField>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* ERP two-column layout — Business | Lead, Primary Contact | Secondary Contact */}
      {[
        ['business', 'lead'],
        ['primary', 'secondary']
      ].map(([leftKey, rightKey]) => {
        const left = SECTIONS.find((s) => s.key === leftKey);
        const right = SECTIONS.find((s) => s.key === rightKey);
        if (!left || !right) return null;
        return (
          <div key={left.key} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Accordion title={left.title} subtitle={left.subtitle} icon={left.icon} defaultOpen>
              {renderSection(left.key)}
            </Accordion>
            <Accordion title={right.title} subtitle={right.subtitle} icon={right.icon} defaultOpen>
              {renderSection(right.key)}
            </Accordion>
          </div>
        );
      })}

      {/* ERP two-column layout — Address | Assignment + Notes (Notes directly below Assignment in the right column) */}
      {(() => {
        const address = SECTIONS.find((s) => s.key === 'address');
        const assignment = SECTIONS.find((s) => s.key === 'assignment');
        const notes = SECTIONS.find((s) => s.key === 'notes');
        if (!address || !assignment || !notes) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Accordion title={address.title} subtitle={address.subtitle} icon={address.icon} defaultOpen>
              {renderSection(address.key)}
            </Accordion>
            <div className="flex flex-col gap-4 min-w-0">
              <Accordion title={assignment.title} subtitle={assignment.subtitle} icon={assignment.icon} defaultOpen>
                {renderSection(assignment.key)}
              </Accordion>
              <Accordion title={notes.title} subtitle={notes.subtitle} icon={notes.icon} defaultOpen>
                {renderSection(notes.key)}
              </Accordion>
            </div>
          </div>
        );
      })()}

      {/* ERP two-column layout — Attachments | Internal Information */}
      {(() => {
        const attachments = SECTIONS.find((s) => s.key === 'attachments');
        const internal = SECTIONS.find((s) => s.key === 'internal');
        if (!attachments || !internal) return null;
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
            <Accordion title={attachments.title} subtitle={attachments.subtitle} icon={attachments.icon} defaultOpen>
              {renderSection(attachments.key)}
            </Accordion>
            <Accordion title={internal.title} subtitle={internal.subtitle} icon={internal.icon} defaultOpen>
              {renderSection(internal.key)}
            </Accordion>
          </div>
        );
      })()}

      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset Form
        </button>
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => navigate('/leads')}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 bg-[#0B4A3D] hover:bg-[#083D34] text-white text-xs font-bold px-5 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>{submitting ? (leadId ? 'Saving...' : 'Creating...') : (leadId ? 'Update Lead' : 'Create Lead')}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
