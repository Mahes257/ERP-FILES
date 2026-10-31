import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CheckCircle2,
  Clock,
  FileDown,
  FileSpreadsheet,
  FileText,
  Printer,
  IndianRupee,
  ListChecks
, ChevronRight } from 'lucide-react';
import cprService from '../../services/cprService';

import { normalizeCpr } from '../../utils/cprHelpers';
import {
  exportCprReportsCsv,
  exportCprReportsExcel,
  exportCprReportsPdf,
  fmtReportAmount,
  fmtReportDate,
  printCprReports
} from '../../utils/cprReportUtils';
import { useToast } from '../../components/Common';
import useClickOutside from '../../hooks/useClickOutside';
import '../crm/crm-erp.css';

// Aggregate rows are sent as `total`; the report tables read `totalValue`.
const withTotalValue = (row) => ({ ...row, totalValue: row?.totalValue ?? row?.total ?? 0 });

const REPORT_STYLES = {
  table: 'w-full text-left border-collapse',
  thead: 'bg-[#0B4A3D] text-white text-[11px] uppercase tracking-[0.04em]',
  th: 'px-4 py-3 font-semibold whitespace-nowrap',
  td: 'px-4 py-2.5 border-b border-slate-100 align-middle text-[13px] text-slate-600',
  empty: 'text-center px-4 py-8 text-[13px] text-slate-400'
};

function ReportTable({ columns, rows, renderCell, emptyText, footerText }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className={REPORT_STYLES.table}>
          <thead className={REPORT_STYLES.thead}>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={REPORT_STYLES.th}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={REPORT_STYLES.empty}>
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/70">
                  {columns.map((col) => (
                    <td key={col.key} className={REPORT_STYLES.td}>
                      {renderCell ? renderCell(row, col) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end items-center px-4 py-2.5 border-t border-slate-100 text-[12px] text-slate-500">
        <span className="font-medium">{footerText}</span>
      </div>
    </>
  );
}

function ReportCard({ icon: Icon, iconColor, title, children }) {
  return (
    <div className="po-dash-card mb-6">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2.5">
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
        <h3 className="text-[13px] font-bold text-slate-800">{title}</h3>
      </div>
      {children}
    </div>
  );
}

const KPI_CARDS = [
  { key: 'pending', label: 'Pending', icon: Clock, color: '#d97706', bg: '#fffbeb' },
  { key: 'approved', label: 'Approved', icon: CheckCircle2, color: '#059669', bg: '#ecfdf5' },
  { key: 'converted', label: 'Converted', icon: FileText, color: '#0B4A3D', bg: '#E8F0EE' },
  { key: 'totalValue', label: 'Total Value', icon: IndianRupee, color: '#059669', bg: '#d1fae5', currency: true }
];

export default function CprReports({ moduleTab, onModuleTabChange, embedded }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [cprs, setCprs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef(null);
  useClickOutside(exportRef, () => setExportOpen(false), exportOpen);

  useEffect(() => {
    let cancelled = false;
    // Real backend summary (aggregated from MySQL). The CPR list is fetched only
    // for export/print of the underlying records.
    cprService
      .getReportsSummary()
      .then((res) => {
        if (!cancelled) setSummary(res?.data ?? res ?? null);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    cprService
      .listAllCprs()
      .then((list) => {
        if (!cancelled) setCprs(list.map(normalizeCpr));
      })
      .catch(() => {
        if (!cancelled) setCprs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reports = useMemo(() => {
    // All report data comes from the backend summary endpoint (MySQL). The CPR
    // list is only used for export/print of the underlying records.
    const kpis = summary?.kpis || {};
    return {
      kpis: {
        pending: kpis.pending ?? 0,
        approved: kpis.approved ?? 0,
        converted: kpis.converted ?? 0,
        totalValue: Number(kpis.totalValue) || 0
      },
      // The summary rows come straight from GET /cprs/reports/summary, whose
      // CPR rows use the backend field names (clientName / requestedBy) and
      // whose aggregate rows use `total`. The tables below read the SAME
      // normalized names the CPR list uses (`client` / `createdBy`) and
      // `totalValue`, so both are mapped here — otherwise the Client and
      // Created By columns render '—' and every Department / Monthly total
      // renders ₹0.00 even though the backend sends the real values.
      pending: Array.isArray(summary?.pending) ? summary.pending.map(normalizeCpr) : [],
      approved: Array.isArray(summary?.approved) ? summary.approved.map(normalizeCpr) : [],
      converted: Array.isArray(summary?.converted) ? summary.converted.map(normalizeCpr) : [],
      deptSummary: Array.isArray(summary?.deptSummary) ? summary.deptSummary.map(withTotalValue) : [],
      vendorSummary: Array.isArray(summary?.vendorSummary) ? summary.vendorSummary.map(withTotalValue) : [],
      monthlySummary: Array.isArray(summary?.monthlySummary) ? summary.monthlySummary.map(withTotalValue) : [],
      costAnalysis: Array.isArray(summary?.costAnalysis) ? summary.costAnalysis.map(withTotalValue) : []
    };
  }, [summary]);

  const exportAll = async (format) => {
    setExportOpen(false);
    if (cprs.length === 0) {
      toast.error('No data available to export');
      return;
    }
    try {
      if (format === 'pdf') {
        const blob = await exportCprReportsPdf(cprs);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CPR_Reports_${new Date().toISOString().slice(0, 10)}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Reports exported as PDF');
      } else if (format === 'excel') {
        const blob = await exportCprReportsExcel(cprs);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CPR_Reports_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Reports exported as Excel');
      } else if (format === 'csv') {
        exportCprReportsCsv(cprs, `CPR_Reports_${new Date().toISOString().slice(0, 10)}`);
        toast.success('Reports exported as CSV');
      } else if (format === 'print') {
        printCprReports(cprs);
      }
    } catch (err) {
      toast.error(err?.message || 'Export failed');
    }
  };

  const openCpr = (row) => {
    navigate(`/cprs/${row.id}`);
  };

  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside a hub) ===== */}
      {!embedded && (
        <>
          <nav className="pr-breadcrumb" aria-label="Breadcrumb">
            <button className="bc-link" onClick={() => navigate('/dashboard')}>VISHAK TECH</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <button className="bc-link" onClick={() => navigate('/dashboard')}>Sales</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <button className="bc-link" onClick={() => navigate('/cprs')}>Customer Purchase Request</button>
            <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
            <span className="bc-current">Reports</span>
          </nav>
          <div className="pr-page-header">
            <div>
              <h1>
                <ListChecks size={20} /> CPR Reports
              </h1>
            </div>
            <div className="pr-page-header-actions">
              <button
                type="button"
                onClick={() => navigate('/cprs')}
                className="po-btn po-btn-secondary"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to CPR
              </button>
            </div>
          </div>
        </>
      )}

      {loading ? (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 flex items-center justify-center text-sm text-slate-400">
          Loading reports...
        </div>
      ) : (
        <>
          {/* ===== KPI GRID ===== */}
          <div className="pr-kpi-grid">
            {KPI_CARDS.map((k) => {
              const Icon = k.icon;
              const value = k.currency
                ? fmtReportAmount(reports.kpis[k.key])
                : String(reports.kpis[k.key]);
              return (
                <div key={k.key} className="pr-kpi-card qtn-kpi-card" data-filter={k.key}>
                  <span className="qtn-kpi-icon" style={{ background: k.bg, color: k.color }} aria-hidden="true">
                    <Icon size={19} />
                  </span>
                  <div className="qtn-kpi-body">
                    <div className="qtn-kpi-count" title={value}>{value}</div>
                    <div className="qtn-kpi-label" title={k.label}>{k.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ===== EXPORT TOOLBAR ===== */}
          <div className="po-toolbar">
            <div className="po-toolbar-left" />
            <div className="po-toolbar-right">
              <div className="relative" ref={exportRef}>
                <button
                  type="button"
                  onClick={() => setExportOpen((prev) => !prev)}
                  className="po-btn po-btn-ghost po-btn-sm"
                >
                  <FileDown className="w-3.5 h-3.5" /> Export
                </button>
                {exportOpen && (
                  <div className="po-dropdown-menu">
                    {[
                      { label: 'Export PDF', icon: FileText, fn: () => exportAll('pdf') },
                      { label: 'Export Excel', icon: FileSpreadsheet, fn: () => exportAll('excel') },
                      { label: 'Export CSV', icon: FileDown, fn: () => exportAll('csv') },
                      { label: 'Print', icon: Printer, fn: () => exportAll('print') }
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.fn}
                        className="po-dropdown-item"
                      >
                        <item.icon className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== 1. PENDING PRs ===== */}
          <ReportCard icon={Clock} iconColor="#d97706" title="Pending Purchase Requests">
            <ReportTable
              columns={[
                { key: 'prNo', label: 'CPR No' },
                { key: 'client', label: 'Client' },
                { key: 'description', label: 'Description' },
                { key: 'createdBy', label: 'Created By' },
                { key: 'createdAt', label: 'Date' },
                { key: 'action', label: 'Action' }
              ]}
              rows={reports.pending}
              renderCell={(row, col) => {
                if (col.key === 'action') {
                  return (
                    <button
                      type="button"
                      onClick={() => openCpr(row)}
                      className="po-btn po-btn-ghost po-btn-sm"
                    >
                      View
                    </button>
                  );
                }
                if (col.key === 'createdAt') return fmtReportDate(row.createdAt);
                return row[col.key] || '—';
              }}
              emptyText="No pending purchase requests."
              footerText={`Total: ${reports.pending.length}`}
            />
          </ReportCard>

          {/* ===== 2. APPROVED PRs ===== */}
          <ReportCard icon={CheckCircle2} iconColor="#059669" title="Approved Purchase Requests">
            <ReportTable
              columns={[
                { key: 'prNo', label: 'CPR No' },
                { key: 'client', label: 'Client' },
                { key: 'description', label: 'Description' },
                { key: 'createdBy', label: 'Created By' },
                { key: 'createdAt', label: 'Date' },
                { key: 'action', label: 'Action' }
              ]}
              rows={reports.approved}
              renderCell={(row, col) => {
                if (col.key === 'action') {
                  return (
                    <button
                      type="button"
                      onClick={() => openCpr(row)}
                      className="po-btn po-btn-ghost po-btn-sm"
                    >
                      View
                    </button>
                  );
                }
                if (col.key === 'createdAt') return fmtReportDate(row.createdAt);
                return row[col.key] || '—';
              }}
              emptyText="No approved purchase requests."
              footerText={`Total: ${reports.approved.length}`}
            />
          </ReportCard>

          {/* ===== 3. CONVERTED PRs ===== */}
          <ReportCard icon={FileText} iconColor="#0B4A3D" title="Converted to Quotation">
            <ReportTable
              columns={[
                { key: 'prNo', label: 'CPR No' },
                { key: 'client', label: 'Client' },
                { key: 'description', label: 'Description' },
                { key: 'createdBy', label: 'Created By' },
                { key: 'createdAt', label: 'Date' },
                { key: 'action', label: 'Action' }
              ]}
              rows={reports.converted}
              renderCell={(row, col) => {
                if (col.key === 'action') {
                  return (
                    <button
                      type="button"
                      onClick={() => openCpr(row)}
                      className="po-btn po-btn-ghost po-btn-sm"
                    >
                      View
                    </button>
                  );
                }
                if (col.key === 'createdAt') return fmtReportDate(row.createdAt);
                return row[col.key] || '—';
              }}
              emptyText="No converted purchase requests."
              footerText={`Total: ${reports.converted.length}`}
            />
          </ReportCard>

          {/* ===== 4. DEPARTMENT SUMMARY ===== */}
          {reports.deptSummary.length > 0 && (
            <ReportCard icon={Building2} iconColor="#7c3aed" title="Department Summary">
              <ReportTable
                columns={[
                  { key: 'department', label: 'Department' },
                  { key: 'count', label: 'Count' },
                  { key: 'totalValue', label: 'Total Value' }
                ]}
                rows={reports.deptSummary}
                renderCell={(row, col) => {
                  if (col.key === 'totalValue') return fmtReportAmount(row.totalValue);
                  return row[col.key] || '—';
                }}
                emptyText="No department data."
                footerText={`Departments: ${reports.deptSummary.length}`}
              />
            </ReportCard>
          )}

          {/* ===== 5. MONTHLY SUMMARY ===== */}
          {reports.monthlySummary.length > 0 && (
            <ReportCard icon={CalendarDays} iconColor="#2563eb" title="Monthly Summary">
              <ReportTable
                columns={[
                  { key: 'month', label: 'Month' },
                  { key: 'count', label: 'Count' },
                  { key: 'totalValue', label: 'Total Value' }
                ]}
                rows={reports.monthlySummary}
                renderCell={(row, col) => {
                  if (col.key === 'totalValue') return fmtReportAmount(row.totalValue);
                  return row[col.key] || '—';
                }}
                emptyText="No monthly data."
                footerText={`Months: ${reports.monthlySummary.length}`}
              />
            </ReportCard>
          )}
        </>
      )}
    </div>
  );
}
