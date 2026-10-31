import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { ActionMenu, useCurrentUser } from '../Common';
import { detailActionClass } from '../Common/detailActionClasses';
import DynamicDetailTable from '../GridColumns/DynamicDetailTable';
import { ColumnResizer, ManageColumnsButton } from '../GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { DETAIL_COLUMN_SETS, detailColumnsFor, detailRows, itemColumnSetForModule } from '../../utils/detailColumns';
import {
  Activity,
  Archive,
  ArrowLeft,
  Calendar,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Eye,
  FileDown,
  FileText,
  GitBranch,
  History,
  Info,
  IndianRupee,
  Layers,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Share2,
  StickyNote,
  Tag,
  Trash2,
  Truck,
  User
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../Common';
import SalesStatusBadge from '../SalesTable/SalesStatusBadge';
import SalesAttachments from './SalesAttachments';
import DocumentWorkflow from './DocumentWorkflow';
import {
  ACTIVITY_ICONS,
  CardButton,
  CardHeader,
  ChangeHint,
  changeTintClass,
  EmptyState,
  KpiCard,
  Row,
  TimelineEvent,
  buildActivityEvents,
  buildTimelineEvents,
  formatBytes
} from './salesViewShared';
import EditCountBadge from '../EditHistory/EditCountBadge';
import EditHistoryTimeline from '../EditHistory/EditHistoryTimeline';
import RevisionHistoryTable from '../EditHistory/RevisionHistoryTable';
import VersionComparison from '../EditHistory/VersionComparison';
import { fetchEditHistory } from '../../utils/editHistory';
import useVersionComparison from '../../hooks/useVersionComparison';
import { changeByLabel, itemIdentity, labelKey } from '../../utils/versionDiff';
import { downloadFile, openFileInNewTab } from '../../utils/fileAccess';
import { formatDate, formatDateTime, formatINR, formatRelativeTime } from '../../utils/leadHelpers';
import { computeTotals, cpoNo, cpoText, docNumber, emailDocument, shareDocument, whatsappDocument } from '../../utils/salesHelpers';

/**
 * Header actions that live in the ⋯ More menu instead of the front row.
 * The front row is the ERP standard — Back, Edit, Print, PDF plus the
 * status-driven workflow actions (Send / Submit / Approve / Issue / Cancel)
 * and the document conversions. Everything here is utility or rare: still
 * fully wired to its existing handler, just one click further in.
 */
const HEADER_OVERFLOW_KEYS = [
  'duplicate',
  'preview',
  'share',
  'email',
  'whatsapp',
  'archive',
  'delete'
];
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import '../../pages/crm/crm-erp.css';

function initialOf(name = '') {
  return (name || 'D').charAt(0).toUpperCase();
}

/**
 * Generic view page for a Sales Execution module.
 * config:
 *  - service, moduleKey, title, label, listRoute, editRoute
 *  - normalize(row)
 *  - generalRows(doc) -> [[label, node], ...]
 *  - headerInfo(doc) -> [tag, ...] rendered next to the badge
 *  - linkedDocs(doc) -> [{ label, value, onClick }]
 *  - printHtml(doc) / exportPdf(doc)  (optional document renderers)
 */
export default function SalesViewPage({ config }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'overview');
  const [confirm, setConfirm] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { isAdmin, canDeleteSales } = useCurrentUser();
  const [editHistory, setEditHistory] = useState([]);

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
    // Clear previous record immediately so stale data never flashes when
    // navigating between records of the same module.
    setDoc(null);
    setLoading(true);
    setNotFound(false);
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
        : buildTimelineEvents(doc, cpoNo(docNumber(doc, config.moduleKey)), config.title);
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
    return buildActivityEvents(doc, cpoNo(docNumber(doc, config.moduleKey)));
  }, [doc, config]);

  // ---- Item tables use the SAME persisted column configuration the
  // creation/edit grids write to MySQL (grid config store, keyed by the
  // module's grid variant), and expose the shared Manage Columns toolkit
  // (rename / reorder / hide / show / add / remove custom / reset) plus
  // drag-to-resize. Every change round-trips React → Spring Boot → MySQL —
  // never localStorage. A historical revision is read-only, so the toolkit is
  // disabled there and the saved configuration is rendered as-is.
  // NOTE: called before any conditional return so the hook order stays stable.
  const docItems = Array.isArray(doc?.items) ? doc.items : [];
  const isHistorical = doc?.latestRevision === false;

  // ---- Version comparison (historical revisions + the Version History pane).
  // The chain, this version and the version immediately before it come from
  // the SAME detail response the page already loaded; the previous snapshot is
  // fetched through the module service only while a version is actually being
  // inspected, so a normal document view costs no extra request.
  const version = useVersionComparison({
    service: config.service,
    doc,
    normalize: config.normalize,
    enabled: Boolean(doc) && (isHistorical || tab === 'version-history')
  });
  // Changed-field lookup for the document's own rows. Empty unless a
  // historical revision is on screen, so a normal view is never tinted.
  const changedFields = useMemo(
    () => (isHistorical ? changeByLabel(version.comparison) : new Map()),
    [isHistorical, version.comparison]
  );
  const changeFor = useCallback(
    (label) => changedFields.get(labelKey(label)) || null,
    [changedFields]
  );
  // Route back to the editable current version (historical views only).
  const currentRevisionRoute = useMemo(() => {
    if (!config.viewRoute) return null;
    const latest = version.chain.find((rev) => rev.latestRevision) || version.chain[version.chain.length - 1];
    return latest ? config.viewRoute(latest) : null;
  }, [config, version.chain]);
  // Line items that changed in the revision on screen, matched by business
  // identity (a revision copies rows, so row ids differ between versions).
  const changedItemRows = useMemo(() => {
    const map = new Map();
    if (!isHistorical || !version.comparison) return map;
    version.comparison.items.modified.forEach((row) => map.set(row.key, 'modified'));
    version.comparison.items.added.forEach((row) => map.set(row.key, 'added'));
    return map;
  }, [isHistorical, version.comparison]);
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

  const itemSetName = itemColumnSetForModule(config.moduleKey, doc) || 'invoiceItems';
  // The exact MySQL grid keys the creation/edit grids persist to — the same
  // configuration therefore drives both surfaces.
  const itemGridKey = DETAIL_COLUMN_SETS[itemSetName]?.gridKey || null;
  const itemGrid = useManagedGrid({
    gridKey: itemGridKey,
    defaults: () => detailColumnsFor(itemSetName),
    // The saved configuration ALWAYS drives the rendering (module grid config
    // from MySQL); only the management toolbar is disabled on read-only
    // historical revisions.
    enabled: true,
    // S.No + Actions are structural: reorderable/hideable is fine elsewhere but
    // they must never be renamed or removed.
    protectedKeys: ['checkbox', 'sno', 'actions'],
    insertBeforeKeys: ['actions'],
    itemNoun: 'row',
    rowCount: docItems.length
  });

  // The Actions column carries no meaning on a read-only surface — dropped from
  // the RENDER only (it stays in the saved configuration above).
  const itemColumns = itemGrid.visibleColumns.filter((c) => c.key !== 'actions');
  const itemRows = detailRows(docItems);

  if (loading) {
    return (
      <div className="purchase-page cpr-page">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="purchase-page cpr-page">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <span className="bc-current">{config.titlePlural || config.title}</span>
        </nav>
        <div className="prm-card prm-card-body p-10 text-center">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">{config.title} Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">The {config.title.toLowerCase()} you are looking for does not exist.</p>
          <button
            type="button"
            onClick={() => navigate(config.listRoute)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to {config.title} List
          </button>
        </div>
      </div>
    );
  }

  const status = String(doc.status || 'draft').toLowerCase();
  // `isHistorical` is resolved above (before the hooks) so the column toolkit
  // and the mutating actions agree on whether this revision is read-only.
  const items = docItems;
  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  const no = cpoNo(docNumber(doc, config.moduleKey));
  const totals = computeTotals(items, {
    discountPct: doc.discountPct ?? doc.discount ?? 0,
    // quotation freight + insurance are part of the grand total (backend recalcTotals adds them)
    charges: (doc.charges ?? 0) + (doc.freight ?? 0) + (doc.insurance ?? 0),
    roundOffEnabled: config.moduleKey === 'invoice'
  });

  // The stored release / procurement method (a real sales_orders column).
  const releaseMethodRaw = String(doc.releaseMethod || '').trim();
  const releaseMethodLabel = releaseMethodRaw || '—';

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

  const headerActions = [];
  if (want('edit') && !isHistorical && status !== 'deleted' && status !== 'archived' && status !== 'cancelled' && status !== 'converted' && status !== 'completed') {
    headerActions.push({ key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(config.editRoute(doc)) });
  }
  if (want('duplicate') && !isHistorical && status !== 'deleted') {
    headerActions.push({ key: 'duplicate', label: 'Duplicate', icon: Copy, style: 'ghost', action: () => runAction(() => config.service.duplicate(id), `${config.title} duplicated`) });
  }
  if (!isHistorical && config.headerActions) {
    headerActions.push(...config.headerActions(doc, { runAction, navigate, toast }));
  }
  // Preview: modules that define a design workspace open the full
  // Quotation-Preview-style editor; otherwise it falls back to print preview.
  if (want('preview')) {
    headerActions.push({
      key: 'preview',
      label: 'Preview',
      icon: Eye,
      style: 'ghost',
      action: config.designRoute ? () => navigate(config.designRoute(doc)) : handlePrint
    });
  }
  if (want('print')) headerActions.push({ key: 'print', label: 'Print', icon: Printer, style: 'ghost', action: handlePrint });
  if (want('pdf')) headerActions.push({ key: 'pdf', label: 'Download PDF', icon: FileDown, style: 'ghost', action: handlePdf });
  if (want('share')) headerActions.push({ key: 'share', label: 'Share', icon: Share2, style: 'ghost', action: handleShare });
  if (want('email')) headerActions.push({ key: 'email', label: 'Email', icon: Mail, style: 'ghost', action: handleEmail });
  if (want('whatsapp')) headerActions.push({ key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, style: 'ghost', action: handleWhatsApp });
  if (status !== 'deleted' && !isHistorical) {
    if (want('archive')) {
      headerActions.push({
        key: 'archive',
        label: status === 'archived' ? 'Restore' : 'Archive',
        icon: status === 'archived' ? RotateCcw : Archive,
        style: 'ghost',
        action: () => setConfirm(status === 'archived' ? 'restore' : 'archive')
      });
    }
    // Delete (to trash) is a SALES_DELETE action — not offered without it.
    if (want('delete') && canDeleteSales) headerActions.push({ key: 'delete', label: 'Delete', icon: Trash2, style: 'danger', action: () => setConfirm('delete') });
  }

  // The front row keeps the ERP layout — Back / Edit / Print / PDF plus the
  // status-driven workflow actions (Send, Submit, Approve, Issue, Cancel) and
  // the document conversions. Utility and rare actions (Duplicate, Preview,
  // Share, Email, WhatsApp, Archive/Restore, Delete) move into the ⋯ More
  // menu; each still calls the same handler the button used to.
  const visibleHeaderActions = headerActions.filter(
    (action) =>
      !HEADER_OVERFLOW_KEYS.includes(action.key) &&
      !(['approve', 'submit', 'issue'].includes(action.key) && !isAdmin)
  );
  // The ⋯ More menu shares the same SALES_DELETE gate as the front row, so a
  // delete can never be reached through the overflow menu instead.
  const moreHeaderActions = headerActions.filter(
    (action) =>
      HEADER_OVERFLOW_KEYS.includes(action.key) &&
      !(action.key === 'delete' && !canDeleteSales)
  );

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

  const TABS =
    config.viewTabs || [
      { key: 'overview', label: 'Overview', icon: Layers, count: null },
      ...(config.showItems !== false ? [{ key: 'items', label: 'Items', icon: Package, count: items.length }] : []),
      { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
      // Version History is a DEFAULT tab, not an opt-in one: every Sales
      // document keeps a revision chain, so the chain (and the comparison
      // against the preceding version) must be reachable from every module that
      // renders through this shared page — previously only the Quotation view
      // declared the tab, which left the revision chain unreachable for the
      // other six documents.
      { key: 'version-history', label: 'Version History', icon: GitBranch, count: (doc?.revisions || []).length || null },
      { key: 'timeline', label: 'Timeline', icon: History, count: timelineEvents.length },
      { key: 'activities', label: 'Activity Log', icon: ClipboardList, count: null },
      // The Overview already surfaces Linked Documents in its rail; the full
      // module list is one click away (and reachable again from the tabs).
      ...(config.overviewComplete && config.linkedDocs
        ? [{ key: 'linked-documents', label: 'Linked Documents', icon: Link2, count: linkedDocs.length }]
        : [])
    ];
  const allTabs = config.extraTabs ? [...TABS, ...config.extraTabs] : TABS;
  const versionHistory = Array.isArray(doc.history) ? doc.history : [];
  const approvalSteps = ['draft', 'sent', 'accepted', 'rejected', 'converted'];
  const approvalStatus = String(doc.status || 'draft').toLowerCase();
  const approvalIdx = approvalSteps.indexOf(approvalStatus);

  const generalRows = config.generalRows ? config.generalRows(doc) : [];

  return (
    /* `erp-detail-scope` opts every Sales Execution detail page (Invoice,
       Sales Contract, CPO, Proforma, Delivery Challan, Credit Note, Payment
       Receipt — all render through this shared component) into the shared
       detail-page action standard (styles/erp-detail-scope.css): the same
       class family the CRM view pages use, so Back / Print / Download / More
       get the reference's geometry instead of unstyled inline-blocks. */
    <div className="erp-detail-scope purchase-page cpr-page">
      {/* ===== BREADCRUMB (Sales → Sales Execution → [Module] → [Doc]) ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate(config.listRoute)}>{config.titlePlural || config.title}</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="bc-current">{no || doc.id}</span>
      </nav>

      {/* ===== STICKY HEADER (PR design) ===== */}
      <div className="sticky top-0 z-20 bg-app">
        <div className="prm-card prm-card-body">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-[#083D34] to-[#083D34] text-white flex items-center justify-center text-xl font-bold shrink-0">
                {initialOf(doc.clientName || doc.client)}
              </div>
              <div className="min-w-0">
                <h1 className="pr-page-header-title">
                  {config.icon && <config.icon aria-hidden="true" />}
                  {doc.clientName || doc.client || config.title}{' '}
                  <span className="text-slate-400 font-semibold">({no || doc.id})</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Tag className="w-3 h-3 text-[#0B4A3D]" /> {no || doc.id}
                  </span>
                  <SalesStatusBadge status={doc.status} />
                  {isHistorical && (
                    <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                      Historical revision · Read only
                    </span>
                  )}
                  {/* Obvious way back to the editable current version. */}
                  {isHistorical && currentRevisionRoute && (
                    <button
                      type="button"
                      onClick={() => navigate(currentRevisionRoute)}
                      className="inline-flex items-center gap-1 rounded-full border border-[#0B4A3D]/25 bg-[#E8F0EE] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0B4A3D] hover:bg-[#dbe9e5] transition-colors cursor-pointer"
                    >
                      <GitBranch className="w-3 h-3" /> Go to Current version
                    </button>
                  )}
                  <EditCountBadge moduleKey={config.moduleKey} recordId={id} />
                  {config.headerInfo ? config.headerInfo(doc) : null}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(doc[config.dateKey] || doc.createdAt)}
                  </span>
                </div>
              </div>
            </div>
            <div className="erp-detail-actions">
              <button
                type="button"
                onClick={() => navigate(config.listRoute)}
                className="erp-detail-action"
              >
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
                  buttonLabel={`More ${config.title} actions`}
                  label="More"
                />
              )}
            </div>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex items-center gap-1 border-b-2 border-slate-200 mt-3 overflow-x-auto no-scrollbar">
          {allTabs.map((t) => {
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
        <div className="mt-4">
        {/* Summary tiles — every value is a real count/value read off THIS
            record (items, attachments, linked docs, totals, release method,
            status). Nothing is hardcoded. */}
        {config.overviewComplete && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-4">
            <KpiCard icon={Package} label="Items" value={items.length} linkLabel="View Items" onClick={() => setTab('items')} />
            <KpiCard icon={Paperclip} label="Attachments" value={attachments.length} linkLabel="View Attachments" onClick={() => setTab('attachments')} />
            <KpiCard icon={Link2} label="Linked Documents" value={linkedDocs.length} linkLabel="View Documents" onClick={() => setTab('linked-documents')} />
            <KpiCard icon={IndianRupee} label="Total Amount" value={formatINR(totals.grandTotal, doc.currency)} linkLabel="View Breakdown" onClick={() => setTab('items')} />
            <KpiCard icon={Truck} label="Release Method" value={releaseMethodLabel} linkLabel="View Release" onClick={() => setTab('overview')} />
            <KpiCard icon={Activity} label="Current Status" value={<SalesStatusBadge status={doc.status} />} linkLabel="View Timeline" onClick={() => setTab('timeline')} />
          </div>
        )}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
          {/* min-w-0: a grid item defaults to min-width:auto, which floors the
              track at its content's min-content width. The items table is
              ~1510px wide, so the `1fr` track blew out to ~1545px and pushed
              the 340px Linked Documents rail past the viewport (page-level
              horizontal overflow). Allowing the track to shrink lets the
              table scroll inside its own existing overflow-x-auto wrapper. */}
          <div className="flex flex-col gap-4 min-w-0">
            <div className="prm-card prm-card-body">
              <CardHeader
                icon={Info}
                title="General Information"
                action={!isHistorical && config.editRoute ? (
                  <CardButton icon={Pencil} label="Edit" onClick={() => navigate(config.editRoute(doc))} />
                ) : null}
              />
              {generalRows.map(([label, value]) => (
                <Row key={label} label={label} change={changeFor(label)}>{value}</Row>
              ))}
              <Row label="Status" change={changeFor('Status')}><SalesStatusBadge status={doc.status} /></Row>
              {doc.createdAt && <Row label="Created Date">{formatDate(doc.createdAt)}</Row>}
              {doc.updatedAt && <Row label="Last Updated">{formatDate(doc.updatedAt)}</Row>}
            </div>

            <div className="prm-card prm-card-body">
              <CardHeader
                icon={User}
                title="Customer Details"
                action={!isHistorical && config.editRoute ? (
                  <CardButton icon={Pencil} label="Edit" onClick={() => navigate(config.editRoute(doc))} />
                ) : null}
              />
              <Row label="Client" change={changeFor('Client')}>{doc.clientName || '—'}</Row>
              <Row label="Contact Person" change={changeFor('Contact Person')}>{doc.contactPerson || '—'}</Row>
              <Row label="Phone" change={changeFor('Phone')}>{doc.phone || '—'}</Row>
              <Row label="Email" change={changeFor('Email')}>
                {doc.email ? (
                  <a href={`mailto:${doc.email}`} className="text-[#0B4A3D] font-medium hover:underline">{doc.email}</a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="GSTIN" change={changeFor('GSTIN')}>{doc.gstin || '—'}</Row>
              {doc.pan && <Row label="PAN" change={changeFor('PAN')}>{doc.pan}</Row>}
            </div>

            {(config.addressCards && (doc.billingAddress || doc.shippingAddress)) && (
              <>
                {doc.billingAddress && (
                  <div className="prm-card prm-card-body">
                    <CardHeader icon={MapPin} title="Billing Address" />
                    <div className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {doc.billingAddress}
                      {[doc.billingCity, doc.billingState, doc.billingPin].filter(Boolean).join(', ') && (
                        <span className="block mt-1 text-slate-500">
                          {[doc.billingCity, doc.billingState, doc.billingPin].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
                {doc.shippingAddress && (
                  <div className="prm-card prm-card-body">
                    <CardHeader icon={Truck} title="Shipping Address" />
                    <div className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {doc.shippingAddress}
                      {[doc.shippingCity, doc.shippingState, doc.shippingPin].filter(Boolean).join(', ') && (
                        <span className="block mt-1 text-slate-500">
                          {[doc.shippingCity, doc.shippingState, doc.shippingPin].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Module-contributed overview cards — for the Customer Purchase
                Order this is the Release & Procurement Method block plus the
                Action / Release Instructions. It sits with the other
                order-level cards, above the line items. */}
            {config.overviewExtra
              ? config.overviewExtra(doc, {
                  items,
                  attachments,
                  linkedDocs,
                  totals,
                  releaseMethodLabel,
                  isHistorical,
                  editRoute: config.editRoute,
                  navigate
                })
              : null}

            {config.showItemsInOverview && items.length > 0 && (
              <div className="prm-card prm-card-body">
                <CardHeader icon={Package} title="Items" count={`${items.length} items`} />
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <DynamicDetailTable
                    columns={itemColumns}
                    rows={itemRows}
                    className="w-full border-collapse"
                    wrapClassName=""
                    minWidth={760}
                    emptyNoun="items"
                    rowClassName={itemRowClass}
                    headerCellClass="py-2 px-2 text-[11px] font-bold text-slate-500 bg-slate-50"
                    bodyCellClass="py-2 px-2 text-xs text-slate-600 border-b border-slate-100"
                  />
                </div>
              </div>
            )}

            {/* Customer Purchase Order Overview: the CPO Items table, rendered
                from the SAME persisted column configuration the creation/edit
                item grid writes to MySQL, and manageable in place (Manage
                Columns + drag-to-resize). The table scrolls horizontally
                inside its own container — headers never break vertically and
                cells are never clipped. */}
            {config.overviewComplete && (
              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={Package}
                  title="Items"
                  count={items.length}
                  action={
                    <>
                      {!isHistorical && config.editRoute && (
                        <CardButton icon={Plus} label="Add Item" onClick={() => navigate(config.editRoute(doc))} title="Add or edit items on this Customer Purchase Order" />
                      )}
                      {itemGridKey && !isHistorical && <ManageColumnsButton manager={itemGrid.manager} />}
                    </>
                  }
                />
                {items.length === 0 ? (
                  <EmptyState icon={Package} title="No Items" subtitle="No items have been added to this Customer Purchase Order." />
                ) : (
                  <DynamicDetailTable
                    columns={itemColumns}
                    rows={itemRows}
                    className="w-full border-collapse"
                    wrapClassName="overflow-x-auto border border-slate-200 rounded-lg"
                    minWidth={itemGrid.resize.totalWidth(itemColumns) || 760}
                    resolveWidth={(col) => itemGrid.resize.widthOf(col)}
                    headerExtra={(col) => (isHistorical ? null : <ColumnResizer column={col} resize={itemGrid.resize} />)}
                    emptyNoun="items"
                    rowClassName={itemRowClass}
                    headerCellClass="py-2 px-2 text-[11px] font-bold text-slate-500 bg-slate-50"
                    bodyCellClass="py-2 px-2 text-xs text-slate-600 border-b border-slate-100"
                  />
                )}
              </div>
            )}

            {!config.overviewComplete && (doc.terms || doc.notes || doc.remarks) && (
              <div className="prm-card prm-card-body">
                <CardHeader icon={StickyNote} title="Terms & Notes" />
                {doc.terms && (
                  <div className={`text-[13px] text-slate-500 leading-relaxed whitespace-pre-wrap mb-2 ${changeTintClass(changeFor('Terms & Conditions'))}`}>
                    <span className="font-bold text-slate-700">Terms &amp; Conditions</span> — {doc.terms}
                    <ChangeHint change={changeFor('Terms & Conditions')} />
                  </div>
                )}
                {doc.notes && <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap mb-2">{doc.notes}</div>}
                {doc.remarks && (
                  <div className={`text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap ${changeTintClass(changeFor('Remarks'))}`}>
                    {doc.remarks}
                    <ChangeHint change={changeFor('Remarks')} />
                  </div>
                )}
              </div>
            )}

            {/* Order Terms & Conditions + Remarks / Internal Notes — the CPO
                Overview keeps the two apart instead of merging them. */}
            {config.overviewComplete && (doc.terms || doc.notes) && (
              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={StickyNote}
                  title="Order Terms & Conditions"
                  action={!isHistorical && config.editRoute ? (
                    <CardButton icon={Pencil} label="Edit" onClick={() => navigate(config.editRoute(doc))} />
                  ) : null}
                />
                {doc.terms && <div className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">{doc.terms}</div>}
                {doc.notes && <div className="text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap mt-2">{doc.notes}</div>}
              </div>
            )}

            {config.overviewComplete && doc.remarks && (
              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={MessageCircle}
                  title="Remarks / Internal Notes"
                  action={!isHistorical && config.editRoute ? (
                    <CardButton icon={Pencil} label="Edit" onClick={() => navigate(config.editRoute(doc))} />
                  ) : null}
                />
                <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{doc.remarks}</div>
              </div>
            )}

            {/* Module-contributed overview cards (Customer Purchase Order:
                Release & Procurement Method / Action instructions). */}
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-40">
            {config.showItems !== false && (
              <div className="prm-card prm-card-body">
                <CardHeader icon={Package} title="Totals" />
                <div className="flex flex-col">
                  <Row label="Sub Total" change={changeFor('Sub Total')}><strong>{formatINR(totals.subTotal, doc.currency)}</strong></Row>
                  {Number(totals.discount) > 0 && <Row label="Discount" change={changeFor('Discount')}>− {formatINR(totals.discount, doc.currency)}</Row>}
                  {Number(totals.cgstTotal) > 0 && <Row label="CGST" change={changeFor('CGST')}>{formatINR(totals.cgstTotal, doc.currency)}</Row>}
                  {Number(totals.sgstTotal) > 0 && <Row label="SGST" change={changeFor('SGST')}>{formatINR(totals.sgstTotal, doc.currency)}</Row>}
                  {Number(totals.charges) > 0 && <Row label="Charges" change={changeFor('Charges')}>{formatINR(totals.charges, doc.currency)}</Row>}
                  <div className="flex justify-between py-2 mt-1 border-t-2 border-[#0B4A3D] text-[13px]">
                    <span className="font-bold text-slate-800">Grand Total</span>
                    <span className="font-extrabold text-[#0B4A3D]">{formatINR(totals.grandTotal, doc.currency)}</span>
                  </div>
                </div>
                {config.summaryRows ? config.summaryRows(doc, totals) : null}
              </div>
            )}
            <div className="prm-card prm-card-body">
                <CardHeader
                  icon={Link2}
                  title="Linked Documents"
                  count={linkedDocs.length}
                  action={linkedDocs.length > 0 ? (
                    <CardButton label="View All" onClick={() => setTab('linked-documents')} />
                  ) : null}
                />
              {linkedDocs.length > 0 ? (
                linkedDocs.map((link) => (
                  <Row key={link.label} label={link.label}>
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 min-w-0">
                      {link.onClick ? (
                        <button
                          type="button"
                          onClick={link.onClick}
                          className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                        >
                          {link.value} <FileText className="w-3 h-3" />
                        </button>
                      ) : (
                        <span>{link.value || '—'}</span>
                      )}
                      {link.date && <span className="text-[11px] text-slate-400">· {formatDate(link.date)}</span>}
                      {link.status && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                          {link.status}
                        </span>
                      )}
                    </span>
                  </Row>
                ))
              ) : (
                <EmptyState icon={Link2} title="No Linked Documents" />
              )}
              {config.documentWorkflow && (
                <DocumentWorkflow moduleKey={config.moduleKey} docId={id} docNo={no} />
              )}
            </div>

            {/* Attachments for THIS record only — real file name, type, size
                and date with view/download, plus View All into the full
                Attachments tab. No faked rows, no placeholders. */}
            {config.overviewComplete && (
              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={Paperclip}
                  title="Attachments"
                  count={attachments.length}
                  action={<CardButton label="View All" onClick={() => setTab('attachments')} />}
                />
                {attachments.length === 0 ? (
                  <EmptyState icon={Paperclip} title="No Attachments" subtitle="No documents have been uploaded for this Customer Purchase Order." />
                ) : (
                  <div className="flex flex-col">
                    {attachments.slice(0, 4).map((att, i) => (
                      <div key={att.id ?? `${att.name}-${i}`} className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-b-0">
                        <span className="p-1.5 rounded-lg bg-[#E8F0EE] text-[#0B4A3D] shrink-0">
                          <Paperclip className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-semibold text-slate-700 truncate">{att.name || att.fileName || 'File'}</div>
                          <div className="text-[11px] text-slate-400">
                            {[
                              att.contentType ? String(att.contentType).split('/').pop().toUpperCase() : '',
                              att.size ? formatBytes(att.size) : '',
                              att.uploadedAt ? formatRelativeTime(att.uploadedAt) : ''
                            ].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        {att.url && (
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              title="View"
                              onClick={() => openFileInNewTab(att.url).catch((err) => toast.error(err?.message || 'Failed to open file'))}
                              className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Download"
                              onClick={() => downloadFile(att.url, att.name || 'file').catch((err) => toast.error(err?.message || 'Failed to download file'))}
                              className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                    {attachments.length > 4 && (
                      <div className="text-center pt-2">
                        <button
                          type="button"
                          onClick={() => setTab('attachments')}
                          className="text-xs font-semibold text-[#0B4A3D] hover:underline cursor-pointer"
                        >
                          View all {attachments.length} attachments →
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!config.overviewComplete && !config.showItemsInOverview && (doc.remarks || doc.notes || doc.terms) && (
              <div className="prm-card prm-card-body">
                <CardHeader icon={StickyNote} title="Notes & Terms" />
                {doc.remarks && <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap mb-2">{doc.remarks}</div>}
                {doc.notes && <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap mb-2">{doc.notes}</div>}
                {doc.terms && <div className="text-[13px] text-slate-500 leading-relaxed whitespace-pre-wrap">{doc.terms}</div>}
              </div>
            )}

            <div className="prm-card prm-card-body">
              <CardHeader icon={History} title="Timeline" count={`${timelineEvents.length} events`} />
              <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200 max-h-80 overflow-y-auto pr-1">
                {timelineEvents.length === 0 ? (
                  <EmptyState icon={Clock} title="No Timeline Events" />
                ) : (
                  <>
                    {timelineEvents.slice(0, 6).map((event) => (
                      <TimelineEvent key={`${event.title}-${event.date}`} event={event} />
                    ))}
                    {timelineEvents.length > 6 && (
                      <div className="text-center py-2">
                        <button
                          type="button"
                          onClick={() => setTab('timeline')}
                          className="text-xs font-semibold text-[#0B4A3D] hover:underline cursor-pointer"
                        >
                          View all {timelineEvents.length} events →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="prm-card prm-card-body">
              <CardHeader icon={ClipboardList} title="Activity Log" />
              {activityEvents.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No Activity" />
              ) : (
                <>
                  {activityEvents.slice(0, 4).map((a, i) => {
                    const Icon = ACTIVITY_ICONS[a.icon] || ACTIVITY_ICONS.default;
                    return (
                      <div key={`${a.text}-${a.date}-${i}`} className="flex items-start gap-2.5 py-2 border-b border-slate-100 last:border-b-0">
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
        </div>
      )}

      {/* ===== ITEMS PANE ===== */}
      {tab === 'items' && config.showItems !== false && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader
            icon={Layers}
            title="Item Details"
            count={`${items.length} records`}
            action={
              itemGridKey && !isHistorical ? <ManageColumnsButton manager={itemGrid.manager} /> : null
            }
          />
          {items.length === 0 ? (
            <EmptyState icon={Package} title="No Items" />
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <DynamicDetailTable
                columns={itemColumns}
                rows={itemRows}
                className="w-full border-collapse"
                wrapClassName=""
                minWidth={itemGrid.resize.totalWidth(itemColumns) || 960}
                resolveWidth={(col) => itemGrid.resize.widthOf(col)}
                headerExtra={(col) => (isHistorical ? null : <ColumnResizer column={col} resize={itemGrid.resize} />)}
                emptyNoun="items"
                rowClassName={itemRowClass}
                headerCellClass="py-2 px-2 text-[11px] font-bold text-slate-500 bg-slate-50"
                bodyCellClass="py-2 px-2 text-xs text-slate-600 border-b border-slate-100"
                // Totals stay anchored under the saved Amount/Total column,
                // wherever the user moved it to.
                footer={(colCount, cols) => {
                  const amountIdx = cols.findIndex((c) => c.key === 'amount' || c.key === 'total');
                  const valueCol = amountIdx >= 0 ? amountIdx : Math.max(0, colCount - 1);
                  const labelSpan = Math.max(1, valueCol);
                  const tailSpan = Math.max(0, colCount - labelSpan - 1);
                  const cell = (key, label, value, opts = {}) => (
                    <tr
                      key={key}
                      className={opts.bg ? 'bg-[#0B4A3D]' : 'border-t border-slate-100 bg-slate-50/60'}
                    >
                      <td
                        colSpan={labelSpan}
                        className={`py-2.5 px-2 text-right text-[13px] font-semibold ${opts.bg ? 'text-white font-bold' : 'text-slate-500'}`}
                      >
                        {label}
                      </td>
                      <td
                        className={`py-2.5 px-2 text-right text-[13px] ${opts.bg ? 'text-sm font-extrabold text-white' : 'font-bold text-slate-800'}`}
                      >
                        {value}
                      </td>
                      {tailSpan > 0 ? <td colSpan={tailSpan} /> : null}
                    </tr>
                  );
                  return (
                    <>
                      {cell('sub', 'Sub Total', formatINR(totals.subTotal, doc.currency))}
                      {/* A Credit Note has no discount any more (`hideZeroDiscountRow`
                          in its view config), so its zero Discount row is left
                          out; a legacy note with a stored discount keeps it.
                          Every other document type is unchanged. */}
                      {!(config.hideZeroDiscountRow === true && !(Number(totals.discount) > 0)) &&
                        cell('disc', 'Discount', formatINR(totals.discount, doc.currency))}
                      {cell('tax', 'Tax Total (CGST + SGST)', formatINR(totals.taxTotal, doc.currency))}
                      {Number(totals.charges) > 0 ? cell('charges', 'Charges', formatINR(totals.charges, doc.currency)) : null}
                      {cell('grand', 'Grand Total', formatINR(totals.grandTotal, doc.currency), { bg: true })}
                    </>
                  );
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* ===== ATTACHMENTS PANE ===== */}
      {tab === 'attachments' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={Paperclip} title="Attachments" count={`${attachments.length} files`} />
          <SalesAttachments service={config.service} docId={id} attachments={attachments} onChanged={load} />
        </div>
      )}

      {/* ===== TIMELINE PANE ===== */}
      {tab === 'timeline' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={History} title="Full Timeline" count={`${timelineEvents.length} events`} />
          {timelineEvents.length === 0 ? (
            <EmptyState icon={Clock} title="No Timeline Events" />
          ) : (
            <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
              {timelineEvents.map((event) => (
                <TimelineEvent key={`${event.title}-${event.date}`} event={event} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== ACTIVITY LOG PANE ===== */}
      {tab === 'activities' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={ClipboardList} title="Activity Log" count={`${activityEvents.length} records`} />
          {activityEvents.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No Activity Recorded" />
          ) : (
            <div>
              {activityEvents.map((a, i) => {
                const Icon = ACTIVITY_ICONS[a.icon] || ACTIVITY_ICONS.default;
                return (
                  <div key={`${a.text}-${a.date}-${i}`} className="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-b-0">
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

      {/* ===== LINKED DOCUMENTS PANE ===== */}
      {tab === 'linked-documents' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={Link2} title="Linked Documents" count={`${linkedDocs.length} links`} />
          {linkedDocs.length === 0 ? (
            <EmptyState icon={Link2} title="No Linked Documents" />
          ) : (
            <div className="flex flex-col gap-2">
              {linkedDocs.map((link) => (
                <div key={link.label} className="flex items-center justify-between px-4 py-3 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2.5">
                    <Link2 className="w-3.5 h-3.5 text-[#0B4A3D]" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide w-36 shrink-0">
                      {link.label}
                    </span>
                    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      {link.onClick ? (
                        <button
                          type="button"
                          onClick={link.onClick}
                          className="text-[13px] font-semibold text-[#0B4A3D] hover:underline cursor-pointer"
                        >
                          {link.value}
                        </button>
                      ) : (
                        <span className="text-[13px] font-semibold text-slate-700">{link.value}</span>
                      )}
                      {link.date && <span className="text-[11px] text-slate-400">· {formatDate(link.date)}</span>}
                      {link.status && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-wide">
                          {link.status}
                        </span>
                      )}
                    </span>
                  </div>
                  {link.onClick && <FileText className="w-3.5 h-3.5 text-slate-300" />}
                </div>
              ))}
            </div>
          )}
          {config.documentWorkflow && (
            <DocumentWorkflow moduleKey={config.moduleKey} docId={id} docNo={no} />
          )}
        </div>
      )}

      {/* ===== VERSION HISTORY PANE ===== */}
      {tab === 'version-history' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader
            icon={GitBranch}
            title="Version History"
            count={version.chain.length > 0 ? `${version.chain.length} versions` : `${versionHistory.length} records`}
          />
          {/* What makes THIS version different from the one before it. Rendered
              here and on a historical revision; never on a normal current view. */}
          <div className="mb-5">
            <VersionComparison
              comparison={version.comparison}
              direction={version.direction}
              loading={version.loading}
              unavailable={version.unavailable}
              selectedLabel={version.selected ? `Revision ${version.selected.revision}` : ''}
              currentHref={version.selected && !version.selected.latestRevision
                ? config.viewRoute(version.chain[version.chain.length - 1] || doc)
                : null}
              onGoToCurrent={() => navigate(config.viewRoute(version.chain[version.chain.length - 1] || doc))}
            />
          </div>
          <div className="mb-5">
            <RevisionHistoryTable
              revisions={doc.revisions}
              docNumber={docNumber(doc, config.moduleKey)}
              currentId={doc.id}
              viewRoute={(rev) => config.viewRoute(rev)}
              navigate={navigate}
            />
          </div>
          {editHistory.length > 0 && (
            <div className="mb-5">
              <EditHistoryTimeline moduleKey={config.moduleKey} recordId={id} limit={50} />
            </div>
          )}
          {versionHistory.length === 0 ? (
            // The legacy field-level table may legitimately be empty even when
            // the immutable revision chain is not — the chain above already
            // tells the story, so only a document with NO versions at all is
            // "No Revision History".
            version.chain.length === 0 ? (
              <EmptyState icon={GitBranch} title="No Revision History" subtitle="This is the original version of the document." />
            ) : null
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full border-collapse" style={{ minWidth: 640 }}>
                <thead>
                  <tr className="bg-slate-50">
                    <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Version</th>
                    <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Date</th>
                    <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Field</th>
                    <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Changed By</th>
                    <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {versionHistory.map((h, i) => (
                    <tr key={`${h.createdAt}-${i}`} className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-3 text-xs font-bold text-slate-700">v{versionHistory.length - i}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">{formatDateTime(h.createdAt)}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">
                        {cpoText(h.field) || '—'}
                        {h.oldValue && <span className="text-slate-400">: {cpoText(h.oldValue)} → {cpoText(h.newValue)}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">{h.changedBy || '—'}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-600">{cpoText(h.newValue) || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ===== APPROVAL HISTORY PANE ===== */}
      {tab === 'approval-history' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={CheckCheck} title="Approval Status" />
          <div className="flex flex-wrap items-center gap-2 mb-5">
            {approvalSteps.map((step, i) => {
              const done = approvalIdx >= 0 && i <= approvalIdx;
              return (
                <div key={step} className="flex items-center gap-2">
                  <div
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold ${
                      done ? 'bg-[#0B4A3D] text-white' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {i < approvalIdx ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                  </div>
                  {i < approvalSteps.length - 1 && <div className={`w-6 h-0.5 ${done && approvalIdx > i ? 'bg-[#0B4A3D]' : 'bg-slate-200'}`} />}
                </div>
              );
            })}
          </div>
          <CardHeader icon={History} title="Approval History" count={`${activityEvents.length} records`} />
          {activityEvents.length === 0 ? (
            <EmptyState icon={History} title="No Approval Activity" />
          ) : (
            <div className="flex flex-col">
              {activityEvents.map((a, i) => (
                <div key={`${a.text}-${a.date}-${i}`} className="flex items-start gap-2.5 py-2.5 border-b border-slate-100 last:border-b-0">
                  <div className="p-1.5 rounded-lg bg-[#E8F0EE] text-[#0B4A3D] shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[13px] text-slate-700">{a.text}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(a.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== CUSTOM TAB PANE ===== */}
      {config.renderTab && config.renderTab(tab, { doc, id, no })}

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
    </div>
  );
}

