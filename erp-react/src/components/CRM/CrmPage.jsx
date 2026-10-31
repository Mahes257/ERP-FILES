import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Search, Filter, X,
  Archive, RotateCcw, Trash2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useLeads from '../../hooks/useLeads';
import leadService from '../../services/leadService';
import useDebounce from '../../hooks/useDebounce';
import useClickOutside from '../../hooks/useClickOutside';
import LeadTable from '../LeadTable';
import { ConfirmDialog, EditableMasterDropdown, useToast, NewCreationMenu } from '../Common';
import ExportDropdown from '../Export';
import { LeadViewModal } from '../LeadDetail';
import ColumnsDropdown from '../LeadTable/ColumnsDropdown';
import SalesKpiCards from '../SalesTable/SalesKpiCards';
import { STAGES, LEAD_STATUSES, LEAD_SOURCES } from '../../utils/leadConstants';
import { formatINR, formatDate, getInitials, avatarColor } from '../../utils/leadHelpers';
import { buildRowActions, shareLead, sendEmail } from '../../utils/leadActions';

const DEFAULT_TABS = [
  { value: 'Active', label: 'Active', filterKey: 'status', filterValue: 'Active' },
  { value: 'Inactive', label: 'Inactive', filterKey: 'status', filterValue: 'Inactive' },
  { value: 'Deleted', label: 'Deleted', filterKey: 'status', filterValue: 'Archived' }
];

const CONFIRM_CONFIG = {
  archive: { title: 'Soft Delete', icon: Archive, variant: 'warning', confirmLabel: 'Soft Delete' },
  restore: { title: 'Restore Record', icon: RotateCcw, variant: 'default', confirmLabel: 'Restore' },
  delete: { title: 'Permanent Delete', icon: Trash2, variant: 'danger', confirmLabel: 'Delete Permanently' },
  bulkArchive: { title: 'Soft Delete Selected', icon: Archive, variant: 'warning', confirmLabel: 'Soft Delete' },
  bulkRestore: { title: 'Restore Selected', icon: RotateCcw, variant: 'default', confirmLabel: 'Restore' },
  bulkDelete: { title: 'Permanent Delete Selected', icon: Trash2, variant: 'danger', confirmLabel: 'Delete Permanently' }
};

const SUCCESS_MESSAGES = {
  archive: 'Record archived successfully',
  restore: 'Record restored successfully',
  delete: 'Record permanently deleted',
  bulkArchive: (count) => `${count} record(s) archived`,
  bulkRestore: (count) => `${count} record(s) restored`,
  bulkDelete: (count) => `${count} record(s) permanently deleted`
};

const DEFAULT_RENDERERS = {
  name: (row) => (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[10px] ${avatarColor(row.name)} border border-black/5`}>
        {getInitials(row.name)}
      </div>
      <span className="text-slate-900 group-hover:text-emerald-700 transition-colors cursor-pointer">
        {row.name}
      </span>
    </div>
  ),
  company: (row) => <span className="text-slate-600">{row.company || '—'}</span>,
  value: (row) => <span className="font-bold text-slate-800">{formatINR(row.value)}</span>,
  stage: (row) => (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
      STAGES.find((s) => s.value === row.stage)?.chip || 'bg-slate-100 text-slate-600 border border-slate-200'
    }`}>
      {row.stage}
    </span>
  ),
  owner: (row) => <span className="text-slate-600">{row.owner || '—'}</span>,
  contact: (row) => (
    <div className="flex flex-col gap-1">
      <span className="text-slate-700">{row.phone}</span>
      <span className="text-[10px] text-slate-400 font-normal">{row.email}</span>
    </div>
  ),
  source: (row) => <span className="text-slate-600">{row.source || '—'}</span>,
  date: (row) => <span className="text-slate-500 font-medium">{formatDate(row.date)}</span>,
  country: (row) => <span className="text-slate-600">{row.country || '—'}</span>,
  status: (row) => {
    const color = row.status === 'Active'
      ? 'bg-emerald-100 text-emerald-700'
      : row.status === 'Inactive'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-rose-100 text-rose-700';
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${color}`}>
        {row.status}
      </span>
    );
  }
};

export default function CrmPage({
  title,
  breadcrumb = [],
  endpoint,
  noun = 'records',
  filename,
  columns = [],
  renderers = {},
  cards = null,
  tabs = DEFAULT_TABS,
  addButton = null,
  bulkModuleKey = null,
  pageSize = 10,
  searchPlaceholder = 'Search by Name, Company, Contact info...',
  emptyMessage = 'No records found matching your criteria.',
  errorMessage = 'Failed to load records. Please try again.',
  actionOptions = {},
  showTabs = true,
  onRowAction: extraRowAction
}) {
  const navigate = useNavigate();
  const toast = useToast();
  const {
    leads,
    loading,
    error,
    pagination,
    setSearch,
    setFilter,
    resetFilters,
    filters,
    toggleSort,
    sortKey,
    sortDirection,
    goToPage,
    changePageSize,
    refresh,
    archiveLead,
    restoreLead,
    deleteLead,
    markInactive,
    markActive,
    bulkArchive,
    bulkRestore,
    bulkDelete,
    duplicateLead
  } = useLeads({ pageSize, endpoint });

  const [activeTab, setActiveTab] = useState(tabs[0]?.value || '');
  const [selectedIds, setSelectedIds] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [viewRow, setViewRow] = useState(null);
  const storageKey = `vishak:crm:${endpoint}:columns`;
  const [columnsState, setColumnsState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (Array.isArray(saved)) {
        const map = Object.fromEntries(saved.map((entry) => [entry.key, entry.visible]));
        return columns.map((col) => ({ ...col, visible: map[col.key] ?? col.visible }));
      }
    } catch { /* ignore invalid stored columns */ }
    return columns;
  });
  const filterRef = useRef(null);

  const debouncedSearch = useDebounce(searchInput, 400);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(debouncedSearch), 0);
    return () => clearTimeout(timer);
  }, [debouncedSearch, setSearch]);

  useClickOutside(filterRef, () => setShowFilters(false), showFilters);

  const mergedRenderers = useMemo(() => ({ ...DEFAULT_RENDERERS, ...renderers }), [renderers]);

  const { totalCount } = pagination;
  const { page, pageSize: currentPageSize } = pagination;
  const start = totalCount === 0 ? 0 : (page - 1) * currentPageSize + 1;
  const end = Math.min(page * currentPageSize, totalCount);

  const handleTabChange = (tab) => {
    setActiveTab(tab.value);
    setSelectedIds([]);
    setFilter(tab.filterKey, tab.filterValue || '');
  };

  const handleClearFilters = () => {
    resetFilters();
    setActiveTab(tabs[0]?.value || '');
  };

  const selectedOnPage = useMemo(
    () => leads.filter((row) => selectedIds.includes(row.id)),
    [leads, selectedIds]
  );

  const bulkActions = useMemo(() => {
    if (selectedIds.length === 0) return [];
    const anyArchived = selectedOnPage.some((row) => row.status === 'Archived');
    const anyActive = selectedOnPage.some((row) => row.status !== 'Archived');
    const actions = [];
    if (anyActive) actions.push({ key: 'bulkArchive', label: 'Soft Delete', icon: Archive, variant: 'default' });
    if (anyArchived) actions.push({ key: 'bulkRestore', label: 'Restore', icon: RotateCcw, variant: 'default' });
    actions.push({ key: 'bulkDelete', label: 'Delete', icon: Trash2, variant: 'danger' });
    return actions;
  }, [selectedIds, selectedOnPage]);

  const handleDuplicate = useCallback(async (row) => {
    const result = await duplicateLead(row.id);
    if (result.ok) toast.success(`${row.name} duplicated`);
    else toast.error(result.error?.message || 'Duplicate failed');
  }, [duplicateLead, toast]);

  const handleShare = useCallback(async (row) => {
    const result = await shareLead(row);
    if (result.ok && result.action === 'copy') toast.success('Share link copied to clipboard');
    else if (!result.ok) toast.error('Unable to share this record');
  }, [toast]);

  const handleStatusChange = useCallback(async (action, row) => {
    const result = action === 'inactive' ? await markInactive(row.id) : await markActive(row.id);
    if (result.ok) {
      toast.success(action === 'inactive' ? `${row.name} marked inactive` : `${row.name} activated`);
    } else {
      toast.error(result.error?.message || 'Operation failed');
    }
  }, [markInactive, markActive, toast]);

  // Bulk Upload module key for the New â–¼ dropdown (Contacts → contact flow).
  const resolvedBulkModuleKey =
    bulkModuleKey || ({ contacts: 'contact' }[endpoint] || endpoint);

  const handleRowAction = useCallback((actionKey, row) => {
    switch (actionKey) {
      case 'view':
        setViewRow(row);
        break;
      case 'edit':
        navigate(`/leads/${row.id}/edit`);
        break;
      case 'duplicate':
        handleDuplicate(row);
        break;
      case 'share':
        handleShare(row);
        break;
      case 'sendEmail':
        sendEmail(row);
        break;
      case 'markInactive':
        handleStatusChange('inactive', row);
        break;
      case 'markActive':
        handleStatusChange('active', row);
        break;
      case 'archive':
        setConfirmState({ type: 'archive', ids: [row.id], label: row.name });
        break;
      case 'restore':
        setConfirmState({ type: 'restore', ids: [row.id], label: row.name });
        break;
      case 'delete':
        setConfirmState({ type: 'delete', ids: [row.id], label: row.name });
        break;
      default:
        extraRowAction?.(actionKey, row);
        break;
    }
  }, [navigate, extraRowAction, handleDuplicate, handleShare, handleStatusChange]);

  const handleBulkAction = (actionKey, ids) => {
    setConfirmState({ type: actionKey, ids });
  };

  const buildConfirmMessage = (state) => {
    const count = state.ids.length;
    const label = count === 1 && state.label ? `"${state.label}"` : `${count} selected ${noun}`;
    switch (state.type) {
      case 'archive':
        return `Soft delete ${label}? Deleted records can be restored anytime.`;
      case 'restore':
        return `Restore ${label} to active records?`;
      case 'delete':
        return `Permanently delete ${label}? This action cannot be undone.`;
      case 'bulkArchive':
        return `Soft delete ${count} selected ${noun}? Deleted records can be restored anytime.`;
      case 'bulkRestore':
        return `Restore ${count} selected ${noun} to active records?`;
      case 'bulkDelete':
        return `Permanently delete ${count} selected ${noun}? This action cannot be undone.`;
      default:
        return '';
    }
  };

  const executeConfirm = async () => {
    if (!confirmState) return;
    const { type, ids } = confirmState;
    setConfirmState((prev) => ({ ...prev, loading: true }));
    let result;
    switch (type) {
      case 'archive':
        result = await archiveLead(ids[0]);
        break;
      case 'restore':
        result = await restoreLead(ids[0]);
        break;
      case 'delete':
        result = await deleteLead(ids[0]);
        break;
      case 'bulkArchive':
        result = await bulkArchive(ids);
        break;
      case 'bulkRestore':
        result = await bulkRestore(ids);
        break;
      case 'bulkDelete':
        result = await bulkDelete(ids);
        break;
      default:
        result = { ok: false, error: { message: 'Unknown operation' } };
    }

    if (result.ok) {
      const message = typeof SUCCESS_MESSAGES[type] === 'function' ? SUCCESS_MESSAGES[type](ids.length) : SUCCESS_MESSAGES[type];
      toast.success(message);
      setSelectedIds([]);
      setConfirmState(null);
    } else {
      toast.error(result.error?.message || 'Operation failed');
      setConfirmState((prev) => ({ ...prev, loading: false }));
    }
  };

  const toggleColumn = (key) => {
    setColumnsState((prev) => {
      const next = prev.map((col) => (col.key === key ? { ...col, visible: col.visible === false } : col));
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify(next.map((col) => ({ key: col.key, visible: col.visible !== false })))
        );
      } catch { /* ignore storage failure */ }
      return next;
    });
  };

  const confirmConfig = confirmState ? CONFIRM_CONFIG[confirmState.type] : null;
  const filterCount = Object.keys(filters).length;

  return (
    <div className="purchase-page cpr-page flex-1">

      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        {breadcrumb.map((crumb, index) => (
          <span key={index} className="flex items-center gap-2">
            {index > 0 && <span>&gt;</span>}
            <span className={index === breadcrumb.length - 1 ? 'text-slate-600' : ''}>{crumb}</span>
          </span>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
        <div className="flex items-center gap-2.5">
          {addButton && (
            <NewCreationMenu
              moduleKey={resolvedBulkModuleKey}
              createTo={addButton.to}
              buttonLabel="New"
              buttonClassName="flex items-center gap-2 bg-[#0B4A3D] hover:bg-[#083D34] text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer select-none"
              dedupeService={{ list: (params) => leadService.listCrm(endpoint, params) }}
              openInNewTab
            />
          )}
        </div>
      </div>

      {cards && (
        <SalesKpiCards
          cards={cards({ list: leads, totalCount }).map((card) => ({
            key: card.key,
            label: card.label,
            value: card.value,
            icon: card.icon,
            color: card.color || '#0B4A3D',
            static: true
          }))}
          activeKpi=""
          onSelect={() => {}}
        />
      )}

      {showTabs && (
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto select-none no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab)}
              className={`text-xs font-semibold px-4 py-1.5 rounded-full transition-all border whitespace-nowrap cursor-pointer ${
                activeTab === tab.value
                  ? 'bg-surface border-slate-200 text-slate-900 shadow-sm'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              {tab.label}
              {activeTab === tab.value && ` (${totalCount})`}
            </button>
          ))}
        </div>
      )}

      <div className="bg-surface border border-slate-200 rounded-xl p-3 flex flex-col lg:flex-row items-center justify-between gap-4 mb-4 shadow-sm">
        <div className="flex-1 w-full relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full bg-slate-50 border border-slate-200/80 rounded-lg pl-10 pr-9 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner"
          />
          {searchInput && (
            <button
              onClick={() => setSearchInput('')}
              className="absolute right-3 p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 w-full lg:w-auto justify-end select-none">
          <div className="relative" ref={filterRef}>
            <button
              onClick={() => setShowFilters((prev) => !prev)}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                filterCount > 0
                  ? 'bg-[#0B4A3D] text-white border-[#0B4A3D]'
                  : 'bg-surface border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Filter className="w-3.5 h-3.5" /> <span>Filters</span>
              {filterCount > 0 && (
                <span className="bg-white/20 text-[10px] px-1.5 rounded-full">{filterCount}</span>
              )}
            </button>

            {showFilters && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-surface border border-slate-200 rounded-xl shadow-lg p-4 z-50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Filters</span>
                  {filterCount > 0 && (
                    <button
                      onClick={handleClearFilters}
                      className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <X className="w-3 h-3" /> Clear
                    </button>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Stage</label>
                  <select
                    value={filters.stage || ''}
                    onChange={(e) => setFilter('stage', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                  >
                    <option value="">All Stages</option>
                    {STAGES.map((stage) => (
                      <option key={stage.value} value={stage.value}>{stage.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Status</label>
                  <select
                    value={filters.status || ''}
                    onChange={(e) => {
                      setFilter('status', e.target.value);
                      const match = tabs.find((tab) => tab.filterValue === e.target.value);
                      setActiveTab(match ? match.value : '');
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                  >
                    <option value="">All Statuses</option>
                    {LEAD_STATUSES.map((status) => (
                      <option key={status.value} value={status.value}>{status.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Owner</label>
                  <EditableMasterDropdown
                    masterKey="sales_executives"
                    value={filters.owner || ''}
                    placeholder="All Owners"
                    onChange={(v) => setFilter('owner', v)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Source</label>
                  <select
                    value={filters.source || ''}
                    onChange={(e) => setFilter('source', e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                  >
                    <option value="">All Sources</option>
                    {LEAD_SOURCES.map((source) => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">From</label>
                    <input
                      type="date"
                      value={filters.dateFrom || ''}
                      onChange={(e) => setFilter('dateFrom', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">To</label>
                    <input
                      type="date"
                      value={filters.dateTo || ''}
                      onChange={(e) => setFilter('dateTo', e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Min Value</label>
                    <input
                      type="number"
                      value={filters.minValue ?? ''}
                      onChange={(e) => setFilter('minValue', e.target.value)}
                      placeholder="0"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wide">Max Value</label>
                    <input
                      type="number"
                      value={filters.maxValue ?? ''}
                      onChange={(e) => setFilter('maxValue', e.target.value)}
                      placeholder="Any"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 outline-none focus:border-emerald-600/50"
                    />
                  </div>
                </div>

                <button
                  onClick={() => setShowFilters(false)}
                  className="w-full bg-[#0B4A3D] hover:bg-[#083D34] text-white text-xs font-bold py-2 rounded-lg transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          <ColumnsDropdown columns={columnsState} onToggle={toggleColumn} />

          <ExportDropdown leads={leads} columns={columnsState} filename={filename} noun={noun} />
        </div>
      </div>

      <div className="text-xs font-medium text-slate-500 mb-4 ml-1">
        Showing {start} to {end} of {totalCount} entries
      </div>

      <LeadTable
        columns={columnsState}
        data={leads}
        loading={loading}
        error={error}
        sortKey={sortKey}
        sortDirection={sortDirection}
        onSort={toggleSort}
        pagination={pagination}
        onPageChange={goToPage}
        onPageSizeChange={changePageSize}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        renderers={mergedRenderers}
        rowActions={(row) => buildRowActions(row, actionOptions)}
        onRowAction={handleRowAction}
        bulkActions={bulkActions}
        onBulkAction={handleBulkAction}
        selectedLabel={noun}
        bulkBarExtra={
          <ExportDropdown
            leads={selectedOnPage}
            columns={columnsState}
            filename={`${filename}-selected`}
            noun={noun}
            variant="dark"
            buttonLabel="Export"
          />
        }
        onRetry={refresh}
        errorMessage={errorMessage}
        emptyMessage={emptyMessage}
      />

      {confirmState && confirmConfig && (
        <ConfirmDialog
          open={confirmState !== null}
          title={confirmConfig.title}
          message={buildConfirmMessage(confirmState)}
          confirmLabel={confirmConfig.confirmLabel}
          variant={confirmConfig.variant}
          icon={confirmConfig.icon}
          loading={confirmState.loading || false}
          onConfirm={executeConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      <LeadViewModal
        key={viewRow?.id ?? 'view-modal-closed'}
        open={viewRow !== null}
        lead={viewRow}
        onClose={() => setViewRow(null)}
      />

    </div>
  );
}
