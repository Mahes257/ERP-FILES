/**
 * tests/sales-documents-mirror-policy.test.js
 * ------------------------------------------------------------------
 * Sales → Documents: the folder explorer (see
 * tests/sales-documents-folders.test.js) replaced the old repository table, and
 * the controls that table owned are gone for good — no KPI cards, category
 * tabs, search, filters, column picker, view switch, bulk bar or row menus.
 *
 *   CONTRACT  the removed table controls stay removed while the page keeps the
 *             two existing actions and the upload workflow (the header action
 *             opens the local file picker directly — no source-selection step)
 *   POLICY    the Sales area never auto-creates a record mirror, and the
 *             soft-delete endpoint behind the repository is untouched
 *
 * Run: node --test tests/sales-documents-mirror-policy.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'src/pages/Documents.jsx';
const SCOPE = 'erp-backend/src/main/java/com/vishatech/erp/service/DocumentModuleScope.java';
const REPO_SERVICE =
  'erp-backend/src/main/java/com/vishatech/erp/service/DocumentRepositoryService.java';
const RECONCILE =
  'erp-backend/src/main/java/com/vishatech/erp/service/DocumentReconciliationService.java';
const BACKFILL = 'erp-backend/src/main/java/com/vishatech/erp/service/DocumentBackfillService.java';
const CONTROLLER =
  'erp-backend/src/main/java/com/vishatech/erp/controller/DocumentRepositoryController.java';

describe('Sales Documents · the removed table controls stay removed', () => {
  const page = read(PAGE);

  it('keeps the two page actions', () => {
    assert.match(page, /onClick=\{handleRefresh\}/);
    assert.match(page, /onClick=\{handleUploadDocument\}/);
    assert.match(page, /Upload Document/);
  });

  it('does not bring back the KPI strip, category tabs, search, filters or column picker', () => {
    for (const marker of [
      'PurchaseKpiCards', 'SALES_CATEGORIES', 'doc-metrics', 'doc-nav-track',
      'STATUS_OPTIONS', 'DOC_TYPE_OPTIONS', 'VISIBILITY_OPTIONS', 'COLUMNS',
      'PAGE_SIZE_OPTIONS', 'handleSearch', 'handleFilterChange', 'handleSort',
      'visibleColumns', 'setView(', 'showFilters', 'activeFilterChips'
    ]) {
      assert.ok(!page.includes(marker), `${marker} must not come back to the page`);
    }
  });

  it('does not bring back the bulk bar, the old row menu or the bulk helper module', () => {
    // The per-row ⋮ menu this page is allowed to have is the shared ActionMenu
    // with a single Delete item (see tests/sales-documents-row-delete.test.js).
    // Everything that made the removed table the "bulk" table stays gone: no
    // row selection, no bulk archive/restore/audit, no hand-rolled RowMenu.
    for (const marker of [
      'RowMenu', 'requestBulk', 'executeBulk', 'bulkConfirm', 'bulkBusy',
      'selectionAfterBulk', 'toggleAll', 'headerCheckboxRef', 'selectedDocs',
      'handleArchive', 'handleRestore', 'handleAuditTrail', 'permanentDelete',
      'getRowActions', 'statusChip', 'documentService.list('
    ]) {
      assert.ok(!page.includes(marker), `${marker} must not come back to the page`);
    }
    assert.throws(() => read('src/utils/documentBulk.js'));
  });

  it('keeps the upload action, wired straight to the local file picker', () => {
    // The action is preserved; the intermediate "do you mean Local Device or
    // Inside ERP?" dialog in front of it is not.
    assert.match(page, /const handleUploadDocument = \(\) => \{\s*if \(uploading\) return;\s*uploadInputRef\.current\?\.click\(\);\s*\};/);
    assert.match(page, /documentService\.upload\(formData\)/);
    assert.match(page, /accept=\{ACCEPT_STRING\}/);
    assert.match(page, /fileRejectionReason\(file, UPLOAD_MAX_SIZE_MB\)/);
    assert.doesNotMatch(page, /Where does the document come from\?/);
    assert.doesNotMatch(page, /handleChooseLocalDevice|handleChooseInsideErp/);
    assert.doesNotMatch(page, /import InsideErpDocumentPicker/);
  });
});

describe('Sales Documents · automatic mirror policy', () => {
  it('defines the Sales area policy once, in the module scope', () => {
    const scope = read(SCOPE);
    assert.match(scope, /public static boolean isSalesModule\(String module\)/);
    // Production is excluded by the same predicate: its Documents folders list
    // uploaded attachments, not one placeholder row per business record.
    assert.match(scope, /public static boolean isProductionModule\(String module\)/);
    assert.match(
      scope,
      /public static boolean allowsAutomaticRecordDocuments\(String module\) \{\s*return !isSalesModule\(module\) && !isProductionModule\(module\);/
    );
    assert.match(scope, /SALES_MODULES\.contains\(module\.trim\(\)\.toLowerCase\(Locale\.ROOT\)\)/);
  });

  it('gates the record-save sync so a Sales record can never create a mirror', () => {
    const service = read(REPO_SERVICE);
    const sync = service.slice(service.indexOf('public void syncRecordDocumentQuietly'));
    const body = sync.slice(0, 1200);
    assert.match(body, /if \(!DocumentModuleScope\.allowsAutomaticRecordDocuments\(module\)\)/);
    assert.ok(
      body.indexOf('allowsAutomaticRecordDocuments') < body.indexOf('ensureRecordDocument(module'),
      'the Sales gate must run before the mirror is created'
    );
  });

  it('gates the reconciliation and backfill runs for the Sales and Production areas', () => {
    const reconcile = read(RECONCILE);
    const reconcileBackfill = reconcile.slice(reconcile.indexOf('private int backfillRecordDocuments()'));
    const reconcileRefresh = reconcile.slice(reconcile.indexOf('private int refreshRecordDocuments()'));
    assert.match(reconcileBackfill.slice(0, 1200), /allowsAutomaticRecordDocuments\(spec\.module\(\)\)/);
    assert.match(reconcileRefresh.slice(0, 1600), /allowsAutomaticRecordDocuments\(module\)/);
    const reconcileBackfillOne = reconcile.slice(reconcile.indexOf('private int backfillOne('));
    assert.doesNotMatch(reconcileBackfillOne.slice(0, 900), /allowsAutomaticRecordDocuments/);

    const backfill = read(BACKFILL);
    assert.match(backfill, /boolean salesMirrorsAllowed = DocumentModuleScope\.allowsAutomaticRecordDocuments\("Lead"\)/);
    assert.match(backfill, /totalCreated \+= backfillMarketingVisits\(result\)/);
    assert.match(backfill, /result\.put\("salesMirrorsSkipped", !salesMirrorsAllowed\)/);
  });

  it('keeps deletion on the existing soft-delete endpoint', () => {
    const controller = read(CONTROLLER);
    assert.match(controller, /@DeleteMapping\("\/\{id\}"\)/);
    const service = read(REPO_SERVICE);
    const deleteMethod = service.slice(
      service.indexOf('public void delete(Long id)'),
      service.indexOf('public DocumentRepositoryResponse restore(Long id)')
    );
    assert.match(deleteMethod, /entry\.setStatus\("deleted"\)/);
    assert.match(deleteMethod, /permissionService\.canDelete\(entry\)/);
    // a soft delete never touches stored files or history
    assert.doesNotMatch(deleteMethod, /fileStorageService|deleteByDocumentId|deleteById/);
  });
});
