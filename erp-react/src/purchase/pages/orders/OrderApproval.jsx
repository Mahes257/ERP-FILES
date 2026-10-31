/**
 * purchase/pages/orders/OrderApproval.jsx
 * ------------------------------------------------------------------
 * PO Approval — approval console for purchase orders awaiting
 * approval, with an inline approve action and a quick look at the
 * approval pipeline. Built on the shared Purchase list kit so it
 * matches the master list design.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2, Clock3, Download, Eye, FileText, RefreshCw, XCircle
} from 'lucide-react';
import { useToast } from '../../components/ui';
import { PurchaseListPage, PurchaseEmptyState, PurchaseStatusCell } from '../../components/list';
import usePurchaseList from '../../hooks/usePurchaseList';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { APPROVAL_STATUS, PO_COLUMNS, PO_STATUS } from '../../constants';
import { isPoPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const KPI_DEFS = [
  { key: 'pendingApproval', label: 'Pending Approval', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'total', label: 'Total Orders', icon: FileText, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'value', label: 'Order Value', icon: FileText, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', currency: true }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* Sentinel for the "Total Orders" KPI — shows every real PO regardless of
   approval decision, so selecting it never stays stuck on the pending
   filter and render an empty table. */
const APPROVAL_ALL = 'All';

/* Bucket membership derived from the ACTUAL stored status + approval
   decision — the single status model, identical to the stats:
     Pending  → submitted and awaiting the decision (status Pending
                Approval; Drafts are not waiting for approval).
     Approved → approved at the gate (status Approved). Released /
                acknowledged / in-progress POs are past this console
                and never appear here.
     Rejected → approvalStatus Rejected (status stays Pending
                Approval until edited or re-approved). */
function inBucket(order, bucket) {
  if (!bucket || bucket === APPROVAL_ALL) return true;
  if (bucket === APPROVAL_STATUS.PENDING) {
    return order.status === PO_STATUS.PENDING_APPROVAL && order.approvalStatus === APPROVAL_STATUS.PENDING;
  }
  if (bucket === APPROVAL_STATUS.APPROVED) {
    return order.status === PO_STATUS.APPROVED && order.approvalStatus === APPROVAL_STATUS.APPROVED;
  }
  return order.approvalStatus === APPROVAL_STATUS.REJECTED;
}

export default function OrderApproval() {
  const navigate = useNavigate();
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const all = await purchaseOrderService.getOrders({ search, page: 1, pageSize: 500 });
      const status = filters.approvalStatus || APPROVAL_STATUS.PENDING;
      const filtered = all.data.filter((order) => inBucket(order, status));
      const start = (page - 1) * pageSize;
      return {
        data: filtered.slice(start, start + pageSize),
        total: filtered.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(filtered.length / pageSize))
      };
    },
    []
  );

  const {
    records,
    loading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    filters,
    setFilter,
    goToPage,
    changePageSize,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  const [stats, setStats] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeKpi, setActiveKpi] = useState('total');
  /* Bucket counts (KPI + tab labels). Derived from the ACTUAL orders so they
     reflect approvalStatus — the stats endpoint only counts by status and has
     no pending/approved/rejected keys, so reading those off stats always
     showed 0. */
  const [approvalCounts, setApprovalCounts] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);

  useEffect(() => {
    setFilter('approvalStatus', APPROVAL_STATUS.PENDING);
  }, [setFilter]);

  useEffect(() => {
    let cancelled = false;
    purchaseOrderService
      .getOrderStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    purchaseOrderService
      .getOrders({ page: 1, pageSize: 500 })
      .then((all) => {
        if (cancelled) return;
        const rows = Array.isArray(all?.data) ? all.data : [];
        setApprovalCounts({
          pending: rows.filter((order) => inBucket(order, APPROVAL_STATUS.PENDING)).length,
          approved: rows.filter((order) => inBucket(order, APPROVAL_STATUS.APPROVED)).length,
          rejected: rows.filter((order) => inBucket(order, APPROVAL_STATUS.REJECTED)).length
        });
      })
      .catch(() => { if (!cancelled) setApprovalCounts(null); });
    return () => {
      cancelled = true;
    };
  }, [statsVersion]);

  /* Reload the console once a decision is recorded so the bucket counts and
     the list both reflect the new state. */
  const reloadConsole = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  const kpiCards = KPI_DEFS.map((def) => {
    let value;
    if (def.key === 'pendingApproval') value = String(approvalCounts?.pending ?? 0);
    else if (def.currency) value = formatAmount(stats?.value ?? 0);
    else value = String(stats?.[def.key] ?? 0);
    return { ...def, value };
  });

  const selectKpi = (key) => {
    if (key === 'pendingApproval') {
      setActiveKpi('pendingApproval');
      setFilter('approvalStatus', APPROVAL_STATUS.PENDING);
    } else {
      /* Total Orders / Order Value → the full real dataset, so the table can
         never show 0 rows because the pending filter is still applied. */
      setActiveKpi(key);
      setFilter('approvalStatus', APPROVAL_ALL);
    }
  };

  const segments = [
    { key: APPROVAL_STATUS.PENDING, label: 'Pending Approval', count: approvalCounts?.pending ?? 0 },
    { key: APPROVAL_STATUS.APPROVED, label: 'Approved', count: approvalCounts?.approved ?? 0 },
    { key: APPROVAL_STATUS.REJECTED, label: 'Rejected', count: approvalCounts?.rejected ?? 0 }
  ];

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  /* ─── Selection ─── */
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const handleSelectAll = (checked) => {
    setSelectedIds(checked ? records.map((row) => row.id) : []);
  };

  const handleToggleRow = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  /* ─── Bulk actions ─── */
  const bulkActions = useMemo(() => [
    { key: 'approve', label: 'Approve', icon: CheckCircle2 },
    { key: 'reject', label: 'Reject', icon: XCircle, danger: true },
    { key: 'export', label: 'Export', icon: Download }
  ], []);

  const handleBulk = async (key) => {
    if (key === 'approve') {
      const pending = records.filter((r) => selectedIds.includes(r.id) && r.approvalStatus === APPROVAL_STATUS.PENDING);
      if (pending.length === 0) {
        toast.info('No pending orders selected');
        return;
      }
      const result = await runMutation(() => Promise.all(pending.map((r) => purchaseOrderService.approveOrder(r.id))));
      if (result.ok) {
        toast.success(`${pending.length} order(s) approved`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to approve orders');
    } else if (key === 'reject') {
      const pending = records.filter((r) => selectedIds.includes(r.id) && r.approvalStatus === APPROVAL_STATUS.PENDING);
      if (pending.length === 0) {
        toast.info('No pending orders selected');
        return;
      }
      const result = await runMutation(() => Promise.all(pending.map((r) => purchaseOrderService.rejectOrder(r.id))));
      if (result.ok) {
        toast.success(`${pending.length} order(s) rejected`);
        setSelectedIds([]);
        setStatsVersion((v) => v + 1);
      } else toast.error(result.error?.message || 'Failed to reject orders');
    } else if (key === 'export') {
      exportCsv(PO_COLUMNS, records.filter((r) => selectedIds.includes(r.id)), 'po-approval-selected');
      toast.success(`${selectedIds.length} order(s) exported`);
      setSelectedIds([]);
    }
  };

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
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'Approval' }
        ],
        icon: Clock3,
        title: 'PO Approval',
        subtitle: 'Review and approve purchase orders before release',
        actions: (
          <button type="button" className="btn btn-ghost btn-sm" onClick={reloadConsole}>
            <RefreshCw size={12} /> Refresh
          </button>
        )
      }}
      flowNav={<ModuleTabNav module="orders" />}
      error={error}
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      tabs={{
        segments: {
          tabs: segments,
          activeKey: filters.approvalStatus || APPROVAL_STATUS.PENDING,
          onSelect: (status) => setFilter('approvalStatus', status),
          ariaLabel: 'PO approval status'
        }
      }}
      toolbar={{ count: pageInfo }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: handleBulk,
        id: 'poApprovalBulkActionBar'
      }}
      table={{
        columns: PO_COLUMNS,
        rows: records,
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
        tableId: 'orderApprovalTable',
        alignCenter: ['status'],
        alignRight: ['amount'],
        /* Pending highlight — the shared light-orange identification
           wash on the PO-number cell for POs still awaiting approval /
           release (approvalStatus Pending — the same set as the
           Purchase Order List and the sidebar badge); approved /
           rejected POs stay normal. */
        rowClass: (row) => pendingWorkClass(isPoPending(row)),
        rowActions: (row) => [
          { key: 'view', label: 'View', icon: Eye },
          ...(row.status === PO_STATUS.PENDING_APPROVAL && row.approvalStatus === APPROVAL_STATUS.PENDING
            ? [
                { key: 'approve', label: 'Approve PO', icon: CheckCircle2 },
                { key: 'reject', label: 'Reject PO', icon: XCircle, danger: true }
              ]
            : []),
          /* Approved-at-the-gate POs are waiting for the next workflow
             step — release to the supplier. */
          ...(row.status === PO_STATUS.APPROVED && row.approvalStatus === APPROVAL_STATUS.APPROVED
            ? [{ key: 'release', label: 'Release PO', icon: CheckCircle2 }]
            : [])
        ],
        onRowAction: async (key, row) => {
          if (key === 'view') navigate(`/purchase/orders/${row.id}`);
          else if (key === 'approve') {
            const result = await runMutation(() => purchaseOrderService.approveOrder(row.id));
            if (result.ok) { toast.success(`${row.poNo} approved`); setStatsVersion((v) => v + 1); }
            else toast.error(result.error?.message || 'Failed to approve PO');
          } else if (key === 'reject') {
            const result = await runMutation(() => purchaseOrderService.rejectOrder(row.id));
            if (result.ok) { toast.success(`${row.poNo} rejected`); setStatsVersion((v) => v + 1); }
            else toast.error(result.error?.message || 'Failed to reject PO');
          } else if (key === 'release') {
            const result = await runMutation(() => purchaseOrderService.releaseOrder(row.id));
            if (result.ok) { toast.success(`${row.poNo} released to ${row.vendor || 'supplier'}`); setStatsVersion((v) => v + 1); }
            else toast.error(result.error?.message || 'Failed to release PO');
          }
        },
        emptyContent: (
          <PurchaseEmptyState
            icon={Clock3}
            title="No Orders Here"
            message="No purchase orders in this approval bucket."
          />
        )
      }}
      pagination={{
        page,
        totalPages,
        pageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        pageInfo,
        onPageChange: goToPage,
        onPageSizeChange: changePageSize
      }}
    />
  );
}
