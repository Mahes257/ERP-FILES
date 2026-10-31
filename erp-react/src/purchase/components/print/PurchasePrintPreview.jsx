/**
 * purchase/components/print/PurchasePrintPreview.jsx
 * ------------------------------------------------------------------
 * THE single reusable print preview wrapper.
 *
 * Wraps ANY document content into the standardized A4 print layout:
 *   - Toolbar: Back · Edit (optional) · Print · Download PDF
 *   - A4 sheet stack with proper shadow/background
 *   - Print CSS that hides chrome and prints only the document
 *   - PDF export via the existing exportSheetsAsPdf utility
 *
 * Usage:
 *   <PurchasePrintPreview
 *     breadcrumb={[{ label: 'Purchase Orders', to: '/purchase/orders' }, { label: 'Preview' }]}
 *     backTo="/purchase/orders/PO-2026-0001"
 *     editTo="/purchase/orders/PO-2026-0001/edit"
 *     docTitle="Purchase Order Preview"
 *     pdfFilename="po-2026-0001"
 *     onDownloadPdf={handleDownloadPdf}
 *   >
 *     <section className="pr-sheet">
 *       <style>{PRINT_SHARED_STYLES}</style>
 *       <div className="pr-sheet-inner">
 *         {/* document content *\/}
 *       </div>
 *       <PrintFooter ... />
 *     </section>
 *   </PurchasePrintPreview>
 * ------------------------------------------------------------------
 */
import { useCallback, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Pencil, Printer } from 'lucide-react';
import PurchaseHeader from '../PurchaseHeader';
import PurchasePageLayout from '../list/PurchasePageLayout';
import { exportSheetsAsPdf } from '../../utils/export';

export default function PurchasePrintPreview({
  breadcrumb = [],
  backTo,
  editTo,
  docTitle = 'Document Preview',
  pdfFilename = 'document',
  onDownloadPdf,
  children,
  loading = false,
  notFound = false,
  notFoundMessage = 'Document Not Found',
  notFoundSub = 'The requested document could not be found.',
  actions,
}) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const sheetRefs = useRef({});

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  const handleDownloadPdf = useCallback(async () => {
    if (onDownloadPdf) {
      await onDownloadPdf();
      return;
    }
    setBusy(true);
    try {
      const sheetList = Object.keys(sheetRefs.current)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) => sheetRefs.current[key])
        .filter(Boolean);
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: pdfFilename });
      }
    } catch {
      /* error handled by caller */
    } finally {
      setBusy(false);
    }
  }, [onDownloadPdf, pdfFilename]);

  const registerSheetRef = useCallback((el, pageNum) => {
    if (el) sheetRefs.current[pageNum] = el;
    else delete sheetRefs.current[pageNum];
  }, []);

  if (loading) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading preview…
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">{notFoundMessage}</p>
          <p className="text-xs text-slate-400 mt-1">{notFoundSub}</p>
          <div className="mt-4 inline-flex gap-2">
            {backTo && (
              <button type="button" onClick={() => navigate(backTo)} className="po-btn po-btn-secondary">
                <ChevronLeft className="po-btn-icon-ic" /> Back
              </button>
            )}
          </div>
        </div>
      </PurchasePageLayout>
    );
  }

  const crumbs = [...breadcrumb];

  return (
    <PurchasePageLayout className="pr-print-page">
      <PurchaseHeader
        variant="cpr"
        crumb={crumbs}
        icon={Printer}
        title={docTitle}
        actions={
          <>
            {actions}
            {backTo && (
              <button type="button" onClick={() => navigate(backTo)} className="po-btn po-btn-secondary">
                <ChevronLeft className="po-btn-icon-ic" /> Back
              </button>
            )}
            {editTo && (
              <button type="button" onClick={() => navigate(editTo)} className="po-btn po-btn-secondary">
                <Pencil className="po-btn-icon-ic" /> Edit
              </button>
            )}
            <button type="button" onClick={handlePrint} className="po-btn po-btn-secondary">
              <Printer className="po-btn-icon-ic" /> Print
            </button>
            <button type="button" onClick={handleDownloadPdf} disabled={busy} className="po-btn po-btn-primary disabled:opacity-60">
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Download className="po-btn-icon-ic" />}
              Download PDF
            </button>
          </>
        }
      />

      <div className="pr-sheet-stack">
        {children}
      </div>
    </PurchasePageLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  PrintSheetCard — wraps a single A4 sheet with card styling         */
/* ------------------------------------------------------------------ */
export function PrintSheetCard({ children, sheetRef }) {
  return (
    <div className="pr-sheet-card">
      {children}
    </div>
  );
}
