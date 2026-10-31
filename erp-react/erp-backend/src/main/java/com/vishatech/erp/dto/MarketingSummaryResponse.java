package com.vishatech.erp.dto;

/** Counts behind the Offline Marketing summary cards (each card maps to a view filter). */
public record MarketingSummaryResponse(
        long todayVisits,
        long upcomingVisits,
        long pendingVisits,
        long completedVisits,
        long overdueFollowups,
        long todayFollowups,
        long leadsGenerated,
        long qualifiedLeads,
        long noLeadVisits,
        long salesHandoverPending
) {
}
