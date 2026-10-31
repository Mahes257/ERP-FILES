/**
 * tests/sales-documents-row-delete.test.js
 * ------------------------------------------------------------------
 * Documents → the row's ⋮ Actions menu → Delete.
 *
 *   CONTRACT  every document row of the Documents module (Inside ERP and Local
 *             Doc, both rendered by the one table) offers the shared ActionMenu
 *             with exactly one item — Delete — while Preview / Download / Record
 *             stay exactly as they were, and no bulk control comes back
 *   POLICY    the delete is the repository's established SOFT delete
 *             (`DELETE /documents/{id}` → status "deleted", the trash), never the
 *             permanent endpoint; nothing is deleted locally (no state edit, no
 *             localStorage), the list and the counts are re-read from the
 *             repository only after the request succeeds, and a failure is
 *             stated instead of being shown as a delete
 *   SAFETY    the confirmation names the document, both buttons are disabled
 *             while the request is in flight and a second confirm is ignored
 *
 * Run: node --test tests/sales-documents-row-delete.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { isActiveDocument } from '../src/utils/documentView.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'src/pages/Documents.jsx';
const SERVICE = 'src/services/documentService.js';
const CONTROLLER =
  'erp-backend/src/main/java/com/vishatech/erp/controller/DocumentRepositoryController.java';
const BACKEND_SERVICE =
  'erp-backend/src/main/java/com/vishatech/erp/service/DocumentRepositoryService.java';

describe('Documents · which rows the delete rule applies to', () => {
  it('mirrors the backend active-row rule, so a trashed row leaves the list', () => {
    assert.equal(isActiveDocument({ status: 'uploaded' }), true);
    assert.equal(isActiveDocument({ status: 'generated' }), true);
    assert.equal(isActiveDocument({ status: 'pending' }), true);
    assert.equal(isActiveDocument({ status: 'DELETED' }), false);
    assert.equal(isActiveDocument({ status: 'Archived' }), false);
    assert.equal(isActiveDocument({}), true);
    assert.equal(isActiveDocument(null), true);
  });

  it('is the same rule the backend applies to its own scoped listing', () => {
    const repo = read(
      'erp-backend/src/main/java/com/vishatech/erp/repository/DocumentRepositoryEntryRepository.java'
    );
    assert.match(
      repo,
      /ACTIVE_FILTER = "LOWER\(d\.status\) <> 'deleted' AND LOWER\(d\.status\) <> 'archived'"/
    );
  });
});

describe('Documents · the row ⋮ menu', () => {
  const page = read(PAGE);

  it('gives every document row the shared menu with a single Delete item', () => {
    // one menu per rendered row, inside the row's own actions cell
    assert.match(page, /<div className="doc-row-actions">/);
    assert.match(page, /<ActionMenu\s+items=\{\[\{[\s\S]{0,200}key: 'delete'/);
    assert.match(page, /label: 'Delete'/);
    assert.match(page, /icon: Trash2/);
    assert.match(page, /danger: true/);
    // exactly one item is passed, so Delete is the only thing the menu can do
    const menuItems = page.match(/items=\{\[\{[\s\S]*?\}\]\}/);
    assert.ok(menuItems, 'the menu must pass an items array');
    assert.equal((menuItems[0].match(/key: '/g) || []).length, 1);
    // it is the shared dropdown, not a hand-rolled one
    assert.match(page, /\{ ActionMenu, ConfirmDialog, useToast \} from '\.\.\/components\/Common'/);
  });

  it('offers Delete on the row itself, never as another always-visible button', () => {
    // The action buttons that are always visible stay exactly Preview/Download/Record.
    assert.match(page, /<Eye size=\{13\} \/> Preview/);
    assert.match(page, /<Download size=\{13\} \/>/);
    assert.match(page, /<ExternalLink size=\{13\} \/> Record/);
    assert.doesNotMatch(page, /<Trash2 size=\{13\} \/> Delete/);
    assert.doesNotMatch(page, /doc-btn[^"]*"[^>]*>\s*<Trash2/);
  });

  it('respects the API permission flag instead of offering an action that would 403', () => {
    assert.match(page, /disabled: doc\.canDelete === false/);
    assert.match(page, /disabledReason: 'You do not have permission to delete this document'/);
  });

  it('adds no bulk selection, archive or restore control back to the table', () => {
    for (const marker of [
      'toggleAll', 'selectedDocs', 'headerCheckboxRef', 'bulkConfirm', 'requestBulk',
      'executeBulk', 'handleArchive', 'handleRestore', 'handleAuditTrail', 'permanentDelete',
      "type=\"checkbox\""
    ]) {
      assert.ok(!page.includes(marker), `${marker} must not be on the page`);
    }
  });
});

describe('Documents · the delete itself', () => {
  const page = read(PAGE);

  it('confirms first, naming the document, with Cancel and Delete', () => {
    assert.match(page, /import \{ ActionMenu, ConfirmDialog, useToast \} from '\.\.\/components\/Common'/);
    const dialog = page.slice(page.indexOf('<ConfirmDialog'));
    assert.ok(dialog.length > 0, 'the page must render a ConfirmDialog');
    assert.match(dialog, /title="Delete document"/);
    assert.match(dialog, /confirmLabel=\{deletingId \? 'Deleting…' : 'Delete'\}/);
    // the message carries the document's own displayed name
    assert.match(dialog, /documentDisplayName\(pendingDelete\)/);
    assert.match(dialog, /onCancel=\{handleCancelDelete\}/);
    assert.match(dialog, /onConfirm=\{handleConfirmDelete\}/);
    // Cancel closes without touching the repository
    const cancel = page.slice(page.indexOf('const handleCancelDelete'));
    assert.match(cancel.slice(0, 200), /setPendingDelete\(null\);/);
    assert.doesNotMatch(cancel.slice(0, 200), /documentService\./);
  });

  it('uses the existing soft-delete API and never the permanent one', () => {
    assert.match(page, /await documentService\.delete\(doc\.id, \{ suppressGlobalError: true \}\)/);
    assert.doesNotMatch(page, /permanentDelete/);
    const service = read(SERVICE);
    assert.match(service, /async delete\(id, \{ suppressGlobalError = false \} = \{\}\)[\s\S]{0,260}api\.delete\(`\/documents\/\$\{id\}`/);
    // the permanent endpoint stays a separate, deliberate action
    assert.match(service, /async permanentDelete\(id\)[\s\S]{0,160}\/documents\/\$\{id\}\/permanent/);
    // and the soft delete keeps its existing default behaviour for every other caller
    assert.match(service, /suppressGlobalError = false \} = \{\}/);
    assert.match(read('src/pages/sales/QuotationViewPage.jsx'), /documentService\.delete\(row\.id\)/);
  });

  it('deletes through the repository endpoint whose policy is the trash', () => {
    const controller = read(CONTROLLER);
    assert.match(controller, /@PreAuthorize\("hasAuthority\('DOCUMENT_DELETE'\)"\)\s*@DeleteMapping\("\/\{id\}"\)/);
    assert.match(controller, /"Document moved to trash"/);
    const service = read(BACKEND_SERVICE);
    const method = service.slice(service.indexOf('public void delete(Long id)'));
    assert.match(method.slice(0, 700), /entry\.setStatus\("deleted"\)/);
    // the stored file is never destroyed by a delete
    assert.doesNotMatch(method.slice(0, 700), /fileStorageService|deleteById|deleteByDocumentId/);
  });

  it('removes the row by re-reading the repository after success, never locally', () => {
    const handler = page.slice(page.indexOf('const handleConfirmDelete'));
    const body = handler.slice(0, 1400);
    assert.match(body, /await documentService\.delete\(/);
    // the re-read happens after the delete succeeded, and it is the page's own loader
    assert.ok(body.indexOf('await documentService.delete(') < body.indexOf('await load({ silent: true })'));
    assert.match(body, /setPendingDelete\(null\);/);
    // no local removal, no storage, no optimistic filtering of the row away
    assert.doesNotMatch(body, /setDocuments|localStorage|sessionStorage|filter\(\(?d/);
    assert.doesNotMatch(page, /localStorage|sessionStorage/);
  });

  it('states a failure instead of reporting a deletion, and keeps the row', () => {
    const handler = page.slice(page.indexOf('const handleConfirmDelete'));
    const body = handler.slice(0, 1600);
    assert.match(body, /catch \(err\) \{/);
    assert.match(body, /toast\.error\(err\?\.response\?\.data\?\.message/);
    assert.match(body, /'Delete failed\. The document was not deleted\.'/);
    // the failure path neither clears the dialog's target nor reloads as if it worked
    const catchBlock = body.slice(body.indexOf('catch (err)'));
    assert.doesNotMatch(catchBlock.slice(0, 400), /setPendingDelete\(null\)/);
    assert.doesNotMatch(catchBlock.slice(0, 400), /await load\(/);
  });

  it('cannot be fired twice while a delete is in flight', () => {
    assert.match(page, /if \(deletingId\) return;\s*setPendingDelete\(doc\);/);
    assert.match(page, /if \(!pendingDelete \|\| deletingId\) return;/);
    // the dialog disables both of its buttons while loading
    assert.match(page, /loading=\{Boolean\(deletingId\)\}/);
    assert.match(read('src/components/Common/ConfirmDialog.jsx'), /disabled=\{loading\}/);
  });

  it('leaves Preview, Download and the record route untouched by the new action', () => {
    assert.match(page, /const handlePreview = \(doc\) => \{[\s\S]{0,160}previewRouteFor\(doc\)/);
    assert.match(page, /await documentService\.downloadFile\(doc\)/);
    assert.match(page, /getModuleRoute\(doc\?\.module, doc\?\.relatedRecordId\)/);
    // the delete state does not share the download guard
    assert.match(page, /const \[downloadingId, setDownloadingId\] = useState\(null\);/);
    assert.match(page, /const \[deletingId, setDeletingId\] = useState\(null\);/);
  });
});
