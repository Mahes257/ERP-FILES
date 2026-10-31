import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CreationActionBar from '../Common/CreationActionBar';
import {
  AlignLeft,
  BookUser,
  Building2,
  Calculator,
  ChevronRight,
  ChevronUp,
  CloudUpload,
  Coins,
  Copy,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Info,
  Layers,
  List,
  Lock,
  MapPin,
  Package,
  Paperclip,
  PenLine,
  Plus,
  PlusCircle,
  Scale,
  Search,
  Settings,
  StickyNote,
  Trash2,
  Truck,
  Undo2,
  User,
  X,
} from 'lucide-react';
import { EditableMasterDropdown, useToast, useExchangeRates } from '../Common';
import useBulkPrefill from '../../hooks/useBulkPrefill';
import useClickOutside from '../../hooks/useClickOutside';
import ClientLookup from './ClientLookup';
import { getAttachmentSelectionError } from '../../utils/attachmentStorage';
import CurrencyDropdown from './CurrencyDropdown';
import NumberCurrencyModal from './NumberCurrencyModal';
import UomManagerModal from './UomManagerModal';
import quotationService from '../../services/quotationService';
import prReferenceService from '../../services/prReferenceService';
import cprService from '../../services/cprService';
import costWorkoutService from '../../services/costWorkoutService';
import { cwConversionGstRate, quotationItemFromCwItem } from '../../utils/costWorkoutHelpers';
import profitWorkoutService from '../../services/profitWorkoutService';
import { pwConversionGstRate, quotationItemFromPwItem } from '../../utils/profitWorkoutHelpers';
import leadService from '../../services/leadService';
import customerService from '../../services/customerService';
import productService from '../../services/productService';
import { isHsnVisible, parseCustomFields, serializeQuotation } from '../../utils/salesHelpers';
import { dateInputValue, MAX_DATE_INPUT } from '../../utils/dateInput';
import { SALES_EXEC_HUB_TABS } from '../../utils/navigationHelpers';
import { normalizeItemCustomFields } from '../../utils/itemCustomFields';
import useManagedGrid from '../../hooks/useManagedGrid';
import { ColumnRenameButton, ColumnResizer, ManageColumnsButton } from '../GridColumns';
import {
  QUOTATION_ROW_TOTAL_COLUMN,
  defaultQuotationItemColumns,
  withRowTotalColumn
} from '../../utils/salesItemsColumns';
import { formatLeadNo } from '../../utils/leadHelpers';
import { NUMBER_FORMATS, SIGNATURE_TYPES } from '../../constants/salesConstants';
import { loadNumberSettings, saveNumberSettings, formatMoney } from '../../utils/quotationGrid';
import '../../pages/sales/quotation-create.css';

// =====================================================================
// ERP-identical Create Quotation page. The layout below is a line-for-line
// reproduction of the original ERP quotation-create.html using the same
// class names (qtn-*, item-table-*, sh-total-*) so it renders pixel-identical.
// Business logic (serializer, service, validation) is unchanged.
// =====================================================================

let uid = 0;
const nextId = () => ++uid;

import { useFormDraft } from '../../hooks/useFormDraft';
// Draft persistence is handled by the centralized useFormDraft hook.

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

// ERP updateTotals() math — item level and document totals exactly as the
// original quotation-create.js computes them.
function computeRows(items) {
  let subTotal = 0, cgstTotal = 0, sgstTotal = 0, totalQty = 0;
  const rows = items.map((it) => {
    const qty = Number(it.qty) || 0;
    const rate = Number(it.rate) || 0;
    const gst = Number(it.gstRate) || 0;
    const discPct = Number(it.discountPct) || 0;
    const grossAmt = qty * rate;
    const discAmt = grossAmt * (discPct / 100);
    const netAmt = grossAmt - discAmt;
    const cgst = netAmt * (gst / 2 / 100);
    const sgst = netAmt * (gst / 2 / 100);
    const total = netAmt + cgst + sgst;
    subTotal += netAmt;
    cgstTotal += cgst;
    sgstTotal += sgst;
    totalQty += qty;
    return { ...it, grossAmt, discAmt, netAmt, cgst, sgst, total };
  });
  return { rows, subTotal, cgstTotal, sgstTotal, totalQty };
}

// =====================================================================
// Product →” item data integration.
//
// productToItem is the SINGLE mapping from a product-master record to a
// quotation item row. It is used by BOTH the Products modal (adds a new row)
// and the per-row Product picker (refills an existing row), so Product and
// Description — plus SKU, HSN, UOM, Rate, GST — always come from the SAME
// product record. There is no separate/mock dataset for Product vs Description,
// and no duplicate state that could drift out of sync. A product field is only
// written when the product record actually carries a value (addItemRow/updateItem
// keep existing row values otherwise).
// =====================================================================
const productToItem = (product = {}) => ({
  productId: product.id ?? null,
  productName: product.name || '',
  description: product.description || product.name || '',
  ...(product.sku ? { sku: product.sku } : {}),
  ...(product.drawingNo ? { drawingNo: product.drawingNo } : {}),
  ...(product.material ? { material: product.material } : {}),
  ...(product.delivery ? { leadTime: product.delivery } : {}),
  ...(product.hsn ? { hsn: product.hsn } : {}),
  ...(product.batchCode ? { batchCode: product.batchCode } : {}),
  ...(product.expiryDate ? { expiryDate: product.expiryDate } : {}),
  ...(product.gstRate != null && product.gstRate !== '' ? { gstRate: Number(product.gstRate) } : {}),
  ...(product.unit ? { unit: product.unit } : {}),
  ...(product.rate != null && product.rate !== '' ? { rate: Number(product.rate) } : {})
});

/**
 * Per-row Product picker — type-or-select against the shared product master
 * (same productService.list() source as the Products modal). Matching the
 * existing ERP item-grid styling: it renders as one of the item's description
 * sub-fields (label + input) and opens a dropdown on focus/typing. Selecting a
 * product refills ONLY that row via onSelect → applyProductToRow. Manual
 * Description edits stay untouched until the user picks a different product.
 */
function ProductField({ value, onSelect, inputId }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const [ddPos, setDdPos] = useState(null);
  useClickOutside(wrapRef, () => setOpen(false), open);

  useEffect(() => {
    let cancelled = false;
    productService
      .list()
      .then((list) => {
        if (cancelled) return;
        setOptions(list || []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.sku || '').toLowerCase().includes(q) ||
        String(p.hsn || '').toLowerCase().includes(q)
    );
  }, [options, query]);

  const openDropdown = () => {
    const rect = inputRef.current?.getBoundingClientRect();
    if (rect) setDdPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 260) });
    setOpen(true);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={open ? query : value || ''}
        onChange={(e) => {
          setQuery(e.target.value);
          openDropdown();
        }}
        onFocus={openDropdown}
        placeholder="Search product…"
        style={{ paddingRight: 22, width: '100%', boxSizing: 'border-box' }}
      />
      <Search size={13} style={{ position: 'absolute', right: 8, top: 7, color: '#9CA3AF', pointerEvents: 'none' }} />
      {open && ddPos && (
        <div
          style={{
            position: 'fixed',
            zIndex: 9999,
            top: ddPos.top,
            left: ddPos.left,
            width: ddPos.width,
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid var(--it-border)',
            borderRadius: 6,
            background: '#fff',
            boxShadow: '0 8px 24px rgba(15,23,42,0.16)'
          }}
        >
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p);
                setOpen(false);
                setQuery('');
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '6px 10px',
                fontSize: 12,
                color: '#334155',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                fontFamily: 'Inter, sans-serif'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#f0fdfa';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{ fontWeight: 600 }}>{p.name || '(No Name)'}</span>
              <span style={{ display: 'block', fontSize: 10, color: '#9CA3AF' }}>
                {p.sku || ''} {p.hsn ? `· HSN ${p.hsn}` : ''} · {p.unit || ''} · ₹
                {Number(p.rate || 0).toLocaleString('en-IN')}
              </span>
            </button>
          ))}
          {loaded && filtered.length === 0 && (
            <div style={{ padding: '6px 10px', fontSize: 12, color: '#9CA3AF' }}>No products found</div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Reference PR No combobox for the Quotation form.
 *
 * Works with BOTH origins of a PR number, straight from MySQL through the
 * backend (GET /pr-references) — the reference does NOT have to come from a CPR:
 *
 *   - 'CPR'    options are carried by a real CPR row → selecting one loads that
 *              CPR and auto-fills the derived quotation fields.
 *   - 'DIRECT' options were registered from the Quotation form itself → the PR
 *              No is applied as-is, with no CPR data invented or copied.
 *
 * A brand-new PR No is a first-class path too: typing one resolves through the
 * backend exact-match lookup, and when nothing matches it is accepted as a new
 * Direct PR Reference (registered on quotation save) instead of blocking the
 * quotation behind a CPR. "＋ Add New Reference PR No." opens the explicit form
 * that captures the enquiry context (client, project, PR date, remarks).
 *
 * Selection → onSelect(referencePrNo, meta) where meta is the resolved PR
 * reference row ({ source: 'CPR' | 'DIRECT' | 'NEW' }). Cleared input →
 * onSelect('', null).
 */
function PrNoCombobox({ value, onSelect, disabled, onAddNew }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [options, setOptions] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Whether the input currently holds focus — used to decide if an externally
  // driven value may replace the displayed text (it may not while typing).
  const [focused, setFocused] = useState(false);
  const boxRef = useRef(null);
  const inputRef = useRef(null);
  const seqRef = useRef(0);

  // Keep the visible text in sync when the value is changed from outside
  // (e.g. form reset) — the React-approved render-phase adjustment pattern:
  // re-setting state here replaces the derived value without an effect.
  const [prevValue, setPrevValue] = useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    // An externally driven value (CPR hydration, reset) replaces the displayed
    // text — but never while the user is typing in the field, otherwise a slow
    // hydration landing mid-keystroke would wipe the number being entered.
    // The blur handler reconciles the typed text back to the resolved value.
    if (!focused) {
      setQuery(value || '');
    }
    setError('');
    setNote('');
  }

  useClickOutside(boxRef, () => setOpen(false), open);

  // Debounced backend autocomplete while the dropdown is open. All setState
  // calls happen inside the async timer callback (never synchronously in the
  // effect body), and stale responses are dropped via the seq guard.
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    const callId = ++seqRef.current;
    const t = setTimeout(async () => {
      if (!q) {
        setOptions([]);
        setLoaded(false);
        return;
      }
      try {
        const res = await prReferenceService.search(q);
        if (seqRef.current !== callId) return;
        const rows = Array.isArray(res?.data) ? res.data : [];
        setOptions(rows);
        setLoaded(true);
      } catch {
        if (seqRef.current !== callId) return;
        setOptions([]);
        setLoaded(true);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, open]);

  const lookup = async (raw) => {
    const ref = String(raw || '').trim();
    if (!ref) {
      setError('');
      setNote('');
      onSelect('', null);
      return;
    }
    setChecking(true);
    try {
      // Exact lookup across BOTH origins. A null result is not an error — it
      // means the PR No is new, which is a valid way to start a quotation.
      const res = await prReferenceService.lookup(ref);
      const hit = res?.data ?? null;
      setError('');
      if (hit?.referencePrNo) {
        setNote('');
        onSelect(hit.referencePrNo, hit);
      } else {
        setNote('New Reference PR No — no CPR required. It will be saved as a Direct PR Reference.');
        onSelect(ref, { source: 'NEW', referencePrNo: ref });
      }
    } catch (err) {
      setError(err?.message || 'Unable to resolve this Reference PR No.');
      setNote('');
    } finally {
      setChecking(false);
    }
  };

  const choose = (option) => {
    setOpen(false);
    setQuery(option.referencePrNo || '');
    setError('');
    setNote('');
    onSelect(option.referencePrNo || '', option);
  };

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        className="qtn-input"
        id="qtnRefPrNo"
        value={query}
        disabled={disabled}
        placeholder="Search / Type PR No"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setError('');
          setNote('');
        }}
        onFocus={() => {
          setFocused(true);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            // An exact match in the list wins; otherwise the typed value is
            // resolved against the backend (CPR / direct / brand new).
            const typed = String(query || '').trim().toLowerCase();
            const exact = options.find(
              (o) => String(o.referencePrNo || '').trim().toLowerCase() === typed
            );
            setOpen(false);
            if (exact) choose(exact);
            else lookup(query);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        onBlur={() => {
          setFocused(false);
          // Leaving the field must be enough on its own: the Reference PR No is
          // the ONLY trigger the user needs (no "Refresh from CPR" step). The
          // typed value is resolved against the real backend so the linked CPR
          // is always loaded and the reference is always the source of truth.
          // Resolving while the suggestion list is open is required — typing
          // keeps it open, so the old `if (open) return` guard meant a plain
          // "type the PR No. and click away" never resolved anything at all.
          const current = String(query || '').trim();
          if (current !== String(value || '').trim()) lookup(current);
        }}
        style={{ paddingRight: 28 }}
      />
      <button
        type="button"
        aria-label="Toggle Reference PR No options"
        onClick={() => {
          if (disabled) return;
          setOpen((o) => !o);
          inputRef.current?.focus();
        }}
        style={{
          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
          background: 'transparent', border: 'none', cursor: 'pointer', padding: 2,
          display: 'flex', alignItems: 'center', color: '#64748B'
        }}
      >
        <Search size={13} />
      </button>
      {checking && (
        <div style={{ position: 'absolute', right: 26, top: '50%', transform: 'translateY(-50%)', fontSize: 10, color: '#0B4A3D' }}>
          ...
        </div>
      )}
      {open && !disabled && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
            marginTop: 4, background: '#fff', border: '1px solid #E2E8F0',
            borderRadius: 8, boxShadow: '0 10px 24px rgba(15,23,42,.12)', maxHeight: 220,
            overflowY: 'auto', minHeight: 30
          }}
        >
          {options.map((opt) => (
            <button
              key={`${opt.source || 'X'}-${opt.referencePrNo}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(opt)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px',
                fontSize: 12, background: 'transparent', border: 'none', cursor: 'pointer'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: 600 }}>{opt.referencePrNo}</span>
              <span
                className={`qtn-prsrc ${opt.source === 'CPR' ? 'is-cpr' : 'is-direct'}`}
                title={opt.sourceLabel || ''}
              >
                {opt.source === 'CPR' ? 'CPR Reference' : 'Direct PR Reference'}
              </span>
              <span style={{ display: 'block', fontSize: 10, color: '#9CA3AF' }}>
                {opt.cprNo ? `CPR ${opt.cprNo}` : ''}{opt.clientName ? ` · ${opt.clientName}` : ''}
              </span>
            </button>
          ))}
          {open && (
            <button
              type="button"
              className="qtn-pradd"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onAddNew(String(query || '').trim());
              }}
            >
              <Plus size={12} /> Add New Reference PR No.
              {String(query || '').trim() ? ` “${String(query).trim()}”` : ''}
            </button>
          )}
          {!String(query || '').trim() && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: '#9CA3AF' }}>
              Type to search CPR references, or add a new Reference PR No.
            </div>
          )}
          {loaded && options.length === 0 && String(query || '').trim() !== '' && (
            <div style={{ padding: '6px 10px', fontSize: 11, color: '#9CA3AF' }}>
              No existing PR No matches “{String(query).trim()}”. Use “Add New Reference PR No.” to create it.
            </div>
          )}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 10, color: '#DC2626', marginTop: 3 }}>{error}</div>
      )}
      {!error && note && (
        <div style={{ fontSize: 10, color: '#B45309', marginTop: 3 }}>{note}</div>
      )}
    </div>
  );

}

export default function QuotationFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  // Conversion-source (Cost Workout / Profit Workout) deep-link failure or
  // duplicate message. Rendered as the form's own banner (not only a toast) so a
  // source record that cannot be used — or a save the backend rejected — is
  // always explained in place while the form stays fully editable.
  const [sourcePrefillError, setSourcePrefillError] = useState('');
  /** True when this create page was opened from a conversion route whose source
   *  Profit Workout / Cost Workout could not be used (already converted, or
   *  not loadable). Saving is blocked so the quotation is never created
   *  without its source link. */
  const [sourceBlocked, setSourceBlocked] = useState(false);
  const isEdit = Boolean(id);

  const emptyForm = () => ({
    quotationNo: '',
    reference: '',
    quotationDate: new Date().toISOString().split('T')[0],
    validUntil: '',
    leadNo: '',
    sourceCw: '',
    sourcePw: '',
    sourceCpr: '',
    // Reference PR No → origin link. OPTIONAL by design: a quotation can be
    // raised straight from a customer enquiry. When a CPR carries the PR No
    // both cprId and prReferenceId are persisted (Quotation → Open CPR stays
    // one click); a directly-created PR No only sets prReferenceId.
    referencePrNo: '',
    cprId: null,
    prReferenceId: null,
    referencePrSource: '',
    fromCompany: 'VISHAK TECH',
    fromName: 'VISHAK TECH',
    fromAddress: '',
    fromGstin: '',
    fromPan: '',
    fromEmail: '',
    fromPhone: '',
    clientId: '',
    clientName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    pin: '',
    country: 'India',
    gstin: '',
    pan: '',
    billingAddress: '',
    billingCity: '',
    billingState: '',
    billingPin: '',
    shipSameAsBill: false,
    shippingAddress: '',
    shippingCity: '',
    shippingState: '',
    shippingPin: '',
    taxType: 'GST',
    currency: 'INR',
    numberFormat: 'Indian',
    paymentTerms: '',
    deliveryTerms: '',
    freight: 0,
    insurance: 0,
    discountPct: 0,
    charges: 0,
    showTotalPdf: true,
    signatureType: 'Upload Signature',
    signatureLabel: '',
    internalNotes: '',
    notes: '',
    additionalInfo: '',
    contactEmail: '',
    contactPhone: '',
    hsnView: true,
    displayUnit: true,
    taxSummary: true,
    hidePlace: false,
    hsnSummary: false,
    originalImages: false,
    thumbnails: false,
    descFull: false,
    hideSubtotal: false,
    // SKU column is on by default (reference ERP renders SKU before Qty);
    // users can hide it via the Show SKU Advanced Option.
    showSku: true,
    serial: false,
    batch: false
  });

  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([]);
  // Bulk Upload: applies the extracted queue to this form for review — saving
  // still happens only through the existing Save buttons below.
  const bulkBanner = useBulkPrefill({
    moduleKey: 'quotation',
    setForm,
    setItems,
    enabled: !isEdit
  });
  // GST rate control lives in the GST table header and applies to every item
  // row (the old per-row dropdown is gone). It syncs to the first item's stored
  // rate on load so existing quotations keep their rates after refresh.
  const [gstRate, setGstRate] = useState(18);
  // Free-text GST rate shown in the GST table header (user can type any %).
  const [gstRateText, setGstRateText] = useState('18');
  // Sync the header GST rate to the first item's stored rate when items are
  // (re)loaded so existing quotations keep their rate after refresh
  // (React-documented pattern: adjust state when props change). applyGstRateToAll
  // skips updating items when the rate is unchanged, so typing a partial value
  // like "2." (which parses to the already-applied 2) never triggers this sync.
  const [prevItems, setPrevItems] = useState(items);
  if (items !== prevItems) {
    setPrevItems(items);
    const firstItem = items.find((it) => it.rowType === 'item');
    const firstRate = firstItem ? Number(firstItem.gstRate) || 0 : 18;
    setGstRate(firstRate);
    setGstRateText(String(firstRate));
  }
  const [terms, setTerms] = useState([]);
  const [files, setFiles] = useState([]);
  const [logo, setLogo] = useState('');
  const [sigPreview, setSigPreview] = useState('');
  const [sigPadMode, setSigPadMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  // Historical revisions (older versions of an edited quotation) are read-only.
  const [historical, setHistorical] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [products, setProducts] = useState([]);
  const [extraUnit, setExtraUnit] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showAddInfo, setShowAddInfo] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [numberSettings, setNumberSettings] = useState(() => loadNumberSettings());
  const [numFormatModal, setNumFormatModal] = useState(false);
  const [uomModal, setUomModal] = useState(false);
  const [uomRowIdx, setUomRowIdx] = useState(null);
  const [unitRefreshKey, setUnitRefreshKey] = useState(0);
  // User-defined custom fields for this quotation (Add Custom Fields).
  const [customFields, setCustomFields] = useState([]);
  const [cfModal, setCfModal] = useState(false);
  const [cfEditing, setCfEditing] = useState(null); // null = adding, index = editing
  const [cfDraft, setCfDraft] = useState({ name: '', type: 'text', value: '', options: '' });
  // "+ Add New Reference PR No." modal — registers a PR No straight from the
  // Quotation (no CPR is created). The quotation form stays mounted underneath,
  // so unsaved quotation data is never lost.
  const [prRefModal, setPrRefModal] = useState(false);
  const [prRefSaving, setPrRefSaving] = useState(false);
  const [prRefDraft, setPrRefDraft] = useState({
    referencePrNo: '', project: '', requestedBy: '', prDate: '', description: '', remarks: ''
  });
  // "+ Add New Client" modal — saves the client through the real backend and
  // selects it on the same quotation instead of navigating away.
  const [clientModal, setClientModal] = useState(false);
  const [clientSaving, setClientSaving] = useState(false);
  const [clientDraft, setClientDraft] = useState({
    businessName: '', contactPerson: '', email: '', phone: '', gstin: '', pan: '',
    billingAddress: '', billingCity: '', billingState: '', billingPin: '', country: 'India'
  });
  const sigCanvasRef = useRef(null);
  const drawingRef = useRef(false);

  // Centralized exchange rates (silently refreshed daily, cached in MySQL).
  const { rates: exchangeRates, base: ratesBase } = useExchangeRates();
  // Currency the document was loaded with (edit mode) — used to decide whether
  // to keep the stored exchange rate or stamp a fresh one on save.
  const origCurrencyRef = useRef(null);
  // Centralized draft persistence — saves/restores form items to localStorage
  const { persistDraft, clearDraft: clearFormDraft, restoreDraft } = useFormDraft(
    'quotations', id || null,
    { isEdit, enabled: true, debounceMs: 500 }
  );
  const draftRestoredRef = useRef(false);

  // Deep-link sources that pre-fill this form (Lead / Client actions menu, CPR,
  // Cost Workout). Declared up here because the draft restore below must know
  // about the Cost Workout deep link: a stored draft must never be mixed into a
  // source-prefilled form.
  const [searchParams] = useSearchParams();
  const prefillLeadId = searchParams.get('leadId');
  const prefillClientId = searchParams.get('clientId');
  const prefillSourceCwId = searchParams.get('sourceCw');
  const prefillSourcePwId = searchParams.get('sourcePw');

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  // Date fields (Quotation Date / Valid Till Date) accept ONLY a real date with
  // a four-digit year. A native date input happily reports "275760-01-01" when a
  // six-digit year is typed; such a value is refused here and the field keeps
  // the value it already had, so an impossible date can never be stored.
  const setDateField = (key, raw) => {
    const next = dateInputValue(raw);
    if (next === null) {
      toast.error('Enter a valid date with a four-digit year (YYYY-MM-DD).');
      return;
    }
    setField(key, next);
  };

  const roundMoney2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

  // ---- Live currency conversion using the centralized latest exchange rates ----
  const handleCurrencyChange = (newCur) => {
    const oldCur = form.currency || 'INR';
    if (!newCur || newCur === oldCur) return;
    const oldRate = oldCur === ratesBase ? 1 : Number(exchangeRates[oldCur]);
    const newRate = newCur === ratesBase ? 1 : Number(exchangeRates[newCur]);
    if (!Number.isFinite(oldRate) || oldRate <= 0 || !Number.isFinite(newRate) || newRate <= 0) {
      toast.warning('Exchange rates are unavailable right now — try again shortly');
      return;
    }
    const factor = newRate / oldRate;
    // Convert every monetary value (item rates, charges, freight, insurance);
    // %-based discount and GST are rate-independent and stay untouched. The
    // totals recompute automatically from the converted rates.
    setItems((prev) =>
      prev.map((it) => (it.rowType === 'item' ? { ...it, rate: roundMoney2(Number(it.rate || 0) * factor) } : it))
    );
    setField('charges', roundMoney2(Number(form.charges || 0) * factor));
    setField('freight', roundMoney2(Number(form.freight || 0) * factor));
    setField('insurance', roundMoney2(Number(form.insurance || 0) * factor));
    // The document-level discount is a FLAT amount (form + backend treat it as
    // flat, subtracted from the subtotal), so it must be currency-converted
    // like charges/freight/insurance — otherwise a ₹100 discount would become
    // $100 after converting the document to USD.
    setField('discountPct', roundMoney2(Number(form.discountPct || 0) * factor));
    setField('currency', newCur);
    setField('exchangeRate', newRate);
    toast.success(
      `Converted to ${newCur} at 1 ${ratesBase} = ${newRate} ${newCur} (rates updated ${new Date().toLocaleDateString()})`
    );
  };

  // ---- next number ----
  useEffect(() => {
    if (isEdit) return undefined;
    let cancelled = false;
    quotationService
      .getNextNumber()
      .then((res) => {
        if (!cancelled) {
          const value = res?.data?.quotationNo || res?.data?.nextNumber;
          if (value) setForm((prev) => ({ ...prev, quotationNo: value }));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isEdit]);

  // ---- restore unsaved draft from localStorage (new quotation only) ----
  // A Cost Workout / Profit Workout deep link owns the form contents: restoring
  // an unrelated stored draft on top of it would mix the two records together.
  useEffect(() => {
    if (isEdit || draftRestoredRef.current || prefillSourceCwId || prefillSourcePwId) return;
    const draft = restoreDraft();
    if (draft && Array.isArray(draft.items) && draft.items.length > 0) {
      // Restore items with fresh IDs to avoid collision
      setItems(draft.items.map((it) => ({ ...it, id: nextId() })));
      if (draft.form) {
        setForm((prev) => ({ ...prev, ...draft.form }));
      }
      draftRestoredRef.current = true;
    }
  }, [isEdit, restoreDraft, prefillSourceCwId, prefillSourcePwId]);

  // ---- persist draft to localStorage (new quotation only, debounced) ----
  useEffect(() => {
    if (isEdit || !draftRestoredRef.current) return;
    const itemRows = items.filter((it) => it.rowType === 'item');
    if (itemRows.length === 0) return;
    persistDraft({
      items,
      form: {
        clientName: form.clientName,
        contactPerson: form.contactPerson,
        email: form.email,
        phone: form.phone,
        address: form.address,
        city: form.city,
        state: form.state,
        pin: form.pin,
        gstin: form.gstin,
        pan: form.pan,
        currency: form.currency,
        paymentTerms: form.paymentTerms,
        deliveryTerms: form.deliveryTerms,
        taxType: form.taxType,
        notes: form.notes,
        internalNotes: form.internalNotes,
        additionalInfo: form.additionalInfo,
        leadNo: form.leadNo,
        clientId: form.clientId,
      }
    });
  }, [items, form, isEdit, persistDraft]);

  // ---- load products for the Products modal ----
  useEffect(() => {
    let cancelled = false;
    productService
      .list()
      .then((list) => {
        if (!cancelled) setProducts(list || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- edit mode: populate from backend (same mapping as the generic page) ----
  useEffect(() => {
    if (!isEdit) return undefined;
    let cancelled = false;
    quotationService
      .get(id)
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res ?? {};
        setHistorical(raw.latestRevision === false);
        const toForm = {};
        const DATE_KEYS = new Set(['validTill', 'validity', 'dueDate', 'deliveryDate', 'dispatchDate', 'validUntil']);
        Object.keys(raw).forEach((key) => {
          if (typeof raw[key] === 'string' && (DATE_KEYS.has(key) || /Date$/.test(key))) {
            toForm[key] = raw[key].slice(0, 10);
          } else if (key === 'items') {
            return;
          } else {
            toForm[key] = raw[key];
          }
        });
        // hsnView is stored as a string ("true"/"false") on the backend; coerce
        // to a real boolean so the HSN Column View checkbox and the HSN column
        // render correctly when reopening a quotation with HSN hidden.
        toForm.hsnView = isHsnVisible(raw.hsnView);
        // displayUnit is the other String-backed option column, and it needs the
        // same coercion. Passing the raw string through gave the "Display Unit As"
        // checkbox checked="true" (React warns), and a saved "false" — a non-empty
        // string, therefore truthy — reopened as CHECKED although it was stored off.
        // Same rule as HSN Column View: only a literal "false" is hidden, missing
        // data keeps the form's default (on).
        toForm.displayUnit = isHsnVisible(raw.displayUnit);
        // showSku defaults to visible for quotations saved before the column
        // existed (backend column null → visible).
        toForm.showSku = raw.showSku !== false;
        toForm.taxSummary = raw.taxSummary !== false;
        toForm.hidePlace = !!raw.hidePlace;
        toForm.hsnSummary = !!raw.hsnSummary;
        toForm.originalImages = !!raw.originalImages;
        toForm.thumbnails = !!raw.thumbnails;
        toForm.descFull = !!raw.descFull;
        toForm.hideSubtotal = !!raw.hideSubtotal;
        toForm.serial = !!raw.serial;
        toForm.batch = !!raw.batch;
        toForm.shipSameAsBill = !!raw.shipSameAsBill;
        toForm.country = raw.country || 'India';
        toForm.fromCompany = raw.fromCompany || 'VISHAK TECH';
        toForm.fromName = raw.fromName || 'VISHAK TECH';
        // The document-level discount input is a FLAT amount; the backend
        // returns both `discount` (flat) and a derived `discountPct` (% of
        // subtotal). Load the flat value so re-saving an edit does not shrink
        // the stored discount to the derived percentage (data-loss fix).
        toForm.discountPct = raw.discount != null && raw.discount !== '' ? Number(raw.discount) : 0;
        setForm({ ...emptyForm(), ...toForm });
        origCurrencyRef.current = toForm.currency || 'INR';
        setItems(
          (Array.isArray(raw.items) ? raw.items : []).map((it) => ({
            id: nextId(),
            rowType: 'item',
            productId: it.productId || null,
            productName: it.productName || it.product || '',
            description: it.description || '',
            sku: it.sku || '',
            drawingNo: it.drawingNo || '',
            material: it.material || '',
            leadTime: it.leadTime || it.delivery || '',
            hsn: it.hsn || '',
            batchCode: it.batchCode || '',
            expiryDate: it.expiryDate || '',
            gstRate: Number(it.gstRate) || 0,
            // the backend returns the item unit under "uom" (QuotationItemResponse.uom)
            unit: it.uom || it.unit || 'Nos',
            qty: it.qty != null ? Number(it.qty) : 1,
            rate: Number(it.rate) || 0,
            discountPct: Number(it.discountPct) || 0,
            // Managed-grid custom column values for this row (restored from
            // MySQL exactly as saved).
            customFields: normalizeItemCustomFields(it.customFields),
            descriptionRows: Array.isArray(it.descriptionRows) ? it.descriptionRows : []
          }))
        );
        // Restore Terms & Conditions from the stored string so editing a
        // quotation does not wipe the persisted terms on the next save.
        const rawTerms = String(raw.terms || '').trim();
        setTerms(
          rawTerms
            ? rawTerms.split('\n').filter(Boolean).map((line) => {
                const isGroup = line.startsWith('[GROUP] ');
                const cleanLine = isGroup ? line.slice('[GROUP] '.length) : line;
                const sep = cleanLine.indexOf(':');
                return {
                  id: nextId(),
                  isGroup,
                  title: sep >= 0 ? cleanLine.slice(0, sep).trim() : cleanLine,
                  description: sep >= 0 ? cleanLine.slice(sep + 1).trim() : ''
                };
              })
            : []
        );
        // Restore per-quotation custom fields (Add Custom Fields feature).
        setCustomFields(parseCustomFields(raw.customFields).map((f) => ({ ...f, id: nextId() })));
        setLoading(false);
      })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err?.message || 'Failed to load quotation');
          navigate('/quotations');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, isEdit, navigate, toast]);

  // ---- ERP qtnShipCopyBill ----
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

  // ---- ERP VT.CustomerLookup auto-fill ----
  // Maps the selected customer (camelCase fields returned by GET /customers)
  // onto every quotation client field. Each lookup keeps fallbacks so the
  // handler stays correct if the API field shape ever changes. This only
  // writes the initial values — the form remains fully editable afterwards.
  const handleClientSelect = (customer) => {
    const billingAddr = customer.billingAddress || customer.address || '';
    const billingCity = customer.billingCity || customer.city || '';
    const billingState = customer.billingState || customer.state || '';
    const billingPin = customer.billingPin || customer.pinCode || customer.pin || customer.zipCode || '';
    const shippingAddr = customer.shippingAddress || billingAddr || '';
    const shippingCity = customer.shippingCity || billingCity || '';
    const shippingState = customer.shippingState || billingState || '';
    const shippingPin = customer.shippingPin || billingPin || '';

    setField('clientId', customer.id ?? customer.clientId ?? customer.customerId ?? '');
    setField('clientName', customer.businessName || customer.companyName || customer.clientName || customer.name || '');
    setField('contactPerson', customer.contactPerson || '');
    setField('phone', customer.phone || customer.mobile || '');
    setField('email', customer.email || '');
    setField('gstin', customer.gstin || customer.gst || customer.gstNo || '');
    setField('pan', customer.pan || customer.panNumber || '');
    setField('city', billingCity);
    setField('state', billingState);
    setField('pin', billingPin);
    setField('country', customer.country || 'India');
    setField('address', billingAddr);
    setField('billingAddress', billingAddr);
    setField('billingCity', billingCity);
    setField('billingState', billingState);
    setField('billingPin', billingPin);
    setField('shippingAddress', shippingAddr);
    setField('shippingCity', shippingCity);
    setField('shippingState', shippingState);
    setField('shippingPin', shippingPin);
    if (customer.paymentTerms) setField('paymentTerms', customer.paymentTerms);
    if (customer.salesPerson) setField('salesPerson', customer.salesPerson);
  };

  // ================= CPR auto-fill (Reference PR No) =================
  // The Reference PR No links this quotation to the REAL CPR row in MySQL.
  // Entering, pasting or selecting a valid PR No is on its own enough to load
  // that CPR — the field is the single trigger, and "Refresh from CPR" is only
  // a manual re-read of the same source record.
  //
  // ONE hydration mapping (hydrateFromCpr) behind ONE fetch
  // (loadCprReference) serves both the automatic and the manual route, so the
  // two can never drift apart. The quotation keeps its own editable snapshot
  // (pricing/discounts/terms stay user-owned) and the source CPR is never
  // modified by quotation edits.
  const [cprLoading, setCprLoading] = useState(false);
  const [linkedCpr, setLinkedCpr] = useState(null);
  // Set when the backend could not be read for a CPR-carried reference, so the
  // UI reports the real failure instead of mislabelling it a Direct reference.
  const [cprError, setCprError] = useState('');
  // Monotonic request id for CPR loads: only the NEWEST load may write the form,
  // so a slow response for PR A can never overwrite PR B's hydration.
  const cprLoadSeqRef = useRef(0);

  /**
   * Apply a DIRECT PR reference (one that no CPR carries). Only the PR No and
   * its link are written — no CPR data exists here, so nothing is invented and
   * the user stays in control of the client/items they entered.
   */
  const applyDirectPrReference = (ref, meta) => {
    setLinkedCpr(null);
    setCprError('');
    setForm((prev) => ({
      ...prev,
      referencePrNo: ref,
      cprId: null,
      prReferenceId: meta?.id ?? null,
      referencePrSource: 'DIRECT',
      sourceCpr: ''
    }));
  };

  /**
   * Fold the CPR item's user-defined grid columns into one "Label: value"
   * string (configured column order), exactly like the existing backend
   * CPR → Quotation conversion (QuotationService.foldCprCustomFields), so a
   * custom CPR item column is never silently discarded on hydration.
   */
  const foldCprItemCustomFields = (cpr, cprItem) => {
    const custom = cprItem?.customFields;
    if (!custom || typeof custom !== 'object' || Array.isArray(custom)) return '';
    const seen = new Set();
    const ordered = [];
    (Array.isArray(cpr?.itemColumns) ? cpr.itemColumns : []).forEach((c) => {
      if (!c || !c.id || c.system || !(c.id in custom)) return;
      ordered.push([c.id, c.label || c.id]);
      seen.add(c.id);
    });
    Object.keys(custom).forEach((id) => {
      if (!seen.has(id)) ordered.push([id, id]);
    });
    return ordered
      .map(([id, label]) => {
        const value = custom[id];
        return value == null || String(value).trim() === '' ? null : `${label}: ${String(value)}`;
      })
      .filter(Boolean)
      .join('; ');
  };

  /**
   * THE ONLY CPR → quotation fetch. Resolves the CPR (by row id when the
   * reference is CPR-carried, otherwise by PR No) and applies the single
   * mapping below. Used by BOTH the Reference PR No selection and "Refresh from
   * CPR", so the automatic and the manual route can never drift apart.
   *
   * Concurrency-safe: every call takes a ticket from cprLoadSeqRef and only the
   * newest ticket is allowed to hydrate the form.
   */
  const loadCprReference = async ({ cprId, referencePrNo, cprCarried = false } = {}) => {
    const ticket = ++cprLoadSeqRef.current;
    setCprLoading(true);
    try {
      const res = cprId
        ? await cprService.getCpr(cprId)
        : await cprService.getByReferencePrNo(referencePrNo);
      if (ticket !== cprLoadSeqRef.current) return false;
      const cpr = res?.data ?? null;
      if (!cpr?.id) throw new Error('Unable to load the linked CPR.');
      setCprError('');
      hydrateFromCpr(cpr);
      return true;
    } catch (err) {
      if (ticket !== cprLoadSeqRef.current) return false;
      // No mock and no partial CPR data ever — report the real failure and keep
      // the reference the user entered. A CPR-carried reference keeps its link
      // (the backend already told us the origin) so Retry can re-read it.
      setLinkedCpr(null);
      setForm((prev) => ({
        ...prev,
        referencePrNo: referencePrNo || prev.referencePrNo,
        cprId: cprCarried ? (cprId ?? null) : null,
        prReferenceId: null,
        referencePrSource: cprCarried ? 'CPR' : ''
      }));
      setCprError(err?.message || 'Unable to load the linked CPR.');
      toast.error(err?.message || 'Unable to load the linked CPR.');
      return false;
    } finally {
      if (ticket === cprLoadSeqRef.current) setCprLoading(false);
    }
  };

  const hydrateFromCpr = (cpr) => {
    setLinkedCpr(cpr);
    // Source-dependent fields are REPLACED, never merged with the previous
    // record, so switching PR A → PR B cannot leak PR A's client, contact
    // details, addresses or remarks. Quotation-owned commercial values
    // (currency, tax type, discount, charges, freight, insurance, terms,
    // notes, signature and design options) are deliberately left untouched.
    setForm((prev) => ({
      ...prev,
      referencePrNo: cpr.referencePrNo || '',
      cprId: cpr.id ?? null,
      referencePrSource: 'CPR',
      sourceCpr: cpr.prNo || '',
      leadNo: cpr.leadNo || '',
      // The CPR already stores the real client row id, so the quotation links
      // to the same client record instead of a bare name.
      clientId: cpr.clientId ?? '',
      clientName: cpr.clientName || cpr.sourceLead || '',
      contactPerson: cpr.contactPerson || '',
      email: cpr.email || '',
      phone: cpr.phone || '',
      address: cpr.billingAddress || '',
      gstin: cpr.gst || '',
      pan: cpr.pan || '',
      billingAddress: cpr.billingAddress || '',
      shipSameAsBill: true,
      shippingAddress: cpr.shippingAddress || cpr.billingAddress || '',
      remarks: cpr.remarks || ''
    }));
    const cprItems = Array.isArray(cpr.items) ? cpr.items : [];
    // Items are replaced WHOLESALE — including when the new CPR has fewer items
    // than the old one, or none at all (old rows must never survive a source
    // change). Mapping mirrors the backend CPR → Quotation conversion:
    //   CPR specification → Quotation description
    //   CPR description   → Quotation material (+ folded custom columns)
    setItems(
      cprItems.map((it) => {
        // CPR field mapping (mirrors the backend createFromCpr):
        //   specification (user-facing "Description") → quotation description
        //   description    (user-facing "Material")    → quotation material
        //   drawingNo      (PR number)                 → quotation sku / item code
        const materialBase = it.description || '';
        const folded = foldCprItemCustomFields(cpr, it);
        const material = folded
          ? (materialBase ? `${materialBase}; ${folded}` : folded)
          : materialBase;
        return {
          id: nextId(),
          rowType: 'item',
          productId: null,
          productName: it.description || '',
          description: it.specification || '',
          sku: it.drawingNo || '',
          drawingNo: it.drawingNo || '',
          material,
          leadTime: '',
          hsn: '',
          batchCode: '',
          expiryDate: '',
          gstRate: Number(gstRate) || 0,
          unit: it.unit || 'Nos',
          qty: Number(it.qty) || 1,
          rate: Number(it.estimatedCost) || 0,
          discountPct: 0,
          descriptionRows: []
        };
      })
    );
  };

  /**
   * Reference PR No selection handler.
   *
   * Three outcomes, all first-class — a CPR is NEVER required:
   *   meta.source === 'CPR'    → load that CPR (full row from MySQL) and map the
   *                              derived quotation fields onto the form.
   *   meta.source === 'DIRECT' → apply the PR No with its pr_references link and
   *                              leave every other field exactly as the user set it.
   *   meta.source === 'NEW'    → accept the brand-new PR No; it is registered as
   *                              a Direct PR Reference when the quotation saves.
   * Clearing the field removes only the reference link — typed quotation data is
   * always preserved.
   */
  const handlePrNoSelect = async (ref, meta) => {
    if (!ref) {
      // Cancels any in-flight hydration so a late response cannot re-link a
      // reference the user has just cleared.
      cprLoadSeqRef.current += 1;
      setCprError('');
      setForm((prev) => ({
        ...prev,
        referencePrNo: '',
        cprId: null,
        prReferenceId: null,
        referencePrSource: ''
      }));
      setLinkedCpr(null);
      return;
    }
    if (meta?.source === 'CPR' || meta?.cprId) {
      // The same reference is already loaded — keep the user's edits instead of
      // re-hydrating. "Refresh from CPR" remains available as the explicit
      // re-read of the source record.
      if (linkedCpr?.id && meta?.cprId && linkedCpr.id === meta.cprId) return;
      const ok = await loadCprReference({
        cprId: meta?.cprId,
        referencePrNo: meta?.referencePrNo || ref,
        cprCarried: true
      });
      if (ok) toast.success('CPR details loaded');
      return;
    }
    applyDirectPrReference(ref, meta);
  };

  // Deliberate re-sync with the CURRENT CPR state (spec §17): refreshes the
  // mapped snapshot fields/items from the linked CPR without touching the
  // quotation's commercial values (discount, freight, GST, payment terms).
  const refreshFromCpr = async () => {
    const idToLoad = linkedCpr?.id || form.cprId;
    if (!idToLoad) return;
    const ok = await loadCprReference({ cprId: idToLoad, cprCarried: true });
    if (ok) toast.success('CPR details loaded');
  };

  // Edit mode: restore the saved Reference PR No + linked CPR (from the
  // persisted cprId) so reopening a quotation shows the correct link. The
  // saved snapshot values are NOT re-fetched or overwritten from the CPR.
  useEffect(() => {
    if (!isEdit || !loading) return;
    const savedRef = form.referencePrNo;
    const savedCprId = form.cprId;
    if (!savedRef && !savedCprId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = savedCprId
          ? await cprService.getCpr(savedCprId)
          : await cprService.getByReferencePrNo(savedRef);
        if (cancelled) return;
        const cpr = res?.data ?? null;
        if (cpr?.id) setLinkedCpr(cpr);
      } catch {
        // Link display is best-effort; the saved quotation data is untouched.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, loading]);

  // Lead actions menu deep-link (Create Quotation): ?leadId=<id>&customer=<name>
  // pre-fills the client details from the lead — mirrors the ERP passing
  // leadId+customer into quotation-create.html.
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
          name: d.name || d.contactPerson || '',
          contactPerson: d.contactPerson || d.name || '',
          phone: d.phone || d.mobile || '',
          email: d.email || '',
          gstin: d.gstin || d.gst || '',
          pan: d.pan || '',
          billingCity: d.city || '',
          billingState: d.state || '',
          billingPin: d.pincode || '',
          billingAddress: d.address || '',
          address: d.address || '',
          country: d.country || 'India',
          paymentTerms: d.paymentTerms || '',
          salesPerson: d.owner || d.assignedTo || ''
        };
        setField('leadNo', d.leadNo || formatLeadNo(d.id));
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

  // Client actions menu deep-link (Create Quotation): ?clientId=<id> pre-fills
  // the client details from the saved Client record (ERP CustomerLookup auto-fill).
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
          billingPin: c.billingPin || '',
          billingAddress: c.billingAddress || '',
          shippingAddress: c.shippingAddress || c.billingAddress || '',
          country: c.country || 'India',
          paymentTerms: c.paymentTerms || '',
          salesPerson: c.salesPerson || ''
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillClientId, isEdit]);

  /**
   * Hydrate the Quotation form from a Cost Workout record.
   *
   * Source-dependent fields (client, items, references) are replaced wholesale,
   * just like hydrateFromCpr. Quotation-owned fields (currency, tax type,
   * discount, charges, freight, insurance, terms, notes, signature, display
   * options) are deliberately left untouched.
   */
  // Function declaration (not a const) so the deep-link effect above, which
  // runs on mount, can call it without a temporal-dead-zone reference.
  function hydrateFromCostWorkout(cw) {
    // Customer / source fields
    setForm((prev) => ({
      ...prev,
      sourceCw: cw.cwNo || '',
      leadNo: cw.sourceLead || prev.leadNo,
      clientId: cw.clientId ?? prev.clientId,
      clientName: cw.customerName || cw.company || prev.clientName,
      contactPerson: cw.contactPerson || prev.contactPerson,
      // The Cost Workout's "Prepared By" is the form's Sales Person.
      salesPerson: cw.preparedBy || prev.salesPerson,
      email: cw.email || prev.email,
      phone: cw.phone || prev.phone,
      address: cw.billingAddress || prev.address,
      gstin: cw.gst || prev.gstin,
      pan: cw.pan || prev.pan,
      billingAddress: cw.billingAddress || prev.billingAddress,
      shipSameAsBill: true,
      shippingAddress: cw.shippingAddress || cw.billingAddress || prev.shippingAddress,
      remarks: cw.remarks || prev.remarks,
      sourceCpr: cw.sourceCpr || cw.cprRef || cw.linkedCpr || prev.sourceCpr,
      cprId: cw.cprId ?? prev.cprId,
      referencePrNo: cw.sourceCpr || cw.cprRef || cw.linkedCpr || prev.referencePrNo,
      referencePrSource: (cw.cprId || cw.sourceCpr || cw.cprRef) ? 'CPR' : prev.referencePrSource,
      // GST rate from Cost Workout applied to all items
      taxType: 'GST'
    }));

    // Items — map ALL Cost Workout items into the quotation's item grid with the
    // shared CW → Quotation mapper, so this deep-link path and the backend's
    // "Convert to Quotation" action (QuotationService#createFromCostWorkout)
    // produce the same quotation: the item's description/material/name, its
    // quantity and unit, its cost (category total ÷ qty), the cost breakdown as
    // the item's own detail rows, the "Lead Time" row's value and the item's
    // user-defined column values. The replacement is wholesale, so re-running a
    // hydration never appends a second copy of the same item.
    const cwItems = Array.isArray(cw.items) ? cw.items : [];
    if (cwItems.length > 0) {
      const gstRate = cwConversionGstRate(cw);
      setItems(
        cwItems.map((cwItem) => ({
          id: nextId(),
          rowType: 'item',
          ...quotationItemFromCwItem(cwItem, { gstRate })
        }))
      );
      // Apply the CW's GST rate to the header as well
      applyGstRateToAll(gstRate);
    }
  }

  // Cost Workout deep-link (?sourceCw=<id>): fetch the complete Cost Workout and
  // hydrate all supported fields into the Quotation form. Follows the same
  // pattern as the CPR/Lead/Client hydration above and is READ-ONLY — the
  // quotation is only created when the user presses a save action.
  //
  // The Cost Workout → Quotation business rules are enforced here because this
  // path no longer calls the conversion endpoint: only an APPROVED Cost Workout
  // that has not been converted yet may produce a quotation. When the source
  // cannot be loaded (or is not convertible) nothing is hydrated, so the user
  // is never shown a partly filled form that looks like real source data.
  useEffect(() => {
    if (!prefillSourceCwId || isEdit) return;
    let cancelled = false;
    // suppressGlobalError: a source lookup that fails is reported in place (the
    // Form stays usable) instead of replacing this valid route with the global
    // error page — same rule the Profit Workout prefill follows.
    costWorkoutService
      .getCw(prefillSourceCwId, { suppressGlobalError: true })
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res;
        const cw = raw?.data ?? raw;
        if (!cw?.id) {
          setSourceBlocked(true);
          setSourcePrefillError('Cost Workout could not be loaded — the quotation form was left empty.');
          return;
        }
        const status = String(cw.status || '').toLowerCase();
        if (status !== 'approved') {
          setSourceBlocked(true);
          setSourcePrefillError(`Only approved Cost Workouts can be converted to a quotation (current: ${status || 'unknown'}).`);
          return;
        }
        if (cw.convertedToQtn) {
          setSourceBlocked(true);
          setSourcePrefillError(`Cost Workout already converted to quotation '${cw.convertedToQtn}'.`);
          return;
        }
        setSourceBlocked(false);
        setSourcePrefillError('');
        hydrateFromCostWorkout(cw);
      })
      .catch(() => {
        if (!cancelled) {
          setSourceBlocked(true);
          setSourcePrefillError('Cost Workout could not be loaded — the quotation form was left empty.');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSourceCwId, isEdit]);

  /**
   * Hydrate the Quotation form from a Profit Workout record.
   *
   * Same field-for-field mapping as the backend's PW → Quotation conversion
   * (QuotationService#createFromProfitWorkout): customer/contact/reference block
   * and the item rows (description, unit, qty, selling ÷ qty as the rate, the
   * Profit Workout's own GST rate). Quotation-owned fields (currency, tax type,
   * discount, charges, freight, insurance, terms, signature, display options)
   * keep the form's values and its own recalculation applies on save.
   */
  // Function declaration (not a const) so the deep-link effect below can call it
  // without a temporal-dead-zone reference — same as the Cost Workout hydration.
  function hydrateFromProfitWorkout(pw) {
    setForm((prev) => ({
      ...prev,
      sourcePw: pw.pwNo || '',
      // The quotation's Reference field is the PW → Quotation link
      // ("Generated from Profit Workout <pwNo>"); the reference is not rendered
      // in this form, so it stays intact for the backend's duplicate check.
      reference: pw.pwNo ? `Generated from Profit Workout ${pw.pwNo}` : prev.reference,
      leadNo: pw.sourceLead || prev.leadNo,
      clientName: pw.customerName || pw.company || prev.clientName,
      contactPerson: pw.contactPerson || prev.contactPerson,
      // The Profit Workout's "Prepared By" is the form's Sales Person.
      salesPerson: pw.preparedBy || prev.salesPerson,
      email: pw.email || prev.email,
      phone: pw.phone || prev.phone,
      address: pw.billingAddress || prev.address,
      gstin: pw.gst || prev.gstin,
      pan: pw.pan || prev.pan,
      billingAddress: pw.billingAddress || prev.billingAddress,
      shipSameAsBill: true,
      shippingAddress: pw.shippingAddress || pw.billingAddress || prev.shippingAddress,
      remarks: pw.remarks || prev.remarks,
      // CPR link (the backend takes the CPR number/id and its client from here).
      sourceCpr: pw.cprRef || pw.linkedCpr || prev.sourceCpr,
      cprId: pw.cprId ?? prev.cprId,
      referencePrNo: pw.cprRef || pw.linkedCpr || prev.referencePrNo,
      referencePrSource: (pw.cprId || pw.cprRef) ? 'CPR' : prev.referencePrSource,
      taxType: 'GST'
    }));

    // Items — every Profit Workout item becomes one quotation row through the
    // shared mapper, replacing the grid wholesale (a re-run never appends).
    const pwItems = Array.isArray(pw.items) ? pw.items : [];
    if (pwItems.length > 0) {
      const gstRate = pwConversionGstRate(pw);
      setItems(
        pwItems.map((pwItem) => ({
          id: nextId(),
          rowType: 'item',
          ...quotationItemFromPwItem(pwItem, { gstRate })
        }))
      );
      applyGstRateToAll(gstRate);
    }
  }

  // Profit Workout deep-link (?sourcePw=<id>): the Profit Workout list's
  // "Convert to Quotation" opens THIS form prefilled and stays read-only — the
  // quotation is only created when the user presses a save action. The existing
  // one-PW→one-quotation rule is enforced by the backend on save (409 naming the
  // existing quotation); it is also reported here up front so a user who opens
  // an already-converted Profit Workout is never shown a misleading form.
  useEffect(() => {
    if (!prefillSourcePwId || isEdit) return;
    let cancelled = false;
    profitWorkoutService
      .getPw(prefillSourcePwId, { suppressGlobalError: true })
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data ?? res;
        const pw = raw?.data ?? raw;
        if (!pw?.id) {
          setSourceBlocked(true);
          setSourcePrefillError('Profit Workout could not be loaded — the quotation form was left empty.');
          return;
        }
        if (pw.convertedToQtn) {
          setSourceBlocked(true);
          setSourcePrefillError(`Profit Workout already converted to quotation '${pw.convertedToQtn}'.`);
          return;
        }
        setSourceBlocked(false);
        setSourcePrefillError('');
        hydrateFromProfitWorkout(pw);
      })
      .catch(() => {
        if (!cancelled) {
          setSourceBlocked(true);
          setSourcePrefillError('Profit Workout could not be loaded — the quotation form was left empty.');
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillSourcePwId, isEdit]);

  // ================= ITEM GRID (ERP 14-column editable grid) =================

  // Header GST rate dropdown — applies the chosen rate to every item row.
  // When no item rows exist yet, only the header state is set so the choice
  // isn't reset by the prevItems sync; new rows inherit it on Add Item.
  // Hoisted declaration: the Cost Workout hydration above applies the source
  // GST rate through this function.
  function applyGstRateToAll(rate) {
    setGstRate(rate);
    // Skip rewriting items when every row already carries this rate — this
    // keeps the header text input from being re-synced mid-typing (e.g. "2.").
    const unchanged = items.every((it) => it.rowType !== 'item' || Number(it.gstRate) === rate);
    if (unchanged) return;
    setItems((prev) => prev.map((it) => (it.rowType === 'item' ? { ...it, gstRate: rate } : it)));
  }

  // Free-text header GST rate input: keep the raw text in the input and push
  // the parsed percentage to every item row (empty/invalid input → 0%).
  const handleGstRateTextInput = (raw) => {
    setGstRateText(raw);
    const cleaned = String(raw).replace(/[^\d.-]/g, '');
    const n = cleaned === '' ? 0 : Number(cleaned);
    if (Number.isFinite(n)) applyGstRateToAll(n);
  };

  const addItemRow = (data = {}) => {
    setItems((prev) => [
      ...prev,
      {
        id: nextId(),
        rowType: 'item',
        productId: data.productId || null,
        productName: data.productName || data.name || '',
        description: data.description || data.name || '',
        sku: data.sku || data.code || '',
        drawingNo: data.drawingNo || '',
        material: data.material || '',
        leadTime: data.leadTime || data.delivery || '',
        hsn: data.hsn || '',
        batchCode: data.batchCode || '',
        expiryDate: data.expiryDate || '',
        descriptionRows: Array.isArray(data.descriptionRows) ? data.descriptionRows : [],
        gstRate: data.gstRate != null && data.gstRate !== ''
          ? Number(data.gstRate)
          : data.tax != null && data.tax !== ''
            ? Number(data.tax)
            : Number(gstRate) || 0,
        unit: data.unit || 'Nos',
        qty: data.qty || 1,
        rate: Number(data.rate) || 0,
        discountPct: Number(data.discount || 0) || 0,
        // Every new row starts with EMPTY custom values — a new row must never
        // inherit another row's values.
        customFields: {}
      }
    ]);
  };

  const duplicateItemRow = (idx) => {
    setItems((prev) => {
      const source = prev[idx];
      if (!source || source.rowType !== 'item') return prev;
      const copy = { ...source, id: nextId() };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  };

  const deleteItemRow = (idx) => {
    setItems((prev) => {
      const source = prev[idx];
      if (!source) return prev;
      // Single-row safety: if this is the last item row, keep one blank row
      if (source.rowType === 'item') {
        const itemCount = prev.filter((x) => x.rowType === 'item').length;
        if (itemCount <= 1) {
          return prev.map((it, i) => i === idx ? { ...it, ...{
            productId: null, productName: '', description: '', sku: '',
            drawingNo: '', material: '', leadTime: '', hsn: '',
            batchCode: '', expiryDate: '', gstRate: 0, unit: 'Nos',
            qty: 1, rate: 0, discountPct: 0, descriptionRows: []
          }} : it);
        }
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const addGroupRow = () =>
    setItems((prev) => [...prev, { id: nextId(), rowType: 'group', groupName: '' }]);

  const addDescRow = () => {
    setItems((prev) => [...prev, { id: nextId(), rowType: 'desc', descText: '' }]);
  };

  const addImageRow = () =>
    setItems((prev) => [...prev, { id: nextId(), rowType: 'image', imageData: '', imageName: '' }]);

  const updateItem = (idx, patch) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  // apply "Round-off to Quantity / Rate" from the Number & Currency settings
  const applyRoundOff = (value, enabled) => {
    if (!enabled || value === '' || value == null) return value;
    const n = Number(value);
    return Number.isFinite(n) ? String(Math.round(n)) : value;
  };

  // ---- UOM manager: apply a chosen unit to the row the modal was opened
  // from (fall back to the last item row for the toolbar shortcut) ----
  const applyUnitToQuotation = (unitValue) => {
    const lastItemIdx = items.reduce((last, it, i) => (it.rowType === 'item' ? i : last), -1);
    const itemIdx =
      uomRowIdx != null && items[uomRowIdx] && items[uomRowIdx].rowType === 'item'
        ? uomRowIdx
        : lastItemIdx;
    if (itemIdx < 0) {
      toast.info('Add an item first, then choose a unit');
      return;
    }
    updateItem(itemIdx, { unit: unitValue });
    toast.success(`Unit "${unitValue}" applied to item`);
  };

  const selectProduct = (product) => {
    addItemRow(productToItem(product));
    setProductModal(false);
    setProductQuery('');
  };

  // Per-row product change: refill ONLY this item row from the same product
  // record (single mapping — productToItem). Description follows the product,
  // and any manual Description edits stay until a new product is picked.
  const applyProductToRow = (idx, product) => {
    updateItem(idx, productToItem(product));
  };

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        String(p.name || '').toLowerCase().includes(q) ||
        String(p.sku || '').toLowerCase().includes(q) ||
        String(p.hsn || '').toLowerCase().includes(q)
    );
  }, [products, productQuery]);

  const { rows: itemRows, subTotal, cgstTotal, sgstTotal, totalQty } = computeRows(
    items.filter((it) => it.rowType === 'item')
  );

  const discount = Number(form.discountPct) || 0;
  const charges = Number(form.charges) || 0;
  const freight = Number(form.freight) || 0;
  const insurance = Number(form.insurance) || 0;
  const grandTotal = Math.max(0, subTotal + cgstTotal + sgstTotal - discount + charges + freight + insurance);
  const totalItems = items.filter((it) => it.rowType === 'item').length;

  // ================= TERMS (ERP qtnTermsTable) =================
  const addTerm = (title = '', desc = '') =>
    setTerms((prev) => [...prev, { id: nextId(), title, description: desc, isGroup: false }]);

  const addTermGroup = () =>
    setTerms((prev) => [...prev, { id: nextId(), title: '', description: '', isGroup: true }]);

  const insertDefaultTerm = (text) => addTerm(text, '');

  const updateTerm = (idx, patch) =>
    setTerms((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));

  const removeTerm = (idx) => setTerms((prev) => prev.filter((_, i) => i !== idx));

  // ================= CUSTOM FIELDS (Add Custom Fields) =================
  const CUSTOM_FIELD_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'number', label: 'Number' },
    { value: 'date', label: 'Date' },
    { value: 'dropdown', label: 'Dropdown' },
    { value: 'checkbox', label: 'Checkbox' }
  ];

  // ================= Reference PR No (direct creation) =================

  /**
   * Open the "Add New Reference PR No." form, prefilled with whatever the user
   * typed in the combobox. Registration goes through the real Spring Boot
   * backend (POST /pr-references) and is immediately selected on this quotation;
   * no CPR row, revision or history entry is created by this path.
   */
  const openPrRefModal = (seed = '') => {
    setPrRefDraft({
      referencePrNo: String(seed || '').trim(),
      project: '',
      requestedBy: '',
      prDate: new Date().toISOString().split('T')[0],
      description: '',
      remarks: ''
    });
    setPrRefModal(true);
  };

  const savePrReference = async () => {
    const ref = String(prRefDraft.referencePrNo || '').trim();
    if (!ref) {
      toast.error('Reference PR No is required');
      return;
    }
    setPrRefSaving(true);
    try {
      const res = await prReferenceService.create({
        referencePrNo: ref,
        clientId: form.clientId === '' ? null : form.clientId,
        clientName: form.clientName || null,
        project: prRefDraft.project || null,
        description: prRefDraft.description || null,
        requestedBy: prRefDraft.requestedBy || null,
        prDate: prRefDraft.prDate || null,
        remarks: prRefDraft.remarks || null
      });
      const created = res?.data ?? null;
      if (!created?.referencePrNo) throw new Error('The backend did not return the new Reference PR No.');
      setPrRefModal(false);
      applyDirectPrReference(created.referencePrNo, created);
      toast.success(`Reference PR No ${created.referencePrNo} created`);
    } catch (err) {
      // A duplicate PR No is a real validation outcome — show the backend text.
      toast.error(err?.message || 'Unable to create the Reference PR No.');
    } finally {
      setPrRefSaving(false);
    }
  };

  // ================= Add New Client (inline) =================

  const openClientModal = () => {
    setClientDraft({
      businessName: form.clientName || '',
      contactPerson: form.contactPerson || '',
      email: form.email || '',
      phone: form.phone || '',
      gstin: form.gstin || '',
      pan: form.pan || '',
      billingAddress: form.billingAddress || '',
      billingCity: form.billingCity || '',
      billingState: form.billingState || '',
      billingPin: form.billingPin || '',
      country: form.country || 'India'
    });
    setClientModal(true);
  };

  /**
   * Creates the client in the CRM Customers table through the real backend and
   * selects it on this quotation. No navigation — the quotation form (including
   * every unsaved field and item row) stays exactly as the user left it.
   */
  const saveNewClient = async () => {
    const businessName = String(clientDraft.businessName || '').trim();
    if (!businessName) {
      toast.error('Client name is required');
      return;
    }
    setClientSaving(true);
    try {
      const res = await customerService.create({
        businessName,
        contactPerson: clientDraft.contactPerson || '',
        email: clientDraft.email || '',
        phone: clientDraft.phone || '',
        gstin: clientDraft.gstin || '',
        pan: clientDraft.pan || '',
        billingAddress: clientDraft.billingAddress || '',
        billingCity: clientDraft.billingCity || '',
        billingState: clientDraft.billingState || '',
        billingPin: clientDraft.billingPin || '',
        country: clientDraft.country || 'India',
        status: 'active'
      });
      const created = res?.data ?? null;
      if (!created?.id) throw new Error('The backend did not return the new client.');
      setClientModal(false);
      handleClientSelect(created);
      toast.success(`Client ${businessName} created`);
    } catch (err) {
      toast.error(err?.message || 'Unable to create the client.');
    } finally {
      setClientSaving(false);
    }
  };

  const openCustomFieldModal = (idx = null) => {
    if (idx != null && customFields[idx]) {
      const f = customFields[idx];
      setCfDraft({ name: f.name, type: f.type, value: f.value, options: f.options });
      setCfEditing(idx);
    } else {
      setCfDraft({ name: '', type: 'text', value: '', options: '' });
      setCfEditing(null);
    }
    setCfModal(true);
  };

  const saveCustomField = () => {
    const name = String(cfDraft.name || '').trim();
    if (!name) {
      toast.error('Field name is required');
      return;
    }
    const field = {
      name,
      type: cfDraft.type || 'text',
      value: cfDraft.type === 'checkbox' ? !!cfDraft.value : cfDraft.value ?? '',
      options: String(cfDraft.options || '')
    };
    if (cfEditing != null) {
      setCustomFields((prev) => prev.map((f, i) => (i === cfEditing ? { ...field, id: f.id } : f)));
    } else {
      setCustomFields((prev) => [...prev, { ...field, id: nextId() }]);
    }
    setCfModal(false);
    setCfEditing(null);
    toast.success('Custom field saved');
  };

  const removeCustomField = (idx) => {
    setCustomFields((prev) => prev.filter((_, i) => i !== idx));
    toast.success('Custom field removed');
  };

  const customFieldValueText = (f) => {
    if (f.type === 'checkbox') return f.value ? 'Yes' : 'No';
    const v = String(f.value ?? '');
    return v === '' ? '—' : v;
  };

  // ================= SIGNATURE =================
  const sigTypeChanged = (type) => {
    setField('signatureType', type);
    setSigPadMode(type === 'Use Signature Pad');
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const startDraw = (e) => {
    drawingRef.current = true;
    const canvas = sigCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    ctx.beginPath();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.moveTo(x, y);
  };
  const moveDraw = (e) => {
    if (!drawingRef.current) return;
    const canvas = sigCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const endDraw = () => {
    drawingRef.current = false;
  };

  // ================= LOGO =================
  const handleLogo = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setLogo(ev.target.result);
    reader.readAsDataURL(file);
  };
  const removeLogo = () => setLogo('');

  // ================= ATTACHMENTS =================
  const handleAttachments = (e) => {
    const all = Array.from(e.target.files || []);
    const list = all.filter((file) => {
      const err = getAttachmentSelectionError(file);
      if (err) {
        toast.warning(err.message);
        return false;
      }
      return true;
    });
    setFiles((prev) => [...prev, ...list]);
    e.target.value = '';
  };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const uploadQueued = async (docId) => {
    if (files.length === 0) return 0;
    const results = await quotationService.uploadMany(docId, files, {});
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    if (ok > 0) toast.success(`${ok} attachment(s) uploaded`);
    if (failed > 0) {
      const firstFailed = results.find((r) => !r.ok);
      toast.error(
        failed === results.length && firstFailed?.error?.message
          ? firstFailed.error.message
          : `${failed} attachment(s) failed to upload`
      );
    }
    setFiles([]);
    return ok;
  };

  // ================= VALIDATION (unchanged from the generic page) =================
  const validate = () => {
    if (!String(form.quotationNo || '').trim()) {
      toast.error('Quotation No is required.');
      return false;
    }
    if (!form.clientName) {
      toast.error('Please select or enter a Client name.');
      return false;
    }
    if (items.filter((it) => it.rowType === 'item').length === 0) {
      toast.error('Add at least one item.');
      return false;
    }
    // A date is only ever saved as a real YYYY-MM-DD with a four-digit year.
    // The inputs already refuse anything else, so this is the backstop: a form
    // whose value came from somewhere other than those inputs (a stored draft,
    // an older record reopened for edit) cannot be saved with an impossible
    // date such as a six-digit year.
    const invalidDate = [
      ['Quotation Date', form.quotationDate],
      ['Valid Till Date', form.validUntil]
    ].find(([, value]) => String(value ?? '').trim() !== '' && dateInputValue(value) === null);
    if (invalidDate) {
      toast.error(`${invalidDate[0]} must be a valid date with a four-digit year (YYYY-MM-DD).`);
      return false;
    }
    return true;
  };

  const buildTermsString = () =>
    terms
      .map((t) => `${t.isGroup ? '[GROUP] ' : ''}${t.title}: ${t.description}`.trim())
      .filter(Boolean)
      .join('\n');

  const save = async ({ draft = false, continueToDesign = false, resetAfter = false } = {}) => {
    if (!draft && !validate()) return;
    setSaving(true);
    try {
      const payload = serializeQuotation(
        {
          ...form,
          customFields,
          terms: buildTermsString(),
          showTotalPdf: form.showTotalPdf,
          // new feature settings ride along — backend ignores unknown props,
          // so they persist with the document wherever the backend stores them
          numberSystem: numberSettings.numberSystem,
          country: numberSettings.country,
          decimalDigits: numberSettings.decimalDigits,
          roundOffQty: numberSettings.roundOffQty,
          roundOffRate: numberSettings.roundOffRate,
          customCurrencySymbol: numberSettings.customCurrencySymbol
        },
        itemRows
      );
      // Exchange-rate bookkeeping: a saved quotation keeps the rate used when
      // its currency was set, unless the user explicitly recalculates later.
      const cur = form.currency || 'INR';
      const storedRate = Number(form.exchangeRate);
      const keepStored =
        isEdit && Number.isFinite(storedRate) && storedRate > 0 && origCurrencyRef.current === cur;
      const liveRate = cur === ratesBase ? 1 : Number(exchangeRates[cur]);
      payload.exchangeRate = keepStored
        ? storedRate
        : Number.isFinite(liveRate) && liveRate > 0
          ? liveRate
          : undefined;
      payload.baseCurrency = form.baseCurrency || ratesBase;
      const res = isEdit ? await quotationService.update(id, payload) : await quotationService.create(payload, draft);
      const created = res?.data ?? {};
      const docId = created?.id || id;
      await uploadQueued(docId);
      // Clear the unsaved draft from localStorage after successful save
      clearFormDraft();
      if (draft) {
        toast.info('Draft saved');
        setSaving(false);
        return;
      }
      const no = created.quotationNo || form.quotationNo || '';
      toast.success(`${no} saved`);
      if (resetAfter) {
        setForm({ ...emptyForm(), quotationNo: '' });
        setItems([]);
        setTerms([]);
        setCustomFields([]);
        const next = await quotationService.getNextNumber();
        if (next?.data?.quotationNo) setForm((prev) => ({ ...prev, quotationNo: next.data.quotationNo }));
      } else if (continueToDesign) {
        navigate(`/quotations/design?id=${docId}`);
      } else {
        navigate('/quotations');
      }
    } catch (err) {
      const message = err?.message || 'Failed to save quotation';
      // One Cost Workout → one quotation: the backend rejects a second save with
      // 409 and names the existing document. Show it in the form's own banner so
      // it stays readable while every entered value is kept — nothing is lost and
      // no second quotation was created.
      if ((form.sourceCw && /already exists for Cost Workout/i.test(message))
        || (form.sourcePw && /already exists for Profit Workout/i.test(message))) {
        setSourcePrefillError(message);
      }
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = () => save({ draft: true });
  const saveNew = () => save({ resetAfter: true });
  const saveContinue = () => save({ continueToDesign: true });

  // ---- Number & Currency Format: persist + apply ----
  const handleSaveNumberSettings = (settings) => {
    saveNumberSettings(settings);
    setNumberSettings(settings);
    toast.success('Number & currency format saved');
  };

  // ---- Fixed item-grid structure (handwritten reference):
  // S.NO | SKU | QTY | UOM | [HSN] | DESCRIPTION | [BATCH CODE | EXPIRY DATE]
  //       | GST(CGST|SGST) | RATE | AMOUNT | TOTAL | Actions
  // HSN is optional — shown only while the existing "HSN Column View"
  // Advanced Option (form.hsnView) is enabled; the other columns reflow.
  // Batch Code + Expiry Date appear only while "Display Batch Details"
  // (form.batch) is enabled — their saved values are never lost.
  // SKU is on by default (reference ERP renders it before Qty); the "Show SKU"
  // Advanced Option can hide the column while keeping the stored value.
  const showHsn = form.hsnView;
  const showSku = form.showSku !== false;

  // ---- Manageable / resizable Quotation item grid ---------------------------
  // The same Manage Columns experience as the CPR Item Details grid (rename,
  // reorder, hide/show, Add Custom Column, remove, reset) plus drag-to-resize,
  // persisted in MySQL through the shared grid-config store and restored
  // exactly on refresh/reopen. Custom column values ride with each row in
  // row.customFields and are saved per item (quotation_items.custom_fields_json).
  const quotationGrid = useManagedGrid({
    gridKey: 'sales.items.quotation',
    defaults: () => defaultQuotationItemColumns({ showSku, showHsn }),
    insertBeforeKeys: ['actions'],
    itemNoun: 'item',
    rowCount: items.filter((x) => x.rowType === 'item').length,
    removeColumnValues: (columnId) => setItems((prev) => prev.map((it) => {
      if (!it || !it.customFields) return it;
      const cf = { ...it.customFields };
      delete cf[columnId];
      return { ...it, customFields: cf };
    }))
  });
  const qResize = quotationGrid.resize;
  // The Advanced Options (Show SKU / HSN Column View) still hide their column
  // independently of the saved configuration.
  //
  // The row TOTAL is inserted here, immediately before ACTIONS, as a structural
  // column of this grid (see QUOTATION_ROW_TOTAL_COLUMN): it is rendered from
  // the row's own live calculation and is deliberately not part of the saved
  // column configuration, which the quotation preview/PDF surfaces share and
  // could not resolve for a saved (total-less) record.
  const qCols = useMemo(
    () => withRowTotalColumn(
      quotationGrid.visibleColumns
        .filter((c) => (c.key === 'sku' ? showSku : true))
        .filter((c) => (c.key === 'hsn' ? showHsn : true))
    ),
    [quotationGrid.visibleColumns, showSku, showHsn]
  );
  // The row TOTAL takes the header treatment S.No / ACTIONS already get: no
  // rename control either way (its label is the fixed "TOTAL"), and no resize
  // handle — resizing commits the column list, and a display-only column must
  // never be written into the saved (shared) configuration. S.No keeps the
  // resize handle it has always had.
  const canRenameCol = (c) => !['sno', 'actions', QUOTATION_ROW_TOTAL_COLUMN.key].includes(c.key);
  const canResizeCol = (c) => c.key !== 'actions' && c.key !== QUOTATION_ROW_TOTAL_COLUMN.key;
  const colCount = qCols.length;
  const qTableMinWidth = qCols.reduce((sum, c) => sum + qResize.widthOf(c), 0);

  const updateItemCustomField = (index, columnId, value) => {
    setItems((prev) => prev.map((it, i) => (
      i === index ? { ...it, customFields: { ...(it.customFields || {}), [columnId]: value } } : it
    )));
  };

  // GST type lives in the table header: CGST + SGST (intra-state split) or IGST
  // (inter-state single column). Any stored taxType containing "igst" renders the
  // IGST layout; everything else keeps the CGST/SGST split.
  const isIgst = String(form.taxType || '').toLowerCase().includes('igst');

  const renderItemRows = () =>
    items.map((it, idx) => {
      // running index within item rows only (group/desc/image/unit rows don't consume one)
      const idxOf = items.slice(0, idx).filter((x) => x.rowType === 'item').length + 1;
      if (it.rowType === 'group') {
        return (
          <tr key={it.id} className="item-table-row item-group-row">
            <td colSpan={colCount} style={{ padding: '0 10px', height: 44 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%' }}>
                <Layers size={14} color="#0B4A3D" />
                <input
                  value={it.groupName || ''}
                  onChange={(e) => updateItem(idx, { groupName: e.target.value })}
                  placeholder="Group name"
                  style={{ fontWeight: 600, border: 'none', background: 'transparent', width: '100%', outline: 'none', fontFamily: 'Inter,sans-serif', fontSize: 13, color: '#1f2937' }}
                />
              </span>
            </td>
          </tr>
        );
      }
      if (it.rowType === 'desc') {
        return (
          <tr key={it.id} className="item-table-row item-desc-row">
            <td colSpan={colCount} style={{ padding: '4px 10px 8px' }}>
              <textarea
                rows={2}
                value={it.descText || ''}
                onChange={(e) => updateItem(idx, { descText: e.target.value })}
                placeholder="Enter description..."
                style={{ width: '100%', margin: 0, fontSize: 13 }}
              />
            </td>
          </tr>
        );
      }
      if (it.rowType === 'image') {
        return (
          <tr key={it.id} className="item-table-row item-desc-row">
            <td colSpan={colCount} style={{ padding: '6px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#0B4A3D', fontSize: 12, fontWeight: 500 }}>
                  <ImageIcon size={14} /> Choose Image
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = (ev) => updateItem(idx, { imageData: ev.target.result, imageName: file.name });
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
                {it.imageData && (
                  <img src={it.imageData} alt={it.imageName} style={{ maxHeight: 60, borderRadius: 6 }} />
                )}
              </div>
            </td>
          </tr>
        );
      }
      if (it.rowType === 'unit') {
        return (
          <tr key={it.id} className="item-table-row">
            <td colSpan={colCount - 1} style={{ textAlign: 'right', paddingRight: 8, color: '#6B7280', fontSize: 12 }}>
              Unit
            </td>
            <td colSpan={1}>
              <input
                value={extraUnit}
                onChange={(e) => setExtraUnit(e.target.value)}
                placeholder="unit"
                style={{ width: 90, textAlign: 'center' }}
              />
            </td>
          </tr>
        );
      }
      // Standard item row — cells are rendered in the user's managed column
      // order, with the same per-cell behavior as before. Columns can be
      // renamed, reordered, hidden, resized and extended with custom columns
      // (values stored per row in it.customFields).
      const calc = itemRows[idxOf - 1];
      const gstHalf = Number(it.gstRate || 0) / 2;
      const cellFor = (col) => {
        switch (col.key) {
          case 'sno':
            return <td key={col.id} className="it-td-sno">{idxOf}</td>;
          case 'sku':
            return (
              <td key={col.id} className="it-td-sku">
                {/* SKU sits before Qty (reference ERP order); stored + persisted
                    as part of the quotation item data (QuotationItem.sku). */}
                <input
                  type="text"
                  value={it.sku || ''}
                  onChange={(e) => updateItem(idx, { sku: e.target.value })}
                  placeholder="SKU"
                />
              </td>
            );
          case 'qty':
            return (
              <td key={col.id} className="it-td-qty">
                <input
                  type="number"
                  value={it.qty ?? 1}
                  min="0.01"
                  step="0.01"
                  onChange={(e) => updateItem(idx, { qty: applyRoundOff(e.target.value, numberSettings.roundOffQty) })}
                  placeholder="0"
                />
              </td>
            );
          case 'unit':
            return (
              <td key={col.id} className="it-td-uom">
                {/* Editable, searchable UOM dropdown backed by the shared /masters/units
                    list. The "Manage Units…" footer opens the UOM manager modal; its
                    changes refresh this dropdown via unitRefreshKey. */}
                <EditableMasterDropdown
                  key={`uom-${idx}-${unitRefreshKey}`}
                  masterKey="units"
                  value={it.unit || 'Nos'}
                  onChange={(v) => updateItem(idx, { unit: v })}
                  placeholder="UOM"
                  portal
                  inputClassName="it-unit-dd"
                  manageLabel="Units"
                  onManage={() => {
                    setUomRowIdx(idx);
                    setUomModal(true);
                  }}
                />
              </td>
            );
          case 'hsn':
            return (
              <td key={col.id} className="it-td-hsn">
                <input type="text" value={it.hsn || ''} onChange={(e) => updateItem(idx, { hsn: e.target.value })} placeholder="HSN" />
              </td>
            );
          case 'desc':
            return (
              <td key={col.id} className="it-td-desc">
                {/* Description — editable main field plus the dedicated
                    sub-fields (Drawing No / Material / Lead Time), stacked per row.
                    SKU lives in its own column before Qty (see above).
                    Users can also add/delete/edit custom description rows. */}
                <div className="it-desc-stack">
                  <div className="it-desc-field it-desc-main">
                    <label htmlFor={`itItemDesc-${it.id}`}>Description</label>
                    <input
                      id={`itItemDesc-${it.id}`}
                      type="text"
                      value={it.description || ''}
                      onChange={(e) => updateItem(idx, { description: e.target.value })}
                      placeholder="Enter item description"
                    />
                  </div>
                  <div className="it-desc-field">
                    <label htmlFor={`itDrawingNo-${it.id}`}>Drawing No</label>
                    <input
                      id={`itDrawingNo-${it.id}`}
                      type="text"
                      value={it.drawingNo || ''}
                      onChange={(e) => updateItem(idx, { drawingNo: e.target.value })}
                      placeholder="Drawing no"
                    />
                  </div>
                  <div className="it-desc-field">
                    <label htmlFor={`itMaterial-${it.id}`}>Material</label>
                    <input
                      id={`itMaterial-${it.id}`}
                      type="text"
                      value={it.material || ''}
                      onChange={(e) => updateItem(idx, { material: e.target.value })}
                      placeholder="Material"
                    />
                  </div>
                  <div className="it-desc-field">
                    <label htmlFor={`itLeadTime-${it.id}`}>Lead Time</label>
                    <input
                      id={`itLeadTime-${it.id}`}
                      type="text"
                      value={it.leadTime || ''}
                      onChange={(e) => updateItem(idx, { leadTime: e.target.value })}
                      placeholder="Lead Time"
                    />
                  </div>
                  {/* Custom description rows added by the user */}
                  {(it.descriptionRows || []).map((row, ri) => (
                    <div key={ri} className="it-desc-field it-desc-custom">
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <input
                          type="text"
                          className="it-desc-custom-label"
                          value={row.label || ''}
                          onChange={(e) => {
                            const newRows = [...(it.descriptionRows || [])];
                            newRows[ri] = { ...newRows[ri], label: e.target.value };
                            updateItem(idx, { descriptionRows: newRows });
                          }}
                          placeholder="Label"
                          style={{ fontWeight: 600, width: '40%' }}
                        />
                        <input
                          type="text"
                          className="it-desc-custom-value"
                          value={row.value || ''}
                          onChange={(e) => {
                            const newRows = [...(it.descriptionRows || [])];
                            newRows[ri] = { ...newRows[ri], value: e.target.value };
                            updateItem(idx, { descriptionRows: newRows });
                          }}
                          placeholder="Value"
                          style={{ flex: 1 }}
                        />
                        <button
                          type="button"
                          className="it-desc-delete-row"
                          title="Delete row"
                          onClick={() => {
                            const newRows = (it.descriptionRows || []).filter((_, i) => i !== ri);
                            updateItem(idx, { descriptionRows: newRows });
                          }}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e74c3c', fontSize: 14, padding: '0 2px' }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="it-desc-field">
                    <button
                      type="button"
                      className="it-desc-add-row"
                      onClick={() => {
                        const newRows = [...(it.descriptionRows || []), { label: '', value: '' }];
                        updateItem(idx, { descriptionRows: newRows });
                      }}
                      style={{ background: 'none', border: '1px dashed #999', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 12, color: '#555', marginTop: 2 }}
                    >
                      + Add Row
                    </button>
                  </div>
                </div>
              </td>
            );
          case 'gst':
            return (
              <td key={col.id} className="it-td-gst">
                <div className="it-gst-group">
                  {/* Per-row GST % — editable directly in the item row; changing it
                      recalculates CGST/SGST/Total via the shared line math. */}
                  <input
                    type="number"
                    className="it-gst-row-rate"
                    value={it.gstRate ?? 0}
                    min="0"
                    step="0.1"
                    onChange={(e) => updateItem(idx, { gstRate: e.target.value })}
                    placeholder="0%"
                    title="GST % for this item"
                  />
                  {isIgst ? (
                    <div className="it-gst-split it-gst-igst">
                      <span>{form.taxType || 'IGST'} {Number(it.gstRate) || 0}%</span>
                    </div>
                  ) : (
                    <div className="it-gst-split">
                      <span>CGST {gstHalf}%</span>
                      <span>SGST {gstHalf}%</span>
                    </div>
                  )}
                </div>
              </td>
            );
          case 'rate':
            return (
              <td key={col.id} className="it-td-rate">
                <input
                  type="number"
                  value={it.rate ?? 0}
                  min="0"
                  step="0.01"
                  onChange={(e) => updateItem(idx, { rate: applyRoundOff(e.target.value, numberSettings.roundOffRate) })}
                  placeholder="0.00"
                />
              </td>
            );
          case 'amount':
            // AMOUNT is the row's BASE (net) amount — quantity × rate less the
            // line discount, BEFORE tax — so it stays exactly as it is.
            return <td key={col.id} className="it-td-amount">{formatMoney(calc ? calc.netAmt : 0, numberSettings)}</td>;
          case 'total':
            // The row TOTAL: the same line math the quotation summary uses
            // (`computeRows`), i.e. base (net) amount + CGST + SGST. It is the
            // only place the row's GST is added, so nothing is taxed twice, and
            // the column sums to subTotal + cgstTotal + sgstTotal of the summary
            // block below. Derived from the row on every render, so adding,
            // editing, duplicating or deleting a row (or changing qty / rate /
            // GST / discount) updates it immediately. Nothing is persisted.
            return (
              <td key={col.id} className="it-td-total">
                {formatMoney(calc ? calc.total : 0, numberSettings)}
              </td>
            );
          case 'actions':
            return (
              <td key={col.id} className="it-td-actions">
                <div className="it-row-actions" style={{ opacity: 1 }}>
                  <button
                    type="button"
                    className="it-row-action-btn"
                    title="Duplicate item"
                    onClick={() => duplicateItemRow(idx)}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    className="it-row-action-btn danger"
                    title="Delete item"
                    onClick={() => deleteItemRow(idx)}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </td>
            );
          default:
            // User-defined column — this row's OWN value (never copied from
            // another row), saved with the quotation item.
            return (
              <td key={col.id} className="it-td-custom">
                <input
                  type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
                  value={(it.customFields || {})[col.id] ?? ''}
                  onChange={(e) => updateItemCustomField(idx, col.id, e.target.value)}
                  placeholder={col.label}
                />
              </td>
            );
        }
      };
      return (
        <tr key={it.id} className="item-table-row">
          {qCols.map(cellFor)}
        </tr>
      );
    });

  if (loading) {
    return (
      <div className="qtn-create-page">
        <div className="qtn-create-inner">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 0' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #e5e7eb', borderTopColor: '#0B4A3D', animation: 'spin 0.8s linear infinite' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="erp-create-scope qtn-create-page">
      <div className="qtn-create-inner">
        {bulkBanner}
        {/* Cost Workout deep-link: an unusable source is explained here, in
            place, instead of silently leaving a half-empty form. */}
        {sourcePrefillError && (
          <div className="cpr-error-banner" role="alert" style={{ marginBottom: 16 }}>
            <p>{sourcePrefillError}</p>
            <button type="button" className="cpr-error-retry" onClick={() => setSourcePrefillError('')}>
              Dismiss
            </button>
          </div>
        )}
        {/* ===== BREADCRUMB (ERP client-breadcrumb) ===== */}
        <div className="qtn-breadcrumb">
          <Link to="/sales">Sales</Link>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <Link to="/sales">Sales Execution</Link>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <Link to={SALES_EXEC_HUB_TABS.quotations}>Quotations</Link>
          <ChevronRight size={10} style={{ color: '#cbd5e1' }} />
          <span>{isEdit ? 'Edit Quotation' : 'Create New Quotation'}</span>
        </div>

        {/* ===== PAGE HEAD — title ===== */}
        <div className="qtn-page-head">
          <h1 className="qtn-page-head-title">{isEdit ? 'Edit Quotation' : 'Create New Quotation'}</h1>
        </div>

        {/* ===== STEPPER ===== */}
        <div className="qtn-stepper">
          <div className="qtn-step active">
            <div className="qtn-step-num">1</div>
            <div className="qtn-step-text">Quotation Details</div>
          </div>
          <div className="qtn-step-divider" />
          <div className="qtn-step">
            <div className="qtn-step-num">2</div>
            <div className="qtn-step-text">
              <a onClick={() => saveContinue()}>Design &amp; Share</a>
            </div>
          </div>
        </div>

        {/* ===== 2-COLUMN LAYOUT (ERP Purchase so-form-layout): main form + totals sidebar ===== */}
        <div className="qtn-create-grid">
          <div className="qtn-main-form">
            {/* ===== SECTION 1: HEADER (Quotation) ===== */}
            <div className="qtn-card">
              <div className="qtn-card-body">
                <div className="qtn-section-title">Quotation</div>
                <div className="qtn-create-header-section">
                  <div className="qtn-create-header-fields">
                    <div className="qtn-grid-2" style={{ marginBottom: 16 }}>
                      <div className="qtn-field">
                        <label htmlFor="qtnNumber">Quotation No <span className="required">*</span></label>
                        <input
                          type="text"
                          className="qtn-input"
                          id="qtnNumber"
                          value={form.quotationNo}
                          onChange={(e) => setField('quotationNo', e.target.value)}
                          placeholder="QTN-YYYY-XXXXXX"
                        />
                      </div>
                      <div className="qtn-field">
                        <label htmlFor="qtnRefPrNo">
                          Reference PR No
                          <span style={{ fontWeight: 400, color: '#94A3B8' }}> (optional)</span>
                          {linkedCpr?.id && (
                            <span style={{ fontWeight: 500, color: '#64748B' }}>
                              {' '}· CPR {linkedCpr.prNo || linkedCpr.id}
                            </span>
                          )}
                        </label>
                        <PrNoCombobox
                          value={form.referencePrNo || ''}
                          disabled={historical}
                          onSelect={handlePrNoSelect}
                          onAddNew={openPrRefModal}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 16, marginTop: 2 }}>
                          {cprLoading && (
                            <span style={{ fontSize: 10, color: '#64748B' }}>Loading CPR details...</span>
                          )}
                          {!cprLoading && cprError && (
                            <>
                              <span className="qtn-prsrc is-cpr">CPR Reference</span>
                              <span style={{ fontSize: 10, color: '#DC2626' }}>
                                {cprError} — the CPR could not be read.
                              </span>
                              {form.cprId && (
                                <button
                                  type="button"
                                  onClick={refreshFromCpr}
                                  style={{
                                    fontSize: 10, color: '#0B4A3D', background: 'transparent',
                                    border: 'none', cursor: 'pointer', padding: 0,
                                    textDecoration: 'underline'
                                  }}
                                >
                                  Retry
                                </button>
                              )}
                            </>
                          )}
                          {!cprLoading && !cprError && linkedCpr?.id && (
                            <>
                              <span className="qtn-prsrc is-cpr">CPR Reference</span>
                              <button
                                type="button"
                                onClick={() => navigate(`/cprs/${linkedCpr.id}`)}
                                style={{
                                  fontSize: 10, color: '#0B4A3D', background: 'transparent',
                                  border: 'none', cursor: 'pointer', padding: 0,
                                  textDecoration: 'underline'
                                }}
                              >
                                View CPR
                              </button>
                              {!isEdit && (
                                <button
                                  type="button"
                                  onClick={refreshFromCpr}
                                  style={{
                                    fontSize: 10, color: '#64748B', background: 'transparent',
                                    border: 'none', cursor: 'pointer', padding: 0,
                                    textDecoration: 'underline'
                                  }}
                                >
                                  Refresh from CPR
                                </button>
                              )}
                            </>
                          )}
                          {!cprLoading && !cprError && !linkedCpr?.id && form.referencePrNo && form.referencePrSource !== 'CPR' && (
                            <>
                              <span className="qtn-prsrc is-direct">Direct PR Reference</span>
                              <span style={{ fontSize: 10, color: '#64748B' }}>
                                {form.prReferenceId
                                  ? 'Registered — no CPR required.'
                                  : 'No CPR carries this PR No yet. It will be registered on save.'}
                              </span>
                            </>
                          )}
                          {!cprLoading && !cprError && !form.referencePrNo && (
                            <span style={{ fontSize: 10, color: '#94A3B8' }}>
                              Not linked to a CPR — start from this quotation if needed.
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="qtn-grid-4">
                      <div className="qtn-field">
                        <label htmlFor="qtnDate">Quotation Date <span className="required">*</span></label>
                        <input
                          type="date"
                          className="qtn-input"
                          id="qtnDate"
                          max={MAX_DATE_INPUT}
                          value={form.quotationDate}
                          onChange={(e) => setDateField('quotationDate', e.target.value)}
                        />
                      </div>
                      <div className="qtn-field">
                        <label htmlFor="qtnValidTill">Valid Till Date <span className="required">*</span></label>
                        <input
                          type="date"
                          className="qtn-input"
                          id="qtnValidTill"
                          max={MAX_DATE_INPUT}
                          value={form.validUntil}
                          onChange={(e) => setDateField('validUntil', e.target.value)}
                        />
                      </div>
                      <div className="qtn-field">
                        <label>&nbsp;</label>
                        <a
                          onClick={() => openCustomFieldModal()}
                          style={{ fontSize: 13, color: '#0B4A3D', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6, height: 44, cursor: 'pointer' }}
                        >
                          <Plus size={14} /> Add Custom Fields
                        </a>
                      </div>
                    </div>
                    <input type="hidden" id="qtnLeadNo" value={form.leadNo} />
                  </div>
                  <div>
                    <div className="qtn-logo-upload" onClick={() => document.getElementById('qtnLogoFile')?.click()}>
                      <CloudUpload size={28} />
                      <span>Upload Logo</span>
                      {logo && <img src={logo} alt="logo" />}
                      <input type="file" id="qtnLogoFile" accept="image/*" onChange={handleLogo} />
                    </div>
                    <div className="qtn-logo-actions">
                      <button type="button" onClick={() => document.getElementById('qtnLogoFile')?.click()}>Change Logo</button>
                      <button type="button" onClick={removeLogo}>Remove Logo</button>
                    </div>
                  </div>
                </div>

                {/* ===== CUSTOM FIELDS (Add Custom Fields) ===== */}
                {customFields.length > 0 && (
                  <div className="qtn-custom-fields">
                    <div className="qtn-custom-fields-title">
                      <Layers size={14} /> Custom Fields
                    </div>
                    {customFields.map((f, i) => (
                      <div className="qtn-custom-field-row" key={f.id ?? i}>
                        <span className="qtn-custom-field-name">{f.name}</span>
                        <span className="qtn-custom-field-value">{customFieldValueText(f)}</span>
                        <button type="button" className="qtn-custom-field-action" onClick={() => openCustomFieldModal(i)} title="Edit" aria-label="Edit custom field">
                          <PenLine size={13} />
                        </button>
                        <button type="button" className="qtn-custom-field-action danger" onClick={() => removeCustomField(i)} title="Delete" aria-label="Delete custom field">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ===== SECTION 2: COMPANY & CLIENT (party grid) ===== */}
            <div className="qtn-party-grid">
              <div className="qtn-party-card">
                <h4>
                  <span className="party-title">
                    <Building2 size={14} color="#0B4A3D" /> Quotation From
                  </span>
                  <button type="button" className="edit-btn" onClick={() => toast.info('Edit company profile')}>Edit</button>
                </h4>
                <div className="qtn-party-fields">
                  <div className="qtn-field">
                    <label htmlFor="qtnFromCompany">Company</label>
                    <EditableMasterDropdown
                      id="qtnFromCompany"
                      masterKey="companies"
                      inputClassName="qtn-input"
                      value={form.fromCompany}
                      placeholder="Select Company"
                      onChange={(v) => {
                        setField('fromCompany', v);
                        if (v) setField('fromName', v);
                      }}
                    />
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qtnFromName">Company Name</label>
                    <input type="text" className="qtn-input" id="qtnFromName" value={form.fromName} onChange={(e) => setField('fromName', e.target.value)} placeholder="Company name" />
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qtnFromAddress">Address</label>
                    <input type="text" className="qtn-input" id="qtnFromAddress" value={form.fromAddress} onChange={(e) => setField('fromAddress', e.target.value)} placeholder="Address" />
                  </div>
                  <div className="qtn-grid-2">
                    <div className="qtn-field">
                      <label htmlFor="qtnFromGst">GSTIN</label>
                      <input type="text" className="qtn-input" id="qtnFromGst" value={form.fromGstin} onChange={(e) => setField('fromGstin', e.target.value)} placeholder="GSTIN" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnFromPan">PAN</label>
                      <input type="text" className="qtn-input" id="qtnFromPan" value={form.fromPan} onChange={(e) => setField('fromPan', e.target.value)} placeholder="PAN" />
                    </div>
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qtnFromEmail">Email</label>
                    <input type="email" className="qtn-input" id="qtnFromEmail" value={form.fromEmail} onChange={(e) => setField('fromEmail', e.target.value)} placeholder="Email" />
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qtnFromPhone">Phone</label>
                    <input type="text" className="qtn-input" id="qtnFromPhone" value={form.fromPhone} onChange={(e) => setField('fromPhone', e.target.value)} placeholder="Phone" />
                  </div>
                </div>
              </div>

              <div className="qtn-party-card">
                <h4>
                  <span className="party-title">
                    <User size={14} color="#0B4A3D" /> Quotation For
                  </span>
                </h4>
                <div className="qtn-party-fields">
                  <div className="qtn-field">
                    <label htmlFor="qtnClientLookup">Client</label>
                    <ClientLookup
                      value={form.clientName}
                      onChange={(name) => setField('clientName', name)}
                      onAutoFill={handleClientSelect}
                      portal
                    />
                  </div>
                  <div className="qtn-grid-2">
                    <div className="qtn-field">
                      <label htmlFor="qtnClientName">Client Name</label>
                      <input type="text" className="qtn-input" id="qtnClientName" value={form.clientName} onChange={(e) => setField('clientName', e.target.value)} placeholder="Client name" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnClientContact">Contact Person</label>
                      <input type="text" className="qtn-input" id="qtnClientContact" value={form.contactPerson} onChange={(e) => setField('contactPerson', e.target.value)} placeholder="Contact person" />
                    </div>
                  </div>
                  <div className="qtn-grid-2">
                    <div className="qtn-field">
                      <label htmlFor="qtnClientEmail">Email</label>
                      <input type="email" className="qtn-input" id="qtnClientEmail" value={form.email} onChange={(e) => setField('email', e.target.value)} placeholder="Email" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnClientPhone">Phone</label>
                      <input type="text" className="qtn-input" id="qtnClientPhone" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="Phone" />
                    </div>
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qtnClientAddress">Address</label>
                    <input type="text" className="qtn-input" id="qtnClientAddress" value={form.address} onChange={(e) => setField('address', e.target.value)} placeholder="Address" />
                  </div>
                  <div className="qtn-grid-3">
                    <div className="qtn-field">
                      <label htmlFor="qtnClientCity">City</label>
                      <input type="text" className="qtn-input" id="qtnClientCity" value={form.city} onChange={(e) => setField('city', e.target.value)} placeholder="City" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnClientState">State</label>
                      <input type="text" className="qtn-input" id="qtnClientState" value={form.state} onChange={(e) => setField('state', e.target.value)} placeholder="State" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnClientPin">PIN</label>
                      <input type="text" className="qtn-input" id="qtnClientPin" value={form.pin} onChange={(e) => setField('pin', e.target.value)} placeholder="PIN" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnClientCountry">Country</label>
                      <input type="text" className="qtn-input" id="qtnClientCountry" value={form.country} onChange={(e) => setField('country', e.target.value)} placeholder="Country" />
                    </div>
                  </div>
                  <div className="qtn-grid-2">
                    <div className="qtn-field">
                      <label htmlFor="qtnClientGstin">GSTIN</label>
                      <input type="text" className="qtn-input" id="qtnClientGstin" value={form.gstin} onChange={(e) => setField('gstin', e.target.value)} placeholder="GSTIN" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnClientPan">PAN</label>
                      <input type="text" className="qtn-input" id="qtnClientPan" value={form.pan} onChange={(e) => setField('pan', e.target.value)} placeholder="PAN" />
                    </div>
                  </div>
                  {/* Creates the client through the real CRM backend and selects it
                      on THIS quotation — the form is never navigated away from, so
                      no unsaved quotation data is lost. */}
                  <button
                    type="button"
                    className="qtn-link-btn"
                    style={{ marginTop: 4 }}
                    onClick={openClientModal}
                    disabled={historical}
                  >
                    <Plus size={13} /> Add New Client
                  </button>
                </div>
              </div>
            </div>

            {/* ===== BILLING + SHIPPING ADDRESSES =====
                Side-by-side two-column grid — same structure as the Clients/Company
                layout (two equal cards, 16px gap, stacked below 768px). Billing is
                the LEFT card, Shipping the RIGHT card. Fields are unchanged. */}
            <div className="qtn-grid-2">
              <div className="qtn-card">
                <div className="qtn-card-header">
                  <h3><MapPin size={14} color="#0B4A3D" /> Billing Address</h3>
                </div>
                <div className="qtn-card-body">
                  <div className="qtn-field">
                    <label htmlFor="qtnBillAddress">Address</label>
                    <textarea className="qtn-input" id="qtnBillAddress" rows={2} value={form.billingAddress} onChange={(e) => setField('billingAddress', e.target.value)} placeholder="Billing address" />
                  </div>
                  <div className="qtn-grid-3" style={{ marginTop: 16 }}>
                    <div className="qtn-field">
                      <label htmlFor="qtnBillCity">City</label>
                      <input type="text" className="qtn-input" id="qtnBillCity" value={form.billingCity} onChange={(e) => setField('billingCity', e.target.value)} placeholder="City" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnBillState">State</label>
                      <input type="text" className="qtn-input" id="qtnBillState" value={form.billingState} onChange={(e) => setField('billingState', e.target.value)} placeholder="State" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnBillPin">PIN</label>
                      <input type="text" className="qtn-input" id="qtnBillPin" value={form.billingPin} onChange={(e) => setField('billingPin', e.target.value)} placeholder="PIN" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="qtn-card">
                <div className="qtn-card-header">
                  <h3><Truck size={14} color="#0B4A3D" /> Shipping Address</h3>
                  <label style={{ fontSize: 12, color: '#6B7280', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input type="checkbox" id="qtnShipSameAsBill" checked={form.shipSameAsBill} onChange={(e) => handleShipSameAsBill(e.target.checked)} style={{ accentColor: '#0B4A3D', width: 14, height: 14 }} />
                    Same as Billing
                  </label>
                </div>
                <div className="qtn-card-body">
                  <div className="qtn-field">
                    <label htmlFor="qtnShipAddress">Address</label>
                    <textarea className="qtn-input" id="qtnShipAddress" rows={2} value={form.shippingAddress} onChange={(e) => setField('shippingAddress', e.target.value)} placeholder="Shipping address" />
                  </div>
                  <div className="qtn-grid-3" style={{ marginTop: 16 }}>
                    <div className="qtn-field">
                      <label htmlFor="qtnShipCity">City</label>
                      <input type="text" className="qtn-input" id="qtnShipCity" value={form.shippingCity} onChange={(e) => setField('shippingCity', e.target.value)} placeholder="City" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnShipState">State</label>
                      <input type="text" className="qtn-input" id="qtnShipState" value={form.shippingState} onChange={(e) => setField('shippingState', e.target.value)} placeholder="State" />
                    </div>
                    <div className="qtn-field">
                      <label htmlFor="qtnShipPin">PIN</label>
                      <input type="text" className="qtn-input" id="qtnShipPin" value={form.shippingPin} onChange={(e) => setField('shippingPin', e.target.value)} placeholder="PIN" />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ===== SECTION 3: SETTINGS BAR ===== */}
            <div className="qtn-card">
              <div className="qtn-card-body">
                <div className="qtn-settings-bar">
                  {/* GST type/rate are selected in the Items table header */}
                  <div className="qtn-field">
                    <label htmlFor="qtnCurrency">Currency</label>
                    <CurrencyDropdown
                      id="qtnCurrency"
                      value={form.currency}
                      onChange={handleCurrencyChange}
                      placeholder="Currency"
                      inputClassName="qtn-select qtn-editable-select"
                    />
                  </div>
                  <div className="qtn-field">
                    <label htmlFor="qtnNumFormat">Number Format</label>
                    <select className="qtn-select" id="qtnNumFormat" value={form.numberFormat} onChange={(e) => setField('numberFormat', e.target.value)}>
                      {NUMBER_FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>
                  <span className="qtn-settings-divider" aria-hidden="true" />
                  <button type="button" className="qtn-link-btn" onClick={() => setNumFormatModal(true)}>
                    <Coins size={13} /> Number &amp; Currency Format
                  </button>
                </div>
              </div>
            </div>

            {/* ===== SECTION 4: ITEMS — Enterprise Editable Data Grid ===== */}
            <div className="qtn-card">
              <div className="item-table-section" style={{ border: 'none', borderRadius: 0, marginBottom: 0, boxShadow: 'none' }}>
                <div className="item-table-header">
                  <h3><List size={14} /> Items</h3>
                  <div className="item-table-header-actions">
                    <button type="button" className="it-btn-add" onClick={() => addItemRow()}>
                      <Plus size={13} /> Add Row
                    </button>
                    <button type="button" className="it-btn-header" onClick={() => setProductModal(true)}>
                      <Package size={13} /> Products
                    </button>
                    <button type="button" className="it-btn-header" onClick={addGroupRow}>
                      <Layers size={13} /> Group
                    </button>
                    <button type="button" className="it-btn-header" onClick={addDescRow}>
                      <AlignLeft size={13} /> Desc
                    </button>
                    <button type="button" className="it-btn-header" onClick={addImageRow}>
                      <ImageIcon size={13} /> Image
                    </button>
                    <button type="button" className="it-btn-header" onClick={() => setUomModal(true)}>
                      <Scale size={13} /> Unit
                    </button>
                    {/* Same Manage Columns experience as the CPR Item Details grid,
                        persisted in MySQL and restored exactly on reopen. */}
                    <ManageColumnsButton manager={quotationGrid.manager} />
                  </div>
                </div>
                <div className="item-table-wrap">
                  <table style={{ tableLayout: 'fixed', minWidth: qTableMinWidth }}>
                    <colgroup>
                      {qCols.map((c) => (
                        c.key === 'desc' ? (
                          <col
                            key={c.id}
                            className="it-col-desc"
                            style={{ width: form.descFull ? Math.max(380, qResize.widthOf(c)) : qResize.widthOf(c) }}
                          />
                        ) : (
                          <col key={c.id} style={{ width: qResize.widthOf(c) }} />
                        )
                      ))}
                    </colgroup>
                    <thead>
                      <tr>
                        {qCols.map((c) => (
                          <th
                            key={c.id}
                            className={`it-th-${c.key === 'actions' ? 'actions' : c.key} grid-resizable-th`}
                            style={{ width: qResize.widthOf(c) }}
                          >
                            {c.key === 'gst' ? (
                              <div className="it-gst-header">
                                <input
                                  type="text"
                                  className="it-gst-type-select"
                                  value={form.taxType}
                                  onChange={(e) => setField('taxType', e.target.value)}
                                  placeholder="GST"
                                  title="GST label — free text (e.g. GST, IGST, VAT, Tax)"
                                />
                                <input
                                  type="text"
                                  className="it-gst-rate-select"
                                  value={gstRateText}
                                  onChange={(e) => handleGstRateTextInput(e.target.value)}
                                  placeholder="0"
                                  title="GST rate % — applies to all items"
                                />
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap">
                                {c.label}
                                {canRenameCol(c) && (
                                  <ColumnRenameButton manager={quotationGrid.manager} column={c} />
                                )}
                              </span>
                            )}
                            {canResizeCol(c) && <ColumnResizer column={c} resize={qResize} />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody id="qtnItemsBody">
                      {renderItemRows()}
                      {items.length === 0 && (
                        <tr>
                          <td colSpan={colCount} style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px 0', fontSize: 12 }}>
                            No items added yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="item-table-footer">
                  <div className="item-table-footer-left">
                    <div className="item-table-footer-stat">
                      <span className="stat-label">Total Items</span>
                      <span className="stat-value" id="itFooterItems">{totalItems}</span>
                    </div>
                    <div className="item-table-footer-stat">
                      <span className="stat-label">Total Qty</span>
                      <span className="stat-value" id="itFooterQty">{totalQty.toFixed(2)}</span>
                    </div>
                    <div className="item-table-footer-stat">
                      <span className="stat-label">Estimated Value</span>
                      <span className="stat-value primary" id="itFooterValue">{formatMoney(subTotal, numberSettings)}</span>
                    </div>
                  </div>
                  <div className="item-table-footer-right">
                    <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                      <ChevronUp size={11} /> Use arrow buttons to reorder
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Manage Columns popup + remove/reset confirmations (portal-rendered) */}


            {/* ===== SECTION 5 + 6: SIGNATURE & ATTACHMENTS (LEFT) | ADDITIONAL (RIGHT)
                Side-by-side two-column grid — same structure as the Clients/Company
                layout (two equal cards, 16px gap, stacked below 768px). Only the
                positioning changed; all fields, handlers and behavior are untouched. */}
            <div className="qtn-grid-2">
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><PenLine size={14} /> Signature &amp; Attachments</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qtn-sa-grid">
                  <div className="qtn-sa-left">
                    <div className="qtn-sig-type">
                      <div className="qtn-field" style={{ flex: 1 }}>
                        <label>Signature Type</label>
                        <select className="qtn-select" id="qtnSigType" value={form.signatureType} onChange={(e) => sigTypeChanged(e.target.value)}>
                          {SIGNATURE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    {!sigPadMode ? (
                      <div>
                        <div className="qtn-sa-drop" onClick={() => document.getElementById('qtnSigFile')?.click()}>
                          <CloudUpload size={36} />
                          <span>Click to upload signature</span>
                          <input type="file" id="qtnSigFile" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = (ev) => setSigPreview(ev.target.result);
                            reader.readAsDataURL(file);
                          }} />
                        </div>
                        <div className="qtn-sa-preview" id="qtnSigPreview">
                          {sigPreview ? (
                            <img src={sigPreview} alt="signature" />
                          ) : (
                            <span style={{ color: '#9ca3af', fontSize: 12 }}>Signature preview</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div>
                        <canvas
                          id="qtnSignaturePad"
                          ref={sigCanvasRef}
                          width={400}
                          height={150}
                          className="qtn-sa-canvas"
                          onMouseDown={startDraw}
                          onMouseMove={moveDraw}
                          onMouseUp={endDraw}
                          onMouseLeave={endDraw}
                        />
                        <button type="button" className="qtn-link-btn" style={{ marginTop: 8 }} onClick={clearSignature}>
                          <Undo2 size={12} /> Clear
                        </button>
                      </div>
                    )}
                    <div className="qtn-field" style={{ marginTop: 4 }}>
                      <label htmlFor="qtnSigLabel">Signature Label</label>
                      <input type="text" className="qtn-input" id="qtnSigLabel" value={form.signatureLabel} onChange={(e) => setField('signatureLabel', e.target.value)} placeholder="e.g. Authorised Signatory" />
                    </div>
                  </div>
                  <div className="qtn-sa-right">
                    <div className="qtn-sa-dropzone" onClick={() => document.getElementById('qtnAttachments')?.click()}>
                      <CloudUpload size={36} />
                      <span>Drop files here or click to browse</span>
                      <span className="qtn-sa-formats">Supports: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG</span>
                      <input type="file" id="qtnAttachments" multiple style={{ display: 'none' }} onChange={handleAttachments} />
                      <div style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="qtn-link-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            document.getElementById('qtnAttachments')?.click();
                          }}
                        >
                          <FolderOpen size={13} /> Browse Files
                        </button>
                      </div>
                    </div>
                    <div id="qtnAttachList" className="qtn-sa-file-list">
                      {files.map((f, idx) => (
                        <div key={idx} className="qtn-sa-file-row">
                          <Paperclip size={13} color="#0B4A3D" style={{ flexShrink: 0 }} />
                          <span className="file-name">{f.name}</span>
                          <span className="file-size">({Math.round(f.size / 1024)} KB)</span>
                          <span className="file-actions">
                            <button type="button" className="danger" title="Remove" onClick={() => removeFile(idx)}>
                              <X size={13} />
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><PlusCircle size={14} /> Additional</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qtn-addon-grid">
                  <div className="qtn-addon-box" onClick={() => setShowNotes((v) => !v)}>
                    <StickyNote size={18} /> <span>Add Notes</span>
                  </div>
                  <div className="qtn-addon-box" onClick={() => setShowAddInfo((v) => !v)}>
                    <Info size={18} /> <span>Add Additional Info</span>
                  </div>
                  <div className="qtn-addon-box" onClick={() => setShowContact((v) => !v)}>
                    <BookUser size={18} /> <span>Add Contact Details</span>
                  </div>
                </div>
                {showNotes && (
                  <div id="qtnNotesSection" className="qtn-addon-section">
                    <div className="qtn-field">
                      <label htmlFor="qtnNotes">Notes</label>
                      <textarea className="qtn-input" id="qtnNotes" rows={3} value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Customer notes..." />
                    </div>
                  </div>
                )}
                {showAddInfo && (
                  <div id="qtnAddInfoSection" className="qtn-addon-section">
                    <div className="qtn-field">
                      <label htmlFor="qtnAdditionalInfo">Additional Information</label>
                      <textarea className="qtn-input" id="qtnAdditionalInfo" rows={3} value={form.additionalInfo} onChange={(e) => setField('additionalInfo', e.target.value)} placeholder="Any additional info..." />
                    </div>
                  </div>
                )}
                {showContact && (
                  <div id="qtnContactSection" className="qtn-addon-section">
                    <div className="qtn-grid-2">
                      <div className="qtn-field">
                        <label htmlFor="qtnContactEmail">Contact Email</label>
                        <input type="email" className="qtn-input" id="qtnContactEmail" value={form.contactEmail} onChange={(e) => setField('contactEmail', e.target.value)} placeholder="Contact email" />
                      </div>
                      <div className="qtn-field">
                        <label htmlFor="qtnContactPhone">Contact Phone</label>
                        <input type="text" className="qtn-input" id="qtnContactPhone" value={form.contactPhone} onChange={(e) => setField('contactPhone', e.target.value)} placeholder="Contact phone" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </div>

            {/* ===== TERMS & CONDITIONS ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><FileText size={14} /> Terms &amp; Conditions</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qtn-terms-default">
                  <button type="button" onClick={() => insertDefaultTerm('Lead Time: 2-3 weeks from order confirmation')}>Lead Time</button>
                  <button type="button" onClick={() => insertDefaultTerm('Payment Terms: 50% advance, 50% on delivery')}>Payment Terms</button>
                  <button type="button" onClick={() => insertDefaultTerm('Delivery Terms: FOB - Bangalore')}>Delivery Terms</button>
                  <button type="button" onClick={() => insertDefaultTerm('Warranty: 12 months from installation')}>Warranty</button>
                  <button type="button" onClick={() => insertDefaultTerm('QC : Quality report will be shared prior of dispatch')}>QC</button>
                  <button type="button" onClick={() => insertDefaultTerm('Validity: This quote is valid for 30 days')}>Validity</button>
                </div>
                <div className="qtn-items-toolbar" style={{ paddingTop: 0, display: 'flex', gap: 12, paddingBottom: 12 }}>
                  <button type="button" className="qtn-link-btn" onClick={() => addTerm()}>
                    <Plus size={13} /> Add New Term
                  </button>
                  <button type="button" className="qtn-link-btn" onClick={addTermGroup}>
                    <Layers size={13} /> Add New Group
                  </button>
                </div>
                <table className="qtn-terms-table" id="qtnTermsTable">
                  <thead>
                    <tr><th>#</th><th>Term</th><th>Description</th><th>Actions</th></tr>
                  </thead>
                  <tbody id="qtnTermsBody">
                    {terms.map((t, idx) => (
                      <tr key={t.id} style={t.isGroup ? { background: '#E8F0EE', fontWeight: 600 } : undefined}>
                        <td>{idx + 1}</td>
                        <td>
                          <input value={t.title} onChange={(e) => updateTerm(idx, { title: e.target.value })} placeholder="Term" style={{ fontWeight: t.isGroup ? 600 : 400 }} />
                        </td>
                        <td>
                          <input value={t.description} onChange={(e) => updateTerm(idx, { description: e.target.value })} placeholder="Description" />
                        </td>
                        <td>
                          <div className="term-actions">
                            <button type="button" title="Remove" className="danger" onClick={() => removeTerm(idx)}>
                              <X size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {terms.length === 0 && (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', color: '#9CA3AF', padding: '10px 0', fontSize: 12 }}>
                          No terms added yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* ===== ADVANCED OPTIONS ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><Settings size={14} /> Advanced Options</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qtn-adv-grid">
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advHsn" checked={form.hsnView} onChange={(e) => setField('hsnView', e.target.checked)} />
                    <label htmlFor="advHsn">HSN Column View</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advUnit" checked={form.displayUnit} onChange={(e) => setField('displayUnit', e.target.checked)} />
                    <label htmlFor="advUnit">Display Unit As</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advTaxSummary" checked={form.taxSummary} onChange={(e) => setField('taxSummary', e.target.checked)} />
                    <label htmlFor="advTaxSummary">Tax Summary Display</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advHidePlace" checked={form.hidePlace} onChange={(e) => setField('hidePlace', e.target.checked)} />
                    <label htmlFor="advHidePlace">Hide Place/Country of Supply</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advHsnSummary" checked={form.hsnSummary} onChange={(e) => setField('hsnSummary', e.target.checked)} />
                    <label htmlFor="advHsnSummary">Show HSN Summary</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advOriginalImages" checked={form.originalImages} onChange={(e) => setField('originalImages', e.target.checked)} />
                    <label htmlFor="advOriginalImages">Add Original Images</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advThumbnails" checked={form.thumbnails} onChange={(e) => setField('thumbnails', e.target.checked)} />
                    <label htmlFor="advThumbnails">Show Thumbnails</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advDescFull" checked={form.descFull} onChange={(e) => setField('descFull', e.target.checked)} />
                    <label htmlFor="advDescFull">Show Description Full Width</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advHideSubtotal" checked={form.hideSubtotal} onChange={(e) => setField('hideSubtotal', e.target.checked)} />
                    <label htmlFor="advHideSubtotal">Hide Subtotal For Group Items</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advSku" checked={form.showSku} onChange={(e) => setField('showSku', e.target.checked)} />
                    <label htmlFor="advSku">Show SKU</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advSerial" checked={form.serial} onChange={(e) => setField('serial', e.target.checked)} />
                    <label htmlFor="advSerial">Show Serial Numbers</label>
                  </div>
                  <div className="qtn-adv-option">
                    <input type="checkbox" id="advBatch" checked={form.batch} onChange={(e) => setField('batch', e.target.checked)} />
                    <label htmlFor="advBatch">Display Batch Details</label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== RIGHT COLUMN — Totals card (top) + Internal Notes ===== */}
          <div className="qtn-sidebar-form">
            {/* ===== TOTALS (sticky right-side column, top-right) ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><Calculator size={14} /> Totals</h3>
              </div>
              <div className="qtn-card-body">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f3f4f6' }}>
                  <input type="checkbox" id="qtnShowTotalPdf" checked={form.showTotalPdf} onChange={(e) => setField('showTotalPdf', e.target.checked)} style={{ accentColor: '#0B4A3D', width: 16, height: 16 }} />
                  <label htmlFor="qtnShowTotalPdf" style={{ fontSize: 13, color: '#374151', cursor: 'pointer' }}>Show Total In PDF</label>
                </div>
                <div className="sh-totals-card-body">
                  <div className="sh-total-row">
                    <span className="sh-total-label">Sub Total</span>
                    <span className="sh-total-value" id="qtnDisplayAmount">{formatMoney(subTotal, numberSettings)}</span>
                  </div>
                  <div className="sh-total-row">
                    <span className="sh-total-label">CGST</span>
                    <span className="sh-total-value" id="qtnDisplayCGST">{formatMoney(cgstTotal, numberSettings)}</span>
                  </div>
                  <div className="sh-total-row">
                    <span className="sh-total-label">SGST</span>
                    <span className="sh-total-value" id="qtnDisplaySGST">{formatMoney(sgstTotal, numberSettings)}</span>
                  </div>
                  <div className="sh-total-row">
                    <span className="sh-total-label">Discount</span>
                    <input type="number" className="sh-total-input" id="qtnDiscount" value={form.discountPct} min="0" step="0.01" onChange={(e) => setField('discountPct', e.target.value)} />
                  </div>
                  <div className="sh-total-row">
                    <span className="sh-total-label">Charges</span>
                    <input type="number" className="sh-total-input" id="qtnAdditionalCharges" value={form.charges} min="0" step="0.01" onChange={(e) => setField('charges', e.target.value)} />
                  </div>
                  <div className="sh-total-divider" />
                  <div className="sh-total-row sh-total-grand">
                    <span className="sh-total-label">Grand Total ({form.currency || 'INR'})</span>
                    <span className="sh-total-value" id="qtnDisplayGrandTotal">{formatMoney(grandTotal, numberSettings)}</span>
                  </div>
                  <div className="sh-total-words" id="qtnTotalInWords">{numberToWordsINR(grandTotal)}</div>
                  <button type="button" className="sh-total-add-field" onClick={() => openCustomFieldModal()}>
                    <Plus size={12} /> Add Custom Fields
                  </button>
                </div>
              </div>
            </div>

            {/* ===== INTERNAL NOTES ===== */}
            <div className="qtn-card">
              <div className="qtn-card-header">
                <h3><Lock size={14} color="#0B4A3D" /> Internal Notes</h3>
              </div>
              <div className="qtn-card-body">
                <div className="qtn-field">
                  <textarea className="qtn-input" id="qtnInternalNotes" rows={3} value={form.internalNotes} onChange={(e) => setField('internalNotes', e.target.value)} placeholder="Internal notes (not visible to customer)..." />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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

      {/* ===== BOTTOM ACTION BAR (ERP standard creation action bar) ===== */}
      {/* A conversion route whose source cannot be used (already converted, or
          could not be loaded) must not save: the quotation would be created
          without its source reference and the one-source rule would be
          bypassed. Navigation stays available, the save actions do not. */}
      <CreationActionBar
        onBackToList={() => navigate(SALES_EXEC_HUB_TABS.quotations)}
        onCancel={() => navigate(SALES_EXEC_HUB_TABS.quotations)}
        onSaveDraft={saveDraft}
        onSaveNew={saveNew}
        onSave={saveContinue}
        saveLabel="Save & Continue"
        disabled={saving}
        locked={historical || sourceBlocked}
      />

      {/* ===== ADD / EDIT CUSTOM FIELD MODAL ===== */}
      {cfModal && (
        <div className="qtn-modal-overlay" onClick={() => setCfModal(false)}>
          <div className="qtn-modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="qtn-modal-header">
              <div className="qtn-modal-title">
                <h3>{cfEditing != null ? 'Edit Custom Field' : 'Add Custom Field'}</h3>
              </div>
              <button type="button" className="qtn-modal-close" onClick={() => setCfModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="qtn-modal-body">
              <div className="qtn-field" style={{ marginBottom: 14 }}>
                <label htmlFor="cfName">Field Name <span className="required">*</span></label>
                <input
                  type="text"
                  id="cfName"
                  className="qtn-input"
                  value={cfDraft.name}
                  onChange={(e) => setCfDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder="e.g. Project Code"
                />
              </div>
              <div className="qtn-field" style={{ marginBottom: 14 }}>
                <label htmlFor="cfType">Field Type</label>
                <select
                  id="cfType"
                  className="qtn-select"
                  value={cfDraft.type}
                  onChange={(e) =>
                    setCfDraft((d) => ({
                      ...d,
                      type: e.target.value,
                      value:
                        e.target.value === 'checkbox'
                          ? !!d.value
                          : typeof d.value === 'boolean'
                            ? ''
                            : d.value
                    }))
                  }
                >
                  {CUSTOM_FIELD_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {cfDraft.type === 'dropdown' && (
                <div className="qtn-field" style={{ marginBottom: 14 }}>
                  <label htmlFor="cfOptions">
                    Options <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 12 }}>(comma separated)</span>
                  </label>
                  <input
                    type="text"
                    id="cfOptions"
                    className="qtn-input"
                    value={cfDraft.options}
                    onChange={(e) => setCfDraft((d) => ({ ...d, options: e.target.value }))}
                    placeholder="e.g. 30 Days, 45 Days, 60 Days"
                  />
                </div>
              )}
              <div className="qtn-field">
                {cfDraft.type === 'checkbox' ? (
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      id="cfValue"
                      checked={!!cfDraft.value}
                      onChange={(e) => setCfDraft((d) => ({ ...d, value: e.target.checked }))}
                      style={{ accentColor: '#0B4A3D', width: 16, height: 16 }}
                    />
                    <span style={{ fontSize: 13, color: '#374151' }}>Checked</span>
                  </label>
                ) : cfDraft.type === 'dropdown' ? (
                  <>
                    <label htmlFor="cfValue">Field Value</label>
                    <select
                      id="cfValue"
                      className="qtn-select"
                      value={cfDraft.value ?? ''}
                      onChange={(e) => setCfDraft((d) => ({ ...d, value: e.target.value }))}
                    >
                      <option value="">Select...</option>
                      {String(cfDraft.options || '')
                        .split(',')
                        .map((o) => o.trim())
                        .filter(Boolean)
                        .map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                    </select>
                  </>
                ) : (
                  <>
                    <label htmlFor="cfValue">Field Value</label>
                    <input
                      type={cfDraft.type === 'date' ? 'date' : cfDraft.type === 'number' ? 'number' : 'text'}
                      id="cfValue"
                      className="qtn-input"
                      value={cfDraft.value ?? ''}
                      onChange={(e) => setCfDraft((d) => ({ ...d, value: e.target.value }))}
                      placeholder={cfDraft.type === 'number' ? '0' : 'Field value'}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="qtn-modal-footer">
              <div className="qtn-modal-footer-spacer" />
              <button type="button" className="qtn-modal-btn ghost" onClick={() => setCfModal(false)}>
                Cancel
              </button>
              <button type="button" className="qtn-modal-btn primary" onClick={saveCustomField}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== NUMBER & CURRENCY FORMAT MODAL (new feature) ===== */}
      <NumberCurrencyModal
        open={numFormatModal}
        onClose={() => setNumFormatModal(false)}
        settings={numberSettings}
        onSave={handleSaveNumberSettings}
      />

      {/* ===== UOM (UNIT OF MEASURE) MANAGER MODAL ===== */}
      <UomManagerModal
        open={uomModal}
        onClose={() => {
          setUomModal(false);
          setUomRowIdx(null);
        }}
        onApply={applyUnitToQuotation}
        onChanged={() => setUnitRefreshKey((k) => k + 1)}
        inUseUnits={items.filter((it) => it.rowType === 'item' && it.unit).map((it) => it.unit)}
      />

      {/* ===== ADD NEW REFERENCE PR NO. (no CPR required) =====
          Registers the PR No through the real backend (pr_references) and
          selects it on this quotation. Existing CPR-carried PR numbers are
          rejected by the backend with a clear duplicate message. */}
      {prRefModal && (
        <div className="qtn-modal-overlay" onClick={() => setPrRefModal(false)}>
          <div className="qtn-modal" style={{ maxWidth: 620 }} onClick={(e) => e.stopPropagation()}>
            <div className="qtn-modal-header">
              <h3><FileText size={16} color="#0B4A3D" /> Add New Reference PR No.</h3>
              <button type="button" className="qtn-modal-close" onClick={() => setPrRefModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="qtn-modal-body">
              <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                The Reference PR No is created independently of a CPR. It becomes selectable in
                every future quotation, and if a CPR is later raised for the same PR No it is
                linked automatically — no duplicate records.
              </p>
              <div className="qtn-grid-2">
                <div className="qtn-field">
                  <label htmlFor="prRefNo">Reference PR No <span className="required">*</span></label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="prRefNo"
                    value={prRefDraft.referencePrNo}
                    onChange={(e) => setPrRefDraft((p) => ({ ...p, referencePrNo: e.target.value }))}
                    placeholder="PR-2026-0160"
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="prRefDate">PR Date</label>
                  <input
                    type="date"
                    className="qtn-input"
                    id="prRefDate"
                    value={prRefDraft.prDate}
                    onChange={(e) => setPrRefDraft((p) => ({ ...p, prDate: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="prRefProject">Project / Enquiry</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="prRefProject"
                    value={prRefDraft.project}
                    onChange={(e) => setPrRefDraft((p) => ({ ...p, project: e.target.value }))}
                    placeholder="Project or enquiry reference"
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="prRefRequestedBy">Requested By</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="prRefRequestedBy"
                    value={prRefDraft.requestedBy}
                    onChange={(e) => setPrRefDraft((p) => ({ ...p, requestedBy: e.target.value }))}
                    placeholder="Customer contact / department"
                  />
                </div>
              </div>
              <div className="qtn-field" style={{ marginTop: 12 }}>
                <label htmlFor="prRefDescription">Description</label>
                <textarea
                  className="qtn-input"
                  id="prRefDescription"
                  rows={2}
                  value={prRefDraft.description}
                  onChange={(e) => setPrRefDraft((p) => ({ ...p, description: e.target.value }))}
                  placeholder="What the customer asked for"
                />
              </div>
              <div className="qtn-field" style={{ marginTop: 12 }}>
                <label htmlFor="prRefRemarks">Remarks</label>
                <textarea
                  className="qtn-input"
                  id="prRefRemarks"
                  rows={2}
                  value={prRefDraft.remarks}
                  onChange={(e) => setPrRefDraft((p) => ({ ...p, remarks: e.target.value }))}
                  placeholder="Any additional context"
                />
              </div>
            </div>
            <div className="qtn-modal-footer">
              <div className="qtn-modal-footer-spacer" />
              <button type="button" className="qtn-modal-btn ghost" onClick={() => setPrRefModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="qtn-modal-btn primary"
                onClick={savePrReference}
                disabled={prRefSaving}
              >
                {prRefSaving ? 'Saving...' : 'Add Reference PR No.'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== ADD NEW CLIENT (saved to the CRM, no navigation) ===== */}
      {clientModal && (
        <div className="qtn-modal-overlay" onClick={() => setClientModal(false)}>
          <div className="qtn-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="qtn-modal-header">
              <h3><Building2 size={16} color="#0B4A3D" /> Add New Client</h3>
              <button type="button" className="qtn-modal-close" onClick={() => setClientModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="qtn-modal-body">
              <p style={{ fontSize: 12, color: '#64748B', marginBottom: 14 }}>
                The client is saved to the CRM and selected on this quotation. Nothing you have
                already typed here is lost.
              </p>
              <div className="qtn-grid-2">
                <div className="qtn-field">
                  <label htmlFor="clName">Client Name <span className="required">*</span></label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clName"
                    value={clientDraft.businessName}
                    onChange={(e) => setClientDraft((p) => ({ ...p, businessName: e.target.value }))}
                    placeholder="Business / client name"
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clContact">Contact Person</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clContact"
                    value={clientDraft.contactPerson}
                    onChange={(e) => setClientDraft((p) => ({ ...p, contactPerson: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clEmail">Email</label>
                  <input
                    type="email"
                    className="qtn-input"
                    id="clEmail"
                    value={clientDraft.email}
                    onChange={(e) => setClientDraft((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clPhone">Phone</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clPhone"
                    value={clientDraft.phone}
                    onChange={(e) => setClientDraft((p) => ({ ...p, phone: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clGstin">GSTIN</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clGstin"
                    value={clientDraft.gstin}
                    onChange={(e) => setClientDraft((p) => ({ ...p, gstin: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clPan">PAN</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clPan"
                    value={clientDraft.pan}
                    onChange={(e) => setClientDraft((p) => ({ ...p, pan: e.target.value }))}
                  />
                </div>
              </div>
              <div className="qtn-field" style={{ marginTop: 12 }}>
                <label htmlFor="clAddress">Billing Address</label>
                <textarea
                  className="qtn-input"
                  id="clAddress"
                  rows={2}
                  value={clientDraft.billingAddress}
                  onChange={(e) => setClientDraft((p) => ({ ...p, billingAddress: e.target.value }))}
                />
              </div>
              <div className="qtn-grid-3" style={{ marginTop: 12 }}>
                <div className="qtn-field">
                  <label htmlFor="clCity">City</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clCity"
                    value={clientDraft.billingCity}
                    onChange={(e) => setClientDraft((p) => ({ ...p, billingCity: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clState">State</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clState"
                    value={clientDraft.billingState}
                    onChange={(e) => setClientDraft((p) => ({ ...p, billingState: e.target.value }))}
                  />
                </div>
                <div className="qtn-field">
                  <label htmlFor="clPin">PIN</label>
                  <input
                    type="text"
                    className="qtn-input"
                    id="clPin"
                    value={clientDraft.billingPin}
                    onChange={(e) => setClientDraft((p) => ({ ...p, billingPin: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="qtn-modal-footer">
              <div className="qtn-modal-footer-spacer" />
              <button type="button" className="qtn-modal-btn ghost" onClick={() => setClientModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="qtn-modal-btn primary"
                onClick={saveNewClient}
                disabled={clientSaving}
              >
                {clientSaving ? 'Saving...' : 'Save Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PRODUCT SELECTOR MODAL ===== */}
      {productModal && (
        <div className="qtn-modal-overlay" onClick={() => setProductModal(false)}>
          <div className="qtn-modal" onClick={(e) => e.stopPropagation()}>
            <div className="qtn-modal-header">
              <h3>Select Product</h3>
              <button type="button" className="qtn-modal-close" onClick={() => setProductModal(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="qtn-modal-body">
              <div style={{ position: 'relative', marginBottom: 12 }}>
                <input
                  type="text"
                  className="qtn-input"
                  placeholder="Search products..."
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  style={{ paddingRight: 36 }}
                />
                <Search size={15} style={{ position: 'absolute', right: 12, top: 14, color: '#9ca3af', pointerEvents: 'none' }} />
              </div>
              <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                {filteredProducts.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#9CA3AF', padding: '20px 0', fontSize: 12 }}>No products found</div>
                )}
                {filteredProducts.map((p) => (
                  <button type="button" key={p.id} className="qtn-product-item" onClick={() => selectProduct(p)}>
                    <span className="p-name">{p.name || '(No Name)'}</span>
                    <span className="p-meta">
                      {p.sku || ''} {p.hsn ? `· HSN ${p.hsn}` : ''} · {p.unit || ''} · ₹{Number(p.rate || 0).toLocaleString('en-IN')}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
