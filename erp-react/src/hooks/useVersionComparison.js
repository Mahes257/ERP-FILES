/**
 * useVersionComparison — resolves the version the user is looking at, the
 * version immediately before it, and the difference between the two.
 * -------------------------------------------------------------------------
 * Every Sales document view page already receives its revision chain in its own
 * detail response (`doc.revisions`, served by the module service). This hook
 * adds exactly one thing: it fetches the PRECEDING revision's snapshot with the
 * SAME service method the page already uses and diffs the two.
 *
 * No new endpoint, no second history store: the snapshots are the immutable
 * revision rows the backend already keeps, and the comparison is the same
 * `compareRevisionSnapshots` helper for all eight document types.
 *
 * Nothing is fetched unless the caller enables it (a page only needs the
 * comparison while the reader is inspecting a version), so a normal document
 * view costs no extra request.
 *
 * Returned:
 *   · chain        oldest → newest revision summaries
 *   · selected     the chain entry being viewed (null for a legacy response
 *                  that carries no chain)
 *   · previous     the immediately preceding saved revision, or null
 *   · previousDoc  that revision's own snapshot (null until loaded)
 *   · comparison   the diff, or null when there is nothing to compare
 *   · direction    "Revision 2 compared with Revision 1"
 *   · unavailable  why a comparison cannot be shown — never a fabricated one
 */
import { useEffect, useMemo, useState } from 'react';
import {
  chainEntryFor,
  compareRevisionSnapshots,
  comparisonDirection,
  previousChainEntry,
  sortRevisionChain
} from '../utils/versionDiff';

/** Nothing loaded yet. A single state object keeps the load atomic. */
const IDLE = { revisionId: null, doc: null, failed: false };

export default function useVersionComparison({ service, doc, enabled = true, normalize = null, ignored = null }) {
  // `normalize` must be the SAME read-model normalizer the view page applied to
  // the document on screen. Without it the two sides would not be like for like
  // — the normalizer mirrors and defaults a handful of fields, so a raw snapshot
  // would look as though it were missing values the page's own document has.
  const normalizeDoc = useMemo(
    () => (typeof normalize === 'function' ? normalize : (raw) => raw),
    [normalize]
  );
  const chain = useMemo(() => sortRevisionChain(doc?.revisions), [doc?.revisions]);
  const selected = useMemo(() => chainEntryFor(doc?.revisions, doc?.id), [doc?.revisions, doc?.id]);
  const previous = useMemo(() => previousChainEntry(doc?.revisions, doc?.id), [doc?.revisions, doc?.id]);
  const previousId = previous?.id ?? null;

  const [loaded, setLoaded] = useState(IDLE);

  const canCompare = Boolean(enabled && doc && previousId != null && service?.get);

  useEffect(() => {
    if (!canCompare) return undefined;
    let cancelled = false;
    Promise.resolve(service.get(previousId))
      .then((res) => {
        if (cancelled) return;
        const body = res?.data ?? res;
        setLoaded({
          revisionId: previousId,
          doc: body && typeof body === 'object' ? normalizeDoc(body) : null,
          failed: false
        });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ revisionId: previousId, doc: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [canCompare, service, previousId, normalizeDoc]);

  // The snapshot counts only when it belongs to the revision we now compare
  // with — so switching versions (or documents) never diffs against a stale one.
  const ready = canCompare && loaded.revisionId === previousId;
  const snapshot = ready ? loaded.doc : null;
  const failed = ready && loaded.failed;

  // The document on screen goes through the SAME normalizer as the fetched
  // snapshot, whatever the caller passed, so the two sides are always compared
  // like for like.
  const currentDoc = useMemo(() => (doc ? normalizeDoc(doc) : null), [normalizeDoc, doc]);

  const comparison = useMemo(() => {
    if (!snapshot || !currentDoc) return null;
    // `ignored` lets a module exclude its own revision plumbing / derived
    // columns from the diff; the shared default policy applies everywhere else.
    return compareRevisionSnapshots(snapshot, currentDoc, ignored ? { ignored } : {});
  }, [snapshot, currentDoc, ignored]);

  let unavailable = null;
  if (enabled) {
    if (!Array.isArray(doc?.revisions) || doc.revisions.length <= 1) {
      unavailable = 'This document has only one saved version, so there is nothing to compare.';
    } else if (!previous) {
      unavailable = 'This is the Original version — no earlier saved version exists to compare it with.';
    } else if (failed) {
      unavailable = 'The previous version could not be loaded, so a comparison is unavailable.';
    }
  }

  return {
    chain,
    selected,
    previous,
    previousDoc: snapshot,
    comparison,
    direction: comparisonDirection(selected, previous),
    loading: canCompare && !ready,
    unavailable
  };
}
