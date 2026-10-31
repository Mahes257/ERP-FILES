/**
 * purchase/pages/requisition/PurchaseRequisitionCreate.jsx
 * ------------------------------------------------------------------
 * Create Purchase Requisition — wraps RequisitionForm in the shared
 * Purchase page shell with breadcrumb + back navigation.
 *
 * CPR → PURCHASE REQUISITION CONVERSION
 * -------------------------------------
 * The CPR list's "Convert to Purchase Requisition" action navigates here
 * with `?fromCpr=<cprId>`. This page then performs exactly ONE read
 * (GET /cprs/:id) and maps the CPR onto the requisition form's own model
 * before rendering it, so the user reviews/edits a pre-filled form and
 * saves through the form's existing actions (Save Draft / Save & New /
 * Submit for Approval / Create Requisition).
 *
 * Nothing is written on the way in: no PR is created, saved, submitted or
 * approved, and the CPR's status / conversion state is left untouched —
 * persistence happens only through RequisitionForm's existing handlers.
 *
 * The mapping deliberately mirrors the established backend conversion
 * (PurchaseRequisitionIngressAdapter / CprTechnicalVerificationService):
 * title, department, project, requester, priority, company, delivery
 * address, notes, the item lines, and the currency of the CPR's linked
 * client (resolved through the existing customer service, exactly like
 * CprTechnicalVerificationService#resolveClientCurrency — never hardcoded).
 * Values the PR has no valid CPR source for (PR type, purchase rate,
 * discount, vendor, category, HSN) are deliberately left at the form's own
 * defaults for the user to complete — a CPR estimate is not a confirmed
 * purchase rate.
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronLeft, ClipboardList, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import PurchaseHeader from '../../components/PurchaseHeader';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import RequisitionForm from '../../components/RequisitionForm';
import cprService from '../../../services/cprService';
import customerService from '../../../services/customerService';
import { normalizeCpr } from '../../../utils/cprHelpers';
import { getDefaultTaxRate } from '../../services/settings';
import '../../styles/cpr-list.css';

/** Today in the yyyy-MM-dd wire format the PR form and API use. */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** One CPR item → one Purchase Requisition line (same mapping the backend conversion applies). */
function cprItemToLine(item) {
  const drawingNo = String(item?.drawingNo || '').trim();
  const description = String(item?.description || '').trim();
  const notes = String(item?.notes || '').trim();
  const remarks = [String(item?.remarks || '').trim(), notes].filter(Boolean).join(' — ');
  return {
    /* The PR keeps the drawing as the item/material reference (the ingress
       conversion passes firstNonBlank(itemNo, drawingNo) as the item code),
       and the grid's Drawing No column shows the same value. */
    itemCode: drawingNo,
    drawingNo,
    product: description,
    specification: String(item?.specification || '').trim(),
    uom: String(item?.unit || '').trim() || 'Nos',
    qty: item?.qty ?? 1,
    remarks,
    /* The requisition's GST rate is a PR-side value with no CPR equivalent, so
       the line carries the PR form's own default rate (the same default a blank
       row gets) instead of an invented CPR number. Rate and discount stay
       empty: a CPR estimate is not a purchase rate. */
    gstRate: getDefaultTaxRate(),
    category: '',
    hsn: '',
    discount: ''
  };
}

/**
 * CPR → requisition form values. Mirrors the backend conversion's choices,
 * including its required-date rule (a CPR deadline in the past — or missing —
 * becomes the requisition's own request date, the earliest date Purchase
 * accepts).
 */
function cprToRequisitionPrefill(cpr, clientCurrency = '') {
  const today = todayISO();
  const required = String(cpr?.requiredDate || '').slice(0, 10);
  const expectedDate = /^\d{4}-\d{2}-\d{2}$/.test(required) && required >= today ? required : today;
  const description = String(cpr?.description || '').replace(/\s+/g, ' ').trim();
  const prNo = String(cpr?.prNo || '').trim();
  return {
    /* PR title needs ≥5 characters; the CPR description is the meaningful
       source, with the CPR number as a truthful fallback. */
    title: description.length >= 5 ? description : `CPR ${prNo}`.trim(),
    date: today,
    expectedDate,
    department: cpr?.department || '',
    project: cpr?.project || '',
    requester: cpr?.requestedBy || '',
    priority: cpr?.priority || 'Medium',
    company: cpr?.company || '',
    deliveryAddress: cpr?.shippingAddress || '',
    notes: cpr?.remarks || '',
    /* Requisition currency: the linked client's configured currency, the same
       rule the backend conversion applies. Empty (no client / no currency
       configured) leaves the PR form's own default untouched. */
    currency: clientCurrency || undefined,
    /* Source-document provenance in the requisition's existing internal-notes
       column — the CPR NUMBER plus its database ID, so the converted record can
       always be traced back to the exact CPR. No schema change. */
    internalNotes: prNo
      ? `CPR ${prNo}${cpr?.id ? ` (#${cpr.id})` : ''}`
      : cpr?.id
        ? `CPR #${cpr.id}`
        : '',
    items: (Array.isArray(cpr?.items) ? cpr.items : []).map(cprItemToLine)
  };
}

export default function PurchaseRequisitionCreate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  /* `fromCpr` is the conversion entry point; `cpr` is accepted as the alias
     the other CPR-driven create screens already use (?cpr=<id>). */
  const sourceCprId = searchParams.get('fromCpr') || searchParams.get('cpr') || '';

  /* One state slot for the loaded source CPR. `id` records WHICH CPR the state
     belongs to, so a new ?fromCpr= on the same mounted page is reported as
     loading without writing state during the effect. */
  const [source, setSource] = useState({ id: '', cpr: null, currency: '', error: null });
  /* Save & New starts a DIFFERENT document: once the form resets, this page must
     stop presenting it as the CPR conversion (no banner, no CPR baseline for
     Reset) so nothing of the old source leaks into the next requisition. The
     dismissal is tied to the CPR id, so opening another CPR on the same mounted
     page pre-fills normally again. */
  const [dismissedSource, setDismissedSource] = useState('');

  useEffect(() => {
    if (!sourceCprId) return undefined;
    let cancelled = false;

    const load = async () => {
      const res = await cprService.getCpr(sourceCprId);
      if (cancelled) return;
      const cpr = normalizeCpr(res?.data ?? res ?? {});
      /* The requisition currency follows the CPR's linked client (the same rule
         the backend conversion applies). One lookup through the existing
         customer service; any failure just leaves the form's own default. */
      let currency = '';
      if (cpr.clientId) {
        try {
          const customerRes = await customerService.get(cpr.clientId, { suppressGlobalError: true });
          const customer = customerRes?.data ?? customerRes ?? {};
          currency = String(customer.currency || '').trim().toUpperCase();
        } catch {
          currency = '';
        }
      }
      if (cancelled) return;
      setSource({ id: sourceCprId, cpr, currency, error: null });
    };

    load().catch((err) => {
      if (cancelled) return;
      setSource({
        id: sourceCprId,
        cpr: null,
        currency: '',
        error: err?.message || 'Failed to load the selected CPR.'
      });
    });

    return () => {
      cancelled = true;
    };
  }, [sourceCprId]);

  const loadingSource = Boolean(sourceCprId) && source.id !== sourceCprId;
  const sourceError = loadingSource ? null : source.error;
  const prefill = useMemo(
    () => (source.cpr ? cprToRequisitionPrefill(source.cpr, source.currency) : null),
    [source.cpr, source.currency]
  );
  const sourceLabel = source.cpr?.prNo || (sourceCprId ? `#${sourceCprId}` : '');
  const showSourceContext = Boolean(sourceCprId) && dismissedSource !== sourceCprId;

  const header = (
    <PurchaseHeader
      variant="cpr"
      crumb={[
        { label: 'Purchase Requisition', to: '/purchase/requisition' },
        { label: 'Create' }
      ]}
      icon={ClipboardList}
      title="Create Purchase Requisition"
      subtitle={
        sourceCprId
          ? 'Pre-filled from the selected CPR — review and edit, then save.'
          : 'Create, track and approve material and service purchase requests.'
      }
      actions={
        <button
          type="button"
          onClick={() => navigate('/purchase/requisition')}
          className="po-btn po-btn-secondary"
        >
          <ChevronLeft className="po-btn-icon-ic" /> Back to Requisitions
        </button>
      }
    />
  );

  /* The form is mounted only once its initial values are known: the CPR is a
     read, and RequisitionForm reads `initialData` when it mounts. */
  if (sourceCprId && loadingSource) {
    return (
      <PurchasePageLayout className="purchase-page--form">
        {header}
        <div className="flex items-center justify-center gap-2 py-24 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading CPR…</span>
        </div>
      </PurchasePageLayout>
    );
  }

  if (sourceCprId && sourceError) {
    return (
      <PurchasePageLayout className="purchase-page--form">
        {header}
        <div className="mx-auto my-10 max-w-[560px] rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <AlertTriangle className="w-4 h-4" /> CPR could not be loaded
          </h3>
          <p className="mt-1.5 text-xs text-amber-800/80">{sourceError}</p>
          <p className="mt-1 text-xs text-amber-800/80">
            Nothing was saved. Open the CPR again (or start an empty requisition) to continue.
          </p>
          <button
            type="button"
            onClick={() => navigate('/purchase/requisition/new')}
            className="po-btn po-btn-secondary mt-4"
          >
            Start an empty requisition
          </button>
        </div>
      </PurchasePageLayout>
    );
  }

  return (
    <PurchasePageLayout className="purchase-page--form">
      {header}
      {showSourceContext && (
        <p className="mx-auto mb-3 max-w-[1180px] text-xs text-slate-500">
          Pre-filled from <strong className="text-slate-700">{sourceLabel}</strong> — nothing is saved
          until you use a save action below.
        </p>
      )}
      <RequisitionForm
        /* Once Save & New has reset the form, the CPR values are no longer this
           document's baseline (Reset returns an empty form, not the CPR). */
        initialData={showSourceContext ? prefill || undefined : undefined}
        /* The pre-filled values are this form's baseline: restoring an
           unrelated unsaved new-PR draft would silently overwrite them. */
        skipDraftRestore={Boolean(sourceCprId)}
        /* Save & New saved this CPR-derived requisition and started a new one —
           drop the source context from the page from here on. */
        onSavedAndNew={() => setDismissedSource(sourceCprId)}
      />
    </PurchasePageLayout>
  );
}
