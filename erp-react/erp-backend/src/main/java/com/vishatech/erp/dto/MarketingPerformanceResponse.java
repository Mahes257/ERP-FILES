package com.vishatech.erp.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * Marketing-only performance view. Every figure is calculated from real
 * Marketing records (visits, leads, follow-ups) — there is NO Sales data and
 * NO Sales-handover metric anywhere in this response.
 *
 * <p>All counts respect the optional date range and marketer filter:
 * <ul>
 *   <li>visit metrics use the visit's appointment/schedule date;</li>
 *   <li>follow-up metrics use the follow-up's date;</li>
 *   <li>today/upcoming/pending are relative to the current day (bounded by
 *       the selected range when one is provided).</li>
 * </ul>
 */
public record MarketingPerformanceResponse(
        // ---- Visit performance ----
        long totalVisits,
        long todayVisits,
        long upcomingVisits,
        long pendingVisits,
        long completedVisits,
        long cancelledVisits,
        long rescheduledVisits,
        long directVisits,
        long fixedAppointments,

        // ---- Q Form performance ----
        long qformsNotPrepared,
        long qformsSubmitted,
        int qformCompletionPct,

        // ---- Lead performance ----
        long leadsGenerated,
        long qualifiedLeads,
        long leadsOnFollowup,
        long noLeadVisits,
        long lostLeads,

        // ---- Follow-up performance ----
        long totalFollowups,
        long completedFollowups,
        long pendingFollowups,
        long overdueFollowups,
        long rescheduledFollowups,
        int followupCompletionPct,

        // ---- Visit outcome performance (actual outcomes in the DB, e.g.
        // PO Follow-up / PR Follow-up / Technical Visit / No Lead / ...) ----
        Map<String, Long> outcomes,

        // ---- Marketer performance ----
        List<MarketerRow> marketers,
        BigDecimal estimatedPipelineValue
) {

    public record MarketerRow(
            String marketer,
            long totalVisits,
            long completedVisits,
            long qformsSubmitted,
            long leadsGenerated,
            long followups,
            long overdueFollowups,
            long directVisits,
            long fixedAppointments,
            long qualifiedLeads,
            long pendingFollowups,
            long wonOpportunities,
            long lostOpportunities,
            long noLeadVisits,
            BigDecimal estimatedPipelineValue
    ) {
    }
}
