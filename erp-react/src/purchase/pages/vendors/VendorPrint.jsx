/**
 * purchase/pages/vendors/VendorPrint.jsx
 * ------------------------------------------------------------------
 * Vendor profile print preview page.
 *
 *   Toolbar  : ← Back · centered "Vendor Profile Preview" ·
 *              Edit · Print · Download PDF
 *   Document : ONE reusable A4 template (VendorPrintDocument) built on
 *              the Purchase Requisition print engine (same .pr-sheet
 *              stylesheet, header + footer).
 *   Print    : window.print() with app chrome hidden (@media print).
 *   PDF      : the same `.pr-sheet` DOM node is rasterised and written
 *              into an A4 portrait PDF (utils/export.js).
 *   Edit     : opens /purchase/vendors/:id/edit.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Pencil, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import { vendorService } from '../../services/vendor';
import { exportSheetsAsPdf } from '../../utils/export';
import { registerGeneratedDocument } from '../../services/documentRegistration';
import { PRINT_SHEET_STYLES } from '../../components/RequisitionPrintDocument';
import { VendorPrintSheet } from '../../components/VendorPrintDocument';
import '../../styles/cpr-list.css';

export default function VendorPrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const sheetRef = useRef(null);

  /* Scope the print CSS (hide app chrome) to this page. */
  useEffect(() => {
    document.body.classList.add('pr-print-page');
    return () => document.body.classList.remove('pr-print-page');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const preview = await vendorService.getVendorPrint(id);
        if (!cancelled) {
          setData(preview);

          /* Auto-register the vendor document in the repository */
          try {
            await registerGeneratedDocument({
              docType: 'VENDOR',
              sourceId: id,
              docNo: preview.record?.id || id,
              name: `Vendor Profile — ${preview.record?.name || id}.pdf`,
              metadata: {
                vendor: preview.record?.name || ''
              }
            });
          } catch { /* Best-effort */ }
        }
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

  const handleDownloadPdf = async () => {
    if (!data) return;
    setBusy(true);
    try {
      if (sheetRef.current) {
        await exportSheetsAsPdf([sheetRef.current], { filename: `vendor-profile-${data.record.id}` });
        await vendorService.logVendorPrint(id);
      }
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !data) {
    return (
      <PurchasePageLayout className="pr-print-page">
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
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout className="pr-print-page">
      {/* Hidden measure area — keeps the sheet styles available for the
          print rasteriser even before the sheet mounts. */}
      <style>{PRINT_SHEET_STYLES}</style>

      {/* Toolbar — Back · title · Edit / Print / Download PDF */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Vendor Management', to: '/purchase/vendors' },
          { label: 'Preview' }
        ]}
        icon={Printer}
        title="Vendor Profile Preview"
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(`/purchase/vendors/${id}`)}
              className="po-btn po-btn-secondary"
            >
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>
            <button
              type="button"
              onClick={() => navigate(`/purchase/vendors/${id}/edit`, { state: { from: 'print' } })}
              className="po-btn po-btn-secondary"
            >
              <Pencil className="po-btn-icon-ic" /> Edit
            </button>
            <button type="button" onClick={() => window.print()} className="po-btn po-btn-secondary">
              <Printer className="po-btn-icon-ic" /> Print
            </button>
            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={busy}
              className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Download className="po-btn-icon-ic" />}
              Download PDF
            </button>
          </>
        }
      />

      {/* A4 sheet */}
      <div className="pr-sheet-stack">
        <div className="pr-sheet-card">
          <VendorPrintSheet data={data} sheetRef={sheetRef} />
        </div>
      </div>
    </PurchasePageLayout>
  );
}
