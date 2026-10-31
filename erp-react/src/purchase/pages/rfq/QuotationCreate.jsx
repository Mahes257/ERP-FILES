/**
 * purchase/pages/rfq/QuotationCreate.jsx
 * ------------------------------------------------------------------
 * Create Vendor Quotation — wraps QuotationForm in the shared Purchase
 * page shell with breadcrumb + back navigation (mirrors RfqFollowUpCreate).
 * ------------------------------------------------------------------
 */
import { ChevronLeft, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import QuotationForm from '../../components/QuotationForm';
import '../../styles/cpr-list.css';

export default function QuotationCreate() {
  const navigate = useNavigate();

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Quotations', to: '/purchase/rfq/quotations' },
          { label: 'New Quotation' }
        ]}
        icon={PlusCircle}
        title="New Vendor Quotation"
        subtitle="Record a quotation received from a vendor against an RFQ"
        actions={
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/quotations')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back to Quotations
          </button>
        }
      />
      <QuotationForm />
    </PurchasePageLayout>
  );
}
