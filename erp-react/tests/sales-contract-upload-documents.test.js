/**
 * tests/sales-contract-upload-documents.test.js
 * ------------------------------------------------------------------
 * Sales Execution → Sales Contracts: the Upload Documents section on the
 * Create / Edit pages.
 *
 * The create page previously had no attachment support at all, so documents
 * could not be selected, saved or reopened from a Sales Contract. The section
 * was added on top of the EXISTING shared attachment stack (SalesAttachments /
 * PendingAttachments + /sales-contracts/{id}/attachments), which this test
 * keeps honest:
 *
 *   POLICY    the frontend upload policy mirrors the backend's
 *             app.upload.allowed-extensions, and a staged selection enforces
 *             it (extension, empty file) before anything is sent
 *   LIFECYCLE the contract is created FIRST and the staged documents are then
 *             uploaded against the id the backend returned — never against a
 *             placeholder — and staged files are only cleared once the backend
 *             confirmed them
 *   RETRY     a failed upload keeps the contract id (createdIdRef) so a retry
 *             UPDATEs that contract instead of creating a duplicate, keeps the
 *             failed files visible, and does not navigate away
 *   IN PLACE  attachment upload/delete failures are reported in the panel, not
 *             promoted to the global error page (which would replace the form
 *             and the user's staged files)
 *
 * Run: node --test tests/sales-contract-upload-documents.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const STORAGE = 'src/utils/attachmentStorage.js';
const FORM = 'src/pages/sales/SalesContractFormPage.jsx';
const PENDING = 'src/components/SalesForm/PendingAttachments.jsx';
const SERVICE = 'src/services/salesServiceFactory.js';
const BACKEND_PROPS = 'erp-backend/src/main/resources/application.properties';

describe('Sales Contract — Upload Documents: upload policy', () => {
  it('mirrors the backend allow-list and per-file limit', () => {
    const props = read(BACKEND_PROPS);
    const declared = props.match(/app\.upload\.allowed-extensions=\$\{ERP_UPLOAD_ALLOWED_EXTENSIONS:([^}]+)\}/);
    assert.ok(declared, 'backend must declare app.upload.allowed-extensions');
    const backendExts = declared[1].split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

    const storage = read(STORAGE);
    const listBlock = storage.match(/ALLOWED_ATTACHMENT_EXTENSIONS = \[([\s\S]*?)\];/);
    assert.ok(listBlock, 'frontend must declare ALLOWED_ATTACHMENT_EXTENSIONS');
    const frontendExts = [...listBlock[1].matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);

    assert.deepEqual(
      [...frontendExts].sort(),
      [...backendExts].sort(),
      'the frontend accept-list must stay identical to the backend policy'
    );
    // Business documents the task requires (PDF + Office) must be permitted.
    for (const ext of ['pdf', 'doc', 'docx', 'xls', 'xlsx']) {
      assert.ok(frontendExts.includes(ext), `${ext} must be an allowed attachment type`);
    }

    const perFile = props.match(/spring\.servlet\.multipart\.max-file-size=\$\{ERP_MAX_FILE_SIZE:(\d+)GB\}/);
    assert.ok(perFile, 'backend max-file-size must be declared');
    assert.match(storage, /export const MAX_ATTACHMENT_SIZE = \d+ \* 1024 \* 1024 \* 1024;/);
    assert.equal(Number(perFile[1]), Number(storage.match(/MAX_ATTACHMENT_SIZE = (\d+) \* 1024/)[1]));
  });

  it('rejects unsupported types, empty files and oversized files with a reason', () => {
    const storage = read(STORAGE);
    assert.match(storage, /export function getAttachmentTypeError\(file\)/);
    assert.match(storage, /export function getAttachmentSizeError\(file\)/);
    // Extension-only matching (never the raw name) and a lowercase extension.
    assert.match(storage, /export function attachmentExtensionOf\(fileName\)/);
    assert.match(storage, /is empty \(0 bytes\) and cannot be uploaded/);
    assert.match(storage, /error\.name = 'AttachmentTypeError'/);
    assert.match(storage, /File size cannot exceed 2 GB/);
  });

  it('enforces the policy when files are staged, keeping the good ones', () => {
    const pending = read(PENDING);
    // Both the picker and the drop zone run the same validation.
    assert.match(pending, /const typeError = getAttachmentTypeError\(file\);/);
    assert.match(pending, /const err = getAttachmentSizeError\(file\);/);
    // Rejected files are skipped individually — the rest of the selection stays.
    assert.match(pending, /toast\.warning\(typeError\.message\);/);
    assert.match(pending, /onChange\(\[\.\.\.files, \.\.\.next\]\);/);
    // Duplicate selections of the same file are ignored.
    assert.match(pending, /!files\.some\(\(f\) => f\.name === file\.name && f\.size === file\.size\)/);
    // The file input offers exactly the allowed types.
    assert.match(pending, /accept=\{ATTACHMENT_ACCEPT\}/);
  });
});

describe('Sales Contract — Upload Documents: create lifecycle', () => {
  it('renders the section between the details card and the action footer', () => {
    const form = read(FORM);
    assert.match(form, /<h2 className="text-sm font-bold text-slate-800">Upload Documents<\/h2>/);
    assert.match(form, /import PendingAttachments from '\.\.\/\.\.\/components\/SalesForm\/PendingAttachments';/);
    assert.match(form, /import SalesAttachments from '\.\.\/\.\.\/components\/SalesDetail\/SalesAttachments';/);
    // Create mode stages files; edit mode lists what the backend holds. Both
    // panels are given the Sales Contract's document categories (E-Sign /
    // Scanned Copy) so files can be filed under the right kind.
    assert.match(form, /<PendingAttachments[\s\S]{0,200}?files=\{pendingFiles\}[\s\S]{0,200}?onChange=\{setPendingFiles\}[\s\S]{0,200}?variant="table"[\s\S]{0,200}?categories=\{SALES_CONTRACT_ATTACHMENT_CATEGORIES\}/);
    assert.match(form, /<SalesAttachments[\s\S]*?docId=\{id\}[\s\S]*?attachments=\{attachments\}[\s\S]*?onChanged=\{reloadAttachments\}[\s\S]*?categories=\{SALES_CONTRACT_ATTACHMENT_CATEGORIES\}/);
    // The section sits before the footer, which owns the save actions.
    const sectionAt = form.indexOf('>Upload Documents</h2>');
    const footerAt = form.indexOf('<CreationActionBar');
    assert.ok(sectionAt > 0 && footerAt > sectionAt, 'the section must precede the action footer');
  });

  it('persists the contract first and then uploads against the returned id', () => {
    const form = read(FORM);
    assert.match(form, /const created = res\?\.data \?\? \{\};/);
    assert.match(form, /const savedId = created\.id \|\| persistedId;/);
    assert.match(form, /if \(!isEdit && savedId\) createdIdRef\.current = savedId;/);
    const upload = form.match(/const failedFiles = await uploadQueued\(savedId\);/);
    assert.ok(upload, 'the staged documents must be uploaded against the persisted contract id');
    // Success is announced only after the uploads were attempted/confirmed.
    const uploadAt = form.indexOf('const failedFiles = await uploadQueued(savedId);');
    const successAt = form.indexOf("toast.success(isEdit ? `${no} updated`");
    assert.ok(successAt > uploadAt, 'the success message must not precede the attachment upload');
  });

  it('remembers the created id so a retry updates instead of duplicating', () => {
    const form = read(FORM);
    assert.match(form, /const persistedId = isEdit \? id : createdIdRef\.current;/);
    assert.match(form, /const res = persistedId\n {8}\? await salesContractService\.update\(persistedId, payload\)\n {8}: await salesContractService\.create\(payload, draft\);/);
    // The id is cleared when the form moves on to a genuinely new contract.
    const stay = form.slice(form.indexOf('if (stay) {'));
    assert.ok(
      stay.indexOf('createdIdRef.current = null;') < stay.indexOf('getNextNumber()'),
      'Save & New must clear the remembered id before the next numbering'
    );
  });

  it('keeps failed uploads staged and does not navigate away from them', () => {
    const form = read(FORM);
    const queued = form.slice(form.indexOf('const uploadQueued = async (docId) => {'));
    // Only files the backend confirmed leave the queue.
    assert.match(queued, /const failedFiles = results\.filter\(\(r\) => !r\.ok\)\.map\(\(r\) => r\.file\);/);
    assert.match(queued, /setPendingFiles\(failedFiles\);/);
    assert.match(queued, /still need attention\. Click Save again to retry/);
    // Navigation happens only after a clean upload pass.
    const failureReturn = form.indexOf('setForm((prev) => ({ ...prev, scNo: prev.scNo || no }));');
    const navigateToList = form.indexOf('} else if (draft) {');
    assert.ok(failureReturn > 0 && navigateToList > failureReturn, 'a failed upload must return before navigating');
  });

  it('reports upload/delete failures in the panel instead of the global error page', () => {
    const service = read(SERVICE);
    const add = service.slice(service.indexOf('async addAttachment('), service.indexOf('async uploadMany('));
    assert.match(add, /suppressGlobalError: true/);
    assert.match(add, /\/attachments`/);
    assert.match(service, /async deleteAttachment\(id, attachmentId\)[\s\S]*?suppressGlobalError: true/);
  });
});

describe('Sales Contract — Upload Documents: saved documents', () => {
  it('lists saved attachments from the backend response, not local state', () => {
    const form = read(FORM);
    assert.match(form, /setAttachments\(Array\.isArray\(raw\.attachments\) \? raw\.attachments : \[\]\);/);
    assert.match(form, /const reloadAttachments = \(\) => \{/);
    assert.match(form, /salesContractService\n {6}\.getAttachments\(id\)/);
    assert.match(form, /const list = res\?\.data \?\? res;/);
  });

  it('offers preview/download/delete for each persisted attachment', () => {
    const attachments = read('src/components/SalesDetail/SalesAttachments.jsx');
    assert.match(attachments, /onView: doc\.url/);
    assert.match(attachments, /onDownload: doc\.url/);
    assert.match(attachments, /onDelete: \(\) => handleDelete\(doc\)/);
    assert.match(attachments, /await service\.deleteAttachment\(docId, attachment\.id\)/);
    // The uploaded file is opened through the authenticated client.
    assert.match(attachments, /import \{ downloadFile, openFileInNewTab \} from '\.\.\/\.\.\/utils\/fileAccess';/);
  });
});

describe('Sales Contract — Upload Documents: E-Sign / Scanned Copy categories', () => {
  const CONSTANTS = 'src/constants/salesConstants.js';
  const TABLE = 'src/components/SalesForm/AttachmentsTable.jsx';
  const CONTROLLER = 'erp-backend/src/main/java/com/vishatech/erp/controller/SalesContractController.java';
  const ENTITY = 'erp-backend/src/main/java/com/vishatech/erp/entity/SalesAttachment.java';
  const RESPONSE = 'erp-backend/src/main/java/com/vishatech/erp/dto/SalesAttachmentResponse.java';
  const MIGRATION = 'erp-backend/docs/sales_attachment_category.sql';

  it('defines the two document kinds once, for the contract page', () => {
    assert.match(read(CONSTANTS), /export const SALES_CONTRACT_ATTACHMENT_CATEGORIES = \['E-Sign', 'Scanned Copy'\];/);
  });

  it('lets the create page label each staged file, and shows the label in the table', () => {
    const pending = read(PENDING);
    // The choice is carried on the FILE the save flow uploads, so the existing
    // "create first, upload after" lifecycle needs no change.
    assert.match(pending, /file\.attachmentCategory = category \|\| '';/);
    assert.match(pending, /categoryLabel=\{categories \? 'Document Type' : null\}/);
    assert.match(pending, /categoryOptions=\{categories\}/);
    assert.match(pending, /onCategoryChange=\{\(row, value\) => setFileCategory\(row\.fileIndex, value\)\}/);
    // …and the cards layout offers the same picker per staged file.
    assert.match(pending, /aria-label=\{`Document type for \$\{file\.name\}`\}/);
    // A module without categories renders exactly what it rendered before.
    assert.match(pending, /\{categories && \(/);
  });

  it('lets the saved-document panel label the files added next', () => {
    const attachments = read('src/components/SalesDetail/SalesAttachments.jsx');
    // The picker is OUTSIDE the drop zones, which are themselves click targets
    // that open the file dialog.
    assert.match(attachments, /const categoryPicker = categories \? \(/);
    assert.match(attachments, /label htmlFor=\{`attachment-category-\$\{docId\}`\}/);
    assert.match(attachments, /\{categoryPicker\}\n {6}<div\n {8}role="button"/);
    // The chosen category travels with every upload AND with a retry.
    assert.equal((attachments.match(/\n\s*category,\n/g) || []).length, 2, 'upload and retry must both send the category');
    assert.match(attachments, /category: doc\.attachmentCategory \|\| ''/);
    assert.match(attachments, /categoryLabel=\{categories \? 'Document Type' : null\}/);
  });

  it('sends the category with the file, and only then', () => {
    const service = read(SERVICE);
    assert.match(service, /async uploadMany\(id, files, \{ onFileStart, onProgress, category \} = \{\}\)/);
    assert.match(service, /const fileCategory = file\.attachmentCategory \|\| category;/);
    assert.match(service, /if \(fileCategory\) formData\.append\('category', fileCategory\);/);
    // An upload with no category is byte-for-byte the old request.
    assert.match(service, /formData\.append\('file', file\);/);
  });

  it('renders the category column only for a module that documents categories', () => {
    const table = read(TABLE);
    assert.match(table, /categoryLabel = null,/);
    assert.match(table, /const columnCount = categoryLabel \? 8 : 7;/);
    assert.match(table, /<td colSpan=\{columnCount\}/);
    assert.match(table, /\{categoryLabel && <th className=\{`\$\{TH_CLS\} min-w-\[150px\]`\}>\{categoryLabel\}<\/th>\}/);
    assert.match(table, /row\.category \|\| '—'/);
  });

  it('persists the category on the attachment itself, with no second store', () => {
    // One optional column on the shared attachment row — no new table, and the
    // pre-existing rows simply have no category.
    assert.match(read(ENTITY), /private String attachmentCategory;/);
    assert.match(read(RESPONSE), /String attachmentCategory/);
    assert.match(read(MIGRATION), /ADD COLUMN attachment_category VARCHAR\(40\) NULL/);
    assert.match(read(MIGRATION), /COLUMN_NAME = 'attachment_category'/);
  });

  it('accepts the category as an optional upload parameter and validates it', () => {
    const controller = read(CONTROLLER);
    assert.match(controller, /@RequestParam\(value = "category", required = false\) String category/);
    assert.match(controller, /addAttachment\(id, file, category\)/);
    const service = read('erp-backend/src/main/java/com/vishatech/erp/service/SalesContractService.java');
    assert.match(service, /attachment\.setAttachmentCategory\(normalizeAttachmentCategory\(category\)\);/);
    // Blank means "no category"; an over-long value is refused, never truncated.
    assert.match(service, /if \(category == null \|\| category\.isBlank\(\)\) \{\r?\n {12}return null;/);
    assert.match(service, /Attachment category exceeds maximum length of/);
  });
});
