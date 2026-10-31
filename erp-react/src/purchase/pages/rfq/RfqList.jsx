/**
 * purchase/pages/rfq/RfqList.jsx
 * ------------------------------------------------------------------
 * RFQ & Quotations → RFQ List.
 *
 * UX pattern  : the CRM Follow Up page (breadcrumb + page header,
 *               KPI cards, status tabs with live counts, searchable
 *               toolbar, status-dot row affordance, state-gated row
 *               action menu, filter/empty/export/column-picker
 *               behaviour).
 * Visual      : the Purchase Requisition list design language
 *               (cpr-page scaffold, pr-kpi-grid cards, pr-tabs,
 *               pr-toolbar, pr-filter-panel, pr-table, cpr-* cells,
 *               PurchaseStatusBadge) — NOT Vendor Management.
 * Data        : the existing rfqService layer only — getRfqs /
 *               getRfqStats drive the table, KPI cards, tab counts
 *               and sidebar; nothing is hardcoded.
 *
 * The RFQ workflow state model is untouched. Actions offered in the
 * row menu are gated to the statuses that support them (e.g. a Sent
 * RFQ with zero quotations cannot start evaluation; award requires an
 * approved supplier selection). The bulk action bar matches the
 * Purchase Requisition structure (flat Export | Archive | Delete
 * buttons, no More dropdown) — Archive is UI-only (no RFQ lifecycle
 * exists, so it shows a notice and never touches data) and no blind
 * workflow transitions are offered.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Archive, ArrowLeft, Award, Ban, CheckCircle2, ClipboardCheck, Clock3, Copy, Download, Eye,
  FileCheck, FileDown, FileText, Filter, History, Inbox, IndianRupee,
  ListChecks, Mail, Pencil, Plus, Printer, RefreshCw, Scale, Search, Send, Trash2,
  Trophy, X, XCircle
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/ui';
import RfqTabNav from '../../components/RfqTabNav';
import {
  PurchaseListPage,
  PurchaseSearch,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseColumnsDropdown,
  PurchaseStatusCell,
} from '../../components/list';
import {
  APPROVAL_STATUS, BUYERS, CURRENCIES, DEPARTMENTS, PRIORITIES, PROJECTS,
  RFQ_COLUMNS, RFQ_STATUS, RFQ_STATUSES, USERS, VENDORS
} from '../../constants';
import { formatDate } from '../../utils/helpers';
import usePurchaseAccess from '../../access/usePurchaseAccess';
import { formatAmount } from '../../utils/purchase';
import { isRfqPending } from '../../utils/pendingStatus';
import { pendingWorkClass } from '../../utils/pendingHighlight';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import useDebounce from '../../hooks/useDebounce';
import usePurchaseList from '../../hooks/usePurchaseList';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';

/* ============================== CONSTANTS ============================== */

/** Priority → chip class (same system as the Purchase Requisition list). */
const PRIORITY_CLASS = {
  Critical: 'cpr-priority-critical',
  High: 'cpr-priority-high',
  Medium: 'cpr-priority-medium',
  Low: 'cpr-priority-low'
};

/**
 * KPI cards rendered above the table — the same card component and
 * arrangement as the Purchase Requisition list, with RFQ text.
 * `color` drives the icon tint; `bg` is the soft icon-tile wash.
 * Counts come from getRfqStats; nothing is hardcoded.
 */
const KPI_CARDS = [
  { key: 'total', label: 'Total RFQs', icon: Mail, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'draft', label: 'Draft', icon: FileText, color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
  { key: 'pendingApproval', label: 'Pending Approval', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'sent', label: 'Sent to Vendors', icon: Send, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  { key: 'quotationReceived', label: 'Quotation Received', icon: Inbox, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
  /* Evaluation = orange (pending decision) — no purple for workflow. */
  { key: 'evaluation', label: 'Evaluation', icon: ListChecks, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  /* Awarded = green (successful outcome). */
  { key: 'awarded', label: 'Awarded', icon: Trophy, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'closed', label: 'Closed', icon: FileCheck, color: '#64748b', bg: 'rgba(100,116,139,0.10)' },
  /* Cancelled = red (terminated) and Overdue = red (past closing date) —
     both filter the table like the other KPI cards. */
  { key: 'cancelled', label: 'Cancelled', icon: XCircle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'overdue', label: 'Overdue', icon: AlertTriangle, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'totalValue', label: 'Total RFQ Value', icon: IndianRupee, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)', currency: true }
];

/** KPI key → RFQ status filter (same behaviour as the PR KPI cards).
 *  'overdue' maps to the derived Overdue bucket (rfqService handles it
 *  like the 'Open' / 'Active' buckets); 'totalValue' intentionally has no
 *  entry so clicking it resets to All RFQs. */
const STATUS_FILTER_MAP = {
  draft: RFQ_STATUS.DRAFT,
  pendingApproval: RFQ_STATUS.PENDING_APPROVAL,
  approved: RFQ_STATUS.APPROVED,
  sent: RFQ_STATUS.SENT,
  quotationReceived: RFQ_STATUS.QUOTATION_RECEIVED,
  evaluation: RFQ_STATUS.EVALUATION,
  awarded: RFQ_STATUS.AWARDED,
  closed: RFQ_STATUS.CLOSED,
  cancelled: RFQ_STATUS.CANCELLED,
  overdue: 'Overdue'
};

/**
 * Display labels for the canonical RFQ workflow states. The list
 * presents the pipeline wording ("Sent to Vendors") while the
 * canonical status value stays the source of truth for sorting,
 * filtering and the badge tone. The table status dot is NOT a
 * status-to-color map: it renders only for Pending Approval rows
 * (see the statusDotTone prop below).
 */
const RFQ_STATUS_LABELS = {
  [RFQ_STATUS.SENT]: 'Sent to Vendors'
};

/** Lifecycle tabs — the PR master structure (All RFQs primary tab, then
 *  a segmented Active / Archived / Deleted control). The RFQ data model
 *  has no archive/delete lifecycle, so Archived and Deleted are
 *  layout-only slots that always render their empty states with a 0
 *  count — matching the master PR layout without touching the RFQ
 *  service. The Active segment is the working list (KPI status filters
 *  still apply on top of it). */
const LIFECYCLE_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'archived', label: 'Archived' },
  { key: 'deleted', label: 'Deleted' }
];

/** RFQ categories used by the seed data (drives the Category filter). */
const RFQ_CATEGORIES = [
  'Steel & Metals', 'Electrical & Automation', 'Instruments & Calibration',
  'Forgings & Castings', 'Auto Components', 'IT & Office Equipment'
];

/** Select-type filter keys (default to 'All' when empty). */
const SELECT_FILTER_KEYS = [
  'department', 'project', 'requester', 'buyer', 'vendor', 'category',
  'priority', 'status', 'approvalStatus', 'currency'
];
const FILTER_KEYS = [
  'rfqNo', 'title', ...SELECT_FILTER_KEYS,
  'closingFrom', 'closingTo', 'dateFrom', 'dateTo', 'valueFrom', 'valueTo'
];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** Columns that can never be hidden through the Columns dropdown. */
const MANDATORY_COLUMNS = ['rfqNo', 'status', 'actions'];
/** localStorage key for column visibility (same mechanism as CRM Follow Up). */
const COLUMNS_STORAGE_KEY = 'vishak:rfq:columns';

/** Maps the active query + filters to the rfqService.getRfqs signature.
    The status is passed straight through: 'All' shows every RFQ, 'Active'
    is the derived lifecycle bucket, and any specific RFQ_STATUS filters
    exactly. The status tabs and the KPI cards both write filters.status
    directly, so the All tab genuinely shows all rows. */
function listParams(search, filters, page, pageSize, sortKey, sortDirection) {
  const status = filters.status && filters.status !== 'All' ? filters.status : 'All';
  return {
    search,
    status,
    department: filters.department || 'All',
    project: filters.project || 'All',
    requester: filters.requester || 'All',
    buyer: filters.buyer || 'All',
    vendor: filters.vendor || 'All',
    category: filters.category || 'All',
    priority: filters.priority || 'All',
    approvalStatus: filters.approvalStatus || 'All',
    currency: filters.currency || 'All',
    rfqNo: filters.rfqNo || '',
    title: filters.title || '',
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    closingFrom: filters.closingFrom || '',
    closingTo: filters.closingTo || '',
    valueFrom: filters.valueFrom || '',
    valueTo: filters.valueTo || '',
    page,
    pageSize,
    sortBy: sortKey,
    sortDir: sortDirection
  };
}

export default function RfqList() {
  const navigate = useNavigate();
  const { can } = usePurchaseAccess();
  const canCreate = can('rfq', 'create');
  const toast = useToast();

  /* Lifecycle view — mirrors the PR segmented control (Active is the
     default working list; Archived / Deleted are layout-only empty
     views). Declared at the top, before fetchPage / usePurchaseList,
     because those reference `tab` (a temporal-dead-zone error if the
     state is declared later in the body). */
  const [tab, setTab] = useState('active');

  const fetchPage = useMemo(
    () => async ({ search, filters, page, pageSize, sortKey, sortDirection }) => {
      /* Layout-only lifecycle: Archived / Deleted have no backing records
         (the RFQ service has no archive/delete state), so those views
         return no rows and render their empty states. */
      if (tab !== 'active') return { data: [], total: 0 };
      return rfqService.getRfqs(listParams(search, filters, page, pageSize, sortKey, sortDirection));
    },
    [tab]
  );

  const {
    records,
    loading,
    actionLoading,
    error,
    pagination: { page, pageSize, totalCount },
    search, sortKey, sortDirection, filters,
    setSearch, setFilter, resetFilters, goToPage, changePageSize, toggleSort, refresh,
    runMutation
  } = usePurchaseList(fetchPage, { pageSize: 10 });

  /* Column visibility — restored from localStorage (CRM Follow Up
     mechanism), with the mandatory columns always forced visible. */
  const [columns, setColumns] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLUMNS_STORAGE_KEY));
      if (Array.isArray(saved)) {
        const map = Object.fromEntries(saved.map((entry) => [entry.key, entry.visible]));
        return RFQ_COLUMNS.map((col) => ({
          ...col,
          visible: MANDATORY_COLUMNS.includes(col.key) ? true : (map[col.key] ?? col.visible)
        }));
      }
    } catch { /* ignore invalid stored columns */ }
    return RFQ_COLUMNS.map((col) => ({ ...col }));
  });
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [stats, setStats] = useState(null);
  const [statsVersion, setStatsVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({});
  const [density, setDensity] = useState('comfortable');
  const [activeKpi, setActiveKpi] = useState('total');
  /* RFQs whose supplier selection is completed AND approved — only those
     get the "Award Vendor" row action (awardRfq enforces it regardless). */
  const [awardableIds, setAwardableIds] = useState(() => new Set());

  const debouncedSearch = useDebounce(searchInput, 400);

  /* Debounced search → hook. */
  useEffect(() => {
    queueMicrotask(() => {
      setSearch(debouncedSearch);
      setSelectedIds([]);
    });
  }, [debouncedSearch, setSearch]);

  /* Stats (KPI cards + tab counts). */
  useEffect(() => {
    let cancelled = false;
    rfqService
      .getRfqStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion]);

  /* Supplier-selection state — drives the "Award Vendor" row action. */
  useEffect(() => {
    let cancelled = false;
    evaluationService
      .getSupplierSelections()
      .then((items) => {
        if (cancelled) return;
        setAwardableIds(
          new Set(
            (items || [])
              .filter(
                (item) =>
                  item.steps?.selection &&
                  item.steps?.approval === APPROVAL_STATUS.APPROVED &&
                  item.rfqId
              )
              .map((item) => item.rfqId)
          )
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsVersion]);

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);

  const persistColumns = (next) => {
    setColumns(next);
    try {
      localStorage.setItem(
        COLUMNS_STORAGE_KEY,
        JSON.stringify(next.map((col) => ({ key: col.key, visible: col.visible !== false })))
      );
    } catch { /* ignore storage failure */ }
  };

  const toggleColumn = (key) => {
    if (MANDATORY_COLUMNS.includes(key)) return;
    persistColumns(columns.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  };
  const showAllColumns = () =>
    persistColumns(columns.map((col) => (col.key === 'actions' ? col : { ...col, visible: true })));
  const hideAllColumns = () =>
    persistColumns(
      columns.map((col) => (MANDATORY_COLUMNS.includes(col.key) ? col : { ...col, visible: false }))
    );

  const refreshPage = () => {
    refresh();
    setStatsVersion((v) => v + 1);
  };

  const selectKpi = (key) => {
    if (key === activeKpi) {
      setActiveKpi('total');
      setFilter('status', 'All');
    } else {
      setActiveKpi(key);
      setFilter('status', STATUS_FILTER_MAP[key] || 'All');
    }
    /* KPI status filters describe the working list, so clicking a card
       always returns to the Active lifecycle view. */
    setTab('active');
    setSelectedIds([]);
  };

  /* Primary tab — the full RFQ list (clears any KPI status filter). */
  const goAllRfqs = () => {
    setActiveKpi('total');
    setFilter('status', 'All');
    setTab('active');
    setSelectedIds([]);
  };

  /* Lifecycle segment (Active / Archived / Deleted) — mirrors the PR
     segmented control. Active is the working list; Archived / Deleted
     switch to their layout-only empty views (the table is refetched so
     it returns no rows). */
  const selectLifecycle = (key) => {
    if (key !== 'active') {
      setActiveKpi('total');
      setFilter('status', 'All');
    }
    setTab(key);
    setSelectedIds([]);
    refresh();
  };

  const kpiCards = KPI_CARDS.map((card) => ({
    ...card,
    value: card.currency ? formatAmount(stats?.[card.key] ?? 0) : String(stats?.[card.key] ?? 0)
  }));

  const totalPages = Math.max(1, Math.ceil((totalCount || 0) / pageSize) || 1);
  const pageInfo = `Showing ${totalCount > 0 ? (page - 1) * pageSize + 1 : 0}-${Math.min(page * pageSize, totalCount)} of ${totalCount}`;

  const fetchAll = () => {
    if (tab !== 'active') return Promise.resolve([]);
    return rfqService
      .getRfqs(listParams(search, filters, 1, 10000, sortKey, sortDirection))
      .then((result) => result.data);
  };

  const runRfqAction = async (operation, successMessage, errorMessage) => {
    const result = await runMutation(operation);
    if (result.ok) {
      toast.success(successMessage);
      /* Workflow actions change status counts (Draft/Approved/Sent/...),
         so the KPI cards and the "Award Vendor" eligibility set must be
         refreshed alongside the table row — otherwise the cards go
         stale until the user clicks the manual Refresh button. */
      setStatsVersion((v) => v + 1);
    } else {
      toast.error(result.error?.message || errorMessage);
    }
  };

  const handleRowAction = async (key, row) => {
    if (key === 'view') navigate(`/purchase/rfq/${row.id}`);
    else if (key === 'edit') navigate(`/purchase/rfq/${row.id}/edit`);
    else if (key === 'print') navigate(`/purchase/rfq/${row.id}/print`);
    else if (key === 'timeline') navigate(`/purchase/rfq/${row.id}?tab=timeline`);
    else if (key === 'quotations') navigate(`/purchase/rfq/quotations?rfq=${row.rfqNo}`);
    else if (key === 'compare') navigate(`/purchase/rfq/compare?rfq=${row.id}`);
    else if (key === 'technical') navigate('/purchase/rfq/technical-evaluation');
    else if (key === 'view-po') navigate(`/purchase/orders/${row.poNo}`);
    else if (key === 'submit') {
      await runRfqAction(
        () => rfqService.submitForReview(row.id),
        `${row.rfqNo} submitted for approval`,
        'Failed to submit RFQ'
      );
    } else if (key === 'approve') {
      await runRfqAction(() => rfqService.approveRfq(row.id), `${row.rfqNo} approved`, 'Failed to approve RFQ');
    } else if (key === 'reject') {
      await runRfqAction(() => rfqService.rejectRfq(row.id), `${row.rfqNo} rejected`, 'Failed to reject RFQ');
    } else if (key === 'send') {
      await runRfqAction(() => rfqService.sendRfq(row.id), `${row.rfqNo} sent to vendors`, 'Failed to send RFQ');
    } else if (key === 'start-evaluation') {
      await runRfqAction(
        () => rfqService.startEvaluation(row.id),
        `${row.rfqNo} moved to evaluation`,
        'Failed to start evaluation'
      );
    } else if (key === 'award') {
      await runRfqAction(
        () => rfqService.awardRfq(row.id),
        `${row.rfqNo} awarded to the selected vendor`,
        'Failed to award RFQ'
      );
    } else if (key === 'raise-po') {
      const result = await runMutation(() => rfqService.raisePurchaseOrder(row.id));
      if (result.ok) {
        toast.success(`Purchase order ${result.data?.po?.poNo} raised from ${row.rfqNo}`);
        setStatsVersion((v) => v + 1);
        /* Open by numeric PO id — the view route resolves /orders/:id against
           the database id, not the PO number. */
        navigate(`/purchase/orders/${result.data?.po?.id ?? result.data?.po?.poNo}`);
      } else {
        toast.error(result.error?.message || 'Failed to raise purchase order');
      }
    } else if (key === 'close') {
      await runRfqAction(() => rfqService.closeRfq(row.id), `${row.rfqNo} closed`, 'Failed to close RFQ');
    } else if (key === 'cancel') {
      await runRfqAction(() => rfqService.cancelRfq(row.id), `${row.rfqNo} cancelled`, 'Failed to cancel RFQ');
    } else if (key === 'duplicate') {
      await runRfqAction(
        () => rfqService.duplicateRfq(row.id),
        `${row.rfqNo} duplicated as a draft`,
        'Failed to duplicate RFQ'
      );
    } else if (key === 'delete') {
      setDeleteTarget(row);
      setDeleteOpen(true);
    } else if (key === 'pdf') {
      try {
        const exportCols = columns.filter((col) => col.key !== 'actions');
        await exportPdf({
          title: `RFQ ${row.rfqNo}`,
          columns: exportCols,
          records: [row],
          filename: `rfq-${row.rfqNo}`
        });
        toast.success('PDF downloaded');
      } catch (err) {
        toast.error(err?.message || 'Failed to export PDF');
      }
    }
  };

  /**
   * Row actions are gated to the RFQ's current workflow state — invalid
   * transitions are never offered (the service enforces them regardless):
   *   Draft            → Edit, Submit for Approval
   *   Pending Approval → Edit, Approve, Reject
   *   Approved         → Send to Vendors
   *   Sent / Quotation Received → View Quotations + (≥1 quote)
   *                               Price Comparative Statement, Start Evaluation
   *   Evaluation       → Price Comparative Statement, Technical Evaluation,
   *                      Approval Flow (+ Award Vendor once approved)
   *   Awarded          → Create PO (or View PO once raised)
   */
  const buildRowActions = (row) => {
    const status = row.status;
    const actions = [{ key: 'view', label: 'View RFQ', icon: Eye }];

    if (status === RFQ_STATUS.DRAFT) {
      actions.push({ key: 'edit', label: 'Edit RFQ', icon: Pencil });
      actions.push({ key: 'submit', label: 'Submit for Approval', icon: Send });
    } else if (status === RFQ_STATUS.PENDING_APPROVAL) {
      actions.push({ key: 'edit', label: 'Edit RFQ', icon: Pencil });
      actions.push({ key: 'approve', label: 'Approve RFQ', icon: CheckCircle2 });
      actions.push({ key: 'reject', label: 'Reject RFQ', icon: XCircle, danger: true });
    } else if (status === RFQ_STATUS.APPROVED) {
      /* The post-sourcing Approved state (Approval Flow fully approved)
         already has live quotations — the RFQ cannot be re-sent, so the
         action is only offered on the INITIAL approval (no quotes yet). */
      if (!(row.quotationReceived > 0)) {
        actions.push({ key: 'send', label: 'Send to Vendors', icon: Send });
      }
    } else if (status === RFQ_STATUS.SENT || status === RFQ_STATUS.QUOTATION_RECEIVED) {
      actions.push({ key: 'quotations', label: 'View Quotations', icon: Inbox });
      /* Zero-quotation RFQs are still "Waiting for Quotations" — they
         cannot start evaluation and have nothing to compare yet. */
      if ((row.quotationReceived || 0) > 0) {
        actions.push({ key: 'compare', label: 'Price Comparative Statement', icon: Scale });
        actions.push({ key: 'start-evaluation', label: 'Start Evaluation', icon: ListChecks });
      }
    } else if (status === RFQ_STATUS.EVALUATION) {
      actions.push({ key: 'compare', label: 'Price Comparative Statement', icon: Scale });
      actions.push({ key: 'technical', label: 'Technical Evaluation', icon: ClipboardCheck });
      if (awardableIds.has(row.id)) {
        actions.push({ key: 'award', label: 'Award Vendor', icon: Award });
      }
    } else if (status === RFQ_STATUS.AWARDED) {
      if (row.poNo) actions.push({ key: 'view-po', label: 'View PO', icon: FileText });
      else actions.push({ key: 'raise-po', label: 'Create PO', icon: FileText });
      actions.push({ key: 'quotations', label: 'View Quotations', icon: Inbox });
      actions.push({ key: 'compare', label: 'Price Comparative Statement', icon: Scale });
    }

    actions.push({ key: 'duplicate', label: 'Duplicate', icon: Copy });
    actions.push({ key: 'pdf', label: 'Download PDF', icon: FileDown });
    actions.push({ key: 'print', label: 'Print', icon: Printer });
    actions.push({ key: 'timeline', label: 'Activity Timeline', icon: History });

    if (status !== RFQ_STATUS.CLOSED && status !== RFQ_STATUS.CANCELLED) {
      actions.push({ divider: true });
      actions.push({ key: 'close', label: 'Close RFQ', icon: XCircle });
      actions.push({ key: 'cancel', label: 'Cancel RFQ', icon: Ban });
    }
    /* Delete is only offered where deleteRfq will actually allow it —
       Draft / Pending Approval / Cancelled with no quotations on file.
       Sent/Approved/Awarded/etc. must go through Cancel instead. */
    if (
      (status === RFQ_STATUS.DRAFT || status === RFQ_STATUS.PENDING_APPROVAL || status === RFQ_STATUS.CANCELLED) &&
      !(row.quotationReceived > 0)
    ) {
      actions.push({ key: 'delete', label: 'Delete', icon: Trash2, danger: true });
    }
    return actions;
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.bulk) {
      const result = await runMutation(() => Promise.all(deleteTarget.bulk.map((id) => rfqService.deleteRfq(id))));
      if (result.ok) {
        toast.success(`${deleteTarget.bulk.length} RFQs deleted`);
        setSelectedIds([]);
      } else {
        toast.error(result.error?.message || 'Failed to delete RFQs');
      }
    } else {
      const result = await runMutation(() => rfqService.deleteRfq(deleteTarget.id));
      if (result.ok) toast.success(`${deleteTarget.rfqNo} deleted`);
      else toast.error(result.error?.message || 'Failed to delete RFQ');
    }
    setDeleteOpen(false);
    setDeleteTarget(null);
    setStatsVersion((v) => v + 1);
  };

  const applyFilters = () => {
    FILTER_KEYS.forEach((key) => {
      const value = draftFilters[key] || '';
      setFilter(key, SELECT_FILTER_KEYS.includes(key) ? value || 'All' : value);
    });
    setSelectedIds([]);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    resetFilters();
    setSearchInput('');
    setSelectedIds([]);
    setActiveKpi('total');
  };

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

  const activeFilterCount = FILTER_KEYS.filter((key) => filters[key] && filters[key] !== 'All').length;

  const handleExport = async (type) => {
    try {
      const rows = await fetchAll();
      if (type === 'pdf') await exportPdf({ title: 'RFQ & Quotations', columns, records: rows, filename: 'rfqs' });
      else if (type === 'excel') await exportExcel(columns, rows, 'rfqs');
      else if (type === 'csv') exportCsv(columns, rows, 'rfqs');
      else if (type === 'print') printTable('RFQ & Quotations', columns, rows);
      toast.success('RFQs exported');
    } catch (err) {
      toast.error(err?.message || 'Failed to export RFQs');
    }
  };

  /* Bulk actions — the PR master structure (flat buttons, no "More"
     dropdown). Export and Delete keep their existing RFQ behaviour
     (hard delete via the confirm dialog); Archive is UI-only for now —
     the RFQ module has no archive lifecycle (the Archived / Deleted
     tabs are layout-only), so it shows a notice and never touches the
     data. No blind workflow transitions (no bulk award / bulk PO). */
  const handleBulk = async (key, ids) => {
    if (key === 'archive') {
      /* UI-only — matches the PR bar layout but the RFQ service has no
         archive state, so this is a clear no-op notice. */
      toast.info('Archiving is not available for RFQs');
      return;
    }
    if (key === 'delete') {
      setDeleteTarget({ bulk: ids });
      setDeleteOpen(true);
      return;
    }
    if (key === 'export') {
      try {
        const rows = await fetchAll();
        const selected = rows.filter((row) => ids.includes(row.id));
        if (selected.length === 0) {
          toast.info('No RFQs selected to export');
          return;
        }
        exportCsv(columns, selected, 'rfqs-selected');
        toast.success(`${selected.length} RFQ(s) exported`);
      } catch (err) {
        toast.error(err?.message || 'Failed to export RFQs');
      }
    }
  };

  /* Flat button row — Export | Archive | Delete, same structure and
     styling as the Purchase Requisition bulk bar (no More dropdown). */
  const bulkActions = useMemo(
    () => [
      { key: 'export', label: 'Export', icon: Download },
      { key: 'archive', label: 'Archive', icon: Archive },
      { key: 'delete', label: 'Delete', icon: Trash2, danger: true }
    ],
    []
  );

  const renderCell = useMemo(
    () => ({
      /* RFQ Number cell holds only the document link — the status dot
         renders in the selection column next to the checkbox (shared
         statusDotTone prop), matching the Purchase Requisition table. */
      rfqNo: (row) => (
        <a
          href={`/purchase/rfq/${row.id}`}
          onClick={(e) => {
            e.preventDefault();
            navigate(`/purchase/rfq/${row.id}`);
          }}
        >
          {row.rfqNo}
        </a>
      ),
      title: (row) => (
        <span className="cpr-cell-truncate" title={row.title}>{row.title || '—'}</span>
      ),
      department: (row) => <span className="cpr-cell-truncate">{row.department || '—'}</span>,
      project: (row) => (
        <span className="cpr-cell-truncate" title={row.project}>{row.project || '—'}</span>
      ),
      requester: (row) => <span className="cpr-cell-truncate">{row.requester || '—'}</span>,
      vendor: (row) => {
        const names = (row.vendors || []).filter(Boolean);
        return names.length > 0 ? (
          <span className="cpr-cell-truncate" title={names.join(', ')}>{names.join(', ')}</span>
        ) : (
          <span className="cpr-cell-muted">—</span>
        );
      },
      vendorCount: (row) => <span className="cpr-count-chip">{row.vendorCount || 0}</span>,
      quotationReceived: (row) => (
        <span className="cpr-cell-muted tabular-nums">
          {row.quotationReceived ?? 0}
          <span className="opacity-50"> / {row.vendorCount || 0}</span>
        </span>
      ),
      vendorQuoteSummary: (row) => {
        const summary = row.vendorQuoteSummary || [];
        const invited = row.vendorCount || (row.vendors || []).length || 0;
        if (summary.length === 0 && invited === 0) {
          return <span className="cpr-cell-muted">—</span>;
        }
        return (
          <div className="flex flex-col gap-0.5" title={`${summary.length} of ${invited} vendors quoted`}>
            <span className="text-[10px] font-bold text-slate-500 tabular-nums">
              {summary.length} / {invited} quoted
            </span>
            {summary.slice(0, 3).map((entry) => (
              <span key={entry.vendor} className="text-[10px] text-slate-600 truncate">
                <span className="font-medium">{entry.vendor}</span>
                <span className="text-slate-400 mx-0.5">—</span>
                <span className="tabular-nums">{formatAmount(entry.amount, entry.currency)}</span>
              </span>
            ))}
            {summary.length > 3 && (
              <span className="text-[9px] text-slate-400">+{summary.length - 3} more</span>
            )}
          </div>
        );
      },
      estimatedValue: (row) => <span className="cpr-amount">{formatAmount(row.estimatedValue, row.currency)}</span>,
      priority: (row) => (
        <span className={`cpr-priority ${PRIORITY_CLASS[row.priority] || PRIORITY_CLASS.Medium}`}>
          {row.priority || 'Medium'}
        </span>
      ),
      status: (row) => (
        <PurchaseStatusCell status={RFQ_STATUS_LABELS[row.status] || row.status} />
      ),
      poNo: (row) =>
        row.poNo ? (
          <a
            href={`/purchase/orders/${row.poNo}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(`/purchase/orders/${row.poNo}`);
            }}
          >
            {row.poNo}
          </a>
        ) : (
          <span className="cpr-cell-muted">—</span>
        ),
      createdAt: (row) => <span className="cpr-cell-muted">{formatDate(row.createdAt) || '—'}</span>,
      dueDate: (row) => <span className="cpr-cell-muted">{row.dueDate ? formatDate(row.dueDate) : '—'}</span>
    }),
    [navigate]
  );

  const hasFilters = Boolean(search) || activeFilterCount > 0;
  const allSelected = records.length > 0 && records.every((row) => selectedIds.includes(row.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  return (
    <PurchaseListPage
      header={{
        crumb: [
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'RFQ List' }
        ],
        icon: Mail,
        title: 'RFQ List',
        subtitle: 'Manage RFQs, vendor responses, quotations and sourcing progress.',
        actions: canCreate ? (
          <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/rfq/new')}>
            <span className="erp-btn-icon"><Plus size={16} /></span> Create RFQ
          </button>
        ) : null
      }}
      flowNav={<RfqTabNav />}
      error={error}
      errorMessage="Failed to load RFQs."
      onRetry={refreshPage}
      kpis={{ cards: kpiCards, activeKey: activeKpi, onSelect: selectKpi, gridClass: 'rfq-kpi-grid' }}
      tabs={{
        primary: { label: 'All RFQs', count: stats?.total ?? 0, onSelect: goAllRfqs },
        segments: {
          tabs: LIFECYCLE_TABS.map((item) => ({
            key: item.key,
            label: item.label,
            count: item.key === 'active' ? (stats?.total ?? 0) : 0
          })),
          activeKey: tab,
          onSelect: selectLifecycle,
          ariaLabel: 'RFQ lifecycle'
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        ),
        right: (
          <>
            <PurchaseSearch
              id="rfqSearchInput"
              placeholder="Search RFQ Number, Title, Vendor, Project..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search RFQs"
            />
            <PurchaseExportDropdown buttonLabel="Export RFQs" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
              lockedKeys={MANDATORY_COLUMNS}
            />
          </>
        )
      }}
      filters={{
        open: filterOpen,
        panelId: 'rfqFilterPanel',
        onApply: applyFilters,
        onReset: resetAll,
        groups: [
          {
            key: 'rfqNo', id: 'rfq-no', label: 'RFQ Number', type: 'text',
            value: draftFilters.rfqNo || '', placeholder: 'e.g. RFQ-2026-0008',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, rfqNo: v }))
          },
          {
            key: 'title', id: 'rfq-title', label: 'RFQ Title', type: 'text',
            value: draftFilters.title || '', placeholder: 'e.g. Hot rolled steel',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, title: v }))
          },
          {
            key: 'department', id: 'rfq-dept', label: 'Department', value: draftFilters.department || 'All',
            options: [{ value: 'All', label: 'All Departments' }, ...DEPARTMENTS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, department: v }))
          },
          {
            key: 'project', id: 'rfq-project', label: 'Project', value: draftFilters.project || 'All',
            options: [{ value: 'All', label: 'All Projects' }, ...PROJECTS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, project: v }))
          },
          {
            key: 'requester', id: 'rfq-requester', label: 'Requester', value: draftFilters.requester || 'All',
            options: [{ value: 'All', label: 'All Requesters' }, ...USERS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, requester: v }))
          },
          {
            key: 'buyer', id: 'rfq-buyer', label: 'Buyer', value: draftFilters.buyer || 'All',
            options: [{ value: 'All', label: 'All Buyers' }, ...BUYERS.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, buyer: v }))
          },
          {
            key: 'vendor', id: 'rfq-vendor', label: 'Vendor', value: draftFilters.vendor || 'All',
            options: [{ value: 'All', label: 'All Vendors' }, ...VENDORS.map((v) => ({ value: v.name, label: v.name }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, vendor: v }))
          },
          {
            key: 'category', id: 'rfq-category', label: 'Category', value: draftFilters.category || 'All',
            options: [{ value: 'All', label: 'All Categories' }, ...RFQ_CATEGORIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, category: v }))
          },
          {
            key: 'priority', id: 'rfq-priority', label: 'Priority', value: draftFilters.priority || 'All',
            options: [{ value: 'All', label: 'All Priorities' }, ...PRIORITIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, priority: v }))
          },
          {
            key: 'status', id: 'rfq-status', label: 'RFQ Status', value: draftFilters.status || 'All',
            options: [
              { value: 'All', label: 'All Status' },
              { value: 'Active', label: 'Active' },
              { value: 'Overdue', label: 'Overdue' },
              ...RFQ_STATUSES.map((v) => ({ value: v, label: RFQ_STATUS_LABELS[v] || v }))
            ],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, status: v }))
          },
          {
            key: 'approvalStatus', id: 'rfq-approval', label: 'Approval Status', value: draftFilters.approvalStatus || 'All',
            options: [
              { value: 'All', label: 'All Statuses' },
              { value: APPROVAL_STATUS.PENDING, label: 'Pending' },
              { value: APPROVAL_STATUS.APPROVED, label: 'Approved' },
              { value: APPROVAL_STATUS.REJECTED, label: 'Rejected' }
            ],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, approvalStatus: v }))
          },
          {
            key: 'dateFrom', id: 'rfq-created-from', label: 'Created Date From', type: 'date', value: draftFilters.dateFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v }))
          },
          {
            key: 'dateTo', id: 'rfq-created-to', label: 'Created Date To', type: 'date', value: draftFilters.dateTo || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateTo: v }))
          },
          {
            key: 'closingFrom', id: 'rfq-due-from', label: 'Due Date From', type: 'date', value: draftFilters.closingFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, closingFrom: v }))
          },
          {
            key: 'closingTo', id: 'rfq-due-to', label: 'Due Date To', type: 'date', value: draftFilters.closingTo || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, closingTo: v }))
          },
          {
            key: 'valueRange', id: 'rfq-value', label: 'RFQ Value', type: 'range',
            minValue: draftFilters.valueFrom || '',
            maxValue: draftFilters.valueTo || '',
            onChange: (from, to) => setDraftFilters((prev) => ({ ...prev, valueFrom: from, valueTo: to }))
          },
          {
            key: 'currency', id: 'rfq-currency', label: 'Currency', value: draftFilters.currency || 'All',
            options: [{ value: 'All', label: 'All Currencies' }, ...CURRENCIES.map((v) => ({ value: v, label: v }))],
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, currency: v }))
          }
        ]
      }}
      bulk={{
        selectedCount: selectedIds.length,
        actions: bulkActions,
        onAction: (key) => handleBulk(key, selectedIds),
        id: 'rfqBulkActionBar'
      }}
      table={{
        columns: visibleColumns,
        rows: records,
        loading,
        selectable: true,
        selectedIds,
        allSelected,
        someSelected,
        onSelectAll: (checked) => setSelectedIds(checked ? records.map((row) => row.id) : []),
        onToggleRow: (id) =>
          setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id])),
        sortKey,
        sortDirection,
        onSort: toggleSort,
        renderers: renderCell,
        density,

        /* Pending highlight — the shared light-orange identification
           wash on the checkbox + RFQ-number cells for RFQs in an
           actionable pending workflow state (the same set as the
           sidebar badge — Pending Approval / Sent / Quotation
           Received / Evaluation; Draft is never highlighted). */
        rowClass: (row) => pendingWorkClass(isRfqPending(row)),
        idColumn: 'rfqNo',
        tableId: 'rfqTable',
        alignCenter: ['vendorCount', 'quotationReceived', 'priority', 'status'],
        alignRight: ['estimatedValue'],
        rowActions: buildRowActions,
        onRowAction: handleRowAction,
        emptyContent: (
          tab === 'deleted' ? (
            <div className="cpr-empty">
              <Trash2 size={48} aria-hidden="true" />
              <h3>No Deleted RFQs</h3>
              <p>Your trash is empty. Deleted RFQs will appear here.</p>
              <button type="button" className="btn btn-primary" onClick={() => selectLifecycle('active')}>
                <ArrowLeft size={14} /> Back to Active RFQs
              </button>
            </div>
          ) : tab === 'archived' ? (
            <div className="cpr-empty">
              <Archive size={48} aria-hidden="true" />
              <h3>No Archived RFQs</h3>
              <p>Archived RFQs will appear here.</p>
            </div>
          ) : filters.status === RFQ_STATUS.CANCELLED ? (
            <PurchaseEmptyState
              icon={XCircle}
              title="No Cancelled RFQs"
              message="No RFQs have been cancelled. Cancelled RFQs will appear here."
              action={
                <button type="button" className="btn btn-primary" onClick={goAllRfqs}>
                  <FileCheck size={14} /> Back to Active RFQs
                </button>
              }
            />
          ) : filters.status === RFQ_STATUS.CLOSED ? (
            <PurchaseEmptyState
              icon={FileCheck}
              title="No Closed RFQs"
              message={hasFilters ? 'No closed RFQs match your filters.' : 'Closed RFQs will appear here.'}
            />
          ) : hasFilters ? (
            <PurchaseEmptyState
              icon={Search}
              title="No RFQs match your filters."
              message="Try adjusting your search or filters."
              action={
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Filters
                </button>
              }
            />
          ) : (
            <PurchaseEmptyState
              icon={Mail}
              title="No RFQs Found"
              message="Create an RFQ to begin the vendor quotation process."
              action={
                <button type="button" className="erp-btn-primary" onClick={() => navigate('/purchase/rfq/new')}>
                  <span className="erp-btn-icon"><Plus size={16} /></span> Create RFQ
                </button>
              }
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
      {/* ===== DELETE CONFIRM ===== */}
      <ConfirmDialog
        open={deleteOpen}
        title={deleteTarget?.bulk ? 'Delete selected RFQs?' : 'Delete RFQ?'}
        message={
          deleteTarget?.bulk
            ? `This will permanently remove ${deleteTarget.bulk.length} selected RFQ(s). This action cannot be undone.`
            : `This will permanently remove ${deleteTarget?.rfqNo || 'this RFQ'}. This action cannot be undone.`
        }
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={actionLoading}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
        }}
      />
    </PurchaseListPage>
  );
}
