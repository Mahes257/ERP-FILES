import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Calculator,
  CheckCheck,
  CheckCircle,
  ClipboardList,
  Clock,
  Copy,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  IndianRupee,
  Pencil,
  Printer,
  RotateCcw,
  ScanSearch,
  Search,
  Send,
  Trash2,
  X,
  XCircle
} from 'lucide-react';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import { ConfirmDialog, NewCreationMenu, RecordOpenPopover, useToast } from '../../components/Common';
import { ManageColumnsButton } from '../../components/GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { CprActionMenu, CprPagination, CprTable } from '../../components/CprTable';
import useClickOutside from '../../hooks/useClickOutside';
import useProfitWorkouts from '../../hooks/useProfitWorkouts';
import profitWorkoutService from '../../services/profitWorkoutService';
import DocRevisionCell from '../../components/SalesTable/DocRevisionCell';
import StatusBadge from '../../components/Common/StatusBadge';
import { pwStatusMeta } from '../../utils/profitWorkoutHelpers';
import { PW_STATUSES } from '../../utils/profitWorkoutConstants';
import { exportPwsBulkCsv, exportPwsCsv, exportPwsExcel, exportPwsPdf, printPws } from '../../utils/profitWorkoutExportUtils';
import { buildExportFilename, formatDate, formatINR } from '../../utils/leadHelpers';
import '../crm/crm-erp.css';

const KPI_CARDS = [
  { key: 'total', label: 'Total Profit Workouts', icon: Calculator, color: '#0B4A3D' },
  { key: 'draft', label: 'Draft', icon: Pencil, color: '#6b7280' },
  { key: 'completed', label: 'Completed', icon: CheckCircle, color: '#059669' },
  { key: 'approved', label: 'Approved', icon: CheckCheck, color: '#16a34a' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: '#dc2626' },
  { key: 'totalvalue', label: 'Total Cost Value', icon: IndianRupee, color: '#ec4899', currency: true }
];

const COLUMNS = [
  { key: 'checkbox', label: '', width: 48, always: true },
  { key: 'date', label: 'Date', width: 120, sortable: true },
  { key: 'pwNo', label: 'PW No', width: 160, sortable: true, mandatory: true },
  { key: 'cprRef', label: 'CPR No', width: 160, sortable: true },
  { key: 'customerName', label: 'Customer', width: 200, sortable: true },
  { key: 'company', label: 'Company', width: 200, sortable: true },
  { key: 'description', label: 'Description', width: 260 },
  { key: 'preparedBy', label: 'Prepared By', width: 150, sortable: true },
  { key: 'subtotal', label: 'Total Cost', width: 130, align: 'right', sortable: true },
  { key: 'profitPct', label: 'Profit %', width: 100, align: 'right', sortable: true },
  { key: 'sellingPrice', label: 'Total Selling Value', width: 150, align: 'right', sortable: true },
  { key: 'status', label: 'Status', width: 130, mandatory: true },
  { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
];

function itemDescription(cw) {
  const items = Array.isArray(cw.items) ? cw.items : [];
  return items.map((it) => it.description || '').filter(Boolean).join(', ');
}

function PwStatusBadge({ status }) {
  return <StatusBadge status={status} />;
}

export default function ProfitWorkouts({ moduleTab, onModuleTabChange, embedded }) {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    data,
    totalCount,
    loading,
    stats,
    tabCounts,
    pagination: { page, pageSize, totalPages },
    searchInput,
    sortKey,
    sortDir,
    filters,
    activeKpi,
    subtab,
    setSearch,
    clearSearch,
    setFilter,
    resetFilters,
    selectKpi,
    switchSubtab,
    goToPage,
    changePageSize,
    toggleSort,
    archivePw,
    restorePw,
    deletePw,
    permanentDeletePw,
    submitPw,
    duplicatePw,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  } = useProfitWorkouts();

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Manageable + resizable columns, restored from MySQL on every open.
  const grid = useManagedGrid({
    gridKey: 'sales.list.profitworkout',
    defaults: COLUMNS,
    allowCustom: false,
    protectedKeys: ['checkbox', 'actions']
  });
  const [confirm, setConfirm] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Record open popover
  const [recordPopover, setRecordPopover] = useState(null);

  const exportRef = useRef(null);
  useClickOutside(exportRef, () => setExportOpen(false), exportOpen);

  const pageRows = data;

  const visibleColumns = grid.visibleColumns;

  const toggleSelect = (id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectAll = (checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) pageRows.forEach((row) => next.add(row.id));
      else pageRows.forEach((row) => next.delete(row.id));
      return next;
    });
  };

  // ERP action-menu.js 'profit-workout' generator replica: exact items, order,
  // labels and subtab behaviour. Deleted tab shows Restore + Permanent Delete;
  // Active/Archived tabs show the full ERP menu.
  const buildRowActions = (row) => {
    if (subtab === 2) {
      return [
        { key: 'restore', label: 'Restore', icon: RotateCcw },
        { divider: true },
        { key: 'permanentDelete', label: 'Permanent Delete', icon: XCircle, danger: true }
      ];
    }
    const status = String(row.status || 'draft').toLowerCase();
    // Historical revisions are read-only: no edit/duplicate/submit/delete.
    const isHistorical = row.latestRevision === false;
    const items = [
      { key: 'view', label: 'View', icon: Eye },
      { key: 'preview', label: 'Preview', icon: ScanSearch },
      { key: 'print', label: 'Print', icon: Printer },
      ...(!isHistorical ? [{ key: 'edit', label: 'Edit', icon: Pencil }] : [])
    ];
    // Profit Workout → Quotation opens the prefilled Quotation creation form —
    // the same navigation-only pattern as Cost Workout → Quotation (nothing is
    // persisted until the user saves there). It stays available on every record,
    // with no dependency on status, approval state or CPR link, exactly as
    // before. Already-converted records offer Open Quotation instead, so a
    // duplicate conversion can never be started from the list.
    if (row.convertedToQtn) {
      items.push({ key: 'openQuotation', label: 'Open Quotation', icon: FileText });
    } else {
      items.push({ key: 'convertToQuotation', label: 'Convert to Quotation', icon: FileText });
    }
    if (!isHistorical) {
      items.push({ key: 'duplicate', label: 'Duplicate', icon: Copy });
      items.push({ divider: true });
      // ERP: Submit for Approval — only for drafts.
      if (status === 'draft' || status === '') {
        items.push({ key: 'submit', label: 'Submit for Approval', icon: Send });
        items.push({ divider: true });
      }
    }
    // ERP: Open CPR — only when a linked CPR reference exists.
    if (row.cprRef) {
      items.push({ key: 'openCpr', label: 'Open CPR', icon: ClipboardList });
      items.push({ divider: true });
    }
    items.push({ key: 'activityLog', label: 'Activity Log', icon: Clock });
    items.push({ divider: true });
    if (!isHistorical) {
      if (status === 'archived') items.push({ key: 'restore', label: 'Restore', icon: RotateCcw });
      else items.push({ key: 'archive', label: 'Archive', icon: Archive });
      items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return items;
  };

  const runRowAction = (key, row) => {
    switch (key) {
      case 'view':
        navigate(`/profit-workouts/${row.id}`);
        break;
      // Preview opens the dedicated Profit Workout document preview/edit page.
      case 'preview':
        navigate(`/profit-workouts/design?id=${row.id}`);
        break;
      // Print opens the same Profit Workout document format and triggers the
      // browser print dialog once the document has loaded (design?print=1).
      case 'print':
        navigate(`/profit-workouts/design?id=${row.id}&print=1`);
        break;
      case 'edit':
        navigate(`/profit-workouts/${row.id}/edit`);
        break;
      case 'duplicate':
        duplicateRow(row);
        break;
      case 'convertToQuotation':
        // Opens the Quotation creation form prefilled from this Profit Workout.
        // Read-only navigation: no quotation is created here.
        navigate(`/quotations/new?sourcePw=${row.id}`);
        break;
      case 'openQuotation':
        // Already converted: the quotation exists (row.convertedToQtn, the PW's
        // own conversion reference). Open the Quotations list to view it.
        navigate('/quotations');
        break;
      case 'submit':
        setConfirm({ type: 'submit', ids: [row.id], label: row.pwNo });
        break;
      case 'openCpr':
        // ERP: opens the linked CPR record. Prefer the numeric cprId (the CPR
        // view endpoint requires a Long id); fall back to the CPR list when
        // only the prNo string reference is available.
        if (row.cprId) navigate(`/cprs/${row.cprId}`);
        else navigate('/cprs');
        break;
      case 'activityLog':
        navigate(`/profit-workouts/${row.id}`);
        break;
      case 'archive':
        setConfirm({ type: 'archive', ids: [row.id], label: row.pwNo });
        break;
      case 'restore':
        setConfirm({ type: 'restore', ids: [row.id], label: row.pwNo });
        break;
      case 'delete':
        setConfirm({ type: 'delete', ids: [row.id], label: row.pwNo });
        break;
      case 'permanentDelete':
        setConfirm({ type: 'permanentDelete', ids: [row.id], label: row.pwNo });
        break;
      default:
        break;
    }
  };

  const duplicateRow = async (row) => {
    const res = await duplicatePw(row.id);
    if (res.ok) {
      const data = res.data?.data ?? {};
      toast.success(`Profit Workout duplicated as ${data.pwNo || row.pwNo}`);
    } else {
      toast.error(res.error?.message || 'Failed to duplicate Profit Workout');
    }
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const { type, ids, label } = confirm;
    let res;
    if (type === 'archive') {
      res = ids.length === 1 ? await archivePw(ids[0]) : await bulkArchive(ids);
    } else if (type === 'restore') {
      res = ids.length === 1 ? await restorePw(ids[0]) : await bulkRestore(ids);
    } else if (type === 'delete') {
      res = ids.length === 1 ? await deletePw(ids[0]) : await bulkDelete(ids);
    } else if (type === 'permanentDelete') {
      res = ids.length === 1 ? await permanentDeletePw(ids[0]) : await bulkPermanentDelete(ids);
    } else if (type === 'submit') {
      // ERP parity: submit is a single-row action (draft CWs only). A bulk path
      // must never swallow per-item failures, so keep it explicit.
      if (ids.length === 1) {
        res = await submitPw(ids[0]);
      } else {
        const results = await Promise.all(ids.map((id) => submitPw(id)));
        res = results.every((r) => r && r.ok) ? { ok: true } : { ok: false, error: { message: 'One or more submissions failed' } };
      }
    }
    if (res?.ok) {
      if (type === 'submit') toast.success(confirm?.count != null ? `${confirm.count} PW(s) submitted for approval` : `${label} submitted for approval`);
      else if (type === 'archive') toast.success(confirm?.count != null ? `${confirm.count} PW(s) archived` : `${label} archived`);
      else if (type === 'restore') toast.success(confirm?.count != null ? `${confirm.count} PW(s) restored` : `${label} restored`);
      else if (type === 'delete') toast.success(confirm?.count != null ? `${confirm.count} PW(s) moved to trash` : `${label} moved to trash`);
      else if (type === 'permanentDelete') toast.success(confirm?.count != null ? `${confirm.count} PW(s) permanently deleted` : `${label} permanently deleted`);
    } else {
      toast.error(res?.error?.message || 'Operation failed');
    }
    setSelectedIds(new Set());
    setConfirm(null);
  };

  const exportCurrent = () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to export');
      return;
    }
    exportPwsCsv(data, buildExportFilename('Profit_Workout_List'));
    toast.success('Profit Workout list exported as CSV');
  };

  const exportPdf = async () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      await exportPwsPdf(data, buildExportFilename('Profit_Workout_List'));
      toast.success('Profit Workout list exported as PDF');
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  const exportExcel = async () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      await exportPwsExcel(data, buildExportFilename('Profit_Workout_List'));
      toast.success('Profit Workout list exported as Excel');
    } catch (err) {
      toast.error(err?.message || 'Excel export failed');
    }
  };

  const exportPrint = () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to print');
      return;
    }
    printPws(data);
  };

  // ERP cwBulkExport (profit-workout-list.html): selected rows only, exact 10-column
  // CSV, filename 'ProfitWorkout_Bulk_YYYY-MM-DD.csv', selection cleared after.
  const exportSelected = () => {
    if (selectedIds.size === 0) {
      toast.warning('No items selected');
      return;
    }
    const rows = data.filter((cw) => selectedIds.has(cw.id));
    exportPwsBulkCsv(rows, `ProfitWorkout_Bulk_${new Date().toISOString().substring(0, 10)}`);
    setSelectedIds(new Set());
  };

  const renderCell = (key, row) => {
    switch (key) {
      case 'date':
        return <span className="text-slate-500">{formatDate(row.pwDate)}</span>;
      case 'pwNo':
        // Latest revision of a chain gets the revision-history dropdown
        // (each entry opens its exact read-only view).
        if (row && Number(row.revision) > 0) {
          return (
            <DocRevisionCell
              row={row}
              navigate={navigate}
              getDoc={(id) => profitWorkoutService.getPw(id)}
              viewRoute={(rev) => `/profit-workouts/${rev.id}`}
              numberField="pwNo"
            />
          );
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRecordPopover({
                label: row.pwNo,
                type: 'Profit Workout',
                route: `/profit-workouts/${row.id}`,
                onExisting: () => navigate(`/profit-workouts/${row.id}`),
                anchorRef: { current: e.currentTarget.parentElement }
              });
            }}
            className="text-[#0B4A3D] hover:underline font-semibold cursor-pointer"
          >
            {row.pwNo}
          </button>
        );
      case 'cprRef':
        return <span className="font-medium">{row.cprRef || '—'}</span>;
      case 'customerName':
        return <span className="font-semibold text-slate-700">{row.customerName || '—'}</span>;
      case 'company':
        return row.company || '—';
      case 'description':
        return <span title={itemDescription(row)}>{itemDescription(row) || '—'}</span>;
      case 'preparedBy':
        return row.preparedBy || '—';
      case 'subtotal':
        return <span className="text-right font-medium">{formatINR(row.subtotal)}</span>;
      case 'profitPct':
        return <span className="text-right">{row.profitPct != null ? `${row.profitPct}%` : '—'}</span>;
      case 'sellingPrice':
        return <span className="text-right font-medium">{formatINR(row.sellingPrice)}</span>;
      case 'status':
        return <PwStatusBadge status={row.status} />;
      default:
        return '—';
    }
  };

  const confirmConfigs = {
    archive: {
      title: confirm?.count != null ? 'Archive Selected' : 'Archive Profit Workout',
      message: confirm?.count != null ? `Archive ${confirm.count} selected PW(s)?` : 'Archive this Profit Workout?',
      confirmLabel: 'Archive', variant: 'default', icon: Archive
    },
    restore: {
      title: confirm?.count != null ? 'Restore Selected' : 'Restore Profit Workout',
      message: confirm?.count != null ? `Restore ${confirm.count} selected PW(s)?` : 'Restore this Profit Workout?',
      confirmLabel: 'Restore', variant: 'default', icon: RotateCcw
    },
    delete: {
      title: confirm?.count != null ? 'Delete Selected' : 'Delete Profit Workout',
      message: confirm?.count != null ? `Delete ${confirm.count} selected PW(s)? They will be moved to trash.` : 'Are you sure?',
      confirmLabel: 'Delete', variant: 'danger', icon: Trash2
    },
    permanentDelete: {
      title: confirm?.count != null ? 'Permanently Delete Selected?' : 'Permanently Delete?',
      message: confirm?.count != null ? `Delete ${confirm.count} PW(s) permanently? This cannot be undone.` : 'This cannot be undone. Delete permanently?',
      confirmLabel: 'Delete Forever', variant: 'danger', icon: Trash2
    },
    submit: {
      title: 'Submit for Approval',
      message: 'Submit this Profit Workout for review?',
      confirmLabel: 'Submit', variant: 'default', icon: Send
    }
  };

  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside a hub) ===== */}
      {!embedded && (
        <>
          <SalesBreadcrumb
            items={[
              { label: 'CPR', to: '/cprs' },
              { label: 'Profit Workout' }
            ]}
          />
          <div className="pr-page-header">
            <div>
              <h1>
                <Calculator className="w-6 h-6 text-[#0B4A3D]" />
                Profit Workout
              </h1>
            </div>
            <div className="pr-page-header-actions">
              <NewCreationMenu
                moduleKey="profitworkout"
                createTo="/profit-workouts/new"
                buttonLabel="New"
                buttonClassName="po-btn po-btn-primary"
                openInNewTab
              />
            </div>
          </div>
        </>
      )}

      {/* ===== KPI CARDS (PR design — pr-kpi-grid / qtn-kpi-card) ===== */}
      <div className="pr-kpi-grid">
        {KPI_CARDS.map((card) => {
          const Icon = card.icon;
          const active = activeKpi === card.key;
          const value = card.currency ? formatINR(stats.totalValue) : stats[card.key];
          return (
            <button
              key={card.key}
              type="button"
              onClick={() => selectKpi(card.key)}
              className={`pr-kpi-card qtn-kpi-card${active ? ' active' : ''}`}
              data-filter={card.key}
            >
              <span className="qtn-kpi-icon" style={{ background: `${card.color}1F`, color: card.color }} aria-hidden="true">
                <Icon size={19} />
              </span>
              <div className="qtn-kpi-body">
                <div className="qtn-kpi-count" title={String(value)}>{value}</div>
                <div className="qtn-kpi-label" title={card.label}>{card.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ===== PRIMARY TAB ===== */}
      <div className="pr-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={true}
          onClick={() => switchSubtab(0)}
          className="pr-tab client-tab active"
        >
          All Profit Workouts <span className="tab-count">{tabCounts.active}</span>
        </button>
      </div>

      {/* ===== SUBTAB SEGMENTED CONTROL (Active / Archived / Deleted) ===== */}
      <div className="segmented-control" role="tablist" aria-label="Record status">
        {[
          { label: 'Active', count: tabCounts.active },
          { label: 'Archived', count: tabCounts.archived },
          { label: 'Deleted', count: tabCounts.deleted }
        ].map((tab, index) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={subtab === index}
            onClick={() => switchSubtab(index)}
            className={`segmented-option${subtab === index ? ' active' : ''}`}
          >
            {tab.label} <span className="tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      {/* ===== TOOLBAR (PR design — pr-toolbar) ===== */}
      <div className="pr-toolbar">
        <div className="pr-toolbar-left">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="btn btn-ghost btn-sm"
          >
            <Filter className="w-3.5 h-3.5" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <input
            type="text"
            className="pr-search-input"
            value={searchInput}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search PW No, CPR No, Customer, Company..."
            aria-label="Search Profit Workouts"
          />

        </div>

        <div className="pr-toolbar-right">
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportOpen((prev) => !prev)}
              className="btn btn-ghost btn-sm"
            >
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            {exportOpen && (
              <div className="po-dropdown-menu">
                {[
                  { label: 'Export PDF', icon: FileText, fn: exportPdf },
                  { label: 'Export Excel', icon: FileSpreadsheet, fn: exportExcel },
                  { label: 'Export CSV', icon: FileDown, fn: exportCurrent },
                  { label: 'Print', icon: Printer, fn: exportPrint }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      item.fn();
                    }}
                    className="po-dropdown-item"
                  >
                    <item.icon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <ManageColumnsButton manager={grid.manager} />

          <span className="toolbar-count">
            Showing {totalCount === 0 ? '0-0' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)}`} of {totalCount}
          </span>
        </div>
      </div>

      {/* ===== FILTER PANEL ===== */}
      {showFilters && (
        <div className="pr-filter-panel show">
          <div className="pr-filter-grid">
            {[
              { key: 'status', label: 'Status', type: 'select', options: PW_STATUSES.map((s) => s.label), placeholder: 'All Statuses' },
              { key: 'cprRef', label: 'CPR No', type: 'text', placeholder: 'Search CPR No...' },
              { key: 'pwNo', label: 'PW No', type: 'text', placeholder: 'Search PW No...' },
              { key: 'customer', label: 'Customer', type: 'text', placeholder: 'Search customer...' },
              { key: 'company', label: 'Company', type: 'text', placeholder: 'Search company...' },
              { key: 'preparedBy', label: 'Prepared By', type: 'text', placeholder: 'Search preparer...' },
              { key: 'dateFrom', label: 'Date From', type: 'date' },
              { key: 'dateTo', label: 'Date To', type: 'date' }
            ].map((field) => (
              <div key={field.key} className="filter-group">
                <span className="filter-label">{field.label}</span>
                {field.type === 'select' ? (
                  <select
                    value={filters[field.key] || ''}
                    onChange={(e) => setFilter(field.key, e.target.value)}
                    className="prm-filter-select"
                  >
                    <option value="">{field.placeholder}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={field.type}
                    value={filters[field.key] || ''}
                    onChange={(e) => setFilter(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className="prm-filter-input"
                  />
                )}
              </div>
            ))}
            <div className="filter-actions">
              <button
                type="button"
                onClick={resetFilters}
                className="btn btn-ghost btn-sm"
              >
                <X className="w-3.5 h-3.5" /> Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== BULK ACTION BAR ===== */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar visible">
          <span className="bulk-count">
            <strong>{selectedIds.size}</strong> selected
          </span>
          <div className="bulk-actions">
            <button
              type="button"
              onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Profit Workout(s)` })}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw className="w-3 h-3" /> Restore
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Profit Workout(s)` })}
              className="btn btn-ghost btn-sm"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'permanentDelete', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Profit Workout(s)` })}
              className="btn btn-ghost btn-sm btn-bulk-danger"
            >
              <Trash2 className="w-3 h-3" /> Permanently Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'archive', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Profit Workout(s)` })}
              className="btn btn-ghost btn-sm"
            >
              <Archive className="w-3 h-3" /> Archive
            </button>
            <button
              type="button"
              onClick={exportSelected}
              className="btn btn-ghost btn-sm"
            >
              <Download className="w-3 h-3" /> Export
            </button>
          </div>
        </div>
      )}

      {/* ===== TABLE CARD ===== */}
      <div className="po-table-card">
        <CprTable
          columns={visibleColumns}
          rows={pageRows}
          loading={loading}
          subtab={subtab}
          searchQuery={searchInput}
          onColumnsChange={grid.setColumns}
          honorColumnWidths={grid.widthsCustomized}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          selectedIds={selectedIds}
          stickyKey="pwNo"
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          renderCell={renderCell}
          actionMenu={(row) => (
            <CprActionMenu items={buildRowActions(row)} onAction={(key) => runRowAction(key, row)} />
          )}
          onClearSearch={clearSearch}
          onNewCpr={() => navigate('/profit-workouts/new')}
          onGoActive={() => switchSubtab(0)}
          emptyTitle="Profit Workout"
          foundTitle="No Profit Workouts Found"
          foundMessage="Create your first Profit Workout to get started."
          emptyActionLabel="New Profit Workout"
        />
        {!loading && (
          <CprPagination
            total={totalCount}
            currentPage={page}
            totalPages={totalPages}
            pageSize={pageSize}
            onPageChange={goToPage}
            onPageSizeChange={changePageSize}
          />
        )}
      </div>

      {/* ===== CONFIRM DIALOG ===== */}
      {confirm && (
        <ConfirmDialog
          open={confirm !== null}
          title={confirmConfigs[confirm.type].title}
          message={confirmConfigs[confirm.type].message}
          confirmLabel={confirmConfigs[confirm.type].confirmLabel}
          variant={confirmConfigs[confirm.type].variant}
          icon={confirmConfigs[confirm.type].icon}
          onConfirm={executeConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      {/* ===== RECORD OPEN POPOVER ===== */}
      <RecordOpenPopover
        open={recordPopover !== null}
        recordLabel={recordPopover?.label || ''}
        recordType={recordPopover?.type || 'Record'}
        route={recordPopover?.route || '/'}
        onOpenExisting={recordPopover?.onExisting}
        onClose={() => setRecordPopover(null)}
        anchorRef={recordPopover?.anchorRef}
      />
    </div>
  );
}
