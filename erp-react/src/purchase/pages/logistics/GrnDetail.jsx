/**
 * purchase/pages/logistics/GrnDetail.jsx
 * ------------------------------------------------------------------
 * GRN Detail — shows a single GRN with PO info, shipment, vendor,
 * items with quantities, inspection status, documents, and activity.
 *
 * Route: /purchase/logistics/grn/:grnNo
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, CheckCircle2, ChevronLeft, Clock3, FileSearch, LayoutDashboard, Loader2,
  PackageCheck, Pencil, Printer, Receipt, RefreshCw, Send, Truck, ClipboardCheck
} from 'lucide-react';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import { logisticsService, GRN_STATUS } from '../../services/logistics';
import { ConfirmDialog, useToast } from '../../components/ui';
import { invoiceCoverage } from '../../services/invoice';
import { formatAmount } from '../../utils/purchase';
import { formatDateTime, formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';
const VALUE = 'text-xs font-semibold text-slate-800';

/* ─────────────────────────────────────────────────────────────────
 * GrnWorkflowPipeline — visual GRN lifecycle stages
 * ───────────────────────────────────────────────────────────────── */
const GRN_WORKFLOW_STAGES = [
  { key: 'Expected', label: 'Expected', icon: Truck },
  { key: 'Received', label: 'Received', icon: PackageCheck },
  { key: 'Pending Inspection', label: 'Inspection', icon: ClipboardCheck },
  { key: 'Completed', label: 'Completed', icon: CheckCircle2 },
];

function GrnWorkflowPipeline({ status }) {
  const currentIdx = GRN_WORKFLOW_STAGES.findIndex((s) => s.key === status);
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-3 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Truck className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">Receipt Workflow</span>
      </div>
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {GRN_WORKFLOW_STAGES.map((stage, idx) => {
          const Icon = stage.icon;
          const isCompleted = currentIdx >= 0 && idx < currentIdx;
          const isCurrent = stage.key === status;
          return (
            <div key={stage.key} className="flex items-center flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                isCurrent
                  ? 'bg-[#0B4A3D] text-white shadow-sm'
                  : isCompleted
                    ? 'bg-[#EDF7F4] text-[#0B4A3D] border border-[#0B4A3D]/20'
                    : 'bg-slate-50 text-slate-400 border border-slate-100'
              }`}>
                <Icon className="w-3 h-3" />
                {stage.label}
              </div>
              {idx < GRN_WORKFLOW_STAGES.length - 1 && (
                <div className={`w-6 h-px mx-0.5 ${isCompleted ? 'bg-[#0B4A3D]/30' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main Component                                                   */
/* ═══════════════════════════════════════════════════════════════════ */
export default function GrnDetail() {
  const navigate = useNavigate();
  const { grnNo } = useParams();

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const data = await logisticsService.getGrnById(grnNo);
      if (!data) { setNotFound(true); return; }
      setItem(data);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [grnNo]);

  useEffect(() => { queueMicrotask(load); }, [load]);

  const toast = useToast();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiving, setReceiving] = useState(false);

  /* ─── Receive Goods ───
     The GRN list collects per-line quantities in a modal; the detail page has
     no line editor, so it confirms the receipt as a whole and receives each
     line for its outstanding (pending) quantity — the same default the list
     modal pre-fills. Both entry points post through the same service call. */
  const handleReceive = useCallback(async () => {
    if (!item) return;
    const items = (item.items || []).map((line) => ({
      product: line.product,
      received: Number(line.pending ?? line.qty) || 0
    }));
    setReceiving(true);
    try {
      await logisticsService.receiveGoods(item.id, items);
      toast.success(`${item.grnNo} goods received`);
      setReceiveOpen(false);
      await load();
    } catch (error) {
      toast.error(error?.message || 'Failed to receive goods');
    } finally {
      setReceiving(false);
    }
  }, [item, toast, load]);

  const ordered = item?.items?.reduce((sum, i) => sum + (Number(i.qty) || 0), 0) || 0;
  const received = item?.items?.reduce((sum, i) => sum + (Number(i.received) || 0), 0) || 0;
  const balance = Math.max(0, ordered - received);

  const coverage = invoiceCoverage({ poNo: item?.poNo || '', grnNo: item?.grnNo || '' });
  const canInvoice = item?.status !== GRN_STATUS.EXPECTED && received > 0;

  const activity = useMemo(() => {
    if (!item) return [];
    const events = [];
    if (item.createdAt) events.push({ time: item.createdAt, label: 'GRN created', icon: PackageCheck, color: '#0A4F44' });
    if (item.status === GRN_STATUS.RECEIVED || item.status === GRN_STATUS.PENDING_INSPECTION) {
      events.push({ time: item.receivedAt || item.receivedOn, label: 'Goods received', icon: CheckCircle2, color: '#16a34a' });
    }
    if (item.status === GRN_STATUS.PENDING_INSPECTION) {
      events.push({ time: item.receivedOn, label: 'Sent to inspection', icon: Send, color: '#0ea5e9' });
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
          <p className="text-sm font-bold text-slate-700">GRN not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been removed or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/logistics/grn')}
            className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <ChevronLeft size={14} /> Back to GRN List
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
          { label: 'Goods Receipt (GRN)', to: '/purchase/logistics/grn' },
          { label: item.grnNo }
        ]}
        icon={PackageCheck}
        title="Goods Receipt Detail"
        subtitle={`${item.grnNo} — ${item.vendor || ''}`}
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/logistics/grn')} className="btn btn-ghost btn-sm">
              <ChevronLeft size={12} /> Back to List
            </button>
            {item.status === GRN_STATUS.EXPECTED && (
              <button type="button" onClick={() => navigate(`/purchase/logistics/grn/${item.grnNo}/edit`)} className="btn btn-ghost btn-sm">
                <Pencil size={12} /> Edit
              </button>
            )}
            <button type="button" onClick={() => navigate(`/purchase/logistics/grn/${item.grnNo}/360`)} className="btn btn-ghost btn-sm">
              <LayoutDashboard size={12} /> 360° View
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>
              <RefreshCw size={12} /> Refresh
            </button>
            <button type="button" onClick={() => navigate(`/purchase/logistics/grn/${item.grnNo}/print`)} className="btn btn-ghost btn-sm">
              <Printer size={12} /> Print
            </button>
          </>
        }
      />

      {/* ── GRN WORKFLOW PIPELINE ── */}
      <GrnWorkflowPipeline status={item.status} />

      {/* ── GRN HEADER ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">GRN Information</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4">
          <div>
            <div className={LABEL}>GRN No</div>
            <div className={`${VALUE} mt-0.5`}>{item.grnNo}</div>
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
            <div className={LABEL}>Shipment No</div>
            <div className="mt-0.5">
              {item.shipmentNo ? (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/logistics/shipment/${item.shipmentNo}`)}
                  className={`${VALUE} text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer`}
                >
                  {item.shipmentNo}
                </button>
              ) : <span className={VALUE}>—</span>}
            </div>
          </div>
          <div>
            <div className={LABEL}>Vendor</div>
            <div className={`${VALUE} mt-0.5`}>{item.vendor || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Received Date</div>
            <div className={`${VALUE} mt-0.5`}>{item.receivedOn ? formatDate(item.receivedOn) : '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Warehouse</div>
            <div className={`${VALUE} mt-0.5`}>{item.warehouse || '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Created</div>
            <div className={`${VALUE} mt-0.5`}>{item.createdAt ? formatDate(item.createdAt) : '—'}</div>
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
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Ordered Qty</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Previously Received</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Current Receipt</th>
                <th className="px-5 py-2.5 text-right font-bold text-slate-500 uppercase tracking-wider">Balance</th>
                <th className="px-5 py-2.5 text-center font-bold text-slate-500 uppercase tracking-wider w-[140px]">Progress</th>
              </tr>
            </thead>
            <tbody>
              {(item.items || []).map((line, idx) => {
                const lineBalance = Math.max(0, (Number(line.qty) || 0) - (Number(line.received) || 0));
                const lineOrdered = Number(line.qty) || 0;
                const lineReceived = Number(line.received) || 0;
                const linePct = lineOrdered > 0 ? Math.round((lineReceived / lineOrdered) * 100) : 0;
                return (
                  <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50/40">
                    <td className="px-5 py-3 font-semibold text-slate-800">{line.product}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">{line.qty}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-600">
                      {item.status === GRN_STATUS.EXPECTED ? '0' : line.received}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-bold text-slate-800">
                      {item.status === GRN_STATUS.EXPECTED ? '—' : line.received}
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold ${lineBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {lineBalance}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${linePct >= 100 ? 'bg-emerald-500' : linePct > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                            style={{ width: `${Math.min(100, linePct)}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold tabular-nums w-8 text-right text-slate-500">{linePct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50/80 font-bold">
                <td className="px-5 py-3 text-slate-700">Total</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">{ordered}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                  {item.status === GRN_STATUS.EXPECTED ? '0' : received}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-800">
                  {item.status === GRN_STATUS.EXPECTED ? '—' : received}
                </td>
                <td className={`px-5 py-3 text-right tabular-nums ${balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {balance}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${ordered > 0 && received >= ordered ? 'bg-emerald-500' : received > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                        style={{ width: `${ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums w-8 text-right text-slate-500">
                      {ordered > 0 ? Math.round((received / ordered) * 100) : 0}%
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ── QUANTITY SUMMARY ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Quantity Summary</h3>
        </div>
        <div className="px-5 py-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-4 py-3 text-center">
              <div className={LABEL}>Ordered Qty</div>
              <div className="text-xl font-extrabold text-slate-800 mt-1 tabular-nums">{ordered}</div>
            </div>
            <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-center">
              <div className={LABEL}>Received Qty</div>
              <div className="text-xl font-extrabold text-emerald-700 mt-1 tabular-nums">{received}</div>
            </div>
            <div className={`rounded-lg border px-4 py-3 text-center ${balance === 0 ? 'border-emerald-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/40'}`}>
              <div className={LABEL}>Balance Qty</div>
              <div className={`text-xl font-extrabold mt-1 tabular-nums ${balance === 0 ? 'text-emerald-700' : 'text-amber-700'}`}>{balance}</div>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${received >= ordered ? 'bg-emerald-500' : received > 0 ? 'bg-amber-500' : 'bg-slate-300'}`}
                  style={{ width: `${ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0}%` }}
                />
              </div>
              <span className="text-xs font-bold text-slate-600 tabular-nums w-10 text-right">
                {ordered > 0 ? Math.round((received / ordered) * 100) : 0}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── INSPECTION STATUS ── */}
      {(item.status === GRN_STATUS.RECEIVED || item.status === GRN_STATUS.PENDING_INSPECTION) && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Inspection Status</h3>
          </div>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                item.status === GRN_STATUS.PENDING_INSPECTION ? 'bg-sky-50' : 'bg-emerald-50'
              }`}>
                {item.status === GRN_STATUS.PENDING_INSPECTION ? (
                  <Clock3 size={16} className="text-sky-600" />
                ) : (
                  <CheckCircle2 size={16} className="text-emerald-600" />
                )}
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">
                  {item.status === GRN_STATUS.PENDING_INSPECTION ? 'Awaiting Inspection' : 'Inspection Complete'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {item.status === GRN_STATUS.PENDING_INSPECTION
                    ? 'Goods are pending quality inspection.'
                    : 'Quality inspection has been completed.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── INVOICE STATUS ── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0A4F44]">Invoice Status</h3>
          {coverage.invoices.length > 0 ? (
            <button
              type="button"
              onClick={() => navigate(`/purchase/invoices/${coverage.invoices[0]}`)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Receipt size={13} /> View Invoice
            </button>
          ) : canInvoice ? (
            <button
              type="button"
              onClick={() => navigate(`/purchase/invoices/new?grn=${encodeURIComponent(item.grnNo)}&po=${encodeURIComponent(item.poNo)}`)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
            >
              <Receipt size={13} /> Create Invoice
            </button>
          ) : null}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 px-5 py-4">
          <div>
            <div className={LABEL}>Status</div>
            <div className="mt-0.5">
              {coverage.status === 'Not Invoiced' ? (
                <span className="text-xs font-bold text-slate-600">Not Invoiced</span>
              ) : (
                <PurchaseStatusBadge status={coverage.status} />
              )}
            </div>
          </div>
          <div>
            <div className={LABEL}>Invoice No</div>
            <div className="mt-0.5">
              {coverage.invoices.length > 0 ? (
                <button
                  type="button"
                  onClick={() => navigate(`/purchase/invoices/${coverage.invoices[0]}`)}
                  className={`${VALUE} text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer`}
                >
                  {coverage.invoices[0]}
                  {coverage.invoices.length > 1 ? ` +${coverage.invoices.length - 1} more` : ''}
                </button>
              ) : <span className={VALUE}>—</span>}
            </div>
          </div>
          <div>
            <div className={LABEL}>Invoice Amount</div>
            <div className={`${VALUE} mt-0.5`}>{coverage.amount > 0 ? formatAmount(coverage.amount, 'INR') : '—'}</div>
          </div>
          <div>
            <div className={LABEL}>Paid</div>
            <div className={`${VALUE} mt-0.5`}>{coverage.paid > 0 ? formatAmount(coverage.paid, 'INR') : '—'}</div>
          </div>
        </div>
      </div>

      {/* ── NEXT STEP ── */}
      {item.status === GRN_STATUS.EXPECTED && (
        <div className="rounded-xl border border-sky-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-sky-700">Ready to Receive</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Post a goods receipt to update PO delivery status and open inspection.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReceiveOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              Receive Goods <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={receiveOpen}
        title={`Receive Goods — ${item.grnNo}`}
        message={`Post the goods receipt for ${item.grnNo} and open quality inspection?`}
        confirmLabel="Post Receipt"
        variant="default"
        icon={PackageCheck}
        loading={receiving}
        onConfirm={handleReceive}
        onCancel={() => setReceiveOpen(false)}
      />

      {item.status === GRN_STATUS.PENDING_INSPECTION && (
        <div className="rounded-xl border border-sky-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-sky-700">Pending Quality Inspection</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Goods have been received. Send to inspection or view the inspection record.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => navigate('/purchase/logistics/grn')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                Back to List
              </button>
              <button
                type="button"
                onClick={() => navigate('/purchase/logistics/quality')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-5 py-2.5 rounded-lg transition-colors cursor-pointer"
              >
                <Send size={12} /> Send to Inspection
              </button>
            </div>
          </div>
        </div>
      )}

      {item.status === GRN_STATUS.RECEIVED && (
        <div className="rounded-xl border border-emerald-200 bg-white px-5 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-700">Inspection Complete</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Goods have been received and inspected. Ready for inventory posting.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/purchase/logistics/grn')}
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
