import { FileDown, Printer, X } from 'lucide-react';
import { Modal, useToast } from '../Common';
import CprDocument from './CprDocument';
import { buildCprPrintHtml, exportCprDocumentPdf } from '../../utils/cprExportUtils';

/**
 * CPR Preview modal — the in-record preview used by the CPR detail page.
 *
 * The document layout itself lives in CprDocument (shared with the standalone
 * document preview page opened from Documents → View / Preview); this component
 * only owns the modal chrome and the Print / Download PDF actions, which reuse
 * the existing CPR print-HTML and jsPDF exporters.
 */
export default function CprPreviewModal({ cpr, open, onClose }) {
  const toast = useToast();
  if (!cpr) return null;

  const handlePdf = async () => {
    try {
      await exportCprDocumentPdf(cpr, `${cpr.prNo || 'cpr'}-${new Date().toISOString().slice(0, 10)}`);
      toast.success('PDF downloaded');
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
    win.document.write(buildCprPrintHtml(cpr, 'Purchase Request'));
    win.document.close();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Preview - ${cpr.prNo || ''}`}
      footer={
        <>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </button>
          <button
            type="button"
            onClick={handlePdf}
            className="flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" /> Download PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-4 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" /> Close
          </button>
        </>
      }
    >
      <div className="max-h-[65vh] overflow-y-auto pr-1">
        <CprDocument cpr={cpr} />
      </div>
    </Modal>
  );
}
