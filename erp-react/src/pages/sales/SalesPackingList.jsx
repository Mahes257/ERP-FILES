import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes, Search, RefreshCw, ChevronLeft, ChevronRight, AlertTriangle,
  ClipboardList, Clock, Play, CheckCircle, Truck, Eye, Edit2, MoreVertical
} from 'lucide-react';
import { packingApi } from '../../production/utils/api';
import { cpoNo as toCpoNo } from '../../utils/salesHelpers';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import { useToast } from '../../components/Common';
import '../crm/crm-erp.css';

// ============================== CONSTANTS ==============================

const EMPTY_VALUE = '—';

/** Backend enum ↔ display label. Records are stored as PENDING / IN_PROGRESS … */
const STATUS_OPTIONS = [
  { key: 'All', label: 'All', statKey: 'total' },
  { key: 'PENDING', label: 'Pending', statKey: 'pending' },
  { key: 'IN_PROGRESS', label: 'In Progress', statKey: 'inProgress' },
  { key: 'COMPLETED', label: 'Completed', statKey: 'completed' },
  { key: 'READY_FOR_DISPATCH', label: 'Ready for Dispatch', statKey: 'readyForDispatch' },
];

const STATUS_BADGES = {
  PENDING: 'tv-badge tv-badge-gray',
  IN_PROGRESS: 'tv-badge tv-badge-blue',
  COMPLETED: 'tv-badge tv-badge-green',
  READY_FOR_DISPATCH: 'tv-badge tv-badge-orange',
};

const KPI_CARDS = [
  { key: 'All', label: 'Total Packing Lists', icon: ClipboardList, color: '#0B4A3D', statKey: 'total' },
  { key: 'PENDING', label: 'Pending', icon: Clock, color: '#f59e0b', statKey: 'pending' },
  { key: 'IN_PROGRESS', label: 'In Progress', icon: Play, color: '#2563EB', statKey: 'inProgress' },
  { key: 'COMPLETED', label: 'Completed', icon: CheckCircle, color: '#16A34A', statKey: 'completed' },
  { key: 'READY_FOR_DISPATCH', label: 'Ready for Dispatch', icon: Truck, color: '#ea580c', statKey: 'readyForDispatch' },
];

const PAGE_SIZE = 20;

/** "IN_PROGRESS" → "In Progress" without rewriting the stored value. */
const displayStatus = (raw) => {
  if (!raw) return EMPTY_VALUE;
  const option = STATUS_OPTIONS.find((s) => s.key === String(raw).toUpperCase());
  if (option) return option.label;
  const small = new Set(['for', 'of', 'and', 'to']);
  return String(raw)
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map((word, i) => (i > 0 && small.has(word.toLowerCase())
      ? word.toLowerCase()
      : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
};

// ============================== PAGE ==============================

/**
 * Sales Execution → Packing List.
 *
 * Reads the SAME `packing_lists` rows Production → Packing owns, through the
 * existing /packing API (no second dataset, no copied records). A packing list
 * created or updated in Production appears here on the next load/refresh, and
 * its Work Order + CPO references are the ones stored on the record.
 */
export default function SalesPackingList() {
  const navigate = useNavigate();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(0);
  const [stats, setStats] = useState(null);
  // Which row's three-dot Actions menu is open (backend id of the row).
  const [openActionRow, setOpenActionRow] = useState(null);

  // Bumped to re-run the list/counter reads after a write or a manual refresh.
  const [reloadToken, setReloadToken] = useState(0);

  // Debounced search — one request per paused keystroke, never per key. Only a
  // real change applies, so mounting never sets `loading` without a fetch.
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

  // The authoritative packing records, one page at a time, filtered server-side.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await packingApi.list({
          search: appliedSearch || undefined,
          status: statusFilter === 'All' ? undefined : statusFilter,
          page,
          size: PAGE_SIZE,
        });
        if (cancelled) return;
        const payload = data?.data || data || {};
        setRows(Array.isArray(payload.content) ? payload.content : []);
        setTotal(Number(payload.totalElements) || 0);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || 'Failed to load packing lists');
        setRows([]);
        setTotal(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [appliedSearch, statusFilter, page, reloadToken]);

  // Counters come from the backend stats, never from the visible page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await packingApi.getStats();
        if (!cancelled) setStats(data?.data || data || null);
      } catch {
        // Counters keep their last value; the table reports its own error.
      }
    })();
    return () => { cancelled = true; };
  }, [reloadToken]);

  // Production writes broadcast this event — refresh, no polling loop.
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

  const selectStatus = (key) => {
    setLoading(true);
    setStatusFilter(key);
    setPage(0);
  };

  const kpiCards = KPI_CARDS.map((card) => ({
    key: card.key,
    label: card.label,
    value: stats ? stats[card.statKey] ?? 0 : 0,
    icon: card.icon,
    color: card.color,
  }));

  const pageStart = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const pageEnd = Math.min((page + 1) * PAGE_SIZE, total);
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  return (
    /* The same page shell as the CPO List (`.purchase-page cpr-page`): it owns
       the module's horizontal padding (28px, matching the hub's tab bar), the
       bottom scroll clearance and the width constraints, so the cards, tabs and
       table line up with the reference page instead of running edge to edge.
       The table keeps its own internal horizontal scroll. */
    <div className="purchase-page cpr-page">
      {/* Page Header */}
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Boxes size={20} style={{ color: '#059669' }} /> Packing Lists
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', margin: '4px 0 0' }}>
          Every packing list recorded in Production → Packing, with its Work Order and Customer Purchase Order.
        </p>
      </div>

      {error && (
        <div className="cpr-error-banner">
          <AlertTriangle size={14} /><span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <SalesKpiCards cards={kpiCards} activeKpi={statusFilter} onSelect={selectStatus} />

      {/* Status tabs */}
      <div className="tv-division-tabs">
        {STATUS_OPTIONS.map((tab) => {
          const count = stats ? stats[tab.statKey] : null;
          return (
            <button
              key={tab.key}
              className={`tv-division-tab ${statusFilter === tab.key ? 'tv-division-tab-active' : ''}`}
              onClick={() => selectStatus(tab.key)}
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
          <div className="tv-search-input">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search Packing List, Work Order, CPO, product, customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search packing lists"
            />
          </div>
          {(appliedSearch || statusFilter !== 'All') && (
            <button
              className="po-btn po-btn-ghost po-btn-sm"
              onClick={() => { setLoading(true); setSearch(''); setStatusFilter('All'); setPage(0); }}
            >
              Clear
            </button>
          )}
        </div>
        <div className="po-toolbar-right">
          <button className="po-btn po-btn-ghost po-btn-sm" onClick={refresh} title="Refresh">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="tv-table-wrap">
        <div className="tv-table-header">
          <span>Packing Lists</span>
          <span className="tv-table-count">{total}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="po-table tv-table">
            <thead>
              <tr>
                <th>Packing List No</th>
                <th>Date</th>
                <th>Work Order No</th>
                <th>CPO No</th>
                <th>Customer</th>
                <th>Order Description</th>
                <th style={{ textAlign: 'right' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Packed Qty</th>
                <th>Status</th>
                <th style={{ textAlign: 'center', width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="tv-table-loading">Loading packing lists...</td></tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="tv-table-empty">
                    <ClipboardList size={32} style={{ color: '#CBD5E1' }} />
                    <span>{(appliedSearch || statusFilter !== 'All') ? 'No packing lists match the current search and filter' : 'No packing lists recorded yet'}</span>
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const statusKey = String(row.status || '').toUpperCase();
                  const badge = STATUS_BADGES[statusKey] || 'tv-badge tv-badge-gray';
                  return (
                    <tr key={row.id} className="tv-table-row">
                      <td><span className="tv-cell-bold">{row.packingListNumber || EMPTY_VALUE}</span></td>
                      <td>{row.packingDate || EMPTY_VALUE}</td>
                      <td><span className="tv-cell-bold">{row.workOrderId || EMPTY_VALUE}</span></td>
                      <td>{row.salesOrderNumber ? toCpoNo(row.salesOrderNumber) : EMPTY_VALUE}</td>
                      <td>{row.customer || EMPTY_VALUE}</td>
                      <td>{row.product || EMPTY_VALUE}</td>
                      <td style={{ textAlign: 'right' }}>{row.productionQuantity ?? 0}</td>
                      <td style={{ textAlign: 'right' }}>{row.packedQuantity ?? 0}</td>
                      <td><span className={badge}>{displayStatus(row.status)}</span></td>
                      <td>
                        <div className="tv-actions-cell">
                          <button
                            className="tv-action-btn"
                            title="View"
                            onClick={() => navigate(`/production/packing/${encodeURIComponent(row.packingListNumber)}/preview`)}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="tv-action-btn"
                            title="Edit"
                            onClick={() => navigate(`/production/packing/${encodeURIComponent(row.packingListNumber)}/edit`)}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="tv-action-btn"
                            title="More"
                            aria-label="More actions"
                            onClick={() => setOpenActionRow(openActionRow === row.id ? null : row.id)}
                          >
                            <MoreVertical size={14} />
                          </button>
                          {openActionRow === row.id && (
                            <div className="tv-actions-menu">
                              {/* Frontend only: the Transportation module does not
                                  exist yet, so this reports the status and never
                                  navigates, converts or writes anything. */}
                              <button
                                onClick={() => {
                                  setOpenActionRow(null);
                                  toast.info('Convert to Transportation — coming soon.');
                                }}
                              >
                                <Truck size={13} /> Convert to Transportation
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
    </div>
  );
}
