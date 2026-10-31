/**
 * salesViewShared.jsx — the shared building blocks of a Sales Execution VIEW page.
 * ------------------------------------------------------------------
 * These were defined inside SalesViewPage.jsx and are used verbatim by every
 * sales detail surface. They live here so the Customer Purchase Order view and
 * the E-Action view render IDENTICAL rows, cards, summary tiles, timeline,
 * activity log and empty states — one implementation, no visual drift.
 *
 * Presentation only: no module fields, no fetching.
 */
import { ArrowRight, Check, ClipboardList, Clock } from 'lucide-react';
import { formatDateTime } from '../../utils/leadHelpers';
import { cpoText } from '../../utils/salesHelpers';

/**
 * Version-comparison tints. Deliberately pale: a 2px left rule plus a light
 * wash, in the same amber/emerald/rose palette the edit-history surfaces use.
 * Only ever applied while a specific version is being compared — a normal
 * document view passes no `change`, so nothing is highlighted there.
 */
const CHANGE_TINT = {
  added: 'bg-emerald-50/70 border-l-2 border-emerald-300 pl-2 -ml-2',
  modified: 'bg-amber-50/70 border-l-2 border-amber-300 pl-2 -ml-2',
  removed: 'bg-rose-50/70 border-l-2 border-rose-300 pl-2 -ml-2'
};

/** Tint class for a change, or '' for an unchanged (normal) row. */
export function changeTintClass(change) {
  return change ? CHANGE_TINT[change.type] || CHANGE_TINT.modified : '';
}

/**
 * The one-line note under a changed value: what it was, or that it is new/
 * gone. Renders nothing for an unchanged row, so it can be used unconditionally.
 */
export function ChangeHint({ change }) {
  if (!change) return null;
  if (change.type === 'added') {
    return <span className="block text-[10px] font-medium text-emerald-700/80 mt-0.5">Added in this version</span>;
  }
  if (change.type === 'removed') {
    return (
      <span className="block text-[10px] font-medium text-rose-700/80 mt-0.5">
        Removed in this version (was {change.previousValue})
      </span>
    );
  }
  return (
    <span className="block text-[10px] font-medium text-amber-700/80 mt-0.5">
      Previous: {change.previousValue}
    </span>
  );
}

/**
 * Label/value row used inside every view-page card.
 *
 * `change` is optional and only supplied while comparing versions: it tints the
 * row and adds the previous value underneath, so the reader sees WHAT changed
 * without the document being redesigned around it. Unchanged rows are passed no
 * `change` and render exactly as before.
 */
export function Row({ label, children, change }) {
  return (
    <div
      className={`flex py-1.5 text-[13px] border-b border-slate-100 last:border-b-0 ${changeTintClass(change)}`.trim()}
    >
      <span className="w-[130px] shrink-0 text-slate-500 font-medium text-xs">{label}</span>
      <span className="text-slate-700 font-medium flex-1">
        {children}
        <ChangeHint change={change} />
      </span>
    </div>
  );
}

export function CardHeader({ icon: Icon, title, count, action }) {
  const heading = (
    <h3 className="prm-card-title">
      <Icon className="w-4 h-4" />
      {title}
      {count != null && <span className="normal-case font-semibold text-slate-400 text-xs">({count})</span>}
    </h3>
  );
  if (!action) return heading;
  return (
    <div className="flex items-start justify-between gap-3">
      {heading}
      <div className="flex flex-wrap items-center gap-1.5 shrink-0">{action}</div>
    </div>
  );
}

/** Compact card-header action button (matches the ERP's small ghost button). */
export function CardButton({ icon: Icon, label, onClick, disabled, title }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title || label}
      className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border border-slate-200 bg-surface text-[11px] font-bold text-slate-600 hover:bg-slate-50 hover:text-[#0B4A3D] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {Icon && <Icon className="w-3.5 h-3.5" />} {label}
    </button>
  );
}

/** Real-count summary tile for the Overview (no hardcoded numbers). */
export function KpiCard({ icon: Icon, label, value, onClick, linkLabel }) {
  return (
    <div className="prm-card p-3 flex flex-col gap-1 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-7 h-7 rounded-lg bg-[#E8F0EE] text-[#0B4A3D] flex items-center justify-center shrink-0">
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 truncate">{label}</span>
      </div>
      <div className="text-[15px] font-extrabold text-slate-800 leading-tight break-words">{value}</div>
      {onClick && (
        <button
          type="button"
          onClick={onClick}
          className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0B4A3D] hover:underline cursor-pointer self-start"
        >
          {linkLabel || 'View'} <ArrowRight className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

/** Human file size for the Overview attachments card. */
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center py-10">
      <Icon className="w-9 h-9 text-slate-300 mx-auto mb-3" />
      <h4 className="text-[15px] font-bold text-slate-600 mb-1">{title}</h4>
      {subtitle && <p className="text-[13px] text-slate-400">{subtitle}</p>}
    </div>
  );
}

export const TL_DOT_COLORS = {
  created: 'border-[#0B4A3D] bg-[#E8F0EE]',
  completed: 'border-[#059669] bg-[#f0fdf4]',
  approved: 'border-[#059669] bg-[#f0fdf4]',
  submitted: 'border-[#f59e0b] bg-[#fffbeb]',
  rejected: 'border-[#dc2626] bg-[#fee2e2]',
  danger: 'border-[#dc2626] bg-[#fee2e2]',
  default: 'border-[#9ca3af] bg-white'
};

export function TimelineEvent({ event }) {
  return (
    <div className="relative pl-9 pb-4 last:pb-0 group">
      <span className={`absolute left-[3px] top-1 w-3 h-3 rounded-full border-2 ${TL_DOT_COLORS[event.type] || TL_DOT_COLORS.default} group-hover:scale-125 transition-transform`} />
      <div className="text-[13px] font-semibold text-slate-800">{cpoText(event.title)}</div>
      {event.desc && <div className="text-xs text-slate-500 mt-0.5">{cpoText(event.desc)}</div>}
      <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(event.date)}</div>
    </div>
  );
}

export function buildTimelineEvents(doc, no, label) {
  const events = [];
  const createdAt = doc.createdAt || doc.date;
  if (createdAt) {
    events.push({ title: `${label} Created`, desc: `${no || doc.id} was created.`, date: createdAt, type: 'created' });
  }
  if (doc.updatedAt && doc.updatedAt !== createdAt) {
    events.push({ title: `${label} Updated`, desc: 'Document was updated.', date: doc.updatedAt, type: 'edited' });
  }
  if (doc.sentAt) {
    // Never invent an actor: the event carries a real user when the backend has
    // one, otherwise the sentence simply omits the "by <user>" clause.
    const by = doc.sentBy || doc.submittedBy || '';
    events.push({ title: 'Sent to Client', desc: by ? `Sent by ${by}` : 'Sent to the client.', date: doc.sentAt, type: 'submitted' });
  }
  if (doc.approvalDate && String(doc.approvalStatus || '').toLowerCase() === 'approved') {
    const by = doc.approvedBy || '';
    events.push({ title: 'Approved', desc: by ? `Approved by ${by}` : 'Document approved.', date: doc.approvalDate, type: 'approved' });
  }
  if (doc.archivedAt) {
    events.push({ title: 'Archived', desc: 'Document was archived.', date: doc.archivedAt, type: 'archived' });
  }
  return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export function buildActivityEvents(doc, no) {
  const activities = [];
  activities.push({ text: `Document ${no || doc.id} was created.`, date: doc.createdAt || doc.date || new Date().toISOString(), icon: 'plus' });
  if (doc.sentAt) {
    activities.push({ text: 'Document sent to the client.', date: doc.sentAt, icon: 'send' });
  }
  if (Array.isArray(doc.history)) {
    doc.history.forEach((h) => {
      activities.push({
        // Historical rows written before the CPO rename still carry the legacy
        // field label/number; the audit trail is presented, never rewritten.
        text: cpoText(`${h.field}: ${h.oldValue || '—'} → ${h.newValue || '—'}${h.changedBy ? ` by ${h.changedBy}` : ''}`),
        date: h.createdAt,
        icon: 'check'
      });
    });
  }
  return activities.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

export const ACTIVITY_ICONS = {
  plus: Check,
  send: Check,
  check: ClipboardList,
  default: Clock
};
