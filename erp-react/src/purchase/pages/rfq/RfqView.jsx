/**
 * purchase/pages/rfq/RfqView.jsx
 * ------------------------------------------------------------------
 * RFQ Detail — Enterprise ERP sourcing workspace.
 * Full sourcing document with workflow (Draft → … → Closed).
 * Ten tabs: Overview · Line Items · Vendors · Commercial Terms ·
 * Attachments · Comments · Timeline · Audit · Quotations · Comparison.
 *
 * UI-only rewrite — all business logic, services, routes and data
 * model preserved. Styles in styles/rfq-view.css.
 * ------------------------------------------------------------------
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Building2, CalendarDays, CheckCircle2, ChevronLeft,
  Clock, Copy, FileText, History, IndianRupee, LayoutDashboard, ListChecks,
  Loader2, Mail, MessageSquare, MoreHorizontal, Paperclip, Pencil, Plus, Printer,
  Scale, ScrollText, Send, SendHorizontal, Tag, Trash2, Trophy, XCircle, Truck
} from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { Modal, SearchableSelect, TextArea, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import RfqWorkflowProgress from '../../components/RfqWorkflowProgress';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import AttachmentList from '../../components/AttachmentList';
import SourceDocumentsDrawer from '../../components/SourceDocumentsDrawer';
import { rfqService } from '../../services/rfq';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { isVendorRfqEligible, vendorService } from '../../services/vendor';
import { requisitionService } from '../../services/requisition';
import { QUOTATION_STATUS, RFQ_STATUS, RFQ_STATUSES } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';
import '../../styles/rfq-view.css';

import usePurchaseAccess from '../../access/usePurchaseAccess';
const PRIORITY_TONES = {
  Critical: 'bg-rose-50 text-rose-600 border-rose-200',
  High: 'bg-amber-50 text-amber-600 border-amber-200',
  Medium: 'bg-sky-50 text-sky-600 border-sky-200',
  Low: 'bg-slate-100 text-slate-500 border-slate-200'
};

const STATUS_TONE = {
  Received: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Pending: 'bg-amber-50 text-amber-700 border-amber-200',
  Rejected: 'bg-red-50 text-red-700 border-red-200',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function InfoItem({ label, value }) {
  return (
    <div className="rfq-info-item">
      <div className="rfq-info-label">{label}</div>
      <div className="rfq-info-value">{value || '—'}</div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-[#0B4A3D]" aria-hidden="true" />}
      <div>
        <h3 className="text-sm font-bold text-slate-800">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function normalizeRfqRecord(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;

  const commercialTerms = data.commercialTerms;
  return {
    ...data,
    vendors: Array.isArray(data.vendors)
      ? data.vendors
      : Array.isArray(data.vendorNames)
        ? data.vendorNames
        : [],
    items: Array.isArray(data.items) ? data.items : [],
    attachments: Array.isArray(data.attachments) ? data.attachments : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    commercialTerms: commercialTerms && typeof commercialTerms === 'object' && !Array.isArray(commercialTerms)
      ? commercialTerms
      : {}
  };
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function RfqView() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  /* Document-level gates (read once per render, used by docActions). */
  const canEdit = can('rfq', 'edit');
  const canCreateRfq = can('rfq', 'create');
  const canDeleteRfq = can('rfq', 'delete');
  const canPrintRfq = can('rfq', 'print');
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();

  /* ── State ──────────────────────────────────────────────────────── */
  const [record, setRecord] = useState(null);
  const [linkedPr, setLinkedPr] = useState(null);
  /* The Purchase Order already raised for this RFQ (null until resolved).
     The RFQ record itself does not carry the PO — PO creation links the two
     by the order's rfqNo — so it is resolved from the existing orders list
     (the same source the duplicate-PO guard uses). Drives the workflow
     button: View PO when one exists, Raise Purchase Order when none does. */
  const [linkedPo, setLinkedPo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'overview');
  const [timeline, setTimeline] = useState([]);
  const [audit, setAudit] = useState([]);
  const [comparison, setComparison] = useState(null);
  const [vendorMaster, setVendorMaster] = useState([]);
  const [editingStatus, setEditingStatus] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  const [vendorToAdd, setVendorToAdd] = useState('');
  const [vendorSaving, setVendorSaving] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [noteDialog, setNoteDialog] = useState(null);
  const [confirmPoRaise, setConfirmPoRaise] = useState(false);
  const [poNote, setPoNote] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const moreRef = useRef(null);
  const tabsRowRef = useRef(null);
  useClickOutside(moreRef, () => setMoreOpen(false), moreOpen);

  /* ── Effects ────────────────────────────────────────────────────── */
  useEffect(() => {
    const el = tabsRowRef.current?.querySelector('.rfq-tab.active');
    el?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [activeTab, record]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMoreOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const [data, events, auditData] = await Promise.all([
          rfqService.getRfq(id),
          rfqService.getRfqTimeline(id),
          rfqService.getRfqAudit(id)
        ]);
        if (cancelled) return;
        const normalized = normalizeRfqRecord(data);
        if (!normalized) {
          setNotFound(true);
          return;
        }
        setRecord(normalized);
        setEditingStatus(normalized.status || RFQ_STATUS.DRAFT);
        setTimeline(Array.isArray(events) ? events : []);
        setAudit(Array.isArray(auditData?.entries) ? auditData.entries : []);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    rfqService.getQuotationComparison(id)
      .then((data) => { if (!cancelled) setComparison(data); })
      .catch(() => { if (!cancelled) setComparison(null); });
    vendorService.getVendors({ page: 1, pageSize: 500 })
      .then((res) => { if (!cancelled) setVendorMaster(res.data || []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!record?.prNo) { queueMicrotask(() => setLinkedPr(null)); return; }
    let cancelled = false;
    requisitionService.getRequisitions({ search: record.prNo, page: 1, pageSize: 10 })
      .then((result) => {
        if (cancelled) return;
        const match = (result.data || []).find((pr) => pr.prNo === record.prNo);
        setLinkedPr(match ? { id: match.id, prNo: match.prNo } : null);
      })
      .catch(() => { if (!cancelled) setLinkedPr(null); });
    return () => { cancelled = true; };
  }, [record?.prNo]);

  /* Resolve the linked Purchase Order for this RFQ. Read-only; reuses the
     existing orders service (loads a page large enough to hold every order,
     matching the way the raise-PO duplicate guard looks it up). */
  useEffect(() => {
    const rfqNo = record?.rfqNo;
    if (!rfqNo) { queueMicrotask(() => setLinkedPo(null)); return undefined; }
    let cancelled = false;
    purchaseOrderService.getOrders({ page: 1, pageSize: 500 })
      .then((result) => {
        if (cancelled) return;
        const orders = Array.isArray(result?.data)
          ? result.data
          : Array.isArray(result?.data?.content) ? result.data.content : [];
        const linked = orders
          .filter((order) => order.rfqNo && order.rfqNo === rfqNo)
          /* Deterministic: the earliest order raised for the RFQ. */
          .sort((a, b) => Number(a.id) - Number(b.id))[0] || null;
        setLinkedPo(linked);
      })
      .catch(() => { if (!cancelled) setLinkedPo(null); });
    return () => { cancelled = true; };
  }, [record?.rfqNo]);

  /* ── Actions ────────────────────────────────────────────────────── */
  /* In-flight guard — blocks same-tick duplicate submissions (double
     click / double Enter). Buttons are only disabled after a re-render,
     which is too late for a second click in the same tick. */
  const workflowBusy = useRef(false);

  const runAction = useCallback(async (operation, successMessage) => {
    if (workflowBusy.current) return null;
    workflowBusy.current = true;
    setBusy(true);
    try {
      const response = await operation();
      /* Always refetch the complete record from the store so every
         derived field (vendors, commercialTerms, approval, quotation
         counts, PO links) is current — the API response may be a flat
         object that omits enriched fields the view depends on. */
      let updated;
      try {
        updated = normalizeRfqRecord(await rfqService.getRfq(id));
      } catch {
        /* Fallback: the mock service returns enriched data directly. */
        updated = normalizeRfqRecord(response);
      }
      if (!updated) throw new Error('RFQ response was invalid');
      setRecord(updated);
      const [events, auditData] = await Promise.all([
        rfqService.getRfqTimeline(id),
        rfqService.getRfqAudit(id)
      ]);
      setTimeline(Array.isArray(events) ? events : []);
      /* The audit payload unwraps to a bare array on the REST path, and
         reading `.entries` off an array returns Array.prototype.entries —
         a function, which React would treat as a state updater and blow
         up the page after every workflow action. Accept both shapes. */
      setAudit(
        Array.isArray(auditData?.entries) ? auditData.entries : Array.isArray(auditData) ? auditData : []
      );
      rfqService.getQuotationComparison(id).then(setComparison).catch(() => setComparison(null));
      toast.success(successMessage);
      return updated;
    } catch (err) {
      toast.error(err?.message || 'Action failed');
      return null;
    } finally {
      setBusy(false);
      workflowBusy.current = false;
      setNoteDialog(null);
    }
  }, [id, toast]);

  const raisePo = useCallback(async () => {
    setBusy(true);
    try {
      const result = await rfqService.raisePurchaseOrder(record.id, poNote.trim());
      /* Backend may return { po: { poNo } } or a flat { poNo }. */
      const poNo = result?.po?.poNo || result?.poNo || result?.poNo;
      if (!poNo) throw new Error('Purchase order was raised but no PO number was returned');
      toast.success(`Purchase order ${poNo} raised from ${record.rfqNo}`);
      /* Open by numeric PO id — the view route resolves /orders/:id against the
         database id, so a PO number here renders "Purchase order not found". */
      navigate(`/purchase/orders/${result?.po?.id ?? poNo}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to raise purchase order');
    } finally {
      setBusy(false);
      setConfirmPoRaise(false);
      setPoNote('');
    }
  }, [record, poNote, navigate, toast]);

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim()) return;
    setCommentBusy(true);
    try {
      const updated = await rfqService.addComment(id, commentText.trim());
      setRecord(updated);
      const events = await rfqService.getRfqTimeline(id);
      setTimeline(events);
      setCommentText('');
      toast.success('Comment added');
    } catch (err) {
      toast.error(err?.message || 'Failed to add comment');
    } finally {
      setCommentBusy(false);
    }
  }, [id, commentText, toast]);

  const handleStatusChange = useCallback(async (newStatus) => {
    if (newStatus === editingStatus) return;
    setStatusSaving(true);
    try {
      const updated = await rfqService.updateRfq(record.id, { status: newStatus });
      setEditingStatus(newStatus);
      setRecord(updated);
      toast.success(`Status changed to ${newStatus}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to update status');
    } finally {
      setStatusSaving(false);
    }
  }, [record, editingStatus, toast]);

  const handleAddVendor = useCallback(async () => {
    if (!vendorToAdd) return;
    setVendorSaving(true);
    try {
      const updated = await rfqService.updateRfq(record.id, {
        vendors: [...(record.vendors || []), vendorToAdd]
      });
      setRecord(updated);
      setVendorToAdd('');
      toast.success(`${vendorToAdd} added to RFQ`);
    } catch (err) {
      toast.error(err?.message || 'Failed to add vendor');
    } finally {
      setVendorSaving(false);
    }
  }, [record, vendorToAdd, toast]);

  const handleRemoveVendor = useCallback(async (vendorName) => {
    setVendorSaving(true);
    try {
      const updated = await rfqService.updateRfq(record.id, {
        vendors: (record.vendors || []).filter((v) => v !== vendorName)
      });
      setRecord(updated);
      toast.success(`${vendorName} removed from RFQ`);
    } catch (err) {
      toast.error(err?.message || 'Failed to remove vendor');
    } finally {
      setVendorSaving(false);
    }
  }, [record, toast]);

  const confirmNoteAction = useCallback(async () => {
    if (!noteDialog) return;
    const { action, note } = noteDialog;
    const messages = {
      'submit-review': `${record.rfqNo} submitted for approval`,
      approve: `${record.rfqNo} approved`,
      reject: `${record.rfqNo} rejected — approval not granted`,
      evaluate: `${record.rfqNo} moved to evaluation`,
      cancel: `${record.rfqNo} cancelled`,
      close: `${record.rfqNo} closed`,
      send: `${record.rfqNo} sent to vendors`,
      delete: `${record.rfqNo} deleted`,
      duplicate: `${record.rfqNo} duplicated as a draft`
    };
    if (action === 'delete') {
      await runAction(() => rfqService.deleteRfq(record.id), messages.delete);
      navigate('/purchase/rfq');
      return;
    }
    if (action === 'duplicate') {
      const result = await runAction(() => rfqService.duplicateRfq(record.id), messages.duplicate);
      if (result) navigate(`/purchase/rfq/${result.id}/edit`);
      return;
    }
    const operations = {
      'submit-review': () => rfqService.submitForReview(record.id, note),
      approve: () => rfqService.approveRfq(record.id, note),
      reject: () => rfqService.rejectRfq(record.id, note),
      evaluate: () => rfqService.startEvaluation(record.id, note),
      cancel: () => rfqService.cancelRfq(record.id, note),
      close: () => rfqService.closeRfq(record.id),
      send: () => rfqService.sendRfq(record.id)
    };
    await runAction(
      operations[action],
      messages[action],
      action === 'send' || action === 'cancel' || action === 'close'
    );
  }, [noteDialog, record, runAction, navigate]);

  /* ── Derived Data & Hooks (MUST be before early returns) ─────────── */
  const quotes = comparison?.quotes || [];

  /* RFQ-scoped quotations deep link. Vendor Quotations reads the `rfq`
     query param (the RFQ NUMBER — the same convention the RFQ list action
     menu uses), so opening it from this RFQ keeps the list filtered to this
     RFQ only instead of falling back to the global quotation list. */
  const quotationsRoute = record?.rfqNo
    ? `/purchase/rfq/quotations?rfq=${encodeURIComponent(record.rfqNo)}`
    : '/purchase/rfq/quotations';

  const vendorRowFor = useCallback((name) => {
    const master =
      vendorMaster.find((v) => v.name === name) ||
      vendorMaster.find((v) => v.name && (v.name.includes(name) || name.includes(v.name))) ||
      null;
    return { master, quote: quotes.find((q) => q.vendor === name) || null };
  }, [vendorMaster, quotes]);

  const quoteTotals = useMemo(() => quotes.filter((q) => q.total != null).map((q) => q.total), [quotes]);
  const lowestTotal = quoteTotals.length ? Math.min(...quoteTotals) : null;
  const highestTotal = quoteTotals.length ? Math.max(...quoteTotals) : null;
  const bestScored = comparison?.highlights?.bestScore || null;
  const acceptedCount = useMemo(() => quotes.filter((q) => q.status === QUOTATION_STATUS.ACCEPTED).length, [quotes]);
  const rejectedCount = useMemo(() => quotes.filter((q) => q.status === QUOTATION_STATUS.REJECTED).length, [quotes]);
  const pendingCount = useMemo(() => quotes.filter((q) => q.status === QUOTATION_STATUS.PENDING).length, [quotes]);

  const vendorCards = useMemo(() => (record?.vendors || []).map((name) => {
    const { master, quote } = vendorRowFor(name);
    const hasQuote = Boolean(quote);
    const quoteStatus = quote?.status || 'No Quote';
    const quoteTotal = quote?.total;
    const quoteScore = quote?.score;
    const quoteDelivery = quote?.delivery;
    const quoteLeadTime = quote?.leadTime;
    const quoteVendorRating = quote?.vendorRating || master?.rating;
    const isLowest = quoteTotal != null && quoteTotal === lowestTotal;
    const isBestScore = bestScored?.vendor === name;
    return { name, master, hasQuote, quoteStatus, quoteTotal, quoteScore, quoteDelivery, quoteLeadTime, quoteVendorRating, isLowest, isBestScore };
  }), [record?.vendors, vendorRowFor, lowestTotal, bestScored]);

  /* ── Loading / Not Found ────────────────────────────────────────── */
  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#0B4A3D]" />
            <p className="text-xs font-semibold text-slate-400">Loading RFQ...</p>
          </div>
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !record) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">RFQ not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button type="button" onClick={() => navigate('/purchase/rfq')} className="erp-btn-primary mt-4">
            <span className="erp-btn-icon"><ChevronLeft size={16} /></span> Go to RFQs
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Derived Data (non-hook) ────────────────────────────────────── */
  const estimatedSubtotal = (record.items || []).reduce(
    (sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0
  );
  const invited = record.vendorCount ?? (record.vendors || []).length;
  const receivedQ = record.quotationReceived ?? 0;
  const pendingQ = record.quotationPending ?? 0;
  const estimatedValue = record.estimatedValue ?? estimatedSubtotal;
  const responsePct = invited > 0 ? Math.round((receivedQ / invited) * 100) : 0;

  const commercialTerms = record.commercialTerms || {};
  const specialInstructions = record.specialInstructions || commercialTerms.specialInstructions || '';

  /* ── Workflow Buttons ───────────────────────────────────────────── */
  /* Each RFQ stage maps to its own permission; the backend enforces the same
     step on /api/purchase/rfqs/** so a hidden button is not the boundary. */
  const renderWorkflowButtons = () => {
    const buttons = [];
    const canSubmit = can('rfq', 'submit');
    const canApprove = can('rfq', 'approve');
    const canReject = can('rfq', 'reject');
    const canEvaluate = can('rfq', 'evaluate');
    const canClose = can('rfq', 'close');
    const canCancel = can('rfq', 'cancel');
    const canAward = can('rfq', 'award');
    const canCreatePo = can('orders', 'create');
    if (record.status === RFQ_STATUS.DRAFT && canSubmit) {
      buttons.push(
        <button key="submit" type="button" onClick={() => setNoteDialog({ action: 'submit-review', note: '' })} disabled={busy} className="po-btn po-btn-primary">
          <Send className="po-btn-icon-ic" /> Submit for Approval
        </button>
      );
    } else if (record.status === RFQ_STATUS.PENDING_APPROVAL && canApprove) {
      buttons.push(
        <button key="approve" type="button" onClick={() => setNoteDialog({ action: 'approve', note: '' })} disabled={busy} className="po-btn po-btn-success">
          <CheckCircle2 className="po-btn-icon-ic" /> Approve
        </button>
      );
      if (canReject) {
        buttons.push(
          <button key="reject" type="button" onClick={() => setNoteDialog({ action: 'reject', note: '' })} disabled={busy} className="po-btn po-btn-danger">
            <XCircle className="po-btn-icon-ic" /> Reject
          </button>
        );
      }
    } else if (record.status === RFQ_STATUS.APPROVED) {
      /* The post-sourcing Approved state (Approval Flow fully approved)
         already has live quotations — the RFQ cannot be re-sent, so the
         button is only shown on the INITIAL approval (no quotes yet). */
      if (!(receivedQ > 0) && canSubmit) {
        buttons.push(
          <button key="send" type="button" onClick={() => setNoteDialog({ action: 'send', note: '' })} disabled={busy} className="po-btn po-btn-primary">
            <SendHorizontal className="po-btn-icon-ic" /> Send to Vendors
          </button>
        );
      }
    } else if (record.status === RFQ_STATUS.SENT || record.status === RFQ_STATUS.QUOTATION_RECEIVED) {
      if (receivedQ === 0) {
        buttons.push(
          <span key="waiting" className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 text-slate-500 text-xs font-bold whitespace-nowrap">
            <Clock className="po-btn-icon-ic" /> Waiting for Quotations
          </span>
        );
      } else if (canEvaluate) {
        buttons.push(
          <button key="evaluate" type="button" onClick={() => setNoteDialog({ action: 'evaluate', note: '' })} disabled={busy} className="po-btn po-btn-primary">
            <ListChecks className="po-btn-icon-ic" /> Start Evaluation
          </button>
        );
      }
      if (canClose) {
        buttons.push(
          <button key="close" type="button" onClick={() => setNoteDialog({ action: 'close', note: '' })} disabled={busy} className="po-btn po-btn-danger">
            <XCircle className="po-btn-icon-ic" /> Close RFQ
          </button>
        );
      }
    } else if (record.status === RFQ_STATUS.EVALUATION) {
      if (canAward) {
        buttons.push(
          <button key="award" type="button" onClick={() => navigate(`/purchase/rfq/price-comparative-statement/${record.id}`)} disabled={busy} className="po-btn po-btn-primary">
            <Trophy className="po-btn-icon-ic" /> View PCS & Select Supplier
          </button>
        );
      }
      if (canClose) {
        buttons.push(
          <button key="close" type="button" onClick={() => setNoteDialog({ action: 'close', note: '' })} disabled={busy} className="po-btn po-btn-danger">
            <XCircle className="po-btn-icon-ic" /> Close RFQ
          </button>
        );
      }
    } else if (record.status === RFQ_STATUS.AWARDED) {
      /* The RFQ already has a PO when either the record carries a PO number
         or an order links back to this RFQ. Navigate by the order's numeric
         id when resolved; fall back to the document number (which the order
         route also resolves) for legacy records that only store poNo. */
      const existingPoNo = record.poNo || linkedPo?.poNo || null;
      if (existingPoNo) {
        const poTarget = linkedPo?.id ?? existingPoNo;
        buttons.push(
          <button key="view-po" type="button" onClick={() => navigate(`/purchase/orders/${poTarget}`)} className="po-btn po-btn-ghost">
            <FileText className="po-btn-icon-ic" /> View PO {existingPoNo}
          </button>
        );
      } else if (canCreatePo) {
        buttons.push(
          <button key="raise-po" type="button" onClick={() => { setPoNote(''); setConfirmPoRaise(true); }} disabled={busy} className="po-btn po-btn-primary">
            <FileText className="po-btn-icon-ic" /> Raise Purchase Order
          </button>
        );
      }
      if (canClose) {
        buttons.push(
          <button key="close" type="button" onClick={() => setNoteDialog({ action: 'close', note: '' })} disabled={busy} className="po-btn po-btn-danger">
            <XCircle className="po-btn-icon-ic" /> Close RFQ
          </button>
        );
      }
    }
    if (canCancel && ![RFQ_STATUS.CLOSED, RFQ_STATUS.CANCELLED].includes(record.status)) {
      buttons.push(
        <button key="cancel" type="button" onClick={() => setNoteDialog({ action: 'cancel', note: '' })} disabled={busy} className="po-btn po-btn-danger">
          <XCircle className="po-btn-icon-ic" /> Cancel RFQ
        </button>
      );
    }
    return buttons;
  };

  /* ── Document Actions ───────────────────────────────────────────── */
  const docActions = [
    { key: 'back', Icon: ArrowLeft, label: 'Back to RFQ list', tone: 'neutral', run: () => navigate('/purchase/rfq') },
    ...(canEdit ? [{ key: 'edit', Icon: Pencil, label: 'Edit RFQ', tone: 'primary', run: () => navigate(`/purchase/rfq/${record.id}/edit`) }] : []),
    { key: '360', Icon: LayoutDashboard, label: '360° view', tone: 'teal', run: () => navigate(`/purchase/rfq/${record.id}/360`) },
    { key: 'compare', Icon: Scale, label: 'Compare quotations', tone: 'indigo', run: () => navigate(`/purchase/rfq/compare?rfq=${record.id}`) },
    ...(canCreateRfq ? [{ key: 'duplicate', Icon: Copy, label: 'Duplicate RFQ', tone: 'emerald', run: () => setNoteDialog({ action: 'duplicate', note: '' }) }] : []),
    ...(canPrintRfq ? [{ key: 'print', Icon: Printer, label: 'Print preview', tone: 'gray', run: () => navigate(`/purchase/rfq/${record.rfqNo}/print`) }] : []),
    ...(canDeleteRfq ? [{ key: 'delete', Icon: Trash2, label: 'Delete RFQ', tone: 'danger', run: () => setNoteDialog({ action: 'delete', note: '' }) }] : [])
  ];

  const iconButton = (Icon, label, onClick, tone = 'neutral') => (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={`prv-icon-btn prv-icon-btn-${tone}`}>
      <Icon aria-hidden="true" />
    </button>
  );

  /* ── Tab Definitions ────────────────────────────────────────────── */
  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'items', label: 'Line Items', icon: ListChecks, count: record.items?.length || 0 },
    { key: 'vendors', label: 'Vendors', icon: Building2, count: (record.vendors || []).length },
    { key: 'terms', label: 'Commercial Terms', icon: FileText },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: (record.attachments || []).length },
    { key: 'comments', label: 'Comments', icon: MessageSquare, count: (record.comments || []).length },
    { key: 'timeline', label: 'Timeline', icon: History, count: timeline.length },
    { key: 'audit', label: 'Audit History', icon: ScrollText, count: audit.length },
    { key: 'quotations', label: 'Quotations', icon: Mail, count: receivedQ },
    { key: 'comparison', label: 'Price Comparison', icon: Scale }
  ];

  /* ── Dialog Content ─────────────────────────────────────────────── */
  const noteTitles = {
    'submit-review': 'Submit RFQ for approval?', approve: 'Approve RFQ?',
    reject: 'Reject RFQ?', send: 'Send RFQ to vendors?',
    evaluate: 'Start quotation evaluation?', close: 'Close RFQ?',
    cancel: 'Cancel RFQ?', delete: 'Delete RFQ?', duplicate: 'Duplicate RFQ?'
  };
  const noteMessages = {
    'submit-review': `${record.rfqNo} will move to Pending Approval. An optional note can be recorded.`,
    approve: `${record.rfqNo} will be approved and ready to send to vendors.`,
    reject: `${record.rfqNo} will be rejected and cancelled — it can never be sent to vendors. A rejection note is recorded with the decision.`,
    send: `${record.rfqNo} will be sent to ${invited} invited vendor(s) and open for quotations.`,
    evaluate: `${record.rfqNo} will move to Evaluation so quotations can be compared and awarded.`,
    close: `${record.rfqNo} will be closed and no further quotations will be accepted.`,
    cancel: `${record.rfqNo} will be cancelled. This action can be reversed by duplicating.`,
    delete: `This will permanently remove ${record.rfqNo}. This action cannot be undone.`,
    duplicate: `A new draft RFQ will be created from ${record.rfqNo} with all line items copied.`
  };
  const noteConfirmLabels = {
    'submit-review': 'Submit for Approval', approve: 'Approve', reject: 'Reject',
    send: 'Send to Vendors', evaluate: 'Start Evaluation', close: 'Close RFQ',
    cancel: 'Cancel RFQ', delete: 'Delete', duplicate: 'Duplicate'
  };
  const noteShowField = ['submit-review', 'approve', 'reject', 'evaluate', 'cancel'].includes(noteDialog?.action);

  /* ── Overview Info ──────────────────────────────────────────────── */
  const overviewInfo = [
    { label: 'RFQ Number', value: record.rfqNo },
    { label: 'Title', value: record.title || 'Request for quotation' },
    { label: 'Category', value: record.category },
    { label: 'Department', value: record.department },
    { label: 'Requester', value: record.requester },
    { label: 'Buyer', value: record.buyer },
    {
      label: 'Priority',
      value: (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${PRIORITY_TONES[record.priority] || PRIORITY_TONES.Low}`}>
          {record.priority || '—'}
        </span>
      )
    },
    {
      label: 'Status',
      value: (
        <div className="flex items-center gap-2">
          <SearchableSelect
            value={editingStatus}
            onChange={handleStatusChange}
            options={RFQ_STATUSES}
            placeholder="Select status..."
            disabled={statusSaving}
            aria-label="RFQ status"
            className="w-48"
          />
          {statusSaving && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#0B4A3D]" />}
        </div>
      )
    },
    { label: 'Due Date', value: record.dueDate ? formatDate(record.dueDate) : '—' },
    { label: 'Validity', value: record.validity ? `${record.validity} days` : '—' },
    { label: 'Currency', value: record.currency },
    {
      label: 'PR Reference',
      value: record.prNo ? (
        <span className="inline-flex items-center gap-2">
          <span className="font-bold">{record.prNo}</span>
          {linkedPr && (
            <button type="button" onClick={() => navigate(`/purchase/requisition/${linkedPr.id}`)} className="inline-flex items-center gap-1 rounded-md bg-[#0B4A3D]/10 text-[#0B4A3D] px-2 py-0.5 text-[10px] font-bold hover:bg-[#0B4A3D]/15 hover:underline transition-colors cursor-pointer">
              View PR <ArrowRight className="w-2.5 h-2.5" aria-hidden="true" />
            </button>
          )}
        </span>
      ) : '—'
    },
    { label: 'Sent Date', value: record.sentAt ? formatDate(record.sentAt) : '—' }
  ];

  const deliveryInfo = [
    { label: 'Delivery Address', value: record.deliveryAddress },
    { label: 'Required Date', value: record.dueDate ? formatDate(record.dueDate) : '—' },
    { label: 'Incoterm', value: record.incoterm || '—' },
    { label: 'Delivery Terms', value: commercialTerms.deliveryTerms }
  ];

  const commercialInfo = [
    { label: 'Payment Terms', value: commercialTerms.paymentTerms },
    { label: 'Tax', value: commercialTerms.taxRate ? `${commercialTerms.taxRate}%` : '—' },
    { label: 'Freight', value: commercialTerms.freight },
    { label: 'Insurance', value: commercialTerms.insurance },
    { label: 'Warranty', value: commercialTerms.warranty },
    { label: 'Packing', value: commercialTerms.packing }
  ];

  /* ── Awarded Details ────────────────────────────────────────────── */
  const awardedDetails = record.status === RFQ_STATUS.AWARDED && record.awardedVendor
    ? [
        { label: 'Awarded Vendor', value: record.awardedVendor },
        { label: 'Awarded Value', value: formatAmount(record.awardedValue, record.currency) },
        { label: 'Savings vs Estimate', value: formatAmount(Math.max(0, (record.estimatedValue || 0) - (record.awardedValue || 0)), record.currency) },
        { label: 'Awarded On', value: record.awardedAt ? formatDateTime(record.awardedAt) : '—' },
        { label: 'Purchase Order', value: record.poNo ? (
          <button type="button" onClick={() => navigate(`/purchase/orders/${record.poNo}`)} className="font-semibold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer">{record.poNo}</button>
        ) : '—' }
      ] : [];

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <PurchasePageLayout className="prv-page rfq-view">
      {/* ── HEADER ───────────────────────────────────────────────── */}
      <div className="prv-sticky-header">
        <div className="rfq-hdr">
          <div className="rfq-hdr-main">
            <div className="rfq-hdr-id">{record.rfqNo}</div>
            <div className="rfq-hdr-title">{record.title || 'Request for quotation'}</div>
            <div className="rfq-hdr-meta">
              <PurchaseStatusBadge status={record.status} />
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold border ${PRIORITY_TONES[record.priority] || PRIORITY_TONES.Low}`}>
                {record.priority || '—'}
              </span>
              {record.category && <span className="rfq-hdr-tag"><Tag className="w-3 h-3" />{record.category}</span>}
              {record.department && <span className="rfq-hdr-tag"><Building2 className="w-3 h-3" />{record.department}</span>}
              {record.requester && <span className="rfq-hdr-tag"><Mail className="w-3 h-3" />{record.requester}</span>}
              {record.dueDate && <span className="rfq-hdr-tag"><CalendarDays className="w-3 h-3" />Due {formatDate(record.dueDate)}</span>}
            </div>
          </div>
          <div className="rfq-hdr-actions">
            <span className="prv-icon-bar" role="group" aria-label="Document actions">
              {docActions.map(({ key, Icon, label, tone, run }) => (
                <Fragment key={key}>{iconButton(Icon, label, run, tone)}</Fragment>
              ))}
            </span>
            <div className="prv-more-wrap" ref={moreRef}>
              <button type="button" className={`prv-more-btn ${moreOpen ? 'open' : ''}`} onClick={() => setMoreOpen((p) => !p)} aria-label="More actions" aria-haspopup="menu" aria-expanded={moreOpen}>
                <MoreHorizontal aria-hidden="true" />
              </button>
              {moreOpen && (
                <div className="prv-more-menu" role="menu">
                  {docActions.map(({ key, Icon, label, tone, run }) => (
                    <button key={key} type="button" role="menuitem" className={`prv-more-item prv-more-item-${tone}`} onClick={() => { setMoreOpen(false); run(); }}>
                      <Icon aria-hidden="true" />{label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="rfq-workflow-bar mt-3">
          {renderWorkflowButtons()}
        </div>
      </div>

      {/* ── KPI CARDS ──────────────────────────────────────────── */}
      <div className="rfq-kpi-grid">
        <div className="rfq-kpi">
          <span className="rfq-kpi-icon emerald" aria-hidden="true"><IndianRupee /></span>
          <div className="rfq-kpi-body">
            <div className="rfq-kpi-value" title={formatAmount(estimatedValue, record.currency)}>{formatAmount(estimatedValue, record.currency)}</div>
            <div className="rfq-kpi-label">Estimated Value</div>
          </div>
          <span className="rfq-kpi-badge bg-slate-100 text-slate-500">
            {record.awardedValue != null ? 'Awarded' : 'Estimate'}
          </span>
        </div>
        <div className="rfq-kpi">
          <span className="rfq-kpi-icon blue" aria-hidden="true"><Building2 /></span>
          <div className="rfq-kpi-body">
            <div className="rfq-kpi-value">{String(invited)}</div>
            <div className="rfq-kpi-label">Invited Vendors</div>
          </div>
          <span className="rfq-kpi-badge bg-sky-50 text-sky-600">{receivedQ} responded</span>
        </div>
        <div className="rfq-kpi">
          <span className="rfq-kpi-icon teal" aria-hidden="true"><Mail /></span>
          <div className="rfq-kpi-body">
            <div className="rfq-kpi-value">{receivedQ} <span className="text-sm font-semibold text-slate-400">of</span> {invited}</div>
            <div className="rfq-kpi-label">Quotes Received</div>
          </div>
          <span className="rfq-kpi-badge bg-amber-50 text-amber-600">{pendingQ} pending</span>
        </div>
        <div className="rfq-kpi">
          <span className="rfq-kpi-icon violet" aria-hidden="true"><CalendarDays /></span>
          <div className="rfq-kpi-body">
            <div className="rfq-kpi-value">{record.dueDate ? formatDate(record.dueDate) : '—'}</div>
            <div className="rfq-kpi-label">Due Date</div>
          </div>
        </div>
      </div>

      {/* ── VENDOR SUMMARY CARDS ──────────────────────────────── */}
      {vendorCards.length > 0 && (
        <div className="rfq-vendor-grid">
          {vendorCards.map((vc) => (
            <button key={vc.name} type="button" onClick={() => navigate(`/purchase/rfq/compare?rfq=${record.id}`)} className={`rfq-vendor-card ${vc.isLowest ? 'is-lowest' : ''}`}>
              <div className="rfq-vendor-hdr">
                <div className="rfq-vendor-identity">
                  <div className={`rfq-vendor-avatar ${vc.hasQuote ? 'has-quote' : 'no-quote'}`}>{vc.name?.slice(0, 2)?.toUpperCase() || 'V'}</div>
                  <div>
                    <div className="rfq-vendor-name">{vc.name}</div>
                    {vc.quoteVendorRating > 0 && <div className="rfq-vendor-rating">★ {vc.quoteVendorRating}</div>}
                  </div>
                </div>
                <span className={`rfq-vendor-status ${vc.quoteStatus in STATUS_TONE ? vc.quoteStatus : 'no-status'}`}>{vc.quoteStatus}</span>
              </div>
              <div className="rfq-vendor-metrics">
                <div>
                  <div className="rfq-vendor-metric-label">Value</div>
                  <div className={`rfq-vendor-metric-value ${vc.isLowest ? 'highlight' : ''}`}>{vc.quoteTotal != null ? formatAmount(vc.quoteTotal, record.currency) : '—'}</div>
                </div>
                <div>
                  <div className="rfq-vendor-metric-label">Score</div>
                  <div className={`rfq-vendor-metric-value ${vc.isBestScore ? 'highlight' : ''}`}>{vc.quoteScore != null ? `${vc.quoteScore}/100` : '—'}</div>
                </div>
                <div>
                  <div className="rfq-vendor-metric-label">Delivery</div>
                  <div className="rfq-vendor-metric-value">{vc.quoteDelivery ? `${vc.quoteDelivery}d` : vc.quoteLeadTime ? `${vc.quoteLeadTime}d` : '—'}</div>
                </div>
              </div>
              {(vc.isLowest || vc.isBestScore) && (
                <div className="rfq-vendor-badges">
                  {vc.isLowest && <span className="rfq-vendor-badge lowest">LOWEST</span>}
                  {vc.isBestScore && <span className="rfq-vendor-badge best">BEST SCORE</span>}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── SOURCING WORKFLOW ──────────────────────────────────── */}
      <RfqWorkflowProgress record={record} compact onOpenPo={(poNo) => navigate(`/purchase/orders/${poNo}`)} />

      {/* ── TABS ────────────────────────────────────────────────── */}
      <div className="rfq-tabs-bar" ref={tabsRowRef} role="tablist" aria-label="RFQ sections">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.key === activeTab;
          return (
            <button key={tab.key} type="button" role="tab" aria-selected={active} onClick={() => { setActiveTab(tab.key); setSearchParams({ tab: tab.key }, { replace: true }); }} className={`rfq-tab ${active ? 'active' : ''}`}>
              {Icon && <Icon />}
              {tab.label}
              {tab.count != null && <span className="rfq-tab-count">{tab.count}</span>}
            </button>
          );
        })}
      </div>

      {/* ── TAB CONTENT ─────────────────────────────────────────── */}
      <div className="prv-main">

        {/* === OVERVIEW === */}
        {activeTab === 'overview' && (
          <div className="rfq-overview-sections">
            <PurchaseSectionCard title="RFQ Information" subtitle={`Requested by ${record.requester || '—'}`} icon={FileText}>
              <div className="rfq-info-grid">
                {overviewInfo.map((item) => <InfoItem key={item.label} label={item.label} value={item.value} />)}
              </div>
            </PurchaseSectionCard>

            {awardedDetails.length > 0 && (
              <PurchaseSectionCard title="Award Summary" subtitle="Winning vendor and savings" icon={Trophy}>
                <div className="rounded-xl border border-[#0B4A3D]/20 bg-[#EDF7F4] p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                    {awardedDetails.map((item) => <InfoItem key={item.label} label={item.label} value={item.value} />)}
                  </div>
                </div>
              </PurchaseSectionCard>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <PurchaseSectionCard title="Delivery" subtitle="Shipping and delivery terms" icon={Truck}>
                <div className="rfq-info-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {deliveryInfo.map((item) => <InfoItem key={item.label} label={item.label} value={item.value} />)}
                </div>
              </PurchaseSectionCard>
              <PurchaseSectionCard title="Commercial Terms" subtitle="Payment, tax and warranty" icon={FileText}>
                <div className="rfq-info-grid" style={{ gridTemplateColumns: '1fr' }}>
                  {commercialInfo.map((item) => <InfoItem key={item.label} label={item.label} value={item.value} />)}
                </div>
              </PurchaseSectionCard>
            </div>

            {(record.description || record.notes || specialInstructions) && (
              <PurchaseSectionCard title="Description & Notes" subtitle="Scope, notes and special instructions" icon={ScrollText}>
                <div className="space-y-3">
                  {record.description && (
                    <div className="rfq-notes-box">
                      <div className="rfq-notes-title">Description</div>
                      <p>{record.description}</p>
                    </div>
                  )}
                  {record.notes && (
                    <div className="rfq-notes-box">
                      <div className="rfq-notes-title">Notes</div>
                      <p>{record.notes}</p>
                    </div>
                  )}
                  {specialInstructions && (
                    <div className="rfq-notes-box">
                      <div className="rfq-notes-title">Special Instructions</div>
                      <p>{specialInstructions}</p>
                    </div>
                  )}
                </div>
              </PurchaseSectionCard>
            )}
          </div>
        )}

        {/* === LINE ITEMS === */}
        {activeTab === 'items' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Line Items" subtitle={`${(record.items || []).length} item(s) with estimated rates`}>
              {(record.items || []).length === 0 ? (
                <div className="rfq-empty">
                  <ListChecks />
                  <h4>No line items</h4>
                  <p>This RFQ does not contain any line items yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="rfq-items-table">
                    <thead>
                      <tr>
                        <th style={{ width: 40 }}>#</th>
                        <th>Item Description</th>
                        <th>HSN</th>
                        <th>UOM</th>
                        <th className="text-right">Qty</th>
                        <th className="text-right">Est. Rate</th>
                        <th className="text-right">Est. Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(record.items || []).map((item, idx) => (
                        <tr key={`${item.product}-${idx}`}>
                          <td className="text-slate-400 font-bold">{idx + 1}</td>
                          <td>
                            <div className="rfq-items-item-name">{item.product || '—'}</div>
                            {item.specification && <div className="rfq-items-item-spec">{item.specification}</div>}
                          </td>
                          <td className="text-slate-500">{item.hsn || '—'}</td>
                          <td className="text-slate-600">{item.uom || '—'}</td>
                          <td className="text-right font-semibold text-slate-700">{Number(item.qty) || 0}</td>
                          <td className="text-right font-semibold text-slate-700">{formatAmount(item.rate, record.currency)}</td>
                          <td className="text-right font-bold text-slate-800">{formatAmount((Number(item.qty) || 0) * (Number(item.rate) || 0), record.currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="rfq-items-total-bar">
                    <span className="rfq-items-total-label">Estimated Total</span>
                    <span className="rfq-items-total-value">{formatAmount(estimatedSubtotal, record.currency)}</span>
                  </div>
                </div>
              )}
            </PurchaseSectionCard>
          </div>
        )}

        {/* === VENDORS === */}
        {activeTab === 'vendors' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Vendor Summary" subtitle={`${invited} invited · ${receivedQ} responded`} icon={Building2}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <InfoItem label="Invited" value={invited} />
                <InfoItem label="Responded" value={`${receivedQ} of ${invited}`} />
                <InfoItem label="Accepted" value={acceptedCount} />
                <InfoItem label="Rejected" value={rejectedCount} />
              </div>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Response Rate</span>
                  <span className="text-[11px] font-bold text-[#0F5A46] tabular-nums">{responsePct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#0F5A46] to-[#17806A] rounded-full transition-all duration-500" style={{ width: `${responsePct}%` }} />
                </div>
              </div>
            </PurchaseSectionCard>

            <PurchaseSectionCard title="Invited Vendors" subtitle={`${invited} vendor(s) with contact and quotation status`}>
              {/* Add vendor selector */}
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1">
                  <SearchableSelect
                    value={vendorToAdd}
                    onChange={setVendorToAdd}
                    options={(vendorMaster || [])
                      .filter((v) => isVendorRfqEligible(v))
                      .filter((v) => !(record.vendors || []).includes(v.name))
                      .map((v) => ({ value: v.name, label: v.name }))}
                    placeholder="Select a vendor to add..."
                    aria-label="Add vendor to RFQ"
                    disabled={vendorSaving}
                  />
                </div>
                <button type="button" onClick={handleAddVendor} disabled={!vendorToAdd || vendorSaving} className="po-btn po-btn-primary whitespace-nowrap">
                  {vendorSaving ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Plus className="po-btn-icon-ic" />}
                  Add Vendor
                </button>
              </div>

              {(record.vendors || []).length === 0 ? (
                <div className="rfq-empty">
                  <Building2 />
                  <h4>No vendors available</h4>
                  <p>Add vendors above or create a new vendor in Vendor Management.</p>
                  <button type="button" onClick={() => navigate('/purchase/vendors/new')} className="po-btn po-btn-primary mt-3">
                    <Plus className="po-btn-icon-ic" /> Create Vendor
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="rfq-items-table" style={{ minWidth: 700 }}>
                    <thead>
                      <tr>
                        <th>Vendor</th>
                        <th>Contact</th>
                        <th>Email</th>
                        <th>Category</th>
                        <th className="text-right">Quotation</th>
                        <th>Status</th>
                        <th style={{ width: 50 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(record.vendors || []).map((name) => {
                        const { master, quote } = vendorRowFor(name);
                        return (
                          <tr key={name}>
                            <td>
                              <div className="font-semibold text-slate-800">{name}</div>
                              {master?.rating && <div className="text-[11px] text-slate-400 mt-0.5">★ {master.rating}</div>}
                            </td>
                            <td className="text-slate-500 whitespace-nowrap">{master?.phone || '—'}</td>
                            <td className="text-slate-500">{master?.email || '—'}</td>
                            <td className="text-slate-500">{master?.category || '—'}</td>
                            <td className="text-right font-semibold text-slate-700 whitespace-nowrap">{quote ? formatAmount(quote.total, quote.currency) : '—'}</td>
                            <td>{quote ? <PurchaseStatusBadge status={quote.status} /> : <span className="text-[11px] font-semibold text-slate-400">No quote</span>}</td>
                            <td>
                              <button type="button" onClick={() => handleRemoveVendor(name)} disabled={vendorSaving} title={`Remove ${name}`} className="prv-icon-btn prv-icon-btn-danger">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </PurchaseSectionCard>
          </div>
        )}

        {/* === COMMERCIAL TERMS === */}
        {activeTab === 'terms' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Commercial Terms" subtitle="Negotiated payment, delivery and warranty terms">
              <div className="rfq-info-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[
                  { label: 'Payment Terms', value: commercialTerms.paymentTerms },
                  { label: 'Transportation', value: commercialTerms.deliveryTerms },
                  { label: 'Warranty', value: commercialTerms.warranty },
                  { label: 'Packing', value: commercialTerms.packing },
                  { label: 'Freight', value: commercialTerms.freight },
                  { label: 'Insurance', value: commercialTerms.insurance },
                  { label: 'Taxes', value: commercialTerms.taxRate ? `${commercialTerms.taxRate}%` : '—' },
                  { label: 'Delivery Address', value: record.deliveryAddress },
                  { label: 'Incoterm', value: record.incoterm || '—' }
                ].map((item) => <InfoItem key={item.label} label={item.label} value={item.value} />)}
              </div>
            </PurchaseSectionCard>
          </div>
        )}

        {/* === ATTACHMENTS === */}
        {activeTab === 'attachments' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Attachments" subtitle={`${(record.attachments || []).length} supporting document(s)`} icon={Paperclip}>
              <AttachmentList attachments={record.attachments || []} fallbackDate={record.createdAt} />
            </PurchaseSectionCard>
            <PurchaseSectionCard title="Documents" subtitle="Linked documents from the repository" icon={FileText}>
              <SourceDocumentsDrawer sourceId={record.id} stage="RFQ" label="RFQ Documents" />
            </PurchaseSectionCard>
          </div>
        )}

        {/* === COMMENTS === */}
        {activeTab === 'comments' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Comments" subtitle="Discussion on this RFQ">
              <div className="flex items-start gap-2 mb-4">
                <TextArea rows={2} value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment..." className="flex-1" />
                <button type="button" onClick={handleAddComment} disabled={commentBusy || !commentText.trim()} className="po-btn po-btn-primary mt-1">
                  {commentBusy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <SendHorizontal className="po-btn-icon-ic" />}
                  Post
                </button>
              </div>
              {(record.comments || []).length > 0 ? (
                <ul className="rfq-comment-list">
                  {(record.comments || []).map((comment) => (
                    <li key={comment.id} className="rfq-comment-item">
                      <span className="rfq-comment-avatar" aria-hidden="true">{String(comment.author || '?').charAt(0).toUpperCase()}</span>
                      <div className="rfq-comment-bubble">
                        <div className="rfq-comment-meta">
                          <span className="rfq-comment-author">{comment.author || '—'}</span>
                          <span className="rfq-comment-time">{formatDateTime(comment.createdAt)}</span>
                        </div>
                        <p className="rfq-comment-text">{comment.text}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rfq-comment-empty">
                  <MessageSquare aria-hidden="true" />
                  <p>No comments yet — start the discussion.</p>
                </div>
              )}
            </PurchaseSectionCard>
          </div>
        )}

        {/* === TIMELINE === */}
        {activeTab === 'timeline' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Timeline" subtitle="Chronological record of every action">
              <PurchaseApprovalTimeline activity={timeline} />
            </PurchaseSectionCard>
          </div>
        )}

        {/* === AUDIT === */}
        {activeTab === 'audit' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Audit History" subtitle="Every state change with actor, IP and device — for compliance review" icon={ScrollText} bodyClassName="p-0">
              {audit.length === 0 ? (
                <div className="rfq-empty">
                  <ScrollText />
                  <h4>No audit entries</h4>
                  <p>Audit history will appear here as changes are made.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="rfq-audit-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>User</th>
                        <th>Action</th>
                        <th>From</th>
                        <th>To</th>
                        <th>IP Address</th>
                        <th>Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audit.map((entry) => (
                        <tr key={entry.id}>
                          <td className="whitespace-nowrap text-slate-500">{formatDateTime(entry.date)}</td>
                          <td className="font-semibold text-slate-800">{entry.user || '—'}</td>
                          <td><span className="rfq-audit-action">{entry.action}</span></td>
                          <td className="text-slate-400">{entry.oldValue || '—'}</td>
                          <td className="font-semibold text-slate-700">{entry.newValue || '—'}</td>
                          <td className="tabular-nums text-slate-500">{entry.ip || '—'}</td>
                          <td className="text-slate-500">{entry.device || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {audit.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/50 flex items-center gap-2">
                  <ScrollText className="w-3.5 h-3.5 text-slate-400" />
                  <p className="text-[11px] font-semibold text-slate-500">
                    {audit.length} audit entr{audit.length === 1 ? 'y' : 'ies'} for {record.rfqNo} — retained for compliance.
                  </p>
                </div>
              )}
            </PurchaseSectionCard>
          </div>
        )}

        {/* === QUOTATIONS === */}
        {activeTab === 'quotations' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Quotations" subtitle={`${receivedQ} received, ${pendingQ} pending`}>
              <button type="button" onClick={() => navigate(quotationsRoute)} className="w-full flex items-center gap-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer">
                <Mail className="w-3.5 h-3.5 text-slate-400" /> Open Vendor Quotations
              </button>
              <div className="mt-4 rounded-lg bg-[#EDF7F4] border border-[#0B4A3D]/20 px-3 py-2.5 flex items-center gap-2">
                <CalendarDays className="w-3.5 h-3.5 text-[#0A4F44] shrink-0" />
                <p className="text-[11px] font-semibold text-[#0B4A3D]">
                  Quotations due {record.dueDate ? formatDate(record.dueDate) : '—'}
                </p>
              </div>
            </PurchaseSectionCard>
          </div>
        )}

        {/* === PRICE COMPARISON === */}
        {activeTab === 'comparison' && (
          <div className="prv-panel">
            <PurchaseSectionCard title="Price Comparative Statement" subtitle="Ranked vendor offers and savings">
              <button type="button" onClick={() => navigate(`/purchase/rfq/compare?rfq=${record.id}`)} className="w-full flex items-center gap-2.5 text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 hover:bg-slate-50 transition-colors cursor-pointer">
                <Scale className="w-3.5 h-3.5 text-slate-400" /> Open Comparison Matrix
              </button>
            </PurchaseSectionCard>
          </div>
        )}
      </div>

      {/* ── NOTE DIALOG ─────────────────────────────────────────── */}
      <Modal
        open={noteDialog !== null}
        onClose={() => setNoteDialog(null)}
        title={noteTitles[noteDialog?.action] || 'Confirm action'}
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setNoteDialog(null)}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={confirmNoteAction}>
              {busy && <Loader2 className="po-btn-icon-ic animate-spin" />} {noteConfirmLabels[noteDialog?.action] || 'Confirm'}
            </button>
          </>
        }
      >
        <p className="text-xs text-slate-500 mb-4">{noteMessages[noteDialog?.action]}</p>
        {noteShowField && (
          <TextArea rows={3} value={noteDialog?.note || ''} onChange={(e) => setNoteDialog((prev) => ({ ...prev, note: e.target.value }))} placeholder="Optional note for the activity trail..." />
        )}
      </Modal>

      {/* ── RAISE PO DIALOG ────────────────────────────────────── */}
      <Modal
        open={confirmPoRaise}
        onClose={() => { setConfirmPoRaise(false); setPoNote(''); }}
        title={`Raise purchase order for ${record.rfqNo}?`}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setConfirmPoRaise(false); setPoNote(''); }}>Cancel</button>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={raisePo}>
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <FileText className="po-btn-icon-ic" />} Raise Purchase Order
            </button>
          </>
        }
      >
        <p className="text-xs text-slate-500">
          A purchase order will be created from the winning quotation by{' '}
          <strong className="text-slate-700">{record.awardedVendor}</strong> for{' '}
          <strong className="text-slate-700">{formatAmount(record.awardedValue, record.currency)}</strong>.
        </p>
        <TextArea rows={2} className="mt-3" value={poNote} onChange={(e) => setPoNote(e.target.value)} placeholder="Optional note for the activity trail..." />
      </Modal>
    </PurchasePageLayout>
  );
}
