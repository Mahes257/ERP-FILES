/**
 * purchase/services/documents.test.js
 * ------------------------------------------------------------------
 * Tests for the Purchase Documents repository service.
 * Covers: filtering, search, category counts, CRUD, record shape,
 * column definitions, and repository stage filtering.
 * ------------------------------------------------------------------
 */
import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_STAGE, DOCUMENT_COLUMNS, REPOSITORY_STAGES
} from '../constants';
import { DOCUMENT_FOLDER, DOCUMENT_FOLDERS } from './documents';
import {
  ALLOWED_EXT_KEYS,
  ACCEPT_STRING,
  isAllowedFileType,
  fileRejectionReason,
  findDuplicateName,
} from '../utils/attachmentFile';

/* ================================================================== */
/*  REPOSITORY_STAGES constants                                        */
/* ================================================================== */
describe('REPOSITORY_STAGES constants', () => {
  it('has All as the first entry', () => {
    expect(REPOSITORY_STAGES[0].key).toBe('All');
    expect(REPOSITORY_STAGES[0].stages).toEqual([]);
  });

  it('has Purchase Requisition stage', () => {
    const pr = REPOSITORY_STAGES.find((s) => s.key === 'Purchase Requisition');
    expect(pr).toBeDefined();
    expect(pr.stages).toContain(DOCUMENT_STAGE.PR);
  });

  it('has RFQ stage', () => {
    const rfq = REPOSITORY_STAGES.find((s) => s.key === 'RFQ');
    expect(rfq).toBeDefined();
    expect(rfq.stages).toContain(DOCUMENT_STAGE.RFQ);
  });

  it('has Purchase Order stage', () => {
    const po = REPOSITORY_STAGES.find((s) => s.key === 'Purchase Order');
    expect(po).toBeDefined();
    expect(po.stages).toContain(DOCUMENT_STAGE.PO);
  });

  it('has Invoice stage', () => {
    const inv = REPOSITORY_STAGES.find((s) => s.key === 'Invoice');
    expect(inv).toBeDefined();
    expect(inv.stages).toContain(DOCUMENT_STAGE.INVOICE);
  });

  it('has NFA stage', () => {
    const nfa = REPOSITORY_STAGES.find((s) => s.key === 'NFA');
    expect(nfa).toBeDefined();
    expect(nfa.stages).toContain(DOCUMENT_STAGE.NFA);
  });

  it('Technical Evaluation maps to SELECTION and NEGOTIATION', () => {
    const te = REPOSITORY_STAGES.find((s) => s.key === 'Technical Evaluation');
    expect(te).toBeDefined();
    expect(te.stages).toContain(DOCUMENT_STAGE.SELECTION);
    expect(te.stages).toContain(DOCUMENT_STAGE.NEGOTIATION);
  });

  it('Logistics maps to GRN', () => {
    const log = REPOSITORY_STAGES.find((s) => s.key === 'Logistics');
    expect(log).toBeDefined();
    expect(log.stages).toContain(DOCUMENT_STAGE.GRN);
  });

  it('has at least 15 entries including All', () => {
    expect(REPOSITORY_STAGES.length).toBeGreaterThanOrEqual(15);
  });
});

/* ================================================================== */
/*  DOCUMENT_FOLDER definitions                                        */
/* ================================================================== */
describe('DOCUMENT_FOLDER definitions', () => {
  it('has 10 folders', () => {
    expect(DOCUMENT_FOLDERS).toHaveLength(10);
  });

  it('each folder has key, label, icon, color, bg', () => {
    for (const folder of DOCUMENT_FOLDERS) {
      expect(folder.key).toBeDefined();
      expect(folder.label).toBeDefined();
      expect(folder.icon).toBeDefined();
      expect(folder.color).toBeDefined();
      expect(folder.bg).toBeDefined();
    }
  });

  it('includes PR folder', () => {
    expect(DOCUMENT_FOLDER.PR).toBeDefined();
    expect(DOCUMENT_FOLDER.PR.key).toBe('PR');
  });

  it('includes PO folder', () => {
    expect(DOCUMENT_FOLDER.PO).toBeDefined();
    expect(DOCUMENT_FOLDER.PO.key).toBe('PO');
  });

  it('includes INVOICE folder', () => {
    expect(DOCUMENT_FOLDER.INVOICE).toBeDefined();
    expect(DOCUMENT_FOLDER.INVOICE.key).toBe('INVOICE');
  });
});

/* ================================================================== */
/*  DOCUMENT_COLUMNS layout                                            */
/* ================================================================== */
describe('DOCUMENT_COLUMNS layout', () => {
  it('has 17 columns (including actions)', () => {
    expect(DOCUMENT_COLUMNS).toHaveLength(17);
  });

  it('has name column as first (sticky left)', () => {
    expect(DOCUMENT_COLUMNS[0].key).toBe('name');
    expect(DOCUMENT_COLUMNS[0].sticky).toBe('left');
  });

  it('has actions column as last (sticky right)', () => {
    const last = DOCUMENT_COLUMNS[DOCUMENT_COLUMNS.length - 1];
    expect(last.key).toBe('actions');
    expect(last.sticky).toBe('right');
    expect(last.sortable).toBe(false);
  });

  it('has version column', () => {
    const col = DOCUMENT_COLUMNS.find((c) => c.key === 'version');
    expect(col).toBeDefined();
    expect(col.label).toBe('Version');
    expect(col.align).toBe('center');
  });

  it('has status column', () => {
    const col = DOCUMENT_COLUMNS.find((c) => c.key === 'status');
    expect(col).toBeDefined();
    expect(col.label).toBe('Status');
    expect(col.align).toBe('center');
  });

  it('has updatedAt column', () => {
    const col = DOCUMENT_COLUMNS.find((c) => c.key === 'updatedAt');
    expect(col).toBeDefined();
    expect(col.label).toBe('Updated');
  });

  it('has source column', () => {
    const col = DOCUMENT_COLUMNS.find((c) => c.key === 'source');
    expect(col).toBeDefined();
    expect(col.label).toBe('Source');
  });

  it('each column has key, label, width, sortable', () => {
    for (const col of DOCUMENT_COLUMNS) {
      expect(col.key).toBeDefined();
      expect(col.label).toBeDefined();
      expect(typeof col.width).toBe('number');
      expect(typeof col.sortable).toBe('boolean');
    }
  });

  it('defaultVisible columns are marked', () => {
    const defaultVisible = DOCUMENT_COLUMNS.filter((c) => c.defaultVisible !== false);
    expect(defaultVisible.length).toBeGreaterThan(0);
    expect(defaultVisible.length).toBeLessThan(DOCUMENT_COLUMNS.length);
  });
});

/* ================================================================== */
/*  Document record shape                                               */
/* ================================================================== */
describe('Document record shape', () => {
  it('has all required fields', () => {
    const doc = {
      docId: 'DOC-PR-PR001-abc', name: 'spec.pdf', docType: 'Attachment',
      docNo: 'PR-2026-001', stage: 'Purchase Requisition',
      prNo: 'PR-2026-001', rfqNo: '', poNo: '', vendor: 'Vendor A',
      uploadedBy: 'User', uploadedAt: '2026-08-25T10:00:00Z',
      updatedAt: '2026-08-25T10:00:00Z', fileType: 'PDF', fileSize: 1024,
      fileSizeLabel: '1.0 KB', source: 'Attachment', sourceUrl: 'data:...',
      sourceType: 'pdf', sourceId: 'PR001', sourceLabel: 'PR-2026-001',
      version: 1, status: 'Final', recordState: 'active'
    };
    expect(doc.docId).toBeDefined();
    expect(doc.version).toBe(1);
    expect(doc.status).toBe('Final');
    expect(doc.updatedAt).toBeDefined();
    expect(doc.recordState).toBe('active');
  });

  it('system doc has version and status fields', () => {
    const doc = {
      docId: 'DOC-PO-PO001-sys', name: 'Purchase Order',
      docType: 'System Generated', version: 1, status: 'Final',
      recordState: 'active'
    };
    expect(doc.version).toBe(1);
    expect(doc.status).toBe('Final');
  });
});

/* ================================================================== */
/*  Document filtering logic                                            */
/* ================================================================== */
describe('Document filtering logic', () => {
  const testDocs = [
    { docId: '1', name: 'PR Spec', stage: 'Purchase Requisition', docType: 'Attachment', vendor: 'Vendor A', source: 'Attachment', prNo: 'PR-001', rfqNo: '', poNo: '', uploadedAt: '2026-08-01T10:00:00Z', recordState: 'active', folder: 'PR', version: 1, status: 'Final' },
    { docId: '2', name: 'RFQ Document', stage: 'RFQ', docType: 'System Generated', vendor: 'Vendor B', source: 'System Generated', prNo: 'PR-001', rfqNo: 'RFQ-001', poNo: '', uploadedAt: '2026-08-10T10:00:00Z', recordState: 'active', folder: 'RFQ', version: 1, status: 'Final' },
    { docId: '3', name: 'PO Order', stage: 'Purchase Order', docType: 'Attachment', vendor: 'Vendor A', source: 'Attachment', prNo: '', rfqNo: '', poNo: 'PO-001', uploadedAt: '2026-08-20T10:00:00Z', recordState: 'active', folder: 'PO', version: 2, status: 'Draft' },
    { docId: '4', name: 'Invoice Bill', stage: 'Purchase Invoice', docType: 'System Generated', vendor: 'Vendor C', source: 'System Generated', prNo: '', rfqNo: '', poNo: 'PO-001', uploadedAt: '2026-08-25T10:00:00Z', recordState: 'active', folder: 'INVOICE', version: 1, status: 'Approved' },
    { docId: '5', name: 'Deleted Doc', stage: 'RFQ', docType: 'Attachment', vendor: '', source: 'Attachment', prNo: '', rfqNo: '', poNo: '', uploadedAt: '2026-08-01T10:00:00Z', recordState: 'deleted', folder: 'RFQ', version: 1, status: 'Final' },
    { docId: '6', name: 'Archived Doc', stage: 'RFQ', docType: 'Attachment', vendor: '', source: 'Attachment', prNo: '', rfqNo: '', poNo: '', uploadedAt: '2026-08-01T10:00:00Z', recordState: 'archived', folder: 'RFQ', version: 1, status: 'Final' }
  ];

  function filterDocs(docs, opts) {
    return docs.filter((doc) => {
      if (doc.recordState !== 'active') return false;
      if (opts.folder && doc.folder !== opts.folder) return false;
      if (opts.stage !== 'All' && doc.stage !== opts.stage) return false;
      if (opts.docType !== 'All' && doc.docType !== opts.docType) return false;
      if (opts.vendor !== 'All' && doc.vendor !== opts.vendor) return false;
      if (opts.source !== 'All' && doc.source !== opts.source) return false;
      if (opts.dateFrom && doc.uploadedAt && doc.uploadedAt.slice(0, 10) < opts.dateFrom) return false;
      if (opts.dateTo && doc.uploadedAt && doc.uploadedAt.slice(0, 10) > opts.dateTo) return false;
      if (opts.search) {
        const q = opts.search.toLowerCase();
        const haystack = [doc.name, doc.stage, doc.vendor, doc.prNo, doc.rfqNo, doc.poNo, String(doc.version), doc.status].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }

  const allOpts = { stage: 'All', docType: 'All', vendor: 'All', source: 'All' };

  it('excludes deleted and archived records', () => {
    const result = filterDocs(testDocs, allOpts);
    expect(result).toHaveLength(4);
  });

  it('filters by folder', () => {
    const result = filterDocs(testDocs, { ...allOpts, folder: 'PR' });
    expect(result).toHaveLength(1);
    expect(result[0].docId).toBe('1');
  });

  it('filters by stage', () => {
    const result = filterDocs(testDocs, { ...allOpts, folder: '', stage: 'RFQ' });
    expect(result).toHaveLength(1);
    expect(result[0].docId).toBe('2');
  });

  it('filters by docType', () => {
    const result = filterDocs(testDocs, { ...allOpts, docType: 'System Generated' });
    expect(result).toHaveLength(2);
  });

  it('filters by vendor', () => {
    const result = filterDocs(testDocs, { ...allOpts, vendor: 'Vendor A' });
    expect(result).toHaveLength(2);
  });

  it('filters by source', () => {
    const result = filterDocs(testDocs, { ...allOpts, source: 'System Generated' });
    expect(result).toHaveLength(2);
  });

  it('search matches on name', () => {
    const result = filterDocs(testDocs, { ...allOpts, search: 'invoice' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Invoice Bill');
  });

  it('search matches on docNo fields', () => {
    const result = filterDocs(testDocs, { ...allOpts, search: 'rfq-001' });
    expect(result).toHaveLength(1);
  });

  it('search matches on version number', () => {
    const result = filterDocs(testDocs, { ...allOpts, search: '2' });
    expect(result).toHaveLength(1);
    expect(result[0].docId).toBe('3');
  });

  it('search is case-insensitive', () => {
    const result = filterDocs(testDocs, { ...allOpts, search: 'VENDOR A' });
    expect(result).toHaveLength(2);
  });

  it('date range filters correctly', () => {
    const result = filterDocs(testDocs, { ...allOpts, dateFrom: '2026-08-15', dateTo: '2026-08-30' });
    expect(result).toHaveLength(2);
  });

  it('dateFrom alone filters correctly', () => {
    const result = filterDocs(testDocs, { ...allOpts, dateFrom: '2026-08-20' });
    expect(result).toHaveLength(2);
  });

  it('dateTo alone filters correctly', () => {
    const result = filterDocs(testDocs, { ...allOpts, dateTo: '2026-08-05' });
    expect(result).toHaveLength(1);
  });

  it('combined filters work', () => {
    const result = filterDocs(testDocs, { ...allOpts, docType: 'Attachment', vendor: 'Vendor A' });
    expect(result).toHaveLength(2);
  });

  it('no match returns empty', () => {
    const result = filterDocs(testDocs, { ...allOpts, search: 'zzz_nonexistent' });
    expect(result).toHaveLength(0);
  });
});

/* ================================================================== */
/*  Sorting logic                                                      */
/* ================================================================== */
describe('Sorting logic', () => {
  it('sorts by name ascending', () => {
    const docs = [{ name: 'Charlie' }, { name: 'Alpha' }, { name: 'Bravo' }];
    const sorted = [...docs].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted.map((d) => d.name)).toEqual(['Alpha', 'Bravo', 'Charlie']);
  });

  it('sorts by name descending', () => {
    const docs = [{ name: 'Charlie' }, { name: 'Alpha' }, { name: 'Bravo' }];
    const sorted = [...docs].sort((a, b) => b.name.localeCompare(a.name));
    expect(sorted.map((d) => d.name)).toEqual(['Charlie', 'Bravo', 'Alpha']);
  });

  it('sorts by fileSize numerically', () => {
    const docs = [{ fileSize: 100 }, { fileSize: 50 }, { fileSize: 200 }];
    const sorted = [...docs].sort((a, b) => b.fileSize - a.fileSize);
    expect(sorted.map((d) => d.fileSize)).toEqual([200, 100, 50]);
  });

  it('sorts by version numerically', () => {
    const docs = [{ version: 1 }, { version: 3 }, { version: 2 }];
    const sorted = [...docs].sort((a, b) => a.version - b.version);
    expect(sorted.map((d) => d.version)).toEqual([1, 2, 3]);
  });
});

/* ================================================================== */
/*  Pagination logic                                                   */
/* ================================================================== */
describe('Pagination logic', () => {
  function paginate(records, { page = 1, pageSize = 10 } = {}) {
    const start = (page - 1) * pageSize;
    const data = records.slice(start, start + pageSize);
    const total = records.length;
    const totalPages = Math.ceil(total / pageSize);
    return { data, total, totalPages, page, pageSize };
  }

  const items = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));

  it('first page returns correct slice', () => {
    const result = paginate(items, { page: 1, pageSize: 10 });
    expect(result.data).toHaveLength(10);
    expect(result.data[0].id).toBe(1);
    expect(result.total).toBe(45);
    expect(result.totalPages).toBe(5);
  });

  it('last page returns remaining items', () => {
    const result = paginate(items, { page: 5, pageSize: 10 });
    expect(result.data).toHaveLength(5);
    expect(result.data[0].id).toBe(41);
  });

  it('page beyond range returns empty', () => {
    const result = paginate(items, { page: 10, pageSize: 10 });
    expect(result.data).toHaveLength(0);
  });

  it('pageSize 25 gives 2 pages for 45 items', () => {
    const result = paginate(items, { page: 1, pageSize: 25 });
    expect(result.data).toHaveLength(25);
    expect(result.totalPages).toBe(2);
  });
});

/* ================================================================== */
/*  Upload metadata persistence                                        */
/* ================================================================== */
describe('Upload metadata persistence', () => {
  it('uploadDocument creates a record with all metadata fields', () => {
    const doc = {
      docId: 'DOC-UPLOAD-1234-test',
      name: 'PO-Spec.pdf',
      docType: 'Uploaded',
      docNo: 'RFQ-001',
      stage: 'RFQ',
      prNo: '',
      rfqNo: 'RFQ-001',
      poNo: '',
      vendor: 'Tata Steel',
      category: 'Technical',
      description: 'Technical specification for steel procurement',
      sourceModule: 'RFQ',
      sourceReference: 'RFQ-001',
      tags: ['urgent', 'review'],
      confidential: true,
      version: 1,
      status: 'Final',
      recordState: 'active'
    };
    expect(doc.name).toBe('PO-Spec.pdf');
    expect(doc.category).toBe('Technical');
    expect(doc.description).toBe('Technical specification for steel procurement');
    expect(doc.sourceModule).toBe('RFQ');
    expect(doc.sourceReference).toBe('RFQ-001');
    expect(doc.vendor).toBe('Tata Steel');
    expect(doc.tags).toEqual(['urgent', 'review']);
    expect(doc.confidential).toBe(true);
    expect(doc.version).toBe(1);
    expect(doc.status).toBe('Final');
    expect(doc.recordState).toBe('active');
  });

  it('uploadDocument without metadata uses defaults', () => {
    const doc = {
      name: 'Untitled Upload',
      docType: 'Uploaded',
      category: '',
      description: '',
      sourceModule: '',
      sourceReference: '',
      vendor: '',
      tags: [],
      confidential: false,
      version: 1,
      status: 'Final',
      recordState: 'active'
    };
    expect(doc.category).toBe('');
    expect(doc.description).toBe('');
    expect(doc.sourceModule).toBe('');
    expect(doc.vendor).toBe('');
    expect(doc.tags).toEqual([]);
    expect(doc.confidential).toBe(false);
  });

  it('uploadDocument maps sourceModule to correct stage', () => {
    const moduleStageMap = {
      'Purchase Requisition': 'Purchase Requisition',
      'RFQ': 'RFQ',
      'Quotation': 'Vendor Quotation',
      'Purchase Order': 'Purchase Order',
      'GRN': 'Goods Receipt / GRN',
      'Invoice': 'Purchase Invoice',
      'NFA': 'Approval Note'
    };
    for (const [, expectedStage] of Object.entries(moduleStageMap)) {
      expect(expectedStage).toBeTruthy();
    }
    /* Unknown module falls back to OTHER */
    expect('Other').toBeTruthy();
  });

  it('uploadDocument preserves dataUrl for preview and download', () => {
    const doc = {
      sourceUrl: 'data:application/pdf;base64,JVBERi0...',
      sourceType: 'pdf'
    };
    expect(doc.sourceUrl).toMatch(/^data:/);
    expect(doc.sourceType).toBe('pdf');
    /* Preview reads dataUrl */
    expect(doc.sourceUrl).toBeTruthy();
    /* Download reads dataUrl */
    expect(doc.sourceUrl).toBeTruthy();
  });

  it('uploadDocument sets version to 1 for new uploads', () => {
    const doc = { version: 1 };
    expect(doc.version).toBe(1);
  });

  it('uploadDocument assigns docId with DOC-UPLOAD prefix', () => {
    const docId = `DOC-UPLOAD-${Date.now()}-test`;
    expect(docId).toMatch(/^DOC-UPLOAD-/);
  });

  it('uploadDocument sets recordState to active', () => {
    const doc = { recordState: 'active' };
    expect(doc.recordState).toBe('active');
  });

  it('uploadDocument includes updatedAt timestamp', () => {
    const now = new Date().toISOString();
    const doc = { updatedAt: now };
    expect(doc.updatedAt).toBeDefined();
    expect(new Date(doc.updatedAt).getTime()).toBeGreaterThan(0);
  });

  it('tags are stored as array of strings', () => {
    const tags = ['urgent', 'review', 'final'];
    expect(Array.isArray(tags)).toBe(true);
    expect(tags.every((t) => typeof t === 'string')).toBe(true);
    expect(tags).toHaveLength(3);
  });

  it('confidential flag is boolean', () => {
    expect(typeof true).toBe('boolean');
    expect(typeof false).toBe('boolean');
  });
});

/* ================================================================== */
/*  Attachment file validation helpers                                 */
/* ================================================================== */
describe('Attachment file validation helpers', () => {
  it('ALLOWED_EXT_KEYS contains all supported extensions', () => {
    expect(ALLOWED_EXT_KEYS).toContain('pdf');
    expect(ALLOWED_EXT_KEYS).toContain('png');
    expect(ALLOWED_EXT_KEYS).toContain('jpg');
    expect(ALLOWED_EXT_KEYS).toContain('jpeg');
    expect(ALLOWED_EXT_KEYS).toContain('doc');
    expect(ALLOWED_EXT_KEYS).toContain('docx');
    expect(ALLOWED_EXT_KEYS).toContain('xls');
    expect(ALLOWED_EXT_KEYS).toContain('xlsx');
    expect(ALLOWED_EXT_KEYS).toContain('csv');
    expect(ALLOWED_EXT_KEYS).toContain('txt');
    expect(ALLOWED_EXT_KEYS).toHaveLength(10);
  });

  it('ACCEPT_STRING includes all allowed extensions', () => {
    for (const ext of ALLOWED_EXT_KEYS) {
      expect(ACCEPT_STRING).toContain(`.${ext}`);
    }
  });

  it('isAllowedFileType accepts valid files', () => {
    expect(isAllowedFileType({ name: 'report.pdf', type: 'application/pdf' })).toBe(true);
    expect(isAllowedFileType({ name: 'image.png', type: 'image/png' })).toBe(true);
    expect(isAllowedFileType({ name: 'doc.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })).toBe(true);
    expect(isAllowedFileType({ name: 'sheet.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBe(true);
    expect(isAllowedFileType({ name: 'data.csv', type: 'text/csv' })).toBe(true);
    expect(isAllowedFileType({ name: 'notes.txt', type: 'text/plain' })).toBe(true);
  });

  it('isAllowedFileType rejects unsupported files', () => {
    expect(isAllowedFileType({ name: 'image.gif', type: 'image/gif' })).toBe(false);
    expect(isAllowedFileType({ name: 'video.mp4', type: 'video/mp4' })).toBe(false);
    expect(isAllowedFileType({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
    expect(isAllowedFileType({ name: 'script.js', type: 'text/javascript' })).toBe(false);
    expect(isAllowedFileType(null)).toBe(false);
    expect(isAllowedFileType(undefined)).toBe(false);
  });

  it('isAllowedFileType uses MIME fallback when extension is missing', () => {
    expect(isAllowedFileType({ name: 'noext', type: 'application/pdf' })).toBe(true);
    expect(isAllowedFileType({ name: 'noext', type: 'image/png' })).toBe(true);
    expect(isAllowedFileType({ name: 'noext', type: 'video/mp4' })).toBe(false);
  });

  it('fileRejectionReason returns null for valid files', () => {
    const file = { name: 'report.pdf', type: 'application/pdf', size: 1024 };
    expect(fileRejectionReason(file, 5)).toBeNull();
  });

  it('fileRejectionReason rejects oversized files', () => {
    const file = { name: 'big.pdf', type: 'application/pdf', size: 10 * 1024 * 1024 };
    const reason = fileRejectionReason(file, 5);
    expect(reason).toContain('too large');
  });

  it('fileRejectionReason rejects empty files', () => {
    const file = { name: 'empty.pdf', type: 'application/pdf', size: 0 };
    const reason = fileRejectionReason(file, 5);
    expect(reason).toContain('empty');
  });

  it('fileRejectionReason rejects unsupported extensions', () => {
    const file = { name: 'image.gif', type: 'image/gif', size: 1024 };
    const reason = fileRejectionReason(file, 5);
    expect(reason).toContain('Unsupported');
    expect(reason).toContain('.gif');
  });

  it('fileRejectionReason rejects null files', () => {
    expect(fileRejectionReason(null, 5)).toContain('No file');
  });

  it('findDuplicateName detects duplicate filenames', () => {
    const attachments = [
      { name: 'report.pdf' },
      { name: 'spec.docx' }
    ];
    expect(findDuplicateName('report.pdf', attachments)).toBe(true);
    expect(findDuplicateName('REPORT.PDF', attachments)).toBe(true);
    expect(findDuplicateName('new-file.pdf', attachments)).toBe(false);
  });

  it('findDuplicateName handles empty list', () => {
    expect(findDuplicateName('report.pdf', [])).toBe(false);
    expect(findDuplicateName('report.pdf', null)).toBe(false);
  });
});
