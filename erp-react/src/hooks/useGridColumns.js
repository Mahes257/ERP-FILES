/**
 * useGridColumns — column configuration bound to MySQL (via gridConfigService).
 * ------------------------------------------------------------------
 * For grids whose configuration is MODULE-level rather than per-document
 * (list tables, Cost/Profit Workout item tables, marketing detail tables):
 *
 *   · loads the saved config for `gridKey` on mount (GET /settings/grid-configs/{key})
 *   · falls back to the module's built-in default columns when none is saved
 *   · saves every change (reorder/rename/hide/resize/add/remove) back to MySQL,
 *     debounced so a drag-resize writes once on release
 *   · `resetToDefaults()` deletes the stored row and restores the defaults
 *
 * Document-level grids (CPR, Quotation, …) keep the same column shape but ride
 * inside the document payload instead — see CprItemGrid / the sales forms.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadGridConfig, resetGridConfig, saveGridConfig } from '../services/gridConfigService';
import { normalizeGridColumns } from '../utils/gridColumns';

export default function useGridColumns({ gridKey, defaults, enabled = true, debounceMs = 400 }) {
  const defaultsFn = useMemo(
    () => (typeof defaults === 'function' ? defaults : () => defaults || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(typeof defaults === 'function' ? null : defaults)]
  );

  const [columns, setColumnsState] = useState(() => normalizeGridColumns(null, defaultsFn()));
  const [loaded, setLoaded] = useState(!enabled || !gridKey);
  const [saving, setSaving] = useState(false);
  const saveTimer = useRef(null);
  const gridKeyRef = useRef(gridKey);
  gridKeyRef.current = gridKey;

  // Load the persisted configuration once per gridKey.
  useEffect(() => {
    if (!enabled || !gridKey) {
      setLoaded(true);
      return undefined;
    }
    let cancelled = false;
    setLoaded(false);
    loadGridConfig(gridKey).then((saved) => {
      if (cancelled) return;
      if (saved) {
        setColumnsState(normalizeGridColumns(saved, defaultsFn()));
      } else {
        setColumnsState(normalizeGridColumns(null, defaultsFn()));
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridKey, enabled]);

  const persist = useCallback(
    (next) => {
      const key = gridKeyRef.current;
      if (!enabled || !key) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        setSaving(true);
        saveGridConfig(key, next)
          .catch(() => { /* grid keeps working from in-memory state */ })
          .finally(() => setSaving(false));
      }, debounceMs);
    },
    [enabled, debounceMs]
  );

  /** Update the configuration (already-ordered array) and persist it. */
  const setColumns = useCallback(
    (next) => {
      const ordered = (typeof next === 'function' ? next(columns) : next).map((c, i) => ({ ...c, order: i + 1 }));
      setColumnsState(ordered);
      persist(ordered);
    },
    [columns, persist]
  );

  /** Replace the whole configuration without touching the server. */
  const setColumnsLocal = useCallback((next) => {
    setColumnsState((prev) => (typeof next === 'function' ? next(prev) : next).map((c, i) => ({ ...c, order: i + 1 })));
  }, []);

  /** Restore the built-in defaults AND delete the stored configuration. */
  const resetToDefaults = useCallback(async () => {
    setColumnsState(normalizeGridColumns(null, defaultsFn()));
    if (enabled && gridKeyRef.current) {
      try {
        await resetGridConfig(gridKeyRef.current);
      } catch {
        /* reset still applies in memory */
      }
    }
  }, [enabled, defaultsFn]);

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  return {
    columns,
    setColumns,
    setColumnsLocal,
    resetToDefaults,
    loaded,
    saving,
    defaultColumns: defaultsFn
  };
}
