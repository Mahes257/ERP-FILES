/**
 * tests/sales-documents-inside-erp.test.js
 * ------------------------------------------------------------------
 * Sales → Documents → Upload Document → Inside ERP.
 *
 * "Inside ERP" files a document that ALREADY exists in the repository into the
 * active Sales context by REFERENCING its stored file. The point of the flow is
 * that nothing is uploaded twice, so the tests cover:
 *
 *   HELPERS   the query the dialog lists with (Sales scope + reusable rows), the
 *             eligibility rule mirrored from the server, the source label and
 *             the pager's wording
 *   CONTRACT  the dialog lists through the repository endpoint, the confirmed
 *             selection goes to the reference endpoint, and neither the dialog
 *             nor the service sends file bytes anywhere
 *
 * The Documents page no longer offers this as a step of its Upload Document
 * action (that action is the local-device picker, full stop), so the page's own
 * contract here is the absence of the dialog — while the component, the helper
 * module, the service call and the backend endpoint all stay in place for any
 * surface that mounts the dialog.
 *
 * Run: node --test tests/sales-documents-inside-erp.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  SELECTION_PAGE_SIZE,
  SELECTION_SCOPE,
  SELECTION_SORT,
  buildSelectionParams,
  filedFileKeys,
  isArchived,
  isFiledInContext,
  isSelectableDocument,
  selectionPage,
  selectionRange,
  sourceKind,
  storedFileKey
} from '../src/utils/documentSelection.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'src/pages/Documents.jsx';
const PICKER = 'src/components/DocumentSelection/InsideErpDocumentPicker.jsx';
const SERVICE = 'src/services/documentService.js';
const CONTROLLER =
  'erp-backend/src/main/java/com/vishatech/erp/controller/DocumentRepositoryController.java';
const BACKEND_SERVICE =
  'erp-backend/src/main/java/com/vishatech/erp/service/DocumentRepositoryService.java';

describe('Inside ERP · selection helpers', () => {
  it('shares the repository scope and the no-file sentinel with the app', () => {
    // The dialog must list the same dataset the Sales Documents page does…
    assert.match(read('src/utils/documentView.js'), /export const DOCUMENT_SCOPE = 'sales';/);
    assert.equal(SELECTION_SCOPE, 'sales');
    // …and treat a file-less record document exactly the way documentService does.
    assert.match(read(SERVICE), /hasStoredFile\(doc\) \{[\s\S]{0,160}'metadata-only'/);
  });

  it('queries the Sales scope and asks the backend for reusable rows only', () => {
    const params = buildSelectionParams({ page: 2, size: 25, search: '  INV-2026  ', module: 'Invoice' });
    assert.deepEqual(params, {
      page: 2,
      size: 25,
      sort: SELECTION_SORT,
      scope: 'sales',
      reusable: true,
      search: 'INV-2026',
      module: 'Invoice'
    });
  });

  it('omits empty search and module so the whole Sales repository is offered', () => {
    const params = buildSelectionParams();
    assert.equal(params.scope, 'sales');
    assert.equal(params.reusable, true);
    assert.equal(params.size, SELECTION_PAGE_SIZE);
    assert.equal(params.page, 0);
    assert.ok(!('search' in params));
    assert.ok(!('module' in params));
  });

  it('never lets a malformed page/size reach the query', () => {
    const params = buildSelectionParams({ page: -3, size: 0 });
    assert.equal(params.page, 0);
    assert.equal(params.size, SELECTION_PAGE_SIZE);
  });

  it('reads a Spring Page body, an ApiResponse envelope and an empty body alike', () => {
    assert.deepEqual(selectionPage({ content: [{ id: 1 }], totalElements: 1, totalPages: 1 }), {
      content: [{ id: 1 }],
      totalElements: 1,
      totalPages: 1
    });
    assert.deepEqual(
      selectionPage({ data: { content: [{ id: 2 }], totalElements: 2, totalPages: 1 } }).content,
      [{ id: 2 }]
    );
    assert.deepEqual(selectionPage(undefined), { content: [], totalElements: 0, totalPages: 0 });
    assert.deepEqual(selectionPage({ success: false }), { content: [], totalElements: 0, totalPages: 0 });
  });

  it('only allows documents that really have a stored file', () => {
    assert.equal(isSelectableDocument({ id: 1, status: 'uploaded', filePath: 'abc.pdf' }), true);
    assert.equal(isSelectableDocument({ id: 2, status: 'generated', filePath: '/files/abc.pdf' }), true);
    // a record document whose PDF was never generated
    assert.equal(isSelectableDocument({ id: 3, status: 'generated', filePath: 'metadata-only' }), false);
    assert.equal(isSelectableDocument({ id: 4, status: 'pending', filePath: null }), false);
    // soft-deleted rows are never selectable, whatever they carry
    assert.equal(isSelectableDocument({ id: 5, status: 'deleted', filePath: 'abc.pdf' }), false);
    assert.equal(isSelectableDocument(null), false);
  });

  it('labels an operator upload and a system-generated document apart', () => {
    assert.equal(sourceKind({ status: 'uploaded' }), 'uploaded');
    assert.equal(sourceKind({ status: 'generated' }), 'system');
    assert.equal(sourceKind({}), 'system');
  });

  it('describes the visible page from the real totals', () => {
    assert.equal(selectionRange({ page: 0, size: 10, total: 42 }).label, 'Showing 1-10 of 42');
    assert.equal(selectionRange({ page: 4, size: 10, total: 42 }).label, 'Showing 41-42 of 42');
    assert.equal(selectionRange({ page: 0, size: 10, total: 0 }).label, 'Showing 0 of 0');
  });

  it('identifies the stored FILE, never the file name', () => {
    // The same stored file reaches a row in four different spellings.
    const key = storedFileKey('abc123def.pdf');
    assert.equal(key, 'abc123def.pdf');
    assert.equal(storedFileKey('/files/abc123def.pdf'), key);
    assert.equal(storedFileKey('/v1/files/abc123def.pdf'), key);
    assert.equal(storedFileKey('http://localhost:8080/v1/files/abc123def.pdf'), key);
    assert.equal(storedFileKey('DRAWINGS/abc123def.pdf'), key);
    assert.equal(storedFileKey('http://host/files/abc123def.pdf?mode=inline'), key);
    // Two documents that merely share a NAME are two different files.
    assert.equal(storedFileKey('proposal.pdf'), 'proposal.pdf');
    assert.equal(storedFileKey('9f8e7d6c.pdf') === storedFileKey('proposal.pdf'), false);
    // Anything without a usable path has no key at all.
    assert.equal(storedFileKey(''), '');
    assert.equal(storedFileKey(null), '');
    assert.equal(storedFileKey('metadata-only'), 'metadata-only');
  });

  it('flags the archived state', () => {
    assert.equal(isArchived({ status: 'archived' }), true);
    assert.equal(isArchived({ status: 'ARCHIVED' }), true);
    assert.equal(isArchived({ status: 'generated' }), false);
    assert.equal(isArchived({}), false);
  });

  it('collects only the ACTIVE stored files of the target context', () => {
    const keys = filedFileKeys([
      { id: 1, status: 'uploaded', filePath: 'a.pdf' },
      { id: 2, status: 'generated', filePath: 'http://host/v1/files/b.pdf' },
      // archived: hidden from the active list, so it does not block a re-file
      { id: 3, status: 'archived', filePath: 'c.pdf' },
      // nothing to reuse
      { id: 4, status: 'pending', filePath: 'metadata-only' },
      // in the trash
      { id: 5, status: 'deleted', filePath: 'e.pdf' }
    ]);
    assert.equal(keys.size, 2);
    assert.equal(keys.has('a.pdf'), true);
    assert.equal(keys.has('b.pdf'), true);
    assert.equal(keys.has('c.pdf'), false);
    assert.equal(filedFileKeys(undefined).size, 0);
  });

  it('marks a candidate the target context already holds', () => {
    const keys = filedFileKeys([{ id: 1, status: 'uploaded', filePath: 'a.pdf' }]);
    assert.equal(isFiledInContext({ id: 9, filePath: '/files/a.pdf' }, keys), true);
    // same name, different stored file → not filed
    assert.equal(isFiledInContext({ id: 9, filePath: 'other.pdf' }, new Set(['a.pdf'])), false);
    assert.equal(isFiledInContext(null, keys), false);
    assert.equal(isFiledInContext({ filePath: 'a.pdf' }, null), false);
  });
});

describe('Inside ERP · wiring contract', () => {
  it('is no longer offered as a step in front of Upload Document', () => {
    // The page asks ONE thing now: pick a file from this computer. The two-option
    // source-selection dialog (Local Device / Inside ERP) is gone from the flow,
    // so the page mounts neither the dialog's buttons nor the picker itself.
    const page = read(PAGE);
    assert.doesNotMatch(page, /Where does the document come from\?/);
    assert.doesNotMatch(page, /handleChooseLocalDevice|handleChooseInsideErp/);
    assert.doesNotMatch(page, /Local Device/);
    assert.doesNotMatch(page, /import InsideErpDocumentPicker/);
    assert.doesNotMatch(page, /<InsideErpDocumentPicker/);
    assert.doesNotMatch(page, /SALES_REPOSITORY_CATEGORIES|STANDALONE_UPLOAD_MODULE/);
    assert.doesNotMatch(page, /referenceExisting/);
    // …and the action it replaced goes straight to the native picker
    assert.match(page, /const handleUploadDocument = \(\) => \{\s*if \(uploading\) return;\s*uploadInputRef\.current\?\.click\(\);\s*\};/);
    // the old "Unavailable" placeholder stays gone
    assert.doesNotMatch(page, /Inside ERP[\s\S]{0,200}Unavailable/);
  });

  it('keeps the dialog component itself usable by any surface that mounts it', () => {
    // The picker is untouched: same props, same Sales context contract, and a
    // Back path to whatever opened it.
    const picker = read(PICKER);
    assert.match(picker, /export default function InsideErpDocumentPicker\(\{/);
    assert.match(picker, /onClose,/);
    assert.match(picker, /onBack,/);
    assert.match(picker, /categories = \[\],/);
    assert.match(picker, /targetModule,/);
    assert.match(picker, /targetLabel,/);
    assert.match(picker, /onSubmit/);
  });

  it('keeps the reference endpoint and its service call available, unused by the page', () => {
    const page = read(PAGE);
    const service = read(SERVICE);
    // the page renders no listing, so it must not re-read one after filing
    assert.doesNotMatch(page, /documentService\.list\(/);
    assert.doesNotMatch(page, /await handleRefresh\(\)/);
    // the service call the dialog's host used is still there for that host
    assert.match(service, /async referenceExisting\(id, \{ module \} = \{\}\)[\s\S]{0,400}suppressGlobalError: true/);
  });

  it('shows what is already filed and refuses to file it twice', () => {
    const picker = read(PICKER);
    // the target context is read with the page's own listing (scope + module,
    // no status filter) so the badge describes the real active documents
    assert.match(picker, /documentService\.listForSelection\(\{[\s\S]{0,220}scope: SELECTION_SCOPE[\s\S]{0,120}module: targetModule/);
    assert.match(picker, /filedFileKeys\(selectionPage\(result\)\.content\)/);
    assert.match(picker, /isFiledInContext\(doc, filedKeys\)/);
    assert.match(picker, /isArchived\(doc\)/);
    // an already-filed row cannot be selected, and confirming is blocked too
    assert.match(picker, /disabled=\{filed\}/);
    assert.match(picker, /if \(!selectedDoc \|\| submitting\) return;/);
    assert.match(picker, /disabled=\{!selectedDoc \|\| submitting\}/);
    // a selection the context turns out to already hold is never acted on: the
    // dialog derives the effective selection instead of syncing it back into
    // state, so the row, the footer and the confirm button all drop it
    assert.match(picker,
      /const selectedDoc = selected && !isFiledInContext\(selected, filedKeys\) \? selected : null;/);
  });

  it('lists through the repository endpoint and never uploads a file from the dialog', () => {
    const picker = read(PICKER);
    assert.match(picker, /documentService\.listForSelection\(/);
    assert.match(picker, /buildSelectionParams\(/);
    // search, category filter, pager and the confirm action are present
    assert.match(picker, /use This Document|Use This Document/);
    assert.match(picker, /aria-label="Search documents in the ERP"/);
    assert.match(picker, /All Sales documents/);
    assert.match(picker, /doc-pagination/);
    // the dialog must not touch file bytes at all
    assert.doesNotMatch(picker, /FormData/);
    assert.doesNotMatch(picker, /type="file"/);
    assert.doesNotMatch(picker, /api\.(post|put)/);
  });

  it('keeps a failed lookup and a failed reference inside the dialog', () => {
    const picker = read(PICKER);
    const service = read(SERVICE);
    // the dialog renders both failures itself, so the shared interceptor must
    // not also replace the Documents page with the global error page
    assert.match(picker, /doc-picker-alert/);
    assert.match(picker, /Retry/);
    assert.match(service, /async listForSelection\(params = \{\}\)[\s\S]{0,300}suppressGlobalError: true/);
    assert.match(service, /async referenceExisting\(id, \{ module \} = \{\}\)[\s\S]{0,400}suppressGlobalError: true/);
  });

  it('exposes the reference endpoint under the repository create authority', () => {
    const controller = read(CONTROLLER);
    assert.match(controller, /@PostMapping\("\/\{id\}\/reference"\)/);
    assert.match(
      controller,
      /@PreAuthorize\("hasAuthority\('DOCUMENT_CREATE'\)"\)\s*@PostMapping\("\/\{id\}\/reference"\)/
    );
    // the listing gained the reusable filter the dialog relies on
    assert.match(controller, /@RequestParam\(required = false, defaultValue = "false"\) boolean reusable/);
  });

  it('reuses the stored file instead of storing it again, and refuses the trash', () => {
    const service = read(BACKEND_SERVICE);
    const method = service.slice(service.indexOf('public DocumentRepositoryResponse referenceExisting'));
    const body = method.slice(0, 4000);
    // the reference points at the SOURCE's stored file...
    assert.match(body, /entry\.setFilePath\(source\.getFilePath\(\)\)/);
    // ...and never stores file bytes again
    assert.doesNotMatch(body, /fileStorageService\.store/);
    assert.doesNotMatch(body, /MultipartFile/);
    // access scope is copied, never widened, and the trash is refused
    assert.match(body, /entry\.setVisibility\(source\.getVisibility\(\)/);
    assert.match(body, /"deleted"\.equalsIgnoreCase\(source\.getStatus\(\)\)/);
    // the source row is only read
    assert.doesNotMatch(body, /source\.set/);
  });
});
