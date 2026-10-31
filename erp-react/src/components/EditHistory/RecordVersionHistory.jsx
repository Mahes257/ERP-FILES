/**
 * RecordVersionHistory — the Quotation version-history experience for CRM
 * records (Lead / Client / Follow-up).
 * -------------------------------------------------------------------------
 * Sales documents keep a chain of immutable revision rows, so their view pages
 * can diff two stored snapshots directly. A CRM record keeps its id and stores
 * each edit's BEFORE-state in `record_revisions`, so the chain shown here is:
 *
 *   original snapshot (version 1) → … → latest snapshot → the live record
 *
 * The live record is the current version — it is real data from GET /{module}/:id,
 * never a synthesized snapshot. One edit therefore adds exactly one stored
 * version (the state it replaced) plus the current record, and merely opening
 * or refreshing the page never adds anything.
 *
 * Rendering reuses the SAME components as the Quotation view:
 *   VersionComparison · RevisionHistoryTable · EditHistoryTimeline
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import api from '../../api/axiosInstance';
import { DEFAULT_IGNORED_FIELDS, compareRevisionSnapshots } from '../../utils/versionDiff';
import EditHistoryTimeline from './EditHistoryTimeline';
import RevisionHistoryTable from './RevisionHistoryTable';
import VersionComparison from './VersionComparison';

/** backend module → frontend edit-history module key */
const EDIT_HISTORY_KEYS = {
  lead: 'lead',
  customer: 'customer',
  'follow-up': 'followUp'
};

/** Fields on the E-Action read model that are not columns of the stored row. */
const E_ACTION_READ_MODEL_FIELDS = ['salesOrderId', 'customer'];

/** Scalar state of the live record, compared like a stored snapshot. */
function liveSnapshot(record) {
  const out = {};
  if (!record || typeof record !== 'object') return out;
  Object.entries(record).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      out[key] = '';
      return;
    }
    // The stored snapshots only carry scalar columns; nested collections are
    // records ABOUT the record, not its content.
    if (typeof value === 'object') return;
    out[key] = String(value);
  });
  return out;
}

const CURRENT_ID = 'current';

/**
 * Read-model fields added by a page normalizer, not columns of the stored
 * entity. They must never be reported as edits.
 */
const CRM_READ_MODEL_FIELDS = {
  lead: ['leadNo', 'contactPerson', 'expectedValue', 'firstName', 'lastName', 'date'],
  customer: [],
  'follow-up': []
};

export default function RecordVersionHistory({
  module,
  recordId,
  record,
  docNumber = '',
  status = '',
  // Modules served under their own authority (e.g. Sales E-Actions) pass the
  // concrete endpoints instead of the generic DOCUMENT_VIEW ones.
  revisionsUrl = null,
  historyUrl = null,
  // Maps both a stored snapshot and the live record to one comparable shape
  // (e.g. dates to date-only, custom fields to canonical JSON).
  snapshotNormalizer = null
}) {
  const fetchKey = `${module}:${recordId}`;
  // Loaded state is keyed by record so a new record never renders the previous
  // one's snapshots while its own request is in flight.
  const [loaded, setLoaded] = useState({ key: null, revisions: [], failed: false });
  const loading = recordId != null && loaded.key !== fetchKey;
  const revisions = useMemo(() => (loading ? [] : loaded.revisions), [loading, loaded.revisions]);
  const failed = !loading && loaded.failed;

  // Selection is keyed the same way: a new record starts on its current
  // version without an effect resetting state after the render.
  const [selection, setSelection] = useState({ key: null, id: CURRENT_ID });
  const selectedId = selection.key === fetchKey ? selection.id : CURRENT_ID;
  const selectRevision = useCallback(
    (revisionId) => setSelection({ key: fetchKey, id: revisionId }),
    [fetchKey]
  );

  useEffect(() => {
    if (recordId == null) return undefined;
    let cancelled = false;
    api
      .get(revisionsUrl || `/record-revisions/${module}/${recordId}`)
      .then((res) => {
        if (cancelled) return;
        const body = res?.data;
        const list = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
        setLoaded({ key: fetchKey, revisions: list, failed: false });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ key: fetchKey, revisions: [], failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [fetchKey, module, recordId, revisionsUrl]);

  const chain = useMemo(() => {
    const stored = revisions.map((rev) => ({
      // The first stored snapshot IS the original state; the live record is the
      // version after the most recent edit.
      id: rev.id,
      number: docNumber,
      revision: Math.max(0, Number(rev.version) - 1),
      status: rev.fields?.status || 'Saved',
      revisionDate: rev.createdAt,
      // The editor recorded when this snapshot was replaced — i.e. who moved
      // the record away from this version.
      changedBy: rev.changedBy || null,
      latestRevision: false
    }));
    const latestStored = revisions[revisions.length - 1];
    return [
      ...stored,
      {
        id: CURRENT_ID,
        number: docNumber,
        revision: revisions.length,
        status: status || record?.status || 'Current',
        // The latest stored snapshot was captured at the moment of the most
        // recent edit, so it timestamps the current state more reliably than a
        // possibly stale updatedAt column.
        revisionDate: latestStored?.createdAt || record?.updatedAt || record?.createdAt || null,
        changedBy: latestStored?.changedBy || record?.updatedBy || null,
        latestRevision: true
      }
    ];
  }, [revisions, docNumber, status, record]);

  const selectedIndex = chain.findIndex((rev) => String(rev.id) === String(selectedId));

  const ignoredFields = useMemo(
    () => new Set([
      ...DEFAULT_IGNORED_FIELDS,
      ...(CRM_READ_MODEL_FIELDS[module] || []),
      ...(module === 'e-action' ? E_ACTION_READ_MODEL_FIELDS : [])
    ]),
    [module]
  );

  const comparison = useMemo(() => {
    if (selectedIndex < 0) return null;
    const selected = chain[selectedIndex];
    const isCurrent = selected.id === CURRENT_ID;
    const normalize = (fields) => (snapshotNormalizer ? snapshotNormalizer(fields) : fields);
    const previousFields = selectedIndex > 0 ? normalize(revisions[selectedIndex - 1]?.fields) : null;
    // Normalize BEFORE flattening the live record, so a field the normalizer
    // derives from a nested read-model object is part of the comparison.
    const selectedFields = isCurrent
      ? liveSnapshot(normalize(record))
      : normalize(revisions[selectedIndex]?.fields);
    if (!previousFields || !selectedFields) return null;
    return compareRevisionSnapshots(previousFields, selectedFields, { ignored: ignoredFields });
  }, [chain, ignoredFields, selectedIndex, record, revisions, snapshotNormalizer]);

  const selected = selectedIndex >= 0 ? chain[selectedIndex] : null;
  const isCurrent = selected?.id === CURRENT_ID;

  let unavailable = null;
  if (!loading && failed) {
    unavailable = 'The revision history could not be loaded, so a comparison is unavailable.';
  } else if (!loading && revisions.length === 0) {
    unavailable = 'This record has not been revised yet — it has only one saved version, so there is nothing to compare.';
  } else if (!loading && !isCurrent && selectedIndex === 0) {
    unavailable = 'This is the Original version — no earlier saved version exists to compare it with.';
  }

  const direction = selected
    ? isCurrent
      ? revisions.length > 0
        ? `Current version compared with Version ${revisions.length}`
        : null
      : selectedIndex > 0
        ? `Version ${selectedIndex + 1} compared with Version ${selectedIndex}`
        : null
    : null;

  const goToCurrent = useCallback(() => selectRevision(CURRENT_ID), [selectRevision]);

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-slate-400">
        Every edit is preserved as a saved version below. The record keeps its identity; previous
        versions are never deleted or overwritten.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading version history…
        </div>
      ) : (
        <>
          <VersionComparison
            comparison={comparison}
            direction={direction}
            loading={false}
            unavailable={unavailable}
            selectedLabel={isCurrent ? 'Current version' : `Version ${selectedIndex + 1}`}
            currentHref={isCurrent ? null : '#current'}
            onGoToCurrent={isCurrent ? null : goToCurrent}
          />

          <RevisionHistoryTable
            revisions={chain}
            docNumber={docNumber}
            currentId={selectedId}
            showChangedBy={module === 'e-action'}
            onSelect={(rev) => selectRevision(rev.id)}
          />

          {failed && (
            <div className="text-xs text-rose-500">
              The stored revision snapshots could not be loaded. The main record is unaffected.
            </div>
          )}

          <EditHistoryTimeline
            moduleKey={EDIT_HISTORY_KEYS[module] || module}
            recordId={recordId}
            endpoint={historyUrl}
            limit={50}
          />
        </>
      )}
    </div>
  );
}
