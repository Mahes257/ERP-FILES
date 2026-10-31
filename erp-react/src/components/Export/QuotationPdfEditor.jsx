import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, FileDown, PenLine, Trash2, AlertCircle } from 'lucide-react';
import { Modal } from '../Common';
import { exportSalesDocumentPdf } from '../../utils/salesPrintUtils';
import { downloadBlob } from '../../utils/leadHelpers';

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-[#0B4A3D] placeholder:text-slate-400';

/**
 * In-browser PDF editor for one exported quotation.
 *
 * - Generates the REAL quotation PDF from the document's database data by
 *   reusing exportSalesDocumentPdf (the exact same output as the download),
 *   just without the auto-save.
 * - Opens the PDF in the browser's native viewer (iframe) so it can be
 *   verified page by page.
 * - Lets the user add text notes on any page; notes are merged back into the
 *   original PDF with pdf-lib, so the original quotation data is untouched and
 *   the file is not corrupted.
 * - The modified PDF downloads with the quotation number in the filename.
 * - Also links to the existing Quotation Design Studio (the document content
 *   editing workflow) so content edits flow through the established editor.
 */
export default function QuotationPdfEditor({ doc, onClose }) {
  const navigate = useNavigate();
  const [pdfBytes, setPdfBytes] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [pageCount, setPageCount] = useState(1);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState('');
  const [notePage, setNotePage] = useState(1);
  const [notePosition, setNotePosition] = useState('bottom');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(true);

  const no = doc?.quotationNo || doc?.id || 'quotation';
  const safeNo = String(no).replace(/[\\/:*?"<>|]/g, '_');
  const baseFilename = `Quotation_${safeNo}`;

  useEffect(() => {
    let cancelled = false;
    let url = null;
    (async () => {
      setGenerating(true);
      setError('');
      try {
        const bytes = await exportSalesDocumentPdf(doc, 'Quotation', 'quotation', baseFilename, {
          download: false
        });
        if (cancelled) return;
        setPdfBytes(bytes);
        url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        setBlobUrl(url);
        const { PDFDocument } = await import('pdf-lib');
        const pdf = await PDFDocument.load(bytes);
        setPageCount(Math.max(1, pdf.getPageCount()));
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Failed to generate the PDF');
      } finally {
        if (!cancelled) setGenerating(false);
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
    // Regenerate only when the target quotation changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    const page = Math.min(Math.max(1, Number(notePage) || 1), pageCount);
    setNotes((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, page, text, position: notePosition }]);
    setNoteText('');
  };

  const removeNote = (id) => setNotes((prev) => prev.filter((n) => n.id !== id));

  const downloadOriginal = () => {
    if (!pdfBytes) return;
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), `${baseFilename}.pdf`);
  };

  const openDesignStudio = () => {
    if (!doc?.id) return;
    onClose();
    navigate(`/quotations/design?id=${doc.id}`);
  };

  const saveEdited = async () => {
    if (!pdfBytes) return;
    setBusy(true);
    setError('');
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdf = await PDFDocument.load(pdfBytes);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      for (const note of notes) {
        const pageIndex = Math.min(Math.max(1, Number(note.page) || 1), pageCount) - 1;
        const page = pdf.getPage(pageIndex);
        const { height } = page.getSize();
        const lines = String(note.text)
          .split('\n')
          .filter((l) => l.trim());
        let y = note.position === 'top' ? height - 64 : 48;
        for (const line of lines) {
          if (y < 16 || y > height - 16) break;
          try {
            page.drawText(line, { x: 40, y, size: 9, font, color: rgb(0.15, 0.21, 0.36) });
          } catch {
            // Skip lines the base font cannot encode; the PDF stays valid.
          }
          y -= 11;
        }
      }
      const bytes = await pdf.save();
      downloadBlob(new Blob([bytes], { type: 'application/pdf' }), `${baseFilename}_edited.pdf`);
      onClose();
    } catch (err) {
      setError(err?.message || 'Failed to save the edited PDF');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Quotation PDF"
      maxWidth="max-w-6xl"
      closeOnBackdrop={false}
      footer={
        <>
          <button
            type="button"
            onClick={openDesignStudio}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3.5 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Edit in Design Studio
          </button>
          <button
            type="button"
            onClick={downloadOriginal}
            disabled={!pdfBytes || generating}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3.5 py-2 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" /> Download Original
          </button>
          <button
            type="button"
            onClick={saveEdited}
            disabled={!pdfBytes || generating || busy}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy ? (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
            ) : (
              <PenLine className="w-3.5 h-3.5" />
            )}
            {busy ? 'Saving...' : 'Save Edited PDF'}
          </button>
        </>
      }
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="text-xs font-bold text-slate-700">{no}</span>
        {generating && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
            <span className="h-3 w-3 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
            Generating PDF from quotation data...
          </span>
        )}
        {!generating && pdfBytes && (
          <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            {pageCount} page{pageCount === 1 ? '' : 's'}
          </span>
        )}
        {error && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
            <AlertCircle className="w-3 h-3" /> {error}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_280px] gap-4 items-start">
        {/* ===== PDF preview (real document, native viewer) ===== */}
        <div className="min-w-0">
          {blobUrl ? (
            <iframe
              title={`Quotation PDF preview - ${no}`}
              src={blobUrl}
              className="w-full rounded-lg border border-slate-200 bg-white"
              style={{ height: '62vh', minHeight: 420 }}
            />
          ) : (
            <div
              className="w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center"
              style={{ height: '62vh', minHeight: 420 }}
            >
              <div className="text-center px-6">
                <FileDown className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-400">
                  {generating ? 'Preparing the quotation PDF...' : error || 'PDF could not be generated.'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ===== Notes panel ===== */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
              Add Note to PDF
            </h4>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="Note text (e.g. 'Approved by finance')..."
              className={INPUT_CLS}
            />
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Page
                </label>
                <input
                  type="number"
                  min={1}
                  max={pageCount}
                  value={notePage}
                  onChange={(e) => setNotePage(e.target.value)}
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">
                  Position
                </label>
                <select
                  value={notePosition}
                  onChange={(e) => setNotePosition(e.target.value)}
                  className={`${INPUT_CLS} cursor-pointer`}
                >
                  <option value="bottom">Bottom</option>
                  <option value="top">Top</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={addNote}
              disabled={!noteText.trim() || generating || !pdfBytes}
              className="mt-2 w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-[#0B4A3D] hover:bg-[#083D34] px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <PenLine className="w-3.5 h-3.5" /> Add Note
            </button>
          </div>

          <div>
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">
              Notes on PDF ({notes.length})
            </h4>
            {notes.length === 0 ? (
              <p className="text-[11px] text-slate-400">No notes added yet.</p>
            ) : (
              <ul className="space-y-2 max-h-56 overflow-y-auto">
                {notes.map((note) => (
                  <li
                    key={note.id}
                    className="flex items-start gap-2 bg-white border border-slate-200 rounded-md px-2.5 py-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-[#0B4A3D]">
                        Page {note.page} · {note.position === 'top' ? 'Top' : 'Bottom'}
                      </div>
                      <div className="text-[11px] text-slate-600 break-words whitespace-pre-wrap">
                        {note.text}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeNote(note.id)}
                      aria-label="Remove note"
                      className="p-1 text-slate-300 hover:text-rose-500 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-slate-400 leading-relaxed mt-2">
              Notes are drawn onto the original quotation PDF. The quotation data itself is never
              changed.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
