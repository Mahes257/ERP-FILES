import SalesListPage from '../../components/SalesTable/SalesListPage';
import SalesViewPage from '../../components/SalesDetail/SalesViewPage';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { paymentReceiptDesignConfig } from '../../config/salesDesignConfigs';
import { paymentReceiptListConfig, paymentReceiptViewConfig } from '../../config/salesPageConfigs';
import { SALES_FORM_CONFIGS } from '../../config/salesFormConfigs';
import PaymentReceiptFormPage from '../../components/SalesForm/PaymentReceiptFormPage';
import paymentReceiptService from '../../services/paymentReceiptService';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';

export function PaymentReceipts({ embedded }) {
  return <SalesListPage config={paymentReceiptListConfig} embedded={embedded} />;
}

export function PaymentReceiptDetails() {
  return <SalesViewPage config={paymentReceiptViewConfig} />;
}

export function AddPaymentReceipt() {
  return <PaymentReceiptFormPage config={SALES_FORM_CONFIGS.paymentReceipt} service={paymentReceiptService} navigateToList="/payment-receipts" backToList={SALES_EXEC_HUB_TABS.paymentReceipts} />;
}

export function EditPaymentReceipt() {
  return <PaymentReceiptFormPage config={SALES_FORM_CONFIGS.paymentReceipt} service={paymentReceiptService} navigateToList="/payment-receipts" backToList={SALES_EXEC_HUB_TABS.paymentReceipts} />;
}

export function PaymentReceiptDesign() {
  return <SalesDocumentDesign config={paymentReceiptDesignConfig} />;
}

export default PaymentReceipts;
