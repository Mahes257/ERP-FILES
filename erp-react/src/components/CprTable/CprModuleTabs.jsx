import { ClipboardList, Calculator, Shield, BarChart3 } from 'lucide-react';

const TABS = [
  { key: 'cpr', label: 'CPR', icon: ClipboardList },
  { key: 'cost-workout', label: 'Cost Workout', icon: Calculator },
  { key: 'profit-workout', label: 'Profit Workout', icon: Calculator },
  { key: 'tech-verification', label: 'CPR Technical Verification', icon: Shield },
  { key: 'reports', label: 'CPR Reports', icon: BarChart3 },
];

/**
 * Module-level tab bar for switching between CPR sub-modules.
 * Rendered inside each CPR page so the page works both standalone and inside CprHub.
 */
export default function CprModuleTabs({ activeTab, onTabChange }) {
  if (!onTabChange) return null;
  return (
    <div className="po-tabs cpr-module-tabs">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.key}
            type="button"
            className={`po-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => onTabChange(tab.key)}
          >
            <Icon size={14} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
