import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  History,
  Info,
  Layers,
  Link2,
  Paperclip,
  Pencil,
  Tag,
  Trash2,
  User,
  Users,
  Zap
} from 'lucide-react';
import { ActionMenu, ConfirmDialog, useCurrentUser, useToast } from '../../components/Common';
import { detailActionClass } from '../../components/Common/detailActionClasses';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import SalesAttachments from '../../components/SalesDetail/SalesAttachments';
import RecordVersionHistory from '../../components/EditHistory/RecordVersionHistory';
import {
  ACTIVITY_ICONS,
  CardButton,
  CardHeader,
  EmptyState,
  KpiCard,
  Row,
  TimelineEvent,
  buildActivityEvents,
  buildTimelineEvents,
  formatBytes
} from '../../components/SalesDetail/salesViewShared';
import salesOrderEActionService from '../../services/salesOrderEActionService';
import salesOrderService from '../../services/salesOrderService';
import { cpoNo } from '../../utils/salesHelpers';
import { formatDate, formatDateTime, formatINR, formatRelativeTime } from '../../utils/leadHelpers';
import { downloadFile, openFileInNewTab } from '../../utils/fileAccess';
import { E_ACTION_STATUS_OPTIONS } from '../../utils/salesOrderColumns';
import '../crm/crm-erp.css';

/* ------------------------------------------------------------------
 * E-Action View / Overview — the standalone E-Action detail page.
 *
 * It follows the SAME structure as the Customer Purchase Order view
 * (components/SalesDetail/SalesViewPage.jsx): breadcrumb → sticky header with
 * the ERP action row → tab strip → two-column body with a summary rail, using
 * the shared primitives from salesViewShared.jsx and the shared status badge,
 * attachments panel, Manage-Columns toolkit and confirm dialog.
 *
 * Every value comes from the real `sales_order_e_actions` row plus its related
 * CPO. Nothing is mocked; the timeline/activity entries are the record's real
 * stored dates and the CPO's real timeline / audit rows.
 * ------------------------------------------------------------------ */

const LIST_ROUTE = '/sales-orders/e-actions';

/**
 * Canonical custom-column JSON: stored snapshots hold the raw `customFieldsJson`
 * string while the live read model returns a parsed map, so both are reduced to
 * sorted key/value JSON. An absent or empty map becomes '', matching a null
 * column instead of looking like an edit.
 */
function canonicalCustomFields(value) {
  let object = value;
  if (typeof value === 'string') {
    if (!value.trim()) return '';
    try {
      object = JSON.parse(value);
    } catch {
      return value;
    }
  }
  if (!object || typeof object !== 'object') return '';
  const entries = Object.entries(object)
    .filter(([key, entryValue]) => key && entryValue != null && String(entryValue) !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entryValue]) => [key, String(entryValue)]);
  return entries.length > 0 ? JSON.stringify(Object.fromEntries(entries)) : '';
}

/**
 * One comparable shape for an E-Action revision and the live row: dates are
 * date-only (the view read model only carries the date), custom columns are
 * canonical JSON, and read-model-only fields are dropped.
 */
function eActionSnapshot(source) {
  if (!source || typeof source !== 'object') return source;
  const out = { ...source };
  ['requestedOn', 'startedOn', 'completedOn'].forEach((key) => {
    if (typeof out[key] === 'string' && out[key]) out[key] = out[key].slice(0, 10);
  });
  out.customFieldsJson = canonicalCustomFields(out.customFieldsJson ?? out.customFields);
  delete out.customFields;
  delete out.salesOrderId;
  delete out.customer;
  return out;
}

export default function EActionViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // SALES_DELETE, mirrored from the backend role → permission map — the delete
  // entry in the More menu below is gated on it (the backend still enforces it).
  const { canDeleteSales } = useCurrentUser();
  const toast = useToast();

  const [action, setAction] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'overview');

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const res = await salesOrderEActionService.get(id);
      const row = res?.data ?? res;
      if (!row?.id) {
        setNotFound(true);
        setAction(null);
        return;
      }
      setAction(row);
      // The related CPO drives the release/participation context, customer,
      // linked documents, timeline, audit trail and attachments.
      if (row.salesOrderId) {
        try {
          const orderRes = await salesOrderService.get(row.salesOrderId);
          setOrder(orderRes?.data ?? orderRes ?? null);
        } catch {
          setOrder(null);
        }
      } else {
        setOrder(null);
      }
    } catch {
      setNotFound(true);
      setAction(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (fn, successMsg, navigateBack = false) => {
    setActionLoading(true);
    try {
      await fn();
      toast.success(successMsg);
      if (navigateBack) {
        navigate(LIST_ROUTE);
        return;
      }
      await load();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // An E-Action raised against a manually entered CPO reference has no CPO id
  // to address it by (no Customer Purchase Order holds the row), so those calls
  // go through the own-id endpoints instead of the CPO-scoped ones.
  const updateEAction = (payload) =>
    action.salesOrderId
      ? salesOrderEActionService.update(action.salesOrderId, action.id, payload)
      : salesOrderEActionService.updateStandalone(action.id, payload);

  const changeStatus = (status) =>
    runAction(
      () => updateEAction({
        participantTeam: action.participantTeam,
        assignedAction: action.assignedAction,
        assignedTo: action.assignedTo,
        status,
        requestedOn: action.requestedOn,
        startedOn: action.startedOn,
        completedOn: action.completedOn,
        result: action.result,
        remarks: action.remarks,
        customFields: action.customFields || {}
      }),
      `E-Action marked ${status}`
    );

  const removeAction = async () => {
    setActionLoading(true);
    try {
      await (action.salesOrderId
        ? salesOrderEActionService.remove(action.salesOrderId, action.id)
        : salesOrderEActionService.removeStandalone(action.id));
      toast.success('E-Action deleted');
      navigate(LIST_ROUTE);
    } catch (err) {
      toast.error(err?.message || 'Failed to delete the E-Action');
    } finally {
      setActionLoading(false);
      setConfirm(false);
    }
  };

  const attachments = useMemo(() => (Array.isArray(order?.attachments) ? order.attachments : []), [order]);

  // ---- Timeline: the E-Action's OWN stored dates + the CPO's recorded events.
  const timelineEvents = useMemo(() => {
    if (!action) return [];
    const own = [];
    const label = action.assignedAction || 'E-Action';
    if (action.createdAt) {
      own.push({
        title: 'E-Action Created',
        desc: `${label} recorded on ${cpoNo(action.cpoNo) || action.cpoReference || 'the related CPO'}.`,
        date: action.createdAt,
        type: 'created'
      });
    }
    if (action.requestedOn) {
      own.push({
        title: 'E-Action Requested',
        desc: [action.participantTeam, action.assignedTo ? `Assigned to ${action.assignedTo}` : ''].filter(Boolean).join(' · ') || label,
        date: action.requestedOn,
        type: 'submitted'
      });
    }
    if (action.startedOn) {
      own.push({ title: 'E-Action Started', desc: action.participantTeam || label, date: action.startedOn, type: 'created' });
    }
    if (action.completedOn) {
      own.push({
        title: 'E-Action Completed',
        desc: action.result ? `Result: ${action.result}` : action.participantTeam || label,
        date: action.completedOn,
        type: 'completed'
      });
    }
    const cpoEvents = order
      ? [
          ...(Array.isArray(order.timeline) && order.timeline.length > 0
            ? order.timeline.map((t) => ({ title: t.title, desc: t.detail, date: t.createdAt, type: t.type }))
            : buildTimelineEvents(order, cpoNo(order.soNo), 'Customer Purchase Order'))
        ]
      : [];
    return [...own, ...cpoEvents].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [action, order]);

  // ---- Activity log: the CPO's real audit rows + this record's creation.
  const activityEvents = useMemo(() => {
    if (!action) return [];
    const own = action.createdAt
      ? [{ text: `E-Action “${action.assignedAction || action.id}” was created.`, date: action.createdAt, icon: 'plus' }]
      : [];
    const cpoActivity = order ? buildActivityEvents(order, cpoNo(order.soNo)) : [];
    return [...own, ...cpoActivity].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [action, order]);

  const linkedDocs = useMemo(() => {
    const docs = [];
    const row = (label, value, onClick) => {
      if (value) docs.push({ label, value, onClick });
    };
    // This runs on EVERY render, including the first one where the row is still
    // loading (and the not-found state), so `action` can legitimately be null
    // here — the early returns below render the loader / not-found page then.
    if (!action) return docs;
    if (!order) {
      // Raised against a CPO reference that is not one of our CPO records: the
      // reference is still the document's CPO context, there is just no record
      // to open — so it is listed as text rather than a link.
      row('Customer Purchase Order', action.cpoReference);
      return docs;
    }
    row('Customer Purchase Order', cpoNo(order.soNo), () => navigate(`/sales-orders/${order.id}`));
    row('Lead', order.leadNo, order.leadNo ? () => navigate('/leads') : undefined);
    row('Quotation', order.qtnRef, order.qtnRef ? () => navigate('/quotations') : undefined);
    row('Sales Contract', order.scRef, order.scRef ? () => navigate('/sales-contracts') : undefined);
    row('Proforma Invoice', order.convertedToProforma, order.convertedToProforma ? () => navigate('/proforma-invoices') : undefined);
    row('Delivery Challan', order.convertedToDc, order.convertedToDc ? () => navigate('/delivery-challans') : undefined);
    row('Invoice', order.convertedToInv, order.convertedToInv ? () => navigate('/invoices') : undefined);
    row('Credit Note', order.convertedToCn, order.convertedToCn ? () => navigate('/credit-notes') : undefined);
    row('Payment Receipt', order.convertedToPr, order.convertedToPr ? () => navigate('/payment-receipts') : undefined);
    return docs;
  }, [action, order, navigate]);

  if (loading) {
    return (
      <div className="purchase-page cpr-page">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !action) {
    return (
      <div className="purchase-page cpr-page">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <button className="bc-link" onClick={() => navigate(LIST_ROUTE)}>E-Actions</button>
        </nav>
        <div className="prm-card prm-card-body p-10 text-center">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">E-Action Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">The E-Action you are looking for does not exist or was deleted.</p>
          <button
            type="button"
            onClick={() => navigate(LIST_ROUTE)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to E-Actions
          </button>
        </div>
      </div>
    );
  }

  const statusOptions = E_ACTION_STATUS_OPTIONS.filter((s) => s !== action.status);
  const no = action.id;
  const initial = (action.assignedTo || action.participantTeam || 'E').charAt(0).toUpperCase();

  const TABS = [
    { key: 'overview', label: 'Overview', icon: Layers, count: null },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
    { key: 'history', label: 'History / Revisions', icon: History, count: null },
    { key: 'timeline', label: 'Timeline', icon: History, count: timelineEvents.length },
    { key: 'activities', label: 'Activity Log', icon: ClipboardList, count: activityEvents.length }
  ];

  return (
    /* `erp-detail-scope` opts this page into the shared detail-page action
       standard (styles/erp-detail-scope.css) — same class family as the CRM
       view pages, so its Back / actions get the reference geometry. */
    <div className="erp-detail-scope purchase-page cpr-page">
      {/* ===== BREADCRUMB ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate('/sales-orders')}>Customer Purchase Orders</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <button className="bc-link" onClick={() => navigate(LIST_ROUTE)}>E-Actions</button>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="bc-current">{action.assignedAction || `E-Action #${no}`}</span>
      </nav>

      {/* ===== STICKY HEADER ===== */}
      <div className="sticky top-0 z-20 bg-app">
        <div className="prm-card prm-card-body">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-[#083D34] to-[#083D34] text-white flex items-center justify-center text-xl font-bold shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <h1 className="pr-page-header-title">
                  <Users aria-hidden="true" />
                  {action.assignedAction || 'E-Action'}{' '}
                  <span className="text-slate-400 font-semibold">(E-Action #{no})</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Tag className="w-3 h-3 text-[#0B4A3D]" /> E-Action #{no}
                  </span>
                  <SalesStatusBadge status={action.status} />
                  {action.cpoNo && (
                    <button
                      type="button"
                      onClick={() => navigate(`/sales-orders/${action.salesOrderId}`)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B4A3D] hover:underline cursor-pointer"
                      title="Open the related Customer Purchase Order"
                    >
                      <FileText className="w-3 h-3" /> {cpoNo(action.cpoNo)}
                    </button>
                  )}
                  {!action.salesOrderId && action.cpoReference && (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600"
                      title="CPO reference entered on the form — no CPO record in the system"
                    >
                      <FileText className="w-3 h-3" /> {action.cpoReference}
                    </span>
                  )}
                  {action.participantTeam && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <User className="w-3 h-3 text-[#0B4A3D]" /> {action.participantTeam}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3 text-[#0B4A3D]" /> Requested {formatDate(action.requestedOn)}
                  </span>
                </div>
              </div>
            </div>
            <div className="erp-detail-actions">
              <button type="button" onClick={() => navigate(LIST_ROUTE)} className="erp-detail-action">
                <ArrowLeft /> Back
              </button>
              <button
                type="button"
                onClick={() => navigate(`${LIST_ROUTE}/${action.id}/edit`)}
                disabled={actionLoading}
                className={detailActionClass('secondary')}
              >
                <Pencil /> Edit
              </button>
              {statusOptions.length > 0 && (
                <ActionMenu
                  items={statusOptions.map((s) => ({ key: s, label: `Change Status → ${s}` }))}
                  onAction={(key) => changeStatus(key)}
                  triggerClassName="erp-detail-action"
                  label="Change Status"
                  buttonLabel="Change E-Action status"
                />
              )}
              {/* Delete E-Action is a SALES_DELETE action — without it the More
                  menu has nothing left to offer, so it is not rendered at all. */}
              {canDeleteSales && (
                <ActionMenu
                  items={[{ key: 'delete', label: 'Delete E-Action', icon: Trash2, danger: true }]}
                  onAction={() => setConfirm(true)}
                  triggerClassName="erp-detail-action erp-detail-action--more"
                  buttonLabel="More E-Action actions"
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

      {/* ===== OVERVIEW ===== */}
      {tab === 'overview' && (
        <div className="mt-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-7 gap-3 mb-4">
            <KpiCard
              icon={FileText}
              label="Related CPO"
              value={cpoNo(action.cpoNo) || '—'}
              linkLabel="Open CPO"
              onClick={action.salesOrderId ? () => navigate(`/sales-orders/${action.salesOrderId}`) : undefined}
            />
            <KpiCard icon={Activity} label="Status" value={<SalesStatusBadge status={action.status} />} linkLabel="View Timeline" onClick={() => setTab('timeline')} />
            <KpiCard icon={Users} label="Participant / Team" value={action.participantTeam || '—'} />
            <KpiCard icon={User} label="Assigned To" value={action.assignedTo || '—'} />
            <KpiCard icon={Calendar} label="Requested On" value={formatDate(action.requestedOn) || '—'} />
            <KpiCard icon={Clock} label="Started On" value={formatDate(action.startedOn) || '—'} />
            <KpiCard icon={Paperclip} label="Attachments" value={attachments.length} linkLabel="View Attachments" onClick={() => setTab('attachments')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
            <div className="flex flex-col gap-4">
              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={Info}
                  title="E-Action Details"
                  action={
                    <CardButton icon={Pencil} label="Edit" onClick={() => navigate(`${LIST_ROUTE}/${action.id}/edit`)} />
                  }
                />
                <Row label="E-Action ID"><strong>#{action.id}</strong></Row>
                <Row label="Customer Purchase Order">
                  {action.salesOrderId ? (
                    <button
                      type="button"
                      onClick={() => navigate(`/sales-orders/${action.salesOrderId}`)}
                      className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                    >
                      {cpoNo(action.cpoNo)} <FileText className="w-3 h-3" />
                    </button>
                  ) : (
                    // No CPO record behind the row: the reference that WAS typed
                    // is the CPO context, so it is shown instead of a blank.
                    action.cpoReference || '—'
                  )}
                </Row>
                <Row label="Participant / Team">{action.participantTeam || '—'}</Row>
                <Row label="Assigned Action">{action.assignedAction || '—'}</Row>
                <Row label="Assigned To">{action.assignedTo || '—'}</Row>
                <Row label="Status"><SalesStatusBadge status={action.status} /></Row>
                <Row label="Requested On">{formatDate(action.requestedOn) || '—'}</Row>
                <Row label="Started On">{formatDate(action.startedOn) || '—'}</Row>
                <Row label="Completed On">{formatDate(action.completedOn) || '—'}</Row>
                <Row label="Result">{action.result || '—'}</Row>
                <Row label="Remarks">{action.remarks || '—'}</Row>
              </div>

              {order && (
                <div className="prm-card prm-card-body">
                  <CardHeader
                    icon={Zap}
                    title="Release & Procurement Method"
                    action={<CardButton icon={Pencil} label="Open CPO" onClick={() => navigate(`/sales-orders/${order.id}`)} />}
                  />
                  {[
                    ['Release Method', order.releaseMethod],
                    ['Release Required', order.releaseRequired],
                    ['Action Type', order.actionType],
                    ['Release Date', order.releaseDate ? formatDate(order.releaseDate) : ''],
                    ['Release to Department', order.releaseToDepartment],
                    ['Participation Required', order.participationRequired],
                    ['Assigned To', order.assignedTo],
                    ['Department / Team', order.departmentTeam],
                    ['Action Deadline', order.actionDeadline ? formatDate(order.actionDeadline) : '']
                  ]
                    .filter(([, value]) => value != null && String(value).trim() !== '')
                    .map(([label, value]) => (
                      <Row key={label} label={label}>{value}</Row>
                    ))}
                  <Row label="Action Remarks">{order.actionRemarks || '—'}</Row>
                  <Row label="Instructions">{order.actionInstructions || '—'}</Row>
                </div>
              )}

              {order && (
                <div className="prm-card prm-card-body">
                  <CardHeader icon={User} title="Customer Details" />
                  <Row label="Client">{order.clientName || '—'}</Row>
                  <Row label="Contact Person">{order.contactPerson || '—'}</Row>
                  <Row label="Phone">{order.phone || '—'}</Row>
                  <Row label="Email">
                    {order.email ? (
                      <a href={`mailto:${order.email}`} className="text-[#0B4A3D] font-medium hover:underline">{order.email}</a>
                    ) : '—'}
                  </Row>
                  <Row label="GSTIN">{order.gstin || '—'}</Row>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4 lg:sticky lg:top-40">
              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={FileText}
                  title="Related CPO"
                  action={
                    action.salesOrderId ? (
                      <CardButton label="Open" onClick={() => navigate(`/sales-orders/${action.salesOrderId}`)} />
                    ) : null
                  }
                />
                {order ? (
                  <>
                    <Row label="CPO No">
                      <button
                        type="button"
                        onClick={() => navigate(`/sales-orders/${order.id}`)}
                        className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                      >
                        {cpoNo(order.soNo)} <FileText className="w-3 h-3" />
                      </button>
                    </Row>
                    <Row label="Customer">{order.clientName || '—'}</Row>
                    <Row label="Order Date">{formatDate(order.orderDate) || '—'}</Row>
                    <Row label="Status"><SalesStatusBadge status={order.status} /></Row>
                    <Row label="Total Amount">{formatINR(order.grandTotal, order.currency)}</Row>
                  </>
                ) : (
                  <EmptyState icon={FileText} title="CPO Not Available" subtitle="The related Customer Purchase Order could not be read." />
                )}
              </div>

              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={Link2}
                  title="Linked Documents"
                  count={linkedDocs.length}
                />
                {linkedDocs.length === 0 ? (
                  <EmptyState icon={Link2} title="No Linked Documents" />
                ) : (
                  linkedDocs.map((link) => (
                    <Row key={link.label} label={link.label}>
                      {link.onClick ? (
                        <button
                          type="button"
                          onClick={link.onClick}
                          className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                        >
                          {link.value} <FileText className="w-3 h-3" />
                        </button>
                      ) : (
                        <span>{link.value}</span>
                      )}
                    </Row>
                  ))
                )}
              </div>

              <div className="prm-card prm-card-body">
                <CardHeader
                  icon={Paperclip}
                  title="Attachments"
                  count={attachments.length}
                  action={<CardButton label="View All" onClick={() => setTab('attachments')} />}
                />
                {attachments.length === 0 ? (
                  <EmptyState icon={Paperclip} title="No Attachments" subtitle="No documents have been uploaded for the related Customer Purchase Order." />
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
                              <Paperclip className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              title="Download"
                              onClick={() => downloadFile(att.url, att.name || 'file').catch((err) => toast.error(err?.message || 'Failed to download file'))}
                              className="p-1.5 rounded-md text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="prm-card prm-card-body">
                <CardHeader icon={History} title="Timeline" count={`${timelineEvents.length} events`} />
                <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200 max-h-80 overflow-y-auto pr-1">
                  {timelineEvents.length === 0 ? (
                    <EmptyState icon={Clock} title="No Timeline Events" />
                  ) : (
                    timelineEvents.slice(0, 6).map((event) => (
                      <TimelineEvent key={`${event.title}-${event.date}`} event={event} />
                    ))
                  )}
                </div>
              </div>

              <div className="prm-card prm-card-body">
                <CardHeader icon={ClipboardList} title="Activity Log" />
                {activityEvents.length === 0 ? (
                  <EmptyState icon={ClipboardList} title="No Activity" />
                ) : (
                  activityEvents.slice(0, 4).map((a, i) => {
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
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== HISTORY / REVISIONS ===== */}
      {tab === 'history' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={History} title="History / Revisions" />
          <RecordVersionHistory
            module="e-action"
            recordId={action.id}
            record={action}
            docNumber={`E-Action #${action.id}`}
            status={action.status}
            revisionsUrl={`/sales-orders/e-actions/${action.id}/revisions`}
            historyUrl={`/sales-orders/e-actions/${action.id}/history`}
            snapshotNormalizer={eActionSnapshot}
          />
        </div>
      )}

      {/* ===== ATTACHMENTS ===== */}
      {tab === 'attachments' && (
        <div className="prm-card prm-card-body mt-4">
          <CardHeader icon={Paperclip} title="Attachments" count={`${attachments.length} files`} />
          <p className="text-[11px] text-slate-400 mb-3">
            Files are stored against this E-Action&apos;s Customer Purchase Order
            {order ? ` (${cpoNo(order.soNo)})` : ''} — the same attachment store the CPO page uses.
          </p>
          {order ? (
            <SalesAttachments service={salesOrderService} docId={order.id} attachments={attachments} onChanged={load} />
          ) : (
            <EmptyState icon={Paperclip} title="Related CPO unavailable" subtitle="Attachments could not be loaded." />
          )}
        </div>
      )}

      {/* ===== TIMELINE ===== */}
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

      {/* ===== ACTIVITY LOG ===== */}
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

      <ConfirmDialog
        open={confirm}
        title="Delete E-Action"
        message={`Delete “${action.assignedAction || `E-Action #${action.id}`}”? This removes the row from the related Customer Purchase Order.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={removeAction}
        onCancel={() => setConfirm(false)}
      />
    </div>
  );
}
