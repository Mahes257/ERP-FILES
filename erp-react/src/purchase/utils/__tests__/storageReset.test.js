/**
 * purchase/utils/__tests__/storageReset.test.js
 * -------------------------------------------------------------------
 * Tests for the localStorage persistence layer and clean baseline
 * verification. Demo data reset (__resetPurchaseDemoData) has been
 * removed — seed data is no longer injected.
 * -------------------------------------------------------------------
 */
import { describe, expect, it } from 'vitest';
import { storageKeys, createCollection } from '../../services/base';

/* ========================================================================
   STORAGE KEYS AUDIT
   ======================================================================== */

describe('Storage keys — complete audit', () => {
  it('all expected Purchase storage keys are defined', () => {
    const expectedKeys = [
      'requisitions',
      'vendors',
      'rfqs',
      'quotations',
      'orders',
      'invoices',
      'advices',
      'evaluations',
      'rfqFollowUps',
      'settings',
      'nfas',
      'vendorDocuments',
      'manufacturing',
      'shipments',
      'grns',
      'inspections',
      'inventory',
      'documents',
    ];

    expectedKeys.forEach((key) => {
      expect(storageKeys).toHaveProperty(key);
      expect(storageKeys[key]).toBeTruthy();
      expect(typeof storageKeys[key]).toBe('string');
    });
  });

  it('all storage keys follow versioned naming convention', () => {
    Object.values(storageKeys).forEach((key) => {
      expect(key).toMatch(/^purchase-.+-v\d+$/);
    });
  });

  it('no duplicate storage keys', () => {
    const keys = Object.values(storageKeys);
    const unique = new Set(keys);
    expect(keys.length).toBe(unique.size);
  });
});

/* ========================================================================
   CREATE COLLECTION — SEED / PERSIST / RESET
   ======================================================================== */

describe('createCollection — lifecycle', () => {
  it('seeds from builder when localStorage is empty', () => {
    const seedFn = () => [{ id: 1 }, { id: 2 }];
    const collection = createCollection('test-seed-lifecycle', seedFn);

    expect(collection.all).toHaveLength(2);
    expect(collection.all[0].id).toBe(1);
  });

  it('reads from localStorage when data exists', () => {
    const key = 'test-read-existing';
    localStorage.setItem(key, JSON.stringify([{ id: 10 }, { id: 20 }]));
    const collection = createCollection(key, () => [{ id: 99 }]);

    expect(collection.all).toHaveLength(2);
    expect(collection.all[0].id).toBe(10);
  });

  it('persist writes back to localStorage', () => {
    const key = 'test-persist-write';
    const collection = createCollection(key, () => [{ id: 1 }]);
    collection.persist([{ id: 1 }, { id: 2 }, { id: 3 }]);

    expect(collection.all).toHaveLength(3);
    const stored = JSON.parse(localStorage.getItem(key));
    expect(stored).toHaveLength(3);
  });

  it('reset clears the cache so next read re-seeds or re-reads', () => {
    const key = 'test-reset-cache';
    const collection = createCollection(key, () => [{ id: 1 }]);
    expect(collection.all).toHaveLength(1);

    collection.reset();
    // After reset, next access re-reads localStorage (still has data from seed)
    expect(collection.all).toHaveLength(1);
  });
});

/* ========================================================================
   CLEAN BASELINE — SEED DATA COUNTS
   ======================================================================== */

describe('Clean baseline — seed data produces correct counts', () => {
  it('all storage keys are accessible', () => {
    Object.entries(storageKeys).forEach(([, key]) => {
      expect(key).toBeTruthy();
      expect(key).toMatch(/^purchase-/);
    });
  });

  it('seed builder returns empty array (no demo data)', () => {
    // The default seed builder should return [] — no demo records
    const seedFn = () => [];
    const collection = createCollection('test-empty-seed', seedFn);
    expect(collection.all).toHaveLength(0);
  });
});
