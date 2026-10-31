/**
 * purchase/services/vendorDocuments.js
 * ------------------------------------------------------------------
 * Vendor Documents register mock service.
 *
 * The central register of vendor documents (registrations,
 * certifications, tax records, bank details, agreements) under Vendor
 * Management. Every row is a document attached to a vendor: it carries
 * the vendor's name, the document category, the file (name / type /
 * size / dataUrl) and a verification status:
 *
 *   Pending → Verified   (verifyDocument)
 *   Verified / Pending → Expired   (markExpired)
 *
 * Each document also rides the standard record lifecycle (active /
 * archived / deleted — the Active | Archived | Deleted tabs), keeps a
 * full activity trail, and persists to localStorage via the lazy
 * collection — the same pattern as every other Purchase module
 * service. The seed derives its vendor links from the real vendor
 * store (never fabricated names), and every seeded file points at a
 * working mock URL so Preview / Download work on demo data.
 * ------------------------------------------------------------------
 */
import {
  VENDOR_DOCUMENT_CATEGORIES,
  VENDOR_DOCUMENT_RECORD_STATE,
  VENDOR_DOCUMENT_STATUS
} from '../constants';
import { safeGetTime } from '../utils/helpers';
import { clone, createCollection, delay, paginate, storageKeys } from './base';

import { getCurrentActor, withFallback } from './api-client';
import { vendorApi } from './api/vendorApi';
import { vendorsStore } from './vendor';

function nowIso() {
  return new Date().toISOString();
}

function entry(type, label, note = '') {
  const actor = getCurrentActor();
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label,
    actor: actor.name || 'System',
    timestamp: nowIso(),
    note
  };
}


/** Trailing numeric sequence of a current-year document number. */
function docSeq(record) {
  const value = String(record?.docNo || record?.id || '');
  const year = new Date().getFullYear();
  const match = new RegExp(`^VDOC-${year}-(\\d+)$`).exec(value);
  return match ? Number(match[1]) : 0;
}

/** Next document number (VDOC-YYYY-NNNN) — one above the highest
 *  existing current-year sequence, so it can never collide. */
function nextDocNo(records = []) {
  const year = new Date().getFullYear();
  const highest = records.reduce((max, record) => Math.max(max, docSeq(record)), 0);
  return `VDOC-${year}-${String(highest + 1).padStart(4, '0')}`;
}

/**
 * Seed register — derived from the real vendor store (never fabricated
 * names), with working mock file URLs so Preview / Download always
 * work on demo data. Statuses cover the register: mostly Verified with
 * a few Pending and one Expired so the KPIs and filters render real
 * data.
 */
/** Seed vendor documents — returns empty. */
function documentSeed() {
  return [];
}

/** Lazy, localStorage-backed vendor document collection. */
export const vendorDocumentsStore = createCollection(storageKeys.vendorDocuments, documentSeed);

function findDocument(id) {
  return vendorDocumentsStore.all.find((entry) => entry.id === id || entry.docNo === id) || null;
}

function persist() {
  vendorDocumentsStore.persist(vendorDocumentsStore.all);
}

function saveRecord(record) {
  persist();
  return clone(record);
}

export const vendorDocumentService = {
  /** List with search + status / category / vendor filters, scoped to a
   *  record state (the Active / Archived / Deleted tab), sortable,
   *  paginated. */
  async getDocuments({
    search = '',
    status = 'All',
    category = 'All',
    vendor = 'All',
    recordState = VENDOR_DOCUMENT_RECORD_STATE.ACTIVE,
    page = 1,
    pageSize = 10,
    sortKey = 'uploadedAt',
    sortDirection = 'desc'
  } = {}) {
    await delay();
    const query = String(search || '').toLowerCase().trim();
    let records = vendorDocumentsStore.all.filter(
      (doc) => (doc.recordState || VENDOR_DOCUMENT_RECORD_STATE.ACTIVE) === recordState
    );
    if (status && status !== 'All') records = records.filter((doc) => doc.status === status);
    if (category && category !== 'All') records = records.filter((doc) => doc.category === category);
    if (vendor && vendor !== 'All') {
      records = records.filter((doc) => doc.vendorId === vendor || doc.vendorName === vendor);
    }
    if (query) {
      records = records.filter((doc) =>
        [doc.docNo, doc.name, doc.vendorName, doc.category].some((value) =>
          String(value || '').toLowerCase().includes(query)
        )
      );
    }
    /* Column sorting — the list's column keys map onto the stored
       fields (uploadedDate is the uploadedAt timestamp; document is the
       file name; size is numeric). Same convention as the NFA service. */
    const STRING_SORT_KEYS = ['docNo', 'name', 'document', 'vendorName', 'category', 'status', 'uploadedBy'];
    const NUMERIC_SORT_KEYS = ['size'];
    const DATE_SORT_KEYS = ['uploadedAt', 'uploadedDate', 'createdAt'];
    const safeKey = [...STRING_SORT_KEYS, ...NUMERIC_SORT_KEYS, ...DATE_SORT_KEYS].includes(sortKey)
      ? sortKey
      : 'uploadedAt';
    const dir = sortDirection === 'asc' ? 1 : -1;
    records = [...records].sort((a, b) => {
      let aValue;
      let bValue;
      if (NUMERIC_SORT_KEYS.includes(safeKey)) {
        aValue = Number(a.size) || 0;
        bValue = Number(b.size) || 0;
      } else if (DATE_SORT_KEYS.includes(safeKey)) {
        aValue = safeGetTime(a.uploadedAt);
        bValue = safeGetTime(b.uploadedAt);
      } else {
        aValue = String(a[safeKey] || '');
        bValue = String(b[safeKey] || '');
      }
      if (aValue === bValue) return 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') return dir * (aValue - bValue);
      return dir * String(aValue).localeCompare(String(bValue));
    });
    return paginate(records, { page, pageSize });
  },

  /** KPI + tab counts (status counts over ACTIVE documents only). */
  async getDocumentStats() {
    await delay();
    const active = vendorDocumentsStore.all.filter(
      (doc) => (doc.recordState || VENDOR_DOCUMENT_RECORD_STATE.ACTIVE) === VENDOR_DOCUMENT_RECORD_STATE.ACTIVE
    );
    const byStatus = (status) => active.filter((doc) => doc.status === status).length;
    return {
      total: active.length,
      verified: byStatus(VENDOR_DOCUMENT_STATUS.VERIFIED),
      pending: byStatus(VENDOR_DOCUMENT_STATUS.PENDING),
      expired: byStatus(VENDOR_DOCUMENT_STATUS.EXPIRED),
      vendors: new Set(active.map((doc) => doc.vendorId).filter(Boolean)).size,
      active: active.length,
      archived: vendorDocumentsStore.all.filter((doc) => doc.recordState === VENDOR_DOCUMENT_RECORD_STATE.ARCHIVED).length,
      deleted: vendorDocumentsStore.all.filter((doc) => doc.recordState === VENDOR_DOCUMENT_RECORD_STATE.DELETED).length
    };
  },

  /** Single document by internal id or human-facing number (null when absent). */
  async getDocument(id) {
    await delay();
    const doc = findDocument(id);
    return doc ? clone(doc) : null;
  },

  /** Vendor options for the register (id + name of active vendors). */
  /**
   * Vendor options for the upload picker + the vendor filter. Reads the
   * real vendor master (the register runs against the API in production
   * mode, where the local store is empty and the picker used to render
   * with no vendors at all); the local collection stays the offline
   * fallback, mirroring every other Purchase service.
   */
  async getDocumentVendors() {
    const active = (vendor) => (vendor.recordState || 'active') === 'active';
    const pair = (vendor) => ({ id: vendor.id, name: vendor.name });
    return withFallback(
      async () => (await vendorApi.all()).filter(active).map(pair),
      async () => {
        await delay();
        return clone(vendorsStore.all.filter(active).map(pair));
      }
    );
  },

  /**
   * Uploads a document to the register → Pending verification. The
   * vendor (id + name), category, file metadata and content are taken
   * from the submitted payload — new uploads always start Pending.
   */
  async createDocument({
    vendorId = '',
    vendorName = '',
    category = VENDOR_DOCUMENT_CATEGORIES[VENDOR_DOCUMENT_CATEGORIES.length - 1],
    name = '',
    type = 'file',
    size = 0,
    dataUrl = '',
    notes = ''
  } = {}) {
    await delay();
    if (!vendorId && !vendorName) throw new Error('Select a vendor for the document');
    if (!name) throw new Error('Choose a file to upload');
    const actor = getCurrentActor();
    const docNo = nextDocNo(vendorDocumentsStore.all);
    const now = nowIso();
    const doc = {
      id: `VDOC-${String(vendorDocumentsStore.all.length + 1).padStart(4, '0')}`,
      docNo,
      vendorId: vendorId || '',
      vendorName: vendorName || '—',
      category: category || VENDOR_DOCUMENT_CATEGORIES[VENDOR_DOCUMENT_CATEGORIES.length - 1],
      name: String(name),
      type: String(type || 'file'),
      size: Number(size) || 0,
      dataUrl: String(dataUrl || ''),
      status: VENDOR_DOCUMENT_STATUS.PENDING,
      uploadedBy: actor.name || 'System',
      uploadedAt: now,
      notes: String(notes || ''),
      recordState: VENDOR_DOCUMENT_RECORD_STATE.ACTIVE,
      createdAt: now,
      updatedAt: now,
      activity: [entry('vdoc-create', `${docNo} uploaded for ${vendorName || 'vendor'}`, notes)]
    };
    vendorDocumentsStore.all.push(doc);
    persist();
    return clone(doc);
  },

  /** Verifies a Pending document → Verified (records who / when / remarks). */
  async verifyDocument(id, { remarks = '' } = {}) {
    await delay();
    const doc = findDocument(id);
    if (!doc) throw new Error('Document not found');
    if (doc.status !== VENDOR_DOCUMENT_STATUS.PENDING) {
      throw new Error('Only pending documents can be verified');
    }
    doc.status = VENDOR_DOCUMENT_STATUS.VERIFIED;
    doc.updatedAt = nowIso();
    doc.activity.push(entry('vdoc-verify', `${doc.docNo} verified`, remarks));
    return saveRecord(doc);
  },

  /** Marks a document as Expired (Verified or Pending → Expired). */
  async markExpired(id, { remarks = '' } = {}) {
    await delay();
    const doc = findDocument(id);
    if (!doc) throw new Error('Document not found');
    if (doc.status === VENDOR_DOCUMENT_STATUS.EXPIRED) {
      throw new Error('Document is already expired');
    }
    doc.status = VENDOR_DOCUMENT_STATUS.EXPIRED;
    doc.updatedAt = nowIso();
    doc.activity.push(entry('vdoc-expire', `${doc.docNo} marked expired`, remarks));
    return saveRecord(doc);
  },

  /** Moves a document to Archived (removed from the Active list, restorable). */
  async archiveDocument(id) {
    await delay();
    const doc = findDocument(id);
    if (!doc) throw new Error('Document not found');
    doc.recordState = VENDOR_DOCUMENT_RECORD_STATE.ARCHIVED;
    doc.activity.push(entry('vdoc-archive', `${doc.docNo} archived`));
    return saveRecord(doc);
  },

  /** Restores an archived / deleted document back to Active. */
  async restoreDocument(id) {
    await delay();
    const doc = findDocument(id);
    if (!doc) throw new Error('Document not found');
    doc.recordState = VENDOR_DOCUMENT_RECORD_STATE.ACTIVE;
    doc.activity.push(entry('vdoc-restore', `${doc.docNo} restored to active`));
    return saveRecord(doc);
  },

  /** Soft-deletes a document (moved to the Deleted tab, restorable). */
  async deleteDocument(id) {
    await delay();
    const doc = findDocument(id);
    if (!doc) throw new Error('Document not found');
    doc.recordState = VENDOR_DOCUMENT_RECORD_STATE.DELETED;
    doc.activity.push(entry('vdoc-delete', `${doc.docNo} moved to deleted`));
    return saveRecord(doc);
  },

  /** Bulk archive (active list). */
  async bulkArchive(ids) {
    await delay();
    const set = new Set(ids);
    vendorDocumentsStore.all.forEach((doc) => {
      if (set.has(doc.id)) doc.recordState = VENDOR_DOCUMENT_RECORD_STATE.ARCHIVED;
    });
    persist();
    return clone(vendorDocumentsStore.all.filter((doc) => set.has(doc.id)));
  },

  /** Bulk restore (archived / deleted lists). */
  async bulkRestore(ids) {
    await delay();
    const set = new Set(ids);
    vendorDocumentsStore.all.forEach((doc) => {
      if (set.has(doc.id)) doc.recordState = VENDOR_DOCUMENT_RECORD_STATE.ACTIVE;
    });
    persist();
    return clone(vendorDocumentsStore.all.filter((doc) => set.has(doc.id)));
  },

  /** Bulk soft-delete. */
  async bulkDelete(ids) {
    await delay();
    const set = new Set(ids);
    vendorDocumentsStore.all.forEach((doc) => {
      if (set.has(doc.id)) doc.recordState = VENDOR_DOCUMENT_RECORD_STATE.DELETED;
    });
    persist();
    return clone(vendorDocumentsStore.all.filter((doc) => set.has(doc.id)));
  }
};

export default vendorDocumentService;
