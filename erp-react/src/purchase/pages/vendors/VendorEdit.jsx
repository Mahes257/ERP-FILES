/**
 * purchase/pages/vendors/VendorEdit.jsx
 * ------------------------------------------------------------------
 * Edit Vendor — loads the record by id and renders VendorForm
 * prefilled with its values, using the shared Purchase create/edit
 * shell (purchase-page.cpr-page + cpr header variant).
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, Building2, Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import VendorForm from '../../components/VendorForm';
import { vendorService } from '../../services/vendor';
import '../../styles/cpr-list.css';

export default function VendorEdit() {
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
        const data = await vendorService.getVendor(id);
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
          { label: 'Vendor Management', to: '/purchase/vendors' },
          { label: 'Edit' }
        ]}
        icon={Building2}
        title={record ? `Edit ${record.name}` : 'Edit Vendor'}
        subtitle="Update vendor details, contact information and commercial terms"
        actions={
          <button
            type="button"
            onClick={() => navigate(record ? `/purchase/vendors/${record.id}` : '/purchase/vendors')}
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
          <p className="text-sm font-bold text-slate-700">Vendor not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/vendors')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Vendors
          </button>
        </div>
      ) : (
        <VendorForm initialData={record} vendorId={record.id} />
      )}
    </PurchasePageLayout>
  );
}
