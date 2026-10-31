/**
 * purchase/pages/approval/NfaPrint.jsx
 * ------------------------------------------------------------------
 * NFA (Note for Approval) print preview — uses the standardized
 * Purchase print system with measurement-driven pagination.
 *
 * Route: /purchase/rfq/approval/:id/print
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import { nfaService } from '../../services/nfa';
import { rfqService } from '../../services/rfq';
import { evaluationService } from '../../services/evaluation';
import { formatAmount, round2 } from '../../utils/purchase';
import { getPrintCompany } from '../../services/settings';
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
import { NFA_APPROVAL_STAGES } from '../../constants';


export default function NfaPrint() {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const [record, setRecord] = useState(null);
  const [linkedRfq, setLinkedRfq] = useState(null);
  const [quotation, setQuotation] = useState(null);
  const [allQuotes, setAllQuotes] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const { pages, sheetRefs, measureRef, topRef, runningRef, tableHeadRef, tbodyRef, bottomRef, footRef } = usePrintPagination(record ? { record, linkedRfq, quotation, evaluation } : null, (linkedRfq?.items || []).length);

  /* ── Load NFA record ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await nfaService.getNfa(id);
        if (!data) { if (!cancelled) setNotFound(true); return; }
        setRecord(data);

        /* Load linked RFQ */
        if (data.rfqNo) {
          try {
            const rfqResult = await rfqService.getRfqs({ rfqNo: data.rfqNo, page: 1, pageSize: 10 });
            const rfqMatch = (rfqResult.data || []).find((r) => r.rfqNo === data.rfqNo);
            if (rfqMatch && !cancelled) {
              setLinkedRfq(rfqMatch);
              /* Load quotation comparison */
              try {
                const comp = await rfqService.getQuotationComparison(rfqMatch.id);
                if (!cancelled) {
                  const quotes = comp?.quotes || [];
                  setAllQuotes(quotes);
                  setQuotation(quotes.find((q) => q.vendor === data.supplier) || quotes[0] || null);
                }
              } catch { /* ok */ }
              /* Load evaluation */
              try {
                const evalData = await evaluationService.getEvaluation(rfqMatch.id);
                if (!cancelled) setEvaluation(evalData);
              } catch { /* ok */ }
            }
          } catch { /* ok */ }
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const currency = record?.currency || linkedRfq?.currency || 'INR';
  const company = getPrintCompany();

  /* ── Derive items from RFQ + quotation ── */
  const rfqItems = linkedRfq?.items || [];
  const rows = rfqItems.map((rfqItem, idx) => {
    const quoteLine = quotation?.items?.[idx] || {};
    const qty = Number(rfqItem.qty) || Number(quoteLine.qty) || 0;
    const unitPrice = Number(quoteLine.rate) || Number(rfqItem.rate) || 0;
    const gstRate = Number(quoteLine.gstRate || linkedRfq?.commercialTerms?.taxRate) || 18;
    const lineTotal = round2(qty * unitPrice);
    const taxAmount = round2(lineTotal * (gstRate / 100));
    return {
      key: rfqItem.product || idx,
      sNo: idx + 1,
      product: rfqItem.product || `Item ${idx + 1}`,
      specification: rfqItem.specification || '',
      qty,
      uom: rfqItem.uom || '',
      unitPrice,
      gstRate,
      lineTotal: round2(lineTotal + taxAmount),
    };
  });

  const itemColumns = [
    { key: 'sNo', label: '#', width: '5%' },
    { key: 'product', label: 'Item', width: '25%' },
    { key: 'specification', label: 'Specification', width: '20%', render: (row) => (
      <span style={{ fontSize: '7px', color: '#94a3b8' }}>{row.specification || '—'}</span>
    )},
    { key: 'qty', label: 'Qty', width: '8%', align: 'right' },
    { key: 'uom', label: 'UOM', width: '7%' },
    { key: 'unitPrice', label: 'Unit Price', width: '13%', align: 'right', render: (row) => formatAmount(row.unitPrice, currency) },
    { key: 'gstRate', label: 'Tax', width: '7%', align: 'right', render: (row) => `${row.gstRate}%` },
    { key: 'lineTotal', label: 'Total', width: '15%', align: 'right', render: (row) => formatAmount(row.lineTotal, currency) },
  ];

  /* ── Approval stages data ── */
  const stages = record?.approvalStages || [];
  const stageColumns = [
    { key: 'stage', label: 'Stage', width: '20%' },
    { key: 'status', label: 'Status', width: '20%', render: (row) => (
      <span style={{
        display: 'inline-block', padding: '1mm 3mm', borderRadius: '10mm',
        fontSize: '7px', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
        background: row.status === 'Approved' ? '#f0fdf4' : row.status === 'Rejected' ? '#fef2f2' : '#f3f4f6',
        color: row.status === 'Approved' ? '#16a34a' : row.status === 'Rejected' ? '#dc2626' : '#6b7280',
      }}>{row.status || 'Pending'}</span>
    )},
    { key: 'approver', label: 'Approver', width: '25%' },
    { key: 'approvedAt', label: 'Date', width: '20%', render: (row) => row.approvedAt ? formatDate(row.approvedAt) : '—' },
    { key: 'remarks', label: 'Remarks', width: '15%' },
  ];

  const stageRows = NFA_APPROVAL_STAGES.map((stageName) => {
    const stageObj = stages.find((s) => s.stage === stageName);
    return {
      key: stageName,
      stage: stageName,
      status: stageObj?.status || 'Pending',
      approver: stageObj?.approver || '—',
      approvedAt: stageObj?.approvedAt || '',
      remarks: stageObj?.remarks || '—',
    };
  });

  /* ── Commercial summary ── */
  const quotedAmount = quotation?.total || 0;
  const negotiatedAmount = record?.amount || quotedAmount;
  const savings = Math.max(0, quotedAmount - negotiatedAmount);
  const savingsPct = quotedAmount > 0 ? Math.round((savings / quotedAmount) * 1000) / 10 : 0;

  /* ── PDF export ── */
  const handleDownloadPdf = async () => {
    if (!record || pages === null) return;
    setBusy(true);
    try {
      const sheetList = sheetRefs.getAll();
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: `nfa-${record.nfaNo || record.id}` });
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  /* ── Loading / Not Found ── */
  if (!record && !loading && notFound) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <PurchaseHeader variant="cpr" crumb={[{ label: 'Approval Flow', to: '/purchase/rfq/approval' }, { label: 'Not Found' }]} icon={Printer} title="NFA Preview"
          actions={<button type="button" onClick={() => navigate('/purchase/rfq/approval')} className="po-btn po-btn-secondary"><ChevronLeft className="po-btn-icon-ic" /> Back</button>}
        />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">NFA Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The requested approval document could not be found.</p>
        </div>
      </PurchasePageLayout>
    );
  }

  if (loading || !record) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading NFA Preview…
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Approval status text ── */
  const isApproved = record.status === 'Approved';
  const isRejected = record.status === 'Rejected';
  const approvalStatus = isApproved ? 'Approved' : isRejected ? 'Rejected' : record.currentStage ? `Pending ${record.currentStage}` : record.status || 'Draft';

  /* ── Shared content blocks ── */
  const topContent = (
    <>
      <PrintDocumentHeader company={company} docTitle="Note for Approval" docNumber={record.nfaNo || record.id} status={approvalStatus} />
      <PrintInfoGrid
        left={[
          { label: 'NFA Number', value: record.nfaNo },
          { label: 'RFQ Reference', value: record.rfqNo },
          { label: 'PR Reference', value: linkedRfq?.prNo || record.prNo || '—' },
          { label: 'Title', value: record.rfqTitle || linkedRfq?.title || '—' },
          { label: 'Department', value: linkedRfq?.department || '—' },
        ]}
        right={[
          { label: 'Vendor', value: record.supplier || '—' },
          { label: 'Final Value', value: formatAmount(record.amount, currency) },
          { label: 'Currency', value: currency },
          { label: 'Status', value: approvalStatus },
          { label: 'Purpose', value: record.purpose || '—' },
        ]}
      />
    </>
  );

  const runningContent = (
    <PrintRunningHeader companyName={company.name} docTitle="Note for Approval" docNumber={record.nfaNo || record.id} pageNumber={2} totalPages={2} />
  );

  const bottomContent = (
    <>
      {/* Approval Stages */}
      {stageRows.length > 0 && (
        <PrintSection label="Approval Stages">
          <PrintTable columns={stageColumns} rows={stageRows} />
        </PrintSection>
      )}

      {/* Commercial Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6mm 10mm', paddingTop: '5mm' }}>
        <div>
          <PrintSection label="Commercial Summary">
            <PrintSummary
              rows={[
                { label: 'Quoted Amount', value: formatAmount(quotedAmount, currency) },
                { label: 'Negotiated Amount', value: formatAmount(negotiatedAmount, currency) },
                ...(savings > 0 ? [{ label: 'Savings', value: formatAmount(savings, currency) }] : []),
                ...(savingsPct > 0 ? [{ label: 'Savings %', value: `${savingsPct}%` }] : []),
              ]}
              grandLabel="Final Amount"
              grandValue={formatAmount(record.amount, currency)}
            />
          </PrintSection>
        </div>
        <div>
          <PrintNotes text={record.purpose || record.justification || ''} label="Justification" />
        </div>
      </div>

      {/* Quotation Comparison */}
      {allQuotes.length > 0 && (
        <PrintSection label="Quotation Comparison" style={{ paddingTop: '5mm' }}>
          <table className="pr-items-table" style={{ fontSize: '8px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', width: '25%' }}>Vendor</th>
                <th style={{ textAlign: 'center', width: '20%' }}>Quotation No</th>
                <th style={{ textAlign: 'right', width: '20%' }}>Quoted Amount</th>
                <th style={{ textAlign: 'right', width: '20%' }}>Final Value</th>
                <th style={{ textAlign: 'right', width: '15%' }}>Delivery</th>
              </tr>
            </thead>
            <tbody>
              {allQuotes
                .filter((q) => ['Received', 'Accepted'].includes(q.status))
                .sort((a, b) => (a.total || 0) - (b.total || 0))
                .map((q) => {
                  const isSelected = q.vendor === record.supplier;
                  return (
                    <tr key={q.id}>
                      <td style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? '#0B4A3D' : undefined }}>
                        {q.vendor} {isSelected ? '★' : ''}
                      </td>
                      <td style={{ textAlign: 'center' }}>{q.quotationNo || '—'}</td>
                      <td className="num">{formatAmount(q.total, currency)}</td>
                      <td className="num" style={{ fontWeight: isSelected ? 700 : 400, color: isSelected ? '#0B4A3D' : undefined }}>
                        {isSelected && record.amount ? formatAmount(record.amount, currency) : formatAmount(q.total, currency)}
                      </td>
                      <td className="num">{q.delivery ? `${q.delivery} days` : '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </PrintSection>
      )}

      {/* Signatures */}
      <div className="pr-sign" style={{ paddingTop: '6mm' }}>
        <PrintSignatories
          signatories={[
            ['Requested By', record.requestedBy || linkedRfq?.requester || '—'],
            ['Approved By', record.approvedBy || '—'],
          ]}
        />
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
            <PrintSection label="Item Details">
              <PrintTable columns={itemColumns} rows={[]} />
            </PrintSection>
          </div>
          <PrintSection label="Item Details">
            <PrintTable columns={itemColumns} rows={rows} refs={{ tbody: tbodyRef }} />
          </PrintSection>
          <div ref={bottomRef}>{bottomContent}</div>
          <div ref={footRef}>
            <PrintFooter generatedAt={record.createdAt} pageNumber={1} totalPages={1} docNumber={record.nfaNo} />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[{ label: 'Approval Flow', to: '/purchase/rfq/approval' }, { label: record.nfaNo || 'Preview' }]}
        icon={Printer}
        title="NFA Preview"
        actions={
          <>
            <button type="button" onClick={() => navigate(`/purchase/rfq/approval/${record.id}`)} className="po-btn po-btn-secondary">
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
                    <PrintRunningHeader companyName={company.name} docTitle="Note for Approval" docNumber={record.nfaNo || record.id} pageNumber={index + 1} totalPages={pages.length} />
                  )}
                  {page.rows.length > 0 && (
                    <PrintSection label="Item Details">
                      <PrintTable columns={itemColumns} rows={page.rows.map((i) => rows[i])} />
                    </PrintSection>
                  )}
                  {page.bottom && bottomContent}
                </div>
                <PrintFooter generatedAt={record.createdAt} pageNumber={index + 1} totalPages={pages.length} docNumber={record.nfaNo} />
              </section>
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}
