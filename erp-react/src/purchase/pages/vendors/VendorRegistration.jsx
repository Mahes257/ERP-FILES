/**
 * purchase/pages/vendors/VendorRegistration.jsx
 * ------------------------------------------------------------------
 * Register Vendor — wraps VendorForm in the shared Purchase page
 * shell (purchase-page.cpr-page + cpr header variant) with breadcrumb
 * + back navigation, mirroring the Purchase Requisition Create page.
 * ------------------------------------------------------------------
 */
import { ChevronLeft, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import VendorForm from '../../components/VendorForm';
import '../../styles/cpr-list.css';
/* Page-scoped presentation fix: restores the missing box on the
   dropdown triggers of THIS page only (see the file for the root cause). */
import '../../styles/vendor-form-fields.css';

export default function VendorRegistration() {
  const navigate = useNavigate();

  return (
    <PurchasePageLayout className="purchase-page--form vendor-registration">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Vendor Management', to: '/purchase/vendors' },
          { label: 'Register' }
        ]}
        icon={Building2}
        title="Register Vendor"
        subtitle="Add a new vendor to the vendor master"
        actions={
          <button
            type="button"
            onClick={() => navigate('/purchase/vendors')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back to Vendors
          </button>
        }
      />
      <VendorForm />
    </PurchasePageLayout>
  );
}
