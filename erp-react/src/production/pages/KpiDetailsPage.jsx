import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Icon from '../components/icons/Icon';
import RowActionsDropdown from '../components/production/RowActionsDropdown';
import useDebounce from '../../hooks/useDebounce';
import { productionKpiApi } from '../utils/api';
import { subscribeProductionDataChanged } from '../utils/dataChanged';
import { KPI_PAGE_SIZE_DEFAULT, normalizeKpiPage } from '../utils/kpiQuery';
import { formatDate } from '../utils/format';
import './KpiDetailsPage.css';

// ============================================================
// KPI configuration — defines title, back link and columns for
// every module + KPI combination.
//
// The KPI *selection* (which records a KPI contains) lives in the
// backend (ProductionKpiService), filtered and counted in SQL, so
// this page only asks for one bounded page of rows. Keeping the
// definitions in one place — SQL — is what makes the KPI number on
// a card and the rows behind it impossible to disagree.
// ============================================================
function getKpiConfig(module, kpiKey) {
  const titles = {
    // Production Orders
    'orders-total': { title: 'Total Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-draft': { title: 'Draft Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-prodApproval': { title: 'Production Approval Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-adminApproval': { title: 'Admin Approval Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-approved': { title: 'Approved Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-prodRejected': { title: 'Production Rejected Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-adminRejected': { title: 'Admin Rejected Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    'orders-cancelled': { title: 'Cancelled Orders', backUrl: '/production/orders', backLabel: 'Production Work Orders' },
    // Quality
    'quality-total': { title: 'All QC Inspections', backUrl: '/production/quality', backLabel: 'Quality' },
    'quality-pending': { title: 'QC Pending Inspections', backUrl: '/production/quality', backLabel: 'Quality' },
    'quality-today': { title: "Today's Inspections", backUrl: '/production/quality', backLabel: 'Quality' },
    'quality-accepted': { title: 'Accepted Inspections', backUrl: '/production/quality', backLabel: 'Quality' },
    'quality-rejected': { title: 'Rejected Inspections', backUrl: '/production/quality', backLabel: 'Quality' },
    'quality-onHold': { title: 'QC On Hold', backUrl: '/production/quality', backLabel: 'Quality' },
    // Packing
    'packing-total': { title: 'All Packing Lists', backUrl: '/production/packing', backLabel: 'Packing' },
    'packing-pending': { title: 'Pending Packing', backUrl: '/production/packing', backLabel: 'Packing' },
    'packing-inProgress': { title: 'Packing In Progress', backUrl: '/production/packing', backLabel: 'Packing' },
    'packing-completed': { title: 'Completed Packing', backUrl: '/production/packing', backLabel: 'Packing' },
    'packing-readyForDispatch': { title: 'Ready for Dispatch', backUrl: '/production/packing', backLabel: 'Packing' },
    // Dispatch
    'dispatch-total': { title: 'All Dispatch Records', backUrl: '/production/dispatch', backLabel: 'Dispatch' },
    'dispatch-draft': { title: 'Draft Dispatches', backUrl: '/production/dispatch', backLabel: 'Dispatch' },
    'dispatch-ready': { title: 'Ready for Dispatch', backUrl: '/production/dispatch', backLabel: 'Dispatch' },
    'dispatch-dispatched': { title: 'Dispatched', backUrl: '/production/dispatch', backLabel: 'Dispatch' },
    'dispatch-inTransit': { title: 'In Transit', backUrl: '/production/dispatch', backLabel: 'Dispatch' },
    'dispatch-delivered': { title: 'Delivered', backUrl: '/production/dispatch', backLabel: 'Dispatch' },
    // ShopFloor — Casting
    'casting-total': { title: 'Casting — Total Jobs', backUrl: '/production/casting', backLabel: 'Casting' },
    'casting-pending': { title: 'Casting — Pending', backUrl: '/production/casting', backLabel: 'Casting' },
    'casting-inProgress': { title: 'Casting — In Progress', backUrl: '/production/casting', backLabel: 'Casting' },
    'casting-completed': { title: 'Casting — Completed', backUrl: '/production/casting', backLabel: 'Casting' },
    'casting-onHold': { title: 'Casting — On Hold', backUrl: '/production/casting', backLabel: 'Casting' },
    // ShopFloor — Fabrication
    'fabrication-total': { title: 'Fabrication — Total Jobs', backUrl: '/production/fabrication', backLabel: 'Fabrication' },
    'fabrication-pending': { title: 'Fabrication — Pending', backUrl: '/production/fabrication', backLabel: 'Fabrication' },
    'fabrication-inProgress': { title: 'Fabrication — In Progress', backUrl: '/production/fabrication', backLabel: 'Fabrication' },
    'fabrication-completed': { title: 'Fabrication — Completed', backUrl: '/production/fabrication', backLabel: 'Fabrication' },
    'fabrication-onHold': { title: 'Fabrication — On Hold', backUrl: '/production/fabrication', backLabel: 'Fabrication' },
    // ShopFloor — Assembly
    'assembly-total': { title: 'Assembly — Total Jobs', backUrl: '/production/assembly', backLabel: 'Assembly' },
    'assembly-pending': { title: 'Assembly — Pending', backUrl: '/production/assembly', backLabel: 'Assembly' },
    'assembly-inProgress': { title: 'Assembly — In Progress', backUrl: '/production/assembly', backLabel: 'Assembly' },
    'assembly-completed': { title: 'Assembly — Completed', backUrl: '/production/assembly', backLabel: 'Assembly' },
    'assembly-onHold': { title: 'Assembly — On Hold', backUrl: '/production/assembly', backLabel: 'Assembly' },
    // ShopFloor — MachineShop
    'machineShop-total': { title: 'Machine Shop — Total Jobs', backUrl: '/production/machine-shop', backLabel: 'Machine Shop' },
    'machineShop-pending': { title: 'Machine Shop — Pending', backUrl: '/production/machine-shop', backLabel: 'Machine Shop' },
    'machineShop-inProgress': { title: 'Machine Shop — In Progress', backUrl: '/production/machine-shop', backLabel: 'Machine Shop' },
    'machineShop-completed': { title: 'Machine Shop — Completed', backUrl: '/production/machine-shop', backLabel: 'Machine Shop' },
    'machineShop-onHold': { title: 'Machine Shop — On Hold', backUrl: '/production/machine-shop', backLabel: 'Machine Shop' },
    // Dashboard
    'dashboard-total': { title: 'Total Production Work Orders', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-draft': { title: 'Draft Orders', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-pendingApproval': { title: 'Pending Approval', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-approved': { title: 'Approved Orders', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-inProgress': { title: 'In Progress Orders', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-completed': { title: 'Completed Orders', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-onHold': { title: 'Orders On Hold', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-delayed': { title: 'Delayed Orders', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-qcPending': { title: 'QC Pending', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-packingPending': { title: 'Packing Pending', backUrl: '/production', backLabel: 'Dashboard' },
    'dashboard-dispatchPending': { title: 'Dispatch Pending', backUrl: '/production', backLabel: 'Dashboard' },
  };
  return titles[`${module}-${kpiKey}`] || { title: `${module} — ${kpiKey}`, backUrl: '/production', backLabel: 'Production' };
}

function getColumns(module) {
  if (['casting', 'fabrication', 'assembly', 'machineShop'].includes(module)) {
    return [
      { key: 'id', label: 'Job ID' },
      { key: 'productionOrder', label: 'Work Order' },
      { key: 'product', label: 'Product / Item' },
      { key: 'quantity', label: 'Quantity' },
      { key: 'status', label: 'Status' },
    ];
  }
  if (module === 'quality') {
    return [
      { key: 'id', label: 'Inspection ID' },
      { key: 'productionOrder', label: 'Work Order' },
      { key: 'product', label: 'Product' },
      { key: 'inspector', label: 'Inspector' },
      { key: 'status', label: 'Status' },
    ];
  }
  if (module === 'packing') {
    return [
      { key: 'id', label: 'Packing List' },
      { key: 'productionOrder', label: 'Work Order' },
      { key: 'product', label: 'Product' },
      { key: 'customer', label: 'Customer' },
      { key: 'status', label: 'Status' },
    ];
  }
  if (module === 'dispatch') {
    return [
      { key: 'id', label: 'Dispatch ID' },
      { key: 'productionOrder', label: 'Work Order' },
      { key: 'product', label: 'Product' },
      { key: 'customer', label: 'Customer' },
      { key: 'status', label: 'Status' },
    ];
  }
  // Default: Production Orders / Dashboard
  return [
    { key: 'workOrder', label: 'Work Order' },
    { key: 'product', label: 'Product' },
    { key: 'department', label: 'Department' },
    { key: 'status', label: 'Status' },
    { key: 'dueDate', label: 'Due Date' },
  ];
}

function renderCell(record, col) {
  const val = record[col.key];
  if (col.key === 'status') {
    return <span className={`kpi-badge kpi-badge-${(val || '').toLowerCase().replace(/\s+/g, '-')}`}>{val || '—'}</span>;
  }
  if (col.key === 'dueDate') {
    return val ? formatDate(val) : '—';
  }
  return val || '—';
}

const STATUS_FILTERS = {
  orders: ['All', 'Draft', 'Pending Production Approval', 'Production Approved', 'Pending Admin Approval', 'Admin Approved', 'Approved'],
  quality: ['All', 'Pending', 'In Progress', 'Passed', 'Rejected', 'Hold'],
  packing: ['All', 'Pending', 'In Progress', 'Completed', 'Packed', 'Ready for Dispatch'],
  dispatch: ['All', 'Draft', 'Ready', 'Dispatched', 'In Transit', 'Delivered'],
  casting: ['All', 'Pending', 'In Progress', 'Completed', 'Hold'],
  fabrication: ['All', 'Pending', 'In Progress', 'Completed', 'Hold'],
  assembly: ['All', 'Pending', 'In Progress', 'Completed', 'Hold'],
  machineShop: ['All', 'Pending', 'In Progress', 'Completed', 'Hold'],
  dashboard: ['All', 'Draft', 'Pending Production Approval', 'Production Approved', 'Pending Admin Approval', 'Admin Approved', 'Approved', 'In Progress', 'Completed', 'Hold', 'Pending QC'],
};

export default function KpiDetailsPage() {
  const { module, kpiKey } = useParams();
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // The search term is applied by the database, so it is sent once typing
  // settles instead of on every keystroke.
  const debouncedSearch = useDebounce(searchInput, 400);
  useEffect(() => {
    setSearch(debouncedSearch);
    setPage(1);
  }, [debouncedSearch]);

  // A different KPI (or module) starts from a clean pager.
  useEffect(() => {
    setPage(1);
    setStatusFilter('All');
  }, [module, kpiKey]);

  /*
   * One bounded page per request: search, the status dropdown and the page
   * number are all part of the query, and the database does the filtering,
   * counting and slicing. The browser never holds the whole table.
   */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await productionKpiApi.kpiPage({
          module,
          kpiKey,
          search,
          status: statusFilter,
          page,
          pageSize: KPI_PAGE_SIZE_DEFAULT
        });
        if (cancelled) return;
        const { rows: pageRows, total: pageTotal, totalPages: pages } =
          normalizeKpiPage(response?.data ?? response);
        const lastPage = Math.max(1, pages);
        setRows(pageRows);
        setTotal(pageTotal);
        setTotalPages(lastPage);
        // Rows can disappear under a pager that moved past the end.
        if (page > lastPage) setPage(lastPage);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load KPI records:', err.message);
          setRows([]);
          setTotal(0);
          setTotalPages(1);
          setError(err);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [module, kpiKey, search, statusFilter, page, refreshKey]);

  // Same refresh trigger the other Production screens use — coalesced so a
  // burst of writes reloads this KPI page once instead of once per write.
  useEffect(
    () => subscribeProductionDataChanged('kpi-details-view', () => setRefreshKey((key) => key + 1)),
    []
  );

  const config = getKpiConfig(module, kpiKey);
  const columns = useMemo(() => getColumns(module), [module]);
  const statusOptions = STATUS_FILTERS[module] || ['All'];

  const handleRowClick = useCallback((record) => {
    // Open record detail in a new tab
    let url;
    if (module === 'orders' || module === 'dashboard') {
      url = `/production/orders/${record.id}`;
    } else if (module === 'quality') {
      url = `/production/quality/${record.id}`;
    } else if (module === 'packing') {
      url = `/production/packing/${record.id}/preview`;
    } else if (module === 'dispatch') {
      url = `/production/dispatch`;
    } else if (['casting', 'fabrication', 'assembly', 'machineShop'].includes(module)) {
      url = `/production/${module}`;
    }
    if (url) window.open(url, '_blank');
  }, [module]);

  /** Read-only preview route for a KPI row's actual record. */
  const previewUrl = useCallback((record) => {
    if (module === 'orders' || module === 'dashboard') {
      return `/production/preview/orders/${encodeURIComponent(record.workOrder || record.id)}`;
    }
    if (module === 'quality') {
      return `/production/preview/quality/${encodeURIComponent(record.id)}`;
    }
    if (module === 'packing') {
      return `/production/preview/packing/${encodeURIComponent(record.id)}`;
    }
    if (module === 'dispatch') {
      return `/production/preview/dispatch/${encodeURIComponent(record.id)}`;
    }
    if (['casting', 'fabrication', 'assembly', 'machineShop'].includes(module)) {
      const previewModule = module === 'machineShop' ? 'machine-shop' : module;
      const workOrder = record.productionOrder || record.workOrder;
      if (!workOrder) return null;
      return `/production/preview/${previewModule}/${encodeURIComponent(workOrder)}`;
    }
    return null;
  }, [module]);

  const firstRow = (page - 1) * KPI_PAGE_SIZE_DEFAULT + 1;
  const lastRow = Math.min(page * KPI_PAGE_SIZE_DEFAULT, total);

  return (
    <div className="page">
      <div className="page-header">
        <div className="kpi-details-header">
          <button type="button" className="kpi-back-btn" onClick={() => navigate(config.backUrl)}>
            <Icon name="arrow-left" size={16} /> {config.backLabel}
          </button>
          <div>
            <h2 className="page-title">{config.title}</h2>
            <p className="page-subtitle">{total} record{total !== 1 ? 's' : ''} found</p>
          </div>
        </div>
      </div>

      <div className="kpi-details-content">
        {/* Toolbar */}
        <div className="kpi-details-toolbar">
          <div className="kpi-details-search">
            <Icon name="search" size={14} />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search records..."
              aria-label="Search"
            />
          </div>
          <select
            className="kpi-details-filter"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            {statusOptions.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="kpi-details-table-card">
          {rows.length > 0 ? (
            <table className="kpi-details-table sgrid sgrid-prod sgrid-actions">
              <thead>
                <tr>
                  {columns.map((col, colIdx) => (
                    <th key={col.key} className={colIdx === 0 ? 'sgrid-pin sgrid-first' : undefined}>{col.label}</th>
                  ))}
                  <th className="col-actions-th sgrid-pin-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((record, idx) => {
                  const statusKey = (record.status || 'all').toLowerCase().replace(/\s+/g, '-');
                  return (
                  <tr key={record.id || idx} onClick={() => handleRowClick(record)} className={`kpi-details-row kpi-row-${statusKey}`} title="Click to open in new tab">
                    {columns.map((col, colIdx) => (
                      <td key={col.key} className={colIdx === 0 ? 'sgrid-pin sgrid-first' : undefined}>{renderCell(record, col)}</td>
                    ))}
                    <td className="col-actions sgrid-pin-actions">
                      <RowActionsDropdown
                        actions={[
                          ...(previewUrl(record)
                            ? [
                                {
                                  label: 'Preview',
                                  icon: <Icon name="eye" size={13} />,
                                  onClick: () => navigate(previewUrl(record)),
                                },
                              ]
                            : []),
                          {
                            label: 'View Details',
                            icon: <Icon name="external-link" size={13} />,
                            onClick: (e) => { e.stopPropagation(); handleRowClick(record); },
                          },
                        ]}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <div className="kpi-details-empty">
              <Icon name="search" size={24} />
              <h4>No records found</h4>
              <p>{error ? 'Could not load these records.' : loading ? 'Loading records…' : 'No records match your current filters.'}</p>
            </div>
          )}

          {/* Pagination — same markup/classes as the other Production tables */}
          {total > 0 && totalPages > 1 && (
            <div className="sf-pagination" style={{ borderTop: '1px solid #E2E8F0', padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span className="sf-pagination-info" style={{ fontSize: 12, color: '#64748B' }}>
                Showing {firstRow}–{lastRow} of {total} records
              </span>
              <div className="sf-pagination-controls" style={{ display: 'flex', gap: 3 }}>
                <button
                  type="button"
                  className="btn btn-secondary sf-pagination-btn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <Icon name="chevron-left" size={13} /> Prev
                </button>
                <span className="sf-pagination-page" style={{ padding: '0 10px', fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary sf-pagination-btn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <Icon name="chevron-right" size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
