/**
 * purchase/pages/vendors/VendorApproval.jsx
 * ------------------------------------------------------------------
 * Per-vendor approval page — approval workflow UI for a single vendor.
 * Mirrors the Purchase Requisition Approval master page: status card,
 * approval cards, Approve / Block / Activate actions, approval
 * history, timeline, comments and attachments.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle, CheckCircle2, ChevronLeft, Clock3, Loader2, Paperclip,
  RotateCcw, ShieldCheck, UserCheck, UserX, XCircle
} from 'lucide-react';
import { Modal, TextArea, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import { PurchaseExportDropdown } from '../../components/list';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import PurchaseApprovalTimeline from '../../components/PurchaseApprovalTimeline';
import { vendorService, VENDOR_STATUS } from '../../services/vendor';
import { formatDateTime } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

const APPROVER_QUEUE = [
  { name: 'Sanjay Kumar', department: 'Purchase', role: 'Procurement Manager' },
  { name: 'Meera Joshi', department: 'Finance', role: 'Finance Controller' },
  { name: 'Vikram Singh', department: 'Quality', role: 'Vendor Auditor' }
];

/** Decision modal copy — one entry per workflow decision. */
const DECISION_META = {
  approve: {
    title: 'Approve vendor',
    placeholder: 'Approval note (optional)',
    copy: 'Confirm that this vendor meets the vendor registration and compliance requirements.'
  },
  block: {
    title: 'Block vendor',
    placeholder: 'Reason for blocking (required)',
    copy: 'Provide a reason for blocking. The vendor will be excluded from future sourcing.'
  },
  reject: {
    title: 'Reject vendor',
    placeholder: 'Reason for rejection (required)',
    copy: 'Provide a reason for rejection. The vendor registration will be declined and the vendor moved to Rejected.'
  },
  request: {
    title: 'Request Changes',
    placeholder: 'Describe the changes required (required)',
    copy: 'List the corrections or documents needed before this vendor can be approved.'
  }
};

export default function VendorApproval() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const [record, setRecord] = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [decision, setDecision] = useState(null); // 'approve' | 'block' | 'reject' | 'request'
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const data = await vendorService.getVendor(id);
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

  /* Approval-overview counts across the vendor master (Pending / Approved /
     Rejected / Blocked) — same source as the KPI cards on the list page. */
  useEffect(() => {
    let cancelled = false;
    vendorService
      .getAllVendors()
      .then((all) => {
        if (cancelled) return;
        setOverview({
          pending: all.filter((vendor) => vendor.status === VENDOR_STATUS.PENDING).length,
          approved: all.filter((vendor) => vendor.status === VENDOR_STATUS.APPROVED).length,
          rejected: all.filter((vendor) => vendor.status === VENDOR_STATUS.REJECTED).length,
          blocked: all.filter((vendor) => vendor.status === VENDOR_STATUS.BLOCKED).length
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id]);

  const workflowBusy = useRef(false);

  const runWorkflow = async (operation, successMessage) => {
    if (workflowBusy.current) return;
    workflowBusy.current = true;
    setBusy(true);
    try {
      const updated = await operation();
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
    const requiresNote = decision === 'block' || decision === 'reject' || decision === 'request';
    if (requiresNote && !note.trim()) {
      setNoteError(decision === 'request' ? 'Please describe the changes requested' : 'Please provide a reason');
      return;
    }
    setNoteError('');
    const n = note.trim();
    if (decision === 'approve') {
      await runWorkflow(() => vendorService.setVendorStatus(id, VENDOR_STATUS.APPROVED, n), `${record.name} approved`);
    } else if (decision === 'block') {
      await runWorkflow(() => vendorService.setVendorStatus(id, VENDOR_STATUS.BLOCKED, n), `${record.name} blocked`);
    } else if (decision === 'reject') {
      await runWorkflow(() => vendorService.setVendorStatus(id, VENDOR_STATUS.REJECTED, n), `${record.name} rejected`);
    } else if (decision === 'request') {
      await runWorkflow(() => vendorService.setVendorStatus(id, VENDOR_STATUS.PENDING, n), 'Changes requested');
    }
    setDecision(null);
    setNote('');
  };

  /** Decisions that map onto the approver queue (approve / reject / block). */
  const approverDecisions = (record?.activity || []).filter((entry) =>
    ['approve', 'reject', 'block'].includes(entry.type)
  );

  /** Every status / approve / reject / block event for the History list. */
  const approvalHistory = (record?.activity || []).filter((entry) =>
    ['approve', 'reject', 'block', 'status'].includes(entry.type)
  );

  const handleExport = async (type) => {
    const history = approvalHistory.map((entry) => ({
      vendor: record.name,
      action: entry.label || entry.type,
      actor: entry.actor || '—',
      timestamp: entry.timestamp || '',
      note: entry.note || ''
    }));
    const columns = [
      { key: 'vendor', label: 'Vendor' },
      { key: 'action', label: 'Action' },
      { key: 'actor', label: 'Actor' },
      { key: 'timestamp', label: 'Timestamp' },
      { key: 'note', label: 'Remarks' }
    ];
    try {
      if (type === 'csv') exportCsv(columns, history, `vendor-approval-${record.id}`);
      else if (type === 'excel') await exportExcel(columns, history, `vendor-approval-${record.id}`);
      else if (type === 'pdf') await exportPdf({ title: `Approval — ${record.name}`, columns, records: history, filename: `vendor-approval-${record.id}` });
      else if (type === 'print') printTable(`Approval — ${record.name}`, columns, history);
    } catch (err) {
      toast.error(err?.message || 'Failed to export approval history');
    }
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
          <p className="text-sm font-bold text-slate-700">Vendor not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/vendors')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Vendors
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const isPending = record.status === VENDOR_STATUS.PENDING;
  const isApproved = record.status === VENDOR_STATUS.APPROVED;
  const isBlocked = record.status === VENDOR_STATUS.BLOCKED;
  const secondaryButton =
    'inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none';

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Vendor Management', to: '/purchase/vendors' },
          { label: 'Approval' }
        ]}
        icon={UserCheck}
        title={`Approval — ${record.name}`}
        subtitle={record.category || 'Vendor approval workflow'}
        actions={
          <>
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <button type="button" onClick={() => navigate(`/purchase/vendors/${record.id}`)} className={secondaryButton}>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to View
            </button>
            {isPending && (
              <>
                <button type="button" onClick={() => openDecision('request')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-surface border border-amber-200 px-3.5 py-2.5 rounded-lg hover:bg-amber-50 transition-colors cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <RotateCcw className="w-4 h-4" /> Request Changes
                </button>
                <button type="button" onClick={() => openDecision('reject')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-surface border border-rose-200 px-3.5 py-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button type="button" onClick={() => openDecision('block')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-surface border border-rose-200 px-3.5 py-2.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <XCircle className="w-4 h-4" /> Block
                </button>
                <button type="button" onClick={() => openDecision('approve')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 px-3.5 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                  <CheckCircle2 className="w-4 h-4" /> Approve
                </button>
              </>
            )}
            {isBlocked && (
              <button type="button" onClick={() => openDecision('approve')} disabled={busy} className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 px-3.5 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer select-none disabled:opacity-60 disabled:cursor-not-allowed">
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
            )}
          </>
        }
      />

      {/* ===== APPROVAL OVERVIEW — Pending / Approved / Rejected / Blocked ===== */}
      {overview && (
        <div className="mb-6">
          <PurchaseKpiCards
            variant="cpr"
            gridClass=""
            cards={[
              { key: 'pending', label: 'Pending', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)', value: String(overview.pending) },
              { key: 'approved', label: 'Approved', icon: ShieldCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', value: String(overview.approved) },
              { key: 'rejected', label: 'Rejected', icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)', value: String(overview.rejected) },
              { key: 'blocked', label: 'Blocked', icon: UserX, color: '#dc2626', bg: 'rgba(220,38,38,0.10)', value: String(overview.blocked) }
            ]}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
        <div className="lg:col-span-2 space-y-5">
          <PurchaseSectionCard title="Approval Cards" subtitle="Approval chain for this vendor">
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
                        status={decided ? (approved ? 'Approved' : action?.type === 'reject' ? 'Rejected' : 'Blocked') : index === 0 && isPending ? 'Pending Approval' : 'Not Started'}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Approval History" subtitle="Registered / approved / blocked / activated events">
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
            {(record.attachments || []).length > 0 ? (
              <ul className="space-y-2">
                {record.attachments.map((attachment) => (
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
          <PurchaseSectionCard title="Status" subtitle="Current vendor state">
            <dl className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Vendor Status</dt>
                <dd><PurchaseStatusBadge status={record.status} /></dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Vendor Code</dt>
                <dd className={VALUE}>{record.id}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Category</dt>
                <dd className={VALUE}>{record.category || '—'}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className={LABEL}>Registered On</dt>
                <dd className={VALUE}>{formatDateTime(record.createdAt)}</dd>
              </div>
            </dl>
            {isPending && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 flex items-start gap-2">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-amber-700">
                  Awaiting approval. Use Approve / Block to act on this vendor.
                </p>
              </div>
            )}
            {isApproved && (
              <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 flex items-start gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-emerald-700">
                  Vendor is approved and available for RFQ and purchasing.
                </p>
              </div>
            )}
            {isBlocked && (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 flex items-start gap-2">
                <UserX className="w-3.5 h-3.5 text-rose-500 mt-0.5 shrink-0" />
                <p className="text-[11px] font-semibold text-rose-700">
                  This vendor is blocked and excluded from sourcing. Approve to restore it.
                </p>
              </div>
            )}
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Approval Timeline" subtitle="Full vendor activity stream">
            <PurchaseApprovalTimeline activity={record.activity || []} />
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Comments" subtitle="Discussion on this vendor">
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

      <Modal
        open={decision !== null}
        onClose={() => {
          setDecision(null);
          setNote('');
          setNoteError('');
        }}
        title={decision ? DECISION_META[decision].title : 'Decision'}
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
                  : decision === 'request'
                    ? 'bg-amber-600 hover:bg-amber-700 text-white'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
              }`}
            >
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {decision === 'approve'
                ? 'Approve'
                : decision === 'request'
                  ? 'Request Changes'
                  : decision === 'block'
                    ? 'Block'
                    : 'Reject'}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">{decision ? DECISION_META[decision].copy : ''}</p>
          <TextArea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={decision ? DECISION_META[decision].placeholder : ''}
          />
          {noteError && <p className="text-[11px] font-semibold text-rose-500">{noteError}</p>}
        </div>
      </Modal>
    </PurchasePageLayout>
  );
}
