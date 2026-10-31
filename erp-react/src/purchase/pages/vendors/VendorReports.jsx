/**
 * purchase/pages/vendors/VendorReports.jsx
 * ------------------------------------------------------------------
 * Vendor Reports — six tabbed vendor reports derived from the mock
 * vendor service (backend-ready: same records flow through the
 * vendorService facade when the API is reachable).
 *
 *   Vendor Spend · Vendor Performance · Vendor Approval ·
 *   Vendor Category · GST Report · Vendor Activity
 *
 * Enterprise reporting surface: KPI strip, search + date-range
 * toolbar, per-tab summary cards, per-report trend chart (spend),
 * drilldown links to vendor profiles and Export Excel / Export PDF /
 * Export CSV / Print / Schedule Report actions. Mirrors the Purchase
 * Reports layout (PurchaseHeader + KPI cards + section cards).
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, CalendarRange, Clock3, Download, FileDown, FileSpreadsheet, FileText,
  History, IndianRupee, PieChart, Printer, RefreshCw, ShieldCheck, Star,
  TrendingUp, UserCheck, UserX, Users, X
} from 'lucide-react';
import { useToast } from '../../components/ui';
import Tabs from '../../components/ui/Tabs';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchaseKpiCards from '../../components/PurchaseKpiCards';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseMiniBarChart from '../../components/PurchaseMiniBarChart';
import {
  PurchaseToolbar,
  PurchaseSearch,
  PurchaseTable,
  PurchasePagination,
  PurchaseEmptyState,
  PurchaseStatusCell
} from '../../components/list';
import { vendorService } from '../../services/vendor';
import { VENDOR_STATUS } from '../../constants';
import { formatAmount } from '../../utils/purchase';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { isPreferredVendor } from '../../utils/vendorMetrics';
import { exportCsv, exportExcel, exportPdf, printTable } from '../../utils/export';
import ModuleTabNav from '../../components/ModuleTabNav';
import '../../styles/cpr-list.css';
import '../../styles/requisition-list-polish.css';
import '../../styles/vendor-reports.css';

import usePurchaseAccess from '../../access/usePurchaseAccess';
const REPORTS = [
  { key: 'spend', label: 'Vendor Spend', icon: IndianRupee },
  { key: 'performance', label: 'Vendor Performance', icon: TrendingUp },
  { key: 'approval', label: 'Vendor Approval', icon: UserCheck },
  { key: 'category', label: 'Vendor Category', icon: PieChart },
  { key: 'gst', label: 'GST Report', icon: FileText },
  { key: 'activity', label: 'Vendor Activity', icon: History }
];

const KPI_CARDS = [
  { key: 'total', label: 'Total Vendors', icon: Building2, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
  { key: 'approved', label: 'Approved', icon: ShieldCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
  { key: 'pending', label: 'Pending', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
  { key: 'blocked', label: 'Blocked', icon: UserX, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
  { key: 'preferred', label: 'Preferred', icon: Star, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
  { key: 'spend', label: 'Spend', icon: IndianRupee, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' }
];

const REPORT_BUTTON = 'btn btn-ghost btn-sm';

/** Per-report action strip — export + schedule. Handlers come from the page. */
function ReportActions({ reportKey, onExport, onSchedule }) {
  /* Vendor Reports is its own area: Export and Print are separate switches
     (bounded by Vendor Management). These are browser-side outputs, so this
     control is their enforcement point. */
  const { can } = usePurchaseAccess();
  const canExport = can('vendorReports', 'export');
  const canPrint = can('vendorReports', 'print');
  return (
    <div className="flex flex-wrap items-center gap-2">
      {canExport && (
        <button type="button" className={REPORT_BUTTON} onClick={() => onExport(reportKey, 'excel')}>
          <FileSpreadsheet size={12} /> Excel
        </button>
      )}
      <button type="button" className={REPORT_BUTTON} onClick={() => onExport(reportKey, 'pdf')}>
        <FileDown size={12} /> PDF
      </button>
      {canExport && (
        <button type="button" className={REPORT_BUTTON} onClick={() => onExport(reportKey, 'csv')}>
          <Download size={12} /> CSV
        </button>
      )}
      {canPrint && (
        <button type="button" className={REPORT_BUTTON} onClick={() => onExport(reportKey, 'print')}>
          <Printer size={12} /> Print
        </button>
      )}
      <button type="button" className={REPORT_BUTTON} onClick={() => onSchedule(reportKey)}>
        <Clock3 size={12} /> Schedule
      </button>
    </div>
  );
}

const ReportSkeleton = () => <div className="h-52 bg-slate-100 rounded-lg animate-pulse" />;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/* Report table column defs — fixed colgroup widths, no wrapping, matching
   the shared PurchaseTable standard (dark header, sticky, ellipsis). */
const REPORT_TABLE_COLUMNS = {
  performance: [
    { key: 'name', label: 'Vendor', width: 220, sortable: false },
    { key: 'category', label: 'Category', width: 180, sortable: false },
    { key: 'rating', label: 'Rating', width: 90, sortable: false, align: 'center' },
    { key: 'onTimeDelivery', label: 'On-Time', width: 100, sortable: false, align: 'center' },
    { key: 'quality', label: 'Quality', width: 100, sortable: false, align: 'center' },
    { key: 'orders', label: 'Orders', width: 100, sortable: false, align: 'right' },
    { key: 'spend', label: 'Spend', width: 150, sortable: false, align: 'right' }
  ],
  approval: [
    { key: 'name', label: 'Vendor', width: 220, sortable: false },
    { key: 'status', label: 'Status', width: 150, sortable: false, align: 'center' },
    { key: 'category', label: 'Category', width: 180, sortable: false },
    { key: 'city', label: 'City', width: 140, sortable: false },
    { key: 'createdAt', label: 'Registered On', width: 150, sortable: false }
  ],
  gst: [
    { key: 'id', label: 'Vendor Code', width: 120, sortable: false },
    { key: 'name', label: 'Vendor', width: 220, sortable: false },
    { key: 'gstin', label: 'GSTIN', width: 180, sortable: false },
    { key: 'state', label: 'State', width: 140, sortable: false },
    { key: 'city', label: 'City', width: 140, sortable: false },
    { key: 'status', label: 'Status', width: 150, sortable: false, align: 'center' }
  ]
};

/** Shared report-table shell — the standard PurchaseTable + pagination. */
function ReportTable({ columns, rows, renderers, idColumn, emptyIcon: EmptyIcon, emptyTitle, emptyMessage }) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageInfo = `Showing ${rows.length > 0 ? (safePage - 1) * pageSize + 1 : 0}-${Math.min(safePage * pageSize, rows.length)} of ${rows.length}`;
  /* Keep header and data cells aligned: PurchaseTable reads col.align for
     the header but uses the alignCenter/alignRight props for data cells. */
  const alignCenter = columns.filter((col) => col.align === 'center').map((col) => col.key);
  const alignRight = columns.filter((col) => col.align === 'right').map((col) => col.key);
  return (
    <PurchaseTable
      columns={columns}
      rows={pageRows}
      selectable={false}
      idColumn={idColumn}
      alignCenter={alignCenter}
      alignRight={alignRight}
      renderers={renderers}
      emptyContent={
        <PurchaseEmptyState icon={EmptyIcon} title={emptyTitle} message={emptyMessage} />
      }
      footer={rows.length > 0 && (
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
  );
}

/** Compact per-tab summary cards (reuses the shared card look). */
function SummaryRow({ items, className }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 mb-5${className ? ` ${className}` : ''}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-3 shadow-sm dark:border-white/10 dark:bg-[#141C2E]"
        >
          <span
            className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
            style={{ background: item.bg, color: item.color }}
            aria-hidden="true"
          >
            <item.icon size={16} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 truncate">{item.label}</p>
            <p className="text-sm font-bold text-slate-800 truncate dark:text-slate-800">{item.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function VendorReports() {
  const navigate = useNavigate();
  const toast = useToast();

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [activeTab, setActiveTab] = useState('spend');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await vendorService.getAllVendors();
      setVendors(data);
      setError(null);
    } catch (err) {
      console.error('[VendorReports] load failed:', err);
      console.error(err?.stack);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(load);
  }, [load, refreshKey]);

  const refresh = useCallback(() => setRefreshKey((key) => key + 1), []);

  /* ---- Master filter: search + registration date range, then derive ---- */
  const scopedVendors = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const fromTime = dateFrom ? new Date(`${dateFrom}T00:00:00`).getTime() : null;
    const toTime = dateTo ? new Date(`${dateTo}T23:59:59`).getTime() : null;
    return vendors.filter((vendor) => {
      if (fromTime || toTime) {
        const created = new Date(vendor.createdAt || 0).getTime();
        if (fromTime && created < fromTime) return false;
        if (toTime && created > toTime) return false;
      }
      if (q && ![vendor.name, vendor.id, vendor.category, vendor.city, vendor.state, vendor.gstin]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)) {
        return false;
      }
      return true;
    });
  }, [vendors, searchQuery, dateFrom, dateTo]);

  const hasFilters = Boolean(searchQuery) || Boolean(dateFrom) || Boolean(dateTo);

  const clearFilters = () => {
    setSearchQuery('');
    setDateFrom('');
    setDateTo('');
  };

  const totalSpend = useMemo(() => scopedVendors.reduce((sum, vendor) => sum + (vendor.spend || 0), 0), [scopedVendors]);

  const stats = useMemo(
    () => ({
      total: scopedVendors.length,
      approved: scopedVendors.filter((vendor) => vendor.status === VENDOR_STATUS.APPROVED).length,
      pending: scopedVendors.filter((vendor) => vendor.status === VENDOR_STATUS.PENDING).length,
      blocked: scopedVendors.filter((vendor) => vendor.status === VENDOR_STATUS.BLOCKED).length,
      preferred: scopedVendors.filter((vendor) => isPreferredVendor(vendor)).length,
      spend: totalSpend
    }),
    [scopedVendors, totalSpend]
  );

  const kpiCards = KPI_CARDS.map((def) => ({
    ...def,
    value: def.key === 'spend' ? formatAmount(stats.spend) : String(stats[def.key] ?? 0)
  }));

  /* ---- Derived report data (all scoped by search + date range) ---- */
  const spendReport = useMemo(
    () =>
      [...scopedVendors]
        .sort((a, b) => b.spend - a.spend)
        .map((vendor) => ({
          id: vendor.id,
          name: vendor.name,
          category: vendor.category,
          spend: vendor.spend,
          orders: vendor.orders,
          share: totalSpend > 0 ? Math.round(((vendor.spend || 0) / totalSpend) * 1000) / 10 : 0
        })),
    [scopedVendors, totalSpend]
  );

  const performanceReport = useMemo(
    () =>
      [...scopedVendors]
        .sort((a, b) => b.rating - a.rating)
        .map((vendor) => ({
          id: vendor.id,
          name: vendor.name,
          category: vendor.category,
          rating: vendor.rating,
          onTimeDelivery: vendor.onTimeDelivery,
          quality: Math.round((Math.min(vendor.rating, 5) / 5) * 100),
          orders: vendor.orders,
          spend: vendor.spend,
          status: vendor.status
        })),
    [scopedVendors]
  );

  const approvalReport = useMemo(
    () =>
      [...scopedVendors].map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        status: vendor.status,
        category: vendor.category,
        city: vendor.city,
        state: vendor.state,
        createdAt: vendor.createdAt
      })),
    [scopedVendors]
  );

  const categoryReport = useMemo(() => {
    const byCategory = {};
    scopedVendors.forEach((vendor) => {
      const key = vendor.category || 'Other';
      if (!byCategory[key]) byCategory[key] = { vendors: 0, spend: 0 };
      byCategory[key].vendors += 1;
      byCategory[key].spend += vendor.spend || 0;
    });
    return Object.entries(byCategory)
      .map(([category, data]) => ({ category, vendors: data.vendors, spend: Math.round(data.spend) }))
      .sort((a, b) => b.spend - a.spend);
  }, [scopedVendors]);

  const gstReport = useMemo(
    () =>
      scopedVendors.map((vendor) => ({
        id: vendor.id,
        name: vendor.name,
        gstin: vendor.gstin,
        state: vendor.state,
        city: vendor.city,
        status: vendor.status
      })),
    [scopedVendors]
  );

  const activityReport = useMemo(() => {
    const entries = [];
    scopedVendors.forEach((vendor) => {
      (vendor.activity || []).forEach((entry) => {
        entries.push({
          date: entry.timestamp,
          vendor: vendor.name,
          vendorId: vendor.id,
          user: entry.actor || 'System',
          action: entry.label || entry.type,
          remarks: entry.note || ''
        });
      });
    });
    return entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }, [scopedVendors]);

  const monthlySpend = useMemo(() => {
    const byMonth = {};
    scopedVendors.forEach((vendor) => {
      const month = (vendor.createdAt || '').slice(0, 7);
      if (!month) return;
      byMonth[month] = (byMonth[month] || 0) + (vendor.spend || 0);
    });
    const entries = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, spend]) => ({
        label: `${month.slice(5)}/${month.slice(2, 4)}`,
        value: Math.round(spend)
      }));
    return entries.length > 1 ? entries : [];
  }, [scopedVendors]);

  /* ---- Per-tab summary cards ---- */
  const summaryItems = useMemo(() => {
    const topVendor = spendReport[0];
    const topRated = performanceReport[0];
    const statesCovered = new Set(scopedVendors.map((vendor) => vendor.state).filter(Boolean)).size;
    const actors = new Set(activityReport.map((entry) => entry.user).filter(Boolean)).size;
    return {
      spend: [
        { label: 'Total Spend', value: formatAmount(totalSpend), icon: IndianRupee, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
        { label: 'Top Vendor', value: topVendor ? `${topVendor.name} (${topVendor.share}%)` : '—', icon: Building2, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
        { label: 'Avg Spend / Vendor', value: scopedVendors.length ? formatAmount(Math.round(totalSpend / scopedVendors.length)) : '—', icon: IndianRupee, color: '#059669', bg: 'rgba(5,150,105,0.10)' },
        { label: 'Total Orders', value: String(scopedVendors.reduce((sum, vendor) => sum + (vendor.orders || 0), 0)), icon: TrendingUp, color: '#d97706', bg: 'rgba(217,119,6,0.10)' }
      ],
      performance: [
        { label: 'Top Rated', value: topRated ? topRated.name : '—', icon: Star, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
        { label: 'Avg On-Time', value: scopedVendors.length ? `${Math.round(scopedVendors.reduce((s, v) => s + v.onTimeDelivery, 0) / scopedVendors.length)}%` : '—', icon: ShieldCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
        { label: 'Avg Quality', value: scopedVendors.length ? `${Math.round(scopedVendors.reduce((s, v) => s + Math.round((Math.min(v.rating, 5) / 5) * 100), 0) / scopedVendors.length)}%` : '—', icon: TrendingUp, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
        { label: 'Highest Spend', value: spendReport[0] ? formatAmount(spendReport[0].spend) : '—', icon: IndianRupee, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' }
      ],
      approval: [
        { label: 'Approved', value: String(stats.approved), icon: ShieldCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
        { label: 'Pending', value: String(stats.pending), icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' },
        { label: 'Blocked', value: String(stats.blocked), icon: UserX, color: '#dc2626', bg: 'rgba(220,38,38,0.10)' },
        { label: 'Rejected', value: String(scopedVendors.filter((vendor) => vendor.status === VENDOR_STATUS.REJECTED).length), icon: X, color: '#64748b', bg: 'rgba(100,116,139,0.10)' }
      ],
      category: [
        { label: 'Categories', value: String(categoryReport.length), icon: PieChart, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
        { label: 'Top Category', value: categoryReport[0]?.category || '—', icon: Building2, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
        { label: 'Top Category Spend', value: categoryReport[0] ? formatAmount(categoryReport[0].spend) : '—', icon: IndianRupee, color: '#059669', bg: 'rgba(5,150,105,0.10)' },
        { label: 'Largest By Count', value: [...categoryReport].sort((a, b) => b.vendors - a.vendors)[0]?.category || '—', icon: Users, color: '#d97706', bg: 'rgba(217,119,6,0.10)' }
      ],
      gst: [
        { label: 'GSTINs Registered', value: String(gstReport.filter((vendor) => vendor.gstin).length), icon: FileText, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
        { label: 'States Covered', value: String(statesCovered), icon: Building2, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
        { label: 'Approved', value: String(stats.approved), icon: ShieldCheck, color: '#16a34a', bg: 'rgba(22,163,74,0.10)' },
        { label: 'Pending', value: String(stats.pending), icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' }
      ],
      activity: [
        { label: 'Total Events', value: String(activityReport.length), icon: History, color: '#0A4F44', bg: 'rgba(10,79,68,0.08)' },
        { label: 'Unique Vendors', value: String(new Set(activityReport.map((entry) => entry.vendor)).size), icon: Building2, color: '#2563eb', bg: 'rgba(37,99,235,0.10)' },
        { label: 'Unique Actors', value: String(actors), icon: UserCheck, color: '#7c3aed', bg: 'rgba(124,58,237,0.10)' },
        { label: 'Latest Event', value: activityReport[0] ? formatDate(activityReport[0].date) : '—', icon: Clock3, color: '#d97706', bg: 'rgba(217,119,6,0.10)' }
      ]
    };
  }, [scopedVendors, totalSpend, spendReport, performanceReport, categoryReport, gstReport, activityReport, stats]);

  /* ---- Report export / print (shared column + record shapes) ---- */
  const REPORT_COLUMNS = {
    spend: [
      { key: 'id', label: 'Vendor Code' },
      { key: 'name', label: 'Vendor' },
      { key: 'category', label: 'Category' },
      { key: 'orders', label: 'Orders' },
      { key: 'spend', label: 'Spend' },
      { key: 'share', label: 'Share %' }
    ],
    performance: [
      { key: 'id', label: 'Vendor Code' },
      { key: 'name', label: 'Vendor' },
      { key: 'category', label: 'Category' },
      { key: 'rating', label: 'Rating' },
      { key: 'onTimeDelivery', label: 'On-Time %' },
      { key: 'quality', label: 'Quality %' },
      { key: 'orders', label: 'Orders' },
      { key: 'spend', label: 'Spend' }
    ],
    approval: [
      { key: 'id', label: 'Vendor Code' },
      { key: 'name', label: 'Vendor' },
      { key: 'status', label: 'Status' },
      { key: 'category', label: 'Category' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'createdAt', label: 'Registered On' }
    ],
    category: [
      { key: 'category', label: 'Category' },
      { key: 'vendors', label: 'Vendors' },
      { key: 'spend', label: 'Spend' }
    ],
    gst: [
      { key: 'id', label: 'Vendor Code' },
      { key: 'name', label: 'Vendor' },
      { key: 'gstin', label: 'GSTIN' },
      { key: 'state', label: 'State' },
      { key: 'city', label: 'City' },
      { key: 'status', label: 'Status' }
    ],
    activity: [
      { key: 'date', label: 'Date' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'user', label: 'User' },
      { key: 'action', label: 'Action' },
      { key: 'remarks', label: 'Remarks' }
    ]
  };

  const reportRecords = {
    spend: spendReport,
    performance: performanceReport,
    approval: approvalReport,
    category: categoryReport,
    gst: gstReport,
    activity: activityReport
  };

  const exportReport = async (key, type) => {
    const columns = REPORT_COLUMNS[key];
    const records = reportRecords[key];
    const title = REPORTS.find((report) => report.key === key)?.label || 'Vendor Report';
    try {
      if (type === 'excel') await exportExcel(columns, records, `vendor-${key}-report`);
      else if (type === 'pdf') await exportPdf({ title, columns, records, filename: `vendor-${key}-report` });
      else if (type === 'csv') exportCsv(columns, records, `vendor-${key}-report`);
      else if (type === 'print') printTable(title, columns, records);
      toast.success(`${title} exported`);
    } catch (err) {
      toast.error(err?.message || `Failed to export ${title}`);
    }
  };

  const scheduleReport = (key) => {
    const title = REPORTS.find((report) => report.key === key)?.label || 'Report';
    toast.info(`${title} scheduled — weekly delivery (frontend mock)`);
  };

  const maxSpend = Math.max(1, ...spendReport.map((entry) => entry.spend));
  const maxCategorySpend = Math.max(1, ...categoryReport.map((entry) => entry.spend));

  const openVendor = (id) => navigate(`/purchase/vendors/${id}`);

  /* Shared report-cell renderers — same typography / badges as the list pages. */
  const reportRenderers = useMemo(
    () => ({
      id: (row) => (
        <button
          type="button"
          onClick={() => openVendor(row.id)}
          className="font-semibold text-slate-700 hover:text-[#0B4A3D] hover:underline whitespace-nowrap cursor-pointer"
        >
          {row.id}
        </button>
      ),
      name: (row) => (
        <button
          type="button"
          onClick={() => openVendor(row.id)}
          className="font-semibold text-slate-800 hover:text-[#0B4A3D] hover:underline truncate max-w-full cursor-pointer"
          title={row.name}
        >
          {row.name}
        </button>
      ),
      category: (row) => <span className="cpr-cell-truncate">{row.category || '—'}</span>,
      city: (row) => <span className="cpr-cell-truncate">{row.city || '—'}</span>,
      state: (row) => <span className="cpr-cell-truncate">{row.state || '—'}</span>,
      gstin: (row) => (
        <code className="px-1.5 py-0.5 rounded bg-slate-100 text-[11px] font-mono text-slate-600 whitespace-nowrap">
          {row.gstin || '—'}
        </code>
      ),
      rating: (row) => (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 tabular-nums">
          <Star className="w-3 h-3 text-amber-400 fill-amber-400" aria-hidden="true" /> {row.rating.toFixed(1)}
        </span>
      ),
      onTimeDelivery: (row) => (
        <span
          className={`text-xs font-bold tabular-nums ${Number(row.onTimeDelivery) >= 90 ? 'text-emerald-600' : Number(row.onTimeDelivery) >= 75 ? 'text-amber-600' : 'text-rose-600'}`}
        >
          {row.onTimeDelivery}%
        </span>
      ),
      quality: (row) => <span className="text-xs font-semibold text-slate-700 tabular-nums">{row.quality}%</span>,
      orders: (row) => <span className="text-xs text-slate-600 tabular-nums">{row.orders}</span>,
      spend: (row) => (
        <span className="font-bold text-slate-800 tabular-nums whitespace-nowrap">{formatAmount(row.spend)}</span>
      ),
      status: (row) => <PurchaseStatusCell status={row.status} />,
      createdAt: (row) => <span className="text-slate-500 whitespace-nowrap">{formatDate(row.createdAt)}</span>
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate]
  );

  const dateInputClass =
    'h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D]';

  return (
    <PurchasePageLayout
      staticHeader={
        <>
          <PurchaseHeader
            variant="cpr"
            crumb={[
              { label: 'Vendor Management', to: '/purchase/vendors' },
              { label: 'Reports' }
            ]}
            icon={FileText}
            title="Vendor Reports"
            subtitle="Spend, performance, approval, category, GST and activity reports"
          />

          <ModuleTabNav module="vendors" />
        </>
      }
      className="vr-page"
    >

      {error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || 'Failed to load vendor reports.'}</p>
          <button type="button" className="cpr-error-retry" onClick={refresh}>Retry</button>
        </div>
      )}

      <PurchaseKpiCards variant="cpr" cards={kpiCards} gridClass="" />

      <PurchaseToolbar
        count={`${scopedVendors.length} Vendor${scopedVendors.length === 1 ? '' : 's'}`}
        left={
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <RefreshCw size={12} /> Refresh
            </button>
            {hasFilters && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
                <X size={12} /> Clear
              </button>
            )}
            <Tabs tabs={REPORTS.map(({ key, label, icon }) => ({ key, label, icon }))} activeKey={activeTab} onChange={setActiveTab} />
          </>
        }
        right={
          <>
            <PurchaseSearch
              id="reportsSearchInput"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={setSearchQuery}
              label="Search Vendors"
            />
            <div className="vr-date-range" aria-label="Registration date range">
              <CalendarRange size={13} className="text-slate-400 shrink-0" aria-hidden="true" />
              <input
                type="date"
                className={`${dateInputClass} vr-date-input`}
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Registered from"
              />
              <span className="vr-date-arrow" aria-hidden="true">→</span>
              <input
                type="date"
                className={`${dateInputClass} vr-date-input`}
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Registered to"
              />
            </div>
          </>
        }
      />

      {loading ? (
        <ReportSkeleton />
      ) : scopedVendors.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 mb-1">No vendors found</p>
          <p className="text-xs text-slate-400">No vendor data matches your current filters. Try adjusting the date range or clearing filters.</p>
        </div>
      ) : (
        <>
          {/* ================= VENDOR SPEND ================= */}
          {activeTab === 'spend' && (
            <>
              <SummaryRow items={summaryItems.spend} className="vr-perf-white" />
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mb-5 items-start">
                <PurchaseSectionCard
                  title="Monthly Spend Trend"
                  subtitle="Spend by registration month"
                  icon={TrendingUp}
                  action={<ReportActions reportKey="spend" onExport={exportReport} onSchedule={scheduleReport} />}
                >
                  {monthlySpend.length > 0 ? (
                    <PurchaseMiniBarChart
                      labels={monthlySpend.map((entry) => entry.label)}
                      values={monthlySpend.map((entry) => entry.value)}
                      height={200}
                      valueFormat={(value) => formatAmount(value)}
                    />
                  ) : (
                    <div className="py-10 text-center">
                      <TrendingUp className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-semibold text-slate-500">No monthly spend data available</p>
                      <p className="text-[11px] text-slate-400 mt-1">Spend by month requires multiple registration periods to display.</p>
                    </div>
                  )}
                </PurchaseSectionCard>
                <PurchaseSectionCard
                  title="Vendor Spend Rank"
                  subtitle="Spend share by vendor, ranked"
                  icon={IndianRupee}
                >
                  <div className="space-y-4">
                    {spendReport.map((entry, index) => (
                      <div key={entry.id}>
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                            index < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => openVendor(entry.id)}
                            className="font-bold text-slate-700 truncate hover:text-[#0B4A3D] hover:underline text-xs flex-1 min-w-0"
                          >
                            {entry.name} <span className="text-slate-400 font-semibold">· {entry.id}</span>
                          </button>
                          <span className="text-slate-400 font-semibold whitespace-nowrap text-xs">{formatAmount(entry.spend)} · {entry.share}%</span>
                        </div>
                        <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden ml-7">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#059669] to-[#34d399] transition-all"
                            style={{ width: `${Math.min(100, (entry.spend / maxSpend) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                    {spendReport.length === 0 && <p className="text-xs text-slate-400 py-8 text-center">No vendor spend data available.</p>}
                  </div>
                </PurchaseSectionCard>
              </div>
            </>
          )}

          {/* ================= VENDOR PERFORMANCE ================= */}
          {activeTab === 'performance' && (
            <>
              <SummaryRow items={summaryItems.performance} className="vr-perf-white" />
              <PurchaseSectionCard
                title="Vendor Performance"
                subtitle="Ranked by rating with on-time and quality"
                icon={TrendingUp}
                action={<ReportActions reportKey="performance" onExport={exportReport} onSchedule={scheduleReport} />}
                bodyClassName="p-0"
              >
                <ReportTable
                  columns={REPORT_TABLE_COLUMNS.performance}
                  rows={performanceReport}
                  renderers={reportRenderers}
                  idColumn="name"
                  emptyIcon={TrendingUp}
                  emptyTitle="No Performance Data"
                  emptyMessage="No performance data available in the selected range."
                />
              </PurchaseSectionCard>
            </>
          )}

          {/* ================= VENDOR APPROVAL ================= */}
          {activeTab === 'approval' && (
            <>
              <SummaryRow items={summaryItems.approval} className="vr-perf-white" />
              <PurchaseSectionCard
                title="Vendor Approval"
                subtitle="Status of every vendor in scope"
                icon={UserCheck}
                action={<ReportActions reportKey="approval" onExport={exportReport} onSchedule={scheduleReport} />}
                bodyClassName="p-0"
              >
                <ReportTable
                  columns={REPORT_TABLE_COLUMNS.approval}
                  rows={approvalReport}
                  renderers={reportRenderers}
                  idColumn="name"
                  emptyIcon={ShieldCheck}
                  emptyTitle="No Approval Data"
                  emptyMessage="No approval data available in the selected range."
                />
              </PurchaseSectionCard>
            </>
          )}

          {/* ================= VENDOR CATEGORY ================= */}
          {activeTab === 'category' && (
            <>
              <SummaryRow items={summaryItems.category} className="vr-perf-white" />
              <PurchaseSectionCard
                title="Vendor Category"
                subtitle="Vendor count and spend by category"
                icon={PieChart}
                action={<ReportActions reportKey="category" onExport={exportReport} onSchedule={scheduleReport} />}
              >
                <div className="space-y-4">
                  {categoryReport.map((entry) => (
                    <div key={entry.category}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold text-slate-700">{entry.category}</span>
                        <span className="text-slate-400 font-semibold">{entry.vendors} vendor{entry.vendors === 1 ? '' : 's'} · {formatAmount(entry.spend)}</span>
                      </div>
                      <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-600 to-sky-400 transition-all"
                          style={{ width: `${Math.min(100, (entry.spend / maxCategorySpend) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                  {categoryReport.length === 0 && <p className="text-xs text-slate-400 py-8 text-center">No category data available.</p>}
                </div>
              </PurchaseSectionCard>
            </>
          )}

          {/* ================= GST REPORT ================= */}
          {activeTab === 'gst' && (
            <>
              <SummaryRow items={summaryItems.gst} className="vr-perf-white" />
              <PurchaseSectionCard
                title="GST Report"
                subtitle="GSTIN registry with state and status"
                icon={FileText}
                action={<ReportActions reportKey="gst" onExport={exportReport} onSchedule={scheduleReport} />}
                bodyClassName="p-0"
              >
                <ReportTable
                  columns={REPORT_TABLE_COLUMNS.gst}
                  rows={gstReport}
                  renderers={reportRenderers}
                  idColumn="id"
                  emptyIcon={FileText}
                  emptyTitle="No GST Data"
                  emptyMessage="No GST data available in the selected range."
                />
              </PurchaseSectionCard>
            </>
          )}

          {/* ================= VENDOR ACTIVITY ================= */}
          {activeTab === 'activity' && (
            <>
              <SummaryRow items={summaryItems.activity} className="vr-perf-white" />
              <PurchaseSectionCard
                title="Vendor Activity"
                subtitle="Every recorded event across the vendor master"
                icon={History}
                action={<ReportActions reportKey="activity" onExport={exportReport} onSchedule={scheduleReport} />}
              >
                {activityReport.length > 0 ? (
                  <ul className="divide-y divide-slate-100 max-h-[52vh] overflow-y-auto pr-1">
                    {activityReport.map((entry, index) => (
                      <li key={`${entry.vendor}-${entry.date}-${index}`} className="py-2.5 flex items-start gap-3">
                        <span className="mt-1.5 w-2 h-2 rounded-full bg-sky-500 shrink-0" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800">{entry.action}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {formatDateTime(entry.date)} · {entry.user} ·{' '}
                            <button type="button" onClick={() => openVendor(entry.vendorId)} className="hover:text-[#0B4A3D] hover:underline">
                              {entry.vendor}
                            </button>
                          </p>
                          {entry.remarks && <p className="text-[11px] text-slate-500 italic mt-0.5">{entry.remarks}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 py-8 text-center">No activity recorded yet.</p>
                )}
              </PurchaseSectionCard>
            </>
          )}
        </>
      )}
    </PurchasePageLayout>
  );
}
