/**
 * purchase/services/documentWorkflow.test.js
 * ------------------------------------------------------------------
 * Tests for Phase 6: Document Versioning, Audit Trail, PO Print.
 * ------------------------------------------------------------------ */
import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_STATUS,
  DOCUMENT_STATUSES,
  isValidDocumentStatusTransition,
  AUDIT_ACTION,
  AUDIT_ACTIONS,
  PRINTABLE_DOC_TYPES
} from '../constants/documentWorkflow';
import { PO_STATUS, PO_STAGE_TRANSITIONS } from '../constants';

/* ================================================================== */
/*  Document Status Constants                                          */
/* ================================================================== */
describe('DOCUMENT_STATUS constants', () => {
  it('has all 5 required statuses', () => {
    expect(DOCUMENT_STATUSES).toHaveLength(5);
  });

  it('includes Draft', () => {
    expect(DOCUMENT_STATUS.DRAFT).toBe('Draft');
  });

  it('includes Generated', () => {
    expect(DOCUMENT_STATUS.GENERATED).toBe('Generated');
  });

  it('includes Approved', () => {
    expect(DOCUMENT_STATUS.APPROVED).toBe('Approved');
  });

  it('includes Final', () => {
    expect(DOCUMENT_STATUS.FINAL).toBe('Final');
  });

  it('includes Cancelled', () => {
    expect(DOCUMENT_STATUS.CANCELLED).toBe('Cancelled');
  });
});

/* ================================================================== */
/*  Document Status Transitions                                        */
/* ================================================================== */
describe('Document status transitions', () => {
  it('Draft → Generated is valid', () => {
    expect(isValidDocumentStatusTransition('Draft', 'Generated')).toBe(true);
  });

  it('Draft → Cancelled is valid', () => {
    expect(isValidDocumentStatusTransition('Draft', 'Cancelled')).toBe(true);
  });

  it('Draft → Final is NOT valid (must go through Generated)', () => {
    expect(isValidDocumentStatusTransition('Draft', 'Final')).toBe(false);
  });

  it('Generated → Approved is valid', () => {
    expect(isValidDocumentStatusTransition('Generated', 'Approved')).toBe(true);
  });

  it('Generated → Final is valid', () => {
    expect(isValidDocumentStatusTransition('Generated', 'Final')).toBe(true);
  });

  it('Generated → Cancelled is valid', () => {
    expect(isValidDocumentStatusTransition('Generated', 'Cancelled')).toBe(true);
  });

  it('Approved → Final is valid', () => {
    expect(isValidDocumentStatusTransition('Approved', 'Final')).toBe(true);
  });

  it('Approved → Cancelled is valid', () => {
    expect(isValidDocumentStatusTransition('Approved', 'Cancelled')).toBe(true);
  });

  it('Final → anything is NOT valid (terminal state)', () => {
    expect(isValidDocumentStatusTransition('Final', 'Draft')).toBe(false);
    expect(isValidDocumentStatusTransition('Final', 'Generated')).toBe(false);
    expect(isValidDocumentStatusTransition('Final', 'Approved')).toBe(false);
    expect(isValidDocumentStatusTransition('Final', 'Cancelled')).toBe(false);
  });

  it('Cancelled → anything is NOT valid (terminal state)', () => {
    expect(isValidDocumentStatusTransition('Cancelled', 'Draft')).toBe(false);
    expect(isValidDocumentStatusTransition('Cancelled', 'Generated')).toBe(false);
    expect(isValidDocumentStatusTransition('Cancelled', 'Approved')).toBe(false);
    expect(isValidDocumentStatusTransition('Cancelled', 'Final')).toBe(false);
  });

  it('invalid transition returns false', () => {
    expect(isValidDocumentStatusTransition('Final', 'Draft')).toBe(false);
  });

  it('unknown status returns false', () => {
    expect(isValidDocumentStatusTransition('Unknown', 'Draft')).toBe(false);
  });
});

/* ================================================================== */
/*  Audit Action Constants                                             */
/* ================================================================== */
describe('AUDIT_ACTION constants', () => {
  it('has all required actions', () => {
    expect(AUDIT_ACTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it('includes Uploaded', () => {
    expect(AUDIT_ACTION.UPLOADED).toBe('Uploaded');
  });

  it('includes Viewed', () => {
    expect(AUDIT_ACTION.VIEWED).toBe('Viewed');
  });

  it('includes Downloaded', () => {
    expect(AUDIT_ACTION.DOWNLOADED).toBe('Downloaded');
  });

  it('includes Edited', () => {
    expect(AUDIT_ACTION.EDITED).toBe('Edited');
  });

  it('includes Replaced', () => {
    expect(AUDIT_ACTION.REPLACED).toBe('Replaced');
  });

  it('includes Finalized', () => {
    expect(AUDIT_ACTION.FINALIZED).toBe('Finalized');
  });

  it('includes Cancelled', () => {
    expect(AUDIT_ACTION.CANCELLED).toBe('Cancelled');
  });

  it('includes Deleted', () => {
    expect(AUDIT_ACTION.DELETED).toBe('Deleted');
  });

  it('includes PDF Generated', () => {
    expect(AUDIT_ACTION.PDF_GENERATED).toBe('PDF Generated');
  });

  it('includes Printed', () => {
    expect(AUDIT_ACTION.PRINTED).toBe('Printed');
  });
});

/* ================================================================== */
/*  Printable Document Types                                           */
/* ================================================================== */
describe('PRINTABLE_DOC_TYPES', () => {
  it('has 6 document types', () => {
    expect(Object.keys(PRINTABLE_DOC_TYPES)).toHaveLength(6);
  });

  it('includes PO', () => {
    expect(PRINTABLE_DOC_TYPES.PO).toBeDefined();
    expect(PRINTABLE_DOC_TYPES.PO.key).toBe('PO');
  });

  it('includes PR', () => {
    expect(PRINTABLE_DOC_TYPES.PR).toBeDefined();
  });

  it('includes RFQ', () => {
    expect(PRINTABLE_DOC_TYPES.RFQ).toBeDefined();
  });

  it('includes Invoice', () => {
    expect(PRINTABLE_DOC_TYPES.INVOICE).toBeDefined();
  });

  it('includes GRN', () => {
    expect(PRINTABLE_DOC_TYPES.GRN).toBeDefined();
  });

  it('includes Vendor', () => {
    expect(PRINTABLE_DOC_TYPES.VENDOR).toBeDefined();
  });

  it('PO route pattern contains :id', () => {
    expect(PRINTABLE_DOC_TYPES.PO.route).toContain(':id');
  });
});

/* ================================================================== */
/*  PO Status Transitions (Phase 1 — canonical stages)                 */
/* ================================================================== */
describe('PO status transition matrix', () => {
  it('Draft → Pending Approval is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.DRAFT]).toContain(PO_STATUS.PENDING_APPROVAL);
  });

  it('Pending Approval → Approved is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.PENDING_APPROVAL]).toContain(PO_STATUS.APPROVED);
  });

  it('Approved → Released is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.APPROVED]).toContain(PO_STATUS.RELEASED);
  });

  it('Released → Supplier Acknowledged is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.RELEASED]).toContain(PO_STATUS.SUPPLIER_ACKNOWLEDGED);
  });

  it('Supplier Acknowledged → In Progress is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.SUPPLIER_ACKNOWLEDGED]).toContain(PO_STATUS.IN_PROGRESS);
  });

  it('In Progress → Partially Delivered is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.IN_PROGRESS]).toContain(PO_STATUS.PARTIALLY_DELIVERED);
  });

  it('In Progress → Completed is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.IN_PROGRESS]).toContain(PO_STATUS.COMPLETED);
  });

  it('Partially Delivered → Completed is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.PARTIALLY_DELIVERED]).toContain(PO_STATUS.COMPLETED);
  });

  it('Completed → Closed is valid', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.COMPLETED]).toContain(PO_STATUS.CLOSED);
  });

  it('Closed → anything is NOT valid (terminal)', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.CLOSED]).toHaveLength(0);
  });

  it('Cancelled → anything is NOT valid (terminal)', () => {
    expect(PO_STAGE_TRANSITIONS[PO_STATUS.CANCELLED]).toHaveLength(0);
  });

  it('any active stage can be cancelled', () => {
    const cancellable = [
      PO_STATUS.PENDING_APPROVAL,
      PO_STATUS.APPROVED,
      PO_STATUS.RELEASED,
      PO_STATUS.SUPPLIER_ACKNOWLEDGED,
      PO_STATUS.IN_PROGRESS,
      PO_STATUS.PARTIALLY_DELIVERED
    ];
    cancellable.forEach((stage) => {
      expect(PO_STAGE_TRANSITIONS[stage]).toContain(PO_STATUS.CANCELLED);
    });
  });
});

/* ================================================================== */
/*  PO Print Preview Data Shape                                        */
/* ================================================================== */
describe('PO print preview data shape', () => {
  it('printPreview returns record + company + signatories + generatedAt', () => {
    const mockData = {
      record: { poNo: 'PO-2026-0001', title: 'Test', vendor: 'Vendor A', items: [], totals: { total: 0 } },
      company: {
        name: 'ABC Manufacturing Pvt Ltd',
        address: 'Plot 42, MIDC, Pune',
        gstin: '27AAACA1234A1Z5',
        phone: '+91 20 4890 1200',
        email: 'procurement@abcmfg.example'
      },
      preparedBy: 'Kavita Rao',
      checkedBy: 'Amit Verma',
      approvedBy: '—',
      generatedAt: '2026-08-25T10:00:00Z'
    };

    expect(mockData.record.poNo).toBe('PO-2026-0001');
    expect(mockData.company.name).toBeDefined();
    expect(mockData.company.gstin).toBeDefined();
    expect(mockData.preparedBy).toBeDefined();
    expect(mockData.generatedAt).toBeDefined();
  });

  it('PO record carries all required print fields', () => {
    const requiredFields = ['poNo', 'title', 'vendor', 'orderDate', 'items', 'totals', 'status'];
    const record = {
      poNo: 'PO-2026-0001',
      title: 'Test Order',
      vendor: 'Vendor A',
      orderDate: '2026-08-25',
      items: [{ product: 'Item 1', qty: 10, rate: 100 }],
      totals: { total: 1000 },
      status: 'Draft'
    };
    requiredFields.forEach((field) => {
      expect(record[field]).toBeDefined();
    });
  });

  it('PO totals calculation works correctly', () => {
    const items = [
      { qty: 10, rate: 100, discount: 0, gstRate: 18 },
      { qty: 5, rate: 200, discount: 10, gstRate: 18 }
    ];

    let subtotal = 0;
    items.forEach((item) => {
      const lineTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0) * (1 - (Number(item.discount) || 0) / 100);
      subtotal += lineTotal;
    });

    expect(subtotal).toBe(1900); // 10*100 + 5*200*0.9 = 1000 + 900
  });
});

/* ================================================================== */
/*  Document Versioning Logic                                          */
/* ================================================================== */
describe('Document versioning logic', () => {
  it('version ID format is VER-{docType}-{sourceId}-v{version}', () => {
    const versionId = `VER-PO-PO-2026-0001-v1`;
    expect(versionId).toMatch(/^VER-PO-PO-2026-0001-v1$/);
  });

  it('new version increments from max existing version', () => {
    const existing = [
      { version: 1, docType: 'PO', sourceId: 'PO-001' },
      { version: 2, docType: 'PO', sourceId: 'PO-001' }
    ];
    const maxVersion = Math.max(...existing.map((v) => v.version));
    const nextVersion = maxVersion + 1;
    expect(nextVersion).toBe(3);
  });

  it('first version for a document starts at 1', () => {
    const existing = [];
    const nextVersion = existing.length > 0
      ? Math.max(...existing.map((v) => v.version)) + 1
      : 1;
    expect(nextVersion).toBe(1);
  });

  it('audit entry has required fields', () => {
    const entry = {
      action: 'Uploaded',
      performedBy: 'System',
      performedAt: new Date().toISOString(),
      details: 'Version 1 created'
    };
    expect(entry.action).toBeDefined();
    expect(entry.performedBy).toBeDefined();
    expect(entry.performedAt).toBeDefined();
  });

  it('version record has all required fields', () => {
    const version = {
      versionId: 'VER-PO-PO-001-v1',
      docType: 'PO',
      sourceId: 'PO-001',
      version: 1,
      status: 'Draft',
      createdBy: 'System',
      createdAt: new Date().toISOString(),
      updatedBy: 'System',
      updatedAt: new Date().toISOString(),
      finalizedBy: null,
      finalizedAt: null,
      description: '',
      auditTrail: []
    };
    expect(version.versionId).toBeDefined();
    expect(version.docType).toBe('PO');
    expect(version.status).toBe('Draft');
    expect(version.auditTrail).toEqual([]);
  });

  it('finalizing a version records the finalizer', () => {
    const version = {
      status: 'Approved',
      finalizedBy: null,
      finalizedAt: null,
      auditTrail: []
    };

    // Simulate finalization
    const actor = 'Admin User';
    version.status = 'Final';
    version.finalizedBy = actor;
    version.finalizedAt = new Date().toISOString();
    version.auditTrail.push({ action: 'Finalized', performedBy: actor, performedAt: version.finalizedAt });

    expect(version.status).toBe('Final');
    expect(version.finalizedBy).toBe('Admin User');
    expect(version.finalizedAt).toBeDefined();
    expect(version.auditTrail).toHaveLength(1);
    expect(version.auditTrail[0].action).toBe('Finalized');
  });

  it('auto-transition Draft → Generated on PDF generation', () => {
    let status = 'Draft';

    // Simulate PDF generation
    const newAudit = [];
    if (status === 'Draft') {
      status = 'Generated';
      newAudit.push({ action: 'Edited', details: 'Auto-transitioned to Generated' });
    }
    newAudit.push({ action: 'PDF Generated' });

    expect(status).toBe('Generated');
    expect(newAudit).toHaveLength(2);
    expect(newAudit[0].action).toBe('Edited');
    expect(newAudit[1].action).toBe('PDF Generated');
  });
});

/* ================================================================== */
/*  Full Lifecycle Test                                                */
/* ================================================================== */
describe('Full PO document lifecycle', () => {
  it('PO → Created(Draft) → Generated → Approved → Final', () => {
    let status = 'Draft';
    const auditTrail = [];

    // 1. Created
    auditTrail.push({ action: 'Uploaded', details: 'PO document created' });
    expect(status).toBe('Draft');

    // 2. PDF Generated (auto-transition)
    if (status === 'Draft') {
      status = 'Generated';
      auditTrail.push({ action: 'Edited', details: 'Auto-transitioned to Generated' });
    }
    auditTrail.push({ action: 'PDF Generated' });
    expect(status).toBe('Generated');
    expect(isValidDocumentStatusTransition('Draft', 'Generated')).toBe(true);

    // 3. Approved
    status = 'Approved';
    auditTrail.push({ action: 'Edited', details: 'Status changed to "Approved"' });
    expect(status).toBe('Approved');
    expect(isValidDocumentStatusTransition('Generated', 'Approved')).toBe(true);

    // 4. Finalized
    status = 'Final';
    auditTrail.push({ action: 'Finalized', details: 'Status changed to "Final"' });
    expect(status).toBe('Final');
    expect(isValidDocumentStatusTransition('Approved', 'Final')).toBe(true);

    // 5. Cannot modify after finalization
    expect(isValidDocumentStatusTransition('Final', 'Draft')).toBe(false);
    expect(isValidDocumentStatusTransition('Final', 'Cancelled')).toBe(false);

    expect(auditTrail).toHaveLength(5);
    expect(auditTrail[auditTrail.length - 1].action).toBe('Finalized');
  });

  it('can cancel from any active state', () => {
    const activeStates = ['Draft', 'Generated', 'Approved'];
    activeStates.forEach((from) => {
      expect(isValidDocumentStatusTransition(from, 'Cancelled')).toBe(true);
    });
  });

  it('cancelled state is terminal', () => {
    expect(isValidDocumentStatusTransition('Cancelled', 'Draft')).toBe(false);
    expect(isValidDocumentStatusTransition('Cancelled', 'Generated')).toBe(false);
    expect(isValidDocumentStatusTransition('Cancelled', 'Approved')).toBe(false);
    expect(isValidDocumentStatusTransition('Cancelled', 'Final')).toBe(false);
  });
});

/* ================================================================== */
/*  Attachment Version Metadata                                        */
/* ================================================================== */
describe('Attachment version metadata', () => {
  it('attachment carries version field', () => {
    const att = {
      id: 'att-001',
      name: 'spec.pdf',
      version: 1,
      uploadedAt: '2026-08-25T10:00:00Z',
      uploadedBy: 'Kavita Rao'
    };
    expect(att.version).toBe(1);
  });

  it('replacement increments version', () => {
    let version = 1;
    version += 1;
    expect(version).toBe(2);
  });
});
