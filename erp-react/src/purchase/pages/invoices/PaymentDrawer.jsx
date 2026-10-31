import { useEffect, useState } from 'react';
import { X, Loader2, FileText, AlertTriangle } from 'lucide-react';
import { TextInput, SelectInput, NumberInput, DateInput, TextArea } from '../../components/ui';
import { CURRENCIES, PAYMENT_METHODS, PAYMENT_STATUS } from '../../constants';
import { formatCurrency } from '../../utils/paymentUtils';
import { todayISO } from '../../utils/helpers';
import { invoicesStore, normalizeExchangeRate } from '../../services/invoice';
import { readSettings } from '../../services/settings';
import { nextSeqNo, round2 } from '../../utils/purchase';

const BANK_ACCOUNTS = [
  'HDFC Bank — 50100012345678',
  'ICICI Bank — 12345678901234',
  'SBI — 30212345678901',
  'Axis Bank — 91234567890123',
  'Cash Account'
];

export default function PaymentDrawer({ open, invoice, onClose, onConfirm, actionLoading }) {
  const [paymentNo, setPaymentNo] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [paymentAmount, setPaymentAmount] = useState('');
  const [method, setMethod] = useState(PAYMENT_METHODS[0]);
  const [bankAccount, setBankAccount] = useState(BANK_ACCOUNTS[0]);
  const [txnRef, setTxnRef] = useState('');
  const [notes, setNotes] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [paymentCurrency, setPaymentCurrency] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState(1);
  const [charges, setCharges] = useState('0');
  const [tds, setTds] = useState('0');

  /* Payment controls from Settings — overpayment is refused unless explicitly enabled. */
  const settings = readSettings();
  const allowOverpayment = settings?.payment?.allowOverpayment === true;
  const invoiceCurrency = invoice?.currency || 'INR';

  useEffect(() => {
    if (open && invoice) {
      queueMicrotask(() => {
        const cur = invoice.currency || 'INR';
        setPaymentNo(nextSeqNo(invoicesStore.all, 'PAY', 'paymentNo', 100));
        setPaymentDate(todayISO());
        setMethod(PAYMENT_METHODS[0]);
        setBankAccount(BANK_ACCOUNTS[0]);
        setTxnRef('');
        setNotes('');
        setAttachment(null);
        setPaymentCurrency(cur);
        setExchangeRate(normalizeExchangeRate(0, cur, cur));
        setCharges('0');
        setTds('0');
        /* Default to the adjusted outstanding (credit / debit notes count). */
        const outstanding = Number.isFinite(Number(invoice.outstanding))
          ? Math.round(Number(invoice.outstanding) * 100) / 100
          : Math.round(((Number(invoice.total) || 0) - (Number(invoice.paidAmount) || 0)) * 100) / 100;
        setPaymentAmount(String(outstanding > 0 ? outstanding.toFixed(2) : ''));
      });
    }
  }, [open, invoice]);

  if (!open || !invoice) return null;

  const total = Number(invoice.total) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const netPayable = Number(invoice.netPayable) || total;
  /* Prefer the derived outstanding when present (net-payable aware). */
  const outstanding = Number.isFinite(Number(invoice.outstanding))
    ? Math.round((Number(invoice.outstanding)) * 100) / 100
    : Math.round((netPayable - paid) * 100) / 100;

  const amtValue = Number(paymentAmount) || 0;
  const rate = Number(exchangeRate) || 1;
  /* Convert the payment into the invoice currency for balance checks. */
  const amountBase = paymentCurrency === invoiceCurrency
    ? amtValue
    : round2(amtValue * rate);
  const chargesValue = Number(charges) || 0;
  const tdsValue = Number(tds) || 0;
  const exceedsOutstanding = amountBase > outstanding + 0.001;
  const canSubmit = paymentNo.trim() && amtValue > 0 && paymentDate && (!exceedsOutstanding || allowOverpayment);
  const newPaid = round2(paid + amountBase);
  const willBePaid = newPaid >= outstanding - 0.01;

  const handleCurrencyChange = (value) => {
    setPaymentCurrency(value);
    setExchangeRate(normalizeExchangeRate(0, value, invoiceCurrency));
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col animate-slide-in-right">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
              <FileText size={16} className="text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Record Payment</h3>
              <p className="text-[11px] text-slate-500">{invoice.invoiceNo} — {invoice.vendor}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Invoice Amount ({invoiceCurrency})</span>
              <span className="text-sm font-bold text-slate-900 tabular-nums">{formatCurrency(total, invoiceCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Net Payable</span>
              <span className="text-sm font-semibold text-slate-600 tabular-nums">{formatCurrency(netPayable, invoiceCurrency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Already Paid</span>
              <span className="text-sm font-semibold text-slate-600 tabular-nums">{formatCurrency(paid, invoiceCurrency)}</span>
            </div>
            <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Outstanding</span>
              <span className="text-sm font-bold text-amber-600 tabular-nums">{formatCurrency(outstanding, invoiceCurrency)}</span>
            </div>
          </div>

          {invoice.paymentStatus === PAYMENT_STATUS.PAID && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">This invoice is fully paid.</p>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Number *</label>
            <input
              type="text"
              value={paymentNo}
              onChange={(e) => setPaymentNo(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
              placeholder="Auto-generated"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Date *</label>
            <DateInput
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Amount *</label>
            <NumberInput
              min="0"
              step="any"
              value={paymentAmount}
              onChange={(e) => setPaymentAmount(e.target.value)}
              placeholder="0.00"
            />
            {exceedsOutstanding && allowOverpayment && (
              <p className="text-[11px] font-semibold text-amber-600 mt-1 flex items-center gap-1">
                <AlertTriangle size={11} /> Amount exceeds outstanding of {formatCurrency(outstanding, invoiceCurrency)} — overpayment is enabled in Settings
              </p>
            )}
            {exceedsOutstanding && !allowOverpayment && (
              <p className="text-[11px] font-semibold text-red-600 mt-1">
                Amount exceeds outstanding of {formatCurrency(outstanding, invoiceCurrency)}
              </p>
            )}
            {paymentCurrency !== invoiceCurrency && amtValue > 0 && (
              <p className="text-[11px] font-semibold text-slate-500 mt-1">
                ≈ {formatCurrency(amountBase, invoiceCurrency)} at rate {rate} {paymentCurrency} → {invoiceCurrency}
              </p>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Method *</label>
            <SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </SelectInput>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Bank / Cash Account *</label>
            <SelectInput value={bankAccount} onChange={(e) => setBankAccount(e.target.value)}>
              {BANK_ACCOUNTS.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </SelectInput>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Currency</label>
              <SelectInput value={paymentCurrency} onChange={(e) => handleCurrencyChange(e.target.value)}>
                {CURRENCIES.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </SelectInput>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Exchange Rate</label>
              <NumberInput
                min="0"
                step="any"
                value={exchangeRate}
                onChange={(e) => setExchangeRate(e.target.value)}
                disabled={paymentCurrency === invoiceCurrency}
              />
              {paymentCurrency === invoiceCurrency && (
                <p className="text-[10px] text-slate-400 mt-0.5">Same as invoice currency — rate is 1</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Bank Charges</label>
              <NumberInput
                min="0"
                step="any"
                value={charges}
                onChange={(e) => setCharges(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">TDS / Withholding</label>
              <NumberInput
                min="0"
                step="any"
                value={tds}
                onChange={(e) => setTds(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-400 -mt-2">
            Bank charges and TDS are recorded against this payment for the ledger. Invoice-level TDS / retention is already reflected in the Net Payable.
          </p>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Transaction Reference</label>
            <TextInput
              value={txnRef}
              onChange={(e) => setTxnRef(e.target.value)}
              placeholder="UTR / Cheque No / DD No"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>
            <TextArea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional payment notes"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Attachment</label>
            <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors">
              <FileText size={14} className="text-slate-400" />
              <span className="text-xs font-semibold text-slate-500">
                {attachment ? attachment.name : 'Upload receipt (optional)'}
              </span>
              <input
                type="file"
                className="sr-only"
                onChange={(e) => setAttachment(e.target.files?.[0] || null)}
                accept=".pdf,.jpg,.png,.doc,.docx"
              />
            </label>
          </div>

          {willBePaid && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3">
              <p className="text-xs font-semibold text-emerald-700">
                This payment will fully settle the invoice.
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm({
              paymentNo,
              paymentDate,
              amount: amtValue,
              method,
              bankAccount,
              transactionReference: txnRef,
              notes,
              attachment,
              currency: paymentCurrency,
              exchangeRate: rate,
              charges: chargesValue,
              tds: tdsValue
            })}
            disabled={!canSubmit || actionLoading}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-sky-600 to-sky-700 hover:from-sky-700 hover:to-sky-800 text-white"
          >
            {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  );
}