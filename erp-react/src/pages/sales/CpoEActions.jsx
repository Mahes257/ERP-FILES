import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, Plus, Search, RotateCcw, RefreshCw, Eye, Pencil, Trash2,
  AlertTriangle, ChevronLeft, ChevronRight, Clock, CheckCircle, Loader, Ban
} from 'lucide-react';
import salesOrderEActionService from '../../services/salesOrderEActionService';
import useManagedGrid from '../../hooks/useManagedGrid';
import { ManageColumnsButton, ColumnRenameButton, ColumnResizer } from '../../components/GridColumns';
import { ConfirmDialog, useCurrentUser, useToast } from '../../components/Common';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import { cpoNo } from '../../utils/salesHelpers';
import { defaultEActionColumns, E_ACTION_STATUS_OPTIONS } from '../../utils/salesOrderColumns';
import '../crm/crm-erp.css';
import '../../styles/eactions-page.css';

/* ------------------------------------------------------------------
 * E-Actions / Participation — the E-Actions section of the EXISTING
 * Customer Purchase Orders page.
 *
 * Every row is a real `sales_order_e_actions` record: the SAME table, columns,
 * fields and status values the CPO Create/Edit form's E-Action grid writes.
 * The page keeps the ERP list architecture (summary cards, search + filters,
 * toolbar, dark-green table header, Manage Columns, pagination, row actions)
 * and opens the dedicated E-Action View / Create / Edit pages.
 * ------------------------------------------------------------------ */

const LIST_ROUTE = '/sales-orders/e-actions';

/** Column key → real field of a `sales_order_e_actions` row (list shape). */
const LIST_FIELD_BY_KEY = {
  cpoNo: 'cpoNo',
  eaParticipant: 'participantTeam',
  eaAction: 'assignedAction',
  eaAssignedTo: 'assignedTo',
  eaStatus: 'status',
  eaRequestedOn: 'requestedOn',
  eaStartedOn: 'startedOn',
  eaCompletedOn: 'completedOn',
  eaResult: 'result',
  eaRemarks: 'remarks'
};

const DATE_KEYS = new Set(['eaRequestedOn', 'eaStartedOn', 'eaCompletedOn']);

/**
 * Default list widths, keyed by column key.
 *
 * The table renders with `table-layout: fixed` + a <colgroup>, so these are the
 * widths every column starts at (and the basis of the table's horizontal
 * scroll extent on narrow screens). Remarks is deliberately the widest text
 * column because it holds free text; the document/date/status columns are
 * sized so their values never wrap mid-token at the default zoom.
 * Users can of course resize any of these — the width is persisted with the
 * rest of the column configuration.
 */
const LIST_WIDTHS = {
  checkbox: 40,
  // "S.No" is a single unbreakable token and the shared header also renders
  // the inline rename affordance next to the label, so this column needs
  // enough room for label + gap + pencil + the 14px cell padding on each side
  // — otherwise the header spills into the next column.
  sno: 80,
  cpoNo: 150,
  eaParticipant: 170,
  eaAction: 230,
  eaAssignedTo: 140,
  eaStatus: 130,
  eaRequestedOn: 118,
  eaStartedOn: 118,
  eaCompletedOn: 124,
  eaResult: 190,
  eaRemarks: 280,
  actions: 104
};

/**
 * Default list columns: S.No → CPO No → the CPO form's E-Action columns.
 *
 * Only the COLUMN DEFINITIONS live here — never any record values. A custom
 * column added through Manage Columns persists its definition and every
 * E-Action keeps its own value for it (see `customFields`).
 */
function defaultListColumns() {
  const base = [...defaultEActionColumns()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const sno = base.find((c) => c.key === 'sno');
  const rest = base.filter((c) => c.key !== 'sno');
  const cpoColumn = {
    id: 'cpoNo',
    key: 'cpoNo',
    label: 'CPO No',
    type: 'text',
    required: false,
    system: true,
    hidden: false,
    width: LIST_WIDTHS.cpoNo,
    order: 2
  };
  const withWidth = (col) =>
    LIST_WIDTHS[col.key] != null ? { ...col, width: LIST_WIDTHS[col.key] } : col;
  return [
    withWidth({ id: 'checkbox', key: 'checkbox', label: '', type: 'checkbox', system: true, hidden: false, width: LIST_WIDTHS.checkbox, order: 0 }),
    withWidth({ ...sno, order: 1 }),
    cpoColumn,
    ...rest.map(withWidth)
  ].map((c, i) => ({ ...c, order: i + 1 }));
}

/** List dates render as MM/DD/YYYY (the CPO page's date convention). */
function fmtDate(value) {
  if (!value) return '—';
  const s = String(value).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${m}/${d}/${y}` : s;
}

/** Summary-card icon/colour per real status value. */
const KPI_BY_STATUS = {
  Pending: { icon: Clock, color: '#B45309' },
  'In Progress': { icon: Loader, color: '#1D4ED8' },
  Completed: { icon: CheckCircle, color: '#15803D' },
  'On Hold': { icon: Ban, color: '#C2410C' },
  Cancelled: { icon: Ban, color: '#B91C1C' }
};

export default function CpoEActions() {
  const navigate = useNavigate();
  // SALES_DELETE, mirrored from the backend role → permission map — the single
  // and bulk E-Action delete entry points below are gated on it (the backend
  // E-Action delete endpoints still enforce it).
  const { canDeleteSales } = useCurrentUser();
  const toast = useToast();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [stats, setStats] = useState({ total: 0, byStatus: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // ---- filters (applied on Search, so typing stays cheap) ----
  const [searchInput, setSearchInput] = useState('');
  const [cpoInput, setCpoInput] = useState('');
  const [statusInput, setStatusInput] = useState('');
  const [teamInput, setTeamInput] = useState('');
  const [fromInput, setFromInput] = useState('');
  const [toInput, setToInput] = useState('');
  const [filters, setFilters] = useState({ search: '', cpoNo: '', status: '', participantTeam: '', dateFrom: '', dateTo: '' });

  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);

  const [options, setOptions] = useState({ cpos: [], participantTeams: [], statuses: [] });
  const [selected, setSelected] = useState(() => new Set());
  const [confirmRow, setConfirmRow] = useState(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const managed = useManagedGrid({
    gridKey: 'sales.eactions.list',
    defaults: defaultListColumns,
    insertBeforeKeys: ['actions'],
    itemNoun: 'E-Action',
    rowCount: rows.length,
    removeColumnValues: (columnId) =>
      setRows((prev) =>
        prev.map((row) => {
          if (!row?.customFields) return row;
          const cf = { ...row.customFields };
          delete cf[columnId];
          return { ...row, customFields: cf };
        })
      )
  });
  const columns = managed.visibleColumns;
  const colCount = columns.length;

  // ============================== DATA ==============================

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await salesOrderEActionService.list({ page, size, ...filters });
      setRows(data.content || []);
      setTotal(data.totalElements || 0);
      setTotalPages(data.totalPages || 0);
    } catch (err) {
      setError(err.message || 'Failed to load E-Actions');
      setRows([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [page, size, filters]);

  const loadStats = useCallback(async () => {
    try {
      const data = await salesOrderEActionService.stats();
      setStats({ total: data?.total || 0, byStatus: data?.byStatus || {} });
    } catch {
      // A summary is a convenience — the list itself stays authoritative.
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const data = await salesOrderEActionService.options();
      setOptions({
        cpos: data?.cpos || [],
        participantTeams: data?.participantTeams || [],
        statuses: data?.statuses || []
      });
    } catch {
      // Options are a convenience — the list still works without them.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadStats();
    loadOptions();
  }, [loadStats, loadOptions]);

  const refreshAll = () => Promise.all([load(), loadStats(), loadOptions()]);

  // ============================== HANDLERS ==============================

  const applyFilters = (override = {}) => {
    setPage(0);
    setSelected(new Set());
    setFilters({
      search: searchInput.trim(),
      cpoNo: cpoInput,
      status: statusInput,
      participantTeam: teamInput,
      dateFrom: fromInput,
      dateTo: toInput,
      ...override
    });
  };

  const resetFilters = () => {
    setSearchInput('');
    setCpoInput('');
    setStatusInput('');
    setTeamInput('');
    setFromInput('');
    setToInput('');
    setPage(0);
    setSelected(new Set());
    setFilters({ search: '', cpoNo: '', status: '', participantTeam: '', dateFrom: '', dateTo: '' });
  };

  /** Summary card click → same status filter the dropdown uses. */
  const selectKpi = (key) => {
    const status = key === 'all' ? '' : key;
    setStatusInput(status);
    applyFilters({ status });
  };

  /**
   * Delete one E-Action through the endpoint that can address it: a row linked
   * to a CPO is removed through that CPO, while a row raised against a manually
   * entered CPO reference (no CPO record behind it) is removed by its own id.
   */
  const removeEAction = (row) =>
    row.salesOrderId
      ? salesOrderEActionService.remove(row.salesOrderId, row.id)
      : salesOrderEActionService.removeStandalone(row.id);

  const removeRow = async () => {
    if (!confirmRow) return;
    setDeleting(true);
    try {
      await removeEAction(confirmRow);
      toast.success('E-Action deleted');
      setConfirmRow(null);
      setSelected(new Set());
      await refreshAll();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete the E-Action');
    } finally {
      setDeleting(false);
    }
  };

  const removeSelected = async () => {
    const targets = rows.filter((r) => selected.has(r.id));
    setDeleting(true);
    try {
      await Promise.all(targets.map((r) => removeEAction(r)));
      toast.success(`${targets.length} E-Action(s) deleted`);
      setConfirmBulk(false);
      setSelected(new Set());
      await refreshAll();
    } catch (err) {
      toast.error(err?.message || 'Failed to delete the selected E-Actions');
    } finally {
      setDeleting(false);
    }
  };

  const toggleAll = () => {
    setSelected((prev) => {
      if (prev.size === rows.length && rows.length > 0) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  };

  const toggleOne = (id, event) => {
    event?.stopPropagation();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openView = (row) => navigate(`${LIST_ROUTE}/${row.id}`);
  const openEdit = (row) => navigate(`${LIST_ROUTE}/${row.id}/edit`);

  const showFrom = total === 0 ? 0 : page * size + 1;
  const showTo = Math.min(total, page * size + rows.length);

  const kpiCards = useMemo(() => {
    const byStatus = stats.byStatus || {};
    const cards = [
      { key: 'all', label: 'Total E-Actions', value: stats.total || 0, icon: Users, color: '#0B4A3D' }
    ];
    const statuses = [...new Set([...E_ACTION_STATUS_OPTIONS, ...Object.keys(byStatus)])];
    statuses.forEach((status) => {
      const cfg = KPI_BY_STATUS[status] || { icon: Clock, color: '#64748B' };
      cards.push({ key: status, label: status, value: byStatus[status] || 0, icon: cfg.icon, color: cfg.color });
    });
    return cards;
  }, [stats]);

  const activeKpi = filters.status || 'all';

  /** True when the user has narrowed the list — drives the honest empty state. */
  const hasActiveFilters = useMemo(
    () => Object.values(filters).some((value) => String(value ?? '').trim() !== ''),
    [filters]
  );

  // ============================== CELLS ==============================

  const renderCell = (col, row, idx) => {
    if (col.key === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={(e) => toggleOne(row.id, e)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select E-Action ${idx + 1}`}
        />
      );
    }
    if (col.key === 'sno') return <span style={{ color: '#94A3B8' }}>{page * size + idx + 1}</span>;

    // User-defined column: real per-row value.
    if (!col.system) {
      const value = (row.customFields || {})[col.id];
      return <span>{value || '—'}</span>;
    }

    if (col.key === 'actions') {
      return (
        <div className="ea-row-actions" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="tv-action-btn" title="View" onClick={() => openView(row)}>
            <Eye size={14} />
          </button>
          <button type="button" className="tv-action-btn" title="Edit" onClick={() => openEdit(row)}>
            <Pencil size={14} />
          </button>
          {/* Deleting an E-Action is a SALES_DELETE action on the Sales Order
              module — the row action is not offered without it. */}
          {canDeleteSales && (
            <button
              type="button"
              className="tv-action-btn"
              title="Delete"
              style={{ color: '#dc2626' }}
              onClick={() => setConfirmRow(row)}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      );
    }

    if (col.key === 'cpoNo') {
      // A CPO that exists here opens its record. A manually entered reference
      // (the order is not one of our CPO records) has nothing to open, so it is
      // shown as plain text — the list must not pretend there is a CPO behind it.
      if (!row.salesOrderId) {
        const reference = row.cpoReference || '';
        return (
          <span className="ea-cell-text" title="CPO reference — no CPO record in the system">
            {reference || '—'}
          </span>
        );
      }
      // A real link to the Customer Purchase Order, styled as body text
      // (dark) rather than a blue hyperlink — see `.ea-cpo-link`.
      return (
        <button
          type="button"
          className="ea-cpo-link"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/sales-orders/${row.salesOrderId}`);
          }}
          title="Open this Customer Purchase Order"
        >
          {cpoNo(row.cpoNo) || '—'}
        </button>
      );
    }

    if (col.key === 'eaStatus') return <SalesStatusBadge status={row.status} />;

    const field = LIST_FIELD_BY_KEY[col.key];
    if (!field) return <span>—</span>;
    const value = row[field];
    if (DATE_KEYS.has(col.key)) {
      return <span className="ea-cell-nowrap">{fmtDate(value)}</span>;
    }
    return <span className="ea-cell-text">{value || '—'}</span>;
  };

  // ============================== RENDER ==============================

  return (
    /* `purchase-page cpr-page` gives this list the SAME page shell as the CPO
       List reference: 20px/28px/96px padding, full available width and the
       shared width constraints — so the cards, filter row and table card align
       with the hub's tab bar and the reference page instead of sitting flush
       against the content edges. `.ea-page` stays on the element for its own
       (unchanged) reflow/overflow rules; the table still scrolls internally. */
    <div className="purchase-page cpr-page ea-page">
      {error && (
        <div className="cpr-error-banner">
          <AlertTriangle size={14} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* ===== Summary cards (real per-status counts) ===== */}
      <SalesKpiCards
        cards={kpiCards}
        activeKpi={activeKpi}
        onSelect={selectKpi}
        gridClassName="pr-kpi-grid ea-kpi-grid"
      />

      {/* ===== Section header ===== */}
      <div className="po-table-card" style={{ marginBottom: 16 }}>
        <div className="ea-head">
          <div className="ea-head-main">
            <span
              style={{
                width: 40, height: 40, borderRadius: 12, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: 'rgba(11,74,61,0.08)', color: '#0B4A3D'
              }}
            >
              <Users size={20} />
            </span>
            <div className="ea-head-text">
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0B4A3D' }}>E-Actions</h2>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748B' }}>
                Track E-Action, participation, release and procurement actions associated with Customer Purchase Orders.
              </p>
            </div>
          </div>
          <div className="ea-head-actions">
            <button type="button" className="po-btn po-btn-primary" onClick={() => navigate(`${LIST_ROUTE}/new`)}>
              <Plus size={14} /> Add E-Action
            </button>
          </div>
        </div>
      </div>

      {/* ===== Filters ===== */}
      <div className="po-table-card" style={{ marginBottom: 16, padding: '14px 16px' }}>
        <div className="ea-filters">
          <div className="tv-search-input ea-filter-search">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search (CPO No, Participant, Action, Assigned To...)"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyFilters()}
            />
          </div>
          <label className="ea-filter ea-filter--cpo">
            <span className="ea-filter-label">CPO</span>
            <select className="tv-filter-select" value={cpoInput} onChange={(e) => setCpoInput(e.target.value)}>
              <option value="">All</option>
              {options.cpos.map((c) => (
                <option key={c.id} value={c.cpoNo}>{cpoNo(c.cpoNo)}</option>
              ))}
            </select>
          </label>
          <label className="ea-filter">
            <span className="ea-filter-label">Status</span>
            <select className="tv-filter-select" value={statusInput} onChange={(e) => setStatusInput(e.target.value)}>
              <option value="">All</option>
              {[...new Set([...E_ACTION_STATUS_OPTIONS, ...(options.statuses || [])])].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="ea-filter">
            <span className="ea-filter-label">Participant / Team</span>
            <select className="tv-filter-select" value={teamInput} onChange={(e) => setTeamInput(e.target.value)}>
              <option value="">All</option>
              {options.participantTeams.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <label className="ea-filter">
            <span className="ea-filter-label">From</span>
            <input type="date" className="tv-form-input" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
          </label>
          <label className="ea-filter">
            <span className="ea-filter-label">To</span>
            <input type="date" className="tv-form-input" value={toInput} onChange={(e) => setToInput(e.target.value)} />
          </label>
          <div className="ea-filter-buttons">
            <button type="button" className="po-btn po-btn-primary" onClick={() => applyFilters()}>
              <Search size={14} /> Search
            </button>
            <button type="button" className="po-btn po-btn-ghost" onClick={resetFilters}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* ===== Table card ===== */}
      <div className="po-table-card">
        <div className="ea-toolbar">
          <div className="ea-toolbar-left">
            <ManageColumnsButton manager={managed.manager} />
            {selected.size > 0 && canDeleteSales && (
              <button type="button" className="po-btn po-btn-ghost po-btn-sm" style={{ color: '#dc2626' }} onClick={() => setConfirmBulk(true)}>
                <Trash2 size={14} /> Delete selected ({selected.size})
              </button>
            )}
          </div>
          <button type="button" className="po-btn po-btn-ghost po-btn-sm" onClick={refreshAll}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {/* The table scrolls horizontally INSIDE this wrapper — the page itself
            never overflows. Widths come from the (persisted, resizable) column
            configuration via <colgroup>, so cells wrap instead of colliding. */}
        <div className="po-table-wrap ea-table-wrap">
          <table
            className="po-table"
            style={{
              tableLayout: 'fixed',
              width: '100%',
              minWidth: Math.max(1180, managed.resize.totalWidth(columns))
            }}
          >
            <colgroup>
              {columns.map((col) => (
                <col key={col.id} style={{ width: managed.resize.widthOf(col) }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.id}
                    className={col.key === 'checkbox' || col.key === 'actions' ? '' : 'grid-resizable-th'}
                    style={{
                      width: managed.resize.widthOf(col),
                      ...(col.key === 'checkbox' ? { textAlign: 'center' } : null)
                    }}
                  >
                    {col.key === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={rows.length > 0 && selected.size === rows.length}
                        onChange={toggleAll}
                        aria-label="Select all E-Actions"
                      />
                    ) : (
                      <>
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {col.key !== 'actions' && <ColumnRenameButton manager={managed.manager} column={col} />}
                        </span>
                        {col.key !== 'actions' && <ColumnResizer column={col} resize={managed.resize} />}
                      </>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '28px 12px', color: '#94A3B8', fontSize: 12 }}>
                    Loading E-Actions...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '32px 12px' }}>
                    <Users size={28} style={{ color: '#CBD5E1', marginBottom: 6 }} />
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>No E-Actions found.</div>
                    <div style={{ fontSize: 12, color: '#94A3B8' }}>
                      {hasActiveFilters
                        ? 'No E-Action matches the current search and filters.'
                        : 'E-Actions raised for a Customer Purchase Order appear here.'}
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr
                    key={row.id}
                    onClick={() => openView(row)}
                    className={selected.has(row.id) ? 'po-row-selected' : ''}
                    style={{ cursor: 'pointer' }}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.id}
                        style={
                          col.key === 'checkbox' || col.key === 'actions'
                            ? { textAlign: 'center', padding: '10px 8px' }
                            : { padding: '10px 12px', fontSize: 12, color: '#475569', verticalAlign: 'top' }
                        }
                      >
                        {renderCell(col, row, idx)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ===== Pagination ===== */}
        <div className="ea-pagination">
          <span style={{ fontSize: 12, color: '#64748B' }}>
            Showing {showFrom} to {showTo} of {total} entries
          </span>
          <div className="ea-pagination-controls">
            <button
              type="button"
              className="po-btn po-btn-ghost po-btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft size={14} /> Previous
            </button>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0B4A3D', minWidth: 20, textAlign: 'center' }}>
              {page + 1}
            </span>
            <button
              type="button"
              className="po-btn po-btn-ghost po-btn-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight size={14} />
            </button>
            <select
              className="tv-filter-select"
              value={size}
              onChange={(e) => {
                setSize(Number(e.target.value));
                setPage(0);
              }}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n} / page</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Delete E-Action"
        message={
          confirmRow
            ? `Delete “${confirmRow.assignedAction || `E-Action #${confirmRow.id}`}”? ${
              confirmRow.salesOrderId
                ? 'This removes the row from the related Customer Purchase Order.'
                : 'This removes the row raised against the entered CPO reference.'
            }`
            : ''
        }
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={deleting}
        onConfirm={removeRow}
        onCancel={() => setConfirmRow(null)}
      />

      <ConfirmDialog
        open={confirmBulk}
        title="Delete selected E-Actions"
        message={`Delete ${selected.size} selected E-Action(s)? They are removed from their Customer Purchase Orders.`}
        confirmLabel="Delete"
        variant="danger"
        icon={Trash2}
        loading={deleting}
        onConfirm={removeSelected}
        onCancel={() => setConfirmBulk(false)}
      />
    </div>
  );
}
