/**
 * purchase/pages/invoices/ApprovalDetailDrawer.jsx
 * ------------------------------------------------------------------
 * DEDICATED PAYMENT APPROVAL REVIEW WORKSPACE.
 *
 * Optimized for approvers — NOT a duplicate of the invoice overview.
 * Shows: eligibility checklist, three-way comparison (PO ↔ GRN ↔ Invoice),
 * variance analysis, approval history, reviewer comments, and decision actions.
 *
 * Used by: "Review" action on PaymentApproval page.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, FileText, History,
  MessageSquare, Paperclip, X, XCircle
} from 'lucide-react';
import { TextArea } from '../../components/ui';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { invoiceService } from '../../services/invoice';
import { MATCH_STATUS, INVOICE_STATUS } from '../../constants';
import {
  formatAmount, isApprovalEligible, getApprovalBlockReasons,
  formatAuditTimeline
} from '../../utils/paymentUtils';
import { formatDate } from '../../utils/helpers';



const MATCH_TONES = {
  [MATCH_STATUS.MATCHED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [MATCH_STATUS.MISMATCH]: 'bg-rose-50 text-rose-600 border-rose-200',
  [MATCH_STATUS.PENDING]: 'bg-amber-50 text-amber-700 border-amber-200',
  [MATCH_STATUS.EXCEPTION]: 'bg-slate-100 text-slate-600 border-slate-200'
};

function StatusPill({ label, tone }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${tone || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

function EligibilityCheck({ label, passed, detail }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      {passed
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
      }
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-semibold ${passed ? 'text-slate-700' : 'text-rose-700'}`}>{label}</div>
        {detail && <div className="text-[11px] text-slate-500 mt-0.5">{detail}</div>}
      </div>
    </div>
  );
}

function AuditEntry({ entry }) {
  const time = new Date(entry.timestamp).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
  const actionLabels = {
    created: 'Invoice Created',
    submitted: 'Submitted for Approval',
    approved: 'Approved for Payment',
    rejected: 'Rejected',
    correction_requested: 'Correction Requested',
    resubmitted: 'Resubmitted',
    payment_recorded: 'Payment Recorded',
    match_rerun: 'Match Re-run',
    match_override: 'Match Overridden',
    match_rejected: 'Match Rejected',
    exception_approved: 'Exception Approved'
  };
  return (
    <div className="flex items-start gap-2.5 py-2">
      <div className="mt-0.5 w-1.5 h-1.5 rounded-full bg-[#0B4A3D] shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold text-slate-700">{actionLabels[entry.action] || entry.action}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{entry.actor || 'System'} · {time}</div>
        {entry.details?.note && <div className="text-[11px] text-slate-500 mt-0.5 italic">{entry.details.note}</div>}
        {entry.details?.reason && <div className="text-[11px] text-slate-500 mt-0.5 italic">Reason: {entry.details.reason}</div>}
      </div>
    </div>
  );
}

export default function ApprovalDetailDrawer({ open, invoiceId, onClose, onAction }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [reviewerComment, setReviewerComment] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMode, setActionMode] = useState(null);

  const loadInvoice = useCallback(async () => {
    if (!open || !invoiceId) { setRecord(null); setLoading(false); return; }
    setRejectReason('');
    setCorrectionReason('');
    setReviewerComment('');
    setActionMode(null);
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

  const eligible = record ? isApprovalEligible(record) : false;
  const blockReasons = record ? getApprovalBlockReasons(record) : [];
  const matchReasons = record?.matchReasons || [];
  const matchDetails = record?.matchDetails || [];
  const auditEntries = record ? formatAuditTimeline(record.auditHistory) : [];
  const previousApprovals = auditEntries.filter((e) =>
    ['approved', 'rejected', 'correction_requested'].includes(e.action)
  );

  const handleApprove = async () => {
    setActionBusy(true);
    try {
      await onAction?.('approve', record, { note: reviewerComment.trim() || undefined });
    } finally {
      setActionBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    setActionBusy(true);
    try {
      await onAction?.('reject', record, { reason: rejectReason.trim() });
    } finally {
      setActionBusy(false);
    }
  };

  const handleCorrection = async () => {
    if (!correctionReason.trim()) return;
    setActionBusy(true);
    try {
      await onAction?.('correct', record, { reason: correctionReason.trim() });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <aside
        className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col overflow-hidden animate-[slideInRight_0.2s_ease-out]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Payment approval review"
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
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Review Workspace</span>
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
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
              {/* Status Badges */}
              <div className="flex flex-wrap gap-2">
                <PurchaseStatusBadge status={record.status} />
                <StatusPill
                  label={record.matchStatus || 'Pending Match'}
                  tone={MATCH_TONES[record.matchStatus] || MATCH_TONES[MATCH_STATUS.PENDING]}
                />
                {eligible && (
                  <StatusPill label="Eligible for Approval" tone="bg-emerald-50 text-emerald-700 border-emerald-200" />
                )}
                {!eligible && blockReasons.length > 0 && (
                  <StatusPill label="Not Eligible" tone="bg-rose-50 text-rose-600 border-rose-200" />
                )}
                {record.correctionRequested && (
                  <StatusPill label="Correction Requested" tone="bg-amber-50 text-amber-700 border-amber-200" />
                )}
              </div>

              {/* Blocking Reasons */}
              {!eligible && blockReasons.length > 0 && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
                  <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wide mb-2">
                    Blocked — Cannot Approve
                  </div>
                  <div className="space-y-1">
                    {blockReasons.map((reason, i) => (
                      <p key={i} className="text-[11px] font-semibold text-rose-600 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {reason}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {/* Correction Requested */}
              {record.correctionRequested && record.correctionReason && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wide mb-1">Correction Requested</div>
                  <p className="text-[11px] font-semibold text-amber-800">{record.correctionReason}</p>
                </div>
              )}

              {/* SECTION A: Eligibility Checklist */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Eligibility Checklist</div>
                <div className="divide-y divide-slate-50">
                  <EligibilityCheck
                    label="Three-Way Match"
                    passed={record.matchStatus === MATCH_STATUS.MATCHED}
                    detail={record.matchStatus === MATCH_STATUS.MATCHED ? 'Matched' : `Status: ${record.matchStatus || 'Pending Match'}`}
                  />
                  <EligibilityCheck
                    label="Invoice Status"
                    passed={record.status === INVOICE_STATUS.SUBMITTED}
                    detail={`Status: ${record.status}`}
                  />
                  <EligibilityCheck
                    label="Vendor Match"
                    passed={record.vendorMatched !== false}
                    detail={record.vendorMatched !== false ? 'Vendor matches PO' : 'Vendor does not match PO'}
                  />
                  <EligibilityCheck
                    label="Due Date"
                    passed={true}
                    detail={record.dueDate ? `Due: ${formatDate(record.dueDate)}` : 'No due date set'}
                  />
                  <EligibilityCheck
                    label="Correction Status"
                    passed={!record.correctionRequested}
                    detail={record.correctionRequested ? 'Correction pending — vendor must resubmit' : 'No correction pending'}
                  />
                </div>
              </div>

              {/* SECTION B: Three-Way Comparison */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Three-Way Comparison</div>
                  <StatusPill
                    label={record.matchStatus || 'Pending Match'}
                    tone={MATCH_TONES[record.matchStatus] || MATCH_TONES[MATCH_STATUS.PENDING]}
                  />
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Purchase Order</div>
                    <div className="text-xs font-bold text-slate-800 mt-1">{record.poNo || '—'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Goods Receipt</div>
                    <div className="text-xs font-bold text-slate-800 mt-1">{record.grnNo || 'Posted'}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Invoice</div>
                    <div className="text-xs font-bold text-slate-800 mt-1">{record.invoiceNo}</div>
                  </div>
                </div>

                {/* Line-Level Comparison */}
                {matchDetails.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left font-bold text-slate-500 py-2 pr-2">Product</th>
                          <th className="text-right font-bold text-slate-500 py-2 px-2">PO Qty</th>
                          <th className="text-right font-bold text-slate-500 py-2 px-2">GRN Qty</th>
                          <th className="text-right font-bold text-slate-500 py-2 px-2">Inv Qty</th>
                          <th className="text-right font-bold text-slate-500 py-2 px-2">PO Rate</th>
                          <th className="text-right font-bold text-slate-500 py-2 px-2">Inv Rate</th>
                          <th className="text-center font-bold text-slate-500 py-2 pl-2">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {matchDetails.map((d, i) => {
                          const qtyVar = (d.invoiceQty || 0) - (d.poQty || 0);
                          const rateVar = (d.invoiceRate || 0) - (d.poRate || 0);
                          const hasVariance = qtyVar !== 0 || rateVar !== 0;
                          return (
                            <tr key={i} className={`border-b border-slate-50 ${hasVariance ? 'bg-amber-50/50' : ''}`}>
                              <td className="py-2 pr-2 font-semibold text-slate-700">{d.product}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-600">{d.poQty || '—'}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-600">{d.grnQty || '—'}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-bold">{d.invoiceQty || '—'}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-600">{d.poRate ? `₹${d.poRate}` : '—'}</td>
                              <td className="py-2 px-2 text-right tabular-nums text-slate-700 font-bold">{d.invoiceRate ? `₹${d.invoiceRate}` : '—'}</td>
                              <td className="py-2 pl-2 text-center">
                                {d.matched
                                  ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
                                  : <XCircle className="w-3.5 h-3.5 text-rose-500 inline" />
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 text-center py-4">No line-level comparison data available</p>
                )}

                {/* Variance Summary */}
                {matchReasons.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                    {matchReasons.map((reason, i) => (
                      <p key={i} className="text-[11px] font-semibold text-rose-600 flex items-start gap-1.5">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        {reason}
                      </p>
                    ))}
                  </div>
                )}

                {record.matchStatus === MATCH_STATUS.MATCHED && (
                  <p className="mt-3 pt-3 border-t border-slate-100 text-[11px] font-semibold text-emerald-600 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                    All quantities and prices match — eligible for approval
                  </p>
                )}
              </div>

              {/* Amount */}
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">Invoice Amount</div>
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

              {/* SECTION C: Approval History */}
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

              {/* Full Audit Timeline */}
              {auditEntries.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <History className="w-3 h-3" /> Full Audit Timeline ({auditEntries.length})
                  </div>
                  <div className="divide-y divide-slate-100 max-h-[200px] overflow-y-auto">
                    {[...auditEntries].reverse().map((entry, i) => (
                      <AuditEntry key={i} entry={entry} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer — Reviewer Comments + Decision Actions */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 space-y-3">
          {/* SECTION D: Reviewer Comments */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1">Reviewer Comments</label>
            <TextArea
              value={reviewerComment}
              onChange={(e) => setReviewerComment(e.target.value)}
              placeholder="Optional comments for the audit trail..."
              rows={2}
            />
          </div>

          {/* Reject reason (shown when in reject mode) */}
          {actionMode === 'reject' && (
            <div>
              <label className="block text-[11px] font-bold text-rose-500 uppercase tracking-wide mb-1">Rejection Reason *</label>
              <TextArea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Enter reason for rejection..."
                rows={2}
              />
            </div>
          )}

          {/* Correction reason (shown when in correct mode) */}
          {actionMode === 'correct' && (
            <div>
              <label className="block text-[11px] font-bold text-amber-600 uppercase tracking-wide mb-1">Correction Reason *</label>
              <TextArea
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Describe the correction needed..."
                rows={2}
              />
            </div>
          )}

          {/* SECTION E: Decision Actions */}
          <div className="flex items-center gap-2">
            {/* Approve — only when eligible and not in reject/correct mode */}
            {eligible && actionMode !== 'reject' && actionMode !== 'correct' && (
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionBusy}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-lg bg-[#0B4A3D] text-white hover:bg-[#083D34] transition-colors cursor-pointer disabled:opacity-50"
              >
                {actionBusy ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve for Payment
              </button>
            )}

            {/* Reject — when eligible or in reject confirmation mode */}
            {(eligible || actionMode === 'reject') && actionMode !== 'correct' && (
              <button
                type="button"
                onClick={() => {
                  if (actionMode === 'reject') {
                    handleReject();
                  } else {
                    setActionMode('reject');
                  }
                }}
                disabled={actionBusy || (actionMode === 'reject' && !rejectReason.trim())}
                className="flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-lg border border-rose-300 text-rose-600 bg-white hover:bg-rose-50 transition-colors cursor-pointer disabled:opacity-40"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {actionMode === 'reject' ? 'Confirm Reject' : 'Reject'}
              </button>
            )}

            {/* Request Correction — when eligible or in correct confirmation mode */}
            {(eligible || actionMode === 'correct') && actionMode !== 'reject' && (
              <button
                type="button"
                onClick={() => {
                  if (actionMode === 'correct') {
                    handleCorrection();
                  } else {
                    setActionMode('correct');
                  }
                }}
                disabled={actionBusy || (actionMode === 'correct' && !correctionReason.trim())}
                className="flex items-center justify-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-lg border border-amber-300 text-amber-700 bg-white hover:bg-amber-50 transition-colors cursor-pointer disabled:opacity-40"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                {actionMode === 'correct' ? 'Confirm Correction' : 'Request Correction'}
              </button>
            )}

            {/* Cancel (when in reason mode) */}
            {actionMode && (
              <button
                type="button"
                onClick={() => { setActionMode(null); setRejectReason(''); setCorrectionReason(''); }}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 px-3 py-2.5 cursor-pointer"
              >
                Cancel
              </button>
            )}

            {/* Not eligible — show Close only */}
            {!eligible && !actionMode && (
              <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">Close</button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
