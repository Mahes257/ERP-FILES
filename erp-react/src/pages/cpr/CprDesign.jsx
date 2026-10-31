// ============================================================================
// CprDesign — the CPR document preview page.
//
// Opened by Documents → Actions → View / Preview for every document whose
// source module is CPR (`/cprs/design?id=<cprId>`), so a CPR document gets the
// same professional, PDF-style preview page the Sales Execution documents get
// from their Design pages (/invoices/design, /sales-contracts/design, …).
//
// The page owns only the workspace (breadcrumb, toolbar, white document page,
// information sidebar). The document layout itself is CprDocument — the SAME
// renderer the CPR detail page's preview modal uses — and Print / Download PDF
// reuse the existing buildCprPrintHtml() / exportCprDocumentPdf() exporters, so
// nothing about the CPR document is re-implemented or hardcoded here.
// ============================================================================
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  FileDown,
  FileText,
  Loader2,
  Printer
} from 'lucide-react';
import { useToast } from '../../components/Common';
import SalesBreadcrumb from '../../components/SalesTable/SalesBreadcrumb';
import { CprDocument } from '../../components/CprDetail';
import { CprStatusBadge } from '../../components/CprTable';
import cprService from '../../services/cprService';
import { normalizeCpr } from '../../utils/cprHelpers';
import { buildCprPrintHtml, exportCprDocumentPdf } from '../../utils/cprExportUtils';
import { formatDate, formatDateTime, formatINR } from '../../utils/leadHelpers';
import '../crm/crm-erp.css';

/** Labelled row for the information sidebar — same shape used across the ERP. */
function InfoRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
      <span className="text-[11px] text-slate-400 shrink-0">{label}</span>
      <span className="text-[11px] font-medium text-slate-700 text-right break-words">
        {value === null || value === undefined || value === '' ? '—' : value}
      </span>
    </div>
  );
}

export default function CprDesign() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id') || '';

  // Entry point: the CPR list's row ⋮ → Preview opens this page with
  // `from=cprs`, so Back / Close returns to the CPR table (and its list state)
  // instead of Documents. Opening from Documents (the default) is unchanged.
  const fromCprList = searchParams.get('from') === 'cprs';
  const backTo = fromCprList ? '/cprs' : '/documents';
  const backLabel = fromCprList ? 'Back to CPR List' : 'Back to Documents';

  const [cpr, setCpr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadCpr = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setLoadError('No CPR was selected. Open a document from the Documents list.');
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const res = await cprService.getCpr(id);
      setCpr(normalizeCpr(res?.data ?? res ?? {}));
    } catch (err) {
      console.error('Failed to load CPR for preview', err);
      const status = err?.status ?? err?.response?.status;
      if (status === 403) setLoadError('You do not have permission to view this CPR.');
      else if (status === 404) setLoadError('This CPR no longer exists.');
      else setLoadError(err?.message || 'Failed to load the CPR document.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    const timer = setTimeout(loadCpr, 0);
    return () => clearTimeout(timer);
  }, [loadCpr]);

  const handlePrint = () => {
    if (!cpr) return;
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }
    win.document.open();
    win.document.write(buildCprPrintHtml(cpr, 'Purchase Request'));
    win.document.close();
  };

  const handleDownloadPdf = useCallback(async () => {
    if (!cpr) return;
    setExporting(true);
    try {
      await exportCprDocumentPdf(cpr, `${cpr.prNo || 'cpr'}-${new Date().toISOString().slice(0, 10)}`);
      toast.success('PDF downloaded');
    } catch (err) {
      console.error('CPR PDF export failed', err);
      toast.error(err?.message || 'PDF export failed');
    } finally {
      setExporting(false);
    }
  }, [cpr, toast]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <Loader2 className="w-6 h-6 text-[#0B4A3D] animate-spin" />
      </div>
    );
  }

  if (!cpr || loadError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
        <FileText className="w-12 h-12 text-slate-300 mb-4" />
        <h3 className="text-base font-bold text-slate-700 mb-1.5">CPR preview unavailable</h3>
        <p className="text-xs text-slate-400 mb-5">{loadError || 'This CPR document could not be loaded.'}</p>
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
        </button>
      </div>
    );
  }

  const itemCount = (cpr.items || []).length;
  const estimatedTotal = (cpr.items || []).reduce(
    (sum, it) => sum + (Number(it.qty) || 0) * (Number(it.estimatedCost) || 0),
    0
  );

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      <SalesBreadcrumb
        items={[
          { label: fromCprList ? 'CPR' : 'Documents', to: backTo },
          { label: 'CPR Preview' }
        ]}
      />

      {/* ===== HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold text-slate-900 tracking-tight">
            <FileText className="w-6 h-6 text-[#0B4A3D]" />
            CPR Preview
          </h1>
          <p className="text-xs text-slate-400 mt-1">Preview, print and download the Customer Purchase Request document</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-bold text-slate-700">{cpr.prNo}</span>
          <CprStatusBadge status={cpr.status} />
        </div>
      </div>

      {/* ===== TOOLBAR ===== */}
      <div className="flex items-center gap-2 flex-wrap mb-4 bg-surface border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
        <button
          type="button"
          onClick={() => navigate(backTo)}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
        </button>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-[#0B4A3D] hover:bg-[#083D34]"
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
        <button
          type="button"
          onClick={handleDownloadPdf}
          disabled={exporting}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50 disabled:opacity-50"
        >
          <FileDown className="w-3.5 h-3.5" /> {exporting ? 'Exporting...' : 'Download PDF'}
        </button>
        <button
          type="button"
          onClick={() => navigate(`/cprs/${cpr.id}`)}
          className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
        >
          <ExternalLink className="w-3.5 h-3.5" /> Open CPR Record
        </button>
      </div>

      {/* ===== DOCUMENT + INFORMATION SIDEBAR ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        <div className="min-w-0">
          <CprDocument cpr={cpr} />
        </div>

        <aside className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
            Document Information
          </div>
          <InfoRow label="Document Type" value="CPR" />
          <InfoRow label="Record Number" value={cpr.prNo} />
          <InfoRow label="Customer" value={cpr.client || cpr.clientName} />
          <InfoRow label="Status" value={<CprStatusBadge status={cpr.status} />} />
          <InfoRow label="Approval" value={cpr.approvalStatus} />
          <InfoRow label="Priority" value={cpr.priority} />
          <InfoRow label="CPR Date" value={formatDate(cpr.prDate || cpr.createdAt)} />
          <InfoRow label="Department" value={cpr.department} />
          <InfoRow label="Requested By" value={cpr.requestedBy || cpr.createdBy} />
          <InfoRow label="Line Items" value={itemCount} />
          <InfoRow label="Estimated Total" value={formatINR(estimatedTotal)} />
          <InfoRow label="Last Updated" value={formatDateTime(cpr.updatedAt)} />

          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => navigate(`/cprs/${cpr.id}`)}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-white bg-[#0B4A3D] hover:bg-[#083D34]"
            >
              <ExternalLink className="w-3.5 h-3.5" /> Open CPR Record
            </button>
            <button
              type="button"
              onClick={() => navigate(backTo)}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold px-3.5 h-9 rounded-lg transition-colors cursor-pointer text-slate-600 bg-surface border border-slate-200 hover:bg-slate-50"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> {backLabel}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
