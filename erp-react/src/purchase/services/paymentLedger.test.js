/**
 * purchase/services/paymentLedger.test.js
 * ------------------------------------------------------------------
 * Unit tests for the Vendor Payment ledger upgrade:
 *
 *   • Multiple payments — several partial payments accumulate and the
 *     invoice status moves PARTIAL → PAID with each entry on the ledger
 *   • Full payment metadata — payment date, bank, method, UTR,
 *     currency, exchange rate, bank charges and TDS are stored per
 *     payment entry
 *   • Payment reversal — restores the outstanding balance, recomputes
 *     status, removes the payment's advice, keeps the reversed entry
 *     on the ledger, and refuses double reversal
 *   • Overpayment control — refused by default, permitted only when
 *     Settings → Payment → Allow Overpayment is enabled
 *   • Currency conversion — payments in a foreign currency convert to
 *     the invoice currency via the exchange rate and balances track
 *     the converted amount
 *   • Vendor balances — per-vendor invoiced / net payable / paid /
 *     outstanding aggregates computed live from the ledger
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_STATUS, PAYMENT_ENTRY_STATUS, PAYMENT_STATUS } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore } from './logistics';
import { mockInvoiceService, invoicesStore, advicesStore } from './invoice';
import { vendorsStore } from './vendor';
import { settingsStore, settingsService } from './settings';

/* Stub the simulated latency so every service call resolves instantly. */
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, delay: () => Promise.resolve() };
});

function setActor() {
  localStorage.setItem('authUser', JSON.stringify({ fullName: 'Test Buyer', email: 'buyer@test.com' }));
}

beforeEach(async () => {
  localStorage.clear();
  ordersStore.reset();
  grnsStore.reset();
  invoicesStore.reset();
  advicesStore.reset();
  vendorsStore.reset();
  settingsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  for (const name of ['Tata Steel Ltd', 'JSW Steel']) {
    const v = await mockVendorService.createVendor({ name });
    await mockVendorService.setVendorStatus(v.id, 'Approved');
  }
});

/** Fresh released PO, fully received, matched invoice → Approved (payable). */
async function createApprovedForPayment({ invoiceNo, vendor = 'Tata Steel Ltd', amount = 100000 } = {}) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Ledger test PO',
    vendor,
    reference: 'PR-LEDGER',
    items: [
      { product: 'Widget A', hsn: '1111', uom: 'Nos', qty: 100, rate: amount / 100, gstRate: 0 }
    ]
  });
  await mockPurchaseOrderService.approveOrder(po.id);
  await mockPurchaseOrderService.releaseOrder(po.id);
  const grn = await logisticsService.createGrn(po.poNo);
  await logisticsService.receiveGoods(grn.id);
  const invoice = await mockInvoiceService.createInvoice({
    poNo: po.poNo,
    invoiceNo,
    vendor,
    amount,
    gst: 0,
    status: INVOICE_STATUS.SUBMITTED
  });
  const approved = await mockInvoiceService.approveInvoice(invoice.id);
  return { po, grn, invoice: approved };
}

describe('Multiple payments', () => {
  it('accumulates partial payments into the invoice paid balance and settles on the last one', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-001', amount: 100000 });

    const p1 = await mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: false, amount: 40000 });
    expect(p1.status).toBe(INVOICE_STATUS.PARTIAL);
    expect(p1.paidAmount).toBe(40000);

    const p2 = await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: false, amount: 30000 });
    expect(p2.status).toBe(INVOICE_STATUS.PARTIAL);
    expect(p2.paidAmount).toBe(70000);
    expect(p2.paymentHistory).toHaveLength(2);

    const p3 = await mockInvoiceService.recordPayment(invoice.id, { method: 'Cheque', full: false, amount: 30000 });
    expect(p3.status).toBe(INVOICE_STATUS.PAID);
    expect(p3.paidAmount).toBe(100000);
    expect(p3.paymentStatus).toBe(PAYMENT_STATUS.PAID);

    /* Each payment produced its own ledger entry + advice. */
    const history = await mockInvoiceService.getPaymentHistory(invoice.id);
    expect(history).toHaveLength(3);
    const advices = await mockInvoiceService.getPaymentAdvices();
    expect(advices.filter((a) => a.invoiceNo === invoice.invoiceNo)).toHaveLength(3);
  });

  it('stores full ledger metadata on every payment entry', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-002', amount: 50000 });
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer',
      full: false,
      amount: 20000,
      paymentDate: '2026-08-20',
      bank: 'HDFC Bank — 50100012345678',
      transactionReference: 'UTR-9988776655',
      charges: 59,
      tds: 2000,
      notes: 'First installment'
    });

    const entry = paid.paymentHistory[0];
    expect(entry.status).toBe(PAYMENT_ENTRY_STATUS.ACTIVE);
    expect(entry.paidOn).toBe('2026-08-20');
    expect(entry.bank).toBe('HDFC Bank — 50100012345678');
    expect(entry.transactionReference).toBe('UTR-9988776655');
    expect(entry.charges).toBe(59);
    expect(entry.tds).toBe(2000);
    expect(entry.notes).toBe('First installment');

    /* Invoice-level fields mirror the latest payment. */
    expect(paid.bank).toBe('HDFC Bank — 50100012345678');
    expect(paid.paymentDate).toBe('2026-08-20');
    expect(paid.transactionReference).toBe('UTR-9988776655');
  });
});

describe('Payment reversal', () => {
  it('reverses a payment, restores outstanding, recomputes status and removes the advice', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-010', amount: 100000 });
    const p1 = await mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: false, amount: 40000 });
    const p2 = await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: false, amount: 60000 });
    expect(p2.status).toBe(INVOICE_STATUS.PAID);

    /* Reversing the second payment returns the invoice to Partially Paid. */
    const reversed = await mockInvoiceService.reversePayment(invoice.id, p2.paymentNo, { reason: 'Duplicate UTR entry' });
    expect(reversed.status).toBe(INVOICE_STATUS.PARTIAL);
    expect(reversed.paidAmount).toBe(40000);
    expect(reversed.paymentStatus).toBe(PAYMENT_STATUS.PARTIALLY_PAID);
    expect(reversed.paymentHistory.find((e) => e.paymentNo === p2.paymentNo).status).toBe(PAYMENT_ENTRY_STATUS.REVERSED);
    expect(reversed.paymentHistory.find((e) => e.paymentNo === p2.paymentNo).reversalReason).toBe('Duplicate UTR entry');
    expect(reversed.paymentNo).toBe(p1.paymentNo);

    /* The reversed payment's advice is removed; the active one remains. */
    const advices = await mockInvoiceService.getPaymentAdvices();
    expect(advices.filter((a) => a.invoiceNo === invoice.invoiceNo)).toHaveLength(1);
    expect(advices[0].paymentNo).toBe(p1.paymentNo);

    /* Reversing the last active payment returns the invoice to Approved/Unpaid. */
    const cleared = await mockInvoiceService.reversePayment(invoice.id, p1.paymentNo, { reason: 'Vendor dispute' });
    expect(cleared.status).toBe(INVOICE_STATUS.APPROVED);
    expect(cleared.paidAmount).toBe(0);
    expect(cleared.paymentStatus).toBe(PAYMENT_STATUS.UNPAID);
    expect(cleared.adviceStatus).toBe('Not Issued');
    expect((await mockInvoiceService.getPaymentAdvices()).filter((a) => a.invoiceNo === invoice.invoiceNo)).toHaveLength(0);

    /* A reversed payment cannot be reversed again. */
    await expect(
      mockInvoiceService.reversePayment(invoice.id, p2.paymentNo, { reason: 'Again' })
    ).rejects.toThrow(/already reversed/);
  });

  it('requires a reversal reason', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-011', amount: 10000 });
    const paid = await mockInvoiceService.recordPayment(invoice.id, { method: 'UPI', full: true });
    await expect(
      mockInvoiceService.reversePayment(invoice.id, paid.paymentNo, { reason: '   ' })
    ).rejects.toThrow(/Reversal reason is required/);
  });
});

describe('Overpayment control', () => {
  it('refuses overpayment by default', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-020', amount: 10000 });
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'Cheque', full: false, amount: 10001 })
    ).rejects.toThrow(/exceeds the outstanding balance/);
  });

  it('permits overpayment only when explicitly configured', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-021', amount: 10000 });

    /* Enable the setting → overpayment allowed and recorded. */
    await settingsService.updateSettings({ payment: { allowOverpayment: true } });
    const overpaid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer', full: false, amount: 12500
    });
    expect(overpaid.status).toBe(INVOICE_STATUS.PAID);
    expect(overpaid.paidAmount).toBe(12500);
    expect(overpaid.paymentHistory[0].amount).toBe(12500);

    /* Disable again → the guard returns. */
    await settingsService.updateSettings({ payment: { allowOverpayment: false } });
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'Cheque', full: false, amount: 1 })
    ).rejects.toThrow(/already paid/);
  });
});

describe('Currency conversion', () => {
  it('converts a foreign-currency payment into the invoice currency via the exchange rate', async () => {
    const { invoice } = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-030', amount: 100000 });
    const paid = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'Bank Transfer',
      full: false,
      amount: 1000,
      currency: 'USD',
      exchangeRate: 86.25
    });
    const entry = paid.paymentHistory[0];
    expect(entry.currency).toBe('USD');
    expect(entry.exchangeRate).toBe(86.25);
    /* 1000 USD × 86.25 = 86,250 INR credited toward the invoice. */
    expect(entry.amount).toBe(86250);
    expect(paid.paidAmount).toBe(86250);
    expect(paid.status).toBe(INVOICE_STATUS.PARTIAL);

    /* Same-currency payments always use rate 1. */
    const local = await mockInvoiceService.recordPayment(invoice.id, {
      method: 'UPI', full: false, amount: 13750, currency: 'INR', exchangeRate: 1
    });
    expect(local.paidAmount).toBe(100000);
    expect(local.status).toBe(INVOICE_STATUS.PAID);
  });
});

describe('Payment ledger + vendor balances', () => {
  it('lists every payment across invoices in the ledger', async () => {
    const a = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-040', amount: 60000 });
    const b = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-041', amount: 30000, vendor: 'JSW Steel' });
    await mockInvoiceService.recordPayment(a.invoice.id, { method: 'Bank Transfer', full: false, amount: 20000, transactionReference: 'UTR-111' });
    await mockInvoiceService.recordPayment(b.invoice.id, { method: 'UPI', full: true, transactionReference: 'UTR-222' });

    const { data } = await mockInvoiceService.getPaymentLedger({ pageSize: 100 });
    expect(data).toHaveLength(2);
    const byRef = Object.fromEntries(data.map((row) => [row.transactionReference, row]));
    expect(byRef['UTR-111'].invoiceNo).toBe('INV-LEDGER-040');
    expect(byRef['UTR-111'].amount).toBe(20000);
    expect(byRef['UTR-222'].vendor).toBe('JSW Steel');
    expect(byRef['UTR-222'].amount).toBe(30000);

    /* Search narrows the ledger. */
    const searched = await mockInvoiceService.getPaymentLedger({ search: 'UTR-111' });
    expect(searched.data).toHaveLength(1);
    expect(searched.data[0].paymentNo).toBe(byRef['UTR-111'].paymentNo);
  });

  it('aggregates per-vendor balances and reflects reversals', async () => {
    const tata = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-050', amount: 100000 });
    const tataPaid = await mockInvoiceService.recordPayment(tata.invoice.id, { method: 'Bank Transfer', full: false, amount: 40000 });
    const jsw = await createApprovedForPayment({ invoiceNo: 'INV-LEDGER-051', amount: 50000, vendor: 'JSW Steel' });
    await mockInvoiceService.recordPayment(jsw.invoice.id, { method: 'UPI', full: true });

    let balances = await mockInvoiceService.getVendorPaymentBalances();
    const tataRow = balances.find((r) => r.vendor === 'Tata Steel Ltd');
    const jswRow = balances.find((r) => r.vendor === 'JSW Steel');
    expect(tataRow.invoices).toBe(1);
    expect(tataRow.netPayable).toBe(100000);
    expect(tataRow.paid).toBe(40000);
    expect(tataRow.outstanding).toBe(60000);
    expect(jswRow.paid).toBe(50000);
    expect(jswRow.outstanding).toBe(0);

    /* A reversal moves money back into outstanding immediately. */
    const tataEntry = tataPaid.paymentHistory[0];
    await mockInvoiceService.reversePayment(tata.invoice.id, tataEntry.paymentNo, { reason: 'Wrong bank' });
    balances = await mockInvoiceService.getVendorPaymentBalances();
    expect(balances.find((r) => r.vendor === 'Tata Steel Ltd').paid).toBe(0);
    expect(balances.find((r) => r.vendor === 'Tata Steel Ltd').outstanding).toBe(100000);
  });
});