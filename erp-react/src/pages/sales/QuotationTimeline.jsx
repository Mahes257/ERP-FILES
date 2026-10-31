import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Clock, FileText, History, MessageSquarePlus, Send } from 'lucide-react';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import { useToast } from '../../components/Common';
import { formatDateTime } from '../../utils/leadHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

const TL_COLORS = {
  created: 'border-[#0B4A3D] bg-[#E8F0EE]',
  updated: 'border-[#0B4A3D] bg-[#E8F0EE]',
  sent: 'border-[#f59e0b] bg-[#fffbeb]',
  approved: 'border-[#16a34a] bg-[#f0fdf4]',
  rejected: 'border-[#dc2626] bg-[#fef2f2]',
  comment: 'border-[#7c3aed] bg-[#f5f3ff]',
  default: 'border-[#9ca3af] bg-white'
};

export default function QuotationTimeline() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [selected, setSelected] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

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

  const loadTimeline = (id, q) => {
    setSelected(q);
    quotationService
      .getTimeline(id)
      .then((res) => {
        const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setTimeline(list);
      })
      .catch(() => {
        setTimeline(
          q
            ? [{ title: `${q.quotationNo || q.id} Created`, detail: 'Quotation was created', createdAt: q.createdAt || q.date, type: 'created' }]
            : []
        );
      });
  };

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    quotationService
      .get(selectedId)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? {};
        if (raw?.id) loadTimeline(selectedId, raw);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const activeSelected = selected && String(selected.id) === selectedId ? selected : null;

  const events = useMemo(() => {
    const activeTimeline = selected && String(selected.id) === selectedId ? timeline : [];
    const current = activeSelected;
    if (activeTimeline.length > 0) {
      return activeTimeline
        .map((t) => ({ title: t.title, desc: t.detail, date: t.createdAt, type: t.type || 'default' }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    }
    if (!current) return [];
    return [
      { title: 'Quotation Created', desc: `Quotation ${current.quotationNo || current.id} was created`, date: current.createdAt || current.date, type: 'created' },
      ...(current.updatedAt && current.updatedAt !== current.createdAt
        ? [{ title: 'Quotation Updated', desc: 'Document was updated', date: current.updatedAt, type: 'updated' }]
        : []),
      ...(current.sentAt ? [{ title: 'Sent to Client', desc: `Sent by ${current.sentBy || 'Admin'}`, date: current.sentAt, type: 'sent' }] : [])
    ];
  }, [selected, selectedId, timeline]); // eslint-disable-line react-hooks/exhaustive-deps -- activeSelected is derived from selected/selectedId

  const addComment = async () => {
    if (!activeSelected || !comment.trim() || busy) return;
    setBusy(true);
    try {
      // ERP stores timeline comments locally; append to the live timeline.
      setTimeline((prev) => [
        ...prev,
        { title: 'Comment Added', detail: comment.trim(), createdAt: new Date().toISOString(), type: 'comment' }
      ]);
      setComment('');
      toast.success('Comment added');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qpo-page">
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Quotation Timeline</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <History className="w-6 h-6 text-[#0B4A3D]" />
            Quotation Timeline
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Complete activity timeline of a quotation</p>
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
                  {q.quotationNo || q.id} - {q.clientName || '—'}
                </option>
              ))}
            </select>

            {activeSelected && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-slate-500">Status</span>
                  <SalesStatusBadge status={activeSelected.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Events</span>
                  <span className="text-sm font-bold text-[#0B4A3D]">{events.length}</span>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">Activity Timeline</h3>
              {!activeSelected ? (
                <div className="text-center py-12">
                  <Clock className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-600 mb-1">Select a Quotation</h4>
                  <p className="text-xs text-slate-400">Choose a quotation above to view its complete activity timeline.</p>
                </div>
              ) : events.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No timeline events</div>
              ) : (
                <div className="relative before:content-[''] before:absolute before:left-1.5 before:top-1 before:bottom-1 before:w-0.5 before:bg-slate-200">
                  {events.map((e, i) => (
                    <div key={i} className="relative pl-9 pb-5 last:pb-0 group">
                      <span
                        className={`absolute left-[3px] top-1 w-3 h-3 rounded-full border-2 ${TL_COLORS[e.type] || TL_COLORS.default} group-hover:scale-125 transition-transform`}
                      />
                      <div className="text-[13px] font-semibold text-slate-800">{e.title}</div>
                      {e.desc && <div className="text-xs text-slate-500 mt-0.5">{e.desc}</div>}
                      <div className="text-[11px] text-slate-400 mt-0.5">{formatDateTime(e.date)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {activeSelected && (
              <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
                <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-3">
                  <MessageSquarePlus className="w-3.5 h-3.5 inline mr-1" /> Add Comment
                </h3>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  placeholder="Add a note to the timeline..."
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400 resize-none mb-3"
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={busy || !comment.trim()}
                  className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" /> Add Comment
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
