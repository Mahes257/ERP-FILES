/**
 * purchase/utils/__tests__/paymentTerms.test.js
 * -------------------------------------------------------------------
 * Regression tests for paymentTermRows() — the display-row formatter
 * used by print/PDF templates.
 *
 * BUG (fixed): the PO Print page crashed with "Objects are not valid as
 * a React child (found: object with keys {type, advancePercentage,
 * ...})" because a structured payment-terms object was passed straight
 * into JSX. paymentTermRows() maps the object into individual scalar /
 * milestone rows so templates never render the raw object, and supports
 * legacy string terms and null/empty safely.
 * -------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import {
  normalizePaymentTerms,
  paymentTermRows,
  PAYMENT_TERMS_TYPE
} from '../paymentTerms';

/** Asserts a row list never leaks an object into a scalar value. */
function expectNoObjectValues(rows) {
  rows.forEach((row) => {
    expect(typeof row.key).toBe('string');
    expect(typeof row.label).toBe('string');
    if (row.milestones) {
      expect(Array.isArray(row.milestones)).toBe(true);
      row.milestones.forEach((milestone) => {
        expect(typeof milestone.percentage).toBe('number');
        expect(typeof milestone.trigger).toBe('string');
        expect(typeof milestone.dueDate).toBe('string');
        expect(typeof milestone.status).toBe('string');
      });
    } else {
      expect(typeof row.value).toBe('string');
    }
  });
}

describe('paymentTermRows — safe display rows for print/PDF', () => {
  it('returns [] for null / undefined / empty terms', () => {
    expect(paymentTermRows(null)).toEqual([]);
    expect(paymentTermRows(undefined)).toEqual([]);
    expect(paymentTermRows({})).toEqual([]);
    expect(paymentTermRows('')).toEqual([]);
    expect(paymentTermRows('   ')).toEqual([]);
    expect(paymentTermRows(42)).toEqual([]);
    expect(paymentTermRows([])).toEqual([]);
  });

  it('supports legacy string terms as a single row', () => {
    const rows = paymentTermRows('30 Days');
    expect(rows).toEqual([{ key: 'terms', label: 'Payment Terms', value: '30 Days' }]);
    expectNoObjectValues(rows);
  });

  it('renders Partial Advance terms field-by-field with triggers', () => {
    const terms = normalizePaymentTerms({
      type: PAYMENT_TERMS_TYPE.PARTIAL_ADVANCE,
      advancePercentage: 50,
      advanceTrigger: 'Against PO / Order Confirmation',
      balanceTrigger: 'Against Delivery',
      notes: 'Advance within 7 days of PO'
    });
    const rows = paymentTermRows(terms);

    expect(rows.map((row) => row.label)).toEqual([
      'Payment Type',
      'Advance',
      'Balance',
      'Notes'
    ]);
    expect(rows[0].value).toBe('Partial Advance');
    expect(rows[1].value).toBe('50% (Against PO / Order Confirmation)');
    expect(rows[2].value).toBe('50% (Against Delivery)');
    expect(rows[3].value).toBe('Advance within 7 days of PO');
    expectNoObjectValues(rows);
  });

  it('renders Credit terms with the credit period row', () => {
    const terms = normalizePaymentTerms({
      type: PAYMENT_TERMS_TYPE.CREDIT,
      creditPeriod: 45
    });
    const rows = paymentTermRows(terms);
    const labels = rows.map((row) => row.label);
    expect(labels).toContain('Payment Type');
    expect(labels).toContain('Credit Period');
    const credit = rows.find((row) => row.key === 'credit');
    expect(credit.value).toBe('45 days');
    expectNoObjectValues(rows);
  });

  it('renders Milestone Based terms as readable milestone rows', () => {
    const terms = normalizePaymentTerms({
      type: PAYMENT_TERMS_TYPE.MILESTONE_BASED,
      milestones: [
        { percentage: 40, trigger: 'Against PO / Order Confirmation', dueDate: '2026-10-01', status: 'Pending' },
        { percentage: 60, trigger: 'Against Delivery', dueDate: '2027-01-15', status: '' },
        { percentage: 0, trigger: 'Ignored — zero percent', status: '' }
      ]
    });
    const rows = paymentTermRows(terms);

    const milestonesRow = rows.find((row) => row.key === 'milestones');
    expect(milestonesRow).toBeTruthy();
    expect(milestonesRow.label).toBe('Milestones');
    /* Zero-percent placeholder milestones are dropped. */
    expect(milestonesRow.milestones).toHaveLength(2);
    expect(milestonesRow.milestones[0]).toEqual({
      percentage: 40,
      trigger: 'Against PO / Order Confirmation',
      dueDate: '2026-10-01',
      status: 'Pending'
    });
    expect(milestonesRow.milestones[1]).toEqual({
      percentage: 60,
      trigger: 'Against Delivery',
      dueDate: '2027-01-15',
      status: ''
    });
    expectNoObjectValues(rows);
  });

  it('never returns the raw terms object itself', () => {
    const terms = normalizePaymentTerms({
      type: PAYMENT_TERMS_TYPE.MILESTONE_BASED,
      milestones: [{ percentage: 100, trigger: 'On Acceptance' }]
    });
    const rows = paymentTermRows(terms);
    rows.forEach((row) => expect(row).not.toBe(terms));
    expectNoObjectValues(rows);
  });
});
