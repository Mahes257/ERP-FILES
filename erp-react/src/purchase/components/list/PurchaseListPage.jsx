/**
 * purchase/components/list/PurchaseListPage.jsx
 * ------------------------------------------------------------------
 * THE shared Purchase list page layout — a single composed component
 * that renders the complete Purchase Requisition List master design
 * (PurchaseRequisitionList.jsx is the source of truth) so every
 * Purchase list page stops re-assembling the same nine sections by
 * hand.
 *
 * The layout is split into two zones:
 *   1. STATIC HEADER — PurchaseHeader (breadcrumb / title / actions)
 *      + flowNav (module tabs) + error banner — stays fixed at the
 *      top while the user scrolls.
 *   2. SCROLLABLE CONTENT — KPI cards, status tabs, toolbar, filters,
 *      bulk actions, table and pagination — scrolls independently
 *      below the static header.
 *
 * Props:
 *   className     extra classes appended to the cpr-page root
 *   header        { crumb, icon, title, subtitle, actions }
 *   flowNav       optional ReactNode rendered right after the header
 *   error         truthy → standard cpr-error-banner; onRetry re-runs
 *   errorBanner   ReactNode rendered verbatim after the header when
 *   onRetry       fn()
 *   kpis          { cards, activeKey, onSelect, gridClass, loading }
 *   tabs          { primary, segments, statusTabs }
 *   toolbar       { count, left, right }
 *       filters       PurchaseFilters props { open, panelId, groups,
 *                   onApply, onReset }
 *   bulk          PurchaseBulkToolbar props { selectedCount, actions,
 *                   moreActions, onAction, id }
 *   table         PurchaseTable props
 *   pagination    PurchasePagination props
 *   children      extra content rendered after the table card
 * ------------------------------------------------------------------
 */
import PurchasePageLayout from './PurchasePageLayout';
import PurchaseHeader from '../PurchaseHeader';
import PurchaseKpiCards from '../PurchaseKpiCards';
import PurchaseTabs from './PurchaseTabs';
import PurchaseSegmentedTabs from './PurchaseSegmentedTabs';
import PurchaseToolbar from './PurchaseToolbar';
import PurchaseFilters from './PurchaseFilters';
import PurchaseBulkToolbar from './PurchaseBulkToolbar';
import PurchaseTable from './PurchaseTable';
import PurchasePagination from './PurchasePagination';

export default function PurchaseListPage({
  className = '',
  header,
  flowNav,
  error,
  errorBanner,
  errorMessage = 'Failed to load records.',
  onRetry,
  kpis,
  tabs,
  afterTabs,
  toolbar,
  filters,
  bulk,
  table,
  pagination,
  children
}) {
  const hasTabs = Boolean(tabs && (tabs.primary || tabs.segments || tabs.statusTabs));
  const { footer: customFooter, ...tableProps } = table || {};
  const footer = pagination ? <PurchasePagination {...pagination} /> : customFooter;

  /* ===== STATIC HEADER — stays fixed while content scrolls ===== */
  const staticHeader = (
    <>
      {header && (
        <PurchaseHeader
          variant="cpr"
          crumb={header.crumb}
          icon={header.icon}
          title={header.title}
          subtitle={header.subtitle}
          actions={header.actions}
        />
      )}
      {flowNav}
      {errorBanner ?? (error && (
        <div className="cpr-error-banner" role="alert">
          <p>{error?.message || errorMessage}</p>
          {onRetry && (
            <button type="button" className="cpr-error-retry" onClick={onRetry}>Retry</button>
          )}
        </div>
      ))}
    </>
  );

  return (
    <PurchasePageLayout className={className} staticHeader={staticHeader}>
      {/* ===== KPI CARDS (same component as the PR / RFQ lists) ===== */}
      {kpis && kpis.cards && kpis.cards.length > 0 && (
        <PurchaseKpiCards
          variant="cpr"
          cards={kpis.cards}
          gridClass={kpis.gridClass || ''}
          activeKey={kpis.activeKey}
          onSelect={kpis.onSelect}
          loading={kpis.loading}
        />
      )}

      {/* ===== TABS (PR structure: primary tab + segmented control; or
             status tabs) ===== */}
      {hasTabs && (
        <>
          {tabs.primary && (
            <div className="pr-tabs">
              <button
                type="button"
                role="tab"
                aria-selected={tabs.primary.active !== false}
                className={`pr-tab client-tab ${tabs.primary.active === false ? '' : 'active'}`}
                onClick={tabs.primary.onSelect}
              >
                {tabs.primary.label} <span className="tab-count">{tabs.primary.count}</span>
              </button>
            </div>
          )}
          {tabs.segments && <PurchaseSegmentedTabs {...tabs.segments} />}
          {tabs.statusTabs && <PurchaseTabs {...tabs.statusTabs} />}
        </>
      )}
      {afterTabs}

      {/* ===== TOOLBAR (Show Filters / Refresh | Search / Export / Columns) ===== */}
      {toolbar && (
        <PurchaseToolbar
          count={toolbar.count}
          left={toolbar.left}
          right={toolbar.right}
        />
      )}

      {/* ===== FILTER PANEL ===== */}
      {filters && (
        <PurchaseFilters
          open={filters.open}
          panelId={filters.panelId}
          onApply={filters.onApply}
          onReset={filters.onReset}
          groups={filters.groups}
        />
      )}

      {/* ===== BULK ACTION BAR (shared PurchaseBulkToolbar) ===== */}
      {bulk && (
        <PurchaseBulkToolbar
          selectedCount={bulk.selectedCount}
          actions={bulk.actions}
          moreActions={bulk.moreActions}
          onAction={bulk.onAction}
          id={bulk.id}
        />
      )}

      {/* ===== TABLE CARD + PAGINATION FOOTER ===== */}
      {table && <PurchaseTable {...tableProps} footer={footer} />}

      {/* ===== PAGE-SPECIFIC CONTENT (modals / dialogs) ===== */}
      {children}
    </PurchasePageLayout>
  );
}
