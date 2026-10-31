/**
 * DetailPage — the shared ERP detail/view page language.
 * ------------------------------------------------------------------
 * One set of building blocks that reproduces the CPR View page's structure
 * (sticky header card → tab strip → two-column body with a right summary rail)
 * so Leads, Clients and Follow-ups render as proper ERP detail pages instead of
 * each module inventing its own layout.
 *
 * Everything here is presentation only: no module fields, no data fetching.
 * Callers pass their own real fields, relationships and actions.
 *
 * Visual contract (kept identical to CprView.jsx):
 *   page      → bg-app, p-4 sm:p-6
 *   card      → bg-surface border border-slate-200 rounded-xl shadow-sm p-5
 *   card title→ text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider
 *   row       → label w-[130px] slate-500 + value slate-700, hairline divider
 *   grid      → 1fr / 340px rail, sticky at lg
 */
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, Inbox } from 'lucide-react';
import useClickOutside from '../../hooks/useClickOutside';
import { detailActionClass } from '../Common/detailActionClasses';

/**
 * Page wrapper — matches the CPR page container exactly.
 *
 * `className` is an optional, purely additive hook for a module that needs to
 * scope extra design-system CSS to its own detail pages (the CRM view pages
 * carry `erp-detail-scope` for the shared detail-action button standard,
 * styles/erp-detail-scope.css). Omitting it renders this wrapper exactly as
 * before, so every existing caller is unaffected.
 */
export function DetailPage({ children, className = '' }) {
  return (
    <div
      className={`flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden ${className}`.trim()}
    >
      {children}
    </div>
  );
}

/** Breadcrumb: items = [{ label, to? }] — the last item renders as current. */
export function DetailBreadcrumb({ items = [] }) {
  const navigate = useNavigate();
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none"
    >
      {items.map((item, index) => (
        <span key={`${item.label}-${index}`} className="flex items-center gap-2">
          {index > 0 && <span className="text-slate-300">&gt;</span>}
          {item.to && index < items.length - 1 ? (
            <button
              type="button"
              onClick={() => navigate(item.to)}
              className="hover:text-[#0B4A3D] transition-colors cursor-pointer"
            >
              {item.label}
            </button>
          ) : (
            <span className={index === items.length - 1 ? 'text-slate-600' : ''}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// Action roles → the ONE shared ERP detail-action button class. Defined in
// Common/detailActionClasses.js so every detail-page renderer maps roles
// identically (no per-page class maps, no second green).
// eslint-disable-next-line react-refresh/only-export-components
export { DETAIL_ACTION_CLASSES } from '../Common/detailActionClasses';

/**
 * Sticky header + tab strip.
 * `initial` renders the dark identity tile (fallback: first letter of title).
 * `chips`/`meta` are arrays of already-styled nodes so each module keeps its
 * own badges; `actions` = [{ key, label, icon, style, action }] where `style`
 * is a role key of DETAIL_ACTION_CLASSES.
 * `moreActions` (optional) renders an overflow "More" menu with the same
 * item shape plus `divider: true` separators and `danger` styling.
 *
 * The action area is the ERP standard: [<- Back] [Edit] [PDF] [Print]
 * [... More v] — all buttons painted by .erp-detail-action.
 */
export function DetailHeader({
  initial,
  title,
  titleSuffix,
  chips,
  meta,
  actions = [],
  moreActions = [],
  moreLabel = 'More',
  onBack,
  backLabel = 'Back',
  tabs = [],
  activeTab,
  onTabChange,
  busy = false
}) {
  const tile = (initial || title || '?').charAt(0).toUpperCase();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  useClickOutside(moreRef, () => setMoreOpen(false), moreOpen);
  return (
    <div className="sticky top-0 z-20 bg-app">
      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-[52px] h-[52px] rounded-xl bg-gradient-to-br from-[#083D34] to-[#083D34] text-white flex items-center justify-center text-xl font-bold shrink-0">
              {tile}
            </div>
            <div className="min-w-0">
              <h1 className="text-[22px] font-bold text-slate-900 leading-tight truncate">
                {title}
                {titleSuffix ? <span className="text-slate-400 font-semibold"> {titleSuffix}</span> : null}
              </h1>
              {chips?.length ? (
                <div className="flex flex-wrap items-center gap-2 mt-1.5">{chips}</div>
              ) : null}
              {meta?.length ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">{meta}</div>
              ) : null}
            </div>
          </div>
          <div className="erp-detail-actions">
            {onBack && (
              <button type="button" onClick={onBack} className="erp-detail-action">
                <ArrowLeft /> {backLabel}
              </button>
            )}
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.key}
                  type="button"
                  onClick={action.action}
                  disabled={busy || action.disabled}
                  className={detailActionClass(action.style)}
                >
                  {Icon && <Icon />} {action.label}
                </button>
              );
            })}
            {moreActions.length > 0 && (
              <div className="relative" ref={moreRef}>
                <button
                  type="button"
                  onClick={() => setMoreOpen((prev) => !prev)}
                  className="erp-detail-action erp-detail-action--more"
                  aria-haspopup="menu"
                  aria-expanded={moreOpen}
                >
                  {moreLabel} <ChevronDown aria-hidden="true" />
                </button>
                {moreOpen && (
                  <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[210px] bg-surface border border-slate-200 rounded-xl shadow-lg p-1.5">
                    {moreActions.map((item, index) =>
                      item.divider ? (
                        <div key={`more-divider-${index}`} className="h-px bg-slate-100 my-1 mx-2" />
                      ) : (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            setMoreOpen(false);
                            item.action();
                          }}
                          className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium text-left rounded-lg hover:bg-slate-50 transition-colors cursor-pointer ${
                            item.danger ? 'text-rose-600' : 'text-slate-600'
                          }`}
                        >
                          {item.icon && <item.icon className="w-3.5 h-3.5" />} {item.label}
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {tabs.length > 0 && (
        <div className="flex items-center gap-1 border-b-2 border-slate-200 mt-3 overflow-x-auto no-scrollbar">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => onTabChange?.(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-0.5 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#0B4A3D] text-[#0B4A3D] font-semibold'
                    : 'border-transparent text-slate-500 hover:text-[#0B4A3D]'
                }`}
              >
                {Icon && <Icon className="w-3.5 h-3.5" />}
                {t.label}
                {t.count != null && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                      active ? 'bg-[#E8F0EE] text-[#0B4A3D]' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Two-column body: main content + right summary rail (CPR proportions). */
export function DetailTwoColumn({ children, rail }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4 items-start mt-4">
      <div className="flex flex-col gap-4">{children}</div>
      <div className="flex flex-col gap-4 lg:sticky lg:top-40">{rail}</div>
    </div>
  );
}

/** White card with the CPR section title. `count` is shown as "(n)". */
export function DetailCard({ icon: Icon, title, count, children, className = '' }) {
  return (
    <div className={`bg-surface border border-slate-200 rounded-xl shadow-sm p-5 ${className}`}>
      <h3 className="flex items-center gap-2 text-[13px] font-bold text-[#0B4A3D] uppercase tracking-wider mb-3">
        {Icon && <Icon className="w-4 h-4" />}
        {title}
        {count != null && (
          <span className="normal-case font-semibold text-slate-400 text-xs">({count})</span>
        )}
      </h3>
      {children}
    </div>
  );
}

/**
 * Tint applied to a row while a document version is being compared. Deliberately
 * pale — a 2px left rule plus a light wash — and only ever applied when the
 * caller passes `change`, so ordinary detail pages are unaffected.
 */
const ROW_CHANGE_TINT = {
  added: 'bg-emerald-50/70 border-l-2 border-emerald-300 pl-2 -ml-2',
  modified: 'bg-amber-50/70 border-l-2 border-amber-300 pl-2 -ml-2',
  removed: 'bg-rose-50/70 border-l-2 border-rose-300 pl-2 -ml-2'
};

/**
 * Label/value line inside a card (CPR `Row`).
 *
 * `change` is optional and used by version comparison to mark — and only to
 * mark — the rows a revision actually changed, with the previous value shown
 * underneath. Without it the row renders exactly as before.
 */
export function DetailRow({ label, children, change }) {
  return (
    <div
      className={`flex py-1.5 text-[13px] border-b border-slate-100 last:border-b-0 ${
        change ? ROW_CHANGE_TINT[change.type] || ROW_CHANGE_TINT.modified : ''
      }`.trim()}
    >
      <span className="w-[130px] shrink-0 text-slate-500 font-medium text-xs">{label}</span>
      <span className="text-slate-700 font-medium flex-1 break-words min-w-0">
        {children ?? '—'}
        {change && change.type === 'modified' && (
          <span className="block text-[10px] font-medium text-amber-700/80 mt-0.5">
            Previous: {change.previousValue}
          </span>
        )}
        {change && change.type === 'added' && (
          <span className="block text-[10px] font-medium text-emerald-700/80 mt-0.5">Added in this version</span>
        )}
        {change && change.type === 'removed' && (
          <span className="block text-[10px] font-medium text-rose-700/80 mt-0.5">
            Removed in this version (was {change.previousValue})
          </span>
        )}
      </span>
    </div>
  );
}

/**
 * Stacked label-above-value field, for grid layouts.
 *
 * `change` is optional and only supplied while comparing document versions: it
 * lightly tints the field and states the previous value. Without it the field
 * renders exactly as before.
 */
export function DetailField({ label, value, change }) {
  const empty = value == null || value === '';
  return (
    <div
      className={`min-w-0 rounded ${
        change ? ROW_CHANGE_TINT[change.type] || ROW_CHANGE_TINT.modified : ''
      }`.trim()}
    >
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className="text-xs font-semibold text-slate-800 mt-0.5 break-words whitespace-pre-wrap">
        {empty ? '—' : value}
      </div>
      {change && change.type === 'modified' && (
        <div className="text-[10px] font-medium text-amber-700/80 mt-0.5">Previous: {change.previousValue}</div>
      )}
      {change && change.type === 'added' && (
        <div className="text-[10px] font-medium text-emerald-700/80 mt-0.5">Added in this version</div>
      )}
      {change && change.type === 'removed' && (
        <div className="text-[10px] font-medium text-rose-700/80 mt-0.5">
          Removed in this version (was {change.previousValue})
        </div>
      )}
    </div>
  );
}

export function DetailFieldGrid({ fields = [], className = 'grid grid-cols-1 sm:grid-cols-2 gap-3' }) {
  return (
    <div className={className}>
      {fields.map((field, index) => {
        const f = Array.isArray(field) ? { label: field[0], value: field[1] } : field;
        return <DetailField key={`${f.label}-${index}`} label={f.label} value={f.value} change={f.change} />;
      })}
    </div>
  );
}

/** Empty state used by every section when a module has no records. */
export function DetailEmpty({ icon: Icon = Inbox, title = 'Nothing here yet', subtitle }) {
  return (
    <div className="text-center py-10">
      <Icon className="w-9 h-9 text-slate-300 mx-auto mb-3" />
      <h4 className="text-[15px] font-bold text-slate-600 mb-1">{title}</h4>
      {subtitle && <p className="text-[13px] text-slate-400">{subtitle}</p>}
    </div>
  );
}

/** Inline loading row for a card body. */
export function DetailLoading({ label = 'Loading…' }) {
  return (
    <div className="py-8 text-center text-xs font-semibold text-slate-400 flex items-center justify-center gap-2">
      <span className="h-3.5 w-3.5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
      {label}
    </div>
  );
}

/** Pill badge — `tone` picks the colour family. */
const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-600 border border-slate-200',
  green: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
  amber: 'bg-amber-50 text-amber-700 border border-amber-100',
  rose: 'bg-rose-50 text-rose-600 border border-rose-100',
  blue: 'bg-[#EFF6FF] text-[#2563EB] border border-[#DBEAFE]',
  slate: 'bg-slate-100 text-slate-600 border border-slate-200'
};

export function DetailBadge({ children, tone = 'neutral', title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${
        BADGE_TONES[tone] || BADGE_TONES.neutral
      }`}
    >
      {children}
    </span>
  );
}

/** Linked-record button used inside Summary / Linked Records cards. */
export function DetailLink({ onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="inline-flex items-center gap-1 text-[#0B4A3D] font-medium hover:underline cursor-pointer text-left disabled:no-underline disabled:cursor-default"
    >
      {children}
    </button>
  );
}
