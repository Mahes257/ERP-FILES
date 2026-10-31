/**
 * tests/cost-workout-to-quotation-mapping.test.js
 * ------------------------------------------------------------------
 * Cost Workout → Quotation: the Cost Workout's material/item detail reaches the
 * quotation's item grid.
 *
 *   FORM      `/quotations/new?sourceCw=<id>` — the CW list ⋮ action AND the CW
 *             view's "Convert to Quotation" both open this prefilled, editable
 *             form. It hydrates through the shared mapper
 *             `quotationItemFromCwItem`, replaces the item rows wholesale, and
 *             writes nothing: the quotation exists only after the user saves.
 *   BACKEND   `POST /cost-workouts/{id}/convert-to-quotation` remains available
 *             as an API capability (QuotationService#createFromCostWorkout),
 *             but no UI action calls it any more.
 *
 * The form maps the same fields the backend conversion does, so both produce
 * the same quotation:
 *
 *   description / qty / unit  → productName, description, material, qty, uom
 *   cost categories           → rate (category total ÷ qty, so the line total
 *                               equals the Cost Workout item total) and the
 *                               breakdown as the item's descriptionRows
 *   "Lead Time" category      → the item's leadTime field (never money)
 *   user-defined columns      → customFields
 *
 * The quotation's own pricing/tax/discount/total rules are untouched: these are
 * plain item values, and the existing recalculation runs on them.
 *
 * Run: node --test tests/cost-workout-to-quotation-mapping.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cwConversionGstRate, quotationItemFromCwItem } from '../src/utils/costWorkoutHelpers.js';
import { isLeadTimeCategory } from '../src/utils/costWorkoutHelpers.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const FORM = 'src/components/SalesForm/QuotationFormPage.jsx';
const CW_VIEW = 'src/pages/cpr/CostWorkoutView.jsx';
const CW_LIST = 'src/pages/cpr/CostWorkouts.jsx';
const CW_SERVICE = 'src/services/costWorkoutService.js';
const SALES_HELPERS = 'src/utils/salesHelpers.js';
const BACKEND_QUOTATION = 'erp-backend/src/main/java/com/vishatech/erp/service/QuotationService.java';
const BACKEND_CW = 'erp-backend/src/main/java/com/vishatech/erp/service/CostWorkoutService.java';

const cwItem = (overrides = {}) => ({
  id: 7,
  description: 'Steel Plate 5mm',
  qty: 10,
  unit: 'Nos',
  categories: [
    { category: 'Material Cost', qty: 1, unit: 'Nos', rate: 250, amount: 250, notes: 'Ground finish' }
  ],
  ...overrides
});

describe('Cost Workout → Quotation · item mapping', () => {
  it('carries the Cost Workout item into the quotation row', () => {
    const row = quotationItemFromCwItem(cwItem(), { gstRate: 18 });

    // The material/name text is the Cost Workout's own description.
    assert.equal(row.productName, 'Steel Plate 5mm');
    assert.equal(row.description, 'Steel Plate 5mm');
    assert.equal(row.material, 'Steel Plate 5mm');
    // Quantity and unit of measure are the Cost Workout's own values.
    assert.equal(row.qty, 10);
    assert.equal(row.unit, 'Nos');
    // The item's cost is the sum of its category rows, spread over its quantity,
    // so qty × rate equals the Cost Workout's own item total (250).
    assert.equal(row.rate, 25);
    assert.equal(row.qty * row.rate, 250);
    assert.equal(row.discountPct, 0);
    assert.equal(row.gstRate, 18);
  });

  it('keeps the cost breakdown as the item\'s description detail rows', () => {
    const row = quotationItemFromCwItem(cwItem({
      categories: [
        { category: 'Material Cost', qty: 1, unit: 'Nos', rate: 250, amount: 250, notes: 'Ground finish' },
        { category: 'Machining', qty: 2, unit: 'Hrs', rate: 100, amount: 200, notes: '' }
      ]
    }), { gstRate: 18 });

    assert.deepEqual(row.descriptionRows, [
      { label: 'Material Cost', value: '1 Nos × 250.00 — Ground finish' },
      { label: 'Machining', value: '2 Hrs × 200.00' }
    ]);
    // 250 + 200 = 450 over qty 10.
    assert.equal(row.rate, 45);
    assert.equal(row.qty * row.rate, 450);
  });

  it('uses the stored category amount when it is a real value', () => {
    const row = quotationItemFromCwItem(cwItem({
      categories: [{ category: 'Material Cost', qty: 3, unit: 'Nos', rate: 100, amount: 275, notes: '' }]
    }), { gstRate: 18 });

    assert.equal(row.rate, 27.5);
    assert.equal(row.descriptionRows[0].value, '3 Nos × 275.00');
  });

  it('maps a "Lead Time" row to the quotation item\'s lead time, not to money', () => {
    // The Cost Workout itself excludes this row from its amounts.
    assert.equal(isLeadTimeCategory('Lead Time'), true);

    const fromNotes = quotationItemFromCwItem(cwItem({
      categories: [
        { category: 'Material Cost', qty: 1, unit: 'Nos', rate: 250, amount: 250, notes: '' },
        { category: 'Lead Time', qty: 6, unit: 'Weeks', rate: 0, amount: 0, notes: '6 weeks after PO' }
      ]
    }), { gstRate: 18 });
    assert.equal(fromNotes.leadTime, '6 weeks after PO');
    assert.equal(fromNotes.rate, 25);
    assert.deepEqual(fromNotes.descriptionRows.map((r) => r.label), ['Material Cost']);

    const fromQty = quotationItemFromCwItem(cwItem({
      categories: [{ category: 'Lead Time', qty: 6, unit: 'Weeks', rate: 0, amount: 0, notes: '' }]
    }), { gstRate: 18 });
    assert.equal(fromQty.leadTime, '6 Weeks');
    assert.equal(fromQty.rate, 0);
    assert.deepEqual(fromQty.descriptionRows, []);
  });

  it('carries the item\'s user-defined column values', () => {
    const row = quotationItemFromCwItem(cwItem({ customFields: { heatNo: 'H-9912', grade: 'EN8' } }), { gstRate: 18 });
    assert.deepEqual(row.customFields, { heatNo: 'H-9912', grade: 'EN8' });

    // Legacy rows (or a raw JSON string) normalize the same way.
    const legacy = quotationItemFromCwItem(cwItem({ customFields: '{"heatNo":"H-1"}' }), { gstRate: 18 });
    assert.deepEqual(legacy.customFields, { heatNo: 'H-1' });
  });

  it('preserves an explicit 0% GST and defaults only a missing rate', () => {
    assert.equal(cwConversionGstRate({ gstPct: 0 }), 0);
    assert.equal(cwConversionGstRate({ gstPct: '0.00' }), 0);
    assert.equal(cwConversionGstRate({ gstPct: 18 }), 18);
    assert.equal(cwConversionGstRate({ gstPct: null }), 18);
    assert.equal(cwConversionGstRate({ gstPct: '' }), 18);
    assert.equal(cwConversionGstRate({}), 18);
    assert.equal(cwConversionGstRate({ gstPct: 'abc' }), 18);

    const row = quotationItemFromCwItem(cwItem(), { gstRate: cwConversionGstRate({ gstPct: 0 }) });
    assert.equal(row.gstRate, 0);
  });

  it('never divides by zero and defaults only genuinely absent values', () => {
    const zeroQty = quotationItemFromCwItem(cwItem({ qty: 0 }), { gstRate: 18 });
    assert.equal(zeroQty.qty, 0);
    assert.equal(zeroQty.rate, 250);

    const blank = quotationItemFromCwItem({}, { gstRate: 18 });
    assert.equal(blank.qty, 1);
    assert.equal(blank.unit, 'Nos');
    assert.equal(blank.rate, 0);
    assert.equal(blank.description, '');
    assert.equal(blank.leadTime, '');
    assert.deepEqual(blank.descriptionRows, []);
    assert.deepEqual(blank.customFields, {});
  });

  it('maps every Cost Workout item exactly once (one row per item)', () => {
    const cwItems = [
      cwItem({ id: 1, description: 'Item A' }),
      cwItem({ id: 2, description: 'Item B', qty: 2, categories: [{ category: 'Material Cost', qty: 2, unit: 'Nos', rate: 50, amount: 100 }] }),
      cwItem({ id: 3, description: 'Item C', qty: 1, categories: [] })
    ];
    const rows = cwItems.map((it) => quotationItemFromCwItem(it, { gstRate: 18 }));

    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => r.description), ['Item A', 'Item B', 'Item C']);
    // The item with no category carries no invented cost row.
    assert.equal(rows[2].rate, 0);
    assert.deepEqual(rows[2].descriptionRows, []);
  });
});

describe('Cost Workout → Quotation · conversion contract', () => {
  it('hydrates the quotation form through the shared mapper', () => {
    const form = read(FORM);
    assert.match(form, /import \{ cwConversionGstRate, quotationItemFromCwItem \} from '\.\.\/\.\.\/utils\/costWorkoutHelpers'/);
    assert.match(form, /const prefillSourceCwId = searchParams\.get\('sourceCw'\)/);
    // suppressGlobalError: a bad source id is reported in the form's own
    // banner instead of replacing the route with the global error page.
    assert.match(form, /costWorkoutService\s*\n?\s*\.getCw\(prefillSourceCwId, \{ suppressGlobalError: true \}\)/);
    assert.match(form, /const gstRate = cwConversionGstRate\(cw\);/);
    assert.match(form, /\.\.\.quotationItemFromCwItem\(cwItem, \{ gstRate \}\)/);
    // Wholesale replacement of the item rows — a re-run can never append a
    // second copy of the same Cost Workout item.
    assert.match(form, /setItems\(\s*\n?\s*cwItems\.map\(/);
    assert.equal(/setItems\(\(prev\) => \[\.\.\.prev, \.\.\.cwItems/.test(form), false);
    // The mapper itself lives in the Cost Workout helper module only.
    assert.equal(/export function quotationItemFromCwItem/.test(form), false);
    assert.match(read('src/utils/costWorkoutHelpers.js'), /export function quotationItemFromCwItem/);
  });

  it('opens that same form from both Cost Workout entry points — and writes nothing', () => {
    // View page: approved + unconverted only, navigation only.
    const view = read(CW_VIEW);
    assert.match(view, /const canConvert = status === 'approved' && !cw\.convertedToQtn/);
    assert.match(view, /navigate\(`\/quotations\/new\?sourceCw=\$\{cw\.id\}`\)/);

    // List row action navigates to the prefilled form too — the direct
    // conversion call is gone from the UI.
    const list = read(CW_LIST);
    assert.match(list, /navigate\(`\/quotations\/new\?sourceCw=\$\{row\.id\}`\)/);
    assert.equal(/convertCw\(/.test(list), false);
    assert.equal(/convertQtnRow|type: 'convertQtn'/.test(list), false);

    // Opening the form is read-only: no quotation create/conversion call.
    const form = read(FORM);
    assert.equal(/quotationService\.create\(/.test(form.split("const save = async")[0]), false);
    assert.equal(/convert-to-quotation/.test(form), false);

    // The conversion rules live in the prefill, because this path no longer
    // asks the backend to validate the conversion.
    assert.match(form, /Only approved Cost Workouts can be converted to a quotation/);
    assert.match(form, /Cost Workout already converted to quotation/);
    // A source deep link owns the form contents (no stored draft is merged in).
    assert.match(form, /prefillSourceCwId \|\| prefillSourcePwId\) return;/);

    // The backend keeps its own guards (still the authority for the API).
    const backendCw = read(BACKEND_CW);
    assert.match(backendCw, /if \(cw\.getConvertedToQtn\(\) != null && !cw\.getConvertedToQtn\(\)\.isBlank\(\)\) \{/);
    assert.match(backendCw, /Only approved Cost Workouts can be converted to a quotation/);
    assert.match(read(CW_SERVICE), /`\/cost-workouts\/\$\{id\}\/convert-to-quotation`/);
  });

  it('maps the same fields on the backend conversion', () => {
    const service = read(BACKEND_QUOTATION);
    // The mapper block of createFromCostWorkout.
    const start = service.indexOf('public QuotationResponse createFromCostWorkout(');
    const end = service.indexOf('createFromProfitWorkout(', start);
    assert.ok(start > 0 && end > start, 'createFromCostWorkout block not found');
    const block = service.slice(start, end);

    assert.match(block, /item\.setProductName\(description\);/);
    assert.match(block, /item\.setDescription\(description\);/);
    assert.match(block, /item\.setMaterial\(description\);/);
    assert.match(block, /item\.setUom\(cwItem\.getUnit\(\)\);/);
    assert.match(block, /item\.setQty\(cwItemQty\);/);
    assert.match(block, /cwItemTotal\.divide\(cwItemQty, 2, RoundingMode\.HALF_UP\)/);
    assert.match(block, /item\.setDescriptionRowsJson\(ItemGridJson\.writeList\(detailRows\)\);/);
    assert.match(block, /item\.setCustomFieldsJson\(ItemGridJson\.writeMap\(/);
    assert.match(block, /item\.setLeadTime\(leadTimeValue\(cat\)\);/);
    assert.match(block, /isLeadTimeCategory\(cat\)/);
    // The quotation's own totals rule still runs — nothing new is calculated.
    assert.match(block, /recalcTotals\(quotation\);/);
    // The source Cost Workout and the CPR references are still carried.
    assert.match(block, /quotation\.setSourceCw\(cw\.getCwNo\(\)\);/);
    assert.match(block, /quotation\.setCprId\(cw\.getCpr\(\)\.getId\(\)\);/);
  });

  it('persists the mapped item fields through the existing save path', () => {
    const helpers = read(SALES_HELPERS);
    // The quotation form's item serializer already carries every mapped field,
    // so a hydrated (or converted) quotation survives save + reopen.
    assert.match(helpers, /material: item\.material \|\| ''/);
    assert.match(helpers, /drawingNo: item\.drawingNo \|\| ''/);
    assert.match(helpers, /leadTime: item\.leadTime \|\| item\.delivery \|\| ''/);
    assert.match(helpers, /uom: item\.unit \|\| item\.uom \|\| ''/);
    assert.match(helpers, /descriptionRows: Array\.isArray\(item\.descriptionRows\)/);
    assert.match(helpers, /customFields: item\.customFields && typeof item\.customFields === 'object'/);
    // …and the reopen path restores them onto the grid rows.
    assert.match(read(FORM), /descriptionRows: Array\.isArray\(it\.descriptionRows\) \? it\.descriptionRows : \[\]/);
  });

  it('enforces one Cost Workout → one quotation on every creation path', () => {
    const quotation = read(BACKEND_QUOTATION);
    // The prefilled-form save locks the source Cost Workout before the duplicate
    // check, so two concurrent saves queue on that row instead of both passing.
    assert.match(quotation, /CostWorkout sourceCw = lockConvertibleCostWorkout\(request\.sourceCw\(\)\);/);
    assert.match(quotation, /costWorkoutRepository\.findByCwNoForUpdate\(cwNo\)/);
    // Eligibility + duplicate rules, checked under that lock.
    assert.match(quotation, /if \(cw\.getStatus\(\) != CostWorkoutStatus\.APPROVED\) \{/);
    assert.match(quotation, /assertNoQuotationForCostWorkout\(cw\);/);
    assert.match(quotation, /quotationRepository\.findLiveBySourceCw\(cw\.getCwNo\(\)\)/);
    // The link is written only AFTER the quotation row is saved, in the same
    // transaction — a failed save never leaves the CW marked as converted.
    assert.match(quotation, /if \(sourceCw != null\) \{\s*\n\s*linkConvertedCostWorkout\(sourceCw, saved\);\s*\n\s*\}/);
    assert.match(quotation, /cw\.setConvertedToQtn\(quotation\.getQuotationNo\(\)\);/);
    // A duplicate is a NEW document, not another conversion of the same CW, and
    // a revision keeps the origin it was created from.
    assert.match(quotation, /copy\.setSourceCw\(null\);/);
    assert.match(quotation, /revision\.setSourceCw\(current\.getSourceCw\(\)\);/);

    // The legacy endpoint takes the same row lock and the same duplicate check.
    const backendCw = read(BACKEND_CW);
    assert.match(backendCw, /costWorkoutRepository\.findByIdForUpdate\(id\)/);
    assert.match(backendCw, /quotationService\.assertNoQuotationForCostWorkout\(cw\);/);

    // The locking finder exists per document number and per id.
    const repo = read('erp-backend/src/main/java/com/vishatech/erp/repository/CostWorkoutRepository.java');
    assert.match(repo, /@Lock\(LockModeType\.PESSIMISTIC_WRITE\)[\s\S]{0,200}Optional<CostWorkout> findByIdForUpdate/);
    assert.match(repo, /@Lock\(LockModeType\.PESSIMISTIC_WRITE\)[\s\S]{0,200}Optional<CostWorkout> findByCwNoForUpdate/);

    // A rejected save keeps the reviewed values on screen and explains itself.
    assert.match(read(FORM), /already exists for Cost Workout/);
  });
});
