import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  FileText,
  Info,
  Layers,
  Link as LinkIcon,
  Paperclip,
  Package,
  Plus,
  Search,
  StickyNote,
  Users,
  X,
} from 'lucide-react';
import { CreationActionBar, FormField, SelectInput, TextArea, TextInput, useToast } from '../../components/Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import ClientLookup from '../../components/SalesForm/ClientLookup';
import CreateCustomerModal from '../../components/SalesForm/CreateCustomerModal';
import CurrencyDropdown from '../../components/SalesForm/CurrencyDropdown';
import { computeTotals, cpoNo, isHsnVisible, round2, SERIALIZERS } from '../../utils/salesHelpers';
import { quotationToCpoForm, quotationToCpoItems } from '../../utils/quotationToCpoPrefill';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import salesOrderService from '../../services/salesOrderService';
import salesContractService from '../../services/salesContractService';
import leadService from '../../services/leadService';
import customerService from '../../services/customerService';
import quotationService from '../../services/quotationService';
import CpoItemsGrid from '../../components/SalesForm/CpoItemsGrid';
import { cpoConversionQuery, cpoItemTarget, CPO_CONVERT_TARGETS } from '../../utils/cpoItemConversion';
import { PENDING_APPROVAL_REFRESH_EVENT } from '../../utils/pendingApproval';
import SalesAttachments from '../../components/SalesDetail/SalesAttachments';
import PendingAttachments from '../../components/SalesForm/PendingAttachments';

function parseListResponse(response) {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response?.data)) return response.data;
  if (Array.isArray(response?.data?.content)) return response.data.content;
  if (Array.isArray(response?.content)) return response.content;
  return [];
}

/**
 * Sales Order create/edit page — visual 1:1 with the ERP reference
 * (sales-order-create.html) using the Purchase-module design system.
 *
 *   1. "Sales Order" card
 *      - grid-2: Sales Order No, Customer PO
 *      - grid-3: Order Date, Lead No (text), Sales Contract Ref (text + Pick)
 *      - grid-3: Quotation Ref (readonly text), Status, Currency
 *      - Client & Order Information (ONE unified section): client party
 *        details on the left (Client lookup, Client Name, Contact Person,
 *        Email|Phone, City|State text, Billing|Shipping, GSTIN|PAN,
 *        Payment Terms text) and the order party details on the right
 *        (Sales Executive text, Delivery Date, Delivery Terms text)
 *   2. "Action / Release Instructions" card (Instructions textarea)
 *   3. "Items" card (SO-specific grid: Item Description, HSN/SAC, UOM, Qty,
 *      Rate, Disc%, GST%, Amount, Total; toolbar Add New Line / Add
 *      Description / Duplicate)
 *   4. "Attachments" card
 *   5. "Order Terms & Conditions" card (Terms & Conditions)
 *   6. "Remarks / Internal Notes" card (Remarks textarea)
 *   Sidebar: Totals (Sub Total, CGST, SGST, IGST, Discount flat ₹, Charges
 *   flat ₹, Grand Total, words) + Linked Documents.
 *
 * E-Actions are NOT part of this form — they live on the dedicated
 * E-Actions page under Customer Purchase Orders. The `eActions` key is not
 * serialized, so saving the CPO never touches the E-Action table.
 *
 * The Sales Contract Ref field is a text input with a search button opening
 * a searchable contract picker fed from the Sales Contract module; selecting
 * one auto-populates the order exactly like the ERP's contract-picker intent
 * (client, contacts, addresses, terms, taxes, remarks and items). All control
 * types (text / date / readonly / select / textarea) match the ERP page.
 */
const SO_STATUS_OPTIONS = ['Draft', 'Pending Review', 'Approved', 'In Progress', 'Completed', 'Cancelled'];

const HEADER_FIELDS = [
  { key: 'soNo', label: 'Customer Purchase Order No', type: 'text', placeholder: 'CPO-YYYY-XXXXXX', required: true },
  { key: 'customerPo', label: 'Customer PO', type: 'text' }
];

const HEADER_ROW2 = [
  { key: 'orderDate', label: 'Order Date', type: 'date', required: true },
  { key: 'leadNo', label: 'Lead No', type: 'text', placeholder: 'LEAD-2026-XXXX' },
  { key: 'scRef', label: 'Sales Contract Ref', type: 'scPicker', placeholder: 'SC-2026-XXXX' }
];

const HEADER_ROW3 = [
  { key: 'qtnRef', label: 'Quotation Ref', type: 'text', placeholder: 'QT-2026-XXXX', readOnly: true },
  { key: 'status', label: 'Status', type: 'select', options: SO_STATUS_OPTIONS },
  { key: 'currency', label: 'Currency', type: 'currency', required: true }
];

const ORDER_FIELDS = [
  { key: 'salesExecutive', label: 'Sales Executive', type: 'text', placeholder: 'Assigned user' },
  { key: 'deliveryDate', label: 'Delivery Date', type: 'date' },
  { key: 'deliveryTerms', label: 'Delivery Terms', type: 'text', placeholder: 'e.g. FOB' }
];

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner';

function numberToWordsINR(n) {
  n = Math.round(Number(n) || 0);
  if (n === 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const convert = (num) => {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? ' ' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' Hundred' + (num % 100 ? ' ' + convert(num % 100) : '');
    if (num < 100000) return convert(Math.floor(num / 1000)) + ' Thousand' + (num % 1000 ? ' ' + convert(num % 1000) : '');
    if (num < 10000000) return convert(Math.floor(num / 100000)) + ' Lakh' + (num % 100000 ? ' ' + convert(num % 100000) : '');
    return convert(Math.floor(num / 10000000)) + ' Crore' + (num % 10000000 ? ' ' + convert(num % 10000000) : '');
  };
  return convert(n) + ' Rupees Only';
}

function fieldControl(field, value, onChange, openScPicker) {
  const shared = { value: value ?? '', onChange: (e) => onChange(e.target.value) };
  switch (field.type) {
    case 'textarea':
      return <TextArea rows={field.rows || 3} {...shared} placeholder={field.placeholder || ''} />;
    case 'scPicker':
      return (
        <div className="flex gap-2">
          <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || 'SC-2026-XXXX'}
            className={INPUT_CLS}
            aria-label="Sales Contract Ref"
          />
          <button
            type="button"
            onClick={openScPicker}
            title="Select Sales Contract"
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-200 transition-colors cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" /> Pick
          </button>
        </div>
      );
    case 'currency':
      return <CurrencyDropdown value={value ?? ''} onChange={onChange} placeholder="Currency" />;
    case 'hidden':
      return null;
    case 'select':
      return (
        <SelectInput {...shared}>
          <option value="">Select {field.label}</option>
          {field.options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </SelectInput>
      );
    default:
      return <TextInput type={field.type || 'text'} {...shared} placeholder={field.placeholder || ''} readOnly={field.readOnly} />;
  }
}

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3 select-none">
      <div className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <span className="text-sm font-bold text-slate-900">{title}</span>
        {subtitle && <p className="text-[11px] text-slate-400 font-medium mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function SalesOrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const isEdit = Boolean(id);
  const navigateToList = '/sales-orders';
  // "Back" always opens the existing Customer Purchase Orders list WITH the
  // Sales Execution hub chrome (breadcrumb + module tab nav), regardless of how
  // this form was reached. navigateToList stays the bare module path because it
  // is also the base for record URLs and post-save redirects.
  const backToList = SALES_EXEC_HUB_TABS.customerPO;

  const emptyForm = () => {
    const form = { status: SO_STATUS_OPTIONS[0] || 'draft', hsnView: true, taxType: 'CGST + SGST' };
    form.orderDate = new Date().toISOString().split('T')[0];
    return form;
  };

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  // Attachments: the saved set (edit mode) plus files staged before the
  // document exists (create mode — uploaded right after the CPO is saved).
  const [attachments, setAttachments] = useState([]);
  const [pendingFiles, setPendingFiles] = useState([]);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({
    moduleKey: 'salesOrder',
    setForm,
    setItems,
    enabled: !isEdit
  });
  const [headerGstRateInit, setHeaderGstRateInit] = useState(18);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  // WO / PO conversion bookkeeping: the in-flight guard stops a double click
  // from saving (and creating) the same CPO twice, and the created id lets a
  // retry — or the next item of the same new CPO — update the document this
  // action already persisted instead of creating another one.
  const convertingRef = useRef(false);
  const createdCpoIdRef = useRef(null);
  // In-flight guard for the footer save actions: `setSaving(true)` only disables
  // the buttons on the next render, so a fast double click could otherwise fire
  // a second create. A pending save owns the record until it settles.
  const savingRef = useRef(false);
  // Historical revisions (older versions of an edited order) are read-only.
  const [historical, setHistorical] = useState(false);
  const [contractOptions, setContractOptions] = useState([]);
  const [quotationOptions, setQuotationOptions] = useState([]);
  const [scPickerOpen, setScPickerOpen] = useState(false);
  const [scQuery, setScQuery] = useState('');
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [clientRefreshKey, setClientRefreshKey] = useState(0);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Every field just updates state; the Sales Contract picker handles auto-fill.
  const handleFieldChange = (field, value) => setField(field.key, value);

  // Feed the Sales Contract picker (approved/available contracts) and the
  // Linked Documents quotation lookup from their modules.
  useEffect(() => {
    let cancelled = false;
    salesContractService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (!cancelled) setContractOptions(parseListResponse(res));
      })
      .catch(() => {});
    quotationService
      .list({ page: 0, size: 200 })
      .then((res) => {
        if (!cancelled) setQuotationOptions(parseListResponse(res));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredContracts = useMemo(() => {
    const q = scQuery.trim().toLowerCase();
    if (!q) return contractOptions;
    return contractOptions.filter((c) => {
      const d = String(c.contractDate || c.date || c.scDate || '').toLowerCase();
      return (
        String(c.scNo || '').toLowerCase().includes(q) ||
        String(c.clientName || c.client || '').toLowerCase().includes(q) ||
        d.includes(q)
      );
    });
  }, [contractOptions, scQuery]);

  // ERP contract-picker style population: fill client, terms, remarks and
  // items from the selected Sales Contract.
  const applyContract = (value) => {
    const sc = contractOptions.find((c) => String(c.scNo ?? c.id) === String(value));
    setField('scRef', String(value));
    if (!sc) return;
    setField('clientId', sc.clientId ?? '');
    setField('clientName', sc.clientName || sc.client || '');
    if (sc.contactPerson) setField('contactPerson', sc.contactPerson);
    if (sc.email) setField('email', sc.email);
    if (sc.phone) setField('phone', sc.phone);
    if (sc.city) setField('city', sc.city);
    if (sc.state) setField('state', sc.state);
    if (sc.billingAddress) setField('billingAddress', sc.billingAddress);
    if (sc.shippingAddress) setField('shippingAddress', sc.shippingAddress);
    if (sc.gstin) setField('gstin', sc.gstin);
    if (sc.pan) setField('pan', sc.pan);
    if (sc.paymentTerms) setField('paymentTerms', sc.paymentTerms);
    if (sc.deliveryTerms) setField('deliveryTerms', sc.deliveryTerms);
    if (sc.salesExecutive || sc.salesPerson) setField('salesExecutive', sc.salesExecutive || sc.salesPerson);
    if (sc.qtnRef) setField('qtnRef', String(sc.qtnRef));
    if (sc.leadNo) setField('leadNo', String(sc.leadNo));
    if (sc.poRef || sc.poReference) setField('customerPo', sc.poRef || sc.poReference);
    const terms = [sc.commercialTerms, sc.scope, sc.exclusions].filter(Boolean).join('\n');
    if (terms || sc.terms) setField('terms', sc.terms || terms);
    if (sc.remarks) setField('remarks', sc.remarks);
    if (Array.isArray(sc.items) && sc.items.length > 0) {
      setItems(
        sc.items.map((it) => ({
          productId: it.productId || null,
          productName: it.productName || it.product || '',
          // Preserve the source item SKU through the Sales Contract → Sales Order conversion
          sku: it.sku || '',
          description: it.description || it.productName || it.product || '',
          hsn: it.hsn || '',
          unit: it.unit || it.uom || '',
          qty: Number(it.qty) || 1,
          rate: Number(it.rate || it.unitPrice || it.price) || 0,
          discountPct: Number(it.discountPct) || 0,
          gstRate: Number(it.gstRate || it.tax) || 18,
          amount: Number(it.amount) || 0
        }))
      );
    }
    toast.success(`Loaded data from Sales Contract: ${sc.scNo ?? sc.id}`);
  };

  const handlePickContract = (sc) => {
    applyContract(String(sc.scNo ?? sc.id));
    setScPickerOpen(false);
    setScQuery('');
  };

  // Auto-fill from a selected customer (mirrors the original ERP CustomerLookup)
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
    setField('billingAddress', customer.billingAddress || '');
    setField('shippingAddress', customer.shippingAddress || customer.billingAddress || '');
    if (!form.paymentTerms) setField('paymentTerms', customer.paymentTerms || '');
  };

  // Lead actions menu deep-link (Create Sales Order): ?leadId=<id>&customer=<name>
  // pre-fills the order's client details from the lead — mirrors the ERP passing
  // leadId+customer into sales-order-create.html.
  const [searchParams] = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const prefillClientId = searchParams.get('clientId');
  // Quotation → Customer Purchase Order: "Convert to Customer Purchase Order"
  // opens THIS create form with the quotation's saved data pre-filled. The id
  // also lets the Save action record the conversion back on the quotation once
  // the CPO really exists.
  const prefillQuotationId = searchParams.get('fromQuotation');
  const sourceQuotationIdRef = useRef(null);

  useEffect(() => {
    if (!prefillLeadId || isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await leadService.getLead(prefillLeadId);
        if (cancelled) return;
        const d = res?.data ?? res ?? {};
        const customer = {
          id: d.id,
          businessName: d.businessName || d.company || d.name || '',
          contactPerson: d.contactPerson || d.name || '',
          phone: d.phone || d.mobile || '',
          email: d.email || '',
          gstin: d.gstin || d.gst || '',
          pan: d.pan || '',
          billingCity: d.city || '',
          billingState: d.state || '',
          billingAddress: d.address || '',
          shippingAddress: d.address || '',
          paymentTerms: d.paymentTerms || ''
        };
        setField('leadNo', d.leadNo || String(d.id || ''));
        handleClientSelect(customer);
      } catch {
        // prefill is best-effort; the form remains fully editable
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillLeadId]);

  // Client actions menu deep-link (Create Sales Order): ?clientId=<id> pre-fills
  // the order's client details from the saved Client record (ERP CustomerLookup).
  useEffect(() => {
    if (!prefillClientId || isEdit) return;
    let cancelled = false;
    customerService
      .get(prefillClientId)
      .then((res) => {
        if (cancelled) return;
        const c = res?.data ?? res ?? {};
        handleClientSelect({
          id: c.id,
          businessName: c.businessName || '',
          contactPerson: c.contactPerson || '',
          phone: c.phone || '',
          email: c.email || '',
          gstin: c.gstin || '',
          pan: c.pan || '',
          billingCity: c.billingCity || '',
          billingState: c.billingState || '',
          billingAddress: c.billingAddress || '',
          shippingAddress: c.shippingAddress || c.billingAddress || '',
          paymentTerms: c.paymentTerms || ''
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClientId, isEdit]);

  // Quotation deep-link (Convert to Customer Purchase Order): ?fromQuotation=<id>
  // pre-fills the whole order from the quotation's PERSISTED record — client,
  // references, items (description / sku / drawing / material / HSN / UOM /
  // qty / rate / discounts / GST), addresses, currency, tax type and terms.
  // Nothing is written here: the CPO is only created when the user saves.
  useEffect(() => {
    if (!prefillQuotationId || isEdit) return;
    let cancelled = false;
    (async () => {
      try {
        // `suppressGlobalError`: an auxiliary lookup — a stale link shows a
        // toast below and leaves the (working) empty form in place.
        const res = await quotationService.get(prefillQuotationId, { suppressGlobalError: true });
        if (cancelled) return;
        const quotation = res?.data ?? res ?? null;
        if (!quotation || quotation.id == null) {
          toast.error('The selected quotation could not be loaded.');
          return;
        }
        sourceQuotationIdRef.current = quotation.id;
        setForm((prev) => ({ ...prev, ...quotationToCpoForm(quotation) }));
        const rows = quotationToCpoItems(quotation);
        if (rows.length > 0) {
          setItems(rows);
          setHeaderGstRateInit(Number(rows[0].gstRate) || 18);
        }
        toast.success(`Loaded data from Quotation: ${quotation.quotationNo || quotation.id}`);
      } catch (err) {
        // best-effort: the form stays fully usable without the pre-fill
        if (!cancelled) toast.error(err?.message || 'The selected quotation could not be loaded.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillQuotationId, isEdit]);

  // After creating a new client: refresh the Client lookup list and auto-fill
  // the order with the newly created customer's details.
  const handleClientCreated = (customer) => {
    setClientRefreshKey((k) => k + 1);
    handleClientSelect(customer);
  };

  const validate = () => {
    if (!form.clientName) {
      toast.error('Please select or enter a Client name.');
      return false;
    }
    if (items.length === 0) {
      toast.error('Add at least one item.');
      return false;
    }
    return true;
  };

  useEffect(() => {
    if (!isEdit) {
      let cancelled = false;
      salesOrderService
        .getNextNumber()
        .then((res) => {
          if (cancelled) return;
          const value = res?.data?.soNo || res?.data?.nextNumber;
          if (value) setForm((prev) => ({ ...prev, soNo: value }));
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;
    salesOrderService
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        setHistorical(raw.latestRevision === false);
        const toForm = {};
        const DATE_KEYS = new Set(['orderDate', 'deliveryDate', 'dueDate', 'validUntil']);
        Object.keys(raw).forEach((key) => {
          if (key === 'items') return;
          if (typeof raw[key] === 'string' && (DATE_KEYS.has(key) || /Date$/.test(key))) {
            toForm[key] = raw[key].slice(0, 10);
          } else {
            toForm[key] = raw[key];
          }
        });
        // The flat Discount ₹ input holds form.discountPct, but the serializer
        // persists it as `discount` — map it back on load so edits prefill.
        if (raw.discount != null && toForm.discountPct == null) toForm.discountPct = raw.discount;
        if (raw.hsnView != null) toForm.hsnView = isHsnVisible(raw.hsnView);
        toForm.taxType = raw.taxType || 'CGST + SGST';
        setForm({ status: SO_STATUS_OPTIONS[0] || 'draft', ...toForm });
        // Items: normalize the stored UOM (`uom`) into the grid's `unit` field
        // and keep each row's custom-column values so user-defined item
        // columns reload with the record.
        const loadedItems = (Array.isArray(raw.items) ? raw.items : []).map((it) => ({
          ...it,
          unit: it.unit || it.uom || '',
          customFields: it.customFields || {}
        }));
        setItems(loadedItems);
        setHeaderGstRateInit(loadedItems[0] ? Number(loadedItems[0].gstRate) || 18 : 18);
        setAttachments(Array.isArray(raw.attachments) ? raw.attachments : []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err?.message || 'Failed to load document');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, toast]);

  /** Upload the files staged in create mode against the freshly saved CPO. */
  const uploadQueued = async (docId) => {
    if (!docId || pendingFiles.length === 0) return;
    const files = pendingFiles;
    const results = await salesOrderService.uploadMany(docId, files, {});
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
    if (failed > 0) toast.error(`${failed} attachment(s) failed to upload`);
    setPendingFiles([]);
  };

  const save = async ({ draft = false, stay = false, preview = false } = {}) => {
    // One save at a time: a repeated click while the request is pending must not
    // create a second CPO.
    if (savingRef.current) return;
    if (!validate()) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const payload = SERIALIZERS.salesOrder(form, items);
      // Save & Continue reports a rejected save itself (the toast below) and
      // must leave the user on the form with everything they entered — the same
      // pattern as Cost Workout's Save and Continue. The other actions keep
      // their existing global-error behavior.
      const saveOptions = { suppressGlobalError: preview };
      const res = isEdit
        ? await salesOrderService.update(id, payload, saveOptions)
        : await salesOrderService.create(payload, draft, saveOptions);
      const created = res?.data ?? {};
      const no = created.soNo || form.soNo || '';
      if (!isEdit) await uploadQueued(created.id);
      else if (created.id) setAttachments(Array.isArray(created.attachments) ? created.attachments : attachments);
      // Converted from a quotation: record the conversion on the quotation's
      // own reference (plus its timeline and audit trail) now that the CPO
      // really exists — the same endpoint the stand-alone Convert page uses.
      // The quotation's lifecycle status is never touched, and a failed link is
      // reported without losing the CPO that was just created.
      if (!isEdit && no && sourceQuotationIdRef.current && form.qtnRef) {
        try {
          await quotationService.postAction(sourceQuotationIdRef.current, 'conversion-reference', {
            target: 'sales-order',
            number: no
          });
        } catch (linkErr) {
          toast.error(
            `${cpoNo(no)} was created, but linking it to Quotation ${form.qtnRef} failed: ${linkErr?.message || 'unknown error'}`
          );
        }
      }
      toast.success(isEdit ? `${cpoNo(no)} updated` : `${cpoNo(no)} ${draft ? 'saved as draft' : 'created'}`);
      // The form writes the CPO (and its status) directly, so it does not pass
      // through the list hook that normally refreshes the sidebar count.
      window.dispatchEvent(new Event(PENDING_APPROVAL_REFRESH_EVENT));
      if (stay) {
        // Save & New: a genuinely CLEAN new CPO — no item values, customer
        // details, remarks, action instructions or staged files are carried
        // over. Only the (module-level) column configuration persists, because
        // it is not record data.
        setForm(emptyForm());
        setItems([]);
        setAttachments([]);
        setPendingFiles([]);
        // The quotation was already converted by the CPO just saved — the next
        // document is a clean, unrelated CPO.
        sourceQuotationIdRef.current = null;
        const next = await salesOrderService.getNextNumber();
        if (next?.data?.soNo) setForm((prev) => ({ ...prev, soNo: next.data.soNo }));
      } else if (draft) {
        // Save Draft: return to the list (existing behavior).
        navigate(navigateToList);
      } else if (preview) {
        // Save & Continue: the backend has already confirmed the record (the
        // await above returned), so open the SAME Customer Purchase Order
        // Preview the list's Preview action opens. It loads the CPO by its
        // PERSISTED id, so the preview — and a refresh of it — shows the saved
        // values and never creates a second document.
        const savedId = created.id || id;
        navigate(savedId ? `/sales-orders/design?id=${savedId}` : navigateToList);
      } else {
        // Save & Finish: open the saved CPO's record page (existing behavior).
        const savedId = created.id || id;
        navigate(savedId ? `/sales-orders/${savedId}` : navigateToList);
      }
    } catch (err) {
      toast.error(err?.message || 'Failed to save');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  /**
   * Continue a CPO item into the Work Order / Purchase Order it was marked for.
   *
   * The CPO is saved through the SAME create/update call the Save button uses,
   * so the item — and the WO/PO choice stored on it — is persisted first. Only
   * then is the destination form opened, and it is opened with the PERSISTED
   * CPO id and item id so it can re-read them from the API and validate them.
   */
  const convertRow = async (rowIndex) => {
    // A second click while the first is still saving must not run the same
    // conversion twice.
    if (convertingRef.current) return;
    const row = items[rowIndex];
    const target = cpoItemTarget(row);
    if (!target) return;
    if (!validate()) return;

    convertingRef.current = true;
    setSaving(true);
    try {
      const payload = SERIALIZERS.salesOrder(form, items);
      // A retry after a failure — or converting a second item of the same new
      // CPO — UPDATEs the document this action already created: it must never
      // create a second CPO.
      const persistedId = id || createdCpoIdRef.current;
      const res = persistedId
        ? await salesOrderService.update(persistedId, payload)
        : await salesOrderService.create(payload, false);
      const saved = res?.data ?? {};
      const savedId = saved.id || persistedId;
      if (!savedId) {
        throw new Error('The CPO could not be saved, so the conversion was cancelled.');
      }
      if (!id) createdCpoIdRef.current = savedId;

      // Item rows persist in the order they were sent (description rows are
      // dropped by the serializer), so this item's saved row is found by
      // position, with its description as a fallback check.
      const itemRowsSent = items.filter((it) => !it.rowType || it.rowType === 'item');
      const position = itemRowsSent.indexOf(row);
      const savedItems = Array.isArray(saved.items) ? saved.items : [];
      const savedItem = savedItems[position]
        || savedItems.find((si) => (si.description || '') === (row.description || ''));
      if (!savedItem?.id) {
        throw new Error('This CPO item could not be identified after saving — reopen the CPO and retry.');
      }

      toast.success(`${cpoNo(saved.soNo || form.soNo)} saved`);
      // Only the PERSISTED ids travel: the destination form re-reads the CPO
      // and this item from the API instead of trusting the URL.
      navigate(
        `${CPO_CONVERT_TARGETS[target].route}?${cpoConversionQuery(savedId, savedItem.id)}`
      );
    } catch (err) {
      // Nothing is reported as converted unless the CPO and its item persisted.
      toast.error(err?.message || 'Could not open the conversion form');
    } finally {
      convertingRef.current = false;
      setSaving(false);
    }
  };

  // ERP SO totals: Sub Total, CGST, SGST, IGST, Discount (flat ₹), Charges
  // (flat ₹), Grand Total, words. CGST/SGST = GST/2 like the ERP engine;
  // IGST displays the full GST for the row; Grand Total applies GST once.
  const t = computeTotals(items, { discountPct: 0, charges: 0 });
  const discountValue = Number(form.discountPct ?? 0);
  const chargesValue = Number(form.charges ?? 0);
  const grandTotal = round2(t.subTotal - discountValue + chargesValue + t.taxTotal);
  const totalWords = numberToWordsINR(grandTotal);
  const fmt = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  if (loading) {
    return (
      <div className="flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
        <div className="flex items-center justify-center py-24">
          <div className="h-5 w-5 rounded-full border-2 border-slate-200 border-t-[#0B4A3D] animate-spin" />
        </div>
      </div>
    );
  }

  const linkedSc = contractOptions.find((c) => String(c.scNo ?? c.id) === String(form.scRef || ''));
  const linkedQtn = quotationOptions.find((q) => String(q.quotationNo ?? q.id) === String(form.qtnRef || ''));
  // Linked documents that ACTUALLY exist on this order (source references and
  // the downstream documents already created from it — real record numbers,
  // never fabricated links).
  const formLinkedDocs = [
    form.leadNo && { label: 'Lead', value: form.leadNo, button: true },
    form.qtnRef && {
      label: 'Quotation',
      value: form.qtnRef,
      to: linkedQtn?.id ? `/quotations/${linkedQtn.id}` : null
    },
    form.scRef && {
      label: 'Sales Contract',
      value: form.scRef,
      to: linkedSc?.id ? `/sales-contracts/${linkedSc.id}` : null
    },
    form.convertedToProforma && { label: 'Proforma Invoice / Packing List', value: form.convertedToProforma, button: true },
    form.convertedToDc && { label: 'Delivery Challan', value: form.convertedToDc, button: true },
    form.convertedToInv && { label: 'Invoice', value: form.convertedToInv, button: true },
    form.convertedToCn && { label: 'Credit Note', value: form.convertedToCn, button: true },
    form.convertedToPr && { label: 'Payment Receipt', value: form.convertedToPr, button: true }
  ].filter(Boolean);

  /**
   * Re-read this record's attachments after an upload/delete.
   *
   * `getAttachments` resolves with the response BODY ({ success, message,
   * data: [...] }), not the bare array — unwrapping `res` itself (or `res.data`
   * as an array) left the list empty, so the panel showed the empty state right
   * after a successful upload. `res.data` holds the rows.
   */
  const reloadAttachments = () => {
    if (!id) return;
    salesOrderService
      .getAttachments(id)
      .then((res) => {
        const list = res?.data ?? res;
        setAttachments(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
  };

  return (
    <div className="erp-create-scope flex-1 bg-app font-sans antialiased text-slate-800 p-4 sm:p-6 w-full max-w-[100vw] overflow-x-hidden">
      {bulkBanner}
      {/* Historical revision notice: older versions of an edited document are
          immutable. The backend also rejects any mutation of a non-latest
          revision, so this banner is defence-in-depth for direct URL access. */}
      {historical && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <div className="text-xs">
            <p className="font-bold text-amber-800">Historical revision — read-only</p>
            <p className="text-amber-700 font-medium mt-0.5">
              This version is preserved in history and can no longer be edited. Use View / Preview / Print / PDF to review it.
            </p>
          </div>
        </div>
      )}
      {/* ===== BREADCRUMB ===== */}
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 mb-3 select-none">
        <span>Sales</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Sales Execution</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span>Customer Purchase Orders</span>
        <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
        <span className="text-slate-600">{isEdit ? 'Edit' : 'New'}</span>
      </div>

      {/* ===== PAGE HEADER ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Layers className="w-6 h-6 text-[#0B4A3D]" />
            {isEdit ? 'Edit Customer Purchase Order' : 'Create Customer Purchase Order'}
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-1.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 text-slate-300" />
            Fields marked with <span className="text-rose-500">*</span> are required
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate(backToList)}
          className="flex items-center gap-1.5 text-xs font-bold text-slate-600 bg-surface border border-slate-200 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer select-none w-fit"
        >
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" /> Back to List
        </button>
      </div>

      {/* ===== TWO-COLUMN LAYOUT: ERP SO sections + totals sidebar ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className="xl:col-span-2 min-w-0 space-y-4">
          {/* ===== SECTION 1: CUSTOMER PURCHASE ORDER ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={FileText} title="Customer Purchase Order" />
            <div className="p-5 space-y-4">
              {/* grid-2: CPO No + Customer PO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {HEADER_FIELDS.map((field) => (
                  <FormField key={field.key} label={field.label} required={field.required}>
                    {fieldControl(
                      field,
                      field.key === 'soNo' ? cpoNo(form[field.key]) : form[field.key],
                      (value) =>
                        handleFieldChange(field, value),
                      () => setScPickerOpen(true)
                    )}
                  </FormField>
                ))}
              </div>
              {/* grid-3: Order Date + Lead No + Sales Contract Ref */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {HEADER_ROW2.map((field) => (
                  <FormField key={field.key} label={field.label} required={field.required}>
                    {fieldControl(
                      field,
                      form[field.key],
                      (value) => handleFieldChange(field, value),
                      () => setScPickerOpen(true)
                    )}
                  </FormField>
                ))}
              </div>
              {/* grid-3: Quotation Ref (readonly) + Status + Currency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {HEADER_ROW3.map((field) => (
                  <FormField key={field.key} label={field.label} required={field.required}>
                    {fieldControl(
                      field,
                      form[field.key],
                      (value) => handleFieldChange(field, value),
                      () => setScPickerOpen(true)
                    )}
                  </FormField>
                ))}
              </div>

              {/* Client & Order Information — ONE unified section: client party
                  details on the left, the order-level party details (Sales
                  Executive / Delivery Date / Delivery Terms) on the right.
                  Responsive: 3 columns on desktop, collapsing to a single
                  stacked column on tablet/mobile. */}
              <div className="border border-slate-200 rounded-xl overflow-hidden mt-1">
                <h4 className="flex items-center gap-2 px-4 py-3 bg-slate-50/70 border-b border-slate-200 text-[13px] font-bold text-slate-800 select-none">
                  <Users className="w-4 h-4 text-[#0B4A3D]" /> Client &amp; Order Information
                </h4>
                <div className="p-4 grid grid-cols-1 lg:grid-cols-3 gap-x-5 gap-y-3">
                  {/* ---- Client details (2/3 on desktop) ---- */}
                  <div className="lg:col-span-2 space-y-3">
                    <FormField label="Client" required hint="Type to search, or select an existing Client to auto-fill billing, shipping, GST, payment terms and contact details">
                      <ClientLookup
                        value={form.clientName}
                        onChange={(name) => setField('clientName', name)}
                        onAutoFill={handleClientSelect}
                        refreshKey={clientRefreshKey}
                        portal
                      />
                    </FormField>
                    <FormField label="Client Name">
                      {fieldControl(
                        { key: 'clientName', label: 'Client Name', type: 'text', required: true },
                        form.clientName,
                        (value) => setField('clientName', value),
                        () => setScPickerOpen(true)
                      )}
                    </FormField>
                    <FormField label="Contact Person">
                      {fieldControl(
                        { key: 'contactPerson', label: 'Contact Person', type: 'text' },
                        form.contactPerson,
                        (value) => setField('contactPerson', value),
                        () => setScPickerOpen(true)
                      )}
                    </FormField>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Email">
                        {fieldControl(
                          { key: 'email', label: 'Email', type: 'email' },
                          form.email,
                          (value) => setField('email', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                      <FormField label="Phone">
                        {fieldControl(
                          { key: 'phone', label: 'Phone', type: 'text' },
                          form.phone,
                          (value) => setField('phone', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="City">
                        {fieldControl(
                          { key: 'city', label: 'City', type: 'text' },
                          form.city,
                          (value) => setField('city', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                      <FormField label="State">
                        {fieldControl(
                          { key: 'state', label: 'State', type: 'text' },
                          form.state,
                          (value) => setField('state', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="Billing Address">
                        {fieldControl(
                          { key: 'billingAddress', label: 'Billing Address', type: 'textarea', rows: 2 },
                          form.billingAddress,
                          (value) => setField('billingAddress', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                      <FormField label="Shipping Address">
                        {fieldControl(
                          { key: 'shippingAddress', label: 'Shipping Address', type: 'textarea', rows: 2 },
                          form.shippingAddress,
                          (value) => setField('shippingAddress', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <FormField label="GSTIN">
                        {fieldControl(
                          { key: 'gstin', label: 'GSTIN', type: 'text' },
                          form.gstin,
                          (value) => setField('gstin', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                      <FormField label="PAN">
                        {fieldControl(
                          { key: 'pan', label: 'PAN', type: 'text' },
                          form.pan,
                          (value) => setField('pan', value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                    </div>
                    <FormField label="Payment Terms">
                      {fieldControl(
                        { key: 'paymentTerms', label: 'Payment Terms', type: 'text', placeholder: 'e.g. Net 30' },
                        form.paymentTerms,
                        (value) => setField('paymentTerms', value),
                        () => setScPickerOpen(true)
                      )}
                    </FormField>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[13px] font-medium text-[#0B4A3D] hover:underline mt-2 cursor-pointer bg-transparent border-none p-0 font-sans"
                      onClick={() => setCustomerModalOpen(true)}
                    >
                      <Plus className="w-3.5 h-3.5" /> Create New Customer
                    </button>
                  </div>

                  {/* ---- Order information (1/3 on desktop) ---- */}
                  <div className="space-y-3 lg:border-l lg:border-slate-100 lg:pl-5">
                    {ORDER_FIELDS.map((field) => (
                      <FormField key={field.key} label={field.label} required={field.required}>
                        {fieldControl(
                          field,
                          form[field.key],
                          (value) => handleFieldChange(field, value),
                          () => setScPickerOpen(true)
                        )}
                      </FormField>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== SECTION 2: ACTION / RELEASE INSTRUCTIONS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={AlertTriangle} title="Action / Release Instructions" />
            <div className="p-5">
              <FormField label="Instructions">
                <TextArea
                  rows={3}
                  value={form.actionInstructions || ''}
                  onChange={(e) => setField('actionInstructions', e.target.value)}
                  placeholder="Enter release instructions, E-Auction requirements, participation instructions, buyer requirements, special conditions, procurement instructions..."
                  className={INPUT_CLS}
                />
              </FormField>
            </div>
          </div>

          {/* ===== SECTION 3: ITEMS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={Package} title="Items" />
            <div className="p-4">
              <CpoItemsGrid
                items={items}
                setItems={setItems}
                hsnView={form.hsnView}
                taxType={form.taxType}
                initialGstRate={headerGstRateInit}
                onHsnViewChange={(v) => setField('hsnView', v)}
                onTaxTypeChange={(v) => setField('taxType', v)}
                onConvert={convertRow}
                readOnly={historical}
              />
            </div>
          </div>

          {/* ===== SECTION 4: ATTACHMENTS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={Paperclip} title="Attachments" />
            <div className="p-4">
              {isEdit ? (
                <SalesAttachments
                  service={salesOrderService}
                  docId={id}
                  attachments={attachments}
                  onChanged={reloadAttachments}
                  variant="table"
                />
              ) : (
                <PendingAttachments files={pendingFiles} onChange={setPendingFiles} variant="table" />
              )}
            </div>
          </div>

          {/* ===== SECTION 5: ORDER TERMS & CONDITIONS ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={ClipboardList} title="Order Terms & Conditions" />
            <div className="p-5">
              <FormField label="Terms & Conditions">
                {fieldControl(
                  { key: 'terms', label: 'Terms & Conditions', type: 'textarea', rows: 3, placeholder: 'Enter order terms and conditions...' },
                  form.terms,
                  (value) => setField('terms', value),
                  () => setScPickerOpen(true)
                )}
              </FormField>
            </div>
          </div>

          {/* ===== SECTION 6: REMARKS / INTERNAL NOTES ===== */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <SectionHeader icon={StickyNote} title="Remarks / Internal Notes" />
            <div className="p-5">
              <TextArea
                rows={3}
                value={form.remarks || ''}
                onChange={(e) => setField('remarks', e.target.value)}
                placeholder="Additional notes or remarks..."
                className={INPUT_CLS}
              />
            </div>
          </div>
        </div>

        {/* ===== RIGHT SIDEBAR ===== */}
        <div className="min-w-0 space-y-4">
          {/* TOTALS — ERP SO: Sub Total, CGST, SGST, IGST, Discount (flat ₹),
              Charges (flat ₹), Grand Total, words */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="flex items-center gap-3 text-sm font-bold text-slate-900 mb-4">
              <span className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                <Info className="w-4 h-4" />
              </span>
              Totals
            </h3>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">Sub Total</span>
                <span className="font-bold text-slate-800">{fmt(t.subTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">CGST</span>
                <span className="font-bold text-slate-800">{fmt(t.cgstTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">SGST</span>
                <span className="font-bold text-slate-800">{fmt(t.sgstTotal)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-500">IGST</span>
                <span className="font-bold text-slate-800">{fmt(t.taxTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-500">Discount</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => setField('discountPct', e.target.value)}
                  className="w-24 bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1 text-xs text-slate-700 text-right outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner"
                />
              </div>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-500">Charges</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={chargesValue}
                  onChange={(e) => setField('charges', e.target.value)}
                  className="w-24 bg-slate-50 border border-slate-200/80 rounded-lg px-2 py-1 text-xs text-slate-700 text-right outline-none focus:border-emerald-600/50 focus:bg-surface transition-all shadow-inner"
                />
              </div>
              <div className="border-t-2 border-slate-200 my-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="font-bold text-slate-900">Grand Total</span>
                <span className="font-bold text-slate-900">{fmt(grandTotal)}</span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium pt-1">{totalWords}</p>
            </div>
          </div>

          {/* LINKED DOCUMENTS */}
          <div className="bg-surface border border-slate-200 rounded-xl shadow-sm p-5">
            <h3 className="flex items-center gap-3 text-sm font-bold text-slate-900 mb-4">
              <span className="p-2 rounded-lg bg-slate-100 text-slate-500 shrink-0">
                <LinkIcon className="w-4 h-4" />
              </span>
              Linked Documents
            </h3>
            {formLinkedDocs.length === 0 ? (
              <p className="text-xs text-slate-400 font-medium py-1">
                No linked documents yet. Select a Sales Contract (or create this order from a Quotation) to link it here.
              </p>
            ) : (
              <div className="space-y-2">
                {formLinkedDocs.map((link) => (
                  <button
                    key={link.label}
                    type="button"
                    onClick={() => link.to && navigate(link.to)}
                    disabled={!link.to}
                    className="w-full flex items-center justify-between gap-2 text-left text-xs font-bold text-[#0B4A3D] bg-[#0B4A3D]/5 border border-[#0B4A3D]/15 px-3 py-2.5 rounded-lg hover:bg-[#0B4A3D]/10 transition-colors cursor-pointer disabled:cursor-default"
                  >
                    <span>{link.label}</span>
                    <span className="text-slate-600 font-semibold">{link.value}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== STICKY FOOTER (ERP standard creation action bar) ===== */}
      <CreationActionBar
        showBackToList={false}
        onCancel={() => navigate(backToList)}
        onSaveDraft={!isEdit ? () => save({ draft: true }) : null}
        onSaveNew={!isEdit ? () => save({ stay: true }) : null}
        onSave={() => save({})}
        // Save & Continue: persist, then open the saved CPO's Preview page (the
        // same page the list's Preview action opens). Same save call, same
        // validation, no second create.
        onSaveContinue={() => save({ preview: true })}
        saveContinueLabel="Save & Continue"
        saveLabel={isEdit ? 'Update' : 'Save & Finish'}
        disabled={saving}
        locked={historical}
      />

      {/* ===== SALES CONTRACT PICKER MODAL (ERP: Select Sales Contract) ===== */}
      {scPickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setScPickerOpen(false);
              setScQuery('');
            }
          }}
        >
          <div className="bg-surface border border-slate-200 rounded-2xl shadow-2xl w-full max-w-[650px] max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <FileText className="w-4 h-4 text-[#0B4A3D]" /> Select Sales Contract
              </h3>
              <button
                type="button"
                onClick={() => {
                  setScPickerOpen(false);
                  setScQuery('');
                }}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <input
                type="text"
                value={scQuery}
                onChange={(e) => setScQuery(e.target.value)}
                placeholder="Search by SC No, Customer, Date..."
                className={`${INPUT_CLS} mb-3`}
              />
              {filteredContracts.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-slate-400">No sales contracts found</div>
              )}
              <div className="space-y-1.5">
                {filteredContracts.map((sc) => (
                  <button
                    key={sc.id ?? sc.scNo}
                    type="button"
                    onClick={() => handlePickContract(sc)}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#0B4A3D]/5 border border-transparent hover:border-[#0B4A3D]/20 transition-colors cursor-pointer"
                  >
                    <span className="block text-xs font-bold text-slate-800">
                      {sc.scNo ?? sc.id}
                      {(sc.clientName || sc.client) ? ` — ${sc.clientName || sc.client}` : ''}
                    </span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">
                      {sc.contractDate || sc.date || sc.scDate ? `${String(sc.contractDate || sc.date || sc.scDate).slice(0, 10)}` : ''}
                      {sc.amount ? ` · ₹${Number(sc.amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <CreateCustomerModal
        open={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        onCreated={handleClientCreated}
      />
    </div>
  );
}
