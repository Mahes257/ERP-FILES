/**
 * purchase/components/QuotationForm.jsx
 * ------------------------------------------------------------------
 * Shared Create / Edit form for the Vendor Quotation module.
 *
 * Uses the standard Purchase module architecture:
 *   Desktop → left: collapsible Accordion sections · right: sticky sidebar
 *   Tablet  → summary stacks below · Mobile → single column
 *
 * Key behaviours:
 *   - Selecting an RFQ loads its items, vendors and metadata
 *   - Vendor dropdown is filtered to the RFQ's invited vendors
 *   - Single-vendor RFQs auto-select the vendor
 *   - Date validation enforces validUntil >= quotationDate
 *   - Delivery date per-item validates >= quotationDate
 *   - Financial summary is live in the sidebar
 *   - Attachments use the shared AttachmentManager component
 *   - Draft saves are lenient; full saves validate everything
 * ------------------------------------------------------------------
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Accordion, ConfirmDialog, EditableMasterSelect, FormField,
  TextArea, TextInput, useToast
} from './ui';
import {
  BadgeCheck, Banknote, Eye, FileText, Inbox, ListChecks, Paperclip,
  RotateCcw, StickyNote, UserPlus, X
} from 'lucide-react';
import AttachmentManager from './AttachmentManager';
import FormActions from './FormActions';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import VendorQuickCreateDialog from './VendorQuickCreateDialog';
import {
  DELIVERY_TERMS, PAYMENT_TERMS, QUOTATION_STATUS, RFQ_STATUS, WARRANTY_TERMS
} from '../constants';
import { rfqService, quotationsStore } from '../services/rfq';
import { vendorService } from '../services/vendor';
import { todayLocal } from '../services/base';
import { calcDocumentTotals, formatAmount, nextSeqNo, round2 } from '../utils/purchase';
import { currencies } from '../../data/currencies';
import useFormDraft from '../hooks/useFormDraft';

/* ============================= HELPERS ============================= */

function buildFormValues(record = {}) {
  return {
    rfqNo: record.rfqNo || '',
    rfqTitle: record.rfqTitle || '',
    rfqDepartment: record.rfqDepartment || '',
    rfqProject: record.rfqProject || '',
    vendor: record.vendor || '',
    submittedOn: record.submittedOn || todayLocal(),
    validUntil: record.validUntil || '',
    currency: record.currency || 'INR',
    deliveryTerms: record.deliveryTerms || DELIVERY_TERMS[2],
    delivery: record.delivery ?? '14',
    leadTime: record.leadTime ?? '21',
    paymentTerms: record.paymentTerms || PAYMENT_TERMS[4],
    warranty: record.warranty || WARRANTY_TERMS[3],
    discount: record.discount ?? '0',
    freight: record.freight ?? '0',
    insurance: record.insurance ?? '0',
    charges: record.charges ?? '0',
    notes: record.notes || '',
    attachments: Array.isArray(record.attachments)
      ? record.attachments.map(normalizeQuotationAttachment)
      : []
  };
}

/** Normalizes an attachment record to the quotation's expected shape,
 *  preserving all metadata (filename, type, size, source, upload info).
 *  Handles both RFQ-sourced attachments and previously-saved quotation
 *  attachments so re-edits keep their data intact. */
function normalizeQuotationAttachment(att) {
  if (!att || typeof att !== 'object') return {};
  return {
    id: att.id || `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: att.name || '',
    size: Number(att.size) || 0,
    type: att.type || (att.name ? att.name.split('.').pop()?.toLowerCase() || '' : ''),
    dataUrl: att.dataUrl || att.downloadUrl || att.fileUrl || att.storagePath || undefined,
    uploadedAt: att.uploadedAt || att.createdAt || new Date().toISOString(),
    uploadedBy: att.uploadedBy || att.author || 'System',
    docName: att.docName || att.name || '',
    docType: att.docType || att.type || '',
    category: att.category || '',
    description: att.description || '',
    sourceModule: att.sourceModule || '',
    sourceReference: att.sourceReference || '',
    vendor: att.vendor || '',
    tags: Array.isArray(att.tags) ? att.tags : (att.tags ? String(att.tags).split(',').map((t) => t.trim()).filter(Boolean) : []),
    confidential: Boolean(att.confidential),
    version: Number(att.version) || 1
  };
}

function emptyItem() {
  return {
    product: '', specification: '', requiredQty: '', qty: '',
    uom: 'Nos', rate: '', discount: 0, gstRate: 18,
    deliveryDate: '', remarks: ''
  };
}

/** An item has meaningful content when product is named and qty > 0. */
const hasLine = (item) => Boolean(item.product) && Number(item.qty) > 0;

/** Validate whether a date string is >= another date string. */
const isDateOnOrAfter = (later, earlier) => {
  if (!later || !earlier) return true;
  return new Date(later) >= new Date(earlier);
};

const GRID = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
const SPAN2 = 'sm:col-span-2';

/* =========================== COMPONENT ============================ */

export default function QuotationForm({ initialData, requestId, returnPath }) {
  const navigate = useNavigate();
  const toast = useToast();

  const { loadDraft, saveDraft: persistDraft, saveDraftNow, clearDraft } = useFormDraft({
    draftKey: 'purchase.quotation',
    recordId: requestId || null,
  });

  /* ---- State ---- */
  const [rfqOptions, setRfqOptions] = useState([]);
  const [rfqLoading, setRfqLoading] = useState(true);
  const [rfqError, setRfqError] = useState(false);
  const [rfq, setRfq] = useState(null);
  const [masterVendors, setMasterVendors] = useState([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState(false);
  const [items, setItems] = useState(() => {
    if (initialData?.items?.length) {
      return initialData.items.map((item) => ({
        product: item.product || '',
        specification: item.specification || '',
        requiredQty: item.requiredQty ?? item.qty ?? '',
        qty: item.qty ?? '',
        uom: item.uom || 'Nos',
        hsn: item.hsn || '',
        category: item.category || '',
        itemCode: item.itemCode || '',
        rate: item.rate ?? item.expectedRate ?? '',
        discount: Number(item.discount) || 0,
        gstRate: Number(item.gstRate) || 18,
        deliveryDate: item.deliveryDate || '',
        remarks: item.remarks || ''
      }));
    }
    return [emptyItem()];
  });
  const [liveQuotedVendors, setLiveQuotedVendors] = useState([]);
  const [vendorQuoteMap, setVendorQuoteMap] = useState({});
  const [loadingRfq, setLoadingRfq] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [values, setValues] = useState(() => buildFormValues(initialData));
  const [vendorCreateOpen, setVendorCreateOpen] = useState(false);

  const setField = (key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setItemField = (index, key, value) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
    /* Clear item-level errors for this row when the user edits. */
    setErrors((prev) => {
      const next = { ...prev };
      delete next[`item_rate_${index}`];
      delete next[`item_qty_${index}`];
      delete next[`item_deliveryDate_${index}`];
      return next;
    });
  };

  /* ---- Load RFQ options on mount ---- */
  useEffect(() => {
    let cancelled = false;
    setRfqLoading(true);
    setRfqError(false);
    rfqService
      .getRfqs({ page: 1, pageSize: 100 })
      .then((response) => {
        if (!cancelled) {
          /* Keep the form independent of whether the service returns its
             normalized page shape or a raw Spring Page response. */
          const records = Array.isArray(response)
            ? response
            : Array.isArray(response?.data)
              ? response.data
              : Array.isArray(response?.content)
                ? response.content
                : Array.isArray(response?.records)
                  ? response.records
                  : [];
          setRfqOptions(records);
          setRfqError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setRfqError(true);
      })
      .finally(() => {
        if (!cancelled) setRfqLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  /* ---- Load RFQ-eligible vendors from the vendor master (fallback
     when the selected RFQ has no vendor list). */
  useEffect(() => {
    let cancelled = false;
    setVendorsLoading(true);
    setVendorsError(false);
    vendorService
      .getRfqEligibleVendors()
      .then((vendors) => {
        if (!cancelled) setMasterVendors(vendors || []);
      })
      .catch(() => {
        if (!cancelled) setVendorsError(true);
      })
      .finally(() => {
        if (!cancelled) setVendorsLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  /* ---- Track which RFQ's attachments are currently loaded to avoid
         stale-closure issues and prevent duplicate loading. ---- */
  const loadedRfqNoRef = useRef(null);

  /* ---- Load RFQ details when rfqNo changes ---- */
  useEffect(() => {
    if (!values.rfqNo) {
      /* Reset RFQ state when no RFQ is selected */
      const timer = setTimeout(() => {
        setRfq(null);
        setItems([emptyItem()]);
        setLiveQuotedVendors([]);
        setField('rfqTitle', '');
        setField('rfqDepartment', '');
        setField('rfqProject', '');
        /* Remove any RFQ-sourced attachments, keep user-uploaded ones */
        loadedRfqNoRef.current = null;
        setValues((prev) => ({
          ...prev,
          attachments: (prev.attachments || []).filter(
            (att) => att?.sourceModule !== 'RFQ'
          ),
        }));
      }, 0);
      return () => clearTimeout(timer);
    }

    /* Skip if we already loaded attachments for this exact RFQ */
    if (loadedRfqNoRef.current === values.rfqNo) return;

    let cancelled = false;

    const load = async () => {
      setLoadingRfq(true);
      try {
        const rfqData = await rfqService.getRfq(values.rfqNo);
        if (cancelled) return;

        setRfq(rfqData);

        /* ---- Prefill RFQ metadata ---- */
        setField('rfqTitle', rfqData.title || '');
        setField('rfqDepartment', rfqData.department || '');
        setField('rfqProject', rfqData.project || '');

        /* ---- Prefill items (create only; edit keeps existing items) ---- */
        if (!requestId) {
          setItems(
            (rfqData.items || []).map((item) => ({
              product: item.product || '',
              specification: item.specification || '',
              requiredQty: item.qty ?? '',
              qty: item.qty ?? '',
              uom: item.uom || 'Nos',
              hsn: item.hsn || '',
              category: item.category || '',
              itemCode: item.itemCode || '',
              rate: item.rate ?? item.expectedRate ?? '',
              discount: 0,
              gstRate: Number(rfqData.commercialTerms?.taxRate) || 18,
              deliveryDate: item.requiredDate || '',
              remarks: ''
            }))
          );
        }

        /* ---- Prefill dates and commercial defaults ---- */
        setField('validUntil', rfqData.dueDate || values.validUntil);
        setField('currency', rfqData.currency || values.currency);
        setField('paymentTerms', rfqData.commercialTerms?.paymentTerms || values.paymentTerms);
        setField('warranty', rfqData.commercialTerms?.warranty || values.warranty);

        /* ---- Auto-select vendor when only one RFQ vendor exists ---- */
        const rfqVendors = rfqData.vendors || [];
        if (!requestId) {
          if (rfqVendors.length === 1) {
            setField('vendor', rfqVendors[0]);
          } else {
            setField('vendor', '');
          }
        }

        /* ---- Load RFQ attachments into the quotation form ---- */
        try {
          const rfqAttachments = Array.isArray(rfqData.attachments) ? rfqData.attachments : [];
          const mappedRfqAttachments = rfqAttachments
            .filter((att) => att && att.name)
            .map((att) => ({
              ...att,
              id: att.id || `rfq-att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              sourceModule: 'RFQ',
              sourceReference: rfqData.rfqNo,
              dataUrl: att.dataUrl || att.downloadUrl || att.fileUrl || att.storagePath || undefined,
              name: att.name || '',
              size: Number(att.size) || 0,
              type: att.type || (att.name ? att.name.split('.').pop()?.toLowerCase() || '' : ''),
              uploadedAt: att.uploadedAt || att.createdAt || new Date().toISOString(),
              uploadedBy: att.uploadedBy || att.author || 'System',
            }));

          /* Replace RFQ-sourced attachments wholesale; keep user uploads */
          setValues((prev) => ({
            ...prev,
            attachments: [
              ...(prev.attachments || []).filter(
                (att) => att?.sourceModule !== 'RFQ'
              ),
              ...mappedRfqAttachments,
            ],
          }));
          loadedRfqNoRef.current = rfqData.rfqNo;
        } catch (attachmentError) {
          console.warn('Failed to load RFQ attachments:', attachmentError);
        }

        /* ---- Check for existing quotations on this RFQ ---- */
        try {
          const page = await rfqService.getQuotations({ rfqNo: rfqData.rfqNo, page: 1, pageSize: 100 });
          if (cancelled) return;
          const quotedEntries = (page.data || [])
            .filter((q) => [QUOTATION_STATUS.RECEIVED, QUOTATION_STATUS.ACCEPTED].includes(q.status));
          setLiveQuotedVendors(quotedEntries.map((q) => q.vendor));
          const qMap = {};
          quotedEntries.forEach((q) => { qMap[q.vendor] = q; });
          setVendorQuoteMap(qMap);
        } catch {
          if (!cancelled) { setLiveQuotedVendors([]); setVendorQuoteMap({}); }
        }
      } catch (err) {
        if (!cancelled) {
          toast.error('Failed to load RFQ');
        }
      } finally {
        if (!cancelled) setLoadingRfq(false);
      }
    };
    
    load();
    return () => { cancelled = true; };
  }, [values.rfqNo, requestId]);

  /* ---- Vendor options = RFQ's invited vendors. When the RFQ carries
     no vendor list (common with backend-created RFQs), fall back to
     the full vendor master pool so the dropdown is never empty. ---- */
  const vendorOptions = useMemo(() => {
    if (!rfq) return [];
    const rfqVendors = rfq.vendors || [];
    /* Use RFQ-specific vendors when available; otherwise fall back to
       the vendor master (all RFQ-eligible / approved vendors). */
    const sourceNames = rfqVendors.length > 0
      ? rfqVendors
      : masterVendors.map((v) => v.name).filter(Boolean);
    return sourceNames.map((name) => {
      const alreadyQuoted = liveQuotedVendors.includes(name);
      const quoteInfo = vendorQuoteMap[name];
      const label = alreadyQuoted
        ? `${name} — Already Quoted${quoteInfo?.total ? ` (${formatAmount(quoteInfo.total, quoteInfo.currency || 'INR')})` : ''}`
        : name;
      return {
        value: name,
        label,
        disabled: alreadyQuoted
      };
    });
  }, [rfq, masterVendors, liveQuotedVendors, vendorQuoteMap]);

  /* ---- Handle newly created vendor: add to RFQ list and auto-select ---- */
  const handleVendorCreated = (newVendor) => {
    if (!rfq) return;
    /* Add the new vendor to the RFQ's vendor list so it appears in the dropdown. */
    const updatedVendors = [...(rfq.vendors || []), newVendor.name];
    setRfq((prev) => ({ ...prev, vendors: updatedVendors }));
    /* Auto-select the newly created vendor. */
    setField('vendor', newVendor.name);
  };

  /* ---- RFQ options filtered to open-for-bids status ----
     When no RFQs match the eligible statuses (e.g. the backend returned
     RFQs in a different shape or all RFQs are in terminal states), fall
     back to the full list so the dropdown is never blank. */
  const openRfqOptions = useMemo(() => {
    const eligibleStatuses = [
      RFQ_STATUS.SENT,
      RFQ_STATUS.QUOTATION_RECEIVED,
      RFQ_STATUS.EVALUATION,
    ];
    const eligibleSet = new Set(eligibleStatuses.map((s) => s.toLowerCase()));
    const filtered = rfqOptions.filter((r) => {
      const status = String(r.status || '').toLowerCase();
      return eligibleSet.has(status);
    });
    return filtered.length > 0 ? filtered : rfqOptions;
  }, [rfqOptions]);

  const rfqSelectOptions = useMemo(
    () => openRfqOptions.map((option) => ({ value: option.rfqNo, label: `${option.rfqNo} — ${option.title}` })),
    [openRfqOptions]
  );

  /* ---- Item mutations ---- */
  const updateItem = (index, key, value) => setItemField(index, key, value);
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (index) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  /* ---- Financial calculations ---- */
  const totals = useMemo(
    () => calcDocumentTotals(items, Number(values.discount) || 0, Number(values.charges) || 0),
    [items, values.discount, values.charges]
  );

  const grandTotal = useMemo(
    () => round2(
      totals.total
      + (Number(values.freight) || 0)
      + (Number(values.insurance) || 0)
    ),
    [totals, values.freight, values.insurance]
  );

  const currency = values.currency || 'INR';
  const itemCount = items.filter((item) => item.product).length;
  const editing = Boolean(requestId);

  /* ---- Validation ---- */
  const validate = (strict = true) => {
    const errs = {};

    /* RFQ (always required) */
    if (!values.rfqNo) errs.rfqNo = 'RFQ is required';

    /* Vendor (always required) */
    if (!values.vendor) errs.vendor = 'Vendor is required';
    else if (liveQuotedVendors.includes(values.vendor) && !requestId) {
      errs.vendor = 'A quotation already exists for this RFQ and vendor.';
    }

    /* Date fields (strict = full save; lenient = draft) */
    if (strict) {
      if (!values.submittedOn) errs.submittedOn = 'Quotation Date is required';
      if (!values.validUntil) errs.validUntil = 'Valid Until is required';
      if (!values.currency) errs.currency = 'Currency is required';

      /* validUntil must be >= submittedOn */
      if (values.submittedOn && values.validUntil && !isDateOnOrAfter(values.validUntil, values.submittedOn)) {
        errs.validUntil = 'Valid Until must be on or after Quotation Date.';
      }
    }

    /* Items */
    if (!items.some(hasLine)) errs.items = 'Add at least one quoted line item';

    items.forEach((item, i) => {
      if (hasLine(item)) {
        if (!item.rate || Number(item.rate) <= 0) {
          errs[`item_rate_${i}`] = `Row ${i + 1}: Unit Price is required`;
        }
        if (Number(item.qty) < 0) {
          errs[`item_qty_${i}`] = `Row ${i + 1}: Quoted Qty cannot be negative`;
        }
        /* Per-item delivery date >= quotation date */
        if (strict && values.submittedOn && item.deliveryDate && !isDateOnOrAfter(item.deliveryDate, values.submittedOn)) {
          errs[`item_deliveryDate_${i}`] = `Row ${i + 1}: Delivery Date must be on or after Quotation Date`;
        }
      }
    });

    /* Discount range */
    const discountValue = Number(values.discount);
    if (!Number.isNaN(discountValue) && (discountValue < 0 || discountValue > 100)) {
      errs.discount = 'Discount must be between 0 and 100';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  /* ---- Save handler ---- */
  const handleSave = async (status = QUOTATION_STATUS.RECEIVED) => {
    const isDraft = status === QUOTATION_STATUS.PENDING;

    /* Draft: only RFQ is required */
    if (isDraft) {
      if (!values.rfqNo) {
        setErrors({ rfqNo: 'RFQ is required even for a draft' });
        return;
      }
    } else {
      /* Full save: validate everything */
      if (!validate()) return;
    }

    isDraft ? setDraftSaving(true) : setSubmitting(true);
    try {
      const payload = {
        quotationNo: userQuotationNo,
        rfqNo: values.rfqNo,
        rfqId: rfq?.id,
        rfqTitle: values.rfqTitle,
        vendor: values.vendor,
        submittedOn: values.submittedOn,
        validUntil: values.validUntil,
        currency: values.currency,
        deliveryTerms: values.deliveryTerms,
        delivery: Number(values.delivery) || 0,
        leadTime: Number(values.leadTime) || 0,
        paymentTerms: values.paymentTerms,
        warranty: values.warranty,
        discount: Number(values.discount) || 0,
        freight: Number(values.freight) || 0,
        insurance: Number(values.insurance) || 0,
        charges: Number(values.charges) || 0,
        /* The saved quotation total is derived from this tax figure, so
           omit it and the record understates itself: line totals keep
           their GST while the quotation amount silently drops it. */
        tax: totals.gstTotal,
        items: items
          .filter(hasLine)
          .map((item) => ({
            product: item.product,
            specification: item.specification,
            requiredQty: Number(item.requiredQty) || 0,
            qty: Number(item.qty) || 0,
            uom: item.uom,
            hsn: item.hsn || '',
            category: item.category || '',
            itemCode: item.itemCode || '',
            rate: Number(item.rate) || 0,
            discount: Number(item.discount) || 0,
            gstRate: Number(item.gstRate) || 0,
            deliveryDate: item.deliveryDate || '',
            remarks: item.remarks || ''
          })),
        notes: values.notes || `${values.vendor || 'Vendor'} commercial offer against ${values.rfqNo}.`,
        attachments: (values.attachments || []).map(normalizeQuotationAttachment),
        status
      };

      if (requestId) {
        await rfqService.saveQuotation({ ...payload, id: requestId });
        toast.success('Quotation updated');
        if (!isDraft) clearDraft();
      } else {
        await rfqService.saveQuotation(payload);
        toast.success(isDraft ? 'Draft saved' : `Quotation recorded for ${values.vendor}`);
        if (!isDraft) clearDraft();
      }
      navigate(returnPath || '/purchase/rfq/quotations');
    } catch (err) {
      toast.error(err?.message || 'Failed to save quotation');
    } finally {
      setSubmitting(false);
      setDraftSaving(false);
    }
  };

  const handleCancel = () => setConfirmCancelOpen(true);
  const confirmCancel = () => navigate('/purchase/rfq/quotations');
  const handleReset = () => setConfirmResetOpen(true);
  const confirmReset = () => {
    setConfirmResetOpen(false);
    setValues(buildFormValues(initialData));
    setItems(
      initialData?.items?.length
        ? initialData.items.map((item) => ({
            product: item.product || '',
            specification: item.specification || '',
            requiredQty: item.requiredQty ?? item.qty ?? '',
            qty: item.qty ?? '',
            uom: item.uom || 'Nos',
            rate: item.rate ?? '',
            discount: Number(item.discount) || 0,
            gstRate: Number(item.gstRate) || 18,
            deliveryDate: item.deliveryDate || '',
            remarks: item.remarks || ''
          }))
        : [emptyItem()]
    );
    setErrors({});
    clearDraft();
  };

  /** Auto-generated Quotation number on create; loaded from saved record on edit. Editable by user. */
  const [userQuotationNo, setUserQuotationNo] = useState(
    () => (requestId ? initialData?.quotationNo || '' : nextSeqNo(quotationsStore.all, 'QT', 'quotationNo', 0))
  );

  /* ---- Draft persistence: load on mount, debounced save on change ---- */
  const draftRestoredRef = useRef(false);
  useEffect(() => {
    if (draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    const draft = loadDraft();
    if (draft && typeof draft === 'object') {
      setValues((prev) => ({ ...prev, ...draft }));
      if (draft.items) setItems(draft.items);
      if (draft.quotationNo) setUserQuotationNo(draft.quotationNo);
      toast.info('Draft restored');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on mount
  }, []);

  useEffect(() => {
    if (values) persistDraft({ ...values, items, quotationNo: userQuotationNo });
  }, [values, items, persistDraft, userQuotationNo]);

  /* ---- Derived sidebar values ---- */
  const sidebarStatus = editing ? (initialData?.status || 'Pending') : 'Draft';

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); handleSave(QUOTATION_STATUS.RECEIVED); }}>
        <div className="pr-form-layout">
          <div className="pr-form-main">
            {/* ============ 1 · QUOTATION DETAILS ============ */}
            <Accordion
              title="Quotation Details"
              subtitle="RFQ reference, vendor and validity information"
              icon={FileText}
            >
              <div className={GRID}>
                {/* Quotation Number */}
                <FormField label="Quotation Number">
                  <TextInput
                    value={userQuotationNo}
                    onChange={(e) => setUserQuotationNo(e.target.value)}
                    className="font-semibold text-slate-700"
                    placeholder="Auto-generated"
                    ariaLabel="Quotation Number"
                  />
                </FormField>
                {/* Quotation Date — editable, defaults to today */}
                <FormField label="Quotation Date" required error={errors.submittedOn}>
                  <TextInput
                    type="date"
                    value={values.submittedOn}
                    onChange={(e) => setField('submittedOn', e.target.value)}
                    error={!!errors.submittedOn}
                  />
                </FormField>
                {/* RFQ — full width */}
                <FormField label="RFQ" required error={errors.rfqNo} className={SPAN2}>
                  <EditableMasterSelect
                    id="qtn-rfq"
                    value={values.rfqNo}
                    onChange={(value) => {
                      setField('rfqNo', value);
                      setField('vendor', '');
                    }}
                    options={rfqSelectOptions}
                    placeholder={rfqLoading ? 'Loading RFQs...' : rfqError ? 'Failed to load RFQs' : 'Select RFQ...'}
                    disabled={editing || rfqLoading}
                    error={!!errors.rfqNo}
                    editable={false}
                    ariaLabel="RFQ"
                  />
                  {rfqError && (
                    <p className="text-[11px] font-semibold text-rose-600 mt-1">Failed to load RFQs. Please try again.</p>
                  )}
                  {!rfqLoading && !rfqError && openRfqOptions.length === 0 && rfqOptions.length > 0 && (
                    <p className="text-[11px] font-semibold text-slate-500 mt-1">No eligible RFQs found</p>
                  )}
                </FormField>

                {/* RFQ info chips */}
                {rfq && (
                  <div className={`${SPAN2} flex flex-wrap gap-2 mb-1`}>
                    <span className="pr-section-chip">{rfq.rfqNo}</span>
                    {values.rfqTitle && <span className="pr-section-chip">{values.rfqTitle}</span>}
                    {values.rfqDepartment && <span className="pr-section-chip">{values.rfqDepartment}</span>}
                    {values.rfqProject && <span className="pr-section-chip">{values.rfqProject}</span>}
                  </div>
                )}

                {/* Vendor */}
                <FormField label="Vendor" required error={errors.vendor}>
                  <div className="relative">
                    {vendorsLoading ? (
                      <input
                        type="text"
                        value="Loading vendors..."
                        disabled
                        className="purchase-form-input opacity-60 cursor-wait"
                        aria-label="Vendor — loading"
                      />
                    ) : vendorsError ? (
                      <input
                        type="text"
                        value="Failed to load vendors"
                        disabled
                        className="purchase-form-input border-rose-300 text-rose-500"
                        aria-label="Vendor — error"
                      />
                    ) : (
                      <EditableMasterSelect
                        id="qtn-vendor"
                        value={values.vendor}
                        onChange={(value) => setField('vendor', value)}
                        options={vendorOptions}
                        placeholder={!rfq ? 'Select RFQ first' : (vendorOptions.length === 0 ? 'No eligible vendors found' : 'Select Vendor...')}
                        disabled={!rfq || loadingRfq || vendorOptions.length === 0}
                        error={!!errors.vendor}
                        editable={false}
                        ariaLabel="Vendor"
                      />
                    )}
                    {/* Existing quotation link — shown when a quoted vendor is selected */}
                    {values.vendor && vendorQuoteMap[values.vendor] && (
                      <button
                        type="button"
                        onClick={() => navigate(`/purchase/rfq/quotations/${vendorQuoteMap[values.vendor].id}`)}
                        className="absolute right-8 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-[#0B4A3D] hover:text-[#083D34] hover:underline flex items-center gap-0.5 cursor-pointer"
                        title={`View existing quotation from ${values.vendor}`}
                      >
                        <Eye className="w-3 h-3" /> View Quote
                      </button>
                    )}
                  </div>
                  {/* Add New Vendor link — shown when an RFQ is loaded */}
                  {rfq && !loadingRfq && (
                    <button
                      type="button"
                      onClick={() => setVendorCreateOpen(true)}
                      className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0B4A3D] hover:text-[#083D34] hover:underline cursor-pointer"
                    >
                      <UserPlus className="w-3 h-3" /> Add New Vendor
                    </button>
                  )}
                </FormField>

                {/* Valid Until — min = quotationDate */}
                <FormField label="Valid Until" required error={errors.validUntil}>
                  <TextInput
                    type="date"
                    value={values.validUntil}
                    min={values.submittedOn || undefined}
                    onChange={(e) => setField('validUntil', e.target.value)}
                    error={!!errors.validUntil}
                  />
                </FormField>

                {/* Currency */}
                <FormField label="Currency" required error={errors.currency}>
                  <EditableMasterSelect
                    id="qtn-currency"
                    value={values.currency}
                    onChange={(value) => setField('currency', value)}
                    options={currencies.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
                    placeholder="Select currency"
                    error={!!errors.currency}
                    editable={false}
                    ariaLabel="Currency"
                  />
                </FormField>
              </div>
            </Accordion>

            {/* ============ 2 · QUOTATION ITEMS ============ */}
            <Accordion
              title="Quotation Items"
              subtitle={rfq ? `Loaded from ${rfq.rfqNo} — adjust rates below` : 'Line items quoted by the vendor'}
              icon={ListChecks}
              action={itemCount > 0 ? <span className="pr-section-chip">{itemCount} item{itemCount === 1 ? '' : 's'}</span> : null}
            >
              {rfq ? (
                <>
                  <div className="qtn-items-scroll">
                    <table className="qtn-items-table">
                      <colgroup>
                        <col style={{ width: '3%' }} />
                        <col style={{ width: '13%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '6%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '9%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '4%' }} />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Item</th>
                          <th>Description</th>
                          <th className="num">Req. Qty</th>
                          <th className="num">Quoted Qty</th>
                          <th>Unit</th>
                          <th className="num">Unit Price</th>
                          <th className="num">Disc %</th>
                          <th className="num">Tax %</th>
                          <th className="num text-right">Amount</th>
                          <th>Delivery Date</th>
                          <th>Remarks</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={index} className="bg-white">
                            <td><span className="qtn-rowno">{index + 1}</span></td>
                            <td>
                              <TextInput
                                value={item.product}
                                onChange={(e) => updateItem(index, 'product', e.target.value)}
                                placeholder="Item name"
                              />
                            </td>
                            <td>
                              <TextInput
                                value={item.specification}
                                onChange={(e) => updateItem(index, 'specification', e.target.value)}
                                placeholder="Spec / details"
                              />
                            </td>
                            <td className="num">
                              <TextInput
                                type="number"
                                min="0"
                                value={item.requiredQty}
                                readOnly
                                title="Pre-filled from RFQ"
                              />
                            </td>
                            <td className="num">
                              <TextInput
                                type="number"
                                min="0"
                                value={item.qty}
                                onChange={(e) => updateItem(index, 'qty', e.target.value)}
                              />
                            </td>
                            <td>
                              <TextInput
                                value={item.uom}
                                onChange={(e) => updateItem(index, 'uom', e.target.value)}
                              />
                            </td>
                            <td className="num">
                              <TextInput
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.rate}
                                onChange={(e) => updateItem(index, 'rate', e.target.value)}
                              />
                            </td>
                            <td className="num">
                              <TextInput
                                type="number"
                                min="0"
                                max="100"
                                value={item.discount}
                                onChange={(e) => updateItem(index, 'discount', e.target.value)}
                              />
                            </td>
                            <td className="num">
                              <TextInput
                                type="number"
                                min="0"
                                value={item.gstRate}
                                onChange={(e) => updateItem(index, 'gstRate', e.target.value)}
                              />
                            </td>
                            <td className="num">
                              <span className="qtn-cell-amount">
                                {formatAmount(totals.lines[index]?.total || 0, currency)}
                              </span>
                            </td>
                            <td>
                              <TextInput
                                type="date"
                                value={item.deliveryDate}
                                min={values.submittedOn || undefined}
                                onChange={(e) => updateItem(index, 'deliveryDate', e.target.value)}
                              />
                            </td>
                            <td>
                              <TextInput
                                value={item.remarks}
                                onChange={(e) => updateItem(index, 'remarks', e.target.value)}
                                placeholder="Remarks"
                              />
                            </td>
                            <td className="text-center">
                              {items.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeItem(index)}
                                  className="qtn-remove-btn"
                                  title="Remove item"
                                  aria-label={`Remove item ${index + 1}`}
                                >
                                  <X />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    <button
                      type="button"
                      onClick={addItem}
                      className="text-xs font-semibold text-[#0B4A3D] hover:text-[#083D34] cursor-pointer"
                    >
                      + Add Item
                    </button>
                  </div>

                  {/* Inline item errors */}
                  {errors.items && (
                    <p className="text-[11px] font-semibold text-rose-600 mt-2">{errors.items}</p>
                  )}
                  {Object.keys(errors)
                    .filter((k) => k.startsWith('item_rate_') || k.startsWith('item_qty_') || k.startsWith('item_deliveryDate_'))
                    .map((key) => (
                      <p key={key} className="text-[11px] font-semibold text-rose-600 mt-1">{errors[key]}</p>
                    ))
                  }
                </>
              ) : (
                !loadingRfq && (
                  <div className="rounded-lg bg-slate-50 border border-slate-100 px-4 py-8 text-center flex flex-col items-center gap-2">
                    <Inbox className="w-5 h-5 text-slate-300" />
                    <p className="text-xs font-semibold text-slate-500">Select an RFQ to pre-fill its line items.</p>
                  </div>
                )
              )}
            </Accordion>

            {/* ============ 3 · COMMERCIAL TERMS ============ */}
            <Accordion
              title="Commercial Terms"
              subtitle="Delivery, payment and warranty"
              icon={Banknote}
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField label="Delivery Terms">
                  <EditableMasterSelect
                    id="qtn-delivery-terms"
                    value={values.deliveryTerms}
                    onChange={(value) => setField('deliveryTerms', value)}
                    options={DELIVERY_TERMS.map((t) => ({ value: t, label: t }))}
                    editable={false}
                    ariaLabel="Delivery Terms"
                  />
                </FormField>
                <FormField label="Delivery Days" error={errors.delivery}>
                  <TextInput
                    type="number"
                    min="0"
                    value={values.delivery}
                    onChange={(e) => setField('delivery', e.target.value)}
                    error={!!errors.delivery}
                  />
                </FormField>
                <FormField label="Lead Time (Days)" error={errors.leadTime}>
                  <TextInput
                    type="number"
                    min="0"
                    value={values.leadTime}
                    onChange={(e) => setField('leadTime', e.target.value)}
                    error={!!errors.leadTime}
                  />
                </FormField>
                <FormField label="Payment Terms">
                  <EditableMasterSelect
                    id="qtn-payment"
                    value={values.paymentTerms}
                    onChange={(value) => setField('paymentTerms', value)}
                    options={PAYMENT_TERMS.map((t) => ({ value: t, label: t }))}
                    editable={false}
                    ariaLabel="Payment Terms"
                  />
                </FormField>
                <FormField label="Warranty">
                  <EditableMasterSelect
                    id="qtn-warranty"
                    value={values.warranty}
                    onChange={(value) => setField('warranty', value)}
                    options={WARRANTY_TERMS.map((t) => ({ value: t, label: t }))}
                    editable={false}
                    ariaLabel="Warranty"
                  />
                </FormField>
                <FormField label="Discount (%)" error={errors.discount}>
                  <TextInput
                    type="number"
                    min="0"
                    max="100"
                    value={values.discount}
                    onChange={(e) => setField('discount', e.target.value)}
                    error={!!errors.discount}
                  />
                </FormField>
                <FormField label="Freight">
                  <TextInput
                    type="number"
                    min="0"
                    value={values.freight}
                    onChange={(e) => setField('freight', e.target.value)}
                  />
                </FormField>
                <FormField label="Insurance">
                  <TextInput
                    type="number"
                    min="0"
                    value={values.insurance}
                    onChange={(e) => setField('insurance', e.target.value)}
                  />
                </FormField>
                <FormField label="Other Charges">
                  <TextInput
                    type="number"
                    min="0"
                    value={values.charges}
                    onChange={(e) => setField('charges', e.target.value)}
                  />
                </FormField>
              </div>
            </Accordion>

            {/* ============ 4 · NOTES & ATTACHMENTS ============ */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[3fr_2fr] gap-6 items-start">
              <Accordion
                title="Notes"
                subtitle="Commercial notes from the vendor"
                icon={StickyNote}
              >
                <FormField label="Notes" hint="Terms, instructions and observations from the vendor">
                  <TextArea
                    value={values.notes}
                    onChange={(e) => setField('notes', e.target.value)}
                    rows={3}
                    placeholder="Commercial notes from the vendor..."
                  />
                </FormField>
              </Accordion>

              <Accordion
                title="Attachments"
                subtitle="Quotation and supporting documents"
                icon={Paperclip}
                action={
                  (values.attachments || []).length > 0
                    ? <span className="pr-section-chip">{values.attachments.length} file{(values.attachments || []).length === 1 ? '' : 's'}</span>
                    : null
                }
              >
                <AttachmentManager
                  attachments={values.attachments || []}
                  onChange={(next) => setField('attachments', next)}
                />
              </Accordion>
            </div>
          </div>

          {/* ===== SIDEBAR — Financial Summary + Quotation Info ===== */}
          <aside className="pr-form-side">
            {/* Financial Summary */}
            <div className="purchase-form-card">
              <div className="purchase-form-card-header">
                <h3><BadgeCheck aria-hidden="true" /> Financial Summary</h3>
              </div>
              <div className="purchase-form-card-body">
                <div className="purchase-total-row">
                  <span className="total-label">Subtotal</span>
                  <span className="total-value">{formatAmount(totals.subtotal, currency)}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Discount</span>
                  <span className="total-value">{formatAmount(totals.lineDiscountAmount + totals.discountAmount, currency)}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Tax</span>
                  <span className="total-value">{formatAmount(totals.gstTotal, currency)}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Freight</span>
                  <span className="total-value">{formatAmount(Number(values.freight) || 0, currency)}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Insurance</span>
                  <span className="total-value">{formatAmount(Number(values.insurance) || 0, currency)}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Other Charges</span>
                  <span className="total-value">{formatAmount(Number(values.charges) || 0, currency)}</span>
                </div>
                <div className="purchase-total-row purchase-total-grand">
                  <span className="total-label">Grand Total</span>
                  <span className="total-value">{formatAmount(grandTotal, currency)}</span>
                </div>
              </div>
            </div>

            {/* Quotation Info */}
            <div className="purchase-form-card">
              <div className="purchase-form-card-header">
                <h3><FileText aria-hidden="true" /> Quotation Info</h3>
              </div>
              <div className="purchase-form-card-body">
                <div className="purchase-total-row">
                  <span className="total-label">Status</span>
                  <span className="total-value">
                    <PurchaseStatusBadge status={sidebarStatus} />
                  </span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Currency</span>
                  <span className="total-value">{currency}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Vendor</span>
                  <span className="total-value">{values.vendor || '\u2014'}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Items</span>
                  <span className="total-value">{itemCount}</span>
                </div>
                <div className="purchase-total-row">
                  <span className="total-label">Valid Until</span>
                  <span className="total-value">{values.validUntil || '\u2014'}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* ===== FORM ACTIONS ===== */}
        <FormActions
          submitting={submitting}
          draftSaving={draftSaving}
          submitLabel={editing ? 'Update Quotation' : 'Save Quotation'}
          draftLabel="Save as Draft"
          showDraft={!editing}
          onDraft={() => {
            saveDraftNow({ ...values, items, quotationNo: userQuotationNo });
            handleSave(QUOTATION_STATUS.PENDING);
          }}
          onCancel={handleCancel}
          onReset={handleReset}
        />
      </form>

      {/* Confirmation dialogs */}
      <ConfirmDialog
        open={confirmCancelOpen}
        title="Discard unsaved changes?"
        message="You have unsaved changes on this quotation. Leaving now will discard them."
        confirmLabel="Leave Page"
        variant="default"
        icon={X}
        onConfirm={confirmCancel}
        onCancel={() => setConfirmCancelOpen(false)}
      />
      <ConfirmDialog
        open={confirmResetOpen}
        title="Reset quotation form?"
        message="This will clear every field you have entered on this form. Data already saved on the server is not affected."
        confirmLabel="Reset Form"
        variant="warning"
        icon={RotateCcw}
        onConfirm={confirmReset}
        onCancel={() => setConfirmResetOpen(false)}
      />

      {/* Vendor quick-create dialog */}
      <VendorQuickCreateDialog
        open={vendorCreateOpen}
        onClose={() => setVendorCreateOpen(false)}
        onCreated={handleVendorCreated}
      />
    </>
  );
}
