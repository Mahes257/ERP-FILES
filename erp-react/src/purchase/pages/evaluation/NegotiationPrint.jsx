/**
 * purchase/pages/evaluation/NegotiationPrint.jsx
 * ------------------------------------------------------------------
 * Negotiation print preview — uses the standardized Purchase print system
 * with measurement-driven pagination for long documents.
 *
 * Route: /purchase/rfq/negotiation/:rfqId/:vendorId/print
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
import { getDefaultCurrency, getPrintCompany } from '../../services/settings';
import { formatAmount } from '../../utils/purchase';
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
  PrintSignatories,
  PrintFooter,
  PrintRunningHeader,
  usePrintPagination,
} from '../../components/print';


export default function NegotiationPrint() {
  const navigate = useNavigate();
  const { rfqId, vendorId } = useParams();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const { pages, sheetRefs, measureRef, topRef, runningRef, tableHeadRef, tbodyRef, bottomRef, footRef } = usePrintPagination(data, (data?.rfq?.items || []).length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rfq, board] = await Promise.all([
          rfqService.getRfq(rfqId),
          evaluationService.getEvaluation(rfqId),
        ]);
        if (!cancelled) {
          setData({ rfq, board });
          setLoading(false);
        }
      } catch {
        if (!cancelled) { setNotFound(true); setLoading(false); }
      }
    })();
    return () => { cancelled = true; };
  }, [rfqId]);

  const { rfq, board } = data || {};
  const vendor = board?.vendors?.find((v) => v.vendorId === vendorId || v.vendor === vendorId);
  const vendorName = vendor?.vendor || '—';
  const currency = rfq?.currency || getDefaultCurrency();
  const rounds = vendor?.rounds || [];
  const items = rfq?.items || [];
  const company = getPrintCompany();

  const rows = items.map((item, i) => {
    const quoteItem = vendor?.rounds?.[0]?.itemRates?.[i];
    return {
      key: item.product || i,
      sNo: i + 1,
      product: item.product || '—',
      originalRate: Number(item.rate) || 0,
      negotiatedRate: quoteItem != null ? Number(quoteItem) : Number(item.rate) || 0,
      qty: Number(item.qty) || 0,
    };
  });

  const itemColumns = [
    { key: 'sNo', label: '#', width: '4%' },
    { key: 'product', label: 'Item', width: '35%' },
    { key: 'originalRate', label: 'Original Rate', width: '15%', align: 'right', render: (row) => formatAmount(row.originalRate, currency) },
    { key: 'negotiatedRate', label: 'Negotiated Rate', width: '15%', align: 'right', render: (row) => formatAmount(row.negotiatedRate, currency) },
    { key: 'qty', label: 'Qty', width: '8%', align: 'right' },
    { key: 'savings', label: 'Savings', width: '15%', align: 'right', render: (row) => {
      const saving = (row.originalRate - row.negotiatedRate) * (Number(row.qty) || 0);
      return <span style={{ color: saving > 0 ? '#16a34a' : saving < 0 ? '#dc2626' : '#64748b' }}>{formatAmount(Math.abs(saving), currency)}</span>;
    }},
  ];

  /* ── PDF export ── */
  const handleDownloadPdf = async () => {
    if (!data || pages === null) return;
    setBusy(true);
    try {
      const sheetList = sheetRefs.getAll();
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: `negotiation-${rfq.rfqNo}-${vendorName}` });
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  /* ── Loading / Not Found ── */
  if (notFound) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <PurchaseHeader variant="cpr" crumb={[{ label: 'Negotiation', to: '/purchase/rfq/negotiation' }, { label: 'Not Found' }]} icon={Printer} title="Negotiation Summary"
          actions={<button type="button" onClick={() => navigate('/purchase/rfq/negotiation')} className="po-btn po-btn-secondary"><ChevronLeft className="po-btn-icon-ic" /> Back</button>}
        />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Negotiation Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The requested negotiation could not be found.</p>
        </div>
      </PurchasePageLayout>
    );
  }

  if (loading || !data) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading Negotiation Preview…
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Shared content blocks ── */
  const topContent = (
    <>
      <PrintDocumentHeader company={company} docTitle="Negotiation Summary" docNumber={rfq.rfqNo} status={board?.steps?.negotiationAgreed ? 'Agreed' : 'In Progress'} />
      <PrintInfoGrid
        left={[
          { label: 'RFQ Number', value: rfq.rfqNo },
          { label: 'Title', value: rfq.title },
          { label: 'Vendor', value: vendorName },
          { label: 'Department', value: rfq.department },
        ]}
        right={[
          { label: 'Rounds Completed', value: String(rounds.length) },
          { label: 'Status', value: board?.steps?.negotiationAgreed ? 'Agreed' : 'In Progress' },
          { label: 'Currency', value: currency },
          { label: 'Due Date', value: rfq.dueDate ? formatDate(rfq.dueDate) : '—' },
        ]}
      />
    </>
  );

  const runningContent = (
    <PrintRunningHeader companyName={company.name} docTitle="Negotiation Summary" docNumber={rfq.rfqNo} pageNumber={2} totalPages={2} />
  );

  const bottomContent = (
    <>
      {rounds.length > 0 && (
        <PrintSection label="Negotiation Rounds" className="pr-items" style={{ paddingTop: '5mm' }}>
          <table className="pr-items-table">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>Round</th>
                <th style={{ width: '15%' }}>Stage</th>
                <th style={{ width: '15%' }}>Amount</th>
                <th style={{ width: '12%' }}>Actor</th>
                <th style={{ width: '20%' }}>Date</th>
                <th style={{ width: '30%' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map((round, i) => (
                <tr key={round.id || i}>
                  <td>{round.round || i + 1}</td>
                  <td>{round.stage || '—'}</td>
                  <td className="num">{formatAmount(round.amount, currency)}</td>
                  <td>{round.actor || '—'}</td>
                  <td>{round.timestamp ? formatDate(round.timestamp) : '—'}</td>
                  <td>{round.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </PrintSection>
      )}
      <div className="pr-sign">
        <PrintSignatories signatories={[['Negotiator', '—'], ['Vendor Representative', vendorName]]} />
      </div>
    </>
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
            <PrintSection label="Negotiated Items">
              <PrintTable columns={itemColumns} rows={[]} />
            </PrintSection>
          </div>
          <PrintSection label="Negotiated Items">
            <PrintTable columns={itemColumns} rows={rows} refs={{ tbody: tbodyRef }} />
          </PrintSection>
          <div ref={bottomRef}>{bottomContent}</div>
          <div ref={footRef}>
            <PrintFooter generatedAt={new Date().toISOString()} pageNumber={1} totalPages={1} docNumber={rfq.rfqNo} />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[{ label: 'Negotiation', to: '/purchase/rfq/negotiation' }, { label: `${rfq.rfqNo} — ${vendorName}` }]}
        icon={Printer}
        title="Negotiation Summary"
        actions={
          <>
            <button type="button" onClick={() => navigate('/purchase/rfq/negotiation')} className="po-btn po-btn-secondary">
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
                    <PrintRunningHeader companyName={company.name} docTitle="Negotiation Summary" docNumber={rfq.rfqNo} pageNumber={index + 1} totalPages={pages.length} />
                  )}
                  {page.rows.length > 0 && (
                    <PrintSection label="Negotiated Items">
                      <PrintTable columns={itemColumns} rows={page.rows.map((i) => rows[i])} />
                    </PrintSection>
                  )}
                  {page.bottom && bottomContent}
                </div>
                <PrintFooter generatedAt={new Date().toISOString()} pageNumber={index + 1} totalPages={pages.length} docNumber={rfq.rfqNo} />
              </section>
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}
