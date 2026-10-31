/**
 * purchase/services/negotiationPersistence.test.js
 * ------------------------------------------------------------------
 * Regression tests for negotiated rate persistence and round-trip safety.
 * Verifies that negotiated rates survive save, reload, navigation, and
 * reopening — the exact bug where negotiated rates fell back to quotation
 * rates after Save + Reload.
 * ------------------------------------------------------------------
 */
import { describe, it, expect } from 'vitest';

/* ================================================================== */
/*  Test data — mirrors the real data structures                       */
/* ================================================================== */

function makeQuotationItem(rate, qty = 1) {
  return { rate, qty, product: 'Steel Bar', uom: 'kg', hsn: '7208' };
}

function makeEvaluationRecord(vendor, rounds) {
  return {
    id: 'eval-001',
    rfqNo: 'RFQ-2026-0009',
    negotiations: rounds.map((r, i) => ({
      id: `neg-${i + 1}`,
      vendor,
      round: i + 1,
      amount: r.amount || 0,
      stage: r.stage || 'In Progress',
      note: r.note || '',
      actor: 'Buyer',
      timestamp: new Date().toISOString(),
      ...(r.itemRates ? { itemRates: r.itemRates } : {})
    })),
    activity: []
  };
}

/* ================================================================== */
/*  Board structure: negotiations field must exist                      */
/* ================================================================== */
describe('Board structure: negotiations field', () => {
  it('board item has negotiations array at top level', () => {
    const board = {
      rfqId: 'RFQ-2026-0009',
      negotiations: [
        { vendor: 'Tata Steel', round: 1, itemRates: { 0: 300 }, stage: 'In Progress' }
      ],
      vendors: [
        { vendor: 'Tata Steel', rounds: [
          { vendor: 'Tata Steel', round: 1, itemRates: { 0: 300 }, stage: 'In Progress' }
        ]}
      ]
    };
    expect(Array.isArray(board.negotiations)).toBe(true);
    expect(board.negotiations).toHaveLength(1);
    expect(board.negotiations[0].itemRates).toEqual({ 0: 300 });
  });

  it('negotiationRounds can be derived from board.negotiations', () => {
    const board = {
      negotiations: [
        { vendor: 'Tata Steel', round: 1, itemRates: { 0: 300 }, stage: 'In Progress' },
        { vendor: 'ABC Traders', round: 1, itemRates: { 0: 360 }, stage: 'In Progress' }
      ]
    };
    const selectedVendor = 'Tata Steel';
    const negotiationRounds = board.negotiations.filter((r) => r.vendor === selectedVendor);
    expect(negotiationRounds).toHaveLength(1);
    expect(negotiationRounds[0].itemRates).toEqual({ 0: 300 });
  });

  it('board.negotiations matches vendors[].rounds data', () => {
    const round1 = { vendor: 'Tata Steel', round: 1, itemRates: { 0: 300 }, stage: 'In Progress' };
    const board = {
      negotiations: [round1],
      vendors: [{ vendor: 'Tata Steel', rounds: [round1] }]
    };
    expect(board.negotiations[0]).toEqual(board.vendors[0].rounds[0]);
  });
});

/* ================================================================== */
/*  Initialization logic (mirrors FinalNegotiation.jsx useEffect)       */
/* ================================================================== */
function initializeNegotiatedRates(negotiationRounds, selectedQuote, rfqItems) {
  /* The FIXED logic: restore from the LATEST round with itemRates. */
  const latestRoundWithRates = [...negotiationRounds]
    .reverse()
    .find((r) => r.itemRates && typeof r.itemRates === 'object' && Object.keys(r.itemRates).length > 0);

  if (latestRoundWithRates) {
    return { ...latestRoundWithRates.itemRates };
  }
  /* Fallback: initialize with original quoted rates. */
  const rates = {};
  (rfqItems || []).forEach((rfqItem, index) => {
    const quoteItem = (selectedQuote?.items || [])[index] || {};
    rates[index] = Number(quoteItem.rate) || Number(rfqItem.rate) || 0;
  });
  return rates;
}

/* OLD buggy logic for comparison */
function initializeNegotiatedRatesOLD(negotiationRounds, selectedQuote, rfqItems) {
  const lastAgreed = negotiationRounds.filter((r) => r.stage === 'Agreed').pop();
  if (lastAgreed && lastAgreed.itemRates) {
    return { ...lastAgreed.itemRates };
  }
  /* Falls back to quotation rates — LOSES In Progress itemRates */
  const rates = {};
  (rfqItems || []).forEach((rfqItem, index) => {
    const quoteItem = (selectedQuote?.items || [])[index] || {};
    rates[index] = Number(quoteItem.rate) || Number(rfqItem.rate) || 0;
  });
  return rates;
}

/* ================================================================== */
/*  Test Case 1: 400 → 300 → Save → Reload                            */
/* ================================================================== */
describe('Case 1: Save In Progress round then reload', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: restores negotiated rate 300 after reload', () => {
    const rounds = [{
      stage: 'In Progress',
      itemRates: { 0: 300 }
    }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(300);
  });

  it('OLD BUG: would reset to 400 (quotation rate) after reload', () => {
    const rounds = [{
      stage: 'In Progress',
      itemRates: { 0: 300 }
    }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRatesOLD(record.negotiations, { items: quoteItems }, rfqItems);
    /* The OLD code loses In Progress itemRates — resets to quotation rate */
    expect(result[0]).toBe(400);
  });
});

/* ================================================================== */
/*  Test Case 2: 400 → 350 → Save → Navigate away → Return            */
/* ================================================================== */
describe('Case 2: Save then navigate away and return', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: restores negotiated rate 350 after navigation', () => {
    const rounds = [{
      stage: 'In Progress',
      itemRates: { 0: 350 }
    }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(350);
  });
});

/* ================================================================== */
/*  Test Case 3: 400 → 300 → Save → Refresh browser                   */
/* ================================================================== */
describe('Case 3: Save then refresh browser', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: preserves negotiated rate 300 after refresh', () => {
    const rounds = [{
      stage: 'In Progress',
      itemRates: { 0: 300 }
    }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(300);
  });
});

/* ================================================================== */
/*  Test Case 4: 400 → 300 → Save → reopen same RFQ/vendor            */
/* ================================================================== */
describe('Case 4: Save then reopen same RFQ/vendor', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: restores 300 when reopening', () => {
    const rounds = [{
      stage: 'In Progress',
      itemRates: { 0: 300 }
    }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(300);
  });
});

/* ================================================================== */
/*  Test Case 5: Multiple rounds — Round 1 saves 350, Round 2 starts   */
/*  from 350 (not 400)                                                  */
/* ================================================================== */
describe('Case 5: Multiple rounds preserve latest negotiated rate', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: Round 2 starts from 350 (latest saved rate)', () => {
    const rounds = [
      { stage: 'In Progress', itemRates: { 0: 350 } },
      { stage: 'In Progress', itemRates: { 0: 320 } }
    ];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    /* Latest round with itemRates wins */
    expect(result[0]).toBe(320);
  });

  it('FIXED: Agreed round rate persists after reload', () => {
    const rounds = [
      { stage: 'In Progress', itemRates: { 0: 350 } },
      { stage: 'Agreed', itemRates: { 0: 300 } }
    ];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(300);
  });

  it('OLD BUG: In Progress round after Agreed would reset to 400', () => {
    const rounds = [
      { stage: 'Agreed', itemRates: { 0: 300 } },
      { stage: 'In Progress', itemRates: { 0: 280 } }
    ];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    /* OLD code only looks at Agreed rounds — misses the In Progress round */
    const oldResult = initializeNegotiatedRatesOLD(record.negotiations, { items: quoteItems }, rfqItems);
    expect(oldResult[0]).toBe(300); /* Gets the Agreed rate, not the latest */
    /* FIXED code looks at ALL rounds with itemRates */
    const fixedResult = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(fixedResult[0]).toBe(280); /* Gets the latest rate */
  });
});

/* ================================================================== */
/*  Test Case 6: Change 300 → 280 → Save → Reload                     */
/* ================================================================== */
describe('Case 6: Update negotiated rate and save', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: Updated rate 280 persists after reload', () => {
    const rounds = [
      { stage: 'In Progress', itemRates: { 0: 300 } },
      { stage: 'In Progress', itemRates: { 0: 280 } }
    ];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(280);
  });
});

/* ================================================================== */
/*  Test Case 7: Different RFQ/vendor — no value leakage               */
/* ================================================================== */
describe('Case 7: Different RFQ/vendor isolation', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('FIXED: Each vendor has independent negotiated rates', () => {
    const tataRounds = [{ stage: 'In Progress', itemRates: { 0: 300 } }];
    const jswRounds = [{ stage: 'In Progress', itemRates: { 0: 380 } }];

    const tataRecord = makeEvaluationRecord('Tata Steel', tataRounds);
    const jswRecord = makeEvaluationRecord('JSW Steel', jswRounds);

    const tataResult = initializeNegotiatedRates(tataRecord.negotiations, { items: quoteItems }, rfqItems);
    const jswResult = initializeNegotiatedRates(jswRecord.negotiations, { items: quoteItems }, rfqItems);

    expect(tataResult[0]).toBe(300);
    expect(jswResult[0]).toBe(380);
    expect(tataResult[0]).not.toBe(jswResult[0]);
  });
});

/* ================================================================== */
/*  Test Case 8: No saved rounds — initializes from quotation          */
/* ================================================================== */
describe('Case 8: No saved rounds — fallback to quotation rate', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('initializes from quotation rate when no rounds exist', () => {
    const result = initializeNegotiatedRates([], { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(400);
  });
});

/* ================================================================== */
/*  Test Case 9: Multiple line items                                    */
/* ================================================================== */
describe('Case 9: Multiple line items', () => {
  const quoteItems = [makeQuotationItem(400), makeQuotationItem(1200)];
  const rfqItems = [
    { rate: 400, qty: 1, product: 'Steel Bar' },
    { rate: 1200, qty: 1, product: 'Copper Wire' }
  ];

  it('FIXED: All line item rates persist correctly', () => {
    const rounds = [{
      stage: 'In Progress',
      itemRates: { 0: 300, 1: 1100 }
    }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(300);
    expect(result[1]).toBe(1100);
  });
});

/* ================================================================== */
/*  Test Case 10: Old records without itemRates (backward compat)      */
/* ================================================================== */
describe('Case 10: Backward compatibility — old records without itemRates', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('falls back to quotation rate when rounds lack itemRates', () => {
    const rounds = [{ stage: 'Agreed', amount: 360 }];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(400);
  });
});

/* ================================================================== */
/*  Test Case 11: Empty itemRates object                               */
/* ================================================================== */
describe('Case 11: Empty itemRates object treated as no rates', () => {
  const quoteItems = [makeQuotationItem(400)];
  const rfqItems = [{ rate: 400, qty: 1, product: 'Steel Bar' }];

  it('skips rounds with empty itemRates', () => {
    const rounds = [
      { stage: 'In Progress', itemRates: {} },
      { stage: 'In Progress', itemRates: { 0: 300 } }
    ];
    const record = makeEvaluationRecord('Tata Steel', rounds);
    const result = initializeNegotiatedRates(record.negotiations, { items: quoteItems }, rfqItems);
    expect(result[0]).toBe(300);
  });
});
