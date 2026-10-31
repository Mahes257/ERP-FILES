/**
 * purchase/services/bulkDocumentOperations.js
 * ------------------------------------------------------------------
 * Bulk document operations service.
 *
 * Provides:
 *   - Bulk download as ZIP (using JSZip) with progress
 *   - Export document metadata as CSV
 *   - Progress tracking with success/failure/missing reports
 *   - Filename format: DOCUMENT_NO_DOCUMENT_NAME.ext
 *
 * Handles unavailable files gracefully — does not fail the entire
 * operation. Reports: successful files, failed files, missing files.
 * ------------------------------------------------------------------
 */
import { documentsStore } from './documents';
import { } from './base';
import { formatSize } from '../utils/attachmentFile';

/* ═══════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Build a safe filename from document record.
 * Format: DOCUMENT_NO_DOCUMENT_NAME.ext
 * Falls back gracefully when fields are missing.
 */
function buildFilename(doc) {
  const docNo = (doc.docNo || '').replace(/[^a-zA-Z0-9\-_]/g, '_').trim() || 'DOC';
  const name = (doc.name || 'untitled').replace(/[^a-zA-Z0-9\-_.]/g, '_').trim() || 'untitled';
  /* Get extension from the name or default to pdf */
  const ext = name.includes('.')
    ? name.split('.').pop()
    : (doc.sourceType || 'pdf');
  const baseName = name.includes('.')
    ? name.slice(0, name.lastIndexOf('.'))
    : name;
  /* Sanitize and combine: DOC_NO_BASE_NAME.ext */
  const safeNo = docNo.substring(0, 40);
  const safeName = baseName.substring(0, 80);
  return `${safeNo}_${safeName}.${ext}`;
}

/**
 * Convert a data URL to a Blob.
 */
function dataUrlToBlob(dataUrl) {
  if (!dataUrl) return null;
  try {
    const parts = dataUrl.split(',');
    if (parts.length < 2) return null;
    const meta = parts[0].match(/:(.*?);/);
    const mime = meta ? meta[1] : 'application/octet-stream';
    const raw = atob(parts[1]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return new Blob([arr], { type: mime });
  } catch {
    return null;
  }
}

/**
 * Generate CSV content from document metadata.
 */
function generateMetadataCsv(docs) {
  const headers = [
    'Document ID', 'Name', 'Doc No', 'Stage', 'Folder', 'Type',
    'File Type', 'File Size', 'Version', 'Status', 'Vendor',
    'Uploaded By', 'Uploaded At', 'Updated At', 'Source',
    'PR No', 'RFQ No', 'PO No', 'Category', 'Tags',
    'Description', 'Confidential'
  ];

  const rows = docs.map((doc) => [
    doc.docId || '',
    doc.name || '',
    doc.docNo || '',
    doc.stage || '',
    doc.folder || '',
    doc.docType || '',
    doc.fileType || '',
    doc.fileSizeLabel || formatSize(doc.fileSize || 0),
    `v${doc.version || 1}`,
    doc.status || 'Final',
    doc.vendor || '',
    doc.uploadedBy || '',
    doc.uploadedAt || '',
    doc.updatedAt || '',
    doc.source || '',
    doc.prNo || '',
    doc.rfqNo || '',
    doc.poNo || '',
    doc.category || '',
    Array.isArray(doc.tags) ? doc.tags.join('; ') : (doc.tags || ''),
    doc.description || '',
    doc.confidential ? 'Yes' : 'No'
  ]);

  const escapeCsv = (val) => {
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.map(escapeCsv).join(','),
    ...rows.map((row) => row.map(escapeCsv).join(','))
  ];
  return lines.join('\n');
}

/**
 * Trigger a file download in the browser.
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ═══════════════════════════════════════════════════════════════════
   Service
   ═══════════════════════════════════════════════════════════════════ */

export const bulkDocumentOperationsService = {
  /**
   * Get all document IDs matching the current filter criteria.
   * This enables "select all filtered" without loading everything into memory.
   */
  async getAllFilteredDocIds(filterParams = {}) {
    const result = await import('./documents').then((m) =>
      m.documentsService.getDocuments({ ...filterParams, page: 1, pageSize: 10000, sortBy: 'docId', sortDir: 'asc' })
    );
    return result.data.map((d) => d.docId);
  },

  /**
   * Bulk download documents as a ZIP file.
   *
   * @param {string[]} docIds - Document IDs to download
   * @param {Function} onProgress - Progress callback: (current, total, status) => void
   * @returns {Object} Report with successful, failed, missing counts
   */
  async bulkDownloadZip(docIds, onProgress) {
    // JSZip (~100 kB) is only needed for this one action, so it is loaded on
    // demand instead of being part of the Purchase Documents route chunk.
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();
    const results = { successful: [], failed: [], missing: [], total: docIds.length };

    for (let i = 0; i < docIds.length; i++) {
      const docId = docIds[i];
      onProgress?.(i + 1, docIds.length, 'processing');

      const doc = documentsStore.all.find((d) => d.docId === docId);
      if (!doc) {
        results.missing.push({ docId, reason: 'Document record not found' });
        onProgress?.(i + 1, docIds.length, 'missing');
        continue;
      }

      if (!doc.sourceUrl) {
        results.missing.push({ docId, name: doc.name, reason: 'No file content available' });
        onProgress?.(i + 1, docIds.length, 'missing');
        continue;
      }

      try {
        const blob = dataUrlToBlob(doc.sourceUrl);
        if (!blob) {
          results.failed.push({ docId, name: doc.name, reason: 'Could not convert file data' });
          onProgress?.(i + 1, docIds.length, 'failed');
          continue;
        }

        const filename = buildFilename(doc);
        zip.file(filename, blob);
        results.successful.push({ docId, name: doc.name, filename });
        onProgress?.(i + 1, docIds.length, 'success');
      } catch (err) {
        results.failed.push({ docId, name: doc.name, reason: err.message || 'Unknown error' });
        onProgress?.(i + 1, docIds.length, 'failed');
      }
    }

    /* Generate and download the ZIP if there are successful files */
    if (results.successful.length > 0) {
      onProgress?.(docIds.length, docIds.length, 'generating');
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        onProgress?.(docIds.length, docIds.length, 'generating', meta.percent);
      });
      const timestamp = new Date().toISOString().slice(0, 10);
      triggerDownload(zipBlob, `documents_${timestamp}.zip`);
    }

    onProgress?.(docIds.length, docIds.length, 'complete');
    return results;
  },

  /**
   * Export document metadata as a CSV file.
   *
   * @param {string[]} docIds - Document IDs to export
   */
  async exportMetadata(docIds) {
    const docs = docIds
      .map((id) => documentsStore.all.find((d) => d.docId === id))
      .filter(Boolean);

    if (docs.length === 0) return;

    const csv = generateMetadataCsv(docs);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const timestamp = new Date().toISOString().slice(0, 10);
    triggerDownload(blob, `document_metadata_${timestamp}.csv`);
  },

  /**
   * Bulk change category for selected documents.
   *
   * @param {string[]} docIds - Document IDs
   * @param {string} category - New category
   * @returns {Object} Report with successful and failed counts
   */
  async bulkChangeCategory(docIds, category) {
    const results = { successful: 0, failed: 0, total: docIds.length };
    const all = documentsStore.all;

    for (const docId of docIds) {
      const idx = all.findIndex((d) => d.docId === docId);
      if (idx === -1) { results.failed++; continue; }
      all[idx] = {
        ...all[idx],
        category: category || '',
        updatedAt: new Date().toISOString()
      };
      results.successful++;
    }

    documentsStore.persist(all);
    return results;
  },

  /**
   * Bulk add tags to selected documents.
   *
   * @param {string[]} docIds - Document IDs
   * @param {string[]} tags - Tags to add
   * @returns {Object} Report with successful and failed counts
   */
  async bulkAddTags(docIds, tags) {
    const results = { successful: 0, failed: 0, total: docIds.length };
    const all = documentsStore.all;
    const newTags = Array.isArray(tags) ? tags : String(tags || '').split(',').map((t) => t.trim()).filter(Boolean);

    for (const docId of docIds) {
      const idx = all.findIndex((d) => d.docId === docId);
      if (idx === -1) { results.failed++; continue; }
      const existingTags = Array.isArray(all[idx].tags) ? all[idx].tags : [];
      const merged = [...new Set([...existingTags, ...newTags])];
      all[idx] = {
        ...all[idx],
        tags: merged,
        updatedAt: new Date().toISOString()
      };
      results.successful++;
    }

    documentsStore.persist(all);
    return results;
  },

  /**
   * Bulk archive selected documents.
   *
   * @param {string[]} docIds - Document IDs
   * @returns {Object} Report with successful and failed counts
   */
  async bulkArchive(docIds) {
    const results = { successful: 0, failed: 0, total: docIds.length };
    const all = documentsStore.all;

    for (const docId of docIds) {
      const idx = all.findIndex((d) => d.docId === docId);
      if (idx === -1 || all[idx].recordState === 'archived') { results.failed++; continue; }
      all[idx] = {
        ...all[idx],
        recordState: 'archived',
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      results.successful++;
    }

    documentsStore.persist(all);
    return results;
  },

  /**
   * Bulk delete (soft) selected documents.
   *
   * @param {string[]} docIds - Document IDs
   * @returns {Object} Report with successful and failed counts
   */
  async bulkDelete(docIds) {
    const results = { successful: 0, failed: 0, total: docIds.length };
    const all = documentsStore.all;

    for (const docId of docIds) {
      const idx = all.findIndex((d) => d.docId === docId);
      if (idx === -1 || all[idx].recordState === 'deleted') { results.failed++; continue; }
      all[idx] = {
        ...all[idx],
        recordState: 'deleted',
        updatedAt: new Date().toISOString()
      };
      results.successful++;
    }

    documentsStore.persist(all);
    return results;
  },

  /** Expose the filename builder for testing. */
  buildFilename
};
