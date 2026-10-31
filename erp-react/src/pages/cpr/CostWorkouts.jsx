import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Archive,
  Calculator,
  CheckCheck,
  CheckCircle,
  CheckCircle2,
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
import { CPR_HUB_TABS } from '../../utils/navigationHelpers';
import { ConfirmDialog, NewCreationMenu, useCurrentUser, useToast } from '../../components/Common';
import { ManageColumnsButton } from '../../components/GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { CprActionMenu, CprPagination, CprTable } from '../../components/CprTable';
import useClickOutside from '../../hooks/useClickOutside';
import useCostWorkouts from '../../hooks/useCostWorkouts';
import StatusBadge from '../../components/Common/StatusBadge';
import { cwStatusMeta } from '../../utils/costWorkoutHelpers';
import { CW_STATUSES } from '../../utils/costWorkoutConstants';
import { exportCwsBulkCsv, exportCwsCsv, exportCwsExcel, exportCwsPdf, printCws } from '../../utils/cprExportUtils';
import { buildExportFilename, formatDate, formatINR } from '../../utils/leadHelpers';
import '../crm/crm-erp.css';

const KPI_CARDS = [
  { key: 'all', label: 'Total Cost Workouts', icon: Calculator, color: '#0B4A3D' },
  { key: 'draft', label: 'Draft', icon: Pencil, color: '#6b7280' },
  { key: 'completed', label: 'Completed', icon: CheckCircle, color: '#059669' },
  { key: 'approved', label: 'Approved', icon: CheckCheck, color: '#16a34a' },
  { key: 'rejected', label: 'Rejected', icon: XCircle, color: '#dc2626' },
  { key: 'totalvalue', label: 'Total Cost Value', icon: IndianRupee, color: '#B98A2F', currency: true }
];

// Column widths are minimums for readability: the table renders at width:100%
// and the browser distributes any extra viewport width proportionally, so at
// 1920/1600/1440 the columns grow to fill the content area (no dead space on
// the right). Below the sum of these widths the .pr-table-wrap scrolls
// horizontally instead of squeezing columns. The generated CW number is the
// record's internal identity only, so no CW number column is shown; single-line
// fields stay ellipsized — including Description, which shows the
// items' brief CPR Description as a one-line preview (full value on hover) —
// while the prose columns (Customer, Company) wrap at word boundaries. Cost
// Amount keeps its protected no-ellipsis cell so the complete formatted value
// is always readable.
const COLUMNS = [
  { key: 'checkbox', label: '', width: 48, always: true },
  { key: 'cprRef', label: 'CPR No', width: 150, sortable: true },
  { key: 'customerName', label: 'Customer', width: 180, sortable: true },
  { key: 'company', label: 'Company', width: 180, sortable: true },
  { key: 'description', label: 'Description', width: 220 },
  { key: 'preparedBy', label: 'Prepared By', width: 140, sortable: true },
  { key: 'subtotal', label: 'Cost Amount', width: 140, align: 'right', sortable: true, noEllipsis: true },
  { key: 'profitPct', label: 'Profit %', width: 100, align: 'right', sortable: true },
  { key: 'sellingPrice', label: 'Selling Price', width: 130, align: 'right', sortable: true },
  { key: 'status', label: 'Status', width: 120, mandatory: true },
  { key: 'date', label: 'Date', width: 130, sortable: true },
  { key: 'actions', label: 'Actions', width: 90, align: 'center', mandatory: true }
];

// Sum of the fixed column widths above — the table keeps at least this width so
// columns are never squeezed below their usable size (which clipped the Cost
// Amount value). The table wrapper scrolls horizontally only when the viewport
// is genuinely narrower than the table.
const TABLE_MIN_WIDTH = COLUMNS.reduce((sum, col) => sum + (col.width || 0), 0);

/**
 * The list's Description cell shows ONLY each item's brief CPR Description.
 * The full item description is never a fallback here: a Cost Workout without a
 * CPR Description renders '—' in this column.
 */
function itemCprDescription(cw) {
  const items = Array.isArray(cw.items) ? cw.items : [];
  return items
    .map((it) => String(it.cprDescription || '').trim())
    .filter(Boolean)
    .join(', ');
}

function CwStatusBadge({ status }) {
  return <StatusBadge status={status} />;
}

export default function CostWorkouts({ moduleTab, onModuleTabChange, embedded }) {
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
    archiveCw,
    restoreCw,
    deleteCw,
    permanentDeleteCw,
    submitCw,
    approveCw,
    duplicateCw,
    // True while a row mutation is in flight: disables the confirm dialog so a
    // conversion can never be submitted twice (a second submit would otherwise
    // race the first one and get the backend's duplicate rejection).
    actionLoading,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  } = useCostWorkouts();

  // CPR_APPROVE (ADMIN + MANAGER) is the authority the Cost Workout approval
  // endpoint enforces; the row menu mirrors it so a plain USER is never offered
  // an action the server would reject. UI gate only — the backend stays the
  // security boundary.
  const { isManager } = useCurrentUser();

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Manageable + resizable columns, restored from MySQL on every open.
  const grid = useManagedGrid({
    gridKey: 'sales.list.costworkout',
    defaults: COLUMNS,
    allowCustom: false,
    protectedKeys: ['checkbox', 'actions']
  });
  const [confirm, setConfirm] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
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

  // ERP action-menu.js 'cost-workout' generator replica: exact items, order,
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
    // Historical revisions are read-only: no edit/duplicate/convert/submit/delete.
    const isHistorical = row.latestRevision === false;
    // Edit mirrors the Cost Workout view page (canEdit) and the backend workflow:
    // SUBMITTED / APPROVED are approval-workflow states, so the edit form — which
    // only carries the form-level Draft/Completed status — must not be offered for
    // them. Opening it and saving (or letting the 30 s autosave fire) used to
    // rewrite the status, which silently removed a submitted record from the
    // approval queue so it could no longer be approved or rejected.
    const editable = !isHistorical && ['draft', 'completed', 'rejected'].includes(status);
    const items = [
      { key: 'view', label: 'View', icon: Eye },
      { key: 'preview', label: 'Preview', icon: ScanSearch },
      { key: 'print', label: 'Print', icon: Printer },
      ...(editable ? [{ key: 'edit', label: 'Edit', icon: Pencil }] : [])
    ];
    if (!isHistorical) {
      // Cost Workout → Quotation opens the prefilled Quotation form, so the
      // action follows the same eligibility the Cost Workout view page and the
      // backend conversion use: only an APPROVED Cost Workout that has not been
      // converted yet can produce a quotation. Already-converted rows offer
      // Open Quotation instead, so the list never shows an invalid action.
      if (row.convertedToQtn) {
        items.push({ key: 'openQuotation', label: 'Open Quotation', icon: FileText });
      } else if (status === 'approved') {
        items.push({ key: 'convertToQuotation', label: 'Convert to Quotation', icon: FileText });
      }
      // Cost Workout → Profit Workout conversion is ALWAYS offered (regardless
      // of status or whether a CPR is linked): the conversion is
      // status-independent, so an authorized user always sees the action. If
      // the request cannot be completed (e.g. the CW was deleted), the backend
      // rejects the click with the proper validation message — the menu item
      // itself stays visible. Already-converted rows offer Open Profit Workout
      // instead so no duplicate conversion is ever started from the list.
      if (row.convertedToPw) {
        items.push({ key: 'openProfitWorkout', label: 'Convert to Profit Workout', icon: Calculator });
      } else {
        items.push({ key: 'convertToProfitWorkout', label: 'Convert to Profit Workout', icon: Calculator });
      }
      items.push({ key: 'duplicate', label: 'Duplicate', icon: Copy });
      items.push({ divider: true });
      // Approve — the SAME approval the Cost Workout view page runs
      // (POST /cost-workouts/{id}/approve). Only a SUBMITTED row can be approved,
      // and only by a holder of CPR_APPROVE (ADMIN / MANAGER, exactly the
      // backend's authority), so an already-approved row never offers it again.
      // Rejected / completed rows re-enter approval through Submit for Approval
      // (the existing resubmission path), never by direct approval.
      if (status === 'submitted' && isManager) {
        items.push({ key: 'approve', label: 'Approve', icon: CheckCircle2 });
        items.push({ divider: true });
      }
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

  // Confirmation toasts name the record by its customer, never by the internal
  // CW number (which is not a user-facing identifier).
  const rowLabel = (row) => row?.customerName || row?.company || 'Cost Workout';

  const runRowAction = (key, row) => {
    switch (key) {
      case 'view':
        navigate(`/cost-workouts/${row.id}`);
        break;
      // Preview opens the dedicated Cost Workout document preview/edit page.
      case 'preview':
        navigate(`/cost-workouts/design?id=${row.id}`);
        break;
      // Print opens the same Cost Workout document format and triggers the
      // browser print dialog once the document has loaded (design?print=1).
      case 'print':
        navigate(`/cost-workouts/design?id=${row.id}&print=1`);
        break;
      case 'edit':
        navigate(`/cost-workouts/${row.id}/edit`);
        break;
      case 'duplicate':
        duplicateRow(row);
        break;
      case 'submit':
        setConfirm({ type: 'submit', ids: [row.id], label: rowLabel(row) });
        break;
      case 'approve':
        setConfirm({ type: 'approve', ids: [row.id], label: rowLabel(row) });
        break;
      case 'openCpr':
        // ERP: opens the linked CPR record. Prefer the numeric cprId (the CPR
        // view endpoint requires a Long id); fall back to the CPR list when
        // only the prNo string reference is available.
        if (row.cprId) navigate(`/cprs/${row.cprId}`);
        else navigate('/cprs');
        break;
      case 'convertToQuotation':
        // Opens the Quotation creation form prefilled from this Cost Workout
        // (read-only navigation, same as the Cost Workout → Profit Workout
        // action). Nothing is created here — the quotation is persisted only
        // when the user reviews the form and presses a save action there.
        navigate(`/quotations/new?sourceCw=${row.id}`);
        break;
      case 'openQuotation':
        // Already-converted Cost Workout: the quotation exists (row.convertedToQtn);
        // open the Quotations list to view/locate it (the list payload carries
        // only the quotation number, not its id).
        navigate('/quotations');
        break;
      case 'convertToProfitWorkout':
        // Opens the Profit Workout creation form prefilled from this Cost
        // Workout (read-only navigation). Nothing is created here — no Profit
        // Workout is persisted until the user reviews the form and presses Save
        // in the existing creation page.
        navigate(`/profit-workouts/new?sourceCw=${row.id}`);
        break;
      case 'openProfitWorkout':
        // Row already converted: open the actual linked Profit Workout record
        // (convertedToPwId comes from the CW list payload) and fall back to the
        // PW list when the id is not available.
        if (row.convertedToPwId) navigate(`/profit-workouts/${row.convertedToPwId}`);
        else navigate(CPR_HUB_TABS['profit-workout']);
        break;
      case 'activityLog':
        navigate(`/cost-workouts/${row.id}`);
        break;
      case 'archive':
        setConfirm({ type: 'archive', ids: [row.id], label: rowLabel(row) });
        break;
      case 'restore':
        setConfirm({ type: 'restore', ids: [row.id], label: rowLabel(row) });
        break;
      case 'delete':
        setConfirm({ type: 'delete', ids: [row.id], label: rowLabel(row) });
        break;
      case 'permanentDelete':
        setConfirm({ type: 'permanentDelete', ids: [row.id], label: rowLabel(row) });
        break;
      default:
        break;
    }
  };

  const duplicateRow = async (row) => {
    const res = await duplicateCw(row.id);
    if (res.ok) {
      toast.success('Cost Workout duplicated');
    } else {
      toast.error(res.error?.message || 'Failed to duplicate Cost Workout');
    }
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const { type, ids, label } = confirm;
    let res;
    if (type === 'archive') {
      res = ids.length === 1 ? await archiveCw(ids[0]) : await bulkArchive(ids);
    } else if (type === 'restore') {
      res = ids.length === 1 ? await restoreCw(ids[0]) : await bulkRestore(ids);
    } else if (type === 'delete') {
      res = ids.length === 1 ? await deleteCw(ids[0]) : await bulkDelete(ids);
    } else if (type === 'permanentDelete') {
      res = ids.length === 1 ? await permanentDeleteCw(ids[0]) : await bulkPermanentDelete(ids);
    } else if (type === 'submit') {
      // ERP parity: submit is a single-row action (draft CWs only). A bulk path
      // must never swallow per-item failures, so keep it explicit.
      if (ids.length === 1) {
        res = await submitCw(ids[0]);
      } else {
        const results = await Promise.all(ids.map((id) => submitCw(id)));
        res = results.every((r) => r && r.ok) ? { ok: true } : { ok: false, error: { message: 'One or more submissions failed' } };
      }
    } else if (type === 'approve') {
      // Single-row approval of the same record — no remarks here (optional on
      // the backend); the view page remains the place to record them.
      res = await approveCw(ids[0]);
    }

    if (res?.ok) {
      if (type === 'submit') toast.success(confirm?.count != null ? `${confirm.count} CW(s) submitted for approval` : `${label} submitted for approval`);
      else if (type === 'approve') toast.success(`${label} approved`);
      else if (type === 'archive') toast.success(confirm?.count != null ? `${confirm.count} CW(s) archived` : `${label} archived`);
      else if (type === 'restore') toast.success(confirm?.count != null ? `${confirm.count} CW(s) restored` : `${label} restored`);
      else if (type === 'delete') toast.success(confirm?.count != null ? `${confirm.count} CW(s) moved to trash` : `${label} moved to trash`);
      else if (type === 'permanentDelete') toast.success(confirm?.count != null ? `${confirm.count} CW(s) permanently deleted` : `${label} permanently deleted`);
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
    exportCwsCsv(data, buildExportFilename('Cost_Workout_List'));
    toast.success('Cost Workout list exported as CSV');
  };

  const exportPdf = async () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      await exportCwsPdf(data, buildExportFilename('Cost_Workout_List'));
      toast.success('Cost Workout list exported as PDF');
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
      await exportCwsExcel(data, buildExportFilename('Cost_Workout_List'));
      toast.success('Cost Workout list exported as Excel');
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
    printCws(data);
  };

  // ERP cwBulkExport (cost-workout-list.html): selected rows only, exact 10-column
  // CSV, filename 'CostWorkout_Bulk_YYYY-MM-DD.csv', selection cleared after.
  const exportSelected = () => {
    if (selectedIds.size === 0) {
      toast.warning('No items selected');
      return;
    }
    const rows = data.filter((cw) => selectedIds.has(cw.id));
    exportCwsBulkCsv(rows, `CostWorkout_Bulk_${new Date().toISOString().substring(0, 10)}`);
    setSelectedIds(new Set());
  };

  const renderCell = (key, row) => {
    switch (key) {
      case 'date':
        return <span className="text-slate-500">{formatDate(row.cwDate)}</span>;
      case 'cprRef':
        return <span className="font-medium">{row.cprRef || '—'}</span>;
      case 'customerName':
        return <span className="font-semibold text-slate-700">{row.customerName || '—'}</span>;
      case 'company':
        return row.company || '—';
      case 'description': {
        // Single-line preview: the cell ellipsizes (see wrapKeys below) and the
        // title attribute carries the full CPR Description on hover.
        const cprDescription = itemCprDescription(row);
        return <span title={cprDescription || undefined}>{cprDescription || '—'}</span>;
      }
      case 'preparedBy':
        return row.preparedBy || '—';
      case 'subtotal':
        return <span className="text-right font-medium">{formatINR(row.subtotal)}</span>;
      case 'profitPct':
        return <span className="text-right">{row.profitPct != null ? `${row.profitPct}%` : '—'}</span>;
      case 'sellingPrice':
        return <span className="text-right font-medium">{formatINR(row.sellingPrice)}</span>;
      case 'status':
        return <CwStatusBadge status={row.status} />;
      default:
        return '—';
    }
  };

  const confirmConfigs = {
    archive: {
      title: confirm?.count != null ? 'Archive Selected' : 'Archive Cost Workout',
      message: confirm?.count != null ? `Archive ${confirm.count} selected CW(s)?` : 'Archive this Cost Workout?',
      confirmLabel: 'Archive', variant: 'default', icon: Archive
    },
    restore: {
      title: confirm?.count != null ? 'Restore Selected' : 'Restore Cost Workout',
      message: confirm?.count != null ? `Restore ${confirm.count} selected CW(s)?` : 'Restore this Cost Workout?',
      confirmLabel: 'Restore', variant: 'default', icon: RotateCcw
    },
    delete: {
      title: confirm?.count != null ? 'Delete Selected' : 'Delete Cost Workout',
      message: confirm?.count != null ? `Delete ${confirm.count} selected CW(s)? They will be moved to trash.` : 'Are you sure?',
      confirmLabel: 'Delete', variant: 'danger', icon: Trash2
    },
    permanentDelete: {
      title: confirm?.count != null ? 'Permanently Delete Selected?' : 'Permanently Delete?',
      message: confirm?.count != null ? `Delete ${confirm.count} CW(s) permanently? This cannot be undone.` : 'This cannot be undone. Delete permanently?',
      confirmLabel: 'Delete Forever', variant: 'danger', icon: Trash2
    },
    submit: {
      title: 'Submit for Approval',
      message: 'Submit this Cost Workout for review?',
      confirmLabel: 'Submit', variant: 'default', icon: Send
    },
    approve: {
      title: 'Approve Cost Workout',
      message: 'Approve this Cost Workout?',
      confirmLabel: 'Approve', variant: 'default', icon: CheckCircle2
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
              { label: 'Cost Workout' }
            ]}
          />
          <div className="pr-page-header">
            <div>
              <h1>
                <Calculator className="w-6 h-6 text-[#0B4A3D]" />
                Cost Workout
              </h1>
            </div>
            <div className="pr-page-header-actions">
              <NewCreationMenu
                moduleKey="costworkout"
                createTo="/cost-workouts/new"
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
          const value = card.currency ? formatINR(stats.totalValue) : (stats[card.key] ?? (card.key === 'all' ? stats.total : 0));
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
          All Cost Workouts <span className="tab-count">{tabCounts.active}</span>
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
            placeholder="Search CPR No, Customer, Company..."
            aria-label="Search Cost Workouts"
          />

        </div>          <div className="pr-toolbar-right">
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
              { key: 'status', label: 'Status', type: 'select', options: CW_STATUSES.map((s) => s.label), placeholder: 'All Statuses' },
              { key: 'cprRef', label: 'CPR No', type: 'text', placeholder: 'Search CPR No...' },
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
              onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Cost Workout(s)` })}
              className="btn btn-ghost btn-sm"
            >
              <RotateCcw className="w-3 h-3" /> Restore
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Cost Workout(s)` })}
              className="btn btn-ghost btn-sm"
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'permanentDelete', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Cost Workout(s)` })}
              className="btn btn-ghost btn-sm btn-bulk-danger"
            >
              <Trash2 className="w-3 h-3" /> Permanently Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'archive', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} Cost Workout(s)` })}
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
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          renderCell={renderCell}
          actionMenu={(row) => (
            /* keepTriggerColumnClear: the ⋮ lives in the pinned Actions column,
               so the dropdown must open clear of that column — otherwise it
               covers the ⋮ of the rows below and those clicks never reach the
               button, which makes the menu look stuck on the wrong row. */
            <CprActionMenu
              items={buildRowActions(row)}
              onAction={(key) => runRowAction(key, row)}
              keepTriggerColumnClear
            />
          )}
          onClearSearch={clearSearch}
          onNewCpr={() => navigate('/cost-workouts/new')}
          onGoActive={() => switchSubtab(0)}
          emptyTitle="Cost Workout"
          foundTitle="No Cost Workouts Found"
          foundMessage="Create your first Cost Workout to get started."
          emptyActionLabel="New Cost Workout"
          minWidth={TABLE_MIN_WIDTH}
          noEllipsisKeys={visibleColumns.filter((col) => col.noEllipsis).map((col) => col.key)}
          wrapKeys={['customerName', 'company']}
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
          loading={actionLoading}
          onConfirm={executeConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

    </div>
  );
}
