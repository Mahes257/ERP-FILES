/**
 * tests/sales-documents-folders.test.js
 * ------------------------------------------------------------------
 * Sales → Documents → folder explorer.
 *
 *   HELPERS   the fixed hierarchy (Inside ERP + Local Doc at the Documents
 *             root), the module-spelling grouping (so a document cannot land in
 *             the wrong folder or vanish), breadcrumbs and the counts an
 *             explorer card shows
 *   CONTRACT  the page reads the EXISTING repository endpoint — scoped to Sales
 *             for Inside ERP, filtered to the Local Doc upload marker for the
 *             operator's own uploads — groups by each document's own metadata,
 *             reuses the existing preview/download/record actions, and never
 *             invents documents or asks the user to upload again
 *
 * Run: node --test tests/sales-documents-folders.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LOCAL_DOC_FOLDER_ID,
  LOCAL_UPLOAD_MODULE,
  SALES_FOLDERS,
  documentsInFolder,
  folderById,
  folderChildren,
  folderDocuments,
  folderIdForDocument,
  folderTrail,
  groupByFolder,
  isFolderId,
  normalizeModule
} from '../src/utils/documentFolders.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'src/pages/Documents.jsx';
const FOLDERS = 'src/utils/documentFolders.js';

const doc = (id, module, extra = {}) => ({ id, module, documentName: `file-${id}.pdf`, ...extra });

describe('Sales folder hierarchy', () => {
  it('is exactly the required structure, with no extra folders', () => {
    assert.deepEqual(
      SALES_FOLDERS.map((f) => [f.id, f.label]),
      [
        ['insideerp', 'Inside ERP'],
        ['localdoc', 'Local Doc'],
        ['sales', 'Sales'],
        ['sales/crm', 'CRM'],
        ['sales/crm/leads', 'Leads'],
        ['sales/crm/clients', 'Clients'],
        ['sales/crm/contacts', 'Contacts'],
        ['sales/crm/followups', 'Follow-ups'],
        ['sales/cpr', 'CPR'],
        ['sales/cpr/cpr', 'CPR'],
        ['sales/cpr/technical', 'CPR Technical Verification'],
        ['sales/cpr/costworkout', 'Cost Workout'],
        ['sales/cpr/profitworkout', 'Profit Workout'],
        ['sales/cpr/reports', 'CPR Reports'],
        ['sales/execution', 'Sales Execution'],
        ['sales/execution/quotations', 'Quotations'],
        ['sales/execution/contracts', 'Sales Contracts'],
        ['sales/execution/cpo', 'Customer Purchase Orders'],
        ['sales/execution/proforma', 'Proforma Invoices'],
        ['sales/execution/challans', 'Delivery Challans'],
        ['sales/execution/invoices', 'Invoices'],
        ['sales/execution/creditnotes', 'Credit Notes'],
        ['sales/execution/receipts', 'Payment Receipts']
      ]
    );
  });

  it('nests them the way the Documents page shows them', () => {
    // Documents → Inside ERP + Local Doc (the two roots)
    assert.deepEqual(folderChildren(null).map((f) => f.label), ['Inside ERP', 'Local Doc']);
    // Inside ERP → Sales — Sales is never a direct child of Documents
    assert.deepEqual(folderChildren('insideerp').map((f) => f.label), ['Sales']);
    assert.equal(folderById('sales').parent, 'insideerp');
    assert.ok(!folderChildren(null).some((f) => f.id === 'sales'));
    // Local Doc is a leaf root: nothing is nested under it
    assert.deepEqual(folderChildren('localdoc'), []);
    assert.equal(folderById('localdoc').parent, null);
    // Sales → CRM · CPR · Sales Execution
    assert.deepEqual(folderChildren('sales').map((f) => f.label), ['CRM', 'CPR', 'Sales Execution']);
    // CRM → Leads · Clients · Contacts · Follow-ups
    assert.deepEqual(
      folderChildren('sales/crm').map((f) => f.label),
      ['Leads', 'Clients', 'Contacts', 'Follow-ups']
    );
    // CPR → its five required subfolders, in order
    assert.deepEqual(folderChildren('sales/cpr').map((f) => f.label), [
      'CPR',
      'CPR Technical Verification',
      'Cost Workout',
      'Profit Workout',
      'CPR Reports'
    ]);
    // Sales Execution → its eight required subfolders, in order
    assert.deepEqual(folderChildren('sales/execution').map((f) => f.label), [
      'Quotations',
      'Sales Contracts',
      'Customer Purchase Orders',
      'Proforma Invoices',
      'Delivery Challans',
      'Invoices',
      'Credit Notes',
      'Payment Receipts'
    ]);
  });

  it('stops at the leaves — no subfolder carries children of its own', () => {
    for (const folder of SALES_FOLDERS) {
      const children = folderChildren(folder.id);
      if (children.length === 0) continue;
      // only the repository root, the Sales area and the three families branch out
      assert.ok(
        ['insideerp', 'sales', 'sales/crm', 'sales/cpr', 'sales/execution'].includes(folder.id),
        `${folder.id} must not branch out`
      );
    }
    for (const leaf of [
      'sales/cpr/cpr', 'sales/cpr/technical', 'sales/cpr/costworkout',
      'sales/cpr/profitworkout', 'sales/cpr/reports', 'sales/execution/quotations',
      'sales/execution/contracts', 'sales/execution/cpo', 'sales/execution/proforma',
      'sales/execution/challans', 'sales/execution/invoices',
      'sales/execution/creditnotes', 'sales/execution/receipts'
    ]) {
      assert.deepEqual(folderChildren(leaf), [], leaf);
    }
  });

  it('builds the breadcrumb root-first, through Inside ERP', () => {
    assert.deepEqual(folderTrail(null).map((n) => n.label), ['Documents']);
    assert.deepEqual(folderTrail('insideerp').map((n) => n.label), ['Documents', 'Inside ERP']);
    assert.deepEqual(folderTrail('localdoc').map((n) => n.label), ['Documents', 'Local Doc']);
    assert.deepEqual(folderTrail('sales').map((n) => n.label), ['Documents', 'Inside ERP', 'Sales']);
    assert.deepEqual(
      folderTrail('sales/crm/leads').map((n) => n.label),
      ['Documents', 'Inside ERP', 'Sales', 'CRM', 'Leads']
    );
    // a deep subfolder's trail walks the whole way out again
    assert.deepEqual(
      folderTrail('sales/cpr/costworkout').map((n) => n.label),
      ['Documents', 'Inside ERP', 'Sales', 'CPR', 'Cost Workout']
    );
    assert.deepEqual(
      folderTrail('sales/execution/receipts').map((n) => n.label),
      ['Documents', 'Inside ERP', 'Sales', 'Sales Execution', 'Payment Receipts']
    );
    // every level offers a real parent to go Back to
    assert.equal(folderById('sales/crm/leads').parent, 'sales/crm');
    assert.equal(folderById('sales/cpr/costworkout').parent, 'sales/cpr');
    assert.equal(folderById('sales').parent, 'insideerp');
    assert.equal(folderById('insideerp').parent, null);
  });

  it('rejects an unknown folder id so a bad link cannot render an empty page', () => {
    assert.equal(isFolderId(null), true);
    assert.equal(isFolderId('sales/crm'), true);
    assert.equal(isFolderId('sales/cpr/reports'), true);
    assert.equal(isFolderId('insideerp'), true);
    assert.equal(isFolderId('sales/nope'), false);
    assert.equal(isFolderId(''), false);
  });
});

describe('documents are grouped by their own module metadata', () => {
  it('normalises every spelling the repository writes', () => {
    assert.equal(normalizeModule('Sales Contract'), 'salescontract');
    assert.equal(normalizeModule('salesContract'), 'salescontract');
    assert.equal(normalizeModule('Follow-up'), 'followup');
    assert.equal(normalizeModule(''), '');
  });

  it('places each CRM module in its own folder', () => {
    assert.equal(folderIdForDocument(doc(1, 'Lead')), 'sales/crm/leads');
    assert.equal(folderIdForDocument(doc(2, 'Leads')), 'sales/crm/leads');
    assert.equal(folderIdForDocument(doc(3, 'Client')), 'sales/crm/clients');
    assert.equal(folderIdForDocument(doc(4, 'customer')), 'sales/crm/clients');
    assert.equal(folderIdForDocument(doc(5, 'Follow-up')), 'sales/crm/followups');
    assert.equal(folderIdForDocument(doc(6, 'followups')), 'sales/crm/followups');
  });

  it('places every CPR companion in its own CPR subfolder', () => {
    assert.equal(folderIdForDocument(doc(7, 'CPR')), 'sales/cpr/cpr');
    assert.equal(folderIdForDocument(doc(7, 'cpr')), 'sales/cpr/cpr');
    assert.equal(folderIdForDocument(doc(7, 'CPR Technical Verification')), 'sales/cpr/technical');
    assert.equal(folderIdForDocument(doc(7, 'cprtechnicalverification')), 'sales/cpr/technical');
    assert.equal(folderIdForDocument(doc(7, 'Cost Workout')), 'sales/cpr/costworkout');
    assert.equal(folderIdForDocument(doc(7, 'costworkout')), 'sales/cpr/costworkout');
    assert.equal(folderIdForDocument(doc(7, 'Profit Workout')), 'sales/cpr/profitworkout');
    assert.equal(folderIdForDocument(doc(7, 'profit-workout')), 'sales/cpr/profitworkout');
    // the report spelling has no writer yet, but is recognised when it appears
    assert.equal(folderIdForDocument(doc(7, 'CPR Reports')), 'sales/cpr/reports');
    assert.equal(folderIdForDocument(doc(7, 'cpr-report')), 'sales/cpr/reports');
  });

  it('places every Sales Execution module in its own subfolder', () => {
    const expected = [
      ['Quotation', 'sales/execution/quotations'],
      ['Sales Contract', 'sales/execution/contracts'],
      ['salesContract', 'sales/execution/contracts'],
      ['sales-contract', 'sales/execution/contracts'],
      ['Sales Order', 'sales/execution/cpo'],
      ['salesOrder', 'sales/execution/cpo'],
      ['Customer Purchase Order', 'sales/execution/cpo'],
      ['customerpurchaseorder', 'sales/execution/cpo'],
      ['Proforma Invoice', 'sales/execution/proforma'],
      ['proforma-invoice', 'sales/execution/proforma'],
      ['Delivery Challan', 'sales/execution/challans'],
      ['deliveryChallan', 'sales/execution/challans'],
      ['Invoice', 'sales/execution/invoices'],
      ['Credit Note', 'sales/execution/creditnotes'],
      ['creditNote', 'sales/execution/creditnotes'],
      ['Payment Receipt', 'sales/execution/receipts'],
      ['payment-receipt', 'sales/execution/receipts']
    ];
    for (const [module, folder] of expected) {
      assert.equal(folderIdForDocument(doc(8, module)), folder, module);
    }
    // a proforma invoice is never mistaken for a plain invoice
    assert.notEqual(
      folderIdForDocument(doc(8, 'Proforma Invoice')),
      folderIdForDocument(doc(8, 'Invoice'))
    );
  });

  it('keeps a document visible instead of dropping one with an unmapped module', () => {
    // A legacy/unknown spelling is shown in the Sales folder — the one place a
    // Sales-scoped document is always visible — never filtered away.
    for (const module of ['Finance', 'Sales', '', null, undefined, 'Something New']) {
      assert.equal(folderIdForDocument(doc(9, module)), 'sales', String(module));
    }
  });

  it('files a local upload in Local Doc and nowhere in the Inside ERP tree', () => {
    // The upload-source marker IS the module spelling, written by this page's
    // own upload. Case, spacing and separators cannot move it: nothing may send
    // a local file into the Inside ERP tree.
    assert.equal(LOCAL_UPLOAD_MODULE, 'Local Doc');
    // the spelling the page writes is the same one the backend stores, so it
    // cannot fall into "unmapped module → Sales" and reappear under Sales
    assert.ok(folderById(LOCAL_DOC_FOLDER_ID).modules.includes(normalizeModule(LOCAL_UPLOAD_MODULE)));
    for (const module of ['Local Doc', 'local doc', 'localdoc', 'LOCAL-DOC']) {
      assert.equal(folderIdForDocument(doc(20, module)), LOCAL_DOC_FOLDER_ID, module);
    }
    // …but a real ERP module always keeps its own folder, even if a stray row
    // carried a local-looking type
    assert.equal(
      folderIdForDocument(doc(21, 'Local Doc', { documentType: 'CPR' })),
      LOCAL_DOC_FOLDER_ID
    );
    assert.equal(folderIdForDocument(doc(22, 'CPR')), 'sales/cpr/cpr');
  });

  it('never lets a local file count towards Inside ERP, or the reverse', () => {
    const grouped = groupByFolder([
      doc(1, 'Lead'), doc(2, 'Local Doc'), doc(3, 'Cost Workout'), doc(4, 'Local Doc')
    ]);
    assert.deepEqual(documentsInFolder(LOCAL_DOC_FOLDER_ID, grouped).map((d) => d.id), [2, 4]);
    // the Inside ERP roots count only ERP documents
    assert.equal(folderDocuments('insideerp', grouped).length, 2);
    assert.equal(folderDocuments('sales', grouped).length, 2);
    assert.equal(folderDocuments(LOCAL_DOC_FOLDER_ID, grouped).length, 2);
    // and the two roots add up to the whole listing, with no row in both
    assert.equal(
      folderDocuments('insideerp', grouped).length + folderDocuments(LOCAL_DOC_FOLDER_ID, grouped).length,
      4
    );
  });

  it('places a standalone upload by its own document type and record prefix', () => {
    // A document uploaded straight from the Documents page carries the generic
    // "Sales" module, but its own type/record still say what it really is, so it
    // lands in the subfolder a user opens instead of the parent Sales folder.
    assert.equal(
      folderIdForDocument(doc(11, 'Sales', { documentType: 'CPR', recordNumber: 'CPR-2026-000002' })),
      'sales/cpr/cpr'
    );
    assert.equal(
      folderIdForDocument(doc(12, 'Sales', { documentType: 'Cost Workout', recordNumber: 'CW-2026-000010' })),
      'sales/cpr/costworkout'
    );
    // the type alone is enough
    assert.equal(folderIdForDocument(doc(14, '', { documentType: 'Quotation' })), 'sales/execution/quotations');
    // and the record prefix alone is enough when the type is a plain file kind
    for (const [prefix, folder] of [
      ['SC', 'sales/execution/contracts'],
      ['SO', 'sales/execution/cpo'],
      ['CPO', 'sales/execution/cpo'],
      ['QTN', 'sales/execution/quotations'],
      ['PI', 'sales/execution/proforma'],
      ['DC', 'sales/execution/challans'],
      ['INV', 'sales/execution/invoices'],
      ['CN', 'sales/execution/creditnotes'],
      ['CPR', 'sales/cpr/cpr'],
      ['TV', 'sales/cpr/technical'],
      ['CW', 'sales/cpr/costworkout'],
      ['PW', 'sales/cpr/profitworkout']
    ]) {
      assert.equal(
        folderIdForDocument(doc(13, 'Sales', { documentType: 'pdf', recordNumber: `${prefix}-2026-000001` })),
        folder,
        prefix
      );
    }
    // a file kind and no recognisable record stays in the Sales folder
    assert.equal(folderIdForDocument(doc(15, 'Sales', { documentType: 'pdf' })), 'sales');
    assert.equal(folderIdForDocument(doc(16, 'Sales', { recordNumber: 'XX-2026-000001' })), 'sales');
    // "PR-" is shared by seven services, so it must NOT claim a subfolder
    assert.equal(folderIdForDocument(doc(16, 'Sales', { recordNumber: 'PR-2026-000001' })), 'sales');
  });

  it('lets a specific module always win over the type/record refinement', () => {
    assert.equal(
      folderIdForDocument(doc(17, 'Sales Contract', { documentType: 'CPR', recordNumber: 'CPR-2026-000002' })),
      'sales/execution/contracts'
    );
    assert.equal(folderIdForDocument(doc(18, 'Lead', { documentType: 'Invoice' })), 'sales/crm/leads');
    assert.equal(
      folderIdForDocument(doc(18, 'Cost Workout', { recordNumber: 'SC-2026-000001' })),
      'sales/cpr/costworkout'
    );
  });

  it('puts every document in exactly one folder', () => {
    const documents = [
      doc(1, 'Lead'), doc(2, 'Client'), doc(3, 'Follow-up'), doc(4, 'CPR'),
      doc(5, 'Sales Contract'), doc(6, 'Sales'), doc(7, 'Finance')
    ];
    const grouped = groupByFolder(documents);
    const placed = Object.values(grouped).flat();
    assert.equal(placed.length, documents.length);
    assert.deepEqual(placed.map((d) => d.id).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7]);
    // A folder lists its OWN files only — subfolder files belong to the subfolder.
    assert.deepEqual(documentsInFolder('sales', grouped).map((d) => d.id).sort(), [6, 7]);
    assert.deepEqual(documentsInFolder('sales/crm/leads', grouped).map((d) => d.id), [1]);
    assert.deepEqual(documentsInFolder(null, grouped), []);
    assert.deepEqual(groupByFolder([]), {});
  });

  it('counts a folder including its subfolders, for the explorer cards', () => {
    const documents = [
      doc(1, 'Lead'), doc(2, 'Client'), doc(3, 'Follow-up'), doc(4, 'CPR'),
      doc(5, 'Sales Contract'), doc(6, 'Sales')
    ];
    const grouped = groupByFolder(documents);
    assert.equal(folderDocuments('sales/crm', grouped).length, 3);
    assert.equal(folderDocuments('sales', grouped).length, 6);
    // the repository root rolls up everything below it
    assert.equal(folderDocuments('insideerp', grouped).length, 6);
    // a family counts everything below it, so its card never under-reports
    assert.equal(folderDocuments('sales/execution', grouped).length, 1);
    assert.equal(folderDocuments('sales/cpr', grouped).length, 1);
    assert.equal(folderDocuments('sales/cpr/cpr', grouped).length, 1);
    assert.equal(folderDocuments('sales/execution/contracts', grouped).length, 1);
    assert.equal(folderDocuments('sales/crm/contacts', grouped).length, 0);
    assert.equal(folderDocuments('sales/execution/receipts', grouped).length, 0);
    assert.equal(folderDocuments('sales/cpr/reports', grouped).length, 0);
  });

  it('leaves no document behind: every row reaches a real folder exactly once', () => {
    const documents = [
      doc(1, 'Lead'), doc(2, 'Client'), doc(3, 'Follow-up'), doc(4, 'CPR'),
      doc(5, 'Sales Contract'), doc(6, 'Sales'), doc(7, 'Finance'),
      doc(8, 'Cost Workout'), doc(9, 'Profit Workout'), doc(10, 'CPR Technical Verification'),
      doc(11, 'Quotation'), doc(12, 'Customer Purchase Order'), doc(13, 'Proforma Invoice'),
      doc(14, 'Delivery Challan'), doc(15, 'Invoice'), doc(16, 'Credit Note'),
      doc(17, 'Payment Receipt'), doc(18, 'CRM')
    ];
    const grouped = groupByFolder(documents);
    // every row landed somewhere real
    for (const id of Object.keys(grouped)) assert.ok(isFolderId(id), id);
    // the family counts add up to the whole listing
    assert.equal(folderDocuments('insideerp', grouped).length, documents.length);
    assert.equal(folderDocuments('sales', grouped).length, documents.length);
    assert.equal(
      folderDocuments('sales/cpr', grouped).length
        + folderDocuments('sales/execution', grouped).length
        + folderDocuments('sales/crm', grouped).length
        + (grouped.sales || []).length,
      documents.length
    );
    // and no row is counted twice
    const placed = SALES_FOLDERS.flatMap((f) => grouped[f.id] || []);
    assert.equal(placed.length, documents.length);
    assert.deepEqual(
      placed.map((d) => d.id).sort((a, b) => a - b),
      documents.map((d) => d.id)
    );
  });

  it('groups by metadata only, so a missing source record cannot hide a document', () => {
    const source = read(FOLDERS);
    // No record lookup anywhere in the grouping: the folder comes from `module`.
    assert.doesNotMatch(source, /leadId|clientId|relatedRecordId|fetch|api/);
    const orphan = doc(10, 'Sales Contract', { relatedRecordId: null, recordNumber: null });
    assert.equal(folderIdForDocument(orphan), 'sales/execution/contracts');
    assert.equal(groupByFolder([orphan])['sales/execution/contracts'].length, 1);
  });
});

describe('the Documents page renders the explorer over existing data', () => {
  const page = read(PAGE);

  it('reads the existing repository endpoint twice: the Sales scope and the Local Doc marker', () => {
    assert.match(page, /documentService\.listForSelection\(/);
    assert.match(page, /scope: DOCUMENT_SCOPE/);
    assert.match(page, /import \{[\s\S]{0,60}DOCUMENT_SCOPE/);
    // The scope value itself is the module's shared constant.
    assert.match(read('src/utils/documentView.js'), /export const DOCUMENT_SCOPE = 'sales';/);
    // Local Doc is the same listing with the upload marker as the module filter —
    // no second endpoint, no client-side guess about which row is local.
    assert.match(page, /fetchAll\(\{ module: LOCAL_UPLOAD_MODULE \}\)/);
    assert.match(page, /documents: \[\.\.\.erp\.documents, \.\.\.local\.documents\.filter\(isActiveDocument\)\]/);
    // The scoped read already drops terminal rows in SQL; the unscoped Local
    // Doc read applies the backend's own active-row rule to its own set.
    assert.match(page, /isActiveDocument/);
  });

  it('renders folders, breadcrumbs and back navigation', () => {
    assert.match(page, /folderChildren\(/);
    assert.match(page, /folderTrail\(/);
    assert.match(page, /goToFolder/);
    assert.match(page, /doc-folder-card/);
    assert.match(page, /doc-crumb-link/);
    assert.match(page, /doc-crumb-back/);
    // the open folder is part of the URL, so Back/Forward and deep links work
    assert.match(page, /useSearchParams\(\)/);
    assert.match(page, /next\.set\('folder', id\)/);
  });

  it('reuses the existing document actions instead of inventing new ones', () => {
    assert.match(page, /previewRouteFor\(doc\)/);
    assert.match(page, /getModuleRoute\(doc\?\.module, doc\?\.relatedRecordId\)/);
    assert.match(page, /documentService\.downloadFile\(doc\)/);
    assert.match(page, /documentService\.hasStoredFile\(doc\)/);
    // permissions from the API decide whether an action is offered
    assert.match(page, /doc\.canView !== false/);
    assert.match(page, /doc\.canDownload !== false/);
  });

  it('provides loading, empty and error states', () => {
    assert.match(page, /doc-table-loading/);
    assert.match(page, /No documents in this folder/);
    assert.match(page, /Could not load documents/);
    assert.match(page, /doc-empty-action/);
  });

  it('never fabricates documents and never re-uploads existing ones', () => {
    // No hardcoded rows: every rendered row comes from the fetched listing.
    assert.doesNotMatch(page, /const (MOCK|SAMPLE|DEMO)_?\w*\s*=\s*\[/i);
    assert.doesNotMatch(page, /FakeDocument|dummyDocuments/i);
    assert.ok(!/localStorage|sessionStorage/.test(page), 'no client-side document storage');
    // One source of rows only.
    assert.match(page, /setDocuments\(rows\)/);
    // One upload entry point only: the header action, which opens the native
    // picker directly (the old source-selection step is gone).
    assert.match(page, /const handleUploadDocument = \(\) => \{\s*if \(uploading\) return;\s*uploadInputRef\.current\?\.click\(\);\s*\};/);
    assert.doesNotMatch(page, /handleChooseLocalDevice|handleChooseInsideErp/);
    assert.doesNotMatch(page, /Where does the document come from\?/);
  });

  it('keeps the existing upload and refresh actions intact', () => {
    assert.match(page, /documentService\.upload\(formData\)/);
    // a local upload carries the Local Doc marker, so it lands in Local Doc
    assert.match(page, /formData\.append\('module', LOCAL_UPLOAD_MODULE\)/);
    assert.match(page, /onClick=\{handleRefresh\}/);
    assert.match(page, /onClick=\{handleUploadDocument\}/);
    assert.match(page, /accept=\{ACCEPT_STRING\}/);
    assert.match(page, /fileRejectionReason\(file, UPLOAD_MAX_SIZE_MB\)/);
  });

  it('stays inside the Sales documents surface', () => {
    // No other module's API is called from this page.
    const services = [...page.matchAll(/documentService\.(\w+)\(/g)].map(([, name]) => name);
    assert.ok(services.length > 0);
    assert.deepEqual(
      [...new Set(services)].sort(),
      ['delete', 'downloadFile', 'hasStoredFile', 'listForSelection', 'upload']
    );
  });
});
