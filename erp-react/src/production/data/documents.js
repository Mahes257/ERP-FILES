/**
 * production/data/documents.js
 * ------------------------------------------------------------------
 * Production → Documents — the Production explorer profile.
 *
 * The screen itself is the EXISTING Sales Documents explorer
 * (pages/Documents.jsx): the Production route mounts that same component with
 * the profile below, so the whole experience — page actions (Refresh · Upload
 * Document), the breadcrumb and Back, the folder cards with their counts, the
 * search + filter toolbar, the document table with its Preview / Download /
 * Record / Delete actions, pagination, the loading / empty / error states and
 * the responsive rules — is the one already in use, not a second design.
 *
 * FOLDERS — the Production module's own sections, nested under Inside ERP the
 * same way the Sales tree nests CRM / CPR / Sales Execution:
 *
 *   Documents
 *   ├── Inside ERP
 *   │   └── Production
 *   │       ├── Production Orders
 *   │       ├── Technical Verification
 *   │       ├── Drawings
 *   │       ├── Models
 *   │       ├── Quality
 *   │       ├── Packing
 *   │       ├── Dispatch
 *   │       └── Production Tracker
 *   └── Local Doc
 *
 * DATA — the SHARED document repository, read through the EXISTING listing
 * (`GET /documents`, the same `documentService.listForSelection` the Sales page
 * uses) with the repository's EXISTING `module` filter. The repository tells its
 * areas apart by each row's own `module` value, and every Production flow
 * already writes its own spelling there, so Production's documents are the rows
 * filed under those spellings — the same mechanism the Sales page uses to read
 * its own area, and nothing else is invented.
 *
 * The backend has no `scope=production`: `GET /documents?scope=` accepts
 * `sales` (the Sales area's spellings) and `all`, and rejects anything else. The
 * `module` filter is therefore the supported way to read one area's rows, which
 * is why the profile issues one filtered read per Production module spelling
 * instead of asking for a scope the server does not implement.
 *
 * Local Doc keeps its existing meaning on this page: a file uploaded from this
 * screen is filed under the same upload-source marker the Sales page writes, so
 * it lands in Local Doc on both — the two areas share one Local Doc folder,
 * exactly as the repository does, and Production's Inside ERP tree never
 * contains a Sales document.
 * ------------------------------------------------------------------
 */
import documentService from '../../services/documentService';
import { isActiveDocument, moduleKey } from '../../utils/documentView';
import {
  LOCAL_DOC_FOLDER_ID,
  LOCAL_UPLOAD_MODULE,
  createFolderModel
} from '../../utils/documentFolders';

/* ------------------------------------------------------------------
 * Repository read
 * ------------------------------------------------------------------ */

/** Repository page size used while reading, and the page cap per module. */
const FETCH_PAGE_SIZE = 200;
const FETCH_MAX_PAGES = 25;

/**
 * Every `module` spelling a Production flow writes to the shared repository.
 *
 * The list mirrors the backend's own Production module names — the reconciliation
 * specs ("Production Order", "Work Order", "Production Tracker", "QC", "Packing
 * List", "Dispatch", "Drawing", "Model") and the PDF generator's Production keys
 * ("production tracker", "packing list", "qc" / "quality inspection") — plus the
 * "Technical Verification" spelling the Production integration writes. Read
 * case-insensitively by the listing, so a legacy spelling of the same name is
 * covered too.
 */
export const PRODUCTION_DOCUMENT_MODULES = [
  'Production Order',
  'Work Order',
  'Technical Verification',
  'Production Tracker',
  'QC',
  'Quality Inspection',
  'Packing List',
  'Dispatch',
  'Drawing',
  'Model'
];

/** The `filePath` value the backend writes for a document with no stored file. */
const RECORD_MIRROR_FILE_PATH = 'metadata-only';

/**
 * True only for a row that stands for a file somebody actually uploaded.
 *
 * The repository holds two very different kinds of row:
 *
 *  - a document created by an UPLOAD — the user's Production attachment copy
 *    (ProductionDocumentArchive), the CAD file registered when a drawing/model
 *    was saved, or a file picked on this page. It carries a real stored file and
 *    a document type inferred from the file name;
 *  - a RECORD-LEVEL mirror created by the backend's document sync for a
 *    business record: no file at all (`filePath = 'metadata-only'`) and the
 *    module name as its document type (see
 *    `DocumentRepositoryService.isRecordDocument` / `ensureRecordDocument`).
 *
 * A mirror is not an uploaded document — there are no bytes to preview or
 * download — so the Production folders must never present one as a file. The
 * `documentType === module` test is the same identity the backend itself uses to
 * recognise a record document, and no upload ever produces it: an upload's type
 * is `pdf` / `image` / `word` / `document`, never the module spelling.
 *
 * Rows that fail this test are only left out of the list; nothing is deleted.
 */
export function isUploadedFileDocument(doc) {
  const filePath = String(doc?.filePath || '').trim();
  if (!filePath || filePath === RECORD_MIRROR_FILE_PATH) return false;
  return moduleKey(doc?.documentType) !== moduleKey(doc?.module);
}

/**
 * Read one module's rows to exhaustion, page by page — the same listing the
 * Sales page reads (same endpoint, same filters, same permissions), with the
 * module filter pushed into SQL by the backend.
 */
async function readModule(module) {
  const documents = [];
  for (let page = 0; page < FETCH_MAX_PAGES; page += 1) {
    const result = await documentService.listForSelection({
      module,
      page,
      size: FETCH_PAGE_SIZE,
      sort: 'createdAt:desc'
    });
    const rows = Array.isArray(result) ? result : (result?.content || []);
    documents.push(...rows);
    const noMore = result?.last === true
      || rows.length < FETCH_PAGE_SIZE
      || (Number.isFinite(result?.totalPages) && page + 1 >= result.totalPages);
    if (noMore) return { documents, truncated: false };
  }
  return { documents, truncated: true };
}

/**
 * The Production page's data: the Production modules' documents plus the Local
 * Doc uploads, from the shared repository.
 *
 * The `module`-filtered listing is unscoped, so — exactly like the Sales page's
 * Local Doc read — it also returns the repository's terminal rows (archived /
 * in the trash) and the backend's own active-row rule is applied to that set
 * here, so a document deleted from this page leaves the list by its own status.
 * Rows are de-duplicated by id, so a row can never be counted twice even if two
 * module spellings ever resolve to the same document.
 */
export async function loadProductionDocuments() {
  const [modulePages, localPage] = await Promise.all([
    Promise.all(PRODUCTION_DOCUMENT_MODULES.map((module) => readModule(module))),
    readModule(LOCAL_UPLOAD_MODULE)
  ]);

  const seen = new Set();
  const documents = [];
  const collect = (rows) => {
    for (const doc of rows) {
      if (!isActiveDocument(doc)) continue;
      // Only rows backed by a real stored file: a record-level mirror has no
      // bytes, so it is not a document in this explorer's folders.
      if (!isUploadedFileDocument(doc)) continue;
      const key = doc?.id ?? `${doc?.documentName}|${doc?.createdAt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      documents.push(doc);
    }
  };
  modulePages.forEach((page) => collect(page.documents));
  collect(localPage.documents);

  return {
    documents,
    truncated: modulePages.some((page) => page.truncated) || localPage.truncated
  };
}

/* ------------------------------------------------------------------
 * Folder hierarchy
 * ------------------------------------------------------------------ */

/**
 * Production's folders, in display order, over the SAME shape the Sales tree
 * uses: the two roots (Inside ERP + Local Doc), the area itself, then the
 * module's own sections. `modules` are the NORMALIZED spellings the folder owns
 * — the repository's own `module` values, so a row is placed by its own
 * metadata and never by a lookup of the record behind it.
 */
export const PRODUCTION_FOLDERS = [
  // The repository root. It owns no module spelling, so nothing is ever filed
  // here: it exists to hold the areas the repository serves.
  { id: 'insideerp', label: 'Inside ERP', parent: null, modules: [] },

  // The second root: the operator's own uploads, the same shared Local Doc
  // folder the Sales page shows (and the same upload-source marker).
  {
    id: LOCAL_DOC_FOLDER_ID,
    label: 'Local Doc',
    parent: null,
    modules: ['localdoc']
  },

  { id: 'production', label: 'Production', parent: 'insideerp', modules: [] },

  { id: 'production/orders', label: 'Production Orders', parent: 'production', modules: ['productionorder'] },
  {
    id: 'production/technical',
    label: 'Technical Verification',
    parent: 'production',
    // "Work Order" is the same verification record written under the other
    // spelling the backend uses, so both land in this one folder.
    modules: ['workorder', 'technicalverification']
  },
  { id: 'production/drawings', label: 'Drawings', parent: 'production', modules: ['drawing'] },
  { id: 'production/models', label: 'Models', parent: 'production', modules: ['model'] },
  { id: 'production/quality', label: 'Quality', parent: 'production', modules: ['qc', 'qualityinspection'] },
  { id: 'production/packing', label: 'Packing', parent: 'production', modules: ['packinglist'] },
  { id: 'production/dispatch', label: 'Dispatch', parent: 'production', modules: ['dispatch'] },
  { id: 'production/tracker', label: 'Production Tracker', parent: 'production', modules: ['productiontracker'] }
];

/**
 * The Production folder model, built by the same factory the Sales hierarchy
 * uses. No document-type/record-prefix refinement is needed here: every row the
 * loader reads already carries one of Production's own module spellings, so the
 * module is what places it. The Production folder keeps anything the module
 * does not name, so a row can never vanish from the explorer.
 */
const PRODUCTION_MODEL = createFolderModel(PRODUCTION_FOLDERS, {
  fallbackFolderId: 'production'
});

/** The profile Production → Documents mounts pages/Documents.jsx with. */
export const PRODUCTION_EXPLORER = {
  load: loadProductionDocuments,
  fallbackFolderLabel: 'Production',
  ...PRODUCTION_MODEL
};
