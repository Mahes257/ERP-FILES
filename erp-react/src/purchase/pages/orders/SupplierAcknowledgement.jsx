/**
 * purchase/pages/orders/SupplierAcknowledgement.jsx
 * ------------------------------------------------------------------
 * Supplier Acknowledgement — track whether released purchase orders
 * have been acknowledged by the vendor, with an inline acknowledge
 * action and exports. Built on the shared Purchase list kit so it
 * matches the master list design.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock3, Eye, Handshake, RefreshCw, Search, Truck, X } from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown
} from '../../components/list';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { PO_COLUMNS, PO_RELEASED_STAGES } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import { isAckPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  ...PO_COLUMNS.filter((col) => col.key !== 'status'),
  { key: 'acknowledged', label: 'Ack Status', width: 130, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const KPI_DEFS = [
  { key: 'released', label: 'Released POs', icon: Handshake, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'acknowledged', label: 'Acknowledged', icon: CheckCircle2, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'pending', label: 'Awaiting Ack', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' }
];

export default function SupplierAcknowledgement() {
  const navigate = useNavigate();
  const toast = useToast();

  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));
  const [orders, setOrders] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ackTarget, setAckTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await purchaseOrderService.getOrders({ page: 1, pageSize: 500 });
      /* Only POs that were actually released to the supplier belong here
         (canonical released stages) — an Approved PO that was never sent
         cannot be acknowledged. The flag comes from the persisted order
         record, never fabricated client-side. */
      const released = response.data.filter((order) => PO_RELEASED_STAGES.includes(order.status));
      setOrders(released);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'poNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((order) =>
      [order.poNo, order.title, order.vendor, order.reference].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [orders, query]);

  const stats = useMemo(() => ({
    released: orders.length,
    acknowledged: orders.filter((order) => order.acknowledged).length,
    pending: orders.filter((order) => !order.acknowledged).length
  }), [orders]);

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats[def.key] ?? 0) }));

  const renderers = useMemo(
    () => ({
      poNo: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/orders/${row.id}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.poNo}
        </button>
      ),
      title: (row) => (
        <div className="text-xs font-semibold text-slate-800 truncate max-w-[220px]" title={row.title}>{row.title || '—'}</div>
      ),
      amount: (row) => (
        <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.amount, row.currency)}</span>
      ),
      orderDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.orderDate)}</span>,
      expectedDate: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.expectedDate)}</span>,
      acknowledged: (row) =>
        row.acknowledged ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="w-3 h-3" /> Acknowledged
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-600">
            <Clock3 className="w-3 h-3" /> Awaiting
          </span>
        )
    }),
    [navigate]
  );

  const handleExport = async (type) => {
    if (type === 'csv') exportCsv(columns, filtered, 'supplier-acknowledgements');
    toast.success('Acknowledgements exported');
  };

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'Acknowledgement' }
        ],
        icon: Handshake,
        title: 'Supplier Acknowledgement',
        subtitle: 'Track vendor confirmation of released purchase orders',
        actions: (
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={12} /> Refresh
          </button>
        )
      }}
      flowNav={<ModuleTabNav module="orders" />}
      error={error}
      onRetry={refresh}
      kpis={{ cards: kpiCards }}
      toolbar={{
        count: `${filtered.length} released order(s)`,
        left: (
          query && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>
              <X size={12} /> Clear
            </button>
          )
        ),
        right: (
          <>
            <PurchaseSearch
              id="ackSearchInput"
              placeholder="Search by PO no, vendor, reference..."
              value={query}
              onChange={setQuery}
              label="Search Acknowledgements"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />
          </>
        )
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: filtered,
        loading,
        selectable: false,
        renderers,
        /* Pending dot — released POs that have not been acknowledged by
           the supplier yet (orange = awaiting acknowledgement);
           acknowledged rows render none. */
        /* Pending highlight — the shared light-orange identification
           wash on the PO-number cell for POs genuinely awaiting supplier
           acknowledgement (PENDING only — a past-due, unacknowledged PO
           is an Exception and follows the error styling, never the
           pending orange). */
        rowClass: (row) => pendingWorkClass(isAckPending(row)),
        idColumn: 'poNo',
        tableId: 'ackTable',
        alignCenter: ['acknowledged'],
        alignRight: ['amount'],
        rowActions: (row) => [
          { key: 'view', label: 'View', icon: Eye },
          ...(!row.acknowledged ? [{ key: 'ack', label: 'Mark Acknowledged', icon: CheckCircle2 }] : []),
          ...(row.acknowledged ? [{ key: 'start', label: 'Start In Progress', icon: Truck }] : [])
        ],
        onRowAction: async (key, row) => {
          if (key === 'view') navigate(`/purchase/orders/${row.id}`);
          else if (key === 'ack') setAckTarget(row);
          else if (key === 'start') {
            try {
              const updated = await purchaseOrderService.startOrder(row.id);
              toast.success(`${updated.poNo} is now In Progress`);
              refresh();
            } catch (err) {
              toast.error(err?.message || 'Failed to start order');
            }
          }
        },
        emptyContent: (
          query ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Orders"
              message="No released orders matching your search criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQuery('')}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={Handshake}
              title="No Released Orders"
              message="No released purchase orders awaiting acknowledgement."
            />
          )
        )
      }}
    >
      <ConfirmDialog
        open={ackTarget !== null}
        title="Mark as acknowledged?"
        message={`${ackTarget?.poNo} will be recorded as acknowledged by ${ackTarget?.vendor || 'the vendor'}.`}
        confirmLabel="Acknowledge"
        variant="default"
        icon={CheckCircle2}
        onConfirm={async () => {
          if (!ackTarget) return;
          try {
            await purchaseOrderService.acknowledgeOrder(ackTarget.id);
            toast.success(`${ackTarget.poNo} acknowledged`);
            setAckTarget(null);
            /* Reload so the persisted acknowledgement (and timeline entry)
               is reflected from the store rather than local state. */
            refresh();
          } catch (err) {
            toast.error(err?.message || 'Failed to acknowledge purchase order');
          }
        }}
        onCancel={() => setAckTarget(null)}
      />
    </PurchaseListPage>
  );
}
