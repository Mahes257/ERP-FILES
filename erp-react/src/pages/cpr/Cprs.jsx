import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {    Archive,
    Calculator,
    Check,
    ClipboardList,
    Clock,
    Send,
    ShieldCheck,
  Copy,
  Download,
  Eye,
  ExternalLink,
  FileDown,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Printer,
  RotateCcw,
  ScanSearch,
  Search,
  Trash2,
  X
} from 'lucide-react';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import { ConfirmDialog, NewCreationMenu, RecordOpenPopover, useToast } from '../../components/Common';
import { ManageColumnsButton } from '../../components/GridColumns';
import useManagedGrid from '../../hooks/useManagedGrid';
import {
  CprActionMenu,
  CprApprovalBadge,
  CprFilterPanel,
  CprKpiCards,
  CprPagination,
  CprStatusBadge,
  CprTable
} from '../../components/CprTable';
import useClickOutside from '../../hooks/useClickOutside';
import useCprs from '../../hooks/useCprs';
import cprService from '../../services/cprService';
import technicalVerificationService from '../../services/technicalVerificationService';
import DocRevisionCell from '../../components/SalesTable/DocRevisionCell';
import { exportCprsBulkCsv, exportCprsExcel, exportCprsPdf, printCprs } from '../../utils/cprExportUtils';
import { buildExportFilename, downloadBlob, formatDate, formatINR } from '../../utils/leadHelpers';
import '../crm/crm-erp.css';

const STAGE_DISPLAY = {
  cw: 'CW',
  draft: 'Draft',
  'cost workout': 'CW',
  'pending approval': 'Approval',
  pending: 'Approval',
  approval: 'Approval',
  approved: 'Approved',
  converted: 'Converted'
};

const COLUMNS = [
  { key: 'checkbox', label: '', width: 48, always: true },
  { key: 'prNo', label: 'CPR No', width: 160, sortable: true, mandatory: true },
  { key: 'referencePrNo', label: 'Reference No', width: 150, sortable: true },
  { key: 'leadNo', label: 'Lead No', width: 120, sortable: true },
  { key: 'client', label: 'Client', width: 200, sortable: true },
  { key: 'description', label: 'Description', width: 260 },
  { key: 'project', label: 'Project', width: 170, sortable: true },
  { key: 'department', label: 'Department', width: 140, sortable: true },
  { key: 'createdBy', label: 'Created By', width: 140, sortable: true },
  { key: 'costWorkout', label: 'Cost Workout', width: 150 },
  { key: 'quotationDeadline', label: 'Quotation Deadline', width: 140, sortable: true },
  { key: 'extendedDeadline', label: 'Extended Deadline', width: 140, sortable: true },
  { key: 'profitPercent', label: 'Profit %', width: 100, align: 'right' },
  { key: 'approval', label: 'Approval Status', width: 140 },
  { key: 'stage', label: 'Current Stage', width: 140 },
  { key: 'status', label: 'Status', width: 150, mandatory: true },
  { key: 'grandTotal', label: 'Total Amount', width: 130, align: 'right', sortable: true },
  { key: 'quotation', label: 'Converted Quotation', width: 160 },
  // The date the customer's PR was received (the CPR's own PR Date), shown next
  // to the system creation stamp so the two dates can be compared at a glance.
  { key: 'receivedDate', label: 'Received Date', width: 130 },
  { key: 'createdAt', label: 'Created Date', width: 120, sortable: true },
  { key: 'actions', label: 'Actions', width: 110, align: 'center', mandatory: true }
];

function stageLabel(status) {
  return STAGE_DISPLAY[String(status || 'draft').toLowerCase()] || 'Draft';
}

/**
 * Approval Status column only — mirrors the CPR's persisted approval workflow
 * instead of the stored `approvalStatus` snapshot.
 *
 * `adminApprovalState` is derived by the backend from the CPR's persisted
 * float decision (APPROVED_PR / APPROVED_CW), its rejection state and the
 * verification gate. A CPR that was approved and floated to a Cost Workout
 * (whose Cost/Profit Workout is approved or converted) therefore reads
 * Approved even when the stored snapshot still says Pending; a CPR whose
 * workout exists but has only been completed/drafted stays Pending. Nothing is
 * approved here — the label only reflects persisted workflow state.
 */
function approvalLabel(row) {
  const admin = String(row?.adminApprovalState || '').toUpperCase();
  if (admin === 'APPROVED_PR' || admin === 'APPROVED_CW') return 'Approved';
  const stored = String(row?.approvalStatus || '');
  // A rejection always wins over any workout link (it must never be hidden).
  if (admin === 'REJECTED' || /^rejected$/i.test(stored)) return 'Rejected';
  // Legacy rows saved before the float destination was recorded: a linked
  // workout that actually completed approval proves the approval happened.
  if (String(row?.costWorkoutStatus || '').toLowerCase() === 'approved') return 'Approved';
  return stored || (admin === 'PENDING' ? 'Pending' : '');
}

function truncate(value, max = 150) {
  const text = String(value || '');
  return text.length > max ? `${text.slice(0, max)}...` : text || '-';
}

// ERP bulk-selection-toolbar.css .btn.btn-sm.btn-ghost class chain
const BULK_GHOST_BTN = 'btn btn-sm btn-ghost';

export default function Cprs({ moduleTab, onModuleTabChange, embedded }) {
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
    sortKey: sortField,
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
    refresh,
    convertCpr,
    submitCpr,
    approveCpr,
    archiveCpr,
    restoreCpr,
    deleteCpr,
    duplicateCpr,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    bulkPermanentDelete
  } = useCprs();

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  // Manageable + resizable columns (rename / reorder / hide-show / resize),
  // restored from MySQL on every open via the shared grid-config store.
  const grid = useManagedGrid({
    gridKey: 'sales.list.cpr',
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

  const buildRowActions = (row) => {
    if (subtab === 2) {
      return [
        { key: 'restore', label: 'Restore', icon: RotateCcw },
        { key: 'permanentDelete', label: 'Permanent Delete', icon: Trash2, danger: true }
      ];
    }
    const status = String(row.status || '').toLowerCase();
    // Historical revisions are read-only: no edit/duplicate/conversion/delete.
    const isHistorical = row.latestRevision === false;
    /* WORKFLOW — the status-driven actions of the CPR approval workflow, kept
       identical to the CPR detail page (CprView): a Draft (or Rejected) CPR is
       submitted for approval; a CPR that is Pending Approval can be approved.
       Every other persisted status shows neither, so a submitted/approved CPR
       can never be submitted again and a Draft CPR can never be approved. */
    const workflow = [];
    if (!isHistorical) {
      if (status === 'draft' || status === 'rejected') {
        workflow.push({ key: 'submitForApproval', label: 'Submit for Approval', icon: Send });
      } else if (status === 'pending approval') {
        workflow.push({ key: 'approve', label: 'Approve', icon: Check });
      }
    }
    const items = [
      { key: 'view', label: 'View CPR', icon: Eye },
      // Preview opens the SAME full-page CPR document preview the Documents
      // module uses (CprDocument + the existing Print / Download PDF exporters)
      // at /cprs/design?id=<id>, rendered on the full page instead of the
      // constrained in-record modal. Read-only, so historical revisions may
      // preview it too — but no edit/duplicate/conversion/delete on those.
      { key: 'preview', label: 'Preview', icon: ScanSearch },
      ...(!isHistorical ? [{ key: 'edit', label: 'Edit', icon: Pencil }, { key: 'duplicate', label: 'Duplicate', icon: Copy }] : [])
    ];
    if (workflow.length) items.push({ divider: true }, ...workflow);
    // CONVERSION — Convert to Cost Workout (or open the existing Cost Workout
    // when this CPR has already been converted, so no duplicate is created).
    // Quotation conversion/opening follows the ERP workflow: approved CPRs
    // without a quotation convert, converted CPRs open their quotation.
    const conversion = [];
    if (!isHistorical) {
      // CPR → CPR Technical Verification (real carry-forward of every CPR item
      // through the Technical Verification module; idempotent on repeat).
      conversion.push({ key: 'convertToTechnicalVerification', label: 'Convert to CPR Technical Verification', icon: ShieldCheck });
      if (row.costWorkoutId) {
        conversion.push({ key: 'openCostWorkout', label: 'Convert to Cost Workout', icon: Calculator });
      } else {
        conversion.push({ key: 'convertToCostWorkout', label: 'Convert to Cost Workout', icon: Calculator });
      }
      if (status === 'approved' && !row.convertedToQtn) {
        conversion.push({ key: 'convertToQuotation', label: 'Convert to Quotation', icon: FileText });
      } else if (row.convertedToQtn) {
        conversion.push({ key: 'openQuotation', label: 'Open Quotation', icon: FileText });
      }
      // CPR → Purchase Requisition: opens the EXISTING Purchase Requisition
      // creation form with this CPR's data pre-filled (read-only load). The
      // conversion itself never creates, saves, submits or approves a PR — the
      // user reviews/edits and persists through the form's own actions.
      conversion.push({ key: 'convertToPurchaseRequisition', label: 'Convert to Purchase Requisition', icon: ClipboardList });
    }
    if (conversion.length) items.push({ heading: true, label: 'CONVERSION' }, ...conversion);
    items.push({ divider: true });
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
        navigate(`/cprs/${row.id}`);
        break;
      case 'preview':
        // Full-page document preview for THIS row's real CPR id. `from=cprs`
        // makes the preview's Back / Close action return to the CPR list
        // instead of Documents, so the table state is preserved.
        navigate(`/cprs/design?id=${row.id}&from=cprs`);
        break;
      case 'edit':
        navigate(`/cprs/${row.id}/edit`);
        break;
      case 'duplicate':
        duplicateRow(row);
        break;
      case 'submitForApproval':
        runSubmitForApproval(row);
        break;
      case 'approve':
        runApprove(row);
        break;
      case 'convertToCostWorkout':
        navigate(`/cost-workouts/new?cpr=${row.id}`);
        break;
      case 'openCostWorkout':
        navigate(`/cost-workouts/${row.costWorkoutId}`);
        break;
      case 'convertToQuotation':
        convertToQuotationRow(row);
        break;
      case 'openQuotation':
        navigate(`/quotations/${row.quotationId || row.id}/view`);
        break;
      case 'convertToTechnicalVerification':
        convertToTechnicalVerificationRow(row);
        break;
      case 'convertToPurchaseRequisition':
        // Hand THIS row's real CPR id to the Purchase Requisition create form,
        // which loads the CPR (GET only) and pre-fills its own fields. No PR is
        // persisted here and the CPR's status/conversion state is untouched.
        navigate(`/purchase/requisition/new?fromCpr=${row.id}`);
        break;
      case 'activityLog':
        navigate(`/cprs/${row.id}?tab=activities`);
        break;
      case 'archive':
        runArchive(row);
        break;
      case 'restore':
        runRestore(row);
        break;
      case 'delete':
        setConfirm({ type: 'delete', ids: [row.id], label: row.prNo });
        break;
      case 'permanentDelete':
        setConfirm({ type: 'permanentDelete', ids: [row.id], label: row.prNo });
        break;
      default:
        break;
    }
  };

  const duplicateRow = async (row) => {
    const res = await duplicateCpr(row.id);
    if (res.ok) {
      const data = res.data?.data ?? {};
      toast.success(`CPR duplicated as ${data.prNo || row.prNo}`);
    } else {
      toast.error(res.error?.message || 'Failed to duplicate CPR');
    }
  };

  /* Submit for Approval — reuses the existing CPR submission workflow
     (POST /cprs/{id}/submit), which applies the backend's own validation and
     moves the CPR to Pending Approval. A failure leaves the persisted status
     untouched and reports the backend error. The list reloads on success, so
     the row's status and this menu reflect the saved state. */
  const runSubmitForApproval = async (row) => {
    const res = await submitCpr(row.id);
    if (res?.ok) toast.success(`${row.prNo} submitted for approval`);
    else toast.error(res?.error?.message || 'Failed to submit CPR for approval');
    return res;
  };

  /* Approve — reuses the existing approval workflow (POST /cprs/{id}/approve),
     so the backend's status rules and permissions decide the outcome. Remarks
     are optional for approval (they are required only for reject/send-back). */
  const runApprove = async (row) => {
    const res = await approveCpr(row.id);
    if (res?.ok) toast.success(`${row.prNo} approved`);
    else toast.error(res?.error?.message || 'Failed to approve CPR');
    return res;
  };

  // ERP toggleArchive (pr-module.js): single-row archive runs directly, no confirm.
  const runArchive = async (row) => {
    const res = await archiveCpr(row.id);
    if (res?.ok) toast.success('CPR status updated');
    else toast.error(res?.error?.message || 'Failed to update CPR status');
  };

  // ERP restoreCPR (pr-module.js): single-row restore runs directly, no confirm.
  const runRestore = async (row) => {
    const res = await restoreCpr(row.id);
    if (res?.ok) toast.success('CPR restored');
    else toast.error(res?.error?.message || 'Failed to restore CPR');
  };

  // ERP convertToQuotation (pr-module.js): convert an approved CPR into a quotation.
  const convertToQuotationRow = async (row) => {
    const res = await convertCpr(row.id);
    if (res?.ok) toast.success('CPR converted to quotation');
    else toast.error(res?.error?.message || 'Failed to convert CPR to quotation');
  };

  /**
   * Convert to CPR Technical Verification.
   *
   * The Technical Verification module owns this conversion: its item endpoint
   * carries every CPR item forward into a real verification row (TV no, drawing
   * no, description, file status, DRAFT status) and skips items that already
   * have one — so clicking the action twice never duplicates a verification and
   * existing verification data is never overwritten. The user is then taken to
   * the CPR's Technical Verification, showing every item.
   *
   * Whether the CPR is already converted comes from the list row itself
   * (technicalVerificationCount), which the CPR list has already loaded — no
   * extra request. It must not be probed with the single-verification lookup:
   * that endpoint legitimately answers 404 for a CPR that has not been
   * converted yet, so probing it wastes a request and escalates the expected
   * 404 to the global error screen, replacing the working CPR page and aborting
   * the conversion the user just triggered.
   */
  const convertToTechnicalVerificationRow = async (row) => {
    try {
      const alreadyConverted = Number(row.technicalVerificationCount || 0) > 0;

      const response = await technicalVerificationService.listByCpr(row.id);
      const items = response?.data ?? response ?? [];
      const count = Array.isArray(items) ? items.length : 0;

      if (alreadyConverted) {
        toast.info(`Technical Verification already exists for ${row.prNo}${count ? ` — opening ${count} item(s)` : ''}.`);
      } else {
        toast.success(
          count
            ? `${row.prNo} converted to CPR Technical Verification (${count} item${count === 1 ? '' : 's'}).`
            : `${row.prNo} converted to CPR Technical Verification.`
        );
      }
      refresh();
      navigate(`/cpr/technical-verification?cprId=${row.id}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to convert CPR to Technical Verification');
    }
  };

  const executeConfirm = async () => {
    if (!confirm) return;
    const { type, ids, label } = confirm;
    let res;
    if (type === 'archive') {
      res = ids.length === 1 ? await archiveCpr(ids[0]) : await bulkArchive(ids);
    } else if (type === 'restore') {
      res = ids.length === 1 ? await restoreCpr(ids[0]) : await bulkRestore(ids);
    } else if (type === 'delete') {
      res = ids.length === 1 ? await deleteCpr(ids[0]) : await bulkDelete(ids);
    } else if (type === 'permanentDelete') {
      res = await bulkPermanentDelete(ids);
    }
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

  const exportRows = async () => {
    try {
      const blob = await cprService.exportCprs(exportParams());
      downloadBlob(blob, `CPR_List_${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success('CPR list exported as CSV');
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    }
    setExportOpen(false);
  };

  // Mirrors the ERP's bulkExport (pr-module.js): exports ONLY the selected rows
  // as CSV with the exact 7-column layout, then clears the selection.
  const bulkExportSelected = () => {
    const ids = [...selectedIds];
    const selected = data.filter((pr) => ids.includes(pr.id) || ids.includes(pr.prNo));
    if (!selected.length) {
      toast.warning('Selected records not found');
      setSelectedIds(new Set());
      return;
    }
    const today = new Date().toISOString().substring(0, 10);
    exportCprsBulkCsv(selected, `CPR_Bulk_${today}`);
    setSelectedIds(new Set());
  };

  const exportExcel = async () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      await exportCprsExcel(data, buildExportFilename('CPR_List'));
      toast.success('CPR list exported as Excel');
    } catch (err) {
      toast.error(err?.message || 'Excel export failed');
    }
  };

  const exportPdf = async () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      await exportCprsPdf(data, buildExportFilename('CPR_List'));
      toast.success('CPR list exported as PDF');
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  const exportPrint = () => {
    setExportOpen(false);
    if (data.length === 0) {
      toast.error('No data available to print');
      return;
    }
    printCprs(data);
  };

  const renderCell = (key, row) => {
    switch (key) {
      case 'prNo':
        // Latest revision of a chain gets the revision-history dropdown
        // (each entry opens its exact read-only view). Plain rows stay the
        // usual clickable number.
        if (row && Number(row.revision) > 0) {
          return (
            <DocRevisionCell
              row={row}
              navigate={navigate}
              getDoc={(id) => cprService.getCpr(id)}
              viewRoute={(rev) => `/cprs/${rev.id}`}
              numberField="prNo"
            />
          );
        }
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRecordPopover({
                label: row.prNo,
                type: 'CPR',
                route: `/cprs/${row.id}`,
                onExisting: () => navigate(`/cprs/${row.id}`),
                anchorRef: { current: e.currentTarget.parentElement }
              });
            }}
            className="text-[#0B4A3D] hover:underline font-semibold cursor-pointer"
          >
            {row.prNo}
          </button>
        );
      case 'referencePrNo':
        return row.referencePrNo ? (
          <span className="font-medium text-slate-700">{row.referencePrNo}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      case 'leadNo':
        return <span className="font-medium">{row.leadNo || '—'}</span>;
      case 'client':
        return <span className="font-semibold text-slate-700">{row.client || '—'}</span>;
      case 'description':
        return <span title={row.description || ''}>{truncate(row.description)}</span>;
      case 'project':
        return row.project || '—';
      case 'department':
        return row.department || '—';
      case 'createdBy':
        return row.createdBy || '—';
      case 'costWorkout':
        // Linked Cost Workout: number + status, clickable to open the CW. '—'
        // when this CPR has no Cost Workout yet (no hardcoded values — the
        // link is driven by the real costWorkoutId/costWorkoutCwNo fields).
        return row.costWorkoutId ? (
          <button
            type="button"
            onClick={() => navigate(`/cost-workouts/${row.costWorkoutId}`)}
            className="inline-flex items-center gap-1 text-[#0B4A3D] hover:underline font-semibold cursor-pointer"
          >
            <Calculator className="w-3 h-3 shrink-0" />
            {row.costWorkoutCwNo || `CW-${row.costWorkoutId}`}
            {row.costWorkoutStatus && (
              <span className="text-[10px] font-semibold text-slate-400">({row.costWorkoutStatus})</span>
            )}
          </button>
        ) : (
          <span className="text-slate-300">—</span>
        );
      case 'quotationDeadline':
        return row.quotationDeadline ? (
          <span className="font-medium text-slate-700">{formatDate(row.quotationDeadline)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      case 'extendedDeadline':
        return row.extendedDeadline ? (
          <span className="font-medium text-[#0B4A3D]">{formatDate(row.extendedDeadline)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      case 'profitPercent':
        return row.profitPercent != null && row.profitPercent !== '' ? (
          <span className="text-right block">{Number(row.profitPercent).toFixed(2)}%</span>
        ) : (
          <span className="text-slate-300 text-[11px] block text-right">—</span>
        );
      case 'approval':
        return <CprApprovalBadge status={approvalLabel(row)} />;
      case 'stage':
        return <span className="font-medium">{stageLabel(row.status)}</span>;
      case 'status':
        return <CprStatusBadge status={row.status} />;
      case 'receivedDate':
        return row.prDate ? (
          <span className="text-slate-500">{formatDate(row.prDate)}</span>
        ) : (
          <span className="text-slate-300">—</span>
        );
      case 'createdAt':
        return <span className="text-slate-500">{formatDate(row.createdAt)}</span>;
      case 'grandTotal':
        return row.grandTotal != null && row.grandTotal !== '' ? (
          <span className="font-bold text-slate-800 text-right block">{formatINR(row.grandTotal)}</span>
        ) : (
          <span className="text-slate-300 text-[11px] block text-right">—</span>
        );
      case 'quotation':
        return row.convertedToQtn ? (
          <button
            type="button"
            onClick={() => navigate(`/quotations/${row.quotationId || row.id}/view`)}
            className="inline-flex items-center gap-1 text-[#0B4A3D] hover:underline font-medium cursor-pointer"
          >
            <ExternalLink className="w-3 h-3" /> {row.convertedToQtn}
          </button>
        ) : (
          <span className="text-slate-300 text-[11px]">—</span>
        );
      default:
        return '—';
    }
  };

  const confirmConfigs = {
    archive: {
      title: confirm?.count != null ? 'Archive Selected CPRs' : 'Archive CPR',
      message: confirm?.count != null ? `Archive ${confirm.count} selected CPR(s)?` : `Archive ${confirm?.label}?`,
      confirmLabel: 'Archive', variant: 'default', icon: Archive
    },
    restore: {
      title: confirm?.count != null ? 'Restore Selected CPRs' : 'Restore CPR',
      message: confirm?.count != null ? `Restore ${confirm.count} selected CPR(s)?` : `Restore ${confirm?.label} to active CPRs?`,
      confirmLabel: 'Restore', variant: 'default', icon: RotateCcw
    },
    delete: {
      title: confirm?.count != null ? 'Delete Selected CPRs' : 'Delete CPR',
      message: confirm?.count != null ? `Delete ${confirm.count} selected CPR(s)? They will be moved to trash.` : 'This CPR will be moved to trash.',
      confirmLabel: 'Delete', variant: 'danger', icon: Trash2
    },
    permanentDelete: {
      title: 'Permanently Delete',
      message: confirm?.count != null ? `Delete ${confirm.count} CPR(s) permanently? This cannot be undone.` : 'This action cannot be undone.',
      confirmLabel: 'Delete', variant: 'danger', icon: Trash2
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
              { label: 'CPR' }
            ]}
          />
          <div className="pr-page-header">
            <div>
              <h1>
                <ClipboardList size={20} /> Customer Purchase Requests (CPR)
              </h1>
            </div>
            <div className="pr-page-header-actions">
              <NewCreationMenu
                moduleKey="cpr"
                createTo="/cprs/new"
                buttonLabel="New"
                buttonClassName="po-btn po-btn-primary"
                dedupeService={{ list: (params) => cprService.listCprs(params) }}
                openInNewTab
              />
            </div>
          </div>
        </>
      )}

      {/* ===== KPI CARDS ===== */}
      <CprKpiCards stats={stats} activeKpi={activeKpi} onSelect={selectKpi} />

      {/* ===== PRIMARY TAB ===== */}
      <div className="pr-tabs">
        <button
          type="button"
          role="tab"
          aria-selected={true}
          onClick={() => switchSubtab(0)}
          className="pr-tab client-tab active"
        >
          All CPRs <span className="tab-count">{tabCounts.active}</span>
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
            <Filter size={14} />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          <input
            type="text"
            className="pr-search-input"
            value={searchInput}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search CPR No, Client, Lead No..."
            aria-label="Search CPRs"
            autoComplete="off"
          />
        </div>

        <div className="pr-toolbar-right">
          <div className="relative" ref={exportRef}>
            <button
              type="button"
              onClick={() => setExportOpen((prev) => !prev)}
              className="btn btn-ghost btn-sm"
            >
              <Download size={14} /> Export
            </button>
            {exportOpen && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-[var(--purchase-card)] border border-[var(--purchase-border)] rounded-xl shadow-lg py-1 z-50">
                {[
                  { label: 'Export PDF', icon: FileText, fn: exportPdf },
                  { label: 'Export Excel', icon: FileSpreadsheet, fn: exportExcel },
                  { label: 'Export CSV', icon: FileDown, fn: exportRows },
                  { label: 'Print', icon: Printer, fn: exportPrint }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setExportOpen(false);
                      item.fn();
                    }}
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
      <CprFilterPanel
        open={showFilters}
        filters={filters}
        onChange={setFilter}
        onReset={resetFilters}
      />

      {/* ===== BULK ACTION BAR (ERP bulk-selection-toolbar.css port) ===== */}
      {selectedIds.size > 0 && (
        <div className="bulk-action-bar visible">
          <span className="bulk-count">
            <strong>{selectedIds.size}</strong> selected
          </span>
          <div className="bulk-actions">
            {/* All 5 ERP bulk actions in ONE horizontal row (ERP bulk-selection-toolbar.css) */}
            <button
              type="button"
              onClick={() => setConfirm({ type: 'restore', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} CPR(s)` })}
              className={BULK_GHOST_BTN}
            >
              <RotateCcw className="w-3 h-3" /> Restore
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'delete', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} CPR(s)` })}
              className={BULK_GHOST_BTN}
            >
              <Trash2 className="w-3 h-3" /> Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'permanentDelete', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} CPR(s)` })}
              className={BULK_GHOST_BTN}
            >
              <Trash2 className="w-3 h-3" /> Permanently Delete
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ type: 'archive', ids: [...selectedIds], count: selectedIds.size, label: `${selectedIds.size} CPR(s)` })}
              className={BULK_GHOST_BTN}
            >
              <Archive className="w-3 h-3" /> Archive
            </button>
            <button
              type="button"
              onClick={bulkExportSelected}
              className={BULK_GHOST_BTN}
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
          sortKey={sortField}
          sortDir={sortDir}
          onSort={toggleSort}
          selectedIds={selectedIds}
          stickyKey="prNo"
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          renderCell={renderCell}
          actionMenu={(row) => (
            <CprActionMenu items={buildRowActions(row)} onAction={(key) => runRowAction(key, row)} />
          )}
          onClearSearch={clearSearch}
          onNewCpr={() => navigate('/cprs/new')}
          onGoActive={() => switchSubtab(0)}
          emptyTitle="CPR"
          foundTitle="No CPR Found"
          foundMessage="Create your first Customer Purchase Request to get started."
          emptyActionLabel="New CPR"
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
