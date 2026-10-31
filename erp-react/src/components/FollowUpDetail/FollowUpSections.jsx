/**
 * FollowUpSections — the Follow-up detail cards, extracted so the quick-view
 * modal (Follow-ups list) and the full-page Follow-up view (/followups/:id)
 * render the SAME sections from the SAME real backend record.
 *
 * The follow-up carries real leadId / clientId foreign keys; the related cards
 * resolve them to the actual records (never just echo the raw ids) and open the
 * existing Lead / Client views through the callers' navigation handlers.
 */
import {
  CalendarClock, Clock, Download, IdCard, Link2, MessageSquare, Paperclip, User
} from 'lucide-react';
import {
  DetailCard,
  DetailField,
  DetailFieldGrid,
  DetailBadge,
  DetailLink,
  DetailEmpty
} from '../DetailPage';
import { useToast } from '../Common';
import customerService from '../../services/customerService';
import leadService from '../../services/leadService';
import useAsyncData from '../../hooks/useAsyncData';
import { formatDate, formatTime, formatDateTime, formatLeadNo } from '../../utils/leadHelpers';
import { notesDisplayText } from '../../utils/leadNotes';
import { downloadFile } from '../../utils/fileAccess';

// eslint-disable-next-line react-refresh/only-export-components
export const FOLLOWUP_STATUS_TONES = {
  Open: 'green',
  Pending: 'green',
  'In Progress': 'green',
  Completed: 'slate',
  Missed: 'rose',
  Cancelled: 'slate',
  Rescheduled: 'amber',
  Archived: 'slate'
};

// eslint-disable-next-line react-refresh/only-export-components
export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Real Lead + Client this follow-up belongs to — resolved through the existing
 * GET /leads/{id} and GET /customers/{id}, using the follow-up's own foreign
 * keys (never stale frontend state).
 */
export function RelatedRecords({ followUp, onOpenLead, onOpenClient }) {
  const leadId = followUp?.leadId;
  const clientId = followUp?.clientId;

  const { data: lead, loading: leadLoading } = useAsyncData(
    () => (leadId != null ? leadService.getLead(leadId) : Promise.resolve(null)),
    { deps: [leadId] }
  );
  const { data: client, loading: clientLoading } = useAsyncData(
    () => (clientId != null ? customerService.get(clientId) : Promise.resolve(null)),
    { deps: [clientId] }
  );

  const leadRecord = lead?.data ?? lead ?? null;
  const clientRecord = client?.data ?? client ?? null;

  if (leadId == null && clientId == null) {
    return (
      <DetailCard icon={Link2} title="Related Records">
        <p className="text-xs font-semibold text-slate-400">
          This follow-up is not linked to a lead or client.
        </p>
      </DetailCard>
    );
  }

  return (
    <DetailCard icon={Link2} title="Related Records">
      <DetailFieldGrid
        fields={[
          {
            label: 'Lead',
            value:
              leadId == null ? '' : leadLoading ? 'Loading…' : (
                <DetailLink onClick={onOpenLead ? () => onOpenLead(leadId) : undefined}>
                  {leadRecord?.leadNo || formatLeadNo(leadId)}
                  {leadRecord?.name || followUp.leadName ? ` · ${leadRecord?.name || followUp.leadName}` : ''}
                </DetailLink>
              )
          },
          {
            label: 'Client',
            value:
              clientId == null ? '' : clientLoading ? 'Loading…' : (
                <DetailLink onClick={onOpenClient ? () => onOpenClient(clientId) : undefined}>
                  {[clientRecord?.clientCode, clientRecord?.businessName || followUp.companyName]
                    .filter(Boolean)
                    .join(' · ')}
                </DetailLink>
              )
          }
        ]}
      />
    </DetailCard>
  );
}

export function FollowUpLeadInfoCard({ f }) {
  return (
    <DetailCard icon={User} title="Lead / Customer Information">
      <DetailFieldGrid
        fields={[
          ['Lead No', f.leadId != null ? formatLeadNo(f.leadId) : ''],
          ['Company', f.companyName],
          ['Contact Person', f.contactPerson],
          ['Phone', f.phone],
          ['Email', f.email],
          ['Lead Stage', f.leadStage],
          ['Source', f.source],
          ['Industry', f.industry],
          ['Executive', f.executive]
        ]}
      />
      <div className="mt-3">
        <DetailField label="Address" value={f.address} />
      </div>
    </DetailCard>
  );
}

export function FollowUpScheduleCard({ f }) {
  return (
    <DetailCard icon={CalendarClock} title="Follow-up Schedule">
      <DetailFieldGrid
        fields={[
          ['Follow-up Date', formatDate(f.followupDate)],
          ['Time', formatTime(f.time)],
          ['Mode', f.mode],
          ['Priority', f.priority],
          ['Current Status', f.currentStatus],
          ['Outcome', f.outcome],
          ['Status', f.status],
          ['Last Follow-up', formatDate(f.lastFollowUpDate)]
        ]}
      />
    </DetailCard>
  );
}

export function FollowUpDiscussionCard({ f }) {
  return (
    <DetailCard icon={MessageSquare} title="Discussion">
      <div className="space-y-3">
        {/* Legacy rows stored a {"__crmMeta":{…}} envelope here: the detail card
            shows the written remark only (DetailField renders '—' when empty). */}
        <DetailField label="Discussion Summary" value={notesDisplayText(f.discussionSummary)} />
        <DetailField label="Customer Feedback" value={f.customerFeedback} />
        <DetailField label="Requirement" value={f.requirement} />
      </div>
    </DetailCard>
  );
}

export function FollowUpNextActionCard({ f }) {
  return (
    <DetailCard icon={Clock} title="Next Action">
      <DetailFieldGrid
        fields={[
          ['Next Follow-up Date', formatDate(f.nextFollowupDate)],
          ['Assign To', f.assignTo],
          ['Reminder', f.reminder],
          ['Reminder Type', f.reminderType]
        ]}
      />
    </DetailCard>
  );
}

export function FollowUpAttachmentsCard({ items }) {
  const toast = useToast();
  const list = Array.isArray(items) ? items : [];
  return (
    <DetailCard icon={Paperclip} title="Attachments" count={list.length}>
      {list.length === 0 ? (
        <DetailEmpty icon={Paperclip} title="No attachments" subtitle="No attachments for this follow-up." />
      ) : (
        <ul className="space-y-2">
          {list.map((file) => (
            <li key={file.id} className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5">
              <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                <Paperclip className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
                <p className="text-[10px] text-slate-400 font-medium">
                  {file.size ? formatBytes(file.size) : ''}
                  {file.size && file.uploadedAt ? ' · ' : ''}
                  {file.uploadedAt ? formatDate(file.uploadedAt) : ''}
                </p>
              </div>
              {file.url && (
                <button
                  type="button"
                  onClick={() =>
                    downloadFile(file.url, file.name).catch((err) => toast.error(err?.message || 'Failed to download file'))
                  }
                  className="p-2 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </DetailCard>
  );
}

export function FollowUpRecordInfoCard({ f }) {
  return (
    <DetailCard icon={IdCard} title="Audit Information">
      <DetailFieldGrid
        fields={[
          ['Created', f.createdAt ? formatDateTime(f.createdAt) : ''],
          ['Last Updated', f.updatedAt ? formatDateTime(f.updatedAt) : ''],
          ['Archived', f.archivedAt ? formatDateTime(f.archivedAt) : '']
        ]}
      />
    </DetailCard>
  );
}

/** Status pill shared by the modal header and the page header. */
export function FollowUpStatusBadge({ status }) {
  return <DetailBadge tone={FOLLOWUP_STATUS_TONES[status] || 'neutral'}>{status || 'Open'}</DetailBadge>;
}

/** Document number convention used across the CRM: FU-<id padded to 6>. */
// eslint-disable-next-line react-refresh/only-export-components
export function followUpNumber(id) {
  return id != null ? `FU-${String(id).padStart(6, '0')}` : '';
}
