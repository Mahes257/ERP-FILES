import followUpService from '../services/followUpService';

// Lead call/email activity is persisted through the EXISTING follow-up
// architecture: POST /followups → Spring Boot → `followups` MySQL table.
//
// There is deliberately no second "communication" system here. A follow-up row
// whose `mode` is 'Call' or 'Email' is exactly how the existing ERP records a
// phone call or an email against a Lead, so the Leads page can log both without
// leaving the page and the existing Follow-ups module keeps showing the history.
//
// The backend snapshots the lead's fields server-side from `leadId` (see
// FollowUpService.applyLead), so the association is always the real Lead primary
// key of the row the user selected — never a copied/duplicated record.
export const CALL_MODE = 'Call';
export const EMAIL_MODE = 'Email';

export function leadDisplayName(lead) {
  return lead?.businessName || lead?.company || lead?.name || 'Lead';
}

export function leadContactName(lead) {
  return lead?.name || lead?.contactPerson || '';
}

/**
 * Build the real FollowUpRequest payload for a Lead-scoped communication.
 * Field names mirror AddFollowUp.buildPayload() / the backend `FollowUpRequest`
 * record exactly, so the existing API contract is reused unchanged.
 */
export function buildLeadFollowUpPayload(
  lead,
  {
    mode,
    followupDate,
    time = '',
    currentStatus = '',
    outcome = '',
    discussionSummary = '',
    customerFeedback = '',
    nextFollowupDate = '',
    assignTo = ''
  } = {}
) {
  return {
    leadId: Number(lead.id),
    clientId: null,
    leadName: leadContactName(lead) || leadDisplayName(lead),
    companyName: lead?.businessName || lead?.company || '',
    contactPerson: leadContactName(lead),
    phone: lead?.phone || '',
    email: lead?.email || '',
    leadStage: lead?.stage || '',
    source: lead?.source || '',
    industry: lead?.industry || '',
    address: lead?.address || '',
    followupDate,
    time,
    mode,
    priority: lead?.priority || 'Medium',
    currentStatus,
    outcome,
    discussionSummary,
    customerFeedback,
    requirement: '',
    nextFollowupDate,
    assignTo: assignTo || lead?.owner || 'Self',
    reminder: '',
    reminderType: '',
    status: undefined // backend keeps the lifecycle status (Open/Archived)
  };
}

export async function logLeadCommunication(lead, details) {
  return followUpService.create(buildLeadFollowUpPayload(lead, details));
}

/**
 * Hand the composed message to the user's own mail client. This mirrors the
 * existing ERP pattern used by QuotationEmail.shareEmail()/leadActions.sendEmail
 * — the backend has no SMTP configuration, so an outbound mail is always a
 * client hand-off. `window.open` (not `location.href`) keeps the SPA mounted so
 * the user stays on the Leads page.
 */
export function openMailClient({ to, cc, bcc, subject, body }) {
  const params = [];
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  if (cc) params.push(`cc=${encodeURIComponent(cc.trim())}`);
  if (bcc) params.push(`bcc=${encodeURIComponent(bcc.trim())}`);
  const query = params.length ? `?${params.join('&')}` : '';
  window.open(`mailto:${to.trim()}${query}`, '_blank');
}
