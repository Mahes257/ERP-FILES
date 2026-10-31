/**
 * purchase/components/LogisticsFormSummary.jsx
 * ------------------------------------------------------------------
 * Reusable right-side summary card for Logistics create/edit forms.
 * Shows live document data from form values. Matches the
 * PurchaseDocumentSummary pattern from RequisitionForm.
 * ------------------------------------------------------------------
 */
import { ClipboardList } from 'lucide-react';
import PurchaseStatusBadge from './PurchaseStatusBadge';
import { formatDate } from '../utils/helpers';

function Row({ label, value, strong = false }) {
  return (
    <div className={`pr-doc-summary-row ${strong ? 'pr-doc-summary-total' : ''}`}>
      <span className="pr-doc-label">{label}</span>
      <span className="pr-doc-value">{value}</span>
    </div>
  );
}

export default function LogisticsFormSummary({
  title = 'Document Summary',
  icon: Icon = ClipboardList,
  docNo = '',
  status = 'Draft',
  sourceDoc = '',
  sourceLabel = 'Source Document',
  vendor = '',
  poNo = '',
  items = [],
  quantity = 0,
  value = '',
  warehouse = '',
  createdBy = '',
  createdAt = null,
  extraRows = [],
}) {
  const totalQty = items.length > 0
    ? items.reduce((sum, item) => sum + (Number(item.qty) || Number(item.receivedQty) || 0), 0)
    : quantity;

  return (
    <div className="purchase-form-card">
      <div className="purchase-form-card-header">
        <h3>
          <Icon aria-hidden="true" />
          {title}
        </h3>
      </div>
      <div className="purchase-form-card-body" style={{ paddingTop: 10 }}>
        <Row
          label="Document No"
          value={docNo ? <span className="font-mono">{docNo}</span> : <span className="text-slate-400 font-medium">Auto-generated</span>}
        />
        {sourceDoc && <Row label={sourceLabel} value={<span className="font-mono">{sourceDoc}</span>} />}
        {poNo && <Row label="Purchase Order" value={<span className="font-mono">{poNo}</span>} />}
        {vendor && <Row label="Vendor" value={vendor} />}

        <div className="pr-doc-summary-divider" />

        <Row label="Status" value={<PurchaseStatusBadge status={status} />} />
        {warehouse && <Row label="Warehouse" value={warehouse} />}
        {totalQty > 0 && <Row label="Total Quantity" value={<span className="font-semibold tabular-nums">{totalQty.toLocaleString()}</span>} />}
        {value && <Row label="Est. Value" value={<span className="font-semibold">{value}</span>} />}

        {extraRows.length > 0 && <div className="pr-doc-summary-divider" />}
        {extraRows.map((row, i) => (
          <Row key={i} label={row.label} value={row.value} />
        ))}

        <div className="pr-doc-summary-divider" />

        <Row label="Created By" value={createdBy || '—'} />
        <Row label="Created Date" value={createdAt ? formatDate(createdAt) : formatDate(new Date())} />
      </div>
    </div>
  );
}
