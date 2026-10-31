import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, GitBranch, Loader2 } from 'lucide-react';
import { cpoNo } from '../../utils/salesHelpers';

/**
 * Generic revision-history dropdown for a document-number cell (CPR / CW / PW /
 * Quotation / Sales Contract / Sales Order / Proforma / DC / Invoice / Credit
 * Note / Payment Receipt).
 *
 * When the list row is the LATEST revision of a chain (row.revision > 0) the
 * number becomes an expandable dropdown:
 *
 *   QTN-2026-000153 ▼
 *     ORIGINAL
 *     QTN-2026-000153
 *     REVISION 1
 *     QTN-2026-000153(1)
 *     REVISION 2
 *     QTN-2026-000153(2)
 *     CURRENT
 *     QTN-2026-000153(2)
 *
 * The chain is fetched LAZILY on first open via `getDoc(id)` (the module's
 * service get — every sales module returns `revisions` in its detail
 * response). Selecting a revision navigates via `viewRoute(rev)` to that
 * revision's own read-only view page, which loads that exact revision's
 * stored data. Rows without revisions render as plain text.
 */
export default function DocRevisionCell({ row, getDoc, viewRoute, numberField = 'quotationNo' }) {
  const revision = Number(row?.revision) || 0;
  const hasRevisions = revision > 0;
  const displayNo = cpoNo(baseNumber(row?.[numberField]));

  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const MARGIN = 8;
  const GAP = 6;

  const loadChain = useCallback(async () => {
    if (loading || chain !== null) return;
    setLoading(true);
    setError(false);
    try {
      const res = await getDoc(row.id);
      const raw = res?.data ?? res ?? {};
      setChain(Array.isArray(raw.revisions) ? raw.revisions : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [chain, loading, getDoc, row.id]);

  const toggle = (e) => {
    e.stopPropagation();
    if (!hasRevisions) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) loadChain();
      return next;
    });
  };

  const navigate = useNavigate();
  const selectRevision = (rev) => {
    setOpen(false);
    navigate(viewRoute(rev));
  };

  // Position the portaled menu below the trigger, flipping up / left when
  // there is not enough viewport space (same rules as the ActionMenu).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return undefined;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = menu?.offsetWidth || 240;
    const menuHeight = menu?.offsetHeight || 320;
    const maxW = Math.min(menuWidth, vw - 2 * MARGIN);
    const spaceBelow = vh - rect.bottom - GAP;
    let top = rect.bottom + GAP;
    let maxHeight = spaceBelow;
    if (spaceBelow < Math.min(menuHeight, 320) && rect.top - GAP > spaceBelow) {
      top = Math.max(MARGIN, rect.top - Math.min(menuHeight, vh - 2 * MARGIN) - GAP);
      maxHeight = vh - top - MARGIN;
    }
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN));
    maxHeight = Math.max(120, Math.min(maxHeight, vh - top - MARGIN));
    let left = rect.right - maxW;
    if (left < MARGIN) {
      left = rect.left;
      if (left + maxW > vw - MARGIN) left = vw - MARGIN - maxW;
    }
    left = Math.max(MARGIN, Math.min(left, vw - maxW - MARGIN));
    setPos({ top, left, maxHeight });
  }, [open, chain, loading, error]);

  // Close on Escape, outside click and any scroll (page or container).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onScroll = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    window.addEventListener('scroll', onScroll, true);
    document.addEventListener('wheel', onScroll, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('scroll', onScroll, true);
      document.removeEventListener('wheel', onScroll);
    };
  }, [open]);

  if (!hasRevisions) {
    const no = displayNo || cpoNo(row?.[numberField]) || '—';
    const route = viewRoute(row);
    return route ? (
      <a
        href={route}
        className="font-bold text-[#0B4A3D] hover:underline cursor-pointer"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigate(route); }}
      >
        {no}
      </a>
    ) : (
      <span className="qpo-rev-plain">{no}</span>
    );
  }

  const entries = Array.isArray(chain) ? chain : [];
  // Oldest → newest so the dropdown reads Original, Revision 1, … , Current.
  const sorted = [...entries].sort((a, b) => (Number(a.revision) || 0) - (Number(b.revision) || 0));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="qpo-rev-trigger"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`${displayNo} — ${revision} revision${revision === 1 ? '' : 's'}`}
      >
        <span>{displayNo}</span>
        <ChevronDown className="qpo-rev-caret" />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="qpo-rev-menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, maxHeight: pos.maxHeight, zIndex: 2147483000, minWidth: 260 }}
          >
            {loading ? (
              <div className="qpo-rev-status">
                <Loader2 className="qpo-rev-spin" /> Loading revisions…
              </div>
            ) : error ? (
              <div className="qpo-rev-status qpo-rev-error">Could not load revisions</div>
            ) : sorted.length === 0 ? (
              <div className="qpo-rev-status">No revision history</div>
            ) : (
              sorted.map((rev, i) => {
                const isLast = i === sorted.length - 1;
                const isCurrent = isLast || rev.latestRevision || rev.id === row.id;
                const revNo = rev.number || rev[numberField] || displayNo;
                const sectionLabel = isCurrent
                  ? 'Current'
                  : Number(rev.revision) > 0
                    ? `Revision ${rev.revision}`
                    : 'Original';
                return (
                  <div className="qpo-rev-group" key={rev.id}>
                    <div className={`qpo-rev-group-title${isCurrent ? ' current' : ''}`}>{sectionLabel}</div>
                    <button
                      type="button"
                      role="menuitem"
                      className="am-item"
                      onClick={() => selectRevision(rev)}
                    >
                      <GitBranch className="am-item-icon" />
                      <span className="qpo-rev-item-no">{revNo}</span>
                      {isCurrent && (
                        <span className="qpo-rev-badge qpo-rev-badge-current">
                          <CheckCircle2 className="w-3 h-3" /> Current
                        </span>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
    </>
  );
}

/** Mirrors the backend RevisionSupport.baseNumber(): strips a trailing "(N)"
 *  revision suffix so the chain root number is displayed. */
function baseNumber(no = '') {
  const str = String(no || '');
  const open = str.lastIndexOf('(');
  if (open > 0 && str.endsWith(')')) {
    const inner = str.slice(open + 1, -1);
    if (/^\d+$/.test(inner)) return str.slice(0, open);
  }
  return str;
}
