import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Archive,
  Calendar as CalendarIcon,
  CalendarClock,
  Clock,
  Copy,
  GitBranch,
  IdCard,
  Paperclip,
  Pencil,
  RotateCcw,
  RotateCw,
  Tag,
  Trash2,
  User as UserIcon
} from 'lucide-react';
import { useToast } from '../../components/Common';
import {
  DetailPage,
  DetailBreadcrumb,
  DetailHeader,
  DetailTwoColumn,
  DetailCard,
  DetailRow,
  DetailBadge,
  DetailLoading
} from '../../components/DetailPage';
import {
  RelatedRecords,
  FollowUpLeadInfoCard,
  FollowUpScheduleCard,
  FollowUpDiscussionCard,
  FollowUpNextActionCard,
  FollowUpAttachmentsCard,
  FollowUpRecordInfoCard,
  FollowUpStatusBadge,
  followUpNumber,
  FOLLOWUP_STATUS_TONES
} from '../../components/FollowUpDetail';
import RecordVersionHistory from '../../components/EditHistory/RecordVersionHistory';
import followUpService from '../../services/followUpService';
import { formatDate, formatTime, formatDateTime, formatLeadNo } from '../../utils/leadHelpers';

export default function FollowUpViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [followUp, setFollowUp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await followUpService.get(id);
      setFollowUp(res?.data ?? res ?? null);
    } catch (err) {
      setFollowUp(null);
      setError(err?.message || 'Failed to load follow-up');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Fetch through an async boundary so the state updates are not applied
  // synchronously inside the effect body.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const runAction = async (fn, message) => {
    setBusy(true);
    try {
      await fn();
      toast.success(message);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <DetailPage className="erp-detail-scope">
        <div className="flex items-center justify-center py-24">
          <span className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </DetailPage>
    );
  }

  if (error || !followUp) {
    return (
      <DetailPage className="erp-detail-scope">
        <DetailBreadcrumb items={[{ label: 'Follow-ups', to: '/followups' }, { label: `Follow-up #${id}` }]} />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <CalendarClock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Follow-up Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">
            {error || 'The follow-up you are looking for does not exist.'}
          </p>
          <button
            type="button"
            onClick={() => navigate('/followups')}
            className="erp-detail-action erp-detail-action--primary"
          >
            Back to Follow-ups
          </button>
        </div>
      </DetailPage>
    );
  }

  const f = followUp;
  const status = f.status || 'Open';
  const isArchived = String(status).toLowerCase() === 'archived';
  const documentNo = followUpNumber(f.id);
  const displayName = f.companyName || f.leadName || 'Follow-up';

  const headerActions = [
    { key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(`/followups/${id}/edit`) },
    {
      key: 'duplicate',
      label: 'Duplicate',
      icon: Copy,
      style: 'ghost',
      action: () => runAction(() => followUpService.duplicate(id), 'Follow-up duplicated')
    },
    isArchived
      ? {
          key: 'restore',
          label: 'Restore',
          icon: RotateCcw,
          style: 'ghost',
          action: () => runAction(() => followUpService.restore(id), 'Follow-up restored')
        }
      : {
          key: 'archive',
          label: 'Archive',
          icon: Archive,
          style: 'ghost',
          action: () => runAction(() => followUpService.archive(id), 'Follow-up archived')
        },
    { key: 'refresh', label: 'Refresh', icon: RotateCw, style: 'ghost', action: load },
    {
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      style: 'danger',
      action: () => runAction(() => followUpService.delete(id), 'Follow-up moved to trash')
    }
  ];

  const attachments = Array.isArray(f.attachments) ? f.attachments : [];

  const tabs = [
    { key: 'overview', label: 'Overview', icon: IdCard },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: attachments.length },
    { key: 'version-history', label: 'Version History', icon: GitBranch }
  ];

  return (
    <DetailPage className="erp-detail-scope">
      <DetailBreadcrumb
        items={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Sales', to: '/crm' },
          { label: 'Follow-ups', to: '/followups' },
          { label: documentNo }
        ]}
      />

      <DetailHeader
        initial={documentNo}
        title={documentNo}
        titleSuffix={displayName !== 'Follow-up' ? `· ${displayName}` : null}
        onBack={() => navigate('/followups')}
        backLabel="Back"
        busy={busy}
        actions={headerActions}
        chips={[
          <span key="no" className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Tag className="w-3 h-3 text-[#0B4A3D]" /> {documentNo}
          </span>,
          <FollowUpStatusBadge key="status" status={status} />,
          f.mode ? <DetailBadge key="mode" tone="neutral">{f.mode}</DetailBadge> : null,
          f.priority ? <DetailBadge key="pri" tone="amber">{f.priority}</DetailBadge> : null,
          f.currentStatus ? <DetailBadge key="cur" tone="blue">{f.currentStatus}</DetailBadge> : null
        ]}
        meta={[
          f.followupDate ? (
            <span key="date" className="inline-flex items-center gap-1">
              <CalendarIcon className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(f.followupDate)}
              {f.time ? ` · ${formatTime(f.time)}` : ''}
            </span>
          ) : null,
          f.leadId != null ? (
            <span key="lead" className="inline-flex items-center gap-1">
              <Tag className="w-3 h-3 text-[#0B4A3D]" /> {formatLeadNo(f.leadId)}
            </span>
          ) : null,
          f.assignTo ? (
            <span key="assign" className="inline-flex items-center gap-1">
              <UserIcon className="w-3 h-3 text-[#0B4A3D]" /> {f.assignTo}
            </span>
          ) : null,
          f.contactPerson || f.phone || f.email ? (
            <span key="contact">{[f.contactPerson, f.phone, f.email].filter(Boolean).join(' · ')}</span>
          ) : null
        ]}
        tabs={tabs}
        activeTab={tab}
        onTabChange={setTab}
      />

      {tab === 'overview' && (
        <DetailTwoColumn
          rail={
            <>
              <DetailCard icon={CalendarClock} title="Follow-up Summary">
                <DetailRow label="Document No">{documentNo}</DetailRow>
                <DetailRow label="Status">
                  <DetailBadge tone={FOLLOWUP_STATUS_TONES[status] || 'neutral'}>{status}</DetailBadge>
                </DetailRow>
                <DetailRow label="Mode">{f.mode || '—'}</DetailRow>
                <DetailRow label="Priority">{f.priority || '—'}</DetailRow>
                <DetailRow label="Follow-up Date">{f.followupDate ? formatDate(f.followupDate) : '—'}</DetailRow>
                <DetailRow label="Next Follow-up">
                  {f.nextFollowupDate ? formatDate(f.nextFollowupDate) : '—'}
                </DetailRow>
                <DetailRow label="Assigned To">{f.assignTo || '—'}</DetailRow>
                <DetailRow label="Executive">{f.executive || '—'}</DetailRow>
                <DetailRow label="Outcome">{f.outcome || '—'}</DetailRow>
              </DetailCard>

              <RelatedRecords
                followUp={f}
                onOpenLead={(leadId) => navigate(`/leads/${leadId}`)}
                onOpenClient={(clientId) => navigate(`/clients/${clientId}`)}
              />

              <DetailCard icon={Clock} title="Record Information">
                <DetailRow label="Created">
                  {f.createdAt ? formatDateTime(f.createdAt) : '—'}
                </DetailRow>
                <DetailRow label="Last Updated">
                  {f.updatedAt ? formatDateTime(f.updatedAt) : '—'}
                </DetailRow>
                <DetailRow label="Last Follow-up">
                  {f.lastFollowUpDate ? formatDate(f.lastFollowUpDate) : '—'}
                </DetailRow>
              </DetailCard>
            </>
          }
        >
          <FollowUpLeadInfoCard f={f} />
          <FollowUpScheduleCard f={f} />
          <FollowUpDiscussionCard f={f} />
          <FollowUpNextActionCard f={f} />
          <FollowUpAttachmentsCard items={attachments} />
          <FollowUpRecordInfoCard f={f} />
        </DetailTwoColumn>
      )}

      {tab === 'attachments' && (
        <div className="mt-4">
          <DetailCard icon={Paperclip} title="Attachments" count={`${attachments.length} files`}>
            <FollowUpAttachmentsCard items={attachments} />
          </DetailCard>
        </div>
      )}

      {tab === 'version-history' && (
        <div className="mt-4">
          <DetailCard icon={GitBranch} title="Version History">
            <RecordVersionHistory
              module="follow-up"
              recordId={id}
              record={f}
              docNumber={documentNo}
              status={status}
            />
          </DetailCard>
        </div>
      )}

      {busy && (
        <div className="fixed bottom-4 right-4 z-30 bg-surface border border-slate-200 rounded-xl shadow-sm px-3 py-2">
          <DetailLoading label="Working…" />
        </div>
      )}
    </DetailPage>
  );
}
