import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { openInNewTab } from '../../utils/navigationHelpers';
import {
  Archive,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  History,
  Pencil,
  PenLine,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X
} from 'lucide-react';
import { ConfirmDialog, EditableMasterDropdown, Modal, NewCreationMenu, SelectInput, SortIcon, useCurrentUser, useToast } from '../../components/Common';
import { ColumnResizer, ManageColumnsButton } from '../../components/GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import { CprActionMenu, CprPagination } from '../../components/CprTable';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import QtnFollowUpCell from '../../components/SalesTable/QtnFollowUpCell';
import useClickOutside from '../../hooks/useClickOutside';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import { downloadBlob, formatDate, formatINR } from '../../utils/leadHelpers';
import { pdfSafe } from '../../utils/pdfText';
import { computeTotals, cpoNo, docNumber, DOC_NUMBER_FIELD, normalizeQuotation } from '../../utils/salesHelpers';
import { isRowPendingApproval, statusCellBgClass } from '../../utils/pendingApproval';
import { buildSalesPrintHtml, exportSalesDocumentPdf } from '../../utils/salesPrintUtils';
import QuotationPdfEditor from '../../components/Export/QuotationPdfEditor';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import {
  quotationListConfig,
  REFERENCE_PR_NO_COLUMN,
  REFERENCE_PR_NO_LABEL,
  REFERENCE_PR_NO_LEGACY_LABEL
} from '../../config/salesPageConfigs';
import './quotation-module.css';
import '../crm/crm-erp.css';

const bulkMenuItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '9px 14px',
  fontSize: 13,
  color: '#374151',
  width: '100%',
  textAlign: 'left',
  background: 'none',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'Inter, sans-serif'
};

/**
 * Quotation List page — visual 1:1 with the ERP Purchase module's
 * purchase-list.html (po-* layout) while keeping every Quotation list
 * action intact (search, KPI filters, filters, sort, bulk ops, export,
 * print, archive/restore/delete, change status, convert, email, PDF).
 * Data flow is identical to the shared SalesListPage: the config's
 * useSalesModule hook drives all state and mutations.
 */
export default function QuotationListPage({ embedded }) {
  const navigate = useNavigate();
  const toast = useToast();
  // SALES_DELETE, mirrored from the backend role → permission map — the delete
  // entry points below are gated on it (the backend still enforces it).
  const { canDeleteSales } = useCurrentUser();
  const hook = quotationListConfig.useHook();

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
  // Manageable + resizable columns, restored from MySQL on every open.
  const grid = useManagedGrid({
    gridKey: `sales.list.${quotationListConfig.moduleKey}`,
    defaults: quotationListConfig.columns,
    allowCustom: false,
    // The serial-number column was removed from the quotation list: purge it
    // from any stored configuration so no '# ' ghost column can come back.
    excludeKeys: ['sno'],
    protectedKeys: ['checkbox', 'actions']
  });
  // One-time upgrade of the stored Reference PR No. column configuration.
  //
  // The column shipped hidden by default and labelled without its period, so a
  // configuration stored before this change still carries that state for it —
  // something no user could have chosen deliberately, because hiding the column
  // had no visible effect (it WAS the default) and the old label is not one the
  // user could have typed by hand. Each of those two defaults is upgraded once
  // and stamped (`revealed` / `relabelled`) in the stored configuration itself,
  // so this never runs again and both the show/hide switch and the column's
  // name in Manage Columns stay the user's own choice from then on.
  const upgradedReferencePrNo = useRef(false);
  useEffect(() => {
    if (!grid.loaded || upgradedReferencePrNo.current) return;
    const column = grid.columns.find((c) => c.id === REFERENCE_PR_NO_COLUMN);
    if (!column) return;
    const needsReveal = Boolean(column.hidden) && !column.revealed;
    const needsLabel = column.label === REFERENCE_PR_NO_LEGACY_LABEL && !column.relabelled;
    if (!needsReveal && !needsLabel) return;
    upgradedReferencePrNo.current = true;
    grid.setColumns(
      grid.columns.map((c) =>
        c.id === REFERENCE_PR_NO_COLUMN
          ? {
              ...c,
              hidden: needsReveal ? false : c.hidden,
              label: needsLabel ? REFERENCE_PR_NO_LABEL : c.label,
              revealed: c.revealed || needsReveal,
              relabelled: c.relabelled || needsLabel
            }
          : c
      )
    );
    // `grid` itself carries the loaded flag, the columns and the setter; the
    // upgrade is idempotent (the ref above plus the stamps in the stored
    // configuration), so re-running it on a new object is harmless.
  }, [grid]);
  const [confirm, setConfirm] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [bulkExportOpen, setBulkExportOpen] = useState(false);
  const [pdfEditDoc, setPdfEditDoc] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [statusValue, setStatusValue] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  const statusOptions =
    quotationListConfig.filters?.find((f) => f.key === 'status')?.options ||
    quotationListConfig.statuses ||
    [];

  const exportRef = useRef(null);
  useClickOutside(exportRef, () => setExportOpen(false), exportOpen);
  const bulkExportRef = useRef(null);
  useClickOutside(bulkExportRef, () => setBulkExportOpen(false), bulkExportOpen);

  const pageRows = data;

  const visibleColumns = grid.visibleColumns;

  // Document-number column pinned while the table scrolls horizontally
  // (same sticky-left behaviour as the CRM tables). The checkbox column is
  // pinned at left: 0 and the doc-number column right after it; the offset
  // is measured from real rendered header widths so hidden columns never
  // misalign the pinned cells.
  const headerRowRef = useRef(null);
  const stickyKey = DOC_NUMBER_FIELD[quotationListConfig.moduleKey];
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
        { key: 'restore', label: 'Restore', icon: RotateCcw },
        // Permanent delete is a SALES_DELETE action — never offered without it.
        ...(canDeleteSales
          ? [{ key: 'permanentDelete', label: 'Permanent Delete', icon: Trash2, danger: true }]
          : [])
      ];
    }
    if (quotationListConfig.rowMenu) {
      return typeof quotationListConfig.rowMenu === 'function'
        ? quotationListConfig.rowMenu(row, hook)
        : quotationListConfig.rowMenu;
    }
    const items = [
      { key: 'view', label: `View ${quotationListConfig.title}`, icon: Eye },
      { key: 'edit', label: 'Edit', icon: Pencil },
      { key: 'duplicate', label: 'Duplicate', icon: Copy },
      { key: 'activityLog', label: 'Activity Log', icon: History },
      { divider: true }
    ];
    if (quotationListConfig.rowActions) {
      items.push(...quotationListConfig.rowActions(row, hook));
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
        navigate(quotationListConfig.viewRoute(row));
        break;
      // Preview opens the existing quotation design/preview page (same route
      // the PDF editor's "Open in Preview" uses), loading the selected row's id.
      case 'preview':
        navigate(`/quotations/design?id=${row.id}`);
        break;
      case 'edit':
        navigate(quotationListConfig.editRoute(row));
        break;
      case 'duplicate':
        duplicateRow(row);
        break;
      case 'activityLog':
        navigate(`${quotationListConfig.viewRoute(row)}?tab=activities`);
        break;
      case 'archive':
        setConfirm({ type: 'archive', ids: [row.id], label: docNumber(row, quotationListConfig.moduleKey) || quotationListConfig.title });
        break;
      case 'restore':
        setConfirm({ type: 'restore', ids: [row.id], label: docNumber(row, quotationListConfig.moduleKey) || quotationListConfig.title });
        break;
      case 'delete':
        setConfirm({ type: 'delete', ids: [row.id], label: docNumber(row, quotationListConfig.moduleKey) || quotationListConfig.title });
        break;
      case 'permanentDelete':
        setConfirm({ type: 'permanentDelete', ids: [row.id], label: docNumber(row, quotationListConfig.moduleKey) || quotationListConfig.title });
        break;
      case 'changeStatus': {
        setStatusValue(row.status || '');
        setStatusTarget({ ids: [row.id], label: docNumber(row, quotationListConfig.moduleKey) || quotationListConfig.title });
        break;
      }
      default: {
        const result = quotationListConfig.onRowAction?.(key, row, hook, navigate);
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
      toast.success(`${quotationListConfig.title} duplicated as ${docNumber(data, quotationListConfig.moduleKey) || ''}`.trim());
    } else {
      toast.error(res.error?.message || `Failed to duplicate ${quotationListConfig.title.toLowerCase()}`);
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

  // ---- Export (PDF / Excel) of the currently filtered & sorted rows ----
  // Walks every page of the active filter/sort query (the backend caps page
  // size at 200) so the file contains ALL matching quotations, then builds
  // the file client-side using only the visible columns.
  const fetchAllFilteredRows = async () => {
    const params = { ...exportParams() };
    delete params.page;
    delete params.size;
    const rows = [];
    const PAGE_SIZE = 200;
    for (let pageIndex = 0; pageIndex <= 250; pageIndex += 1) {
      const res = await quotationListConfig.service.list({ ...params, page: pageIndex, size: PAGE_SIZE });
      const pageRows = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
          ? res.data
          : res?.content ?? res?.data?.content ?? [];
      if (!Array.isArray(pageRows) || pageRows.length === 0) break;
      rows.push(...pageRows.map(normalizeQuotation));
      const total = res?.totalElements ?? res?.data?.totalElements ?? pageRows.length;
      if (rows.length >= total || pageRows.length < PAGE_SIZE) break;
    }
    return rows;
  };

  const exportColumns = () => visibleColumns.filter((col) => col.key !== 'checkbox' && col.key !== 'actions');

  const exportCellValue = (col, row) => {
    switch (col.key) {
      case 'quotationDate':
      case 'validUntil':
      case 'createdAt':
        return formatDate(row[col.key]);
      case 'items':
        return Array.isArray(row.items) ? row.items.length : row.itemsCount ?? '';
      case 'grandTotal':
        return row.grandTotal != null && row.grandTotal !== '' ? formatINR(row.grandTotal) : '';
      case 'status':
        return String(row.status || '').replace(/^\w/, (c) => c.toUpperCase());
      case 'followUpStatus':
        return row.followUpStatus || 'No Follow-up';
      case 'poStatus':
        if (!row.poStatus) return 'Not Released';
        return row.poStatus === 'cancelled' ? 'Cancelled' : 'Released';
      case 'createdBy':
        return row.createdBy || '';
      case REFERENCE_PR_NO_COLUMN:
        // Same value the cell shows: the quotation's real source PR reference.
        return row[REFERENCE_PR_NO_COLUMN] || row.reference || '';
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
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Quotations');
      XLSX.writeFile(workbook, `Quotations_List_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Quotation list exported as Excel');
    } catch (err) {
      toast.error(err?.message || 'Excel export failed');
    }
  };

  const exportToCsv = async () => {
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
      const csv = [header, ...body].map((line) => line.map(escapeCsv).join(',')).join('\r\n');
      downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), `Quotations_List_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('Quotation list exported as CSV');
    } catch (err) {
      toast.error(err?.message || 'CSV export failed');
    }
  };

  const printList = async () => {
    setExportOpen(false);
    try {
      const rows = await fetchAllFilteredRows();
      if (rows.length === 0) {
        toast.error('No data available to print');
        return;
      }
      const cols = exportColumns();
      const thead = `<tr>${cols.map((c) => `<th style="padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:left;border-bottom:2px solid #0B4A3D;color:#0B4A3D;background:#f8fafc">${String(c.label || '').replace(/[<>&"]/g, '')}</th>`).join('')}</tr>`;
      const tbody = rows
        .map(
          (row) =>
            `<tr>${cols.map((col) => `<td style="padding:7px 10px;font-size:11px;border-bottom:1px solid #e2e8f0">${String(exportCellValue(col, row) ?? '').replace(/[<>&"]/g, '')}</td>`).join('')}</tr>`
        )
        .join('');
      const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>Quotations List Print</title><style>@media print { body { -webkit-print-color-adjust: exact; } }</style></head><body style="font-family:Inter,Arial,sans-serif;margin:24px"><h1 style="font-size:18px;color:#0B4A3D;margin-bottom:2px">Quotation List Report</h1><p style="font-size:11px;color:#6B7280;margin-bottom:16px">Generated on ${new Date().toISOString().slice(0, 10)} - ${rows.length} records</p><table style="width:100%;border-collapse:collapse">${thead}${tbody}</table></body></html>`;
      openPrintWindow(html);
      toast.success('Print preview opened');
    } catch (err) {
      toast.error(err?.message || 'Print failed');
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
      doc.text('Quotation List Report', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(`Generated on ${new Date().toISOString().slice(0, 10)} - ${rows.length} records`, 40, 55);
      // pdfSafe keeps the rupee sign/typographic characters out of the PDF's
      // built-in font (they used to render as spaced-out digits), and amounts
      // follow their column alignment.
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
      doc.save(`Quotations_List_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Quotation list exported as PDF');
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  // ===== Selected-quotation export (bulk bar Export menu) =====
  // Every option below uses the REAL database data of the selected
  // quotation(s) fetched through the service — never mock or hardcoded data —
  // and every downloaded file is named with the quotation number/reference.

  const safeFileName = (name) => String(name || 'quotation').replace(/[\\/:*?"<>|]/g, '_');

  const fetchSelectedQuotations = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return { docs: [], failed: 0 };
    const docs = [];
    let failed = 0;
    for (const id of ids) {
      try {
        const res = await quotationListConfig.service.get(id);
        const raw = res?.data ?? res ?? {};
        if (raw?.id) docs.push(normalizeQuotation(raw));
        else failed += 1;
      } catch {
        // Documents that cannot be fetched are skipped; the rest still export.
        failed += 1;
      }
    }
    return { docs, failed };
  };

  const quotationTotals = (doc) =>
    computeTotals(Array.isArray(doc.items) ? doc.items : [], {
      discountPct: doc.discountPct ?? doc.discount ?? 0,
      charges: (doc.charges ?? 0) + (doc.freight ?? 0) + (doc.insurance ?? 0),
      roundOffEnabled: false
    });

  // CSV / Excel block rows: quotation details + client details + totals.
  const quotationSummaryAoa = (doc) => {
    const totals = quotationTotals(doc);
    return [
      ['Quotation No', docNumber(doc, 'quotation') || doc.quotationNo || doc.id || ''],
      ['Date', formatDate(doc.quotationDate || doc.createdAt)],
      ['Valid Till', formatDate(doc.validUntil)],
      ['Reference', doc.reference || ''],
      ['Sales Person', doc.salesPerson || ''],
      ['Currency', doc.currency || ''],
      ['Status', String(doc.status || '').replace(/^\w/, (c) => c.toUpperCase())],
      [],
      ['Client', doc.clientName || doc.client || ''],
      ['Contact Person', doc.contactPerson || ''],
      ['Phone', doc.phone || ''],
      ['Email', doc.email || ''],
      ['GSTIN', doc.gstin || ''],
      ['PAN', doc.pan || ''],
      ['Billing Address', doc.billingAddress || ''],
      ['Shipping Address', doc.shippingAddress || ''],
      [],
      ['Sub Total', totals.subTotal],
      ['Discount', totals.discount],
      ['CGST', totals.cgstTotal],
      ['SGST', totals.sgstTotal],
      ['Tax Total', totals.taxTotal],
      ['Charges', totals.charges],
      ['Grand Total', totals.grandTotal],
      ...(doc.terms ? [['Terms & Conditions', doc.terms]] : []),
      ...(doc.notes ? [['Notes', doc.notes]] : []),
      ...(doc.remarks ? [['Remarks', doc.remarks]] : [])
    ];
  };

  // Item grid rows: quantities, rates, discounts, taxes and amounts.
  const quotationItemsAoa = (doc) => {
    const items = Array.isArray(doc.items) ? doc.items : [];
    return [
      ['#', 'Product', 'Description', 'HSN', 'Unit', 'Qty', 'Rate', 'Discount %', 'GST %', 'Amount'],
      ...items.map((it, idx) => [
        idx + 1,
        it.productName || it.product || '',
        it.description || '',
        it.hsn || '',
        it.unit || '',
        it.qty ?? '',
        Number(it.rate) || 0,
        it.discountPct ?? 0,
        it.gstRate ?? 0,
        Number(it.amount) || Number(it.total) || 0
      ])
    ];
  };

  const escapeCsv = (value) => {
    const str = value == null ? '' : String(value);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const downloadQuotationCsv = (doc) => {
    const rows = [...quotationSummaryAoa(doc), [], ['ITEMS'], ...quotationItemsAoa(doc)];
    const csv = rows.map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, `Quotation_${safeFileName(docNumber(doc, 'quotation') || doc.id || 'quotation')}.csv`);
  };

  const exportSelectedCsv = async () => {
    setBulkExportOpen(false);
    const { docs, failed } = await fetchSelectedQuotations();
    if (docs.length === 0) {
      toast.error(failed > 0 ? 'Could not fetch the selected quotation(s)' : 'No data available to export');
      return;
    }
    try {
      docs.forEach(downloadQuotationCsv);
      toast.success(
        `${docs.length} quotation${docs.length === 1 ? '' : 's'} exported as CSV${failed > 0 ? ` (${failed} skipped)` : ''}`
      );
    } catch (err) {
      toast.error(err?.message || 'CSV export failed');
    }
  };

  const exportSelectedExcel = async () => {
    setBulkExportOpen(false);
    const { docs, failed } = await fetchSelectedQuotations();
    if (docs.length === 0) {
      toast.error(failed > 0 ? 'Could not fetch the selected quotation(s)' : 'No data available to export');
      return;
    }
    try {
      const XLSX = await import('xlsx');
      docs.forEach((doc) => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(quotationSummaryAoa(doc)), 'Quotation');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(quotationItemsAoa(doc)), 'Items');
        XLSX.writeFile(wb, `Quotation_${safeFileName(docNumber(doc, 'quotation') || doc.id || 'quotation')}.xlsx`);
      });
      toast.success(
        `${docs.length} quotation${docs.length === 1 ? '' : 's'} exported as Excel${failed > 0 ? ` (${failed} skipped)` : ''}`
      );
    } catch (err) {
      toast.error(err?.message || 'Excel export failed');
    }
  };

  const exportSelectedPdf = async () => {
    setBulkExportOpen(false);
    const { docs, failed } = await fetchSelectedQuotations();
    if (docs.length === 0) {
      toast.error(failed > 0 ? 'Could not fetch the selected quotation(s)' : 'No data available to export');
      return;
    }
    try {
      for (const doc of docs) {
        await exportSalesDocumentPdf(
          doc,
          'Quotation',
          'quotation',
          `Quotation_${safeFileName(docNumber(doc, 'quotation') || doc.id || 'quotation')}`
        );
      }
      toast.success(
        `${docs.length} quotation${docs.length === 1 ? '' : 's'} exported as PDF${failed > 0 ? ` (${failed} skipped)` : ''}`
      );
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  const openPrintWindow = (html) => {
    const win = window.open('', '_blank', 'width=1000,height=750');
    if (!win) {
      toast.error('Popup blocked. Please allow pop-ups to print.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  const printSelected = async () => {
    setBulkExportOpen(false);
    const { docs, failed } = await fetchSelectedQuotations();
    if (docs.length === 0) {
      toast.error(failed > 0 ? 'Could not fetch the selected quotation(s)' : 'No data available to print');
      return;
    }
    try {
      if (docs.length === 1) {
        openPrintWindow(buildSalesPrintHtml(docs[0], 'Quotation', 'quotation'));
      } else {
        // One print window for ALL selected quotations (never duplicate windows).
        const styleMatch = buildSalesPrintHtml(docs[0], 'Quotation', 'quotation').match(/<style>([\s\S]*?)<\/style>/i);
        const style = styleMatch ? styleMatch[1] : '';
        const body = docs
          .map((doc, i) => {
            const html = buildSalesPrintHtml(doc, 'Quotation', 'quotation');
            const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            const content = (m ? m[1] : html).replace(/<script[\s\S]*?<\/script>/gi, '');
            return `<div style="page-break-after: ${i < docs.length - 1 ? 'always' : 'auto'}">${content}</div>`;
          })
          .join('');
        openPrintWindow(
          `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>Quotations Print</title><style>${style}</style></head><body>${body}<script>window.onload = function () { window.print(); };</script></body></html>`
        );
      }
      toast.success(`Print preview opened${failed > 0 ? ` (${failed} skipped)` : ''}`);
    } catch (err) {
      toast.error(err?.message || 'Print failed');
    }
  };

  const openPdfEditor = async () => {
    setBulkExportOpen(false);
    const { docs } = await fetchSelectedQuotations();
    if (docs.length === 0) {
      toast.warning('No quotation selected');
      return;
    }
    setPdfEditDoc(docs[0]);
  };

  /**
   * Follow-up Status cell — the REAL follow-ups of the quotation (backend:
   * followups.quotationId). The count and the records behind it come from the
   * SAME batched page query, so the cell reads "2 Follow-ups" and opens exactly
   * those two records in the shared CRM Leads "Follow-up History" dropdown;
   * with no follow-ups it keeps "No Follow-up".
   */
  const followUpCell = (row) => <QtnFollowUpCell row={row} />;

  /**
   * PO Status cell — the REAL Customer Purchase Order linked to this quotation
   * (backend: sales_orders.qtnRef = quotations.quotation_no). "Released" uses
   * the same rule as the Quotation Overview (a CPO exists); a cancelled CPO is
   * reported as cancelled. The PRIMARY identifier is the actual CPO number
   * (backend sends sales_orders.so_no — the CPO record's own number, e.g.
   * CPO-2026-000001 on new records), with the CPO's own status beneath, and
   * clicking opens the existing CPO page. Nothing here is a text swap: the
   * number comes from the linked Customer Purchase Order record itself.
   */
  const poCell = (row, value) => {
    if (!value) {
      return <span className="po-badge po-badge-gray">Not Released</span>;
    }
    const cancelled = value === 'cancelled';
    const badge = cancelled
      ? <span className="po-badge po-badge-red">Cancelled</span>
      : <span className="po-badge po-badge-green">Released</span>;
    // CPO number first (the identifier), the CPO's own status beneath it.
    // poNo IS the real linked CPO record's number (sales_orders.so_no, sent by
    // the backend). cpoNo() is the app-wide display convention shared with the
    // CPO List / Overview / print: records whose number was generated in the
    // legacy SO-YYYY-NNNNNN format display as CPO-YYYY-NNNNNN — the real
    // sequence, never a fabricated number, and new records are natively
    // CPO-YYYY-NNNNN already.
    const detail = [
      cpoNo(row.poNo) || row.poNo,
      row.poRawStatus ? String(row.poRawStatus).replace(/^\w/, (c) => c.toUpperCase()) : null
    ]
      .filter(Boolean)
      .join(' · ');
    const body = (
      <>
        {detail && (
          <div style={{ fontSize: 11, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {detail}
          </div>
        )}
        {badge}
      </>
    );
    if (!row.poId) return body;
    return (
      <button
        type="button"
        title={`Open ${cpoNo(row.poNo) || 'Customer Purchase Order'}`}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
        onClick={() => navigate(`/sales-orders/${row.poId}`)}
      >
        {body}
      </button>
    );
  };

  const renderCell = (col, row) => {
    if (col.render) return col.render(row, navigate);
    const value = row[col.key];
    switch (col.key) {
      case 'status':
        return <SalesStatusBadge status={value} />;
      case 'followUpStatus':
        return followUpCell(row);
      case 'poStatus':
        return poCell(row, value);
      case 'createdAt':
      case 'date':
        return <span className="text-slate-500">{formatDate(value)}</span>;
      case 'quotationNo':
        if (value != null && value !== '') {
          return (
            <a
              href={quotationListConfig.viewRoute(row)}
              
              
              className="font-bold text-[#0B4A3D] hover:underline cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            >
              {value}
            </a>
          );
        }
        return '—';
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
      title: `Archive ${quotationListConfig.title}`,
      message: `Archive ${confirm?.label}?`,
      confirmLabel: 'Archive',
      variant: 'warning',
      icon: Archive
    },
    restore: {
      title: `Restore ${quotationListConfig.title}`,
      message: `Restore ${confirm?.label} to active records?`,
      confirmLabel: 'Restore',
      variant: 'default',
      icon: RotateCcw
    },
    delete: {
      title: `Delete ${quotationListConfig.title}`,
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

  const kpiCards = quotationListConfig.kpis.map((kpi) => ({
    key: kpi.key,
    label: kpi.label,
    value: kpi.valueOf(stats),
    icon: kpi.icon,
    color: kpi.color,
    newTabUrl: kpi.key === 'all' || kpi.key === 'totalvalue' ? '/quotations' : `/quotations?status=${encodeURIComponent(kpi.key)}`
  }));


  const activeKpiName = kpiCards.find((k) => k.key === activeKpi)?.label || 'All';

  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside a hub) ===== */}
      {!embedded && (
        <>
          <nav className="pr-breadcrumb" aria-label="Breadcrumb">
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
            <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
            <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
            <span className="bc-current">Quotations</span>
          </nav>
          <div className="pr-page-header">
            <div>
              <h1>
                <quotationListConfig.icon /> Quotations
              </h1>
              <p className="po-page-header-subtitle">Manage, approve and track all quotations.</p>
            </div>
            <div className="pr-page-header-actions">
              <NewCreationMenu
                moduleKey="quotation"
                createTo={quotationListConfig.newRoute}
                buttonLabel="New"
                buttonClassName="erp-btn-primary"
                dedupeService={quotationListConfig.service}
                openInNewTab
              />
            </div>
          </div>
        </>
      )}

      {/* ===== KPI CARDS ===== */}
      <SalesKpiCards cards={kpiCards} activeKpi={activeKpi} onSelect={selectKpi} />

      {/* ===== All Records primary tab (PR reference: pr-tab with count) ===== */}
      <div className="pr-tabs">
        <button type="button" role="tab" aria-selected="true" className="pr-tab active">
          All Quotations <span className="tab-count">{totalCount}</span>
        </button>
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
            placeholder="Search Quotation No, Client, Sales Person..."
            aria-label="Search quotation list"
            autoComplete="off"
          />
          {selectedIds.size === 0 && (
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
                  <button type="button" onClick={exportToCsv} className="w-full text-left px-3 py-2 hover:bg-[var(--purchase-hover)] flex items-center gap-2.5 transition-colors cursor-pointer">
                    <FileText className="w-4 h-4 shrink-0" style={{ color: '#0B4A3D' }} /> <span className="text-xs font-semibold text-slate-700">Export to CSV</span>
                  </button>
                  <button type="button" onClick={printList} className="w-full text-left px-3 py-2 hover:bg-[var(--purchase-hover)] flex items-center gap-2.5 transition-colors cursor-pointer">
                    <Printer className="w-4 h-4 text-slate-400 shrink-0" /> <span className="text-xs font-semibold text-slate-700">Print</span>
                  </button>
                </div>
              )}
            </div>
          )}
          <ManageColumnsButton manager={grid.manager} />
          <span className="toolbar-count">
            Showing {totalCount === 0 ? '0-0' : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, totalCount)}`} of {totalCount}
          </span>
        </div>
      </div>

      {/* ===== FILTER PANEL ===== */}
      <div className={`po-filters${showFilters ? ' show' : ''}`}>
        <div className="po-filter-grid">
          {quotationListConfig.filters.map((field) => (
            <div key={field.key} className="po-filter-group">
              <label>{field.label}</label>
              {field.type === 'select' && field.masterKey ? (
                <EditableMasterDropdown
                  masterKey={field.masterKey}
                  value={filters[field.key] || ''}
                  placeholder={field.placeholder || 'All'}
                  onChange={(v) => setFilter(field.key, v)}
                />
              ) : field.type === 'select' ? (
                <select value={filters[field.key] || ''} onChange={(e) => setFilter(field.key, e.target.value)}>
                  <option value="">{field.placeholder || 'All'}</option>
                  {field.options.map((option) => (
                    // Options may be plain strings (existing behaviour) or
                    // { value, label } pairs when the picked label must map to a
                    // different backend value (Follow-up / PO status filters).
                    <option key={option.value ?? option} value={option.value ?? option}>
                      {option.label ?? option}
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
          <button type="button" className="po-btn po-btn-primary po-btn-sm" onClick={() => setShowFilters(false)}>
            <Search /> Apply
          </button>
          <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={resetFilters}>
            <RotateCcw /> Reset
          </button>
        </div>
      </div>

      {/* ===== ERROR STATE (§26) ===== */}
      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Failed to load quotations.'}</p>
          <button type="button" className="cpr-error-retry" onClick={hook.refresh}>Try Again</button>
        </div>
      )}

      {/* ===== BULK BAR ===== */}
      {/* Exactly ONE Export menu (CSV / Excel / PDF / Print / Edit PDF) + the
          existing bulk actions. The previous layout rendered two Export
          buttons here — the unconditional one and a second one in the active
          branch — which made Export appear twice when a quotation was
          selected. */}
      <div className={`po-bulk-bar${selectedIds.size > 0 ? ' visible' : ''}`}>
        <span>
          <strong className="po-bulk-count">{selectedIds.size}</strong> selected
        </span>
        <div className="po-bulk-actions">
          <div style={{ position: 'relative' }} ref={bulkExportRef}>
            <button
              type="button"
              className="po-bulk-btn"
              onClick={() => setBulkExportOpen((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={bulkExportOpen}
            >
              <Download /> Export <ChevronDown style={{ width: 10, height: 10 }} />
            </button>
            {bulkExportOpen && (
              <div
                className="po-export-menu"
                style={{ position: 'absolute', right: 0, top: '100%', zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 15px 40px rgba(0,0,0,0.12)', minWidth: 210, padding: 6, marginTop: 4 }}
              >
                <button type="button" onClick={exportSelectedCsv} style={bulkMenuItemStyle}>
                  <FileText style={{ width: 14, height: 14, color: '#0B4A3D' }} /> Export to CSV
                </button>
                <button type="button" onClick={exportSelectedExcel} style={bulkMenuItemStyle}>
                  <FileSpreadsheet style={{ width: 14, height: 14, color: '#059669' }} /> Export to Excel
                </button>
                <button type="button" onClick={exportSelectedPdf} style={bulkMenuItemStyle}>
                  <FileDown style={{ width: 14, height: 14, color: '#dc2626' }} /> Export to PDF
                </button>
                <button type="button" onClick={printSelected} style={bulkMenuItemStyle}>
                  <Printer style={{ width: 14, height: 14, color: '#6B7280' }} /> Print
                </button>
                <div style={{ height: 1, background: '#e5e7eb', margin: '4px 8px' }} />
                <button type="button" onClick={openPdfEditor} style={bulkMenuItemStyle}>
                  <PenLine style={{ width: 14, height: 14, color: '#0B4A3D' }} /> Edit PDF
                </button>
              </div>
            )}
          </div>
          {subtab === 2 ? (
            <>
              <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                <RotateCcw /> Restore
              </button>
              {canDeleteSales && (
                <button type="button" className="po-bulk-btn po-bulk-btn-danger" onClick={() => setConfirm({ type: 'permanentDelete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                  <Trash2 /> Delete Permanently
                </button>
              )}
            </>
          ) : (
            <>
              {canDeleteSales && (
                <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                  <Trash2 /> Delete
                </button>
              )}
              <button
                type="button"
                className="po-bulk-btn"
                onClick={() => {
                  setStatusValue('');
                  setStatusTarget({ ids: [...selectedIds], label: `${selectedIds.size} record(s)` });
                }}
              >
                <Tag /> Change Status
              </button>
              <button type="button" className="po-bulk-btn" onClick={() => setConfirm({ type: 'archive', ids: [...selectedIds], label: `${selectedIds.size} record(s)` })}>
                <Archive /> Archive
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== TABLE ===== */}
      <div className="po-table-card">
        <div className="po-table-wrap">
          {/* `sgrid` = the shared sticky data grid (styles/sticky-data-grid.css):
              checkbox + quotation number pinned left, Actions pinned right. */}
          <table
            className="po-table sgrid sgrid-po sgrid-sales"
            style={{
              tableLayout: 'fixed',
              minWidth: grid.widthsCustomized
                ? Math.max(1180, visibleColumns.reduce((sum, col) => sum + (Number(grid.resize.widthOf(col)) || 0), 0))
                : 1180
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
                          ? 'Adjust your filters or search to find quotations.'
                          : 'Create a new quotation to get started.'}
                      </p>
                      {!searchInput && Object.keys(filters).length === 0 && (
                        <button type="button" className="po-btn po-btn-primary" onClick={() => openInNewTab(quotationListConfig.newRoute)}>
                          <Plus /> {quotationListConfig.newLabel}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  // Red status dot (no row highlight) for quotations awaiting
                  // approval ('pending approval' / 'pending_approval'). Draft,
                  // approved, rejected, sent, accepted, converted, cancelled and
                  // historical revisions never match — same semantics as the
                  // sidebar Pending Approval count.
                  const pending = isRowPendingApproval(row.status);
                  const statusBg = pending && isStickyCell({ key: DOC_NUMBER_FIELD[quotationListConfig.moduleKey] }) ? statusCellBgClass(row.status) : '';
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
                            aria-label={`Select ${docNumber(row, quotationListConfig.moduleKey) || row.id}`}
                          />
                        ) : col.key === 'actions' ? (
                          <CprActionMenu
                            items={buildRowActions(row).filter(
                              // SALES_DELETE-only actions are not offered at all.
                              (item) =>
                                !(
                                  (item.key === 'delete' || item.key === 'permanentDelete') &&
                                  !canDeleteSales
                                )
                            )}
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

      {/* ===== PDF EDITOR (selected quotation) ===== */}
      {pdfEditDoc && <QuotationPdfEditor doc={pdfEditDoc} onClose={() => setPdfEditDoc(null)} />}

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

      {/* ===== CHANGE STATUS DIALOG ===== */}
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
              className="po-btn po-btn-ghost"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={applyStatusChange}
              disabled={!statusValue || statusSaving}
              className="po-btn po-btn-primary"
            >
              {statusSaving ? 'Saving...' : 'Change Status'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 13, color: '#6b7280' }}>
            Move <strong>{statusTarget?.label}</strong> to a new status:
          </div>
          <SelectInput value={statusValue} onChange={(e) => setStatusValue(e.target.value)} aria-label="New status">
            <option value="">Select status</option>
            {statusOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </SelectInput>
        </div>
      </Modal>
      <style>{`@keyframes po-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
