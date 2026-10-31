package com.vishatech.erp.dashboard.port;

import com.vishatech.erp.dashboard.dto.ApprovalCounts;
import com.vishatech.erp.dashboard.dto.DispatchCounts;
import com.vishatech.erp.dashboard.dto.PackingCounts;
import com.vishatech.erp.dashboard.dto.ProductionOrderCounts;
import com.vishatech.erp.dashboard.dto.QualityCounts;
import com.vishatech.erp.dashboard.dto.ShopFloorCounts;
import java.util.Map;

/**
 * The dashboard's read view of the production module.
 *
 * <p>See {@link CrmDashboardPort} for the ownership and behaviour rules this
 * interface follows. Two notes specific to production:
 *
 * <ul>
 *   <li>{@link #shopFloorCounts(String)} takes the dashboard's own type key
 *       ({@code "casting"}, {@code "fabrication"}, {@code "assembly"}) and maps
 *       it to the production type inside the implementation, so the SQL filter
 *       (the production type's display name) is applied exactly as before.</li>
 *   <li>{@link #trackerStats()} is the tracker service's own stats document,
 *       passed through for the Sales Dashboard's production stage.</li>
 *   <li>{@link #qualityTotal()} and {@link #packingTotal()} are single counts,
 *       used where the Sales Dashboard needs only a total (calling the full
 *       stats methods there would run seven and five counting queries instead
 *       of one, and the Sales Dashboard has always issued exactly one).</li>
 * </ul>
 */
public interface ProductionDashboardPort {

    /** Production-order counters plus the average progress percentage. */
    ProductionOrderCounts orderCounts();

    /** Quality-inspection counters by status. */
    QualityCounts qualityCounts();

    /** Quality-inspection row count, without the per-status counts. */
    long qualityTotal();

    /** Technical-verification counters for production orders. */
    ApprovalCounts verificationCounts();

    /** Drawing counters. */
    ApprovalCounts drawingCounts();

    /** Model counters. */
    ApprovalCounts modelCounts();

    /** Shop-floor job counters for one production type ("casting", "fabrication", "assembly"). */
    ShopFloorCounts shopFloorCounts(String typeKey);

    /** Packing counters by status. */
    PackingCounts packingCounts();

    /** Packing-list row count, without the per-status counts. */
    long packingTotal();

    /** Dispatch counters by status. */
    DispatchCounts dispatchCounts();

    /** The production tracker's published stats document (unmodified). */
    Map<String, Object> trackerStats();
}
