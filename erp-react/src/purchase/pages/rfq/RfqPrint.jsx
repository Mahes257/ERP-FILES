/**
 * purchase/pages/rfq/RfqPrint.jsx
 * ------------------------------------------------------------------
 * RFQ print preview page.
 *
 *   Toolbar  : ← Back · RFQ Preview · Edit · Print · Download PDF
 *   Document : ONE reusable A4 template (RfqPrintDocument). Line items
 *              are split across pages by measuring the real rendered
 *              heights — the table header repeats on every page and no
 *              row is ever cut in half.
 *   Print    : window.print() with app chrome hidden (@media print).
 *   PDF      : the exact same `.pr-sheet` DOM nodes are rasterised and
 *              written into an A4 portrait PDF (utils/export.js).
 *   Edit     : opens /purchase/rfq/:id/edit; after saving, the form
 *              returns here and the preview reloads fresh data.
 *
 * The RFQ is loaded with rfqService.getRfq — the same service the RFQ
 * detail page uses — resolving by internal id OR RFQ number
 * (RFQ-2026-0007), so the print URL works in both forms.
 * ------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Pencil, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import { rfqService } from '../../services/rfq';
import { exportSheetsAsPdf } from '../../utils/export';
import { registerGeneratedDocument } from '../../services/documentRegistration';
import { getDefaultCurrency } from '../../services/settings';
import { round2 } from '../../utils/purchase';
import '../../styles/cpr-list.css';
import {
  RFQ_PRINT_SHEET_STYLES,
  RfqDocumentBottom,
  RfqItemsTable,
  RfqPrintHeader,
  RfqPrintSheet,
  RfqRunningHeader,
  RfqSheetFooter
} from '../../components/RfqPrintDocument';
import { paginateRfqPrint } from '../../utils/printPagination';

/* ------------------------------------------------------------------ */
/*  Company profile (letterhead)                                       */
/* ------------------------------------------------------------------ */

const COMPANY = {
  name: 'VISHAK TECH',
  address: '123 Industrial Area, Bengaluru 560001',
  gstin: '29AABCT1234F',
  phone: '+91 80 4567 8900',
  email: 'info@vishaktech.com'
};

/* ------------------------------------------------------------------ */
/*  Field normalisation — one consistent RFQ shape for the preview,    */
/*  with defensive fallbacks so no field can crash on missing data.    */
/* ------------------------------------------------------------------ */

function normalizeRFQ(record = {}) {
  const items = (Array.isArray(record.items) ? record.items : []).map((item) => ({
    ...item,
    qty: Number(item.qty) || 0,
    rate: Number(item.rate ?? item.expectedRate) || 0
  }));
  const commercialTerms = record.commercialTerms || {};
  const taxRate = Number(commercialTerms.taxRate) || 0;
  const subtotal = round2(items.reduce((sum, item) => sum + (item.qty || 0) * (item.rate || 0), 0));
  const tax = round2(subtotal * (taxRate / 100));
  const otherCharges = round2(Number(record.otherCharges ?? record.charges) || 0);
  const grandTotal = round2(subtotal + tax + otherCharges);
  const vendors = Array.isArray(record.vendors) ? record.vendors : [];
  return {
    ...record,
    id: record.id,
    rfqNumber: record.rfqNo,
    title: record.title || record.name || record.rfqTitle || '—',
    referencePR: record.prNo || record.reference || '—',
    department: record.department || record.departmentName || '—',
    project: record.project || record.projectName || '—',
    category: record.category || '—',
    requester: record.requester || record.requestedBy || '—',
    buyer: record.buyer || record.buyerName || '—',
    priority: record.priority || '—',
    status: record.status || '—',
    createdDate: record.createdAt || '',
    dueDate: record.dueDate || record.quotationDueDate || '',
    validity: record.validity ?? null,
    currency: record.currency || getDefaultCurrency(),
    incoterm: record.incoterm || '—',
    sentDate: record.sentAt || '',
    vendors,
    items,
    commercialTerms,
    description: record.description || record.scope || record.details || '',
    notes: record.notes || '',
    totals: { subtotal, tax, taxRate, otherCharges, grandTotal }
  };
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function RfqPrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const [data, setData] = useState(null);
  const [pages, setPages] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const emptySheetRef = useRef(null);
  const topRef = useRef(null);
  const runningRef = useRef(null);
  const tableHeadRef = useRef(null);
  const tbodyRef = useRef(null);
  const bottomRef = useRef(null);
  const footRef = useRef(null);
  const sheetRefs = useRef({});

  useEffect(() => {
    document.body.classList.add('pr-print-page');
    return () => document.body.classList.remove('pr-print-page');
  }, []);

  /* Load the RFQ from the URL id — same service as the detail page.
     Falls back to an RFQ-number lookup when the id is not an internal
     id, so both /purchase/rfq/RFQ-0007/print and
     /purchase/rfq/RFQ-2026-0007/print resolve the same record. */
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      setPages(null);
      setData(null);
      try {
        const rfq = await rfqService.getRfq(id);
        if (cancelled) return;
        const record = normalizeRFQ(rfq);
        setData({
          record,
          company: COMPANY,
          preparedBy: rfq.requester || rfq.buyer || '—',
          approvedBy: rfq.buyer || rfq.requester || '—',
          generatedAt: new Date().toISOString()
        });

        /* Auto-register the RFQ document in the repository */
        try {
          const rfqNo = rfq.rfqNo || id;
          await registerGeneratedDocument({
            docType: 'RFQ',
            sourceId: id,
            docNo: rfqNo,
            name: `Request for Quotation — ${rfqNo}.pdf`,
            metadata: {
              rfqNo,
              prNo: rfq.prNo || rfq.reference || '',
              vendor: (rfq.vendors || []).join(', ')
            }
          });
        } catch { /* Best-effort */ }
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

  const collectMeasures = () => {
    const sheet = emptySheetRef.current;
    const inner = sheet?.querySelector('.pr-sheet-inner');
    const innerStyle = inner ? getComputedStyle(inner) : null;
    const SAFETY_BUFFER = 14;
    const contentHeight =
      (sheet?.clientHeight || 0) -
      (innerStyle ? parseFloat(innerStyle.paddingTop) + parseFloat(innerStyle.paddingBottom) : 0) -
      (footRef.current?.offsetHeight || 0) -
      SAFETY_BUFFER;
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
    if (!data) return;
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
          setPages(paginateRfqPrint(collectMeasures()));
        } catch {
          setPages([]);
        }
      });
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [data]);

  const handleDownloadPdf = async () => {
    if (!data || pages === null) return;
    setBusy(true);
    try {
      const sheetList = Object.keys(sheetRefs.current)
        .map(Number)
        .sort((a, b) => a - b)
        .map((key) => sheetRefs.current[key])
        .filter(Boolean);
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: `rfq-${data.record.rfqNo}` });
        await rfqService.logPrintActivity(data.record.id);
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading RFQ Preview...
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !data) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">RFQ Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The requested RFQ could not be found.</p>
          <div className="mt-4 inline-flex gap-2">
            <button type="button" onClick={() => navigate(`/purchase/rfq/${id}`)} className="po-btn po-btn-secondary">
              <ChevronLeft className="po-btn-icon-ic" /> Back to RFQ
            </button>
            <button type="button" onClick={() => navigate('/purchase/rfq')} className="po-btn po-btn-primary">
              Back to RFQ List
            </button>
          </div>
        </div>
      </PurchasePageLayout>
    );
  }

  const { record } = data;
  const allItemIndices = (record.items || []).map((_, index) => index);

  return (
    <PurchasePageLayout className="pr-print-page">
      {pages === null && (
        <div className="pr-measure" aria-hidden="true">
          <style>{RFQ_PRINT_SHEET_STYLES}</style>
          <section className="pr-sheet" ref={emptySheetRef}>
            <div className="pr-sheet-inner" />
          </section>
          <div ref={topRef}>
            <RfqPrintHeader company={data.company} record={record} />
          </div>
          <div ref={runningRef}>
            <RfqRunningHeader company={data.company} record={record} pageNumber={2} totalPages={2} />
          </div>
          <div ref={tableHeadRef}>
            <RfqItemsTable headOnly currency={record.currency} />
          </div>
          <RfqItemsTable
            items={record.items || []}
            indices={allItemIndices}
            currency={record.currency}
            refs={{ tbody: tbodyRef }}
          />
          <div ref={bottomRef}>
            <RfqDocumentBottom
              record={record}
              currency={record.currency}
              preparedBy={data.preparedBy}
              approvedBy={data.approvedBy}
            />
          </div>
          <div ref={footRef}>
            <RfqSheetFooter generatedAt={data.generatedAt} pageNumber={1} totalPages={1} />
          </div>
        </div>
      )}

      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'RFQ & Quotations', to: '/purchase/rfq' },
          { label: 'Preview' }
        ]}
        icon={Printer}
        title="RFQ Preview"
        actions={
          <>
            <button
              type="button"
              onClick={() => navigate(`/purchase/rfq/${record.id}`)}
              className="po-btn po-btn-secondary"
            >
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>
            <button
              type="button"
              onClick={() => navigate(`/purchase/rfq/${record.id}/edit`, { state: { from: 'print' } })}
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
              disabled={busy || pages === null}
              className="po-btn po-btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Download className="po-btn-icon-ic" />}
              Download PDF
            </button>
          </>
        }
      />

      <div className="pr-sheet-stack">
        {pages === null ? (
          <div className="pr-sheet-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparing preview…
          </div>
        ) : (
          pages.map((page, index) => (
            <div className="pr-sheet-card" key={index}>
              <RfqPrintSheet
                page={page}
                pageNumber={index + 1}
                totalPages={pages.length}
                data={data}
                sheetRef={(el) => {
                  if (el) sheetRefs.current[index + 1] = el;
                  else delete sheetRefs.current[index + 1];
                }}
              />
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}