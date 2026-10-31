import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BedDouble,
  Bus,
  DollarSign,
  FileImage,
  FileSpreadsheet,
  FileText,
  MapPin,
  Package,
  Paperclip,
  Upload,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { CreationActionBar, useToast } from '../Common';
import { useFormDraft } from '../../hooks/useFormDraft';
import marketingService from '../../services/marketingService';
import marketingSettingsService from '../../services/marketingSettingsService';
import { BILL_STATUSES } from '../../config/expenseOptions';
import '../../pages/sales/quotation-create.css';
import './marketing-expenses.css';
import './marketing-form-actions.css';

const PURPOSES = ['Marketing Visit', 'Plant Visit', 'Customer Visit', 'Follow-up', 'Survey', 'Other'];
const ACCEPTED_BILL_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv'
];
const ACCEPT = ACCEPTED_BILL_TYPES.join(',');

const CATEGORIES = [
  { key: 'Travel', label: 'Travel', icon: Bus, color: '#1D4ED8', bg: '#EFF6FF', border: '#D7E7E3' },
  { key: 'Stay', label: 'Stay / Lodge', icon: BedDouble, color: '#6D28D9', bg: '#F5F3FF', border: '#ede9fe' },
  { key: 'Food', label: 'Food', icon: UtensilsCrossed, color: '#C2410C', bg: '#FFF7ED', border: '#fed7aa' },
  { key: 'Other', label: 'Other', icon: Package, color: '#047857', bg: '#F0FDF4', border: '#bbf7d0' }
];

const fmtINR = (v) => v == null ? '₹0' : Number(v).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const fmtDate = (v) => v ? String(v).slice(0, 10) : '—';
const isImageType = (t) => t && t.startsWith('image/');
const parseList = (res) => {
  if (Array.isArray(res)) return res;
  if (res?.content) return res.content;
  return [];
};

function BillIcon({ type }) {
  if (isImageType(type)) return <FileImage size={14} />;
  if (type === 'application/pdf') return <FileText size={14} />;
  if (type && (type.includes('sheet') || type === 'text/csv')) return <FileSpreadsheet size={14} />;
  return <Paperclip size={14} />;
}

const fmtFileSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Category card component for expense summary
function CategoryCard({ cat, data, onChange, onFileChange, onRemoveFile }) {
  const fileInputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const Icon = cat.icon;

  useEffect(() => {
    if (!data.file) { setPreview(null); return; }
    if (data.file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => setPreview(ev.target.result);
      reader.readAsDataURL(data.file);
    } else {
      setPreview('file');
    }
  }, [data.file]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!ACCEPTED_BILL_TYPES.includes(file.type)) {
      alert('Supported: JPG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX, CSV');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be under 10 MB');
      return;
    }
    onFileChange(cat.key, file);
  };

  return (
    <div style={{
      border: `2px solid ${data.amount ? cat.border : '#e5e7eb'}`,
      borderRadius: 14,
      padding: '20px 16px',
      background: data.amount ? cat.bg : '#fff',
      transition: 'all 0.2s'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: cat.bg, color: cat.color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${cat.border}`
        }}>
          <Icon size={18} />
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{cat.label}</div>
          <div style={{ fontSize: 11, color: '#9CA3AF' }}>Enter amount below</div>
        </div>
      </div>

      <div className="qtn-field" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Amount (₹)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          className="qtn-input"
          value={data.amount}
          onChange={(e) => onChange(cat.key, 'amount', e.target.value)}
          placeholder="0.00"
          style={{ fontSize: 18, fontWeight: 700, color: cat.color, height: 48 }}
        />
      </div>

      <div className="qtn-field" style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Bill Status</label>
        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
          {BILL_STATUSES.map(b => (
            <label key={b} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input
                type="radio"
                name={`bill-${cat.key}`}
                value={b}
                checked={data.billStatus === b}
                onChange={() => onChange(cat.key, 'billStatus', b)}
                style={{ accentColor: cat.color }}
              />
              <span style={{ color: '#374151' }}>{b === 'WITH BILL' ? 'With Bill' : 'Without Bill'}</span>
            </label>
          ))}
        </div>
      </div>

      {data.billStatus === 'WITH BILL' && (
        <div className="qtn-field">
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Attachment</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="qtn-btn qtn-btn-secondary"
              style={{ height: 38, fontSize: 12 }}
            >
              <Upload size={14} /> {data.file ? data.file.name.slice(0, 30) + '...' : 'Choose File'}
            </button>
            <input ref={fileInputRef} type="file" accept={ACCEPT} style={{ display: 'none' }} onChange={handleFile} />
            {data.file && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}>
                {preview === 'file' ? <BillIcon type={data.file.type} /> : preview ? <img src={preview} alt="" style={{ width: 24, height: 18, objectFit: 'cover', borderRadius: 4 }} /> : <BillIcon type={data.file.type} />}
                <span style={{ fontWeight: 600, color: '#0B4A3D' }}>{data.file.name.slice(0, 40)}</span>
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{fmtFileSize(data.file.size)}</span>
                <button onClick={() => onRemoveFile(cat.key)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}>
                  <X size={14} />
                </button>
              </div>
            )}
            {data.existingAttachment && !data.file && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: '#f0fdf4', borderRadius: 8, border: '1px solid #a7f3d0', fontSize: 12 }}>
                <BillIcon type={data.existingAttachment.contentType} />
                <span style={{ fontWeight: 600, color: '#047857' }}>{data.existingAttachment.name}</span>
                <span style={{ color: '#9CA3AF', fontSize: 11 }}>{fmtFileSize(data.existingAttachment.size)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {data.billStatus === 'WITHOUT BILL' && (
        <div className="qtn-field">
          <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Reason for Without Bill</label>
          <input
            className="qtn-input"
            value={data.reason || ''}
            onChange={(e) => onChange(cat.key, 'reason', e.target.value)}
            placeholder="Why is the bill unavailable?"
            style={{ fontSize: 12, height: 38 }}
          />
        </div>
      )}
    </div>
  );
}

export default function NewMarketingExpense() {
  const toast = useToast();
  const navigate = useNavigate();
  const { id: editId } = useParams(); // If editing an existing expense
  const isEdit = !!editId;
  // ---- form draft persistence ----
  const draftRestoredRef = useRef(false);
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    'marketing-expenses', editId || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );

  // Basic details form
  const [startLocation, setStartLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('');
  const [visitRef, setVisitRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [marketer, setMarketer] = useState('');

  // Expense categories
  const [categories, setCategories] = useState({
    Travel: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null },
    Stay: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null },
    Food: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null },
    Other: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null }
  });

  // Loading states
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!editId);

  // ---- restore unsaved draft from localStorage (new expenses only) ----
  useEffect(() => {
    if (isEdit || draftRestoredRef.current) return;
    const draft = restoreDraft();
    if (draft && draft.form) {
      const d = draft.form;
      if (d.startLocation != null) setStartLocation(d.startLocation);
      if (d.destination != null) setDestination(d.destination);
      if (d.purpose != null) setPurpose(d.purpose);
      if (d.visitRef != null) setVisitRef(d.visitRef);
      if (d.remarks != null) setRemarks(d.remarks);
      if (d.startDate != null) setStartDate(d.startDate);
      if (d.startTime != null) setStartTime(d.startTime);
      if (d.endDate != null) setEndDate(d.endDate);
      if (d.endTime != null) setEndTime(d.endTime);
      if (d.marketer != null) setMarketer(d.marketer);
      if (d.categories) setCategories(prev => ({ ...prev, ...d.categories }));
    }
    draftRestoredRef.current = true;
  }, [isEdit, restoreDraft]);

  // ---- persist draft to localStorage (new expenses only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    // Don't persist completely empty state
    if (!startLocation && !destination && !purpose) return;
    persistDraft({
      form: {
        startLocation, destination, purpose, visitRef, remarks,
        startDate, startTime, endDate, endTime, marketer,
        categories: { Travel: { amount: categories.Travel.amount }, Stay: { amount: categories.Stay.amount }, Food: { amount: categories.Food.amount }, Other: { amount: categories.Other.amount } }
      }
    });
  }, [startLocation, destination, purpose, visitRef, remarks, startDate, startTime, endDate, endTime, marketer, categories, isEdit, persistDraft]);

  // Load existing expense for editing
  useEffect(() => {
    if (!editId) return;
    setLoading(true);
    marketingService.getExpenseTrip(editId).then(res => {
      const trip = res?.data || res;
      if (!trip) { toast.error('Expense not found'); navigate('/marketing/expenses'); return; }

      setStartLocation(trip.startLocation || '');
      setDestination(trip.destination || '');
      setPurpose(trip.purpose || '');
      setVisitRef(trip.visitRef || '');
      setRemarks(trip.remarks || '');
      setStartDate(trip.startDate || '');
      setStartTime(trip.startTime || '');
      setEndDate(trip.expectedEndDate || '');
      setEndTime(trip.expectedEndTime || '');
      setMarketer(trip.marketer || '');

      // Populate categories from existing expenses
      const expenses = trip.expenses || [];
      const newCats = {
        Travel: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null },
        Stay: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null },
        Food: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null },
        Other: { amount: '', billStatus: 'WITHOUT BILL', reason: '', file: null, existingAttachment: null, existingExpenseId: null }
      };

      expenses.forEach(exp => {
        if (newCats[exp.expenseType]) {
          newCats[exp.expenseType] = {
            amount: exp.amount || '',
            billStatus: exp.billStatus || 'WITHOUT BILL',
            reason: exp.withoutBillReason || '',
            file: null,
            existingAttachment: exp.attachments?.[0] || null,
            existingExpenseId: exp.id
          };
        }
      });

      setCategories(newCats);
    }).catch(err => {
      toast.error(err?.message || 'Failed to load expense');
      navigate('/marketing/expenses');
    }).finally(() => setLoading(false));
  }, [editId, navigate, toast]);

  // Calculate totals
  const totals = useMemo(() => {
    let travel = 0, stay = 0, food = 0, other = 0, withBill = 0, withoutBill = 0;
    CATEGORIES.forEach(c => {
      const amt = Number(categories[c.key].amount) || 0;
      if (c.key === 'Travel') travel = amt;
      else if (c.key === 'Stay') stay = amt;
      else if (c.key === 'Food') food = amt;
      else other = amt;
      if (categories[c.key].billStatus === 'WITH BILL') withBill += amt;
      else withoutBill += amt;
    });
    return { travel, stay, food, other, total: travel + stay + food + other, withBill, withoutBill };
  }, [categories]);

  // Update a category field
  const updateCategory = (key, field, value) => {
    setCategories(prev => ({
      ...prev,
      [key]: { ...prev[key], [field]: value }
    }));
  };

  // Handle file change for a category
  const handleFileChange = (key, file) => {
    setCategories(prev => ({
      ...prev,
      [key]: { ...prev[key], file, existingAttachment: null }
    }));
  };

  // Remove file for a category
  const removeFile = (key) => {
    setCategories(prev => ({
      ...prev,
      [key]: { ...prev[key], file: null, existingAttachment: null }
    }));
  };

  // Marketing Settings (DB-backed) expense limits — max single expense and
  // the amount above which a bill attachment is required. Falls back to
  // nulls (no limit) when settings are unavailable.
  const [expenseLimits, setExpenseLimits] = useState({ maxSingleExpense: null, requireBillAbove: null });
  useEffect(() => {
    let cancelled = false;
    marketingSettingsService.getSettings().then((s) => {
      if (cancelled) return;
      const es = s?.expenseSettings || {};
      setExpenseLimits({
        maxSingleExpense: Number(es.maxSingleExpense) > 0 ? Number(es.maxSingleExpense) : null,
        requireBillAbove: Number(es.requireBillAbove) > 0 ? Number(es.requireBillAbove) : null
      });
    }).catch(() => { /* no limits — validation skipped */ });
    return () => { cancelled = true; };
  }, []);

  // Save expense
  const saveExpense = async (approvalStatus = 'Draft') => {
    if (!startLocation) { toast.error('Start location is required'); return; }
    if (!startDate) { toast.error('Start date is required'); return; }

    // Check that at least one category has an amount
    const hasAnyAmount = CATEGORIES.some(c => Number(categories[c.key].amount) > 0);
    if (!hasAnyAmount) { toast.error('At least one expense category must have an amount'); return; }

    // Marketing Settings validation: per-category limits configured by the
    // administrator (persisted in the database via Marketing Settings).
    for (const c of CATEGORIES) {
      const amount = Number(categories[c.key].amount) || 0;
      if (expenseLimits.maxSingleExpense != null && amount > expenseLimits.maxSingleExpense) {
        toast.error(`${c.label} amount exceeds the maximum single expense (₹${expenseLimits.maxSingleExpense.toLocaleString('en-IN')})`);
        return;
      }
      if (expenseLimits.requireBillAbove != null && amount > expenseLimits.requireBillAbove
          && categories[c.key].billStatus !== 'WITH BILL') {
        toast.error(`${c.label} above ₹${expenseLimits.requireBillAbove.toLocaleString('en-IN')} requires a bill`);
        return;
      }
    }

    setSaving(true);
    try {
      let tripId;

      if (editId) {
        // Update existing expense
        await marketingService.updateExpenseTrip(editId, {
          startLocation,
          destination,
          purpose,
          startDate,
          startTime,
          expectedEndDate: endDate,
          expectedEndTime: endTime,
          remarks,
          visitRef: visitRef || null
        });
        tripId = editId;
      } else {
        // Create new expense
        const res = await marketingService.createExpenseTrip({
          startLocation,
          destination,
          purpose,
          startDate,
          startTime,
          expectedEndDate: endDate,
          expectedEndTime: endTime,
          remarks,
          visitRef: visitRef || null,
          travelPlanRef: null
        });
        const trip = res?.data || res;
        tripId = trip?.id;
        if (!tripId) throw new Error('Failed to create expense');
      }

      // Add/update expense entries for each category
      for (const cat of CATEGORIES) {
        const data = categories[cat.key];
        const amount = Number(data.amount) || 0;

        if (amount > 0) {
          const expensePayload = {
            expenseType: cat.key,
            expenseSubType: cat.label,
            amount,
            expenseDate: startDate,
            description: `${cat.label} expense`,
            billStatus: data.billStatus,
            withoutBillReason: data.billStatus === 'WITHOUT BILL' ? data.reason : null
          };

          let expenseId = data.existingExpenseId;

          if (expenseId) {
            // Update existing expense
            await marketingService.updateExpense(tripId, expenseId, expensePayload);
          } else {
            // Create new expense
            const expRes = await marketingService.addExpense(tripId, expensePayload);
            const updatedTrip = expRes?.data || expRes;
            const expenses = updatedTrip?.expenses || [];
            const lastExp = expenses[expenses.length - 1];
            expenseId = lastExp?.id;
          }

          // Upload bill if present
          if (data.file && expenseId) {
            await marketingService.uploadExpenseBill(tripId, expenseId, data.file);
          }
        } else if (data.existingExpenseId) {
          // Amount was cleared - delete the expense
          try { await marketingService.deleteExpense(tripId, data.existingExpenseId); } catch { /* ignore */ }
        }
      }

      // Clear localStorage draft after successful save
      clearFormDraft();
      // Submit if requested
      if (approvalStatus === 'Submitted') {
        await marketingService.submitExpenseTrip(tripId);
        toast.success('Expense submitted for approval');
      } else {
        toast.success(editId ? 'Expense updated' : 'Expense saved');
      }

      navigate('/marketing/expenses');
    } catch (err) {
      toast.error(err?.message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="qtn-create-page">
        <div className="qtn-create-inner">
          <div className="me-loading">Loading expense...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="qtn-create-page">
      <div className="qtn-create-inner">
        {/* Breadcrumb */}
        <div className="qtn-breadcrumb">
          <a href="/dashboard">Home</a> <i>›</i>
          <a href="/marketing">Marketing</a> <i>›</i>
          <a href="/marketing/expenses">Marketing Expenses</a> <i>›</i>
          <span>{editId ? 'Edit Marketing Expense' : 'New Marketing Expense'}</span>
        </div>

        {/* Page Title */}
        <div className="qtn-page-head">
          <h1 className="qtn-page-head-title">{editId ? 'Edit Marketing Expense' : 'New Marketing Expense'}</h1>
        </div>

        {/* Main Grid */}
        <div className="qtn-create-grid" style={{ alignItems: 'start' }}>
          <div className="qtn-main-form">

            {/* Section 1: Basic Details */}
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><MapPin size={15} /> Basic Details</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qtn-grid-2">
                  <div className="qtn-field">
                    <label>Start Location <span className="required">*</span></label>
                    <input className="qtn-input" value={startLocation} onChange={(e) => setStartLocation(e.target.value)} placeholder="e.g. Erode" />
                  </div>
                  <div className="qtn-field">
                    <label>Destination / Main Region</label>
                    <input className="qtn-input" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="e.g. Chennai" />
                  </div>
                </div>
                <div className="qtn-grid-2" style={{ marginTop: 16 }}>
                  <div className="qtn-field">
                    <label>Purpose of Marketing Visit</label>
                    <select className="qtn-select" value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                      <option value="">— Select —</option>
                      {PURPOSES.map(p => <option key={p}>{p}</option>)}
                    </select>
                  </div>
                  <div className="qtn-field">
                    <label>Marketing Visit Reference</label>
                    <input className="qtn-input" value={visitRef} onChange={(e) => setVisitRef(e.target.value)} placeholder="e.g. VST-001 or visit description" />
                  </div>
                </div>
                <div className="qtn-grid-2" style={{ marginTop: 16 }}>
                  <div className="qtn-field">
                    <label>Start Date <span className="required">*</span></label>
                    <input type="date" className="qtn-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div className="qtn-field">
                    <label>Start Time</label>
                    <input type="time" className="qtn-input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                  </div>
                  <div className="qtn-field">
                    <label>End Date</label>
                    <input type="date" className="qtn-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                  <div className="qtn-field">
                    <label>End Time</label>
                    <input type="time" className="qtn-input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                  </div>
                </div>
                <div className="qtn-grid-2" style={{ marginTop: 16 }}>
                  <div className="qtn-field">
                    <label>Remarks</label>
                    <textarea className="qtn-input" value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={2} placeholder="Optional remarks..." />
                  </div>
                </div>
              </div>
            </div>

            {/* Section 2: Expense Summary */}
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><DollarSign size={15} /> Expense Summary</h3>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>(Enter amounts for each category)</span>
              </div>
              <div className="qtn-card-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {CATEGORIES.map(cat => (
                    <CategoryCard
                      key={cat.key}
                      cat={cat}
                      data={categories[cat.key]}
                      onChange={updateCategory}
                      onFileChange={handleFileChange}
                      onRemoveFile={removeFile}
                    />
                  ))}
                </div>

                {/* Total */}
                <div style={{
                  marginTop: 20,
                  padding: '16px 20px',
                  background: '#0B4A3D',
                  borderRadius: 12,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <DollarSign size={20} style={{ color: '#fff' }} />
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Total Expense</span>
                  </div>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#fff' }}>{fmtINR(totals.total)}</span>
                </div>

                {/* Bill status summary */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 16 }}>
                  <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#059669' }}>{fmtINR(totals.withBill)}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>With Bill</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#D97706' }}>{fmtINR(totals.withoutBill)}</div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Without Bill</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '12px 8px', background: '#f9fafb', borderRadius: 10, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                      {CATEGORIES.filter(c => Number(categories[c.key].amount) > 0).length}
                    </div>
                    <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>Categories Used</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Sidebar: Quick Summary */}
          <div className="qtn-sidebar-form">
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><DollarSign size={15} /> Quick Summary</h3>
              </div>
              <div className="qtn-card-body">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {CATEGORIES.map(cat => (
                    <div key={cat.key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <cat.icon size={14} style={{ color: cat.color }} /> {cat.label}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: cat.color }}>{fmtINR(totals[cat.key.toLowerCase()])}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: 10, marginTop: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>Grand Total</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: '#0B4A3D' }}>{fmtINR(totals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer (ERP standard creation action bar) */}
        <CreationActionBar
          className="mkt-action-scope"
          onBackToList={() => navigate('/marketing/expenses')}
          onCancel={() => navigate('/marketing/expenses')}
          onSaveDraft={() => saveExpense('Draft')}
          draftLabel="Save as Draft"
          onSave={() => saveExpense('Draft')}
          saveLabel="Save Expense"
          onSubmit={() => saveExpense('Submitted')}
          disabled={saving}
        />
      </div>
    </div>
  );
}
