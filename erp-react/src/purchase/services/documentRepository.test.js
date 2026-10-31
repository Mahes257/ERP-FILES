/**
 * purchase/services/documentRepository.test.js
 * ------------------------------------------------------------------
 * Regression tests for the Purchase Document Repository.
 * Tests document creation, upload, status, search, filters,
 * pagination, counters, and the Pending Generation lifecycle.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { documentsService, documentsStore } from './documents';
import { mockRfqService, rfqsStore, quotationsStore } from './rfq';
import { mockVendorService, vendorsStore } from './vendor';
import { evaluationsStore } from './evaluation';
import { requisitionsStore } from './requisition';
import { ordersStore } from './purchaseOrder';
import { nfasStore } from './nfa';
import { invoicesStore, advicesStore } from './invoice';
import { grnsStore, inspectionsStore } from './logistics';
import { DOCUMENT_STAGE, DOCUMENT_TYPE } from '../constants';

vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(async () => {
  localStorage.clear();
  documentsStore.reset();
  evaluationsStore.reset();
  rfqsStore.reset();
  quotationsStore.reset();
  vendorsStore.reset();
  requisitionsStore.reset();
  ordersStore.reset();
  nfasStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  grnsStore.reset();
  inspectionsStore.reset();
  setActor();
});

/* ================================================================== */
/*  1. System-generated document status                                 */
/* ================================================================== */
describe('System-generated document status', () => {
  it('does not fabricate system docs from workflow records on refresh', async () => {
    // Create an RFQ with negotiations — the workflow state that used to
    // auto-create a "Negotiation Summary" placeholder on refresh.
    const vendor = await mockVendorService.createVendor({ name: 'Test Vendor', status: 'Approved' });
    await mockVendorService.setVendorStatus(vendor.id, 'Approved');
    const draft = await mockRfqService.createRfq({
      title: 'Test RFQ',
      reference: 'PR-TEST-001',
      department: 'IT',
      project: 'Test',
      requester: 'Test',
      buyer: 'Test',
      priority: 'High',
      dueDate: '2026-09-10',
      currency: 'INR',
      vendorNames: ['Test Vendor'],
      items: [{ product: 'Widget', hsn: '8471', uom: 'Nos', qty: 10, rate: 100, expectedRate: 100 }],
    });
    await mockRfqService.submitForReview(draft.id);
    await mockRfqService.approveRfq(draft.id);
    await mockRfqService.sendRfq(draft.id);

    // Record a negotiation on the evaluation board.
    evaluationsStore.all.push({
      id: draft.id,
      rfqNo: draft.rfqNo,
      negotiations: [{ vendor: 'Test Vendor', amount: 90, stage: 'In Progress', itemRates: { 0: 90 } }],
      activity: [],
    });
    evaluationsStore.persist(evaluationsStore.all);

    // Refresh must be a pure LOAD — the empty repository stays empty and
    // no placeholder is invented for the existing workflow record.
    await documentsService.refreshDocuments();
    expect(documentsStore.all).toHaveLength(0);
    expect(documentsStore.all.find((d) => d.name && d.name.includes('Negotiation Summary'))).toBeUndefined();

    // Page reads (mount) must never create documents either.
    const list = await documentsService.getDocuments({});
    expect(list.total).toBe(0);
    const stats = await documentsService.getStats();
    expect(stats.total).toBe(0);
    expect(stats.uploaded).toBe(0);
    expect(stats.generated).toBe(0);
    expect(stats.pendingGeneration).toBe(0);

    // Repeated refreshes stay idempotent.
    await documentsService.refreshDocuments();
    await documentsService.refreshDocuments();
    expect(documentsStore.all).toHaveLength(0);
  });

  it('system-generated doc with sourceUrl has generationStatus = Generated', async () => {
    // Manually insert a doc with sourceUrl
    const doc = {
      docId: 'DOC-TEST-GEN-001',
      name: 'Generated PO — PO-2026-0001',
      docType: DOCUMENT_TYPE.GENERATED,
      docNo: 'PO-2026-0001',
      stage: DOCUMENT_STAGE.PO,
      prNo: '', rfqNo: '', poNo: 'PO-2026-0001',
      vendor: 'Test Vendor',
      uploadedBy: 'System',
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      fileType: 'PDF',
      fileSize: 102400,
      fileSizeLabel: '100 KB',
      source: DOCUMENT_TYPE.GENERATED,
      sourceUrl: 'data:application/pdf;base64,JVBERi0x',
      sourceType: 'pdf',
      sourceId: 'PO-001',
      sourceLabel: 'PO-2026-0001',
      version: 1,
      generationStatus: 'Generated',
      status: 'Generated',
      recordState: 'active',
      folder: 'PO',
    };
    documentsStore.all.push(doc);
    documentsStore.persist(documentsStore.all);

    const found = await documentsService.getDocument('DOC-TEST-GEN-001');
    expect(found.generationStatus).toBe('Generated');
    expect(found.status).toBe('Generated');
    expect(found.fileSize).toBe(102400);
    expect(found.sourceUrl).toBeTruthy();
  });
});

/* ================================================================== */
/*  1b. Refresh idempotency — refresh must never mutate the repo        */
/* ================================================================== */
describe('Refresh idempotency — no document creation', () => {
  function makeUploadDoc(docId, name) {
    return {
      docId, name,
      docType: DOCUMENT_TYPE.UPLOADED,
      stage: DOCUMENT_STAGE.INVOICE,
      docNo: 'INV-2026-4201',
      poNo: 'PO-2026-0001',
      vendor: 'Test Vendor',
      source: DOCUMENT_TYPE.UPLOADED,
      sourceUrl: 'data:application/pdf;base64,abc',
      sourceType: 'pdf',
      recordState: 'active',
      folder: 'INVOICE',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final'
    };
  }

  it('repeated refreshes return identical document IDs, names, count and metrics', async () => {
    documentsStore.persist([
      makeUploadDoc('DOC-UPLOAD-0001', 'Upload 1.pdf'),
      makeUploadDoc('DOC-UPLOAD-0002', 'Upload 2.pdf'),
      makeUploadDoc('DOC-UPLOAD-0003', 'Upload 3.pdf'),
      makeUploadDoc('DOC-UPLOAD-0004', 'Upload 4.pdf'),
      /* A system-generated document that was genuinely produced (has a
         file) must also survive a refresh untouched. */
      {
        docId: 'DOC-GEN-INV-4201', name: 'Payment Advice — ADV-2026-4201',
        docType: DOCUMENT_TYPE.GENERATED, stage: DOCUMENT_STAGE.PAYMENT,
        source: DOCUMENT_TYPE.GENERATED, generationStatus: 'Generated', status: 'Generated',
        sourceUrl: 'data:application/pdf;base64,JVBERi0x', fileSize: 2048,
        recordState: 'active', folder: 'INVOICE',
        uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
        fileType: 'PDF', fileSizeLabel: '2 KB', version: 1
      }
    ]);

    const beforeIds = documentsStore.all.map((d) => d.docId).sort();
    const beforeNames = documentsStore.all.map((d) => d.name).sort();
    const beforeStats = await documentsService.getStats();

    for (let i = 0; i < 5; i++) {
      await documentsService.refreshDocuments();
    }

    const afterIds = documentsStore.all.map((d) => d.docId).sort();
    const afterNames = documentsStore.all.map((d) => d.name).sort();
    const afterStats = await documentsService.getStats();

    expect(afterIds).toEqual(beforeIds);
    expect(afterNames).toEqual(beforeNames);
    expect(documentsStore.all).toHaveLength(5);
    expect(afterStats).toEqual(beforeStats);
  });

  it('refreshing never resurrects deleted or archived documents', async () => {
    const active = makeUploadDoc('DOC-UPLOAD-KEEP', 'Keep.pdf');
    const archived = { ...makeUploadDoc('DOC-UPLOAD-ARCH', 'Archived.pdf'), recordState: 'archived' };
    const deleted = { ...makeUploadDoc('DOC-UPLOAD-DEL', 'Deleted.pdf'), recordState: 'deleted' };
    documentsStore.persist([active, archived, deleted]);

    for (let i = 0; i < 3; i++) {
      await documentsService.refreshDocuments();
    }

    const byId = Object.fromEntries(documentsStore.all.map((d) => [d.docId, d.recordState]));
    expect(byId['DOC-UPLOAD-KEEP']).toBe('active');
    expect(byId['DOC-UPLOAD-ARCH']).toBe('archived');
    expect(byId['DOC-UPLOAD-DEL']).toBe('deleted');
    expect(documentsStore.all).toHaveLength(3);

    const stats = await documentsService.getStats();
    expect(stats.total).toBe(1);
  });

  it('pending system documents are only upgraded by an explicit generate action', async () => {
    documentsStore.persist([{
      docId: 'DOC-PEND-0001', name: 'Negotiation Summary — RFQ-2026-0001',
      docType: DOCUMENT_TYPE.GENERATED, stage: DOCUMENT_STAGE.NEGOTIATION,
      rfqNo: 'RFQ-2026-0001', source: DOCUMENT_TYPE.GENERATED,
      generationStatus: 'Pending', status: 'Pending Generation',
      sourceUrl: '', fileSize: 0, recordState: 'active', folder: 'TSR',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', version: 1
    }]);

    /* Refresh alone never generates the file nor duplicates the row. */
    await documentsService.refreshDocuments();
    await documentsService.refreshDocuments();
    expect(documentsStore.all).toHaveLength(1);
    expect(documentsStore.all[0].generationStatus).toBe('Pending');
    expect(documentsStore.all[0].sourceUrl).toBe('');
  });
});

/* ================================================================== */
/*  2. Upload Document                                                 */
/* ================================================================== */
describe('Upload Document', () => {
  beforeEach(() => {
    // Mock FileReader for the test environment
    globalThis.FileReader = class {
      constructor() { this.result = ''; }
      readAsDataURL() {
        this.result = 'data:application/pdf;base64,dGVzdA==';
        if (this.onload) this.onload();
      }
    };
  });

  it('upload creates a document record with proper metadata', async () => {
    const mockFile = new File(['test content'], 'spec.pdf', { type: 'application/pdf' });
    Object.defineProperty(mockFile, 'size', { value: 1024 });
    
    const doc = await documentsService.uploadDocument(mockFile, {
      folder: 'RFQ',
      docType: 'RFQ',
      sourceModule: 'RFQ',
      sourceReference: 'RFQ-2026-0009',
      vendor: 'Tata Steel',
    });

    expect(doc.docId).toBeTruthy();
    expect(doc.name).toBe('spec.pdf');
    expect(doc.docType).toBe('RFQ');
    expect(doc.source).toBe(DOCUMENT_TYPE.UPLOADED);
    expect(doc.vendor).toBe('Tata Steel');
    expect(doc.fileSize).toBe(1024);
    expect(doc.version).toBe(1);
    expect(doc.status).toBe('Final');
    expect(doc.sourceUrl).toBeTruthy(); // data URL stored
    expect(doc.recordState).toBe('active');
  });

  it('upload persists to the store and is discoverable', async () => {
    const mockFile = new File(['content'], 'report.xlsx', { type: 'application/vnd.ms-excel' });
    Object.defineProperty(mockFile, 'size', { value: 2048 });
    
    await documentsService.uploadDocument(mockFile, { folder: 'REPORTS' });
    
    const result = await documentsService.getDocuments({ search: 'report' });
    expect(result.data.length).toBeGreaterThanOrEqual(1);
    const found = result.data.find(d => d.name === 'report.xlsx');
    expect(found).toBeTruthy();
    expect(found.source).toBe(DOCUMENT_TYPE.UPLOADED);
  });

  it('upload respects allowed file types', async () => {
    const mockFile = new File(['test'], 'document.pdf', { type: 'application/pdf' });
    Object.defineProperty(mockFile, 'size', { value: 500 });
    
    const doc = await documentsService.uploadDocument(mockFile, {});
    expect(doc).toBeTruthy();
    expect(doc.sourceUrl).toBeTruthy();
  });
});

/* ================================================================== */
/*  3. Search and Filters                                              */
/* ================================================================== */
describe('Search and Filters', () => {
  beforeEach(async () => {
    // Seed some documents
    const files = [
      { name: 'RFQ-Spec.pdf', stage: DOCUMENT_STAGE.RFQ, rfqNo: 'RFQ-2026-0009', vendor: 'Tata Steel' },
      { name: 'PO-Order.pdf', stage: DOCUMENT_STAGE.PO, poNo: 'PO-2026-0340', vendor: 'Tata Steel' },
      { name: 'Invoice-001.pdf', stage: DOCUMENT_STAGE.INVOICE, poNo: 'PO-2026-0340', vendor: 'JSW Steel' },
    ];
    for (const f of files) {
      documentsStore.all.push({
        docId: `DOC-TEST-${f.name}`,
        name: f.name,
        docType: DOCUMENT_TYPE.UPLOADED,
        stage: f.stage,
        prNo: '', rfqNo: f.rfqNo || '', poNo: f.poNo || '',
        vendor: f.vendor,
        uploadedBy: 'Test', uploadedAt: '2026-08-20T10:00:00Z',
        updatedAt: '2026-08-20T10:00:00Z',
        fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
        source: DOCUMENT_TYPE.UPLOADED, sourceUrl: 'data:application/pdf;base64,abc',
        sourceType: 'pdf', sourceId: '', sourceLabel: '',
        version: 1, status: 'Final', recordState: 'active', folder: 'OTHER',
      });
    }
    documentsStore.persist(documentsStore.all);
  });

  it('search by name finds matching documents', async () => {
    const result = await documentsService.getDocuments({ search: 'RFQ-Spec' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('RFQ-Spec.pdf');
  });

  it('search by vendor finds matching documents', async () => {
    const result = await documentsService.getDocuments({ search: 'JSW' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].vendor).toBe('JSW Steel');
  });

  it('filter by stage finds matching documents', async () => {
    const result = await documentsService.getDocuments({ stage: DOCUMENT_STAGE.RFQ });
    expect(result.data.length).toBe(1);
    expect(result.data[0].stage).toBe(DOCUMENT_STAGE.RFQ);
  });

  it('filter by vendor finds matching documents', async () => {
    const result = await documentsService.getDocuments({ vendor: 'Tata Steel' });
    expect(result.data.length).toBe(2);
  });

  it('combined filters work together', async () => {
    const result = await documentsService.getDocuments({
      vendor: 'Tata Steel',
      stage: DOCUMENT_STAGE.PO,
    });
    expect(result.data.length).toBe(1);
    expect(result.data[0].name).toBe('PO-Order.pdf');
  });

  it('search by RFQ number finds matching documents', async () => {
    const result = await documentsService.getDocuments({ rfqNo: 'RFQ-2026-0009' });
    expect(result.data.length).toBe(1);
    expect(result.data[0].rfqNo).toBe('RFQ-2026-0009');
  });

  it('search by PO number finds matching documents', async () => {
    const result = await documentsService.getDocuments({ poNo: 'PO-2026-0340' });
    expect(result.data.length).toBe(2);
  });
});

/* ================================================================== */
/*  4. Pagination                                                      */
/* ================================================================== */
describe('Pagination', () => {
  beforeEach(async () => {
    for (let i = 0; i < 30; i++) {
      documentsStore.all.push({
        docId: `DOC-PAGE-${i}`,
        name: `Document ${i}.pdf`,
        docType: DOCUMENT_TYPE.UPLOADED,
        stage: DOCUMENT_STAGE.RFQ,
        prNo: '', rfqNo: `RFQ-${String(i).padStart(4, '0')}`, poNo: '',
        vendor: 'Test Vendor',
        uploadedBy: 'Test', uploadedAt: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`,
        updatedAt: `2026-08-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`,
        fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
        source: DOCUMENT_TYPE.UPLOADED, sourceUrl: 'data:application/pdf;base64,abc',
        sourceType: 'pdf', sourceId: '', sourceLabel: '',
        version: 1, status: 'Final', recordState: 'active', folder: 'RFQ',
      });
    }
    documentsStore.persist(documentsStore.all);
  });

  it('first page returns correct number of documents', async () => {
    const result = await documentsService.getDocuments({ page: 1, pageSize: 10 });
    expect(result.data.length).toBe(10);
    expect(result.total).toBe(30);
    expect(result.totalPages).toBe(3);
  });

  it('second page returns remaining documents', async () => {
    const result = await documentsService.getDocuments({ page: 2, pageSize: 10 });
    expect(result.data.length).toBe(10);
  });

  it('last page returns partial documents', async () => {
    const result = await documentsService.getDocuments({ page: 3, pageSize: 10 });
    expect(result.data.length).toBe(10);
  });

  it('page beyond total returns empty', async () => {
    const result = await documentsService.getDocuments({ page: 10, pageSize: 10 });
    expect(result.data.length).toBe(0);
  });

  it('changing page size works', async () => {
    const result = await documentsService.getDocuments({ page: 1, pageSize: 5 });
    expect(result.data.length).toBe(5);
    expect(result.totalPages).toBe(6);
  });
});

/* ================================================================== */
/*  5. Document Counters                                               */
/* ================================================================== */
describe('Document Counters', () => {
  it('stats are calculated from actual records', async () => {
    // Add some uploaded docs
    for (let i = 0; i < 3; i++) {
      documentsStore.all.push({
        docId: `DOC-STATS-UP-${i}`,
        name: `Upload ${i}.pdf`,
        docType: DOCUMENT_TYPE.UPLOADED,
        stage: DOCUMENT_STAGE.RFQ,
        source: DOCUMENT_TYPE.UPLOADED,
        sourceUrl: 'data:application/pdf;base64,abc',
        recordState: 'active', folder: 'RFQ',
        uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
        fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
        version: 1, status: 'Final',
      });
    }
    // Add a pending generation doc
    documentsStore.all.push({
      docId: 'DOC-STATS-PEND',
      name: 'Negotiation Summary — RFQ-2026-0009',
      docType: DOCUMENT_TYPE.GENERATED,
      stage: DOCUMENT_STAGE.NEGOTIATION,
      source: DOCUMENT_TYPE.GENERATED,
      sourceUrl: '',
      generationStatus: 'Pending',
      status: 'Pending Generation',
      recordState: 'active', folder: 'TSR',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 0, fileSizeLabel: '',
      version: 1,
    });
    documentsStore.persist(documentsStore.all);

    const stats = await documentsService.getStats();
    expect(stats.total).toBe(4);
    expect(stats.uploaded).toBe(3);
    expect(stats.generated).toBe(1);
    expect(stats.pendingGeneration).toBe(1);
  });

  it('archived documents are counted separately', async () => {
    documentsStore.all.push({
      docId: 'DOC-ARCH-001',
      name: 'Archived Doc.pdf',
      docType: DOCUMENT_TYPE.UPLOADED,
      stage: DOCUMENT_STAGE.RFQ,
      source: DOCUMENT_TYPE.UPLOADED,
      sourceUrl: 'data:application/pdf;base64,abc',
      recordState: 'archived', folder: 'RFQ',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final',
    });
    documentsStore.persist(documentsStore.all);

    const stats = await documentsService.getStats();
    expect(stats.archived).toBe(1);
  });
});

/* ================================================================== */
/*  6. Document Operations (delete, archive, rename)                    */
/* ================================================================== */
describe('Document Operations', () => {
  it('soft delete marks record as deleted', async () => {
    documentsStore.all.push({
      docId: 'DOC-DEL-001',
      name: 'Delete Me.pdf',
      docType: DOCUMENT_TYPE.UPLOADED,
      stage: DOCUMENT_STAGE.RFQ,
      source: DOCUMENT_TYPE.UPLOADED,
      sourceUrl: 'data:application/pdf;base64,abc',
      recordState: 'active', folder: 'RFQ',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final',
    });
    documentsStore.persist(documentsStore.all);

    await documentsService.deleteDocument('DOC-DEL-001');
    const doc = documentsStore.all.find(d => d.docId === 'DOC-DEL-001');
    expect(doc.recordState).toBe('deleted');
  });

  it('archive marks record as archived', async () => {
    documentsStore.all.push({
      docId: 'DOC-ARC-001',
      name: 'Archive Me.pdf',
      docType: DOCUMENT_TYPE.UPLOADED,
      stage: DOCUMENT_STAGE.RFQ,
      source: DOCUMENT_TYPE.UPLOADED,
      sourceUrl: 'data:application/pdf;base64,abc',
      recordState: 'active', folder: 'RFQ',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final',
    });
    documentsStore.persist(documentsStore.all);

    await documentsService.archiveDocument('DOC-ARC-001');
    const doc = documentsStore.all.find(d => d.docId === 'DOC-ARC-001');
    expect(doc.recordState).toBe('archived');
  });

  it('rename changes display name only', async () => {
    documentsStore.all.push({
      docId: 'DOC-REN-001',
      name: 'Old Name.pdf',
      docType: DOCUMENT_TYPE.UPLOADED,
      stage: DOCUMENT_STAGE.RFQ,
      source: DOCUMENT_TYPE.UPLOADED,
      sourceUrl: 'data:application/pdf;base64,abc',
      recordState: 'active', folder: 'RFQ',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final',
    });
    documentsStore.persist(documentsStore.all);

    const renamed = await documentsService.renameDocument('DOC-REN-001', 'New Name.pdf');
    expect(renamed.name).toBe('New Name.pdf');
    expect(renamed.docId).toBe('DOC-REN-001');
  });
});

/* ================================================================== */
/*  7. Folder counts                                                   */
/* ================================================================== */
describe('Folder Counts', () => {
  it('folder counts are derived from actual documents', async () => {
    documentsStore.all.push({
      docId: 'DOC-FC-001', name: 'PR Doc.pdf',
      docType: DOCUMENT_TYPE.UPLOADED, stage: DOCUMENT_STAGE.PR,
      source: DOCUMENT_TYPE.UPLOADED, sourceUrl: 'data:application/pdf;base64,abc',
      recordState: 'active', folder: 'PR',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final',
    });
    documentsStore.all.push({
      docId: 'DOC-FC-002', name: 'PO Doc.pdf',
      docType: DOCUMENT_TYPE.UPLOADED, stage: DOCUMENT_STAGE.PO,
      source: DOCUMENT_TYPE.UPLOADED, sourceUrl: 'data:application/pdf;base64,abc',
      recordState: 'active', folder: 'PO',
      uploadedAt: '2026-08-20T10:00:00Z', updatedAt: '2026-08-20T10:00:00Z',
      fileType: 'PDF', fileSize: 1024, fileSizeLabel: '1 KB',
      version: 1, status: 'Final',
    });
    documentsStore.persist(documentsStore.all);

    const counts = await documentsService.getFolderCounts();
    const prFolder = counts.find(f => f.key === 'PR');
    const poFolder = counts.find(f => f.key === 'PO');
    expect(prFolder.count).toBe(1);
    expect(poFolder.count).toBe(1);
  });
});

describe('generateDocument()', () => {
  it('generates a PDF for a pending system document', async () => {
    documentsStore.persist([{
      docId: 'DOC-GEN-001', name: 'Negotiation Summary — RFQ-2026-0009',
      docType: DOCUMENT_TYPE.GENERATED, stage: DOCUMENT_STAGE.NEGOTIATION,
      rfqNo: 'RFQ-2026-0009', source: DOCUMENT_TYPE.GENERATED,
      generationStatus: 'Pending', status: 'Pending Generation',
      sourceUrl: '', fileSize: 0, recordState: 'active',
      uploadedAt: '2026-08-20T10:00:00Z',
    }]);

    const doc = await documentsService.generateDocument('DOC-GEN-001');
    expect(doc.generationStatus).toBe('Generated');
    expect(doc.status).toBe('Generated');
    expect(doc.sourceUrl).toBeTruthy();
    expect(doc.sourceUrl).toContain('data:');
    expect(doc.fileSize).toBeGreaterThan(0);
  });

  it('skips generation if already generated', async () => {
    documentsStore.persist([{
      docId: 'DOC-GEN-002', name: 'PO Doc',
      docType: DOCUMENT_TYPE.GENERATED, stage: DOCUMENT_STAGE.PO,
      source: DOCUMENT_TYPE.GENERATED,
      generationStatus: 'Generated', status: 'Generated',
      sourceUrl: 'data:application/pdf;base64,existing',
      fileSize: 500, recordState: 'active',
      uploadedAt: '2026-08-20T10:00:00Z',
    }]);

    const doc = await documentsService.generateDocument('DOC-GEN-002');
    expect(doc.sourceUrl).toBe('data:application/pdf;base64,existing');
  });

  it('throws for nonexistent document', async () => {
    await expect(documentsService.generateDocument('DOC-NOPE')).rejects.toThrow('Document not found');
  });
});

describe('restoreDocument()', () => {
  it('restores an archived document to active', async () => {
    documentsStore.persist([{
      docId: 'DOC-ARCH-001', name: 'Archived Doc',
      recordState: 'archived',
      uploadedAt: '2026-08-20T10:00:00Z',
    }]);

    const result = await documentsService.restoreDocument('DOC-ARCH-001');
    expect(result.success).toBe(true);
    const doc = documentsStore.all.find(d => d.docId === 'DOC-ARCH-001');
    expect(doc.recordState).toBe('active');
  });
});

describe('Document actions — state-based behavior', () => {
  it('pending generation doc has correct initial state', async () => {
    documentsStore.persist([{
      docId: 'DOC-STATE-001', name: 'Test Pending',
      docType: DOCUMENT_TYPE.GENERATED, stage: DOCUMENT_STAGE.RFQ,
      source: DOCUMENT_TYPE.GENERATED,
      generationStatus: 'Pending', status: 'Pending Generation',
      sourceUrl: '', fileSize: 0, recordState: 'active',
      uploadedAt: '2026-08-20T10:00:00Z',
    }]);

    const doc = await documentsService.getDocument('DOC-STATE-001');
    expect(doc.generationStatus).toBe('Pending');
    expect(doc.status).toBe('Pending Generation');
    expect(doc.sourceUrl).toBe('');
    expect(doc.fileSize).toBe(0);
  });

  it('generated doc has file content', async () => {
    documentsStore.persist([{
      docId: 'DOC-STATE-002', name: 'Test Generated',
      docType: DOCUMENT_TYPE.GENERATED, stage: DOCUMENT_STAGE.PO,
      source: DOCUMENT_TYPE.GENERATED,
      generationStatus: 'Generated', status: 'Generated',
      sourceUrl: 'data:application/pdf;base64,JVBERi0',
      fileSize: 2048, fileSizeLabel: '2 KB',
      recordState: 'active',
      uploadedAt: '2026-08-20T10:00:00Z',
    }]);

    const doc = await documentsService.getDocument('DOC-STATE-002');
    expect(doc.generationStatus).toBe('Generated');
    expect(doc.sourceUrl).toBeTruthy();
    expect(doc.fileSize).toBe(2048);
  });

  it('stats counts pending generation separately', async () => {
    documentsStore.persist([
      { docId: 'DOC-STAT-1', name: 'A', source: DOCUMENT_TYPE.GENERATED, generationStatus: 'Generated', recordState: 'active', uploadedAt: '' },
      { docId: 'DOC-STAT-2', name: 'B', source: DOCUMENT_TYPE.GENERATED, generationStatus: 'Pending', recordState: 'active', uploadedAt: '' },
      { docId: 'DOC-STAT-3', name: 'C', source: DOCUMENT_TYPE.UPLOADED, recordState: 'active', uploadedAt: '' },
      { docId: 'DOC-STAT-4', name: 'D', source: DOCUMENT_TYPE.GENERATED, generationStatus: 'Pending', recordState: 'active', uploadedAt: '' },
    ]);

    const stats = await documentsService.getStats();
    expect(stats.generated).toBe(3);
    expect(stats.pendingGeneration).toBe(2);
    expect(stats.uploaded).toBe(1);
  });

  it('delete soft-deletes and removes from active count', async () => {
    documentsStore.persist([
      { docId: 'DOC-DEL-1', name: 'Delete Me', source: DOCUMENT_TYPE.UPLOADED, recordState: 'active', uploadedAt: '' },
    ]);

    await documentsService.deleteDocument('DOC-DEL-1');
    const doc = documentsStore.all.find(d => d.docId === 'DOC-DEL-1');
    expect(doc.recordState).toBe('deleted');
    const stats = await documentsService.getStats();
    expect(stats.total).toBe(0);
  });

  it('archive soft-archives and removes from active count', async () => {
    documentsStore.persist([
      { docId: 'DOC-ARC-1', name: 'Archive Me', source: DOCUMENT_TYPE.UPLOADED, recordState: 'active', uploadedAt: '' },
    ]);

    await documentsService.archiveDocument('DOC-ARC-1');
    const doc = documentsStore.all.find(d => d.docId === 'DOC-ARC-1');
    expect(doc.recordState).toBe('archived');
  });
});
