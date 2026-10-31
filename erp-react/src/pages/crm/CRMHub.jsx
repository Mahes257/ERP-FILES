import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UserPlus, UserCheck, PhoneCall, Columns2, Contact2 } from 'lucide-react';
import ModuleHubLayout from '../../components/Layout/ModuleHubLayout';
import { TabBadge, usePendingApprovals, NewRecordButton } from '../../components/Common';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import Leads from './Leads';
import LeadPipeline from './LeadPipeline';
import Clients from './Clients';
import Contacts from './Contacts';
import FollowUps from './FollowUps';
import '../../styles/rfq-tab-nav.css';
// Sales-module only: aligns the internal-tab pending pill with the Purchase
// reference. Never imported globally (see styles/sales-tab-nav.css).
import '../../styles/sales-tab-nav.css';
import '../../pages/crm/crm-erp.css';

const TABS = [
  { key: 'leads', label: 'Leads', icon: UserPlus, component: Leads },
  { key: 'pipeline', label: 'Pipeline', icon: Columns2, component: LeadPipeline },
  { key: 'clients', label: 'Clients', icon: UserCheck, component: Clients },
  // Contacts: the primary/secondary people captured by the Lead form, listed as
  // their own records and associated back to their lead (and client).
  { key: 'contacts', label: 'Contacts', icon: Contact2, component: Contacts },
  { key: 'followups', label: 'Follow-ups', icon: PhoneCall, component: FollowUps },
];

const isTabKey = (key) => TABS.some((t) => t.key === key);

export default function CrmHub() {
  // Tabs are deep-linkable (/crm?tab=pipeline) so other pages — e.g. the
  // Pipeline button on the Leads list — can land on the right CRM surface.
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (isTabKey(requestedTab) ? requestedTab : 'leads'));
  const { counts } = usePendingApprovals();

  const selectTab = (key) => {
    setActiveTab(key);
    setSearchParams(key === 'leads' ? {} : { tab: key }, { replace: true });
  };

  const active = TABS.find((t) => t.key === activeTab) || TABS[0];
  const ActiveComponent = active.component;
  const ActiveIcon = active.icon;

  // Pending-approval counts only exist for the modules the approvals summary
  // reports. Contacts is not an approval module, so its tab carries no badge
  // (rather than a hardcoded 0).
  const tabCounts = {
    leads: counts?.leads || 0,
    clients: counts?.clients || 0,
    followups: counts?.followups || 0,
  };

  // "New" button config per active CRM tab — always visible in the header.
  const newButtonByTab = {
    leads: { label: 'Lead', to: '/leads/new' },
    pipeline: { label: 'Lead', to: '/leads/new' },
    clients: { label: 'Client', to: '/clients/new' },
    contacts: { label: 'Contact', to: '/contacts/new' },
    followups: { label: 'Follow-up', to: '/followups/new' },
  };
  const newButton = newButtonByTab[activeTab];

  return (
    <ModuleHubLayout
      header={
        <>
          <SalesBreadcrumb items={[{ label: 'CRM', to: '/crm' }, { label: active.label }]} />
          <div className="pr-page-header">
            <div className="pr-page-header-title">
              <h1>
                <ActiveIcon />
                {active.label}
              </h1>
              <p className="po-page-header-subtitle">Manage leads, clients, contacts, and follow-ups</p>
            </div>
            <div className="pr-page-header-actions">
              {newButton && (
                <NewRecordButton
                  label={newButton.label}
                  to={newButton.to}
                  buttonClassName="po-btn po-btn-primary"
                />
              )}
            </div>
          </div>
          <nav className="rfq-tab-nav sales-hub-tabs" aria-label="CRM sections">
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
