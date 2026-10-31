/**
 * purchase/components/ReportFilters.jsx
 * ------------------------------------------------------------------
 * Global filter bar for all Purchase Reports pages.
 * Provides date range, department, vendor, category, and status filters
 * with Apply / Reset / Refresh actions.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useState } from 'react';
import { Calendar, ChevronDown, RefreshCw, RotateCcw, Search } from 'lucide-react';

const DATE_RANGES = [
  { value: 'last-30-days', label: 'Last 30 Days' },
  { value: 'last-3-months', label: 'Last 3 Months' },
  { value: 'last-6-months', label: 'Last 6 Months' },
  { value: 'last-12-months', label: 'Last 12 Months' },
  { value: 'today', label: 'Today' },
  { value: 'this-week', label: 'This Week' },
  { value: 'this-month', label: 'This Month' },
  { value: 'this-quarter', label: 'This Quarter' },
  { value: 'this-year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' }
];

const EMPTY_FILTERS = {
  dateRange: 'last-12-months',
  customStart: '',
  customEnd: '',
  department: '',
  vendor: '',
  category: '',
  project: '',
  poStatus: '',
  invoiceStatus: '',
  paymentStatus: ''
};

function FilterSelect({ label, value, onChange, options = [], placeholder = 'All' }) {
  return (
    <div className="min-w-[140px]">
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-9 pl-2.5 pr-8 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg appearance-none cursor-pointer hover:border-[#075E54] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54]/20 outline-none transition-colors"
        >
          <option value="">{placeholder}</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

export default function ReportFilters({ filters: externalFilters, onApply, onReset, loading = false, filterOptions = {} }) {
  const [local, setLocal] = useState(() => externalFilters ? { ...EMPTY_FILTERS, ...externalFilters } : EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (externalFilters) {
      setLocal((prev) => {
        const next = { ...prev, ...externalFilters };
        return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
      });
    }
  }, [externalFilters]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const set = useCallback((key, val) => {
    setLocal((prev) => ({ ...prev, [key]: val }));
  }, []);

  const handleApply = useCallback(() => {
    onApply?.(local);
  }, [local, onApply]);

  const handleReset = useCallback(() => {
    setLocal(EMPTY_FILTERS);
    onReset?.();
  }, [onReset]);

  const activeFilterCount = [
    local.department,
    local.vendor,
    local.category,
    local.project,
    local.poStatus,
    local.invoiceStatus,
    local.paymentStatus
  ].filter(Boolean).length;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5">
      {/* Primary row: Date range + actions */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px]">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Date Range</label>
          <div className="relative">
            <select
              value={local.dateRange}
              onChange={(e) => set('dateRange', e.target.value)}
              className="w-full h-9 pl-2.5 pr-8 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg appearance-none cursor-pointer hover:border-[#075E54] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54]/20 outline-none transition-colors"
            >
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {local.dateRange === 'custom' && (
          <>
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">From</label>
              <input
                type="date"
                value={local.customStart}
                onChange={(e) => set('customStart', e.target.value)}
                className="w-full h-9 px-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-[#075E54] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54]/20 outline-none transition-colors"
              />
            </div>
            <div className="min-w-[140px]">
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                value={local.customEnd}
                onChange={(e) => set('customEnd', e.target.value)}
                className="w-full h-9 px-2.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:border-[#075E54] focus:border-[#075E54] focus:ring-1 focus:ring-[#075E54]/20 outline-none transition-colors"
              />
            </div>
          </>
        )}

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            More Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-[#075E54] text-white text-[10px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="h-9 px-4 text-xs font-bold text-white bg-[#075E54] rounded-lg hover:bg-[#0B4A3D] transition-colors cursor-pointer disabled:opacity-50"
          >
            Apply
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="h-9 px-3 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={loading}
            className="h-9 px-3 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Advanced filters */}
      {showAdvanced && (
        <div className="flex flex-wrap items-end gap-3 mt-3 pt-3 border-t border-slate-100">
          <FilterSelect label="Department" value={local.department} onChange={(v) => set('department', v)} options={filterOptions.departments || []} />
          <FilterSelect label="Vendor" value={local.vendor} onChange={(v) => set('vendor', v)} options={filterOptions.vendors || []} />
          <FilterSelect label="Category" value={local.category} onChange={(v) => set('category', v)} options={filterOptions.categories || []} />
          <FilterSelect label="Project" value={local.project} onChange={(v) => set('project', v)} options={filterOptions.projects || []} />
          <FilterSelect label="PO Status" value={local.poStatus} onChange={(v) => set('poStatus', v)} options={filterOptions.poStatuses || []} />
          <FilterSelect label="Invoice Status" value={local.invoiceStatus} onChange={(v) => set('invoiceStatus', v)} options={filterOptions.invoiceStatuses || []} />
          <FilterSelect label="Payment Status" value={local.paymentStatus} onChange={(v) => set('paymentStatus', v)} options={filterOptions.paymentStatuses || []} />
        </div>
      )}
    </div>
  );
}
