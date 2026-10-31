import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CreationActionBar from '../Common/CreationActionBar';
import {
  Banknote,
  Building2,
  Calculator,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Coins,
  FileText,
  Flag,
  Info,
  Layers,
  Loader2,
  Paperclip,
  ShieldCheck,
  Signature,
  StickyNote,
  Users,
} from 'lucide-react';
import { Accordion, FormField, SelectInput, TextArea, TextInput, useToast } from '../Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import { useFormDraft } from '../../hooks/useFormDraft';
import ClientLookup from './ClientLookup';
import CurrencyDropdown from './CurrencyDropdown';
import PendingAttachments from './PendingAttachments';
import SalesAttachments from '../SalesDetail/SalesAttachments';
import SalesItemGrid from './SalesItemGrid';
import SalesStatusBadge from '../SalesTable/SalesStatusBadge';
import SalesTotals from './SalesTotals';
import { SERIALIZERS, cpoNo, withoutDiscount } from '../../utils/salesHelpers';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import {
  CREDIT_NOTE_REASONS,
  CREDIT_NOTE_SOURCES,
  SETTLEMENT_METHODS,
  normalizeSourceValue
} from '../../constants/salesConstants';
import invoiceService from '../../services/invoiceService';
import paymentReceiptService from '../../services/paymentReceiptService';
import salesOrderService from '../../services/salesOrderService';

// ERP credit-note-create.html CNCreate.populateSourceRefs: the Source Document
// dropdown lists open documents of the chosen source type. Keys are the ERP
// short codes used by the Source select options ('' = Direct, inv, so).
const CN_SOURCE_DOC_SERVICES = {
  inv: { service: invoiceService, docKey: 'invoiceNo', clientKey: 'clientName', amountKey: 'grandTotal', dateKey: 'invoiceDate' },
  so: { service: salesOrderService, docKey: 'soNo', clientKey: 'clientName', amountKey: 'grandTotal', dateKey: 'orderDate' },
  pr: { service: paymentReceiptService, docKey: 'receiptNo', clientKey: 'clientName', amountKey: 'paidAmount', dateKey: 'receiptDate' }
};

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

const CLIENT_FIELDS = [
  'clientId', 'clientName', 'contactPerson', 'phone', 'email', 'gstin',
  'pan', 'city', 'state', 'pin', 'country', 'billingAddress', 'shippingAddress'
];

/**
 * Marks a linked-document value the user typed on the credit note itself
 * instead of the value resolved from the linked document, so an override is
 * never mistaken for the automatic one (or the other way round).
 */
function ManualOverrideBadge() {
  return (
    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100/80 px-2 py-0.5 rounded-full">
      Manual override
    </span>
  );
}

// GST type from the place of supply: IGST for inter-state transactions,
// CGST + SGST for same-state (ERP company default: Tamil Nadu). Pure function
// so it can be used from effects without re-declaration.
function deriveTaxType(customerState, companyState) {
  const cState = String(customerState || '').trim().toLowerCase();
  const compState = String(companyState || 'Tamil Nadu').trim().toLowerCase();
  if (cState && compState && cState !== compState) return 'IGST';
  return 'CGST + SGST';
}

/**
 * Credit Note create/edit page — mirrors ERP credit-note-create.html exactly,
 * restructured as 12 collapsible sections (Refren UX reference) while reusing
 * the existing ERP logic, APIs and shared components:
 *
 *   1. Customer & Company  5. Items           9. Terms & Conditions
 *   2. Credit Note Details 6. Totals         10. Remarks
 *   3. Reason              7. Settlement     11. Signature (placeholder)
 *   4. Currency / Tax      8. Attachments    12. Bottom Action Bar
 *
 * Every section is independently collapsible; collapsed sections keep their
 * form state (values live in the parent `form` state, never in the accordion).
 * Single main column, no sidebar.
 */
// backToList (optional) is the "Back" destination when it differs from
// navigateToList (which is also the base path for record URLs and post-save
// redirects) — it points at the module's list inside the Sales Execution hub.
export default function CreditNoteFormPage({ config, service, navigateToList, backToList }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(() => {
    const initial = { status: (config.statusOptions || config.statuses)[0] || 'draft' };
    initial[config.dateKey] = new Date().toISOString().split('T')[0];
    if (config.defaults) {
      Object.entries(config.defaults).forEach(([key, fn]) => {
        if (initial[key] == null) initial[key] = typeof fn === 'function' ? fn() : fn;
      });
    }
    return initial;
  });
  const [items, setItemsState] = useState([]);
  // ---- new-record lines are discount-free, legacy lines are untouched ----
  // A Credit Note has NO discount control, so a NEW record's lines are
  // normalized to qty × rate whatever they arrive with (source document, bulk
  // upload, restored draft): no hidden discount can reduce a new note.
  // Editing an EXISTING record is deliberately NOT normalized — a legacy note
  // may hold a genuine historical discount that must survive opening, editing
  // and saving (the legacy compatibility policy).
  const setItems = useCallback(
    (next) => setItemsState((prev) => {
      const list = typeof next === 'function' ? next(prev) : next;
      return isEdit ? list : withoutDiscount(list);
    }),
    [isEdit]
  );
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({
    moduleKey: config.moduleKey,
    setForm,
    setItems,
    enabled: !isEdit
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [clientRefreshKey] = useState(0);
  const [sourceDocs, setSourceDocs] = useState([]);
  const [clientVisible, setClientVisible] = useState(isEdit || Boolean(searchParams.get('from')));

  const loadedRef = useRef(false);

  // ---- form draft persistence ----
  const draftRestoredRef = useRef(false);
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    config.moduleKey, id || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // ERP CNCreate.populateSourceRefs: Source change reloads the Source Document options.
  const handleSourceChange = (value) => {
    setField('source', value);
    setSourceDocs([]);
    setField('sourceRef', '');
  };

  useEffect(() => {
    const cfg = CN_SOURCE_DOC_SERVICES[form.source];
    if (!cfg) return undefined;
    let cancelled = false;
    cfg.service
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const list = parseListResponse(res);
        setSourceDocs(
          list.map((doc) => {
            const no = doc[cfg.docKey] || doc.id || '';
            const client = doc[cfg.clientKey] || doc.customerName || '';
            return { value: no, label: `${no} - ${client}`.trim(), doc };
          })
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.source]);

  // ERP CNCreate.loadFromSource: picking a Source Document auto-fills the
  // customer, line items, the Original Invoice Date and (invoice → Grand
  // Total, receipt → Paid Amount) the Credit / Adjustment Amount.
  const handleSourceRefChange = (value) => {
    setField('sourceRef', value);
    const doc = sourceDocs.find((o) => o.value === value)?.doc;
    if (!doc) return;
    const patch = {};
    CLIENT_FIELDS.forEach((key) => {
      if (doc[key] != null && doc[key] !== '') patch[key] = doc[key];
    });
    const cfg = CN_SOURCE_DOC_SERVICES[form.source];
    if (cfg && doc[cfg.amountKey] != null && doc[cfg.amountKey] !== '') {
      patch.refundAmount = Number(doc[cfg.amountKey]);
    }
    if (cfg?.dateKey && doc[cfg.dateKey]) {
      patch.sourceDate = String(doc[cfg.dateKey]).slice(0, 10);
    }
    // GST type is derived from the place of supply: IGST for inter-state,
    // CGST + SGST for same-state (never manually entered).
    const customerState = doc.billingState || doc.state || '';
    if (customerState) patch.taxType = deriveTaxType(customerState, form.companyState);
    if (doc.clientName || doc.customerName) setClientVisible(true);
    setForm((prev) => ({ ...prev, ...patch }));
    if (Array.isArray(doc.items) && doc.items.length > 0) {
      setItems(
        doc.items.map((it) => ({
          productId: it.productId || null,
          productName: it.productName || it.description || '',
          description: it.description || it.productName || '',
          sku: it.sku || '',
          hsn: it.hsn || '',
          unit: it.unit || it.uom || 'pcs',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate || it.unitPrice) || 0,
          // No discount is carried over from the source document — a Credit
          // Note line is priced at qty × rate.
          discountPct: 0,
          gstRate: Number(it.gstRate ?? it.gst) || 0,
          amount: Number(it.amount) || 0
        }))
      );
    }
  };

  // Auto-fill from a selected customer (ERP CustomerLookup).
  const handleClientSelect = (customer) => {
    setClientVisible(true);
    setField('clientId', customer.id);
    setField('clientName', customer.businessName || '');
    setField('contactPerson', customer.contactPerson || '');
    setField('phone', customer.phone || '');
    setField('email', customer.email || '');
    setField('gstin', customer.gstin || '');
    setField('pan', customer.pan || '');
    setField('city', customer.billingCity || '');
    setField('state', customer.billingState || '');
    setField('pin', customer.billingPin || '');
    setField('billingAddress', customer.billingAddress || '');
    setField('shippingAddress', customer.shippingAddress || customer.billingAddress || '');
    setField('taxType', deriveTaxType(customer.billingState, form.companyState));
  };

  // Prefill from a source document query param (e.g. ?inv=12 / ?pr=12 /
  // ?so=<id> from the Customer Purchase Order conversion).
  useEffect(() => {
    if (isEdit) return undefined;
    const sourceKey = ['inv', 'pr', 'so'].find((k) => searchParams.get(k));
    if (!sourceKey) return undefined;
    const sourceId = searchParams.get(sourceKey);
    const srcCfg = {
      inv: { service: invoiceService, code: 'inv', docKey: 'invoiceNo', amountKey: 'grandTotal', dateKey: 'invoiceDate' },
      pr: { service: paymentReceiptService, code: 'pr', docKey: 'receiptNo', amountKey: 'paidAmount' },
      // Customer Purchase Order: a valid Credit Note source (CREDIT_NOTE_SOURCES)
      // — the refund opens at the CPO total, the same amount the one-click
      // conversion wrote, and stays fully editable.
      so: { service: salesOrderService, code: 'so', docKey: 'soNo', amountKey: 'grandTotal', dateKey: 'orderDate' }
    }[sourceKey];
    if (!srcCfg || !sourceId) return undefined;
    let cancelled = false;
    // A CPO conversion link that no longer resolves must leave the user on a
    // usable (empty) credit-note form instead of replacing the route with the
    // global error page — the same rule the other conversion prefills follow.
    const fetchOptions = sourceKey === 'so' ? { suppressGlobalError: true } : undefined;
    srcCfg.service
      .get(sourceId, fetchOptions)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        if (sourceKey === 'so' && !raw.soNo && !raw.id) {
          toast.error('Customer Purchase Order could not be loaded');
          return;
        }
        const patch = { source: srcCfg.code, sourceRef: raw[srcCfg.docKey] || String(sourceId) };
        CLIENT_FIELDS.forEach((key) => {
          if (raw[key] != null && raw[key] !== '') patch[key] = raw[key];
        });
        if (raw[srcCfg.amountKey] != null) patch.refundAmount = Number(raw[srcCfg.amountKey]);
        if (srcCfg.dateKey && raw[srcCfg.dateKey]) patch.sourceDate = String(raw[srcCfg.dateKey]).slice(0, 10);
        const customerState = raw.billingState || raw.state || '';
        if (customerState) patch.taxType = deriveTaxType(customerState, form.companyState);
        if (raw.clientName || raw.customerName) setClientVisible(true);
        setForm((prev) => ({ ...prev, ...patch }));
        if (Array.isArray(raw.items) && raw.items.length > 0) {
          setItems(
            raw.items.map((it) => ({
              productId: it.productId || null,
              productName: it.productName || it.description || '',
              description: it.description || it.productName || '',
              sku: it.sku || '',
              hsn: it.hsn || '',
              unit: it.unit || it.uom || 'pcs',
              qty: Number(it.qty) || 1,
              rate: Number(it.rate || it.unitPrice) || 0,
              // No discount is carried over from the source document (see the
              // ?inv= / ?pr= prefill above).
              discountPct: 0,
              gstRate: Number(it.gstRate ?? it.gst) || 0,
              amount: Number(it.amount) || 0
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, searchParams]);

  // Auto-generated Credit Note Number (ERP: readonly, bold, CN-YYYY-XXXXXX).
  useEffect(() => {
    if (isEdit) return undefined;
    let cancelled = false;
    service
      .getNextNumber()
      .then((res) => {
        if (cancelled) return;
        const value = res?.data?.cnNo || res?.data?.nextNumber;
        if (value) setForm((prev) => ({ ...prev, cnNo: value }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit, service]);

  // Load an existing Credit Note (edit mode). `service` is omitted from the
  // deps on purpose: the factory builds a fresh object each render, which would
  // otherwise re-trigger the load and reset the form on every render.
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    service
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        const toForm = {};
        // The two linked-document date OVERRIDES are date-ish but do not end in
        // "Date", so they are listed explicitly: they must reach the form (and
        // its date inputs) as a plain yyyy-MM-dd value even if the API ever
        // answers with a date-time string. They are deliberately NOT reset when
        // the record loads — a saved override is the user's own value and has to
        // come back exactly as it was stored.
        const DATE_KEYS = new Set(['validTill', 'validity', 'dueDate', 'deliveryDate', 'dispatchDate', 'validUntil',
          'dispatchDateOverride', 'dueDateOverride']);
        Object.keys(raw).forEach((key) => {
          if (key === 'items') return;
          if (typeof raw[key] === 'string' && (DATE_KEYS.has(key) || /Date$/.test(key))) {
            toForm[key] = raw[key].slice(0, 10);
          } else {
            toForm[key] = raw[key];
          }
        });
        // Backend stores lowercase statuses ("draft", "issued") while the ERP
        // Status select uses title-case options ("Draft", "Issued") — normalize
        // so the saved status matches an option and is displayed correctly.
        if (typeof toForm.status === 'string' && toForm.status) {
          toForm.status = toForm.status.charAt(0).toUpperCase() + toForm.status.slice(1);
        }
        // Source is stored as an ERP short code (''/inv/pr) or, for records
        // created before the short-code alignment, a legacy display string
        // ('From Invoice', 'Direct', ...). Normalize so the Source select
        // pre-selects the saved value on edit.
        if (toForm.source != null) {
          toForm.source = normalizeSourceValue(toForm.source);
        }
        setForm((prev) => ({ status: prev.status, ...toForm }));
        setItems(Array.isArray(raw.items) ? raw.items : []);
        setAttachments(Array.isArray(raw.attachments) ? raw.attachments : []);
        setClientVisible(Boolean(raw.clientName));
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load Credit Note');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setAttachmentsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  // ---- restore unsaved draft from localStorage (new records only) ----
  useEffect(() => {
    if (isEdit || draftRestoredRef.current) return;
    // A source-document conversion (?inv= / ?pr= / ?so=<id>) opens prefilled
    // from that document — an unrelated local draft must not replace it, and
    // the prefill itself must not be autosaved over it (draftRestoredRef stays
    // false, so the debounced persist below is skipped too).
    if (['inv', 'pr', 'so'].some((k) => searchParams.get(k))) return;
    const draft = restoreDraft();
    if (draft) {
      if (draft.form) {
        // A restored draft is always a NEW record: drop any discount an older
        // build's draft may carry — there is no discount control left to see or
        // clear it, and a new Credit Note is discount-free by construction.
        const patch = { ...draft.form };
        delete patch.discountPct;
        setForm((prev) => ({ ...prev, ...patch }));
      }
      if (draft.items && draft.items.length > 0) setItems(draft.items);
    }
    draftRestoredRef.current = true;
    // setItems is a stable useCallback (the no-discount normalizer), so adding it
    // as a dependency cannot re-run this one-shot restore.
  }, [isEdit, restoreDraft, setItems]);

  // ---- persist draft to localStorage (new records only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    if (!form.clientName && (!items || items.length === 0)) return;
    persistDraft({ form, items });
  }, [form, items, isEdit, persistDraft]);

  // On edit, populate the Source Document options once the record is loaded.
  // `service` is likewise omitted from the deps to avoid re-running each render.
  useEffect(() => {
    if (!isEdit || loadedRef.current || !form.source) return;
    const cfg = CN_SOURCE_DOC_SERVICES[form.source];
    if (!cfg) return;
    let cancelled = false;
    cfg.service
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const list = parseListResponse(res);
        setSourceDocs(
          list.map((doc) => {
            const no = doc[cfg.docKey] || doc.id || '';
            const client = doc[cfg.clientKey] || doc.customerName || '';
            return { value: no, label: `${no} - ${client}`.trim(), doc };
          })
        );
        loadedRef.current = true;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit, form.source]);

  // ERP CNCreate.saveDraft allows saving empty/partial drafts without a
  // customer or line items; only full saves require them.
  const validate = (draft = false) => {
    if (!draft && config.showClient && !form.clientName) {
      toast.error('Please select or enter a Customer name.');
      return false;
    }
    if (!draft && config.showItems && items.length === 0) {
      toast.error('Add at least one item.');
      return false;
    }
    return true;
  };

  const resetAfterSave = async () => {
    setForm((prev) => {
      const fresh = {
        status: (config.statusOptions || config.statuses)[0] || 'draft',
        [config.dateKey]: new Date().toISOString().split('T')[0]
      };
      if (config.defaults) {
        Object.entries(config.defaults).forEach(([key, fn]) => {
          if (fresh[key] == null) fresh[key] = typeof fn === 'function' ? fn() : fn;
        });
      }
      return { ...fresh, cnNo: prev.cnNo };
    });
    setItems([]);
    setPendingFiles([]);
    setAttachments([]);
    setClientVisible(false);
    const next = await service.getNextNumber().catch(() => ({}));
    const value = next?.data?.cnNo || next?.data?.nextNumber;
    if (value) setForm((prev) => ({ ...prev, cnNo: value }));
  };

  const save = async ({ draft = false, submit = false, stay = false, quiet = false } = {}) => {
    if (!validate(draft)) return;
    setSaving(true);
    try {
      const payload = SERIALIZERS.creditNote(form, items);
      const res = isEdit ? await service.update(id, payload) : await service.create(payload, draft);
      const created = res?.data ?? {};
      const no = created.cnNo || form.cnNo || '';
      if (!isEdit && created?.id && pendingFiles.length > 0) {
        const results = await service.uploadMany(created.id, pendingFiles);
        const failed = results.filter((r) => !r.ok).length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
        if (failed > 0) toast.error(`${failed} attachment(s) failed to upload`);
      }
      if (submit && created?.id) {
        // ERP credit-note-create.html "Submit for Approval": the backend has no
        // generic send action for credit notes; the issue endpoint is the
        // equivalent workflow step. Fall back silently if it is unavailable.
        await service.postAction(created.id, 'issue').catch(() => {});
      }
      // The form writes the document (and its status) directly, so it does not
      // pass through the list hook that normally refreshes the sidebar count.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      // Clear localStorage draft after successful save
      clearFormDraft();
      toast.success(
        submit ? `${no} submitted for approval` : isEdit ? `${no} updated` : `${no} ${draft ? 'saved as draft' : 'created'}`
      );
      if (stay) {
        await resetAfterSave();
      } else if (quiet) {
        // silent save (e.g. autosave) — no navigation
      } else if (draft) {
        // Save Draft: return to the list (existing behavior).
        navigate(navigateToList || '/credit-notes');
      } else {
        // Save & Continue: open the document Preview (view page) directly so
        // the user can submit it for approval without a list round-trip.
        const savedId = created.id || id;
        navigate(savedId ? `/credit-notes/${savedId}` : navigateToList || '/credit-notes');
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  const inputCls =
    'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-3 py-2 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';
  const labelCls = 'block text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1.5';
  const readonlyBoxCls =
    'w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] text-slate-600 min-h-[38px] flex items-center';
  const statusOptions = config.statusOptions || config.statuses || ['Draft'];

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>Sales</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Sales Execution</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Credit Notes</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="text-slate-600">{isEdit ? 'Edit' : 'Create'}</span>
      </div>

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#0B4A3D]" />
            {isEdit ? 'Edit Credit Note' : 'Create Credit Note'}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(backToList || navigateToList || '/credit-notes')}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to List
        </button>
      </div>

      {/* ===== TWO-COLUMN LAYOUT: MAIN FORM (70%) + SUMMARY SIDEBAR (30%) ===== */}
      {/* Width-only sizing: let the two columns use the available screen width
          (capped so ultra-wide displays don't stretch cards beyond reason). */}
      <div className="mx-auto w-full max-w-[1600px] grid grid-cols-1 lg:grid-cols-10 gap-5 items-start">
        {/* ===== LEFT COLUMN — MAIN FORM ===== */}
        <div className="lg:col-span-7 space-y-4">
        {/* ===== 1. CUSTOMER & COMPANY ===== */}
        <Accordion
          title="Customer & Company"
          icon={Building2}
          defaultOpen
        >
          <div className="pt-4">
            <div className="flex flex-col lg:flex-row gap-5">
              {/* Company (auto-filled) */}
              <div className="flex-1 lg:flex-[2]">
                <div className="mb-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="p-1.5 rounded-md bg-slate-100 text-slate-500"><Building2 className="w-3 h-3" /></span>
                    Company
                  </h4>
                </div>
                <div>
                  <label className={labelCls}>Company Name</label>
                  <TextInput
                    type="text"
                    value={form.companyName || ''}
                    onChange={(e) => setField('companyName', e.target.value)}
                    className="w-full bg-slate-100 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-600/50 transition-all shadow-inner cursor-not-allowed"
                    readOnly
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className={labelCls}>GSTIN</label>
                    <div className={readonlyBoxCls}>{form.companyGstin || '—'}</div>
                  </div>
                  <div>
                    <label className={labelCls}>State</label>
                    <div className={readonlyBoxCls}>{form.companyState || '—'}</div>
                  </div>
                </div>
              </div>

              {/* Customer (auto-fills GSTIN / State / Address) */}
              <div className="flex-1 lg:flex-[3]">
                <div className="mb-3">
                  <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                    <span className="p-1.5 rounded-md bg-slate-100 text-slate-500"><Users className="w-3 h-3" /></span>
                    Customer
                  </h4>
                </div>
                <div className="space-y-4">
                  <FormField label="Customer">
                    <ClientLookup
                      value={form.clientName}
                      onChange={(name) => setField('clientName', name)}
                      onAutoFill={handleClientSelect}
                      label="Customer"
                      placeholder="Search customer by Name, Code, GST, Phone, Email..."
                      refreshKey={clientRefreshKey}
                      portal
                    />
                  </FormField>
                  {clientVisible && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className={labelCls}>Customer GSTIN</label>
                          <div className={readonlyBoxCls}>{form.gstin || '—'}</div>
                        </div>
                        <div>
                          <label className={labelCls}>State / Place of Supply</label>
                          <div className={readonlyBoxCls}>{form.state || '—'}</div>
                        </div>
                        <div>
                          <label className={labelCls}>GST Type</label>
                          <div className="w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] font-semibold text-[#0B4A3D] min-h-[38px] flex items-center">{form.taxType || 'CGST + SGST'}</div>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Address</label>
                        <div className="w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] text-slate-600 min-h-[38px] flex items-start">
                          {form.billingAddress || form.shippingAddress || '—'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Accordion>

        {/* ===== 2. CREDIT NOTE DETAILS ===== */}
        <Accordion
          title="Credit Note Details"
          icon={FileText}
          defaultOpen
        >
          <div className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Credit Note Number</label>
                <TextInput
                  type="text"
                  value={form.cnNo || ''}
                  onChange={(e) => setField('cnNo', e.target.value)}
                  placeholder="Auto-generated (CN-YYYY-XXXXXX)"
                  readOnly
                  className="w-full bg-slate-100 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-emerald-600/50 transition-all shadow-inner cursor-not-allowed"
                />
              </div>
              <div>
                <label className={labelCls}>Credit Note Date *</label>
                <TextInput type="date" value={form.cnDate || ''} onChange={(e) => setField('cnDate', e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Source</label>
                <SelectInput value={form.source || ''} onChange={(e) => handleSourceChange(e.target.value)} className={inputCls}>
                  <option value="">Direct</option>
                  {CREDIT_NOTE_SOURCES.filter((s) => s.value !== '').map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </SelectInput>
              </div>
              <div>
                <label className={labelCls}>Link Invoice / Source Document</label>
                <SelectInput value={form.sourceRef || ''} onChange={(e) => handleSourceRefChange(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  {sourceDocs.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </SelectInput>
              </div>
              <div>
                <label className={labelCls}>Original Invoice Date</label>
                <TextInput
                  type="date"
                  value={form.sourceDate || ''}
                  onChange={(e) => setField('sourceDate', e.target.value)}
                  className="w-full bg-slate-100 border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 placeholder-slate-400 outline-none cursor-not-allowed"
                  readOnly
                />
              </div>
            </div>
            {/* Destination Reached Date is the Credit Note's own date: no other
                document in the chain records when the credited consignment
                reached the destination, so it is captured on this note (the
                Delivery Challan's own date is the EXPECTED delivery date and
                keeps that meaning). */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelCls}>Destination Reached Date</label>
                <TextInput
                  type="date"
                  value={form.destinationReachedDate || ''}
                  onChange={(e) => setField('destinationReachedDate', e.target.value)}
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-400 mt-1">Date the credited goods reached the destination.</p>
              </div>
            </div>
            {/* Linked-document values, resolved by the backend from the
                documents this credit note points at: the CPO it traces back
                to, the Delivery Challan that shipped it (dispatch date) and
                its source invoice (due date), with the overdue flag derived
                from the due date and the note's own settlement state.

                CPO No. stays READ-ONLY: it IS the document relationship, so a
                hand-typed number could only invent a link that does not exist.

                Dispatch Date and Due Date resolve automatically but can also be
                entered or corrected here, because a linked document may record
                no value (or a wrong one). The override is stored ON THE CREDIT
                NOTE (`dispatchDateOverride` / `dueDateOverride`) and never
                written back to the linked document, so the other documents keep
                their own facts and a later source-document change cannot destroy
                what the user saved. Each control shows the effective value —
                the override when there is one, otherwise the AUTOMATIC value
                the API reports separately as `resolvedDispatchDate` /
                `resolvedDueDate` — and says which of the two it is. Reading the
                automatic value from its own field is what lets "Use the linked
                date" show the linked date immediately instead of leaving the
                overridden date on screen under an "Automatic" label.

                Due Date Exceeded has NO input by design: it stays derived from
                the authoritative due date above and the note's settlement state,
                so overriding the date moves the flag with it rather than letting
                the two disagree. */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-3">
                Linked Document Details
                <span className="ml-2 font-medium normal-case tracking-normal text-slate-400">
                  (filled in automatically from the linked CPO, Delivery Challan and Invoice — the dispatch and due dates can be entered or overridden here)
                </span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className={labelCls}>CPO No.</label>
                  <div className={readonlyBoxCls}>{form.cpoNo ? cpoNo(form.cpoNo) : '—'}</div>
                  <p className="text-[11px] text-slate-400 mt-1">Owned by the linked document — never overridden here.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label className={labelCls}>Dispatch Date</label>
                    {form.dispatchDateOverride ? <ManualOverrideBadge /> : null}
                  </div>
                  <TextInput
                    type="date"
                    value={form.dispatchDateOverride || form.resolvedDispatchDate || ''}
                    onChange={(e) => setField('dispatchDateOverride', e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {form.dispatchDateOverride
                      ? 'Overridden on this credit note — the Delivery Challan is not changed (save to keep it).'
                      : form.resolvedDispatchDate
                        ? 'Automatic — from the linked Delivery Challan.'
                        : 'No dispatch date on the linked documents — enter it here.'}
                  </p>
                  {form.dispatchDateOverride ? (
                    <button
                      type="button"
                      onClick={() => setField('dispatchDateOverride', '')}
                      className="mt-1 text-[11px] font-bold text-[#0B4A3D] hover:underline"
                    >
                      Use the linked date
                    </button>
                  ) : null}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <label className={labelCls}>Due Date</label>
                    {form.dueDateOverride ? <ManualOverrideBadge /> : null}
                  </div>
                  <TextInput
                    type="date"
                    value={form.dueDateOverride || form.resolvedDueDate || ''}
                    onChange={(e) => setField('dueDateOverride', e.target.value)}
                    className={inputCls}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    {form.dueDateOverride
                      ? 'Overridden on this credit note — this date is the one the overdue check uses (save to keep it).'
                      : form.resolvedDueDate
                        ? 'Automatic — from the linked Invoice, else the linked CPO.'
                        : 'No due date on the linked documents — enter it here.'}
                  </p>
                  {form.dueDateOverride ? (
                    <button
                      type="button"
                      onClick={() => setField('dueDateOverride', '')}
                      className="mt-1 text-[11px] font-bold text-[#0B4A3D] hover:underline"
                    >
                      Use the linked date
                    </button>
                  ) : null}
                </div>
                <div>
                  <label className={labelCls}>Due Date Exceeded</label>
                  <div className="w-full min-h-[38px] flex items-center">
                    <SalesStatusBadge status={form.dueDateExceeded ? 'Overdue' : 'Not Overdue'} />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    {form.dueDateOverride
                      ? 'Calculated from the due date above.'
                      : 'Calculated from the due date above and the settlement state.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Accordion>

        {/* ===== 3. REASON ===== */}
        <Accordion
          title="Reason"
          icon={Flag}
          defaultOpen
        >
          <div className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Reason *</label>
                <SelectInput value={form.reason || ''} onChange={(e) => setField('reason', e.target.value)} className={inputCls}>
                  <option value="">Select Reason...</option>
                  {CREDIT_NOTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </SelectInput>
              </div>
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <TextArea rows={2} value={form.reasonDetail || ''} onChange={(e) => setField('reasonDetail', e.target.value)} placeholder="Describe the reason for this credit note..." className={inputCls} />
            </div>
          </div>
        </Accordion>

        {/* ===== 4. CURRENCY / TAX ===== */}
        <Accordion
          title="Currency / Tax"
          icon={Coins}
          defaultOpen
        >
          <div className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Currency</label>
                <CurrencyDropdown
                  value={form.currency || 'INR'}
                  onChange={(v) => setField('currency', v)}
                  placeholder="Currency"
                />
                <p className="text-[11px] text-slate-400 mt-1">The currency code is stored on the document (default INR).</p>
              </div>
              <div>
                <label className={labelCls}>Tax Type</label>
                <div className={readonlyBoxCls}>{form.taxType || 'CGST + SGST'}</div>
                <p className="text-[11px] text-slate-400 mt-1">Auto-derived from the place of supply — IGST for inter-state transactions.</p>
              </div>
            </div>
          </div>
        </Accordion>

        {/* ===== 5. ITEMS ===== */}
        <Accordion
          title="Items"
          icon={Layers}
          defaultOpen
        >
          <div className="pt-4">
            <SalesItemGrid
              items={items}
              setItems={setItems}
              creditNote
              taxType={form.taxType || 'CGST + SGST'}
              onTaxTypeChange={(v) => setField('taxType', v)}
            />
          </div>
        </Accordion>

        {/* ===== 6. SETTLEMENT ===== */}
        <Accordion
          title="Settlement"
          icon={Banknote}
        >
          <div className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Credit / Adjustment Amount</label>
                <TextInput type="number" min="0" step="0.01" value={form.refundAmount ?? ''} onChange={(e) => setField('refundAmount', e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Settlement Method</label>
                <SelectInput value={form.settlementMethod || ''} onChange={(e) => setField('settlementMethod', e.target.value)} className={inputCls}>
                  <option value="">Select Method...</option>
                  {SETTLEMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </SelectInput>
              </div>
            </div>
          </div>
        </Accordion>
        </div>

        {/* ===== RIGHT COLUMN — SUMMARY SIDEBAR (30%) ===== */}
        <div className="lg:col-span-3 space-y-4 lg:sticky lg:top-4 lg:self-start">
          {/* ===== 1. TOTALS ===== */}
          <Accordion
            title="Totals"
            icon={Calculator}
            defaultOpen
          >
            <div className="pt-4">
              {/* No onDiscountChange: a Credit Note has NO discount input, so
                  nothing is user-editable. discountPct is the record's own
                  historical value — read-only — so a legacy note that stored a
                  discount still shows (and keeps) its real taxable value. */}
              <SalesTotals
                items={items}
                discountPct={form.discountPct ?? 0}
                charges={form.charges ?? 0}
                onChargesChange={(v) => setField('charges', v)}
                creditNote
                taxType={form.taxType || 'CGST + SGST'}
                showWords
              />
            </div>
          </Accordion>

          {/* ===== 2. STATUS ===== */}
          <Accordion
            title="Status"
            icon={ShieldCheck}
            defaultOpen
          >
            <div className="pt-4">
              <div className="flex items-center gap-2">
                <SalesStatusBadge status={form.status || 'Draft'} />
                <span className="text-[11px] text-slate-400 font-medium">Document status</span>
              </div>
              <div className="mt-3">
                <label className={labelCls}>Change Status</label>
                <SelectInput value={form.status || ''} onChange={(e) => setField('status', e.target.value)} className={inputCls}>
                  {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                </SelectInput>
              </div>
            </div>
          </Accordion>

          {/* ===== 3. ATTACHMENTS ===== */}
          <Accordion
            title="Attachments"
            icon={Paperclip}
          >
          <div className="pt-4">
            {attachmentsLoading ? (
              <div className="flex items-center justify-center py-10 text-xs text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading attachments...
              </div>
            ) : isEdit ? (
              <SalesAttachments service={service} docId={id} attachments={attachments} onChanged={() => {
                service.getAttachments(id).then((res) => setAttachments(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [])).catch(() => {});
              }} />
            ) : (
              <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />
            )}
          </div>
        </Accordion>

        {/* ===== 4. TERMS & CONDITIONS ===== */}
        <Accordion
          title="Terms & Conditions"
          icon={ClipboardList}
        >
          <div className="pt-4">
            <label className={labelCls}>Terms &amp; Conditions</label>
            <TextArea
              rows={4}
              value={form.terms || ''}
              onChange={(e) => setField('terms', e.target.value)}
              placeholder="Enter the credit note terms & conditions (e.g. goods must be returned in original condition; credit valid for 30 days)..."
              className={inputCls}
            />
          </div>
        </Accordion>

        {/* ===== 5. REMARKS ===== */}
        <Accordion
          title="Remarks"
          icon={StickyNote}
        >
          <div className="pt-4">
            <label className={labelCls}>Remarks</label>
            <TextArea
              rows={3}
              value={form.remarks || ''}
              onChange={(e) => setField('remarks', e.target.value)}
              placeholder="Internal remarks (not printed on the customer copy)..."
              className={inputCls}
            />
          </div>
        </Accordion>

        {/* ===== 6. SIGNATURE (placeholder — no backend) ===== */}
        <Accordion
          title="Signature"
          icon={Signature}
        >
          <div className="pt-4">
            <div className="border border-dashed border-slate-300 rounded-xl bg-slate-50/60 px-5 py-8 flex flex-col items-center text-center gap-3">
              <div className="p-3 rounded-full bg-slate-100 text-slate-400">
                <Signature className="w-6 h-6" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Signature capture is not configured</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md">
                  Authorisation signatures for Credit Notes will be available in a future release.
                  The document can still be submitted for approval without a signature.
                </p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                Coming Soon
              </span>
            </div>
          </div>
        </Accordion>
      </div>
      </div>

      {/* ===== 12. BOTTOM ACTION BAR (ERP standard creation action bar) ===== */}
      <CreationActionBar
        showBackToList={false}
        onCancel={() => navigate(backToList || navigateToList || '/credit-notes')}
        onSaveDraft={!isEdit ? () => save({ draft: true }) : null}
        onSaveNew={!isEdit ? () => save({ stay: true }) : null}
        onSave={() => save({ submit: !isEdit })}
        saveLabel={isEdit ? 'Update' : 'Save'}
        onSubmit={!isEdit ? () => save({ submit: true }) : null}
        disabled={saving}
      />
    </div>
  );
}
