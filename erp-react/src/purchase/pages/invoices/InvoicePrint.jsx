/**
 * purchase/pages/invoices/InvoicePrint.jsx
 * ------------------------------------------------------------------
 * Invoice print preview page — a full document EDITOR:
 *
 * Modes: Preview (default) · Edit (toolbar + design sidebar)
 * Toolbar: ← Back · Edit/Cancel · Design Sidebar · Save · Print ·
 *          Download PDF
 *
 * The visible A4 document IS the single source of truth: the exact
 * same DOM renders in preview, is edited inline, paginates, prints
 * and rasterises to PDF.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Pencil, Printer, Save, SlidersHorizontal, XCircle } from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import InvoicePrintEditorPanel from '../../components/InvoicePrintEditorPanel';
import { invoiceService } from '../../services/invoice';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { settingsService } from '../../services/settings';
import { getPrintCompany, getDefaultCurrency } from '../../services/settings';
import { DEFAULT_INVOICE_PRINT_DESIGN, normalizeInvoicePrintDesign, invoicePrintTemplateStore } from '../../services/invoicePrintDesign';
import { calcDocumentTotals, round2 } from '../../utils/purchase';
import { effectiveOutstanding } from '../../utils/adjustmentNotes';
import { exportSheetsAsPdf } from '../../utils/export';
import '../../styles/cpr-list.css';
import {
  INVOICE_PRINT_STYLES,
  InvDocumentBottom,
  InvItemsTable,
  InvPrintHeader,
  InvPrintSheet,
  InvSheetFooter
} from '../../components/PurchaseInvoicePrintDocument';

/* ─── Helpers ─── */

function computeInvoiceAmounts(record) {
  const items = Array.isArray(record.items) ? record.items : [];
  const discount = Number(record.discount) || 0;
  const charges = Number(record.charges) || 0;
  const totals = calcDocumentTotals(items, discount, charges, record.gstType || '');
  return totals;
}

const RECORD_EDITABLE_STATUSES = ['Draft', 'Submitted'];

export default function InvoicePrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  /* `?print=1` (the "Print" action from the Invoice view) auto-invokes
     the browser print dialog once the A4 preview has finished paginating. */
  const [searchParams] = useSearchParams();
  const autoPrintRequested = searchParams.get('print') === '1';
  const autoPrintDone = useRef(false);

  const [data, setData] = useState(null);
  const [pages, setPages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const [editableData, setEditableData] = useState(null);
  const [design, setDesign] = useState(DEFAULT_INVOICE_PRINT_DESIGN);
  const [isEditing, setIsEditing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [templates, setTemplates] = useState(() => invoicePrintTemplateStore.all());

  /* Measurement refs */
  const emptySheetRef = useRef(null);
  const topRef = useRef(null);
  const runningRef = useRef(null);
  const tableHeadRef = useRef(null);
  const tbodyRef = useRef(null);
  const bottomRef = useRef(null);
  const footRef = useRef(null);
  const sheetRefs = useRef({});

  useEffect(() => {
    document.body.classList.add('inv-print-page');
    return () => document.body.classList.remove('inv-print-page');
  }, []);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  /* Load invoice data */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setNotFound(false);
      setPages(null);
      try {
        const invData = await invoiceService.getInvoice(id);
        if (!invData) { if (!cancelled) setNotFound(true); return; }
        let orderData = null;
        if (invData.poNo) orderData = await purchaseOrderService.getOrder(invData.poNo).catch(() => null);
        if (cancelled) return;

        const company = getPrintCompany();
        const prepared = {
          record: invData,
          company,
          preparedBy: invData.uploadedBy || invData.vendor || '',
          checkedBy: invData.approvedBy || '',
          approvedBy: invData.approvedBy || '',
          generatedAt: new Date().toISOString()
        };
        setData(prepared);
        setEditableData(JSON.parse(JSON.stringify(prepared)));
        setDesign(normalizeInvoicePrintDesign(invData.printDesign || DEFAULT_INVOICE_PRINT_DESIGN));
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /* Measurement + pagination */
  const collectMeasures = () => {
    const sheet = emptySheetRef.current;
    const inner = sheet?.querySelector('.inv-sheet-inner');
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
      rowHeights: Array.from(tbodyRef.current?.querySelectorAll('tr:not(.inv-empty-row)') || []).map((tr) => tr.offsetHeight)
    };
  };

  useEffect(() => {
    if (!editableData) return;
    let cancelled = false;
    (async () => {
      try { await (document.fonts?.ready ?? Promise.resolve()); } catch { /* ok */ }
      requestAnimationFrame(() => {
        if (cancelled) return;
        try { setPages(paginateInvoicePrint(collectMeasures())); }
        catch (err) { console.error('Failed to paginate', err); setPages([]); }
      });
    })();
    return () => { cancelled = true; };
  }, [editableData, design]);

  /* Re-paginate on edit changes */
  useEffect(() => {
    if (!isEditing || !editableData) return;
    let cancelled = false;
    requestAnimationFrame(() => {
      if (cancelled) return;
      try { setPages(paginateInvoicePrint(collectMeasures())); } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [isEditing, design, editableData?.record?.items, editableData?.record?.notes,
    editableData?.record?.termsAndConditions, editableData?.record?.discount,
    editableData?.record?.charges]);

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

  /* ─── Edit handlers ─── */
  const handleCompanyChange = useCallback((field, value) => {
    setEditableData((prev) => prev ? { ...prev, company: { ...prev.company, [field]: value } } : prev);
    setHasUnsavedChanges(true);
  }, []);

  const handleRecordChange = useCallback((field, value) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const record = { ...prev.record, [field]: value };
      record.totals = computeInvoiceAmounts(record);
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
      record.totals = computeInvoiceAmounts(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleAddItem = useCallback(() => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = [...(prev.record.items || []), { product: '', hsn: '', uom: 'Nos', qty: 1, rate: 0, discount: 0, gstRate: 18 }];
      const record = { ...prev.record, items };
      record.totals = computeInvoiceAmounts(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleRemoveItem = useCallback((index) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = (prev.record.items || []).filter((_, i) => i !== index);
      const record = { ...prev.record, items };
      record.totals = computeInvoiceAmounts(record);
      return { ...prev, record };
    });
    setHasUnsavedChanges(true);
  }, []);

  const handleDuplicateItem = useCallback((index) => {
    setEditableData((prev) => {
      if (!prev) return prev;
      const items = [...(prev.record.items || [])];
      items.splice(index + 1, 0, { ...items[index] });
      const record = { ...prev.record, items };
      record.totals = computeInvoiceAmounts(record);
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
      record.totals = computeInvoiceAmounts(record);
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

  /* ─── Templates ─── */
  const handleSaveTemplate = useCallback((name) => {
    const template = invoicePrintTemplateStore.save({ name, design });
    if (template) {
      setDesign((prev) => ({ ...prev, printTemplateId: template.id }));
      setTemplates(invoicePrintTemplateStore.all());
      toast.success(`Template "${template.name}" saved`);
      return template;
    }
    toast.error('Enter a template name first');
    return null;
  }, [design, toast]);

  const handleApplyTemplate = useCallback((templateId) => {
    const applied = invoicePrintTemplateStore.apply(templateId, design);
    if (applied) { setDesign(applied); setHasUnsavedChanges(true); toast.success('Template applied'); }
  }, [design, toast]);

  const handleDeleteTemplate = useCallback((templateId) => {
    invoicePrintTemplateStore.remove(templateId);
    setTemplates(invoicePrintTemplateStore.all());
    setDesign((prev) => (prev.printTemplateId === templateId ? { ...prev, printTemplateId: '' } : prev));
  }, []);

  const handleResetDesign = useCallback(() => {
    setDesign(DEFAULT_INVOICE_PRINT_DESIGN);
    setHasUnsavedChanges(true);
  }, []);

  /* ─── Save ─── */
  const handleSave = useCallback(async () => {
    if (!editableData) return;
    setBusy(true);
    try {
      const record = editableData.record;
      const isEditable = RECORD_EDITABLE_STATUSES.includes(record.status);

      if (isEditable) {
        await invoiceService.updateInvoice(id, {
          items: record.items,
          discount: record.discount,
          charges: record.charges,
          freight: record.freight,
          notes: record.notes,
          termsAndConditions: record.termsAndConditions,
          vendor: record.vendor,
          vendorAddress: record.vendorAddress,
          vendorCity: record.vendorCity,
          vendorState: record.vendorState,
          vendorGstin: record.vendorGstin,
          vendorPhone: record.vendorPhone,
          vendorEmail: record.vendorEmail
        });
      }

      /* Save print design (branding/signatures/visibility) */
      await invoiceService.updateInvoice(id, {
        printDesign: {
          ...design,
          vendor: {
            name: record.vendor || '',
            address: record.vendorAddress || '',
            city: record.vendorCity || '',
            state: record.vendorState || '',
            gstin: record.vendorGstin || '',
            phone: record.vendorPhone || '',
            email: record.vendorEmail || ''
          }
        },
        _bypassStatusGuard: true
      });

      setData(JSON.parse(JSON.stringify(editableData)));
      setIsEditing(false);
      setHasUnsavedChanges(false);
      toast.success(isEditable ? 'Invoice updated' : `Print design saved`);
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setBusy(false);
    }
  }, [editableData, design, id, toast]);

  const handleToggleEdit = useCallback(() => {
    if (isEditing) {
      setEditableData(JSON.parse(JSON.stringify(data)));
      setDesign(normalizeInvoicePrintDesign(data.record.printDesign || DEFAULT_INVOICE_PRINT_DESIGN));
      setIsEditing(false);
      setPanelOpen(false);
      setHasUnsavedChanges(false);
      setPages(null);
      requestAnimationFrame(() => {
        try { setPages(paginateInvoicePrint(collectMeasures())); } catch { /* ignore */ }
      });
    } else {
      setPanelOpen(true);
      setIsEditing(true);
    }
  }, [isEditing, data]);

  const handleBack = useCallback(() => {
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave anyway?')) return;
    navigate(`/purchase/invoices/${id}`);
  }, [hasUnsavedChanges, navigate, id]);

  /* ─── PDF ─── */
  const handleDownloadPdf = useCallback(async () => {
    if (!editableData || pages === null) return;
    setBusy(true);
    try {
      const sheetList = Object.keys(sheetRefs.current).map(Number).sort((a, b) => a - b).map((k) => sheetRefs.current[k]).filter(Boolean);
      await exportSheetsAsPdf(sheetList, { filename: `invoice-${editableData.record.invoiceNo || id}` });
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  }, [editableData, pages, id, toast]);

  /* ─── Render ─── */
  const pageClass = `inv-print-page${isEditing ? ' inv-print-page--editing' : ''}${panelOpen ? ' inv-print-page--panel' : ''}`;

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
          <p className="text-sm font-bold text-slate-700">Invoice not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button type="button" onClick={() => navigate('/purchase/invoices')} className="po-btn po-btn-primary mt-4">
            Go to Invoices
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const { record, company, preparedBy, checkedBy, approvedBy, generatedAt } = editableData;
  const allItemIndices = (record.items || []).map((_, i) => i);
  const isRecordEditable = RECORD_EDITABLE_STATUSES.includes(record.status);

  return (
    <PurchasePageLayout className={pageClass}>
      {/* Hidden measurement area */}
      {pages === null && (
        <div className="inv-measure" aria-hidden="true">
          <style>{INVOICE_PRINT_STYLES}</style>
          <section className="inv-sheet" ref={emptySheetRef}>
            <div className="inv-sheet-inner" />
          </section>
          <div ref={topRef}>
            <InvPrintHeader company={company} record={record} design={design} />
          </div>
          <div ref={runningRef}>
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6pt', borderBottom: '1pt solid #ccc', fontSize: '8pt', color: '#666', fontWeight: 700 }}>
              <span>{company.name || ''} · Purchase Invoice · {record.invoiceNo || ''}</span>
              <span>Page 2 of 2</span>
            </div>
          </div>
          <div ref={tableHeadRef}>
            <InvItemsTable headOnly currency={record.currency || 'INR'} totals={record.totals || {}} />
          </div>
          <InvItemsTable items={record.items || []} indices={allItemIndices} currency={record.currency || 'INR'}
            totals={record.totals || {}} refs={{ tbody: tbodyRef }} />
          <div ref={bottomRef}>
            <InvDocumentBottom record={record} totals={record.totals || {}} currency={record.currency || 'INR'}
              preparedBy={preparedBy} checkedBy={checkedBy} approvedBy={approvedBy} design={design} />
          </div>
          <div ref={footRef}>
            {design.visibility.footer !== false && <InvSheetFooter generatedAt={generatedAt} pageNumber={1} totalPages={1} />}
          </div>
        </div>
      )}

      {/* Toolbar */}
      <PurchaseHeader
        variant="cpr"
        crumb={[{ label: 'Invoices', to: '/purchase/invoices' }, { label: isEditing ? 'Edit' : 'Preview' }]}
        icon={Printer}
        title={isEditing ? `Edit Invoice — ${record.invoiceNo}` : `Invoice Preview — ${record.invoiceNo}`}
        actions={
          <>
            <button type="button" onClick={handleBack} className="po-btn po-btn-secondary">
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>
            {isEditing ? (
              <>
                <button type="button" onClick={handleToggleEdit} className="po-btn po-btn-secondary">
                  <XCircle className="po-btn-icon-ic" /> Cancel
                </button>
                <button type="button" onClick={() => setPanelOpen((o) => !o)}
                  className={`po-btn po-btn-secondary${panelOpen ? ' po-btn-active' : ''}`}>
                  <SlidersHorizontal className="po-btn-icon-ic" /> Design
                </button>
                <button type="button" onClick={handleSave} disabled={!hasUnsavedChanges || busy}
                  className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Save className="po-btn-icon-ic" />}
                  Save Changes
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={handleToggleEdit} className="po-btn po-btn-secondary">
                  <Pencil className="po-btn-icon-ic" /> Edit
                </button>
                <button type="button" onClick={() => window.print()} className="po-btn po-btn-secondary">
                  <Printer className="po-btn-icon-ic" /> Print
                </button>
                <button type="button" onClick={handleDownloadPdf} disabled={busy || pages === null}
                  className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed">
                  {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Download className="po-btn-icon-ic" />}
                  Download PDF
                </button>
              </>
            )}
          </>
        }
      />

      {/* Design sidebar */}
      {isEditing && (
        <InvoicePrintEditorPanel
          record={record}
          design={design}
          isRecordEditable={isRecordEditable}
          onRecordChange={handleRecordChange}
          onDesignChange={handleDesignChange}
          onCompanyChange={handleCompanyChange}
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
        />
      )}

      {/* A4 sheet stack */}
      <div className="inv-sheet-stack">
        {pages === null ? (
          <div className="inv-sheet-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparing preview…
          </div>
        ) : (
          pages.map((page, index) => (
            <div className="inv-sheet-card" key={index}>
              <InvPrintSheet
                page={page}
                pageNumber={index + 1}
                totalPages={pages.length}
                data={editableData}
                design={design}
                sheetRef={(el) => { if (el) sheetRefs.current[index + 1] = el; else delete sheetRefs.current[index + 1]; }}
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
    </PurchasePageLayout>
  );
}

/* ─── Pagination (same logic as PO) ─── */
function paginateInvoicePrint({
  rowHeights = [], topHeight = 0, runningHeight = 0,
  tableHeadHeight = 0, bottomHeight = 0, contentHeight = 0
}) {
  const avail1 = Math.max(0, contentHeight - topHeight - tableHeadHeight);
  const availN = Math.max(0, contentHeight - runningHeight - tableHeadHeight);
  const pages = [];
  let page = { rows: [], used: 0, avail: avail1 };

  rowHeights.forEach((height, index) => {
    if (page.rows.length > 0 && page.used + height > page.avail) {
      pages.push(page);
      page = { rows: [], used: 0, avail: availN };
    }
    page.rows.push(index);
    page.used += height;
  });

  if (page.rows.length === 0 && pages.length === 0) pages.push(page);
  else if (page.rows.length > 0) pages.push(page);

  const last = pages[pages.length - 1];
  if (last && last.avail - last.used >= bottomHeight) last.bottom = true;
  else pages.push({ rows: [], used: 0, avail: availN, bottom: true });

  return pages;
}
