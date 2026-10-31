/**
 * purchase/pages/invoices/InvoiceDetailDrawer.jsx
 * ------------------------------------------------------------------
 * Right side-panel detail view for a single invoice. Shows all
 * sections requested: Invoice Info, Vendor Info, PO Info, Amount
 * Breakdown, Tax, Matching Status, Approval Status, Payment Status,
 * Outstanding Amount, Attachments, Notes, and Audit Timeline.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileText,
  Paperclip, X
} from 'lucide-react';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { invoiceService } from '../../services/invoice';
import { MATCH_STATUS, PAYMENT_STATUS, INVOICE_STATUS } from '../../constants';
import {
  formatAmount, derivePaymentStatus, deriveAdviceStatus,
  getPaymentStatusBadge, getAdviceStatusBadge,
  formatAuditTimeline, getInvoiceOutstanding
} from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

function Row({ label, value }) {
  return (
    <div className="py-1.5">
      <div className={LABEL}>{label}</div>
      <div className={`${VALUE} mt-0.5`}>{value || '—'}</div>
    </div>
  );
}

const MATCH_TONES = {
  [MATCH_STATUS.MATCHED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [MATCH_STATUS.MISMATCH]: 'bg-rose-50 text-rose-600 border-rose-200',
  [MATCH_STATUS.PENDING]: 'bg-amber-50 text-amber-700 border-amber-200',
  [MATCH_STATUS.EXCEPTION]: 'bg-slate-100 text-slate-600 border-slate-200'
};

const PAYMENT_TONES = {
  [PAYMENT_STATUS.UNPAID]: 'bg-slate-100 text-slate-700 border-slate-200',
  [PAYMENT_STATUS.SCHEDULED]: 'bg-blue-50 text-blue-700 border-blue-200',
  [PAYMENT_STATUS.PROCESSING]: 'bg-amber-50 text-amber-700 border-amber-200',
  [PAYMENT_STATUS.PAID]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [PAYMENT_STATUS.PARTIALLY_PAID]: 'bg-sky-50 text-sky-700 border-sky-200',
  [PAYMENT_STATUS.FAILED]: 'bg-rose-50 text-rose-700 border-rose-200'
};

function StatusPill({ label, tone }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${tone || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

function AuditEntry({ entry }) {
  const time = new Date(entry.timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const actionLabels = {
    created: 'Invoice Created',
    submitted: 'Submitted for Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    resubmitted: 'Resubmitted',
    payment_recorded: 'Payment Recorded',
    payment_scheduled: 'Payment Scheduled',
    advice_generated: 'Advice Generated',
    advice_sent: 'Advice Sent'
  };
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#0B4A3D] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-700">{actionLabels[entry.action] || entry.action}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{entry.actor || 'System'} · {time}</div>
        {entry.details?.note && <div className="text-[11px] text-slate-500 mt-0.5 italic">{entry.details.note}</div>}
      </div>
    </div>
  );
}

export default function InvoiceDetailDrawer({ open, invoiceId, onClose }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadInvoice = useCallback(async () => {
    if (!open || !invoiceId) { setRecord(null); setLoading(false); return; }
    setLoading(true);
    try {
      const data = await invoiceService.getInvoice(invoiceId);
      setRecord(data);
    } catch {
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [open, invoiceId]);

  useEffect(() => {
    queueMicrotask(loadInvoice);
  }, [loadInvoice]);

  if (!open) return null;

  const paymentStatus = record ? derivePaymentStatus(record) : PAYMENT_STATUS.UNPAID;
  const adviceStatus = record ? deriveAdviceStatus(record) : 'Not Issued';
  const paidAmount = Number(record?.paidAmount) || 0;
  const total = Number(record?.total) || 0;
  /* Approved credit / debit notes reduce this balance. */
  const outstanding = record ? getInvoiceOutstanding(record) : 0;
  const adjustments = record?.adjustments || { credit: 0, debit: 0, net: 0, count: 0 };
  const auditEntries = record ? formatAuditTimeline(record.auditHistory) : [];
  const matchReasons = record?.matchReasons || [];
  const matchDetails = record?.matchDetails || [];
  const paymentHistory = record?.paymentHistory || [];
  const previousApprovals = auditEntries.filter((entry) =>
    ['approved', 'rejected', 'correction_requested', 'resubmitted'].includes(entry.action)
  );

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        className="relative w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden animate-[slideInRight_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Invoice details"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#EDF7F4] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4 text-[#0B4A3D]" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 truncate">{record?.invoiceNo || 'Loading...'}</div>
              <div className="text-[11px] text-slate-500 truncate">{record?.vendor || ''}</div>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <div className="w-5 h-5 border-2 border-slate-300 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {!loading && !record && (
            <div className="text-center py-12 text-sm text-slate-500">Invoice not found</div>
          )}

          {!loading && record && (
            <>
              {/* Status Badges Row */}
              <div className="flex flex-wrap gap-2">
                <PurchaseStatusBadge status={record.status} />
                <StatusPill
                  label={record.matchStatus || 'Pending Match'}
                  tone={MATCH_TONES[record.matchStatus] || MATCH_TONES[MATCH_STATUS.PENDING]}
                />
                <StatusPill
                  label={getPaymentStatusBadge(record).label}
                  tone={PAYMENT_TONES[paymentStatus] || PAYMENT_TONES[PAYMENT_STATUS.UNPAID]}
                />
              </div>

              {/* Approved credit / debit note adjustments */}
              {adjustments.count > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1.5">
                    Approved adjustments ({adjustments.count})
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                    <span className="font-semibold text-emerald-700">Credit {formatAmount(adjustments.credit)}</span>
                    <span className="font-semibold text-rose-700">Debit {formatAmount(adjustments.debit)}</span>
                    <span className={`font-bold ${adjustments.net < 0 ? 'text-emerald-700' : adjustments.net > 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                      Net {adjustments.net < 0 ? '−' : adjustments.net > 0 ? '+' : ''}{formatAmount(Math.abs(adjustments.net))}
                    </span>
                  </div>
                </div>
              )}

              {/* Invoice Information */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Invoice Information</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Row label="Invoice No" value={record.invoiceNo} />
                  <Row label="Invoice Date" value={formatDate(record.invoiceDate)} />
                  <Row label="Due Date" value={formatDate(record.dueDate)} />
                  <Row label="Status" value={<PurchaseStatusBadge status={record.status} />} />
                </div>
              </div>

              {/* Vendor Information */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Vendor Information</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Row label="Vendor" value={record.vendor} />
                  <Row label="Vendor Email" value={record.vendorEmail} />
                </div>
              </div>

              {/* PO Information */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">PO Information</div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <Row label="PO Number" value={record.poNo} />
                  <Row label="GST Type" value={record.gstType} />
                </div>
              </div>

              {/* Amount Breakdown */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Amount Breakdown</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount (excl. GST)</div>
                    <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(record.amount)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GST</div>
                    <div className="text-sm font-bold text-slate-900 mt-1 tabular-nums">{formatAmount(record.gst)}</div>
                  </div>
                  <div className="rounded-lg bg-[#EDF7F4] border border-[#0B4A3D]/20 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#0A4F44]">Total</div>
                    <div className="text-sm font-bold text-[#0B4A3D] mt-1 tabular-nums">{formatAmount(record.total)}</div>
                  </div>
                </div>
              </div>

              {/* Matching Status */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Matching Status</div>
                <div className="flex items-center gap-2 mb-2">
                  <StatusPill
                    label={record.matchStatus || 'Pending Match'}
                    tone={MATCH_TONES[record.matchStatus] || MATCH_TONES[MATCH_STATUS.PENDING]}
                  />
                </div>
                {matchReasons.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {matchReasons.map((reason, i) => (
                      <p key={i} className="text-[11px] font-semibold text-rose-600 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {reason}
                      </p>
                    ))}
                  </div>
                )}
                {record.matchStatus === MATCH_STATUS.MATCHED && (
                  <p className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    Three-way match passed
                  </p>
                )}
                {/* Line-level match details */}
                {matchDetails.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-2">Line Comparison</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px]">
                        <thead>
                          <tr className="border-b border-slate-100">
                            <th className="text-left font-bold text-slate-500 py-1 pr-2">Product</th>
                            <th className="text-right font-bold text-slate-500 py-1 px-1">PO Qty</th>
                            <th className="text-right font-bold text-slate-500 py-1 px-1">GRN Qty</th>
                            <th className="text-right font-bold text-slate-500 py-1 px-1">Inv Qty</th>
                            <th className="text-center font-bold text-slate-500 py-1 pl-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matchDetails.map((d, i) => (
                            <tr key={i} className="border-b border-slate-50">
                              <td className="py-1 pr-2 font-semibold text-slate-700">{d.product}</td>
                              <td className="py-1 px-1 text-right tabular-nums text-slate-600">{d.poQty || '—'}</td>
                              <td className="py-1 px-1 text-right tabular-nums text-slate-600">{d.grnQty || '—'}</td>
                              <td className="py-1 px-1 text-right tabular-nums text-slate-700">{d.invoiceQty || '—'}</td>
                              <td className="py-1 pl-1 text-center">
                                {d.matched
                                  ? <span className="text-emerald-600 font-bold">✓</span>
                                  : <span className="text-rose-500 font-bold">✗</span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* Approval Status */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Approval Status</div>
                <div className="flex items-center gap-2">
                  <PurchaseStatusBadge status={record.status} />
                  {record.status === INVOICE_STATUS.SUBMITTED && record.matchStatus !== MATCH_STATUS.MATCHED && (
                    <span className="text-[11px] font-semibold text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Blocked — match required
                    </span>
                  )}
                </div>
                {record.correctionRequested && record.correctionReason && (
                  <div className="mt-2 rounded bg-amber-50 border border-amber-200 px-3 py-2">
                    <div className="text-[10px] font-bold text-amber-700 uppercase tracking-wide">Correction Reason</div>
                    <p className="text-[11px] font-semibold text-amber-800 mt-0.5">{record.correctionReason}</p>
                  </div>
                )}
              </div>

              {/* Payment Status */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Payment Status</div>
                <div className="flex items-center gap-2 mb-2">
                  <StatusPill
                    label={getPaymentStatusBadge(record).label}
                    tone={PAYMENT_TONES[paymentStatus] || PAYMENT_TONES[PAYMENT_STATUS.UNPAID]}
                  />
                  {adviceStatus !== 'Not Issued' && (
                    <StatusPill label={getAdviceStatusBadge(record).label} tone="bg-blue-50 text-blue-700 border-blue-200" />
                  )}
                </div>
                {record.paymentDate && (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    Paid on {formatDate(record.paymentDate)} via {record.paymentMethod}
                  </p>
                )}
                {record.paymentNo && (
                  <p className="text-[11px] text-slate-500 mt-0.5">Payment Ref: {record.paymentNo}</p>
                )}
              </div>

              {/* Outstanding Amount */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Outstanding</div>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-slate-900 tabular-nums">{formatAmount(outstanding)}</span>
                  <span className="text-[11px] text-slate-500">
                    of {formatAmount(total)} total
                    {paidAmount > 0 && ` · ${formatAmount(paidAmount)} paid`}
                  </span>
                </div>
                {outstanding > 0 && total > 0 && (
                  <div className="mt-2 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#0B4A3D] rounded-full transition-all"
                      style={{ width: `${Math.min(100, (paidAmount / total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Notes */}
              {record.notes && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Notes</div>
                  <p className="text-xs font-semibold text-slate-700">{record.notes}</p>
                </div>
              )}

              {/* Payment History */}
              {paymentHistory.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Payment History ({paymentHistory.length})</div>
                  <div className="space-y-2">
                    {paymentHistory.map((ph, i) => (
                      <div key={i} className="flex items-center justify-between py-1.5 border-b border-slate-50 last:border-0">
                        <div>
                          <span className="text-xs font-bold text-slate-700">{ph.paymentNo}</span>
                          <span className="text-[11px] text-slate-500 ml-2">{formatDate(ph.paidOn || ph.date)}</span>
                        </div>
                        <span className="text-xs font-bold text-emerald-700 tabular-nums">{formatAmount(ph.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Previous Approval Actions */}
              {previousApprovals.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Approval History</div>
                  <div className="divide-y divide-slate-100">
                    {previousApprovals.map((entry, i) => (
                      <AuditEntry key={i} entry={entry} />
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments */}
              {(record.attachments || []).length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Attachments ({(record.attachments || []).length})
                  </div>
                  <div className="space-y-1.5">
                    {(record.attachments || []).map((att, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                        <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{att.name || att.fileName || `Attachment ${i + 1}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Audit Timeline */}
              {auditEntries.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Audit Timeline ({auditEntries.length})
                  </div>
                  <div className="divide-y divide-slate-100">
                    {[...auditEntries].reverse().map((entry, i) => (
                      <AuditEntry key={i} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
            Close
          </button>
        </div>
      </aside>
    </div>
  );
}
