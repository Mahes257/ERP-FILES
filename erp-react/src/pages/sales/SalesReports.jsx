import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart3, CalendarDays, ChartBarStacked, ChevronRight, Download,
  FileText, IndianRupee, ListChecks, PackageCheck, Receipt,
  RotateCcw, RefreshCw, FileSpreadsheet, Filter, Search, Calendar, ChevronDown
} from 'lucide-react';
import salesReportService from '../../services/salesReportService';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import { BarChart, DoughnutChart } from '../../components/SalesCharts/SalesMiniCharts';
import { SortIcon, useToast } from '../../components/Common';
import { formatDate, formatINR } from '../../utils/leadHelpers';
import { pdfSafe } from '../../utils/pdfText';
import useClickOutside from '../../hooks/useClickOutside';
import '../crm/crm-erp.css';
import '../../styles/cpr-list.css';
import './sales-dashboard.css';
import './sales-reports.css';

/* ===== HELPERS ===== */
function parseList(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

function SortHead({ field, sortField, sortDir, onSort, children }) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      style={{ cursor: 'pointer', userSelect: 'none' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center' }}>
        {children}
        <SortIcon active={active} />
      </span>
    </th>
  );
}

function ReportCard({ icon: Icon, iconColor, title, subtitle, action, children }) {
  return (
    <div className="prm-card srp-mb-xl">
      <div className="prm-card-header" style={{ padding: '15px 18px', borderBottom: '1px solid #F3F4F6' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#111827', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon size={15} style={{ color: iconColor || '#0B4A3D' }} />
            {title}
          </h3>
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

/** Local substitute for the PR-project PurchaseSectionCard — mirrors its
 *  API surface (title / subtitle / action / icon / children) using the same
 *  .prm-card / .prm-card-header / .prm-card-body classes the ERP already uses
 *  elsewhere (e.g. Documents, CRM). Kept local so SalesReports does not depend
 *  on the separate sri/PR purchase component tree.
 *
 *  `icon` is a ready-made JSX ELEMENT (e.g. <CalendarDays size={16} />) — every
 *  call site in this file passes a styled element, so it is rendered as-is.
 *  Rendering it as a component (<SectionIcon />) crashes with
 *  "Element type is invalid ... got: [object Object]".
 */
function SectionCard({ title, subtitle, action, icon, children, className = '' }) {
  return (
    <section className={`prm-card ${className}`}>
      {(title || action) && (
        <div className="prm-card-header">
          <div className="min-w-0">
            <h3>
              {icon}
              {title}
            </h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="prm-card-body">{children}</div>
    </section>
  );
}

/* PR ReportFilters pattern: preset date ranges with optional custom
   from/to — presets are computed from today, Sales-only. */
const DATE_PRESETS = [
  { value: 'all', label: 'All Time' },
  { value: 'this-month', label: 'This Month' },
  { value: 'last-30-days', label: 'Last 30 Days' },
  { value: 'last-90-days', label: 'Last 90 Days' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

const isoDate = (d) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function presetRange(preset) {
  const today = new Date();
  if (preset === 'this-month') return { from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), to: '' };
  if (preset === 'last-30-days') return { from: isoDate(new Date(today.getTime() - 29 * 86400000)), to: '' };
  if (preset === 'last-90-days') return { from: isoDate(new Date(today.getTime() - 89 * 86400000)), to: '' };
  if (preset === 'this-year') return { from: isoDate(new Date(today.getFullYear(), 0, 1)), to: '' };
  return { from: '', to: '' };
}

/* PR "Spend by Category" pattern — ranked rows with gradient progress
   bars, used for the Sales module value breakdown. */
function ModuleValueBars({ rows }) {
  const max = rows[0]?.amount || 1;
  return (
    <div className="srp-bar-list">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="srp-bar-row">
            <span className="srp-bar-label">{row.label}</span>
            <span className="srp-bar-value">
              {formatINR(row.amount)} · {row.count} record{row.count !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="srp-bar-track">
            <div
              className="srp-bar-fill"
              style={{ width: `${Math.min(100, (row.amount / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/* Get date range from preset */
function getDateRange(preset) {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  switch (preset) {
    case 'last-12-months':
      return { start: isoDate(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())), end: '' };
    case 'last-6-months':
      return { start: isoDate(new Date(today.getFullYear(), today.getMonth() - 6, today.getDate())), end: '' };
    case 'this-month':
      return { start: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), end: '' };
    case 'last-30-days':
      return { start: isoDate(new Date(today.getTime() - 29 * 86400000)), end: '' };
    case 'last-90-days':
      return { start: isoDate(new Date(today.getTime() - 89 * 86400000)), end: '' };
    case 'this-year':
      return { start: isoDate(new Date(today.getFullYear(), 0, 1)), end: '' };
    case 'all':
      return { start: '', end: '' };
    default:
      return { start: '', end: '' };
  }
}

/* PR chart empty state — icon tile + title + guidance message. */
function ChartEmpty({ message }) {
  return (
    <div className="srp-state srp-state--compact">
      <span className="srp-state-icon">
        <ChartBarStacked size={28} aria-hidden="true" />
      </span>
      <p className="srp-state-title">No data for the selected range</p>
      <p className="srp-state-text">{message}</p>
    </div>
  );
}

/* ===== ReportFilters Component (PR pattern) ===== */
const DATE_RANGES = [
  { value: 'last-12-months', label: 'Last 12 Months' },
  { value: 'last-6-months', label: 'Last 6 Months' },
  { value: 'last-90-days', label: 'Last 90 Days' },
  { value: 'last-30-days', label: 'Last 30 Days' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
];

function FilterSelect({ label, value, onChange, options = [], placeholder = 'All' }) {
  return (
    <div className="prm-filter-group" style={{ minWidth: 160 }}>
      <label className="prm-filter-label">{label}</label>
      <div className="srp-icon-field">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="prm-filter-select"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown size={12} aria-hidden="true" />
      </div>
    </div>
  );
}

function ReportFilters({ filters: externalFilters, onApply, onReset, loading = false, filterOptions = {} }) {
  const [local, setLocal] = useState(() => externalFilters ? { ...externalFilters } : { dateRange: 'last-12-months', from: '', to: '' });
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (externalFilters) {
      setLocal((prev) => {
        const next = { ...prev, ...externalFilters };
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    }
  }, [externalFilters]);

  const set = useCallback((key, val) => {
    setLocal((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleApply = useCallback(() => {
    onApply?.(local);
  }, [local, onApply]);

  const handleReset = useCallback(() => {
    setLocal({ dateRange: 'last-12-months', from: '', to: '' });
    onReset?.();
  }, [onReset]);

  const activeFilterCount = 0; // We only have date range filter for now

  return (
    <div className="prm-filters">
      <div className="srp-filters-row">
        <div className="prm-filter-group" style={{ minWidth: 180 }}>
          <label className="prm-filter-label">Date Range</label>
          <div className="srp-icon-field">
            <select
              value={local.dateRange}
              onChange={(e) => set('dateRange', e.target.value)}
              className="prm-filter-select"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <Calendar size={13} aria-hidden="true" />
          </div>
        </div>

        {local.dateRange === 'custom' && (
          <>
            <div className="prm-filter-group" style={{ minWidth: 150 }}>
              <label className="prm-filter-label">From</label>
              <input
                type="date"
                value={local.from}
                onChange={(e) => set('from', e.target.value)}
                className="prm-filter-input"
              />
            </div>
            <div className="prm-filter-group" style={{ minWidth: 150 }}>
              <label className="prm-filter-label">To</label>
              <input
                type="date"
                value={local.to}
                onChange={(e) => set('to', e.target.value)}
                className="prm-filter-input"
              />
            </div>
          </>
        )}

        <div className="srp-filters-actions">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="po-btn po-btn-ghost po-btn-sm"
            aria-expanded={showAdvanced}
          >
            <Search size={14} aria-hidden="true" />
            More Filters
            {activeFilterCount > 0 && (
              <span className="srp-filter-badge">{activeFilterCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="po-btn po-btn-primary po-btn-sm"
          >
            Apply
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="po-btn po-btn-ghost po-btn-sm po-btn-icon"
            title="Reset filters"
            aria-label="Reset filters"
          >
            <RotateCcw size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="po-btn po-btn-ghost po-btn-sm po-btn-icon"
            title="Refresh report"
            aria-label="Refresh report"
          >
            <RefreshCw size={14} className={loading ? 'srp-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {showAdvanced && (
        <div className="srp-advanced-row">
          <FilterSelect label="Module" value={local.module} onChange={(v) => set('module', v)} options={filterOptions.modules || []} />
        </div>
      )}
    </div>
  );
}

const MODULE_KEY_BY_LABEL = {
  'Quotations': 'quotations',
  'Sales Contracts': 'salesContracts',
  'Customer Purchase Orders': 'salesOrders',
  'Proforma Invoices': 'proformaInvoices',
  'Delivery Challans': 'deliveryChallans',
  'Invoices': 'invoices',
  'Credit Notes': 'creditNotes',
  'Payment Receipts': 'paymentReceipts',
};

const MODULE_OPTIONS = Object.keys(MODULE_KEY_BY_LABEL);

/* ===== SALES REPORTS PAGE ===== */
export default function SalesReports() {
  const navigate = useNavigate();
  const toast = useToast();
  const exportRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const [reportData, setReportData] = useState({
    records: [],
    kpis: null,
    monthlyTrend: null,
    statusDistribution: null,
    moduleBreakdown: null,
    totalRecords: 0,
  });

  // Filters (PR ReportFilters pattern: preset + custom range + module)
  const [filters, setFilters] = useState({ dateRange: 'last-12-months' });
  const [filterOptions, setFilterOptions] = useState({});
  const [activeModule, setActiveModule] = useState('all');
  const [sortField, setSortField] = useState('_date');
  const [sortDir, setSortDir] = useState('desc');
  const [exportOpen, setExportOpen] = useState(false);
  useClickOutside(exportRef, () => setExportOpen(false));

  // Fetch all sales module data + filter options.
  // NOTE: the fetch is mounted/unmounted via a ref so the load callback (which
  // has no dependency on the effect's local scope) can safely check whether the
  // component is still mounted before resolving `loading`.
  const mountedRef = useRef(true);

  const load = useCallback(async (filterParams = {}, activeModuleKey = 'all') => {
    setLoading(true);
    setApiError(null);
    try {
      // Compute date params from filter state
      const params = {};
      const dateRange = filterParams.dateRange || 'last-12-months';
      if (dateRange === 'custom') {
        if (filterParams.from) params.dateFrom = filterParams.from;
        if (filterParams.to) params.dateTo = filterParams.to;
      } else if (dateRange !== 'all') {
        const range = getDateRange(dateRange);
        if (range.start) params.dateFrom = range.start;
        if (range.end) params.dateTo = range.end;
      }
      // Module scope: KPI-card selection wins; the More Filters module
      // dropdown is the manual fallback. Both path through the same
      // backend `module` param so date/status/client filters intersect.
      const moduleKey = activeModuleKey && activeModuleKey !== 'all'
        ? activeModuleKey
        : (filterParams.module && filterParams.module !== 'all'
          ? (MODULE_KEY_BY_LABEL[filterParams.module] || filterParams.module)
          : null);
      if (moduleKey) params.module = moduleKey;
      if (filterParams.status) params.status = filterParams.status;
      if (filterParams.client) params.client = filterParams.client;

      const result = await salesReportService.getReport(params);
      if (!mountedRef.current) return;

      // result is ApiResponse: { success, message, data: { records, kpis, ... } }
      const payload = result?.data || result || {};
      setReportData({
        records: Array.isArray(payload.records) ? payload.records : [],
        kpis: payload.kpis || null,
        monthlyTrend: payload.monthlyTrend || null,
        statusDistribution: payload.statusDistribution || null,
        moduleBreakdown: payload.moduleBreakdown || null,
        totalRecords: payload.totalRecords || 0,
      });
      // Build filterOptions from available module keys
      setFilterOptions({ modules: MODULE_OPTIONS });
    } catch (err) {
      console.error('SalesReports API error:', err?.config?.url, err?.response?.status, err?.message || err);
      if (!mountedRef.current) return;
      setApiError(err?.response?.data?.message || err?.message || 'Failed to load report data');
      setReportData({ records: [], kpis: null, monthlyTrend: null, statusDistribution: null, moduleBreakdown: null, totalRecords: 0 });
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    load(filters, activeModule);
    return () => { mountedRef.current = false; };
  }, [load, filters, activeModule]);

  const applyFilters = useCallback((f) => {
    // A module explicitly chosen in More Filters is promoted to the same
    // activeModule state that the KPI cards drive, so the card highlight,
    // Module Scope tile and the fetched dataset can never disagree, and
    // toggling the KPI card off cannot resurrect a stale dropdown label.
    // The dropdown itself resets to All — activeModule is the single owner
    // of the module scope. An empty/All dropdown keeps the current KPI.
    if (f.module && f.module !== 'all') {
      setActiveModule(MODULE_KEY_BY_LABEL[f.module] || f.module);
      setFilters({ ...f, module: '' });
    } else {
      setFilters(f);
    }
  }, []);
  const resetFilters = useCallback(() => {
    setFilters({ dateRange: 'last-12-months' });
    setActiveModule('all');
  }, []);

  /* KPI card click → module scope. 'totalRecords' / 'totalValue' are
     headline cards, not modules: they clear the module filter. Clicking
     the active module card again also clears it. Date/status/client
     filters are intentionally preserved so a KPI click narrows the
     already-filtered dataset instead of resetting it. */
  const handleKpiSelect = useCallback((key) => {
    setActiveModule((current) => {
      if (key === 'totalRecords' || key === 'totalValue' || key === current) return 'all';
      return key;
    });
  }, []);

  /* ===== FLATTENED & FILTERED RECORDS ===== */
  const allRecords = useMemo(() => {
    const modules = [
      { key: 'quotations', label: 'Quotations' },
      { key: 'salesContracts', label: 'Sales Contracts' },
      { key: 'salesOrders', label: 'Customer Purchase Orders' },
      { key: 'proformaInvoices', label: 'Proforma Invoices' },
      { key: 'deliveryChallans', label: 'Delivery Challans' },
      { key: 'invoices', label: 'Invoices' },
      { key: 'creditNotes', label: 'Credit Notes' },
      { key: 'paymentReceipts', label: 'Payment Receipts' }
    ];

    // Backend already provides filtered, flattened records with _module, _moduleKey, _date, _amount, _no, _route, status, clientName
    const records = reportData.records || [];

    // Sort
    const sorted = [...records].sort((a, b) => {
      let va = a[sortField] ?? '';
      let vb = b[sortField] ?? '';
      if (sortField === '_amount') {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      return va < vb ? (sortDir === 'asc' ? -1 : 1) : va > vb ? (sortDir === 'asc' ? 1 : -1) : 0;
    });

    return { modules, all: records, filtered: sorted };
  }, [reportData.records, sortField, sortDir]);

  /* ===== KPI CARDS ===== */
  const kpis = useMemo(() => {
    // Use backend-computed KPIs when available
    if (reportData.kpis) {
      const bk = reportData.kpis;
      return {
        totalRecords: bk.totalRecords ?? allRecords.filtered.length,
        totalAmount: bk.totalValue != null ? Number(bk.totalValue) : allRecords.filtered.reduce((s, r) => s + r._amount, 0),
        moduleCounts: {
          quotations: bk.quotationCount ?? 0,
          salesContracts: bk.contractCount ?? 0,
          salesOrders: bk.cpoCount ?? 0,
          invoices: bk.invoiceCount ?? 0,
        },
        moduleAmounts: {}
      };
    }
    // Fallback: compute from filtered records
    const filtered = allRecords.filtered;
    const totalRecords = filtered.length;
    const totalAmount = filtered.reduce((s, r) => s + r._amount, 0);
    const moduleCounts = {};
    allRecords.modules.forEach((m) => {
      moduleCounts[m.key] = filtered.filter((r) => r._moduleKey === m.key).length;
    });
    const moduleAmounts = {};
    allRecords.modules.forEach((m) => {
      moduleAmounts[m.key] = filtered.filter((r) => r._moduleKey === m.key).reduce((s, r) => s + r._amount, 0);
    });
    return { totalRecords, totalAmount, moduleCounts, moduleAmounts };
  }, [allRecords, reportData.kpis]);

  /* ===== CHART DATA ===== */
  const monthlyChart = useMemo(() => {
    // Use backend-computed monthly trend when available
    if (reportData.monthlyTrend?.labels?.length) {
      return {
        labels: reportData.monthlyTrend.labels,
        data: reportData.monthlyTrend.counts || reportData.monthlyTrend.labels.map(() => 0)
      };
    }
    // Fallback: compute from filtered records
    const map = {};
    allRecords.filtered.forEach((r) => {
      if (!r._date) return;
      const m = r._date.substring(0, 7);
      map[m] = (map[m] || 0) + 1;
    });
    const labels = Object.keys(map).sort();
    return { labels: labels.length ? labels : ['No Data'], data: labels.map((k) => map[k]) };
  }, [allRecords, reportData.monthlyTrend]);

  const statusChart = useMemo(() => {
    // Use backend-computed status distribution when available
    if (reportData.statusDistribution?.labels?.length) {
      return {
        labels: reportData.statusDistribution.labels,
        data: reportData.statusDistribution.counts || reportData.statusDistribution.labels.map(() => 0)
      };
    }
    // Fallback: compute from filtered records
    const map = {};
    allRecords.filtered.forEach((r) => {
      const s = r.status || 'Draft';
      map[s] = (map[s] || 0) + 1;
    });
    const labels = Object.keys(map);
    return { labels: labels.length ? labels : ['No Data'], data: labels.map((k) => map[k]) };
  }, [allRecords, reportData.statusDistribution]);

  /* ===== SORT ===== */
  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  };

  /* ===== EXPORT CSV ===== */
  const exportCSV = () => {
    if (!allRecords.filtered.length) { toast.warning('No data'); return; }
    const header = 'Module,Date,Document No,Status,Amount';
    const rows = allRecords.filtered.map((r) =>
      `${r._module},${r._date},${r._no},${r.status || 'Draft'},${r._amount}`
    );
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Sales_Report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Report exported as CSV');
  };

  /* ===== EXPORT PDF ===== */
  const exportPDF = async () => {
    setExportOpen(false);
    if (!allRecords.filtered.length) { toast.warning('No data'); return; }
    try {
      const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
      doc.setFontSize(16);
      doc.setTextColor(3, 47, 37);
      doc.text('Sales Report', 40, 40);
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139);
      doc.text(pdfSafe(`Generated on ${new Date().toISOString().slice(0, 10)} - ${allRecords.filtered.length} records`), 40, 55);
      // pdfSafe keeps the rupee sign out of the PDF's built-in font (it used to
      // render as a placeholder and spread the amount's digits apart); Amount is
      // right aligned under its header.
      autoTable(doc, {
        startY: 70,
        head: [['Module', 'Date', 'Document No', 'Status', 'Amount']],
        body: allRecords.filtered.map((r) => [
          pdfSafe(r._module),
          pdfSafe(r._date),
          pdfSafe(r._no),
          pdfSafe(r.status || 'Draft'),
          pdfSafe(formatINR(r._amount))
        ]),
        styles: { fontSize: 8, cellPadding: 4, textColor: [30, 41, 59], valign: 'top', lineWidth: 0.2, lineColor: [226, 232, 240] },
        headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: { 4: { halign: 'right' } },
        didParseCell: (data) => {
          if (data.section === 'head' && data.column.index === 4) data.cell.styles.halign = 'right';
        },
        margin: { top: 70, bottom: 30 }
      });
      doc.save(`Sales_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success('Report exported as PDF');
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  const filteredCount = allRecords.filtered.length;
  const totalCount = allRecords.all.length;

  /* Summary band — PR "Financial Summary" tile pattern (all values derived
     from the existing Sales records; nothing invented). */
  const summaryTiles = useMemo(() => {
    const filteredValue = allRecords.filtered.reduce((s, r) => s + r._amount, 0);
    const activeModuleLabel = activeModule === 'all'
      ? `All Modules (${allRecords.modules.length})`
      : (allRecords.modules.find((m) => m.key === activeModule)?.label || '—');
    return [
      { label: 'Records (filtered)', value: String(filteredCount), color: '#0B4A3D' },
      { label: 'Filtered Value', value: formatINR(filteredValue), color: '#059669' },
      { label: 'Avg Record Value', value: filteredCount > 0 ? formatINR(Math.round(filteredValue / filteredCount)) : '—', color: '#0891B2' },
      { label: 'Module Scope', value: activeModuleLabel, color: '#4F46E5' },
    ];
  }, [allRecords, filteredCount, activeModule]);

  /* Module breakdown rows for the PR "Spend by Category" ranked-bar card. */
  const moduleValueRows = useMemo(() => {
    // Use backend-computed module breakdown when available
    if (reportData.moduleBreakdown?.breakdown?.length) {
      return reportData.moduleBreakdown.breakdown.map((b) => ({
        label: b.label,
        count: b.count || 0,
        amount: Number(b.amount) || 0,
      }));
    }
    // Fallback: compute from filtered records
    return allRecords.modules
      .map((m) => ({ label: m.label, count: kpis.moduleCounts[m.key] || 0, amount: kpis.moduleAmounts[m.key] || 0 }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [allRecords, kpis, reportData.moduleBreakdown]);  const chartsEmpty = filteredCount === 0;

  // Loading with no data yet — show a spinner plus a clear retry path.
  if (loading) {
    return (
      <div className="srp-state">
        <RefreshCw size={28} className="srp-spin" aria-hidden="true" />
        <span style={{ fontSize: 13 }}>Loading sales records…</span>
      </div>
    );
  }

  // Loading finished but the backend returned no records. Show a helpful state
  // instead of an empty grid; the user can still use the date-range filter or
  // retry by refreshing the page. Keep the header + filters so the UI still
  // feels complete.
  if (totalCount === 0) {
    return (
      <div className="purchase-page cpr-page">
        <div className="cpr-page-static-header">
          <nav className="pr-breadcrumb" aria-label="Breadcrumb">
            <button className="bc-link" onClick={() => navigate('/dashboard')}>VISHAK TECH</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <span className="bc-current">Sales Reports</span>
          </nav>
          <div className="pr-page-header">
            <div className="pr-page-header-title">
              <h1><BarChart3 size={22} /> Sales Reports</h1>
              <p className="po-page-header-subtitle">Comprehensive analytics across all sales modules — quotations, contracts, orders, invoices and more.</p>
            </div>
            <div className="pr-page-header-actions">
              <button
                type="button"
                onClick={() => load(filters, activeModule)}
                className="po-btn po-btn-ghost po-btn-sm"
                aria-label="Retry loading report data"
              >
                <RefreshCw size={14} /> Retry
              </button>
            </div>
          </div>
        </div>
        <div className="cpr-page-scroll-content">
          <ReportFilters
            filters={filters}
            onApply={applyFilters}
            onReset={resetFilters}
            loading={loading}
            filterOptions={filterOptions}
          />
          {apiError ? (
            <div className="srp-state srp-state--compact">
              <span className="srp-state-icon srp-state-icon--error">
                <BarChart3 size={32} aria-hidden="true" />
              </span>
              <p className="srp-state-title srp-state-title--error">Failed to load report data</p>
              <p className="srp-state-text srp-state-text--error">{apiError}</p>
            </div>
          ) : (
            <div className="srp-state srp-state--compact">
              <span className="srp-state-icon">
                <BarChart3 size={32} aria-hidden="true" />
              </span>
              <p className="srp-state-title">No sales records found</p>
              <p className="srp-state-text">
                {filterOptions.modules && filterOptions.modules.length > 0
                  ? 'No records match the current filters. Try resetting the date range or module filter.'
                  : 'Sales records appear here once quotations, contracts, orders, invoices or other sales documents exist.'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="purchase-page cpr-page">
      {/* Static header (breadcrumb + page header) — never scrolls */}
      <div className="cpr-page-static-header">
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <button className="bc-link" onClick={() => navigate('/dashboard')}>VISHAK TECH</button>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
          <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
          <span className="bc-current">Sales Reports</span>
        </nav>

        <div className="pr-page-header">
          <div className="pr-page-header-title">
            <h1><BarChart3 size={22} /> Sales Reports</h1>
            <p className="po-page-header-subtitle">Comprehensive analytics across all sales modules — quotations, contracts, orders, invoices and more.</p>
          </div>
          <div className="pr-page-header-actions">
            <button
              type="button"
              onClick={() => load(filters, activeModule)}
              className="po-btn po-btn-ghost po-btn-sm"
              aria-label="Refresh report data"
            >
              <RefreshCw size={14} /> Refresh
            </button>
            <div className="relative" ref={exportRef}>
              <button
                type="button"
                className="po-btn po-btn-ghost po-btn-sm"
                onClick={() => setExportOpen((p) => !p)}
              >
                <Download size={14} /> Export
              </button>
              {exportOpen && (
                <div className="po-dropdown-menu">
                  <button type="button" onClick={exportPDF} className="po-dropdown-item">
                    <FileText size={14} /> Export to PDF
                  </button>
                  <button type="button" onClick={exportCSV} className="po-dropdown-item">
                    <FileSpreadsheet size={14} /> Export to CSV
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable content area */}
      <div className="cpr-page-scroll-content">

        <ReportFilters
          filters={filters}
          onApply={applyFilters}
          onReset={resetFilters}
          loading={loading}
          filterOptions={filterOptions}
        />
      {loading && totalCount > 0 && (
        <div aria-label="Loading sales reports" aria-busy="true" className="srp-mb-lg">
          <div className="pr-kpi-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="pr-kpi-card qtn-kpi-card">
                <span className="qtn-kpi-icon sd-skeleton sd-skeleton-icon" aria-hidden="true" />
                <div className="qtn-kpi-body">
                  <div className="sd-skeleton sd-skeleton-num" aria-hidden="true" />
                  <div className="sd-skeleton sd-skeleton-label" aria-hidden="true" />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 }} className="qpo-report-charts">
            <div className="sd-skeleton-panel" style={{ height: 280 }} />
            <div className="sd-skeleton-panel" style={{ height: 280 }} />
          </div>
          <div className="sd-skeleton-panel" style={{ marginTop: 16, height: 220 }} />
        </div>
      )}

      {!loading && (
        <>
          {/* ===== KPI CARDS — Documents white-card pattern =====
              Per-card click filters the whole report to that module
              (same SalesKpiCards convention as the Sales list page):
              clicking the active card again — or "Total Records" —
              clears the module filter and restores the full scope. */}
          <SalesKpiCards
            gridClassName="pr-kpi-grid srp-mb-xl"
            cards={[
              { key: 'totalRecords', label: 'Total Records', value: kpis.totalRecords },
              { key: 'totalValue', label: 'Total Value', value: formatINR(kpis.totalAmount), color: '#059669' },
              { key: 'quotations', label: 'Quotations', value: kpis.moduleCounts.quotations || 0, color: '#0B4A3D' },
              { key: 'salesContracts', label: 'Sales Contracts', value: kpis.moduleCounts.salesContracts || 0, color: '#4F46E5' },
              { key: 'salesOrders', label: 'CPOs', value: kpis.moduleCounts.salesOrders || 0, color: '#0891B2' },
              { key: 'invoices', label: 'Invoices', value: kpis.moduleCounts.invoices || 0, color: '#7C3AED' },
            ]}
            activeKpi={activeModule}
            onSelect={handleKpiSelect}
          />

          {/* ===== SUMMARY BAND — white-card tiles ===== */}
          <div className="pr-kpi-grid" style={{ marginBottom: 18 }}>
            {summaryTiles.map((t) => (
              <div key={t.label} className="pr-kpi-card qtn-kpi-card" title={t.value}>
                <div className="qtn-kpi-body">
                  <div className="qtn-kpi-count" style={{ color: t.color }}>{t.value}</div>
                  <div className="qtn-kpi-label">{t.label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ===== CHARTS — PR chart-card pattern (subtitle + empty state) ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18 }} className="qpo-report-charts">
            <SectionCard
              title="Records by Month"
              subtitle="Document volume grouped by month for the current filter"
              icon={<CalendarDays size={16} style={{ color: '#0B4A3D' }} />}
              action={<span className="po-badge po-badge-gray">{filteredCount} records</span>}
            >
              <div style={{ padding: '16px 20px' }}>
                {chartsEmpty
                  ? <ChartEmpty message="Adjust the date range or module filter to see document volume. Records appear here as soon as they are created." />
                  : <BarChart labels={monthlyChart.labels} data={monthlyChart.data} />}
              </div>
            </SectionCard>
            <SectionCard
              title="Status Distribution"
              subtitle="Share of document statuses across the current filter"
              icon={<FileText size={16} style={{ color: '#7C3AED' }} />}
            >
              <div style={{ padding: '16px 20px' }}>
                {chartsEmpty
                  ? <ChartEmpty message="Status breakdown appears once records match the selected filters." />
                  : <DoughnutChart labels={statusChart.labels} data={statusChart.data} />}
              </div>
            </SectionCard>
          </div>

          {/* ===== MODULE BREAKDOWN — PR "Spend by Category" ranked-bar pattern ===== */}
          <SectionCard
            title="Module Breakdown"
            subtitle="Total value and record count per sales module"
            icon={<BarChart3 size={16} style={{ color: '#0B4A3D' }} />}
            action={<span className="po-badge po-badge-blue">{formatINR(kpis.totalAmount)} total</span>}
          >
            <div style={{ padding: '16px 20px' }}>
              {moduleValueRows.length === 0
                ? <ChartEmpty message="Module values appear once records match the selected filters." />
                : <ModuleValueBars rows={moduleValueRows} />}
            </div>
          </SectionCard>

          {/* ===== RECORDS TABLE ===== */}
          <div className="pr-table-card">
            <div className="pr-table-wrap">
              <table className="pr-table" style={{ minWidth: 900 }}>
                <thead>
                  <tr>
                    <SortHead field="_module" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Module</SortHead>
                    <SortHead field="_date" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Date</SortHead>
                    <SortHead field="_no" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Document No</SortHead>
                    <th>Customer</th>
                    <SortHead field="_amount" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Amount</SortHead>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {allRecords.filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '48px 20px', color: '#9CA3AF' }}>
                        No records found matching your criteria
                      </td>
                    </tr>
                  ) : (
                    allRecords.filtered.map((r, idx) => (
                      <tr
                        key={`${r._moduleKey}-${r.id}-${idx}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => navigate(r._route)}
                      >
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                            background: '#E8F0EE', color: '#0B4A3D'
                          }}>
                            {r._module}
                          </span>
                        </td>
                        <td style={{ color: '#6B7280' }}>{formatDate(r._date)}</td>
                        <td style={{ fontWeight: 600, color: '#0B4A3D' }}>{r._no || '—'}</td>
                        <td>{r.clientName || r.customerName || r.businessName || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                          {formatINR(r._amount)}
                        </td>
                        <td>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
                            ...(String(r.status || '').toLowerCase() === 'approved' || String(r.status || '').toLowerCase() === 'active'
                              ? { background: '#E8F0EE', color: '#08785F' }
                              : String(r.status || '').toLowerCase() === 'rejected' || String(r.status || '').toLowerCase() === 'cancelled'
                                ? { background: '#FEF2F2', color: '#DC2626' }
                                : String(r.status || '').toLowerCase() === 'pending' || String(r.status || '').toLowerCase() === 'draft'
                                  ? { background: '#FFFBEB', color: '#D97706' }
                                  : { background: '#F3F4F6', color: '#6B7280' })
                          }}>
                            {r.status || 'Draft'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination footer */}
            <div className="vt-pagination">
              <div className="vt-pagination-left">
                <span className="vt-pg-info">
                  Showing {filteredCount === 0 ? '0' : '1'}-{filteredCount} of {filteredCount} records
                </span>
              </div>
              <div className="vt-pagination-right">
                <span style={{ fontSize: 12, color: '#9CA3AF' }}>
                  Total value: <strong style={{ color: '#0B1F1A' }}>
                    {formatINR(allRecords.filtered.reduce((s, r) => s + r._amount, 0))}
                  </strong>
                </span>
              </div>
            </div>
          </div>
        </>
      )}
      </div> {/* cpr-page-scroll-content */}
    </div>
  );
}
