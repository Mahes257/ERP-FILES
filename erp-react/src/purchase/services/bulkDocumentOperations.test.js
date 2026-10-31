/**
 * purchase/services/bulkDocumentOperations.test.js
 * ------------------------------------------------------------------
 * Tests for the bulk document operations service.
 *
 * Covers: ZIP download, export metadata, bulk category, bulk tags,
 * bulk archive, bulk delete, filename building, and progress reporting.
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ─── Hoisted mocks (visible inside vi.mock factories) ─── */
const { mockFile, mockGenerateAsync } = vi.hoisted(() => ({
  mockFile: vi.fn(),
  mockGenerateAsync: vi.fn()
}));

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

/* Use a regular function (not arrow) so it can be called with `new` */
vi.mock('jszip', () => {
  const JSZipMock = function () {
    return {
      file: mockFile,
      generateAsync: mockGenerateAsync.mockResolvedValue(
        new Blob(['zip-data'], { type: 'application/zip' })
      )
    };
  };
  return { default: JSZipMock };
});

vi.mock('../../utils/attachmentFile', () => ({
  formatSize: (s) => (s ? `${s} B` : '0 B'),
  detectType: () => 'pdf',
  fileTypeLabel: () => 'PDF'
}));

/* ─── Import after mocks ─── */
import { bulkDocumentOperationsService } from './bulkDocumentOperations';
import { documentsStore } from './documents';

/* ─── Helpers ─── */
function createTestDoc(overrides = {}) {
  return {
    docId: 'DOC-TEST-001',
    name: 'Test Document.pdf',
    docType: 'Attachment',
    docNo: 'DOC-001',
    stage: 'Purchase Order',
    vendor: 'Test Vendor',
    uploadedBy: 'Test User',
    uploadedAt: '2026-01-15T10:00:00Z',
    updatedAt: '2026-01-15T10:00:00Z',
    fileType: 'PDF',
    fileSize: 1024,
    fileSizeLabel: '1 KB',
    source: 'Attachment',
    sourceUrl: 'data:application/pdf;base64,dGVzdA==',
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

/* Stub browser globals not available in Node test env */
const mockAnchor = { href: '', download: '', click: vi.fn() };

describe('bulkDocumentOperationsService', () => {
  beforeEach(() => {
    seedStore([]);
    vi.clearAllMocks();
    mockAnchor.click.mockClear();
    vi.stubGlobal('document', {
      createElement: vi.fn(() => mockAnchor),
      body: {
        appendChild: vi.fn(),
        removeChild: vi.fn()
      }
    });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn()
    });
  });

  /* ─── buildFilename ─── */
  describe('buildFilename', () => {
    it('builds filename from docNo and name', () => {
      const doc = createTestDoc({ docNo: 'PO-2026-001', name: 'Purchase Order.pdf' });
      const filename = bulkDocumentOperationsService.buildFilename(doc);
      expect(filename).toBe('PO-2026-001_Purchase_Order.pdf');
    });

    it('uses sourceType as extension when name has no extension', () => {
      const doc = createTestDoc({ docNo: 'PR-001', name: 'No Extension', sourceType: 'pdf' });
      const filename = bulkDocumentOperationsService.buildFilename(doc);
      expect(filename).toBe('PR-001_No_Extension.pdf');
    });

    it('handles missing docNo', () => {
      const doc = createTestDoc({ docNo: '', name: 'File.pdf' });
      const filename = bulkDocumentOperationsService.buildFilename(doc);
      expect(filename).toContain('DOC');
      expect(filename).toContain('File.pdf');
    });

    it('handles missing name', () => {
      const doc = createTestDoc({ docNo: 'DOC-001', name: '' });
      const filename = bulkDocumentOperationsService.buildFilename(doc);
      expect(filename).toContain('DOC-001');
      expect(filename).toContain('untitled');
    });

    it('sanitizes special characters', () => {
      const doc = createTestDoc({ docNo: 'DOC/001', name: 'File (copy) [1].pdf' });
      const filename = bulkDocumentOperationsService.buildFilename(doc);
      expect(filename).not.toContain('/');
      expect(filename).not.toContain('(');
      expect(filename).not.toContain(')');
    });

    it('truncates long names', () => {
      const longName = 'A'.repeat(200) + '.pdf';
      const doc = createTestDoc({ docNo: 'DOC-001', name: longName });
      const filename = bulkDocumentOperationsService.buildFilename(doc);
      expect(filename.length).toBeLessThan(250);
    });
  });

  /* ─── bulkArchive ─── */
  describe('bulkArchive', () => {
    it('archives multiple documents', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-2', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-3', recordState: 'active' })
      ]);

      const result = await bulkDocumentOperationsService.bulkArchive(['DOC-1', 'DOC-2', 'DOC-3']);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(3);

      const store = documentsStore.all;
      expect(store.every((d) => d.recordState === 'archived')).toBe(true);
    });

    it('skips already archived documents', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-2', recordState: 'archived' })
      ]);

      const result = await bulkDocumentOperationsService.bulkArchive(['DOC-1', 'DOC-2']);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('skips non-existent documents', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1' })]);

      const result = await bulkDocumentOperationsService.bulkArchive(['DOC-1', 'DOES-NOT-EXIST']);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  /* ─── bulkDelete ─── */
  describe('bulkDelete', () => {
    it('soft-deletes multiple documents', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-2', recordState: 'active' })
      ]);

      const result = await bulkDocumentOperationsService.bulkDelete(['DOC-1', 'DOC-2']);
      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);

      const store = documentsStore.all;
      expect(store.every((d) => d.recordState === 'deleted')).toBe(true);
    });

    it('skips already deleted documents', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-2', recordState: 'deleted' })
      ]);

      const result = await bulkDocumentOperationsService.bulkDelete(['DOC-1', 'DOC-2']);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  /* ─── bulkChangeCategory ─── */
  describe('bulkChangeCategory', () => {
    it('sets category on multiple documents', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', category: '' }),
        createTestDoc({ docId: 'DOC-2', category: 'Old' })
      ]);

      const result = await bulkDocumentOperationsService.bulkChangeCategory(['DOC-1', 'DOC-2'], 'Commercial');
      expect(result.successful).toBe(2);

      const store = documentsStore.all;
      expect(store.every((d) => d.category === 'Commercial')).toBe(true);
    });

    it('clears category with empty string', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1', category: 'Technical' })]);

      const result = await bulkDocumentOperationsService.bulkChangeCategory(['DOC-1'], '');
      expect(result.successful).toBe(1);

      const doc = documentsStore.all.find((d) => d.docId === 'DOC-1');
      expect(doc.category).toBe('');
    });
  });

  /* ─── bulkAddTags ─── */
  describe('bulkAddTags', () => {
    it('adds tags to multiple documents', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', tags: ['existing'] }),
        createTestDoc({ docId: 'DOC-2', tags: [] })
      ]);

      const result = await bulkDocumentOperationsService.bulkAddTags(['DOC-1', 'DOC-2'], ['urgent', 'review']);
      expect(result.successful).toBe(2);

      const store = documentsStore.all;
      expect(store[0].tags).toContain('existing');
      expect(store[0].tags).toContain('urgent');
      expect(store[0].tags).toContain('review');
      expect(store[1].tags).toContain('urgent');
      expect(store[1].tags).toContain('review');
    });

    it('deduplicates tags', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1', tags: ['urgent'] })]);

      await bulkDocumentOperationsService.bulkAddTags(['DOC-1'], ['urgent', 'new']);

      const doc = documentsStore.all.find((d) => d.docId === 'DOC-1');
      const urgentCount = doc.tags.filter((t) => t === 'urgent').length;
      expect(urgentCount).toBe(1);
    });

    it('accepts comma-separated string', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1' })]);

      await bulkDocumentOperationsService.bulkAddTags(['DOC-1'], 'tag1, tag2, tag3');
      const doc = documentsStore.all.find((d) => d.docId === 'DOC-1');
      expect(doc.tags).toEqual(['tag1', 'tag2', 'tag3']);
    });
  });

  /* ─── bulkDownloadZip ─── */
  describe('bulkDownloadZip', () => {
    it('creates ZIP with available files', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', docNo: 'PO-001', name: 'PO.pdf', sourceUrl: 'data:application/pdf;base64,abc' }),
        createTestDoc({ docId: 'DOC-2', docNo: 'PR-002', name: 'PR.pdf', sourceUrl: 'data:application/pdf;base64,def' })
      ]);

      const onProgress = vi.fn();
      const report = await bulkDocumentOperationsService.bulkDownloadZip(['DOC-1', 'DOC-2'], onProgress);

      expect(report.successful).toHaveLength(2);
      expect(report.failed).toHaveLength(0);
      expect(report.missing).toHaveLength(0);
      expect(mockFile).toHaveBeenCalledTimes(2);
      expect(mockGenerateAsync).toHaveBeenCalled();
    });

    it('skips documents with no sourceUrl', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', sourceUrl: 'data:application/pdf;base64,abc' }),
        createTestDoc({ docId: 'DOC-2', sourceUrl: '' })
      ]);

      const report = await bulkDocumentOperationsService.bulkDownloadZip(['DOC-1', 'DOC-2']);

      expect(report.successful).toHaveLength(1);
      expect(report.missing).toHaveLength(1);
      expect(report.missing[0].reason).toContain('No file content');
    });

    it('skips non-existent documents', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1' })]);

      const report = await bulkDocumentOperationsService.bulkDownloadZip(['DOC-1', 'DOES-NOT-EXIST']);

      expect(report.successful).toHaveLength(1);
      expect(report.missing).toHaveLength(1);
    });

    it('calls onProgress with correct arguments', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1', sourceUrl: 'data:application/pdf;base64,abc' })]);

      const onProgress = vi.fn();
      await bulkDocumentOperationsService.bulkDownloadZip(['DOC-1'], onProgress);

      expect(onProgress).toHaveBeenCalledWith(1, 1, 'processing');
      expect(onProgress).toHaveBeenCalledWith(1, 1, 'success');
      expect(onProgress).toHaveBeenCalledWith(1, 1, 'complete');
    });

    it('reports failures for corrupt data URLs', async () => {
      seedStore([createTestDoc({ docId: 'DOC-1', sourceUrl: 'not-a-data-url' })]);

      const report = await bulkDocumentOperationsService.bulkDownloadZip(['DOC-1']);

      expect(report.failed).toHaveLength(1);
      expect(report.failed[0].reason).toContain('Could not convert');
    });

    it('reports progress for each file', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', sourceUrl: 'data:pdf;base64,a' }),
        createTestDoc({ docId: 'DOC-2', sourceUrl: 'data:pdf;base64,b' }),
        createTestDoc({ docId: 'DOC-3', sourceUrl: '' })
      ]);

      const onProgress = vi.fn();
      await bulkDocumentOperationsService.bulkDownloadZip(['DOC-1', 'DOC-2', 'DOC-3'], onProgress);

      const calls = onProgress.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(4);
    });
  });

  /* ─── exportMetadata ─── */
  describe('exportMetadata', () => {
    it('finds documents in store for export', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', name: 'PO.pdf', vendor: 'Vendor A' }),
        createTestDoc({ docId: 'DOC-2', name: 'PR.pdf', vendor: 'Vendor B' })
      ]);

      const allDocs = documentsStore.all.filter((d) =>
        ['DOC-1', 'DOC-2'].includes(d.docId)
      );
      expect(allDocs).toHaveLength(2);
      expect(allDocs[0].vendor).toBe('Vendor A');
      expect(allDocs[1].vendor).toBe('Vendor B');
    });
  });

  /* ─── Full lifecycle ─── */
  describe('full lifecycle', () => {
    it('archive -> add tags -> change category -> delete', async () => {
      seedStore([
        createTestDoc({ docId: 'DOC-1', tags: [], category: '', recordState: 'active' }),
        createTestDoc({ docId: 'DOC-2', tags: ['old'], category: 'Old', recordState: 'active' })
      ]);

      let result = await bulkDocumentOperationsService.bulkArchive(['DOC-1']);
      expect(result.successful).toBe(1);

      result = await bulkDocumentOperationsService.bulkAddTags(['DOC-1', 'DOC-2'], ['finance', 'approved']);
      expect(result.successful).toBe(2);

      result = await bulkDocumentOperationsService.bulkChangeCategory(['DOC-1', 'DOC-2'], 'Commercial');
      expect(result.successful).toBe(2);

      result = await bulkDocumentOperationsService.bulkDelete(['DOC-1', 'DOC-2']);
      expect(result.successful).toBe(2);

      const store = documentsStore.all;
      expect(store.find((d) => d.docId === 'DOC-1').recordState).toBe('deleted');
      expect(store.find((d) => d.docId === 'DOC-1').tags).toContain('finance');
      expect(store.find((d) => d.docId === 'DOC-1').category).toBe('Commercial');
      expect(store.find((d) => d.docId === 'DOC-2').recordState).toBe('deleted');
    });
  });
});
