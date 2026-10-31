import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  Archive,
  Building2,
  Calendar,
  ClipboardList,
  Copy,
  FileText,
  GitBranch,
  History as HistoryIcon,
  IdCard,
  Paperclip,
  Pencil,
  PhoneCall,
  RotateCcw,
  RotateCw,
  StickyNote,
  Tag,
  TrendingUp,
  User as UserIcon,
  Users,
  XCircle
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/Common';
import {
  DetailPage,
  DetailBreadcrumb,
  DetailHeader,
  DetailTwoColumn,
  DetailCard,
  DetailRow,
  DetailEmpty,
  DetailLoading,
  DetailBadge,
  DetailLink
} from '../../components/DetailPage';
import {
  LeadBusinessCard,
  LeadInfoCard,
  LeadPrimaryContactCard,
  LeadSecondaryContactCard,
  LeadAddressCard,
  LeadOtherInfoCard,
  LeadStageBadge,
  Timeline,
  Activities,
  Notes,
  Attachments,
  History
} from '../../components/LeadDetail';
import RecordVersionHistory from '../../components/EditHistory/RecordVersionHistory';
import leadService from '../../services/leadService';
import followUpService from '../../services/followUpService';
import customerService from '../../services/customerService';
import cprService from '../../services/cprService';
import {
  normalizeLead,
  formatINR,
  formatDate,
  formatDateTime,
  formatLeadNo
} from '../../utils/leadHelpers';
import { exportPDFDetailed } from '../../utils/exportUtils';
import { LEAD_EXPORT_COLUMNS } from './Leads';

const priorityTone = (priority) => {
  const p = String(priority || '').toLowerCase();
  if (p === 'high' || p === 'urgent' || p === 'critical') return 'rose';
  if (p === 'low') return 'slate';
  return 'blue';
};

const statusTone = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'archived') return 'slate';
  if (s === 'inactive') return 'amber';
  if (s === 'converted') return 'green';
  return 'green';
};

/** Small timeline preview used on the Overview tab (real backend events only). */
function EventPreview({ items, emptyMessage, onSeeAll, total }) {
  if (!items.length) {
    return <DetailEmpty icon={HistoryIcon} title="Nothing yet" subtitle={emptyMessage} />;
  }
  return (
    <>
      <ol className="relative border-l-2 border-slate-100 ml-1.5 space-y-4">
        {items.map((item, index) => (
          <li key={item.id ?? index} className="pl-5 relative">
            <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full ring-4 ring-white bg-emerald-500" />
            <div className="flex flex-wrap items-center justify-between gap-1">
              <p className="text-xs font-bold text-slate-800">{item.title}</p>
              <time className="text-[10px] text-slate-400 font-medium">{formatDateTime(item.at)}</time>
            </div>
            {item.detail && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.detail}</p>}
          </li>
        ))}
      </ol>
      {total > items.length && onSeeAll && (
        <div className="text-center pt-3">
          <button
            type="button"
            onClick={onSeeAll}
            className="text-xs font-semibold text-slate-400 hover:text-[#0B4A3D] cursor-pointer"
          >
            View all {total} events
          </button>
        </div>
      )}
    </>
  );
}

export default function LeadViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  // Close Lead confirmation — nothing is written until the user confirms.
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const [history, setHistory] = useState([]);
  const [linkedClient, setLinkedClient] = useState(null);
  const [cprs, setCprs] = useState([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await leadService.getLead(id);
      setLead(normalizeLead(res?.data ?? res));
    } catch (err) {
      setLead(null);
      setError(err?.message || 'Failed to load lead');
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

  // Related records — all from real backend relationships:
  //   · follow-ups  → GET /followups/history?leadId=..
  //   · client      → the clientId carried by this lead's own follow-ups
  //   · CPRs        → CPRs whose sourceLead/leadNo points at this lead
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await followUpService.history(id, null);
        const rows = Array.isArray(res) ? res : res?.data ?? res?.content ?? [];
        const list = Array.isArray(rows) ? rows : [];
        if (cancelled) return;
        setHistory(list);
        const clientId = list.map((f) => f.clientId).find((v) => v != null);
        if (clientId != null) {
          try {
            const cRes = await customerService.get(clientId);
            if (!cancelled) setLinkedClient(cRes?.data ?? cRes ?? null);
          } catch {
            /* the linked client is best-effort */
          }
        }
      } catch {
        /* related records are best-effort; the page never blocks on them */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!lead) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await cprService.listAllCprs();
        const rows = Array.isArray(res) ? res : res?.data?.content ?? res?.content ?? res?.data ?? [];
        if (cancelled) return;
        const key = lead.leadNo || formatLeadNo(lead.id);
        setCprs(
          (Array.isArray(rows) ? rows : []).filter(
            (c) =>
              String(c.leadNo || '') === String(key) ||
              String(c.sourceLead || '') === String(key) ||
              String(c.sourceLead || '') === String(lead.id)
          )
        );
      } catch {
        /* CPR linkage is best-effort */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lead]);

  const timelineEvents = useMemo(() => {
    const src = Array.isArray(lead?.timeline) ? lead.timeline : [];
    return [...src].sort((a, b) => new Date(b.at || b.createdAt || 0) - new Date(a.at || a.createdAt || 0));
  }, [lead]);

  const activityEvents = useMemo(() => {
    const src = Array.isArray(lead?.activities) ? lead.activities : [];
    return [...src].sort((a, b) => new Date(b.at || b.createdAt || 0) - new Date(a.at || a.createdAt || 0));
  }, [lead]);

  const runAction = async (fn, successMessage) => {
    setBusy(true);
    try {
      await fn();
      toast.success(successMessage);
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

  if (error || !lead) {
    return (
      <DetailPage className="erp-detail-scope">
        <DetailBreadcrumb items={[{ label: 'Leads', to: '/leads' }, { label: `Lead #${id}` }]} />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <IdCard className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Lead Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">{error || 'The lead you are looking for does not exist.'}</p>
          <button
            type="button"
            onClick={() => navigate('/leads')}
            className="erp-detail-action erp-detail-action--primary"
          >
            Back to Leads
          </button>
        </div>
      </DetailPage>
    );
  }

  const status = String(lead.status || 'Active');
  const isArchived = status.toLowerCase() === 'archived';
  // A closed lead is persisted as the lead's INACTIVE status (the stored state
  // that is no longer active) and is presented as "Closed" throughout CRM.
  const isClosed = status.toLowerCase() === 'inactive';
  const statusLabel = isClosed ? 'Closed' : status;
  const displayName = lead.businessName || lead.company || lead.name || `Lead #${id}`;
  const followUps = history || [];

  const closeLead = async () => {
    if (closing) return; // a second click can never fire a second request
    setClosing(true);
    try {
      const res = await leadService.closeLead(id);
      const closed = res?.data ?? res;
      toast.success(
        closed?.status ? `Lead ${String(closed.status).toLowerCase()} successfully` : 'Lead closed successfully'
      );
      setCloseOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.message || 'Failed to close this lead');
    } finally {
      setClosing(false);
    }
  };

  // Actions that start new active work are impossible on a closed lead: the
  // backend refuses them, so the UI does not offer them either. Read-only
  // actions (PDF, timeline, notes, attachments, version history, history) stay.
  const headerActions = [
    ...(isClosed ? [] : [
    { key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(`/leads/${id}/edit`) },
    {
      key: 'followup',
      label: 'Add Follow-up',
      icon: PhoneCall,
      style: 'primary',
      action: async () => {
        try {
          const res = await leadService.createFollowUp(id);
          const { created, followUp } = res?.data ?? {};
          if (followUp?.id) {
            toast.success(created ? 'Follow-up created' : 'A follow-up already exists for this lead');
            navigate(`/followups/${followUp.id}`);
          } else {
            toast.error('Failed to create follow-up');
          }
        } catch (err) {
          toast.error(err?.message || 'Failed to create follow-up');
        }
      }
    },
    {
      key: 'cpr',
      label: 'Create CPR',
      icon: ClipboardList,
      style: 'ghost',
      action: () => navigate(`/cprs/new?leadId=${id}`)
    },
    {
      key: 'quotation',
      label: 'Create Quotation',
      icon: FileText,
      style: 'ghost',
      action: () =>
        navigate(`/quotations/new?leadId=${id}&customer=${encodeURIComponent(displayName)}`)
    }
    ]),
    {
      key: 'pdf',
      label: 'Generate PDF',
      icon: FileText,
      style: 'ghost',
      action: () => exportPDFDetailed([lead], LEAD_EXPORT_COLUMNS, `lead-${lead.id}`)
    },
    {
      key: 'duplicate',
      label: 'Duplicate',
      icon: Copy,
      style: 'ghost',
      action: () => runAction(() => leadService.duplicateLead(id), 'Lead duplicated')
    },
    isArchived
      ? {
          key: 'restore',
          label: 'Restore',
          icon: RotateCcw,
          style: 'ghost',
          action: () => runAction(() => leadService.restoreLead(id), 'Lead restored')
        }
      : {
          key: 'archive',
          label: 'Archive',
          icon: Archive,
          style: 'ghost',
          action: () => runAction(() => leadService.archiveLead(id), 'Lead archived')
        },
    // Close Lead: offered only while the lead is still active (an archived or
    // trashed lead must be restored first; a closed lead is not closed twice).
    ...(isClosed || isArchived || status.toLowerCase() === 'deleted'
      ? []
      : [{
          key: 'close',
          label: 'Close Lead',
          icon: XCircle,
          style: 'ghost',
          action: () => setCloseOpen(true)
        }]),
    {
      key: 'refresh',
      label: 'Refresh',
      icon: RotateCw,
      style: 'ghost',
      action: load
    }
  ];

  const tabs = [
    { key: 'overview', label: 'Overview', icon: IdCard },
    { key: 'timeline', label: 'Timeline', icon: HistoryIcon, count: timelineEvents.length },
    { key: 'activities', label: 'Activity Log', icon: ActivityIcon, count: activityEvents.length },
    { key: 'notes', label: 'Notes', icon: StickyNote, count: lead.notes.length },
    { key: 'attachments', label: 'Attachments', icon: Paperclip, count: lead.attachments.length },
    { key: 'version-history', label: 'Version History', icon: GitBranch },
    { key: 'history', label: 'History', icon: HistoryIcon }
  ];

  return (
    <DetailPage className="erp-detail-scope">
      <DetailBreadcrumb
        items={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Sales', to: '/crm' },
          { label: 'Leads', to: '/leads' },
          { label: lead.leadNo || formatLeadNo(lead.id) }
        ]}
      />

      <DetailHeader
        initial={displayName}
        title={displayName}
        titleSuffix={`(${lead.leadNo || formatLeadNo(lead.id)})`}
        onBack={() => navigate('/leads')}
        backLabel="Back"
        busy={busy}
        actions={headerActions}
        chips={[
          <span key="no" className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Tag className="w-3 h-3 text-[#0B4A3D]" /> {lead.leadNo || formatLeadNo(lead.id)}
          </span>,
          <LeadStageBadge key="stage" stage={lead.stage} />,
          <DetailBadge key="status" tone={statusTone(status)}>{statusLabel}</DetailBadge>,
          lead.priority ? <DetailBadge key="priority" tone={priorityTone(lead.priority)}>{lead.priority} priority</DetailBadge> : null,
          lead.source ? <DetailBadge key="source" tone="neutral">{lead.source}</DetailBadge> : null,
          lead.industry ? <DetailBadge key="industry" tone="neutral">{lead.industry}</DetailBadge> : null
        ]}
        meta={[
          <span key="date" className="inline-flex items-center gap-1">
            <Calendar className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(lead.date)}
          </span>,
          lead.owner ? (
            <span key="owner" className="inline-flex items-center gap-1">
              <UserIcon className="w-3 h-3 text-[#0B4A3D]" /> {lead.owner}
            </span>
          ) : null,
          lead.company && lead.company !== displayName ? (
            <span key="company" className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3 text-[#0B4A3D]" /> {lead.company}
            </span>
          ) : null,
          lead.phone || lead.email ? (
            <span key="contact">{[lead.phone, lead.email].filter(Boolean).join(' · ')}</span>
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
              <DetailCard icon={TrendingUp} title="Lead Summary">
                <DetailRow label="Expected Value">
                  <span className="text-sm font-bold text-[#0B4A3D]">{formatINR(lead.value)}</span>
                </DetailRow>
                <DetailRow label="Pipeline Stage">{lead.stage || '—'}</DetailRow>
                <DetailRow label="Status">{statusLabel}</DetailRow>
                <DetailRow label="Priority">{lead.priority || '—'}</DetailRow>
                <DetailRow label="Lead Source">{lead.source || '—'}</DetailRow>
                <DetailRow label="Lead Owner">{lead.owner || '—'}</DetailRow>
                <DetailRow label="Registered">{lead.date ? formatDate(lead.date) : '—'}</DetailRow>
                <DetailRow label="Last Updated">
                  {lead.updatedAt ? formatDateTime(lead.updatedAt) : '—'}
                </DetailRow>
              </DetailCard>

              <DetailCard icon={PhoneCall} title="Follow-ups" count={followUps.length || null}>
                {followUps.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400">No follow-ups recorded for this lead.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {followUps.slice(0, 5).map((f) => (
                      <div key={f.id} className="border border-slate-100 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <DetailLink onClick={() => navigate(`/followups/${f.id}`)}>
                            <span className="text-xs font-bold">FU-{String(f.id).padStart(6, '0')}</span>
                          </DetailLink>
                          <DetailBadge tone={String(f.status).toLowerCase() === 'open' ? 'green' : 'slate'}>
                            {f.status || 'Open'}
                          </DetailBadge>
                        </div>
                        <p className="text-[10px] text-slate-400 font-medium mt-1">
                          {formatDate(f.followupDate)}
                          {f.nextFollowupDate ? ` · next ${formatDate(f.nextFollowupDate)}` : ''}
                        </p>
                      </div>
                    ))}
                    {followUps.length > 5 && (
                      <button
                        type="button"
                        onClick={() => navigate('/followups')}
                        className="text-[11px] font-semibold text-slate-400 hover:text-[#0B4A3D] cursor-pointer text-left"
                      >
                        +{followUps.length - 5} more
                      </button>
                    )}
                  </div>
                )}
              </DetailCard>

              <DetailCard icon={Users} title="Linked Records">
                <DetailRow label="Client">
                  {linkedClient ? (
                    <DetailLink onClick={() => navigate(`/clients/${linkedClient.id}`)}>
                      {[linkedClient.clientCode, linkedClient.businessName].filter(Boolean).join(' · ')}
                    </DetailLink>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow label="CPRs" >
                  {cprs.length === 0 ? (
                    '—'
                  ) : (
                    <span className="flex flex-col gap-1">
                      {cprs.slice(0, 4).map((c) => (
                        <DetailLink key={c.id} onClick={() => navigate(`/cprs/${c.id}`)}>
                          {c.prNo}
                        </DetailLink>
                      ))}
                    </span>
                  )}
                </DetailRow>
                <DetailRow label="Follow-ups">{followUps.length}</DetailRow>
              </DetailCard>
            </>
          }
        >
          <LeadBusinessCard lead={lead} />
          <LeadInfoCard lead={lead} />
          <LeadPrimaryContactCard lead={lead} />
          <LeadSecondaryContactCard lead={lead} />
          <LeadAddressCard lead={lead} />
          <LeadOtherInfoCard lead={lead} />

          <DetailCard icon={HistoryIcon} title="Timeline" count={`${timelineEvents.length} events`}>
            <EventPreview
              items={timelineEvents.slice(0, 5).map((t) => ({
                id: t.id,
                title: t.title || 'Event',
                detail: t.description || t.detail,
                at: t.at || t.createdAt
              }))}
              total={timelineEvents.length}
              emptyMessage="No timeline events recorded for this lead."
              onSeeAll={() => setTab('timeline')}
            />
          </DetailCard>

          <DetailCard icon={ActivityIcon} title="Activity Log">
            {activityEvents.length === 0 ? (
              <DetailEmpty icon={ActivityIcon} title="Nothing yet" subtitle="No activities logged for this lead." />
            ) : (
              <div className="flex flex-col gap-3">
                {activityEvents.slice(0, 5).map((a, i) => (
                  <div key={a.id ?? i} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-slate-700">{a.title || a.label || 'Activity'}</div>
                      {a.description && <div className="text-[11px] text-slate-500 mt-0.5">{a.description}</div>}
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium shrink-0">
                      {formatDateTime(a.at || a.createdAt)}
                    </span>
                  </div>
                ))}
                {activityEvents.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setTab('activities')}
                    className="text-[11px] font-semibold text-slate-400 hover:text-[#0B4A3D] cursor-pointer text-left"
                  >
                    View all {activityEvents.length} events
                  </button>
                )}
              </div>
            )}
          </DetailCard>
        </DetailTwoColumn>
      )}

      {tab === 'timeline' && (
        <div className="mt-4">
          <DetailCard icon={HistoryIcon} title="Full Timeline" count={`${timelineEvents.length} events`}>
            <Timeline leadId={id} fallbackData={lead.timeline} />
          </DetailCard>
        </div>
      )}

      {tab === 'activities' && (
        <div className="mt-4">
          <DetailCard icon={ActivityIcon} title="Activity Log" count={`${activityEvents.length} records`}>
            <Activities leadId={id} fallbackData={lead.activities} />
          </DetailCard>
        </div>
      )}

      {tab === 'notes' && (
        <div className="mt-4">
          <DetailCard icon={StickyNote} title="Notes" count={`${lead.notes.length} records`}>
            <Notes leadId={id} fallbackData={lead.notes} />
          </DetailCard>
        </div>
      )}

      {tab === 'attachments' && (
        <div className="mt-4">
          <DetailCard icon={Paperclip} title="Attachments" count={`${lead.attachments.length} files`}>
            <Attachments leadId={id} fallbackData={lead.attachments} />
          </DetailCard>
        </div>
      )}

      {tab === 'version-history' && (
        <div className="mt-4">
          <DetailCard icon={GitBranch} title="Version History">
            <RecordVersionHistory
              module="lead"
              recordId={id}
              record={lead}
              docNumber={lead.leadNo || formatLeadNo(lead.id)}
              status={lead.status}
            />
          </DetailCard>
        </div>
      )}

      {tab === 'history' && (
        <div className="mt-4">
          <DetailCard icon={HistoryIcon} title="History">
            <History leadId={id} fallbackData={lead.history} />
          </DetailCard>
        </div>
      )}

      {busy && (
        <div className="fixed bottom-4 right-4 z-30">
          <DetailLoading label="Working…" />
        </div>
      )}

      <ConfirmDialog
        open={closeOpen}
        title="Close this lead?"
        message={`${displayName} will be closed and removed from the active lead pipeline.\n\nA closed lead keeps its number, history, follow-ups and linked documents, but it can no longer be edited and no new follow-up, CPR or quotation can be created for it.`}
        confirmLabel="Close Lead"
        variant="warning"
        icon={XCircle}
        loading={closing}
        onConfirm={closeLead}
        onCancel={() => setCloseOpen(false)}
      />
    </DetailPage>
  );
}
