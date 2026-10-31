import React, { useState } from 'react';
import Icon from '../../icons/Icon';
import { emptyReportFilters, REPORT_DEPARTMENTS, REPORT_STATUSES } from '../../../services/production/reportService';
import './ReportFilters.css';

/**
 * Common report filter bar (date range, department, status) with
 * Apply / Clear semantics. Each report composes which fields it needs.
 */
export default function ReportFilters({
  initial = emptyReportFilters(),
  showDateRange = true,
  showDepartment = true,
  showStatus = true,
  onApply,
}) {
  const [draft, setDraft] = useState(() => ({ ...emptyReportFilters(), ...initial }));

  const set = (key) => (e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }));

  const clear = () => {
    const empty = emptyReportFilters();
    setDraft(empty);
    onApply(empty);
  };

  return (
    <div className="report-filters">
      {showDateRange && (
        <>
          <label className="rf-field">
            <span className="rf-label">Date From</span>
            <input type="date" className="form-input" value={draft.dateFrom} onChange={set('dateFrom')} />
          </label>
          <label className="rf-field">
            <span className="rf-label">Date To</span>
            <input type="date" className="form-input" value={draft.dateTo} onChange={set('dateTo')} />
          </label>
        </>
      )}

      {showDepartment && (
        <label className="rf-field">
          <span className="rf-label">Department</span>
          <select className="form-select" value={draft.department} onChange={set('department')}>
            {['All', ...REPORT_DEPARTMENTS].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      )}

      {showStatus && (
        <label className="rf-field">
          <span className="rf-label">Status</span>
          <select className="form-select" value={draft.status} onChange={set('status')}>
            {['All', ...REPORT_STATUSES].map((option) => (
              <option key={option}>{option}</option>
            ))}
          </select>
        </label>
      )}

      <div className="rf-actions">
        <button type="button" className="btn btn-primary" onClick={() => onApply(draft)}>
          <Icon name="check" size={14} /> Apply Filters
        </button>
        <button type="button" className="btn btn-secondary" onClick={clear}>
          <Icon name="x" size={14} /> Clear Filters
        </button>
      </div>
    </div>
  );
}
