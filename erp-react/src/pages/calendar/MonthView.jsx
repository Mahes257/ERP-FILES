import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import EventChip from './EventChip';
import { WEEKDAY_SHORT, monthGrid } from './calendarUtils';

/** Chips a cell shows before it collapses into "+N more". */
const MAX_CHIPS = 3;

/**
 * Month view: the six Monday-first weeks of the displayed month.
 *
 * The grid always renders six weeks (see `monthGrid`), so moving between months
 * never changes the page height or makes the rows jump. Leading and trailing
 * days belong to the neighbouring months, are dimmed, and still show their own
 * events — clicking a day number moves the calendar to that day, exactly as the
 * ERP's own date pickers behave.
 */
export default function MonthView({
  year,
  month,
  eventsByDate,
  todayKey,
  onEventClick,
  onSelectDay,
  onAddOnDay,
  showErpLock = true
}) {
  const weeks = useMemo(() => monthGrid(year, month), [year, month]);

  return (
    <div className="cal-month">
      <div className="cal-month-head">
        {WEEKDAY_SHORT.map((label, index) => (
          <div key={label} className={`cal-month-head-cell${index >= 5 ? ' is-weekend' : ''}`}>
            {label}
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div className="cal-month-week" key={week[0].key}>
          {week.map((cell) => {
            const dayEvents = eventsByDate.get(cell.key) || [];
            const visible = dayEvents.slice(0, MAX_CHIPS);
            const hidden = dayEvents.length - visible.length;
            const weekend = cell.date.getDay() === 0 || cell.date.getDay() === 6;
            const isCurrentDay = cell.key === todayKey;

            return (
              <div
                key={cell.key}
                className={[
                  'cal-day',
                  cell.inMonth ? '' : 'is-outside',
                  weekend ? 'is-weekend' : '',
                  isCurrentDay ? 'is-today' : ''
                ].filter(Boolean).join(' ')}
              >
                <div className="cal-day-head">
                  <button
                    type="button"
                    className={`cal-day-num${isCurrentDay ? ' is-today' : ''}`}
                    title={`Open ${cell.key}`}
                    onClick={() => onSelectDay(cell.key)}
                  >
                    {cell.date.getDate()}
                  </button>
                  <button
                    type="button"
                    className="cal-day-add"
                    aria-label={`Add an event on ${cell.key}`}
                    title="Add event"
                    onClick={() => onAddOnDay(cell.key)}
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </div>

                <div className="cal-day-events">
                  {visible.map((event) => (
                    <EventChip
                      key={event.id}
                      event={event}
                      showErpLock={showErpLock}
                      onClick={() => onEventClick(event)}
                    />
                  ))}
                  {hidden > 0 && (
                    <button
                      type="button"
                      className="cal-day-more"
                      onClick={() => onSelectDay(cell.key)}
                    >
                      +{hidden} more
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
