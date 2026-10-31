/**
 * purchase/hooks/useFormDraft.js
 * ------------------------------------------------------------------
 * Shared debounced draft persistence for every Purchase create/edit
 * form. Drafts are stored in localStorage under a namespaced,
 * versioned key that isolates:
 *
 *   • different entity types   (purchase.pr, purchase.rfq, …)
 *   • different records        (purchase.pr.draft.PR-001 ≠ PR-002)
 *   • new vs existing records  (purchase.pr.draft.new.<session>)
 *
 * The hook is state-library-agnostic: it works with react-hook-form,
 * manual useState, or any other pattern — it only deals with
 * serialisable plain objects.
 *
 * API:
 *   const { loadDraft, saveDraft, clearDraft, hasDraft } = useFormDraft({
 *     draftKey,     // prefix, e.g. 'purchase.pr'
 *     recordId,     // null for new records
 *     version,      // schema version (default 1)
 *     debounceMs,   // save debounce (default 800)
 *   });
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildDraftKey, readDraft, writeDraft, removeDraft } from '../utils/formDraft';

/**
 * useFormDraft — debounced localStorage draft persistence.
 *
 * @param {Object} options
 * @param {string} options.draftKey   - Entity prefix, e.g. 'purchase.pr'
 * @param {string|null} options.recordId - Record ID (null = new)
 * @param {number} [options.version=1]   - Schema version
 * @param {number} [options.debounceMs=800] - Debounce delay
 * @returns {{ loadDraft, saveDraft, saveDraftNow, clearDraft, hasDraft, draftExists }}
 */
export default function useFormDraft({
  draftKey,
  recordId = null,
  version = 1,
  debounceMs = 800,
} = {}) {
  const storageKey = buildDraftKey(draftKey, recordId, version);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  /* Track whether a draft exists for the current key. */
  const [draftExists, setDraftExists] = useState(() => readDraft(storageKey) !== null);

  /* Cleanup timer on unmount. */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  /* Re-evaluate draftExists when the storageKey changes (e.g. navigating
     between different records). */
  useEffect(() => {
    setDraftExists(readDraft(storageKey) !== null);
  }, [storageKey]);

  /**
   * Load the saved draft (or null). Safe — never throws.
   */
  const loadDraft = useCallback(() => {
    const draft = readDraft(storageKey);
    if (draft) setDraftExists(true);
    return draft;
  }, [storageKey]);

  /**
   * Debounced save. Writes to localStorage after `debounceMs` of
   * inactivity. Subsequent calls within the window reset the timer.
   */
  const saveDraft = useCallback(
    (values) => {
      if (!mountedRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!mountedRef.current) return;
        if (values && typeof values === 'object') {
          writeDraft(storageKey, values);
          setDraftExists(true);
        }
      }, debounceMs);
    },
    [storageKey, debounceMs]
  );

  /**
   * Immediately persist (no debounce). Useful for explicit Save Draft
   * button presses that must guarantee persistence before navigation.
   */
  const saveDraftNow = useCallback(
    (values) => {
      if (values && typeof values === 'object') {
        writeDraft(storageKey, values);
        setDraftExists(true);
      }
    },
    [storageKey]
  );

  /**
   * Remove the current draft from localStorage.
   */
  const clearDraft = useCallback(() => {
    /* Cancel any debounced write still in flight — otherwise it would
       resurrect the draft (and its stale values) moments after clearing. */
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    removeDraft(storageKey);
    setDraftExists(false);
  }, [storageKey]);

  /**
   * Whether a draft currently exists in localStorage for this key.
   */
  const hasDraft = useCallback(() => readDraft(storageKey) !== null, [storageKey]);

  return { loadDraft, saveDraft, saveDraftNow, clearDraft, hasDraft, draftExists };
}
