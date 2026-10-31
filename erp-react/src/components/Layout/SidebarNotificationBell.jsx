/**
 * Circular notification indicator for the sidebar.
 *
 * An orange circular badge that shows the pending count. By default it renders
 * nothing when the count is zero (notification rows stay clean); callers whose
 * indicator must always be visible — the sidebar's Pending Approvals total —
 * pass `showZero` so the badge reads 0 instead of disappearing.
 * The indicator is purely presentational; count data is passed in from the
 * caller so it always stays in sync with the existing pending-approval source.
 *
 * Subtle wave animation draws attention without being excessive — a gentle
 * scale pulse that matches the Purchase module's professional design language.
 */

/** Display-only cap for very large counts — keeps the indicator compact (data untouched). */
const formatCount = (n) => (Number(n) > 99 ? '99+' : n);

export default function SidebarNotificationBell({ count = 0, showZero = false }) {
  const n = Number(count) || 0;
  if (n <= 0 && !showZero) return null;
  const label = String(formatCount(n));
  const sizeClass = label.length === 1 ? 'one' : label.length === 2 ? 'two' : 'wide';

  return (
    <span
      className={`sb-notif-circle sb-notif-circle--${sizeClass}${n <= 0 ? ' is-zero' : ''}`}
      role="status"
      aria-label={`${n} pending approval(s)`}
    >
      <span className="sb-notif-count">{label}</span>
    </span>
  );
}
