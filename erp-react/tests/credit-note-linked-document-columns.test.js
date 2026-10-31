/**
 * tests/credit-note-linked-document-columns.test.js
 * ------------------------------------------------------------------
 * Credit Notes · linked-document table columns.
 *
 * The Credit Notes list has to show CPO No., Dispatch Date, Destination Reached
 * Date, Terms, Due Date and Due Date Exceeded. None of them may be invented
 * locally: every value is resolved by the backend from the documents the credit
 * note really points at (the CPO it traces back to, the Delivery Challan that
 * shipped it, its source invoice) or stored on the note itself. This test locks
 * in the wiring:
 *
 *   COLUMNS   the six columns exist in the credit-note list config, with the
 *             module's own keys, labels and widths, and the list remains wide
 *             enough (tableMinWidth) for them
 *   SOURCES   each cell reads its own payload field (cpoNo / dispatchDate /
 *             destinationReachedDate / terms / dueDate / dueDateExceeded) and
 *             falls back to the module's empty-value dash
 *   OVERDUE   the indicator renders the backend's authoritative boolean as the
 *             shared status pill (Overdue / Not Overdue)
 *   SORTABLE  all six columns are sortable, and the four derived ones
 *             (cpoNo / dispatchDate / dueDate / dueDateExceeded) rely on the
 *             SERVER to order them on the resolved values — the grid never
 *             sorts a page locally, which would order only the rows in hand
 *   EDITABLE  the credit note's OWN values are editable on the form and are
 *             submitted by the Credit Note serializer, so they survive save +
 *             reopen: Destination Reached Date, Terms, and the Dispatch Date /
 *             Due Date overrides
 *   FORM      the create/edit form shows all six fields: Dispatch Date and Due
 *             Date as date controls (showing the override when one is saved,
 *             otherwise the resolved value) plus Destination Reached Date as a
 *             date control, while the two with no override — CPO No. (the
 *             document relationship) and Due Date Exceeded (a calculation) —
 *             stay read-only. None of the RESOLVED values is in the payload
 *   OVERRIDE  the two overridable dates are stored on the credit note itself
 *             (`dispatch_date_override` / `due_date_override`) and REPLACE the
 *             resolved value while the linked documents stay untouched — so the
 *             derived overdue flag reads the authoritative date and a saved
 *             override cannot be destroyed by a later source-document change
 *   VIEW      the detail page shows the same six values
 *   EXPORT    the server-side CSV carries the same columns, so search / export
 *             agree with the table
 *
 * Run: node --test tests/credit-note-linked-document-columns.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, '..', rel), 'utf8');

const CONFIG = 'src/config/salesPageConfigs.jsx';
const HELPERS = 'src/utils/salesHelpers.js';
const FORM = 'src/components/SalesForm/CreditNoteFormPage.jsx';
const SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/CreditNoteService.java';

/** The credit-note list config block (list config only, not the view config). */
const listConfig = () =>
  read(CONFIG)
    .split('export const creditNoteListConfig = {')[1]
    .split('export const creditNoteViewConfig')[0];

const viewConfig = () =>
  read(CONFIG)
    .split('export const creditNoteViewConfig = {')[1]
    .split('export const convertRoute')[0];

describe('Credit Notes · linked-document columns', () => {
  it('adds the six columns to the list with the module keys and labels', () => {
    const config = listConfig();
    const expected = [
      ['cpoNo', 'CPO No.'],
      ['dispatchDate', 'Dispatch Date'],
      ['destinationReachedDate', 'Destination Reached Date'],
      ['terms', 'Terms'],
      ['dueDate', 'Due Date'],
      ['dueDateExceeded', 'Due Date Exceeded']
    ];
    for (const [key, label] of expected) {
      const column = config.match(new RegExp(`\\{\\s*key: '${key}'[\\s\\S]{0,400}?\\}`));
      assert.ok(column, `the list must define the ${key} column`);
      assert.match(
        config.slice(config.indexOf(`key: '${key}'`), config.indexOf(`key: '${key}'`) + 400),
        new RegExp(`label: '${label.replace('.', '\\.')}'`),
        `the ${key} column must be labelled '${label}'`
      );
    }
    // The width bump keeps the extra columns from being squashed.
    assert.match(config, /tableMinWidth: 2120,/);
  });

  it('renders every cell from its own payload field, never a local guess', () => {
    const config = listConfig();
    // CPO No. shows the payload's cpoNo through the shared CPO label helper.
    assert.match(config, /key: 'cpoNo', label: 'CPO No\.[\s\S]{0,120}?render: \(row\) => \(row\.cpoNo \? cpoNo\(row\.cpoNo\) : '—'\)/);
    // Dispatch date / destination reached / due date format the payload's own
    // value and fall back to the shared dash.
    assert.match(config, /key: 'dispatchDate', label: 'Dispatch Date'[\s\S]{0,120}?formatDate\(row\.dispatchDate\) \|\| '—'/);
    assert.match(config, /key: 'destinationReachedDate', label: 'Destination Reached Date'[\s\S]{0,140}?formatDate\(row\.destinationReachedDate\) \|\| '—'/);
    assert.match(config, /key: 'dueDate', label: 'Due Date'[\s\S]{0,120}?formatDate\(row\.dueDate\) \|\| '—'/);
    // Terms are the stored text, clipped with the full value in the tooltip.
    assert.match(config, /key: 'terms'[\s\S]{0,220}?row\.terms[\s\S]{0,120}?title=\{row\.terms\}/);
    // Sorting: terms and destination reached date sort on their own stored
    // columns, and the four derived columns (CPO No. / Dispatch Date / Due Date
    // / Due Date Exceeded) are sortable too — the backend orders them on the
    // same resolved values the cells show (see the Credit Notes sort test in
    // SalesExecApiTest). The grid only sends the key; it never sorts a page on
    // its own.
    for (const key of ['cpoNo', 'dispatchDate', 'destinationReachedDate', 'terms', 'dueDate', 'dueDateExceeded']) {
      const from = config.indexOf(`key: '${key}'`);
      assert.ok(from >= 0, `the ${key} column must exist`);
      const next = config.indexOf("key: '", from + 1);
      const column = config.slice(from, next === -1 ? undefined : next);
      assert.match(column, /sortable: true/, `the ${key} column must be sortable`);
    }
  });

  it('shows the overdue indicator as the shared status pill', () => {
    const config = listConfig();
    assert.match(config, /key: 'dueDateExceeded'[\s\S]{0,400}?<SalesStatusBadge status=\{row\.dueDateExceeded \? 'Overdue' : 'Not Overdue'\} \/>/);
    assert.match(read(CONFIG), /import SalesStatusBadge from '\.\.\/components\/SalesTable\/SalesStatusBadge';/);
    // The pill itself understands both labels (the shared StatusBadge mapping).
    const badge = read('src/components/Common/StatusBadge.jsx');
    assert.match(badge, /overdue: 'yellow',/);
  });

  it('keeps Destination Reached Date editable and submitted by the form', () => {
    const form = read(FORM);
    assert.match(form, /<label className=\{labelCls\}>Destination Reached Date<\/label>/);
    assert.match(form, /value=\{form\.destinationReachedDate \|\| ''\}/);
    assert.match(form, /onChange=\{\(e\) => setField\('destinationReachedDate', e\.target\.value\)\}/);
    // The serializer the Credit Note form posts with carries the field, so the
    // value survives save + reopen.
    const serialize = read(HELPERS).split('export function serializeCreditNote')[1].split('export const SERIALIZERS')[0];
    assert.match(serialize, /destinationReachedDate: form\.destinationReachedDate,/);
  });

  it('shows all six fields on the create/edit form with the right editability', () => {
    const form = read(FORM);

    // ---- the note's OWN fields: editable controls --------------------------
    // Destination Reached Date is a date input the user can change.
    assert.match(form, /<label className=\{labelCls\}>Destination Reached Date<\/label>/);
    assert.match(form, /value=\{form\.destinationReachedDate \|\| ''\}/);
    assert.match(form, /onChange=\{\(e\) => setField\('destinationReachedDate', e\.target\.value\)\}/);
    // Terms are editable in the Terms & Conditions section (existing workflow).
    assert.match(form, /<label className=\{labelCls\}>Terms &amp; Conditions<\/label>/);
    assert.match(form, /value=\{form\.terms \|\| ''\}/);
    assert.match(form, /onChange=\{\(e\) => setField\('terms', e\.target\.value\)\}/);

    // ---- the two OVERRIDABLE linked dates: editable date controls ---------
    // Each control shows the effective value — the saved override when there is
    // one, otherwise what the backend resolved — and marks it as an override.
    assert.match(form, /<label className=\{labelCls\}>Dispatch Date<\/label>[\s\S]{0,60}?<ManualOverrideBadge \/>/);
    assert.match(form, /type="date"\s*value=\{form\.dispatchDateOverride \|\| form\.resolvedDispatchDate \|\| ''\}\s*onChange=\{\(e\) => setField\('dispatchDateOverride', e\.target\.value\)\}/);
    assert.match(form, /<label className=\{labelCls\}>Due Date<\/label>[\s\S]{0,60}?<ManualOverrideBadge \/>/);
    assert.match(form, /type="date"\s*value=\{form\.dueDateOverride \|\| form\.resolvedDueDate \|\| ''\}\s*onChange=\{\(e\) => setField\('dueDateOverride', e\.target\.value\)\}/);
    // "Use the linked date" falls back to the AUTOMATIC value the API reports
    // separately, so the overridden date never stays on screen labelled
    // "Automatic" after the override is cleared.
    assert.match(form, /: form\.resolvedDispatchDate\s*\? 'Automatic — from the linked Delivery Challan\.'/);
    assert.match(form, /: form\.resolvedDueDate\s*\? 'Automatic — from the linked Invoice, else the linked CPO\.'/);
    // Clearing an override hands the cell back to the linked document.
    assert.match(form, /onClick=\{\(\) => setField\('dispatchDateOverride', ''\)\}/);
    assert.match(form, /onClick=\{\(\) => setField\('dueDateOverride', ''\)\}/);

    // ---- the two fields that have NO override: displayed, read-only -------
    // CPO No. IS the document relationship, and Due Date Exceeded is derived
    // from the date above — neither may be typed over.
    assert.match(form, /<label className=\{labelCls\}>CPO No\.<\/label>\s*<div className=\{readonlyBoxCls\}>\{form\.cpoNo \? cpoNo\(form\.cpoNo\) : '—'\}<\/div>/);
    assert.match(form, /<label className=\{labelCls\}>Due Date Exceeded<\/label>[\s\S]{0,160}?<SalesStatusBadge status=\{form\.dueDateExceeded \? 'Overdue' : 'Not Overdue'\} \/>/);
    assert.ok(!/<TextInput[\s\S]{0,200}?cpoNo/.test(form), 'CPO No. must stay read-only');
    assert.ok(!/<TextInput[\s\S]{0,200}?dueDateExceeded/.test(form),
      'Due Date Exceeded must stay derived, never typed over');
    // The display helper the list and the detail page use is the same one here.
    assert.match(form, /import \{ SERIALIZERS, cpoNo, withoutDiscount \} from '\.\.\/\.\.\/utils\/salesHelpers';/);

    // No derived value is editable anywhere: only the note's own fields are
    // wired to setField.
    for (const derived of ['cpoNo', 'dueDateExceeded']) {
      assert.ok(!new RegExp(`setField\\('${derived}'`).test(form),
        `${derived} is derived and must not be editable on the form`);
    }

    // ---- none of them is ever submitted -----------------------------------
    // The payload carries the note's own fields only, so a derived value can
    // never be stored on the credit note or overwrite the document that owns it.
    const serialize = read(HELPERS).split('export function serializeCreditNote')[1].split('export const SERIALIZERS')[0];
    assert.match(serialize, /destinationReachedDate: form\.destinationReachedDate,/);
    // The two overrides ARE submitted (that is how they persist and how clearing
    // one — an empty value, dropped by clean() — removes it again).
    assert.match(serialize, /dispatchDateOverride: form\.dispatchDateOverride,/);
    assert.match(serialize, /dueDateOverride: form\.dueDateOverride,/);
    assert.match(serialize, /terms: form\.terms,/);
    for (const resolved of ['cpoNo', 'dispatchDate', 'dueDate', 'dueDateExceeded']) {
      assert.ok(!new RegExp(`${resolved}:`).test(serialize),
        `${resolved} must never be part of the credit-note payload`);
    }

    // ---- edit loading reaches all six -------------------------------------
    // The edit loader takes every field the API returns and trims only the
    // date-like ones to their date part, so the note's own date and terms — and
    // the four resolved values — all reach the form state on opening a record.
    const loader = form
      .split('// Load an existing Credit Note (edit mode)')[1]
      .split('// ---- restore unsaved draft')[0];
    assert.match(loader, /Object\.keys\(raw\)\.forEach\(\(key\) => \{/);
    assert.match(loader, /DATE_KEYS\.has\(key\) \|\| \/Date\$\/\.test\(key\)/);
    assert.match(loader, /toForm\[key\] = raw\[key\]\.slice\(0, 10\)/);
    assert.match(loader, /setForm\(\(prev\) => \(\{ status: prev\.status, \.\.\.toForm \}\)\)/);
  });

  it('shows the same six values on the credit-note detail page', () => {
    const config = viewConfig();
    for (const label of ['CPO No.', 'Dispatch Date', 'Destination Reached Date', 'Due Date', 'Due Date Exceeded']) {
      assert.match(config, new RegExp(`\\['${label.replace('.', '\\.')}',`), `the view must show ${label}`);
    }
    assert.match(config, /\['CPO No\.', doc\.cpoNo \? cpoNo\(doc\.cpoNo\) : '—'\]/);
    assert.match(config, /\['Due Date Exceeded', <SalesStatusBadge key="dd" status=\{doc\.dueDateExceeded \? 'Overdue' : 'Not Overdue'\} \/>\]/);
    // Terms are already part of the credit note's own document sections, so the
    // view does not duplicate them as a row.
    assert.ok(!/\['Terms',/.test(config));
  });

  it('exports the same columns from the backend and resolves them from real links', () => {
    const service = read(SERVICE);
    assert.match(service, /sb\.append\("Credit Note No,Date,Client,Reason,Status,Items,Amount,CPO No,Dispatch Date,"\s*\+ "Destination Reached Date,Terms,Due Date,Due Date Exceeded,Created\\n"\)/);
    // CPO No. is resolved through the linked documents, never copied blindly.
    assert.match(service, /import com\.vishatech\.erp\.entity\.SalesOrder;/);
    assert.match(service, /private record LinkInfo\(String cpoNo, String dispatchDate, String resolvedDispatchDate,\s*String dueDate, String resolvedDueDate, boolean dueDateExceeded\) \{\}/);
    // The overdue rule: due date passed, still outstanding, source not paid.
    assert.match(service, /boolean exceeded = dueDate != null[\s\S]{0,200}?&& !settled[\s\S]{0,80}?&& !sourceFullyPaid;/);
    assert.match(service, /boolean sourceFullyPaid = invoice != null && isFullyPaidInvoice\(invoice\);/);
  });

  it('keeps the two linked-date overrides on the credit note and out of the linked documents', () => {
    // ---- the note's own nullable columns ----------------------------------
    // Nullable on purpose: null means "resolve it from the linked document", so
    // every existing note keeps behaving exactly as before.
    const entity = read('erp-backend/src/main/java/com/vishatech/erp/entity/CreditNote.java');
    assert.match(entity, /private LocalDateTime dispatchDateOverride;/);
    assert.match(entity, /private LocalDateTime dueDateOverride;/);

    // ---- they travel on the EXISTING update payload ------------------------
    // No new endpoint: the ordinary Credit Note request/response carry them, and
    // the serializer above submits them only while the user has one.
    const request = read('erp-backend/src/main/java/com/vishatech/erp/dto/CreditNoteRequest.java');
    const response = read('erp-backend/src/main/java/com/vishatech/erp/dto/CreditNoteResponse.java');
    assert.match(request, /String dispatchDateOverride,/);
    assert.match(request, /String dueDateOverride,/);
    assert.match(response, /String dispatchDateOverride,/);
    assert.match(response, /String dueDateOverride,/);
    // The automatic values travel SEPARATELY from the effective ones, so the
    // form can show the linked date again the moment an override is cleared.
    assert.match(response, /String resolvedDispatchDate,/);
    assert.match(response, /String resolvedDueDate,/);

    const service = read(SERVICE);
    assert.match(service, /cn\.setDispatchDateOverride\(parseDate\(request\.dispatchDateOverride\(\)\)\);/);
    assert.match(service, /cn\.setDueDateOverride\(parseDate\(request\.dueDateOverride\(\)\)\);/);

    // ---- an override REPLACES the resolved value, a null one keeps it ------
    // Dispatch: the linked challan's date is what is shown until the note has an
    // override of its own; the challan itself is only ever read.
    assert.match(service, /String resolvedDispatchDate = challan == null \|\| challan\.getDispatchDate\(\) == null[\s\S]{0,120}?String dispatchDate = cn\.getDispatchDateOverride\(\) == null[\s\S]{0,120}?resolvedDispatchDate : cn\.getDispatchDateOverride\(\)\.toLocalDate\(\)\.toString\(\);/);
    // Due date: the AUTOMATIC value is resolved first (invoice due date, else the
    // CPO's delivery date — the resolution order is unchanged) and the override,
    // when present, is what the effective date becomes.
    assert.match(service, /LocalDate resolvedDueDate = null;[\s\S]{0,160}?if \(invoice != null && invoice\.getDueDate\(\) != null\) \{[\s\S]{0,200}?else if \(order != null && order\.getDeliveryDate\(\) != null\) \{[\s\S]{0,200}?LocalDate dueDate = cn\.getDueDateOverride\(\) != null/);
    // The resolver only ever READS the linked repositories (no save/update of a
    // challan, invoice or CPO anywhere in the linked-document path).
    const linkPath = service.split('private LinkInfo linkInfo(CreditNote cn, LinkLookups lookups)')[1]
      .split('return new LinkInfo(')[0];
    assert.ok(!/(\.save\(|\.saveAll\(|\.delete\()/.test(linkPath),
      'resolving the linked dates must never write to the linked documents');

    // ---- the derived flag keeps reading the authoritative date -------------
    // Due Date Exceeded is measured against the (possibly overridden) due date
    // above plus the settlement state — it is never a stored, hand-set value.
    assert.match(service, /boolean exceeded = dueDate != null[\s\S]{0,220}?&& !settled[\s\S]{0,80}?&& !sourceFullyPaid;/);
    assert.ok(!/setDueDateExceeded|dueDateExceeded\s*=\s*[^=]/.test(service),
      'dueDateExceeded must stay derived, never assigned from a field');

    // ---- and there is no override for the two that must not have one -------
    assert.ok(!/cpoNoOverride|dueDateExceededOverride|setDueDateExceeded/.test(entity + request + response + service),
      'CPO No. is the document relationship and Due Date Exceeded is a calculation');

    // ---- the migration is additive and re-runnable -------------------------
    const migration = read('erp-backend/docs/credit_note_linked_date_overrides.sql');
    assert.match(migration, /ALTER TABLE credit_notes ADD COLUMN dispatch_date_override datetime\(6\) NULL/);
    assert.match(migration, /ALTER TABLE credit_notes ADD COLUMN due_date_override datetime\(6\) NULL/);
    assert.match(migration, /IF\(\s*@has_dispatch_override = 0,/);
    assert.ok(!/DROP|TRUNCATE|DELETE|UPDATE /i.test(migration), 'the migration must be additive only');
  });
});
