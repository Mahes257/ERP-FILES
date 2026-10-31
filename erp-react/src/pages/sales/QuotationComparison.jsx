import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ChevronRight, Scale, Truck } from 'lucide-react';
import { useToast } from '../../components/Common';
import { formatINR } from '../../utils/leadHelpers';
import './quotation-module.css';
import '../crm/crm-erp.css';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';

// Deterministic pseudo-random so vendor scores are stable per RFQ/vendor
// (avoids calling Math.random during render).
function seededRandom(seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };
}

export default function QuotationComparison() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const rfqId = searchParams.get('id') || '';
  const [selected, setSelected] = useState({ rfqId: '', name: null });

  const rfq = useMemo(() => {
    if (!rfqId) return null;
    const vendorNames = ['TechPro Industries', 'Aditya Engineering Works', 'Sundaram Fabrics', 'Krishna Auto Parts', 'Vertex Machines', 'Nova Polymers'];
    const items = ['CNC Machined Housing', 'Stainless Steel Flanges', 'Precision Bearings', 'Hydraulic Pump Assembly', 'Aluminium Castings', 'Rubber Gaskets'];
    const idNum = parseInt(rfqId, 10) || 1;
    const vendors = vendorNames.slice(0, 2 + (idNum % 4));
    return {
      id: rfqId,
      item: items[idNum % items.length],
      qty: 50 + (idNum * 10) % 450,
      vendors
    };
  }, [rfqId]);

  const cards = useMemo(() => {
    if (!rfq) return [];
    const rnd = seededRandom(`${rfq.id}:${rfq.vendors.join(',')}`);
    return rfq.vendors.map((v) => {
      const tech = Math.floor(rnd() * 20) + 75;
      const comm = Math.floor(rnd() * 20) + 72;
      const price = Math.floor(rnd() * 1000000) + 200000;
      const overall = Math.round(tech * 0.4 + comm * 0.3 + Math.max(0, Math.min(100, 100 - price / 50000)) * 0.3);
      return {
        name: v,
        tech,
        comm,
        price,
        leadTime: Math.floor(rnd() * 20) + 10,
        overall,
        barColor: overall >= 80 ? '#16a34a' : overall >= 65 ? '#d97706' : '#dc2626'
      };
    });
  }, [rfq]);

  const doSelect = (vendor) => {
    setSelected({ rfqId, name: vendor.name });
    toast.success(`Vendor ${vendor.name} selected`);
  };

  if (!rfq) {
    return (
      <div className="qpo-page">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
          <span>VISHAK TECH</span>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <span>Purchase</span>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <span className="text-slate-600">Quotation Comparison</span>
        </div>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <Scale className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">No RFQ Selected</h2>
          <p className="text-xs text-slate-400">Open this page from an RFQ's Compare Quotations action.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="qpo-page">
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Quotation Comparison</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Scale className="w-6 h-6 text-[#0B4A3D]" />
            Quotation Comparison
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Compare vendor quotations for {rfq.item}</p>
        </div>
      </div>

      {/* ===== RFQ SUMMARY ===== */}
      <div className="bg-[#EDF7F4] border border-[#0B4A3D] rounded-xl px-4 py-3 text-[13px] text-slate-700 mb-4">
        <strong className="text-[#0B4A3D]">RFQ: {rfq.id}</strong> | Item: {rfq.item} | Qty: {rfq.qty} | Vendors: {rfq.vendors.length}
      </div>

      {/* ===== VENDOR CARDS ===== */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((v) => (
          <div key={v.name} className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 flex flex-col">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-4">
              <span className="p-2 rounded-lg bg-slate-100 text-[#0B4A3D] shrink-0">
                <Truck className="w-4 h-4" />
              </span>
              {v.name}
            </h3>

            <div className="flex flex-col gap-3 flex-1">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">Quoted Price</span>
                <span className="text-[15px] font-bold text-[#0B4A3D]">{formatINR(v.price)}</span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Technical Score</span>
                  <span className="font-semibold text-slate-700">{v.tech}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${v.tech}%`, background: '#0B4A3D' }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-400">Commercial Score</span>
                  <span className="font-semibold text-slate-700">{v.comm}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${v.comm}%`, background: '#7c3aed' }} />
                </div>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Delivery Lead Time</span>
                <span className="font-semibold text-slate-700">{v.leadTime} days</span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Payment Terms</span>
                <span className="font-semibold text-slate-700">Net 30</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t-2 border-slate-200 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">
                Overall Score:{' '}
                <span className="text-sm font-extrabold" style={{ color: v.barColor }}>
                  {v.overall}%
                </span>
              </span>
              <button
                type="button"
                onClick={() => doSelect(v)}
                disabled={selected.rfqId === rfqId && selected.name === v.name}
                className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                  selected.rfqId === rfqId && selected.name === v.name
                    ? 'bg-[#E8F0EE] text-[#0B4A3D]'
                    : 'text-[#0B4A3D] border border-[#0B4A3D] hover:bg-[#E8F0EE]'
                }`}
              >
                {selected.rfqId === rfqId && selected.name === v.name ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Selected
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" /> Select
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected.name && selected.rfqId === rfqId && (
        <div className="flex items-center justify-center mt-5">
          <button
            type="button"
            onClick={() => toast.success('Proceeding to supplier selection')}
            className="flex items-center gap-2 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            Finalize Supplier Selection <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="mt-4 text-center text-[11px] text-slate-400">
        Scores shown are indicative estimates for comparison purposes.
      </div>
    </div>
  );
}
