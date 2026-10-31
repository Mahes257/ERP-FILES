package com.vishatech.erp.dashboard.dto;

/**
 * Lead counters, by status and stage.
 *
 * @param activeAndInactive leads in a playable status (active or inactive) — the Sales Dashboard's lead total
 * @param active            active leads
 * @param newLeads          leads in the NEW stage
 * @param contacted         leads in the CONTACTED stage
 * @param qualified         leads in the QUALIFIED stage
 * @param proposal          leads in the PROPOSAL stage
 * @param proposalSent      leads in the PROPOSAL_SENT stage
 * @param negotiation       leads in the NEGOTIATION stage
 * @param won               leads in the WON stage
 * @param lost              leads in the LOST stage
 */
public record LeadCounts(long activeAndInactive,
                         long active,
                         long newLeads,
                         long contacted,
                         long qualified,
                         long proposal,
                         long proposalSent,
                         long negotiation,
                         long won,
                         long lost) {
}
