import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileText, FileSignature, PackageCheck, BadgeCheck, Boxes, FileSpreadsheet,
  Truck, Receipt, CreditCard, Banknote
} from 'lucide-react';
import ModuleHubLayout from '../../components/Layout/ModuleHubLayout';
import { TabBadge, usePendingApprovals, NewRecordButton, RecordOpenPopover } from '../../components/Common';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import useModuleTabOpenChoice from '../../hooks/useModuleTabOpenChoice';
import Quotations from './Quotations';
import SalesContracts from './SalesContracts';
import CustomerPurchaseOrdersHub from './CustomerPurchaseOrdersHub';
import { QcPage, PackingList } from './SalesOrders';
import ProformaInvoices from './ProformaInvoices';
import DeliveryChallans from './DeliveryChallans';
import Invoices from './Invoices';
import CreditNotes from './CreditNotes';
import PaymentReceipts from './PaymentReceipts';
import '../../styles/rfq-tab-nav.css';
// Sales-module only: aligns the internal-tab pending pill with the Purchase
// reference. Never imported globally (see styles/sales-tab-nav.css).
import '../../styles/sales-tab-nav.css';
import '../crm/crm-erp.css';

// Top-level Sales Execution modules. QC and Packing List are modules in their
// own right — they sit between Customer Purchase Orders and Proforma Invoices,
// not inside the CPO sub-branch (a CPO is only their usual source document).
const TABS = [
  { key: 'quotations', label: 'Quotations', icon: FileText, component: Quotations },
  { key: 'salesContracts', label: 'Sales Contracts', icon: FileSignature, component: SalesContracts },
  { key: 'customerPO', label: 'Customer Purchase Orders', icon: PackageCheck, component: CustomerPurchaseOrdersHub },
  { key: 'qc', label: 'QC', icon: BadgeCheck, component: QcPage },
  { key: 'packingList', label: 'Packing List', icon: Boxes, component: PackingList },
  { key: 'proformaInvoices', label: 'Proforma Invoices', icon: FileSpreadsheet, component: ProformaInvoices },
  { key: 'deliveryChallans', label: 'Delivery Challans', icon: Truck, component: DeliveryChallans },
  { key: 'invoices', label: 'Invoices', icon: Receipt, component: Invoices },
  { key: 'creditNotes', label: 'Credit Notes', icon: CreditCard, component: CreditNotes },
  { key: 'paymentReceipts', label: 'Payment Receipts', icon: Banknote, component: PaymentReceipts },
];

// Standalone route for each tab — used when the user picks "Open in New Tab".
const TAB_ROUTES = {
  quotations: '/quotations',
  salesContracts: '/sales-contracts',
  customerPO: '/sales-orders',
  // QC and Packing List keep their existing standalone routes (the same pages
  // the CPO sub-tabs used to host), so "Open in New Tab" still lands on them.
  qc: '/sales-orders/qc',
  packingList: '/sales-orders/packing-list',
  proformaInvoices: '/proforma-invoices',
  deliveryChallans: '/delivery-challans',
  invoices: '/invoices',
  creditNotes: '/credit-notes',
  paymentReceipts: '/payment-receipts',
};

const isTabKey = (key) => TABS.some((t) => t.key === key);

export default function SalesExecHub() {
  // Tabs are deep-linkable (/sales?tab=quotations) so other pages — the
  // quotation create form's Back button, conversion flows — can land on the
  // right list WITH the hub breadcrumb, page header and module tab nav.
  // Without this the tabs only lived in local state, so those pages had to fall
  // back to the standalone /quotations route, which has no hub chrome.
  const [searchParams, setSearchParams] = useSearchParams();
  // QC and Packing List used to live inside the Customer Purchase Orders branch
  // (/sales?tab=customerPO&cpoTab=qc | packing-list). They are top-level modules
  // now, so those saved links open their own tab instead of falling back to the
  // CPO branch's default view — the same pages, the same query params, only the
  // module they belong to changed.
  const LEGACY_CPO_MODULE_TABS = { qc: 'qc', 'packing-list': 'packingList' };
  const legacyModuleTab = searchParams.get('tab') === 'customerPO'
    ? LEGACY_CPO_MODULE_TABS[searchParams.get('cpoTab')] || null
    : null;
  const requestedTab = legacyModuleTab || searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(() => (isTabKey(requestedTab) ? requestedTab : 'quotations'));
  const { counts } = usePendingApprovals();

  // Follow the URL when the tab param changes while the hub is already mounted
  // (e.g. a form links to /sales?tab=salesContracts). Adjusted during render —
  // React's recommended alternative to a synchronising effect — so no cascading
  // render is triggered.
  const [lastTabParam, setLastTabParam] = useState(requestedTab);
  if (requestedTab !== lastTabParam) {
    setLastTabParam(requestedTab);
    setActiveTab(isTabKey(requestedTab) ? requestedTab : 'quotations');
  }

  // Rewrite a legacy CPO-branch link to the module's own tab (replace, so the
  // back button does not bounce through the old URL).
  useEffect(() => {
    if (!legacyModuleTab) return;
    setSearchParams({ tab: legacyModuleTab }, { replace: true });
  }, [legacyModuleTab, setSearchParams]);

  const selectTab = (key) => {
    setActiveTab(key);
    setSearchParams(key === 'quotations' ? {} : { tab: key }, { replace: true });
  };

  // Module tabs offer the same Existing-Page / New-Tab choice the Leads list
  // uses for record numbers (see useModuleTabOpenChoice).
  const { choice, requestOpen, close } = useModuleTabOpenChoice();

  const handleTabClick = (event, tab) => {
    // The tab is already showing — nothing to open, same as before.
    if (tab.key === activeTab) return;
    requestOpen(
      event,
      { label: tab.label, route: TAB_ROUTES[tab.key] },
      () => selectTab(tab.key)
    );
  };

  const active = TABS.find((t) => t.key === activeTab) || TABS[0];
  const ActiveComponent = active.component;
  const ActiveIcon = active.icon;

  const tabCounts = {
    quotations: counts?.quotation || 0,
    salesContracts: counts?.salesContract || 0,
    customerPO: counts?.salesOrder || 0,
    proformaInvoices: counts?.proformaInvoice || 0,
    deliveryChallans: counts?.deliveryChallan || 0,
    invoices: counts?.invoice || 0,
    creditNotes: counts?.creditNote || 0,
    paymentReceipts: counts?.paymentReceipt || 0,
  };

  // The Customer Purchase Orders tab embeds its own sub-hub (E-Actions / CPO
  // List / Production Tracker — QC and Packing List are top-level tabs now).
  // Its "+ New CPO" action
  // belongs in THIS page header, top-right, exactly like every other Sales
  // Execution tab — it used to sit at the end of the sub-hub's tab row instead,
  // which put it below the title instead of level with it. The sub-tab lives in
  // the `cpoTab` URL param (the hub owns `tab`), and E-Actions is the sub-tab
  // that branch opens on when the param is absent (see
  // CustomerPurchaseOrdersHub); only CPO List offers the action, matching the
  // condition the button had while it lived in the sub-hub.
  const cpoSubTab = searchParams.get('cpoTab') || 'e-actions';

  // "New" button config per active Sales Execution tab — always visible.
  const newButtonByTab = {
    quotations: { label: 'Quotation', to: '/quotations/new' },
    salesContracts: { label: 'Sales Contract', to: '/sales-contracts/new' },
    customerPO: cpoSubTab === 'cpo-list' ? { label: 'CPO', to: '/sales-orders/new' } : null,
    // QC has no standalone create page: inspections are raised from the QC
    // module itself (its own New Inspection form), exactly as before.
    qc: null,
    // Packing Lists are produced by the Production → Packing workflow (the
    // authoritative write path), so "New" opens that existing create form
    // instead of the Proforma Invoice form it used to reuse.
    packingList: { label: 'Packing List', to: '/production/packing/new' },
    proformaInvoices: { label: 'Proforma Invoice', to: '/proforma-invoices/new' },
    deliveryChallans: { label: 'Delivery Challan', to: '/delivery-challans/new' },
    invoices: { label: 'Invoice', to: '/invoices/new' },
    creditNotes: { label: 'Credit Note', to: '/credit-notes/new' },
    paymentReceipts: { label: 'Payment Receipt', to: '/payment-receipts/new' },
  };
  const newButton = newButtonByTab[activeTab];

  return (
    <>
    <ModuleHubLayout
      header={
        <>
          <SalesBreadcrumb items={[{ label: 'Sales Execution', to: '/sales' }, { label: active.label }]} />
          <div className="pr-page-header">
            <div className="pr-page-header-title">
              <h1>
                <ActiveIcon />
                {active.label}
              </h1>
              <p className="po-page-header-subtitle">Manage quotations, sales contracts, orders, invoices, delivery challans and payment receipts.</p>
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
          <nav className="rfq-tab-nav sales-hub-tabs" aria-label="Sales Execution sections">
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
        </>
      }
    >
      <ActiveComponent key={activeTab} embedded />
    </ModuleHubLayout>

    {/* Module tab open choice — Existing Page vs New Tab (same popover the
        Leads list uses for record numbers). Rendered outside the hub content
        so the fixed-position popover is never clipped by the scroll area. */}
    <RecordOpenPopover
      open={choice !== null}
      recordType={choice?.label || ''}
      recordLabel={choice?.route || ''}
      route={choice?.route || '/'}
      onOpenExisting={choice?.onOpenExisting}
      onClose={close}
      anchorRef={choice?.anchorRef}
    />
    </>
  );
}
