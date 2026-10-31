/**
 * purchase/pages/rfq/VendorQuotations.jsx
 * ------------------------------------------------------------------
 * Vendor Quotations — consolidated list of quotations received from
 * vendors, filterable by RFQ and status, with exports and an inline
 * status update (accept / reject). Built on the shared Purchase list
 * kit (PurchaseHeader / PurchaseKpiCards / PurchaseSegmentedTabs /
 * PurchaseToolbar / PurchaseSearch / PurchaseFilters / PurchaseTable /
 * PurchasePagination / PurchaseBulkToolbar / PurchaseExportDropdown) so
 * it matches the master list design.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2, Clock3, Download, Eye, Filter, Inbox, Plus, Printer, RefreshCw, Scale, Search, Send, X, XCircle
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell
} from '../../components/list';
import RfqTabNav from '../../components/RfqTabNav';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { rfqService } from '../../services/rfq';
import { QUOTATION_COLUMNS, QUOTATION_STATUS } from '../../constants';
import { isQuotationPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';

import { formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const KPI_DEFS = [
  { key: 'received', label: 'Received', icon: Send, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'pending', label: 'Pending', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'accepted', label: 'Accepted', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export default function VendorQuotations() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      const response = await rfqService.getQuotations({
        search,
        status: filters.status || 'All',
        rfqNo: filters.rfqNo || 'All',
        page,
        pageSize,
        sortBy: sortKey,
        sortDir: sortDirection
      });
      return response;
    },
    []
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount, totalPages },
    search,
    sortKey,
    sortDirection,
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    toggleSort,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  const [columns, setColumns] = useState(() => QUOTATION_COLUMNS.map((col) => ({ ...col })));
  const [rfqOptions, setRfqOptions] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null); // { quote, status }
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [statsVersion, setStatsVersion] = useState(0);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    setSearch(debouncedSearch);
  }, [debouncedSearch, setSearch]);

  /* RFQ scope carried in the URL: /purchase/rfq/quotations?rfq=RFQ-2026-0039
     shows only that RFQ's quotations. Every entry point (RFQ list action
     menu, RFQ detail page, PO "Quotation" chip) links with the RFQ NUMBER,
     which is what the list service filters on — never the numeric id. */
  const rfqParam = searchParams.get('rfq') || '';

  /* Keyed on the param: the route stays mounted when the user goes from one
     RFQ to another, so this must re-scope instead of leaving the previous
     RFQ's filter applied. Dropping the param returns to the global list.
     `setFilter` is idempotent, so re-applying the current scope is a no-op
     (and never triggers a redundant fetch). */
  useEffect(() => {
    const nextScope = rfqParam || 'All';
    queueMicrotask(() => {
      setFilter('rfqNo', nextScope);
      setDraftFilters((prev) => (prev.rfqNo === nextScope ? prev : { ...prev, rfqNo: nextScope }));
    });
  }, [rfqParam, setFilter]);

  /* Stats (KPI cards + tab counts) — re-fetched after any status change so
     the counts stay in sync with the workflow, same as the RFQ list. */
  useEffect(() => {
    let cancelled = false;
    Promise.all([rfqService.getRfqs({ page: 1, pageSize: 100 }), rfqService.getQuotationStats()])
      .then(([rfqResponse, quoteStats]) => {
        if (cancelled) return;
        setRfqOptions(rfqResponse.data);
        setStats(quoteStats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion]);

  const toggleColumn = (key) => {
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) =>
      prev.map((col) => (col.key === 'id' || col.key === 'actions' ? col : { ...col, visible: false }))
    );

  const kpiCards = KPI_DEFS.map((def) => ({ ...def, value: String(stats?.[def.key] ?? 0) }));

  const segments = [
    { key: QUOTATION_STATUS.RECEIVED, label: 'Received', count: stats?.received ?? 0 },
    { key: QUOTATION_STATUS.PENDING, label: 'Pending', count: stats?.pending ?? 0 },
    { key: QUOTATION_STATUS.ACCEPTED, label: 'Accepted', count: stats?.accepted ?? 0 },
    { key: QUOTATION_STATUS.REJECTED, label: 'Rejected', count: stats?.rejected ?? 0 }
  ];

  /* The RFQ this list is scoped to (empty on the global list). */
  const rfqScope = filters.rfqNo && filters.rfqNo !== 'All' ? filters.rfqNo : '';
  const hasStatusFilter = Boolean(filters.status) && filters.status !== 'All';

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}${rfqScope ? ` · ${rfqScope}` : ''}`;

  /* Refresh list + stats together (toolbar button, entry modal, mutations). */
  const refreshAll = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  const handleRowAction = (key, row) => {
    if (key === 'view') {
      navigate(`/purchase/rfq/quotations/${row.id}`);
    } else if (key === 'compare') {
      navigate(`/purchase/rfq/compare?rfq=${row.rfqNo}`);
    } else if (key === 'print') {
      const exportCols = columns
        .filter((col) => col.key !== 'actions')
        .map((col) => ({ key: col.key, label: col.label }));
      printTable(`Vendor Quotation ${row.id}`, exportCols, [row]);
    } else if (key === 'accept') {
      setStatusTarget({ quote: row, status: QUOTATION_STATUS.ACCEPTED });
    } else if (key === 'reject') {
      setStatusTarget({ quote: row, status: QUOTATION_STATUS.REJECTED });
    }
  };

  const confirmStatus = async () => {
    if (!statusTarget) return;
    const { quote, status } = statusTarget;
    const result = await runMutation(() => rfqService.saveQuotation({ ...quote, status }));
    if (result.ok) {
      toast.success(`Quote ${quote.id} marked as ${status.toLowerCase()}`);
      setStatsVersion((v) => v + 1);
    } else {
      toast.error(result.error?.message || 'Failed to update quotation');
    }
    setStatusTarget(null);
  };

  const renderers = useMemo(
    () => ({
      id: (row) => (
        <button
          type="button"
          onClick={() => navigate(`/purchase/rfq/quotations/${row.id}`)}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
          title={`View quotation ${row.id}`}
        >
          <span className="block leading-tight">{row.quotationNo || row.id}</span>
          <span className="block text-[10px] font-medium text-slate-400 leading-tight">QT-{String(row.id).padStart(3, '0')}</span>
        </button>
      ),
      rfqNo: (row) => <span className="text-slate-600 whitespace-nowrap">{row.rfqNo || '—'}</span>,
      vendor: (row) => <span className="text-xs font-semibold text-slate-800">{row.vendor || '—'}</span>,
      submittedOn: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.submittedOn)}</span>,
      validUntil: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.validUntil)}</span>,
      delivery: (row) => <span className="text-slate-600">{row.delivery ? `${row.delivery} days` : '—'}</span>,
      leadTime: (row) => <span className="text-slate-600">{row.leadTime ? `${row.leadTime} days` : '—'}</span>,
      paymentTerms: (row) => <span className="text-slate-600">{row.paymentTerms || '—'}</span>,
      score: (row) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
          row.score >= 75 ? 'bg-emerald-50 text-emerald-700' : row.score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
        }`}>
          {row.score ?? '—'}
        </span>
      ),
      discount: (row) => <span className="text-slate-600 tabular-nums">{row.discount ? `${row.discount}%` : '—'}</span>,
      total: (row) => (
        <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.total, row.currency)}</span>
      ),
      status: (row) => <PurchaseStatusCell status={row.status} />
    }),
    [navigate]
  );

  const activeFilterCount = ['status', 'rfqNo'].filter((key) => filters[key] && filters[key] !== 'All').length;

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleFilters = () => setFilterOpen((prev) => !prev);

  const applyFilters = () => {
    if (draftFilters.status) setFilter('status', draftFilters.status);
    if (draftFilters.rfqNo) setFilter('rfqNo', draftFilters.rfqNo);
    /* Keep the deep-link param in step with the RFQ chosen here, so the URL,
       the filter and the list never disagree (a refresh would otherwise
       re-apply the scope the user just changed). */
    const chosenScope = draftFilters.rfqNo && draftFilters.rfqNo !== 'All' ? draftFilters.rfqNo : '';
    if (chosenScope !== rfqParam) {
      navigate(
        chosenScope ? `/purchase/rfq/quotations?rfq=${encodeURIComponent(chosenScope)}` : '/purchase/rfq/quotations',
        { replace: true }
      );
    }
    setSelectedIds([]);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    resetFilters();
    setSearchInput('');
    setSelectedIds([]);
    /* Drop the deep-link scope as well, so the URL and the list agree and a
       refresh cannot silently re-apply the RFQ filter the user just cleared. */
    if (rfqParam) navigate('/purchase/rfq/quotations', { replace: true });
  };

  const handleExport = async (type) => {
    try {
      const result = await rfqService.getQuotations({
        search,
        status: filters.status || 'All',
        rfqNo: filters.rfqNo || 'All',
        page: 1,
        pageSize: 10000
      });
      if (type === 'csv') exportCsv(columns, result.data, 'vendor-quotations');
      else if (type === 'excel') await exportExcel(columns, result.data, 'vendor-quotations');
      else if (type === 'pdf') await exportPdf({ title: 'Vendor Quotations', columns, records: result.data, filename: 'vendor-quotations' });
      else if (type === 'print') printTable('Vendor Quotations', columns, result.data);
      toast.success('Quotations exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export quotations');
    }
  };

  const bulkActions = useMemo(
    () => [
      { key: 'export', label: 'Export', icon: Download },
      { key: 'accept', label: 'Accept', icon: CheckCircle2 },
      { key: 'reject', label: 'Reject', icon: XCircle, danger: true }
    ],
    []
  );

  /* Bulk actions — Export always; Accept / Reject only touch rows still in
     Received status so a mixed selection never fails the whole batch. */
  const handleBulk = async (key, ids) => {
    if (key === 'export') {
      try {
        const result = await rfqService.getQuotations({
          search,
          status: filters.status || 'All',
          rfqNo: filters.rfqNo || 'All',
          page: 1,
          pageSize: 10000
        });
        const selected = result.data.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No quotations selected to export');
          return;
        }
        exportCsv(columns, selected, 'vendor-quotations-selected');
        toast.success(`${selected.length} quotation(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export quotations');
      }
      return;
    }
    const nextStatus =
      key === 'accept' ? QUOTATION_STATUS.ACCEPTED : key === 'reject' ? QUOTATION_STATUS.REJECTED : null;
    if (!nextStatus) return;
    const eligible = records.filter((row) => ids.includes(row.id) && row.status === QUOTATION_STATUS.RECEIVED);
    if (eligible.length === 0) {
      toast.info('None of the selected quotations are in Received status');
      return;
    }
    const result = await runMutation(() =>
      Promise.all(eligible.map((quote) => rfqService.saveQuotation({ ...quote, status: nextStatus })))
    );
    if (result.ok) {
      toast.success(`${eligible.length} quotation(s) marked as ${nextStatus.toLowerCase()}`);
      setSelectedIds([]);
      setStatsVersion((v) => v + 1);
    } else {
      toast.error(result.error?.message || 'Failed to update quotations');
    }
  };

  /* Empty state — a search miss, an RFQ scope with nothing received yet, a
     status filter with no matches and the global "nothing yet" state all
     read differently; the RFQ-scoped one must never look like a search miss. */
  const emptyContent =
    search ? (
      <PurchaseEmptyState
        icon={Search}
        title="No Matching Quotations"
        message="No quotations matching your search criteria."
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
            <X size={12} /> Clear Search
          </button>
        }
      />
    ) : rfqScope && !hasStatusFilter ? (
      <PurchaseEmptyState
        icon={Inbox}
        title="No Quotations Received"
        message={`No quotations have been received for ${rfqScope} yet.`}
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
            <X size={12} /> Show All Quotations
          </button>
        }
      />
    ) : hasFilters ? (
      <PurchaseEmptyState
        icon={Search}
        title="No Matching Quotations"
        message="No quotations matching your search criteria."
        action={
          <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
            <X size={12} /> Clear Search
          </button>
        }
      />
    ) : (
      <PurchaseEmptyState
        icon={Inbox}
        title="No Quotations Found"
        message="Quotations received from vendors will appear here."
      />
    );

  return (
    <PurchaseListPage
      flowNav={<RfqTabNav />}
      header={{
        crumb: [
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Quotations' }
        ],
        icon: Inbox,
        title: 'Vendor Quotations',
        subtitle: 'Track and record quotations received from invited vendors',
        actions: (
          <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/rfq/quotations/new')}>
            <span className="erp-btn-icon"><Plus size={16} /></span> Record Quotation
          </button>
        )
      }}
      error={error}
      onRetry={refreshAll}
      kpis={{ cards: kpiCards }}
      tabs={{
        primary: {
          label: 'All Quotations',
          count: stats?.total ?? 0,
          onSelect: () => {
            setFilter('status', 'All');
            setSelectedIds([]);
          }
        },
        segments: {
          tabs: segments,
          activeKey: filters.status,
          onSelect: (status) => {
            setFilter('status', status);
            setSelectedIds([]);
          },
          ariaLabel: 'Quotation status'
        }
      }}
      toolbar={{
        count: pageInfo,
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshAll}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="quotationSearchInput"
              placeholder="Search by vendor or RFQ..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Quotations"
            />
            <PurchaseExportDropdown buttonLabel="Export Quotations" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'quotationFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'status', id: 'vq-status', label: 'Status', value: draftFilters.status || 'All',
            options: [{ value: 'All', label: 'All Status' }, ...Object.values(QUOTATION_STATUS).map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, status: v }))
          },
          {
            key: 'rfqNo', id: 'vq-rfq', label: 'RFQ', value: draftFilters.rfqNo || 'All',
            options: [{ value: 'All', label: 'All RFQs' }, ...rfqOptions.map((rfq) => ({ value: rfq.rfqNo, label: rfq.rfqNo }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, rfqNo: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'quotationBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) =>
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        sortKey,
        sortDirection,
        onSort: toggleSort,
        /* Pending highlight — the shared light-orange identification
           wash on the checkbox + quotation cells for received
           quotations still awaiting an accept / reject decision;
           accepted / rejected / pending placeholders stay normal. */
        rowClass: (row) => pendingWorkClass(isQuotationPending(row)),
        idColumn: 'id',
        tableId: 'quotationTable',
        alignCenter: ['currency', 'delivery', 'leadTime', 'score', 'status'],
        alignRight: ['discount', 'total'],
        rowActions: (row) => [
          { key: 'view', label: 'View Quotation', icon: Eye },
          { key: 'compare', label: 'Compare Quotes', icon: Scale },
          { key: 'print', label: 'Print', icon: Printer },
          ...(row.status === QUOTATION_STATUS.RECEIVED
            ? [
                { key: 'accept', label: 'Accept Quote', icon: CheckCircle2 },
                { key: 'reject', label: 'Reject Quote', icon: XCircle, danger: true }
              ]
            : [])
        ],
        onRowAction: handleRowAction,
        emptyContent
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
    >
      <ConfirmDialog
        open={statusTarget !== null}
        title={statusTarget?.status === QUOTATION_STATUS.ACCEPTED ? 'Accept quotation?' : 'Reject quotation?'}
        message={
          statusTarget?.status === QUOTATION_STATUS.ACCEPTED
            ? `Quote ${statusTarget?.quote?.id} from ${statusTarget?.quote?.vendor} will be marked as accepted.`
            : `Quote ${statusTarget?.quote?.id} from ${statusTarget?.quote?.vendor} will be marked as rejected.`
        }
        confirmLabel={statusTarget?.status === QUOTATION_STATUS.ACCEPTED ? 'Accept' : 'Reject'}
        variant={statusTarget?.status === QUOTATION_STATUS.ACCEPTED ? 'default' : 'danger'}
        icon={statusTarget?.status === QUOTATION_STATUS.ACCEPTED ? CheckCircle2 : XCircle}
        loading={actionLoading}
        onConfirm={confirmStatus}
        onCancel={() => setStatusTarget(null)}
      />
    </PurchaseListPage>
  );
}
