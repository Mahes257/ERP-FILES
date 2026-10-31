/**
 * gridConfigService.js — MySQL-backed grid column configuration store.
 * ------------------------------------------------------------------
 * The shared persistence contract for EVERY editable/manageable/resizable
 * grid in Sales & Marketing (item grids and list tables):
 *
 *   loadGridConfig(key)  → GET  /settings/grid-configs/{key}
 *   saveGridConfig(k, c) → PUT  /settings/grid-configs/{key}
 *   resetGridConfig(key) → DELETE /settings/grid-configs/{key}
 *
 * Backed by the EXISTING app_settings MySQL table (same architecture the CPR
 * item grid uses per document via Cpr.itemColumnsJson, and the same key/value
 * table Marketing Settings uses). Config survives refresh/reopen on every
 * device; localStorage is NEVER the source of truth. No dynamic ALTER TABLE.
 */

import api from '../api/axiosInstance';

const SETTINGS_BASE = '/settings/grid-configs';

/** In-memory cache so remounts don't refetch; updated on save. */
const _cache = new Map();
/** In-flight GETs share one request per key. */
const _inflight = new Map();

function normalizeError(error) {
  const serverMessage = error?.response?.data?.message || error?.response?.data?.error;
  return new Error(serverMessage || error?.message || 'Grid config request failed');
}

/**
 * Load the stored column configuration for a grid key.
 * Returns null when no configuration has ever been saved (caller falls back
 * to its built-in defaults — this is NOT an error).
 */
export async function loadGridConfig(gridKey, options = {}) {
  if (!gridKey) return null;
  if (!options.fresh && _cache.has(gridKey)) return _cache.get(gridKey);
  if (!options.fresh && _inflight.has(gridKey)) return _inflight.get(gridKey);
  const promise = (async () => {
    try {
      const { data } = await api.get(`${SETTINGS_BASE}/${encodeURIComponent(gridKey)}`);
      const config = data?.data ?? null;
      _cache.set(gridKey, config);
      return config;
    } catch {
      // A missing/failed config load must never break the page — the grid
      // falls back to its default columns.
      return null;
    } finally {
      _inflight.delete(gridKey);
    }
  })();
  _inflight.set(gridKey, promise);
  return promise;
}

/** Persist a grid's column configuration to MySQL. Returns the saved config. */
export async function saveGridConfig(gridKey, config) {
  if (!gridKey) throw new Error('gridKey is required');
  try {
    const { data } = await api.put(`${SETTINGS_BASE}/${encodeURIComponent(gridKey)}`, config);
    const saved = data?.data ?? config;
    _cache.set(gridKey, saved);
    return saved;
  } catch (error) {
    throw normalizeError(error);
  }
}

/** Remove the stored configuration (user asked to reset to defaults). */
export async function resetGridConfig(gridKey) {
  if (!gridKey) return;
  try {
    await api.delete(`${SETTINGS_BASE}/${encodeURIComponent(gridKey)}`);
  } catch (error) {
    throw normalizeError(error);
  } finally {
    _cache.delete(gridKey);
  }
}

/** Test helper: clear the in-memory cache without touching the server. */
export function clearGridConfigCache() {
  _cache.clear();
}
