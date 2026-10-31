import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Building2,
  Calculator,
  Calendar,
  Check,
  CheckCircle,
  ClipboardList,
  Clock,
  Copy,
  Eye,
  ExternalLink,
  FileDown,
  FileText,
  GitBranch,
  History,
  Info,
  Layers,
  Link2,
  Mail,
  MessageSquare,
  Network,
  Package,
  Paperclip,
  Pencil,
  Printer,
  RotateCcw,
  Send,
  Share2,
  StickyNote,
  Tag,
  Trash2,
  User,
  X
} from 'lucide-react';
import { ActionMenu, ConfirmDialog, Modal, useToast } from '../../components/Common';
import { detailActionClass } from '../../components/Common/detailActionClasses';
import RevisionHistoryTable from '../../components/EditHistory/RevisionHistoryTable';
import VersionComparison from '../../components/EditHistory/VersionComparison';
import { CprApprovalBadge, CprStatusBadge } from '../../components/CprTable';
import { CprAttachments, CprPreviewModal } from '../../components/CprDetail';
import { formatDate, formatDateTime, formatINR } from '../../utils/leadHelpers';
import cprService from '../../services/cprService';
import { defaultCprItemColumns, emailCpr, normalizeCpr, shareCpr } from '../../utils/cprHelpers';
import useGridColumns from '../../hooks/useGridColumns';
import useVersionComparison from '../../hooks/useVersionComparison';
import { DEFAULT_IGNORED_FIELDS } from '../../utils/versionDiff';
import { buildCprPrintHtml, exportCprDocumentPdf } from '../../utils/cprExportUtils';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';

/**
 * CPR version comparison. Revisions are sibling rows whose prNo gains a `(N)`
 * suffix, so the number is revision plumbing rather than an edited value. The
 * technical-verification / admin-approval / float fields are resolved from
 * other tables on read, so the same saved revision can report different values
 * between two requests and must never surface as an edit.
 */
const CPR_VERSION_IGNORED_FIELDS = new Set([
  ...DEFAULT_IGNORED_FIELDS,
  'prNo',
  'technicalVerificationStatus',
  'technicalVerificationNo',
  'technicalVerificationCount',
  'technicalVerificationCompleted',
  'adminApprovalState',
  'floatDestinationLabel'
]);

/** The CPR detail service, adapted to the comparison hook's `{ get }` shape. */
const CPR_VERSION_SERVICE = { get: (cprId) => cprService.getCpr(cprId) };

/** Open a revision on its own stored snapshot, keeping the reader in history. */
const cprVersionRoute = (revisionId) => `/cprs/${revisionId}?tab=version-history`;

/**
 * Header actions that belong in the ⋯ More menu instead of the front row.
 * The front row is the ERP standard — Back, Edit, Print, PDF plus the
 * status-driven workflow actions (Submit / Approve / Send Back / Reject /
 * Convert). Everything listed here is utility or rare: still fully wired to
 * its existing handler, just one click further in.
 */
const HEADER_OVERFLOW_KEYS = [
  'duplicate',
  'costWorkout',
  'openQuotation',
  'preview',
  'share',
  'email',
  'archive',
  'delete'
];

function initialOf(name = '') {
  return (name || 'C').charAt(0).toUpperCase();
}

function priorityBadge(priority = 'Medium') {
  const p = String(priority || 'Medium');
  let cls = 'bg-[#EFF6FF] text-[#2563EB]';
  if (p === 'High' || p === 'Urgent' || p === 'Critical') cls = 'bg-[#FEF2F2] text-[#DC2626]';
  else if (p === 'Low') cls = 'bg-[#F3F4F6] text-[#6B7280]';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-[20px] text-[11px] font-semibold whitespace-nowrap ${cls}`}>
      {p}
    </span>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex py-1.5 text-[13px] border-b border-slate-100 last:border-b-0">
      <span className="w-[130px] shrink-0 text-slate-500 font-medium text-xs">{label}</span>
      <span className="text-slate-700 font-medium flex-1">{children}</span>
    </div>
  );
}

function CardHeader({ icon: Icon, title, count }) {
  return (
    <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-3">
      <Icon className="w-4 h-4" />
      {title}
      {count != null && <span className="normal-case font-semibold text-slate-400 text-xs">({count})</span>}
    </h3>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="text-center py-10">
      <Icon className="w-9 h-9 text-slate-300 mx-auto mb-3" />
      <h4 className="text-[15px] font-bold text-slate-600 mb-1">{title}</h4>
      {subtitle && <p className="text-[13px] text-slate-400">{subtitle}</p>}
    </div>
  );
}

/**
 * Display value for one STANDARD item cell, keyed by the column's stable id.
 * The item fields are the ones the backend returns in CprItemResponse — the
 * `description` field is the ERP's "Material" column and `specification` is the
 * "Description" column (see defaultCprItemColumns).
 */
function standardItemCellValue(item, col) {
  switch (col.id) {
    case 'drawingNo': return item.drawingNo || '—';
    case 'description': return item.description || '—';
    case 'specification': return item.specification || '—';
    case 'qty': return parseFloat(item.qty || item.quantity || 0);
    case 'unit': return item.unit || 'Nos';
    case 'estimatedCost': return formatINR(parseFloat(item.estimatedCost || 0));
    case 'remarks': return item.remarks || '—';
    default: return '—';
  }
}

const itemCellAlign = (id) =>
  ['qty', 'unit'].includes(id) ? 'text-center' : id === 'estimatedCost' ? 'text-right' : 'text-left';

/**
 * Read-only Item Details table, shared by the Overview and Items panes so both
 * render the SAME real CPR items with the SAME configured columns.
 * Column definitions come from the caller (record snapshot → module config →
 * defaults); item VALUES always come from this CPR's own items.
 */
function ItemDetailsTable({ items = [], columns = [] }) {
  if (items.length === 0) {
    return <EmptyState icon={Package} title="No Items" subtitle="No items have been added to this CPR." />;
  }
  // Same ordering rule the Item Details grid uses: the business columns keep
  // the configured order and the commercial columns (Qty / UOM / Est. Cost)
  // stay grouped at the right, so the Overview matches Edit column-for-column.
  const isCommercial = (c) => c.id === 'qty' || c.id === 'unit' || c.id === 'estimatedCost';
  const ordered = [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const displayColumns = [...ordered.filter((c) => !isCommercial(c)), ...ordered.filter(isCommercial)];
  const qtyOf = (it) => parseFloat(it.qty || it.quantity || 0);
  const costOf = (it) => parseFloat(it.estimatedCost || 0);
  const totalQty = items.reduce((sum, it) => sum + qtyOf(it), 0);
  const grandTotal = items.reduce((sum, it) => sum + qtyOf(it) * costOf(it), 0);
  const qtyIdx = displayColumns.findIndex((c) => c.id === 'qty');
  const cellValue = (it, cf, col) => (col.system ? standardItemCellValue(it, col) : (cf[col.id] || '—'));
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-lg">
      <table className="w-full border-collapse" style={{ minWidth: 900 }}>
        <thead>
          <tr className="bg-slate-50">
            <th className="py-2 px-2 text-center text-[11px] font-bold text-slate-500 w-10">#</th>
            {displayColumns.map((c) => (
              <th key={c.id} className={`py-2 px-2 text-[11px] font-bold text-slate-500 ${itemCellAlign(c.id)} whitespace-nowrap`}>{c.label}</th>
            ))}
            <th className="py-2 px-2 text-right text-[11px] font-bold text-slate-500 whitespace-nowrap">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, idx) => {
            const cf = it.customFields && typeof it.customFields === 'object' ? it.customFields : {};
            const itemNotes = String(it.notes || '').trim();
            return (
              <Fragment key={it.id ?? idx}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                  <td className="py-2 px-2 text-center text-xs text-slate-500">{idx + 1}</td>
                  {displayColumns.map((c) => (
                    <td key={c.id} className={`py-2 px-2 text-xs ${itemCellAlign(c.id)} ${c.id === 'description' ? 'font-medium text-slate-700' : 'text-slate-600'}`}>{cellValue(it, cf, c)}</td>
                  ))}
                  <td className="py-2 px-2 text-right text-xs font-semibold text-slate-700 whitespace-nowrap">{formatINR(qtyOf(it) * costOf(it))}</td>
                </tr>
                {/* Item Notes on their own line, with the entered line breaks
                    preserved (whitespace-pre-line). The note belongs to the row
                    directly above it — never to the whole CPR. */}
                {itemNotes && (
                  <tr className="border-b border-slate-100 bg-slate-50/60">
                    <td colSpan={displayColumns.length + 2} className="py-1.5 px-2 text-xs text-slate-600 whitespace-pre-line">
                      <span className="font-semibold text-slate-500">Notes: </span>
                      {itemNotes}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-slate-200 bg-slate-50/60">
            {qtyIdx >= 0 ? (
              <>
                <td colSpan={qtyIdx + 1} className="py-2.5 px-2 text-[13px] font-semibold text-[#0B4A3D]">Totals</td>
                <td className="py-2.5 px-2 text-center text-[13px] font-semibold">{totalQty}</td>
                {displayColumns.slice(qtyIdx + 1).map((c) => (
                  <td key={c.id} className="py-2.5 px-2"></td>
                ))}
              </>
            ) : (
              <td colSpan={displayColumns.length + 1} className="py-2.5 px-2 text-[13px] font-semibold text-[#0B4A3D]">Totals</td>
            )}
            <td className="py-2.5 px-2 text-right text-sm font-bold text-[#0B4A3D] whitespace-nowrap">{formatINR(grandTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

const ACTIVITY_ICONS = {
  check: CheckCircle,
  default: Clock
};

const TL_DOT_COLORS = {
  created: 'border-[#0B4A3D] bg-[#E8F0EE]',
  'draft saved': 'border-[#6b7280] bg-[#f3f4f6]',
  updated: 'border-[#0B4A3D] bg-[#E8F0EE]',
  'field': 'border-[#0B4A3D] bg-[#E8F0EE]',
  completed: 'border-[#059669] bg-[#f0fdf4]',
  approved: 'border-[#059669] bg-[#f0fdf4]',
  submitted: 'border-[#f59e0b] bg-[#fffbeb]',
  rejected: 'border-[#dc2626] bg-[#fee2e2]',
  'send back': 'border-[#d97706] bg-[#fffbeb]',
  deleted: 'border-[#dc2626] bg-[#fee2e2]',
  restored: 'border-[#059669] bg-[#f0fdf4]',
  archived: 'border-[#9ca3af] bg-[#f3f4f6]',
  duplicated: 'border-[#7c3aed] bg-[#f5f3ff]',
  converted: 'border-[#059669] bg-[#f0fdf4]',
  costworkout: 'border-[#0891b2] bg-[#ecfeff]',
  attachment: 'border-[#0891b2] bg-[#ecfeff]',
  comment: 'border-[#7c3aed] bg-[#f5f3ff]',
  danger: 'border-[#dc2626] bg-[#fee2e2]',
  default: 'border-[#9ca3af] bg-white'
};

function TimelineEvent({ event }) {
  return (
    <div className="relative pl-9 pb-4 last:pb-0 group">
      <span className={`absolute left-[3px] top-1 w-3 h-3 rounded-full border-2 ${TL_DOT_COLORS[event.type] || TL_DOT_COLORS.default} group-hover:scale-125 transition-transform`} />
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-[13px] font-semibold text-slate-800">{event.title}</div>
        {event.userName && (
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
            <User className="w-3 h-3" /> {event.userName}
            {event.userRole ? <span className="text-slate-400">· {event.userRole}</span> : null}
          </span>
        )}
      </div>
      {event.desc && <div className="text-xs text-slate-500 mt-0.5">{event.desc}</div>}
      {event.field && event.field !== 'Source' && (
        <div className="mt-1 inline-flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-md px-2 py-1 text-[11px] text-slate-600">
          <span className="font-semibold text-slate-500">{event.field}:</span>
          <span className={event.oldValue ? 'line-through text-slate-400' : 'text-slate-400'}>{event.oldValue || '—'}</span>
          <span className="text-slate-400">→</span>
          <span className="font-medium text-[#0B4A3D]">{event.newValue || '—'}</span>
        </div>
      )}
      <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(event.date)}</div>
    </div>
  );
}

export default function CprView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [cpr, setCpr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'overview');
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [remarks, setRemarks] = useState('');
  const [remarksType, setRemarksType] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [timelineFromApi, setTimelineFromApi] = useState(null);
  const [historyFromApi, setHistoryFromApi] = useState(null);

  const refreshComments = async () => {
    try {
      const res = await cprService.getComments(id);
      setComments(Array.isArray(res) ? res : []);
    } catch {
      // keep current list
    }
  };

  const refreshSubResources = async () => {
    try {
      const [tl, hx] = await Promise.all([cprService.getTimeline(id), cprService.getHistory(id)]);
      setTimelineFromApi(Array.isArray(tl) ? tl : null);
      setHistoryFromApi(Array.isArray(hx) ? hx : null);
    } catch {
      // fall back to the embedded / derived data
    }
  };

  const submitComment = async () => {
    const editing = editingCommentId;
    const text = (editing ? editingText : commentText).trim();
    if (!text) return;
    try {
      if (editing) {
        await cprService.updateComment(id, editing, text);
      } else {
        await cprService.addComment(id, text);
      }
      setCommentText('');
      setEditingCommentId(null);
      setEditingText('');
      await refreshComments();
      await refreshSubResources();
      toast.success(editing ? 'Comment updated' : 'Comment added');
    } catch (err) {
      toast.error(err?.message || 'Failed to save comment');
    }
  };

  const removeComment = async (commentId) => {
    try {
      await cprService.deleteComment(id, commentId);
      await refreshComments();
      await refreshSubResources();
      toast.success('Comment deleted');
    } catch (err) {
      toast.error(err?.message || 'Failed to delete comment');
    }
  };

  const startEditComment = (comment) => {
    setEditingCommentId(comment.id);
    setEditingText(comment.text || '');
  };

  const cancelEditComment = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  useEffect(() => {
    // Clear previous record immediately so stale data never flashes when
    // navigating between CPR records.
    setCpr(null);
    setLoading(true);
    setNotFound(false);
    let cancelled = false;
    const hydrate = async () => {
      try {
        const res = await cprService.getCpr(id);
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        if (!raw?.id && !raw?.prNo) {
          setNotFound(true);
        } else {
          setNotFound(false);
          setCpr(normalizeCpr(raw));
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (cancelled) return;
      try {
        const [tl, hx] = await Promise.all([cprService.getTimeline(id), cprService.getHistory(id)]);
        if (!cancelled) {
          setTimelineFromApi(Array.isArray(tl) ? tl : null);
          setHistoryFromApi(Array.isArray(hx) ? hx : null);
        }
      } catch {
        // fall back to the embedded / derived data
      }
      try {
        const res = await cprService.getComments(id);
        if (!cancelled) setComments(Array.isArray(res) ? res : []);
      } catch {
        // keep current list
      }
    };
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const load = async () => {
    const res = await cprService.getCpr(id);
    setCpr(normalizeCpr(res?.data ?? res ?? {}));
    refreshComments();
    refreshSubResources();
  };

  const runAction = async (fn, successMsg, navigateBack = false) => {
    setActionLoading(true);
    try {
      await fn();
      toast.success(successMsg);
      // Sidebar pending-approval counts refresh after submit / approve /
      // reject / archive / restore / delete / convert actions.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      if (navigateBack) {
        navigate('/cprs');
        return;
      }
      const res = await cprService.getCpr(id);
      setCpr(normalizeCpr(res?.data ?? res ?? {}));
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Module-level Item Details column configuration (MySQL: app_settings via
  // grid-configs/sales.items.cpr). Read-only here — the View page never writes
  // it. It is only the fallback for CPRs that carry no snapshot of their own.
  const { columns: moduleItemColumns } = useGridColumns({
    gridKey: 'sales.items.cpr',
    defaults: defaultCprItemColumns
  });

  const timelineEvents = useMemo(() => {
    // Timeline is loaded exclusively from the backend (GET /cprs/{id}/timeline,
    // with the embedded detail-payload copy as fallback). No client-derived events.
    const source =
      Array.isArray(timelineFromApi) && timelineFromApi.length > 0
        ? timelineFromApi
        : Array.isArray(cpr?.timeline) && cpr.timeline.length > 0
          ? cpr.timeline
          : [];
    return source
      .map((t) => ({
        id: t.id,
        title: t.title,
        desc: t.detail,
        date: t.createdAt,
        type: t.type,
        field: t.field,
        oldValue: t.oldValue,
        newValue: t.newValue,
        userName: t.userName,
        userRole: t.userRole
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [cpr, timelineFromApi]);

  const activityEvents = useMemo(() => {
    // Activity log is loaded exclusively from the backend (GET /cprs/{id}/history,
    // with the embedded detail-payload copy as fallback). No client-derived entries.
    const source =
      Array.isArray(historyFromApi) && historyFromApi.length > 0
        ? historyFromApi
        : Array.isArray(cpr?.history) && cpr.history.length > 0
          ? cpr.history
          : [];
    return source
      .map((h) => ({
        id: h.id,
        text: `${h.field}: ${h.oldValue || '—'} → ${h.newValue || '—'}${h.changedBy ? ` by ${h.changedBy}` : ''}`,
        date: h.createdAt,
        icon: 'check'
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [cpr, historyFromApi]);

  // The version being inspected and the version immediately before it, taken
  // from the immutable revision snapshots the detail endpoint already serves.
  // Enabled only while the Version History pane is open, so a normal view (or
  // a plain historical view) costs no extra request.
  const version = useVersionComparison({
    service: CPR_VERSION_SERVICE,
    doc: cpr,
    normalize: normalizeCpr,
    ignored: CPR_VERSION_IGNORED_FIELDS,
    enabled: Boolean(cpr) && tab === 'version-history'
  });

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !cpr) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
          <span>VISHAK TECH</span>
          <span>&gt;</span>
          <span>Sales</span>
          <span>&gt;</span>
          <span>Customer Purchase Request</span>
        </div>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">CPR Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">The CPR you are looking for does not exist.</p>
          <button
            type="button"
            onClick={() => navigate('/cprs')}
            className="erp-detail-action erp-detail-action--primary"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to CPR List
          </button>
        </div>
      </div>
    );
  }

  const status = String(cpr.status || 'draft').toLowerCase();
  // Historical revisions are read-only: editing, submitting, approval,
  // conversion, duplicate, archive and delete are hidden for them.
  const isHistorical = cpr.latestRevision === false;
  const latestVersionId =
    version.chain.find((rev) => rev.latestRevision)?.id ??
    version.chain[version.chain.length - 1]?.id ??
    cpr.id;
  const items = cpr.items || [];
  const attachments = cpr.attachments || [];
  // All visible Item Details columns (standard + custom), resolved with the
  // SAME chain the Item Details grid uses (CprItemGrid):
  //   · the record's own snapshot (cpr.itemColumns → cprs.item_columns_json)
  //     wins when the document carries one, so a saved document keeps rendering
  //     exactly the columns it was saved with;
  //   · otherwise the module configuration (sales.items.cpr) applies, so a CPR
  //     created before Manage Columns was ever saved still shows its columns;
  //   · otherwise the built-in defaults apply.
  // Without this chain the table rendered zero data columns (only # and Total)
  // because itemColumns comes back empty for records with no saved snapshot.
  const recordItemColumns = Array.isArray(cpr.itemColumns) && cpr.itemColumns.length > 0 ? cpr.itemColumns : null;
  const moduleColumns = Array.isArray(moduleItemColumns) && moduleItemColumns.length > 0 ? moduleItemColumns : null;
  const allItemColumns = (recordItemColumns || moduleColumns || defaultCprItemColumns()).filter((c) => c && !c.hidden);
  const totalQty = items.reduce((sum, it) => sum + parseFloat(it.qty || it.quantity || 0), 0);
  // ERP renderSummaryCard: Est. Total + Cost Workout + Profit Margin derivation.
  const totalAmt = parseFloat(cpr.grandTotal || cpr.subtotal || 0);
  const costWorkoutVal = parseFloat(cpr.costWorkout || 0);
  const profitPct =
    costWorkoutVal > 0 && totalAmt > 0 ? ((totalAmt - costWorkoutVal) / costWorkoutVal) * 100 : null;

  const confirmConfigs = {
    archive: {
      title: status === 'archived' ? 'Restore CPR' : 'Archive CPR',
      message: status === 'archived' ? 'Restore this CPR from archive?' : 'Archive this CPR? It can be restored later.',
      confirmLabel: status === 'archived' ? 'Restore' : 'Archive',
      variant: 'warning',
      icon: status === 'archived' ? RotateCcw : Archive,
      onConfirm: async () => {
        const fn = status === 'archived' ? () => cprService.restoreCpr(id) : () => cprService.archiveCpr(id);
        await runAction(fn, status === 'archived' ? `${cpr.prNo} restored` : `${cpr.prNo} archived`);
        setConfirm(null);
      }
    },
    delete: {
      title: 'Delete CPR',
      message: 'This CPR will be moved to trash.',
      confirmLabel: 'Delete',
      variant: 'danger',
      icon: Trash2,
      onConfirm: async () => {
        await runAction(() => cprService.deleteCpr(id), `${cpr.prNo} moved to trash`, true);
        setConfirm(null);
      }
    }
  };

  const openRemarks = (type) => {
    setRemarks('');
    setRemarksType(type);
  };

  const submitRemarks = async () => {
    const type = remarksType;
    // ERP parity: remarks are required for rejection and send-back.
    if ((type === 'reject' || type === 'sendback') && !(remarks || '').trim()) {
      toast.warning(type === 'sendback' ? 'Remarks are required to send a CPR back' : 'Remarks are required to reject a CPR');
      return;
    }
    setRemarksType(null);
    const action =
      type === 'approve'
        ? () => cprService.approveCpr(id, remarks)
        : type === 'sendback'
          ? () => cprService.sendBackCpr(id, remarks)
          : () => cprService.rejectCpr(id, remarks);
    const msg =
      type === 'approve' ? `${cpr.prNo} approved` : type === 'sendback' ? `${cpr.prNo} sent back` : `${cpr.prNo} rejected`;
    await runAction(action, msg);
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      toast.error('Popup blocked. Allow popups to print.');
      return;
    }
    win.document.write(buildCprPrintHtml(cpr, cpr.prNo));
    win.document.close();
    win.focus();
    win.print();
  };

  const handlePdf = () => exportCprDocumentPdf(cpr, cpr.prNo || `CPR_${id}`);

  const handleShare = async () => {
    const res = await shareCpr(cpr);
    if (res?.ok) {
      toast.success(res.action === 'share' ? 'CPR shared successfully' : 'CPR link copied to clipboard');
    } else if (res?.error) {
      toast.error(res.error);
    }
  };

  const handleEmail = () => {
    const res = emailCpr(cpr);
    if (res && res.error) {
      toast.error(res.error);
    }
  };

  const headerActions = [];
  if (!isHistorical && status !== 'converted' && status !== 'closed' && status !== 'deleted' && status !== 'archived') {
    headerActions.push({ key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(`/cprs/${cpr.id}/edit`) });
  }
  if (!isHistorical && (status === 'draft' || status === 'rejected')) {
    headerActions.push({ key: 'submit', label: 'Submit', icon: Send, style: 'primary', action: () => runAction(() => cprService.submitCpr(id), `${cpr.prNo} submitted for approval`) });
  }
  if (!isHistorical && status === 'pending approval') {
    headerActions.push({ key: 'approve', label: 'Approve', icon: Check, style: 'approve', action: () => openRemarks('approve') });
    headerActions.push({ key: 'sendback', label: 'Send Back', icon: RotateCcw, style: 'secondary', action: () => openRemarks('sendback') });
    headerActions.push({ key: 'reject', label: 'Reject', icon: X, style: 'reject', action: () => openRemarks('reject') });
  }
  if (!isHistorical && status !== 'deleted' && status !== 'converted') {
    headerActions.push({ key: 'duplicate', label: 'Duplicate', icon: Copy, style: 'ghost', action: () => runAction(() => cprService.duplicateCpr(id), 'CPR duplicated') });
  }
  if (!isHistorical && status === 'approved' && !cpr.convertedToQtn) {
    headerActions.push({ key: 'convert', label: 'Convert to Quotation', icon: FileText, style: 'primary', action: () => runAction(() => cprService.convertToQuotation(id), `${cpr.prNo} converted to quotation`) });
    headerActions.push({ key: 'costWorkout', label: 'Cost Workout', icon: Calculator, style: 'secondary', action: () => navigate(`/cost-workouts/new?cpr=${cpr.id}`) });
  }
  if (cpr.convertedToQtn) {
    // Open the real quotation record created on conversion (falls back to the
    // CPR-driven preview only when the quotation id is not available).
    const quotationTarget = cpr.quotationId ? `/quotations/${cpr.quotationId}/view` : `/quotations/${cpr.id}`;
    headerActions.push({ key: 'openQuotation', label: 'Open Quotation', icon: FileText, style: 'green', action: () => navigate(quotationTarget) });
  }
  headerActions.push({ key: 'preview', label: 'Preview', icon: Eye, style: 'ghost', action: () => setPreviewOpen(true) });
  headerActions.push({ key: 'print', label: 'Print', icon: Printer, style: 'ghost', action: handlePrint });
  headerActions.push({ key: 'pdf', label: 'Download PDF', icon: FileDown, style: 'ghost', action: () => runAction(handlePdf, 'PDF downloaded') });
  headerActions.push({ key: 'share', label: 'Share', icon: Share2, style: 'ghost', action: handleShare });
  headerActions.push({ key: 'email', label: 'Email', icon: Mail, style: 'ghost', action: handleEmail });
  if (status !== 'deleted' && !isHistorical) {
    headerActions.push({ key: 'archive', label: status === 'archived' ? 'Restore' : 'Archive', icon: status === 'archived' ? RotateCcw : Archive, style: 'ghost', action: () => setConfirm('archive') });
    headerActions.push({ key: 'delete', label: 'Delete', icon: Trash2, style: 'danger', action: () => setConfirm('delete') });
  }

  // Front row keeps the reference layout — Back / Edit / Print / PDF plus the
  // status-driven workflow actions (Submit, Approve, Send Back, Reject,
  // Convert). Utility and rare actions move into the ⋯ More menu.
  const visibleHeaderActions = headerActions.filter((a) => !HEADER_OVERFLOW_KEYS.includes(a.key));
  const moreHeaderActions = headerActions.filter((a) => HEADER_OVERFLOW_KEYS.includes(a.key));

  const TABS = [
    { key: 'overview', label: 'Overview', icon: Layers, count: null },
    { key: 'items', label: 'Items', icon: Package, count: items.length },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
    { key: 'timeline', label: 'Timeline', icon: History, count: timelineEvents.length },
    { key: 'activities', label: 'Activity Log', icon: ClipboardList, count: null },
    { key: 'comments', label: 'Comments', icon: MessageSquare, count: comments.length },
    { key: 'version-history', label: 'Version History', icon: GitBranch, count: Array.isArray(cpr?.revisions) ? cpr.revisions.length : null }
  ];

  return (
    /* `erp-detail-scope` opts this page into the shared detail-page action
       standard (styles/erp-detail-scope.css) — same class family as the CRM
       view pages and Cost Workout detail, so Back / Edit / Submit / More get
       the reference geometry. */
    <div className="erp-detail-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>VISHAK TECH</span>
        <span>&gt;</span>
        <span>Sales</span>
        <span>&gt;</span>
        <span>Customer Purchase Request</span>
        <span>&gt;</span>
        <span className="text-slate-600">{cpr.prNo}</span>
      </div>

      {/* ===== STICKY HEADER ===== */}
      <div className="sticky top-0 z-20 bg-app">
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-[#083D34] to-[#083D34] text-white flex items-center justify-center text-xl font-bold shrink-0">
                {initialOf(cpr.client)}
              </div>
              <div className="min-w-0">
                <h1 className="text-[22px] font-bold text-slate-900 leading-tight truncate">
                  {cpr.client} <span className="text-slate-400 font-semibold">({cpr.prNo})</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Tag className="w-3 h-3 text-[#0B4A3D]" /> {cpr.prNo}
                  </span>
                  <CprStatusBadge status={cpr.status} />
                  <CprApprovalBadge status={cpr.approvalStatus} />
                  {isHistorical && (
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Historical revision · Read only
                    </span>
                  )}
                  {priorityBadge(cpr.priority)}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(cpr.prDate || cpr.createdAt)}
                  </span>
                  {cpr.department && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Building2 className="w-3 h-3 text-[#0B4A3D]" /> {cpr.department}
                    </span>
                  )}
                  {(cpr.createdBy || cpr.requestedBy) && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <User className="w-3 h-3 text-[#0B4A3D]" /> {cpr.createdBy || cpr.requestedBy}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="erp-detail-actions">
              <button type="button" onClick={() => navigate('/cprs')} className="erp-detail-action">
                <ArrowLeft /> Back
              </button>
              {visibleHeaderActions.map((action) => (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.action}
                  disabled={actionLoading}
                  className={detailActionClass(action.style)}
                >
                  <action.icon /> {action.label}
                </button>
              ))}
              {moreHeaderActions.length > 0 && (
                <ActionMenu
                  items={moreHeaderActions.map((a) => ({
                    key: a.key,
                    label: a.label,
                    icon: a.icon,
                    danger: a.style === 'danger'
                  }))}
                  onAction={(key) => moreHeaderActions.find((a) => a.key === key)?.action()}
                  triggerClassName="erp-detail-action erp-detail-action--more"
                  buttonLabel="More CPR actions"
                  label="More"
                />
              )}
            </div>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex items-center gap-1 border-b-2 border-slate-200 mt-3 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-0.5 transition-colors cursor-pointer ${
                  active ? 'border-[#0B4A3D] text-[#0B4A3D] font-semibold' : 'border-transparent text-slate-500 hover:text-[#0B4A3D]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
                {t.count != null && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                      active ? 'bg-[#E8F0EE] text-[#0B4A3D]' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== OVERVIEW PANE ===== */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start mt-4">
          <div className="flex flex-col gap-4">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={Info} title="General Information" />
              <Row label="CPR No"><strong>{cpr.prNo}</strong></Row>
              <Row label="Reference No">{cpr.referencePrNo || '—'}</Row>
              <Row label="Quotation Deadline">
                {cpr.quotationDeadline ? formatDate(cpr.quotationDeadline) : '—'}
              </Row>
              <Row label="Extended Deadline">
                {cpr.extendedDeadline ? (
                  <>
                    {formatDate(cpr.extendedDeadline)}
                    {cpr.quotationDeadline && cpr.extendedDeadline !== cpr.quotationDeadline && (
                      <span className="text-[11px] font-medium text-slate-400 ml-1.5">
                        (original {formatDate(cpr.quotationDeadline)})
                      </span>
                    )}
                  </>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Date">{formatDate(cpr.prDate || cpr.createdAt)}</Row>
              <Row label="Status"><CprStatusBadge status={cpr.status} /></Row>
              <Row label="Priority">{priorityBadge(cpr.priority)}</Row>
              <Row label="Department">{cpr.department || '—'}</Row>
              <Row label="Lead Reference">{cpr.leadNo || '—'}</Row>
              <Row label="Required Date">{cpr.requiredDate ? formatDate(cpr.requiredDate) : '—'}</Row>
              <Row label="Requested By">{cpr.requestedBy || cpr.createdBy || '—'}</Row>
              {cpr.createdAt && <Row label="Created Date">{formatDate(cpr.createdAt)}</Row>}
              {cpr.updatedAt && <Row label="Last Updated">{formatDate(cpr.updatedAt)}</Row>}
            </div>

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={User} title="Customer Information" />
              <Row label="Customer">{cpr.client || '—'}</Row>
              <Row label="Contact Person">{cpr.contactPerson || '—'}</Row>
              <Row label="Phone">{cpr.phone || '—'}</Row>
              <Row label="Email">
                {cpr.email ? (
                  <a href={`mailto:${cpr.email}`} className="text-[#0B4A3D] font-medium hover:underline">{cpr.email}</a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="Company">{cpr.company || '—'}</Row>
              <Row label="GST">{cpr.gst || '—'}</Row>
              <Row label="Billing Address">{cpr.billingAddress || '—'}</Row>
              <Row label="Shipping Address">{cpr.shippingAddress || '—'}</Row>
            </div>

            {/* Item Details on the Overview itself: the same real item rows the
                Items tab shows, so the entered item data is visible without
                switching tabs. */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={Package} title="Item Details" count={`${items.length} records`} />
              <ItemDetailsTable items={items} columns={allItemColumns} />
            </div>

            {cpr.project && (
              <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
                <CardHeader icon={Network} title="Project Information" />
                <Row label="Project">{cpr.project}</Row>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-40">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={Calculator} title="CPR Summary" />
              <Row label="Total Items"><strong>{items.length}</strong></Row>
              <Row label="Total Qty"><strong>{totalQty}</strong></Row>
              {/* ERP cwv-summary-total block */}
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Est. Total</span>
                <span className="text-sm font-bold text-[#0B4A3D]">{formatINR(totalAmt)}</span>
              </div>
              {costWorkoutVal > 0 && <Row label="Cost Workout">{formatINR(costWorkoutVal)}</Row>}
              {profitPct != null && (
                <Row label="Profit Margin">
                  <span className="font-medium">{profitPct.toFixed(1)}%</span>
                </Row>
              )}
            </div>

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={CheckCircle} title="Approval" />
              <Row label="Approval Status">{cpr.approvalStatus || 'Pending'}</Row>
              <Row label="Approved By">{cpr.approvedBy || '—'}</Row>
              <Row label="Approval Date">{cpr.approvalDate ? formatDate(cpr.approvalDate) : '—'}</Row>
              <Row label="Rejected By">{cpr.rejectedBy || '—'}</Row>
              <Row label="Rejection Reason">{cpr.approvalRemarks || '—'}</Row>
            </div>

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={Link2} title="Linked Documents" />
              {(cpr.leadNo || cpr.convertedToQtn || cpr.costWorkoutId || costWorkoutVal > 0) ? (
                <>
                  {cpr.leadNo && (
                    <Row label="Lead">
                      <button
                        type="button"
                        onClick={() => toast.info(`Lead ${cpr.leadNo} opens in the Leads module.`)}
                        className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                      >
                        {cpr.leadNo} <ExternalLink className="w-3 h-3" />
                      </button>
                    </Row>
                  )}
                  {cpr.convertedToQtn && (
                    <Row label="Quotation">
                      <button
                        type="button"
                        onClick={() => navigate(`/quotations/${cpr.id}`)}
                        className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                      >
                        {cpr.convertedToQtn} <ExternalLink className="w-3 h-3" />
                      </button>
                    </Row>
                  )}
                  {cpr.costWorkoutId && (
                    <Row label="Cost Workout">
                      <button
                        type="button"
                        onClick={() => navigate(`/cost-workouts/${cpr.costWorkoutId}`)}
                        className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                      >
                        {cpr.costWorkoutCwNo || `CW-${cpr.costWorkoutId}`} <ExternalLink className="w-3 h-3" />
                        {cpr.costWorkoutStatus ? ` · ${cpr.costWorkoutStatus}` : ''}
                      </button>
                    </Row>
                  )}
                  {costWorkoutVal > 0 && !cpr.costWorkoutId && (
                    <Row label="Cost Workout">
                      <span className="font-medium text-slate-700">{formatINR(costWorkoutVal)}</span>
                    </Row>
                  )}
                </>
              ) : (
                <EmptyState icon={Link2} title="No Linked Documents" />
              )}
            </div>

            {cpr.remarks && (
              <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
                <CardHeader icon={StickyNote} title="Remarks" />
                <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{cpr.remarks}</div>
              </div>
            )}

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={History} title="Timeline" count={`${timelineEvents.length} events`} />
              <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200 max-h-80 overflow-y-auto pr-1">
                {timelineEvents.length === 0 ? (
                  <EmptyState icon={Clock} title="No Timeline Events" />
                ) : (
                  <>
                    {timelineEvents.slice(0, 6).map((event) => (
                      <TimelineEvent key={event.id ?? `${event.title}-${event.date}`} event={event} />
                    ))}
                    {timelineEvents.length > 6 && (
                      <div className="text-center py-2">
                        <button
                          type="button"
                          onClick={() => setTab('timeline')}
                          className="text-xs font-semibold text-[#0B4A3D] hover:underline cursor-pointer"
                        >
                          View all {timelineEvents.length} events <span aria-hidden="true">→</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={ClipboardList} title="Activity Log" />
              {activityEvents.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No Activity" />
              ) : (
                <>
                  {activityEvents.slice(0, 4).map((a) => {
                    const Icon = ACTIVITY_ICONS[a.icon] || ACTIVITY_ICONS.default;
                    return (
                      <div key={a.id ?? `${a.text}-${a.date}`} className="flex items-start gap-2.5 py-2 border-b border-slate-100 last:border-b-0">
                        <div className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] text-slate-700">{a.text}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(a.date)}</div>
                        </div>
                      </div>
                    );
                  })}
                  {activityEvents.length > 4 && (
                    <div className="text-center py-1.5">
                      <button
                        type="button"
                        onClick={() => setTab('activities')}
                        className="text-xs font-semibold text-slate-400 hover:text-[#0B4A3D] cursor-pointer"
                      >
                        +{activityEvents.length - 4} more
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== ITEMS PANE ===== */}
      {tab === 'items' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 mt-4">
          <CardHeader icon={Layers} title="Item Details" count={`${items.length} records`} />
          <ItemDetailsTable items={items} columns={allItemColumns} />
        </div>
      )}

      {/* ===== ATTACHMENTS PANE ===== */}
      {tab === 'attachments' && (
        <CprAttachments cprId={id} attachments={attachments} onChanged={load} />
      )}

      {/* ===== TIMELINE PANE ===== */}
      {tab === 'timeline' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 mt-4">
          <CardHeader icon={History} title="Full Timeline" count={`${timelineEvents.length} events`} />
          {timelineEvents.length === 0 ? (
            <EmptyState icon={Clock} title="No Timeline Events" />
          ) : (
            <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
              {timelineEvents.map((event) => (
                <TimelineEvent key={event.id ?? `${event.title}-${event.date}`} event={event} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== ACTIVITY LOG PANE ===== */}
      {tab === 'activities' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 mt-4">
          <CardHeader icon={ClipboardList} title="Activity Log" count={`${activityEvents.length} records`} />
          {activityEvents.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No Activity Recorded" />
          ) : (
            <div>
              {activityEvents.map((a) => {
                const Icon = ACTIVITY_ICONS[a.icon] || ACTIVITY_ICONS.default;
                return (
                  <div key={a.id ?? `${a.text}-${a.date}`} className="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-b-0">
                    <div className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[13px] text-slate-700">{a.text}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(a.date)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== COMMENTS PANE ===== */}
      {tab === 'comments' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 mt-4">
          <CardHeader icon={MessageSquare} title="Comments" count={`${comments.length} records`} />

          <div className="mb-4">
            <textarea
              rows={3}
              value={editingCommentId ? editingText : commentText}
              onChange={(e) => (editingCommentId ? setEditingText(e.target.value) : setCommentText(e.target.value))}
              placeholder="Add a comment..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 resize-none"
            />
            <div className="flex items-center gap-2 mt-2">
              {editingCommentId && (
                <button
                  type="button"
                  onClick={cancelEditComment}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={submitComment}
                disabled={!((editingCommentId ? editingText : commentText) || '').trim()}
                className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-3.5 h-3.5" /> {editingCommentId ? 'Update Comment' : 'Add Comment'}
              </button>
            </div>
          </div>

          {comments.length === 0 ? (
            <EmptyState icon={MessageSquare} title="No Comments" subtitle="Be the first to comment on this CPR." />
          ) : (
            <div className="space-y-2.5">
              {comments.map((c) => (
                <div key={c.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold text-slate-500">
                      {c.author || '—'} <span className="font-normal text-slate-400">· {formatDateTime(c.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startEditComment(c)}
                        title="Edit comment"
                        aria-label="Edit comment"
                        className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeComment(c.id)}
                        title="Delete comment"
                        aria-label="Delete comment"
                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[13px] text-slate-700 mt-1.5 whitespace-pre-wrap">{c.text}</p>
                  {c.updatedAt && c.updatedAt !== c.createdAt && (
                    <div className="text-[10px] text-slate-400 mt-1">Edited {formatDateTime(c.updatedAt)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== VERSION HISTORY PANE ===== */}
      {tab === 'version-history' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 mt-4">
          <CardHeader icon={GitBranch} title="Version History" count={`${version.chain.length} versions`} />
          {/* What makes THIS saved version different from the one before it —
              a real diff of the two immutable snapshots, never of live data. */}
          {version.chain.length > 0 ? (
            <div className="mb-5">
              <VersionComparison
                comparison={version.comparison}
                direction={version.direction}
                loading={version.loading}
                unavailable={version.unavailable}
                selectedLabel={
                  version.selected
                    ? Number(version.selected.revision) > 0
                      ? `Revision ${version.selected.revision}`
                      : 'Original version'
                    : ''
                }
                currentHref={
                  version.selected && !version.selected.latestRevision
                    ? cprVersionRoute(latestVersionId)
                    : null
                }
                onGoToCurrent={() => navigate(cprVersionRoute(latestVersionId))}
              />
            </div>
          ) : null}
          <RevisionHistoryTable
            revisions={version.chain}
            docNumber={cpr?.prNo || ''}
            currentId={cpr?.id}
            viewRoute={(rev) => cprVersionRoute(rev.id)}
            navigate={navigate}
          />
          {version.chain.length === 0 ? (
            <EmptyState icon={GitBranch} title="No Revision History" subtitle="This is the original version of the document." />
          ) : null}
        </div>
      )}

      {/* ===== PREVIEW ===== */}
      {previewOpen && (
        <CprPreviewModal
          cpr={cpr}
          open
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* ===== CONFIRM DIALOG ===== */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirmConfigs[confirm].title}
          message={confirmConfigs[confirm].message}
          confirmLabel={confirmConfigs[confirm].confirmLabel}
          variant={confirmConfigs[confirm].variant}
          icon={confirmConfigs[confirm].icon}
          loading={actionLoading}
          onConfirm={confirmConfigs[confirm].onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ===== APPROVE / SEND BACK / REJECT REMARKS ===== */}
      {remarksType && (
        <Modal
          open
          onClose={() => setRemarksType(null)}
          title={
            remarksType === 'approve'
              ? 'Approve CPR'
              : remarksType === 'sendback'
                ? 'Send Back CPR'
                : 'Reject CPR'
          }
          footer={
            <>
              <button
                type="button"
                onClick={() => setRemarksType(null)}
                disabled={actionLoading}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRemarks}
                disabled={actionLoading}
                className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  remarksType === 'approve'
                    ? 'bg-[#16a34a] hover:bg-[#15803d] text-white'
                    : 'bg-[#dc2626] hover:bg-[#DC2626] text-white'
                }`}
              >
                {remarksType === 'approve' ? 'Approve' : remarksType === 'sendback' ? 'Send Back' : 'Reject'} {cpr.prNo}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              {remarksType === 'approve'
                ? 'Approve this CPR to move it forward to quotation conversion.'
                : remarksType === 'sendback'
                  ? 'Send this CPR back to the requester for corrections. Remarks are required.'
                  : 'Reject this CPR. Remarks are required for rejection.'}
            </p>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
              Remarks {remarksType !== 'approve' && <span className="text-rose-500">*</span>}
            </label>
            <textarea
              rows={4}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder={
                remarksType === 'approve' ? 'Approval notes (optional)...' : 'Reason (required for reject / send back)...'
              }
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 resize-none"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
