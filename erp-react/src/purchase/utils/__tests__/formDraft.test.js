/**
 * purchase/utils/__tests__/formDraft.test.js
 * ------------------------------------------------------------------
 * Tests for the pure form draft persistence utilities:
 *   buildDraftKey, readDraft, writeDraft, removeDraft, getSessionId
 * ------------------------------------------------------------------
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  buildDraftKey,
  readDraft,
  writeDraft,
  removeDraft,
  getSessionId,
} from '../formDraft';

/* ------------------------------------------------------------------ */
/*  In-memory storage mock                                             */
/* ------------------------------------------------------------------ */
function createStorageMock() {
  const store = {};
  return {
    getItem: vi.fn((k) => store[k] ?? null),
    setItem: vi.fn((k, v) => { store[k] = v; }),
    removeItem: vi.fn((k) => { delete store[k]; }),
    clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
    _store: store,
  };
}

let ls; // localStorage mock
let ss; // sessionStorage mock

beforeEach(() => {
  ls = createStorageMock();
  ss = createStorageMock();
});

/* ================================================================== */
/*  Tests                                                              */
/* ================================================================== */

describe('getSessionId', () => {
  it('creates a new session ID on first call', () => {
    const id = getSessionId(ss);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
    expect(ss.setItem).toHaveBeenCalledWith('purchase.draft.session', id);
  });

  it('returns the same session ID on subsequent calls', () => {
    const id1 = getSessionId(ss);
    const id2 = getSessionId(ss);
    expect(id1).toBe(id2);
  });

  it('returns a fallback if sessionStorage throws', () => {
    const brokenStorage = {
      getItem: vi.fn(() => { throw new Error('blocked'); }),
      setItem: vi.fn(),
    };
    const id = getSessionId(brokenStorage);
    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });
});

describe('buildDraftKey', () => {
  it('builds an edit key when recordId is provided', () => {
    const key = buildDraftKey('purchase.pr', 'PR-001', 1, ss);
    expect(key).toBe('purchase.pr.draft.v1.PR-001');
  });

  it('builds a new-record key with session ID when recordId is null', () => {
    const sessionId = getSessionId(ss);
    const key = buildDraftKey('purchase.pr', null, 1, ss);
    expect(key).toBe(`purchase.pr.draft.v1.new.${sessionId}`);
  });

  it('includes version in the key', () => {
    const key = buildDraftKey('purchase.pr', 'PR-001', 3, ss);
    expect(key).toBe('purchase.pr.draft.v3.PR-001');
  });

  it('different entity types produce different keys', () => {
    const prKey = buildDraftKey('purchase.pr', 'PR-001', 1, ss);
    const rfqKey = buildDraftKey('purchase.rfq', 'PR-001', 1, ss);
    expect(prKey).not.toBe(rfqKey);
    expect(prKey).toBe('purchase.pr.draft.v1.PR-001');
    expect(rfqKey).toBe('purchase.rfq.draft.v1.PR-001');
  });

  it('different record IDs produce different keys', () => {
    const k1 = buildDraftKey('purchase.pr', 'PR-001', 1, ss);
    const k2 = buildDraftKey('purchase.pr', 'PR-002', 1, ss);
    expect(k1).not.toBe(k2);
  });
});

describe('readDraft', () => {
  it('returns null when key does not exist', () => {
    expect(readDraft('nonexistent', ls)).toBeNull();
  });

  it('returns parsed object when key exists', () => {
    ls._store['test.key'] = JSON.stringify({ title: 'Hello', items: [1, 2] });
    expect(readDraft('test.key', ls)).toEqual({ title: 'Hello', items: [1, 2] });
  });

  it('returns null for corrupted JSON', () => {
    ls._store['test.key'] = 'not-valid-json{{{';
    expect(readDraft('test.key', ls)).toBeNull();
  });

  it('returns null for array data (wrong shape)', () => {
    ls._store['test.key'] = JSON.stringify([1, 2, 3]);
    expect(readDraft('test.key', ls)).toBeNull();
  });

  it('returns null for string data', () => {
    ls._store['test.key'] = JSON.stringify('just a string');
    expect(readDraft('test.key', ls)).toBeNull();
  });

  it('returns null when localStorage.getItem throws', () => {
    const broken = { getItem: vi.fn(() => { throw new Error('blocked'); }) };
    expect(readDraft('test.key', broken)).toBeNull();
  });
});

describe('writeDraft', () => {
  it('writes JSON to localStorage', () => {
    writeDraft('test.key', { title: 'Draft' }, ls);
    expect(ls.setItem).toHaveBeenCalledWith('test.key', JSON.stringify({ title: 'Draft' }));
  });

  it('silently ignores localStorage.setItem errors', () => {
    const broken = { setItem: vi.fn(() => { throw new Error('quota exceeded'); }) };
    expect(() => writeDraft('test.key', { title: 'Draft' }, broken)).not.toThrow();
  });
});

describe('removeDraft', () => {
  it('removes the key from localStorage', () => {
    ls._store['test.key'] = 'data';
    removeDraft('test.key', ls);
    expect(ls.removeItem).toHaveBeenCalledWith('test.key');
  });

  it('silently ignores localStorage.removeItem errors', () => {
    const broken = { removeItem: vi.fn(() => { throw new Error('blocked'); }) };
    expect(() => removeDraft('test.key', broken)).not.toThrow();
  });

  it('only removes the specified key', () => {
    ls._store['key.a'] = 'data a';
    ls._store['key.b'] = 'data b';
    removeDraft('key.a', ls);
    expect(ls._store['key.a']).toBeUndefined();
    expect(ls._store['key.b']).toBe('data b');
  });
});

describe('draft key isolation (integration)', () => {
  it('different record IDs do not overwrite each other', () => {
    const key1 = buildDraftKey('purchase.pr', 'PR-001', 1, ss);
    const key2 = buildDraftKey('purchase.pr', 'PR-002', 1, ss);

    writeDraft(key1, { title: 'PR-001 draft' }, ls);
    writeDraft(key2, { title: 'PR-002 draft' }, ls);

    expect(readDraft(key1, ls)).toEqual({ title: 'PR-001 draft' });
    expect(readDraft(key2, ls)).toEqual({ title: 'PR-002 draft' });
  });

  it('clearing one draft does not affect another', () => {
    const key1 = buildDraftKey('purchase.pr', 'PR-001', 1, ss);
    const key2 = buildDraftKey('purchase.pr', 'PR-002', 1, ss);

    writeDraft(key1, { title: 'PR-001' }, ls);
    writeDraft(key2, { title: 'PR-002' }, ls);

    removeDraft(key1, ls);

    expect(readDraft(key1, ls)).toBeNull();
    expect(readDraft(key2, ls)).toEqual({ title: 'PR-002' });
  });

  it('draft survives simulated refresh (localStorage persists)', () => {
    const key = buildDraftKey('purchase.pr', 'PR-001', 1, ss);

    writeDraft(key, { title: 'Survives refresh', items: [1, 2, 3] }, ls);

    // Simulate: new component reads from same localStorage
    const loaded = readDraft(key, ls);
    expect(loaded).toEqual({ title: 'Survives refresh', items: [1, 2, 3] });
  });

  it('new forms share session key within same tab', () => {
    const k1 = buildDraftKey('purchase.pr', null, 1, ss);
    const k2 = buildDraftKey('purchase.pr', null, 1, ss);
    expect(k1).toBe(k2);
  });

  it('different versions do not collide', () => {
    const k1 = buildDraftKey('purchase.pr', 'PR-001', 1, ss);
    const k2 = buildDraftKey('purchase.pr', 'PR-001', 2, ss);

    writeDraft(k1, { v: 1 }, ls);
    writeDraft(k2, { v: 2 }, ls);

    expect(readDraft(k1, ls)).toEqual({ v: 1 });
    expect(readDraft(k2, ls)).toEqual({ v: 2 });
  });
});
