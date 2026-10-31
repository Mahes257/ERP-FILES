/**
 * purchase/utils/__tests__/paymentUtils.test.js
 * ------------------------------------------------------------------
 * Unit tests for the invoice payment eligibility predicates
 * (paymentUtils.js) — the single source of truth every payment
 * screen uses to decide whether "Record Payment" is offered.
 *
 * The ₹118 → ₹50 → ₹68 installment flow (Purchase → Invoice spec):
 * an Approved invoice is payable; after a ₹50 partial payment the
 * invoice becomes Partially Paid but MUST stay payable while an
 * outstanding balance remains, so the ₹68 settlement payment can be
 * recorded. Only Draft / Submitted / Paid / Rejected invoices and
 * invoices fully covered by approved credit notes are not payable.
 * ------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { INVOICE_STATUS, PAYMENT_STATUS } from '../../constants';
import {
  isPayable,
  getInvoiceActions,
  getPaymentBlockReasons,
  getRowActions,
  derivePaymentStatus
} from '../paymentUtils';

/** Base Approved invoice shape shared by the eligibility tests. */
function approvedInvoice(overrides = {}) {
  return {
    id: 'INV-1',
    invoiceNo: 'VINV-2026-0001',
    status: INVOICE_STATUS.APPROVED,
    total: 118,
    netPayable: 118,
    paidAmount: 0,
    outstanding: 118,
    matchStatus: 'Matched',
    paymentHistory: [],
    ...overrides
  };
}

describe('isPayable — partial payment installments', () => {
  it('returns true for an Approved invoice with an outstanding balance', () => {
    expect(isPayable(approvedInvoice())).toBe(true);
  });

  it('returns true for a Partially Paid invoice with an outstanding balance (₹68 left after ₹50 paid)', () => {
    const partial = approvedInvoice({
      status: INVOICE_STATUS.PARTIAL,
      paidAmount: 50,
      outstanding: 68
    });
    expect(derivePaymentStatus(partial)).toBe(PAYMENT_STATUS.PARTIALLY_PAID);
    expect(isPayable(partial)).toBe(true);
  });

  it('returns true for a Partially Paid invoice even without a stored outstanding field (derived from total − paid)', () => {
    const partial = approvedInvoice({
      status: INVOICE_STATUS.PARTIAL,
      paidAmount: 50
    });
    delete partial.outstanding;
    expect(isPayable(partial)).toBe(true);
  });

  it('returns false for a fully Paid invoice', () => {
    expect(isPayable(approvedInvoice({ status: INVOICE_STATUS.PAID, paidAmount: 118, outstanding: 0 }))).toBe(false);
  });

  it('returns false for Draft / Submitted / Rejected invoices', () => {
    expect(isPayable(approvedInvoice({ status: INVOICE_STATUS.DRAFT }))).toBe(false);
    expect(isPayable(approvedInvoice({ status: INVOICE_STATUS.SUBMITTED }))).toBe(false);
    expect(isPayable(approvedInvoice({ status: INVOICE_STATUS.REJECTED }))).toBe(false);
  });

  it('returns false when approved credit notes have fully settled the balance', () => {
    /* An approved credit note of 118 nets the payable to 0 → outstanding 0. */
    const credited = approvedInvoice({
      status: INVOICE_STATUS.APPROVED,
      paidAmount: 0,
      adjustments: { credit: 118, debit: 0, net: -118, count: 1 }
    });
    expect(isPayable(credited)).toBe(false);
  });
});

describe('getInvoiceActions.recordPayment — UI action gating', () => {
  it('offers Record Payment for an Approved invoice', () => {
    expect(getInvoiceActions(approvedInvoice()).recordPayment).toBe(true);
  });

  it('still offers Record Payment for a Partially Paid invoice (second installment)', () => {
    const partial = approvedInvoice({ status: INVOICE_STATUS.PARTIAL, paidAmount: 50, outstanding: 68 });
    expect(getInvoiceActions(partial).recordPayment).toBe(true);
  });

  it('hides Record Payment for Paid and Draft invoices', () => {
    expect(getInvoiceActions(approvedInvoice({ status: INVOICE_STATUS.PAID, paidAmount: 118, outstanding: 0 })).recordPayment).toBe(false);
    expect(getInvoiceActions(approvedInvoice({ status: INVOICE_STATUS.DRAFT })).recordPayment).toBe(false);
  });

  it('hides Record Payment when approved credit notes have fully settled the balance', () => {
    const credited = approvedInvoice({
      status: INVOICE_STATUS.APPROVED,
      paidAmount: 0,
      adjustments: { credit: 118, debit: 0, net: -118, count: 1 }
    });
    expect(getInvoiceActions(credited).recordPayment).toBe(false);
  });
});

describe('getPaymentBlockReasons', () => {
  it('returns no blocking reasons for a payable Partially Paid invoice', () => {
    const partial = approvedInvoice({ status: INVOICE_STATUS.PARTIAL, paidAmount: 50, outstanding: 68 });
    expect(getPaymentBlockReasons(partial)).toEqual([]);
  });

  it('explains why an unpaid Submitted invoice is blocked', () => {
    const reasons = getPaymentBlockReasons(approvedInvoice({ status: INVOICE_STATUS.SUBMITTED }));
    expect(reasons.some((r) => /approve it before paying/i.test(r))).toBe(true);
  });

  it('explains why a fully settled invoice is blocked', () => {
    const reasons = getPaymentBlockReasons(approvedInvoice({ status: INVOICE_STATUS.PAID, paidAmount: 118, outstanding: 0 }));
    expect(reasons.some((r) => /no outstanding balance/i.test(r))).toBe(true);
  });

  it('explains why an APPROVED-but-credited invoice is blocked', () => {
    const credited = approvedInvoice({
      paidAmount: 0,
      adjustments: { credit: 118, debit: 0, net: -118, count: 1 }
    });
    const reasons = getPaymentBlockReasons(credited);
    expect(reasons.some((r) => /no outstanding balance/i.test(r))).toBe(true);
  });
});

describe('getRowActions — record payment row action', () => {
  it('includes Record Payment for a partially paid invoice with outstanding', () => {
    const partial = approvedInvoice({ status: INVOICE_STATUS.PARTIAL, paidAmount: 50, outstanding: 68 });
    const labels = getRowActions(partial).map((a) => a.label);
    expect(labels).toContain('Record Payment');
    expect(labels).toContain('Payment History');
  });

  it('excludes Record Payment from a Paid invoice', () => {
    const paid = approvedInvoice({ status: INVOICE_STATUS.PAID, paidAmount: 118, outstanding: 0 });
    const labels = getRowActions(paid).map((a) => a.label);
    expect(labels).not.toContain('Record Payment');
  });
});
