/**
 * purchase/pages/rfq/QuotationDetail.jsx
 * ------------------------------------------------------------------
 * Vendor Quotation Detail — the full commercial offer received from a
 * vendor against an RFQ. Reached by clicking a quotation in the Vendor
 * Quotations list (/purchase/rfq/quotations/:id).
 *
 * Surfaces every field the workflow relies on — Quote ID, RFQ number
 * and title, Vendor, Submission Date, Amount, Currency, Delivery,
 * Validity, Lead Time, Payment Terms, Warranty, Score, Status and Notes
 * — plus the quoted line items and any attachments, with a Record
 * Quotation button that re-opens the entry modal pre-filled with this
 * quotation's RFQ (so more vendor responses can be captured).
 * ------------------------------------------------------------------
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calculator, FileText, Gauge, IndianRupee, Inbox, LayoutDashboard, ListChecks, Loader2, Mail, Paperclip,
  PencilLine, Plus, Printer, Scale, ScrollText, Truck
} from 'lucide-react';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import PurchaseSectionCard from '../../components/PurchaseSectionCard';
import PurchaseStatusBadge from '../../components/PurchaseStatusBadge';
import AttachmentList from '../../components/AttachmentList';

import { rfqService } from '../../services/rfq';
import { calcDocumentTotals, formatAmount } from '../../utils/purchase';
import { formatDate } from '../../utils/helpers';
import '../../styles/cpr-list.css';

const VALUE = 'text-xs font-semibold text-slate-800';
const LABEL = 'text-[10px] font-bold uppercase tracking-wider text-slate-400';

function DetailItem({ label, value }) {
  return (
    <div>
      <div className={LABEL}>{label}</div>
      <div className={`${VALUE} mt-1`}>{value || '—'}</div>
    </div>
  );
}

function ScorePill({ score }) {
  if (score == null) return '—';
  return (
    <span
      className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-bold ${
        score >= 75 ? 'bg-emerald-50 text-emerald-700' : score >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {score}/100
    </span>
  );
}

export default function QuotationDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [quote, setQuote] = useState(null);
  const [rfq, setRfq] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [refreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      try {
        const record = await rfqService.getQuotation(id);
        if (cancelled) return;
        setQuote(record);
        /* Resolve the RFQ the quotation references. Newer quotations carry
           an explicit internal id link (rfqId); seed / legacy quotations
           only have the human-facing rfqNo, so fall back to matching the
           RFQ list by number. */
        if (record.rfqId) {
          rfqService
            .getRfq(record.rfqId)
            .then((rfqRecord) => {
              if (!cancelled) setRfq(rfqRecord);
            })
            .catch(() => {
              if (!cancelled) setRfq(null);
            });
        } else if (record.rfqNo) {
          rfqService
            .getRfqs({ search: record.rfqNo, page: 1, pageSize: 100 })
            .then((response) => {
              if (cancelled) return;
              const matched = (response.data || []).find((rfq) => rfq.rfqNo === record.rfqNo);
              setRfq(matched || null);
            })
            .catch(() => {
              if (!cancelled) setRfq(null);
            });
        } else {
          setRfq(null);
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
  }, [id, refreshKey]);

  const kpis = useMemo(() => {
    if (!quote) return [];
    const currency = quote.currency || rfq?.currency || 'INR';
    return [
      {
        label: 'Quotation Amount',
        value: formatAmount(quote.total, currency),
        Icon: IndianRupee,
        tone: 'emerald',
        status: quote.status === 'Accepted' ? { text: 'Accepted', cls: 'bg-emerald-50 text-emerald-600' } : null
      },
      { label: 'Vendor', value: quote.vendor || '—', Icon: Truck, tone: 'amber' },
      { label: 'Composite Score', value: quote.score != null ? `${quote.score}/100` : '—', Icon: Gauge, tone: 'violet' },
      { label: 'Valid Until', value: quote.validUntil ? formatDate(quote.validUntil) : '—', Icon: Mail, tone: 'green' }
    ];
  }, [quote, rfq]);

  const generalInfo = useMemo(() => {
    if (!quote) return [];
    const currency = quote.currency || rfq?.currency || 'INR';
    return [
      {
        label: 'Quote ID',
        value: (
          <span>
            <span className="font-bold">{quote.quotationNo || quote.id}</span>
            <span className="block text-[10px] font-medium text-slate-400">{quote.id}</span>
          </span>
        )
      },
      {
        label: 'RFQ Number',
        value: rfq ? (
          <button
            type="button"
            onClick={() => navigate(`/purchase/rfq/${rfq.id}`)}
            className="font-semibold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
          >
            {quote.rfqNo}
          </button>
        ) : (
          quote.rfqNo || '—'
        )
      },
      { label: 'RFQ Title', value: rfq?.title || '—' },
      { label: 'Vendor', value: quote.vendor || '—' },
      { label: 'Submission Date', value: quote.submittedOn ? formatDate(quote.submittedOn) : '—' },
      { label: 'Validity', value: quote.validUntil ? formatDate(quote.validUntil) : '—' },
      { label: 'Amount', value: formatAmount(quote.total, currency) },
      { label: 'Currency', value: quote.currency || 'INR' },
      { label: 'Status', value: <PurchaseStatusBadge status={quote.status} /> },
      { label: 'Score', value: <ScorePill score={quote.score} /> }
    ];
  }, [quote, rfq, navigate]);

  const commercialInfo = useMemo(() => {
    if (!quote) return [];
    return [
      { label: 'Delivery', value: quote.delivery ? `${quote.delivery} days` : '—' },
      { label: 'Lead Time', value: quote.leadTime ? `${quote.leadTime} days` : '—' },
      { label: 'Delivery Terms', value: quote.deliveryTerms || '—' },
      { label: 'Payment Terms', value: quote.paymentTerms || '—' },
      { label: 'Warranty', value: quote.warranty || '—' },
      { label: 'Discount', value: quote.discount ? `${quote.discount}%` : '—' }
    ];
  }, [quote]);

  const pricingInfo = useMemo(() => {
    if (!quote) return [];
    const currency = quote.currency || 'INR';
    return [
      { label: 'Basic Amount', value: formatAmount(quote.subtotal, currency) },
      { label: 'Discount Amount', value: formatAmount(quote.discountAmount, currency) },
      { label: 'Freight', value: quote.freight ? formatAmount(quote.freight, currency) : '—' },
      { label: 'Insurance', value: quote.insurance ? formatAmount(quote.insurance, currency) : '—' },
      { label: 'Other Charges', value: quote.charges ? formatAmount(quote.charges, currency) : '—' },
      /* The API stores the tax figure as `tax`; `gstTotal` is the mock's name. */
      { label: 'Tax', value: formatAmount(quote.tax ?? quote.gstTotal, currency) },
      { label: 'Grand Total', value: <span className="font-bold">{formatAmount(quote.total, currency)}</span> }
    ];
  }, [quote]);

  /* Line item totals — calculated from the same formula used by the
     create/edit form (calcDocumentTotals) so the numbers always agree. */
  const lineTotals = useMemo(() => {
    if (!quote?.items?.length) return [];
    const result = calcDocumentTotals(
      quote.items.map((item) => ({
        qty: Number(item.qty) || 0,
        rate: Number(item.rate) || 0,
        discount: Number(item.discount) || 0,
        gstRate: Number(item.gstRate) || 0
      })),
      Number(quote.discount) || 0,
      Number(quote.charges) || 0
    );
    return result.lines || [];
  }, [quote]);

  if (loading) {
    return (
      <PurchasePageLayout>
        <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      </PurchasePageLayout>
    );
  }

  if (notFound || !quote) {
    return (
      <PurchasePageLayout>
        <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-12 text-center">
          <p className="text-sm font-bold text-slate-700">Quotation not found</p>
          <p className="text-xs text-slate-400 mt-1">It may have been deleted or the link is invalid.</p>
          <button
            type="button"
            onClick={() => navigate('/purchase/rfq/quotations')}
            className="erp-btn-primary mt-4"
          >
            <span className="erp-btn-icon"><ArrowLeft size={16} /></span> Go to Vendor Quotations
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  const currency = quote.currency || rfq?.currency || 'INR';

  const iconButton = (Icon, label, onClick, tone = 'neutral') => (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`prv-icon-btn prv-icon-btn-${tone}`}
    >
      <Icon aria-hidden="true" />
    </button>
  );

  const docActions = [
    { key: 'back', Icon: ArrowLeft, label: 'Back to Vendor Quotations', tone: 'neutral', run: () => navigate('/purchase/rfq/quotations') },
    { key: 'rfq', Icon: FileText, label: 'Quotation Document', tone: 'primary', run: () => rfq && navigate(`/purchase/rfq/${rfq.id}`) },
    { key: 'compare', Icon: Scale, label: 'Price Comparative Statement', tone: 'indigo', run: () => rfq && navigate(`/purchase/rfq/compare?rfq=${rfq.id}`) },
    { key: 'print', Icon: Printer, label: 'Print', tone: 'gray', run: () => rfq && navigate(`/purchase/rfq/${rfq.id}/print`) },
    { key: '360', Icon: LayoutDashboard, label: '360° view', tone: 'teal', run: () => navigate(`/purchase/rfq/quotations/${quote.id}/360`) },
    { key: 'edit', Icon: PencilLine, label: 'Edit', tone: 'amber', run: () => navigate(`/purchase/rfq/quotations/${quote.id}/edit`) }
  ];

  return (
    <PurchasePageLayout className="prv-page">
      <div className="prv-sticky-header">
        <PurchaseHeader
          variant="cpr"
          crumb={[
            { label: 'RFQ & Quotations', to: '/purchase/rfq' },
            { label: 'Vendor Quotations', to: '/purchase/rfq/quotations' },
            { label: 'View' }
          ]}
          icon={Mail}
          title={
            <span className="flex items-center gap-3">
              {quote.quotationNo || quote.id}
              <PurchaseStatusBadge status={quote.status} />
            </span>
          }
          subtitle={quote.vendor ? `Quotation from ${quote.vendor} · ${quote.rfqNo || ''}` : quote.rfqNo || 'Vendor quotation'}
          actions={
            <>
              <span className="prv-icon-bar" role="group" aria-label="Document actions">
                {docActions.map(({ key, Icon, label, tone, run }) => (
                  <Fragment key={key}>
                    {iconButton(Icon, label, run, tone)}
                  </Fragment>
                ))}
              </span>
              <button type="button" className="po-btn po-btn-primary" onClick={() => navigate('/purchase/rfq/quotations/new')}>
                <Plus className="po-btn-icon-ic" /> Record Quotation
              </button>
            </>
          }
        />
      </div>

      {/* Top KPI row */}
      <div className="purchase-summary-grid">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="purchase-summary-card prv-kpi-card">
            <span className={`prv-kpi-chip ${kpi.tone}`} aria-hidden="true">
              <kpi.Icon />
            </span>
            <div className="prv-kpi-body">
              <div className="purchase-summary-value prv-kpi-value" title={kpi.value}>{kpi.value}</div>
              <div className="purchase-summary-label prv-kpi-label">{kpi.label}</div>
            </div>
            {kpi.status && (
              <span className={`ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${kpi.status.cls}`}>
                {kpi.status.text}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="prv-main">
        <div className="prv-panel">
          <PurchaseSectionCard title="Quotation" subtitle="Offer received from the vendor" icon={Inbox}>
            <div className="prv-overview-grid">
              {generalInfo.map((item) => (
                <DetailItem key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Pricing" subtitle="Amount breakdown as quoted" icon={Calculator}>
            <div className="prv-detail-grid">
              {pricingInfo.map((item) => (
                <DetailItem key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Delivery & Commercial Terms" subtitle="Commercial terms of the offer" icon={Truck}>
            <div className="prv-detail-grid">
              {commercialInfo.map((item) => (
                <DetailItem key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Quoted Line Items" subtitle={`${(quote.items || []).length} line item(s)`} icon={ListChecks}>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs min-w-[680px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-3 py-2.5">#</th>
                    <th className="px-3 py-2.5">Item Description</th>
                    <th className="px-3 py-2.5">HSN</th>
                    <th className="px-3 py-2.5">UOM</th>
                    <th className="px-3 py-2.5 text-right">Qty</th>
                    <th className="px-3 py-2.5 text-right">Quoted Rate</th>
                    <th className="px-3 py-2.5 text-right">Discount %</th>
                    <th className="px-3 py-2.5 text-right">Tax %</th>
                    <th className="px-3 py-2.5 text-right">Line Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(quote.items || []).map((item, index) => (
                    <tr key={`${item.product}-${index}`} className="bg-surface hover:bg-slate-50/60 transition-colors">
                      <td className="px-3 py-2.5 text-slate-400 font-bold">{index + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-800">{item.product || '—'}</div>
                        {item.specification && <div className="text-[11px] text-slate-400 mt-0.5">{item.specification}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{item.hsn || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{item.uom || '—'}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{Number(item.qty) || 0}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-semibold tabular-nums">{formatAmount(item.rate, currency)}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{item.discount ? `${item.discount}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 font-semibold">{item.gstRate ? `${item.gstRate}%` : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-bold text-slate-800 tabular-nums">
                        {formatAmount(lineTotals[index]?.total ?? (Number(item.qty) || 0) * (Number(item.rate) || 0), currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </PurchaseSectionCard>

          <PurchaseSectionCard title="Notes" subtitle="Commercial notes from the vendor" icon={ScrollText}>
            <p className="text-xs text-slate-600 whitespace-pre-wrap">{quote.notes || quote.remarks || '—'}</p>
          </PurchaseSectionCard>

          {(quote.attachments && quote.attachments.length > 0) && (
            <PurchaseSectionCard
              title="Attachments"
              subtitle={`${quote.attachments.length} supporting document(s)`}
              icon={Paperclip}
            >
              <AttachmentList attachments={quote.attachments} fallbackDate={quote.submittedOn} />
            </PurchaseSectionCard>
          )}
        </div>
      </div>

    </PurchasePageLayout>
  );
}