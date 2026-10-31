import { Loader2 } from 'lucide-react';
import { Modal } from '../Common';
import followUpService from '../../services/followUpService';
import useAsyncData from '../../hooks/useAsyncData';
import { formatLeadNo } from '../../utils/leadHelpers';
import {
  RelatedRecords,
  FollowUpLeadInfoCard,
  FollowUpScheduleCard,
  FollowUpDiscussionCard,
  FollowUpNextActionCard,
  FollowUpAttachmentsCard,
  FollowUpRecordInfoCard,
  FollowUpStatusBadge,
  followUpNumber
} from './FollowUpSections';

export default function FollowUpViewModal({ open, followUpId, onClose, onOpenLead, onOpenClient }) {
  const { data, loading } = useAsyncData(
    () => (open && followUpId != null ? followUpService.get(followUpId) : Promise.resolve(null)),
    { deps: [open, followUpId] }
  );
  // GET /followups/{id} answers inside the ApiResponse envelope
  // ({success, message, data}) — unwrap it before reading the fields.
  const f = data && typeof data === 'object' && !Array.isArray(data) ? data.data ?? data : null;
  const displayName = f?.companyName || f?.leadName || 'Follow-up';
  const status = f?.status || 'Open';
  const followUpNo = followUpNumber(followUpId);

  return (
    <Modal open={open} onClose={onClose} title="Follow-up Details" maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm border border-indigo-200 shrink-0">
            {(displayName || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">
              {followUpNo}
              {displayName ? <span className="text-slate-400 font-semibold"> · {displayName}</span> : null}
            </div>
            <div className="text-[11px] text-slate-400 font-medium truncate">
              {[
                f?.leadId != null ? formatLeadNo(f.leadId) : '',
                f?.contactPerson,
                f?.phone,
                f?.email
              ].filter(Boolean).join(' · ') || '—'}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <FollowUpStatusBadge status={status} />
            {f?.mode && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200">
                {f.mode}
              </span>
            )}
            {f?.priority && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200">
                {f.priority}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-8 text-center text-xs font-semibold text-slate-400">
            <Loader2 className="w-4 h-4 animate-spin mx-auto mb-2" /> Loading follow-up…
          </div>
        ) : !f ? (
          <p className="py-8 text-center text-xs font-semibold text-slate-400">Could not load this follow-up.</p>
        ) : (
          <>
            <RelatedRecords followUp={f} onOpenLead={onOpenLead} onOpenClient={onOpenClient} />
            <FollowUpLeadInfoCard f={f} />
            <FollowUpScheduleCard f={f} />
            <FollowUpDiscussionCard f={f} />
            <FollowUpNextActionCard f={f} />
            <FollowUpAttachmentsCard items={f.attachments} />
            <FollowUpRecordInfoCard f={f} />
          </>
        )}
      </div>
    </Modal>
  );
}
