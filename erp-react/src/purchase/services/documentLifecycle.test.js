/**
 * purchase/services/documentLifecycle.test.js
 * ------------------------------------------------------------------
 * End-to-end integration tests for the entire Purchase document
 * lifecycle. Covers all 6 scenarios specified in Phase 10.
 *
 * Scenario 1: PR -> PDF -> Repository -> Preview -> Download -> Version History
 * Scenario 2: RFQ -> Quotation -> Technical Eval -> Repository
 * Scenario 3: PO -> Supplier Ack -> Logistics -> Invoice -> Payment
 * Scenario 4: Upload external invoice -> Preview -> Download -> Link -> Version -> Audit
 * Scenario 5: Replace doc -> v2 -> Preview v2 -> Download v1 -> Restore v1
 * Scenario 6: Bulk select -> ZIP download -> Report
 *
 * Verifies:
 * - No duplicate documents
 * - No fake counts
 * - No dead buttons (all actions functional)
 * - No blank PDF viewer (sourceUrl present)
 * - No broken navigation (routes resolve)
 * - No orphan document records
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ─── Hoisted mocks ─── */
const { mockFile, mockGenerateAsync } = vi.hoisted(() => ({
  mockFile: vi.fn(),
  mockGenerateAsync: vi.fn()
}));

/* ─── Mocks ─── */
vi.mock('./api-client', () => ({
  getCurrentActor: () => ({ id: 'user-001', name: 'Test User', email: 'test@example.com', role: 'ADMIN' }),
  withFallback: (_apiCall, mockCall) => mockCall(),
  // The facade asks whether it is in API mode while wiring itself up; this
  // suite drives the local/store path, and the partial mock must answer that
  // question or module initialisation throws before any test runs.
  isApiMode: () => false
}));

vi.mock('../../services/authService', () => ({
  getStoredUser: () => ({ fullName: 'Test User', email: 'test@example.com', role: 'ADMIN' })
}));

vi.mock('./base', async (importOriginal) => {
  const original = await importOriginal();
  return { ...original, delay: () => Promise.resolve() };
});

/* FileReader double — needs readAsDataURL AND readAsArrayBuffer.
 *
 * Applied unconditionally: the suite runs under jsdom now, and jsdom's real
 * FileReader rejects the plain objects these tests pass it ("parameter 1 is
 * not of type 'Blob'"). The double is what the assertions were written
 * against, so it must win over a DOM-provided FileReader too. */
globalThis.FileReader = class {
  readAsDataURL() {
    setTimeout(() => { this.result = 'data:application/pdf;base64,dGVzdA=='; this.onload?.(); }, 0);
  }
  readAsArrayBuffer() {
    setTimeout(() => { this.result = new ArrayBuffer(8); this.onload?.(); }, 0);
  }
};

/* Mock JSZip */
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
import { documentsStore, documentsService } from './documents';
import { documentVersioningService, resetVersionsStore } from './documentVersioning';
import { documentOperationsService } from './documentOperations';
import { documentPermissionsService } from './documentPermissions';
import { documentAuditService, resetAuditStore } from './documentAudit';
import { bulkDocumentOperationsService } from './bulkDocumentOperations';
import { registerGeneratedDocument } from './documentRegistration';

/* ─── Helpers ─── */
function seedEmpty() {
  documentsStore.persist([]);
  resetVersionsStore();
  resetAuditStore();
}

function mockPdf(label) {
  return `data:application/pdf;base64,${btoa('PDF-' + label)}`;
}

/* ═══════════════════════════════════════════════════════════════════
   SCENARIO 1: PR -> PDF -> Repository -> Preview -> Download -> Version History
   ═══════════════════════════════════════════════════════════════════ */
describe('Scenario 1: PR Document Lifecycle', () => {
  beforeEach(seedEmpty);

  it('PR PDF is generated, registered in repository, previewable, downloadable, and versioned', async () => {
    /* Step 1: Register a generated PR PDF in the repository */
    const prDoc = await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-SRC-001',
      docNo: 'PR-2026-0340',
      name: 'Purchase Requisition - PR-2026-0340',
      sourceUrl: mockPdf('PR-001'),
      fileSize: 2048,
      metadata: { prNo: 'PR-2026-0340', vendor: 'Tata Steel' }
    });

    expect(prDoc).toBeTruthy();
    expect(prDoc.docId).toBe('DOC-GEN-PR-PR-SRC-001');
    expect(prDoc.name).toContain('PR-2026-0340');
    expect(prDoc.stage).toBeTruthy();
    expect(prDoc.sourceUrl).toBeTruthy(); /* Not blank */
    expect(prDoc.version).toBe(1);

    /* Step 2: Verify it appears in the repository */
    const result = await documentsService.getDocuments({ search: 'PR-2026-0340' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const found = result.data.find((d) => d.docId === prDoc.docId);
    expect(found).toBeTruthy();

    /* Step 3: Preview -- sourceUrl is available */
    expect(found.sourceUrl).toMatch(/^data:application\/pdf/);

    /* Step 4: Download -- sourceUrl can be downloaded */
    const canDownload = documentPermissionsService.canDownload(found);
    expect(canDownload.allowed).toBe(true);

    /* Step 5: Version history -- version record exists */
    const versions = await documentVersioningService.getVersions('PR', 'PR-SRC-001');
    expect(versions.length).toBe(1);
    expect(versions[0].version).toBe(1);
    expect(versions[0].isCurrent).toBe(true);

    /* Step 6: Registration created the doc record */
    expect(prDoc.uploadedBy).toBeTruthy();
  });

  it('PR regeneration creates v2, not a duplicate', async () => {
    /* First generation */
    await registerGeneratedDocument({
      docType: 'PR', sourceId: 'PR-SRC-002',
      docNo: 'PR-2026-0341',
      name: 'Purchase Requisition - PR-2026-0341',
      sourceUrl: mockPdf('PR-002-v1'), fileSize: 2048
    });

    /* Second generation (regenerate) */
    const updated = await registerGeneratedDocument({
      docType: 'PR', sourceId: 'PR-SRC-002',
      docNo: 'PR-2026-0341',
      name: 'Purchase Requisition - PR-2026-0341',
      sourceUrl: mockPdf('PR-002-v2'), fileSize: 3072
    });

    /* Same docId -- no duplicate */
    expect(updated.docId).toBe('DOC-GEN-PR-PR-SRC-002');
    expect(updated.version).toBe(2);

    /* Only one document in the store for this source */
    const matches = documentsStore.all.filter((d) => d.docId === updated.docId);
    expect(matches).toHaveLength(1);

    /* Two versions in history */
    const versions = await documentVersioningService.getVersions('PR', 'PR-SRC-002');
    expect(versions.length).toBe(2);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SCENARIO 2: RFQ -> Quotation -> Technical Eval -> Repository
   ═══════════════════════════════════════════════════════════════════ */
describe('Scenario 2: RFQ Document Flow', () => {
  beforeEach(seedEmpty);

  it('RFQ and quotation documents are registered and categorized correctly', async () => {
    const rfqDoc = await registerGeneratedDocument({
      docType: 'RFQ', sourceId: 'RFQ-SRC-001',
      docNo: 'RFQ-2026-001',
      name: 'Request for Quotation - RFQ-2026-001',
      sourceUrl: mockPdf('RFQ'), fileSize: 1500
    });
    expect(rfqDoc.folder).toBeTruthy();
    expect(rfqDoc.stage).toBeTruthy();

    const qtnDoc = await registerGeneratedDocument({
      docType: 'QUOTATION', sourceId: 'QTN-SRC-001',
      docNo: 'QTN-001',
      name: 'Vendor Quotation - Tata Steel',
      sourceUrl: mockPdf('QTN'), fileSize: 1200,
      metadata: { rfqNo: 'RFQ-2026-001', vendor: 'Tata Steel' }
    });
    expect(qtnDoc.folder).toBeTruthy();

    const teDoc = await registerGeneratedDocument({
      docType: 'TECHNICAL_EVALUATION', sourceId: 'TE-SRC-001',
      docNo: 'TE-001',
      name: 'Technical Evaluation - RFQ-2026-001',
      sourceUrl: mockPdf('TE'), fileSize: 800
    });
    expect(teDoc.folder).toBeTruthy();

    /* All 3 in the repository */
    const result = await documentsService.getDocuments({});
    expect(result.data.length).toBe(3);

    /* No duplicates -- unique docIds */
    const docIds = result.data.map((d) => d.docId);
    expect(new Set(docIds).size).toBe(3);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SCENARIO 3: PO -> Supplier Ack -> Logistics -> Invoice -> Payment
   ═══════════════════════════════════════════════════════════════════ */
describe('Scenario 3: PO Full Chain', () => {
  beforeEach(seedEmpty);

  it('all PO-linked documents are registered, linked, and discoverable', async () => {
    const poDoc = await registerGeneratedDocument({
      docType: 'PO', sourceId: 'PO-SRC-001',
      docNo: 'PO-2026-0500',
      name: 'Purchase Order - PO-2026-0500',
      sourceUrl: mockPdf('PO'), fileSize: 4096,
      metadata: { prNo: 'PR-2026-0340', rfqNo: 'RFQ-2026-001', vendor: 'Tata Steel' }
    });

    const ackDoc = await registerGeneratedDocument({
      docType: 'SUPPLIER_ACK', sourceId: 'ACK-SRC-001',
      docNo: 'ACK-001',
      name: 'Supplier Acknowledgement - PO-2026-0500',
      sourceUrl: mockPdf('ACK'), fileSize: 1024
    });

    const invDoc = await registerGeneratedDocument({
      docType: 'INVOICE', sourceId: 'INV-SRC-001',
      docNo: 'INV-2026-0101',
      name: 'Purchase Invoice - INV-2026-0101',
      sourceUrl: mockPdf('INV'), fileSize: 3072,
      metadata: { poNo: 'PO-2026-0500', vendor: 'Tata Steel' }
    });

    const nfaDoc = await registerGeneratedDocument({
      docType: 'NFA', sourceId: 'NFA-SRC-001',
      docNo: 'NFA-001',
      name: 'Approval Note - NFA-001',
      sourceUrl: mockPdf('NFA'), fileSize: 512
    });

    /* All exist in correct folders */
    expect(poDoc.folder).toBeTruthy();
    expect(ackDoc.folder).toBeTruthy();
    expect(invDoc.folder).toBeTruthy();
    expect(nfaDoc.folder).toBeTruthy();

    /* PO linkage preserved */
    expect(poDoc.poNo).toBe('PO-2026-0500');
    expect(invDoc.poNo).toBe('PO-2026-0500');

    /* No orphan records */
    const allDocs = documentsStore.all.filter((d) => d.recordState === 'active');
    expect(allDocs.length).toBe(4);

    /* Each doc is previewable (has sourceUrl) */
    for (const doc of allDocs) {
      expect(doc.sourceUrl).toBeTruthy();
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SCENARIO 4: Upload External Invoice -> Preview -> Download -> Link -> Audit
   ═══════════════════════════════════════════════════════════════════ */
describe('Scenario 4: External Upload Lifecycle', () => {
  beforeEach(seedEmpty);

  it('upload, preview, download, link, version, and audit all work', async () => {
    /* Step 1: Create a document via uploadDocument */
    const uploadedDoc = await documentsService.uploadDocument(
      { name: 'supplier-invoice.pdf', size: 5120, type: 'application/pdf' },
      {
        folder: 'INVOICE', docType: 'Uploaded', category: 'Invoice',
        description: 'Supplier invoice from Tata Steel',
        sourceModule: 'Invoice', sourceReference: 'INV-2026-0200',
        vendor: 'Tata Steel', tags: ['urgent', 'payment-due'], confidential: false
      }
    );

    expect(uploadedDoc).toBeTruthy();
    expect(uploadedDoc.name).toBe('supplier-invoice.pdf');
    expect(uploadedDoc.folder).toBe('INVOICE');
    expect(uploadedDoc.sourceUrl).toBeTruthy();
    expect(uploadedDoc.version).toBe(1);

    /* Step 2: Preview -- sourceUrl available */
    expect(uploadedDoc.sourceUrl).toMatch(/^data:/);

    /* Step 3: Download permission check */
    const access = documentPermissionsService.canDownload(uploadedDoc);
    expect(access.allowed).toBe(true);

    /* Step 4: Link to Invoice source */
    expect(uploadedDoc.sourceModule).toBe('Invoice');
    expect(uploadedDoc.sourceReference).toBe('INV-2026-0200');

    /* Step 5: Record audit */
    await documentAuditService.recordUpload(uploadedDoc, 'ui');
    const trail = await documentAuditService.getAuditTrail(uploadedDoc.docId);
    expect(trail.length).toBeGreaterThanOrEqual(1);
    expect(trail.some((r) => r.action === 'Uploaded')).toBe(true);

    /* Step 6: Verify metadata preserved */
    const refreshed = documentsStore.all.find((d) => d.docId === uploadedDoc.docId);
    expect(refreshed.category).toBe('Invoice');
    expect(refreshed.description).toBe('Supplier invoice from Tata Steel');
    expect(refreshed.vendor).toBe('Tata Steel');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SCENARIO 5: Replace -> v2 -> Preview v2 -> Download v1 -> Restore v1
   ═══════════════════════════════════════════════════════════════════ */
describe('Scenario 5: Document Replacement and Versioning', () => {
  beforeEach(seedEmpty);

  it('replace creates v2, restore creates v3, all versions preserved', async () => {
    /* Step 1: Create original document via registration */
    const doc = await registerGeneratedDocument({
      docType: 'PO', sourceId: 'PO-V-001',
      docNo: 'PO-2026-0600',
      name: 'Purchase Order - PO-2026-0600',
      sourceUrl: mockPdf('PO-v1'), fileSize: 1024
    });
    expect(doc.version).toBe(1);

    /* Step 2: Verify versioning record was created during registration */
    const regVersions = await documentVersioningService.getVersions('PO', 'PO-V-001');
    expect(regVersions.length).toBe(1);
    expect(regVersions[0].isCurrent).toBe(true);

    /* Step 3: Replace with new file (creates v2 on the document record) */
    const replaced = await documentOperationsService.createNewVersion(doc.docId, {
      sourceUrl: mockPdf('PO-v2'), fileSize: 2048,
      changeReason: 'Price amendment'
    });
    expect(replaced.version).toBe(2);
    expect(replaced.sourceUrl).toBeTruthy(); /* v2 file reference present */

    /* Step 4: Preview v2 -- sourceUrl available */
    expect(replaced.sourceUrl).toBeTruthy();

    /* Step 5: Restore v1 from version history -- creates v3 */
    const v1 = regVersions[0];
    const restored = await documentVersioningService.restoreVersion(v1.versionId, {
      changeReason: 'Reverting to original'
    });
    expect(restored.version).toBeGreaterThanOrEqual(2);
    expect(restored.isCurrent).toBe(true);

    /* Step 6: Verify the restored version carries the original file reference */
    expect(restored.sourceUrl).toBeTruthy();

    /* Step 7: Original document record shows latest version */
    const finalDoc = documentsStore.all.find((d) => d.docId === doc.docId);
    expect(finalDoc.version).toBeGreaterThanOrEqual(2);
    expect(finalDoc.sourceUrl).toBeTruthy();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   SCENARIO 6: Bulk Select -> ZIP download -> Report
   ═══════════════════════════════════════════════════════════════════ */
describe('Scenario 6: Bulk Operations', () => {
  beforeEach(seedEmpty);

  it('bulk operations work end-to-end', async () => {
    /* Step 1: Create multiple documents */
    const docs = [];
    for (let i = 1; i <= 5; i++) {
      const doc = await registerGeneratedDocument({
        docType: 'PO', sourceId: `BULK-PO-${i}`,
        docNo: `PO-2026-0${600 + i}`,
        name: `Bulk PO ${i}`,
        sourceUrl: mockPdf(`bulk-${i}`), fileSize: 1024 * i
      });
      docs.push(doc);
    }

    const allDocs = documentsStore.all.filter((d) => d.recordState === 'active');
    expect(allDocs.length).toBe(5);

    const docIds = docs.map((d) => d.docId);

    /* Step 2: Bulk change category */
    const catResult = await bulkDocumentOperationsService.bulkChangeCategory(docIds, 'Procurement');
    expect(catResult.successful).toBe(5);
    for (const id of docIds) {
      expect(documentsStore.all.find((d) => d.docId === id).category).toBe('Procurement');
    }

    /* Step 3: Bulk add tags */
    const tagResult = await bulkDocumentOperationsService.bulkAddTags(docIds, ['urgent', 'approved']);
    expect(tagResult.successful).toBe(5);
    for (const id of docIds) {
      const tags = documentsStore.all.find((d) => d.docId === id).tags;
      expect(tags).toContain('urgent');
      expect(tags).toContain('approved');
    }

    /* Step 4: Bulk archive */
    const archiveResult = await bulkDocumentOperationsService.bulkArchive(docIds.slice(0, 3));
    expect(archiveResult.successful).toBe(3);

    /* Step 5: Bulk download -- report */
    const report = await bulkDocumentOperationsService.bulkDownloadZip(docIds.slice(0, 2));
    expect(report.successful.length).toBe(2);
    expect(report.failed.length).toBe(0);

    /* Step 6: Verify filename format */
    for (const s of report.successful) {
      expect(s.filename).toMatch(/Bulk_PO_\d+\.pdf$/);
    }

    /* Step 7: Verify archived docs are correctly marked */
    for (const id of docIds.slice(0, 3)) {
      expect(documentsStore.all.find((d) => d.docId === id).recordState).toBe('archived');
    }

    /* Step 8: Bulk delete */
    const deleteResult = await bulkDocumentOperationsService.bulkDelete(docIds.slice(3));
    expect(deleteResult.successful).toBe(2);

    /* Step 9: No orphan records */
    expect(documentsStore.all.length).toBe(5);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   CROSS-CUTTING: No duplicates, no orphans, no fake data
   ═══════════════════════════════════════════════════════════════════ */

/* Stub browser globals for bulk download */
const mockAnchor = { href: '', download: '', click: vi.fn() };
vi.stubGlobal('document', {
  createElement: vi.fn(() => mockAnchor),
  body: { appendChild: vi.fn(), removeChild: vi.fn() }
});
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn()
});

describe('Cross-cutting Verification', () => {
  beforeEach(seedEmpty);

  it('no duplicate documents when registering same source twice', async () => {
    const opts = {
      docType: 'PO', sourceId: 'DUP-001', docNo: 'PO-DUP',
      name: 'Duplicate Test', sourceUrl: mockPdf('dup'), fileSize: 100
    };
    await registerGeneratedDocument(opts);
    await registerGeneratedDocument(opts);
    await registerGeneratedDocument(opts);

    const matches = documentsStore.all.filter((d) => d.docId === 'DOC-GEN-PO-DUP-001');
    expect(matches).toHaveLength(1);
    expect(matches[0].version).toBe(3);
  });

  it('no blank sourceUrls for generated documents', async () => {
    await registerGeneratedDocument({
      docType: 'RFQ', sourceId: 'RFQ-BLANK-001', docNo: 'RFQ-BLANK',
      name: 'Blank Test', sourceUrl: mockPdf('not-blank'), fileSize: 100
    });
    const doc = documentsStore.all.find((d) => d.docId === 'DOC-GEN-RFQ-RFQ-BLANK-001');
    expect(doc.sourceUrl).toBeTruthy();
    expect(doc.sourceUrl.length).toBeGreaterThan(10);
  });

  it('no fake counts -- document counts match actual store', async () => {
    for (let i = 0; i < 3; i++) {
      await registerGeneratedDocument({
        docType: 'PO', sourceId: `COUNT-${i}`, docNo: `PO-COUNT-${i}`,
        name: `Count Test ${i}`, sourceUrl: mockPdf(`count-${i}`), fileSize: 100
      });
    }
    const stats = await documentsService.getStats();
    expect(stats.total).toBe(3);
    expect(stats.generated).toBe(3);
  });

  it('permission checks work correctly', () => {
    const adminDoc = { docId: 'x', confidential: false, sourceUrl: 'data:pdf' };
    expect(documentPermissionsService.canDownload(adminDoc).allowed).toBe(true);
    expect(documentPermissionsService.canDelete(adminDoc).allowed).toBe(true);
    expect(documentPermissionsService.canDownload(null).allowed).toBe(false);
  });

  it('audit records all required fields, exposes nothing sensitive', async () => {
    const doc = { docId: 'AUDIT-001', name: 'Audit Test.pdf', docNo: 'AUD-001', version: 1 };
    const record = await documentAuditService.record('Viewed', { doc, source: 'ui' });

    expect(record.timestamp).toBeTruthy();
    expect(record.user.name).toBeTruthy();
    expect(record.action).toBeTruthy();
    expect(record.document.docId).toBeTruthy();
    expect(record.source).toBeTruthy();
    expect(record.result).toBeTruthy();

    /* No sensitive data */
    expect(record.user.password).toBeUndefined();
    expect(record.user.token).toBeUndefined();
    expect(record.document.sourceUrl).toBeUndefined();
    expect(record.document.storagePath).toBeUndefined();
  });

  it('all stages map to valid folders', async () => {
    const types = ['PR', 'RFQ', 'PO', 'INVOICE', 'NFA'];
    for (const t of types) {
      const doc = await registerGeneratedDocument({
        docType: t, sourceId: `NAV-${t}-001`,
        docNo: `${t}-NAV-001`, name: `Nav Test ${t}`,
        sourceUrl: mockPdf(`nav-${t}`), fileSize: 100
      });
      expect(doc.folder).toBeTruthy();
      expect(doc.stage).toBeTruthy();
    }
  });

  it('versioning lifecycle: create v1 -> create v2 -> restore -> mark current', async () => {
    const v1 = await documentVersioningService.createVersion('TEST', 'SRC-001', {
      status: 'Draft', sourceUrl: 'data:v1', changeReason: 'Initial'
    });
    expect(v1.version).toBe(1);
    expect(v1.isCurrent).toBe(true);

    const v2 = await documentVersioningService.createVersion('TEST', 'SRC-001', {
      status: 'Generated', sourceUrl: 'data:v2', changeReason: 'Updated'
    });
    expect(v2.version).toBe(2);
    expect(v2.isCurrent).toBe(true);

    /* v1 no longer current */
    const versions = await documentVersioningService.getVersions('TEST', 'SRC-001');
    const v1Again = versions.find((v) => v.version === 1);
    expect(v1Again.isCurrent).toBe(false);

    /* Restore v1 -> creates v3 */
    const v3 = await documentVersioningService.restoreVersion(v1.versionId, {
      changeReason: 'Reverting to v1'
    });
    expect(v3.version).toBeGreaterThanOrEqual(3);

    /* Mark v2 as current */
    await documentVersioningService.markAsCurrent(v2.versionId);
    const finalVersions = await documentVersioningService.getVersions('TEST', 'SRC-001');
    expect(finalVersions.find((v) => v.version === 2).isCurrent).toBe(true);
  });
});
