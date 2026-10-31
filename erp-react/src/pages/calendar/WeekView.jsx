import { useMemo } from 'react';
import TimeGrid from './TimeGrid';
import { weekDays } from './calendarUtils';

/**
 * Week view — the Monday-first week containing `cursor`, rendered on the shared
 * time grid. Kept as its own component so the Day view can reuse the grid with
 * a single column without either view owning the other's layout.
 */
export default function WeekView({ cursor, events, todayKey, onEventClick, onSlotClick, showErpLock = true }) {
  const days = useMemo(() => weekDays(cursor), [cursor]);

  return (
    <div className="cal-scroll">
      <TimeGrid
        days={days}
        events={events}
        todayKey={todayKey}
        onEventClick={onEventClick}
        onSlotClick={onSlotClick}
        showErpLock={showErpLock}
      />
    </div>
  );
}
