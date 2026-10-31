import { ChevronRight, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import './quotation-module.css';
import '../crm/crm-erp.css';
// Canonical "Back to List" target — the Quotations list inside the Sales
// Execution hub, not the bare /quotations route.
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';

export default function QuotationWorkflows() {
  const navigate = useNavigate();
  return (
    <div className="qpo-page">
      <nav className="pr-breadcrumb" aria-label="Breadcrumb">
        <a onClick={() => navigate('/dashboard')}>Dashboard</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <a onClick={() => navigate(SALES_EXEC_HUB_TABS.quotations)}>Quotations</a>
        <ChevronRight size={10} className="bc-sep" aria-hidden="true" />
        <span>Quotation Workflows</span>
      </nav>

      <div className="qpo-view-section" style={{ textAlign: 'center', padding: '48px' }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: '#E8F0EE', color: '#0B4A3D', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <FileText style={{ width: 32, height: 32 }} />
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#1f2937', margin: '0 0 8px' }}>Quotation Workflows</h1>
        <p style={{ fontSize: 14, color: '#9ca3af', lineHeight: 1.6, margin: 0 }}>
          This module is under development. Full functionality will be available soon.
        </p>
      </div>
    </div>
  );
}
