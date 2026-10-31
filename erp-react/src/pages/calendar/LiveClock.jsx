import { useEffect, useState } from 'react';
import { formatClockTime } from './calendarUtils';

/**
 * The calendar toolbar's live clock (between Today Allocated and the
 * Month/Week/Day controls).
 *
 * Time only — no ring, glow, card, border or date line: the toolbar shows the
 * live 12-hour time with AM/PM straight on the animated background.
 *
 * Two deliberate decisions:
 *
 *  · It is a LEAF component holding its own `now` state, so the once-a-second
 *    tick re-renders this text only. The page above it — the month grid, its
 *    events and the wheel-zoom pipeline — never re-renders because of the clock.
 *  · The tick is scheduled against the real second boundary (and the state
 *    update is skipped when the second has not actually changed), so the display
 *    reports the wall clock instead of drifting away from it the longer the page
 *    stays open. One timer, cleared on unmount.
 */
export default function LiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer = 0;

    const tick = () => {
      const current = new Date();
      setNow((previous) => (
        Math.floor(previous.getTime() / 1000) === Math.floor(current.getTime() / 1000)
          ? previous
          : current
      ));
      // Align the next tick to the second boundary this one landed on.
      timer = window.setTimeout(tick, 1000 - (current.getMilliseconds() % 1000));
    };

    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="cal-clock" role="group" aria-label="Current local time">
      <time className="cal-clock-time" dateTime={now.toISOString()}>{formatClockTime(now)}</time>
    </div>
  );
}
