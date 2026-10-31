import { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { MAX_ATTACHMENT_SIZE_LABEL, getAttachmentSelectionError } from '../../utils/attachmentStorage';
import {
  useToast,
  Accordion,
  Modal,
  FormField,
  TextInput,
  TextArea,
  EditableMasterDropdown,
  GeoOptionsModal,
  CurrencyOptionsModal,
  CreationActionBar,
  INPUT_BASE
} from '../../components/Common';
import leadService from '../../services/leadService';
import customerService from '../../services/customerService';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import { notesDisplayText } from '../../utils/leadNotes';
import {
  ChevronLeft,
  Loader2,
  Paperclip,
  Upload,
  X,
  Plus,
  Link2,
  Search,
  Info,
  FileText,
  MapPin,
  Users,
  Truck,
  Settings,
  Landmark,
  Copy,
  Settings2,
} from 'lucide-react';
import {
  getEnabledCurrencies,
  getCurrencies,
  useDropdownVersion
} from '../../utils/dropdownManager';
import { useGeoCountries, useGeoStates, useGeoCities } from '../../hooks/useLocationMaster';

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;
const PHONE_PATTERN = /^[+\d][\d\s()-]{7,}$/;

// Master-managed client fields (Industry, Client Type, Tax Treatment, Sales
// Person, Category, Status, Payment Terms) mirror the original ERP client-create
// Add & Manage comboboxes. Options live in MySQL (master_values via /masters/{key})
// and are seeded to the exact ERP lists — the user can select, add, rename or
// delete values inline, exactly like the ERP comboboxes.
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
  businessName: '',
  contactPerson: '',
  industry: '',
  website: '',
  gstin: '',
  pan: '',
  clientType: '',
  taxTreatment: '',
  country: '',
  state: '',
  city: '',
  postalCode: '',
  mapNo: '',
  streetAddress: '',
  clientCode: '',
  alias: '',
  salesPerson: '',
  category: '',
  status: '',
  currency: 'INR',
  paymentTerms: '',
  creditLimit: '',
  email: '',
  phone: '',
  notes: '',
  bankName: '',
  accountHolderName: '',
  accountNumber: '',
  ifsc: '',
  branch: '',
  upiId: '',
  openingBalance: ''
};

/**
 * One shipping address card. Country → State → City options come from the SAME
 * Location Master API as the billing address, so every City/Town dropdown shows
 * the COMPLETE master of the selected state instead of the small baked-in
 * country list. Hooks are per card because each address can sit in a different
 * country/state.
 */
function ShippingAddressCard({ index, value, countries, onChange, onRemove, onCopyBilling }) {
  const { options: states, loading: statesLoading } = useGeoStates(value.country);
  const { options: cities, loading: citiesLoading } = useGeoCities(value.country, value.state);
  const countryCurrent = value.country && !countries.some((c) => c.value === value.country) ? value.country : null;
  const stateCurrent = value.state && !states.some((st) => st.value === value.state) ? value.state : null;
  const cityCurrent = value.city && !cities.some((c) => c.value === value.city) ? value.city : null;

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">Shipping Address #{index + 1}</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onCopyBilling}
            className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 border border-slate-200 px-2 py-1 rounded hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Copy className="w-3 h-3" /> Copy Billing
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-rose-500 hover:text-rose-700 transition-colors cursor-pointer"
            aria-label={`Remove shipping address ${index + 1}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div className={GRID}>
        <FormField label="Country">
          <select
            value={value.country || ''}
            onChange={(e) => onChange('country', e.target.value)}
            className={`${INPUT_BASE} cursor-pointer`}
            aria-label={`Shipping country ${index + 1}`}
          >
            <option value="">Select Country</option>
            {countries.map((c) => (
              <option key={c.value} value={c.value}>{c.value}</option>
            ))}
            {countryCurrent && (
              <option value={countryCurrent} disabled>{countryCurrent} (disabled)</option>
            )}
          </select>
        </FormField>
        <FormField label="State">
          <select
            value={value.state || ''}
            onChange={(e) => onChange('state', e.target.value)}
            disabled={!value.country}
            className={`${INPUT_BASE} cursor-pointer`}
            aria-label={`Shipping state ${index + 1}`}
          >
            <option value="">{statesLoading ? 'Loading states…' : 'Select State'}</option>
            {states.map((st) => (
              <option key={st.value} value={st.value}>{st.value}</option>
            ))}
            {stateCurrent && (
              <option value={stateCurrent} disabled>{stateCurrent} (disabled)</option>
            )}
          </select>
        </FormField>
      </div>
      <div className={GRID}>
        <FormField label="City">
          <select
            value={value.city || ''}
            onChange={(e) => onChange('city', e.target.value)}
            disabled={!value.state}
            className={`${INPUT_BASE} cursor-pointer`}
            aria-label={`Shipping city ${index + 1}`}
          >
            <option value="">{citiesLoading ? 'Loading cities…' : 'Select City'}</option>
            {cities.map((c) => (
              <option key={c.value} value={c.value}>{c.value}</option>
            ))}
            {cityCurrent && (
              <option value={cityCurrent} disabled>{cityCurrent} (disabled)</option>
            )}
          </select>
        </FormField>
        <FormField label="Postal Code">
          <TextInput
            value={value.postal}
            onChange={(e) => onChange('postal', e.target.value)}
            placeholder="Postal code"
          />
        </FormField>
      </div>
      <FormField label="Street Address">
        <TextArea
          value={value.street}
          onChange={(e) => onChange('street', e.target.value)}
          rows={2}
          placeholder="Street address"
        />
      </FormField>
    </div>
  );
}

export default function AddClient() {
  const navigate = useNavigate();
  const toast = useToast();
  const fileInputRef = useRef(null);
  const { id } = useParams();
  const editingId = id ? Number(id) : null;
  // Lead actions menu deep-link (Convert to Client): ?leadId=<id> pre-fills the
  // client form from the lead's stored details.
  const [searchParams] = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const returnTo = searchParams.get('returnTo');

  const [form, setForm] = useState(EMPTY_FORM);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({ moduleKey: 'client', setForm, enabled: !editingId });
  const [contacts, setContacts] = useState([]);
  const [shippingAddresses, setShippingAddresses] = useState([]);
  const [attachmentFiles, setAttachmentFiles] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(!!editingId);

  // Link Contact modal (ERP: "Link Existing Contact")
  const [linkOpen, setLinkOpen] = useState(false);
  const [contactPool, setContactPool] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [selectedContactIds, setSelectedContactIds] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [geoOpen, setGeoOpen] = useState(false);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  // Re-render the managed option lists (currency) when they change.
  useDropdownVersion();

  // Country → State → City/Town come from the centralized Location Master API
  // (MySQL), like the Lead form — never from the small baked-in country JSON, so
  // every City/Town dropdown lists the COMPLETE master of the selected state.
  const { options: geoCountries } = useGeoCountries();
  const { options: statesForCountry, loading: statesLoading } = useGeoStates(form.country);
  const { options: citiesForState, loading: citiesLoading } = useGeoCities(form.country, form.state);
  const geoCountryCurrent = form.country && !geoCountries.some((c) => c.value === form.country) ? form.country : null;
  const geoStateCurrent = form.state && !statesForCountry.some((s) => s.value === form.state) ? form.state : null;
  const geoCityCurrent = form.city && !citiesForState.some((c) => c.value === form.city) ? form.city : null;
  const currencies = getEnabledCurrencies();
  const currencyCurrent = form.currency && !currencies.some((c) => c.code === form.currency) ? form.currency : null;
  const allCurrencies = getCurrencies();
  const currencyLabel = (code) => {
    const c = allCurrencies.find((x) => x.code === code);
    return c ? `${c.symbol} ${c.code} - ${c.name}` : code;
  };

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  const setVal = (key) => (v) => setForm((prev) => ({ ...prev, [key]: v }));

  // ---- Edit mode: load the real customer from /customers/{id} -------------
  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await customerService.get(editingId);
        if (cancelled) return;
        const c = res?.data ?? res ?? {};
        setForm({
          businessName: c.businessName || '',
          contactPerson: c.contactPerson || '',
          industry: c.industry || '',
          website: c.website || '',
          gstin: c.gstin || '',
          pan: c.pan || '',
          clientType: c.clientType || '',
          taxTreatment: c.taxTreatment || '',
          country: c.country || '',
          state: c.billingState || '',
          city: c.billingCity || '',
          postalCode: c.billingPin || '',
          mapNo: c.mapNo || '',
          streetAddress: c.billingAddress || '',
          clientCode: c.clientCode || '',
          alias: c.alias || '',
          salesPerson: c.salesPerson || '',
          category: c.category || '',
          status: c.status || '',
          currency: c.currency || 'INR',
          paymentTerms: c.paymentTerms || '',
          creditLimit: c.creditLimit != null ? String(c.creditLimit) : '',
          email: c.email || '',
          phone: c.phone || '',
          notes: c.notes || '',
          bankName: c.bankName || '',
          accountHolderName: c.accountHolderName || '',
          accountNumber: c.accountNumber || '',
          ifsc: c.ifsc || '',
          branch: c.branch || '',
          upiId: c.upiId || '',
          openingBalance: c.openingBalance != null ? String(c.openingBalance) : ''
        });
        setContacts(
          Array.isArray(c.contacts)
            ? c.contacts.map((x) => ({ name: x.name || '', email: x.email || '', phone: x.phone || '', designation: x.designation || '' }))
            : []
        );
        setShippingAddresses(
          Array.isArray(c.shippingAddresses)
            ? c.shippingAddresses.map((s) => ({ country: s.country || '', state: s.state || '', city: s.city || '', postal: s.postal || '', street: s.street || '' }))
            : []
        );
      } catch (err) {
        if (cancelled) return;
        toast.error(err?.message || 'Failed to load client');
        navigate('/clients');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, navigate, toast]);

  // ---- Cascading Country / State / City (managed ERP geo tree) ------------
  const onCountryChange = (value) => {
    setForm((prev) => ({ ...prev, country: value, state: '', city: '' }));
  };
  const onStateChange = (value) => {
    setForm((prev) => ({ ...prev, state: value, city: '' }));
  };

  // ---- Convert to Client: pre-fill from the source lead --------------------
  useEffect(() => {
    if (!prefillLeadId || editingId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await leadService.getLead(prefillLeadId);
        if (cancelled) return;
        const d = res?.data ?? res ?? {};
        setForm((prev) => ({
          ...prev,
          businessName: d.businessName || d.company || d.name || '',
          contactPerson: d.contactPerson || d.name || '',
          industry: d.industry || '',
          website: d.website || '',
          gstin: d.gstin || d.gst || '',
          pan: d.pan || '',
          country: d.country || '',
          state: d.state || '',
          city: d.city || '',
          postalCode: d.pincode || d.pin || '',
          streetAddress: d.address || '',
          email: d.email || '',
          phone: d.phone || d.mobile || '',
          // The source lead's notes column can carry a legacy CRM metadata
          // envelope: prefill the client's Notes with the written text only.
          notes: notesDisplayText(d.internalNotes) || d.notes || '',
          salesPerson: d.owner || d.assignedTo || prev.salesPerson
        }));
      } catch {
        // prefill is best-effort; the form remains fully editable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillLeadId, editingId]);

  // ---- Link Contact modal --------------------------------------------------
  const openLinkModal = async () => {
    setLinkOpen(true);
    setContactSearch('');
    setSelectedContactIds([]);
    setLoadingContacts(true);
    try {
      const res = await leadService.listCrm('contacts', { page: 0, size: 200 });
      const rows = res?.content || res?.data?.content || res?.rows || res?.data?.rows || [];
      setContactPool(Array.isArray(rows) ? rows : []);
    } catch {
      setContactPool([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const filteredContacts = contactPool.filter((c) => {
    const q = contactSearch.trim().toLowerCase();
    if (!q) return true;
    const haystack = [c.leadName, c.name, c.firstName, c.phone, c.email, c.designation, c.role]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });

  const isContactLinked = (c) => {
    const name = c.leadName || c.name || c.firstName || '';
    const phone = c.phone || '';
    const email = c.email || '';
    return contacts.some(
      (lc) => (email && lc.email === email) || (phone && lc.phone === phone && name && lc.name === name)
    );
  };

  const toggleContact = (id) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const linkSelectedContacts = () => {
    const chosen = contactPool.filter((c, i) => selectedContactIds.includes(i));
    if (chosen.length === 0) return;
    const fresh = chosen
      .filter((c) => !isContactLinked(c))
      .map((c) => ({
        name: c.leadName || c.name || c.firstName || '',
        email: c.email || '',
        phone: c.phone || '',
        designation: c.designation || c.role || '',
        // The REAL contact id this row came from. It travels with the payload so
        // the backend can link the very same contact record to this client
        // instead of storing a copy — one person, one contact row.
        sourceContactId: c.id ?? null
      }));
    setContacts((prev) => [...prev, ...fresh]);
    setLinkOpen(false);
  };

  const removeContact = (index) => setContacts((prev) => prev.filter((_, i) => i !== index));

  // ---- Shipping address cards -----------------------------------------------
  const addShipping = () => {
    setShippingAddresses((prev) => [...prev, { country: '', state: '', city: '', postal: '', street: '' }]);
  };

  const updateShipping = (index, key, value) => {
    setShippingAddresses((prev) =>
      prev.map((s, i) => {
        if (i !== index) return s;
        if (key === 'country') return { ...s, country: value, state: '', city: '' };
        if (key === 'state') return { ...s, state: value, city: '' };
        return { ...s, [key]: value };
      })
    );
  };

  const copyBillingToShipping = (index) => {
    setShippingAddresses((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              country: form.country,
              state: form.state,
              city: form.city,
              postal: form.postalCode,
              street: form.streetAddress
            }
          : s
      )
    );
  };

  const removeShipping = (index) =>
    setShippingAddresses((prev) => prev.filter((_, i) => i !== index));

  // ---- Attachments ------------------------------------------------------------
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

  // ---- Validation + submit -----------------------------------------------------
  const validate = () => {
    const next = {};
    if (!form.businessName.trim()) next.businessName = 'Business name is required';
    if (!form.currency) next.currency = 'Currency is required';
    if (form.email && !EMAIL_PATTERN.test(form.email)) next.email = 'Enter a valid email address';
    if (form.phone && !PHONE_PATTERN.test(form.phone)) next.phone = 'Enter a valid phone number';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Legacy guard: the customers table + Clients list always store capitalized
  // statuses, and the Status dropdown is now a capitalized master list. This map
  // only re-capitalizes any lowercase value written by older clients, so it must
  // be kept even though new rows never go through it.
  const STATUS_TO_CAPITALIZED = {
    new: 'New',
    active: 'Active',
    inactive: 'Inactive',
    converted: 'Converted',
    archived: 'Archived'
  };

  const buildPayload = () => ({
    // Real CustomerRequest shape — persisted to the `customers` table via /customers.
    businessName: form.businessName.trim(),
    clientCode: form.clientCode.trim() || undefined,
    alias: form.alias.trim(),
    contactPerson: form.contactPerson.trim(),
    email: form.email.trim(),
    phone: form.phone.trim(),
    gstin: form.gstin.trim(),
    pan: form.pan.trim(),
    billingAddress: form.streetAddress,
    billingCity: form.city,
    billingState: form.state,
    billingPin: form.postalCode,
    shippingAddress: shippingAddresses[0]?.street || '',
    shippingCity: shippingAddresses[0]?.city || '',
    shippingState: shippingAddresses[0]?.state || '',
    shippingPin: shippingAddresses[0]?.postal || '',
    country: form.country || 'India',
    paymentTerms: form.paymentTerms,
    creditLimit: form.creditLimit ? Number(form.creditLimit) : undefined,
    salesPerson: form.salesPerson || 'Admin User',
    category: form.category,
    status: STATUS_TO_CAPITALIZED[form.status] || form.status || undefined,
    notes: form.notes,
    industry: form.industry,
    website: form.website,
    clientType: form.clientType,
    taxTreatment: form.taxTreatment,
    mapNo: form.mapNo,
    currency: form.currency || 'INR',
    bankName: form.bankName,
    accountHolderName: form.accountHolderName,
    accountNumber: form.accountNumber,
    ifsc: form.ifsc,
    branch: form.branch,
    upiId: form.upiId,
    openingBalance: form.openingBalance ? Number(form.openingBalance) : undefined,
    contacts: contacts.map((c) => ({
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      designation: c.designation || ''
    })),
    // CRM Contacts integration: when this client is created from a lead
    // ("Convert to Client"), the lead's captured contacts are linked to the new
    // client instead of being duplicated, and any contact picked from the
    // Contacts module is linked by its real id.
    leadId: prefillLeadId ? Number(prefillLeadId) : null,
    linkedContactIds: [...new Set(contacts.map((c) => c.sourceContactId).filter(Boolean))],
    shippingAddresses: shippingAddresses.map((s) => ({
      country: s.country,
      state: s.state,
      city: s.city,
      postal: s.postal,
      street: s.street
    }))
  });

  // Upload selected attachments to the real /customers/{id}/attachments endpoint.
  const uploadAttachments = async (clientId) => {
    for (const file of attachmentFiles) {
      const formData = new FormData();
      formData.append('file', file);
      await customerService.addAttachment(clientId, formData);
    }
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setContacts([]);
    setShippingAddresses([]);
    setAttachmentFiles([]);
    setErrors({});
  };

  const save = async (mode, forceDuplicate = false) => {
    if (!validate()) return;

    // Duplicate detection before creating (skipped on edit, or when user confirms force)
    if (!editingId && !forceDuplicate) {
      try {
        const dupRes = await customerService.checkDuplicate({
          businessName: form.businessName || '',
          gstin: form.gstin || '',
          pan: form.pan || ''
        });
        const matches = dupRes?.data ?? dupRes ?? [];
        if (Array.isArray(matches) && matches.length > 0) {
          const msg = matches.map((m) => m.message).join('\n');
          if (!window.confirm('Potential duplicate(s) found:\n\n' + msg + '\n\nCreate anyway?')) {
            return;
          }
        }
      } catch {
        // Duplicate check is best-effort; proceed if it fails
      }
    }

    setSubmitting(true);
    try {
      const payload = buildPayload();
      const res = editingId
        ? await customerService.update(editingId, payload)
        : await customerService.create(payload);
      const created = res?.data ?? res ?? {};
      const savedId = editingId || created.id;
      if (attachmentFiles.length > 0 && savedId) {
        try {
          await uploadAttachments(savedId);
        } catch {
          toast.error('Client saved, but one or more attachments failed to upload');
        }
      }
      toast.success(editingId ? 'Client updated successfully' : 'Client created successfully');
      if (returnTo && savedId) {
        // Return to the originating form (e.g. CPR) with the new client ID so
        // it can auto-select and auto-fill the newly created client.
        navigate(`${returnTo}?clientId=${savedId}`);
      } else if (mode === 'continue') {
        // Save & Continue: open THIS client's record page after the confirmed
        // save (edit mode re-opens the same id — never a duplicate).
        navigate(savedId ? `/clients/${savedId}` : '/clients');
      } else if (mode === 'new') resetForm();
      // 'draft' keeps the form populated (ERP keeps it for editing)
    } catch (err) {
      toast.error(err?.message || 'Failed to save client');
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Sections (exact ERP order + content) ---------------------------------
  const sections = [
    {
      key: 'business',
      title: 'Business Information',
      icon: Info,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Business Name" required error={errors.businessName}>
              <TextInput value={form.businessName} onChange={set('businessName')} error={!!errors.businessName} placeholder="Enter business name" />
            </FormField>
            <FormField label="Contact Person">
              <TextInput value={form.contactPerson} onChange={set('contactPerson')} placeholder="Primary contact person" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Client Industry">
              <EditableMasterDropdown
                masterKey="client_industries"
                value={form.industry}
                onChange={setVal('industry')}
                placeholder="Type or select industry..."
                allowDisable
              />
            </FormField>
            <FormField label="Website">
              <TextInput value={form.website} onChange={set('website')} placeholder="https://example.com" />
            </FormField>
          </div>
        </div>
      )
    },
    {
      key: 'tax',
      title: 'Tax Information',
      icon: FileText,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Business GSTIN">
              <TextInput value={form.gstin} onChange={set('gstin')} placeholder="Enter GSTIN (e.g. 27AABCU1234D1Z5)" />
            </FormField>
            <FormField label="Business PAN Number">
              <TextInput value={form.pan} onChange={set('pan')} placeholder="Enter PAN number" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Client Type">
              <EditableMasterDropdown
                masterKey="client_types"
                value={form.clientType}
                onChange={setVal('clientType')}
                placeholder="Type or select client type..."
                allowDisable
              />
            </FormField>
            <FormField label="Tax Treatment">
              <EditableMasterDropdown
                masterKey="tax_treatments"
                value={form.taxTreatment}
                onChange={setVal('taxTreatment')}
                placeholder="Type or select tax treatment..."
                allowDisable
              />
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
            <FormField label="Country">
              <div className="flex items-stretch gap-1.5">
                <select
                  value={form.country || ''}
                  onChange={(e) => onCountryChange(e.target.value)}
                  className={`${INPUT_BASE} cursor-pointer`}
                  aria-label="Country"
                >
                  <option value="">Select Country</option>
                  {geoCountries.map((c) => (
                    <option key={c.value} value={c.value}>{c.value}</option>
                  ))}
                  {geoCountryCurrent && <option value={geoCountryCurrent} disabled>{geoCountryCurrent} (disabled)</option>}
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
            <FormField label="State / Province">
              <select
                value={form.state || ''}
                onChange={(e) => onStateChange(e.target.value)}
                disabled={!form.country}
                className={`${INPUT_BASE} cursor-pointer`}
                aria-label="State / Province"
              >
                <option value="">{statesLoading ? 'Loading states…' : 'Select State'}</option>
                {statesForCountry.map((s) => (
                  <option key={s.value} value={s.value}>{s.value}</option>
                ))}
                {geoStateCurrent && <option value={geoStateCurrent} disabled>{geoStateCurrent} (disabled)</option>}
              </select>
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="City/Town">
              <select
                value={form.city || ''}
                onChange={set('city')}
                disabled={!form.state}
                className={`${INPUT_BASE} cursor-pointer`}
                aria-label="City/Town"
              >
                <option value="">{citiesLoading ? 'Loading cities…' : 'Select City'}</option>
                {citiesForState.map((c) => (
                  <option key={c.value} value={c.value}>{c.value}</option>
                ))}
                {geoCityCurrent && <option value={geoCityCurrent} disabled>{geoCityCurrent} (disabled)</option>}
              </select>
            </FormField>
            <FormField label="Postal Code / Zip Code">
              <TextInput value={form.postalCode} onChange={set('postalCode')} placeholder="Enter postal code" />
            </FormField>
          </div>
          <FormField label="Map No">
            <TextInput value={form.mapNo} onChange={set('mapNo')} placeholder="Enter Map Number" />
          </FormField>
          <FormField label="Street Address">
            <TextArea value={form.streetAddress} onChange={set('streetAddress')} rows={2} placeholder="Enter street address" />
          </FormField>
        </div>
      )
    },
    {
      key: 'contacts',
      title: 'Linked Contacts',
      icon: Users,
      fields: (
        <div className="space-y-3">
          <button
            type="button"
            onClick={openLinkModal}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            <Link2 className="w-3.5 h-3.5" /> Link Contact
          </button>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 font-bold">Name</th>
                  <th className="px-3 py-2 font-bold">Email</th>
                  <th className="px-3 py-2 font-bold">Phone</th>
                  <th className="px-3 py-2 font-bold">Designation</th>
                  <th className="px-3 py-2 font-bold">Action</th>
                </tr>
              </thead>
              <tbody>
                {contacts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-slate-400">No contacts linked</td>
                  </tr>
                )}
                {contacts.map((c, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-semibold text-slate-700">{c.name}</td>
                    <td className="px-3 py-2 text-slate-500">{c.email || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{c.phone || '—'}</td>
                    <td className="px-3 py-2 text-slate-500">{c.designation || '—'}</td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeContact(i)} className="text-rose-500 hover:text-rose-700 cursor-pointer">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Modal
            open={linkOpen}
            onClose={() => setLinkOpen(false)}
            title="Link Existing Contact"
            maxWidth="max-w-2xl"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => navigate('/leads/new')}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Contact
                </button>
                <button
                  type="button"
                  onClick={() => setLinkOpen(false)}
                  className="text-xs font-bold text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={linkSelectedContacts}
                  disabled={selectedContactIds.length === 0}
                  className="flex items-center gap-1.5 bg-[#0B4A3D] hover:bg-[#083D34] text-white text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Link2 className="w-3.5 h-3.5" /> Link Selected
                </button>
              </>
            }
          >
            <div className="relative mb-3">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                placeholder="Search contacts by name, phone or email..."
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500/40"
              />
            </div>
            {loadingContacts ? (
              <p className="text-xs text-slate-400 py-8 text-center">Loading contacts...</p>
            ) : filteredContacts.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-500">No contacts found</p>
                <p className="text-xs text-slate-400 mt-1">Create a contact first.</p>
              </div>
            ) : (
              <div className="overflow-y-auto max-h-72 border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase tracking-wide sticky top-0">
                    <tr>
                      <th className="px-3 py-2 font-bold w-8" />
                      <th className="px-3 py-2 font-bold">Name</th>
                      <th className="px-3 py-2 font-bold">Phone</th>
                      <th className="px-3 py-2 font-bold">Email</th>
                      <th className="px-3 py-2 font-bold">Designation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContacts.map((c, i) => {
                      const poolIdx = contactPool.indexOf(c);
                      const linked = isContactLinked(c);
                      return (
                        <tr key={i} className={`border-t border-slate-100 ${linked ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedContactIds.includes(poolIdx)}
                              disabled={linked}
                              onChange={() => toggleContact(poolIdx)}
                              className="accent-emerald-700"
                            />
                          </td>
                          <td className="px-3 py-2 font-semibold text-slate-700">
                            {c.leadName || c.name || c.firstName || '-'}
                          </td>
                          <td className="px-3 py-2 text-slate-500">{c.phone || '-'}</td>
                          <td className="px-3 py-2 text-slate-500">{c.email || '-'}</td>
                          <td className="px-3 py-2 text-slate-500">{c.designation || c.role || '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Modal>
        </div>
      )
    },
    {
      key: 'shipping',
      title: 'Shipping Details',
      icon: Truck,
      fields: (
        <div className="space-y-3">
          {shippingAddresses.map((s, i) => (
            <ShippingAddressCard
              key={i}
              index={i}
              value={s}
              countries={geoCountries}
              onChange={(key, v) => updateShipping(i, key, v)}
              onRemove={() => removeShipping(i)}
              onCopyBilling={() => copyBillingToShipping(i)}
            />
          ))}
          <button
            type="button"
            onClick={addShipping}
            className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 border border-emerald-200 bg-emerald-50 px-3 py-2 rounded-lg hover:bg-emerald-100 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Shipping Detail
          </button>
        </div>
      )
    },
    {
      key: 'additional',
      title: 'Additional Details',
      icon: Settings,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Client Code">
              <TextInput value={form.clientCode} onChange={set('clientCode')} placeholder="Auto-generated C-XXXXXX, or enter manually" />
            </FormField>
            <FormField label="Business Alias">
              <TextInput value={form.alias} onChange={set('alias')} placeholder="Alias (optional)" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Sales Person">
              <EditableMasterDropdown
                masterKey="sales_persons"
                value={form.salesPerson}
                onChange={setVal('salesPerson')}
                placeholder="Type or select sales person..."
                allowDisable
              />
            </FormField>
            <FormField label="Category">
              <EditableMasterDropdown
                masterKey="client_categories"
                value={form.category}
                onChange={setVal('category')}
                placeholder="Type or select category..."
                allowDisable
              />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Status">
              <EditableMasterDropdown
                masterKey="client_statuses"
                value={form.status}
                onChange={setVal('status')}
                placeholder="Type or select status..."
                allowDisable
              />
            </FormField>
            <FormField label="Currency" required error={errors.currency}>
              <div className="flex items-stretch gap-1.5">
                <select
                  value={form.currency || ''}
                  onChange={set('currency')}
                  className={`${INPUT_BASE} ${errors.currency ? 'border-rose-400' : ''} cursor-pointer`}
                  aria-label="Currency"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.symbol} {c.code} - {c.name}
                    </option>
                  ))}
                  {currencyCurrent && (
                    <option value={currencyCurrent} disabled>
                      {currencyLabel(currencyCurrent)} (disabled)
                    </option>
                  )}
                </select>
                <button
                  type="button"
                  title="Manage currencies"
                  onClick={() => setCurrencyOpen(true)}
                  className="shrink-0 flex items-center justify-center px-2.5 border border-slate-200/80 rounded-lg bg-slate-50 text-slate-500 hover:text-[#0B4A3D] hover:bg-[#0B4A3D]/5 transition-colors cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Payment Terms">
              <EditableMasterDropdown
                masterKey="client_payment_terms"
                value={form.paymentTerms}
                onChange={setVal('paymentTerms')}
                placeholder="Type or select payment terms..."
                allowDisable
              />
            </FormField>
            <FormField label="Credit Limit">
              <TextInput value={form.creditLimit} onChange={set('creditLimit')} placeholder="e.g. 500000" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Email" error={errors.email}>
              <TextInput type="email" value={form.email} onChange={set('email')} error={!!errors.email} placeholder="client@example.com" />
            </FormField>
            <FormField label="Phone Number" error={errors.phone}>
              <TextInput value={form.phone} onChange={set('phone')} error={!!errors.phone} placeholder="+91-9876543210" />
            </FormField>
          </div>
          <FormField label="Notes">
            <TextArea value={form.notes} onChange={set('notes')} rows={3} placeholder="Internal notes about this client" />
          </FormField>
        </div>
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
            <span className="text-xs font-semibold">
              Drag & drop files or <span className="text-emerald-600 underline underline-offset-2">browse</span>
            </span>
            <span className="text-[10px] text-slate-400">PDF, DOCX, XLSX, PNG, JPG up to {MAX_ATTACHMENT_SIZE_LABEL} per file</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
            onChange={handleFiles}
          />
          {attachmentFiles.length > 0 && (
            <div className="space-y-2">
              {attachmentFiles.map((file, index) => (
                <div key={`${file.name}-${index}`} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
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
      )
    },
    {
      key: 'account',
      title: 'Account Details',
      icon: Landmark,
      fields: (
        <div className="space-y-4">
          <div className={GRID}>
            <FormField label="Bank Name">
              <TextInput value={form.bankName} onChange={set('bankName')} placeholder="e.g. HDFC Bank" />
            </FormField>
            <FormField label="Account Holder Name">
              <TextInput value={form.accountHolderName} onChange={set('accountHolderName')} placeholder="e.g. John Doe" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Account Number">
              <TextInput value={form.accountNumber} onChange={set('accountNumber')} placeholder="Enter account number" />
            </FormField>
            <FormField label="IFSC Code">
              <TextInput value={form.ifsc} onChange={set('ifsc')} placeholder="e.g. HDFC0001234" />
            </FormField>
          </div>
          <div className={GRID}>
            <FormField label="Branch">
              <TextInput value={form.branch} onChange={set('branch')} placeholder="Enter branch name" />
            </FormField>
            <FormField label="UPI ID (Account)">
              <TextInput value={form.upiId} onChange={set('upiId')} placeholder="e.g. name@upi" />
            </FormField>
          </div>
          <FormField label="Opening Balance">
            <TextInput type="number" min="0" value={form.openingBalance} onChange={set('openingBalance')} placeholder="0.00" />
          </FormField>
        </div>
      )
    }
  ];

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Clients</span>
        <span>&gt;</span>
        <span className="text-slate-600">{editingId ? 'Edit' : 'New'}</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{editingId ? 'Edit Client' : 'Create New Client'}</h1>
          <p className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Fields marked with <span className="text-rose-500 font-bold">*</span> are required
          </p>
        </div>
          <button
            onClick={() => navigate(returnTo || '/clients')}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> {returnTo ? 'Back to CPR' : 'Back to Clients'}
          </button>
      </div>

      {loading ? (
        <div className="bg-surface border border-slate-200 rounded-xl p-10 text-center text-xs font-semibold text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" /> Loading client…
        </div>
      ) : (
      <form
        onSubmit={(e) => { e.preventDefault(); save('continue'); }}
        className="space-y-4"
      >
        {/* ERP two-column layout — Business Information | Tax Information */}
        {(() => {
          const business = sections.find((s) => s.key === 'business');
          const tax = sections.find((s) => s.key === 'tax');
          if (!business || !tax) return null;
          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <Accordion title={business.title} icon={business.icon} defaultOpen>
                {business.fields}
              </Accordion>
              <Accordion title={tax.title} icon={tax.icon} defaultOpen>
                {tax.fields}
              </Accordion>
            </div>
          );
        })()}
        {/* Remaining sections full-width below — Address, Linked Contacts, Shipping Details, etc. */}
        {sections
          .filter((section) => section.key !== 'business' && section.key !== 'tax')
          .map((section) => (
            <Accordion key={section.key} title={section.title} icon={section.icon} defaultOpen>
              {section.fields}
            </Accordion>
          ))}

        {/* ERP standard creation action bar */}
        <CreationActionBar
          showBackToList={false}
          onCancel={() => navigate(returnTo || '/clients')}
          onSaveDraft={() => save('draft')}
          onSaveNew={() => save('new')}
          onSave={() => save('continue')}
          saveLabel={submitting ? 'Saving...' : 'Save & Continue'}
          disabled={submitting}
        />
      </form>
      )}
      {/* The keys force a remount when a modal opens/closes, but they must be
          UNIQUE among siblings: two modals both keyed "closed" collided and React
          warned about duplicate keys. Prefixing keeps the remount behaviour. */}
      <GeoOptionsModal key={`geo-${geoOpen ? 'open' : 'closed'}`} open={geoOpen} onClose={() => setGeoOpen(false)} />
      <CurrencyOptionsModal key={`currency-${currencyOpen ? 'open' : 'closed'}`} open={currencyOpen} onClose={() => setCurrencyOpen(false)} />
    </div>
  );
}
