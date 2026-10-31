/**
 * purchase/components/InvoiceForm.jsx
 * ------------------------------------------------------------------
 * Shared create / edit form for the Purchase Invoice module.
 *
 * The form is driven by eligible Goods-Receipt sources: picking a GRN
 * auto-populates vendor, PO, received lines (rate / GST from the PO)
 * and a live amount summary computed with the same calcDocumentTotals
 * utility used by the PO module — the user only keys in what a vendor
 * invoice actually adds (vendor invoice number, dates, discounts,
 * notes, attachment). A manual-entry mode remains for invoices that
 * are not backed by a GRN yet.
 *
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BadgeCheck, Building2, CalendarDays, Package, Receipt, Wallet } from 'lucide-react';
import { ConfirmDialog, DateInput, EmailInput, FormField, NumberInput, SearchableSelect, SelectInput, TextArea, TextInput, useToast } from './ui';
import AttachmentManager from './AttachmentManager';
import FormActions from './FormActions';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import { GST_TYPES, INVOICE_STATUS, PAYMENT_METHODS, PAYMENT_TERMS } from '../constants';
import { invoiceSchema } from '../validation/requisition';
import { invoiceService, invoicesStore, nextInvoiceNo } from '../services/invoice';
import { vendorService } from '../services/vendor';
import { calcDocumentTotals, formatAmount } from '../utils/purchase';
import useFormDraft from '../hooks/useFormDraft';

const MANUAL_SOURCE = '__manual__';

const INVOICE_TYPES = ['Standard', 'Supplementary', 'Debit Note', 'Credit Note'];

/** Shared empty array so derived values keep a stable identity. */
const EMPTY_ITEMS = [];

/** Adds n calendar days to an ISO yyyy-mm-dd date. */
function addDays(isoDate, days) {
  const date = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Parses "30 Days" / "7 Days" style payment terms into days. */
function termsDays(terms) {
  const match = String(terms || '').match(/(\d+)\s*Days/i);
  return match ? Number(match[1]) : 0;
}

function lineAmount(line) {
  return (Number(line.qty) || 0) * (Number(line.rate) || 0);
}

function buildInvoiceFormValues(record = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    vendor: record.vendor || '',
    vendorEmail: record.vendorEmail || '',
    poNo: record.poNo || '',
    grnNo: record.grnNo || '',
    vendorInvoiceNo: record.vendorInvoiceNo || '',
    vendorReference: record.vendorReference || '',
    invoiceType: record.invoiceType || INVOICE_TYPES[0],
    invoiceDate: record.invoiceDate || today,
    dueDate: record.dueDate || addDays(record.invoiceDate || today, termsDays(record.paymentTerms) || 30),
    gstType: record.gstType || '',
    discount: String(record.discount ?? ''),
    charges: String(record.charges ?? ''),
    freight: String(record.freight ?? ''),
    tdsPercent: String(record.tdsPercent ?? ''),
    retentionPercent: String(record.retentionPercent ?? ''),
    amount: String(record.amount ?? ''),
    gst: String(record.gst ?? ''),
    paymentMethod: record.paymentMethod || PAYMENT_METHODS[0],
    paymentTerms: record.paymentTerms || '',
    status: record.status || INVOICE_STATUS.DRAFT,
    notes: record.notes || '',
    items: Array.isArray(record.items) ? record.items : [],
    attachments: Array.isArray(record.attachments) ? record.attachments : []
  };
}

export default function InvoiceForm({ initialData, invoiceId }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const { loadDraft, saveDraft: persistDraft, saveDraftNow, clearDraft } = useFormDraft({
    draftKey: 'purchase.invoice',
    recordId: invoiceId || null,
  });

  const [vendorNames, setVendorNames] = useState([]);
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);

  const [userInvoiceNo, setUserInvoiceNo] = useState(
    () => (invoiceId ? initialData?.invoiceNo || '' : nextInvoiceNo(invoicesStore.all))
  );
  const [sourceKey, setSourceKey] = useState(() => initialData?.grnNo || '');

  /* The next invoice number must come from the DATABASE, never from the local
     store: in API mode the local store is empty, so the client-side guess
     handed out a number that already existed and the save failed with 400
     "Invoice number already exists". */
  useEffect(() => {
    if (invoiceId || initialData?.invoiceNo) return undefined;
    let cancelled = false;
    invoiceService.getNextInvoiceNumber().then((nextNumber) => {
      if (!cancelled && nextNumber) setUserInvoiceNo(nextNumber);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [initialData?.invoiceNo, invoiceId]);

  const form = useForm({
    resolver: zodResolver(invoiceSchema),
    defaultValues: buildInvoiceFormValues(initialData),
    mode: 'onTouched'
  });

  const { register, handleSubmit, reset, control, setValue, formState } = form;
  const { errors } = formState;
  const watched = useWatch({ control });

  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  /* ---- apply a GRN source (prefill vendor / PO / lines / terms) ---- */
  const fillFromSource = (source) => {
    const terms = source.terms || '';
    setValue('vendor', source.vendor || '', { shouldDirty: true });
    setValue('poNo', source.poNo || '', { shouldDirty: true });
    setValue('grnNo', source.grnNo || '', { shouldDirty: true });
    setValue('gstType', source.gstType || '', { shouldDirty: true });
    setValue('paymentTerms', terms, { shouldDirty: true });
    setValue('discount', String(source.discount ?? ''), { shouldDirty: true });
    setValue('charges', String(source.charges ?? ''), { shouldDirty: true });
    setValue('freight', String(source.freight ?? ''), { shouldDirty: true });
    setValue(
      'items',
      (source.items || []).map((line) => ({
        itemCode: line.itemCode || '',
        product: line.product,
        hsn: line.hsn || '',
        uom: line.uom || '',
        orderQty: line.orderQty || 0,
        received: line.received || 0,
        qty: line.received || 0,
        rate: line.rate || 0,
        discount: line.discount || 0,
        gstRate: line.gstRate || 0
      })),
      { shouldDirty: true }
    );
    const values = form.getValues();
    const due = termsDays(terms);
    if (due > 0 && !values.dueDate) {
      setValue('dueDate', addDays(values.invoiceDate, due), { shouldDirty: true });
    }
  };

  /* ---- master data + eligible receipt sources ---- */
  const preselectedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    vendorService
      .getVendorNames()
      .then((names) => {
        if (!cancelled) setVendorNames(names);
      })
      .catch(() => {});
    invoiceService
      .getInvoiceSources()
      .then((list) => {
        if (cancelled) return;
        const nextSources = list || [];
        setSources(nextSources);
        /* Preselect from URL (?grn=…&po=…) or an existing record's GRN
           once the source list has loaded (async, never blocks render). */
        if (!preselectedRef.current) {
          preselectedRef.current = true;
          const requested =
            (invoiceId && initialData?.grnNo) ||
            searchParams.get('grn') ||
            searchParams.get('po');
          const target = nextSources.find(
            (entry) => entry.grnNo === requested || entry.poNo === requested
          );
          if (target) {
            if ((form.getValues('items') || []).length > 0) {
              setSourceKey(target.grnNo);
            } else {
              setSourceKey(target.grnNo);
              fillFromSource(target);
            }
          }
        }
        setSourcesLoading(false);
      })
      .catch(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time master-data load
  }, []);

  /* ---- draft persistence: load on mount, debounced save on change ---- */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      reset({ ...buildInvoiceFormValues(initialData), ...draft }, { keepDefaultValues: false });
      if (draft.invoiceNo) {
        /* Defer so the number (a plain useState) is applied after mount. */
        setTimeout(() => setUserInvoiceNo(draft.invoiceNo), 0);
      }
      toast.info('Draft restored');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    if (watched) persistDraft({ ...watched, invoiceNo: userInvoiceNo });
  }, [watched, persistDraft, userInvoiceNo]);

  /* ---- apply a user-selected GRN source ---- */
  const applySource = (key) => {
    if (key === MANUAL_SOURCE || !key) {
      setSourceKey(key || '');
      setValue('items', [], { shouldDirty: true });
      setValue('grnNo', '', { shouldDirty: true });
      return;
    }
    const source = sources.find((entry) => entry.grnNo === key);
    if (!source) return;
    setSourceKey(key);
    fillFromSource(source);
  };

  /* ---- live totals via the shared PO calculation utility ---- */
  const items = Array.isArray(watched?.items) ? watched.items : EMPTY_ITEMS;
  const hasItems = items.length > 0;
  const discount = Number(watched?.discount) || 0;
  const charges = Number(watched?.charges) || 0;

  const totals = useMemo(() => {
    if (!hasItems) return null;
    return calcDocumentTotals(
      items.map((line) => ({
        qty: Number(line.qty) || 0,
        rate: Number(line.rate) || 0,
        discount: Number(line.discount) || 0,
        gstRate: Number(line.gstRate) || 0
      })),
      discount,
      charges,
      watched?.gstType || ''
    );
  }, [items, discount, charges, watched?.gstType, hasItems]);

  /* Keep the registered amount / GST fields in sync with line math so
     the shared schema + print actions see one consistent figure. */
  useEffect(() => {
    if (!hasItems || !totals) return;
    if (Number(watched?.amount) !== totals.taxable) setValue('amount', String(totals.taxable), { shouldValidate: false, shouldDirty: false });
    if (Number(watched?.gst) !== totals.gstTotal) setValue('gst', String(totals.gstTotal), { shouldValidate: false, shouldDirty: false });
  }, [hasItems, totals, watched?.amount, watched?.gst, setValue]);

  const manualAmount = Number(watched?.amount) || 0;
  const manualGst = Number(watched?.gst) || 0;
  const grandTotal = totals ? totals.roundedTotal : manualAmount + manualGst + charges;
  const taxable = totals ? totals.taxable : manualAmount;

  const persist = async (values, targetStatus) => {
    setSubmitting(true);
    try {
      const payload = { ...values, invoiceNo: userInvoiceNo, status: targetStatus };
      const isDraft = targetStatus === INVOICE_STATUS.DRAFT;
      if (invoiceId) {
        await invoiceService.updateInvoice(invoiceId, payload);
        if (!isDraft && initialData?.status === INVOICE_STATUS.DRAFT) {
          /* A full-payload update never flips a Draft to Submitted, so submit
             explicitly — otherwise the button silently leaves it a Draft. */
          await invoiceService.submitInvoice(invoiceId);
        }
        toast.success(isDraft ? 'Draft saved' : 'Invoice updated successfully');
        if (!isDraft) clearDraft();
        navigate(`/purchase/invoices/${invoiceId}`);
      } else {
        const created = await invoiceService.createInvoice(payload);
        if (!isDraft) {
          /* Create always persists a Draft on the backend; submitting is a
             separate transition, so call it explicitly or the invoice
             silently stayed a Draft while the UI toasted success. */
          await invoiceService.submitInvoice(created.id);
        }
        toast.success(isDraft ? 'Draft saved' : 'Invoice recorded successfully');
        if (!isDraft) clearDraft();
        navigate(`/purchase/invoices/${created.id}`);
      }
    } catch (err) {
      toast.error(err?.message || (invoiceId ? 'Failed to update invoice' : 'Failed to record invoice'));
    } finally {
      setSubmitting(false);
      setDraftSaving(false);
    }
  };

  const onSubmit = handleSubmit(() => {
    const values = form.getValues();
    const targetStatus = invoiceId
      ? initialData?.status || INVOICE_STATUS.SUBMITTED
      : INVOICE_STATUS.SUBMITTED;
    persist(values, targetStatus);
  });

  const onSaveDraft = handleSubmit(async () => {
    await persist(form.getValues(), INVOICE_STATUS.DRAFT);
  });

  /* ---- Reset ---- */
  const handleReset = () => setConfirmResetOpen(true);

  const confirmReset = () => {
    setConfirmResetOpen(false);
    reset(buildInvoiceFormValues(initialData));
    setSourceKey(initialData?.grnNo || '');
    clearDraft();
  };

  const docLines = hasItems
    ? items.map((line) => ({
        itemCode: line.itemCode || '',
        product: line.product || '',
        hsn: line.hsn || '',
        uom: line.uom || '',
        qty: Number(line.qty) || 0,
        rate: Number(line.rate) || 0,
        amount: lineAmount(line),
        gstRate: Number(line.gstRate) || 0
      }))
    : [];

  const printInvoice = () => {
    const v = watched || {};
    const meta = [
      ['Vendor', v.vendor],
      ['PO Reference', v.poNo],
      ['GRN Reference', v.grnNo],
      ['Vendor Invoice No', v.vendorInvoiceNo],
      ['Invoice No', userInvoiceNo],
      ['Invoice Date', v.invoiceDate],
      ['Due Date', v.dueDate],
      ['Payment Terms', v.paymentTerms],
      ['Payment Method', v.paymentMethod]
    ];
    const rows = docLines.length
      ? docLines.map((r) => ({
          description: `${r.product}${r.hsn ? ` (${r.hsn})` : ''}`,
          value: `${r.qty} × ${r.rate}`,
          amount: r.amount
        }))
      : [
          { description: 'Invoice amount (excl. GST)', value: '', amount: taxable },
          { description: `GST${watched?.gstType ? ` (${watched.gstType})` : ''}`, value: '', amount: totals ? totals.gstTotal : manualGst }
        ];
    const win = window.open('', '_blank', 'width=860,height=640');
    if (!win) return;
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Purchase Invoice</title>
      <style>body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;padding:32px;color:#0f172a}
      h1{font-size:18px;margin:0 0 4px}.meta{font-size:12px;color:#64748b;margin-bottom:20px}
      table{width:100%;border-collapse:collapse;font-size:12px}
      th{background:#1e3a8a;color:#f1f5f9;text-align:left;padding:8px 10px;font-weight:700}
      td{padding:7px 10px;border-bottom:1px solid #e2e8f0}
      .tot td{border-top:2px solid #1e3a8a;font-weight:700}</style></head><body>
      <h1>Purchase Invoice</h1><div class="meta">${meta.map(([k, val]) => `${k}: ${String(val ?? '—')}`).join(' · ')}</div>
      <table><thead><tr><th>Description</th><th style="text-align:right">Detail</th><th style="text-align:right">Amount</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${String(r.description)}</td><td style="text-align:right">${String(r.value || '')}</td><td style="text-align:right">${formatAmount(r.amount, 'INR')}</td></tr>`).join('')}
      ${totals ? `<tr class="tot"><td colspan="2">Taxable Value</td><td style="text-align:right">${formatAmount(totals.taxable, 'INR')}</td></tr>
      <tr><td colspan="2">GST (${watched?.gstType || 'CGST+SGST'})</td><td style="text-align:right">${formatAmount(totals.gstTotal, 'INR')}</td></tr>
      ${totals.charges ? `<tr><td colspan="2">Charges</td><td style="text-align:right">${formatAmount(totals.charges, 'INR')}</td></tr>` : ''}
      ${totals.roundOff ? `<tr><td colspan="2">Round Off</td><td style="text-align:right">${formatAmount(totals.roundOff, 'INR')}</td></tr>` : ''}
      <tr class="tot"><td colspan="2">Grand Total</td><td style="text-align:right">${formatAmount(totals.roundedTotal, 'INR')}</td></tr>`
      : `<tr class="tot"><td colspan="2">Invoice Total</td><td style="text-align:right">${formatAmount(grandTotal, 'INR')}</td></tr>`}
      </tbody></table>
      <script>window.onload=function(){window.print()}</script></body></html>`);
    win.document.close();
  };

  const handleExportPdf = async () => {
    const { exportPdf } = await import('../utils/export');
    const v = watched || {};
    await exportPdf({
      title: 'Purchase Invoice',
      filename: `purchase-invoice${invoiceId ? `-${invoiceId}` : ''}`,
      meta: [
        ['Vendor', v.vendor],
        ['PO Reference', v.poNo],
        ['GRN Reference', v.grnNo],
        ['Vendor Invoice No', v.vendorInvoiceNo],
        ['Invoice No', userInvoiceNo],
        ['Invoice Date', v.invoiceDate],
        ['Due Date', v.dueDate]
      ],
      columns: docLines.length
        ? [
            { key: 'product', label: 'Item' },
            { key: 'qty', label: 'Qty' },
            { key: 'rate', label: 'Rate' },
            { key: 'gstRate', label: 'GST %' },
            { key: 'amount', label: 'Amount' }
          ]
        : [
            { key: 'description', label: 'Description' },
            { key: 'value', label: 'Value' }
          ],
      records: docLines.length
        ? docLines.map((r) => ({ ...r, amount: formatAmount(r.amount, 'INR') }))
        : [
            { description: 'Invoice amount (excl. GST)', value: formatAmount(taxable, 'INR') },
            { description: 'GST', value: formatAmount(totals ? totals.gstTotal : manualGst, 'INR') }
          ]
    });
  };

  const eligibleSources = sources.filter(
    (source) => !source.fullyInvoiced || (invoiceId && initialData?.grnNo === source.grnNo)
  );
  const selectedSource = sources.find((entry) => entry.grnNo === sourceKey);

  return (
    <form onSubmit={onSubmit}>
      <div className="purchase-page-form-grid">
        <div className="purchase-main-form">
          {/* ============ SOURCE / GOODS RECEIPT ============ */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Package aria-hidden="true" /> Purchase Order / Goods Receipt</h3>
            </div>
            <div className="purchase-form-card-body">
              <FormField
                label="Create from Goods Receipt"
                hint={!invoiceId ? 'Pick the completed GRN to invoice — vendor, PO, lines and rates are pre-filled from the receipt.' : undefined}
              >
                <SelectInput
                  value={sourceKey}
                  onChange={(e) => applySource(e.target.value)}
                  ariaLabel="Goods Receipt source"
                >
                  <option value="">Select GRN / PO to invoice...</option>
                  {eligibleSources.map((source) => (
                    <option key={source.grnNo} value={source.grnNo}>
                      {source.grnNo} · {source.poNo} · {source.vendor} · {formatAmount(source.totals?.roundedTotal || source.totals?.total || 0, source.currency)}
                    </option>
                  ))}
                  <option value={MANUAL_SOURCE}>Manual entry (no GRN)</option>
                </SelectInput>
              </FormField>
              {sourcesLoading && (
                <p className="text-xs text-slate-400 mt-2">Loading eligible receipts…</p>
              )}
              {!sourcesLoading && !invoiceId && eligibleSources.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
                  No completed Goods Receipts are available to invoice yet — complete the GRN for the PO first, or use manual entry.
                </p>
              )}
              {selectedSource && !selectedSource.fullyInvoiced && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mt-2">
                  Received {selectedSource.receivedOn || 'recently'} · {selectedSource.items.length} line item(s) ready to invoice
                </p>
              )}
            </div>
          </div>

          {/* ============ INVOICE DETAILS ============ */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Receipt aria-hidden="true" /> Invoice Details</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Vendor" required error={errors.vendor?.message} className="sm:col-span-2">
                  <Controller control={control} name="vendor" render={({ field }) => (
                    <SearchableSelect value={field.value || ''} onChange={field.onChange} options={vendorNames} placeholder="Search vendor..." error={!!errors.vendor} ariaLabel="Vendor" disabled={Boolean(sourceKey && sourceKey !== MANUAL_SOURCE)} />
                  )} />
                </FormField>
                <FormField label="Vendor Email">
                  <EmailInput registration={register('vendorEmail')} error={!!errors.vendorEmail} placeholder="billing@vendor.com" />
                </FormField>
                <FormField label="PO Reference" required error={errors.poNo?.message}>
                  <TextInput registration={register('poNo')} error={!!errors.poNo} placeholder="e.g. PO-2026-0341" readOnly={Boolean(sourceKey && sourceKey !== MANUAL_SOURCE)} />
                </FormField>
                <FormField label="GRN Reference">
                  <TextInput registration={register('grnNo')} error={!!errors.grnNo} placeholder="Auto-filled from GRN" readOnly={Boolean(sourceKey && sourceKey !== MANUAL_SOURCE)} />
                </FormField>
                <FormField label="Vendor Invoice Number" required error={errors.vendorInvoiceNo?.message}>
                  <TextInput registration={register('vendorInvoiceNo')} error={!!errors.vendorInvoiceNo} placeholder="e.g. DEL/INV/2026-118" ariaLabel="Vendor Invoice Number" />
                </FormField>
                <FormField label="Our Invoice Number">
                  <TextInput
                    value={userInvoiceNo}
                    onChange={(e) => setUserInvoiceNo(e.target.value)}
                    className="font-semibold text-slate-700"
                    placeholder="Auto-generated"
                    ariaLabel="Invoice Number"
                  />
                </FormField>
                <FormField label="Invoice Type">
                  <SelectInput registration={register('invoiceType')}>
                    {INVOICE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Invoice Date">
                  <DateInput registration={register('invoiceDate')} />
                </FormField>
                <FormField label="Due Date">
                  <DateInput registration={register('dueDate')} />
                </FormField>
                <FormField label="Payment Terms">
                  <SelectInput registration={register('paymentTerms')}>
                    <option value="">Select Terms</option>
                    {PAYMENT_TERMS.map((terms) => (
                      <option key={terms} value={terms}>{terms}</option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Payment Method">
                  <SelectInput registration={register('paymentMethod')}>
                    {PAYMENT_METHODS.map((method) => (
                      <option key={method} value={method}>{method}</option>
                    ))}
                  </SelectInput>
                </FormField>
                <FormField label="Vendor Reference">
                  <TextInput registration={register('vendorReference')} placeholder="Vendor's PO / contact reference" ariaLabel="Vendor Reference" />
                </FormField>
                <FormField label="Notes" className="sm:col-span-2">
                  <TextArea rows={2} registration={register('notes')} placeholder="Payment / matching notes..." />
                </FormField>
                <FormField label="Attachments" hint="Invoice PDF, POD, e-way bill" className="sm:col-span-2">
                  <AttachmentManager
                    attachments={watched?.attachments || []}
                    onChange={(next) => setValue('attachments', next, { shouldDirty: true })}
                  />
                </FormField>
              </div>
            </div>
          </div>

          {/* ============ INVOICE ITEMS ============ */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Receipt aria-hidden="true" /> Invoice Items</h3>
            </div>
            <div className="purchase-form-card-body">
              {!hasItems ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="Amount (excl. GST)" required error={errors.amount?.message}>
                    <NumberInput min="0" step="any" registration={register('amount')} error={!!errors.amount} placeholder="0.00" />
                  </FormField>
                  <FormField label="GST Amount">
                    <NumberInput min="0" step="any" registration={register('gst')} error={!!errors.gst} placeholder="0.00" />
                  </FormField>
                  <FormField label="GST Type" className="sm:col-span-2">
                    <SelectInput registration={register('gstType')}>
                      <option value="">Intra-State (CGST+SGST)</option>
                      {GST_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </SelectInput>
                  </FormField>
                  <p className="text-xs text-slate-400 sm:col-span-2">
                    Select a Goods Receipt above to invoice item-by-item with quantities, rates and taxes pulled from the PO.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="po-table po-table-compact w-full text-[12px]">
                      <thead>
                        <tr>
                          <th className="w-8">#</th>
                          <th>Item / Description</th>
                          <th className="text-center">PO Qty</th>
                          <th className="text-center">Received</th>
                          <th className="text-center">Invoice Qty</th>
                          <th className="text-center">Rate</th>
                          <th className="text-center">Disc %</th>
                          <th className="text-center">GST %</th>
                          <th className="text-right">Tax</th>
                          <th className="text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((line, index) => {
                          const qty = Number(line.qty) || 0;
                          const rate = Number(line.rate) || 0;
                          const gstRate = Number(line.gstRate) || 0;
                          const discRate = Number(line.discount) || 0;
                          const base = qty * rate * (1 - Math.min(discRate, 100) / 100);
                          const tax = (base * gstRate) / 100;
                          return (
                            <tr key={index}>
                              <td className="text-slate-400">{index + 1}</td>
                              <td>
                                <div className="font-semibold text-slate-700">{line.product || '—'}</div>
                                <div className="text-[10px] text-slate-400">
                                  {[line.hsn, line.uom].filter(Boolean).join(' · ') || '\u00A0'}
                                </div>
                              </td>
                              <td className="text-right text-slate-500">{line.orderQty ?? '—'}</td>
                              <td className="text-right text-slate-500">{line.received ?? '—'}</td>
                              <td className="text-right">
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={qty || ''}
                                  onChange={(e) => {
                                    const value = Number(e.target.value);
                                    const received = Number(line.received) || 0;
                                    if (received > 0 && value > received) {
                                      toast.error(`Invoice quantity cannot exceed received quantity (${received})`);
                                      return;
                                    }
                                    setValue(`items.${index}.qty`, e.target.value, { shouldDirty: true, shouldValidate: true });
                                  }}
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-center text-[12px] outline-none focus:border-[#0B4A3D]"
                                  aria-label={`Invoice quantity for ${line.product}`}
                                />
                              </td>
                              <td className="text-right">{formatAmount(rate)}</td>
                              <td className="text-right">
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="any"
                                  value={discRate || ''}
                                  onChange={(e) => setValue(`items.${index}.discount`, e.target.value, { shouldDirty: true })}
                                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-center text-[12px] outline-none focus:border-[#0B4A3D]"
                                  aria-label={`Discount % for ${line.product}`}
                                />
                              </td>
                              <td className="text-right">{gstRate}%</td>
                              <td className="text-right">{formatAmount(tax)}</td>
                              <td className="text-right font-semibold text-slate-700">{formatAmount(qty * rate)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                    <FormField label="Header Discount %">
                      <NumberInput min="0" max="100" step="any" registration={register('discount')} placeholder="0" />
                    </FormField>
                    <FormField label="Charges (packing, handling)">
                      <NumberInput min="0" step="any" registration={register('charges')} placeholder="0.00" />
                    </FormField>
                    <FormField label="Freight">
                      <NumberInput min="0" step="any" registration={register('freight')} placeholder="0.00" />
                    </FormField>
                    <FormField label="TDS / Withholding %">
                      <NumberInput min="0" max="100" step="any" registration={register('tdsPercent')} placeholder="e.g. 2" />
                    </FormField>
                    <FormField label="Retention %">
                      <NumberInput min="0" max="100" step="any" registration={register('retentionPercent')} placeholder="e.g. 5" />
                    </FormField>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="purchase-sidebar-form">
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><BadgeCheck aria-hidden="true" /> Invoice Summary</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="purchase-total-row">
                <span className="total-label">Status</span>
                <span className="total-value"><PurchaseStatusBadge status={watched?.status || 'Draft'} /></span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Vendor</span>
                <span className="total-value max-w-[180px] truncate">{watched?.vendor || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Invoice No</span>
                <span className="total-value">{userInvoiceNo || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Vendor Invoice No</span>
                <span className="total-value max-w-[180px] truncate">{watched?.vendorInvoiceNo || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Invoice Date</span>
                <span className="total-value">{watched?.invoiceDate || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Due Date</span>
                <span className="total-value">{watched?.dueDate || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Payment Method</span>
                <span className="total-value">{watched?.paymentMethod || '—'}</span>
              </div>
              {hasItems && totals ? (
                <>
                  <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-[12px] text-slate-600">
                    <div className="flex justify-between"><span>Subtotal</span><span>{formatAmount(totals.subtotal)}</span></div>
                    {totals.lineDiscountAmount > 0 && (
                      <div className="flex justify-between"><span>Line Discount</span><span>-{formatAmount(totals.lineDiscountAmount)}</span></div>
                    )}
                    {totals.discountAmount > 0 && (
                      <div className="flex justify-between"><span>Discount ({discount}%)</span><span>-{formatAmount(totals.discountAmount)}</span></div>
                    )}
                    <div className="flex justify-between font-medium"><span>Taxable Value</span><span>{formatAmount(totals.taxable)}</span></div>
                    {totals.cgst > 0 && <div className="flex justify-between"><span>CGST</span><span>{formatAmount(totals.cgst)}</span></div>}
                    {totals.sgst > 0 && <div className="flex justify-between"><span>SGST</span><span>{formatAmount(totals.sgst)}</span></div>}
                    {totals.igst > 0 && <div className="flex justify-between"><span>IGST</span><span>{formatAmount(totals.igst)}</span></div>}
                    {totals.charges > 0 && <div className="flex justify-between"><span>Charges</span><span>{formatAmount(totals.charges)}</span></div>}
                    {totals.roundOff !== 0 && <div className="flex justify-between"><span>Round Off</span><span>{formatAmount(totals.roundOff)}</span></div>}
                    <div className="flex justify-between font-bold text-[13px] text-slate-800 pt-1.5 border-t border-slate-200">
                      <span>Grand Total</span><span>{formatAmount(totals.roundedTotal)}</span>
                    </div>
                    {(() => {
                      const freightAmt = Number(watched?.freight) || 0;
                      const gross = totals.roundedTotal + freightAmt;
                      const tdsAmt = (totals.taxable * ((Number(watched?.tdsPercent) || 0) / 100));
                      const retentionAmt = gross * ((Number(watched?.retentionPercent) || 0) / 100);
                      const net = gross - tdsAmt - retentionAmt;
                      return (
                        <>
                          {freightAmt > 0 && <div className="flex justify-between"><span>Freight</span><span>{formatAmount(freightAmt)}</span></div>}
                          {tdsAmt > 0 && <div className="flex justify-between"><span>TDS / Withholding</span><span>-{formatAmount(tdsAmt)}</span></div>}
                          {retentionAmt > 0 && <div className="flex justify-between"><span>Retention</span><span>-{formatAmount(retentionAmt)}</span></div>}
                          <div className="flex justify-between font-bold text-[13px] text-[#0B4A3D] pt-1.5 border-t border-slate-200">
                            <span>Net Payable</span><span>{formatAmount(net)}</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </>
              ) : (
                <>
                  <div className="purchase-total-row">
                    <span className="total-label">Amount</span>
                    <span className="total-value">{formatAmount(manualAmount)}</span>
                  </div>
                  <div className="purchase-total-row">
                    <span className="total-label">GST</span>
                    <span className="total-value">{formatAmount(manualGst)}</span>
                  </div>
                  <div className="purchase-total-row purchase-total-grand">
                    <span className="total-label">Invoice Total</span>
                    <span className="total-value">{formatAmount(manualAmount + manualGst)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Wallet aria-hidden="true" /> Payment</h3>
            </div>
            <div className="purchase-form-card-body">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                Settle <strong>{formatAmount(grandTotal)}</strong> via <strong>{watched?.paymentMethod || '—'}</strong>
                {watched?.dueDate ? ` on or before ${watched.dueDate}.` : '.'}
              </p>
            </div>
          </div>

          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Building2 aria-hidden="true" /> Vendor Contact</h3>
            </div>
            <div className="purchase-form-card-body">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                {watched?.vendorEmail || 'No vendor email provided.'}
              </p>
              <div className="mt-3 pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-[12px] text-slate-500">
                <span className="inline-flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5 text-[#0A4F44]" /> PO {watched?.poNo || '—'}</span>
                {watched?.grnNo && (
                  <span className="inline-flex items-center gap-1.5"><Package className="w-3.5 h-3.5 text-[#0A4F44]" /> GRN {watched.grnNo}</span>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        draftSaving={draftSaving}
        submitLabel={invoiceId ? 'Update Invoice' : 'Record Invoice'}
        draftLabel="Save Draft"
        showDraft
        onDraft={() => {
          setDraftSaving(true);
          saveDraftNow({ ...form.getValues(), invoiceNo: userInvoiceNo });
          onSaveDraft().finally(() => setDraftSaving(false));
        }}
        onCancel={() => navigate('/purchase/invoices')}
        onReset={handleReset}
        onPrint={printInvoice}
        onExportPdf={handleExportPdf}
      />
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset Form"
        message="Are you sure you want to reset the form? All unsaved changes will be lost."
        onConfirm={confirmReset}
        onCancel={() => setConfirmResetOpen(false)}
      />
    </form>
  );
}
