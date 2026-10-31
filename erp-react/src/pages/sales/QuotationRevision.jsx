import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, FileText, GitBranch, History } from 'lucide-react';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import RevisionHistoryTable from '../../components/EditHistory/RevisionHistoryTable';
import VersionComparison from '../../components/EditHistory/VersionComparison';
import useVersionComparison from '../../hooks/useVersionComparison';
import { baseNumber } from '../../utils/versionDiff';
import { normalizeQuotation } from '../../utils/salesHelpers';
import { formatDateTime, formatINR } from '../../utils/leadHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

export default function QuotationRevision() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // The quotation's OWN detail response. Its `revisions` array is the real
  // version chain — the page shows those saved versions instead of deriving
  // version numbers from the field-level edit history.
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    quotationService
      .list({ page: 0, size: 500 })
      .then((res) => {
        if (cancelled) return;
        const list = parseListResponse(res).filter((q) => String(q.status || '').toLowerCase() !== 'deleted');
        setQuotations(list);
        const id = searchParams.get('id');
        if (id && list.some((q) => String(q.id) === id)) setSelectedId(id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!selectedId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    quotationService
      .getHistory(selectedId)
      .then((res) => {
        if (!cancelled) setHistory(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selected = useMemo(
    () => quotations.find((q) => String(q.id) === selectedId) || null,
    [quotations, selectedId]
  );

  // The saved version chain of the selected quotation, oldest → newest, served
  // by the module service. Nothing here is inferred.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return undefined;
    }
    let cancelled = false;
    setDetailLoading(true);
    quotationService
      .get(selectedId)
      .then((res) => {
        if (cancelled) return;
        const body = res?.data ?? res ?? null;
        setDetail(body && typeof body === 'object' ? body : null);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const version = useVersionComparison({
    service: quotationService,
    doc: detail,
    normalize: normalizeQuotation,
    enabled: Boolean(detail)
  });
  const chain = version.chain;
  const selectedVersionNo = version.selected ? version.selected.revision : selected?.revision || 0;
  // One timeline entry per SAVED version, taken from the real chain — never
  // inferred from the edit history, which records field changes, not versions.
  const revisionEvents = useMemo(() => {
    const events = [];
    chain.forEach((rev) => {
      events.push({
        title: Number(rev.revision) > 0 ? `Revision ${rev.revision} saved` : 'Original version saved',
        desc: `${rev.number || ''}${rev.latestRevision ? ' — current version' : ''}`,
        time: rev.revisionDate || '',
        user: ''
      });
    });
    if (history.length > 0) {
      history.forEach((h) => {
        events.push({
          title: `Field Changed: ${h.field || 'document'}`,
          desc: `${h.oldValue || '—'} → ${h.newValue || '—'}`,
          time: h.createdAt || '',
          user: h.changedBy || 'Admin'
        });
      });
    }
    return events.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));
  }, [chain, history]);

  return (
    <div className="qpo-page">
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Quotation Revision History</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <GitBranch className="w-6 h-6 text-[#0B4A3D]" />
            Revision History
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">View version and revision history of a quotation</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" /> Quotation List
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5 items-start">
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">Select Quotation</h3>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#0B4A3D] cursor-pointer"
            >
              <option value="">-- Select Quotation --</option>
              {quotations.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.quotationNo || q.id} - {q.clientName || '—'} (v{q.revision || q.version || 1})
                </option>
              ))}
            </select>

            {selected && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500">Status</span>
                  <SalesStatusBadge status={selected.status} />
                </div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500">Version</span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-[20px] text-[11px] font-bold bg-[#E8F0EE] text-[#0B4A3D]">
                    {Number(selectedVersionNo) > 0 ? `Revision ${selectedVersionNo}` : 'Original'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Amount</span>
                  <span className="text-sm font-bold text-[#0B4A3D]">{formatINR(selected.grandTotal || 0)}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {/* ===== TIMELINE ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">
                <History className="w-3.5 h-3.5 inline mr-1" /> Revision Timeline
              </h3>
              {!selected ? (
                <div className="text-center py-10">
                  <GitBranch className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">Select a quotation to view its revision history</p>
                </div>
              ) : revisionEvents.length === 0 && !historyLoading ? (
                <div className="text-center py-8 text-xs text-slate-400">No revision history</div>
              ) : (
                <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
                  {revisionEvents.map((e, i) => (
                    <div key={i} className="relative pl-9 pb-4 last:pb-0">
                      <span className="absolute left-[3px] top-1 w-3 h-3 rounded-full border-2 border-[#0B4A3D] bg-[#E8F0EE]" />
                      <div className="text-[13px] font-semibold text-slate-800">{e.title}</div>
                      {e.desc && <div className="text-xs text-slate-500 mt-0.5">{e.desc}</div>}
                      <div className="text-[11px] text-slate-400 mt-0.5">{e.user} · {formatDateTime(e.time)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ===== VERSION HISTORY =====
                The SAVED versions of this quotation, exactly as the backend keeps
                them, plus what the selected version changed against the one before
                it. Previously this table derived version numbers from the edit
                history, which produced versions that were never saved. */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200">
                <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">Version History</h3>
              </div>
              <div className="px-5 py-4 border-b border-slate-200">
                {detailLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <span className="h-4 w-4 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
                    Loading saved versions…
                  </div>
                ) : (
                  <VersionComparison
                    comparison={version.comparison}
                    direction={version.direction}
                    loading={version.loading}
                    unavailable={version.unavailable}
                    selectedLabel={`Revision ${selectedVersionNo}`}
                  />
                )}
              </div>
              <div className="px-5 py-4">
                {!selected ? (
                  <div className="py-8 text-center text-xs text-slate-400">Select a quotation first</div>
                ) : chain.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    No saved versions were returned for this quotation.
                  </div>
                ) : (
                  <RevisionHistoryTable
                    revisions={chain}
                    docNumber={baseNumber(selected.quotationNo || '')}
                    currentId={selectedId}
                    viewRoute={(rev) => `/quotations/${rev.id}/view`}
                    navigate={navigate}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
