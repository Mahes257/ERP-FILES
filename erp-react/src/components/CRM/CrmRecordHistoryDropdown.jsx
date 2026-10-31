import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, GitBranch, Loader2 } from 'lucide-react';
import { fetchEditCount, fetchEditHistory } from '../../utils/editHistory';

/**
 * CRM record version-history dropdown (Leads / Clients / Follow-ups).
 *
 * The CRM modules use the shared snapshot architecture (record_revisions):
 * every edit appends an immutable version snapshot, and the record's detail
 * view shows the version timeline (view-only field diffs). This cell adds a
 * lazy history trigger next to the record's first-column value — only when
 * the record actually HAS history (no history → no arrow, no dropdown).
 *
 * Whether history exists is decided with the lightweight edit-count endpoint
 * (one small request per row); the full version list is fetched LAZILY only
 * when the trigger is opened, so list rendering stays O(1) per row.
 */
export default function CrmRecordHistoryDropdown({ row, moduleKey, onOpen, children }) {
  const [hasHistory, setHasHistory] = useState(false);
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const MARGIN = 8;
  const GAP = 6;

  // Decide arrow visibility from the lightweight count endpoint only.
  useEffect(() => {
    let cancelled = false;
    fetchEditCount(moduleKey, row.id)
      .then((count) => {
        if (!cancelled) setHasHistory(Number(count) > 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduleKey, row.id]);

  const loadVersions = useCallback(async () => {
    if (loading || versions !== null) return;
    setLoading(true);
    setError(false);
    try {
      const groups = await fetchEditHistory(moduleKey, row.id);
      setVersions(Array.isArray(groups) ? groups : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, versions, moduleKey, row.id]);

  const toggle = (e) => {
    e.stopPropagation();
    if (!hasHistory) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) loadVersions();
      return next;
    });
  };

  const selectVersion = () => {
    setOpen(false);
    onOpen(row);
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
    const menuWidth = menu?.offsetWidth || 260;
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
  }, [open, versions, loading, error]);

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

  const entries = Array.isArray(versions) ? versions : [];
  const sorted = [...entries].sort((a, b) => (Number(a.version) || 0) - (Number(b.version) || 0));
  const newestVersion = sorted.length > 0 ? Number(sorted[sorted.length - 1].version) || 0 : 0;

  return (
    <>
      <span className="inline-flex items-center gap-1.5 min-w-0">
        {children}
        {!checking && hasHistory && (
          <button
            ref={triggerRef}
            type="button"
            className="crm-rev-trigger opacity-0 group-hover:opacity-100 focus:opacity-100"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            title="Version history"
          >
            <GitBranch className="w-3.5 h-3.5" />
          </button>
        )}
      </span>
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
                <Loader2 className="qpo-rev-spin" /> Loading versions…
              </div>
            ) : error ? (
              <div className="qpo-rev-status qpo-rev-error">Could not load version history</div>
            ) : sorted.length === 0 ? (
              <div className="qpo-rev-status">No version history yet</div>
            ) : (
              sorted.map((entry, i) => {
                const version = Number(entry.version) || 0;
                const isLast = i === sorted.length - 1;
                const isCurrent = isLast || version === newestVersion;
                const sectionLabel = isCurrent ? 'Current' : version > 0 ? `Version ${version}` : 'Original';
                return (
                  <div className="qpo-rev-group" key={entry.id ?? `v${version}`}>
                    <div className={`qpo-rev-group-title${isCurrent ? ' current' : ''}`}>{sectionLabel}</div>
                    <button
                      type="button"
                      role="menuitem"
                      className="am-item"
                      onClick={selectVersion}
                    >
                      <GitBranch className="am-item-icon" />
                      <span className="qpo-rev-item-no">Version {version}</span>
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
