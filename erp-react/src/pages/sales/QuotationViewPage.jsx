import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  Archive,
  ArrowLeft,
  Calendar,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  GitBranch,
  History,
  Info,
  Layers,
  Link2,
  Loader2,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Paperclip,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Share2,
  StickyNote,
  Tag,
  Trash2,
  Truck,
  User,
  Users
} from 'lucide-react';
import {
  ActionMenu,
  ConfirmDialog,
  FormField,
  Modal,
  ManagedSelect,
  TextArea,
  TextInput,
  useCurrentUser,
  useToast
} from '../../components/Common';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import EditCountBadge from '../../components/EditHistory/EditCountBadge';
import EditHistoryTimeline from '../../components/EditHistory/EditHistoryTimeline';
import RevisionHistoryTable from '../../components/EditHistory/RevisionHistoryTable';
import VersionComparison from '../../components/EditHistory/VersionComparison';
import { fetchEditHistory } from '../../utils/editHistory';
import useVersionComparison from '../../hooks/useVersionComparison';
import { changeByLabel, itemIdentity, labelKey } from '../../utils/versionDiff';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub (/sales with the Quotations tab), not the bare /quotations
// route which has no hub breadcrumb / header / tab nav.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import SalesAttachments from '../../components/SalesDetail/SalesAttachments';
import {
  ColumnResizer,
  DynamicDetailTable,
  ManageColumnsButton,
  useColumnManager,
  useColumnResize
} from '../../components/GridColumns';
import useDetailColumns from '../../hooks/useDetailColumns';
import { detailRows, itemColumnSetForModule, visibleDetailColumns } from '../../utils/detailColumns';
import { resetGridConfig, saveGridConfig } from '../../services/gridConfigService';
import documentService from '../../services/documentService';
import followUpService from '../../services/followUpService';
import { formatDate, formatDateTime, formatINR } from '../../utils/leadHelpers';
import { computeTotals, cpoNo, cpoText, docNumber, emailDocument, shareDocument, whatsappDocument } from '../../utils/salesHelpers';
import { quotationViewConfig } from '../../config/salesPageConfigs';
import './quotation-module.css';
import '../crm/crm-erp.css';

/* =====================================================================
 * Small presentational helpers
 * ===================================================================== */

function initialOf(name = '') {
  return (name || 'D').charAt(0).toUpperCase();
}

/**
 * Label/value row used inside every Overview card.
 *
 * `change` is optional and passed ONLY while a historical revision is on
 * screen: it tints the field and shows the previous value, so a reader can see
 * what the revision changed without the document being redesigned. A normal
 * current view passes nothing and renders exactly as before.
 */
const FIELD_CHANGE_TINT = {
  added: 'qo-field-changed qo-field-added',
  modified: 'qo-field-changed qo-field-modified',
  removed: 'qo-field-changed qo-field-removed'
};

function Field({ label, children, change }) {
  return (
    <div className={`qo-field${change ? ` ${FIELD_CHANGE_TINT[change.type] || FIELD_CHANGE_TINT.modified}` : ''}`}>
      <span className="qo-field-k">{label}</span>
      <span className="qo-field-v">
        {children}
        {change && change.type === 'modified' && (
          <span className="qo-field-was">Previous: {change.previousValue}</span>
        )}
        {change && change.type === 'added' && <span className="qo-field-was">Added in this version</span>}
        {change && change.type === 'removed' && (
          <span className="qo-field-was">Removed in this version (was {change.previousValue})</span>
        )}
      </span>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count, action }) {
  return (
    <div className="qo-section-head">
      <h3>
        <Icon /> {title}
        {count != null && <span className="qpo-count">{count}</span>}
      </h3>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 0' }}>
      <Icon style={{ width: 36, height: 36, color: '#cbd5e1', margin: '0 auto 12px', display: 'block' }} />
      <h4 style={{ fontSize: 15, fontWeight: 600, color: '#6B7280', margin: '0 0 4px' }}>{title}</h4>
      {subtitle && <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>{subtitle}</p>}
    </div>
  );
}

/**
 * A section that failed to load shows the REAL backend error and a Retry —
 * it never silently degrades into "no data".
 */
function ErrorState({ message, onRetry }) {
  return (
    <div className="qo-error">
      <AlertCircle />
      <div>
        <strong>Could not load this section</strong>
        <span>{message}</span>
      </div>
      <button type="button" className="qpo-btn qpo-btn-ghost" onClick={onRetry}>
        <RefreshCw /> Retry
      </button>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="qo-loading">
      <Loader2 className="qo-spin" /> Loading…
    </div>
  );
}

const TL_DOT_COLORS = {
  created: 'green',
  completed: 'green',
  approved: 'green',
  submitted: 'amber',
  rejected: 'red',
  danger: 'red',
  default: 'gray'
};

function TimelineEvent({ event }) {
  return (
    <div className="qpo-audit-item">
      <span className={`qpo-audit-dot ${TL_DOT_COLORS[event.type] || 'gray'}`} />
      <div className="qpo-audit-action">{event.title}</div>
      {event.desc && <div className="qpo-audit-detail">{event.desc}</div>}
      <div className="qpo-audit-date">{formatDateTime(event.date)}</div>
    </div>
  );
}

function buildTimelineEvents(doc, no, label) {
  const events = [];
  const createdAt = doc.createdAt || doc.date;
  if (createdAt) {
    events.push({ title: `${label} Created`, desc: `${no || doc.id} was created.`, date: createdAt, type: 'created' });
  }
  if (doc.updatedAt && doc.updatedAt !== createdAt) {
    events.push({ title: `${label} Updated`, desc: 'Document was updated.', date: doc.updatedAt, type: 'edited' });
  }
  if (doc.sentAt) {
    events.push({ title: 'Sent to Client', desc: `Sent by ${doc.sentBy || '—'}`, date: doc.sentAt, type: 'submitted' });
  }
  if (doc.approvalDate && String(doc.approvalStatus || '').toLowerCase() === 'approved') {
    events.push({ title: 'Approved', desc: `Approved by ${doc.approvedBy || '—'}`, date: doc.approvalDate, type: 'approved' });
  }
  if (doc.archivedAt) {
    events.push({ title: 'Archived', desc: 'Document was archived.', date: doc.archivedAt, type: 'archived' });
  }
  return events.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

function buildActivityEvents(doc, no) {
  const activities = [];
  if (doc.createdAt || doc.date) {
    activities.push({ text: `Document ${no || doc.id} was created.`, date: doc.createdAt || doc.date, icon: 'plus' });
  }
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
  if (Array.isArray(doc.timeline)) {
    doc.timeline.forEach((t) => {
      activities.push({ text: t.title || t.detail || 'Activity', date: t.createdAt, icon: 'check' });
    });
  }
  return activities.filter((a) => a.date).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
}

const ACTIVITY_ICONS = {
  plus: Check,
  send: Check,
  check: ClipboardList,
  default: Clock
};

const FU_STATUS_CLASS = {
  open: 'qo-chip-open',
  pending: 'qo-chip-pending',
  completed: 'qo-chip-completed',
  'in progress': 'qo-chip-pending',
  cancelled: 'qo-chip-danger',
  missed: 'qo-chip-danger'
};

const EMPTY_FU_FORM = {
  followupDate: new Date().toISOString().slice(0, 10),
  contactPerson: '',
  mode: '',
  discussionSummary: '',
  nextFollowupDate: '',
  status: 'Open',
  assignTo: ''
};

/** '' / null aware date formatter (LocalDate strings included). */
function dt(value) {
  if (!value) return '—';
  const str = String(value);
  return str.length <= 10 ? formatDate(value) : formatDateTime(value);
}

/**
 * Quotation Overview page — the EXISTING quotation view route
 * (/quotations/:id/view) reorganized to the ERP quotation overview layout:
 *
 *   header (number + status + actions)
 *   → quotation summary strip
 *   → four information cards (Client / Quotation / Financial / Other)
 *   → Items (Manage Columns + resize, from the persisted MySQL config)
 *   → Follow-ups (real /followups rows scoped to this quotation)
 *   → Remarks (real /quotations/{id}/remarks rows) + Documents (document_repository)
 *   → Terms & Conditions | Additional Information | Activity History
 *   → bottom action bar
 *
 * Everything is read from MySQL through the existing services; nothing is
 * mocked, duplicated or read from localStorage.
 */
export default function QuotationViewPage() {
  const { id } = useParams();
  // SALES_DELETE, mirrored from the backend role → permission map — the delete
  // action below is gated on it (the backend still enforces it).
  const { canDeleteSales } = useCurrentUser();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'overview');
  const [confirm, setConfirm] = useState(null);
  const [editHistory, setEditHistory] = useState([]);
  const [actionLoading, setActionLoading] = useState(false);

  // ---- Follow-ups / Remarks / Documents (real backend, per section state) ----
  const [followUps, setFollowUps] = useState([]);
  const [followUpsState, setFollowUpsState] = useState({ loading: true, error: '' });
  const [remarks, setRemarks] = useState([]);
  const [remarksState, setRemarksState] = useState({ loading: true, error: '' });
  const [documents, setDocuments] = useState([]);
  const [documentsState, setDocumentsState] = useState({ loading: true, error: '' });

  // ---- Dialogs ----
  const [fuModal, setFuModal] = useState(null); // null | { id? } ; form holds values
  const [fuForm, setFuForm] = useState(EMPTY_FU_FORM);
  const [fuErrors, setFuErrors] = useState({});
  const [fuSaving, setFuSaving] = useState(false);
  const [remarkModal, setRemarkModal] = useState(false);
  const [remarkText, setRemarkText] = useState('');
  const [remarkError, setRemarkError] = useState('');
  const [remarkSaving, setRemarkSaving] = useState(false);
  const [remarkToDelete, setRemarkToDelete] = useState(null);
  const [fuToDelete, setFuToDelete] = useState(null);
  const [docToArchive, setDocToArchive] = useState(null);
  const [docToDelete, setDocToDelete] = useState(null);
  const [docDetails, setDocDetails] = useState(null);
  const [docBusy, setDocBusy] = useState(false);

  const config = quotationViewConfig;

  /* ------------------------------------------------------------------ */
  /* Loads                                                              */
  /* ------------------------------------------------------------------ */

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

  const loadDoc = useCallback(async () => {
    const res = await config.service.get(id);
    const raw = res?.data ?? res ?? {};
    if (!raw?.id) {
      setNotFound(true);
      setDoc(null);
    } else {
      setNotFound(false);
      setDoc(config.normalize(raw));
    }
    return raw;
  }, [id, config]);

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

  const loadFollowUps = useCallback(async () => {
    setFollowUpsState({ loading: true, error: '' });
    try {
      const res = await followUpService.list({ quotationId: id, page: 0, size: 100, sort: 'followupDate,desc' });
      const rows = Array.isArray(res?.content) ? res.content : Array.isArray(res?.data?.content) ? res.data.content : [];
      setFollowUps(rows);
      setFollowUpsState({ loading: false, error: '' });
    } catch (err) {
      setFollowUps([]);
      setFollowUpsState({ loading: false, error: err?.message || 'Follow-up request failed' });
    }
  }, [id]);

  const loadRemarks = useCallback(async () => {
    setRemarksState({ loading: true, error: '' });
    try {
      const rows = await config.service.listRemarks(id);
      setRemarks(Array.isArray(rows) ? rows : []);
      setRemarksState({ loading: false, error: '' });
    } catch (err) {
      setRemarks([]);
      setRemarksState({ loading: false, error: err?.message || 'Remark request failed' });
    }
  }, [id, config]);

  const loadDocuments = useCallback(async () => {
    setDocumentsState({ loading: true, error: '' });
    try {
      const rows = await documentService.listForRecord('Quotation', id);
      setDocuments(Array.isArray(rows) ? rows : []);
      setDocumentsState({ loading: false, error: '' });
    } catch (err) {
      setDocuments([]);
      setDocumentsState({ loading: false, error: err?.message || 'Document request failed' });
    }
  }, [id]);

  useEffect(() => {
    loadFollowUps();
    loadRemarks();
    loadDocuments();
  }, [loadFollowUps, loadRemarks, loadDocuments]);

  const load = async () => {
    await loadDoc();
    await Promise.all([loadFollowUps(), loadRemarks(), loadDocuments()]);
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
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Derived data                                                       */
  /* ------------------------------------------------------------------ */

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

  /** Real audit authorship (edit_history → sales_history), newest first. */
  const auditAuthors = useMemo(() => {
    const rows = [];
    editHistory.forEach((g) => {
      if (g.changedBy) rows.push({ by: g.changedBy, at: g.createdAt });
    });
    (doc?.history || []).forEach((h) => {
      if (h.changedBy) rows.push({ by: h.changedBy, at: h.createdAt });
    });
    return rows
      .filter((r) => r.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at));
  }, [editHistory, doc]);

  const preparedBy = auditAuthors.length ? auditAuthors[auditAuthors.length - 1].by : '';
  const lastUpdatedBy = auditAuthors.length ? auditAuthors[0].by : '';

  // ---- Item columns come from the SAME persisted configuration the
  // creation/edit item grid uses (MySQL grid config store, keyed by the
  // module's item-grid key). A record that carries its own saved column
  // configuration wins, so historical versions stay immutable.
  const itemGrid = useDetailColumns({
    setName: itemColumnSetForModule(config.moduleKey, doc) || 'quotationItems',
    recordColumns: doc?.itemColumns
  });

  // Local editable copy of the FULL column list (hidden ones included) so the
  // Manage Columns popup can show and edit them; every change is persisted to
  // MySQL through the shared grid-config service.
  const [itemColumns, setItemColumns] = useState([]);
  const gridSignature = JSON.stringify(itemGrid.columns);
  useEffect(() => {
    setItemColumns(itemGrid.columns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridSignature, itemGrid.loaded]);

  const persistColumns = useCallback(
    async (next) => {
      setItemColumns(next);
      if (!itemGrid.gridKey) return;
      try {
        await saveGridConfig(itemGrid.gridKey, next);
      } catch (err) {
        toast.error(err?.message || 'Could not save the column configuration');
      }
    },
    [itemGrid.gridKey, toast]
  );

  const resetColumns = useCallback(async () => {
    if (itemGrid.gridKey) {
      try {
        await resetGridConfig(itemGrid.gridKey);
      } catch (err) {
        toast.error(err?.message || 'Could not reset the column configuration');
      }
    }
    const defaults = useDetailColumns({ setName: itemColumnSetForModule(config.moduleKey, doc) });
    setItemColumns(defaults.columns);
  }, [itemGrid.gridKey, config.moduleKey, doc, toast]);

  const columnManager = useColumnManager({
    columns: itemColumns,
    onChange: persistColumns,
    onReset: resetColumns,
    rowCount: (doc?.items || []).length,
    itemNoun: 'row',
    // Serial number and Actions are structural: never renamed/hidden/removed.
    protectedKeys: ['sno', 'actions'],
    insertBeforeKeys: ['actions']
  });

  const resize = useColumnResize({ columns: itemColumns, onChange: persistColumns });

  // The Actions column carries no meaning on a read-only surface — dropped from
  // the RENDER only (it stays in the saved configuration above).
  const itemColumnsVisible = visibleDetailColumns(itemColumns);
  const itemDetailColumns = itemColumnsVisible.filter((c) => c.key !== 'actions');

  // ---- Version comparison (historical revisions + the History pane).
  // The chain, this version and the version immediately before it all come from
  // the detail response this page already loaded; the previous snapshot is
  // fetched through the same quotation service only while a version is actually
  // being inspected, so a normal view costs no extra request.
  const viewingHistorical = Array.isArray(doc?.revisions) && doc.revisions.length > 1
    && doc?.id !== doc.revisions[doc.revisions.length - 1]?.id;
  const version = useVersionComparison({
    service: config.service,
    doc,
    normalize: config.normalize,
    enabled: Boolean(doc) && (viewingHistorical || tab === 'history')
  });
  // Changed-field lookup for the document's own rows; empty unless a historical
  // revision is on screen, so no normal quotation view is ever tinted.
  const changedFields = useMemo(
    () => (viewingHistorical ? changeByLabel(version.comparison) : new Map()),
    [viewingHistorical, version.comparison]
  );
  const changeFor = useCallback((label) => changedFields.get(labelKey(label)) || null, [changedFields]);
  const currentRevisionRoute = useMemo(() => {
    if (!config.viewRoute) return null;
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
        ? 'qo-item-row-changed qo-item-row-added'
        : 'qo-item-row-changed qo-item-row-modified';
    },
    [changedItemRows]
  );

  if (loading) {
    return (
      <div className="purchase-page cpr-page">
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#0B4A3D', animation: 'qpo-spin 0.8s linear infinite' }} />
        </div>
      </div>
    );
  }

  if (notFound || !doc) {
    return (
      <div className="purchase-page cpr-page">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <a onClick={() => navigate('/sales')}>Sales</a>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <a onClick={() => navigate('/sales')}>Sales Execution</a>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        </nav>
        <div className="qpo-view-section" style={{ textAlign: 'center', padding: '40px' }}>
          <Info style={{ width: 40, height: 40, color: '#cbd5e1', margin: '0 auto 12px', display: 'block' }} />
          <h4 style={{ fontSize: 16, fontWeight: 700, color: '#6B7280', margin: '0 0 6px' }}>{config.title} Not Found</h4>
          <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px' }}>The {config.title.toLowerCase()} you are looking for does not exist.</p>
          <button type="button" className="qpo-btn qpo-btn-primary" onClick={() => navigate(config.listRoute)}>
            <ArrowLeft /> Back to {config.title} List
          </button>
        </div>
      </div>
    );
  }

  const status = String(doc.status || 'draft').toLowerCase();
  const items = Array.isArray(doc.items) ? doc.items : [];
  const attachments = Array.isArray(doc.attachments) ? doc.attachments : [];
  const no = docNumber(doc, config.moduleKey);
  const itemDetailRows = detailRows(items);
  const editRoute = config.editRoute(doc);

  // Historical-revision detection: a preserved snapshot is read-only. Resolved
  // once, before the conditional returns, so the version comparison and the
  // mutating actions always agree on whether this revision is read-only.
  const isHistorical = viewingHistorical;
  const docRevision = Number(doc.revision) || 0;
  const editable = !isHistorical;

  const totals = computeTotals(items, {
    discountPct: doc.discountPct ?? doc.discount ?? 0,
    charges: (doc.charges ?? 0) + (doc.freight ?? 0) + (doc.insurance ?? 0),
    roundOffEnabled: config.moduleKey === 'invoice'
  });

  const subTotal = Number(totals.subTotal) || 0;
  const discount = Number(totals.discount) || 0;
  const taxable = Math.max(0, subTotal - discount);
  const cgst = Number(totals.cgstTotal) || 0;
  const sgst = Number(totals.sgstTotal) || 0;
  const taxTotal = Number(totals.taxTotal) || 0;
  const igst = cgst === 0 && sgst === 0 ? taxTotal : 0;
  const grandTotal = Number(doc.grandTotal) || Number(totals.grandTotal) || 0;
  const rateOf = (tax) => (taxable > 0 ? Number(((tax / taxable) * 100).toFixed(2)) : 0);
  const pctLabel = (v) => (v ? ` (${String(v).replace(/\.00$/, '')}%)` : '');

  // PO status is derived from REAL conversion history, never from a guess.
  const poReady = Boolean(doc.convertedToSo);

  /* ------------------------------------------------------------------ */
  /* Actions                                                            */
  /* ------------------------------------------------------------------ */

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

  const convertAction = config
    .headerActions(doc, { runAction, navigate, toast })
    .find((a) => a.key === 'convert');
  const createPo = () => {
    if (convertAction) {
      convertAction.action();
      return;
    }
    // "View PO" opens the linked Customer Purchase Order. /sales-orders/:id takes
    // the Sales Order's NUMERIC database id, not its CPO document number: passing
    // "CPO-2026-00003" made the route request GET /v1/sales-orders/CPO-2026-00003
    // and the backend answered 400 ("Invalid value for parameter: id"). The
    // quotation response already carries that id as poId — the same identifier the
    // Quotation list's PO Status link navigates with — while convertedToSo stays
    // the display number shown as "CPO-…".
    if (doc.poId) {
      navigate(`/sales-orders/${doc.poId}`);
    } else if (doc.convertedToSo) {
      // Defensive: the CPO reference is recorded but its record could not be
      // resolved (e.g. a CPO whose qtn_ref predates the chain-original rule).
      // Send the user to the Customer Purchase Orders list rather than building a
      // URL from a document number, which always fails with 400.
      toast.error(`${cpoNo(doc.convertedToSo)} could not be opened — open it from Customer Purchase Orders`);
      navigate('/sales-orders');
    }
  };

  /* ------------------------------------------------------------------ */
  /* Follow-up / Remark / Document handlers                              */
  /* ------------------------------------------------------------------ */

  const openAddFollowUp = () => {
    setFuErrors({});
    setFuForm({
      ...EMPTY_FU_FORM,
      contactPerson: doc.contactPerson || '',
      assignTo: doc.salesPerson || ''
    });
    setFuModal({});
  };

  const openEditFollowUp = (row) => {
    setFuErrors({});
    setFuForm({
      followupDate: row.followupDate || EMPTY_FU_FORM.followupDate,
      contactPerson: row.contactPerson || '',
      mode: row.mode || '',
      discussionSummary: row.discussionSummary || '',
      nextFollowupDate: row.nextFollowupDate || '',
      status: row.status || 'Open',
      assignTo: row.assignTo || ''
    });
    setFuModal({ id: row.id });
  };

  const saveFollowUp = async () => {
    const errors = {};
    if (!fuForm.followupDate) errors.followupDate = 'Follow-up date is required';
    if (!fuForm.mode) errors.mode = 'Type is required';
    setFuErrors(errors);
    if (Object.keys(errors).length) return;
    setFuSaving(true);
    try {
      const payload = {
        // Client/lead come from the quotation itself; quotationId scopes the row.
        clientId: doc.clientId ?? null,
        quotationId: Number(id),
        companyName: doc.clientName || null,
        contactPerson: fuForm.contactPerson || null,
        phone: doc.phone || null,
        email: doc.email || null,
        followupDate: fuForm.followupDate,
        mode: fuForm.mode,
        discussionSummary: fuForm.discussionSummary || null,
        nextFollowupDate: fuForm.nextFollowupDate || null,
        status: fuForm.status || null,
        assignTo: fuForm.assignTo || null
      };
      if (fuModal?.id) {
        await followUpService.update(fuModal.id, payload);
        toast.success('Follow-up updated');
      } else {
        await followUpService.create(payload);
        toast.success('Follow-up added');
      }
      setFuModal(null);
      await loadFollowUps();
    } catch (err) {
      setFuErrors({ submit: err?.message || 'Could not save the follow-up' });
    } finally {
      setFuSaving(false);
    }
  };

  const deleteFollowUp = async () => {
    if (!fuToDelete) return;
    setActionLoading(true);
    try {
      await followUpService.delete(fuToDelete.id);
      toast.success('Follow-up removed');
      setFuToDelete(null);
      await loadFollowUps();
    } catch (err) {
      toast.error(err?.message || 'Could not remove the follow-up');
    } finally {
      setActionLoading(false);
    }
  };

  const saveRemark = async () => {
    if (!remarkText.trim()) {
      setRemarkError('Remark text is required');
      return;
    }
    setRemarkSaving(true);
    setRemarkError('');
    try {
      await config.service.addRemark(id, remarkText.trim());
      toast.success('Remark added');
      setRemarkModal(false);
      setRemarkText('');
      await loadRemarks();
    } catch (err) {
      setRemarkError(err?.message || 'Could not save the remark');
    } finally {
      setRemarkSaving(false);
    }
  };

  const deleteRemark = async () => {
    if (!remarkToDelete) return;
    setActionLoading(true);
    try {
      await config.service.deleteRemark(id, remarkToDelete.id);
      toast.success('Remark deleted');
      setRemarkToDelete(null);
      await loadRemarks();
    } catch (err) {
      toast.error(err?.message || 'Could not delete the remark');
    } finally {
      setActionLoading(false);
    }
  };

  const runDocAction = async (fn, okMsg) => {
    setDocBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      await loadDocuments();
    } catch (err) {
      toast.error(err?.message || 'Document action failed');
    } finally {
      setDocBusy(false);
    }
  };

  const openDocDetails = async (row) => {
    setDocBusy(true);
    setDocDetails({ row, versions: [], audit: [] });
    try {
      const [versions, audit] = await Promise.all([
        documentService.getVersions(row.id).catch(() => []),
        documentService.getAudit(row.id).catch(() => [])
      ]);
      setDocDetails({ row, versions: Array.isArray(versions) ? versions : [], audit: Array.isArray(audit) ? audit : [] });
    } catch (err) {
      toast.error(err?.message || 'Could not load the document details');
    } finally {
      setDocBusy(false);
    }
  };

  /* ------------------------------------------------------------------ */
  /* Header / tabs                                                      */
  /* ------------------------------------------------------------------ */

  const headerActions = [];
  if (editable && !['deleted', 'archived', 'cancelled', 'converted', 'completed'].includes(status)) {
    headerActions.push({ key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(editRoute) });
  }
  if (editable && status !== 'deleted') {
    headerActions.push({ key: 'duplicate', label: 'Duplicate', icon: Copy, style: 'ghost', action: () => runAction(() => config.service.duplicate(id), `${config.title} duplicated`) });
  }
  if (editable) {
    const extra = config.headerActions(doc, { runAction, navigate, toast }).filter((a) => a.key !== 'convert');
    headerActions.push(...extra);
  }
  if (status !== 'deleted' && editable) {
    headerActions.push({
      key: 'archive',
      label: status === 'archived' ? 'Restore' : 'Archive',
      icon: status === 'archived' ? RotateCcw : Archive,
      style: 'ghost',
      action: () => setConfirm(status === 'archived' ? 'restore' : 'archive')
    });
    // Delete (to trash) is a SALES_DELETE action — not offered without it.
    if (canDeleteSales) {
      headerActions.push({ key: 'delete', label: 'Delete', icon: Trash2, style: 'danger', action: () => setConfirm('delete') });
    }
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

  const TABS = [
    { key: 'overview', label: 'Overview', icon: Layers },
    { key: 'items', label: 'Items', icon: Package, count: items.length },
    { key: 'terms', label: 'Terms & Conditions', icon: StickyNote },
    { key: 'follow-ups', label: 'Follow-ups', icon: Users, count: followUps.length },
    { key: 'remarks', label: 'Remarks', icon: MessageCircle, count: remarks.length },
    { key: 'documents', label: 'Documents', icon: FileText, count: documents.length },
    { key: 'history', label: 'History', icon: History, count: timelineEvents.length },
    // Existing panes kept so no functionality is lost.
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
    { key: 'linked-documents', label: 'Linked Documents', icon: Link2 },
    { key: 'approval-history', label: 'Approval History', icon: CheckCheck }
  ];

  const linkedDocs = config.linkedDocs ? config.linkedDocs(doc) : [];
  const versionHistory = Array.isArray(doc.history) ? doc.history : [];
  // Quotation lifecycle steps — 'submitted' is the quotation's own submitted
  // state; 'converted' remains the terminal step reached through a real
  // downstream conversion (it is no longer a stored status).
  const approvalSteps = ['draft', 'submitted', 'sent', 'accepted', 'rejected', 'converted'];
  const approvalStatus = String(doc.status || 'draft').toLowerCase();
  const approvalIdx = approvalSteps.indexOf(approvalStatus);

  // ---- Summary strip (real fields only) ----
  // Reference Source: the backend tells us whether the Reference PR No. is
  // CPR-backed or was registered directly on the quotation. Never guessed.
  const referenceSource = doc.referencePrSourceLabel
    ? doc.referencePrSourceLabel
    : doc.sourceCpr || doc.cprId
      ? 'CPR'
      : doc.sourceCw
        ? 'Cost Workout'
        : 'Direct';

  const summaryItems = [
    {
      label: 'Reference PR No',
      value: doc.referencePrNo || doc.reference,
      // Where the PR No came from: a real CPR row, or registered directly
      // from the Quotation form (referencePrSource from the backend).
      chip: doc.referencePrSource === 'CPR' || doc.sourceCpr || doc.cprId
        ? 'From CPR'
        : doc.referencePrSource === 'DIRECT'
          ? 'Direct PR'
          : null
    },
    { label: 'Reference Source', value: referenceSource },
    { label: 'Lead No', value: doc.leadNo },
    { label: 'CPR No', value: doc.sourceCpr },
    { label: 'Client', value: doc.clientName },
    { label: 'Quotation Date', value: doc.quotationDate ? formatDate(doc.quotationDate) : '' },
    { label: 'Valid Till', value: doc.validUntil ? formatDate(doc.validUntil) : '' },
    { label: 'Lead Time', value: doc.deliveryTerms },
    { label: 'Sales Person', value: doc.salesPerson },
    { label: 'Currency', value: doc.currency },
    { label: 'Status', value: <SalesStatusBadge status={doc.status} /> },
    {
      label: 'PO Status',
      value: (
        <span className={`qo-chip ${poReady ? 'qo-chip-completed' : 'qo-chip-muted'}`}>
          {poReady ? `${cpoNo(doc.convertedToSo)} · Released` : 'Not Released'}
        </span>
      )
    },
    { label: 'Created By', value: preparedBy },
    { label: 'Created On', value: doc.createdAt ? formatDateTime(doc.createdAt) : '' },
    { label: 'Last Updated', value: doc.updatedAt ? formatDateTime(doc.updatedAt) : '' },
    { label: 'Prepared By', value: preparedBy }
  ];

  const remarkColumns = [
    { key: 'sno', label: '#', width: 50, align: 'left' },
    { key: 'createdAt', label: 'Date & Time', width: 190 },
    { key: 'text', label: 'Remark', width: 420 },
    { key: 'addedBy', label: 'Added By', width: 160 },
    { key: 'actions', label: 'Actions', width: 90 }
  ];

  const fuColumns = [
    { key: 'sno', label: '#', width: 50 },
    { key: 'followupDate', label: 'Follow-up Date', width: 130 },
    { key: 'contactPerson', label: 'Contact Person', width: 170 },
    { key: 'mode', label: 'Type', width: 110 },
    { key: 'discussionSummary', label: 'Remarks', width: 280 },
    { key: 'nextFollowupDate', label: 'Next Follow-up', width: 130 },
    { key: 'status', label: 'Status', width: 120 },
    { key: 'assignTo', label: 'Assigned To', width: 140 },
    { key: 'actions', label: 'Actions', width: 90 }
  ];

  /**
   * Shared generic mini-table renderer for the Follow-ups / Remarks / Documents
   * sections. Deliberately tiny: it is NOT a second item-grid implementation —
   * the sales item tables keep using the shared GridColumns toolkit above.
   */
  const renderRows = (cols, rows, renderCells) => (
    <div className="qo-table-wrap">
      <table className="qpo-table qo-table" style={{ tableLayout: 'fixed', width: '100%', minWidth: cols.reduce((s, c) => s + c.width, 0) }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} className={c.align === 'right' ? 'qpo-th-right' : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{rows.map((row, i) => renderCells(row, i))}</tbody>
      </table>
    </div>
  );

  const manageColumnsButton = (
    <ManageColumnsButton manager={columnManager} className="qpo-btn qpo-btn-ghost" />
  );

  const itemsTable = (
    <DynamicDetailTable
      columns={itemDetailColumns}
      rows={itemDetailRows}
      className="qpo-table"
      wrapClassName="qpo-table-wrap"
      minWidth={resize.totalWidth(itemDetailColumns) || 760}
      resolveWidth={(col) => resize.widthOf(col)}
      headerExtra={(col) => <ColumnResizer column={col} resize={resize} />}
      emptyNoun="items"
      rowClassName={itemRowClass}
    />
  );

  const itemsFooter = (
    <DynamicDetailTable
      columns={itemDetailColumns}
      rows={itemDetailRows}
      className="qpo-table"
      wrapClassName="qpo-table-wrap"
      minWidth={resize.totalWidth(itemDetailColumns) || 900}
      resolveWidth={(col) => resize.widthOf(col)}
      headerExtra={(col) => <ColumnResizer column={col} resize={resize} />}
      emptyNoun="items"
      rowClassName={itemRowClass}
      footer={(colCount, cols) => {
        const amountIdx = cols.findIndex((c) => c.key === 'amount' || c.key === 'total');
        const valueCol = amountIdx >= 0 ? amountIdx : Math.max(0, colCount - 1);
        const labelSpan = Math.max(1, valueCol);
        const tailSpan = Math.max(0, colCount - labelSpan - 1);
        const row = (label, value, opts = {}) => (
          <tr
            key={label}
            style={{
              background: opts.bg || '#f8fafc',
              ...(opts.top ? { borderTop: '2px solid #e5e7eb' } : {})
            }}
          >
            <td colSpan={labelSpan} style={{ textAlign: 'right', fontWeight: opts.bold ? 700 : 600, color: opts.color || '#6B7280' }}>{label}</td>
            <td className="qpo-th-right" style={{ fontWeight: opts.bold ? 800 : 700, color: opts.color }}>{value}</td>
            {tailSpan > 0 ? <td colSpan={tailSpan} /> : null}
          </tr>
        );
        return (
          <>
            {row('Sub Total', formatINR(subTotal), { top: true })}
            {row('Discount', formatINR(discount))}
            {row('Tax Total (CGST + SGST)', formatINR(taxTotal))}
            {Number(totals.charges) > 0 ? row('Charges', formatINR(totals.charges)) : null}
            {row('Grand Total', formatINR(grandTotal), { bg: '#0B4A3D', color: '#fff', bold: true })}
          </>
        );
      }}
    />
  );

  const clientDetailsCard = (
    <div className="qpo-view-section qo-card">
      <SectionHeader
        icon={Users}
        title="Client Details"
        action={editable && doc.clientId ? (
          <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(`/clients/${doc.clientId}`)}>
            <Pencil /> Edit
          </button>
        ) : null}
      />
      <Field label="Client Name" change={changeFor('Client Name')}>{doc.clientName || '—'}</Field>
      <Field label="Contact Person" change={changeFor('Contact Person')}>{doc.contactPerson || '—'}</Field>
      <Field label="Email" change={changeFor('Email')}>
        {doc.email ? (
          <a href={`mailto:${doc.email}`} style={{ color: '#0B4A3D', fontWeight: 500, textDecoration: 'none' }}>{doc.email}</a>
        ) : (
          '—'
        )}
      </Field>
      <Field label="Phone" change={changeFor('Phone')}>{doc.phone || '—'}</Field>
      <Field label="GSTIN" change={changeFor('GSTIN')}>{doc.gstin || '—'}</Field>
      <Field label="PAN" change={changeFor('PAN')}>{doc.pan || '—'}</Field>
      <Field label="City" change={changeFor('City')}>{doc.city || doc.billingCity || '—'}</Field>
      <Field label="State" change={changeFor('State')}>{doc.state || doc.billingState || '—'}</Field>
      <Field label="Country" change={changeFor('Country')}>{doc.country || '—'}</Field>
      <Field label="Pincode" change={changeFor('Pincode')}>{doc.pin || doc.billingPin || '—'}</Field>
      <Field label="Billing Address" change={changeFor('Billing Address')}>{doc.billingAddress || doc.address || '—'}</Field>
      <Field label="Shipping Address" change={changeFor('Shipping Address')}>{doc.shippingAddress || (doc.shipSameAsBill ? 'Same as billing' : '—')}</Field>
    </div>
  );

  const quotationDetailsCard = (
    <div className="qpo-view-section qo-card">
      <SectionHeader
        icon={FileText}
        title="Quotation Details"
        action={editable ? (
          <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(editRoute)}>
            <Pencil /> Edit
          </button>
        ) : null}
      />
      <Field label="Quotation No"><strong>{no}</strong></Field>
      <Field label="Reference PR No" change={changeFor('Reference PR No')}>
        {doc.referencePrNo || doc.reference || '—'}
        {(doc.referencePrSource === 'CPR' || doc.sourceCpr || doc.cprId) && (
          <span className="qo-chip">From CPR</span>
        )}
        {doc.referencePrSource === 'DIRECT' && !doc.cprId && (
          <span className="qo-chip qo-chip-direct">Direct PR</span>
        )}
      </Field>
      <Field label="Lead No" change={changeFor('Lead No')}>{doc.leadNo || '—'}</Field>
      <Field label="CPR No" change={changeFor('CPR No')}>{doc.sourceCpr || '—'}</Field>
      <Field label="Quotation Date" change={changeFor('Quotation Date')}>{doc.quotationDate ? formatDate(doc.quotationDate) : '—'}</Field>
      <Field label="Valid Till" change={changeFor('Valid Till')}>{doc.validUntil ? formatDate(doc.validUntil) : '—'}</Field>
      <Field label="Lead Time" change={changeFor('Lead Time')}>{doc.deliveryTerms || '—'}</Field>
      <Field label="Status" change={changeFor('Status')}><SalesStatusBadge status={doc.status} /></Field>
      <Field label="PO Status">
        <span className={`qo-chip ${poReady ? 'qo-chip-completed' : 'qo-chip-muted'}`}>{poReady ? `${cpoNo(doc.convertedToSo)} · Released` : 'Not Released'}</span>
      </Field>
      <Field label="Sales Person" change={changeFor('Sales Person')}>{doc.salesPerson || '—'}</Field>
      <Field label="Currency" change={changeFor('Currency')}>{doc.currency || '—'}</Field>
    </div>
  );

  const financialCard = (
    <div className="qpo-view-section qo-card">
      <SectionHeader
        icon={Activity}
        title="Financial Summary"
        action={editable ? (
          <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(editRoute)}>
            <Pencil /> Edit
          </button>
        ) : null}
      />
      <Field label="Total (Before Tax)" change={changeFor('Total (Before Tax)')}>{formatINR(subTotal)}</Field>
      <Field label="Discount" change={changeFor('Discount')}>{formatINR(discount)}</Field>
      <Field label="Taxable Amount">{formatINR(taxable)}</Field>
      <Field label={`CGST${pctLabel(rateOf(cgst))}`}>{formatINR(cgst)}</Field>
      <Field label={`SGST${pctLabel(rateOf(sgst))}`}>{formatINR(sgst)}</Field>
      <Field label={`IGST${pctLabel(rateOf(igst))}`}>{formatINR(igst)}</Field>
      {Number(totals.charges) > 0 && <Field label="Freight / Charges">{formatINR(totals.charges)}</Field>}
      <div className="qo-total-row">
        <span>Total Amount</span>
        <strong>{formatINR(grandTotal)}</strong>
      </div>
    </div>
  );

  const otherInfoCard = (
    <div className="qpo-view-section qo-card">
      <SectionHeader
        icon={Info}
        title="Other Information"
        action={editable ? (
          <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(editRoute)}>
            <Pencil /> Edit
          </button>
        ) : null}
      />
      <Field label="Payment Terms" change={changeFor('Payment Terms')}>{doc.paymentTerms || '—'}</Field>
      <Field label="Lead Time" change={changeFor('Lead Time')}>{doc.deliveryTerms || '—'}</Field>
      <Field label="Price Validity" change={changeFor('Price Validity')}>{doc.validUntil ? formatDate(doc.validUntil) : '—'}</Field>
      <Field label="Prepared By">{preparedBy || '—'}</Field>
      <Field label="Last Updated By">{lastUpdatedBy || '—'}</Field>
      <Field label="Tax Type" change={changeFor('Tax Type')}>{doc.taxType || '—'}</Field>
      <Field label="Reference Source">{doc.sourceCpr ? 'CPR' : doc.sourceCw ? 'Cost Workout' : 'Direct'}</Field>
    </div>
  );

  const renderFollowUps = (compact = false) => {
    if (followUpsState.loading) return <LoadingRow />;
    if (followUpsState.error) return <ErrorState message={followUpsState.error} onRetry={loadFollowUps} />;
    if (!followUps.length) {
      return <EmptyState icon={Users} title="No Follow-ups" subtitle="Follow-ups added for this quotation will appear here." />;
    }
    const rows = compact ? followUps.slice(0, 4) : followUps;
    return renderRows(fuColumns, rows, (row, i) => (
      <tr key={row.id}>
        <td>{i + 1}</td>
        <td>{dt(row.followupDate)}</td>
        <td>{row.contactPerson || '—'}</td>
        <td>{row.mode ? <span className="qo-chip qo-chip-muted">{row.mode}</span> : '—'}</td>
        <td className="qo-wrap">{row.discussionSummary || '—'}</td>
        <td>{dt(row.nextFollowupDate)}</td>
        <td>
          <span className={`qo-chip ${FU_STATUS_CLASS[String(row.status || '').toLowerCase()] || 'qo-chip-muted'}`}>{row.status || '—'}</span>
        </td>
        <td>{row.assignTo || '—'}</td>
        <td className="qo-actions-cell">
          <button type="button" className="qo-icon-btn" title="Edit follow-up" onClick={() => openEditFollowUp(row)}>
            <Pencil />
          </button>
          <button type="button" className="qo-icon-btn qo-icon-danger" title="Delete follow-up" onClick={() => setFuToDelete(row)}>
            <Trash2 />
          </button>
        </td>
      </tr>
    ));
  };

  const renderRemarks = (compact = false) => {
    if (remarksState.loading) return <LoadingRow />;
    if (remarksState.error) return <ErrorState message={remarksState.error} onRetry={loadRemarks} />;
    if (!remarks.length) {
      return <EmptyState icon={MessageCircle} title="No Remarks" subtitle="Add the first remark for this quotation." />;
    }
    const rows = compact ? remarks.slice(0, 4) : remarks;
    return renderRows(remarkColumns, rows, (row, i) => (
      <tr key={row.id}>
        <td>{i + 1}</td>
        <td>{formatDateTime(row.createdAt)}</td>
        <td className="qo-wrap">{row.text}</td>
        <td>{row.addedBy || '—'}</td>
        <td className="qo-actions-cell">
          <button type="button" className="qo-icon-btn qo-icon-danger" title="Delete remark" onClick={() => setRemarkToDelete(row)}>
            <Trash2 />
          </button>
        </td>
      </tr>
    ));
  };

  const documentColumns = [
    { key: 'documentName', label: 'File Name', width: 300 },
    { key: 'documentType', label: 'Type', width: 150 },
    { key: 'createdAt', label: 'Uploaded On', width: 180 },
    { key: 'uploadedBy', label: 'Uploaded By', width: 160 },
    { key: 'actions', label: 'Actions', width: 110, align: 'right' }
  ];

  const docMenuItems = (row) => [
    { key: 'view', label: 'View', icon: Eye },
    { key: 'download', label: 'Download', icon: Download },
    { key: 'details', label: 'Details / Version History / Audit', icon: Info },
    { key: 'open-record', label: 'Open Related Record', icon: Link2 },
    { divider: true },
    { key: 'regenerate', label: 'Regenerate', icon: RefreshCw },
    { key: 'archive', label: row.status === 'archived' ? 'Restore' : 'Archive', icon: Archive },
    { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
  ];

  const handleDocMenu = (row, key) => {
    switch (key) {
      case 'view':
        documentService.openForPreview(row).catch((e) => toast.error(e?.message || 'Could not open the document'));
        break;
      case 'download':
        documentService.downloadFile(row).catch((e) => toast.error(e?.message || 'Could not download the document'));
        break;
      case 'details':
        openDocDetails(row);
        break;
      case 'open-record':
        if (row.relatedRecordId) navigate(`/quotations/${row.relatedRecordId}/view`);
        break;
      case 'regenerate':
        runDocAction(() => documentService.regenerate(row.id), `${row.documentName} regenerated`);
        break;
      case 'archive':
        setDocToArchive(row);
        break;
      case 'delete':
        setDocToDelete(row);
        break;
      default:
        break;
    }
  };

  const renderDocuments = (compact = false) => {
    if (documentsState.loading) return <LoadingRow />;
    if (documentsState.error) return <ErrorState message={documentsState.error} onRetry={loadDocuments} />;
    if (!documents.length) {
      return <EmptyState icon={FileText} title="No Documents" subtitle="Generated and uploaded documents appear here." />;
    }
    const rows = compact ? documents.slice(0, 4) : documents;
    return renderRows(documentColumns, rows, (row) => (
      <tr key={row.id}>
        <td className="qo-wrap">
          <span className="qo-file-name">
            <FileText /> {row.documentName}
          </span>
        </td>
        <td>{row.documentType || '—'}</td>
        <td>{dt(row.createdAt)}</td>
        <td>{row.uploadedBy || '—'}</td>
        <td className="qo-actions-cell">
          <button type="button" className="qo-icon-btn" title="View" onClick={() => handleDocMenu(row, 'view')}>
            <Eye />
          </button>
          <button type="button" className="qo-icon-btn" title="Download" onClick={() => handleDocMenu(row, 'download')}>
            <Download />
          </button>
          <button type="button" className="qo-icon-btn qo-icon-danger" title="Delete" onClick={() => handleDocMenu(row, 'delete')}>
            <Trash2 />
          </button>
          <ActionMenu items={docMenuItems(row)} onAction={(key) => handleDocMenu(row, key)} triggerClassName="erp-row-action-btn" buttonLabel="More document actions" />
        </td>
      </tr>
    ));
  };

  return (
    /* `erp-detail-scope` opts this page into the shared detail-page action
       standard (styles/erp-detail-scope.css) — same class family as the CRM
       view pages, so Back / Edit / Print / More get the reference geometry. */
    <div className="erp-detail-scope purchase-page cpr-page">
      {/* ===== BREADCRUMB ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/sales')}>Sales</a>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <a onClick={() => navigate('/sales')}>Sales Execution</a>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>{no || doc.id}</span>
      </nav>

      {/* ===== HISTORICAL REVISION BANNER ===== */}
      {isHistorical && (
        <div className="qpo-historical-banner">
          <strong>
            <GitBranch style={{ width: 14, height: 14 }} /> Historical Revision — Read Only
          </strong>
          <span className="qpo-hb-chip">
            {config.title}: {no}
          </span>
          <span className="qpo-hb-chip">Revision: {docRevision}</span>
          <span className="qpo-hb-chip">Status: Historical Revision</span>
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            This is a preserved snapshot. Use Edit on the current quotation to create the next revision.
          </span>
          {/* Obvious way back to the editable current version. */}
          {currentRevisionRoute && (
            <button
              type="button"
              className="qpo-hb-chip qpo-hb-chip-action"
              onClick={() => navigate(currentRevisionRoute)}
            >
              <GitBranch style={{ width: 12, height: 12 }} /> Go to Current version
            </button>
          )}
        </div>
      )}

      {/* ===== HEADER ===== */}
      <div className="qo-header">
        <div className="qo-header-main">
          <div className="qo-header-title">
            <h1>{no || doc.id}</h1>
            <SalesStatusBadge status={doc.status} />
            {docRevision > 0 && (
              <span className={`qo-chip ${isHistorical ? 'qo-chip-pending' : 'qo-chip-completed'}`}>
                <GitBranch size={11} /> {isHistorical ? `Historical Revision ${docRevision}` : `Revision ${docRevision}`}
              </span>
            )}
            <EditCountBadge moduleKey={config.moduleKey} recordId={id} />
          </div>
          <div className="erp-detail-actions">
            {/* ERP detail-page layout: Back / Edit / Preview / PDF + the primary
                action, with every other action (Duplicate, Follow-up, Share,
                Email, Archive/Restore, Delete, …) in the ⋯ More menu. */}
            <button type="button" className="erp-detail-action" onClick={() => navigate(config.listRoute)}>
              <ArrowLeft /> Back to List
            </button>
            {editable && (
              <button type="button" className="erp-detail-action" onClick={() => navigate(editRoute)}>
                <Pencil /> Edit
              </button>
            )}
            <button type="button" className="erp-detail-action" onClick={handlePrint}>
              <Eye /> Preview
            </button>
            <button type="button" className="erp-detail-action" onClick={handlePdf} disabled={actionLoading}>
              <FileDown /> Download PDF
            </button>
            <button
              type="button"
              className="erp-detail-action erp-detail-action--primary"
              onClick={createPo}
              disabled={actionLoading}
            >
              <Package /> {poReady ? 'View PO' : 'Create PO'}
            </button>
            <ActionMenu
              items={headerActions.map((a) => ({ key: a.key, label: a.label, icon: a.icon, danger: a.style === 'danger' }))}
              onAction={(key) => headerActions.find((a) => a.key === key)?.action()}
              triggerClassName="erp-detail-action erp-detail-action--more"
              buttonLabel="More quotation actions"
              label="More"
            />
          </div>
        </div>

        {/* ===== QUOTATION SUMMARY STRIP ===== */}
        <div className="qo-summary">
          {summaryItems.map((s) => (
            <div className="qo-summary-item" key={s.label}>
              <span className="qo-summary-k">{s.label}</span>
              <span className="qo-summary-sep">:</span>
              <span className="qo-summary-v">
                {s.value || '—'}
                {s.chip && <span className="qo-chip qo-chip-blue">{s.chip}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ===== TABS ===== */}
      <div className="qpo-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`qpo-tab${active ? ' active' : ''}`}>
              <Icon /> {t.label}
              {t.count != null && (
                <span className="qpo-badge qpo-badge-gray" style={{ padding: '0px 7px', fontSize: 10 }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ===== OVERVIEW PANE ===== */}
      {tab === 'overview' && (
        <>
          <div className="qo-grid-4">
            {clientDetailsCard}
            {quotationDetailsCard}
            {financialCard}
            {otherInfoCard}
          </div>

          {/* -------- Items -------- */}
          <div className="qpo-view-section qo-section-flush">
            <div className="qo-section-bar">
              <SectionHeader icon={Package} title="Items" count={`${items.length} item${items.length === 1 ? '' : 's'}`} />
              <div className="qo-section-actions">
                {items.length > 0 && manageColumnsButton}
                {editable && (
                  <button type="button" className="qpo-btn qpo-btn-primary" onClick={() => navigate(editRoute)}>
                    <Plus /> Add Item
                  </button>
                )}
              </div>
            </div>
            {items.length === 0 ? (
              <div style={{ padding: '0 20px 20px' }}>
                <EmptyState icon={Package} title="No Items" subtitle="Add items to this quotation from the edit page." />
              </div>
            ) : (
              <DynamicDetailTable
                columns={itemDetailColumns}
                rows={itemDetailRows}
                className="qpo-table"
                wrapClassName="qpo-table-wrap"
                minWidth={resize.totalWidth(itemDetailColumns) || 760}
                resolveWidth={(col) => resize.widthOf(col)}
                headerExtra={(col) => <ColumnResizer column={col} resize={resize} />}
                emptyNoun="items"
                rowClassName={itemRowClass}
              />
            )}
          </div>

          {/* -------- Follow-ups -------- */}
          <div className="qpo-view-section qo-section-flush">
            <div className="qo-section-bar">
              <SectionHeader icon={Users} title="Follow-ups" count={`${followUps.length} record${followUps.length === 1 ? '' : 's'}`} />
              <div className="qo-section-actions">
                <button type="button" className="qpo-btn qpo-btn-primary" onClick={openAddFollowUp}>
                  <Plus /> Add Follow-up
                </button>
              </div>
            </div>
            {renderFollowUps()}
          </div>

          {/* -------- Remarks + Documents -------- */}
          <div className="qo-grid-2">
            <div className="qpo-view-section qo-section-flush">
              <div className="qo-section-bar">
                <SectionHeader icon={MessageCircle} title="Remarks" count={`${remarks.length}`} />
                <div className="qo-section-actions">
                  <button type="button" className="qpo-btn qpo-btn-primary" onClick={() => { setRemarkText(''); setRemarkError(''); setRemarkModal(true); }}>
                    <Plus /> Add Remark
                  </button>
                </div>
              </div>
              {renderRemarks(true)}
            </div>

            <div className="qpo-view-section qo-section-flush">
              <div className="qo-section-bar">
                <SectionHeader icon={FileText} title="Documents" count={`${documents.length}`} />
                <div className="qo-section-actions">
                  <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => setTab('documents')}>
                    <Layers /> Manage
                  </button>
                </div>
              </div>
              {renderDocuments(true)}
            </div>
          </div>

          {/* -------- Terms | Additional info | Activity -------- */}
          <div className="qo-grid-3">
            <div className="qpo-view-section qo-card">
              <SectionHeader
                icon={StickyNote}
                title="Terms & Conditions"
                action={editable ? (
                  <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(editRoute)}>
                    <Pencil /> Edit
                  </button>
                ) : null}
              />
              {doc.terms ? (
                <div className="qo-longtext">{doc.terms}</div>
              ) : (
                <EmptyState icon={StickyNote} title="No Terms" />
              )}
            </div>

            <div className="qpo-view-section qo-card">
              <SectionHeader
                icon={Info}
                title="Additional Information"
                action={editable ? (
                  <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(editRoute)}>
                    <Pencil /> Edit
                  </button>
                ) : null}
              />
              {doc.additionalInfo || doc.remarks ? (
                <div className="qo-longtext">{doc.additionalInfo || doc.remarks}</div>
              ) : (
                <EmptyState icon={Info} title="No Additional Information" />
              )}
            </div>

            <div className="qpo-view-section qo-card">
              <SectionHeader
                icon={History}
                title="Activity History"
                action={activityEvents.length > 4 ? (
                  <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => setTab('history')}>
                    View All
                  </button>
                ) : null}
              />
              {activityEvents.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No Activity" />
              ) : (
                activityEvents.slice(0, 5).map((a, i) => {
                  const Icon = ACTIVITY_ICONS[a.icon] || ACTIVITY_ICONS.default;
                  return (
                    <div key={`${a.text}-${a.date}-${i}`} className="qo-activity-item">
                      <span className="qo-activity-icon">
                        <Icon style={{ width: 13, height: 13 }} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div className="qo-activity-text">{a.text}</div>
                        <div className="qo-activity-date">{formatDateTime(a.date)}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </>
      )}

      {/* ===== ITEMS PANE ===== */}
      {tab === 'items' && (
        <div className="qpo-view-section qo-section-flush">
          <div className="qo-section-bar">
            <SectionHeader icon={Layers} title="Item Details" count={`${items.length} records`} />
            <div className="qo-section-actions">
              {items.length > 0 && manageColumnsButton}
              {editable && (
                <button type="button" className="qpo-btn qpo-btn-primary" onClick={() => navigate(editRoute)}>
                  <Plus /> Add Item
                </button>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div style={{ padding: '0 20px 20px' }}>
              <EmptyState icon={Package} title="No Items" />
            </div>
          ) : (
            itemsFooter
          )}
        </div>
      )}

      {/* ===== TERMS PANE ===== */}
      {tab === 'terms' && (
        <div className="qpo-view-section qo-card">
          <SectionHeader
            icon={StickyNote}
            title="Terms & Conditions"
            action={editable ? (
              <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(editRoute)}>
                <Pencil /> Edit
              </button>
            ) : null}
          />
          {doc.terms ? <div className="qo-longtext">{doc.terms}</div> : <EmptyState icon={StickyNote} title="No Terms" />}
        </div>
      )}

      {/* ===== FOLLOW-UPS PANE ===== */}
      {tab === 'follow-ups' && (
        <div className="qpo-view-section qo-section-flush">
          <div className="qo-section-bar">
            <SectionHeader icon={Users} title="Follow-ups" count={`${followUps.length} records`} />
            <div className="qo-section-actions">
              <button type="button" className="qpo-btn qpo-btn-primary" onClick={openAddFollowUp}>
                <Plus /> Add Follow-up
              </button>
            </div>
          </div>
          {renderFollowUps()}
        </div>
      )}

      {/* ===== REMARKS PANE ===== */}
      {tab === 'remarks' && (
        <div className="qpo-view-section qo-section-flush">
          <div className="qo-section-bar">
            <SectionHeader icon={MessageCircle} title="Remarks" count={`${remarks.length} records`} />
            <div className="qo-section-actions">
              <button type="button" className="qpo-btn qpo-btn-primary" onClick={() => { setRemarkText(''); setRemarkError(''); setRemarkModal(true); }}>
                <Plus /> Add Remark
              </button>
            </div>
          </div>
          {renderRemarks()}
        </div>
      )}

      {/* ===== DOCUMENTS PANE ===== */}
      {tab === 'documents' && (
        <div className="qpo-view-section">
          <SectionHeader icon={FileText} title="Documents" count={`${documents.length} files`} />
          <p className="qo-hint">
            Documents stored in the ERP document repository for <strong>{no}</strong>. Historical versions open the file that was
            stored at the time — they are never replaced by the latest one.
          </p>
          {renderDocuments()}
        </div>
      )}

      {/* ===== HISTORY PANE ===== */}
      {tab === 'history' && (
        <div className="qpo-view-section">
          <SectionHeader icon={History} title="History" count={`${timelineEvents.length} events`} />
          {timelineEvents.length === 0 ? (
            <EmptyState icon={Clock} title="No Timeline Events" />
          ) : (
            <div className="qpo-audit-timeline">
              {timelineEvents.map((event) => (
                <TimelineEvent key={`${event.title}-${event.date}`} event={event} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 20 }}>
            <SectionHeader icon={GitBranch} title="Version History" count={`${versionHistory.length} records`} />
            {/* What makes THIS version different from the one before it. Shown
                here and on a historical revision; never on a normal view. */}
            <div style={{ marginBottom: 12 }}>
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
              revisions={doc.revisions}
              docNumber={no}
              currentId={doc.id}
              viewRoute={(rev) => `/quotations/${rev.id}/view`}
              navigate={navigate}
            />
            {editHistory.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <EditHistoryTimeline moduleKey={config.moduleKey} recordId={id} limit={50} />
              </div>
            )}
            {versionHistory.length > 0 && (
              <div className="qo-table-wrap" style={{ marginTop: 12 }}>
                <table className="qpo-table" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Date</th>
                      <th>Field</th>
                      <th>Changed By</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {versionHistory.map((h, i) => (
                      <tr key={`${h.createdAt}-${i}`}>
                        <td style={{ fontWeight: 700 }}>v{versionHistory.length - i}</td>
                        <td>{formatDateTime(h.createdAt)}</td>
                        <td>
                          {cpoText(h.field) || '—'}
                          {h.oldValue && <span style={{ color: '#9ca3af' }}>: {cpoText(h.oldValue)} → {cpoText(h.newValue)}</span>}
                        </td>
                        <td>{h.changedBy || '—'}</td>
                        <td>{cpoText(h.newValue) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== ATTACHMENTS PANE ===== */}
      {tab === 'attachments' && (
        <div className="qpo-view-section">
          <SectionHeader icon={Paperclip} title="Attachments" count={`${attachments.length} files`} />
          <SalesAttachments service={config.service} docId={id} attachments={attachments} onChanged={load} />
        </div>
      )}

      {/* ===== LINKED DOCUMENTS PANE ===== */}
      {tab === 'linked-documents' && (
        <div className="qpo-view-section">
          <SectionHeader icon={Link2} title="Linked Documents" count={`${linkedDocs.length} links`} />
          {linkedDocs.length === 0 ? (
            <EmptyState icon={Link2} title="No Linked Documents" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {linkedDocs.map((link) => (
                <div key={link.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Link2 style={{ width: 14, height: 14, color: '#0B4A3D' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, width: 140 }}>{link.label}</span>
                    {link.onClick ? (
                      <button type="button" onClick={link.onClick} style={{ fontSize: 13, fontWeight: 600, color: '#0B4A3D', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, sans-serif' }}>
                        {link.value}
                      </button>
                    ) : (
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{link.value}</span>
                    )}
                  </div>
                  {link.onClick && <FileText style={{ width: 14, height: 14, color: '#cbd5e1' }} />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== APPROVAL HISTORY PANE ===== */}
      {tab === 'approval-history' && (
        <div className="qpo-view-section">
          <SectionHeader icon={CheckCheck} title="Approval Status" />
          <div className="qpo-workflow" style={{ marginBottom: 20 }}>
            {approvalSteps.map((step, i) => {
              const done = approvalIdx >= 0 && i <= approvalIdx;
              return (
                <div key={step} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                  <div className={`qpo-workflow-node${done ? ' completed' : ''}`} title={step}>
                    {i < approvalIdx ? <Check style={{ width: 13, height: 13 }} /> : i + 1}
                  </div>
                  {i < approvalSteps.length - 1 && <div className="qpo-workflow-connector" />}
                </div>
              );
            })}
          </div>
          <SectionHeader icon={History} title="Approval History" count={`${activityEvents.length} records`} />
          {activityEvents.length === 0 ? (
            <EmptyState icon={History} title="No Approval Activity" />
          ) : (
            <div>
              {activityEvents.map((a, i) => (
                <div key={`${a.text}-${a.date}-${i}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0', borderBottom: '1px solid #f3f4f6', fontSize: 13 }}>
                  <span style={{ width: 28, height: 28, borderRadius: 8, background: '#E8F0EE', color: '#0B4A3D', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check style={{ width: 13, height: 13 }} />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#374151' }}>{a.text}</div>
                    <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{formatDateTime(a.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== FOLLOW-UP DIALOG ===== */}
      <Modal
        open={!!fuModal}
        onClose={() => setFuModal(null)}
        title={fuModal?.id ? 'Edit Follow-up' : 'Add Follow-up'}
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => setFuModal(null)} disabled={fuSaving}>
              Cancel
            </button>
            <button type="button" className="qpo-btn qpo-btn-primary" onClick={saveFollowUp} disabled={fuSaving}>
              {fuSaving ? <Loader2 className="qo-spin" /> : <Check />} {fuModal?.id ? 'Update Follow-up' : 'Save Follow-up'}
            </button>
          </>
        }
      >
        {fuErrors.submit && <div className="qo-form-error">{fuErrors.submit}</div>}
        <div className="qo-form-grid">
          <FormField label="Follow-up Date" required error={fuErrors.followupDate}>
            <TextInput type="date" value={fuForm.followupDate} onChange={(e) => setFuForm((p) => ({ ...p, followupDate: e.target.value }))} />
          </FormField>
          <FormField label="Type" required error={fuErrors.mode}>
            <ManagedSelect
              categoryKey="fu_mode"
              value={fuForm.mode}
              onChange={(v) => setFuForm((p) => ({ ...p, mode: v }))}
              placeholder="Select type"
              error={!!fuErrors.mode}
            />
          </FormField>
          <FormField label="Contact Person">
            <TextInput value={fuForm.contactPerson} onChange={(e) => setFuForm((p) => ({ ...p, contactPerson: e.target.value }))} placeholder="Contact person" />
          </FormField>
          <FormField label="Status">
            <ManagedSelect
              categoryKey="fu_status"
              value={fuForm.status}
              onChange={(v) => setFuForm((p) => ({ ...p, status: v }))}
              placeholder="Select status"
            />
          </FormField>
          <FormField label="Next Follow-up">
            <TextInput type="date" value={fuForm.nextFollowupDate} onChange={(e) => setFuForm((p) => ({ ...p, nextFollowupDate: e.target.value }))} />
          </FormField>
          <FormField label="Assigned To">
            <TextInput value={fuForm.assignTo} onChange={(e) => setFuForm((p) => ({ ...p, assignTo: e.target.value }))} placeholder="Assigned to" />
          </FormField>
        </div>
        <FormField label="Remarks">
          <TextArea rows={4} value={fuForm.discussionSummary} onChange={(e) => setFuForm((p) => ({ ...p, discussionSummary: e.target.value }))} placeholder="What was discussed…" />
        </FormField>
      </Modal>

      {/* ===== ADD REMARK DIALOG ===== */}
      <Modal
        open={remarkModal}
        onClose={() => setRemarkModal(false)}
        title="Add Remark"
        maxWidth="max-w-lg"
        footer={
          <>
            <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => setRemarkModal(false)} disabled={remarkSaving}>
              Cancel
            </button>
            <button type="button" className="qpo-btn qpo-btn-primary" onClick={saveRemark} disabled={remarkSaving}>
              {remarkSaving ? <Loader2 className="qo-spin" /> : <Plus />} Add Remark
            </button>
          </>
        }
      >
        <FormField label="Remark" required error={remarkError}>
          <TextArea rows={5} value={remarkText} onChange={(e) => setRemarkText(e.target.value)} placeholder="Enter the remark…" />
        </FormField>
      </Modal>

      {/* ===== DOCUMENT DETAILS DIALOG ===== */}
      <Modal
        open={!!docDetails}
        onClose={() => setDocDetails(null)}
        title={docDetails?.row?.documentName || 'Document Details'}
        maxWidth="max-w-2xl"
        footer={
          <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => setDocDetails(null)}>
            Close
          </button>
        }
      >
        {docBusy && <LoadingRow />}
        {docDetails?.row && (
          <>
            <div className="qo-detail-grid">
              <Field label="Document Type">{docDetails.row.documentType || '—'}</Field>
              <Field label="Module">{docDetails.row.module || '—'}</Field>
              <Field label="Record Number">{docDetails.row.recordNumber || '—'}</Field>
              <Field label="Version">v{docDetails.row.versionNumber || 1}</Field>
              <Field label="Status">{docDetails.row.status || '—'}</Field>
              <Field label="Visibility">{docDetails.row.visibility || '—'}</Field>
              <Field label="Uploaded By">{docDetails.row.uploadedBy || '—'}</Field>
              <Field label="Uploaded On">{dt(docDetails.row.createdAt)}</Field>
              <Field label="File Size">{docDetails.row.fileSize ? `${Math.max(1, Math.round(docDetails.row.fileSize / 1024))} KB` : '—'}</Field>
            </div>

            <SectionHeader icon={GitBranch} title="Version History" count={`${docDetails.versions.length}`} />
            {docDetails.versions.length === 0 ? (
              <EmptyState icon={GitBranch} title="No stored versions" />
            ) : (
              <div className="qo-table-wrap">
                <table className="qpo-table">
                  <thead>
                    <tr>
                      <th>Version</th>
                      <th>Stored At</th>
                      <th>By</th>
                      <th>Notes</th>
                      <th className="qpo-th-right">File</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docDetails.versions.map((v, i) => (
                      <tr key={v.id || i}>
                        <td>v{v.versionNumber || i + 1}</td>
                        <td>{dt(v.createdAt)}</td>
                        <td>{v.uploadedBy || '—'}</td>
                        <td className="qo-wrap">{v.changeNotes || '—'}</td>
                        <td className="qpo-th-right">
                          <button
                            type="button"
                            className="qo-icon-btn"
                            title="Download this historical version"
                            onClick={() => documentService.downloadFile({ ...v, versionRow: true }).catch((e) => toast.error(e?.message || 'Could not download'))}
                          >
                            <Download />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <SectionHeader icon={ClipboardList} title="Audit Trail" count={`${docDetails.audit.length}`} />
              {docDetails.audit.length === 0 ? (
                <EmptyState icon={ClipboardList} title="No audit entries" />
              ) : (
                <div className="qo-table-wrap">
                  <table className="qpo-table">
                    <thead>
                      <tr>
                        <th>Date &amp; Time</th>
                        <th>Action</th>
                        <th>By</th>
                        <th>Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docDetails.audit.map((a, i) => (
                        <tr key={a.id || i}>
                          <td>{dt(a.createdAt)}</td>
                          <td>{a.action || '—'}</td>
                          <td>{a.performedBy || '—'}</td>
                          <td className="qo-wrap">{a.details || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      {/* ===== CONFIRM DIALOGS ===== */}
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
      <ConfirmDialog
        open={!!fuToDelete}
        title="Delete Follow-up"
        message={fuToDelete ? `Remove the follow-up dated ${dt(fuToDelete.followupDate)}? It moves to trash and can be restored.` : ''}
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={deleteFollowUp}
        onCancel={() => setFuToDelete(null)}
      />
      <ConfirmDialog
        open={!!remarkToDelete}
        title="Delete Remark"
        message="Delete this remark? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        loading={actionLoading}
        onConfirm={deleteRemark}
        onCancel={() => setRemarkToDelete(null)}
      />
      <ConfirmDialog
        open={!!docToArchive}
        title={docToArchive?.status === 'archived' ? 'Restore Document' : 'Archive Document'}
        message={docToArchive?.status === 'archived'
          ? `Restore "${docToArchive?.documentName}"?`
          : `Archive "${docToArchive?.documentName}"? It can be restored later.`}
        confirmLabel={docToArchive?.status === 'archived' ? 'Restore' : 'Archive'}
        variant="warning"
        loading={docBusy}
        onConfirm={async () => {
          const row = docToArchive;
          setDocToArchive(null);
          await runDocAction(
            () => (row.status === 'archived' ? documentService.restore(row.id) : documentService.archive(row.id)),
            row.status === 'archived' ? 'Document restored' : 'Document archived'
          );
        }}
        onCancel={() => setDocToArchive(null)}
      />
      <ConfirmDialog
        open={!!docToDelete}
        title="Delete Document"
        message={`Move "${docToDelete?.documentName}" to trash?`}
        confirmLabel="Delete"
        variant="danger"
        loading={docBusy}
        onConfirm={async () => {
          const row = docToDelete;
          setDocToDelete(null);
          await runDocAction(() => documentService.delete(row.id), 'Document deleted');
        }}
        onCancel={() => setDocToDelete(null)}
      />

      <style>{`@keyframes qpo-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
