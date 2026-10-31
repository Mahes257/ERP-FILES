import api from '../api/axiosInstance';
import { READ_CACHE_TTL, cachedRead, invalidateReadCache } from '../utils/readCache';

export function normalizeApiError(error) {
  // Axios timeout (global 30s cap): surface it clearly instead of the generic
  // "network connection" message, which hides the real recovery path.
  if (error?.code === 'ECONNABORTED' || /timeout of \d+ms exceeded/.test(error?.message || '')) {
    return {
      message: 'The request timed out. Please try again.',
      status: null,
      data: null,
      timedOut: true
    };
  }
  if (error.response) {
    const serverMessage =
      error.response.data?.message || error.response.data?.error || error.response.data?.detail ||
      `Request failed with status ${error.response.status}`;
    return {
      message: serverMessage,
      status: error.response.status,
      data: error.response.data
    };
  }
  if (error.request) {
    return {
      message: 'Unable to reach the server. Please check your network connection.',
      status: null,
      data: null
    };
  }
  return {
    message: error.message || 'An unexpected error occurred.',
    status: null,
    data: null
  };
}

async function request(executor) {
  try {
    return await executor();
  } catch (error) {
    throw normalizeApiError(error);
  }
}

// ---------------------------------------------------------------------------
// Frontend master-data cache
// ---------------------------------------------------------------------------
// Prevents repeated identical GET /masters/{key} calls for the same master key
// within the TTL window. The backend also caches, but the frontend cache avoids
// even the HTTP round-trip when the same dropdown is opened (or the same form
// remounted) several times during a session.
//
// The cache is shared through utils/readCache, which also coalesces IN-FLIGHT
// requests: several dropdowns using the same master key that mount together
// (a line-item grid, a form opened twice) now share ONE request instead of
// firing one each, because the previous per-call Map only helped after the
// first response had already arrived.
// ---------------------------------------------------------------------------

/** Cache identity of one master list. */
const masterCacheKey = (key) => `master:${key}`;

/**
 * Invalidate a single key's cache (called after create / update / delete, and
 * available to any other consumer that writes to master_values).
 */
export function invalidateMasterCache(key) {
  invalidateReadCache(masterCacheKey(key));
}

// ---------------------------------------------------------------------------

const masterService = {
  /** List master values for a key, e.g. 'pr_departments'. */
  async list(key) {
    // Served from cache when fresh; concurrent callers share one request.
    return cachedRead(
      masterCacheKey(key),
      () => request(async () => {
        const { data } = await api.get(`/masters/${key}`);
        return data;
      }),
      { ttlMs: READ_CACHE_TTL.MASTER_MS }
    );
  },

  /** Create (or reuse) a master value. */
  async create(key, value) {
    const result = await request(async () => {
      const { data } = await api.post(`/masters/${key}`, { value });
      return data;
    });
    invalidateMasterCache(key);
    return result;
  },

  /** Rename a master value. */
  async update(key, id, value) {
    const result = await request(async () => {
      const { data } = await api.put(`/masters/${key}/${id}`, { value });
      return data;
    });
    invalidateMasterCache(key);
    return result;
  },

  /** Delete a master value (blocked by the backend while it is in use). */
  async remove(key, id) {
    const result = await request(async () => {
      const { data } = await api.delete(`/masters/${key}/${id}`);
      return data;
    });
    invalidateMasterCache(key);
    return result;
  }
};

export default masterService;
