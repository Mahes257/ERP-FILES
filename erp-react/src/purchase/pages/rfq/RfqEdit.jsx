/**
 * purchase/pages/rfq/RfqEdit.jsx
 * ------------------------------------------------------------------
 * Edit RFQ — loads the record by id and renders RfqForm prefilled
 * with its values, using the same shared Purchase page shell as the
 * Purchase Requisition edit page.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, MailPlus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RfqForm from '../../components/RfqForm';
import { rfqService } from '../../services/rfq';
import '../../styles/cpr-list.css';

export default function RfqEdit() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await rfqService.getRfq(id);
        if (cancelled) return;
        setRecord(data);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: record ? `Edit ${record.rfqNo}` : 'Edit' }
        ]}
        icon={MailPlus}
        title={record ? `Edit ${record.rfqNo}` : 'Edit RFQ'}
        subtitle="Update RFQ scope, invited vendors and line items"
        actions={
          <button
            type="button"
            onClick={() => navigate(record ? `/purchase/rfq/${record.id}` : '/purchase/rfq')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back
          </button>
        }
      />

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : notFound || !record ? (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">RFQ not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to RFQs
          </button>
        </div>
      ) : (
        <RfqForm initialData={record} rfqId={record.id} />
      )}
    </PurchasePageLayout>
  );
}
