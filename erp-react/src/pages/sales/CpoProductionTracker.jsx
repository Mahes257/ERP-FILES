import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList, Search, Filter, RefreshCw, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle, Clock, Factory, Hammer, PackageCheck,
  Shield, Boxes, Truck, Eye, MoreVertical, Download, BarChart3
} from 'lucide-react';
import api from '../../api/axiosInstance';
import {
  productionOrderApi,
  acknowledgementApi,
  tvApi,
} from '../../production/utils/api';
import {
  progressFor,
  currentStageFor,
  overallStatusFor,
  workflowForType,
} from '../../production/data/entries';
import { cpoNo } from '../../utils/salesHelpers';
import '../crm/crm-erp.css';

// ============================== CONSTANTS ==============================

const STAGES = [
  { key: 'casting', label: 'Casting', icon: Factory, desc: 'Raw material melting and casting process', color: '#0B4A3D' },
  { key: 'fabrication', label: 'Fabrication', icon: Hammer, desc: 'Cutting, machining and fabrication', color: '#2563eb' },
  { key: 'assembly', label: 'Assembly', icon: PackageCheck, desc: 'Component assembly and fitment', color: '#7c3aed' },
  { key: 'qc', label: 'QC', icon: Shield, desc: 'Quality inspection and verification', color: '#059669' },
  { key: 'packing', label: 'Packing', icon: Boxes, desc: 'Product packing and preparation', color: '#ea580c' },
  { key: 'dispatch', label: 'Dispatch', icon: Truck, desc: 'Final dispatch to customer', color: '#dc2626' },
];

const STATUS_CONFIG = {
  'NOT_STARTED': { badge: 'tv-badge tv-badge-gray', label: 'Not Started', color: '#6b7280' },
  'IN_PROGRESS': { badge: 'tv-badge tv-badge-blue', label: 'In Progress', color: '#2563eb' },
  'COMPLETED': { badge: 'tv-badge tv-badge-green', label: 'Completed', color: '#059669' },
  'DELAYED': { badge: 'tv-badge tv-badge-red', label: 'Delayed', color: '#dc2626' },
};

const STATUS_TABS = [
  { key: 'All', label: 'All' },
  { key: 'NOT_STARTED', label: 'Not Started' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'DELAYED', label: 'Delayed' },
];

const PAGE_SIZE = 100;

// The module column each tracker stage reads → the production workflow whose
// stages feed it (the same workflows the Production module itself uses).
const STAGE_TYPE = {
  casting: 'Casting',
  fabrication: 'Fabrication',
  assembly: 'Assembly',
};

const startOfToday = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
};

/** A stage entry is "done" when it is Completed or Skipped — the Production module's own rule. */
const isEntryDone = (entry) =>
  Boolean(entry) && (entry.status === 'Completed' || entry.status === 'Skipped');

/**
 * A Work Order's progress through one production type's workflow: completed-or-
 * skipped stages ÷ workflow length, counting only entries recorded under that
 * type (the same separation the Production module itself uses, so a Fabrication
 * Work Order's Packing/Dispatch entries never inflate the Assembly column).
 */
const typeStagePct = (workOrderEntries, type) => {
  const flow = workflowForType(type);
  if (!flow.length) return 0;
  const typeEntries = workOrderEntries.filter((entry) => entry.productionType === type);
  if (typeEntries.length === 0) return 0;
  const done = flow.filter((stage) => isEntryDone(typeEntries.find((e) => e.stage === stage))).length;
  return Math.round((done / flow.length) * 100);
};

/** A downstream single-stage module is either done (100) or not (0). */
const singleStagePct = (workOrderEntries, stage) =>
  workOrderEntries.some((entry) => entry.stage === stage && isEntryDone(entry)) ? 100 : 0;

/**
 * The percentage a stage COLUMN may show. The stage values themselves are
 * already computed above (workflow percentage, or 0/100 for a single-stage
 * module); this only guards the cell, so a stage with nothing recorded renders
 * as a dash rather than an empty bar with "0%" — and a missing or non-numeric
 * value can never reach the UI as "NaN%".
 */
const visibleStagePct = (value) => {
  const pct = Number(value);
  return Number.isFinite(pct) && pct > 0 ? pct : 0;
};

/**
 * The tracker's four buckets, mapped from the Work Order's REAL derived status
 * (the same `overallStatusFor` / `progressFor` the Production Orders page uses).
 *
 *   · Completed  — every acknowledgement, TV and production stage is done
 *   · Delayed    — not completed and past its due date
 *   · In progress— production has started (status In Progress/Hold, or recorded progress)
 *   · Not started— nothing recorded yet
 */
const bucketFor = (order, entries, ackRecord, tvRecord) => {
  const derivedStatus = overallStatusFor(order, entries, ackRecord, tvRecord);
  if (derivedStatus === 'Completed') return 'COMPLETED';
  const due = order.dueDate ? new Date(order.dueDate) : null;
  if (due && due < startOfToday()) return 'DELAYED';
  const progress = progressFor(order, entries, ackRecord, tvRecord);
  if (derivedStatus === 'In Progress' || derivedStatus === 'Hold' || progress > 0) return 'IN_PROGRESS';
  return 'NOT_STARTED';
};

// ============================== DATA LOADING ==============================
//
// The tracker is a READ-ONLY projection of the Production module: every row is
// an existing Work Order taken from the same `/production-orders` API the
// Production Orders page reads, and every derived field comes from the same
// helpers (`currentStageFor` / `progressFor` / `overallStatusFor` in
// src/production/data/entries.js) over the same persisted stage entries,
// Acknowledgement and Technical Verification records. Nothing is invented and
// nothing is written back.

/** Every Work Order, walked page by page (the list endpoint caps `size` at 100). */
async function fetchAllWorkOrders() {
  const all = [];
  const MAX_PAGES = 100;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    // Sequential on purpose: the next page is only known after this one.
    const result = await productionOrderApi.list({ page, size: PAGE_SIZE });
    const payload = result?.data || result || {};
    const content = Array.isArray(payload.content) ? payload.content : [];
    all.push(...content);
    if (payload.last === true || content.length < PAGE_SIZE) break;
  }
  return all;
}

/**
 * Current Customer Purchase Orders — the same `/sales-orders/options` feed the
 * CPO pickers use. A Work Order is only eligible for the tracker when its
 * linked CPO is present here.
 */
async function fetchCpoOptions() {
  const { data } = await api.get('/sales-orders/options');
  const payload = data?.data ?? data;
  return Array.isArray(payload) ? payload : [];
}

/** Every stage entry (one record per work order / item / stage). */
async function fetchAllEntries() {
  const { data } = await api.get('/production-entries');
  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return list;
}

/**
 * Every Technical Verification record, walked page by page — the same call the
 * Production module's TV store makes. The work-order scoped GET is not used
 * here because it does not return the record the Production Orders page reads.
 */
async function fetchAllTechnicalVerifications() {
  const all = [];
  const MAX_PAGES = 100;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await tvApi.list({ page, size: PAGE_SIZE });
    const payload = result?.data || result || {};
    const content = Array.isArray(payload.content) ? payload.content : [];
    all.push(...content);
    if (content.length < PAGE_SIZE) break;
  }
  return all;
}

// ============================== MAIN COMPONENT ==============================

export default function CpoProductionTracker() {
  // Rows — one per eligible Work Order, derived from the Production module.
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [stageFilter, setStageFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);

  // Detail
  const [selectedRow, setSelectedRow] = useState(null);
  const [openActionRow, setOpenActionRow] = useState(null);

  const loadTracker = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cpoOptions, workOrders, allEntries] = await Promise.all([
        fetchCpoOptions(),
        fetchAllWorkOrders(),
        fetchAllEntries(),
      ]);

      const cpoByNumber = new Map();
      cpoOptions.forEach((cpo) => {
        if (cpo?.soNo) cpoByNumber.set(cpo.soNo, cpo);
      });

      // Eligible = linked to a Customer Purchase Order that exists.
      const eligible = workOrders.filter(
        (order) => order?.workOrder && order.salesOrderNumber && cpoByNumber.has(order.salesOrderNumber)
      );

      // Acknowledgement (per Work Order, the call the module makes) and
      // Technical Verification (the paged list the TV store loads), resolved
      // exactly as the Production Orders page resolves them — first record wins.
      const [ackRecords, allTv] = await Promise.all([
        Promise.all(eligible.map((order) =>
          acknowledgementApi.getByWorkOrder(order.workOrder)
            .then((res) => res?.data ?? res ?? null)
            .catch(() => null))),
        fetchAllTechnicalVerifications(),
      ]);

      const tvByWorkOrder = new Map();
      allTv.forEach((tv) => {
        const key = tv?.workOrderId;
        if (key && !tvByWorkOrder.has(key)) tvByWorkOrder.set(key, tv);
      });

      const entriesByWorkOrder = new Map();
      allEntries.forEach((entry) => {
        const key = entry?.workOrderId;
        if (!key) return;
        if (!entriesByWorkOrder.has(key)) entriesByWorkOrder.set(key, []);
        entriesByWorkOrder.get(key).push(entry);
      });

      setRows(eligible.map((order, index) => {
        // Every helper below receives this Work Order's own entries and filters
        // them internally by production type — exactly what the Production
        // Orders page passes them.
        const workOrderEntries = entriesByWorkOrder.get(order.workOrder) || [];
        const ackRecord = ackRecords[index];
        const tvRecord = tvByWorkOrder.get(order.workOrder) || null;
        const cpo = cpoByNumber.get(order.salesOrderNumber);

        return {
          // Stable identity of the row: the Work Order itself.
          id: order.workOrder,
          backendId: order.backendId,
          workOrder: order.workOrder,
          cpoNo: order.salesOrderNumber,
          cpoRecord: cpo || null,
          customer: cpo?.clientName || order.customer || '-',
          orderDate: cpo?.orderDate || order.startDate || null,
          dueDate: order.dueDate || null,
          rawStatus: order.status,
          productionType: order.productionType,
          currentStage: currentStageFor(order, workOrderEntries, ackRecord, tvRecord),
          progress: progressFor(order, workOrderEntries, ackRecord, tvRecord),
          currentStatus: bucketFor(order, workOrderEntries, ackRecord, tvRecord),
          castingPct: typeStagePct(workOrderEntries, STAGE_TYPE.casting),
          fabricationPct: typeStagePct(workOrderEntries, STAGE_TYPE.fabrication),
          assemblyPct: typeStagePct(workOrderEntries, STAGE_TYPE.assembly),
          qcPct: singleStagePct(workOrderEntries, 'QC'),
          packingPct: singleStagePct(workOrderEntries, 'Packing'),
          dispatchPct: singleStagePct(workOrderEntries, 'Dispatch'),
        };
      }));
    } catch (err) {
      // Errors are surfaced, never replaced by sample rows.
      setError(err?.message || 'Failed to load production data');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Kick the load off outside the effect body: the body must not call setState
    // synchronously (react-hooks/set-state-in-effect).
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) loadTracker();
    });
    return () => { cancelled = true; };
  }, [loadTracker]);

  // ============================== FILTERING ==============================

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;

    return rows.filter((row) => {
      if (activeTab !== 'All' && row.currentStatus !== activeTab) return false;
      if (stageFilter && !((row[`${stageFilter.toLowerCase()}Pct`] || 0) > 0)) return false;
      if (from && row.orderDate && new Date(row.orderDate) < from) return false;
      if (to && row.orderDate && new Date(row.orderDate) > to) return false;
      if (!query) return true;
      return [row.workOrder, row.cpoNo, row.customer, row.currentStage, row.rawStatus]
        .some((value) => (value || '').toLowerCase().includes(query));
    });
  }, [rows, activeTab, stageFilter, dateFrom, dateTo, search]);

  const tabCounts = useMemo(() => {
    const counts = { All: rows.length };
    STATUS_TABS.forEach((tab) => {
      if (tab.key === 'All') return;
      counts[tab.key] = rows.filter((row) => row.currentStatus === tab.key).length;
    });
    return counts;
  }, [rows]);

  const kpis = useMemo(() => {
    // Cards and tabs are counted from the SAME rows — they can never disagree.
    const total = rows.length;
    const buckets = {
      NOT_STARTED: tabCounts.NOT_STARTED || 0,
      IN_PROGRESS: tabCounts.IN_PROGRESS || 0,
      COMPLETED: tabCounts.COMPLETED || 0,
      DELAYED: tabCounts.DELAYED || 0,
    };
    const pct = (value) => (total > 0 ? Math.round((value / total) * 100) : 0);
    return {
      total,
      ...buckets,
      notStartedPct: pct(buckets.NOT_STARTED),
      inProgressPct: pct(buckets.IN_PROGRESS),
      completedPct: pct(buckets.COMPLETED),
      delayedPct: pct(buckets.DELAYED),
    };
  }, [rows, tabCounts]);

  const pageRows = useMemo(
    () => filteredRows.slice(page * 10, page * 10 + 10),
    [filteredRows, page]
  );

  // ============================== HELPERS ==============================

  const calcDelay = (row) => {
    if (!row.dueDate) return null;
    const due = new Date(row.dueDate);
    const diffDays = Math.ceil((due - startOfToday()) / (1000 * 60 * 60 * 24));
    if (row.currentStatus === 'COMPLETED') return diffDays;
    return diffDays < 0 ? Math.abs(diffDays) : null;
  };

  const formatDelay = (row) => {
    if (row.currentStatus === 'COMPLETED') {
      return <span style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}>On Time</span>;
    }
    const delay = calcDelay(row);
    if (delay === null) return <span style={{ color: '#6B7280', fontSize: 12 }}>—</span>;
    return (
      <span style={{ color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
        <AlertTriangle size={12} style={{ marginRight: 2 }} />{delay} Days
      </span>
    );
  };

  const handleExport = () => {
    const exportRows = filteredRows.map((row) => ({
      'Work Order': row.workOrder,
      'CPO No': row.cpoNo,
      Customer: row.customer,
      'Order Date': row.orderDate || '',
      'Due Date': row.dueDate || '',
      'Current Stage': row.currentStage,
      Casting: `${row.castingPct || 0}%`,
      Fabrication: `${row.fabricationPct || 0}%`,
      Assembly: `${row.assemblyPct || 0}%`,
      QC: `${row.qcPct || 0}%`,
      Packing: `${row.packingPct || 0}%`,
      Dispatch: `${row.dispatchPct || 0}%`,
      'Overall Progress': `${row.progress || 0}%`,
      Status: row.currentStatus,
      'Work Order Status': row.rawStatus,
    }));
    const headers = Object.keys(exportRows[0] || {});
    const csv = [headers.join(','), ...exportRows.map((r) => headers.map((h) => `"${r[h] || ''}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'production-tracker-export.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============================== RENDER ==============================

  return (
    <div className="purchase-page cpr-page">
      {error && (
        <div className="cpr-error-banner">
          <AlertTriangle size={14} /><span>{error}</span>
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="tv-kpi-grid">
        <div className="tv-kpi-card">
          <div className="tv-kpi-icon" style={{ background: 'rgba(11,74,61,0.08)', color: '#0B4A3D' }}>
            <ClipboardList size={20} />
          </div>
          <div className="tv-kpi-content">
            <div className="tv-kpi-value">{kpis.total}</div>
            <div className="tv-kpi-label">Total Work Orders</div>
          </div>
        </div>
        <div className="tv-kpi-card">
          <div className="tv-kpi-icon" style={{ background: 'rgba(107,114,128,0.08)', color: '#6b7280' }}>
            <Clock size={20} />
          </div>
          <div className="tv-kpi-content">
            <div className="tv-kpi-value">{kpis.NOT_STARTED}</div>
            <div className="tv-kpi-label">Not Started</div>
          </div>
        </div>
        <div className="tv-kpi-card">
          <div className="tv-kpi-icon" style={{ background: 'rgba(37,99,235,0.08)', color: '#2563eb' }}>
            <BarChart3 size={20} />
          </div>
          <div className="tv-kpi-content">
            <div className="tv-kpi-value">{kpis.IN_PROGRESS}</div>
            <div className="tv-kpi-label">In Progress</div>
          </div>
        </div>
        <div className="tv-kpi-card">
          <div className="tv-kpi-icon" style={{ background: 'rgba(5,150,105,0.08)', color: '#059669' }}>
            <CheckCircle size={20} />
          </div>
          <div className="tv-kpi-content">
            <div className="tv-kpi-value">{kpis.COMPLETED}</div>
            <div className="tv-kpi-label">Completed</div>
          </div>
        </div>
        <div className="tv-kpi-card">
          <div className="tv-kpi-icon" style={{ background: 'rgba(220,38,38,0.08)', color: '#dc2626' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="tv-kpi-content">
            <div className="tv-kpi-value">{kpis.DELAYED}</div>
            <div className="tv-kpi-label">Delayed</div>
          </div>
        </div>
      </div>

      {/* Overall Progress Overview */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0B4A3D', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Overall Progress Overview
        </h3>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'Completed', pct: kpis.completedPct, color: '#059669' },
            { label: 'In Progress', pct: kpis.inProgressPct, color: '#2563eb' },
            { label: 'Not Started', pct: kpis.notStartedPct, color: '#6b7280' },
            { label: 'Delayed', pct: kpis.delayedPct, color: '#dc2626' },
          ].map((item) => (
            <div key={item.label} style={{ flex: '1 1 140px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{item.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.pct}%</span>
              </div>
              <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${item.pct}%`, background: item.color, borderRadius: 4, transition: 'width 0.3s' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status Tabs */}
      <div className="tv-division-tabs">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            className={`tv-division-tab ${activeTab === tab.key ? 'tv-division-tab-active' : ''}`}
            onClick={() => { setActiveTab(tab.key); setPage(0); }}
          >
            {tab.label}
            <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>({tabCounts[tab.key] || 0})</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="po-toolbar">
        <div className="po-toolbar-left">
          <button className={`po-btn ${showFilters ? 'po-btn-primary-outline' : 'po-btn-ghost'}`} onClick={() => setShowFilters(!showFilters)}>
            <Filter size={14} /> {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
          {showFilters && (
            <>
              <select className="tv-filter-select" value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(0); }}>
                <option value="">All Stages</option>
                {STAGES.map((s) => <option key={s.key} value={s.key.toUpperCase()}>{s.label}</option>)}
              </select>
              <input type="date" className="tv-form-input" style={{ width: 140 }} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(0); }} placeholder="From" />
              <input type="date" className="tv-form-input" style={{ width: 140 }} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(0); }} placeholder="To" />
            </>
          )}
          <div className="tv-search-input">
            <Search size={14} />
            <input
              type="text"
              placeholder="Search Work Order / CPO / Customer..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            />
          </div>
        </div>
        <div className="po-toolbar-right">
          <button className="po-btn po-btn-ghost po-btn-sm" onClick={handleExport} title="Export">
            <Download size={14} /> Export
          </button>
          <button className="po-btn po-btn-ghost po-btn-sm" onClick={loadTracker} title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0B4A3D' }}>Production Tracker</span>
          <span style={{ fontSize: 12, color: '#6B7280' }}>{filteredRows.length} records</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="po-table" style={{ minWidth: 1300 }}>
            <thead>
              <tr>
                <th>CPO No</th>
                <th>Work Order</th>
                <th>Customer</th>
                <th>Order Date</th>
                <th>Due Date</th>
                <th style={{ textAlign: 'center' }}>Casting</th>
                <th style={{ textAlign: 'center' }}>Fabrication</th>
                <th style={{ textAlign: 'center' }}>Assembly</th>
                <th style={{ textAlign: 'center' }}>QC</th>
                <th style={{ textAlign: 'center' }}>Packing</th>
                <th style={{ textAlign: 'center' }}>Dispatch</th>
                <th style={{ textAlign: 'center' }}>Overall</th>
                <th>Status</th>
                <th>Delay</th>
                <th style={{ textAlign: 'center', width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={15} className="tv-table-loading">Loading...</td></tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="tv-table-empty">
                    <ClipboardList size={32} style={{ color: '#CBD5E1' }} />
                    <span>No Production Tracker Records Found</span>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => {
                  const statusCfg = STATUS_CONFIG[row.currentStatus] || STATUS_CONFIG['NOT_STARTED'];
                  const isSelected = selectedRow?.id === row.id;
                  return (
                    <tr
                      key={row.id}
                      className={`tv-table-row ${isSelected ? 'tv-table-row-selected' : ''}`}
                      onClick={() => setSelectedRow(row)}
                    >
                      <td><span className="tv-cell-bold">{cpoNo(row.cpoNo) || row.cpoNo}</span></td>
                      <td><span className="tv-cell-bold">{row.workOrder}</span></td>
                      <td>{row.customer || '-'}</td>
                      <td style={{ fontSize: 12 }}>{row.orderDate || '-'}</td>
                      <td style={{ fontSize: 12 }}>{row.dueDate || '-'}</td>
                      {STAGES.map((s) => {
                        const pct = visibleStagePct(row[`${s.key}Pct`]);
                        return (
                          <td key={s.key} style={{ textAlign: 'center' }}>
                            {pct > 0 ? (
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                <div style={{ width: 40, height: 6, background: '#f3f4f6', borderRadius: 3, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#059669' : s.color, borderRadius: 3 }} />
                                </div>
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#374151', minWidth: 28 }}>{pct}%</span>
                              </div>
                            ) : (
                              /* No progress recorded for this stage: a dash, never an
                                 empty progress bar with "0%". */
                              <span style={{ fontSize: 12, color: '#9CA3AF' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <div style={{ width: 50, height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${row.progress || 0}%`, background: row.progress === 100 ? '#059669' : row.progress > 0 ? '#0B4A3D' : '#d1d5db', borderRadius: 4 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#0B4A3D', minWidth: 30 }}>{row.progress || 0}%</span>
                        </div>
                      </td>
                      <td><span className={statusCfg.badge}>{statusCfg.label}</span></td>
                      <td>{formatDelay(row)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="tv-actions-cell" onClick={(e) => e.stopPropagation()}>
                          <button className="tv-action-btn" onClick={() => setSelectedRow(row)} title="View">
                            <Eye size={14} />
                          </button>
                          <button className="tv-action-btn" onClick={() => setOpenActionRow(openActionRow === row.id ? null : row.id)} title="More">
                            <MoreVertical size={14} />
                          </button>
                          {openActionRow === row.id && (
                            <div className="tv-actions-menu">
                              <button onClick={() => { setSelectedRow(row); setOpenActionRow(null); }}>
                                <Eye size={13} /> View
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
        {/* Pagination */}
        {filteredRows.length > 10 && (
          <div className="tv-pagination">
            <div className="tv-pagination-btns">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <span className="tv-pagination-page">{page + 1}</span>
              <button disabled={pageRows.length < 10} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Stage Descriptions */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginTop: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: '#0B4A3D', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Stage Descriptions
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {STAGES.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + '10', color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon size={16} />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1f2937' }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: '#6B7280', lineHeight: 1.4 }}>{s.desc}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail Panel Modal — read-only: every value comes from the Work Order. */}
      {selectedRow && (
        <TrackerDetailPanel
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          formatDelay={formatDelay}
        />
      )}
    </div>
  );
}

// ============================== DETAIL PANEL ==============================

function TrackerDetailPanel({ row, onClose, formatDelay }) {
  const statusCfg = STATUS_CONFIG[row.currentStatus] || STATUS_CONFIG['NOT_STARTED'];

  return (
    <div className="tv-modal-overlay" onClick={onClose}>
      <div className="tv-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 700 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 className="tv-modal-title">{row.workOrder}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span className={statusCfg.badge}>{statusCfg.label}</span>
              <span style={{ fontSize: 12, color: '#6B7280' }}>{row.customer}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="po-btn po-btn-ghost po-btn-sm" onClick={onClose}>&times;</button>
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 12 }}>
          <div><span style={{ color: '#6B7280' }}>CPO No:</span> <span style={{ fontWeight: 600 }}>{cpoNo(row.cpoNo) || row.cpoNo}</span></div>
          <div><span style={{ color: '#6B7280' }}>Order Date:</span> <span style={{ fontWeight: 600 }}>{row.orderDate || '-'}</span></div>
          <div><span style={{ color: '#6B7280' }}>Due Date:</span> <span style={{ fontWeight: 600 }}>{row.dueDate || '-'}</span></div>
          <div><span style={{ color: '#6B7280' }}>Delay:</span> <span style={{ marginLeft: 4 }}>{formatDelay(row)}</span></div>
          <div><span style={{ color: '#6B7280' }}>Current Stage:</span> <span style={{ fontWeight: 600 }}>{row.currentStage}</span></div>
          <div><span style={{ color: '#6B7280' }}>Work Order Status:</span> <span style={{ fontWeight: 600 }}>{row.rawStatus}</span></div>
          <div><span style={{ color: '#6B7280' }}>Overall Progress:</span> <span style={{ fontWeight: 700, color: '#0B4A3D' }}>{row.progress || 0}%</span></div>
          <div><span style={{ color: '#6B7280' }}>Production Type:</span> <span style={{ fontWeight: 600 }}>{row.productionType || '-'}</span></div>
        </div>

        {/* Stage Progress */}
        <h4 style={{ fontSize: 12, fontWeight: 700, color: '#0B4A3D', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Stage Progress</h4>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
          {STAGES.map((s) => {
            const pct = row[`${s.key}Pct`] || 0;
            return (
              <div key={s.key} style={{ padding: '8px 10px', background: '#f9fafb', borderRadius: 8, border: '1px solid #f3f4f6' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>{s.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{pct}%</span>
                </div>
                <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#059669' : s.color, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 11, color: '#6B7280' }}>
          Read-only view of the live Production Orders data. Update the Work Order in
          Production → Production Work Orders and refresh here.
        </div>
      </div>
    </div>
  );
}
