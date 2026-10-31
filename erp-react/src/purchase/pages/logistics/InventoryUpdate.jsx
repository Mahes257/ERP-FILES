/**
 * purchase/pages/logistics/InventoryUpdate.jsx
 * ------------------------------------------------------------------
 * Inventory Update — stock movement ledger (receipts, adjustments,
 * issues) with a modal to add a manual inventory update. Built on the
 * shared Purchase list kit so it matches the master list design.
 *
 * Every movement reference links to its Inventory Detail page and the
 * three-dot row menu provides functional actions only:
 *   · View Movement      → /purchase/logistics/inventory/:id
 *   · View GRN / PO      → the actual source document (when linked)
 *   · Reverse Movement   → equal-and-opposite ledger entry (manual
 *                          movements only, once per movement)
 *   · Add Movement       → opens the entry modal below
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Boxes, Download, Eye, Filter, Loader2, PackageCheck, Plus, RefreshCw, Search, SlidersHorizontal, Undo2, X
} from 'lucide-react';
import { Modal, TextArea, useToast } from '../../components/ui';
import { FormField, SelectInput, TextInput } from '../../components/ui/FormControls';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown
} from '../../components/list';
import { logisticsService, INVENTORY_TYPE, RECEIVING_MAX_PAGE_SIZE, grnsStore } from '../../services/logistics';
import { ordersStore } from '../../services/purchaseOrder';
import usePurchaseList from '../../hooks/usePurchaseList';
import useDebounce from '../../hooks/useDebounce';
import { formatDate } from '../../utils/helpers';
import { exportCsv } from '../../utils/export';
import { movementPreview, transferPreview, MOVEMENT_QUANTITY_HINT } from '../../utils/inventoryMovement';
import ModuleTabNav from '../../components/ModuleTabNav';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

const COLUMNS = [
  { key: 'id', label: 'Ref No', width: 120, sortable: true, visible: true, sticky: 'left' },
  { key: 'sku', label: 'SKU', width: 120, sortable: true, visible: true },
  { key: 'product', label: 'Product', width: 220, sortable: true, visible: true },
  { key: 'warehouse', label: 'Warehouse', width: 140, sortable: true, visible: true },
  { key: 'type', label: 'Type', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'before', label: 'Before Qty', width: 100, sortable: true, visible: true, align: 'right' },
  { key: 'delta', label: 'Delta', width: 100, sortable: true, visible: true, align: 'right' },
  { key: 'after', label: 'After Qty', width: 100, sortable: true, visible: true, align: 'right' },
  { key: 'reference', label: 'Reference', width: 150, sortable: true, visible: true },
  { key: 'updatedBy', label: 'Updated By', width: 130, sortable: true, visible: true },
  { key: 'updatedOn', label: 'Updated At', width: 120, sortable: true, visible: true },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

const KPI_DEFS = [
  { key: 'total', label: 'Total Movements', icon: Boxes, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'receipts', label: 'Receipts', icon: ArrowDownToLine, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'adjustments', label: 'Adjustments', icon: SlidersHorizontal, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'issues', label: 'Issues', icon: ArrowUpFromLine, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  { key: 'netMovement', label: 'Net Movement', icon: Boxes, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const emptyForm = () => ({
  sku: '',
  product: '',
  warehouse: 'Plant A Store',
  type: INVENTORY_TYPE.ADJUSTMENT,
  quantity: '',
  fromLocation: '',
  toWarehouse: '',
  toLocation: '',
  reference: '',
  notes: '',
  updatedBy: 'Stores Team'
});

/* ── helpers ─────────────────────────────────────────────────────── */
function grnExists(no) {
  return Boolean(no) && grnsStore.all.some((entry) => entry.grnNo === no || entry.id === no);
}

function poExists(no) {
  return Boolean(no) && ordersStore.all.some((entry) => entry.poNo === no || entry.id === no);
}

/** Only manual movements (not inspection-posted, not already reversed,
 *  not reversal entries themselves) can be reversed in place. */
const canReverse = (row) => !row.inspectionNo && !row.reversalOf && !row.reversalId;

export default function InventoryUpdate() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreateInventory = can('inventory', 'create');
  const canEditInventory = can('inventory', 'edit');
  const toast = useToast();

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize }) => {
      const response = await logisticsService.getInventory({
        search,
        type: filters.type || 'All',
        page,
        pageSize
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
    filters,
    setSearch,
    setFilter,
    resetFilters,
    goToPage,
    changePageSize,
    refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formErrors, setFormErrors] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeKpi, setActiveKpi] = useState('total');

  /* Reverse-movement confirm state */
  const [reverseTarget, setReverseTarget] = useState(null);
  const [reverseNotes, setReverseNotes] = useState('');

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    }, 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setSelectedIds([]), 0);
    return () => clearTimeout(timer);
  }, [filters.type]);

  useEffect(() => {
    let cancelled = false;
    logisticsService
      .getInventoryStats()
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshStats = () => {
    logisticsService.getInventoryStats().then(setStats).catch(() => {});
  };

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
  const selectKpi = (key) => {
    const newKey = activeKpi === key ? 'total' : key;
    setActiveKpi(newKey);
    if (newKey === 'total') {
      setFilter('type', 'All');
    } else if (newKey === 'receipts') {
      setFilter('type', INVENTORY_TYPE.RECEIPT);
    } else if (newKey === 'adjustments') {
      setFilter('type', INVENTORY_TYPE.ADJUSTMENT);
    } else if (newKey === 'issues') {
      setFilter('type', INVENTORY_TYPE.ISSUE);
    } else if (newKey === 'transfers') {
      setFilter('type', INVENTORY_TYPE.TRANSFER);
    } else if (newKey === 'netMovement') {
      setFilter('type', 'All');
    }
  };

  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  /* ── Live on-hand preview for the Add Movement modal ── */
  const [stockPreview, setStockPreview] = useState(null);
  const [toStockPreview, setToStockPreview] = useState(null);
  const isTransfer = form.type === INVENTORY_TYPE.TRANSFER;
  const stockLookupKey = `${form.sku.trim()}|${form.product.trim()}|${form.warehouse.trim()}`;
  const toStockLookupKey = `${form.sku.trim()}|${form.product.trim()}|${form.toWarehouse.trim()}`;
  useEffect(() => {
    let cancelled = false;
    if (modalOpen && form.warehouse.trim() && (form.sku.trim() || form.product.trim())) {
      logisticsService
        .getInventoryLedgerForItem({ sku: form.sku, product: form.product, warehouse: form.warehouse })
        .then((data) => {
          if (!cancelled) setStockPreview({ onHand: data.onHand, key: stockLookupKey });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, stockLookupKey]);
  /* Destination on-hand for transfers. */
  useEffect(() => {
    let cancelled = false;
    if (modalOpen && isTransfer && form.toWarehouse.trim() && (form.sku.trim() || form.product.trim())) {
      logisticsService
        .getInventoryLedgerForItem({ sku: form.sku, product: form.product, warehouse: form.toWarehouse })
        .then((data) => {
          if (!cancelled) setToStockPreview({ onHand: data.onHand, key: toStockLookupKey });
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, isTransfer, toStockLookupKey]);

  /* Only trust preview state that matches the current form values. */
  const stock = stockPreview && stockPreview.key === stockLookupKey ? stockPreview : null;
  const toStock = toStockPreview && toStockPreview.key === toStockLookupKey ? toStockPreview : null;
  const preview = isTransfer
    ? movementPreview(form.type, 0, stock?.onHand ?? 0)
    : movementPreview(form.type, form.quantity, stock?.onHand ?? 0);
  const transferView = isTransfer
    ? transferPreview(form.quantity, stock?.onHand ?? 0, toStock?.onHand ?? 0)
    : null;

  const openAddModal = () => {
    setForm(emptyForm());
    setFormErrors({});
    setStockPreview(null);
    setToStockPreview(null);
    setModalOpen(true);
  };

  const closeAddModal = () => {
    setModalOpen(false);
    setStockPreview(null);
    setToStockPreview(null);
    setFormErrors({});
  };

  const submit = async () => {
    const nextErrors = {};
    if (!form.sku.trim() && !form.product.trim()) nextErrors.sku = 'Enter a SKU or product name';
    if (!form.warehouse.trim()) nextErrors.warehouse = `${isTransfer ? 'Source' : ''} Warehouse is required`;
    if (isTransfer && !form.toWarehouse.trim()) nextErrors.toWarehouse = 'Destination warehouse is required';
    const qty = Number(form.quantity);
    if (form.quantity === '' || form.quantity == null || !Number.isFinite(qty) || qty === 0) {
      nextErrors.quantity = 'Enter a non-zero quantity';
    }
    if (isTransfer && qty < 0) nextErrors.quantity = 'Transfer quantity must be positive';
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    const result = isTransfer
      ? await runMutation(() =>
          logisticsService.transferStock({
            sku: form.sku.trim(),
            product: form.product.trim(),
            quantity: qty,
            fromWarehouse: form.warehouse.trim(),
            toWarehouse: form.toWarehouse.trim(),
            fromLocation: form.fromLocation.trim(),
            toLocation: form.toLocation.trim(),
            reference: form.reference.trim(),
            notes: form.notes.trim(),
            updatedBy: form.updatedBy.trim() || 'Stores Team'
          })
        )
      : await runMutation(() =>
          logisticsService.addInventoryUpdate({
            sku: form.sku.trim(),
            product: form.product.trim(),
            warehouse: form.warehouse.trim(),
            type: form.type,
            quantity: qty,
            reference: form.reference.trim(),
            notes: form.notes.trim(),
            updatedBy: form.updatedBy.trim() || 'Stores Team'
          })
        );
    if (result.ok) {
      if (isTransfer) {
        toast.success(`Transfer recorded — ${result.data.source.id} → ${result.data.destination.id}`);
      } else {
        toast.success(`${result.data.id} recorded — ${preview.delta > 0 ? '+' : ''}${preview.delta} units`);
      }
      setModalOpen(false);
      setForm(emptyForm());
      setStockPreview(null);
      setToStockPreview(null);
      setFormErrors({});
      refresh();
      refreshStats();
    } else {
      toast.error(result.error?.message || 'Failed to update inventory');
    }
  };

  const confirmReverse = async () => {
    if (!reverseTarget) return;
    const result = await runMutation(() =>
      logisticsService.reverseInventoryMovement(reverseTarget.id, {
        notes: reverseNotes.trim() || `Reversal of ${reverseTarget.id}`,
        updatedBy: 'Stores Team'
      })
    );
    setReverseTarget(null);
    setReverseNotes('');
    if (result.ok) {
      toast.success(`${reverseTarget.id} reversed (${result.data.id})`);
      refresh();
      refreshStats();
    } else {
      toast.error(result.error?.message || 'Failed to reverse movement');
    }
  };

  const handleExport = async (type) => {
    try {
      const result = await logisticsService.getInventory({
        search,
        type: filters.type || 'All',
        page: 1,
        /* The backend caps a page at this size — export reads the widest
           page the API allows, never the whole table. */
        pageSize: RECEIVING_MAX_PAGE_SIZE
      });
      if (type === 'csv') exportCsv(columns, result.data, 'inventory-update');
      toast.success('Inventory updates exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export inventory updates');
    }
  };

  const applyFilters = () => {
    if (draftFilters.type) setFilter('type', draftFilters.type);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    resetFilters();
    setSearchInput('');
  };

  const openMovement = (row) => navigate(`/purchase/logistics/inventory/${row.id}`);

  const renderers = useMemo(
    () => ({
      id: (row) => (
        <button
          type="button"
          onClick={() => openMovement(row)}
          title={`Open ${row.id}`}
          className="font-bold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
        >
          {row.id}
        </button>
      ),
      product: (row) => <span className="text-xs font-semibold text-slate-800">{row.product || '—'}</span>,
      type: (row) => (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
          row.type === INVENTORY_TYPE.RECEIPT
            ? 'bg-emerald-50 text-emerald-700'
            : row.type === INVENTORY_TYPE.ISSUE
              ? 'bg-amber-50 text-amber-600'
              : row.type === INVENTORY_TYPE.TRANSFER
                ? 'bg-violet-50 text-violet-700'
                : 'bg-sky-50 text-sky-600'
        }`}>
          {row.type === INVENTORY_TYPE.RECEIPT ? <ArrowDownToLine className="w-3 h-3" /> : row.type === INVENTORY_TYPE.ISSUE ? <ArrowUpFromLine className="w-3 h-3" /> : row.type === INVENTORY_TYPE.TRANSFER ? <ArrowLeftRight className="w-3 h-3" /> : <SlidersHorizontal className="w-3 h-3" />}
          {row.type}
        </span>
      ),
      before: (row) => <span className="text-slate-600 tabular-nums">{row.before}</span>,
      delta: (row) => (
        <span className={`font-bold tabular-nums ${row.delta > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </span>
      ),
      after: (row) => <span className="font-bold text-slate-800 tabular-nums">{row.after}</span>,
      reference: (row) => {
        const ref = row.reference ? String(row.reference) : '';
        if (/^GRN-/i.test(ref) && grnExists(ref)) {
          return (
            <button
              type="button"
              onClick={() => navigate(`/purchase/logistics/grn/${ref}`)}
              className="font-semibold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer whitespace-nowrap"
            >
              {ref}
            </button>
          );
        }
        if (/^PO-/i.test(ref) && poExists(ref)) {
          return (
            <button
              type="button"
              onClick={() => navigate(`/purchase/orders/${ref}`)}
              className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline cursor-pointer whitespace-nowrap"
            >
              {ref}
            </button>
          );
        }
        return (
          <span className="text-slate-600 whitespace-nowrap" title={row.reversalOf ? `Reverses ${row.reversalOf}` : ref}>
            {ref || (row.reversalOf ? `Reverses ${row.reversalOf}` : '—')}
          </span>
        );
      },
      updatedBy: (row) => <span className="text-xs text-slate-600">{row.updatedBy || '—'}</span>,
      updatedOn: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.updatedOn)}</span>
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate]
  );

  const rowActions = useMemo(
    () => (row) => {
      const actions = [{ key: 'view', label: 'View Movement', icon: Eye }];
      const ref = row.reference ? String(row.reference) : '';
      if ((row.grnNo && grnExists(row.grnNo)) || (/^GRN-/i.test(ref) && grnExists(ref))) {
        actions.push({ key: 'viewGrn', label: 'View GRN', icon: PackageCheck });
      }
      if (row.poNo && poExists(row.poNo)) {
        actions.push({ key: 'viewPo', label: 'View PO', icon: Eye });
      }
      if (canReverse(row) && canEditInventory) {
        actions.push({ key: 'reverse', label: 'Reverse Movement', icon: Undo2, danger: true });
      }
      if (canCreateInventory) actions.push({ key: 'addUpdate', label: 'Add Movement', icon: Plus });
      return actions;
    },
    []
  );

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'Logistics', to: '/purchase/logistics' },
          { label: 'Inventory Update' }
        ],
        icon: Boxes,
        title: 'Inventory Update',
        subtitle: 'Track stock movements from receipts, adjustments and issues.',
        actions: (
          <>
            {canCreateInventory && (
              <button
                type="button"
                className="erp-btn-primary"
                onClick={() => navigate('/purchase/logistics/inventory/new')}
              >
                <span className="erp-btn-icon"><Plus size={14} /></span> Add Stock Movement
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        )
      }}
      flowNav={<ModuleTabNav module="logistics" />}
      error={error}
      errorMessage="Failed to load inventory updates."
      onRetry={refresh}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi }}
      toolbar={{
        count: pageInfo,
        left: (
          <>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFilterOpen((prev) => !prev)}
              aria-label="Toggle filters"
              aria-expanded={filterOpen}
            >
              <Filter size={12} /> {filterOpen ? 'Hide Filters' : 'Show Filters'}
            </button>
            {(searchInput || filters.type) && (
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
              id="inventorySearchInput"
              placeholder="Search by SKU, product, warehouse, reference..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search Inventory Updates"
            />
            <PurchaseExportDropdown buttonLabel="Export Updates" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={['id', 'actions']}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'inventoryFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'type', id: 'inventory-type', label: 'Type', value: draftFilters.type || 'All',
            options: [{ value: 'All', label: 'All Types' }, ...Object.values(INVENTORY_TYPE).map((type) => ({ value: type, label: type }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, type: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: [
          { key: 'export', label: 'Export', icon: Download },
        ],
        onAction: (key) => {
          if (key === 'export') handleExport('csv');
        },
        id: 'inventoryBulkActionBar'
      }}
      table={{
        columns: columns.filter((col) => col.visible !== false),
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected: records.length > 0 && records.every((row) => selectedIds.includes(row.id)),
        someSelected: selectedIds.length > 0 && !(records.length > 0 && records.every((row) => selectedIds.includes(row.id))),
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) => setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        renderers,
        idColumn: 'id',
        tableId: 'inventoryTable',
        alignCenter: ['type'],
        alignRight: ['before', 'delta', 'after'],
        rowActions,
        onRowAction: (key, row) => {
          if (key === 'view') openMovement(row);
          else if (key === 'viewGrn') {
            const no = row.grnNo || (String(row.reference || '').startsWith('GRN-') ? row.reference : '');
            if (no && grnExists(no)) navigate(`/purchase/logistics/grn/${no}`);
          }
          else if (key === 'viewPo') {
            if (row.poNo && poExists(row.poNo)) navigate(`/purchase/orders/${row.poNo}`);
          }
          else if (key === 'reverse') {
            setReverseNotes('');
            setReverseTarget(row);
          }
          else if (key === 'addUpdate') openAddModal();
        },
        onRowClick: openMovement,
        emptyContent: (
          search ? (
            <PurchaseEmptyState
              icon={Search}
              title="No Matching Updates"
              message="No inventory updates matching your search criteria."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Search
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={Boxes}
              title="No Updates Found"
              message="No inventory updates found matching your criteria."
            />
          )
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
    >
      {/* ── Add Movement Modal ── */}
      <Modal
        open={modalOpen}
        onClose={closeAddModal}
        title="Add Stock Movement"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={closeAddModal}
              className="btn btn-ghost btn-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={actionLoading}
              className="po-btn po-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Record Movement
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="SKU" error={formErrors.sku} hint={form.sku ? '' : 'Either SKU or product name is required'}>
            <TextInput value={form.sku} onChange={set('sku')} error={!!formErrors.sku} placeholder="e.g. RM-STL-01" />
          </FormField>
          <FormField label="Product" error={formErrors.product}>
            <TextInput value={form.product} onChange={set('product')} error={!!formErrors.product} placeholder="Product description" />
          </FormField>
          <FormField label={isTransfer ? 'From Warehouse' : 'Warehouse'} error={formErrors.warehouse}>
            <TextInput value={form.warehouse} onChange={set('warehouse')} error={!!formErrors.warehouse} placeholder="e.g. Plant A Store" />
          </FormField>
          <FormField label="Movement Type">
            <SelectInput value={form.type} onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}>
              {Object.values(INVENTORY_TYPE).map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </SelectInput>
          </FormField>
          {isTransfer && (
            <>
              <FormField label="To Warehouse" error={formErrors.toWarehouse}>
                <TextInput value={form.toWarehouse} onChange={set('toWarehouse')} error={!!formErrors.toWarehouse} placeholder="e.g. Plant B Store" />
              </FormField>
              <FormField label="From Location (optional)">
                <TextInput value={form.fromLocation} onChange={set('fromLocation')} placeholder="e.g. Bay A1" />
              </FormField>
              <FormField label="To Location (optional)">
                <TextInput value={form.toLocation} onChange={set('toLocation')} placeholder="e.g. Bay B2" />
              </FormField>
            </>
          )}
          <FormField label="Quantity" required error={formErrors.quantity} hint={MOVEMENT_QUANTITY_HINT[form.type]}>
            <TextInput
              type="number"
              step="any"
              value={form.quantity}
              onChange={set('quantity')}
              error={!!formErrors.quantity}
              placeholder={form.type === INVENTORY_TYPE.ADJUSTMENT ? 'e.g. -5 or +5' : 'e.g. 40'}
            />
          </FormField>
          <FormField label="Reference">
            <TextInput value={form.reference} onChange={set('reference')} placeholder="e.g. Cycle count / GRN-2026-041" />
          </FormField>
          <FormField label="Updated By" className="sm:col-span-1">
            <TextInput value={form.updatedBy} onChange={set('updatedBy')} />
          </FormField>
        </div>

        {/* Live stock preview — computed the same way the service persists */}
        {isTransfer ? (
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{form.warehouse || 'From'} — After</div>
              <div className={`text-sm font-bold tabular-nums mt-0.5 ${transferView.from.after < 0 ? 'text-rose-600' : 'text-slate-800'}`}>{transferView.from.after}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">On hand {transferView.from.onHand} {transferView.from.delta < 0 ? `${transferView.from.delta}` : ''}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{form.toWarehouse || 'To'} — After</div>
              <div className="text-sm font-bold text-[#0B4A3D] tabular-nums mt-0.5">+{transferView.to.delta} → {transferView.to.after}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">On hand {transferView.to.onHand}</div>
            </div>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">On Hand</div>
              <div className="text-sm font-bold text-slate-800 tabular-nums mt-0.5">
                {stock ? stock.onHand : (form.sku.trim() || form.product.trim()) && form.warehouse.trim() ? '…' : 0}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Delta</div>
              <div className={`text-sm font-bold tabular-nums mt-0.5 ${preview.delta > 0 ? 'text-emerald-700' : preview.delta < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                {preview.delta > 0 ? `+${preview.delta}` : preview.delta}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">After</div>
              <div className="text-sm font-bold text-[#0B4A3D] tabular-nums mt-0.5">{preview.after}</div>
            </div>
          </div>
        )}

        <div className="mt-4">
          <FormField label="Notes">
            <TextArea rows={2} value={form.notes} onChange={set('notes')} placeholder="Reason / context for this movement (optional)" />
          </FormField>
        </div>
      </Modal>

      {/* ── Reverse Movement Confirm ── */}
      <Modal
        open={reverseTarget !== null}
        onClose={() => setReverseTarget(null)}
        title={`Reverse ${reverseTarget?.id || ''}?`}
        maxWidth="max-w-md"
        footer={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setReverseTarget(null)}>
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmReverse}
              disabled={actionLoading}
              className="po-btn po-btn-danger disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {actionLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Reverse Movement
            </button>
          </>
        }
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg shrink-0 bg-rose-50 text-rose-500">
            <Undo2 className="w-5 h-5" />
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">
            This posts an equal-and-opposite movement (
            {reverseTarget ? `${reverseTarget.delta > 0 ? '-' : '+'}${Math.abs(reverseTarget.delta || 0)}` : ''}{' '}
            units) that returns stock to its prior balance. The original movement is kept for the audit trail.
          </p>
        </div>
        <div className="mt-4">
          <FormField label="Reason (optional)">
            <TextArea rows={2} value={reverseNotes} onChange={(e) => setReverseNotes(e.target.value)} placeholder="Why is this movement being reversed?" />
          </FormField>
        </div>
      </Modal>
    </PurchaseListPage>
  );
}
