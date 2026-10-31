/**
 * SettingsSection
 * ------------------------------------------------------------------
 * A category of the Advanced Settings landing page, built from the SAME
 * primitives as every other administration screen (AdminCard +
 * AdminCardHeader) so the landing page reads as one product:
 *
 *   • small, uppercase, muted LABEL  (the category eyebrow, e.g. ACCESS)
 *   • tinted icon tile · strong TITLE · readable muted DESCRIPTION
 *   • an optional right-aligned `badge` (e.g. "Admin only")
 *   • a responsive grid of SettingsCard tiles
 *
 * Grid: 1 column on mobile, a clean 2 columns from the `sm` breakpoint up —
 * never oversized tiles. `emphasis` gives the administrative/security group a
 * slightly stronger border while keeping the SAME surface card (border radius,
 * border colour, background and shadow) used by every admin card.
 *
 * Presentation-only: no routing, counts or permission logic lives here.
 */

import AdminCard, { AdminCardHeader } from './AdminCard';

export default function SettingsSection({
  label,
  icon,
  tone,
  title,
  description,
  emphasis = false,
  badge,
  children
}) {
  return (
    <AdminCard className={emphasis ? 'border-[#0B4A3D]/25' : ''}>
      <AdminCardHeader
        icon={icon}
        tone={tone}
        label={label}
        title={title}
        description={description}
        meta={
          badge ? (
            <span className="inline-flex items-center rounded-full border border-[#0B4A3D]/20 bg-[#0B4A3D]/[0.08] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0B4A3D]">
              {badge}
            </span>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 px-5 py-5 sm:grid-cols-2 sm:px-6">
        {children}
      </div>
    </AdminCard>
  );
}
