/**
 * purchase/pages/rfq/RfqFollowUpEdit.jsx
 * ------------------------------------------------------------------
 * Edit RFQ Follow-up — loads the record by id and renders
 * RfqFollowUpForm prefilled with its values (mirrors the Purchase
 * Requisition edit page). Only the follow-up's own fields are
 * editable; the linked RFQ is never modified.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, PencilLine } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RfqFollowUpForm from '../../components/RfqFollowUpForm';
import { rfqFollowUpService } from '../../services/rfqFollowUp';
import '../../styles/cpr-list.css';

export default function RfqFollowUpEdit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await rfqFollowUpService.getFollowUp(id);
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
  }, [id]);

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'RFQ Follow-ups', to: '/purchase/rfq/follow-ups' },
          { label: record ? `Edit ${record.followUpNo}` : 'Edit' }
        ]}
        icon={PencilLine}
        title={record ? `Edit ${record.followUpNo}` : 'Edit Follow-up'}
        subtitle="Update follow-up details, schedule and assignment"
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

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : notFound || !record ? (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Follow-up not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/follow-ups')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to RFQ Follow-ups
          </button>
        </div>
      ) : (
        <RfqFollowUpForm
          initialData={record}
          requestId={record.id}
          returnPath={location.state?.from === 'detail' ? '/purchase/rfq/follow-ups' : undefined}
        />
      )}
    </PurchasePageLayout>
  );
}
