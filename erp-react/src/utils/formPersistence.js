/**
 * formPersistence.js
 *
 * Centralized form-draft persistence layer for the entire ERP React application.
 * Uses localStorage as a temporary draft/cache layer. Each form is identified by
 * a unique key derived from the module + optional record ID.
 *
 * Usage:
 *   import { useFormPersistence } from '../utils/formPersistence';
 *
 *   const { saveDraft, loadDraft, clearDraft, hasDraft } = useFormPersistence('quotations', recordId);
 *
 *   // On mount — restore draft if available
 *   useEffect(() => {
 *     if (!isEdit) {
 *       const draft = loadDraft();
 *       if (draft) setForm(prev => ({ ...prev, ...draft }));
 *     }
 *   }, []);
 *
 *   // On field change — debounce save
 *   useEffect(() => {
 *     if (!isEdit && !loading) saveDraft(form);
 *   }, [form]);
 *
 *   // On save/submit — clear draft
 *   handleSave().then(() => clearDraft());
 */

const DRAFT_PREFIX = 'erp_draft_';
const DRAFT_META_PREFIX = 'erp_draft_meta_';
const DRAFT_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Generate a unique draft key for a form.
 * @param {string} module - Module name (e.g., 'quotations', 'cprs', 'leads')
 * @param {string|number|null} recordId - Record ID for edit mode (null for new)
 * @returns {string} Unique draft key
 */
export function getDraftKey(module, recordId) {
  if (recordId) return `${DRAFT_PREFIX}${module}_edit_${recordId}`;
  return `${DRAFT_PREFIX}${module}_new`;
}

/**
 * Generate a metadata key for tracking draft timestamps.
 */
function getMetaKey(draftKey) {
  return `${DRAFT_META_PREFIX}${draftKey.replace(DRAFT_PREFIX, '')}`;
}

/**
 * Save form state to localStorage with timestamp metadata.
 * @param {string} module - Module name
 * @param {string|number|null} recordId - Record ID
 * @param {object} formData - Form state to persist
 */
export function saveDraft(module, recordId, formData) {
  try {
    const key = getDraftKey(module, recordId);
    const metaKey = getMetaKey(key);

    // Don't persist empty forms
    if (!formData || (typeof formData === 'object' && Object.keys(formData).length === 0)) return;

    // Deep clone to avoid reference issues
    const data = JSON.parse(JSON.stringify(formData));

    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem(metaKey, JSON.stringify({
      savedAt: Date.now(),
      module,
      recordId,
    }));
  } catch (e) {
    // localStorage may be full or disabled — fail silently
    console.warn('[FormPersistence] Save failed:', e.message);
  }
}

/**
 * Load form draft from localStorage.
 * @param {string} module - Module name
 * @param {string|number|null} recordId - Record ID
 * @returns {object|null} Saved form data, or null if none/expired
 */
export function loadDraft(module, recordId) {
  try {
    const key = getDraftKey(module, recordId);
    const metaKey = getMetaKey(key);
    const raw = localStorage.getItem(key);
    const metaRaw = localStorage.getItem(metaKey);

    if (!raw) return null;

    // Check expiry
    if (metaRaw) {
      const meta = JSON.parse(metaRaw);
      if (Date.now() - meta.savedAt > DRAFT_EXPIRY_MS) {
        clearDraft(module, recordId);
        return null;
      }
    }

    return JSON.parse(raw);
  } catch (e) {
    console.warn('[FormPersistence] Load failed:', e.message);
    return null;
  }
}

/**
 * Clear a specific form draft.
 * @param {string} module - Module name
 * @param {string|number|null} recordId - Record ID
 */
export function clearDraft(module, recordId) {
  try {
    const key = getDraftKey(module, recordId);
    const metaKey = getMetaKey(key);
    localStorage.removeItem(key);
    localStorage.removeItem(metaKey);
  } catch (e) {
    console.warn('[FormPersistence] Clear failed:', e.message);
  }
}

/**
 * Check if a draft exists for a form.
 * @param {string} module - Module name
 * @param {string|number|null} recordId - Record ID
 * @returns {boolean}
 */
export function hasDraft(module, recordId) {
  try {
    const key = getDraftKey(module, recordId);
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

/**
 * Get all draft keys for a specific module.
 * @param {string} module - Module name
 * @returns {string[]} Array of draft keys
 */
export function getModuleDrafts(module) {
  try {
    const prefix = `${DRAFT_PREFIX}${module}`;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    return keys;
  } catch {
    return [];
  }
}

/**
 * Clean up all expired drafts across all modules.
 */
export function cleanupExpiredDrafts() {
  try {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith(DRAFT_META_PREFIX)) {
        try {
          const meta = JSON.parse(localStorage.getItem(key));
          if (meta && Date.now() - meta.savedAt > DRAFT_EXPIRY_MS) {
            keysToRemove.push(key);
            // Also remove the data key
            const dataKey = `${DRAFT_PREFIX}${meta.module}_${meta.recordId ? `edit_${meta.recordId}` : 'new'}`;
            keysToRemove.push(dataKey);
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch {
    // fail silently
  }
}

/**
 * React hook for form persistence.
 * Combines save/load/clear into a convenient hook interface.
 *
 * @param {string} module - Module name
 * @param {string|number|null} recordId - Record ID (null for new records)
 * @returns {{ saveDraft: Function, loadDraft: Function, clearDraft: Function, hasDraft: Function }}
 */
export function useFormPersistence(module, recordId) {
  return {
    save: (formData) => saveDraft(module, recordId, formData),
    load: () => loadDraft(module, recordId),
    clear: () => clearDraft(module, recordId),
    has: () => hasDraft(module, recordId),
  };
}

/**
 * Merge draft data with server-loaded data.
 * Draft takes precedence for fields the user has touched.
 * Server data is used as the base.
 *
 * @param {object} serverData - Data loaded from the API
 * @param {object} draftData - Data restored from localStorage
 * @returns {object} Merged data (draft overrides server for non-empty fields)
 */
export function mergeDraftWithServer(serverData, draftData) {
  if (!draftData) return serverData;
  if (!serverData) return draftData;

  const merged = { ...serverData };

  for (const [key, value] of Object.entries(draftData)) {
    // Only override if the draft value is non-null/undefined
    // and different from the server value
    if (value !== null && value !== undefined && value !== '') {
      merged[key] = value;
    }
  }

  // Handle arrays (like items) — use draft array if it has entries
  if (Array.isArray(draftData.items) && draftData.items.length > 0) {
    merged.items = draftData.items;
  }

  return merged;
}

// Auto-cleanup expired drafts on module load
if (typeof window !== 'undefined') {
  try {
    cleanupExpiredDrafts();
  } catch {
    // fail silently
  }
}
