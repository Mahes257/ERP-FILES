/**
 * purchase/services/documentVersioning.js
 * ------------------------------------------------------------------
 * Enterprise Document Versioning and Audit Trail service.
 *
 * Tracks every printable document (PO, PR, RFQ, Invoice, GRN, Vendor)
 * through versioned snapshots. Each version carries:
 *   - version number (monotonically increasing)
 *   - file reference (sourceUrl, fileSize)
 *   - status (Draft → Generated → Approved → Final / Cancelled)
 *   - change reason
 *   - isCurrent flag (clearly identifies the active version)
 *   - immutable audit trail of every user interaction
 *
 * Rules:
 *   - Never overwrite historical versions
 *   - Current version must be clearly identified
 *   - Restoring creates a new version; does not destroy history
 *   - Generated documents automatically increment versions
 *   - Uploaded replacement documents create a version when appropriate
 *
 * Persisted in localStorage via the base createCollection helper.
 * ------------------------------------------------------------------
 */
import { clone, createCollection, delay } from './base';
import {
  DOCUMENT_STATUS,
  isValidDocumentStatusTransition,
  AUDIT_ACTION
} from '../constants';
import { getCurrentActor } from './api-client';
import { formatSize } from '../utils/attachmentFile';

/* ─── Storage ─── */

const VERSION_STORAGE_KEY = 'purchase-document-versions-v1';
const versionsStore = createCollection(VERSION_STORAGE_KEY, () => []);

/** Reset the store — used by tests to clear state between runs. */
export function resetVersionsStore() {
  versionsStore.persist([]);
  versionsStore.reset();
}

/* ─── Helpers ─── */

function auditEntry(action, details = null) {
  const actor = getCurrentActor();
  return {
    action,
    performedBy: actor?.name || 'System',
    performedAt: new Date().toISOString(),
    details
  };
}

function generateVersionId(docType, sourceId, version) {
  return `VER-${docType}-${sourceId}-v${version}`;
}

/* ─── Public Service ─── */

export const documentVersioningService = {
  /**
   * Create a new document version (Draft or Generated).
   * If the source already has versions, the new version number is
   * the max existing version + 1. Previous versions are preserved.
   *
   * Each version now carries:
   *   - sourceUrl: file reference (data URL or blob URL)
   *   - fileSize: size in bytes
   *   - fileSizeLabel: human-readable size
   *   - changeReason: why this version was created
   *   - isCurrent: whether this is the active version
   */
  async createVersion(docType, sourceId, {
    status = DOCUMENT_STATUS.DRAFT,
    description = '',
    sourceUrl = '',
    fileSize = 0,
    changeReason = ''
  } = {}) {
    await delay(60);
    const existing = versionsStore.all.filter(
      (v) => v.docType === docType && v.sourceId === sourceId
    );
    const nextVersion = existing.length > 0
      ? Math.max(...existing.map((v) => v.version)) + 1
      : 1;

    /* Mark all previous versions as not-current */
    const updatedExisting = existing.map((v) => ({
      ...v,
      isCurrent: false
    }));

    /* Update the stored records to mark old versions as not-current */
    if (updatedExisting.length > 0) {
      const allDocs = versionsStore.all;
      for (const updated of updatedExisting) {
        const idx = allDocs.findIndex((v) => v.versionId === updated.versionId);
        if (idx !== -1) {
          allDocs[idx] = { ...allDocs[idx], isCurrent: false };
        }
      }
      versionsStore.persist(allDocs);
    }

    const version = {
      versionId: generateVersionId(docType, sourceId, nextVersion),
      docType,
      sourceId,
      version: nextVersion,
      status,
      /* File reference */
      sourceUrl,
      fileSize,
      fileSizeLabel: formatSize(fileSize),
      /* Change tracking */
      changeReason: changeReason || description || `Version ${nextVersion} created`,
      /* Current flag — new version is always the current one */
      isCurrent: true,
      /* Metadata */
      createdBy: getCurrentActor()?.name || 'System',
      createdAt: new Date().toISOString(),
      updatedBy: getCurrentActor()?.name || 'System',
      updatedAt: new Date().toISOString(),
      finalizedBy: null,
      finalizedAt: null,
      description,
      auditTrail: [auditEntry(AUDIT_ACTION.UPLOADED, changeReason || description || `Version ${nextVersion} created`)]
    };

    const all = [...versionsStore.all, version];
    versionsStore.persist(all);
    return clone(version);
  },

  /**
   * Transition a document version to a new status.
   * Validates the transition is allowed per DOCUMENT_STATUS_TRANSITIONS.
   */
  async transitionStatus(versionId, newStatus, details = null) {
    await delay(60);
    const all = versionsStore.all;
    const idx = all.findIndex((v) => v.versionId === versionId);
    if (idx === -1) throw new Error('Document version not found');

    const current = all[idx];
    if (!isValidDocumentStatusTransition(current.status, newStatus)) {
      throw new Error(`Cannot transition from "${current.status}" to "${newStatus}"`);
    }

    const actor = getCurrentActor();
    const updated = {
      ...current,
      status: newStatus,
      updatedBy: actor?.name || 'System',
      updatedAt: new Date().toISOString(),
      auditTrail: [
        ...current.auditTrail,
        auditEntry(
          newStatus === DOCUMENT_STATUS.CANCELLED ? AUDIT_ACTION.CANCELLED :
          newStatus === DOCUMENT_STATUS.FINAL ? AUDIT_ACTION.FINALIZED :
          AUDIT_ACTION.EDITED,
          details || `Status changed to "${newStatus}"`
        )
      ]
    };

    /* If finalized, record the finalizer. */
    if (newStatus === DOCUMENT_STATUS.FINAL) {
      updated.finalizedBy = actor?.name || 'System';
      updated.finalizedAt = new Date().toISOString();
    }

    all[idx] = updated;
    versionsStore.persist(all);
    return clone(updated);
  },

  /**
   * Record a user action on a document version (view, download, edit, etc.).
   * Adds an entry to the audit trail without changing status.
   */
  async recordAction(versionId, action, details = null) {
    await delay(30);
    const all = versionsStore.all;
    const idx = all.findIndex((v) => v.versionId === versionId);
    if (idx === -1) throw new Error('Document version not found');

    const current = all[idx];
    const updated = {
      ...current,
      updatedBy: getCurrentActor()?.name || 'System',
      updatedAt: new Date().toISOString(),
      auditTrail: [...current.auditTrail, auditEntry(action, details)]
    };

    all[idx] = updated;
    versionsStore.persist(all);
    return clone(updated);
  },

  /**
   * Record a PDF generation/print action and auto-transition
   * to Generated if currently Draft.
   */
  async recordPdfGeneration(versionId, { printed = false, sourceUrl = '', fileSize = 0 } = {}) {
    await delay(40);
    const all = versionsStore.all;
    const idx = all.findIndex((v) => v.versionId === versionId);
    if (idx === -1) throw new Error('Document version not found');

    const current = all[idx];
    const newAudit = [
      auditEntry(printed ? AUDIT_ACTION.PRINTED : AUDIT_ACTION.PDF_GENERATED)
    ];

    /* Auto-transition Draft → Generated on first PDF generation. */
    let newStatus = current.status;
    if (current.status === DOCUMENT_STATUS.DRAFT) {
      newStatus = DOCUMENT_STATUS.GENERATED;
      newAudit.unshift(auditEntry(AUDIT_ACTION.EDITED, 'Auto-transitioned to Generated'));
    }

    const updated = {
      ...current,
      status: newStatus,
      sourceUrl: sourceUrl || current.sourceUrl,
      fileSize: fileSize || current.fileSize,
      fileSizeLabel: formatSize(fileSize || current.fileSize || 0),
      updatedBy: getCurrentActor()?.name || 'System',
      updatedAt: new Date().toISOString(),
      auditTrail: [...current.auditTrail, ...newAudit]
    };

    all[idx] = updated;
    versionsStore.persist(all);
    return clone(updated);
  },

  /**
   * Restore a historical version as the latest.
   * Creates a NEW version with the restored content — never overwrites history.
   *
   * @param {string} versionId - The version to restore
   * @param {Object} [options] - Optional overrides for the new version
   * @returns {Object} The newly created (restored) version
   */
  async restoreVersion(versionId, { changeReason = '', sourceUrl = '', fileSize = 0 } = {}) {
    await delay(60);
    const all = versionsStore.all;
    const idx = all.findIndex((v) => v.versionId === versionId);
    if (idx === -1) throw new Error('Document version not found');

    const versionToRestore = all[idx];
    const actor = getCurrentActor();

    /* Record the restore action on the old version */
    const oldVersion = {
      ...versionToRestore,
      isCurrent: false,
      updatedBy: actor?.name || 'System',
      updatedAt: new Date().toISOString(),
      auditTrail: [
        ...versionToRestore.auditTrail,
        auditEntry(AUDIT_ACTION.RESTOREED, `Restored to create new version`)
      ]
    };
    all[idx] = oldVersion;

    /* Find the max version number for this document */
    const existingVersions = all.filter(
      (v) => v.docType === versionToRestore.docType && v.sourceId === versionToRestore.sourceId
    );
    const maxVersion = Math.max(...existingVersions.map((v) => v.version));

    /* Mark all versions as not-current */
    for (let i = 0; i < all.length; i++) {
      if (all[i].docType === versionToRestore.docType && all[i].sourceId === versionToRestore.sourceId) {
        all[i] = { ...all[i], isCurrent: false };
      }
    }

    /* Create a new version with the restored content */
    const restoredVersion = {
      versionId: generateVersionId(versionToRestore.docType, versionToRestore.sourceId, maxVersion + 1),
      docType: versionToRestore.docType,
      sourceId: versionToRestore.sourceId,
      version: maxVersion + 1,
      status: DOCUMENT_STATUS.GENERATED,
      /* File reference — use provided or fall back to the restored version */
      sourceUrl: sourceUrl || versionToRestore.sourceUrl || '',
      fileSize: fileSize || versionToRestore.fileSize || 0,
      fileSizeLabel: formatSize(fileSize || versionToRestore.fileSize || 0),
      /* Change tracking */
      changeReason: changeReason || `Restored from v${versionToRestore.version}`,
      isCurrent: true,
      /* Metadata */
      createdBy: actor?.name || 'System',
      createdAt: new Date().toISOString(),
      updatedBy: actor?.name || 'System',
      updatedAt: new Date().toISOString(),
      finalizedBy: null,
      finalizedAt: null,
      description: `Restored from version ${versionToRestore.version}`,
      auditTrail: [
        auditEntry(AUDIT_ACTION.UPLOADED, `Restored from v${versionToRestore.version}`),
        auditEntry(AUDIT_ACTION.RESTOREED, `Restored from version ${versionToRestore.version}: ${changeReason || versionToRestore.changeReason || ''}`)
      ]
    };

    all.push(restoredVersion);
    versionsStore.persist(all);
    return clone(restoredVersion);
  },

  /**
   * Mark a specific version as the current version.
   * All other versions for this document become non-current.
   *
   * @param {string} versionId - The version to mark as current
   * @returns {Object} The updated version
   */
  async markAsCurrent(versionId) {
    await delay(40);
    const all = versionsStore.all;
    const idx = all.findIndex((v) => v.versionId === versionId);
    if (idx === -1) throw new Error('Document version not found');

    const target = all[idx];
    const actor = getCurrentActor();

    /* Mark all versions for this document as not-current */
    for (let i = 0; i < all.length; i++) {
      if (all[i].docType === target.docType && all[i].sourceId === target.sourceId) {
        all[i] = { ...all[i], isCurrent: false };
      }
    }

    /* Mark the target version as current */
    all[idx] = {
      ...all[idx],
      isCurrent: true,
      updatedBy: actor?.name || 'System',
      updatedAt: new Date().toISOString(),
      auditTrail: [
        ...all[idx].auditTrail,
        auditEntry(AUDIT_ACTION.MARKED_CURRENT, `Marked v${target.version} as current`)
      ]
    };

    versionsStore.persist(all);
    return clone(all[idx]);
  },

  /**
   * Get the latest version for a document (by docType + sourceId).
   * Returns null if no versions exist.
   */
  async getLatestVersion(docType, sourceId) {
    await delay(40);
    const versions = versionsStore.all
      .filter((v) => v.docType === docType && v.sourceId === sourceId)
      .sort((a, b) => b.version - a.version);
    return versions.length > 0 ? clone(versions[0]) : null;
  },

  /**
   * Get the current (active) version for a document.
   * Falls back to the latest version if no version is marked as current.
   */
  async getCurrentVersion(docType, sourceId) {
    await delay(40);
    const versions = versionsStore.all
      .filter((v) => v.docType === docType && v.sourceId === sourceId);
    const current = versions.find((v) => v.isCurrent);
    if (current) return clone(current);
    /* Fallback: return the latest version */
    const sorted = [...versions].sort((a, b) => b.version - a.version);
    return sorted.length > 0 ? clone(sorted[0]) : null;
  },

  /**
   * Get all versions for a document, sorted by version number descending.
   */
  async getVersions(docType, sourceId) {
    await delay(40);
    return clone(
      versionsStore.all
        .filter((v) => v.docType === docType && v.sourceId === sourceId)
        .sort((a, b) => b.version - a.version)
    );
  },

  /**
   * Get the audit trail for a specific version.
   */
  async getAuditTrail(versionId) {
    await delay(30);
    const version = versionsStore.all.find((v) => v.versionId === versionId);
    if (!version) throw new Error('Document version not found');
    return clone(version.auditTrail || []);
  },

  /**
   * Get version stats across all documents.
   */
  async getVersionStats() {
    await delay(40);
    const all = versionsStore.all;
    const byStatus = {};
    for (const s of Object.values(DOCUMENT_STATUS)) byStatus[s] = 0;
    for (const v of all) {
      byStatus[v.status] = (byStatus[v.status] || 0) + 1;
    }
    return {
      total: all.length,
      byStatus,
      uniqueDocuments: new Set(all.map((v) => `${v.docType}-${v.sourceId}`)).size
    };
  },

  /**
   * Compare metadata between two versions.
   * Returns a structured comparison object.
   *
   * @param {string} versionIdA - First version to compare
   * @param {string} versionIdB - Second version to compare
   * @returns {Object} Comparison result with changed fields
   */
  async compareVersions(versionIdA, versionIdB) {
    await delay(30);
    const all = versionsStore.all;
    const vA = all.find((v) => v.versionId === versionIdA);
    const vB = all.find((v) => v.versionId === versionIdB);
    if (!vA) throw new Error(`Version ${versionIdA} not found`);
    if (!vB) throw new Error(`Version ${versionIdB} not found`);

    /* Record the comparison action */
    const idxA = all.findIndex((v) => v.versionId === versionIdA);
    all[idxA] = {
      ...all[idxA],
      auditTrail: [
        ...all[idxA].auditTrail,
        auditEntry(AUDIT_ACTION.COMPARED, `Compared with v${vB.version}`)
      ]
    };
    versionsStore.persist(all);

    /* Compare fields */
    const fields = ['status', 'sourceUrl', 'fileSize', 'changeReason', 'description'];
    const changes = [];
    for (const field of fields) {
      const valA = vA[field] ?? '';
      const valB = vB[field] ?? '';
      if (valA !== valB) {
        changes.push({ field, versionA: valA, versionB: valB });
      }
    }

    return {
      versionA: clone(vA),
      versionB: clone(vB),
      changes,
      identical: changes.length === 0
    };
  },

  /**
   * Ensure a version exists for a document. If not, create one
   * in Generated status. Returns the version record.
   */
  async ensureVersion(docType, sourceId, description = '') {
    const existing = await this.getLatestVersion(docType, sourceId);
    if (existing) return existing;
    return this.createVersion(docType, sourceId, {
      status: DOCUMENT_STATUS.GENERATED,
      description: description || `${docType} document`
    });
  },

  /**
   * Delete all versions for a document (soft — marks as cancelled).
   * Used when the source document is deleted.
   */
  async deleteAllVersions(docType, sourceId) {
    await delay(40);
    const all = versionsStore.all;
    let count = 0;
    for (let i = 0; i < all.length; i++) {
      if (all[i].docType === docType && all[i].sourceId === sourceId) {
        all[i] = {
          ...all[i],
          isCurrent: false,
          auditTrail: [
            ...all[i].auditTrail,
            auditEntry(AUDIT_ACTION.DELETED, 'All versions deleted')
          ]
        };
        count++;
      }
    }
    versionsStore.persist(all);
    return { success: true, deleted: count };
  }
};
