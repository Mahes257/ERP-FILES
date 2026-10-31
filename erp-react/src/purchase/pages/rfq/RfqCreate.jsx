/**
 * purchase/pages/rfq/RfqCreate.jsx
 * ------------------------------------------------------------------
 * Create RFQ — wraps RfqForm in the shared Purchase page shell
 * (PurchasePageLayout + variant="cpr" header), mirroring the
 * Purchase Requisition create page exactly.
 * Supports external handoffs:
 *   · ?vendors=Name1,Name2 — pre-fills the invited vendor list
 *   · ?pr=PR-2026-0039      — auto-links an approved Purchase Requisition
 * ------------------------------------------------------------------
 */
import { useMemo } from 'react';
import { ChevronLeft, MailPlus } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RfqForm from '../../components/RfqForm';
import '../../styles/cpr-list.css';

export default function RfqCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  /* Vendor Sourcing handoff: /purchase/rfq/new?vendors=Name1,Name2 pre-
     fills the RFQ form's vendor list so the sourcing selection carries
     over into the RFQ module (no duplicate RFQ creation in Sourcing). */
  const preselectedVendors = useMemo(() => {
    const raw = searchParams.get('vendors') || '';
    return raw ? raw.split(',').map((name) => name.trim()).filter(Boolean) : [];
  }, [searchParams]);

  /* Approved requisition handoff: /purchase/rfq/new?pr=PR-2026-0039 links
     an approved PR (items, scope and ownership are copied by RfqForm). */
  const referencePr = searchParams.get('pr') || '';

  const initialData = useMemo(() => {
    const data = {};
    if (preselectedVendors.length > 0) data.vendors = preselectedVendors;
    if (referencePr) data.reference = referencePr;
    return Object.keys(data).length > 0 ? data : undefined;
  }, [preselectedVendors, referencePr]);

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Create' }
        ]}
        icon={MailPlus}
        title="Create RFQ"
        subtitle="Invite approved vendors and request quotations for required items"
        actions={
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back to RFQs
          </button>
        }
      />
      <RfqForm initialData={initialData} />
    </PurchasePageLayout>
  );
}
