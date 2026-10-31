/**
 * tests/quotation-items-total-column.test.js
 * ------------------------------------------------------------------
 * Create New Quotation → Items grid: the automatic row TOTAL.
 *
 * The items table gained a TOTAL column between AMOUNT and ACTIONS. It is not a
 * new calculation: the row value is the net (base) amount + CGST + SGST, i.e.
 * exactly the per-line math `computeRows()` already produced for the quotation
 * summary block, so the column sums to sub-total + CGST + SGST and the grand
 * total is unchanged (no value is counted twice). Covered here:
 *
 *   POSITION   TOTAL is inserted immediately before ACTIONS, exactly once, with
 *              a duplicate coming from a saved configuration collapsing onto
 *              the structural column instead of appearing twice
 *   CALC       the cell renders `calc.total` (netAmt + cgst + sgst) and AMOUNT
 *              keeps rendering the untouched `calc.netAmt`
 *   PERSISTENCE the column is structural: it is not part of the stored column
 *              configuration the read-only quotation preview / PDF surfaces
 *              resolve their columns from, and nothing about a row total is
 *              sent to the API
 *   SCOPE      the column exists only in the quotation creation form — no other
 *              Sales items grid or module table is affected
 *
 * Run: node --test tests/quotation-items-total-column.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  QUOTATION_ROW_TOTAL_COLUMN,
  defaultQuotationItemColumns,
  withRowTotalColumn
} from '../src/utils/salesItemsColumns.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const FORM = 'src/components/SalesForm/QuotationFormPage.jsx';
const COLUMNS = 'src/utils/salesItemsColumns.js';
const CSS = 'src/pages/sales/quotation-create.css';

/** Minimal stand-in for the grids' managed column list. */
const cols = (...keys) => keys.map((key, i) => ({ id: key, key, label: key, order: i + 1 }));

describe('Quotation items · row TOTAL column', () => {
  it('is inserted immediately before ACTIONS, exactly once', () => {
    const before = cols('sno', 'sku', 'qty', 'unit', 'hsn', 'desc', 'gst', 'rate', 'amount', 'actions');
    const after = withRowTotalColumn(before);

    assert.deepEqual(
      after.map((c) => c.key),
      ['sno', 'sku', 'qty', 'unit', 'hsn', 'desc', 'gst', 'rate', 'amount', 'total', 'actions']
    );
    // AMOUNT stays where it was; only TOTAL and ACTIONS follow it.
    assert.deepEqual(after.slice(-3).map((c) => c.key), ['amount', 'total', 'actions']);
  });

  it('never duplicates the column, even when a saved layout already has one', () => {
    const withTotal = cols('sno', 'amount', 'total', 'actions');
    const again = withRowTotalColumn(withTotal);
    assert.equal(again.filter((c) => c.key === 'total').length, 1);
    assert.deepEqual(again.map((c) => c.key), ['sno', 'amount', 'total', 'actions']);

    // Also idempotent when TOTAL was saved in the wrong (non-actionable) spot.
    const moved = withRowTotalColumn(cols('sno', 'total', 'amount', 'actions'));
    assert.deepEqual(moved.map((c) => c.key), ['sno', 'amount', 'total', 'actions']);
  });

  it('leaves the caller’s column list untouched and keeps TOTAL last without ACTIONS', () => {
    const original = cols('sno', 'amount', 'actions');
    const snapshot = JSON.parse(JSON.stringify(original));
    const result = withRowTotalColumn(original);
    assert.deepEqual(original, snapshot, 'the managed column list must not be mutated');
    assert.notEqual(result, original);

    assert.deepEqual(withRowTotalColumn(cols('sno', 'amount')).map((c) => c.key), ['sno', 'amount', 'total']);
    assert.deepEqual(withRowTotalColumn([]).map((c) => c.key), ['total']);
    assert.deepEqual(withRowTotalColumn(undefined).map((c) => c.key), ['total']);
  });

  it('describes the column as a structural, computed TOTAL', () => {
    assert.equal(QUOTATION_ROW_TOTAL_COLUMN.key, 'total');
    assert.equal(QUOTATION_ROW_TOTAL_COLUMN.label, 'Total');
    assert.equal(QUOTATION_ROW_TOTAL_COLUMN.type, 'computed');
    assert.equal(QUOTATION_ROW_TOTAL_COLUMN.id, 'rowTotal');
    // Rendered uppercase by the grid's header style, so it reads "TOTAL".
    assert.match(read(CSS), /\.item-table-wrap thead th \{[\s\S]{0,400}text-transform: uppercase;/);
  });

  it('is not part of the saved column configuration the preview / PDF resolve', () => {
    // The persisted default layout has no TOTAL: the column is added by the
    // form itself, so a read-only surface that resolves the stored config can
    // never render an empty TOTAL for a saved (total-less) record.
    const keys = defaultQuotationItemColumns({ showSku: true, showHsn: true }).map((c) => c.key);
    assert.ok(!keys.includes('total'), 'TOTAL must not be persisted in the column configuration');
    assert.deepEqual(keys.slice(-2), ['amount', 'actions']);

    const columns = read(COLUMNS);
    assert.match(columns, /export const QUOTATION_ROW_TOTAL_COLUMN = Object\.freeze\(\{/);
    assert.match(columns, /export function withRowTotalColumn\(columns = \[\], totalColumn = QUOTATION_ROW_TOTAL_COLUMN\) \{/);
  });

  it('renders the row math the summary already uses — GST added once, not twice', () => {
    const form = read(FORM);

    // The column joins the grid immediately before ACTIONS…
    assert.match(form, /const qCols = useMemo\(\s*\n\s*\(\) => withRowTotalColumn\(/);
    // …and, like ACTIONS, carries no rename / resize control of its own. S.No is
    // only kept out of the rename list, exactly as before this change.
    assert.match(form, /const canRenameCol = \(c\) => !\['sno', 'actions', QUOTATION_ROW_TOTAL_COLUMN\.key\]\.includes\(c\.key\);/);
    assert.match(form, /const canResizeCol = \(c\) => c\.key !== 'actions' && c\.key !== QUOTATION_ROW_TOTAL_COLUMN\.key;/);
    assert.match(form, /\{canRenameCol\(c\) && \(\s*\n\s*<ColumnRenameButton/);
    assert.match(form, /\{canResizeCol\(c\) && <ColumnResizer column=\{c\} resize=\{qResize\} \/>\}/);
    // Manage Columns is driven by the persisted configuration alone, so TOTAL is
    // never offered there (and can never be written into the shared config by a
    // hide / move / rename / resize round-trip).
    assert.match(form, /<ManageColumnsButton manager=\{quotationGrid\.manager\} \/>/);

    // AMOUNT stays the untouched base (net) amount.
    assert.match(
      form,
      /case 'amount':[\s\S]{0,220}className="it-td-amount">\{formatMoney\(calc \? calc\.netAmt : 0, numberSettings\)\}/
    );
    // TOTAL is the row's own live calculation, formatted with the quotation's
    // number/currency settings.
    assert.match(
      form,
      /case 'total':[\s\S]{0,1400}className="it-td-total">\s*\{formatMoney\(calc \? calc\.total : 0, numberSettings\)\}/
    );

    // The row total is net + CGST + SGST, and only the net amount feeds the
    // sub-total, so the summary's GST is added exactly once.
    assert.match(form, /const netAmt = grossAmt - discAmt;/);
    assert.match(form, /const cgst = netAmt \* \(gst \/ 2 \/ 100\);/);
    assert.match(form, /const total = netAmt \+ cgst \+ sgst;/);
    assert.match(form, /subTotal \+= netAmt;\s*\n\s*cgstTotal \+= cgst;\s*\n\s*sgstTotal \+= sgst;/);
    assert.match(form, /const grandTotal = Math\.max\(0, subTotal \+ cgstTotal \+ sgstTotal - discount \+ charges \+ freight \+ insurance\);/);
    // Nothing about a row total is saved: the column is display-only.
    assert.ok(!/serializeQuotation[\s\S]{0,4000}\browTotal\b/.test(form) || !/rowTotal:/.test(form));
  });

  it('is right-aligned with the other numeric columns, before ACTIONS', () => {
    const css = read(CSS);
    const numericGroup = css.slice(css.indexOf('.item-table-wrap tbody td.it-td-qty,'), css.indexOf('.item-table-wrap tbody td.it-td-gst {'));
    assert.match(numericGroup, /td\.it-td-amount,/);
    assert.match(numericGroup, /td\.it-td-total \{ text-align: right; padding-right: 8px; \}/);
  });

  it('exists only in the quotation creation form', () => {
    // Only this form inserts the column: every other items grid / module table
    // keeps its layout, and the preview + PDF surfaces are untouched.
    assert.ok(!read('src/components/SalesForm/SalesItemGrid.jsx').includes('withRowTotalColumn'));
    assert.ok(!read('src/pages/sales/QuotationDesign.jsx').includes('withRowTotalColumn'));
    assert.ok(!read('src/components/SalesDesign/SalesDocumentDesign.jsx').includes('withRowTotalColumn'));
    assert.ok(!read('src/utils/detailColumns.js').includes('withRowTotalColumn'));
  });
});
