/**
 * tests/cpr-to-cost-workout-mapping.test.js
 * ------------------------------------------------------------------
 * CPR → Cost Workout: the CPR's HEADER travels, its material rows do not.
 *
 * A CPR holds what the CUSTOMER asked for; the Cost Workout is the company's
 * own costing of the same job. Both CPR → Cost Workout routes therefore carry
 * the CPR reference and the CPR-level information only, and the Cost Workout's
 * item/material section opens empty (the form's own single blank row) for the
 * estimator:
 *
 *   FORM      `/cost-workouts/new?cpr=<id>` (CPR list ⋮ → "Convert to Cost
 *             Workout", CPR detail action) hydrates the header and keeps the
 *             form's blank item row — no CPR item row reaches `items`
 *   BACKEND   `POST /cprs/{id}/float` (destination CW) builds the Cost Workout
 *             from the CPR header + the CPR link and one blank item row
 *
 * Covered here:
 *   MAPPING   the pure helpers in src/utils/cprToCostWorkout.js (provenance note
 *             and the custom-column fold used by the CPR → Quotation conversion)
 *   CONTRACT  the form no longer imports/uses a CPR → CW item mapping, the
 *             backend no longer copies `cpr.getItems()` nor the CPR's item-column
 *             config, the CPR link and header fields are still carried, and the
 *             item-level "convert THIS item" workflow is untouched
 *
 * Run: node --test tests/cpr-to-cost-workout-mapping.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  cprConversionRemarks,
  foldCprItemCustomFields
} from '../src/utils/cprToCostWorkout.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const FORM = 'src/pages/cpr/AddCostWorkout.jsx';
const LIST = 'src/pages/cpr/Cprs.jsx';
const ITEM_BUTTONS = 'src/components/CprForm/ItemCwPrButtons.jsx';
const MAPPER = 'src/utils/cprToCostWorkout.js';
const BACKEND_CPR = 'erp-backend/src/main/java/com/vishatech/erp/service/CprService.java';
const BACKEND_ITEM = 'erp-backend/src/main/java/com/vishatech/erp/entity/CostWorkoutItem.java';
const BACKEND_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/CostWorkoutService.java';
const TV_SERVICE = 'erp-backend/src/main/java/com/vishatech/erp/service/CprTechnicalVerificationService.java';

// The CPR item grid's own columns (src/utils/cprHelpers.js → defaultCprItemColumns):
//   drawingNo = "Drawing No.", description = "Material",
//   specification = "Description", qty = "Qty", unit = "UOM",
//   estimatedCost = "Est. Cost (₹)", remarks = "Remarks"
const cpr = (overrides = {}) => ({
  id: 7,
  prNo: 'CPR-0007',
  department: 'Sales',
  description: 'Pump housings',
  remarks: 'Urgent',
  itemColumns: [
    { id: 'drawingNo', label: 'Drawing No.', system: true },
    { id: 'description', label: 'Material', system: true },
    { id: 'specification', label: 'Description', system: true },
    { id: 'qty', label: 'Qty', system: true },
    { id: 'unit', label: 'UOM', system: true },
    { id: 'estimatedCost', label: 'Est. Cost (₹)', system: true },
    { id: 'remarks', label: 'Remarks', system: true }
  ],
  items: [],
  ...overrides
});

const cprItem = (overrides = {}) => ({
  id: 1,
  drawingNo: 'DRW-101',
  description: 'MS Plate 5mm',
  specification: 'Cut to size',
  qty: 4,
  unit: 'Nos',
  estimatedCost: 250,
  remarks: 'Ground finish',
  ...overrides
});

describe('CPR → Cost Workout · provenance note', () => {
  it('records the source CPR and its author, then the CPR header notes', () => {
    assert.equal(cprConversionRemarks(cpr(), 'Asha'), 'Raised from CPR-0007 by Asha. CPR description: Pump housings CPR remarks: Urgent');
    assert.equal(cprConversionRemarks(cpr(), ''), 'Raised from CPR-0007. CPR description: Pump housings CPR remarks: Urgent');
  });

  it('still names the source when the CPR has no header notes', () => {
    assert.equal(cprConversionRemarks(cpr({ description: '', remarks: '' }), 'Asha'), 'Raised from CPR-0007 by Asha.');
  });

  it('falls back to a generic label when the CPR has no number yet', () => {
    assert.equal(cprConversionRemarks({ prNo: '' }), 'Raised from CPR.');
  });

  it('never mentions the CPR item rows — they stay in the CPR', () => {
    const note = cprConversionRemarks(cpr({ items: [cprItem()] }), 'Asha');
    assert.equal(note.includes('MS Plate 5mm'), false);
    assert.equal(note.includes('DRW-101'), false);
  });
});

describe('CPR → Cost Workout · custom column fold (used by CPR → Quotation)', () => {
  it('folds the CPR item grid\'s user-defined columns in configured order', () => {
    const withCustom = cpr({
      itemColumns: [
        ...cpr().itemColumns,
        { id: 'heatNo', label: 'Heat No.', system: false },
        { id: 'grade', label: 'Grade', system: false }
      ],
      items: [cprItem({ customFields: { heatNo: 'H-9912', grade: 'EN8', legacy: 'old' } })]
    });

    assert.equal(
      foldCprItemCustomFields(withCustom, withCustom.items[0]),
      'Heat No.: H-9912; Grade: EN8; legacy: old'
    );
  });

  it('drops blank custom values rather than writing empty pairs', () => {
    const source = cpr({ items: [cprItem({ customFields: { heatNo: '  ', grade: 'EN8' } })] });
    assert.equal(foldCprItemCustomFields(source, source.items[0]), 'grade: EN8');
  });

  it('returns nothing for an item without custom values', () => {
    assert.equal(foldCprItemCustomFields(cpr(), cprItem()), '');
    assert.equal(foldCprItemCustomFields(null, null), '');
  });
});

describe('CPR → Cost Workout · no CPR material transfer', () => {
  it('no longer exposes a CPR → Cost Workout item mapping', () => {
    const mapper = read(MAPPER);
    // The mapping module is header-only now: no item builder, no item export.
    assert.equal(/export function cwItemsFromCpr/.test(mapper), false);
    assert.equal(/export function cwDescriptionFromCprItem/.test(mapper), false);
    assert.equal(/CPR_COST_CATEGORY/.test(mapper), false);
    assert.match(mapper, /export function cprConversionRemarks/);
    assert.match(mapper, /export function foldCprItemCustomFields/);
  });

  it('keeps the Cost Workout form on its OWN blank item row for a CPR conversion', () => {
    const form = read(FORM);
    // The header prefill still runs…
    assert.match(form, /const cprParam = searchParams\.get\('cpr'\)/);
    assert.match(form, /const cprRes = await cprService\.getCpr\(cprParam\)/);
    // …and the CPR reference + customer/company details are still carried.
    assert.match(form, /cprRef: cpr\.prNo \|\| ''/);
    assert.match(form, /linkedCpr: cpr\.prNo \|\| ''/);
    assert.match(form, /cprId: cpr\.id != null \? String\(cpr\.id\) : ''/);
    assert.match(form, /customerName: cpr\.clientName \|\| cpr\.client \|\| prev\.customerName/);
    assert.match(form, /remarks: prev\.remarks \|\| cprConversionRemarks\(/);
    // The CPR's material rows never reach the item grid.
    assert.equal(/cwItemsFromCpr/.test(form), false);
    assert.equal(/convertedItems/.test(form), false);
    assert.equal(/import \{[^}]*cwItemsFromCpr/.test(form), false);
    // The form still starts from (and keeps) its own blank item row.
    assert.match(form, /const \[items, setItems\] = useState\(\(\) => \[newItem\(\)\]\);/);
  });

  it('leaves the CPR list action pointing at the real CPR id', () => {
    const list = read(LIST);
    assert.match(list, /navigate\(`\/cost-workouts\/new\?cpr=\$\{row\.id\}`\)/);
  });

  it('does not delete or rewrite the CPR items anywhere in the conversion', () => {
    const backend = read(BACKEND_CPR);
    assert.match(backend, /private CostWorkoutItemRequest blankCostWorkoutItem\(\)/);
    // The float request builder itself: header + CPR link + ONE blank row.
    const start = backend.indexOf('private CostWorkoutRequest costWorkoutRequestFromCpr(');
    const end = backend.indexOf('private CostWorkoutItemRequest blankCostWorkoutItem()', start);
    assert.ok(start > 0 && end > start, 'costWorkoutRequestFromCpr block not found');
    const builder = backend.slice(start, end);
    assert.match(builder, /List\.of\(blankCostWorkoutItem\(\)\)/);
    // No CPR item data and no CPR item-grid config is read or copied.
    assert.equal(/cpr\.getItems\(\)/.test(builder), false);
    assert.equal(/parseCustomFields/.test(builder), false);
    assert.equal(/getItemColumnsJson/.test(builder), false);
    assert.equal(/CostWorkoutCategoryRequest/.test(builder), false);
    // The CPR reference + header fields are still sent.
    assert.match(builder, /cpr\.getPrNo\(\),\s*\n\s*cpr\.getId\(\),/);
    assert.match(builder, /cpr\.getId\(\),\s*\n\s*cpr\.getPhone\(\),/);
    assert.match(builder, /cpr\.getClientName\(\),/);
    assert.match(builder, /firstNonBlank\(cpr\.getDepartment\(\), "Sales"\)/);
    // No CPR item is ever deleted or modified by the conversion.
    assert.equal(/cprItemRepository\.delete/.test(backend), false);
  });

  it('keeps the blank Cost Workout row valid for the existing save rules', () => {
    // The Cost Workout service only rejects a record with no item content at
    // all, and the form's own default row (description "", qty 1, unit "Nos",
    // one empty "Material Cost" category) satisfies that rule.
    assert.match(read(FORM), /category: 'Material Cost', qty: 1, unit: 'Nos', rate: 0, notes: ''/);
    assert.match(read(BACKEND_SERVICE), /Add at least one cost item with a description or quantity\/rate/);
  });

  it('keeps the item-level "convert THIS item" workflow working', () => {
    // The per-row CW button is a DIFFERENT, item-scoped workflow: the backend
    // reads that one CPR item and creates its Cost Workout.
    const buttons = read(ITEM_BUTTONS);
    assert.match(buttons, /technicalVerificationService\.convertToCostWorkout\(verificationRow\.id\)/);
    assert.match(buttons, /navigate\(result\.destination === 'CW'/);
    const tvService = read(TV_SERVICE);
    assert.match(tvService, /String description = foldDescription\(item\.getDrawingNo\(\), item\.getDescription\(\), tv\.getItemDescription\(\)\)/);
    // The Cost Workout item model is unchanged: it can still hold the transferred item.
    assert.match(read(BACKEND_ITEM), /private String customFieldsJson;/);
  });

  it('keeps the item-level Cost Workout form prefill (opened WITH one item)', () => {
    const form = read(FORM);
    assert.match(form, /const prefill = location\.state\?\.cwPrefill/);
    assert.match(form, /setItems\(\[\{ key: itemKey, description: it\.description/);
  });
});
