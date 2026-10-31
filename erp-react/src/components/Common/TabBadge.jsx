/**
 * TabBadge.jsx
 * ------------------------------------------------------------------
 * Compact pending-approval count badge for module hub tabs (CRM, CPR,
 * Sales Execution). Follows the RFQ screenshot's compact pill pattern:
 *   - Orange/creamy background on inactive tabs
 *   - White/transparent background on active tabs
 *   - No badge rendered when count is 0
 * ------------------------------------------------------------------
 */

/** Display-only cap for very large counts — keeps the pill compact. */
const formatCount = (n) => (Number(n) > 99 ? '99+' : n);

export default function TabBadge({ count = 0, active = false }) {
  const n = Number(count) || 0;
  if (n <= 0) return null;

  return (
    <span
      className={`rfq-tab-badge${active ? ' rfq-tab-badge--active' : ''}`}
      role="status"
      aria-label={`${n} pending approval${n !== 1 ? 's' : ''}`}
    >
      {formatCount(n)}
    </span>
  );
}
