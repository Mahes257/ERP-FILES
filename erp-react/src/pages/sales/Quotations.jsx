// The quotation view page is a dedicated Purchase-module-identical layout
// (ERP purchase-view.html), not the generic Tailwind SalesViewPage.
import QuotationViewPage from './QuotationViewPage';
// The quotation list page is a dedicated Purchase-module-identical layout
// (ERP purchase-list.html), not the generic Tailwind SalesListPage.
import QuotationListPage from './QuotationListPage';
// The quotation create/edit page is a dedicated ERP-identical layout
// (quotation-create.html), not the generic accordion SalesFormPage.
import QuotationFormPage from '../../components/SalesForm/QuotationFormPage';
import quotationService from '../../services/quotationService';

export function Quotations({ embedded }) {
  return <QuotationListPage embedded={embedded} />;
}

export function QuotationDetails() {
  return <QuotationViewPage />;
}

export function AddQuotation() {
  return <QuotationFormPage service={quotationService} />;
}

export function EditQuotation() {
  return <QuotationFormPage service={quotationService} />;
}

export default Quotations;
