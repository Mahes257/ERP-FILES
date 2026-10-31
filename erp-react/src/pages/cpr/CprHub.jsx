import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList, Calculator, Shield, BarChart3 } from 'lucide-react';
import ModuleHubLayout from '../../components/Layout/ModuleHubLayout';
import { TabBadge, NewRecordButton, usePendingApprovals } from '../../components/Common';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import Cprs from './Cprs';
import CostWorkouts from './CostWorkouts';
import ProfitWorkouts from './ProfitWorkouts';
import CprTechnicalVerification from './CprTechnicalVerification';
import CprReports from './CprReports';
import '../../styles/rfq-tab-nav.css';
// Sales-module only: aligns the internal-tab pending pill with the Purchase
// reference. Never imported globally (see styles/sales-tab-nav.css).
import '../../styles/sales-tab-nav.css';
import '../crm/crm-erp.css';

const TABS = [
  { key: 'cpr', label: 'CPR', icon: ClipboardList, component: Cprs },
  { key: 'tech-verification', label: 'CPR Technical Verification', icon: Shield, component: CprTechnicalVerification },
  { key: 'cost-workout', label: 'Cost Workout', icon: Calculator, component: CostWorkouts },
  { key: 'profit-workout', label: 'Profit Workout', icon: Calculator, component: ProfitWorkouts },
  { key: 'reports', label: 'CPR Reports', icon: BarChart3, component: CprReports },
];

const isTabKey = (key) => TABS.some((t) => t.key === key);

export default function CprHub() {
  // Tabs are deep-linkable (/cprs?tab=cost-workout) so other pages — Cost
  // Workout/Profit Workout View and Design, "Back to List" buttons, CPR
  // conversions — can land on the right list WITH the hub header + tab nav.
  // Without this the tabs only lived in local state, so those pages had to fall
  // back to the standalone /cost-workouts route, which has no hub chrome.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (isTabKey(requestedTab) ? requestedTab : 'cpr'));
  const { counts } = usePendingApprovals();

  // Follow the URL when the tab param changes while the hub is already mounted
  // (e.g. a Cost Workout page links to /cprs?tab=cost-workout). Adjusted during
  // render — React's recommended alternative to a synchronising effect — so no
  // cascading render is triggered.
  const [lastTabParam, setLastTabParam] = useState(requestedTab);
  if (requestedTab !== lastTabParam) {
    setLastTabParam(requestedTab);
    setActiveTab(isTabKey(requestedTab) ? requestedTab : 'cpr');
  }

  const selectTab = (key) => {
    setActiveTab(key);
    setSearchParams(key === 'cpr' ? {} : { tab: key }, { replace: true });
  };

  const active = TABS.find((t) => t.key === activeTab) || TABS[0];
  const ActiveComponent = active.component;
  const ActiveIcon = active.icon;

  const tabCounts = {
    cpr: counts?.cpr || 0,
    'tech-verification': counts?.cprTv || 0,
    'cost-workout': counts?.costWorkout || 0,
    'profit-workout': counts?.profitWorkout || 0,
  };

  return (
    <ModuleHubLayout
      header={
        <>
          <SalesBreadcrumb items={[{ label: 'CPR', to: '/cprs' }, { label: active.label }]} />            <div className="pr-page-header">
            <div className="pr-page-header-title">
              <h1>
                <ActiveIcon />
                {active.label}
              </h1>
              <p className="po-page-header-subtitle">Manage CPRs, technical verification, cost workouts, profit workouts and reports.</p>
            </div>
            <div className="pr-page-header-actions">
              {activeTab === 'cpr' && (
                <NewRecordButton label="CPR" to="/cprs/new" buttonClassName="po-btn po-btn-primary" />
              )}
              {activeTab === 'tech-verification' && (
                <NewRecordButton
                  label="Technical Verification"
                  to="/cpr/technical-verification?view=create"
                  buttonClassName="po-btn po-btn-primary"
                />
              )}
              {activeTab === 'cost-workout' && (
                <NewRecordButton
                  label="Cost Workout"
                  to="/cost-workouts/new"
                  buttonClassName="po-btn po-btn-primary"
                />
              )}
              {activeTab === 'profit-workout' && (
                <NewRecordButton
                  label="Profit Workout"
                  to="/profit-workouts/new"
                  buttonClassName="po-btn po-btn-primary"
                />
              )}
            </div>
          </div>
          <nav className="rfq-tab-nav sales-hub-tabs" aria-label="CPR sections">
            <div className="rfq-tab-nav-inner">
              {TABS.map((tab) => {
                const isActive = tab.key === activeTab;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => selectTab(tab.key)}
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
        </>
      }
    >
      <ActiveComponent key={activeTab} embedded />
    </ModuleHubLayout>
  );
}
