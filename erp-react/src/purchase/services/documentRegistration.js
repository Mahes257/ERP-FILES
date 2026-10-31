/**
 * purchase/services/documentRegistration.js
 * ------------------------------------------------------------------
 * Automatic registration of system-generated ERP documents into the
 * central Purchase Documents repository.
 *
 * When a business document PDF is generated (PR, RFQ, PO, Invoice, etc.),
 * this service creates or updates the corresponding document record in
 * the Documents repository — ensuring:
 *
 *   • No duplicate records per source document
 *   • Re-generation creates a new version (not a duplicate)
 *   • Source type + source ID/reference are stored
 *   • Generated timestamp + user are recorded
 *   • Preview and Download retrieve the same registered document
 *
 * Stable docId format: DOC-GEN-{docType}-{sourceId}
 * This guarantees idempotency — calling registerGeneratedDocument()
 * multiple times for the same source always updates the same record.
 * ------------------------------------------------------------------
 */
import { DOCUMENT_STAGE, DOCUMENT_TYPE, DOCUMENT_STATUS } from '../constants';
import { documentsStore, DOCUMENT_FOLDER } from './documents';
import { documentVersioningService } from './documentVersioning';
import { getCurrentActor } from './api-client';
import { formatSize } from '../utils/attachmentFile';

/* ─── Document type → stage + folder mapping ─── */
const DOC_TYPE_MAP = {
  PR: {
    stage: DOCUMENT_STAGE.PR,
    folder: DOCUMENT_FOLDER.PR.key,
    label: 'Purchase Requisition',
    prefix: 'PR'
  },
  RFQ: {
    stage: DOCUMENT_STAGE.RFQ,
    folder: DOCUMENT_FOLDER.RFQ.key,
    label: 'Request for Quotation',
    prefix: 'RFQ'
  },
  QUOTATION: {
    stage: DOCUMENT_STAGE.QUOTATION,
    folder: DOCUMENT_FOLDER.RFQ.key,
    label: 'Vendor Quotation',
    prefix: 'QTN'
  },
  TECHNICAL_EVALUATION: {
    stage: DOCUMENT_STAGE.SELECTION,
    folder: DOCUMENT_FOLDER.TSR.key,
    label: 'Technical Evaluation',
    prefix: 'TE'
  },
  PO: {
    stage: DOCUMENT_STAGE.PO,
    folder: DOCUMENT_FOLDER.PO.key,
    label: 'Purchase Order',
    prefix: 'PO'
  },
  SUPPLIER_ACK: {
    stage: DOCUMENT_STAGE.PO,
    folder: DOCUMENT_FOLDER.PO.key,
    label: 'Supplier Acknowledgement',
    prefix: 'ACK'
  },
  INVOICE: {
    stage: DOCUMENT_STAGE.INVOICE,
    folder: DOCUMENT_FOLDER.INVOICE.key,
    label: 'Purchase Invoice',
    prefix: 'INV'
  },
  NFA: {
    stage: DOCUMENT_STAGE.NFA,
    folder: DOCUMENT_FOLDER.NFA.key,
    label: 'Approval Note',
    prefix: 'NFA'
  },
  GRN: {
    stage: DOCUMENT_STAGE.GRN,
    folder: DOCUMENT_FOLDER.LOGISTICS.key,
    label: 'Goods Receipt Note',
    prefix: 'GRN'
  },
  REPORT: {
    stage: DOCUMENT_STAGE.OTHER,
    folder: DOCUMENT_FOLDER.REPORTS.key,
    label: 'Report',
    prefix: 'RPT'
  },
  VENDOR: {
    stage: DOCUMENT_STAGE.OTHER,
    folder: DOCUMENT_FOLDER.VENDOR.key,
    label: 'Vendor Document',
    prefix: 'VND'
  }
};

/**
 * Generate a stable docId for a generated document.
 * Format: DOC-GEN-{docType}-{sourceId}
 * This ensures idempotency — same source always maps to same docId.
 */
function generatedDocId(docType, sourceId) {
  return `DOC-GEN-${docType}-${sourceId}`;
}

/**
 * Register a system-generated document in the central Documents repository.
 *
 * If a document with the same docId already exists, it is UPDATED
 * (new version, new timestamp, new PDF data) rather than duplicated.
 *
 * @param {Object} options
 * @param {string} options.docType - Document type key (PR, RFQ, PO, INVOICE, NFA, etc.)
 * @param {string} options.sourceId - Source record ID (PR id, RFQ id, PO id, etc.)
 * @param {string} options.docNo - Document number (PR-2026-001, RFQ-001, etc.)
 * @param {string} options.name - Display name (e.g. "Purchase Order — PO-001")
 * @param {string} [options.sourceUrl] - Data URL or blob URL of the generated PDF
 * @param {number} [options.fileSize] - Size of the generated file in bytes
 * @param {Object} [options.metadata] - Additional metadata (vendor, prNo, rfqNo, poNo, etc.)
 * @returns {Object} The registered document record
 */
export async function registerGeneratedDocument({
  docType,
  sourceId,
  docNo,
  name,
  sourceUrl = '',
  fileSize = 0,
  metadata = {}
}) {
  const typeConfig = DOC_TYPE_MAP[docType];
  if (!typeConfig) {
    console.warn(`[documentRegistration] Unknown docType: ${docType}`);
    return null;
  }

  const docId = generatedDocId(docType, sourceId);
  const actor = getCurrentActor();
  const now = new Date().toISOString();

  /* Check if this document already exists */
  const existingIdx = documentsStore.all.findIndex((d) => d.docId === docId);

  if (existingIdx !== -1) {
    /* ── UPDATE existing record — increment version ── */
    const existing = documentsStore.all[existingIdx];
    const nextVersion = (existing.version || 1) + 1;
    const updated = {
      ...existing,
      name: name || existing.name,
      sourceUrl: sourceUrl || existing.sourceUrl,
      fileSize: fileSize || existing.fileSize,
      fileSizeLabel: formatSize(fileSize || existing.fileSize || 0),
      version: nextVersion,
      updatedAt: now,
      uploadedBy: actor?.name || 'System',
      /* Preserve source linkage */
      docNo: docNo || existing.docNo,
      ...metadata
    };

    documentsStore.all[existingIdx] = updated;
    documentsStore.persist(documentsStore.all);

    /* Create a version record for the updated document */
    try {
      await documentVersioningService.createVersion(docType, sourceId, {
        status: DOCUMENT_STATUS.GENERATED,
        sourceUrl: sourceUrl || existing.sourceUrl,
        fileSize: fileSize || existing.fileSize,
        changeReason: metadata.changeReason || `Version ${nextVersion} generated`,
        description: name || existing.name
      });
    } catch { /* Best-effort versioning */ }

    return updated;
  }

  /* ── CREATE new record ── */
  const doc = {
    docId,
    name: name || `${typeConfig.label} — ${docNo || sourceId}`,
    docType: DOCUMENT_TYPE.GENERATED,
    docNo: docNo || '',
    stage: typeConfig.stage,
    prNo: metadata.prNo || (docType === 'PR' ? docNo : '') || '',
    rfqNo: metadata.rfqNo || (docType === 'RFQ' ? docNo : '') || '',
    poNo: metadata.poNo || (docType === 'PO' ? docNo : '') || '',
    vendor: metadata.vendor || '',
    uploadedBy: actor?.name || 'System',
    uploadedAt: now,
    updatedAt: now,
    fileType: 'PDF',
    fileSize: fileSize || 0,
    fileSizeLabel: formatSize(fileSize || 0),
    source: DOCUMENT_TYPE.GENERATED,
    sourceUrl,
    sourceType: 'pdf',
    sourceId,
    sourceLabel: docNo || sourceId,
    version: 1,
    status: 'Final',
    folder: typeConfig.folder,
    recordState: 'active'
  };

  documentsStore.all.push(doc);
  documentsStore.persist(documentsStore.all);

  /* Create the initial version record */
  try {
    await documentVersioningService.createVersion(docType, sourceId, {
      status: DOCUMENT_STATUS.GENERATED,
      sourceUrl,
      fileSize,
      changeReason: `Initial version generated`,
      description: name
    });
  } catch { /* Best-effort versioning */ }

  return doc;
}

/**
 * Update the sourceUrl of an already-registered generated document.
 * Called after the PDF is actually generated (rasterized) to store
 * the real data URL for preview/download.
 */
export async function updateGeneratedDocumentUrl(docType, sourceId, sourceUrl, fileSize = 0) {
  const docId = generatedDocId(docType, sourceId);
  const idx = documentsStore.all.findIndex((d) => d.docId === docId);
  if (idx === -1) return null;

  const doc = documentsStore.all[idx];
  documentsStore.all[idx] = {
    ...doc,
    sourceUrl: sourceUrl || doc.sourceUrl,
    fileSize: fileSize || doc.fileSize,
    fileSizeLabel: formatSize(fileSize || doc.fileSize || 0),
    updatedAt: new Date().toISOString()
  };
  documentsStore.persist(documentsStore.all);
  return documentsStore.all[idx];
}

/**
 * Check if a generated document is already registered.
 */
export function isGeneratedDocumentRegistered(docType, sourceId) {
  const docId = generatedDocId(docType, sourceId);
  return documentsStore.all.some((d) => d.docId === docId);
}

/**
 * Get a registered generated document by type + source ID.
 */
export function getGeneratedDocument(docType, sourceId) {
  const docId = generatedDocId(docType, sourceId);
  return documentsStore.all.find((d) => d.docId === docId) || null;
}

/**
 * Ensure a generated document record exists (create if missing).
 * Returns the document record.
 */
export async function ensureGeneratedDocument(options) {
  const existing = getGeneratedDocument(options.docType, options.sourceId);
  if (existing) return existing;
  return registerGeneratedDocument(options);
}

export { DOC_TYPE_MAP, generatedDocId };
