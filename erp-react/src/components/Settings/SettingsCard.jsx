/**
 * SettingsCard
 * ------------------------------------------------------------------
 * A single destination tile for the Advanced Settings dashboard.
 *
 * Two variants share one visual language (both taken from the reference
 * package):
 *   • live         — a real <button>; the WHOLE card is clickable and
 *                    keyboard-focusable. Hover: lift, stronger border,
 *                    brand-tinted background, soft elevation, arrow slides,
 *                    icon accent. The "Open" pill makes the action obvious.
 *   • comingSoon   — a non-interactive tile with a readable "Coming soon"
 *                    badge. Visually consistent (never looks broken) but
 *                    explicitly non-clickable and announced as disabled.
 *
 * A card is only rendered in the live variant when it has a `path` to a route
 * this app actually has; otherwise the caller passes `comingSoon` so an
 * unfinished destination is never presented as implemented.
 *
 * Accent colours stay on the icons only, keeping the card surface restrained.
 * Neutral colours use this app's theme tokens (bg-surface · border-line ·
 * text-ink · text-ink-3) so the tile matches the reference in light mode and
 * still reads correctly in dark mode.
 */

import { ArrowRight, Clock } from 'lucide-react';

const TONES = {
  brand: 'bg-[#0B4A3D] text-white ring-[#0B4A3D]',
  emerald: 'bg-emerald-50 text-[#0B4A3D] ring-emerald-100',
  sky: 'bg-sky-50 text-sky-700 ring-sky-100',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  purple: 'bg-purple-50 text-purple-700 ring-purple-100',
  rose: 'bg-rose-50 text-rose-700 ring-rose-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200'
};

const CARD_BASE =
  'group flex h-full w-full flex-col rounded-xl border bg-surface p-4 text-left transition-all duration-150 ease-out';

const ICON_BASE =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-all duration-150';

export default function SettingsCard({
  title,
  description,
  icon: Icon,
  tone = 'emerald',
  onOpen,
  comingSoon = false
}) {
  const toneClass = TONES[tone] || TONES.emerald;

  if (comingSoon) {
    return (
      <div
        aria-disabled="true"
        className={`${CARD_BASE} border-line bg-surface/70`}
      >
        <div className="flex items-start gap-3.5">
          <span className={`${ICON_BASE} ${toneClass} opacity-70`}>
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-ink-2">{title}</h3>
            <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">
              {description}
            </p>
          </div>
        </div>

        <div className="mt-auto flex items-center justify-end pt-3.5">
          <span className="erp-badge-coming">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Coming soon
          </span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      // `settings-card` carries the surface background + border for a live
      // tile: this app's global `button { background: none; border: none }`
      // reset (production/styles/global.css) is UNLAYERED, so it outranks
      // every Tailwind utility and `bg-surface` / `border-line` never reach a
      // <button>. The radius, shadow, lift and ring below are unaffected and
      // stay as utilities. Hover surface + border are handled in the same
      // Settings stylesheet so there is a single source of truth.
      className={`${CARD_BASE} settings-card cursor-pointer shadow-[0_1px_2px_rgba(15,23,42,0.06)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(11,74,61,0.13)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B4A3D]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-app`}
    >
      <div className="flex items-start gap-3.5">
        <span
          className={`${ICON_BASE} ${toneClass} group-hover:scale-105 group-hover:ring-[#0B4A3D]/30`}
        >
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-end pt-3.5">
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#0B4A3D]/20 bg-[#0B4A3D]/[0.06] px-2.5 py-1 text-xs font-bold text-[#0B4A3D] transition-colors duration-150 group-hover:border-[#0B4A3D]/40 group-hover:bg-[#0B4A3D]/[0.12]">
          Open
          <ArrowRight
            className="h-3.5 w-3.5 transition-transform duration-150 ease-out group-hover:translate-x-1"
            aria-hidden="true"
          />
        </span>
      </div>
    </button>
  );
}
