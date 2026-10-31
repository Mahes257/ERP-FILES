/**
 * purchase/constants/documentWorkflow.js
 * ------------------------------------------------------------------
 * Constants for the Document Versioning and Audit Trail system.
 *
 * Tracks every printable/attachable document through its lifecycle
 * from Draft → Generated → Approved → Final (or Cancelled).
 * Every user action (view, download, edit, finalize) is recorded in
 * an immutable audit trail per document version.
 * ------------------------------------------------------------------
 */

/** Document lifecycle status — every generated document carries one. */
export const DOCUMENT_STATUS = {
  DRAFT: 'Draft',
  GENERATED: 'Generated',
  APPROVED: 'Approved',
  FINAL: 'Final',
  CANCELLED: 'Cancelled'
};

export const DOCUMENT_STATUSES = Object.values(DOCUMENT_STATUS);

/** Valid status transitions. */
export const DOCUMENT_STATUS_TRANSITIONS = {
  [DOCUMENT_STATUS.DRAFT]: [DOCUMENT_STATUS.GENERATED, DOCUMENT_STATUS.CANCELLED],
  [DOCUMENT_STATUS.GENERATED]: [DOCUMENT_STATUS.APPROVED, DOCUMENT_STATUS.FINAL, DOCUMENT_STATUS.CANCELLED],
  [DOCUMENT_STATUS.APPROVED]: [DOCUMENT_STATUS.FINAL, DOCUMENT_STATUS.CANCELLED],
  [DOCUMENT_STATUS.FINAL]: [],
  [DOCUMENT_STATUS.CANCELLED]: []
};

/** Check whether a document status transition is valid. */
export function isValidDocumentStatusTransition(from, to) {
  return (DOCUMENT_STATUS_TRANSITIONS[from] || []).includes(to);
}

/** Audit trail action types — every user interaction on a document. */
export const AUDIT_ACTION = {
  UPLOADED: 'Uploaded',
  VIEWED: 'Viewed',
  DOWNLOADED: 'Downloaded',
  EDITED: 'Edited',
  REPLACED: 'Replaced',
  FINALIZED: 'Finalized',
  CANCELLED: 'Cancelled',
  DELETED: 'Deleted',
  PDF_GENERATED: 'PDF Generated',
  PRINTED: 'Printed',
  RESTORED: 'Restored',
  MARKED_CURRENT: 'Marked as Current',
  COMPARED: 'Compared'
};

export const AUDIT_ACTIONS = Object.values(AUDIT_ACTION);

/**
 * Supported printable document types in the Purchase workflow.
 * Each carries its own print template and data source.
 */
export const PRINTABLE_DOC_TYPES = {
  PR: { key: 'PR', label: 'Purchase Requisition', route: '/purchase/requisition/:id/print' },
  RFQ: { key: 'RFQ', label: 'Request for Quotation', route: '/purchase/rfq/:id/print' },
  PO: { key: 'PO', label: 'Purchase Order', route: '/purchase/orders/:id/print' },
  VENDOR: { key: 'VENDOR', label: 'Vendor Profile', route: '/purchase/vendors/:id/print' },
  INVOICE: { key: 'INVOICE', label: 'Purchase Invoice', route: '/purchase/invoices/:id/print' },
  GRN: { key: 'GRN', label: 'Goods Receipt Note', route: '/purchase/logistics/:id/print' }
};

/**
 * Document version record shape:
 *   {
 *     versionId: string,
 *     docType: string,          // e.g. 'PO', 'PR'
 *     sourceId: string,         // e.g. PO id, PR id
 *     version: number,          // 1, 2, 3…
 *     status: DOCUMENT_STATUS,
 *     createdBy: string,
 *     createdAt: string (ISO),
 *     updatedBy: string,
 *     updatedAt: string (ISO),
 *     finalizedBy: string | null,
 *     finalizedAt: string | null,
 *     description: string,      // optional version note
 *     auditTrail: AuditEntry[]
 *   }
 *
 * AuditEntry shape:
 *   {
 *     action: AUDIT_ACTION,
 *     performedBy: string,
 *     performedAt: string (ISO),
 *     details: string | null    // optional note
 *   }
 */
