/**
 * tests/sales-documents-filters.test.js
 * ------------------------------------------------------------------
 * Sales → Documents → search + filter above the open folder's table.
 *
 *   HELPERS   the case-insensitive haystack, the filter panel's AND, the date
 *             range, the options a folder offers and the condition counters
 *   CONTRACT  the page narrows the OPEN FOLDER's own documents (never the whole
 *             repository), keeps the search live on every keystroke, repages
 *             from the filtered rows, and restores everything when the
 *             conditions are cleared
 *
 * Run: node --test tests/sales-documents-filters.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EMPTY_FILTERS,
  applyDocumentFilters,
  countActiveFilters,
  documentDate,
  filterOptions,
  hasActiveConditions,
  matchesFilters,
  matchesSearch,
  searchableText,
  storedFileName
} from '../src/utils/documentFilters.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const PAGE = 'src/pages/Documents.jsx';

/** The two rows the real Sales repository actually holds (see the CPR folder). */
const apex = {
  id: 301,
  documentName: 'Cost Workout — Apex Industries',
  documentType: 'Cost Workout',
  module: 'Sales',
  recordNumber: 'CW-2026-000010',
  status: 'uploaded',
  visibility: 'TEAM_ONLY',
  filePath: 'http://localhost:8080/v1/files/34d04875e62c4873808aa7f2c14cee2f.txt',
  fileType: 'text/plain',
  createdAt: '2026-10-10T09:20:00.000000'
};

const cpr = {
  id: 298,
  documentName: 'CPR — LTIMindtree',
  documentType: 'CPR',
  module: 'Sales',
  recordNumber: 'CPR-2026-000002',
  status: 'uploaded',
  visibility: 'TEAM_ONLY',
  filePath: 'http://localhost:8080/v1/files/aa11bb22.pdf',
  fileType: 'application/pdf',
  createdAt: '2026-10-09T11:05:00.000000'
};

const contract = {
  id: 306,
  documentName: 'retry-me-2.txt',
  documentType: 'document',
  module: 'Sales Contract',
  recordNumber: 'SC-2026-000010',
  status: 'uploaded',
  visibility: 'TEAM_ONLY',
  filePath: 'http://localhost:8080/v1/files/9999.txt',
  fileType: 'text/plain',
  createdAt: '2026-10-12T14:16:13.325703'
};

const FOLDER_ROWS = [apex, cpr, contract];

/** A row whose searchable fields contain no "a" at all, for the negative case. */
const noLetterA = {
  id: 400,
  documentName: '99.pdf',
  documentType: 'pdf',
  module: 'Q4',
  recordNumber: 'Q4-1',
  status: 'pending', // "uploaded"/"generated" both carry an a — this one does not
  filePath: '/files/99.pdf',
  createdAt: '2026-10-01T00:00:00'
};

describe('search matches every searchable field, case-insensitively', () => {
  it('reads the stored file name out of any filePath variant', () => {
    assert.equal(storedFileName(apex), '34d04875e62c4873808aa7f2c14cee2f.txt');
    assert.equal(storedFileName({ filePath: '/files/abc.pdf' }), 'abc.pdf');
    assert.equal(storedFileName({ filePath: 'abc.pdf?mode=inline' }), 'abc.pdf');
    // the no-file sentinel is not a name
    assert.equal(storedFileName({ filePath: 'metadata-only' }), '');
    assert.equal(storedFileName({}), '');
    assert.equal(storedFileName(null), '');
  });

  it('matches the required examples', () => {
    // typing "A" keeps only rows whose fields contain an A, whatever the case
    assert.equal(matchesSearch(apex, 'A'), true);
    assert.equal(matchesSearch(apex, 'a'), true);
    assert.equal(matchesSearch(cpr, 'A'), true); // "Sales" module
    assert.equal(matchesSearch(noLetterA, 'A'), false); // nothing carries an a
    assert.equal(matchesSearch(noLetterA, 'a'), false);
    // typing "Apex" finds the Apex document
    assert.equal(matchesSearch(apex, 'Apex'), true);
    assert.equal(matchesSearch(apex, 'apex'), true);
    assert.equal(matchesSearch(cpr, 'Apex'), false);
    // typing "CPR" finds the CPR documents
    assert.equal(matchesSearch(cpr, 'CPR'), true);
    assert.equal(matchesSearch(cpr, 'cpr'), true);
    assert.equal(matchesSearch(apex, 'CPR'), false);
  });

  it('searches the name, type, module, record number and stored file name', () => {
    assert.equal(matchesSearch(cpr, 'LTIMindtree'), true); // document name
    assert.equal(matchesSearch(cpr, 'CPR-2026-000002'), true); // record number
    assert.equal(matchesSearch(apex, 'Cost Workout'), true); // document type
    assert.equal(matchesSearch(contract, 'Sales Contract'), true); // module
    assert.equal(matchesSearch(contract, '9999'), true); // stored file name
    assert.equal(matchesSearch(contract, 'uploaded'), true); // status
    assert.equal(matchesSearch(contract, 'TEAM_ONLY'), true); // visibility
    assert.equal(matchesSearch(contract, 'text/plain'), true); // mime type
  });

  it('treats an empty or whitespace query as no narrowing at all', () => {
    for (const query of ['', '   ', null, undefined]) {
      assert.equal(matchesSearch(contract, query), true, String(query));
    }
    assert.equal(matchesSearch(null, 'x'), false);
    assert.equal(searchableText(null), '');
  });

  it('does not match the uploader account, which every row shares', () => {
    const row = { ...contract, uploadedBy: 'admin@vishaktech.com', uploadedById: 7 };
    // the account email must not make "v"/"k"/"admin" return the whole folder
    assert.equal(matchesSearch(row, 'admin@vishaktech'), false);
    assert.equal(matchesSearch(row, 'vishaktech'), false);
    // while the document's own fields still answer normally
    assert.equal(matchesSearch(row, 'retry'), true);
    assert.equal(searchableText({ ...row, documentName: '' }).includes('vishaktech'), false);
  });

  it('is a plain substring test, so no field can be forgotten', () => {
    assert.equal(matchesSearch(cpr, 'imind'), true);
    assert.equal(matchesSearch(cpr, 'nope'), false);
  });
});

describe('the filter panel narrows by type, module and upload date', () => {
  it('reads the upload date from the row itself', () => {
    assert.equal(documentDate(contract), '2026-10-12');
    assert.equal(documentDate({ createdAt: '' }), '');
    assert.equal(documentDate({}), '');
    assert.equal(documentDate(null), '');
  });

  it('applies only the fields that were actually set', () => {
    assert.equal(matchesFilters(apex, EMPTY_FILTERS), true);
    assert.equal(matchesFilters(apex, { ...EMPTY_FILTERS, type: 'CPR' }), false);
    assert.equal(matchesFilters(cpr, { ...EMPTY_FILTERS, type: 'CPR' }), true);
    assert.equal(matchesFilters(apex, { ...EMPTY_FILTERS, module: 'Sales Contract' }), false);
    assert.equal(matchesFilters(contract, { ...EMPTY_FILTERS, module: 'Sales Contract' }), true);
  });

  it('treats the date range as inclusive and refuses undated rows while it is set', () => {
    const from = { ...EMPTY_FILTERS, from: '2026-10-10' };
    const to = { ...EMPTY_FILTERS, to: '2026-10-10' };
    assert.equal(matchesFilters(apex, from), true);
    assert.equal(matchesFilters(cpr, from), false); // 09 Oct, before the range
    assert.equal(matchesFilters(apex, to), true);
    assert.equal(matchesFilters(contract, to), false); // 12 Oct, after the range
    assert.equal(matchesFilters({ ...apex, createdAt: null }, from), false);
  });

  it('ANDs every set field together', () => {
    const combined = { type: 'CPR', module: 'Sales', from: '2026-10-01', to: '2026-10-31' };
    assert.equal(matchesFilters(cpr, combined), true);
    assert.equal(matchesFilters(apex, combined), false); // wrong type
    assert.equal(matchesFilters(contract, combined), false); // wrong type and module
  });

  it('offers only the choices this folder really holds', () => {
    assert.deepEqual(filterOptions(FOLDER_ROWS).documentTypes, ['Cost Workout', 'CPR', 'document']);
    assert.deepEqual(filterOptions(FOLDER_ROWS).modules, ['Sales', 'Sales Contract']);
    assert.deepEqual(filterOptions([]), { documentTypes: [], modules: [] });
    // a row that carries neither adds no empty option
    assert.deepEqual(filterOptions([{ id: 1, documentType: '', module: '  ' }]), {
      documentTypes: [],
      modules: []
    });
  });

  it('counts what is set and knows when nothing is', () => {
    assert.equal(countActiveFilters(EMPTY_FILTERS), 0);
    assert.equal(countActiveFilters({ ...EMPTY_FILTERS, type: 'CPR' }), 1);
    assert.equal(countActiveFilters({ ...EMPTY_FILTERS, type: 'CPR', from: '2026-10-01' }), 2);
    assert.equal(countActiveFilters(undefined), 0);
    assert.equal(hasActiveConditions('', EMPTY_FILTERS), false);
    assert.equal(hasActiveConditions('   ', EMPTY_FILTERS), false);
    assert.equal(hasActiveConditions('a', EMPTY_FILTERS), true);
    assert.equal(hasActiveConditions('', { ...EMPTY_FILTERS, to: '2026-10-31' }), true);
  });
});

describe('search and filters combine, and clearing restores the folder', () => {
  it('ANDs the search box with the panel', () => {
    assert.deepEqual(
      applyDocumentFilters(FOLDER_ROWS, { query: '', filters: EMPTY_FILTERS }).map((d) => d.id),
      [301, 298, 306]
    );
    assert.deepEqual(
      applyDocumentFilters(FOLDER_ROWS, { query: 'cpr', filters: EMPTY_FILTERS }).map((d) => d.id),
      [298]
    );
    assert.deepEqual(
      applyDocumentFilters(FOLDER_ROWS, { query: '', filters: { ...EMPTY_FILTERS, module: 'Sales' } })
        .map((d) => d.id),
      [301, 298]
    );
    // both conditions must hold
    assert.deepEqual(
      applyDocumentFilters(FOLDER_ROWS, {
        query: 'Apex',
        filters: { ...EMPTY_FILTERS, module: 'Sales' }
      }).map((d) => d.id),
      [301]
    );
    // a search that matches, but a filter that does not
    assert.deepEqual(
      applyDocumentFilters(FOLDER_ROWS, {
        query: 'Apex',
        filters: { ...EMPTY_FILTERS, module: 'Sales Contract' }
      }),
      []
    );
    // clearing everything gives the folder's whole listing back
    assert.equal(applyDocumentFilters(FOLDER_ROWS, { query: '', filters: EMPTY_FILTERS }).length, 3);
  });

  it('preserves the listing order so paging stays stable', () => {
    const rows = applyDocumentFilters(FOLDER_ROWS, { query: 's', filters: EMPTY_FILTERS });
    assert.deepEqual(rows.map((d) => d.id), [301, 298, 306]);
    assert.equal(applyDocumentFilters([], { query: 'x' }).length, 0);
    assert.equal(applyDocumentFilters(undefined, { query: 'x' }).length, 0);
  });

  it('never needs the other folders to answer a query', () => {
    const source = read('src/utils/documentFilters.js');
    // no record lookup, no request, no cross-folder knowledge
    assert.doesNotMatch(source, /fetch|api|relatedRecordId|leadId|clientId/);
  });
});

describe('the Documents page wires the toolbar over the open folder only', () => {
  const page = read(PAGE);

  it('renders a live, case-insensitive search field above the table', () => {
    assert.match(page, /placeholder="Search documents by name, type, source record\.\.\."/);
    // it filters as the user types — no Enter, no submit, no reload
    assert.match(page, /onChange=\{\(event\) => handleQueryChange\(event\.target\.value\)\}/);
    assert.doesNotMatch(page, /onKeyDown|onSubmit=\{handleQueryChange\}/);
  });

  it('offers the four required filter fields', () => {
    for (const label of ['Document Type', 'Source Module', 'Upload Date From', 'Upload Date To']) {
      assert.ok(page.includes(label), `${label} must be offered`);
    }
    assert.match(page, /className="doc-filter-panel"/);
    assert.match(page, /handleFilterField\('type'/);
    assert.match(page, /handleFilterField\('module'/);
    assert.match(page, /handleFilterField\('from'/);
    assert.match(page, /handleFilterField\('to'/);
    assert.match(page, /type="date"/);
  });

  it('narrows the OPEN FOLDER, never the whole repository', () => {
    // the pipeline: grouped repository → this folder's own files → conditions
    assert.match(page, /documentsInFolder\(folderId, grouped\)/);
    assert.match(page, /applyDocumentFilters\(folderDocs, \{ query, filters \}\)/);
    // and every derived slice comes from the FILTERED rows
    assert.match(page, /Math\.ceil\(filteredDocs\.length \/ FOLDER_PAGE_SIZE\)/);
    assert.match(page, /filteredDocs\.slice\(safePage \* FOLDER_PAGE_SIZE/);
    assert.match(page, /Showing \{rangeStart\}–\{rangeEnd\} of \{filteredDocs\.length\}/);
  });

  it('repages whenever a condition changes, and clears back to the folder', () => {
    assert.match(page, /const handleQueryChange = \(value\) => \{\s*setQuery\(value\);[\s\S]{0,120}setPage\(0\);/);
    assert.match(page, /const handleFilterField = \(field, value\) => \{\s*setFilters\([\s\S]{0,120}setPage\(0\);/);
    assert.match(page, /const handleClearConditions = \(\) => \{\s*setQuery\(''\);\s*setFilters\(EMPTY_FILTERS\);\s*setPage\(0\);/);
    // entering another folder drops the conditions that described the old one
    assert.match(page, /const goToFolder = \(id\) => \{[\s\S]{0,400}handleClearConditions\(\);/);
  });

  it('shows the required no-match message instead of an empty folder', () => {
    assert.match(page, /No documents match your search or filters\./);
    assert.match(page, /doc-empty-action[\s\S]{0,200}Clear search and filters/);
    // the genuinely empty folder keeps its own wording
    assert.match(page, /No documents in this folder/);
  });

  it('leaves the table, actions, pagination and upload workflow alone', () => {
    assert.match(page, /documentService\.downloadFile\(doc\)/);
    assert.match(page, /previewRouteFor\(doc\)/);
    assert.match(page, /onClick=\{handleRefresh\}/);
    assert.match(page, /onClick=\{handleUploadDocument\}/);
    assert.match(page, /documentService\.upload\(formData\)/);
    // a local upload carries the Local Doc marker, so it lands in Local Doc
    assert.match(page, /formData\.append\('module', LOCAL_UPLOAD_MODULE\)/);
    assert.match(page, /className="doc-pagination"/);
    assert.match(page, /next\.set\('folder', id\)/);
    // no new endpoint and no second copy of the data
    const services = [...page.matchAll(/documentService\.(\w+)\(/g)].map(([, name]) => name);
    assert.deepEqual(
      [...new Set(services)].sort(),
      ['delete', 'downloadFile', 'hasStoredFile', 'listForSelection', 'upload']
    );
    assert.ok(!/localStorage|sessionStorage/.test(page));
  });
});
