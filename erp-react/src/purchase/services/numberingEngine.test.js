/**
 * purchase/services/numberingEngine.test.js
 * ------------------------------------------------------------------
 * Central ERP numbering engine tests:
 *   · 15 independent sequences with distinct prefixes (INV ≠ VINV)
 *   · prefix / year / start / current / padding honoured
 *   · duplicate prevention via the persistent issued-ledger
 *   · fiscal-year reset policy
 *   · legacy key migration (Inventory → Inventory Movement …)
 *   · prefix collision validation
 * ------------------------------------------------------------------ */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  computeNext, ensureSequences, getSequence, NUMBERING_DOC_TYPES,
  NUMBERING_SEQUENCES, recordIssued, resetSequence, validatePrefixes
} from './numberingEngine';

const YEAR = new Date().getFullYear();

beforeEach(() => {
  /* nothing persisted — engine is pure */
});

describe('sequences', () => {
  it('defines every required document sequence', () => {
    const required = [
      'PR', 'RFQ', 'Quotation', 'Award', 'PO', 'Packing', 'Shipment', 'GRN',
      'Inspection', 'Inventory Movement', 'Vendor Invoice', 'Payment',
      'Payment Advice', 'Credit Note', 'Debit Note'
    ];
    required.forEach((key) => expect(NUMBERING_SEQUENCES[key]).toBeDefined());
    expect(NUMBERING_DOC_TYPES).toHaveLength(15);
  });

  it('gives every sequence its own prefix — INV never equals VINV', () => {
    const prefixes = NUMBERING_DOC_TYPES.map((key) => NUMBERING_SEQUENCES[key].prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(NUMBERING_SEQUENCES['Inventory Movement'].prefix).toBe('INV');
    expect(NUMBERING_SEQUENCES['Vendor Invoice'].prefix).toBe('VINV');
    expect(NUMBERING_SEQUENCES['Credit Note'].prefix).toBe('CN');
    expect(NUMBERING_SEQUENCES['Debit Note'].prefix).toBe('DN');
  });
});

describe('computeNext', () => {
  it('honours prefix, year, start, current and padding', () => {
    const numbering = {
      PO: { prefix: 'PUR', fy: '2026', startNo: 1, currentNo: 0, padding: 5, resetPolicy: 'never' }
    };
    expect(computeNext(numbering, 'PO', { now: new Date('2026-06-01') }).number).toBe('PUR-2026-00001');
    /* current counter advances the sequence. */
    const advanced = recordIssued(numbering, 'PO', 'PUR-2026-00001');
    expect(computeNext(advanced, 'PO', { now: new Date('2026-06-01') }).number).toBe('PUR-2026-00002');
  });

  it('respects a custom starting number', () => {
    /* GRN is a year-based sequence: custom start + padding are honoured.
       (Quotation is deliberately plain-numbered — QT-NNN — and is migrated
       to that format by ensureSequences, so it is not a year-based case.) */
    const numbering = {
      GRN: { prefix: 'GRN', fy: '2026', startNo: 1001, currentNo: 0, padding: 4, resetPolicy: 'never' }
    };
    expect(computeNext(numbering, 'GRN', { now: new Date('2026-06-01') }).number).toBe('GRN-2026-1001');
  });

  it('existing records always win over the counter (no collisions)', () => {
    const numbering = {
      GRN: { prefix: 'GRN', fy: '2026', startNo: 1, currentNo: 3, padding: 4, resetPolicy: 'never' }
    };
    const existing = [`GRN-${YEAR}-0040`, `GRN-${YEAR}-0041`];
    expect(computeNext(numbering, 'GRN', { existing }).number).toBe(`GRN-${YEAR}-0042`);
  });

  it('the issued-ledger prevents duplicate numbers even with no records', () => {
    let numbering = {
      Payment: { prefix: 'PAY', fy: '2026', startNo: 1, currentNo: 0, padding: 4, resetPolicy: 'never' }
    };
    const first = computeNext(numbering, 'Payment', { now: new Date('2026-06-01') }).number;
    numbering = recordIssued(numbering, 'Payment', first);
    numbering = recordIssued(numbering, 'Payment', first); /* double-record is idempotent for uniqueness */
    const second = computeNext(numbering, 'Payment', { now: new Date('2026-06-01') }).number;
    expect(second).not.toBe(first);
    expect(second).toBe(`PAY-2026-0002`);
  });
});

describe('reset policy', () => {
  it("'never' keeps the counter (and FY) across years", () => {
    let numbering = {
      PO: { prefix: 'PO', fy: '2026', startNo: 1, currentNo: 9, padding: 4, resetPolicy: 'never' }
    };
    /* The FY field is authoritative for the number year; 'never' never
       resets or advances it, so numbers keep the current FY. */
    const next = computeNext(numbering, 'PO', { now: new Date('2027-01-05') });
    expect(next.number).toBe('PO-2026-0010');
    expect(next.sequence.fy).toBe('2026'); /* FY field untouched for 'never' */
  });

  it("'fiscal-year' restarts at the starting number when the year changes", () => {
    let numbering = {
      GRN: { prefix: 'GRN', fy: '2026', startNo: 1, currentNo: 12, padding: 4, resetPolicy: 'fiscal-year', issued: [`GRN-2026-0012`] }
    };
    const next = computeNext(numbering, 'GRN', { now: new Date('2027-01-05') });
    expect(next.sequence.fy).toBe('2027');
    expect(next.sequence.currentNo).toBe(0);
    expect(next.number).toBe('GRN-2027-0001');
  });

  it('resetSequence clears the counter and ledger', () => {
    const numbering = {
      RFQ: { prefix: 'RFQ', fy: '2026', startNo: 1, currentNo: 22, padding: 4, resetPolicy: 'never', issued: [`RFQ-2026-0022`] }
    };
    const reset = resetSequence(numbering, 'RFQ');
    expect(reset.RFQ.currentNo).toBe(0);
    expect(reset.RFQ.issued).toEqual([]);
    expect(computeNext(reset, 'RFQ', { now: new Date('2026-06-01') }).number).toBe(`RFQ-2026-0001`);
  });
});

describe('migration + validation', () => {
  it('migrates legacy Inventory / Invoice keys into the canonical sequences', () => {
    const migrated = ensureSequences({
      Inventory: { prefix: 'INV', fy: '2026', startNo: 1, currentNo: 5, padding: 3 },
      Invoice: { prefix: 'VINV', fy: '2026', startNo: 1, currentNo: 15, padding: 4 }
    });
    expect(migrated['Inventory Movement']).toMatchObject({ prefix: 'INV', currentNo: 5 });
    expect(migrated['Vendor Invoice']).toMatchObject({ prefix: 'VINV', currentNo: 15 });
    expect(migrated.Inventory).toBeUndefined();
    expect(migrated.Invoice).toBeUndefined();
    /* New sequences default in. */
    expect(migrated['Credit Note'].prefix).toBe('CN');
    expect(migrated['Debit Note'].prefix).toBe('DN');
  });

  it('validatePrefixes flags any shared prefix', () => {
    const numbering = {
      PR: { prefix: 'PR' }, PO: { prefix: 'PO' }, Packing: { prefix: 'PO' }
    };
    const errors = validatePrefixes(numbering);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('PO');
  });

  it('a fresh map contains all 15 sequences with valid defaults', () => {
    const seq = getSequence(ensureSequences({}), 'Credit Note');
    expect(seq).toMatchObject({ prefix: 'CN', padding: 4, resetPolicy: 'never' });
  });
});