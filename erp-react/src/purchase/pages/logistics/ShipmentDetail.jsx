/**
 * purchase/pages/logistics/ShipmentDetail.jsx
 * ------------------------------------------------------------------
 * Shipment Detail — shows a single shipment with PO info, carrier
 * details, dispatch timeline, and activity history.
 *
 * Route: /purchase/logistics/shipment/:shipmentNo
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, ChevronLeft, Clock3, FileSearch,
  Loader2, Pencil, RefreshCw, Ship, Truck
} from 'lucide-react';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { logisticsService, SHIPMENT_STATUS } from '../../services/logistics';
import { formatDateTime, formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* ==================== Main Component ==================== */
export default function ShipmentDetail() {
  const navigate = useNavigate();
  const { shipmentNo } = useParams();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await logisticsService.getShipmentById(shipmentNo);
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
  }, [shipmentNo]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  /* Build activity timeline */
  const activity = useMemo(() => {
    if (!item) return [];
    const events = [];
    if (item.createdAt) {
      events.push({ time: item.createdAt, label: 'Shipment created', icon: Ship, color: '#0A4F44' });
    }
    if (item.dispatchDate) {
      events.push({ time: item.dispatchDate, label: 'Dispatched from origin', icon: Truck, color: '#2563eb' });
    }
    if (item.status === SHIPMENT_STATUS.IN_TRANSIT) {
      events.push({ time: item.dispatchDate || item.createdAt, label: 'In transit to destination', icon: Truck, color: '#2563eb' });
    }
    if (item.status === SHIPMENT_STATUS.DELAYED) {
      events.push({ time: item.eta, label: 'Shipment delayed', icon: Clock3, color: '#dc2626' });
    }
    if (item.status === SHIPMENT_STATUS.DELIVERED && item.receivedOn) {
      events.push({ time: item.receivedOn, label: 'Delivered at destination', icon: CheckCircle2, color: '#16a34a' });
    }
    return events;
  }, [item]);

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
          <p className="text-sm font-bold text-slate-700">Shipment not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been removed or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/logistics/shipment')}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to Shipments
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
          { label: 'Shipment Tracking', to: '/purchase/logistics/shipment' },
          { label: item.shipmentNo }
        ]}
        icon={Ship}
        title="Shipment Detail"
        subtitle={`${item.shipmentNo} — ${item.vendor || ''}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/shipment')}
              className="btn btn-ghost btn-sm"
            >
              <ChevronLeft size={12} /> Back to List
            </button>
            <button
              type="button"
              onClick={() => navigate(`/purchase/logistics/shipment/${item.shipmentNo}/edit`)}
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

      {/* ── SHIPMENT WORKFLOW PIPELINE ── */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Truck className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Shipment Workflow</span>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto pb-1">
          {[{ key: SHIPMENT_STATUS.PENDING, label: 'Pending' }, { key: SHIPMENT_STATUS.IN_TRANSIT, label: 'In Transit' }, { key: SHIPMENT_STATUS.DELIVERED, label: 'Delivered' }].map((stage, idx, arr) => {
            const stageOrder = [SHIPMENT_STATUS.PENDING, SHIPMENT_STATUS.IN_TRANSIT, SHIPMENT_STATUS.DELIVERED];
            const currentIdx = stageOrder.indexOf(item.status);
            const stageIdx = stageOrder.indexOf(stage.key);
            const isCompleted = stageIdx < currentIdx || (stage.key === SHIPMENT_STATUS.DELAYED && item.status === SHIPMENT_STATUS.DELAYED);
            const isCurrent = stage.key === item.status || (stage.key === SHIPMENT_STATUS.IN_TRANSIT && item.status === SHIPMENT_STATUS.DELAYED);
            return (
              <div key={stage.key} className="flex items-center flex-shrink-0">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                  isCurrent
                    ? item.status === SHIPMENT_STATUS.DELAYED && stage.key === SHIPMENT_STATUS.IN_TRANSIT
                      ? 'bg-rose-500 text-white shadow-sm'
                      : 'bg-[#0B4A3D] text-white shadow-sm'
                    : isCompleted
                      ? 'bg-[#EDF7F4] text-[#0B4A3D] border border-[#0B4A3D]/20'
                      : 'bg-slate-50 text-slate-400 border border-slate-100'
                }`}>
                  {isCompleted && !isCurrent && <CheckCircle2 className="w-3 h-3" />}
                  {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
                  {stage.label}{item.status === SHIPMENT_STATUS.DELAYED && stage.key === SHIPMENT_STATUS.IN_TRANSIT ? ' (Delayed)' : ''}
                </div>
                {idx < arr.length - 1 && (
                  <div className={`w-6 h-px mx-0.5 ${isCompleted ? 'bg-[#0B4A3D]/30' : 'bg-slate-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SHIPMENT SUMMARY ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Shipment Summary</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4">
          <div>
            <div className={LABEL}>Shipment No</div>
            <div className={`${VALUE} mt-0.5`}>{item.shipmentNo}</div>
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
            <div className={LABEL}>Packing No</div>
            <div className="mt-0.5">
              {item.packingNo ? (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/logistics/manufacturing/${item.packingNo}`)}
                  className={`${VALUE} text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer`}
                >
                  {item.packingNo}
                </button>
              ) : (
                <span className={VALUE}>—</span>
              )}
            </div>
          </div>
          <div>
            <div className={LABEL}>Vendor</div>
            <div className={`${VALUE} mt-0.5`}>{item.vendor || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Carrier</div>
            <div className={`${VALUE} mt-0.5`}>{item.carrier || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Transport Mode</div>
            <div className="mt-0.5">
              <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">{item.mode}</span>
            </div>
          </div>
          <div>
            <div className={LABEL}>Tracking No</div>
            <div className={`${VALUE} mt-0.5 font-mono`}>{item.trackingNo || '—'}</div>
          </div>
        </div>
      </div>

      {/* ── DISPATCH DETAILS ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Dispatch Details</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4">
          <div>
            <div className={LABEL}>Dispatch Date</div>
            <div className={`${VALUE} mt-0.5`}>{item.dispatchDate ? formatDate(item.dispatchDate) : '—'}</div>
          </div>
          <div>
            <div className={LABEL}>ETD (Est. Departure)</div>
            <div className={`${VALUE} mt-0.5`}>{item.etd ? formatDate(item.etd) : '—'}</div>
          </div>
          <div>
            <div className={LABEL}>ETA (Est. Arrival)</div>
            <div className={`${VALUE} mt-0.5`}>{item.eta ? formatDate(item.eta) : '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Destination</div>
            <div className={`${VALUE} mt-0.5`}>{item.destination || '—'}</div>
          </div>
          {item.receivedOn && (
            <div>
              <div className={LABEL}>Received On</div>
              <div className={`${VALUE} mt-0.5`}>{formatDate(item.receivedOn)}</div>
            </div>
          )}
          {item.notes && (
            <div className="sm:col-span-4">
              <div className={LABEL}>Notes</div>
              <div className={`${VALUE} mt-0.5`}>{item.notes}</div>
            </div>
          )}
        </div>
      </div>

      {/* ── NEXT STEP ── */}
      {item.status === SHIPMENT_STATUS.IN_TRANSIT && (
        <div className="rounded-xl border border-blue-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-blue-700">In Transit</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Shipment is on its way to {item.destination || 'destination'}.
                {item.eta ? ` Expected arrival: ${formatDate(item.eta)}.` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/purchase/logistics/shipment')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => navigate('/purchase/logistics/grn')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Create GRN <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {item.status === SHIPMENT_STATUS.DELIVERED && (
        <div className="rounded-xl border border-emerald-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-700">Delivered</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Shipment has been delivered{item.destination ? ` to ${item.destination}` : ''}.
                {item.receivedOn ? ` Received on ${formatDate(item.receivedOn)}.` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/shipment')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Back to List
            </button>
          </div>
        </div>
      )}

      {item.status === SHIPMENT_STATUS.PENDING && (
        <div className="rounded-xl border border-amber-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-700">Pending Dispatch</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Awaiting dispatch. {item.etd ? `ETD: ${formatDate(item.etd)}.` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/shipment')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Back to List
            </button>
          </div>
        </div>
      )}

      {item.status === SHIPMENT_STATUS.DELAYED && (
        <div className="rounded-xl border border-rose-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-rose-600">Delayed</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Shipment has been delayed.
                {item.eta ? ` Revised ETA: ${formatDate(item.eta)}.` : ''}
                {item.notes ? ` ${item.notes}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/shipment')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Back to List
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVITY / TIMELINE ── */}
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
