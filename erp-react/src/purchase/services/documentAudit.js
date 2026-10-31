/**
 * purchase/services/documentAudit.js
 * ------------------------------------------------------------------
 * Centralized document audit trail service.
 *
 * Records every important action with a structured audit record:
 *   - timestamp: ISO string
 *   - user: { id, name, email } (never password or token)
 *   - action: what was done
 *   - document: { docId, name, docNo } (never internal file paths)
 *   - source: where the action was initiated from
 *   - version: document version at time of action
 *   - result: success / failure / partial
 *   - details: optional human-readable details
 *
 * Security:
 *   - Never exposes internal file paths (storagePath, internalUrl)
 *   - Never logs passwords, tokens, or sensitive credentials
 *   - All user info comes from getCurrentActor (JWT-derived)
 *
 * Persisted in localStorage via createCollection.
 * ------------------------------------------------------------------
 */
import { clone, createCollection, delay } from './base';
import { getCurrentActor } from './api-client';

/* ═══════════════════════════════════════════════════════════════════
   Audit Action Constants
   ═══════════════════════════════════════════════════════════════════ */

export const AUDIT_ACTIONS = {
  VIEWED: 'Viewed',
  DOWNLOADED: 'Downloaded',
  UPLOADED: 'Uploaded',
  GENERATED: 'Generated',
  PRINTED: 'Printed',
  RENAMED: 'Renamed',
  DESCRIPTION_UPDATED: 'Description Updated',
  TAGS_UPDATED: 'Tags Updated',
  CATEGORY_CHANGED: 'Category Changed',
  VERSION_CREATED: 'Version Created',
  VERSION_RESTORED: 'Version Restored',
  VERSION_MARKED_CURRENT: 'Version Marked as Current',
  ARCHIVED: 'Archived',
  DELETED: 'Deleted',
  RESTORED: 'Restored',
  METADATA_EXPORTED: 'Metadata Exported',
  BULK_DOWNLOADED: 'Bulk Downloaded',
  BULK_ARCHIVED: 'Bulk Archived',
  BULK_DELETED: 'Bulk Deleted',
  CONFIDENTIAL_ACCESSED: 'Confidential Accessed',
  ACCESS_DENIED: 'Access Denied'
};

/* ═══════════════════════════════════════════════════════════════════
   Storage
   ═══════════════════════════════════════════════════════════════════ */

const AUDIT_STORAGE_KEY = 'purchase-document-audit-v1';
const auditStore = createCollection(AUDIT_STORAGE_KEY, () => []);

/** Reset — used by tests. */
export function resetAuditStore() {
  auditStore.persist([]);
}

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Sanitize user info — never include password, token, or sensitive fields.
 */
function sanitizeUser(actor) {
  if (!actor) return { id: 'anonymous', name: 'Unknown', email: '' };
  return {
    id: String(actor.id || 'anonymous'),
    name: String(actor.name || 'Unknown'),
    email: String(actor.email || '')
    /* Explicitly OMIT: role, token, password, permissions */
  };
}

/**
 * Sanitize document info for audit — never include internal file paths.
 */
function sanitizeDoc(doc) {
  if (!doc) return { docId: '', name: '', docNo: '' };
  return {
    docId: doc.docId || '',
    name: doc.name || '',
    docNo: doc.docNo || '',
    stage: doc.stage || '',
    vendor: doc.vendor || '',
    /* Explicitly OMIT: sourceUrl, storagePath, internalUrl, dataUrl */
  };
}

/**
 * Build a structured audit record.
 */
function buildAuditRecord({
  action,
  doc = null,
  source = 'ui',
  version = null,
  result = 'success',
  details = null,
  metadata = {}
}) {
  const actor = getCurrentActor();
  return {
    id: `AUDIT-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    user: sanitizeUser(actor),
    action,
    document: sanitizeDoc(doc),
    source,
    version: version || doc?.version || null,
    result,
    details,
    /* Additional context — sanitized */
    metadata: {
      folder: doc?.folder || '',
      stage: doc?.stage || '',
      ...metadata
    }
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Service
   ═══════════════════════════════════════════════════════════════════ */

export const documentAuditService = {
  /**
   * Record an audit entry.
   *
   * @param {string} action - One of AUDIT_ACTIONS
   * @param {Object} options
   * @param {Object} [options.doc] - Document record (will be sanitized)
   * @param {string} [options.source] - Where initiated: 'ui', 'api', 'system', 'bulk'
   * @param {number} [options.version] - Document version
   * @param {string} [options.result] - 'success', 'failure', 'partial', 'denied'
   * @param {string} [options.details] - Human-readable details
   * @param {Object} [options.metadata] - Additional sanitized context
   * @returns {Object} The audit record
   */
  async record(action, options = {}) {
    await delay(20);
    const record = buildAuditRecord({ action, ...options });
    const all = [...auditStore.all, record];
    auditStore.persist(all);
    return record;
  },

  /**
   * Record multiple audit entries at once (for bulk operations).
   */
  async recordBulk(action, docs, options = {}) {
    const records = [];
    for (const doc of docs) {
      const record = buildAuditRecord({ action, doc, ...options });
      records.push(record);
    }
    const all = [...auditStore.all, ...records];
    auditStore.persist(all);
    return records;
  },

  /**
   * Get audit trail for a specific document.
   */
  async getAuditTrail(docId, { limit = 50, offset = 0 } = {}) {
    await delay(30);
    const filtered = auditStore.all
      .filter((r) => r.document?.docId === docId)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return clone(filtered.slice(offset, offset + limit));
  },

  /**
   * Get recent audit entries across all documents.
   */
  async getRecentAudit({ limit = 50, action = '', user = '' } = {}) {
    await delay(30);
    let entries = [...auditStore.all].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    if (action) entries = entries.filter((r) => r.action === action);
    if (user) entries = entries.filter((r) => r.user?.name?.toLowerCase().includes(user.toLowerCase()));
    return clone(entries.slice(0, limit));
  },

  /**
   * Get audit statistics.
   */
  async getAuditStats() {
    await delay(40);
    const all = auditStore.all;
    const byAction = {};
    const byUser = {};
    const byResult = { success: 0, failure: 0, partial: 0, denied: 0 };

    for (const record of all) {
      byAction[record.action] = (byAction[record.action] || 0) + 1;
      const userName = record.user?.name || 'Unknown';
      byUser[userName] = (byUser[userName] || 0) + 1;
      byResult[record.result] = (byResult[record.result] || 0) + 1;
    }

    return {
      total: all.length,
      byAction,
      byUser,
      byResult,
      lastActivity: all.length > 0 ? all[all.length - 1].timestamp : null
    };
  },

  /**
   * Export audit trail as CSV.
   */
  async exportAuditCsv({ dateFrom = '', dateTo = '', action = '' } = {}) {
    await delay(50);
    let entries = [...auditStore.all].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    if (dateFrom) entries = entries.filter((r) => r.timestamp >= dateFrom);
    if (dateTo) entries = entries.filter((r) => r.timestamp <= dateTo + 'T23:59:59');
    if (action) entries = entries.filter((r) => r.action === action);

    const headers = ['Timestamp', 'User', 'Email', 'Action', 'Document', 'Doc No', 'Version', 'Result', 'Source', 'Details'];
    const escapeCsv = (val) => {
      const s = String(val || '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const rows = entries.map((r) => [
      r.timestamp,
      r.user?.name || '',
      r.user?.email || '',
      r.action,
      r.document?.name || '',
      r.document?.docNo || '',
      r.version || '',
      r.result,
      r.source || '',
      r.details || ''
    ]);

    const csv = [headers.map(escapeCsv).join(','), ...rows.map((row) => row.map(escapeCsv).join(','))].join('\n');
    return csv;
  },

  /* ─── Convenience: record specific common actions ─── */

  async recordView(doc, source = 'ui') {
    return this.record(AUDIT_ACTIONS.VIEWED, { doc, source });
  },

  async recordDownload(doc, source = 'ui') {
    return this.record(AUDIT_ACTIONS.DOWNLOADED, { doc, source });
  },

  async recordUpload(doc, source = 'ui') {
    return this.record(AUDIT_ACTIONS.UPLOADED, { doc, source, version: doc?.version || 1 });
  },

  async recordPrint(doc, source = 'ui') {
    return this.record(AUDIT_ACTIONS.PRINTED, { doc, source });
  },

  async recordRename(doc, oldName, newName) {
    return this.record(AUDIT_ACTIONS.RENAMED, {
      doc,
      details: `Renamed from "${oldName}" to "${newName}"`
    });
  },

  async recordVersionCreated(doc, newVersion) {
    return this.record(AUDIT_ACTIONS.VERSION_CREATED, {
      doc,
      version: newVersion,
      details: `Version ${newVersion} created`
    });
  },

  async recordVersionRestored(doc, fromVersion) {
    return this.record(AUDIT_ACTIONS.VERSION_RESTORED, {
      doc,
      details: `Restored from version ${fromVersion}`
    });
  },

  async recordArchive(doc) {
    return this.record(AUDIT_ACTIONS.ARCHIVED, { doc });
  },

  async recordDelete(doc) {
    return this.record(AUDIT_ACTIONS.DELETED, { doc, result: 'success' });
  },

  async recordRestore(doc) {
    return this.record(AUDIT_ACTIONS.RESTORED, { doc });
  },

  async recordAccessDenied(doc, reason = 'Insufficient permissions') {
    return this.record(AUDIT_ACTIONS.ACCESS_DENIED, {
      doc,
      result: 'denied',
      details: reason
    });
  },

  async recordConfidentialAccess(doc, reason = 'Confidential document accessed by authorized user') {
    return this.record(AUDIT_ACTIONS.CONFIDENTIAL_ACCESSED, { doc, details: reason });
  },

  AUDIT_ACTIONS
};
