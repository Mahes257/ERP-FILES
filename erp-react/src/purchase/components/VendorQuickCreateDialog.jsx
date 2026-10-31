/**
 * purchase/components/VendorQuickCreateDialog.jsx
 * ------------------------------------------------------------------
 * Lightweight inline dialog for creating a new vendor directly from
 * the QuotationForm or RFQ vendor selector. Keeps the parent form
 * state intact and auto-selects the newly created vendor on save.
 *
 * Required: Name, Category, Email.
 * Optional: Phone, City, State, GSTIN, Website.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import {
  EditableMasterSelect, EmailInput, FormField, PhoneInput, TextInput, useToast
} from './ui';
import { VENDOR_CATEGORIES } from '../constants';
import { vendorService } from '../services/vendor';

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

const EMPTY_FORM = {
  name: '',
  category: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  gstin: '',
  website: ''
};

export default function VendorQuickCreateDialog({ open, onClose, onCreated }) {
  const toast = useToast();
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const setField = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validate = () => {
    const errs = {};
    if (!values.name.trim() || values.name.trim().length < 2) {
      errs.name = 'Vendor name is required (min 2 characters)';
    }
    if (!values.category) {
      errs.category = 'Category is required';
    }
    if (!values.email.trim()) {
      errs.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload = {
        name: values.name.trim(),
        category: values.category,
        email: values.email.trim(),
        phone: values.phone.trim(),
        city: values.city.trim(),
        state: values.state.trim(),
        gstin: values.gstin.trim(),
        website: values.website.trim()
      };
      const created = await vendorService.createVendor(payload);
      toast.success(`Vendor "${created.name}" registered`);
      onCreated?.(created);
      handleClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to register vendor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setValues(EMPTY_FORM);
    setErrors({});
    setSubmitting(false);
    onClose();
  };

  /* Close on Escape key */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add New Vendor"
        className="relative z-10 bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[85vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Add New Vendor</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Register a vendor to include in this quotation
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4">
          <div className={GRID}>
            {/* Name — required */}
            <FormField label="Vendor Name" required error={errors.name} className={SPAN2}>
              <TextInput
                value={values.name}
                onChange={(e) => setField('name', e.target.value)}
                error={!!errors.name}
                placeholder="Registered legal name"
                autoFocus
              />
            </FormField>

            {/* Category — required */}
            <FormField label="Category" required error={errors.category}>
              <EditableMasterSelect
                options={VENDOR_CATEGORIES}
                value={values.category}
                onChange={(val) => setField('category', val)}
                placeholder="Search category..."
                error={!!errors.category}
                ariaLabel="Category"
              />
            </FormField>

            {/* Email — required */}
            <FormField label="Email" required error={errors.email}>
              <EmailInput
                value={values.email}
                onChange={(e) => setField('email', e.target.value)}
                error={!!errors.email}
                placeholder="billing@vendor.com"
              />
            </FormField>

            {/* Phone — optional */}
            <FormField label="Phone" error={errors.phone}>
              <PhoneInput
                value={values.phone}
                onChange={(e) => setField('phone', e.target.value)}
                error={!!errors.phone}
                placeholder="+91 98765 43210"
              />
            </FormField>

            {/* City — optional */}
            <FormField label="City">
              <TextInput
                value={values.city}
                onChange={(e) => setField('city', e.target.value)}
                placeholder="e.g. Pune"
              />
            </FormField>

            {/* State — optional */}
            <FormField label="State">
              <TextInput
                value={values.state}
                onChange={(e) => setField('state', e.target.value)}
                placeholder="e.g. Maharashtra"
              />
            </FormField>

            {/* GSTIN — optional */}
            <FormField label="GSTIN" className={SPAN2}>
              <TextInput
                value={values.gstin}
                onChange={(e) => setField('gstin', e.target.value)}
                placeholder="27AAAAA0000A1Z5"
              />
            </FormField>

            {/* Website — optional */}
            <FormField label="Website" className={SPAN2}>
              <TextInput
                value={values.website}
                onChange={(e) => setField('website', e.target.value)}
                placeholder="https://vendor.example.com"
              />
            </FormField>
          </div>
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-white cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-1.5 text-xs font-bold text-white bg-[#0B4A3D] rounded-lg hover:bg-[#083D34] disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Registering...' : 'Register Vendor'}
          </button>
        </div>
      </div>
    </div>
  );
}
