import { useMemo } from 'react';
import { CalendarPlus, Clock } from 'lucide-react';
import TimeGrid from './TimeGrid';
import { categoryFor } from './calendarEvents';
import { formatDayLong, formatTimeLabel, formatTimeRange, minutesOfTime, toDateKey } from './calendarUtils';

/**
 * Day view: one time column plus an agenda rail.
 *
 * The rail is the part that makes a busy day readable — every booking of the
 * day in order, with its category and full time range — while the grid beside it
 * keeps the day in the same visual language as the week view. Clicking any entry
 * opens it; the empty state offers the one action that matters here.
 */
export default function DayView({ cursor, events, onEventClick, onAddEvent, onSlotClick, showErpLock = true }) {
  const dayKey = useMemo(() => toDateKey(cursor), [cursor]);
  const days = useMemo(() => [{ date: cursor, key: dayKey }], [cursor, dayKey]);
  const agenda = useMemo(() => events.filter((event) => event.date === dayKey), [events, dayKey]);

  return (
    <div className="cal-dayview">
      <div className="cal-surface cal-scroll">
        <TimeGrid
          days={days}
          events={agenda}
          todayKey={dayKey}
          onEventClick={onEventClick}
          onSlotClick={onSlotClick}
          showErpLock={showErpLock}
          singleDay
        />
      </div>

      <aside className="cal-surface">
        <div className="cal-agenda">
          <div className="cal-agenda-title">{formatDayLong(cursor)}</div>

          {agenda.length === 0 ? (
            <div className="cal-empty" style={{ padding: '26px 8px' }}>
              <span className="cal-empty-icon">
                <Clock className="w-5 h-5" />
              </span>
              <span className="cal-empty-title">Nothing scheduled</span>
              <span className="cal-empty-text">
                No events on this day yet. Add one to block out the time.
              </span>
              <button type="button" className="cal-btn cal-btn-primary" onClick={() => onAddEvent(dayKey)}>
                <CalendarPlus className="w-3.5 h-3.5" /> Add event
              </button>
            </div>
          ) : (
            agenda.map((event) => {
              const category = categoryFor(event.category);
              return (
                <button
                  key={event.id}
                  type="button"
                  className="cal-agenda-item"
                  style={{ '--cal-accent': category.color }}
                  onClick={() => onEventClick(event)}
                >
                  {/* An entry without a real time is labelled as such — the
                      agenda never invents an hour for a due date. */}
                  <span className="cal-agenda-time">
                    {minutesOfTime(event.start) === null
                      ? 'All day'
                      : event.end
                        ? formatTimeRange(event.start, event.end)
                        : formatTimeLabel(event.start)}
                  </span>
                  <span className="cal-agenda-body">
                    <span className="cal-agenda-event">{event.title}</span>
                    <span className="cal-agenda-meta">{category.label}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </aside>
    </div>
  );
}
