import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Contact2, Info, Loader2 } from 'lucide-react';
import {
  Accordion, CreationActionBar, FormField, SelectInput, TextInput, useToast
} from '../../components/Common';
import contactService from '../../services/contactService';
import leadService from '../../services/leadService';
import customerService from '../../services/customerService';
import { formatLeadNo } from '../../utils/leadHelpers';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const STATUS_OPTIONS = ['Active', 'Inactive', 'Archived'];
const TYPE_OPTIONS = ['Primary', 'Secondary'];

const EMPTY_FORM = {
  name: '',
  contactType: 'Primary',
  designation: '',
  phone: '',
  email: '',
  businessName: '',
  leadId: '',
  clientId: '',
  status: 'Active'
};

function parseList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.content)) return res.content;
  if (Array.isArray(res?.data?.content)) return res.data.content;
  return [];
}

/**
 * CRM → Create / Edit Contact.
 *
 * Writes through the real /contacts API (create or update), and keeps the
 * lead/client references as REAL ids: the pickers list live leads and clients,
 * and the backend verifies both rows exist before saving the relationship.
 *
 * A contact captured by the Lead form is editable here too — the lead and client
 * associations and the contact type are preserved, so editing a person never
 * breaks the lead → contact → client chain.
 */
export default function ContactFormPage() {
  const { id } = useParams();
  const editingId = id || null;
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  // Create mode: ?leadId= / ?clientId= deep links (from the Lead and Client
  // action menus) are read once, as the form's initial state — no effect and no
  // cascading render.
  const [form, setForm] = useState(() => ({
    ...EMPTY_FORM,
    leadId: editingId ? '' : (searchParams.get('leadId') || ''),
    clientId: editingId ? '' : (searchParams.get('clientId') || '')
  }));
  const [errors, setErrors] = useState({});
  const [leads, setLeads] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(Boolean(editingId));
  const [submitting, setSubmitting] = useState(false);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  // Real leads / clients for the association pickers (the same endpoints the
  // other CRM forms use). Best-effort: the form stays usable if a list is down.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await leadService.listCrm('leads', { page: 0, size: 200 });
        if (!cancelled) setLeads(parseList(res));
      } catch { /* picker is optional */ }
      try {
        const res = await customerService.list();
        if (!cancelled) setClients(parseList(res));
      } catch { /* picker is optional */ }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Edit: load the persisted contact (state is only set from the async
  // callbacks, never synchronously in the effect body).
  useEffect(() => {
    if (!editingId) return undefined;
    let cancelled = false;
    contactService
      .get(editingId)
      .then((res) => {
        if (cancelled) return;
        const c = res?.data ?? res ?? {};
        setForm({
          name: c.name || '',
          contactType: c.contactType || 'Primary',
          designation: c.designation || '',
          phone: c.phone || '',
          email: c.email || '',
          businessName: c.businessName || '',
          leadId: c.leadId != null ? String(c.leadId) : '',
          clientId: c.clientId != null ? String(c.clientId) : '',
          status: c.status || 'Active'
        });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load contact');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingId]);

  const selectedLead = useMemo(
    () => leads.find((l) => String(l.id) === String(form.leadId)),
    [leads, form.leadId]
  );

  const validate = () => {
    const next = {};
    if (!String(form.name || '').trim()) next.name = 'Contact name is required';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      next.email = 'Enter a valid email address';
    }
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error(Object.values(next)[0]);
      return false;
    }
    return true;
  };

  const save = async ({ stay = false } = {}) => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      const payload = {
        name: String(form.name).trim(),
        contactType: form.contactType || 'Primary',
        designation: form.designation?.trim() || null,
        phone: form.phone?.trim() || null,
        email: form.email?.trim() || null,
        businessName: form.businessName?.trim() || null,
        leadId: form.leadId ? Number(form.leadId) : null,
        clientId: form.clientId ? Number(form.clientId) : null,
        status: form.status || 'Active'
      };
      const res = editingId
        ? await contactService.update(editingId, payload)
        : await contactService.create(payload);
      const saved = res?.data ?? res ?? {};
      toast.success(editingId ? `${payload.name} updated` : `${payload.name} created`);
      if (stay) {
        setForm(EMPTY_FORM);
        setErrors({});
      } else if (saved.id) {
        navigate(`/contacts/${saved.id}`);
      } else {
        navigate('/contacts');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save contact');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>CRM</span>
        <span>&gt;</span>
        <span>Contacts</span>
        <span>&gt;</span>
        <span className="text-slate-600">{editingId ? 'Edit' : 'New'}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            {editingId ? 'Edit Contact' : 'Create Contact'}
          </h1>
          <div className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500 font-bold">*</span> are required
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/contacts')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to Contacts
        </button>
      </div>

      {loading ? (
        <div className="bg-surface border border-slate-200 rounded-xl p-10 text-center text-xs font-semibold text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading contact…
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save({}); }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
            <div className="lg:col-span-2 space-y-4">
              <Accordion title="Contact Details" icon={Contact2} defaultOpen>
                <div className="space-y-4">
                  <div className={GRID}>
                    <FormField label="Contact Name" required error={errors.name}>
                      <TextInput value={form.name} onChange={set('name')} error={!!errors.name} placeholder="Full name of the contact person" />
                    </FormField>
                    <FormField label="Contact Type" hint="Primary or secondary contact as captured on the lead">
                      <SelectInput value={form.contactType} onChange={set('contactType')}>
                        {TYPE_OPTIONS.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </SelectInput>
                    </FormField>
                    <FormField label="Designation">
                      <TextInput value={form.designation} onChange={set('designation')} placeholder="e.g. Purchase Manager" />
                    </FormField>
                    <FormField label="Business Name" hint={selectedLead ? 'Auto-filled from the selected lead' : undefined}>
                      <TextInput value={form.businessName} onChange={set('businessName')} placeholder="Business / company name" />
                    </FormField>
                    <FormField label="Phone">
                      <TextInput value={form.phone} onChange={set('phone')} placeholder="Phone number" />
                    </FormField>
                    <FormField label="Email" error={errors.email}>
                      <TextInput type="email" value={form.email} onChange={set('email')} error={!!errors.email} placeholder="name@company.com" />
                    </FormField>
                    <FormField label="Status">
                      <SelectInput value={form.status} onChange={set('status')}>
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </SelectInput>
                    </FormField>
                  </div>
                </div>
              </Accordion>
            </div>

            <div className="space-y-4">
              <Accordion title="Associations" icon={Info} defaultOpen>
                <div className="space-y-4">
                  <FormField label="Associated Lead" hint="Links this contact to a real lead record">
                    <SelectInput
                      value={form.leadId}
                      onChange={(e) => {
                        const value = e.target.value;
                        const lead = leads.find((l) => String(l.id) === String(value));
                        setForm((prev) => ({
                          ...prev,
                          leadId: value,
                          // Keep the business name in step with the chosen lead
                          // without overwriting a name the user typed in.
                          businessName: lead
                            ? (lead.businessName || lead.company || prev.businessName || '')
                            : prev.businessName
                        }));
                      }}
                    >
                      <option value="">No lead</option>
                      {leads.map((l) => (
                        <option key={l.id} value={l.id}>
                          {formatLeadNo(l.id)} — {l.businessName || l.company || l.name || ''}
                        </option>
                      ))}
                    </SelectInput>
                  </FormField>
                  <FormField label="Associated Client" hint="Set automatically when the lead converts; editable here">
                    <SelectInput value={form.clientId} onChange={set('clientId')}>
                      <option value="">No client</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.clientCode ? `${c.clientCode} — ` : ''}{c.businessName || c.name || ''}
                        </option>
                      ))}
                    </SelectInput>
                  </FormField>
                  <p className="text-[11px] text-slate-400">
                    A lead is not a client: leaving the client empty keeps this contact
                    lead-associated until the lead is converted.
                  </p>
                </div>
              </Accordion>
            </div>
          </div>

          <CreationActionBar
            showBackToList={false}
            onCancel={() => navigate('/contacts')}
            onSaveNew={!editingId ? () => save({ stay: true }) : null}
            onSave={() => save({})}
            saveLabel={editingId ? 'Save Changes' : 'Save Contact'}
            disabled={submitting}
          />
        </form>
      )}
    </div>
  );
}
