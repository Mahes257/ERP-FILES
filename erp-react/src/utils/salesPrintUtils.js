import { computeTotals, cpoNo, docNumber, isHsnVisible, lineAmount, num, parseCustomFields, parsePackingDetails, round2 } from './salesHelpers';
import { detailColumnsFor, gridKeyForSet, itemColumnSetForModule } from './detailColumns';
import { loadGridConfig } from '../services/gridConfigService';
import { formatDate, formatDateTime, formatINR } from './leadHelpers';
import { VH_LOGO_PLATE_URI } from '../constants/companyBrand';
import { CURRENCY_SYMBOLS } from './quotationPrintUtils';
import { docMoney, fitTableColumns, pdfMoney, pdfSafe } from './pdfText';

// The brand plate is a public image now, not a base64 string in the bundle.
// jsPDF needs an embedded image, so fetch it once per session and hand back a
// data URL. A failed fetch must not break printing: the PDF simply omits the
// logo (the title and every table row still render).
let brandPlateDataUrlPromise;
function loadBrandPlateDataUrl() {
  if (!brandPlateDataUrlPromise) {
    brandPlateDataUrlPromise = (async () => {
      if (typeof fetch === 'undefined') return null;
      const response = await fetch(VH_LOGO_PLATE_URI, { credentials: 'same-origin' });
      if (!response.ok) return null;
      const blob = await response.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    })().catch(() => null);
  }
  return brandPlateDataUrlPromise;
}

// Escape a value for safe interpolation inside the generated preview HTML.
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function exportMoney(value, currency) {
  const num = Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
  const sym = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${sym}${num}`;
}

// ---------------------------------------------------------------------------
// Shared document model
//
// The View/Preview pages render their header values from each module's own
// configuration (salesPageConfigs: generalRows / overviewExtra / address cards)
// and their item table from the persisted item-grid columns. The printable
// document used to be a generic summary, so a download could omit values the
// preview showed (references, terms, transport, release/procurement, credit
// note fields, addresses, freight/insurance in the total, item description once
// an item code existed…). Everything below builds the SAME information set for
// both surfaces from the same persisted record — never from hardcoded data.
// ---------------------------------------------------------------------------

/** Document-level totals, matching the View/Preview calculation exactly. */
function docTotals(doc = {}, moduleKey) {
  const items = Array.isArray(doc.items) ? doc.items : [];
  // The View/Preview pages add freight + insurance to `charges` (backend
  // recalcTotals does the same), so the printed grand total matches the screen.
  const charges = num(doc.charges) + num(doc.freight) + num(doc.insurance);
  return computeTotals(items, {
    discountPct: doc.discountPct ?? doc.discount ?? 0,
    charges,
    roundOffEnabled: moduleKey === 'invoice'
  });
}

/** Stored source codes → the labels the View/Preview pages show. */
const SOURCE_TEXT = {
  so: 'Sales Order',
  'sales order': 'Sales Order',
  sc: 'Sales Contract',
  'sales contract': 'Sales Contract',
  pi: 'Proforma Invoice',
  'proforma invoice': 'Proforma Invoice',
  dc: 'Delivery Challan',
  'delivery challan': 'Delivery Challan',
  inv: 'Invoice',
  invoice: 'Invoice',
  cn: 'Credit Note',
  'credit note': 'Credit Note',
  pr: 'Payment Receipt',
  'payment receipt': 'Payment Receipt',
  quotation: 'Quotation',
  cw: 'Cost Workout',
  'cost workout': 'Cost Workout',
  cpr: 'CPR',
  'customer purchase request': 'CPR',
  direct: 'Direct'
};

function sourceText(source) {
  const raw = String(source ?? '').trim();
  if (!raw) return '';
  return SOURCE_TEXT[raw.toLowerCase()] || raw;
}

function titleStatus(status) {
  return String(status ?? '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Every module-level value the record's View/Preview shows, as printable
 * [label, value] rows. Empty values are dropped (the same way the preview
 * renders an empty optional field as a dash) and amounts/dates keep the
 * shared formatters so the download never shows a different figure.
 */
function moduleDetailRows(doc = {}, moduleKey, money = docMoney) {
  const rows = [];
  const add = (label, value) => {
    const text = value == null ? '' : String(value).trim();
    if (!text || text === '—' || text === 'undefined' || text === 'null') return;
    rows.push([label, text]);
  };
  const date = (key, fallbackKey) => {
    const raw = doc[key] ?? (fallbackKey ? doc[fallbackKey] : null);
    return raw ? formatDate(raw) : '';
  };
  const amount = (value) => (value == null || value === '' ? '' : money(num(value)));

  switch (moduleKey) {
    case 'quotation':
      add('Quotation No', doc.quotationNo);
      add('Quotation Date', date('quotationDate', 'createdAt'));
      add('Valid Till', date('validUntil'));
      add('Reference PR No', doc.referencePrNo || doc.reference);
      add(
        'Reference Source',
        doc.referencePrSource === 'CPR' || doc.sourceCpr || doc.cprId
          ? 'CPR Reference'
          : doc.referencePrSource === 'DIRECT'
            ? 'Direct PR Reference'
            : ''
      );
      add('CPR No', doc.sourceCpr);
      add('Cost Workout', doc.sourceCw);
      add('Sales Person', doc.salesPerson);
      add('Payment Terms', doc.paymentTerms);
      add('Lead Time', doc.deliveryTerms);
      add('Tax Type', doc.taxType);
      add('Currency', doc.currency);
      break;
    case 'salesContract':
      add('Sales Contract No', doc.scNo);
      add('Customer PO', doc.poRef);
      add('Contract Date', date('contractDate', 'createdAt'));
      add('Lead No', doc.leadNo);
      add('Quotation Ref', doc.qtnRef);
      add('Sales Executive', doc.salesExecutive);
      add('Payment Terms', doc.paymentTerms);
      add('Delivery Terms', doc.deliveryTerms);
      add('Contract Validity', date('validity'));
      add('Contract Duration', doc.duration);
      add('Warranty Terms', doc.warranty);
      break;
    case 'salesOrder':
      add('CPO No', cpoNo(doc.soNo));
      add('Customer PO', doc.customerPo);
      add('Order Date', date('orderDate', 'createdAt'));
      add('Lead No', doc.leadNo);
      add('Quotation Ref', doc.qtnRef);
      add('Contract Ref', doc.scRef);
      add('Sales Executive', doc.salesExecutive);
      add('Payment Terms', doc.paymentTerms);
      add('Delivery Terms', doc.deliveryTerms);
      add('Delivery Date', date('deliveryDate'));
      add('Release Method', doc.releaseMethod);
      add('Release Required', doc.releaseRequired);
      add('Action Type', doc.actionType);
      add('Release Date', date('releaseDate'));
      add('Release to Department', doc.releaseToDepartment);
      add('Participation Required', doc.participationRequired);
      add('Assigned To', doc.assignedTo);
      add('Department / Team', doc.departmentTeam);
      add('Action Deadline', date('actionDeadline'));
      add('Action Remarks', doc.actionRemarks);
      add('Action / Release Instructions', doc.actionInstructions);
      break;
    case 'deliveryChallan':
      add('Challan No', doc.dcNo);
      add('CPO Ref', cpoNo(doc.soRef));
      add('Contract Ref', doc.scRef);
      add('Challan Date', date('dcDate', 'createdAt'));
      add('Transport Company', doc.transportCompany);
      add('Vehicle Number', doc.vehicleNumber);
      add('Driver', [doc.driverName, doc.driverPhone ? `(${doc.driverPhone})` : ''].filter(Boolean).join(' '));
      add('LR No', doc.lrNumber);
      add('E-Way Bill', doc.ewayBill);
      add('Dispatch Date', date('dispatchDate'));
      add('Expected Delivery', date('deliveryDate'));
      break;
    case 'proformaInvoice':
      add('Proforma Invoice No', doc.piNo);
      add('Proforma Date', date('piDate', 'createdAt'));
      add('Contract No', doc.contractNo);
      add('Appendix / PO No', doc.appendixPoNo);
      add('Reference No', doc.referenceNo);
      add('Valid Till', date('validTill'));
      add('Source', sourceText(doc.source));
      add('Source Ref', doc.sourceRef);
      add('Currency', doc.currency);
      break;
    case 'invoice': {
      add('Invoice No', doc.invoiceNo);
      add('Invoice Date', date('invoiceDate', 'createdAt'));
      add('Due Date', date('dueDate'));
      add('Reference No', doc.referenceNo);
      add('Source', sourceText(doc.source));
      add('Source Ref', doc.sourceRef);
      // Export / SEZ invoices carry their own export references and parties.
      if (['export', 'sez'].includes(String(doc.invoiceType || ''))) {
        add('Contract No', doc.contractNo);
        add('Contract Date', date('contractDate'));
        add('Appendix No', doc.appendixNo);
        add("Exporter's Ref", doc.exporterRef);
        add('PO No', doc.poNo);
        add('Currency', doc.currency);
        add('Consignee', doc.consigneeName);
        add('Country of Origin', doc.countryOfOrigin);
      }
      break;
    }
    case 'paymentReceipt':
      add('Receipt No', doc.receiptNo);
      add('Payment Date', date('paymentDate', 'createdAt'));
      add('Payment Mode', doc.paymentMode);
      add('Bank Name', doc.bankName);
      add('Branch', doc.branch);
      add('Cheque / Tx No', doc.chequeTx);
      add('Reference No', doc.referenceNo);
      add('Source', sourceText(doc.source));
      add('Invoice Ref', doc.invoiceRef);
      break;
    case 'creditNote':
      add('Credit Note No', doc.cnNo);
      add('Credit Note Date', date('cnDate', 'createdAt'));
      add('CPO No.', doc.cpoNo ? cpoNo(doc.cpoNo) : '');
      add('Source', sourceText(doc.source));
      add('Source Document', doc.sourceRef);
      add('Original Invoice Date', date('sourceDate'));
      add('Dispatch Date', date('dispatchDate'));
      add('Destination Reached Date', date('destinationReachedDate'));
      add('Due Date', date('dueDate'));
      if (doc.dueDateExceeded != null) {
        add('Due Date Exceeded', doc.dueDateExceeded ? 'Overdue' : 'Not Overdue');
      }
      add('Reason', doc.reason);
      add('Credit / Adjustment Amount', amount(doc.refundAmount));
      add('Settlement Method', doc.settlementMethod);
      add('Return Qty', doc.returnQty);
      add('Inventory Impact', doc.inventoryImpact);
      add('Currency', doc.currency);
      break;
    default:
      break;
  }

  add('Status', titleStatus(doc.status));
  // Per-document user-defined fields (the quotation "Add Custom Fields"
  // feature) are saved on the record and shown in the preview.
  if (moduleKey === 'quotation') {
    parseCustomFields(doc.customFields).forEach((f) => {
      if (!String(f.name || '').trim()) return;
      add(String(f.name).trim(), f.type === 'checkbox' ? (f.value ? 'Yes' : 'No') : f.value);
    });
  }
  return rows;
}

/** Bill To / Ship To values the preview's address cards show. */
function customerRows(doc = {}) {
  const rows = [];
  const add = (label, value) => {
    const text = value == null ? '' : String(value).trim();
    if (text) rows.push([label, text]);
  };
  add('Customer', doc.clientName || doc.client);
  add('Contact Person', doc.contactPerson);
  add('Phone', doc.phone);
  add('Email', doc.email);
  add('GSTIN', doc.gstin);
  add('PAN', doc.pan);
  add('Billing Address', doc.billingAddress);
  if (doc.shippingAddress && doc.shippingAddress !== doc.billingAddress) {
    add('Shipping Address', doc.shippingAddress);
  }
  return rows;
}

/** Seller / bank block the preview and the print document both render. */
function sellerRows(doc = {}) {
  const rows = [];
  const add = (label, value) => {
    const text = value == null ? '' : String(value).trim();
    if (text) rows.push([label, text]);
  };
  add('Company', doc.companyName);
  add('Address', doc.companyAddress);
  add('GSTIN', doc.companyGstin);
  add('PAN', doc.companyPan);
  add('Email', doc.companyEmail);
  add('Phone', doc.companyPhone);
  add('Bank', doc.bankName);
  add('A/C', doc.bankAccount);
  add('IFSC', doc.bankIfsc);
  add('Branch', doc.bankBranch);
  add('UPI', doc.bankUpi);
  return rows;
}

/** Summary rows shared by the print document and the PDF (same figures). */
function summaryRowList(totals, moduleKey, isIgst, gstLabel, money = docMoney) {
  const taxRows = isIgst
    ? [[gstLabel, money(totals.taxTotal)]]
    : [['CGST', money(totals.cgstTotal)], ['SGST', money(totals.sgstTotal)]];
  return [
    ['Sub Total', money(totals.subTotal)],
    // A Credit Note has no discount any more, so its (necessarily zero)
    // Discount row is left out entirely; a legacy record that stored a real
    // discount still prints it, and every other module keeps its own row.
    ...(moduleKey === 'creditNote' && !(Number(totals.discount) > 0)
      ? []
      : [['Discount', `${Number(totals.discount) > 0 ? '-' : ''}${money(totals.discount)}`]]),
    ...taxRows,
    ['Tax Total', money(totals.taxTotal)],
    ['Charges', money(totals.charges)],
    ...(moduleKey === 'invoice' ? [['Round Off', money(totals.roundOffAmount)]] : []),
    ['Grand Total', money(totals.grandTotal)]
  ];
}

/**
 * One line-item table for print + PDF.
 *
 * Every value the item grid can show is included when the record carries it:
 * the description (with its item-code / drawing / material / delivery / notes
 * sub-fields), quantity, unit, HSN, rate, per-item discount, taxable value, the
 * GST split and the line total. Columns only appear when at least one line has
 * the value, so no empty column is invented.
 */
function itemTableModel(doc = {}, items = [], money = docMoney) {
  const list = Array.isArray(items) ? items : [];
  const isIgst = String(doc.taxType || '').toLowerCase().includes('igst');
  const showHsn = isHsnVisible(doc.hsnView) && list.some((it) => String(it?.hsn ?? '').trim() !== '');
  const anyDiscount = list.some((it) => num(it?.discountPct) > 0);
  const rates = [...new Set(list.map((it) => num(it?.gstRate)).filter((r) => r > 0))];
  const anyTax =
    rates.length > 0 ||
    list.some((it) => num(it?.cgst) > 0 || num(it?.sgst) > 0 || num(it?.igst) > 0);
  const singleRate = rates.length === 1 ? rates[0] : null;
  const gstLabel = String(doc.taxType || '').trim() || 'IGST';

  const cols = [];
  const col = (key, label, align = 'left') => cols.push({ key, label, align });
  col('sno', 'S.No', 'center');
  col('qty', 'QTY', 'center');
  col('unit', 'UOM', 'center');
  if (showHsn) col('hsn', 'HSN', 'center');
  col('description', 'ITEM DESCRIPTION');
  col('rate', 'RATE', 'right');
  if (anyDiscount) {
    col('discountPct', 'DISC %', 'right');
    col('taxable', 'TAXABLE', 'right');
  }
  if (anyTax) {
    if (isIgst) {
      col('igst', singleRate != null ? `${gstLabel} ${singleRate}%` : gstLabel, 'right');
    } else {
      col('cgst', singleRate != null ? `CGST ${round2(singleRate / 2)}%` : 'CGST', 'right');
      col('sgst', singleRate != null ? `SGST ${round2(singleRate / 2)}%` : 'SGST', 'right');
    }
  }
  col('total', 'TOTAL', 'right');

  const rows = list.map((it, idx) => {
    const la = lineAmount(it);
    const taxable =
      it?.taxable ?? it?.taxableAmount ?? it?.netAmount ?? la.taxable;
    const cgst = it?.cgst != null ? num(it.cgst) : round2(la.tax / 2);
    const sgst = it?.sgst != null ? num(it.sgst) : round2(la.tax / 2);
    const igst = it?.igst != null ? num(it.igst) : la.tax;
    const total =
      it?.total ?? it?.amount ?? it?.totalAmount ?? la.amount;
    const cells = {
      sno: String(idx + 1),
      qty: String(it?.qty ?? '—'),
      unit: it?.unit || it?.uom || '—',
      hsn: it?.hsn || '—',
      description: itemDescriptionText(it),
      rate: money(num(it?.rate)),
      discountPct: `${num(it?.discountPct)}%`,
      taxable: money(num(taxable)),
      cgst: money(cgst),
      sgst: money(sgst),
      igst: money(igst),
      total: money(num(total))
    };
    return cols.map((c) => String(cells[c.key] ?? ''));
  });

  return { cols, rows, gstLabel, isIgst };
}

/**
 * Item description text: the entered description FIRST (it was previously
 * dropped whenever an item code / drawing number existed), then each populated
 * sub-field on its own line — the same values the item grid's columns show.
 */
function itemDescriptionText(it = {}) {
  const desc = String(it?.description || it?.productName || '').trim();
  const lines = desc ? [desc] : [];
  const push = (label, value) => {
    const text = String(value ?? '').trim();
    if (text && text !== desc) lines.push(`${label}: ${text}`);
  };
  push('Item Code', it?.sku);
  push('Drawing No', it?.drawingNo);
  push('Material', it?.material);
  push('Delivery', it?.delivery);
  push('Notes', it?.notes);
  push('Remarks', it?.remarks);
  return lines.length ? lines.join('\n') : '—';
}

/**
 * The user's own item-grid columns (Manage Columns → Add custom column).
 * Values ride inside `item.customFields[columnId]`; the labels live in the
 * persisted grid configuration, which is the only reason this is async. Any
 * failure simply means "no custom columns", never a broken download.
 */
async function customItemColumns(doc, moduleKey) {
  try {
    const setName = itemColumnSetForModule(moduleKey, doc);
    if (!setName) return [];
    // A record carrying its own column configuration needs no request at all.
    const recordColumns =
      Array.isArray(doc?.itemColumns) && doc.itemColumns.length ? doc.itemColumns : null;
    const gridKey = gridKeyForSet(setName);
    const saved = recordColumns || !gridKey ? null : await loadGridConfig(gridKey);
    const columns = detailColumnsFor(setName, { recordColumns: recordColumns || saved });
    return columns.filter((c) => c && !c.system && !c.hidden && String(c.label || '').trim() !== '');
  } catch {
    return [];
  }
}

function customItemValue(item = {}, column = {}) {
  const cf = item?.customFields && typeof item.customFields === 'object' ? item.customFields : {};
  const raw = cf[column.id] ?? item?.[column.id];
  return raw == null ? '' : String(raw);
}

/** Wraps a note/terms block across as many pages as the text needs. */
function writePdfParagraph(pdf, label, text, startY) {
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const textWidth = pageW - 80;
  // The font size must be set BEFORE measuring the lines: splitTextToSize wraps
  // at the current size, so measuring after a table left a smaller size behind
  // produced lines too wide for the page (and they ran off the right margin).
  pdf.setFontSize(9);
  // pdfSafe: remarks/notes/terms are user text and can contain ₹, — or curly
  // quotes, which the built-in font cannot encode (jsPDF then drew each
  // character separately — the spaced-out text bug).
  const lines = pdf.splitTextToSize(pdfSafe(text), textWidth);
  let y = startY;
  if (y > pageH - 48) {
    pdf.addPage();
    y = 48;
  }
  pdf.setTextColor(100, 116, 139);
  pdf.text(pdfSafe(label), 40, y);
  y += 14;
  pdf.setTextColor(71, 85, 105);
  lines.forEach((line) => {
    if (y > pageH - 48) {
      pdf.addPage();
      y = 48;
    }
    pdf.text(String(line), 40, y);
    y += 12;
  });
  return y;
}

/** Remarks, Notes and Terms each keep their own section, never truncated. */
function writeDocumentNotes(pdf, doc, startY) {
  let y = startY;
  [
    ['Remarks', doc?.remarks],
    ['Notes', doc?.notes],
    ['Terms', doc?.terms]
  ].forEach(([label, value]) => {
    if (!value) return;
    y = writePdfParagraph(pdf, label, value, y + 10);
  });
  return y;
}

/**
 * Professional A4 EXPORT INVOICE document (Preview button on the Export Invoice
 * create form). Built from the CURRENT unsaved form state — nothing is
 * persisted — and designed for A4 printing / PDF generation:
 *
 *   EXPORT INVOICE title + LUT declaration | Exporter + Invoice Details |
 *   Consignee + Buyer | Export & Shipment details | Item table | Packing |
 *   Totals (currency-aware) | Bank details (incl. SWIFT) | Terms | Authorization
 */
export function buildExportInvoicePrintHtml(form = {}, items = []) {
  const currency = String(form.currency || 'EUR').toUpperCase();
  const isLut = String(form.taxTreatment || '').toLowerCase().includes('lut');
  const totals = computeTotals(items, {
    discountPct: form.discountPct ?? 0,
    charges: form.charges ?? 0,
    roundOffEnabled: false
  });
  const discAmt = Number(totals.subTotal) * (Number(form.discountPct || 0) / 100);
  const igst = isLut ? 0 : totals.taxTotal;
  const grand = Number(totals.subTotal) + Number(igst) - Number(discAmt) + Number(totals.charges);

  const meta = (label, value) =>
    value ? `<tr><td class="k">${esc(label)}</td><td>${esc(value)}</td></tr>` : '';

  const itemRows = (Array.isArray(items) ? items : [])
    .filter((it) => !it || !it.rowType || it.rowType === 'item')
    .map((it, idx) => {
      const desc = [esc(it.description || it.productName || ''), esc(it.sku || '')].filter(Boolean).join('<br>');
      return `<tr>
        <td class="c">${idx + 1}</td>
        <td class="l">${desc || '—'}</td>
        <td>${esc(it.sku || '—')}</td>
        <td>${esc(it.drawingNo || '—')}</td>
        <td>${esc(it.material || '—')}</td>
        <td class="c">${esc(it.hsn || '—')}</td>
        <td class="c">${esc([it.marksNos, it.noKindPkgs].filter(Boolean).join(' · ') || '—')}</td>
        <td>${esc(it.manufacturer || '—')}</td>
        <td>${esc(it.countryOfOrigin || '—')}</td>
        <td class="r">${Number(it.qty ?? 1).toLocaleString('en-US')}</td>
        <td class="c">${esc(it.unit || it.uom || '—')}</td>
        <td class="r">${exportMoney(it.rate, currency)}</td>
        <td class="r">${exportMoney(Number(it.qty ?? 1) * Number(it.rate || 0), currency)}</td>
      </tr>`;
    })
    .join('');

  // Packing mirrors the export-invoice preview: package type, count, dimensions,
  // total volume, weight and remarks — volume/weight were missing before.
  const packing = parsePackingDetails(form.packingDetails);
  const packingRows = packing
    .map((p) =>
      `<tr><td>${esc(p.packageType || '—')}</td><td class="c">${esc(p.noOfPackages || '—')}</td><td>${esc(p.dimensions || '—')}</td><td class="r">${p.volume != null && p.volume !== '' ? Number(p.volume).toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—'}</td><td class="r">${p.weight != null && p.weight !== '' ? Number(p.weight).toLocaleString('en-US', { maximumFractionDigits: 3 }) : '—'}</td><td>${esc(p.packingRemarks || '—')}</td></tr>`
    )
    .join('');

  const exporterAddress = String(form.companyAddress || '').replace(/\n/g, '<br>');
  const consigneeAddress = String(form.consigneeAddress || '').replace(/\n/g, '<br>');
  const buyerAddress = String(form.buyerAddress || '').replace(/\n/g, '<br>');
  const bankAddress = String(form.bankAddress || '').replace(/\n/g, '<br>');
  const terms = String(form.terms || '').replace(/\n/g, '<br>');

  const shipmentRows = [
    meta('Country of Origin of Goods', form.countryOfOrigin),
    meta('Country of Final Destination', form.countryOfFinalDestination),
    meta('Pre-Carriage By', form.preCarriageBy),
    meta('Place of Receipt', form.placeOfReceipt),
    meta('Vessel / Flight No', form.vesselFlightNo),
    meta('Port of Loading', form.portOfLoading),
    meta('Port of Discharge', form.portOfDischarge),
    meta('Port of Delivery', form.portOfDelivery),
    meta('Export HS Code', form.hsCode),
    meta('Commodity', form.commodity),
    meta('Terms of Delivery / Incoterms', form.termsOfDelivery),
    meta('Payment Terms', form.paymentTerms),
    meta('Currency', currency)
  ].join('');

  const bankRows = [
    meta('Bank Name', form.bankName),
    meta('Account Number', form.bankAccount),
    meta('Branch', form.bankBranch),
    meta('Bank Address', bankAddress),
    meta('SWIFT / BIC Code', form.bankSwift),
    meta('IFSC Code', form.bankIfsc),
    meta('Account Type', form.bankType),
    meta('UPI ID', form.bankUpi)
  ].join('');

  const detailRows = [
    meta('Invoice No', form.invoiceNo),
    meta('Invoice Date', formatDate(form.invoiceDate)),
    meta('Contract No', form.contractNo),
    meta('Contract Date', formatDate(form.contractDate)),
    meta('Appendix No', form.appendixNo),
    meta('Appendix Date', formatDate(form.appendixDate)),
    meta("Exporter's Ref", form.exporterRef),
    meta('PO No', form.poNo),
    meta('PO Date', formatDate(form.poDate)),
    meta('Due Date', formatDate(form.dueDate)),
    meta('Reference No', form.referenceNo)
  ].join('');

  const declaration = isLut
    ? 'SUPPLY MEANT FOR EXPORT / SUPPLY TO SEZ UNIT OR SEZ DEVELOPER FOR AUTHORISED OPERATIONS UNDER BOND OR LETTER OF UNDERTAKING WITHOUT PAYMENT OF IGST'
    : '';

  const summaryRows = [
    ['Sub Total', exportMoney(totals.subTotal, currency)],
    ['IGST', exportMoney(igst, currency)],
    ['Discount', `${Number(discAmt) > 0 ? '− ' : ''}${exportMoney(discAmt, currency)}`],
    ['Additional Charges', exportMoney(totals.charges, currency)],
    ['Grand Total', exportMoney(grand, currency)]
  ]
    .map(([k, v]) => `<tr class="${k === 'Grand Total' ? 'grand' : ''}"><td class="k">${k}</td><td class="r">${v}</td></tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>EXPORT INVOICE - ${esc(form.invoiceNo || '')}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; font-size: 11px; line-height: 1.45; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 12mm 10mm; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0B4A3D; padding-bottom: 10px; margin-bottom: 10px; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 42px; width: auto; object-fit: contain; }
  .brand-name { font-size: 20px; font-weight: 800; color: #0B4A3D; letter-spacing: .02em; }
  .brand-tag { font-size: 9px; color: #94a3b8; text-transform: uppercase; letter-spacing: .18em; }
  .doc-title { font-size: 18px; font-weight: 800; color: #0B4A3D; text-align: right; letter-spacing: .04em; }
  .doc-meta { margin-top: 6px; font-size: 10px; color: #475569; text-align: right; }
  .doc-meta b { color: #0f172a; }
  .declaration { background: #E8F0EE; border: 1px solid #0B4A3D; color: #0B4A3D; font-weight: 700; text-align: center; padding: 7px 10px; font-size: 9.5px; letter-spacing: .03em; margin-bottom: 10px; }
  .cols { display: flex; gap: 10px; margin-bottom: 10px; }
  .box { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; min-width: 0; }
  .box h3 { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #0B4A3D; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; }
  .box p { font-size: 10.5px; margin: 1px 0; }
  .box p strong { font-size: 11px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  th { background: #0B4A3D; color: #fff; font-size: 8.5px; text-transform: uppercase; letter-spacing: .04em; padding: 5px 6px; text-align: left; }
  td { border-bottom: 1px solid #e2e8f0; padding: 4px 6px; font-size: 10px; vertical-align: top; }
  td.k { width: 38%; color: #64748b; }
  /* Alignment classes apply to headers as well, so a column's header sits over
     its own values (Qty / Rate / Total are right-aligned like their cells). */
  .c { text-align: center; }
  .r { text-align: right; }
  .l { text-align: left; }
  /* The item table is the only one with this many columns: a fixed layout keeps
     the declared proportions instead of letting the browser squeeze the
     description column, and keeps header columns aligned with their cells. */
  table.items { table-layout: fixed; }
  table.items th, table.items td { font-size: 8px; }
  /* Headers are one size smaller so single-word labels (MANUFACTURER) fit
     inside their column instead of spilling into the next one. */
  table.items th { vertical-align: bottom; font-size: 7.5px; }
  table.items td { overflow-wrap: break-word; }
  /* Amounts keep one line; the description is the column that wraps. */
  table.items td.r { white-space: nowrap; }
  .summary { width: 260px; margin-left: auto; }
  .summary td.k { width: 130px; }
  .summary tr.grand td { font-size: 13px; font-weight: 800; color: #0B4A3D; border-top: 2px solid #0B4A3D; border-bottom: none; }
  .footer { margin-top: 14px; display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; }
  .sign { text-align: center; width: 220px; }
  .sign .line { border-top: 1.5px solid #0f172a; margin-top: 34px; padding-top: 5px; }
  .sign .line div { font-size: 10px; font-weight: 700; color: #0f172a; }
  @media print { body { margin: 0; } .page { padding: 10mm; } }
</style>
</head>
<body>
  <div class="page">
    <!-- ===== Header ===== -->
    <div class="head">
      <div class="brand">
        <img src="${VH_LOGO_PLATE_URI}" alt="VISHAK TECH" />
        <div>
          <div class="brand-name">VISHAK TECH</div>
          <div class="brand-tag">Enterprise Solutions</div>
        </div>
      </div>
      <div>
        <div class="doc-title">EXPORT INVOICE</div>
        <div class="doc-meta">
          <b>Invoice No:</b> ${esc(form.invoiceNo || '—')} &nbsp;·&nbsp; <b>Invoice Date:</b> ${esc(formatDate(form.invoiceDate) || '—')}
        </div>
      </div>
    </div>

    ${declaration ? `<div class="declaration">${esc(declaration)}</div>` : ''}

    <!-- ===== Exporter + Invoice Details ===== -->
    <div class="cols">
      <div class="box">
        <h3>Exporter / Manufacturer</h3>
        <p><strong>${esc(form.companyName || '—')}</strong></p>
        <p>${exporterAddress || '—'}</p>
        ${form.companyGstin ? `<p>GSTIN: ${esc(form.companyGstin)}</p>` : ''}
        ${form.companyPan ? `<p>PAN: ${esc(form.companyPan)}</p>` : ''}
        ${form.companyEmail ? `<p>Email: ${esc(form.companyEmail)}</p>` : ''}
        ${form.companyPhone ? `<p>Phone: ${esc(form.companyPhone)}</p>` : ''}
        ${form.lutArn ? `<p>LUT ARN: ${esc(form.lutArn)}</p>` : ''}
      </div>
      <div class="box">
        <h3>Invoice Details</h3>
        <table>${detailRows}</table>
      </div>
    </div>

    <!-- ===== Consignee + Buyer ===== -->
    <div class="cols">
      <div class="box">
        <h3>Consignee (Ship To)</h3>
        <p><strong>${esc(form.consigneeName || '—')}</strong></p>
        <p>${consigneeAddress || '—'}</p>
        ${form.consigneeCountry ? `<p>${esc(form.consigneeCountry)}</p>` : ''}
      </div>
      <div class="box">
        <h3>Buyer (Bill To)</h3>
        <p><strong>${esc(form.buyerName || form.clientName || '—')}</strong></p>
        <p>${buyerAddress || '—'}</p>
        ${form.buyerCountry ? `<p>${esc(form.buyerCountry)}</p>` : ''}
      </div>
    </div>

    <!-- ===== Export & Shipment Details ===== -->
    <div class="box" style="margin-bottom:10px">
      <h3>Export &amp; Shipment Details</h3>
      <table>${shipmentRows}</table>
    </div>

    <!-- ===== Items ===== -->
    <table class="items">
      <colgroup>
        <col style="width:4.5%" /><col style="width:16.5%" /><col style="width:8%" /><col style="width:7.5%" /><col style="width:8%" /><col style="width:5%" /><col style="width:7.5%" /><col style="width:10%" /><col style="width:8%" /><col style="width:5%" /><col style="width:4.5%" /><col style="width:8%" /><col style="width:7.5%" />
      </colgroup>
      <thead>
        <tr>
          <th class="c">S.No</th>
          <th class="l">Product / Description</th>
          <th class="l">Item Code</th>
          <th class="l">Drawing No</th>
          <th class="l">Material</th>
          <th class="c">HSN</th>
          <th class="c">Marks &amp; Nos / Pkgs</th>
          <th class="l">Manufacturer</th>
          <th class="l">Country of Origin</th>
          <th class="r">Qty</th>
          <th class="c">UOM</th>
          <th class="r">Rate (${esc(currency)})</th>
          <th class="r">Total (${esc(currency)})</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows || '<tr><td colspan="13" class="c">No items</td></tr>'}
      </tbody>
    </table>

    <!-- ===== Packing ===== -->
    ${packingRows ? `<div class="box" style="margin-bottom:10px">
      <h3>Packing Details</h3>
      <table>
        <thead><tr><th class="l">Package Type</th><th class="c">No. of Packages</th><th class="l">Dimensions (L × W × H)</th><th class="r">Total Volume (m³)</th><th class="r">Weight (kg)</th><th class="l">Packing Remarks</th></tr></thead>
        <tbody>${packingRows}</tbody>
      </table>
    </div>` : ''}

    <!-- ===== Totals ===== -->
    <table class="summary">${summaryRows}</table>

    <!-- ===== Bank ===== -->
    ${bankRows ? `<div class="box" style="margin-bottom:10px">
      <h3>Bank Details</h3>
      <table>${bankRows}</table>
    </div>` : ''}

    <!-- ===== Terms ===== -->
    ${terms ? `<div class="box" style="margin-bottom:10px">
      <h3>Terms &amp; Conditions</h3>
      <p>${terms}</p>
    </div>` : ''}

    <!-- ===== Authorization ===== -->
    <div class="footer">
      <div style="font-size:10px;color:#475569">
        ${declaration ? `<p style="max-width:320px;font-weight:700;color:#0B4A3D">${esc(declaration)}</p>` : ''}
      </div>
      <div class="sign">
        <div class="line">
          <div>For ${esc(form.companyName || 'VISHAK TECH')}</div>
          <div>${esc(form.authorizedSignatory || 'Authorized Signatory')}</div>
          ${form.designation ? `<div style="font-weight:600">${esc(form.designation)}</div>` : ''}
          ${form.place || form.authorizationDate ? `<div style="font-weight:600">${[esc(form.place), formatDate(form.authorizationDate)].filter(Boolean).join(', ')}</div>` : ''}
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

export function buildSalesPrintHtml(doc, title, moduleKey) {
  const items = Array.isArray(doc.items) ? doc.items : [];
  const totals = docTotals(doc, moduleKey);
  const no = docNumber(doc, moduleKey);
  const details = moduleDetailRows(doc, moduleKey);
  const itemTable = itemTableModel(doc, items);

  const isIgst = itemTable.isIgst;
  const gstLabel = itemTable.gstLabel;

  const summaryRows = summaryRowList(totals, moduleKey, isIgst, gstLabel)
    .map(([k, v]) => `<tr><td class="k">${k}</td><td style="text-align:right;font-weight:600">${v}</td></tr>`)
    .join('');

  // Payment receipts carry a single amount (no item grid) — render a receipt layout.
  if (moduleKey === 'paymentReceipt') {
    const receiptRows = details
      .map(([k, v]) => `<tr><td class="k">${esc(k)}</td><td style="font-weight:600">${esc(v)}</td></tr>`)
      .join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} - ${no || ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  .brand-img { height: 44px; width: auto; max-width: 220px; object-fit: contain; display: block; }
  .doc-title { font-size: 14px; color: #6B7280; margin-top: 2px; }
  .meta { font-size: 11px; color: #6B7280; margin: 4px 0 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e2e8f0; }
  td.k { width: 200px; color: #6B7280; }
  .amount td { font-size: 16px; font-weight: 800; color: #032f25; }
  @media print { body { margin: 10mm; } }
</style>
</head>
<body>
  <img class="brand-img" src="${VH_LOGO_PLATE_URI}" alt="VISHAK TECH" />
  <div class="doc-title">${title}</div>
  <div class="meta">${no || ''} · Generated on ${formatDateTime(new Date().toISOString())}</div>
  <table>
    ${receiptRows}
    <tr class="amount"><td class="k">Amount Received</td><td>${formatINR(doc.amount ?? 0)}</td></tr>
  </table>
  ${doc.remarks ? `<div style="font-size:12px;color:#475569;white-space:pre-wrap"><strong>Remarks:</strong> ${esc(doc.remarks)}</div>` : ''}
  ${doc.notes ? `<div style="font-size:12px;color:#475569;white-space:pre-wrap"><strong>Notes:</strong> ${esc(doc.notes)}</div>` : ''}
  ${doc.terms ? `<div style="font-size:12px;color:#475569;white-space:pre-wrap"><strong>Terms:</strong> ${esc(doc.terms)}</div>` : ''}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
  }

  // Document details — every module-level value the record's View/Preview shows
  // (references, terms, transport, release/procurement, credit-note fields,
  // quotation custom fields…). Built from the same persisted record, so the
  // printed/downloaded document can never drop a field the preview displays.
  const detailsBlock = details.length
    ? `<div style="margin:0 0 20px">
        <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Document Details</h3>
        <table class="info">${details
          .map(([label, value]) => `<tr><td class="k">${esc(label)}</td><td>${esc(value)}</td></tr>`)
          .join('')}</table>
      </div>`
    : '';

  const companyBlock = doc.companyName
    ? `
      <div>
        <h3>From</h3>
        <p><strong>${doc.companyName}</strong></p>
        ${doc.companyAddress ? `<p>${doc.companyAddress}</p>` : ''}
        ${doc.companyGstin ? `<p>GSTIN: ${doc.companyGstin}</p>` : ''}
        ${doc.companyPan ? `<p>PAN: ${doc.companyPan}</p>` : ''}
      </div>`
    : '';

  const bankBlock =
    doc.bankName || doc.bankAccount || doc.bankIfsc
      ? `
      <div>
        <h3>Bank Details</h3>
        ${doc.bankName ? `<p>Bank: ${doc.bankName}</p>` : ''}
        ${doc.bankAccount ? `<p>A/C: ${doc.bankAccount}</p>` : ''}
        ${doc.bankIfsc ? `<p>IFSC: ${doc.bankIfsc}</p>` : ''}
        ${doc.bankBranch ? `<p>Branch: ${doc.bankBranch}</p>` : ''}
        ${doc.bankUpi ? `<p>UPI: ${doc.bankUpi}</p>` : ''}
      </div>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${title} - ${no || ''}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1e293b; margin: 24px; }
  .brand-img { height: 44px; width: auto; max-width: 220px; object-fit: contain; display: block; }
  .doc-title { font-size: 14px; color: #6B7280; margin-top: 2px; }
  .meta { font-size: 11px; color: #6B7280; margin: 4px 0 16px; }
  .cols { display: flex; gap: 32px; margin-bottom: 20px; }
  .cols h3 { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #9CA3AF; margin: 0 0 6px; }
  .cols p { margin: 2px 0; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 20px; }
  thead th { background: #032f25; color: #F3F4F6; text-align: left; padding: 7px 8px; text-transform: uppercase; font-size: 9px; letter-spacing: .04em; }
  thead th.r { text-align: right; }
  thead th.c { text-align: center; }
  tbody td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
  tbody td.r { text-align: right; }
  tbody td.c { text-align: center; }
  tbody td.l { text-align: left; }
  tr.sum th { background: #F3F4F6; color: #032f25; text-align: right; padding: 7px 8px; }
  .info td.k { width: 150px; color: #6B7280; }
  .info td { padding: 3px 8px; font-size: 12px; }
  .summary { width: 320px; margin-left: auto; }
  .summary td.k { width: 140px; color: #6B7280; }
  .summary td { padding: 4px 8px; font-size: 12px; }
  .total-row td { font-size: 14px; font-weight: 800; color: #032f25; border-top: 2px solid #032f25; }
  .remarks { font-size: 12px; color: #475569; white-space: pre-wrap; margin-bottom: 14px; }
  /* A long item table may run onto a second printed page: keep its header row
     (and therefore the column it labels) on every page. */
  @media print { body { margin: 10mm; } thead { display: table-header-group; } tr { break-inside: avoid; } }
</style>
</head>
<body>
  <img class="brand-img" src="${VH_LOGO_PLATE_URI}" alt="VISHAK TECH" />
  <div class="doc-title">${title}</div>
  <div class="meta">${no || ''} · Generated on ${formatDateTime(new Date().toISOString())}</div>
  <div class="cols">
    ${companyBlock}
    <div>
      <h3>Bill To</h3>
      <p><strong>${doc.clientName || doc.client || '—'}</strong></p>
      ${doc.contactPerson ? `<p>${doc.contactPerson}</p>` : ''}
      ${doc.phone ? `<p>${doc.phone}</p>` : ''}
      ${doc.email ? `<p>${doc.email}</p>` : ''}
      ${doc.gstin ? `<p>GSTIN: ${doc.gstin}</p>` : ''}
      ${doc.pan ? `<p>PAN: ${doc.pan}</p>` : ''}
      ${doc.billingAddress ? `<p>${doc.billingAddress}</p>` : ''}
      ${doc.shippingAddress && doc.shippingAddress !== doc.billingAddress ? `<p><strong>Ship To:</strong> ${doc.shippingAddress}</p>` : ''}
    </div>
    ${bankBlock}
  </div>
  ${detailsBlock}
  <h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Items</h3>
  <table>
    <thead><tr>${itemTable.cols.map((c) => `<th class="${c.align === 'right' ? 'r' : c.align === 'center' ? 'c' : 'l'}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>
      ${itemTable.rows.length
        ? itemTable.rows
            .map((row) => `<tr>${row
              .map((cell, i) => `<td class="${itemTable.cols[i]?.align === 'right' ? 'r' : itemTable.cols[i]?.align === 'center' ? 'c' : 'l'}">${esc(cell).replace(/\n/g, '<br>')}</td>`)
              .join('')}</tr>`)
            .join('')
        : `<tr><td class="c" colspan="${itemTable.cols.length}">No items</td></tr>`}
      <tr class="sum"><th colspan="${Math.max(itemTable.cols.length - 1, 1)}">Total</th><th style="text-align:right">${docMoney(totals.grandTotal)}</th></tr>
    </tbody>
  </table>
  <table class="summary">${summaryRows}</table>
  ${doc.remarks ? `<h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Remarks</h3><div class="remarks">${esc(doc.remarks)}</div>` : ''}
  ${doc.notes ? `<h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Notes</h3><div class="remarks">${esc(doc.notes)}</div>` : ''}
  ${doc.terms ? `<h3 style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#9CA3AF;margin:0 0 6px">Terms</h3><div class="remarks">${esc(doc.terms)}</div>` : ''}
  <script>window.onload = function () { window.print(); };</script>
</body>
</html>`;
}

export async function exportSalesDocumentPdf(doc, title, moduleKey, filename, options = {}) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const items = Array.isArray(doc.items) ? doc.items : [];
  const totals = docTotals(doc, moduleKey);
  const no = cpoNo(docNumber(doc, moduleKey));
  const currency = doc.currency || 'INR';
  const money = (value) => pdfMoney(value, currency);
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });

  const PAGE_MARGIN = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;

  // Official Vishak Tech logo (plate) — keeps proportions, readable on white.
  const brandPlate = await loadBrandPlateDataUrl();
  if (brandPlate) {
    pdf.addImage(brandPlate, 'PNG', 40, 28, 150, 0);
  }
  pdf.setFontSize(11);
  pdf.setTextColor(71, 85, 105);
  // Every string goes through pdfSafe: the rupee sign / curly quotes / true
  // minus are outside the built-in font's encoding and made jsPDF place each
  // character separately (the "1 , 8 2 8 . 0 0" spacing bug).
  pdf.text(pdfSafe(`${title} · ${no || ''}`), 40, 76);

  const tableStyles = {
    fontSize: 9,
    cellPadding: { top: 4, right: 5, bottom: 4, left: 5 },
    textColor: [30, 41, 59],
    valign: 'top',
    overflow: 'linebreak',
    lineWidth: 0.2,
    lineColor: [226, 232, 240]
  };
  const headStyles = { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold' };
  const tableMargin = { left: PAGE_MARGIN, right: PAGE_MARGIN, top: 40, bottom: 40 };
  const labelWidth = 140;
  // Key/value tables: the label column is fixed so every value starts on the
  // same x, and the value column takes the rest of the page width.
  const pairColumnStyles = {
    0: { cellWidth: labelWidth, fontStyle: 'bold' },
    1: { cellWidth: contentWidth - labelWidth }
  };
  let cursor = 88;

  const pairTable = (heading, rows) => {
    if (!rows.length) return;
    autoTable(pdf, {
      startY: cursor,
      head: [[pdfSafe(heading), '']],
      body: rows.map(([label, value]) => [pdfSafe(label), pdfSafe(value)]),
      theme: 'grid',
      styles: tableStyles,
      headStyles,
      columnStyles: pairColumnStyles,
      margin: tableMargin
    });
    cursor = (pdf.lastAutoTable?.finalY || cursor) + 14;
  };

  // ---- Document details (the same module-level values the preview shows) ----
  pairTable('Document Details', moduleDetailRows(doc, moduleKey, money));

  // ---- Customer (Bill To / Ship To) ---------------------------------------
  pairTable('Bill To / Ship To', customerRows(doc));

  // ---- Seller / bank block ------------------------------------------------
  pairTable('Seller / Bank Details', sellerRows(doc));

  if (moduleKey === 'paymentReceipt') {
    // A receipt carries a single amount and no line items.
    autoTable(pdf, {
      startY: cursor,
      head: [[pdfSafe('Amount Received'), '']],
      body: [['', pdfSafe(money(doc.amount ?? 0))]],
      theme: 'grid',
      styles: { ...tableStyles, fontSize: 13, fontStyle: 'bold', textColor: [3, 47, 37] },
      headStyles: { fillColor: [3, 47, 37], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: labelWidth },
        1: { cellWidth: contentWidth - labelWidth, halign: 'right' }
      },
      margin: tableMargin
    });
    cursor = (pdf.lastAutoTable?.finalY || cursor) + 14;
  } else {
    // ---- Line items -------------------------------------------------------
    // Same columns as the print document, plus every custom item column the
    // user configured for this module's item grid (labels from the persisted
    // configuration, values from the item's saved custom fields).
    const customCols = await customItemColumns(doc, moduleKey);
    const model = itemTableModel(doc, items, money);
    const heads = [...model.cols.map((c) => c.label), ...customCols.map((c) => c.label)].map(pdfSafe);
    const aligns = [...model.cols.map((c) => c.align), ...customCols.map(() => 'right')];
    const body = model.rows.map((row, idx) => [
      ...row,
      ...customCols.map((c) => customItemValue(items[idx], c))
    ].map(pdfSafe));
    const flexIndex = model.cols.findIndex((c) => c.key === 'description');

    // Column widths are measured from the actual header/value strings, so a
    // long amount is never squeezed into a narrow column (which is what made
    // autoTable break `₹1,825.00` into separate, spaced-out characters).
    const { widths, fontSize } = fitTableColumns(pdf, {
      heads,
      rows: body,
      flexIndex,
      minFlex: 130,
      padding: 5,
      maxWidth: contentWidth
    });

    const columnStyles = {};
    widths.forEach((width, index) => {
      const align = aligns[index] || 'left';
      columnStyles[index] = {
        cellWidth: width,
        halign: align,
        overflow: index === flexIndex ? 'linebreak' : 'linebreak'
      };
    });

    autoTable(pdf, {
      startY: cursor,
      head: [heads],
      body: body.length ? body : [heads.map((_, i) => (i === 0 ? 'No items' : ''))],
      styles: {
        ...tableStyles,
        fontSize,
        cellPadding: { top: 4, right: 5, bottom: 4, left: 5 }
      },
      headStyles: { ...headStyles, fontSize },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      margin: tableMargin,
      rowPageBreak: 'avoid',
      // Each header sits over its own values with the same alignment
      // (RATE/TOTAL right, QTY/UOM/HSN centred), so a header is never offset
      // from the column it labels.
      didParseCell: (data) => {
        if (data.section !== 'head') return;
        const align = aligns[data.column.index];
        if (align) data.cell.styles.halign = align;
      }
    });
    cursor = (pdf.lastAutoTable?.finalY || cursor) + 14;

    // ---- Summary ----------------------------------------------------------
    const summaryBody = summaryRowList(totals, moduleKey, model.isIgst, model.gstLabel, money).map(
      ([label, value]) => [pdfSafe(label), pdfSafe(value)]
    );
    autoTable(pdf, {
      startY: cursor,
      head: [[pdfSafe('Summary'), '']],
      body: summaryBody,
      theme: 'grid',
      styles: { ...tableStyles, fontSize: 9 },
      headStyles,
      columnStyles: {
        0: { cellWidth: 300, fontStyle: 'bold' },
        1: { cellWidth: contentWidth - 300, halign: 'right', fontStyle: 'bold' }
      },
      margin: tableMargin
    });
    cursor = (pdf.lastAutoTable?.finalY || cursor) + 14;
  }

  // ---- Remarks / Notes / Terms: each its own section, never truncated -----
  writeDocumentNotes(pdf, doc, cursor);

  if (options?.download === false) {
    // Caller (PDF editor) wants the raw bytes to load/edit in the browser;
    // the generated document is otherwise identical to the downloaded PDF.
    return pdf.output('arraybuffer');
  }
  pdf.save(`${filename}.pdf`);
}

export function buildSalesCsvRow(doc, moduleKey, columns) {
  return columns.map((col) => {
    if (col.render) return col.render(doc);
    return doc[col.key] != null ? String(doc[col.key]) : '';
  });
}
