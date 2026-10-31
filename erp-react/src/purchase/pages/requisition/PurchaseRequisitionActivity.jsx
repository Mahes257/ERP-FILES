/**
 * purchase/pages/requisition/PurchaseRequisitionActivity.jsx
 * ------------------------------------------------------------------
 * Audit log for a purchase requisition — refactored onto the Purchase
 * Requisition List design system (the MASTER UI). Uses ONLY the shared
 * Purchase components (ActivityLogKpi, PurchaseToolbar,
 * PurchaseSearch, PurchaseFilters, PurchaseTable, PurchasePagination,
 * PurchaseExportDropdown, PurchaseColumnsDropdown, PurchaseEmptyState,
 * PurchaseStatusBadge, PurchaseRowActions) and the shared cpr styles —
 * no activity-specific CSS and no duplicated components.
 *
 * All audit logic is preserved: requisitionService.getActivity() load,
 * client-side search / action / user / date-range filters, sorting,
 * CSV / Excel / PDF / Print export and pagination. Only the UI layer
 * was refactored.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowLeftRight, CheckCircle2, Copy, Eye,
  FileDown, FilePlus2, Filter, History, Laptop, Monitor, RefreshCw, Send,
  Smartphone, Tablet, X
} from 'lucide-react';
import { requisitionService } from '../../services/requisition';
import { avatarColor, formatDateTime, getInitials } from '../../utils/helpers';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import { Modal, useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import ActivityLogKpi from '../../components/ActivityLogKpi';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import {
  PurchasePageLayout,
  PurchaseColumnsDropdown,
  PurchaseEmptyState,
  PurchaseExportDropdown,
  PurchaseFilters,
  PurchasePagination,
  PurchaseSearch,
  PurchaseTable,
  PurchaseToolbar
} from '../../components/list';
import useDebounce from '../../hooks/useDebounce';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';
import '../../styles/requisition-activity-polish.css';

/* ============================== CONSTANTS ============================== */

const COLUMNS = [
  { key: 'date', label: 'Date', width: 150, sortable: true, visible: true },
  { key: 'user', label: 'User', width: 176, sortable: true, visible: true },
  { key: 'action', label: 'Action', width: 196, sortable: true, visible: true },
  { key: 'oldValue', label: 'Previous Value', width: 138, sortable: true, visible: true },
  { key: 'newValue', label: 'Current Value', width: 138, sortable: true, visible: true },
  { key: 'ip', label: 'IP Address', width: 124, sortable: false, visible: true },
  { key: 'device', label: 'Device', width: 176, sortable: false, visible: true },
  { key: 'remarks', label: 'Remarks', width: 210, sortable: false, visible: true }
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/** KPI count cards — shared ActivityLogKpi config (Total Events + Last
 *  Activity are computed by the component itself). */
const KPI_CARDS = [
  { key: 'created', label: 'Created', icon: FilePlus2, color: '#2563eb', bg: 'rgba(37,99,235,0.10)', tone: 'created' },
  { key: 'submitted', label: 'Submitted', icon: Send, color: '#d97706', bg: 'rgba(217,119,6,0.10)', tone: 'submitted' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', tone: 'approved' }
];

/** Known actors → display role (falls back to "Requester"). */
const ROLE_MAP = {
  'Sanjay Kumar': 'Manager',
  'Meera Joshi': 'Approver',
  'Kavita Rao': 'Buyer',
  'Current User': 'User',
  System: 'System'
};

/* =========================== HELPER FUNCTIONS =========================== */

/** Action label → tone key (Created, Draft, Submitted, Pending Approval,
 *  Approved, Rejected, Returned, PDF Exported, other). */
function actionTone(action = '') {
  const a = action.toLowerCase();
  if (a.includes('created')) return 'created';
  if (a.includes('draft')) return 'draft';
  if (a.includes('submit')) return 'submitted';
  if (a.includes('pending')) return 'pending';
  if (a.includes('approv')) return 'approved';
  if (a.includes('reject')) return 'rejected';
  if (a.includes('return')) return 'returned';
  if (a.includes('pdf') || a.includes('export')) return 'pdf';
  return 'other';
}

/** Tone key → PurchaseStatusBadge (cpr) tone — same Purchase palette. */
/* Activity event tones follow the shared semantic system: green =
   approved, orange = pending/returned (needs action), blue =
   submitted/informational, red = rejected, gray = neutral. */
const TONE_TO_BADGE = {
  created: 'gray',
  draft: 'gray',
  submitted: 'blue',
  pending: 'orange',
  approved: 'green',
  rejected: 'red',
  returned: 'orange',
  pdf: 'gray',
  other: 'gray'
};

/** Device string ("Chrome 126 · Windows 11") → icon. */
function deviceIconFor(device = '') {
  const d = device.toLowerCase();
  if (d.includes('android') || d.includes('iphone') || d.includes('mobile')) return Smartphone;
  if (d.includes('ipad') || d.includes('tablet')) return Tablet;
  if (
    d.includes('macbook') || d.includes('windows') || d.includes('laptop') ||
    d.includes('macos') || d.includes('mac ')
  ) {
    return Laptop;
  }
  return Monitor;
}

function roleFor(user = '') {
  return ROLE_MAP[user] || 'Requester';
}

/* ============================== PAGE ============================== */

export default function PurchaseRequisitionActivity() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [version, setVersion] = useState(0);

  const [columns, setColumns] = useState(() => COLUMNS.map((col) => ({ ...col })));
  const [searchInput, setSearchInput] = useState('');
  const [filters, setFilters] = useState({ action: 'All', user: 'All', dateFrom: '', dateTo: '' });
  const [draftFilters, setDraftFilters] = useState({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [preview, setPreview] = useState(null);

  /* Debounced search is the applied search (derived, no effect). */
  const search = useDebounce(searchInput, 400);

  /* Load audit data from the requisition service (unchanged API). */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const result = await requisitionService.getActivity(id);
        if (!cancelled) setData(result);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  const entries = useMemo(() => data?.entries || [], [data]);

  const actionOptions = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.action).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [entries]);

  const userOptions = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.user).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [entries]);

  /* Filtering (same logic as before + user and date-range filters). */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const from = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00`).getTime() : null;
    const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59`).getTime() : null;
    const list = entries.filter((entry) => {
      const matchesAction = filters.action === 'All' || entry.action === filters.action;
      const matchesUser = filters.user === 'All' || entry.user === filters.user;
      const t = new Date(entry.date || 0).getTime();
      const matchesRange = (!from || t >= from) && (!to || t <= to);
      const matchesQuery =
        !q ||
        [entry.user, entry.action, entry.oldValue, entry.newValue, entry.ip, entry.device, entry.remarks]
          .some((value) => String(value || '').toLowerCase().includes(q));
      return matchesAction && matchesUser && matchesRange && matchesQuery;
    });
    const sorted = [...list].sort((a, b) => {
      const av = sort.key === 'date' ? new Date(a.date || 0).getTime() : String(a[sort.key] || '').toLowerCase();
      const bv = sort.key === 'date' ? new Date(b.date || 0).getTime() : String(b[sort.key] || '').toLowerCase();
      return sort.dir === 'asc' ? (av > bv ? 1 : -1) : av < bv ? 1 : -1;
    });
    return sorted;
  }, [entries, search, filters, sort]);

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRecords = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageInfo = `Showing ${totalCount > 0 ? (safePage - 1) * pageSize + 1 : 0}-${Math.min(safePage * pageSize, totalCount)} of ${totalCount}`;

  const activeFilterCount =
    Object.keys(filters).filter((key) => {
      const value = filters[key];
      return key.startsWith('date') ? Boolean(value) : value !== 'All';
    }).length;

  const hasFilters = Boolean(search) || activeFilterCount > 0;

  const handleSort = (key) => {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  };

  const toggleFilters = () => {
    const next = !filterOpen;
    if (next) {
      setDraftFilters(
        Object.keys(filters).reduce((acc, key) => {
          const value = filters[key];
          if (value && value !== 'All') acc[key] = value;
          return acc;
        }, {})
      );
    }
    setFilterOpen(next);
  };

  const applyFilters = () => {
    setFilters({
      action: draftFilters.action || 'All',
      user: draftFilters.user || 'All',
      dateFrom: draftFilters.dateFrom || '',
      dateTo: draftFilters.dateTo || ''
    });
    setPage(1);
    setFilterOpen(false);
  };

  const resetAll = () => {
    setDraftFilters({});
    setFilters({ action: 'All', user: 'All', dateFrom: '', dateTo: '' });
    setSearchInput('');
    setPage(1);
  };

  const visibleColumns = useMemo(() => columns.filter((col) => col.visible !== false), [columns]);
  const toggleColumn = (key) =>
    setColumns((prev) => prev.map((col) => (col.key === key ? { ...col, visible: !col.visible } : col)));
  const showAllColumns = () => setColumns((prev) => prev.map((col) => ({ ...col, visible: true })));
  const hideAllColumns = () =>
    setColumns((prev) => prev.map((col) => (col.key === 'date' || col.key === 'user' || col.key === 'action' ? col : { ...col, visible: false })));

  const renderCell = useMemo(
    () => ({
      date: (row) => <span className="whitespace-nowrap text-xs text-slate-600">{formatDateTime(row.date)}</span>,
      user: (row) => (
        <span className="flex items-center gap-2.5 min-w-0">
          <span
            className={`flex items-center justify-center w-8 h-8 rounded-full text-[11px] font-bold shrink-0 ${avatarColor(row.user)}`}
            aria-hidden="true"
          >
            {getInitials(row.user)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold text-slate-800">{row.user}</span>
            <span className="block text-[11px] text-slate-400">{roleFor(row.user)}</span>
          </span>
        </span>
      ),
      action: (row) => (
        <PurchaseStatusBadge variant="cpr" tone={TONE_TO_BADGE[actionTone(row.action)]} status={row.action} />
      ),
      oldValue: (row) => <span className="text-xs text-slate-500">{row.oldValue || '—'}</span>,
      newValue: (row) => <span className="text-xs font-semibold text-slate-700">{row.newValue || '—'}</span>,
      ip: (row) => <code className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono text-slate-600">{row.ip}</code>,
      device: (row) => {
        const Icon = deviceIconFor(row.device);
        return (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 min-w-0">
            <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
            <span className="truncate">{row.device}</span>
          </span>
        );
      },
      remarks: (row) => <span className="text-xs text-slate-500">{row.remarks || '—'}</span>
    }),
    []
  );

  /* Row action menu (three-dot only — no inline icon buttons). */
  const buildRowActions = () => [
    { key: 'view', label: 'View Details', icon: Eye },
    { key: 'changes', label: 'View Changes', icon: ArrowLeftRight },
    { key: 'export', label: 'Export Event', icon: FileDown },
    { key: 'copy', label: 'Copy Details', icon: Copy }
  ];

  const handleRowAction = (key, row) => {
    if (key === 'view' || key === 'changes') {
      setPreview({ entry: row, focus: key });
    } else if (key === 'export') {
      exportCsv(COLUMNS, [row], `pr-activity-event-${row.id || 'row'}`);
      toast.success('Event exported');
    } else if (key === 'copy') {
      const text = [
        `[${formatDateTime(row.date)}] ${row.user || ''} — ${row.action || ''}`,
        row.oldValue ? `Previous: ${row.oldValue}` : '',
        row.newValue ? `Current: ${row.newValue}` : '',
        row.ip ? `IP: ${row.ip}` : '',
        row.device ? `Device: ${row.device}` : '',
        row.remarks ? `Remarks: ${row.remarks}` : ''
      ]
        .filter(Boolean)
        .join('\n');
      const done = () => toast.success('Event details copied');
      const fail = () => toast.error('Could not copy details');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(fail);
      else {
        /* Clipboard API unavailable — minimal fallback. */
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        try {
          document.execCommand('copy');
          done();
        } catch {
          fail();
        }
        ta.remove();
      }
    }
  };

  const handleExport = async (type) => {
    const filename = `pr-activity-${data?.prNo || 'requisition'}`;
    const title = `Activity Log — ${data?.prNo || ''}`;
    if (type === 'csv') exportCsv(COLUMNS, filtered, filename);
    else if (type === 'excel') await exportExcel(COLUMNS, filtered, filename);
    else if (type === 'pdf') {
      try {
        await exportPdf({
          title,
          filename,
          meta: [['Requisition', data?.prNo || ''], ['Generated', new Date().toLocaleString('en-GB')], ['Records', String(filtered.length)]],
          columns: COLUMNS,
          records: filtered
        });
      } catch (err) {
        toast.error(err?.message || 'Failed to export PDF');
        return;
      }
    } else if (type === 'print') printTable(title, COLUMNS, filtered);
    toast.success('Activity log exported');
  };

  if (notFound) {
    return (
      <PurchasePageLayout className="pral-page">
        <div className="pr-page-header">
          <h1>
            <History size={24} aria-hidden="true" /> Activity Log
          </h1>
        </div>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Requisition not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/requisition')}
            className="erp-btn-primary mt-4"
          >
            <span className="erp-btn-icon"><ArrowLeft size={16} /></span> Go to Requisitions
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout className="pral-page">
      {/* ===== BREADCRUMB + PAGE HEADER (shared PurchaseHeader, CPR variant) ===== */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Requisition', to: '/purchase/requisition' },
          { label: 'Activity Log' }
        ]}
        icon={History}
        title={
          <>
            Activity Log
            {data?.prNo && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md bg-[#EDF7F4] text-[#0B4A3D] text-xs font-bold border border-[#0B4A3D]/15 align-middle">
                {data.prNo}
              </span>
            )}
          </>
        }
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/purchase/requisition/${id}`)}>
            <ArrowLeft size={12} /> Back to View
          </button>
        }
      />

      {/* ===== KPI SUMMARY — shared ActivityLogKpi (identical on both Activity Log pages) ===== */}
      <ActivityLogKpi
        entries={entries}
        loading={loading && !data}
        toneOf={actionTone}
        cards={KPI_CARDS}
      />

      {/* ===== TOOLBAR — same order as Purchase Requisition List ===== */}
      <PurchaseToolbar
        count={pageInfo}
        left={
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
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                <X size={12} /> Clear
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setVersion((v) => v + 1)}>
              <RefreshCw size={12} /> Refresh
            </button>
          </>
        }
        right={
          <>
            <PurchaseSearch
              id="pralSearch"
              placeholder="Search user, action, IP..."
              value={searchInput}
              onChange={setSearchInput}
              label="Search activity log"
            />
            <PurchaseExportDropdown buttonLabel="Export Activity Log" onExport={handleExport} />
            <PurchaseColumnsDropdown
              columns={columns}
              onToggleColumn={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />
          </>
        }
      />

      {/* ===== FILTER PANEL — Action · User · Date range (draft → Apply) ===== */}
      <PurchaseFilters
        open={filterOpen}
        panelId="pralFilterPanel"
        onApply={applyFilters}
        onReset={resetAll}
        groups={[
          {
            key: 'action', id: 'pral-action', label: 'Action', value: draftFilters.action || 'All',
            options: actionOptions.map((v) => ({ value: v, label: v === 'All' ? 'All Actions' : v })),
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, action: v }))
          },
          {
            key: 'user', id: 'pral-user', label: 'User', value: draftFilters.user || 'All',
            options: userOptions.map((v) => ({ value: v, label: v === 'All' ? 'All Users' : v })),
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, user: v }))
          },
          {
            key: 'dateFrom', id: 'pral-date-from', label: 'Date From', type: 'date', value: draftFilters.dateFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v }))
          },
          {
            key: 'dateTo', id: 'pral-date-to', label: 'Date To', type: 'date', value: draftFilters.dateTo || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateTo: v }))
          }
        ]}
      />

      {/* ===== AUDIT TABLE — shared PurchaseTable ===== */}
      <PurchaseTable
        columns={visibleColumns}
        rows={pageRecords}
        loading={loading && entries.length === 0}
        selectable={false}
        sortKey={sort.key}
        sortDirection={sort.dir}
        onSort={handleSort}
        renderers={renderCell}
        tableId="pralTable"
        rowActions={buildRowActions}
        onRowAction={handleRowAction}
        actionMenuLabel="Event actions"
        emptyContent={
          <PurchaseEmptyState
            icon={History}
            title="No Audit Records"
            message="No audit records available."
            action={
              hasFilters ? (
                <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                  <X size={12} /> Clear Filters
                </button>
              ) : undefined
            }
          />
        }
        footer={!loading && (
          <PurchasePagination
            page={safePage}
            totalPages={totalPages}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            pageInfo={pageInfo}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        )}
      />

      {/* ===== EVENT DETAILS MODAL (View Details / View Changes) ===== */}
      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${preview.entry.action || 'Event'} — ${formatDateTime(preview.entry.date)}` : 'Event Details'}
        maxWidth="max-w-lg"
      >
        {preview && (
          <dl className="space-y-3">
            {preview.focus === 'changes' ? (
              <>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Previous Value</dt>
                  <dd className="mt-1 text-xs text-slate-600">{preview.entry.oldValue || '—'}</dd>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Value</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-800">{preview.entry.newValue || '—'}</dd>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">User</dt>
                    <dd className="mt-1 text-xs font-semibold text-slate-800">{preview.entry.user || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Role</dt>
                    <dd className="mt-1 text-xs text-slate-600">{roleFor(preview.entry.user)}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Previous Value</dt>
                  <dd className="mt-1 text-xs text-slate-600">{preview.entry.oldValue || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Value</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-800">{preview.entry.newValue || '—'}</dd>
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">IP Address</dt>
                <dd className="mt-1">
                  <code className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono text-slate-600">{preview.entry.ip || '—'}</code>
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Device</dt>
                <dd className="mt-1 text-xs text-slate-600">{preview.entry.device || '—'}</dd>
              </div>
            </div>
            {preview.entry.remarks && (
              <div>
                <dt className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Remarks</dt>
                <dd className="mt-1 text-xs text-slate-600">{preview.entry.remarks}</dd>
              </div>
            )}
          </dl>
        )}
      </Modal>
    </PurchasePageLayout>
  );
}
