/**
 * purchase/components/approval/ApprovalRowDetail.jsx
 * ------------------------------------------------------------------
 * Expanded row panel for the Approval Center table — a compact,
 * List-style detail surface with exactly three sections:
 *
 *   General    · Department · Project · Requester · Buyer · Vendor
 *   Commercial · Currency · GST Type · Payment Terms · Discount · Charges
 *   Approval   · Current Stage · Approver · Comments
 *
 * Presentation only — no business logic.
 * ------------------------------------------------------------------
 */
import { ClipboardList, Receipt, UserCheck, UserCog } from 'lucide-react';
import { formatAmountConverted } from '../../utils/purchase';

const STATUS_BADGE = {
  Draft: 'cpr-badge-draft',
  'Pending Approval': 'cpr-badge-pending-approval',
  Approved: 'cpr-badge-approved',
  Rejected: 'cpr-badge-rejected',
  Returned: 'cpr-badge-archived',
  'PO Raised': 'cpr-badge-converted',
  'Converted to RFQ': 'cpr-badge-converted'
};

function Field({ label, value }) {
  return (
    <div className="ac-detail-field">
      <span className="ac-detail-field-label">{label}</span>
      <span className="ac-detail-field-value" title={value}>{value || '—'}</span>
    </div>
  );
}

function Section({ title, icon, children }) {
  return (
    <div className="ac-detail-section">
      <div className="ac-detail-section-title">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

export default function ApprovalRowDetail({ record, onViewDetails }) {
  const comments = record?.comments || [];
  const status = record?.status || 'Draft';
  const discount = record?.discount ? `${record.discount}%` : '—';
  const charges =
    record?.charges != null && record.charges !== ''
      ? formatAmountConverted(record.charges, record.currency)
      : '—';
  /* `age` is decorated on the record as a day count (0 = created today). */
  const age = Number(record?.age);
  const ageLabel = Number.isFinite(age) && age > 0 ? `${age} day${age === 1 ? '' : 's'}` : 'Today';

  return (
    <div className="ac-detail-panel">
      <div className="ac-detail-head">
        <div className="flex items-center gap-2">
          <span className="ac-detail-pr">{record?.prNo}</span>
          <span className={`cpr-badge ${STATUS_BADGE[status] || 'cpr-badge-draft'}`}>{status}</span>
        </div>
        {onViewDetails && (
          <button type="button" className="ac-view-btn" onClick={onViewDetails}>
            <ClipboardList className="w-3.5 h-3.5" /> View Details
          </button>
        )}
      </div>

      <div className="ac-detail-sections">
        <Section title="General" icon={<UserCheck aria-hidden="true" />}>
          <Field label="Department" value={record?.department} />
          <Field label="Project" value={record?.project} />
          <Field label="Requester" value={record?.requester} />
          <Field label="Buyer" value={record?.buyer} />
          <Field label="Vendor" value={record?.vendor} />
        </Section>

        <Section title="Commercial" icon={<Receipt aria-hidden="true" />}>
          <Field label="Currency" value={record?.currency} />
          <Field label="GST Type" value={record?.gstType} />
          <Field label="Payment Terms" value={record?.terms} />
          <Field label="Discount" value={discount} />
          <Field label="Charges" value={charges} />
        </Section>

        <Section title="Approval" icon={<UserCog aria-hidden="true" />}>
          <Field label="Current Stage" value={record?.stage} />
          <Field label="Approver" value={record?.assignedTo} />
          <Field label="Age" value={ageLabel} />
          <div className="ac-detail-comments">
            {comments.length > 0 ? (
              comments.slice(-2).reverse().map((comment, index) => (
                <p key={comment.id || `c-${index}`} className="ac-detail-comment">
                  <strong>{comment.author || '—'}</strong>: {comment.text}
                </p>
              ))
            ) : (
              <p className="ac-detail-comment muted">No comments yet.</p>
            )}
          </div>
        </Section>
      </div>
    </div>
  );
}
