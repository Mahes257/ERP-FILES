/**
 * purchase/components/QuotationEntryModal.jsx
 * ------------------------------------------------------------------
 * Reusable modal that records a vendor quotation against an RFQ.
 * Picks the RFQ (auto-loads its line items with estimated rates),
 * selects one of its invited vendors, lets the buyer adjust quoted
 * rates / discount / charges and capture delivery, lead time, payment
 * terms and warranty. Saves via rfqService.saveQuotation — which also
 * auto-advances the RFQ from Sent → Quotation Received on the first
 * received quote and re-scores the vendor against its peers.
 *
 * Form structure (per the Vendor Quotations workflow spec):
 *   • RFQ & VENDOR            — RFQ* + Vendor* (invited vendors only;
 *                               already-quoted vendors are disabled and a
 *                               duplicate warning is surfaced).
 *   • DELIVERY & COMMERCIAL   — Delivery, Lead Time, Delivery Terms,
 *     TERMS                     Payment Terms, Warranty, Discount (%),
 *                               Freight, Insurance, Charges, Valid Until.
 *   • QUOTATION AMOUNT        — Quotation Amount* (auto-derived from the
 *                               line items — never typed when items exist)
 *                               + Currency (INR default, editable).
 *   • LINE ITEMS              — Item, Description, Qty, UOM, Quoted Rate,
 *                               Discount %, Tax %, Line Total with live
 *                               subtotal / tax / grand total.
 *   • NOTES                   — Commercial notes + optional attachments.
 *
 * Validation: RFQ, Vendor, Quotation Amount and Valid Until are required;
 * discount is clamped 0–100; delivery / lead time must be ≥ 0; the amount
 * must be ≥ 0; a live RFQ+vendor duplicate is blocked. Messages render
 * below the field and the Save Quotation button stays disabled until the
 * form is valid.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { Inbox, Loader2, Save } from 'lucide-react';
import { FormField, Modal, SelectInput, TextArea, TextInput, useToast } from './ui';
import AttachmentManager from './AttachmentManager';
import { DELIVERY_TERMS, PAYMENT_TERMS, QUOTATION_STATUS, RFQ_STATUS, WARRANTY_TERMS } from '../constants';
import { rfqService } from '../services/rfq';
import { vendorService } from '../services/vendor';
import { todayLocal } from '../services/base';
import { calcDocumentTotals, formatAmount, round2 } from '../utils/purchase';
import { currencies } from '../../data/currencies';

const emptyItems = () => [{ product: '', hsn: '', uom: 'Nos', qty: '', rate: '', discount: 0, gstRate: 18, specification: '' }];

const hasLine = (item) => Boolean(item.product) && Number(item.qty) > 0;
const isDate = (value) => Boolean(value) && !Number.isNaN(new Date(value).getTime());

function SectionHeading({ children }) {
  return (
    <div className="flex items-center gap-2 mt-5 mb-3 first:mt-0">
      <span className="w-1 h-3.5 rounded-full bg-[#0B4A3D] shrink-0" aria-hidden="true" />
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{children}</h4>
    </div>
  );
}

export default function QuotationEntryModal({ open, onClose, onSaved, rfqOptions = [], presetRfqId = '' }) {
  const toast = useToast();

  /* The modal is remounted (parents pass a changing `key`) every time it is
     opened, so all form state starts fresh; presetRfqId pre-selects the RFQ
     when opened from a quotation detail page. */
  const [rfqId, setRfqId] = useState(() => presetRfqId || '');
  const [rfq, setRfq] = useState(null);
  const [vendor, setVendor] = useState('');
  const [items, setItems] = useState(emptyItems());
  const [delivery, setDelivery] = useState('14');
  const [leadTime, setLeadTime] = useState('21');
  const [paymentTerms, setPaymentTerms] = useState(PAYMENT_TERMS[4]);
  const [warranty, setWarranty] = useState(WARRANTY_TERMS[3]);
  const [discount, setDiscount] = useState('0');
  const [charges, setCharges] = useState('0');
  const [freight, setFreight] = useState('0');
  const [insurance, setInsurance] = useState('0');
  const [deliveryTerms, setDeliveryTerms] = useState(DELIVERY_TERMS[2]);
  const [validUntil, setValidUntil] = useState('');
  const [currency, setCurrency] = useState('');
  const [quotationAmount, setQuotationAmount] = useState('');
  const [notes, setNotes] = useState('');
  /* Vendors who already hold a live (Received / Accepted) quotation for
     the selected RFQ — they are shown but disabled in the vendor select
     because the service refuses to overwrite live quotations. */
  const [liveQuotedVendors, setLiveQuotedVendors] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [loadingRfq, setLoadingRfq] = useState(false);
  const [busy, setBusy] = useState(false);
  const [masterVendors, setMasterVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState(false);

  /* Load RFQ-eligible vendors from the vendor master (fallback when
     the selected RFQ has no vendor list). */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setVendorsLoading(true);
    setVendorsError(false);
    vendorService
      .getRfqEligibleVendors()
      .then((vendors) => {
        if (!cancelled) setMasterVendors(vendors || []);
      })
      .catch(() => {
        if (!cancelled) setVendorsError(true);
      })
      .finally(() => {
        if (!cancelled) setVendorsLoading(false);
      });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!rfqId || !open) return;
    let cancelled = false;
    const load = async () => {
      setLoadingRfq(true);
      try {
        const record = await rfqService.getRfq(rfqId);
        if (cancelled) return;
        setRfq(record);
        setItems(
          (record.items || []).map((item) => ({
            product: item.product || '',
            hsn: item.hsn || '',
            uom: item.uom || 'Nos',
            qty: item.qty ?? '',
            rate: item.rate ?? item.expectedRate ?? '',
            discount: Number(item.discount) || 0,
            gstRate: Number(record.commercialTerms?.taxRate) || 18,
            specification: item.specification || ''
          }))
        );
        setVendor('');
        setValidUntil(record.dueDate || '');
        setCurrency(record.currency || 'INR');
        setQuotationAmount('');
        /* Find vendors that already submitted a live quote so they can be
           flagged as unavailable (the service never overwrites them). */
        try {
          const page = await rfqService.getQuotations({ rfqNo: record.rfqNo, page: 1, pageSize: 100 });
          if (cancelled) return;
          setLiveQuotedVendors(
            (page.data || [])
              .filter((quote) =>
                [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(quote.status)
              )
              .map((quote) => quote.vendor)
          );
        } catch {
          if (!cancelled) setLiveQuotedVendors([]);
        }
      } catch {
        if (!cancelled) toast.error('Failed to load RFQ');
      } finally {
        if (!cancelled) setLoadingRfq(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfqId, open]);

  const totals = useMemo(() => calcDocumentTotals(items, Number(discount) || 0, Number(charges) || 0), [items, discount, charges]);
  /* Grand total mirrors the service: computed document total + freight +
     insurance (see rfqService.saveQuotation). */
  const grandTotal = useMemo(
    () => round2(totals.total + (Number(freight) || 0) + (Number(insurance) || 0)),
    [totals, freight, insurance]
  );

  const vendorOptions = useMemo(() => {
    if (!rfq) return [];
    const rfqVendors = rfq.vendors || [];
    /* Use RFQ-specific vendors when available; otherwise fall back to
       the vendor master (all RFQ-eligible / approved vendors). */
    const sourceNames = rfqVendors.length > 0
      ? rfqVendors
      : masterVendors.map((v) => v.name).filter(Boolean);
    return sourceNames.map((name) => {
      const alreadyQuoted = liveQuotedVendors.includes(name);
      return {
        value: name,
        label: alreadyQuoted ? `${name} (already quoted)` : name,
        disabled: alreadyQuoted
      };
    });
  }, [rfq, masterVendors, liveQuotedVendors]);

  /* Quotations can only be recorded against RFQs that are open for bids —
     Draft / Pending Approval / Approved / Sent / Quotation Received / Evaluation.
     Awarded, Closed and Cancelled RFQs are never offered here. */
  const openRfqOptions = useMemo(() => {
    const eligibleStatuses = [
      RFQ_STATUS.DRAFT,
      RFQ_STATUS.PENDING_APPROVAL,
      RFQ_STATUS.APPROVED,
      RFQ_STATUS.SENT,
      RFQ_STATUS.QUOTATION_RECEIVED,
      RFQ_STATUS.EVALUATION,
    ];
    const eligibleSet = new Set(eligibleStatuses.map((s) => s.toLowerCase()));
    return rfqOptions.filter((rfq) =>
      rfq.id === presetRfqId ||
      eligibleSet.has(String(rfq.status || '').toLowerCase())
    );
  }, [rfqOptions, presetRfqId]);

  const updateItem = (index, key, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  /* ----- Validation (Section 8) — messages render below the fields ----- */
  const hasValidLine = items.some(hasLine);
  const amountDisplay = hasValidLine ? String(round2(grandTotal) || '0') : quotationAmount;

  const fieldErrors = useMemo(() => {
    const errors = {};
    if (!rfqId) errors.rfq = 'RFQ is required';
    if (!vendor) errors.vendor = 'Vendor is required';
    else if (liveQuotedVendors.includes(vendor)) {
      errors.vendor = 'Quotation already exists for this RFQ and vendor.';
    }

    const amountValue = Number(amountDisplay);
    if (!amountDisplay) errors.amount = 'Quotation Amount is required';
    else if (!Number.isFinite(amountValue) || amountValue < 0) errors.amount = 'Quotation Amount must be 0 or more';

    const discountValue = Number(discount);
    if (Number.isNaN(discountValue) || discountValue < 0 || discountValue > 100) {
      errors.discount = 'Discount must be between 0 and 100';
    }
    const deliveryValue = Number(delivery);
    if (Number.isNaN(deliveryValue) || deliveryValue < 0) errors.delivery = 'Delivery must be 0 or more';
    const leadValue = Number(leadTime);
    if (Number.isNaN(leadValue) || leadValue < 0) errors.leadTime = 'Lead time must be 0 or more';

    if (!validUntil) errors.validUntil = 'Valid Until is required';
    else if (!isDate(validUntil)) errors.validUntil = 'Enter a valid date';

    if (!hasValidLine) errors.items = 'Add at least one quoted line item';
    return errors;
  }, [rfqId, vendor, liveQuotedVendors, amountDisplay, discount, delivery, leadTime, validUntil, hasValidLine]);

  const valid = Object.keys(fieldErrors).length === 0;

  const handleSave = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await rfqService.saveQuotation({
        rfqNo: rfq.rfqNo,
        vendor,
        submittedOn: todayLocal(),
        validUntil,
        currency: currency || rfq.currency || 'INR',
        discount: Number(discount) || 0,
        charges: Number(charges) || 0,
        freight: Number(freight) || 0,
        insurance: Number(insurance) || 0,
        deliveryTerms,
        items: items.map((item) => ({
          product: item.product,
          hsn: item.hsn,
          uom: item.uom,
          qty: Number(item.qty) || 0,
          rate: Number(item.rate) || 0,
          discount: Number(item.discount) || 0,
          gstRate: Number(item.gstRate) || 0,
          specification: item.specification || ''
        })),
        delivery: Number(delivery) || 0,
        leadTime: Number(leadTime) || 0,
        paymentTerms,
        warranty,
        notes: notes || `${vendor} commercial offer against ${rfq.rfqNo}.`,
        status: QUOTATION_STATUS.RECEIVED,
        attachments
      });
      toast.success(`Quotation recorded for ${vendor}`);
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Failed to record quotation');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record Vendor Quotation"
      maxWidth="max-w-4xl"
      footer={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!valid || busy || loadingRfq}
            onClick={handleSave}
          >
            {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Save className="po-btn-icon-ic" />}
            Save Quotation
          </button>
        </>
      }
    >
      <p className="text-xs text-slate-500 mb-4">
        Capture the offer received from a vendor against an RFQ.
      </p>

      {/* ----- RFQ & VENDOR ----- */}
      <SectionHeading>RFQ &amp; Vendor</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="RFQ" required error={fieldErrors.rfq}>
          <SelectInput
            registration={{ onChange: (e) => setRfqId(e.target.value), value: rfqId }}
            error={fieldErrors.rfq}
          >
            <option value="">Select RFQ</option>
            {openRfqOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.rfqNo} — {option.title}</option>
            ))}
          </SelectInput>
        </FormField>
        <FormField
          label="Vendor"
          required
          error={fieldErrors.vendor}
          hint={
            vendorOptions.length > 0
              ? `${vendorOptions.length} invited · ${liveQuotedVendors.length} already quoted`
              : undefined
          }
        >
          {vendorsLoading ? (
            <input
              type="text"
              value="Loading vendors..."
              disabled
              className="purchase-form-input opacity-60 cursor-wait"
              aria-label="Vendor — loading"
            />
          ) : vendorsError ? (
            <input
              type="text"
              value="Failed to load vendors"
              disabled
              className="purchase-form-input border-rose-300 text-rose-500"
              aria-label="Vendor — error"
            />
          ) : (
            <SelectInput
              registration={{ onChange: (e) => setVendor(e.target.value), value: vendor }}
              error={fieldErrors.vendor}
              disabled={!rfq || loadingRfq || vendorOptions.length === 0}
            >
              <option value="">
                {!rfq ? 'Select RFQ first' : (vendorOptions.length === 0 ? 'No eligible vendors found' : 'Select Vendor')}
              </option>
              {vendorOptions.map((option) => (
                <option key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
          )}
        </FormField>
      </div>

      {/* ----- DELIVERY & COMMERCIAL TERMS ----- */}
      <SectionHeading>Delivery &amp; Commercial Terms</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Delivery (days)" error={fieldErrors.delivery}>
          <TextInput type="number" min="0" value={delivery} onChange={(e) => setDelivery(e.target.value)} error={fieldErrors.delivery} />
        </FormField>
        <FormField label="Lead Time (days)" error={fieldErrors.leadTime}>
          <TextInput type="number" min="0" value={leadTime} onChange={(e) => setLeadTime(e.target.value)} error={fieldErrors.leadTime} />
        </FormField>
        <FormField label="Delivery Terms">
          <SelectInput registration={{ onChange: (e) => setDeliveryTerms(e.target.value), value: deliveryTerms }}>
            {DELIVERY_TERMS.map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Payment Terms">
          <SelectInput registration={{ onChange: (e) => setPaymentTerms(e.target.value), value: paymentTerms }}>
            {PAYMENT_TERMS.map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Warranty">
          <SelectInput registration={{ onChange: (e) => setWarranty(e.target.value), value: warranty }}>
            {WARRANTY_TERMS.map((term) => (
              <option key={term} value={term}>{term}</option>
            ))}
          </SelectInput>
        </FormField>
        <FormField label="Discount (%)" error={fieldErrors.discount}>
          <TextInput type="number" min="0" max="100" value={discount} onChange={(e) => setDiscount(e.target.value)} error={fieldErrors.discount} />
        </FormField>
        <FormField label="Freight">
          <TextInput type="number" min="0" value={freight} onChange={(e) => setFreight(e.target.value)} />
        </FormField>
        <FormField label="Insurance">
          <TextInput type="number" min="0" value={insurance} onChange={(e) => setInsurance(e.target.value)} />
        </FormField>
        <FormField label="Charges">
          <TextInput type="number" min="0" value={charges} onChange={(e) => setCharges(e.target.value)} />
        </FormField>
        <FormField label="Valid Until" required error={fieldErrors.validUntil}>
          <TextInput type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} error={fieldErrors.validUntil} />
        </FormField>
      </div>

      {/* ----- QUOTATION AMOUNT ----- */}
      <SectionHeading>Quotation Amount</SectionHeading>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField
          label="Quotation Amount"
          required
          error={fieldErrors.amount}
          hint={hasValidLine ? 'Calculated from the quoted line items' : undefined}
        >
          <TextInput
            type="number"
            min="0"
            value={amountDisplay}
            readOnly={hasValidLine}
            onChange={(e) => setQuotationAmount(e.target.value)}
            error={fieldErrors.amount}
          />
        </FormField>
        <FormField label="Currency">
          <SelectInput registration={{ onChange: (e) => setCurrency(e.target.value), value: currency || 'INR' }}>
            {currencies.map((entry) => (
              <option key={entry.code} value={entry.code}>{entry.code} — {entry.name}</option>
            ))}
          </SelectInput>
        </FormField>
      </div>

      {/* ----- LINE ITEMS ----- */}
      <SectionHeading>Line Items</SectionHeading>
      {rfq ? (
        <div className="mt-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-semibold text-slate-400">
              Quoted rates loaded from {rfq.rfqNo} — adjust below
            </p>
            <span className="text-[11px] font-semibold text-slate-400">Quoted in {currency || 'INR'}</span>
          </div>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs min-w-[760px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Item</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-center">Qty</th>
                  <th className="px-3 py-2">UOM</th>
                  <th className="px-3 py-2 text-center">Quoted Rate</th>
                  <th className="px-3 py-2 text-center">Discount %</th>
                  <th className="px-3 py-2 text-center">Tax %</th>
                  <th className="px-3 py-2 text-right">Line Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={index} className="bg-surface">
                    <td className="px-3 py-2 text-slate-400 font-bold">{index + 1}</td>
                    <td className="px-3 py-2">
                      <TextInput value={item.product} onChange={(e) => updateItem(index, 'product', e.target.value)} placeholder="Item description" />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput value={item.specification} onChange={(e) => updateItem(index, 'specification', e.target.value)} placeholder="Spec / details" />
                    </td>
                    <td className="px-3 py-2 num">
                      <TextInput type="number" min="0" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} className="min-w-[64px]" />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput value={item.uom} onChange={(e) => updateItem(index, 'uom', e.target.value)} className="min-w-[52px]" />
                    </td>
                    <td className="px-3 py-2 num">
                      <TextInput type="number" min="0" value={item.rate} onChange={(e) => updateItem(index, 'rate', e.target.value)} className="min-w-[84px]" />
                    </td>
                    <td className="px-3 py-2 num">
                      <TextInput type="number" min="0" max="100" value={item.discount} onChange={(e) => updateItem(index, 'discount', e.target.value)} className="min-w-[56px]" />
                    </td>
                    <td className="px-3 py-2 num">
                      <TextInput type="number" min="0" value={item.gstRate} onChange={(e) => updateItem(index, 'gstRate', e.target.value)} className="min-w-[56px]" />
                    </td>
                    <td className="px-3 py-2 text-right font-bold text-slate-800 whitespace-nowrap">
                      {formatAmount(totals.lines[index]?.total || 0, currency || 'INR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fieldErrors.items && (
            <p className="text-[11px] font-semibold text-rose-600 mt-2">{fieldErrors.items}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs">
            <span className="text-slate-400 font-semibold">Subtotal</span>
            <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totals.subtotal, currency || 'INR')}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">Discount</span>
            <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totals.discountAmount, currency || 'INR')}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">Freight</span>
            <span className="font-bold text-slate-800 tabular-nums">{formatAmount(Number(freight) || 0, currency || 'INR')}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">Insurance</span>
            <span className="font-bold text-slate-800 tabular-nums">{formatAmount(Number(insurance) || 0, currency || 'INR')}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">Other Charges</span>
            <span className="font-bold text-slate-800 tabular-nums">{formatAmount(Number(charges) || 0, currency || 'INR')}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">Tax</span>
            <span className="font-bold text-slate-800 tabular-nums">{formatAmount(totals.gstTotal, currency || 'INR')}</span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-400 font-semibold">Grand Total</span>
            <span className="text-sm font-bold text-slate-900 tabular-nums">{formatAmount(grandTotal, currency || 'INR')}</span>
          </div>
        </div>
      ) : (
        !loadingRfq && (
          <div className="mt-1 rounded-lg bg-slate-50 border border-slate-100 px-4 py-6 text-center flex flex-col items-center gap-2">
            <Inbox className="w-5 h-5 text-slate-300" />
            <p className="text-xs font-semibold text-slate-500">Select an RFQ to pre-fill its line items.</p>
          </div>
        )
      )}

      {/* ----- NOTES ----- */}
      <SectionHeading>Notes</SectionHeading>
      <FormField label="Notes">
        <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Commercial notes from the vendor..." />
      </FormField>
      <div className="mt-4">
        <FormField label="Attachments" hint="Quotation PDF, commercial offer, technical offer or supporting documents">
          <AttachmentManager attachments={attachments} onChange={setAttachments} />
        </FormField>
      </div>
    </Modal>
  );
}