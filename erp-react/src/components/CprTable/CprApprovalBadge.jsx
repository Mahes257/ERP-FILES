import StatusBadge from '../Common/StatusBadge';

export default function CprApprovalBadge({ status }) {
  if (!status) {
    return <span className="po-badge po-badge-gray">—</span>;
  }
  return <StatusBadge status={status} />;
}
