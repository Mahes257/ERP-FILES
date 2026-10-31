import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Loader2 } from 'lucide-react';
import followUpService from '../../services/followUpService';
import { formatDate, formatTime } from '../../utils/leadHelpers';
import { notesDisplayText } from '../../utils/leadNotes';

/** Remarks text: the written remark only — never the raw {"__crmMeta":{…}} blob. */
const remarksText = (value) => notesDisplayText(value) || '—';

/**
 * "Last Follow-up" cell for the Follow-ups list.
 *
 * Shows the MOST RECENT follow-up date for the row's Lead/Client with a
 * dropdown caret. Opening it lazily loads the REAL persisted follow-up history
 * for that Lead/Client (followUpService.history → GET /followups/history,
 * filtered server-side by leadId/clientId) and lists every record newest →
 * oldest with its own Date, Time and Remarks — the row's original Date column
 * is never touched.
 */
export default function FollowUpHistoryDropdown({ row }) {
  const [open, setOpen] = useState(false);
  const [records, setRecords] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, maxHeight: 320 });
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  const MARGIN = 8;
  const GAP = 6;

  // Most recent follow-up date for the same Lead/Client (computed by the
  // backend across the whole history); falls back to the row's own date.
  const latestDate = row.lastFollowUpDate || row.followupDate || '';

  const loadHistory = useCallback(async () => {
    if (loading || records !== null) return;
    setLoading(true);
    setError(false);
    try {
      const res = await followUpService.history(row.leadId, row.clientId);
      setRecords(Array.isArray(res) ? res : res?.data ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loading, records, row.leadId, row.clientId]);

  const toggle = (e) => {
    e.stopPropagation();
    setOpen((prev) => {
      const next = !prev;
      if (next) loadHistory();
      return next;
    });
  };

  // Position the portaled menu below the trigger, flipping up when there is
  // not enough viewport space (same rules as the ActionMenu / revision menu).
  useLayoutEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger) return undefined;
    const rect = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuWidth = menu?.offsetWidth || 300;
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
    let left = rect.left;
    if (left + maxW > vw - MARGIN) left = vw - MARGIN - maxW;
    left = Math.max(MARGIN, Math.min(left, vw - maxW - MARGIN));
    setPos({ top, left, maxHeight });
  }, [open, records, loading, error]);

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

  // Newest → oldest (backend already sorts; defensive re-sort by date then time).
  const sorted = [...(Array.isArray(records) ? records : [])].sort((a, b) => {
    const da = (a.followupDate || '').slice(0, 10);
    const db = (b.followupDate || '').slice(0, 10);
    if (da !== db) return da < db ? 1 : -1;
    return String(b.time || '').localeCompare(String(a.time || ''));
  });

  const customerName = row.companyName || row.leadName || row.businessName || '';

  return (
    <>
      <span className="inline-flex items-center min-w-0">
        {latestDate ? (
          <button
            ref={triggerRef}
            type="button"
            className="fuh-trigger"
            onClick={toggle}
            aria-haspopup="menu"
            aria-expanded={open}
            title="Show follow-up history"
          >
            <span className="fuh-trigger-date">{formatDate(latestDate) || '—'}</span>
            <ChevronDown className="fuh-caret" />
          </button>
        ) : (
          <span className="crm-erp-cell-muted">—</span>
        )}
      </span>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fuh-menu"
            style={{ position: 'fixed', top: pos.top, left: pos.left, maxHeight: pos.maxHeight, zIndex: 2147483000, minWidth: 280, maxWidth: 380 }}
          >
            {customerName && (
              <div className="fuh-header">
                <span className="fuh-header-name">{customerName}</span>
                {records !== null && (
                  <span className="fuh-header-count">
                    {sorted.length} follow-up{sorted.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            )}
            {loading ? (
              <div className="fuh-status">
                <Loader2 className="fuh-spin" /> Loading history…
              </div>
            ) : error ? (
              <div className="fuh-status fuh-error">Could not load follow-up history</div>
            ) : sorted.length === 0 ? (
              <div className="fuh-status">No follow-up history for this lead / client</div>
            ) : (
              <div className="fuh-list">
                {sorted.map((h) => (
                  <div key={h.id} className="fuh-entry">
                    <div className="fuh-entry-meta">
                      <span className="fuh-entry-date">{formatDate(h.followupDate) || '—'}</span>
                      {formatTime(h.time) && <span className="fuh-entry-time">{formatTime(h.time)}</span>}
                    </div>
                    <div className="fuh-entry-remarks">
                      <span className="fuh-entry-remarks-label">Remarks:</span>{' '}
                      {remarksText(h.discussionSummary)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
