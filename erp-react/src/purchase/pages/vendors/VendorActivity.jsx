/**
 * purchase/pages/vendors/VendorActivity.jsx
 * ------------------------------------------------------------------
 * Audit log for a vendor — built on the shared Purchase design system
 * (ActivityLogKpi, PurchaseToolbar, PurchaseSearch, PurchaseFilters,
 * PurchaseTable, PurchasePagination, PurchaseExportDropdown,
 * PurchaseColumnsDropdown, PurchaseEmptyState, PurchaseStatusBadge),
 * mirroring the Purchase Requisition Activity Log master page.
 *
 * Audit logic is preserved: vendorService.getVendorActivity() load,
 * client-side search / action / user / date-range filters, sorting,
 * CSV / Excel / PDF / Print export and pagination.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowLeftRight, Building2, CheckCircle2, Copy,
  Eye, FileDown, Filter, History, Laptop, Monitor, RefreshCw, Smartphone,
  Tablet, UserX, X
} from 'lucide-react';
import { vendorService } from '../../services/vendor';
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
  { key: 'registered', label: 'Registered', icon: Building2, color: '#2563eb', bg: 'rgba(37,99,235,0.10)', tone: 'registered' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: '#16a34a', bg: 'rgba(22,163,74,0.10)', tone: 'approved' },
  { key: 'blocked', label: 'Blocked', icon: UserX, color: '#dc2626', bg: 'rgba(220,38,38,0.10)', tone: 'blocked' }
];

/** Known actors → display role (falls back to "User"). */
const ROLE_MAP = {
  'Sanjay Kumar': 'Manager',
  'Meera Joshi': 'Approver',
  'Kavita Rao': 'Buyer',
  'Current User': 'User',
  System: 'System'
};

/* =========================== HELPER FUNCTIONS =========================== */

/** Action label → tone key (Registered, Updated, Approved, Blocked,
 *  Activated, Archived, Restored, PDF Exported, other). */
function actionTone(action = '') {
  const a = action.toLowerCase();
  if (a.includes('registered')) return 'registered';
  if (a.includes('updated') || a.includes('details')) return 'updated';
  if (a.includes('approv')) return 'approved';
  if (a.includes('block')) return 'blocked';
  if (a.includes('activ')) return 'activated';
  if (a.includes('archiv')) return 'archived';
  if (a.includes('restor')) return 'restored';
  if (a.includes('pdf') || a.includes('export')) return 'pdf';
  return 'other';
}

/** Tone key → PurchaseStatusBadge (cpr) tone — same Purchase palette. */
/* Activity event tones follow the shared semantic system: green =
   approved/activated, red = blocked, blue = restored/informational,
   orange = updated, gray = registered/neutral. */
const TONE_TO_BADGE = {
  registered: 'gray',
  updated: 'orange',
  approved: 'green',
  blocked: 'red',
  activated: 'green',
  archived: 'gray',
  restored: 'blue',
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
  return ROLE_MAP[user] || 'User';
}

/* ============================== PAGE ============================== */

export default function VendorActivity() {
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

  /* Load audit data from the vendor service (unchanged API). */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const result = await vendorService.getVendorActivity(id);
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

  /* Stable reference so the useMemo hooks below don't re-run each render. */
  const entries = useMemo(() => data?.entries || [], [data]);

  const actionOptions = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.action).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [entries]);

  const userOptions = useMemo(() => {
    const set = new Set(entries.map((entry) => entry.user).filter(Boolean));
    return ['All', ...Array.from(set)];
  }, [entries]);

  /* Filtering (search + action / user / date-range filters). */
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
      exportCsv(COLUMNS, [row], `vendor-activity-event-${row.id || 'row'}`);
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
    const filename = `vendor-activity-${data?.name || 'vendor'}`;
    const title = `Activity Log — ${data?.name || ''}`;
    if (type === 'csv') exportCsv(COLUMNS, filtered, filename);
    else if (type === 'excel') await exportExcel(COLUMNS, filtered, filename);
    else if (type === 'pdf') {
      try {
        await exportPdf({
          title,
          filename,
          meta: [['Vendor', data?.name || ''], ['Generated', new Date().toLocaleString('en-GB')], ['Records', String(filtered.length)]],
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
          <p className="text-sm font-bold text-slate-700">Vendor not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/vendors')}
            className="erp-btn-primary mt-4"
          >
            <span className="erp-btn-icon"><ArrowLeft size={16} /></span> Go to Vendors
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
          { label: 'Vendor Management', to: '/purchase/vendors' },
          { label: 'Activity Log' }
        ]}
        icon={History}
        title={
          <>
            Activity Log
            {data?.name && (
              <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-md bg-[#EDF7F4] text-[#0B4A3D] text-xs font-bold border border-[#0B4A3D]/15 align-middle">
                {data.name}
              </span>
            )}
          </>
        }
        actions={
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate(`/purchase/vendors/${id}`)}>
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
              id="valSearch"
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
        panelId="valFilterPanel"
        onApply={applyFilters}
        onReset={resetAll}
        groups={[
          {
            key: 'action', id: 'val-action', label: 'Action', value: draftFilters.action || 'All',
            options: actionOptions.map((v) => ({ value: v, label: v === 'All' ? 'All Actions' : v })),
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, action: v }))
          },
          {
            key: 'user', id: 'val-user', label: 'User', value: draftFilters.user || 'All',
            options: userOptions.map((v) => ({ value: v, label: v === 'All' ? 'All Users' : v })),
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, user: v }))
          },
          {
            key: 'dateFrom', id: 'val-date-from', label: 'Date From', type: 'date', value: draftFilters.dateFrom || '',
            onChange: (v) => setDraftFilters((prev) => ({ ...prev, dateFrom: v }))
          },
          {
            key: 'dateTo', id: 'val-date-to', label: 'Date To', type: 'date', value: draftFilters.dateTo || '',
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
        tableId="valTable"
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
