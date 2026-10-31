/**
 * useDetailColumns — the persisted column configuration for a READ-ONLY
 * View / Preview / PDF surface.
 * ------------------------------------------------------------------
 * It resolves, in order of precedence:
 *
 *   1. the record's OWN saved column configuration (`recordColumns`, e.g. the
 *      CPR item grid's itemColumnsJson) — historical documents therefore stay
 *      immutable and keep rendering the columns they were saved with;
 *   2. otherwise the MODULE configuration the creation/edit grid persists to
 *      MySQL (`sales.items.quotation`, `sales.items.invoice`, …), so a column
 *      the user adds / renames / reorders / hides / resizes in the form shows
 *      up exactly the same way in the View, the Preview and the PDF;
 *   3. otherwise the built-in defaults for the named set.
 *
 * No localStorage, no hardcoded per-page arrays.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadGridConfig } from '../services/gridConfigService';
import {
  DETAIL_COLUMN_SETS,
  detailColumnsFor,
  visibleDetailColumns
} from '../utils/detailColumns';

export default function useDetailColumns({
  setName,
  recordColumns,
  hideKeys = [],
  enabled = true
}) {
  const gridKey = DETAIL_COLUMN_SETS[setName]?.gridKey || null;
  const recordSignature = JSON.stringify(recordColumns || null);
  const hideSignature = JSON.stringify(hideKeys || []);

  const local = useMemo(
    () => detailColumnsFor(setName, { recordColumns, hideKeys }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setName, recordSignature, hideSignature]
  );

  const [columns, setColumns] = useState(local);
  const [loaded, setLoaded] = useState(!enabled || !gridKey);

  useEffect(() => {
    let cancelled = false;
    const hasRecordConfig = Array.isArray(recordColumns) && recordColumns.length > 0;
    // 1. A record that carries its own saved configuration is authoritative.
    if (hasRecordConfig || !gridKey || !enabled) {
      setColumns(local);
      setLoaded(true);
      return undefined;
    }
    // 2/3. Module configuration from MySQL, falling back to the defaults.
    setLoaded(false);
    loadGridConfig(gridKey).then((saved) => {
      if (cancelled) return;
      setColumns(
        Array.isArray(saved) && saved.length > 0
          ? detailColumnsFor(setName, { recordColumns: saved, hideKeys })
          : local
      );
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setName, gridKey, recordSignature, hideSignature, enabled]);

  const visibleColumns = useMemo(() => visibleDetailColumns(columns), [columns]);

  return { columns, visibleColumns, loaded, gridKey };
}
