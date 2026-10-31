/**
 * purchase/services/documentOperations.test.js
 * ------------------------------------------------------------------
 * Comprehensive tests for the document operations service.
 *
 * Tests: rename, description, tags, category, archive, restore,
 * replace, createVersion, PDF page operations availability,
 * confirmation messages, and bulk operations.
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  documentOperationsService,
  PDF_PAGE_OPERATIONS,
  VERSION_CREATING_OPS,
  DESTRUCTIVE_OPS
} from './documentOperations';
import { documentsStore } from './documents';

/* ─── Mocks ─── */
vi.mock('./api-client', () => ({
  getCurrentActor: () => ({ name: 'Test User', role: 'admin' }),
  withFallback: (_apiCall, mockCall) => mockCall(),
  // The facade asks whether it is in API mode while wiring itself up; this
  // suite drives the local/store path, and the partial mock must answer that
  // question or module initialisation throws before any test runs.
  isApiMode: () => false
}));

vi.mock('./base', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    delay: () => Promise.resolve()
  };
});

/* Mock FileReader for upload tests */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class {
    readAsDataURL() {
      setTimeout(() => {
        this.result = 'data:application/pdf;base64,dGVzdA==';
        this.onload?.();
      }, 0);
    }
  };
}

/* ─── Helpers ─── */
function createTestDoc(overrides = {}) {
  return {
    docId: 'DOC-TEST-001',
    name: 'Test Document.pdf',
    docType: 'Attachment',
    docNo: 'DOC-001',
    stage: 'Purchase Order',
    prNo: '',
    rfqNo: '',
    poNo: 'PO-2026-001',
    vendor: 'Test Vendor',
    uploadedBy: 'Test User',
    uploadedAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    fileType: 'PDF',
    fileSize: 1024,
    fileSizeLabel: '1 KB',
    source: 'Attachment',
    sourceUrl: 'data:application/pdf;base64,test',
    sourceType: 'pdf',
    sourceId: 'src-001',
    sourceLabel: 'Test Document.pdf',
    version: 1,
    status: 'Final',
    folder: 'PO',
    recordState: 'active',
    category: '',
    description: '',
    tags: [],
    confidential: false,
    audit: [],
    ...overrides
  };
}

function seedStore(docs) {
  documentsStore.persist(docs);
}

/* ═══════════════════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════════════════ */

describe('documentOperationsService', () => {
  beforeEach(() => {
    seedStore([]);
  });

  /* ─── Rename ─── */
  describe('rename', () => {
    it('renames a document successfully', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.rename(doc.docId, 'New Name.pdf');

      expect(result.name).toBe('New Name.pdf');
      expect(result.updatedAt).toBeTruthy();
    });

    it('trims whitespace from new name', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.rename(doc.docId, '  Trimmed Name.pdf  ');
      expect(result.name).toBe('Trimmed Name.pdf');
    });

    it('throws on empty name', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      await expect(documentOperationsService.rename(doc.docId, '')).rejects.toThrow('Name cannot be empty');
    });

    it('throws on whitespace-only name', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      await expect(documentOperationsService.rename(doc.docId, '   ')).rejects.toThrow('Name cannot be empty');
    });

    it('throws for non-existent document', async () => {
      await expect(documentOperationsService.rename('DOES-NOT-EXIST', 'Name')).rejects.toThrow('Document not found');
    });

    it('adds audit entry', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.rename(doc.docId, 'Renamed.pdf');
      expect(result.audit).toBeDefined();
      expect(result.audit.length).toBe(1);
      expect(result.audit[0].action).toBe('Edited');
      expect(result.audit[0].details).toContain('Renamed from');
    });
  });

  /* ─── Description ─── */
  describe('updateDescription', () => {
    it('sets description on a document', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateDescription(doc.docId, 'This is a test description');
      expect(result.description).toBe('This is a test description');
    });

    it('clears description when empty string provided', async () => {
      const doc = createTestDoc({ description: 'Old description' });
      seedStore([doc]);

      const result = await documentOperationsService.updateDescription(doc.docId, '');
      expect(result.description).toBe('');
    });

    it('throws for non-existent document', async () => {
      await expect(documentOperationsService.updateDescription('DOES-NOT-EXIST', 'desc')).rejects.toThrow('Document not found');
    });

    it('adds audit entry', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateDescription(doc.docId, 'desc');
      expect(result.audit.length).toBe(1);
      expect(result.audit[0].action).toBe('Edited');
      expect(result.audit[0].details).toBe('Description updated');
    });
  });

  /* ─── Tags ─── */
  describe('updateTags', () => {
    it('sets tags from string', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateTags(doc.docId, 'urgent, review, final');
      expect(result.tags).toEqual(['urgent', 'review', 'final']);
    });

    it('sets tags from array', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateTags(doc.docId, ['tag1', 'tag2']);
      expect(result.tags).toEqual(['tag1', 'tag2']);
    });

    it('trims whitespace from tags', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateTags(doc.docId, '  tag1 ,  tag2  ');
      expect(result.tags).toEqual(['tag1', 'tag2']);
    });

    it('filters empty tags', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateTags(doc.docId, 'tag1,,tag2,,');
      expect(result.tags).toEqual(['tag1', 'tag2']);
    });

    it('clears all tags with empty string', async () => {
      const doc = createTestDoc({ tags: ['old'] });
      seedStore([doc]);

      const result = await documentOperationsService.updateTags(doc.docId, '');
      expect(result.tags).toEqual([]);
    });

    it('adds audit entry', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.updateTags(doc.docId, 'tag1');
      expect(result.audit.length).toBe(1);
      expect(result.audit[0].action).toBe('Edited');
      expect(result.audit[0].details).toContain('Tags updated');
    });
  });

  /* ─── Category ─── */
  describe('changeCategory', () => {
    it('changes category', async () => {
      const doc = createTestDoc({ category: 'Technical' });
      seedStore([doc]);

      const result = await documentOperationsService.changeCategory(doc.docId, 'Commercial');
      expect(result.category).toBe('Commercial');
    });

    it('clears category with empty string', async () => {
      const doc = createTestDoc({ category: 'Old' });
      seedStore([doc]);

      const result = await documentOperationsService.changeCategory(doc.docId, '');
      expect(result.category).toBe('');
    });

    it('adds audit entry with old and new category', async () => {
      const doc = createTestDoc({ category: 'Technical' });
      seedStore([doc]);

      const result = await documentOperationsService.changeCategory(doc.docId, 'Legal');
      expect(result.audit[0].details).toContain('Technical');
      expect(result.audit[0].details).toContain('Legal');
    });
  });

  /* ─── Create New Version ─── */
  describe('createNewVersion', () => {
    it('increments version number', async () => {
      const doc = createTestDoc({ version: 2 });
      seedStore([doc]);

      const result = await documentOperationsService.createNewVersion(doc.docId, { changeReason: 'Test' });
      expect(result.version).toBe(3);
    });

    it('creates version 1 from initial document', async () => {
      const doc = createTestDoc({ version: 1 });
      seedStore([doc]);

      const result = await documentOperationsService.createNewVersion(doc.docId);
      expect(result.version).toBe(2);
    });

    it('preserves sourceUrl if not provided', async () => {
      const doc = createTestDoc({ sourceUrl: 'data:original' });
      seedStore([doc]);

      const result = await documentOperationsService.createNewVersion(doc.docId, {});
      expect(result.sourceUrl).toBe('data:original');
    });

    it('updates sourceUrl if provided', async () => {
      const doc = createTestDoc({ sourceUrl: 'data:old' });
      seedStore([doc]);

      const result = await documentOperationsService.createNewVersion(doc.docId, { sourceUrl: 'data:new' });
      expect(result.sourceUrl).toBe('data:new');
    });

    it('adds audit entry', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.createNewVersion(doc.docId, { changeReason: 'Test reason' });
      expect(result.audit.length).toBe(1);
      expect(result.audit[0].details).toContain('New version');
      expect(result.audit[0].details).toContain('Test reason');
    });
  });

  /* ─── Archive ─── */
  describe('archive', () => {
    it('archives a document', async () => {
      const doc = createTestDoc({ recordState: 'active' });
      seedStore([doc]);

      const result = await documentOperationsService.archive(doc.docId);
      expect(result.recordState).toBe('archived');
      expect(result.archivedAt).toBeTruthy();
    });

    it('throws if already archived', async () => {
      const doc = createTestDoc({ recordState: 'archived' });
      seedStore([doc]);

      await expect(documentOperationsService.archive(doc.docId)).rejects.toThrow('already archived');
    });

    it('throws for non-existent document', async () => {
      await expect(documentOperationsService.archive('DOES-NOT-EXIST')).rejects.toThrow('Document not found');
    });

    it('adds audit entry', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      const result = await documentOperationsService.archive(doc.docId);
      expect(result.audit.length).toBe(1);
      expect(result.audit[0].details).toBe('Archived');
    });
  });

  /* ─── Restore ─── */
  describe('restore', () => {
    it('restores an archived document', async () => {
      const doc = createTestDoc({ recordState: 'archived', archivedAt: '2026-01-20T10:00:00Z' });
      seedStore([doc]);

      const result = await documentOperationsService.restore(doc.docId);
      expect(result.recordState).toBe('active');
      expect(result.archivedAt).toBeNull();
    });

    it('throws if document is not archived', async () => {
      const doc = createTestDoc({ recordState: 'active' });
      seedStore([doc]);

      await expect(documentOperationsService.restore(doc.docId)).rejects.toThrow('not archived');
    });

    it('adds audit entry', async () => {
      const doc = createTestDoc({ recordState: 'archived' });
      seedStore([doc]);

      const result = await documentOperationsService.restore(doc.docId);
      expect(result.audit.length).toBe(1);
      expect(result.audit[0].details).toContain('Restored from archive');
    });
  });

  /* ─── Upload Replacement ─── */
  describe('uploadReplacement', () => {
    it('replaces file and increments version', async () => {
      const doc = createTestDoc({ version: 1 });
      seedStore([doc]);

      const file = new File(['test content'], 'replacement.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'size', { value: 1024 });

      const result = await documentOperationsService.uploadReplacement(doc.docId, file, { changeReason: 'Updated file' });
      expect(result.version).toBe(2);
      expect(result.name).toBe('replacement.pdf');
      expect(result.fileSize).toBe(1024);
    });

    it('throws for non-existent document', async () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      await expect(documentOperationsService.uploadReplacement('DOES-NOT-EXIST', file)).rejects.toThrow('Document not found');
    });
  });

  /* ─── Bulk Operations ─── */
  describe('bulkArchive', () => {
    it('archives multiple documents', async () => {
      const docs = [
        createTestDoc({ docId: 'DOC-1', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-2', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-3', recordState: 'active' })
      ];
      seedStore(docs);

      const result = await documentOperationsService.bulkArchive(['DOC-1', 'DOC-2', 'DOC-3']);
      expect(result.archived).toBe(3);

      const store = documentsStore.all;
      expect(store.every((d) => d.recordState === 'archived')).toBe(true);
    });

    it('skips non-existent documents gracefully', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1' })]);

      const result = await documentOperationsService.bulkArchive(['DOC-1', 'DOES-NOT-EXIST']);
      expect(result.archived).toBe(1);
    });
  });

  describe('bulkRestore', () => {
    it('restores multiple archived documents', async () => {
      const docs = [
        createTestDoc({ docId: 'DOC-1', recordState: 'archived' }),
        createTestDoc({ docId: 'DOC-2', recordState: 'archived' })
      ];
      seedStore(docs);

      const result = await documentOperationsService.bulkRestore(['DOC-1', 'DOC-2']);
      expect(result.restored).toBe(2);

      const store = documentsStore.all;
      expect(store.every((d) => d.recordState === 'active')).toBe(true);
    });
  });

  /* ─── PDF Page Operations ─── */
  describe('PDF page operations', () => {
    it('returns unavailable for reorder operation', () => {
      const status = documentOperationsService.getPdfPageOperationStatus('reorder');
      expect(status.available).toBe(false);
      expect(status.requiresBackend).toBe(true);
      expect(status.operation).toBe('Reorder Pages');
    });

    it('returns unavailable for rotate_selected operation', () => {
      const status = documentOperationsService.getPdfPageOperationStatus('rotate_selected');
      expect(status.available).toBe(false);
      expect(status.requiresBackend).toBe(true);
    });

    it('returns unavailable for delete_selected operation', () => {
      const status = documentOperationsService.getPdfPageOperationStatus('delete_selected');
      expect(status.available).toBe(false);
      expect(status.requiresBackend).toBe(true);
    });

    it('returns unavailable for merge operation', () => {
      const status = documentOperationsService.getPdfPageOperationStatus('merge');
      expect(status.available).toBe(false);
      expect(status.requiresBackend).toBe(true);
    });

    it('returns unavailable for split operation', () => {
      const status = documentOperationsService.getPdfPageOperationStatus('split');
      expect(status.available).toBe(false);
      expect(status.requiresBackend).toBe(true);
    });

    it('returns unavailable for unknown operation', () => {
      const status = documentOperationsService.getPdfPageOperationStatus('unknown');
      expect(status.available).toBe(false);
      expect(status.reason).toBe('Unknown operation');
    });

    it('returns availability map for all operations', () => {
      const availability = documentOperationsService.getPdfOperationsAvailability();
      expect(Object.keys(availability)).toHaveLength(5);
      for (const key of Object.keys(PDF_PAGE_OPERATIONS)) {
        const op = PDF_PAGE_OPERATIONS[key];
        expect(availability[op.key]).toBeDefined();
        expect(availability[op.key].available).toBe(false);
      }
    });
  });

  /* ─── Confirmation Messages ─── */
  describe('getConfirmationMessage', () => {
    it('returns archive confirmation message', () => {
      const doc = createTestDoc({ name: 'PO-001.pdf' });
      const msg = documentOperationsService.getConfirmationMessage('archive', doc);
      expect(msg).toContain('PO-001.pdf');
      expect(msg).toContain('Archive');
    });

    it('returns delete confirmation message', () => {
      const doc = createTestDoc({ name: 'Test.pdf' });
      const msg = documentOperationsService.getConfirmationMessage('delete', doc);
      expect(msg).toContain('Test.pdf');
      expect(msg).toContain('Permanently delete');
    });

    it('returns replace confirmation message with version info', () => {
      const doc = createTestDoc({ name: 'Doc.pdf', version: 3 });
      const msg = documentOperationsService.getConfirmationMessage('replace', doc);
      expect(msg).toContain('Doc.pdf');
      expect(msg).toContain('v4');
    });

    it('returns create_version confirmation message', () => {
      const doc = createTestDoc({ name: 'Doc.pdf', version: 2 });
      const msg = documentOperationsService.getConfirmationMessage('create_version', doc);
      expect(msg).toContain('Doc.pdf');
      expect(msg).toContain('new version');
    });

    it('returns restore confirmation message', () => {
      const doc = createTestDoc({ name: 'Archived.pdf' });
      const msg = documentOperationsService.getConfirmationMessage('restore', doc);
      expect(msg).toContain('Archived.pdf');
      expect(msg).toContain('Restore');
    });

    it('returns message for unknown operation', () => {
      const doc = createTestDoc({ name: 'Test.pdf' });
      const msg = documentOperationsService.getConfirmationMessage('unknown_op', doc);
      expect(msg).toContain('Test.pdf');
    });
  });

  /* ─── Constants ─── */
  describe('constants', () => {
    it('VERSION_CREATING_OPS contains expected operations', () => {
      expect(VERSION_CREATING_OPS.has('replace')).toBe(true);
      expect(VERSION_CREATING_OPS.has('restore')).toBe(true);
      expect(VERSION_CREATING_OPS.has('create_version')).toBe(true);
    });

    it('DESTRUCTIVE_OPS contains expected operations', () => {
      expect(DESTRUCTIVE_OPS.has('archive')).toBe(true);
      expect(DESTRUCTIVE_OPS.has('delete')).toBe(true);
      expect(DESTRUCTIVE_OPS.has('delete_page')).toBe(true);
      expect(DESTRUCTIVE_OPS.has('overwrite')).toBe(true);
    });

    it('PDF_PAGE_OPERATIONS has all 5 operations', () => {
      expect(Object.keys(PDF_PAGE_OPERATIONS)).toHaveLength(5);
    });

    it('all PDF operations require backend', () => {
      for (const op of Object.values(PDF_PAGE_OPERATIONS)) {
        expect(op.requiresBackend).toBe(true);
      }
    });
  });

  /* ─── Full Lifecycle ─── */
  describe('full lifecycle', () => {
    it('rename -> archive -> restore -> create version', async () => {
      const doc = createTestDoc({ version: 1, recordState: 'active' });
      seedStore([doc]);

      /* Step 1: Rename */
      let result = await documentOperationsService.rename(doc.docId, 'Renamed PO.pdf');
      expect(result.name).toBe('Renamed PO.pdf');

      /* Step 2: Archive */
      result = await documentOperationsService.archive(doc.docId);
      expect(result.recordState).toBe('archived');

      /* Step 3: Restore */
      result = await documentOperationsService.restore(doc.docId);
      expect(result.recordState).toBe('active');

      /* Step 4: Create new version */
      result = await documentOperationsService.createNewVersion(doc.docId, { changeReason: 'Updated content' });
      expect(result.version).toBe(2);

      /* Verify audit trail has all operations */
      const final = documentsStore.all.find((d) => d.docId === doc.docId);
      expect(final.audit.length).toBeGreaterThanOrEqual(3);
    });

    it('description -> tags -> category -> archive lifecycle', async () => {
      const doc = createTestDoc();
      seedStore([doc]);

      await documentOperationsService.updateDescription(doc.docId, 'Important PO document');
      await documentOperationsService.updateTags(doc.docId, ['urgent', 'finance']);
      await documentOperationsService.changeCategory(doc.docId, 'Commercial');
      const result = await documentOperationsService.archive(doc.docId);

      expect(result.description).toBe('Important PO document');
      expect(result.tags).toEqual(['urgent', 'finance']);
      expect(result.category).toBe('Commercial');
      expect(result.recordState).toBe('archived');
    });
  });
});
