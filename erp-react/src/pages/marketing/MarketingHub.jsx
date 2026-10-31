import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin, Clock, ClipboardList, DollarSign, BarChart3,
  LayoutDashboard, CalendarDays, CalendarClock, Map
} from 'lucide-react';
import ModuleHubLayout from '../../components/Layout/ModuleHubLayout';
import TravelPlanner from '../../components/Marketing/TravelPlanner';
import TravelScheduler from '../../components/Marketing/TravelScheduler';
import VisitFollowUpExtension, { FollowUpExtensionActions } from '../../components/Marketing/VisitFollowUpExtension';
import QFormsPage from './QFormsPage';
import MarketingExpenses from '../../components/Marketing/MarketingExpenses';
import VisitSummaryPage from './VisitSummaryPage';
import MarketingDashboard from '../../components/Marketing/MarketingDashboard';
import MarketingCalendar from '../../components/Marketing/MarketingCalendar';
import MarketingMapPage from '../../components/Marketing/MarketingMapPage';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import useMarketingAccess from '../../marketing/access/useMarketingAccess';
import '../../components/Marketing/visit-followup-extension.css';
import '../../styles/rfq-tab-nav.css';
import '../crm/crm-erp.css';

/**
 * Page-header actions per tab — same contract as SalesExecHub: the hub owns the
 * page header, so the embedded list page contributes only its creation actions.
 */
const HEADER_ACTIONS = {
  'follow-ups': FollowUpExtensionActions
};

const TABS = [
  { key: 'dashboard', label: 'Marketing Dashboard', icon: LayoutDashboard, component: MarketingDashboard },
  { key: 'travel-scheduler', label: 'Travel Scheduler', icon: CalendarClock, component: TravelScheduler },
  { key: 'travel-planners', label: 'Travel Registry', icon: MapPin, component: TravelPlanner },
  { key: 'follow-ups', label: 'Follow-ups & Extensions', icon: Clock, component: VisitFollowUpExtension },
  { key: 'q-forms', label: 'Q Forms', icon: ClipboardList, component: QFormsPage },
  { key: 'expenses', label: 'Marketing Expenses', icon: DollarSign, component: MarketingExpenses },
  { key: 'visit-summary', label: 'Visit Summary', icon: BarChart3, component: VisitSummaryPage },
  { key: 'calendar', label: 'Calendar', icon: CalendarDays, component: MarketingCalendar },
  { key: 'map', label: 'Marketing Map', icon: Map, component: MarketingMapPage },
];

/** Each hub tab is one Marketing access area (see marketing/access/catalog). */
const AREA_BY_TAB = {
  dashboard: 'dashboard',
  'travel-scheduler': 'travelScheduler',
  'travel-planners': 'travelRegistry',
  'follow-ups': 'followups',
  'q-forms': 'qforms',
  expenses: 'expenses',
  'visit-summary': 'visits',
  calendar: 'calendar',
  map: 'map'
};

export default function MarketingHub() {
  const navigate = useNavigate();
  const { can } = useMarketingAccess();
  const [activeTab, setActiveTab] = useState('dashboard');

  // A tab whose View permission is OFF is not offered at all — the same
  // permission is re-checked by the backend on every request it would make.
  const tabs = TABS.filter((tab) => can(AREA_BY_TAB[tab.key], 'view'));
  const active = tabs.find((t) => t.key === activeTab) || tabs[0] || TABS[0];
  const ActiveComponent = active.component;
  const ActiveIcon = active.icon;
  const HeaderActions = HEADER_ACTIONS[activeTab];

  return (
    <ModuleHubLayout
      header={
        <>
          <SalesBreadcrumb items={[{ label: 'Marketing', to: '/marketing' }, { label: active.label }]} />
          <div className="pr-page-header">
            <div className="pr-page-header-title">
              <h1>
                <ActiveIcon />
                {active.label}
              </h1>
              <p className="po-page-header-subtitle">Manage marketing activities, visits, follow-ups, forms and expenses.</p>
            </div>
            {HeaderActions && (
              <div className="pr-page-header-actions">
                <HeaderActions />
              </div>
            )}
          </div>
          <nav className="rfq-tab-nav" aria-label="Marketing sections">
            <div className="rfq-tab-nav-inner">
              {tabs.map((tab) => {
                const isActive = tab.key === activeTab;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`rfq-tab${isActive ? ' rfq-tab--active' : ''}`}
                    title={tab.label}
                  >
                    <Icon className="rfq-tab-icon" />
                    <span className="rfq-tab-label">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </>
      }
    >
      <ActiveComponent key={activeTab} embedded onNavigate={(page, filter) => {
        const routeToTab = {
          '/marketing/travel-scheduler': 'travel-scheduler',
          '/marketing/travel-planners': 'travel-planners',
          '/marketing/follow-ups': 'follow-ups',
          '/marketing/q-forms': 'q-forms',
          '/marketing/expenses': 'expenses',
          '/marketing/dashboard': 'dashboard',
          '/marketing/calendar': 'calendar',
          '/marketing/map': 'map',
          '/marketing/visits': 'visit-summary'
        };
        const tabKey = routeToTab[page];
        if (tabKey) {
          setActiveTab(tabKey);
        } else if (page && filter) {
          navigate(`${page}?tab=${encodeURIComponent(filter)}`);
        } else if (page) {
          navigate(page);
        }
      }} />
    </ModuleHubLayout>
  );
}
