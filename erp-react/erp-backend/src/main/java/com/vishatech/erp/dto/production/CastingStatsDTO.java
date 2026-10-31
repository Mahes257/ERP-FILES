package com.vishatech.erp.dto.production;

import lombok.*;

/**
 * DTO for Casting shop floor KPI / statistics.
 * All counts come from MySQL, not hardcoded.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CastingStatsDTO {

    private Long totalJobs;
    private Long pendingJobs;
    private Long inProgressJobs;
    private Long onHoldJobs;
    private Long completedJobs;
    private Long skippedJobs;

    /** Total planned quantity across all casting entries. */
    private Integer totalPlannedQuantity;

    /** Total output quantity across all casting entries. */
    private Integer totalOutputQuantity;

    /** Total rejected quantity across all casting entries. */
    private Integer totalRejectedQuantity;

    /** Total pending quantity across all casting entries. */
    private Integer totalPendingQuantity;

    /** Number of distinct work orders with casting entries. */
    private Long totalWorkOrders;

    /** Casting workflow stages. */
    private String[] stages;

    /** Job count per stage. */
    private java.util.Map<String, Long> jobsPerStage;
}
