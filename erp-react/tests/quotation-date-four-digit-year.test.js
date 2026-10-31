/**
 * tests/quotation-date-four-digit-year.test.js
 * ------------------------------------------------------------------
 * Sales Execution → Quotations: the Quotation Date and Valid Till Date fields.
 *
 * A native <input type="date"> is not limited to a four-digit year — the HTML
 * spec allows years up to 275760 — so typing `275760` into the year segment made
 * the input report "275760-01-01", which the form then stored with the document.
 * Both date fields now accept a real YYYY-MM-DD date with a four-digit year only.
 *
 * Covered here:
 *
 *   GUARD     the shared value guard (src/utils/dateInput.js): a six-digit year,
 *             an impossible day and an unpadded date are refused, a real date
 *             (leap day included) is kept, and a cleared field stays cleared
 *   WIRING    both quotation date inputs run their raw value through the guard
 *             and carry the four-digit-year `max`, so a value the guard refuses
 *             can never reach form state — neither typed nor picked
 *   BACKSTOP  `validate()` refuses to save an impossible date that reached the
 *             form from anywhere else (a stored draft or an older record)
 *
 * Run: node --test tests/quotation-date-four-digit-year.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { dateInputValue, isValidDateInput, MAX_DATE_INPUT } from '../src/utils/dateInput.js';

const root = join(import.meta.dirname, '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');

const FORM = 'src/components/SalesForm/QuotationFormPage.jsx';
const GUARD = 'src/utils/dateInput.js';

describe('Quotation dates · four-digit year guard', () => {
  it('accepts real dates, including a four-digit year far from today and a leap day', () => {
    ['2026-10-16', '0001-01-01', '0099-01-01', '9999-12-31', '2028-02-29']
      .forEach((value) => {
        assert.equal(isValidDateInput(value), true, `${value} must be a valid date`);
        assert.equal(dateInputValue(value), value);
      });
  });

  it('refuses a year with more than four digits — the reported bug', () => {
    ['275760-01-01', '27576-01-01', '12345-06-30', '02026-01-01'].forEach((value) => {
      assert.equal(isValidDateInput(value), false, `${value} must be refused`);
      assert.equal(dateInputValue(value), null, `${value} must not reach form state`);
    });
  });

  it('refuses impossible days and unpadded dates', () => {
    ['2026-02-30', '2026-13-01', '2026-00-10', '2026-01-32', '2026-2-6', '16-10-2026', '2026/10/16', '', 'not a date', null]
      .forEach((value) => assert.equal(isValidDateInput(value), false, `${value} must be refused`));
  });

  it('keeps a cleared field cleared, so a date can still be removed', () => {
    assert.equal(dateInputValue(''), '');
    assert.equal(dateInputValue('   '), '');
  });

  it('caps the input at the largest four-digit-year date, which is itself valid', () => {
    assert.equal(MAX_DATE_INPUT, '9999-12-31');
    assert.equal(isValidDateInput(MAX_DATE_INPUT), true);
    assert.match(read(GUARD), /export const MAX_DATE_INPUT = '9999-12-31';/);
  });
});

describe('Quotation form · both date fields use the guard', () => {
  it('imports the guard and passes it the raw input value of each field', () => {
    const form = read(FORM);
    assert.match(form, /import \{ dateInputValue, MAX_DATE_INPUT \} from '\.\.\/\.\.\/utils\/dateInput';/);
    // Rejection keeps the previous value: a refused input never calls setField.
    assert.match(form, /const setDateField = \(key, raw\) => \{\s*\n\s*const next = dateInputValue\(raw\);\s*\n\s*if \(next === null\)/);
    assert.match(form, /toast\.error\('Enter a valid date with a four-digit year \(YYYY-MM-DD\)\.'\);/);
  });

  it('bounds both inputs to the four-digit range, whatever the entry method', () => {
    const form = read(FORM);
    // From the field's own label through the end of its <input> element.
    const fieldBlock = (id) => {
      const start = form.indexOf(`htmlFor="${id}"`);
      const end = form.indexOf('/>', start);
      assert.ok(start > 0 && end > start, `${id} input not found`);
      return form.slice(start, end + 2);
    };
    const dateField = fieldBlock('qtnDate');
    const validTillField = fieldBlock('qtnValidTill');
    assert.match(dateField, /max=\{MAX_DATE_INPUT\}/);
    assert.match(dateField, /onChange=\{\(e\) => setDateField\('quotationDate', e\.target\.value\)\}/);
    assert.match(validTillField, /max=\{MAX_DATE_INPUT\}/);
    assert.match(validTillField, /onChange=\{\(e\) => setDateField\('validUntil', e\.target\.value\)\}/);
    // The picker/typed UI is untouched: both stay plain native date inputs.
    assert.match(dateField, /type="date"/);
    assert.match(validTillField, /type="date"/);
  });

  it('refuses to save a date the guard does not accept', () => {
    const form = read(FORM);
    const validate = form.slice(form.indexOf('const validate = () => {'));
    const body = validate.slice(0, validate.indexOf('\n  };'));
    assert.match(body, /\['Quotation Date', form\.quotationDate\]/);
    assert.match(body, /\['Valid Till Date', form\.validUntil\]/);
    assert.match(body, /dateInputValue\(value\) === null/);
    assert.match(body, /must be a valid date with a four-digit year \(YYYY-MM-DD\)/);
  });
});
