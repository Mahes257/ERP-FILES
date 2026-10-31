/**
 * purchase/components/list/PurchaseStatusCell.jsx
 * ------------------------------------------------------------------
 * Shared status cell renderer for ALL Purchase module tables.
 *
 * Every status maps to exactly one tone via the shared semantic tone
 * map (utils/statusTone):
 *
 *   green  — success / completed / approved
 *   orange — pending / needs action
 *   blue   — active / in-progress communication
 *   red    — rejected / cancelled / overdue
 *   gray   — draft / closed / inactive
 *
 * The tone drives the pill colour so the same status always renders
 * the same colour across every Purchase module page.
 * ------------------------------------------------------------------
 */
import { getStatusTone } from '../../utils/statusTone';

/**
 * Status cell with tone-based colour pill.
 * Use as a column renderer: `status: (row) => <PurchaseStatusCell status={row.status} />`
 *
 * @param {string} status - The workflow status string
 * @param {string} [className] - Optional extra class names
 */
export default function PurchaseStatusCell({ status, className = '' }) {
  if (!status) {
    return <span className={`cpr-status-cell ${className}`.trim()}>—</span>;
  }

  const tone = getStatusTone(status);

  return (
    <span
      className={`cpr-status-cell tone-${tone} ${className}`.trim()}
    >
      {status}
    </span>
  );
}
