/**
 * utils/readCache.test.js
 * ------------------------------------------------------------------
 * Tests for the shared frontend read cache.
 *
 * The regression this guards: a component-level cache that only stores
 * values AFTER a response arrives does not stop simultaneous mounts from
 * each firing their own identical request (the Purchase Requisition form
 * fetched GET /users twice — once for the Requesters picker and once for
 * the Buyers picker — and every remount re-fetched the reference lists).
 * Each case below asserts the REQUEST COUNT, not just the returned value.
 * ------------------------------------------------------------------
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READ_CACHE_TTL,
  cachedRead,
  clearReadCache,
  invalidateReadCache,
  peekReadCache
} from './readCache';

describe('readCache', () => {
  beforeEach(() => {
    clearReadCache();
  });

  it('coalesces concurrent identical reads into ONE request', async () => {
    const loader = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ['Engineering', 'Stores'];
    });

    const [a, b, c] = await Promise.all([
      cachedRead('master:pr_departments', loader),
      cachedRead('master:pr_departments', loader),
      cachedRead('master:pr_departments', loader)
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toEqual(['Engineering', 'Stores']);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('serves a second read from the cache without calling the loader', async () => {
    const loader = vi.fn(async () => [{ value: 'INR' }]);

    await cachedRead('master:currencies', loader);
    await cachedRead('master:currencies', loader);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keeps different keys independent', async () => {
    const loader = vi.fn(async () => ['x']);

    await cachedRead('master:units', loader);
    await cachedRead('master:companies', loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('re-reads after the TTL expires', async () => {
    vi.useFakeTimers();
    try {
      const loader = vi.fn(async () => ['A']);
      await cachedRead('master:units', loader, { ttlMs: 1000 });

      vi.advanceTimersByTime(1001);
      expect(peekReadCache('master:units')).toBeUndefined();

      await cachedRead('master:units', loader, { ttlMs: 1000 });
      expect(loader).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('invalidation forces the next read back to the API', async () => {
    const loader = vi.fn(async () => ['A']);
    await cachedRead('master:units', loader);

    invalidateReadCache('master:units');
    await cachedRead('master:units', loader);

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('a prefix invalidation clears every key under it', async () => {
    const masterLoader = vi.fn(async () => ['v']);
    const userLoader = vi.fn(async () => ['u']);
    await cachedRead('purchase:vendors:page-500', masterLoader);
    await cachedRead('purchase:users', userLoader);

    invalidateReadCache('purchase:');
    await cachedRead('purchase:vendors:page-500', masterLoader);
    await cachedRead('purchase:users', userLoader);

    expect(masterLoader).toHaveBeenCalledTimes(2);
    expect(userLoader).toHaveBeenCalledTimes(2);
  });

  it('does not repopulate the cache from a request that raced a write', async () => {
    const slow = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return ['stale'];
    });
    const fresh = vi.fn(async () => ['fresh']);

    const pending = cachedRead('purchase:vendors:page-500', slow);
    invalidateReadCache('purchase:');
    await pending;

    expect(peekReadCache('purchase:vendors:page-500')).toBeUndefined();

    await cachedRead('purchase:vendors:page-500', fresh);
    expect(fresh).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed read', async () => {
    const loader = vi.fn(async () => {
      throw new Error('network down');
    });

    await expect(cachedRead('master:units', loader)).rejects.toThrow('network down');
    expect(peekReadCache('master:units')).toBeUndefined();

    const retry = vi.fn(async () => ['ok']);
    await cachedRead('master:units', retry);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('force bypasses the cached value', async () => {
    const loader = vi.fn(async () => ['A']);
    await cachedRead('master:units', loader);
    await cachedRead('master:units', loader, { force: true });

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('exposes an explicit TTL policy for master vs picker data', () => {
    expect(READ_CACHE_TTL.MASTER_MS).toBe(5 * 60 * 1000);
    expect(READ_CACHE_TTL.PICKER_MS).toBe(60 * 1000);
    expect(READ_CACHE_TTL.PICKER_MS).toBeLessThan(READ_CACHE_TTL.MASTER_MS);
  });
});
