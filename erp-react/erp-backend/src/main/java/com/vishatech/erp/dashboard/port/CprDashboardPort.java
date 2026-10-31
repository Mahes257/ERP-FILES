package com.vishatech.erp.dashboard.port;

import com.vishatech.erp.dashboard.dto.CprActivity;
import com.vishatech.erp.dashboard.dto.CprCounts;
import com.vishatech.erp.dashboard.dto.CprVerificationCounts;
import java.util.List;
import java.util.Map;

/**
 * The dashboard's read view of the CPR module.
 *
 * <p>See {@link CrmDashboardPort} for the ownership and behaviour rules this
 * interface follows.
 *
 * <p>Two count shapes are published on purpose, because the two dashboard
 * consumers need different things and issuing the wrong one would add queries:
 *
 * <ul>
 *   <li>{@link #cprStats()} is the CPR module's own stats document, which the
 *       Sales Dashboard passes through to its page unchanged;</li>
 *   <li>{@link #cprCounts()} and {@link #technicalVerificationCounts()} are the
 *       typed counters the ERP dashboard maps into its own payload;</li>
 *   <li>{@link #technicalVerificationTotal()} is a single count, used where the
 *       Sales Dashboard needs only the total (calling the full stats method
 *       there would run ten counting queries instead of one).</li>
 * </ul>
 */
public interface CprDashboardPort {

    /** The CPR module's published stats document (unmodified). */
    Map<String, Object> cprStats();

    /** Typed CPR counters: total, pending approval, draft, approved, rejected, converted. */
    CprCounts cprCounts();

    /** Typed technical-verification counters: total, draft, under verification, verified, rejected. */
    CprVerificationCounts technicalVerificationCounts();

    /** Technical-verification row count, without the per-status counts. */
    long technicalVerificationTotal();

    /** The newest CPR records, for the activity feed. */
    List<CprActivity> recentCprActivity(int limit);
}
