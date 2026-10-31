/**
 * purchase/pages/orders/OrderCreate.jsx
 * ------------------------------------------------------------------
 * Create Purchase Order — wraps PurchaseOrderForm in the shared
 * Purchase page shell.
 * ------------------------------------------------------------------
 */
import { useEffect, useState } from 'react';
import { ChevronLeft, FileText, Loader2 } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import EvaluationPipeline from '../../components/EvaluationPipeline';
import { stepperStepsFor } from '../../constants';
import PurchaseOrderForm from '../../components/PurchaseOrderForm';
import { formatAmount } from '../../utils/purchase';
import { loadCpoItemConversion, purchaseOrderPrefill } from '../../../utils/cpoItemConversion';
import '../../styles/cpr-list.css';

export default function OrderCreate() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  /* Optional handoff from an approved upstream document (NFA / legacy
     TPC detail) — the conversion service derives the PO pre-fill from
     the shared RFQ → quotation → supplier-selection data and passes it
     through location.state, so the order arrives pre-filled (vendor,
     line items at the approved rates, discount, non-taxable charges,
     currency, document references and terms). Direct visits to
     /purchase/orders/new have no state and open a blank form as
     before. */
  const handoff = location.state?.poPrefill || location.state?.tpcHandoff || null;

  /* Handoff from a Customer Purchase Order item marked "Convert To → PO":
     the CPO form saves first and navigates here with the PERSISTED CPO id
     and item id, which are re-read from the API — the link is validated
     instead of trusted, and the order is only created when the user saves
     this form. */
  const cpoId = searchParams.get('cpoId');
  const itemId = searchParams.get('itemId');
  const [cpoPrefill, setCpoPrefill] = useState(null);
  const [conversionError, setConversionError] = useState('');
  const [conversionLoading, setConversionLoading] = useState(Boolean(cpoId && itemId));

  useEffect(() => {
    if (!cpoId || !itemId) return undefined;
    let cancelled = false;
    // No synchronous setState here: `conversionLoading` already starts as true
    // for a conversion link, and the state below is only written once the
    // request settles.
    (async () => {
      try {
        const { cpo, item, itemNumber } = await loadCpoItemConversion(cpoId, itemId, 'PO');
        if (cancelled) return;
        setCpoPrefill({
          values: purchaseOrderPrefill(cpo, item, itemNumber),
          cpoNo: cpo.soNo || String(cpo.id),
          itemNumber,
          itemName: String(item.description || '').trim()
        });
      } catch (err) {
        if (!cancelled) {
          setCpoPrefill(null);
          setConversionError(err?.message || 'The Customer Purchase Order item could not be loaded.');
        }
      } finally {
        if (!cancelled) setConversionLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cpoId, itemId]);

  const initialData = cpoPrefill?.values || handoff || undefined;
  const converting = Boolean(cpoId && itemId);

  return (
    <PurchasePageLayout className="purchase-page--form">
      <PurchaseHeader
        variant="cpr"
        crumb={[
          { label: 'Purchase Orders', to: '/purchase/orders' },
          { label: 'Create' }
        ]}
        icon={FileText}
        title="Create Purchase Order"
        subtitle="Issue a new purchase order with line items and GST"
        actions={
          <button
            type="button"
            onClick={() => navigate('/purchase/orders')}
            className="po-btn po-btn-secondary"
          >
            <ChevronLeft className="po-btn-icon-ic" /> Back to Orders
          </button>
        }
      />
      <div className="mb-4">
        <EvaluationPipeline steps={stepperStepsFor('PURCHASE_ORDER')} ariaLabel="Purchase Order workflow" />
      </div>
      {converting && conversionLoading && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2.5">
          <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
          <p className="text-xs font-semibold text-slate-600">
            Loading the Customer Purchase Order item…
          </p>
        </div>
      )}
      {converting && !conversionLoading && conversionError && (
        <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 flex items-start gap-2.5">
          <FileText className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-rose-700">{conversionError}</p>
            <p className="text-xs text-rose-600 mt-1">
              Nothing was converted. Open the Customer Purchase Order, check the item&apos;s
              Convert To choice and save it, then use Convert again.
            </p>
            <button
              type="button"
              onClick={() => navigate('/purchase/orders/new', { replace: true })}
              className="po-btn po-btn-secondary mt-2"
            >
              Create a blank Purchase Order
            </button>
          </div>
        </div>
      )}
      {cpoPrefill && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-2.5">
          <FileText className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-violet-700">
            Pre-filled from Customer Purchase Order {cpoPrefill.cpoNo}, item {cpoPrefill.itemNumber}
            {cpoPrefill.itemName ? ` — ${cpoPrefill.itemName}` : ''}. The purchase order is created only
            when you submit this form: select the supplier, review the quantity, rate and taxes, then save.
          </p>
        </div>
      )}
      {handoff && !cpoPrefill && (
        <div className="mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-2.5">
          <FileText className="w-4 h-4 text-violet-600 shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-violet-700">
            Pre-filled from {handoff.sourceLabel || 'the approved procurement record'}
            {handoff.rfqNo ? ` for <strong>${handoff.rfqNo}</strong>` : ''}
            {handoff.vendor ? ` — ${handoff.vendor}` : ''}
            {Array.isArray(handoff.items) && handoff.items.length > 0
              ? ` · ${handoff.items.length} line item${handoff.items.length === 1 ? '' : 's'}`
              : ''}
            {Number(handoff.awardedValue ?? handoff.total) > 0
              ? ` · final value ${formatAmount(Number(handoff.awardedValue ?? handoff.total), handoff.currency || 'INR')}`
              : ''}
            . Review the order details, line items and totals before submitting.
          </p>
        </div>
      )}
      {/* The form is withheld while the link is resolving and when it does not
          resolve at all: an invalid link must never hand the user a blank PO as
          if the conversion had worked. */}
      {converting && (conversionLoading || conversionError) ? null : (
        <PurchaseOrderForm
          key={cpoPrefill ? `cpo-${cpoId}-${itemId}` : 'create'}
          initialData={initialData}
        />
      )}
    </PurchasePageLayout>
  );
}
