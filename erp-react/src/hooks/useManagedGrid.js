/**
 * useManagedGrid — one hook that gives any table the full CPR-style column
 * experience: Manage Columns (rename / reorder / hide-show / add-remove custom
 * / reset), drag-to-resize, and persistence.
 *
 * Two persistence modes, both React → Spring Boot → MySQL:
 *
 *  · MODULE mode (default): pass `gridKey`. The configuration lives in the
 *    shared grid-config store (app_settings) and is loaded/saved automatically.
 *  · DOCUMENT mode: pass `documentColumns` + `onDocumentColumnsChange`. The
 *    configuration rides inside the record being edited (the CPR pattern:
 *    Cpr.itemColumnsJson), so it is saved with the document.
 *
 * Custom columns keep their per-row values in `row.customFields[columnId]`;
 * `removeColumnValues(columnId)` lets the caller purge a removed column's data.
 */
import { useEffect, useMemo, useRef } from 'react';
import useColumnManager from '../components/GridColumns/useColumnManager';
import useColumnResize from '../components/GridColumns/useColumnResize';
import useGridColumns from './useGridColumns';
import { normalizeGridColumns } from '../utils/gridColumns';

export default function useManagedGrid({
  gridKey,
  defaults,
  enabled = true,
  documentColumns,
  onDocumentColumnsChange,
  allowCustom = true,
  columnTypes,
  insertBeforeKeys = [],
  itemNoun = 'row',
  rowCount = 0,
  removeColumnValues,
  // Columns that must not exist for this grid at all (e.g. a column removed
  // from the defaults after it had been saved in a user's stored config). They
  // are dropped from the rendered grid AND from the persisted configuration, so
  // no ghost column lingers in Manage Columns.
  excludeKeys = [],
  protectedKeys = ['checkbox', 'actions']
}) {
  const documentMode = Array.isArray(documentColumns);

  // MODULE mode persistence (no-op in document mode).
  const store = useGridColumns({
    gridKey: documentMode ? null : gridKey,
    defaults,
    enabled: enabled && !documentMode
  });

  const defaultsFn = useMemo(
    () => (typeof defaults === 'function' ? defaults : () => defaults || []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(typeof defaults === 'function' ? null : defaults)]
  );

  // Stored configuration minus any excluded column. Pruning here (rather than
  // only at render time) means the ghost column is gone from the grid, the
  // Manage Columns list and the MySQL configuration alike.
  const storedColumns = useMemo(() => {
    if (documentMode || !Array.isArray(store.columns)) return store.columns;
    if (!excludeKeys.length) return store.columns;
    return store.columns.filter((c) => !excludeKeys.includes(c.id || c.key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentMode, store.columns, excludeKeys.join('|')]);

  const prunedStored = storedColumns !== store.columns;

  const columns = useMemo(
    () => normalizeGridColumns(documentMode ? documentColumns : storedColumns, defaultsFn()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [documentMode, documentColumns, storedColumns]
  );

  const setColumns = documentMode ? onDocumentColumnsChange : store.setColumns;

  // Persist the cleanup once (idempotent: after this write the stored config no
  // longer contains the excluded column, so it never runs again).
  const cleanedRef = useRef(false);
  useEffect(() => {
    if (documentMode || !prunedStored || cleanedRef.current || !store.loaded) return;
    cleanedRef.current = true;
    store.setColumns(storedColumns);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentMode, prunedStored, storedColumns, store.loaded]);
  const reset = documentMode
    ? () => onDocumentColumnsChange && onDocumentColumnsChange(normalizeGridColumns(null, defaultsFn()))
    : store.resetToDefaults;

  // True once the configuration differs from the grid's own defaults, so
  // Reset to Default stays available for a grid without custom columns after
  // the user reordered / hid / resized / renamed a column.
  const changedFromDefaults = useMemo(() => {
    const defs = normalizeGridColumns(null, defaultsFn());
    const current = columns;
    if (current.length !== defs.length) return true;
    return current.some((c, i) => {
      const d = defs[i];
      return !d
        || c.id !== d.id
        || c.label !== d.label
        || Boolean(c.hidden) !== Boolean(d.hidden)
        || (c.width ?? null) !== (d.width ?? null);
    });
  }, [columns, defaultsFn]);

  const manager = useColumnManager({
    columns,
    onChange: setColumns,
    onReset: reset,
    allowCustom,
    columnTypes,
    insertBeforeKeys,
    itemNoun,
    rowCount,
    removeColumnValues,
    protectedKeys,
    resetEnabled: changedFromDefaults
  });

  const resize = useColumnResize({ columns, onChange: setColumns });

  const orderedColumns = useMemo(
    () => [...columns].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [columns]
  );
  const visibleColumns = useMemo(() => orderedColumns.filter((c) => !c.hidden), [orderedColumns]);

  // True once the user has actually changed a column's width. Until then the
  // table keeps filling the available space (no premature horizontal scroll).
  const widthsCustomized = useMemo(() => {
    const defaults = defaultsFn();
    return orderedColumns.some((c) => {
      const def = defaults.find((d) => (d.id || d.key) === c.id);
      return def && def.width != null && c.width !== def.width;
    });
  }, [orderedColumns, defaultsFn]);

  return {
    columns: orderedColumns,
    visibleColumns,
    setColumns,
    reset,
    manager,
    resize,
    widthsCustomized,
    loaded: documentMode ? true : store.loaded,
    saving: documentMode ? false : store.saving
  };
}
