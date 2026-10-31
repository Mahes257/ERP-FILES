/**
 * purchase/services/api/rfqApi.js
 * ------------------------------------------------------------------
 * REST calls for RFQ & Quotations. Consumed by the `rfqService`
 * facade in ../rfq.js, which falls back to the mock implementation
 * when the backend is unreachable.
 * ------------------------------------------------------------------
 */
import { purchaseDelete, purchaseGet, purchasePost, purchasePut } from '../../api';
import { getCurrentActor, normalizePage, unwrapResponse } from '../api-client';
import { todayLocal } from '../base';

function actorHeaders() {
  const actor = getCurrentActor();
  return { 'X-Actor-Id': actor.id, 'X-Actor-Name': actor.name, 'X-Actor-Role': actor.role };
}

/** True when the value is already a numeric database id (not an RFQ number). */
function isNumericId(value) {
  return /^\d+$/.test(String(value ?? '').trim());
}

export const rfqApi = {
  /**
   * Resolves an RFQ identifier to the numeric database id that the
   * by-id sub-routes (timeline / audit / comparison / writes) require.
   *
   * A page reached from the RFQ list always holds the numeric `id`, but a
   * deep link such as `/purchase/rfq/RFQ-2026-0039` carries the document
   * number instead. `GET /rfqs/{id}` accepts either form and always answers
   * with the numeric `id`, so a single lookup is enough — no guessing and no
   * hardcoded ids. Numeric ids return immediately, so existing callers are
   * unaffected.
   */
  async resolveId(id) {
    if (isNumericId(id)) return id;
    const wanted = String(id ?? '').trim();
    if (!wanted) throw new Error('An RFQ id or number is required');
    const { data } = await purchaseGet(`/rfqs/${encodeURIComponent(wanted)}`);
    const payload = unwrapResponse(data);
    if (!payload || payload.id == null) throw new Error(`RFQ ${wanted} was not found`);
    return payload.id;
  },
  async list({
    search,
    status,
    department,
    priority,
    category,
    project,
    requester,
    buyer,
    vendor,
    approvalStatus,
    currency,
    rfqNo,
    title,
    dateFrom,
    dateTo,
    closingFrom,
    closingTo,
    valueFrom,
    valueTo,
    page = 1,
    pageSize = 10,
    sortBy = 'createdAt',
    sortDir = 'desc'
  } = {}) {
    const { data } = await purchaseGet('/rfqs', {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(status && status !== 'All' ? { status } : {}),
      ...(department && department !== 'All' ? { department } : {}),
      ...(priority && priority !== 'All' ? { priority } : {}),
      ...(category && category !== 'All' ? { category } : {}),
      ...(project && project !== 'All' ? { project } : {}),
      ...(requester && requester !== 'All' ? { requester } : {}),
      ...(buyer && buyer !== 'All' ? { buyer } : {}),
      ...(vendor && vendor !== 'All' ? { vendor } : {}),
      ...(approvalStatus && approvalStatus !== 'All' ? { approvalStatus } : {}),
      ...(currency && currency !== 'All' ? { currency } : {}),
      ...(rfqNo ? { rfqNo } : {}),
      ...(title ? { title } : {}),
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      ...(closingFrom ? { closingFrom } : {}),
      ...(closingTo ? { closingTo } : {}),
      ...(valueFrom ? { valueFrom } : {}),
      ...(valueTo ? { valueTo } : {}),
      ...(sortDir === 'asc' ? { sort: sortBy } : { sort: `-${sortBy}` })
    });
    return normalizePage(unwrapResponse(data));
  },

  async get(id) {
    const { data } = await purchaseGet(`/rfqs/${id}`);
    return unwrapResponse(data);
  },

  async create(payload) {
    const { data } = await purchasePost('/rfqs', payload, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async update(id, patch) {
    const { data } = await purchasePut(`/rfqs/${id}`, patch, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async send(id) {
    const { data } = await purchasePost(`/rfqs/${id}/send`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async submitForReview(id, note) {
    const { data } = await purchasePost(`/rfqs/${id}/submit-review`, { note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async approve(id, note) {
    const { data } = await purchasePost(`/rfqs/${id}/approve`, { note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async reject(id, note) {
    const { data } = await purchasePost(`/rfqs/${id}/reject`, { note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async startEvaluation(id, note) {
    const { data } = await purchasePost(`/rfqs/${id}/evaluate`, { note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async award(id, vendorName, note) {
    const { data } = await purchasePost(`/rfqs/${id}/award`, { vendor: vendorName, note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async audit(id) {
    const { data } = await purchaseGet(`/rfqs/${await rfqApi.resolveId(id)}/audit`);
    return unwrapResponse(data);
  },

  async printPreview(id) {
    const { data } = await purchaseGet(`/rfqs/${id}/print-preview`);
    return unwrapResponse(data);
  },

  async logPrint(id) {
    const { data } = await purchasePost(`/rfqs/${id}/print-log`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  /**
   * RFQ → PO ("Raise Purchase Order").
   *
   * The backend exposes no dedicated `POST /rfqs/{id}/raise-po` route, so the
   * order is composed from the awarded RFQ plus its accepted quotation and
   * created through the standard purchase-order endpoint. This keeps the
   * PR → RFQ → Quotation → PO document chain intact and lets the backend
   * enforce it: the linked PR must exist, the RFQ must be Awarded and the
   * quotation must belong to the awarded supplier.
   *
   * Only the awarded supplier's quotation lines carry into the order — the
   * RFQ's own (estimated) rates are never used when a quote line exists, so
   * the PO always reflects the negotiated award value.
   */
  async raisePo(id, note) {
    const rfq = unwrapResponse((await purchaseGet(`/rfqs/${id}`)).data) || {};
    if (!rfq.rfqNo) throw new Error('RFQ not found');
    if (rfq.poNo) throw new Error(`Purchase order ${rfq.poNo} already raised for this RFQ`);
    if (String(rfq.status || '').toLowerCase() !== 'awarded' || !rfq.awardedVendor) {
      throw new Error('Only awarded RFQs can raise a purchase order');
    }
    /* Duplicate guard. The backend does not write the PO number back onto the
       RFQ (so `rfq.poNo` stays empty), and its order search does not match on
       rfqNo — so the existing order is looked up directly to stop a second
       "Create PO" from raising a duplicate order for the same award. */
    const existingOrders = unwrapResponse(
      (await purchaseGet('/orders', { page: 0, size: 500 })).data
    );
    const alreadyRaised = (Array.isArray(existingOrders) ? existingOrders : existingOrders?.content || [])
      .find((order) => order.rfqNo === rfq.rfqNo);
    if (alreadyRaised) throw new Error(`Purchase order ${alreadyRaised.poNo} already raised for this RFQ`);

    /* Page large enough that every quotation for the RFQ is present — the
       awarded-quote lookup below must not miss one behind pagination. */
    const rawQuotes = unwrapResponse((await purchaseGet('/quotations', { rfqNo: rfq.rfqNo, page: 0, size: 500 })).data);
    const quotes = Array.isArray(rawQuotes) ? rawQuotes : rawQuotes?.data || [];
    /* `awardedQuoteId` is stored as the quotation NUMBER by the award step. */
    const quote =
      quotes.find((q) => String(q.quotationNo) === String(rfq.awardedQuoteId)) ||
      quotes.find((q) => q.vendor === rfq.awardedVendor && q.status === 'Accepted') ||
      quotes.find((q) => q.vendor === rfq.awardedVendor) ||
      null;
    if (!quote) throw new Error(`No quotation found for the awarded supplier ${rfq.awardedVendor}`);

    const terms = rfq.commercialTerms || {};
    const taxRate = Number(terms.taxRate) || 18;
    const rfqLines = Array.isArray(rfq.items) ? rfq.items : [];
    const quoteLines = Array.isArray(quote.items) ? quote.items : [];
    const items = rfqLines.map((line, index) => {
      const quoted = quoteLines[index] || {};
      const gstRate = Number(quoted.gstRate) > 0 ? Number(quoted.gstRate) : taxRate;
      return {
        itemCode: line.itemCode || quoted.itemCode || '',
        product: line.product || quoted.product || quoted.productName || '',
        uom: line.uom || quoted.uom || 'Nos',
        qty: Number(line.qty ?? quoted.qty) || 0,
        rate: Number(quoted.rate ?? line.rate ?? line.expectedRate) || 0,
        discount: Number(quoted.discount) || 0,
        gstRate,
        expectedDate: line.requiredDate || line.expectedDate || quoted.deliveryDate || ''
      };
    });
    if (items.length === 0) throw new Error('No awarded lines found for this RFQ');

    /* Expected date = today + the awarded quotation's lead time. */
    const leadDays = Number(quote.leadTime) || 0;
    let expectedDate = '';
    if (leadDays > 0) {
      const expected = new Date();
      expected.setDate(expected.getDate() + leadDays);
      const pad = (n) => String(n).padStart(2, '0');
      expectedDate = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`;
    }

    const payload = {
      title: rfq.title || `Purchase order against ${rfq.rfqNo}`,
      vendor: rfq.awardedVendor,
      /* prNo only — the backend mirrors `reference` from it, and validates
         that a non-blank PR actually exists. Never fall back to the RFQ
         number here, which is not a requisition. */
      prNo: rfq.prNo || '',
      rfqNo: rfq.rfqNo,
      quotationNo: quote.quotationNo || '',
      orderDate: todayLocal(),
      expectedDate,
      currency: rfq.currency || 'INR',
      terms: quote.paymentTerms || terms.paymentTerms || '30 Days',
      deliveryTerms: terms.deliveryTerms || '',
      warranty: quote.warranty || terms.warranty || '',
      incoterm: rfq.incoterm || '',
      deliveryAddress: rfq.deliveryAddress || '',
      department: rfq.department || '',
      project: rfq.project || '',
      /* Freight and insurance travel in their own fields — the backend adds
         them to the document total separately from `charges`. */
      discount: Number(quote.discount) || 0,
      charges: Number(quote.charges) || 0,
      freight: Number(quote.freight) || 0,
      insurance: Number(quote.insurance) || 0,
      notes: note || quote.notes || `Raised from ${rfq.rfqNo} awarded quotation (${rfq.awardedVendor})`,
      items
    };

    const { data } = await purchasePost('/orders', payload, { headers: actorHeaders() });
    const po = unwrapResponse(data);
    return { po, pos: [po], rfq };
  },

  async close(id) {
    const { data } = await purchasePost(`/rfqs/${id}/close`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async cancel(id, note) {
    const { data } = await purchasePost(`/rfqs/${id}/cancel`, { note }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async duplicate(id) {
    const { data } = await purchasePost(`/rfqs/${id}/duplicate`, null, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async comment(id, text) {
    const { data } = await purchasePost(`/rfqs/${id}/comments`, { text }, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  async timeline(id) {
    const { data } = await purchaseGet(`/rfqs/${await rfqApi.resolveId(id)}/timeline`);
    return unwrapResponse(data);
  },

  async dashboard() {
    const { data } = await purchaseGet('/rfqs/dashboard');
    return unwrapResponse(data);
  },

  async delete(id) {
    const { data } = await purchaseDelete(`/rfqs/${id}`);
    return unwrapResponse(data);
  },

  async stats() {
    const { data } = await purchaseGet('/rfqs/stats');
    return unwrapResponse(data);
  },

  async quotationStats() {
    const { data } = await purchaseGet('/quotations/stats');
    return unwrapResponse(data);
  },

  async costEstimates() {
    const { data } = await purchaseGet('/rfqs/cost-estimates');
    return unwrapResponse(data);
  },

  async quotations({ search, status, rfqNo, page = 1, pageSize = 10, sortBy = 'submittedOn', sortDir = 'desc' } = {}) {
    const { data } = await purchaseGet('/quotations', {
      page: page - 1,
      size: pageSize,
      ...(search ? { search } : {}),
      ...(status && status !== 'All' ? { status } : {}),
      ...(rfqNo && rfqNo !== 'All' ? { rfqNo } : {}),
      ...(sortDir === 'asc' ? { sort: sortBy } : { sort: `-${sortBy}` })
    });
    return normalizePage(unwrapResponse(data));
  },

  async quotation(id) {
    const { data } = await purchaseGet(`/quotations/${id}`);
    return unwrapResponse(data);
  },

  async saveQuotation(payload) {
    const { data } = await purchasePost('/quotations', payload, { headers: actorHeaders() });
    return unwrapResponse(data);
  },

  /**
   * Price comparison in the enriched shape the pages consume
   * (`{ rfq, quotes, winner, highlights, … }`). The REST endpoint answers
   * `{ rfqNo, items, quotations }`, so the translation happens once here
   * instead of in all seven consumers.
   */
  async comparison(rfqId) {
    const resolvedId = await rfqApi.resolveId(rfqId);
    const { data } = await purchaseGet(`/rfqs/${resolvedId}/comparison`);
    const payload = unwrapResponse(data) || {};
    const quotes = payload.quotations || payload.quotes || [];
    let rfq = null;
    try {
      rfq = unwrapResponse((await purchaseGet(`/rfqs/${resolvedId}`)).data) || null;
    } catch {
      rfq = null;
    }
    const amount = (quote) => Number(quote?.total) || 0;
    const byTotal = [...quotes].sort((a, b) => amount(a) - amount(b));
    const byScore = [...quotes].sort((a, b) => (Number(b?.score) || 0) - (Number(a?.score) || 0));
    const byDelivery = [...quotes].sort((a, b) => (Number(a?.delivery) || 0) - (Number(b?.delivery) || 0));
    const lowest = byTotal[0] || null;
    const estimated = Number(rfq?.estimatedValue) || 0;
    return {
      ...payload,
      rfq: rfq || { rfqNo: payload.rfqNo },
      quotes: byScore.map((quote, index) => ({ ...quote, rank: index + 1 })),
      winner: byScore[0] || null,
      estimatedValue: estimated,
      savings:
        quotes.length > 1
          ? Math.max(0, Math.max(...quotes.map(amount)) - Math.min(...quotes.map(amount)))
          : 0,
      savingsVsEstimate: lowest ? Math.max(0, estimated - amount(lowest)) : 0,
      highlights: {
        lowestPrice: lowest,
        fastestDelivery: byDelivery[0] || null,
        bestScore: byScore[0] || null
      }
    };
  },

  /* ==================================================================
     EVALUATION WORKFLOW PERSISTENCE
     Technical Evaluation, Final/Price Negotiation, Supplier Selection
     and Selection Approval all persist one evaluation document per RFQ,
     so a saved score, round or selection survives a page refresh.
     ================================================================== */

  /** Every stored evaluation document (newest first). */
  async evaluationRecords() {
    const { data } = await purchaseGet('/rfqs/evaluation-records');
    return unwrapResponse(data) || [];
  },

  /** The stored evaluation document for one RFQ (null when none yet). */
  async evaluationRecord(id) {
    const response = await purchaseGet(`/rfqs/${id}/evaluation-record`);
    /* 204 No Content — the RFQ has never been evaluated. */
    if (!response || response.status === 204 || response.data == null || response.data === '') {
      return null;
    }
    return unwrapResponse(response.data);
  },

  /** Upserts the evaluation document for one RFQ. */
  async saveEvaluationRecord(id, payload = {}) {
    const { data } = await purchasePut(`/rfqs/${id}/evaluation-record`, payload, {
      headers: actorHeaders()
    });
    return unwrapResponse(data);
  },

  /** Negotiation rounds persisted for one RFQ (round order). */
  async negotiations(id) {
    const { data } = await purchaseGet(`/rfqs/${id}/negotiations`);
    return unwrapResponse(data) || [];
  }
};
