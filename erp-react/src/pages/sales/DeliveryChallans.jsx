import SalesListPage from '../../components/SalesTable/SalesListPage';
import SalesViewPage from '../../components/SalesDetail/SalesViewPage';
import DeliveryChallanFormPage from './DeliveryChallanFormPage';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { deliveryChallanDesignConfig } from '../../config/salesDesignConfigs';
import { deliveryChallanListConfig, deliveryChallanViewConfig } from '../../config/salesPageConfigs';

export function DeliveryChallans({ embedded }) {
  return <SalesListPage config={deliveryChallanListConfig} embedded={embedded} />;
}

export function DeliveryChallanDetails() {
  return <SalesViewPage config={deliveryChallanViewConfig} />;
}

export function AddDeliveryChallan() {
  return <DeliveryChallanFormPage />;
}

export function EditDeliveryChallan() {
  return <DeliveryChallanFormPage />;
}

export function DeliveryChallanDesign() {
  return <SalesDocumentDesign config={deliveryChallanDesignConfig} />;
}

export default DeliveryChallans;
