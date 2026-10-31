/**
 * purchase/services/documentRegistration.test.js
 * ------------------------------------------------------------------
 * Tests for the automatic document registration service.
 *
 * Proves: source document → generated PDF → repository → preview → download
 * for every document type (PR, RFQ, PO, Invoice, NFA, Vendor, etc.)
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerGeneratedDocument,
  updateGeneratedDocumentUrl,
  isGeneratedDocumentRegistered,
  getGeneratedDocument,
  ensureGeneratedDocument,
  generatedDocId,
  DOC_TYPE_MAP
} from './documentRegistration';
import { DOCUMENT_STAGE, DOCUMENT_TYPE } from '../constants';
import { documentsStore, DOCUMENT_FOLDER } from './documents';

/* ─── Reset the document store between tests ─── */
beforeEach(() => {
  documentsStore.persist([]);
});

/* ================================================================== */
/*  DOC_TYPE_MAP constants                                             */
/* ================================================================== */
describe('DOC_TYPE_MAP', () => {
  it('has entries for all standard document types', () => {
    expect(DOC_TYPE_MAP.PR).toBeDefined();
    expect(DOC_TYPE_MAP.RFQ).toBeDefined();
    expect(DOC_TYPE_MAP.PO).toBeDefined();
    expect(DOC_TYPE_MAP.INVOICE).toBeDefined();
    expect(DOC_TYPE_MAP.NFA).toBeDefined();
    expect(DOC_TYPE_MAP.VENDOR).toBeDefined();
    expect(DOC_TYPE_MAP.QUOTATION).toBeDefined();
    expect(DOC_TYPE_MAP.TECHNICAL_EVALUATION).toBeDefined();
    expect(DOC_TYPE_MAP.SUPPLIER_ACK).toBeDefined();
    expect(DOC_TYPE_MAP.GRN).toBeDefined();
    expect(DOC_TYPE_MAP.REPORT).toBeDefined();
  });

  it('each entry has stage, folder, label, prefix', () => {
    for (const [key, config] of Object.entries(DOC_TYPE_MAP)) {
      expect(config.stage, `${key} missing stage`).toBeDefined();
      expect(config.folder, `${key} missing folder`).toBeDefined();
      expect(config.label, `${key} missing label`).toBeDefined();
      expect(config.prefix, `${key} missing prefix`).toBeDefined();
    }
  });

  it('PR maps to correct stage and folder', () => {
    expect(DOC_TYPE_MAP.PR.stage).toBe(DOCUMENT_STAGE.PR);
    expect(DOC_TYPE_MAP.PR.folder).toBe(DOCUMENT_FOLDER.PR.key);
  });

  it('RFQ maps to correct stage and folder', () => {
    expect(DOC_TYPE_MAP.RFQ.stage).toBe(DOCUMENT_STAGE.RFQ);
    expect(DOC_TYPE_MAP.RFQ.folder).toBe(DOCUMENT_FOLDER.RFQ.key);
  });

  it('PO maps to correct stage and folder', () => {
    expect(DOC_TYPE_MAP.PO.stage).toBe(DOCUMENT_STAGE.PO);
    expect(DOC_TYPE_MAP.PO.folder).toBe(DOCUMENT_FOLDER.PO.key);
  });

  it('INVOICE maps to correct stage and folder', () => {
    expect(DOC_TYPE_MAP.INVOICE.stage).toBe(DOCUMENT_STAGE.INVOICE);
    expect(DOC_TYPE_MAP.INVOICE.folder).toBe(DOCUMENT_FOLDER.INVOICE.key);
  });

  it('NFA maps to correct stage and folder', () => {
    expect(DOC_TYPE_MAP.NFA.stage).toBe(DOCUMENT_STAGE.NFA);
    expect(DOC_TYPE_MAP.NFA.folder).toBe(DOCUMENT_FOLDER.NFA.key);
  });

  it('SUPPLIER_ACK maps to PO stage and folder', () => {
    expect(DOC_TYPE_MAP.SUPPLIER_ACK.stage).toBe(DOCUMENT_STAGE.PO);
    expect(DOC_TYPE_MAP.SUPPLIER_ACK.folder).toBe(DOCUMENT_FOLDER.PO.key);
  });

  it('TECHNICAL_EVALUATION maps to SELECTION stage and TSR folder', () => {
    expect(DOC_TYPE_MAP.TECHNICAL_EVALUATION.stage).toBe(DOCUMENT_STAGE.SELECTION);
    expect(DOC_TYPE_MAP.TECHNICAL_EVALUATION.folder).toBe(DOCUMENT_FOLDER.TSR.key);
  });

  it('REPORT maps to OTHER stage and REPORTS folder', () => {
    expect(DOC_TYPE_MAP.REPORT.stage).toBe(DOCUMENT_STAGE.OTHER);
    expect(DOC_TYPE_MAP.REPORT.folder).toBe(DOCUMENT_FOLDER.REPORTS.key);
  });
});

/* ================================================================== */
/*  generatedDocId                                                     */
/* ================================================================== */
describe('generatedDocId', () => {
  it('produces stable docId from type + sourceId', () => {
    expect(generatedDocId('PR', 'PR-001')).toBe('DOC-GEN-PR-PR-001');
    expect(generatedDocId('PO', 'PO-42')).toBe('DOC-GEN-PO-PO-42');
    expect(generatedDocId('INVOICE', 'INV-7')).toBe('DOC-GEN-INVOICE-INV-7');
  });

  it('same inputs always produce same docId', () => {
    const id1 = generatedDocId('RFQ', 'RFQ-100');
    const id2 = generatedDocId('RFQ', 'RFQ-100');
    expect(id1).toBe(id2);
  });

  it('different types produce different docIds', () => {
    expect(generatedDocId('PR', 'X')).not.toBe(generatedDocId('PO', 'X'));
  });
});

/* ================================================================== */
/*  registerGeneratedDocument — create new                              */
/* ================================================================== */
describe('registerGeneratedDocument — create', () => {
  it('creates a new document record with correct fields', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-2026-001',
      name: 'Purchase Requisition — PR-2026-001.pdf'
    });

    expect(doc).toBeDefined();
    expect(doc.docId).toBe('DOC-GEN-PR-PR-001');
    expect(doc.name).toBe('Purchase Requisition — PR-2026-001.pdf');
    expect(doc.docType).toBe(DOCUMENT_TYPE.GENERATED);
    expect(doc.docNo).toBe('PR-2026-001');
    expect(doc.stage).toBe(DOCUMENT_STAGE.PR);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.PR.key);
    expect(doc.version).toBe(1);
    expect(doc.status).toBe('Final');
    expect(doc.recordState).toBe('active');
    expect(doc.uploadedAt).toBeDefined();
    expect(doc.updatedAt).toBeDefined();
  });

  it('stores metadata (vendor, prNo, rfqNo)', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-2026-001',
      name: 'PR.pdf',
      metadata: { vendor: 'Tata Steel', prNo: 'PR-2026-001', rfqNo: 'RFQ-001' }
    });

    expect(doc.vendor).toBe('Tata Steel');
    expect(doc.prNo).toBe('PR-2026-001');
    expect(doc.rfqNo).toBe('RFQ-001');
  });

  it('persists to documentsStore', async () => {
    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-001',
      name: 'PR.pdf'
    });

    const stored = documentsStore.all.find((d) => d.docId === 'DOC-GEN-PR-PR-001');
    expect(stored).toBeDefined();
    expect(stored.name).toBe('PR.pdf');
  });

  it('RFQ registration creates correct record', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'RFQ',
      sourceId: 'RFQ-001',
      docNo: 'RFQ-2026-001',
      name: 'RFQ.pdf',
      metadata: { rfqNo: 'RFQ-2026-001', prNo: 'PR-001' }
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.RFQ);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.RFQ.key);
    expect(doc.rfqNo).toBe('RFQ-2026-001');
    expect(doc.prNo).toBe('PR-001');
  });

  it('PO registration creates correct record', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'PO-001',
      docNo: 'PO-2026-001',
      name: 'PO.pdf',
      metadata: { poNo: 'PO-2026-001', vendor: 'ABB' }
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.PO);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.PO.key);
    expect(doc.poNo).toBe('PO-2026-001');
    expect(doc.vendor).toBe('ABB');
  });

  it('Invoice registration creates correct record', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'INVOICE',
      sourceId: 'INV-001',
      docNo: 'INV-2026-001',
      name: 'Invoice.pdf',
      metadata: { poNo: 'PO-001', vendor: 'Siemens' }
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.INVOICE);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.INVOICE.key);
  });

  it('NFA registration creates correct record', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'NFA',
      sourceId: 'NFA-001',
      docNo: 'NFA-2026-001',
      name: 'NFA.pdf',
      metadata: { rfqNo: 'RFQ-001', vendor: 'L&T' }
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.NFA);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.NFA.key);
  });

  it('Supplier acknowledgement maps to PO folder', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'SUPPLIER_ACK',
      sourceId: 'PO-001',
      docNo: 'PO-2026-001',
      name: 'Acknowledgement.pdf'
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.PO);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.PO.key);
  });

  it('Technical evaluation maps to TSR folder', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'TECHNICAL_EVALUATION',
      sourceId: 'RFQ-001',
      docNo: 'RFQ-001',
      name: 'Technical Evaluation.pdf'
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.SELECTION);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.TSR.key);
  });

  it('Report maps to REPORTS folder', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'REPORT',
      sourceId: 'RPT-001',
      docNo: 'RPT-001',
      name: 'Spend Report.pdf'
    });

    expect(doc.stage).toBe(DOCUMENT_STAGE.OTHER);
    expect(doc.folder).toBe(DOCUMENT_FOLDER.REPORTS.key);
  });
});

/* ================================================================== */
/*  registerGeneratedDocument — update (no duplicates)                 */
/* ================================================================== */
describe('registerGeneratedDocument — update (no duplicates)', () => {
  it('does not create duplicate records for same source', async () => {
    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-001',
      name: 'PR v1.pdf'
    });

    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-001',
      name: 'PR v2.pdf'
    });

    const prDocs = documentsStore.all.filter((d) => d.docId === 'DOC-GEN-PR-PR-001');
    expect(prDocs).toHaveLength(1);
  });

  it('increments version on re-generation', async () => {
    await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'PO-001',
      docNo: 'PO-001',
      name: 'PO v1.pdf'
    });

    const v2 = await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'PO-001',
      docNo: 'PO-001',
      name: 'PO v2.pdf'
    });

    expect(v2.version).toBe(2);
    expect(v2.name).toBe('PO v2.pdf');
  });

  it('updates timestamp on re-generation', async () => {
    await registerGeneratedDocument({
      docType: 'RFQ',
      sourceId: 'RFQ-001',
      docNo: 'RFQ-001',
      name: 'RFQ v1.pdf'
    });

    const first = getGeneratedDocument('RFQ', 'RFQ-001');
    const firstTime = first.updatedAt;

    /* Small delay to ensure different timestamp */
    await new Promise((r) => setTimeout(r, 10));

    const updated = await registerGeneratedDocument({
      docType: 'RFQ',
      sourceId: 'RFQ-001',
      docNo: 'RFQ-001',
      name: 'RFQ v2.pdf'
    });

    expect(updated.updatedAt).not.toBe(firstTime);
  });

  it('preserves source linkage on update', async () => {
    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-2026-001',
      name: 'PR.pdf',
      metadata: { vendor: 'Tata Steel' }
    });

    const updated = await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-001',
      docNo: 'PR-2026-001',
      name: 'PR updated.pdf'
    });

    expect(updated.docNo).toBe('PR-2026-001');
    expect(updated.sourceId).toBe('PR-001');
    expect(updated.name).toBe('PR updated.pdf');
  });
});

/* ================================================================== */
/*  Source → PDF → Repository → Preview → Download                     */
/* ================================================================== */
describe('Source → PDF → Repository → Preview → Download flow', () => {
  it('PR: source → generated → repository → preview → download', async () => {
    /* 1. Source document creates the record */
    const doc = await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'pr-123',
      docNo: 'PR-2026-012',
      name: 'Purchase Requisition — PR-2026-012.pdf',
      metadata: { prNo: 'PR-2026-012', vendor: 'Siemens' }
    });

    /* 2. Document is in the repository */
    expect(isGeneratedDocumentRegistered('PR', 'pr-123')).toBe(true);
    const found = getGeneratedDocument('PR', 'pr-123');
    expect(found).toBeDefined();
    expect(found.docId).toBe(doc.docId);

    /* 3. Preview reads from repository */
    const previewDoc = documentsStore.all.find((d) => d.docId === doc.docId);
    expect(previewDoc.name).toContain('PR-2026-012');
    expect(previewDoc.stage).toBe(DOCUMENT_STAGE.PR);

    /* 4. Download uses sourceUrl (set after PDF generation) */
    await updateGeneratedDocumentUrl('PR', 'pr-123', 'data:application/pdf;base64,test', 1024);
    const downloadDoc = getGeneratedDocument('PR', 'pr-123');
    expect(downloadDoc.sourceUrl).toBe('data:application/pdf;base64,test');
    expect(downloadDoc.fileSize).toBe(1024);
  });

  it('RFQ: source → generated → repository → preview → download', async () => {
    await registerGeneratedDocument({
      docType: 'RFQ',
      sourceId: 'rfq-456',
      docNo: 'RFQ-2026-045',
      name: 'RFQ.pdf',
      metadata: { rfqNo: 'RFQ-2026-045', prNo: 'PR-001', vendor: 'ABB' }
    });

    expect(isGeneratedDocumentRegistered('RFQ', 'rfq-456')).toBe(true);
    const found = getGeneratedDocument('RFQ', 'rfq-456');
    expect(found.rfqNo).toBe('RFQ-2026-045');
    expect(found.stage).toBe(DOCUMENT_STAGE.RFQ);
    expect(found.folder).toBe(DOCUMENT_FOLDER.RFQ.key);
  });

  it('PO: source → generated → repository → preview → download', async () => {
    await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'po-789',
      docNo: 'PO-2026-078',
      name: 'PO.pdf',
      metadata: { poNo: 'PO-2026-078', vendor: 'Bosch' }
    });

    expect(isGeneratedDocumentRegistered('PO', 'po-789')).toBe(true);
    const found = getGeneratedDocument('PO', 'po-789');
    expect(found.poNo).toBe('PO-2026-078');
    expect(found.vendor).toBe('Bosch');
    expect(found.stage).toBe(DOCUMENT_STAGE.PO);
  });

  it('Invoice: source → generated → repository → preview → download', async () => {
    await registerGeneratedDocument({
      docType: 'INVOICE',
      sourceId: 'inv-101',
      docNo: 'INV-2026-101',
      name: 'Invoice.pdf',
      metadata: { poNo: 'PO-001', vendor: 'Godrej' }
    });

    expect(isGeneratedDocumentRegistered('INVOICE', 'inv-101')).toBe(true);
    const found = getGeneratedDocument('INVOICE', 'inv-101');
    expect(found.stage).toBe(DOCUMENT_STAGE.INVOICE);
    expect(found.folder).toBe(DOCUMENT_FOLDER.INVOICE.key);
  });

  it('NFA: source → generated → repository → preview → download', async () => {
    await registerGeneratedDocument({
      docType: 'NFA',
      sourceId: 'nfa-202',
      docNo: 'NFA-2026-202',
      name: 'NFA.pdf',
      metadata: { rfqNo: 'RFQ-001', vendor: 'L&T' }
    });

    expect(isGeneratedDocumentRegistered('NFA', 'nfa-202')).toBe(true);
    const found = getGeneratedDocument('NFA', 'nfa-202');
    expect(found.stage).toBe(DOCUMENT_STAGE.NFA);
    expect(found.folder).toBe(DOCUMENT_FOLDER.NFA.key);
  });

  it('re-generation creates new version, not duplicate', async () => {
    /* First generation */
    await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'po-001',
      docNo: 'PO-001',
      name: 'PO v1.pdf'
    });

    /* Re-generation (e.g. after edit) */
    await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'po-001',
      docNo: 'PO-001',
      name: 'PO v2.pdf'
    });

    /* Third generation */
    await registerGeneratedDocument({
      docType: 'PO',
      sourceId: 'po-001',
      docNo: 'PO-001',
      name: 'PO v3.pdf'
    });

    const doc = getGeneratedDocument('PO', 'po-001');
    expect(doc.version).toBe(3);
    expect(doc.name).toBe('PO v3.pdf');

    /* Only one record exists */
    const allPoDocs = documentsStore.all.filter((d) => d.sourceId === 'po-001');
    expect(allPoDocs).toHaveLength(1);
  });
});

/* ================================================================== */
/*  ensureGeneratedDocument                                            */
/* ================================================================== */
describe('ensureGeneratedDocument', () => {
  it('creates if missing', async () => {
    const doc = await ensureGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-new',
      docNo: 'PR-new',
      name: 'PR.pdf'
    });

    expect(doc).toBeDefined();
    expect(doc.docId).toBe('DOC-GEN-PR-PR-new');
  });

  it('returns existing if already registered', async () => {
    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-existing',
      docNo: 'PR-existing',
      name: 'PR.pdf'
    });

    const doc = await ensureGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-existing',
      docNo: 'PR-existing',
      name: 'PR different name.pdf'
    });

    /* Should return the existing record, not create a new one */
    expect(doc.name).toBe('PR.pdf');
    expect(doc.version).toBe(1);
  });
});

/* ================================================================== */
/*  updateGeneratedDocumentUrl                                         */
/* ================================================================== */
describe('updateGeneratedDocumentUrl', () => {
  it('updates sourceUrl on an existing record', async () => {
    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-url',
      docNo: 'PR-url',
      name: 'PR.pdf'
    });

    const updated = await updateGeneratedDocumentUrl(
      'PR', 'PR-url', 'data:application/pdf;base64,abc', 2048
    );

    expect(updated.sourceUrl).toBe('data:application/pdf;base64,abc');
    expect(updated.fileSize).toBe(2048);
    expect(updated.fileSizeLabel).toContain('2');
  });

  it('returns null for non-existent document', async () => {
    const result = await updateGeneratedDocumentUrl(
      'PR', 'PR-nonexistent', 'data:...', 0
    );
    expect(result).toBeNull();
  });
});

/* ================================================================== */
/*  isGeneratedDocumentRegistered                                      */
/* ================================================================== */
describe('isGeneratedDocumentRegistered', () => {
  it('returns false for unregistered documents', () => {
    expect(isGeneratedDocumentRegistered('PR', 'PR-unknown')).toBe(false);
  });

  it('returns true after registration', async () => {
    await registerGeneratedDocument({
      docType: 'PR',
      sourceId: 'PR-check',
      docNo: 'PR-check',
      name: 'PR.pdf'
    });
    expect(isGeneratedDocumentRegistered('PR', 'PR-check')).toBe(true);
  });
});

/* ================================================================== */
/*  Unknown docType handling                                           */
/* ================================================================== */
describe('Unknown docType handling', () => {
  it('returns null for unknown docType', async () => {
    const doc = await registerGeneratedDocument({
      docType: 'UNKNOWN_TYPE',
      sourceId: 'X',
      docNo: 'X',
      name: 'X.pdf'
    });
    expect(doc).toBeNull();
  });
});
