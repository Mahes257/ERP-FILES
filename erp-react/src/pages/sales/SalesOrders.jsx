import { BadgeCheck, ChevronRight, ClipboardList, PackageCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProductionTimeline from '../../components/ProductionTimeline/ProductionTimeline';
import SalesListPage from '../../components/SalesTable/SalesListPage';
import SalesViewPage from '../../components/SalesDetail/SalesViewPage';
import SalesOrderFormPage from './SalesOrderFormPage';
import CpoEActions from './CpoEActions';
import CpoQcPage from './CpoQcPage';
import SalesPackingList from './SalesPackingList';
import CpoProductionTracker from './CpoProductionTracker';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { salesOrderDesignConfig } from '../../config/salesDesignConfigs';
import { salesOrderViewConfig, salesOrderListConfig } from '../../config/salesPageConfigs';
import '../crm/crm-erp.css';
import './sales-contract-module.css';

export function SalesOrders({ embedded }) {
  const navigate = useNavigate();
  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB + PAGE HEADER (hidden when embedded inside a hub) ===== */}
      {!embedded && (
        <>
          <nav className="pr-breadcrumb" aria-label="Breadcrumb">
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
            <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
            <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
            <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
            <span className="bc-current">Customer Purchase Orders</span>
          </nav>
          <div className="pr-page-header">
            <div>
              <h1>
                <PackageCheck size={20} />
                Customer Purchase Orders
              </h1>
            </div>
          </div>
        </>
      )}

      {/* ===== PRODUCTION TIMELINE (primary view) ===== */}
      <ProductionTimeline docNoKey="soNo" docNoLabel="CPO No" />
    </div>
  );
}

// ===== CPO LIST sub-branch =====
// Uses the EXISTING Customer Purchase Order (Sales Order) records through the
// same list config/hook — no separate or dummy dataset. Rows open the real CPO.
export function CpoList({ hideBreadcrumb, embedded }) {
  return <SalesListPage config={salesOrderListConfig} hideBreadcrumb={hideBreadcrumb} embedded={embedded} />;
}

// ===== E-ACTIONS sub-branch =====
// Shows the EXISTING E-Action / Participation records of every Customer
// Purchase Order — the SAME `sales_order_e_actions` rows the CPO Create/Edit
// form's E-Action grid writes (fields, columns, statuses, assignment,
// participation and release information). No mock data, no second data model.
export function EActionsPage() {
  return <CpoEActions />;
}

// ===== PACKING LIST sub-branch =====
// Consumes the EXISTING production packing records (the same `/packing` API
// Production → Packing writes), showing Packing List No, Date, Work Order,
// CPO No, Customer, Description and quantities. It is the same persisted data
// as the Production module — not a copy and not a Proforma Invoice list.
export function PackingList() {
  return <SalesPackingList />;
}

// Shared empty-state shell for placeholder sub-branches (Production Tracker /
// QC). No mock records — just the page/navigation structure for future work.
function EmptyBranch({ title, icon: Icon, breadcrumbLabel, description, hideBreadcrumb }) {
  const navigate = useNavigate();
  return (
    <div className="purchase-page cpr-page">
      {/* ===== BREADCRUMB ===== */}
      {!hideBreadcrumb && (
        <nav className="pr-breadcrumb" aria-label="Breadcrumb">
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales</button>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <button className="bc-link" onClick={() => navigate('/sales')}>Sales Execution</button>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <span className="bc-current">{breadcrumbLabel}</span>
        </nav>
      )}

      {/* ===== PAGE HEADER ===== */}
      <div className="pr-page-header">
        <div>
          <h1>
            <Icon size={20} />
            {title}
          </h1>
        </div>
      </div>

      {/* ===== EMPTY STATE (placeholder — no data yet) ===== */}
      <div className="po-dash-card">
        <div className="po-dash-card-body text-center py-12">
          <Icon className="w-10 h-10 text-slate-200 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-600 mb-1.5">{title} is not available yet</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  );
}

// ===== PRODUCTION TRACKER sub-branch =====
// Full production tracking implementation — uses the production_trackers
// backend API to track CPO progress across Casting → Fabrication → Assembly
// → QC → Packing → Dispatch stages.
export function ProductionTrackerPage({ hideBreadcrumb, embedded }) {
  return <CpoProductionTracker embedded={embedded} hideBreadcrumb={hideBreadcrumb} />;
}

// ===== QC sub-branch =====
// Full QC implementation linked to CPO — uses the same backend API
// (quality_inspections table) as the Production QC module.
// CpoQcPage includes its own CPO selector so it always renders.
export function QcPage({ hideBreadcrumb, embedded, cpoNo, cpoData }) {
  return <CpoQcPage cpoNo={cpoNo} cpoData={cpoData} embedded={embedded} hideBreadcrumb={hideBreadcrumb} />;
}

export function SalesOrderDetails() {
  return <SalesViewPage config={salesOrderViewConfig} />;
}

export function SalesOrderDesign() {
  return <SalesDocumentDesign config={salesOrderDesignConfig} />;
}

export function AddSalesOrder() {
  return <SalesOrderFormPage />;
}

export function EditSalesOrder() {
  return <SalesOrderFormPage />;
}

export default SalesOrders;
