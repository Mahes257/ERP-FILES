/**
 * purchase/pages/logistics/PackingDetail.jsx
 * ------------------------------------------------------------------
 * Packing Detail — shows a single packing job with PO info, quantity
 * breakdown, packing status, and activity history.
 *
 * Route: /purchase/logistics/manufacturing/:packingNo
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Boxes, CheckCircle2, ChevronLeft, Factory, FileSearch, Loader2,
  Pencil, PackageCheck, RefreshCw, Ship, Truck
} from 'lucide-react';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { logisticsService, PACKING_STATUS } from '../../services/logistics';
import { formatDateTime, formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* ==================== Progress Bar ==================== */
function ProgressBar({ ordered, packed }) {
  const pct = ordered > 0 ? Math.round((packed / ordered) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-sky-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-xs font-bold text-slate-600 tabular-nums w-10 text-right">{pct}%</span>
    </div>
  );
}

/* ==================== Main Component ==================== */
export default function PackingDetail() {
  const navigate = useNavigate();
  const { packingNo } = useParams();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await logisticsService.getManufacturingById(packingNo);
      if (!data) {
        setNotFound(true);
        return;
      }
      setItem(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [packingNo]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const ordered = Number(item?.qty) || 0;
  const packed = Number(item?.packedQty) || 0;
  const balance = Math.max(0, ordered - packed);

  /* Build activity timeline from the record */
  const activity = useMemo(() => {
    if (!item) return [];
    const events = [];
    if (item.createdAt) {
      events.push({ time: item.createdAt, label: 'Packing job created', icon: Factory, color: '#0A4F44' });
    }
    if (item.status === PACKING_STATUS.IN_PRODUCTION && packed > 0) {
      events.push({ time: item.startDate || item.createdAt, label: 'Production started', icon: Boxes, color: '#d97706' });
    }
    if (item.status === PACKING_STATUS.PACKED || item.status === PACKING_STATUS.READY_TO_SHIP) {
      events.push({ time: item.startDate || item.createdAt, label: 'Packing completed', icon: PackageCheck, color: '#0ea5e9' });
    }
    if (item.status === PACKING_STATUS.READY_TO_SHIP) {
      events.push({ time: item.expectedDate, label: 'Ready for dispatch', icon: Ship, color: '#16a34a' });
    }
    return events;
  }, [item, packed]);

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !item) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <FileSearch className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700">Packing job not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been removed or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/logistics/manufacturing')}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to Manufacturing
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout>
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Manufacturing / Packing', to: '/purchase/logistics/manufacturing' },
          { label: item.packingNo }
        ]}
        icon={PackageCheck}
        title="Packing Detail"
        subtitle={`${item.packingNo} — ${item.product || ''}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/manufacturing')}
              className="btn btn-ghost btn-sm"
            >
              <ChevronLeft size={12} /> Back to List
            </button>
            <button
              type="button"
              onClick={() => navigate(`/purchase/logistics/manufacturing/${item.packingNo}/edit`)}
              className="btn btn-ghost btn-sm"
            >
              <Pencil size={12} /> Edit
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
      />

      {/* ── PACKING WORKFLOW PIPELINE ── */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Truck className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Packing Workflow</span>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {[{ key: 'In Production', label: 'In Production' }, { key: 'Packed', label: 'Packed' }, { key: 'Ready to Ship', label: 'Ready to Ship' }].map((stage, idx, arr) => {
            const stageOrder = [PACKING_STATUS.IN_PRODUCTION, PACKING_STATUS.PACKED, PACKING_STATUS.READY_TO_SHIP];
            const currentIdx = stageOrder.indexOf(item.status);
            const stageIdx = stageOrder.indexOf(stage.key);
            const isCompleted = stageIdx < currentIdx;
            const isCurrent = stage.key === item.status;
            return (
              <div key={stage.key} className="flex items-center flex-shrink-0">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  isCurrent
                    ? 'bg-[#0B4A3D] text-white shadow-sm'
                    : isCompleted
                      ? 'bg-[#EDF7F4] text-[#0B4A3D] border border-[#0B4A3D]/20'
                      : 'bg-slate-50 text-slate-400 border border-slate-100'
                }`}>
                  {isCompleted && <CheckCircle2 className="w-3 h-3" />}
                  {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  {stage.label}
                </div>
                {idx < arr.length - 1 && (
                  <div className={`w-6 h-px mx-0.5 ${isCompleted ? 'bg-[#0B4A3D]/30' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── PACKING SUMMARY ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Packing Summary</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4">
          <div>
            <div className={LABEL}>Packing No</div>
            <div className={`${VALUE} mt-0.5`}>{item.packingNo}</div>
          </div>
          <div>
            <div className={LABEL}>Status</div>
            <div className="mt-0.5"><PurchaseStatusBadge status={item.status} /></div>
          </div>
          <div>
            <div className={LABEL}>PO Number</div>
            <div className="mt-0.5">
              <button
                type="button"
                onClick={() => navigate(`/purchase/orders/${item.poNo}`)}
                className={`${VALUE} text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer`}
              >
                {item.poNo}
              </button>
            </div>
          </div>
          <div>
            <div className={LABEL}>Vendor</div>
            <div className={`${VALUE} mt-0.5`}>{item.vendor || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Product</div>
            <div className={`${VALUE} mt-0.5`}>{item.product || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Start Date</div>
            <div className={`${VALUE} mt-0.5`}>{formatDate(item.startDate) || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Expected Dispatch</div>
            <div className={`${VALUE} mt-0.5`}>{formatDate(item.expectedDate) || '—'}</div>
          </div>
          {item.notes && (
            <div className="sm:col-span-4">
              <div className={LABEL}>Notes</div>
              <div className={`${VALUE} mt-0.5`}>{item.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── QUANTITY BREAKDOWN ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Quantity Breakdown</h3>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3 text-center">
              <div className={LABEL}>Ordered Qty</div>
              <div className="text-xl font-extrabold text-slate-800 mt-1 tabular-nums">{ordered}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-center">
              <div className={LABEL}>Packed Qty</div>
              <div className="text-xl font-extrabold text-emerald-700 mt-1 tabular-nums">{packed}</div>
            </div>
            <div className={`rounded-lg border px-4 py-3 text-center ${
              balance === 0 ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-slate-50/60'
            }`}>
              <div className={LABEL}>Balance Qty</div>
              <div className={`text-xl font-extrabold mt-1 tabular-nums ${balance === 0 ? 'text-emerald-700' : 'text-slate-800'}`}>{balance}</div>
            </div>
          </div>
          <ProgressBar ordered={ordered} packed={packed} />
        </div>
      </div>

      {/* ── LINE ITEMS ── */}
      {item.items && item.items.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Line Items</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <th className="px-5 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider">Product</th>
                  <th className="px-5 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider">HSN</th>
                  <th className="px-5 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider">UOM</th>
                  <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Qty</th>
                  <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Packed</th>
                  <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                </tr>
              </thead>
              <tbody>
                {item.items.map((line, idx) => {
                  const lineQty = Number(line.qty) || 0;
                  const linePacked = Number(line.packedQty) || 0;
                  const lineBalance = Math.max(0, lineQty - linePacked);
                  return (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/40">
                      <td className="px-5 py-3 font-semibold text-slate-800">{line.product}</td>
                      <td className="px-5 py-3 text-slate-500">{line.hsn || '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{line.uom || 'Nos'}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-600">{lineQty}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-bold text-emerald-700">{linePacked}</td>
                      <td className={`px-5 py-3 text-right tabular-nums font-semibold ${lineBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{lineBalance}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── NEXT STEP ── */}
      {item.status === PACKING_STATUS.READY_TO_SHIP ? (
        <div className="rounded-xl border border-emerald-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-700">Ready for Shipment</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                This packing job is complete. Create a shipment to proceed.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/purchase/logistics/manufacturing')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => navigate('/purchase/logistics/shipment/new', { state: { poNo: item.poNo, packingNo: item.packingNo } })}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Create Shipment <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-slate-800">Packing in Progress</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {balance > 0 ? `${balance} units remaining to pack.` : 'All units packed.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/manufacturing')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Back to List
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVITY / HISTORY ── */}
      {activity.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Activity</h3>
          </div>
          <div className="px-5 py-4">
            <div className="space-y-3">
              {activity.map((event, i) => {
                const Icon = event.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: `${event.color}15` }}>
                      <Icon size={14} style={{ color: event.color }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-slate-700">{event.label}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {event.time ? formatDateTime(event.time) : '—'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </PurchasePageLayout>
  );
}
