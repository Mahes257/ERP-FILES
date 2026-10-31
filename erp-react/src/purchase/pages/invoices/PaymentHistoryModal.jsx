import { useEffect, useState } from 'react';
import { X, Clock, Loader2, RotateCcw, AlertTriangle } from 'lucide-react';
import { invoiceService } from '../../services/invoice';
import { PAYMENT_ENTRY_STATUS } from '../../constants';
import { formatAmount, formatCurrency } from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

/**
 * Payment History Modal — per-invoice payment ledger.
 *
 * Lists every payment recorded against the invoice with the full
 * ledger metadata (payment date, bank, method, UTR, currency, exchange
 * rate, bank charges, TDS, paid-by, notes) and a Reversal action for
 * Active payments. Reversed entries stay visible, marked Reversed with
 * their reversal reason / actor / date, and stop counting toward the
 * invoice's paid balance.
 */
export default function PaymentHistoryModal({ open, invoice, onClose, onChanged }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reversing, setReversing] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadHistory = () => {
    if (!invoice?.id) return;
    setLoading(true);
    invoiceService
      .getPaymentHistory(invoice.id)
      .then((data) => setHistory(data))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open || !invoice?.id) { queueMicrotask(() => setHistory([])); return; }
    queueMicrotask(() => {
      setReversing(null);
      setReverseReason('');
      setReverseError('');
      setBusy(false);
      loadHistory();
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- loadHistory is stable per invoice open */
  }, [open, invoice?.id]);

  if (!open || !invoice) return null;

  const total = Number(invoice.total) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const outstanding = Number.isFinite(Number(invoice.outstanding))
    ? Number(invoice.outstanding)
    : Math.max(0, total - paid);
  const activeTotal = history
    .filter((e) => (e.status || PAYMENT_ENTRY_STATUS.ACTIVE) !== PAYMENT_ENTRY_STATUS.REVERSED)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const reversedTotal = history
    .filter((e) => (e.status || PAYMENT_ENTRY_STATUS.ACTIVE) === PAYMENT_ENTRY_STATUS.REVERSED)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

  const confirmReverse = async (entry) => {
    if (!reverseReason.trim()) {
      setReverseError('Enter a reason for the reversal');
      return;
    }
    setBusy(true);
    setReverseError('');
    const result = await invoiceService.reversePayment(invoice.id, entry.paymentNo, {
      reason: reverseReason.trim()
    }).then(() => ({ ok: true })).catch((err) => ({ ok: false, error: err }));
    setBusy(false);
    if (result.ok) {
      setReversing(null);
      setReverseReason('');
      loadHistory();
      onChanged?.();
    } else {
      setReverseError(result.error?.message || 'Reversal failed');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <Clock size={16} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Payment Ledger</h3>
              <p className="text-[11px] text-slate-500">{invoice.invoiceNo} — {invoice.vendor}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Invoice Amount</p>
            <p className="text-sm font-bold text-slate-800 tabular-nums">{formatAmount(total)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Paid (Active)</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatAmount(activeTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Reversed</p>
            <p className="text-sm font-bold text-rose-500 tabular-nums">{formatAmount(reversedTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Outstanding</p>
            <p className="text-sm font-bold text-amber-600 tabular-nums">{formatAmount(outstanding)}</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-slate-400" />
              <span className="ml-2 text-xs font-semibold text-slate-500">Loading payment ledger...</span>
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <Clock size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-500">No payments recorded yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                  {history.length} payment{history.length !== 1 ? 's' : ''} recorded
                </span>
              </div>
              {history.slice().reverse().map((entry, idx) => {
                const isReversed = (entry.status || PAYMENT_ENTRY_STATUS.ACTIVE) === PAYMENT_ENTRY_STATUS.REVERSED;
                const entryCurrency = entry.currency || invoice.currency || 'INR';
                const isConverting = entryCurrency !== (invoice.currency || 'INR');
                return (
                  <div
                    key={entry.paymentNo || idx}
                    className={`rounded-lg border bg-white px-4 py-3 ${isReversed ? 'border-rose-200 opacity-80' : 'border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{entry.paymentNo}</span>
                        {isReversed ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-rose-50 text-rose-600 border border-rose-200">
                            <RotateCcw size={9} className="mr-0.5" /> Reversed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`text-sm font-bold tabular-nums ${isReversed ? 'text-slate-400 line-through' : 'text-sky-700'}`}>
                          {formatCurrency(entry.amount, entryCurrency)}
                        </span>
                        {isConverting && (
                          <p className="text-[10px] text-slate-400">≈ {formatAmount(Number(entry.amount) * (Number(entry.exchangeRate) || 1))} @ {entry.exchangeRate}</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5 text-[11px]">
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Payment Date</span>
                        <p className="text-slate-700 font-semibold">{formatDate(entry.paidOn)}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Method</span>
                        <p className="text-slate-700 font-semibold">{entry.method}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Bank</span>
                        <p className="text-slate-700 font-semibold">{entry.bank || '—'}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Currency</span>
                        <p className="text-slate-700 font-semibold">{entryCurrency} {isConverting ? `@ ${entry.exchangeRate}` : ''}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Bank Charges</span>
                        <p className="text-slate-700 font-semibold tabular-nums">{formatCurrency(entry.charges || 0, entryCurrency)}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">TDS / Withholding</span>
                        <p className="text-slate-700 font-semibold tabular-nums">{formatCurrency(entry.tds || 0, entryCurrency)}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">Paid By</span>
                        <p className="text-slate-700 font-semibold">{entry.paidBy}</p>
                      </div>
                      <div>
                        <span className="font-bold text-slate-400 uppercase tracking-wide">UTR / Ref</span>
                        <p className="text-slate-700 font-semibold">{entry.transactionReference || '—'}</p>
                      </div>
                    </div>
                    {entry.notes && <p className="mt-2 text-[11px] text-slate-500 italic">{entry.notes}</p>}
                    {isReversed && (
                      <div className="mt-2 rounded-lg bg-rose-50 border border-rose-100 px-3 py-2 text-[11px] text-rose-700">
                        <p className="font-bold">Reversed by {entry.reversedBy || '—'} on {formatDate(entry.reversedAt)}</p>
                        {entry.reversalReason && <p className="mt-0.5 italic">"{entry.reversalReason}"</p>}
                      </div>
                    )}
                    {!isReversed && (
                      <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-end">
                        {reversing === entry.paymentNo ? (
                          <div className="w-full flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                value={reverseReason}
                                onChange={(e) => setReverseReason(e.target.value)}
                                placeholder="Reason for reversal (required)"
                                className="flex-1 rounded-lg border border-rose-200 px-3 py-1.5 text-[11px] font-semibold text-slate-700 focus:border-rose-400 focus:ring-1 focus:ring-rose-300 outline-none"
                              />
                              <button
                                type="button"
                                onClick={() => confirmReverse(entry)}
                                disabled={busy}
                                className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                              >
                                {busy && <Loader2 size={10} className="animate-spin" />}
                                Confirm
                              </button>
                              <button
                                type="button"
                                onClick={() => { setReversing(null); setReverseReason(''); setReverseError(''); }}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </div>
                            {reverseError && (
                              <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                                <AlertTriangle size={11} /> {reverseError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setReversing(entry.paymentNo); setReverseReason(''); setReverseError(''); }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                          >
                            <RotateCcw size={11} /> Reverse Payment
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-white border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}