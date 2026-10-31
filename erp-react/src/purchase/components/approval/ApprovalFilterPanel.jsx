/**
 * purchase/components/approval/ApprovalFilterPanel.jsx
 * ------------------------------------------------------------------
 * Advanced filter panel for the Approval Center: department,
 * requester, vendor, project, priority, amount range, created /
 * required dates, status, approval stage, buyer, company, branch,
 * warehouse — plus saved filters (save / load / delete) and a clear
 * action. Controlled by the page via `filters` + `onChange`.
 * ------------------------------------------------------------------
 */
import { useState } from 'react';
import { Filter, FolderOpen, Save, Trash2, X } from 'lucide-react';
import {
  BRANCHES, BUYERS, COMPANIES, DEPARTMENTS, PRIORITIES, PROJECTS,
  PR_STATUSES, USERS, VENDORS, WAREHOUSES
} from '../../constants';
import { APPROVAL_STAGES } from './approvalDecorators';

const LABEL = 'ac-filter-label';

function Select({ label, value, onChange, options, placeholder = 'All', requiredOptions = false }) {
  return (
    <label className="ac-filter-field">
      <span className={LABEL}>{label}</span>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="ac-filter-select"
      >
        <option value="">{placeholder}</option>
        {(requiredOptions ? ['All', ...options] : options).map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function DateField({ label, value, onChange, min }) {
  return (
    <label className="ac-filter-field">
      <span className={LABEL}>{label}</span>
      <input type="date" value={value || ''} min={min} onChange={(e) => onChange(e.target.value)} className="ac-filter-select" />
    </label>
  );
}

export default function ApprovalFilterPanel({
  open = false,
  filters = {},
  onChange,
  onClear,
  savedFilters = [],
  onSave,
  onLoad,
  onDelete
}) {
  const [savedName, setSavedName] = useState('');
  const [savedMenu, setSavedMenu] = useState(false);

  if (!open) return null;

  const vendorNames = (VENDORS || []).map((v) => (typeof v === 'string' ? v : v.name));

  const applySaved = (name) => {
    onLoad(name);
    setSavedMenu(false);
  };

  return (
    <div className="ac-filter-panel">
      <div className="ac-filter-header">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-[#0B4A3D]" />
          <span className="text-sm font-bold text-slate-800">Advanced Filters</span>
          {Object.keys(filters).filter((key) => filters[key] !== '' && filters[key] != null).length > 0 && (
            <span className="ac-filter-count">
              {Object.keys(filters).filter((key) => filters[key] !== '' && filters[key] != null).length} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              onClick={() => setSavedMenu((prev) => !prev)}
              className="ac-filter-btn"
            >
              <FolderOpen className="w-3.5 h-3.5" /> Saved Filters
            </button>
            {savedMenu && (
              <div className="ac-saved-menu">
                <div className="ac-saved-menu-title">Saved filter sets</div>
                {savedFilters.length === 0 && <p className="ac-saved-empty">No saved filters yet.</p>}
                {savedFilters.map((item) => (
                  <div key={item.name} className="ac-saved-row">
                    <button type="button" className="ac-saved-load" onClick={() => applySaved(item.name)}>
                      {item.name}
                    </button>
                    <button
                      type="button"
                      className="ac-saved-del"
                      onClick={() => onDelete(item.name)}
                      aria-label={`Delete ${item.name}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="ac-filter-save-group">
            <input
              type="text"
              value={savedName}
              onChange={(e) => setSavedName(e.target.value)}
              placeholder="Filter name"
              className="ac-filter-save-input"
              aria-label="Saved filter name"
            />
            <button
              type="button"
              className="ac-filter-btn"
              onClick={() => {
                if (!savedName.trim()) return;
                onSave(savedName.trim());
                setSavedName('');
              }}
            >
              <Save className="w-3.5 h-3.5" /> Save
            </button>
          </div>
          <button type="button" onClick={onClear} className="ac-filter-btn">
            <X className="w-3.5 h-3.5" /> Clear Filters
          </button>
        </div>
      </div>

      <div className="ac-filter-grid">
        <Select label="Department" value={filters.department} onChange={(v) => onChange('department', v)} options={DEPARTMENTS} />
        <Select label="Requester" value={filters.requester} onChange={(v) => onChange('requester', v)} options={USERS} />
        <Select label="Vendor" value={filters.vendor} onChange={(v) => onChange('vendor', v)} options={vendorNames} />
        <Select label="Project" value={filters.project} onChange={(v) => onChange('project', v)} options={PROJECTS} />
        <Select label="Priority" value={filters.priority} onChange={(v) => onChange('priority', v)} options={PRIORITIES} />
        <Select label="Status" value={filters.status} onChange={(v) => onChange('status', v)} options={PR_STATUSES} placeholder="All Statuses" />
        <Select label="Approval Stage" value={filters.stage} onChange={(v) => onChange('stage', v)} options={APPROVAL_STAGES.map((s) => s.label)} />
        <Select label="Buyer" value={filters.buyer} onChange={(v) => onChange('buyer', v)} options={BUYERS} />
        <Select label="Company" value={filters.company} onChange={(v) => onChange('company', v)} options={COMPANIES} />
        <Select label="Branch" value={filters.branch} onChange={(v) => onChange('branch', v)} options={BRANCHES} />
        <Select label="Warehouse" value={filters.warehouse} onChange={(v) => onChange('warehouse', v)} options={WAREHOUSES} />
        <div className="ac-filter-field">
          <span className={LABEL}>Amount Range</span>
          <div className="ac-filter-range">
            <input
              type="number"
              min="0"
              placeholder="Min"
              value={filters.amountMin ?? ''}
              onChange={(e) => onChange('amountMin', e.target.value)}
              className="ac-filter-select"
            />
            <span className="ac-filter-range-sep">–</span>
            <input
              type="number"
              min="0"
              placeholder="Max"
              value={filters.amountMax ?? ''}
              onChange={(e) => onChange('amountMax', e.target.value)}
              className="ac-filter-select"
            />
          </div>
        </div>
        <DateField label="Created Date From" value={filters.createdFrom} onChange={(v) => onChange('createdFrom', v)} />
        <DateField label="Created Date To" value={filters.createdTo} onChange={(v) => onChange('createdTo', v)} />
        <DateField label="Required Date From" value={filters.requiredFrom} onChange={(v) => onChange('requiredFrom', v)} />
        <DateField label="Required Date To" value={filters.requiredTo} onChange={(v) => onChange('requiredTo', v)} />
      </div>
    </div>
  );
}
