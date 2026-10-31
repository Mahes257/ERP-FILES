/**
 * purchase/pages/logistics/InspectionDetail.jsx
 * ------------------------------------------------------------------
 * Inspection Detail — shows a single inspection with GRN info, PO
 * info, items with quantities, inspection checklist, results, and
 * activity history.
 *
 * Route: /purchase/logistics/quality/:inspectionNo
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../components/ui';
import {
  ArrowDownToLine, CheckCircle2, ChevronLeft, ClipboardCheck,
  Edit3, FileSearch, Loader2, Play, RefreshCw, XCircle
} from 'lucide-react';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { logisticsService, INSPECTION_STATUS } from '../../services/logistics';
import { formatDateTime, formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function InspectionDetail() {
  const navigate = useNavigate();
  const { inspectionNo } = useParams();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const toast = useToast();
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await logisticsService.getInspectionById(inspectionNo);
      if (!data) { setNotFound(true); return; }
      setItem(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [inspectionNo]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  /* ── Start Inspection action ── */
  const [starting, setStarting] = useState(false);
  const handleStartInspection = async () => {
    setStarting(true);
    try {
      await logisticsService.startInspection(item.id);
      toast.success(`${item.inspectionNo} inspection started`);
      load();
    } catch (err) {
      toast.error(err?.message || 'Failed to start inspection');
    } finally {
      setStarting(false);
    }
  };

  const totalReceived = (item?.items || []).reduce((sum, i) => sum + (Number(i.receivedQty) || 0), 0);
  const totalInspected = (item?.items || []).reduce((sum, i) => sum + (Number(i.inspectedQty) || 0), 0);
  const totalAccepted = (item?.items || []).reduce((sum, i) => sum + (Number(i.acceptedQty) || 0), 0);
  const totalRejected = (item?.items || []).reduce((sum, i) => sum + (Number(i.rejectedQty) || 0), 0);

  const activity = useMemo(() => {
    if (!item) return [];
    const events = [];
    if (item.createdAt) events.push({ time: item.createdAt, label: 'Inspection created', icon: ClipboardCheck, color: '#0A4F44' });
    if (item.status !== INSPECTION_STATUS.PENDING && item.inspectedOn) {
      events.push({ time: item.inspectedOn, label: 'Inspection completed', icon: CheckCircle2, color: '#16a34a' });
    }
    if (item.status === INSPECTION_STATUS.FAILED && item.inspectedOn) {
      events.push({ time: item.inspectedOn, label: 'Goods rejected — return or scrap', icon: XCircle, color: '#dc2626' });
    }
    if (item.postedAt) {
      events.push({ time: item.postedAt, label: 'Accepted quantity posted to inventory', icon: ArrowDownToLine, color: '#7c3aed' });
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
          <p className="text-sm font-bold text-slate-700">Inspection not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been removed or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/logistics/quality')}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to Inspections
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
          { label: 'Quality Inspection', to: '/purchase/logistics/quality' },
          { label: item.inspectionNo }
        ]}
        icon={ClipboardCheck}
        title="Inspection Detail"
        subtitle={`${item.inspectionNo} — ${item.vendor || ''}`}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/logistics/quality')} className="btn btn-ghost btn-sm">
              <ChevronLeft size={12} /> Back to List
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
      />

      {/* ── INSPECTION HEADER ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Inspection Information</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4">
          <div>
            <div className={LABEL}>Inspection No</div>
            <div className={`${VALUE} mt-0.5`}>{item.inspectionNo}</div>
          </div>
          <div>
            <div className={LABEL}>Status</div>
            <div className="mt-0.5"><PurchaseStatusBadge status={item.status} /></div>
          </div>
          <div>
            <div className={LABEL}>GRN No</div>
            <div className="mt-0.5">
              {item.grnNo ? (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/logistics/grn/${item.grnNo}`)}
                  className={`${VALUE} text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer`}
                >
                  {item.grnNo}
                </button>
              ) : <span className={VALUE}>—</span>}
            </div>
          </div>
          <div>
            <div className={LABEL}>PO No</div>
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
            <div className={LABEL}>Inspector</div>
            <div className={`${VALUE} mt-0.5`}>{item.inspector || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Inspection Date</div>
            <div className={`${VALUE} mt-0.5`}>{item.inspectedOn ? formatDate(item.inspectedOn) : '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Defects</div>
            <div className={`${VALUE} mt-0.5`}>
              <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
                item.defects > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-700'
              }`}>{item.defects}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── ITEMS ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Items</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                <th className="px-5 py-2.5 text-left font-bold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Received Qty</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Inspected Qty</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Accepted Qty</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Rejected Qty</th>
              </tr>
            </thead>
            <tbody>
              {(item.items || []).map((line, idx) => (
                <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/40">
                  <td className="px-5 py-3 font-semibold text-slate-800">{line.product}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{line.receivedQty}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-600">{line.inspectedQty}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-bold text-emerald-700">{line.acceptedQty}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-semibold ${line.rejectedQty > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {line.rejectedQty}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80 font-bold">
                <td className="px-5 py-3 text-slate-700">Total</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">{totalReceived}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">{totalInspected}</td>
                <td className="px-5 py-3 text-right tabular-nums text-emerald-700">{totalAccepted}</td>
                <td className={`px-5 py-3 text-right tabular-nums ${totalRejected > 0 ? 'text-rose-600' : 'text-slate-700'}`}>{totalRejected}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── INSPECTION RESULTS ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Inspection Results</h3>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3 text-center">
              <div className={LABEL}>Total Received</div>
              <div className="text-xl font-extrabold text-slate-800 mt-1 tabular-nums">{totalReceived}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-center">
              <div className={LABEL}>Accepted</div>
              <div className="text-xl font-extrabold text-emerald-700 mt-1 tabular-nums">{totalAccepted}</div>
            </div>
            <div className={`rounded-lg border px-4 py-3 text-center ${totalRejected > 0 ? 'border-rose-100 bg-rose-50/40' : 'border-slate-100 bg-slate-50/60'}`}>
              <div className={LABEL}>Rejected</div>
              <div className={`text-xl font-extrabold mt-1 tabular-nums ${totalRejected > 0 ? 'text-rose-700' : 'text-slate-800'}`}>{totalRejected}</div>
            </div>
          </div>
          {totalReceived > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.round((totalAccepted / totalReceived) * 100))}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-600 tabular-nums w-10 text-right">
                {Math.round((totalAccepted / totalReceived) * 100)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── NOTES ── */}
      {item.notes && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Notes</h3>
          </div>
          <div className="px-5 py-4">
            <p className="text-xs text-slate-700">{item.notes}</p>
          </div>
        </div>
      )}

      {/* ── NEXT STEP ── */}
      {item.status === INSPECTION_STATUS.PENDING && (
        <div className="rounded-xl border border-sky-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-sky-700">Awaiting Inspection</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Start the inspection to record results per item.
              </p>
            </div>
            <button
              type="button"
              onClick={handleStartInspection}
              disabled={starting}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            >
              {starting ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />} {starting ? 'Starting...' : 'Start Inspection'}
            </button>
          </div>
        </div>
      )}

      {item.status === INSPECTION_STATUS.IN_PROGRESS && (
        <div className="rounded-xl border border-amber-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-amber-700">Inspection In Progress</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Record pass, fail, or partial accept results.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/quality')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <Edit3 size={12} /> Record Result
            </button>
          </div>
        </div>
      )}

      {(item.status === INSPECTION_STATUS.PASSED || item.status === INSPECTION_STATUS.PARTIALLY_ACCEPTED) && (
        <div className="rounded-xl border border-emerald-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-700">
                {item.status === INSPECTION_STATUS.PASSED ? 'Inspection Passed' : 'Partially Accepted'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {item.postedAt
                  ? 'Accepted quantity has been posted to inventory.'
                  : 'Accepted quantity is eligible for inventory posting.'}
              </p>
            </div>
            {!item.postedAt ? (
              <button
                type="button"
                onClick={async () => {
                  setPosting(true);
                  try {
                    const result = await logisticsService.postInventoryFromInspection(item.id, {
                      warehouse: item.warehouse || 'Main Store',
                      updatedBy: 'Stores Team'
                    });
                    if (result && result.length > 0) {
                      /* Navigate to the first inventory posting record */
                      navigate(`/purchase/logistics/inventory/${result[0].id}`);
                    } else {
                      navigate('/purchase/logistics/inventory');
                    }
                  } catch (err) {
                    toast.error(err?.message || 'Failed to post to inventory');
                  } finally {
                    setPosting(false);
                  }
                }}
                disabled={posting}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-50"
              >
                {posting ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <ArrowDownToLine size={12} />
                )}
                {posting ? 'Posting...' : 'Post to Inventory'}
              </button>
            ) : (
              <button
                type="button"
                onClick={async () => {
                  const records = await logisticsService.getInventoryByInspectionNo(item.inspectionNo);
                  if (records && records.length > 0) {
                    navigate(`/purchase/logistics/inventory/${records[0].id}`);
                  } else {
                    navigate('/purchase/logistics/inventory');
                  }
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0B4A3D] bg-[#EDF7F4] hover:bg-[#E8F0EE] border border-[#BFE0D6] px-5 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
              >
                <ArrowDownToLine size={12} /> View Inventory Update
              </button>
            )}
          </div>
        </div>
      )}

      {item.status === INSPECTION_STATUS.FAILED && (
        <div className="rounded-xl border border-rose-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-rose-700">Inspection Failed</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Rejected goods will not be added to usable stock. Arrange return or scrap.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/quality')}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Back to List
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVITY ── */}
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
