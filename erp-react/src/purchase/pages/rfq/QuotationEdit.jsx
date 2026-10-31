/**
 * purchase/pages/rfq/QuotationEdit.jsx
 * ------------------------------------------------------------------
 * Edit Vendor Quotation — loads the quotation by id and renders
 * QuotationForm prefilled with its values (mirrors RfqFollowUpEdit).
 * Only the quotation's own fields are editable; the linked RFQ is
 * never modified.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, Loader2, PencilLine } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import QuotationForm from '../../components/QuotationForm';
import { rfqService } from '../../services/rfq';
import '../../styles/cpr-list.css';

export default function QuotationEdit() {
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
        const data = await rfqService.getQuotation(id);
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
          { label: 'Quotations', to: '/purchase/rfq/quotations' },
          { label: record ? `Edit ${record.quotationNo || record.id}` : 'Edit' }
        ]}
        icon={PencilLine}
        title={record ? `Edit ${record.quotationNo || record.id}` : 'Edit Quotation'}
        subtitle="Update quotation details, rates and commercial terms"
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

      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : notFound || !record ? (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Quotation not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/quotations')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Vendor Quotations
          </button>
        </div>
      ) : (
        <QuotationForm
          initialData={record}
          requestId={record.id}
          returnPath={`/purchase/rfq/quotations/${record.id}`}
        />
      )}
    </PurchasePageLayout>
  );
}
