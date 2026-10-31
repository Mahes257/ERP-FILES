import { DOC_PREFIXES } from '../constants/salesConstants';
import { normalizeItemCustomFields } from './itemCustomFields';

// ===== Shared numeric helpers =====

export function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

export function roundOff(value) {
  const n = round2(value);
  return Math.round(n);
}

// HSN Column View is persisted as a string ("true"/"false") on the backend;
// anything except a literal "false" is treated as visible (missing → visible).
export function isHsnVisible(value) {
  return String(value ?? 'true').toLowerCase() !== 'false';
}

// ===== Custom fields (per-document user-defined fields) =====
// Stored as a JSON-encoded array on the backend (quotations.customFields TEXT):
// [{ name, type, value, options }]. type is one of text|number|date|dropdown|checkbox;
// options holds comma-separated choices for the dropdown type.

const NORMALIZED_CF_TYPES = new Set(['text', 'number', 'date', 'dropdown', 'checkbox']);

function normalizeCfField(f) {
  const type = String(f?.type || 'text').toLowerCase();
  return {
    name: String(f?.name ?? '').trim(),
    type: NORMALIZED_CF_TYPES.has(type) ? type : 'text',
    value: f?.value ?? '',
    options: String(f?.options ?? '')
  };
}

export function parseCustomFields(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === 'string' && raw.trim()
      ? (() => {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];
  return arr.filter((f) => f && typeof f === 'object').map(normalizeCfField);
}

export function serializeCustomFields(list) {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return JSON.stringify(list.filter((f) => f && typeof f === 'object').map(normalizeCfField));
}

// ===== Item line calculation (matches original ERP: qty × rate, discount, GST, amount) =====

export function lineAmount(item) {
  const qty = num(item.qty, 1);
  const rate = num(item.rate);
  const total = round2(qty * rate);
  const discount = round2((total * num(item.discountPct)) / 100);
  const taxable = round2(total - discount);
  const tax = round2((taxable * num(item.gstRate)) / 100);
  return { qty, rate, total, discount, taxable, tax, amount: round2(taxable + tax) };
}

/**
 * Drop every discount from a list of line items — NEW CREDIT NOTE records only.
 *
 * A Credit Note has no discount control, so a discount reaching a NEW record's
 * form (from a source invoice / receipt, a restored draft or a bulk upload) must
 * not be able to reduce a line amount. Returns the SAME array when nothing
 * carries a discount, so it is safe to use directly as a state normalizer.
 *
 * It is deliberately NOT applied while EDITING an existing record: a legacy
 * Credit Note may hold a genuine historical discount that must survive opening,
 * editing and saving untouched. Every other document type keeps its own
 * discount behaviour (see lineAmount / computeTotals above, unchanged).
 */
export function withoutDiscount(items) {
  if (!Array.isArray(items)) return [];
  if (!items.some((it) => it && num(it.discountPct) !== 0)) return items;
  return items.map((it) => (it && num(it.discountPct) !== 0 ? { ...it, discountPct: 0 } : it));
}

export function computeTotals(items = [], { discountPct = 0, charges = 0, roundOffEnabled = false } = {}) {
  const lines = items.map(lineAmount);
  const subTotal = round2(lines.reduce((sum, l) => sum + l.total, 0));
  const discount = round2((subTotal * num(discountPct)) / 100);
  const cgstTotal = round2(lines.reduce((sum, l) => sum + l.tax / 2, 0));
  const sgstTotal = round2(lines.reduce((sum, l) => sum + l.tax / 2, 0));
  const taxTotal = round2(lines.reduce((sum, l) => sum + l.tax, 0));
  const chargesValue = round2(num(charges));
  const grandTotal = round2(subTotal - discount + taxTotal + chargesValue);
  const finalGrand = roundOffEnabled ? roundOff(grandTotal) : grandTotal;
  return {
    lines,
    subTotal,
    discount,
    discountPct: num(discountPct),
    cgstTotal,
    sgstTotal,
    taxTotal,
    charges: chargesValue,
    grandTotal: round2(finalGrand),
    roundOffAmount: round2(finalGrand - grandTotal)
  };
}

// ===== Normalizers =====

function normalizeBase(raw) {
  return {
    ...raw,
    id: raw.id,
    client: raw.client || raw.clientName || '',
    clientName: raw.clientName || raw.client || '',
    status: raw.status || 'draft',
    items: Array.isArray(raw.items) ? raw.items : [],
    timeline: Array.isArray(raw.timeline) ? raw.timeline : [],
    history: Array.isArray(raw.history) ? raw.history : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    createdAt: raw.createdAt || raw.date || raw.updatedAt || ''
  };
}

export function normalizeQuotation(raw = {}) {
  return normalizeBase(raw);
}



export function normalizeSalesContract(raw = {}) {
  return normalizeBase(raw);
}

export function normalizeSalesOrder(raw = {}) {
  return normalizeBase(raw);
}

export function normalizeDeliveryChallan(raw = {}) {
  return normalizeBase(raw);
}

export function normalizeProformaInvoice(raw = {}) {
  return normalizeBase(raw);
}

export function normalizeInvoice(raw = {}) {
  return normalizeBase(raw);
}

export function normalizePaymentReceipt(raw = {}) {
  return normalizeBase(raw);
}

export function normalizeCreditNote(raw = {}) {
  return normalizeBase(raw);
}

export const NORMALIZERS = {
  quotation: normalizeQuotation,
  salesContract: normalizeSalesContract,
  salesOrder: normalizeSalesOrder,
  deliveryChallan: normalizeDeliveryChallan,
  proformaInvoice: normalizeProformaInvoice,
  invoice: normalizeInvoice,
  paymentReceipt: normalizePaymentReceipt,
  creditNote: normalizeCreditNote
};

// ===== Generic serializers (empty values dropped, items mapped) =====

function clean(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

function mapItems(items) {
  // Only real item rows may be persisted. Group/description/image rows are
  // design-time only (like the old ERP) — skipping them here prevents them
  // from ever reaching the backend as junk line items.
  return (Array.isArray(items) ? items : [])
    .filter((item) => !item || !item.rowType || item.rowType === 'item')
    .map((item) =>
    clean({
      productId: item.productId,
      productName: item.productName || item.product || '',
      // sku was previously dropped here — the backend persists it (QuotationItemRequest.sku)
      sku: item.sku || '',
      // Item Description sub-fields (Item Code = sku; the rest are dedicated
      // columns on quotation_items — ignored harmlessly by other doc types)
      drawingNo: item.drawingNo || '',
      material: item.material || '',
      delivery: item.delivery || '',
      leadTime: item.leadTime || item.delivery || '',
      descriptionRows: Array.isArray(item.descriptionRows) && item.descriptionRows.length > 0
        ? item.descriptionRows
            .filter((r) => r && (r.label || r.value))
            .map((r) => ({ label: r.label || '', value: r.value || '' }))
        : undefined,
      // Export invoice item columns (Manufacturer / Country of Origin).
      manufacturer: item.manufacturer || '',
      countryOfOrigin: item.countryOfOrigin || '',
      // Export proforma item columns (Marks & Nos / Container No, No & Kind of Pkgs).
      marksNos: item.marksNos || '',
      noKindPkgs: item.noKindPkgs || '',
      // Packing List line-item weights (KGS) — sum into the packing totals.
      netWeight: item.netWeight != null && item.netWeight !== '' ? Number(item.netWeight) : 0,
      grossWeight: item.grossWeight != null && item.grossWeight !== '' ? Number(item.grossWeight) : 0,
      description: item.description || '',
      hsn: item.hsn || '',
      // backend field is uom (QuotationItemRequest.uom); accept both spellings so the
      // stored unit/UOM survives save + refresh
      uom: item.unit || item.uom || '',
      // Batch code / expiry date — optional item-row columns controlled by the
      // "Display Batch Details" Advanced Option; persisted on quotation_items
      batchCode: item.batchCode || '',
      expiryDate: item.expiryDate || '',
      qty: item.qty != null && item.qty !== '' ? Number(item.qty) : 1,
      rate: item.rate != null && item.rate !== '' ? Number(item.rate) : 0,
      discountPct: item.discountPct != null && item.discountPct !== '' ? Number(item.discountPct) : 0,
      gstRate: item.gstRate != null && item.gstRate !== '' ? Number(item.gstRate) : 0,
      amount: item.amount != null && item.amount !== '' ? Number(item.amount) : 0,
      // Managed-grid custom column values for this row ({columnId: value}) —
      // the same per-row JSON shape the CPR item grid persists. Empty values
      // are dropped so a row never stores noise.
      customFields: item.customFields && typeof item.customFields === 'object' && !Array.isArray(item.customFields)
        ? Object.fromEntries(
            Object.entries(item.customFields).filter(([k, v]) => k && v != null && String(v) !== '')
          )
        : undefined
    })
  );
}

export function serializeQuotation(form = {}, items = []) {
  return clean({
    quotationNo: form.quotationNo,
    reference: form.reference,
    quotationDate: form.quotationDate,
    validUntil: form.validUntil,
    leadNo: form.leadNo,
    sourceCw: form.sourceCw,
    // Source Profit Workout of a conversion-prefilled form: the backend resolves
    // it, writes the "Generated from Profit Workout …" reference itself and
    // refuses a second quotation for the same Profit Workout.
    sourcePw: form.sourcePw,
    sourceCpr: form.sourceCpr,
    // Reference PR No — OPTIONAL. The backend resolves the origin on save: a
    // PR No carried by a live CPR links to that CPR (cprId), otherwise it is
    // registered/reused as a Direct PR Reference so a quotation can be raised
    // straight from a customer enquiry without creating a CPR first. The
    // backend owns referencePrSource / prReferenceId, so neither is sent.
    referencePrNo: form.referencePrNo,
    cprId: form.cprId != null && form.cprId !== '' ? Number(form.cprId) : null,
    fromCompany: form.fromCompany,
    fromName: form.fromName,
    fromAddress: form.fromAddress,
    fromGstin: form.fromGstin,
    fromPan: form.fromPan,
    fromEmail: form.fromEmail,
    fromPhone: form.fromPhone,
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    email: form.email,
    phone: form.phone,
    address: form.address,
    city: form.city,
    state: form.state,
    pin: form.pin,
    country: form.country,
    gstin: form.gstin,
    pan: form.pan,
    billingAddress: form.billingAddress,
    billingCity: form.billingCity,
    billingState: form.billingState,
    billingPin: form.billingPin,
    shipSameAsBill: !!form.shipSameAsBill,
    shippingAddress: form.shippingAddress,
    shippingCity: form.shippingCity,
    shippingState: form.shippingState,
    shippingPin: form.shippingPin,
    taxType: form.taxType,
    currency: form.currency,
    exchangeRate:
      form.exchangeRate != null && form.exchangeRate !== '' ? Number(form.exchangeRate) : undefined,
    baseCurrency: form.baseCurrency || undefined,
    numberFormat: form.numberFormat,
    status: form.status || 'draft',
    salesPerson: form.salesPerson,
    paymentTerms: form.paymentTerms,
    deliveryTerms: form.deliveryTerms,
    remarks: form.remarks,
    terms: form.terms,
    discount: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    freight: form.freight != null && form.freight !== '' ? Number(form.freight) : 0,
    insurance: form.insurance != null && form.insurance !== '' ? Number(form.insurance) : 0,
    signatureType: form.signatureType,
    signatureLabel: form.signatureLabel,
    hsnView: form.hsnView,
    displayUnit: form.displayUnit,
    taxSummary: form.taxSummary,
    hidePlace: form.hidePlace,
    hsnSummary: form.hsnSummary,
    originalImages: form.originalImages,
    thumbnails: form.thumbnails,
    descFull: form.descFull,
    hideSubtotal: form.hideSubtotal,
    showSku: form.showSku,
    serial: form.serial,
    batch: form.batch,
    additionalInfo: form.additionalInfo,
    contactEmail: form.contactEmail,
    contactPhone: form.contactPhone,
    // Quotation preview design selection (template + colour theme) — display
    // preferences persisted with the document like hsnView/showSku; the
    // preview restores them on load. Never affects business data.
    designTemplate: form.designTemplate,
    designTheme: form.designTheme,
    customFields: serializeCustomFields(form.customFields),
    items: mapItems(items)
  });
}

export function serializeSalesContract(form = {}, items = []) {
  return clean({
    scNo: form.scNo,
    poRef: form.poRef,
    contractDate: form.contractDate,
    leadNo: form.leadNo,
    qtnRef: form.qtnRef,
    status: form.status || 'draft',
    currency: form.currency,
    taxType: form.taxType,
    hsnView: form.hsnView,
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    email: form.email,
    phone: form.phone,
    city: form.city,
    state: form.state,
    billingAddress: form.billingAddress,
    shippingAddress: form.shippingAddress,
    gstin: form.gstin,
    pan: form.pan,
    paymentTerms: form.paymentTerms,
    deliveryTerms: form.deliveryTerms,
    salesExecutive: form.salesExecutive,
    validity: form.validity,
    duration: form.duration,
    warranty: form.warranty,
    commercialTerms: form.commercialTerms,
    scope: form.scope,
    exclusions: form.exclusions,
    remarks: form.remarks,
    discount: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    items: mapItems(items)
  });
}

/*
 * NOTE: E-Actions / Participation are no longer part of the Customer Purchase
 * Order payload. They live on their own dedicated E-Actions page and are
 * written through their own endpoints (see services/salesOrderEActionService).
 * The CPO form therefore never sends an `eActions` key — so saving a CPO cannot
 * clear the E-Action rows that belong to it (the backend only replaces them
 * when the key is explicitly present).
 */
export function serializeSalesOrder(form = {}, items = []) {
  return clean({
    soNo: form.soNo,
    customerPo: form.customerPo,
    orderDate: form.orderDate,
    leadNo: form.leadNo,
    scRef: form.scRef,
    qtnRef: form.qtnRef,
    status: form.status || 'draft',
    currency: form.currency,
    taxType: form.taxType,
    hsnView: form.hsnView,
    priority: form.priority,
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    email: form.email,
    phone: form.phone,
    city: form.city,
    state: form.state,
    billingAddress: form.billingAddress,
    shippingAddress: form.shippingAddress,
    gstin: form.gstin,
    pan: form.pan,
    paymentTerms: form.paymentTerms,
    salesExecutive: form.salesExecutive,
    deliveryDate: form.deliveryDate,
    deliveryTerms: form.deliveryTerms,
    terms: form.terms,
    remarks: form.remarks,
    // ---- Release & Procurement Method ----
    releaseMethod: form.releaseMethod,
    releaseRequired: form.releaseRequired,
    actionType: form.actionType,
    releaseDate: form.releaseDate,
    releaseToDepartment: form.releaseToDepartment,
    participationRequired: form.participationRequired,
    assignedTo: form.assignedTo,
    departmentTeam: form.departmentTeam,
    actionDeadline: form.actionDeadline,
    actionRemarks: form.actionRemarks,
    actionInstructions: form.actionInstructions,
    discount: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    items: mapItems(items)
  });
}

export function serializeDeliveryChallan(form = {}, items = []) {
  return clean({
    dcNo: form.dcNo,
    taxType: form.taxType,
    hsnView: form.hsnView,    soRef: form.soRef,
    dcDate: form.dcDate,
    scRef: form.scRef,
    status: form.status || 'draft',
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    email: form.email,
    phone: form.phone,
    billingAddress: form.billingAddress,
    shippingAddress: form.shippingAddress,
    city: form.city,
    state: form.state,
    transportCompany: form.transportCompany,
    vehicleNumber: form.vehicleNumber,
    driverName: form.driverName,
    driverPhone: form.driverPhone,
    lrNumber: form.lrNumber,
    ewayBill: form.ewayBill,
    dispatchDate: form.dispatchDate,
    deliveryDate: form.deliveryDate,
    notes: form.notes,
    terms: form.terms,
    discount: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    items: mapItems(items)
  });
}

export function serializeProformaInvoice(form = {}, items = []) {
  return clean({
    piNo: form.piNo,
    taxType: form.taxType,
    hsnView: form.hsnView,    piDate: form.piDate,
    referenceNo: form.referenceNo,
    contractNo: form.contractNo,
    contractDate: form.contractDate,
    appendixPoNo: form.appendixPoNo,
    appendixDate: form.appendixDate,
    exporterRef: form.exporterRef,
    exporterName: form.exporterName,
    exporterAddress: form.exporterAddress,
    exporterEmail: form.exporterEmail,
    exporterPhone: form.exporterPhone,
    countryOfOrigin: form.countryOfOrigin,
    countryOfFinalDestination: form.countryOfFinalDestination,
    preCarriageBy: form.preCarriageBy,
    placeOfReceipt: form.placeOfReceipt,
    vesselFlightNo: form.vesselFlightNo,
    portOfLoading: form.portOfLoading,
    portOfDischarge: form.portOfDischarge,
    placeOfDelivery: form.placeOfDelivery,
    termsOfDelivery: form.termsOfDelivery,
    paymentTerms: form.paymentTerms,
    hsCode: form.hsCode,
    commodity: form.commodity,
    validTill: form.validTill,
    source: form.source,
    sourceRef: form.sourceRef,
    status: form.status || 'draft',
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    gstin: form.gstin,
    pan: form.pan,
    email: form.email,
    phone: form.phone,
    billingAddress: form.billingAddress,
    shipSameAsBill: !!form.shipSameAsBill,
    shippingAddress: form.shippingAddress,
    bankName: form.bankName,
    bankAcctName: form.bankAcctName,
    bankAccount: form.bankAccount,
    bankIfsc: form.bankIfsc,
    bankBranch: form.bankBranch,
    bankType: form.bankType,
    bankUpi: form.bankUpi,
    bankSwift: form.bankSwift,
    bankAddress: form.bankAddress,
    exporterGstin: form.exporterGstin,
    exporterPan: form.exporterPan,
    exporterState: form.exporterState,
    buyerName: form.buyerName,
    buyerAddress: form.buyerAddress,
    buyerCountry: form.buyerCountry,
    buyerSameAsConsignee: !!form.buyerSameAsConsignee,
    consigneeName: form.consigneeName,
    consigneeAddress: form.consigneeAddress,
    consigneeCountry: form.consigneeCountry,
    // Preview design selection (template + colour theme) — display preference
    // persisted with the document; the preview restores it on load.
    designTemplate: form.designTemplate,
    designTheme: form.designTheme,
    terms: form.terms,
    notes: form.notes,
    currency: form.currency,
    taxTreatment: form.taxTreatment,
    packingDetails: Array.isArray(form.packingDetails) && form.packingDetails.length > 0
      ? JSON.stringify(form.packingDetails.filter((p) => p && typeof p === 'object'))
      : undefined,
    authorizedSignatory: form.authorizedSignatory,
    designation: form.designation,
    place: form.place,
    authorizationDate: form.authorizationDate,
    companyStamp: form.companyStamp,
    // ERP proforma uses a PERCENTAGE discount (Discount % input → Discount
    // Amount display); the backend computes the flat amount from this pct.
    discountPct: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    // ---- Packing List fields (only populated for packing-list documents) ----
    invoiceNo: form.invoiceNo,
    invoiceDate: form.invoiceDate,
    buyersOrderNo: form.buyersOrderNo,
    buyersOrderDate: form.buyersOrderDate,
    packageMarksNos: form.packageMarksNos,
    packageNoKindPkgs: form.packageNoKindPkgs,
    packageDimensions: form.packageDimensions,
    totalPackages: form.totalPackages != null && form.totalPackages !== '' ? Number(form.totalPackages) : 0,
    totalQty: form.totalQty != null && form.totalQty !== '' ? Number(form.totalQty) : 0,
    netWeight: form.netWeight != null && form.netWeight !== '' ? Number(form.netWeight) : 0,
    grossWeight: form.grossWeight != null && form.grossWeight !== '' ? Number(form.grossWeight) : 0,
    declaration: form.declaration,
    items: mapItems(items)
  });
}

// Export invoice packing entries are stored as a JSON TEXT column on the
// backend. Parse the stored string back into an array for the form editor.
export function parsePackingDetails(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function serializeInvoice(form = {}, items = []) {
  // Export under LUT / Bond — supply is made without payment of IGST, so the
  // item GST rates are forced to 0 before they reach the backend totals.
  const lutNoIgst = ['export', 'sez'].includes(form.invoiceType) &&
    String(form.taxTreatment || '').toLowerCase().includes('lut');
  const mappedItems = mapItems(items).map((it) => (lutNoIgst ? { ...it, gstRate: 0 } : it));
  const packing = Array.isArray(form.packingDetails) && form.packingDetails.length > 0
    ? JSON.stringify(form.packingDetails.filter((p) => p && typeof p === 'object'))
    : undefined;
  return clean({
    invoiceNo: form.invoiceNo,
    invoiceType: form.invoiceType,
    taxType: form.taxType,
    hsnView: form.hsnView,    companyName: form.companyName,
    companyGstin: form.companyGstin,
    companyPan: form.companyPan,
    companyState: form.companyState,
    companyAddress: form.companyAddress,
    companyEmail: form.companyEmail,
    companyPhone: form.companyPhone,
    lutArn: form.lutArn,
    invoiceDate: form.invoiceDate,
    dueDate: form.dueDate,
    referenceNo: form.referenceNo,
    contractNo: form.contractNo,
    contractDate: form.contractDate,
    appendixNo: form.appendixNo,
    appendixDate: form.appendixDate,
    exporterRef: form.exporterRef,
    poNo: form.poNo,
    poDate: form.poDate,
    source: form.source,
    sourceRef: form.sourceRef,
    status: form.status || 'draft',
    paymentStatus: form.paymentStatus || 'unpaid',
    bankName: form.bankName,
    bankAccount: form.bankAccount,
    bankIfsc: form.bankIfsc,
    bankBranch: form.bankBranch,
    bankType: form.bankType,
    bankUpi: form.bankUpi,
    bankSwift: form.bankSwift,
    bankAddress: form.bankAddress,
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    gstin: form.gstin,
    pan: form.pan,
    email: form.email,
    phone: form.phone,
    billingAddress: form.billingAddress,
    shipSameAsBill: !!form.shipSameAsBill,
    shippingAddress: form.shippingAddress,
    buyerCountry: form.buyerCountry,
    consigneeName: form.consigneeName,
    consigneeAddress: form.consigneeAddress,
    consigneeCountry: form.consigneeCountry,
    consigneeSameAsBuyer: !!form.consigneeSameAsBuyer,
    terms: form.terms,
    notes: form.notes,
    countryOfOrigin: form.countryOfOrigin,
    countryOfFinalDestination: form.countryOfFinalDestination,
    preCarriageBy: form.preCarriageBy,
    placeOfReceipt: form.placeOfReceipt,
    vesselFlightNo: form.vesselFlightNo,
    portOfLoading: form.portOfLoading,
    portOfDischarge: form.portOfDischarge,
    portOfDelivery: form.portOfDelivery,
    hsCode: form.hsCode,
    commodity: form.commodity,
    termsOfDelivery: form.termsOfDelivery,
    paymentTerms: form.paymentTerms,
    currency: form.currency,
    taxTreatment: form.taxTreatment,
    packingDetails: packing,
    authorizedSignatory: form.authorizedSignatory,
    designation: form.designation,
    place: form.place,
    authorizationDate: form.authorizationDate,
    discountPct: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    // Preview design selection (template + colour theme) — display preference
    // persisted with the document; the preview restores it on load.
    designTemplate: form.designTemplate,
    designTheme: form.designTheme,
    items: mappedItems
  });
}

export function serializePaymentReceipt(form = {}) {
  return clean({
    receiptNo: form.receiptNo,
    companyName: form.companyName,
    companyGstin: form.companyGstin,
    companyPan: form.companyPan,
    companyState: form.companyState,
    companyAddress: form.companyAddress,
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    gstin: form.gstin,
    email: form.email,
    phone: form.phone,
    paymentDate: form.paymentDate,
    paymentMode: form.paymentMode,
    bankName: form.bankName,
    branch: form.branch,
    chequeTx: form.chequeTx,
    referenceNo: form.referenceNo,
    status: form.status || 'draft',
    source: form.source,
    invoiceRef: form.invoiceRef,
    amount: form.amount != null && form.amount !== '' ? Number(form.amount) : 0,
    remarks: form.remarks
  });
}

export function serializeCreditNote(form = {}, items = []) {
  return clean({
    cnNo: form.cnNo,
    taxType: form.taxType,
    hsnView: form.hsnView,    cnDate: form.cnDate,
    status: form.status || 'draft',
    source: form.source,
    sourceRef: form.sourceRef,
    sourceDate: form.sourceDate,
    // The Credit Note's own date for the credited consignment reaching the
    // destination (no other document in the chain records it).
    destinationReachedDate: form.destinationReachedDate,
    // Manual overrides of the two LINKED-DOCUMENT dates (dispatch date from the
    // Delivery Challan, due date from the invoice/CPO). They are submitted only
    // while the user has one: clean() drops an empty value, so clearing the
    // input removes the override and the backend falls back to the linked
    // document instead of storing a blank. A note whose dates were never
    // overridden sends nothing at all and keeps resolving from its links.
    dispatchDateOverride: form.dispatchDateOverride,
    dueDateOverride: form.dueDateOverride,
    settlementMethod: form.settlementMethod,
    reason: form.reason,
    refundAmount: form.refundAmount != null && form.refundAmount !== '' ? Number(form.refundAmount) : 0,
    returnQty: form.returnQty != null && form.returnQty !== '' ? Number(form.returnQty) : 0,
    reasonDetail: form.reasonDetail,
    inventoryImpact: form.inventoryImpact,
    companyName: form.companyName,
    companyGstin: form.companyGstin,
    companyPan: form.companyPan,
    companyState: form.companyState,
    companyAddress: form.companyAddress,
    clientId: form.clientId != null && form.clientId !== '' ? Number(form.clientId) : null,
    clientName: form.clientName,
    contactPerson: form.contactPerson,
    gstin: form.gstin,
    email: form.email,
    phone: form.phone,
    currency: form.currency,
    terms: form.terms,
    remarks: form.remarks,
    // A Credit Note has no discount CONTROL, so a NEW note submits 0 here (the
    // form never holds a value) and its lines carry no discount either. A LEGACY
    // note is submitted with exactly the discount it was loaded with — header
    // and per line — so editing an unrelated field cannot silently flatten
    // historical data: the payload mirrors the stored record, and the backend
    // recomputes the same amounts it already had.
    discountPct: form.discountPct != null && form.discountPct !== '' ? Number(form.discountPct) : 0,
    charges: form.charges != null && form.charges !== '' ? Number(form.charges) : 0,
    items: mapItems(items)
  });
}

export const SERIALIZERS = {
  quotation: serializeQuotation,
  salesContract: serializeSalesContract,
  salesOrder: serializeSalesOrder,
  deliveryChallan: serializeDeliveryChallan,
  proformaInvoice: serializeProformaInvoice,
  invoice: serializeInvoice,
  paymentReceipt: serializePaymentReceipt,
  creditNote: serializeCreditNote
};

// ===== Document display helpers =====

// Column key that holds the document number for each Sales Execution module.
// Shared by docNumber() and the list tables that pin the doc-number column
// while scrolling horizontally (sticky left column).
export const DOC_NUMBER_FIELD = {
  quotation: 'quotationNo',
  salesContract: 'scNo',
  salesOrder: 'soNo',
  deliveryChallan: 'dcNo',
  proformaInvoice: 'piNo',
  invoice: 'invoiceNo',
  paymentReceipt: 'receiptNo',
  creditNote: 'cnNo'
};

export function docNumber(doc, moduleKey) {
  const field = DOC_NUMBER_FIELD[moduleKey];
  return doc?.[field] || '';
}

// Display-only rename for any legacy SO- prefixed numbers. The backend now
// generates CPO-YYYY-NNNNN directly, but this acts as a safety net for any
// remaining SO- values in the database.
export function cpoNo(value) {
  return typeof value === 'string' && value.startsWith('SO-') ? `CPO-${value.slice(3)}` : value;
}

// Display-only text relabel for strings that embed the old module name or
// number prefix. Acts as a safety net for any remaining legacy values — a
// legacy "Sales Order SO-2026-000001" must read "Customer Purchase Order
// CPO-2026-000001" wherever it was already stored.
//
// The number rule is separator-aware and digit-anchored on purpose: an `SO-`
// only becomes `CPO-` at the start of the value or after a non-alphanumeric
// character AND when followed by a digit, so unrelated identifiers such as
// "ISO-9001" or "SOLD-2026" are never corrupted.
export function cpoText(value) {
  return typeof value === 'string'
    ? value
        .replace(/\bSales Orders\b/gi, 'Customer Purchase Orders')
        .replace(/\bSales Order\b/gi, 'Customer Purchase Order')
        .replace(/(^|[^A-Za-z0-9])SO-(\d)/g, '$1CPO-$2')
    : value;
}

/** Intent-revealing alias: `cpoText` applied to document metadata
 *  (document name, type, record number) so the Documents module and download
 *  filenames never surface legacy wording. */
export const cpoDocumentText = cpoText;

export function buildDocLink(doc, moduleKey) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const route = {
    quotation: 'quotations',
    salesContract: 'sales-contracts',
    salesOrder: 'sales-orders',
    deliveryChallan: 'delivery-challans',
    proformaInvoice: 'proforma-invoices',
    invoice: 'invoices',
    paymentReceipt: 'payment-receipts',
    creditNote: 'credit-notes'
  }[moduleKey];
  return `${origin}/${route}/${doc.id}`;
}

export function shareDocument(doc, moduleKey, label) {
  const url = buildDocLink(doc, moduleKey);
  const text = `${docNumber(doc, moduleKey) || label}${doc.client ? ` · ${doc.client}` : ''} — ${url}`;
  return navigator.share
    ? navigator.share({ title: docNumber(doc, moduleKey) || label, text, url }).then(
        () => ({ ok: true, action: 'share' }),
        (err) => {
          if (err?.name === 'AbortError') return { ok: true, action: 'cancelled' };
          return navigator.clipboard.writeText(url).then(() => ({ ok: true, action: 'copy' }));
        }
      )
    : navigator.clipboard.writeText(url).then(() => ({ ok: true, action: 'copy' }));
}

export function emailDocument(doc, moduleKey, label) {
  try {
    const subject = encodeURIComponent(`${docNumber(doc, moduleKey) || label}${doc.client ? ` - ${doc.client}` : ''}`);
    const body = encodeURIComponent(
      `Dear ${doc.contactPerson || 'Sir/Madam'},\n\nPlease find the ${label} ${docNumber(doc, moduleKey) || ''} for your reference.\n\n` +
        `Reference: ${buildDocLink(doc, moduleKey)}`
    );
    window.location.href = `mailto:${doc.email || ''}?subject=${subject}&body=${body}`;
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open email client' };
  }
}

export function whatsappDocument(doc, moduleKey, label) {
  try {
    const text = encodeURIComponent(
      `Hello${doc.contactPerson ? ' ' + doc.contactPerson : ''},\n\nPlease find the ${label} ${docNumber(doc, moduleKey) || ''} for your reference.\n\n` +
        `Reference: ${buildDocLink(doc, moduleKey)}`
    );
    const phone = doc.phone ? doc.phone.replace(/[^0-9]/g, '') : '';
    const url = `https://wa.me/${phone ? '91' + (phone.startsWith('91') ? phone.slice(2) : phone) : ''}?text=${text}`;
    window.open(url, '_blank');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || 'Failed to open WhatsApp' };
  }
}

export function prefixFor(moduleKey) {
  return DOC_PREFIXES[moduleKey] || '';
}
