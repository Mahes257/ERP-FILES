import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Flag,
  Info,
  Layers,
  Loader2,
  Lock,
  Paperclip,
  Plus,
  Save,
  Upload,
} from 'lucide-react';
import CreationActionBar from '../Common/CreationActionBar';
import { Accordion, EditableMasterDropdown, FormField, SelectInput, TextArea, TextInput, useToast } from '../Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import { useFormDraft } from '../../hooks/useFormDraft';
import ClientLookup from './ClientLookup';
import CreateCustomerModal from './CreateCustomerModal';
import CurrencyDropdown from './CurrencyDropdown';
import PackingDetailsEditor from './PackingDetailsEditor';
import PendingAttachments from './PendingAttachments';
import SalesAttachments from '../SalesDetail/SalesAttachments';
import SalesItemGrid from './SalesItemGrid';
import SalesTotals from './SalesTotals';
import { cpoNo, parsePackingDetails, round2, SERIALIZERS } from '../../utils/salesHelpers';
import { normalizeSourceValue } from '../../constants/salesConstants';
import costWorkoutService from '../../services/costWorkoutService';
import quotationService from '../../services/quotationService';
import salesContractService from '../../services/salesContractService';
import salesOrderService from '../../services/salesOrderService';
import deliveryChallanService from '../../services/deliveryChallanService';
import proformaInvoiceService from '../../services/proformaInvoiceService';
import invoiceService from '../../services/invoiceService';
import paymentReceiptService from '../../services/paymentReceiptService';
import creditNoteService from '../../services/creditNoteService';
import customerService from '../../services/customerService';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

// Source-document services keyed by the query param used on the create form.
const SOURCE_SERVICES = {
  qtn: quotationService,
  sc: salesContractService,
  so: salesOrderService,
  dc: deliveryChallanService,
  pi: proformaInvoiceService,
  inv: invoiceService,
  cn: creditNoteService,
  pr: paymentReceiptService
};

const SOURCE_DOC_NO_KEY = {
  qtn: 'quotationNo',
  sc: 'scNo',
  so: 'soNo',
  dc: 'dcNo',
  pi: 'piNo',
  inv: 'invoiceNo',
  cn: 'cnNo',
  pr: 'receiptNo'
};

// Which target field receives the source document number, per (target, source).
const TARGET_REF_FIELD = {
  salesContract: { qtn: 'qtnRef' },
  salesOrder: { qtn: 'qtnRef', sc: 'scRef' },
  deliveryChallan: { so: 'soRef' },
  proformaInvoice: { so: 'sourceRef', dc: 'sourceRef' },
  // The invoice form's source reference is the `sourceRef` select (Source
  // Document), whose option values are the source document numbers.
  invoice: { pi: 'piRef', dc: 'dcRef', so: 'sourceRef' },
  paymentReceipt: { inv: 'invoiceRef' },
  creditNote: { inv: 'invoiceRef', pr: 'prRef' }
};

// Source type short codes stored in the target's `source` field (ERP values).
// These are the same codes as the Source select option values, so the edit
// form pre-selects the saved source correctly.
const TARGET_SOURCE_STRING = {
  proformaInvoice: { dc: 'dc', so: 'so' },
  invoice: { pi: 'pi', dc: 'dc', so: 'so' },
  paymentReceipt: { inv: 'inv' },
  creditNote: { inv: 'inv', pr: 'pr', so: 'so' }
};

const CLIENT_FIELDS = [
  'clientId', 'clientName', 'contactPerson', 'phone', 'email', 'gstin',
  'pan', 'city', 'state', 'pin', 'country', 'billingAddress', 'shippingAddress',
  'shipSameAsBill'
];

// ERP invoice Source Document dropdown: when the Source is "From Proforma
// Invoice" (pi) / "From Delivery Challan" (dc), the Source Document select
// lists the open documents of that type (ERP InvCreate.populateSourceRefs).
// Keys are the ERP short codes used by the Source select options.
const SOURCE_DOC_SERVICES = {
  pi: { service: proformaInvoiceService, docKey: 'piNo' },
  dc: { service: deliveryChallanService, docKey: 'dcNo' },
  // CPO is a valid invoice source (see INVOICE_SOURCES): the Source Document
  // dropdown lists the orders so a prefilled CPO reference is a real option.
  so: { service: salesOrderService, docKey: 'soNo' }
};

// Normalize source-document line items into the form item shape (used when a
// Source Document is selected on the ERP invoice form).
const mapSourceItems = (items) =>
  (Array.isArray(items) ? items : []).map((it) => ({
    productId: it.productId || null,
    productName: it.productName || it.description || it.name || '',
    description: it.description || it.productName || '',
    sku: it.sku || it.drawingNo || '',
    hsn: it.hsn || '',
    unit: it.unit || it.uom || '',
    qty: Number(it.qty ?? it.quantity) || 1,
    rate: Number(it.rate ?? it.unitPrice ?? it.estimatedCost) || 0,
    discountPct: Number(it.discountPct) || 0,
    gstRate: Number(it.gstRate ?? it.gst) || 0,
    amount: Number(it.amount) || 0
  }));

// Compact field types get a narrower grid cell (quantities, checkboxes,
// signature stamps — at most a quarter of the card); ordinary text / select /
// email / country / date / currency fields take a half-width column (two of
// the four desktop columns), so header pairs like "Invoice No | Invoice Date",
// shipping pairs like "Country of Origin | Final Destination" and the
// "Currency | Tax Treatment" row fill a row cleanly; textareas / list editors
// always span the full card width. Fields with an explicit config `grid` class
// keep it (the old 2-col markers `sm:col-span-2` full / `sm:col-span-1` half
// are translated to the 4-column grid so nothing regresses).
const COMPACT_FIELD_TYPES = new Set(['number', 'checkbox', 'stampUpload']);

function fieldGridClass(field) {
  if (field.grid) {
    // Markers from the old 2-col grid keep their relative width in the 4-col
    // grid: `sm:col-span-2` (full) → full width, `sm:col-span-1` (half) → half.
    if (field.grid === 'sm:col-span-2') return 'sm:col-span-2 xl:col-span-4';
    if (field.grid === 'sm:col-span-1') return 'sm:col-span-1 xl:col-span-2';
    return field.grid;
  }
  if (field.type === 'textarea' || field.type === 'listEditor') return 'sm:col-span-2 xl:col-span-4';
  if (COMPACT_FIELD_TYPES.has(field.type)) return 'sm:col-span-1';
  return 'sm:col-span-1 xl:col-span-2';
}

function fieldControl(field, value, onChange, dynamicOptions = {}, extra = {}) {
  const shared = { value: value ?? '', onChange: (e) => onChange(e.target.value) };
  switch (field.type) {
    case 'textarea':
      return <TextArea rows={field.rows || 3} {...shared} placeholder={field.placeholder || ''} />;
    case 'select':
      if (field.dynamicSource === 'costWorkouts') {
        return (
          <SelectInput {...shared} aria-label={field.label}>
            <option value="">{field.placeholder || '-- None --'}</option>
            {(dynamicOptions.costWorkouts || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectInput>
        );
      }
      if (field.dynamicSource === 'salesContracts') {
        return (
          <SelectInput {...shared} aria-label={field.label}>
            <option value="">{field.placeholder || '-- Select Contract --'}</option>
            {(dynamicOptions.salesContracts || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectInput>
        );
      }
      if (field.dynamicSource === 'salesOrders') {
        // Customer Purchase Order selector (Proforma Invoice): lists the open
        // CPOs; selecting one loads its exact line items + customer details.
        return (
          <SelectInput {...shared} aria-label={field.label}>
            <option value="">{field.placeholder || '-- Select CPO --'}</option>
            {(dynamicOptions.salesOrders || []).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </SelectInput>
        );
      }
      if (field.type === 'currency') {
        // Complete international currency list, searchable by code or name.
        return <CurrencyDropdown value={value ?? ''} onChange={onChange} placeholder="Currency" />;
      }
      if (field.masterKey) {
        // Master-data dropdown: search, add, edit and delete values, persisted
        // in MySQL via /masters/{key}. Rendered in a portal because the form
        // sections live inside overflow-hidden accordions.
        return (
          <EditableMasterDropdown
            masterKey={field.masterKey}
            value={value ?? ''}
            onChange={onChange}
            placeholder={field.placeholder || `Select ${field.label}`}
            portal
          />
        );
      }
      {
        // ERP Source selects use an empty value for "Direct"; when an option
        // already owns value="" (e.g. Direct), skip the placeholder so the
        // saved Direct value displays its real label instead of "Select …".
        const hasEmptyOption = (field.options || []).some((opt) =>
          opt && typeof opt === 'object' ? opt.value === '' : opt === ''
        );
        return (
          <SelectInput {...shared}>
            {!hasEmptyOption && <option value="">Select {field.label}</option>}
            {field.options.map((opt) =>
              opt && typeof opt === 'object' ? (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ) : (
                <option key={opt} value={opt}>{opt}</option>
              )
            )}
          </SelectInput>
        );
      }
    case 'currency': {
      // Complete international currency list, searchable by code or name.
      return <CurrencyDropdown value={value ?? ''} onChange={onChange} placeholder={field.placeholder || 'Currency'} />;
    }
    case 'country': {
      // Export invoice country fields — searchable master-data dropdown
      // (persisted via /masters/countries), free to add new countries.
      return (
        <EditableMasterDropdown
          masterKey="countries"
          value={value ?? ''}
          onChange={onChange}
          placeholder={field.placeholder || 'Select Country'}
          portal
        />
      );
    }
    case 'listEditor': {
      // Repeatable keyed rows (export Packing Details entries). The value is an
      // array of objects; rows can be added/removed inline.
      return (
        <PackingDetailsEditor
          value={value}
          onChange={onChange}
          packageTypes={field.packageTypes || []}
        />
      );
    }
    case 'stampUpload': {
      // Company stamp / seal upload (PNG / JPG, up to 2MB) — stored as a data
      // URL and shown in the printed document. Matches the ERP Authorization
      // block of the reference export proforma / packing list.
      return (
        <label className="block cursor-pointer">
          {value ? (
            <div className="relative inline-block">
              <img src={value} alt="Company Stamp" className="max-h-24 rounded-lg border border-slate-200" />
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange('');
                }}
                className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-rose-600 text-white text-xs flex items-center justify-center shadow"
                title="Remove stamp"
              >
                ×
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-emerald-500/60 transition-colors">
              <Upload className="w-5 h-5 text-slate-400" />
              <span className="text-xs font-semibold text-slate-600">Click to upload stamp</span>
              <span className="text-[10px] text-slate-400">PNG, JPG up to 2MB</span>
            </div>
          )}
          <input
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (!file) return;
              if (file.size > 2 * 1024 * 1024) {
                return;
              }
              const reader = new FileReader();
              reader.onload = () => onChange(reader.result);
              reader.readAsDataURL(file);
            }}
          />
        </label>
      );
    }
    case 'checkbox':
      // `invert` flips the checkbox semantics (ERP Proforma Invoice: the
      // "Shipping address different from billing" toggle is checked when the
      // shipping address DIFFERS, i.e. when shipSameAsBill is false).
      return (
        <label
          className={`flex items-center gap-2 cursor-pointer ${
            field.invert ? 'text-[13px] font-normal text-slate-700 pt-1' : 'text-xs font-semibold text-slate-600 pt-2'
          }`}
        >
          <input
            type="checkbox"
            checked={field.invert ? value === false : !!value}
            onChange={(e) => onChange(field.invert ? !e.target.checked : e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-[#0B4A3D] focus:ring-[#0B4A3D]"
          />
          {field.label}
        </label>
      );
    // ERP invoice Source Document select (populated from the chosen Source).
    case 'sourceSelect':
      return (
        <SelectInput {...shared} aria-label={field.label}>
          <option value="">—</option>
          {(extra.sourceDocs || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </SelectInput>
      );
    // ERP read-only auto-filled value (GSTIN/PAN/Email/Phone on the Proforma
    // Invoice General Information card): a non-editable grey chip.
    case 'display':
      return (
        <div className="w-full rounded-lg bg-slate-50 border border-slate-200/80 px-3 py-2 text-[13px] text-slate-600 min-h-[38px] flex items-center">
          {value || '—'}
        </div>
      );
    case 'hidden':
      return null;
    default:
      return (
        <TextInput
          type={field.type || 'text'}
          {...shared}
          placeholder={field.placeholder || ''}
          readOnly={field.readOnly}    // ERP proforma PI Number: auto-generated readonly field shown in bold
    // grey (ERP background #f3f4f6, font-weight 700). Only the Proforma
    // Invoice form marks a field readOnly, so nothing else is affected.
          className={field.readOnly ? 'font-bold text-slate-800 bg-slate-100 cursor-not-allowed' : ''}
        />
      );
  }
}

/**
 * Generic create/edit page for the Sales Execution modules.
 * props.config -> SALES_FORM_CONFIGS[moduleKey]
 */
// backToList (optional) is the "Back" destination when it differs from
// navigateToList. navigateToList doubles as the base path for record URLs and
// post-save redirects, so the back target is passed separately — it points at
// the module's list inside the Sales Execution hub, which is the page the user
// sees with the breadcrumb + module tab nav.
export default function SalesFormPage({ config, service, navigateToList, backToList }) {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);

  const emptyForm = () => {
    const form = { status: config.statuses[0] || 'draft' };
    form[config.dateKey] = new Date().toISOString().split('T')[0];
    // ERP behaviour: some modules auto-fill date fields on load (e.g. DC
    // pre-fills Dispatch Date = today, Expected Delivery = +5 days).
    if (config.defaults) {
      Object.entries(config.defaults).forEach(([key, fn]) => {
        if (form[key] == null) form[key] = typeof fn === 'function' ? fn() : fn;
      });
    }
    return form;
  };

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);

  // Packing List: Total Quantity / Net Weight / Gross Weight are computed from
  // the line items whenever they change (the Package Details card + right-side
  // Totals card stay in sync — never hard-coded). Gross Weight falls back to
  // the package-level value when rows carry no gross weights.
  useEffect(() => {
    if (!config.packingTotalsFromItems) return undefined;
    const real = items.filter((it) => !it.rowType || it.rowType === 'item');
    const totalQty = real.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const netWeight = real.reduce((sum, it) => sum + (Number(it.netWeight) || 0), 0);
    const grossFromItems = real.reduce((sum, it) => sum + (Number(it.grossWeight) || 0), 0);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((prev) => {
      const patch = {
        totalQty: round2(totalQty),
        netWeight: round2(netWeight)
      };
      if (grossFromItems > 0) patch.grossWeight = round2(grossFromItems);
      if (Object.keys(patch).every((k) => Number(prev[k] || 0) === Number(patch[k]))) return prev;
      return { ...prev, ...patch };
    });
    return undefined;
  }, [items, config.packingTotalsFromItems]);

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
  const [dynamicOptions, setDynamicOptions] = useState({});
  const [pendingFiles, setPendingFiles] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [clientRefreshKey, setClientRefreshKey] = useState(0);
  const [sourceDocs, setSourceDocs] = useState([]);
  // Historical revisions (older version of an edited document) are read-only:
  // the form renders its data for review but saving is blocked, and the
  // backend rejects every mutation of a non-latest revision.
  const [historical, setHistorical] = useState(false);

  // ---- form draft persistence (new records only) ----
  const draftRestoredRef = useRef(false);
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    config.moduleKey, id || null,
    { isEdit, enabled: config.draftPersistence !== false, debounceMs: 500 }
  );

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Invoice Type selector options (Export Invoice header action) — found from
  // the module's own section config so nothing is hard-coded here.
  const invoiceTypeField = config.sections
    .flatMap((s) => s.fields)
    .find((f) => f.key === 'invoiceType');

  // The Item Details card can sit at a different main-column position per form
  // state (Export Invoice: after Export & Shipment Details; Domestic: right
  // after the Invoice Details card — the original layout).
  const effectiveItemsAfterIndex =
    typeof config.itemsAfterIndex === 'function' ? config.itemsAfterIndex(form) : config.itemsAfterIndex;

  // ERP invoice Source change: switching the Source resets the Source Document
  // selection and its options (ERP InvCreate.populateSourceRefs).
  const handleSourceChange = (value) => {
    setField('source', value);
    setSourceDocs([]);
    setField('sourceRef', '');
  };

  // ERP invoice Source Document dropdown options: populated from the chosen
  // source (Proforma Invoices / Delivery Challans), like ERP populateSourceRefs.
  useEffect(() => {
    const hasSourceSelect = config.sections.some((s) => s.fields.some((f) => f.type === 'sourceSelect'));
    if (!hasSourceSelect) return undefined;
    const cfg = SOURCE_DOC_SERVICES[form.source];
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
            const client = doc.clientName || doc.customerName || doc.deliveredTo || '';
            return { value: no, label: `${no} - ${client}`.trim(), doc };
          })
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [form.source, config]);

  // ERP invoice loadFromSource: selecting a Source Document auto-fills the
  // customer details, addresses, bank details, terms, remarks and line items.
  const handleSourceRefChange = (value) => {
    setField('sourceRef', value);
    const doc = sourceDocs.find((o) => o.value === value)?.doc;
    if (!doc) return;
    const patch = {};
    CLIENT_FIELDS.forEach((key) => {
      if (doc[key] != null && doc[key] !== '') patch[key] = doc[key];
    });
    if (doc.notes) patch.notes = doc.notes;
    if (doc.terms || doc.termsAndConditions) patch.terms = doc.terms || doc.termsAndConditions;
    if (doc.bankName) patch.bankName = doc.bankName;
    if (doc.bankAccount || doc.bankAcct) patch.bankAccount = doc.bankAccount || doc.bankAcct;
    if (doc.bankIfsc) patch.bankIfsc = doc.bankIfsc;
    if (doc.bankBranch) patch.bankBranch = doc.bankBranch;
    if (doc.bankUpi) patch.bankUpi = doc.bankUpi;
    // Export Invoice: the BUYER / CONSIGNEE blocks follow the source document's
    // customer (same auto-fill as picking the customer in the lookup).
    if (config.moduleKey === 'invoice') {
      if (doc.clientName) {
        patch.buyerName = doc.clientName;
        patch.consigneeName = doc.clientName;
      }
      if (doc.billingAddress) {
        patch.buyerAddress = doc.billingAddress;
        patch.consigneeAddress = doc.billingAddress;
      }
      if (doc.country) {
        patch.buyerCountry = doc.country;
        patch.consigneeCountry = doc.country;
      }
    }
    setForm((prev) => ({ ...prev, ...patch }));
    if (config.showItems && Array.isArray(doc.items)) {
      setItems(mapSourceItems(doc.items));
    }
  };

  // ERP loadFromCostWorkout: populate the Source Cost Workout select and, when a
  // workout is chosen, auto-fill the client, source CPR and line items.
  useEffect(() => {
    const dynamic = config.sections
      .flatMap((s) => s.fields)
      .find((f) => f.dynamicSource === 'costWorkouts');
    if (!dynamic) return undefined;
    let cancelled = false;
    costWorkoutService
      .listCws({ page: 0, size: 100 })
      .then((res) => {
        if (cancelled) return;
        const list = parseListResponse(res);
        setDynamicOptions((prev) => ({
          ...prev,
          costWorkouts: list.map((cw) => ({
            value: cw.cwNo || String(cw.id || ''),
            label: cw.cwNo || `CW-${cw.id || ''}`,
            cw
          }))
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config]);

  // ERP Contract No selection on the Proforma Invoice: picking a Sales Contract
  // auto-fills the customer details from that contract (resetting the previous
  // contract's values so stale customer data never remains). No contract
  // selected → nothing is auto-populated.
  useEffect(() => {
    const dynamic = config.sections
      .flatMap((s) => s.fields)
      .find((f) => f.dynamicSource === 'salesContracts');
    if (!dynamic) return undefined;
    let cancelled = false;
    salesContractService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const list = parseListResponse(res);
        setDynamicOptions((prev) => ({
          ...prev,
          salesContracts: list.map((sc) => ({
            value: sc.scNo || String(sc.id || ''),
            label: sc.scNo ? `${sc.scNo}${sc.clientName ? ` - ${sc.clientName}` : ''}` : `SC-${sc.id || ''}`,
            sc
          }))
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config]);

  // ERP Customer Purchase Order selector on the Proforma Invoice: the CPO is
  // the source of truth for ITEM DETAILS and customer details. The dropdown
  // lists the open CPOs; selecting one loads its exact line items and fills
  // the customer block (see applySalesOrder).
  useEffect(() => {
    const dynamic = config.sections
      .flatMap((s) => s.fields)
      .find((f) => f.dynamicSource === 'salesOrders');
    if (!dynamic) return undefined;
    let cancelled = false;
    salesOrderService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (cancelled) return;
        const list = parseListResponse(res);
        setDynamicOptions((prev) => ({
          ...prev,
          salesOrders: list.map((so) => ({
            value: so.soNo || String(so.id || ''),
            label: so.soNo ? `${cpoNo(so.soNo)}${so.clientName ? ` - ${so.clientName}` : ''}` : `CPO-${so.id || ''}`,
            id: so.id,
            so
          }))
        }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [config]);

  // CPO selection on the Proforma Invoice: the Customer Purchase Order is the
  // source of truth for ITEM DETAILS. Loads the CPO's exact line items
  // (description, SKU, HSN, UOM, quantity, rate, GST — never modified) and
  // fills the customer block (name, id, billing/shipping address, contacts)
  // from the same CPO. The linked CPO number is persisted in the existing
  // sourceRef field with source='so' (the ERP Source Document relationship),
  // so it survives save/edit/view and shows in the Source Document input too.
  const applySalesOrder = async (value) => {
    if (!value) {
      setField('sourceRef', '');
      return;
    }
    setField('sourceRef', value);
    const option = (dynamicOptions.salesOrders || []).find((o) => o.value === value);
    let so = option?.so || null;
    // The list projection has no line items — fetch the CPO detail to get them.
    if (option?.id && (!so || !Array.isArray(so.items) || so.items.length === 0)) {
      try {
        const res = await salesOrderService.get(option.id);
        so = res?.data ?? res ?? {};
      } catch {
        // Keep whatever the list already gave us.
      }
    }
    if (!so || (!so.soNo && !so.clientName && !Array.isArray(so.items))) return;
    // Customer details come from the selected CPO — reset the customer block
    // first so no other source's (contract/previous selection) data lingers.
    const patch = { sourceRef: value, source: 'so' };
    CLIENT_FIELDS.filter((key) => key !== 'shipSameAsBill').forEach((key) => {
      patch[key] = '';
    });
    CLIENT_FIELDS.filter((key) => key !== 'shipSameAsBill').forEach((key) => {
      const v = so[key];
      if (v != null && v !== '') patch[key] = v;
    });
    if (!patch.shippingAddress && patch.billingAddress) patch.shippingAddress = patch.billingAddress;
    if (patch.clientName) {
      patch.buyerName = patch.clientName;
      patch.consigneeName = patch.clientName;
    }
    if (patch.billingAddress) {
      patch.buyerAddress = patch.billingAddress;
      patch.consigneeAddress = patch.billingAddress;
    }
    setForm((prev) => ({ ...prev, ...patch }));
    // ITEM DETAILS come from the CPO — exact quantities, no manual re-entry.
    const soItems = Array.isArray(so.items) && so.items.length > 0 ? so.items : option?.so?.items;
    if (Array.isArray(soItems) && soItems.length > 0) {
      setItems(mapSourceItems(soItems));
    }
  };

  const applySalesContract = (value) => {
    if (!value) {
      setField('contractNo', '');
      return;
    }
    const option = (dynamicOptions.salesContracts || []).find((o) => o.value === value);
    setField('contractNo', value);
    if (!option?.sc) return;
    const sc = option.sc;
    const patch = { contractNo: value };
    // Reset the customer block first so the previous contract's customer
    // details never linger, then fill from the newly selected contract.
    // (shipSameAsBill is a UI toggle, not contract-driven — left untouched.)
    CLIENT_FIELDS.filter((key) => key !== 'shipSameAsBill').forEach((key) => {
      patch[key] = '';
    });
    CLIENT_FIELDS.filter((key) => key !== 'shipSameAsBill').forEach((key) => {
      const v = sc[key];
      if (v != null && v !== '') patch[key] = v;
    });
    if (!patch.shippingAddress && patch.billingAddress) patch.shippingAddress = patch.billingAddress;
    // Contract Date comes from the selected contract itself.
    if (sc.contractDate) patch.contractDate = String(sc.contractDate).slice(0, 10);
    // Reference document BUYER block — populated from the selected contract's
    // customer (the same customer that auto-fills the form).
    if (patch.clientName) patch.buyerName = patch.clientName;
    if (patch.billingAddress) patch.buyerAddress = patch.billingAddress;
    // CONSIGNEE block — the contract's customer + address are the consignee.
    if (patch.clientName) patch.consigneeName = patch.clientName;
    if (patch.billingAddress) patch.consigneeAddress = patch.billingAddress;
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const applyCostWorkout = (value) => {
    if (!value) {
      setField('sourceCw', '');
      setField('sourceCpr', '');
      return;
    }
    const option = (dynamicOptions.costWorkouts || []).find((o) => o.value === value);
    setField('sourceCw', value);
    if (!option?.cw) return;
    const cw = option.cw;
    if (cw.clientName) setField('clientName', cw.clientName);
    if (cw.client) setField('clientName', cw.client);
    if (cw.contactPerson) setField('contactPerson', cw.contactPerson);
    if (cw.email) setField('email', cw.email);
    if (cw.phone) setField('phone', cw.phone);
    if (cw.billingAddress || cw.address) setField('billingAddress', cw.billingAddress || cw.address);
    if (cw.shippingAddress) setField('shippingAddress', cw.shippingAddress);
    if (cw.sourceCpr || cw.prNo) setField('sourceCpr', cw.sourceCpr || cw.prNo);
    if (Array.isArray(cw.items) && cw.items.length > 0) {
      setItems(
        cw.items.map((it) => ({
          productId: it.productId || null,
          productName: it.productName || it.description || '',
          description: it.description || it.productName || '',
          sku: it.sku || it.drawingNo || '',
          hsn: it.hsn || '',
          unit: it.unit || it.uom || '',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate || it.estimatedCost) || 0,
          discountPct: Number(it.discountPct) || 0,
          gstRate: Number(it.gstRate) || 18,
          amount: Number(it.amount) || 0
        }))
      );
    }
  };

  // ERP qtnShipCopyBill: when "Same as Billing" is checked, copy billing
  // address/city/state/PIN into the shipping fields.
  const handleShipSameAsBill = (checked) => {
    setField('shipSameAsBill', checked);
    if (checked) {
      setForm((prev) => ({
        ...prev,
        shipSameAsBill: true,
        shippingAddress: prev.billingAddress || prev.shippingAddress || '',
        shippingCity: prev.billingCity || prev.shippingCity || '',
        shippingState: prev.billingState || prev.shippingState || '',
        shippingPin: prev.billingPin || prev.shippingPin || ''
      }));
    }
  };

  // Auto-fill from a selected customer (mirrors the original ERP's CustomerLookup)
  const handleClientSelect = (customer) => {
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
    setField('country', customer.country || 'India');
    setField('billingAddress', customer.billingAddress || '');
    setField('shippingAddress', customer.shippingAddress || customer.billingAddress || '');
    // Reference document BUYER block — populated from the selected customer.
    setField('buyerName', customer.businessName || '');
    setField('buyerAddress', customer.billingAddress || '');
    setField('buyerCountry', customer.country || '');
    // CONSIGNEE block — the selected customer + address are the consignee.
    setField('consigneeName', customer.businessName || '');
    setField('consigneeAddress', customer.billingAddress || '');
    setField('consigneeCountry', customer.country || '');
    if (!form.paymentTerms) setField('paymentTerms', customer.paymentTerms || '');
  };

  // ERP export invoice: "Same as Buyer" copies the BUYER (BILL TO) block into
  // the CONSIGNEE (SHIP TO) block. Unchecking lets the user enter a different
  // consignee without touching the buyer data.
  const handleConsigneeSameAsBuyer = (checked) => {
    setField('consigneeSameAsBuyer', checked);
    if (checked) {
      setForm((prev) => ({
        ...prev,
        consigneeSameAsBuyer: true,
        consigneeName: prev.buyerName || prev.consigneeName || '',
        consigneeAddress: prev.buyerAddress || prev.consigneeAddress || '',
        consigneeCountry: prev.buyerCountry || prev.consigneeCountry || ''
      }));
    }
  };

  // ERP export proforma: "Same as Consignee" on the BUYER card copies the
  // CONSIGNEE (SHIP TO) block into the BUYER (IF OTHER THAN CONSIGNEE) block.
  // Unchecking lets the user enter a separate buyer without touching the
  // consignee data.
  const handleBuyerSameAsConsignee = (checked) => {
    setField('buyerSameAsConsignee', checked);
    if (checked) {
      setForm((prev) => ({
        ...prev,
        buyerSameAsConsignee: true,
        buyerName: prev.consigneeName || prev.buyerName || '',
        buyerAddress: prev.consigneeAddress || prev.buyerAddress || '',
        buyerCountry: prev.consigneeCountry || prev.buyerCountry || ''
      }));
    }
  };

  // ERP "Create New Customer": persist a new customer, refresh the lookup and
  // auto-fill the form with the newly created customer's details.
  const handleClientCreated = (customer) => {
    setClientRefreshKey((k) => k + 1);
    handleClientSelect(customer);
  };

  // Prefill from a source document query param (e.g. ?inv=12, or ?from=inv&id=12
  // for the Payment Receipt form). Loads the source document and copies the
  // client details, line items, source reference and (where the ERP stores it)
  // the source type into the target form.
  useEffect(() => {
    if (isEdit) return undefined;
    const sourceKey = ['qtn', 'sc', 'so', 'dc', 'pi', 'inv', 'cn', 'pr'].find((k) => searchParams.get(k));
    const from = searchParams.get('from');
    const source = sourceKey || (from && SOURCE_SERVICES[from] ? from : null);
    const sourceId = source ? (sourceKey ? searchParams.get(sourceKey) : searchParams.get('id')) : null;
    if (!source || !sourceId || !SOURCE_SERVICES[source]) return undefined;
    let cancelled = false;
    // suppressGlobalError: a source document that no longer resolves (deleted
    // CPO / stale conversion link) is reported in place and leaves this valid
    // create route usable, instead of replacing the page with the global error
    // view — the same rule the other conversion prefills follow.
    SOURCE_SERVICES[source]
      .get(sourceId, { suppressGlobalError: true })
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        const srcNo = raw[SOURCE_DOC_NO_KEY[source]] || raw.id || String(sourceId);
        const patch = { sourceRef: srcNo };
        const refField = TARGET_REF_FIELD[config.moduleKey]?.[source];
        if (refField) patch[refField] = srcNo;
        const srcString = TARGET_SOURCE_STRING[config.moduleKey]?.[source];
        if (srcString) patch.source = srcString;
        CLIENT_FIELDS.forEach((key) => {
          if (raw[key] != null && raw[key] !== '') patch[key] = raw[key];
        });
        // BUYER + CONSIGNEE blocks follow the source document's customer.
        if (config.moduleKey === 'proformaInvoice' && patch.clientName) {
          patch.buyerName = patch.clientName;
          patch.consigneeName = patch.clientName;
          if (patch.billingAddress) {
            patch.buyerAddress = patch.billingAddress;
            patch.consigneeAddress = patch.billingAddress;
          }
        }
        // Proforma Invoice raised from a Customer Purchase Order: carry the
        // header values the one-click conversion used to write onto the saved
        // invoice (currency, payment / delivery terms, terms, remarks,
        // additional charges) plus the CPO's customer-PO reference, so the
        // pre-filled form matches it — still fully editable before saving.
        if (config.moduleKey === 'proformaInvoice' && source === 'so') {
          const headerMap = {
            currency: raw.currency,
            paymentTerms: raw.paymentTerms,
            termsOfDelivery: raw.deliveryTerms,
            terms: raw.terms,
            notes: raw.remarks,
            referenceNo: raw.customerPo,
            charges: raw.charges
          };
          Object.entries(headerMap).forEach(([key, value]) => {
            if (value != null && value !== '') patch[key] = value;
          });
          // A CPO stores a flat discount; the Proforma Invoice is percentage-
          // based — same derivation the conversion applied (never a new rule).
          const cpoSubTotal = Number(raw.subTotal) || 0;
          if (cpoSubTotal > 0 && Number(raw.discount) > 0) {
            patch.discountPct = round2((Number(raw.discount) * 100) / cpoSubTotal);
          }
        }
        // Delivery Challan raised from a Customer Purchase Order: the CPO's
        // contract reference, expected delivery date, notes and terms come
        // across (transport / dispatch stay with the challan). The CPO number
        // is already in soRef via TARGET_REF_FIELD. Everything is editable.
        if (config.moduleKey === 'deliveryChallan' && source === 'so') {
          const headerMap = {
            scRef: raw.scRef,
            deliveryDate: raw.deliveryDate ? String(raw.deliveryDate).slice(0, 10) : '',
            notes: raw.remarks,
            terms: raw.terms
          };
          Object.entries(headerMap).forEach(([key, value]) => {
            if (value != null && value !== '') patch[key] = value;
          });
        }
        // Export/Domestic Invoice raised from a Customer Purchase Order: keep
        // the same reference fields the one-click conversion persisted
        // (source='so' + sourceRef=CPO no), plus the CPO's contract and the
        // customer's PO reference. Nothing financial is copied that the invoice
        // recalculates itself (the item rows drive the totals).
        if (config.moduleKey === 'invoice' && source === 'so') {
          const headerMap = {
            contractNo: raw.scRef,
            referenceNo: raw.customerPo,
            dueDate: raw.deliveryDate ? String(raw.deliveryDate).slice(0, 10) : '',
            notes: raw.remarks
          };
          Object.entries(headerMap).forEach(([key, value]) => {
            if (value != null && value !== '') patch[key] = value;
          });
        }
        // Credit Note raised from a Customer Purchase Order: the source code is
        // a valid Credit Note source, and the refund opens at the CPO total
        // (the same amount the one-click conversion wrote) — editable.
        if (config.moduleKey === 'creditNote' && source === 'so') {
          patch.source = 'so';
          if (raw.grandTotal != null) patch.refundAmount = Number(raw.grandTotal);
          patch.reasonDetail = `Credit Note generated from Customer Purchase Order ${srcNo}`;
        }
        // Payment Receipt: a CPO is not an invoice, so no invoice reference is
        // invented; the customer block and the amount received follow the CPO.
        if (config.moduleKey === 'paymentReceipt' && source === 'so') {
          if (raw.grandTotal != null) patch.amount = Number(raw.grandTotal);
          patch.remarks = `Payment receipt generated from Customer Purchase Order ${srcNo}`;
        }
        if (config.moduleKey === 'paymentReceipt' && source === 'inv' && raw.grandTotal != null) {
          patch.amount = Number(raw.grandTotal);
        }
        if (config.moduleKey === 'creditNote' && source === 'inv' && raw.grandTotal != null) {
          patch.refundAmount = Number(raw.grandTotal);
        }
        setForm((prev) => ({ ...prev, ...patch }));
        if (config.showItems && Array.isArray(raw.items) && raw.items.length > 0) {
          setItems(
            raw.items.map((it) => ({
              productId: it.productId || null,
              productName: it.productName || it.description || '',
              description: it.description || it.productName || '',
              sku: it.sku || it.drawingNo || '',
              hsn: it.hsn || '',
              unit: it.unit || it.uom || '',
              qty: Number(it.qty) || 1,
              rate: Number(it.rate || it.estimatedCost) || 0,
              discountPct: Number(it.discountPct) || 0,
              gstRate: Number(it.gstRate) || 18,
              amount: Number(it.amount) || 0
            }))
          );
        }
      })
      .catch(() => {
        if (cancelled) return;
        toast.error(`Source document ${sourceId} could not be loaded — the form was left empty.`);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, searchParams, config.moduleKey, config.showItems]);

  // Client actions menu deep-link (?clientId=): pre-fill the customer details
  // from the saved Client record (same auto-fill as picking it in the lookup).
  useEffect(() => {
    if (isEdit) return undefined;
    const clientId = searchParams.get('clientId');
    if (!clientId) return undefined;
    let cancelled = false;
    customerService
      .get(clientId)
      .then((res) => {
        if (cancelled) return;
        const customer = res?.data ?? res ?? {};
        const patch = {};
        const map = {
          clientId: customer.id,
          clientName: customer.businessName,
          contactPerson: customer.contactPerson,
          phone: customer.phone,
          email: customer.email,
          gstin: customer.gstin,
          pan: customer.pan,
          city: customer.billingCity,
          state: customer.billingState,
          pin: customer.billingPin,
          country: customer.country,
          billingAddress: customer.billingAddress,
          shippingAddress: customer.shippingAddress || customer.billingAddress
        };
        CLIENT_FIELDS.forEach((key) => {
          if (map[key] != null && map[key] !== '') patch[key] = map[key];
        });
        // BUYER + CONSIGNEE blocks — same customer + address.
        if (customer.businessName) patch.buyerName = customer.businessName;
        if (customer.billingAddress) patch.buyerAddress = customer.billingAddress;
        if (customer.country) patch.buyerCountry = customer.country;
        if (customer.businessName) patch.consigneeName = customer.businessName;
        if (customer.billingAddress) patch.consigneeAddress = customer.billingAddress;
        if (customer.country) patch.consigneeCountry = customer.country;
        if (customer.paymentTerms && !patch.paymentTerms) patch.paymentTerms = customer.paymentTerms;
        setForm((prev) => ({ ...prev, ...patch }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit, searchParams]);

  // ERP qtnValidateNumber: quotation no must be a non-empty valid number string
  const validate = () => {
    if (config.docNoKey === 'quotationNo' && !String(form.quotationNo || '').trim()) {
      toast.error('Quotation No is required.');
      return false;
    }
    if (config.showClient && !form.clientName) {
      toast.error('Please select or enter a Client name.');
      return false;
    }
    if (config.showItems && items.length === 0) {
      toast.error('Add at least one item.');
      return false;
    }
    if (config.moduleKey === 'paymentReceipt' && (form.amount == null || Number(form.amount) <= 0)) {
      toast.error('Please enter a valid Amount Received.');
      return false;
    }
    // Export Invoice: module-specific required-field checks (Invoice No, Exporter,
    // Buyer, Consignee, Country of Origin / Final Destination, Currency, items,
    // quantity / rate sanity) without touching the domestic workflow.
    if (config.additionalValidation && !config.additionalValidation(form, items, toast)) {
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!isEdit) {
      let cancelled = false;
      service
        .getNextNumber()
        .then((res) => {
          if (cancelled) return;
          const field = { quotationNo: 'quotationNo', scNo: 'scNo', soNo: 'soNo', dcNo: 'dcNo', piNo: 'piNo', invoiceNo: 'invoiceNo', receiptNo: 'receiptNo', cnNo: 'cnNo' }[config.docNoKey];
          const value = res?.data?.[field] || res?.data?.nextNumber;
          if (value) setForm((prev) => ({ ...prev, [config.docNoKey]: value }));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [isEdit, service, config.docNoKey]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    service
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        setHistorical(raw.latestRevision === false);
        const toForm = {};
        const DATE_KEYS = new Set(['validTill', 'validity', 'dueDate', 'deliveryDate', 'dispatchDate', 'validUntil']);
        const JSON_KEYS = new Set(config.jsonFields || []);
        Object.keys(raw).forEach((key) => {
          if (typeof raw[key] === 'string' && (DATE_KEYS.has(key) || /Date$/.test(key))) {
            toForm[key] = raw[key].slice(0, 10);
          } else if (key === 'items') {
            return;
          } else if (JSON_KEYS.has(key)) {
            // JSON TEXT columns (e.g. packingDetails) come back as strings;
            // parse them back into arrays for the inline editors.
            toForm[key] = parsePackingDetails(raw[key]);
          } else {
            toForm[key] = raw[key];
          }
        });
        toForm.shipSameAsBill = !!raw.shipSameAsBill;
        // Source is stored as an ERP short code (''/dc/so/pi/inv/pr) or, for
        // records created before the short-code alignment, a legacy display
        // string ('From Sales Order' (legacy), 'Direct', ...). Normalize so the Source
        // select pre-selects the saved value on edit.
        if (toForm.source != null) {
          toForm.source = normalizeSourceValue(toForm.source);
        }
        // Flat-discount modules (DC — ERP behaviour) store a flat ₹ amount in
        // the `discount` field; the form's discount input binds to `discountPct`.
        // Percentage-discount modules (PI — ERP proforma Discount %) load the
        // stored discountPct directly so an edit-save never shrinks it.
        if (config.percentageDiscount) {
          toForm.discountPct = raw.discountPct != null && raw.discountPct !== '' ? Number(raw.discountPct) : 0;
        } else if (config.flatDiscount) {
          toForm.discountPct = raw.discount != null && raw.discount !== '' ? Number(raw.discount) : 0;
        }
        setForm({ status: config.statuses[0] || 'draft', ...toForm });
        setItems(Array.isArray(raw.items) ? raw.items : []);
        setAttachments(Array.isArray(raw.attachments) ? raw.attachments : []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load document');
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
  }, [id, isEdit, service, config.statuses, config.flatDiscount, config.percentageDiscount, config.jsonFields, toast]);

  // ---- restore unsaved draft from localStorage (new records only) ----
  useEffect(() => {
    if (isEdit || draftRestoredRef.current) return;
    // A source-document conversion (?so=<id>, ?sc=, ?pi= …) opens with the
    // source's own data prefilled: restoring an unrelated local draft on top
    // would replace that authoritative prefill, so the restore is skipped and
    // the source prefill stands (the draft stays saved until the next plain
    // create).
    const hasSourcePrefill = ['qtn', 'sc', 'so', 'dc', 'pi', 'inv', 'cn', 'pr'].some((k) => searchParams.get(k))
      || Boolean(searchParams.get('from') && searchParams.get('id'));
    if (hasSourcePrefill) return;
    const draft = restoreDraft();
    if (draft) {
      if (draft.form) setForm((prev) => ({ ...prev, ...draft.form }));
      if (draft.items && draft.items.length > 0) setItems(draft.items);
    }
    draftRestoredRef.current = true;
  }, [isEdit, restoreDraft]);

  // ---- persist draft to localStorage (new records only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    if (!form.clientName && (!items || items.length === 0)) return;
    persistDraft({ form, items });
  }, [form, items, isEdit, persistDraft]);

  const reloadAttachments = () => {
    service
      .getAttachments(id)
      .then((res) => setAttachments(Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : []))
      .catch(() => {});
  };

  const save = async ({ draft = false, submit = false, stay = false, view = false, quiet = false } = {}) => {
    if (!validate()) return;
    setSaving(true);
    try {
      const serialize = SERIALIZERS[config.moduleKey];
      const payload = serialize(form, items);
      const res = isEdit ? await service.update(id, payload) : await service.create(payload, draft);
      const created = res?.data ?? {};
      const no = created[config.docNoKey] || form[config.docNoKey] || '';
      if (!isEdit && created?.id && pendingFiles.length > 0) {
        const results = await service.uploadMany(created.id, pendingFiles);
        const failed = results.filter((r) => !r.ok).length;
        const ok = results.length - failed;
        if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
        if (failed > 0) {
          const firstFailed = results.find((r) => !r.ok);
          toast.error(
            failed === results.length && firstFailed?.error?.message
              ? firstFailed.error.message
              : `${failed} attachment(s) failed to upload`
          );
        }
      }
      if (submit && created?.id) {
        await service.postAction(created.id, 'send');
      }
      // Clear draft on successful save
      clearFormDraft();
      const isRevision = isEdit && created?.id && Number(created.id) !== Number(id);
      toast.success(
        submit
          ? `${no} sent`
          : isEdit
            ? isRevision
              ? `${no} saved as new revision`
              : `${no} updated`
            : `${no} ${draft ? 'saved as draft' : 'created'}`
      );
      if (stay) {
        setForm(emptyForm());
        setItems([]);
        setPendingFiles([]);
        setAttachments([]);
        const next = await service.getNextNumber();
        const field = { quotationNo: 'quotationNo', scNo: 'scNo', soNo: 'soNo', dcNo: 'dcNo', piNo: 'piNo', invoiceNo: 'invoiceNo', receiptNo: 'receiptNo', cnNo: 'cnNo' }[config.docNoKey];
        if (next?.data?.[field]) setForm((prev) => ({ ...prev, [config.docNoKey]: next.data[field] }));
      } else if (isRevision) {
        // Edit created a new revision (BASE(N)) — open it so the user sees the
        // saved version. The previous version stays untouched in MySQL.
        navigate(`${navigateToList || `/${config.listRoute}`}/${created.id}`);
      } else if (view && created?.id) {
        // ERP proforma "Submit" / "Update & Close": open the saved document.
        // `config.recordBasePath` lets a module whose records live under a
        // different route open the established View page (the Packing List
        // shares the Proforma Invoice data model and is viewed at
        // /proforma-invoices/:id — its list path /sales-orders/packing-list/:id
        // has no route).
        navigate(`${config.recordBasePath || navigateToList || `/${config.listRoute}`}/${created.id}`);
      } else if (!quiet) {
        navigate(navigateToList || `/${config.listRoute}`);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Export Invoice: the Preview button generates a professional A4 export
  // invoice document from the CURRENT form state (config.buildPreview) and opens
  // it in a new window — no save required, nothing persisted.
  const handlePreview = () => {
    if (!config.buildPreview) return;
    const html = config.buildPreview({ ...form }, items);
    const win = window.open('', '_blank');
    if (!win) {
      toast.error('Please allow pop-ups to preview the invoice.');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // ERP positioning: some modules (DC, PI) render the Item Details card in the
  // main column at a fixed index instead of the right sidebar.
  const renderItemsCard = () => {
    // The item grid can follow the form state (Export Invoice: export variant
    // when Invoice Type is Export / SEZ, classic GST grid for Domestic).
    const variant = typeof config.itemsVariant === 'function' ? config.itemsVariant(form) : config.itemsVariant;
    const isExport = variant === 'export';
    const lutNoIgst = String(form.taxTreatment || '').toLowerCase().includes('lut');
    return (
      <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900">
            <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
              <Layers className="w-3.5 h-3.5" />
            </span>
            Item Details
          </h3>
        </div>
        <div className="p-3">
          {lutNoIgst && variant !== 'packingList' && (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#0B4A3D]" />
              <p className="text-[11px] font-semibold text-[#0B4A3D]">
                Supply meant for export under LUT without payment of IGST
              </p>
            </div>
          )}
          <SalesItemGrid
            items={items}
            setItems={setItems}
            proforma={variant === 'proforma'}
            proformaExport={variant === 'proformaExport'}
            packingList={variant === 'packingList'}
            invoice={variant === 'invoice'}
            exportMode={isExport}
            currency={form.currency || 'EUR'}
            taxType={form.taxType || 'CGST + SGST'}
          />
        </div>
      </div>
    );
  };

  // ERP proforma footer button labels (config.footerLabels), with generic
  // defaults preserved so every other module keeps its current buttons.
  const labels = {
    cancel: config.footerLabels?.cancel ?? 'Back',
    draft: config.footerLabels?.draft ?? 'Save As Draft',
    createNew: config.footerLabels?.createNew ?? 'Save & Create New',
    primaryCreate: config.footerLabels?.primaryCreate ?? 'Save & Continue',
    primaryEdit: config.footerLabels?.primaryEdit ?? 'Update',
    secondaryEdit: config.footerLabels?.secondaryEdit
  };

  // ERP proforma: Attachments is the 7th main-column section (after Remarks);
  // other modules keep it as a full-width card below the form grid.
  const renderAttachmentsCard = () => (
    <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4">
      <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900 mb-3">
        <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
          <Paperclip className="w-3.5 h-3.5" />
        </span>
        Attachments
      </h3>
      {attachmentsLoading ? (
        <div className="flex items-center justify-center py-10 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading attachments...
        </div>
      ) : isEdit ? (
        <SalesAttachments
          service={service}
          docId={id}
          attachments={attachments}
          onChanged={reloadAttachments}
        />
      ) : (
        <PendingAttachments files={pendingFiles} onChange={setPendingFiles} />
      )}
    </div>
  );

  const renderClientLookup = (section) => {
    // ERP invoice (section.lookupRowFields): the customer lookup shares its row
    // with a sibling field (e.g. Select Customer + Due Date).
    const lookupRowFields = (section.lookupRowFields || [])
      .map((key) => section.fields.find((f) => f.key === key))
      .filter(Boolean);
    const rowKeys = lookupRowFields.map((f) => f.key);

    const lookupCell = (
      <FormField
        label={config.clientLookupLabel || 'Client'}
        required={config.clientRequired !== false}
        // ERP proforma/invoice Customer fields show no helper hint; other
        // modules keep the default hint (backward compatible via clientLookupHint).
        hint={
          config.clientLookupHint !== undefined
            ? config.clientLookupHint
            : 'Type to search, or select an existing Client to auto-fill billing, shipping, GST, payment terms and contact details'
        }
      >
        <ClientLookup
          value={form.clientName}
          onChange={(name) => setField('clientName', name)}
          onAutoFill={handleClientSelect}
          label={config.clientLookupLabel || 'Client'}
          placeholder={config.clientLookupPlaceholder}
          refreshKey={clientRefreshKey}
          portal
        />
      </FormField>
    );

    return (
      <div className="space-y-3">
        {/* Fields marked `beforeLookup` render above the Client lookup (ERP PI:
            PI Number + Date sit at the top of the same General Information card). */}
        {section.fields.filter((f) => f.beforeLookup && f.type !== 'hidden' && (!f.visible || f.visible(form))).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {section.fields
              .filter((f) => f.beforeLookup && f.type !== 'hidden' && (!f.visible || f.visible(form)))
              .map((field) => (
                <FormField
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  className={fieldGridClass(field)}
                >
                  {fieldControl(
                    field,
                    form[field.key],
                    (value) => {
                      // Header rows on the Proforma Invoice Details card can
                      // carry dynamic sources too (Contract No → auto-fill the
                      // customer/consignee details from the selected contract;
                      // Customer Purchase Order → load the CPO's exact items
                      // and customer details — the CPO is the item source of
                      // truth for the Proforma Invoice).
                      if (field.dynamicSource === 'costWorkouts') return applyCostWorkout(value);
                      if (field.dynamicSource === 'salesContracts') return applySalesContract(value);
                      if (field.dynamicSource === 'salesOrders') return applySalesOrder(value);
                      if (field.type === 'checkbox' && field.key === 'shipSameAsBill') return handleShipSameAsBill(value);
                      if (field.type === 'sourceSelect') return handleSourceRefChange(value);
                      return setField(field.key, value);
                    },
                    dynamicOptions,
                    { sourceDocs }
                  )}
                </FormField>
              ))}
          </div>
        )}
        {lookupRowFields.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="sm:col-span-1 xl:col-span-2">{lookupCell}</div>
            {lookupRowFields.map((field) => (
              <FormField key={field.key} label={field.label} required={field.required} className={fieldGridClass(field)}>
                {fieldControl(field, form[field.key], (value) => setField(field.key, value), dynamicOptions, { sourceDocs })}
              </FormField>
            ))}
          </div>
        ) : (
          lookupCell
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          {section.fields
            .filter((f) => !f.beforeLookup && !rowKeys.includes(f.key) && f.type !== 'hidden' && (!f.visible || f.visible(form)))
            .map((field) =>
              field.hideLabel ? (
                <div key={field.key} className={fieldGridClass(field)}>
                  {fieldControl(field, form[field.key], (value) => setField(field.key, value), dynamicOptions, { sourceDocs })}
                </div>
              ) : (
                <FormField
                  key={field.key}
                  label={field.label}
                  required={field.required}
                  className={fieldGridClass(field)}
                >
                  {fieldControl(field, form[field.key], (value) => setField(field.key, value), dynamicOptions, { sourceDocs })}
                </FormField>
              )
            )}
        </div>
        {config.clientCreate && (
          <button
            type="button"
            className="flex items-center gap-1 text-[13px] font-medium text-[#0B4A3D] hover:underline mt-2 cursor-pointer bg-transparent border-none p-0 font-sans"
            onClick={() => setCustomerModalOpen(true)}
          >
            <Plus className="w-3.5 h-3.5" /> Create New Customer
          </button>
        )}
        {/* Grouped blocks inside the same card (Proforma Invoice Details:
            EXPORTER / MANUFACTURER, BUYER, CONSIGNEE). */}
        {(section.groups || []).map((group) => renderGroup(section, group))}
      </div>
    );
  };

  // Groups consecutive config sections flagged `sideBySide` into paired rows so
  // the shared renderer can place two cards side-by-side (Proforma Invoice's
  // Shipping / Export Information + Destination & Terms). Sections flagged
  // `sidebar: true` render in the right column and are skipped here. Other
  // sections stay single. `visible` / `sideBySide` / `sidebar` may be functions
  // of the current form (Export Invoice sections show only for Export / SEZ).
  const sectionVisible = (section) => !section.visible || section.visible(form);
  const sectionSidebar = (section) => (typeof section.sidebar === 'function' ? section.sidebar(form) : section.sidebar);
  const sectionSideBySide = (section) => (typeof section.sideBySide === 'function' ? section.sideBySide(form) : section.sideBySide);
  const buildSectionRows = () => {
    const rows = [];
    let group = null;
    config.sections.forEach((section, index) => {
      if (!sectionVisible(section) || sectionSidebar(section)) return;
      if (sectionSideBySide(section)) {
        if (!group) group = [];
        group.push({ section, index });
      } else {
        if (group) {
          rows.push({ type: 'grid', items: group });
          group = null;
        }
        rows.push({ type: 'single', section, index });
      }
    });
    if (group) rows.push({ type: 'grid', items: group });
    return rows;
  };

  // Shared responsive field grid used by plain sections, client-lookup
  // sections and the grouped blocks inside the card. Columns are auto-assigned
  // by field type (compact fields get a narrow cell, textareas span full
  // width) so short fields never stretch across half the card.
  const renderFieldGrid = (section, fields) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {fields
        .filter((f) => f.type !== 'hidden' && (!f.visible || f.visible(form)))
        .map((field) =>
          field.hideLabel ? (
            <div key={field.key} className={fieldGridClass(field)}>
              {fieldControl(
                field,
                form[field.key],
                (value) => {
                  if (field.dynamicSource === 'costWorkouts') return applyCostWorkout(value);
                  if (field.dynamicSource === 'salesContracts') return applySalesContract(value);
                  if (field.dynamicSource === 'salesOrders') return applySalesOrder(value);
                  if (field.type === 'checkbox' && field.key === 'shipSameAsBill') return handleShipSameAsBill(value);
                  if (field.type === 'checkbox' && field.key === 'consigneeSameAsBuyer') return handleConsigneeSameAsBuyer(value);
                  if (field.type === 'checkbox' && field.key === 'buyerSameAsConsignee') return handleBuyerSameAsConsignee(value);
                  if (field.type === 'sourceSelect') return handleSourceRefChange(value);
                  if (field.key === 'source' && section.fields.some((f) => f.type === 'sourceSelect')) {
                    return handleSourceChange(value);
                  }
                  return setField(field.key, value);
                },
                dynamicOptions,
                { sourceDocs }
              )}
            </div>
          ) : (
            <FormField
              key={field.key}
              label={field.label}
              required={field.required}
              className={fieldGridClass(field)}
            >
              {fieldControl(
                field,
                form[field.key],
                (value) => {
                  if (field.dynamicSource === 'costWorkouts') return applyCostWorkout(value);
                  if (field.dynamicSource === 'salesContracts') return applySalesContract(value);
                  if (field.dynamicSource === 'salesOrders') return applySalesOrder(value);
                  if (field.type === 'checkbox' && field.key === 'shipSameAsBill') return handleShipSameAsBill(value);
                  if (field.type === 'checkbox' && field.key === 'consigneeSameAsBuyer') return handleConsigneeSameAsBuyer(value);
                  if (field.type === 'checkbox' && field.key === 'buyerSameAsConsignee') return handleBuyerSameAsConsignee(value);
                  if (field.type === 'sourceSelect') return handleSourceRefChange(value);
                  if (field.key === 'source' && section.fields.some((f) => f.type === 'sourceSelect')) {
                    return handleSourceChange(value);
                  }
                  return setField(field.key, value);
                },
                dynamicOptions,
                { sourceDocs }
              )}
            </FormField>
          )
        )}
    </div>
  );

  // Renders a labelled sub-block inside a card (section.groups) — used for the
  // EXPORTER / MANUFACTURER, BUYER and CONSIGNEE blocks of the Proforma
  // Invoice Details card.
  const renderGroup = (section, group) => (
    <div key={group.title} className="border-t border-slate-100 pt-3 mt-3">
      <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2.5">
        {group.icon && <group.icon className="w-3.5 h-3.5 text-slate-400" />}
        {group.title}
      </h4>
      {renderFieldGrid(section, group.fields)}
    </div>
  );

  const renderSection = (section) => (
    <Accordion key={section.title} title={section.title} icon={section.icon} defaultOpen>
      {section.clientLookup ? (
        renderClientLookup(section)
      ) : (
        <>
          {renderFieldGrid(section, section.fields)}
          {(section.groups || []).map((group) => renderGroup(section, group))}
        </>
      )}
    </Accordion>
  );

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      <div className="mx-auto w-full" style={{ maxWidth: 1440 }}>
      {bulkBanner}
      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>Sales</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Sales Execution</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>{config.title ? (config.title.endsWith('s') ? config.title : `${config.title}s`) : ''}</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="text-slate-600">{isEdit ? 'Edit' : 'New'}</span>
      </div>

      {/* Historical revision notice: older versions of an edited document are
          immutable. The backend also rejects any mutation of a non-latest
          revision, so this banner is defence-in-depth for direct URL access. */}
      {historical && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <Lock className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
          <div className="text-xs">
            <p className="font-bold text-amber-800">Historical revision — read-only</p>
            <p className="text-amber-700 font-medium mt-0.5">
              This version is preserved in history and can no longer be edited. Use View / Preview / Print / PDF to review it.
            </p>
          </div>
        </div>
      )}

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#0B4A3D]" />
            {isEdit ? `Edit ${config.title}` : `Create ${config.title}`}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {config.headerActions && invoiceTypeField && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600 bg-surface border border-slate-200 pl-2.5 pr-1 py-1.5 rounded-lg">
              <span className="text-slate-400 font-semibold whitespace-nowrap">Invoice Type</span>
              <div className="w-44">
                <SelectInput
                  value={form.invoiceType || ''}
                  onChange={(e) => setField('invoiceType', e.target.value)}
                  aria-label="Invoice Type"
                >
                  {(invoiceTypeField.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </SelectInput>
              </div>
            </div>
          )}
          {config.headerActions && (
            <button
              type="button"
              onClick={handlePreview}
              disabled={saving}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit disabled:opacity-50"
            >
              <Eye className="w-3.5 h-3.5 text-slate-400" /> Preview
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(backToList || navigateToList || `/${config.listRoute}`)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
          >
            <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to List
          </button>
        </div>
      </div>

      {/* ===== TWO-COLUMN LAYOUT ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 min-w-0 space-y-3">
          {buildSectionRows().map((row) =>
            row.type === 'grid' ? (
              <Fragment key={row.items.map((item) => item.section.title).join(' + ')}>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
                  {row.items.map(({ section }) => (
                    <Fragment key={section.title}>{renderSection(section)}</Fragment>
                  ))}
                </div>
                {/* ERP positioning: render Item Details in the main column after
                    a grouped section (config.itemsAfterIndex) — full width. */}
                {config.showItems &&
                  row.items.some(({ index }) => effectiveItemsAfterIndex === index) &&
                  renderItemsCard()}
              </Fragment>
            ) : (
              <Fragment key={row.section.title}>
                {renderSection(row.section)}
                {config.showItems && effectiveItemsAfterIndex === row.index && renderItemsCard()}
              </Fragment>
            )
          )}
          {/* ERP proforma: Attachments renders as the 7th main-column section. */}
          {config.showAttachments && config.attachmentsInColumn && renderAttachmentsCard()}
        </div>

        {/* ===== RIGHT SIDEBAR: items (default) + totals ===== */}
        <div className="min-w-0">
          {config.showItems && effectiveItemsAfterIndex == null && (
            <div className="mb-3">{renderItemsCard()}</div>
          )}

          {config.showTotals && (
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4">
              <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900 mb-3">
                <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                  <Info className="w-3.5 h-3.5" />
                </span>
                Totals
              </h3>
              <SalesTotals
                items={items}
                discountPct={form.discountPct ?? 0}
                charges={form.charges ?? 0}
                freight={form.freight ?? 0}
                insurance={form.insurance ?? 0}
                onDiscountChange={(v) => setField('discountPct', v)}
                onChargesChange={(v) => setField('charges', v)}
                showRoundOff={config.showRoundOff}
                flatDiscount={config.flatDiscount}
                percentageDiscount={config.percentageDiscount}
                showWords={config.showWords}
                currency={form.currency || 'INR'}
                exportMode={['export', 'sez'].includes(form.invoiceType)}
                taxTreatment={form.taxTreatment}
                packingList={config.itemsVariant === 'packingList'}
                totalPackages={form.totalPackages ?? 0}
                packageGrossWeight={form.grossWeight ?? 0}
              />
            </div>
          )}

          {/* ERP proforma: Status card in the right sidebar (below Totals). */}
          {config.sidebarStatus && (
            <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-4 mt-3">
              <h3 className="flex items-center gap-2.5 text-sm font-bold text-slate-900 mb-3">
                <span className="p-1.5 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                  <Flag className="w-3.5 h-3.5" />
                </span>
                Status
              </h3>
              <div className="px-3 py-1.5 bg-slate-100 rounded-lg text-xs font-semibold text-slate-600">
                {form.status || 'Draft'}
              </div>
            </div>
          )}

          {/* ERP proforma: Remarks + Terms & Conditions cards in the right
              sidebar below Status (config sections flagged `sidebar`). */}
          {config.sections
            .filter((s) => sectionVisible(s) && sectionSidebar(s))
            .map((section) => (
              <div key={section.title} className="mt-3">
                {renderSection(section)}
              </div>
            ))}
        </div>
      </div>

      {/* ===== ATTACHMENTS (full width below the grid unless rendered in-column) ===== */}
      {config.showAttachments && !config.attachmentsInColumn && (
        <div className="mt-6">{renderAttachmentsCard()}</div>
      )}

      {/* ===== STICKY FOOTER (ERP standard creation action bar) ===== */}
      <CreationActionBar
        showBackToList={false}
        onCancel={() => navigate(backToList || navigateToList || `/${config.listRoute}`)}
        onSaveDraft={!isEdit ? () => save({ draft: true }) : null}
        draftLabel={labels.draft}
        onSaveNew={!isEdit && config.showSaveNew !== false ? () => save({ stay: true }) : null}
        saveNewLabel={labels.createNew}
        extraRight={
          isEdit && labels.secondaryEdit ? (
            <button
              type="button"
              onClick={() => save({ quiet: true })}
              disabled={saving || historical}
              className="erp-create-btn"
            >
              <Save className="w-3.5 h-3.5" /> {labels.secondaryEdit}
            </button>
          ) : null
        }
        onSave={() => save(config.submitToView ? { view: true } : {})}
        saveLabel={isEdit ? labels.primaryEdit : labels.primaryCreate}
        onSaveContinue={config.showSaveContinue ? () => save({ view: true }) : null}
        onSubmit={
          config.canSend && !isEdit && config.showSend !== false ? () => save({ submit: true }) : null
        }
        submitLabel="Save &amp; Send"
        disabled={saving}
        locked={historical}
      />

      {/* ERP "Create New Customer": only rendered when the module opts in via
          config.clientCreate (e.g. Delivery Challan client-create link). */}
      {config.clientCreate && (
        <CreateCustomerModal
          open={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
          onCreated={handleClientCreated}
        />
      )}
      </div>
    </div>
  );
}
