/**
 * purchase/services/api/invoiceApi.js
 * ------------------------------------------------------------------
 * REST calls for Purchase Invoices. Consumed by the `invoiceService`
 * facade in ../invoice.js, which falls back to the mock implementation
 * when the backend is unreachable.
 * ------------------------------------------------------------------
 */
import { purchaseDelete, purchaseGet, purchasePost, purchasePut } from '../../api';
import { getCurrentActor, normalizePage, unwrapResponse } from '../api-client';
import { PAYMENT_STATUS } from '../../constants';

function actorHeaders() {
  const actor = getCurrentActor();
  return { 'X-Actor-Id': actor.id, 'X-Actor-Name': actor.name, 'X-Actor-Role': actor.role };
}

/* The backend reports the payment state in an UPPER_SNAKE vocabulary
   (PAID / PARTIALLY_PAID / DUE / OVERDUE) while the rest of the UI reads
   the canonical PAYMENT_STATUS values. Align them here so payment-status
   tabs, badges and derivePaymentStatus() stop seeing an unknown value
   (the Partially Paid / Paid / Unpaid tabs counted 0 and the table showed
   the raw enum). */
const PAYMENT_STATUS_MAP = {
  PAID: PAYMENT_STATUS.PAID,
  PARTIALLY_PAID: PAYMENT_STATUS.PARTIALLY_PAID,
  DUE: PAYMENT_STATUS.UNPAID,
  UNPAID: PAYMENT_STATUS.UNPAID,
  OVERDUE: PAYMENT_STATUS.UNPAID,
  SCHEDULED: PAYMENT_STATUS.SCHEDULED,
  PROCESSING: PAYMENT_STATUS.PROCESSING,
  FAILED: PAYMENT_STATUS.FAILED
};

function normalizeInvoice(invoice) {
  if (!invoice || typeof invoice !== 'object') return invoice;
  const raw = invoice.paymentStatus;
  if (!raw) return invoice;
  const mapped = PAYMENT_STATUS_MAP[String(raw).toUpperCase().replace(/\s+/g, '_')];
  return mapped ? { ...invoice, paymentStatus: mapped } : invoice;
}

/** True when the value is already a numeric database id (not an invoice number). */
function isNumericId(value) {
  return /^\d+$/.test(String(value ?? '').trim());
}

export const invoiceApi = {
  /**
   * Resolves an invoice id from either of the two forms callers legitimately
   * hold: list rows, row actions and app links expose the numeric database
   * `id`, while the report tables, the payment-advice document chain and the
   * supplier-performance links only know the invoice number (e.g.
   * "VINV-2026-0004").
   *
   * `GET /invoices/{id}` binds a `Long` path variable, so handing it an
   * invoice number yields a 400 and the page cannot load. An invoice number
   * is therefore resolved against the existing list search — which already
   * matches `invoiceNo` — instead of guessing. Numeric ids pass straight
   * through, so existing callers are unaffected.
   */
  async resolveId(id) {
    if (isNumericId(id)) return id;
    const wanted = String(id ?? '').trim();
    if (!wanted) throw new Error('An invoice id or number is required');
    const { data } = await purchaseGet('/invoices', { page: 0, size: 10, search: wanted });
    const page = normalizePage(unwrapResponse(data));
    const match = (page.data || []).find(
      (row) =>
        String(row.invoiceNo) === wanted ||
        String(row.vendorInvoiceNo) === wanted ||
        String(row.id) === wanted
    );
    if (!match || match.id == null) throw new Error(`Invoice ${wanted} was not found`);
    return match.id;
  },
  async list({ search, status, page = 1, pageSize = 10, sortBy = 'invoiceDate', sortDir = 'desc' } = {}) {
    const { data } = await purchaseGet('/invoices', {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(status && status !== 'All' ? { status } : {}),
      ...(sortBy ? { sort: sortDir === 'asc' ? sortBy : `-${sortBy}` } : {})
    });
    const pageResult = normalizePage(unwrapResponse(data));
    return { ...pageResult, data: (pageResult.data || []).map(normalizeInvoice) };
  },

  async get(id) {
    const { data } = await purchaseGet(`/invoices/${await invoiceApi.resolveId(id)}`);
    return normalizeInvoice(unwrapResponse(data));
  },

  async create(payload) {
    const { data } = await purchasePost('/invoices', payload, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async update(id, patch) {
    const { data } = await purchasePut(`/invoices/${await invoiceApi.resolveId(id)}`, patch, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async submit(id) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/submit`, null, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async delete(id) {
    const { data } = await purchaseDelete(`/invoices/${await invoiceApi.resolveId(id)}`);
    return unwrapResponse(data);
  },

  async recordPayment(id, {
    method, full, amount, transactionReference, paymentNo,
    paymentDate, bank, currency, exchangeRate, charges, tds, notes
  } = {}) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/pay`, {
      method, full, amount, transactionReference, paymentNo,
      paymentDate, bank, currency, exchangeRate, charges, tds, notes
    }, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async reversePayment(id, paymentNo, { reason } = {}) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/payments/${paymentNo}/reverse`, { reason }, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async generateAdvice(id) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/advice`, null, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async sendAdvice(id) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/advice/send`, null, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async approve(id) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/approve`, null, { headers: actorHeaders() });
    return normalizeInvoice(unwrapResponse(data));
  },

  async reject(id, comments = '') {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/reject`, { comments }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async match(id) {
    const { data } = await purchaseGet(`/invoices/${await invoiceApi.resolveId(id)}/match`);
    return unwrapResponse(data);
  },

  async rematch(id) {
    const { data } = await purchasePost(`/invoices/${await invoiceApi.resolveId(id)}/match`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async timeline(id) {
    const { data } = await purchaseGet(`/invoices/${await invoiceApi.resolveId(id)}/timeline`);
    return unwrapResponse(data);
  },

  async paymentLedger(search) {
    const { data } = await purchaseGet('/invoices/payment-ledger', search ? { search } : undefined);
    return unwrapResponse(data);
  },

  async nextNumber() {
    const { data } = await purchaseGet('/invoices/next-number');
    return unwrapResponse(data);
  },

  async stats() {
    const { data } = await purchaseGet('/invoices/stats');
    const raw = unwrapResponse(data) || {};
    return {
      ...raw,
      Draft: raw.Draft ?? raw.draft ?? 0,
      Submitted: raw.Submitted ?? raw.submitted ?? 0,
      Approved: raw.Approved ?? raw.approved ?? 0,
      Rejected: raw.Rejected ?? raw.rejected ?? 0,
      'Partially Paid': raw['Partially Paid'] ?? raw.partiallyPaid ?? 0,
      Overdue: raw.Overdue ?? raw.overdueInvoices ?? 0,
      outstanding: raw.outstanding ?? raw.dueAmount ?? raw.totalPayable ?? 0
    };
  }
};

/* ------------------------------------------------------------------ */
/*  Adjustment Notes (Credit / Debit Notes) — real backend persistence  */
/* ------------------------------------------------------------------ */
const NOTE_BASE = '/adjustment-notes';

export const adjustmentNoteApi = {
  async list({ search, status, type, vendor, page = 1, pageSize = 10, sortBy = 'noteDate', sortDir = 'desc' } = {}) {
    const { data } = await purchaseGet(NOTE_BASE, {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(status && status !== 'All' ? { status } : {}),
      ...(sortBy ? { sort: sortDir === 'asc' ? sortBy : `-${sortBy}` } : {})
    });
    return normalizePage(unwrapResponse(data));
  },

  async get(id) {
    const { data } = await purchaseGet(`${NOTE_BASE}/${id}`);
    return unwrapResponse(data);
  },

  async create(payload) {
    const { data } = await purchasePost(NOTE_BASE, payload, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async update(id, patch) {
    const { data } = await purchasePut(`${NOTE_BASE}/${id}`, patch, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async remove(id) {
    const { data } = await purchaseDelete(`${NOTE_BASE}/${id}`);
    return unwrapResponse(data);
  },

  async submit(id) {
    const { data } = await purchasePost(`${NOTE_BASE}/${id}/submit`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async approve(id, comments = '') {
    const { data } = await purchasePost(`${NOTE_BASE}/${id}/approve`, { comments }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async reject(id, comments = '') {
    const { data } = await purchasePost(`${NOTE_BASE}/${id}/reject`, { comments }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async stats() {
    const { data } = await purchaseGet(`${NOTE_BASE}/stats`);
    return unwrapResponse(data);
  },

  async nextNumber(noteType = 'Credit') {
    const { data } = await purchaseGet(`${NOTE_BASE}/next-number`, { noteType });
    return unwrapResponse(data);
  }
};
