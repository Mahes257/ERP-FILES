/**
 * purchase/services/documentPermissions.test.js
 * ------------------------------------------------------------------
 * Authorization tests for each document permission.
 *
 * Tests role-based access (ADMIN, MANAGER, USER, VIEWER),
 * confidential document handling, ownership checks,
 * permission resolution, and UI sanitization.
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { documentPermissionsService, DOCUMENT_PERMISSIONS } from './documentPermissions';

/* ─── Mocks ─── */
const mockUser = { fullName: 'Test User', email: 'test@example.com', role: 'ADMIN' };

vi.mock('../../services/authService', () => ({
  getStoredUser: () => mockUser
}));

vi.mock('./api-client', () => ({
  getCurrentActor: () => ({ id: 'user-001', name: 'Test User', email: 'test@example.com', role: 'ADMIN' })
}));

/* ─── Helpers ─── */
function createTestDoc(overrides = {}) {
  return {
    docId: 'DOC-TEST-001',
    name: 'Test Document.pdf',
    docNo: 'DOC-001',
    stage: 'Purchase Order',
    vendor: 'Test Vendor',
    uploadedBy: 'Test User',
    version: 1,
    recordState: 'active',
    confidential: false,
    sourceUrl: 'data:application/pdf;base64,dGVzdA==',
    ...overrides
  };
}

function setRole(role) {
  mockUser.role = role;
  mockUser.permissions = undefined;
}

function setPermissions(permissions) {
  mockUser.role = undefined;
  mockUser.permissions = permissions;
}

/* ═══════════════════════════════════════════════════════════════════
   Tests
   ═══════════════════════════════════════════════════════════════════ */

describe('documentPermissionsService', () => {
  beforeEach(() => {
    setRole('ADMIN');
  });

  /* ─── Permission Constants ─── */
  describe('DOCUMENT_PERMISSIONS', () => {
    it('defines all 10 permissions', () => {
      expect(Object.keys(DOCUMENT_PERMISSIONS)).toHaveLength(10);
    });

    it('includes VIEW and DOWNLOAD', () => {
      expect(DOCUMENT_PERMISSIONS.VIEW).toBe('DOCUMENT_VIEW');
      expect(DOCUMENT_PERMISSIONS.DOWNLOAD).toBe('DOCUMENT_DOWNLOAD');
    });
  });

  /* ─── Role-Based Access ─── */
  describe('role-based access', () => {
    it('ADMIN has all permissions', () => {
      setRole('ADMIN');
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toContain(DOCUMENT_PERMISSIONS.VIEW);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.UPLOAD);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.DOWNLOAD);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.PRINT);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.EDIT_METADATA);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.CREATE_VERSION);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.ARCHIVE);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.DELETE);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.RESTORE);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.MANAGE_CONFIDENTIAL);
    });

    it('MANAGER has all permissions', () => {
      setRole('MANAGER');
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toContain(DOCUMENT_PERMISSIONS.DELETE);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.MANAGE_CONFIDENTIAL);
    });

    it('USER has view/upload/download/print/edit but not delete/archive/version/restore', () => {
      setRole('USER');
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toContain(DOCUMENT_PERMISSIONS.VIEW);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.UPLOAD);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.DOWNLOAD);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.PRINT);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.EDIT_METADATA);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.CREATE_VERSION);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.ARCHIVE);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.DELETE);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.RESTORE);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.MANAGE_CONFIDENTIAL);
    });

    it('VIEWER has only view/download/print', () => {
      setRole('VIEWER');
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toContain(DOCUMENT_PERMISSIONS.VIEW);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.DOWNLOAD);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.PRINT);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.UPLOAD);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.EDIT_METADATA);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.DELETE);
    });

    it('unknown role gets default permissions (view + download)', () => {
      setRole('UNKNOWN_ROLE');
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toContain(DOCUMENT_PERMISSIONS.VIEW);
      expect(perms).toContain(DOCUMENT_PERMISSIONS.DOWNLOAD);
      expect(perms).not.toContain(DOCUMENT_PERMISSIONS.DELETE);
    });
  });

  /* ─── Explicit Permissions Array ─── */
  describe('explicit permissions array', () => {
    it('uses explicit permissions over role', () => {
      setPermissions([DOCUMENT_PERMISSIONS.VIEW, DOCUMENT_PERMISSIONS.DELETE]);
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toEqual([DOCUMENT_PERMISSIONS.VIEW, DOCUMENT_PERMISSIONS.DELETE]);
    });

    it('empty permissions array falls back to role', () => {
      setPermissions([]);
      const perms = documentPermissionsService.getCurrentPermissions();
      expect(perms).toContain(DOCUMENT_PERMISSIONS.VIEW);
    });
  });

  /* ─── hasPermission / hasAllPermissions / hasAnyPermission ─── */
  describe('permission checks', () => {
    it('hasPermission returns true for granted permission', () => {
      setRole('ADMIN');
      expect(documentPermissionsService.hasPermission(DOCUMENT_PERMISSIONS.VIEW)).toBe(true);
    });

    it('hasPermission returns false for denied permission', () => {
      setRole('VIEWER');
      expect(documentPermissionsService.hasPermission(DOCUMENT_PERMISSIONS.DELETE)).toBe(false);
    });

    it('hasAllPermissions returns true when all granted', () => {
      setRole('ADMIN');
      expect(documentPermissionsService.hasAllPermissions([
        DOCUMENT_PERMISSIONS.VIEW, DOCUMENT_PERMISSIONS.DOWNLOAD
      ])).toBe(true);
    });

    it('hasAllPermissions returns false when any missing', () => {
      setRole('USER');
      expect(documentPermissionsService.hasAllPermissions([
        DOCUMENT_PERMISSIONS.VIEW, DOCUMENT_PERMISSIONS.DELETE
      ])).toBe(false);
    });

    it('hasAnyPermission returns true when at least one granted', () => {
      setRole('VIEWER');
      expect(documentPermissionsService.hasAnyPermission([
        DOCUMENT_PERMISSIONS.DELETE, DOCUMENT_PERMISSIONS.VIEW
      ])).toBe(true);
    });

    it('hasAnyPermission returns false when none granted', () => {
      setRole('VIEWER');
      expect(documentPermissionsService.hasAnyPermission([
        DOCUMENT_PERMISSIONS.DELETE, DOCUMENT_PERMISSIONS.ARCHIVE
      ])).toBe(false);
    });
  });

  /* ─── Document-Level Permissions ─── */
  describe('getDocumentPermissions', () => {
    it('returns full permissions for ADMIN on normal document', () => {
      setRole('ADMIN');
      const doc = createTestDoc();
      const perms = documentPermissionsService.getDocumentPermissions(doc);
      expect(perms.view).toBe(true);
      expect(perms.download).toBe(true);
      expect(perms.delete).toBe(true);
      expect(perms.archive).toBe(true);
      expect(perms.manageConfidential).toBe(true);
    });

    it('restricts USER on document requiring CREATE_VERSION', () => {
      setRole('USER');
      const doc = createTestDoc();
      const perms = documentPermissionsService.getDocumentPermissions(doc);
      expect(perms.createVersion).toBe(false);
      expect(perms.archive).toBe(false);
      expect(perms.delete).toBe(false);
    });
  });

  /* ─── Confidential Documents ─── */
  describe('confidential documents', () => {
    it('ADMIN can access confidential documents', () => {
      setRole('ADMIN');
      const doc = createTestDoc({ confidential: true });
      const perms = documentPermissionsService.getDocumentPermissions(doc);
      expect(perms.view).toBe(true);
      expect(perms.download).toBe(true);
    });

    it('USER cannot download confidential documents (not owner)', () => {
      setRole('USER');
      const doc = createTestDoc({ confidential: true, uploadedBy: 'Other User' });
      const perms = documentPermissionsService.getDocumentPermissions(doc);
      expect(perms.view).toBe(true);
      expect(perms.download).toBe(false);
      expect(perms.print).toBe(false);
      expect(perms.editMetadata).toBe(false);
    });

    it('owner can always access their own confidential documents', () => {
      setRole('USER');
      const doc = createTestDoc({ confidential: true, uploadedBy: 'Test User' });
      const perms = documentPermissionsService.getDocumentPermissions(doc);
      expect(perms.download).toBe(true);
      expect(perms.print).toBe(true);
    });

    it('MANAGER with MANAGE_CONFIDENTIAL can access any confidential doc', () => {
      setRole('MANAGER');
      const doc = createTestDoc({ confidential: true, uploadedBy: 'Other User' });
      const perms = documentPermissionsService.getDocumentPermissions(doc);
      expect(perms.download).toBe(true);
    });
  });

  /* ─── canDownload / canPrint / canDelete / canArchive ─── */
  describe('action-specific checks', () => {
    it('canDownload allows when permitted', () => {
      setRole('ADMIN');
      const doc = createTestDoc();
      const result = documentPermissionsService.canDownload(doc);
      expect(result.allowed).toBe(true);
    });

    it('canDownload denies when no sourceUrl', () => {
      const doc = createTestDoc({ sourceUrl: '' });
      const result = documentPermissionsService.canDownload(doc);
      expect(result.allowed).toBe(false);
    });

    it('canDownload denies when null doc', () => {
      const result = documentPermissionsService.canDownload(null);
      expect(result.allowed).toBe(false);
    });

    it('canPrint allows when permitted', () => {
      setRole('ADMIN');
      const result = documentPermissionsService.canPrint(createTestDoc());
      expect(result.allowed).toBe(true);
    });

    it('canPrint denies for VIEWER', () => {
      setRole('VIEWER');
      // VIEWER actually has PRINT permission
      const result = documentPermissionsService.canPrint(createTestDoc());
      expect(result.allowed).toBe(true);
    });

    it('canDelete allows for ADMIN', () => {
      setRole('ADMIN');
      const result = documentPermissionsService.canDelete(createTestDoc());
      expect(result.allowed).toBe(true);
    });

    it('canDelete denies for USER', () => {
      setRole('USER');
      const result = documentPermissionsService.canDelete(createTestDoc());
      expect(result.allowed).toBe(false);
    });

    it('canArchive allows for ADMIN', () => {
      setRole('ADMIN');
      const result = documentPermissionsService.canArchive(createTestDoc());
      expect(result.allowed).toBe(true);
    });

    it('canArchive denies for VIEWER', () => {
      setRole('VIEWER');
      const result = documentPermissionsService.canArchive(createTestDoc());
      expect(result.allowed).toBe(false);
    });
  });

  /* ─── UI Sanitization ─── */
  describe('sanitizeForUI', () => {
    it('removes storagePath', () => {
      const doc = createTestDoc({ storagePath: '/internal/storage/file.pdf' });
      const safe = documentPermissionsService.sanitizeForUI(doc);
      expect(safe.storagePath).toBeUndefined();
    });

    it('removes internalUrl', () => {
      const doc = createTestDoc({ internalUrl: 'https://internal-bucket.s3/file' });
      const safe = documentPermissionsService.sanitizeForUI(doc);
      expect(safe.internalUrl).toBeUndefined();
    });

    it('removes _internalRef', () => {
      const doc = createTestDoc({ _internalRef: 'secret-ref' });
      const safe = documentPermissionsService.sanitizeForUI(doc);
      expect(safe._internalRef).toBeUndefined();
    });

    it('preserves data URLs in sourceUrl', () => {
      const doc = createTestDoc({ sourceUrl: 'data:application/pdf;base64,abc' });
      const safe = documentPermissionsService.sanitizeForUI(doc);
      expect(safe.sourceUrl).toBe('data:application/pdf;base64,abc');
    });

    it('hides non-data URLs from sourceUrl', () => {
      const doc = createTestDoc({ sourceUrl: '/internal/path/file.pdf' });
      const safe = documentPermissionsService.sanitizeForUI(doc);
      expect(safe.sourceUrl).toBe('');
    });

    it('returns null for null input', () => {
      expect(documentPermissionsService.sanitizeForUI(null)).toBeNull();
    });

    it('preserves safe fields', () => {
      const doc = createTestDoc({ name: 'Test.pdf', docNo: 'DOC-001', vendor: 'Vendor' });
      const safe = documentPermissionsService.sanitizeForUI(doc);
      expect(safe.name).toBe('Test.pdf');
      expect(safe.docNo).toBe('DOC-001');
      expect(safe.vendor).toBe('Vendor');
    });
  });

  /* ─── Helper methods ─── */
  describe('helper methods', () => {
    it('isConfidential returns true for confidential docs', () => {
      expect(documentPermissionsService.isConfidential(createTestDoc({ confidential: true }))).toBe(true);
    });

    it('isConfidential returns false for non-confidential docs', () => {
      expect(documentPermissionsService.isConfidential(createTestDoc())).toBe(false);
    });

    it('isOwner returns true when user uploaded the document', () => {
      expect(documentPermissionsService.isOwner(createTestDoc({ uploadedBy: 'Test User' }))).toBe(true);
    });

    it('isOwner returns false when another user uploaded it', () => {
      expect(documentPermissionsService.isOwner(createTestDoc({ uploadedBy: 'Other User' }))).toBe(false);
    });

    it('getCurrentRole returns the role string', () => {
      setRole('ADMIN');
      expect(documentPermissionsService.getCurrentRole()).toBe('ADMIN');
    });

    it('getCurrentActor returns the actor object', () => {
      const actor = documentPermissionsService.getCurrentActor();
      expect(actor.name).toBe('Test User');
      expect(actor.email).toBe('test@example.com');
    });
  });
});
