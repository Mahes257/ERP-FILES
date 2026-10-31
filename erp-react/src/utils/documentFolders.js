/**
 * Sales Documents folder explorer — the folder model.
 *
 * The repository stores each document's origin in its own `module` column, and
 * the column carries the spelling the writing flow used ("Lead" and "Leads",
 * "CPR Technical Verification" and "cprtechnicalverification", "Sales Contract"
 * and "salesContract", …). A folder therefore owns a SET of normalized module
 * spellings instead of one string, so a document can never land in the wrong
 * folder (or disappear) just because its writer used a different case, plural,
 * space or hyphen.
 *
 * The hierarchy is the Documents page's own, fixed by this file:
 *
 *   Documents
 *   ├── Inside ERP
 *   │   └── Sales
 *   │       ├── CRM
 *   │       │   ├── Leads
 *   │       │   ├── Clients
 *   │       │   ├── Contacts
 *   │       │   └── Follow-ups
 *   │       ├── CPR
 *   │       │   ├── CPR
 *   │       │   ├── CPR Technical Verification
 *   │       │   ├── Cost Workout
 *   │       │   ├── Profit Workout
 *   │       │   └── CPR Reports
 *   │       └── Sales Execution
 *   │           ├── Quotations
 *   │           ├── Sales Contracts
 *   │           ├── Customer Purchase Orders
 *   │           ├── Proforma Invoices
 *   │           ├── Delivery Challans
 *   │           ├── Invoices
 *   │           ├── Credit Notes
 *   │           └── Payment Receipts
 *   └── Local Doc
 *
 * `Inside ERP` holds the documents that belong to an ERP module — `Sales` sits
 * inside it (never directly under Documents) and every CRM, CPR and Sales
 * Execution folder keeps its place beneath Sales.
 *
 * `Local Doc` is its sibling: a file picked from the operator's own computer and
 * uploaded straight from the Documents page, with no ERP record behind it. The
 * two are separated by the row's own `module` value, which is the repository's
 * existing upload-source marker: an ERP document is written under its module
 * ("Sales Contract", "CPR", …) by the flow that owns it, while a local upload is
 * written under {@link LOCAL_UPLOAD_MODULE} — a spelling no ERP flow writes — so
 * the repository's own `scope=sales` filter keeps the two sets apart and neither
 * can appear in the other's folder.
 *
 * Grouping never consults the source record: a document is placed by its own
 * metadata only, so a stored file stays listed in its folder even when the
 * Lead/Client/CPR/Contract it came from no longer exists.
 *
 * The hierarchy itself is data: {@link createFolderModel} turns a folder list
 * into the lookup, breadcrumb, placement and counting helpers the explorer
 * needs, and {@link SALES_FOLDERS} is bound to one such model. Another ERP area
 * that opens the same explorer (Production → Documents) supplies its own folder
 * list to the same factory instead of a second copy of these rules.
 *
 * Deliberately import-free so it can be unit tested in plain Node.
 */

/** Breadcrumb root — not a folder, the page itself. */
export const DOCUMENTS_ROOT = { id: null, label: 'Documents' };

/**
 * The `module` value a document uploaded from the local computer is filed
 * under. It is the upload-source marker the whole Local Doc split rests on: no
 * ERP flow writes this spelling, and the backend's `scope=sales` listing does
 * not cover it, so a local upload can never be mistaken for — or leak into —
 * the Inside ERP tree.
 */
export const LOCAL_UPLOAD_MODULE = 'Local Doc';

/** The folder that owns that marker, for callers that need to name it. */
export const LOCAL_DOC_FOLDER_ID = 'localdoc';

/**
 * Folders, in display order. `modules` are the NORMALIZED spellings the folder
 * owns; the parent folders (CRM / CPR / Sales Execution) also collect their
 * descendants' documents for the count an explorer card shows.
 */
export const SALES_FOLDERS = [
  // The repository root. It owns no module spelling, so nothing is ever filed
  // here: it exists to hold the areas the repository serves.
  { id: 'insideerp', label: 'Inside ERP', parent: null, modules: [] },

  // The second root: the operator's own uploads. It owns the LOCAL_UPLOAD_MODULE
  // spelling, which is what places a locally uploaded file here and nowhere else.
  {
    id: LOCAL_DOC_FOLDER_ID,
    label: 'Local Doc',
    parent: null,
    modules: ['localdoc']
  },

  { id: 'sales', label: 'Sales', parent: 'insideerp', modules: ['sales'] },

  /* ─── CRM (unchanged) ─── */
  // "CRM" is also a real legacy module value the reconciler writes, so the
  // parent folder owns it and lists those documents itself.
  { id: 'sales/crm', label: 'CRM', parent: 'sales', modules: ['crm'] },
  { id: 'sales/crm/leads', label: 'Leads', parent: 'sales/crm', modules: ['lead', 'leads'] },
  {
    id: 'sales/crm/clients',
    label: 'Clients',
    parent: 'sales/crm',
    modules: ['client', 'clients', 'customer', 'customers']
  },
  // The repository has no Contacts module of its own today: a contact's file is
  // uploaded against its lead/client, so this folder lists the documents that
  // are explicitly filed under a contacts module if any ever exist — it never
  // hides a document, because anything unmatched falls back to a parent folder.
  { id: 'sales/crm/contacts', label: 'Contacts', parent: 'sales/crm', modules: ['contact', 'contacts'] },
  {
    id: 'sales/crm/followups',
    label: 'Follow-ups',
    parent: 'sales/crm',
    modules: ['followup', 'followups']
  },

  /* ─── CPR and its commercial companions ─── */
  { id: 'sales/cpr', label: 'CPR', parent: 'sales', modules: [] },
  { id: 'sales/cpr/cpr', label: 'CPR', parent: 'sales/cpr', modules: ['cpr'] },
  {
    id: 'sales/cpr/technical',
    label: 'CPR Technical Verification',
    parent: 'sales/cpr',
    modules: ['cprtechnicalverification']
  },
  { id: 'sales/cpr/costworkout', label: 'Cost Workout', parent: 'sales/cpr', modules: ['costworkout'] },
  { id: 'sales/cpr/profitworkout', label: 'Profit Workout', parent: 'sales/cpr', modules: ['profitworkout'] },
  // No writer files a document under a CPR-report module yet (the backend's
  // Sales scope has no such spelling); the folder exists so report documents
  // have a home as soon as one does, and never loses a file meanwhile.
  {
    id: 'sales/cpr/reports',
    label: 'CPR Reports',
    parent: 'sales/cpr',
    modules: ['cprreport', 'cprreports']
  },

  /* ─── Sales Execution ─── */
  { id: 'sales/execution', label: 'Sales Execution', parent: 'sales', modules: [] },
  {
    id: 'sales/execution/quotations',
    label: 'Quotations',
    parent: 'sales/execution',
    modules: ['quotation']
  },
  {
    id: 'sales/execution/contracts',
    label: 'Sales Contracts',
    parent: 'sales/execution',
    modules: ['salescontract']
  },
  {
    id: 'sales/execution/cpo',
    label: 'Customer Purchase Orders',
    parent: 'sales/execution',
    // "Sales Order" is this ERP's own spelling of a customer purchase order
    // (see utils/documentView.js, where both route to /sales-orders/{id}).
    modules: ['customerpurchaseorder', 'salesorder']
  },
  {
    id: 'sales/execution/proforma',
    label: 'Proforma Invoices',
    parent: 'sales/execution',
    modules: ['proformainvoice']
  },
  {
    id: 'sales/execution/challans',
    label: 'Delivery Challans',
    parent: 'sales/execution',
    modules: ['deliverychallan']
  },
  { id: 'sales/execution/invoices', label: 'Invoices', parent: 'sales/execution', modules: ['invoice'] },
  {
    id: 'sales/execution/creditnotes',
    label: 'Credit Notes',
    parent: 'sales/execution',
    modules: ['creditnote']
  },
  {
    id: 'sales/execution/receipts',
    label: 'Payment Receipts',
    parent: 'sales/execution',
    modules: ['paymentreceipt']
  }
];

/** Canonical module key: 'Sales Contract' === 'salesContract' === 'sales contract'. */
export function normalizeModule(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * The module spellings that do NOT identify a Sales sub-module on their own: a
 * document uploaded straight from the Documents page is filed under the bare
 * Sales module, so its own `documentType` (and, failing that, its record number
 * prefix) decides which subfolder it belongs to. Both are real repository
 * metadata — a document filed as "Sales" whose own type is "Cost Workout" is a
 * Cost Workout document, and leaving it in the parent folder would hide it from
 * the folder a user opens.
 */
const GENERIC_MODULE_KEYS = new Set(['', 'sales']);

/**
 * `documentType` spelling → folder id, normalized the same way as a module.
 * A document type usually repeats its module ("CPR", "Cost Workout", "Sales
 * Contract"), so this mirrors the module map and adds the report spellings.
 * File-kind types ("pdf", "document", "csv", …) deliberately map to nothing.
 */
const FOLDER_BY_DOCUMENT_TYPE = new Map([
  // CRM
  ['lead', 'sales/crm/leads'],
  ['leads', 'sales/crm/leads'],
  ['client', 'sales/crm/clients'],
  ['clients', 'sales/crm/clients'],
  ['customer', 'sales/crm/clients'],
  ['contact', 'sales/crm/contacts'],
  ['contacts', 'sales/crm/contacts'],
  ['followup', 'sales/crm/followups'],
  ['followups', 'sales/crm/followups'],
  // CPR family
  ['cpr', 'sales/cpr/cpr'],
  ['cprtechnicalverification', 'sales/cpr/technical'],
  ['costworkout', 'sales/cpr/costworkout'],
  ['profitworkout', 'sales/cpr/profitworkout'],
  ['cprreport', 'sales/cpr/reports'],
  ['cprreports', 'sales/cpr/reports'],
  // Sales Execution
  ['quotation', 'sales/execution/quotations'],
  ['salescontract', 'sales/execution/contracts'],
  ['salesorder', 'sales/execution/cpo'],
  ['customerpurchaseorder', 'sales/execution/cpo'],
  ['proformainvoice', 'sales/execution/proforma'],
  ['deliverychallan', 'sales/execution/challans'],
  ['invoice', 'sales/execution/invoices'],
  ['creditnote', 'sales/execution/creditnotes'],
  ['paymentreceipt', 'sales/execution/receipts']
]);

/**
 * Record-number prefix → folder id, used only when both the module and the
 * document type leave the document generic. Every prefix here is the one the
 * backend service actually generates ("CPR-%d-%06d", "TV-%d-%04d",
 * "QTN-%d-%06d", "SC-…", "SO-…", "CPO-…", "PI-…", "DC-…", "INV-…", "CN-…").
 * "PR-" is deliberately absent: seven services reuse it, so it does not
 * identify a single subfolder and such a row stays in the parent folder.
 */
const FOLDER_BY_RECORD_PREFIX = new Map([
  ['cpr', 'sales/cpr/cpr'],
  ['tv', 'sales/cpr/technical'],
  ['cw', 'sales/cpr/costworkout'],
  ['pw', 'sales/cpr/profitworkout'],
  ['qtn', 'sales/execution/quotations'],
  ['qt', 'sales/execution/quotations'],
  ['sc', 'sales/execution/contracts'],
  ['so', 'sales/execution/cpo'],
  ['cpo', 'sales/execution/cpo'],
  ['pi', 'sales/execution/proforma'],
  ['dc', 'sales/execution/challans'],
  ['inv', 'sales/execution/invoices'],
  ['cn', 'sales/execution/creditnotes']
]);

/**
 * Turn one folder hierarchy into a folder model.
 *
 * A model owns every rule that turns a flat document listing into folders —
 * lookup, children, the breadcrumb (and therefore the Back target), the
 * placement rule and the counts an explorer card shows — so the explorer page
 * can be rendered over ANY area's hierarchy without a second implementation of
 * those rules.
 *
 * @param folders          the hierarchy ({ id, label, parent, modules })
 * @param typeFolders      optional documentType key → folder id, consulted when
 *                         the module leaves the document generic
 * @param prefixFolders    optional record-number prefix key → folder id, the
 *                         last refinement for a generic document
 * @param fallbackFolderId the folder that keeps a document none of the above
 *                         identify, so no row is ever dropped from the listing
 */
export function createFolderModel(folders, {
  typeFolders = new Map(),
  prefixFolders = new Map(),
  fallbackFolderId = null
} = {}) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));

  /** Module key → folder id, built once from the folder definitions. */
  const byModule = new Map();
  for (const folder of folders) {
    for (const module of folder.modules) {
      byModule.set(module, folder.id);
    }
  }

  function folderById(id) {
    return byId.get(id) || null;
  }

  /** True when `id` addresses a real folder (null is the Documents root). */
  function isFolderId(id) {
    return id === null || byId.has(id);
  }

  /** Direct children of a folder (or of the Documents root when `id` is null). */
  function folderChildren(id) {
    return folders.filter((folder) => folder.parent === id);
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

  /**
   * The folder a document belongs to, from the document's own metadata only:
   * its `module` first, then its `documentType`, then its record-number
   * prefix. A document is placed exactly once, so every row has one home.
   */
  function folderIdForDocument(doc) {
    const key = normalizeModule(doc?.module);
    if (key && !GENERIC_MODULE_KEYS.has(key)) {
      const mapped = byModule.get(key);
      if (mapped) return mapped;
    }

    const typeFolder = typeFolders.get(normalizeModule(doc?.documentType));
    if (typeFolder) return typeFolder;

    const prefixKey = normalizeModule(String(doc?.recordNumber || '').split('-')[0]);
    return prefixFolders.get(prefixKey) || fallbackFolderId;
  }

  /**
   * Group documents by folder. Every document is placed exactly once, so the sum
   * of the folders' own counts always equals the number of documents shown.
   */
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

  /** Descendant folder ids of `id`, inclusive (null = every folder). */
  function folderSubtree(id) {
    if (id === null || id === undefined) return folders.map((folder) => folder.id);
    return [id, ...descendantsOf(id)];
  }

  /** A folder's own documents (its own module spellings only). */
  function ownDocuments(id, byFolder) {
    return byFolder[id] || [];
  }

  /** Every document at or below a folder — the number an explorer card shows. */
  function folderDocuments(id, byFolder) {
    return folderSubtree(id).flatMap((folderId) => byFolder[folderId] || []);
  }

  /** Documents rendered inside a folder: its own files, then its subfolders. */
  function documentsInFolder(id, byFolder) {
    return id === null ? [] : ownDocuments(id, byFolder);
  }

  return {
    folderById,
    isFolderId,
    folderChildren,
    folderTrail,
    folderIdForDocument,
    groupByFolder,
    folderSubtree,
    ownDocuments,
    folderDocuments,
    documentsInFolder
  };
}

/**
 * The Sales folder model — the hierarchy above, with the document-type and
 * record-prefix refinements a standalone Sales upload relies on. A document none
 * of those identify is NOT dropped: it is shown in the Sales folder, which is
 * the one place a Sales-scoped document is always visible.
 */
const SALES_MODEL = createFolderModel(SALES_FOLDERS, {
  typeFolders: FOLDER_BY_DOCUMENT_TYPE,
  prefixFolders: FOLDER_BY_RECORD_PREFIX,
  fallbackFolderId: 'sales'
});

/* The Sales bindings every existing caller already imports — unchanged. */
export const folderById = SALES_MODEL.folderById;
export const isFolderId = SALES_MODEL.isFolderId;
export const folderChildren = SALES_MODEL.folderChildren;
export const folderTrail = SALES_MODEL.folderTrail;
export const folderIdForDocument = SALES_MODEL.folderIdForDocument;
export const groupByFolder = SALES_MODEL.groupByFolder;
export const folderSubtree = SALES_MODEL.folderSubtree;
export const ownDocuments = SALES_MODEL.ownDocuments;
export const folderDocuments = SALES_MODEL.folderDocuments;
export const documentsInFolder = SALES_MODEL.documentsInFolder;
