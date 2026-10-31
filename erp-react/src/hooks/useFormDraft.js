import { useCallback, useEffect, useRef } from 'react';
import { saveDraft, loadDraft, clearDraft, mergeDraftWithServer } from '../utils/formPersistence';

/**
 * useFormDraft — React hook for automatic form-draft persistence.
 *
 * Automatically saves form state to localStorage on changes (debounced),
 * restores it on mount, and clears it on explicit save.
 *
 * @param {string} module - Module identifier (e.g., 'quotations', 'cprs')
 * @param {string|number|null} recordId - Record ID for edit mode (null for new)
 * @param {object} options
 * @param {boolean} options.enabled - Whether persistence is active (default: true)
 * @param {boolean} options.isEdit - Whether in edit mode (default: false)
 * @param {boolean} options.loading - Whether data is still loading (default: false)
 * @param {number} options.debounceMs - Debounce delay in ms (default: 500)
 * @param {function} options.onHydrate - Called when draft is loaded, receives merged data
 * @param {function} options.shouldSave - Optional predicate to control when to save
 *
 * @returns {{ restoreDraft: Function, persistNow: Function, clearDraft: Function }}
 */
export function useFormDraft(module, recordId, options = {}) {
  const {
    enabled = true,
    isEdit = false,
    loading = false,
    debounceMs = 500,
    onHydrate,
    shouldSave,
  } = options;

  const draftRef = useRef(null);
  const restoredRef = useRef(false);
  const timerRef = useRef(null);
  const lastSavedRef = useRef(null);

  /**
   * Restore draft on mount. Only for new records (not edit mode).
   */
  const restoreDraft = useCallback(() => {
    if (!enabled || isEdit || loading) return null;

    const draft = loadDraft(module, recordId);
    if (draft) {
      draftRef.current = draft;
      restoredRef.current = true;
      if (onHydrate) onHydrate(draft);
      return draft;
    }
    restoredRef.current = true;
    return null;
  }, [enabled, isEdit, loading, module, recordId, onHydrate]);

  /**
   * Persist form data (debounced).
   */
  const persistDraft = useCallback((formData) => {
    if (!enabled || isEdit || loading) return;
    if (shouldSave && !shouldSave(formData)) return;

    // Don't save if data hasn't changed
    const serialized = JSON.stringify(formData);
    if (lastSavedRef.current === serialized) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      saveDraft(module, recordId, formData);
      lastSavedRef.current = serialized;
    }, debounceMs);
  }, [enabled, isEdit, loading, module, recordId, debounceMs, shouldSave]);

  /**
   * Immediately persist form data (no debounce).
   */
  const persistNow = useCallback((formData) => {
    if (!enabled || isEdit) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    saveDraft(module, recordId, formData);
    lastSavedRef.current = JSON.stringify(formData);
  }, [enabled, isEdit, module, recordId]);

  /**
   * Clear draft (called after successful save/submit).
   */
  const clearFormDraft = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    clearDraft(module, recordId);
    draftRef.current = null;
    lastSavedRef.current = null;
  }, [module, recordId]);

  /**
   * Merge server-loaded data with any saved draft.
   */
  const mergeWithDraft = useCallback((serverData) => {
    const draft = loadDraft(module, recordId);
    if (draft) {
      return mergeDraftWithServer(serverData, draft);
    }
    return serverData;
  }, [module, recordId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return {
    restoreDraft,
    persistDraft,
    persistNow,
    clearDraft: clearFormDraft,
    mergeWithDraft,
    draftRef,
  };
}

/**
 * useFormDraftAutoSave — Simpler variant that automatically saves on every form change.
 *
 * @param {string} module - Module identifier
 * @param {string|number|null} recordId - Record ID
 * @param {object} formData - Current form state (will be watched for changes)
 * @param {object} options - Same as useFormDraft options
 */
export function useFormDraftAutoSave(module, recordId, formData, options = {}) {
  const { enabled = true, isEdit = false, loading = false, debounceMs = 500 } = options;
  const { restoreDraft, persistDraft, clearDraft, mergeWithDraft } = useFormDraft(
    module, recordId, { enabled, isEdit, loading, debounceMs }
  );

  // Auto-save on form data changes
  useEffect(() => {
    if (!loading && formData) {
      persistDraft(formData);
    }
  }, [formData, loading, persistDraft]);

  return { restoreDraft, clearDraft, mergeWithDraft };
}
