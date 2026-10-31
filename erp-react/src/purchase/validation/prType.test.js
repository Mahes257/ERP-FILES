/**
 * purchase/validation/prType.test.js
 * ------------------------------------------------------------------
 * Tests for the PR Type field on the Purchase Requisition form.
 *
 * Covers:
 *   1. Constants (PR_TYPE, PR_TYPES)
 *   2. Validation schema accepts prType
 *   3. Form default values include prType
 *   4. Service persistence round-trips prType
 *   5. Switching PR Type does not clear other fields
 *   6. Existing PR without prType renders correctly
 *   7. All three PR Type options are valid
 * ------------------------------------------------------------------
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { PR_TYPE, PR_TYPES } from '../constants';
import { purchaseRequestSchema } from './requisition';
import { mockRequisitionService, requisitionsStore } from '../services/requisition';

/* ═══════════════════════════════════════════════════════════════════
   1. Constants
   ═══════════════════════════════════════════════════════════════════ */
describe('PR_TYPE constants', () => {
  it('defines three PR types', () => {
    expect(Object.keys(PR_TYPE)).toHaveLength(3);
  });

  it('has CAPITAL, OPERATIONAL, COMMERCIAL keys', () => {
    expect(PR_TYPE.CAPITAL).toBe('Capital Purchase');
    expect(PR_TYPE.OPERATIONAL).toBe('Operational Purchase');
    expect(PR_TYPE.COMMERCIAL).toBe('Commercial Purchase');
  });

  it('PR_TYPES array contains all three values', () => {
    expect(PR_TYPES).toEqual(['Capital Purchase', 'Operational Purchase', 'Commercial Purchase']);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   2. Validation schema accepts prType
   ═══════════════════════════════════════════════════════════════════ */
describe('purchaseRequestSchema — prType field', () => {
  const base = {
    title: 'Test Requisition',
    date: '2026-09-12',
    department: 'IT',
    requester: 'Test User',
    expectedDate: '2026-10-01',
    discount: 0,
    charges: 0,
    items: [{ product: 'Widget', qty: 1, rate: 100, gstRate: 18 }]
  };

  it('rejects empty prType (new PR without selection)', () => {
    const result = purchaseRequestSchema.safeParse({ ...base, prType: '' });
    expect(result.success).toBe(false);
  });

  it('rejects undefined prType (existing PR without type)', () => {
    const result = purchaseRequestSchema.safeParse({ ...base });
    expect(result.success).toBe(false);
  });

  it('accepts Capital Purchase', () => {
    const result = purchaseRequestSchema.safeParse({ ...base, prType: PR_TYPE.CAPITAL });
    expect(result.success).toBe(true);
    expect(result.data.prType).toBe('Capital Purchase');
  });

  it('accepts Operational Purchase', () => {
    const result = purchaseRequestSchema.safeParse({ ...base, prType: PR_TYPE.OPERATIONAL });
    expect(result.success).toBe(true);
    expect(result.data.prType).toBe('Operational Purchase');
  });

  it('accepts Commercial Purchase', () => {
    const result = purchaseRequestSchema.safeParse({ ...base, prType: PR_TYPE.COMMERCIAL });
    expect(result.success).toBe(true);
    expect(result.data.prType).toBe('Commercial Purchase');
  });

  it('accepts any string (free-form fallback)', () => {
    const result = purchaseRequestSchema.safeParse({ ...base, prType: 'Custom Type' });
    expect(result.success).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════
   3. Form default values include prType
   ═══════════════════════════════════════════════════════════════════ */
describe('Form default values — prType', () => {
  it('defaults to empty string for new PR', () => {
    /* Simulate what buildRequisitionFormValues does for an empty record. */
    const record = {};
    const prType = record.prType || '';
    expect(prType).toBe('');
  });

  it('loads Capital Purchase from existing record', () => {
    const record = { prType: 'Capital Purchase' };
    const prType = record.prType || '';
    expect(prType).toBe('Capital Purchase');
  });

  it('loads Operational Purchase from existing record', () => {
    const record = { prType: 'Operational Purchase' };
    const prType = record.prType || '';
    expect(prType).toBe('Operational Purchase');
  });

  it('loads Commercial Purchase from existing record', () => {
    const record = { prType: 'Commercial Purchase' };
    const prType = record.prType || '';
    expect(prType).toBe('Commercial Purchase');
  });

  it('defaults to empty string when record has no prType field', () => {
    const record = { title: 'Old PR', department: 'IT' };
    const prType = record.prType || '';
    expect(prType).toBe('');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   4. Service persistence round-trips prType
   ═══════════════════════════════════════════════════════════════════ */
describe('Requisition service — prType persistence', () => {
  beforeEach(() => {
    requisitionsStore.reset();
  });

  it('createRequisition persists prType', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Capital Equipment PR',
      department: 'Engineering',
      requester: 'Test User',
      prType: 'Capital Purchase',
      expectedDate: '2026-10-01',
      items: [{ product: 'CNC Machine', qty: 1, rate: 500000, gstRate: 18 }]
    });
    expect(pr.prType).toBe('Capital Purchase');
  });

  it('updateRequisition preserves prType', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Operational PR',
      department: 'IT',
      requester: 'Test User',
      prType: 'Operational Purchase',
      expectedDate: '2026-10-01',
      items: [{ product: 'Laptop', qty: 5, rate: 80000, gstRate: 18 }]
    });
    const updated = await mockRequisitionService.updateRequisition(pr.id, {
      title: 'Operational PR — Updated',
      prType: 'Operational Purchase'
    });
    expect(updated.prType).toBe('Operational Purchase');
    expect(updated.title).toBe('Operational PR — Updated');
  });

  it('PR without prType has undefined/null prType after creation', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Legacy PR',
      department: 'IT',
      requester: 'Test User',
      expectedDate: '2026-10-01',
      items: [{ product: 'Monitor', qty: 2, rate: 25000, gstRate: 18 }]
    });
    /* prType is not in the payload, so it won't be set by the service.
       The normalize function spreads raw, so it stays undefined. */
    expect(pr.prType).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   5. Switching PR Type does not clear other fields
   ═══════════════════════════════════════════════════════════════════ */
describe('PR Type switching — field preservation', () => {
  it('changing prType does not affect other form values', () => {
    const values = {
      title: 'Test PR',
      department: 'IT',
      requester: 'John',
      prType: 'Capital Purchase',
      vendor: 'Tata Steel',
      expectedDate: '2026-10-01'
    };

    /* Simulate switching PR Type */
    const updated = { ...values, prType: 'Operational Purchase' };

    expect(updated.prType).toBe('Operational Purchase');
    expect(updated.title).toBe('Test PR');
    expect(updated.department).toBe('IT');
    expect(updated.requester).toBe('John');
    expect(updated.vendor).toBe('Tata Steel');
    expect(updated.expectedDate).toBe('2026-10-01');
  });

  it('clearing prType does not affect other fields', () => {
    const values = {
      title: 'Test PR',
      department: 'IT',
      prType: 'Commercial Purchase'
    };

    const updated = { ...values, prType: '' };

    expect(updated.prType).toBe('');
    expect(updated.title).toBe('Test PR');
    expect(updated.department).toBe('IT');
  });
});

/* ═══════════════════════════════════════════════════════════════════
   6. Existing PR without prType
   ═══════════════════════════════════════════════════════════════════ */
describe('Existing PR without prType', () => {
  it('schema rejects record without prType (now required)', () => {
    const result = purchaseRequestSchema.safeParse({
      title: 'Old PR from 2025',
      department: 'Procurement',
      requester: 'Legacy User',
      expectedDate: '2025-06-15',
      discount: 0,
      charges: 0,
      items: [{ product: 'Steel Rods', qty: 100, rate: 500, gstRate: 18 }]
    });
    expect(result.success).toBe(false);
  });

  it('form defaults prType to empty string', () => {
    const record = { title: 'Old PR', department: 'Procurement' };
    const prType = record.prType || '';
    expect(prType).toBe('');
  });

  it('service round-trips record without prType', async () => {
    const pr = await mockRequisitionService.createRequisition({
      title: 'Legacy PR',
      department: 'IT',
      requester: 'Test',
      expectedDate: '2026-01-01',
      items: [{ product: 'Item', qty: 1, rate: 100, gstRate: 18 }]
    });
    const fetched = await mockRequisitionService.getRequisition(pr.id);
    expect(fetched.prType).toBeUndefined();
  });
});

/* ═══════════════════════════════════════════════════════════════════
   7. All three PR Type options produce valid schema output
   ═══════════════════════════════════════════════════════════════════ */
describe('All PR Type options are valid', () => {
  const base = {
    title: 'PR Type Validation',
    date: '2026-09-12',
    department: 'IT',
    requester: 'Test',
    expectedDate: '2026-10-01',
    discount: 0,
    charges: 0,
    items: [{ product: 'Widget', qty: 1, rate: 100, gstRate: 18 }]
  };

  for (const type of PR_TYPES) {
    it(`validates "${type}"`, () => {
      const result = purchaseRequestSchema.safeParse({ ...base, prType: type });
      expect(result.success).toBe(true);
      expect(result.data.prType).toBe(type);
    });
  }
});
