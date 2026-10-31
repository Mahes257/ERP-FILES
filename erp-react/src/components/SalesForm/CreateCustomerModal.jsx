import { useState } from 'react';
import { AlertTriangle, Loader2, UserPlus } from 'lucide-react';
import { FormField, Modal, TextArea, TextInput, useToast } from '../Common';
import customerService from '../../services/customerService';

const EMPTY = {
  businessName: '',
  clientCode: '',
  contactPerson: '',
  email: '',
  phone: '',
  gstin: '',
  pan: '',
  billingAddress: '',
  billingCity: '',
  billingState: '',
  billingPin: '',
  shippingAddress: '',
  country: 'India',
  paymentTerms: '',
  notes: ''
};

/**
 * Create New Customer — mirrors the ERP's "Create New Customer" link in the
 * Sales Contract Client Details card (create-sales-contract.html), which opens
 * the customer create form. Here it is an in-place modal that persists the new
 * customer via /customers and hands it back so the Client Details fields can be
 * auto-filled, exactly like selecting an existing customer in the lookup.
 */
export default function CreateCustomerModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [duplicates, setDuplicates] = useState([]);

  const setField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear duplicate warnings when the user edits the relevant field
    if (duplicates.length > 0) {
      setDuplicates((prev) => prev.filter((d) => d.field !== key));
    }
  };

  const handleSave = async (force = false) => {
    if (!String(form.businessName || '').trim()) {
      toast.error('Business Name is required.');
      return;
    }

    // Duplicate detection (skipped on forced save after user confirmation)
    if (!force) {
      try {
        const res = await customerService.checkDuplicate({
          businessName: form.businessName.trim(),
          gstin: form.gstin || undefined,
          pan: form.pan || undefined
        });
        const matches = res?.data ?? res ?? [];
        if (Array.isArray(matches) && matches.length > 0) {
          setDuplicates(matches);
          return; // Stop — user must confirm or edit
        }
      } catch {
        // Duplicate check is best-effort; proceed if it fails
      }
    }

    setSaving(true);
    try {
      const res = await customerService.create({
        ...form,
        businessName: form.businessName.trim(),
        shippingAddress: form.shippingAddress || form.billingAddress || undefined,
        shippingCity: form.shippingCity || form.billingCity || undefined,
        shippingState: form.shippingState || form.billingState || undefined,
        shippingPin: form.shippingPin || form.billingPin || undefined
      });
      const customer = res?.data ?? res ?? {};
      toast.success(`Customer "${customer.businessName || form.businessName}" created`);
      setDuplicates([]);
      onCreated?.(customer);
      setForm(EMPTY);
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to create customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create New Customer" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 bg-emerald-50/70 border border-emerald-100 rounded-lg px-3 py-2.5">
          <UserPlus className="w-4 h-4 text-[#0B4A3D] shrink-0 mt-0.5" />
          <p className="text-xs text-slate-600">
            The new customer is added to the customer master and the Client Details below are
            filled automatically so it can be used on this contract right away.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Business Name" required className="sm:col-span-2">
            <TextInput
              value={form.businessName}
              onChange={(e) => setField('businessName', e.target.value)}
              placeholder="Enter business name"
            />
          </FormField>
          <FormField label="Client Code">
            <TextInput
              value={form.clientCode}
              onChange={(e) => setField('clientCode', e.target.value)}
              placeholder="Auto-generated C-XXXXXX, or enter manually"
            />
          </FormField>
          <FormField label="Contact Person">
            <TextInput
              value={form.contactPerson}
              onChange={(e) => setField('contactPerson', e.target.value)}
              placeholder="Primary contact person"
            />
          </FormField>
          <FormField label="Email">
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => setField('email', e.target.value)}
              placeholder="client@example.com"
            />
          </FormField>
          <FormField label="Phone">
            <TextInput
              value={form.phone}
              onChange={(e) => setField('phone', e.target.value)}
              placeholder="+91-9876543210"
            />
          </FormField>
          <FormField label="Business GSTIN">
            <TextInput
              value={form.gstin}
              onChange={(e) => setField('gstin', e.target.value)}
              placeholder="e.g. 27AABCU1234D1Z5"
            />
          </FormField>
          <FormField label="Business PAN Number">
            <TextInput
              value={form.pan}
              onChange={(e) => setField('pan', e.target.value)}
              placeholder="Enter PAN number"
            />
          </FormField>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Billing Details</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Street Address" className="sm:col-span-2">
              <TextArea
                rows={2}
                value={form.billingAddress}
                onChange={(e) => setField('billingAddress', e.target.value)}
                placeholder="Enter street address"
              />
            </FormField>
            <FormField label="City / Town">
              <TextInput
                value={form.billingCity}
                onChange={(e) => setField('billingCity', e.target.value)}
                placeholder="City"
              />
            </FormField>
            <FormField label="State / Province">
              <TextInput
                value={form.billingState}
                onChange={(e) => setField('billingState', e.target.value)}
                placeholder="State"
              />
            </FormField>
            <FormField label="Postal Code / Zip Code">
              <TextInput
                value={form.billingPin}
                onChange={(e) => setField('billingPin', e.target.value)}
                placeholder="Postal code"
              />
            </FormField>
            <FormField label="Country">
              <TextInput
                value={form.country}
                onChange={(e) => setField('country', e.target.value)}
                placeholder="India"
              />
            </FormField>
            <FormField label="Shipping Address" className="sm:col-span-2">
              <TextArea
                rows={2}
                value={form.shippingAddress}
                onChange={(e) => setField('shippingAddress', e.target.value)}
                placeholder="Shipping address (defaults to billing)"
              />
            </FormField>
            <FormField label="Payment Terms">
              <TextInput
                value={form.paymentTerms}
                onChange={(e) => setField('paymentTerms', e.target.value)}
                placeholder="e.g. Net 30"
              />
            </FormField>
            <FormField label="Notes">
              <TextInput
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                placeholder="Internal notes about this client"
              />
            </FormField>
          </div>
        </div>
      </div>

      {duplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mt-4">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-800">
              <p className="font-bold mb-1">Potential duplicate{duplicates.length > 1 ? 's' : ''} found:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {duplicates.map((d, i) => (
                  <li key={i}>{d.message}</li>
                ))}
              </ul>
              <p className="mt-1.5 text-amber-700">Click <strong>Create Anyway</strong> to proceed, or edit the fields above to resolve.</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100 mt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          Cancel
        </button>
        {duplicates.length > 0 && (
          <button
            type="button"
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg hover:bg-amber-100 transition-colors cursor-pointer disabled:opacity-50"
          >
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Create Anyway
          </button>
        )}
        <button
          type="button"
          onClick={() => handleSave(false)}
          disabled={saving}
          className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Create Customer
        </button>
      </div>
    </Modal>
  );
}
