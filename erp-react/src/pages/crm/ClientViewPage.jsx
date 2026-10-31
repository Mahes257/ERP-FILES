import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  Archive,
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  FolderOpen,
  GitBranch,
  Clock,
  IdCard,
  IndianRupee,
  Pencil,
  PhoneCall,
  Receipt,
  RotateCcw,
  RotateCw,
  Tag,
  Users,
  FileText,
  FileSignature
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
  DetailLink,
  DetailEmpty,
  DetailLoading
} from '../../components/DetailPage';
import {
  ClientDetailsTab,
  ClientTimelineTab,
  ClientDocumentsTab,
  ClientStatementTab,
  ClientActivitiesTab,
  ClientVersionHistoryTab
} from '../../components/ClientDetail';
import customerService from '../../services/customerService';
import followUpService from '../../services/followUpService';
import cprService from '../../services/cprService';
import quotationService from '../../services/quotationService';
import salesContractService from '../../services/salesContractService';
import invoiceService from '../../services/invoiceService';
import { formatINR, formatDate, formatDateTime } from '../../utils/leadHelpers';

/** Tolerant list unwrap for the various ApiResponse / page envelopes. */
function parseList(res) {
  if (Array.isArray(res)) return res;
  if (res?.content) return res.content;
  if (res?.data?.content) return res.data.content;
  if (res?.data?.rows) return res.data.rows;
  if (Array.isArray(res?.data)) return res.data;
  return [];
}

const statusTone = (status) => {
  const s = String(status || '').toLowerCase();
  if (s === 'archived') return 'slate';
  if (s === 'inactive' || s === 'blocked') return 'amber';
  if (s === 'lead' || s === 'prospect') return 'blue';
  return 'green';
};

export default function ClientViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [busy, setBusy] = useState(false);
  const [related, setRelated] = useState({ followUps: [], cprs: [], quotations: [], contracts: [], invoices: [] });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await customerService.get(id);
      setCustomer(res?.data ?? res ?? null);
    } catch (err) {
      setCustomer(null);
      setError(err?.message || 'Failed to load client');
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

  // Related records — every row comes from a real backend relationship on the
  // child record's own clientId (the same field the Sales modules persist).
  useEffect(() => {
    if (!id) return undefined;
    let cancelled = false;
    (async () => {
      const clientId = Number(id);
      const [fu, cpr, qtn, sc, inv] = await Promise.allSettled([
        followUpService.history(null, id),
        cprService.listAllCprs(),
        quotationService.list({ page: 0, size: 200 }),
        salesContractService.list({ page: 0, size: 200 }),
        invoiceService.list({ page: 0, size: 200 })
      ]);
      if (cancelled) return;
      const byClient = (rows) => rows.filter((r) => Number(r.clientId) === clientId);
      setRelated({
        followUps: fu.status === 'fulfilled' ? parseList(fu.value) : [],
        cprs: cpr.status === 'fulfilled' ? byClient(parseList(cpr.value)) : [],
        quotations: qtn.status === 'fulfilled' ? byClient(parseList(qtn.value)) : [],
        contracts: sc.status === 'fulfilled' ? byClient(parseList(sc.value)) : [],
        invoices: inv.status === 'fulfilled' ? byClient(parseList(inv.value)) : []
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

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

  if (error || !customer) {
    return (
      <DetailPage className="erp-detail-scope">
        <DetailBreadcrumb items={[{ label: 'Clients', to: '/clients' }, { label: `Client #${id}` }]} />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Client Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">{error || 'The client you are looking for does not exist.'}</p>
          <button
            type="button"
            onClick={() => navigate('/clients')}
            className="erp-detail-action erp-detail-action--primary"
          >
            Back to Clients
          </button>
        </div>
      </DetailPage>
    );
  }

  const status = customer.status || 'Active';
  const isArchived = String(status).toLowerCase() === 'archived';
  const displayName = customer.businessName || customer.alias || customer.contactPerson || `Client #${id}`;
  const code = customer.clientCode || `CLI-${String(id).padStart(6, '0')}`;
  const outstanding = Number(customer.openingBalance) || 0;

  const headerActions = [
    { key: 'edit', label: 'Edit', icon: Pencil, style: 'secondary', action: () => navigate(`/clients/${id}/edit`) },
    {
      key: 'followup',
      label: 'Add Follow-up',
      icon: PhoneCall,
      style: 'primary',
      action: () =>
        navigate(`/followups/new?clientId=${id}&customer=${encodeURIComponent(displayName)}`)
    },
    { key: 'cpr', label: 'Create CPR', icon: ClipboardList, style: 'ghost', action: () => navigate(`/cprs/new?clientId=${id}`) },
    {
      key: 'quotation',
      label: 'Create Quotation',
      icon: FileText,
      style: 'ghost',
      action: () => navigate(`/quotations/new?clientId=${id}&customer=${encodeURIComponent(displayName)}`)
    },
    {
      key: 'statement',
      label: 'Statement',
      icon: BookOpen,
      style: 'ghost',
      action: () => setTab('statement')
    },
    isArchived
      ? {
          key: 'restore',
          label: 'Restore',
          icon: RotateCcw,
          style: 'ghost',
          action: () => runAction(() => customerService.restore(id), 'Client restored')
        }
      : {
          key: 'archive',
          label: 'Archive',
          icon: Archive,
          style: 'ghost',
          action: () => runAction(() => customerService.archive(id), 'Client archived')
        },
    { key: 'refresh', label: 'Refresh', icon: RotateCw, style: 'ghost', action: load }
  ];

  const tabs = [
    { key: 'overview', label: 'Overview', icon: IdCard },
    { key: 'timeline', label: 'Timeline', icon: Clock },
    { key: 'documents', label: 'Documents', icon: FolderOpen, count: (customer.attachments || []).length },
    { key: 'statement', label: 'Statement', icon: BookOpen },
    { key: 'activities', label: 'Activity Log', icon: ActivityIcon },
    { key: 'versionHistory', label: 'Version History', icon: GitBranch }
  ];

  return (
    <DetailPage className="erp-detail-scope">
      <DetailBreadcrumb
        items={[
          { label: 'Dashboard', to: '/dashboard' },
          { label: 'Sales', to: '/crm' },
          { label: 'Clients', to: '/clients' },
          { label: code }
        ]}
      />

      <DetailHeader
        initial={displayName}
        title={displayName}
        titleSuffix={`(${code})`}
        onBack={() => navigate('/clients')}
        backLabel="Back"
        busy={busy}
        actions={headerActions}
        chips={[
          <span key="code" className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Tag className="w-3 h-3 text-[#0B4A3D]" /> {code}
          </span>,
          <DetailBadge key="status" tone={statusTone(status)}>{status}</DetailBadge>,
          customer.clientType ? <DetailBadge key="type" tone="neutral">{customer.clientType}</DetailBadge> : null,
          customer.industry ? <DetailBadge key="ind" tone="neutral">{customer.industry}</DetailBadge> : null,
          customer.currency ? <DetailBadge key="cur" tone="neutral">{customer.currency}</DetailBadge> : null
        ]}
        meta={[
          customer.contactPerson ? (
            <span key="cp" className="inline-flex items-center gap-1">
              <Users className="w-3 h-3 text-[#0B4A3D]" /> {customer.contactPerson}
            </span>
          ) : null,
          customer.phone || customer.email ? (
            <span key="contact">{[customer.phone, customer.email].filter(Boolean).join(' · ')}</span>
          ) : null,
          customer.createdAt ? (
            <span key="created" className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3 text-[#0B4A3D]" /> {formatDate(customer.createdAt)}
            </span>
          ) : null,
          customer.salesPerson ? (
            <span key="sp" className="inline-flex items-center gap-1">
              <Building2 className="w-3 h-3 text-[#0B4A3D]" /> {customer.salesPerson}
            </span>
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
              <DetailCard icon={IndianRupee} title="Client Summary">
                <DetailRow label="Credit Limit">
                  <span className="text-sm font-bold text-[#0B4A3D]">
                    {customer.creditLimit != null ? formatINR(customer.creditLimit, customer.currency) : '—'}
                  </span>
                </DetailRow>
                <DetailRow label="Opening Balance">{formatINR(outstanding, customer.currency)}</DetailRow>
                <DetailRow label="Payment Terms">{customer.paymentTerms || '—'}</DetailRow>
                <DetailRow label="Currency">{customer.currency || '—'}</DetailRow>
                <DetailRow label="GSTIN">{customer.gstin || '—'}</DetailRow>
                <DetailRow label="PAN">{customer.pan || '—'}</DetailRow>
                <DetailRow label="Status">{status}</DetailRow>
                <DetailRow label="Sales Person">{customer.salesPerson || '—'}</DetailRow>
                <DetailRow label="Created">
                  {customer.createdAt ? formatDate(customer.createdAt) : '—'}
                </DetailRow>
                <DetailRow label="Last Updated">
                  {customer.updatedAt ? formatDateTime(customer.updatedAt) : '—'}
                </DetailRow>
              </DetailCard>

              <DetailCard icon={ActivityIcon} title="Related Records">
                <DetailRow label="Follow-ups">{related.followUps.length}</DetailRow>
                <DetailRow label="CPRs">{related.cprs.length}</DetailRow>
                <DetailRow label="Quotations">{related.quotations.length}</DetailRow>
                <DetailRow label="Contracts">{related.contracts.length}</DetailRow>
                <DetailRow label="Invoices">{related.invoices.length}</DetailRow>
              </DetailCard>

              <DetailCard icon={PhoneCall} title="Follow-ups" count={related.followUps.length || null}>
                {related.followUps.length === 0 ? (
                  <p className="text-xs font-semibold text-slate-400">No follow-ups recorded for this client.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {related.followUps.slice(0, 5).map((f) => (
                      <div key={f.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                        <DetailLink onClick={() => navigate(`/followups/${f.id}`)}>
                          <span className="text-xs font-bold">FU-{String(f.id).padStart(6, '0')}</span>
                        </DetailLink>
                        <DetailBadge tone={String(f.status).toLowerCase() === 'open' ? 'green' : 'slate'}>
                          {f.status || 'Open'}
                        </DetailBadge>
                      </div>
                    ))}
                  </div>
                )}
              </DetailCard>
            </>
          }
        >
          <ClientDetailsTab customer={customer} />

          <DetailCard icon={ClipboardList} title="Customer Purchase Requests" count={related.cprs.length || null}>
            {related.cprs.length === 0 ? (
              <DetailEmpty icon={ClipboardList} title="No CPRs" subtitle="No purchase requests raised for this client." />
            ) : (
              <div className="flex flex-col gap-2">
                {related.cprs.slice(0, 5).map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <DetailLink onClick={() => navigate(`/cprs/${c.id}`)}>
                      <span className="text-xs font-bold">{c.prNo}</span>
                    </DetailLink>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {c.status} · {formatINR(c.grandTotal || 0)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>

          <DetailCard icon={FileText} title="Quotations" count={related.quotations.length || null}>
            {related.quotations.length === 0 ? (
              <DetailEmpty icon={FileText} title="No quotations" subtitle="No quotations raised for this client." />
            ) : (
              <div className="flex flex-col gap-2">
                {related.quotations.slice(0, 5).map((q) => (
                  <div key={q.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <DetailLink onClick={() => navigate(`/quotations/${q.id}/view`)}>
                      <span className="text-xs font-bold">{q.quotationNo}</span>
                    </DetailLink>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {q.status} · {formatINR(q.grandTotal || 0, q.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>

          <DetailCard icon={FileSignature} title="Sales Contracts" count={related.contracts.length || null}>
            {related.contracts.length === 0 ? (
              <DetailEmpty icon={FileSignature} title="No contracts" subtitle="No sales contracts for this client." />
            ) : (
              <div className="flex flex-col gap-2">
                {related.contracts.slice(0, 5).map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <DetailLink onClick={() => navigate(`/sales-contracts/${s.id}`)}>
                      <span className="text-xs font-bold">{s.scNo}</span>
                    </DetailLink>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {s.status} · {formatINR(s.grandTotal || 0, s.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>

          <DetailCard icon={Receipt} title="Invoices" count={related.invoices.length || null}>
            {related.invoices.length === 0 ? (
              <DetailEmpty icon={Receipt} title="No invoices" subtitle="No invoices raised for this client." />
            ) : (
              <div className="flex flex-col gap-2">
                {related.invoices.slice(0, 5).map((i) => (
                  <div key={i.id} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2">
                    <DetailLink onClick={() => navigate(`/invoices/${i.id}`)}>
                      <span className="text-xs font-bold">{i.invoiceNo}</span>
                    </DetailLink>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {i.status} · {formatINR(i.grandTotal || 0, i.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DetailCard>
        </DetailTwoColumn>
      )}

      {tab === 'timeline' && (
        <div className="mt-4">
          <DetailCard icon={Clock} title="Timeline">
            <ClientTimelineTab clientId={id} />
          </DetailCard>
        </div>
      )}

      {tab === 'documents' && (
        <div className="mt-4">
          <DetailCard icon={FolderOpen} title="Documents" count={`${(customer.attachments || []).length} files`}>
            <ClientDocumentsTab clientId={id} />
          </DetailCard>
        </div>
      )}

      {tab === 'statement' && (
        <div className="mt-4">
          <DetailCard icon={BookOpen} title="Statement">
            <ClientStatementTab clientId={id} currency={customer.currency} />
          </DetailCard>
        </div>
      )}

      {tab === 'activities' && (
        <div className="mt-4">
          <DetailCard icon={ActivityIcon} title="Activity Log">
            <ClientActivitiesTab clientId={id} />
          </DetailCard>
        </div>
      )}

      {tab === 'versionHistory' && (
        <div className="mt-4">
          <DetailCard icon={GitBranch} title="Version History">
            <ClientVersionHistoryTab clientId={id} client={customer} />
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
