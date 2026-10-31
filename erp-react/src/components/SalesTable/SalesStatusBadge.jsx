import StatusBadge from '../Common/StatusBadge';

/**
 * Sales module status badge – delegates to the shared StatusBadge component.
 * Maintains backward compatibility with existing SalesStatusBadge API.
 */
export default function SalesStatusBadge({ status }) {
  return <StatusBadge status={status} />;
}
