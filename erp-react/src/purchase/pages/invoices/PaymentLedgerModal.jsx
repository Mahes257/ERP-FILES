import { useEffect, useMemo, useState } from 'react';
import { X, Loader2, BookOpen, Search, RotateCcw, AlertTriangle, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { invoiceService } from '../../services/invoice';
import { PAYMENT_ENTRY_STATUS } from '../../constants';
import { formatAmount, formatCurrency } from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';
import useDebounce from '../../hooks/useDebounce';
import '../../styles/cpr-list.css';

/**
 * Payment Ledger Modal — the full vendor payment ledger.
 *
 * Every payment recorded against any invoice, newest first, with the
 * complete per-payment metadata and a Reversal action for Active
 * entries. Read-only with respect to the payables list — the ledger
 * is the book of record for all money movement.
 */
export default function PaymentLedgerModal({ open, onClose, onChanged }) {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const debouncedSearch = useDebounce(searchInput, 300);
  const [reversing, setReversing] = useState(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseError, setReverseError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLedger = (searchOverride) => {
    setLoading(true);
    invoiceService
      .getPaymentLedger({ search: searchOverride === undefined ? debouncedSearch : searchOverride, page: 1, pageSize: 500 })
      .then((result) => { setRows(result.data || []); setTotal(result.total || 0); })
      .catch(() => { setRows([]); setTotal(0); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setSearchInput('');
      setReversing(null);
      setReverseReason('');
      setReverseError('');
      setBusy(false);
      loadLedger('');
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate: fresh load on open */
  }, [open]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => loadLedger());
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- debounced search */
  }, [debouncedSearch]);

  const activeRows = useMemo(
    () => rows.filter((r) => (r.status || PAYMENT_ENTRY_STATUS.ACTIVE) !== PAYMENT_ENTRY_STATUS.REVERSED),
    [rows]
  );
  const activeTotal = activeRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  if (!open) return null;

  const confirmReverse = async (row) => {
    if (!reverseReason.trim()) {
      setReverseError('Enter a reason for the reversal');
      return;
    }
    setBusy(true);
    setReverseError('');
    try {
      await invoiceService.reversePayment(row.invoiceId, row.paymentNo, { reason: reverseReason.trim() });
      setReversing(null);
      setReverseReason('');
      loadLedger();
      onChanged?.();
    } catch (err) {
      setReverseError(err?.message || 'Reversal failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center">
              <BookOpen size={16} className="text-sky-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Payment Ledger</h3>
              <p className="text-[11px] text-slate-500">Every payment across all invoices — {total} entr{total === 1 ? 'y' : 'ies'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer">
            <X size={16} />
          </button>
        </div>

        {/* Summary strip */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 bg-slate-50 border-b border-slate-100">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Payments</p>
            <p className="text-sm font-bold text-slate-800">{activeRows.length}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Active Value</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatAmount(activeTotal)}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Reversed</p>
            <p className="text-sm font-bold text-rose-500 tabular-nums">{rows.length - activeRows.length}</p>
          </div>
        </div>

        <div className="px-5 py-3 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search payment no / invoice / PO / vendor / UTR / bank..."
              className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xs font-semibold text-slate-700 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={20} className="animate-spin text-slate-400" />
              <span className="ml-2 text-xs font-semibold text-slate-500">Loading ledger...</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16">
              <BookOpen size={26} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-semibold text-slate-500">No payments in the ledger</p>
              <p className="text-[11px] text-slate-400 mt-1">Record a payment against an approved invoice to see it here.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {rows.map((row) => {
                const isReversed = (row.status || PAYMENT_ENTRY_STATUS.ACTIVE) === PAYMENT_ENTRY_STATUS.REVERSED;
                return (
                  <div key={row.id} className={`px-5 py-3 ${isReversed ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-bold ${isReversed ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{row.paymentNo}</span>
                          <span className="text-[11px] font-semibold text-slate-500">{formatDate(row.paymentDate)}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold border
                            ${isReversed ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}">
                            {isReversed ? 'Reversed' : 'Active'}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
                          <button
                            type="button"
                            onClick={() => navigate(`/purchase/invoices/${row.invoiceId}`)}
                            className="inline-flex items-center gap-1 font-bold text-[#0B4A3D] hover:underline cursor-pointer"
                          >
                            {row.invoiceNo} <ExternalLink size={10} />
                          </button>
                          <span>{row.vendor}</span>
                          {row.poNo && <span>PO {row.poNo}</span>}
                          <span>{row.bank || '—'}</span>
                          <span>{row.method}</span>
                          {row.transactionReference && <span className="font-semibold text-slate-600">UTR {row.transactionReference}</span>}
                        </div>
                        {(Number(row.charges) > 0 || Number(row.tds) > 0) && (
                          <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-slate-400">
                            {Number(row.charges) > 0 && <span>Charges {formatCurrency(row.charges, row.currency)}</span>}
                            {Number(row.tds) > 0 && <span>TDS {formatCurrency(row.tds, row.currency)}</span>}
                          </div>
                        )}
                        {isReversed && row.reversalReason && (
                          <p className="mt-1 text-[11px] text-rose-500 italic">
                            Reversed by {row.reversedBy || '—'} on {formatDate(row.reversedAt)} — "{row.reversalReason}"
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-sm font-bold tabular-nums ${isReversed ? 'text-slate-400 line-through' : 'text-sky-700'}`}>
                          {formatCurrency(row.amount, row.currency)}
                        </span>
                        {Number(row.exchangeRate) !== 1 && (
                          <p className="text-[10px] text-slate-400">≈ {formatAmount(Number(row.amount) * (Number(row.exchangeRate) || 1))} @ {row.exchangeRate}</p>
                        )}
                        {!isReversed && (
                          <div className="mt-1">
                            {reversing === row.paymentNo ? (
                              <div className="flex flex-col items-end gap-1.5">
                                <input
                                  type="text"
                                  value={reverseReason}
                                  onChange={(e) => setReverseReason(e.target.value)}
                                  placeholder="Reason (required)"
                                  className="w-64 rounded-lg border border-rose-200 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 focus:border-rose-400 outline-none"
                                />
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => confirmReverse(row)}
                                    disabled={busy}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white transition-colors cursor-pointer disabled:opacity-50"
                                  >
                                    {busy && <Loader2 size={10} className="animate-spin" />}
                                    Confirm Reversal
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
                                  <p className="text-[10px] font-semibold text-rose-600 flex items-center gap-1">
                                    <AlertTriangle size={10} /> {reverseError}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => { setReversing(row.paymentNo); setReverseReason(''); setReverseError(''); }}
                                className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded transition-colors cursor-pointer"
                              >
                                <RotateCcw size={11} /> Reverse
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
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