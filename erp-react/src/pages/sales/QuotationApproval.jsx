import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Check,
  CheckCheck,
  ChevronRight,
  Clock,
  FileText,
  Search,
  ShieldCheck,
  X,
  XCircle
} from 'lucide-react';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import { useToast } from '../../components/Common';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import { formatDate, formatDateTime, formatINR } from '../../utils/leadHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

export default function QuotationApproval() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [target, setTarget] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    quotationService
      .list({ page: 0, size: 500 })
      .then((res) => {
        if (!cancelled) setRows(parseListResponse(res));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows.filter((q) => String(q.status || '').toLowerCase() !== 'deleted');
    const s = String(filter);
    if (s === 'pending') {
      list = list.filter((q) => ['pending approval', 'pending_approval', 'sent', 'draft'].includes(String(q.status || '').toLowerCase()));
    } else if (s === 'approved') {
      list = list.filter((q) => ['approved', 'accepted'].includes(String(q.status || '').toLowerCase()));
    } else if (s === 'rejected') {
      list = list.filter((q) => ['rejected', 'cancelled'].includes(String(q.status || '').toLowerCase()));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          String(r.quotationNo || r.id || '').toLowerCase().includes(q) ||
          String(r.clientName || r.client || '').toLowerCase().includes(q)
      );
    }
    if (from) list = list.filter((r) => (r.quotationDate || r.date || '') >= from);
    if (to) list = list.filter((r) => (r.quotationDate || r.date || '') <= to);
    return list;
  }, [rows, filter, search, from, to]);

  const openDetail = (q) => {
    quotationService
      .get(q.id)
      .then((res) => setTarget(res?.data ?? q))
      .catch(() => setTarget(q));
  };

  const doApprove = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await quotationService.changeStatus(target.id, 'accepted', comment);
      // Sidebar pending-approval counts refresh after an approval action.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      toast.success(`Quotation ${target.quotationNo || target.id} approved`);
      setComment('');
      setTarget(null);
      const res = await quotationService.list({ page: 0, size: 500 });
      setRows(parseListResponse(res));
    } catch (err) {
      toast.error(err?.message || 'Approval failed');
    } finally {
      setBusy(false);
    }
  };

  const doReject = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      await quotationService.changeStatus(target.id, 'rejected', comment);
      // Sidebar pending-approval counts refresh after an approval action.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      toast.success(`Quotation ${target.quotationNo || target.id} rejected`);
      setComment('');
      setTarget(null);
      const res = await quotationService.list({ page: 0, size: 500 });
      setRows(parseListResponse(res));
    } catch (err) {
      toast.error(err?.message || 'Rejection failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="qpo-page">
      {/* ===== BREADCRUMB ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Quotation Approval</span>
      </nav>

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-[#0B4A3D]" />
            Quotation Approval
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Review and approve or reject quotations awaiting approval</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
        >
          <FileText className="w-3.5 h-3.5" /> Quotation List
        </button>
      </div>

      {/* ===== FILTERS ===== */}
      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0B4A3D] cursor-pointer"
          >
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All Statuses</option>
          </select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search quotation no or client..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#0B4A3D]" />
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-500">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-2 outline-none focus:border-[#0B4A3D]" />
          </label>
          <span className="text-xs font-semibold text-slate-400 ml-auto">{filtered.length} record(s)</span>
        </div>
      </div>

      {/* ===== TABLE ===== */}
      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 760 }}>
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Quotation No</th>
                  <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Client</th>
                  <th className="py-2.5 px-3 text-right text-[11px] font-bold text-slate-500">Amount</th>
                  <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Status</th>
                  <th className="py-2.5 px-3 text-left text-[11px] font-bold text-slate-500">Date</th>
                  <th className="py-2.5 px-3 text-center text-[11px] font-bold text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <CheckCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs text-slate-400">No quotations match the selected filters</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((q) => (
                    <tr
                      key={q.id}
                      onClick={() => openDetail(q)}
                      className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors cursor-pointer"
                    >
                      <td className="py-2.5 px-3 text-xs font-semibold text-[#0B4A3D]">{q.quotationNo || q.id}</td>
                      <td className="py-2.5 px-3 text-xs text-slate-700">{q.clientName || '—'}</td>
                      <td className="py-2.5 px-3 text-right text-xs font-bold text-slate-800">{formatINR(q.grandTotal || 0)}</td>
                      <td className="py-2.5 px-3"><SalesStatusBadge status={q.status} /></td>
                      <td className="py-2.5 px-3 text-xs text-slate-500">{formatDate(q.quotationDate || q.date)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetail(q);
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                        >
                          <Check className="w-3 h-3" /> Review
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== DETAIL PANEL ===== */}
      {target && (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden mt-4">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-slate-50/60">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-[#0B4A3D]" />
              <h2 className="text-sm font-bold text-slate-800">
                Quotation {target.quotationNo || target.id}
              </h2>
              <SalesStatusBadge status={target.status} />
            </div>
            <button
              type="button"
              onClick={() => setTarget(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Close detail"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-0">
            <div className="p-5 border-b lg:border-b-0 lg:border-r border-slate-100">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5">
                {[
                  ['Customer', target.clientName || '—'],
                  ['Amount', formatINR(target.grandTotal || 0)],
                  ['Date', formatDate(target.quotationDate || target.date)],
                  ['Valid Till', formatDate(target.validUntil || target.validity)],
                  ['Sales Person', target.salesPerson || '—'],
                  ['Payment Terms', target.paymentTerms || '—']
                ].map(([l, v]) => (
                  <div key={l}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">{l}</div>
                    <div className="text-xs font-semibold text-slate-700">{v}</div>
                  </div>
                ))}
              </div>

              <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-2">Items</h3>
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full border-collapse" style={{ minWidth: 480 }}>
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="py-2 px-2 text-left text-[11px] font-bold text-slate-500">Item</th>
                      <th className="py-2 px-2 text-center text-[11px] font-bold text-slate-500">Qty</th>
                      <th className="py-2 px-2 text-right text-[11px] font-bold text-slate-500">Rate</th>
                      <th className="py-2 px-2 text-right text-[11px] font-bold text-slate-500">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(target.items || []).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-6 text-center text-xs text-slate-400">No items</td>
                      </tr>
                    ) : (
                      (target.items || []).map((it, i) => (
                        <tr key={i} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-2 px-2 text-xs text-slate-700">{it.productName || it.product || it.description || 'Item'}</td>
                          <td className="py-2 px-2 text-center text-xs text-slate-600">{it.qty ?? 1}</td>
                          <td className="py-2 px-2 text-right text-xs text-slate-600">{formatINR(it.rate || 0)}</td>
                          <td className="py-2 px-2 text-right text-xs font-semibold text-slate-700">{formatINR(it.amount || (it.qty ?? 1) * (it.rate || 0))}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {target.terms && (
                <div className="mt-4">
                  <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-1.5">Terms</h3>
                  <p className="text-xs text-slate-500 whitespace-pre-wrap">{target.terms}</p>
                </div>
              )}
            </div>

            <div className="p-5">
              <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-3">
                <Clock className="w-3.5 h-3.5 inline mr-1 text-[#0B4A3D]" /> Timeline
              </h3>
              <div className="flex flex-col mb-5">
                <div className="flex items-start gap-2.5 py-2">
                  <span className="mt-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0B4A3D] bg-[#E8F0EE] shrink-0" />
                  <div>
                    <div className="text-[13px] font-semibold text-slate-800">Quotation Created</div>
                    <div className="text-[11px] text-slate-400">{formatDateTime(target.createdAt || target.date)} by {target.createdBy || 'Admin'}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 py-2">
                  <span className="mt-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-300 bg-white shrink-0" />
                  <div>
                    <div className="text-[13px] font-semibold text-slate-800">Pending Review</div>
                    <div className="text-[11px] text-slate-400">Awaiting approval</div>
                  </div>
                </div>
              </div>

              <h3 className="text-[12px] font-bold text-slate-600 uppercase tracking-wide mb-2">Decision</h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Add a comment (optional)..."
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400 mb-3"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={doApprove}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-[#16a34a] hover:bg-[#15803d] px-3 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" /> Approve
                </button>
                <button
                  type="button"
                  onClick={doReject}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-[#dc2626] hover:bg-[#DC2626] px-3 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" /> Reject
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/quotations/${target.id}/view`)}
                className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5" /> Open Full View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
