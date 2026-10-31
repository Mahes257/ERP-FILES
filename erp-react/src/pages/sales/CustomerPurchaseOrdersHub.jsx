import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PackageCheck, ClipboardList, ChevronRight, Users } from 'lucide-react';
import ModuleHubLayout from '../../components/Layout/ModuleHubLayout';
import { TabBadge, usePendingApprovals, NewRecordButton, RecordOpenPopover } from '../../components/Common';
import useModuleTabOpenChoice from '../../hooks/useModuleTabOpenChoice';
import { EActionsPage, CpoList, ProductionTrackerPage } from './SalesOrders';
import '../../styles/rfq-tab-nav.css';
// Sales-module only: aligns the internal-tab pending pill with the Purchase
// reference. Never imported globally (see styles/sales-tab-nav.css).
import '../../styles/sales-tab-nav.css';
import '../crm/crm-erp.css';

// Sub-branch order inside Customer Purchase Orders: E-Actions comes FIRST.
// QC and Packing List are NOT part of this branch — they are independent
// top-level Sales Execution modules (next to this one in the hub's tab row).
const TABS = [
  { key: 'e-actions', label: 'E-Actions', icon: Users, component: EActionsPage },
  { key: 'cpo-list', label: 'CPO List', icon: PackageCheck, component: CpoList },
  { key: 'production-tracker', label: 'Production Tracker', icon: ClipboardList, component: ProductionTrackerPage },
];

// Standalone route for each sub-tab — used when the user picks "Open in New Tab".
const TAB_ROUTES = {
  'e-actions': '/sales-orders/e-actions',
  'cpo-list': '/sales-orders/cpo-list',
  'production-tracker': '/sales-orders/production-tracker',
};

// The active sub-tab is kept in the URL so refreshing (or reopening) the page
// never silently falls back to another sub-tab. The param is namespaced
// (cpoTab) because the parent Sales Execution hub already owns `tab`.
const SUB_TAB_PARAM = 'cpoTab';
// E-Actions is the sub-tab this branch opens on: it is what Customer Purchase
// Orders shows unless the URL asks for another sub-tab. It is therefore the
// only key that is left OUT of the URL (see selectTab), so the default view has
// the clean URL it always had and a refresh keeps it.
const DEFAULT_SUB_TAB = 'e-actions';
const isTabKey = (key) => TABS.some((t) => t.key === key);

/**
 * @param embedded  rendered inside the Sales Execution hub (tabs only, no page
 *                  shell).
 * @param initialTab sub-branch to open when the URL carries no `cpoTab` param
 *                  (e.g. the standalone /sales-orders/e-actions route).
 */
export default function CustomerPurchaseOrdersHub({ embedded = false, initialTab = DEFAULT_SUB_TAB }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get(SUB_TAB_PARAM);
  const fallbackTab = isTabKey(initialTab) ? initialTab : DEFAULT_SUB_TAB;
  const [activeTab, setActiveTab] = useState(() => (isTabKey(requestedTab) ? requestedTab : fallbackTab));
  const { counts } = usePendingApprovals();

  // Follow the URL when the sub-tab param changes while the hub is already
  // mounted (adjusted during render — React's recommended alternative to a
  // synchronising effect), so no cascading render is triggered.
  const [lastTabParam, setLastTabParam] = useState(requestedTab);
  if (requestedTab !== lastTabParam) {
    setLastTabParam(requestedTab);
    setActiveTab(isTabKey(requestedTab) ? requestedTab : fallbackTab);
  }

  const selectTab = (key) => {
    setActiveTab(key);
    const next = new URLSearchParams(searchParams);
    // The default sub-tab stays param-less (the URL convention here); every
    // other sub-tab — CPO List included — is spelled out in the URL.
    if (key === DEFAULT_SUB_TAB) next.delete(SUB_TAB_PARAM);
    else next.set(SUB_TAB_PARAM, key);
    setSearchParams(next, { replace: true });
  };

  // Sub-tabs offer the same Existing-Page / New-Tab choice as the parent
  // Sales Execution tabs (and as the Leads list does for record numbers).
  const { choice, requestOpen, close } = useModuleTabOpenChoice();

  const handleTabClick = (event, tab) => {
    if (tab.key === activeTab) return;
    requestOpen(
      event,
      { label: tab.label, route: TAB_ROUTES[tab.key] },
      () => selectTab(tab.key)
    );
  };

  const active = TABS.find((t) => t.key === activeTab) || TABS[0];
  const ActiveComponent = active.component;

  // Same Existing-Page / New-Tab popover the Leads list uses for record numbers.
  const renderTabChoicePopover = () => (
    <RecordOpenPopover
      open={choice !== null}
      recordType={choice?.label || ''}
      recordLabel={choice?.route || ''}
      route={choice?.route || '/'}
      onOpenExisting={choice?.onOpenExisting}
      onClose={close}
      anchorRef={choice?.anchorRef}
    />
  );

  // CPO List tab shows the pending-review count (same as Sales Execution > CPO).
  const tabCounts = {
    'cpo-list': counts?.salesOrder || 0,
  };

  /* ------------------------------------------------------------------
   * When embedded inside SalesExecHub we only render the sub-branch tabs
   * (the parent hub already provides breadcrumb + page title).
   * When mounted standalone at /sales-orders we render the full
   * breadcrumb + page header + tabs + content.
   * ------------------------------------------------------------------ */

  if (embedded) {
    return (
      <>
        {/* ===== SUB-BRANCH TABS only (parent hub provides breadcrumb/header) ===== */}
        {/* This row lands in the parent hub's unpadded content area, so it needs
            the page inset itself — `.cpo-sub-tabs` (styles/sales-tab-nav.css)
            applies the same 28px/12px padding the page shell below uses, which
            puts the tabs on the same left edge as the KPI cards and table. */}
        <div className="rfq-tab-row cpo-sub-tabs">
          <nav className="rfq-tab-nav sales-hub-tabs" aria-label="Customer Purchase Orders sections">
            <div className="rfq-tab-nav-inner">
              {TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={(e) => handleTabClick(e, tab)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rfq-tab${isActive ? ' rfq-tab--active' : ''}`}
                    title={tab.label}
                  >
                    <Icon className="rfq-tab-icon" />
                    <span className="rfq-tab-label">{tab.label}</span>
                    <TabBadge count={tabCounts[tab.key] || 0} active={isActive} />
                  </button>
                );
              })}
            </div>
          </nav>
          {/* The "+ New CPO" action is NOT here: when the hub is embedded, the
              parent Sales Execution hub owns the page header and renders it in
              `.pr-page-header-actions`, top-right and level with the page
              title — the same slot as "+ New Sales Contract". It is shown only
              while the CPO List sub-tab is active. */}
        </div>
        <ActiveComponent hideBreadcrumb embedded key={activeTab} />
        {renderTabChoicePopover()}
      </>
    );
  }

  return (
    <>
    <ModuleHubLayout
      header={
        <div className="cpr-page">
          {/* ===== BREADCRUMB (Sales → Sales Execution → Customer Purchase Orders) ===== */}
          <nav className="pr-breadcrumb" aria-label="Breadcrumb">
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
            <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
            <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
            <span className="bc-current">Customer Purchase Orders</span>
          </nav>

          {/* ===== SUB-BRANCH TABS (rfq-tab-nav — single row, horizontal scroll) ===== */}
          <div className="rfq-tab-row">
            <nav className="rfq-tab-nav sales-hub-tabs" aria-label="Customer Purchase Orders sections">
              <div className="rfq-tab-nav-inner">
                {TABS.map((tab) => {
                  const isActive = tab.key === activeTab;
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={(e) => handleTabClick(e, tab)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`rfq-tab${isActive ? ' rfq-tab--active' : ''}`}
                      title={tab.label}
                    >
                      <Icon className="rfq-tab-icon" />
                      <span className="rfq-tab-label">{tab.label}</span>
                      <TabBadge count={tabCounts[tab.key] || 0} active={isActive} />
                    </button>
                  );
                })}
              </div>
            </nav>
            {activeTab === 'cpo-list' && (
              <NewRecordButton label="CPO" to="/sales-orders/new" buttonClassName="po-btn po-btn-primary" />
            )}
          </div>
        </div>
      }
    >
      <ActiveComponent hideBreadcrumb key={activeTab} />
    </ModuleHubLayout>

    {/* Module sub-tab open choice — Existing Page vs New Tab */}
    {renderTabChoicePopover()}
    </>
  );
}
