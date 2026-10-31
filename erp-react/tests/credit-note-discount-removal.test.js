/**
 * tests/credit-note-discount-removal.test.js
 * ------------------------------------------------------------------
 * Credit Note creation has NO Discount feature any more.
 *
 * The Discount % column is gone from the Credit Note Items table, together with
 * its edit control / discount input, its Manage Columns entry and the header
 * Discount % input on the Totals card; a Credit Note line is priced at
 * qty × rate and the taxable value is the Sub Total itself.
 *
 * This suite is the *wiring* half of the proof (source assertions, node's test
 * runner). The behavioural halves — line/total math, the item normalizer, the
 * save payload and the detail Taxable Amount resolver — live next to the code
 * they cover (`src/utils/creditNoteDiscount.test.js`,
 * `src/utils/creditNoteTaxableAmount.test.js`) and run with `npm run test:unit`.
 *
 * LEGACY POLICY (see CREDIT_NOTE_TAXABLE_AND_LEGACY_DISCOUNT_REPORT.md): a new
 * Credit Note stays discount-free, while an existing note that stored a genuine
 * historical discount is never normalized on load and is re-submitted with the
 * very same values, so opening/editing cannot flatten stored history.
 *
 *   COLUMNS     the credit-note column set has no `discount` column, while
 *               every other variant's column set is untouched
 *   MANAGECOLS  a stored credit-note configuration cannot bring the column back
 *               (useManagedGrid prunes it AND rewrites the saved config), and no
 *               discount cell / input is rendered at all
 *   PAGE        the creation form never feeds a discount into the calculation
 *               and never submits one; draft / save / submit-approval intact
 *   SURFACES    the CN preview / print / PDF sheets omit a zero Discount row,
 *               while a legacy note that stored a real discount still shows it
 *   SCOPE       the shared grids / printers / calc engine keep discount support
 *               for the other document types (quotation, invoice, proforma, …)
 *
 * Run: node --test tests/credit-note-discount-removal.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SALES_ITEM_ORDER, defaultSalesItemsColumns } from '../src/utils/salesItemsColumns.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const COLUMNS = 'src/utils/salesItemsColumns.js';
const GRID = 'src/components/SalesForm/SalesItemGrid.jsx';
const TOTALS = 'src/components/SalesForm/SalesTotals.jsx';
const PAGE = 'src/components/SalesForm/CreditNoteFormPage.jsx';
const HELPERS = 'src/utils/salesHelpers.js';
const MANAGED_GRID = 'src/hooks/useManagedGrid.js';
const DETAIL_COLUMNS = 'src/utils/detailColumns.js';
const DESIGN = 'src/components/SalesDesign/SalesDocumentDesign.jsx';
const DESIGN_CONFIGS = 'src/config/salesDesignConfigs.jsx';
const PRINT_UTILS = 'src/utils/salesPrintUtils.js';
const VIEW_PAGE = 'src/components/SalesDetail/SalesViewPage.jsx';
const PAGE_CONFIGS = 'src/config/salesPageConfigs.jsx';

const keysOf = (variant) => defaultSalesItemsColumns({ variant }).map((c) => c.key || c.id);

describe('Credit Note creation · discount removed — columns', () => {
  it('the credit-note column set has no discount column', () => {
    assert.ok(!SALES_ITEM_ORDER.creditNote.includes('discount'));
    assert.deepEqual(keysOf('creditNote'), [
      'sno', 'desc', 'hsn', 'qty', 'unit', 'rate', 'gst', 'taxable', 'total', 'actions'
    ]);
    const discountCol = defaultSalesItemsColumns({ variant: 'creditNote' })
      .find((c) => c.key === 'discount' || c.id === 'discount');
    assert.equal(discountCol, undefined);
  });

  it('the remaining columns stay ordered, labelled, sized and gapless', () => {
    const cols = defaultSalesItemsColumns({ variant: 'creditNote' });
    assert.deepEqual(cols.map((c) => c.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    cols.forEach((c) => {
      assert.ok(Number(c.width) > 0, `${c.key} keeps a width`);
      assert.ok(String(c.label || '').trim().length > 0, `${c.key} keeps a label`);
      assert.notEqual(c.label, 'Discount %');
    });
    // The GST / taxable / total columns are still computed (never free-edited).
    ['gst', 'taxable', 'total'].forEach((key) => {
      assert.equal(cols.find((c) => c.key === key).type, 'computed');
    });
  });

  it('the grid prunes the discount column for the credit-note variant only', () => {
    const grid = read(GRID);
    assert.match(grid, /const excludedColumnKeys = isCreditNote \? \['discount'\] : \[\];/);
    assert.match(grid, /excludeKeys: excludedColumnKeys,/);
    // variantKey for the credit-note grid → the shared sales.items.creditNote key
    assert.match(grid, /gridKey: `sales\.items\.\$\{variantKey\}`/);
    assert.match(grid, /const isCreditNote = variantKey === 'creditNote';/);
    // …and 'discount' is the only excluded column, for the credit note only.
    assert.deepEqual(grid.match(/excludedColumnKeys = [^;]+/g), [
      "excludedColumnKeys = isCreditNote ? ['discount'] : []"
    ]);
  });

  it('there is no discount cell / discount input left in the shared items grid', () => {
    const grid = read(GRID);
    assert.ok(!grid.includes("case 'discount'"), 'the discount column cell is gone');
    assert.ok(!grid.includes('it-td-discount'), 'no discount cell class remains in this grid');
  });

  it('the column model documents the removal in one place', () => {
    const source = read(COLUMNS);
    assert.match(
      source,
      /creditNote: \['sno', 'desc', 'hsn', 'qty', 'unit', 'rate', 'gst', 'taxable', 'total', 'actions'\]/
    );
    assert.match(source, /`creditNote` deliberately carries NO `discount` column/);
  });
});

describe('Credit Note creation · discount removed — Manage Columns', () => {
  it('a stored configuration cannot re-enable the column (pruned AND re-saved)', () => {
    const hook = read(MANAGED_GRID);
    assert.match(hook, /excludeKeys = \[\]/);
    assert.match(hook, /if \(!excludeKeys\.length\) return store\.columns;/);
    assert.match(hook, /store\.columns\.filter\(\(c\) => !excludeKeys\.includes\(c\.id \|\| c\.key\)\)/);
    // …and the cleanup is written back, so the ghost column leaves MySQL too.
    assert.match(hook, /store\.setColumns\(storedColumns\);/);
  });

  it('the read-only credit-note detail table follows the same column set', () => {
    const columns = read(DETAIL_COLUMNS);
    const set = columns.split('creditNoteItems:')[1].split('},')[0];
    assert.match(set, /gridKey: 'sales\.items\.creditNote'/);
    assert.match(set, /defaultSalesItemsColumns\(\{ variant: 'creditNote'/);
    assert.ok(!set.includes('discount'));
  });

  it('the detail Taxable Amount resolver reads the field the CN API returns', () => {
    const columns = read(DETAIL_COLUMNS);
    // `netAmount` is what CreditNoteItemResponse returns (= gross − discount);
    // `taxable`/`taxableAmount` stay first and a real 0 is never replaced.
    assert.match(
      columns,
      /taxable: \(row, ctx\) => ctxFormat\(ctx, 'money', row\.taxable \?\? row\.taxableAmount \?\? row\.netAmount \?\? 0\)/
    );
    assert.ok(!/taxable: \(row, ctx\) => ctxFormat\(ctx, 'money', row\.taxable \|\|/.test(columns));
    // Behavioural proof lives next to the resolver:
    // src/utils/creditNoteTaxableAmount.test.js (vitest).
  });
});

describe('Credit Note creation · discount removed — page & totals wiring', () => {
  it('the Totals card has no discount INPUT and only prints a real discount', () => {
    const totals = read(TOTALS);
    const cnBranch = totals.split('} else if (creditNote) {')[1].split('} else if (percentageDiscount)')[0];
    assert.deepEqual(
      cnBranch.match(/\['[^']+'/g).map((s) => s.slice(2, -1)),
      ['Sub Total', 'Discount', 'Taxable Value', 'Additional Charges']
    );
    // …and that Discount row is conditional: a discount-free note shows none.
    assert.match(cnBranch, /\.\.\.\(cnDiscount > 0/);
    // Taxable value = Sub Total − the record's OWN historical discounts.
    assert.match(totals, /const cnTaxable = creditNote \? round2\(Number\(t\.subTotal\) - cnDiscount\) : 0;/);
    assert.match(totals, /const cnLineDisc = creditNote/);
    assert.match(totals, /const cnHeaderDisc = creditNote \? round2\(Number\(t\.subTotal\) \* \(pct \/ 100\)\) : 0;/);
    // Nothing is user-editable for a credit note: no discount input, no handler.
    assert.ok(!/onDiscountChange=\{\(v\) => setField\('discountPct'/.test(read(PAGE)));
    // The discount input is skipped for the credit note (charges input stays).
    assert.match(totals, /\{!creditNote && \(/);
    assert.match(totals, /onChargesChange\?\.\(e\.target\.value\)/);
    // …while every other variant keeps its own discount input / rows.
    assert.match(totals, /const discountLabel = percentageDiscount \|\| exportMode \? 'Discount \(%\)'/);
    assert.match(totals, /baseRows\.splice\(1, 0, \['Discount', fmt\(flatDiscountValue, currency\)\]\);/);
  });

  it('GST handling (CGST/SGST vs IGST) is preserved for the credit note', () => {
    const totals = read(TOTALS);
    assert.match(totals, /\['Taxable Value', fmt\(cnTaxable, currency\)\]/);
    assert.match(
      totals,
      /\[isIgst \? 'GST \(IGST\)' : 'GST \(CGST \+ SGST\)', fmt\(t\.taxTotal, currency\)\]/
    );
    const grid = read(GRID);
    assert.match(
      grid,
      /const GST_SPAN = isExport \|\| isProformaExport \|\| isPackingList \? 0 : isCreditNote \? 1 : 2;/
    );
  });

  it('the credit-note page normalizes NEW records and leaves legacy lines alone', () => {
    const page = read(PAGE);
    // The record's own historical header discount is passed READ-ONLY…
    assert.match(page, /<SalesTotals\n\s+items=\{items\}\n\s+discountPct=\{form\.discountPct \?\? 0\}/);
    // …with no way to edit it (no change handler anywhere in the page).
    assert.ok(!/setField\('discountPct', v\)/.test(page));
    // Every line entering form state is normalized for a NEW record only: the
    // `isEdit` branch is what keeps a legacy note's stored discount intact.
    assert.match(page, /const list = typeof next === 'function' \? next\(prev\) : next;/);
    assert.match(page, /return isEdit \? list : withoutDiscount\(list\);/);
    assert.match(page, /const setItems = useCallback\(/);
    // A discount from a source document is never carried over into the lines.
    assert.equal((page.match(/discountPct: 0/g) || []).length, 2);
    assert.ok(!/discountPct: Number\(it\.discountPct\)/.test(page));
    // A restored draft is a new record: any discount an older draft carries goes.
    assert.match(page, /delete patch\.discountPct;/);
  });

  it('legacy hydration preserves the record instead of zeroing it', () => {
    const page = read(PAGE);
    // The load path only READS the record and stores its lines verbatim…
    assert.match(page, /const raw = res\?\.data \?\? res \?\? \{\};/);
    assert.match(page, /setItems\(Array\.isArray\(raw\.items\) \? raw\.items : \[\]\)/);
    const loadEffect = page.split('// Load an existing Credit Note')[1].split('// ---- restore unsaved draft')[0];
    assert.ok(!loadEffect.includes('service.update'), 'loading never writes back');
    assert.ok(!loadEffect.includes('withoutDiscount'), 'loading never normalizes the discount away');
    // …and the serializer mirrors what it was given (see the unit suite too).
    assert.match(read(HELPERS), /items: mapItems\(items\)\n  \}\);/);
  });

  it('save / draft / submit-approval and validation are unchanged', () => {
    const page = read(PAGE);
    assert.match(page, /const payload = SERIALIZERS\.creditNote\(form, items\);/);
    assert.match(page, /onSaveDraft=\{!isEdit \? \(\) => save\(\{ draft: true \}\) : null\}/);
    assert.match(page, /onSaveNew=\{!isEdit \? \(\) => save\(\{ stay: true \}\) : null\}/);
    assert.match(page, /onSave=\{\(\) => save\(\{ submit: !isEdit \}\)\}/);
    assert.match(page, /onSubmit=\{!isEdit \? \(\) => save\(\{ submit: true \}\) : null\}/);
    assert.match(page, /await service\.postAction\(created\.id, 'issue'\)/);
    assert.match(page, /const validate = \(draft = false\) => \{/);
    assert.match(page, /const statusOptions = config\.statusOptions \|\| config\.statuses \|\| \['Draft'\];/);
    // The edit page still hydrates a saved note (and normalizes its lines).
    assert.match(page, /setItems\(Array\.isArray\(raw\.items\) \? raw\.items : \[\]\)/);
  });

  it('the credit-note serializer mirrors the record (header + lines) unchanged', () => {
    const helpers = read(HELPERS);
    // The generic per-item discount mapping (quotation / invoice / …) stays.
    assert.match(
      helpers,
      /discountPct: item\.discountPct != null && item\.discountPct !== '' \? Number\(item\.discountPct\) : 0/
    );
    const cn = helpers.split('export function serializeCreditNote')[1].split('export const SERIALIZERS')[0];
    // Lines are mapped as-is — no credit-note-specific zeroing — and the header
    // discount travels with them, so an edit cannot flatten stored history.
    assert.match(cn, /items: mapItems\(items\)\n  \}\);/);
    assert.match(cn, /discountPct: form\.discountPct != null && form\.discountPct !== '' \? Number\(form\.discountPct\) : 0,/);
    assert.ok(!cn.includes('discountPct: 0 }\)\)'), 'the serializer no longer forces 0');
  });
});

describe('Credit Note creation · discount removed — other document types', () => {
  it('every other document type keeps its own column set', () => {
    assert.deepEqual(keysOf('invoice'), SALES_ITEM_ORDER.invoice);
    assert.deepEqual(keysOf('proforma'), SALES_ITEM_ORDER.proforma);
    assert.deepEqual(keysOf('export'), SALES_ITEM_ORDER.export);
    assert.deepEqual(keysOf('proformaExport'), SALES_ITEM_ORDER.proformaExport);
    assert.deepEqual(keysOf('packingList'), SALES_ITEM_ORDER.packingList);
    assert.deepEqual(keysOf('default'), SALES_ITEM_ORDER.default);
  });

  it('the legacy discount-capable grids and design canvases remain intact', () => {
    const grid = read(GRID);
    // DefaultItemsGrid (used by other modules) keeps its Disc % input.
    assert.match(grid, /onChange=\{\(e\) => updateRow\(idx, \{ discountPct: e\.target\.value \}\)\}/);
    assert.match(grid, /\{calc\.discountPct\}%/);
    // Quotation / CPO design canvases keep their DISC % column.
    const design = read(DESIGN);
    assert.match(design, /renderItemGrid\(\{ showDisc: true \}\)/);
    assert.match(design, /renderItemGrid\(\{ showDisc: true, forceFinance: true \}\)/);
    assert.match(design, /const discountSign = Number\(totals\.discount\) > 0 \? '− ' : '';/);
  });
});

describe('Credit Note creation · discount removed — preview / print / PDF', () => {
  it('the credit-note sheet omits a zero Discount row, gated by its own config', () => {
    assert.match(read(DESIGN_CONFIGS), /hideZeroDiscountRow: true,/);
    const design = read(DESIGN);
    assert.match(
      design,
      /const showDiscountRow = !\(config\.hideZeroDiscountRow === true && !\(Number\(totals\.discount\) > 0\)\);/
    );
    assert.match(
      design,
      /\.\.\.\(showDiscountRow \? \[\['Discount', `\$\{discountSign\}\$\{money\(totals\.discount\)\}`\]\] : \[\]\)/
    );
  });

  it('the credit-note detail page omits the same zero row', () => {
    const configs = read(PAGE_CONFIGS);
    const cnView = configs.split('export const creditNoteViewConfig = {')[1].split('};')[0];
    assert.match(cnView, /hideZeroDiscountRow: true,/);
    const view = read(VIEW_PAGE);
    assert.match(view, /\.\.\.|\(config\.hideZeroDiscountRow === true && !\(Number\(totals\.discount\) > 0\)\)/);
    // Only the credit-note configs opt in (the design config + this view config).
    assert.equal(
      (read(DESIGN_CONFIGS).match(/hideZeroDiscountRow: true,/g) || []).length +
        (configs.match(/hideZeroDiscountRow: true,/g) || []).length,
      2
    );
    // The sidebar totals already hid a zero discount row for every module.
    // (`Row` also takes an optional version-comparison `change` prop, so the
    // assertion allows — but does not require — props between the label and the
    // closing bracket.)
    assert.match(view, /Number\(totals\.discount\) > 0 && <Row label="Discount"[^>]*>/);
  });

  it('the print HTML and the PDF export drop the row for credit notes only', () => {
    const print = read(PRINT_UTILS);
    // Print HTML and the PDF export render the SAME summary rows: the gate
    // lives once in the shared builder instead of being copied into each
    // output, so it covers both surfaces at the same time.
    assert.equal(
      (print.match(/moduleKey === 'creditNote' && !\(Number\(totals\.discount\) > 0\)/g) || []).length,
      1,
      'the Discount row is gated in the shared summary builder'
    );
    assert.match(print, /function summaryRowList\(totals, moduleKey, isIgst, gstLabel, money = docMoney\)/);
    // …and both outputs build their summary from it (print HTML / PDF export).
    assert.match(print, /const summaryRows = summaryRowList\(totals, moduleKey/);
    assert.match(print, /const summaryBody = summaryRowList\(totals, moduleKey, model\.isIgst/);
    // A legacy credit note that stored a real discount still prints it.
    assert.match(
      print,
      /\[\['Discount', `\$\{Number\(totals\.discount\) > 0 \? '-' : ''\}\$\{money\(totals\.discount\)\}`\]\]/
    );
  });
});
