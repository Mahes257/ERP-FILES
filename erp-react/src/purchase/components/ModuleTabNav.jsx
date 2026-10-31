/**
 * purchase/components/ModuleTabNav.jsx
 * ------------------------------------------------------------------
 * Generic in-page tab navigation for every Purchase module.
 * Reuses the exact same visual design as RfqTabNav (the RFQ & Quotations
 * reference): rounded buttons, green active state, badges, responsive
 * short-labels, no workflow arrows or stepper.
 *
 * Usage:
 *   <ModuleTabNav module="requisition" />
 *   <ModuleTabNav module="vendors" />
 *   <ModuleTabNav module="orders" />
 *   <ModuleTabNav module="logistics" />
 *   <ModuleTabNav module="invoices" />
 *   <ModuleTabNav module="reports" />
 *   <ModuleTabNav module="settings" />
 *
 * Tab definitions come from constants/moduleTabs.js — a single source
 * of truth shared with the sidebar badge counts
 * (usePurchaseSidebarCounts).
 *
 * For the invoices module the tab order intentionally places Credit /
 * Debit Notes AFTER the Payment Advice tab label, but they are NOT a
 * downstream step of Payment Advice. The tab order is purely navigation;
 * the workflow relationship is: Invoice → 3-Way Matching → Payment
 * Approval → Vendor Payment → Payment Advice. Credit / Debit Notes are
 * invoice adjustments linked to an original invoice and can happen
 * independently of payment advice.
 * ------------------------------------------------------------------
 */
import { useLocation, useNavigate } from 'react-router-dom';
import usePurchaseSidebarCounts from '../hooks/usePurchaseSidebarCounts';
import { MODULE_TABS } from '../constants/moduleTabs';
import usePurchaseAccess from '../access/usePurchaseAccess';
import { areaForPath, allows } from '../access/catalog';
import { prefetchIntentProps } from '../../utils/routePrefetch';
import '../styles/rfq-tab-nav.css';

/**
 * Determine which tab is active based on the current pathname.
 * Uses longest-prefix matching so detail/child routes correctly map
 * to their parent tab.
 */
function getActiveTabKey(pathname, tabs) {
  let best = null;
  for (const tab of tabs) {
    if (pathname === tab.href || pathname.startsWith(tab.href + '/')) {
      if (!best || tab.href.length > best.href.length) {
        best = tab;
      }
    }
  }
  return best?.key || tabs[0]?.key;
}

export default function ModuleTabNav({ module }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { counts } = usePurchaseSidebarCounts();
  const { permissions } = usePurchaseAccess();

  const declaredTabs = MODULE_TABS[module];
  if (!declaredTabs || declaredTabs.length === 0) return null;

  // Each tab is a destination of its own: a submodule tab (a logistics screen,
  // 3-way matching, a payment screen, credit/debit notes) is hidden as soon as
  // its View permission is OFF, so the tab bar never leads to a refused page.
  const tabs = declaredTabs.filter((tab) => {
    const area = areaForPath(tab.href);
    return !area || allows(permissions, area, 'view');
  });
  if (tabs.length === 0) return null;

  const activeKey = getActiveTabKey(pathname, tabs);

  return (
    <nav
      className="rfq-tab-nav"
      aria-label={`${module} sections`}
    >
      <div className="rfq-tab-nav-inner">
        {tabs.map((tab) => {
          const isActive = tab.key === activeKey;
          const count = counts?.[tab.key] || 0;
          const Icon = tab.icon;

          return (
            <button
              key={tab.key}
              type="button"
              {...prefetchIntentProps(tab.href)}
              onClick={() => {
                if (!isActive) navigate(tab.href);
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`rfq-tab${isActive ? ' rfq-tab--active' : ''}`}
              title={tab.label}
            >
              {Icon && <Icon className="rfq-tab-icon" />}
              <span className="rfq-tab-label">{tab.label}</span>
              <span className="rfq-tab-label-short">{tab.shortLabel}</span>
              {count > 0 && (
                <span className={`rfq-tab-badge${isActive ? ' rfq-tab-badge--active' : ''}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
