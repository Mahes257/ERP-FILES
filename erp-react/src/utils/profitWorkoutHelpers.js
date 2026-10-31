import { PW_STATUS_META } from './profitWorkoutConstants';

export function isLeadTimeCategory(category) {
  return String(category || '').toLowerCase() === 'lead time';
}

/**
 * Shared mapping from a Lead/Client source record to the Profit Workout customer
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

export function normalizePw(raw = {}) {
  return {
    ...raw,
    pwNo: raw.pwNo || raw.id || '',
    pwDate: raw.pwDate || raw.date || '',
    status: raw.status || 'draft',
    preparedBy: raw.preparedBy || '',
    customerName: raw.customerName || raw.customer || '',
    cprRef: raw.cprRef || '',
    company: raw.company || '',
    currency: raw.currency || 'INR',
    project: raw.project || '',
    additionalCharges: Number(raw.additionalCharges) || 0,
    // Source Cost Workout this Profit Workout was converted from.
    sourceCwNo: raw.sourceCwNo || '',
    sourceCwId: raw.sourceCwId != null ? Number(raw.sourceCwId) : null,
    items: Array.isArray(raw.items) ? raw.items : [],
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
 * Authoritative frontend calculation — mirrors ProfitWorkoutService.recalc() so
 * the live form, the persisted record and the preview can never disagree.
 *
 * Flat item model (item.costRate / item.sellingRate present):
 *   Cost Amount  = Cost Rate × Qty
 *   Selling Amt  = Selling Rate × Qty
 *   Profit/Unit  = Selling Rate − Cost Rate
 *   Profit Amt   = Selling Amt − Cost Amt
 *   Margin %     = Profit Amt ÷ Selling Amt × 100 (0 when Selling Amt = 0)
 *
 * Legacy category rows (no sellingRate — pre-flat-model data / Cost Workout
 * conversions): cost from Σ qty × rate (Lead Time excluded), profit via the
 * document profitPct formula, selling = cost + profit.
 *
 * Document totals are always DERIVED from the item rows: total cost = Σ cost,
 * total selling = Σ selling, total profit = Σ profit, overall margin = total
 * profit ÷ total selling × 100. Negative profit is fully supported.
 *   discountAmt = selling × discountPct / 100
 *   gstAmt      = (selling − discountAmt) × gstPct / 100
 *   grandTotal  = (selling − discountAmt) + additionalCharges + gstAmt
 */
export function calcPwTotals(items = [], profitPct = 0, discountPct = 0, gstPct = 18, additionalCharges = 0) {
  const rows = [];
  let totalCost = 0;
  let totalSelling = 0;
  let totalProfit = 0;
  let totalQty = 0;

  (Array.isArray(items) ? items : []).forEach((item) => {
    const qty = Number(item.qty) || 0;
    totalQty += qty;
    let costAmount;
    let sellingAmount;
    let profitAmount;
    let profitPerUnit;
    let margin;
    let costRate = 0;
    let sellingRate = 0;
    const hasFlatRates = item.costRate != null && item.sellingRate != null && item.sellingRate !== '';
    if (hasFlatRates) {
      costRate = Number(item.costRate) || 0;
      sellingRate = Number(item.sellingRate) || 0;
      costAmount = round2(costRate * qty);
      sellingAmount = round2(sellingRate * qty);
      // Profit = rounded selling − rounded cost, so the displayed Profit Amount
      // always equals (Selling Amount − Cost Amount) to the last paise.
      profitAmount = round2(sellingAmount - costAmount);
      profitPerUnit = round2(sellingRate - costRate);
      margin = sellingAmount !== 0 ? round2((profitAmount / sellingAmount) * 100) : 0;
    } else {
      // Legacy category-based row.
      const categories = Array.isArray(item.categories) ? item.categories : [];
      let itemCost = 0;
      categories.forEach((cat) => {
        const cQty = Number(cat.qty) || 0;
        const cRate = Number(cat.rate) || 0;
        if (!isLeadTimeCategory(cat.category)) itemCost += cQty * cRate;
      });
      costAmount = round2(itemCost);
      const pProfit = Number(profitPct) || 0;
      profitAmount = round2((costAmount * pProfit) / 100);
      sellingAmount = round2(costAmount + profitAmount);
      profitPerUnit = qty !== 0 ? round2(profitAmount / qty) : 0;
      margin = sellingAmount !== 0 ? round2((profitAmount / sellingAmount) * 100) : 0;
      costRate = qty !== 0 ? round2(costAmount / qty) : 0;
      sellingRate = qty !== 0 ? round2(sellingAmount / qty) : 0;
    }
    totalCost += costAmount;
    totalSelling += sellingAmount;
    totalProfit += profitAmount;
    rows.push({ ...item, qty, costRate, sellingRate, costAmount, sellingAmount, profitPerUnit, profitAmount, margin });
  });

  const pDiscount = Number(discountPct) || 0;
  const pGst = gstPct === null || gstPct === undefined || gstPct === '' ? 18 : Number(gstPct) || 0;
  const charges = Number(additionalCharges) || 0;

  const profitAmt = round2(totalProfit);
  const sellingPrice = round2(totalSelling);
  const overallMargin = sellingPrice !== 0 ? round2((profitAmt / sellingPrice) * 100) : 0;
  const discountAmt = round2((sellingPrice * pDiscount) / 100);
  const afterDiscount = round2(sellingPrice - discountAmt);
  const gstAmt = round2((afterDiscount * pGst) / 100);
  const grandTotal = round2(afterDiscount + charges + gstAmt);

  return {
    rows,
    totalQty: round2(totalQty),
    // Total Cost (subtotal) — sum of every item cost amount.
    subtotal: round2(totalCost),
    totalCost: round2(totalCost),
    // Total Selling Value — sum of every item selling amount.
    totalSelling: sellingPrice,
    sellingPrice,
    // Overall Profit Margin derived from the item-level profits.
    profitPct: overallMargin,
    profitAmt,
    totalProfit: profitAmt,
    discountPct: pDiscount,
    discountAmt,
    chargesAmt: round2(charges),
    gstPct: pGst,
    gstAmt,
    grandTotal
  };
}

export function pwDocument(cw = {}) {
  const normalized = normalizePw(cw);
  return calcPwTotals(
    normalized.items,
    normalized.profitPct,
    normalized.discountPct,
    normalized.gstPct,
    normalized.additionalCharges
  );
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function serializePw(form = {}, items = []) {
  return {
    pwNo: form.pwNo || '',
    // Source Cost Workout of a conversion-prefilled form. Sent only when the
    // form actually carries it (the backend ignores it on update), so a plain
    // create/edit payload is byte-for-byte what it was before.
    ...(form.sourceCwId ? { sourceCwId: Number(form.sourceCwId) } : {}),
    pwDate: form.pwDate || '',
    status: form.status || 'draft',
    preparedBy: form.preparedBy || '',
    contactPerson: form.contactPerson || '',
    department: form.department || '',
    currency: form.currency || 'INR',
    project: form.project || '',
    sourceLead: form.sourceLead || '',
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
    additionalCharges: form.additionalCharges !== undefined && form.additionalCharges !== null && form.additionalCharges !== ''
      ? Number(form.additionalCharges) : 0,
    gstPct: form.gstPct !== undefined && form.gstPct !== null && form.gstPct !== ''
      ? Number(form.gstPct) : 18,
    items: items.map((item) => ({
      description: item.description || '',
      qty: item.qty !== undefined && item.qty !== null && item.qty !== '' ? Number(item.qty) : 1,
      category: item.category || '',
      unit: item.unit || '',
      costRate: item.costRate !== undefined && item.costRate !== null && item.costRate !== ''
        ? Number(item.costRate) : null,
      sellingRate: item.sellingRate !== undefined && item.sellingRate !== null && item.sellingRate !== ''
        ? Number(item.sellingRate) : null,
      categories: (Array.isArray(item.categories) ? item.categories : []).map((cat) => ({
        category: cat.category || 'Material Cost',
        qty: Number(cat.qty) || 0,
        unit: cat.unit || 'Nos',
        rate: Number(cat.rate) || 0,
        notes: cat.notes || ''
      }))
    })),
    // Attachments live at the TOP level of the payload (the backend persists
    // them into attachmentsJson). Only sent when present — an empty/missing
    // payload preserves existing files on edit. Uploaded files keep their
    // original names and base64 data end-to-end.
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

export function pwToForm(raw) {
  const cw = normalizePw(raw);
  return {
    pwNo: cw.pwNo || '',
    pwDate: (cw.pwDate || '').slice(0, 10),
    status: cw.status === 'completed' ? 'completed' : 'draft',
    preparedBy: cw.preparedBy || '',
    contactPerson: cw.contactPerson || '',
    department: cw.department || '',
    currency: cw.currency || 'INR',
    project: cw.project || '',
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
    additionalCharges: cw.additionalCharges != null ? String(cw.additionalCharges) : '0',
    gstPct: cw.gstPct != null ? String(cw.gstPct) : '18',
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

/**
 * Maps one persisted item (API response) into a flat editable form row. Flat
 * records keep their stored rates; legacy category rows (no rates) derive the
 * rates from the persisted cost / selling / qty so the numbers round-trip
 * exactly, while the original category rows are preserved for re-saving.
 */
export function pwItemToForm(it = {}) {
  const qty = Number(it.qty) || 0;
  const cost = Number(it.cost) || 0;
  const selling = Number(it.selling) || 0;
  const hasRate = it.costRate != null && it.sellingRate != null && it.sellingRate !== '';
  const categories = Array.isArray(it.categories) ? it.categories : [];
  const firstCat =
    categories.find((c) => !isLeadTimeCategory(c.category))?.category || categories[0]?.category || '';
  return {
    description: it.description || '',
    qty: it.qty ?? 1,
    category: it.category || firstCat || 'Material Cost',
    unit: it.unit || 'Nos',
    costRate: hasRate ? Number(it.costRate) || 0 : qty > 0 ? round2(cost / qty) : 0,
    sellingRate: hasRate ? Number(it.sellingRate) || 0 : qty > 0 ? round2(selling / qty) : 0,
    categories: categories.map((c) => ({
      category: c.category || 'Material Cost',
      qty: c.qty ?? 1,
      unit: c.unit || 'Nos',
      rate: c.rate ?? 0,
      notes: c.notes || ''
    }))
  };
}

/**
 * Cost Workout → Profit Workout form mapping (header fields).
 *
 * Mirrors ProfitWorkoutService#createFromCostWorkout, which is the authoritative
 * CW → PW mapping: every customer/source field is carried over unchanged, the
 * document date is the Cost Workout date, and the profit/discount/GST
 * percentages keep the CW values. The Profit Workout number is deliberately NOT
 * mapped — it always comes from the existing Profit Workout numbering.
 * Fields the Cost Workout does not carry (project, currency) are left to the
 * form's own defaults / the CPR resolution in the create page.
 */
export function cwToPwFormPatch(cw = {}) {
  const num = (value, fallback) => (value === undefined || value === null || value === '' ? fallback : Number(value));
  return {
    pwDate: (cw.cwDate || cw.date || '').slice(0, 10),
    preparedBy: cw.preparedBy || '',
    contactPerson: cw.contactPerson || '',
    department: cw.department || '',
    sourceLead: cw.sourceLead || '',
    customerName: cw.customerName || cw.customer || '',
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
    profitPct: String(num(cw.profitPct, 0)),
    discountPct: String(num(cw.discountPct, 0)),
    gstPct: String(num(cw.gstPct, 18)),
    sourceCwId: cw.id != null ? Number(cw.id) : null,
    sourceCwNo: cw.cwNo || ''
  };
}

/**
 * Maps ONE Cost Workout item into an editable Profit Workout form row.
 *
 * A CW item is a flat row (description / qty / unit) plus its cost breakdown
 * (categories). The Profit Workout form is a flat grid, so the breakdown cost is
 * summed exactly like the legacy category calculation in calcPwTotals (Lead
 * Time rows carry a lead time, not a cost) and turned into the row's cost rate;
 * the selling rate applies the CW profit % the same way the persisted
 * conversion derives it. The original category rows are kept on the form item so
 * the breakdown is not lost when the record is saved.
 */
export function cwItemToPwFormItem(cwItem = {}, profitPct = 0) {
  const qty = Number(cwItem.qty) || 0;
  const categories = (Array.isArray(cwItem.categories) ? cwItem.categories : []).map((cat) => ({
    category: cat.category || 'Material Cost',
    qty: cat.qty ?? 1,
    unit: cat.unit || 'Nos',
    rate: cat.rate ?? 0,
    notes: cat.notes || ''
  }));
  let itemCost = 0;
  categories.forEach((cat) => {
    if (!isLeadTimeCategory(cat.category)) itemCost += (Number(cat.qty) || 0) * (Number(cat.rate) || 0);
  });
  const costAmount = round2(itemCost);
  const profitAmount = round2((costAmount * (Number(profitPct) || 0)) / 100);
  const sellingAmount = round2(costAmount + profitAmount);
  return {
    description: cwItem.description || '',
    qty: cwItem.qty ?? 1,
    category:
      categories.find((c) => !isLeadTimeCategory(c.category))?.category ||
      categories[0]?.category ||
      'Material Cost',
    unit: cwItem.unit || 'Nos',
    costRate: qty !== 0 ? round2(costAmount / qty) : 0,
    sellingRate: qty !== 0 ? round2(sellingAmount / qty) : 0,
    categories
  };
}

export function pwStatusMeta(status) {
  const key = String(status || 'draft').toLowerCase();
  return PW_STATUS_META[key] || PW_STATUS_META.draft;
}

export function pwStatusLabel(status) {
  return pwStatusMeta(status).label;
}

export function buildPwLink(cw) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/profit-workouts/${cw.id}`;
}

export function sharePw(cw) {
  const url = buildPwLink(cw);
  const text = `${cw.pwNo || 'Profit Workout'}${cw.customerName ? ` · ${cw.customerName}` : ''} — ${url}`;
  const tryShare = () =>
    navigator.share ? navigator.share({ title: cw.pwNo || 'Profit Workout', text, url }) : Promise.reject(new Error('no-share'));
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

export function emailPw(cw) {
  try {
    const subject = encodeURIComponent(`${cw.pwNo || 'Profit Workout'}${cw.customerName ? ` - ${cw.customerName}` : ''}`);
    const doc = pwDocument(cw);
    const body = encodeURIComponent(
      `Dear Sir/Madam,\n\nPlease find the Profit Workout ${cw.pwNo} for your reference.\n\n` +
        `Customer: ${cw.customerName || '-'}\n` +
        `CPR Reference: ${cw.cprRef || '-'}\n` +
        `Subtotal: ${doc.subtotal}\nGrand Total: ${doc.grandTotal}\n\n` +
        `Reference: ${buildPwLink(cw)}`
    );
    window.location.href = `mailto:${cw.email || ''}?subject=${subject}&body=${body}`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open email client' };
  }
}

/** GST rate to carry from a Profit Workout (its own header rate, default 18). */
export function pwConversionGstRate(pw = {}) {
  const raw = pw?.gstPct;
  if (raw === null || raw === undefined || raw === '') return 18;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 18;
}

/**
 * Profit Workout → Quotation item mapping.
 *
 * Mirrors QuotationService#createFromProfitWorkout, so the conversion-prefilled
 * Quotation form and the legacy "Convert to Quotation" action produce the same
 * document:
 *
 *   description         → productName / description / sku
 *   unit                → uom
 *   qty                 → qty
 *   selling total ÷ qty → rate (the item's selling rate — the quotation's own
 *                         price field; the Profit Workout's cost and profit are
 *                         never reused as a selling price)
 *   gstPct (header)     → the item's GST rate
 *   discount            → 0 (the quotation's own discount/tax rules recalculate)
 */
export function quotationItemFromPwItem(pwItem = {}, options = {}) {
  const fallbackGst = options.gstRate === null || options.gstRate === undefined || options.gstRate === ''
    ? 18
    : Number(options.gstRate);
  const gstRate = Number.isFinite(fallbackGst) ? fallbackGst : 18;

  const description = pwItem.description || '';
  const qty = pwItem.qty === null || pwItem.qty === undefined || pwItem.qty === ''
    ? 1
    : Number(pwItem.qty);
  const safeQty = Number.isFinite(qty) ? qty : 1;
  // `selling` is the line TOTAL (qty × selling rate), like the backend conversion
  // reads it; `sellingRate` is only a fallback for a payload without it.
  const total = pwItem.selling !== null && pwItem.selling !== undefined && pwItem.selling !== ''
    ? Number(pwItem.selling)
    : safeQty * (Number(pwItem.sellingRate) || 0);
  const rate = safeQty > 0 ? total / safeQty : total;

  return {
    productId: null,
    productName: description,
    description,
    sku: description,
    drawingNo: '',
    material: '',
    leadTime: '',
    hsn: '',
    batchCode: '',
    expiryDate: '',
    gstRate,
    unit: pwItem.unit || 'Nos',
    qty: safeQty,
    rate: round2(Number.isFinite(rate) ? rate : 0),
    discountPct: 0,
    descriptionRows: [],
    customFields: {}
  };
}
