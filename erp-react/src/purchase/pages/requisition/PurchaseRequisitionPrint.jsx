/**
 * purchase/pages/requisition/PurchaseRequisitionPrint.jsx
 * ------------------------------------------------------------------
 * Purchase Requisition print preview page with full editing support.
 *
 *   Modes:
 *     Preview (default) — read-only A4 document preview
 *     Edit              — fully editable document with form inputs
 *     Print/PDF         — clean document without input controls
 *
 *   Toolbar  : ← Back · Edit / Cancel · Save · Print · Download PDF · Copy
 *   Document : ONE reusable A4 template (RequisitionPrintDocument).
 *              Line items are split across pages by measuring the real
 *              rendered heights — the table header repeats on every
 *              page and no row is ever cut in half.
 *   Print    : window.print() with app chrome hidden (@media print).
 *   PDF      : the exact same `.pr-sheet` DOM nodes are rasterised and
 *              written into an A4 portrait PDF (utils/export.js).
 *   Edit     : toggles inline editing of all fields; changes auto-
 *              recalculate totals and amount in words.
 *   Save     : persists edits via the existing PR service.
 *   Copy     : copies the document as rich inline-styled HTML.
 *
 *   INLINE EDITING: All visible values (header, details, items, notes,
 *   signatories) are editable via form inputs. React state mirrors
 *   every edit — the financial summary recalculates live.
 *   Amount in Words auto-generates from the current Grand Total.
 *   The edited content can be copied as rich HTML for email.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ChevronLeft, Copy, Download, Loader2, Pencil, Printer, Save, XCircle
} from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import { requisitionService } from '../../services/requisition';
import { exportSheetsAsPdf } from '../../utils/export';
import { registerGeneratedDocument, updateGeneratedDocumentUrl } from '../../services/documentRegistration';
import { handlePrCopyEvent, copyPrToClipboard } from '../../utils/prClipboard';
import '../../styles/cpr-list.css';
import { usePrEditState } from '../../hooks/usePrEditState';
import {
  PRINT_SHEET_STYLES,
  RequisitionDocumentBottom,
  RequisitionItemsTable,
  RequisitionPrintHeader,
  RequisitionPrintSheet,
  RequisitionRunningHeader,
  RequisitionSheetFooter
} from '../../components/RequisitionPrintDocument';
import { paginateRequisitionPrint } from '../../utils/printPagination';



export default function PurchaseRequisitionPrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [pages, setPages] = useState(null); // null → measuring
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  /* Edit state via custom hook. */
  const {
    editableData,
    isEditing,
    saving,
    hasUnsavedChanges,
    initializeData,
    startEditing,
    cancelEditing,
    saveData,
    handleCompanyChange,
    handleRecordChange,
    handleItemChange,
    handleAddItem,
    handleRemoveItem,
    handleTopLevelChange
  } = usePrEditState(id, data, { onToast: toast });

  /* Measure-stage refs. */
  const emptySheetRef = useRef(null);
  const topRef = useRef(null);
  const runningRef = useRef(null);
  const tableHeadRef = useRef(null);
  const tbodyRef = useRef(null);
  const bottomRef = useRef(null);
  const footRef = useRef(null);
  const sheetRefs = useRef({});

  /* Scope the print CSS. */
  useEffect(() => {
    document.body.classList.add('pr-print-page');
    return () => document.body.classList.remove('pr-print-page');
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setPages(null);
      try {
        const preview = await requisitionService.printPreview(id);
        if (!cancelled) {
          setData(preview);
          initializeData(preview);

          /* Auto-register the document in the repository on preview load */
          try {
            const prNo = preview.record?.prNo || id;
            await registerGeneratedDocument({
              docType: 'PR',
              sourceId: id,
              docNo: prNo,
              name: `Purchase Requisition — ${prNo}.pdf`,
              metadata: {
                prNo,
                vendor: preview.record?.vendor || '',
                rfqNo: preview.record?.rfqNo || ''
              }
            });
          } catch {
            /* Best-effort */
          }
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
  }, [id, initializeData]);

  /* ---------------------------------------------------------------- */
  /*  Copy to clipboard.                                               */
  /* ---------------------------------------------------------------- */
  const handleCopy = useCallback((event) => {
    if (!editableData) return;
    handlePrCopyEvent(event, editableData);
  }, [editableData]);

  const handleCopyButton = useCallback(async () => {
    if (!editableData) return;
    setCopyBusy(true);
    try {
      const success = await copyPrToClipboard(editableData);
      if (success) {
        toast.success('Copied as rich HTML — paste into Gmail / Outlook');
      } else {
        toast.error('Copy failed — try selecting the document and pressing Ctrl+C');
      }
    } catch {
      toast.error('Copy failed');
    } finally {
      setCopyBusy(false);
    }
  }, [editableData, toast]);

  /* ---------------------------------------------------------------- */
  /*  Measurement + pagination.                                        */
  /* ---------------------------------------------------------------- */
  const collectMeasures = () => {
    const sheet = emptySheetRef.current;
    const inner = sheet?.querySelector('.pr-sheet-inner');
    const innerStyle = inner ? getComputedStyle(inner) : null;
    const SAFETY_BUFFER = 14;
    const contentHeight =
      (sheet?.clientHeight || 0) -
      (innerStyle ? parseFloat(innerStyle.paddingTop) + parseFloat(innerStyle.paddingBottom) : 0) -
      (footRef.current?.offsetHeight || 0) - SAFETY_BUFFER;

    return {
      contentHeight: Math.max(0, contentHeight),
      topHeight: topRef.current?.offsetHeight || 0,
      runningHeight: runningRef.current?.offsetHeight || 0,
      tableHeadHeight: tableHeadRef.current?.offsetHeight || 0,
      bottomHeight: bottomRef.current?.offsetHeight || 0,
      rowHeights: Array.from(tbodyRef.current?.querySelectorAll('tr:not(.pr-empty-row)') || []).map((tr) => tr.offsetHeight)
    };
  };

  useEffect(() => {
    if (!editableData) return;
    let cancelled = false;

    const run = async () => {
      try {
        await (document.fonts?.ready ?? Promise.resolve());
      } catch {
        /* fonts API unavailable — proceed anyway */
      }
      requestAnimationFrame(() => {
        if (cancelled) return;
        try {
          const measures = collectMeasures();
          setPages(paginateRequisitionPrint(measures));
        } catch (err) {
          console.error('Failed to paginate requisition preview', err);
          setPages([]);
        }
      });
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [editableData]);

  /* ---------------------------------------------------------------- */
  /*  PDF download.                                                    */
  /* ---------------------------------------------------------------- */
  const handleDownloadPdf = async () => {
    if (!editableData || pages === null) return;
    setBusy(true);
    try {
      const sheetList = Object.keys(sheetRefs.current)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) => sheetRefs.current[key])
        .filter(Boolean);
      const pdfBlob = await exportSheetsAsPdf(sheetList, { filename: `purchase-requisition-${editableData.record.prNo}` });
      await requisitionService.logPrintActivity(id);

      /* Register the generated PDF in the central Documents repository */
      try {
        const prNo = editableData.record.prNo || id;
        const fileName = `Purchase Requisition — ${prNo}.pdf`;
        /* Read the blob as data URL for preview/download */
        let dataUrl = '';
        let fileSize = 0;
        if (pdfBlob instanceof Blob) {
          dataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => resolve('');
            reader.readAsDataURL(pdfBlob);
          });
          fileSize = pdfBlob.size;
        }
        await registerGeneratedDocument({
          docType: 'PR',
          sourceId: id,
          docNo: prNo,
          name: fileName,
          sourceUrl: dataUrl,
          fileSize,
          metadata: {
            prNo,
            vendor: editableData.record.vendor || '',
            rfqNo: editableData.record.rfqNo || ''
          }
        });
      } catch {
        /* Registration is best-effort — don't block the download */
      }

      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Edit mode handlers.                                              */
  /* ---------------------------------------------------------------- */
  const handleSave = async () => {
    await saveData();
  };

  const handleCancelEdit = () => {
    cancelEditing();
    /* Re-paginate after cancel. */
    setPages(null);
  };

  const handleToggleEdit = () => {
    if (isEditing) {
      handleCancelEdit();
    } else {
      startEditing();
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Print / Preview / Edit mode indicator for CSS.                   */
  /* ---------------------------------------------------------------- */
  const pageClass = `pr-print-page${isEditing ? ' pr-print-page--editing' : ''}`;

  /* ---------------------------------------------------------------- */
  /*  Render.                                                          */
  /* ---------------------------------------------------------------- */

  if (loading) {
    return (
      <PurchasePageLayout className={pageClass}>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !editableData) {
    return (
      <PurchasePageLayout className={pageClass}>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Requisition not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/requisition')}
            className="po-btn po-btn-primary mt-4"
          >
            Go to Requisitions
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const { record, company } = editableData;
  const allItemIndices = (record.items || []).map((_, index) => index);

  return (
    <PurchasePageLayout className={pageClass}>
      {/* Hidden measurement area. */}
      {pages === null && (
        <div className="pr-measure" aria-hidden="true">
          <style>{PRINT_SHEET_STYLES}</style>
          <section className="pr-sheet" ref={emptySheetRef}>
            <div className="pr-sheet-inner" />
          </section>
          <div ref={topRef}>
            <RequisitionPrintHeader company={company} record={record} />
          </div>
          <div ref={runningRef}>
            <RequisitionRunningHeader company={company} record={record} pageNumber={2} totalPages={2} />
          </div>
          <div ref={tableHeadRef}>
            <RequisitionItemsTable headOnly currency={record.currency} totals={record.totals || {}} />
          </div>
          <RequisitionItemsTable
            items={record.items || []}
            indices={allItemIndices}
            currency={record.currency}
            totals={record.totals || {}}
            refs={{ tbody: tbodyRef }}
          />
          <div ref={bottomRef}>
            <RequisitionDocumentBottom
              record={record}
              totals={record.totals || {}}
              currency={record.currency}
              preparedBy={editableData.preparedBy}
              checkedBy={editableData.checkedBy}
              approvedBy={editableData.approvedBy}
            />
          </div>
          <div ref={footRef}>
            <RequisitionSheetFooter generatedAt={editableData.generatedAt} pageNumber={1} totalPages={1} />
          </div>
        </div>
      )}

      {/* Toolbar — Back · Edit / Cancel · Save · Print · Copy · Download PDF */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Requisition', to: '/purchase/requisition' },
          { label: isEditing ? 'Edit' : 'Preview' }
        ]}
        icon={Printer}
        title={isEditing ? 'Edit Purchase Requisition' : 'Purchase Requisition Preview'}
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(`/purchase/requisition/${id}`)}
              className="po-btn po-btn-secondary"
            >
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>

            {isEditing ? (
              <>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="po-btn po-btn-secondary"
                >
                  <XCircle className="po-btn-icon-ic" /> Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !hasUnsavedChanges}
                  className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Save className="po-btn-icon-ic" />}
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleToggleEdit}
                  className="po-btn po-btn-secondary"
                >
                  <Pencil className="po-btn-icon-ic" /> Edit
                </button>
                <button type="button" onClick={() => window.print()} className="po-btn po-btn-secondary">
                  <Printer className="po-btn-icon-ic" /> Print
                </button>
                <button
                  type="button"
                  onClick={handleCopyButton}
                  disabled={copyBusy || pages === null}
                  className="po-btn po-btn-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {copyBusy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Copy className="po-btn-icon-ic" />}
                  Copy
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={busy || pages === null}
                  className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Download className="po-btn-icon-ic" />}
                  Download PDF
                </button>
              </>
            )}
          </>
        }
      />

      {/* A4 sheet stack — wrapped with onCopy for Ctrl+C support. */}
      <div className="pr-sheet-stack" onCopy={handleCopy}>
        {pages === null ? (
          <div className="pr-sheet-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparing preview…
          </div>
        ) : (
          pages.map((page, index) => (
            <div className="pr-sheet-card" key={index}>
              <RequisitionPrintSheet
                page={page}
                pageNumber={index + 1}
                totalPages={pages.length}
                data={editableData}
                sheetRef={(el) => {
                  if (el) sheetRefs.current[index + 1] = el;
                  else delete sheetRefs.current[index + 1];
                }}
                editMode={isEditing}
                onCompanyChange={handleCompanyChange}
                onRecordChange={handleRecordChange}
                onItemChange={handleItemChange}
                onAddItem={handleAddItem}
                onRemoveItem={handleRemoveItem}
                onTopLevelChange={handleTopLevelChange}
              />
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}
