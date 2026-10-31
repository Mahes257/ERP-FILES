import { useCallback, useEffect, useRef, useState } from 'react';
import { BulkPrefillBanner } from '../components/Common';
import {
  activeBulkRecord, advanceBulkQueue, clearBulkQueue, getModule
} from '../utils/bulkUpload';

/**
 * useBulkPrefill — wires the Bulk Upload queue into an existing creation form.
 *
 * On mount it reads the queue stored by BulkUploadModal for `moduleKey` and
 * pre-fills the form state (setForm) with the extracted record — and the item
 * grid (setItems) when line items were detected. Nothing is saved here: the
 * user reviews/corrects the form and clicks the EXISTING Save button.
 *
 * Multi-record flow: the "Load next record" banner button advances the queue
 * and re-fills the form from its pristine base state, so data from the
 * previous record can never leak into the next one.
 *
 * The queue is a mount-scoped session: when the form unmounts (e.g. the user
 * saved and navigated away) the queue is cleared, so an already-saved record
 * is never re-applied if the create page is opened again — this is what
 * prevents duplicate record creation (requirement #9). A new Bulk Upload
 * always starts a fresh queue.
 *
 * Returns a banner element (render it anywhere, e.g. `{bulkBanner}`) that
 * shows progress across multiple documents and lets the user load the next
 * record or clear the queue.
 */
export default function useBulkPrefill({ moduleKey, setForm, setItems, enabled = true }) {
  const [state, setState] = useState(null);
  const appliedRef = useRef(false);
  // Pristine form snapshot captured at first apply — "Load next record"
  // resets to this before merging the new record so stale fields from the
  // previous record are cleared instead of persisting.
  const baseRef = useRef(null);
  const itemsAppliedRef = useRef(false);

  const applyValues = useCallback(
    (record) => {
      if (!record?.values) return;
      setForm((prev) => {
        if (!baseRef.current) baseRef.current = { ...prev };
        return { ...prev, ...record.values };
      });
      const hasItems = Array.isArray(record.items) && record.items.length > 0;
      if (typeof setItems === 'function') {
        if (hasItems) {
          setItems(record.items);
        } else if (itemsAppliedRef.current) {
          // Next record has no line items — clear the grid so the previous
          // record's items don't linger. Forms self-heal by re-adding a
          // blank row through their own empty-items effect.
          setItems([]);
        }
        itemsAppliedRef.current = hasItems;
      }
    },
    [setForm, setItems]
  );

  const applyRecord = useCallback(
    (record, index, total) => {
      if (!record?.values) return;
      applyValues(record);
      setState({ index, total, fileName: record.fileName });
    },
    [applyValues]
  );

  // Apply the queue once per page mount (never in edit mode). The apply is
  // deferred a tick so the form's own mount effects run first. The appliedRef
  // is set inside the timer (not in the effect body) so React StrictMode's
  // double-mount — which clears the first timer in cleanup — still applies.
  useEffect(() => {
    if (!enabled || !moduleKey || appliedRef.current) return undefined;
    const active = activeBulkRecord(moduleKey);
    if (!active) return undefined;
    const timer = setTimeout(() => {
      appliedRef.current = true;
      applyRecord(active.record, active.index, active.total);
    }, 0);
    return () => clearTimeout(timer);
  }, [enabled, moduleKey, applyRecord]);

  // Mount-scoped queue: a real unmount (after apply) ends the batch session so
  // a saved record can never be re-applied when the form is revisited.
  // StrictMode's simulated unmount runs before the apply timer fires
  // (appliedRef is still false), so it never clears a live queue.
  useEffect(() => {
    return () => {
      if (appliedRef.current && moduleKey) clearBulkQueue(moduleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadNext = useCallback(() => {
    if (!moduleKey) return;
    const next = advanceBulkQueue(moduleKey);
    if (!next) return;
    const record = next.records[next.index];
    if (!record?.values) return;
    setForm((prev) => ({ ...(baseRef.current || prev), ...record.values }));
    const hasItems = Array.isArray(record.items) && record.items.length > 0;
    if (typeof setItems === 'function') {
      if (hasItems) {
        setItems(record.items);
      } else if (itemsAppliedRef.current) {
        setItems([]);
      }
      itemsAppliedRef.current = hasItems;
    }
    setState({ index: next.index, total: next.records.length, fileName: record.fileName });
  }, [moduleKey, setForm, setItems]);

  const clear = useCallback(() => {
    if (moduleKey) clearBulkQueue(moduleKey);
    appliedRef.current = false;
    setState(null);
  }, [moduleKey]);

  if (!state) return null;

  return (
    <BulkPrefillBanner
      title={getModule(moduleKey)?.title || 'Create'}
      fileName={state.fileName}
      index={state.index}
      total={state.total}
      onNext={state.index + 1 < state.total ? loadNext : null}
      onClear={clear}
    />
  );
}
