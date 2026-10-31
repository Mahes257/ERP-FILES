import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import masterService from '../../services/masterService';
import {
  APPROVAL_STATUSES,
  CPR_STATUSES,
  DEPARTMENTS as FALLBACK_DEPARTMENTS
} from '../../utils/cprMock';

export default function CprFilterPanel({ open, filters, onChange, onReset }) {
  // Department options come from the backend master list (/masters/pr_departments)
  // so new departments added via the CPR form appear here after refresh; falls
  // back to the original hardcoded list if the master endpoint is unreachable.
  const [departments, setDepartments] = useState(FALLBACK_DEPARTMENTS);

  useEffect(() => {
    let cancelled = false;
    masterService
      .list('pr_departments')
      .then((res) => {
        const data = Array.isArray(res?.data) ? res.data : [];
        const values = data.map((d) => (typeof d === 'string' ? d : d?.value)).filter(Boolean);
        if (!cancelled && values.length > 0) setDepartments(values);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!open) return null;

  const FILTERS = [
    { key: 'no', label: 'PR No', type: 'text', placeholder: 'Search PR No...' },
    { key: 'client', label: 'Client', type: 'text', placeholder: 'Search client...' },
    { key: 'lead', label: 'Lead No', type: 'text', placeholder: 'Search lead...' },
    { key: 'department', label: 'Department', type: 'select', options: departments, placeholder: 'All Departments' },
    { key: 'salesPerson', label: 'Sales Executive', type: 'text', placeholder: 'Search executive...' },
    { key: 'status', label: 'Status', type: 'select', options: CPR_STATUSES.map((s) => s.label), placeholder: 'All Statuses' },
    { key: 'approval', label: 'Approval Status', type: 'select', options: APPROVAL_STATUSES.map((s) => s.label), placeholder: 'All' },
    { key: 'stage', label: 'Current Stage', type: 'select', options: CPR_STATUSES.map((s) => s.label), placeholder: 'All Stages' },
    { key: 'dateFrom', label: 'Date From', type: 'date' },
    { key: 'dateTo', label: 'Date To', type: 'date' }
  ];

  return (
    <div className="pr-filter-panel show">
      <div className="pr-filter-grid">
        {FILTERS.map((field) => (
          <div key={field.key} className="filter-group">
            <span className="filter-label">{field.label}</span>
            {field.type === 'select' ? (
              <select
                value={filters[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                className="prm-filter-select"
              >
                <option value="">{field.placeholder}</option>
                {field.options.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type}
                value={filters[field.key] || ''}
                onChange={(e) => onChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="prm-filter-input"
              />
            )}
          </div>
        ))}

        <div className="filter-actions">
          <button
            type="button"
            onClick={onReset}
            className="btn btn-ghost btn-sm"
          >
            <X size={14} /> Reset
          </button>
        </div>
      </div>
    </div>
  );
}
