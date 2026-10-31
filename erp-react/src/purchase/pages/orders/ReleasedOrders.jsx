/**
 * purchase/pages/orders/ReleasedOrders.jsx
 * ------------------------------------------------------------------
 * Released Purchase Orders & Supplier Acknowledgement — ONE combined
 * workspace for POs that have been approved and released to vendors.
 * Each row shows both the release information AND the supplier
 * acknowledgement information (status, acknowledged date, last
 * updated) so the user never has to navigate between two pages to
 * know whether a released PO has been acknowledged.
 *
 * Data comes from the existing purchaseOrderService store — nothing
 * is hardcoded, no PO records are duplicated. Acknowledgement status
 * is derived from the persisted record via utils/poAcknowledgement.
 * Clicking a PO Number opens the EXISTING OrderView detail page.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, Clock3, Download, Eye,
  Filter, Handshake, Printer,  RefreshCw, Rocket, Search, Send, Truck, X
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown
} from '../../components/list';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { PO_RELEASED_STAGES } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import { ACK_STATUS, ACK_STATUS_OPTIONS, getPoAckStatus } from '../../utils/poAcknowledgement';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/** ONE unified table — release info and acknowledgement info per row. */
const COLUMNS = [
  { key: 'poNo', label: 'PO Number', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'vendor', label: 'Vendor', width: 170, sortable: true, visible: true },
  { key: 'orderDate', label: 'PO Date', width: 115, sortable: true, visible: true },
  { key: 'expectedDate', label: 'Delivery Date', width: 115, sortable: true, visible: true },
  { key: 'amount', label: 'PO Amount', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'releaseStatus', label: 'Release Stage', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'ackStatus', label: 'Acknowledgement Stage', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'acknowledgedAt', label: 'Acknowledged Date', width: 130, sortable: true, visible: true, align: 'center' },
  { key: 'lastUpdated', label: 'Last Updated', width: 125, sortable: true, visible: true },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const KPI_DEFS = [
  { key: 'released', label: 'Total Released POs', icon: Rocket, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'pending', label: 'Pending Acknowledgement', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'acknowledged', label: 'Acknowledged', icon: CheckCircle2, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'exceptions', label: 'Exceptions', icon: AlertTriangle, color: '#dc2626', bg: 'rgba(220,38,38,0.08)' }
];

const FILTER_KEYS = ['poNo', 'vendor', 'releaseStatus', 'ackStatus', 'poDate', 'deliveryDate', 'amountMin', 'amountMax'];

const ACK_STATUS_PILLS = {
  [ACK_STATUS.PENDING]: 'bg-amber-50 text-amber-600',
  [ACK_STATUS.ACKNOWLEDGED]: 'bg-emerald-50 text-emerald-700',
  [ACK_STATUS.REJECTED]: 'bg-slate-100 text-slate-600',
  [ACK_STATUS.EXCEPTION]: 'bg-red-50 text-red-600'
};

export default function ReleasedOrders() {
  const navigate = useNavigate();
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({});
  const [draftFilters, setDraftFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [ackTarget, setAckTarget] = useState(null);
  const [sortKey, setSortKey] = useState('orderDate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeKpi, setActiveKpi] = useState('released');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await purchaseOrderService.getOrders({ page: 1, pageSize: 500 });
      /* Only POs that were actually released to the supplier live in this
         workspace (canonical released stages — the same membership the
         sidebar badge uses). An Approved-but-not-released PO was never
         sent, so it never appears here; Completed / Closed POs have left
         the acknowledgement window. The ack flag comes from the
         persisted order record, never fabricated. */
      setOrders(response.data.filter((order) => PO_RELEASED_STAGES.includes(order.status)));
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

  /* Derived acknowledgement status — same helper the sidebar badge uses. */
  const withAckStatus = useCallback(
    (order) => ({ ...order, releaseStatus: 'Released', ackStatus: getPoAckStatus(order) }),
    []
  );

  const rows = useMemo(() => orders.map(withAckStatus), [orders, withAckStatus]);

  /* Dynamic KPI counts — released = pending + acknowledged + exceptions. */
  const stats = useMemo(() => {
    const counts = { released: rows.length, pending: 0, acknowledged: 0, exceptions: 0 };
    rows.forEach((row) => {
      if (row.ackStatus === ACK_STATUS.ACKNOWLEDGED) counts.acknowledged += 1;
      else if (row.ackStatus === ACK_STATUS.EXCEPTION) counts.exceptions += 1;
      else counts.pending += 1;
    });
    return counts;
  }, [rows]);

  const kpiCards = KPI_DEFS.map((def) => ({
    ...def,
    value: String(stats[def.key] ?? 0)
  }));

  const selectKpi = (key) => {
    const newKey = activeKpi === key ? 'released' : key;
    setActiveKpi(newKey);
    if (newKey === 'released') {
      setFilters((prev) => {
        const next = { ...prev };
        delete next.ackStatus;
        return next;
      });
    } else if (newKey === 'pending') {
      setFilters((prev) => ({ ...prev, ackStatus: ACK_STATUS.PENDING }));
    } else if (newKey === 'acknowledged') {
      setFilters((prev) => ({ ...prev, ackStatus: ACK_STATUS.ACKNOWLEDGED }));
    } else if (newKey === 'exceptions') {
      setFilters((prev) => ({ ...prev, ackStatus: ACK_STATUS.EXCEPTION }));
    }
  };

  /* Search + filters. */
  const filtered = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    let list = rows;
    if (q) {
      list = list.filter((order) =>
        [order.poNo, order.vendor, order.title, order.reference, order.prNo, order.rfqNo]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    if (filters.poNo && filters.poNo !== 'All') {
      list = list.filter((o) => String(o.poNo || '').toLowerCase().includes(String(filters.poNo).toLowerCase()));
    }
    if (filters.vendor && filters.vendor !== 'All') {
      list = list.filter((o) => String(o.vendor || '').toLowerCase().includes(String(filters.vendor).toLowerCase()));
    }
    if (filters.releaseStatus && filters.releaseStatus !== 'All') {
      list = list.filter((o) => o.releaseStatus === filters.releaseStatus);
    }
    if (filters.ackStatus && filters.ackStatus !== 'All') {
      list = list.filter((o) => o.ackStatus === filters.ackStatus);
    }
    if (filters.poDate) list = list.filter((o) => o.orderDate === filters.poDate);
    if (filters.deliveryDate) list = list.filter((o) => o.expectedDate === filters.deliveryDate);
    if (filters.amountMin) list = list.filter((o) => Number(o.amount) >= Number(filters.amountMin));
    if (filters.amountMax) list = list.filter((o) => Number(o.amount) <= Number(filters.amountMax));
    return list;
  }, [rows, searchInput, filters]);

  const sortedRows = useMemo(() => {
    const list = [...filtered];
    const dir = sortDirection === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const diff = sortKey === 'amount' ? Number(av) - Number(bv) : String(av ?? '').localeCompare(String(bv ?? ''));
      return diff * dir;
    });
    return list;
  }, [filtered, sortKey, sortDirection]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortDirection((dir) => (dir === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  /* ─── Selection ─── */
  const allSelected = sortedRows.length > 0 && sortedRows.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = useCallback((checked) => {
    setSelectedIds(checked ? sortedRows.map((row) => row.id) : []);
  }, [sortedRows]);

  const handleToggleRow = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  }, []);

  /* ─── Bulk actions — Acknowledge only when pending rows are selected. */
  const hasPendingSelected = useMemo(
    () => sortedRows.some((r) => selectedIds.includes(r.id) && r.ackStatus === ACK_STATUS.PENDING),
    [sortedRows, selectedIds]
  );
  const bulkActions = useMemo(() => {
    const actions = [];
    if (hasPendingSelected) {
      actions.push({ key: 'acknowledge', label: 'Acknowledge', icon: CheckCircle2 });
    }
    actions.push({ key: 'export', label: 'Export', icon: Download });
    return actions;
  }, [hasPendingSelected]);

  const handleBulk = useCallback(async (key) => {
    if (key === 'acknowledge') {
      const pending = sortedRows.filter((r) => selectedIds.includes(r.id) && r.ackStatus === ACK_STATUS.PENDING);
      if (pending.length === 0) {
        toast.info('No pending acknowledgement rows selected');
        return;
      }
      try {
        await Promise.all(pending.map((r) => purchaseOrderService.acknowledgeOrder(r.id)));
        toast.success(`${pending.length} order(s) acknowledged`);
        setSelectedIds([]);
        refresh();
      } catch (err) {
        toast.error(err?.message || 'Failed to acknowledge orders');
      }
    } else if (key === 'export') {
      exportCsv(columns, sortedRows.filter((r) => selectedIds.includes(r.id)), 'released-orders-selected');
      toast.success(`${selectedIds.length} order(s) exported`);
      setSelectedIds([]);
    }
  }, [selectedIds, sortedRows, columns, refresh, toast]);

  /* Filter panel wiring (same pattern as the other Purchase lists). */
  const activeFilterCount = FILTER_KEYS.filter((key) => {
    const value = filters[key];
    return value && value !== 'All' && value !== '';
  }).length;

  const toggleFilters = () => {
    const next = !filterOpen;
    if (next) {
      setDraftFilters(
        FILTER_KEYS.reduce((acc, key) => {
          const value = filters[key];
          if (value && value !== 'All') acc[key] = value;
          return acc;
        }, {})
      );
    }
    setFilterOpen(next);
  };

  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilters((prev) => ({ ...prev, [key]: value || 'All' }));
    });
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    setFilters({});
    setSearchInput('');
    setFilterOpen(false);
  };

  /* Last updated = most recent activity timestamp (falls back to created). */
  const lastUpdated = (order) => {
    const activity = Array.isArray(order.activity) ? order.activity : [];
    return activity.reduce(
      (max, entry) => (entry?.timestamp && entry.timestamp > max ? entry.timestamp : max),
      order.createdAt || ''
    );
  };

  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'poNo' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const renderers = useMemo(
    () => ({
      poNo: (row) => (
        <a
          href={`/purchase/orders/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/orders/${row.id}`);
          }}
        >
          {row.poNo}
        </a>
      ),
      vendor: (row) => <span className="cpr-cell-truncate" title={row.vendor}>{row.vendor || '—'}</span>,
      orderDate: (row) => <span className="cpr-cell-muted">{formatDate(row.orderDate) || '—'}</span>,
      expectedDate: (row) => <span className="cpr-cell-muted">{formatDate(row.expectedDate) || '—'}</span>,
      amount: (row) => (
        <span className="cpr-amount">{formatAmount(row.amount, row.currency)}</span>
      ),
      releaseStatus: () => (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700">
          <Rocket className="w-3 h-3" /> Released
        </span>
      ),
      ackStatus: (row) => (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${ACK_STATUS_PILLS[row.ackStatus] || ACK_STATUS_PILLS[ACK_STATUS.PENDING]}`}>
          {row.ackStatus === ACK_STATUS.ACKNOWLEDGED ? (
            <CheckCircle2 className="w-3 h-3" />
          ) : row.ackStatus === ACK_STATUS.EXCEPTION ? (
            <AlertTriangle className="w-3 h-3" />
          ) : (
            <Clock3 className="w-3 h-3" />
          )}
          {row.ackStatus}
        </span>
      ),
      acknowledgedAt: (row) => (
        <span className="cpr-cell-muted">{row.acknowledgedAt ? formatDate(row.acknowledgedAt) : '—'}</span>
      ),
      lastUpdated: (row) => {
        const stamp = lastUpdated(row);
        return <span className="cpr-cell-muted">{stamp ? formatDate(stamp) : '—'}</span>;
      }
    }),
    [navigate]
  );

  const handleExport = async (type) => {
    if (type === 'csv') exportCsv(columns, sortedRows, 'released-orders-supplier-acknowledgements');
    toast.success('Released orders exported');
  };

  /* Actions per acknowledgement status — spec-driven, real service calls only. */
  const buildRowActions = (row) => {
    const actions = [
      { key: 'view', label: 'View PO', icon: Eye }
    ];
    if (row.ackStatus === ACK_STATUS.ACKNOWLEDGED) {
      /* Acknowledged — the next operational action is Start In Progress
         (Supplier Acknowledged → In Progress); Print stays available. */
      actions.push({ key: 'start', label: 'Start In Progress', icon: Truck });
      actions.push({ key: 'print', label: 'Print', icon: Printer });
    } else {
      /* Pending / Exception — Acknowledge + Send Reminder + Print. */
      actions.push({ key: 'ack', label: 'Acknowledge', icon: CheckCircle2 });
      actions.push({ key: 'remind', label: 'Send Reminder', icon: Send });
      actions.push({ key: 'print', label: 'Print', icon: Printer });
    }
    return actions;
  };

  const handleRowAction = (key, row) => {
    if (key === 'view') {
      navigate(`/purchase/orders/${row.id}`);
    } else if (key === 'ack') {
      setAckTarget(row);
    } else if (key === 'remind') {
      sendReminder(row);
    } else if (key === 'start') {
      startOrder(row);
    } else if (key === 'print') {
      /* Print the released order row using the shared export infrastructure. */
      const printCols = columns.filter((c) => c.visible !== false && c.key !== 'actions');
      import('../../utils/export').then(({ printTable }) => {
        printTable(`Released Order ${row.poNo}`, printCols, [row]);
      });
    }
  };

  /* Start In Progress — Supplier Acknowledged → In Progress via the real
     service transition; the row (and KPIs) refresh from the store. */
  const startOrder = async (row) => {
    try {
      const updated = await purchaseOrderService.startOrder(row.id);
      toast.success(`${updated.poNo} is now In Progress`);
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Failed to start order');
    }
  };

  /* Send Reminder — records a persisted 'reminder' entry on the PO's
     existing activity trail via the dedicated reminder endpoint (no ack
     state changes, no new records). The generic update endpoint refuses
     POs past draft/pending, so it cannot be used here. */
  const sendReminder = async (row) => {
    try {
      const updated = await purchaseOrderService.remindOrder(row.id);
      toast.success(`Reminder sent to ${updated?.vendor || row.vendor || 'supplier'}`);
      refresh();
    } catch (err) {
      toast.error(err?.message || 'Failed to send reminder');
    }
  };



  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'Released & Supplier Acknowledgement' }
        ],
        icon: Handshake,
        title: 'Released Purchase Orders & Supplier Acknowledgement',
        subtitle: 'Manage released purchase orders and track supplier acknowledgement in one workspace',
        actions: (
          <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
            <RefreshCw size={12} /> Refresh
          </button>
        )
      }}
      flowNav={<ModuleTabNav module="orders" />}
      error={error}
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      toolbar={{
        count: `${sortedRows.length} of ${rows.length} released order(s)`,
        left: (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={toggleFilters}
              aria-label="Toggle filters"
              aria-expanded={filterOpen}
            >
              <Filter size={12} /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(searchInput || activeFilterCount > 0) && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="releasedSearchInput"
              placeholder="Search PO Number, Vendor, Supplier, Reference..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Released Orders"
            />
            <PurchaseExportDropdown buttonLabel="Export" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['poNo', 'actions']}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'releasedFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'poNo', id: 'rel-po-no', label: 'PO Number', type: 'text',
            value: draftFilters.poNo || '', placeholder: 'e.g. PO-2026-0339',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, poNo: v }))
          },
          {
            key: 'vendor', id: 'rel-vendor', label: 'Vendor', type: 'text',
            value: draftFilters.vendor || '', placeholder: 'e.g. Tata Steel',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, vendor: v }))
          },
          {
            key: 'releaseStatus', id: 'rel-release-status', label: 'Release Status', type: 'select',
            value: draftFilters.releaseStatus || 'All',
            options: [
              { value: 'All', label: 'All' },
              { value: 'Released', label: 'Released' }
            ],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, releaseStatus: v }))
          },
          {
            key: 'ackStatus', id: 'rel-ack-status', label: 'Acknowledgement Status', type: 'select',
            value: draftFilters.ackStatus || 'All',
            options: [
              { value: 'All', label: 'All' },
              ...ACK_STATUS_OPTIONS.map((v) => ({ value: v, label: v }))
            ],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, ackStatus: v }))
          },
          {
            key: 'poDate', id: 'rel-po-date', label: 'PO Date', type: 'date',
            value: draftFilters.poDate || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, poDate: v }))
          },
          {
            key: 'deliveryDate', id: 'rel-delivery-date', label: 'Delivery Date', type: 'date',
            value: draftFilters.deliveryDate || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, deliveryDate: v }))
          },
          {
            key: 'amount', id: 'rel-amount', label: 'PO Amount', type: 'range',
            minValue: draftFilters.amountMin || '', maxValue: draftFilters.amountMax || '',
            onChange: (min, max) => setDraftFilters((prev) => ({ ...prev, amountMin: min, amountMax: max }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: handleBulk,
        id: 'releasedBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: sortedRows,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: handleSelectAll,
        onToggleRow: handleToggleRow,
        getRowId: (row) => row.id,
        renderers,
        idColumn: 'poNo',
        tableId: 'releasedOrdersTable',
        sortKey,
        sortDirection,
        onSort: toggleSort,
        /* Pending dot — released POs still awaiting supplier
           acknowledgement (PENDING only — acknowledged / exceptions
           render none), colored by the same semantic tone as the
           status pill (same set as the sidebar badge). */
        /* Pending highlight — the shared light-orange identification
           wash on the PO-number cell for POs still awaiting supplier
           acknowledgement (PENDING only; acknowledged / exceptions
           stay normal). */
        rowClass: (row) => pendingWorkClass(row.ackStatus === ACK_STATUS.PENDING),
        alignCenter: ['releaseStatus', 'ackStatus', 'acknowledgedAt'],
        alignRight: ['amount'],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        emptyContent: (
          searchInput || activeFilterCount > 0 ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Orders"
              message="No released orders match your search or filter criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Search & Filters
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={Handshake}
              title="No Released Orders"
              message="No released purchase orders yet. Approve POs to release them."
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
            /* Reload so the persisted acknowledgement (and timeline
               entry) is reflected from the store, and the row + KPI
               cards + sidebar badge update dynamically. */
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
