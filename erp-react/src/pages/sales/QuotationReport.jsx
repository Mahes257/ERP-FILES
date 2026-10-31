import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Download, FileText, IndianRupee, RotateCcw, Search } from 'lucide-react';
import { SortIcon } from '../../components/Common';
import quotationService from '../../services/quotationService';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import SalesStatusBadge from '../../components/SalesTable/SalesStatusBadge';
import SalesKpiCards from '../../components/SalesTable/SalesKpiCards';
import { useToast } from '../../components/Common';
import { formatDate, formatINR } from '../../utils/leadHelpers';
import { BarChart, DoughnutChart } from '../../components/SalesCharts/SalesMiniCharts';
import './quotation-module.css';
import '../crm/crm-erp.css';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

function SortHead({ field, sortField, sortDir, onSort, children }) {
  return (
    <th
      onClick={() => onSort(field)}
      aria-sort={
        sortField === field ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
      }
    >
      <button type="button" style={{ display: 'inline-flex', alignItems: 'center', background: 'none', border: 'none', color: 'inherit', font: 'inherit', textTransform: 'inherit', letterSpacing: 'inherit', cursor: 'pointer', padding: 0, fontFamily: 'Inter, sans-serif' }}>
        {children}
        <SortIcon active={sortField === field} />
      </button>
    </th>
  );
}

export default function QuotationReport() {
  const navigate = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState('');
  const [sortField, setSortField] = useState('quotationDate');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    let cancelled = false;
    quotationService
      .list({ page: 0, size: 500 })
      .then((res) => {
        if (!cancelled) setRows(parseListResponse(res));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    let list = rows.filter((r) => String(r.status || '').toLowerCase() !== 'deleted');
    if (from) list = list.filter((r) => (r.quotationDate || r.date || '') >= from);
    if (to) list = list.filter((r) => (r.quotationDate || r.date || '') <= to);
    if (status) list = list.filter((r) => String(r.status || '').toLowerCase() === status.toLowerCase());
    const sorted = [...list].sort((a, b) => {
      let va = a[sortField] ?? '';
      let vb = b[sortField] ?? '';
      if (sortField === 'grandTotal') {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
      } else {
        va = String(va).toLowerCase();
        vb = String(vb).toLowerCase();
      }
      return va < vb ? (sortDir === 'asc' ? -1 : 1) : va > vb ? (sortDir === 'asc' ? 1 : -1) : 0;
    });
    return sorted;
  }, [rows, from, to, status, sortField, sortDir]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    let amount = 0;
    const counts = { approved: 0, converted: 0, sent: 0, draft: 0, accepted: 0, rejected: 0, expired: 0, cancelled: 0, negotiation: 0 };
    filtered.forEach((o) => {
      amount += Number(o.grandTotal || o.total || 0) || 0;
      const s = String(o.status || '').toLowerCase();
      if (counts[s] !== undefined) counts[s]++;
      if (s === 'accepted') counts.approved++;
    });
    return { total, amount, ...counts };
  }, [filtered]);

  const chartData = useMemo(() => {
    const map = {};
    filtered.forEach((o) => {
      const d = o.quotationDate || o.date;
      if (!d) return;
      const m = String(d).substring(0, 7);
      map[m] = (map[m] || 0) + 1;
    });
    const labels = Object.keys(map).sort();
    const data = labels.map((k) => map[k]);
    return { labels: labels.length ? labels : ['No Data'], data: data.length ? data : [0] };
  }, [filtered]);

  const statusChart = useMemo(() => {
    const map = {};
    filtered.forEach((o) => {
      const s = o.status || 'Draft';
      map[s] = (map[s] || 0) + 1;
    });
    const labels = Object.keys(map);
    const data = labels.map((k) => map[k]);
    return { labels: labels.length ? labels : ['No Data'], data: data.length ? data : [0] };
  }, [filtered]);

  const toggleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const exportCSV = () => {
    if (!filtered.length) {
      toast.warning('No data');
      return;
    }
    const csv =
      'Date,Quotation No,Customer,Amount,Valid Till,Status,Sales Person\n' +
      filtered
        .map(
          (o) =>
            `${o.quotationDate || o.date || ''},${o.quotationNo || o.id || ''},${o.clientName || ''},${o.grandTotal || 0},${o.validUntil || ''},${o.status || 'Draft'},${o.salesPerson || ''}`
        )
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'quotation-report.csv';
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('Report exported');
  };

  const reset = () => {
    setFrom('');
    setTo('');
    setStatus('');
  };

  return (
    <div className="qpo-page">
      {/* ===== BREADCRUMB ===== */}
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Report</span>
      </nav>

      {/* ===== PAGE HEADER ===== */}
      <div className="qpo-page-header">
        <div>
          <h1>
            <FileText /> Quotation Report
          </h1>
          <p className="qpo-page-header-subtitle">Filter, analyze and export quotation data.</p>
        </div>
        <div className="qpo-header-actions">
          <button type="button" className="qpo-btn qpo-btn-primary-outline" onClick={exportCSV}>
            <Download /> Export CSV
          </button>
          <button type="button" className="qpo-btn qpo-btn-ghost" onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>
            <FileText /> List
          </button>
        </div>
      </div>

      {/* ===== FILTERS ===== */}
      <div className="qpo-view-section" style={{ padding: '16px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 16 }}>
          <div className="qpo-form-group" style={{ marginBottom: 0 }}>
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="qpo-form-group" style={{ marginBottom: 0 }}>
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="qpo-form-group" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: 170 }}>
              <option value="">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Accepted">Accepted</option>
              <option value="Rejected">Rejected</option>
              <option value="Expired">Expired</option>
              <option value="Converted">Converted</option>
              <option value="Cancelled">Cancelled</option>
            </select>
          </div>
          <button type="button" className="qpo-btn qpo-btn-ghost qpo-btn-sm" onClick={reset}>
            <RotateCcw /> Reset
          </button>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#6b7280', marginLeft: 'auto' }}>{filtered.length} records</span>
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
          <div style={{ display: 'inline-block', width: 24, height: 24, borderRadius: '50%', border: '2px solid #e5e7eb', borderTopColor: '#0B4A3D', animation: 'qpo-spin 0.8s linear infinite' }} />
        </div>
      ) : (
        <>
          {/* ===== KPI CARDS ===== */}
          <SalesKpiCards
            cards={[
              { key: 'total', icon: FileText, label: 'Total Quotations', value: kpis.total, color: '#136754', newTabUrl: '/quotations' },
              { key: 'amount', icon: IndianRupee, label: 'Total Amount', value: formatINR(kpis.amount), color: '#059669', newTabUrl: '/quotations' },
              { key: 'approved', icon: FileText, label: 'Approved', value: kpis.approved, color: '#16a34a', newTabUrl: '/quotations?status=accepted' },
              { key: 'converted', icon: FileText, label: 'Converted', value: kpis.converted, color: '#8b5cf6', newTabUrl: '/quotations?status=converted' },
              { key: 'sent', icon: FileText, label: 'Sent', value: kpis.sent, color: '#0B4A3D', newTabUrl: '/quotations?status=sent' },
              { key: 'draft', icon: FileText, label: 'Draft', value: kpis.draft, color: '#6b7280', newTabUrl: '/quotations?status=draft' }
            ]}
            onSelect={() => {}}
          />

          {/* ===== CHARTS ===== */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }} className="qpo-report-charts">
            <div className="qpo-dash-card">
              <div className="qpo-dash-card-header"><h3><Search /> Quotations by Month</h3></div>
              <BarChart labels={chartData.labels} data={chartData.data} />
            </div>
            <div className="qpo-dash-card">
              <div className="qpo-dash-card-header"><h3><FileText /> Status Distribution</h3></div>
              <DoughnutChart labels={statusChart.labels} data={statusChart.data} />
            </div>
          </div>

          {/* ===== TABLE ===== */}
          <div className="qpo-table-card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #e5e7eb', fontSize: 12, fontWeight: 600, color: '#6B7280' }}>
              {filtered.length} records
            </div>
            <div className="qpo-table-wrap">
              <table className="qpo-table" style={{ minWidth: 860 }}>
                <thead>
                  <tr>
                    <SortHead field="quotationDate" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Date</SortHead>
                    <SortHead field="quotationNo" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Quotation No</SortHead>
                    <SortHead field="clientName" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Customer</SortHead>
                    <SortHead field="grandTotal" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Amount</SortHead>
                    <SortHead field="validUntil" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Valid Till</SortHead>
                    <SortHead field="status" sortField={sortField} sortDir={sortDir} onSort={toggleSort}>Status</SortHead>
                    <th>Sales Person</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af' }}>No quotations found</td>
                    </tr>
                  ) : (
                    filtered.map((o) => (
                      <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/quotations/${o.id}/view`)}>
                        <td style={{ color: '#6b7280' }}>{formatDate(o.quotationDate || o.date)}</td>
                        <td><span className="qpo-order-link">{o.quotationNo || o.id}</span></td>
                        <td>{o.clientName || '—'}</td>
                        <td className="qpo-th-right"><span className="qpo-amount">{formatINR(o.grandTotal || 0)}</span></td>
                        <td style={{ color: '#6b7280' }}>{formatDate(o.validUntil)}</td>
                        <td><SalesStatusBadge status={o.status} /></td>
                        <td style={{ color: '#6b7280' }}>{o.salesPerson || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <style>{`@keyframes qpo-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
