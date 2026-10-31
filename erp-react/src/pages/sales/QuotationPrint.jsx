import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Printer } from 'lucide-react';
import quotationService from '../../services/quotationService';
import { buildSalesPrintHtml } from '../../utils/salesPrintUtils';
import './quotation-module.css';

export default function QuotationPrint() {
  const { id } = useParams();
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState(id ? '' : 'No quotation selected');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    quotationService
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res;
        if (!raw?.id) {
          setError('Quotation not found');
          return;
        }
        setHtml(buildSalesPrintHtml(raw, 'Quotation', 'quotation'));
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load quotation');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const doPrint = () => {
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) {
      window.print();
      return;
    }
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 250);
  };

  return (
    /* `erp-detail-scope` styles the Print button via the shared detail-action
       standard (styles/erp-detail-scope.css). */
    <div className="erp-detail-scope qpo-page">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileText className="w-6 h-6 text-[#0B4A3D]" />
            Quotation Print View
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5">Print-ready preview of the quotation</p>
        </div>
        {html && (
          <button
            type="button"
            onClick={doPrint}
            className="erp-detail-action erp-detail-action--primary"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      ) : error ? (
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-10 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <h2 className="text-base font-bold text-slate-700 mb-1">{error}</h2>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="max-w-[820px] mx-auto" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
    </div>
  );
}
