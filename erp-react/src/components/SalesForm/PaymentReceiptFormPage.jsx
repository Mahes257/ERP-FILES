import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CreationActionBar from '../Common/CreationActionBar';
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Info,
  Loader2,
  StickyNote,
  Users,
  Wallet,
} from 'lucide-react';
import { FormField, SelectInput, TextArea, TextInput, useToast } from '../Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import { useFormDraft } from '../../hooks/useFormDraft';
import ClientLookup from './ClientLookup';
import PendingAttachments from './PendingAttachments';
import SalesAttachments from '../SalesDetail/SalesAttachments';
import { SERIALIZERS } from '../../utils/salesHelpers';
import { normalizeSourceValue, STATES } from '../../constants/salesConstants';
import invoiceService from '../../services/invoiceService';
import customerService from '../../services/customerService';
import salesOrderService from '../../services/salesOrderService';

// ERP payment-receipt-create.html PRCreate.onModeChange: bank fields are shown
// only for Cheque / Bank Transfer / DD.
const BANK_FIELD_MODES = new Set(['Cheque', 'Bank Transfer', 'DD']);

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

// ERP "Amount in Words" (PRCreate.updateBalance uses VT.Utils.numberToWords).
function numberToWordsINR(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (num) => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
    if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
  };
  return convert(n) + ' Rupees Only';
}

const CLIENT_FIELDS = [
  'clientId', 'clientName', 'contactPerson', 'phone', 'email', 'gstin',
  'pan', 'city', 'state', 'pin', 'country', 'billingAddress', 'shippingAddress'
];

/**
 * Payment Receipt create/edit page — mirrors ERP payment-receipt-create.html:
 *
 *   [Payment Receipt: Company (From) | Received From (Customer) party row]
 *   [Receipt Details: Receipt Number | Payment Date | Payment Mode
 *                     (bank fields for Cheque/Bank Transfer/DD)
 *                     Reference No / UTR | Status]
 *   [Invoice Reference: Source | Invoice  →  Invoice KPI grid (Invoice Amount,
 *                       Outstanding, Balance after Payment) + Amount Received
 *                       + Amount in Words]
 *   [Remarks & Attachments: Remarks / Notes textarea + file upload]
 *   Footer: Save Draft | Save & New | Mark as Received
 *
 * Single main column, no sidebar. Reuses the shared ClientLookup,
 * PendingAttachments and SalesAttachments components.
 */
// backToList (optional) is the "Back" destination when it differs from
// navigateToList (which is also the base path for record URLs and post-save
// redirects) — it points at the module's list inside the Sales Execution hub.
export default function PaymentReceiptFormPage({ config, service, navigateToList, backToList }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(() => {
    const initial = { status: (config.statusOptions || config.statuses || ['Draft'])[0] || 'draft' };
    initial[config.dateKey] = new Date().toISOString().split('T')[0];
    if (config.defaults) {
      Object.entries(config.defaults).forEach(([key, fn]) => {
        if (initial[key] == null) initial[key] = typeof fn === 'function' ? fn() : fn;
      });
    }
    return initial;
  });
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({
    moduleKey: config.moduleKey,
    setForm,
    enabled: !isEdit
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [clientVisible, setClientVisible] = useState(isEdit);
  const [invoices, setInvoices] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // ---- form draft persistence ----
  const draftRestoredRef = useRef(false);
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    config.moduleKey, id || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const paymentModes = config.paymentModeOptions || ['Cash', 'Cheque', 'Bank Transfer', 'DD', 'Credit Card', 'UPI', 'Online', 'Other'];
  const statusOptions = config.statusOptions || config.statuses || ['Draft'];

  // ERP PRCreate.populateSourceRefs: Source = "From Invoice" (short code 'inv')
  // loads the open invoices.
  useEffect(() => {
    if (form.source !== 'inv') return undefined;
    let cancelled = false;
    invoiceService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        setInvoices(
          parseListResponse(res).map((inv) => ({
            value: String(inv.id || inv.invoiceNo || ''),
            label: `${inv.invoiceNo || inv.id} - ${inv.clientName || ''}`.trim(),
            doc: inv
          }))
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.source]);

  // ERP PRCreate.loadFromSource: picking an invoice shows the KPI grid, auto-fills
  // the customer, and pre-fills the Amount with the outstanding balance.
  const handleInvoiceChange = (value) => {
    setField('invoiceRef', value);
    const opt = invoices.find((o) => o.value === value);
    const inv = opt?.doc || null;
    setSelectedInvoice(inv);
    if (!inv) return;
    if (inv.clientName || inv.customerName) {
      setClientVisible(true);
      setField('clientName', inv.clientName || inv.customerName || '');
    }
    const invAmt = Number(inv.grandTotal || inv.totalAmount || 0) || 0;
    const paidSoFar = Number(inv.paidAmount || 0) || 0;
    const outstanding = Math.max(0, invAmt - paidSoFar);
    setField('amount', outstanding > 0 ? String(outstanding) : '');
  };

  // Auto-fill from a selected customer (ERP CustomerLookup).
  const handleClientSelect = (customer) => {
    setClientVisible(true);
    setField('clientId', customer.id);
    setField('clientName', customer.businessName || '');
    setField('contactPerson', customer.contactPerson || '');
    setField('phone', customer.phone || '');
    setField('email', customer.email || '');
    setField('gstin', customer.gstin || '');
    setField('pan', customer.pan || '');
    setField('city', customer.billingCity || '');
    setField('state', customer.billingState || '');
    setField('pin', customer.billingPin || '');
    setField('billingAddress', customer.billingAddress || '');
    setField('shippingAddress', customer.shippingAddress || customer.billingAddress || '');
  };

  // Prefill from a source invoice query param (?inv=12).
  useEffect(() => {
    if (isEdit) return undefined;
    const sourceId = searchParams.get('inv');
    if (!sourceId) return undefined;
    let cancelled = false;
    invoiceService
      .get(sourceId)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        const patch = { source: 'inv', invoiceRef: String(raw.id ?? sourceId) };
        CLIENT_FIELDS.forEach((key) => {
          if (raw[key] != null && raw[key] !== '') patch[key] = raw[key];
        });
        const invAmt = Number(raw.grandTotal || raw.totalAmount || 0) || 0;
        const paidSoFar = Number(raw.paidAmount || 0) || 0;
        patch.amount = invAmt - paidSoFar > 0 ? String(invAmt - paidSoFar) : '';
        if (raw.clientName || raw.customerName) setClientVisible(true);
        setSelectedInvoice(raw);
        setForm((prev) => ({ ...prev, ...patch }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit, searchParams]);

  // Prefill from a Customer Purchase Order (?so=<id>, CPO view/list
  // conversion). A CPO is not an invoice, so no Invoice Reference is invented:
  // the receipt opens as Direct with the CPO's customer block, the amount
  // received at the CPO total (what the one-click conversion wrote) and a
  // remark naming the source — all editable. Nothing is created or linked
  // until the user saves.
  useEffect(() => {
    if (isEdit) return undefined;
    const sourceId = searchParams.get('so');
    if (!sourceId) return undefined;
    let cancelled = false;
    salesOrderService
      .get(sourceId, { suppressGlobalError: true })
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        if (!raw.soNo && !raw.id) {
          toast.error('Customer Purchase Order could not be loaded');
          return;
        }
        const patch = {};
        CLIENT_FIELDS.forEach((key) => {
          if (raw[key] != null && raw[key] !== '') patch[key] = raw[key];
        });
        if (raw.grandTotal != null) patch.amount = String(Number(raw.grandTotal) || '');
        patch.remarks = `Payment receipt generated from Customer Purchase Order ${raw.soNo || sourceId}`;
        if (raw.clientName) setClientVisible(true);
        setForm((prev) => ({ ...prev, ...patch }));
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load the source Customer Purchase Order');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, searchParams]);

  // Client actions menu deep-link (?clientId=): pre-fill the customer details
  // from the saved Client record (same auto-fill as picking it in the lookup).
  useEffect(() => {
    if (isEdit) return undefined;
    const clientId = searchParams.get('clientId');
    if (!clientId) return undefined;
    let cancelled = false;
    customerService
      .get(clientId)
      .then((res) => {
        if (cancelled) return;
        const customer = res?.data ?? res ?? {};
        const patch = {};
        const map = {
          clientId: customer.id,
          clientName: customer.businessName,
          contactPerson: customer.contactPerson,
          phone: customer.phone,
          email: customer.email,
          gstin: customer.gstin,
          pan: customer.pan,
          city: customer.billingCity,
          state: customer.billingState,
          pin: customer.billingPin,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress || customer.billingAddress
        };
        CLIENT_FIELDS.forEach((key) => {
          if (map[key] != null && map[key] !== '') patch[key] = map[key];
        });
        if (customer.businessName) setClientVisible(true);
        setForm((prev) => ({ ...prev, ...patch }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit, searchParams]);

  // Auto-generated Receipt Number (ERP: readonly, bold, PR-YYYY-XXXXXX).
  useEffect(() => {
    if (isEdit) return undefined;
    let cancelled = false;
    service
      .getNextNumber()
      .then((res) => {
        if (cancelled) return;
        const value = res?.data?.receiptNo || res?.data?.nextNumber;
        if (value) setForm((prev) => ({ ...prev, receiptNo: value }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit, service]);

  // Load an existing Payment Receipt (edit mode). `service` is omitted from the
  // deps on purpose: the factory builds a fresh object each render, which would
  // otherwise re-trigger the load and reset the form on every render.
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    service
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        const toForm = {};
        const DATE_KEYS = new Set(['validTill', 'validity', 'dueDate', 'deliveryDate', 'dispatchDate', 'validUntil']);
        Object.keys(raw).forEach((key) => {
          if (typeof raw[key] === 'string' && (DATE_KEYS.has(key) || /Date$/.test(key))) {
            toForm[key] = raw[key].slice(0, 10);
          } else {
            toForm[key] = raw[key];
          }
        });
        // Backend stores lowercase statuses; the ERP select uses title case.
        if (typeof toForm.status === 'string' && toForm.status) {
          toForm.status = toForm.status.charAt(0).toUpperCase() + toForm.status.slice(1);
        }
        // Source is stored as an ERP short code (''/inv) or, for records created
        // before the short-code alignment, a legacy display string ('From
        // Invoice', 'Direct', ...). Normalize so the Source select pre-selects
        // the saved value on edit.
        if (toForm.source != null) {
          toForm.source = normalizeSourceValue(toForm.source);
        }
        setForm((prev) => ({ status: prev.status, ...toForm }));
        setAttachments(Array.isArray(raw.attachments) ? raw.attachments : []);
        setClientVisible(Boolean(raw.clientName));
        if (raw.invoiceRef) {
          // invoiceRef stores the invoice's numeric id (the select option value).
          // Load it to restore the KPI grid / amount context on edit.
          invoiceService
            .get(String(raw.invoiceRef).trim())
            .then((r) => setSelectedInvoice(r?.data ?? r ?? null))
            .catch(() => {});
        }
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load Payment Receipt');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setAttachmentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // ---- restore unsaved draft from localStorage (new records only) ----
  useEffect(() => {
    if (isEdit || draftRestoredRef.current) return;
    // A conversion opens prefilled from its source document (?inv= / ?so=<id>)
    // — an unrelated local draft must not replace that prefill, and the
    // prefill is not autosaved over it (draftRestoredRef stays false).
    if (['inv', 'so'].some((k) => searchParams.get(k))) return;
    const draft = restoreDraft();
    if (draft) {
      // Payment Receipts have no item grid — the line amounts come from the
      // linked invoice — so only the form fields are restored here.
      if (draft.form) setForm((prev) => ({ ...prev, ...draft.form }));
    }
    draftRestoredRef.current = true;
  }, [isEdit, restoreDraft]);

  // ---- persist draft to localStorage (new records only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    if (!form.clientName && !form.amount) return;
    persistDraft({ form });
  }, [form, isEdit, persistDraft]);

  const amount = Number(form.amount) || 0;
  const amountWords = useMemo(() => numberToWordsINR(amount), [amount]);

  // ERP KPI grid values (Invoice Amount / Outstanding / Balance after Payment).
  const invoiceAmount = Number(selectedInvoice?.grandTotal || selectedInvoice?.totalAmount || 0) || 0;
  const paidSoFar = Number(selectedInvoice?.paidAmount || 0) || 0;
  const outstanding = Math.max(0, invoiceAmount - paidSoFar);
  const balanceAfter = Math.max(0, outstanding - amount);
  const showInvoiceKpis = Boolean(selectedInvoice);

  const validate = (draft = false) => {
    if (draft) return true;
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return false;
    }
    if (!form.paymentMode) {
      toast.error('Please select a payment mode');
      return false;
    }
    return true;
  };

  const save = async ({ draft = false, stay = false, received = false, quiet = false, view = false } = {}) => {
    if (!validate(draft)) return;
    setSaving(true);
    try {
      const payload = SERIALIZERS.paymentReceipt(form);
      if (received) payload.status = 'Received';
      const res = isEdit ? await service.update(id, payload) : await service.create(payload, draft);
      const created = res?.data ?? {};
      const no = created.receiptNo || form.receiptNo || '';
      if (!isEdit && created?.id && pendingFiles.length > 0) {
        const results = await service.uploadMany(created.id, pendingFiles);
        const failed = results.filter((r) => !r.ok).length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
        if (failed > 0) {
          const firstFailed = results.find((r) => !r.ok);
          toast.error(
            failed === results.length && firstFailed?.error?.message
              ? firstFailed.error.message
              : `${failed} attachment(s) failed to upload`
          );
        }
      }
      // Clear localStorage draft after successful save
      clearFormDraft();
      toast.success(
        received ? `${no} marked as received` : isEdit ? `${no} updated` : `${no} ${draft ? 'saved as draft' : 'created'}`
      );
      if (stay) {
        setForm((prev) => ({
          status: (config.statusOptions || config.statuses || ['Draft'])[0] || 'draft',
          [config.dateKey]: new Date().toISOString().split('T')[0],
          companyName: prev.companyName,
          companyAddress: prev.companyAddress
        }));
        setPendingFiles([]);
        setAttachments([]);
        setClientVisible(false);
        setSelectedInvoice(null);
        const next = await service.getNextNumber().catch(() => ({}));
        const value = next?.data?.receiptNo || next?.data?.nextNumber;
        if (value) setForm((prev) => ({ ...prev, receiptNo: value }));
      } else if (view) {
        // Save and Continue: the receipt is persisted (the await above
        // succeeded), so open THAT receipt's record page — the same View page
        // the Payment Receipts list opens for a row.
        const savedId = created.id || id;
        navigate(savedId ? `${navigateToList || '/payment-receipts'}/${savedId}` : navigateToList || '/payment-receipts');
      } else if (!quiet) {
        navigate(navigateToList || '/payment-receipts');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';
  const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';
  const cardCls = 'bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden';
  const cardHeaderCls = 'flex items-center gap-3 px-5 py-4 border-b border-slate-100';
  const cardTitleCls = 'flex items-center gap-2.5 text-sm font-bold text-slate-900';
  const iconWrapCls = 'p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0';
  const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const showBankFields = BANK_FIELD_MODES.has(form.paymentMode);

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>Sales</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Sales Execution</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Payment Receipts</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="text-slate-600">{isEdit ? 'Edit' : 'Create'}</span>
      </div>

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Wallet className="w-6 h-6 text-[#0B4A3D]" />
            {isEdit ? 'Edit Payment Receipt' : 'Create Payment Receipt'}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(backToList || navigateToList || '/payment-receipts')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to List
        </button>
      </div>

      {/* ===== SINGLE MAIN COLUMN (ERP layout, no sidebar) ===== */}
      <div className="max-w-5xl space-y-4">
        {/* ===== 1. PAYMENT RECEIPT: Company (From) + Received From party row ===== */}
        <div className={cardCls}>
          <div className={cardHeaderCls}>
            <h3 className={cardTitleCls}>
              <span className={iconWrapCls}><FileText className="w-4 h-4" /></span>
              Payment Receipt
            </h3>
          </div>
          <div className="p-5">
            <div className="flex flex-col lg:flex-row gap-5">
              {/* From (Your Company) */}
              <div className="flex-1 lg:flex-[2]">
                <div className="mb-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="p-1.5 rounded-md bg-slate-100 text-slate-500"><Building2 className="w-3 h-3" /></span>
                    From (Your Company)
                  </h4>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className={labelCls}>Company Name</label>
                    <TextInput type="text" value={form.companyName || ''} onChange={(e) => setField('companyName', e.target.value)} className={inputCls} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelCls}>GSTIN</label>
                      <TextInput type="text" value={form.companyGstin || ''} onChange={(e) => setField('companyGstin', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>PAN</label>
                      <TextInput type="text" value={form.companyPan || ''} onChange={(e) => setField('companyPan', e.target.value)} className={inputCls} />
                    </div>
                    <div>
                      <label className={labelCls}>State</label>
                      <SelectInput value={form.companyState || ''} onChange={(e) => setField('companyState', e.target.value)} className={inputCls}>
                        <option value="">Select</option>
                        {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </SelectInput>
                    </div>
                  </div>
                  <div>
                    <label className={labelCls}>Address</label>
                    <TextArea rows={2} value={form.companyAddress || ''} onChange={(e) => setField('companyAddress', e.target.value)} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Received From (Customer) */}
              <div className="flex-1 lg:flex-[3]">
                <div className="mb-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="p-1.5 rounded-md bg-slate-100 text-slate-500"><Users className="w-3 h-3" /></span>
                    Received From (Customer)
                  </h4>
                </div>
                <div className="space-y-4">
                  <FormField label="Select Customer">
                    <ClientLookup
                      value={form.clientName}
                      onChange={(name) => setField('clientName', name)}
                      onAutoFill={handleClientSelect}
                      label="Select Customer"
                      placeholder="Search customer by Name, Code, GST, Phone, Email..."
                      portal
                    />
                  </FormField>
                  {clientVisible && (
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>GSTIN</label>
                        <div className="w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] text-slate-600 min-h-[38px] flex items-center">{form.gstin || '—'}</div>
                      </div>
                      <div>
                        <label className={labelCls}>Email</label>
                        <div className="w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] text-slate-600 min-h-[38px] flex items-center">{form.email || '—'}</div>
                      </div>
                      <div>
                        <label className={labelCls}>Phone</label>
                        <div className="w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] text-slate-600 min-h-[38px] flex items-center">{form.phone || '—'}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== 2. RECEIPT DETAILS ===== */}
        <div className={cardCls}>
          <div className={cardHeaderCls}>
            <h3 className={cardTitleCls}>
              <span className={iconWrapCls}><FileText className="w-4 h-4" /></span>
              Receipt Details
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Receipt Number</label>
                <TextInput
                  type="text"
                  value={form.receiptNo || ''}
                  onChange={(e) => setField('receiptNo', e.target.value)}
                  placeholder="Auto-generated (PR-YYYY-XXXXXX)"
                  readOnly
                  className="w-full bg-slate-100 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-600/50 transition-all shadow-inner cursor-not-allowed"
                />
              </div>
              <div>
                <label className={labelCls}>Payment Date</label>
                <TextInput type="date" value={form.paymentDate || ''} onChange={(e) => setField('paymentDate', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Payment Mode</label>
                <SelectInput value={form.paymentMode || ''} onChange={(e) => setField('paymentMode', e.target.value)} className={inputCls}>
                  <option value="">Select Mode...</option>
                  {paymentModes.map((m) => <option key={m} value={m}>{m}</option>)}
                </SelectInput>
              </div>
            </div>
            {showBankFields && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>Bank Name</label>
                  <TextInput type="text" value={form.bankName || ''} onChange={(e) => setField('bankName', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Branch</label>
                  <TextInput type="text" value={form.branch || ''} onChange={(e) => setField('branch', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Cheque No / Transaction ID</label>
                  <TextInput type="text" value={form.chequeTx || ''} onChange={(e) => setField('chequeTx', e.target.value)} className={inputCls} />
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Reference No / UTR</label>
                <TextInput type="text" value={form.referenceNo || ''} onChange={(e) => setField('referenceNo', e.target.value)} placeholder="REF/UTR number" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <SelectInput value={form.status || ''} onChange={(e) => setField('status', e.target.value)} className={inputCls}>
                  {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectInput>
              </div>
              <div />
            </div>
          </div>
        </div>

        {/* ===== 3. INVOICE REFERENCE ===== */}
        <div className={cardCls}>
          <div className={cardHeaderCls}>
            <h3 className={cardTitleCls}>
              <span className={iconWrapCls}><FileText className="w-4 h-4" /></span>
              Invoice Reference
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Source</label>
                <SelectInput value={form.source || ''} onChange={(e) => { setField('source', e.target.value); setInvoices([]); setSelectedInvoice(null); setField('invoiceRef', ''); }} className={inputCls}>
                  <option value="">Direct</option>
                  <option value="inv">From Invoice</option>
                </SelectInput>
              </div>
              <div>
                <label className={labelCls}>Invoice</label>
                <SelectInput value={form.invoiceRef || ''} onChange={(e) => handleInvoiceChange(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {invoices.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectInput>
              </div>
              <div />
            </div>
            {showInvoiceKpis && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 rounded-lg py-3 px-2 text-center">
                  <div className="text-[11px] text-slate-500 font-medium">Invoice Amount</div>
                  <div className="text-base font-bold text-slate-900">{fmt(invoiceAmount)}</div>
                </div>
                <div className="bg-amber-50 rounded-lg py-3 px-2 text-center">
                  <div className="text-[11px] text-slate-500 font-medium">Outstanding</div>
                  <div className="text-base font-bold text-red-600">{fmt(outstanding)}</div>
                </div>
                <div className="bg-emerald-50 rounded-lg py-3 px-2 text-center">
                  <div className="text-[11px] text-slate-500 font-medium">Balance after Payment</div>
                  <div className="text-base font-bold text-emerald-700">{fmt(balanceAfter)}</div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Amount Received</label>
                <TextInput type="number" min="0" step="0.01" value={form.amount ?? ''} onChange={(e) => setField('amount', e.target.value)} className={`${inputCls} !text-base !font-bold`} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Amount in Words</label>
                <div className="px-3 py-2 text-[13px] text-slate-500 italic min-h-[38px] flex items-center">{amountWords}</div>
              </div>
            </div>
          </div>
        </div>

        {/* ===== 4. REMARKS & ATTACHMENTS ===== */}
        <div className={cardCls}>
          <div className={cardHeaderCls}>
            <h3 className={cardTitleCls}>
              <span className={iconWrapCls}><StickyNote className="w-4 h-4" /></span>
              Remarks &amp; Attachments
            </h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className={labelCls}>Remarks / Notes</label>
              <TextArea rows={3} value={form.remarks || ''} onChange={(e) => setField('remarks', e.target.value)} placeholder="Internal notes..." className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Attachments</label>
              {attachmentsLoading ? (
                <div className="flex items-center justify-center py-10 text-xs text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading attachments...
                </div>
              ) : isEdit ? (
                <SalesAttachments service={service} docId={id} attachments={attachments} onChanged={() => {
                  service.getAttachments(id).then((res) => setAttachments(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [])).catch(() => {});
                }} />
              ) : (
                <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) ===== */}
      <CreationActionBar
        showBackToList={false}
        onCancel={() => navigate(backToList || navigateToList || '/payment-receipts')}
        onSaveDraft={!isEdit ? () => save({ draft: true }) : null}
        onSaveNew={!isEdit ? () => save({ stay: true }) : null}
        onSave={() => save({})}
        saveLabel={isEdit ? 'Update' : 'Save'}
        onSaveContinue={() => save({ view: true })}
        onSubmit={!isEdit ? () => save({ received: true }) : null}
        submitLabel="Mark as Received"
        submitIcon={CheckCircle2}
        disabled={saving}
      />
    </div>
  );
}
