/**
 * purchase/components/PurchaseDocumentSummary.jsx
 * ------------------------------------------------------------------
 * Sticky document summary for the Create / Edit Purchase Requisition
 * screen. Matches the CPR Purchase Summary sidebar layout exactly:
 * PR Number, Reference PR No, Required Date, Priority, Status,
 * Department, Requester, Preferred Vendor, Items, Qty, Est. Value,
 * Attachments, Created, Last Saved.
 * ------------------------------------------------------------------
 */
import { ClipboardList } from 'lucide-react';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import { formatAmount, formatAmountConverted } from '../utils/purchase';
import { formatDate } from '../utils/helpers';

function Row({ label, value, strong = false }) {
  return (
    <div className={`pr-doc-summary-row ${strong ? 'pr-doc-summary-total' : ''}`}>
      <span className="pr-doc-label">{label}</span>
      <span className="pr-doc-value">{value}</span>
    </div>
  );
}

export default function PurchaseDocumentSummary({
  prNo = '',
  status = 'Draft',
  values = {},
  currency = 'INR',
  convert = false,
  createdAt = null,
  updatedAt = null,
}) {
  /* `convert` (Purchase Requisition) shows stored INR totals in the
     document currency; otherwise amounts render unchanged. */
  const fmt = (value) => (convert ? formatAmountConverted(value, currency) : formatAmount(value, currency));
  const items = Array.isArray(values.items) ? values.items : [];
  const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  const estValue = items.reduce((sum, item) => {
    const qty = Number(item?.qty) || 0;
    const rate = Number(item?.rate) || 0;
    return sum + qty * rate;
  }, 0);
  const attachmentCount = Array.isArray(values.attachments) ? values.attachments.length : 0;

  return (
    <div className="purchase-form-card">
      <div className="purchase-form-card-header">
        <h3>
          <ClipboardList aria-hidden="true" />
          Purchase Summary
        </h3>
      </div>
      <div className="purchase-form-card-body" style={{ paddingTop: 10 }}>
        <Row
          label="PR Number"
          value={
            prNo ? (
              <span className="font-mono">{prNo}</span>
            ) : (
              <span className="text-slate-400 font-medium">—</span>
            )
          }
        />
        <Row label="Reference PR No" value={values.referencePrNo || '—'} />
        <Row label="Required Date" value={values.expectedDate ? formatDate(values.expectedDate) : '—'} />

        <div className="pr-doc-summary-divider" />

        <Row label="Priority" value={values.priority || '—'} />
        <Row label="Status" value={<PurchaseStatusBadge status={status} />} />
        <Row label="PR Type" value={values.prType || '—'} />

        <div className="pr-doc-summary-divider" />

        <Row label="Department" value={values.department || '—'} />
        <Row label="Requester" value={values.requester || '—'} />
        <Row label="Preferred Vendor" value={values.vendor || <span className="text-slate-400">Not Selected</span>} />

        <div className="pr-doc-summary-divider" />

        <Row label="Items" value={items.length} />
        <Row label="Qty" value={totalQty} />
        <Row label="Est. Value" value={fmt(estValue)} strong />
        <Row label="Attachments" value={attachmentCount} />

        <div className="pr-doc-summary-divider" />

        <Row
          label="Created"
          value={createdAt ? formatDate(createdAt) : '—'}
        />
        <Row
          label="Last Saved"
          value={updatedAt ? formatDate(updatedAt) : '—'}
        />
      </div>
    </div>
  );
}
