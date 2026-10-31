// ============================================================
// Frontend persistence (localStorage).
// The Production module is user-entry-only: every record the user
// creates is stored here so data survives page reloads. No backend,
// no API, no database — this is the only persistence layer.
//
//   User Entry → React State → localStorage → Reload → Restored
// ============================================================

const PREFIX = 'production.';

/** Read a stored array (or any JSON value); falls back on missing/corrupt data. */
export function loadData(key, fallback) {
  try {
    const raw = localStorage.getItem(`${PREFIX}${key}`);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/** Write a value to localStorage (silently ignored if storage is unavailable). */
export function saveData(key, value) {
  try {
    localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // Storage may be unavailable (private mode / quota) — the app
    // still works for the current session.
  }
}

/** Remove a stored key (used when clearing user data). */
export function clearData(key) {
  try {
    localStorage.removeItem(`${PREFIX}${key}`);
  } catch {
    // ignore
  }
}

/**
 * Build a localStorage-backed state pair for a component/context:
 *   const [data, setData] = usePersistedState('orders', []);
 * Persists `data` on every change.
 */
import { useEffect, useState } from 'react';

export function usePersistedState(key, fallback) {
  const [data, setData] = useState(() => loadData(key, fallback));
  useEffect(() => {
    saveData(key, data);
  }, [key, data]);
  return [data, setData];
}
