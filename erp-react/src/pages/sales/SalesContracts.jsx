import SalesContractListPage from './SalesContractListPage';
import SalesContractViewPage from './SalesContractViewPage';
import SalesContractFormPage from './SalesContractFormPage';
import SalesContractBulkUploadPage from './SalesContractBulkUploadPage';
import SalesDocumentDesign from '../../components/SalesDesign/SalesDocumentDesign';
import { salesContractDesignConfig } from '../../config/salesDesignConfigs';

export function SalesContracts({ embedded }) {
  return <SalesContractListPage embedded={embedded} />;
}

export function SalesContractDetails() {
  return <SalesContractViewPage />;
}

export function AddSalesContract() {
  return <SalesContractFormPage />;
}

export function EditSalesContract() {
  return <SalesContractFormPage />;
}

export function BulkUploadSalesContract() {
  return <SalesContractBulkUploadPage />;
}

export function SalesContractDesign() {
  return <SalesDocumentDesign config={salesContractDesignConfig} />;
}

export default SalesContracts;
