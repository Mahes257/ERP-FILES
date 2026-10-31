import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Factory,
  LayoutGrid,
  List,
  Minus,
  Plus,
  Trash2
} from 'lucide-react';
import { Modal, SelectInput } from '../Common';
import { formatDate } from '../../utils/leadHelpers';
import { cpoNo } from '../../utils/salesHelpers';
import salesOrderService from '../../services/salesOrderService';

const STAGE_ORDER = ['INTERNAL_PO_RELEASED', 'PRODUCTION_SOURCING', 'PACKING', 'ASSEMBLY', 'DISPATCHED'];

const STAGE_LABELS = {
  INTERNAL_PO_RELEASED: 'Internal PO Released',
  PRODUCTION_SOURCING: 'Production / Sourcing',
  PACKING: 'Packing',
  ASSEMBLY: 'Assembly',
  DISPATCHED: 'Dispatched'
};

const STAGE_COLUMNS = ['PRODUCTION_SOURCING', 'PACKING', 'ASSEMBLY', 'DISPATCHED', 'INTERNAL_PO_RELEASED'];

const TYPE_FILTERS = [
  { key: 'ALL', label: 'All' },
  { key: 'INTERNAL', label: 'Internal' },
  { key: 'EXTERNAL', label: 'External' }
];

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

const todayStr = () => new Date().toISOString().slice(0, 10);

function pad(n) {
  return String(n).padStart(2, '0');
}

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Map a REAL Sales Order (Customer Purchase Order) from the /sales-orders API
 * into the Production Timeline record shape. Real CPOs (e.g. created by
 * Quotation → CPO conversion) must show up in the timeline alongside the demo
 * records — this is what makes a converted quotation appear in the CPO list.
 * The SO workflow status maps onto the production stage it implies:
 *   draft → Internal PO Released (customer PO received, production may start)
 *   pending review / in progress → Production / Sourcing
 *   approved → Packing
 *   completed → Dispatched
 * Cancelled orders are excluded (they are not in production).
 */
function soToTimeline(so) {
  if (!so || !so.soNo) return null;
  const released = String(so.orderDate || so.date || so.createdAt || '').slice(0, 10) || todayStr();
  const statusKey = String(so.status || '').toLowerCase();
  let currentStatus;
  if (statusKey === 'completed') currentStatus = 'DISPATCHED';
  else if (statusKey === 'approved') currentStatus = 'PACKING';
  else if (statusKey === 'in progress' || statusKey === 'pending review') currentStatus = 'PRODUCTION_SOURCING';
  else currentStatus = 'INTERNAL_PO_RELEASED';
  // Real CPOs carry no production due date; default to a week after release so
  // the timeline's due/overdue logic stays meaningful.
  const due = new Date(`${released}T00:00:00`);
  due.setDate(due.getDate() + 7);
  const dueDate = `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}`;
  return {
    id: `so-${so.id}`,
    customerName: so.clientName || so.leadNo || '—',
    soNo: so.soNo,
    poNumber: so.soNo,
    poReleasedDate: released,
    dueDate,
    type: 'INTERNAL',
    currentStatus,
    qtnRef: so.qtnRef || '',
    real: true
  };
}

function buildDummyOrders() {
  const rows = [
    // Rich demo records — keep every Kanban stage populated across divisions.
    { customerName: 'Acme Steel Works', scNo: 'SC-2026-000011', soNo: 'SO-2026-000020', poNumber: 'INT-2026-001', poReleasedDate: dateOffset(-18), dueDate: dateOffset(-3), type: 'INTERNAL', currentStatus: 'PACKING' },
    { customerName: 'Nova Fabrication', scNo: 'SC-2026-000012', soNo: 'SO-2026-000019', poNumber: 'INT-2026-002', poReleasedDate: dateOffset(-15), dueDate: dateOffset(6), type: 'INTERNAL', currentStatus: 'PRODUCTION_SOURCING' },
    { customerName: 'Orbit Textiles', scNo: 'SC-2026-000013', soNo: 'SO-2026-000018', poNumber: 'EXT-BN-2026-114', poReleasedDate: dateOffset(-22), dueDate: dateOffset(-8), type: 'EXTERNAL', currentStatus: 'ASSEMBLY' },
    { customerName: 'Vertex Auto Components', scNo: 'SC-2026-000014', soNo: 'SO-2026-000017', poNumber: 'EXT-BN-2026-118', poReleasedDate: dateOffset(-10), dueDate: dateOffset(12), type: 'EXTERNAL', currentStatus: 'PACKING' },
    { customerName: 'Summit Hydraulics', scNo: 'SC-2026-000015', soNo: 'SO-2026-000016', poNumber: 'INT-2026-003', poReleasedDate: dateOffset(-28), dueDate: dateOffset(-1), type: 'INTERNAL', currentStatus: 'INTERNAL_PO_RELEASED' },
    { customerName: 'Phoenix Packaging', scNo: 'SC-2026-000016', soNo: 'SO-2026-000015', poNumber: 'EXT-BN-2026-121', poReleasedDate: dateOffset(-5), dueDate: dateOffset(9), type: 'EXTERNAL', currentStatus: 'PRODUCTION_SOURCING' },
    { customerName: 'Delta Power Systems', scNo: 'SC-2026-000017', soNo: 'SO-2026-000014', poNumber: 'INT-2026-004', poReleasedDate: dateOffset(-40), dueDate: dateOffset(-14), type: 'INTERNAL', currentStatus: 'DISPATCHED' },
    { customerName: 'Keystone Builders', scNo: 'SC-2026-000018', soNo: 'SO-2026-000013', poNumber: 'EXT-BN-2026-125', poReleasedDate: dateOffset(-20), dueDate: dateOffset(4), type: 'EXTERNAL', currentStatus: 'INTERNAL_PO_RELEASED' },
    { customerName: 'Lumina Electronics', scNo: 'SC-2026-000019', soNo: 'SO-2026-000012', poNumber: 'INT-2026-005', poReleasedDate: dateOffset(-12), dueDate: dateOffset(2), type: 'INTERNAL', currentStatus: 'INTERNAL_PO_RELEASED' },
    { customerName: 'Sterling AgroTech', scNo: 'SC-2026-000020', soNo: 'SO-2026-000011', poNumber: 'EXT-BN-2026-129', poReleasedDate: dateOffset(-34), dueDate: dateOffset(-17), type: 'EXTERNAL', currentStatus: 'DISPATCHED' },
    { customerName: 'Meridian Turbines', scNo: 'SC-2026-000021', soNo: 'SO-2026-000010', poNumber: 'EXT-BN-2026-131', poReleasedDate: dateOffset(-8), dueDate: dateOffset(15), type: 'EXTERNAL', currentStatus: 'ASSEMBLY' },
    { customerName: 'Vanguard Railways', scNo: 'SC-2026-000022', soNo: 'SO-2026-000009', poNumber: 'INT-2026-006', poReleasedDate: dateOffset(-25), dueDate: dateOffset(-5), type: 'INTERNAL', currentStatus: 'PACKING' },
    // === Spec sample records — INTERNAL (SO section 6) ===
    { customerName: 'Acme Trading', scNo: 'SC-2026-000001', soNo: 'SO-2026-000010', poNumber: 'PO-2026-001', poReleasedDate: dateOffset(-4), dueDate: dateOffset(7), type: 'INTERNAL', currentStatus: 'INTERNAL_PO_RELEASED' },
    { customerName: 'Global Industries', scNo: 'SC-2026-000002', soNo: 'SO-2026-000009', poNumber: 'PO-2026-002', poReleasedDate: dateOffset(-3), dueDate: dateOffset(8), type: 'INTERNAL', currentStatus: 'PRODUCTION_SOURCING' },
    { customerName: 'Prime Industries', scNo: 'SC-2026-000003', soNo: 'SO-2026-000008', poNumber: 'PO-2026-003', poReleasedDate: dateOffset(-2), dueDate: dateOffset(10), type: 'INTERNAL', currentStatus: 'PACKING' },
    { customerName: 'ABC Manufacturing', scNo: 'SC-2026-000004', soNo: 'SO-2026-000007', poNumber: 'PO-2026-004', poReleasedDate: dateOffset(-1), dueDate: dateOffset(12), type: 'INTERNAL', currentStatus: 'ASSEMBLY' },
    { customerName: 'XYZ Industries', scNo: 'SC-2026-000005', soNo: 'SO-2026-000006', poNumber: 'PO-2026-005', poReleasedDate: dateOffset(-5), dueDate: dateOffset(4), type: 'INTERNAL', currentStatus: 'DISPATCHED' },
    // === Spec sample records — EXTERNAL (SO section 6) ===
    { customerName: 'Acme Trading', scNo: 'SC-2026-000006', soNo: 'SO-2026-000005', poNumber: 'PO-EXT-2026-001', poReleasedDate: dateOffset(-4), dueDate: dateOffset(5), type: 'EXTERNAL', currentStatus: 'PRODUCTION_SOURCING' },
    { customerName: 'Global Industries', scNo: 'SC-2026-000007', soNo: 'SO-2026-000004', poNumber: 'PO-EXT-2026-002', poReleasedDate: dateOffset(-3), dueDate: dateOffset(7), type: 'EXTERNAL', currentStatus: 'PACKING' },
    { customerName: 'Prime Industries', scNo: 'SC-2026-000008', soNo: 'SO-2026-000003', poNumber: 'PO-EXT-2026-003', poReleasedDate: dateOffset(-2), dueDate: dateOffset(9), type: 'EXTERNAL', currentStatus: 'ASSEMBLY' },
    { customerName: 'ABC Manufacturing', scNo: 'SC-2026-000009', soNo: 'SO-2026-000002', poNumber: 'PO-EXT-2026-004', poReleasedDate: dateOffset(-1), dueDate: dateOffset(11), type: 'EXTERNAL', currentStatus: 'INTERNAL_PO_RELEASED' },
    { customerName: 'XYZ Industries', scNo: 'SC-2026-000010', soNo: 'SO-2026-000001', poNumber: 'PO-EXT-2026-005', poReleasedDate: dateOffset(-6), dueDate: dateOffset(3), type: 'EXTERNAL', currentStatus: 'DISPATCHED' }
  ];
  return rows.map((r, i) => ({ ...r, id: `po-${i + 1}` }));
}

function stageStatus(order, stageKey) {
  const current = STAGE_ORDER.indexOf(order.currentStatus);
  const target = STAGE_ORDER.indexOf(stageKey);
  if (target < current) return 'done';
  if (target === current) return 'current';
  return 'future';
}

function StageMark({ order, stageKey }) {
  const status = stageStatus(order, stageKey);
  if (status === 'done') return <Check className="w-3.5 h-3.5 text-[#059669]" />;
  if (status === 'current') return <span className="w-3 h-3 rounded-full bg-[#0B4A3D] border-2 border-[#0B4A3D]" />;
  return <span className="w-3 h-3 rounded-full border-2 border-slate-200" />;
}

function OverdueBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-rose-600 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5 whitespace-nowrap">
      <AlertTriangle className="w-3 h-3" /> Overdue
    </span>
  );
}

export default function ProductionTimeline({
  docNoKey = 'poNumber',
  docNoLabel = 'PO Number',
  secondaryNoKey = null,
  secondaryNoLabel = null,
  soNoKey = null,
  soNoLabel = 'CPO Number'
}) {
  const [orders, setOrders] = useState(buildDummyOrders);

  // Load the REAL sales orders (Customer Purchase Orders) so converted CPOs —
  // e.g. from Quotation → Customer Purchase Order — actually appear here. Real
  // records replace colliding sample rows (soNo is the identity); the demo
  // rows that don't collide are kept so the timeline stays populated.
  useEffect(() => {
    let cancelled = false;
    salesOrderService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const content = Array.isArray(res?.content)
          ? res.content
          : Array.isArray(res?.data?.content)
            ? res.data.content
            : Array.isArray(res?.data)
              ? res.data
              : [];
        const real = content.map(soToTimeline).filter(Boolean);
        if (real.length === 0) return;
        setOrders((prev) => {
          const realNos = new Set(real.map((r) => r.soNo));
          const samples = prev.filter((o) => !realNos.has(o.soNo));
          return [...real, ...samples];
        });
      })
      .catch(() => {
        // API unavailable — keep the sample records as-is.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const [viewMode, setViewMode] = useState('list');
  const [typeTab, setTypeTab] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [customerFilter, setCustomerFilter] = useState('');
  const [dueFilter, setDueFilter] = useState('ALL');
  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState({
    customerName: '',
    scNo: '',
    soNo: '',
    poNumber: '',
    poReleasedDate: dateOffset(0),
    dueDate: dateOffset(7),
    type: 'INTERNAL',
    currentStatus: 'INTERNAL_PO_RELEASED'
  });

  const filtered = useMemo(() => {
    const today = todayStr();
    return orders.filter((o) => {
      if (typeTab !== 'ALL' && o.type !== typeTab) return false;
      if (statusFilter !== 'ALL' && o.currentStatus !== statusFilter) return false;
      if (customerFilter && !o.customerName.toLowerCase().includes(customerFilter.toLowerCase())) return false;
      if (dueFilter === 'OVERDUE' && !(o.dueDate < today && o.currentStatus !== 'DISPATCHED')) return false;
      if (dueFilter === 'DISPATCHED' && o.currentStatus !== 'DISPATCHED') return false;
      return true;
    });
  }, [orders, typeTab, statusFilter, customerFilter, dueFilter]);

  const kanban = STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    items: filtered.filter((o) => o.currentStatus === stage)
  }));

  const updateStatus = (id, currentStatus) => {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, currentStatus } : o)));
  };

  const moveStatus = (id, offset) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const idx = STAGE_ORDER.indexOf(o.currentStatus);
        const next = Math.min(STAGE_ORDER.length - 1, Math.max(0, idx + offset));
        return { ...o, currentStatus: STAGE_ORDER[next] };
      })
    );
  };

  const removeOrder = (id) => {
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const addOrder = () => {
    if (!draft.customerName.trim() || !String(draft[docNoKey] || '').trim()) return;
    setOrders((prev) => {
      const last = prev.reduce((m, o) => Math.max(m, Number(o.id.replace('po-', '')) || 0), 0);
      return [{ ...draft, id: `po-${last + 1}` }, ...prev];
    });
    setAddOpen(false);
    setDraft({
      customerName: '',
      scNo: '',
      soNo: '',
      poNumber: '',
      poReleasedDate: dateOffset(0),
      dueDate: dateOffset(7),
      type: 'INTERNAL',
      currentStatus: 'INTERNAL_PO_RELEASED'
    });
  };

  const today = todayStr();

  return (
    <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5 mt-4">
      {/* ===== Header ===== */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider">
          <Factory className="w-4 h-4" />
          Production Timeline
        </h3>
        <div className="flex items-center gap-2 flex-wrap select-none">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add Customer Purchase Order
          </button>
          <div className="inline-flex items-center p-1 bg-slate-100 border border-slate-200 rounded-lg">
            {[
              { key: 'list', label: 'List', icon: List },
              { key: 'kanban', label: 'Kanban', icon: LayoutGrid }
            ].map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setViewMode(m.key)}
                className={`flex items-center gap-1.5 px-3 h-[30px] rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === m.key ? 'bg-[#0B4A3D] text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                <m.icon className="w-3.5 h-3.5" /> {m.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ===== Purchase Order + Internal / External type tabs ===== */}
      <div className="mb-4 select-none">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Purchase Order</div>
        <div className="inline-flex items-center gap-2 p-1 bg-slate-100 border border-slate-200 rounded-lg">
          {TYPE_FILTERS.map((t) => {
            const count = orders.filter((o) => t.key === 'ALL' || o.type === t.key).length;
            const active = typeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTypeTab(t.key)}
                className={`flex items-center gap-1.5 px-4 h-[34px] rounded-md text-xs font-semibold transition-all cursor-pointer ${
                  active ? 'bg-[#0B4A3D] text-white shadow-sm' : 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                {t.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                    active ? 'bg-white text-[#0B4A3D]' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Filters ===== */}
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Current Status</label>
          <div className="min-w-[160px]">
            <SelectInput value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="ALL">All Statuses</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </SelectInput>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Customer</label>
          <input
            type="text"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            placeholder="Search customer..."
            className={`${INPUT_CLS} min-w-[180px]`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Due Date</label>
          <div className="min-w-[150px]">
            <SelectInput value={dueFilter} onChange={(e) => setDueFilter(e.target.value)}>
              <option value="ALL">All</option>
              <option value="OVERDUE">Overdue</option>
              <option value="DISPATCHED">Dispatched</option>
            </SelectInput>
          </div>
        </div>
        <div className="ml-auto pb-0.5">
          <button
            type="button"
            onClick={() => {
              setTypeTab('ALL');
              setStatusFilter('ALL');
              setCustomerFilter('');
              setDueFilter('ALL');
            }}
            className="text-xs font-semibold text-slate-400 hover:text-[#0B4A3D] hover:underline cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* ===== LIST VIEW ===== */}
      {viewMode === 'list' && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full border-collapse" style={{ minWidth: 1180 }}>
            <thead>
              <tr className="bg-[#0B4A3D]">
                <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">Customer Name</th>
                <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">{docNoLabel}</th>
                {secondaryNoKey && (
                  <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">{secondaryNoLabel}</th>
                )}
                <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">PO Released Date</th>
                <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">Due Date</th>
                <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">Current Status</th>
                <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">Type</th>
                {soNoKey && (
                  <th className="px-3.5 h-[42px] text-left text-[11px] font-bold tracking-wide text-white">{soNoLabel}</th>
                )}
                <th className="px-3.5 h-[42px] text-center text-[11px] font-bold tracking-wide text-white">Production/Sourcing</th>
                <th className="px-3.5 h-[42px] text-center text-[11px] font-bold tracking-wide text-white">Packing</th>
                <th className="px-3.5 h-[42px] text-center text-[11px] font-bold tracking-wide text-white">Assembly</th>
                <th className="px-3.5 h-[42px] text-center text-[11px] font-bold tracking-wide text-white">Dispatched</th>
                <th className="px-3.5 h-[42px] text-center text-[11px] font-bold tracking-wide text-white">Internal PO Released</th>
                <th className="px-3.5 h-[42px] text-center text-[11px] font-bold tracking-wide text-white">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={STAGE_COLUMNS.length + 7 + (secondaryNoKey ? 1 : 0) + (soNoKey ? 1 : 0)} className="py-12 text-center">
                    <Factory className="w-9 h-9 text-slate-300 mx-auto mb-3" />
                    <div className="text-sm font-bold text-slate-600 mb-1">No Purchase Orders found</div>
                    <div className="text-xs text-slate-400">Try adjusting the tabs or filters.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((o) => {
                  const overdue = o.dueDate < today && o.currentStatus !== 'DISPATCHED';
                  const currentIdx = STAGE_ORDER.indexOf(o.currentStatus);
                  return (
                    <tr key={o.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 transition-colors">
                      <td className="px-3.5 py-2.5 text-[13px] font-semibold text-slate-700">{o.customerName}</td>
                      <td className="px-3.5 py-2.5 text-[13px] text-slate-600">{cpoNo(o[docNoKey])}</td>
                      {secondaryNoKey && <td className="px-3.5 py-2.5 text-[13px] text-slate-600">{o[secondaryNoKey] || '—'}</td>}
                      <td className="px-3.5 py-2.5 text-[13px] text-slate-600">{formatDate(o.poReleasedDate)}</td>
                      <td className="px-3.5 py-2.5 text-[13px] text-slate-600 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {formatDate(o.dueDate)}
                          {overdue && <OverdueBadge />}
                        </span>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px]">
                        <SelectInput value={o.currentStatus} onChange={(e) => updateStatus(o.id, e.target.value)}>
                          {STAGE_ORDER.map((s) => (
                            <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                          ))}
                        </SelectInput>
                      </td>
                      <td className="px-3.5 py-2.5 text-[13px]">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                            o.type === 'EXTERNAL' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-[#E8F0EE] text-[#0B4A3D] border border-[#0B4A3D]/20'
                          }`}
                        >
                          {o.type === 'EXTERNAL' ? 'External' : 'Internal'}
                        </span>
                      </td>
                      {soNoKey && <td className="px-3.5 py-2.5 text-[13px] text-slate-600">{o[soNoKey] || '—'}</td>}
                      {STAGE_COLUMNS.map((st) => (
                        <td key={st} className="px-3.5 py-2.5 text-center">
                          <span className="inline-flex items-center justify-center w-6 h-6">
                            <StageMark order={o} stageKey={st} />
                          </span>
                        </td>
                      ))}
                      <td className="px-3.5 py-2.5 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={currentIdx === 0}
                            onClick={() => moveStatus(o.id, -1)}
                            title="Move to previous stage"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={currentIdx === STAGE_ORDER.length - 1}
                            onClick={() => moveStatus(o.id, 1)}
                            title="Move to next stage"
                            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeOrder(o.id)}
                            title="Delete PO"
                            className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ===== KANBAN VIEW ===== */}
      {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-2">
          <div className="flex items-start gap-3" style={{ minWidth: 1520 }}>
            {kanban.map((col) => (
              <div key={col.stage} className="flex flex-col flex-1 bg-slate-50 border border-slate-200 rounded-lg min-h-[220px]">
                <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200 bg-white rounded-t-lg">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">{col.label}</span>
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#0B4A3D] text-white text-[10px] font-bold">
                    {col.items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2 p-2">
                  {col.items.length === 0 ? (
                    <div className="text-center text-[11px] text-slate-300 py-6">No POs</div>
                  ) : (
                    col.items.map((o) => {
                      const overdue = o.dueDate < today && o.currentStatus !== 'DISPATCHED';
                      return (
                        <div key={o.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm min-h-[400px]">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                              <div className="text-[13px] font-bold text-slate-800 truncate">{cpoNo(o[docNoKey])}</div>
                              <div className="text-[11px] font-semibold text-slate-600 truncate">{o.customerName}</div>
                              {secondaryNoKey && o[secondaryNoKey] && (
                                <div className="text-[10px] font-semibold text-[#0B4A3D] truncate">{secondaryNoLabel}: {o[secondaryNoKey]}</div>
                              )}
                            </div>
                            {overdue && <OverdueBadge />}
                          </div>
                          <div className="text-[11px] text-slate-500 mb-3">
                            <div className="flex justify-between py-0.5">
                              <span>PO Released</span>
                              <span className="font-semibold text-slate-600">{formatDate(o.poReleasedDate)}</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span>Due Date</span>
                              <span className={`font-semibold ${overdue ? 'text-rose-600' : 'text-slate-600'}`}>{formatDate(o.dueDate)}</span>
                            </div>
                            <div className="flex justify-between py-0.5">
                              <span>Division</span>
                              <span className="font-semibold text-slate-600">{o.type === 'EXTERNAL' ? 'External' : 'Internal'}</span>
                            </div>
                            {soNoKey && (
                              <div className="flex justify-between py-0.5">
                                <span>{soNoLabel}</span>
                                <span className="font-semibold text-slate-600">{o[soNoKey] || '—'}</span>
                              </div>
                            )}
                          </div>
                          <div className="w-full">
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Status</div>
                            <SelectInput
                              value={o.currentStatus}
                              onChange={(e) => updateStatus(o.id, e.target.value)}
                            >
                              {STAGE_ORDER.map((s) => (
                                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
                              ))}
                            </SelectInput>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1.5">
                              {STAGE_ORDER.map((st) => (
                                <span key={st} className="inline-flex items-center justify-center w-4 h-4" title={STAGE_LABELS[st]}>
                                  <StageMark order={o} stageKey={st} />
                                </span>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOrder(o.id)}
                              title="Delete PO"
                              className="p-1 rounded-md text-slate-300 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== ADD PO MODAL ===== */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Purchase Order"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              className="text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!draft.customerName.trim() || !String(draft[docNoKey] || '').trim()}
              onClick={addOrder}
              className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Add PO
            </button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Customer Name *</label>
            <input
              type="text"
              value={draft.customerName}
              onChange={(e) => setDraft((d) => ({ ...d, customerName: e.target.value }))}
              placeholder="Customer name"
              className={INPUT_CLS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{docNoLabel} *</label>
            <input
              type="text"
              value={draft[docNoKey] || ''}
              onChange={(e) => setDraft((d) => ({ ...d, [docNoKey]: e.target.value }))}
              placeholder={docNoKey === 'scNo' ? 'e.g. SC-2026-000001' : 'e.g. PO-2026-001'}
              className={INPUT_CLS}
            />
          </div>
          {secondaryNoKey && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{secondaryNoLabel}</label>
              <input
                type="text"
                value={draft[secondaryNoKey] || ''}
                onChange={(e) => setDraft((d) => ({ ...d, [secondaryNoKey]: e.target.value }))}
                placeholder="e.g. PO-2026-001"
                className={INPUT_CLS}
              />
            </div>
          )}
          {soNoKey && (
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">{soNoLabel}</label>
              <input
                type="text"
                value={draft[soNoKey] || ''}
                onChange={(e) => setDraft((d) => ({ ...d, [soNoKey]: e.target.value }))}
                placeholder="e.g. SO-2026-000010"
                className={INPUT_CLS}
              />
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">PO Released Date</label>
            <input
              type="date"
              value={draft.poReleasedDate}
              onChange={(e) => setDraft((d) => ({ ...d, poReleasedDate: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Due Date</label>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft((d) => ({ ...d, dueDate: e.target.value }))}
              className={INPUT_CLS}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Type</label>
            <SelectInput value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}>
              <option value="INTERNAL">Internal</option>
              <option value="EXTERNAL">External</option>
            </SelectInput>
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Current Status</label>
            <SelectInput value={draft.currentStatus} onChange={(e) => setDraft((d) => ({ ...d, currentStatus: e.target.value }))}>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>{STAGE_LABELS[s]}</option>
              ))}
            </SelectInput>
          </div>
        </div>
      </Modal>
    </div>
  );
}