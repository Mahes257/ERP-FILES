import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { openInNewTab } from '../../utils/navigationHelpers';
import { useCurrentUser } from '../../components/Common';
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Copy,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  LayoutGrid,
  ListTree,
  Pencil,
  Plus,
  RotateCcw,
  ScanSearch,
  Search,
  Sparkles,
  Table2,
  Tags,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { ActionMenu, ConfirmDialog, Modal, NewCreationMenu, RecordPreviewModal, SortIcon, useToast } from '../../components/Common';
import { ColumnResizer, ManageColumnsButton } from '../../components/GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { CprActionMenu, CprPagination } from '../../components/CprTable';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import DocRevisionCell from '../../components/SalesTable/DocRevisionCell';
import useClickOutside from '../../hooks/useClickOutside';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import { formatDate, formatINR } from '../../utils/leadHelpers';
import { pdfSafe } from '../../utils/pdfText';
import { docNumber, DOC_NUMBER_FIELD, normalizeSalesContract } from '../../utils/salesHelpers';
import { isRowPendingApproval, statusCellBgClass } from '../../utils/pendingApproval';
import { salesContractListConfig } from '../../config/salesPageConfigs';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import './sales-contract-module.css';
import '../crm/crm-erp.css';

/**
 * Sales Contract List page — visual 1:1 with the ERP reference page
 * (sales-contracts.html): breadcrumb → page header (+Create New Contract)
 * → 8 KPI cards → module tabs (Overview / Suggested Contracts / Manage
 * Clients / Tag-wise Report) → segmented control (Active / Archived /
 * Deleted) → active-filter strip → toolbar (Show Filters | search, Export,
 * Columns) → filter panel → bulk bar (Approve / Archive / Export / Delete)
 * → white table card → pagination.
 *
 * Every Sales Contract list action stays intact (search, KPI filters,
 * filters, sort, bulk ops, export, archive/restore/delete, approve,
 * convert, email, print, PDF). Data flow is identical to the shared
 * SalesListPage: the config's useSalesModule hook drives all state and
 * mutations.
 */

// Kanban board column order — the Sales Contract workflow pipeline.
const KANBAN_COLUMNS = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'archived', label: 'Archived' },
  { key: 'deleted', label: 'Deleted' }
];

export default function SalesContractListPage({ embedded }) {
  const navigate = useNavigate();
  const toast = useToast();
  // canDeleteSales mirrors the backend's SALES_DELETE authority; the delete
  // entry points below are gated on it (the backend still enforces it).
  const { isAdmin, canDeleteSales } = useCurrentUser();
  const hook = salesContractListConfig.useHook();

  const {
    data,
    totalCount,
    loading,
    error,
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
    exportParams,
    archive,
    restore,
    remove,
    duplicate,
    approve,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  } = hook;

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Manageable + resizable columns, restored from MySQL on every open.
  const grid = useManagedGrid({
    gridKey: `sales.list.${salesContractListConfig.moduleKey}`,
    defaults: salesContractListConfig.columns,
    allowCustom: false,
    protectedKeys: ['checkbox', 'actions']
  });
  const [confirm, setConfirm] = useState(null);
  // Read-only Preview (Actions ⋮ → Preview) — same UX as Quotations.
  const [previewRow, setPreviewRow] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  // Change Status dialog (Actions ⋮ → Change Status) — same flow the shared
  // Sales list uses: hook.changeStatus → POST /sales-contracts/{id}/status.
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusValue, setStatusValue] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  // ERP module tabs: Overview (the list) + three placeholder views.
  const [moduleTab, setModuleTab] = useState('overview');
  // List vs Kanban presentation (opened directly after bulk import).
  const [searchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState(() => (searchParams.get('view') === 'kanban' ? 'kanban' : 'list'));

  const exportRef = useRef(null);
  useClickOutside(exportRef, () => setExportOpen(false), exportOpen);

  const pageRows = data;

  // Kanban board uses the SAME records as the table (current page from the
  // list hook) — no second data source, so cards and rows can never diverge.
  // EVERY configured column always renders: the board's structure is the
  // workflow itself and must not change with the data. A column with no
  // matching rows keeps its header, shows a 0 count and an in-column empty
  // state — it is never filtered out.
  const kanbanColumns = KANBAN_COLUMNS.map((col) => ({
    ...col,
    cards: pageRows.filter((row) => String(row.status || '').toLowerCase() === col.key)
  }));

  const moduleTabs = [
    { key: 'overview', label: 'Overview', icon: ClipboardList, desc: '' },
    { key: 'suggested', label: 'Suggested Contracts', icon: Sparkles, desc: 'AI-powered suggestions will appear here.' },
    { key: 'clients', label: 'Manage Clients', icon: Users, desc: 'Client management interface will appear here.' },
    { key: 'tagwise', label: 'Tag-wise Report', icon: Tags, desc: 'Tag-wise reporting will appear here.' }
  ];

  // Column visibility is owned by useManagedGrid (grid.manager → ManageColumnsButton);
  // the old local toggleColumn/setColumnsState helper was removed with it.
  const visibleColumns = grid.visibleColumns;

  // Document-number column pinned while the table scrolls horizontally
  // (same sticky-left behaviour as the CRM tables). The checkbox column is
  // pinned at left: 0 and the doc-number column right after it; the offset
  // is measured from real rendered header widths so hidden columns never
  // misalign the pinned cells.
  const headerRowRef = useRef(null);
  const stickyKey = DOC_NUMBER_FIELD[salesContractListConfig.moduleKey];
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey,
    visibleKeys: visibleColumns.map((col) => col.key)
  });
  const isStickyCell = (col) => stickyKey && col.key === stickyKey;

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

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));

  const buildRowActions = (row) => {
    if (subtab === 2) {
      return [
        { key: 'preview', label: 'Preview', icon: ScanSearch },
        { key: 'restore', label: 'Restore', icon: RotateCcw },
        // Permanent delete is a SALES_DELETE action — never offered without it.
        ...(canDeleteSales
          ? [{ key: 'permanentDelete', label: 'Permanent Delete', icon: Trash2, danger: true }]
          : [])
      ];
    }
    if (salesContractListConfig.rowMenu) {
      return typeof salesContractListConfig.rowMenu === 'function'
        ? salesContractListConfig.rowMenu(row, hook)
        : salesContractListConfig.rowMenu;
    }
    const items = [
      { key: 'view', label: `View ${salesContractListConfig.title}`, icon: Eye },
      { key: 'preview', label: 'Preview', icon: ScanSearch },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'duplicate', label: 'Duplicate', icon: Copy },
      { key: 'changeStatus', label: 'Change Status', icon: Tags },
      { key: 'activityLog', label: 'Activity Log', icon: History },
      { divider: true }
    ];
    if (salesContractListConfig.rowActions) {
      items.push(...salesContractListConfig.rowActions(row, hook));
    }
    if (String(row.status || '').toLowerCase() === 'archived') {
      items.push({ key: 'restore', label: 'Restore', icon: RotateCcw });
    } else {
      items.push({ key: 'archive', label: 'Archive', icon: Archive });
    }
    // Delete (to trash) is a SALES_DELETE action.
    if (canDeleteSales) {
      items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return items;
  };

  const runRowAction = (key, row) => {
    switch (key) {
      case 'view':
        navigate(salesContractListConfig.viewRoute(row));
        break;
      case 'preview':
        // The module now has a full Quotation-Preview-style design workspace —
        // Preview opens it; the read-only info modal stays for deleted/trash rows.
        if (salesContractListConfig.designRoute && subtab !== 2) navigate(salesContractListConfig.designRoute(row));
        else setPreviewRow(row);
        break;
      case 'edit':
        navigate(salesContractListConfig.editRoute(row));
        break;
      case 'duplicate':
        duplicateRow(row);
        break;
      case 'changeStatus':
        setStatusValue(row.status || '');
        setStatusTarget({ ids: [row.id], label: docNumber(row, salesContractListConfig.moduleKey) || salesContractListConfig.title });
        break;
      case 'activityLog':
        navigate(`${salesContractListConfig.viewRoute(row)}?tab=activities`);
        break;
      case 'archive':
        setConfirm({ type: 'archive', ids: [row.id], label: docNumber(row, salesContractListConfig.moduleKey) || salesContractListConfig.title });
        break;
      case 'restore':
        setConfirm({ type: 'restore', ids: [row.id], label: docNumber(row, salesContractListConfig.moduleKey) || salesContractListConfig.title });
        break;
      case 'delete':
        setConfirm({ type: 'delete', ids: [row.id], label: docNumber(row, salesContractListConfig.moduleKey) || salesContractListConfig.title });
        break;
      case 'permanentDelete':
        setConfirm({ type: 'permanentDelete', ids: [row.id], label: docNumber(row, salesContractListConfig.moduleKey) || salesContractListConfig.title });
        break;
      default: {
        const result = salesContractListConfig.onRowAction?.(key, row, hook, navigate);
        if (result && typeof result.then === 'function') {
          result
            .then((res) => {
              if (res?.ok) toast.success(res.message || 'Action completed');
              else if (res?.error) toast.error(res.error?.message || 'Action failed');
            })
            .catch((err) => toast.error(err?.message || 'Action failed'));
        }
        break;
      }
    }
  };

  const duplicateRow = async (row) => {
    const res = await duplicate(row.id);
    if (res.ok) {
      const data = res.data?.data ?? {};
      toast.success(`${salesContractListConfig.title} duplicated as ${docNumber(data, salesContractListConfig.moduleKey) || ''}`.trim());
    } else {
      toast.error(res.error?.message || `Failed to duplicate ${salesContractListConfig.title.toLowerCase()}`);
    }
  };

  // ===== Kanban click-to-move =====
  // Same statuses the module already uses (config status filter — the exact
  // values the backend normalizes); the move goes through the EXISTING
  // hook.changeStatus → POST /sales-contracts/{id}/status → Spring Boot →
  // MySQL. The card only moves after the backend confirms, and the board
  // re-renders from the hook's refetched data — never from local-only state.
  const [movingId, setMovingId] = useState(null);
  // Kanban drag-and-drop: the card being dragged and the column under it.
  // Transient UI state only — a drop routes through the SAME moveKanbanCard
  // → hook.changeStatus path as the ⋮ "Move to stage" menu, so the status is
  // written by the existing backend and the board re-renders from the
  // refetched server response, never from local state.
  const [draggingCard, setDraggingCard] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);

  const scStatusOptions =
    salesContractListConfig.filters?.find((f) => f.key === 'status')?.options ||
    [];

  // A Kanban column accepts a dropped card only when its label is one of this
  // module's OWN status values. The Archived / Deleted buckets are reached
  // through the archive / delete endpoints, never by a status change, so they
  // stay non-droppable and the browser shows the no-drop cursor over them.
  const canDropOnColumn = (col) =>
    scStatusOptions.some((opt) => String(opt).toLowerCase() === String(col.label).toLowerCase());

  const moveKanbanCard = async (row, nextStatus) => {
    if (movingId || !nextStatus) return;
    if (String(row.status || '').toLowerCase() === String(nextStatus).toLowerCase()) return;
    setMovingId(row.id);
    try {
      const res = await hook.changeStatus(row.id, nextStatus);
      if (res.ok) {
        toast.success(`${docNumber(row, salesContractListConfig.moduleKey) || salesContractListConfig.title} moved to ${nextStatus}`);
      } else {
        // Card stays in its original column — the board re-renders from the
        // refetched server data, which still holds the old status.
        toast.error(res.error?.message || `Unable to update ${salesContractListConfig.title} status. Please try again.`);
      }
    } catch (err) {
      toast.error(err?.message || `Unable to update ${salesContractListConfig.title} status. Please try again.`);
    } finally {
      setMovingId(null);
    }
  };

  // Apply the Change Status dialog (single record).
  const applyScStatusChange = async () => {
    if (!statusTarget || !statusValue) return;
    setStatusSaving(true);
    try {
      for (const id of statusTarget.ids) {
        const res = await hook.changeStatus(id, statusValue);
        if (!res.ok) {
          toast.error(res.error?.message || 'Failed to change status');
          return;
        }
      }
      toast.success(`${statusTarget.label} moved to ${statusValue}`);
      setStatusTarget(null);
      setStatusValue('');
    } catch (err) {
      toast.error(err?.message || 'Failed to change status');
    } finally {
      setStatusSaving(false);
    }
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const { type, ids, label } = confirm;
    let res;
    if (type === 'archive') res = ids.length === 1 ? await archive(ids[0]) : await bulkArchive(ids);
    else if (type === 'restore') res = ids.length === 1 ? await restore(ids[0]) : await bulkRestore(ids);
    else if (type === 'delete') res = ids.length === 1 ? await remove(ids[0]) : await bulkDelete(ids);
    // Sales backends expose only POST /bulk-permanent-delete (no single
    // DELETE /{id}/permanent), so singles go through the bulk endpoint too.
    else if (type === 'permanentDelete') res = await bulkPermanentDelete(ids);

    if (res?.ok) {
      if (type === 'archive') toast.success(`${label} archived`);
      else if (type === 'restore') toast.success(`${label} restored`);
      else if (type === 'delete') toast.success(`${label} moved to trash`);
      else if (type === 'permanentDelete') toast.success(`${label} permanently deleted`);
    } else {
      toast.error(res?.error?.message || 'Operation failed');
    }
    setSelectedIds(new Set());
    setConfirm(null);
  };

  // Bulk Approve (ERP bulk bar: Approve → Archive → Export → Delete).
  const applyBulkApprove = async () => {
    const rows = pageRows.filter((row) => selectedIds.has(row.id));
    if (rows.length === 0) return;
    try {
      const results = await Promise.all(rows.map((row) => approve(row.id)));
      const failed = results.filter((res) => res && !res.ok);
      if (failed.length === 0) toast.success(`${rows.length} record(s) approved`);
      else toast.error(`${failed.length} record(s) could not be approved`);
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err?.message || 'Failed to approve records');
    }
  };

  // ---- Export (PDF / Excel) of the currently filtered & sorted rows ----
  // Walks every page of the active filter/sort query (the backend caps page
  // size at 200) so the file contains ALL matching sales contracts, then
  // builds the file client-side using only the visible columns.
  const fetchAllFilteredRows = async () => {
    const params = { ...exportParams() };
    delete params.page;
    delete params.size;
    const rows = [];
    const PAGE_SIZE = 200;
    for (let pageIndex = 0; pageIndex <= 250; pageIndex += 1) {
      const res = await salesContractListConfig.service.list({ ...params, page: pageIndex, size: PAGE_SIZE });
      const pageRows = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : res?.content ?? res?.data?.content ?? [];
      if (!Array.isArray(pageRows) || pageRows.length === 0) break;
      rows.push(...pageRows.map(normalizeSalesContract));
      const total = res?.totalElements ?? res?.data?.totalElements ?? pageRows.length;
      if (rows.length >= total || pageRows.length < PAGE_SIZE) break;
    }
    return rows;
  };

  const exportColumns = () => visibleColumns.filter((col) => col.key !== 'checkbox' && col.key !== 'actions');

  const exportCellValue = (col, row) => {
    switch (col.key) {
      case 'contractDate':
      case 'validity':
      case 'createdAt':
        return formatDate(row[col.key]);
      case 'grandTotal':
        return row.grandTotal != null && row.grandTotal !== '' ? formatINR(row.grandTotal) : '';
      case 'status':
        return String(row.status || '').replace(/^\w/, (c) => c.toUpperCase());
      default:
        return row[col.key] != null && row[col.key] !== '' ? String(row[col.key]) : '';
    }
  };

  const exportToExcel = async () => {
    setExportOpen(false);
    try {
      const rows = await fetchAllFilteredRows();
      if (rows.length === 0) {
        toast.error('No data available to export');
        return;
      }
      const cols = exportColumns();
      const header = cols.map((c) => c.label);
      const body = rows.map((row) => cols.map((col) => exportCellValue(col, row)));
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.aoa_to_sheet([header, ...body]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Contracts');
      XLSX.writeFile(workbook, `Sales_Contracts_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Sales Contract list exported as Excel');
    } catch (err) {
      toast.error(err?.message || 'Excel export failed');
    }
  };

  const exportToPdf = async () => {
    setExportOpen(false);
    try {
      const rows = await fetchAllFilteredRows();
      if (rows.length === 0) {
        toast.error('No data available to export');
        return;
      }
      const cols = exportColumns();
      const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.setTextColor(3, 47, 37);
      doc.text('Sales Contract List Report', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on ${new Date().toISOString().slice(0, 10)} - ${rows.length} records`, 40, 55);
      // See pdfText: the rupee sign is not encodable by the PDF's built-in
      // fonts and used to spread every digit of an amount apart.
      const columnStyles = {};
      cols.forEach((col, index) => {
        columnStyles[index] = { halign: col.align === 'right' ? 'right' : col.align === 'center' ? 'center' : 'left' };
      });
      autoTable(doc, {
        startY: 70,
        head: [cols.map((c) => pdfSafe(c.label))],
        body: rows.map((row) => cols.map((col) => pdfSafe(exportCellValue(col, row)))),
        styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59], valign: 'top', lineWidth: 0.2, lineColor: [226, 232, 240] },
        headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles,
        didParseCell: (data) => {
          if (data.section !== 'head') return;
          const align = cols[data.column.index]?.align;
          data.cell.styles.halign = align === 'right' ? 'right' : align === 'center' ? 'center' : 'left';
        },
        margin: { top: 70, bottom: 30 }
      });
      doc.save(`Sales_Contracts_List_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Sales Contract list exported as PDF');
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  const renderCell = (col, row) => {
    if (col.render) return col.render(row, navigate);
    const value = row[col.key];
    switch (col.key) {
      case 'status':
        return <SalesStatusBadge status={value} />;
      case 'contractDate':
      case 'validity':
      case 'createdAt':
      case 'date':
        return <span className="text-slate-500">{formatDate(value)}</span>;
      case 'scNo':
        // Latest revision of a chain gets the revision-history dropdown (each
        // entry opens its exact read-only view). Plain rows stay the usual
        // clickable number.
        if (row && Number(row.revision) > 0) {
          return (
            <DocRevisionCell
              row={row}
              navigate={navigate}
              getDoc={(id) => salesContractListConfig.service.get(id)}
              viewRoute={(rev) => salesContractListConfig.viewRoute(rev)}
              numberField="scNo"
            />
          );
        }
        return value != null && value !== '' ? (
          <a
            href={salesContractListConfig.viewRoute(row)}
            
            
            className="font-bold text-[#0B4A3D] hover:underline cursor-pointer"
            onClick={(e) => e.stopPropagation()}
          >
            {value}
          </a>
        ) : (
          '—'
        );
      default:
        if (col.align === 'right') {
          return value != null && value !== '' ? (
            <span className="po-amount block text-right">{formatINR(value)}</span>
          ) : (
            <span className="text-slate-300 text-[11px] block text-right">—</span>
          );
        }
        return value != null && value !== '' ? String(value) : '—';
    }
  };

  const confirmConfigs = {
    archive: {
      title: `Archive ${salesContractListConfig.title}`,
      message: `Archive ${confirm?.label}?`,
      confirmLabel: 'Archive',
      variant: 'warning',
      icon: Archive
    },
    restore: {
      title: `Restore ${salesContractListConfig.title}`,
      message: `Restore ${confirm?.label} to active records?`,
      confirmLabel: 'Restore',
      variant: 'default',
      icon: RotateCcw
    },
    delete: {
      title: `Delete ${salesContractListConfig.title}`,
      message: `Move ${confirm?.label} to trash?`,
      confirmLabel: 'Delete',
      variant: 'danger',
      icon: Trash2
    },
    permanentDelete: {
      title: 'Delete Permanently?',
      message: `Permanently delete ${confirm?.label}? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
      icon: Trash2
    }
  };

  const kpiCards = salesContractListConfig.kpis.map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: kpi.valueOf(stats),
    icon: kpi.icon,
    color: kpi.color,
    newTabUrl: kpi.key === 'all' || kpi.key === 'totalvalue' ? '/sales-contracts' : `/sales-contracts?status=${encodeURIComponent(kpi.key)}`
  }));


  const activeKpiName = kpiCards.find((k) => k.key === activeKpi)?.label || 'All';

  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside a hub) ===== */}
      {!embedded && (
        <>
          <SalesBreadcrumb
            items={[
              { label: 'Sales Execution', to: '/sales' },
              { label: 'Sales Contracts', to: '/sales-contracts' }
            ]}
          />
          <div className="pr-page-header">
            <div>
              <h1>
                <salesContractListConfig.icon /> Sales Contracts
              </h1>
              <p className="po-page-header-subtitle">Manage, approve and track all sales contracts.</p>
            </div>
            <div className="po-header-actions">
              <div className="po-view-toggle" role="group" aria-label="Sales Contract view">
                <button
                  type="button"
                  className={`po-view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List view"
                >
                  <Table2 /> List
                </button>
                <button
                  type="button"
                  className={`po-view-toggle-btn${viewMode === 'kanban' ? ' active' : ''}`}
                  onClick={() => setViewMode('kanban')}
                  title="Kanban view"
                >
                  <LayoutGrid /> Kanban
                </button>
              </div>
              <NewCreationMenu
                moduleKey="salesContract"
                createTo={salesContractListConfig.newRoute}
                bulkTo="/sales-contracts/bulk-upload"
                buttonLabel="New"
                buttonClassName="erp-btn-primary"
                dedupeService={salesContractListConfig.service}
                openInNewTab
              />
            </div>
          </div>
        </>
      )}
      {/* ===== VIEW TOGGLE (shown when embedded inside a hub) ===== */}
      {embedded && (
        <div className="flex items-center gap-2 mb-3">
          <div className="po-view-toggle" role="group" aria-label="Sales Contract view">
            <button
              type="button"
              className={`po-view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <Table2 /> List
            </button>
            <button
              type="button"
              className={`po-view-toggle-btn${viewMode === 'kanban' ? ' active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban view"
            >
              <LayoutGrid /> Kanban
            </button>
          </div>
        </div>
      )}

      {/* ===== KPI CARDS ===== */}
      <SalesKpiCards cards={kpiCards} activeKpi={activeKpi} onSelect={selectKpi} />

      {/* ===== All Records primary tab (PR reference: pr-tab with count) ===== */}
      <div className="pr-tabs">
        <button type="button" role="tab" aria-selected="true" className="pr-tab active">
          All Sales Contracts <span className="tab-count">{totalCount}</span>
        </button>
      </div>

      {/* ===== MODULE TABS (Overview / Suggested Contracts / Manage Clients / Tag-wise Report) ===== */}
      <div className="po-tabs">
        {moduleTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setModuleTab(tab.key)}
              className={`po-tab${moduleTab === tab.key ? ' active' : ''}`}
            >
              <Icon /> {tab.label}
            </button>
          );
        })}
      </div>

      {moduleTab !== 'overview' ? (
        /* ===== NON-OVERVIEW TAB EMPTY STATES (matching ERP reference) ===== */
        <div className="po-empty-state">
          {(() => {
            const tab = moduleTabs.find((t) => t.key === moduleTab);
            const Icon = tab.icon;
            return (
              <>
                <Icon />
                <h4>{tab.label}</h4>
                <p>{tab.desc}</p>
              </>
            );
          })()}
        </div>
      ) : (
        <>
          {/* ===== SEGMENTED CONTROL (Active / Archived / Deleted) ===== */}
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

          {/* ===== ACTIVE FILTER INDICATOR ===== */}
          <div className="po-filter-active">
            {activeKpi !== 'all' && (
              <>
                <span>
                  <Filter /> Active filter: <strong>{activeKpiName}</strong>
                </span>
                <button type="button" className="po-clear-btn visible" onClick={() => selectKpi('all')}>
                  <X /> Clear Filter
                </button>
              </>
            )}
          </div>

          {/* ===== TOOLBAR (§8: Show Filters + Clear + Refresh left | Search + Export + Columns + Count right) ===== */}
          <div className="pr-toolbar">
            <div className="pr-toolbar-left">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowFilters((prev) => !prev)}>
                <Filter size={12} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
              {searchInput && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={clearSearch}>
                  × Clear
                </button>
              )}
              <button type="button" className="btn btn-ghost btn-sm" onClick={hook.refresh}>
                ↻ Refresh
              </button>
            </div>
            <div className="pr-toolbar-right">
              <input
                type="text"
                className="pr-search-input"
                value={searchInput}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SC No, Client, Amount, Status..."
                aria-label="Search sales contracts"
                autoComplete="off"
              />
              <div style={{ position: 'relative' }} ref={exportRef}>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setExportOpen((prev) => !prev)}>
                  <Download size={14} /> Export ▾
                </button>
                {exportOpen && (
                  <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--purchase-card)] border border-[var(--purchase-border)] rounded-xl shadow-lg py-1 z-50">
                    <button type="button" onClick={exportToPdf} className="w-full text-left px-3 py-2 hover:bg-[var(--purchase-hover)] flex items-center gap-2.5 transition-colors cursor-pointer">
                      <FileDown className="w-4 h-4 text-red-500 shrink-0" /> <span className="text-xs font-semibold text-slate-700">Export to PDF</span>
                    </button>
                    <button type="button" onClick={exportToExcel} className="w-full text-left px-3 py-2 hover:bg-[var(--purchase-hover)] flex items-center gap-2.5 transition-colors cursor-pointer">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" /> <span className="text-xs font-semibold text-slate-700">Export to Excel</span>
                    </button>
                  </div>
                )}
              </div>
              <ManageColumnsButton manager={grid.manager} />
              <span className="toolbar-count">
                Showing {totalCount === 0 ? '0-0' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)}`} of {totalCount}
              </span>
            </div>
          </div>

          {/* ===== FILTER PANEL (Status / Client / Date From / Date To + Reset) ===== */}
          <div className={`po-filters${showFilters ? ' show' : ''}`}>
            <div className="po-filter-grid">
              {salesContractListConfig.filters.map((field) => (
                <div key={field.key} className="po-filter-group">
                  <label>{field.label}</label>
                  {field.type === 'select' ? (
                    <select value={filters[field.key] || ''} onChange={(e) => setFilter(field.key, e.target.value)}>
                      <option value="">{field.placeholder || 'All'}</option>
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
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="po-filter-actions">
              <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={resetFilters}>
                <RotateCcw /> Reset
              </button>
            </div>
          </div>

          {/* ===== ERROR STATE (§26) ===== */}
          {error && (
            <div className="cpr-error-banner" role="alert">
              <p>{error?.message || 'Failed to load sales contracts.'}</p>
              <button type="button" className="cpr-error-retry" onClick={hook.refresh}>Try Again</button>
            </div>
          )}

          {/* ===== BULK BAR (Approve / Archive / Export / Delete — matching ERP reference) ===== */}
          <div className={`po-bulk-bar${selectedIds.size > 0 ? ' visible' : ''}`}>
            <span>
              <strong className="po-bulk-count">{selectedIds.size}</strong> selected
            </span>
            <div className="po-bulk-actions">
              {subtab === 2 ? (
                <>
                  <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                    <RotateCcw /> Restore
                  </button>
                  <button type="button" className="po-bulk-btn" onClick={exportToExcel}>
                    <Download /> Export
                  </button>
                  {canDeleteSales && (
                    <button type="button" className="po-bulk-btn po-bulk-btn-danger" onClick={() => setConfirm({ type: 'permanentDelete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                      <Trash2 /> Delete Permanently
                    </button>
                  )}
                </>
              ) : subtab === 1 ? (
                <>
                  <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                    <RotateCcw /> Restore
                  </button>
                  <button type="button" className="po-bulk-btn" onClick={exportToExcel}>
                    <Download /> Export
                  </button>
                  {canDeleteSales && (
                    <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                      <Trash2 /> Delete
                    </button>
                  )}
                </>
              ) : (
                <>
                  {isAdmin && (
                    <button type="button" className="po-bulk-btn" onClick={applyBulkApprove}>
                      <CheckCircle2 /> Approve
                    </button>
                  )}
                  <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'archive', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                    <Archive /> Archive
                  </button>
                  <button type="button" className="po-bulk-btn" onClick={exportToExcel}>
                    <Download /> Export
                  </button>
                  {canDeleteSales && (
                    <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                      <Trash2 /> Delete
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ===== VIEW: TABLE ===== */}
          {viewMode === 'list' ? (
          <div className="po-table-card">
            <div className="po-table-wrap">
              {/* `sgrid` = the shared sticky data grid (styles/sticky-data-grid.css):
                  contract number pinned left, Actions pinned right. */}
              <table
                className="po-table sgrid sgrid-po sgrid-sales"
                style={{
                  tableLayout: 'fixed',
                  minWidth: grid.widthsCustomized
                    ? Math.max(900, visibleColumns.reduce((sum, col) => sum + (Number(grid.resize.widthOf(col)) || 0), 0))
                    : 900
                }}
              >
                <colgroup>
                  {visibleColumns.map((col) => (
                    <col key={col.key} style={{ width: grid.resize.widthOf(col) }} />
                  ))}
                </colgroup>
                <thead>
                  <tr ref={headerRowRef}>
                    {visibleColumns.map((col) => (
                      <th
                        key={col.key}
                        data-sticky-key={col.key}
                        aria-sort={
                          col.sortable
                            ? sortKey === col.key
                              ? sortDir === 'asc'
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                            : undefined
                        }
                        className={`${col.key === 'checkbox' ? 'po-th-check' : ''}${col.align === 'right' ? ' po-th-right' : ''}${sortKey === col.key ? ' sorted' : ''}${
                          col.key === 'checkbox' ? ' sgrid-pin sgrid-first' : isStickyCell(col) ? ' sgrid-pin' : col.key === 'actions' ? ' sgrid-pin-actions' : ''
                        }${col.key === 'checkbox' || col.key === 'actions' ? '' : ' grid-resizable-th'}`}
                        style={{
                          width: grid.resize.widthOf(col),
                          ...(col.key === 'checkbox' ? { left: 0 } : {}),
                          ...(isStickyCell(col) ? { left: stickyLeft } : {})
                        }}
                        onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                      >
                        {col.key === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={allPageSelected}
                            onChange={(e) => selectAll(e.target.checked)}
                            aria-label="Select all on page"
                          />
                        ) : (
                          <>
                            {col.label}
                            {col.sortable && <SortIcon active={sortKey === col.key} />}
                          </>
                        )}
                        {col.key !== 'checkbox' && col.key !== 'actions' && (
                          <ColumnResizer column={col} resize={grid.resize} />
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={visibleColumns.length} style={{ padding: '60px 20px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#0B4A3D', animation: 'po-spin 0.8s linear infinite' }} />
                      </td>
                    </tr>
                  ) : pageRows.length === 0 ? (
                    <tr>
                      <td colSpan={visibleColumns.length}>
                        <div className="po-empty">
                          <FileText />
                          <h4>No Records Found</h4>
                          <p>
                            {searchInput || Object.keys(filters).length
                              ? 'Adjust your filters or search to find sales contracts.'
                              : 'Create a new sales contract to get started.'}
                          </p>
                          {!searchInput && Object.keys(filters).length === 0 && (
                            <button type="button" className="po-btn po-btn-primary" onClick={() => openInNewTab(salesContractListConfig.newRoute)}>
                              <Plus /> {salesContractListConfig.newLabel}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => {
                      // Red status dot (no row highlight) for Sales Contracts
                      // awaiting approval ('submitted' / 'under review'). Draft,
                      // approved, active, completed, cancelled and historical
                      // revisions never match — same semantics as the sidebar
                      // Pending Approval count.
                      const pending = isRowPendingApproval(row.status);
                      const statusBg = pending && isStickyCell({ key: DOC_NUMBER_FIELD[salesContractListConfig.moduleKey] }) ? statusCellBgClass(row.status) : '';
                      return (
                      <tr key={row.id}>
                        {visibleColumns.map((col) => (
                          <td
                            key={col.key}
                            className={`${col.align === 'right' ? 'po-th-right' : ''}${
                              col.key === 'checkbox' ? ' sgrid-pin sgrid-first' : isStickyCell(col) ? ' sgrid-pin' : col.key === 'actions' ? ' sgrid-pin-actions' : ''
                            } ${isStickyCell(col) ? statusBg : ''}`}
                            style={{
                              ...(col.key === 'actions' ? { textAlign: 'center' } : {}),
                              ...(col.key === 'checkbox' ? { left: 0 } : {}),
                              ...(isStickyCell(col) ? { left: stickyLeft } : {})
                            }}
                          >
                            {col.key === 'checkbox' ? (
                              <input
                                type="checkbox"
                                checked={selectedIds.has(row.id)}
                                onChange={(e) => toggleSelect(row.id, e.target.checked)}
                                aria-label={`Select ${docNumber(row, salesContractListConfig.moduleKey) || row.id}`}
                              />
                            ) : col.key === 'actions' ? (
                              <CprActionMenu
                                items={buildRowActions(row).filter((item) => {
                                  if (item.key === 'approve' && !isAdmin) return false;
                                  // SALES_DELETE-only actions: not offered at all.
                                  if (
                                    (item.key === 'delete' || item.key === 'permanentDelete') &&
                                    !canDeleteSales
                                  ) {
                                    return false;
                                  }
                                  return true;
                                })}
                                onAction={(key) => runRowAction(key, row)}
                              />
                            ) : (
                              renderCell(col, row)
                            )}
                          </td>
                        ))}
                      </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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
          ) : (
          /* ===== VIEW: KANBAN ===== */
          <div className="po-kanban-card">
            <div className="po-kanban-head">
              <span className="po-kanban-head-title">
                <LayoutGrid /> Sales Contract Kanban
              </span>
              <span className="po-kanban-head-count">
                {pageRows.length} contract{pageRows.length === 1 ? '' : 's'}
              </span>
            </div>
            {loading ? (
              <div className="po-kanban-loading">
                <div
                  style={{
                    display: 'inline-block',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    border: '2px solid #e5e7eb',
                    borderTopColor: '#0B4A3D',
                    animation: 'po-spin 0.8s linear infinite'
                  }}
                />
              </div>
            ) : kanbanColumns.length === 0 ? (
              <div className="po-empty">
                <LayoutGrid />
                <h4>No Records Found</h4>
                <p>
                  {searchInput || Object.keys(filters).length
                    ? 'Adjust your filters or search to find sales contracts.'
                    : 'Create a new sales contract to get started.'}
                </p>
              </div>
            ) : (
              <div className="po-kanban">
                {kanbanColumns.map((col) => {
                  const droppable = canDropOnColumn(col);
                  const isDropTarget = Boolean(draggingCard) && droppable;
                  return (
                  <div
                    className={`po-kanban-col${isDropTarget ? ' po-kanban-col--drop-target' : ''}${dragOverCol === col.key ? ' po-kanban-col--drop' : ''}`}
                    key={col.key}
                    onDragOver={(e) => {
                      // preventDefault marks the column as a valid drop zone.
                      // Invalid columns leave it alone so the drop is rejected
                      // by the browser and no call is made.
                      if (!draggingCard || !droppable) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setDragOverCol((prev) => (prev === col.key ? prev : col.key));
                    }}
                    onDragLeave={(e) => {
                      // Ignore the internal enter/leave churn between children.
                      const next = e.relatedTarget;
                      if (next instanceof Node && e.currentTarget.contains(next)) return;
                      setDragOverCol((prev) => (prev === col.key ? null : prev));
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const row = draggingCard;
                      setDraggingCard(null);
                      setDragOverCol(null);
                      // moveKanbanCard ignores a second drop while an update is
                      // already in flight and surfaces the real backend error.
                      if (!row || !droppable) return;
                      moveKanbanCard(row, col.label);
                    }}
                  >
                    <div className="po-kanban-col-head">
                      <span className={`po-kanban-dot po-kanban-dot-${col.key}`} />
                      <span className="po-kanban-col-title">{col.label}</span>
                      <span className="po-kanban-col-count">{col.cards.length}</span>
                    </div>
                    <div className="po-kanban-cards">
                      {col.cards.length === 0 && (
                        <div className="po-kanban-empty">No records in this stage</div>
                      )}
                      {col.cards.map((row) => {
                        const pending = isRowPendingApproval(row.status);
                        const isMoving = movingId === row.id;
                        const stageMenuItems = [
                          { section: 'MOVE TO STAGE' },
                          ...scStatusOptions
                            .filter((opt) => String(opt).toLowerCase() !== String(row.status || '').toLowerCase())
                            .map((opt) => ({ key: `stage:${opt}`, label: opt, icon: ListTree }))
                        ];
                        return (
                          <div
                            key={row.id}
                            draggable={!isMoving}
                            onDragStart={(e) => {
                              // A card mid-update is not draggable, so a second
                              // submission can never start while one is running.
                              if (isMoving) {
                                e.preventDefault();
                                return;
                              }
                              e.dataTransfer.effectAllowed = 'move';
                              // Firefox needs payload set or the drag never starts.
                              e.dataTransfer.setData('text/plain', String(row.id));
                              setDraggingCard(row);
                            }}
                            onDragEnd={() => {
                              setDraggingCard(null);
                              setDragOverCol(null);
                            }}
                            onClick={() => !isMoving && navigate(salesContractListConfig.viewRoute(row))}
                            className={`po-kanban-card${isMoving ? ' po-kanban-card--moving' : ''}${
                              draggingCard?.id === row.id ? ' po-kanban-card--dragging' : ''
                            }`}
                          >
                            <div className="po-kanban-card-top">
                              <span className="po-kanban-card-label">SALES CONTRACT</span>
                              {pending && (
                                <span className="po-badge po-badge-orange" title="Pending Approval" aria-label="Pending Approval">Pending Approval</span>
                              )}
                            </div>
                            <div className="po-kanban-card-client">{row.clientName || '—'}</div>
                            <div className="po-kanban-card-no">
                              {docNumber(row, salesContractListConfig.moduleKey) || row.scNo || `#${row.id}`}
                            </div>
                            <div className="po-kanban-card-meta">
                              <span>Date: {formatDate(row.contractDate)}</span>
                              <span>Validity: {formatDate(row.validity)}</span>
                            </div>
                            <div className="po-kanban-card-footer">
                              <SalesStatusBadge status={row.status} />
                              {/* Click-to-move: pick a destination stage — the
                                  move is saved through the module's status API
                                  (POST /sales-contracts/{id}/status) and the
                                  board refetches the database state. */}
                              {scStatusOptions.length > 0 && (
                                <ActionMenu
                                  items={stageMenuItems}
                                  buttonLabel={`Move ${docNumber(row, salesContractListConfig.moduleKey) || 'contract'} to another stage`}
                                  triggerClassName="erp-row-action-btn shrink-0"
                                  onAction={(key) => {
                                    if (typeof key === 'string' && key.startsWith('stage:')) {
                                      moveKanbanCard(row, key.slice(6));
                                    }
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
                })}
              </div>
            )}
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
          )}

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

          {/* ===== CHANGE STATUS DIALOG (Actions ⋮ → Change Status) ===== */}
          <Modal
            open={statusTarget !== null}
            onClose={() => setStatusTarget(null)}
            title="Change Status"
            maxWidth="max-w-sm"
            footer={
              <>
                <button
                  type="button"
                  onClick={() => setStatusTarget(null)}
                  className="po-btn po-btn-ghost po-btn-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applyScStatusChange}
                  disabled={!statusValue || statusSaving}
                  className="po-btn po-btn-primary po-btn-sm"
                >
                  {statusSaving ? 'Saving...' : 'Change Status'}
                </button>
              </>
            }
          >
            <div className="space-y-3">
              <div className="text-xs text-slate-500">
                Move <strong>{statusTarget?.label}</strong> to a new status:
              </div>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
                value={statusValue}
                onChange={(e) => setStatusValue(e.target.value)}
                aria-label="New status"
              >
                <option value="">Select status</option>
                {scStatusOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </Modal>
        </>
      )}
      {/* ===== READ-ONLY PREVIEW (Actions ⋮ → Preview) ===== */}
      <RecordPreviewModal
        open={previewRow !== null}
        onClose={() => setPreviewRow(null)}
        title={previewRow?.scNo || `#${previewRow?.id || ''}`}
        subtitle={previewRow?.clientName || previewRow?.client || ''}
        status={previewRow?.status}
        sections={[
          {
            heading: 'Sales Contract',
            rows: [
              ['Contract No', previewRow?.scNo],
              ['Customer', previewRow?.clientName],
              ['Date', previewRow?.contractDate],
              ['Validity', previewRow?.validity],
              ['PO Ref', previewRow?.poRef],
              ['Amount', previewRow?.amount != null ? formatINR(previewRow.amount) : ''],
              ['Status', previewRow?.status]
            ]
          }
        ]}
        footer={
          previewRow && (
            <>
              <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={() => setPreviewRow(null)}>
                Close
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary po-btn-sm"
                onClick={() => { navigate(salesContractListConfig.viewRoute(previewRow)); setPreviewRow(null); }}
              >
                Open in Existing Page
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary po-btn-sm"
                onClick={() => { openInNewTab(salesContractListConfig.viewRoute(previewRow)); setPreviewRow(null); }}
              >
                Open in New Tab
              </button>
            </>
          )
        }
      />
      <style>{`@keyframes po-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
