import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Banknote,
  Building2,
  Calendar,
  Check,
  CheckCheck,
  ClipboardList,
  Clock,
  FileDown,
  FileText,
  GitBranch,
  History,
  Info,
  Link2,
  Mail,
  MessageCircle,
  Package,
  Paperclip,
  Pencil,
  Printer,
  RotateCcw,
  Share2,
  StickyNote,
  Trash2
} from 'lucide-react';
import { ConfirmDialog, useCurrentUser, useToast } from '../../components/Common';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import EditCountBadge from '../../components/EditHistory/EditCountBadge';
import EditHistoryTimeline from '../../components/EditHistory/EditHistoryTimeline';
import RevisionHistoryTable from '../../components/EditHistory/RevisionHistoryTable';
import VersionComparison from '../../components/EditHistory/VersionComparison';
import { fetchEditHistory } from '../../utils/editHistory';
import useVersionComparison from '../../hooks/useVersionComparison';
import { changeByLabel, itemIdentity, labelKey } from '../../utils/versionDiff';
import SalesAttachments from '../../components/SalesDetail/SalesAttachments';
import DocumentWorkflow from '../../components/SalesDetail/DocumentWorkflow';
import DynamicDetailTable from '../../components/GridColumns/DynamicDetailTable';
import useDetailColumns from '../../hooks/useDetailColumns';
import { detailRows, itemColumnSetForModule } from '../../utils/detailColumns';
import {
  SALES_CONTRACT_WORKFLOW_ACTIONS,
  SALES_CONTRACT_WORKFLOW_STAGES
} from '../../components/SalesDetail/documentWorkflowStages';
import { formatDate, formatDateTime, formatINR } from '../../utils/leadHelpers';
import { computeTotals, cpoText, docNumber, emailDocument, shareDocument, whatsappDocument } from '../../utils/salesHelpers';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import { salesContractViewConfig } from '../../config/salesPageConfigs';
import {
  DetailBadge,
  DetailBreadcrumb,
  DetailCard,
  DetailEmpty,
  DetailFieldGrid,
  DetailHeader,
  DetailLink,
  DetailLoading,
  DetailPage,
  DetailRow,
  DetailTwoColumn
} from '../../components/DetailPage';
// Design-language CSS for the Sales Contract module. The page below renders
// through the shared DetailPage shell (Tailwind, same as CPR), but child
// surfaces such as DocumentWorkflow still rely on these files being loaded.
import './sales-contract-module.css';
import '../crm/crm-erp.css';

/** Tab strip keys — also the whitelist for the `?tab=` deep link. */
const TAB_KEYS = ['overview', 'items', 'revisions', 'linked', 'timeline', 'activities', 'approval', 'attachments'];

/** Map a workflow action's style onto the shell's button palette. */
const SHELL_ACTION_STYLE = {
  primary: 'primary',
  green: 'green',
  secondary: 'secondary',
  ghost: 'ghost',
  approve: 'green',
  reject: 'danger',
  danger: 'danger'
};

function buildTimelineEvents(doc, no, label) {
  const events = [];
  const createdAt = doc.createdAt || doc.date;
  if (createdAt) {
    events.push({ title: `${label} Created`, desc: `${no || doc.id} was created.`, date: createdAt, type: 'created' });
  }
  if (doc.updatedAt && doc.updatedAt !== createdAt) {
    events.push({ title: `${label} Updated`, desc: 'Document was updated.', date: doc.updatedAt, type: 'edited' });
  }
  if (doc.approvalDate && String(doc.approvalStatus || '').toLowerCase() === 'approved') {
    events.push({ title: 'Approved', desc: `Approved by ${doc.approvedBy || 'Admin'}`, date: doc.approvalDate, type: 'approved' });
  }
  if (doc.archivedAt) {
    events.push({ title: 'Archived', desc: 'Document was archived.', date: doc.archivedAt, type: 'archived' });
  }
  return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function buildActivityEvents(doc, no) {
  const activities = [];
  activities.push({ text: `Document ${no || doc.id} was created.`, date: doc.createdAt || doc.date || new Date().toISOString(), icon: 'plus' });
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

const ACTIVITY_ICONS = {
  plus: Check,
  send: Check,
  check: ClipboardList,
  default: Clock
};

const TIMELINE_DOT_TONE = {
  created: 'border-emerald-500',
  approved: 'border-emerald-500',
  submitted: 'border-amber-500',
  rejected: 'border-rose-500'
};

function TimelineEvent({ event }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-b-0">
      <span className={`mt-1.5 w-2 h-2 rounded-full border-2 shrink-0 ${TIMELINE_DOT_TONE[event.type] || 'border-slate-300'}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-slate-700">{event.title}</div>
        {event.desc && <div className="text-xs text-slate-500 mt-0.5 break-words">{event.desc}</div>}
        <div className="text-[11px] text-slate-400 mt-1">{formatDateTime(event.date)}</div>
      </div>
    </div>
  );
}

function ActivityRow({ event, tone = 'slate' }) {
  const Icon = ACTIVITY_ICONS[event.icon] || ACTIVITY_ICONS.default;
  const skin =
    tone === 'green'
      ? 'bg-[#E8F0EE] text-[#0B4A3D]'
      : 'bg-slate-100 text-slate-500';
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-slate-100 last:border-b-0">
      <span className={`w-7 h-7 rounded-lg inline-flex items-center justify-center shrink-0 ${skin}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <div className="min-w-0">
        <div className="text-[13px] text-slate-700 break-words">{event.text}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(event.date)}</div>
      </div>
    </div>
  );
}

/**
 * Sales Contract View — rendered through the shared ERP detail-page shell
 * (components/DetailPage), the same structure the CPR View uses: breadcrumb →
 * sticky header with status chips + actions + tab strip → two-column body
 * (main content + right summary rail).
 *
 * Every Sales Contract action and section the module already had is preserved:
 * edit / PDF / print / submit / approve / conversions, the Share·Email·WhatsApp·
 * Linked·Activity·Archive·Delete overflow menu, Contract Details, Contract
 * Terms, Items (with the saved column configuration), Revision Chain, Revision
 * History, Notes, Linked Documents + DocumentWorkflow, Timeline, Activity Log,
 * Attachments and Approval History.
 */
export default function SalesContractViewPage() {
  const { id } = useParams();
  // SALES_DELETE, mirrored from the backend role → permission map — the delete
  // action below is gated on it (the backend still enforces it).
  const { canDeleteSales } = useCurrentUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [editHistory, setEditHistory] = useState([]);

  const config = salesContractViewConfig;

  // The list page's "Activity Log" row action links here with ?tab=activities.
  const [tab, setTab] = useState(() => {
    const param = searchParams.get('tab');
    return TAB_KEYS.includes(param) ? param : 'overview';
  });

  // ---- Version comparison (historical revisions + the Revisions pane).
  // The chain, this version and the version immediately before it all come from
  // the detail response this page already loaded; the previous snapshot is
  // fetched through the same service only while a version is being inspected,
  // so a normal view costs no extra request.
  const viewingHistorical = doc?.latestRevision === false;
  const version = useVersionComparison({
    service: config.service,
    doc,
    normalize: config.normalize,
    enabled: Boolean(doc) && (viewingHistorical || tab === 'revisions')
  });
  // Changed-field lookup for the document's own rows; empty unless a historical
  // revision is on screen, so no normal contract view is ever tinted.
  const changedFields = useMemo(
    () => (viewingHistorical ? changeByLabel(version.comparison) : new Map()),
    [viewingHistorical, version.comparison]
  );
  const changeFor = useCallback((label) => changedFields.get(labelKey(label)) || null, [changedFields]);
  const currentRevisionRoute = useMemo(() => {
    const latest = version.chain.find((rev) => rev.latestRevision) || version.chain[version.chain.length - 1];
    return latest ? config.viewRoute(latest) : null;
  }, [config, version.chain]);
  // Line items changed in the revision on screen, matched by business identity
  // (a revision copies rows, so row ids differ between versions).
  const changedItemRows = useMemo(() => {
    const map = new Map();
    if (!viewingHistorical || !version.comparison) return map;
    version.comparison.items.modified.forEach((row) => map.set(row.key, 'modified'));
    version.comparison.items.added.forEach((row) => map.set(row.key, 'added'));
    return map;
  }, [viewingHistorical, version.comparison]);
  const itemRowClass = useCallback(
    (row) => {
      const type = changedItemRows.get(itemIdentity(row));
      if (!type) return undefined;
      return type === 'added'
        ? 'bg-emerald-50/70 border-l-2 border-emerald-300'
        : 'bg-amber-50/70 border-l-2 border-amber-300';
    },
    [changedItemRows]
  );

  useEffect(() => {
    let cancelled = false;
    fetchEditHistory(config.moduleKey, id).then((rows) => {
      if (cancelled) return;
      setEditHistory(Array.isArray(rows) ? rows : []);
    });
    return () => {
      cancelled = true;
    };
  }, [id, config.moduleKey]);

  useEffect(() => {
    let cancelled = false;
    config.service
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        if (!raw?.id) {
          setNotFound(true);
        } else {
          setNotFound(false);
          setDoc(config.normalize(raw));
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, config]);

  const load = async () => {
    const res = await config.service.get(id);
    setDoc(config.normalize(res?.data ?? res ?? {}));
  };

  const runAction = async (fn, successMsg, navigateBack = false) => {
    setActionLoading(true);
    try {
      await fn();
      toast.success(successMsg);
      if (navigateBack) {
        navigate(config.listRoute);
        return;
      }
      await load();
      // Refresh sidebar pending-approval counts after the status changed.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const timelineEvents = useMemo(() => {
    if (!doc) return [];
    const base =
      Array.isArray(doc.timeline) && doc.timeline.length > 0
        ? doc.timeline.map((t) => ({ title: t.title, desc: t.detail, date: t.createdAt, type: t.type }))
        : buildTimelineEvents(doc, docNumber(doc, config.moduleKey), config.title);
    const editEvents = editHistory.map((g) => ({
      title: `Edited — Version ${g.version}`,
      desc: `${g.changeSummary || `${(g.changes || []).length} field(s) changed`}${g.changedBy ? ` by ${g.changedBy}` : ''}`,
      date: g.createdAt,
      type: 'edited'
    }));
    return [...base, ...editEvents].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [doc, config, editHistory]);

  const activityEvents = useMemo(() => {
    if (!doc) return [];
    return buildActivityEvents(doc, docNumber(doc, config.moduleKey));
  }, [doc, config]);

  // ---- Item columns: the SAME persisted configuration the Sales Contract
  // item grid writes to MySQL. A record with its own saved column
  // configuration wins so historical versions stay immutable.
  // NOTE: called before any conditional return so the hook order stays stable.
  const itemGrid = useDetailColumns({
    setName: itemColumnSetForModule(config.moduleKey, doc) || 'invoiceItems',
    recordColumns: doc?.itemColumns
  });
  const itemColumns = itemGrid.visibleColumns.filter((c) => c.key !== 'actions');

  if (loading) {
    return (
      <DetailPage>
        <DetailCard icon={Info} title={config.title}>
          <DetailLoading label={`Loading ${config.label}…`} />
        </DetailCard>
      </DetailPage>
    );
  }

  if (notFound || !doc) {
    return (
      <DetailPage className="erp-detail-scope">
        <DetailBreadcrumb
          items={[
            { label: 'Sales Execution', to: '/sales' },
            { label: 'Sales Contracts', to: '/sales-contracts' }
          ]}
        />
        <DetailCard icon={Info} title={`${config.title} Not Found`}>
          <DetailEmpty
            icon={Info}
            title={`${config.title} Not Found`}
            subtitle={`The ${config.label} you are looking for does not exist.`}
          />
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={() => navigate(config.listRoute)}
              className="erp-detail-action erp-detail-action--primary"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to {config.title} List
            </button>
          </div>
        </DetailCard>
      </DetailPage>
    );
  }

  const status = String(doc.status || 'draft').toLowerCase();
  // Historical revisions are read-only: edit/approve/archive/delete are hidden.
  // Resolved before the conditional returns, so the version comparison and the
  // mutating actions always agree on whether this revision is read-only.
  const isHistorical = viewingHistorical;
  const items = Array.isArray(doc.items) ? doc.items : [];
  const itemRows = detailRows(items);
  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  const no = docNumber(doc, config.moduleKey);
  const totals = computeTotals(items, {
    discountPct: doc.discountPct ?? doc.discount ?? 0,
    charges: (doc.charges ?? 0) + (doc.freight ?? 0) + (doc.insurance ?? 0),
    roundOffEnabled: config.moduleKey === 'invoice'
  });
  const grandTotal = doc.grandTotal != null ? doc.grandTotal : totals.grandTotal;

  const handlePrint = () => {
    if (config.printHtml) {
      const win = window.open('', '_blank', 'width=900,height=1100');
      if (!win) {
        toast.error('Popup blocked. Allow popups to print.');
        return;
      }
      win.document.write(config.printHtml(doc));
      win.document.close();
      win.focus();
      win.print();
    } else {
      toast.info('Print view is available from the PDF export');
    }
  };

  const handlePdf = async () => {
    if (!config.exportPdf) {
      toast.info('PDF export is available from the list export');
      return;
    }
    await runAction(() => config.exportPdf(doc), 'PDF downloaded');
  };

  const handleShare = async () => {
    const res = await shareDocument(doc, config.moduleKey, config.title);
    if (res?.ok) {
      toast.success(res.action === 'share' ? `${config.title} shared` : `${config.title} link copied to clipboard`);
    } else if (res?.error) {
      toast.error(res.error);
    }
  };

  const handleEmail = () => {
    const res = emailDocument(doc, config.moduleKey, config.title);
    if (res?.error) toast.error(res.error);
  };

  const handleWhatsApp = () => {
    const res = whatsappDocument(doc, config.moduleKey, config.title);
    if (res?.error) toast.error(res.error);
  };

  const allowedHeader = config.viewHeaderActions || ['edit', 'duplicate', 'preview', 'print', 'pdf', 'share', 'email', 'whatsapp', 'archive', 'delete'];
  const want = (key) => allowedHeader.includes(key);

  // Primary actions in ERP order: Edit, PDF, Print, [Approve/Convert], More, Back
  const headerActions = [];
  if (want('edit') && !isHistorical && status !== 'deleted' && status !== 'archived' && status !== 'cancelled' && status !== 'converted' && status !== 'completed') {
    headerActions.push({ key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(config.editRoute(doc)) });
  }
  if (want('pdf')) headerActions.push({ key: 'pdf', label: 'PDF', icon: FileDown, style: 'ghost', action: handlePdf });
  if (want('print')) headerActions.push({ key: 'print', label: 'Print', icon: Printer, style: 'ghost', action: handlePrint });
  if (!isHistorical && config.headerActions) {
    headerActions.push(
      ...config.headerActions(doc, { runAction, navigate, toast }).map((action) => ({
        ...action,
        style: SHELL_ACTION_STYLE[action.style] || 'ghost'
      }))
    );
  }

  const moreActions = [];
  if (want('share')) moreActions.push({ key: 'share', label: 'Share', icon: Share2, action: handleShare });
  if (want('email')) moreActions.push({ key: 'email', label: 'Email', icon: Mail, action: handleEmail });
  if (want('whatsapp')) moreActions.push({ key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, action: handleWhatsApp });
  moreActions.push({ divider: true });
  moreActions.push({ key: 'linked', label: 'Linked Documents', icon: Link2, action: () => setTab('linked') });
  moreActions.push({ key: 'activity', label: 'Activity Timeline', icon: History, action: () => setTab('activities') });
  if (status !== 'deleted' && !isHistorical) {
    moreActions.push({ divider: true });
    if (want('archive')) {
      moreActions.push({
        key: 'archive',
        label: status === 'archived' ? 'Restore' : 'Archive',
        icon: status === 'archived' ? RotateCcw : Archive,
        action: () => setConfirm(status === 'archived' ? 'restore' : 'archive')
      });
    }
    // Delete (to trash) is a SALES_DELETE action — not offered without it.
    if (want('delete') && canDeleteSales) moreActions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true, action: () => setConfirm('delete') });
  }

  const confirmConfigs = {
    archive: {
      title: `Archive ${config.title}`,
      message: 'Archive this document? It can be restored later.',
      confirmLabel: 'Archive',
      variant: 'warning',
      icon: Archive,
      onConfirm: async () => {
        await runAction(() => config.service.archive(id), `${no} archived`);
        setConfirm(null);
      }
    },
    restore: {
      title: `Restore ${config.title}`,
      message: 'Restore this document from archive?',
      confirmLabel: 'Restore',
      variant: 'default',
      icon: RotateCcw,
      onConfirm: async () => {
        await runAction(() => config.service.restore(id), `${no} restored`);
        setConfirm(null);
      }
    },
    delete: {
      title: `Delete ${config.title}`,
      message: 'This document will be moved to trash.',
      confirmLabel: 'Delete',
      variant: 'danger',
      icon: Trash2,
      onConfirm: async () => {
        await runAction(() => config.service.delete(id), `${no} moved to trash`, true);
        setConfirm(null);
      }
    }
  };

  const linkedDocs = config.linkedDocs ? config.linkedDocs(doc) : [];
  const versionHistory = Array.isArray(doc.history) ? doc.history : [];
  const generalRows = config.generalRows ? config.generalRows(doc) : [];

  // Split general rows into Contract Details + Contract Terms like the ERP view.
  const termKeys = ['Payment Terms', 'Delivery Terms', 'Contract Validity', 'Contract Duration', 'Warranty Terms'];
  const detailsRows = generalRows.filter(([label]) => !termKeys.includes(label));
  const termsRows = generalRows.filter(([label]) => termKeys.includes(label));

  const revisions = version.chain;
  const clientName = doc.clientName || doc.client || '';

  const tabs = [
    { key: 'overview', label: 'Overview', icon: Info },
    { key: 'items', label: 'Items', icon: Package, count: items.length || null },
    { key: 'revisions', label: 'Revisions', icon: GitBranch, count: (revisions.length || versionHistory.length) || null },
    { key: 'linked', label: 'Linked Documents', icon: Link2, count: linkedDocs.length || null },
    { key: 'timeline', label: 'Timeline', icon: History, count: timelineEvents.length || null },
    { key: 'activities', label: 'Activity Log', icon: ClipboardList, count: activityEvents.length || null },
    { key: 'approval', label: 'Approval', icon: CheckCheck, count: activityEvents.length || null },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length || null }
  ];

  const summaryRail = (
    <>
      <DetailCard icon={Banknote} title="Contract Summary">
        <DetailRow label="Total Amount">
          <span className="text-sm font-bold text-[#0B4A3D]">{formatINR(Number(grandTotal) || 0)}</span>
        </DetailRow>
        <DetailRow label="Status">
          <SalesStatusBadge status={doc.status} />
        </DetailRow>
        <DetailRow label="Client">{clientName || '—'}</DetailRow>
        <DetailRow label="Customer PO">{doc.poRef || '—'}</DetailRow>
        <DetailRow label="Contract Date">
          {doc[config.dateKey] ? formatDate(doc[config.dateKey]) : '—'}
        </DetailRow>
        <DetailRow label="Validity">{doc.validity ? formatDate(doc.validity) : '—'}</DetailRow>
        <DetailRow label="Sales Executive">{doc.salesExecutive || '—'}</DetailRow>
        <DetailRow label="Created">{doc.createdAt ? formatDate(doc.createdAt) : '—'}</DetailRow>
        <DetailRow label="Last Updated">
          {doc.updatedAt ? formatDateTime(doc.updatedAt) : '—'}
        </DetailRow>
      </DetailCard>

      {items.length > 0 && (
        <DetailCard icon={Banknote} title="Financial Summary">
          <DetailRow label="Subtotal">{formatINR(Number(totals.subTotal) || 0)}</DetailRow>
          <DetailRow label="Discount">{formatINR(Number(totals.discount) || 0)}</DetailRow>
          <DetailRow label="Tax">{formatINR(Number(totals.taxTotal) || 0)}</DetailRow>
          <DetailRow label="Charges">{formatINR(Number(totals.charges) || 0)}</DetailRow>
          <DetailRow label="Grand Total">
            <span className="text-sm font-bold text-[#0B4A3D]">{formatINR(Number(grandTotal) || 0)}</span>
          </DetailRow>
        </DetailCard>
      )}

      <DetailCard icon={Link2} title="Linked Records" count={linkedDocs.length || null}>
        {linkedDocs.length === 0 ? (
          <p className="text-xs font-semibold text-slate-400">No linked records for this contract.</p>
        ) : (
          linkedDocs.map((link) => (
            <DetailRow key={link.label} label={link.label}>
              {link.onClick ? <DetailLink onClick={link.onClick}>{link.value}</DetailLink> : link.value || '—'}
            </DetailRow>
          ))
        )}
      </DetailCard>
    </>
  );

  return (
    /* `erp-detail-scope` opts this page into the shared detail-page action
       standard (styles/erp-detail-scope.css): its DetailHeader renders the
       `erp-detail-actions` family, so Back / Edit / PDF / Print / More get
       the reference geometry, exactly like the CRM view pages. */
    <DetailPage className="erp-detail-scope">
      <DetailBreadcrumb
        items={[
          { label: 'Sales Execution', to: '/sales' },
          { label: 'Sales Contracts', to: '/sales-contracts' },
          { label: no || doc.id }
        ]}
      />

      <DetailHeader
        initial="SC"
        title={no || doc.id}
        titleSuffix={clientName ? `· ${clientName}` : undefined}
        onBack={() => navigate(config.listRoute)}
        backLabel="Back"
        busy={actionLoading}
        actions={headerActions}
        moreActions={moreActions}
        chips={[
          <span key="no" className="inline-flex items-center gap-1 text-xs text-slate-500">
            <FileText className="w-3 h-3 text-[#0B4A3D]" /> {no || doc.id}
          </span>,
          <SalesStatusBadge key="status" status={doc.status} />,
          isHistorical ? (
            <DetailBadge key="historical" tone="amber">Historical revision · Read only</DetailBadge>
          ) : null,
          /* Obvious way back to the editable current version. */
          isHistorical && currentRevisionRoute ? (
            <button
              key="current-version"
              type="button"
              onClick={() => navigate(currentRevisionRoute)}
              className="inline-flex items-center gap-1 rounded-full border border-[#0B4A3D]/25 bg-[#E8F0EE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B4A3D] hover:bg-[#dbe9e5] transition-colors cursor-pointer"
            >
              <GitBranch className="w-3 h-3" /> Go to Current version
            </button>
          ) : null,
          <EditCountBadge key="edits" moduleKey={config.moduleKey} recordId={id} />
        ]}
        meta={[
          <span key="date" className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(doc[config.dateKey] || doc.createdAt)}
          </span>,
          clientName ? (
            <span key="client" className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3 text-[#0B4A3D]" /> {clientName}
            </span>
          ) : null,
          <span key="amount" className="inline-flex items-center gap-1">
            <Banknote className="w-3 h-3 text-[#0B4A3D]" /> {formatINR(Number(grandTotal) || 0)}
          </span>,
          doc.salesExecutive ? (
            <span key="owner" className="inline-flex items-center gap-1">
              <ClipboardList className="w-3 h-3 text-[#0B4A3D]" /> {doc.salesExecutive}
            </span>
          ) : null
        ]}
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />

      <DetailTwoColumn rail={summaryRail}>
        {tab === 'overview' && (
          <>
            <DetailCard icon={Info} title="Contract Details">
              {detailsRows.map(([label, value]) => (
                <DetailRow key={label} label={label} change={changeFor(label)}>{value}</DetailRow>
              ))}
              <DetailRow label="Status"><SalesStatusBadge status={doc.status} /></DetailRow>
              <DetailRow label="Created Date">{doc.createdAt ? formatDate(doc.createdAt) : '—'}</DetailRow>
              <DetailRow label="Last Updated">{doc.updatedAt ? formatDate(doc.updatedAt) : '—'}</DetailRow>
            </DetailCard>

            {(termsRows.length > 0 || doc.terms) && (
              <DetailCard icon={Calendar} title="Contract Terms">
                {termsRows.length > 0 ? (
                  <DetailFieldGrid
                    fields={termsRows.map(([label, value]) => ({ label, value, change: changeFor(label) }))}
                    className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3"
                  />
                ) : null}
                {doc.terms ? (
                  <div className="pt-2">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Terms &amp; Conditions</div>
                    <p className="text-xs font-medium text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{doc.terms}</p>
                  </div>
                ) : null}
              </DetailCard>
            )}

            {(doc.notes || doc.remarks) && (
              <DetailCard icon={StickyNote} title="Notes">
                {doc.notes ? (
                  <div className="mb-3">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Notes</div>
                    <p className="text-xs font-medium text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{doc.notes}</p>
                  </div>
                ) : null}
                {doc.remarks ? (
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Remarks</div>
                    <p className="text-xs font-medium text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{doc.remarks}</p>
                  </div>
                ) : null}
              </DetailCard>
            )}
          </>
        )}

        {tab === 'items' && (
          <DetailCard icon={Package} title="Items" count={items.length ? `${items.length} items` : null}>
            {items.length === 0 ? (
              <DetailEmpty icon={Package} title="No Items" subtitle="This contract has no item lines." />
            ) : (
              /* Columns come from the Sales Contract item grid's saved MySQL
                 configuration — the same columns the edit form uses. */
              <DynamicDetailTable
                columns={itemColumns}
                rows={itemRows}
                wrapClassName="overflow-x-auto border border-slate-200 rounded-lg"
                className="w-full border-collapse"
                headerCellClass="py-2.5 px-3 text-[11px] font-bold text-slate-500"
                bodyCellClass="py-2.5 px-3 text-xs text-slate-600 border-b border-slate-100"
                minWidth={960}
                emptyNoun="items"
                rowClassName={itemRowClass}
                footer={(colCount, cols) => {
                  const amountIdx = cols.findIndex((c) => c.key === 'amount' || c.key === 'total');
                  const valueCol = amountIdx >= 0 ? amountIdx : Math.max(0, colCount - 1);
                  const labelSpan = Math.max(1, valueCol);
                  const tailSpan = Math.max(0, colCount - labelSpan - 1);
                  return (
                    <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                      <td colSpan={labelSpan} className="py-2.5 px-3 text-right text-[13px] font-bold text-slate-500">Grand Total</td>
                      <td className="py-2.5 px-3 text-right text-sm font-bold text-[#0B4A3D] whitespace-nowrap">{formatINR(Number(grandTotal) || 0)}</td>
                      {tailSpan > 0 ? <td colSpan={tailSpan} /> : null}
                    </tr>
                  );
                }}
              />
            )}
          </DetailCard>
        )}

        {tab === 'revisions' && (
          <>
            {revisions.length > 0 && (
              <DetailCard icon={GitBranch} title="Revision Chain" count={`${revisions.length} versions`}>
                {/* What makes THIS version different from the one before it.
                    Shown here and on a historical revision; never on a normal
                    current view. */}
                <div className="mb-4">
                  <VersionComparison
                    comparison={version.comparison}
                    direction={version.direction}
                    loading={version.loading}
                    unavailable={version.unavailable}
                    selectedLabel={version.selected ? `Revision ${version.selected.revision}` : ''}
                    currentHref={isHistorical ? currentRevisionRoute : null}
                    onGoToCurrent={currentRevisionRoute ? () => navigate(currentRevisionRoute) : null}
                  />
                </div>
                <RevisionHistoryTable
                  revisions={revisions}
                  docNumber={no}
                  currentId={doc.id}
                  viewRoute={(rev) => config.viewRoute(rev)}
                  navigate={navigate}
                />
              </DetailCard>
            )}
            {versionHistory.length > 0 && (
              <DetailCard icon={History} title="Revision History" count={`${versionHistory.length} records`}>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                    <thead>
                      <tr className="bg-slate-50">
                        <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Rev</th>
                        <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Date</th>
                        <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">From</th>
                        <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">To</th>
                        <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Changed By</th>
                        <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versionHistory.slice().reverse().map((h, i) => (
                        <tr key={`${h.createdAt}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                          <td className="py-2.5 px-3 text-xs font-bold text-slate-700">v{versionHistory.length - i}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-500">{formatDateTime(h.createdAt)}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{cpoText(h.oldValue) || '—'}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{cpoText(h.newValue) || '—'}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{h.changedBy || 'Admin'}</td>
                          <td className="py-2.5 px-3 text-xs text-slate-600">{cpoText(h.field) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DetailCard>
            )}
            {revisions.length === 0 && versionHistory.length === 0 && (
              <DetailCard icon={GitBranch} title="Revisions">
                <DetailEmpty icon={GitBranch} title="No Revisions" subtitle="This contract has no revision history yet." />
              </DetailCard>
            )}
          </>
        )}

        {tab === 'linked' && (
          <DetailCard icon={Link2} title="Linked Documents" count={linkedDocs.length || null}>
            {linkedDocs.length === 0 ? (
              <p className="text-xs font-semibold text-slate-400 mb-3">No linked records for this contract.</p>
            ) : (
              linkedDocs.map((link) => (
                <DetailRow key={link.label} label={link.label}>
                  {link.onClick ? (
                    <DetailLink onClick={link.onClick}>
                      <span className="inline-flex items-center gap-1">
                        {link.value} <FileText className="w-3 h-3" />
                      </span>
                    </DetailLink>
                  ) : (
                    link.value || '—'
                  )}
                </DetailRow>
              ))
            )}
            <div className="pt-4">
              <DocumentWorkflow
                moduleKey="salesContract"
                docId={id}
                docNo={no}
                stages={SALES_CONTRACT_WORKFLOW_STAGES}
                nextActions={SALES_CONTRACT_WORKFLOW_ACTIONS}
              />
            </div>
          </DetailCard>
        )}

        {tab === 'timeline' && (
          <DetailCard icon={History} title="Timeline" count={`${timelineEvents.length} events`}>
            {editHistory.length > 0 && (
              <div className="mb-3">
                <EditHistoryTimeline moduleKey={config.moduleKey} recordId={id} limit={10} />
              </div>
            )}
            {timelineEvents.length === 0 ? (
              <DetailEmpty icon={Clock} title="No Timeline Events" subtitle="Nothing has happened on this contract yet." />
            ) : (
              <>
                {timelineEvents.slice(0, 6).map((event) => (
                  <TimelineEvent key={`${event.title}-${event.date}`} event={event} />
                ))}
                {timelineEvents.length > 6 && (
                  <div className="text-center pt-3 text-xs font-semibold text-[#0B4A3D]">
                    +{timelineEvents.length - 6} more events
                  </div>
                )}
              </>
            )}
          </DetailCard>
        )}

        {tab === 'activities' && (
          <DetailCard icon={ClipboardList} title="Activity Log" count={`${activityEvents.length} records`}>
            {activityEvents.length === 0 ? (
              <DetailEmpty icon={ClipboardList} title="No Activity Recorded" subtitle="No field changes have been logged." />
            ) : (
              activityEvents.slice(0, 8).map((a, i) => (
                <ActivityRow key={`${a.text}-${a.date}-${i}`} event={a} />
              ))
            )}
          </DetailCard>
        )}

        {tab === 'approval' && (
          <DetailCard icon={CheckCheck} title="Approval History" count={`${activityEvents.length} records`}>
            {activityEvents.length === 0 ? (
              <DetailEmpty icon={History} title="No Approval Activity" subtitle="This contract has not been submitted or approved yet." />
            ) : (
              activityEvents.slice(0, 5).map((a, i) => (
                <ActivityRow key={`${a.text}-${a.date}-${i}`} event={a} tone="green" />
              ))
            )}
          </DetailCard>
        )}

        {tab === 'attachments' && (
          <DetailCard icon={Paperclip} title="Attachments" count={`${attachments.length} files`}>
            <SalesAttachments service={config.service} docId={id} attachments={attachments} onChanged={load} />
          </DetailCard>
        )}
      </DetailTwoColumn>

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
    </DetailPage>
  );
}
