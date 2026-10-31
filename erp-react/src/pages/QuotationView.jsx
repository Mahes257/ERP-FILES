import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FileDown, FileText, Info, Printer } from 'lucide-react';
import { useToast } from '../components/Common';
import CompanyLogo from '../components/Common/CompanyLogo';
import cprService from '../services/cprService';
import { cprDocument, normalizeCpr } from '../utils/cprHelpers';
import { buildCprPrintHtml, exportCprDocumentPdf } from '../utils/cprExportUtils';
import { formatDate, formatINR } from '../utils/leadHelpers';

export default function QuotationView() {
  const { cprId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [cpr, setCpr] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    cprService
      .getCpr(cprId)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        if (!raw?.id && !raw?.prNo) {
          setNotFound(true);
        } else {
          setCpr(normalizeCpr(raw));
        }
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cprId]);

  const handlePdf = async () => {
    try {
      await exportCprDocumentPdf(cpr, `${cpr.convertedToQtn || cpr.prNo || 'quotation'}-${new Date().toISOString().slice(0, 10)}`);
      toast.success('Quotation PDF downloaded');
    } catch (err) {
      toast.error(err?.message || 'PDF export failed');
    }
  };

  const handlePrint = () => {
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
      toast.error('Pop-up blocked. Please allow pop-ups to print.');
      return;
    }
    win.document.open();
    win.document.write(buildCprPrintHtml(cpr, 'Quotation'));
    win.document.close();
  };

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  if (notFound || !cpr) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6">
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <Info className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">Quotation Not Found</h2>
          <p className="text-xs text-slate-400 mb-5">The source CPR for this quotation does not exist.</p>
          <button
            type="button"
            onClick={() => navigate('/cprs')}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to CPR List
          </button>
        </div>
      </div>
    );
  }

  const d = cprDocument(cpr);
  const totalQty = d.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);

  return (
    <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-[#0B4A3D]" />
            {cpr.convertedToQtn || 'Quotation'}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">
            Generated from CPR {cpr.prNo} on {formatDate(cpr.updatedAt || cpr.createdAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(`/cprs/${cpr.id}`)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to CPR
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" /> Download PDF
          </button>
        </div>
      </div>

      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <CompanyLogo variant="plate" className="h-10 w-auto object-contain" />
            <div className="text-sm font-bold text-slate-700 mt-1">Quotation</div>
            <div className="text-xs text-slate-400">{cpr.convertedToQtn || cpr.prNo}</div>
          </div>
          <div className="text-right text-xs text-slate-400">
            <div className="font-bold text-slate-700">{formatDate(cpr.updatedAt || cpr.createdAt)}</div>
            <div>Reference: {cpr.prNo}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Bill To</div>
            <div className="text-xs space-y-0.5">
              <div className="font-bold text-slate-800">{cpr.client || cpr.clientName || '—'}</div>
              {cpr.company && <div>{cpr.company}</div>}
              {cpr.contactPerson && <div>{cpr.contactPerson}</div>}
              {cpr.phone && <div>{cpr.phone}</div>}
              {cpr.email && <div>{cpr.email}</div>}
              {cpr.gst && <div>GST: {cpr.gst}</div>}
              {cpr.billingAddress && <div>{cpr.billingAddress}</div>}
            </div>
          </div>
          <div className="text-xs space-y-1 sm:text-right">
            <div><span className="text-slate-400">Department:</span> {cpr.department || '—'}</div>
            <div><span className="text-slate-400">Required By:</span> {formatDate(cpr.requiredDate) || '—'}</div>
            <div><span className="text-slate-400">Priority:</span> {cpr.priority || '—'}</div>
            {cpr.project && <div><span className="text-slate-400">Project:</span> {cpr.project}</div>}
            {cpr.leadNo && <div><span className="text-slate-400">Lead No:</span> {cpr.leadNo}</div>}
          </div>
        </div>

        <div className="mt-6 overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full border-collapse" style={{ minWidth: 640 }}>
            <thead>
              <tr className="bg-[#0B4A3D] text-white">
                {['#', 'Drawing No', 'Description', 'Specification', 'Qty', 'Unit', 'Rate', 'Amount'].map((h) => (
                  <th key={h} className="px-2 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.items.map((it, idx) => (
                <tr key={idx} className="border-b border-slate-100">
                  <td className="px-2 py-2 text-xs text-slate-500">{idx + 1}</td>
                  <td className="px-2 py-2 text-xs">{it.drawingNo || '—'}</td>
                  <td className="px-2 py-2 text-xs font-medium">{it.description || '—'}</td>
                  <td className="px-2 py-2 text-xs">{it.specification || '—'}</td>
                  <td className="px-2 py-2 text-xs">{it.qty ?? '—'}</td>
                  <td className="px-2 py-2 text-xs">{it.unit || '—'}</td>
                  <td className="px-2 py-2 text-xs">{formatINR(Number(it.estimatedCost) || 0)}</td>
                  <td className="px-2 py-2 text-xs font-semibold">
                    {formatINR((Number(it.qty) || 0) * (Number(it.estimatedCost) || 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50">
                <td colSpan={6} className="px-2 py-2.5 text-xs font-bold text-[#0B4A3D]">
                  Total ({totalQty} qty)
                </td>
                <td colSpan={2} className="px-2 py-2.5 text-sm font-extrabold text-[#0B4A3D] text-right">
                  {formatINR(d.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex justify-end mt-4">
          <div className="w-72 border border-slate-200 rounded-lg overflow-hidden">
            {[
              ['Estimated Total', formatINR(d.total)],
              ...(d.costWorkout > 0 ? [['Cost Workout', formatINR(d.costWorkout)]] : []),
              ...(d.profit != null ? [['Profit', formatINR(d.profit)]] : []),
              ...(d.marginPct != null ? [['Profit %', `${d.marginPct.toFixed(2)}%`]] : [])
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between px-3 py-1.5 text-xs border-b border-slate-100 last:border-b-0">
                <span className="text-slate-400">{k}</span>
                <span className="font-bold text-slate-800">{v}</span>
              </div>
            ))}
          </div>
        </div>

        {cpr.remarks && (
          <div className="mt-5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terms &amp; Remarks</div>
            <div className="text-xs text-slate-600 whitespace-pre-wrap">{cpr.remarks}</div>
          </div>
        )}
      </div>
    </div>
  );
}
