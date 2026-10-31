import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ClipboardList, X, ChevronLeft, ChevronRight,
  Eye, Pencil, Filter, Download, RefreshCw, Plus, ScanSearch
} from 'lucide-react';
import marketingService from '../../services/marketingService';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import StatusBadge from '../../components/Common/StatusBadge';
import useStickyColumnLeft from '../../hooks/useStickyColumnLeft';
import { RecordOpenPopover, ActionMenu, RecordPreviewModal } from '../../components/Common';
import { openInNewTab } from '../../utils/navigationHelpers';
import '../../styles/purchase-design-system.css';
import '../../styles/cpr-list.css';

const OUTCOMES = [
  'Lead Generated', 'Existing Customer Opportunity', 'Existing Opportunity',
  'Existing Order', 'Follow-up Required', 'Need Further Discussion',
  'Not Interested', 'No Lead', 'Lost Opportunity', 'Lost', 'Other'
];

function formatDate(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return d; }
}

/**
 * Visit Summary — a PR-style list page for marketing visits. Uses the
 * same visual language as PurchaseRequisitionList: pr-breadcrumb,
 * pr-page-header, pr-toolbar, po-table-card, pr-kpi-grid, po-pagination.
 * Business logic (fetch, filter, paginate) remains self-contained.
 */
export default function VisitSummaryPage() {
  const navigate = useNavigate();
  // Action-level permissions (UI gate; the backend re-checks every call).
  const { can } = useMarketingAccess();
  const canCreate = can('visits', 'create');
  const canEdit = can('visits', 'edit');
  const canExport = can('visits', 'export');
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [kpiFilter, setKpiFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [recordPopover, setRecordPopover] = useState(null);
  // Read-only Preview (Actions ⋮ → Preview) — same UX as Quotations.
  const [previewVisitState, setPreviewVisit] = useState(null);
  // Set once the user closes the deep-linked preview so it does not reopen.
  const [deepLinkPreviewDismissed, setDeepLinkPreviewDismissed] = useState(false);
  const [searchParams] = useSearchParams();
  const deepLinkVisitId = searchParams.get('visitId');

  // Deep link: /marketing/visits?visitId=7 shows that visit's Preview — used by
  // Documents → Open Related Record so the exact record is opened. Derived from
  // the loaded rows rather than set from an effect, so nothing is set during
  // render and the URL stays the single source of truth.
  const previewVisit = useMemo(() => {
    if (previewVisitState) return previewVisitState;
    if (deepLinkPreviewDismissed || !deepLinkVisitId) return null;
    return visits.find((v) => String(v.id) === String(deepLinkVisitId)) || null;
  }, [previewVisitState, deepLinkPreviewDismissed, deepLinkVisitId, visits]);

  const closePreviewVisit = () => {
    setPreviewVisit(null);
    setDeepLinkPreviewDismissed(true);
  };

  const headerRowRef = useRef(null);
  const stickyLeft = useStickyColumnLeft({
    headerRowRef,
    stickyKey: 'rowNum',
    visibleKeys: ['rowNum', 'visitDate', 'customer', 'location', 'assignedTo', 'outcome', 'nextAction', 'followupDate', 'status', 'actions']
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await marketingService.listVisits({ page: 0, size: 500 });
        const data = Array.isArray(res) ? res : res?.content || res?.data?.content || res?.data?.rows || res?.data || [];
        if (!cancelled) setVisits(data);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to load visits');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const baseRows = useMemo(() => {
    let rows = visits;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        (r.customerName || r.companyName || r.businessName || '').toLowerCase().includes(q) ||
        (r.locationName || r.location || '').toLowerCase().includes(q) ||
        (r.assignedTo || r.marketer || r.owner || '').toLowerCase().includes(q) ||
        (r.outcome || '').toLowerCase().includes(q) ||
        (r.nextAction || '').toLowerCase().includes(q)
      );
    }
    if (outcomeFilter) {
      rows = rows.filter(r => r.outcome === outcomeFilter);
    }
    if (statusFilter) {
      rows = rows.filter(r => r.visitStatus === statusFilter || r.status === statusFilter);
    }
    return rows;
  }, [visits, search, outcomeFilter, statusFilter]);

  // KPI counts derive from the base rows (search/status/outcome filters applied,
  // but not the KPI filter itself) so the number on each card is exactly the
  // size of the dataset its filter will show. Clicking a card shows that dataset.
  const kpiCounts = useMemo(() => ({
    total: baseRows.length,
    withOutcome: baseRows.filter(r => r.outcome).length,
    withFollowup: baseRows.filter(r => r.followupDate || r.nextFollowupDate).length,
    completed: baseRows.filter(r => (r.visitStatus || r.status) === 'Completed').length
  }), [baseRows]);

  const filtered = useMemo(() => {
    if (kpiFilter === 'withOutcome') return baseRows.filter(r => r.outcome);
    if (kpiFilter === 'withFollowup') return baseRows.filter(r => r.followupDate || r.nextFollowupDate);
    if (kpiFilter === 'completed') return baseRows.filter(r => (r.visitStatus || r.status) === 'Completed');
    return baseRows;
  }, [baseRows, kpiFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const start = filtered.length === 0 ? 0 : Math.min((page - 1) * pageSize + 1, filtered.length);
  const end = Math.min(page * pageSize, filtered.length);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageInfo = `Showing ${start}–${end} of ${filtered.length}`;

  const hasFilters = Boolean(search) || Boolean(outcomeFilter) || Boolean(statusFilter) || Boolean(kpiFilter);

  const resetAll = () => {
    setOutcomeFilter('');
    setStatusFilter('');
    setSearch('');
    setKpiFilter('');
    setPage(1);
  };

  const refreshPage = () => {
    setLoading(true);
    setError(null);
    marketingService.listVisits({ page: 0, size: 500 })
      .then(res => {
        const data = Array.isArray(res) ? res : res?.content || res?.data?.content || res?.data?.rows || res?.data || [];
        setVisits(data);
      })
      .catch(err => setError(err?.message || 'Failed to load visits'))
      .finally(() => setLoading(false));
  };

  const handleExport = () => {
    const header = ['#', 'Visit Date', 'Customer', 'Location', 'Assigned To', 'Outcome', 'Next Action', 'Follow-up Date', 'Status'];
    const body = filtered.map((r, i) => [i+1, formatDate(r.scheduleDate||r.visitDate||r.date), r.customerName||r.companyName||r.businessName||'', r.locationName||r.location||'', r.assignedTo||r.marketer||r.owner||'', r.outcome||'', r.nextAction||'', formatDate(r.followupDate||r.nextFollowupDate), r.visitStatus||r.status||'']);
    const csv = [header,...body].map(line => line.map(v => { const s = v==null?'':String(v); return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s; }).join(',')).join('\r\n');
    const blob = new Blob([('\uFEFF'+csv)], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `Visit_Summary_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); window.URL.revokeObjectURL(url);
  };

  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB (PR reference) ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <span className="flex items-center gap-2">
          <button className="bc-link" onClick={() => navigate('/dashboard')}>Dashboard</button>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <button className="bc-link" onClick={() => navigate('/marketing')}>Marketing</button>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <button className="bc-link" onClick={() => navigate('/marketing')}>Offline Marketing</button>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <span className="bc-current">Visit Summary</span>
        </span>
      </nav>

      {/* ===== PAGE HEADER (PR reference — icon + title + subtitle) ===== */}
      <div className="pr-page-header">
        <div className="pr-page-header-title">
          <h1>
            <ClipboardList size={20} />
            Visit Summary
          </h1>
          <p className="po-page-header-subtitle">
            Overview of all marketing visits, outcomes, and follow-up actions.
          </p>
        </div>
        {canCreate && (
          <div className="pr-page-header-actions">
            <button
              type="button"
              className="erp-btn-primary"
              onClick={() => openInNewTab('/marketing/visits/new/edit')}
              title="Create a new marketing visit"
            >
              <Plus size={15} /> New Visit
            </button>
          </div>
        )}
      </div>

      {/* ===== KPI CARDS (PR reference — pr-kpi-grid / pr-kpi-card qtn-kpi-card) =====
           Clicking a card applies the corresponding real filter to the table below.
           The count on each card equals the number of rows that filter will show. */}
      <div className="pr-kpi-grid">
        {[
          { key: '', label: 'Total Visits', count: kpiCounts.total, icon: ClipboardList, color: '#0B4A3D', bg: 'rgba(11,74,61,0.08)' },
          { key: 'withOutcome', label: 'With Outcome', count: kpiCounts.withOutcome, icon: Eye, color: '#059669', bg: 'rgba(5,150,105,0.08)' },
          { key: 'withFollowup', label: 'Follow-ups Scheduled', count: kpiCounts.withFollowup, icon: ClipboardList, color: '#d97706', bg: 'rgba(217,119,6,0.08)' },
          { key: 'completed', label: 'Completed', count: kpiCounts.completed, icon: ClipboardList, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' }
        ].map((card) => {
          const Icon = card.icon;
          const active = kpiFilter === card.key;
          return (
            <button
              key={card.key || 'all'}
              type="button"
              className={`pr-kpi-card qtn-kpi-card cursor-pointer${active ? ' active' : ''}`}
              data-filter={card.key || 'all'}
              onClick={() => { setKpiFilter(k => (k === card.key ? '' : card.key)); setPage(1); }}
              title={card.label}
            >
              <span className="qtn-kpi-icon" style={{ color: card.color, backgroundColor: card.bg }} aria-hidden="true">
                <Icon size={19} />
              </span>
              <div className="qtn-kpi-body">
                <div className="qtn-kpi-count" title={String(card.count)}>{card.count}</div>
                <div className="qtn-kpi-label" title={card.label}>{card.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ===== TOOLBAR (PR reference — §8: Show Filters + Clear + Refresh left | Search + Export + Count right) ===== */}
      <div className="pr-toolbar">
        <div className="pr-toolbar-left">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowFilters(v => !v)}
            aria-label="Toggle filters"
            aria-expanded={showFilters}
          >
            <Filter size={12} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {hasFilters && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
              <X size={12} /> Clear
            </button>
          )}
          <button type="button" className="btn btn-ghost btn-sm" onClick={refreshPage}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
        <div className="pr-toolbar-right">
          <div className="relative">
            <input
              className="pr-search-input"
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search customer, location, outcome..."
              aria-label="Search visits"
              autoComplete="off"
            />
          </div>
          {canExport && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleExport}>
              <Download size={14} /> Export ▾
            </button>
          )}
          <span className="toolbar-count">{pageInfo}</span>
        </div>
      </div>

      {/* ===== FILTER PANEL (PR reference — §10) ===== */}
      {showFilters && (
        <div className="pr-filter-panel show">
          <div className="pr-filter-grid">
            <div className="filter-group">
              <span className="filter-label">Outcome</span>
              <select value={outcomeFilter} onChange={(e) => { setOutcomeFilter(e.target.value); setPage(1); }}>
                <option value="">All Outcomes</option>
                {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="filter-group">
              <span className="filter-label">Status</span>
              <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
                <option value="">All Statuses</option>
                <option value="Planned">Planned</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
          </div>
          <div className="filter-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
              <X size={14} /> Reset
            </button>
          </div>
        </div>
      )}

      {/* ===== ERROR STATE (PR reference — §26) ===== */}
      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error}</p>
          <button type="button" className="cpr-error-retry" onClick={refreshPage}>Try Again</button>
        </div>
      )}

      {/* ===== TABLE (PR reference — po-table-card + po-table) ===== */}
      <div className="po-table-card">
        <div className="po-table-wrap">
          <table className="po-table sgrid sgrid-mkt" style={{ tableLayout: 'auto', minWidth: 1200 }}>
            <thead>
              <tr ref={headerRowRef} className="purchase-table-head">
                <th data-sticky-key="rowNum" className="sticky z-[3] bg-[var(--purchase-card)]" style={{ width: 110, minWidth: 110, left: stickyLeft }}>#</th>
                <th>Visit Date</th>
                <th>Customer</th>
                <th>Location</th>
                <th>Assigned To</th>
                <th>Outcome</th>
                <th>Next Action</th>
                <th>Follow-up Date</th>
                <th>Status</th>
                <th className="sgrid-pin-actions" style={{ width: 80, textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    <td colSpan={10} style={{ padding: '12px 14px' }}>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <div style={{ width: 40, height: 14, borderRadius: 4, background: '#E2E8F0', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ width: 90, height: 14, borderRadius: 4, background: '#E2E8F0', animation: 'pulse 1.5s ease-in-out infinite 0.1s' }} />
                        <div style={{ width: 120, height: 14, borderRadius: 4, background: '#E2E8F0', animation: 'pulse 1.5s ease-in-out infinite 0.2s' }} />
                        <div style={{ width: 100, height: 14, borderRadius: 4, background: '#E2E8F0', animation: 'pulse 1.5s ease-in-out infinite 0.3s' }} />
                        <div style={{ width: 80, height: 14, borderRadius: 4, background: '#E2E8F0', animation: 'pulse 1.5s ease-in-out infinite 0.4s' }} />
                      </div>
                    </td>
                  </tr>
                ))
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <ClipboardList size={32} className="text-slate-300" />
                      <p style={{ fontSize: 13, fontWeight: 600, color: '#0B1F1A' }}>
                        {hasFilters ? 'No visits found matching your filters' : 'No visits found'}
                      </p>
                      <p style={{ fontSize: 12, color: '#9CA3AF' }}>
                        {hasFilters ? 'Try adjusting your search or filters.' : 'No marketing visits have been recorded yet.'}
                      </p>
                      {hasFilters && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={resetAll}>
                          <X size={12} /> Clear Filters
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageRows.map((row, idx) => (
                  <tr key={row.id || idx} className="group transition-colors hover:bg-[#F0FAF7]">
                    <td
                      className="sticky z-[2] bg-[var(--purchase-card)] group-hover:bg-[#F0FAF7]"
                      style={{ fontSize: 12, color: '#9CA3AF', left: stickyLeft, minWidth: 110, whiteSpace: 'nowrap', wordBreak: 'normal', overflowWrap: 'normal' }}
                    >
                      <button
                        type="button"
                        className="font-mono font-bold text-[#0B4A3D] hover:underline cursor-pointer"
                        style={{ fontSize: 12, padding: '2px 4px', textAlign: 'left', whiteSpace: 'nowrap', wordBreak: 'normal', overflowWrap: 'normal' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!canEdit) { setPreviewVisit(row); return; }
                          const visitNo = row.visitNo || (row.id != null ? `VIS-${row.id}` : '');
                          setRecordPopover({
                            label: visitNo || '',
                            type: 'Visit',
                            route: `/marketing/visits/${row.id}/edit`,
                            onExisting: () => navigate(`/marketing/visits/${row.id}/edit`),
                            anchorRef: { current: e.currentTarget }
                          });
                        }}
                        title={row.visitNo ? `Visit ${row.visitNo}` : 'Open Visit'}
                      >
                        {row.visitNo || (row.id != null ? `VIS-${row.id}` : (page - 1) * pageSize + idx + 1)}
                      </button>
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: '#1e293b', fontSize: 13 }}>
                        {formatDate(row.scheduleDate || row.visitDate || row.date)}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <a
                          href={`/marketing/visits/${row.id}/edit`}
                          className="font-bold text-[#0B4A3D] hover:underline cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.customerName || row.companyName || row.businessName || '—'}
                        </a>
                      ) : (
                        <span className="font-bold text-slate-700">
                          {row.customerName || row.companyName || row.businessName || '—'}
                        </span>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: '#475569' }}>
                        {row.locationName || row.location || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: '#475569' }}>
                        {row.assignedTo || row.marketer || row.owner || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, color: row.outcome ? '#0B4A3D' : '#9CA3AF', fontWeight: row.outcome ? 600 : 400 }}>
                        {row.outcome || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: '#475569', display: 'inline-block', maxWidth: 180, overflowWrap: 'anywhere', wordBreak: 'normal' }} title={row.nextAction || ''}>
                        {row.nextAction || '—'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 13, color: '#475569' }}>
                        {formatDate(row.followupDate || row.nextFollowupDate)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={row.visitStatus || row.status} />
                    </td>
                    <td className="sgrid-pin-actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <ActionMenu
                        items={[
                          { key: 'preview', label: 'Preview', icon: ScanSearch },
                          ...(canEdit ? [
                            { key: 'edit', label: 'Edit Visit', icon: Pencil },
                            { key: 'openNewTab', label: 'Open in New Tab', icon: Eye }
                          ] : [])
                        ]}
                        onAction={(key) => {
                          if (key === 'preview') setPreviewVisit(row);
                          else if (key === 'edit') navigate(`/marketing/visits/${row.id}/edit`);
                          else if (key === 'openNewTab') openInNewTab(`/marketing/visits/${row.id}/edit`);
                        }}
                        triggerClassName="erp-row-action-btn"
                        buttonLabel="Row actions"
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ===== PAGINATION (PR reference — po-pagination) ===== */}
        <div className="po-pagination">
          <span className="po-page-info" style={{ fontSize: 12, color: '#6B7280' }}>
            Showing {start} to {end} of {filtered.length} entries
          </span>
          <div className="po-page-btns">
            <button
              className="po-page-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={14} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }).map((_, i) => {
              const pageNum = page <= 3 ? i + 1 : page + i - 2;
              if (pageNum < 1 || pageNum > totalPages) return null;
              return (
                <button
                  key={pageNum}
                  className={`po-page-btn${page === pageNum ? ' active' : ''}`}
                  onClick={() => setPage(pageNum)}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              className="po-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

      {/* ===== READ-ONLY PREVIEW (Actions ⋮ → Preview) ===== */}
      <RecordPreviewModal
        open={previewVisit !== null}
        onClose={closePreviewVisit}
        title={previewVisit?.visitNo || (previewVisit?.id != null ? `VST-${previewVisit.id}` : 'Marketing Visit')}
        subtitle={previewVisit?.customerName || previewVisit?.companyName || previewVisit?.businessName || ''}
        status={previewVisit?.visitStatus || previewVisit?.status}
        sections={[
          {
            heading: 'Visit',
            rows: [
              ['Visit Date', previewVisit?.scheduleDate || previewVisit?.visitDate || previewVisit?.date],
              ['Location', previewVisit?.locationName || previewVisit?.location],
              ['Assigned To', previewVisit?.assignedTo || previewVisit?.marketer || previewVisit?.owner],
              ['Outcome', previewVisit?.outcome],
              ['Next Action', previewVisit?.nextAction],
              ['Follow-up Date', previewVisit?.followupDate || previewVisit?.nextFollowupDate],
              ['Status', previewVisit?.visitStatus || previewVisit?.status]
            ]
          }
        ]}
        footer={
          previewVisit && (
            <>
              <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={closePreviewVisit}>
                Close
              </button>
              {canEdit && (
                <>
                  <button
                    type="button"
                    className="po-btn po-btn-primary po-btn-sm"
                    onClick={() => { navigate(`/marketing/visits/${previewVisit.id}/edit`); closePreviewVisit(); }}
                  >
                    Open in Existing Page
                  </button>
                  <button
                    type="button"
                    className="po-btn po-btn-primary po-btn-sm"
                    onClick={() => { openInNewTab(`/marketing/visits/${previewVisit.id}/edit`); closePreviewVisit(); }}
                  >
                    Open in New Tab
                  </button>
                </>
              )}
            </>
          )
        }
      />
    </div>
  );
}
