/**
 * AdminCard / AdminCardHeader / AdminCardFooter
 * ------------------------------------------------------------------
 * The single card treatment shared by every Advanced Settings screen — the
 * `/settings` landing page and its destinations (Financial Settings,
 * Notifications). It encodes the Settings visual language so no page has to
 * re-implement its own container:
 *
 *   • one border radius (rounded-2xl), one border colour,
 *   • one surface background + subtle shadow,
 *   • one header rhythm (icon tile · title · description · right-aligned meta),
 *   • a footer band helper for pagination / informational rows.
 *
 * Adapted from the Advanced Settings reference package: the structure,
 * spacing, type scale and tones are the reference's, while the neutral
 * colours go through this app's theme tokens (bg-surface · border-line ·
 * text-ink · text-ink-2/3) instead of raw slate utilities. The tokens hold
 * the SAME values as the slate ramp in light mode (#0f172a / #e2e8f0 /
 * #475569 / #6B7280), so the page looks identical to the reference there and
 * additionally keeps working in dark mode. The #0B4A3D accent is this app's
 * existing --primary brand colour, so it is left exactly as supplied.
 *
 * It is presentation-only — no data, routing or permission logic lives here.
 * `AdminCardHeader` accepts an `icon` component, a restrained `tone` for the
 * icon tile, an optional uppercase `label` (the category eyebrow used by the
 * Advanced Settings landing sections) and an optional `meta` node (count
 * badge / status pill).
 */

const ICON_TONES = {
  emerald: 'bg-emerald-50 text-[#0B4A3D] ring-1 ring-inset ring-emerald-100',
  sky: 'bg-sky-50 text-sky-600 ring-1 ring-inset ring-sky-100',
  amber: 'bg-amber-50 text-amber-600 ring-1 ring-inset ring-amber-100',
  rose: 'bg-rose-50 text-rose-500 ring-1 ring-inset ring-rose-100',
  slate: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'
};

export default function AdminCard({ className = '', children }) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_3px_rgba(15,23,42,0.06)] ${className}`.trim()}
    >
      {children}
    </div>
  );
}

export function AdminCardHeader({
  icon: Icon,
  tone = 'emerald',
  label,
  title,
  description,
  meta
}) {
  const iconTone = ICON_TONES[tone] || ICON_TONES.emerald;

  return (
    <div className="border-b border-line px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`erp-icon-tile ${iconTone}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>

        <div className="min-w-0">
          {label ? (
            <p className="mb-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-3">
              {label}
            </p>
          ) : null}
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <p className="text-xs text-ink-3">{description}</p>
        </div>

        {meta ? <div className="ml-auto">{meta}</div> : null}
      </div>
    </div>
  );
}

/**
 * Footer band for a card — used for pagination rows and informational notes so
 * every settings table closes with the same rhythm.
 */
export function AdminCardFooter({ className = '', children }) {
  return (
    <div
      className={`flex flex-col gap-3 border-t border-line px-5 py-4 text-xs text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 ${className}`.trim()}
    >
      {children}
    </div>
  );
}
