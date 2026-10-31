/**
 * Unit tests for the shared version-comparison layer.
 *
 * These live next to the module they cover (the repository's convention for
 * pure frontend utilities — see readCache.test.js, creditNoteDiscount.test.js).
 * No existing suite covers revision comparison, and the logic is pure, so a
 * colocated unit test is the cheapest reliable coverage; the view pages that
 * consume it are exercised through the same functions.
 *
 * The fixtures mirror the shape the Sales detail endpoints actually return
 * (`GET /{module}/{id}`), captured from the running backend: revision rows carry
 * `revision`/`revisionOf`/`revisionDate`/`latestRevision` and their own `items`.
 */
import { describe, expect, it } from 'vitest';
import {
  chainEntryFor,
  changeByLabel,
  changeCount,
  compareRevisionSnapshots,
  comparisonDirection,
  currentChainEntry,
  diffFields,
  diffItems,
  displayValue,
  fieldLabel,
  labelKey,
  previousChainEntry,
  sameValue,
  sortRevisionChain
} from './versionDiff';

const chain = [
  { id: 9, number: 'QTN-2026-000004', revision: 0, status: 'draft', latestRevision: false },
  { id: 10, number: 'QTN-2026-000004(1)', revision: 1, status: 'draft', latestRevision: false },
  { id: 11, number: 'QTN-2026-000004(2)', revision: 2, status: 'draft', latestRevision: true }
];

/** Revision 1 of the real QTN-2026-000004 chain. */
const revision1 = {
  id: 10,
  quotationNo: 'QTN-2026-000004(1)',
  revision: 1,
  revisionOf: 9,
  revisionDate: '2026-09-30T15:53:54.548474',
  latestRevision: false,
  createdAt: '2026-09-30T15:10:00',
  updatedAt: '2026-09-30T15:53:54',
  createdBy: 'admin@vishaktech.com',
  displayUnit: false,
  grandTotal: 1180,
  itemsCount: 1,
  poStatus: 'Released',
  clientName: 'Apex Industries',
  items: [{ id: 8, description: 'SS Bracket 3 mm', uom: 'Nos', qty: 4, rate: 250, gstRate: 18, total: 1180 }]
};

/** Revision 2 — displayUnit toggled, quantity edited, one line added. */
const revision2 = {
  ...revision1,
  id: 11,
  quotationNo: 'QTN-2026-000004(2)',
  revision: 2,
  revisionDate: '2026-09-30T15:57:24.956077',
  latestRevision: true,
  updatedAt: '2026-09-30T15:57:24',
  displayUnit: true,
  grandTotal: 2065,
  itemsCount: 2,
  poStatus: 'Draft',
  items: [
    { id: 21, description: 'SS Bracket 3 mm', uom: 'Nos', qty: 5, rate: 250, gstRate: 18, total: 1475 },
    { id: 22, description: 'MS Washer 8 mm', uom: 'Nos', qty: 2, rate: 295, gstRate: 18, total: 590 }
  ]
};

describe('value comparison', () => {
  it('treats null, undefined and empty string as the same absence', () => {
    expect(sameValue(null, '')).toBe(true);
    expect(sameValue(undefined, null)).toBe(true);
    expect(sameValue('  ', '')).toBe(true);
  });

  it('compares numbers by value, so a scale difference is not a change', () => {
    expect(sameValue(0, '0.00')).toBe(true);
    expect(sameValue('1180.00', 1180)).toBe(true);
    expect(sameValue(1.5, '1.50')).toBe(true);
    expect(sameValue(1180, 1181)).toBe(false);
  });

  it('reports a real edit between two non-empty values', () => {
    expect(sameValue('Draft', 'Approved')).toBe(false);
    expect(sameValue('', 'Approved')).toBe(false);
  });

  it('formats values for display instead of leaking raw JSON', () => {
    expect(displayValue(null)).toBe('—');
    expect(displayValue(true)).toBe('Yes');
    expect(displayValue('1180.00')).toBe('1180');
    expect(displayValue('2026-09-30')).toContain('2026');
  });
});

describe('field labels', () => {
  it('uses the document wording the view pages already show', () => {
    expect(fieldLabel('validUntil')).toBe('Valid Till');
    expect(fieldLabel('referencePrNo')).toBe('Reference PR No');
    expect(fieldLabel('cnNo')).toBe('Credit Note No');
  });

  it('keeps the parent label on a nested custom field', () => {
    expect(fieldLabel('customFields.batchNo')).toBe('Custom Field · Batch No');
  });

  it('falls back to a readable label for an unmapped field', () => {
    expect(fieldLabel('someNewColumn')).toBe('Some New Column');
  });

  it('matches labels ignoring case, spacing and punctuation', () => {
    expect(labelKey('Reference PR No')).toBe(labelKey('Reference Pr No'));
  });
});

describe('diffFields', () => {
  it('reports the real edit and not the revision plumbing', () => {
    const fields = diffFields(revision1, revision2);
    const names = fields.map((f) => f.field);
    expect(names).toContain('displayUnit');
    // Revision metadata and read-model derived columns must never appear.
    for (const noisy of [
      'id', 'quotationNo', 'revision', 'revisionOf', 'revisionDate', 'latestRevision',
      'createdAt', 'updatedAt', 'createdBy', 'itemsCount', 'poStatus'
    ]) {
      expect(names).not.toContain(noisy);
    }
  });

  it('classifies added, modified and removed values', () => {
    const fields = diffFields(
      { terms: 'Net 30', remarks: 'old note' },
      { terms: 'Net 45', discountPct: 5 }
    );
    const byField = Object.fromEntries(fields.map((f) => [f.field, f]));
    expect(byField.terms.type).toBe('modified');
    expect(byField.terms.previousValue).toBe('Net 30');
    expect(byField.terms.selectedValue).toBe('Net 45');
    expect(byField.remarks.type).toBe('removed');
    expect(byField.discountPct.type).toBe('added');
  });

  it('reports 0 → 5 as a modification, not as a value appearing from nowhere', () => {
    const fields = diffFields({ discountPct: 0 }, { discountPct: 5 });
    expect(fields[0].type).toBe('modified');
    expect(fields[0].previousValue).toBe('0');
  });

  it('diffs nested plain objects key by key', () => {
    const fields = diffFields(
      { customFields: { batchNo: 'B1', serialNo: 'S1' } },
      { customFields: { batchNo: 'B2', serialNo: 'S1' } }
    );
    expect(fields.map((f) => f.field)).toEqual(['customFields.batchNo']);
  });

  it('ignores a null-vs-empty-string rewrite', () => {
    expect(diffFields({ remarks: null }, { remarks: '' })).toEqual([]);
  });
});

describe('diffItems', () => {
  it('pairs rows across revisions by business identity, not row id', () => {
    const items = diffItems(revision1.items, revision2.items);
    expect(items.added.map((r) => r.label)).toEqual(['MS Washer 8 mm']);
    expect(items.removed).toEqual([]);
    expect(items.modified).toHaveLength(1);
    expect(items.modified[0].label).toBe('SS Bracket 3 mm');
    const qty = items.modified[0].changes.find((c) => c.field === 'qty');
    expect(qty.type).toBe('modified');
    expect(qty.previousValue).toBe('4');
    expect(qty.selectedValue).toBe('5');
  });

  it('reports a deleted row as removed rather than as an edit of its neighbour', () => {
    const items = diffItems(revision2.items, revision1.items);
    expect(items.removed.map((r) => r.label)).toEqual(['MS Washer 8 mm']);
    expect(items.added).toEqual([]);
  });

  it('pairs duplicate identities in order instead of collapsing them', () => {
    const before = [{ description: 'Bolt', qty: 1 }, { description: 'Bolt', qty: 2 }];
    const after = [{ description: 'Bolt', qty: 1 }];
    const items = diffItems(before, after);
    expect(items.removed).toHaveLength(1);
    expect(items.modified).toEqual([]);
  });

  it('never reports row ids or timestamps as changes', () => {
    const items = diffItems(
      [{ id: 5, description: 'Bolt', qty: 1, createdAt: '2026-01-01' }],
      [{ id: 99, description: 'Bolt', qty: 1, createdAt: '2026-02-02' }]
    );
    expect(items.modified).toEqual([]);
    expect(items.added).toEqual([]);
    expect(items.removed).toEqual([]);
  });
});

describe('compareRevisionSnapshots', () => {
  it('summarises fields and line items together', () => {
    const comparison = compareRevisionSnapshots(revision1, revision2);
    expect(comparison.hasChanges).toBe(true);
    expect(comparison.fieldCount).toBe(comparison.fields.length);
    expect(comparison.itemCount).toBe(2); // 1 added + 1 modified
    expect(changeCount(comparison)).toBe(comparison.fieldCount + comparison.itemCount);
  });

  it('reports no changes when only revision metadata differs', () => {
    const comparison = compareRevisionSnapshots(
      { id: 1, revision: 0, quotationNo: 'QTN-1', status: 'draft' },
      { id: 2, revision: 1, quotationNo: 'QTN-1(1)', status: 'draft', revisionOf: 1 }
    );
    expect(comparison.hasChanges).toBe(false);
    expect(comparison.fields).toEqual([]);
    expect(comparison.itemCount).toBe(0);
  });

  it('exposes a label lookup so only the changed rows get tinted', () => {
    const comparison = compareRevisionSnapshots(revision1, revision2);
    const map = changeByLabel(comparison);
    expect(map.get(labelKey('Display UOM')).type).toBe('modified');
    expect(map.get(labelKey('Client'))).toBeUndefined();
  });

  it('ties a change to the wording each surface uses for the same field', () => {
    const map = changeByLabel(compareRevisionSnapshots({ clientName: 'A', pin: '1' }, { clientName: 'B', pin: '2' }));
    // The SalesViewPage rows say "Client"; the Quotation view says "Client Name".
    expect(map.get(labelKey('Client')).selectedValue).toBe('B');
    expect(map.get(labelKey('Client Name')).selectedValue).toBe('B');
    expect(map.get(labelKey('Pincode')).selectedValue).toBe('2');
    expect(map.get(labelKey('Sales Person'))).toBeUndefined();
  });
});

describe('revision chain helpers', () => {
  it('orders the chain oldest → newest whatever the response order', () => {
    expect(sortRevisionChain([chain[2], chain[0], chain[1]]).map((r) => r.id)).toEqual([9, 10, 11]);
  });

  it('finds the entry being viewed and the one before it', () => {
    expect(chainEntryFor(chain, 10).number).toBe('QTN-2026-000004(1)');
    expect(previousChainEntry(chain, 11).id).toBe(10);
    expect(previousChainEntry(chain, 10).id).toBe(9);
  });

  it('has nothing before the Original version', () => {
    expect(previousChainEntry(chain, 9)).toBeNull();
    expect(comparisonDirection(chain[0], null)).toBeNull();
  });

  it('identifies the current version', () => {
    expect(currentChainEntry(chain).id).toBe(11);
  });

  it('names the comparison direction the way the report does', () => {
    expect(comparisonDirection(chain[2], chain[1])).toBe('Revision 2 compared with Revision 1');
    expect(comparisonDirection(chain[1], chain[0])).toBe('Revision 1 compared with Original');
  });
});
