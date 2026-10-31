import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../PageHeader';
import Icon from '../../icons/Icon';
import { REPORTS } from '../../../services/production/reportService';
import { exportCsv } from '../../../utils/format';
import '../../../pages/reports/reports.css';
import './ReportShell.css';

/**
 * Shared shell for the five report views.
 * `activeKey` highlights the current report in the tab bar and
 * enables Previous / Next navigation. `exportData` wires the
 * Export CSV / Print buttons ({ filename, columns, rows }).
 * `filterState` is forwarded to other reports so filters survive
 * navigation.
 */
export default function ReportShell({ activeKey, title, description, exportData, filterState, children }) {
  const navigate = useNavigate();
  const index = REPORTS.findIndex((report) => report.key === activeKey);
  const prev = index > 0 ? REPORTS[index - 1] : null;
  const next = index >= 0 && index < REPORTS.length - 1 ? REPORTS[index + 1] : null;

  const navState = filterState && Object.values(filterState).some((v) => v && v !== 'All') ? { filterState } : undefined;

  const handleExport = () => {
    if (!exportData) return;
    exportCsv(exportData.filename, exportData.columns, exportData.rows);
  };

  return (
    <div className="page">
      <div className="report-topbar">
        <button type="button" className="back-btn" onClick={() => navigate('/production/reports')}>
          <Icon name="chevron-left" size={16} /> Back to Reports
        </button>
        <div className="report-prevnext">
          {prev && (
            <button type="button" className="report-nav-btn" onClick={() => navigate(prev.path, { state: navState })}>
              <Icon name="chevron-left" size={14} /> {prev.label}
            </button>
          )}
          {next && (
            <button type="button" className="report-nav-btn" onClick={() => navigate(next.path, { state: navState })}>
              {next.label} <Icon name="chevron-right" size={14} />
            </button>
          )}
        </div>
      </div>

      <PageHeader
        title={title}
        subtitle={description}
        actions={
          <div className="report-export-bar">
            <button type="button" className="btn btn-secondary" onClick={handleExport}>
              <Icon name="download" size={14} /> Export CSV
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
              <Icon name="printer" size={14} /> Print Report
            </button>
          </div>
        }
      />

      <nav className="report-tabs" aria-label="Report navigation">
        {REPORTS.map((report) => (
          <Link
            key={report.key}
            to={report.path}
            state={navState}
            className={`report-tab${report.key === activeKey ? ' active' : ''}`}
          >
            <Icon name={report.icon} size={15} /> {report.label}
          </Link>
        ))}
      </nav>

      {children}
    </div>
  );
}
