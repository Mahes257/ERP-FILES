/**
 * purchase/services/vendor.js
 * ------------------------------------------------------------------
 * Mock vendor management service: vendor directory, registration,
 * approval workflow, performance metrics. Data persists to
 * localStorage via the lazy collection.
 * ------------------------------------------------------------------
 */
import { VENDOR_RECORD_STATE, VENDOR_STATUS } from '../constants';
import { vendorApi } from './api/vendorApi';
import { getCurrentActor, withFallback } from './api-client';
import { clone, createCollection, delay, paginate, storageKeys, todayLocal } from './base';
import { safeGetTime } from '../utils/helpers';
import { getDefaultCurrency } from './settings';
import { vendorDocumentsStore } from './vendorDocuments';
/* Supplier Master helpers — ensureSupplierBlocks is pure; the metrics
   facade is only touched inside the read methods below (call-time), so
   the rfq → vendor → supplierPerformance cycle stays safe. */
import { ensureSupplierBlocks, resolveVendor } from '../utils/supplierIdentity';
import { getSupplierTransactions as fetchSupplierTransactions, supplierPerformanceBoard, withEffectiveMetrics } from './supplierPerformance';
export { VENDOR_STATUS };

/**
 * Read-side view of a master record: supplier blocks normalised from
 * the persisted (flat + additional) fields, with transaction-derived
 * performance aggregates when real documents exist.
 */
function supplierMasterView(record) {
  return ensureSupplierBlocks(withEffectiveMetrics(record));
}

/** Seed vendors — returns empty. Real data from the API. */
function vendorSeed() {
  return [];
}

/** Lazy, localStorage-backed vendor collection. */
export const vendorsStore = createCollection(storageKeys.vendors, vendorSeed);

function toFilter(value) {
  return value === undefined || value === null || value === '' || value === 'All' ? null : value;
}

/** True when a vendor record is in the active (non-archived) set. */
function isActiveVendor(vendor) {
  return (vendor.recordState || VENDOR_RECORD_STATE.ACTIVE) === VENDOR_RECORD_STATE.ACTIVE;
}

/**
 * The single RFQ-eligibility rule shared by the RFQ form selector and
 * the send-RFQ workflow guard: a vendor may be invited to an RFQ only
 * when the master record is Approved AND its record lifecycle
 * state is active (archived vendors are never selectable). Pending /
 * Rejected / Blocked / Archived vendors are all excluded.
 *
 * Lifecycle: Pending Approval → Approved → RFQ-eligible.
 */
export function isVendorRfqEligible(vendor) {
  return Boolean(
    vendor &&
      vendor.status === VENDOR_STATUS.APPROVED &&
      (vendor.recordState || VENDOR_RECORD_STATE.ACTIVE) === VENDOR_RECORD_STATE.ACTIVE
  );
}

export const mockVendorService = {
  /** Names-only list for selects and filters — APPROVED vendors only. */
  async getVendorNames() {
    await delay();
    return vendorsStore.all
      .filter((vendor) => isActiveVendor(vendor) && vendor.status === VENDOR_STATUS.APPROVED)
      .map((vendor) => vendor.name);
  },

  /** Approved vendors only — the exact pool an RFQ may invite. */
  async getRfqEligibleVendors() {
    await delay();
    return clone(vendorsStore.all.filter(isVendorRfqEligible));
  },

  async getAllVendors() {
    await delay();
    return vendorsStore.all.filter(isActiveVendor).map(supplierMasterView);
  },

  async getVendors({
    search = '',
    status = 'All',
    category = 'All',
    state = 'All',
    page = 1,
    pageSize = 10,
    sortBy = 'spend',
    sortDir = 'desc'
  } = {}) {
    await delay();
    const records = vendorsStore.all;
    const query = String(search).trim().toLowerCase();
    /* "Archived" / "Deleted" are record-lifecycle views (like the
       master's Archived / Deleted tabs), not statuses — archived and
       deleted vendors are hidden everywhere except when their view is
       active. */
    const archivedView = status === 'Archived';
    const deletedView = status === 'Deleted';
    const lifecycleView = archivedView || deletedView;
    const statusFilter = lifecycleView ? null : toFilter(status);
    const categoryFilter = toFilter(category);
    const stateFilter = toFilter(state);

    let filtered = records.filter((vendor) => {
      const state = vendor.recordState || VENDOR_RECORD_STATE.ACTIVE;
      if (archivedView && state !== VENDOR_RECORD_STATE.ARCHIVED) return false;
      if (deletedView && state !== VENDOR_RECORD_STATE.DELETED) return false;
      if (!lifecycleView && state !== VENDOR_RECORD_STATE.ACTIVE) return false;
      if (statusFilter && vendor.status !== statusFilter) return false;
      if (categoryFilter && vendor.category !== categoryFilter) return false;
      if (stateFilter && vendor.state !== stateFilter) return false;
      if (query) {
        const haystack = [vendor.name, vendor.category, vendor.city, vendor.state, vendor.email, vendor.gstin, vendor.id]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    /* Effective master views — supplier blocks normalised and numeric
       aggregates (spend / orders / rating / delivery) transaction-
       derived when the supplier has real documents. Sorting runs on
       the effective values so a supplier with PO history ranks by its
       real spend, not by a legacy stored counter. */
    const numericKeys = ['spend', 'orders', 'rating', 'onTimeDelivery'];
    const views = filtered.map(supplierMasterView);
    const sorted = [...views].sort((a, b) => {
      let aValue = a[sortBy];
      let bValue = b[sortBy];
      if (numericKeys.includes(sortBy)) {
        aValue = Number(aValue) || 0;
        bValue = Number(bValue) || 0;
      } else {
        aValue = String(aValue ?? '').toLowerCase();
        bValue = String(bValue ?? '').toLowerCase();
      }
      if (aValue === bValue) return 0;
      const cmp = aValue > bValue ? 1 : -1;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return paginate(sorted, { page, pageSize });
  },

  /**
   * Resolves the supplier master by id OR name reference (loose-name
   * matching mirrors the RFQ module) — used by document pages to open
   * the master for any vendor that appears on a transaction.
   */
  async getSupplierMasterByReference(reference = {}) {
    await delay();
    const found = resolveVendor(vendorsStore.all.filter(isActiveVendor), reference);
    return found ? supplierMasterView(found) : null;
  },

  async getVendor(id) {
    await delay();
    const vendor = vendorsStore.all.find((entry) => entry.id === id);
    if (!vendor) throw new Error('Vendor not found');
    return supplierMasterView(vendor);
  },

  async createVendor(payload = {}) {
    await delay();
    const records = vendorsStore.all;
    /* Compute next vendor number from existing IDs (not array length) to
       avoid collisions after soft-deletes. */
    let maxNum = 0;
    for (const r of records) {
      const match = String(r.id || '').match(/V-(\d+)/);
      if (match) maxNum = Math.max(maxNum, Number(match[1]));
    }
    const nextNum = maxNum + 1;
    const vendorId = payload.id || `V-${String(nextNum).padStart(3, '0')}`;
    /* Prevent duplicate vendor codes. */
    if (records.some((entry) => entry.id === vendorId)) {
      throw new Error(`Vendor code ${vendorId} already exists`);
    }
    const now = new Date().toISOString();
    const credit = payload.creditLimit && typeof payload.creditLimit === 'object'
      ? payload.creditLimit
      : {};
    const normalized = {
      id: vendorId,
      name: payload.name || `Vendor ${nextNum}`,
      registrationDate: payload.registrationDate || todayLocal(),
      category: payload.category || 'General',
      city: payload.city || '',
      state: payload.state || '',
      email: payload.email || '',
      phone: payload.phone || '',
      website: payload.website || '',
      gstin: payload.gstin || '',
      address: payload.address || '',
      notes: payload.notes || '',
      latitude: payload.latitude ?? null,
      longitude: payload.longitude ?? null,
      formattedAddress: payload.formattedAddress || '',
      googleMapsUrl: payload.googleMapsUrl || '',
      status: payload.status || VENDOR_STATUS.PENDING,
      rating: 0,
      paymentTerms: payload.paymentTerms || '30 Days',
      currency: payload.currency || getDefaultCurrency(),
      leadTimeDays: payload.leadTimeDays ? Number(payload.leadTimeDays) : 15,
      onTimeDelivery: 0,
      orders: 0,
      spend: 0,
      attachments: Array.isArray(payload.attachments) ? payload.attachments : [],
      /* ── Supplier Master extension ──
         Legal + tax identity, operational status, categories, credit
         limit and repeatable blocks. Additional addresses / contacts
         live in their own arrays (the registered office + primary
         contact stay on the flat fields); the read path rebuilds the
         full view via ensureSupplierBlocks. */
      active: payload.active !== false,
      legalName: payload.legalName || '',
      legalType: payload.legalType || '',
      cin: payload.cin || '',
      incorporationDate: payload.incorporationDate || payload.registrationDate || '',
      msmeRegNo: payload.msmeRegNo || '',
      msmeType: payload.msmeType || '',
      tan: payload.tan || '',
      categories: Array.isArray(payload.categories) ? payload.categories.filter(Boolean) : [],
      addresses: Array.isArray(payload.addresses) ? payload.addresses : [],
      contacts: Array.isArray(payload.contacts) ? payload.contacts : [],
      bankDetails: Array.isArray(payload.bankDetails) ? payload.bankDetails : [],
      contracts: Array.isArray(payload.contracts) ? payload.contracts : [],
      creditLimit: {
        amount: Number(credit.amount) || 0,
        currency: credit.currency || payload.currency || getDefaultCurrency(),
        days: Number(credit.days) || 0
      },
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      comments: [],
      createdAt: now,
      activity: [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: now }]
    };
    records.push(normalized);
    vendorsStore.persist(records);
    return supplierMasterView(normalized);
  },

  async updateVendor(id, patch = {}) {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    const credit = patch.creditLimit && typeof patch.creditLimit === 'object'
      ? patch.creditLimit
      : (existing.creditLimit || {});
    const merged = {
      ...existing,
      ...patch,
      id: existing.id,
      /* Keep the master's active flag aligned with record lifecycle
         state (an archived supplier is never active). */
      active: patch.active !== undefined ? patch.active !== false : existing.active !== false,
      categories: Array.isArray(patch.categories) ? patch.categories.filter(Boolean) : existing.categories || [],
      addresses: Array.isArray(patch.addresses) ? patch.addresses : existing.addresses || [],
      contacts: Array.isArray(patch.contacts) ? patch.contacts : existing.contacts || [],
      bankDetails: Array.isArray(patch.bankDetails) ? patch.bankDetails : existing.bankDetails || [],
      contracts: Array.isArray(patch.contracts) ? patch.contracts : existing.contracts || [],
      creditLimit: {
        amount: Number(credit.amount) || 0,
        currency: credit.currency || patch.currency || existing.currency || getDefaultCurrency(),
        days: Number(credit.days) || 0
      },
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'edit', label: 'Vendor details updated', actor: actor.name, timestamp: now }
      ]
    };
    records[index] = merged;
    vendorsStore.persist(records);
    return supplierMasterView(merged);
  },

  /** Soft-deletes a vendor (moves it to the Deleted tab, restorable). */
  async deleteVendor(id) {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      recordState: VENDOR_RECORD_STATE.DELETED,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'delete', label: 'Vendor moved to deleted', actor: actor.name, timestamp: now }
      ]
    };
    vendorsStore.persist(records);
    /* Cascade: soft-delete documents linked to this vendor */
    try {
      const docs = vendorDocumentsStore.all;
      let changed = false;
      for (let i = docs.length - 1; i >= 0; i--) {
        if (docs[i].vendorId === id && docs[i].recordState !== VENDOR_RECORD_STATE.DELETED) {
          docs[i] = { ...docs[i], recordState: VENDOR_RECORD_STATE.DELETED };
          changed = true;
        }
      }
      if (changed) vendorDocumentsStore.persist(docs);
    } catch { /* vendorDocumentsStore may not be initialized yet */ }
    return { id };
  },

  async setVendorStatus(id, status, note = '') {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    /* Valid transitions — blocks invalid state changes. Same-status
       transitions are allowed (no-ops). */
    const VALID_TRANSITIONS = {
      [VENDOR_STATUS.PENDING]: [VENDOR_STATUS.PENDING, VENDOR_STATUS.APPROVED, VENDOR_STATUS.REJECTED, VENDOR_STATUS.BLOCKED],
      [VENDOR_STATUS.APPROVED]: [VENDOR_STATUS.APPROVED, VENDOR_STATUS.BLOCKED],
      [VENDOR_STATUS.REJECTED]: [VENDOR_STATUS.REJECTED, VENDOR_STATUS.PENDING],
      [VENDOR_STATUS.BLOCKED]: [VENDOR_STATUS.BLOCKED, VENDOR_STATUS.APPROVED],
    };
    const allowed = VALID_TRANSITIONS[existing.status];
    if (allowed && !allowed.includes(status)) {
      throw new Error(`Cannot change vendor from ${existing.status} to ${status}`);
    }
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    const semantic = {
      [VENDOR_STATUS.APPROVED]: { type: 'approve', label: 'Vendor approved' },
      [VENDOR_STATUS.REJECTED]: { type: 'reject', label: 'Vendor rejected' },
      [VENDOR_STATUS.BLOCKED]: { type: 'block', label: 'Vendor blocked' }
    }[status] || { type: 'status', label: `Status changed to ${status}` };
    records[index] = {
      ...existing,
      status,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        {
          ...semantic,
          actor: actor.name,
          timestamp: now,
          oldValue: existing.status || '',
          newValue: status,
          ...(note ? { note: String(note) } : {})
        }
      ]
    };
    vendorsStore.persist(records);
    return clone(records[index]);
  },

  /** Moves a vendor to the archived set (hidden from the active list). */
  async archiveVendor(id) {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      recordState: VENDOR_RECORD_STATE.ARCHIVED,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'archive', label: 'Vendor archived', actor: actor.name, timestamp: now }
      ]
    };
    vendorsStore.persist(records);
    return { id };
  },

  /** Restores an archived vendor back to the active list. */
  async restoreVendor(id) {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'restore', label: 'Vendor restored to active', actor: actor.name, timestamp: now }
      ]
    };
    vendorsStore.persist(records);
    return { id };
  },

  /** Bulk archive (active list). */
  async bulkArchive(ids) {
    await delay();
    const set = new Set(ids);
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    vendorsStore.all.forEach((vendor) => {
      if (set.has(vendor.id)) {
        vendor.recordState = VENDOR_RECORD_STATE.ARCHIVED;
        vendor.activity = [
          ...(Array.isArray(vendor.activity) ? vendor.activity : []),
          { type: 'archive', label: 'Vendor archived', actor: actor.name, timestamp: now }
        ];
      }
    });
    vendorsStore.persist(vendorsStore.all);
    return clone(vendorsStore.all.filter((vendor) => set.has(vendor.id)));
  },

  /** Bulk restore (archived / deleted lists). */
  async bulkRestore(ids) {
    await delay();
    const set = new Set(ids);
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    vendorsStore.all.forEach((vendor) => {
      if (set.has(vendor.id)) {
        vendor.recordState = VENDOR_RECORD_STATE.ACTIVE;
        vendor.activity = [
          ...(Array.isArray(vendor.activity) ? vendor.activity : []),
          { type: 'restore', label: 'Vendor restored to active', actor: actor.name, timestamp: now }
        ];
      }
    });
    vendorsStore.persist(vendorsStore.all);
    return clone(vendorsStore.all.filter((vendor) => set.has(vendor.id)));
  },

  /** Bulk soft-delete. */
  async bulkDelete(ids) {
    await delay();
    const set = new Set(ids);
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    vendorsStore.all.forEach((vendor) => {
      if (set.has(vendor.id)) {
        vendor.recordState = VENDOR_RECORD_STATE.DELETED;
        vendor.activity = [
          ...(Array.isArray(vendor.activity) ? vendor.activity : []),
          { type: 'delete', label: 'Vendor moved to deleted', actor: actor.name, timestamp: now }
        ];
      }
    });
    vendorsStore.persist(vendorsStore.all);
    return clone(vendorsStore.all.filter((vendor) => set.has(vendor.id)));
  },

  /** Creates a new Pending copy of an existing vendor (mirrors duplicateRequisition). */
  async duplicateVendor(id) {
    await delay();
    const records = vendorsStore.all;
    const source = records.find((entry) => entry.id === id);
    if (!source) throw new Error('Vendor not found');
    const nextNum = records.reduce((max, vendor) => {
      const match = /^V-(\d+)$/.exec(vendor.id || '');
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const vendorId = `V-${String(nextNum).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const normalized = {
      ...source,
      id: vendorId,
      name: source.name ? `${source.name} (Copy)` : 'Copied vendor',
      status: VENDOR_STATUS.PENDING,
      recordState: VENDOR_RECORD_STATE.ACTIVE,
      rating: 0,
      orders: 0,
      spend: 0,
      onTimeDelivery: 0,
      createdAt: now,
      activity: [{ type: 'create', label: 'Vendor registered (duplicate)', actor: 'System', timestamp: now }]
    };
    records.push(normalized);
    vendorsStore.persist(records);
    return clone(normalized);
  },

  /**
   * Builds the audit log for a vendor (mirrors the requisition activity
   * API shape: date / user / action / old→new / ip / device / remarks).
   */
  async getVendorActivity(id) {
    await delay();
    const record = vendorsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Vendor not found');

    const mockIps = ['10.20.4.15', '10.20.4.23', '10.20.5.7', '172.16.8.12', '10.20.4.31'];
    const mockDevices = ['Chrome 126 · Windows 11', 'Chrome 126 · macOS 14', 'Edge 126 · Windows 11', 'Firefox 127 · Windows 11'];
    const activity =
      Array.isArray(record.activity) && record.activity.length > 0
        ? record.activity
        : [{ type: 'create', label: 'Vendor registered', actor: 'System', timestamp: record.createdAt }];

    const entries = activity.map((entry, index) => ({
      id: entry.id || `${record.id}-act-${index + 1}`,
      date: entry.timestamp,
      user: entry.actor || 'System',
      action: entry.label || entry.type,
      oldValue: entry.oldValue || '',
      newValue: entry.newValue || '',
      ip: mockIps[index % mockIps.length],
      device: mockDevices[index % mockDevices.length],
      remarks: entry.note || ''
    }));

    return { id, name: record.name, entries };
  },

  /**
   * Appends a comment to a vendor and records a `comment` activity entry.
   * Returns the updated record.
   */
  async addVendorComment(id, text = '') {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const comment = { id: `cmt-${Date.now()}`, author: 'Current User', text: String(text), createdAt: now };
    records[index] = {
      ...existing,
      comments: [...(Array.isArray(existing.comments) ? existing.comments : []), comment],
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'comment', label: 'Comment added', actor: 'Current User', timestamp: now, note: String(text) }
      ]
    };
    vendorsStore.persist(records);
    return clone(records[index]);
  },

  /**
   * Builds the vertical timeline for a vendor from its activity stream
   * plus any comments / attachments. `status` on each event is the
   * vendor status after that event (best-effort, mock).
   */
  async getVendorTimeline(id) {
    await delay();
    const record = vendorsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Vendor not found');

    const statusAfter = {
      create: VENDOR_STATUS.PENDING,
      approve: VENDOR_STATUS.APPROVED,
      block: VENDOR_STATUS.BLOCKED,
      archive: record.status,
      restore: record.status
    };
    const events = (record.activity || []).map((entry, index) => ({
      id: entry.id || `${record.id}-evt-${index + 1}`,
      type: entry.type,
      label: entry.label,
      actor: entry.actor || 'System',
      timestamp: entry.timestamp,
      note: entry.note || entry.newValue || '',
      status: statusAfter[entry.type] || record.status
    }));

    (record.comments || []).forEach((comment, index) => {
      events.push({
        id: comment.id || `${record.id}-cmt-${index + 1}`,
        type: 'comment',
        label: 'Comment added',
        actor: comment.author || 'Current User',
        timestamp: comment.createdAt,
        note: comment.text,
        status: record.status
      });
    });

    (record.attachments || []).forEach((attachment, index) => {
      events.push({
        id: `att-${index + 1}`,
        type: 'attachment',
        label: 'Attachment uploaded',
        actor: 'Current User',
        timestamp: record.createdAt,
        note: attachment.name || 'File',
        status: record.status
      });
    });

    return {
      id,
      name: record.name,
      events: events.sort((a, b) => safeGetTime(a.timestamp) - safeGetTime(b.timestamp))
    };
  },

  /**
   * Returns a ready-to-render print document: vendor record plus company
   * profile and signature placeholders.
   */
  async getVendorPrint(id) {
    await delay();
    const record = vendorsStore.all.find((entry) => entry.id === id);
    if (!record) throw new Error('Vendor not found');
    const actor = getCurrentActor();
    return {
      record: clone(record),
      company: {
        name: 'ABC Manufacturing Pvt Ltd',
        address: 'Plot 42, MIDC Industrial Area, Pune, Maharashtra 411026',
        gstin: '27AAACA1234A1Z5',
        phone: '+91 20 4890 1200',
        email: 'procurement@abcmfg.example'
      },
      preparedBy: actor.name || '—',
      checkedBy: 'Kavita Rao',
      approvedBy: record.status === VENDOR_STATUS.APPROVED ? actor.name : '—',
      generatedAt: new Date().toISOString()
    };
  },

  /**
   * Records a `print` activity entry after the vendor profile PDF has
   * been exported from the print preview page.
   */
  async logVendorPrint(id) {
    await delay();
    const records = vendorsStore.all;
    const index = records.findIndex((entry) => entry.id === id);
    if (index === -1) throw new Error('Vendor not found');
    const existing = records[index];
    const now = new Date().toISOString();
    const actor = getCurrentActor();
    records[index] = {
      ...existing,
      activity: [
        ...(Array.isArray(existing.activity) ? existing.activity : []),
        { type: 'print', label: 'Vendor profile exported as PDF', actor: actor.name, timestamp: now }
      ]
    };
    vendorsStore.persist(records);
    return { id };
  },

  async getVendorStats() {
    await delay();
    const records = vendorsStore.all;
    const activeRecords = records.filter(isActiveVendor).map(supplierMasterView);
    const byStatus = activeRecords.reduce((acc, vendor) => {
      acc[vendor.status] = (acc[vendor.status] || 0) + 1;
      return acc;
    }, {});
    /* Total = sum of every visible tab count (Pending + Approved
       + Blocked + Archived + Deleted). Rejected vendors are excluded
       from the total because no Rejected tab exists — matching the
       visible tab structure so the total is always explainable from
       the sum of its parts. */
    return {
      total:
        (byStatus[VENDOR_STATUS.PENDING] || 0) +
        (byStatus[VENDOR_STATUS.APPROVED] || 0) +
        (byStatus[VENDOR_STATUS.BLOCKED] || 0) +
        records.filter((vendor) => vendor.recordState === VENDOR_RECORD_STATE.ARCHIVED).length +
        records.filter((vendor) => vendor.recordState === VENDOR_RECORD_STATE.DELETED).length,
      pending: byStatus[VENDOR_STATUS.PENDING] || 0,
      approved: byStatus[VENDOR_STATUS.APPROVED] || 0,
      rejected: byStatus[VENDOR_STATUS.REJECTED] || 0,
      blocked: byStatus[VENDOR_STATUS.BLOCKED] || 0,
      archived: records.filter((vendor) => vendor.recordState === VENDOR_RECORD_STATE.ARCHIVED).length,
      deleted: records.filter((vendor) => vendor.recordState === VENDOR_RECORD_STATE.DELETED).length,
      /* Spend uses each supplier's effective value (transaction-derived
         when real POs exist, stored aggregate otherwise). */
      totalSpend: activeRecords.reduce((sum, vendor) => sum + (Number(vendor.spend) || 0), 0),
      avgRating: activeRecords.length
        ? Math.round((activeRecords.reduce((sum, vendor) => sum + (Number(vendor.rating) || 0), 0) / activeRecords.length) * 10) / 10
        : 0
    };
  },

  /** Performance ranking across vendors (archived excluded) — every
   *  row carries transaction-derived performance when the supplier has
   *  real documents (see withEffectiveMetrics). */
  async getVendorPerformance() {
    await delay();
    return supplierPerformanceBoard(vendorsStore.all.filter(isActiveVendor));
  }
};

/**
 * API-first vendor service facade. Calls the real Spring Boot API;
 * falls back to the mock implementation only when the backend is
 * unreachable (network error). Public interface identical to the
 * mock's, so components are untouched.
 */
export const vendorService = {
  async getVendorNames() {
    return withFallback(() => vendorApi.names(), () => mockVendorService.getVendorNames());
  },

  async getAllVendors() {
    return withFallback(() => vendorApi.all(), () => mockVendorService.getAllVendors());
  },

  async getRfqEligibleVendors() {
    /* The eligibility rule is enforced client-side in both modes so the
       RFQ selector never shows Pending / Rejected / Blocked / Archived
       vendors even when the backend responds. */
    return withFallback(
      async () => (await vendorApi.all()).filter(isVendorRfqEligible),
      () => mockVendorService.getRfqEligibleVendors()
    );
  },

  async getVendors(options = {}) {
    return withFallback(() => vendorApi.list(options), () => mockVendorService.getVendors(options));
  },

  async getVendor(id) {
    return withFallback(() => vendorApi.get(id), () => mockVendorService.getVendor(id));
  },

  async createVendor(payload = {}) {
    return withFallback(() => vendorApi.create(payload), () => mockVendorService.createVendor(payload));
  },

  async updateVendor(id, patch = {}) {
    return withFallback(() => vendorApi.update(id, patch), () => mockVendorService.updateVendor(id, patch));
  },

  async deleteVendor(id) {
    return withFallback(() => vendorApi.delete(id), () => mockVendorService.deleteVendor(id));
  },

  async setVendorStatus(id, status) {
    return withFallback(() => vendorApi.setStatus(id, status), () => mockVendorService.setVendorStatus(id, status));
  },

  async duplicateVendor(id) {
    return withFallback(() => vendorApi.duplicate(id), () => mockVendorService.duplicateVendor(id));
  },

  async archiveVendor(id) {
    return withFallback(() => vendorApi.archive(id), () => mockVendorService.archiveVendor(id));
  },

  async restoreVendor(id) {
    return withFallback(() => vendorApi.restore(id), () => mockVendorService.restoreVendor(id));
  },

  async bulkArchive(ids) {
    return withFallback(
      () => Promise.all(ids.map((id) => vendorApi.archive(id))),
      () => mockVendorService.bulkArchive(ids)
    );
  },

  async bulkRestore(ids) {
    return withFallback(
      () => Promise.all(ids.map((id) => vendorApi.restore(id))),
      () => mockVendorService.bulkRestore(ids)
    );
  },

  async bulkDelete(ids) {
    return withFallback(
      () => Promise.all(ids.map((id) => vendorApi.delete(id))),
      () => mockVendorService.bulkDelete(ids)
    );
  },

  async getVendorActivity(id) {
    return withFallback(() => vendorApi.activity(id), () => mockVendorService.getVendorActivity(id));
  },

  async addVendorComment(id, text = '') {
    return withFallback(() => vendorApi.addComment(id, text), () => mockVendorService.addVendorComment(id, text));
  },

  async getVendorTimeline(id) {
    return mockVendorService.getVendorTimeline(id);
  },

  async getVendorPrint(id) {
    return mockVendorService.getVendorPrint(id);
  },

  async logVendorPrint(id) {
    return mockVendorService.logVendorPrint(id);
  },

  async getVendorStats() {
    return withFallback(() => vendorApi.stats(), () => mockVendorService.getVendorStats());
  },

  async getVendorPerformance() {
    return withFallback(() => vendorApi.performance(), () => mockVendorService.getVendorPerformance());
  },

  /** Supplier Master — the full transaction view for one supplier
   *  (RFQs, quotations, POs, GRNs, inspections, invoices, payments)
   *  with derived performance. Mock-only (derived from local stores). */
  async getSupplierTransactions(vendor) {
    const resolved =
      typeof vendor === 'string' || typeof vendor === 'number'
        ? await mockVendorService.getVendor(String(vendor))
        : vendor;
    return fetchSupplierTransactions(resolved || {});
  },

  /** Supplier Master — resolve the master record by id OR loose name
   *  reference (mirrors the RFQ module's name resolution). */
  async getSupplierMasterByReference(reference = {}) {
    return mockVendorService.getSupplierMasterByReference(reference);
  }
};
