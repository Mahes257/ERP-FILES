import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CalendarCheck, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, EyeOff,
  RefreshCw, ShieldCheck
} from 'lucide-react';
import { ConfirmDialog, useToast } from '../../components/Common';
import { getStoredUser } from '../../services/tokenStorage';
import LiveClock from './LiveClock';
import MonthView from './MonthView';
import WeekView from './WeekView';
import DayView from './DayView';
import EventModal from './EventModal';
import ErpEntryModal from './ErpEntryModal';
import { fetchCalendarEntries } from '../../services/calendarService';
import {
  ERP_STATE_ERROR,
  ERP_STATE_READY,
  describeSources,
  emptyErpFeed,
  failedErpFeed,
  isErpFeedLoading,
  isReadOnlyEvent,
  mergeCalendarEvents,
  readyErpFeed
} from './calendarErpEntries';
import {
  CALENDAR_FILTER_CATEGORY_KEYS,
  CALENDAR_ROLES,
  CALENDAR_ROLE_AREAS,
  CATEGORY_MAP,
  ERP_CATEGORIES,
  buildEvent,
  calendarRoleFor,
  categoryFor,
  countByCategory,
  emptyDraft,
  listEvents,
  removeEvent,
  saveEvents,
  toDraft,
  upsertEvent
} from './calendarEvents';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  addDays,
  addMonths,
  formatDayLong,
  formatDayShort,
  formatMonthYear,
  fromDateKey,
  groupEventsByDate,
  periodIncludesDate,
  startOfWeek,
  toDateKey,
  todayAllocatedEvents,
  weekDays,
  zoomFrameBox,
  zoomFromWheelDelta
} from './calendarUtils';
import './calendar.css';

const VIEWS = [
  { key: 'month', label: 'Month' },
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' }
];

const pad2 = (value) => String(value).padStart(2, '0');

/** How long after the last wheel event a zoom gesture is considered finished. */
const ZOOM_SETTLE_MS = 140;

/**
 * How often "Today Allocated" re-reads the clock while it is switched on.
 *
 * The filter's notion of pending is time-based (see `isEventPending`), so an
 * event that finishes while the page is open has to leave the filtered list on
 * its own. One cheap state bump every 30s only while the filter is active — the
 * clock panel above ticks every second without touching this component at all.
 */
const ALLOCATED_REFRESH_MS = 30000;

/**
 * True when the wheel is needed by an element INSIDE the calendar that scrolls
 * on its own (the week/day time grid, marked `data-cal-scroll`).
 *
 * Only consulted for an unmodified wheel: such a gesture is the user scrolling
 * the grid, so it is left alone instead of being turned into a zoom — otherwise
 * a taller-than-viewport time grid could not be scrolled with the wheel at all.
 * `Ctrl`/`Cmd` + wheel always zooms, everywhere in the calendar.
 */
function scrollRegionConsumesWheel(target, deltaY, boundary) {
  let node = target;
  while (node && node !== boundary) {
    if (node.nodeType === 1 && node.hasAttribute('data-cal-scroll')) {
      const canScroll = node.scrollHeight > node.clientHeight + 1;
      if (!canScroll) return false;
      const atTop = node.scrollTop <= 0;
      const atBottom = node.scrollTop + node.clientHeight >= node.scrollHeight - 1;
      if (deltaY < 0 ? !atTop : !atBottom) return true;
      return false;
    }
    node = node.parentElement;
  }
  return false;
}

/** Default booking window for a slot click: the clicked hour, one hour long. */
function slotTimes(hour) {
  const startHour = Number.isFinite(hour) ? Math.min(Math.max(hour, 0), 23) : 9;
  const endHour = Math.min(startHour + 1, 23);
  const endMinute = startHour === 23 ? 59 : 0;
  return { start: `${pad2(startHour)}:00`, end: `${pad2(endHour)}:${pad2(endMinute)}` };
}

/**
 * The standalone Calendar page (route `/calendar`).
 *
 * It renders OUTSIDE the ERP shell on purpose — the header icon opens it in its
 * own browser tab, so it draws its own page frame and never mounts a sidebar.
 * The shared providers (theme, toast, session) still wrap it, which is why dark
 * mode, toasts and the signed-in session behave exactly as elsewhere.
 *
 * State lives here: which view is on screen, which day/month the cursor is on,
 * the locally held events and the category filter. The views underneath are
 * presentational and talk back through callbacks.
 */
export default function CalendarPage() {
  const toast = useToast();
  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => new Date());
  // Read once, during the first render: the store is synchronous, so the
  // calendar never paints an empty grid before the locally held events appear.
  // This list is LOCAL events only — it is the one that is written back to
  // `erp-calendar-events`. Backend entries are held separately in `erpFeed`, so
  // saving a local event can never persist or overwrite an ERP record.
  const [events, setEvents] = useState(() => listEvents());
  // Read-only ERP entries for the displayed range. Never persisted, never
  // merged into `events`; the two lists are combined only for rendering.
  const [erpFeed, setErpFeed] = useState(() => emptyErpFeed());
  // Bumped by "Retry" to re-run the feed effect without changing the range.
  const [erpAttempt, setErpAttempt] = useState(0);
  const [readOnlyEvent, setReadOnlyEvent] = useState(null);
  const [hiddenCategories, setHiddenCategories] = useState(() => new Set());
  // Role PREVIEW — not authorization. It starts on the role the signed-in
  // session actually carries (ADMIN/MANAGER/USER, the backend's own enum) and
  // can be switched to preview another role. It only decides which areas this
  // page paints; nothing here is sent to the server, and the API keeps enforcing
  // the JWT's real role on every request.
  const [role, setRole] = useState(() => calendarRoleFor(getStoredUser()?.role));
  // "Today Allocated" — a view filter over today's still-pending events. It only
  // ever narrows what is DISPLAYED (ids compared in memory); no event record is
  // rewritten, cloned or dropped by it.
  const [todayAllocated, setTodayAllocated] = useState(false);
  // One clock reading for the whole render: the filter compares its events
  // against a single "now", so an event can never be judged pending and complete
  // in the same pass.
  const [now, setNow] = useState(() => new Date());
  const [modal, setModal] = useState({ open: false, mode: 'create', draft: null });
  const [pendingDelete, setPendingDelete] = useState(null);
  // Calendar-only zoom, driven purely by the mouse wheel over the grid.
  //
  // `zoom` is the committed React value (read by the aria description and the
  // zoomed-out/in bounds), while the LIVE value during a gesture is held in a
  // ref and written straight to the DOM. The wheel handler does no work beyond
  // accumulating distance; one `requestAnimationFrame` turns a whole burst of
  // wheel events into a single style write, and the calendar is scaled with a
  // `transform`, which the compositor applies without re-running layout or paint.
  // That keeps a continuous gesture inside the 16.67 ms frame budget — with CSS
  // `zoom` each step re-laid out the entire grid, which is what made it stutter.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const wheelPendingRef = useRef(0);
  const zoomPanRef = useRef(null);
  const zoomCanvasRef = useRef(null);
  const zoomSpacerRef = useRef(null);
  // The calendar's natural (100%) box, measured outside the zoom path: the
  // transform never changes layout, so these only move when the page is resized
  // or the view switches. Reading them per frame is impossible to afford.
  const naturalBoxRef = useRef({ width: 0, height: 0 });
  const zoomFrameRef = useRef(0);
  const zoomSettleRef = useRef(0);

  /**
   * One frame of the zoom: reserve the scaled box, then scale the canvas.
   *
   * Called from the rAF slot below (and only from there), so a burst of wheel
   * events — a trackpad easily fires several per frame — costs exactly one
   * write. The canvas is measured at its natural size, so a viewport resize or a
   * view switch re-measures the same way the wheel path does.
   */
  const flushZoomFrame = useCallback(() => {
    zoomFrameRef.current = 0;
    const pan = zoomPanRef.current;
    const canvas = zoomCanvasRef.current;
    const spacer = zoomSpacerRef.current;
    if (!pan || !canvas || !spacer) return undefined;

    // Everything the wheel delivered since the previous frame becomes ONE zoom
    // step; the sub-step remainder is carried over, so a slow trackpad sweep
    // still lands exactly on a step instead of being lost.
    const pending = wheelPendingRef.current;
    if (pending !== 0) {
      const { zoom: nextZoom, unspent } = zoomFromWheelDelta(zoomRef.current, 0, pending);
      wheelPendingRef.current = unspent;
      zoomRef.current = nextZoom;
    }

    const width = pan.clientWidth;
    if (width > 0 && width !== naturalBoxRef.current.width) {
      naturalBoxRef.current.width = width;
      // The canvas is laid out at its natural width (the transform does not
      // affect layout), so this is what the zoom scales up from.
      canvas.style.width = `${width}px`;
      naturalBoxRef.current.height = canvas.offsetHeight;
    }

    const { width: boxWidth, height: boxHeight, transform } = zoomFrameBox(
      naturalBoxRef.current.width,
      naturalBoxRef.current.height,
      zoomRef.current
    );
    spacer.style.width = `${boxWidth}px`;
    spacer.style.height = `${boxHeight}px`;
    canvas.style.transform = transform;
    return undefined;
  }, []);

  const scheduleZoomFrame = useCallback(() => {
    if (!zoomFrameRef.current) zoomFrameRef.current = requestAnimationFrame(flushZoomFrame);
  }, [flushZoomFrame]);

  const todayKey = toDateKey(new Date());

  /**
   * The wheel listener behind Calendar-only zoom.
   *
   * Registered ONCE, on the calendar canvas only, and explicitly as
   * `{ passive: false }` so `preventDefault()` is allowed: a passive listener
   * cannot cancel anything, and the page would scroll (or the browser would
   * zoom) underneath the calendar zoom.
   *
   * The handler itself is deliberately tiny — accumulate the distance and ask
   * for a frame. Everything that touches the DOM happens once per frame in
   * `flushZoomFrame`, so the wheel rate (up to ~120 events/s on a trackpad) never
   * multiplies into more than 60 style writes a second.
   *
   * Scoped deliberately: the listener sits on the grid area, so a wheel over the
   * ERP shell, over the calendar header/toolbar, or on any other page is never
   * touched. `Ctrl`/`Cmd` + wheel is intercepted here — that is the gesture
   * Chrome would otherwise use for browser page zoom.
   */
  useEffect(() => {
    const canvas = zoomCanvasRef.current;
    if (!canvas) return undefined;

    const onWheel = (event) => {
      const modified = event.ctrlKey || event.metaKey;
      // A horizontal gesture (trackpad swipe, Shift + wheel) pans the zoomed
      // calendar rather than zooming it, so it is left to the browser — but a
      // modified wheel always means zoom.
      if (!modified && Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      // An unmodified wheel the grid itself needs is a scroll, not a zoom.
      if (!modified && scrollRegionConsumesWheel(event.target, event.deltaY, canvas)) return;
      // The gesture is ours: stop the page from scrolling and stop Chrome from
      // applying its own page zoom to a Ctrl + wheel.
      event.preventDefault();

      wheelPendingRef.current += event.deltaY;
      // Keeps the canvas on its own compositor layer for the duration of the
      // gesture (scale changes then cost nothing to animate) and drops it again
      // once the gesture settles, so the final frame is rasterised crisply.
      canvas.classList.add('is-zooming');
      if (zoomSettleRef.current) clearTimeout(zoomSettleRef.current);
      zoomSettleRef.current = window.setTimeout(() => {
        zoomSettleRef.current = 0;
        canvas.classList.remove('is-zooming');
        // Publish the settled value to React: the state stays the single
        // authority on the zoom level, at zero cost per frame.
        setZoom(zoomRef.current);
      }, ZOOM_SETTLE_MS);
      scheduleZoomFrame();
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onWheel);
      if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
      zoomFrameRef.current = 0;
      if (zoomSettleRef.current) clearTimeout(zoomSettleRef.current);
      zoomSettleRef.current = 0;
    };
  }, [scheduleZoomFrame]);

  /**
   * Keeps the natural box in step with the page: viewport resizes and view
   * switches change it, and every change must re-reserve the scaled box. The
   * writes run in a frame (not synchronously in the observer callback) so the
   * resize notification is never re-entered.
   */
  useEffect(() => {
    const pan = zoomPanRef.current;
    const canvas = zoomCanvasRef.current;
    if (!pan || !canvas) return undefined;

    const remeasure = () => {
      naturalBoxRef.current.width = 0;
      scheduleZoomFrame();
    };

    if (typeof ResizeObserver === 'undefined') {
      remeasure();
      window.addEventListener('resize', remeasure);
      return () => window.removeEventListener('resize', remeasure);
    }

    const observer = new ResizeObserver(remeasure);
    observer.observe(pan);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [scheduleZoomFrame]);

  // The frame pipeline rewrites the live zoom only when a frame happens to run,
  // so a re-render (a new event, a category toggle) must re-publish the current
  // scale rather than let the canvas fall back to its unscaled layout.
  useEffect(() => {
    scheduleZoomFrame();
  }, [scheduleZoomFrame, view]);

  /* ---------------- filtering ---------------- */

  // The role's areas come first: every filter below narrows what the role can
  // already see, so the category chips and the allocated count always agree with
  // the grid. Admin resolves to all seven areas, so it is never narrowed.
  // Local + derived entries, combined for DISPLAY only. A local event always
  // wins its own id and derived ids are namespaced, so no entry can appear twice.
  const allEvents = useMemo(
    () => mergeCalendarEvents(events, erpFeed.events),
    [events, erpFeed.events]
  );

  const roleAreas = useMemo(
    () => new Set(CALENDAR_ROLE_AREAS[role] || CALENDAR_ROLE_AREAS.ADMIN),
    [role]
  );
  const scopedEvents = useMemo(
    () => allEvents.filter((event) => roleAreas.has(categoryFor(event.category).key)),
    [allEvents, roleAreas]
  );

  // The chip row's own order (Marketing → Sales → Purchase → Production →
  // General), narrowed to what the role can see. CRM and Design have no chip,
  // so `filterKeys` below keeps their events permanently visible.
  const filterKeys = useMemo(() => new Set(CALENDAR_FILTER_CATEGORY_KEYS), []);
  const chipCategories = useMemo(
    () => CALENDAR_FILTER_CATEGORY_KEYS
      .map((key) => CATEGORY_MAP[key])
      .filter((category) => category && roleAreas.has(category.key)),
    [roleAreas]
  );

  const categorisedEvents = useMemo(
    () => scopedEvents.filter((event) => {
      const key = categoryFor(event.category).key;
      // Only categories that actually have a chip can be switched off; a key
      // without one always shows, so removing a chip never hides its events.
      return !filterKeys.has(key) || !hiddenCategories.has(key);
    }),
    [scopedEvents, hiddenCategories, filterKeys]
  );

  const allocatedToday = useMemo(() => todayAllocatedEvents(scopedEvents, now), [scopedEvents, now]);
  const allocatedIds = useMemo(() => new Set(allocatedToday.map((event) => event.id)), [allocatedToday]);
  // The category chips and the allocated filter stack: what the grid shows is
  // "today's pending events, minus the areas the user switched off".
  const visibleEvents = useMemo(
    () => (todayAllocated ? categorisedEvents.filter((event) => allocatedIds.has(event.id)) : categorisedEvents),
    [categorisedEvents, todayAllocated, allocatedIds]
  );

  const eventsByDate = useMemo(() => groupEventsByDate(visibleEvents), [visibleEvents]);
  const categoryCounts = useMemo(() => countByCategory(scopedEvents), [scopedEvents]);
  const hiddenByCategory = scopedEvents.length - categorisedEvents.length;
  const todayAllocatedShown = todayAllocated
    ? categorisedEvents.filter((event) => allocatedIds.has(event.id)).length
    : 0;
  const todayInPeriod = periodIncludesDate(view, cursor, now);

  const toggleCategory = useCallback((key) => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /* ---------------- navigation ---------------- */

  const shift = useCallback(
    (direction) => {
      setCursor((prev) => {
        if (view === 'month') return addMonths(prev, direction);
        if (view === 'week') return addDays(prev, direction * 7);
        return addDays(prev, direction);
      });
    },
    [view]
  );

  const goToToday = useCallback(() => setCursor(new Date()), []);

  /**
   * Switches the "Today Allocated" filter on/off.
   *
   * Turning it on navigates to today only when today is not already on screen,
   * and never changes the Month/Week/Day view — the user keeps the layout they
   * were working in.
   */
  const toggleTodayAllocated = useCallback(() => {
    const next = !todayAllocated;
    setTodayAllocated(next);
    if (next && !periodIncludesDate(view, cursor, new Date())) {
      setCursor(new Date());
    }
  }, [todayAllocated, view, cursor]);

  // While the filter is on, pending is re-evaluated on a slow timer: an event
  // that finishes during the session leaves the list on its own. The interval
  // exists only while the filter is active, and the clock panel ticks on its own
  // without re-rendering this component.
  useEffect(() => {
    if (!todayAllocated) return undefined;
    const timer = window.setInterval(() => setNow(new Date()), ALLOCATED_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [todayAllocated]);

  const openDay = useCallback((dateKey) => {
    const date = fromDateKey(dateKey);
    if (!date) return;
    setCursor(date);
    setView('day');
  }, []);

  /* ---------------- events ---------------- */

  const openCreate = useCallback((dateKey, hour) => {
    const { start, end } = slotTimes(hour);
    setModal({
      open: true,
      mode: 'create',
      draft: emptyDraft(dateKey || todayKey, start, end)
    });
  }, [todayKey]);

  const openEdit = useCallback((event) => {
    setModal({ open: true, mode: 'edit', draft: toDraft(event) });
  }, []);

  /**
   * One click handler for both kinds of entry: a local event opens the editable
   * form, a derived ERP entry opens the read-only detail (the page never offers
   * save/delete for a record it does not own).
   */
  const openEvent = useCallback(
    (event) => {
      if (isReadOnlyEvent(event)) {
        setReadOnlyEvent(event);
        return;
      }
      openEdit(event);
    },
    [openEdit]
  );

  const closeModal = useCallback(() => setModal((prev) => ({ ...prev, open: false })), []);

  const saveDraft = useCallback(
    (draft) => {
      const isEdit = Boolean(draft?.id);
      const existing = isEdit ? events.find((entry) => entry.id === draft.id) : null;
      const event = buildEvent(
        { ...draft, createdAt: existing?.createdAt },
        { id: draft?.id || null }
      );
      const next = upsertEvent(events, event);
      setEvents(next);
      // Every mutation writes through explicitly (there are only two: save and
      // delete), so the stored list can never drift from what is on screen.
      if (!saveEvents(next)) {
        toast.warning('Saved for this session only — browser storage is unavailable.');
      }
      toast.success(isEdit ? `“${event.title}” updated` : `“${event.title}” added to the calendar`);
      // Judge the new list against a fresh clock, so a just-saved event is never
      // classified with a stale "now".
      setNow(new Date());
      // Keep the calendar on the event's own day, so what was just saved is on
      // screen even when it was created from a different view.
      const date = fromDateKey(event.date);
      if (date) setCursor(date);
      closeModal();
    },
    [events, closeModal, toast]
  );

  const confirmDelete = useCallback(() => {
    const event = pendingDelete;
    setPendingDelete(null);
    if (!event) return;
    const next = removeEvent(events, event.id);
    setEvents(next);
    setNow(new Date());
    saveEvents(next);
    toast.success(`“${event.title}” deleted`);
    closeModal();
  }, [pendingDelete, events, closeModal, toast]);

  /* ---------------- derived header labels ---------------- */

  const period = useMemo(() => {
    if (view === 'month') return formatMonthYear(cursor.getFullYear(), cursor.getMonth());
    if (view === 'week') {
      const days = weekDays(cursor);
      const first = days[0].date;
      const last = days[days.length - 1].date;
      return `${formatDayShort(first)} – ${formatDayShort(last)}`;
    }
    return formatDayLong(cursor);
  }, [view, cursor]);

  const visibleRangeKeys = useMemo(() => {
    if (view === 'month') {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const start = startOfWeek(new Date(year, month, 1));
      return { from: toDateKey(start), to: toDateKey(addDays(start, 41)) };
    }
    if (view === 'week') {
      const days = weekDays(cursor);
      return { from: days[0].key, to: days[6].key };
    }
    const key = toDateKey(cursor);
    return { from: key, to: key };
  }, [view, cursor]);

  /* ---------------- ERP feed ---------------- */

  /**
   * Fetch the read-only ERP entries for the period currently on screen.
   *
   * One request per range: the range is the month grid's six weeks (42 days), a
   * week or a single day, well inside the backend's 92-day cap. The previous
   * request is aborted when the period changes, so a fast month sweep cannot let
   * an older response overwrite a newer one.
   *
   * A failure is handled HERE, not by the global error view: the local events
   * stay on screen, the last successfully loaded ERP entries are kept, and the
   * toolbar states plainly that the feed could not be loaded.
   */
  const { from: feedFrom, to: feedTo } = visibleRangeKeys;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const range = { from: feedFrom, to: feedTo };

    fetchCalendarEntries({ from: feedFrom, to: feedTo, signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        setErpFeed(readyErpFeed(payload, range, erpAttempt));
      })
      .catch((error) => {
        if (!active || controller.signal.aborted || error?.code === 'ERR_CANCELED') return;
        setErpFeed((previous) => failedErpFeed(
          previous,
          error?.message || 'The ERP calendar feed could not be loaded.',
          range,
          erpAttempt
        ));
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [feedFrom, feedTo, erpAttempt]);

  // Derived, not stored: a request is outstanding while the settled feed does
  // not belong to the range on screen (or a retry was requested). This is what
  // lets the effect above avoid setting state synchronously just to say
  // "loading".
  const erpLoading = isErpFeedLoading(erpFeed, { from: feedFrom, to: feedTo }, erpAttempt);

  const eventsInRange = useMemo(
    () => visibleEvents.filter(
      (event) => event.date >= visibleRangeKeys.from && event.date <= visibleRangeKeys.to
    ),
    [visibleEvents, visibleRangeKeys]
  );
  const modalDraft = useMemo(() => modal.draft || emptyDraft(todayKey), [modal.draft, todayKey]);

  return (
    <div className="cal-page">
      <header className="cal-header">
        <div className="cal-brand">
          <span className="cal-brand-mark">
            <span className="cal-brand-icon">
              <CalendarDays className="w-5 h-5" />
            </span>
            {/* Today Allocated — the count only. The label lives in the
                accessible name and title so the header stays compact, while
                the button keeps the exact toggle behaviour it had before. */}
            <button
              type="button"
              className={`cal-allocated-count${todayAllocated ? ' is-active' : ''}`}
              aria-pressed={todayAllocated}
              aria-label={`Today Allocated: ${allocatedToday.length} pending event${allocatedToday.length === 1 ? '' : 's'}`}
              title={
                todayAllocated
                  ? 'Show every event again'
                  : 'Show only the events still pending today'
              }
              onClick={toggleTodayAllocated}
            >
              {allocatedToday.length}
            </button>
          </span>
          <div>
            <h1 className="cal-title">Calendar</h1>
            <p className="cal-subtitle">Company-wide schedule across every ERP module</p>
          </div>
        </div>

        <div className="cal-nav">
          <button
            type="button"
            className="cal-icon-btn"
            aria-label="Previous"
            title={view === 'month' ? 'Previous month' : view === 'week' ? 'Previous week' : 'Previous day'}
            onClick={() => shift(-1)}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="cal-period">
            <small>{VIEWS.find((entry) => entry.key === view)?.label} view</small>
            {period}
          </div>
          <button
            type="button"
            className="cal-icon-btn"
            aria-label="Next"
            title={view === 'month' ? 'Next month' : view === 'week' ? 'Next week' : 'Next day'}
            onClick={() => shift(1)}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right-hand cluster, in the order the toolbar is meant to read:
            Today → the live clock → the view selector → Add Event. The
            Today Allocated toggle now shows as a bare count beside the
            calendar icon, so the month navigation keeps its centred column
            and this cluster never pushes it off-centre. */}
        <div className="cal-actions">
          <button type="button" className="cal-btn" onClick={goToToday}>
            Today
          </button>

          <LiveClock />

          <div className="cal-seg" role="group" aria-label="Calendar view">
            {VIEWS.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`cal-seg-btn${view === entry.key ? ' is-active' : ''}`}
                aria-pressed={view === entry.key}
                onClick={() => setView(entry.key)}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <button type="button" className="cal-btn cal-btn-primary" onClick={() => openCreate(todayKey, 9)}>
            <CalendarPlus className="w-3.5 h-3.5" /> Add Event
          </button>
        </div>
      </header>

      <div className="cal-toolbar">
        <div className="cal-toolbar-left">
          {/* Role preview, sitting with the category filters it scopes. The
              header above is untouched, so the month navigation keeps its
              centred column and none of the existing controls move. */}
          <div className="cal-role">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            <label className="cal-role-label" htmlFor="cal-role-select">Role</label>
            <select
              id="cal-role-select"
              className="cal-role-select"
              value={role}
              onChange={(event) => setRole(calendarRoleFor(event.target.value))}
              title="Preview the calendar for a role. Frontend only — it never changes what the server allows."
            >
              {CALENDAR_ROLES.map((entry) => (
                <option key={entry.key} value={entry.key}>{entry.label}</option>
              ))}
            </select>
          </div>
          <div className="cal-chips">
            {chipCategories.map((category) => {
              const off = hiddenCategories.has(category.key);
              const count = categoryCounts[category.key] || 0;
              return (
                <button
                  key={category.key}
                  type="button"
                  className={`cal-chip${off ? ' is-off' : ''}`}
                  style={{ '--cal-accent': category.color }}
                  aria-pressed={!off}
                  title={off ? `Show ${category.label}` : `Hide ${category.label}`}
                  onClick={() => toggleCategory(category.key)}
                >
                  <span className="cal-chip-dot" />
                  {category.short}
                  {count > 0 && <span className="cal-chip-count">{count}</span>}
                </button>
              );
            })}
          </div>
        </div>
        {/* Honest feed state: exactly what the backend returned for this
            period, or exactly why it could not be read. */}
        <span className="cal-note cal-note-erp" role="status">
          {erpLoading && (
            <>
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading ERP entries for this {view}…
            </>
          )}
          {!erpLoading && erpFeed.status === ERP_STATE_READY && (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              {erpFeed.events.length === 0
                ? `No ERP entries in this ${view}`
                : `${erpFeed.events.length} read-only ERP entr${erpFeed.events.length === 1 ? 'y' : 'ies'} from ${describeSources(erpFeed.sources)}`}
              {' · '}local events stay in this browser.
            </>
          )}
          {!erpLoading && erpFeed.status === ERP_STATE_ERROR && (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              ERP entries unavailable
              {erpFeed.events.length > 0 ? ' — showing the last loaded set' : ''}.
              <button
                type="button"
                className="cal-day-more"
                onClick={() => setErpAttempt((attempt) => attempt + 1)}
              >
                Retry
              </button>
            </>
          )}
          {erpFeed.status === 'idle' && (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              Local events are stored in this browser; ERP entries are read-only.
            </>
          )}
        </span>
      </div>

      {/* A feed failure is reported in place. The local calendar keeps working
          and the last successfully loaded ERP entries are still on screen —
          nothing here pretends the request succeeded. */}
      {!erpLoading && erpFeed.status === ERP_STATE_ERROR && (
        <div className="cal-note cal-note-error" style={{ paddingLeft: 4 }} role="alert">
          <AlertTriangle className="w-3.5 h-3.5" />
          {erpFeed.error}
          {erpFeed.events.length > 0 && (
            <span className="cal-note-dim">
              Showing the ERP entries from the last successful load.
            </span>
          )}
          <button
            type="button"
            className="cal-day-more"
            onClick={() => setErpAttempt((attempt) => attempt + 1)}
          >
            Try again
          </button>
        </div>
      )}

      {/* Partial data is stated as partial: the modules that answered are still
          shown, and the ones that failed are named. */}
      {!erpLoading && erpFeed.unavailableSources.length > 0 && erpFeed.status !== ERP_STATE_ERROR && (
        <div className="cal-note cal-note-error" style={{ paddingLeft: 4 }} role="status">
          <AlertTriangle className="w-3.5 h-3.5" />
          {describeSources(erpFeed.unavailableSources)} entries could not be loaded for this {view}.
          The other modules are shown.
          <button
            type="button"
            className="cal-day-more"
            onClick={() => setErpAttempt((attempt) => attempt + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {/* Honest scope feedback: the preview states exactly what the selected
          role can see, and that it is a local preview rather than backend
          authorization. Admin is the role guaranteed the whole calendar. */}
      {role !== 'ADMIN' && (
        <div className="cal-note" style={{ paddingLeft: 4 }} role="status">
          <ShieldCheck className="w-3.5 h-3.5" />
          Viewing as {CALENDAR_ROLES.find((entry) => entry.key === role)?.label || role} —{' '}
          {roleAreas.size} of {ERP_CATEGORIES.length} areas. Preview only: it does not change what the
          server allows, and Admin always sees the full calendar.
        </div>
      )}

      {hiddenByCategory > 0 && (
        <div className="cal-note" style={{ paddingLeft: 4 }}>
          <EyeOff className="w-3.5 h-3.5" />
          {hiddenByCategory} event{hiddenByCategory === 1 ? '' : 's'} hidden by the category filter.
          <button type="button" className="cal-day-more" onClick={() => setHiddenCategories(new Set())}>
            Show all
          </button>
        </div>
      )}

      {/* Live feedback for the allocated filter: how many of today's events are
          still pending, an honest empty message when none are, and a way back to
          today if the user has navigated away while it stayed on. */}
      {todayAllocated && (
        <div className="cal-note cal-note-allocated" role="status">
          <CalendarCheck className="w-3.5 h-3.5" />
          Today Allocated — showing {todayAllocatedShown} pending event
          {todayAllocatedShown === 1 ? '' : 's'} for {formatDayLong(new Date())}.
          {todayAllocatedShown === 0 && (
            <span className="cal-note-dim">
              Nothing is outstanding: today&apos;s events are all complete.
            </span>
          )}
          {!todayInPeriod && (
            <button type="button" className="cal-day-more" onClick={goToToday}>
              Go to today
            </button>
          )}
          <button type="button" className="cal-day-more" onClick={toggleTodayAllocated}>
            Show all events
          </button>
        </div>
      )}

      {eventsInRange.length === 0 && allEvents.length > 0 && hiddenByCategory === 0 && !todayAllocated && (
        <div className="cal-nav" style={{ paddingLeft: 4 }}>
          <span className="cal-note">No events in this {view}. </span>
          <button
            type="button"
            className="cal-btn"
            onClick={() => openCreate(view === 'day' ? toDateKey(cursor) : todayKey, 9)}
          >
            <CalendarPlus className="w-3.5 h-3.5" /> Add one
          </button>
        </div>
      )}

      {/* The zoom area. The wheel listener above is bound to the canvas, so
          Calendar-only zoom can never affect the ERP shell or another page. The
          spacer reserves the scaled layout box (the transform itself is applied
          by the compositor), which is what keeps a zoomed calendar from widening
          the page: the overflow is panned inside this element instead. */}
      <main className="cal-zoom-pan" ref={zoomPanRef}>
        <div className="cal-zoom-spacer" ref={zoomSpacerRef}>
          <div
            className="cal-zoom-canvas"
            ref={zoomCanvasRef}
            data-cal-zoom={zoom}
            aria-label={`Calendar grid. Use the mouse wheel over this area to zoom the calendar between ${Math.round(
              MIN_ZOOM * 100
            )}% and ${Math.round(MAX_ZOOM * 100)}%.`}
          >
            {view === 'month' && (
              <div className="cal-surface cal-scroll">
                <MonthView
                  year={cursor.getFullYear()}
                  month={cursor.getMonth()}
                  eventsByDate={eventsByDate}
                  todayKey={todayKey}
                  onEventClick={openEvent}
                  onSelectDay={openDay}
                  onAddOnDay={(dateKey) => openCreate(dateKey, 9)}
                  showErpLock={role !== 'ADMIN'}
                />
              </div>
            )}

            {view === 'week' && (
              <div className="cal-surface">
                <WeekView
                  cursor={cursor}
                  events={visibleEvents}
                  todayKey={todayKey}
                  onEventClick={openEvent}
                  onSlotClick={openCreate}
                  showErpLock={role !== 'ADMIN'}
                />
              </div>
            )}

            {view === 'day' && (
              <DayView
                cursor={cursor}
                events={visibleEvents}
                onEventClick={openEvent}
                onAddEvent={(dateKey) => openCreate(dateKey || toDateKey(cursor), 9)}
                onSlotClick={openCreate}
                showErpLock={role !== 'ADMIN'}
              />
            )}
            {allEvents.length === 0 && !erpLoading && (
              <div className="cal-surface" style={{ marginTop: 14 }}>
                <div className="cal-empty">
                  <span className="cal-empty-icon">
                    <CalendarDays className="w-5 h-5" />
                  </span>
                  <span className="cal-empty-title">Your calendar is empty</span>
                  <span className="cal-empty-text">
                    Book a site visit, a dispatch slot, a verification review or a payment reminder — each
                    event is colour-coded by the ERP area it belongs to. Add your own events here; ERP
                    entries from Marketing and CRM appear automatically and are read-only.
                  </span>
                  <button
                    type="button"
                    className="cal-btn cal-btn-primary"
                    onClick={() => openCreate(todayKey, 9)}
                  >
                    <CalendarPlus className="w-3.5 h-3.5" /> Add your first event
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mounted per event (the `key`), so each open starts from that event's own
          values and closing discards any half-finished edit. */}
      {modal.open && (
        <EventModal
          key={modalDraft.id || `new-${modalDraft.date}-${modalDraft.start}`}
          open
          mode={modal.mode}
          draft={modalDraft}
          onClose={closeModal}
          onSave={saveDraft}
          onDelete={(id) => setPendingDelete(events.find((entry) => entry.id === id) || null)}
        />
      )}

      {/* Read-only detail for a backend-derived entry. Mounted only while one is
          open, and it can navigate to the source record but never write. */}
      {readOnlyEvent && (
        <ErpEntryModal
          open
          event={readOnlyEvent}
          onClose={() => setReadOnlyEvent(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this event?"
        message={pendingDelete ? `“${pendingDelete.title}” will be removed from the calendar.` : ''}
        confirmLabel="Delete event"
        icon={AlertTriangle}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
