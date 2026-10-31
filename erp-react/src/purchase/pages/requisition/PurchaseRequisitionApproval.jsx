/**
 * purchase/pages/requisition/PurchaseRequisitionApproval.jsx
 * ------------------------------------------------------------------
 * Per-requisition approval page — approval workflow UI for a single
 * purchase requisition. Shows status, approval cards (approver,
 * department, role, date, remarks), Approve / Reject / Request
 * Changes actions, approval timeline, history, comments and
 * attachments. Uses the backend-ready mock service methods.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, ChevronLeft, Clock3, Loader2, RotateCcw,
  Send, XCircle, UserCheck, Paperclip
} from 'lucide-react';
import { ConfirmDialog, Modal, TextArea, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import { requisitionService } from '../../services/requisition';
import { canApproveRequisitions } from '../../utils/access';
import { PR_STATUS } from '../../constants';
import { formatDateTime } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

const APPROVER_QUEUE = [
  { name: 'Sanjay Kumar', department: 'Purchase', role: 'Procurement Manager' },
  { name: 'Meera Joshi', department: 'Finance', role: 'Finance Controller' },
  { name: 'Vikram Singh', department: 'Production', role: 'Plant Head' }
];

export default function PurchaseRequisitionApproval() {
  const navigate = useNavigate();
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

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await requisitionService.getById(id);
        if (!cancelled) setRecord(data);
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

  /* Blocks a duplicate decision (double click / double Enter) — the
     action buttons only disable after a re-render. */
  const workflowBusy = useRef(false);

  const runWorkflow = async (operation, successMessage) => {
    if (workflowBusy.current) return;
    workflowBusy.current = true;
    setBusy(true);
    try {
      const updated = await operation();
      /* Re-read the backend response so the status and approval cards
         reflect the decision that was actually saved. */
      setRecord(updated);
      toast.success(successMessage);
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
      workflowBusy.current = false;
    }
  };

  const openDecision = (type) => {
    setNote('');
    setNoteError('');
    setDecision(type);
  };

  const confirmDecision = async () => {
    if (!decision) return;
    const requiresNote = decision === 'reject' || decision === 'return';
    if (requiresNote && !note.trim()) {
      setNoteError(decision === 'reject' ? 'Please provide a reason for rejection' : 'Please provide a reason for returning');
      return;
    }
    setNoteError('');
    const n = note.trim();
    if (decision === 'approve') {
      await runWorkflow(() => requisitionService.approve(id, n), `${record.prNo} approved`);
    } else if (decision === 'reject') {
      await runWorkflow(() => requisitionService.reject(id, n), `${record.prNo} rejected`);
    } else {
      await runWorkflow(() => requisitionService.returnRequisition(id, n), `${record.prNo} returned to requester`);
    }
    setDecision(null);
    setNote('');
  };

  /** Decisions that map onto the approver queue (submit is not a decision). */
  const approverDecisions = (record?.activity || []).filter((entry) =>
    ['approve', 'reject', 'return'].includes(entry.type)
  );

  /** Every submit / approve / reject / return event for the History list. */
  const approvalHistory = (record?.activity || []).filter((entry) =>
    ['approve', 'reject', 'return', 'submit'].includes(entry.type)
  );
  const attachments = Array.isArray(record?.attachments) ? record.attachments : [];

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

  const canSubmit = record.status === PR_STATUS.DRAFT || record.status === PR_STATUS.RETURNED;
  const isPending = record.status === PR_STATUS.PENDING_APPROVAL;
  /* Approve / Reject / Request Changes are approval-queue actions —
     shown only to an authorised PR approver (Admin / permission). The
     service enforces the same rule, so direct calls fail too. */
  const isApprover = canApproveRequisitions();
  const secondaryButton =
    'inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none';

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Requisition', to: '/purchase/requisition' },
          { label: 'Approval' }
        ]}
        icon={UserCheck}
        title={`Approval — ${record.prNo}`}
        subtitle={record.title || 'Purchase requisition approval'}
        actions={
          <>
            <button type="button" onClick={() => navigate(`/purchase/requisition/${record.id}`)} className={secondaryButton}>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to View
            </button>
            {canSubmit && (
              <button
                type="button"
                onClick={() => setConfirmSubmit(true)}
                disabled={busy}
                className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </button>
            )}
            {isPending && isApprover && (
              <>
                <button type="button" onClick={() => openDecision('return')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3.5 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <RotateCcw className="w-4 h-4" /> Request Changes
                </button>
                <button type="button" onClick={() => openDecision('reject')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-surface border border-rose-200 px-3.5 py-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button type="button" onClick={() => openDecision('approve')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 px-3.5 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <PurchaseSectionCard title="Approval Cards" subtitle="Approval chain for this requisition">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {APPROVER_QUEUE.map((approver, index) => {
                const action = approverDecisions[index];
                const decided = !!action;
                const approved = action?.type === 'approve';
                return (
                  <div
                    key={approver.name}
                    className={`rounded-xl border p-4 transition-colors ${
                      decided
                        ? approved
                          ? 'border-emerald-200 bg-emerald-50/50'
                          : 'border-rose-200 bg-rose-50/50'
                        : index === 0
                          ? 'border-[#0B4A3D]/20 bg-[#E8F0EE]/50'
                          : 'border-slate-200 bg-slate-50/40'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`p-1.5 rounded-full ${decided ? (approved ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600') : 'bg-slate-200 text-slate-500'}`}>
                        {decided ? (approved ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />) : <Clock3 className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-xs font-bold text-slate-800">{approver.name}</span>
                    </div>
                    <dl className="space-y-1.5">
                      <div>
                        <dt className={LABEL}>Department</dt>
                        <dd className={`${VALUE} mt-0.5`}>{approver.department}</dd>
                      </div>
                      <div>
                        <dt className={LABEL}>Role</dt>
                        <dd className={`${VALUE} mt-0.5`}>{approver.role}</dd>
                      </div>
                      <div>
                        <dt className={LABEL}>Date</dt>
                        <dd className={`${VALUE} mt-0.5`}>{action ? formatDateTime(action.timestamp) : '—'}</dd>
                      </div>
                      <div>
                        <dt className={LABEL}>Remarks</dt>
                        <dd className={`${VALUE} mt-0.5`}>{action?.note || '—'}</dd>
                      </div>
                    </dl>
                    <div className="mt-2">
                      <PurchaseStatusBadge
                        status={decided ? (approved ? 'Approved' : 'Rejected') : index === 0 && isPending ? 'Pending Approval' : 'Not Started'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Approval History" subtitle="Submitted / approved / rejected / returned events">
            {approvalHistory.length > 0 ? (
              <ul className="divide-y divide-slate-100">
                {approvalHistory.map((entry) => (
                  <li key={entry.id || `${entry.type}-${entry.timestamp}`} className="py-2.5 flex items-start gap-3">
                    <span className="p-1.5 rounded-full bg-slate-100 text-slate-500 mt-0.5">
                      <UserCheck className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-800">{entry.label}</span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap">{formatDateTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">{entry.actor || '—'}</p>
                      {entry.note && <p className="mt-1 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">{entry.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 py-4 text-center">No approval actions recorded yet.</p>
            )}
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Attachments" subtitle="Supporting documents">
            {attachments.length > 0 ? (
              <ul className="space-y-2">
                {attachments.map((attachment) => (
                  <li key={attachment.name || attachment} className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate">{attachment.name || attachment}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="border-2 border-dashed border-slate-200 rounded-lg py-6 text-center text-slate-400">
                <Paperclip className="w-4 h-4 mx-auto mb-1.5" />
                <p className="text-[11px] font-semibold">No attachments yet</p>
              </div>
            )}
          </PurchaseSectionCard>
        </div>

        <div className="space-y-5">
          <PurchaseSectionCard title="Status" subtitle="Current workflow state">
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>PR Status</dt>
                <dd><PurchaseStatusBadge status={record.status} /></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Approval Status</dt>
                <dd><PurchaseStatusBadge status={record.approvalStatus || 'Pending'} /></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Requester</dt>
                <dd className={VALUE}>{record.requester || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Requested On</dt>
                <dd className={VALUE}>{formatDateTime(record.createdAt)}</dd>
              </div>
            </dl>
            {isPending && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-amber-700">
                  {isApprover
                    ? 'Awaiting approval. Use Approve / Reject / Request Changes to act on this requisition.'
                    : 'Awaiting approval from the authorised approver.'}
                </p>
              </div>
            )}
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Approval Timeline" subtitle="Full requisition activity stream">
            <PurchaseApprovalTimeline activity={record.activity || []} />
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Comments" subtitle="Discussion on this requisition">
            {(record.comments || []).length > 0 ? (
              <ul className="space-y-3">
                {(record.comments || []).map((comment) => (
                  <li key={comment.id} className="rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-bold text-slate-700">{comment.author || '—'}</span>
                      <span className="text-[10px] text-slate-400">{formatDateTime(comment.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{comment.text}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400 py-3 text-center">No comments yet.</p>
            )}
          </PurchaseSectionCard>
        </div>
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

      <Modal
        open={decision !== null}
        onClose={() => {
          setDecision(null);
          setNote('');
          setNoteError('');
        }}
        title={
          decision === 'approve' ? `Approve ${record.prNo}`
            : decision === 'reject' ? `Reject ${record.prNo}`
              : `Request Changes — ${record.prNo}`
        }
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
              {decision === 'approve' ? 'Approve' : decision === 'reject' ? 'Reject' : 'Request Changes'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            {decision === 'approve'
              ? 'Confirm that this requisition meets the procurement policy requirements.'
              : decision === 'reject'
                ? 'Provide a reason for rejection. The requester will be able to see it.'
                : 'Provide the changes required. The requester will be able to edit and resubmit.'}
          </p>
          <TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={decision === 'approve' ? 'Approval note (optional)' : 'Reason (required)'}
          />
          {noteError && <p className="text-[11px] font-semibold text-rose-500">{noteError}</p>}
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}
