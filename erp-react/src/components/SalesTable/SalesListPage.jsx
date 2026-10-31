import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openInNewTab } from '../../utils/navigationHelpers';
import { useCurrentUser } from '../Common';
import {
  Archive,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileDown,
  FileText,
  Filter,
  History,
  LayoutGrid,
  ListTree,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  ScanSearch,
  Search,
  Table2,
  Tag,
  Trash2,
  X
} from 'lucide-react';
import SalesBreadcrumb from './SalesBreadcrumb';
import { ActionMenu, ConfirmDialog, Modal, NewCreationMenu, RecordOpenPopover, RecordPreviewModal, SelectInput, SortIcon, useToast } from '../Common';
import { ColumnResizer, ManageColumnsButton } from '../GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { CprActionMenu, CprPagination } from '../CprTable';
import SalesKpiCards from './SalesKpiCards';
import SalesStatusBadge from './SalesStatusBadge';
import SalesFilterPanel from './SalesFilterPanel';
import useClickOutside from '../../hooks/useClickOutside';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import { formatDate, formatINR } from '../../utils/leadHelpers';
import { cpoNo, docNumber, DOC_NUMBER_FIELD } from '../../utils/salesHelpers';
import { isRowPendingApproval, statusCellBgClass } from '../../utils/pendingApproval';
import cellKind from '../../utils/cellKind';
import DocRevisionCell from './DocRevisionCell';
import { convertRoute } from '../../config/salesPageConfigs';

/**
 * Generic list page for a Sales Execution module.
 * config:
 *  - service, moduleKey, listRoute, newRoute, viewRoute, editRoute
 *  - title, icon, breadcrumb, noLabel ('Quotation No', ...)
 *  - columns: [{ key, label, width, sortable, align, render(row) }]
 *  - kpis: [{ key, label, valueOf(stats) }]
 *  - filters: [{ key, label, type, options, placeholder, queryParam }]
 *  - rowActions: fn(row, hook) -> [{ key, label, icon, danger }]
 *  - runRowAction: fn(key, row, hook, navigate)
 *  - newLabel: 'New Quotation'
 *  - searchPlaceholder
 */
export default function SalesListPage({ config, hideBreadcrumb, embedded }) {
  const isEmbedded = embedded || hideBreadcrumb;
  const navigate = useNavigate();
  const toast = useToast();
  const { isAdmin, canDeleteSales } = useCurrentUser();
  const hook = config.useHook();

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
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  } = hook;

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Manageable + resizable columns for this module's list table. The
  // configuration (order, labels, visibility, widths) is restored from MySQL
  // on every open through the shared grid-config store.
  const grid = useManagedGrid({
    gridKey: `sales.list.${config.moduleKey}`,
    defaults: config.columns,
    allowCustom: false,
    protectedKeys: ['checkbox', 'actions']
  });
  const [confirm, setConfirm] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusValue, setStatusValue] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);
  // Kanban click-to-move: id of the card whose stage change is in flight.
  const [movingId, setMovingId] = useState(null);
  // List vs Kanban presentation (only rendered for modules with config.kanban).
  const [viewMode, setViewMode] = useState('list');
  // Kanban drag-and-drop: the card being dragged and the column under it.
  // Transient UI state only — a drop routes through the SAME moveKanbanCard
  // → hook.changeStatus path as the ⋮ "Move to stage" menu, so the status is
  // written by the existing backend and the board re-renders from the
  // refetched server response, never from local state.
  const [draggingCard, setDraggingCard] = useState(null);
  const [dragOverCol, setDragOverCol] = useState(null);
  // Record open popover — appears when the user clicks a document number.
  const [recordPopover, setRecordPopover] = useState(null); // { label, type, route, anchorRef }
  // Read-only Preview modal (Actions ⋮ → Preview) — same UX as Quotations.
  const [previewRow, setPreviewRow] = useState(null);

  // ERP change-status flow: statuses come from the module's status filter options.
  const statusOptions =
    config.filters?.find((f) => f.key === 'status')?.options ||
    config.statuses ||
    [];

  // ===== Kanban move targets =====
  // A column is a move target only when the module's backend can actually
  // persist that status; the default is every configured status value (correct
  // for the module that introduced the board, Sales Orders). A module may pass
  // config.kanbanMoveTargets to narrow it — Credit Notes only keep draft /
  // pending approval / approved / issued, and every other value is normalized
  // to draft by the backend, so offering those would silently write the wrong
  // status. Their columns stay (records that already hold them are still
  // visible) — they are just not drop/click targets.
  const kanbanMoveTargets = config.kanbanMoveTargets || statusOptions;

  // ===== Kanban card content =====
  // The board's LAYOUT is shared; the fields a card shows belong to the module.
  // Sales Orders — the original Kanban module — keeps its exact card markup as
  // the default, while a module can supply
  // config.kanbanCard(row) → { title, subtitle, fields: [[label, value], ...] }.
  // A card may ask for the stacked meta list (layout: 'stack') the Sales
  // Contract board uses, which suits long references better than the two-column
  // grid; without it every field keeps the Sales Order grid.
  const kanbanCard = (row) => {
    const custom = config.kanbanCard?.(row);
    if (custom) {
      return {
        title: custom.title || docNumber(row, config.moduleKey) || `#${row.id}`,
        subtitle: custom.subtitle,
        fields: custom.fields || [],
        layout: custom.layout
      };
    }
    return {
      title: cpoNo(docNumber(row, config.moduleKey) || row.soNo) || `#${row.id}`,
      subtitle: row.clientName || '—',
      fields: [
        ['PO Ref', row.customerPo || '—'],
        ['Date', formatDate(row.orderDate)],
        ['Amount', formatINR(row.grandTotal, row.currency)],
        ['SC Ref', row.scRef || '—']
      ]
    };
  };

  const exportRef = useRef(null);
  useClickOutside(exportRef, () => setExportOpen(false), exportOpen);

  const pageRows = data;

  // Kanban board uses the SAME records as the table (current page from the
  // list hook) — no second data source, so cards and rows can never diverge.
  // Columns come from the module's exact status values (never invented), plus
  // the Archived/Deleted columns while viewing those tabs. EVERY configured
  // column always renders — the board's structure is the workflow itself and
  // must not change with the data. A column with no matching rows keeps its
  // header, shows a 0 count and an in-column empty state — it is never filtered
  // out, so filters and empty tables can't collapse the board.
  const kanbanColumns = config.kanban
    ? [
        ...statusOptions.map((label) => ({ label, key: String(label).toLowerCase() })),
        ...(subtab === 1 ? [{ label: 'Archived', key: 'archived' }] : []),
        ...(subtab === 2 ? [{ label: 'Deleted', key: 'deleted' }] : [])
      ].map((col) => ({
        ...col,
        cards: pageRows.filter((row) => String(row.status || '').toLowerCase() === col.key)
      }))
    : [];

  // A Kanban column accepts a dropped card only when its label is one of this
  // module's OWN move targets (see kanbanMoveTargets). The Archived / Deleted
  // buckets are reached through the archive / delete endpoints, never by a
  // status change, so they stay non-droppable and the browser shows the
  // no-drop cursor over them.
  const canDropOnColumn = (col) =>
    kanbanMoveTargets.some((opt) => String(opt).toLowerCase() === String(col.label).toLowerCase());

  const visibleColumns = grid.visibleColumns;

  // Document-number column pinned while the table scrolls horizontally
  // (same sticky-left behaviour as the CRM tables). The checkbox column is
  // pinned at left: 0 and the doc-number column right after it; the offset
  // is measured from real rendered header widths so hidden columns never
  // misalign the pinned cells.
  const headerRowRef = useRef(null);
  const stickyKey = DOC_NUMBER_FIELD[config.moduleKey];
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
    if (config.rowMenu) {
      return typeof config.rowMenu === 'function' ? config.rowMenu(row, hook) : config.rowMenu;
    }
    // Historical revisions are read-only: edit/duplicate/status/archive/delete
    // are hidden (the backend rejects them too); View stays available.
    const isHistorical = row.latestRevision === false;
    const items = [
      { key: 'view', label: `View ${config.title}`, icon: Eye },
      { key: 'preview', label: 'Preview', icon: ScanSearch },
      { key: 'openInNewTab', label: 'Open in New Tab', icon: FileText },
      ...(!isHistorical ? [{ key: 'edit', label: 'Edit', icon: Pencil }, { key: 'duplicate', label: 'Duplicate', icon: Copy }] : []),
      // Stage change — reuses the module's own status list and the same
      // backend change-status flow the bulk toolbar uses.
      ...(!isHistorical && statusOptions.length ? [{ key: 'changeStatus', label: 'Change Status', icon: Tag }] : []),
      { key: 'activityLog', label: 'Activity Log', icon: History },
      { divider: true }
    ];
    if (!isHistorical && config.rowActions) {
      items.push(...config.rowActions(row, hook));
    }
    if (!isHistorical) {
      if (String(row.status || '').toLowerCase() === 'archived') {
        items.push({ key: 'restore', label: 'Restore', icon: RotateCcw });
      } else {
        items.push({ key: 'archive', label: 'Archive', icon: Archive });
      }
      // Delete (to trash) is a SALES_DELETE action.
      if (canDeleteSales) {
        items.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
      }
    }
    return items;
  };

  const runRowAction = (key, row) => {
    switch (key) {
      case 'view':
        navigate(config.viewRoute(row));
        break;
      case 'preview':
        // Modules with a design workspace open the full Quotation-Preview-style
        // editor; everything else (and the trash view) keeps the quick info drawer.
        if (config.designRoute && subtab !== 2) navigate(config.designRoute(row));
        else setPreviewRow(row);
        break;
      case 'openInNewTab':
        openInNewTab(config.viewRoute(row));
        break;
      case 'edit':
        navigate(config.editRoute(row));
        break;
      case 'duplicate':
        duplicateRow(row);
        break;
      case 'activityLog':
        navigate(`${config.viewRoute(row)}?tab=activities`);
        break;
      case 'archive':
        setConfirm({ type: 'archive', ids: [row.id], label: docNumber(row, config.moduleKey) || config.title });
        break;
      case 'restore':
        setConfirm({ type: 'restore', ids: [row.id], label: docNumber(row, config.moduleKey) || config.title });
        break;
      case 'delete':
        setConfirm({ type: 'delete', ids: [row.id], label: docNumber(row, config.moduleKey) || config.title });
        break;
      case 'permanentDelete':
        setConfirm({ type: 'permanentDelete', ids: [row.id], label: docNumber(row, config.moduleKey) || config.title });
        break;
      case 'changeStatus': {
        setStatusValue(row.status || '');
        setStatusTarget({ ids: [row.id], label: docNumber(row, config.moduleKey) || config.title });
        break;
      }
      default: {
        const result = config.onRowAction?.(key, row, hook, navigate);
        if (result && typeof result.then === 'function') {
          result
            .then((res) => {
              if (res?.ok) {
                toast.success(res.message || 'Action completed');
                // Conversion actions return the created target document so we
                // navigate straight to it (Sales Execution conversion flow).
                const route = convertRoute(res.result);
                if (route) navigate(route);
              } else if (res?.error) toast.error(res.error?.message || 'Action failed');
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
      toast.success(`${config.title} duplicated as ${docNumber(data, config.moduleKey) || ''}`.trim());
    } else {
      toast.error(res.error?.message || `Failed to duplicate ${config.title.toLowerCase()}`);
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

  const applyStatusChange = async () => {
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
      setSelectedIds(new Set());
    } catch (err) {
      toast.error(err?.message || 'Failed to change status');
    } finally {
      setStatusSaving(false);
    }
  };

  // ===== Kanban click-to-move =====
  // Change the card's stage straight from the Kanban column the user picked
  // in — no second dropdown when the destination is already chosen.
  const moveKanbanCard = async (row, nextStatus) => {
    if (movingId || !nextStatus) return;
    const current = String(row.status || '').toLowerCase();
    if (current === String(nextStatus).toLowerCase()) return;
    setMovingId(row.id);
    try {
      const res = await hook.changeStatus(row.id, nextStatus);
      if (res.ok) {
        toast.success(`${docNumber(row, config.moduleKey) || config.title} moved to ${nextStatus}`);
      } else {
        // Card stays in its original column — the board re-renders from the
        // refetched server data, which still has the old status.
        toast.error(res.error?.message || `Unable to update ${config.title} status. Please try again.`);
      }
    } catch (err) {
      toast.error(err?.message || `Unable to update ${config.title} status. Please try again.`);
    } finally {
      setMovingId(null);
    }
  };

  const exportRows = async () => {
    try {
      const blob = await config.service.exportCsv(exportParams());
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${config.title.replace(/\s+/g, '_')}_List_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`${config.title} list exported as CSV`);
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    }
    setExportOpen(false);
  };

  const printRows = () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to print');
      return;
    }
    const printable = visibleColumns.filter((col) => col.key !== 'checkbox' && col.key !== 'actions');
    const header = printable.map((col) => `<th>${col.label}</th>`).join('');
    const body = data
      .map((row) => `<tr>${printable.map((col) => `<td>${String(row[col.key] ?? '—')}</td>`).join('')}</tr>`)
      .join('');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${config.title} Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  h1 { color: #0B4A3D; font-size: 20px; margin: 0 0 4px; }
  p.meta { color: #6B7280; font-size: 12px; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; }
  thead th { background: #0B4A3D; color: #ffffff; text-align: left; padding: 7px; text-transform: uppercase; font-size: 9px; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 6px 7px; }
  tbody tr:nth-child(even) { background: #f8fafc; }
</style>
</head>
<body>
<h1>${config.title} Report</h1>
<p class="meta">Generated on ${new Date().toISOString().slice(0, 10)} - ${data.length} records</p>
<table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>
<script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
    const win = window.open('', '_blank', 'width=1200,height=800');
    if (!win) {
      toast.error('Popup blocked. Please allow pop-ups to print.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // Returns the row field that holds the document number for this module
  // (e.g. quotationNo, invoiceNo) or null. Used to attach the Rev badge.
  const docNumberField = (row) =>
    Object.keys(row).find((k) => row[k] === docNumber(row, config.moduleKey)) || null;

  const renderCell = (col, row) => {
    if (col.render) return col.render(row, navigate);
    const value = row[col.key];
    switch (col.key) {
      case 'status':
        return <SalesStatusBadge status={value} />;
      case 'createdAt':
      case 'date':
      case 'sourceDate':
        return <span className="text-slate-500">{formatDate(value)}</span>;
      default: {
        if (col.align === 'right') {
          return value != null && value !== '' ? (
            <span className="font-bold text-slate-800 text-right block">{formatINR(value, row.currency)}</span>
          ) : (
            <span className="text-slate-300 text-[11px] block text-right">—</span>
          );
        }
        // Revision history dropdown on the document-number column: every edit
        // creates a numbered revision (INV-00001(1), ...) while the previous
        // version is preserved. The latest revision becomes an expandable
        // dropdown listing the whole chain (each entry opens its own exact
        // read-only view). Rows without revisions stay plain text.
        if (row && Number(row.revision) > 0 && col.key === docNumberField(row)) {
          return (
            <DocRevisionCell
              row={row}
              navigate={navigate}
              getDoc={(id) => config.service.get(id)}
              viewRoute={(rev) => config.viewRoute(rev)}
              numberField={stickyKey}
            />
          );
        }
        const raw = value != null && value !== '' ? String(value) : '—';
        // Document number column: clickable link that opens the record in a new tab.
        if (col.key === docNumberField(row)) {
          const displayNo = cpoNo(raw);
          const route = config.viewRoute(row);
          const anchorRef = { current: null };
          return (
            <div style={{ position: 'relative', display: 'inline-block' }} ref={(el) => { anchorRef.current = el; }}>
              <a
                href={route}
                className="font-bold text-[#0B4A3D] hover:underline cursor-pointer"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRecordPopover({
                    label: displayNo,
                    type: config.title || 'Record',
                    route,
                    onExisting: () => navigate(route),
                    anchorRef: { current: e.currentTarget.parentElement }
                  });
                }}
              >
                {displayNo}
              </a>
            </div>
          );
        }
        return raw;
      }
    }
  };

  // ---- Read-only Preview data (Actions ⋮ → Preview) ----
  // Builds the Preview sections from the SAME normalized row the table renders,
  // so the Preview always reflects the real record: document number, customer,
  // dates, status, amounts and item lines. Missing values render as "—".
  const buildPreviewData = (row) => {
    const numberKey = DOC_NUMBER_FIELD[config.moduleKey];
    const numberValue = row?.[numberKey] || docNumber(row, config.moduleKey) || '';
    const displayNo = config.moduleKey === 'salesOrder' ? cpoNo(numberValue) : numberValue;
    const subtitle =
      row?.clientName || row?.client || row?.customer || row?.customerName || '';

    const sections = [];
    const mainRows = [];
    if (row) {
      config.columns.forEach((col) => {
        if (!col || ['checkbox', 'actions', 'items', 'status'].includes(col.key)) return;
        const raw = row[col.key];
        if (raw === undefined || raw === null || raw === '') return;
        let value = raw;
        if (['createdAt', 'date', 'sourceDate'].includes(col.key) || /Date|date/.test(col.key)) {
          value = formatDate(raw);
        } else if (col.align === 'right' || ['grandTotal', 'totalAmount', 'amount'].includes(col.key)) {
          value = formatINR(raw, row.currency);
        } else {
          value = String(raw);
        }
        mainRows.push([col.label, value]);
      });
    }
    if (mainRows.length > 0) sections.push({ heading: config.titlePlural || config.title || 'Details', rows: mainRows });

    let items;
    const itemRows = Array.isArray(row?.items) ? row.items : [];
    if (itemRows.length > 0) {
      const sampleKeys = Object.keys(itemRows[0] || {}).filter(
        (k) => !['id', 'createdAt', 'updatedAt'].includes(k)
      );
      const columns = sampleKeys.map((k) => ({
        key: k,
        label: k
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (c) => c.toUpperCase())
          .replace(/No$/i, ' No.'),
        align: /rate|amount|total|price|qty/i.test(k) ? 'right' : 'left'
      }));
      items = { columns, rows: itemRows };
    }

    const totals = [];
    if (row?.grandTotal !== undefined && row.grandTotal !== null && row.grandTotal !== '') {
      totals.push(['Grand Total', formatINR(row.grandTotal)]);
    }

    return { title: displayNo || `#${row?.id || ''}`, subtitle, status: row?.status, sections, items, totals };
  };

  const confirmConfigs = {
    archive: { title: `Archive ${config.title}`, message: `Archive ${confirm?.label}?`, confirmLabel: 'Archive', variant: 'warning', icon: Archive },
    restore: { title: `Restore ${config.title}`, message: `Restore ${confirm?.label} to active records?`, confirmLabel: 'Restore', variant: 'default', icon: RotateCcw },
    delete: { title: `Delete ${config.title}`, message: `Move ${confirm?.label} to trash?`, confirmLabel: 'Delete', variant: 'danger', icon: Trash2 },
    permanentDelete: { title: 'Delete Permanently?', message: `Permanently delete ${confirm?.label}? This cannot be undone.`, confirmLabel: 'Delete', variant: 'danger', icon: Trash2 }
  };

  const kpiCards = config.kpis.map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: kpi.valueOf(stats),
    icon: kpi.icon,
    color: kpi.color,
    newTabUrl: config.listRoute ? (kpi.key === 'all' || kpi.key === 'totalvalue' ? config.listRoute : `${config.listRoute}?status=${encodeURIComponent(kpi.key)}`) : undefined
  }));


  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside a hub) ===== */}
      {!isEmbedded && (
        <>
          <SalesBreadcrumb
            items={[
              { label: 'Sales Execution', to: '/sales' },
              { label: config.titlePlural || config.title }
            ]}
          />
          <div className="pr-page-header">
            <div>
              <h1>
                <config.icon size={20} />
                {config.titlePlural || `${config.title}s`}
              </h1>
            </div>
            <div className="pr-page-header-actions">
              {config.kanban && (
                <div className="po-view-toggle" role="group" aria-label={`${config.title} view`}>
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    title="List view"
                    className={`po-view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
                  >
                    <Table2 size={14} /> List
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('kanban')}
                    title="Kanban view"
                    className={`po-view-toggle-btn${viewMode === 'kanban' ? ' active' : ''}`}
                  >
                    <LayoutGrid size={14} /> Kanban
                  </button>
                </div>
              )}
              <NewCreationMenu
                moduleKey={config.moduleKey}
                createTo={config.newRoute}
                buttonLabel="New"
                buttonClassName="erp-btn-primary"
                dedupeService={config.service}
                openInNewTab
              />
            </div>
          </div>
        </>
      )}
      {/* ===== VIEW TOGGLE (shown when embedded inside a hub) ===== */}
      {isEmbedded && config.kanban && (
        <div className="po-view-toggle" role="group" aria-label={`${config.title} view`}>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            title="List view"
            className={`po-view-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
          >
            <Table2 size={14} /> List
          </button>
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            title="Kanban view"
            className={`po-view-toggle-btn${viewMode === 'kanban' ? ' active' : ''}`}
          >
            <LayoutGrid size={14} /> Kanban
          </button>
        </div>
      )}

      {/* ===== KPI CARDS ===== */}
      <SalesKpiCards
        cards={kpiCards}
        activeKpi={activeKpi}
        onSelect={selectKpi}
       
        gridClassName={config.kpiGridClassName}
      />

      {/* ===== All Records primary tab (PR reference: pr-tab with count) ===== */}
      <div className="pr-tabs">
        <button type="button" role="tab" aria-selected="true" className="pr-tab active">
          All {config.titlePlural || `${config.title}s`} <span className="tab-count">{totalCount}</span>
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

      {/* ===== TOOLBAR (PR reference — §8: Show Filters + Refresh left | Search + Export + Columns + Count right) ===== */}
      <div className="pr-toolbar">
        <div className="pr-toolbar-left">
          <button
            type="button"
            onClick={() => setShowFilters((prev) => !prev)}
            className="btn btn-ghost btn-sm"
          >
            <Filter size={12} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {searchInput && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(''); }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 11 }}>×</span> Clear</span>
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={hook.refresh}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>↻ Refresh</span>
          </button>
        </div>

        <div className="pr-toolbar-right">
          <input
            type="text"
            className="pr-search-input"
            value={searchInput}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={config.searchPlaceholder}
            aria-label={`Search ${config.titlePlural || config.title}`}
            autoComplete="off"
          />
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportOpen((prev) => !prev)}
              className="btn btn-ghost btn-sm"
            >
              <Download size={14} /> Export ▾
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--purchase-card)] border border-[var(--purchase-border)] rounded-xl shadow-lg py-1 z-50">
                {[
                  { label: 'Export Excel', icon: FileText, fn: async () => { setExportOpen(false); try { const rows = data; const XLSX = await import('xlsx'); const cols = visibleColumns.filter(c => c.key !== 'checkbox' && c.key !== 'actions'); const header = cols.map(c => c.label); const body = rows.map(row => cols.map(col => row[col.key] != null ? String(row[col.key]) : '')); const ws = XLSX.utils.aoa_to_sheet([header, ...body]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, config.title); XLSX.writeFile(wb, `${config.title.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`); toast.success(`${config.title} exported as Excel`); } catch (err) { toast.error(err?.message || 'Excel export failed'); } } },
                  { label: 'Export CSV', icon: FileDown, fn: exportRows },
                  { label: 'Print', icon: Printer, fn: printRows }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={item.fn}
                    className="w-full text-left px-3 py-2 hover:bg-[var(--purchase-hover)] flex items-center gap-2.5 transition-colors cursor-pointer"
                  >
                    <item.icon className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-700">{item.label}</span>
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
      <SalesFilterPanel open={showFilters} filters={filters} onChange={setFilter} onReset={resetFilters} fields={config.filters} />

      {/* ===== ERROR STATE (§26) ===== */}
      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Failed to load records.'}</p>
          <button type="button" className="cpr-error-retry" onClick={hook.refresh}>Try Again</button>
        </div>
      )}

      {/* ===== BULK ACTION BAR (PR reference) ===== */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar visible">
          <span className="bulk-count">
            <strong>{selectedIds.size}</strong> selected
          </span>
          <div className="bulk-actions">
            {subtab === 2 ? (
              <>
                <button
                  type="button"
                  onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}
                  className="po-bulk-btn"
                >
                  <RotateCcw size={13} /> Restore
                </button>
                {canDeleteSales && (
                  <button
                    type="button"
                    onClick={() => setConfirm({ type: 'permanentDelete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}
                    className="po-bulk-btn po-bulk-btn-danger"
                  >
                    <Trash2 size={13} /> Delete Permanently
                  </button>
                )}
              </>
            ) : (
              <>
                {canDeleteSales && (
                  <button
                    type="button"
                    onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}
                    className="po-bulk-btn po-bulk-btn-danger"
                  >
                    <Trash2 size={13} /> Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setStatusValue('');
                    setStatusTarget({ ids: [...selectedIds], label: `${selectedIds.size} record(s)` });
                  }}
                  className="po-bulk-btn"
                >
                  <Tag size={13} /> Change Status
                </button>
                <button
                  type="button"
                  onClick={() => setConfirm({ type: 'archive', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}
                  className="po-bulk-btn"
                >
                  <Archive size={13} /> Archive
                </button>
                <button
                  type="button"
                  onClick={exportRows}
                  className="po-bulk-btn"
                >
                  <Download size={13} /> Export
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== TABLE / KANBAN CARD ===== */}
      {config.kanban && viewMode === 'kanban' ? (
        <div className="po-table-card">
          <div className="flex gap-4 overflow-x-auto p-4 min-h-[180px]">
            {loading ? (
              <div className="flex-1 flex items-center justify-center py-16">
                <div className="inline-block h-6 w-6 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
              </div>
            ) : kanbanColumns.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                <LayoutGrid className="w-9 h-9 text-slate-300 mb-3" />
                <div className="text-sm font-bold text-slate-600 mb-1">No {config.titlePlural || config.title} found</div>
                <div className="text-xs text-slate-400">
                  {searchInput || Object.keys(filters).length
                    ? 'Try adjusting your search or filters.'
                    : `Create your first ${config.title.toLowerCase()} to get started.`}
                </div>
              </div>
            ) : (
              kanbanColumns.map((col) => {
                const droppable = canDropOnColumn(col);
                const isDropTarget = Boolean(draggingCard) && droppable;
                return (
                <div
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
                  className={`flex-1 min-w-[260px] bg-slate-50 border border-slate-200 rounded-xl p-3 transition-colors${
                    isDropTarget ? ' po-kanban-col--drop-target' : ''
                  }${dragOverCol === col.key ? ' po-kanban-col--drop' : ''}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[12px] font-bold uppercase tracking-wide text-slate-600">{col.label}</span>
                    <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold bg-[#0B4A3D] text-white">
                      {col.cards.length}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {col.cards.length === 0 && (
                      <div className="border border-dashed border-slate-200 rounded-xl py-6 text-center text-[11px] font-semibold text-slate-400">
                        No records in this stage
                      </div>
                    )}
                    {col.cards.map((row) => {
                      const pending = isRowPendingApproval(row.status);
                      const isMoving = movingId === row.id;
                      const card = kanbanCard(row);
                      const stageMenuItems = [
                        { section: 'MOVE TO STAGE' },
                        ...kanbanMoveTargets
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
                          onClick={() => !isMoving && navigate(config.viewRoute(row))}
                          className={`w-full text-left bg-white border rounded-xl p-3 shadow-sm hover:shadow-md hover:border-[#0B4A3D]/30 transition-all cursor-pointer ${
                            isMoving ? 'opacity-60 pointer-events-none' : 'border-slate-200'
                          }${draggingCard?.id === row.id ? ' po-kanban-card--dragging' : ''}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-[13px] font-bold text-slate-900 break-words">
                              {card.title}
                            </span>
                            {pending && (
                              <span
                                className="po-badge po-badge-orange shrink-0 mt-1"
                                title="Pending Approval"
                                aria-label="Pending Approval"
                              >Pending Approval</span>
                            )}
                          </div>
                          <div className="text-[12px] text-slate-600 mb-2">{card.subtitle || '—'}</div>
                          <div
                            className={
                              card.layout === 'stack'
                                ? 'flex flex-col gap-0.5 text-[11px] mb-2.5'
                                : 'grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] mb-2.5'
                            }
                          >
                            {card.fields.map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <span className="text-slate-400">{label}: </span>
                                <span className="text-slate-700 font-medium">{value}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
                            <SalesStatusBadge status={row.status} />
                            {/* Click-to-move: pick a destination stage — the
                                move is saved through the module's status API
                                and the board refetches from the database. */}
                            {kanbanMoveTargets.length > 0 && (
                              <ActionMenu
                                items={stageMenuItems}
                                buttonLabel={`Move ${docNumber(row, config.moduleKey) || 'record'} to another stage`}
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
              })
            )}
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
        <div className="pr-table-card">
        <div className="pr-table-wrap">
          {/* `sgrid` = the shared sticky data grid (styles/sticky-data-grid.css):
              checkbox + document number pinned left, Actions pinned right. */}
          <table
            className="pr-table sgrid sgrid-sales"
            style={{
              tableLayout: 'fixed',
              minWidth: grid.widthsCustomized
                ? Math.max(
                    config.tableMinWidth || 1000,
                    visibleColumns.reduce((sum, col) => sum + (Number(grid.resize.widthOf(col)) || 0), 0)
                  )
                : config.tableMinWidth || 1000
            }}
          >
            <colgroup>
              {visibleColumns.map((col) => (
                <col key={col.key} style={{ width: grid.resize.widthOf(col) }} />
              ))}
            </colgroup>
            <thead>
              <tr ref={headerRowRef} className="purchase-table-head">
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
                    style={{
                      width: grid.resize.widthOf(col),
                      ...(isStickyCell(col) ? { left: stickyLeft } : {})
                    }}
                    className={`${
                      col.align === 'right' ? 'text-right' : ''
                    } ${col.sortable ? 'cursor-pointer select-none' : ''} ${
                      col.key === 'checkbox' || col.key === 'actions' ? '' : 'grid-resizable-th'
                    } ${
                      col.key === 'checkbox'
                        ? 'sgrid-pin sgrid-first purchase-table-head'
                        : isStickyCell(col)
                          ? 'sgrid-pin purchase-table-head'
                          : col.key === 'actions'
                            ? 'sgrid-pin-actions purchase-table-head'
                            : ''
                    }`}
                    onClick={col.sortable ? () => toggleSort(col.key) : undefined}
                  >
                    {col.key === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={(e) => selectAll(e.target.checked)}
                        aria-label="Select all on page"
                        className="w-3.5 h-3.5 rounded border-slate-300 accent-[var(--purchase-accent)] cursor-pointer"
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
                  <td colSpan={visibleColumns.length} className="py-16 text-center">
                    <div className="inline-block h-6 w-6 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length} className="py-16 text-center">
                    <FileText className="w-9 h-9 text-slate-300 mx-auto mb-3" />
                    <div className="text-sm font-bold text-slate-600 mb-1">No {config.titlePlural || config.title} found</div>
                    <div className="text-xs text-slate-400 mb-4">
                      {searchInput || Object.keys(filters).length
                        ? 'Try adjusting your search or filters.'
                        : `Create your first ${config.title.toLowerCase()} to get started.`}
                    </div>
                    {!searchInput && Object.keys(filters).length === 0 && (                        <button
                        type="button"
                        onClick={() => openInNewTab(config.newRoute)}
                        className="po-btn po-btn-primary-grad po-btn-sm"
                      >
                        <Plus size={14} /> {config.newLabel}
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  // Red status dot (no row highlight) for records awaiting approval
                  // — Quotations / Credit Notes ('pending approval'), Sales
                  // Contracts ('submitted' / 'under review'), Sales Orders
                  // ('pending review'). Modules without an approval workflow
                  // (Proforma, DC, Invoice, Receipts) never match these states.
                  const pending = isRowPendingApproval(row.status);
                  const statusBg = pending && isStickyCell({ key: DOC_NUMBER_FIELD[config.moduleKey] }) ? statusCellBgClass(row.status) : '';
                  return (
                  <tr
                    key={row.id}
                    className="group transition-colors hover:bg-[#F0FAF7]"
                  >
                    {visibleColumns.map((col) => {
                      const kindClass = cellKind(col.key);
                      const cellTitle = kindClass === 'cell-id' && row[col.key] != null
                        ? String(row[col.key])
                        : undefined;
                      return (
                      <td
                        key={col.key}
                        style={isStickyCell(col) ? { left: stickyLeft } : undefined}
                        title={cellTitle}
                        className={`${
                          col.align === 'right' ? 'text-right' : ''
                        } ${
                          kindClass || ''
                        } ${
                          col.key === 'checkbox'
                            ? 'sgrid-pin sgrid-first'
                            : isStickyCell(col)
                              ? `sgrid-pin ${statusBg}`
                              : col.key === 'actions'
                                ? 'sgrid-pin-actions'
                                : ''
                        }`}
                      >
                        {col.key === 'checkbox' ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={(e) => toggleSelect(row.id, e.target.checked)}
                            aria-label={`Select ${cpoNo(docNumber(row, config.moduleKey)) || row.id}`}
                            className="w-3.5 h-3.5 rounded border-slate-300 accent-[var(--purchase-accent)] cursor-pointer"
                          />
                        ) : col.key === 'actions' ? (
                          <CprActionMenu
                            items={buildRowActions(row).filter((item) => {
                              // Admin-only actions: approve
                              if (item.key === 'approve' && !isAdmin) return false;
                              // SALES_DELETE-only actions: the backend refuses
                              // delete / permanent delete for a caller without
                              // it, so the entries are not offered at all.
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
                    );
                  })}
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

      {/* ===== CHANGE STATUS DIALOG (ERP change-status flow) ===== */}
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
              onClick={applyStatusChange}
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
          {/* Kanban click-to-move: every stage is a direct choice — click it
              and the record is saved to that stage. Same statuses as the
              module's status filter (the backend's own list). */}
          {statusTarget?.fromKanban ? (
            <div className="flex flex-wrap gap-2" role="listbox" aria-label="Destination stage">
              {statusOptions.map((opt) => {
                const active = statusValue === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={statusSaving}
                    onClick={() => setStatusValue(opt)}
                    className={`px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? 'bg-[#0B4A3D] border-[#0B4A3D] text-white'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-[#0B4A3D]/40 hover:text-[#0B4A3D]'
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          ) : (
            <SelectInput value={statusValue} onChange={(e) => setStatusValue(e.target.value)} aria-label="New status">
              <option value="">Select status</option>
              {statusOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </SelectInput>
          )}
        </div>
      </Modal>

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

      {/* ===== READ-ONLY PREVIEW (Actions ⋮ → Preview) ===== */}
      <RecordPreviewModal
        open={previewRow !== null}
        onClose={() => setPreviewRow(null)}
        {...(previewRow ? buildPreviewData(previewRow) : {})}
        footer={
          previewRow && (
            <>
              <button
                type="button"
                className="po-btn po-btn-ghost po-btn-sm"
                onClick={() => setPreviewRow(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary po-btn-sm"
                onClick={() => {
                  const route = config.viewRoute(previewRow);
                  setPreviewRow(null);
                  navigate(route);
                }}
              >
                Open in Existing Page
              </button>
              <button
                type="button"
                className="po-btn po-btn-primary po-btn-sm"
                onClick={() => {
                  const route = config.viewRoute(previewRow);
                  setPreviewRow(null);
                  openInNewTab(route);
                }}
              >
                Open in New Tab
              </button>
            </>
          )
        }
      />
    </div>
  );
}
