/**
 * purchase/components/approval/ApprovalDrawer.jsx
 * ------------------------------------------------------------------
 * Right side-panel "View Details" for a requisition. Tabs: Summary,
 * Items, Attachments, History, Comments. Pure frontend — no page
 * navigation. Quick Approve / Reject / Return actions are surfaced
 * for pending requisitions.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import {
  CheckCircle2, FileText, History, MessageSquare, Paperclip, RotateCcw,
  Send, X, XCircle
} from 'lucide-react';
import PurchaseStatusBadge from '../PurchaseStatusBadge';
import ApprovalHistoryTimeline from './ApprovalHistoryTimeline';
import { formatAmountConverted } from '../../utils/purchase';
import { formatDate, formatDateTime, getInitials } from '../../utils/helpers';

const TABS = [
  { key: 'summary', label: 'Summary', icon: FileText },
  { key: 'items', label: 'Items', icon: Paperclip },
  { key: 'attachments', label: 'Attachments', icon: Paperclip },
  { key: 'history', label: 'History', icon: History },
  { key: 'comments', label: 'Comments', icon: MessageSquare }
];

function Row({ label, value }) {
  return (
    <div className="ac-dl ac-drawer-row">
      <dt className="ac-dt">{label}</dt>
      <dd className="ac-dd">{value || '—'}</dd>
    </div>
  );
}

export default function ApprovalDrawer({
  open = false,
  record = null,
  onClose,
  onAddComment,
  addBusy = false,
  onDecision
}) {
  const [tab, setTab] = useState('summary');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState('');

  /* Close on Escape key */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open || !record) return null;

  const items = record.items || [];
  const attachments = record.attachments || [];
  const comments = record.comments || [];
  const history = (record.activity || []).filter((entry) =>
    ['submit', 'review', 'approve', 'reject', 'return', 'po'].includes(entry.type)
  );
  const isPending = record.status === 'Pending Approval';

  const submitComment = () => {
    if (!comment.trim()) {
      setCommentError('Please enter a comment.');
      return;
    }
    setCommentError('');
    onAddComment?.(comment.trim()).then(() => setComment(''));
  };

  return (
    <div className="ac-drawer-overlay" onClick={onClose}>
      <aside className="ac-drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Requisition details">
        <div className="ac-drawer-header">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="ac-detail-pr">{record.prNo}</span>
              <PurchaseStatusBadge status={record.status} />
            </div>
            <p className="ac-drawer-title truncate" title={record.title}>{record.title || '—'}</p>
          </div>
          <button type="button" onClick={onClose} className="ac-icon-btn" aria-label="Close details">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="ac-drawer-tabs">
          {TABS.map((t) => {
            const Icon = t.icon;
            const count =
              t.key === 'items' ? items.length
                : t.key === 'attachments' ? attachments.length
                  : t.key === 'comments' ? comments.length
                    : t.key === 'history' ? history.length
                      : null;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`ac-drawer-tab ${tab === t.key ? 'active' : ''}`}
              >
                {Icon && <Icon className="w-3 h-3" />}
                {t.label}
                {count != null && <span className="ac-drawer-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        <div className="ac-drawer-body">
          {tab === 'summary' && (
            <div className="space-y-4">
              <div className="ac-drawer-block">
                <div className="ac-drawer-block-title">General</div>
                <Row label="Department" value={record.department} />
                <Row label="Requester" value={record.requester} />
                <Row label="Vendor" value={record.vendor} />
                <Row label="Buyer" value={record.buyer} />
                <Row label="Project" value={record.project} />
                <Row label="Priority" value={record.priority} />
                <Row label="Company" value={record.company} />
                <Row label="Branch" value={record.branch} />
                <Row label="Warehouse" value={record.warehouse} />
                <Row label="Required Date" value={formatDate(record.expectedDate)} />
              </div>
              <div className="ac-drawer-block">
                <div className="ac-drawer-block-title">Commercial</div>
                <Row label="Currency" value={record.currency} />
                <Row label="Payment Terms" value={record.terms} />
                <Row label="GST Type" value={record.gstType} />
                <Row label="Cost Center" value={record.costCenter} />
                <Row label="Subtotal" value={formatAmountConverted(record.totals?.subtotal ?? 0, record.currency)} />
                <Row label="Grand Total" value={formatAmountConverted(record.amount ?? 0, record.currency)} />
              </div>
              <div className="ac-drawer-block">
                <div className="ac-drawer-block-title">Workflow</div>
                <Row label="Current Stage" value={record.stage} />
                <Row label="Approval Status" value={record.approvalStatus || '—'} />
                <Row label="Assigned To" value={record.assignedTo} />
                <Row label="Created" value={formatDateTime(record.createdAt)} />
                <Row label="Last Updated" value={record.lastUpdated} />
              </div>
            </div>
          )}

          {tab === 'items' && (
            <div className="ac-mini-table-wrap">
              <table className="ac-mini-table">
                <thead>
                  <tr>
                    <th>Item</th><th className="text-right">Qty</th><th className="text-right">Rate</th>
                    <th className="text-center">GST</th><th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const amount = (Number(item.qty) || 0) * (Number(item.rate) || 0) * (1 - (Number(item.discount) || 0) / 100);
                    return (
                      <tr key={`${item.product}-${index}`}>
                        <td className="font-semibold text-slate-700">{item.product || '—'}</td>
                        <td className="text-right">{item.qty}</td>
                        <td className="text-right">{formatAmountConverted(item.rate, record.currency)}</td>
                        <td className="text-center">{item.gstRate}%</td>
                        <td className="text-right font-bold">{formatAmountConverted(amount, record.currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'attachments' && (
            <div className="space-y-2">
              {attachments.length > 0 ? (
                attachments.map((att, index) => (
                  <div key={att.id || index} className="ac-attachment-row">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700 truncate">{att.name || att}</span>
                  </div>
                ))
              ) : (
                <p className="ac-muted py-6 text-center">No attachments.</p>
              )}
            </div>
          )}

          {tab === 'history' && (
            <ApprovalHistoryTimeline events={history} />
          )}

          {tab === 'comments' && (
            <div className="space-y-3">
              <div className="ac-comment-box">
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment on this requisition..."
                  className="ac-comment-input"
                />
                {commentError && <p className="text-[11px] font-semibold text-rose-500 mt-1">{commentError}</p>}
                <div className="flex justify-end mt-2">
                  <button type="button" className="ac-view-btn" onClick={submitComment} disabled={addBusy}>
                    <Send className="w-3.5 h-3.5" /> {addBusy ? 'Posting…' : 'Post Comment'}
                  </button>
                </div>
              </div>
              <div className="space-y-2.5">
                {comments.length > 0 ? (
                  [...comments].reverse().map((c) => (
                    <div key={c.id} className="ac-comment">
                      <span className="ac-comment-avatar">{getInitials(c.author)}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-slate-700">{c.author || '—'}</span>
                          <span className="text-[10px] text-slate-400">{formatDateTime(c.createdAt)}</span>
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{c.text}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="ac-muted py-4 text-center">No comments yet.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {isPending && (
          <div className="ac-drawer-footer">
            <button type="button" className="ac-drawer-action ghost" onClick={() => onDecision?.('return', record)}>
              <RotateCcw className="w-3.5 h-3.5" /> Return
            </button>
            <button type="button" className="ac-drawer-action danger" onClick={() => onDecision?.('reject', record)}>
              <XCircle className="w-3.5 h-3.5" /> Reject
            </button>
            <button type="button" className="ac-drawer-action approve" onClick={() => onDecision?.('approve', record)}>
              <CheckCircle2 className="w-3.5 h-3.5" /> Approve
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}
