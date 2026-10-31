/**
 * utils/readCache.js
 * ------------------------------------------------------------------
 * A very small read cache for frontend GET requests, with two jobs:
 *
 *   1. IN-FLIGHT COALESCING — when several components ask for the same
 *      resource at the same time (two dropdowns in one form, a line-item
 *      grid opening N identical master lists, a filter panel and a form on
 *      the same page), they all share ONE request instead of firing one
 *      each. This is the duplicate-request fix: the previous per-call
 *      `Map` caches only helped AFTER a response had arrived, so
 *      simultaneous mounts still produced N identical requests.
 *
 *   2. TTL CACHING — a resolved value is reused for `ttlMs`, so a
 *      component that unmounts and remounts (modal open/close, route
 *      switch, tab change) does not re-fetch stable reference data.
 *
 * Only use this for read-only, low-change data. Transactional/rapidly
 * changing data must not be cached here.
 *
 * Staleness is explicit: every call site names its own `ttlMs`.
 *   · master / reference lists      → 5 minutes
 *   · user & vendor pickers         → 60 seconds
 * Anything that mutates the underlying resource MUST call
 * `invalidateReadCache(prefix)` so the next read goes back to the API.
 * ------------------------------------------------------------------
 */

const entries = new Map(); // key -> { value, expiresAt }
const inFlight = new Map(); // key -> Promise

/**
 * Bumped by every invalidation. A read captures this value before it
 * starts and only writes its result back when the generation is unchanged —
 * so a response that was already in flight when a write invalidated the
 * cache can never repopulate it with pre-write data. (A millisecond
 * timestamp is not enough here: an invalidation issued in the same tick as
 * the read compares equal and would silently be treated as "before".)
 */
let generation = 0;

/**
 * Returns the cached value for a key, or `undefined` when there is no
 * unexpired entry. Expired entries are dropped on read.
 */
export function peekReadCache(key) {
  const entry = entries.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    entries.delete(key);
    return undefined;
  }
  return entry.value;
}

/**
 * Reads through the cache.
 *
 * @param {string} key      cache identity of the resource (include every
 *                          request parameter that changes the response)
 * @param {() => Promise<any>} loader   performs the actual request
 * @param {{ ttlMs?: number, force?: boolean }} [options]
 * @returns {Promise<any>}
 */
export async function cachedRead(key, loader, { ttlMs = 60 * 1000, force = false } = {}) {
  if (!force) {
    const cached = peekReadCache(key);
    if (cached !== undefined) return cached;
    const pendingShared = inFlight.get(key);
    if (pendingShared) return pendingShared;
  }

  const startedGeneration = generation;
  const promise = (async () => loader())();
  inFlight.set(key, promise);

  try {
    const value = await promise;
    // Never repopulate from a request that raced a write.
    if (generation === startedGeneration) {
      entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    }
    return value;
  } finally {
    inFlight.delete(key);
  }
}

/**
 * Drops every cached entry whose key starts with `prefix`.
 * Bumping the generation also stops any read that is still in flight from
 * writing back data that predates the write that triggered the invalidation.
 */
export function invalidateReadCache(prefix) {
  generation += 1;
  for (const key of Array.from(entries.keys())) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
}

/** Test/utility helper: forget everything. */
export function clearReadCache() {
  generation += 1;
  entries.clear();
  inFlight.clear();
}

/** Explicit, shared TTL policy so call sites do not invent their own. */
export const READ_CACHE_TTL = {
  /** Master / reference lists (countries, UOM, departments, currencies …). */
  MASTER_MS: 5 * 60 * 1000,
  /** People/organisation pickers that can change during the working day. */
  PICKER_MS: 60 * 1000
};
