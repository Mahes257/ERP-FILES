import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BadgeCheck, Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, ClipboardList, CheckCircle, XCircle, Clock, Pause,
  Play, Eye, Trash2, Edit2, MoreVertical, Plus
} from 'lucide-react';
import qualityInspectionService from '../../services/qualityInspectionService';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import '../crm/crm-erp.css';

// ============================== CONSTANTS ==============================

const INSPECTION_TYPES = ['Incoming', 'In-Process', 'Final'];
const DEPARTMENTS = ['Casting', 'Fabrication', 'Assembly'];

const EMPTY_VALUE = '—';

const STATUS_CONFIG = {
  'Pending':     { badge: 'tv-badge tv-badge-gray', label: 'Pending' },
  'In Progress': { badge: 'tv-badge tv-badge-blue', label: 'In Progress' },
  'Passed':      { badge: 'tv-badge tv-badge-green', label: 'Passed' },
  'Failed':      { badge: 'tv-badge tv-badge-red', label: 'Failed' },
  'Hold':        { badge: 'tv-badge tv-badge-orange', label: 'Hold' },
  'PENDING':     { badge: 'tv-badge tv-badge-gray', label: 'Pending' },
  'IN_PROGRESS': { badge: 'tv-badge tv-badge-blue', label: 'In Progress' },
  'PASSED':      { badge: 'tv-badge tv-badge-green', label: 'Passed' },
  'FAILED':      { badge: 'tv-badge tv-badge-red', label: 'Failed' },
  'HOLD':        { badge: 'tv-badge tv-badge-orange', label: 'Hold' },
};

const STATUS_TABS = [
  { key: 'All', label: 'All', statKey: 'totalInspections' },
  { key: 'Pending', label: 'Pending', statKey: 'pendingInspections' },
  { key: 'In Progress', label: 'In Progress', statKey: 'inProgressInspections' },
  { key: 'Passed', label: 'Passed', statKey: 'passedInspections' },
  { key: 'Failed', label: 'Failed', statKey: 'failedInspections' },
  { key: 'Hold', label: 'Hold', statKey: 'holdInspections' },
];

/* Same card grid the other Sales Execution modules use (SalesKpiCards). Values
   are the database counters from GET /quality-inspections/stats, so the cards
   are global totals — never the current page, search or status filter. */
const KPI_CARDS = [
  { key: 'All', label: 'Total Inspections', icon: ClipboardList, color: '#0B4A3D', statKey: 'totalInspections' },
  { key: 'Pending', label: 'Pending', icon: Clock, color: '#f59e0b', statKey: 'pendingInspections' },
  { key: 'In Progress', label: 'In Progress', icon: Play, color: '#2563EB', statKey: 'inProgressInspections' },
  { key: 'Passed', label: 'Passed', icon: CheckCircle, color: '#16A34A', statKey: 'passedInspections' },
  { key: 'Failed', label: 'Failed', icon: XCircle, color: '#dc2626', statKey: 'failedInspections' },
  { key: 'Hold', label: 'On Hold', icon: Pause, color: '#6B7280', statKey: 'holdInspections' },
];

const PAGE_SIZE = 20;

/** The backend stores Work Order numbers; fall back to the legacy column. */
const workOrderOf = (inspection) => inspection.workOrderNo || inspection.workOrder || inspection.productionOrderId || '';

const statusConfigOf = (status) => STATUS_CONFIG[status] || STATUS_CONFIG['Pending'];

// ============================== PAGE ==============================

/**
 * Sales Execution → QC.
 *
 * Lists the SAME `quality_inspections` rows Production → Quality owns (one API:
 * /quality-inspections) — this page never keeps its own copy or demo dataset.
 * Each row carries the Work Order No it belongs to and the CPO No resolved
 * through that Work Order's sales-order reference (both served by the backend).
 *
 * Create and Edit open the existing Production → Quality form routes instead of
 * a second form: one implementation, one save path, one set of records.
 */
export default function CpoQcPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [departmentFilter, setDepartmentFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);

  const [stats, setStats] = useState(null);

  const [selectedInspection, setSelectedInspection] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [openActionRow, setOpenActionRow] = useState(null);

  // Bumped to re-run the list/stats reads after a write or a manual refresh.
  const [reloadToken, setReloadToken] = useState(0);

  // Search is applied after a short pause so typing does not fire a request per
  // key — and only when it actually changed, so mounting never sets `loading`
  // without starting a fetch.
  useEffect(() => {
    const next = search.trim();
    if (next === appliedSearch) return undefined;
    const timer = setTimeout(() => {
      setLoading(true);
      setAppliedSearch(next);
      setPage(0);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, appliedSearch]);

  // The authoritative inspections — one page at a time, filters server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = { page, size: PAGE_SIZE };
      if (appliedSearch) params.search = appliedSearch;
      if (statusFilter !== 'All') params.status = statusFilter;
      if (departmentFilter !== 'All') params.department = departmentFilter;
      if (typeFilter !== 'All') params.inspectionType = typeFilter;
      try {
        const data = await qualityInspectionService.list(params);
        if (cancelled) return;
        const payload = data?.data || data || {};
        setRows(Array.isArray(payload.content) ? payload.content : []);
        setTotal(Number(payload.totalElements) || 0);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load QC inspections');
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page, appliedSearch, statusFilter, departmentFilter, typeFilter, reloadToken]);

  // KPI cards + status-tab counts come from the backend counters, not the page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await qualityInspectionService.getStats();
        if (!cancelled) setStats(data?.data || data || null);
      } catch {
        // Keep the last known counters — the list reports its own errors.
      }
    })();
    return () => { cancelled = true; };
  }, [reloadToken]);

  // Production writes broadcast this event; refresh so the module never shows
  // stale inspections. No polling loop.
  useEffect(() => {
    const handler = () => {
      setLoading(true);
      setReloadToken((n) => n + 1);
    };
    window.addEventListener('production-data-changed', handler);
    return () => window.removeEventListener('production-data-changed', handler);
  }, []);

  const refresh = () => {
    setLoading(true);
    setReloadToken((n) => n + 1);
  };

  const tabCount = (tab) => {
    if (!stats) return null;
    const value = stats[tab.statKey];
    return value == null ? null : Number(value);
  };

  const kpiCards = KPI_CARDS.map((card) => ({
    key: card.key,
    label: card.label,
    value: stats ? stats[card.statKey] ?? 0 : 0,
    icon: card.icon,
    color: card.color,
  }));

  /** KPI card click = the matching status tab (the cards themselves stay global). */
  const selectCard = (key) => {
    setLoading(true);
    setStatusFilter(key);
    setPage(0);
  };

  const openDetail = async (inspection) => {
    try {
      setDetailLoading(true);
      const data = await qualityInspectionService.get(inspection.id);
      setSelectedInspection(data?.data || data);
    } catch (err) {
      setError(err?.message || 'Failed to load inspection details');
    } finally {
      setDetailLoading(false);
    }
  };

  /** The existing Production → Quality create form — not a Sales copy. */
  const openCreate = () => navigate('/production/quality/new');

  /** The existing Production → Quality edit form for this record. */
  const openEdit = (inspection) => navigate(`/production/quality/${encodeURIComponent(inspection.id)}/edit`);

  const handleDelete = async (inspection) => {
    if (!window.confirm(`Delete inspection ${inspection.id}?`)) return;
    try {
      await qualityInspectionService.delete(inspection.id);
      if (selectedInspection?.id === inspection.id) setSelectedInspection(null);
      window.dispatchEvent(new Event('production-data-changed'));
      refresh();
    } catch (err) {
      setError(err?.message || 'Failed to delete the inspection');
    }
  };

  const handleStatusChange = async (id, newStatus, action, remarks) => {
    try {
      await qualityInspectionService.updateStatus(id, newStatus, action, remarks);
      window.dispatchEvent(new Event('production-data-changed'));
      refresh();
      if (selectedInspection?.id === id) {
        const data = await qualityInspectionService.get(id);
        setSelectedInspection(data?.data || data);
      }
    } catch (err) {
      setError(err?.message || 'Failed to update the inspection status');
    }
  };

  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const activeFilters =
    appliedSearch !== '' || statusFilter !== 'All' || departmentFilter !== 'All' || typeFilter !== 'All';

  const clearFilters = () => {
    setLoading(true);
    setSearch('');
    setStatusFilter('All');
    setDepartmentFilter('All');
    setTypeFilter('All');
    setPage(0);
  };

  const detailStatus = selectedInspection ? statusConfigOf(selectedInspection.status) : null;

  return (
    /* The same page shell as the CPO List (`.purchase-page cpr-page`): it owns
       the module's horizontal padding (28px, matching the hub's tab bar), the
       bottom scroll clearance and the width constraints, so cards, filters and
       the table line up with the reference page instead of running edge to edge.
       The table keeps its own internal horizontal scroll. */
    <div className="purchase-page cpr-page">
      {/* Page Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <BadgeCheck size={20} style={{ color: '#059669' }} /> QC — Inspections
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Every inspection recorded in Production → Quality, with its Work Order and Customer Purchase Order.
        </p>
      </div>

      {error && (
        <div className="cpr-error-banner">
          <AlertTriangle size={14} /><span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* KPI cards — global counters from the backend stats endpoint */}
      <SalesKpiCards cards={kpiCards} activeKpi={statusFilter} onSelect={selectCard} />

      {/* Status tabs — same counters as the matching KPI card */}
      <div className="tv-division-tabs">
        {STATUS_TABS.map((tab) => {
          const count = tabCount(tab);
          return (
            <button
              key={tab.key}
              className={`tv-division-tab ${statusFilter === tab.key ? 'tv-division-tab-active' : ''}`}
              onClick={() => { setLoading(true); setStatusFilter(tab.key); setPage(0); }}
            >
              {tab.label}
              {count != null && <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="po-toolbar">
        <div className="po-toolbar-left">
          <button
            className={`po-btn ${showFilters ? 'po-btn-primary-outline' : 'po-btn-ghost'}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter size={14} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {showFilters && (
            <>
              <select
                className="tv-filter-select"
                value={departmentFilter}
                onChange={(e) => { setLoading(true); setDepartmentFilter(e.target.value); setPage(0); }}
                aria-label="Filter by department"
              >
                <option value="All">All Departments</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select
                className="tv-filter-select"
                value={typeFilter}
                onChange={(e) => { setLoading(true); setTypeFilter(e.target.value); setPage(0); }}
                aria-label="Filter by inspection type"
              >
                <option value="All">All Types</option>
                {INSPECTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </>
          )}
          <div className="tv-search-input">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search inspection, Work Order, CPO, product, inspector..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search QC inspections"
            />
          </div>
          {activeFilters && (
            <button className="po-btn po-btn-ghost po-btn-sm" onClick={clearFilters}>Clear</button>
          )}
        </div>
        <div className="po-toolbar-right">
          <button className="po-btn po-btn-primary" onClick={openCreate}>
            <Plus size={14} /> Create Inspection
          </button>
          <button className="po-btn po-btn-ghost po-btn-sm" onClick={refresh} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Inspections table — the authoritative records, full width */}
      <div className="tv-table-wrap">
        <div className="tv-table-header">
          <span>QC Inspections</span>
          <span className="tv-table-count">{total}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="po-table tv-table">
            <thead>
              <tr>
                <th>Inspection ID</th>
                <th>Work Order No</th>
                <th>CPO No</th>
                <th>Product</th>
                <th>Customer</th>
                <th>Department</th>
                <th>Type</th>
                <th>Date</th>
                <th>Inspector</th>
                <th style={{ textAlign: 'right' }}>Inspected</th>
                <th style={{ textAlign: 'right' }}>Accepted</th>
                <th style={{ textAlign: 'right' }}>Rejected</th>
                <th>Status</th>
                <th style={{ textAlign: 'center', width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={14} className="tv-table-loading">Loading inspections...</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="tv-table-empty">
                    <ClipboardList size={32} style={{ color: '#CBD5E1' }} />
                    <span>{activeFilters ? 'No inspections match the current search and filters' : 'No QC inspections recorded yet'}</span>
                  </td>
                </tr>
              ) : (
                rows.map((inspection) => {
                  const statusCfg = statusConfigOf(inspection.status);
                  const workOrderNo = workOrderOf(inspection);
                  const cpoNo = inspection.cpoNo || '';
                  return (
                    <tr
                      key={inspection.id}
                      className={`tv-table-row ${selectedInspection?.id === inspection.id ? 'tv-table-row-selected' : ''}`}
                      onClick={() => openDetail(inspection)}
                    >
                      <td><span className="tv-cell-bold">{inspection.id}</span></td>
                      <td><span className="tv-cell-bold">{workOrderNo || EMPTY_VALUE}</span></td>
                      <td>{cpoNo || EMPTY_VALUE}</td>
                      <td>{inspection.product || EMPTY_VALUE}</td>
                      <td>{inspection.customer || EMPTY_VALUE}</td>
                      <td>{inspection.department || EMPTY_VALUE}</td>
                      <td>{inspection.inspectionType || EMPTY_VALUE}</td>
                      <td>{inspection.inspectionDate || EMPTY_VALUE}</td>
                      <td>{inspection.inspector || EMPTY_VALUE}</td>
                      <td style={{ textAlign: 'right' }}>{inspection.quantityInspected ?? 0}</td>
                      <td style={{ textAlign: 'right' }}>{inspection.acceptedQuantity ?? 0}</td>
                      <td style={{ textAlign: 'right' }}>{inspection.rejectedQuantity ?? 0}</td>
                      <td><span className={statusCfg.badge}>{statusCfg.label}</span></td>
                      <td>
                        <div className="tv-actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button className="tv-action-btn" onClick={() => openDetail(inspection)} title="View">
                            <Eye size={14} />
                          </button>
                          <button
                            className="tv-action-btn"
                            onClick={() => setOpenActionRow(openActionRow === inspection.id ? null : inspection.id)}
                            title="More"
                          >
                            <MoreVertical size={14} />
                          </button>
                          {openActionRow === inspection.id && (
                            <div className="tv-actions-menu">
                              <button onClick={() => { openEdit(inspection); setOpenActionRow(null); }}>
                                <Edit2 size={13} /> Edit
                              </button>
                              <button
                                onClick={() => { handleDelete(inspection); setOpenActionRow(null); }}
                                className="tv-actions-menu-danger"
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="tv-pagination" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            {total === 0 ? 'No records' : `Showing ${pageStart}–${pageEnd} of ${total}`}
          </span>
          <div className="tv-pagination-btns">
            <button disabled={page === 0} onClick={() => { setLoading(true); setPage((p) => Math.max(0, p - 1)); }}><ChevronLeft size={14} /></button>
            <span className="tv-pagination-page">{page + 1}</span>
            <button disabled={page >= lastPage} onClick={() => { setLoading(true); setPage((p) => p + 1); }}><ChevronRight size={14} /></button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {(selectedInspection || detailLoading) && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.35)', zIndex: 60,
            display: 'flex', justifyContent: 'flex-end',
          }}
          onClick={() => setSelectedInspection(null)}
        >
          <div
            style={{ width: 460, maxWidth: '100%', height: '100%', background: '#fff', overflowY: 'auto', padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && !selectedInspection ? (
              <div className="tv-detail-loading">Loading details...</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{selectedInspection.id}</h3>
                  <span className={detailStatus.badge}>{detailStatus.label}</span>
                </div>
                <div className="tv-detail-info">
                  <div className="tv-detail-row"><span className="tv-detail-label">Work Order No</span><span className="tv-detail-value">: {workOrderOf(selectedInspection) || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">CPO No</span><span className="tv-detail-value">: {selectedInspection.cpoNo || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Type</span><span className="tv-detail-value">: {selectedInspection.inspectionType || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Product</span><span className="tv-detail-value">: {selectedInspection.product || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Customer</span><span className="tv-detail-value">: {selectedInspection.customer || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Department</span><span className="tv-detail-value">: {selectedInspection.department || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Inspector</span><span className="tv-detail-value">: {selectedInspection.inspector || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Date</span><span className="tv-detail-value">: {selectedInspection.inspectionDate || EMPTY_VALUE}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Qty Inspected</span><span className="tv-detail-value">: {selectedInspection.quantityInspected ?? 0}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Accepted</span><span className="tv-detail-value">: {selectedInspection.acceptedQuantity ?? 0}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Rejected</span><span className="tv-detail-value">: {selectedInspection.rejectedQuantity ?? 0}</span></div>
                  <div className="tv-detail-row"><span className="tv-detail-label">Remarks</span><span className="tv-detail-value">: {selectedInspection.remarks || EMPTY_VALUE}</span></div>
                </div>

                <div className="tv-detail-section">
                  <h4 className="tv-detail-section-title"><BadgeCheck size={14} /> Status Actions</h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {selectedInspection.status === 'Pending' && (
                      <>
                        <button className="po-btn po-btn-primary po-btn-sm" onClick={() => handleStatusChange(selectedInspection.id, 'In Progress', 'Started', 'Started by QC.')}>
                          <Play size={13} /> Start
                        </button>
                        <button className="po-btn po-btn-ghost po-btn-sm" onClick={() => handleStatusChange(selectedInspection.id, 'Hold', 'On Hold', 'Placed on hold.')}>
                          <Pause size={13} /> Hold
                        </button>
                      </>
                    )}
                    {selectedInspection.status === 'In Progress' && (
                      <>
                        <button className="po-btn po-btn-primary po-btn-sm" style={{ background: '#059669' }} onClick={() => handleStatusChange(selectedInspection.id, 'Passed', 'Passed', 'All checks passed.')}>
                          <CheckCircle size={13} /> Pass
                        </button>
                        <button className="po-btn po-btn-danger po-btn-sm" onClick={() => handleStatusChange(selectedInspection.id, 'Failed', 'Failed', 'Checks failed.')}>
                          <XCircle size={13} /> Fail
                        </button>
                      </>
                    )}
                    {selectedInspection.status === 'Hold' && (
                      <>
                        <button className="po-btn po-btn-primary po-btn-sm" style={{ background: '#059669' }} onClick={() => handleStatusChange(selectedInspection.id, 'Passed', 'Passed', 'Hold cleared.')}>
                          <CheckCircle size={13} /> Pass
                        </button>
                        <button className="po-btn po-btn-danger po-btn-sm" onClick={() => handleStatusChange(selectedInspection.id, 'Failed', 'Failed', 'Hold cleared.')}>
                          <XCircle size={13} /> Fail
                        </button>
                      </>
                    )}
                    <button className="po-btn po-btn-ghost po-btn-sm" onClick={() => { setSelectedInspection(null); openEdit(selectedInspection); }}>
                      <Edit2 size={13} /> Edit
                    </button>
                  </div>
                </div>

                {Array.isArray(selectedInspection.history) && selectedInspection.history.length > 0 && (
                  <div className="tv-detail-section">
                    <h4 className="tv-detail-section-title"><Clock size={14} /> History</h4>
                    <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {selectedInspection.history.map((entry, i) => (
                        <div key={i} style={{ padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontWeight: 600 }}>{entry.action}</span>
                            <span style={{ color: '#9CA3AF' }}>{entry.date ? new Date(entry.date).toLocaleString() : ''}</span>
                          </div>
                          <div style={{ color: '#6B7280' }}>By {entry.user || 'System'} · {entry.previousStatus} → {entry.newStatus}</div>
                          {entry.remarks && <div style={{ color: '#9CA3AF', marginTop: 2 }}>{entry.remarks}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
