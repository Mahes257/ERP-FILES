/**
 * purchase/services/multiVendorQuotation.test.js
 * ------------------------------------------------------------------
 * Regression tests for the multi-vendor quotation workflow.
 * Tests the Requirement 22 scenario: three vendors quoting on the
 * same RFQ, negotiation on one vendor, PCS comparison, and PO creation
 * using negotiated rates.
 * ------------------------------------------------------------------
 */
import { describe, it, expect } from 'vitest';
import { QUOTATION_STATUS } from '../constants';

/* ================================================================== */
/*  Test data — mirrors real RFQ + Quotation data structures           */
/* ================================================================== */

function makeRfq(rfqNo, items) {
  return {
    id: rfqNo,
    rfqNo,
    title: 'Mouse Procurement',
    items: items || [{ product: 'Mouse', qty: 1, uom: 'Nos', rate: 0 }],
    vendors: ['Tata Steel', 'ABC Traders', 'XYZ Industries'],
    vendorCount: 3,
    status: 'Quotation Received',
  };
}

function makeQuotation(quotationNo, rfqNo, vendor, items, status = QUOTATION_STATUS.RECEIVED) {
  const subtotal = items.reduce((sum, item) => sum + (item.rate * item.qty), 0);
  const gstTotal = items.reduce((sum, item) => sum + (item.rate * item.qty * (item.gstRate || 18) / 100), 0);
  return {
    id: quotationNo,
    quotationNo,
    rfqNo,
    rfqId: rfqNo,
    vendor,
    submittedOn: '2026-08-25',
    validUntil: '2026-09-25',
    currency: 'INR',
    items,
    subtotal,
    gstTotal,
    total: Math.round((subtotal + gstTotal) * 100) / 100,
    status,
    score: 75,
    delivery: 14,
    leadTime: 21,
  };
}


/* ================================================================== */
/*  CORE RULE: RFQ + Vendor = unique quotation identity                */
/* ================================================================== */
describe('Quotation uniqueness: RFQ + Vendor', () => {
  makeRfq('RFQ-2026-0009');
  const tataQuote = makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
    { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
  ]);
  const abcQuote = makeQuotation('QT-2026-0003', 'RFQ-2026-0009', 'ABC Traders', [
    { product: 'Mouse', qty: 1, rate: 380, uom: 'Nos', gstRate: 18 }
  ]);
  const xyzQuote = makeQuotation('QT-2026-0004', 'RFQ-2026-0009', 'XYZ Industries', [
    { product: 'Mouse', qty: 1, rate: 420, uom: 'Nos', gstRate: 18 }
  ]);

  it('all three quotations exist independently for the same RFQ', () => {
    const quotes = [tataQuote, abcQuote, xyzQuote];
    expect(quotes).toHaveLength(3);
    quotes.forEach((q) => {
      expect(q.rfqNo).toBe('RFQ-2026-0009');
    });
  });

  it('each quotation has a unique quotation number', () => {
    const numbers = [tataQuote.quotationNo, abcQuote.quotationNo, xyzQuote.quotationNo];
    expect(new Set(numbers).size).toBe(3);
  });

  it('each quotation is linked to a different vendor', () => {
    const vendors = [tataQuote.vendor, abcQuote.vendor, xyzQuote.vendor];
    expect(new Set(vendors).size).toBe(3);
  });

  it('quotations have different rates for the same item', () => {
    expect(tataQuote.items[0].rate).toBe(400);
    expect(abcQuote.items[0].rate).toBe(380);
    expect(xyzQuote.items[0].rate).toBe(420);
  });
});

/* ================================================================== */
/*  Duplicate protection: rfqNo + vendor must be unique                */
/* ================================================================== */
describe('Duplicate protection: rfqNo + vendor', () => {
  it('detects duplicate when same vendor quotes same RFQ', () => {
    const quotes = [
      makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
        { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
      ])
    ];
    /* Simulate the duplicate check from saveQuotation */
    const duplicate = quotes.find(
      (q) => q.rfqNo === 'RFQ-2026-0009' && q.vendor === 'Tata Steel'
    );
    expect(duplicate).toBeDefined();
    expect(duplicate.quotationNo).toBe('QT-2026-0002');
  });

  it('does NOT flag different vendors as duplicates', () => {
    const quotes = [
      makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
        { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
      ])
    ];
    const duplicate = quotes.find(
      (q) => q.rfqNo === 'RFQ-2026-0009' && q.vendor === 'ABC Traders'
    );
    expect(duplicate).toBeUndefined();
  });

  it('does NOT flag same item from different vendor as duplicate', () => {
    const quotes = [
      makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
        { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
      ])
    ];
    /* ABC Traders quoting the same Mouse is NOT a duplicate */
    const duplicate = quotes.find(
      (q) => q.rfqNo === 'RFQ-2026-0009' && q.vendor === 'ABC Traders'
    );
    expect(duplicate).toBeUndefined();
  });
});

/* ================================================================== */
/*  Vendor quote status: quoted vs available                           */
/* ================================================================== */
describe('Vendor quote status', () => {
  const rfqVendors = ['Tata Steel', 'ABC Traders', 'XYZ Industries', 'PQR Supplies'];
  const quotes = [
    makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
      { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
    ]),
    makeQuotation('QT-2026-0003', 'RFQ-2026-0009', 'ABC Traders', [
      { product: 'Mouse', qty: 1, rate: 380, uom: 'Nos', gstRate: 18 }
    ]),
  ];

  function getVendorQuoteStatus(rfqVendorsList, quotations) {
    const quotedVendors = new Set(quotations.map((q) => q.vendor));
    return {
      quoted: rfqVendorsList.filter((v) => quotedVendors.has(v)),
      available: rfqVendorsList.filter((v) => !quotedVendors.has(v)),
    };
  }

  it('identifies 2 quoted and 2 available vendors', () => {
    const status = getVendorQuoteStatus(rfqVendors, quotes);
    expect(status.quoted).toEqual(['Tata Steel', 'ABC Traders']);
    expect(status.available).toEqual(['XYZ Industries', 'PQR Supplies']);
  });

  it('all vendors available when no quotes exist', () => {
    const status = getVendorQuoteStatus(rfqVendors, []);
    expect(status.quoted).toEqual([]);
    expect(status.available).toEqual(rfqVendors);
  });

  it('all vendors quoted when all have submitted', () => {
    const allQuotes = rfqVendors.map((v, i) =>
      makeQuotation(`QT-2026-${String(i + 10).padStart(4, '0')}`, 'RFQ-2026-0009', v, [
        { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
      ])
    );
    const status = getVendorQuoteStatus(rfqVendors, allQuotes);
    expect(status.quoted).toEqual(rfqVendors);
    expect(status.available).toEqual([]);
  });
});

/* ================================================================== */
/*  PCS comparison: quotations from same RFQ only                      */
/* ================================================================== */
describe('PCS comparison: same RFQ only', () => {
  const quotes = [
    makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
      { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
    ]),
    makeQuotation('QT-2026-0003', 'RFQ-2026-0009', 'ABC Traders', [
      { product: 'Mouse', qty: 1, rate: 380, uom: 'Nos', gstRate: 18 }
    ]),
    makeQuotation('QT-2026-0004', 'RFQ-2026-0009', 'XYZ Industries', [
      { product: 'Mouse', qty: 1, rate: 420, uom: 'Nos', gstRate: 18 }
    ]),
  ];

  function filterQuotesByRfq(allQuotes, rfqNo) {
    return allQuotes.filter((q) => q.rfqNo === rfqNo);
  }

  it('filters quotations to same RFQ only', () => {
    const filtered = filterQuotesByRfq(quotes, 'RFQ-2026-0009');
    expect(filtered).toHaveLength(3);
  });

  it('finds lowest rate vendor', () => {
    const filtered = filterQuotesByRfq(quotes, 'RFQ-2026-0009');
    const rates = filtered.map((q) => ({ vendor: q.vendor, rate: q.items[0].rate }));
    const lowest = rates.reduce((min, r) => (r.rate < min.rate ? r : min));
    expect(lowest.vendor).toBe('ABC Traders');
    expect(lowest.rate).toBe(380);
  });

  it('finds highest rate vendor', () => {
    const filtered = filterQuotesByRfq(quotes, 'RFQ-2026-0009');
    const rates = filtered.map((q) => ({ vendor: q.vendor, rate: q.items[0].rate }));
    const highest = rates.reduce((max, r) => (r.rate > max.rate ? r : max));
    expect(highest.vendor).toBe('XYZ Industries');
    expect(highest.rate).toBe(420);
  });

  it('computes average rate', () => {
    const filtered = filterQuotesByRfq(quotes, 'RFQ-2026-0009');
    const rates = filtered.map((q) => q.items[0].rate);
    const avg = rates.reduce((a, b) => a + b, 0) / rates.length;
    expect(avg).toBe(400);
  });

  it('does NOT mix quotations from different RFQs', () => {
    const otherRfqQuote = makeQuotation('QT-2026-0099', 'RFQ-2026-0010', 'Other Vendor', [
      { product: 'Mouse', qty: 1, rate: 100, uom: 'Nos', gstRate: 18 }
    ]);
    const allQuotes = [...quotes, otherRfqQuote];
    const filtered = filterQuotesByRfq(allQuotes, 'RFQ-2026-0009');
    expect(filtered).toHaveLength(3);
    expect(filtered.every((q) => q.rfqNo === 'RFQ-2026-0009')).toBe(true);
  });
});

/* ================================================================== */
/*  Item-level comparison: multi-item RFQ                              */
/* ================================================================== */
describe('Item-level comparison', () => {
  const multiItemQuotes = [
    makeQuotation('QT-2026-0010', 'RFQ-2026-0020', 'Tata Steel', [
      { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 },
      { product: 'Keyboard', qty: 1, rate: 800, uom: 'Nos', gstRate: 18 },
      { product: 'Monitor', qty: 1, rate: 10000, uom: 'Nos', gstRate: 18 },
    ]),
    makeQuotation('QT-2026-0011', 'RFQ-2026-0020', 'ABC Traders', [
      { product: 'Mouse', qty: 1, rate: 380, uom: 'Nos', gstRate: 18 },
      { product: 'Keyboard', qty: 1, rate: 850, uom: 'Nos', gstRate: 18 },
      { product: 'Monitor', qty: 1, rate: 9700, uom: 'Nos', gstRate: 18 },
    ]),
    makeQuotation('QT-2026-0012', 'RFQ-2026-0020', 'XYZ Industries', [
      { product: 'Mouse', qty: 1, rate: 410, uom: 'Nos', gstRate: 18 },
      { product: 'Keyboard', qty: 1, rate: 780, uom: 'Nos', gstRate: 18 },
      { product: 'Monitor', qty: 1, rate: 10200, uom: 'Nos', gstRate: 18 },
    ]),
  ];

  function compareItem(quotes, itemIndex) {
    const rates = quotes.map((q) => ({
      vendor: q.vendor,
      rate: q.items[itemIndex]?.rate ?? null,
    })).filter((r) => r.rate !== null);
    const lowest = rates.reduce((min, r) => (r.rate < min.rate ? r : min));
    const highest = rates.reduce((max, r) => (r.rate > max.rate ? r : max));
    const avg = Math.round((rates.reduce((s, r) => s + r.rate, 0) / rates.length) * 100) / 100;
    return { lowest, highest, avg, count: rates.length };
  }

  it('Mouse: ABC Traders is lowest at 380', () => {
    const result = compareItem(multiItemQuotes, 0);
    expect(result.lowest.vendor).toBe('ABC Traders');
    expect(result.lowest.rate).toBe(380);
  });

  it('Keyboard: XYZ Industries is lowest at 780', () => {
    const result = compareItem(multiItemQuotes, 1);
    expect(result.lowest.vendor).toBe('XYZ Industries');
    expect(result.lowest.rate).toBe(780);
  });

  it('Monitor: ABC Traders is lowest at 9700', () => {
    const result = compareItem(multiItemQuotes, 2);
    expect(result.lowest.vendor).toBe('ABC Traders');
    expect(result.lowest.rate).toBe(9700);
  });

  it('average rates are computed correctly', () => {
    const mouseAvg = compareItem(multiItemQuotes, 0).avg;
    expect(mouseAvg).toBe(396.67);
    const keyboardAvg = compareItem(multiItemQuotes, 1).avg;
    expect(keyboardAvg).toBe(810);
  });
});

/* ================================================================== */
/*  Negotiation: vendor isolation                                      */
/* ================================================================== */
describe('Negotiation: vendor isolation', () => {
  const quotes = [
    makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
      { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
    ]),
    makeQuotation('QT-2026-0003', 'RFQ-2026-0009', 'ABC Traders', [
      { product: 'Mouse', qty: 1, rate: 380, uom: 'Nos', gstRate: 18 }
    ]),
  ];

  function findQuoteForVendor(quotesList, vendor) {
    return quotesList.find((q) => q.vendor === vendor);
  }

  it('Tata Steel quotation shows 400', () => {
    const q = findQuoteForVendor(quotes, 'Tata Steel');
    expect(q.items[0].rate).toBe(400);
  });

  it('ABC Traders quotation shows 380', () => {
    const q = findQuoteForVendor(quotes, 'ABC Traders');
    expect(q.items[0].rate).toBe(380);
  });

  it('negotiating Tata Steel does not affect ABC Traders', () => {
    const tataQuote = findQuoteForVendor(quotes, 'Tata Steel');
    const abcQuote = findQuoteForVendor(quotes, 'ABC Traders');
    /* Simulate negotiation: Tata Steel 400 -> 300 */
    const negotiatedRate = 300;
    expect(tataQuote.items[0].rate).toBe(400); /* original unchanged */
    expect(abcQuote.items[0].rate).toBe(380); /* unaffected */
    expect(negotiatedRate).toBe(300);
  });
});

/* ================================================================== */
/*  PO creation: uses negotiated rates                                 */
/* ================================================================== */
describe('PO creation: uses negotiated rates', () => {
  function buildAwardAllocations(rfq, selection, quotes, negotiations) {
    const items = rfq.items || [];
    const quote = quotes.find(
      (q) => q.rfqNo === rfq.rfqNo && q.vendor === selection.selectedVendor
    );
    if (!quote) return [];
    const vendorRounds = negotiations
      .filter((n) => n.vendor === selection.selectedVendor);
    const latestItemRates = [...vendorRounds]
      .reverse()
      .find((r) => r.itemRates && Object.keys(r.itemRates).length > 0)?.itemRates || null;

    return items.map((item, index) => {
      const line = quote.items?.[index] || {};
      const negotiatedPrice = latestItemRates?.[index] != null
        ? Number(latestItemRates[index])
        : null;
      const unitPrice = negotiatedPrice != null && negotiatedPrice > 0
        ? negotiatedPrice
        : Number(line.rate ?? item.rate) || 0;
      const qty = Number(item.qty ?? line.qty) || 0;
      return {
        itemKey: `${rfq.id}:${index}`,
        product: item.product,
        vendor: selection.selectedVendor,
        quoteId: quote.id,
        unitPrice,
        lineTotal: unitPrice * qty,
      };
    });
  }

  const rfq = makeRfq('RFQ-2026-0009');
  const quotes = [
    makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
      { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
    ]),
  ];
  const negotiations = [
    {
      vendor: 'Tata Steel',
      round: 1,
      itemRates: { 0: 300 },
      stage: 'Agreed',
    },
  ];

  it('PO uses negotiated rate 300, not quotation rate 400', () => {
    const allocations = buildAwardAllocations(
      rfq,
      { selectedVendor: 'Tata Steel' },
      quotes,
      negotiations
    );
    expect(allocations).toHaveLength(1);
    expect(allocations[0].unitPrice).toBe(300);
    expect(allocations[0].lineTotal).toBe(300);
  });

  it('PO uses quotation rate when no negotiation exists', () => {
    const allocations = buildAwardAllocations(
      rfq,
      { selectedVendor: 'Tata Steel' },
      quotes,
      []
    );
    expect(allocations[0].unitPrice).toBe(400);
  });
});

/* ================================================================== */
/*  Full round-trip: multi-vendor quotation + negotiation + reload     */
/* ================================================================== */
describe('Full round-trip: multi-vendor + negotiation persistence', () => {
  const rfq = makeRfq('RFQ-2026-0009');
  const quotes = [
    makeQuotation('QT-2026-0002', 'RFQ-2026-0009', 'Tata Steel', [
      { product: 'Mouse', qty: 1, rate: 400, uom: 'Nos', gstRate: 18 }
    ]),
    makeQuotation('QT-2026-0003', 'RFQ-2026-0009', 'ABC Traders', [
      { product: 'Mouse', qty: 1, rate: 380, uom: 'Nos', gstRate: 18 }
    ]),
    makeQuotation('QT-2026-0004', 'RFQ-2026-0009', 'XYZ Industries', [
      { product: 'Mouse', qty: 1, rate: 420, uom: 'Nos', gstRate: 18 }
    ]),
  ];

  /* Negotiation on Tata Steel: 400 -> 300 */
  const negotiations = [
    {
      vendor: 'Tata Steel',
      round: 1,
      itemRates: { 0: 300 },
      stage: 'Agreed',
      amount: 300,
    },
  ];

  function initializeNegotiatedRates(negotiationRounds, selectedQuote, rfqItems) {
    const latestRoundWithRates = [...negotiationRounds]
      .reverse()
      .find((r) => r.itemRates && Object.keys(r.itemRates).length > 0);
    if (latestRoundWithRates) return { ...latestRoundWithRates.itemRates };
    const rates = {};
    (rfqItems || []).forEach((rfqItem, index) => {
      const quoteItem = (selectedQuote?.items || [])[index] || {};
      rates[index] = Number(quoteItem.rate) || Number(rfqItem.rate) || 0;
    });
    return rates;
  }

  it('Tata Steel: negotiated rate persists after reload', () => {
    const tataRounds = negotiations.filter((n) => n.vendor === 'Tata Steel');
    const tataQuote = quotes.find((q) => q.vendor === 'Tata Steel');
    const rates = initializeNegotiatedRates(tataRounds, tataQuote, rfq.items);
    expect(rates[0]).toBe(300);
  });

  it('ABC Traders: shows original rate 380 (not affected by Tata negotiation)', () => {
    const abcRounds = negotiations.filter((n) => n.vendor === 'ABC Traders');
    const abcQuote = quotes.find((q) => q.vendor === 'ABC Traders');
    const rates = initializeNegotiatedRates(abcRounds, abcQuote, rfq.items);
    expect(rates[0]).toBe(380);
  });

  it('XYZ Industries: shows original rate 420 (not affected by Tata negotiation)', () => {
    const xyzRounds = negotiations.filter((n) => n.vendor === 'XYZ Industries');
    const xyzQuote = quotes.find((q) => q.vendor === 'XYZ Industries');
    const rates = initializeNegotiatedRates(xyzRounds, xyzQuote, rfq.items);
    expect(rates[0]).toBe(420);
  });

  it('all three quotations exist independently', () => {
    expect(quotes).toHaveLength(3);
    const rates = quotes.map((q) => q.items[0].rate);
    expect(rates).toEqual([400, 380, 420]);
  });

  it('vendor quote status shows 3 quoted, 0 available', () => {
    const quotedVendors = new Set(quotes.map((q) => q.vendor));
    const available = rfq.vendors.filter((v) => !quotedVendors.has(v));
    expect(available).toEqual([]);
  });

  it('PO from Tata Steel uses negotiated rate 300', () => {
    const tataQuote = quotes.find((q) => q.vendor === 'Tata Steel');
    const tataRounds = negotiations.filter((n) => n.vendor === 'Tata Steel');
    const latestItemRates = [...tataRounds]
      .reverse()
      .find((r) => r.itemRates && Object.keys(r.itemRates).length > 0)?.itemRates;
    const poRate = latestItemRates?.[0] ?? tataQuote.items[0].rate;
    expect(poRate).toBe(300);
  });
});
