import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  FileSignature,
  FileText,
  Link2,
  Repeat,
  ScrollText
} from 'lucide-react';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import salesContractService from '../../services/salesContractService';
import salesOrderService from '../../services/salesOrderService';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import { useToast } from '../../components/Common';
import { formatDate } from '../../utils/leadHelpers';
import { cpoNo } from '../../utils/salesHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

function DocLink({ label, value, onClick }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border border-slate-200 rounded-lg hover:border-slate-300 hover:bg-slate-50/60 transition-all">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
          <FileText className="w-3.5 h-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
          {onClick ? (
            <button type="button" onClick={onClick} className="text-[13px] font-semibold text-[#0B4A3D] hover:underline cursor-pointer">
              {value}
            </button>
          ) : (
            <div className="text-[13px] font-semibold text-slate-700">{value}</div>
          )}
        </div>
      </div>
      {onClick && <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />}
    </div>
  );
}

export default function QuotationLinkedDocuments() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [quotations, setQuotations] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      quotationService.list({ page: 0, size: 500 }),
      salesContractService.list({ page: 0, size: 500 }),
      salesOrderService.list({ page: 0, size: 500 })
    ])
      .then(([qr, cr, or]) => {
        if (cancelled) return;
        setQuotations(parseListResponse(qr).filter((q) => String(q.status || '').toLowerCase() !== 'deleted'));
        setContracts(parseListResponse(cr));
        setOrders(parseListResponse(or));
        const id = searchParams.get('id');
        if (id && parseListResponse(qr).some((q) => String(q.id) === id)) setSelectedId(id);
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
      setSelected(null);
      return;
    }
    quotationService
      .get(selectedId)
      .then((res) => setSelected(res?.data ?? null))
      .catch(() => setSelected(null));
  }, [selectedId]);

  const qtnNo = selected?.quotationNo || selected?.id;

  const sourceDocs = useMemo(() => {
    const docs = [];
    if (selected?.sourceCpr) docs.push({ label: 'Source CPR/PR', value: selected.sourceCpr, onClick: () => navigate(`/cprs/${selected.cprId || ''}`.replace(/\/$/, '')) });
    if (selected?.sourceCw || selected?.cwRef) docs.push({ label: 'Source Cost Workout', value: selected.sourceCw || selected.cwRef, onClick: () => navigate('/cost-workouts') });
    if (selected?.leadNo) docs.push({ label: 'Lead', value: selected.leadNo, onClick: () => navigate('/leads') });
    if (selected?.reference || selected?.qtnRef) docs.push({ label: 'Reference', value: selected.reference || selected.qtnRef });
    return docs;
  }, [selected, navigate]);

  const downstreamDocs = useMemo(() => {
    const docs = [];
    const linkedContracts = contracts.filter(
      (c) => String(c.qtnRef || c.quotationRef || '').toLowerCase() === String(qtnNo || '').toLowerCase() || String(c.qtnRef || c.quotationRef || '') === String(selectedId)
    );
    linkedContracts.forEach((c) => docs.push({ label: 'Sales Contract', value: c.scNo || c.id, onClick: () => navigate(`/sales-contracts/${c.id}`) }));
    const linkedOrders = orders.filter(
      (o) => String(o.qtnRef || '').toLowerCase() === String(qtnNo || '').toLowerCase() || String(o.qtnRef || '') === String(selectedId)
    );
    linkedOrders.forEach((o) => docs.push({ label: 'Customer Purchase Order', value: cpoNo(o.soNo) || o.id, onClick: () => navigate(`/sales-orders/${o.id}/edit`) }));
    if (Array.isArray(selected?.linkedDocuments)) {
      selected.linkedDocuments.forEach((d) => {
        if (d.type === 'sales-contract') docs.push({ label: 'Sales Contract', value: d.ref, onClick: () => navigate('/sales-contracts') });
        if (d.type === 'sales-order') docs.push({ label: 'Customer Purchase Order', value: d.ref, onClick: () => navigate('/sales-orders') });
      });
    }
    return docs;
  }, [selected, contracts, orders, qtnNo, selectedId, navigate]);

  const doConvert = async (type) => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      if (type === 'order') {
        // Backend exposes convert-sales-order directly.
        await quotationService.postAction(selected.id, 'convert-sales-order');
        toast.success('Converted to Customer Purchase Order');
        navigate('/sales-orders');
        return;
      }
      // Sales Contract conversion goes through the dedicated Convert page
      // (same flow as ERP quotation-convert.html) so the SC is created
      // with the proper DTO and the quotation status flips to converted.
      navigate(`/quotations/convert?id=${selected.id}`);
    } catch (err) {
      toast.error(err?.message || 'Conversion failed');
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
        <span>Linked Documents</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Link2 className="w-6 h-6 text-[#0B4A3D]" />
            Linked Documents
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Source and downstream documents linked to a quotation</p>
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
                  {q.quotationNo || q.id} - {q.clientName || '—'} ({q.status || 'Draft'})
                </option>
              ))}
            </select>

            {selected && (
              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Status</span>
                  <SalesStatusBadge status={selected.status} />
                </div>
                <div className="mt-3 text-[11px] text-slate-400">{formatDate(selected.quotationDate || selected.date)}</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ===== SOURCE DOCS ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">
                  <ScrollText className="w-3.5 h-3.5 inline mr-1" /> Source Documents
                </h3>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                  {sourceDocs.length}
                </span>
              </div>
              {!selected ? (
                <div className="text-center py-10">
                  <ScrollText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-600 mb-1">No Source Documents</h4>
                  <p className="text-xs text-slate-400">Select a quotation to view linked source documents.</p>
                </div>
              ) : sourceDocs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No source documents linked</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sourceDocs.map((d) => (
                    <DocLink key={d.label} label={d.label} value={d.value} onClick={d.onClick} />
                  ))}
                </div>
              )}
            </div>

            {/* ===== DOWNSTREAM DOCS ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">
                  <FileSignature className="w-3.5 h-3.5 inline mr-1" /> Converted Documents
                </h3>
                <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">
                  {downstreamDocs.length}
                </span>
              </div>
              {!selected ? (
                <div className="text-center py-10">
                  <FileSignature className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-sm font-bold text-slate-600 mb-1">No Converted Documents</h4>
                  <p className="text-xs text-slate-400">This quotation has not been converted yet.</p>
                </div>
              ) : downstreamDocs.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">No downstream documents yet</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {downstreamDocs.map((d) => (
                    <DocLink key={`${d.label}-${d.value}`} label={d.label} value={d.value} onClick={d.onClick} />
                  ))}
                </div>
              )}
            </div>

            {/* ===== CONVERSION ACTIONS ===== */}
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 md:col-span-2">
              <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">
                <Repeat className="w-3.5 h-3.5 inline mr-1" /> Conversion Actions
              </h3>
              {!selected ? (
                <div className="text-center py-6 text-xs text-slate-400">Select a quotation to view conversion options.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => doConvert('contract')}
                    disabled={busy}
                    className="flex items-center gap-3 px-4 py-3.5 border border-slate-200 rounded-xl hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/50 transition-all cursor-pointer text-left disabled:opacity-50"
                  >
                    <span className="p-2 rounded-lg bg-[#E8F0EE] text-[#0B4A3D] shrink-0">
                      <FileSignature className="w-4 h-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Convert to Sales Contract</span>
                      <span className="block text-[11px] text-slate-400">Create a contract from this quotation</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
                  </button>
                  <button
                    type="button"
                    onClick={() => doConvert('order')}
                    disabled={busy}
                    className="flex items-center gap-3 px-4 py-3.5 border border-slate-200 rounded-xl hover:border-[#0B4A3D] hover:bg-[#E8F0EE]/50 transition-all cursor-pointer text-left disabled:opacity-50"
                  >
                    <span className="p-2 rounded-lg bg-[#E8F0EE] text-[#0B4A3D] shrink-0">
                      <FileText className="w-4 h-4" />
                    </span>
                    <span>
                      <span className="block text-xs font-bold text-slate-800">Convert to Customer Purchase Order</span>
                      <span className="block text-[11px] text-slate-400">Create a customer purchase order from this quotation</span>
                    </span>
                    <ArrowRight className="w-4 h-4 text-slate-300 ml-auto shrink-0" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
