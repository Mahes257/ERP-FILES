import { beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  ZOOM_WHEEL_STEP_PX,
  addDays,
  addMonths,
  clampZoom,
  formatClockTime,
  formatHourLabel,
  formatTimeRange,
  fromDateKey,
  hourGridRange,
  isEventCompleted,
  isEventPending,
  isSameDay,
  isValidDateKey,
  layoutDayEvents,
  minutesOfTime,
  monthGrid,
  periodIncludesDate,
  startOfWeek,
  toDateKey,
  todayAllocatedEvents,
  validateEvent,
  weekDays,
  zoomFrameBox,
  zoomFromWheelDelta
} from './calendarUtils';
import {
  CALENDAR_FILTER_CATEGORY_KEYS,
  CALENDAR_ROLES,
  CALENDAR_ROLE_AREAS,
  CATEGORY_MAP,
  DEFAULT_CALENDAR_ROLE,
  ERP_CATEGORIES,
  buildEvent,
  calendarRoleFor,
  categoriesForRole,
  categoryFor,
  countByCategory,
  emptyDraft,
  listEvents,
  removeEvent,
  saveEvents,
  toDraft,
  upsertEvent
} from './calendarEvents';

/**
 * The Calendar module's arithmetic is where a calendar normally breaks: a
 * month grid that starts on the wrong weekday, a day that shifts by one across
 * timezones, overlapping bookings drawn on top of each other, or an event that
 * is saved with an end time before its start. These tests cover exactly those
 * pure functions — the same ones the views call — plus the local event store.
 *
 * (A separate file is warranted because nothing in the existing suites covers
 * calendar date math or the calendar store: `tests/` holds node-runner suites
 * for other modules and `src/**` unit suites are colocated with their subject.)
 */

describe('calendar date keys', () => {
  it('formats a local date without the UTC shift that new Date("YYYY-MM-DD") causes', () => {
    // 1 Jan 2026, 00:30 local — an ISO string would report 2025-12-31 for any
    // timezone behind UTC.
    expect(toDateKey(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
  });

  it('parses a key back to the same local day', () => {
    const date = fromDateKey('2026-10-16');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(16);
    expect(toDateKey(date)).toBe('2026-10-16');
  });

  it('rejects malformed and impossible dates', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('16-10-2026')).toBe(false);
    expect(isValidDateKey('')).toBe(false);
    expect(fromDateKey('nonsense')).toBeNull();
    expect(isValidDateKey('2024-02-29')).toBe(true);
  });
});

describe('calendar navigation math', () => {
  it('starts weeks on Monday', () => {
    // 16 Oct 2026 is a Friday.
    expect(toDateKey(startOfWeek(fromDateKey('2026-10-16')))).toBe('2026-10-12');
    // A Sunday belongs to the week that began six days earlier.
    expect(toDateKey(startOfWeek(fromDateKey('2026-10-18')))).toBe('2026-10-12');
  });

  it('returns seven days for a week', () => {
    const days = weekDays(fromDateKey('2026-10-16'));
    expect(days).toHaveLength(7);
    expect(days[0].key).toBe('2026-10-12');
    expect(days[6].key).toBe('2026-10-18');
  });

  it('clamps the day of month when shifting into a shorter month', () => {
    expect(toDateKey(addMonths(fromDateKey('2026-01-31'), 1))).toBe('2026-02-28');
    expect(toDateKey(addMonths(fromDateKey('2026-03-31'), -1))).toBe('2026-02-28');
  });

  it('crosses month and year boundaries when adding days', () => {
    expect(toDateKey(addDays(fromDateKey('2026-12-31'), 1))).toBe('2027-01-01');
    expect(toDateKey(addDays(fromDateKey('2026-11-01'), -1))).toBe('2026-10-31');
  });
});

describe('month grid', () => {
  const weeks = monthGrid(2026, 9); // October 2026

  it('is always six Monday-first weeks, so the layout never changes height', () => {
    expect(weeks).toHaveLength(6);
    weeks.forEach((week) => expect(week).toHaveLength(7));
    expect(weeks[0][0].key).toBe('2026-09-28');
    expect(weeks[5][6].key).toBe('2026-11-08');
  });

  it('marks only the requested month as in-month', () => {
    const inMonth = weeks.flat().filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(31);
    expect(inMonth[0].key).toBe('2026-10-01');
    expect(inMonth[inMonth.length - 1].key).toBe('2026-10-31');
    expect(weeks[0][0].inMonth).toBe(false);
  });

  it('keeps every cell a real consecutive day', () => {
    const flat = weeks.flat();
    for (let i = 1; i < flat.length; i += 1) {
      expect(isSameDay(addDays(flat[i - 1].date, 1), flat[i].date)).toBe(true);
    }
  });
});

describe('time helpers', () => {
  it('reads and rejects times', () => {
    expect(minutesOfTime('09:30')).toBe(570);
    expect(minutesOfTime('00:00')).toBe(0);
    expect(minutesOfTime('24:00')).toBeNull();
    expect(minutesOfTime('9:30')).toBeNull();
    expect(minutesOfTime('')).toBeNull();
  });

  it('formats clock and hour labels', () => {
    expect(formatHourLabel(0)).toBe('12 AM');
    expect(formatHourLabel(13)).toBe('1 PM');
    expect(formatHourLabel(23)).toBe('11 PM');
    expect(formatTimeRange('09:30', '11:00')).toBe('9:30 AM – 11:00 AM');
  });
});

describe('time grid range and layout', () => {
  it('keeps the working-day default when events fit inside it', () => {
    const range = hourGridRange([{ start: '09:00', end: '10:00' }]);
    expect(range).toEqual({ startHour: 7, endHour: 21 });
  });

  it('widens only as far as the events require', () => {
    const range = hourGridRange([
      { start: '05:30', end: '06:00' },
      { start: '22:15', end: '23:30' }
    ]);
    expect(range).toEqual({ startHour: 5, endHour: 24 });
  });

  it('positions a single event as a share of the visible window', () => {
    const [block] = layoutDayEvents([{ id: 'a', start: '09:00', end: '10:00' }], {
      startHour: 9,
      endHour: 11
    });
    expect(block.top).toBeCloseTo(0, 5);
    expect(block.height).toBeCloseTo(50, 5);
    expect(block.lanes).toBe(1);
  });

  it('places overlapping events side by side instead of on top of each other', () => {
    const blocks = layoutDayEvents(
      [
        { id: 'a', start: '09:00', end: '10:00' },
        { id: 'b', start: '09:30', end: '10:30' },
        { id: 'c', start: '12:00', end: '12:30' }
      ],
      { startHour: 9, endHour: 13 }
    );
    const byId = Object.fromEntries(blocks.map((block) => [block.event.id, block]));
    expect(byId.a.lanes).toBe(2);
    expect(byId.b.lanes).toBe(2);
    expect(byId.a.lane).not.toBe(byId.b.lane);
    // A later, non-overlapping booking is its own cluster again.
    expect(byId.c.lanes).toBe(1);
  });

  it('clamps an event that runs past the window instead of dropping it', () => {
    const blocks = layoutDayEvents([{ id: 'a', start: '20:00', end: '23:00' }], {
      startHour: 9,
      endHour: 21
    });
    expect(blocks).toHaveLength(1);
    expect(blocks[0].top).toBeLessThanOrEqual(100);
    expect(blocks[0].top + blocks[0].height).toBeLessThanOrEqual(100.0001);
  });

  it('ignores events without a usable start time', () => {
    expect(layoutDayEvents([{ id: 'bad', start: '', end: '' }])).toEqual([]);
  });
});

describe('calendar-only wheel zoom', () => {
  it('keeps the zoom level inside the supported range', () => {
    expect(clampZoom(5)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(1.234)).toBe(1.23);
    expect(clampZoom(NaN)).toBe(1);
  });

  it('zooms IN when the wheel moves up and OUT when it moves down, one notch per step', () => {
    expect(zoomFromWheelDelta(1, 0, -ZOOM_WHEEL_STEP_PX).zoom).toBeCloseTo(1 + ZOOM_STEP, 5);
    expect(zoomFromWheelDelta(1, 0, ZOOM_WHEEL_STEP_PX).zoom).toBeCloseTo(1 - ZOOM_STEP, 5);
    // Two notches in a single (fast) gesture = two steps.
    expect(zoomFromWheelDelta(1, 0, -2 * ZOOM_WHEEL_STEP_PX).zoom).toBeCloseTo(1 + 2 * ZOOM_STEP, 5);
  });

  it('accumulates small deltas (a trackpad sweep) into one step', () => {
    const first = zoomFromWheelDelta(1, 0, -30);
    expect(first.zoom).toBe(1);
    expect(first.unspent).toBe(-30);

    const second = zoomFromWheelDelta(1, first.unspent, -30);
    expect(second.zoom).toBe(1);
    expect(second.unspent).toBe(-60);

    const third = zoomFromWheelDelta(1, second.unspent, -50);
    expect(third.zoom).toBeCloseTo(1 + ZOOM_STEP, 5);
    expect(third.unspent).toBe(-10);
  });

  it('never moves past the limits and does not bank movement while pinned', () => {
    const atMax = zoomFromWheelDelta(MAX_ZOOM, 0, -500);
    expect(atMax.zoom).toBe(MAX_ZOOM);
    expect(atMax.unspent).toBe(0);

    const atMin = zoomFromWheelDelta(MIN_ZOOM, 0, 500);
    expect(atMin.zoom).toBe(MIN_ZOOM);
    expect(atMin.unspent).toBe(0);
  });

  it('is inert for a zero delta', () => {
    expect(zoomFromWheelDelta(1.3, 0, 0)).toEqual({ zoom: 1.3, unspent: 0 });
  });

  it('reserves the scaled layout box the transform cannot provide', () => {
    const box = zoomFrameBox(1200, 800, 1.5);
    expect(box.scale).toBe(1.5);
    expect(box.transform).toBe('scale(1.5)');
    expect(box.width).toBe(1800);
    // One pixel of slack past the scaled height: a sub-pixel overhang of the
    // transformed canvas would otherwise trigger a phantom scrollbar.
    expect(box.height).toBe(1201);
    expect(box.height).toBeGreaterThan(800 * 1.5);
  });

  it('never lets a fractional scale leave a sub-pixel overhang', () => {
    const box = zoomFrameBox(1229, 735, 0.7);
    expect(box.width).toBe(Math.ceil(1229 * 0.7));
    expect(box.width).toBeGreaterThanOrEqual(1229 * 0.7);
    expect(box.height).toBeGreaterThan(735 * 0.7);
  });

  it('clamps the frame box to the supported zoom range and survives junk input', () => {
    expect(zoomFrameBox(1000, 500, 99).scale).toBe(MAX_ZOOM);
    expect(zoomFrameBox(1000, 500, 0).scale).toBe(MIN_ZOOM);
    expect(zoomFrameBox(undefined, undefined, 1)).toMatchObject({ width: 0, height: 1 });
  });
});

/**
 * "Today Allocated".
 *
 * The store has no status column, so pending/completed is derived from the
 * event's own window against an injected clock. These tests pin that rule down
 * (and its two edge cases: an in-progress event and an event whose end time is
 * unreadable) so the filter cannot quietly start hiding real work.
 */
describe('task/event status derived from the event window', () => {
  const at = (hour, minute = 0) => new Date(2026, 9, 16, hour, minute, 0);
  const event = (overrides = {}) => ({
    id: 'e1',
    title: 'Probe',
    date: '2026-10-16',
    start: '09:00',
    end: '10:30',
    category: 'general',
    ...overrides
  });

  it('counts an event as pending until its end time has passed', () => {
    expect(isEventPending(event(), at(8))).toBe(true);
    expect(isEventPending(event(), at(9, 15))).toBe(true);
    expect(isEventPending(event(), at(10, 29))).toBe(true);
    expect(isEventPending(event(), at(10, 31))).toBe(false);
    expect(isEventCompleted(event(), at(10, 31))).toBe(true);
    expect(isEventCompleted(event(), at(8))).toBe(false);
  });

  it('treats an unreadable end time as pending rather than silently hiding it', () => {
    expect(isEventPending(event({ end: '' }), at(23))).toBe(true);
    expect(isEventPending(event({ end: 'later' }), at(23))).toBe(true);
  });

  it('returns today’s pending events only, in chronological order', () => {
    const events = [
      event({ id: 'done', start: '07:00', end: '08:00' }),
      event({ id: 'now', start: '09:00', end: '11:00' }),
      event({ id: 'later', start: '15:00', end: '16:00' }),
      event({ id: 'yesterday', date: '2026-10-15', start: '09:00', end: '10:00' }),
      event({ id: 'tomorrow', date: '2026-10-17', start: '09:00', end: '10:00' })
    ];
    expect(todayAllocatedEvents(events, at(10)).map((entry) => entry.id)).toEqual(['now', 'later']);
  });

  it('never mutates or reorders the list it was given', () => {
    const events = [event({ id: 'b', start: '15:00', end: '16:00' }), event({ id: 'a', start: '09:00', end: '10:00' })];
    todayAllocatedEvents(events, at(8));
    expect(events.map((entry) => entry.id)).toEqual(['b', 'a']);
  });
});

describe('periodIncludesDate — when the filter is allowed to move the calendar', () => {
  const day = (value) => new Date(value);

  it('checks the displayed month, week or day', () => {
    expect(periodIncludesDate('day', day('2026-10-16T12:00:00'), day('2026-10-16T09:00:00'))).toBe(true);
    expect(periodIncludesDate('day', day('2026-10-16T12:00:00'), day('2026-10-17T09:00:00'))).toBe(false);

    expect(periodIncludesDate('week', day('2026-10-16T12:00:00'), day('2026-10-12T09:00:00'))).toBe(true);
    expect(periodIncludesDate('week', day('2026-10-16T12:00:00'), day('2026-10-18T09:00:00'))).toBe(true);
    expect(periodIncludesDate('week', day('2026-10-16T12:00:00'), day('2026-10-19T09:00:00'))).toBe(false);

    expect(periodIncludesDate('month', day('2026-10-16T12:00:00'), day('2026-10-31T09:00:00'))).toBe(true);
    expect(periodIncludesDate('month', day('2026-10-16T12:00:00'), day('2026-11-01T09:00:00'))).toBe(false);
  });

  it('is safe with junk input', () => {
    expect(periodIncludesDate('month', null, day('2026-10-16T09:00:00'))).toBe(false);
    expect(periodIncludesDate('month', day('2026-10-16T12:00:00'), null)).toBe(false);
  });
});

describe('live clock arithmetic', () => {
  it('prints the local 12-hour time with seconds and a meridiem', () => {
    expect(formatClockTime(new Date(2026, 9, 16, 15, 39, 8))).toBe('03:39:08 PM');
    expect(formatClockTime(new Date(2026, 9, 16, 9, 5, 3))).toBe('09:05:03 AM');
    // Midnight and noon are the two cases a naive % 12 gets wrong.
    expect(formatClockTime(new Date(2026, 9, 16, 0, 0, 0))).toBe('12:00:00 AM');
    expect(formatClockTime(new Date(2026, 9, 16, 12, 0, 0))).toBe('12:00:00 PM');
    expect(formatClockTime(null)).toBe('');
  });

});

describe('calendar role scope', () => {
  it('offers exactly the ERP\'s real roles', () => {
    expect(CALENDAR_ROLES.map((role) => role.key)).toEqual(['ADMIN', 'MANAGER', 'USER']);
  });

  it('gives Admin the whole calendar — every ERP area', () => {
    const allKeys = ERP_CATEGORIES.map((category) => category.key);
    expect(allKeys).toHaveLength(7);
    expect(categoriesForRole('ADMIN')).toEqual(allKeys);
  });

  it('keeps every role inside the seven known categories', () => {
    const allKeys = ERP_CATEGORIES.map((category) => category.key);
    CALENDAR_ROLES.forEach((role) => {
      const areas = categoriesForRole(role.key);
      expect(areas.length).toBeGreaterThan(0);
      areas.forEach((key) => expect(allKeys).toContain(key));
    });
  });

  it('shows the filter chips in the requested order', () => {
    expect(CALENDAR_FILTER_CATEGORY_KEYS).toEqual([
      'marketing',
      'sales',
      'purchase',
      'production',
      'general'
    ]);
  });

  it('leaves CRM and Design defined even though they have no chip', () => {
    expect(CALENDAR_FILTER_CATEGORY_KEYS).not.toContain('crm');
    expect(CALENDAR_FILTER_CATEGORY_KEYS).not.toContain('engineering');
    // Still fully defined — colours, labels and events keep working.
    expect(ERP_CATEGORIES.map((category) => category.key)).toEqual(expect.arrayContaining(['crm', 'engineering']));
    CALENDAR_FILTER_CATEGORY_KEYS.forEach((key) => expect(CATEGORY_MAP[key]).toBeTruthy());
  });

  it('falls back to a known role for junk input instead of throwing', () => {
    expect(calendarRoleFor('admin')).toBe('ADMIN');
    expect(calendarRoleFor('  manager ')).toBe('MANAGER');
    expect(calendarRoleFor('SUPERUSER')).toBe(DEFAULT_CALENDAR_ROLE);
    expect(calendarRoleFor(undefined)).toBe(DEFAULT_CALENDAR_ROLE);
    expect(categoriesForRole('nonsense')).toEqual(CALENDAR_ROLE_AREAS.ADMIN);
  });
});

describe('event validation', () => {
  const valid = {
    title: 'Dispatch review',
    date: '2026-10-16',
    start: '09:00',
    end: '10:00',
    category: 'sales',
    description: ''
  };

  it('accepts a complete event', () => {
    expect(validateEvent(valid)).toEqual({ valid: true, errors: {} });
  });

  it('requires a title, date and both times', () => {
    const { valid: ok, errors } = validateEvent({});
    expect(ok).toBe(false);
    expect(errors.title).toBeTruthy();
    expect(errors.date).toBeTruthy();
    expect(errors.start).toBeTruthy();
    expect(errors.end).toBeTruthy();
  });

  it('treats a whitespace-only title as missing', () => {
    expect(validateEvent({ ...valid, title: '   ' }).errors.title).toBeTruthy();
  });

  it('rejects an end time at or before the start time', () => {
    expect(validateEvent({ ...valid, end: '09:00' }).errors.end).toBe(
      'End time must be after the start time.'
    );
    expect(validateEvent({ ...valid, end: '08:00' }).errors.end).toBeTruthy();
  });

  it('rejects an impossible date and over-long text', () => {
    expect(validateEvent({ ...valid, date: '2026-02-30' }).errors.date).toBeTruthy();
    expect(validateEvent({ ...valid, description: 'x'.repeat(501) }).errors.description).toBeTruthy();
  });
});

describe('event store', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips events through local storage', () => {
    const event = buildEvent({ ...emptyDraft('2026-10-16'), title: 'Site visit', category: 'crm' });
    expect(saveEvents([event])).toBe(true);

    const stored = listEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      id: event.id,
      title: 'Site visit',
      date: '2026-10-16',
      start: '09:00',
      end: '10:00',
      category: 'crm',
      source: 'local'
    });
  });

  it('survives corrupt storage instead of breaking the page', () => {
    window.localStorage.setItem('erp-calendar-events', '{not json');
    expect(listEvents()).toEqual([]);

    window.localStorage.setItem('erp-calendar-events', JSON.stringify([{ nope: true }, null]));
    expect(listEvents()).toEqual([]);
  });

  it('normalises an unknown category to the neutral one', () => {
    expect(categoryFor('does-not-exist').key).toBe('general');
    expect(categoryFor(undefined).key).toBe('general');
  });

  it('adds, updates and removes by id', () => {
    const first = buildEvent({ ...emptyDraft('2026-10-16'), title: 'One' });
    const second = buildEvent({ ...emptyDraft('2026-10-17'), title: 'Two' });

    let events = upsertEvent(upsertEvent([], first), second);
    expect(events).toHaveLength(2);

    const renamed = buildEvent({ ...toDraft(first), title: 'One (revised)' }, { id: first.id });
    events = upsertEvent(events, renamed);
    expect(events).toHaveLength(2);
    expect(events.find((event) => event.id === first.id).title).toBe('One (revised)');

    events = removeEvent(events, first.id);
    expect(events.map((event) => event.id)).toEqual([second.id]);
  });

  it('reports how many events each category holds', () => {
    const events = [
      buildEvent({ ...emptyDraft('2026-10-16'), title: 'a', category: 'sales' }),
      buildEvent({ ...emptyDraft('2026-10-16'), title: 'b', category: 'sales' }),
      buildEvent({ ...emptyDraft('2026-10-17'), title: 'c', category: 'unknown-key' })
    ];
    expect(countByCategory(events)).toEqual({ sales: 2, general: 1 });
  });
});
