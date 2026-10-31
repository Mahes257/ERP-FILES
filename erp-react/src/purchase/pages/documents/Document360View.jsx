/**
 * purchase/pages/documents/Document360View.jsx
 * ------------------------------------------------------------------
 * Document 360° view — one page for every major Purchase document
 * (PR, RFQ, Quotation, PO, GRN, Inventory, Invoice, Payment).
 *
 * Route: /purchase/<module>/:id/360  (see purchaseRoutes.jsx)
 *
 * Sections (tabs):
 *   Overview · Items · Financials · Workflow · Timeline ·
 *   Related Documents · Approvals · Attachments · Comments ·
 *   Audit History · Versions · Exceptions
 *
 * Every relationship shown comes from the real stores via the
 * document360Service — links carry real ids and always navigate.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BadgeCheck, Banknote, Boxes, CheckCircle2,
  ClipboardList, FileSearch, FileText, GitBranch, History, IndianRupee,
  LayoutDashboard, Link2, ListChecks, Loader2, Mail, MessageSquare,
  PackageCheck, Paperclip, Receipt, ShieldCheck, Workflow
} from 'lucide-react';
import Tabs from '../../components/ui/Tabs';
import AttachmentList from '../../components/AttachmentList';
import SourceDocumentsDrawer from '../../components/SourceDocumentsDrawer';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import { document360Service, DOC360_CHAIN } from '../../services/document360';
import { formatAmount } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* Type → header icon. */
const TYPE_ICONS = {
  pr: ClipboardList,
  rfq: Mail,
  quotation: FileText,
  po: FileText,
  grn: PackageCheck,
  inventory: Boxes,
  invoice: Receipt,
  payment: Banknote
};

/* Severity → pill tone for exceptions. */
const EXCEPTION_TONES = {
  error: 'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200'
};
const EXCEPTION_ICONS = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: FileSearch
};

function DetailItem({ label, value }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className={`${VALUE} mt-1 break-words`}>{value || '—'}</div>
    </div>
  );
}

function EmptyNote({ children }) {
  return (
    <p className="text-xs text-slate-400 py-6 text-center">
      {children || 'Nothing recorded yet.'}
    </p>
  );
}

/* ────────────────────────────────────────────────────────────────
 * DocLink — a working, real-id link to any related document.
 * ──────────────────────────────────────────────────────────────── */
function DocLink({ to, children, className = '' }) {
  const navigate = useNavigate();
  if (!to) return <span className="text-xs font-bold text-slate-700">{children}</span>;
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className={`text-xs font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap ${className}`}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────
 * ChainBar — PR → RFQ → Quotation → PO → Shipment → GRN →
 * Inspection → Inventory → Invoice → Payment with working links.
 * ──────────────────────────────────────────────────────────────── */
function ChainBar({ type, related }) {
  const navigate = useNavigate();
  const stageLabels = {
    pr: 'PR', rfq: 'RFQ', quotation: 'Quotation', po: 'PO',
    shipment: 'Shipment', grn: 'GRN', inspection: 'Inspection',
    inventory: 'Inventory', invoice: 'Invoice', payment: 'Payment'
  };

  const byStage = useMemo(() => {
    const map = {};
    (related || []).forEach((group) => {
      map[group.stage] = group.docs;
    });
    return map;
  }, [related]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
          Document Chain
        </span>
        <span className="text-[10px] text-slate-400">
          Real links — PR → RFQ → Quotation → PO → Shipment → GRN → Inspection → Inventory → Invoice → Payment
        </span>
      </div>
      <div className="flex items-center gap-0 overflow-x-auto pb-1 no-scrollbar">
        {DOC360_CHAIN.map((stage, idx) => {
          const docs = byStage[stage] || [];
          const isCurrent = stage === type;
          const hasDocs = docs.length > 0;
          const number = docs[0]?.number || (isCurrent ? '' : '');
          return (
            <div key={stage} className="flex items-center flex-shrink-0">
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${
                  isCurrent
                    ? 'bg-[#0B4A3D] text-white border-[#0B4A3D] shadow-sm'
                    : hasDocs
                      ? 'bg-[#EDF7F4] text-[#0B4A3D] border-[#0B4A3D]/20 hover:bg-[#0B4A3D] hover:text-white cursor-pointer'
                      : 'bg-slate-50 text-slate-400 border-slate-100'
                }`}
                onClick={
                  hasDocs && !isCurrent
                    ? () => navigate(docs[0].route)
                    : undefined
                }
                title={hasDocs ? docs.map((d) => d.number).join(', ') : `No linked ${stageLabels[stage]}`}
              >
                {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                {hasDocs && !isCurrent && <CheckCircle2 className="w-3 h-3" />}
                {stageLabels[stage]}
                {hasDocs && (
                  <span className={`text-[9px] font-extrabold tabular-nums ${isCurrent ? 'text-white/80' : 'text-[#0B4A3D]/70'}`}>
                    {docs.length}
                  </span>
                )}
              </div>
              {idx < DOC360_CHAIN.length - 1 && (
                <ArrowRight
                  className={`w-3.5 h-3.5 mx-0.5 ${isCurrent ? 'text-[#0B4A3D]/40' : 'text-slate-200'}`}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Tab panels
 * ──────────────────────────────────────────────────────────────── */

function OverviewPanel({ data }) {
  const notes = [];
  if (data.record.notes) notes.push({ title: 'Notes', text: data.record.notes });
  if (data.record.internalNotes) notes.push({ title: 'Internal Notes', text: data.record.internalNotes });
  if (data.record.approvalNote) notes.push({ title: 'Approval Note', text: data.record.approvalNote });

  return (
    <div className="space-y-5">
      <PurchaseSectionCard
        title={`${data.meta.label} Details`}
        subtitle={data.subtitle}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {data.overview.map((item) => (
            <DetailItem key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </PurchaseSectionCard>

      {notes.length > 0 && (
        <PurchaseSectionCard title="Notes" subtitle="Approval note, vendor notes and internal instructions">
          <div className="space-y-3">
            {notes.map((note) => (
              <div key={note.title} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className={LABEL}>{note.title}</div>
                <p className="text-xs font-semibold text-slate-700 mt-1">{note.text}</p>
              </div>
            ))}
          </div>
        </PurchaseSectionCard>
      )}

      {(data.attachments.length > 0 || data.repoDocuments.length > 0) && (
        <PurchaseSectionCard
          title="Attachments"
          subtitle={`${data.attachments.length + data.repoDocuments.length} supporting document(s)`}
          icon={Paperclip}
        >
          <AttachmentList
            attachments={data.attachments}
            fallbackDate={data.record.createdAt}
            limit={3}
            onViewAll={() => document.getElementById('d360-tab-attachments')?.scrollIntoView({ behavior: 'smooth' })}
          />
        </PurchaseSectionCard>
      )}
    </div>
  );
}

function ItemsPanel({ data }) {
  const items = data.items;
  return (
    <PurchaseSectionCard
      title="Line Items"
      subtitle={`${items.length} item(s)`}
    >
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">#</th>
                <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">HSN</th>
                <th className="text-left py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">UOM</th>
                <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                {items[0]?.rate != null && (
                  <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Rate</th>
                )}
                {items[0]?.gstRate != null && (
                  <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">GST</th>
                )}
                {items[0]?.received != null && (
                  <>
                    <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Received</th>
                    <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Pending</th>
                  </>
                )}
                {items[0]?.amount != null && (
                  <th className="text-right py-2 px-3 font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                )}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-2 px-3 font-semibold text-slate-600">{idx + 1}</td>
                  <td className="py-2 px-3 font-semibold text-slate-800">{item.product || '—'}</td>
                  <td className="py-2 px-3 text-slate-500">{item.hsn || '—'}</td>
                  <td className="py-2 px-3 text-slate-500">{item.uom || '—'}</td>
                  <td className="py-2 px-3 text-right tabular-nums">{item.qty ?? '—'}</td>
                  {items[0]?.rate != null && (
                    <td className="py-2 px-3 text-right tabular-nums">
                      {item.rate != null ? formatAmount(item.rate, data.currency) : '—'}
                    </td>
                  )}
                  {items[0]?.gstRate != null && (
                    <td className="py-2 px-3 text-right tabular-nums">{item.gstRate != null ? `${item.gstRate}%` : '—'}</td>
                  )}
                  {items[0]?.received != null && (
                    <>
                      <td className="py-2 px-3 text-right tabular-nums">{item.received ?? '—'}</td>
                      <td className={`py-2 px-3 text-right tabular-nums font-semibold ${item.pending > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        {item.pending ?? '—'}
                      </td>
                    </>
                  )}
                  {items[0]?.amount != null && (
                    <td className="py-2 px-3 text-right font-bold tabular-nums">
                      {item.amount != null ? formatAmount(item.amount, data.currency) : '—'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyNote>No line items recorded for this document.</EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

function FinancialsPanel({ data }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {data.financials.map((row) => (
        <div
          key={row.label}
          className={`rounded-xl border px-4 py-3.5 ${
            row.tone === 'total'
              ? 'border-[#0B4A3D]/20 bg-[#EDF7F4]'
              : row.tone === 'ok'
                ? 'border-emerald-100 bg-emerald-50/40'
                : row.tone === 'warn'
                  ? 'border-amber-100 bg-amber-50/40'
                  : 'border-slate-200 bg-white'
          }`}
        >
          <div className={LABEL}>{row.label}</div>
          <div
            className={`text-lg font-extrabold mt-1 tabular-nums ${
              row.tone === 'total' ? 'text-[#0B4A3D]' : row.tone === 'ok' ? 'text-emerald-700' : row.tone === 'warn' ? 'text-amber-700' : 'text-slate-800'
            }`}
          >
            {typeof row.value === 'number' ? formatAmount(row.value, data.currency) : row.value || '—'}
          </div>
        </div>
      ))}
    </div>
  );
}

function WorkflowPanel({ data }) {
  return (
    <PurchaseSectionCard
      title="Workflow"
      subtitle={`${data.activity.length} workflow event(s) recorded`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className={LABEL}>Current Status</span>
        <PurchaseStatusBadge status={data.status} />
      </div>
      <PurchaseApprovalTimeline activity={data.activity} emptyLabel="No workflow activity recorded yet." />
    </PurchaseSectionCard>
  );
}

function TimelinePanel({ data }) {
  /* Timeline = workflow activity + linked-document creation events,
     merged and sorted chronologically. */
  const events = useMemo(() => {
    const list = (data.activity || []).map((a) => ({
      timestamp: a.timestamp || '',
      label: a.label || a.type || '',
      actor: a.actor || '',
      note: a.note || ''
    }));
    (data.related || []).forEach((group) => {
      (group.docs || []).forEach((doc) => {
        if (doc.date) {
          list.push({
            timestamp: doc.date,
            label: `Linked ${doc.label} ${doc.number}`,
            actor: doc.vendor || '',
            note: doc.status ? `Status: ${doc.status}` : ''
          });
        }
      });
    });
    return list
      .filter((e) => e.timestamp)
      .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
  }, [data]);

  return (
    <PurchaseSectionCard title="Timeline" subtitle="Chronological record of this document and its chain">
      {events.length > 0 ? (
        <div className="prm-timeline">
          {events.map((event, index) => (
            <div key={index} className="prm-timeline-item">
              <span className="prm-timeline-node">
                <span className="prm-timeline-avatar" aria-hidden="true">
                  {String(event.actor || 'S').charAt(0).toUpperCase()}
                </span>
                <span className="prm-timeline-dot blue">
                  <History style={{ width: 8, height: 8 }} />
                </span>
              </span>
              <div className="prm-timeline-date">
                {event.actor ? `${event.actor} · ` : ''}{formatDateTime(event.timestamp)}
              </div>
              <p className="prm-timeline-title">{event.label}</p>
              {event.note && <p className="prm-timeline-desc">{event.note}</p>}
            </div>
          ))}
        </div>
      ) : (
        <EmptyNote>No timeline events recorded yet.</EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

function RelatedDocumentsPanel({ data }) {
  const navigate = useNavigate();
  const stageLabels = {
    pr: 'Purchase Requisition', rfq: 'RFQ', quotation: 'Vendor Quotation', po: 'Purchase Order',
    shipment: 'Shipment', grn: 'Goods Receipt', inspection: 'Quality Inspection',
    inventory: 'Inventory Movement', invoice: 'Purchase Invoice', payment: 'Payment',
    extra: 'Supporting Documents'
  };

  if (data.related.length === 0) {
    return (
      <PurchaseSectionCard title="Related Documents" subtitle="Documents linked by real references">
        <EmptyNote>No related documents found — this document is not yet linked to the procurement chain.</EmptyNote>
      </PurchaseSectionCard>
    );
  }

  return (
    <div className="space-y-5">
      {data.related.map((group) => (
        <PurchaseSectionCard
          key={group.stage}
          title={stageLabels[group.stage] || group.stage}
          subtitle={`${group.docs.length} linked document(s) — real id navigation`}
          icon={Link2}
        >
          <div className="space-y-2">
            {group.docs.map((doc) => (
              <div
                key={`${doc.type}-${doc.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{doc.short}</span>
                    <DocLink to={doc.route}>{doc.number}</DocLink>
                    {doc.status && <PurchaseStatusBadge status={doc.status} variant="cpr" className="!text-[10px]" />}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-1 flex-wrap">
                    {doc.vendor && <span>{doc.vendor}</span>}
                    {doc.date && <span>{formatDate(doc.date)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => navigate(doc.route)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-[#0B4A3D] border border-[#0B4A3D]/20 bg-white hover:bg-[#EDF7F4] px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                  >
                    <FileText className="w-3 h-3" /> Open
                  </button>
                  {doc.route360 && (
                    <button
                      type="button"
                      onClick={() => navigate(doc.route360)}
                      className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      <LayoutDashboard className="w-3 h-3" /> 360°
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </PurchaseSectionCard>
      ))}
    </div>
  );
}

function ApprovalsPanel({ data }) {
  const approvals = data.approvals;
  return (
    <PurchaseSectionCard
      title="Approvals"
      subtitle={`${approvals.length} approval step(s)`}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className={LABEL}>Approval Status</span>
        <PurchaseStatusBadge status={data.record.approvalStatus || data.status} />
      </div>
      {approvals.length > 0 ? (
        <div className="space-y-3">
          {approvals.map((step, index) => (
            <div
              key={index}
              className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3"
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                  String(step.status).toLowerCase().includes('approv')
                    ? 'bg-emerald-100 text-emerald-700'
                    : String(step.status).toLowerCase().includes('reject')
                      ? 'bg-rose-100 text-rose-700'
                      : String(step.status).toLowerCase().includes('pend')
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-600'
                }`}
              >
                {step.step}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-800">{step.role}</span>
                  <PurchaseStatusBadge status={step.status} variant="cpr" className="!text-[10px]" />
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {step.approver && <span>{step.approver} · </span>}
                  {step.decidedAt ? formatDateTime(step.decidedAt) : 'Not decided yet'}
                </div>
                {step.note && <p className="text-[11px] text-slate-500 mt-0.5 italic">{step.note}</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyNote>No approval steps recorded for this document type.</EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

function AttachmentsPanel({ data }) {
  const hasStage = ['pr', 'rfq', 'quotation', 'po', 'grn', 'invoice'].includes(data.type);
  const total = data.attachments.length + data.repoDocuments.length;
  return (
    <div className="space-y-5">
      <PurchaseSectionCard
        title="Attachments"
        subtitle={`${total} supporting document(s)`}
        icon={Paperclip}
      >
        {data.attachments.length > 0 ? (
          <AttachmentList attachments={data.attachments} fallbackDate={data.record.createdAt} />
        ) : (
          <EmptyNote>No attachments uploaded to this document yet.</EmptyNote>
        )}
      </PurchaseSectionCard>

      {hasStage && (
        <PurchaseSectionCard
          title="Repository Documents"
          subtitle="Linked documents from the central repository"
          icon={FileText}
        >
          <SourceDocumentsDrawer
            sourceId={data.id}
            stage={data.meta.stage}
            label={`${data.meta.short} Documents`}
          />
        </PurchaseSectionCard>
      )}

      {data.repoDocuments.length > 0 && (
        <PurchaseSectionCard
          title="Referenced Documents"
          subtitle="Repository documents referencing this number"
          icon={Link2}
        >
          <div className="space-y-2">
            {data.repoDocuments.map((doc) => (
              <div key={doc.docId} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2.5">
                <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-700 truncate">{doc.name}</p>
                  <p className="text-[10px] text-slate-400">{doc.docType} · v{doc.version || 1}</p>
                </div>
              </div>
            ))}
          </div>
        </PurchaseSectionCard>
      )}
    </div>
  );
}

function CommentsPanel({ data }) {
  const comments = data.comments;
  return (
    <PurchaseSectionCard
      title="Comments"
      subtitle={`${comments.length} comment(s)`}
    >
      {comments.length > 0 ? (
        <ul className="prv-chat-list">
          {comments.map((comment) => (
            <li key={comment.id || `${comment.author}-${comment.createdAt}`} className="prv-chat-item">
              <span className="prv-chat-avatar" aria-hidden="true">
                {String(comment.author || '?').charAt(0).toUpperCase()}
              </span>
              <div className="prv-chat-bubble">
                <div className="prv-chat-meta">
                  <span className="prv-chat-author">{comment.author || '—'}</span>
                  <span className="prv-chat-time">{formatDateTime(comment.createdAt)}</span>
                </div>
                <p className="prv-chat-text">{comment.text}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyNote>
          <span className="flex flex-col items-center gap-2">
            <MessageSquare className="w-6 h-6 text-slate-200" />
            No comments on this document yet.
          </span>
        </EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

function AuditHistoryPanel({ data }) {
  const entries = data.audit || [];
  return (
    <PurchaseSectionCard
      title="Audit History"
      subtitle={`${entries.length} audit entrie(s) — every action ever recorded`}
      icon={ShieldCheck}
    >
      {entries.length > 0 ? (
        <div className="divide-y divide-slate-100 max-h-[60vh] overflow-y-auto">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2.5 py-3">
              <div className="mt-1 w-1.5 h-1.5 rounded-full bg-[#0B4A3D] shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-slate-700">{entry.action}</div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {entry.actor || 'System'} · {formatDateTime(entry.timestamp)}
                </div>
                {entry.details && <div className="text-[11px] text-slate-500 mt-0.5 italic">{entry.details}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <EmptyNote>No audit entries recorded for this document.</EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

function VersionsPanel({ data }) {
  const versions = data.versions || [];
  return (
    <PurchaseSectionCard
      title="Versions"
      subtitle={`${versions.length} version(s)`}
      icon={GitBranch}
    >
      {versions.length > 0 ? (
        <div className="space-y-3">
          {versions.map((version) => (
            <div
              key={version.versionId}
              className={`rounded-lg border px-4 py-3 ${version.isCurrent ? 'border-[#0B4A3D]/25 bg-[#EDF7F4]/60' : 'border-slate-200 bg-slate-50/50'}`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-extrabold text-slate-800">v{version.version}</span>
                <PurchaseStatusBadge status={version.status || 'Generated'} variant="cpr" className="!text-[10px]" />
                {version.isCurrent && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-[#0B4A3D] text-white">
                    CURRENT
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                {version.createdBy || 'System'} · {formatDateTime(version.createdAt)}
              </div>
              {(version.changeReason || version.description) && (
                <p className="text-[11px] text-slate-500 mt-1 italic">
                  {version.changeReason || version.description}
                </p>
              )}
              {version.fileSizeLabel && (
                <p className="text-[10px] text-slate-400 mt-1">{version.fileSizeLabel}</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyNote>No version history yet — versions are created when this document is generated, printed or replaced.</EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

function ExceptionsPanel({ data }) {
  const exceptions = data.exceptions || [];
  return (
    <PurchaseSectionCard
      title="Exceptions"
      subtitle={`${exceptions.length} exception(s) / flag(s)`}
      icon={AlertTriangle}
    >
      {exceptions.length > 0 ? (
        <div className="space-y-3">
          {exceptions.map((ex, index) => {
            const Icon = EXCEPTION_ICONS[ex.severity] || AlertTriangle;
            return (
              <div key={index} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-4 py-3">
                <span className={`p-1.5 rounded-lg border ${EXCEPTION_TONES[ex.severity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-800">{ex.title}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${EXCEPTION_TONES[ex.severity] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                      {ex.severity}
                    </span>
                  </div>
                  {ex.detail && <p className="text-[11px] text-slate-500 mt-1">{ex.detail}</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyNote>
          <span className="flex flex-col items-center gap-2">
            <BadgeCheck className="w-6 h-6 text-emerald-300" />
            No exceptions recorded — this document is clear.
          </span>
        </EmptyNote>
      )}
    </PurchaseSectionCard>
  );
}

/* ────────────────────────────────────────────────────────────────
 * Main view
 * ──────────────────────────────────────────────────────────────── */
export default function Document360View({ type: typeProp }) {
  const navigate = useNavigate();
  const params = useParams();
  /* Type comes from the route's prop (e.g. <Document360View type="pr" />);
     the URL only carries the document id. */
  const type = typeProp || params.type;
  const id = params.id || params.grnNo || params.inventoryId || params.paymentId;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const payload = await document360Service.getDocument360(type, id);
        if (cancelled) return;
        setData(payload);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [type, id]);

  const tabs = useMemo(() => {
    if (!data) return [];
    const count = (items) => (items && items.length) || 0;
    return [
      { key: 'overview', label: 'Overview', icon: LayoutDashboard },
      { key: 'items', label: 'Items', icon: ListChecks, count: data.items.length },
      { key: 'financials', label: 'Financials', icon: IndianRupee, count: data.financials.length },
      { key: 'workflow', label: 'Workflow', icon: Workflow, count: data.activity.length },
      { key: 'timeline', label: 'Timeline', icon: History },
      { key: 'related', label: 'Related Documents', icon: Link2, count: count(data.related) },
      { key: 'approvals', label: 'Approvals', icon: BadgeCheck, count: data.approvals.length },
      { key: 'attachments', label: 'Attachments', icon: Paperclip, count: data.attachments.length + count(data.repoDocuments) },
      { key: 'comments', label: 'Comments', icon: MessageSquare, count: data.comments.length },
      { key: 'audit', label: 'Audit History', icon: ShieldCheck, count: data.audit.length },
      { key: 'versions', label: 'Versions', icon: GitBranch, count: data.versions.length },
      { key: 'exceptions', label: 'Exceptions', icon: AlertTriangle, count: count(data.exceptions) }
    ];
  }, [data]);

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !data) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <FileSearch className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Document not found</p>
          <p className="text-xs text-slate-400 mt-1">The 360° view could not resolve this document — it may have been deleted.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/dashboard')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Dashboard
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const HeaderIcon = TYPE_ICONS[data.type] || FileText;

  const kpis = [
    { label: 'Status', value: <PurchaseStatusBadge status={data.status} /> },
    { label: 'Vendor', value: data.vendor || '—' },
    { label: 'Value', value: data.amount > 0 ? formatAmount(data.amount, data.currency) : '—' },
    { label: 'Date', value: data.date ? formatDate(data.date) : '—' }
  ];

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: data.meta.label, to: data.listRoute },
          { label: data.docNo }
        ]}
        icon={HeaderIcon}
        title={
          <span className="flex items-center gap-3">
            {data.docNo}
            <PurchaseStatusBadge status={data.status} />
          </span>
        }
        subtitle={`${data.meta.label} · 360° view`}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(data.listRoute)}
              className="btn btn-ghost btn-sm"
            >
              Back to {data.meta.short}
            </button>
            <button
              type="button"
              onClick={() => navigate(data.sourceRoute)}
              className="btn btn-ghost btn-sm"
            >
              <FileText size={12} /> Open Document
            </button>
          </>
        }
      />

      {/* Top KPI row */}
      <div className="purchase-summary-grid mb-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="purchase-summary-card prv-kpi-card">
            <div className="prv-kpi-body">
              <div className="purchase-summary-value prv-kpi-value" title={typeof kpi.value === 'string' ? kpi.value : undefined}>
                {kpi.value}
              </div>
              <div className="purchase-summary-label prv-kpi-label">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Working document chain */}
      <ChainBar type={data.type} related={data.related} />

      {/* Tabs */}
      <div className="po-tabs-row overflow-x-auto no-scrollbar">
        <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
      </div>

      <div className="mt-5">
        {activeTab === 'overview' && <OverviewPanel data={data} />}
        {activeTab === 'items' && <ItemsPanel data={data} />}
        {activeTab === 'financials' && <FinancialsPanel data={data} />}
        {activeTab === 'workflow' && <WorkflowPanel data={data} />}
        {activeTab === 'timeline' && <TimelinePanel data={data} />}
        {activeTab === 'related' && <RelatedDocumentsPanel data={data} />}
        {activeTab === 'approvals' && <ApprovalsPanel data={data} />}
        {activeTab === 'attachments' && <AttachmentsPanel data={data} />}
        {activeTab === 'comments' && <CommentsPanel data={data} />}
        {activeTab === 'audit' && <AuditHistoryPanel data={data} />}
        {activeTab === 'versions' && <VersionsPanel data={data} />}
        {activeTab === 'exceptions' && <ExceptionsPanel data={data} />}
      </div>
    </PurchasePageLayout>
  );
}