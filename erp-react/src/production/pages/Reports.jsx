import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Icon from '../components/icons/Icon';
import ReportFilters from '../components/production/reports/ReportFilters';
import { REPORTS, emptyReportFilters } from '../services/production/reportService';
import './Reports.css';

/**
 * Reports landing page — the five roadmap reports as cards plus the
 * common filter bar. Filters chosen here are carried into each
 * report when a card is opened (via router state).
 */
export default function Reports() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(emptyReportFilters());

  return (
    <div className="page">
      <PageHeader
        title="Production Reports"
        subtitle="Choose a report to view production performance, utilization, efficiency, material usage and delays."
      />

      <ReportFilters initial={filters} onApply={setFilters} />

      <section className="report-card-grid">
        {REPORTS.map((report) => (
          <button
            key={report.key}
            type="button"
            className="report-card"
            onClick={() => navigate(report.path, { state: { filterState: filters } })}
          >
            <span className="report-card-icon">
              <Icon name={report.icon} size={20} />
            </span>
            <div className="report-card-body">
              <h3 className="report-card-title">{report.label}</h3>
              <p className="report-card-desc">{report.description}</p>
            </div>
            <span className="report-card-arrow">
              <Icon name="arrow-right" size={16} />
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
