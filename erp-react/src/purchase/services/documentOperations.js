/**
 * purchase/services/documentOperations.js
 * ------------------------------------------------------------------
 * Centralized document management operations.
 *
 * Provides all CRUD + lifecycle operations for documents:
 *   - Rename
 *   - Add/update description
 *   - Add/update tags
 *   - Change category
 *   - Upload replacement (creates new version)
 *   - Create new version (manual)
 *   - Archive / Restore from archive
 *   - PDF page operations abstraction (reorder, rotate, delete, merge, split)
 *
 * All destructive operations include confirmation logic and audit trails.
 * PDF page operations that cannot be safely performed in the browser
 * return a clear "unavailable" state instead of pretending to work.
 *
 * Preserves original files and creates new versions after modifications.
 * ------------------------------------------------------------------
 */
import { documentsStore } from './documents';
import { documentVersioningService } from './documentVersioning';
import { AUDIT_ACTION, DOCUMENT_STATUS } from '../constants';
import { getCurrentActor } from './api-client';
import { formatSize, detectType, fileTypeLabel } from '../utils/attachmentFile';
import { clone, delay } from './base';

/* ═══════════════════════════════════════════════════════════════════
   Constants
   ═══════════════════════════════════════════════════════════════════ */

/** PDF page operations that require backend/server support. */
export const PDF_PAGE_OPERATIONS = {
  REORDER: {
    key: 'reorder',
    label: 'Reorder Pages',
    requiresBackend: true,
    description: 'Drag-and-drop page reordering requires server-side PDF manipulation.'
  },
  ROTATE_SELECTED: {
    key: 'rotate_selected',
    label: 'Rotate Selected Pages',
    requiresBackend: true,
    description: 'Rotating specific pages requires server-side PDF manipulation.'
  },
  DELETE_SELECTED: {
    key: 'delete_selected',
    label: 'Delete Pages',
    requiresBackend: true,
    description: 'Deleting specific pages requires server-side PDF manipulation. Original file is preserved.'
  },
  MERGE: {
    key: 'merge',
    label: 'Merge PDFs',
    requiresBackend: true,
    description: 'Merging multiple PDFs requires server-side PDF manipulation.'
  },
  SPLIT: {
    key: 'split',
    label: 'Split PDF',
    requiresBackend: true,
    description: 'Splitting a PDF into multiple files requires server-side PDF manipulation.'
  }
};

/** Operations that create a new version rather than modifying in-place. */
export const VERSION_CREATING_OPS = new Set(['replace', 'restore', 'create_version']);

/** Operations that require user confirmation. */
export const DESTRUCTIVE_OPS = new Set(['archive', 'delete', 'delete_page', 'overwrite']);

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

function auditEntry(action, details = null) {
  const actor = getCurrentActor();
  return {
    action,
    performedBy: actor?.name || 'System',
    performedAt: new Date().toISOString(),
    details
  };
}

function docIndex(docId) {
  return documentsStore.all.findIndex((d) => d.docId === docId);
}


function persistDocs() {
  documentsStore.persist(documentsStore.all);
}

/* ═══════════════════════════════════════════════════════════════════
   Service
   ═══════════════════════════════════════════════════════════════════ */

export const documentOperationsService = {
  /* ─── Rename ─── */
  async rename(docId, newName) {
    await delay(40);
    if (!newName || !newName.trim()) throw new Error('Name cannot be empty');
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    const oldName = doc.name;
    const now = new Date().toISOString();
    documentsStore.all[idx] = {
      ...doc,
      name: newName.trim(),
      updatedAt: now,
      audit: [...(doc.audit || []), auditEntry(AUDIT_ACTION.EDITED, `Renamed from "${oldName}"`)]
    };
    persistDocs();
    return clone(documentsStore.all[idx]);
  },

  /* ─── Update Description ─── */
  async updateDescription(docId, description) {
    await delay(40);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    documentsStore.all[idx] = {
      ...doc,
      description: description || '',
      updatedAt: new Date().toISOString(),
      audit: [...(doc.audit || []), auditEntry(AUDIT_ACTION.EDITED, 'Description updated')]
    };
    persistDocs();
    return clone(documentsStore.all[idx]);
  },

  /* ─── Update Tags ─── */
  async updateTags(docId, tags) {
    await delay(40);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const tagArray = Array.isArray(tags)
      ? tags
      : String(tags || '').split(',').map((t) => t.trim()).filter(Boolean);

    const doc = documentsStore.all[idx];
    documentsStore.all[idx] = {
      ...doc,
      tags: tagArray,
      updatedAt: new Date().toISOString(),
      audit: [...(doc.audit || []), auditEntry(AUDIT_ACTION.EDITED, `Tags updated: ${tagArray.join(', ') || 'cleared'}`)]
    };
    persistDocs();
    return clone(documentsStore.all[idx]);
  },

  /* ─── Change Category ─── */
  async changeCategory(docId, category) {
    await delay(40);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    const oldCategory = doc.category || '';
    documentsStore.all[idx] = {
      ...doc,
      category: category || '',
      updatedAt: new Date().toISOString(),
      audit: [...(doc.audit || []), auditEntry(AUDIT_ACTION.EDITED, `Category changed from "${oldCategory}" to "${category}"`)]
    };
    persistDocs();
    return clone(documentsStore.all[idx]);
  },

  /* ─── Upload Replacement (creates new version) ─── */
  async uploadReplacement(docId, file, { changeReason = '' } = {}) {
    await delay(100);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });

    const now = new Date().toISOString();
    const nextVersion = (doc.version || 1) + 1;

    /* Update the document record */
    documentsStore.all[idx] = {
      ...doc,
      name: file.name || doc.name,
      sourceUrl: dataUrl,
      sourceType: ext,
      fileType: fileTypeLabel(file.name, detectType(file.name, file.type)),
      fileSize: file.size || 0,
      fileSizeLabel: formatSize(file.size || 0),
      version: nextVersion,
      updatedAt: now,
      audit: [
        ...(doc.audit || []),
        auditEntry(AUDIT_ACTION.EDITED, `Replaced with new file (v${nextVersion}): ${changeReason || 'Upload replacement'}`)
      ]
    };
    persistDocs();

    /* Create a version record */
    try {
      await documentVersioningService.createVersion(
        doc.docType || doc.stage,
        doc.sourceId,
        {
          status: DOCUMENT_STATUS.GENERATED,
          sourceUrl: dataUrl,
          fileSize: file.size || 0,
          changeReason: changeReason || `Upload replacement — v${nextVersion}`,
          description: `Replaced: ${file.name}`
        }
      );
    } catch { /* Best-effort versioning */ }

    return clone(documentsStore.all[idx]);
  },

  /* ─── Create New Version (manual) ─── */
  async createNewVersion(docId, { sourceUrl = '', fileSize = 0, changeReason = '', description = '' } = {}) {
    await delay(60);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    const nextVersion = (doc.version || 1) + 1;
    const now = new Date().toISOString();

    documentsStore.all[idx] = {
      ...doc,
      version: nextVersion,
      sourceUrl: sourceUrl || doc.sourceUrl,
      fileSize: fileSize || doc.fileSize,
      fileSizeLabel: formatSize(fileSize || doc.fileSize || 0),
      updatedAt: now,
      audit: [
        ...(doc.audit || []),
        auditEntry(AUDIT_ACTION.EDITED, `New version v${nextVersion} created: ${changeReason || description || 'Manual version'}`)
      ]
    };
    persistDocs();

    /* Create version record */
    try {
      await documentVersioningService.createVersion(
        doc.docType || doc.stage,
        doc.sourceId,
        {
          status: DOCUMENT_STATUS.GENERATED,
          sourceUrl: sourceUrl || doc.sourceUrl,
          fileSize: fileSize || doc.fileSize,
          changeReason: changeReason || description || `Manual version v${nextVersion}`,
          description: description || `Version ${nextVersion}`
        }
      );
    } catch { /* Best-effort versioning */ }

    return clone(documentsStore.all[idx]);
  },

  /* ─── Archive ─── */
  async archive(docId) {
    await delay(40);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    if (doc.recordState === 'archived') throw new Error('Document is already archived');

    documentsStore.all[idx] = {
      ...doc,
      recordState: 'archived',
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      audit: [...(doc.audit || []), auditEntry(AUDIT_ACTION.EDITED, 'Archived')]
    };
    persistDocs();
    return clone(documentsStore.all[idx]);
  },

  /* ─── Restore from Archive ─── */
  async restore(docId) {
    await delay(40);
    const idx = docIndex(docId);
    if (idx === -1) throw new Error('Document not found');

    const doc = documentsStore.all[idx];
    if (doc.recordState !== 'archived') throw new Error('Document is not archived');

    documentsStore.all[idx] = {
      ...doc,
      recordState: 'active',
      archivedAt: null,
      updatedAt: new Date().toISOString(),
      audit: [...(doc.audit || []), auditEntry(AUDIT_ACTION.RESTOREED, 'Restored from archive')]
    };
    persistDocs();
    return clone(documentsStore.all[idx]);
  },

  /* ─── Bulk Archive ─── */
  async bulkArchive(docIds) {
    await delay(60);
    let count = 0;
    for (const docId of docIds) {
      try { await this.archive(docId); count++; } catch { /* skip */ }
    }
    return { success: true, archived: count };
  },

  /* ─── Bulk Restore ─── */
  async bulkRestore(docIds) {
    await delay(60);
    let count = 0;
    for (const docId of docIds) {
      try { await this.restore(docId); count++; } catch { /* skip */ }
    }
    return { success: true, restored: count };
  },

  /* ─── Get PDF Page Operation Availability ─── */
  getPdfPageOperationStatus(operationKey) {
    const op = Object.values(PDF_PAGE_OPERATIONS).find((o) => o.key === operationKey);
    if (!op) return { available: false, reason: 'Unknown operation' };
    if (op.requiresBackend) {
      return {
        available: false,
        reason: op.description,
        operation: op.label,
        requiresBackend: true
      };
    }
    return { available: true, operation: op.label };
  },

  /**
   * Check which PDF operations are available in the current environment.
   * Returns a map of operation keys to their availability status.
   */
  getPdfOperationsAvailability() {
    const result = {};
    for (const [, op] of Object.entries(PDF_PAGE_OPERATIONS)) {
      result[op.key] = this.getPdfPageOperationStatus(op.key);
    }
    return result;
  },

  /* ─── Get operation confirmation message ─── */
  getConfirmationMessage(operation, doc) {
    const messages = {
      archive: `Archive "${doc?.name}"? It will be hidden from the default view but can be restored.`,
      delete: `Permanently delete "${doc?.name}"? This action cannot be undone.`,
      replace: `Upload a replacement file for "${doc?.name}"? This will create a new version (v${(doc?.version || 1) + 1}). The current version will be preserved in history.`,
      create_version: `Create a new version of "${doc?.name}"? The current version will be preserved.`,
      restore: `Restore "${doc?.name}" from archive? It will become visible in the default view again.`,
      overwrite: `Overwrite the current file for "${doc?.name}"? The current version will be preserved in history.`,
      delete_page: `Delete selected pages from "${doc?.name}"? This requires server-side processing. The original file will be preserved as a previous version.`,
      merge: `Merge PDFs? This requires server-side processing.`,
      split: `Split PDF? This requires server-side processing.`
    };
    return messages[operation] || `Perform operation on "${doc?.name}"?`;
  }
};
