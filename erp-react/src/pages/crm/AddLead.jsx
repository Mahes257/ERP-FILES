import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ATTACHMENT_ACCEPT,
  MAX_ATTACHMENT_SIZE_LABEL,
  formatFileSize,
  getAttachmentSelectionError
} from '../../utils/attachmentStorage';
import {
  useToast,
  Accordion,
  FormField,
  TextInput,
  TextArea,
  ManagedSelect,
  GeoOptionsModal,
  CreationActionBar,
  INPUT_BASE
} from '../../components/Common';
import leadService from '../../services/leadService';
import marketingSettingsService from '../../services/marketingSettingsService';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import {
  ChevronDown,
  Info,
  Building2,
  User,
  Users,
  MapPin,
  UserCheck,
  StickyNote,
  Settings,
  Settings2,
  Paperclip,
  Upload,
  X,
} from 'lucide-react';
import {
  getFlatOptions,
  stageToApiLabel,
  useDropdownVersion
} from '../../utils/dropdownManager';
import OptionsManagerModal from '../../components/Common/OptionsManagerModal';
// Address options come from the centralized Location Master (MySQL), never from
// a hardcoded list — the City/Town dropdown shows the COMPLETE master of the
// selected state.
import { useGeoCountries, useGeoStates, useGeoCities } from '../../hooks/useLocationMaster';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{7,}$/;
const NUMERIC_PATTERN = /^\d*\.?\d*$/;

// Lead Owner fallback when the /users API is unavailable (ERP names).
const LEAD_OWNERS = [
  'Admin', 'Rajesh Kumar', 'Priya Sharma', 'Vikram Patel', 'Ananya Reddy',
  'Suresh Menon', 'Arun Nair', 'Kavita Joshi', 'Dr. Meera Iyer', 'Rohan Desai',
  'Amitabh Sinha', 'Pradeep Singh', 'Neha Gupta', 'Deepak Sharma'
];
// Lead Stage → backend enum value (leadConstants is the pipeline source of
// truth; renamed stages are resolved back to the original label first).
const STAGE_TO_BACKEND = {
  New: 'NEW',
  Contacted: 'CONTACTED',
  Qualified: 'QUALIFIED',
  Proposal: 'PROPOSAL',
  'Proposal Sent': 'PROPOSAL_SENT',
  Negotiation: 'NEGOTIATION',
  Won: 'WON',
  Lost: 'LOST'
};

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';

const EMPTY_FORM = {
  businessName: '',
  industry: '',
  website: '',
  leadNo: '',
  leadSource: '',
  expectedValue: '',
  expectedCloseDate: '',
  contactPerson: '',
  phone: '',
  email: '',
  secondaryPerson: '',
  secondaryPhone: '',
  secondaryEmail: '',
  designation: '',
  country: 'India',
  state: '',
  city: '',
  pincode: '',
  mapNo: '',
  address: '',
  owner: 'Admin',
  stage: '',
  priority: '',
  status: '',
  notes: '',
  description: '',
  internalNotes: ''
};

/**
 * TypeableCombobox
 * ------------------------------------------------------------------
 * Searchable "select or type" combobox. Used by the Lead Industry and Lead
 * Owner fields of the Create New Lead form.
 *
 *  - Click / focus → opens the existing options.
 *  - Typing        → filters the options (case-insensitive).
 *  - ↑ / ↓         → move the highlighted option; Enter selects it.
 *  - Enter         → selects the highlighted option, otherwise accepts the
 *                    typed text as the field value. It never submits the Lead
 *                    form and never rewrites the value to a predefined default.
 *  - Escape        → closes the list (the value already in the field stays).
 *
 * The options are supplied by the caller and are NEVER written to by this
 * combobox: a custom typed value exists only as the current form value and is
 * not added to the option list. When `categoryKey` is supplied the existing
 * "Manage options" gear + modal render (Industry); without it the field is a
 * plain searchable/typeable input (Lead Owner, whose users come from the
 * /users API rather than a manageable master list).
 * ------------------------------------------------------------------
 */
function TypeableCombobox({
  value,
  onChange,
  options = [],
  label = 'Option',
  categoryKey,
  placeholder = 'Select or type…',
  noun = 'option',
  nounPlural = 'options'
}) {
  const [open, setOpen] = useState(false);
  // `typed` separates "just opened — show every option" from "the user is
  // filtering", so clicking the field never hides the current value.
  const [typed, setTyped] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(-1);
  const [manageOpen, setManageOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) => String(opt).toLowerCase().includes(q));
  }, [options, query]);

  const trimmedQuery = query.trim();
  const exactMatch = trimmedQuery
    ? options.find((opt) => String(opt).trim().toLowerCase() === trimmedQuery.toLowerCase())
    : null;

  // The field lives inside an overflow-hidden Accordion, so the option list is
  // portalled into <body> and positioned with fixed coordinates.
  useEffect(() => {
    if (!open) return undefined;
    const position = () => {
      const el = rootRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = rect.width;
      let left = Math.max(8, rect.left);
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      const spaceBelow = window.innerHeight - rect.bottom;
      const listHeight = 240;
      const flip = spaceBelow < listHeight && rect.top > listHeight;
      setPos({
        left,
        width,
        top: flip ? rect.top - listHeight - 4 : rect.bottom + 4,
        maxHeight: Math.min(listHeight, Math.max(120, (flip ? rect.top : spaceBelow) - 16))
      });
    };
    position();
    window.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    return () => {
      window.removeEventListener('scroll', position, true);
      window.removeEventListener('resize', position);
    };
  }, [open]);

  const close = () => {
    setOpen(false);
    setTyped(false);
    setQuery('');
    setHighlight(-1);
  };

  const openList = () => {
    setOpen(true);
    setTyped(false);
    setQuery('');
    setHighlight(-1);
  };

  // Commit a value: an exact (case-insensitive) predefined match is stored in
  // its canonical casing, anything else is stored exactly as typed.
  const commit = (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) {
      onChange('');
      return;
    }
    const match = options.find((opt) => String(opt).trim().toLowerCase() === text.toLowerCase());
    onChange(match || text);
  };

  const selectOption = (opt) => {
    commit(opt);
    close();
  };

  const acceptTyped = () => {
    if (highlight >= 0 && filtered[highlight] != null) commit(filtered[highlight]);
    else if (typed && trimmedQuery) commit(trimmedQuery);
    close();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (filtered.length ? (h < filtered.length - 1 ? h + 1 : 0) : -1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => (filtered.length ? (h > 0 ? h - 1 : filtered.length - 1) : -1));
    } else if (e.key === 'Enter') {
      // Accept this field's value only — never submit the Lead form.
      e.preventDefault();
      e.stopPropagation();
      if (open) acceptTyped();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const displayValue = open && typed ? query : value || '';

  return (
    <div className="flex items-stretch gap-1.5">
      <div ref={rootRef} className="relative flex-1 min-w-0">
        <input
          type="text"
          role="combobox"
          autoComplete="off"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-autocomplete="list"
          aria-label={label}
          value={displayValue}
          placeholder={placeholder}
          onFocus={openList}
          onClick={() => { if (!open) openList(); }}
          onChange={(e) => {
            setOpen(true);
            setTyped(true);
            setQuery(e.target.value);
            setHighlight(-1);
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Commit typed text so a value entered without pressing Enter is
            // still kept on the form, then close the list.
            if (typed && trimmedQuery && trimmedQuery !== (value || '').trim()) commit(trimmedQuery);
            close();
          }}
          className={`${INPUT_BASE} pr-8 cursor-text`}
        />
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
      {categoryKey && (
        <button
          type="button"
          title={`Manage ${label} options`}
          aria-label={`Manage ${label} options`}
          onClick={() => setManageOpen(true)}
          className="shrink-0 flex items-center justify-center px-2.5 border border-slate-200/80 rounded-lg bg-slate-50 text-slate-500 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/5 hover:border-[#0B4A3D]/30 transition-colors cursor-pointer"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      )}
      {categoryKey && (
        <OptionsManagerModal
          key={manageOpen ? 'open' : 'closed'}
          categoryKey={categoryKey}
          label={label}
          open={manageOpen}
          onClose={() => setManageOpen(false)}
        />
      )}
      {open && createPortal(
        <div
          id={listId}
          role="listbox"
          aria-label={`${label} options`}
          onMouseDown={(e) => e.preventDefault()}
          className="fixed z-[9999] bg-surface border border-slate-200 rounded-lg shadow-xl overflow-y-auto"
          style={{
            left: pos?.left,
            width: pos?.width,
            top: pos?.top,
            maxHeight: pos?.maxHeight,
            display: pos ? 'block' : 'none'
          }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2.5 text-xs text-slate-500">
              {typed && trimmedQuery
                ? <>No matching {noun} — press <span className="font-bold text-slate-700">Enter</span> to use “{trimmedQuery}”</>
                : `No ${nounPlural} available`}
            </div>
          ) : (
            <>
              {filtered.map((opt, i) => (
                <div
                  key={opt}
                  role="option"
                  aria-selected={i === highlight}
                  onMouseDown={(e) => { e.preventDefault(); selectOption(opt); }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`px-3 py-2 text-xs border-b border-slate-100 last:border-b-0 cursor-pointer transition-colors ${
                    i === highlight ? 'bg-[#0B4A3D]/10 text-[#0B4A3D] font-semibold' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {opt}
                </div>
              ))}
              {typed && trimmedQuery && !exactMatch && (
                <div className="px-3 py-2 text-[11px] text-slate-500 bg-slate-50 border-t border-slate-100">
                  Press <span className="font-bold text-slate-700">Enter</span> to use “{trimmedQuery}”
                </div>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function AddLead() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  // Marketing Settings defaults (DB-backed): prefill Lead Source / Stage /
  // Priority / Owner with the administrator-configured defaults for new leads.
  useEffect(() => {
    let cancelled = false;
    marketingSettingsService
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        const ls = s?.leadSettings || {};
        setForm((prev) => ({
          ...prev,
          leadSource: prev.leadSource || ls.defaultLeadSource || '',
          stage: prev.stage || ls.defaultLeadStage || '',
          priority: prev.priority || ls.defaultLeadPriority || '',
          status: prev.status || ls.defaultLeadStatus || ''
        }));
      })
      .catch(() => { /* leave form as-is */ });
    return () => { cancelled = true; };
  }, []);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({ moduleKey: 'lead', setForm });
  // Real backend users for the Lead Owner dropdown (Edit Lead uses the same /users
  // API). Falls back to the ERP static list if the request fails.
  const [users, setUsers] = useState([]);
  const [geoOpen, setGeoOpen] = useState(false);
  // Re-render the geo selects — and the Industry combobox options below — when
  // options are managed. useDropdownVersion() re-renders this component, so the
  // inline list is always re-read from the source of truth.
  useDropdownVersion();
  // Predefined Industry options — the same source ManagedSelect read (ERP base
  // list + the existing management overlay). The Industry combobox only READS
  // this list; a custom typed industry is never added to it.
  const industryOptions = getFlatOptions('lead_industry')
    .filter((o) => o.enabled)
    .map((o) => o.value);

  // Country → State → City/Town, loaded from the Location Master API.
  const { options: geoCountries, loading: countriesLoading } = useGeoCountries();
  const { options: geoStates, loading: statesLoading } = useGeoStates(form.country);
  const {
    options: geoCitiesAll,
    loading: citiesLoading,
    error: citiesError
  } = useGeoCities(form.country, form.state);

  // City search filters the COMPLETE state list that is already loaded, so no
  // match is ever hidden by a server-side result cap.
  const [cityQuery, setCityQuery] = useState('');
  const cityNeedle = cityQuery.trim().toLowerCase();
  const geoCities = cityNeedle
    ? geoCitiesAll.filter((c) => String(c.value).toLowerCase().includes(cityNeedle))
    : geoCitiesAll;

  const geoCountryCurrent = form.country && !geoCountries.some((c) => c.value === form.country) ? form.country : null;
  const geoStateCurrent = form.state && !geoStates.some((s) => s.value === form.state) ? form.state : null;
  const geoCityCurrent = form.city && !geoCitiesAll.some((c) => c.value === form.city) ? form.city : null;

  useEffect(() => {
    let cancelled = false;
    leadService
      .getUsers()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.data ?? data?.users ?? [];
        const names = (Array.isArray(list) ? list : [])
          .map((u) => u?.name || u?.fullName || u?.email || '')
          .filter(Boolean);
        if (names.length > 0) {
          // Always keep the current default owner selectable.
          if (EMPTY_FORM.owner && !names.includes(EMPTY_FORM.owner)) {
            names.unshift(EMPTY_FORM.owner);
          }
          setUsers(names);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const ownerOptions = users.length > 0 ? users : LEAD_OWNERS;

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  // Changing a parent clears the children and the city filter, so a city from
  // another state can never remain selected.
  const onCountryChange = (value) => {
    setCityQuery('');
    setForm((prev) => ({ ...prev, country: value, state: '', city: '' }));
  };
  const onStateChange = (value) => {
    setCityQuery('');
    setForm((prev) => ({ ...prev, state: value, city: '' }));
  };

  const validate = () => {
    const next = {};
    if (!form.businessName.trim()) next.businessName = 'Business name is required';
    if (!form.contactPerson.trim()) next.contactPerson = 'Contact person is required';
    if (!form.phone.trim()) next.phone = 'Phone is required';
    else if (!PHONE_PATTERN.test(form.phone)) next.phone = 'Enter a valid phone number';
    if (!form.email.trim()) next.email = 'Email is required';
    else if (!EMAIL_PATTERN.test(form.email)) next.email = 'Enter a valid email address';
    if (!form.country) next.country = 'Country is required';
    if (form.expectedValue && !NUMERIC_PATTERN.test(form.expectedValue)) next.expectedValue = 'Enter a valid amount';
    if (form.secondaryEmail && !EMAIL_PATTERN.test(form.secondaryEmail)) next.secondaryEmail = 'Enter a valid email address';
    if (form.secondaryPhone && !PHONE_PATTERN.test(form.secondaryPhone)) next.secondaryPhone = 'Enter a valid phone number';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => {
    // Renames resolve back to the original ERP stage label; custom (non-enum)
    // stages pass through and are rejected honestly by the backend.
    const apiStage = form.stage ? stageToApiLabel(form.stage) : null;
    const stage = (apiStage && (STAGE_TO_BACKEND[apiStage] || apiStage)) || null;
    const payload = {
      // Real backend mappings (LeadRequest)
      leadName: form.contactPerson.trim() || form.businessName.trim(),
      companyName: form.businessName,
      businessName: form.businessName,
      designation: form.designation,
      phone: form.phone,
      email: form.email,
      estimatedValue: Number(form.expectedValue) || 0,
      leadSource: form.leadSource,
      assignedTo: form.owner || 'Admin',
      website: form.website,
      address: form.address,
      city: form.city,
      state: form.state,
      pincode: form.pincode,
      country: form.country,
      industry: form.industry,
      secondaryName: form.secondaryPerson,
      secondaryPhone: form.secondaryPhone,
      secondaryEmail: form.secondaryEmail,
      internalNotes: form.internalNotes,
      description: form.description,
      priority: form.priority || 'Medium',
      // The form's public "Notes" textarea is persisted by the backend
      // (LeadRequest.notes → applySubmittedNote). It was previously dropped
      // here, so a note typed on Create never reached the database.
      notes: form.notes
    };
    // Stage: send the backend enum value when a stage is selected.
    if (stage) payload.pipelineStage = stage;
    return payload;
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setAttachmentFiles([]);
    setErrors({});
  };

  // Attachments are staged here and uploaded only AFTER the lead exists, so no
  // file is ever stored without a parent record. The shared upload policy
  // (type allowlist, empty file, 2 GB per file) is applied at selection time.
  const handleFiles = (event) => {
    const all = Array.from(event.target.files || []);
    const files = all.filter((file) => {
      const err = getAttachmentSelectionError(file);
      if (err) {
        toast.warning(err.message);
        return false;
      }
      return true;
    });
    if (files.length > 0) setAttachmentFiles((prev) => [...prev, ...files]);
    event.target.value = '';
  };

  const removeFile = (index) =>
    setAttachmentFiles((prev) => prev.filter((_, i) => i !== index));

  const save = async (mode) => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await leadService.createLead(buildPayload());
      const created = res?.data ?? res ?? {};
      const leadId = created.id ?? created.leadId;
      if (leadId && attachmentFiles.length > 0) {
        const results = await Promise.all(
          attachmentFiles.map(async (file) => {
            const formData = new FormData();
            formData.append('file', file);
            try {
              await leadService.addAttachment(leadId, formData);
              return { ok: true, file };
            } catch (err) {
              return { ok: false, file, error: err };
            }
          })
        );
        const failed = results.filter((r) => !r.ok).length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
        if (failed > 0) toast.error(`${failed} attachment(s) failed to upload`);
      }
      toast.success('Lead created successfully');
      // Save & Continue: the backend has confirmed the lead (we are past the
      // await above), so open THAT lead's record page. Navigating to the list
      // here made the button behave like Save & Exit.
      if (mode === 'continue') navigate(leadId ? `/leads/${leadId}` : '/leads');
      else if (mode === 'new') resetForm();
      else if (mode === 'draft') navigate('/leads');
    } catch (err) {
      toast.error(err?.message || 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const sections = [
    {
      key: 'business',
      title: 'Business Information',
      icon: Building2,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Business Name" required error={errors.businessName}>
              <TextInput value={form.businessName} onChange={set('businessName')} error={!!errors.businessName} placeholder="Enter business name" />
            </FormField>
            <FormField label="Industry">
              <TypeableCombobox
                value={form.industry}
                onChange={(v) => setForm((prev) => ({ ...prev, industry: v }))}
                options={industryOptions}
                label="Lead Industry"
                categoryKey="lead_industry"
                placeholder="Select or type Industry"
                noun="industry"
                nounPlural="industries"
              />
            </FormField>
          </div>
          <FormField label="Website">
            <TextInput value={form.website} onChange={set('website')} placeholder="https://example.com" />
          </FormField>
        </div>
      )
    },
    {
      key: 'lead',
      title: 'Lead Information',
      icon: Info,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Lead Number" required>
              <TextInput value={form.leadNo} onChange={set('leadNo')} placeholder="Auto-generated" />
            </FormField>
            <FormField label="Lead Source">
              <ManagedSelect
                categoryKey="lead_source"
                label="Lead Source"
                value={form.leadSource}
                onChange={(v) => setForm((prev) => ({ ...prev, leadSource: v }))}
                placeholder="Select Lead Source"
              />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Expected Value (₹)" error={errors.expectedValue}>
              <TextInput type="number" min="0" value={form.expectedValue} onChange={set('expectedValue')} error={!!errors.expectedValue} placeholder="e.g. 500000" />
            </FormField>
            <FormField label="Expected Close Date">
              <TextInput type="date" value={form.expectedCloseDate} onChange={set('expectedCloseDate')} />
            </FormField>
          </div>
          <FormField label="Lead Description">
            <TextArea
              value={form.description}
              onChange={set('description')}
              rows={4}
              placeholder="Enter lead description"
            />
          </FormField>
        </div>
      )
    },
    {
      key: 'primary',
      title: 'Primary Contact',
      icon: User,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Contact Person" required error={errors.contactPerson}>
              <TextInput value={form.contactPerson} onChange={set('contactPerson')} error={!!errors.contactPerson} placeholder="Primary contact person" />
            </FormField>
            <FormField label="Phone" required error={errors.phone}>
              <TextInput value={form.phone} onChange={set('phone')} error={!!errors.phone} placeholder="+91-9876543210" />
            </FormField>
          </div>
          <FormField label="Email" required error={errors.email}>
            <TextInput type="email" value={form.email} onChange={set('email')} error={!!errors.email} placeholder="contact@example.com" />
          </FormField>
        </div>
      )
    },
    {
      key: 'secondary',
      title: 'Secondary Contact',
      icon: Users,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Contact Person">
              <TextInput value={form.secondaryPerson} onChange={set('secondaryPerson')} placeholder="Secondary contact person" />
            </FormField>
            <FormField label="Phone" error={errors.secondaryPhone}>
              <TextInput value={form.secondaryPhone} onChange={set('secondaryPhone')} error={!!errors.secondaryPhone} placeholder="+91-9876543210" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Email" error={errors.secondaryEmail}>
              <TextInput type="email" value={form.secondaryEmail} onChange={set('secondaryEmail')} error={!!errors.secondaryEmail} placeholder="secondary@example.com" />
            </FormField>
            <FormField label="Designation">
              <TextInput value={form.designation} onChange={set('designation')} placeholder="e.g. Manager" />
            </FormField>
          </div>
        </div>
      )
    },
    {
      key: 'address',
      title: 'Address',
      icon: MapPin,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Country" required error={errors.country}>
              <div className="flex items-stretch gap-1.5">
                <select
                  value={form.country || ''}
                  onChange={(e) => onCountryChange(e.target.value)}
                  className={`${INPUT_BASE} ${errors.country ? 'border-rose-400' : ''} cursor-pointer`}
                  aria-label="Country"
                >
                  {countriesLoading && geoCountries.length === 0 && <option value="">Loading countries…</option>}
                  {geoCountries.map((c) => (
                    <option key={c.value} value={c.value}>{c.value}</option>
                  ))}
                  {geoCountryCurrent && <option value={geoCountryCurrent} disabled>{geoCountryCurrent} (not in master)</option>}
                </select>
                <button
                  type="button"
                  title="Manage countries / states / cities"
                  onClick={() => setGeoOpen(true)}
                  className="shrink-0 flex items-center justify-center px-2.5 border border-slate-200/80 rounded-lg bg-slate-50 text-slate-500 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/5 transition-colors cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </FormField>
            <FormField label="State">
              <select
                value={form.state || ''}
                onChange={(e) => onStateChange(e.target.value)}
                disabled={!form.country}
                className={`${INPUT_BASE} cursor-pointer`}
                aria-label="State"
              >
                <option value="">{statesLoading ? 'Loading states…' : 'Select State'}</option>
                {geoStates.map((s) => (
                  <option key={s.value} value={s.value}>{s.value}</option>
                ))}
                {geoStateCurrent && <option value={geoStateCurrent} disabled>{geoStateCurrent} (disabled)</option>}
              </select>
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="City/Town">
              <div className="space-y-1.5">
                <input
                  type="text"
                  value={cityQuery}
                  onChange={(e) => setCityQuery(e.target.value)}
                  disabled={!form.state}
                  placeholder={form.state ? 'Search city / town…' : 'Select a state first'}
                  className={INPUT_BASE}
                  aria-label="Search city or town"
                />
                <select
                  value={form.city || ''}
                  onChange={set('city')}
                  disabled={!form.state || citiesLoading}
                  className={`${INPUT_BASE} cursor-pointer`}
                  aria-label="City/Town"
                >
                  <option value="">
                    {citiesLoading ? 'Loading cities…' : 'Select City'}
                  </option>
                  {geoCities.map((c) => (
                    <option key={c.id ?? c.value} value={c.value}>{c.value}</option>
                  ))}
                  {geoCityCurrent && <option value={geoCityCurrent} disabled>{geoCityCurrent} (not in master)</option>}
                </select>
                {citiesError ? (
                  <p className="text-[11px] text-rose-600">{citiesError}</p>
                ) : form.state && !citiesLoading && geoCities.length === 0 ? (
                  <p className="text-[11px] text-slate-500">
                    No cities/towns found{cityQuery.trim() ? ' for that search' : ' in the Location Master for this state'}.
                  </p>
                ) : form.state && !citiesLoading && geoCities.length > 0 ? (
                  <p className="text-[11px] text-slate-400">
                    {geoCities.length} cities/towns from the Location Master
                    {cityQuery.trim() ? ' matching your search' : ''}
                  </p>
                ) : null}
              </div>
            </FormField>
            <FormField label="Pincode">
              <TextInput value={form.pincode} onChange={set('pincode')} placeholder="Enter pincode" />
            </FormField>
          </div>
          <FormField label="Map No / Landmark">
            <TextInput value={form.mapNo} onChange={set('mapNo')} placeholder="Enter Map Number or Landmark" />
          </FormField>
          <FormField label="Address">
            <TextArea value={form.address} onChange={set('address')} rows={2} placeholder="Enter street address" />
          </FormField>
        </div>
      )
    },
    {
      key: 'assignment',
      title: 'Assignment',
      icon: UserCheck,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Lead Owner">
              <TypeableCombobox
                value={form.owner}
                onChange={(v) => setForm((prev) => ({ ...prev, owner: v }))}
                options={ownerOptions}
                label="Lead Owner"
                placeholder="Select or type Lead Owner"
                noun="user"
                nounPlural="users"
              />
            </FormField>
            <FormField label="Stage">
              <ManagedSelect
                categoryKey="lead_stage"
                label="Lead Stage"
                value={form.stage}
                onChange={(v) => setForm((prev) => ({ ...prev, stage: v }))}
                placeholder="Select Stage"
              />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Priority">
              <ManagedSelect
                categoryKey="lead_priority"
                label="Lead Priority"
                value={form.priority}
                onChange={(v) => setForm((prev) => ({ ...prev, priority: v }))}
                placeholder="Select Priority"
              />
            </FormField>
            <FormField label="Status">
              <ManagedSelect
                categoryKey="lead_status"
                label="Lead Status"
                value={form.status}
                onChange={(v) => setForm((prev) => ({ ...prev, status: v }))}
                placeholder="Select Status"
              />
            </FormField>
          </div>
        </div>
      )
    },
    {
      key: 'notes',
      title: 'Notes',
      icon: StickyNote,
      fields: (
        <FormField label="Notes">
          <TextArea
            value={form.notes}
            onChange={set('notes')}
            rows={4}
            placeholder="Enter notes, requirements, and any additional information about this lead..."
          />
        </FormField>
      )
    },
    {
      key: 'attachments',
      title: 'Attachments',
      icon: Paperclip,
      fields: (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-slate-200 rounded-lg py-6 flex flex-col items-center gap-2 text-slate-400 hover:border-emerald-500/50 hover:text-emerald-600 transition-colors cursor-pointer"
          >
            <Upload className="w-5 h-5" />
            <span className="text-xs font-semibold">Click to attach files</span>
            <span className="text-[11px] text-slate-400">
              PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file — uploaded after this lead is saved
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="hidden"
            onChange={handleFiles}
          />
          {attachmentFiles.length > 0 && (
            <div className="space-y-2">
              {attachmentFiles.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2"
                >
                  <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 truncate">{file.name}</p>
                    <p className="text-[10px] text-slate-400">{formatFileSize(file.size)}</p>
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
      )
    },
    {
      key: 'internal',
      title: 'Internal Information',
      icon: Settings,
      fields: (
        <FormField label="Internal Notes">
          <TextArea value={form.internalNotes} onChange={set('internalNotes')} rows={4} placeholder="Internal team notes" />
        </FormField>
      )
    }
  ];

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Leads</span>
        <span>&gt;</span>
        <span className="text-slate-600">New</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <User className="w-6 h-6 text-[#0B4A3D]" />
            Create New Lead
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); save('continue'); }}
        className="space-y-4"
      >
        {/* ERP two-column layout — Business | Lead, Primary Contact | Secondary Contact */}
        {[
          ['business', 'lead'],
          ['primary', 'secondary']
        ].map(([leftKey, rightKey]) => {
          const left = sections.find((s) => s.key === leftKey);
          const right = sections.find((s) => s.key === rightKey);
          if (!left || !right) return null;
          return (
            <div key={left.key} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Accordion title={left.title} icon={left.icon} defaultOpen>
                {left.fields}
              </Accordion>
              <Accordion title={right.title} icon={right.icon} defaultOpen>
                {right.fields}
              </Accordion>
            </div>
          );
        })}

        {/* ERP two-column layout — Address | Assignment + Notes (Notes directly below Assignment in the right column) */}
        {(() => {
          const address = sections.find((s) => s.key === 'address');
          const assignment = sections.find((s) => s.key === 'assignment');
          const notes = sections.find((s) => s.key === 'notes');
          if (!address || !assignment || !notes) return null;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Accordion title={address.title} icon={address.icon} defaultOpen>
                {address.fields}
              </Accordion>
              <div className="flex flex-col gap-4 min-w-0">
                <Accordion title={assignment.title} icon={assignment.icon} defaultOpen>
                  {assignment.fields}
                </Accordion>
                <Accordion title={notes.title} icon={notes.icon} defaultOpen>
                  {notes.fields}
                </Accordion>
              </div>
            </div>
          );
        })()}

        {/* ERP two-column layout — Attachments | Internal Information */}
        {(() => {
          const attachments = sections.find((s) => s.key === 'attachments');
          const internal = sections.find((s) => s.key === 'internal');
          if (!attachments || !internal) return null;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Accordion title={attachments.title} icon={attachments.icon} defaultOpen>
                {attachments.fields}
              </Accordion>
              <Accordion title={internal.title} icon={internal.icon} defaultOpen>
                {internal.fields}
              </Accordion>
            </div>
          );
        })()}

        {/* ERP standard creation action bar */}
        <CreationActionBar
          showBackToList={true}
          onBackToList={() => navigate('/leads')}
          onCancel={() => navigate('/leads')}
          onSaveDraft={() => save('draft')}
          onSaveNew={() => save('new')}
          onSave={() => save('continue')}
          saveLabel={submitting ? 'Saving...' : 'Save & Continue'}
          disabled={submitting}
        />
      </form>
      <GeoOptionsModal key={geoOpen ? 'open' : 'closed'} open={geoOpen} onClose={() => setGeoOpen(false)} />
    </div>
  );
}
