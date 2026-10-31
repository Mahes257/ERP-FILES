/**
 * purchase/pages/rfq/RfqFollowUpCreate.jsx
 * ------------------------------------------------------------------
 * Create RFQ Follow-up — wraps RfqFollowUpForm in the shared Purchase
 * page shell with breadcrumb + back navigation (mirrors the Purchase
 * Requisition create page).
 * ------------------------------------------------------------------
 */
import { ChevronLeft, PlusCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RfqFollowUpForm from '../../components/RfqFollowUpForm';
import '../../styles/cpr-list.css';

export default function RfqFollowUpCreate() {
  const navigate = useNavigate();

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'RFQ Follow-ups', to: '/purchase/rfq/follow-ups' },
          { label: 'New Follow-up' }
        ]}
        icon={PlusCircle}
        title="New RFQ Follow-up"
        subtitle="Create a follow-up to track vendor responses and quotation deadlines"
        actions={
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/follow-ups')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back to Follow-ups
          </button>
        }
      />
      <RfqFollowUpForm />
    </PurchasePageLayout>
  );
}
