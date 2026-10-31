/**
 * purchase/pages/rfq/QuotationPrint.jsx
 * ------------------------------------------------------------------
 * Quotation print preview — uses the standardized Purchase print system
 * with measurement-driven pagination for long documents.
 *
 * Route: /purchase/rfq/quotations/:id/print
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Pencil, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import { rfqService } from '../../services/rfq';
import { getDefaultCurrency, getPrintCompany } from '../../services/settings';
import { formatAmount, round2 } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import { exportSheetsAsPdf } from '../../utils/export';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import {
  PRINT_SHARED_STYLES,
  PrintDocumentHeader,
  PrintInfoGrid,
  PrintSection,
  PrintTable,
  PrintSummary,
  PrintNotes,
  PrintSignatories,
  PrintFooter,
  PrintRunningHeader,
  usePrintPagination,
} from '../../components/print';


export default function QuotationPrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const [quotation, setQuotation] = useState(null);
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const { pages, sheetRefs, measureRef, topRef, runningRef, tableHeadRef, tbodyRef, bottomRef, footRef } = usePrintPagination(quotation && rfq ? { quotation, rfq } : null, (quotation?.items || []).length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const quotes = await rfqService.getQuotations({ page: 1, pageSize: 500 });
        const q = (quotes.data || []).find((q) => q.id === id || q.quotationNo === id);
        if (!q) { if (!cancelled) setNotFound(true); return; }
        const rfqData = await rfqService.getRfq(q.rfqNo).catch(() => null);
        if (cancelled) return;
        setQuotation(q);
        setRfq(rfqData);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Build row data from quotation items ── */
  const q = quotation;
  const items = q?.items || [];
  const currency = q?.currency || getDefaultCurrency();
  const company = getPrintCompany();
  const subtotal = round2(items.reduce((sum, item) => sum + (Number(item.qty) || 0) * (Number(item.rate) || 0), 0));
  const discountPct = Number(q?.discount) || 0;
  const discountAmt = round2(subtotal * (discountPct / 100));
  const taxable = round2(subtotal - discountAmt);
  const gstRate = Number(rfq?.commercialTerms?.taxRate) || 18;
  const gst = round2(taxable * (gstRate / 100));
  const freight = Number(q?.freight) || 0;
  const insurance = Number(q?.insurance) || 0;
  const charges = Number(q?.charges) || 0;
  const grandTotal = round2(taxable + gst + freight + insurance + charges);

  const rows = items.map((item, i) => ({
    ...item,
    key: item.product || i,
    sNo: i + 1,
  }));

  const itemColumns = [
    { key: 'sNo', label: '#', width: '4%' },
    { key: 'product', label: 'Item Description', width: '38%', render: (row) => (
      <><span className="desc">{row.product || '—'}</span>{row.hsn && <span style={{ display: 'block', fontSize: '7px', color: '#94a3b8' }}>HSN: {row.hsn}</span>}</>
    )},
    { key: 'uom', label: 'UOM', width: '8%' },
    { key: 'qty', label: 'Qty', width: '8%', align: 'right' },
    { key: 'rate', label: 'Unit Price', width: '12%', align: 'right', render: (row) => formatAmount(row.rate, currency) },
    { key: 'amount', label: 'Amount', width: '14%', align: 'right', render: (row) => formatAmount((Number(row.qty) || 0) * (Number(row.rate) || 0), currency) },
  ];

  /* ── PDF export ── */
  const handleDownloadPdf = async () => {
    if (!q || pages === null) return;
    setBusy(true);
    try {
      const sheetList = sheetRefs.getAll();
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: `quotation-${q.quotationNo || q.id}` });
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  /* ── Loading / Not Found ── */
  if (!q && !loading && notFound) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <PurchaseHeader variant="cpr" crumb={[{ label: 'Quotations', to: '/purchase/rfq/quotations' }, { label: 'Not Found' }]} icon={Printer} title="Quotation Preview"
          actions={<button type="button" onClick={() => navigate('/purchase/rfq/quotations')} className="po-btn po-btn-secondary"><ChevronLeft className="po-btn-icon-ic" /> Back</button>}
        />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Quotation Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The requested quotation could not be found.</p>
        </div>
      </PurchasePageLayout>
    );
  }

  if (loading || !q) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading Quotation Preview…
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Shared content blocks ── */
  const topContent = (
    <>
      <PrintDocumentHeader company={company} docTitle="Vendor Quotation" docNumber={q.quotationNo || q.id} status={q.status} />
      <PrintInfoGrid
        left={[
          { label: 'RFQ Reference', value: q.rfqNo },
          { label: 'PR Reference', value: q.prNo || rfq?.prNo || '—' },
          { label: 'Vendor', value: q.vendor },
          { label: 'Submitted On', value: q.submittedOn ? formatDate(q.submittedOn) : '—' },
          { label: 'Currency', value: currency },
        ]}
        right={[
          { label: 'Valid Until', value: q.validUntil ? formatDate(q.validUntil) : '—' },
          { label: 'Payment Terms', value: q.paymentTerms || '—' },
          { label: 'Delivery', value: q.delivery ? `${q.delivery} Days` : '—' },
          { label: 'Warranty', value: q.warranty || '—' },
          { label: 'Lead Time', value: q.leadTime ? `${q.leadTime} Days` : '—' },
        ]}
      />
    </>
  );

  const runningContent = (
    <PrintRunningHeader companyName={company.name} docTitle="Vendor Quotation" docNumber={q.quotationNo || q.id} pageNumber={2} totalPages={2} />
  );

  const bottomContent = (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6mm 10mm', paddingTop: '6mm' }}>
      <div>
        <PrintNotes text={q.notes || q.remarks || ''} label="Vendor Remarks" />
      </div>
      <div>
        <PrintSummary
          rows={[
            { label: 'Subtotal', value: formatAmount(subtotal, currency) },
            ...(discountPct > 0 ? [{ label: `Discount (${discountPct}%)`, value: `-${formatAmount(discountAmt, currency)}` }] : []),
            { label: `GST (${gstRate}%)`, value: formatAmount(gst, currency) },
            ...(freight > 0 ? [{ label: 'Freight', value: formatAmount(freight, currency) }] : []),
            ...(insurance > 0 ? [{ label: 'Insurance', value: formatAmount(insurance, currency) }] : []),
            ...(charges > 0 ? [{ label: 'Other Charges', value: formatAmount(charges, currency) }] : []),
          ]}
          grandLabel="Grand Total"
          grandValue={formatAmount(grandTotal, currency)}
        />
      </div>
      <div className="pr-sign" style={{ gridColumn: '1 / -1' }}>
        <PrintSignatories signatories={[['Prepared By', q.vendor], ['Received By', q.uploadedBy || '—']]} />
      </div>
    </div>
  );

  return (
    <PurchasePageLayout className="pr-print-page">
      {/* ── Measurement phase ── */}
      {pages === null && (
        <div className="pr-measure" ref={measureRef} aria-hidden="true">
          <style>{PRINT_SHARED_STYLES}</style>
          <section className="pr-sheet"><div className="pr-sheet-inner" /></section>
          <div ref={topRef}>{topContent}</div>
          <div ref={runningRef}>{runningContent}</div>
          <div ref={tableHeadRef}>
            <PrintSection label="Quoted Items">
              <PrintTable columns={itemColumns} rows={[]} />
            </PrintSection>
          </div>
          <PrintSection label="Quoted Items">
            <PrintTable columns={itemColumns} rows={rows} refs={{ tbody: tbodyRef }} />
          </PrintSection>
          <div ref={bottomRef}>{bottomContent}</div>
          <div ref={footRef}>
            <PrintFooter generatedAt={q.createdAt || q.submittedAt} pageNumber={1} totalPages={1} docNumber={q.quotationNo} />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[{ label: 'Quotations', to: '/purchase/rfq/quotations' }, { label: q.quotationNo || 'Preview' }]}
        icon={Printer}
        title="Quotation Preview"
        actions={
          <>
            <button type="button" onClick={() => navigate(`/purchase/rfq/quotations/${q.id}`)} className="po-btn po-btn-secondary">
              <ChevronLeft className="po-btn-icon-ic" /> Back
            </button>
            <button type="button" onClick={() => navigate(`/purchase/rfq/quotations/${q.id}/edit`)} className="po-btn po-btn-secondary">
              <Pencil className="po-btn-icon-ic" /> Edit
            </button>
            <button type="button" onClick={() => window.print()} className="po-btn po-btn-secondary">
              <Printer className="po-btn-icon-ic" /> Print
            </button>
            <button type="button" onClick={handleDownloadPdf} disabled={busy || pages === null} className="po-btn po-btn-primary disabled:opacity-60">
              {busy ? <Loader2 className="po-btn-icon-ic animate-spin" /> : <Download className="po-btn-icon-ic" />}
              Download PDF
            </button>
          </>
        }
      />

      {/* ── Render phase: one sheet per page ── */}
      <div className="pr-sheet-stack">
        {pages === null ? (
          <div className="pr-sheet-loading">
            <Loader2 className="w-4 h-4 animate-spin" /> Preparing preview…
          </div>
        ) : (
          pages.map((page, index) => (
            <div className="pr-sheet-card" key={index}>
              <section className="pr-sheet"
                ref={(el) => sheetRefs.register(el, index + 1)}
              >
                <style>{PRINT_SHARED_STYLES}</style>
                <div className="pr-sheet-inner">
                  {index === 0 ? topContent : (
                    <PrintRunningHeader companyName={company.name} docTitle="Vendor Quotation" docNumber={q.quotationNo || q.id} pageNumber={index + 1} totalPages={pages.length} />
                  )}
                  {page.rows.length > 0 && (
                    <PrintSection label="Quoted Items">
                      <PrintTable columns={itemColumns} rows={page.rows.map((i) => rows[i])} />
                    </PrintSection>
                  )}
                  {page.bottom && bottomContent}
                </div>
                <PrintFooter generatedAt={q.createdAt || q.submittedAt} pageNumber={index + 1} totalPages={pages.length} docNumber={q.quotationNo} />
              </section>
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}
