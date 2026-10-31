import { useMemo } from 'react';
import EventChip from './EventChip';
import { formatHourLabel, hourGridRange, layoutDayEvents, minutesOfTime } from './calendarUtils';

/** Height of one hour row, in pixels (also published as the CSS var --cal-hour). */
export const HOUR_HEIGHT = 48;

/**
 * The time grid shared by the Week and Day views.
 *
 * One implementation, two column counts: `days` is the row of days to render,
 * the hour window widens to fit whatever the events need (see `hourGridRange`),
 * and overlapping bookings are laid out side by side by `layoutDayEvents`.
 *
 * Clicking an empty hour starts an event in that slot — the same "click a time
 * to book it" affordance the ERP's own schedulers use — and every event block
 * opens the event it belongs to.
 */
export default function TimeGrid({
  days,
  events,
  todayKey,
  onEventClick,
  onSlotClick,
  singleDay = false,
  showErpLock = true
}) {
  const range = useMemo(() => hourGridRange(events), [events]);
  const hours = useMemo(
    () => Array.from({ length: Math.max(1, range.endHour - range.startHour) }, (_, i) => range.startHour + i),
    [range]
  );

  const blocksByDay = useMemo(() => {
    const map = new Map();
    days.forEach(({ key }) => {
      const dayEvents = events.filter((event) => event.date === key);
      map.set(key, layoutDayEvents(dayEvents, { startHour: range.startHour, endHour: range.endHour }));
    });
    return map;
  }, [days, events, range]);

  /**
   * Entries with no usable time of day — ERP due dates, for example — cannot be
   * positioned on the hour grid. They are drawn in an "All day" strip above it
   * instead of being given a made-up hour or silently dropped.
   */
  const allDayByDay = useMemo(() => {
    const map = new Map();
    days.forEach(({ key }) => {
      map.set(
        key,
        events.filter((event) => event.date === key && minutesOfTime(event.start) === null)
      );
    });
    return map;
  }, [days, events]);

  const hasAllDay = useMemo(
    () => days.some(({ key }) => (allDayByDay.get(key) || []).length > 0),
    [days, allDayByDay]
  );

  const template = `64px repeat(${days.length}, minmax(${singleDay ? 200 : 118}px, 1fr))`;
  const gridHeight = hours.length * HOUR_HEIGHT;

  return (
    <div className={`cal-time${singleDay ? ' is-single' : ''}`} style={{ '--cal-hour': `${HOUR_HEIGHT}px` }}>
      <div className="cal-time-head" style={{ gridTemplateColumns: template }}>
        <div className="cal-time-head-cell" aria-hidden="true" />
        {days.map(({ date, key }) => (
          <div key={key} className={`cal-time-head-cell${key === todayKey ? ' is-today' : ''}`}>
            <div className="cal-time-head-weekday">
              {date.toLocaleDateString('en-GB', { weekday: 'short' })}
            </div>
            <div className="cal-time-head-date">{date.getDate()}</div>
          </div>
        ))}
      </div>

      {hasAllDay && (
        <div className="cal-time-allday" style={{ gridTemplateColumns: template }}>
          <div className="cal-time-allday-label">All day</div>
          {days.map(({ key }) => (
            <div key={key} className="cal-time-allday-cell">
              {(allDayByDay.get(key) || []).map((event) => (
                <EventChip key={event.id} event={event} showErpLock={showErpLock} onClick={() => onEventClick(event)} />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* `data-cal-scroll`: this element scrolls on its own, so an UNMODIFIED
          wheel over it scrolls the grid instead of zooming the calendar (Ctrl +
          wheel still zooms here). */}
      <div className="cal-time-body" data-cal-scroll="true" style={{ gridTemplateColumns: template }}>
        <div className="cal-rail" style={{ height: gridHeight }}>
          {hours.map((hour) => (
            <div className="cal-rail-hour" key={hour}>
              {formatHourLabel(hour)}
            </div>
          ))}
        </div>

        {days.map(({ date, key }) => {
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          return (
            <div
              key={key}
              className={[
                'cal-col',
                key === todayKey ? 'is-today' : '',
                weekend ? 'is-weekend' : ''
              ].filter(Boolean).join(' ')}
            >
              <div className="cal-col-inner" style={{ height: gridHeight }}>
                {hours.map((hour) => (
                  <button
                    key={hour}
                    type="button"
                    className="cal-slot"
                    style={{ top: (hour - range.startHour) * HOUR_HEIGHT }}
                    title={`Add an event at ${formatHourLabel(hour)}`}
                    aria-label={`Add an event on ${key} at ${formatHourLabel(hour)}`}
                    onClick={() => onSlotClick(key, hour)}
                  />
                ))}

                {(blocksByDay.get(key) || []).map(({ event, lane, lanes, top, height }) => (
                  <EventChip
                    key={event.id}
                    event={event}
                    showErpLock={showErpLock}
                    variant="block"
                    style={{
                      top: `${top}%`,
                      height: `${height}%`,
                      left: `calc(${(lane / lanes) * 100}% + 2px)`,
                      width: `calc(${100 / lanes}% - 4px)`
                    }}
                    onClick={() => onEventClick(event)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
