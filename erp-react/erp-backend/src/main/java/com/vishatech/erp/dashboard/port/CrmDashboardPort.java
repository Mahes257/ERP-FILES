package com.vishatech.erp.dashboard.port;

import com.vishatech.erp.dashboard.dto.ClientCounts;
import com.vishatech.erp.dashboard.dto.FollowUpActivity;
import com.vishatech.erp.dashboard.dto.FollowUpCounts;
import com.vishatech.erp.dashboard.dto.LeadActivity;
import com.vishatech.erp.dashboard.dto.LeadCounts;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * The dashboard's read view of the CRM module.
 *
 * <p><b>Ownership.</b> This interface is dashboard business — it says what the
 * dashboard needs, not what CRM looks like. The implementation lives with the
 * data it reads ({@code com.vishatech.erp.crm.api.CrmDashboardReadAdapter}), so
 * CRM entities and repositories stay inside the CRM module.
 *
 * <p><b>Contract.</b> Every method returns a dashboard-owned value record or a
 * JDK type. No CRM entity, repository, enum or DTO appears in this signature, so
 * the aggregation code cannot accidentally depend on CRM internals.
 *
 * <p><b>Behaviour.</b> Each implementation delegates to exactly the query the
 * dashboard used before this port existed — no new query, no changed filter, no
 * transaction boundary of its own.
 */
public interface CrmDashboardPort {

    /**
     * Customer totals: the raw row count, the count excluding deleted customers,
     * and the count of active customers.
     */
    ClientCounts clientCounts();

    /** Lead counters by status and stage. */
    LeadCounts leadCounts();

    /**
     * Follow-up workload: total, open, completed, rescheduled and overdue.
     * "Overdue" means an open follow-up whose next follow-up date is before the
     * supplied day.
     */
    FollowUpCounts followUpCounts(LocalDate today);

    /**
     * Open follow-up workload split into the dashboard's alert buckets, counted
     * against the supplied day.
     */
    FollowUpActivity followUpActivity(LocalDate today);

    /** The newest leads that are neither archived nor deleted, for the activity feed. */
    List<LeadActivity> recentLeadActivity(int limit);

    /** Active leads untouched since the supplied instant — the dashboard's stale-lead alert. */
    long inactiveActiveLeads(LocalDateTime cutoff);
}
