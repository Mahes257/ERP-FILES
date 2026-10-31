/**
 * purchase/services/documents.js
 * ------------------------------------------------------------------
 * Central Purchase Documents repository — one authoritative, persisted
 * collection of documents for the full Purchase workflow.
 *
 * The repository is the single source of truth. It is mutated ONLY by
 * explicit document actions:
 *   · uploadDocument()            — a real file the user attached
 *   · registerGeneratedDocument() — called by the print/generation
 *     flows (services/documentRegistration.js) the moment a workflow
 *     PDF is actually produced
 *   · generateDocument()          — generates the file for a pending
 *     system document the user chose to generate
 *   · archive / delete / restore / rename / move — explicit state
 *
 * Reads (getDocuments / getStats / getFolderCounts / getFilterOptions /
 * refreshDocuments) NEVER discover, seed, generate or append documents.
 * Page mount and refresh are idempotent: they LOAD the persisted
 * collection, calculate metrics and render. Nothing is created from the
 * mere existence of a workflow record — a record only becomes a
 * repository document when a real file is uploaded or generated for it.
 *
 * Every record carries a stable `docId` plus references to the
 * originating transaction so the Documents page can link back.
 * ------------------------------------------------------------------
 */
import {
  DOCUMENT_STAGE, DOCUMENT_TYPE, REPOSITORY_STAGES, VENDOR_DOCUMENT_RECORD_STATE
} from '../constants';
import { getCurrentActor } from './api-client';
import {
  clone, createCollection, delay, paginate, storageKeys
} from './base';
import { formatSize, detectType, fileTypeLabel } from '../utils/attachmentFile';
import { vendorDocumentsStore } from './vendorDocuments';

/* ─── Folder definitions — the 10 Purchase document folders ─── */
export const DOCUMENT_FOLDER = {
  PR: { key: 'PR', label: 'Purchase Requisition', icon: 'ClipboardList', color: '#2563EB', bg: 'rgba(37,99,235,0.08)' },
  TSR: { key: 'TSR', label: 'Technical Specification Review', icon: 'SearchCheck', color: '#7C3AED', bg: 'rgba(124,58,237,0.08)' },
  RFQ: { key: 'RFQ', label: 'RFQ & Quotations', icon: 'Mail', color: '#0D9488', bg: 'rgba(13,148,136,0.08)' },
  PO: { key: 'PO', label: 'Purchase Orders', icon: 'FileText', color: '#059669', bg: 'rgba(5,150,105,0.08)' },
  LOGISTICS: { key: 'LOGISTICS', label: 'Logistics / Dispatch', icon: 'Truck', color: '#D97706', bg: 'rgba(217,119,6,0.08)' },
  INVOICE: { key: 'INVOICE', label: 'Purchase Invoice', icon: 'Receipt', color: '#DC2626', bg: 'rgba(220,38,38,0.08)' },
  NFA: { key: 'NFA', label: 'NFA / Approval Notes', icon: 'BadgeCheck', color: '#4F46E5', bg: 'rgba(79,70,229,0.08)' },
  VENDOR: { key: 'VENDOR', label: 'Vendor Management', icon: 'Building2', color: '#6366F1', bg: 'rgba(99,102,241,0.08)' },
  REPORTS: { key: 'REPORTS', label: 'Reports', icon: 'BarChart3', color: '#8B5CF6', bg: 'rgba(139,92,246,0.08)' },
  OTHER: { key: 'OTHER', label: 'Other Documents', icon: 'FileText', color: '#64748B', bg: 'rgba(100,116,139,0.08)' }
};

/* ─── Vendor document → repository document mapping ───
 *
 * Vendor documents live in a separate localStorage collection
 * (vendorDocumentsStore).  To surface them in the central Document
 * Repository we project each vendor document into the repository's
 * canonical schema on every read.  The mapping is a pure function —
 * no writes to the vendor store happen here. */
function mapVendorDocToRepository(vd) {
  return {
    docId: `vdoc-${vd.id}`,
    docNo: vd.docNo || vd.id,
    name: vd.name,
    stage: 'Vendor Management',
    folder: DOCUMENT_FOLDER.VENDOR.key,
    source: DOCUMENT_TYPE.UPLOADED,
    sourceType: vd.type || detectType(vd.name, ''),
    sourceId: vd.vendorId || vd.id,
    sourceUrl: vd.dataUrl || '',
    vendor: vd.vendorName || '',
    vendorId: vd.vendorId || '',
    fileType: (vd.type || detectType(vd.name, '') || '').toLowerCase(),
    fileSize: vd.size || 0,
    fileSizeLabel: formatSize(vd.size || 0),
    uploadedBy: vd.uploadedBy || '',
    uploadedAt: vd.uploadedAt || vd.createdAt || '',
    updatedAt: vd.updatedAt || vd.updatedAt || '',
    status: vd.status || 'Pending',
    version: 1,
    recordState: (vd.recordState === VENDOR_DOCUMENT_RECORD_STATE.ARCHIVED)
      ? 'archived'
      : (vd.recordState === VENDOR_DOCUMENT_RECORD_STATE.DELETED)
        ? 'deleted'
        : 'active',
    category: vd.category || '',
    notes: vd.notes || '',
    _source: 'vendor'
  };
}

/** Return vendor documents projected into the repository schema. */
function getVendorDocuments() {
  try {
    return (vendorDocumentsStore.all || []).map(mapVendorDocToRepository);
  } catch {
    return [];
  }
}

export const DOCUMENT_FOLDERS = Object.values(DOCUMENT_FOLDER);

/* ─── Seed (empty — documents are only ever added by explicit
        upload / registration actions, never by scanning) ─── */
function seedDocuments() { return []; }

export const documentsStore = createCollection(storageKeys.documents, seedDocuments);

/* ------------------------------------------------------------------
 * One-time repair for stores polluted by the old scan-based refresh.
 *
 * Earlier versions of this service auto-created a placeholder record
 * for EVERY workflow record that merely existed (e.g. a "Negotiation
 * Summary — RFQ-2026-0001" or "Payment Advice — ADV-2026-4201" entry)
 * whenever the Documents page was refreshed or first read. Those
 * placeholder rows never correspond to a real file — they were
 * fabricated with `generationStatus: 'Pending'` and no sourceUrl, so
 * they inflated counts with documents that do not exist.
 *
 * This runs exactly once (flag-gated) and removes only such rows.
 * Uploads, registered/generated documents and any pending row the user
 * actually generated (they carry a sourceUrl) are never touched.
 * ------------------------------------------------------------------ */
const PLACEHOLDER_HEAL_VERSION = '1';
const PLACEHOLDER_HEAL_KEY = 'purchase-documents-placeholder-heal-v';

function healScanPlaceholders() {
  try {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    const flagKey = `${PLACEHOLDER_HEAL_KEY}${PLACEHOLDER_HEAL_VERSION}`;
    if (localStorage.getItem(flagKey) === PLACEHOLDER_HEAL_VERSION) return;
    const raw = localStorage.getItem(storageKeys.documents);
    if (raw) {
      let stored = null;
      try { stored = JSON.parse(raw); } catch { stored = null; }
      if (Array.isArray(stored)) {
        const kept = stored.filter(
          (doc) => !(doc && doc.source === DOCUMENT_TYPE.GENERATED && doc.generationStatus === 'Pending' && !doc.sourceUrl)
        );
        if (kept.length !== stored.length) documentsStore.persist(kept);
      }
    }
    localStorage.setItem(flagKey, PLACEHOLDER_HEAL_VERSION);
  } catch {
    /* Storage unavailable or full — skip silently. */
  }
}

healScanPlaceholders();

/* ─── Public service ─── */

export const documentsService = {
  /** Reload the repository — LOAD only.
   *
   *  Idempotent by contract: this NEVER discovers, seeds, generates or
   *  appends documents. The persisted collection is the single source
   *  of truth; it changes only through explicit document actions
   *  (upload, registration at generation time, archive / delete /
   *  restore, generate). Refreshing ten times returns the same
   *  document IDs, names, count and metrics.
   */
  async refreshDocuments() {
    await delay(80);
    return clone(documentsStore.all);
  },

  /** Read the persisted store. Never populates/discovery-writes. */
  _ensureStore() {
    return documentsStore.all;
  },

  /** Get folder counts — one count per folder for the folder grid. */
  async getFolderCounts() {
    const docs = [...documentsStore.all, ...getVendorDocuments()];
    const active = docs.filter((d) => d.recordState === 'active');
    const counts = {};
    for (const f of DOCUMENT_FOLDERS) { counts[f.key] = 0; }
    for (const doc of active) {
      const folder = doc.folder || DOCUMENT_FOLDER.OTHER.key;
      counts[folder] = (counts[folder] || 0) + 1;
    }
    return DOCUMENT_FOLDERS.map((f) => ({ ...f, count: counts[f.key] || 0 }));
  },

  /** List documents with search, filters, pagination. */
  async getDocuments({
    search = '',
    folder = '',
    repositoryStage = 'All',
    stage = 'All',
    docType = 'All',
    vendor = 'All',
    source = 'All',
    docStatus = 'All',
    prNo = '',
    rfqNo = '',
    poNo = '',
    dateFrom = '',
    dateTo = '',
    page = 1,
    pageSize = 25,
    sortBy = 'uploadedAt',
    sortDir = 'desc'
  } = {}) {
    /* Merge repository documents with vendor documents projected into
       the same canonical schema.  Both sources are read-only here. */
    const docs = [...documentsStore.all, ...getVendorDocuments()];

    const query = String(search).trim().toLowerCase();

    /* Resolve repositoryStage filter to a set of stage values */
    const repoStages = repositoryStage !== 'All'
      ? (REPOSITORY_STAGES.find((s) => s.key === repositoryStage)?.stages || [])
      : [];

    let filtered = docs.filter((doc) => {
      if (doc.recordState !== 'active') return false;
      if (folder && doc.folder !== folder) return false;
      if (repoStages.length > 0 && !repoStages.includes(doc.stage)) return false;
      if (stage !== 'All' && doc.stage !== stage) return false;
      if (docType !== 'All' && doc.docType !== docType) return false;
      if (vendor !== 'All' && doc.vendor !== vendor) return false;
      if (source !== 'All' && doc.source !== source) return false;
      if (docStatus !== 'All' && (doc.status || 'Final') !== docStatus) return false;
      if (prNo && !(doc.prNo || '').toLowerCase().includes(prNo.toLowerCase())) return false;
      if (rfqNo && !(doc.rfqNo || '').toLowerCase().includes(rfqNo.toLowerCase())) return false;
      if (poNo && !(doc.poNo || '').toLowerCase().includes(poNo.toLowerCase())) return false;
      if (dateFrom && doc.uploadedAt && doc.uploadedAt.slice(0, 10) < dateFrom) return false;
      if (dateTo && doc.uploadedAt && doc.uploadedAt.slice(0, 10) > dateTo) return false;
      if (query) {
        const haystack = [
          doc.name, doc.docNo, doc.stage, doc.vendor,
          doc.prNo, doc.rfqNo, doc.poNo, doc.uploadedBy, doc.fileType,
          doc.version, doc.status
        ].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    /* Sort */
    filtered = [...filtered].sort((a, b) => {
      let aVal = a[sortBy] || '';
      let bVal = b[sortBy] || '';
      if (sortBy === 'fileSize') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
      if (sortBy === 'version') { aVal = Number(aVal) || 0; bVal = Number(bVal) || 0; }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return sortDir === 'asc'
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });

    const result = paginate(filtered, { page, pageSize });
    return result;
  },

  /** Get distinct values for filter dropdowns. */
  async getFilterOptions() {
    const docs = [...documentsStore.all, ...getVendorDocuments()];
    const active = docs.filter((d) => d.recordState === 'active');
    const stages = [...new Set(active.map((d) => d.stage))].filter(Boolean);
    const vendors = [...new Set(active.map((d) => d.vendor))].filter(Boolean);
    const sources = [...new Set(active.map((d) => d.source))].filter(Boolean);
    const docTypes = [...new Set(active.map((d) => d.docType))].filter(Boolean);
    const statuses = [...new Set(active.map((d) => d.status || 'Final'))].filter(Boolean);
    return { stages, vendors, sources, docTypes, statuses, total: active.length };
  },

  /** Get aggregate stats for KPI cards. */
  async getStats() {
    const docs = [...documentsStore.all, ...getVendorDocuments()];
    const active = docs.filter((d) => d.recordState === 'active');
    const uploaded = active.filter((d) => d.source === DOCUMENT_TYPE.UPLOADED || d.source === DOCUMENT_TYPE.ATTACHMENT);
    const generated = active.filter((d) => d.source === DOCUMENT_TYPE.GENERATED);
    const pendingGeneration = generated.filter((d) => d.generationStatus === 'Pending');
    const archived = docs.filter((d) => d.recordState === 'archived');
    return {
      total: active.length,
      uploaded: uploaded.length,
      generated: generated.length,
      pendingGeneration: pendingGeneration.length,
      archived: archived.length,
      stages: [...new Set(active.map((d) => d.stage))].length
    };
  },

  /** Delete (soft) a document. */
  async deleteDocument(docId) {
    await delay();
    const docs = documentsStore.all;
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) throw new Error('Document not found');
    docs[idx] = { ...docs[idx], recordState: 'deleted' };
    documentsStore.persist(docs);
    return { success: true };
  },

  /** Bulk delete (soft) multiple documents. */
  async bulkDeleteDocuments(docIds) {
    await delay();
    const docs = documentsStore.all;
    let count = 0;
    for (const docId of docIds) {
      const idx = docs.findIndex((d) => d.docId === docId);
      if (idx !== -1) {
        docs[idx] = { ...docs[idx], recordState: 'deleted' };
        count++;
      }
    }
    documentsStore.persist(docs);
    return { success: true, deleted: count };
  },

  /** Archive a document (soft archive — hidden from default view). */
  async archiveDocument(docId) {
    await delay();
    const docs = documentsStore.all;
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) throw new Error('Document not found');
    docs[idx] = { ...docs[idx], recordState: 'archived' };
    documentsStore.persist(docs);
    return { success: true };
  },

  /** Get a single document by docId. */
  async getDocument(docId) {
    await delay(40);
    const doc = documentsStore.all.find((d) => d.docId === docId);
    if (!doc) throw new Error('Document not found');
    return clone(doc);
  },

  /** Rename a document (display name only — does not change IDs/numbers). */
  async renameDocument(docId, newName) {
    await delay();
    const docs = documentsStore.all;
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) throw new Error('Document not found');
    docs[idx] = { ...docs[idx], name: newName, updatedAt: new Date().toISOString() };
    documentsStore.persist(docs);
    return clone(docs[idx]);
  },

  /** Move a document to a different folder. */
  async moveDocument(docId, targetFolder) {
    await delay();
    const docs = documentsStore.all;
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) throw new Error('Document not found');
    docs[idx] = { ...docs[idx], folder: targetFolder };
    documentsStore.persist(docs);
    return clone(docs[idx]);
  },

  /**
   * Upload a new document into a folder.
   *
   * Supports rich metadata:
   *   folder, docType, reference, category, description,
   *   sourceModule, sourceReference, vendor, tags, confidential,
   *   docName (override display name)
   */
  async uploadDocument(file, metadata = {}) {
    await delay(200);
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

    /* Resolve stage from sourceModule or folder */
    let stage = DOCUMENT_STAGE.OTHER;
    if (metadata.sourceModule) {
      const moduleStageMap = {
        'Purchase Requisition': DOCUMENT_STAGE.PR,
        'RFQ': DOCUMENT_STAGE.RFQ,
        'Quotation': DOCUMENT_STAGE.QUOTATION,
        'Purchase Order': DOCUMENT_STAGE.PO,
        'GRN': DOCUMENT_STAGE.GRN,
        'Invoice': DOCUMENT_STAGE.INVOICE,
        'NFA': DOCUMENT_STAGE.NFA,
        'Vendor': DOCUMENT_STAGE.OTHER
      };
      stage = moduleStageMap[metadata.sourceModule] || DOCUMENT_STAGE.OTHER;
    }

    const actor = getCurrentActor();
    const doc = {
      docId: `DOC-UPLOAD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: metadata.docName || file.name || 'Untitled Upload',
      docType: metadata.docType || DOCUMENT_TYPE.UPLOADED,
      docNo: metadata.sourceReference || metadata.reference || '',
      stage,
      prNo: (stage === DOCUMENT_STAGE.PR) ? (metadata.sourceReference || '') : '',
      rfqNo: (stage === DOCUMENT_STAGE.RFQ) ? (metadata.sourceReference || '') : '',
      poNo: (stage === DOCUMENT_STAGE.PO) ? (metadata.sourceReference || '') : '',
      vendor: metadata.vendor || '',
      uploadedBy: actor?.name || 'Current User',
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileType: fileTypeLabel(file.name, detectType(file.name, file.type)),
      fileSize: file.size || 0,
      fileSizeLabel: formatSize(file.size || 0),
      source: DOCUMENT_TYPE.UPLOADED,
      sourceUrl: dataUrl,
      sourceType: ext,
      sourceId: metadata.sourceId || ('upload-' + Date.now()),
      sourceLabel: file.name || '',
      /* Extended metadata */
      category: metadata.category || '',
      description: metadata.description || '',
      sourceModule: metadata.sourceModule || '',
      sourceReference: metadata.sourceReference || '',
      tags: metadata.tags || [],
      confidential: metadata.confidential || false,
      version: 1,
      status: 'Final',
      folder: metadata.folder || DOCUMENT_FOLDER.OTHER.key,
      recordState: 'active'
    };
    const docs = documentsStore.all;
    docs.push(doc);
    documentsStore.persist(docs);
    return clone(doc);
  },

  /**
   * Generate a document file for a system-generated doc that is
   * currently in 'Pending Generation' state.
   *
   * Creates an actual PDF blob using jsPDF and persists it as a
   * data URL on the document record so Preview/Download/Print work.
   */
  async generateDocument(docId) {
    await delay(150);
    const docs = documentsStore.all;
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) throw new Error('Document not found');
    const doc = docs[idx];
    if (doc.generationStatus === 'Generated' && doc.sourceUrl) return clone(doc);

    /* Dynamically import jsPDF (code-split in production) */
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    /* ── Header ── */
    pdf.setFontSize(18);
    pdf.setFont('helvetica', 'bold');
    pdf.text(doc.name || 'Document', 105, 25, { align: 'center' });
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(120, 120, 120);
    if (doc.docNo) pdf.text(doc.docNo, 105, 32, { align: 'center' });

    /* Divider */
    pdf.setDrawColor(200, 200, 200);
    pdf.line(20, 36, 190, 36);

    /* ── Metadata ── */
    pdf.setTextColor(60, 60, 60);
    pdf.setFontSize(9);
    let y = 44;
    const meta = [
      ['Stage', doc.stage || '—'],
      ['Vendor', doc.vendor || '—'],
      ['PR No', doc.prNo || '—'],
      ['RFQ No', doc.rfqNo || '—'],
      ['PO No', doc.poNo || '—'],
      ['Source ID', doc.sourceId || '—'],
      ['Generated', new Date().toLocaleDateString('en-IN')],
    ];
    for (const [label, value] of meta) {
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${label}:`, 20, y);
      pdf.setFont('helvetica', 'normal');
      pdf.text(String(value), 60, y);
      y += 6;
    }

    /* ── Body ── */
    y += 6;
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(0, 0, 0);
    pdf.text('Document Content', 20, y);
    y += 8;
    pdf.setFontSize(9);
    pdf.setFont('helvetica', 'normal');
    pdf.setTextColor(80, 80, 80);
    const bodyText = `${doc.name} — ${doc.docNo || doc.sourceId || ''}\n\nThis is a system-generated document generated on ${new Date().toLocaleString('en-IN')}.\n\nSource: ${doc.stage} — ${doc.sourceLabel || doc.sourceId || ''}.`;
    const lines = pdf.splitTextToSize(bodyText, 170);
    pdf.text(lines, 20, y);

    /* ── Footer ── */
    pdf.setFontSize(7);
    pdf.setTextColor(160, 160, 160);
    pdf.text(`Generated by ERP System · ${doc.docId}`, 105, 287, { align: 'center' });

    /* Convert to data URL and persist */
    const dataUrl = pdf.output('datauristring');
    const byteLength = pdf.output('arraybuffer').byteLength;
    docs[idx] = {
      ...doc,
      sourceUrl: dataUrl,
      generationStatus: 'Generated',
      status: 'Generated',
      fileSize: byteLength,
      fileSizeLabel: formatSize(byteLength),
      updatedAt: new Date().toISOString()
    };
    documentsStore.persist(docs);
    return clone(docs[idx]);
  },

  /** Restore an archived document. */
  async restoreDocument(docId) {
    await delay();
    const docs = documentsStore.all;
    const idx = docs.findIndex((d) => d.docId === docId);
    if (idx === -1) throw new Error('Document not found');
    docs[idx] = { ...docs[idx], recordState: 'active' };
    documentsStore.persist(docs);
    return { success: true };
  }
};
