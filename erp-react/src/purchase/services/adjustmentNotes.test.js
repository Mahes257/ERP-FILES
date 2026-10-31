/**
 * purchase/services/adjustmentNotes.test.js
 * ------------------------------------------------------------------
 * Credit / Debit Note adjustment ledger tests:
 *
 *   • Lifecycle — draft → submit → approve / reject → reverse; only
 *     APPROVED (not reversed) notes move the ledger
 *   • Balance guard — a credit note may not exceed the original
 *     invoice's outstanding balance unless allowExcess is explicit
 *   • Ledger effect — approved notes update the invoice outstanding,
 *     vendor payable balances, payment capacity and reports
 *   • Debit notes raise the payable; reversing restores the balance
 *   • Linking — notes reference the original invoice; invoices with
 *     linked notes cannot be deleted
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INVOICE_STATUS, ADJUSTMENT_NOTE_STATUS, ADJUSTMENT_NOTE_TYPE } from '../constants';
import { mockPurchaseOrderService, ordersStore } from './purchaseOrder';
import { logisticsService, grnsStore } from './logistics';
import {
  mockInvoiceService, invoicesStore, adjustmentNotesStore, advicesStore
} from './invoice';
import { vendorsStore } from './vendor';
import { settingsStore } from './settings';

/* Stub latency so every service call resolves instantly. */
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
  adjustmentNotesStore.reset();
  advicesStore.reset();
  vendorsStore.reset();
  settingsStore.reset();
  setActor();
  const { mockVendorService } = await import('./vendor');
  const v = await mockVendorService.createVendor({ name: 'Tata Steel Ltd' });
  await mockVendorService.setVendorStatus(v.id, 'Approved');
});

/** Fresh released PO → fully received → matched invoice → Approved. */
async function createApprovedInvoice({ amount = 10000, vendor = 'Tata Steel Ltd' } = {}) {
  const po = await mockPurchaseOrderService.createOrder({
    title: 'Note test PO',
    vendor,
    reference: 'PR-NOTE',
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
    vendor,
    amount,
    gst: 0,
    status: INVOICE_STATUS.SUBMITTED
  });
  return mockInvoiceService.approveInvoice(invoice.id);
}

describe('Credit / Debit note adjustment ledger', () => {
  it('runs the draft → submit → approve lifecycle and only Approved notes move the ledger', async () => {
    const invoice = await createApprovedInvoice();
    const draft = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Goods Returned',
      amount: 2000,
      gst: 0
    });
    expect(draft.status).toBe(ADJUSTMENT_NOTE_STATUS.DRAFT);
    /* Draft: no ledger movement. */
    expect((await mockInvoiceService.getInvoice(invoice.id)).outstanding).toBeCloseTo(10000);
    expect((await mockInvoiceService.getAdjustmentNote(draft.id)).originalInvoice.adjustments.count).toBe(0);

    const submitted = await mockInvoiceService.submitAdjustmentNote(draft.id);
    expect(submitted.status).toBe(ADJUSTMENT_NOTE_STATUS.SUBMITTED);
    /* Submitted but not approved: still no movement. */
    expect((await mockInvoiceService.getInvoice(invoice.id)).outstanding).toBeCloseTo(10000);

    const approved = await mockInvoiceService.approveAdjustmentNote(draft.id);
    expect(approved.status).toBe(ADJUSTMENT_NOTE_STATUS.APPROVED);

    const after = await mockInvoiceService.getInvoice(invoice.id);
    expect(after.adjustments).toMatchObject({ credit: 2000, debit: 0, net: -2000, count: 1 });
    expect(after.outstanding).toBeCloseTo(8000);
  });

  it('refuses a credit note above the outstanding balance unless allowExcess is set', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    await mockInvoiceService.recordPayment(invoice.id, { full: true });

    /* Invoice fully paid → nothing left to credit. */
    await expect(
      mockInvoiceService.createAdjustmentNote({
        invoiceId: invoice.id,
        noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
        reason: 'Rate correction after payment',
        amount: 1000,
        gst: 0
      })
    ).rejects.toThrow(/exceeds the outstanding balance/);

    /* Explicit allowance lets the note through. */
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Rate correction after payment',
      amount: 1000,
      gst: 0,
      allowExcess: true
    });
    await mockInvoiceService.submitAdjustmentNote(note.id);
    await mockInvoiceService.approveAdjustmentNote(note.id);
    const after = await mockInvoiceService.getInvoice(invoice.id);
    expect(after.adjustments.credit).toBeCloseTo(1000);
    expect(after.outstanding).toBeCloseTo(0);
  });

  it('approval re-checks the balance when the invoice was paid after drafting', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Return',
      amount: 3000,
      gst: 0
    });
    /* Outstanding is still 10000 at submit — allowed. */
    await mockInvoiceService.submitAdjustmentNote(note.id);
    /* The invoice gets fully paid before approval. */
    await mockInvoiceService.recordPayment(invoice.id, { full: true });

    await expect(mockInvoiceService.approveAdjustmentNote(note.id)).rejects.toThrow(
      /exceeds the outstanding balance/
    );
  });

  it('a partial payment cannot exceed the reduced outstanding after a credit note', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Short supply',
      amount: 2500,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(note.id);
    await mockInvoiceService.approveAdjustmentNote(note.id);

    /* Outstanding is now 7500 — overpaying by 100 must be refused. */
    await expect(
      mockInvoiceService.recordPayment(invoice.id, { method: 'Bank Transfer', full: false, amount: 7600 })
    ).rejects.toThrow(/exceeds the outstanding balance/);

    /* Full payment now settles the ADJUSTED balance, not the original. */
    const paid = await mockInvoiceService.recordPayment(invoice.id, { full: true });
    expect(paid.paidAmount).toBeCloseTo(7500);
    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.outstanding).toBeCloseTo(0);
  });

  it('a debit note raises the payable and both reverse cleanly', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const debit = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.DEBIT,
      reason: 'Freight overrun',
      amount: 500,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(debit.id);
    await mockInvoiceService.approveAdjustmentNote(debit.id);
    expect((await mockInvoiceService.getInvoice(invoice.id)).adjustments.debit).toBeCloseTo(500);
    expect((await mockInvoiceService.getInvoice(invoice.id)).outstanding).toBeCloseTo(10500);

    /* Reversal removes the note from the ledger again. */
    await mockInvoiceService.reverseAdjustmentNote(debit.id, { reason: 'Vendor absorbed the charge' });
    const after = await mockInvoiceService.getInvoice(invoice.id);
    expect(after.adjustments).toMatchObject({ credit: 0, debit: 0, net: 0, count: 0 });
    expect(after.outstanding).toBeCloseTo(10000);
  });

  it('rejected notes never touch the ledger', async () => {
    const invoice = await createApprovedInvoice();
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Disputed',
      amount: 4000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(note.id);
    await mockInvoiceService.rejectAdjustmentNote(note.id, { reason: 'Not supported by GRN' });
    expect((await mockInvoiceService.getAdjustmentNote(note.id)).status).toBe(ADJUSTMENT_NOTE_STATUS.REJECTED);
    expect((await mockInvoiceService.getInvoice(invoice.id)).outstanding).toBeCloseTo(10000);
    expect((await mockInvoiceService.getInvoice(invoice.id)).adjustments.count).toBe(0);
  });

  it('vendor payable balances and payment eligibility follow the notes', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Rejected goods',
      amount: 3000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(note.id);
    await mockInvoiceService.approveAdjustmentNote(note.id);

    const balances = await mockInvoiceService.getVendorPaymentBalances();
    const tata = balances.find((b) => b.vendor === 'Tata Steel Ltd');
    expect(tata.netPayable).toBeCloseTo(7000);
    expect(tata.creditNotes).toBeCloseTo(3000);
    expect(tata.outstanding).toBeCloseTo(7000);

    /* Invoice with a fully-crediting note drops out of the payable pool. */
    const other = await createApprovedInvoice({ amount: 5000, vendor: 'Tata Steel Ltd' });
    const fullCredit = await mockInvoiceService.createAdjustmentNote({
      invoiceId: other.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Returned',
      amount: 5000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(fullCredit.id);
    await mockInvoiceService.approveAdjustmentNote(fullCredit.id);
    expect((await mockInvoiceService.getInvoice(other.id)).outstanding).toBeCloseTo(0);
    const after = await mockInvoiceService.getVendorPaymentBalances();
    expect(after.find((b) => b.vendor === 'Tata Steel Ltd').outstanding).toBeCloseTo(7000);
  });

  it('reports price the adjusted outstanding', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Return',
      amount: 2000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(note.id);
    await mockInvoiceService.approveAdjustmentNote(note.id);

    const { reportsService: reports, computeAllReports } = await import('./reports');
    const all = computeAllReports(reports._getStores(), {
      dateRange: 'custom', customStart: '2020-01-01', customEnd: '2030-12-31'
    });
    expect(all.invoiceAging.rows.find((r) => r.invoiceNo === invoice.invoiceNo).outstanding).toBeCloseTo(8000);
    expect(all.outstandingPayables.rows.find((r) => r.invoiceNo === invoice.invoiceNo).outstanding).toBeCloseTo(8000);
    expect(all.outstandingPayables.totalOutstanding).toBeCloseTo(8000);
  });

  it('the dashboard financial snapshot prices the adjusted outstanding', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const note = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Return',
      amount: 2000,
      gst: 0
    });
    await mockInvoiceService.submitAdjustmentNote(note.id);
    await mockInvoiceService.approveAdjustmentNote(note.id);

    const { dashboardService } = await import('./dashboard');
    const snap = await dashboardService.getFinancialSnapshot('all');
    expect(snap.totalInvoiced).toBeCloseTo(10000);
    expect(snap.totalPaid).toBeCloseTo(0);
    /* Approved credit note reduces the dashboard outstanding — matching
       the invoice ledger and the Reports figures. */
    expect(snap.outstanding).toBeCloseTo(8000);
  });

  it('numbers credit and debit notes from their own sequences and links to the invoice', async () => {
    const invoice = await createApprovedInvoice({ amount: 10000 });
    const cn = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.CREDIT,
      reason: 'Return',
      amount: 1000,
      gst: 0
    });
    const dn = await mockInvoiceService.createAdjustmentNote({
      invoiceId: invoice.id,
      noteType: ADJUSTMENT_NOTE_TYPE.DEBIT,
      reason: 'Extra charge',
      amount: 100,
      gst: 0
    });
    expect(cn.noteNo).toMatch(/^CN-/);
    expect(dn.noteNo).toMatch(/^DN-/);
    expect(cn.noteNo).not.toBe(dn.noteNo);
    expect(cn.invoiceId).toBe(invoice.id);
    expect(cn.invoiceNo).toBe(invoice.invoiceNo);

    const linked = await mockInvoiceService.getAdjustmentNotesForInvoice({ invoiceNo: invoice.invoiceNo });
    expect(linked.notes).toHaveLength(2);

    /* An invoice with linked notes cannot be deleted until they are. */
    await expect(mockInvoiceService.deleteInvoice(invoice.id)).rejects.toThrow(/linked credit \/ debit note\(s\)/);
    await mockInvoiceService.deleteAdjustmentNote(cn.id);
    await mockInvoiceService.deleteAdjustmentNote(dn.id);
    await expect(mockInvoiceService.deleteInvoice(invoice.id)).resolves.toMatchObject({ id: invoice.id });
  });
});
