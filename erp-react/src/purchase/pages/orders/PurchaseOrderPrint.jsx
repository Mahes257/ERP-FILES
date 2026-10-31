/**
 * purchase/pages/orders/PurchaseOrderPrint.jsx
 * ------------------------------------------------------------------
 * Purchase Order print preview page — a full document EDITOR:
 *
 * Modes: Preview (default) · Edit (toolbar + design sidebar)
 * Toolbar: ← Back · Edit/Cancel · Design Sidebar · Save · Print ·
 *          Download PDF
 *
 * The visible A4 document IS the single source of truth: the exact
 * same DOM renders in preview, is edited inline, paginates, prints and
 * rasterises to PDF (exportSheetsAsPdf). Record-level edits respect the
 * PO workflow guard (Draft / Pending Approval only); the design
 * snapshot (logo, signatures, visibility, supplier layout) persists via
 * savePrintDesign on every status without touching workflow data.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft, Download, Loader2, Pencil, Printer, Save, SlidersHorizontal, XCircle
} from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PoPrintEditorPanel from '../../components/PoPrintEditorPanel';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { settingsService } from '../../services/settings';
import { DEFAULT_PO_PRINT_DESIGN, normalizePrintDesign, poPrintTemplateStore } from '../../services/poPrintDesign';
import { calcDocumentTotals } from '../../utils/purchase';
import { exportSheetsAsPdf } from '../../utils/export';
import { registerGeneratedDocument } from '../../services/documentRegistration';
import '../../styles/cpr-list.css';
import {
  PO_PRINT_STYLES,
  PoDocumentBottom,
  PoItemsTable,
  PoPrintHeader,
  PoPrintSheet,
  PoRunningHeader,
  PoSheetFooter
} from '../../components/PurchaseOrderPrintDocument';
import { paginateRequisitionPrint } from '../../utils/printPagination';

/* ─── Helpers ─── */

function computeTotals(record) {
  /* GST split must come from the record's own gst type; legacy records
     that only store IGST amounts are inferred as inter-state so the
     tax split never silently flips while editing. */
  const legacyIgst = Number(record.totals?.igst ?? 0) > 0;
  const gstType = record.gstType || (legacyIgst ? 'Inter-State' : '');
  return calcDocumentTotals(record.items, record.discount, record.charges, gstType);
}

const RECORD_EDITABLE_STATUSES = ['Draft', 'Pending Approval'];

export default function PurchaseOrderPrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const toast = useToast();
  /* `?print=1` (the "Print" action from the PO view) auto-invokes the
     browser print dialog once the A4 preview has finished paginating. */
  const autoPrintRequested = searchParams.get('print') === '1';
  const autoPrintDone = useRef(false);

  const [data, setData] = useState(null);
  const [pages, setPages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  /* Editable state (shallow clone of the loaded data). */
  const [editableData, setEditableData] = useState(null);
  const [design, setDesign] = useState(DEFAULT_PO_PRINT_DESIGN);
  const [isEditing, setIsEditing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [templates, setTemplates] = useState(() => poPrintTemplateStore.all());

  /* Measurement refs. */
  const emptySheetRef = useRef(null);
  const topRef = useRef(null);
  const runningRef = useRef(null);
  const tableHeadRef = useRef(null);
  const tbodyRef = useRef(null);
  const bottomRef = useRef(null);
  const footRef = useRef(null);
  const sheetRefs = useRef({});

  /* Scope print CSS. */
  useEffect(() => {
    document.body.classList.add('po-print-page');
    return () => document.body.classList.remove('po-print-page');
  }, []);

  /* Unsaved-changes guard when leaving the page. */
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  /* Load PO data. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setPages(null);
    try {
      const preview = await purchaseOrderService.printPreview(id);
      if (!cancelled) {
        setData(preview);
        setEditableData(JSON.parse(JSON.stringify(preview)));
        setDesign(normalizePrintDesign(preview.record.printDesign || DEFAULT_PO_PRINT_DESIGN));

        /* Auto-register the PO document in the repository */
        try {
          const poNo = preview.record?.poNo || id;
          await registerGeneratedDocument({
            docType: 'PO',
            sourceId: id,
            docNo: poNo,
            name: `Purchase Order — ${poNo}.pdf`,
            metadata: {
              poNo,
              prNo: preview.record?.prNo || preview.record?.reference || '',
              rfqNo: preview.record?.rfqNo || '',
              vendor: preview.record?.vendor || ''
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
    return () => { cancelled = true; };
  }, [id]);

  /* Measurement + pagination — with retry to handle DOM timing. */
  const collectMeasures = () => {
    const sheet = emptySheetRef.current;
    const inner = sheet?.querySelector('.po-sheet-inner');
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
      rowHeights: Array.from(tbodyRef.current?.querySelectorAll('tr:not(.po-empty-row)') || []).map((tr) => tr.offsetHeight)
    };
  };

  /* Paginate, but if rowHeights come back empty despite having items,
     retry once after a short delay (DOM may not have committed yet). */
  const paginateWithRetry = (measures) => {
    const itemCount = (editableData?.record?.items || []).length;
    const result = paginateRequisitionPrint(measures);
    const hasRows = result.some((p) => p.rows.length > 0);
    if (!hasRows && itemCount > 0 && measures.rowHeights.length === 0) {
      /* First measurement returned no row heights — retry once. */
      return { retry: true, result };
    }
    return { retry: false, result };
  };

  useEffect(() => {
    if (!editableData) return;
    let cancelled = false;
    const run = async () => {
      try { await (document.fonts?.ready ?? Promise.resolve()); } catch { /* ok */ }
      /* Double-RAF: first RAF waits for paint, second for layout. */
      requestAnimationFrame(() => {
        if (cancelled) return;
        requestAnimationFrame(() => {
          if (cancelled) return;
          try {
            const { result, retry } = paginateWithRetry(collectMeasures());
            setPages(result);
            if (retry && !cancelled) {
              /* Retry once after 200ms for DOM to fully commit. */
              setTimeout(() => {
                if (cancelled) return;
                requestAnimationFrame(() => {
                  if (cancelled) return;
                  try {
                    const measures = collectMeasures();
                    if (measures.rowHeights.length > 0) {
                      setPages(paginateRequisitionPrint(measures));
                    }
                  } catch { /* ignore */ }
                });
              }, 200);
            }
          } catch (err) {
            console.error('Failed to paginate PO preview', err);
            setPages([]);
          }
        });
      });
    };
    run();
    return () => { cancelled = true; };
  }, [editableData, design]);

  /* Auto-print when the document preview is ready and the caller asked
     for browser print (?print=1). Fires exactly once per load so the
     effect / re-pagination cannot open duplicate dialogs. */
  useEffect(() => {
    if (!autoPrintRequested || autoPrintDone.current) return;
    if (!editableData || pages === null) return;
    autoPrintDone.current = true;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [autoPrintRequested, editableData, pages]);

  /* Re-paginate on edit changes. */
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (!isEditing || !editableData) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      requestAnimationFrame(() => {
        if (cancelled) return;
        try { setPages(paginateRequisitionPrint(collectMeasures())); } catch { /* ignore */ }
      });
    });
    return () => { cancelled = true; };
  }, [isEditing, design, editableData?.record?.items, editableData?.record?.notes,
    editableData?.record?.termsAndConditions, editableData?.record?.discount,
    editableData?.record?.charges, editableData?.record?.vendorAddress,
    editableData?.record?.vendorCity, editableData?.record?.vendorState]);
  /* eslint-enable react-hooks/exhaustive-deps */

  /* ─── Edit handlers ─── */
  const handleCompanyChange = useCallback((field, value) => {
    setEditableData((prev) => prev ? { ...prev, company: { ...prev.company, [field]: value } } : prev);
    setHasUnsavedChanges(true);
  }, []);

  const handleRecordChange = useCallback((field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const record = { ...prev.record, [field]: value };
      record.totals = computeTotals(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleItemChange = useCallback((index, field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = [...(prev.record.items || [])];
      items[index] = { ...items[index], [field]: value };
      const record = { ...prev.record, items };
      record.totals = computeTotals(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleAddItem = useCallback(() => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = [...(prev.record.items || []), { product: '', hsn: '', uom: 'Nos', qty: 1, rate: 0, discount: 0, gstRate: 18 }];
      const record = { ...prev.record, items };
      record.totals = computeTotals(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleRemoveItem = useCallback((index) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = (prev.record.items || []).filter((_, i) => i !== index);
      const record = { ...prev.record, items };
      record.totals = computeTotals(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleDuplicateItem = useCallback((index) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = [...(prev.record.items || [])];
      const clone = { ...items[index] };
      items.splice(index + 1, 0, clone);
      const record = { ...prev.record, items };
      record.totals = computeTotals(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleMoveItem = useCallback((index, direction) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = [...(prev.record.items || [])];
      const target = index + direction;
      if (target < 0 || target >= items.length) return prev;
      [items[index], items[target]] = [items[target], items[index]];
      const record = { ...prev.record, items };
      record.totals = computeTotals(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleTopLevelChange = useCallback((field, value) => {
    setEditableData((prev) => prev ? { ...prev, [field]: value } : prev);
    setHasUnsavedChanges(true);
  }, []);

  const handleDesignChange = useCallback((patch) => {
    setDesign((prev) => ({ ...prev, ...patch }));
    setHasUnsavedChanges(true);
  }, []);

  /* ─── Template actions ─── */
  const handleSaveTemplate = useCallback((name) => {
    const template = poPrintTemplateStore.save({ name, design });
    if (template) {
      setDesign((prev) => ({ ...prev, printTemplateId: template.id }));
      setTemplates(poPrintTemplateStore.all());
      toast.success(`Template "${template.name}" saved`);
      return template;
    }
    toast.error('Enter a template name first');
    return null;
  }, [design, toast]);

  const handleApplyTemplate = useCallback((templateId) => {
    const applied = poPrintTemplateStore.apply(templateId, design);
    if (applied) {
      setDesign(applied);
      setHasUnsavedChanges(true);
      toast.success('Template applied');
    }
  }, [design, toast]);

  const handleDeleteTemplate = useCallback((templateId) => {
    poPrintTemplateStore.remove(templateId);
    setTemplates(poPrintTemplateStore.all());
    setDesign((prev) => (prev.printTemplateId === templateId ? { ...prev, printTemplateId: '' } : prev));
  }, []);

  const handleResetDesign = useCallback(() => {
    setDesign(DEFAULT_PO_PRINT_DESIGN);
    setHasUnsavedChanges(true);
  }, []);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (!editableData) return;
    setBusy(true);
    try {
      const record = editableData.record;
      const isRecordEditable = RECORD_EDITABLE_STATUSES.includes(record.status);

      /* Workflow-guarded record edits (Draft / Pending Approval only —
         the same guard the rest of the module enforces). */
      if (isRecordEditable) {
        await purchaseOrderService.updateOrder(id, {
          items: record.items,
          discount: record.discount,
          charges: record.charges,
          notes: record.notes,
          terms: record.terms,
          deliveryTerms: record.deliveryTerms,
          termsAndConditions: record.termsAndConditions,
          supplierCodeOfConduct: record.supplierCodeOfConduct,
          vendor: record.vendor,
          vendorAddress: record.vendorAddress,
          vendorCity: record.vendorCity,
          vendorState: record.vendorState,
          vendorGstin: record.vendorGstin,
          vendorPhone: record.vendorPhone,
          vendorEmail: record.vendorEmail,
          vendorContact: record.vendorContact,
          buyer: record.buyer,
          title: record.title,
          paymentTerms: record.paymentTerms,
          currency: record.currency
        });
      }

      /* Company branding edits → company profile (global, like Settings). */
      try {
        const current = await settingsService.getSettings();
        const currentCompany = current.company || {};
        await settingsService.updateSettings({
          company: { ...currentCompany, ...editableData.company }
        });
      } catch { /* best-effort */ }

      /* Print design (branding/signatures/visibility/supplier snapshot)
         persists on EVERY status without touching workflow data. */
      await purchaseOrderService.savePrintDesign(id, {
        ...design,
        supplier: {
          name: record.vendor || '',
          address: record.vendorAddress || '',
          city: record.vendorCity || '',
          state: record.vendorState || '',
          gstin: record.vendorGstin || '',
          phone: record.vendorPhone || '',
          email: record.vendorEmail || '',
          contact: record.vendorContact || ''
        }
      });

      setData(JSON.parse(JSON.stringify(editableData)));
      setIsEditing(false);
      setHasUnsavedChanges(false);
      toast.success(isRecordEditable ? 'PO updated' : `Print design saved${record.status ? ` — ${record.status}` : ''}`);
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }, [editableData, design, id, toast]);

  /* Discard changes and exit edit mode. */
  const handleDiscard = useCallback(() => {
    setEditableData(JSON.parse(JSON.stringify(data)));
    setDesign(normalizePrintDesign(data.record.printDesign || DEFAULT_PO_PRINT_DESIGN));
    setIsEditing(false);
    setPanelOpen(false);
    setHasUnsavedChanges(false);
    setShowUnsavedDialog(false);
    setPages(null);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        try { setPages(paginateRequisitionPrint(collectMeasures())); } catch { /* ignore */ }
      });
    });
  }, [data]);

  /* Open editor panel. */
  const handleOpenEditor = useCallback(() => {
    setPanelOpen(true);
    setIsEditing(true);
  }, []);

  /* Close panel — prompt if unsaved changes exist. */
  const handleClosePanel = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      setIsEditing(false);
      setPanelOpen(false);
      setPages(null);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try { setPages(paginateRequisitionPrint(collectMeasures())); } catch { /* ignore */ }
        });
      });
    }
  }, [hasUnsavedChanges]);

  const handleBack = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave anyway?')) {
      return;
    }
    navigate(`/purchase/orders/${id}`);
  }, [hasUnsavedChanges, navigate, id]);

  /* ─── PDF download ─── */
  const handleDownloadPdf = useCallback(async () => {
    if (!editableData || pages === null) return;
    setBusy(true);
    try {
      const sheetList = Object.keys(sheetRefs.current)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) => sheetRefs.current[key])
        .filter(Boolean);
      await exportSheetsAsPdf(sheetList, { filename: `purchase-order-${editableData.record.poNo}` });
      await purchaseOrderService.logPrintActivity(id);
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  }, [editableData, pages, id, toast]);

  /* ─── Render ─── */
  const pageClass = `po-print-page${isEditing ? ' po-print-page--editing' : ''}${panelOpen ? ' po-print-page--panel' : ''}`;

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
          <p className="text-sm font-bold text-slate-700">Purchase order not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button type="button" onClick={() => navigate('/purchase/orders')} className="po-btn po-btn-primary mt-4">
            Go to Purchase Orders
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const { record, company } = editableData;
  const allItemIndices = (record.items || []).map((_, index) => index);
  const isRecordEditable = RECORD_EDITABLE_STATUSES.includes(record.status);

  return (
    <PurchasePageLayout className={pageClass}>
      {/* Hidden measurement area. */}
      {pages === null && (
        <div className="po-measure" aria-hidden="true">
          <style>{PO_PRINT_STYLES}</style>
          <section className="po-sheet" ref={emptySheetRef}>
            <div className="po-sheet-inner" />
          </section>
          <div ref={topRef}>
            <PoPrintHeader company={company} record={record} design={design} />
          </div>
          <div ref={runningRef}>
            <PoRunningHeader company={company} record={record} pageNumber={2} totalPages={2} design={design} />
          </div>
          <div ref={tableHeadRef}>
            <PoItemsTable headOnly currency={record.currency} totals={record.totals || {}} />
          </div>
          <PoItemsTable
            items={record.items || []}
            indices={allItemIndices}
            currency={record.currency}
            totals={record.totals || {}}
            refs={{ tbody: tbodyRef }}
          />
          <div ref={bottomRef}>
            <PoDocumentBottom
              record={record}
              totals={record.totals || {}}
              currency={record.currency}
              design={design}
              editMode={false}
            />
          </div>
          <div ref={footRef}>
            {design.visibility.footer !== false && (
              <PoSheetFooter generatedAt={editableData.generatedAt} pageNumber={1} totalPages={1} />
            )}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: isEditing ? 'Edit' : 'Preview' }
        ]}
        icon={Printer}
        title={isEditing ? `Edit PO — ${record.poNo}` : `PO Preview — ${record.poNo}`}
        actions={
          <>
            <button type="button" onClick={handleBack} className="po-btn po-btn-secondary">
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>
            {isEditing ? (
              <>
                <button type="button" onClick={handleClosePanel} className="po-btn po-btn-secondary">
                  <XCircle className="po-btn-icon-ic" /> Close
                </button>
                {isEditing && (
                  <button
                    type="button"
                    onClick={() => setPanelOpen((open) => !open)}
                    className={`po-btn po-btn-secondary${panelOpen ? ' po-btn-active' : ''}`}
                    title="Toggle document editor sidebar"
                  >
                    <SlidersHorizontal className="po-btn-icon-ic" /> Design
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!hasUnsavedChanges || busy}
                  className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Save className="po-btn-icon-ic" />}
                  Save Changes
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={handleOpenEditor} className="po-btn po-btn-secondary">
                  <Pencil className="po-btn-icon-ic" /> Edit
                </button>
                <button type="button" onClick={() => window.print()} className="po-btn po-btn-secondary">
                  <Printer className="po-btn-icon-ic" /> Print
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

      {/* Design sidebar — screen only, hidden in print output */}
      {isEditing && (
        <PoPrintEditorPanel
          record={record}
          design={design}
          isRecordEditable={isRecordEditable}
          onRecordChange={handleRecordChange}
          onDesignChange={handleDesignChange}
          onItemChange={handleItemChange}
          onAddItem={handleAddItem}
          onRemoveItem={handleRemoveItem}
          onDuplicateItem={handleDuplicateItem}
          onMoveItem={handleMoveItem}
          templates={templates}
          onSaveTemplate={handleSaveTemplate}
          onApplyTemplate={handleApplyTemplate}
          onDeleteTemplate={handleDeleteTemplate}
          onResetDesign={handleResetDesign}
          onClose={handleClosePanel}
          onSave={handleSave}
          busy={busy}
          hasUnsavedChanges={hasUnsavedChanges}
        />
      )}

      {/* A4 sheet stack */}
      <div className="po-sheet-stack">
        {pages === null ? (
          <div className="po-sheet-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparing preview…
          </div>
        ) : (
          pages.map((page, index) => (
            <div className="po-sheet-card" key={index}>
              <PoPrintSheet
                page={page}
                pageNumber={index + 1}
                totalPages={pages.length}
                data={editableData}
                design={design}
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
                onDuplicateItem={handleDuplicateItem}
                onMoveItem={handleMoveItem}
                onTopLevelChange={handleTopLevelChange}
                onDesignChange={handleDesignChange}
              />
            </div>
          ))
        )}
      </div>
      {/* Unsaved Changes Dialog */}
      {showUnsavedDialog && (
        <div className="po-unsaved-overlay" onClick={() => setShowUnsavedDialog(false)}>
          <div className="po-unsaved-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Unsaved Changes</h3>
            <p>You have unsaved document changes.</p>
            <div className="po-unsaved-actions">
              <button type="button" className="po-btn po-btn-secondary" onClick={() => setShowUnsavedDialog(false)}>
                Cancel
              </button>
              <button type="button" className="po-btn po-btn-secondary" onClick={handleDiscard}>
                Discard Changes
              </button>
              <button type="button" className="po-btn po-btn-primary" onClick={async () => { await handleSave(); setShowUnsavedDialog(false); }} disabled={busy}>
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </PurchasePageLayout>
  );
}