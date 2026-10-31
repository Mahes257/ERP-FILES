// Explicit ".js" extensions on the imports below keep this module loadable by
// plain Node too, so the pure Cost Workout → Quotation mapping it exports can be
// covered by `node --test` (tests/cost-workout-to-quotation-mapping.test.js)
// without a bundler.
import { CW_STATUS_META } from './costWorkoutConstants.js';
import { normalizeGridColumns, newCustomColumnId } from './gridColumns.js';
import { normalizeItemCustomFields } from './itemCustomFields.js';

export function isLeadTimeCategory(category) {
  return String(category || '').toLowerCase() === 'lead time';
}

/**
 * Default Cost Workout item grid columns.
 * `level` distinguishes item-level columns (rowSpan across categories) from
 * category-level columns (rendered per category row).
 */
const CW_COLUMN_DEFAULT_WIDTH = {
  sno: 50,
  cwDescription: 200,
  // Short, brief CPR description shown by the Cost Workout list — a narrower
  // column than the full description it sits next to.
  cwCprDescription: 180,
  cwQty: 85,
  cwCategory: 175,
  cwUnit: 150,
  cwRate: 110,
  cwAmount: 120,
  cwRemarks: 150,
  custom: 150
};

export function defaultCwItemColumns() {
  return [
    { id: 'sno', key: 'sno', label: '#', type: 'text', required: true, system: true, level: 'item', width: CW_COLUMN_DEFAULT_WIDTH.sno, order: 1 },
    { id: 'cwDescription', key: 'cwDescription', label: 'Description', type: 'text', required: true, system: true, level: 'item', width: CW_COLUMN_DEFAULT_WIDTH.cwDescription, order: 2 },
    { id: 'cwCprDescription', key: 'cwCprDescription', label: 'CPR Description', type: 'text', required: false, system: true, level: 'item', width: CW_COLUMN_DEFAULT_WIDTH.cwCprDescription, order: 3 },
    { id: 'cwQty', key: 'cwQty', label: 'Qty', type: 'number', required: true, system: true, level: 'item', width: CW_COLUMN_DEFAULT_WIDTH.cwQty, order: 4 },
    { id: 'cwCategory', key: 'cwCategory', label: 'Category', type: 'text', required: true, system: true, level: 'category', width: CW_COLUMN_DEFAULT_WIDTH.cwCategory, order: 5 },
    { id: 'cwUnit', key: 'cwUnit', label: 'Unit', type: 'text', required: true, system: true, level: 'category', width: CW_COLUMN_DEFAULT_WIDTH.cwUnit, order: 6 },
    { id: 'cwRate', key: 'cwRate', label: 'Rate', type: 'number', required: false, system: true, level: 'category', width: CW_COLUMN_DEFAULT_WIDTH.cwRate, order: 7 },
    { id: 'cwAmount', key: 'cwAmount', label: 'Amount', type: 'number', required: false, system: true, level: 'category', width: CW_COLUMN_DEFAULT_WIDTH.cwAmount, order: 8 },
    { id: 'cwRemarks', key: 'cwRemarks', label: 'Remarks', type: 'text', required: false, system: true, level: 'category', width: CW_COLUMN_DEFAULT_WIDTH.cwRemarks, order: 9 }
  ];
}

/** Sanitize a saved column list; falls back to defaults. */
export function normalizeCwItemColumns(raw) {
  const defaults = defaultCwItemColumns();
  if (!Array.isArray(raw) || raw.length === 0) return defaults;
  const seen = new Set();
  const cleaned = [];
  raw.forEach((c, i) => {
    if (!c || typeof c !== 'object') return;
    const id = typeof c.id === 'string' && c.id ? c.id : null;
    if (!id || seen.has(id)) return;
    seen.add(id);
    const def = defaults.find((d) => d.id === id);
    cleaned.push({
      id,
      key: typeof c.key === 'string' && c.key ? c.key : (def?.key || id),
      label: typeof c.label === 'string' && c.label ? c.label : (def?.label || id),
      type: typeof c.type === 'string' && c.type ? c.type : (def?.type || 'text'),
      required: Boolean(c.required ?? def?.required),
      system: Boolean(c.system ?? def?.system),
      hidden: Boolean(c.hidden),
      level: c.level || def?.level || 'category',
      width: c.width != null ? Math.min(900, Math.max(60, Number(c.width) || 150)) : (def?.width || CW_COLUMN_DEFAULT_WIDTH.custom),
      order: Number.isFinite(c.order) ? c.order : i
    });
  });
  return cleaned.sort((a, b) => a.order - b.order).map((c, i) => ({ ...c, order: i + 1 }));
}

/**
 * Shared mapping from a Lead/Client source record to the Cost Workout customer
 * form fields. Used by the create/edit form AND the preview/design editor so
 * manual selection, CPR prefill and preview autofill can never drift apart.
 */
export function customerPatchFromSource(item) {
  const d = item.data || {};
  const isClient = item.type === 'client';
  const customerName = isClient
    ? d.businessName || d.companyName || d.clientName || d.name || ''
    : d.company || d.businessName || d.name || d.customerName || '';
  const company = isClient ? d.businessName || d.companyName || '' : d.company || d.businessName || '';
  const contactPerson = d.contactPerson || d.primaryContact || d.contactName || d.title || d.name || '';
  const addr = [d.address, d.city, d.state, d.country].filter(Boolean).join(', ');
  return {
    customerName,
    contactPerson,
    phone: d.phone || d.mobile || '',
    email: d.email || '',
    company,
    gst: d.gst || d.gstin || d.taxId || '',
    pan: d.pan || d.panNumber || '',
    billingAddress: addr,
    shippingAddress: addr
  };
}

export function normalizeCw(raw = {}) {
  return {
    ...raw,
    cwNo: raw.cwNo || raw.id || '',
    cwDate: raw.cwDate || raw.date || '',
    status: raw.status || 'draft',
    preparedBy: raw.preparedBy || '',
    customerName: raw.customerName || raw.customer || '',
    cprRef: raw.cprRef || '',
    company: raw.company || '',
    // Explicitly converted Profit Workout reference (one CW → one PW).
    convertedToPw: raw.convertedToPw || '',
    convertedToPwId: raw.convertedToPwId != null ? Number(raw.convertedToPwId) : null,
    items: Array.isArray(raw.items) ? raw.items.map((it) => ({
      ...it,
      customFields: it.customFields && typeof it.customFields === 'object' && !Array.isArray(it.customFields)
        ? it.customFields
        : {},
      // Documents are stored per item (never at the Cost Workout level), so an
      // item's files survive reopening/reordering exactly with that item.
      attachments: Array.isArray(it.attachments) ? it.attachments : []
    })) : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    subtotal: Number(raw.subtotal) || 0,
    profitPct: Number(raw.profitPct) || 0,
    profitAmt: Number(raw.profitAmt) || 0,
    sellingPrice: Number(raw.sellingPrice) || 0,
    discountPct: Number(raw.discountPct) || 0,
    discountAmt: Number(raw.discountAmt) || 0,
    gstPct: raw.gstPct !== undefined && raw.gstPct !== null && raw.gstPct !== '' ? Number(raw.gstPct) : 18,
    gstAmt: Number(raw.gstAmt) || 0,
    grandTotal: Number(raw.grandTotal) || 0,
    attachments: Array.isArray(raw.attachments)
      ? raw.attachments
      : raw.attachmentsJson && typeof raw.attachmentsJson === 'string'
        ? safeParseJson(raw.attachmentsJson)
        : []
  };
}

function safeParseJson(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Exact calculation flow from the original ERP (js/cost-workout.js cwUpdateTotals):
 *   itemTotal  = Σ qty × rate over category rows (Lead Time categories contribute 0)
 *   subtotal   = Σ itemTotal
 *   profitAmt  = subtotal × profitPct / 100
 *   selling    = subtotal + profitAmt
 *   discountAmt= selling × discountPct / 100
 *   gstAmt     = (selling − discountAmt) × gstPct / 100
 *   grandTotal = (selling − discountAmt) + gstAmt
 */
export function calcCwTotals(items = [], profitPct = 0, discountPct = 0, gstPct = 18) {
  let subtotal = 0;
  const rows = [];

  items.forEach((item) => {
    const categories = Array.isArray(item.categories) ? item.categories : [];
    let itemTotal = 0;
    categories.forEach((cat) => {
      const qty = Number(cat.qty) || 0;
      const rate = Number(cat.rate) || 0;
      const leadTime = isLeadTimeCategory(cat.category);
      const amount = leadTime ? 0 : qty * rate;
      if (!leadTime) itemTotal += amount;
      rows.push({ ...cat, category: cat.category || 'Material Cost', qty, rate, amount });
    });
    subtotal += itemTotal;
  });

  const pProfit = Number(profitPct) || 0;
  const pDiscount = Number(discountPct) || 0;
  const pGst = gstPct === null || gstPct === undefined || gstPct === '' ? 18 : Number(gstPct) || 0;

  const profitAmt = (subtotal * pProfit) / 100;
  const sellingPrice = subtotal + profitAmt;
  const discountAmt = (sellingPrice * pDiscount) / 100;
  const afterDiscount = sellingPrice - discountAmt;
  const gstAmt = (afterDiscount * pGst) / 100;
  const grandTotal = afterDiscount + gstAmt;

  return {
    rows,
    subtotal: round2(subtotal),
    profitPct: pProfit,
    profitAmt: round2(profitAmt),
    sellingPrice: round2(sellingPrice),
    discountPct: pDiscount,
    discountAmt: round2(discountAmt),
    gstPct: pGst,
    gstAmt: round2(gstAmt),
    grandTotal: round2(grandTotal)
  };
}

export function cwDocument(cw = {}) {
  const normalized = normalizeCw(cw);
  return calcCwTotals(
    normalized.items,
    normalized.profitPct,
    normalized.discountPct,
    normalized.gstPct
  );
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function serializeCw(form = {}, items = []) {
  return {
    cwNo: form.cwNo || '',
    cwDate: form.cwDate || '',
    status: form.status || 'draft',
    preparedBy: form.preparedBy || '',
    contactPerson: form.contactPerson || '',
    department: form.department || '',
    sourceLead: form.sourceLead || '',
    // Full formatted Lead document number (LEAD-000077) when the CW is sourced
    // from a Lead — persisted so downstream modules can keep the reference.
    leadNo: form.leadNo || '',
    customerName: form.customerName || '',
    cprRef: form.cprRef || '',
    cprId: form.cprId != null && form.cprId !== '' ? Number(form.cprId) : null,
    phone: form.phone || '',
    email: form.email || '',
    company: form.company || '',
    gst: form.gst || '',
    pan: form.pan || '',
    linkedCpr: form.linkedCpr || '',
    billingAddress: form.billingAddress || '',
    shippingAddress: form.shippingAddress || '',
    remarks: form.remarks || '',
    profitPct: form.profitPct !== undefined && form.profitPct !== null && form.profitPct !== ''
      ? Number(form.profitPct) : 0,
    discountPct: form.discountPct !== undefined && form.discountPct !== null && form.discountPct !== ''
      ? Number(form.discountPct) : 0,
    gstPct: form.gstPct !== undefined && form.gstPct !== null && form.gstPct !== ''
      ? Number(form.gstPct) : 18,
    itemColumnsJson: form.itemColumnsJson || null,
    items: items.map((item) => ({
      description: item.description || '',
      // Independent field: the brief CPR description used by the CW list. Saved
      // exactly as entered (including blank) — never copied from description.
      cprDescription: item.cprDescription || '',
      qty: item.qty !== undefined && item.qty !== null && item.qty !== '' ? Number(item.qty) : 1,
      unit: item.unit || '',
      categories: (Array.isArray(item.categories) ? item.categories : []).map((cat) => ({
        category: cat.category || 'Material Cost',
        qty: Number(cat.qty) || 0,
        unit: cat.unit || 'Nos',
        rate: Number(cat.rate) || 0,
        notes: cat.notes || ''
      })),
      // Per-item documents. Always sent (even when empty) so a save never
      // silently drops the files an item already has.
      attachments: (Array.isArray(item.attachments) ? item.attachments : []).map((file) => ({
        name: file.name || '',
        size: Number(file.size) || 0,
        type: file.type || '',
        data: file.data || ''
      })),
      customFields: item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
        ? Object.fromEntries(Object.entries(item.customFields).filter(([k, v]) => k && v != null && String(v) !== ''))
        : {}
    })),
    // Attachments live at the CW record level (CostWorkoutRequest.attachments,
    // persisted as the CW's attachmentsJson) — NOT per item. This is what the
    // CW's Attachments tab reads back, so attachments uploaded in the sidebar
    // (or carried over from a converted CPR item) must be sent here.
    ...(Array.isArray(form.attachments) && form.attachments.length > 0
      ? {
          attachments: form.attachments
            .map((f) => ({
              name: f.name || f.fileName || '',
              size: Number(f.size) || 0,
              type: f.type || f.fileType || '',
              data: f.data || f.content || ''
            }))
            .filter((f) => f.name && f.data)
        }
      : {})
  };
}

/**
 * The Cost Workout's own GST rate for a conversion: a rate the record really
 * carries (including an explicit 0%) is used as saved, and only a missing value
 * falls back to the app-wide default. Mirrors the backend
 * (QuotationService#createFromCostWorkout → nvl(cw.getGstPct(), 18)).
 */
export function cwConversionGstRate(cw = {}) {
  const raw = cw?.gstPct;
  if (raw === null || raw === undefined || raw === '') return 18;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 18;
}

/**
 * One Cost Workout item → one Quotation item row (Cost Workout → Quotation).
 *
 * A Cost Workout holds the company's own costing of the job, so it is its item
 * rows that the quotation's item grid has to carry:
 *
 *   description / qty / unit  → productName, description, material, qty, unit
 *   its cost categories       → the row's cost (rate = category total ÷ qty, so
 *                               the quotation line total equals the Cost Workout
 *                               item total) AND the breakdown itself, kept
 *                               visible as the item's descriptionRows
 *                               [{label, value}]
 *   its "Lead Time" category  → the row's leadTime field, never money — the
 *                               Cost Workout excludes that row from its own
 *                               amounts too (isLeadTimeCategory / calcCwTotals)
 *   its user-defined columns  → customFields ({columnId: value})
 *
 * Mirrors the backend mapping in QuotationService#createFromCostWorkout so the
 * list action and the form deep-link produce the SAME quotation. No pricing is
 * computed here: the caller keeps the form's existing totals/tax/discount rules
 * and simply passes the Cost Workout's GST rate through.
 *
 * @param {object} cwItem  one item of the source Cost Workout (API shape)
 * @param {{gstRate?: number|string}} [options] the Cost Workout's GST rate
 * @returns {object} the quotation item row's data fields (no local row id)
 */
export function quotationItemFromCwItem(cwItem = {}, options = {}) {
  const fallbackGst = options.gstRate === null || options.gstRate === undefined || options.gstRate === ''
    ? 18
    : Number(options.gstRate);
  const gstRate = Number.isFinite(fallbackGst) ? fallbackGst : 18;

  const description = cwItem.description || '';
  const qty = cwItem.qty === null || cwItem.qty === undefined || cwItem.qty === ''
    ? 1
    : Number(cwItem.qty);

  const categories = Array.isArray(cwItem.categories) ? cwItem.categories : [];
  let totalCost = 0;
  let leadTime = '';
  const descriptionRows = [];
  categories.forEach((cat) => {
    if (!cat) return;
    if (isLeadTimeCategory(cat.category)) {
      // The Lead Time row is not a cost — it carries the delivery lead time.
      leadTime = String(cat.notes || '').trim()
        || (cat.qty != null && cat.qty !== ''
          ? `${String(Number(cat.qty)).replace(/\.0+$/, '')}${cat.unit ? ` ${String(cat.unit).trim()}` : ''}`
          : '');
      return;
    }
    const catQty = Number(cat.qty) || 0;
    const catRate = Number(cat.rate) || 0;
    const storedAmount = cat.amount === null || cat.amount === undefined ? null : Number(cat.amount);
    const amount = storedAmount === null || storedAmount === 0 ? catQty * catRate : storedAmount;
    totalCost += amount;
    const value = [
      catQty ? `${String(catQty)}${cat.unit ? ` ${String(cat.unit).trim()}` : ''} × ` : '',
      round2(amount).toFixed(2),
      cat.notes ? ` — ${String(cat.notes).trim()}` : ''
    ].join('');
    descriptionRows.push({ label: String(cat.category || '').trim() || 'Cost', value });
  });

  const rate = qty > 0 ? totalCost / qty : totalCost;

  return {
    productId: null,
    productName: description,
    description,
    sku: '',
    drawingNo: '',
    material: description,
    leadTime,
    hsn: '',
    batchCode: '',
    expiryDate: '',
    gstRate,
    unit: cwItem.unit || 'Nos',
    qty: Number.isFinite(qty) ? qty : 1,
    rate: round2(rate),
    discountPct: 0,
    descriptionRows,
    customFields: normalizeItemCustomFields(cwItem.customFields)
  };
}

export function cwToForm(raw) {
  const cw = normalizeCw(raw);
  return {
    cwNo: cw.cwNo || '',
    cwDate: (cw.cwDate || '').slice(0, 10),
    status: cw.status === 'completed' ? 'completed' : 'draft',
    preparedBy: cw.preparedBy || '',
    contactPerson: cw.contactPerson || '',
    department: cw.department || '',
    sourceLead: cw.sourceLead || '',
    customerName: cw.customerName || '',
    cprRef: cw.cprRef || '',
    cprId: cw.cprId != null ? String(cw.cprId) : '',
    phone: cw.phone || '',
    email: cw.email || '',
    company: cw.company || '',
    gst: cw.gst || '',
    pan: cw.pan || '',
    linkedCpr: cw.linkedCpr || '',
    billingAddress: cw.billingAddress || '',
    shippingAddress: cw.shippingAddress || '',
    remarks: cw.remarks || '',
    profitPct: cw.profitPct != null ? String(cw.profitPct) : '0',
    discountPct: cw.discountPct != null ? String(cw.discountPct) : '0',
    gstPct: cw.gstPct != null ? String(cw.gstPct) : '18',
    itemColumnsJson: raw.itemColumnsJson || null,
    attachments: Array.isArray(cw.attachments)
      ? cw.attachments.map((f) => ({
          name: f.name || '',
          size: Number(f.size) || 0,
          type: f.type || '',
          data: f.data || ''
        }))
      : []
  };
}

export function cwStatusMeta(status) {
  const key = String(status || 'draft').toLowerCase();
  return CW_STATUS_META[key] || CW_STATUS_META.draft;
}

export function cwStatusLabel(status) {
  return cwStatusMeta(status).label;
}

export function buildCwLink(cw) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/cost-workouts/${cw.id}`;
}

/**
 * How a shared/emailed Cost Workout is named: by its customer. The generated CW
 * number is the record's internal identity and no document number is
 * substituted for it.
 */
function cwReference(cw) {
  return cw?.customerName || cw?.company || 'Cost Workout';
}

export function shareCw(cw) {
  const url = buildCwLink(cw);
  const reference = cwReference(cw);
  const text = `${reference}${cw.customerName ? ` · ${cw.customerName}` : ''} — ${url}`;
  const tryShare = () =>
    navigator.share ? navigator.share({ title: reference, text, url }) : Promise.reject(new Error('no-share'));
  return tryShare()
    .then(() => ({ ok: true, action: 'share' }))
    .catch((err) => {
      if (err && err.name === 'AbortError') return { ok: true, action: 'cancelled' };
      return navigator.clipboard
        .writeText(url)
        .then(() => ({ ok: true, action: 'copy' }))
        .catch((clipboardError) => ({ ok: false, error: clipboardError }));
    });
}

export function emailCw(cw) {
  try {
    const subject = encodeURIComponent(`${cwReference(cw)}${cw.customerName ? ` - ${cw.customerName}` : ''}`);
    const doc = cwDocument(cw);
    const body = encodeURIComponent(
      `Dear Sir/Madam,\n\nPlease find the Cost Workout for your reference.\n\n` +
        `Customer: ${cw.customerName || '-'}\n` +
        `CPR Reference: ${cw.cprRef || '-'}\n` +
        `Subtotal: ${doc.subtotal}\nGrand Total: ${doc.grandTotal}\n\n` +
        `Reference: ${buildCwLink(cw)}`
    );
    window.location.href = `mailto:${cw.email || ''}?subject=${subject}&body=${body}`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open email client' };
  }
}
