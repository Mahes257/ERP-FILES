/**
 * purchase/pages/invoices/InvoiceCreate.jsx
 * ------------------------------------------------------------------
 * Record Invoice — wraps InvoiceForm in the shared Purchase page
 * shell.
 * ------------------------------------------------------------------
 */
import { ChevronLeft, Receipt } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import InvoiceForm from '../../components/InvoiceForm';
import '../../styles/cpr-list.css';

export default function InvoiceCreate() {
  const navigate = useNavigate();

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Invoices', to: '/purchase/invoices' },
          { label: 'Record Invoice' }
        ]}
        icon={Receipt}
        title="Record Purchase Invoice"
        subtitle="Capture a vendor invoice against a purchase order"
        actions={
          <button type="button" onClick={() => navigate('/purchase/invoices')} className="po-btn po-btn-secondary">
            <ChevronLeft className="po-btn-icon-ic" /> Back to Invoices
          </button>
        }
      />
      <InvoiceForm />
    </PurchasePageLayout>
  );
}
