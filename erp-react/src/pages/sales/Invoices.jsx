import SalesListPage from '../../components/SalesTable/SalesListPage';
import SalesViewPage from '../../components/SalesDetail/SalesViewPage';
import SalesFormPage from '../../components/SalesForm/SalesFormPage';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { invoiceDesignConfig } from '../../config/salesDesignConfigs';
import { invoiceListConfig, invoiceViewConfig } from '../../config/salesPageConfigs';
import { SALES_FORM_CONFIGS } from '../../config/salesFormConfigs';
import invoiceService from '../../services/invoiceService';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';

export function Invoices({ embedded }) {
  return <SalesListPage config={invoiceListConfig} embedded={embedded} />;
}

export function InvoiceDetails() {
  return <SalesViewPage config={invoiceViewConfig} />;
}

export function AddInvoice() {
  return <SalesFormPage config={SALES_FORM_CONFIGS.invoice} service={invoiceService} navigateToList="/invoices" backToList={SALES_EXEC_HUB_TABS.invoices} />;
}

export function EditInvoice() {
  return <SalesFormPage config={SALES_FORM_CONFIGS.invoice} service={invoiceService} navigateToList="/invoices" backToList={SALES_EXEC_HUB_TABS.invoices} />;
}

export function InvoiceDesign() {
  return <SalesDocumentDesign config={invoiceDesignConfig} />;
}

export default Invoices;
