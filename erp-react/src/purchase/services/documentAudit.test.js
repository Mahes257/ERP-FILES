/**
 * purchase/services/documentAudit.test.js
 * ------------------------------------------------------------------
 * Tests for the document audit trail service.
 *
 * Covers: recording, trail retrieval, stats, sanitization,
 * CSV export, and convenience methods.
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { documentAuditService, AUDIT_ACTIONS, resetAuditStore } from './documentAudit';

/* ─── Mocks ─── */
vi.mock('./api-client', () => ({
  getCurrentActor: () => ({ id: 'user-001', name: 'Test User', email: 'test@example.com', role: 'ADMIN' })
}));

vi.mock('./base', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    delay: () => Promise.resolve()
  };
});

/* ─── Helpers ─── */
function createTestDoc(overrides = {}) {
  return {
    docId: 'DOC-TEST-001',
    name: 'Test Document.pdf',
    docNo: 'DOC-001',
    stage: 'Purchase Order',
    vendor: 'Test Vendor',
    version: 1,
    recordState: 'active',
    ...overrides
  };
}

/* ═══════════════════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════════════════ */

describe('documentAuditService', () => {
  beforeEach(() => {
    resetAuditStore();
  });

  /* ─── Record ─── */
  describe('record', () => {
    it('creates an audit record with required fields', async () => {
      const doc = createTestDoc();
      const record = await documentAuditService.record('Viewed', { doc, source: 'ui' });

      expect(record.id).toBeTruthy();
      expect(record.timestamp).toBeTruthy();
      expect(record.user.name).toBe('Test User');
      expect(record.user.email).toBe('test@example.com');
      expect(record.action).toBe('Viewed');
      expect(record.document.docId).toBe('DOC-TEST-001');
      expect(record.document.name).toBe('Test Document.pdf');
      expect(record.source).toBe('ui');
      expect(record.result).toBe('success');
    });

    it('never exposes internal file paths', async () => {
      const doc = createTestDoc({
        storagePath: '/internal/secret/path',
        internalUrl: 'https://s3.internal/bucket/file',
        sourceUrl: 'data:pdf;base64,abc'
      });
      const record = await documentAuditService.record('Viewed', { doc });

      expect(record.document.storagePath).toBeUndefined();
      expect(record.document.internalUrl).toBeUndefined();
      expect(record.document.sourceUrl).toBeUndefined();
    });

    it('never exposes user password or token', async () => {
      const record = await documentAuditService.record('Viewed', {});

      expect(record.user.password).toBeUndefined();
      expect(record.user.token).toBeUndefined();
      expect(record.user.role).toBeUndefined();
      expect(record.user.permissions).toBeUndefined();
    });

    it('stores version', async () => {
      const doc = createTestDoc({ version: 3 });
      const record = await documentAuditService.record('Version Created', { doc, version: 3 });

      expect(record.version).toBe(3);
    });

    it('stores result', async () => {
      const record = await documentAuditService.record('Access Denied', { result: 'denied', details: 'No permission' });

      expect(record.result).toBe('denied');
      expect(record.details).toBe('No permission');
    });
  });

  /* ─── recordBulk ─── */
  describe('recordBulk', () => {
    it('creates multiple audit records', async () => {
      const docs = [
        createTestDoc({ docId: 'DOC-1', name: 'Doc 1.pdf' }),
        createTestDoc({ docId: 'DOC-2', name: 'Doc 2.pdf' })
      ];
      const records = await documentAuditService.recordBulk('Bulk Downloaded', docs, { source: 'bulk' });

      expect(records).toHaveLength(2);
      expect(records[0].document.docId).toBe('DOC-1');
      expect(records[1].document.docId).toBe('DOC-2');
    });
  });

  /* ─── getAuditTrail ─── */
  describe('getAuditTrail', () => {
    it('returns audit trail for a specific document', async () => {
      const doc = createTestDoc({ docId: 'DOC-1' });
      await documentAuditService.record('Viewed', { doc });
      /* Small delay to ensure different timestamps */
      await new Promise((r) => setTimeout(r, 15));
      await documentAuditService.record('Downloaded', { doc });

      const trail = await documentAuditService.getAuditTrail('DOC-1');
      expect(trail).toHaveLength(2);
      expect(trail[0].action).toBe('Downloaded');
      expect(trail[1].action).toBe('Viewed');
    });

    it('returns empty array for document with no audit', async () => {
      const trail = await documentAuditService.getAuditTrail('DOES-NOT-EXIST');
      expect(trail).toHaveLength(0);
    });

    it('respects limit parameter', async () => {
      const doc = createTestDoc();
      for (let i = 0; i < 10; i++) {
        await documentAuditService.record('Viewed', { doc });
      }
      const trail = await documentAuditService.getAuditTrail('DOC-TEST-001', { limit: 3 });
      expect(trail).toHaveLength(3);
    });
  });

  /* ─── getRecentAudit ─── */
  describe('getRecentAudit', () => {
    it('returns recent audit entries across all documents', async () => {
      await documentAuditService.record('Viewed', { doc: createTestDoc({ docId: 'DOC-1' }) });
      await documentAuditService.record('Downloaded', { doc: createTestDoc({ docId: 'DOC-2' }) });

      const recent = await documentAuditService.getRecentAudit();
      expect(recent.length).toBeGreaterThanOrEqual(2);
    });

    it('filters by action', async () => {
      await documentAuditService.record('Viewed', { doc: createTestDoc() });
      await documentAuditService.record('Downloaded', { doc: createTestDoc() });
      await documentAuditService.record('Viewed', { doc: createTestDoc() });

      const viewed = await documentAuditService.getRecentAudit({ action: 'Viewed' });
      expect(viewed.every((r) => r.action === 'Viewed')).toBe(true);
    });

    it('filters by user', async () => {
      await documentAuditService.record('Viewed', { doc: createTestDoc() });

      const results = await documentAuditService.getRecentAudit({ user: 'Test' });
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  /* ─── getAuditStats ─── */
  describe('getAuditStats', () => {
    it('returns aggregate statistics', async () => {
      await documentAuditService.record('Viewed', { doc: createTestDoc() });
      await documentAuditService.record('Downloaded', { doc: createTestDoc() });
      await documentAuditService.record('Viewed', { doc: createTestDoc() });

      const stats = await documentAuditService.getAuditStats();
      expect(stats.total).toBe(3);
      expect(stats.byAction['Viewed']).toBe(2);
      expect(stats.byAction['Downloaded']).toBe(1);
      expect(stats.byResult.success).toBe(3);
      expect(stats.lastActivity).toBeTruthy();
    });
  });

  /* ─── Convenience Methods ─── */
  describe('convenience methods', () => {
    it('recordView creates Viewed entry', async () => {
      const record = await documentAuditService.recordView(createTestDoc());
      expect(record.action).toBe('Viewed');
    });

    it('recordDownload creates Downloaded entry', async () => {
      const record = await documentAuditService.recordDownload(createTestDoc());
      expect(record.action).toBe('Downloaded');
    });

    it('recordUpload creates Uploaded entry', async () => {
      const record = await documentAuditService.recordUpload(createTestDoc({ version: 1 }));
      expect(record.action).toBe('Uploaded');
      expect(record.version).toBe(1);
    });

    it('recordPrint creates Printed entry', async () => {
      const record = await documentAuditService.recordPrint(createTestDoc());
      expect(record.action).toBe('Printed');
    });

    it('recordRename creates Renamed entry with details', async () => {
      const record = await documentAuditService.recordRename(createTestDoc(), 'Old Name', 'New Name');
      expect(record.action).toBe('Renamed');
      expect(record.details).toContain('Old Name');
      expect(record.details).toContain('New Name');
    });

    it('recordVersionCreated creates Version Created entry', async () => {
      const record = await documentAuditService.recordVersionCreated(createTestDoc(), 2);
      expect(record.action).toBe('Version Created');
      expect(record.version).toBe(2);
    });

    it('recordVersionRestored creates Version Restored entry', async () => {
      const record = await documentAuditService.recordVersionRestored(createTestDoc(), 1);
      expect(record.action).toBe('Version Restored');
      expect(record.details).toContain('1');
    });

    it('recordArchive creates Archived entry', async () => {
      const record = await documentAuditService.recordArchive(createTestDoc());
      expect(record.action).toBe('Archived');
    });

    it('recordDelete creates Deleted entry', async () => {
      const record = await documentAuditService.recordDelete(createTestDoc());
      expect(record.action).toBe('Deleted');
    });

    it('recordRestore creates Restored entry', async () => {
      const record = await documentAuditService.recordRestore(createTestDoc());
      expect(record.action).toBe('Restored');
    });

    it('recordAccessDenied creates Access Denied entry', async () => {
      const record = await documentAuditService.recordAccessDenied(createTestDoc(), 'No permission');
      expect(record.action).toBe('Access Denied');
      expect(record.result).toBe('denied');
    });

    it('recordConfidentialAccess creates Confidential Accessed entry', async () => {
      const record = await documentAuditService.recordConfidentialAccess(createTestDoc());
      expect(record.action).toBe('Confidential Accessed');
    });
  });

  /* ─── AUDIT_ACTIONS constant ─── */
  describe('AUDIT_ACTIONS', () => {
    it('defines all expected actions', () => {
      expect(AUDIT_ACTIONS.VIEWED).toBe('Viewed');
      expect(AUDIT_ACTIONS.DOWNLOADED).toBe('Downloaded');
      expect(AUDIT_ACTIONS.UPLOADED).toBe('Uploaded');
      expect(AUDIT_ACTIONS.PRINTED).toBe('Printed');
      expect(AUDIT_ACTIONS.RENAMED).toBe('Renamed');
      expect(AUDIT_ACTIONS.VERSION_CREATED).toBe('Version Created');
      expect(AUDIT_ACTIONS.VERSION_RESTORED).toBe('Version Restored');
      expect(AUDIT_ACTIONS.ARCHIVED).toBe('Archived');
      expect(AUDIT_ACTIONS.DELETED).toBe('Deleted');
      expect(AUDIT_ACTIONS.ACCESS_DENIED).toBe('Access Denied');
    });
  });
});
