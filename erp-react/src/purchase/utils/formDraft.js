/**
 * purchase/utils/formDraft.js
 * ------------------------------------------------------------------
 * Pure functions for localStorage draft persistence — separated from
 * the React hook so they can be unit-tested without rendering.
 *
 * Consumers:
 *   • useFormDraft hook (React integration)
 *   • Direct import in tests
 * ------------------------------------------------------------------
 */

const SESSION_ID_KEY = 'purchase.draft.session';

/**
 * Returns (or creates) a per-tab session ID that survives refresh
 * but not a new tab / window.
 */
export function getSessionId(storage = sessionStorage) {
  try {
    let id = storage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      storage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch {
    return `${Date.now()}`;
  }
}

/**
 * Builds the full localStorage key for a draft.
 */
export function buildDraftKey(draftKey, recordId, version = 1, storage = sessionStorage) {
  const segment = recordId ? String(recordId) : `new.${getSessionId(storage)}`;
  return `${draftKey}.draft.v${version}.${segment}`;
}

/**
 * Safely reads a draft from localStorage.
 * Returns the parsed object or null on any error.
 */
export function readDraft(key, storage = localStorage) {
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Writes a draft to localStorage. Silently ignores quota errors.
 */
export function writeDraft(key, value, storage = localStorage) {
  try {
    storage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota exceeded or security error — silently ignore. */
  }
}

/**
 * Removes a specific draft from localStorage.
 */
export function removeDraft(key, storage = localStorage) {
  try {
    storage.removeItem(key);
  } catch {
    /* Silently ignore. */
  }
}
