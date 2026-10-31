import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ChevronRight,
  FileText,
  Layers,
  Package,
  RefreshCw,
  Repeat
} from 'lucide-react';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import salesContractService from '../../services/salesContractService';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import { useToast } from '../../components/Common';
import { formatDate, formatINR, todayISO } from '../../utils/leadHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400';

export default function QuotationConvert() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [quotations, setQuotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(searchParams.get('id') || '');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ scDate: todayISO(), scNumber: '', paymentTerms: '', deliveryTerms: '', notes: '' });
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

  const preview = useMemo(() => {
    if (!selectedId) return null;
    return quotations.find((q) => String(q.id) === selectedId) || null;
  }, [quotations, selectedId]);

  const handleSelect = (id) => {
    setSelectedId(id);
    const q = quotations.find((x) => String(x.id) === id);
    if (!q) return;
    setSelected(q);
    setForm((prev) => ({
      ...prev,
      scNumber: `SC-${q.quotationNo || q.id}`,
      paymentTerms: q.paymentTerms || '',
      deliveryTerms: q.deliveryTerms || '',
      notes: `Converted from Quotation ${q.quotationNo || q.id} dated ${formatDate(q.quotationDate || q.date)}`
    }));
  };

  const doConvert = async () => {
    if (!selected) {
      toast.warning('Select a quotation');
      return;
    }
    if (!form.scNumber.trim()) {
      toast.error('Invalid contract number');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        scNo: form.scNumber.trim(),
        qtnRef: selected.quotationNo || String(selected.id),
        contractDate: form.scDate,
        status: 'draft',
        clientId: selected.clientId != null ? Number(selected.clientId) : null,
        clientName: selected.clientName || selected.client,
        contactPerson: selected.contactPerson || '',
        email: selected.email || '',
        phone: selected.phone || '',
        city: selected.city || '',
        state: selected.state || '',
        billingAddress: selected.billingAddress || selected.address || '',
        shippingAddress: selected.shippingAddress || '',
        gstin: selected.gstin || '',
        pan: selected.pan || '',
        paymentTerms: form.paymentTerms.trim(),
        deliveryTerms: form.deliveryTerms.trim(),
        remarks: form.notes.trim(),
        discount: Number(selected.discount || selected.discountPct || 0) || 0,
        items: (selected.items || []).map((it) => ({
          productId: it.productId || null,
          productName: it.productName || it.product || it.description || '',
          description: it.description || it.productName || '',
          sku: it.sku || '',
          hsn: it.hsn || '',
          unit: it.unit || '',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate) || 0,
          discountPct: Number(it.discountPct) || 0,
          gstRate: Number(it.gstRate || it.gst) || 0,
          amount: Number(it.amount) || 0
        }))
      };
      const res = await salesContractService.create(payload);
      const scNo = res?.data?.scNo || form.scNumber;
      // Record the conversion on the quotation's own conversion reference
      // (plus its timeline + audit trail) instead of overwriting the quotation's
      // lifecycle status. Quotation Status and conversion/PO state are separate
      // fields — the quotations list renders them in separate columns.
      try {
        await quotationService.postAction(selected.id, 'conversion-reference', {
          target: 'sales-contract',
          number: scNo
        });
      } catch (linkErr) {
        toast.error(
          `Sales Contract ${scNo} was created, but linking it to ${selected.quotationNo} failed: ${linkErr?.message || 'unknown error'}`
        );
        navigate('/sales-contracts');
        return;
      }
      toast.success(`Quotation converted to Sales Contract ${scNo}`);
      navigate('/sales-contracts');
    } catch (err) {
      toast.error(err?.message || 'Conversion failed');
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
        <span>Convert Quotation</span>
      </nav>

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Repeat className="w-6 h-6 text-[#0B4A3D]" />
            Convert Quotation to Sales Contract
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Select a quotation, review it, and convert it into a Sales Contract</p>
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {/* ===== LEFT: SELECT + PREVIEW ===== */}
          <div className="space-y-4">
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">1. Select Quotation</h3>
              <select
                value={selectedId}
                onChange={(e) => handleSelect(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-[#0B4A3D] cursor-pointer"
              >
                <option value="">-- Select Quotation --</option>
                {quotations.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.quotationNo || q.id} - {q.clientName || '—'} | {formatINR(q.grandTotal || 0)}
                  </option>
                ))}
              </select>
            </div>

            {preview ? (
              <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">2. Quotation Preview</h3>
                  <SalesStatusBadge status={preview.status} />
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Quotation No</div>
                    <div className="text-sm font-bold text-slate-800">{preview.quotationNo || preview.id}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Customer</div>
                    <div className="text-sm font-semibold text-slate-700">{preview.clientName || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Date</div>
                    <div className="text-sm font-semibold text-slate-700">{formatDate(preview.quotationDate || preview.date)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Amount</div>
                    <div className="text-sm font-bold text-[#0B4A3D]">{formatINR(preview.grandTotal || 0)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Package className="w-3.5 h-3.5 text-[#0B4A3D]" />
                  {(preview.items || []).length} item(s)
                  <Layers className="w-3.5 h-3.5 text-[#0B4A3D] ml-3" />
                  Valid Till: {formatDate(preview.validUntil || preview.validity)}
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-8 text-center">
                <Package className="w-9 h-9 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">Select a quotation to preview its details</p>
              </div>
            )}
          </div>

          {/* ===== RIGHT: CONVERT FORM ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-4">3. Sales Contract Details</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Contract Number *</label>
                <input
                  type="text"
                  value={form.scNumber}
                  onChange={(e) => setForm((p) => ({ ...p, scNumber: e.target.value }))}
                  className={INPUT_CLS}
                  placeholder="SC-..."
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Contract Date</label>
                <input
                  type="date"
                  value={form.scDate}
                  onChange={(e) => setForm((p) => ({ ...p, scDate: e.target.value }))}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Payment Terms</label>
                <input
                  type="text"
                  value={form.paymentTerms}
                  onChange={(e) => setForm((p) => ({ ...p, paymentTerms: e.target.value }))}
                  className={INPUT_CLS}
                  placeholder="e.g. Net 30"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Delivery Terms</label>
                <input
                  type="text"
                  value={form.deliveryTerms}
                  onChange={(e) => setForm((p) => ({ ...p, deliveryTerms: e.target.value }))}
                  className={INPUT_CLS}
                  placeholder="e.g. FOB - Bangalore"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                  className={`${INPUT_CLS} resize-none`}
                  placeholder="Notes..."
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={doConvert}
                  disabled={busy || !selected}
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ArrowRight className="w-3.5 h-3.5" /> {busy ? 'Converting...' : 'Convert to Sales Contract'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId('');
                    setSelected(null);
                  }}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Reset
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
