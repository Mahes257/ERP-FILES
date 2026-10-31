/**
 * purchase/pages/requisition/PurchaseRequisitionEdit.jsx
 * ------------------------------------------------------------------
 * Edit Purchase Requisition — loads the record by id and renders
 * RequisitionForm prefilled with its values.
 *
 * Only Draft and Returned requisitions are editable.  For any other
 * status the page redirects to the read-only View page with a one-time
 * toast explaining why editing is unavailable.  The redirect uses
 * replace: true so the /edit route never enters browser history,
 * preventing back-button loops.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, ClipboardList, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RequisitionForm from '../../components/RequisitionForm';
import { requisitionService } from '../../services/requisition';
import { PR_STATUS } from '../../constants';
import '../../styles/cpr-list.css';

const EDITABLE_STATUSES = [PR_STATUS.DRAFT, PR_STATUS.RETURNED, PR_STATUS.PENDING_APPROVAL];

export default function PurchaseRequisitionEdit() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const data = await requisitionService.getRequisition(id);
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

  /* Redirect non-editable PRs to the read-only View page.  The View page
     reads location.state.editBlocked and shows a single toast. Using
     replace: true keeps /edit out of browser history so the back button
     never loops. */
  useEffect(() => {
    if (loading || notFound || !record) return;
    if (!EDITABLE_STATUSES.includes(record.status)) {
      setRedirecting(true);
      navigate(`/purchase/requisition/${record.id}`, {
        replace: true,
        state: { editBlocked: true, prNo: record.prNo, status: record.status }
      });
    }
  }, [loading, notFound, record, navigate]);

  const isEditable = record && EDITABLE_STATUSES.includes(record.status);

  /* While loading or redirecting non-editable PRs, render only a spinner
     — no header, no form, no flash of content. */
  if (loading || redirecting) {
    return (
      <PurchasePageLayout className="purchase-page--form">
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !record) {
    return (
      <PurchasePageLayout className="purchase-page--form">
        <PurchaseHeader
          variant="cpr"
          crumb={[
            { label: 'Purchase Requisition', to: '/purchase/requisition' },
            { label: 'Edit' }
          ]}
          icon={ClipboardList}
          title="Edit Requisition"
          actions={
            <button
              type="button"
              onClick={() => navigate('/purchase/requisition')}
              className="po-btn po-btn-secondary"
            >
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>
          }
        />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Requisition not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/requisition')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Requisitions
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  /* Editable — render the full editable form. */
  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Requisition', to: '/purchase/requisition' },
          { label: 'Edit' }
        ]}
        icon={ClipboardList}
        title={`Edit ${record.prNo}`}
        subtitle="Update requisition details, line items and commercial terms"
        actions={
          <button
            type="button"
            onClick={() => navigate(`/purchase/requisition/${record.id}`)}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back
          </button>
        }
      />
      <RequisitionForm
        initialData={record}
        requestId={record.id}
        returnPath={location.state?.from === 'print' ? `/purchase/requisition/${record.id}/print` : undefined}
      />
    </PurchasePageLayout>
  );
}
