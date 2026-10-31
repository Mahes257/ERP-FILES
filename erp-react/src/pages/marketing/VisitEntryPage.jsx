import { useState } from 'react';
import { MapPin, ClipboardList, Clock, DollarSign, BarChart3 } from 'lucide-react';
import VisitEntry from '../../components/Marketing/VisitEntry';
import VisitSummaryPage from './VisitSummaryPage';
import '../../components/Marketing/visit-entry.css';
import '../sales/quotation-module.css';

const VISIT_TABS = [
  { key: 'visit-entry', label: 'Visit Entry', icon: ClipboardList },
  { key: 'travel-planners', label: 'Travel Registry', icon: MapPin },
  { key: 'q-forms', label: 'Q Forms', icon: ClipboardList },
  { key: 'follow-ups', label: 'Follow-ups & Extensions', icon: Clock },
  { key: 'expenses', label: 'Marketing Expenses', icon: DollarSign },
  { key: 'visit-summary', label: 'Visit Summary', icon: BarChart3 },
];

export default function VisitEntryPage() {
  const [activeTab, setActiveTab] = useState('visit-entry');

  return (
    <div className="purchase-page cpr-page" style={{ paddingTop: 20, paddingBottom: 80 }}>
      {/* ===== PAGE HEADER ===== */}
      <div className="po-page-header">
        <div>
          <h1>
            <ClipboardList size={20} /> Marketing Visit Entry
          </h1>
          <p className="po-page-header-subtitle">
            Manage visits, travel registries, Q Forms, follow-ups and expenses
          </p>
        </div>
      </div>

      {/* ===== HORIZONTAL TABS ===== */}
      <div className="po-tabs">
        {VISIT_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              className={`po-tab${activeTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ===== TAB CONTENT ===== */}
      {activeTab === 'visit-entry' && <VisitEntry />}
      {activeTab === 'visit-summary' && <VisitSummaryPage />}
    </div>
  );
}
