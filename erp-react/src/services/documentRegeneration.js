/**
 * services/documentRegeneration.js
 * ------------------------------------------------------------------
 * "Regenerate Document" for the central Documents repository.
 *
 * A repository entry that came from a business record (a quotation, an
 * invoice, a delivery challan, …) is only a *copy* of that record's
 * printable document. When the record changes, the stored copy can be
 * out of date — this service rebuilds it from the live record and
 * stores the result as a new version of the SAME document, so the
 * document id, module, record link and version chain are preserved.
 *
 * Everything it uses already exists in the project:
 *   • the module services that load the source record        (services/*)
 *   • the exact PDF builder the modules' Export PDF actions use
 *     (utils/salesPrintUtils → exportSalesDocumentPdf)
 *   • the existing version endpoint POST /documents/{id}/versions
 *     (services/documentService → uploadNewVersion)
 *
 * No new backend endpoint, no mock data: if a module has no printable
 * document (a lead, a client, a marketing record…) then regeneration is
 * reported as unavailable instead of pretending to work.
 * ------------------------------------------------------------------
 */
import quotationService from './quotationService';
import salesContractService from './salesContractService';
import salesOrderService from './salesOrderService';
import proformaInvoiceService from './proformaInvoiceService';
import deliveryChallanService from './deliveryChallanService';
import invoiceService from './invoiceService';
import paymentReceiptService from './paymentReceiptService';
import creditNoteService from './creditNoteService';
import documentService from './documentService';
import { exportSalesDocumentPdf } from '../utils/salesPrintUtils';
import { cpoNo } from '../utils/salesHelpers';

/** Today's date, matching the filename convention used by the module Export PDF actions. */
function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function safeNo(value, fallback) {
  const raw = value == null || value === '' ? fallback : value;
  return String(raw).replace(/[\\/:*?"<>|]/g, '_');
}

/**
 * Module → how to rebuild that module's printable document.
 * `title` and `moduleKey` are the exact arguments the module pages pass
 * to exportSalesDocumentPdf, so the regenerated file is byte-for-byte
 * the document the module itself would export.
 */
const GENERATORS = {
  Quotation: {
    load: (id) => quotationService.get(id),
    title: 'Quotation',
    moduleKey: 'quotation',
    filename: (record, doc) => safeNo(record?.quotationNo || doc.recordNumber, 'quotation'),
  },
  'Sales Contract': {
    load: (id) => salesContractService.get(id),
    title: 'Sales Contract',
    moduleKey: 'salesContract',
    filename: (record, doc) => safeNo(record?.scNo || doc.recordNumber, 'contract'),
  },
  'Customer Purchase Order': {
    load: (id) => salesOrderService.get(id),
    title: 'Customer Purchase Order',
    moduleKey: 'salesOrder',
    filename: (record, doc) => safeNo(cpoNo(record?.soNo) || doc.recordNumber, 'order'),
  },
  'Sales Order': {
    load: (id) => salesOrderService.get(id),
    title: 'Customer Purchase Order',
    moduleKey: 'salesOrder',
    filename: (record, doc) => safeNo(cpoNo(record?.soNo) || doc.recordNumber, 'order'),
  },
  'Proforma Invoice': {
    load: (id) => proformaInvoiceService.get(id),
    title: 'Proforma Invoice',
    moduleKey: 'proformaInvoice',
    filename: (record, doc) => safeNo(record?.piNo || doc.recordNumber, 'proforma'),
  },
  'Delivery Challan': {
    load: (id) => deliveryChallanService.get(id),
    title: 'Delivery Challan',
    moduleKey: 'deliveryChallan',
    filename: (record, doc) => safeNo(record?.dcNo || doc.recordNumber, 'challan'),
  },
  Invoice: {
    load: (id) => invoiceService.get(id),
    title: 'Invoice',
    moduleKey: 'invoice',
    filename: (record, doc) => safeNo(record?.invoiceNo || doc.recordNumber, 'invoice'),
  },
  'Payment Receipt': {
    load: (id) => paymentReceiptService.get(id),
    title: 'Payment Receipt',
    moduleKey: 'paymentReceipt',
    filename: (record, doc) => safeNo(record?.receiptNo || doc.recordNumber, 'receipt'),
  },
  'Credit Note': {
    load: (id) => creditNoteService.get(id),
    title: 'Credit Note',
    moduleKey: 'creditNote',
    filename: (record, doc) => safeNo(record?.cnNo || doc.recordNumber, 'credit-note'),
  },
};

/** Modules whose printable document can be rebuilt from the source record. */
export const REGENERATABLE_MODULES = Object.keys(GENERATORS);

/**
 * Whether "Regenerate Document" can run for this repository entry.
 * Returns `{ ok, reason }` so the caller can show a truthful disabled
 * state instead of a menu item that would do nothing.
 */
export function canRegenerateDocument(doc) {
  if (!doc) return { ok: false, reason: 'No document selected' };
  if (!doc.module) return { ok: false, reason: 'This document has no source module' };
  if (!GENERATORS[doc.module]) {
    return { ok: false, reason: `No generated document exists for ${doc.module} records` };
  }
  if (!doc.relatedRecordId) {
    return { ok: false, reason: 'This document is not linked to a source record' };
  }
  return { ok: true, reason: '' };
}

/**
 * Rebuild the document from its source record and store it as the next
 * version of the same repository document.
 *
 * @returns {Promise<{ fileName: string, versionNumber?: number }>}
 */
export async function regenerateDocument(doc) {
  const availability = canRegenerateDocument(doc);
  if (!availability.ok) throw new Error(availability.reason);

  const generator = GENERATORS[doc.module];
  const response = await generator.load(doc.relatedRecordId);
  const record = response?.data ?? response;
  if (!record || (record.id == null && !record[generator.moduleKey])) {
    throw new Error(`Source ${doc.module} record could not be loaded`);
  }

  const baseName = generator.filename(record, doc) || 'document';
  const fileName = `${baseName}-${stamp()}`;

  // Same builder as the module's own "Export PDF" action — returns raw
  // bytes when `download: false` instead of saving a local file.
  const bytes = await exportSalesDocumentPdf(record, generator.title, generator.moduleKey, fileName, {
    download: false
  });

  const file = new File([bytes], `${fileName}.pdf`, { type: 'application/pdf' });
  const result = await documentService.uploadNewVersion(
    doc.id,
    file,
    `Regenerated from ${doc.module}${doc.recordNumber ? ` ${doc.recordNumber}` : ''}`
  );

  const payload = result?.data ?? result;
  return { fileName: file.name, versionNumber: payload?.versionNumber };
}

export default regenerateDocument;
