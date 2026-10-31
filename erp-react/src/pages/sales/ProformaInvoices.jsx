import { useSearchParams } from 'react-router-dom';
import SalesListPage from '../../components/SalesTable/SalesListPage';
import SalesViewPage from '../../components/SalesDetail/SalesViewPage';
import SalesFormPage from '../../components/SalesForm/SalesFormPage';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { packingListDesignConfig, proformaInvoiceDesignConfig } from '../../config/salesDesignConfigs';
import { proformaInvoiceListConfig, proformaInvoiceViewConfig } from '../../config/salesPageConfigs';
import { SALES_FORM_CONFIGS } from '../../config/salesFormConfigs';
import proformaInvoiceService from '../../services/proformaInvoiceService';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';

// The Packing List module reuses the Proforma Invoice page/layout — the same
// component, fields, service and records — but carries its own document
// identity. The existing Packing List → New flow navigates to the Proforma
// Invoice route with ?docType=packing-list, which selects the label-only
// Packing List config (title, card title, number/date labels) while keeping
// the Proforma Invoice data model, APIs and conversion flow untouched.
function useProformaConfig() {
  const [searchParams] = useSearchParams();
  const isPackingList = searchParams.get('docType') === 'packing-list';
  return {
    config: isPackingList ? SALES_FORM_CONFIGS.packingList : SALES_FORM_CONFIGS.proformaInvoice,
    navigateToList: isPackingList ? '/sales-orders/packing-list' : '/proforma-invoices',
    // "Back" opens the module's list inside the Sales Execution hub. A Packing
    // List is reached from its own CPO sub-hub page, so it keeps that target.
    backToList: isPackingList ? '/sales-orders/packing-list' : SALES_EXEC_HUB_TABS.proformaInvoices
  };
}

export function ProformaInvoices({ embedded }) {
  return <SalesListPage config={proformaInvoiceListConfig} embedded={embedded} />;
}

export function ProformaInvoiceDetails() {
  return <SalesViewPage config={proformaInvoiceViewConfig} />;
}

export function AddProformaInvoice() {
  const { config, navigateToList, backToList } = useProformaConfig();
  return <SalesFormPage config={config} service={proformaInvoiceService} navigateToList={navigateToList} backToList={backToList} />;
}

export function EditProformaInvoice() {
  const { config, navigateToList, backToList } = useProformaConfig();
  return <SalesFormPage config={config} service={proformaInvoiceService} navigateToList={navigateToList} backToList={backToList} />;
}

export function ProformaInvoiceDesign() {
  return <SalesDocumentDesign config={proformaInvoiceDesignConfig} />;
}

// Dedicated Packing List Preview — the same shared document workspace, fed by
// the Packing List config (own page title, EDIT opens the existing Packing
// List edit form, PDF/print reuse the shared pipeline).
export function PackingListDesign() {
  return <SalesDocumentDesign config={packingListDesignConfig} />;
}

export default ProformaInvoices;
