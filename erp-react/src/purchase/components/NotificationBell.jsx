/**
 * components/…/NotificationBell.jsx
 * ------------------------------------------------------------------
 * Global header notification bell + its popup panel.
 *
 * DATA SOURCE — the existing backend notification API, via the shared
 * NotificationProvider (`useNotifications`) and services/notificationService:
 *   GET  /notifications              — the user's notifications
 *   GET  /notifications/unread-count — the authoritative unread count
 *   POST /notifications/{id}/read    — mark one as read
 *
 * The panel fetches on OPEN with an AbortController (cleaned up on close /
 * unmount) plus a hard timeout, and renders four distinct states:
 * loading (skeleton), success, empty, and error + Retry. A failed request is
 * reported as a failure — never as an empty list — and never spins forever.
 *
 * The unread badge reads the provider's backend count, the same number the
 * sidebar badge and the full /notifications page use, so all three agree.
 * Opening the panel marks nothing as read; only selecting a notification or
 * pressing "Mark all read" writes.
 * ------------------------------------------------------------------
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  RotateCw,
  X
} from 'lucide-react';
import { useNotifications } from '../../components/Common';
import { getUnreadCount, listNotifications } from '../../services/notificationService';
import { formatRelativeTime } from '../../data/notificationSource';

/** Never leave the panel spinning: the request is aborted after this. */
const LOAD_TIMEOUT_MS = 8000;
/** How many recent notifications the popup shows ("View All" has the rest). */
const RECENT_LIMIT = 10;
/** Panel width and the minimum gap it keeps from the viewport edges. */
const PANEL_WIDTH = 380;
const VIEWPORT_GUTTER = 12;
/** A popup failure is shown in the popup — it must not replace the route. */
const FETCH_OPTIONS = { suppressGlobalError: true };

const PRIORITY_STYLES = {
  URGENT: 'bg-red-50 text-red-600',
  HIGH: 'bg-orange-50 text-orange-600',
  NORMAL: 'bg-blue-50 text-blue-600',
  LOW: 'bg-slate-100 text-slate-500'
};

/** The existing navigation targets for a referenced record (same as the
 *  full Notifications page). */
const REFERENCE_ROUTES = {
  SalesOrder: (id) => `/sales-orders/${id}`,
  Quotation: (id) => `/quotations/${id}/view`,
  SalesContract: (id) => `/sales-contracts/${id}`
};

const byNewest = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
const isUnread = (n) => n?.status === 'UNREAD';
const label = (n) => n?.module || n?.notificationType || 'GENERAL';

function SkeletonRow() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="w-7 h-7 rounded-lg bg-slate-100 shrink-0 animate-pulse" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-2.5 w-2/3 rounded-full bg-slate-100 animate-pulse" />
        <div className="h-2 w-full rounded-full bg-slate-100 animate-pulse" />
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { unreadCount: backendUnread, markAsRead: markAsReadInProvider } = useNotifications();
  const [open, setOpen] = useState(false);
  /** idle | loading | ready | error */
  const [status, setStatus] = useState('idle');
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [marking, setMarking] = useState(false);
  /** Unread total from this panel's own read; null → fall back to the
   *  provider's backend count (the number the sidebar/page also show). */
  const [localCount, setLocalCount] = useState(null);
  /** Viewport-anchored panel position (the panel rides under the bell). */
  const [pos, setPos] = useState(null);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);
  const requestRef = useRef(null);
  /** Monotonic request id: a closed/unmounted panel ignores stale answers. */
  const requestSeq = useRef(0);

  // While the panel is closed (or before its first read settles) the badge is
  // the provider's backend count — the same number the sidebar shows. An open
  // panel shows the fresh count its own read returned.
  const badge = Number(open && localCount != null ? localCount : backendUnread) || 0;

  /* ---------- data ---------- */

  const load = useCallback(async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const seq = ++requestSeq.current;

    setStatus('loading');
    setError('');

    const timer = setTimeout(() => {
      if (seq !== requestSeq.current) return;
      setStatus('error');
      setError('Notifications took too long to load.');
      controller.abort();
    }, LOAD_TIMEOUT_MS);

    try {
      const [list, count] = await Promise.all([
        listNotifications(controller.signal, FETCH_OPTIONS),
        getUnreadCount(controller.signal, FETCH_OPTIONS)
      ]);
      if (seq !== requestSeq.current) return;
      const rows = (Array.isArray(list) ? list : []).slice().sort(byNewest);
      setItems(rows);
      setStatus('ready');
      setLocalCount(count);
    } catch (err) {
      if (seq !== requestSeq.current) return;
      // A timeout already published its own message above.
      if (err?.name === 'AbortError' || err?.code === 'ERR_CANCELED') return;
      setStatus('error');
      setError(err?.message || 'Could not load notifications.');
    } finally {
      clearTimeout(timer);
      if (seq === requestSeq.current) requestRef.current = null;
    }
  }, []);

  /** Anchor the panel under the bell, clamped inside the viewport: on a narrow
   *  screen the bell is close to the right edge, so the panel keeps its width
   *  but slides left just enough to stay fully on-screen. */
  const place = useCallback(() => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || typeof window === 'undefined') return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - VIEWPORT_GUTTER * 2);
    const left = Math.max(
      VIEWPORT_GUTTER,
      Math.min(rect.right - width, window.innerWidth - width - VIEWPORT_GUTTER)
    );
    setPos({ left: Math.round(left), top: Math.round(rect.bottom + 6), width });
  }, []);

  const openPanel = useCallback(() => {
    // A fresh open never shows the previous open's count while it loads.
    setLocalCount(null);
    place();
    setOpen(true);
    load();
  }, [load, place]);

  const closePanel = useCallback(() => {
    // Abort anything in flight and make its answer stale.
    requestSeq.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
    setOpen(false);
    setStatus('idle');
    setError('');
  }, []);

  const toggle = useCallback(() => {
    if (open) closePanel();
    else openPanel();
  }, [open, openPanel, closePanel]);

  /* Unmount: never leave a request or a timer running for a bell that is gone. */
  useEffect(() => () => {
    requestSeq.current += 1;
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  /* ---------- interaction ---------- */

  const markOne = useCallback(async (id) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'READ' } : n)));
    setLocalCount((prev) => Math.max(0, (prev == null ? backendUnread : prev) - 1));
    try {
      // The provider owns the list/badge shared with the sidebar and page.
      await markAsReadInProvider(id);
    } catch {
      /* best-effort: the next fetch re-reads the authoritative state */
    }
  }, [backendUnread, markAsReadInProvider]);

  const openNotification = useCallback(async (item) => {
    closePanel();
    if (isUnread(item)) await markOne(item.id);
    const route = item.referenceType && item.referenceId
      ? REFERENCE_ROUTES[item.referenceType]?.(item.referenceId)
      : null;
    if (route) navigate(route);
  }, [closePanel, markOne, navigate]);

  const markAllRead = useCallback(async () => {
    const unread = items.filter(isUnread);
    if (unread.length === 0 || marking) return;
    setMarking(true);
    setItems((prev) => prev.map((n) => (isUnread(n) ? { ...n, status: 'READ' } : n)));
    setLocalCount((prev) => Math.max(0, (prev == null ? backendUnread : prev) - unread.length));
    try {
      // The backend exposes per-notification read only — the same loop the
      // full Notifications page uses.
      await Promise.all(unread.map((n) => markAsReadInProvider(n.id)));
    } catch {
      /* best-effort */
    } finally {
      setMarking(false);
    }
  }, [items, marking, backendUnread, markAsReadInProvider]);

  const goToAll = useCallback(() => {
    closePanel();
    navigate('/notifications');
  }, [closePanel, navigate]);

  /* Close on outside click / Escape — the header's existing pattern — and keep
     the panel anchored while the window is resized or the page scrolls. */
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) closePanel();
    };
    const onKeyDown = (e) => { if (e.key === 'Escape') closePanel(); };
    const onReflow = () => place();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [open, closePanel, place]);

  const unreadInList = items.filter(isUnread).length;
  const recent = items.slice(0, RECENT_LIMIT);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="topbar-icon-btn relative"
        onClick={toggle}
        aria-label={`Notifications${badge ? ` (${badge} unread)` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="w-4 h-4" />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        // Anchored directly under the bell (see place()); `fixed` keeps it out
        // of the sticky header's flow so no ancestor can clip it.
        <div
          role="dialog"
          aria-label="Notifications"
          style={pos ? { left: pos.left, top: pos.top, width: pos.width } : { visibility: 'hidden' }}
          className="fixed z-[120] bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[min(70vh,560px)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Bell className="w-4 h-4 text-[#0B4A3D] shrink-0" />
              <span className="text-xs font-bold text-slate-800">Notifications</span>
              {unreadInList > 0 && (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-full tabular-nums whitespace-nowrap">
                  {unreadInList} unread
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {status === 'ready' && unreadInList > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={marking}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                >
                  <CheckCheck className="w-3 h-3" /> Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={closePanel}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-600 transition-colors cursor-pointer"
                aria-label="Close notifications"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {status === 'loading' && (
              <div aria-busy="true" aria-live="polite">
                <span className="sr-only">Loading notifications…</span>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </div>
            )}

            {status === 'error' && (
              <div className="px-4 py-8 text-center" role="alert">
                <AlertTriangle className="w-7 h-7 mx-auto text-rose-300 mb-2" />
                <p className="text-xs font-bold text-slate-600">Couldn't load notifications</p>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{error}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold text-white bg-[#0B4A3D] hover:bg-[#0a3f34] transition-colors cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" /> Retry
                </button>
              </div>
            )}

            {status === 'ready' && recent.length === 0 && (
              <div className="px-4 py-12 text-center">
                <Bell className="w-8 h-8 mx-auto text-slate-200 mb-2" />
                <p className="text-xs font-bold text-slate-500">No notifications yet</p>
                <p className="text-[11px] text-slate-400 mt-1">New notifications will appear here.</p>
              </div>
            )}

            {status === 'ready' && recent.length > 0 && (
              <ul className="divide-y divide-slate-50">
                {recent.map((n) => {
                  const unread = isUnread(n);
                  const route = n.referenceType && n.referenceId
                    ? REFERENCE_ROUTES[n.referenceType]
                    : null;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(n)}
                        className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors cursor-pointer ${
                          unread ? 'bg-[#F6FBF9] hover:bg-[#EDF7F4]' : 'bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          unread ? 'bg-[#0B4A3D]/10 text-[#0B4A3D]' : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Bell className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            {unread && <span className="w-1.5 h-1.5 rounded-full bg-[#0B4A3D] shrink-0" />}
                            <span className={`text-[11px] font-bold truncate ${unread ? 'text-slate-900' : 'text-slate-600'}`}>
                              {n.title || 'Notification'}
                            </span>
                          </div>
                          {n.message && (
                            <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
                          )}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                              {label(n)}
                            </span>
                            {n.priority && n.priority !== 'NORMAL' && (
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[n.priority] || PRIORITY_STYLES.LOW}`}>
                                {n.priority}
                              </span>
                            )}
                            <span className="text-[9px] font-semibold text-slate-400 tabular-nums">
                              {formatRelativeTime(n.createdAt)}
                            </span>
                          </div>
                        </div>
                        {route && <ChevronRight className="w-3.5 h-3.5 mt-1 shrink-0 text-slate-300" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-slate-100 bg-slate-50">
            <button
              type="button"
              onClick={goToAll}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-[11px] font-bold text-[#0B4A3D] hover:bg-[#E8F0EE] transition-colors cursor-pointer"
            >
              View All Notifications
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
