/**
 * purchase/pages/logistics/GrnPrint.jsx
 * ------------------------------------------------------------------
 * GRN (Goods Receipt Note) print preview — uses the standardized
 * Purchase print system with measurement-driven pagination.
 *
 * Route: /purchase/logistics/grn/:grnNo/print
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download, Loader2, Printer } from 'lucide-react';
import { useToast } from '../../components/ui';
import { logisticsService } from '../../services/logistics';
import { purchaseOrderService } from '../../services/purchaseOrder';
import { getDefaultCurrency, getPrintCompany } from '../../services/settings';
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
  PrintSignatories,
  PrintFooter,
  PrintRunningHeader,
  usePrintPagination,
} from '../../components/print';


export default function GrnPrint() {
  const navigate = useNavigate();
  const { grnNo } = useParams();
  const toast = useToast();
  const [grn, setGrn] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);

  const { pages, sheetRefs, measureRef, topRef, runningRef, tableHeadRef, tbodyRef, bottomRef, footRef } = usePrintPagination(grn && order !== undefined ? { grn, order } : grn ? { grn } : null, (grn?.items || []).length);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await logisticsService.getGrnById(grnNo);
        if (!data) { if (!cancelled) setNotFound(true); return; }
        let poData = null;
        if (data.poNo) poData = await purchaseOrderService.getOrder(data.poNo).catch(() => null);
        if (cancelled) return;
        setGrn(data);
        setOrder(poData);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [grnNo]);

  const g = grn;
  const currency = order?.currency || getDefaultCurrency();
  const company = getPrintCompany();

  const rows = (g?.items || []).map((item, i) => ({
    ...item,
    key: item.product || i,
    sNo: i + 1,
    pending: Math.max(0, (Number(item.qty) || 0) - (Number(item.received) || 0)),
  }));

  const itemColumns = [
    { key: 'sNo', label: '#', width: '5%' },
    { key: 'product', label: 'Product', width: '30%' },
    { key: 'qty', label: 'Ordered Qty', width: '14%', align: 'right' },
    { key: 'received', label: 'Received Qty', width: '14%', align: 'right' },
    { key: 'pending', label: 'Pending Qty', width: '14%', align: 'right', render: (row) => {
      const pending = Math.max(0, (Number(row.qty) || 0) - (Number(row.received) || 0));
      return <span style={{ color: pending > 0 ? '#d97706' : '#16a34a' }}>{pending}</span>;
    }},
  ];

  const totalOrdered = rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
  const totalReceived = rows.reduce((sum, r) => sum + (Number(r.received) || 0), 0);

  /* ── PDF export ── */
  const handleDownloadPdf = async () => {
    if (!g || pages === null) return;
    setBusy(true);
    try {
      const sheetList = sheetRefs.getAll();
      if (sheetList.length > 0) {
        await exportSheetsAsPdf(sheetList, { filename: `grn-${g.grnNo || g.id}` });
        toast.success('PDF downloaded');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to download PDF');
    } finally {
      setBusy(false);
    }
  };

  if (!g && !loading && notFound) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <PurchaseHeader variant="cpr" crumb={[{ label: 'GRN', to: '/purchase/logistics/grn' }, { label: 'Not Found' }]} icon={Printer} title="Goods Receipt Note"
          actions={<button type="button" onClick={() => navigate('/purchase/logistics/grn')} className="po-btn po-btn-secondary"><ChevronLeft className="po-btn-icon-ic" /> Back</button>}
        />
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">GRN Not Found</p>
          <p className="text-xs text-slate-400 mt-1">The requested GRN could not be found.</p>
        </div>
      </PurchasePageLayout>
    );
  }

  if (loading || !g) {
    return (
      <PurchasePageLayout className="pr-print-page">
        <div className="flex items-center justify-center gap-2 min-h-[60vh] text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading GRN Preview…
        </div>
      </PurchasePageLayout>
    );
  }

  /* ── Shared content blocks ── */
  const topContent = (
    <>
      <PrintDocumentHeader company={company} docTitle="Goods Receipt Note" docNumber={g.grnNo || g.id} status={g.status} />
      <PrintInfoGrid
        left={[
          { label: 'GRN Number', value: g.grnNo },
          { label: 'PO Reference', value: g.poNo },
          { label: 'Vendor', value: g.vendor || '—' },
          { label: 'Warehouse', value: g.warehouse || '—' },
          { label: 'Shipment', value: g.shipmentNo || '—' },
        ]}
        right={[
          { label: 'Received Date', value: g.receivedOn ? formatDate(g.receivedOn) : '—' },
          { label: 'Created', value: g.createdAt ? formatDate(g.createdAt) : '—' },
          { label: 'Status', value: g.status },
          { label: 'Currency', value: currency },
          { label: 'Received By', value: order?.buyer || '—' },
        ]}
      />
    </>
  );

  const runningContent = (
    <PrintRunningHeader companyName={company.name} docTitle="Goods Receipt Note" docNumber={g.grnNo || g.id} pageNumber={2} totalPages={2} />
  );

  const bottomContent = (
    <>
      <div style={{ paddingTop: '6mm' }}>
        <PrintSummary
          rows={[
            { label: 'Total Ordered Qty', value: String(totalOrdered) },
            { label: 'Total Received Qty', value: String(totalReceived) },
            { label: 'Balance Qty', value: String(Math.max(0, totalOrdered - totalReceived)) },
          ]}
        />
      </div>
      <div className="pr-sign">
        <PrintSignatories
          threeColumn
          signatories={[
            ['Received By', g.receivedBy || '—'],
            ['Inspected By', g.status !== 'Expected' ? (g.inspectedBy || '—') : 'Pending'],
            ['Approved By', order?.buyer || '—'],
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
            <PrintSection label="Received Items">
              <PrintTable columns={itemColumns} rows={[]} />
            </PrintSection>
          </div>
          <PrintSection label="Received Items">
            <PrintTable columns={itemColumns} rows={rows} refs={{ tbody: tbodyRef }} />
          </PrintSection>
          <div ref={bottomRef}>{bottomContent}</div>
          <div ref={footRef}>
            <PrintFooter generatedAt={g.createdAt} pageNumber={1} totalPages={1} docNumber={g.grnNo} />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <PurchaseHeader
        variant="cpr"
        crumb={[{ label: 'GRN', to: '/purchase/logistics/grn' }, { label: g.grnNo || 'Preview' }]}
        icon={Printer}
        title="Goods Receipt Note"
        actions={
          <>
            <button type="button" onClick={() => navigate(`/purchase/logistics/grn/${g.grnNo}`)} className="po-btn po-btn-secondary">
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
                    <PrintRunningHeader companyName={company.name} docTitle="Goods Receipt Note" docNumber={g.grnNo || g.id} pageNumber={index + 1} totalPages={pages.length} />
                  )}
                  {page.rows.length > 0 && (
                    <PrintSection label="Received Items">
                      <PrintTable columns={itemColumns} rows={page.rows.map((i) => rows[i])} />
                    </PrintSection>
                  )}
                  {page.bottom && bottomContent}
                </div>
                <PrintFooter generatedAt={g.createdAt} pageNumber={index + 1} totalPages={pages.length} docNumber={g.grnNo} />
              </section>
            </div>
          ))
        )}
      </div>
    </PurchasePageLayout>
  );
}
