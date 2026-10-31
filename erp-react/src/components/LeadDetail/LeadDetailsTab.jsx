/**
 * LeadDetailsTab — every field the Lead create/edit form collects, grouped into
 * the same card sections the CPR View uses (Business Information, Lead
 * Information, Primary/Secondary Contact, Address, Other Information).
 *
 * Shared by the Lead View page (/leads/:id) and the Lead quick-view modal, so
 * both render the identical mapping. Values come straight from the record
 * loaded through GET /leads/{id} — no cached form state, no placeholder values.
 */
import { Building2, IdCard, User, Users, MapPin, StickyNote, Network } from 'lucide-react';
import { DetailCard, DetailField, DetailFieldGrid } from '../DetailPage';
import { STAGE_BY_VALUE } from '../../utils/leadConstants';
import {
  formatINR,
  formatDate,
  formatDateTime,
  formatLeadNo
} from '../../utils/leadHelpers';
import { parseInternalNotes } from '../../utils/leadNotes';

/** Business + lead identity sections, side by side on desktop. */
export function LeadBusinessCard({ lead }) {
  return (
    <DetailCard icon={Building2} title="Business Information">
      <DetailFieldGrid
        fields={[
          ['Business Name', lead.businessName || lead.company],
          ['Business Type', lead.businessType],
          ['Industry', lead.industry],
          ['Website', lead.website],
          ['Tax ID / GST', lead.taxId],
          ['PAN', lead.pan]
        ]}
      />
    </DetailCard>
  );
}

export function LeadInfoCard({ lead }) {
  return (
    <DetailCard icon={IdCard} title="Lead Information">
      <DetailFieldGrid
        fields={[
          ['Lead No', lead.leadNo || formatLeadNo(lead.id)],
          ['Lead Name', lead.name],
          ['Company', lead.company],
          ['Designation', lead.title],
          ['Pipeline Stage', lead.stage],
          ['Status', lead.status],
          ['Priority', lead.priority],
          ['Lead Source', lead.source],
          ['Estimated Value', formatINR(lead.value)],
          ['Expected Close Date', lead.expectedCloseDate ? formatDate(lead.expectedCloseDate) : ''],
          ['Assigned Owner', lead.owner],
          ['Registered', formatDate(lead.date)],
          ['Last Updated', lead.updatedAt ? formatDateTime(lead.updatedAt) : '']
        ]}
      />
      <div className="mt-3">
        <DetailField label="Lead Description" value={lead.description} />
      </div>
    </DetailCard>
  );
}

export function LeadPrimaryContactCard({ lead }) {
  return (
    <DetailCard icon={User} title="Primary Contact">
      <DetailFieldGrid
        fields={[
          ['Name', lead.name],
          ['Designation', lead.title],
          ['Email', lead.email],
          ['Phone', lead.phone]
        ]}
      />
    </DetailCard>
  );
}

export function LeadSecondaryContactCard({ lead }) {
  return (
    <DetailCard icon={Users} title="Secondary Contact">
      <DetailFieldGrid
        fields={[
          ['Name', lead.secondaryName],
          ['Email', lead.secondaryEmail],
          ['Phone', lead.secondaryPhone]
        ]}
      />
    </DetailCard>
  );
}

export function LeadAddressCard({ lead }) {
  const lines = [lead.address, lead.mapNo].filter(Boolean);
  return (
    <DetailCard icon={MapPin} title="Address">
      <div className="space-y-3">
        <DetailField label="Street Address" value={lines.join(' · ')} />
        <DetailFieldGrid
          fields={[
            ['City', lead.city],
            ['State', lead.state],
            ['PIN Code', lead.pincode],
            ['Country', lead.country],
            ['Map No / Landmark', lead.mapNo]
          ]}
        />
      </div>
    </DetailCard>
  );
}

export function LeadOtherInfoCard({ lead }) {
  // The stored value is rendered verbatim for plain notes; a legacy
  // "__crmMeta" envelope (client/lead metadata written into the notes column)
  // is separated from the written note so raw JSON is never shown to the user.
  const { text, details } = parseInternalNotes(lead.internalNotes);
  return (
    <DetailCard icon={StickyNote} title="Other Information">
      <div className="space-y-3">
        <DetailField label="Internal Notes" value={text} />
        {details.length > 0 && <DetailFieldGrid fields={details} />}
        <DetailFieldGrid
          fields={[
            ['Preferred Vendor', lead.preferredVendor],
            ['Project', lead.project]
          ]}
        />
      </div>
    </DetailCard>
  );
}

/** Stage chip — reuses the pipeline's stage colour mapping. */
export function LeadStageBadge({ stage }) {
  const chip = STAGE_BY_VALUE?.[stage]?.chip || 'bg-slate-100 text-slate-600 border border-slate-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${chip}`}>
      {stage || '—'}
    </span>
  );
}

/** Network icon is re-exported so both callers can label the Project card. */
export const LeadProjectIcon = Network;

export default function LeadDetailsTab({ lead }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <LeadBusinessCard lead={lead} />
      <LeadInfoCard lead={lead} />
      <LeadPrimaryContactCard lead={lead} />
      <LeadSecondaryContactCard lead={lead} />
      <LeadAddressCard lead={lead} />
      <LeadOtherInfoCard lead={lead} />
    </div>
  );
}
