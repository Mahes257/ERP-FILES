/**
 * purchase/components/RfqTabNav.jsx
 * ------------------------------------------------------------------
 * Tab navigation for the seven RFQ & Quotations sections.
 * Replaces the previous SourcingFlowNav workflow stepper with a
 * simple horizontal tab bar (no arrows, no "Next:" button, no
 * progress indicators — just tabs).
 *
 * The active tab is derived from the current URL path so that
 * browser back/forward and direct link access work correctly.
 *
 * Uses the same pending-count badges as the sidebar
 * (usePurchaseSidebarCounts) to show live action-required counts.
 * ------------------------------------------------------------------
 */
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarClock, ClipboardCheck, Mail, Scale, ScrollText, ShieldCheck,
} from 'lucide-react';
import usePurchaseSidebarCounts from '../hooks/usePurchaseSidebarCounts';
import usePurchaseAccess from '../access/usePurchaseAccess';
import { areaForPath, allows } from '../access/catalog';
import { prefetchIntentProps } from '../../utils/routePrefetch';
import '../styles/rfq-tab-nav.css';

const TABS = [
  { key: 'rfq-list', label: 'RFQ List', shortLabel: 'RFQ List', href: '/purchase/rfq', icon: Mail },
  { key: 'rfq-follow-ups', label: 'RFQ Follow-ups', shortLabel: 'Follow-ups', href: '/purchase/rfq/follow-ups', icon: CalendarClock },
  { key: 'vendor-quotations', label: 'Quotations', shortLabel: 'Quotations', href: '/purchase/rfq/quotations', icon: ScrollText },
  { key: 'final-negotiation', label: 'Final Negotiation', shortLabel: 'Negotiation', href: '/purchase/rfq/negotiation', icon: Scale },
  { key: 'technical-evaluation', label: 'Technical Purchase Approval', shortLabel: 'Tech. Approval', href: '/purchase/rfq/technical-evaluation', icon: ClipboardCheck },
  { key: 'price-comparative-statement', label: 'Price Comparative Statement', shortLabel: 'Price Comparison', href: '/purchase/rfq/price-comparative-statement', icon: ScrollText },
  { key: 'approval-flow', label: 'Approval Flow', shortLabel: 'Approval', href: '/purchase/rfq/approval', icon: ShieldCheck },
];

/**
 * Determine which tab is active based on the current pathname.
 * Uses longest-prefix matching so /purchase/rfq/new correctly maps
 * to the RFQ List tab and /purchase/rfq/negotiation/:rfqId/:vendorId
 * maps to Final Negotiation.
 */
function getActiveTabKey(pathname, visibleTabs) {
  let best = null;
  for (const tab of visibleTabs) {
    if (pathname === tab.href || pathname.startsWith(tab.href + '/')) {
      if (!best || tab.href.length > best.href.length) {
        best = tab;
      }
    }
  }
  return best?.key || 'rfq-list';
}

export default function RfqTabNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { counts } = usePurchaseSidebarCounts();
  const { permissions } = usePurchaseAccess();

  // Negotiation, Technical Evaluation, PCS and the NFA approval flow are
  // separate areas with their own View switch; hide the tab when it is OFF.
  const tabs = TABS.filter((tab) => {
    const area = areaForPath(tab.href);
    return !area || allows(permissions, area, 'view');
  });
  if (tabs.length === 0) return null;

  const activeKey = getActiveTabKey(pathname, tabs);

  return (
    <nav
      className="rfq-tab-nav"
      aria-label="RFQ & Quotations sections"
    >
      <div className="rfq-tab-nav-inner">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.key === activeKey;
          const count = counts?.[tab.key] || 0;

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
              <Icon className="rfq-tab-icon" />
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
