/**
 * purchase/pages/requisition/PurchaseRequisitionView.jsx
 * ------------------------------------------------------------------
 * Purchase Requisition detail — compact dashboard-style read-only ERP
 * view.
 *
 * Layout (UI only — logic, services, routes and data model untouched):
 *   • Top KPI row — Total Amount, Status, Vendor, Department,
 *     Required Date, Approval (values never wrap).
 *   • Tabbed sections (one open at a time): Overview · Items ·
 *     Approval · Timeline · Comments · Attachments.
 *   • 70/30 grid (65/35 tablet, single column mobile) with a sticky
 *     right panel holding the compact Document Summary + Cost Summary.
 *   • Line items in their own card with a 400px scrollable, sticky-
 *     header table.
 *   • Full workflow actions (submit, approve, reject, return, create
 *     RFQ) plus duplicate, print preview, PDF export and
 *     links to the Approval / Timeline / Activity sub-pages.
 *
 * Create RFQ (Approved only) navigates to /purchase/rfq/new?pr=<prNo>
 * — RfqForm resolves the approved requisition from the master and
 * copies its items, scope and ownership into the new RFQ draft.
 * ------------------------------------------------------------------
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, ArrowLeft, BadgeCheck, Building2, CalendarDays, CheckCircle2,
  ClipboardList, Copy, Download, FileText, History,
  IndianRupee, LayoutDashboard, ListChecks, Loader2, MessageSquare,
  MoreHorizontal, Paperclip, Pencil, Printer, Send, SendHorizonal, Trash2,
  XCircle
} from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { ConfirmDialog, Modal, TextArea, useToast } from '../../components/ui';
import Tabs from '../../components/ui/Tabs';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import '../../styles/cpr-list.css';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import AttachmentList from '../../components/AttachmentList';
import SourceDocumentsDrawer from '../../components/SourceDocumentsDrawer';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseDocumentSummary from '../../components/PurchaseDocumentSummary';
import PurchaseSummary from '../../components/PurchaseSummary';
import PurchaseItemTable from '../../components/PurchaseItemTable';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import { requisitionService } from '../../services/requisition';
import { rfqService } from '../../services/rfq';
import { canApproveRequisitions } from '../../utils/access';
import { PR_RFQ_ELIGIBLE, PR_STATUS } from '../../constants';
import { formatAmountConverted } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

function DetailItem({ label, value }) {
  return (
    <div className="prv-detail-item">
      <div className={LABEL}>{label}</div>
      <div className="prv-detail-value mt-1">{value || '—'}</div>
    </div>
  );
}

export default function PurchaseRequisitionView() {
  const navigate = useNavigate();
  /* Action-level gates, mirrored by the backend on /api/purchase/requisitions/**.
     Approve/Reject keep their existing approval-authority check as well. */
  const { can } = usePurchaseAccess();
  const canSubmitPr = can('requisition', 'submit');
  const canApprovePr = can('requisition', 'approve');
  const canRejectPr = can('requisition', 'reject');
  const canConvertPr = can('requisition', 'convert');
  const canEditPr = can('requisition', 'edit');
  const canDeletePr = can('requisition', 'delete');
  const canPrintPr = can('requisition', 'print');
  const canCreatePr = can('requisition', 'create');
  const location = useLocation();
  const { id } = useParams();
  const toast = useToast();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentBusy, setCommentBusy] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  useClickOutside(moreRef, () => setMoreOpen(false), moreOpen);

  /* Close the mobile More menu on Escape. */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await requisitionService.getRequisition(id);
        if (cancelled) return;
        setRecord(data);
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
  }, [id]);

  /* One-time toast when redirected from the Edit page because the PR is
     not editable.  The state is cleared immediately via replaceState so
     refreshing the page or navigating away does not re-trigger the toast. */
  useEffect(() => {
    if (location.state?.editBlocked) {
      const { prNo, status } = location.state;
      toast.info(`Editing is unavailable — ${prNo || 'this requisition'} is ${status || 'not in Draft status'}.`);
      window.history.replaceState({}, document.title);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Blocks a workflow action from being submitted twice (double click /
     double Enter) — the buttons are only disabled after a re-render, which
     is too late for a second click in the same tick. */
  const workflowBusy = useRef(false);

  const runWorkflow = async (operation, successMessage) => {
    if (workflowBusy.current) return null;
    workflowBusy.current = true;
    setBusy(true);
    try {
      const updated = await operation();
      /* Re-read the record returned by the backend so the status,
         approval fields and activity reflect the saved state. */
      setRecord(updated);
      toast.success(successMessage);
      return updated;
    } catch (err) {
      toast.error(err?.message || 'Action failed');
      return null;
    } finally {
      setBusy(false);
      workflowBusy.current = false;
    }
  };

  const confirmDecision = async () => {
    if (decision === 'reject' && !note.trim()) {
      setNoteError('Please provide a reason for rejection');
      return;
    }
    setNoteError('');
    const isApprove = decision === 'approve';
    await runWorkflow(
      () => (isApprove ? requisitionService.approveRequisition(id, note.trim()) : requisitionService.rejectRequisition(id, note.trim())),
      isApprove ? `${record.prNo} approved` : `${record.prNo} rejected`
    );
    setDecision(null);
    setNote('');
  };

  const handleDelete = async () => {
    /* Soft delete (record lifecycle) — the backend keeps the record in
       trash and rejects the call when an RFQ still references the PR. */
    const result = await runWorkflow(() => requisitionService.deleteRequisition(id), `${record.prNo} moved to trash`);
    setConfirmDelete(false);
    if (result) navigate('/purchase/requisition');
  };

  const handleDuplicate = async () => {
    const result = await runWorkflow(() => requisitionService.duplicateRequisition(id), 'Duplicate requisition created');
    setConfirmDuplicate(false);
    if (result) navigate(`/purchase/requisition/${result.id}/edit`);
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    setCommentBusy(true);
    try {
      const updated = await requisitionService.addComment(id, commentText.trim());
      setRecord(updated);
      setCommentText('');
      toast.success('Comment added');
    } catch (err) {
      toast.error(err?.message || 'Failed to add comment');
    } finally {
      setCommentBusy(false);
    }
  };

  /* Opens the RFQ that was created from this PR. The RFQ route uses the
     RFQ id — resolve it from the stored rfqNo, falling back to the
     number itself (form-created RFQs use the number as their id). */
  const handleViewRfq = async () => {
    setBusy(true);
    try {
      const result = await rfqService.getRfqs({ rfqNo: record.rfqNo, page: 1, pageSize: 5 });
      const row = (result.data || []).find((rfq) => rfq.rfqNo === record.rfqNo);
      navigate(`/purchase/rfq/${row?.id || record.rfqNo}`);
    } catch {
      toast.error('Could not open the linked RFQ');
    } finally {
      setBusy(false);
    }
  };

  /* Icon-only toolbar button — 40×40 bordered action with tooltip + tone. */
  const iconButton = (Icon, label, onClick, tone = 'neutral') => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`prv-icon-btn prv-icon-btn-${tone}`}
    >
      <Icon aria-hidden="true" />
    </button>
  );

  const renderWorkflowButtons = () => {
    if (!record) return null;
    if (!canSubmitPr) return null;
    if (record.status === PR_STATUS.DRAFT || record.status === PR_STATUS.RETURNED) {
      return (
        <button
          type="button"
          onClick={() => setConfirmSubmit(true)}
          disabled={busy}
          className="po-btn po-btn-primary"
        >
          <Send className="po-btn-icon-ic" /> Submit for Approval
        </button>
      );
    }
    if (record.status === PR_STATUS.PENDING_APPROVAL) {
      /* Approve / Reject are approval-queue actions — rendered only for
         an authorised PR approver (Admin role / approval permission).
         The service enforces the same rule, so direct calls fail too. */
      if (!canApproveRequisitions() || !canApprovePr) return null;
      return (
        <>
          {canRejectPr && (
            <button
              type="button"
              onClick={() => {
                setNote('');
                setNoteError('');
                setDecision('reject');
              }}
              disabled={busy}
              className="po-btn po-btn-danger"
            >
              <XCircle className="po-btn-icon-ic" /> Reject
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setNote('');
              setNoteError('');
              setDecision('approve');
            }}
            disabled={busy}
            className="po-btn po-btn-success"
          >
            <CheckCircle2 className="po-btn-icon-ic" /> Approve
          </button>
        </>
      );
    }
    if (record.rfqNo) {
      /* A PR can only ever produce one RFQ — once linked, the action
         becomes View RFQ instead of Convert to RFQ. */
      return (
        <button
          type="button"
          onClick={handleViewRfq}
          disabled={busy}
          title={`RFQ already created for this requisition — ${record.rfqNo}`}
          className="po-btn po-btn-ghost"
        >
          <FileText className="po-btn-icon-ic" /> View RFQ {record.rfqNo}
        </button>
      );
    }
    if (canConvertPr && PR_RFQ_ELIGIBLE.includes(record.status)) {
      return (
        <button
          type="button"
          onClick={() => navigate(`/purchase/rfq/new?pr=${record.prNo}`)}
          title="Convert this requisition to an RFQ — items, scope and ownership are copied over"
          className="po-btn po-btn-ghost bg-[#075E54] text-white border-[#075E54] hover:bg-[#064E46] hover:border-[#064E46]"
          style={{ backgroundColor: '#075E54', color: '#FFFFFF', borderColor: '#075E54' }}
        >
          <SendHorizonal className="po-btn-icon-ic" /> Convert to RFQ
        </button>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !record) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Requisition not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/requisition')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Requisitions
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const review = record.technicalReview || null;
  /* Stored totals are computed from the record's GST type on every
     read (normalizePurchaseRequest), so the IGST component is
     authoritative — no need to re-derive it from gstType here. */
  const igst = record.totals?.igst ?? 0;

  const details = [
    { label: 'Department', value: record.department },
    { label: 'Project', value: record.project },
    { label: 'Requester', value: record.requester },
    { label: 'Vendor', value: record.vendor },
    { label: 'Buyer', value: record.buyer },
    { label: 'Currency', value: record.currency },
    { label: 'Priority', value: record.priority },
    { label: 'Payment Terms', value: record.terms },
    { label: 'Required Date', value: record.expectedDate ? formatDate(record.expectedDate) : '' },
    { label: 'Discount', value: record.discount ? `${record.discount}%` : '—' },
    { label: 'Requested On', value: formatDateTime(record.createdAt) },
    { label: 'Charges', value: record.charges ? formatAmountConverted(record.charges, record.currency) : '—' },
    /* Linked RFQ — present only after the PR has been converted. */
    ...(record.rfqNo
      ? [
          {
            label: 'Source RFQ',
            value: (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center rounded-full bg-[#0B4A3D]/10 text-[#0B4A3D] px-2 py-0.5 text-[10px] font-bold">
                  RFQ already created
                </span>
                <button
                  type="button"
                  onClick={handleViewRfq}
                  disabled={busy}
                  className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
                >
                  {record.rfqNo}
                </button>
              </span>
            )
          }
        ]
      : [])
  ];

  const totalAmount = record.totals?.roundedTotal ?? record.totals?.total ?? 0;

  const KPI_ICONS = {
    'Total Amount': { Icon: IndianRupee, tone: 'emerald' },
    Status: { Icon: Activity, tone: 'green' },
    Vendor: { Icon: Building2, tone: 'amber' },
    Department: { Icon: ClipboardList, tone: 'indigo' },
    'Required Date': { Icon: CalendarDays, tone: 'violet' },
    Approval: { Icon: BadgeCheck, tone: 'cyan' }
  };

  const kpis = [
    { label: 'Total Amount', value: formatAmountConverted(totalAmount, record.currency) },
    { label: 'Status', value: <PurchaseStatusBadge status={record.status} /> },
    { label: 'Vendor', value: record.vendor || '—' },
    { label: 'Department', value: record.department || '—' },
    { label: 'Required Date', value: record.expectedDate ? formatDate(record.expectedDate) : '—' },
    { label: 'Approval', value: <PurchaseStatusBadge status={record.approvalStatus || 'Pending'} /> }
  ];

  const kpiCard = (kpi) => {
    const meta = KPI_ICONS[kpi.label] || { Icon: LayoutDashboard, tone: 'gray' };
    const Icon = meta.Icon;
    return (
      <div key={kpi.label} className="purchase-summary-card prv-kpi-card">
        <span className={`prv-kpi-chip ${meta.tone}`} aria-hidden="true">
          <Icon />
        </span>
        <div className="prv-kpi-body">
          <div
            className="purchase-summary-value prv-kpi-value"
            title={typeof kpi.value === 'string' ? kpi.value : undefined}
          >
            {kpi.value}
          </div>
          <div className="purchase-summary-label prv-kpi-label">{kpi.label}</div>
        </div>
      </div>
    );
  };

  /* Header document actions — single source for the desktop icon bar and
     the mobile three-dot menu. Order: Back · Edit · Duplicate · Print ·
     Download · Delete. */
  const docActions = [
    { key: 'back', Icon: ArrowLeft, label: 'Back to list', tone: 'neutral', run: () => navigate('/purchase/requisition') },
    ...(canEditPr ? [{ key: 'edit', Icon: Pencil, label: 'Edit requisition', tone: 'primary', run: () => navigate(`/purchase/requisition/${record.id}/edit`) }] : []),
    { key: '360', Icon: LayoutDashboard, label: '360° view', tone: 'teal', run: () => navigate(`/purchase/requisition/${record.id}/360`) },
    ...(canCreatePr ? [{ key: 'duplicate', Icon: Copy, label: 'Duplicate requisition', tone: 'indigo', run: () => setConfirmDuplicate(true) }] : []),
    ...(canPrintPr ? [
      { key: 'print', Icon: Printer, label: 'Print preview', tone: 'gray', run: () => navigate(`/purchase/requisition/${record.id}/print`) },
      { key: 'download', Icon: Download, label: 'Download PDF', tone: 'emerald', run: () => navigate(`/purchase/requisition/${record.id}/print`) }
    ] : []),
    ...(canDeletePr ? [{ key: 'delete', Icon: Trash2, label: 'Delete requisition', tone: 'danger', run: () => setConfirmDelete(true) }] : [])
  ];

  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'items', label: 'Items', icon: ListChecks, count: record.items?.length || 0 },
    { key: 'approval', label: 'Approval', icon: CheckCircle2 },
    { key: 'timeline', label: 'Timeline', icon: History },
    { key: 'comments', label: 'Comments', icon: MessageSquare, count: (record.comments || []).length },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: (record.attachments || []).length }
  ];

  return (
    <PurchasePageLayout className="prv-page">
      <div className="prv-sticky-header">
        <PurchaseHeader
          variant="cpr"
          crumb={[
            { label: 'Purchase Requisition', to: '/purchase/requisition' },
            { label: 'View' }
          ]}
          icon={ClipboardList}
          title={
            <span className="flex items-center gap-3">
              {record.prNo}
              <PurchaseStatusBadge status={record.status} />
            </span>
          }
          subtitle="Create, track and approve material and service purchase requests."
          actions={
            <>
              <span className="prv-icon-bar" role="group" aria-label="Document actions">
                {docActions.map(({ key, Icon, label, tone, run }) => (
                  <Fragment key={key}>
                    {iconButton(Icon, label, run, tone)}
                  </Fragment>
                ))}
              </span>
              <div className="prv-more-wrap" ref={moreRef}>
                <button
                  type="button"
                  className={`prv-more-btn ${moreOpen ? 'open' : ''}`}
                  onClick={() => setMoreOpen((prev) => !prev)}
                  aria-label="More actions"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  <MoreHorizontal aria-hidden="true" />
                </button>
                {moreOpen && (
                  <div className="prv-more-menu" role="menu">
                    {docActions.map(({ key, Icon, label, tone, run }) => (
                      <button
                        key={key}
                        type="button"
                        role="menuitem"
                        className={`prv-more-item prv-more-item-${tone}`}
                        onClick={() => {
                          setMoreOpen(false);
                          run();
                        }}
                      >
                        <Icon aria-hidden="true" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {renderWorkflowButtons()}
            </>
          }
        />
      </div>

      {/* Top KPI row — icon chips + single-line values */}
      <div className="purchase-summary-grid">
        {kpis.map((kpi) => kpiCard(kpi))}
      </div>

      {/* Dashboard grid — left tabs (70%) · right sticky summary (30%) */}
      <div className="prv-layout">
        <div className="prv-main">
          <div className="prv-tabs-bar">
            <div className="po-tabs-row">
              <Tabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} />
            </div>
            <button
              type="button"
              className="prv-tabs-link"
              onClick={() => navigate(`/purchase/requisition/${record.id}/activity`)}
            >
              <ListChecks /> Activity Log
            </button>
          </div>

          {activeTab === 'overview' && (
            <div className="prv-panel">
              <PurchaseSectionCard
                title="Requisition Details"
                subtitle={`Requested by ${record.requester || '—'}`}
              >
                <div className="prv-detail-grid">
                  {details.map((item) => (
                    <DetailItem key={item.label} label={item.label} value={item.value} />
                  ))}
                </div>
              </PurchaseSectionCard>

              {(record.approvalNote || record.notes || record.internalNotes) && (
                <PurchaseSectionCard
                  title="Notes"
                  subtitle="Approval note, vendor notes and internal instructions"
                >
                  <div className="space-y-3">
                    {record.approvalNote && (
                      <div className="prv-note">
                        <div className="prv-note-title">Approval Note</div>
                        <p>{record.approvalNote}</p>
                      </div>
                    )}
                    {record.notes && (
                      <div className="prv-note">
                        <div className="prv-note-title">Vendor Notes</div>
                        <p>{record.notes}</p>
                      </div>
                    )}
                    {record.internalNotes && (
                      <div className="prv-note">
                        <div className="prv-note-title">Internal Notes</div>
                        <p>{record.internalNotes}</p>
                      </div>
                    )}
                  </div>
                </PurchaseSectionCard>
              )}

              <PurchaseSectionCard
                title="Attachments"
                subtitle={`${(record.attachments || []).length} supporting document(s)`}
                icon={Paperclip}
              >
                <AttachmentList
                  attachments={record.attachments || []}
                  limit={3}
                  fallbackDate={record.createdAt}
                  onViewAll={() => setActiveTab('attachments')}
                />
              </PurchaseSectionCard>

              <PurchaseSectionCard
                title="Documents"
                subtitle="Linked documents from the repository"
                icon={FileText}
              >
                <SourceDocumentsDrawer
                  sourceId={record.id}
                  stage="Purchase Requisition"
                  label="PR Documents"
                />
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'items' && (
            <div className="prv-panel">
              <PurchaseSectionCard
                title="Line Items"
                subtitle={`${record.items?.length || 0} item(s) with GST`}
                bodyClassName="p-2"
              >
                <div className="prv-items-scroll">
                  <PurchaseItemTable
                    readOnly
                    items={record.items || []}
                    lines={record.totals?.lines || []}
                    currency={record.currency || 'INR'}
                    convert
                  />
                </div>
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'approval' && (
            <div className="prv-panel">
              <PurchaseSectionCard title="Approval Workflow" subtitle="Requisition activity stream">
                <PurchaseApprovalTimeline activity={record.activity || []} />
              </PurchaseSectionCard>

              <PurchaseSectionCard
                title="Technical Review"
                subtitle={review ? `Reviewed by ${review.reviewedBy || '—'}` : 'No technical review recorded yet'}
              >
                {review ? (
                  <dl className="space-y-3">
                    <div>
                      <dt className={LABEL}>Review Status</dt>
                      <dd className="mt-1"><PurchaseStatusBadge status={review.reviewStatus} /></dd>
                    </div>
                    <div>
                      <dt className={LABEL}>Specification</dt>
                      <dd className="mt-1 text-xs font-semibold text-slate-800">{review.specification || '—'}</dd>
                    </div>
                    <div>
                      <dt className={LABEL}>Drawing</dt>
                      <dd className="mt-1 text-xs font-semibold text-slate-800">{review.drawing || '—'}</dd>
                    </div>
                    <div>
                      <dt className={LABEL}>Material Grade</dt>
                      <dd className="mt-1 text-xs font-semibold text-slate-800">{review.materialGrade || '—'}</dd>
                    </div>
                    <div>
                      <dt className={LABEL}>Dimensions</dt>
                      <dd className="mt-1 text-xs font-semibold text-slate-800">{review.dimensions || '—'}</dd>
                    </div>
                    {review.comments && (
                      <div>
                        <dt className={LABEL}>Comments</dt>
                        <dd className="mt-1 text-xs font-semibold text-slate-800">{review.comments}</dd>
                      </div>
                    )}
                  </dl>
                ) : (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Awaiting review in the technical review queue.
                  </p>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="prv-panel">
              <PurchaseSectionCard title="Timeline" subtitle="Chronological record of every action">
                <PurchaseApprovalTimeline activity={record.activity || []} />
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="prv-panel">
              <PurchaseSectionCard
                title="Comments"
                subtitle="Discussion on this requisition"
              >
                <div className="flex items-start gap-2 mb-4">
                  <TextArea
                    rows={2}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Add a comment..."
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={commentBusy || !commentText.trim()}
                    className="po-btn po-btn-primary mt-1"
                  >
                    {commentBusy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <SendHorizonal className="po-btn-icon-ic" />}
                    Post
                  </button>
                </div>
                {(record.comments || []).length > 0 ? (
                  <ul className="prv-chat-list">
                    {(record.comments || []).map((comment) => (
                      <li key={comment.id} className="prv-chat-item">
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
                  <div className="prv-chat-empty">
                    <MessageSquare aria-hidden="true" />
                    <p>No comments yet — start the discussion.</p>
                  </div>
                )}
              </PurchaseSectionCard>
            </div>
          )}

          {activeTab === 'attachments' && (
            <div className="prv-panel">
              <PurchaseSectionCard
                title="Attachments"
                subtitle={`${(record.attachments || []).length} supporting document(s)`}
                icon={Paperclip}
              >
                <AttachmentList
                  attachments={record.attachments || []}
                  fallbackDate={record.createdAt}
                />
              </PurchaseSectionCard>
            </div>
          )}
        </div>

        {/* Sticky right panel — cost summary always visible while scrolling */}
        <aside className="prv-side">
          <PurchaseDocumentSummary
            prNo={record.prNo}
            status={record.status}
            approvalStatus={record.approvalStatus || 'Pending'}
            values={record}
            totals={record.totals || {}}
            currency={record.currency || 'INR'}
            isEdit
            convert
          />
          <PurchaseSummary
            totals={record.totals}
            currency={record.currency || 'INR'}
            igst={igst}
            convert
          />
        </aside>
      </div>

      <ConfirmDialog
        open={confirmSubmit}
        title="Submit for approval?"
        message={`${record.prNo} will move to Pending Approval. You will no longer be able to edit it.`}
        confirmLabel="Submit"
        variant="default"
        icon={Send}
        loading={busy}
        onConfirm={async () => {
          await runWorkflow(() => requisitionService.submitRequisition(id), `${record.prNo} submitted for approval`);
          setConfirmSubmit(false);
        }}
        onCancel={() => setConfirmSubmit(false)}
      />

      <ConfirmDialog
        open={confirmDuplicate}
        title="Duplicate requisition?"
        message={`A new draft will be created from ${record.prNo} with all line items copied.`}
        confirmLabel="Duplicate"
        variant="default"
        icon={Copy}
        loading={busy}
        onConfirm={handleDuplicate}
        onCancel={() => setConfirmDuplicate(false)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Move requisition to trash?"
        message={`${record.prNo} will be removed from the active list and moved to trash. The record is kept and can be restored.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <Modal
        open={decision !== null}
        onClose={() => {
          setDecision(null);
          setNote('');
          setNoteError('');
        }}
        title={decision === 'approve' ? `Approve ${record.prNo}` : `Reject ${record.prNo}`}
        maxWidth="max-w-md"
        footer={
          <>
            <button
              type="button"
              onClick={() => {
                setDecision(null);
                setNote('');
                setNoteError('');
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDecision}
              disabled={busy}
              className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                decision === 'approve'
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white'
                  : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {decision === 'approve' ? 'Approve' : 'Reject'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {decision === 'approve'
              ? 'Confirm that this requisition meets the procurement policy requirements.'
              : 'Provide a reason for rejection. The requester will be able to see it.'}
          </p>
          <TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={decision === 'approve' ? 'Approval note (optional)' : 'Reason for rejection (required)'}
          />
          {noteError && <p className="text-[11px] font-semibold text-rose-500">{noteError}</p>}
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}
