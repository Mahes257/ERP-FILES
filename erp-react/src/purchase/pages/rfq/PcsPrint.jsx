/**
 * purchase/pages/rfq/PcsPrint.jsx
 * ------------------------------------------------------------------
 * Price Comparative Statement print preview — uses the standardized
 * Purchase print system with measurement-driven pagination.
 *
 * Route: /purchase/rfq/price-comparative-statement/:rfqId/print
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
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
  PrintSummary,
  PrintSignatories,
  PrintFooter,
  PrintRunningHeader,
  usePrintPagination,
} from '../../components/print';


const VALID_QUOTE_STATUSES = ['Received', 'Accepted'];

export default function PcsPrint() {
  const navigate = useNavigate();
  const { rfqId } = useParams();
  const toast = useToast();
  const [comparison, setComparison] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const { pages, sheetRefs, measureRef, topRef, runningRef, tableHeadRef, tbodyRef, bottomRef, footRef } = usePrintPagination(comparison ? { comparison, evaluation } : null, (comparison?.rfq?.items || []).length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, evalData] = await Promise.all([
          rfqService.getQuotationComparison(rfqId),
          evaluationService.getEvaluation(rfqId).catch(() => null),
        ]);
        if (cancelled) return;
        if (!data) { setNotFound(true); return; }
        setComparison(data);
        setEvaluation(evalData);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [rfqId]);

  const rfq = comparison?.rfq;
  const validQuotes = (comparison?.quotes || []).filter((q) => VALID_QUOTE_STATUSES.includes(q.status));
  const currency = rfq?.currency || getDefaultCurrency();
  const company = getPrintCompany();

  /* ── Build item-wise comparison matrix ── */
  const rfqItems = rfq?.items || [];
  const itemMatrix = rfqItems.map((item, idx) => {
    const rows = validQuotes.map((quote) => {
      const line = quote.items?.[idx] || null;
      const unitPrice = line ? Number(line.rate) : NaN;
      const quoted = Boolean(line) && Number.isFinite(unitPrice) && unitPrice > 0;
      const qty = quoted ? Number(item.qty ?? line.qty) || 0 : 0;
      return {
        quoteId: quote.id,
        vendor: quote.vendor,
        unitPrice: quoted ? round2(unitPrice) : null,
        qty,
        lineTotal: quoted ? round2(unitPrice * qty) : null,
        quoted,
      };
    });
    const quotedRows = rows.filter((r) => r.quoted);
    const lowest = quotedRows.length
      ? quotedRows.reduce((best, r) => (r.unitPrice < best.unitPrice ? r : best))
      : null;
    return { item, idx, rows, lowest };
  });

  /* ── Vendor summary stats ── */
  const vendorStats = validQuotes.map((quote) => {
    const vendorTotal = itemMatrix.reduce((sum, e) => {
      const r = e.rows.find((c) => c.vendor === quote.vendor && c.quoted);
      return sum + (r?.lineTotal || 0);
    }, 0);
    const vendorItems = itemMatrix.filter((e) => e.rows.some((r) => r.vendor === quote.vendor && r.quoted)).length;
    return {
      quote,
      vendorTotal: round2(vendorTotal),
      vendorItems,
      delivery: quote.delivery,
      score: quote.score,
    };
  });

  /* ── Allocation summary ── */
  const selection = evaluation?.selection;
  const allocationList = selection?.allocations || [];
  const selectedValue = round2(allocationList.reduce((sum, a) => sum + (a.lineTotal || 0), 0));
  const supplierCount = new Set(allocationList.map((a) => a.vendor)).size;

  /* ── PDF export ── */
  const handleDownloadPdf = async () => {
    if (!comparison || pages === null) return;
    setBusy(true);
    try {
      const sheetList = sheetRefs.getAll();
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: `pcs-${rfq?.rfqNo || 'comparison'}` });
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  /* ── Loading / Not Found ── */
  if (!comparison && !loading && notFound) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <PurchaseHeader variant="cpr" crumb={[{ label: 'PCS', to: '/purchase/rfq/price-comparative-statement' }, { label: 'Not Found' }]} icon={Printer} title="PCS Preview"
          actions={<button type="button" onClick={() => navigate('/purchase/rfq/price-comparative-statement')} className="po-btn po-btn-secondary"><ChevronLeft className="po-btn-icon-ic" /> Back</button>}
        />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">PCS Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The requested PCS could not be found.</p>
        </div>
      </PurchasePageLayout>
    );
  }

  if (loading || !comparison) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading PCS Preview…
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Render helpers ── */
  const renderComparisonRow = (entry) => {
    return (
      <tr key={entry.idx}>
        <td style={{ textAlign: 'center', color: '#94a3b8', fontSize: '7.5px' }}>{entry.idx + 1}</td>
        <td style={{ fontSize: '7.5px' }}>{rfq?.reference || '—'}</td>
        <td style={{ fontSize: '7.5px' }}>{entry.item.hsn || entry.item.materialCode || '—'}</td>
        <td style={{ fontSize: '8px', fontWeight: 600 }}>
          {entry.item.product || `Item ${entry.idx + 1}`}
          {entry.item.specification && <span style={{ display: 'block', fontSize: '6.5px', color: '#94a3b8' }}>{entry.item.specification}</span>}
        </td>
        <td className="num" style={{ fontSize: '7.5px' }}>{entry.item.qty || 0}<span style={{ color: '#94a3b8', marginLeft: '1mm' }}>{entry.item.uom || ''}</span></td>
        {entry.rows.map((r) => {
          const isLowest = entry.lowest && r.quoted && r.quoteId === entry.lowest.quoteId;
          return [
            <td key={`rate-${r.quoteId}`} className="num" style={{ fontSize: '7.5px' }}>
              {r.quoted ? (
                <span style={{ fontWeight: isLowest ? 700 : 400, color: isLowest ? '#0B4A3D' : undefined }}>
                  {formatAmount(r.unitPrice, r.currency)}
                </span>
              ) : '—'}
            </td>,
            <td key={`total-${r.quoteId}`} className="num" style={{ fontSize: '7.5px' }}>
              {r.quoted ? formatAmount(r.lineTotal, r.currency) : '—'}
            </td>
          ];
        })}
      </tr>
    );
  };

  const renderTotalsRow = () => (
    /* The totals row is excluded from row-height measurement
       (usePrintPagination skips tr.pr-totals-row) so paginated row
       indices map exactly onto itemMatrix entries. It is rendered
       afresh at the foot of every paginated page. */
    <tr className="pr-totals-row" style={{ background: '#f8fafc' }}>
      <td colSpan={5} style={{ fontWeight: 700, fontSize: '8px', color: '#334155' }}>Vendor Totals</td>
      {validQuotes.flatMap((quote) => {
        const total = itemMatrix.reduce((sum, e) => {
          const r = e.rows.find((c) => c.vendor === quote.vendor && c.quoted);
          return sum + (r?.lineTotal || 0);
        }, 0);
        return [
          <td key={`rate-${quote.id}`} className="num" />,
          <td key={`total-${quote.id}`} className="num" style={{ fontWeight: 700, fontSize: '8px' }}>{formatAmount(total, quote.currency)}</td>,
        ];
      })}
    </tr>
  );

  /* ── Shared content blocks ── */
  const topContent = (
    <>
      <PrintDocumentHeader company={company} docTitle="Price Comparative Statement" docNumber={rfq?.rfqNo || '—'} status={rfq?.status} />
      <PrintInfoGrid
        left={[
          { label: 'RFQ Number', value: rfq?.rfqNo },
          { label: 'PR Reference', value: rfq?.reference || '—' },
          { label: 'Title', value: rfq?.title || '—' },
          { label: 'Department', value: rfq?.department || '—' },
          { label: 'Category', value: rfq?.category || '—' },
        ]}
        right={[
          { label: 'Quotations', value: `${validQuotes.length} received` },
          { label: 'Items', value: `${rfqItems.length} line items` },
          { label: 'Currency', value: currency },
          { label: 'Date', value: rfq?.createdAt ? formatDate(rfq.createdAt) : '—' },
          ...(allocationList.length > 0 ? [{ label: 'Selected Value', value: formatAmount(selectedValue, currency) }] : []),
        ]}
      />
    </>
  );

  const runningContent = (
    <PrintRunningHeader companyName={company.name} docTitle="Price Comparative Statement" docNumber={rfq?.rfqNo || '—'} pageNumber={2} totalPages={2} />
  );

  const bottomContent = (
    <>
      {/* Vendor Comparison Summary */}
      {vendorStats.length > 0 && (
        <PrintSection label="Vendor Comparison Summary">
          <table className="pr-items-table" style={{ fontSize: '8px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '25%' }}>Vendor</th>
                <th style={{ textAlign: 'center', width: '15%' }}>Items Quoted</th>
                <th style={{ textAlign: 'right', width: '20%' }}>Quoted Value</th>
                <th style={{ textAlign: 'right', width: '15%' }}>ETD</th>
                <th style={{ textAlign: 'center', width: '10%' }}>Score</th>
                <th style={{ textAlign: 'center', width: '15%' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {vendorStats.map(({ quote, vendorTotal, vendorItems, delivery, score }) => {
                const isSelected = allocationList.some((a) => a.vendor === quote.vendor);
                return (
                  <tr key={quote.id}>
                    <td style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? '#0B4A3D' : undefined }}>
                      {quote.vendor}
                      {isSelected && <span style={{ marginLeft: '1mm', fontSize: '6.5px', color: '#0B4A3D' }}>★</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{vendorItems}/{rfqItems.length}</td>
                    <td className="num">{formatAmount(vendorTotal, quote.currency)}</td>
                    <td className="num">{delivery ? `${delivery} Days` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>{score != null ? `${score}/100` : '—'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', padding: '1mm 3mm', borderRadius: '10mm',
                        fontSize: '6.5px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                        background: isSelected ? '#f0fdf4' : '#f3f4f6',
                        color: isSelected ? '#16a34a' : '#6b7280',
                      }}>{isSelected ? 'Selected' : 'Quoted'}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </PrintSection>
      )}

      {/* Recommended Decision */}
      {allocationList.length > 0 && (
        <div style={{ paddingTop: '5mm' }}>
          <PrintSummary
            rows={[
              ...Object.entries(
                allocationList.reduce((byVendor, a) => {
                  if (!byVendor[a.vendor]) byVendor[a.vendor] = 0;
                  byVendor[a.vendor] += a.lineTotal || 0;
                  return byVendor;
                }, {})
              ).map(([vendor, total]) => ({ label: vendor, value: formatAmount(round2(total), currency) })),
              { label: 'Items Allocated', value: String(allocationList.length) },
              { label: 'Vendors Selected', value: String(supplierCount) },
            ]}
            grandLabel="Recommended Award"
            grandValue={formatAmount(selectedValue, currency)}
          />
        </div>
      )}

      {/* Signatures */}
      <div className="pr-sign" style={{ paddingTop: '6mm' }}>
        <PrintSignatories
          signatories={[
            ['Prepared By', rfq?.requester || '—'],
            ['Approved By', rfq?.buyer || '—'],
          ]}
        />
      </div>
    </>
  );

  /* ── Comparison table header (for measurement and rendering) ── */
  const renderTableHead = () => (
    <thead>
      <tr>
        <th style={{ width: '4%', textAlign: 'center' }}>#</th>
        <th style={{ width: '8%' }}>PR No</th>
        <th style={{ width: '8%' }}>Material Code</th>
        <th style={{ width: '18%' }}>Item Description</th>
        <th style={{ width: '6%', textAlign: 'right' }}>Qty</th>
        {validQuotes.map((quote) => (
          <th key={quote.id} colSpan={2} style={{ textAlign: 'center', borderBottom: 'none', background: '#0B4A3D' }}>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ fontSize: '6.5px', opacity: 0.7 }}>Q{validQuotes.indexOf(quote)}</div>
              <div style={{ fontSize: '7px', fontWeight: 700 }}>{quote.vendor}</div>
            </div>
          </th>
        ))}
      </tr>
      <tr>
        {validQuotes.flatMap((quote) => [
          <th key={`sub-rate-${quote.id}`} style={{ fontSize: '6px', textAlign: 'center', padding: '1mm', background: '#f8fafc' }}>Rate</th>,
          <th key={`sub-total-${quote.id}`} style={{ fontSize: '6px', textAlign: 'center', padding: '1mm', background: '#f8fafc' }}>Total</th>,
        ])}
      </tr>
    </thead>
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
            <PrintSection label="Item-wise Quotation Comparison">
              <div style={{ overflow: 'hidden' }}>
                <table className="pr-items-table" style={{ fontSize: '8px', tableLayout: 'fixed' }}>
                  {renderTableHead()}
                </table>
              </div>
            </PrintSection>
          </div>
          <PrintSection label="Item-wise Quotation Comparison">
            <div style={{ overflow: 'hidden' }}>
              <table className="pr-items-table" style={{ fontSize: '8px', tableLayout: 'fixed' }}>
                {renderTableHead()}
                <tbody ref={tbodyRef}>
                  {itemMatrix.map(renderComparisonRow)}
                  {renderTotalsRow()}
                </tbody>
              </table>
            </div>
          </PrintSection>
          <div ref={bottomRef}>{bottomContent}</div>
          <div ref={footRef}>
            <PrintFooter generatedAt={rfq?.createdAt} pageNumber={1} totalPages={1} docNumber={rfq?.rfqNo} />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[{ label: 'PCS', to: '/purchase/rfq/price-comparative-statement' }, { label: rfq?.rfqNo || 'Preview' }]}
        icon={Printer}
        title="PCS Preview"
        actions={
          <>
            <button type="button" onClick={() => navigate(`/purchase/rfq/price-comparative-statement/${rfqId}`)} className="po-btn po-btn-secondary">
              <ChevronLeft className="po-btn-icon-ic" /> Back
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

      {/* ── Render phase ── */}
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
                    <PrintRunningHeader companyName={company.name} docTitle="Price Comparative Statement" docNumber={rfq?.rfqNo || '—'} pageNumber={index + 1} totalPages={pages.length} />
                  )}
                  {page.rows.length > 0 && (
                    <PrintSection label="Item-wise Quotation Comparison">
                      <div style={{ overflow: 'hidden' }}>
                        <table className="pr-items-table" style={{ fontSize: '8px', tableLayout: 'fixed' }}>
                          {renderTableHead()}
                          <tbody>
                            {page.rows.map((i) => renderComparisonRow(itemMatrix[i]))}
                            {renderTotalsRow()}
                          </tbody>
                        </table>
                      </div>
                    </PrintSection>
                  )}
                  {page.bottom && bottomContent}
                </div>
                <PrintFooter generatedAt={rfq?.createdAt} pageNumber={index + 1} totalPages={pages.length} docNumber={rfq?.rfqNo} />
              </section>
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}
