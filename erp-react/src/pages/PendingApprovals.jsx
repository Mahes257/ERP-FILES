import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronRight,
  Clock,
  Factory,
  Package,
  RotateCw,
  ShoppingCart,
  User
} from 'lucide-react';
import api from '../api/axiosInstance';
import { formatRelativeTime } from '../data/notificationSource';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../utils/pendingApproval';

/**
 * Dedicated Pending Approvals page (sidebar → Pending Approvals).
 *
 * The list comes from GET /approvals/pending, which aggregates each module's
 * own approval queue in the backend — only records whose current state the
 * module's approve/reject action accepts. It never re-derives approvals from
 * notifications, and it never approves or rejects anything: opening a row just
 * opens the record, where the existing approval action (and its permission
 * checks) live.
 */

const MODULE_STYLES = {
  SALES: { label: 'SALES', icon: Package, accent: { background: '#F5F3FF', color: '#7C3AED' } },
  PURCHASE: { label: 'PURCHASE', icon: ShoppingCart, accent: { background: '#EFF6FF', color: '#2563EB' } },
  PRODUCTION: { label: 'PRODUCTION', icon: Factory, accent: { background: '#EEF6F3', color: '#0B4A3D' } }
};

const FALLBACK_STYLE = { label: 'ERP', icon: Clock, accent: { background: '#F3F4F6', color: '#6B7280' } };

function moduleStyle(module) {
  return MODULE_STYLES[module] || FALLBACK_STYLE;
}

const PRIORITY_COLORS = {
  LOW: 'bg-slate-100 text-slate-500',
  MEDIUM: 'bg-blue-50 text-blue-600',
  NORMAL: 'bg-blue-50 text-blue-600',
  HIGH: 'bg-orange-50 text-orange-600',
  URGENT: 'bg-red-50 text-red-600',
  CRITICAL: 'bg-red-50 text-red-600'
};

/**
 * Relative submission time ("2h ago"). The backend sends ISO-8601 — a local
 * date-time for the flat ERP entities, an instant for production records; the
 * shared formatter parses both.
 */
function formatSubmitted(item) {
  if (!item.submittedAt) return null;
  return formatRelativeTime(item.submittedAt);
}

function ApprovalCard({ item, onOpen }) {
  const style = moduleStyle(item.module);
  const Icon = style.icon;
  const priorityClass = PRIORITY_COLORS[String(item.priority || '').toUpperCase()];
  const submitted = formatSubmitted(item);

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="w-full text-left rounded-2xl border bg-surface border-slate-200/90 shadow-sm hover:shadow-md hover:border-[#0B4A3D]/25 transition-all duration-150 cursor-pointer group px-4 py-4 sm:px-5 flex items-start gap-4"
      aria-label={`${item.title} — open ${item.reference || 'record'}`}
    >
      <span
        className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: style.accent.background }}
        aria-hidden="true"
      >
        <Icon className="w-[18px] h-[18px]" style={{ color: style.accent.color }} />
      </span>

      <span className="flex-1 min-w-0">
        <span className="flex items-start justify-between gap-3">
          <span className="flex items-center gap-2 min-w-0 font-medium text-slate-700">
            <span className="truncate text-[13px] leading-snug">{item.title}</span>
          </span>
          {submitted && (
            <span className="text-[11px] text-slate-400 whitespace-nowrap mt-0.5 shrink-0">
              {submitted}
            </span>
          )}
        </span>

        {(item.party || item.submittedBy) && (
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-slate-600">
            {item.party && <span className="truncate">{item.party}</span>}
            {item.submittedBy && (
              <span className="inline-flex items-center gap-1 text-slate-500">
                <User className="w-3 h-3" aria-hidden="true" />
                {item.submittedBy}
              </span>
            )}
          </span>
        )}

        <span className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-500">
            {style.label}
          </span>
          {item.area && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-50 text-slate-500 border border-slate-200">
              {item.area}
            </span>
          )}
          {item.reference && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-600">
              {item.reference}
            </span>
          )}
          {item.status && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700">
              {item.status}
            </span>
          )}
          {item.priority && priorityClass && (
            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${priorityClass}`}>
              {item.priority}
            </span>
          )}
        </span>
      </span>

      <span
        className="shrink-0 mt-1 text-slate-300 group-hover:text-[#0B4A3D] transition-colors"
        aria-hidden="true"
      >
        <ChevronRight className="w-4 h-4" />
      </span>
    </button>
  );
}

export default function PendingApprovals() {
  const navigate = useNavigate();
  const [state, setState] = useState({ items: [], byModule: {}, loading: true, error: null });
  const [filter, setFilter] = useState('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await api.get('/approvals/pending');
      const payload = res?.data?.data ?? res?.data ?? {};
      setState({
        items: Array.isArray(payload.items) ? payload.items : [],
        byModule: payload.byModule || {},
        loading: false,
        error: null
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err?.response?.data?.message || 'Could not load pending approvals.'
      }));
    }
  }, []);

  // Initial read, plus a re-read whenever a mutation elsewhere refreshes the
  // sidebar badges — approving something in another tab/module removes it here
  // without a page reload. No polling.
  useEffect(() => {
    load();
    const onRefresh = () => load({ silent: true });
    window.addEventListener(PENDING_APPROVAL_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PENDING_APPROVAL_REFRESH_EVENT, onRefresh);
  }, [load]);

  const onManualRefresh = useCallback(async () => {
    setRefreshing(true);
    await load({ silent: true });
    setRefreshing(false);
  }, [load]);

  const total = state.items.length;
  const salesCount = Number(state.byModule?.SALES || 0);
  const purchaseCount = Number(state.byModule?.PURCHASE || 0);
  const productionCount = Number(state.byModule?.PRODUCTION || 0);

  const filters = useMemo(
    () => [
      { key: 'ALL', label: 'All', count: total },
      { key: 'SALES', label: 'Sales', count: salesCount },
      { key: 'PURCHASE', label: 'Purchase', count: purchaseCount },
      { key: 'PRODUCTION', label: 'Production', count: productionCount }
    ],
    [total, salesCount, purchaseCount, productionCount]
  );

  const visibleItems = useMemo(
    () => (filter === 'ALL' ? state.items : state.items.filter((item) => item.module === filter)),
    [state.items, filter]
  );

  const openItem = useCallback(
    (item) => {
      if (item?.route) navigate(item.route);
    },
    [navigate]
  );

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 px-3 pt-3.5 pb-10 sm:px-7 sm:pt-5 sm:pb-24 w-full max-w-[100vw] overflow-x-hidden">
      <div className="max-w-[760px] mx-auto">
        {/* Breadcrumb — part of the sticky page header (useStickyPageHeader) */}
        <div data-erp-sticky-header className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
          <span>VISHAK TECH</span>
          <span>&gt;</span>
          <span>Pending Approvals</span>
        </div>

        {/* Header — pinned with the breadcrumb above while the list scrolls */}
        <div data-erp-sticky-header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 tracking-tight">
              <span className="h-10 w-10 rounded-full bg-[#E8F0EE] flex items-center justify-center">
                <Clock className="w-5 h-5 text-[#0B4A3D]" aria-hidden="true" />
              </span>
              <span>Pending Approvals</span>
              <span
                className="inline-flex items-center justify-center rounded-full bg-[#0B4A3D] text-white text-[11px] font-bold shadow-sm h-[22px] min-w-[22px] px-[5px]"
                aria-label={`${total} pending approvals`}
              >
                {total > 99 ? '99+' : total}
              </span>
            </h1>
            <p className="mt-2 text-[12.5px] text-slate-500">
              Review and take action on approval requests across all modules.
            </p>
          </div>

          <button
            type="button"
            onClick={onManualRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#DCEAE5] px-4 h-[38px] rounded-[9px] transition-colors cursor-pointer select-none w-fit disabled:opacity-60 disabled:cursor-default"
          >
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        {/* Module filter tabs — sticky page controls, pinned under the header */}
        <div data-erp-sticky-header className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 border border-slate-200 rounded-lg mb-5 select-none">
          {filters.map((tab) => {
            const active = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                aria-pressed={active}
                className={`flex items-center gap-1.5 px-4 h-[34px] rounded-md text-[12.5px] font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-[#0B4A3D] text-white shadow-sm'
                    : 'bg-transparent text-slate-500 hover:text-slate-700 hover:bg-white'
                }`}
              >
                {tab.label}
                <span
                  className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                    active ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-500'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Loading */}
        {state.loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="inline-block h-7 w-7 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
            <p className="mt-3 text-xs font-semibold text-slate-400">Loading pending approvals...</p>
          </div>
        )}

        {/* Error */}
        {!state.loading && state.error && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-7 h-7 text-red-400" />
            </div>
            <p className="text-sm font-bold text-slate-600 mb-1">Pending approvals are unavailable</p>
            <p className="text-xs text-slate-400 mb-4">{state.error}</p>
            <button
              type="button"
              onClick={onManualRefresh}
              className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#0B4A3D] bg-[#E8F0EE] hover:bg-[#DCEAE5] px-4 h-[36px] rounded-[9px] transition-colors cursor-pointer"
            >
              <RotateCw className="w-4 h-4" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}

        {/* Nothing at all */}
        {!state.loading && !state.error && total === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
              <Clock className="w-7 h-7 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-600 mb-1">You&apos;re all caught up</p>
            <p className="text-xs text-slate-400">No approval requests are waiting for you.</p>
          </div>
        )}

        {/* Filter emptied the list */}
        {!state.loading && !state.error && total > 0 && visibleItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-14 w-14 rounded-full bg-[#F3F4F6] flex items-center justify-center mb-4">
              <Clock className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-sm font-bold text-slate-600 mb-1">Nothing pending in this module</p>
            <p className="text-xs text-slate-400">Other modules still have approvals waiting.</p>
          </div>
        )}

        {/* Approval rows */}
        {!state.loading && !state.error && visibleItems.length > 0 && (
          <ul className="space-y-3">
            {visibleItems.map((item) => (
              <li key={item.id}>
                <ApprovalCard item={item} onOpen={openItem} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
