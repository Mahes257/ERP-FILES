/**
 * purchase/components/VendorForm.jsx
 * ------------------------------------------------------------------
 * Shared create / edit form for the Vendor Management module.
 *
 * Mirrors the master Purchase Requisition form (RequisitionForm.jsx)
 * architecture exactly:
 *   Desktop → left: vendor details accordion + two-column section
 *             cards · right: sticky summary
 *   Tablet  → two-column cards collapse to one column, summary
 *             stacks below the form
 *   Mobile  → single column
 *
 * Sections: Vendor Details (with contact) followed by paired
 * two-column cards: Business Information | Tax Information,
 * Registered Address | Office Location (map), Attachments | Notes.
 *
 * Uses react-hook-form + Zod with email / phone / URL / GSTIN
 * validation, searchable master dropdowns (category, payment terms),
 * attachments and a full action bar (Reset / Cancel / Save / Print /
 * Export PDF). Print and Export PDF appear only once the vendor exists
 * (edit mode), mirroring the requisition action-bar gating.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { Controller, useWatch, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck, Banknote, Building2, Globe, Landmark, Mail, MapPin, MapPinned, Paperclip, Phone,
  Plus, RotateCcw, Scale, ScrollText, StickyNote, Tags, Trash2, UserRound, X
} from 'lucide-react';
import {
  Accordion, ConfirmDialog, CurrencySelect, DateInput, EditableMasterSelect, EmailInput, FormField,
  NumberInput, PhoneInput, SelectInput, TextArea, TextInput, UrlInput, useToast
} from './ui';
import AttachmentManager from './AttachmentManager';
import FormActions from './FormActions';
import OfficeLocationSection from './OfficeLocationSection';
import PurchaseSectionCard from './PurchaseSectionCard';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import { countries } from '../../data/countries';
import {
  MSME_TYPES, SUPPLIER_ADDRESS_TYPES, SUPPLIER_CONTRACT_STATUSES, SUPPLIER_CONTRACT_TYPES,
  SUPPLIER_CONTACT_ROLES, SUPPLIER_LEGAL_TYPES, VENDOR_CATEGORIES, VENDOR_STATUS, VENDOR_STATUSES
} from '../constants';
import { vendorSchema } from '../validation/requisition';
import { vendorService, vendorsStore } from '../services/vendor';
import { getDefaultCurrency } from '../services/settings';
import { formatAmount, nextVendorCode } from '../utils/purchase';
import { newSupplierBlockId } from '../utils/supplierIdentity';
import useFormDraft from '../hooks/useFormDraft';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

function buildVendorFormValues(record = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const credit = record.creditLimit && typeof record.creditLimit === 'object' ? record.creditLimit : {};
  return {
    name: record.name || '',
    registrationDate: record.registrationDate || today,
    category: record.category || '',
    city: record.city || '',
    state: record.state || '',
    email: record.email || '',
    phone: record.phone || '',
    website: record.website || '',
    gstin: record.gstin || '',
    gstType: record.gstType || '',
    pan: record.pan || '',
    address: record.address || '',
    postalCode: record.postalCode || '',
    country: record.country || '',
    notes: record.notes || '',
    latitude: record.latitude ?? null,
    longitude: record.longitude ?? null,
    formattedAddress: record.formattedAddress || '',
    googleMapsUrl: record.googleMapsUrl || '',
    paymentTerms: record.paymentTerms || '30 Days',
    currency: record.currency || getDefaultCurrency(),
    leadTimeDays: String(record.leadTimeDays ?? 15),
    status: record.status || VENDOR_STATUS.PENDING,
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    /* ── Supplier Master fields ── */
    legalName: record.legalName || '',
    legalType: record.legalType || '',
    cin: record.cin || '',
    incorporationDate: record.incorporationDate || '',
    msmeRegNo: record.msmeRegNo || '',
    msmeType: record.msmeType || '',
    tan: record.tan || '',
    active: record.active !== false,
    creditLimit: {
      amount: Number(credit.amount) || 0,
      currency: credit.currency || record.currency || getDefaultCurrency(),
      days: Number(credit.days) || 0
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════
 * Supplier Master repeater editors — controlled lists of structured
 * rows (addresses, contacts, bank accounts, contracts, categories)
 * stored as component state and merged into the payload on submit.
 * The registered office + primary contact stay on the flat fields;
 * these repeaters add the ERP-grade extra rows.
 * ═══════════════════════════════════════════════════════════════════ */

function RepeaterCard({ title, subtitle, icon: Icon, count = 0, noun = 'record', children, onAdd, addLabel }) {
  return (
    <PurchaseSectionCard
      title={title}
      subtitle={subtitle}
      icon={Icon}
      action={
        <span className="pr-section-chip">{count} {count === 1 ? noun : `${noun}s`}</span>
      }
    >
      <div className="space-y-3">
        {children}
        <button
          type="button"
          onClick={onAdd}
          className="po-btn po-btn-primary po-btn-sm w-full justify-center"
        >
          <Plus className="po-btn-icon-ic" /> {addLabel || 'Add Row'}
        </button>
      </div>
    </PurchaseSectionCard>
  );
}

function RepeaterRow({ onRemove, removeLabel = 'Remove', children }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-3 relative">
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        title={removeLabel}
        className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white border border-rose-200 text-rose-500 hover:bg-rose-50 flex items-center justify-center shadow-sm"
      >
        <Trash2 className="w-3 h-3" aria-hidden="true" />
      </button>
      {children}
    </div>
  );
}

function updateRow(list, index, patch) {
  return list.map((row, i) => (i === index ? { ...row, ...patch } : row));
}

/** Additional categories — chips + add row. */
function CategoryTagsEditor({ value = [], onAdd, onRemove }) {
  return (
    <div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {value.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[11px] font-bold text-emerald-800"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                aria-label={`Remove ${tag}`}
                className="text-emerald-500 hover:text-rose-500"
              >
                <X className="w-3 h-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 mb-3">No additional categories yet.</p>
      )}
      <EditableMasterSelect
        options={VENDOR_CATEGORIES.filter((option) => !value.includes(option))}
        value=""
        onChange={(next) => {
          const tag = String(next || '').trim();
          if (tag && !value.includes(tag)) onAdd(tag);
        }}
        placeholder="Add another category…"
        ariaLabel="Additional categories"
      />
    </div>
  );
}

/** Additional addresses (registered office stays on the map fields). */
function AddressesEditor({ value = [], onChange }) {
  const update = (index, patch) => onChange(updateRow(value, index, patch));
  return (
    <RepeaterCard
      title="Additional Addresses"
      subtitle="Plant, warehouse, billing and shipping locations"
      icon={MapPin}
      count={value.length}
      noun="address"
      addLabel="Add Address"
      onAdd={() =>
        onChange([
          ...value,
          { id: newSupplierBlockId('addr'), type: SUPPLIER_ADDRESS_TYPES[2], line: '', city: '', state: '', postalCode: '', country: '', email: '', phone: '' }
        ])
      }
    >
      {value.map((row, index) => (
        <RepeaterRow key={row.id || index} onRemove={() => onChange(value.filter((_, i) => i !== index))}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Type">
              <SelectInput
                value={row.type || ''}
                onChange={(e) => update(index, { type: e.target.value })}
                ariaLabel="Address type"
              >
                {SUPPLIER_ADDRESS_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Postal Code" className="sm:col-span-2">
              <TextInput
                value={row.postalCode || ''}
                onChange={(e) => update(index, { postalCode: e.target.value })}
                placeholder="e.g. 411036"
                ariaLabel="Postal code"
              />
            </FormField>
            <FormField label="Address" className="sm:col-span-3">
              <TextArea
                rows={2}
                value={row.line || ''}
                onChange={(e) => update(index, { line: e.target.value, address: e.target.value })}
                placeholder="Street / plot address"
                ariaLabel="Address line"
              />
            </FormField>
            <FormField label="City">
              <TextInput value={row.city || ''} onChange={(e) => update(index, { city: e.target.value })} ariaLabel="City" />
            </FormField>
            <FormField label="State">
              <TextInput value={row.state || ''} onChange={(e) => update(index, { state: e.target.value })} ariaLabel="State" />
            </FormField>
            <FormField label="Country">
              <EditableMasterSelect
                options={countries}
                value={row.country || ''}
                onChange={(country) => update(index, { country })}
                placeholder="Select country"
                ariaLabel="Country"
              />
            </FormField>
          </div>
        </RepeaterRow>
      ))}
    </RepeaterCard>
  );
}

/** Additional contacts (primary contact stays on the flat fields). */
function ContactsEditor({ value = [], onChange }) {
  const update = (index, patch) => onChange(updateRow(value, index, patch));
  return (
    <RepeaterCard
      title="Additional Contacts"
      subtitle="Sales, technical, accounts and dispatch contacts"
      icon={UserRound}
      count={value.length}
      noun="contact"
      addLabel="Add Contact"
      onAdd={() =>
        onChange([
          ...value,
          { id: newSupplierBlockId('ctc'), name: '', designation: '', role: '', email: '', phone: '' }
        ])
      }
    >
      {value.map((row, index) => (
        <RepeaterRow key={row.id || index} onRemove={() => onChange(value.filter((_, i) => i !== index))}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Name">
              <TextInput value={row.name || ''} onChange={(e) => update(index, { name: e.target.value })} placeholder="Contact name" ariaLabel="Contact name" />
            </FormField>
            <FormField label="Designation">
              <TextInput value={row.designation || ''} onChange={(e) => update(index, { designation: e.target.value })} placeholder="e.g. Purchase Manager" ariaLabel="Designation" />
            </FormField>
            <FormField label="Role">
              <SelectInput
                value={row.role || ''}
                onChange={(e) => update(index, { role: e.target.value, designation: e.target.value === 'Primary Contact' ? row.designation || 'Primary Contact' : row.designation })}
                ariaLabel="Contact role"
              >
                <option value="">Select role…</option>
                {SUPPLIER_CONTACT_ROLES.map((role) => (
                  <option key={role} value={role}>{role}</option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Email" className="sm:col-span-2">
              <EmailInput value={row.email || ''} onChange={(e) => update(index, { email: e.target.value })} placeholder="name@vendor.com" ariaLabel="Contact email" />
            </FormField>
            <FormField label="Phone">
              <PhoneInput value={row.phone || ''} onChange={(e) => update(index, { phone: e.target.value })} placeholder="+91 …" ariaLabel="Contact phone" />
            </FormField>
          </div>
        </RepeaterRow>
      ))}
    </RepeaterCard>
  );
}

/** Bank accounts — beneficiary details for payment runs. */
function BankEditor({ value = [], onChange }) {
  const update = (index, patch) => onChange(updateRow(value, index, patch));
  return (
    <RepeaterCard
      title="Bank Details"
      subtitle="Beneficiary accounts used for payments to this supplier"
      icon={Landmark}
      count={value.length}
      noun="account"
      addLabel="Add Bank Account"
      onAdd={() =>
        onChange([
          ...value,
          { id: newSupplierBlockId('bnk'), accountName: '', bankName: '', branch: '', accountNumber: '', ifsc: '', swift: '', currency: '' }
        ])
      }
    >
      {value.map((row, index) => (
        <RepeaterRow key={row.id || index} onRemove={() => onChange(value.filter((_, i) => i !== index))}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Account Name">
              <TextInput value={row.accountName || ''} onChange={(e) => update(index, { accountName: e.target.value })} placeholder="Beneficiary name" ariaLabel="Account name" />
            </FormField>
            <FormField label="Bank Name">
              <TextInput value={row.bankName || ''} onChange={(e) => update(index, { bankName: e.target.value })} placeholder="e.g. HDFC Bank" ariaLabel="Bank name" />
            </FormField>
            <FormField label="Branch">
              <TextInput value={row.branch || ''} onChange={(e) => update(index, { branch: e.target.value })} placeholder="e.g. Andheri East" ariaLabel="Branch" />
            </FormField>
            <FormField label="Account Number">
              <TextInput value={row.accountNumber || ''} onChange={(e) => update(index, { accountNumber: e.target.value })} placeholder="Account number" ariaLabel="Account number" />
            </FormField>
            <FormField label="IFSC">
              <TextInput value={row.ifsc || ''} onChange={(e) => update(index, { ifsc: e.target.value })} placeholder="HDFC0001234" ariaLabel="IFSC" />
            </FormField>
            <FormField label="SWIFT">
              <TextInput value={row.swift || ''} onChange={(e) => update(index, { swift: e.target.value })} placeholder="For foreign currency" ariaLabel="SWIFT" />
            </FormField>
            <FormField label="Currency" className="sm:col-span-3">
              <CurrencySelect
                value={row.currency || ''}
                onChange={(currency) => update(index, { currency })}
                placeholder="Account currency"
                ariaLabel="Account currency"
              />
            </FormField>
          </div>
        </RepeaterRow>
      ))}
    </RepeaterCard>
  );
}

/** Commercial contracts / agreements register. */
function ContractEditor({ value = [], onChange }) {
  const update = (index, patch) => onChange(updateRow(value, index, patch));
  return (
    <RepeaterCard
      title="Contracts & Agreements"
      subtitle="Rate contracts, AMCs and framework agreements"
      icon={ScrollText}
      count={value.length}
      noun="contract"
      addLabel="Add Contract"
      onAdd={() =>
        onChange([
          ...value,
          {
            id: newSupplierBlockId('ctr'), contractNo: '', title: '', type: '',
            startDate: '', endDate: '', value: 0, currency: '', status: '', notes: ''
          }
        ])
      }
    >
      {value.map((row, index) => (
        <RepeaterRow key={row.id || index} onRemove={() => onChange(value.filter((_, i) => i !== index))}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <FormField label="Contract No">
              <TextInput value={row.contractNo || ''} onChange={(e) => update(index, { contractNo: e.target.value })} placeholder="RC-2026-001" ariaLabel="Contract number" />
            </FormField>
            <FormField label="Title" className="sm:col-span-2">
              <TextInput value={row.title || ''} onChange={(e) => update(index, { title: e.target.value })} placeholder="Annual rate contract — CRCA coils" ariaLabel="Contract title" />
            </FormField>
            <FormField label="Type">
              <SelectInput
                value={row.type || ''}
                onChange={(e) => update(index, { type: e.target.value })}
                ariaLabel="Contract type"
              >
                <option value="">Select type…</option>
                {SUPPLIER_CONTRACT_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Start Date">
              <DateInput value={row.startDate || ''} onChange={(e) => update(index, { startDate: e.target.value })} ariaLabel="Start date" />
            </FormField>
            <FormField label="End Date">
              <DateInput value={row.endDate || ''} onChange={(e) => update(index, { endDate: e.target.value })} ariaLabel="End date" />
            </FormField>
            <FormField label="Value">
              <NumberInput value={row.value || ''} min="0" onChange={(e) => update(index, { value: Number(e.target.value) || 0 })} ariaLabel="Contract value" />
            </FormField>
            <FormField label="Currency">
              <CurrencySelect value={row.currency || ''} onChange={(currency) => update(index, { currency })} ariaLabel="Contract currency" />
            </FormField>
            <FormField label="Status">
              <SelectInput
                value={row.status || ''}
                onChange={(e) => update(index, { status: e.target.value })}
                ariaLabel="Contract status"
              >
                <option value="">Select status…</option>
                {SUPPLIER_CONTRACT_STATUSES.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Notes" className="sm:col-span-3">
              <TextArea rows={1} value={row.notes || ''} onChange={(e) => update(index, { notes: e.target.value })} ariaLabel="Contract notes" />
            </FormField>
          </div>
        </RepeaterRow>
      ))}
    </RepeaterCard>
  );
}

/** The repeatable supplier blocks as stored on the record — the master
 *  view (record.addresses / contacts) includes the derived registered
 *  office + primary contact rows, which live on the flat fields and are
 *  excluded here so they are never duplicated on save. */
function extractExtras(record = {}) {
  const primaryCategory = String(record.category || '').trim();
  return {
    categories: (Array.isArray(record.categories) ? record.categories : [])
      .map((tag) => String(tag || '').trim())
      .filter((tag) => tag && tag !== primaryCategory),
    addresses: (Array.isArray(record.addresses) ? record.addresses : [])
      .filter((row) => row && row.id !== 'registered-office'),
    contacts: (Array.isArray(record.contacts) ? record.contacts : [])
      .filter((row) => row && row.id !== 'primary-contact'),
    bankDetails: (Array.isArray(record.bankDetails) ? record.bankDetails : []).filter((row) => row),
    contracts: (Array.isArray(record.contracts) ? record.contracts : []).filter((row) => row)
  };
}

export default function VendorForm({ initialData, vendorId }) {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, saveDraftNow, clearDraft } = useFormDraft({
    draftKey: 'purchase.vendor',
    recordId: vendorId || null,
  });

  const extrasFromRecord = extractExtras(initialData || {});
  /* Supplier Master repeaters — kept as component state (registered
     office + primary contact live on the flat fields above). */
  const [extraCategories, setExtraCategories] = useState(extrasFromRecord.categories);
  const [extraAddresses, setExtraAddresses] = useState(extrasFromRecord.addresses);
  const [extraContacts, setExtraContacts] = useState(extrasFromRecord.contacts);
  const [bankDetails, setBankDetails] = useState(extrasFromRecord.bankDetails);
  const [contracts, setContracts] = useState(extrasFromRecord.contracts);

  const form = useForm({
    resolver: zodResolver(vendorSchema),
    defaultValues: buildVendorFormValues(initialData),
    mode: 'onTouched'
  });

  const { register, handleSubmit, reset, control, setValue, watch, getValues, formState } = form;
  const { errors } = formState;
  const watched = useWatch({ control });

  /** Auto-generated Vendor Code on create; loaded from saved record on edit. Editable by user. */
  const [userVendorCode, setUserVendorCode] = useState(
    () => (vendorId ? initialData?.id || '' : nextVendorCode(vendorsStore.all))
  );

  const [submitting, setSubmitting] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  /* ---- Draft persistence: load on mount, debounced save on change ---- */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      reset({ ...buildVendorFormValues(initialData), ...draft }, { keepDefaultValues: false });
      if (draft.id) setUserVendorCode(draft.id);
      if (Array.isArray(draft.categories)) setExtraCategories(draft.categories);
      if (Array.isArray(draft.addresses)) setExtraAddresses(draft.addresses);
      if (Array.isArray(draft.contacts)) setExtraContacts(draft.contacts);
      if (Array.isArray(draft.bankDetails)) setBankDetails(draft.bankDetails);
      if (Array.isArray(draft.contracts)) setContracts(draft.contracts);
      toast.info('Draft restored');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    if (watched) {
      persistDraft({
        ...watched,
        id: userVendorCode,
        categories: extraCategories,
        addresses: extraAddresses,
        contacts: extraContacts,
        bankDetails,
        contracts
      });
    }
  }, [watched, persistDraft, userVendorCode, extraCategories, extraAddresses, extraContacts, bankDetails, contracts]);

  /* Deep-link from Vendor Detail → "Register Location": when the edit
     page is opened with #office-location, bring the map section into
     view so the user lands directly on it. */
  useEffect(() => {
    if (window.location.hash !== '#office-location') return undefined;
    const target = document.getElementById('office-location');
    if (!target) return undefined;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return undefined;
  }, []);

  const onSaveDraft = () => {
    saveDraftNow({
      ...getValues(),
      id: userVendorCode,
      categories: extraCategories,
      addresses: extraAddresses,
      contacts: extraContacts,
      bankDetails,
      contracts
    });
    toast.success('Draft saved');
  };

  const onSubmit = async (values) => {
    setSubmitting(true);
    const all = getValues();
    const payload = {
      ...values,
      id: userVendorCode,
      gstType: all.gstType || '',
      pan: all.pan || '',
      postalCode: all.postalCode || '',
      country: all.country || '',
      /* Supplier Master repeaters — additional rows only (the
         registered office + primary contact are the flat fields). */
      categories: extraCategories.map((tag) => String(tag || '').trim()).filter(Boolean),
      addresses: extraAddresses.map((row) => ({ ...row, address: row.line || row.address || '' })),
      contacts: extraContacts,
      bankDetails,
      contracts
    };
    const resetExtras = () => {
      setExtraCategories(extrasFromRecord.categories);
      setExtraAddresses(extrasFromRecord.addresses);
      setExtraContacts(extrasFromRecord.contacts);
      setBankDetails(extrasFromRecord.bankDetails);
      setContracts(extrasFromRecord.contracts);
    };
    try {
      if (vendorId) {
        await vendorService.updateVendor(vendorId, { ...payload, id: userVendorCode });
        toast.success('Vendor updated successfully');
        clearDraft();
        navigate(`/purchase/vendors/${vendorId}`);
      } else {
        const created = await vendorService.createVendor(payload);
        toast.success('Vendor registered successfully');
        clearDraft();
        resetExtras();
        navigate(`/purchase/vendors/${created.id}`);
      }
    } catch (err) {
      toast.error(err?.message || (vendorId ? 'Failed to update vendor' : 'Failed to register vendor'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => setConfirmResetOpen(true);

  const confirmReset = () => {
    setConfirmResetOpen(false);
    reset(buildVendorFormValues(initialData));
    form.clearErrors();
    clearDraft();
    setExtraCategories(extrasFromRecord.categories);
    setExtraAddresses(extrasFromRecord.addresses);
    setExtraContacts(extrasFromRecord.contacts);
    setBankDetails(extrasFromRecord.bankDetails);
    setContracts(extrasFromRecord.contracts);
  };

  const handleCancel = () => {
    if (formState.isDirty) {
      setConfirmCancelOpen(true);
    } else {
      navigate('/purchase/vendors');
    }
  };

  const confirmCancel = () => {
    setConfirmCancelOpen(false);
    navigate('/purchase/vendors');
  };

  const printVendor = () => {
    const v = watched || {};
    const win = window.open('', '_blank', 'width=820,height=600');
    if (!win) return;
    const rows = [
      ['Vendor Name', v.name],
      ['Category', v.category],
      ['Email', v.email],
      ['Phone', v.phone],
      ['Website', v.website],
      ['GSTIN', v.gstin],
      ['City', v.city],
      ['State', v.state],
      ['Payment Terms', v.paymentTerms],
      ['Currency', v.currency],
      ['Lead Time (days)', v.leadTimeDays],
      ['Address', v.address]
    ];
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Vendor</title>
      <style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;padding:32px;color:#0f172a}
      h1{font-size:18px;margin:0 0 4px}.meta{font-size:12px;color:#64748b;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#1e3a8a;color:#f1f5f9;text-align:left;padding:8px 10px;font-weight:700;width:40%}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0}
      tbody tr:nth-child(even){background:#f8fafc}</style></head><body>
      <h1>Vendor Profile</h1><div class="meta">Generated on ${new Date().toLocaleString('en-GB')}</div>
      <table><tbody>${rows.map(([k, val]) => `<tr><th>${k}</th><td>${String(val ?? '')}</td></tr>`).join('')}</tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    win.document.close();
  };

  const handleExportPdf = async () => {
    const { exportPdf } = await import('../utils/export');
    const v = watched || {};
    await exportPdf({
      title: 'Vendor Profile',
      filename: `vendor-${vendorId || v.name || 'new'}`,
      meta: [
        ['Vendor', v.name],
        ['Category', v.category],
        ['Email', v.email],
        ['Phone', v.phone],
        ['GSTIN', v.gstin],
        ['City / State', [v.city, v.state].filter(Boolean).join(', ')]
      ],
      columns: [
        { key: 'field', label: 'Field' },
        { key: 'value', label: 'Value' }
      ],
      records: [
        ['Payment Terms', v.paymentTerms],
        ['Currency', v.currency],
        ['Lead Time (days)', v.leadTimeDays],
        ['Address', v.address]
      ].map(([field, value]) => ({ field, value }))
    });
  };

  /**
   * Office Location write-back: the map section pushes partial field
   * updates (coordinates, reverse-geocoded address components, stored
   * formatted address + Google Maps URL) into react-hook-form. Only
   * the coordinates trigger revalidation — they are now required.
   */
  const handleLocationChange = (fields = {}) => {
    Object.entries(fields).forEach(([key, value]) => {
      const isCoord = key === 'latitude' || key === 'longitude';
      setValue(key, isCoord ? (value ?? null) : (value ?? ''), {
        shouldDirty: true,
        shouldValidate: isCoord
      });
    });
  };

  const attachmentCount = (watch('attachments') || []).length;

  return (
    <>
    <form onSubmit={handleSubmit(onSubmit)}>
      <div className="pr-form-layout">
        <div className="pr-form-main">
          {/* ============ 1 · VENDOR DETAILS + CONTACT ============ */}
            <Accordion
              title="Vendor Details"
              subtitle="Name, category and contact information"
              icon={Building2}
            >
            <div className={GRID}>
              <FormField label="Vendor Code">
                <TextInput
                  value={userVendorCode}
                  onChange={(e) => setUserVendorCode(e.target.value)}
                  className="font-semibold text-slate-700"
                  placeholder="Auto-generated"
                  ariaLabel="Vendor Code"
                />
              </FormField>
              <FormField label="Registration Date">
                <DateInput registration={register('registrationDate')} />
              </FormField>
              <FormField label="Vendor Name" required error={errors.name?.message} className={SPAN2}>
                <TextInput
                  registration={register('name')}
                  error={!!errors.name}
                  placeholder="Registered legal name"
                />
              </FormField>
              <FormField label="Status">
                <Controller control={control} name="status" render={({ field }) => (
                  <EditableMasterSelect
                    options={VENDOR_STATUSES}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Select status"
                    ariaLabel="Status"
                  />
                )} />
              </FormField>
              <FormField label="Email" required error={errors.email?.message}>
                <EmailInput registration={register('email')} error={!!errors.email} placeholder="billing@vendor.com" />
              </FormField>
              <FormField label="Phone" error={errors.phone?.message}>
                <PhoneInput registration={register('phone')} error={!!errors.phone} placeholder="+91 98765 43210" />
              </FormField>
              <FormField label="Website" error={errors.website?.message} className={SPAN2}>
                <UrlInput registration={register('website')} error={!!errors.website} placeholder="https://vendor.example.com" />
              </FormField>
            </div>
          </Accordion>

          {/* ============ 1b · LEGAL DETAILS | CATEGORIES ============ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
            <PurchaseSectionCard
              title="Legal Details"
              subtitle="Legal entity identity and incorporation"
              icon={Scale}
            >
              <div className={GRID}>
                <FormField label="Legal Name" className={SPAN2} hint="Registered legal entity name (defaults to the supplier name)">
                  <TextInput registration={register('legalName')} placeholder="Legal entity name" />
                </FormField>
                <FormField label="Legal Type">
                  <Controller control={control} name="legalType" render={({ field }) => (
                    <EditableMasterSelect
                      options={SUPPLIER_LEGAL_TYPES}
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Select legal type"
                      ariaLabel="Legal type"
                    />
                  )} />
                </FormField>
                <FormField label="Incorporation Date">
                  <DateInput registration={register('incorporationDate')} />
                </FormField>
                <FormField label="CIN" className={SPAN2}>
                  <TextInput registration={register('cin')} placeholder="U27100MH2005PLC152032" />
                </FormField>
                <FormField label="MSME Reg. No">
                  <TextInput registration={register('msmeRegNo')} placeholder="UDYAM-MH-00-0000000" />
                </FormField>
                <FormField label="MSME Type">
                  <Controller control={control} name="msmeType" render={({ field }) => (
                    <EditableMasterSelect
                      options={MSME_TYPES}
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Select classification"
                      ariaLabel="MSME type"
                    />
                  )} />
                </FormField>
              </div>
            </PurchaseSectionCard>

            <PurchaseSectionCard
              title="Categories"
              subtitle="Primary category and additional supply categories"
              icon={Tags}
              action={
                <span className="pr-section-chip">
                  {extraCategories.length + 1} categor{extraCategories.length + 1 === 1 ? 'y' : 'ies'}
                </span>
              }
            >
              <FormField label="Primary Category">
                <Controller control={control} name="category" render={({ field }) => (
                  <EditableMasterSelect
                    options={VENDOR_CATEGORIES}
                    value={field.value || ''}
                    onChange={field.onChange}
                    placeholder="Search category..."
                    error={!!errors.category}
                    ariaLabel="Primary category"
                  />
                )} />
              </FormField>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <CategoryTagsEditor
                  value={extraCategories}
                  onAdd={(tag) => setExtraCategories((prev) => (prev.includes(tag) ? prev : [...prev, tag]))}
                  onRemove={(tag) => setExtraCategories((prev) => prev.filter((item) => item !== tag))}
                />
              </div>
            </PurchaseSectionCard>
          </div>

          {/* ============ 2+ · PAIRED TWO-COLUMN SECTION CARDS ============
              Each pair is an explicit 24px-gap row:
                Business Information | Tax Information
                Registered Address   | Office Location (map)
                Attachments          | Notes (equal card heights)
              Desktop + tablet → 2 columns (>=768px); mobile → stacked. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
            {/* 2 · BUSINESS INFORMATION — payment terms, credit limit,
                currency, lead time and operational status. */}
            <PurchaseSectionCard
              title="Business Information"
              subtitle="Payment terms, credit limit, currency and lead time"
              icon={Banknote}
            >
              <div className={GRID}>
                <FormField label="Payment Terms">
                  <Controller control={control} name="paymentTerms" render={({ field }) => (
                    <EditableMasterSelect
                      masterKey="paymentTerms"
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Select payment terms"
                      ariaLabel="Payment Terms"
                    />
                  )} />
                </FormField>
                <FormField label="Currency">
                  <Controller control={control} name="currency" render={({ field }) => (
                    <CurrencySelect value={field.value || ''} onChange={field.onChange} placeholder="Select currency" ariaLabel="Currency" error={!!errors.currency} />
                  )} />
                </FormField>
                <FormField label="Lead Time (days)" error={errors.leadTimeDays?.message}>
                  <NumberInput min="0" registration={register('leadTimeDays')} error={!!errors.leadTimeDays} placeholder="15" />
                </FormField>
                <FormField label="Active Supplier">
                  <label className="inline-flex items-center gap-2 mt-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-[#0A4F44]"
                      {...register('active')}
                    />
                    <span className="text-xs font-semibold text-slate-700">
                      {watched?.active === false ? 'Inactive — excluded from new sourcing' : 'Active — available for new sourcing'}
                    </span>
                  </label>
                </FormField>
                <FormField label="Credit Limit" className={SPAN2}>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr] gap-3">
                    <NumberInput
                      min="0"
                      registration={register('creditLimit.amount')}
                      placeholder="0"
                      ariaLabel="Credit limit amount"
                    />
                    <Controller control={control} name="creditLimit.currency" render={({ field }) => (
                      <CurrencySelect value={field.value || ''} onChange={field.onChange} placeholder="Cur." ariaLabel="Credit limit currency" />
                    )} />
                    <div className="flex items-center gap-2">
                      <NumberInput
                        min="0"
                        registration={register('creditLimit.days')}
                        placeholder="0"
                        ariaLabel="Credit days"
                      />
                      <span className="text-[11px] font-semibold text-slate-400 whitespace-nowrap">days</span>
                    </div>
                  </div>
                </FormField>
              </div>
            </PurchaseSectionCard>

            {/* 3 · TAX INFORMATION */}
            <PurchaseSectionCard
              title="Tax Details"
              subtitle="GSTIN, GST type, PAN and TAN"
              icon={BadgeCheck}
            >
              <div className={GRID}>
                <FormField label="GSTIN" error={errors.gstin?.message} className={SPAN2}>
                  <TextInput registration={register('gstin')} error={!!errors.gstin} placeholder="27AAAAA0000A1Z5" />
                </FormField>
                <FormField label="GST Type">
                  <Controller control={control} name="gstType" render={({ field }) => (
                    <EditableMasterSelect
                      masterKey="gstTypes"
                      value={field.value || ''}
                      onChange={field.onChange}
                      placeholder="Select GST type"
                      ariaLabel="GST Type"
                    />
                  )} />
                </FormField>
                <FormField label="State Code" hint="2-digit GST state code">
                  <TextInput value={String((watch('gstin') || '').slice(0, 2) || '')} readOnly className="bg-slate-50 text-slate-500" ariaLabel="GST state code" />
                </FormField>
                <FormField label="PAN">
                  <TextInput registration={register('pan')} placeholder="AAAAA0000A" />
                </FormField>
                <FormField label="TAN">
                  <TextInput registration={register('tan')} placeholder="MUMB00000A" />
                </FormField>
              </div>
            </PurchaseSectionCard>

          </div>

          {/* 4+ · REGISTERED ADDRESS / ATTACHMENTS / NOTES (LEFT) | OFFICE LOCATION (RIGHT)
              Independent columns: the left stacks Registered Address → Attachments → Notes
              so it grows to fill the height beside the tall map; the right column holds
              only the Office Location (search + map) section. Each column renders on its
              own — the left never waits for the map to finish. */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
            {/* LEFT COLUMN — stacks vertically and fills the empty space */}
            <div className="space-y-6 min-w-0">
              {/* 4 · REGISTERED ADDRESS */}
              <PurchaseSectionCard
                title="Registered Address"
                subtitle="Registered office address and country"
                icon={MapPin}
              >
                <div className={GRID}>
                  <FormField label="City">
                    <TextInput registration={register('city')} placeholder="e.g. Pune" />
                  </FormField>
                  <FormField label="State">
                    <TextInput registration={register('state')} placeholder="e.g. Maharashtra" />
                  </FormField>
                  <FormField label="Address" className={SPAN2}>
                    <TextArea rows={2} registration={register('address')} placeholder="Registered office address" />
                  </FormField>
                  <FormField label="Postal Code">
                    <TextInput registration={register('postalCode')} placeholder="e.g. 411026" />
                  </FormField>
                  <FormField label="Country">
                    <Controller control={control} name="country" render={({ field }) => (
                      <EditableMasterSelect
                        options={countries}
                        value={field.value || ''}
                        onChange={field.onChange}
                        placeholder="Select country"
                        ariaLabel="Country"
                      />
                    )} />
                  </FormField>
                </div>
              </PurchaseSectionCard>

              {/* 5 · ADDITIONAL ADDRESSES (registered office above) */}
              <AddressesEditor value={extraAddresses} onChange={setExtraAddresses} />

              {/* 6 · ADDITIONAL CONTACTS (primary contact above) */}
              <ContactsEditor value={extraContacts} onChange={setExtraContacts} />

              {/* 7 · BANK DETAILS */}
              <BankEditor value={bankDetails} onChange={setBankDetails} />

              {/* 8 · CONTRACTS & AGREEMENTS */}
              <ContractEditor value={contracts} onChange={setContracts} />

              {/* 9 · ATTACHMENTS */}
              <PurchaseSectionCard
                title="Documents"
                subtitle="GST registration, certificates, bank confirmations, agreements"
                icon={Paperclip}
                action={
                  attachmentCount > 0 ? (
                    <span className="pr-section-chip">{attachmentCount} file{attachmentCount === 1 ? '' : 's'}</span>
                  ) : null
                }
              >
                <AttachmentManager
                  attachments={watch('attachments') || []}
                  onChange={(next) => setValue('attachments', next, { shouldDirty: true })}
                />
              </PurchaseSectionCard>

              {/* 10 · NOTES */}
              <PurchaseSectionCard
                title="Notes"
                subtitle="Internal notes about this supplier"
                icon={StickyNote}
              >
                <FormField label="Notes" hint="Visible to the purchase team only">
                  <TextArea
                    rows={4}
                    registration={register('notes')}
                    placeholder="Payment instructions, credit policy notes, review remarks..."
                  />
                </FormField>
              </PurchaseSectionCard>
            </div>

            {/* RIGHT COLUMN — Office Location (search + map) only */}
            <div id="office-location" className="scroll-mt-24">
              <PurchaseSectionCard
                title="Office Location"
                subtitle="Search the address and drop a pin on the map"
                icon={MapPinned}
              >
                <OfficeLocationSection
                  latitude={watch('latitude') ?? null}
                  longitude={watch('longitude') ?? null}
                  formattedAddress={watch('formattedAddress') || ''}
                  registeredAddress={{
                    address: watch('address') || '',
                    city: watch('city') || '',
                    state: watch('state') || ''
                  }}
                  error={errors.latitude?.message || errors.longitude?.message || ''}
                  onLocationChange={handleLocationChange}
                />
              </PurchaseSectionCard>
            </div>
          </div>
        </div>

        <aside className="pr-form-side">
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><BadgeCheck aria-hidden="true" /> Supplier Status</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="purchase-total-row">
                <span className="total-label">Approval Status</span>
                <span className="total-value"><PurchaseStatusBadge status={watched?.status || VENDOR_STATUS.PENDING} /></span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Operational</span>
                <span className="total-value">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${watched?.active === false ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'}`}>
                    {watched?.active === false ? 'Inactive' : 'Active'}
                  </span>
                </span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Category</span>
                <span className="total-value">{watched?.category || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Additional Categories</span>
                <span className="total-value">{extraCategories.length || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">GST Type</span>
                <span className="total-value">{watched?.gstType || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Payment Terms</span>
                <span className="total-value">{watched?.paymentTerms || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Currency</span>
                <span className="total-value">{watched?.currency || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Credit Limit</span>
                <span className="total-value">
                  {Number(watched?.creditLimit?.amount || 0) > 0
                    ? `${formatAmount(Number(watched.creditLimit.amount))}${watched.creditLimit.days ? ` / ${watched.creditLimit.days}d` : ''}`
                    : 'Not set'}
                </span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Country</span>
                <span className="total-value">{watched?.country || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Lead Time</span>
                <span className="total-value">{watched?.leadTimeDays ? `${watched.leadTimeDays} days` : '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Primary Contact</span>
                <span className="total-value">{watched?.phone || watched?.email || '—'}</span>
              </div>
            </div>
          </div>

          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><MapPin aria-hidden="true" /> Registered Office</h3>
            </div>
            <div className="purchase-form-card-body">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                {watched?.address || 'No address provided yet.'}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-[#0A4F44]" /> {[watched?.city, watched?.state, watched?.postalCode].filter(Boolean).join(', ') || '—'}{watched?.country ? `, ${watched.country}` : ''}</span>
                <span className="inline-flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-[#0A4F44]" /> {watched?.email || '—'}</span>
                <span className="inline-flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-[#0A4F44]" /> {watched?.phone || '—'}</span>
                {watched?.website && <span className="inline-flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-[#0A4F44]" /> {watched.website}</span>}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        submitLabel={vendorId ? 'Update Vendor' : 'Register Vendor'}
        draftLabel="Save Draft"
        showDraft
        onDraft={onSaveDraft}
        onCancel={handleCancel}
        onReset={handleReset}
        onPrint={vendorId ? printVendor : undefined}
        onExportPdf={vendorId ? handleExportPdf : undefined}
      />
    </form>

    {/* Reset / Cancel confirmation dialogs */}
    <ConfirmDialog
      open={confirmResetOpen}
      title="Reset vendor form?"
      message="This will clear every field you have entered on this form. Attachments will be removed — data already saved on the server is not affected."
      confirmLabel="Reset Form"
      variant="warning"
      icon={RotateCcw}
      onConfirm={confirmReset}
      onCancel={() => setConfirmResetOpen(false)}
    />
    <ConfirmDialog
      open={confirmCancelOpen}
      title="Discard unsaved changes?"
      message="You have unsaved changes in this vendor. Leaving now will discard them."
      confirmLabel="Leave Page"
      variant="default"
      icon={X}
      onConfirm={confirmCancel}
      onCancel={() => setConfirmCancelOpen(false)}
    />
    </>
  );
}
