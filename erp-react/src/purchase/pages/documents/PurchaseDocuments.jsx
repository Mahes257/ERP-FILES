/**
 * purchase/pages/documents/PurchaseDocuments.jsx
 * ------------------------------------------------------------------
 * Purchase Documents — the Purchase module's central document repository,
 * rendered as the SAME folder-first explorer as Sales Documents
 * (pages/Documents.jsx):
 *
 *   page action row (Refresh · Upload Document)
 *   └── Documents card
 *       ├── breadcrumb + Back
 *       ├── folder cards (name, document count, open indicator)
 *       ├── search / filter toolbar (inside an open folder)
 *       └── document table + pagination (inside an open folder)
 *
 * Route: /purchase/documents
 *
 * FOLDERS — the Purchase module's own sub-modules:
 *
 *   Purchase Requisition   → PR List · Technical Specification Review
 *   Vendor Management      → Vendor List · Vendor Documents ·
 *                            Vendor Performance · Vendor Reports
 *   RFQ & Quotations       → RFQ List · RFQ Follow-ups · Quotations ·
 *                            Final Negotiation · Price Comparative Statement ·
 *                            Technical Evaluation · Approval Flow
 *   Purchase Orders        → PO List · Approval ·
 *                            Released Orders & Supplier Acknowledgement
 *   Logistics / Dispatch   → Manufacturing / Packing · Shipment Tracking ·
 *                            Goods Receipt / GRN · Quality Inspection ·
 *                            Inventory Update
 *   Purchase Invoice       → Invoice List · 3-Way Matching · Payment Approval ·
 *                            Vendor Payment · Payment Advice ·
 *                            Credit / Debit Notes
 *   Other Documents
 *
 * DATA — every row comes from the existing Purchase document repository
 * (`purchase/services/documents`). A document is filed by the metadata the
 * writing flow already stored:
 *
 *   • `docId` writer prefix  DOC-GEN-<TYPE>-…  (documentRegistration.js)
 *   • `folder`               PR / TSR / RFQ / PO / LOGISTICS / INVOICE /
 *                            NFA / VENDOR / REPORTS / OTHER
 *   • `stage`                DOCUMENT_STAGE values
 *   • `docType`              refined for Credit / Debit Note, Payment Advice,
 *                            Supplier Acknowledgement, Technical Evaluation
 *   • vendor-document rows   projected from the Vendor Documents register
 *                            (`vdoc-…`), which belong to Vendor Documents
 *
 * Nothing is invented, nothing is hard-coded: counts and rows are the
 * repository's own records, and a folder with no writer shows the same
 * accurate empty state Sales Documents shows.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Printer,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import { ActionMenu } from '../../../components/Common';
import { ConfirmDialog, useToast } from '../../components/ui';
import PurchasePageLayout from '../../components/list/PurchasePageLayout';
import AttachmentPreview from '../../components/AttachmentPreview';
import { DOCUMENT_TYPE } from '../../constants';
import { documentsService } from '../../services/documents';
import { documentPermissionsService } from '../../services/documentPermissions';
import { documentAuditService } from '../../services/documentAudit';
import {
  ACCEPT_STRING,
  ALLOWED_EXT_KEYS,
  TYPE_TONES,
  detectType,
  downloadAttachment,
  fileRejectionReason,
  formatSize
} from '../../utils/attachmentFile';
import { formatDate } from '../../utils/helpers';
import { resolvePrintRoute, resolveSourceRoute } from '../../utils/sourceNavigation';
import '../../../styles/document-badges.css';

/* ------------------------------------------------------------------
 * Folder hierarchy
 *
 * Two roots, exactly like the Sales Documents explorer:
 *
 *   Purchase Documents
 *   ├── Inside ERP → Purchase Requisition · Vendor Management · RFQ &
 *   │                Quotations · Purchase Orders · Logistics / Dispatch ·
 *   │                Purchase Invoice (each with its sub-modules) and Other
 *   │                Documents for ERP rows whose metadata names no module
 *   └── Local Doc  → Other Documents (files uploaded from this computer)
 *
 * `uploadFolder` / `uploadDocType` describe where a file chosen from this page
 * is filed when that folder is open: the repository's existing `folder` key
 * (DOCUMENT_FOLDER) and, where a sub-module needs a finer marker, the existing
 * `docType` value the grouping below already understands.
 * ------------------------------------------------------------------ */

const DOCUMENTS_ROOT = { id: null, label: 'Documents' };

/**
 * The `sourceModule` marker a file uploaded from this page (outside an ERP
 * folder) is filed under. It is the Purchase counterpart of the Sales page's
 * `module = 'Local Doc'`: a spelling no Purchase print/registration flow
 * writes, so only genuine local uploads can be identified as local — an
 * ERP-generated document is NEVER classified as local.
 */
const LOCAL_UPLOAD_MARKER = 'Local Doc';

const INSIDE_ERP_FOLDER_ID = 'insideerp';
const LOCAL_DOC_FOLDER_ID = 'localdoc';
/** Home for ERP rows whose own metadata names no module. Rendered only once
 *  it actually holds something, so Inside ERP shows just the six sub-modules. */
const ERP_FALLBACK_FOLDER_ID = 'insideerp/other';

const PURCHASE_FOLDERS = [
  /* ─── Two roots, exactly like Sales Documents ─── */
  { id: INSIDE_ERP_FOLDER_ID, label: 'Inside ERP', parent: null },
  { id: LOCAL_DOC_FOLDER_ID, label: 'Local Doc', parent: null },

  /* ─── Inside ERP → Purchase Requisition ─── */
  { id: 'insideerp/pr', label: 'Purchase Requisition', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'PR', uploadSourceModule: 'Purchase Requisition' },
  { id: 'insideerp/pr/list', label: 'PR List', parent: 'insideerp/pr', uploadFolder: 'PR', uploadSourceModule: 'Purchase Requisition' },
  { id: 'insideerp/pr/tsr', label: 'Technical Specification Review', parent: 'insideerp/pr', uploadFolder: 'TSR' },

  /* ─── Inside ERP → Vendor Management ─── */
  { id: 'insideerp/vendor', label: 'Vendor Management', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'VENDOR', uploadSourceModule: 'Vendor' },
  { id: 'insideerp/vendor/list', label: 'Vendor List', parent: 'insideerp/vendor', uploadFolder: 'VENDOR', uploadSourceModule: 'Vendor' },
  { id: 'insideerp/vendor/documents', label: 'Vendor Documents', parent: 'insideerp/vendor', uploadFolder: 'VENDOR', uploadSourceModule: 'Vendor' },
  { id: 'insideerp/vendor/performance', label: 'Vendor Performance', parent: 'insideerp/vendor', uploadFolder: 'VENDOR', uploadSourceModule: 'Vendor' },
  { id: 'insideerp/vendor/reports', label: 'Vendor Reports', parent: 'insideerp/vendor', uploadFolder: 'VENDOR', uploadSourceModule: 'Vendor' },

  /* ─── Inside ERP → RFQ & Quotations ─── */
  { id: 'insideerp/rfq', label: 'RFQ & Quotations', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'RFQ', uploadSourceModule: 'RFQ' },
  { id: 'insideerp/rfq/list', label: 'RFQ List', parent: 'insideerp/rfq', uploadFolder: 'RFQ', uploadSourceModule: 'RFQ' },
  { id: 'insideerp/rfq/followups', label: 'RFQ Follow-ups', parent: 'insideerp/rfq', uploadFolder: 'RFQ', uploadSourceModule: 'RFQ' },
  { id: 'insideerp/rfq/quotations', label: 'Quotations', parent: 'insideerp/rfq', uploadFolder: 'RFQ', uploadSourceModule: 'Quotation' },
  { id: 'insideerp/rfq/negotiation', label: 'Final Negotiation', parent: 'insideerp/rfq', uploadFolder: 'RFQ', uploadSourceModule: 'RFQ' },
  { id: 'insideerp/rfq/pcs', label: 'Price Comparative Statement', parent: 'insideerp/rfq', uploadFolder: 'RFQ', uploadSourceModule: 'RFQ' },
  { id: 'insideerp/rfq/technical-evaluation', label: 'Technical Evaluation', parent: 'insideerp/rfq', uploadFolder: 'TSR' },
  { id: 'insideerp/rfq/approval', label: 'Approval Flow', parent: 'insideerp/rfq', uploadFolder: 'NFA', uploadSourceModule: 'NFA' },

  /* ─── Inside ERP → Purchase Orders ─── */
  { id: 'insideerp/po', label: 'Purchase Orders', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'PO', uploadSourceModule: 'Purchase Order' },
  { id: 'insideerp/po/list', label: 'PO List', parent: 'insideerp/po', uploadFolder: 'PO', uploadSourceModule: 'Purchase Order' },
  { id: 'insideerp/po/approval', label: 'Approval', parent: 'insideerp/po', uploadFolder: 'PO', uploadSourceModule: 'Purchase Order' },
  {
    id: 'insideerp/po/released',
    label: 'Released Orders & Supplier Acknowledgement',
    parent: 'insideerp/po',
    uploadFolder: 'PO',
    uploadDocType: 'Supplier Acknowledgement',
    uploadSourceModule: 'Purchase Order'
  },

  /* ─── Inside ERP → Logistics / Dispatch ─── */
  { id: 'insideerp/logistics', label: 'Logistics / Dispatch', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'LOGISTICS', uploadSourceModule: 'GRN' },
  { id: 'insideerp/logistics/manufacturing', label: 'Manufacturing / Packing', parent: 'insideerp/logistics', uploadFolder: 'LOGISTICS', uploadSourceModule: 'GRN' },
  { id: 'insideerp/logistics/shipment', label: 'Shipment Tracking', parent: 'insideerp/logistics', uploadFolder: 'LOGISTICS', uploadSourceModule: 'GRN' },
  { id: 'insideerp/logistics/grn', label: 'Goods Receipt / GRN', parent: 'insideerp/logistics', uploadFolder: 'LOGISTICS', uploadSourceModule: 'GRN' },
  { id: 'insideerp/logistics/quality', label: 'Quality Inspection', parent: 'insideerp/logistics', uploadFolder: 'LOGISTICS', uploadSourceModule: 'GRN' },
  { id: 'insideerp/logistics/inventory', label: 'Inventory Update', parent: 'insideerp/logistics', uploadFolder: 'LOGISTICS', uploadSourceModule: 'GRN' },

  /* ─── Inside ERP → Purchase Invoice ─── */
  { id: 'insideerp/invoice', label: 'Purchase Invoice', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'INVOICE', uploadSourceModule: 'Invoice' },
  { id: 'insideerp/invoice/list', label: 'Invoice List', parent: 'insideerp/invoice', uploadFolder: 'INVOICE', uploadSourceModule: 'Invoice' },
  { id: 'insideerp/invoice/matching', label: '3-Way Matching', parent: 'insideerp/invoice', uploadFolder: 'INVOICE', uploadSourceModule: 'Invoice' },
  { id: 'insideerp/invoice/payment-approval', label: 'Payment Approval', parent: 'insideerp/invoice', uploadFolder: 'INVOICE', uploadSourceModule: 'Invoice' },
  { id: 'insideerp/invoice/vendor-payment', label: 'Vendor Payment', parent: 'insideerp/invoice', uploadFolder: 'INVOICE', uploadSourceModule: 'Invoice' },
  {
    id: 'insideerp/invoice/payment-advice',
    label: 'Payment Advice',
    parent: 'insideerp/invoice',
    uploadFolder: 'INVOICE',
    uploadDocType: 'Payment Advice',
    uploadSourceModule: 'Invoice'
  },
  {
    id: 'insideerp/invoice/credit-notes',
    label: 'Credit / Debit Notes',
    parent: 'insideerp/invoice',
    uploadFolder: 'INVOICE',
    uploadDocType: 'Credit Note',
    uploadSourceModule: 'Invoice'
  },

  /* ERP-side documents whose own metadata names no module (e.g. reports). */
  { id: ERP_FALLBACK_FOLDER_ID, label: 'Other Documents', parent: INSIDE_ERP_FOLDER_ID, uploadFolder: 'OTHER' },

  /* ─── Local Doc → Other Documents (files uploaded from this computer) ─── */
  { id: 'localdoc/other', label: 'Other Documents', parent: LOCAL_DOC_FOLDER_ID, localUpload: true }
];

const FOLDER_BY_ID = new Map(PURCHASE_FOLDERS.map((folder) => [folder.id, folder]));
const FOLDER_IDS = new Set(PURCHASE_FOLDERS.map((folder) => folder.id));

/** Canonical key: 'Credit Note' === 'creditNote' === 'credit_note'. */
function normalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function folderById(id) {
  return FOLDER_BY_ID.get(id) || null;
}

function folderChildren(id) {
  return PURCHASE_FOLDERS.filter((folder) => folder.parent === id);
}

/**
 * True only for a file uploaded from this page outside an ERP folder: the
 * upload carried the Local Doc marker. ERP-generated rows (source "System
 * Generated") can never match, so they are never classified as local.
 */
function isLocalDocument(doc) {
  return doc?.source === DOCUMENT_TYPE.UPLOADED
    && normalizeKey(doc?.sourceModule) === normalizeKey(LOCAL_UPLOAD_MARKER);
}

/** Ancestors of a folder, root first — the breadcrumb (and the Back target). */
function folderTrail(id) {
  const trail = [DOCUMENTS_ROOT];
  if (!id) return trail;
  const chain = [];
  let current = folderById(id);
  while (current) {
    chain.unshift(current);
    current = current.parent ? folderById(current.parent) : null;
  }
  return trail.concat(chain);
}

/* ---- Document → folder, from the metadata each writing flow already stored ---- */

/** `docId` writer prefix produced by documentRegistration.js. */
const GENERATED_TYPE_RE = /^DOC-GEN-([A-Z_]+)-/;

/** Generated document type → the sub-module that produced it. */
const SUBFOLDER_BY_GENERATED_TYPE = {
  PR: 'insideerp/pr/list',
  TECHNICAL_EVALUATION: 'insideerp/rfq/technical-evaluation',
  RFQ: 'insideerp/rfq/list',
  QUOTATION: 'insideerp/rfq/quotations',
  PO: 'insideerp/po/list',
  SUPPLIER_ACK: 'insideerp/po/released',
  INVOICE: 'insideerp/invoice/list',
  NFA: 'insideerp/rfq/approval',
  GRN: 'insideerp/logistics/grn',
  REPORT: 'insideerp/other',
  VENDOR: 'insideerp/vendor/documents'
};

/** Repository folder key → the sub-module that owns it. */
const SUBFOLDER_BY_FOLDER_KEY = {
  PR: 'insideerp/pr/list',
  TSR: 'insideerp/pr/tsr',
  RFQ: 'insideerp/rfq/list',
  PO: 'insideerp/po/list',
  LOGISTICS: 'insideerp/logistics/grn',
  INVOICE: 'insideerp/invoice/list',
  NFA: 'insideerp/rfq/approval',
  VENDOR: 'insideerp/vendor/documents',
  REPORTS: 'insideerp/other',
  OTHER: 'insideerp/other'
};

/** Workflow stage → sub-module, used when the folder key alone is generic. */
const SUBFOLDER_BY_STAGE_KEY = {
  purchaserequisition: 'insideerp/pr/list',
  rfq: 'insideerp/rfq/list',
  vendorquotation: 'insideerp/rfq/quotations',
  pricecomparativestatement: 'insideerp/rfq/pcs',
  finalnegotiation: 'insideerp/rfq/negotiation',
  approvalnote: 'insideerp/rfq/approval',
  supplierselection: 'insideerp/rfq/technical-evaluation',
  purchaseorder: 'insideerp/po/list',
  goodsreceiptgrn: 'insideerp/logistics/grn',
  purchaseinvoice: 'insideerp/invoice/list',
  payment: 'insideerp/invoice/payment-advice',
  vendormanagement: 'insideerp/vendor/documents'
};

/** Refinements where the document type names the sub-module more precisely. */
const SUBFOLDER_BY_DOC_TYPE = [
  { match: /creditnote|debitnote/, folder: 'insideerp/invoice/credit-notes' },
  { match: /paymentadvice/, folder: 'insideerp/invoice/payment-advice' },
  { match: /supplieracknowledg/, folder: 'insideerp/po/released' },
  { match: /technicalevaluation|technicalspecificationreview/, folder: 'insideerp/rfq/technical-evaluation' }
];

function generatedTypeOf(doc) {
  const match = GENERATED_TYPE_RE.exec(String(doc?.docId || ''));
  return match ? match[1] : '';
}

/**
 * The folder a repository row belongs to, from its own metadata only.
 * Order: the writer that produced it → its folder key → its document type
 * refinement → its workflow stage → Other Documents. Every row is placed
 * exactly once.
 */
function folderIdForDocument(doc) {
  /* Local Doc: only a genuine upload from this page (the marker), never an
     ERP-generated document. */
  if (isLocalDocument(doc)) return 'localdoc/other';

  /* Vendor-document register rows are projected with a `vdoc-` id. */
  if (String(doc?.docId || '').startsWith('vdoc-')) return 'insideerp/vendor/documents';

  const generatedType = generatedTypeOf(doc);
  if (generatedType && SUBFOLDER_BY_GENERATED_TYPE[generatedType]) {
    const folderId = SUBFOLDER_BY_GENERATED_TYPE[generatedType];
    /* A generated Credit Note / Payment Advice keeps its own sub-module even
       though its writer registers it as an invoice. */
    const refined = SUBFOLDER_BY_DOC_TYPE.find((rule) => rule.match.test(normalizeKey(doc?.docType)));
    if (refined && folderId === 'insideerp/invoice/list') return refined.folder;
    return folderId;
  }

  const folderKey = String(doc?.folder || '').toUpperCase();
  if (folderKey === 'VENDOR' || !folderKey) {
    if (normalizeKey(doc?.stage) === 'vendormanagement') return 'insideerp/vendor/documents';
  }

  const docTypeMatch = SUBFOLDER_BY_DOC_TYPE.find((rule) => rule.match.test(normalizeKey(doc?.docType)));
  if (docTypeMatch) return docTypeMatch.folder;

  if (SUBFOLDER_BY_FOLDER_KEY[folderKey]) {
    /* A generic folder key (OTHER) may still be identified by its stage. */
    if (folderKey === 'OTHER' || folderKey === 'REPORTS') {
      const stageFolder = SUBFOLDER_BY_STAGE_KEY[normalizeKey(doc?.stage)];
      if (stageFolder) return stageFolder;
    }
    return SUBFOLDER_BY_FOLDER_KEY[folderKey];
  }

  const stageFolder = SUBFOLDER_BY_STAGE_KEY[normalizeKey(doc?.stage)];
  return stageFolder || ERP_FALLBACK_FOLDER_ID;
}

/** Every document is placed exactly once, so the counts always add up. */
function groupByFolder(documents = []) {
  const byFolder = {};
  for (const doc of documents) {
    const id = folderIdForDocument(doc);
    if (!byFolder[id]) byFolder[id] = [];
    byFolder[id].push(doc);
  }
  return byFolder;
}

function descendantsOf(id) {
  const out = [];
  for (const child of folderChildren(id)) {
    out.push(child.id, ...descendantsOf(child.id));
  }
  return out;
}

/** Every document at or below a folder — the number a folder card shows. */
function folderDocuments(id, byFolder) {
  return [id, ...descendantsOf(id)].flatMap((folderId) => byFolder[folderId] || []);
}

/** Documents rendered inside a folder: only its own files. */
function documentsInFolder(id, byFolder) {
  return id === null ? [] : (byFolder[id] || []);
}

/* ------------------------------------------------------------------
 * Search + filter over ONE folder's own documents
 * ------------------------------------------------------------------ */

const EMPTY_FILTERS = Object.freeze({ type: '', stage: '', vendor: '', from: '', to: '' });

function sourceModuleLabel(doc) {
  return String(doc?.sourceModule || doc?.stage || '').trim();
}

function searchableText(doc) {
  if (!doc) return '';
  return [
    doc.name, doc.docNo, doc.docType, doc.stage, doc.sourceModule, doc.vendor,
    doc.prNo, doc.rfqNo, doc.poNo, doc.uploadedBy, doc.fileType, doc.status,
    doc.sourceLabel
  ]
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' ')
    .toLowerCase();
}

function uploadedDate(doc) {
  const match = String(doc?.uploadedAt || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function matchesFilters(doc, filters) {
  const active = filters || {};
  if (active.type && String(doc?.docType || '') !== active.type) return false;
  if (active.stage && sourceModuleLabel(doc) !== active.stage) return false;
  if (active.vendor && String(doc?.vendor || '') !== active.vendor) return false;
  if (active.from || active.to) {
    const date = uploadedDate(doc);
    // A row with no date cannot be proven to fall inside the range.
    if (!date) return false;
    if (active.from && date < active.from) return false;
    if (active.to && date > active.to) return false;
  }
  return true;
}

function applyDocumentFilters(documents = [], { query = '', filters } = {}) {
  const needle = String(query || '').trim().toLowerCase();
  return documents.filter(
    (doc) => (!needle || searchableText(doc).includes(needle)) && matchesFilters(doc, filters)
  );
}

function filterOptions(documents = []) {
  const types = new Set();
  const stages = new Set();
  const vendors = new Set();
  for (const doc of documents) {
    if (doc?.docType) types.add(doc.docType);
    const stage = sourceModuleLabel(doc);
    if (stage) stages.add(stage);
    if (doc?.vendor) vendors.add(doc.vendor);
  }
  const sort = (a, b) => String(a).localeCompare(String(b));
  return {
    documentTypes: [...types].sort(sort),
    stages: [...stages].sort(sort),
    vendors: [...vendors].sort(sort)
  };
}

function countActiveFilters(filters) {
  const active = filters || {};
  return ['type', 'stage', 'vendor', 'from', 'to'].filter((key) => String(active[key] || '') !== '').length;
}

function hasActiveConditions(query, filters) {
  return String(query || '').trim() !== '' || countActiveFilters(filters) > 0;
}

/* ------------------------------------------------------------------
 * Presentation helpers
 * ------------------------------------------------------------------ */

const UPLOAD_MAX_SIZE_MB = 5;
const FOLDER_PAGE_SIZE = 10;

function documentDisplayName(doc) {
  return String(doc?.name || '').trim() || `Document #${doc?.docId || doc?.id || ''}`;
}

function documentStatus(doc) {
  const status = String(doc?.status || '').trim();
  if (!status || status.toLowerCase() === 'final') {
    return doc?.source === DOCUMENT_TYPE.UPLOADED ? 'Uploaded' : 'Final';
  }
  return status;
}

const STATUS_BADGE_CLASS = {
  uploaded: 'doc-badge doc-badge-blue',
  generated: 'doc-badge doc-badge-green',
  final: 'doc-badge doc-badge-green',
  pending: 'doc-badge doc-badge-amber',
  'pending generation': 'doc-badge doc-badge-amber',
  archived: 'doc-badge doc-badge-gray',
  deleted: 'doc-badge doc-badge-red'
};

function documentTypeLabel(doc) {
  const type = String(doc?.docType || '').trim();
  if (!type || type === DOCUMENT_TYPE.UPLOADED) {
    return String(doc?.fileType || '—').toUpperCase();
  }
  return type;
}

function isPendingGeneration(doc) {
  return doc?.generationStatus === 'Pending' && !doc?.sourceUrl;
}

/* ------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------ */

export default function PurchaseDocuments() {
  const navigate = useNavigate();
  const toast = useToast();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);
  const uploadInputRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      /* The existing listing — active rows only, vendor documents included. */
      const result = await documentsService.getDocuments({
        page: 1,
        pageSize: 10000,
        sortBy: 'uploadedAt',
        sortDir: 'desc'
      });
      setDocuments(Array.isArray(result?.data) ? result.data : []);
      setError(null);
    } catch (err) {
      console.error('Failed to load purchase documents', err);
      setError(err?.message || 'Failed to load documents');
      setDocuments([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await documentsService.refreshDocuments();
      await load({ silent: true });
      toast.success('Documents reloaded from the repository.');
    } finally {
      setRefreshing(false);
    }
  };

  /* ─── Folder navigation (deep-linkable, so Back/Forward work) ───
   * The open folder lives in the URL (`/purchase/documents?folder=rfq/quotations`),
   * so a folder can be linked, reloaded and reached with the browser's back
   * and forward buttons. An unknown value shows the Documents root. */
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedFolder = searchParams.get('folder');
  const folderId = FOLDER_IDS.has(requestedFolder) ? requestedFolder : null;
  const [page, setPage] = useState(0);

  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleQueryChange = (value) => {
    setQuery(value);
    setPage(0);
  };

  const handleFilterField = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
    setPage(0);
  };

  const handleClearConditions = () => {
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setPage(0);
  };

  const goToFolder = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('folder', id);
    else next.delete('folder');
    handleClearConditions();
    setSearchParams(next);
  };

  const trail = useMemo(() => folderTrail(folderId), [folderId]);
  const parentFolder = folderId ? (folderById(folderId)?.parent || null) : null;
  const children = useMemo(() => folderChildren(folderId), [folderId]);
  const grouped = useMemo(() => groupByFolder(documents), [documents]);

  const folderDocs = useMemo(
    () => documentsInFolder(folderId, grouped),
    [folderId, grouped]
  );

  const filteredDocs = useMemo(
    () => applyDocumentFilters(folderDocs, { query, filters }),
    [folderDocs, query, filters]
  );
  const typeOptions = useMemo(() => filterOptions(folderDocs).documentTypes, [folderDocs]);
  const stageOptions = useMemo(() => filterOptions(folderDocs).stages, [folderDocs]);
  const vendorOptions = useMemo(() => filterOptions(folderDocs).vendors, [folderDocs]);
  const activeFilterCount = countActiveFilters(filters);
  const conditionsActive = hasActiveConditions(query, filters);

  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / FOLDER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = filteredDocs.slice(safePage * FOLDER_PAGE_SIZE, (safePage + 1) * FOLDER_PAGE_SIZE);
  const rangeStart = filteredDocs.length === 0 ? 0 : safePage * FOLDER_PAGE_SIZE + 1;
  const rangeEnd = Math.min((safePage + 1) * FOLDER_PAGE_SIZE, filteredDocs.length);

  /* ─── Preview ─── */
  const [previewDoc, setPreviewDoc] = useState(null);

  const handlePreview = (doc) => {
    if (isPendingGeneration(doc)) {
      toast.info('Document is waiting to be generated. Use Generate Document first.');
      return;
    }
    const access = documentPermissionsService.canDownload(doc);
    if (!access.allowed) {
      documentAuditService.recordAccessDenied(doc, access.reason);
      toast.error(access.reason);
      return;
    }
    documentAuditService.recordView(doc, 'ui');
    if (!doc.sourceUrl) {
      const { route, canNavigate } = resolveSourceRoute(doc);
      if (canNavigate && route) navigate(route);
      else toast.info('No preview available for this document');
      return;
    }
    setPreviewDoc(doc);
  };

  const handleDownload = async (doc) => {
    if (isPendingGeneration(doc)) {
      toast.info('Document has not been generated yet. Use Generate Document first.');
      return;
    }
    const access = documentPermissionsService.canDownload(doc);
    if (!access.allowed) {
      documentAuditService.recordAccessDenied(doc, access.reason);
      toast.error(access.reason);
      return;
    }
    if (downloadingId) return;
    setDownloadingId(doc.docId);

    if (!doc.sourceUrl) {
      const { route, canNavigate } = resolveSourceRoute(doc);
      setDownloadingId(null);
      if (canNavigate && route) {
        navigate(route);
        toast.info('Navigate to the source record to download this document');
      } else {
        toast.info('No downloadable file available for this document');
      }
      return;
    }

    try {
      const ext = (doc.fileType || 'pdf').toLowerCase();
      const safeName = documentDisplayName(doc).replace(/[^a-zA-Z0-9-_ ]/g, '').replace(/\s+/g, '-');
      const ok = await downloadAttachment({
        name: `${safeName || 'document'}-v${doc.version || 1}.${ext}`,
        dataUrl: doc.sourceUrl,
        type: doc.sourceType
      });
      if (ok) documentAuditService.recordDownload(doc, 'ui');
      else toast.error('File not available for download');
    } finally {
      setDownloadingId(null);
    }
  };

  const handlePrint = (doc) => {
    const access = documentPermissionsService.canPrint(doc);
    if (!access.allowed) {
      documentAuditService.recordAccessDenied(doc, access.reason);
      toast.error(access.reason);
      return;
    }
    const { route, canPrint } = resolvePrintRoute(doc);
    if (canPrint && route) {
      documentAuditService.recordPrint(doc, 'ui');
      navigate(route);
    } else {
      toast.info('Print not available for this document type');
    }
  };

  const handleOpenRecord = (doc) => {
    const { route, canNavigate } = resolveSourceRoute(doc);
    if (canNavigate && route) navigate(route);
    else toast.info('Related record is unavailable for this document.');
  };

  const handleGenerate = async (doc) => {
    if (generatingId) return;
    setGeneratingId(doc.docId);
    try {
      await documentsService.generateDocument(doc.docId);
      documentAuditService.record(doc, 'GENERATED').catch(() => {});
      toast.success(`"${documentDisplayName(doc)}" generated.`);
      await load({ silent: true });
    } catch (err) {
      toast.error(err?.message || 'Document generation failed');
    } finally {
      setGeneratingId(null);
    }
  };

  /* ─── Delete (the repository's own soft delete) ─── */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const handleConfirmDelete = async () => {
    if (!pendingDelete || deletingId) return;
    const doc = pendingDelete;
    setDeletingId(doc.docId);
    try {
      await documentsService.deleteDocument(doc.docId);
      documentAuditService.record(doc, 'DELETED').catch(() => {});
      toast.success(`"${documentDisplayName(doc)}" deleted.`);
      setPendingDelete(null);
      await load({ silent: true });
    } catch (err) {
      toast.error(err?.message || 'Delete failed. The document was not deleted.');
    } finally {
      setDeletingId(null);
    }
  };

  /* ─── Upload ───
   * A file chosen inside a folder is filed into that folder's repository
   * category, using the same metadata the upload endpoint already accepts.
   * Inside Local Doc the upload carries the Local Doc marker, which is what
   * keeps it (and only it) in Local Doc → Other Documents. Everywhere else it
   * lands in that folder's ERP category. */
  const handleUploadFile = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0 || uploading) return;

    const target = folderById(folderId);
    const metadata = target?.localUpload
      ? { folder: 'OTHER', sourceModule: LOCAL_UPLOAD_MARKER }
      : target?.uploadFolder
        ? {
            folder: target.uploadFolder,
            docType: target.uploadDocType,
            sourceModule: target.uploadSourceModule
          }
        /* No folder open: like Sales Documents, the file is a local upload. */
        : { folder: 'OTHER', sourceModule: LOCAL_UPLOAD_MARKER };

    setUploading(true);
    let uploaded = 0;
    const rejected = [];
    try {
      for (const file of files) {
        const rejection = fileRejectionReason(file, UPLOAD_MAX_SIZE_MB);
        if (rejection) {
          rejected.push(rejection);
          continue;
        }
        try {
          await documentsService.uploadDocument(file, metadata);
          uploaded += 1;
        } catch (err) {
          rejected.push(err?.message || `"${file.name}" could not be uploaded.`);
        }
      }
    } finally {
      setUploading(false);
    }

    if (uploaded > 0) {
      toast.success(
        `${uploaded} file${uploaded === 1 ? '' : 's'} uploaded — `
        + `${target ? `filed under ${target.label}` : 'filed under Local Doc → Other Documents'}.`
      );
      await load({ silent: true });
    }
    if (rejected.length > 0) toast.error(rejected[0]);
  };

  /* ─── Cells ─── */
  const renderName = (doc) => {
    const tone = TYPE_TONES[detectType(doc.name, doc.sourceType || doc.fileType)] || TYPE_TONES.other;
    const FileIcon = tone.Icon;
    const name = documentDisplayName(doc);
    const status = documentStatus(doc);
    return (
      <div className="doc-cell-name">
        <div className="doc-file-icon" style={{ backgroundColor: tone.bg }}>
          <FileIcon size={16} style={{ color: tone.color }} />
        </div>
        <div className="doc-name-body">
          <span className="doc-name-text" title={name}>{name}</span>
          <div className="doc-name-sub">
            <span className={STATUS_BADGE_CLASS[status.toLowerCase()] || 'doc-badge doc-badge-gray'}>
              {status}
            </span>
            {Number(doc.version) > 1 && <span className="doc-name-sub-note">v{doc.version}</span>}
          </div>
        </div>
      </div>
    );
  };

  const renderActions = (doc) => {
    const items = [];
    if (isPendingGeneration(doc)) {
      items.push({ key: 'generate', label: 'Generate Document', icon: FileText });
    }
    if (resolvePrintRoute(doc).canPrint) {
      items.push({ key: 'print', label: 'Print', icon: Printer });
    }
    if (resolveSourceRoute(doc).canNavigate) {
      items.push({ key: 'record', label: 'Open source record', icon: ExternalLink });
    }
    const deleteAccess = documentPermissionsService.canDelete(doc);
    items.push({ divider: true });
    items.push({
      key: 'delete',
      label: 'Delete',
      icon: Trash2,
      danger: true,
      disabled: !deleteAccess.allowed,
      disabledReason: deleteAccess.reason || 'You do not have permission to delete this document'
    });

    return (
      <div className="doc-row-actions">
        <button
          type="button"
          className="doc-btn doc-btn-ghost doc-btn-sm"
          onClick={() => handlePreview(doc)}
          title="View / Preview"
        >
          <Eye size={13} /> Preview
        </button>
        <button
          type="button"
          className="doc-btn doc-btn-ghost doc-btn-sm"
          onClick={() => handleDownload(doc)}
          disabled={downloadingId === doc.docId}
          title="Download"
        >
          {downloadingId === doc.docId
            ? <Loader2 size={13} className="spinner" />
            : <Download size={13} />}
          Download
        </button>
        <ActionMenu
          items={items}
          onAction={(key) => {
            if (key === 'delete') setPendingDelete(doc);
            if (key === 'print') handlePrint(doc);
            if (key === 'generate') handleGenerate(doc);
            if (key === 'record') handleOpenRecord(doc);
          }}
          triggerClassName="doc-row-menu-btn"
          buttonLabel={`Actions for ${documentDisplayName(doc)}`}
        />
      </div>
    );
  };

  const activeFolderLabel = folderById(folderId)?.label || '';
  /* The ERP fallback folder stays out of the grid until it holds a file, so
     Inside ERP lists exactly the Purchase sub-modules. */
  const visibleChildren = children.filter(
    (folder) => folder.id !== ERP_FALLBACK_FOLDER_ID
      || folderDocuments(folder.id, grouped).length > 0
  );

  return (
    <PurchasePageLayout>
      <div className="doc-repo doc-purchase-repo">
        {/* ===== Page action row — the same top-right group Sales Documents
            renders (Refresh · Upload Document). ===== */}
        <div className="po-page-header doc-action-row">
          <div className="po-page-header-actions pr-page-header-actions">
            <button
              type="button"
              className="doc-btn doc-btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing || loading}
            >
              <RefreshCw size={13} className={refreshing ? 'spinner' : ''} /> Refresh
            </button>
            <input
              ref={uploadInputRef}
              type="file"
              multiple
              accept={ACCEPT_STRING}
              className="hidden"
              onChange={handleUploadFile}
              aria-label="Choose a file from this device"
            />
            <button
              type="button"
              className="doc-btn doc-btn-primary"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploading}
              title={`Upload from this computer — ${ALLOWED_EXT_KEYS.map((e) => e.toUpperCase()).join(', ')} up to ${UPLOAD_MAX_SIZE_MB} MB`}
            >
              {uploading
                ? <Loader2 size={13} className="spinner" />
                : <Upload size={13} />}
              {uploading ? 'Uploading…' : 'Upload Document'}
            </button>
          </div>
        </div>

        {/* ===== Documents container ===== */}
        <section className="doc-explorer" aria-label="Purchase document folders">
          <div className="doc-explorer-head">
            <div className="doc-explorer-title-wrap">
              <h2 className="doc-section-title">Documents</h2>
              <span className="doc-explorer-hint">
                Purchase documents organised by the module and sub-module that owns them
              </span>
            </div>
          </div>

          {/* Breadcrumb + back navigation. Every ancestor is a button, so a
              folder can be left from anywhere on the path. */}
          <nav className="doc-explorer-crumbs" aria-label="Folder path">
            <button
              type="button"
              className="doc-crumb-back"
              onClick={() => goToFolder(parentFolder)}
              disabled={folderId === null}
              title={folderId === null ? 'Already at Documents' : 'Back to the parent folder'}
            >
              <ArrowLeft size={13} /> Back
            </button>
            <div className="doc-crumb-trail">
              {trail.map((node, index) => {
                const isLast = index === trail.length - 1;
                return (
                  <span key={node.id || 'root'} className="doc-crumb-item">
                    {index > 0 && <ChevronRight size={12} className="doc-crumb-sep" aria-hidden="true" />}
                    {isLast ? (
                      <span className="doc-crumb-current" aria-current="page">{node.label}</span>
                    ) : (
                      <button
                        type="button"
                        className="doc-crumb-link"
                        onClick={() => goToFolder(node.id)}
                      >
                        {node.label}
                      </button>
                    )}
                  </span>
                );
              })}
            </div>
          </nav>

          {error ? (
            <div className="doc-empty" role="alert">
              <AlertTriangle size={36} className="doc-empty-icon" />
              <div className="doc-empty-title">Could not load documents</div>
              <div className="doc-empty-sub">{error}</div>
              <button type="button" className="doc-empty-action" onClick={() => load()}>
                <RefreshCw size={12} /> Retry
              </button>
            </div>
          ) : loading ? (
            <div className="doc-table-loading">
              <Loader2 size={22} className="spinner" style={{ color: '#0B4A3D' }} />
              <p>Loading documents…</p>
            </div>
          ) : (
            <>
              {/* Subfolders of the open folder. */}
              {visibleChildren.length > 0 && (
                <div className="doc-folder-grid">
                  {visibleChildren.map((folder) => {
                    const count = folderDocuments(folder.id, grouped).length;
                    const Icon = folderId === null ? FolderOpen : Folder;
                    return (
                      <button
                        key={folder.id}
                        type="button"
                        className="doc-folder-card"
                        onClick={() => goToFolder(folder.id)}
                        aria-label={`Open ${folder.label} — ${count} document${count === 1 ? '' : 's'}`}
                      >
                        <span className="doc-folder-card-icon"><Icon size={30} /></span>
                        <span className="doc-folder-card-body">
                          <span className="doc-folder-card-name">{folder.label}</span>
                          <span className="doc-folder-card-meta">
                            {count} document{count === 1 ? '' : 's'}
                          </span>
                        </span>
                        <ChevronRight size={14} className="doc-folder-card-arrow" aria-hidden="true" />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Search + filter, directly above the open folder's table. */}
              {folderId !== null && folderDocs.length > 0 && (
                <div className="doc-query">
                  <div className="doc-query-row">
                    <div className="doc-search-field">
                      <Search size={14} className="doc-search-icon" aria-hidden="true" />
                      <input
                        type="search"
                        className="doc-search-input"
                        value={query}
                        onChange={(event) => handleQueryChange(event.target.value)}
                        placeholder="Search documents by name, number, vendor, stage..."
                        aria-label="Search documents in this folder"
                      />
                      {query !== '' && (
                        <button
                          type="button"
                          className="doc-search-clear"
                          onClick={() => handleQueryChange('')}
                          title="Clear search"
                          aria-label="Clear search"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      className="doc-btn doc-btn-secondary"
                      onClick={() => setFiltersOpen((open) => !open)}
                      aria-expanded={filtersOpen}
                    >
                      <SlidersHorizontal size={13} /> Filter
                      {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                    </button>

                    {conditionsActive && (
                      <button
                        type="button"
                        className="doc-btn doc-btn-ghost"
                        onClick={handleClearConditions}
                      >
                        <X size={13} /> Clear all
                      </button>
                    )}

                    {conditionsActive && (
                      <span className="doc-query-count">
                        {filteredDocs.length} of {folderDocs.length} in this folder
                      </span>
                    )}
                  </div>

                  {filtersOpen && (
                    <div className="doc-filter-panel">
                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Document Type</span>
                        <select
                          className="doc-filter-control"
                          value={filters.type}
                          onChange={(event) => handleFilterField('type', event.target.value)}
                        >
                          <option value="">All types</option>
                          {typeOptions.map((type) => (
                            <option key={type} value={type}>{type}</option>
                          ))}
                        </select>
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Source Module</span>
                        <select
                          className="doc-filter-control"
                          value={filters.stage}
                          onChange={(event) => handleFilterField('stage', event.target.value)}
                        >
                          <option value="">All modules</option>
                          {stageOptions.map((stage) => (
                            <option key={stage} value={stage}>{stage}</option>
                          ))}
                        </select>
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Vendor</span>
                        <select
                          className="doc-filter-control"
                          value={filters.vendor}
                          onChange={(event) => handleFilterField('vendor', event.target.value)}
                        >
                          <option value="">All vendors</option>
                          {vendorOptions.map((vendor) => (
                            <option key={vendor} value={vendor}>{vendor}</option>
                          ))}
                        </select>
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Upload Date From</span>
                        <input
                          type="date"
                          className="doc-filter-control"
                          value={filters.from}
                          onChange={(event) => handleFilterField('from', event.target.value)}
                        />
                      </label>

                      <label className="doc-filter-field">
                        <span className="doc-filter-label">Upload Date To</span>
                        <input
                          type="date"
                          className="doc-filter-control"
                          value={filters.to}
                          onChange={(event) => handleFilterField('to', event.target.value)}
                        />
                      </label>
                    </div>
                  )}
                </div>
              )}

              {/* The open folder's own documents. Parent folders hold no files
                  of their own — only the subfolder cards above. */}
              {folderId !== null && (pageRows.length > 0 ? (
                <div className="doc-table-wrap">
                  <div className="doc-table-scroll">
                    <table className="doc-table">
                      <thead>
                        <tr>
                          <th>Document</th>
                          <th>Type</th>
                          <th>Doc no.</th>
                          <th>Source module</th>
                          <th>Vendor</th>
                          <th>Uploaded</th>
                          <th className="doc-align-center">Size</th>
                          <th className="doc-align-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pageRows.map((doc) => (
                          <tr key={doc.docId}>
                            <td>{renderName(doc)}</td>
                            <td>
                              <span className="doc-filetype">{documentTypeLabel(doc).toUpperCase()}</span>
                            </td>
                            <td>
                              <span className="doc-cell-text doc-cell-whitespace">{doc.docNo || '—'}</span>
                            </td>
                            <td>
                              <span className="doc-cell-text doc-cell-truncate" title={sourceModuleLabel(doc)}>
                                {sourceModuleLabel(doc) || '—'}
                              </span>
                            </td>
                            <td>
                              <span className="doc-cell-text doc-cell-truncate" title={doc.vendor || ''}>
                                {doc.vendor || '—'}
                              </span>
                            </td>
                            <td>
                              <span className="doc-cell-text doc-cell-whitespace doc-cell-gray">
                                {doc.uploadedAt ? formatDate(doc.uploadedAt) : '—'}
                              </span>
                            </td>
                            <td className="doc-align-center">
                              <span className="doc-cell-text doc-cell-tabular doc-cell-gray">
                                {doc.fileSize ? formatSize(doc.fileSize) : '—'}
                              </span>
                            </td>
                            <td className="doc-align-center">{renderActions(doc)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="doc-pagination">
                    <span className="doc-pagination-info">
                      Showing {rangeStart}–{rangeEnd} of {filteredDocs.length}
                    </span>
                    <div className="doc-pagination-btns">
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(0)}
                        disabled={safePage === 0}
                      >
                        First
                      </button>
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(Math.max(0, safePage - 1))}
                        disabled={safePage === 0}
                      >
                        Prev
                      </button>
                      <span className="doc-pagination-info">Page {safePage + 1} of {totalPages}</span>
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(Math.min(totalPages - 1, safePage + 1))}
                        disabled={safePage >= totalPages - 1}
                      >
                        Next
                      </button>
                      <button
                        type="button"
                        className="doc-page-btn"
                        onClick={() => setPage(totalPages - 1)}
                        disabled={safePage >= totalPages - 1}
                      >
                        Last
                      </button>
                    </div>
                  </div>
                </div>
              ) : folderDocs.length > 0 ? (
                /* The folder has documents, but none match the toolbar. */
                <div className="doc-empty" role="status">
                  <Search size={36} className="doc-empty-icon" />
                  <div className="doc-empty-title">No documents match your search or filters.</div>
                  <div className="doc-empty-sub">
                    Clear the search box and the filter panel to see all {folderDocs.length}{' '}
                    document{folderDocs.length === 1 ? '' : 's'} in this folder.
                  </div>
                  <button
                    type="button"
                    className="doc-empty-action"
                    onClick={handleClearConditions}
                  >
                    <X size={12} /> Clear search and filters
                  </button>
                </div>
              ) : (
                <div className="doc-empty">
                  <FileText size={36} className="doc-empty-icon" />
                  <div className="doc-empty-title">No documents in this folder</div>
                  <div className="doc-empty-sub">
                    {children.length > 0
                      ? 'Documents belong to the sub-folders above.'
                      : folderById(folderId)?.localUpload
                        ? 'Files you upload from this computer while this folder is open appear here.'
                        : `Documents appear here once a ${activeFolderLabel} record stores or uploads a file.`}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>

      {/* Delete confirmation — names the exact document. */}
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete document"
        variant="danger"
        icon={Trash2}
        confirmLabel={deletingId ? 'Deleting…' : 'Delete'}
        loading={Boolean(deletingId)}
        message={pendingDelete
          ? `"${documentDisplayName(pendingDelete)}" will be removed from the repository.\n\n`
            + 'Its stored file is kept and the document record is only marked as deleted.'
          : ''}
        onCancel={() => { if (!deletingId) setPendingDelete(null); }}
        onConfirm={handleConfirmDelete}
      />

      {/* Inline document preview — the module's shared viewer. */}
      <AttachmentPreview
        key={previewDoc?.docId || 'no-preview'}
        open={Boolean(previewDoc)}
        attachment={previewDoc ? {
          id: previewDoc.docId,
          name: previewDoc.name,
          size: previewDoc.fileSize,
          type: previewDoc.sourceType,
          dataUrl: previewDoc.sourceUrl,
          uploadedAt: previewDoc.uploadedAt,
          version: previewDoc.version
        } : null}
        onClose={() => setPreviewDoc(null)}
      />
    </PurchasePageLayout>
  );
}
