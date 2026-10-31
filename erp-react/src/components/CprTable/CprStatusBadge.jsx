import StatusBadge from '../Common/StatusBadge';

/**
 * CPR module status badge – delegates to the shared StatusBadge component.
 * Maintains backward compatibility with existing CprStatusBadge API.
 */
export default function CprStatusBadge({ status }) {
  return <StatusBadge status={status} />;
}
