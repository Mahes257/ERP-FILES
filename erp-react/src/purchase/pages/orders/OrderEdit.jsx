/**
 * purchase/pages/orders/OrderEdit.jsx
 * ------------------------------------------------------------------
 * Edit Purchase Order — loads the record by id and renders
 * PurchaseOrderForm prefilled with its values.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseOrderForm from '../../components/PurchaseOrderForm';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { PO_STATUS } from '../../constants';
import '../../styles/cpr-list.css';

export default function OrderEdit() {
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
        const data = await purchaseOrderService.getOrder(id);
        if (cancelled) return;
        /* Pre-approval POs (Draft or Pending Approval) are editable —
           once a PO is approved and moving through the supply chain its
           values are frozen, so later stages redirect back to view. */
        if (data && ![PO_STATUS.DRAFT, PO_STATUS.PENDING_APPROVAL].includes(data.status)) {
          navigate(`/purchase/orders/${id}`, { replace: true });
          return;
        }
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
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: record ? `Edit ${record.poNo}` : 'Edit' }
        ]}
        icon={FileText}
        title={record ? `Edit ${record.poNo}` : 'Edit Purchase Order'}
        subtitle="Update order details, line items and commercial terms"
        actions={
          <button
            type="button"
            onClick={() => navigate(record ? `/purchase/orders/${record.id}` : '/purchase/orders')}
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
          <p className="text-sm font-bold text-slate-700">Purchase order not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/orders')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Purchase Orders
          </button>
        </div>
      ) : (
        <PurchaseOrderForm initialData={record} orderId={record.id} />
      )}
    </PurchasePageLayout>
  );
}
