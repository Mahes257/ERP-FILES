import { Lock } from 'lucide-react';
import { categoryFor } from './calendarEvents';
import { formatTimeLabel } from './calendarUtils';

/**
 * One calendar event, in the two shapes the views need:
 *
 *   variant="chip"   a single compact line for a month cell
 *   variant="block"  a positioned block for a week/day time column
 *
 * Both carry the category's own colour as CSS custom properties, so the
 * stylesheet tints/edges the card without the component hard-coding a palette.
 */
export default function EventChip({
  event,
  onClick,
  variant = 'chip',
  className = '',
  style = {},
  showTime = true,
  // Admin hides only the event-card lock; the read-only state itself and every
  // other icon are untouched.
  showErpLock = true
}) {
  const category = categoryFor(event?.category);
  const time = showTime ? formatTimeLabel(event?.start) : '';
  // Derived (read-only) entries are marked so a backend record is never
  // mistaken for something the user can edit here.
  const isErp = Boolean(event?.readOnly) || event?.source === 'erp';

  return (
    <button
      type="button"
      className={`cal-event${variant === 'block' ? ' cal-event-block' : ''}${isErp ? ' is-erp' : ''} ${className}`.trim()}
      style={{
        '--cal-accent': category.color,
        '--cal-tint': category.tint,
        '--cal-tint-dark': category.tintDark,
        ...style
      }}
      onClick={onClick}
      title={`${event?.title || 'Event'} · ${category.label}${time ? ` · ${time}` : ''}${
        isErp ? ' · ERP entry (read-only)' : ''
      }`}
    >
      {/* Shown only on narrow screens, where a month cell is too small for the
          title: the chip collapses to its category colour. */}
      <span className="cal-event-dot" aria-hidden="true" />
      {time && <span className="cal-event-time">{time}</span>}
      <span className="cal-event-title">{event?.title || 'Untitled event'}</span>
      {/* A glyph rather than the word "ERP": in a month cell the title needs the
          width, and the dashed edge plus the read-only dialog already say what
          kind of entry this is. */}
      {isErp && showErpLock && <Lock className="cal-event-erp" aria-hidden="true" />}
    </button>
  );
}
