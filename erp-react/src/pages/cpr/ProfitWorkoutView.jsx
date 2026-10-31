import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  ArrowLeft,
  Ban,
  Calculator,
  Calendar,
  Check,
  CheckCircle,
  Clock,
  Copy,
  Download,
  FileDown,
  FileText,
  GitBranch,
  History,
  Layers,
  Link2,
  Loader2,
  Mail,
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
  User
} from 'lucide-react';
import { ActionMenu, ConfirmDialog, Modal, useToast } from '../../components/Common';
import { detailActionClass } from '../../components/Common/detailActionClasses';
import EditHistoryTimeline from '../../components/EditHistory/EditHistoryTimeline';
import RevisionHistoryTable from '../../components/EditHistory/RevisionHistoryTable';
import VersionComparison from '../../components/EditHistory/VersionComparison';
import useVersionComparison from '../../hooks/useVersionComparison';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import useProfitWorkouts from '../../hooks/useProfitWorkouts';
import profitWorkoutService from '../../services/profitWorkoutService';
import { normalizePw, pwStatusMeta, pwDocument, sharePw, emailPw } from '../../utils/profitWorkoutHelpers';
import { formatDate, formatINR, formatRelativeTime } from '../../utils/leadHelpers';
import { CPR_HUB_TABS } from '../../utils/navigationHelpers';
import '../crm/crm-erp.css';

/** The version comparison hook needs the same detail reader the page uses. */
const pwRevisionService = { get: (revisionId) => profitWorkoutService.getPw(revisionId) };

export default function ProfitWorkoutView() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const { submitPw, approvePw, rejectPw, duplicatePw, archivePw, deletePw, restorePw } = useProfitWorkouts({ autoLoad: false });

  const [cw, setCw] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [confirm, setConfirm] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [actionModal, setActionModal] = useState(null); // 'approve' | 'reject'
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [itemsRows, setItemsRows] = useState(null);
  const [timelineRows, setTimelineRows] = useState(null);

  // Lazy-load items from the dedicated endpoint when the tab is opened.
  useEffect(() => {
    if (tab !== 'items') return;
    let cancelled = false;
    profitWorkoutService
      .getItems(id)
      .then((res) => {
        if (!cancelled && Array.isArray(res)) setItemsRows(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab, id]);

  // Lazy-load the persisted activity timeline from the dedicated endpoint.
  useEffect(() => {
    if (tab !== 'timeline') return;
    let cancelled = false;
    profitWorkoutService
      .getTimeline(id)
      .then((res) => {
        if (!cancelled && Array.isArray(res)) setTimelineRows(res);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tab, id]);

  // Lazy-load attachments when the tab is opened (ERP lazyLoadAttachments)
  useEffect(() => {
    if (tab !== 'attachments') return;
    let cancelled = false;
    const loadAttachments = async () => {
      setAttachmentsLoading(true);
      try {
        const res = await profitWorkoutService.getAttachments(id);
        if (!cancelled) setAttachments(Array.isArray(res) ? res : []);
      } catch {
        if (!cancelled) setAttachments([]);
      } finally {
        if (!cancelled) setAttachmentsLoading(false);
      }
    };
    loadAttachments();
    return () => {
      cancelled = true;
    };
  }, [tab, id]);

  const load = async () => {
    const res = await profitWorkoutService.getPw(id);
    setCw(normalizePw(res?.data ?? res));
    setError(null);
  };

  useEffect(() => {
    // Clear previous record immediately so stale data never flashes.
    setCw(null);
    setLoading(true);
    setError(null);
    let cancelled = false;
    profitWorkoutService
      .getPw(id)
      .then((res) => {
        if (cancelled) return;
        setCw(normalizePw(res?.data ?? res));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load Profit Workout');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const doc = useMemo(() => (cw ? pwDocument(cw) : null), [cw]);

  const status = String(cw?.status || 'draft').toLowerCase();
  const meta = pwStatusMeta(cw?.status);

  // Revision chain + diff against the immediately preceding saved version,
  // using the same comparison surface as the Quotation view.
  const version = useVersionComparison({
    service: pwRevisionService,
    doc: cw,
    normalize: normalizePw,
    enabled: Boolean(cw) && (tab === 'version-history' || cw?.latestRevision === false)
  });
  const latestRevisionId = version.chain.find((rev) => rev.latestRevision)?.id ?? cw?.id;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-6 h-6 text-[#0B4A3D] animate-spin" />
      </div>
    );
  }

  if (error || !cw) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <Calculator className="w-12 h-12 text-slate-300 mb-4" />
        <h3 className="text-base font-bold text-slate-700 mb-1.5">Profit Workout not found</h3>
        <p className="text-xs text-slate-400 mb-5">{error || 'The requested Profit Workout does not exist.'}</p>
        <button
          type="button"
          onClick={() => navigate(CPR_HUB_TABS['profit-workout'])}
          className="erp-detail-action erp-detail-action--primary"
        >
          Back to Profit Workouts
        </button>
      </div>
    );
  }

  // Historical revisions are read-only: edit/submit/approve/duplicate and
  // archive/delete are all hidden for them (backend also rejects them).
  const isHistorical = cw.latestRevision === false;
  const canEdit = ['draft', 'completed', 'rejected'].includes(status) && !isHistorical;
  const canSubmit = ['draft', 'completed', 'rejected'].includes(status) && !isHistorical;
  const canApprove = status === 'submitted' && !isHistorical;
  const canDuplicate = status !== 'deleted' && !isHistorical;

  const runAction = async (fn, successMsg) => {
    setBusy(true);
    const res = await fn(cw.id);
    setBusy(false);
    if (res.ok) {
      toast.success(successMsg);
      setConfirm(null);
      load();
    } else {
      toast.error(res.error?.message || 'Operation failed');
    }
  };

  const openApprove = () => {
    setRemarks('');
    setActionModal('approve');
  };

  const openReject = () => {
    setRemarks('');
    setActionModal('reject');
  };

  const executeApproval = async () => {
    setBusy(true);
    const res = actionModal === 'approve' ? await approvePw(cw.id, remarks) : await rejectPw(cw.id, remarks);
    setBusy(false);
    if (res.ok) {
      toast.success(actionModal === 'approve' ? 'Profit Workout approved' : 'Profit Workout rejected');
      setActionModal(null);
      load();
    } else {
      toast.error(res.error?.message || 'Operation failed');
    }
  };

  const handleShare = async () => {
    const res = await sharePw(cw);
    if (res.ok) {
      toast.success(res.action === 'copy' ? 'Link copied to clipboard' : 'Shared successfully');
    } else {
      toast.error(res.error?.message || 'Failed to share');
    }
  };

  const handleEmail = () => {
    const res = emailPw(cw);
    if (!res.ok) toast.error(res.error || 'Failed to open email client');
  };

  const handlePrint = () => window.print();

  const handleDuplicate = async () => {
    setBusy(true);
    const res = await duplicatePw(cw.id);
    setBusy(false);
    if (res.ok) {
      const data = res.data?.data ?? {};
      toast.success(`Duplicated as ${data.pwNo || cw.pwNo}`);
      load();
    } else {
      toast.error(res.error?.message || 'Failed to duplicate Profit Workout');
    }
  };

  const itemsSource = itemsRows ?? cw.items;
  const itemsArr = Array.isArray(itemsSource) ? itemsSource : [];

  // Item-wise profit values come persisted from the API (each ProfitWorkoutItem
  // carries its own cost / selling / profit, recomputed server-side by recalc
  // whenever costs or rates change). The fallbacks below keep the columns
  // correct for legacy rows that predate the fields.
  const itemCostOf = (item) => {
    if (item.cost != null && item.cost !== '') return Number(item.cost) || 0;
    return (Array.isArray(item.categories) ? item.categories : []).reduce(
      (sum, cat) => sum + (String(cat.category || '').toLowerCase() === 'lead time' ? 0 : (Number(cat.qty) || 0) * (Number(cat.rate) || 0)),
      0
    );
  };
  const itemSellingOf = (item) => {
    if (item.selling != null && item.selling !== '') return Number(item.selling) || 0;
    const cost = itemCostOf(item);
    return cost + (cost * (Number(doc.profitPct) || 0)) / 100;
  };
  const itemProfitOf = (item) => {
    if (item.profit != null && item.profit !== '') return Number(item.profit) || 0;
    return itemSellingOf(item) - itemCostOf(item);
  };

  // Flat item rows: one row per item with cost/selling rates, profit per unit
  // and margin. Legacy category rows (no stored rates) derive the rates from
  // the persisted cost / selling / qty so the columns stay correct.
  const itemRows = itemsArr.map((item) => {
    const qty = Number(item.qty) || 0;
    const costAmt = itemCostOf(item);
    const sellAmt = itemSellingOf(item);
    const profitAmt = itemProfitOf(item);
    const hasRate = item.costRate != null && item.sellingRate != null && item.sellingRate !== '';
    const costRate = hasRate ? Number(item.costRate) || 0 : qty > 0 ? Math.round((costAmt / qty) * 100) / 100 : 0;
    const sellingRate = hasRate ? Number(item.sellingRate) || 0 : qty > 0 ? Math.round((sellAmt / qty) * 100) / 100 : 0;
    const profitPerUnit = item.profitPerUnit != null && item.profitPerUnit !== ''
      ? Number(item.profitPerUnit) || 0
      : Math.round((sellingRate - costRate) * 100) / 100;
    const margin = item.margin != null && item.margin !== ''
      ? Number(item.margin) || 0
      : sellAmt !== 0 ? Math.round((profitAmt / sellAmt) * 10000) / 100 : 0;
    return { item, qty, costRate, sellingRate, costAmt, sellAmt, profitPerUnit, profitAmt, margin };
  });

  const totalCost = itemRows.reduce((sum, row) => sum + row.costAmt, 0);
  const totalSelling = itemRows.reduce((sum, row) => sum + row.sellAmt, 0);
  const totalProfit = itemRows.reduce((sum, row) => sum + row.profitAmt, 0);
  const overallMargin = totalSelling !== 0 ? (totalProfit / totalSelling) * 100 : 0;

  const confirmConfigs = {
    submit: { title: 'Submit Profit Workout', message: `Submit ${cw.pwNo} for approval?`, confirmLabel: 'Submit', variant: 'default', icon: Send },
    archive: { title: 'Archive Profit Workout', message: `Archive ${cw.pwNo}?`, confirmLabel: 'Archive', variant: 'warning', icon: Archive },
    restore: { title: 'Restore Profit Workout', message: `Restore ${cw.pwNo} to active?`, confirmLabel: 'Restore', variant: 'default', icon: RotateCcw },
    delete: { title: 'Delete Profit Workout', message: `Move ${cw.pwNo} to trash?`, confirmLabel: 'Delete', variant: 'danger', icon: Trash2 }
  };

  // Front row keeps the ERP layout — Back / Edit / Print plus the status-driven
  // workflow actions (Submit, Approve, Reject). Utility and rare actions
  // (Duplicate, Share, Email, Archive/Restore, Delete) move into the ⋯ More
  // menu; each still calls its existing handler.
  const moreActions = [];
  if (canDuplicate) {
    moreActions.push({ key: 'duplicate', label: 'Duplicate', icon: Copy, action: handleDuplicate });
  }
  moreActions.push({ key: 'share', label: 'Share', icon: Share2, action: handleShare });
  moreActions.push({ key: 'email', label: 'Email', icon: Mail, action: handleEmail });
  if (!isHistorical && status === 'archived') {
    moreActions.push({ key: 'restore', label: 'Restore', icon: RotateCcw, action: () => setConfirm({ type: 'restore' }) });
  } else if (!isHistorical && status !== 'deleted') {
    moreActions.push({ key: 'archive', label: 'Archive', icon: Archive, action: () => setConfirm({ type: 'archive' }) });
    moreActions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true, action: () => setConfirm({ type: 'delete' }) });
  }

  return (
    /* `erp-detail-scope` opts this page into the shared detail-page action
       standard (styles/erp-detail-scope.css) — the same class family the Cost
       Workout detail page uses, so Back / Edit / Submit / More get the
       reference geometry. */
    <div className="erp-detail-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {/* ===== BREADCRUMB ===== */}
      {/* Same shared breadcrumb as Cost Workout: Dashboard > Sales > CPR >
          Profit Workout > <PW No>, with "Profit Workout" opening the
          canonical list regardless of entry point. */}
      <SalesBreadcrumb
        items={[
          { label: 'CPR', to: '/cprs' },
          { label: 'Profit Workout', to: CPR_HUB_TABS['profit-workout'] },
          { label: cw.pwNo }
        ]}
      />

      {/* ===== STICKY HEADER (same card + tabs pattern as CPR View) ===== */}
      <div className="sticky top-0 z-20 bg-app">
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-1 items-center gap-3.5 min-w-[280px] lg:min-w-[420px]">
              <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-[#083D34] to-[#083D34] text-white flex items-center justify-center text-xl font-bold shrink-0">
                {initialOf(cw.customerName || cw.company || 'Profit Workout')}
              </div>
              <div className="min-w-0">
                <h1 className="text-[22px] font-bold text-slate-900 leading-tight truncate">
                  {cw.customerName || cw.company || 'Profit Workout'}{' '}
                  <span className="text-slate-400 font-semibold">({cw.pwNo})</span>
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Tag className="w-3 h-3 text-[#0B4A3D]" /> {cw.pwNo}
                  </span>
                  <span className={`cpr-badge ${meta.className} inline-flex items-center px-2.5 py-0.5 rounded-[20px] text-[11px] font-semibold`}>
                    {meta.label}
                  </span>
                  {cw.cprRef && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Link2 className="w-3 h-3 text-[#0B4A3D]" /> CPR {cw.cprRef}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                    <Calendar className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(cw.pwDate)}
                  </span>
                  {cw.preparedBy && (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <User className="w-3 h-3 text-[#0B4A3D]" /> {cw.preparedBy}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="erp-detail-actions">
          {/* Explicit back affordance (ERP convention) — always the canonical
              Profit Workout list, regardless of how this page was reached. */}
          <button type="button" onClick={() => navigate(CPR_HUB_TABS['profit-workout'])} className="erp-detail-action">
            <ArrowLeft /> Back to List
          </button>
          {canEdit && (
            <button type="button" onClick={() => navigate(`/profit-workouts/${cw.id}/edit`)} className="erp-detail-action">
              <Pencil /> Edit
            </button>
          )}
          {canSubmit && (
            <button type="button" onClick={() => setConfirm({ type: 'submit' })} className={detailActionClass('primary')}>
              <Send /> Submit
            </button>
          )}
          {canApprove && (
            <>
              <button type="button" onClick={openApprove} className={detailActionClass('primary')}>
                <CheckCircle /> Approve
              </button>
              <button type="button" onClick={openReject} className={detailActionClass('reject')}>
                <Ban /> Reject
              </button>
            </>
          )}
          <button type="button" onClick={handlePrint} className="erp-detail-action">
            <Printer /> Print
          </button>
          {moreActions.length > 0 && (
            <ActionMenu
              items={moreActions}
              onAction={(key) => moreActions.find((a) => a.key === key)?.action()}
              triggerClassName="erp-detail-action erp-detail-action--more"
              buttonLabel="More profit workout actions"
              label="More"
            />
          )}
            </div>
          </div>
        </div>

        {/* ===== TABS ===== */}
        <div className="flex items-center gap-1 border-b-2 border-slate-200 mt-3 overflow-x-auto no-scrollbar">
          {[
            {
              key: 'overview',
              label: 'Overview',
              icon: Layers,
              count: null
            },
            {
              key: 'items',
              label: 'Items',
              icon: Package,
              count: Array.isArray(itemsRows ?? cw.items) ? (itemsRows ?? cw.items).length : null
            },
            {
              key: 'timeline',
              label: 'Timeline',
              icon: History,
              count: Array.isArray(cw.timeline) ? cw.timeline.length : null
            },
            {
              key: 'attachments',
              label: 'Attachments',
              icon: Paperclip,
              count: tab === 'attachments' || attachments.length > 0 ? attachments.length : null
            },
            {
              key: 'version-history',
              label: 'Version History',
              icon: GitBranch,
              count: Array.isArray(cw.revisions) ? cw.revisions.length : null
            }
          ].map((t) => {
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

      <div className="mt-4">
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start">
          <div className="flex flex-col gap-4">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={FileText} title="Document Information" />
              <Row label="PW Number" value={cw.pwNo} />
              <Row label="Date" value={formatDate(cw.pwDate)} />
              <Row label="CPR Reference" value={cw.cprRef || '—'} />
              <Row label="Linked CPR">
                {cw.cprId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/cprs/${cw.cprId}`)}
                    className="text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                  >
                    {cw.linkedCpr || cw.cprRef || `CPR-${cw.cprId}`}
                  </button>
                ) : (
                  <span className="text-slate-700">{cw.linkedCpr || '—'}</span>
                )}
              </Row>
              <Row label="Status">
                <span className={`cpr-badge ${meta.className} inline-flex items-center px-2.5 py-0.5 rounded-[20px] text-[11px] font-semibold`}>
                  {meta.label}
                </span>
              </Row>
              <Row label="Source Cost Workout">
                {cw.sourceCwId ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/cost-workouts/${cw.sourceCwId}`)}
                    className="text-[#0B4A3D] font-medium hover:underline cursor-pointer"
                  >
                    {cw.sourceCwNo || `CW-${cw.sourceCwId}`}
                  </button>
                ) : (
                  <span className="text-slate-700">{cw.sourceCwNo || '—'}</span>
                )}
              </Row>
            </div>

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={User} title="Customer Information" />
              <Row label="Prepared By" value={cw.preparedBy || '—'} />
              <Row label="Contact Person" value={cw.contactPerson || '—'} />
              <Row label="Customer" value={cw.customerName || '—'} />
              <Row label="Company" value={cw.company || '—'} />
              <Row label="Phone" value={cw.phone || '—'} />
              <Row label="Email">
                {cw.email ? (
                  <a href={`mailto:${cw.email}`} className="text-[#0B4A3D] font-medium hover:underline">{cw.email}</a>
                ) : (
                  '—'
                )}
              </Row>
              <Row label="GST" value={cw.gst || '—'} />
              <Row label="PAN" value={cw.pan || '—'} />
              <Row label="Billing Address">{cw.billingAddress || '—'}</Row>
              <Row label="Shipping Address">{cw.shippingAddress || '—'}</Row>
            </div>

            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={StickyNote} title="Remarks" />
              <div className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{cw.remarks || '—'}</div>
            </div>
          </div>

          <div className="flex flex-col gap-4 lg:sticky lg:top-40">
            {/* Profit summary sidebar */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <CardHeader icon={Calculator} title="Profit Summary" />
              <Row label="Items" value={String(Array.isArray(cw.items) ? cw.items.length : 0)} />
              <Row label="Subtotal" value={formatINR(doc.subtotal)} strong />
              <Row label={`Profit ${doc.profitPct}%`} value={formatINR(doc.profitAmt)} />
              <Row label="Selling Price" value={formatINR(doc.sellingPrice)} />
              <Row label={`Discount ${doc.discountPct}%`} value={`−${formatINR(doc.discountAmt)}`} />
              <Row label={`GST ${doc.gstPct}%`} value={formatINR(doc.gstAmt)} />
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Grand Total</span>
                <span className="text-sm font-bold text-[#0B4A3D]">{formatINR(doc.grandTotal)}</span>
              </div>
            </div>

            {((status === 'approved' && cw.approvedBy) || status === 'rejected') && (
              <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
                <CardHeader icon={CheckCircle} title="Approval" />
                {status === 'approved' && cw.approvedBy && (
                  <Row label="Approved By">
                    <span className="inline-flex items-center gap-1.5 text-emerald-700">
                      <Check className="w-3.5 h-3.5" /> {cw.approvedBy}
                    </span>
                  </Row>
                )}
                {status === 'rejected' && (
                  <>
                    <Row label="Status"><span className="text-rose-600">Rejected</span></Row>
                    {cw.rejectionReason && <Row label="Rejection Reason"><span className="text-rose-600">{cw.rejectionReason}</span></Row>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'items' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <CardHeader
              icon={Package}
              title="Item Details"
              count={`${Array.isArray(itemsRows ?? cw.items) ? (itemsRows ?? cw.items).length : 0} records`}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 40 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 65 }} />
                <col style={{ width: 135 }} />
                <col style={{ width: 90 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 100 }} />
                <col style={{ width: 105 }} />
                <col style={{ width: 85 }} />
              </colgroup>
              <thead>
                <tr className="bg-slate-100/80 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  <th className="py-2.5 px-2 text-center">#</th>
                  <th className="py-2.5 px-2 text-left">Description</th>
                  <th className="py-2.5 px-2 text-center">Qty</th>
                  <th className="py-2.5 px-2 text-left">Category</th>
                  <th className="py-2.5 px-2 text-center">Unit</th>
                  <th className="py-2.5 px-2 text-right">Cost Rate</th>
                  <th className="py-2.5 px-2 text-right">Selling Rate</th>
                  <th className="py-2.5 px-2 text-right">Cost Amount</th>
                  <th className="py-2.5 px-2 text-right">Selling Amount</th>
                  <th className="py-2.5 px-2 text-right">Profit / Unit</th>
                  <th className="py-2.5 px-2 text-right">Profit Amount</th>
                  <th className="py-2.5 px-2 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {itemRows.length === 0 && (
                  <tr>
                    <td colSpan={12} className="px-3 py-10 text-center text-xs text-slate-400">
                      No items in this Profit Workout.
                    </td>
                  </tr>
                )}
                {itemRows.map((row, index) => (
                  <tr key={`${row.item.id}-${index}`} className="border-b border-slate-100">
                    <td className="px-2 py-2.5 text-xs text-slate-400 text-center">{index + 1}</td>
                    <td className="px-2 py-2.5">
                      <span className="text-xs font-semibold text-slate-700">{row.item.description || '—'}</span>
                    </td>
                    <td className="px-2 py-2.5 text-xs text-center text-slate-600">{row.qty}</td>
                    <td className="px-2 py-2.5 text-xs text-slate-600">{row.item.category || '—'}</td>
                    <td className="px-2 py-2.5 text-xs text-center text-slate-500">{row.item.unit || '—'}</td>
                    <td className="px-2 py-2.5 text-xs text-right text-slate-600 whitespace-nowrap">{formatINR(row.costRate)}</td>
                    <td className="px-2 py-2.5 text-xs text-right text-slate-600 whitespace-nowrap">{formatINR(row.sellingRate)}</td>
                    <td className="px-2 py-2.5 text-xs text-right font-semibold text-slate-700 whitespace-nowrap">{formatINR(row.costAmt)}</td>
                    <td className="px-2 py-2.5 text-xs text-right font-semibold text-slate-700 whitespace-nowrap">{formatINR(row.sellAmt)}</td>
                    <td className={`px-2 py-2.5 text-xs text-right font-semibold whitespace-nowrap ${row.profitPerUnit < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                      {formatINR(row.profitPerUnit)}
                    </td>
                    <td className={`px-2 py-2.5 text-xs text-right font-bold whitespace-nowrap ${row.profitAmt < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatINR(row.profitAmt)}
                    </td>
                    <td className={`px-2 py-2.5 text-xs text-right font-semibold whitespace-nowrap ${row.margin < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                      {row.margin.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 flex flex-wrap items-center gap-5 text-xs">
            <span><span className="font-bold text-slate-700">{itemRows.length}</span> Items</span>
            <span className="ml-auto font-bold text-slate-700">Total Cost: {formatINR(totalCost)}</span>
            <span className="font-bold text-slate-700">Total Selling: {formatINR(totalSelling)}</span>
            <span className={`font-bold ${totalProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
              Total Profit: {formatINR(totalProfit)}
            </span>
            <span className="font-bold text-slate-700">Profit %: {overallMargin.toFixed(2)}%</span>
            <span className="font-bold text-[#0B4A3D]">Grand Total: {formatINR(doc.grandTotal)}</span>
          </div>
        </div>
      )}

      {tab === 'timeline' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
          <CardHeader
            icon={History}
            title="Timeline"
            count={`${Array.isArray(timelineRows ?? cw.timeline) ? (timelineRows ?? cw.timeline).length : 0} events`}
          />
          {Array.isArray(cw.timeline) && cw.timeline.length > 0 ? (
            <div className="space-y-4">
              {(timelineRows ?? cw.timeline).map((entry) => (
                <div key={entry.id} className="flex items-start gap-3">
                  <div className="mt-0.5 w-7 h-7 rounded-full bg-[#0B4A3D]/10 text-[#0B4A3D] flex items-center justify-center shrink-0">
                    {entry.type === 'approved' ? <Check className="w-3.5 h-3.5" /> : <FileDown className="w-3.5 h-3.5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-700">{entry.title}</div>
                    {entry.detail && <div className="text-[11px] text-slate-500 mt-0.5">{entry.detail}</div>}
                    <div className="text-[10px] text-slate-400 mt-0.5">{formatRelativeTime(entry.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Clock} title="No Timeline Events" subtitle="No activity recorded for this Profit Workout." />
          )}
        </div>
      )}

      {tab === 'attachments' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
          <CardHeader
            icon={Paperclip}
            title="Attachments"
            count={attachmentsLoading ? null : `${attachments.length} records`}
          />
          {attachmentsLoading ? (
            <div className="flex items-center justify-center py-10 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 text-[#0B4A3D] animate-spin mr-2" /> Loading attachments...
            </div>
          ) : attachments.length === 0 ? (
            <EmptyState icon={Paperclip} title="No Attachments" subtitle="No attachments for this Profit Workout." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attachments.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5">
                  {f.type && f.type.startsWith('image/') ? (
                    <img src={f.data} alt={f.name} className="w-11 h-11 rounded object-cover shrink-0" />
                  ) : (
                    <FileText className="w-6 h-6 text-[#0B4A3D] shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate" title={f.name}>
                      {f.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {f.size ? `${(Number(f.size) / 1024).toFixed(1)} KB` : ''}
                    </div>
                  </div>
                  <a
                    href={f.data}
                    download={f.name}
                    aria-label={`Download ${f.name}`}
                    className="p-1.5 text-slate-400 hover:text-[#0B4A3D] hover:bg-slate-100 rounded-md transition-colors shrink-0"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ===== VERSION HISTORY PANE ===== */}
      {tab === 'version-history' && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
          <CardHeader
            icon={GitBranch}
            title="Version History"
            count={`${Array.isArray(cw?.revisions) ? cw.revisions.length : 0} versions`}
          />
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
                    ? `/profit-workouts/${latestRevisionId}`
                    : null
                }
                onGoToCurrent={() => navigate(`/profit-workouts/${latestRevisionId}`)}
              />
            </div>
          ) : null}
          <RevisionHistoryTable
            revisions={version.chain.length > 0 ? version.chain : cw?.revisions}
            docNumber={cw?.pwNo || ''}
            currentId={cw?.id}
            viewRoute={(rev) => `/profit-workouts/${rev.id}`}
            navigate={navigate}
          />
          <div className="mt-4">
            <EditHistoryTimeline moduleKey="profitWorkout" recordId={id} limit={50} />
          </div>
          {!Array.isArray(cw?.revisions) || cw.revisions.length === 0 ? (
            <EmptyState icon={GitBranch} title="No Revision History" subtitle="This is the original version of the document." />
          ) : null}
        </div>
      )}
      </div>

      {/* ===== CONFIRM ===== */}
      {confirm && (
        <ConfirmDialog
          open
          title={confirmConfigs[confirm.type].title}
          message={confirmConfigs[confirm.type].message}
          confirmLabel={confirmConfigs[confirm.type].confirmLabel}
          variant={confirmConfigs[confirm.type].variant}
          icon={confirmConfigs[confirm.type].icon}
          loading={busy}
          onConfirm={() =>
            runAction(
              confirm.type === 'submit' ? submitPw : confirm.type === 'archive' ? archivePw : confirm.type === 'restore' ? restorePw : deletePw,
              confirm.type === 'submit' ? `${cw.pwNo} submitted for approval` : confirm.type === 'archive' ? `${cw.pwNo} archived` : confirm.type === 'restore' ? `${cw.pwNo} restored` : `${cw.pwNo} moved to trash`
            )
          }
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ===== APPROVE / REJECT MODAL ===== */}
      <Modal open={actionModal !== null} onClose={() => setActionModal(null)} title={actionModal === 'approve' ? 'Approve Profit Workout' : 'Reject Profit Workout'}>
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {actionModal === 'approve' ? `Approve ${cw.pwNo} (${formatINR(doc.grandTotal)})?` : `Reject ${cw.pwNo} (${formatINR(doc.grandTotal)})?`}
          </p>
          <textarea
            rows={3}
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder={actionModal === 'approve' ? 'Approval remarks (optional)' : 'Rejection reason (required for reject)'}
            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setActionModal(null)}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeApproval}
              disabled={busy || (actionModal === 'reject' && !remarks.trim())}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 ${
                actionModal === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {actionModal === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </div>
        </div>
      </Modal>
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

function initialOf(name = '') {
  return (name || '?').trim().charAt(0).toUpperCase();
}

function Row({ label, value, strong = false, children }) {
  return (
    <div className="flex py-1.5 text-[13px] border-b border-slate-100 last:border-b-0">
      <span className="w-[130px] shrink-0 text-slate-500 font-medium text-xs">{label}</span>
      <span className={`flex-1 min-w-0 ${strong ? 'font-bold text-slate-800' : 'text-slate-700 font-medium'}`}>
        {children ?? value}
      </span>
    </div>
  );
}
