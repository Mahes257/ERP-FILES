/**
 * purchase/constants
 * ------------------------------------------------------------------
 * Shared constants for the Purchase module. The only cross-module
 * dependency is the ISO-4217 currency master (src/data/currencies.js),
 * which lives at the app level so any module can reuse it.
 * ------------------------------------------------------------------
 */
import { currencies } from '../../data/currencies';

/* The canonical Purchase workflow — single source of truth for stage
   ordering (see constants/workflow.js). Re-exported so both import
   paths (`constants/workflow` and `constants`) resolve the same module. */
export * from './workflow';

/* RFQ lifecycle statuses — defined in its own file to break the
   circular dependency between index.js (barrel) and workflow.js. */
export { RFQ_STATUS, RFQ_STATUSES } from './rfq';
import { RFQ_STATUS } from './rfq';

/* Canonical PO stage normalization — single source of truth for
   legacy-to-canonical stage mapping. Every PO returned from the
   service must carry a canonical stage (see poStage.js). */
export { normalizePOStatus, normalizePoRecord, PO_CANONICAL_STAGES, PO_RELEASED_STAGES, isPoReleased } from './poStage';

/* Document versioning, audit trail and lifecycle status constants.
   Used by the Document Versioning service and every print/PDF page. */
export {
  DOCUMENT_STATUS, DOCUMENT_STATUSES,
  DOCUMENT_STATUS_TRANSITIONS, isValidDocumentStatusTransition,
  AUDIT_ACTION, AUDIT_ACTIONS,
  PRINTABLE_DOC_TYPES
} from './documentWorkflow';

/** Purchase Requisition lifecycle statuses.
 *
 *  Canonical flow: Draft → Pending Approval → Approved → Technical
 *  Specification Review → Ready for RFQ → Converted to RFQ → PO Raised.
 *  `APPROVED` marks the purchase approval as complete (the record then
 *  moves into `TECHNICAL_REVIEW`). `TECHNICAL_REVIEW` is the dedicated
 *  stage where the Technical Specification Review workspace operates.
 *  `READY_FOR_RFQ` is set once the technical review is approved and the
 *  PR may be converted. `CONVERTED` marks an approved PR that has been
 *  turned into an RFQ draft — distinct from `PO_RAISED`, which only
 *  applies once a real Purchase Order has been created against the PR.
 *  Existing records that predate the technical-review stage keep the
 *  legacy `APPROVED` status and are treated as awaiting technical
 *  review (both statuses are RFQ-eligible and review-actionable). */
export const PR_STATUS = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  TECHNICAL_REVIEW: 'Technical Specification Review',
  READY_FOR_RFQ: 'Ready for RFQ',
  CONVERTED: 'Converted to RFQ',
  REJECTED: 'Rejected',
  RETURNED: 'Returned',
  PO_RAISED: 'PO Raised'
};

/** Statuses an approved requisition passes through before RFQ conversion:
 *  the current technical-review stage and the legacy Approved status. */
export const PR_APPROVED_GROUP = [
  PR_STATUS.APPROVED,
  PR_STATUS.TECHNICAL_REVIEW,
  PR_STATUS.READY_FOR_RFQ
];

/** Statuses eligible for RFQ conversion (technical review complete). */
export const PR_RFQ_ELIGIBLE = [PR_STATUS.READY_FOR_RFQ];

export const PR_STATUSES = Object.values(PR_STATUS);

/** Purchase Requisition type — classifies the nature of the procurement. */
export const PR_TYPE = {
  CAPITAL: 'Capital Purchase',
  OPERATIONAL: 'Operational Purchase',
  COMMERCIAL: 'Commercial Purchase'
};

export const PR_TYPES = Object.values(PR_TYPE);

/** Technical review lifecycle for a purchase requisition. */
export const REVIEW_STATUS = {
  NOT_STARTED: 'Not Started',
  IN_REVIEW: 'In Review',
  REVIEWED: 'Reviewed',
  NOT_REQUIRED: 'Not Required'
};

export const REVIEW_STATUSES = Object.values(REVIEW_STATUS);

/** Purchase Order lifecycle statuses. */
export const PO_STATUS = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  RELEASED: 'Released',
  SUPPLIER_ACKNOWLEDGED: 'Supplier Acknowledged',
  IN_PROGRESS: 'In Progress',
  PARTIALLY_DELIVERED: 'Partially Delivered',
  COMPLETED: 'Completed',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled'
};

export const PO_STATUSES = Object.values(PO_STATUS);

/**
 * Canonical PO stage transitions — the SINGLE source of truth.
 * Every UI action AND service method must enforce this map.
 * Key = current stage, Value = array of valid next stages.
 */
export const PO_STAGE_TRANSITIONS = {
  [PO_STATUS.DRAFT]: [PO_STATUS.PENDING_APPROVAL],
  [PO_STATUS.PENDING_APPROVAL]: [PO_STATUS.APPROVED, PO_STATUS.CANCELLED],
  [PO_STATUS.APPROVED]: [PO_STATUS.RELEASED, PO_STATUS.CANCELLED],
  [PO_STATUS.RELEASED]: [PO_STATUS.SUPPLIER_ACKNOWLEDGED, PO_STATUS.CANCELLED],
  [PO_STATUS.SUPPLIER_ACKNOWLEDGED]: [PO_STATUS.IN_PROGRESS, PO_STATUS.CANCELLED],
  [PO_STATUS.IN_PROGRESS]: [PO_STATUS.PARTIALLY_DELIVERED, PO_STATUS.COMPLETED, PO_STATUS.CANCELLED],
  [PO_STATUS.PARTIALLY_DELIVERED]: [PO_STATUS.COMPLETED, PO_STATUS.CANCELLED],
  [PO_STATUS.COMPLETED]: [PO_STATUS.CLOSED],
  [PO_STATUS.CLOSED]: [],
  [PO_STATUS.CANCELLED]: []
};

/** Check whether a transition from one stage to another is valid. */
export function isValidPOTransition(from, to) {
  return (PO_STAGE_TRANSITIONS[from] || []).includes(to);
}

/** Get valid forward conversions (excludes Cancelled). */
export function getForwardPOConversions(status) {
  return (PO_STAGE_TRANSITIONS[status] || []).filter((s) => s !== PO_STATUS.CANCELLED);
}

/** Check if a PO can be cancelled from its current status. */
export function canCancelPO(status) {
  return (PO_STAGE_TRANSITIONS[status] || []).includes(PO_STATUS.CANCELLED);
}

/** Approval workflow outcome. */
export const APPROVAL_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
};

export const APPROVAL_STATUSES = Object.values(APPROVAL_STATUS);

/** Vendor management statuses. */
export const VENDOR_STATUS = {
  PENDING: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  BLOCKED: 'Blocked'
};

export const VENDOR_STATUSES = Object.values(VENDOR_STATUS);

/** Vendor record lifecycle states (archived / deleted vendors are hidden from the active list). */
export const VENDOR_RECORD_STATE = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

export const VENDOR_CATEGORIES = [
  'Steel & Metals',
  'Electrical & Automation',
  'Engineering & Construction',
  'Auto Components',
  'Forgings & Castings',
  'FMCG Supplies',
  'IT & Office Equipment',
  'Chemicals & Consumables'
];

/* RFQ_STATUS and RFQ_STATUSES are re-exported from ./rfq above. */

/** RFQ list tabs: All + per-status + the derived "Open" bucket. */
export const RFQ_TABS = [
  { key: 'All', label: 'All RFQs' },
  { key: RFQ_STATUS.DRAFT, label: 'Draft' },
  { key: RFQ_STATUS.PENDING_APPROVAL, label: 'Pending Approval' },
  { key: RFQ_STATUS.APPROVED, label: 'Approved' },
  { key: RFQ_STATUS.SENT, label: 'Sent' },
  { key: RFQ_STATUS.QUOTATION_RECEIVED, label: 'Quotation Received' },
  { key: RFQ_STATUS.EVALUATION, label: 'Evaluation' },
  { key: RFQ_STATUS.FIRST_APPROVAL, label: '1st Approval' },
  { key: RFQ_STATUS.SECOND_APPROVAL, label: '2nd Approval' },
  { key: RFQ_STATUS.FINAL_APPROVAL, label: 'Final Approval' },
  { key: RFQ_STATUS.AWARDED, label: 'Awarded' },
  { key: RFQ_STATUS.CLOSED, label: 'Closed' },
  { key: RFQ_STATUS.CANCELLED, label: 'Cancelled' },
  { key: 'Open', label: 'Open' }
];

/**
 * Weights used to rank vendor quotations (composite score = 100).
 * Price is comparative (best quote = 100), the rest are absolute
 * 0-100 criterion scores; quality comes from the vendor master rating.
 */
export const RFQ_SCORING_WEIGHTS = {
  price: 35,
  delivery: 15,
  leadTime: 15,
  warranty: 15,
  paymentTerms: 10,
  quality: 10
};

/** Commercial term options used by the RFQ form / details. */
export const DELIVERY_TERMS = ['Immediate', '7 Days', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days'];
export const WARRANTY_TERMS = ['None', '3 Months', '6 Months', '12 Months', '18 Months', '24 Months'];
export const FREIGHT_OPTIONS = ['Prepaid', 'Collect', 'Included in Price', 'To be Quoted'];
export const INSURANCE_OPTIONS = ['Not Required', 'Included', 'To be Quoted', 'Buyer Arranges'];

/**
 * NFA (Note for Approval) lifecycle — the formal approval note raised
 * after Supplier Selection, documenting the proposed procurement
 * (selected supplier + final value + justification) before the
 * Purchase Order stage:
 *
 *   Draft → Submitted → First Approval → Second Approval → Final Approval → Approved
 *                                  ↓ rejected at any stage → Rejected
 */
export const NFA_STATUS = {
  DRAFT: 'Draft',
  PENDING_APPROVAL: 'Pending Approval',
  FIRST_APPROVAL: 'First Approval',
  SECOND_APPROVAL: 'Second Approval',
  FINAL_APPROVAL: 'Final Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
};

export const NFA_STATUSES = Object.values(NFA_STATUS);

/** Sequential approval stages — each must be approved in order. */
export const NFA_APPROVAL_STAGE = {
  FIRST: 'First',
  SECOND: 'Second',
  FINAL: 'Final'
};

export const NFA_APPROVAL_STAGES = Object.values(NFA_APPROVAL_STAGE);

/** Per-stage approval status. */
export const NFA_STAGE_STATUS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected'
};

/** Maps each approval stage to the overall NFA status while that stage is active. */
export const NFA_STAGE_TO_STATUS = {
  [NFA_APPROVAL_STAGE.FIRST]: NFA_STATUS.FIRST_APPROVAL,
  [NFA_APPROVAL_STAGE.SECOND]: NFA_STATUS.SECOND_APPROVAL,
  [NFA_APPROVAL_STAGE.FINAL]: NFA_STATUS.FINAL_APPROVAL
};

/** Record lifecycle states for the NFA list (Active / Archived / Deleted tabs). */
export const NFA_RECORD_STATE = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

export const NFA_RECORD_STATES = Object.values(NFA_RECORD_STATE);

/** Vendor document register — verification statuses. */
export const VENDOR_DOCUMENT_STATUS = {
  VERIFIED: 'Verified',
  PENDING: 'Pending',
  EXPIRED: 'Expired'
};

export const VENDOR_DOCUMENT_STATUSES = Object.values(VENDOR_DOCUMENT_STATUS);

/** Record lifecycle states for the Vendor Documents register
 *  (Active / Archived / Deleted tabs). */
export const VENDOR_DOCUMENT_RECORD_STATE = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

export const VENDOR_DOCUMENT_RECORD_STATES = Object.values(VENDOR_DOCUMENT_RECORD_STATE);

/** Document categories for the vendor document register. */
export const VENDOR_DOCUMENT_CATEGORIES = [
  'GST Registration',
  'Certificate of Incorporation',
  'Bank Details',
  'Insurance Certificate',
  'Quality Certification',
  'MSME Certificate',
  'Commercial Agreement',
  'Other'
];

/** Column layout for the Vendor Documents register (one row = one document). */
export const VENDOR_DOCUMENT_COLUMNS = [
  { key: 'docNo', label: 'Doc No', width: 120, sortable: true, visible: true, sticky: 'left' },
  { key: 'document', label: 'Document', width: 240, sortable: true, visible: true },
  { key: 'vendorName', label: 'Vendor', width: 170, sortable: true, visible: true },
  { key: 'category', label: 'Category', width: 160, sortable: true, visible: true },
  { key: 'size', label: 'Size', width: 90, sortable: true, visible: true, align: 'right' },
  { key: 'status', label: 'Status', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'uploadedBy', label: 'Uploaded By', width: 130, sortable: true, visible: true },
  { key: 'uploadedDate', label: 'Uploaded', width: 120, sortable: true, visible: true },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Quotation lifecycle statuses. */
export const QUOTATION_STATUS = {
  PENDING: 'Pending',
  RECEIVED: 'Received',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected'
};

export const QUOTATION_STATUSES = Object.values(QUOTATION_STATUS);

/** Purchase invoice statuses. */
export const INVOICE_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  PARTIAL: 'Partially Paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue'
};

export const INVOICE_STATUSES = Object.values(INVOICE_STATUS);

/**
 * Three-way match outcomes for purchase invoices. `PENDING` means no
 * goods receipt is posted yet; `EXCEPTION` means the invoice does not
 * reference a valid purchase order; `PARTIAL` means every line is
 * within tolerance but not all received quantities are invoiced yet
 * (legitimate partial invoicing). Only `MATCHED` unlocks payment
 * approval when the matching rules require a full match.
 */
export const MATCH_STATUS = {
  PENDING: 'Pending Match',
  MATCHED: 'Matched',
  PARTIAL: 'Partially Matched',
  MISMATCH: 'Mismatch',
  EXCEPTION: 'Exception'
};

export const MATCH_STATUSES = Object.values(MATCH_STATUS);

/** Vendor invoice document types. */
export const INVOICE_TYPE = {
  STANDARD: 'Standard',
  SUPPLEMENTARY: 'Supplementary',
  DEBIT_NOTE: 'Debit Note',
  CREDIT_NOTE: 'Credit Note'
};

export const INVOICE_TYPES = Object.values(INVOICE_TYPE);

/**
 * Credit / Debit Note adjustment documents raised against an ORIGINAL
 * vendor invoice. A Credit Note reduces what the buyer owes the vendor
 * (returns, rate corrections, rejections); a Debit Note increases it
 * (additional charges / corrections). Notes only move the ledger once
 * they are Approved — see services/invoice.js.
 */
export const ADJUSTMENT_NOTE_TYPE = {
  CREDIT: INVOICE_TYPE.CREDIT_NOTE, // 'Credit Note'
  DEBIT: INVOICE_TYPE.DEBIT_NOTE // 'Debit Note'
};

export const ADJUSTMENT_NOTE_TYPES = Object.values(ADJUSTMENT_NOTE_TYPE);

/** Lifecycle of an adjustment note. Only Approved (not Reversed) notes
 *  count toward the linked invoice's outstanding / vendor payable. */
export const ADJUSTMENT_NOTE_STATUS = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REVERSED: 'Reversed'
};

export const ADJUSTMENT_NOTE_STATUSES = Object.values(ADJUSTMENT_NOTE_STATUS);

/** Common reasons offered in the note form (reason is free text too). */
export const ADJUSTMENT_NOTE_REASONS = [
  'Goods Returned',
  'Rejected / Quality Discrepancy',
  'Short Supply / Shortage',
  'Rate Difference',
  'Tax / GST Correction',
  'Duplicate Billing',
  'Trade Discount / Settlement',
  'Other'
];

/**
 * Payment statuses — independent of invoice lifecycle. Tracks the
 * actual payment execution state.
 */
export const PAYMENT_STATUS = {
  UNPAID: 'Unpaid',
  SCHEDULED: 'Scheduled',
  PROCESSING: 'Processing',
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially Paid',
  FAILED: 'Failed'
};

export const PAYMENT_STATUSES = Object.values(PAYMENT_STATUS);

/**
 * Payment advice statuses — tracks whether advice has been generated
 * and sent to the vendor.
 */
export const ADVICE_STATUS = {
  NOT_ISSUED: 'Not Issued',
  ISSUED: 'Issued',
  SENT: 'Sent'
};

export const ADVICE_STATUSES = Object.values(ADVICE_STATUS);

export const PAYMENT_METHODS = ['Bank Transfer', 'Cheque', 'UPI', 'Demand Draft', 'Letter of Credit'];

/** Per-payment ledger entry lifecycle — a payment is Active until it is
 *  reversed; reversed entries stay on the ledger with their reversal
 *  details and stop counting toward the invoice's paid balance. */
export const PAYMENT_ENTRY_STATUS = {
  ACTIVE: 'Active',
  REVERSED: 'Reversed'
};

export const PAYMENT_ENTRY_STATUSES = Object.values(PAYMENT_ENTRY_STATUS);

export const DEPARTMENTS = [
  'Engineering',
  'Production',
  'Purchase',
  'Quality',
  'Maintenance',
  'Stores',
  'Finance',
  'HR',
  'Projects',
  'IT',
  'Admin',
  'Procurement',
  'Logistics'
];

export const PROJECTS = [
  'Unit Expansion',
  'Annual Maintenance',
  'Factory Upgrade',
  'Automation',
  'Unit 2 Expansion',
  'Annual Maintenance Contract',
  'New Plant Setup',
  'IT Infrastructure Upgrade',
  'R&D Project',
  'Compliance & Safety',
  'Tooling & Dies',
  'General Operations'
];

export const USERS = [
  'Rahul Sharma',
  'Amit Verma',
  'Priya Patel',
  'Arjun Mehta',
  'Sneha Iyer',
  'Kavita Rao',
  'Vikram Singh',
  'Rohan Desai',
  'Neha Gupta',
  'Meera Joshi',
  'Sanjay Kumar',
  'Ananya Nair',
  'Aarav Khanna',
  'Divya Menon'
];

/** ISO-4217 currency codes (from the currency master at src/data/currencies.js). */
export const CURRENCIES = currencies.map((c) => c.code);

export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export const PAYMENT_TERMS = ['Advance', '7 Days', '15 Days', '30 Days', '45 Days', '60 Days', '90 Days', 'On Delivery'];

export const UNITS = ['Nos', 'Kg', 'Ton', 'Box', 'Litre', 'Meter', 'Roll', 'Pack', 'Piece'];

export const GST_RATES = [0, 5, 12, 18, 28];

/** ERP master dropdowns (mock). */
export const BUYERS = ['Rahul Sharma', 'Amit Verma', 'Priya Patel', 'Arjun Mehta', 'Sneha Iyer', 'Kavita Rao'];

export const WAREHOUSES = ['Main Store', 'Production Store', 'Raw Material', 'Finished Goods'];

export const INCOTERMS = ['EXW', 'FOB', 'CIF', 'CIP', 'DAP', 'DDP', 'FCA', 'CPT'];

export const TRANSPORT_MODES = ['Road', 'Rail', 'Air', 'Sea', 'Courier'];

export const GST_TYPES = ['Intra-State (CGST+SGST)', 'Inter-State (IGST)', 'Nil Rated', 'Exempt', 'Composite'];

export const COST_CENTERS = ['CC-1001 Production', 'CC-1002 Maintenance', 'CC-1003 Quality', 'CC-1004 Projects', 'CC-1005 IT', 'CC-1006 Stores', 'CC-1007 Admin'];

export const LOCATIONS = ['Pune Plant', 'Mumbai Office', 'Chennai Plant', 'Delhi Office', 'Bangalore Unit'];

export const COMPANIES = ['ABC Manufacturing Pvt Ltd', 'ABC Auto Components Ltd'];

export const BRANCHES = ['Head Office', 'Pune Branch', 'Chennai Branch', 'Delhi Branch'];

export const ITEM_CATEGORIES = ['Raw Material', 'Spares', 'Consumables', 'Tools & Dies', 'Services', 'Capital Equipment', 'Packaging'];

export const DELIVERY_ADDRESSES = [
  'Plant 1 - Main Gate, Pune',
  'Plant 2 - Stores, Pune',
  'Mumbai Office - Warehouse',
  'Chennai Plant - Gate 2'
];

/** HSN / SAC codes — used for GST classification on line items. */
export const HSN_SAC = [
  '2523', '4009', '6403', '6506', '7208', '7209', '7214', '7217',
  '7304', '7307', '8471', '8504', '8507', '8517', '8523', '8528',
  '8536', '8537', '8544', '9017', '9024', '9403', '9405'
];

/** HSN descriptions — maps code to human-readable label. */
export const HSN_DESCRIPTIONS = {
  '2523': 'Cement',
  '4009': 'Hydraulic hose / Rubber tubing',
  '6403': 'Safety shoes',
  '6506': 'Safety helmet',
  '7208': 'Hot rolled steel',
  '7209': 'Cold rolled steel (CRCA)',
  '7214': 'TMT bars',
  '7217': 'Wire / electrodes',
  '7304': 'Seamless pipes (SS)',
  '7307': 'Flanges & fittings',
  '8471': 'Computers / IT equipment',
  '8504': 'VFD / Drives / Transformers',
  '8507': 'Batteries',
  '8517': 'Networking equipment',
  '8523': 'Software / Licenses',
  '8528': 'Monitors / Displays',
  '8536': 'Contactors / Switches',
  '8537': 'PLC / Automation modules',
  '8544': 'Cables & wiring',
  '9017': 'Measuring instruments',
  '9024': 'Testing / Calibration equipment',
  '9403': 'Furniture',
  '9405': 'LED lighting'
};

/** Default GST rate per HSN code. */
export const HSN_DEFAULT_GST = {
  '2523': 28, '6403': 12, '6506': 12
};

/** Vendor directory used for selects and filters (lightweight). */
export const VENDORS = [
  { id: 'V-001', name: 'Tata Steel', category: 'Steel & Metals', city: 'Jamshedpur' },
  { id: 'V-002', name: 'JSW Steel', category: 'Steel & Metals', city: 'Bellary' },
  { id: 'V-003', name: 'Siemens', category: 'Electrical & Automation', city: 'Mumbai' },
  { id: 'V-004', name: 'ABB', category: 'Electrical & Automation', city: 'Bangalore' },
  { id: 'V-005', name: 'Bosch', category: 'Auto Components', city: 'Bangalore' },
  { id: 'V-006', name: 'Godrej', category: 'FMCG Supplies', city: 'Mumbai' },
  { id: 'V-007', name: 'L&T', category: 'Engineering & Construction', city: 'Mumbai' },
  { id: 'V-008', name: 'Bharat Forge', category: 'Forgings & Castings', city: 'Pune' },
  { id: 'V-009', name: 'Crompton Greaves', category: 'Electrical & Automation', city: 'Mumbai' },
  { id: 'V-010', name: 'Havells India', category: 'Electrical & Automation', city: 'New Delhi' },
  { id: 'V-011', name: 'Dell Technologies', category: 'IT & Office Equipment', city: 'Bangalore' }
];

/** Record lifecycle states for the Purchase Requisition list (tabs). */
export const PR_RECORD_STATE = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  DELETED: 'deleted'
};

export const PR_RECORD_STATES = Object.values(PR_RECORD_STATE);

/** Column layout for the Purchase Requisition list (matches the legacy grid). */
export const PR_COLUMNS = [
  { key: 'prNo', label: 'PR Number', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'department', label: 'Department', width: 130, sortable: true, visible: true },
  { key: 'project', label: 'Project', width: 170, sortable: true, visible: true },
  { key: 'requester', label: 'Requester', width: 140, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'priority', label: 'Priority', width: 105, sortable: true, visible: true, align: 'center' },
  { key: 'status', label: 'Status', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'date', label: 'Created Date', width: 120, sortable: true, visible: true },
  { key: 'expectedDate', label: 'Required Date', width: 120, sortable: true, visible: true },
  { key: 'amount', label: 'Amount', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the Vendor list.
 *  Widths, alignment and sticky columns mirror the Vendor Sourcing
 *  table exactly (shared .pr-table / cpr-list.css styling) so the two
 *  tables render identically from the header down to pagination —
 *  only the data differs. The total table width intentionally exceeds
 *  the viewport so the table scrolls horizontally (shared
 *  .pr-table-wrap); long emails / GSTINs fall back to the cell's
 *  hover tooltip via .cpr-cell-truncate. */
export const VENDOR_COLUMNS = [
  { key: 'id', label: 'Vendor Code', width: 120, sortable: true, visible: true, sticky: 'left' },
  { key: 'name', label: 'Vendor', width: 220, sortable: true, visible: true },
  { key: 'category', label: 'Category', width: 180, sortable: true, visible: true },
  { key: 'city', label: 'City', width: 140, sortable: true, visible: true },
  { key: 'state', label: 'State', width: 140, sortable: true, visible: true },
  { key: 'gstin', label: 'GSTIN', width: 180, sortable: true, visible: true },
  { key: 'phone', label: 'Contact', width: 140, sortable: true, visible: true },
  { key: 'email', label: 'Email', width: 180, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'rating', label: 'Rating', width: 90, sortable: true, visible: true, align: 'center' },
  { key: 'onTimeDelivery', label: 'Performance', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'createdAt', label: 'Created Date', width: 130, sortable: true, visible: true },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the RFQ list.
 *  Uses the exact same shared table machinery as the Vendor List
 *  (PurchaseTable renders table-layout: fixed + a colgroup driven by
 *  `width`, styled by the shared .pr-table / cpr-list.css rules), so
 *  behaviour is identical by construction: a column can never shrink
 *  below its colgroup width, and the total (incl. checkbox + actions)
 *  intentionally exceeds the viewport so the table scrolls
 *  horizontally inside .pr-table-wrap.
 *
 *  The visible defaults follow the RFQ List content structure — RFQ
 *  Number, Title, Department, Project, Requester, Vendor, Priority,
 *  Status, Created Date, Due Date, Amount. RFQ-only detail columns
 *  (Vendor Count, Quotation Progress, Raised PO) ship hidden by
 *  default but stay re-enable-able through the Columns dropdown.
 *
 *  RFQ Number / Status / Actions are the mandatory columns — the
 *  Columns dropdown locks them (lockedKeys). 'estimatedValue' keeps
 *  its data key (the RFQ service sorts by it) but displays as Amount.
 *
 *  Widths are set with generous headroom so every header renders in
 *  full. Text-heavy body cells (title, department, project, requester,
 *  vendor) still truncate via .cpr-cell-truncate (nowrap / hidden /
 *  ellipsis) with hover titles, exactly like the Vendor table. */
export const RFQ_COLUMNS = [
  { key: 'rfqNo', label: 'RFQ Number', width: 150, sortable: true, visible: true, sticky: 'left' },
  { key: 'title', label: 'Title', width: 240, sortable: true, visible: true },
  { key: 'department', label: 'Department', width: 150, sortable: true, visible: true },
  { key: 'project', label: 'Project', width: 170, sortable: true, visible: true },
  { key: 'requester', label: 'Requester', width: 150, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 190, sortable: true, visible: true },
  { key: 'priority', label: 'Priority', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'status', label: 'Status', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'createdAt', label: 'Created Date', width: 130, sortable: true, visible: true },
  { key: 'dueDate', label: 'Due Date', width: 130, sortable: true, visible: true },
  { key: 'estimatedValue', label: 'Amount', width: 140, sortable: true, visible: true, align: 'right' },
  /* Vendor quote summary — shows per-vendor quotation breakdown. */
  { key: 'vendorQuoteSummary', label: 'Quotation Summary', width: 220, sortable: false, visible: true },
  /* RFQ-only detail columns — hidden by default, re-enable-able. */
  { key: 'vendorCount', label: 'Vendor Count', width: 130, sortable: true, visible: false, align: 'center' },
  { key: 'quotationReceived', label: 'Quotation Progress', width: 160, sortable: true, visible: false, align: 'center' },
  { key: 'poNo', label: 'Raised PO', width: 130, sortable: true, visible: false },
  /* Actions: 96px here to match VENDOR_COLUMNS; the shared
     PurchaseTable colgroup hard-codes 96px for the actions column on
     every list page, so Vendor and RFQ render identically. */
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the RFQ Follow-ups list.
 *  Same shared table machinery as every other Purchase list
 *  (PurchaseTable + cpr-list.css). Status renders the derived display
 *  bucket (Overdue / Due Today / Upcoming / Completed / Cancelled),
 *  dueDate is the follow-up's scheduled date and nextFollowUp mirrors
 *  it (the next action date). RFQ Number / Status / Actions are the
 *  mandatory columns locked in the Columns dropdown. */
export const FOLLOWUP_COLUMNS = [
  { key: 'rfqNo', label: 'RFQ Number', width: 140, sortable: true, visible: true, sticky: 'left' },
  { key: 'rfqTitle', label: 'RFQ Title', width: 240, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 170, sortable: true, visible: true },
  { key: 'requester', label: 'Requester', width: 140, sortable: true, visible: true },
  { key: 'type', label: 'Follow-up Type', width: 220, sortable: true, visible: true },
  { key: 'dueDate', label: 'Due Date', width: 125, sortable: true, visible: true, align: 'center' },
  { key: 'priority', label: 'Priority', width: 105, sortable: true, visible: true, align: 'center' },
  { key: 'status', label: 'Status', width: 130, sortable: true, visible: true, align: 'center' },
  { key: 'lastContact', label: 'Last Contact', width: 125, sortable: true, visible: true },
  { key: 'nextFollowUp', label: 'Next Follow-up', width: 135, sortable: true, visible: true, align: 'center' },
  { key: 'assignedTo', label: 'Assigned To', width: 140, sortable: true, visible: false },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the Vendor Quotations list. */
export const QUOTATION_COLUMNS = [
  { key: 'id', label: 'Quote ID', width: 100, sortable: true, visible: true, sticky: 'left' },
  { key: 'rfqNo', label: 'RFQ No', width: 130, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 170, sortable: true, visible: true },
  { key: 'submittedOn', label: 'Submission Date', width: 120, sortable: true, visible: true },
  { key: 'total', label: 'Amount', width: 120, sortable: true, visible: true, align: 'right' },
  { key: 'currency', label: 'Currency', width: 70, sortable: true, visible: true, align: 'center' },
  { key: 'delivery', label: 'Delivery', width: 90, sortable: true, visible: true, align: 'center' },
  { key: 'validUntil', label: 'Validity', width: 110, sortable: true, visible: true },
  { key: 'leadTime', label: 'Lead Time', width: 90, sortable: true, visible: true, align: 'center' },
  { key: 'paymentTerms', label: 'Payment Terms', width: 110, sortable: true, visible: true },
  { key: 'score', label: 'Score', width: 80, sortable: true, visible: true, align: 'center' },
  { key: 'status', label: 'Status', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the Purchase Order list. */
export const PO_COLUMNS = [
  { key: 'poNo', label: 'PO No', width: 130, sortable: true, visible: true, sticky: 'left' },
  { key: 'title', label: 'Order', width: 220, sortable: true, visible: true },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'reference', label: 'PR Reference', width: 130, sortable: true, visible: true },
  { key: 'amount', label: 'Amount', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'orderDate', label: 'Order Date', width: 120, sortable: true, visible: true },
  { key: 'expectedDate', label: 'ETD', width: 120, sortable: true, visible: true },
  { key: 'status', label: 'Stage', width: 130, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the NFA (Note for Approval) list. */
export const NFA_COLUMNS = [
  { key: 'nfaNo', label: 'NFA Number', width: 140, sortable: true, visible: true, sticky: 'left' },
  { key: 'rfqNo', label: 'RFQ No', width: 140, sortable: true, visible: true },
  { key: 'title', label: 'RFQ Title', width: 230, sortable: true, visible: true },
  { key: 'supplier', label: 'Supplier', width: 180, sortable: true, visible: true },
  { key: 'amount', label: 'Amount', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'raisedDate', label: 'Raised Date', width: 120, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the Purchase Invoice list. */
export const INVOICE_COLUMNS = [
  { key: 'invoiceNo', label: 'Invoice No', width: 140, sortable: true, visible: true, sticky: 'left' },
  { key: 'vendor', label: 'Vendor', width: 160, sortable: true, visible: true },
  { key: 'poNo', label: 'PO No', width: 130, sortable: true, visible: true },
  { key: 'invoiceDate', label: 'Invoice Date', width: 120, sortable: true, visible: true },
  { key: 'dueDate', label: 'Due Date', width: 120, sortable: true, visible: true },
  { key: 'total', label: 'Amount', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'matchStatus', label: 'Matching', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'paymentStatus', label: 'Payment', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'outstanding', label: 'Outstanding', width: 130, sortable: true, visible: true, align: 'right' },
  { key: 'status', label: 'Status', width: 140, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

/** Purchase document stages — used by the central Documents repository. */
export const DOCUMENT_STAGE = {
  PR: 'Purchase Requisition',
  RFQ: 'RFQ',
  QUOTATION: 'Vendor Quotation',
  PCS: 'Price Comparative Statement',
  NEGOTIATION: 'Final Negotiation',
  NFA: 'Approval Note',
  SELECTION: 'Supplier Selection',
  PO: 'Purchase Order',
  GRN: 'Goods Receipt / GRN',
  INVOICE: 'Purchase Invoice',
  PAYMENT: 'Payment',
  OTHER: 'Other'
};

export const DOCUMENT_STAGES = Object.values(DOCUMENT_STAGE);

/** Document type categories. */
export const DOCUMENT_TYPE = {
  ATTACHMENT: 'Attachment',
  GENERATED: 'System Generated',
  UPLOADED: 'Uploaded'
};

export const DOCUMENT_TYPES = Object.values(DOCUMENT_TYPE);

/** Folder-specific document type options for upload. */
export const FOLDER_DOC_TYPES = {
  PR: ['Material Specification', 'Requirement Document', 'Technical Specification', 'Purchase Requisition', 'Attachment', 'Other'],
  TSR: ['Technical Evaluation', 'Supplier Selection', 'Negotiation Summary', 'Review Document', 'Attachment', 'Other'],
  RFQ: ['RFQ', 'Vendor Quotation', 'Quotation Comparison', 'Price Comparative Statement', 'Attachment', 'Other'],
  PO: ['Purchase Order', 'PO Supporting Document', 'Terms & Conditions', 'Attachment', 'Other'],
  LOGISTICS: ['Delivery Challan', 'GRN', 'Transport Document', 'Delivery Receipt', 'Inspection Document', 'Attachment', 'Other'],
  INVOICE: ['Purchase Invoice', 'Debit Note', 'Credit Note', 'Invoice Supporting Document', 'Payment Advice', 'Attachment', 'Other'],
  NFA: ['Approval Note', 'NFA Document', 'Supporting Document', 'Attachment', 'Other'],
  VENDOR: ['Vendor Registration', 'GST Certificate', 'Bank Document', 'Compliance Document', 'Vendor Agreement', 'Attachment', 'Other'],
  REPORTS: ['Purchase Report', 'Vendor Report', 'RFQ Report', 'PO Report', 'Invoice Report', 'Other'],
  OTHER: ['General Purchase Document', 'Attachment', 'Other']
};

/** Repository filter stages — maps to the source module filter chips. */
export const REPOSITORY_STAGES = [
  { key: 'All', label: 'All', stages: [] },
  { key: 'Purchase Requisition', label: 'Purchase Requisition', stages: ['Purchase Requisition'] },
  { key: 'RFQ', label: 'RFQ', stages: ['RFQ'] },
  { key: 'Quotation', label: 'Vendor Quotation', stages: ['Vendor Quotation'] },
  { key: 'Technical Evaluation', label: 'Technical Evaluation', stages: ['Supplier Selection', 'Final Negotiation'] },
  { key: 'Commercial', label: 'Commercial / Negotiation', stages: ['Price Comparative Statement', 'Final Negotiation'] },
  { key: 'Purchase Order', label: 'Purchase Order', stages: ['Purchase Order'] },
  { key: 'Supplier Acknowledgement', label: 'Supplier Acknowledgement', stages: ['Purchase Order'] },
  { key: 'Logistics', label: 'Logistics / Dispatch', stages: ['Goods Receipt / GRN'] },
  { key: 'Invoice', label: 'Invoice', stages: ['Purchase Invoice'] },
  { key: 'Payment', label: 'Payment', stages: ['Payment'] },
  { key: 'NFA', label: 'NFA / Approval', stages: ['Approval Note'] },
  { key: 'Vendor', label: 'Vendor', stages: ['Vendor Management', 'Other'] },
  { key: 'Reports', label: 'Reports', stages: ['Other'] },
  { key: 'Other', label: 'Other', stages: ['Other'] }
];

/** Column layout for the Purchase Documents repository. */
export const DOCUMENT_COLUMNS = [
  { key: 'name', label: 'Document Name', width: 260, sortable: true, visible: true, sticky: 'left', defaultVisible: true },
  { key: 'docType', label: 'Type', width: 120, sortable: true, visible: true, defaultVisible: true },
  { key: 'docNo', label: 'Doc Number', width: 150, sortable: true, visible: true, defaultVisible: true },
  { key: 'stage', label: 'Source Module', width: 180, sortable: true, visible: true, defaultVisible: true },
  { key: 'version', label: 'Version', width: 80, sortable: true, visible: true, defaultVisible: true, align: 'center' },
  { key: 'prNo', label: 'PR Number', width: 140, sortable: true, visible: true, defaultVisible: false },
  { key: 'rfqNo', label: 'RFQ Number', width: 140, sortable: true, visible: true, defaultVisible: false },
  { key: 'poNo', label: 'PO Number', width: 140, sortable: true, visible: true, defaultVisible: false },
  { key: 'vendor', label: 'Vendor', width: 170, sortable: true, visible: true, defaultVisible: true },
  { key: 'uploadedBy', label: 'Uploaded By', width: 140, sortable: true, visible: true, defaultVisible: true },
  { key: 'uploadedAt', label: 'Created', width: 120, sortable: true, visible: true, defaultVisible: true },
  { key: 'updatedAt', label: 'Updated', width: 120, sortable: true, visible: true, defaultVisible: false },
  { key: 'fileType', label: 'File Type', width: 80, sortable: true, visible: true, defaultVisible: true, align: 'center' },
  { key: 'fileSize', label: 'Size', width: 90, sortable: true, visible: true, defaultVisible: true, align: 'right' },
  { key: 'source', label: 'Source', width: 110, sortable: true, visible: true, defaultVisible: true, align: 'center' },
  { key: 'status', label: 'Status', width: 110, sortable: true, visible: true, defaultVisible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 120, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the Price Comparative Statement list.
 * Same shared table machinery as every other Purchase list page
 * (PurchaseTable + cpr-list.css). RFQ Number is the mandatory
 * sticky id column; Actions is pinned right. */
export const PCS_COLUMNS = [
  { key: 'sNo', label: 'S.NO', width: 52, sortable: false, visible: true },
  { key: 'rfqNo', label: 'RFQ Number', width: 150, sortable: true, visible: true, sticky: 'left' },
  { key: 'prNo', label: 'PR Number', width: 140, sortable: true, visible: true },
  { key: 'description', label: 'Description', width: 280, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'quotes', label: 'Quotes', width: 90, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Column layout for the Technical Evaluation list.
 * Same shared table machinery as every other Purchase list page
 * (PurchaseTable + cpr-list.css). Status renders the derived
 * evaluation state (Pending / Completed / Locked). RFQ Number is
 * the mandatory sticky id column; Actions is pinned right. */
export const TE_COLUMNS = [
  { key: 'sNo', label: 'S.NO', width: 52, sortable: false, visible: true },
  { key: 'rfqNo', label: 'RFQ Number', width: 150, sortable: true, visible: true, sticky: 'left' },
  { key: 'title', label: 'RFQ Title', width: 280, sortable: true, visible: true },
  { key: 'vendorCount', label: 'Vendors', width: 90, sortable: true, visible: true, align: 'center' },
  { key: 'bestScore', label: 'Best Score', width: 110, sortable: true, visible: true, align: 'center' },
  { key: 'evalDate', label: 'Evaluation Date', width: 130, sortable: true, visible: true },
  { key: 'currency', label: 'Currency', width: 90, sortable: true, visible: true },
  { key: 'status', label: 'Status', width: 120, sortable: true, visible: true, align: 'center' },
  { key: 'progress', label: 'Progress', width: 150, sortable: true, visible: true, align: 'center' },
  { key: 'actions', label: 'Actions', width: 96, sortable: false, visible: true, sticky: 'right', align: 'center' }
];

/** Supplier Master — legal entity types (used by the supplier form). */
export const SUPPLIER_LEGAL_TYPES = [
  'Private Limited Company',
  'Public Limited Company',
  'LLP',
  'Partnership Firm',
  'Sole Proprietorship',
  'Government / PSU',
  'Society / Trust',
  'Proprietor / Individual',
  'Other'
];

/** Supplier Master — address purposes. */
export const SUPPLIER_ADDRESS_TYPES = [
  'Registered Office',
  'Head Office',
  'Plant',
  'Warehouse',
  'Branch Office',
  'Site / Project',
  'Billing Address',
  'Shipping Address'
];

/** Supplier Master — contact designations. */
export const SUPPLIER_CONTACT_ROLES = [
  'Primary Contact',
  'Sales',
  'Accounts / Billing',
  'Technical',
  'Dispatch / Logistics',
  'Quality',
  'Management'
];

/** Supplier Master — contract statuses (documents / agreements register). */
export const SUPPLIER_CONTRACT_STATUS = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  EXPIRED: 'Expired',
  CLOSED: 'Closed',
  TERMINATED: 'Terminated'
};

export const SUPPLIER_CONTRACT_STATUSES = Object.values(SUPPLIER_CONTRACT_STATUS);

/** Supplier Master — contract types. */
export const SUPPLIER_CONTRACT_TYPES = [
  'Rate Contract',
  'Annual Maintenance',
  'Framework Agreement',
  'Service Agreement',
  'Non-Disclosure Agreement',
  'Consignment Agreement',
  'Other'
];

/** Supplier Master — legal registration markers (India-oriented tax master). */
export const MSME_TYPES = ['Micro', 'Small', 'Medium', 'None'];

export const AVATAR_COLORS = [
  'bg-amber-100 text-amber-800',
  'bg-sky-100 text-sky-800',
  'bg-rose-100 text-rose-800',
  'bg-emerald-100 text-emerald-800',
  'bg-indigo-100 text-indigo-800',
  'bg-teal-100 text-teal-800',
  'bg-purple-100 text-purple-800',
  'bg-orange-100 text-orange-800',
  'bg-blue-100 text-blue-800',
  'bg-pink-100 text-pink-800'
];
