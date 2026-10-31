/**
 * purchase/pages/invoices/AdjustmentNoteCreate.jsx
 * ------------------------------------------------------------------
 * Raise a Credit Note or Debit Note against an ORIGINAL vendor
 * invoice. Fields: note type, original invoice, reason, reference,
 * items (qty × rate + GST), attachments and the excess-credit control.
 *
 * A Credit Note reduces what the buyer owes — it may not exceed the
 * invoice's current outstanding balance unless the user explicitly
 * checks "Allow excess credit" (recorded on the note + audit trail).
 * A Debit Note raises the payable and has no upper bound.
 *
 * Notes are created as Draft (or Submitted when "Submit" is used) and
 * only move the ledger once Approved on the Credit / Debit Notes page.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, FilePen, MinusCircle, PlusCircle, Receipt, AlertTriangle,
  Link2, Trash2
} from 'lucide-react';
import {
  ConfirmDialog, DateInput, FormField, NumberInput, SearchableSelect,
  SelectInput, TextArea, TextInput, useToast
} from '../../components/ui';
import AttachmentManager from '../../components/AttachmentManager';
import FormActions from '../../components/FormActions';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import { invoiceService } from '../../services/invoice';
import { ADJUSTMENT_NOTE_REASONS, ADJUSTMENT_NOTE_TYPE, ADJUSTMENT_NOTE_STATUS } from '../../constants';
import { calcDocumentTotals, round2 } from '../../utils/purchase';
import { formatAmount } from '../../utils/paymentUtils';
import { todayISO } from '../../utils/helpers';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const EMPTY_LINES = [];

export default function AdjustmentNoteCreate() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const initialType =
    searchParams.get('type') === ADJUSTMENT_NOTE_TYPE.DEBIT
      ? ADJUSTMENT_NOTE_TYPE.DEBIT
      : ADJUSTMENT_NOTE_TYPE.CREDIT;

  const [noteType, setNoteType] = useState(initialType);
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [sourceKey, setSourceKey] = useState(''); // invoiceId
  const [invoice, setInvoice] = useState(null); // selected source (with lines)

  const [noteDate, setNoteDate] = useState(todayISO());
  const [reason, setReason] = useState('');
  const [reasonPreset, setReasonPreset] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState(EMPTY_LINES);
  const [manualAmount, setManualAmount] = useState('');
  const [manualGst, setManualGst] = useState('');
  const [gstType, setGstType] = useState('');
  const [discount, setDiscount] = useState('0');
  const [charges, setCharges] = useState('0');
  const [freight, setFreight] = useState('0');
  const [allowExcess, setAllowExcess] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [resetKey, setResetKey] = useState(0);

  function applyInvoice(source) {
    if (!source) return;
    setSourceKey(String(source.id));
    setInvoice(source);
    setGstType(source.gstType || '');
    setLines(
      (source.items || []).map((line) => ({
        product: line.product || '',
        hsn: line.hsn || '',
        uom: line.uom || '',
        qty: String(Number(line.qty) || 0),
        rate: String(Number(line.rate) || 0),
        gstRate: String(Number(line.gstRate) || 0),
        discount: '0'
      }))
    );
  }

  /* Preselect the original invoice from ?invoice=<id|invoiceNo> once the
     source list has loaded. */
  useEffect(() => {
    let cancelled = false;
    invoiceService
      .getAdjustmentNoteSources()
      .then((list) => {
        if (cancelled) return;
        const nextSources = list || [];
        setSources(nextSources);
        const requested = searchParams.get('invoice');
        const target = requested
          ? nextSources.find((s) => String(s.id) === String(requested) || s.invoiceNo === requested)
          : null;
        if (target) applyInvoice(target);
        setSourcesLoading(false);
      })
      .catch(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time load + prefill
  }, []);

  const handleSourceChange = (value) => {
    setSourceKey(value || '');
    setInvoice(null);
    setLines(EMPTY_LINES);
    if (value) {
      /* SearchableSelect coerces option values to strings, so compare ids as
         strings — a strict === against the numeric invoice id never matched and
         left the form with no resolved invoice. */
      const source = sources.find((s) => String(s.id) === String(value));
      if (source) applyInvoice(source);
    }
  };

  /* ── Live totals via the same document math as invoices ───────── */
  const hasLines = lines.length > 0;
  const totals = useMemo(() => {
    if (!hasLines) return null;
    const rows = lines
      .map((line) => ({
        qty: Number(line.qty) || 0,
        rate: Number(line.rate) || 0,
        discount: Number(line.discount) || 0,
        gstRate: Number(line.gstRate) || 0
      }))
      .filter((l) => l.qty > 0 && l.rate > 0);
    if (rows.length === 0) return null;
    return calcDocumentTotals(rows, Number(discount) || 0, Number(charges) || 0, gstType);
  }, [lines, discount, charges, gstType, hasLines]);

  const freightAmt = Number(freight) || 0;
  const noteValue = totals
    ? round2(totals.total + freightAmt)
    : round2((Number(manualAmount) || 0) + (Number(manualGst) || 0) + (Number(charges) || 0) + freightAmt);

  const isCredit = noteType === ADJUSTMENT_NOTE_TYPE.CREDIT;
  const outstanding = Number(invoice?.outstanding) || 0;
  const exceedsBalance = isCredit && !!invoice && noteValue > outstanding + 0.01;
  const canSave = reason.trim() && noteValue > 0 && (!exceedsBalance || allowExcess);
  const canSubmit = canSave && invoice;

  const updateLine = (index, field, value) => {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  };

  const removeLine = (index) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const persist = async (asSubmitted) => {
    setSubmitting(true);
    const finalReason = (reasonPreset && reasonPreset !== 'Other' ? `${reasonPreset} — ` : '') + reason;
    const payload = {
      invoiceId: invoice?.id,
      invoiceNo: invoice?.invoiceNo,
      noteType,
      noteDate,
      reason: finalReason.trim(),
      reference,
      notes,
      gstType,
      discount: Number(discount) || 0,
      charges: Number(charges) || 0,
      freight: freightAmt,
      attachments,
      allowExcess,
      status: asSubmitted ? ADJUSTMENT_NOTE_STATUS.SUBMITTED : ADJUSTMENT_NOTE_STATUS.DRAFT
    };
    if (hasLines) {
      payload.items = lines
        .map((line) => ({
          product: line.product || '',
          hsn: line.hsn || '',
          uom: line.uom || '',
          qty: Number(line.qty) || 0,
          rate: Number(line.rate) || 0,
          gstRate: Number(line.gstRate) || 0,
          discount: Number(line.discount) || 0
        }))
        .filter((l) => l.qty > 0 && l.rate > 0);
    } else {
      payload.amount = Number(manualAmount) || 0;
      payload.gst = Number(manualGst) || 0;
    }
    try {
      const note = await invoiceService.createAdjustmentNote(payload);
      toast.success(
        asSubmitted
          ? `${note.noteNo} created and submitted for approval`
          : `${note.noteNo} saved as draft`
      );
      navigate('/purchase/invoices/notes');
    } catch (err) {
      toast.error(err?.message || 'Failed to create the note');
      setSubmitting(false);
    }
  };

  const handleSaveDraft = () => { if (canSave) persist(false); };
  const handleSubmit = () => { if (canSubmit) persist(true); };

  const handleReset = () => {
    setConfirmDiscard(false);
    setSourceKey('');
    setInvoice(null);
    setLines(EMPTY_LINES);
    setManualAmount('');
    setManualGst('');
    setReason('');
    setReasonPreset('');
    setReference('');
    setNotes('');
    setAllowExcess(false);
    setDiscount('0');
    setCharges('0');
    setFreight('0');
    setAttachments([]);
    setNoteDate(todayISO());
    setResetKey((k) => k + 1);
    toast.info('Form cleared');
  };

  return (
    <PurchasePageLayout className="purchase-page--form" key={resetKey}>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Credit / Debit Notes', to: '/purchase/invoices/notes' },
          { label: 'New Note' }
        ]}
        icon={FilePen}
        title={`New ${noteType}`}
        subtitle="Raise a note against an original vendor invoice — it adjusts the outstanding once approved"
        actions={
          <button type="button" onClick={() => navigate('/purchase/invoices/notes')} className="po-btn po-btn-secondary">
            <ChevronLeft className="po-btn-icon-ic" /> Back to Notes
          </button>
        }
      />

      <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) handleSubmit(); }} noValidate>
      <div className="purchase-page-form-grid">
        <div className="purchase-main-form">
          {/* ============ NOTE TYPE + ORIGINAL INVOICE ============ */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><FilePen aria-hidden="true" /> Note Details</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField label="Note Type" hint="Credit reduces the vendor payable; Debit raises it">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setNoteType(ADJUSTMENT_NOTE_TYPE.CREDIT)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                        isCredit
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <MinusCircle className="w-3.5 h-3.5" /> Credit Note
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteType(ADJUSTMENT_NOTE_TYPE.DEBIT)}
                      className={`rounded-lg border px-3 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
                        !isCredit
                          ? 'border-rose-300 bg-rose-50 text-rose-800'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      <PlusCircle className="w-3.5 h-3.5" /> Debit Note
                    </button>
                  </div>
                </FormField>
                <FormField label="Note Date">
                  <DateInput value={noteDate} onChange={(e) => setNoteDate(e.target.value)} />
                </FormField>

                <FormField label="Original Invoice" required className="sm:col-span-2">
                  <SearchableSelect
                    value={sourceKey}
                    onChange={handleSourceChange}
                    options={sources.map((s) => ({
                      value: s.id,
                      label: `${s.invoiceNo} · ${s.vendor} · Outstanding ${formatAmount(s.outstanding)}`
                    }))}
                    placeholder={sourcesLoading ? 'Loading invoices…' : 'Select the vendor invoice to adjust…'}
                    ariaLabel="Original invoice"
                  />
                </FormField>

                {invoice && (
                  <div className="sm:col-span-2 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Vendor</div>
                      <div className="font-bold text-slate-800 mt-0.5">{invoice.vendor}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">PO</div>
                      <div className="font-semibold text-slate-700 mt-0.5">{invoice.poNo || '—'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice Total</div>
                      <div className="font-bold text-slate-800 mt-0.5 tabular-nums">{formatAmount(invoice.total)}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Outstanding</div>
                      <div className="font-bold text-amber-700 mt-0.5 tabular-nums">{formatAmount(invoice.outstanding)}</div>
                    </div>
                  </div>
                )}

                <FormField label="Reason" required>
                  <SelectInput value={reasonPreset} onChange={(e) => setReasonPreset(e.target.value)}>
                    <option value="">Select common reason…</option>
                    {ADJUSTMENT_NOTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </SelectInput>
                </FormField>
                <FormField label="Reason Detail" required>
                  <TextInput
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={isCredit ? 'e.g. 12 units returned on GRN…' : 'e.g. Freight overrun billed by vendor…'}
                    ariaLabel="Reason detail"
                  />
                </FormField>
                <FormField label="Reference">
                  <TextInput
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Vendor reference / return number / debit letter"
                    ariaLabel="Reference"
                  />
                </FormField>
                <FormField label="Notes">
                  <TextArea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional remarks…" />
                </FormField>
                <FormField label="Attachments" hint="Supporting return note, debit letter, photos" className="sm:col-span-2">
                  <AttachmentManager attachments={attachments} onChange={setAttachments} />
                </FormField>
              </div>
            </div>
          </div>

          {/* ============ ITEMS ============ */}
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Receipt aria-hidden="true" /> {isCredit ? 'Items Being Credited' : 'Items Being Debited'}</h3>
            </div>
            <div className="purchase-form-card-body">
              {!hasLines ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label={isCredit ? 'Credit Amount (excl. GST)' : 'Debit Amount (excl. GST)'} required>
                    <NumberInput min="0" step="any" value={manualAmount} onChange={(e) => setManualAmount(e.target.value)} placeholder="0.00" />
                  </FormField>
                  <FormField label="GST Amount">
                    <NumberInput min="0" step="any" value={manualGst} onChange={(e) => setManualGst(e.target.value)} placeholder="0.00" />
                  </FormField>
                  <p className="text-xs text-slate-400 sm:col-span-2">
                    Select an invoice above to prefill its lines, or enter a header amount when the note is not line-based.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="po-table po-table-compact w-full text-[12px]">
                      <thead>
                        <tr>
                          <th className="w-8">#</th>
                          <th>Item</th>
                          <th className="text-right">Qty</th>
                          <th className="text-right">Rate</th>
                          <th className="text-right">Disc %</th>
                          <th className="text-right">GST %</th>
                          <th className="text-right">Line Total</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, index) => {
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
                                <div className="text-[10px] text-slate-400">{[line.hsn, line.uom].filter(Boolean).join(' · ') || '\u00A0'}</div>
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={qty || ''}
                                  onChange={(e) => updateLine(index, 'qty', e.target.value)}
                                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right text-[12px] outline-none focus:border-[#0B4A3D]"
                                  aria-label={`Quantity for ${line.product}`}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={rate || ''}
                                  onChange={(e) => updateLine(index, 'rate', e.target.value)}
                                  className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-[12px] outline-none focus:border-[#0B4A3D]"
                                  aria-label={`Rate for ${line.product}`}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  step="any"
                                  value={discRate || ''}
                                  onChange={(e) => updateLine(index, 'discount', e.target.value)}
                                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-[12px] outline-none focus:border-[#0B4A3D]"
                                  aria-label={`Discount for ${line.product}`}
                                />
                              </td>
                              <td>
                                <input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={gstRate || ''}
                                  onChange={(e) => updateLine(index, 'gstRate', e.target.value)}
                                  className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right text-[12px] outline-none focus:border-[#0B4A3D]"
                                  aria-label={`GST rate for ${line.product}`}
                                />
                              </td>
                              <td className="text-right font-semibold text-slate-700 tabular-nums">{formatAmount(base + tax)}</td>
                              <td className="text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLine(index)}
                                  className="p-1 text-slate-300 hover:text-rose-500 transition-colors"
                                  aria-label={`Remove ${line.product}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                    <FormField label="Header Discount %">
                      <NumberInput min="0" max="100" step="any" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="0" />
                    </FormField>
                    <FormField label="Charges">
                      <NumberInput min="0" step="any" value={charges} onChange={(e) => setCharges(e.target.value)} placeholder="0.00" />
                    </FormField>
                    <FormField label="Freight">
                      <NumberInput min="0" step="any" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0.00" />
                    </FormField>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ============ EXCESS CREDIT CONTROL ============ */}
          {isCredit && invoice && noteValue > 0 && (
            <div className={`purchase-form-card ${exceedsBalance ? '' : 'opacity-70'}`}>
              <div className="purchase-form-card-header">
                <h3><AlertTriangle aria-hidden="true" /> Balance Control</h3>
              </div>
              <div className="purchase-form-card-body">
                {exceedsBalance ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 mb-3">
                    <p className="text-xs font-semibold text-amber-800">
                      This credit note ({formatAmount(noteValue)}) exceeds the outstanding balance of {invoice.invoiceNo} ({formatAmount(outstanding)}).
                    </p>
                    <p className="text-[11px] text-amber-700 mt-1">
                      Notes above the outstanding balance are blocked unless you explicitly allow them — an over-credit creates a
                      vendor credit that offsets future invoices.
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">
                    Note value {formatAmount(noteValue)} is within the invoice's outstanding balance of {formatAmount(outstanding)} — no special allowance needed.
                  </p>
                )}
                <label className="flex items-start gap-2.5 cursor-pointer mt-2">
                  <input
                    type="checkbox"
                    checked={allowExcess}
                    onChange={(e) => setAllowExcess(e.target.checked)}
                    className="mt-0.5 accent-[#0B4A3D]"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Allow excess credit
                    {allowExcess && <span className="block text-[11px] font-normal text-slate-500 mt-0.5">Recorded on the note — the credit will reduce this invoice to zero and create vendor credit.</span>}
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        <aside className="purchase-sidebar-form">
          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Receipt aria-hidden="true" /> Note Summary</h3>
            </div>
            <div className="purchase-form-card-body">
              <div className="purchase-total-row">
                <span className="total-label">Type</span>
                <span className="total-value">{noteType}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Vendor</span>
                <span className="total-value max-w-[160px] truncate">{invoice?.vendor || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Original Invoice</span>
                <span className="total-value">{invoice?.invoiceNo || '—'}</span>
              </div>
              <div className="purchase-total-row">
                <span className="total-label">Note Date</span>
                <span className="total-value">{noteDate || '—'}</span>
              </div>
              <div className="mt-2 pt-2 border-t border-slate-100 flex flex-col gap-1.5 text-[12px] text-slate-600">
                {totals && (
                  <>
                    <div className="flex justify-between"><span>Taxable Value</span><span>{formatAmount(totals.taxable)}</span></div>
                    {totals.gstTotal > 0 && <div className="flex justify-between"><span>GST</span><span>{formatAmount(totals.gstTotal)}</span></div>}
                    {totals.charges > 0 && <div className="flex justify-between"><span>Charges</span><span>{formatAmount(totals.charges)}</span></div>}
                  </>
                )}
                {!hasLines && manualAmount !== '' && (
                  <>
                    <div className="flex justify-between"><span>Amount</span><span>{formatAmount(Number(manualAmount) || 0)}</span></div>
                    <div className="flex justify-between"><span>GST</span><span>{formatAmount(Number(manualGst) || 0)}</span></div>
                  </>
                )}
                {freightAmt > 0 && <div className="flex justify-between"><span>Freight</span><span>{formatAmount(freightAmt)}</span></div>}
                <div className={`flex justify-between font-bold text-[13px] pt-1.5 border-t border-slate-200 ${
                  isCredit ? 'text-emerald-700' : 'text-rose-700'
                }`}>
                  <span>{isCredit ? 'Credits Vendor' : 'Debits Vendor'}</span>
                  <span className="tabular-nums">{isCredit ? '−' : '+'}{formatAmount(noteValue)}</span>
                </div>
              </div>
              {exceedsBalance && !allowExcess && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  Tick “Allow excess credit” to save this note.
                </div>
              )}
              {!canSave && noteValue > 0 && !reason.trim() && (
                <div className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  A reason is required.
                </div>
              )}
              {noteValue <= 0 && (
                <div className="mt-2 rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-[11px] font-semibold text-rose-700">
                  Note value must be greater than zero.
                </div>
              )}
            </div>
          </div>

          <div className="purchase-form-card">
            <div className="purchase-form-card-header">
              <h3><Link2 aria-hidden="true" /> How notes work</h3>
            </div>
            <div className="purchase-form-card-body text-[12px] text-slate-600 leading-relaxed space-y-2">
              <p>
                <strong className="text-slate-800">Credit Note</strong> (goods returned, rejected stock, rate or tax correction)
                reduces the invoice outstanding and the vendor payable.
              </p>
              <p>
                <strong className="text-slate-800">Debit Note</strong> (freight overrun, additional charge) raises the amount owed.
              </p>
              <p className="text-[11px] text-slate-500">
                Notes are applied to the ledger only after approval on the Credit / Debit Notes page. Payments and reports read the
                adjusted outstanding.
              </p>
            </div>
          </div>
        </aside>
      </div>

      <FormActions
        submitting={submitting}
        submitLabel="Create & Submit"
        draftLabel="Save Draft"
        showDraft
        onDraft={handleSaveDraft}
        onCancel={() => navigate('/purchase/invoices/notes')}
        onReset={() => setConfirmDiscard(true)}
      />
      </form>

      <ConfirmDialog
        open={confirmDiscard}
        title="Clear form"
        message="Are you sure you want to clear the form? All unsaved changes will be lost."
        onConfirm={handleReset}
        onCancel={() => setConfirmDiscard(false)}
      />
    </PurchasePageLayout>
  );
}
