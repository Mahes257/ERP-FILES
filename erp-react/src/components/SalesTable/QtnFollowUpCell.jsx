import { ChevronDown } from 'lucide-react';
import LastFollowupHistory from '../Common/LastFollowupHistory';
import SalesStatusBadge from './SalesStatusBadge';

/**
 * Quotation list → Follow-up Status cell.
 *
 * The dropdown is the EXACT shared CRM Leads "Last Follow-up → FOLLOW-UP
 * HISTORY" component ({@link LastFollowupHistory}) — the same ActionMenu shell,
 * "Follow-up History" heading, `Current` / status badges and "mode · status"
 * line, so the panel looks and behaves identically to the Leads table.
 *
 * Only the cell's own trigger content stays quotation-flavoured: the quotation
 * column is "FOLLOW-UP STATUS", so it shows the latest follow-up's status badge
 * and how many follow-ups the quotation has ("1 Follow-up" / "2 Follow-ups").
 * The trigger is painted with the same classes as the Leads trigger (muted
 * text, brand hover, small caret).
 *
 * The data is the REAL follow-up set behind that count: the quotation list
 * resolves `followups.quotationId` in ONE batched query per page and returns the
 * records on the row (backend: `QuotationFollowUpSummary`), so the count and the
 * history can never disagree and no extra request is made. Nothing is
 * hardcoded, and no follow-ups at all keeps the established "No Follow-up" text
 * with no popover.
 */
export default function QtnFollowUpCell({ row }) {
  const count = Number(row?.followUpCount) || 0;
  const followUps = Array.isArray(row?.followUps) ? row.followUps : [];

  // No related follow-ups: the established wording, and nothing to open.
  if (count === 0) {
    return <span style={{ fontSize: 11, color: '#94a3b8' }}>No Follow-up</span>;
  }

  const label = count === 1 ? '1 Follow-up' : `${count} Follow-ups`;

  return (
    <LastFollowupHistory
      history={followUps}
      renderTrigger={() => (
        <span className="inline-flex items-center gap-1 crm-erp-cell-muted hover:text-[#0B4A3D] hover:font-semibold transition-colors">
          {row?.followUpStatus ? <SalesStatusBadge status={row.followUpStatus} /> : null}
          <span>{label}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </span>
      )}
    />
  );
}
