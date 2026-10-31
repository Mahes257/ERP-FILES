/**
 * pages/calendar/calendarUtils.js
 * ------------------------------------------------------------------
 * The date, grid and time-layout arithmetic behind the standalone Calendar
 * module. Deliberately PURE and React-free so the awkward parts — month grids,
 * Monday-first weeks, minute math and overlapping-event lanes — are one
 * implementation that can be tested directly instead of being re-derived inside
 * each view component.
 *
 * Conventions (kept identical to the rest of the ERP):
 *   · Weeks start on MONDAY, the way the Marketing calendar and the ERP date
 *     pickers already read.
 *   · Dates are handled as LOCAL calendar days. `toDateKey(year, month, day)`
 *     and `fromDateKey(key)` never round-trip through UTC, so a calendar day
 *     can never shift by one for users in another timezone (the classic
 *     `new Date('2026-10-16')` bug).
 *   · Times are "HH:MM" 24-hour strings; minutes-of-day is the only number the
 *     layout ever compares.
 */

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Monday-first weekday labels, matching the ERP week convention. */
export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_LONG = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

/** The grid always shows six weeks: navigating months never changes its height. */
export const MONTH_GRID_WEEKS = 6;

/** Default visible hours for the week/day time grid. */
export const DEFAULT_DAY_START_HOUR = 7;
export const DEFAULT_DAY_END_HOUR = 21;

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad2 = (value) => String(value).padStart(2, '0');

/* ------------------------------------------------------------------ *
 * Calendar days
 * ------------------------------------------------------------------ */

/** "YYYY-MM-DD" for a local Date (never the UTC-shifted ISO string). */
export function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** Local Date at midnight for a "YYYY-MM-DD" key, or null when malformed. */
export function fromDateKey(key) {
  const match = DATE_KEY_RE.exec(String(key || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  // Rejects impossible days such as 2026-02-30, which Date would roll over.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function isValidDateKey(key) {
  return fromDateKey(key) !== null;
}

export function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

export function addDays(date, amount) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
}

/**
 * Shifts by whole months, keeping the day of month where the target month has
 * it (31 Jan + 1 month → 28/29 Feb) so navigating never lands on a rolled-over
 * day in the following month.
 */
export function addMonths(date, amount) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = daysInMonth(target.getFullYear(), target.getMonth());
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

/** Monday of the week containing `date`. */
export function startOfWeek(date) {
  const mondayIndex = (date.getDay() + 6) % 7;
  return addDays(date, -mondayIndex);
}

export function isSameDay(a, b) {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date) {
  return isSameDay(date, new Date());
}

/**
 * The six Monday-first weeks that make up a month view.
 *
 * Every cell carries its own Date plus the month it belongs to, so the view can
 * dim the leading/trailing days of the neighbouring months without recomputing
 * anything.
 */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const gridStart = startOfWeek(first);
  const cells = [];
  for (let index = 0; index < MONTH_GRID_WEEKS * 7; index += 1) {
    const date = addDays(gridStart, index);
    cells.push({
      date,
      key: toDateKey(date),
      inMonth: date.getMonth() === month && date.getFullYear() === year
    });
  }
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

/** The seven days of the week containing `date`, Monday first. */
export function weekDays(date) {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(start, index);
    return { date: day, key: toDateKey(day) };
  });
}

/* ------------------------------------------------------------------ *
 * Times
 * ------------------------------------------------------------------ */

/** "HH:MM" → minutes from midnight, or null when the value is not a time. */
export function minutesOfTime(value) {
  const match = TIME_RE.exec(String(value || '').trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTime(value) {
  return minutesOfTime(value) !== null;
}

/** Minutes from midnight → "9:30 AM". */
export function formatClock(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${pad2(minute)} ${suffix}`;
}

/** "HH:MM" → "9:30 AM" (empty string when the value is not a time). */
export function formatTimeLabel(value) {
  const minutes = minutesOfTime(value);
  return minutes === null ? '' : formatClock(minutes);
}

/** "9:30 AM – 11:00 AM" for an event's own start/end pair. */
export function formatTimeRange(start, end) {
  const from = formatTimeLabel(start);
  const to = formatTimeLabel(end);
  if (!from && !to) return '';
  return `${from || '—'} – ${to || '—'}`;
}

/** The hour rail label, e.g. 13 → "1 PM". */
export function formatHourLabel(hour) {
  const hour24 = ((hour % 24) + 24) % 24;
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12} ${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Display labels
 * ------------------------------------------------------------------ */

export function formatMonthYear(year, month) {
  return `${MONTH_NAMES[((month % 12) + 12) % 12]} ${year}`;
}

export function formatDayLong(date) {
  if (!(date instanceof Date)) return '';
  const weekday = WEEKDAY_LONG[(date.getDay() + 6) % 7];
  return `${weekday}, ${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** "16 Oct 2026" — the compact form used inside event cards. */
export function formatDayShort(date) {
  if (!(date instanceof Date)) return '';
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`;
}

/* ------------------------------------------------------------------ *
 * Wheel zoom
 * ------------------------------------------------------------------ */

/** Zoom limits and the size of one wheel step. */
export const MIN_ZOOM = 0.6;
export const MAX_ZOOM = 1.8;
export const ZOOM_STEP = 0.1;

/**
 * Wheel distance (in pixels) that produces one zoom step.
 *
 * Chrome reports ~100px per wheel detent, while a trackpad reports many small
 * deltas; accumulating until this threshold means one notch = one 10% step, and
 * a trackpad sweep does not flood the state with dozens of updates.
 */
export const ZOOM_WHEEL_STEP_PX = 100;

/** Keeps a zoom level inside the supported range (and a clean 2-decimal value). */
export function clampZoom(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100));
}

/**
 * One wheel event → the next zoom level plus the wheel distance left unspent.
 *
 * Wheel UP (`deltaY < 0`, i.e. away from the user) zooms IN, matching the
 * convention of every calendar and map. The unspent remainder is returned so
 * the caller can carry it into the next event — a slow trackpad gesture still
 * reaches the threshold — while a gesture that is already pinned at a limit
 * reports `0`, so scrolling hard against the limit does not bank movement that
 * would jump later.
 */
export function zoomFromWheelDelta(currentZoom, accumulatedPx, deltaY) {
  const current = clampZoom(currentZoom);
  const total = (Number.isFinite(accumulatedPx) ? accumulatedPx : 0) + (Number.isFinite(deltaY) ? deltaY : 0);
  const steps = Math.trunc(total / ZOOM_WHEEL_STEP_PX);

  if (steps === 0) {
    return { zoom: current, unspent: total };
  }

  const next = clampZoom(current - steps * ZOOM_STEP);
  return { zoom: next, unspent: next === current ? 0 : total - steps * ZOOM_WHEEL_STEP_PX };
}

/**
 * The box and transform that put a natural (100%) calendar box on screen at a
 * zoom level.
 *
 * The calendar is scaled with a `transform`, not with the CSS `zoom` property:
 * `zoom` re-runs STYLE and LAYOUT for the whole grid on every step, while a
 * transform is applied by the compositor, so a wheel burst only ever writes the
 * transform and the page never reflows. The layout box has to be reserved by
 * hand in exchange, which is what the spacer in `CalendarPage` uses: `width`
 * and `height` are the scaled box, rounded UP so a fractional scale can never
 * leave a sub-pixel overhang (which would make a scrollbar appear), and one extra
 * pixel of slack past the scaled height keeps the transformed canvas from ever
 * exceeding the spacer and triggering a phantom vertical scrollbar.
 */
export function zoomFrameBox(naturalWidth, naturalHeight, zoom) {
  const scale = clampZoom(zoom);
  const width = Number.isFinite(naturalWidth) ? Math.max(0, naturalWidth) : 0;
  const height = Number.isFinite(naturalHeight) ? Math.max(0, naturalHeight) : 0;
  return {
    scale,
    width: Math.ceil(width * scale),
    height: Math.ceil(height * scale) + 1,
    transform: `scale(${scale})`
  };
}

/* ------------------------------------------------------------------ *
 * Event layout
 * ------------------------------------------------------------------ */

/**
 * Visible hour window for the time grid.
 *
 * Defaults are the working day; the window widens only as far as the events of
 * the displayed range actually require, so an early or late booking is never
 * clipped out of the grid. Always at least one hour tall.
 */
export function hourGridRange(events = [], {
  startHour = DEFAULT_DAY_START_HOUR,
  endHour = DEFAULT_DAY_END_HOUR
} = {}) {
  let from = startHour;
  let to = endHour;
  events.forEach((event) => {
    const start = minutesOfTime(event?.start);
    const end = minutesOfTime(event?.end);
    if (start !== null) from = Math.min(from, Math.floor(start / 60));
    if (end !== null) to = Math.max(to, Math.ceil(end / 60));
  });
  from = Math.max(0, from);
  to = Math.min(24, Math.max(from + 1, to));
  return { startHour: from, endHour: to };
}

/**
 * Positions one day's events inside the time grid and resolves overlaps.
 *
 * Returns, for each event: its percentage `top`/`height` inside the visible
 * window and a `lane`/`lanes` pair, so two bookings at the same hour are drawn
 * side by side instead of on top of each other. Events that run past the window
 * are clamped to it rather than dropped.
 */
export function layoutDayEvents(events = [], { startHour = DEFAULT_DAY_START_HOUR, endHour = DEFAULT_DAY_END_HOUR } = {}) {
  const gridStart = startHour * 60;
  const gridEnd = Math.max(endHour * 60, gridStart + 60);
  const span = gridEnd - gridStart;

  const prepared = events
    .map((event) => {
      const rawStart = minutesOfTime(event?.start);
      const rawEnd = minutesOfTime(event?.end);
      if (rawStart === null) return null;
      const start = Math.min(Math.max(rawStart, gridStart), gridEnd - 15);
      const end = Math.min(Math.max(rawEnd === null ? start + 30 : rawEnd, start + 15), gridEnd);
      return { event, start, end };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || b.end - a.end);

  const laidOut = [];
  let cluster = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // Greedy lane assignment: every event takes the first lane whose last event
    // has already finished by the time this one starts.
    const laneEnds = [];
    cluster.forEach((item) => {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        laneEnds.push(item.end);
        lane = laneEnds.length - 1;
      } else {
        laneEnds[lane] = item.end;
      }
      item.lane = lane;
    });
    const lanes = Math.max(1, laneEnds.length);
    cluster.forEach((item) => {
      laidOut.push({
        event: item.event,
        lane: item.lane,
        lanes,
        top: ((item.start - gridStart) / span) * 100,
        height: Math.max(((item.end - item.start) / span) * 100, 3.2)
      });
    });
    cluster = [];
    clusterEnd = -1;
  };

  prepared.forEach((item) => {
    if (cluster.length > 0 && item.start >= clusterEnd) flush();
    cluster.push(item);
    clusterEnd = Math.max(clusterEnd, item.end);
  });
  flush();

  return laidOut;
}

/* ------------------------------------------------------------------ *
 * Ordering and grouping
 * ------------------------------------------------------------------ */

/** Chronological order: date, then start time, then title. */
export function sortEvents(events = []) {
  return [...events].sort(
    (a, b) =>
      String(a?.date || '').localeCompare(String(b?.date || '')) ||
      (minutesOfTime(a?.start) ?? 0) - (minutesOfTime(b?.start) ?? 0) ||
      String(a?.title || '').localeCompare(String(b?.title || ''))
  );
}

/** date key → that day's events, already in chronological order. */
export function groupEventsByDate(events = []) {
  const grouped = new Map();
  sortEvents(events).forEach((event) => {
    const key = event?.date;
    if (!key) return;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(event);
  });
  return grouped;
}

/** Events falling inside the [from, to] day range, inclusive. */
export function eventsBetween(events = [], fromKey, toKey) {
  return sortEvents(events).filter((event) => event?.date >= fromKey && event?.date <= toKey);
}

/* ------------------------------------------------------------------ *
 * Today Allocated — which events still need attention today
 * ------------------------------------------------------------------
 * IMPORTANT: the calendar's event record has NO status field. It carries
 * `date` + `start` + `end` and nothing else about progress (see
 * `calendarEvents.js`), and this phase must not invent server state, add
 * columns, or mutate records. So "pending" is derived from the only truth the
 * data actually holds — the event's own time window against the real clock:
 *
 *   · pending   the window has not finished yet (in progress counts)
 *   · completed the end time has already passed
 *   · cancelled the model has no such state, so nothing can be excluded for it
 *
 * An event whose times are missing/unreadable is treated as PENDING: a filter
 * meant to surface outstanding work must not silently hide a booking it cannot
 * prove is finished. When a real status field arrives, only these helpers need
 * to change — the page asks them, and never the other way round.
 * ------------------------------------------------------------------ */

/**
 * True while an event's window is still open at `now`.
 *
 * `now` is injected so the rule is testable and so callers can hold one clock
 * reading for a whole render instead of comparing against several.
 */
export function isEventPending(event, now = new Date()) {
  const end = minutesOfTime(event?.end);
  if (end === null) return true;
  const reference = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const minutesNow = reference.getHours() * 60 + reference.getMinutes() + reference.getSeconds() / 60;
  return end > minutesNow;
}

/** The mirror of `isEventPending`, for readability at the call sites. */
export function isEventCompleted(event, now = new Date()) {
  return !isEventPending(event, now);
}

/**
 * Today's pending events, chronological — exactly what "Today Allocated"
 * shows. Completed events of today and every other day are left out, and only
 * the ids of the returned events are ever read back by the page, so no record
 * is copied or mutated by filtering.
 */
export function todayAllocatedEvents(events = [], now = new Date()) {
  const reference = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
  const todayKey = toDateKey(reference);
  return sortEvents(events).filter(
    (event) => event?.date === todayKey && isEventPending(event, reference)
  );
}

/**
 * Is `date` inside the period currently on screen?
 *
 * Used when the filter is switched on: the calendar jumps to today only when
 * the displayed month/week/day does not already contain it, so enabling the
 * filter never moves the user away from what they were looking at needlessly.
 */
export function periodIncludesDate(view, cursor, date) {
  if (!(cursor instanceof Date) || Number.isNaN(cursor.getTime())) return false;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
  if (view === 'day') return isSameDay(cursor, date);
  if (view === 'week') {
    const start = startOfWeek(cursor);
    return isSameDay(date, start) || (date > start && date < addDays(start, 7));
  }
  return cursor.getFullYear() === date.getFullYear() && cursor.getMonth() === date.getMonth();
}

/* ------------------------------------------------------------------ *
 * Live clock
 * ------------------------------------------------------------------ */

const pad2Clock = (value) => String(value).padStart(2, '0');

/**
 * "03:39:08 PM" — the toolbar clock's own 12-hour form, seconds included.
 *
 * Built from the Date's LOCAL getters (never `toISOString`), so the clock shows
 * the browser's timezone exactly as the taskbar does.
 */
export function formatClockTime(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const hour24 = date.getHours();
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${pad2Clock(hour12)}:${pad2Clock(date.getMinutes())}:${pad2Clock(date.getSeconds())} ${suffix}`;
}

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

export const TITLE_MAX_LENGTH = 120;
export const DESCRIPTION_MAX_LENGTH = 500;

/**
 * Validates a draft event exactly as the Add/Edit Event form needs it.
 *
 * Returns `{ valid, errors }` where `errors` is keyed by field, so the form can
 * put each message under the input that caused it instead of one generic
 * failure banner. Empty/whitespace-only values are treated as missing, and the
 * times are compared as minutes, so "09:00 → 09:00" is rejected too.
 */
export function validateEvent(draft = {}) {
  const errors = {};

  const title = String(draft.title ?? '').trim();
  if (!title) errors.title = 'Event title is required.';
  else if (title.length > TITLE_MAX_LENGTH) errors.title = `Keep the title under ${TITLE_MAX_LENGTH} characters.`;

  const dateKey = String(draft.date ?? '').trim();
  if (!dateKey) errors.date = 'Pick an event date.';
  else if (!isValidDateKey(dateKey)) errors.date = 'Enter a valid date (YYYY-MM-DD).';

  const start = String(draft.start ?? '').trim();
  const end = String(draft.end ?? '').trim();
  const startMinutes = minutesOfTime(start);
  const endMinutes = minutesOfTime(end);

  if (!start) errors.start = 'Start time is required.';
  else if (startMinutes === null) errors.start = 'Enter a valid start time (HH:MM).';

  if (!end) errors.end = 'End time is required.';
  else if (endMinutes === null) errors.end = 'Enter a valid end time (HH:MM).';

  if (startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) {
    errors.end = 'End time must be after the start time.';
  }

  const description = String(draft.description ?? '');
  if (description.length > DESCRIPTION_MAX_LENGTH) {
    errors.description = `Keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`;
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
